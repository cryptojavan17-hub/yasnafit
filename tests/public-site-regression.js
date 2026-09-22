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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-public-site-'));
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'yasnafit.db');

const COACH_EMAIL = 'mehdi.javan.64@gmail.com'; // locked owner email (single-step coach login since the 01a085de merge)
const COACH_PASSWORD = 'YasnafitCoach1';
let BASE = '';
let server = null;
let coachCookie = '';
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
    // Coach account so the HTTP login flow works end-to-end (email + password, no 2FA step).
    auth.setupCoach(db, { email: COACH_EMAIL, password: COACH_PASSWORD, displayName: 'مربی آزمایشی' });
    db.close();
    await bootServer();
  }

  // ---------- 2. Public SSR pages ----------
  console.log('· public SSR pages');
  {
    // Owner decision 2026-09-21 (final): the new landing is the home page on «/».
    const home = await html('/');
    // Task 25 (PART 1 of 4 — FINAL per owner 2026-09-20): the hero is the
    // owner's Hero.png shown in FULL (no crop, no gap, no deletion, no
    // duplicated HTML text).
    assert.match(home, /<html[^>]+lang="fa"[^>]+dir="rtl"/);
    assert.match(home, /class="home-hero"/, 'home: hero section present');
    assert.match(home, /src="\/images\/landing\/hero\.png"/, 'home: hero = owner Hero.png in FULL');
    assert.doesNotMatch(home, /hero-photo|landing2\.png/, 'home: no cropped/old images referenced');
    assert.doesNotMatch(home, /home-hero__logo|home-hero__title|home-hero__lead/, 'home: no duplicated HTML text (text is part of the image)');
    assert.match(home, /<title>YASNAFIT \| بدنی قوی‌تر، زندگی بهتر<\/title>/);
    assert.match(home, /rel="canonical"/);
    assert.match(home, /property="og:title"/);
    assert.match(home, /property="og:description"/);
    assert.match(home, /name="description"/);
    assert.match(inlineScripts(home).join(''), /^$/);
    assert.doesNotMatch(home, /هوش مصنوعی/);
    assert.doesNotMatch(home, /AI-?generated|تولیدشده توسط/);
    check('home: hero = full owner image + head/meta/canonical, no crops/old images, no inline scripts, no AI wording');
    // Owner header spec (T-19 round 1): exactly these five links + ثبت نام + ورود buttons.
    assert.match(home, /class="brand"/, 'header: brand present');
    for (const nav of ['/', '/about', '/services', '/magazine', '/results']) {
      assert.ok(home.includes(`data-nav="${nav}"`), `header nav link ${nav}`);
    }
    assert.ok(home.includes('href="/student/register"'), 'header: ثبت نام button → /student/register');
    assert.ok(home.includes('href="/student/login"'), 'header: ورود button uses the existing student login flow');
    check('home: owner header (5 links + ثبت نام/ورود)');
    // Owner spec 2026-09-21 — the guest «ربات تلگرام» control is a plain deep
    // link to the bot (new tab, noopener). It asks for nothing and stores
    // nothing: the username form + its public write endpoint are gone, so no
    // typed username can be mistaken for a verified connection.
    const BOT_URL = 'https://t.me/yasnafitbot?start=landing';
    assert.ok(home.includes(`href="${BOT_URL}"`), 'header: ربات تلگرام اتصال ساده به t.me/yasnafitbot?start=landing');
    assert.match(home, /<a[^>]*class="btn btn--ghost btn--sm"[^>]*href="https:\/\/t\.me\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/, 'header: telegram link opens in a new tab safely');
    assert.match(home, />ربات تلگرام</, 'header: telegram control keeps its label');
    assert.doesNotMatch(home, /data-telegram-bot|t\.me\/yasnafitbot"|telegramDialog/, 'header: no telegram modal / no bare bot link');
    // Prominent invitation at the end of the landing (owner: header + CTA band).
    const ctaBand = home.match(/<section class="telegram-cta"[\s\S]*?<\/section>/);
    assert.ok(ctaBand, 'home: telegram CTA band present');
    assert.ok(ctaBand[0].includes(`href="${BOT_URL}"`), 'CTA band: same deep link');
    assert.match(ctaBand[0], /اتصال به ربات تلگرام/, 'CTA band: clear button text');
    assert.match(ctaBand[0], /href="\/student\/register"/, 'CTA band: sign-up path kept next to the bot link');
    const landingJs = await request('/landing.js');
    assert.equal(landingJs.response.status, 200);
    assert.doesNotMatch(landingJs.data, /tg-dialog|telegram-bot|openTelegramDialog/, 'landing.js: telegram modal + removed endpoint calls gone');
    // The old public endpoints are gone: an unknown /api path falls through to
    // the coach gate (401), so nothing public accepts a Telegram username.
    await expectStatus(401, '/api/telegram-bot');
    await expectStatus(401, '/api/telegram-bot/connect', { method: 'POST', body: { telegram_id: '@yasnafit_smoke' } });
    // Nothing is written by the public path: the table is untouched by the page.
    {
      const readonly = new DatabaseSync(dbPath, { readOnly: true });
      assert.equal(readonly.prepare('SELECT COUNT(*) n FROM telegram_bot_connections').get().n, 0, 'no telegram connection rows written from the public site');
      readonly.close();
    }
    check('home: ربات تلگرام = deep link (header + CTA band), public write endpoints removed');
    // The previous structural landing AND the full-image landing must be gone;
    // home now uses the same header + footer shell as the other public pages.
    assert.doesNotMatch(home, /hero__content|features__item|article-card--sample|landing-full|home-placeholder/);
    // Task 25 (PART 3): magazine + stats section below the about section — the
    // real article system (published articles only, no invented content), the
    // owner's exact pill list, and the owner-provided stats numbers.
    assert.match(home, /<section class="magazine magazine--home"/, 'home: magazine section below about');
    assert.match(home, /<p class="section-eyebrow">YASNAFIT MAGAZINE<\/p>/, 'home magazine: title YASNAFIT MAGAZINE');
    assert.match(home, /<h2 class="magazine--home__title">علم، ورزش و سبک زندگی<\/h2>/, 'home magazine: subtitle');
    for (const [slug, label] of [['', 'همه'], ['bodybuilding', 'بدنسازی'], ['sports-science', 'علم ورزش'], ['nutrition', 'تغذیه'], ['health', 'سلامت']]) {
      assert.ok(home.includes(`data-category="${slug}"`), `home magazine pill: ${label}`);
    }
    assert.ok(home.includes('aria-pressed="true"'), 'home magazine: همه pill active by default');
    assert.match(home, /id="magazineHomeGrid"/, 'home magazine: article grid present');
    assert.match(home, /هنوز مقاله‌ای منتشر نشده است/, 'home magazine: clean empty state (no invented articles)');
    assert.match(home, /<section class="stats" aria-label="آمار YASNAFIT">/, 'home: stats row present');
    const faDigits = n => String(n).replace(/[0-9]/g, d => String.fromCodePoint(0x06F0 + +d));
    if (faDigits("0123456789") !== String.fromCodePoint(0x06F0,0x06F1,0x06F2,0x06F3,0x06F4,0x06F5,0x06F6,0x06F7,0x06F8,0x06F9)) throw new Error("faDigits map broken");
    const statsBlock = home.split('<div class="stats__inner">')[1] || '';
    assert.equal((statsBlock.match(/class="stats__item"/g) || []).length, 4, 'home: four stats items');
    for (const label of ['شاگرد موفق', 'سال تجربه', 'برنامه اختصاصی', 'رضایت شاگردان']) assert.ok(statsBlock.includes(label), `home stats label: ${label}`);
    for (const value of [faDigits('500+'), faDigits('17+'), faDigits('120+'), faDigits('98') + '٪']) assert.ok(statsBlock.includes(value), `home stats value: ${value}`);
    assert.match(home, /class="site-footer"/, 'home: footer shell like the other public pages');
    const heroImg = await request('/images/landing/hero.jpg');
    assert.equal(heroImg.response.status, 200, 'full hero image served');
    assert.match(heroImg.response.headers.get('content-type') || '', /image\/jpeg/);
    const oldCrop = await request('/images/landing/hero-photo.png');
    assert.equal(oldCrop.response.status, 404, 'cropped photo no longer served');
    const designImg = await request('/images/landing/landing2.png');
    assert.equal(designImg.response.status, 404, 'old design image no longer served');
    check('home: old structures removed, footer present, full hero image 200 (png), crops 404');
    // Task 25 (PART 2): the About Me section sits below the hero — the owner's
    // About Me.png served complete (no crop, no HTML text duplication), same
    // sizing rule as the hero image.
    assert.match(home, /<section id="about" class="home-about">/, 'about section present below the hero');
    assert.match(home, /class="home-about__img" src="\/images\/landing\/about-me\.jpg"/, 'about section uses the full About Me image');
    const aboutImg = await request('/images/landing/about-me.jpg');
    assert.equal(aboutImg.response.status, 200, 'about image served');
    assert.match(aboutImg.response.headers.get('content-type') || '', /image\/jpeg/);
    assert.doesNotMatch(home, /hero-woman|cta-woman|about-woman/, 'home: no orphaned placeholder photos referenced');
    check('home: about section = full About Me.png below the hero');

    const homeRes = await request('/');
    const csp = homeRes.response.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /default-src 'self'/);
    check('home: CSP script-src self');

    for (const [route, markers] of [
      ['/about', ['home-about', 'about-me.jpg']],
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

    // PART 2 (owner clarification): /about is the NEW about page — the full
    // About Me.png reference below the shared header; ALL old page content
    // (فلسفه مربیگری / در انتظار تکمیل / گواهی‌نامه‌ها) must be gone.
    const aboutPage = await html('/about');
    assert.match(aboutPage, /<section id="about" class="home-about">/, '/about: new about section rendered');
    assert.match(aboutPage, /class="home-about__img" src="\/images\/landing\/about-me\.png"/, '/about: full About Me.png used');
    assert.doesNotMatch(aboutPage, /فلسفه مربیگری|در انتظار تکمیل|گواهی‌نامه|about-page|about-block/, '/about: no old page content');
    check('/about: new page = full About Me.png, all old content gone');

    const sitemap = await request('/sitemap.xml');
    assert.equal(sitemap.response.status, 200);
    assert.match(sitemap.data, /<urlset/);
    assert.match(sitemap.data, /\/about/);
    assert.doesNotMatch(sitemap.data, /<loc>[^<]*\/home<\/loc>/, 'sitemap must not list the retired /home alias');
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

  // ---------- 4. Coach login (single-step: email + password) ----------
  console.log('· coach login flow');
  {
    const wrong = await request('/api/coach/auth/login', { method: 'POST', body: { email: COACH_EMAIL, password: 'WrongPass1' } });
    assert.equal(wrong.response.status, 401);
    const loginRes = await request('/api/coach/auth/login', { method: 'POST', body: { email: COACH_EMAIL, password: COACH_PASSWORD } });
    assert.equal(loginRes.response.status, 200, JSON.stringify(loginRes.data));
    assert.equal(loginRes.data.next, '/coach/dashboard');
    coachCookie = namedCookie(loginRes.response, 'yasnafit_coach_session');
    assert.match(coachCookie, /yasnafit_coach_session=/);
    check('login (email + password) → session cookie');
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
    assert.equal(fullArticle.sources, undefined);
    assert.equal(fullArticle.source_url, undefined);
    assert.equal(publicList.articles[0].source_name, undefined);
    assert.doesNotMatch(articlePage, /article-sources/);
    assert.ok(Array.isArray(fullArticle.related));
    check('GET /api/magazine/:slug: editor body + related, source metadata admin-only');

    // Old stored auto-referral disappears immediately without a destructive migration.
    const legacyBody = '<p>متن کامل نوشته‌شده توسط مربی در همین سایت</p><p><a href="https://publisher.example/original">مطالعهٔ کامل مطلب در منبع اصلی</a></p><h2>بخش پایانی متن مربی</h2>';
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { content: legacyBody } });
    const legacyPublic = await ok(`/api/magazine/${articleSlug}`);
    assert.match(legacyPublic.content, /متن کامل نوشته‌شده توسط مربی/);
    assert.match(legacyPublic.content, /بخش پایانی متن مربی/);
    assert.doesNotMatch(legacyPublic.content, /publisher\.example|منبع اصلی/);
    const legacyPage = await html(`/magazine/${articleSlug}`);
    assert.doesNotMatch(legacyPage, /publisher\.example|منبع اصلی|article-sources/);
    const legacyAdmin = await ok(`/api/magazine/admin/articles/${articleId}`, { cookie: coachCookie });
    assert.match(legacyAdmin.content, /publisher\.example/);
    assert.equal(legacyAdmin.sources.length, 2);
    const listing = await html('/magazine');
    assert.match(listing, /مطالعه کامل مطلب/);
    assert.ok(listing.includes(`/magazine/${articleSlug}`));
    // Older sanitizer dropped closing anchor tags; those persisted bodies also work.
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { content: legacyBody.replace('</a>', '') } });
    assert.doesNotMatch((await ok(`/api/magazine/${articleSlug}`)).content, /publisher\.example|منبع اصلی/);
    check('internal full-article CTA, editor text preserved, legacy source CTA hidden without deleting admin provenance');

    // Category assignment + filtering.
    const categories = await ok('/api/magazine/admin/categories', { cookie: coachCookie });
    nutritionId = categories.categories.find(c => c.slug === 'nutrition').id;
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category: 'nutrition' } });
    const inNutrition = await ok('/api/magazine?category=nutrition');
    assert.equal(inNutrition.articles.length, 1);
    const inOther = await ok('/api/magazine?category=health');
    assert.equal(inOther.articles.length, 0);
    check('category filter works both ways');
    const healthId = categories.categories.find(c => c.slug === 'health').id;
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category_id: healthId, content_origin: 'imported', cover_image: 'https://example.com/editor-cover.jpg' } });
    const movedCategory = await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category_id: nutritionId } });
    assert.equal(movedCategory.category_id, nutritionId);
    assert.equal(movedCategory.content_origin, 'imported');
    assert.equal(movedCategory.cover_image, 'https://example.com/editor-cover.jpg');
    assert.match(movedCategory.content, /متن کامل نوشته‌شده توسط مربی/);
    const clearedFields = await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category_id: null, cover_image: '' } });
    assert.equal(clearedFields.category_id, null);
    assert.equal(clearedFields.cover_image, null);
    assert.equal(clearedFields.content_origin, 'imported');
    assert.equal(clearedFields.sources.length, 2);
    await ok(`/api/magazine/admin/articles/${articleId}`, { method: 'PUT', cookie: coachCookie, body: { category: 'nutrition' } });
    assert.equal((await ok(`/api/magazine/admin/articles/${articleId}`, { cookie: coachCookie })).category_id, nutritionId);
    check('editor category ID/slug/clear and cover clear work; partial edit preserves body, origin and references');


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
    // Footer social icons render ONLY when the owner configures a real URL (footer
    // is on every public page — verified on /services).
    // The check is scoped to the footer social block: the guest header carries
    // the (always-on) «ربات تلگرام» deep link, which is not an owner social link.
    const footerSocial = doc => (doc.match(/<div class="site-footer__social"[\s\S]*?<\/div>/) || [''])[0];
    const servicesWithSocial = await html('/services');
    assert.ok(servicesWithSocial.includes('site-footer__social') && footerSocial(servicesWithSocial).includes('https://t.me/yasnafit_sample'), 'footer social icon appears only with a configured URL');
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.contact_telegram': '', 'site.cta_image': '' } });
    const servicesNoSocial = await html('/services');
    assert.ok(!footerSocial(servicesNoSocial).includes('https://t.me/'), 'no social link without a configured URL (no dead links)');
    check('footer: social icon only when a real URL is configured');
    // The landing bot link follows «تنظیمات سایت → ربات تلگرام» when a real bot
    // username is saved, and falls back to the default bot otherwise — the
    // button must never point at a broken/missing target (owner spec 2026-09-21).
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.telegram_bot_username': '@yasnafit_smoke_bot' } });
    assert.ok((await html('/')).includes('href="https://t.me/yasnafit_smoke_bot?start=landing"'), 'coach-configured bot username drives the landing link');
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.telegram_bot_username': 'not a bot/url' } });
    assert.ok((await html('/')).includes('href="https://t.me/yasnafitbot?start=landing"'), 'invalid stored username falls back to the default bot');
    await ok('/api/magazine/admin/settings', { method: 'PUT', cookie: coachCookie, body: { 'site.telegram_bot_username': '' } });
    check('landing bot link: configured username honoured, invalid value falls back to @yasnafitbot');
    check('unknown settings keys ignored, known keys applied');
  }

  // ---------- 8. Coach profile → public site (old /about SSR removed) ----------
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

    // The old /about SSR page is gone: /about now renders the new static
    // about page (full About Me.png) and must not show free-text profile data.
    const aboutAfter = await html('/about');
    assert.ok(!aboutAfter.includes(bio), 'new /about page does not render free-text profile data');
    check('coach profile PUT → /api/coach-profile (new /about is the static reference page)');
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

  // ---------- 12. Root = the new landing for EVERYONE (owner decision 2026-09-21, final) ----------
  // «/» serves the SSR landing (anonymous visitor and logged-in coach alike; the coach
  // panel is reached from the header «پنل مربی» button, anonymous coaches from the footer
  // «ورود مربی» link). /home and /index.html were short-lived aliases → 301 to «/».
  // The student login/register shell stays on /student/login with its «معرفی یسنا فیت» link.
  console.log('· root = public landing (aliases redirect)');
  {
    const anon = await request('/');
    assert.equal(anon.response.status, 200);
    assert.ok(anon.data.includes('id="main"') && anon.data.includes('class="home-hero"'), 'anonymous visitor gets the landing on /');
    assert.ok(!anon.data.includes('id="content"'), 'anonymous visitor must not get the coach SPA shell');
    assert.ok(!anon.data.includes('student-app.js'), 'the student shell is not served on / any more');
    assert.ok(anon.data.includes('data-coach-session="0"'), 'anonymous landing marks no coach session');
    assert.ok(anon.data.includes('class="site-footer__coach" href="/coach/login"'), 'landing footer offers a discreet coach login link');
    check('GET / (anonymous) → public landing page + footer coach link');

    for (const alias of ['/home', '/index.html', '/home?utm=x']) {
      const res = await request(alias);
      assert.equal(res.response.status, 301, `${alias} must redirect permanently`);
      assert.equal(res.response.headers.get('location'), alias.includes('?') ? '/?utm=x' : '/', `${alias} → /`);
    }
    check('/home and /index.html → 301 /');

    const login = await request('/student/login');
    assert.equal(login.response.status, 200);
    assert.ok(login.data.includes('student-app.js'), 'student shell lives on /student/login');
    const studentApp = fs.readFileSync(path.join(__dirname, '..', 'public', 'student-app.js'), 'utf8');
    assert.match(studentApp, /entry-site-link" href="\/">معرفی یسنا فیت<\/a>/, 'the entry page links back to the landing on /');
    assert.match(studentApp, /entry-coach-link" href="\/coach\/login">ورود مربی<\/a>/, 'the entry page keeps the small coach-login link');
    check('student login page on /student/login with «معرفی یسنا فیت» → / and «ورود مربی»');

    const res = await request('/', { cookie: coachCookie });
    assert.equal(res.response.status, 200);
    assert.ok(res.data.includes('id="main"'), 'authed coach still gets the landing page on /');
    assert.ok(!res.data.includes('id="content"'), 'authed coach must NOT get the SPA shell on /');
    assert.ok(res.data.includes('data-coach-session="1"'), 'authed landing marks the coach session');
    assert.ok(res.data.includes('class="brand"'), 'authed landing keeps the public header');
    assert.ok(res.data.includes('پنل مربی'), 'authed landing header offers the پنل مربی button');
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

async function bootServer() {
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
