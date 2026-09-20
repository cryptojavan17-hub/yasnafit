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
    // Google News feeds: the item <link> is a redirect; the real article URL is
    // the first anchor inside the decoded description.
    let realUrl = '';
    if (/news\.google\.com\/?rss/i.test(url)) {
      const anchor = rawSummary.match(/<a[^>]+href\s*=\s*["']([^"']+)["']/i);
      if (anchor) realUrl = anchor[1];
    }
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
    id: row.id, name: row.name, feed_url: row.feed_url, source_type: row.source_type,
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
  '3) اگر متن منبع به انگلیسی یا زبان دیگری است، آن را روان و حرفه‌ای به فارسی ترجمه/بازنویسی کنید (ترجمهٔ تحت‌اللفظی نه).',
  '4) خروجی فقط JSON معتبر با همین کلیدها باشد: title, summary, content_html, claims[], references[{name,url}], related_keywords[], sensitive_flags[], confidence(0-1), category, why_it_matters, useful.',
  '7) category فقط یکی از اینها باشد: bodybuilding / sports-science / nutrition / health / sports-news (هر کدام بیشتر با مطلب جور است). why_it_matters یک یا دو جملهٔ روان فارسی دربارهٔ اینکه این مطلب برای مخاطبان YASNAFIT (به‌ویژه زنان) چرا مهم/مفید است. useful فقط در صورت بی‌ربط/کلیک‌بیت/کم‌اعتبار بودن محتوا false باشد.',
  '5) content_html فقط برچسب‌های p, h2, ul, li, strong, em, a باشد؛ فارسی و ادبیات خبری-علمی؛ بدون زبان فنی هوش مصنوعی و بدون ذکر «تولیدشده با هوش مصنوعی».',
  '6) اگر منبع علمی است، نام پژوهش/موسسه را فقط در حدی که در متن منبع آمده در references بنویسید.',
  '8) منابع بر اساس اعتبار به این ترتیب اولویت دارند: سطح ۱ (علمی/مبتنی بر شواهد): PubMed/NCBI، ACSM، British Journal of Sports Medicine، Sports Medicine، Journal of Strength and Conditioning Research؛ سطح ۲ (سازمان‌های حرفه‌ای): NSCA، ISSN (International Society of Sports Nutrition)، IOC؛ سطح ۳ (نشریات معتبر ورزش و تغذیه و فدراسیون‌های بزرگ). از کلیک‌بیت، بلاگ‌های ضعیف و ادعاهای بی‌منبع اینفلوئنسرها پرهیز کنید.',
  '9) شواهد: پیش‌فرض به مرورهای سیستماتیک، متاآنالیزها، کارآزمایی‌های تصادفی‌سازی‌شده، بیانیه‌های اجماعی و position standهای رسمی بدهید. هرگز یک مطالعهٔ تکی را به‌عنوان «حقیقت اثبات‌شده» ارائه نکنید (بنویسید «این مطالعه نشان داد…»). برای ادعاهای مهم، در حد امکان با چند منبع معتبر تطبیق دهید.',
  '10) هر پیشنهاد مقاله باید نام منبع اصلی و تاریخ انتشار آن را در references حفظ کند (قانون ثابت: منبع اصلی + تاریخ). فقط ترجمه/خلاصه — هرگز اطلاعات اختراع‌شده.'
].join('\n');

function editorialUserPrompt(item, sourceName) {
  return [
    'محتوای خبر/مقالهٔ منبع زیر را برای مجلهٔ YASNAFIT آماده کنید:',
    `منبع: ${sourceName || 'نامشخص'}`,
    `آدرس اصلی: ${item.url}`,
    `عنوان اصلی: ${item.title}`,
    `تاریخ انتشار: ${item.publishedAt || 'نامشخص'}`,
    `نویسنده/سازمان: ${item.author || 'نامشخص'}`,
    `خلاصهٔ منبع: ${item.summary || 'در دسترس نیست'}`,
    ''
  ].join('\n');
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

function draftFromAi(parsed, item, sourceName) {
  if (!parsed || typeof parsed !== 'object') return null;
  const title = String(parsed.title || '').trim().slice(0, 200);
  const summary = String(parsed.summary || '').trim().slice(0, 500);
  // Keep only whitelisted tags/attributes; strip any AI meta-language defensively.
  let content = String(parsed.content_html || '').trim();
  if (!title || content.length < 200) return null;
  content = articleService.sanitizeRichText(content.slice(0, 100000));
  const claims = Array.isArray(parsed.claims) ? parsed.claims.slice(0, 10).map(String).map(s => s.slice(0, 300)) : [];
  const references = Array.isArray(parsed.references)
    ? parsed.references.slice(0, 10).map(r => ({ name: String(r?.name ?? r?.source_name ?? '').slice(0, 200), url: String(r?.url ?? r?.source_url ?? '').slice(0, 500) }))
        .filter(r => r.name || r.url)
    : [];
  const keywords = Array.isArray(parsed.related_keywords) ? parsed.related_keywords.slice(0, 8).map(String).map(s => s.slice(0, 80)) : [];
  const sensitive = Array.isArray(parsed.sensitive_flags) ? parsed.sensitive_flags.slice(0, 10).map(String).map(s => s.slice(0, 300)) : [];
  const confidence = Number(parsed.confidence);
  const knownCats = ['bodybuilding', 'sports-science', 'nutrition', 'health', 'sports-news'];
  const category = knownCats.includes(parsed.category) ? parsed.category : null;
  const whyItMatters = String(parsed.why_it_matters || '').trim().slice(0, 400);
  const useful = parsed.useful === undefined ? true : Boolean(parsed.useful);
  const bodyParts = [content];
  if (item.url) bodyParts.push(`<p><a href="${htmlEscape(item.url)}" rel="noopener noreferrer">منبع اصلی: ${htmlEscape(sourceName || 'خبر')}</a></p>`);
  return {
    title,
    summary: summary || item.summary || '',
    content: bodyParts.join('\n'),
    references,
    claims,
    keywords,
    sensitive,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : null,
    category,
    why_it_matters: whyItMatters,
    useful
  };
}

function minimalDraftFromSource(item, sourceName) {
  // Used when the AI provider is unavailable/fails: a clearly-flagged minimal
  // editorial draft from the source's own metadata. Never invents content.
  const sourceLine = `<p><a href="${htmlEscape(item.url)}" rel="noopener noreferrer">منبع اصلی: ${htmlEscape(sourceName || 'خبر')}</a></p>`;
  const summaryText = item.summary ? `<p>${htmlEscape(item.summary)}</p>` : '';
  return {
    title: String(item.title).slice(0, 200),
    summary: (item.summary || '').slice(0, 500),
    content: `${summaryText ? summaryText + '\n' : ''}<p>این پیش‌نویس مستقیماً از خلاصهٔ منبع آماده شده و در انتظار بازنویسی/بازبینی ویراستاری است. قبل از انتشار، متن کامل خبر اصلی را مطالعه کنید.</p>\n${sourceLine}`,
    references: item.url ? [{ name: sourceName || 'منبع خبر', url: item.url }] : [],
    claims: [],
    keywords: [],
    sensitive: [],
    confidence: null,
    category: null,
    why_it_matters: '',
    useful: true,
    aiAssisted: false
  };
}

// ---------- image retrieval (og:image from the original article page) ----------
// Only reads the article's own page metadata (like a browser preview would).
// No random image services, no downloads from search engines.
async function fetchOgImage(pageUrl) {
  try {
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

async function processDiscovery(db, discovery, { aiEnabled = true } = {}) {
  const d = db.prepare('SELECT * FROM magazine_discoveries WHERE id=?').get(discovery.id);
  const source = d.source_id ? sourceView(db, d.source_id) : null;
  db.prepare("UPDATE magazine_discoveries SET status='PROCESSING' WHERE id=?").run(d.id);
  const item = {
    url: d.url,
    title: d.title_original,
    publishedAt: d.date_published,
    summary: d.summary_original,
    imageUrl: d.image_url,
    author: ''
  };
  const flags = qualityChecks({ item, categorySlug: d.category_slug });
  let draft = null;
  let aiFailed = null;
  if (aiEnabled) {
    try {
      const aiSettings = getSettings(db);
      if (aiSettings.has_api_key) {
        const reply = await chatCompletion(db, {
          messages: [
            { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
            { role: 'user', content: editorialUserPrompt(item, source?.name) }
          ],
          tools: false,
          temperature: 0.4,
          max_tokens: 2200,
          timeout_ms: 90000
        });
        const parsed = extractJson(reply && (reply.content || reply.text || (typeof reply === 'string' ? reply : '')));
        draft = draftFromAi(parsed, item, source?.name);
        if (!draft) aiFailed = 'خروجی هوش مصنوعی معتبر نبود';
      } else {
        aiFailed = 'هوش مصنوعی پیکربندی نشده است';
      }
    } catch (e) {
      aiFailed = e.message || 'خطا در پردازش هوش مصنوعی';
    }
  }
  if (!draft) {
    if (aiFailed) flags.push('پردازش هوش مصنوعی انجام نشد: ' + String(aiFailed).slice(0, 200));
    draft = minimalDraftFromSource(item, source?.name);
  }
  if (draft.useful === false) {
    db.prepare("UPDATE magazine_discoveries SET status='FAILED', ai_meta=?, processed_at=CURRENT_TIMESTAMP WHERE id=?").run(JSON.stringify({ skipped: 'not useful', ai_failed: aiFailed || null }), d.id);
    return { skipped: true };
  }
  // Image: prefer the feed's own image; otherwise read og:image from the
  // original article page (the source's own image, with source attribution
  // kept in the article). Never a random image service.
  let cover = item.imageUrl || '';
  if (cover) {
    // Keep every stored cover https so it survives the page CSP (img-src https:)
    try { const cu = new URL(cover); if (cu.protocol === 'http:') { cu.protocol = 'https:'; cover = cu.toString(); } } catch (e) { cover = ''; }
  }
  if (!cover) cover = await fetchOgImage(item.url);
  try {
    const article = articleService.createArticle(db, {
      title: draft.title,
      summary: draft.summary,
      content: draft.content,
      category: draft.category || d.category_slug || undefined,
      cover_image: cover || null,
      content_origin: 'generated',
      source_name: source?.name || null,
      source_url: item.url,
      sources: draft.references.length ? draft.references : (item.url ? [{ name: source?.name || 'منبع خبر', url: item.url }] : [])
    }, 'discovery-engine');
    // Persist editorial metadata for the review screen.
    const meta = {
      claims: draft.claims,
      keywords: draft.keywords,
      sensitive: draft.sensitive,
      confidence: draft.confidence,
      why_it_matters: draft.why_it_matters || '',
      ai_assisted: draft.aiAssisted !== false,
      ai_failed: aiFailed || null
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
  progressState.items_found = summary.fetched;
}

async function runDiscovery(db, { notifyAudience = 'coach' } = {}) {
  Object.assign(progressState, {
    running: true, phase: 'sources', current_source: '',
    sources_total: 0, sources_done: 0, items_total: 0, items_done: 0, items_found: 0,
    images_total: 0, images_done: 0, drafted: 0, duplicates: 0, failed: 0, skipped: 0,
    error_sources: [], started_at: Date.now(), finished_at: null, last_result: null
  });
  const summary = { fetched: 0, newItems: 0, duplicates: 0, drafted: 0, failed: 0, skipped: 0, sources: 0, errors: [], stopped_at_cap: false };
  try {
  const sources = listSources(db).filter(s => s.is_active);
  summary.sources = sources.length;
  progressState.sources_total = sources.length;
  // Pass 1: fetch every feed; log duplicates; reserve a discovery row for each
  // NEW item (dedupe must also work within this run) and collect the candidates.
  const candidates = [];
  // In-run dedupe: candidates collected earlier in THIS run must also count
  // (the DB rows are reserved as NEW and only become DRAFTED in pass 2).
  const seenInRun = [];
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
      const inRun = seenInRun.find(c => c.url === url || titleSimilarity(c.title, item.title) >= TITLE_SIMILARITY_THRESHOLD);
      const dup = inRun || findDuplicate(db, { url: item.url, title: item.title, sourceName: source.name });
      if (dup) {
        summary.duplicates += 1;
        db.prepare(`
          INSERT INTO magazine_discoveries (stable_id, source_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, image_url, status)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'DUPLICATE')
        `).run(crypto.randomUUID(), source.id, url, sha1(url), fingerprintFor({ title: item.title, sourceName: source.name }), item.title.slice(0, 300), cleanDate(item.publishedAt), source.category_slug, (item.summary || '').slice(0, 500), item.imageUrl || null);
        seenInRun.push({ url, title: item.title });
        continue;
      }
      const info = db.prepare(`
        INSERT INTO magazine_discoveries (stable_id, source_id, url, url_hash, fingerprint, title_original, date_published, category_slug, summary_original, image_url, status)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'NEW')
      `).run(crypto.randomUUID(), source.id, url, sha1(url), fingerprintFor({ title: item.title, sourceName: source.name }), item.title.slice(0, 300), cleanDate(item.publishedAt), source.category_slug, (item.summary || '').slice(0, 500), item.imageUrl || null);
      seenInRun.push({ url, title: item.title });
      candidates.push({ source, item, url, discoveryId: Number(info.lastInsertRowid) });
    }
    syncProgressFromSummary(summary);
  }
  summary.newItems = candidates.length;
  // Prioritize items whose own feed already provides an image, then cap this
  // run at DISCOVERY_BATCH_SIZE new items (the UI «جستجو بیشتر» starts the next batch).
  const ordered = [...candidates.filter(c => c.item.imageUrl), ...candidates.filter(c => !c.item.imageUrl)];
  const toProcess = ordered.slice(0, DISCOVERY_BATCH_SIZE);
  summary.stopped_at_cap = ordered.length > DISCOVERY_BATCH_SIZE;
  // Items beyond the cap: release their reserved rows so the next run picks them up.
  for (const c of ordered.slice(DISCOVERY_BATCH_SIZE)) {
    db.prepare("DELETE FROM magazine_discoveries WHERE id=? AND status='NEW'").run(c.discoveryId);
  }
  progressState.items_total = toProcess.length;
  // Pass 2: turn the batch into Persian editorial drafts.
  let actionable = 0;
  for (const c of toProcess) {
    const { source, discoveryId } = c;
    progressState.current_source = source.name;
    try {
      const result = await processDiscovery(db, { id: discoveryId });
      if (result && result.skipped) { summary.skipped += 1; }
      else { summary.drafted += 1; actionable += 1; }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push(`پردازش: ${e.message || e}`);
    }
    progressState.items_done += 1;
    syncProgressFromSummary(summary);
  }
  // Notification only when the coach has actionable review items (section 17).
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
  // failed) get another chance to receive their own source image.
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
    if (img) {
      db.prepare('UPDATE magazine_articles SET cover_image=? WHERE id=?').run(img, row.id);
      imgFixed += 1;
    }
    progressState.images_done += 1;
  }
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('magazine.last_run_at', ?)").run(new Date().toISOString());
  const audit = require('./audit-service');
  audit.record(db, {
    actorType: 'system',
    action: 'discovery.completed',
    entityType: 'magazine_discovery',
    metadata: { fetched: summary.fetched, new_items: summary.newItems, duplicates: summary.duplicates, drafted: summary.drafted, failed: summary.failed, skipped: summary.skipped, images_backfilled: imgFixed }
  });
  const result = { ...summary, images_backfilled: imgFixed };
  progressState.running = false;
  progressState.finished_at = Date.now();
  progressState.phase = summary.errors.length ? 'done_with_errors' : 'done';
  progressState.last_result = { drafted: summary.drafted, duplicates: summary.duplicates, failed: summary.failed, skipped: summary.skipped, fetched: summary.fetched, error_count: summary.errors.length, images_backfilled: imgFixed, stopped_at_cap: summary.stopped_at_cap };
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
      key_points: aiMeta && Array.isArray(aiMeta.claims) ? aiMeta.claims : [],
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
  return {
    published: count('PUBLISHED'),
    pending_review: count('PENDING_REVIEW'),
    drafts: count('DRAFT'),
    rejected: count('REJECTED'),
    new_today: newToday,
    last_run_at: lastRun ? lastRun.value : null
  };
}

module.exports = {
  DISCOVERY_BATCH_SIZE,
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
