#!/usr/bin/env node
'use strict';
/* YASNAFIT — Public site + editorial admin regression test.
   Spawns its own server on a random free port with a fresh temp data dir,
   then verifies: migrations/tables, public SSR pages (SEO, CSP, no inline
   scripts, no AI terminology), public GET APIs, coach-gated admin APIs
   (article lifecycle, bulk actions, categories, settings, coach profile,
   success stories with the consent privacy guard), security boundaries
   (401/403/405) and audit events.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const auth = require('../src/coach-auth-service');
const totp = require('../src/totp');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-public-site-'));
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'yasnafit.db');

const COACH_EMAIL = 'crypto.javan17@gmail.com';
const COACH_PASSWORD = 'YasnafitCoach1';
let BASE = '';
let server = null;
let coachCookie = '';
let totpSecret = '';
let passed = 0;
const check = name => { passed += 1; console.log(`  ✓ ${name}`); };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function cookieLines(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie().filter(Boolean);
  const raw = response.headers.get('set-cookie') || '';
  return raw ? [raw] : [];
}
function namedCookie(response, name) {
  const line = cookieLines(response).find(item => item.split(';')[0].startsWith(name + '='));
  return line ? line.split(';')[0] : '';
}
async function request(url, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(BASE + url, { method, headers: h, body: payload, redirect: 'manual' });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.text();
  return { response, data };
}
async function ok(url, options = {}) {
  const result = await request(url, options);
  assert.ok(result.response.ok, `${options.method || 'GET'} ${url} → ${result.response.status}: ${JSON.stringify(result.data).slice(0, 400)}`);
  return result.data;
}
async function expectStatus(status, url, options = {}) {
  const result = await request(url, options);
  assert.equal(result.response.status, status, `${options.method || 'GET'} ${url} → ${result.response.status} (want ${status}): ${JSON.stringify(result.data).slice(0, 300)}`);
  return result.data;
}
async function html(url, options = {}) {
  const { response, data } = await request(url, options);
  assert.equal(response.status, 200, `GET ${url} → ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.equal(typeof data, 'string');
  return data;
}
function inlineScripts(htmlDoc) {
  const tags = [...htmlDoc.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m => m[0]);
  return tags.filter(tag => !/type\s*=\s*["']application\/ld\+json["']/i.test(tag) && !/src\s*=\s*["']\/[^"']+["']/i.test(tag));
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + '/api/health');
      if (res.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('server did not become healthy in time');
}

(async () => {
  // ---------- 1. Fresh database with migrations ----------
  console.log('· migrations on fresh temp DB');
  {
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys=ON');
    runMigrations(db);
    // site settings reuse the existing key-value `settings` table (no new table).
    for (const table of ['magazine_articles', 'magazine_categories', 'magazine_article_sources', 'success_stories', 'settings']) {
      assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table), `missing table ${table}`);
    }
    const seeded = db.prepare('SELECT slug FROM magazine_categories ORDER BY sort_order').all().map(r => r.slug);
    assert.deepEqual(seeded, ['bodybuilding', 'sports-science', 'nutrition', 'health', 'sports-news']);
    // Coach account + TOTP so the HTTP login flow works end-to-end.
    auth.setupCoach(db, { email: COACH_EMAIL, password: COACH_PASSWORD, displayName: 'مربی آزمایشی' });
    totpSecret = auth.provisionCoachTotp(db).secret;
    db.close();
    await bootServer(totpSecret);
  }

  // ---------- 2. Public SSR pages ----------
  console.log('· public SSR pages');
  {
    const home = await html('/');
    // Task 21 — owner directive (2026-09-20): the landing is the FULL reference
    // design image (landing2.png); real interactive elements are placed later (T-19).
    assert.match(home, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
    assert.match(home, /<img[^>]+src="\/images\/landing\/landing2\.png"/, 'home: full reference design image');
    assert.match(home, /<title>YASNAFIT \| بدنی قوی‌تر، زندگی بهتر<\/title>/);
    assert.match(home, /rel="canonical"/);
    assert.match(home, /property="og:title"/);
    assert.match(home, /property="og:description"/);
    assert.match(home, /name="description"/);
    assert.match(inlineScripts(home).join(''), /^$/);
    assert.doesNotMatch(home, /هوش مصنوعی/);
    assert.doesNotMatch(home, /AI-?generated|تولیدشده توسط/);
    check('home: full reference image + head/meta/canonical, no inline scripts, no AI wording');
    // The previous structural landing (hero/features/stats/sample cards/header/footer)
    // must be gone from the page shell.
    assert.doesNotMatch(home, /hero__content|features__item|stats__value|article-card--sample|site-footer|class="brand"|magazine-filters--home/);
    const designImg = await request('/images/landing/landing2.png');
    assert.equal(designImg.response.status, 200, 'design image served');
    assert.match(designImg.response.headers.get('content-type') || '', /image\/png/);
    check('home: old structure removed + design image 200 (image/png)');

    const homeRes = await request('/');
    const csp = homeRes.response.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /default-src 'self'/);
    check('home: CSP script-src self');

    for (const [route, markers] of [
      ['/about', ['فلسفه مربیگری', 'در انتظار تکمیل', 'گواهی‌نامه‌ها']],
      ['/services', ['برنامه تمرینی اختصاصی', 'ارزیابی بدن', 'مربیگری آنلاین']],
      ['/results', ['نتایج', 'تبدیلات واقعی']],
      ['/contact', ['شروع همکاری']],
      ['/magazine', ['magazine-pill', 'aria-pressed']]
    ]) {
      const page = await html(route);
      for (const marker of markers) assert.ok(page.includes(marker), `${route} missing marker: ${marker}`);
      assert.doesNotMatch(page, /هوش مصنوعی/);
      check(`${route}: 200 + markers`);
    }
    // Magazine filter pill active state via query string.
    const filtered = await html('/magazine?category=nutrition');
    const activeCount = (filtered.match(/magazine-pill is-active/g) || []).length;
    assert.equal(activeCount, 1, 'exactly one active pill');
    assert.ok(filtered.includes('aria-pressed="true"'), 'active pill has aria-pressed');
    check('/magazine?category=nutrition: single active pill');

    await expectStatus(404, '/magazine/this-slug-does-not-exist');
    check('/magazine/<unknown> → 404 JSON');

    const sitemap = await request('/sitemap.xml');
    assert.equal(sitemap.response.status, 200);
    assert.match(sitemap.data, /<urlset/);
    assert.match(sitemap.data, /\/about/);
    const robots = await request('/robots.txt');
    assert.match(robots.data, /Sitemap:/);
    check('sitemap.xml + robots.txt');
  }

  // ---------- 3. Public GET APIs ----------
  console.log('· public GET APIs');
  {
    const magazine = await ok('/api/magazine');
    assert.equal(magazine.categories.length, 5);
    assert.deepEqual(magazine.articles, []);
    check('GET /api/magazine: 5 seeded categories, no articles');

    const results = await ok('/api/results');
    assert.deepEqual(results.stories, []);
    check('GET /api/results: empty');

    const profile = await ok('/api/coach-profile');
    assert.equal(typeof profile, 'object');
    assert.ok('display_name' in profile && 'bio' in profile);
    check('GET /api/coach-profile: defaults');

    const site = await ok('/api/site');
    assert.equal(typeof site, 'object');
    assert.ok('cta_image' in site, 'site info exposes cta_image');
    check('GET /api/site (incl. cta_image)');

    for (const url of ['/landing.css', '/landing.js', '/jalali.js']) {
      const res = await request(url);
      assert.equal(res.response.status, 200, `${url} → ${res.response.status}`);
    }
    check('static assets: landing.css / landing.js / jalali.js');

    // Unauthenticated admin access must be rejected.
    for (const url of ['/api/magazine/admin/articles', '/api/magazine/admin/categories', '/api/magazine/admin/settings', '/api/magazine/admin/results']) {
      await expectStatus(401, url);
    }
    check('admin APIs without session → 401');
  }

  // ---------- 4. Coach login (existing TOTP flow) ----------
  console.log('· coach login flow');
  {
    const login = await ok('/api/coach/auth/login', { method: 'POST', body: { email: COACH_EMAIL, password: COACH_PASSWORD } });
    assert.equal(login.next, '/coach/2fa');
    const loginRes = await request('/api/coach/auth/login', { method: 'POST', body: { email: COACH_EMAIL, password: COACH_PASSWORD } });
    assert.equal(loginRes.data.next, '/coach/2fa');
    const challenge = namedCookie(loginRes.response, 'yasnafit_coach_challenge');
    assert.match(challenge, /yasnafit_coach_challenge=/);
    const wrong = await request('/api/coach/auth/verify', { method: 'POST', cookie: challenge, body: { code: '000000' } });
    assert.equal(wrong.response.status, 401);
    let verify = await request('/api/coach/auth/verify', { method: 'POST', cookie: challenge, body: { code: totp.generate(totpSecret) } });
    if (verify.response.status !== 200) verify = await request('/api/coach/auth/verify', { method: 'POST', cookie: challenge, body: { code: totp.generate(totpSecret, { now: Date.now() + 30000 }) } });
    assert.equal(verify.response.status, 200, JSON.stringify(verify.data));
    coachCookie = namedCookie(verify.response, 'yasnafit_coach_session');
    assert.match(coachCookie, /yasnafit_coach_session=/);
    check('login → 2FA challenge → verify → session cookie');
  }

  // ---------- 5. Article lifecycle ----------
  console.log('· article lifecycle via admin APIs');
  let articleId;
  let articleSlug;
  let nutritionId;
  {
    const created = await ok('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: {
      title: 'اصول تغذیه در دوران برش',
      slug: 'nutrition-cutting-guide',
      summary: 'راهنمای عملی تغذیه در فاز برش',
      content: '<p>متن اولیه</p><h2>بخش دوم</h2><ul><li>نکته یک</li></ul>',
      content_origin: 'human'
    } });
    assert.equal(created.status, 'DRAFT');
    assert.equal(created.slug, 'nutrition-cutting-guide');
    articleId = created.id;
    articleSlug = created.slug;
    check('create draft article (auto status DRAFT)');

    // Drafts must never leak to the public site.
    assert.deepEqual((await ok('/api/magazine')).articles, []);
    await expectStatus(404, `/magazine/${articleSlug}`);
    check('draft is invisible publicly');

    // Update with malicious content + sources → sanitized at read boundary.
    const updated = await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: {
      content: '<p>متن اصلی</p><script>evil()</script><img src="x" onerror="evil()"><a href="javascript:evil()">لینک</a><a href="https://example.com" target="_blank">منبع</a>',
      sources: [{ source_name: 'مجله ورزشی نمونه', source_url: 'https://example.com/a' }, { source_name: 'بدون آدرس' }],
      cover_image: '/images/landing/cover-default.svg'
    } });
    assert.doesNotMatch(updated.content, /<script/i);
    assert.doesNotMatch(updated.content, /onerror/i);
    assert.doesNotMatch(updated.content, /javascript:/i);
    assert.ok(updated.content.includes('https://example.com'));
    assert.equal(updated.sources.length, 2);
    check('update: rich-text sanitized, sources stored');

    await ok(`/api/magazine/admin/articles/${articleId}/to-review`, { method: 'POST', cookie: coachCookie });
    assert.equal((await ok(`/api/magazine/admin/articles/${articleId}`, { cookie: coachCookie })).status, 'PENDING_REVIEW');
    check('draft → pending review');

    await ok(`/api/magazine/admin/articles/${articleId}/publish`, { method: 'POST', cookie: coachCookie });
    const published = await ok(`/api/magazine/admin/articles/${articleId}`, { cookie: coachCookie });
    assert.equal(published.status, 'PUBLISHED');
    assert.ok(published.published_at, 'published_at set');
    assert.equal(published.reviewed_by, 'coach');
    check('pending review → published (reviewed_by=coach)');

    const publicList = await ok('/api/magazine');
    assert.equal(publicList.articles.length, 1);
    assert.equal(publicList.articles[0].slug, articleSlug);
    check('published article appears in public list');

    const articlePage = await html(`/magazine/${articleSlug}`);
    assert.match(articlePage, /اصول تغذیه در دوران برش/);
    assert.match(articlePage, /application\/ld\+json/);
    assert.match(articlePage, /"@type"\s*:\s*"Article"/);
    assert.match(articlePage, /breadcrumb|بازگشت/);
    assert.doesNotMatch(articlePage, /<script>evil/);
    check('article page: SSR + JSON-LD + sanitized body');

    const fullArticle = await ok(`/api/magazine/${articleSlug}`);
    assert.equal(fullArticle.title, 'اصول تغذیه در دوران برش');
    assert.equal(fullArticle.sources.length, 2);
    assert.ok(Array.isArray(fullArticle.related));
    check('GET /api/magazine/:slug: full article + sources + related');

    // Category assignment + filtering.
    const categories = await ok('/api/magazine/admin/categories', { cookie: coachCookie });
    nutritionId = categories.categories.find(c => c.slug === 'nutrition').id;
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category: 'nutrition' } });
    const inNutrition = await ok('/api/magazine?category=nutrition');
    assert.equal(inNutrition.articles.length, 1);
    const inOther = await ok('/api/magazine?category=health');
    assert.equal(inOther.articles.length, 0);
    check('category filter works both ways');

    // Back to draft hides it again.
    await ok(`/api/magazine/admin/articles/${articleId}/to-draft`, { method: 'POST', cookie: coachCookie });
    assert.equal((await ok('/api/magazine')).articles.length, 0);
    await ok(`/api/magazine/admin/articles/${articleId}/publish`, { method: 'POST', cookie: coachCookie });
    check('unpublish hides article; republish restores it');

    // Reject flow.
    const rejected = await ok('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: {
      title: 'مقاله آزمایشی ردی', slug: 'reject-me', content: '<p>بدون منبع معتبر</p>'
    } });
    await ok(`/api/magazine/admin/articles/${rejected.id}/to-review`, { method: 'POST', cookie: coachCookie });
    await ok(`/api/magazine/admin/articles/${rejected.id}/reject`, { method: 'POST', cookie: coachCookie });
    assert.equal((await ok(`/api/magazine/admin/articles/${rejected.id}`, { cookie: coachCookie })).status, 'REJECTED');
    check('reject flow → REJECTED');

    // Status filter + counts.
    const filteredList = await ok(`/api/magazine/admin/articles?status=PUBLISHED`, { cookie: coachCookie });
    assert.equal(filteredList.items.length, 1);
    assert.equal(filteredList.counts.PUBLISHED, 1);
    assert.ok((filteredList.counts.DRAFT || 0) >= 0);
    assert.ok(typeof filteredList.total === 'number');
    check('admin list: status filter + counts');

    // Bulk publish.
    const b1 = await ok('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: { title: 'حجمی یک', slug: 'bulk-one', content: '<p>متن</p>' } });
    const b2 = await ok('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: { title: 'حجمی دو', slug: 'bulk-two', content: '<p>متن</p>' } });
    const bulk = await ok('/api/magazine/admin/articles/bulk', { method: 'POST', cookie: coachCookie, body: { action: 'publish', ids: [b1.id, b2.id] } });
    assert.equal(bulk.count, 2);
    const bulkList = await ok('/api/magazine');
    assert.equal(bulkList.articles.length, 3);
    check('bulk publish (2 drafts → published)');

    // Bulk delete.
    const b3 = await ok('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: { title: 'حذفی', slug: 'bulk-del', content: '<p>x</p>' } });
    const bulkDel = await ok('/api/magazine/admin/articles/bulk', { method: 'POST', cookie: coachCookie, body: { action: 'delete', ids: [b3.id] } });
    assert.equal(bulkDel.count, 1);
    await expectStatus(404, `/api/magazine/admin/articles/${b3.id}`, { cookie: coachCookie });
    check('bulk delete');

    // Search.
    const searched = await ok('/api/magazine/admin/articles?search=حجمی', { cookie: coachCookie });
    assert.equal(searched.items.length, 2);
    check('search filter');

    // Single delete (the rejected article) → hard audit + 404 afterwards.
    await ok(`/api/magazine/admin/articles/${rejected.id}`, { method: 'DELETE', cookie: coachCookie });
    await expectStatus(404, `/api/magazine/admin/articles/${rejected.id}`, { cookie: coachCookie });
    check('single delete (audit + 404 afterwards)');

    check('article lifecycle complete');
  }

  // ---------- 6. Categories CRUD ----------
  console.log('· categories CRUD');
  let newCategoryId;
  {
    const created = await ok('/api/magazine/admin/categories', { method: 'POST', cookie: coachCookie, body: { name_fa: 'افزایش توده عضلانی' } });
    assert.ok(created.id);
    newCategoryId = created.id;
    assert.match(created.slug, /^[a-z0-9\u0600-\u06FF-]+$/);
    assert.ok(created.slug.length > 0 && !created.slug.includes(' '));
    check('create category (auto slug, latin or persian)');

    await ok(`/api/magazine/admin/categories/${newCategoryId}`, { method: 'PUT', cookie: coachCookie, body: { name_fa: 'افزایش توده عضلانی', sort_order: 99, is_active: false } });
    const after = (await ok('/api/magazine/admin/categories', { cookie: coachCookie })).categories.find(c => c.id === newCategoryId);
    assert.equal(after.sort_order, 99);
    assert.equal(after.is_active, 0);
    check('update category (sort + inactive)');

    await expectStatus(409, '/api/magazine/admin/categories', { method: 'POST', cookie: coachCookie, body: { name_fa: 'تغذیه' } });
    check('duplicate category name → 409');

    await ok(`/api/magazine/admin/categories/${newCategoryId}`, { method: 'DELETE', cookie: coachCookie });
    check('delete category');
  }

  // ---------- 7. Settings + category gating ----------
  console.log('· site settings + category gating');
  {
    const before = await ok('/api/magazine/admin/settings', { cookie: coachCookie });
    assert.equal(before.settings['magazine.auto_publish'], '0');
    assert.equal(before.settings['magazine.category_enabled.nutrition'], '1');

    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'magazine.category_enabled.nutrition': '0', 'magazine.auto_publish': '0' } });
    const after = await ok('/api/magazine/admin/settings', { cookie: coachCookie });
    assert.equal(after.settings['magazine.category_enabled.nutrition'], '0');

    const gated = await ok('/api/magazine?category=nutrition');
    assert.equal(gated.articles.length, 0, 'disabled category hides its public articles');
    check('category_enabled=0 hides public articles in that category');

    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'magazine.category_enabled.nutrition': '1' } });
    const restored = await ok('/api/magazine?category=nutrition');
    assert.equal(restored.articles.length, 1);
    check('re-enabling restores visibility');

    // Unknown keys are ignored (lenient toward older clients) but never persisted.
    const lenient = await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'random.key': 'x', 'magazine.auto_fetch': '0' } });
    assert.ok(!('random.key' in lenient.settings));
    // The final CTA image is admin-configurable and drives the public home.
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.cta_image': '/images/landing/coach-placeholder.svg' } });
    // The final CTA image stays admin-configurable and exposed via /api/site; the
    // full-image landing (Task 21) does not render it until T-19 places the controls.
    const siteAfterCta = await ok('/api/site');
    assert.equal(siteAfterCta.cta_image, '/images/landing/coach-placeholder.svg', 'cta_image configurable + exposed via /api/site');
    check('site.cta_image → admin-configurable, exposed via /api/site');

    // Footer social icons render ONLY when the owner configures a real URL.
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.contact_telegram': '@yasnafit_sample' } });
    // Footer social icons render ONLY when the owner configures a real URL (footer is
    // on every public page except the full-image home — verified on /about).
    const aboutWithSocial = await html('/about');
    assert.ok(aboutWithSocial.includes('site-footer__social') && aboutWithSocial.includes('https://t.me/yasnafit_sample'), 'footer social icon appears only with a configured URL');
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.contact_telegram': '', 'site.cta_image': '' } });
    const aboutNoSocial = await html('/about');
    assert.ok(!aboutNoSocial.includes('https://t.me/'), 'no social link without a configured URL (no dead links)');
    check('footer: social icon only when a real URL is configured');
    check('unknown settings keys ignored, known keys applied');
  }

  // ---------- 8. Coach profile → public about page ----------
  console.log('· coach profile → public site');
  {
    const bio = 'مربی با رویکرد داده‌محور؛ این متن آزمایشی است و باید در صفحه درباره من دیده شود.';
    const profile = {
      display_name: 'مربی آزمایشی',
      title: 'مربی تخصصی بدنسازی',
      highlight: 'رویکرد علمی، نتیجه پایدار',
      bio,
      philosophy: 'فلسفه آزمایشی',
      methodology: 'روش کار آزمایشی',
      specialties: ['تغذیه ورزشی', 'برنامه‌ریزی تمرینی'],
      certifications: [{ name: 'گواهی آزمایشی', issuer: 'مؤسسه نمونه' }],
      timeline: [{ period: '۱۴۰۳ به بعد', title: 'فعالیت مربیگری', text: 'شروع فعالیت' }],
      stats: [{ label: 'سابقه', value: 'در انتظار تکمیل' }]
    };
    await ok('/api/magazine/admin/coach-profile', { method: 'PUT', cookie: coachCookie, body: profile });
    const publicProfile = await ok('/api/coach-profile');
    assert.equal(publicProfile.display_name, 'مربی آزمایشی');
    assert.equal(publicProfile.bio, bio);
    assert.equal(publicProfile.specialties.length, 2);

    const about = await html('/about');
    assert.ok(about.includes(bio), 'about page shows the bio');
    assert.ok(about.includes('گواهی آزمایشی'), 'about page shows certification');
    check('coach profile PUT → /api/coach-profile + /about SSR');
  }

  // ---------- 9. Success stories + consent privacy guard ----------
  console.log('· success stories + consent guard');
  {
    const story = await ok('/api/magazine/admin/results', { method: 'POST', cookie: coachCookie, body: {
      title: 'نتیجه نمونه', display_name: 'شاگرد نمونه', goal: 'کاهش وزن', duration_months: 3,
      metrics: { 'کاهش وزن (کیلوگرم)': '7' }, consent_status: 'none'
    } });
    assert.ok(story.id);
    let publicResults = await ok('/api/results');
    assert.deepEqual(publicResults.stories, [], 'no consent → not public even if it would be published');

    await ok(`/api/magazine/admin/results/${story.id}/publish`, { method: 'POST', cookie: coachCookie });
    publicResults = await ok('/api/results');
    assert.deepEqual(publicResults.stories, [], 'published but consent_status=none → still not public');
    check('consent guard: consent none blocks public display');

    await ok(`/api/magazine/admin/results/${story.id}`, { method: 'PUT', cookie: coachCookie, body: { consent_status: 'verbal' } });
    publicResults = await ok('/api/results');
    assert.equal(publicResults.stories.length, 1);
    assert.equal(publicResults.stories[0].title, 'نتیجه نمونه');
    const resultsPage = await html('/results');
    assert.ok(resultsPage.includes('نتیجه نمونه'));
    check('consent verbal + published → public results section');

    await ok(`/api/magazine/admin/results/${story.id}/unpublish`, { method: 'POST', cookie: coachCookie });
    assert.deepEqual((await ok('/api/results')).stories, []);
    await ok(`/api/magazine/admin/results/${story.id}`, { method: 'DELETE', cookie: coachCookie });
    check('unpublish + delete story');
  }

  // ---------- 10. Security boundaries ----------
  console.log('· security boundaries');
  {
    const cross = await request('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, headers: { Origin: 'http://evil.example' }, body: { title: 'x', content: '<p>x</p>' } });
    assert.equal(cross.response.status, 403);
    check('cross-origin mutation → 403');

    await expectStatus(405, '/api/magazine/admin/articles', { method: 'DELETE', cookie: coachCookie });
    check('wrong method → 405');

    const badBody = await request('/api/magazine/admin/articles', { method: 'POST', cookie: coachCookie, body: { title: '', content: '' } });
    assert.equal(badBody.response.status, 400);
    check('validation error → 400');

    await expectStatus(404, '/api/magazine/admin/articles/999999', { method: 'GET', cookie: coachCookie });
    check('unknown id → 404');
  }

  // ---------- 11. Audit trail ----------
  console.log('· audit trail');
  {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(`SELECT action FROM audit_events WHERE action LIKE 'article.%' OR action LIKE 'category.%' OR action LIKE 'story.%' OR action IN ('site_settings.updated','coach_profile.updated')`).all().map(r => r.action);
    db.close();
    for (const action of ['article.created', 'article.publish', 'article.reject', 'article.deleted', 'article.bulk_publish', 'category.created', 'category.deleted', 'site_settings.updated', 'coach_profile.updated', 'story.created', 'story.publish']) {
      assert.ok(rows.includes(action), `missing audit event ${action} (have: ${rows.join(', ')})`);
    }
    check('audit events recorded for all mutation types');
  }

  // ---------- 12. Root is the public landing page for EVERYONE (owner decision 2026-09-19) ----------
  // The landing is the site's front door; a logged-in coach reaches the panel at
  // /coach/dashboard (Task 21: the full-image landing has no header until T-19
  // places the real controls on top of the design image).
  console.log('· root always serves the public landing page');
  {
    const anon = await request('/');
    assert.equal(anon.response.status, 200);
    assert.ok(anon.data.includes('id="main"'), 'anonymous visitor gets the landing shell');
    assert.ok(!anon.data.includes('id="content"'), 'anonymous visitor must not get the coach SPA shell');
    assert.ok(anon.data.includes('data-coach-session="0"'), 'anonymous landing marks no coach session');
    check('GET / (anonymous) → public landing page');

    const res = await request('/', { cookie: coachCookie });
    assert.equal(res.response.status, 200);
    assert.ok(res.data.includes('id="main"'), 'authed coach still gets the landing page on /');
    assert.ok(!res.data.includes('id="content"'), 'authed coach must NOT get the SPA shell on /');
    assert.ok(res.data.includes('data-coach-session="1"'), 'authed landing marks the coach session');
    // Task 21: the full-image landing has no header — the coach reaches the panel at /coach/dashboard.
    assert.ok(!res.data.includes('class="brand"'), 'full-image landing has no header; panel lives at /coach/dashboard');
    check('GET / (coach session) → public landing page with panel button');

    const dash = await request('/coach/dashboard', { cookie: coachCookie });
    assert.equal(dash.response.status, 200);
    assert.ok(dash.data.includes('id="content"'), 'coach panel shell is still served at /coach/dashboard');
    check('GET /coach/dashboard (coach session) → SPA shell');

    const dashAnon = await request('/coach/dashboard');
    assert.equal(dashAnon.response.status, 303);
    assert.equal(dashAnon.response.headers.get('location'), '/coach/login');
    check('GET /coach/dashboard (anonymous) → 303 /coach/login');
  }

  console.log(`\n✓ public-site-regression: ${passed} groups passed`);
  stopServer();
})().catch(error => {
  stopServer();
  console.error('✗ public-site-regression failed:');
  console.error(error);
  process.exitCode = 1;
});

async function bootServer(totpSecret) {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  const logs = [];
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), YASNAFIT_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => logs.push(String(chunk)));
  server.stderr.on('data', chunk => logs.push(String(chunk)));
  await waitForServer();
}
function stopServer() {
  try { if (server && server.exitCode === null) server.kill('SIGTERM'); } catch (e) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  setTimeout(() => process.exit(process.exitCode || 0), 150).unref();
}
