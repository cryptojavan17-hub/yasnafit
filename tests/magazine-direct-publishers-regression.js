'use strict';
// Controlled regression tests only. Never use these as live-source evidence.
const assert = require('node:assert/strict');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { migrations, runMigrations } = require('../src/migrations');
const service = require('../src/magazine-discovery-service');
const html = require('../src/magazine-html-source');
(async () => {
  const db = new DatabaseSync(':memory:');
  // Upgrade a real 038-shaped DB; preserve a custom source and historical rows.
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  for (const m of migrations.filter(m => !m.id.startsWith('039_'))) {
    m.up(db); db.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(m.id);
  }
  db.prepare("INSERT INTO magazine_sources(stable_id,name,feed_url) VALUES('custom-source','منبع دستی','https://custom.invalid/feed')").run();
  const before = db.prepare('SELECT COUNT(*) n FROM magazine_sources').get().n;
  runMigrations(db); runMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM magazine_sources').get().n, before + 4);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM magazine_sources WHERE stable_id LIKE 'builtin-fa-%' AND is_active=1").get().n, 0);
  assert.equal(db.prepare("SELECT is_active FROM magazine_sources WHERE stable_id='custom-source'").get().is_active, 1);
  const direct = service.listSources(db).filter(s => s.stable_id.startsWith('builtin-direct-fa-'));
  assert.equal(direct.length, 4);
  assert.equal(direct.filter(s => s.fetch_format === 'html').length, 2);
  assert(direct.every(s => s.is_active && !s.feed_url.includes('google.com')));
  assert.equal(html.sourceDate('۱۴۰۵/۰۶/۳۰'), '2026-09-21');
  assert.equal(html.sourceDate('30 شهریور 1405'), '2026-09-21');
  assert.equal(html.sourceDate('شهریور ۱۴۰۵'), null); // No invented day.
  assert.equal(html.articleDate('<meta content="2026-07-01" property="article:published_time">'), '2026-07-01T00:00:00.000Z');
  const list = html.parseHtmlListing(`<nav><a href="/blog/nav.html">فهرست اصلی ناوبری</a></nav>
    <a href="/blog/lifting.html"><img src="data:image/gif;base64,x" data-src="/img/lift.webp" alt="تمرین با وزنه"><h3>نقش تمرین با وزنه در سلامت</h3><p>خلاصهٔ ناشر</p><time datetime="2026-06-01"></time></a>
    <a href="https://external.invalid/blog/spam.html">عنوان فارسی نامربوط</a>
    <a href="/blog/lifting.html">خواندن</a>
    <a href="/blog/undated.html"><strong>راهنمای حرکات کششی</strong></a>`, 'https://badanfit.ir/blog.html');
  assert.equal(list.length, 2);
  assert.equal(list[0].title, 'نقش تمرین با وزنه در سلامت');
  assert.equal(list[0].imageUrl, 'https://badanfit.ir/img/lift.webp');
  assert.equal(list[0].publishedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(list[1].publishedAt, null);
  const fa = html.parseHtmlListing('<article><a href="/mag/olive/"><img data-lazy-src="/olive.jpg"></a><h2><a href="/mag/olive/">روغن زیتون برای ورزشکاران</a></h2><time>۲۸ شهریور ۱۴۰۵</time><a href="/mag/category/nutrition/">تغذیه</a></article>', 'https://fitamin.ir/mag/');
  assert.equal(fa.length, 1); assert.equal(fa[0].publishedAt, '2026-09-19'); assert.equal(fa[0].imageUrl, 'https://fitamin.ir/olive.jpg');
  const feed = service.parseFeed('<rss><channel><item><title>عنوان فارسی مقاله</title><link>https://publisher.test/article</link><description>خلاصه</description><content:encoded><![CDATA[<p><img src="https://publisher.test/photo.jpg"></p>]]></content:encoded></item></channel></rss>');
  assert.equal(feed[0].imageUrl, 'https://publisher.test/photo.jpg');
  console.log('PASS direct sources migration/idempotency, original HTML titles/images, Jalali dates, content:encoded image');

  const ago = days => new Date(Date.now() - days * 86400000).toISOString();
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/list') return res.end(`<main>
      <article><h2><a href="/old-but-allowed">آبرسانی هنگام دویدن در تابستان</a></h2><time datetime="${ago(120)}"></time></article>
      <article><h2><a href="/no-date">نقش خواب در بازسازی عضلات</a></h2></article>
      <article><h2><a href="/bad-canonical">شیوه انجام صحیح اسکوات بلغاری</a></h2><time datetime="${ago(10)}"></time></article>
      <article><h2><a href="/page-fails">راهنمای مصرف پروتئین در وعده صبحانه</a></h2><time datetime="${ago(7)}"></time></article>
      <article><h2><a href="/date-on-page">تاثیر تمرین قدرتی بر سلامت استخوان</a></h2></article>
      <article><h2><a href="/ancient-on-page">مطلب قدیمی درباره تاریخ ورزش</a></h2></article>
      <article><h2><a href="/ancient-list">گزارش تاریخی مسابقات محلی</a></h2><time datetime="${ago(181)}"></time></article>
    </main>`);
    if (req.url === '/bad-canonical') return res.end('<link rel="canonical" href="javascript:bad()"><article>ناشر</article>');
    if (req.url === '/date-on-page') return res.end(`<meta property="article:published_time" content="${ago(100)}"><article>ناشر</article>`);
    if (req.url === '/ancient-on-page') return res.end('<script type="application/ld+json">{"@type":"Article","datePublished":"2017-01-01"}</script>');
    if (req.url === '/page-fails') { res.statusCode = 503; return res.end('unavailable'); }
    res.end('<article>صفحهٔ مقاله بدون تصویر و canonical</article>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    db.prepare('UPDATE magazine_sources SET is_active=0').run();
    const base = `http://127.0.0.1:${server.address().port}`;
    const source = service.createSource(db, { name: 'ناشر آزمایش محلی', feed_url: base + '/list', fetch_format: 'html', category_slug: 'health' });
    service.updateSource(db, source.id, { name: 'ناشر آزمایش محلی' });
    assert.equal(service.sourceView(db, source.id).fetch_format, 'html');
    const result = await service.runDiscovery(db);
    assert.equal(result.fetched, 7); assert.equal(result.drafted, 5); assert.equal(result.filtered, 1); assert.equal(result.rejected, 1);
    const queue = service.queueView(db);
    assert.equal(queue.length, 5);
    assert(queue.every(a => a.status === 'DRAFT' && !a.audit_reasons.length && !a.cover_image));
    assert.equal(queue.find(a => a.source_url.endsWith('/bad-canonical')).source_url, base + '/bad-canonical');
    assert(queue.find(a => a.source_url.endsWith('/no-date')).ai_meta.date_unknown);
    assert.equal(queue.find(a => a.source_url.endsWith('/page-fails')).ai_meta.page_reachable, false);
    assert(queue.find(a => a.source_url.endsWith('/date-on-page')).source_published_at);
    assert.equal(result.queue_verified.visible_this_run, 5);
    const second = await service.runDiscovery(db);
    assert.equal(second.drafted, 0); assert.equal(service.queueView(db).length, 5);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM magazine_articles WHERE status='PUBLISHED'").get().n, 0);
    console.log('PASS HTML -> existing DRAFT articles -> ready queue; 120d accepted, >180d rejected, no-date labeled, page/URL/image failures non-blocking, dedup, no publish');
  } finally { server.close(); db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
