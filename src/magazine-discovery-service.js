'use strict';
/*
 * YASNAFIT — Magazine discovery & editorial pipeline service (T-17 / Task 27).
 *
 * Editorial contract (owner rule): the AI/backend DISCOVERS and PREPARES
 * drafts only. The coach is the final editorial authority: nothing created
 * here can ever be published — drafts start at status DRAFT and only the
 * coach's explicit publish action (article-service transition) makes content
 * public. This service never calls publishArticle.
 *
 * Flow per run:
 *   active sources -> fetch feeds -> dedupe (url_hash / fingerprint / title
 *   similarity) -> quality checks -> AI editorial draft (when the configured
 *   AI provider is available; otherwise a clearly-flagged minimal draft from
 *   source metadata) -> articleService.createArticle(status=DRAFT,
 *   content_origin='generated') -> coach in-app notification when actionable
 *   review items exist.
 */

const crypto = require('crypto');
const { chatCompletion, getSettings } = require('./ai-service');
const articleService = require('./article-service');

const DISCOVERY_FETCH_MS = 15000;
const TITLE_SIMILARITY_THRESHOLD = 0.86;

// ---------- freshness + source-quality gates (owner spec) ----------
// "New content" must actually be new: general media within 30 days, scientific
// / established sources within 90 days. Older items are only accepted when the
// AI explicitly marks them as an evergreen reference — and nothing older than
// the hard cap may ever appear as "new" (a 2017/2020 article never does).
const FRESH_NEWS_DAYS = 30;
const FRESH_SCIENCE_DAYS = 90;
const EVERGREEN_HARD_CAP_DAYS = 365;

// Celebrity/lifestyle/SEO hosts are filtered out entirely (owner spec: never a
// primary source). Kept conservative — general media is NOT banned, it is just
// ranked lower (source_tier) and freshness-filtered harder.
const LOW_QUALITY_HOSTS = /(^|\.)(people\.com|tmz\.com|eonline\.com|pagesix\.com|hellomagazine\.com|dailystar\.co\.uk|the-sun\.com|sun\.co\.uk)$/i;

// OG images from Google's own domains are generic Google assets — using them is
// exactly how unrelated articles ended up sharing one identical image.
const OG_BLOCK_HOSTS = /(^|\.)(google\.com|google\.com\.[a-z]{2,3}|googleusercontent\.com|gstatic\.com)$/i;

function hostOf(raw) {
  try { return new URL(String(raw || '')).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

function ageDaysOf(iso) {
  if (!iso) return null;
  const t = new Date(String(iso)).getTime();
  if (Number.isNaN(t)) return null;
  const days = (Date.now() - t) / 86400000;
  return days < 0 ? 0 : days;
}

// accept: 'fresh' → accept; 'evergreen' → only if the AI explicitly marks it an
// important reference; false → reject (never presented as new).
function freshnessGate({ ageDays, scientific }) {
  if (ageDays == null) return { accept: false, reason: 'no-date' };
  if (ageDays > EVERGREEN_HARD_CAP_DAYS) return { accept: false, reason: 'too-old' };
  const limit = scientific ? FRESH_SCIENCE_DAYS : FRESH_NEWS_DAYS;
  if (ageDays <= limit) return { accept: 'fresh' };
  return { accept: 'evergreen', reason: 'age' };
}

// Extract the embedded publisher URL from a news.google.com/rss/articles/<id>
// redirect: the id is base64 of a protobuf that carries the original URL.
function extractUrlFromGoogleNewsId(id) {
  try {
    let b64 = String(id || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const text = Buffer.from(b64, 'base64').toString('utf8');
    const urls = [...text.matchAll(/https?:\/\/[^\x00-\x1f"'\s<>]+/g)].map(m => m[0]);
    if (!urls.length) return '';
    return urls.sort((a, b) => b.length - a.length)[0];
  } catch (e) {
    return '';
  }
}

// Resolve the ORIGINAL publisher URL behind a Google News RSS redirect.
// Non-Google URLs pass through unchanged.
function resolveGoogleNewsUrl(link, descriptionHtml) {
  try {
    const u = new URL(String(link || ''));
    if (!/google\.com$/i.test(u.hostname.replace(/^www\./, ''))) return String(link || '');
    const id = u.pathname.split('/').filter(Boolean).pop() || '';
    const fromId = id ? extractUrlFromGoogleNewsId(id) : '';
    if (fromId && !/google\.com$/i.test(hostOf(fromId))) return fromId;
    const anchor = String(descriptionHtml || '').match(/<a[^>]+href\s*=\s*["']([^"']+)["']/i);
    if (anchor && anchor[1] && !/google\.com$/i.test(hostOf(anchor[1]))) return anchor[1];
    return String(link || '');
  } catch (e) {
    return String(link || '');
  }
}

// "ScienceDaily"-style name from a bare domain (last-resort publisher name).
function domainToName(host) {
  const h = String(host || '').replace(/^www\./i, '').toLowerCase();
  if (!h) return '';
  const parts = h.split('.');
  let base = parts[0] || h;
  if (parts.length >= 3 && ['co', 'com', 'org', 'ac', 'gov', 'edu', 'net'].includes(parts[parts.length - 2])) base = parts[parts.length - 2] + '.' + parts[parts.length - 1];
  const clean = base.split('.')[0].replace(/[-_]+/g, ' ').trim();
  if (!clean) return '';
  return clean.replace(/\b\p{L}/gu, c => c.toUpperCase());
}

// Coach-facing source name: the ORIGINAL publisher, never "Google News".
// 1) the feed item's own <source> outlet, 2) the publisher domain of the
// resolved article URL, 3) the feed's topic name as a last resort.
function publisherOf(item, source) {
  const outlet = String((item && item.outlet) || '').trim();
  if (outlet && !/google\s*news/i.test(outlet)) {
    const clean = outlet.replace(/\s*[-–—]\s*Google\s+News.*$/i, '').trim();
    if (clean) return clean.slice(0, 120);
  }
  const byDomain = domainToName(hostOf(item && item.url));
  if (byDomain && !/google/i.test(byDomain)) return byDomain;
  const feedName = String((source && source.name) || '').replace(/^روز دنیا:\s*/u, '').trim();
  return (feedName || 'منبع خبر').slice(0, 120);
}

// ---------- small helpers ----------

function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!/^https?:$/i.test(u.protocol)) return '';
    u.hash = '';
    // Strip tracking params that commonly differentiate mirrors of one story.
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref']) u.searchParams.delete(key);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return `${u.protocol}//${u.host.replace(/^www\./, '')}${u.pathname}${u.searchParams.size ? `?${[...u.searchParams.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, v]) => `${k}=${v}`).join('&')}` : ''}`;
  } catch (e) {
    return '';
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

// Title fingerprint: casefold-ish (lowercase, strip punctuation/whitespace) so
// "YasnaFit News | X" and "X" from two outlets still match.
function normalizeTitle(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\u200c\u200b]/g, '')
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .slice(0, 200);
}

function fingerprintFor({ title, sourceName }) {
  return sha1(normalizeTitle(title) + '|' + String(sourceName || '').toLowerCase().slice(0, 80));
}

// Cheap similarity (Dice coefficient on bigrams) — good enough to catch the
// same story re-reported by another outlet without a heavyweight dep.
function titleSimilarity(a, b) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = t => {
    const out = new Set();
    for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const g of gx) if (gy.has(g)) inter += 1;
  return (2 * inter) / (gx.size + gy.size);
}

// Minimal, tolerant RSS 2.0 / Atom item parser (no external dependency).
// Returns [{title, url, publishedAt, summary, imageUrl, author}]
function parseFeed(xml) {
  const text = String(xml || '');
  const items = [];
  const entries = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(text)) !== null) entries.push(m[1]);
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(text)) !== null) entries.push(m[1]);
  if (!entries.length) {
    // Some feeds use <rss>…<channel> with <item> only; if nothing found, bail.
    return items;
  }
  const pick = (block, ...names) => {
    for (const name of names) {
      const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
      const found = block.match(re);
      if (found && found[1].trim()) return decodeEntities(found[1].trim());
    }
    return '';
  };
  const pickAttr = (block, tag, attr) => {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?`, 'i');
    const found = block.match(re);
    if (!found) return '';
    const a = found[0].match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i'));
    return a ? a[1] : '';
  };
  for (const block of entries) {
    let title = pick(block, 'title');
    // <title>type</type>html</title> CDATA-style: take the last segment.
    const htmlSeg = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (htmlSeg && htmlSeg[1].includes('</type>')) {
      const parts = htmlSeg[1].split('</type>');
      title = (parts[parts.length - 1] || title).trim();
    }
    let url = pickAttr(block, 'link', 'href') || pick(block, 'link');
    if (!url) {
      const linkHref = block.match(/<link[^>]+href\s*=\s*["']([^"']+)["']/i);
      url = linkHref ? linkHref[1] : '';
    }
    if (url && !/^(https?:|mailto:)/i.test(url)) url = '';
    const publishedAt = pick(block, 'pubDate', 'published', 'updated', 'dc:date') || null;
    const rawSummary = pick(block, 'description', 'summary', 'content', 'content:encoded');
    // Google News feeds: the item <link> is a redirect; resolve the original
    // publisher URL (encoded id first, then the description anchor).
    const realUrl = resolveGoogleNewsUrl(url, rawSummary);
    const summary = rawSummary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    let imageUrl = pickAttr(block, 'enclosure', 'url') || pickAttr(block, 'media:content', 'url') || pickAttr(block, 'media:thumbnail', 'url');
    if (!imageUrl) {
      const img = rawSummary.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
      imageUrl = img ? img[1] : '';
    }
    if (imageUrl && !/^https?:/i.test(imageUrl)) imageUrl = '';
    const author = pick(block, 'author', 'dc:creator', 'name') || '';
    const outlet = pick(block, 'source') || '';
    const finalUrl = realUrl || url;
    if (!title || !finalUrl) continue;
    items.push({ title: title.slice(0, 300), url: finalUrl, publishedAt, summary, imageUrl, author: outlet || author, outlet });
  }
  return items;
}

function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDate(raw) {
  if (!raw) return null;
  const t = new Date(String(raw).trim());
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

// ---------- source management (magazine_sources) ----------

function listSources(db, { includeDeleted = false } = {}) {
  const sql = `
    SELECT s.*, c.name_fa AS category_name
    FROM magazine_sources s
    LEFT JOIN magazine_categories c ON c.slug = s.category_slug AND c.deleted_at IS NULL
    WHERE ${includeDeleted ? '1=1' : 's.deleted_at IS NULL'}
    ORDER BY s.id
  `;
  return db.prepare(sql).all().map(row => ({
    id: row.id,
    name: row.name,
    source_tier: Number(row.source_tier) || 3,
    feed_url: row.feed_url,
    source_type: row.source_type,
    category_slug: row.category_slug || null,
    category_name: row.category_name || null,
    is_active: Boolean(row.is_active),
    fetch_interval_h: Number(row.fetch_interval_h) || 12,
    last_fetched_at: row.last_fetched_at || null,
    last_success_at: row.last_success_at || null,
    last_error: row.last_error || null,
    created_at: row.created_at
  }));
}

function validateSourceInput(db, input) {
  const errors = [];
  const name = String(input.name ?? '').trim().slice(0, 120);
  if (!name) errors.push('نام منبع الزامی است');
  let feedUrl = String(input.feed_url ?? '').trim().slice(0, 500);
  try {
    const u = new URL(feedUrl);
    if (!/^https?:$/i.test(u.protocol)) throw new Error('protocol');
  } catch (e) {
    errors.push('آدرس منبع معتبر نیست (فقط http/https)');
    feedUrl = '';
  }
  const sourceType = ['rss', 'atom', 'api'].includes(input.source_type) ? input.source_type : 'rss';
  let categorySlug = null;
  if (input.category_slug) {
    const cat = db.prepare('SELECT id FROM magazine_categories WHERE slug=? AND deleted_at IS NULL').get(String(input.category_slug).slice(0, 100));
    if (!cat) errors.push('دسته‌بندی نامعتبر است');
    else categorySlug = cat ? String(input.category_slug).slice(0, 100) : null;
  }
  const intervalH = [6, 12, 24].includes(Number(input.fetch_interval_h)) ? Number(input.fetch_interval_h) : 12;
  return { errors, name, feedUrl, sourceType, categorySlug, intervalH, isActive: input.is_active !== undefined ? (input.is_active ? 1 : 0) : undefined };
}

function createSource(db, input) {
  const v = validateSourceInput(db, input);
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  const dup = db.prepare('SELECT id FROM magazine_sources WHERE feed_url=? AND deleted_at IS NULL').get(v.feedUrl);
  if (dup) { const error = new Error('این منبع قبلاً ثبت شده است'); error.statusCode = 409; throw error; }
  const stableId = crypto.randomUUID();
  const info = db.prepare(`
    INSERT INTO magazine_sources (stable_id, name, feed_url, source_type, category_slug, is_active, fetch_interval_h)
    VALUES (?,?,?,?,?,?,?)
  `).run(stableId, v.name, v.feedUrl, v.sourceType, v.categorySlug, v.isActive === undefined ? 1 : v.isActive, v.intervalH);
  return sourceView(db, Number(info.lastInsertRowid));
}

function sourceView(db, id) {
  const row = db.prepare(`
    SELECT s.*, c.name_fa AS category_name FROM magazine_sources s
    LEFT JOIN magazine_categories c ON c.slug = s.category_slug AND c.deleted_at IS NULL
    WHERE s.id=? AND s.deleted_at IS NULL
  `).get(id);
  if (!row) return null;
  return {
    id: row.id, name: row.name, source_tier: Number(row.source_tier) || 3, feed_url: row.feed_url, source_type: row.source_type,
    category_slug: row.category_slug || null, category_name: row.category_name || null,
    is_active: Boolean(row.is_active), fetch_interval_h: Number(row.fetch_interval_h) || 12,
    last_fetched_at: row.last_fetched_at || null, last_success_at: row.last_success_at || null,
    last_error: row.last_error || null, created_at: row.created_at
  };
}

function updateSource(db, id, input) {
  const existing = sourceView(db, id);
  if (!existing) { const error = new Error('منبع پیدا نشد'); error.statusCode = 404; throw error; }
  const v = validateSourceInput(db, { ...existing, ...input });
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  db.prepare(`
    UPDATE magazine_sources SET name=?, feed_url=?, source_type=?, category_slug=?, fetch_interval_h=?,
      is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL
  `).run(v.name, v.feedUrl, v.sourceType, v.categorySlug, v.intervalH, v.isActive === undefined ? existing.is_active ? 1 : 0 : v.isActive, id);
  return sourceView(db, id);
}

function deleteSource(db, id) {
  const info = db.prepare('UPDATE magazine_sources SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').run(id);
  return info.changes > 0;
}

// ---------- discovery + duplicate detection ----------

function setSourceFetchResult(db, id, { ok, error }) {
  const now = new Date().toISOString();
  if (ok) db.prepare('UPDATE magazine_sources SET last_fetched_at=?, last_success_at=?, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(now, now, id);
  else db.prepare('UPDATE magazine_sources SET last_fetched_at=?, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(now, String(error || '').slice(0, 500), id);
}

async function fetchSourceItems(db, source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_FETCH_MS);
  try {
    const response = await fetch(source.feed_url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'YasnaFit-Magazine/1.0 (editorial preview; +https://yasnafit.ir)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const items = parseFeed(text).slice(0, 50);
    return items.map(item => ({ ...item, source }));
  } finally {
    clearTimeout(timer);
  }
}

function findDuplicate(db, { url, title, sourceName }) {
  const urlHash = sha1(normalizeUrl(url));
  const fingerprint = fingerprintFor({ title, sourceName });
  if (urlHash) {
    const byUrl = db.prepare(`SELECT id, status, article_id FROM magazine_discoveries WHERE url_hash=? LIMIT 1`).get(urlHash);
    if (byUrl) return { kind: 'url', record: byUrl };
    const articleByUrl = db.prepare('SELECT id, slug FROM magazine_articles WHERE deleted_at IS NULL AND source_url IS NOT NULL').all();
    for (const article of articleByUrl) {
      if (sha1(normalizeUrl(article.source_url)) === urlHash) return { kind: 'published-url', record: article };
    }
  }
  const byFingerprint = db.prepare(`SELECT id, status, article_id FROM magazine_discoveries WHERE fingerprint=? LIMIT 1`).get(fingerprint);
  if (byFingerprint) return { kind: 'fingerprint', record: byFingerprint };
  const recent = db.prepare(`SELECT id, title_original, fingerprint FROM magazine_discoveries WHERE status IN ('DRAFTED','DUPLICATE') ORDER BY id DESC LIMIT 200`).all();
  for (const row of recent) {
    if (titleSimilarity(row.title_original, title) >= TITLE_SIMILARITY_THRESHOLD) return { kind: 'similar-title', record: row };
  }
  return null;
}

// ---------- quality checks (section 18) ----------

function qualityChecks({ item, categorySlug }) {
  const flags = [];
  const normalized = normalizeUrl(item.url);
  if (!normalized) flags.push('آدرس خبر اصلی معتبر نیست');
  if (!item.title || !item.title.trim()) flags.push('عنوان خبر موجود نیست');
  if (!categorySlug) flags.push('دسته‌بندی تشخیص داده نشد — در زمان بررسی انتخاب کنید');
  if (!item.publishedAt) flags.push('تاریخ انتشار منبع در دسترس نبود');
  if (!item.summary && !item.imageUrl) flags.push('خلاصهٔ اولیه از منبع در دسترس نبود');
  return flags;
}

// ---------- AI editorial draft (section 5) ----------
// Strict contract: the model may only re-express the provided source content;
// it must never invent facts/studies/statistics/quotes/people/sources. Output
// must be strict JSON.

const EDITORIAL_SYSTEM_PROMPT = [
  'شما ویراستار خبری-علمی مجلهٔ YASNAFIT هستید (خوانندگان اصلی: زنان ورزشکار و مربی‌زنان). شما فقط با محتوایی که در پیام کاربر داده می‌شود کار می‌کنید.',
  'قوانین سخت‌گیرانه:',
  '1) هیچ حقیقت، مطالعه، آمار، نقل‌قول، شخص، رویداد یا منبع جدیدی اختراع نکنید. فقط بازنویسی/خلاصه‌سازی محتوای منبع.',
  '2) اطلاعات مبهم یا ناقص را به‌صورت محتاطانه بیان کنید (مثلاً «طبق گزارش منبع»).',
  '3) title و summary حتماً فارسی و روان باشند؛ اگر منبع انگلیسی یا به زبان دیگری است، ترجمهٔ حرفه‌ای و غیرتحت‌اللفظی بنویسید. هرگز title یا summary انگلیسی در خروجی مجاز نیست.',
  '4) key_points: بین ۳ تا ۶ نکتهٔ کلیدی، کوتاه، دقیق و فارسی، مستقیماً از خود مطلب.',
  '5) why_it_matters: یک یا دو جملهٔ روان فارسی دربارهٔ اینکه این مطلب برای مخاطبان YASNAFIT (به‌ویژه زنان ورزشکار) چرا مهم یا مفید است.',
  '6) category فقط یکی از اینها: bodybuilding / sports-science / nutrition / health / sports-news.',
  '7) relevance: امتیاز 0 تا 10 برای مرتبط بودن مطلب با محوریت YASNAFIT: تمرین مقاومتی و بدنسازی زنان، رشد عضلانی، فیزیولوژی ورزش، تغذیهٔ ورزشی، پروتئین، کراتین و مکمل‌های دارای شواهد، ریکاوری و خواب، سلامت ورزشکاران زن، انرژی در دسترس و RED-S، سلامت استخوان، پیشگیری از آسیب، عملکرد ورزشی و اخبار مهم بدنسازی. مطلب بی‌ربط، کلیک‌بیت یا کم‌اعتبار: useful=false یا relevance کمتر از ۴.',
  '8) evergreen_reference: فقط true اگر مطلب از نظر تازگی قدیمی است ولی یک مرجع مهم و پایدار محسوب می‌شود (مثلاً position stand رسمی یا مرور سیستماتیک بنیادین). برای مطالب عادی همیشه false.',
  '9) content_html فقط برچسب‌های p, h2, ul, li, strong, em, a باشد؛ فارسی با ادبیات خبری-علمی؛ بدون زبان فنی هوش مصنوعی و بدون ذکر «تولیدشده با هوش مصنوعی».',
  '10) شواهد: به مرورهای سیستماتیک، متاآنالیزها، کارآزمایی‌های تصادفی‌سازی‌شده و بیانیه‌های اجماعی وزن بیشتری بدهید. هرگز یک مطالعهٔ تکی را به‌عنوان «حقیقت اثبات‌شده» ارائه نکنید (بنویسید «این مطالعه نشان داد…»).',
  '11) اعتبار منابع: سطح ۱: PubMed/NCBI، ACSM، NSCA، British Journal of Sports Medicine، Sports Medicine، JSCR، ISSN و مجلات همتای علمی ورزشی/تغذیه‌ای؛ سطح ۲: نشریات معتبر پزشکی، تغذیه و علوم ورزشی و فدراسیون‌های بزرگ؛ سطح ۳: رسانه‌های عمومی. محتوای سلبریتی/لایف‌استایل فقط در صورت داشتن ارزش علمی یا کاربردی واقعی پذیرفته می‌شود، وگرنه useful=false.',
  '12) هر پیشنهاد باید نام منبع اصلی و تاریخ انتشار آن را در references حفظ کند (قانون ثابت: منبع اصلی + تاریخ). خروجی فقط JSON معتبر با همین کلیدها: title, summary, content_html, key_points[], references[{name,url}], related_keywords[], sensitive_flags[], confidence(0-1), relevance(0-10), evergreen_reference(true/false), category, why_it_matters, useful.'
].join('\n');

function editorialUserPrompt(item, sourceName, { ageDays, needsEvergreen, limitDays } = {}) {
  const lines = [
    'محتوای خبر/مقالهٔ منبع زیر را برای مجلهٔ YASNAFIT آماده کنید:',
    `منبع اصلی: ${sourceName || 'نامشخص'}`,
    `آدرس اصلی: ${item.url}`,
    `عنوان اصلی: ${item.title}`,
    `تاریخ انتشار: ${item.publishedAt || 'نامشخص'}`,
    `نویسنده/سازمان: ${item.author || 'نامشخص'}`,
    `خلاصهٔ منبع: ${item.summary || 'در دسترس نیست'}`
  ];
  if (ageDays != null) lines.push(`سابقهٔ مطلب: این مطلب حدود ${Math.round(ageDays)} روز پیش منتشر شده است.`);
  if (needsEvergreen) lines.push(`توجه: این مطلب از ${limitDays} روز پیش‌تر است. فقط در صورتی که واقعاً یک مرجع مهم و پایدار (evergreen reference) باشد evergreen_reference را true بگذارید؛ در غیر این صورت false.`);
  return lines.join('\n') + '\n';
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { return null; }
}

function htmlEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Validate the AI output against the editorial contract. Returns null when the
// draft is NOT coach-ready (e.g. the AI failed to translate to Persian) — the
// candidate then never appears in the review inbox.
function draftFromAi(parsed, item, sourceName) {
  if (!parsed || typeof parsed !== 'object') return null;
  const title = String(parsed.title || '').trim().slice(0, 200);
  const summary = String(parsed.summary || '').trim().slice(0, 500);
  const arabicScript = /\p{Script=Arabic}/u;
  // Persian-only inbox: a Latin-script title or summary means the translation
  // step did not happen — treat it as an invalid draft, not a fallback.
  if (!title || !arabicScript.test(title) || !arabicScript.test(summary)) return null;
  // Keep only whitelisted tags/attributes; strip any AI meta-language defensively.
  let content = String(parsed.content_html || '').trim();
  if (content.length < 200) return null;
  content = articleService.sanitizeRichText(content.slice(0, 100000));
  const keyPoints = (Array.isArray(parsed.key_points) ? parsed.key_points : (Array.isArray(parsed.claims) ? parsed.claims : []))
    .slice(0, 6).map(String).map(s => s.trim().slice(0, 300)).filter(Boolean);
  if (keyPoints.length < 3) return null; // the card needs real key points
  const references = Array.isArray(parsed.references)
    ? parsed.references.slice(0, 10).map(r => ({ name: String(r?.name ?? r?.source_name ?? '').slice(0, 200), url: String(r?.url ?? r?.source_url ?? '').slice(0, 500) }))
        .filter(r => r.name || r.url)
    : [];
  const keywords = Array.isArray(parsed.related_keywords) ? parsed.related_keywords.slice(0, 8).map(String).map(s => s.slice(0, 80)) : [];
  const sensitive = Array.isArray(parsed.sensitive_flags) ? parsed.sensitive_flags.slice(0, 10).map(String).map(s => s.slice(0, 300)) : [];
  const confidence = Number(parsed.confidence);
  const relevanceRaw = Number(parsed.relevance);
  const relevance = Number.isFinite(relevanceRaw) ? Math.min(10, Math.max(0, relevanceRaw)) : null;
  const evergreen = parsed.evergreen_reference === true;
  const knownCats = ['bodybuilding', 'sports-science', 'nutrition', 'health', 'sports-news'];
  const category = knownCats.includes(parsed.category) ? parsed.category : null;
  const whyItMatters = String(parsed.why_it_matters || '').trim().slice(0, 400);
  const useful = parsed.useful === undefined ? true : Boolean(parsed.useful);
  const bodyParts = [content];
  if (item.url) bodyParts.push(`<p><a href="${htmlEscape(item.url)}" rel="noopener noreferrer">منبع اصلی: ${htmlEscape(sourceName || 'خبر')}</a></p>`);
  return {
    title,
    summary,
    content: bodyParts.join('\n'),
    references,
    key_points: keyPoints,
    keywords,
    sensitive,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
    relevance,
    evergreen_reference: evergreen,
    category,
    why_it_matters: whyItMatters,
    useful
  };
}

// ---------- image retrieval (og:image from the original article page) ----------
// Only reads the article's own page metadata (like a browser preview would).
// No random image services, no downloads from search engines.
async function fetchOgImage(pageUrl) {
  try {
    // Never scrape Google's own redirect pages: their og:image is a generic
    // Google asset (how unrelated articles shared one identical image).
    if (OG_BLOCK_HOSTS.test(hostOf(pageUrl))) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(pageUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!response.ok) return '';
      const html = (await response.text()).slice(0, 2000000);
      const tags = [...html.matchAll(/<meta[^>]+>/gi)].map(m => m[0]);
      for (const tag of tags) {
        const key = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
        if (!/^(og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src)$/i.test(key)) continue;
        const val = (tag.match(/content\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
        if (!val) continue;
        try {
          const u = new URL(val, pageUrl);
          if (u.protocol === 'http:') u.protocol = 'https:'; // prefer https so https sites never hit mixed-content
          if (!/^https:$/i.test(u.protocol)) return '';
          if (OG_BLOCK_HOSTS.test(u.hostname.replace(/^www\./, ''))) return '';
          return u.toString();
        } catch (e) { return ''; }
      }
      return '';
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return '';
  }
}

// ---------- run the pipeline ----------

async function processDiscovery(db, discovery, { aiEnabled = true, usedImages = new Set() } = {}) {
  const d = db.prepare('SELECT * FROM magazine_discoveries WHERE id=?').get(discovery.id);
  const source = d.source_id ? sourceView(db, d.source_id) : null;
  db.prepare("UPDATE magazine_discoveries SET status='PROCESSING' WHERE id=?").run(d.id);
  const item = {
    url: d.url,
    title: d.title_original,
    publishedAt: d.date_published,
    summary: d.summary_original,
    imageUrl: d.image_url,
    outlet: ''
  };
  const publisher = String(d.publisher || '') || publisherOf(item, source);
  const tier = Number((source && source.source_tier) || 3);
  const scientific = tier <= 2;
  const ageDays = ageDaysOf(d.date_published);
  const gate = freshnessGate({ ageDays, scientific });
  const flags = qualityChecks({ item, categorySlug: d.category_slug });
  const fail = (meta, flag) => {
    const f = flag ? flags.concat([flag]) : flags;
    db.prepare("UPDATE magazine_discoveries SET status='FAILED', quality_flags=?, ai_meta=?, processed_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(JSON.stringify(f), JSON.stringify(meta), d.id);
    return f;
  };
  // Hard freshness re-check (defense in depth; pass 1 already filters).
  if (gate.accept === false) {
    fail({ filtered: gate.reason, age_days: ageDays == null ? null : Math.round(ageDays) }, 'مطلب قدیمی است و به‌عنوان مطلب جدید پذیرفته نمی‌شود');
    return { skipped: true, reason: 'freshness' };
  }
  let draft = null;
  let aiFailed = null;
  if (aiEnabled) {
    try {
      const aiSettings = getSettings(db);
      if (aiSettings.has_api_key) {
        const reply = await chatCompletion(db, {
          messages: [
            { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
            { role: 'user', content: editorialUserPrompt(item, publisher, { ageDays, needsEvergreen: gate.accept === 'evergreen', limitDays: scientific ? FRESH_SCIENCE_DAYS : FRESH_NEWS_DAYS }) }
          ],
          tools: false,
          temperature: 0.4,
          max_tokens: 2200,
          timeout_ms: 90000
        });
        const parsed = extractJson(reply && (reply.content || reply.text || (typeof reply === 'string' ? reply : '')));
        draft = draftFromAi(parsed, item, publisher);
        if (!draft) aiFailed = 'خروجی هوش مصنوعی معتبر نبود (ترجمه/خلاصهٔ فارسی کافی نبود)';
      } else {
        aiFailed = 'هوش مصنوعی پیکربندی نشده است';
      }
    } catch (e) {
      aiFailed = e.message || 'خطا در پردازش هوش مصنوعی';
    }
  } else {
    aiFailed = 'پردازش هوش مصنوعی غیرفعال است';
  }
  if (!draft) {
    // Owner rule: every candidate must be AI-translated & summarized BEFORE it
    // reaches the review inbox. No AI draft → the candidate is NOT shown.
    fail({ ai_failed: aiFailed, age_days: ageDays == null ? null : Math.round(ageDays) }, 'محتوا هنوز آماده‌سازی ویرایشی (ترجمه/خلاصه) نشده است');
    return { notPrepared: true, aiFailed };
  }
  if (draft.useful === false) {
    fail({ skipped: 'not useful', relevance: draft.relevance }, 'محتوا برای مخاطب YASNAFIT مناسب نیست');
    return { skipped: true, reason: 'useless' };
  }
  if (draft.relevance != null && draft.relevance < 4) {
    fail({ skipped: 'low relevance', relevance: draft.relevance }, 'ارتباط مطلب با محوریت YASNAFIT کم است');
    return { skipped: true, reason: 'relevance' };
  }
  if (gate.accept === 'evergreen' && !draft.evergreen_reference) {
    fail({ skipped: 'old not evergreen', age_days: Math.round(ageDays) }, 'مطلب قدیمی است و مرجع مهم (evergreen) شناخته نشد');
    return { skipped: true, reason: 'freshness' };
  }
  // Image: the feed's own image first, then the article's og:image — fetched
  // from the ORIGINAL publisher page (never a Google page, never a random image
  // service). One image per run: if another candidate already owns this exact
  // image, this article keeps no cover instead of sharing a duplicate.
  let cover = item.imageUrl || '';
  if (cover) {
    // Keep every stored cover https so it survives the page CSP (img-src https:)
    try { const cu = new URL(cover); if (cu.protocol === 'http:') { cu.protocol = 'https:'; cover = cu.toString(); } } catch (e) { cover = ''; }
  }
  if (!cover) cover = await fetchOgImage(item.url);
  if (cover && usedImages.has(cover)) cover = '';
  try {
    const article = articleService.createArticle(db, {
      title: draft.title,
      summary: draft.summary,
      content: draft.content,
      category: draft.category || d.category_slug || undefined,
      cover_image: cover || null,
      content_origin: 'generated',
      source_name: publisher || null,
      source_url: item.url,
      sources: draft.references.length ? draft.references : (item.url ? [{ name: publisher || 'منبع خبر', url: item.url }] : [])
    }, 'discovery-engine');
    if (cover) usedImages.add(cover);
    // Persist editorial metadata for the review screen.
    const meta = {
      claims: draft.key_points,
      key_points: draft.key_points,
      keywords: draft.keywords,
      sensitive: draft.sensitive,
      confidence: draft.confidence,
      relevance: draft.relevance,
      why_it_matters: draft.why_it_matters || '',
      ai_assisted: true,
      age_days: ageDays == null ? null : Math.round(ageDays),
      freshness: gate.accept === 'evergreen' ? 'evergreen' : 'fresh'
    };
    db.prepare('UPDATE magazine_articles SET quality_flags=? WHERE id=?').run(JSON.stringify(flags), article.id);
    db.prepare('UPDATE magazine_discoveries SET status=\'DRAFTED\', article_id=?, quality_flags=?, ai_meta=?, processed_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(article.id, JSON.stringify(flags), JSON.stringify(meta), d.id);
    return { article, flags, aiFailed };
  } catch (e) {
    db.prepare("UPDATE magazine_discoveries SET status='FAILED', processed_at=CURRENT_TIMESTAMP WHERE id=?").run(d.id);
    db.prepare('UPDATE magazine_discoveries SET ai_meta=? WHERE id=?').run(JSON.stringify({ error: String(e.message || e).slice(0, 300) }), d.id);
    throw e;
  }
}

// How many NEW items one discovery run turns into drafts. The coach UI shows
// a next-batch button to continue (each run: up to this many new items).
const DISCOVERY_BATCH_SIZE = 20;

// ---------- live progress (shown in the coach UI; plain status, no internals) ----------
const progressState = {
  running: false, phase: 'idle', current_source: '',
  sources_total: 0, sources_done: 0,
  items_total: 0, items_done: 0, items_found: 0,
  images_total: 0, images_done: 0,
  drafted: 0, duplicates: 0, failed: 0, skipped: 0,
  filtered: 0, rejected: 0, not_prepared: 0,
  error_sources: [], started_at: null, finished_at: null, last_result: null
};
function getDiscoveryProgress() {
  return { ...progressState, error_sources: [...progressState.error_sources] };
}
function syncProgressFromSummary(summary) {
  progressState.drafted = summary.drafted;
  progressState.duplicates = summary.duplicates;
  progressState.failed = summary.failed;
  progressState.skipped = summary.skipped;
  progressState.filtered = summary.filtered;
  progressState.rejected = summary.rejected;
  progressState.not_prepared = summary.not_prepared;
  progressState.items_found = summary.fetched;
}

async function runDiscovery(db, { notifyAudience = 'coach' } = {}) {
  Object.assign(progressState, {
    running: true, phase: 'sources', current_source: '',
    sources_total: 0, sources_done: 0, items_total: 0, items_done: 0, items_found: 0,
    images_total: 0, images_done: 0, drafted: 0, duplicates: 0, failed: 0, skipped: 0,
    filtered: 0, rejected: 0, not_prepared: 0,
    error_sources: [], started_at: Date.now(), finished_at: null, last_result: null
  });
  const summary = { fetched: 0, newItems: 0, duplicates: 0, drafted: 0, failed: 0, skipped: 0, filtered: 0, rejected: 0, not_prepared: 0, filtered_breakdown: {}, sources: 0, errors: [], stopped_at_cap: false };
  try {
  const sources = listSources(db).filter(s => s.is_active);
  summary.sources = sources.length;
  progressState.sources_total = sources.length;
  // Pass 1: fetch every feed; QUALITY + FRESHNESS filter; log duplicates;
  // reserve a discovery row for each NEW candidate (dedupe must also work
  // within this run).
  const candidates = [];
  const seenInRun = [];
  const logRejected = (source, item, url, aiMeta) => {
    db.prepare(`
      INSERT INTO magazine_discoveries (stable_id, source_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, image_url, publisher, status, ai_meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'FAILED', ?)
    `).run(crypto.randomUUID(), source.id, url, sha1(url), fingerprintFor({ title: item.title, sourceName: source.name }),
      item.title.slice(0, 300), cleanDate(item.publishedAt), source.category_slug, (item.summary || '').slice(0, 500),
      item.imageUrl || null, publisherOf(item, source), JSON.stringify(aiMeta));
  };
  for (const source of sources) {
    progressState.current_source = source.name;
    let items = [];
    let fetchError = null;
    try {
      items = await fetchSourceItems(db, source);
    } catch (e) {
      fetchError = String(e.message || e).slice(0, 300);
      summary.errors.push(`${source.name}: ${fetchError}`);
      progressState.error_sources.push(source.name);
    }
    setSourceFetchResult(db, source.id, { ok: !fetchError, error: fetchError });
    progressState.sources_done += 1;
    summary.fetched += items.length;
    for (const item of items) {
      const url = normalizeUrl(item.url);
      if (!url || !item.title) continue;
      // --- QUALITY filter: celebrity/lifestyle/SEO hosts never surface.
      if (LOW_QUALITY_HOSTS.test(hostOf(item.url))) {
        summary.filtered += 1;
        summary.filtered_breakdown['low-quality'] = (summary.filtered_breakdown['low-quality'] || 0) + 1;
        logRejected(source, item, url, { filtered: 'low-quality' });
        continue;
      }
      // --- FRESHNESS filter: old content is never presented as "new".
      const tier = Number(source.source_tier) || 3;
      const ageDays = ageDaysOf(cleanDate(item.publishedAt));
      const gate = freshnessGate({ ageDays, scientific: tier <= 2 });
      if (gate.accept === false) {
        summary.filtered += 1;
        summary.filtered_breakdown['freshness'] = (summary.filtered_breakdown['freshness'] || 0) + 1;
        logRejected(source, item, url, { filtered: gate.reason, age_days: ageDays == null ? null : Math.round(ageDays) });
        continue;
      }
      const inRun = seenInRun.find(c => c.url === url || titleSimilarity(c.title, item.title) >= TITLE_SIMILARITY_THRESHOLD);
      const dup = inRun || findDuplicate(db, { url: item.url, title: item.title, sourceName: source.name });
      if (dup) {
        summary.duplicates += 1;
        db.prepare(`
          INSERT INTO magazine_discoveries (stable_id, source_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, image_url, publisher, status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?, 'DUPLICATE')
        `).run(crypto.randomUUID(), source.id, url, sha1(url), fingerprintFor({ title: item.title, sourceName: source.name }), item.title.slice(0, 300), cleanDate(item.publishedAt), source.category_slug, (item.summary || '').slice(0, 500), item.imageUrl || null, publisherOf(item, source));
        seenInRun.push({ url, title: item.title });
        continue;
      }
      const info = db.prepare(`
        INSERT INTO magazine_discoveries (stable_id, source_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, image_url, publisher, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, 'NEW')
      `).run(crypto.randomUUID(), source.id, url, sha1(url), fingerprintFor({ title: item.title, sourceName: source.name }), item.title.slice(0, 300), cleanDate(item.publishedAt), source.category_slug, (item.summary || '').slice(0, 500), item.imageUrl || null, publisherOf(item, source));
      seenInRun.push({ url, title: item.title });
      candidates.push({ source, item, url, discoveryId: Number(info.lastInsertRowid), tier, date: cleanDate(item.publishedAt) || '' });
    }
    syncProgressFromSummary(summary);
  }
  summary.newItems = candidates.length;
  // Rank: scientific/professional sources first (owner quality tiers), then
  // items whose feed already provides an image, then newest first. Cap this
  // run at DISCOVERY_BATCH_SIZE new items (the UI «جستجو بیشتر» continues).
  const ordered = [...candidates].sort((a, b) =>
    (a.tier - b.tier) ||
    ((b.item.imageUrl ? 1 : 0) - (a.item.imageUrl ? 1 : 0)) ||
    String(b.date).localeCompare(String(a.date)));
  const toProcess = ordered.slice(0, DISCOVERY_BATCH_SIZE);
  summary.stopped_at_cap = ordered.length > DISCOVERY_BATCH_SIZE;
  // Items beyond the cap: release their reserved rows so the next run picks them up.
  for (const c of ordered.slice(DISCOVERY_BATCH_SIZE)) {
    db.prepare("DELETE FROM magazine_discoveries WHERE id=? AND status='NEW'").run(c.discoveryId);
  }
  progressState.items_total = toProcess.length;
  progressState.phase = 'draft';
  // Pass 2: AI editorial preparation (translate → summarize → key points) and
  // image extraction; then the draft enters the coach review inbox.
  const usedImages = new Set();
  let actionable = 0;
  for (const c of toProcess) {
    const { source, discoveryId } = c;
    progressState.current_source = source.name;
    try {
      const result = await processDiscovery(db, { id: discoveryId }, { usedImages });
      if (result && result.notPrepared) { summary.not_prepared += 1; }
      else if (result && result.skipped) { summary.rejected += 1; }
      else { summary.drafted += 1; actionable += 1; }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`پردازش: ${e.message || e}`);
    }
    progressState.items_done += 1;
    syncProgressFromSummary(summary);
  }
  // Notification only when the coach has actionable review items.
  if (actionable > 0 && notifyAudience === 'coach') {
    const engagement = require('./engagement-service');
    engagement.notify(db, {
      audienceType: 'coach',
      type: 'magazine_review_ready',
      title: '📰 مطالب جدید برای بررسی آماده است',
      body: `📰 ${actionable} مطلب جدید برای بررسی آماده است.`,
      entityType: 'magazine_discovery'
    });
  }
  // Backfill: drafts discovered before image support (or whose og fetch
  // failed) get another chance to receive their own source image. The same
  // image is never handed to a DIFFERENT story (same source_url may keep it).
  progressState.phase = 'images';
  let imgFixed = 0;
  const needImage = db.prepare(`
    SELECT id, source_url FROM magazine_articles
    WHERE deleted_at IS NULL AND status IN ('DRAFT','PENDING_REVIEW')
      AND (cover_image IS NULL OR cover_image='')
      AND source_url IS NOT NULL AND source_url != ''
    ORDER BY updated_at DESC LIMIT 15
  `).all();
  progressState.images_total = needImage.length;
  for (const row of needImage) {
    const img = await fetchOgImage(row.source_url);
    let conflict = false;
    if (img) conflict = db.prepare('SELECT 1 AS x FROM magazine_articles WHERE deleted_at IS NULL AND cover_image=? AND source_url<>? LIMIT 1').get(img, row.source_url) != null;
    if (img && !conflict) {
      db.prepare('UPDATE magazine_articles SET cover_image=? WHERE id=?').run(img, row.id);
      imgFixed += 1;
    }
    progressState.images_done += 1;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.last_run_at', ?)").run(new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.last_run_result', ?)").run(JSON.stringify({
    drafted: summary.drafted, filtered: summary.filtered, rejected: summary.rejected,
    not_prepared: summary.not_prepared, duplicates: summary.duplicates,
    stopped_at_cap: summary.stopped_at_cap, at: new Date().toISOString()
  }));
  const audit = require('./audit-service');
  audit.record(db, {
    actorType: 'system',
    action: 'discovery.completed',
    entityType: 'magazine_discovery',
    metadata: { fetched: summary.fetched, new_items: summary.newItems, duplicates: summary.duplicates, drafted: summary.drafted, rejected: summary.rejected, filtered: summary.filtered, filtered_breakdown: summary.filtered_breakdown, not_prepared: summary.not_prepared, failed: summary.failed, images_backfilled: imgFixed }
  });
  const result = { ...summary, images_backfilled: imgFixed };
  progressState.running = false;
  progressState.finished_at = Date.now();
  progressState.phase = summary.errors.length ? 'done_with_errors' : 'done';
  progressState.last_result = { drafted: summary.drafted, duplicates: summary.duplicates, failed: summary.failed, skipped: summary.rejected, rejected: summary.rejected, filtered: summary.filtered, not_prepared: summary.not_prepared, fetched: summary.fetched, error_count: summary.errors.length, images_backfilled: imgFixed, stopped_at_cap: summary.stopped_at_cap };
  return result;
  } catch (e) {
    progressState.running = false;
    progressState.finished_at = Date.now();
    progressState.phase = 'error';
    progressState.last_result = { error: true };
    throw e;
  }
}

// ---------- scheduler (in-process; mirrors the app's in-memory patterns) ----------

let schedulerTimer = null;
let lastAutoRunAt = 0;

function intervalMsFromSettings(settings) {
  const hours = Number((settings && settings['magazine.fetch_interval']) || 12);
  return [6, 12, 24].includes(hours) ? hours * 3600 * 1000 : 12 * 3600 * 1000;
}

async function tickScheduledDiscovery(db, settings) {
  const autoFetch = String(settings['magazine.auto_fetch'] || '0') === '1';
  if (!autoFetch) return null;
  const now = Date.now();
  if (now - lastAutoRunAt < intervalMsFromSettings(settings)) return null;
  lastAutoRunAt = now;
  const audit = require('./audit-service');
  try {
    const result = await runDiscovery(db);
    audit.record(db, { actorType: 'system', action: 'discovery.scheduled', entityType: 'magazine_discovery', metadata: result });
    return result;
  } catch (e) {
    audit.record(db, { actorType: 'system', action: 'discovery.scheduled_failed', entityType: 'magazine_discovery', metadata: { error: String(e.message || e).slice(0, 300) } });
    return null;
  }
}

function startDiscoveryScheduler(db, { tickMs = 30 * 60 * 1000 } = {}) {
  if (schedulerTimer) return schedulerTimer;
  schedulerTimer = setInterval(() => {
    let settings = null;
    try {
      const publicContent = require('./public-content-service');
      settings = publicContent.getSiteSettings(db);
    } catch (e) { return; }
    Promise.resolve()
      .then(() => tickScheduledDiscovery(db, settings))
      .catch(e => console.error('[Magazine Discovery]', e.message));
  }, tickMs);
  if (typeof schedulerTimer.unref === 'function') schedulerTimer.unref();
  return schedulerTimer;
}

function stopDiscoveryScheduler() {
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
}

// ---------- review queue views ----------

function queueView(db, { status = '' } = {}) {
  const statuses = ['DRAFT', 'PENDING_REVIEW'];
  const sql = `
    SELECT a.*, c.name_fa AS category_name,
      (SELECT COUNT(*) FROM magazine_discoveries d WHERE d.article_id=a.id) AS discovery_count
    FROM magazine_articles a
    LEFT JOIN magazine_categories c ON c.id=a.category_id AND c.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.status IN ('DRAFT','PENDING_REVIEW')
    ${status === 'DRAFT' || status === 'PENDING_REVIEW' ? 'AND a.status=?' : ''}
    ORDER BY a.updated_at DESC LIMIT 200
  `;
  const rows = (status === 'DRAFT' || status === 'PENDING_REVIEW')
    ? db.prepare(sql).all(status)
    : db.prepare(sql).all();
  return rows.map(row => {
    const discovery = db.prepare('SELECT * FROM magazine_discoveries WHERE article_id=? ORDER BY id DESC LIMIT 1').get(row.id);
    let flags = [];
    try { flags = JSON.parse(row.quality_flags || '[]'); } catch (e) { flags = []; }
    let aiMeta = null;
    if (discovery) { try { aiMeta = JSON.parse(discovery.ai_meta || 'null'); } catch (e) { aiMeta = null; } }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      status: row.status,
      content_origin: row.content_origin,
      category: row.category_id ? (function () { const cat = db.prepare('SELECT slug FROM magazine_categories WHERE id=?').get(row.category_id); return cat ? cat.slug : null; })() : null,
      category_name: row.category_name || null,
      source_name: row.source_name || null,
      source_url: row.source_url || null,
      cover_image: row.cover_image || null,
      reading_time: row.reading_time || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      quality_flags: flags,
      ai_meta: aiMeta,
      why_it_matters: aiMeta && aiMeta.why_it_matters ? aiMeta.why_it_matters : '',
      key_points: aiMeta && (Array.isArray(aiMeta.key_points) ? aiMeta.key_points : (Array.isArray(aiMeta.claims) ? aiMeta.claims : [])),
      evergreen: Boolean(aiMeta && aiMeta.freshness === 'evergreen'),
      discovered_at: discovery ? discovery.created_at : null,
      original_title: discovery ? discovery.title_original : null,
      source_published_at: discovery ? discovery.date_published : null,
      duplicate_warning: discovery && discovery.status === 'DUPLICATE' ? true : false
    };
  });
}

function queueStats(db) {
  const count = status => db.prepare('SELECT COUNT(*) c FROM magazine_articles WHERE deleted_at IS NULL AND status=?').get(status).c;
  const newToday = db.prepare("SELECT COUNT(*) c FROM magazine_discoveries WHERE status='DRAFTED' AND date(created_at) = date('now')").get().c;
  const lastRun = db.prepare("SELECT value FROM settings WHERE key='magazine.last_run_at'").get();
  const lastRunResultRow = db.prepare("SELECT value FROM settings WHERE key='magazine.last_run_result'").get();
  let lastRunResult = null;
  if (lastRunResultRow) { try { lastRunResult = JSON.parse(lastRunResultRow.value); } catch (e) { lastRunResult = null; } }
  return {
    published: count('PUBLISHED'),
    pending_review: count('PENDING_REVIEW'),
    drafts: count('DRAFT'),
    rejected: count('REJECTED'),
    new_today: newToday,
    last_run_at: lastRun ? lastRun.value : null,
    last_run: lastRunResult
  };
}

module.exports = {
  DISCOVERY_BATCH_SIZE,
  FRESH_NEWS_DAYS,
  FRESH_SCIENCE_DAYS,
  EVERGREEN_HARD_CAP_DAYS,
  LOW_QUALITY_HOSTS,
  OG_BLOCK_HOSTS,
  hostOf,
  ageDaysOf,
  freshnessGate,
  extractUrlFromGoogleNewsId,
  resolveGoogleNewsUrl,
  domainToName,
  publisherOf,
  getDiscoveryProgress,
  fetchOgImage,
  fetchSourceItems,
  setSourceFetchResult,
  normalizeUrl,
  sha1,
  fingerprintFor,
  titleSimilarity,
  parseFeed,
  listSources,
  createSource,
  updateSource,
  deleteSource,
  sourceView,
  findDuplicate,
  qualityChecks,
  processDiscovery,
  runDiscovery,
  tickScheduledDiscovery,
  startDiscoveryScheduler,
  stopDiscoveryScheduler,
  queueView,
  queueStats,
  lastAutoRunAt: () => lastAutoRunAt
};
