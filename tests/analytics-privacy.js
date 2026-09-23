#!/usr/bin/env node
'use strict';
// ۲۷ مورد واقعی برای Analytics سبک و privacy-friendly. هیچ شبکهٔ خارجی صدا زده نمی‌شود.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const server = read('server.js');
const security = read('src/request-security.js');
const analyticsSrc = read('src/analytics-service.js');
const telegramSrc = read('src/telegram-service.js');
const core = read('public/core.js');
const { migrations, runMigrations } = require(path.join(root, 'src/migrations.js'));
const analytics = require(path.join(root, 'src/analytics-service.js'));

const results = {};
function check(name, fn){
  fn();
  results[name] = true;
}

const ua = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1 Version/16.0 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  crios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 CriOS/120.0 Mobile/15E148 Safari/604.1',
};

function freshDb(){
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}
function req(headers, socketIp){
  return { headers, socket: { remoteAddress: socketIp }, url: '/' };
}

check('1_cloudflare_peer_trusted', () => {
  assert.equal(analytics.isCloudflareAddress('104.16.0.1'), true);
  assert.equal(analytics.isCloudflareAddress('104.15.255.255'), false);
  assert.equal(analytics.isCloudflareAddress('8.8.8.8'), false);
  const trusted = req({ 'cf-connecting-ip': '5.253.10.9', 'cf-ray': 'abcdef1234567890-ARN' }, '104.16.5.5');
  assert.equal(analytics.analyticsClientIp(trusted), '5.253.10.9');
  const mapped = req({ 'cf-connecting-ip': '5.253.10.9', 'cf-ray': 'abcdef1234567890-ARN' }, '::ffff:104.16.5.5');
  assert.equal(analytics.analyticsClientIp(mapped), '5.253.10.9');
});

check('2_spoofed_header_ignored', () => {
  const spoof = req({ 'cf-connecting-ip': '203.0.113.9', 'cf-ray': 'abcdef1234567890-ARN' }, '1.2.3.4');
  assert.equal(analytics.analyticsClientIp(spoof), '1.2.3.4');
  assert.notEqual(analytics.analyticsClientIp(spoof), '203.0.113.9');
});

check('3_direct_railway_ignored', () => {
  const railway = req({
    'cf-connecting-ip': '203.0.113.9',
    'cf-ray': 'abcdef1234567890-ARN',
    'x-forwarded-for': '203.0.113.9'
  }, '100.64.0.8');
  assert.notEqual(analytics.analyticsClientIp(railway), '203.0.113.9');
});

check('4_missing_cf_ray_ignored', () => {
  const bare = req({ 'cf-connecting-ip': '5.253.10.9' }, '104.16.5.5');
  assert.equal(analytics.analyticsClientIp(bare), '104.16.5.5');
  const badRay = req({ 'cf-connecting-ip': '5.253.10.9', 'cf-ray': 'spoofed' }, '104.16.5.5');
  assert.equal(analytics.analyticsClientIp(badRay), '104.16.5.5');
});

check('5_ipv6_cloudflare_peer', () => {
  assert.equal(analytics.isCloudflareAddress('2400:cb00::1'), true);
  assert.equal(analytics.isCloudflareAddress('2400:cb01::1'), false);
  const trusted = req({ 'cf-connecting-ip': '2001:db8::5', 'cf-ray': 'abcdef1234567890-ARN' }, '2400:cb00::1');
  assert.equal(analytics.analyticsClientIp(trusted), '2001:db8::5');
});

check('6_client_ip_unchanged', () => {
  assert.ok(security.includes('function clientIp(req){'), 'clientIp signature must not change');
  assert.ok(security.includes("const forwarded=TRUST_PROXY?firstHeader(req?.headers?.['x-forwarded-for']):'';"), 'clientIp must keep reading only the first X-Forwarded-For hop');
  assert.ok(security.includes("return forwarded||req?.socket?.remoteAddress||'unknown';"), 'clientIp must fall back to the socket address');
  assert.doesNotMatch(security, /cf-connecting-ip/i);
  assert.doesNotMatch(security, /CF-Connecting-IP/);
});

check('7_rate_limit_still_uses_client_ip', () => {
  assert.match(server, /function rateLimit\(req,res,scope,limit,windowMs\)\{const ip=requestSecurity\.clientIp\(req\)/);
  const rate = server.slice(server.indexOf('function rateLimit'), server.indexOf('function sameOrigin'));
  assert.doesNotMatch(rate, /cf-connecting-ip/i);
  assert.doesNotMatch(rate, /analyticsClientIp/);
});

check('8_visitor_label_not_raw_ip', () => {
  const token = 'ab'.repeat(16);
  const id = analytics.visitorIdFromToken(token);
  assert.match(id, /^visitor_[a-f0-9]{12}$/);
  assert.equal(analytics.visitorIdFromToken(token), id);
  assert.equal(id.includes('203.0.113'), false);
  const headers = {};
  const res = { setHeader(key, value){ headers[key] = value; }, getHeader(key){ return headers[key]; } };
  const first = analytics.ensureVisitor({ headers: {}, socket: { remoteAddress: '203.0.113.9' } }, res);
  const second = analytics.ensureVisitor({ headers: { cookie: `yasnafit_vid=${first.token}` }, socket: { remoteAddress: '198.51.100.4' } }, res);
  assert.equal(first.id, second.id);
  assert.match(String(headers['Set-Cookie']), /yasnafit_vid=/);
  assert.doesNotMatch(String(headers['Set-Cookie']), /203\.0\.113\.9/);
});

check('9_stable_visitor_not_ip', () => {
  const db = freshDb();
  const visitor = 'visitor_sameperson1';
  analytics.recordVisit(db, { ip: '203.0.113.10', path: '/', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '198.51.100.10', path: '/about', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:05:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.10', path: '/contact', userAgent: ua.firefox, visitorId: 'visitor_otherperson', at: '2026-09-23T08:06:00.000Z' });
  const summary = analytics.visitSummary(db, { range: 'today', now: '2026-09-23T12:00:00.000Z' });
  assert.equal(summary.summary.visitors, 2, 'same visitor id on two IPs is one person; same IP with another id is another person');
  assert.ok(summary.visitors.every(row => !('ip' in row)));
  assert.ok(summary.visitors.every(row => String(row.visitor_label).startsWith('visitor_')));
});

check('10_session_30_minute_split', () => {
  const db = freshDb();
  const visitor = 'visitor_boundary01';
  analytics.recordVisit(db, { ip: '203.0.113.20', path: '/', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T10:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.20', path: '/about', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T10:30:00.000Z' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_sessions WHERE visitor_id=?').get(visitor).n, 1, 'activity at exactly 30 minutes stays in the session');
  analytics.recordVisit(db, { ip: '203.0.113.20', path: '/contact', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T11:00:00.001Z' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM analytics_sessions WHERE visitor_id=?').get(visitor).n, 2, 'inactivity beyond 30 minutes opens a new session');
  const sessions = db.prepare('SELECT pageviews FROM analytics_sessions WHERE visitor_id=? ORDER BY started_at').all(visitor);
  assert.deepEqual(sessions.map(row => row.pageviews), [2, 1]);
});

check('11_duration_is_session_not_span', () => {
  const db = freshDb();
  const visitor = 'visitor_duration01';
  analytics.recordVisit(db, { ip: '203.0.113.21', path: '/', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.21', path: '/about', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:20:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.21', path: '/contact', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T10:00:00.000Z' });
  const summary = analytics.visitSummary(db, { range: 'today', now: '2026-09-23T12:00:00.000Z' });
  assert.equal(summary.summary.sessions, 2);
  assert.equal(summary.summary.average_session_ms, 20 * 60 * 1000, 'duration is the active session span, not last-minus-first across the gap');
  assert.equal(summary.summary.pages_per_session, 1.5);
});

check('12_returning_visitors', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.30', path: '/', userAgent: ua.chrome, visitorId: 'visitor_return001', at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.30', path: '/about', userAgent: ua.chrome, visitorId: 'visitor_return001', at: '2026-09-23T09:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.31', path: '/', userAgent: ua.iphone, visitorId: 'visitor_fresh0001', at: '2026-09-23T08:10:00.000Z' });
  const summary = analytics.visitSummary(db, { range: 'today', now: '2026-09-23T12:00:00.000Z' });
  assert.equal(summary.summary.returning_visitors, 1);
  assert.equal(summary.summary.new_visitors, 1);
  const returning = summary.visitors.find(row => row.visitor_id === 'visitor_return001');
  assert.equal(returning.returning, true);
  assert.equal(summary.visitors.find(row => row.visitor_id === 'visitor_fresh0001').returning, false);
});

check('13_private_paths_not_recorded', () => {
  const db = freshDb();
  const blocked = ['/coach/login', '/coach/setup', '/coach/dashboard', '/student/login', '/student/dashboard', '/api/health', '/health', '/assets/app.js', '/api/students'];
  for(const pathName of blocked){
    assert.equal(analytics.isPublicAnalyticsPath(pathName), false, pathName);
    assert.equal(analytics.recordVisit(db, { ip: '203.0.113.40', path: pathName, userAgent: ua.chrome }), false, pathName);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM site_visits').get().n, 0);
  assert.equal((server.match(/analyticsService\.recordVisit\(/g) || []).length, 0);
  assert.match(server, /url\.pathname==='\/student\/register' && authenticated\) scheduleAnalyticsEvent/);
});

check('14_magazine_and_public_pages', () => {
  const db = freshDb();
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.41', path: '/', userAgent: ua.chrome, visitorId: 'visitor_public0001' }), true);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.41', path: '/magazine', userAgent: ua.chrome, visitorId: 'visitor_public0001' }), true);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.41', path: '/magazine/healthy-breakfast', userAgent: ua.chrome, visitorId: 'visitor_public0001' }), true);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.41', path: '/magazine/a/b', userAgent: ua.chrome, visitorId: 'visitor_public0001' }), false);
  const paths = db.prepare('SELECT path FROM site_visits ORDER BY id').all().map(row => row.path);
  assert.deepEqual(paths, ['/', '/magazine', '/magazine/healthy-breakfast']);
  assert.match(server, /if\(req\.method === 'GET'\) trackPublicHtml\(req, res, path\)/);
});

check('15_tehran_midnight', () => {
  assert.equal(analytics.tehranDateKey('2026-09-22T20:31:00.000Z'), '2026-09-23');
  assert.equal(analytics.tehranDateKey('2026-09-22T20:29:00.000Z'), '2026-09-22');
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.50', path: '/', userAgent: ua.chrome, visitorId: 'visitor_tehran0001', at: '2026-09-22T20:31:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.51', path: '/about', userAgent: ua.chrome, visitorId: 'visitor_tehran0002', at: '2026-09-22T20:29:00.000Z' });
  const now = '2026-09-23T12:00:00.000Z';
  const today = analytics.visitSummary(db, { range: 'today', now });
  const yesterday = analytics.visitSummary(db, { range: 'yesterday', now });
  assert.equal(today.summary.pageviews, 1);
  assert.equal(today.daily.some(day => day.day === '2026-09-23' && day.views === 1), true);
  assert.equal(yesterday.summary.pageviews, 1);
  assert.equal(yesterday.daily.some(day => day.day === '2026-09-22' && day.views === 1), true);
  assert.equal(today.range.timezone, 'Asia/Tehran');
});

check('16_ranges_first_last_chart', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.60', path: '/', userAgent: ua.chrome, visitorId: 'visitor_range00001', at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.60', path: '/contact', userAgent: ua.chrome, visitorId: 'visitor_range00001', at: '2026-09-23T08:15:00.000Z' });
  const week = analytics.visitSummary(db, { range: '7d', now: '2026-09-23T12:00:00.000Z' });
  const month = analytics.visitSummary(db, { range: '30d', now: '2026-09-23T12:00:00.000Z' });
  const custom = analytics.visitSummary(db, { range: 'custom', from: '2026-09-23', to: '2026-09-23', now: '2026-09-23T12:00:00.000Z' });
  assert.equal(week.range.preset, '7d');
  assert.equal(month.range.preset, '30d');
  assert.equal(custom.range.preset, 'custom');
  assert.equal(custom.summary.pageviews, 2);
  assert.ok(custom.range.first_fa && custom.range.first_fa !== '—');
  assert.ok(custom.range.last_fa && custom.range.last_fa !== '—');
  assert.ok(custom.daily.every(day => day.visitors != null && day.sessions != null && day.registrations != null && day.views != null));
  const tooWide = analytics.visitSummary(db, { range: 'custom', from: '2020-01-01', to: '2026-09-23', now: '2026-09-23T12:00:00.000Z' });
  assert.equal(tooWide.range.preset, '30d', 'custom ranges longer than a year fall back instead of building a huge chart');
});

check('17_bots_filtered_browsers_kept', () => {
  const db = freshDb();
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.70', path: '/', userAgent: 'curl/8.0' }), false);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.70', path: '/', userAgent: 'kube-probe/1.28' }), false);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.70', path: '/', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }), false);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.70', path: '/', userAgent: 'UptimeRobot/2.0' }), false);
  assert.equal(analytics.isBotUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome Mobile'), false);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.70', path: '/', userAgent: ua.chrome }), true);
  assert.equal(analytics.recordVisit(db, { ip: '203.0.113.71', path: '/', userAgent: ua.iphone }), true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM site_visits').get().n, 2);
});

check('18_device_browser_os', () => {
  assert.equal(analytics.parseUserAgent(ua.iphone).device, 'mobile');
  assert.equal(analytics.parseUserAgent(ua.iphone).os, 'iOS');
  assert.equal(analytics.parseUserAgent(ua.iphone).browser, 'Safari');
  assert.equal(analytics.parseUserAgent(ua.ipad).device, 'tablet');
  assert.equal(analytics.parseUserAgent(ua.chrome).device, 'desktop');
  assert.equal(analytics.parseUserAgent(ua.chrome).browser, 'Chrome');
  assert.equal(analytics.parseUserAgent(ua.chrome).os, 'Windows');
  assert.equal(analytics.parseUserAgent(ua.edge).browser, 'Edge');
  assert.equal(analytics.parseUserAgent(ua.firefox).browser, 'Firefox');
  assert.equal(analytics.parseUserAgent(ua.firefox).os, 'Linux');
  assert.equal(analytics.parseUserAgent(ua.mac).os, 'macOS');
  assert.equal(analytics.parseUserAgent(ua.android).device, 'mobile');
  assert.equal(analytics.parseUserAgent(ua.android).os, 'Android');
  assert.equal(analytics.parseUserAgent(ua.crios).browser, 'Chrome');
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.80', path: '/', userAgent: 'SomeUnknownAgent/1.0', visitorId: 'visitor_otheragent1' });
  const summary = analytics.visitSummary(db, 7);
  assert.ok(summary.browser_groups.some(row => row.browser_group === 'Other'));
  assert.ok(summary.os.some(row => row.os === 'Other'));
});

check('19_source_utm_sensitive_query', () => {
  assert.equal(analytics.classifySource('google', ''), 'Google');
  assert.equal(analytics.classifySource('', 'https://www.google.com/search?q=fit'), 'Google');
  assert.equal(analytics.classifySource('ig', 'https://instagram.com/exercise._.yasna._'), 'Instagram');
  assert.equal(analytics.classifySource('', 'https://l.instagram.com/'), 'Instagram');
  assert.equal(analytics.classifySource('tg', ''), 'Telegram');
  assert.equal(analytics.classifySource('', 'https://t.me/yasnafitbot'), 'Telegram');
  assert.equal(analytics.classifySource('', ''), 'Direct');
  assert.equal(analytics.classifySource('', 'https://example.com/article'), 'Referral');
  assert.equal(analytics.classifySource('newsletter', ''), 'Other');
  const db = freshDb();
  analytics.recordVisit(db, {
    ip: '203.0.113.90', path: '/contact?token=abc&password=secret', userAgent: ua.chrome,
    visitorId: 'visitor_campaign01', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'spring',
    referrer: 'https://instagram.com/'
  });
  analytics.recordVisit(db, {
    ip: '203.0.113.91', path: '/', userAgent: ua.chrome, visitorId: 'visitor_campaign02',
    utmSource: 'google', utmCampaign: 'spring_password', referrer: 'https://t.me/x?token=secret'
  });
  const clean = db.prepare('SELECT path, utm_source, utm_medium, utm_campaign, referrer, traffic_source FROM site_visits WHERE visitor_id=?').get('visitor_campaign01');
  assert.equal(clean.path, '/contact');
  assert.equal(clean.utm_source, 'instagram');
  assert.equal(clean.utm_medium, 'social');
  assert.equal(clean.utm_campaign, 'spring');
  assert.equal(clean.traffic_source, 'Instagram');
  const dirty = db.prepare('SELECT utm_campaign, referrer, traffic_source FROM site_visits WHERE visitor_id=?').get('visitor_campaign02');
  assert.equal(dirty.utm_campaign, null);
  assert.equal(dirty.referrer, null);
  assert.doesNotMatch(JSON.stringify(dirty), /secret|password|token/i);
});

check('20_funnel_conversion', () => {
  const db = freshDb();
  const now = '2026-09-23T12:00:00.000Z';
  analytics.recordVisit(db, { ip: '203.0.113.100', path: '/', userAgent: ua.chrome, visitorId: 'visitor_funnel0001', at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.101', path: '/', userAgent: ua.iphone, visitorId: 'visitor_funnel0002', at: '2026-09-23T08:05:00.000Z' });
  analytics.recordEvent(db, { eventType: 'register_start', visitorId: 'visitor_funnel0001', path: '/student/register', at: '2026-09-23T08:10:00.000Z', userAgent: ua.chrome });
  analytics.recordRegistration(db, { ip: '203.0.113.100', visitorId: 'visitor_funnel0001', kind: 'student', label: 'شاگرد آزمون', at: '2026-09-23T08:20:00.000Z', userAgent: ua.chrome });
  analytics.recordEvent(db, { eventType: 'landing_view', visitorId: 'visitor_funnel0001', path: '/', at: '2026-09-23T08:00:00.000Z', userAgent: ua.chrome });
  analytics.recordEvent(db, { eventType: 'login', visitorId: 'visitor_funnel0001', path: '/student/login', at: '2026-09-23T08:21:00.000Z', userAgent: ua.chrome });
  const summary = analytics.visitSummary(db, { range: 'today', now });
  assert.equal(summary.funnel.visitors, 2);
  assert.equal(summary.funnel.register_start, 1);
  assert.equal(summary.funnel.registration_complete, 1);
  assert.equal(summary.funnel.conversion_rate, 50);
  assert.equal(summary.today.registrations, 1);
  assert.ok(summary.events.some(row => row.event_type === 'login' && row.count === 1));
  const journey = summary.journeys.find(row => row.path.includes('ثبت‌نام'));
  assert.ok(journey, 'a real session path is shown when the data exists');
});

check('21_export_has_no_secret', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.110', path: '/', userAgent: ua.chrome, visitorId: 'visitor_export0001', utmSource: 'telegram', utmCampaign: 'launch' });
  analytics.recordRegistration(db, { ip: '203.0.113.110', visitorId: 'visitor_export0001', kind: 'student', label: 'شاگرد آزمون', userAgent: ua.chrome });
  const exported = analytics.exportAnalytics(db, 7);
  const blob = JSON.stringify(exported);
  assert.equal(exported.timezone, 'Asia/Tehran');
  assert.doesNotMatch(blob, /"ip"/);
  assert.doesNotMatch(blob, /203\.0\.113\.110/);
  assert.doesNotMatch(blob, /user_agent|password|secret|authorization/i);
  assert.match(blob, /visitor_export0001|visitor_/);
});

check('22_online_now_no_ip', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip: '203.0.113.120', path: '/magazine', userAgent: ua.android, visitorId: 'visitor_online0001', at: new Date().toISOString() });
  const summary = analytics.visitSummary(db, { range: 'yesterday', now: new Date().toISOString() });
  assert.ok(summary.online_now.length >= 1, 'online now is the last 5 minutes, not the selected range');
  assert.ok(summary.online_now.every(row => !('ip' in row) && row.visitor_label && row.path && row.device && row.last_fa));
  assert.equal(summary.online_now[0].path, '/magazine');
});

check('23_cleanup_keeps_registrations', () => {
  const db = freshDb();
  db.prepare(`INSERT INTO registration_events(stable_id, occurred_at, ip, kind, label) VALUES('keep-reg','2020-01-01T00:00:00.000Z','203.0.113.1','student','قدیمی')`).run();
  db.prepare(`INSERT INTO site_visits(stable_id, visited_at, ip, path, is_public) VALUES('old-visit','2020-01-01T00:00:00.000Z','203.0.113.1','/',1)`).run();
  analytics.cleanup(db);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM registration_events WHERE stable_id='keep-reg'`).get().n, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM site_visits WHERE stable_id='old-visit'`).get().n, 0);
  assert.match(server, /analyticsService\.cleanup\(db\)/);
  assert.match(server, /analyticsService\.startGeoResolver\(db\)/);
  assert.match(analyticsSrc, /maybeCleanup\(db\)/);
  assert.doesNotMatch(analyticsSrc, /DELETE FROM registration_events/);
});

check('24_historical_rows_preserved', () => {
  const db = new DatabaseSync(':memory:');
  for(const migration of migrations){
    if(migration.id === '040_analytics_privacy') break;
    migration.up(db);
  }
  db.prepare(`INSERT INTO site_visits(stable_id, visited_at, ip, path, device, browser, os, user_agent) VALUES('old-public','2026-08-01T10:00:00.000Z','203.0.113.130','/','desktop','Chrome','Windows','Mozilla/5.0')`).run();
  db.prepare(`INSERT INTO site_visits(stable_id, visited_at, ip, path, device, browser, os, user_agent) VALUES('old-private','2026-08-01T10:05:00.000Z','203.0.113.131','/coach/login','desktop','Chrome','Windows','Mozilla/5.0')`).run();
  migrations.find(item => item.id === '040_analytics_privacy').up(db);
  const kept = db.prepare('SELECT ip, path, visitor_id, session_id, is_public FROM site_visits ORDER BY id').all();
  assert.equal(kept.length, 2);
  assert.equal(kept[0].ip, '203.0.113.130');
  assert.equal(kept[1].ip, '203.0.113.131');
  assert.match(kept[0].visitor_id, /^visitor_[a-f0-9]{12}$/);
  assert.ok(kept[0].session_id);
  assert.equal(kept[0].is_public, 1);
  assert.equal(kept[1].is_public, 0);
  const names = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map(row => row.name));
  for(const name of ['idx_site_visits_time', 'idx_site_visits_visitor', 'idx_site_visits_session', 'idx_site_visits_path', 'idx_site_visits_country', 'idx_site_visits_event']){
    assert.ok(names.has(name), name);
  }
});

check('25_geo_https_private_no_fetch', () => {
  const db = freshDb();
  let called = false;
  const resolved = analytics.resolveIps(db, ['127.0.0.1', '203.0.113.140'], async () => { called = true; throw new Error('no network'); });
  assert.equal(called, false);
  assert.deepEqual(resolved.local, ['127.0.0.1']);
  assert.deepEqual(resolved.remote, ['203.0.113.140']);
  assert.equal(db.prepare(`SELECT country_code FROM ip_geo_cache WHERE ip='127.0.0.1'`).get().country_code, 'LN');
  assert.match(analyticsSrc, /https:\/\/ipwho\.is\//);
  assert.doesNotMatch(analyticsSrc, /http:\/\/ip-api\.com/);
  assert.equal(analytics.GEO_HTTPS.startsWith('https://'), true);
});

check('26_recording_does_not_block_or_throw', () => {
  assert.equal(analytics.recordVisit(null, { path: '/', userAgent: ua.chrome }), false);
  const fn = server.slice(server.indexOf('function trackPublicHtml'), server.indexOf('function scheduleAnalyticsEvent'));
  assert.match(fn, /ensureVisitor/);
  assert.match(fn, /setImmediate/);
  assert.match(fn, /commitSnapshot/);
  assert.doesNotMatch(fn, /recordVisit\(/);
  assert.match(server, /recordAnalyticsEvent\(req,res,'login','\/coach\/login'\)/);
  assert.match(server, /recordAnalyticsEvent\(req,res,'login','\/student\/login'\)/);
  assert.match(telegramSrc, /eventType:'telegram_connect'/);
  assert.doesNotMatch(telegramSrc, /v\.ip/);
  const renderer = core.slice(core.indexOf('window.renderVisitAnalytics'), core.indexOf('window.renderCoreRoute'));
  assert.match(renderer, /api\/analytics\/visits\?days=/);
  assert.match(renderer, /آخرین بازدیدها/);
  assert.match(renderer, /IPهای یکتا/);
  assert.doesNotMatch(renderer, /\.ip\b/);
  assert.match(read('public/styles.css'), /§۲۴ — آمار بازدید سایت/);
});

check('27_events_and_pages_table', () => {
  const db = freshDb();
  const visitor = 'visitor_pages00001';
  analytics.recordVisit(db, { ip: '203.0.113.150', path: '/', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.150', path: '/about', userAgent: ua.chrome, visitorId: visitor, at: '2026-09-23T08:04:00.000Z' });
  analytics.recordVisit(db, { ip: '203.0.113.151', path: '/about', userAgent: ua.iphone, visitorId: 'visitor_pages00002', at: '2026-09-23T08:06:00.000Z' });
  const summary = analytics.visitSummary(db, { range: 'today', now: '2026-09-23T12:00:00.000Z' });
  const about = summary.pages.find(row => row.path === '/about');
  assert.equal(about.views, 2);
  assert.equal(about.visitors, 2);
  assert.equal(about.avg_time_ms, null, 'the last page of a session has no invented dwell time');
  const home = summary.pages.find(row => row.path === '/');
  assert.equal(home.avg_time_ms, 4 * 60 * 1000);
  assert.ok(summary.events.some(row => row.event_type === 'coach_page_view'));
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM site_visits WHERE path LIKE '/coach/%' OR path LIKE '/student/%'`).get().n, 0);
});

check('28_journey_steps_count_sessions', () => {
  const db = freshDb();
  const visitor = 'visitor_journey0001';
  analytics.recordVisit(db, { ip:'203.0.113.150', path:'/about', userAgent:ua.chrome, visitorId:visitor, at:'2026-09-23T09:00:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.150', path:'/about', userAgent:ua.chrome, visitorId:visitor, at:'2026-09-23T09:05:00.000Z' });
  analytics.recordEvent(db, { eventType:'coach_page_view', visitorId:visitor, path:'/about', at:'2026-09-23T09:00:00.000Z', userAgent:ua.chrome });
  analytics.recordEvent(db, { eventType:'coach_page_view', visitorId:visitor, path:'/about', at:'2026-09-23T09:05:00.000Z', userAgent:ua.chrome });
  analytics.recordEvent(db, { eventType:'register_start', visitorId:visitor, path:'/student/register', at:'2026-09-23T09:10:00.000Z', userAgent:ua.chrome });
  const summary = analytics.visitSummary(db, { range:'today', now:'2026-09-23T12:00:00.000Z' });
  const coachEvent = summary.events.find(row => row.event_type === 'coach_page_view');
  assert.equal(coachEvent.count, 2, 'two coach events were recorded');
  assert.equal(coachEvent.sessions, 1, 'events carry their session id');
  assert.equal(summary.journey.find(row => row.step === 'Coach').sessions, 1, 'journey counts sessions, not events');
  assert.equal(summary.journey.find(row => row.step === 'Register').sessions, 1, 'register step counts sessions too');
  assert.equal(summary.funnel.register_start, 1, 'the funnel keeps counting events');
});

check('29_join_landing_pageview', () => {
  const token = 'aB3_-xyz'.repeat(9).slice(0, 43);
  assert.equal(analytics.isPublicAnalyticsPath('/join/' + token), true, 'invitation landing is a public page');
  assert.equal(analytics.isPublicAnalyticsPath('/join/short'), false, 'garbage tokens are not a landing');
  assert.equal(analytics.isPublicAnalyticsPath('/join/a/b'), false, 'nested paths are not the landing');
  assert.equal(analytics.isPublicAnalyticsPath('/join/'), false);
  const db = freshDb();
  assert.equal(analytics.recordVisit(db, { ip:'203.0.113.160', path:'/join/' + token, userAgent:ua.chrome, visitorId:'visitor_join000001' }), true);
  assert.equal(analytics.recordVisit(db, { ip:'203.0.113.160', path:'/join/short', userAgent:ua.chrome, visitorId:'visitor_join000001' }), false);
  const summary = analytics.visitSummary(db, { range:'today', now:'2026-09-23T12:00:00.000Z' });
  assert.equal(summary.pages.some(page => page.label === 'Invite'), true, 'join landing appears in the public pages table');
  assert.ok(server.includes('analyticsService.isPublicAnalyticsPath(url.pathname)'), 'server tracks the invitation landing on the SPA fallback');
});

const names = Object.keys(results);
assert.equal(names.length, 29, 'the privacy suite must execute all 29 cases');
console.log(JSON.stringify({ ok: true, cases: names.length, results }));
