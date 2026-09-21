'use strict';
// Magazine domain logic. The public site and the coach editorial panel both talk
// through this service; server.js only routes and serializes (TD-03).
//
// Editorial workflow (deliberate, safe default — no autonomous publishing):
//   DRAFT → PENDING_REVIEW → PUBLISHED
//                    ↘ REJECTED ↗ (back to DRAFT)
// Every transition that reaches PUBLISHED is a human review action; the
// `content_origin` column keeps an internal trace (generated/edited/human/
// imported) without ever being shown on the public site.

const crypto = require('crypto');

const CATEGORIES = [
  { slug: 'bodybuilding', name_fa: 'بدنسازی' },
  { slug: 'sports-science', name_fa: 'علم ورزش' },
  { slug: 'nutrition', name_fa: 'تغذیه' },
  { slug: 'health', name_fa: 'سلامت' },
  { slug: 'sports-news', name_fa: 'اخبار ورزشی' }
];
const STATUS = { DRAFT: 'DRAFT', PENDING_REVIEW: 'PENDING_REVIEW', REJECTED: 'REJECTED', PUBLISHED: 'PUBLISHED' };
const ORIGINS = ['generated', 'edited', 'human', 'imported'];

const slugSafe = value => String(value || '').trim().toLowerCase()
  .normalize('NFC')
  .replace(/[\u064A\u0649]/g, '\u06CC')
  .replace(/\u0643/g, '\u06A9')
  .replace(/[\u0623\u0625\u0622]/g, '\u0627')
  .replace(/[\u064B-\u0652\u0670]/g, '')
  .replace(/[\u200c\u200f\u200e]/g, ' ')
  .replace(/[\s_]+/g, '-')
  .replace(/[^a-z0-9\u0600-\u06FF-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 120);

function uniqueSlug(db, base, excludeId = null) {
  const root = slugSafe(base) || 'article';
  let candidate = root;
  for (let i = 2; ; i++) {
    const sql = excludeId
      ? 'SELECT id FROM magazine_articles WHERE slug=? AND id<>? AND deleted_at IS NULL'
      : 'SELECT id FROM magazine_articles WHERE slug=? AND deleted_at IS NULL';
    const params = excludeId ? [candidate, excludeId] : [candidate];
    if (!db.prepare(sql).get(...params)) return candidate;
    candidate = `${root}-${i}`;
  }
}

function cleanText(value, maxLen) {
  const text = String(value ?? '').trim();
  if (text.length > maxLen) return text.slice(0, maxLen);
  return text;
}

// Rough Persian reading time: ~200 words/minute of comfortable reading.
function readingTimeFor(content) {
  const words = String(content || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function categoryOf(db, category) {
  if (category == null) return null;
  if (typeof category === 'number') {
    return db.prepare('SELECT * FROM magazine_categories WHERE id=? AND deleted_at IS NULL').get(category) || null;
  }
  return db.prepare('SELECT * FROM magazine_categories WHERE slug=? AND deleted_at IS NULL').get(String(category)) || null;
}

// ---------- Output sanitization ----------
// Article bodies are coach-authored rich text. The public renderer rebuilds
// the HTML from a strict tag/attribute whitelist so nothing interactive or
// remote-scriptable can reach anonymous visitors.

const ALLOWED_TAGS = new Set(['P','DIV','H2','H3','H4','H5','UL','OL','LI','STRONG','B','EM','I','U','BLOCKQUOTE','A','IMG','TABLE','THEAD','TBODY','TR','TH','TD','BR','HR','FIGURE','FIGCAPTION','SPAN']);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\s*(\/?)>/g;

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+))?/g;
  let match;
  while ((match = re.exec(raw || ''))) {
    const name = match[1].toLowerCase();
    if (match[0].trim() === name) continue; // attribute without a value
    attrs[name] = match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : (match[5] !== undefined ? match[5] : '');
  }
  return attrs;
}

function safeUrl(value) {
  const url = String(value || '').trim();
  if (/^(https:\/\/|mailto:|tel:)/i.test(url)) return url.replace(/[\u0000-\u001F]/g, '');
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('..')) return url;
  if (!url.includes(':') && !url.startsWith('#')) return url;
  return '';
}

function sanitizeRichText(html) {
  const source = String(html ?? '');
  let out = '';
  let lastIndex = 0;
  for (const match of source.matchAll(TAG_RE)) {
    out += source.slice(lastIndex, match.index); // text node: kept as-is (escaped by the HTML shell when needed)
    lastIndex = match.index + match[0].length;
    const [, closing, rawName, rawAttrs, selfClosing] = match;
    const name = rawName.toUpperCase();
    if (!ALLOWED_TAGS.has(name)) continue; // drop unknown tags, keep their text
    const attrs = parseAttrs(rawAttrs);
    let rendered = '';
    if (name === 'A' && closing) { out += '</a>'; continue; }
    if (name === 'A') {
      const href = safeUrl(attrs.href);
      if (!href) continue;
      rendered = `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer">`;
    } else if (name === 'IMG') {
      const src = safeUrl(attrs.src);
      if (!src) continue;
      const alt = String(attrs.alt ?? '').slice(0, 200).replace(/"/g, '&quot;');
      rendered = `<img src="${src.replace(/"/g, '&quot;')}" alt="${alt}" loading="lazy">`;
    } else if (name === 'TH' || name === 'TD') {
      rendered = `<${rawName.toLowerCase()}`;
      for (const span of ['colspan', 'rowspan']) {
        const value = /^\d{1,2}$/.test(String(attrs[span] ?? '')) ? attrs[span] : '';
        if (value) rendered += ` ${span}="${value}"`;
      }
      rendered += '>';
    } else {
      rendered = `<${closing ? '/' : ''}${rawName.toLowerCase()}${selfClosing ? ' /' : ''}>`;
    }
    out += rendered;
  }
  out += source.slice(lastIndex);
  return out;
}

// ---------- Public read model (published only) ----------

function listPublicCategories(db, enabledSlugs = null) {
  let rows = db.prepare(`
    SELECT slug, name_fa, description FROM magazine_categories
    WHERE is_active=1 AND deleted_at IS NULL
    ORDER BY sort_order, id
  `).all();
  // enabledSlugs: the settings-level per-category switch (magazine.category_enabled.*).
  if (enabledSlugs) rows = rows.filter(c => enabledSlugs.has(c.slug));
  return rows;
}

/** Articles for the public site, honoring per-category enable switches. */
function listPublicSiteArticles(db, { category = '', limit = 24, enabledSlugs = null } = {}) {
  const rows = listPublicArticles(db, { category, limit });
  if (!enabledSlugs) return rows;
  return rows.filter(a => !a.category || enabledSlugs.has(a.category));
}

// Hide only the legacy auto-generated outbound CTA. Keep the stored/editor
// body intact, including coach-authored paragraphs and ordinary editorial links.
function publicArticleContent(content) {
  return sanitizeRichText(content)
    .replace(/<p>\s*(?:<a\b[^>]*>)?\s*مطالعه[ٔ\s]*کامل\s+مطلب\s+در\s+منبع\s+اصلی\s*(?:<\/a>)?\s*<\/p>/gu, '')
    .replace(/<a\b[^>]*>\s*مطالعه[ٔ\s]*کامل\s+مطلب\s+در\s+منبع\s+اصلی\s*<\/a>/gu, '')
    .replace(/<p>\s*<\/p>/gi, '');
}

function publicArticleView(row) {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category_slug || null,
    category_name: row.category_name || null,
    cover_image: row.cover_image || null,
    reading_time: row.reading_time || 0,
    published_at: row.published_at || null
  };
}

function listPublicArticles(db, { category = '', limit = 24 } = {}) {
  const categoryRow = category ? categoryOf(db, category) : null;
  const sql = `
    SELECT a.slug, a.title, a.summary, a.cover_image, a.reading_time, a.published_at,
           a.source_name, a.source_url, c.slug AS category_slug, c.name_fa AS category_name
    FROM magazine_articles a
    LEFT JOIN magazine_categories c ON c.id = a.category_id
    WHERE a.status='PUBLISHED' AND a.deleted_at IS NULL
      ${categoryRow ? 'AND a.category_id=?' : ''}
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ?
  `;
  const params = categoryRow ? [categoryRow.id, Math.min(Math.max(Number(limit) || 24, 1), 200)] : [Math.min(Math.max(Number(limit) || 24, 1), 200)];
  return db.prepare(sql).all(...params).map(publicArticleView);
}

function getPublicArticle(db, slug) {
  const safe = String(slug || '').slice(0, 200);
  const row = db.prepare(`
    SELECT a.*, c.slug AS category_slug, c.name_fa AS category_name
    FROM magazine_articles a
    LEFT JOIN magazine_categories c ON c.id = a.category_id
    WHERE a.slug=? AND a.status='PUBLISHED' AND a.deleted_at IS NULL
  `).get(safe);
  if (!row) return null;
  const related = db.prepare(`
    SELECT a.slug, a.title, a.summary, a.cover_image, a.reading_time, a.published_at,
           c.name_fa AS category_name
    FROM magazine_articles a
    LEFT JOIN magazine_categories c ON c.id = a.category_id
    WHERE a.status='PUBLISHED' AND a.deleted_at IS NULL AND a.id<>?
    ORDER BY (a.category_id IS ? AND a.category_id IS NOT NULL) DESC, a.published_at DESC
    LIMIT 3
  `).all(row.id, row.category_id ?? -1);
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: publicArticleContent(row.content),
    category: row.category_slug || null,
    category_name: row.category_name || null,
    cover_image: row.cover_image || null,
    reading_time: row.reading_time || 0,
    published_at: row.published_at || null,
    related: related.map(r => ({ slug: r.slug, title: r.title, summary: r.summary, cover_image: r.cover_image || null, reading_time: r.reading_time || 0, published_at: r.published_at || null, category_name: r.category_name || null }))
  };
}

// ---------- Coach editorial model ----------

function adminArticleView(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    content: row.content,
    category_id: row.category_id,
    category_slug: row.category_slug || null,
    category_name: row.category_name || null,
    cover_image: row.cover_image || null,
    status: row.status,
    content_origin: row.content_origin,
    source_name: row.source_name || null,
    source_url: row.source_url || null,
    reading_time: row.reading_time || 0,
    published_at: row.published_at || null,
    reviewed_at: row.reviewed_at || null,
    reviewed_by: row.reviewed_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function adminArticle(db, id) {
  const row = db.prepare(`
    SELECT a.*, c.slug AS category_slug, c.name_fa AS category_name
    FROM magazine_articles a LEFT JOIN magazine_categories c ON c.id=a.category_id
    WHERE a.id=? AND a.deleted_at IS NULL
  `).get(id);
  if (!row) return null;
  const sources = db.prepare(`SELECT source_name, source_url, note, sort_order FROM magazine_article_sources WHERE article_id=? ORDER BY sort_order, id`).all(row.id);
  return { ...adminArticleView(row), sources };
}

function listAdminArticles(db, { status = '', category_id = '', search = '', limit = 100 } = {}) {
  const where = ['a.deleted_at IS NULL'];
  const params = [];
  if (status && status !== 'all') { where.push('a.status=?'); params.push(status); }
  if (category_id) { where.push('a.category_id=?'); params.push(Number(category_id)); }
  if (search) {
    where.push('(a.title LIKE ? OR a.summary LIKE ?)');
    const q = `%${String(search).slice(0, 120)}%`;
    params.push(q, q);
  }
  const rows = db.prepare(`
    SELECT a.id, a.slug, a.title, a.summary, a.status, a.content_origin, a.category_id,
           a.cover_image, a.source_name, a.source_url,
           c.name_fa AS category_name, a.reading_time, a.published_at, a.created_at, a.updated_at
    FROM magazine_articles a
    LEFT JOIN magazine_categories c ON c.id=a.category_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.updated_at DESC, a.id DESC
    LIMIT ?
  `).all(...params, Math.min(Math.max(Number(limit) || 100, 1), 500));
  const counts = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS total FROM magazine_articles WHERE deleted_at IS NULL GROUP BY status').all()) counts[row.status] = row.total;
  const total = db.prepare('SELECT COUNT(*) AS total FROM magazine_articles WHERE deleted_at IS NULL').get().total;
  return { items: rows, counts, total };
}

function validateContent(db, input) {
  const errors = [];
  const title = cleanText(input.title, 200);
  if (!title) errors.push('عنوان مقاله الزامی است');
  const summary = cleanText(input.summary, 500);
  // Sanitize at write time: the stored body is the canonical form, so every
  // reader (admin editor, public SSR, future AI consumers) sees safe HTML.
  // The public renderer re-sanitizes on read as defense in depth.
  const content = sanitizeRichText(String(input.content ?? '').slice(0, 100000));
  const origin = ORIGINS.includes(input.content_origin) ? input.content_origin : 'human';
  const sourceName = cleanText(input.source_name, 200);
  let sourceUrl = String(input.source_url ?? '').trim().slice(0, 500);
  if (sourceUrl && !/^(https?:\/\/|mailto:|tel:)/i.test(sourceUrl)) sourceUrl = '';
  let categoryId = null;
  if (input.category_id || input.category) {
    const cat = categoryOf(db, input.category_id ?? input.category);
    if (!cat) errors.push('دسته‌بندی نامعتبر است');
    categoryId = cat?.id ?? null;
  }
  return { errors, title, summary, content, origin, sourceName, sourceUrl, categoryId };
}

function replaceSources(db, articleId, sources) {
  db.prepare('DELETE FROM magazine_article_sources WHERE article_id=?').run(articleId);
  if (!Array.isArray(sources)) return;
  const insert = db.prepare('INSERT INTO magazine_article_sources (article_id, source_name, source_url, note, sort_order) VALUES (?,?,?,?,?)');
  sources.slice(0, 20).forEach((source, index) => {
    const name = cleanText(source?.name ?? source?.source_name, 200);
    if (!name) return;
    let url = String(source?.url ?? source?.source_url ?? '').trim().slice(0, 500);
    if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = '';
    insert.run(articleId, name, url || null, cleanText(source?.note, 300), index);
  });
}

function createArticle(db, input, actor = 'coach') {
  const v = validateContent(db, input);
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  const slug = uniqueSlug(db, input.slug ? slugSafe(input.slug) : v.title);
  const stableId = crypto.randomUUID();
  const info = db.prepare(`
    INSERT INTO magazine_articles
      (stable_id, slug, title, summary, content, category_id, cover_image, status, content_origin, source_name, source_url, reading_time)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    stableId, slug, v.title, v.summary, v.content, v.categoryId,
    cleanText(input.cover_image, 300) || null,
    STATUS.DRAFT, v.origin, v.sourceName || null, v.sourceUrl || null, readingTimeFor(v.content)
  );
  const id = Number(info.lastInsertRowid);
  replaceSources(db, id, input.sources);
  if (input.publish === true) publishArticle(db, id, actor);
  return adminArticle(db, id);
}

function updateArticle(db, id, input) {
  const existing = adminArticle(db, id);
  if (!existing) { const error = new Error('مقاله پیدا نشد'); error.statusCode = 404; throw error; }
  const merged = {
    ...existing,
    title: input.title !== undefined ? input.title : existing.title,
    summary: input.summary !== undefined ? input.summary : existing.summary,
    content: input.content !== undefined ? input.content : existing.content,
    category: input.category !== undefined ? (input.category || null) : existing.category_slug,
    content_origin: input.content_origin,
    source_name: input.source_name !== undefined ? input.source_name : existing.source_name,
    source_url: input.source_url !== undefined ? input.source_url : existing.source_url
  };
  const v = validateContent(db, merged);
  if (v.errors.length) { const error = new Error(v.errors[0]); error.validationErrors = v.errors; throw error; }
  const coverChanged = input.cover_image !== undefined;
  db.prepare(`
    UPDATE magazine_articles
    SET title=?, summary=?, content=?, category_id=?, cover_image=COALESCE(?, cover_image),
        content_origin=?, source_name=?, source_url=?, reading_time=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND deleted_at IS NULL
  `).run(
    v.title, v.summary, v.content, v.categoryId,
    coverChanged ? (cleanText(input.cover_image, 300) || null) : null,
    v.origin, v.sourceName || null, v.sourceUrl || null, readingTimeFor(v.content), id
  );
  if (input.sources !== undefined) replaceSources(db, id, input.sources);
  return adminArticle(db, id);
}

function transitionArticle(db, id, action, actor = 'coach') {
  const existing = adminArticle(db, id);
  if (!existing) { const error = new Error('مقاله پیدا نشد'); error.statusCode = 404; throw error; }
  const now = new Date().toISOString();
  const map = {
    to_review: { from: ['DRAFT', 'REJECTED'], to: STATUS.PENDING_REVIEW, sql: 'UPDATE magazine_articles SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL' },
    // to_draft doubles as "unpublish": PUBLISHED articles revert to draft so
    // the public site hides them immediately (published_at is preserved for
    // re-publish ordering and editorial history).
    to_draft: { from: ['PENDING_REVIEW', 'REJECTED', 'PUBLISHED'], to: STATUS.DRAFT, sql: 'UPDATE magazine_articles SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL' },
    reject: { from: ['DRAFT', 'PENDING_REVIEW'], to: STATUS.REJECTED, sql: 'UPDATE magazine_articles SET status=?, reviewed_at=?, reviewed_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL' },
    publish: { from: ['DRAFT', 'PENDING_REVIEW', 'REJECTED'], to: STATUS.PUBLISHED, sql: 'UPDATE magazine_articles SET status=?, published_at=COALESCE(published_at, ?), reviewed_at=?, reviewed_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL' }
  };
  const step = map[action];
  if (!step) { const error = new Error('عملیات نامعتبر است'); error.statusCode = 400; throw error; }
  if (!step.from.includes(existing.status)) { const error = new Error('این عمل برای وضعیت فعلی مقاله مجاز نیست'); error.statusCode = 409; throw error; }
  if (action === 'publish') {
    if (!existing.title || !existing.content.trim()) { const error = new Error('مقاله برای انتشار باید عنوان و متن داشته باشد'); error.statusCode = 400; throw error; }
    db.prepare(step.sql).run(step.to, now, now, actor, id);
  } else if (action === 'reject') {
    db.prepare(step.sql).run(step.to, now, actor, id);
  } else {
    db.prepare(step.sql).run(step.to, id);
  }
  return adminArticle(db, id);
}

function publishArticle(db, id, actor = 'coach') { return transitionArticle(db, id, 'publish', actor); }

function deleteArticle(db, id) {
  const info = db.prepare('UPDATE magazine_articles SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').run(id);
  if (!info.changes) { const error = new Error('مقاله پیدا نشد'); error.statusCode = 404; throw error; }
  return { id, soft_deleted: true };
}

function bulkArticles(db, { ids = [], action } = {}) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 100);
  if (!list.length) { const error = new Error('حداقل یک مقاله انتخاب کنید'); error.statusCode = 400; throw error; }
  if (!['publish', 'delete'].includes(action)) { const error = new Error('عملیات نامعتبر است'); error.statusCode = 400; throw error; }
  const marks = list.map(() => '?').join(',');
  let count = 0;
  if (action === 'delete') {
    count = db.prepare(`UPDATE magazine_articles SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks}) AND deleted_at IS NULL`).run(...list).changes;
  } else {
    count = db.prepare(`UPDATE magazine_articles SET status='PUBLISHED', published_at=COALESCE(published_at, CURRENT_TIMESTAMP), reviewed_at=CURRENT_TIMESTAMP, reviewed_by='coach', updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks}) AND deleted_at IS NULL AND title IS NOT NULL AND title<>'' AND content<>''`).run(...list).changes;
  }
  return { count, ids: list };
}

// ---------- Categories ----------

function listAdminCategories(db) {
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM magazine_articles a WHERE a.category_id=c.id AND a.deleted_at IS NULL) AS article_count
    FROM magazine_categories c ORDER BY c.sort_order, c.id
  `).all();
  return rows;
}

function categoryNameConflict(db, nameFa, excludeId = null) {
  const row = excludeId
    ? db.prepare(`SELECT id FROM magazine_categories WHERE name_fa=? AND deleted_at IS NULL AND id<>?`).get(nameFa, excludeId)
    : db.prepare(`SELECT id FROM magazine_categories WHERE name_fa=? AND deleted_at IS NULL`).get(nameFa);
  return Boolean(row);
}

function createCategory(db, input) {
  const nameFa = cleanText(input.name_fa, 80);
  if (!nameFa) { const error = new Error('نام دسته الزامی است'); error.statusCode = 400; throw error; }
  if (categoryNameConflict(db, nameFa)) { const error = new Error('دسته‌ای با این نام وجود دارد'); error.statusCode = 409; throw error; }
  const slug = uniqueCategorySlug(db, input.slug || nameFa);
  const info = db.prepare('INSERT INTO magazine_categories (stable_id, slug, name_fa, description, sort_order) VALUES (?,?,?,?,?)')
    .run(crypto.randomUUID(), slug, nameFa, cleanText(input.description, 300) || null, Number(input.sort_order) || 0);
  return db.prepare('SELECT * FROM magazine_categories WHERE id=?').get(Number(info.lastInsertRowid));
}

function uniqueCategorySlug(db, base) {
  const root = slugSafe(base) || 'category';
  let candidate = root;
  for (let i = 2; ; i++) {
    if (!db.prepare('SELECT id FROM magazine_categories WHERE slug=? AND deleted_at IS NULL').get(candidate)) return candidate;
    candidate = `${root}-${i}`;
  }
}

function updateCategory(db, id, input) {
  const existing = db.prepare('SELECT * FROM magazine_categories WHERE id=? AND deleted_at IS NULL').get(id);
  if (!existing) { const error = new Error('دسته پیدا نشد'); error.statusCode = 404; throw error; }
  const nameFa = input.name_fa !== undefined ? cleanText(input.name_fa, 80) : existing.name_fa;
  if (!nameFa) { const error = new Error('نام دسته الزامی است'); error.statusCode = 400; throw error; }
  if (categoryNameConflict(db, nameFa, existing.id)) { const error = new Error('دسته‌ای با این نام وجود دارد'); error.statusCode = 409; throw error; }
  db.prepare(`
    UPDATE magazine_categories
    SET name_fa=?, description=COALESCE(?, description), sort_order=?, is_active=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    nameFa,
    input.description !== undefined ? (cleanText(input.description, 300) || null) : null,
    Number(input.sort_order) || existing.sort_order || 0,
    input.is_active === undefined ? existing.is_active : (input.is_active ? 1 : 0),
    id
  );
  return db.prepare('SELECT * FROM magazine_categories WHERE id=?').get(id);
}

function deleteCategory(db, id) {
  const info = db.prepare('UPDATE magazine_categories SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL').run(id);
  if (!info.changes) { const error = new Error('دسته پیدا نشد'); error.statusCode = 404; throw error; }
  return { id, soft_deleted: true };
}

module.exports = {
  CATEGORIES,
  STATUS,
  ORIGINS,
  slugSafe,
  readingTimeFor,
  parseJsonArray,
  sanitizeRichText,
  listPublicCategories,
  listPublicArticles,
  listPublicSiteArticles,
  getPublicArticle,
  listAdminArticles,
  adminArticle,
  createArticle,
  updateArticle,
  transitionArticle,
  publishArticle,
  deleteArticle,
  bulkArticles,
  listAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory
};
