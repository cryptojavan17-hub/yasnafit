#!/usr/bin/env node
'use strict';
// داشبورد «آمار و تحلیل سایت» — سرویس، API، دسترسی مربی/شاگرد/مهمان و نشانه‌های UI.
// همهٔ داده‌ها همین‌جا ساخته و از دیتابیس Analytics خوانده می‌شوند؛ هیچ شبکهٔ خارجی صدا زده نمی‌شود.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const appSrc = read('public/app.js');
const coreSrc = read('public/core.js');
const stylesSrc = read('public/styles.css');
const serverSrc = read('server.js');
const analyticsSrc = read('src/analytics-service.js');
const { runMigrations } = require(path.join(ROOT, 'src/migrations.js'));
const analytics = require(path.join(ROOT, 'src/analytics-service.js'));

const results = {};
function check(name, fn){ fn(); results[name] = true; }

const NOW = '2026-09-23T12:00:00.000Z';
const ua = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1 Version/16.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
};
function freshDb(){
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}
const noPrivateKeys = value => {
  const json = JSON.stringify(value);
  assert.equal(json.includes('"ip"'), false, 'no raw ip key may leak');
  assert.equal(json.includes('user_agent'), false, 'no raw user agent may leak');
  assert.equal(json.includes('203.0.113.'), false, 'no seeded ip value may leak');
};

// ── سرویس ──
check('1_dash_summary_cards', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.201', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000001', at:'2026-09-01T08:00:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.201', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000001', at:'2026-09-23T08:00:00.000Z', referrer:'https://www.google.com/' });
  analytics.recordVisit(db, { ip:'203.0.113.201', path:'/about', userAgent:ua.chrome, visitorId:'visitor_dash0000001', at:'2026-09-23T08:06:00.000Z', referrer:'https://www.google.com/' });
  analytics.recordVisit(db, { ip:'203.0.113.201', path:'/magazine', userAgent:ua.chrome, visitorId:'visitor_dash0000001', at:'2026-09-23T08:12:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.202', path:'/contact', userAgent:ua.iphone, visitorId:'visitor_dash0000002', at:'2026-09-23T09:00:00.000Z' });
  analytics.recordEvent(db, { eventType:'register_start', visitorId:'visitor_dash0000002', path:'/student/register', at:'2026-09-23T09:05:00.000Z', userAgent:ua.iphone });
  analytics.recordRegistration(db, { ip:'203.0.113.202', kind:'student', label:'نمونه', visitorId:'visitor_dash0000002', at:'2026-09-23T09:10:00.000Z', userAgent:ua.iphone });
  analytics.recordVisit(db, { ip:'203.0.113.203', path:'/services', userAgent:ua.android, visitorId:'visitor_dash0000003', at:'2026-09-23T11:58:00.000Z' });
  const summary = analytics.dashSummary(db, { range:'today', now:NOW });
  assert.equal(summary.range.preset, 'today');
  assert.equal(summary.range.timezone, 'Asia/Tehran');
  assert.equal(summary.cards.pageviews, 5);
  assert.equal(summary.cards.visitors, 3);
  assert.equal(summary.cards.sessions, 3);
  assert.equal(summary.cards.registrations, 1);
  assert.equal(summary.cards.returning_visitors, 1);
  assert.equal(summary.cards.new_visitors, 2);
  assert.equal(summary.cards.average_session_ms, 12 * 60 * 1000, 'session duration comes from real session rows');
  assert.equal(summary.cards.pages_per_session, 1.7);
  assert.equal(summary.cards.online, 1, 'online = activity in the last 5 minutes');
  assert.equal(summary.online_now.length, 1);
  assert.match(summary.online_now[0].visitor_label, /^visitor_/);
  assert.equal(summary.today.pageviews, 5);
  assert.equal(summary.today.visitors, 3);
  assert.equal(summary.today.sessions, 3);
  assert.equal(summary.today.registrations, 1);
  noPrivateKeys(summary);
});

check('2_dash_ranges_including_90d', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.204', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000004', at:'2026-09-23T08:00:00.000Z' });
  const ts = analytics.dashTimeseries(db, { range:'90d', now:NOW });
  assert.equal(ts.range.preset, '90d');
  assert.equal(ts.daily.length, 90);
  assert.equal(ts.daily[89].day, '2026-09-23', 'the Tehran today is the last bucket');
  for(const key of ['today', 'yesterday', '7d', '30d', '90d']){
    assert.equal(analytics.dashSummary(db, { range:key, now:NOW }).range.preset, key);
  }
  const custom = analytics.dashSummary(db, { range:'custom', from:'2026-09-20', to:'2026-09-22', now:NOW });
  assert.equal(custom.range.preset, 'custom');
  assert.equal(custom.range.start_key, '2026-09-20');
  assert.equal(custom.range.end_key, '2026-09-22');
  const yesterday = analytics.dashSummary(db, { range:'yesterday', now:NOW });
  assert.equal(yesterday.cards.pageviews, 0, 'yesterday is the previous Tehran day');
});

check('3_dash_timeseries_tehran_midnight', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.205', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000005', at:'2026-09-22T20:29:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.205', path:'/about', userAgent:ua.chrome, visitorId:'visitor_dash0000005', at:'2026-09-22T20:31:00.000Z' });
  const ts = analytics.dashTimeseries(db, { range:'30d', now:NOW });
  assert.equal(ts.daily.find(day => day.day === '2026-09-22').views, 1, '20:29Z is still the same Tehran day');
  assert.equal(ts.daily.find(day => day.day === '2026-09-23').views, 1, '20:31Z is already past Tehran midnight');
  assert.equal(ts.daily.find(day => day.day === '2026-09-21').views, 0);
  noPrivateKeys(ts);
});

check('4_dash_pages_table', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.206', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000006', at:'2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.206', path:'/about', userAgent:ua.chrome, visitorId:'visitor_dash0000006', at:'2026-09-23T08:04:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.207', path:'/about', userAgent:ua.iphone, visitorId:'visitor_dash0000007', at:'2026-09-23T08:06:00.000Z' });
  const data = analytics.dashPages(db, { range:'today', now:NOW });
  const about = data.pages.find(row => row.path === '/about');
  assert.equal(about.views, 2);
  assert.equal(about.visitors, 2);
  assert.equal(data.pages[0].path, '/about', 'pages sort by views');
  const sum = data.pages.reduce((total, row) => total + row.percent, 0);
  assert.ok(Math.abs(sum - 100) <= 1, 'percentages cover the whole traffic');
  const home = data.pages.find(row => row.path === '/');
  assert.equal(home.avg_time_ms, 4 * 60 * 1000);
  assert.equal(data.pages.some(row => String(row.path).startsWith('/coach/')), false);
  assert.equal(data.pages.some(row => String(row.path).startsWith('/student/')), false);
  noPrivateKeys(data);
});

check('5_dash_visitors_pagination_search_filters', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.208', path:'/', userAgent:ua.chrome, visitorId:'visitor_dashv20001', at:'2026-09-23T08:00:00.000Z', referrer:'https://www.google.com/', countryCode:'IR', countryName:'ایران', city:'تهران' });
  analytics.recordVisit(db, { ip:'203.0.113.209', path:'/about', userAgent:ua.iphone, visitorId:'visitor_dashv20002', at:'2026-09-23T09:00:00.000Z', countryCode:'IQ', countryName:'عراق', city:'نجف' });
  analytics.recordVisit(db, { ip:'203.0.113.210', path:'/magazine', userAgent:ua.ipad, visitorId:'visitor_dashv20003', at:'2026-09-23T10:00:00.000Z' });
  const first = analytics.dashVisitors(db, { range:'today', now:NOW, page:1, page_size:2 });
  assert.equal(first.total, 3);
  assert.equal(first.pages_count, 2);
  assert.equal(first.items.length, 2);
  assert.equal(first.page, 1);
  const second = analytics.dashVisitors(db, { range:'today', now:NOW, page:2, page_size:2 });
  assert.equal(second.items.length, 1);
  assert.match(second.items[0].visitor_label, /^visitor_/);
  const search = analytics.dashVisitors(db, { range:'today', now:NOW, q:'dashv20002' });
  assert.equal(search.total, 1);
  assert.equal(search.items[0].visitor_id, 'visitor_dashv20002');
  assert.equal(analytics.dashVisitors(db, { range:'today', now:NOW, device:'mobile' }).total, 1);
  assert.equal(analytics.dashVisitors(db, { range:'today', now:NOW, device:'tablet' }).total, 1);
  assert.equal(analytics.dashVisitors(db, { range:'today', now:NOW, source:'Google' }).total, 1);
  assert.equal(analytics.dashVisitors(db, { range:'today', now:NOW, country:'IQ' }).total, 1);
  noPrivateKeys(first);
});

check('6_dash_visitor_detail_modal', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.211', path:'/', userAgent:ua.chrome, visitorId:'visitor_dashd30001', at:'2026-09-23T08:00:00.000Z', utmSource:'newsletter', utmMedium:'email', utmCampaign:'spring' });
  analytics.recordVisit(db, { ip:'203.0.113.211', path:'/about', userAgent:ua.chrome, visitorId:'visitor_dashd30001', at:'2026-09-23T08:05:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.212', path:'/services', userAgent:ua.chrome, visitorId:'visitor_dashd30001', at:'2026-09-23T09:00:00.000Z' });
  analytics.recordRegistration(db, { ip:'203.0.113.212', kind:'student', label:'نمونه', visitorId:'visitor_dashd30001', at:'2026-09-23T09:10:00.000Z', userAgent:ua.chrome });
  const d = analytics.dashVisitorDetail(db, 'visitor_dashd30001');
  assert.ok(d);
  assert.equal(d.visitor_id, 'visitor_dashd30001');
  assert.equal(d.pageviews, 3);
  assert.equal(d.sessions, 2, '30-minute idle splits the sessions');
  assert.equal(d.kind, 'returning', 'more than one session means a returning visitor');
  assert.equal(d.registered, true);
  assert.deepEqual(d.registration_kinds, ['student']);
  assert.equal(d.pages.length, 3);
  assert.equal(d.sources.length >= 1, true);
  assert.equal(d.utms.length, 1);
  assert.equal(d.utms[0].utm_campaign, 'spring');
  assert.ok(d.first_fa && d.last_fa && d.average_session_fa);
  assert.equal(analytics.dashVisitorDetail(db, 'visitor_nosuchvisitor1'), null);
  assert.equal(analytics.dashVisitorDetail(db, "visitor_;drop'--"), null);
  noPrivateKeys(d);
});

check('7_dash_sources_devices_geo', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.213', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000008', at:'2026-09-23T08:00:00.000Z', referrer:'https://www.google.com/search?q=x', countryCode:'IR', countryName:'ایران', city:'تهران' });
  analytics.recordVisit(db, { ip:'203.0.113.214', path:'/', userAgent:ua.iphone, visitorId:'visitor_dash0000009', at:'2026-09-23T08:01:00.000Z', referrer:'https://instagram.com/exercise', utmSource:'ig', countryCode:'IR', countryName:'ایران', city:'تهران' });
  analytics.recordVisit(db, { ip:'203.0.113.215', path:'/', userAgent:ua.ipad, visitorId:'visitor_dash0000010', at:'2026-09-23T08:02:00.000Z', utmSource:'newsletter', utmMedium:'email', utmCampaign:'spring', countryCode:'IQ', countryName:'عراق', city:'بغداد' });
  analytics.recordVisit(db, { ip:'203.0.113.216', path:'/', userAgent:ua.android, visitorId:'visitor_dash0000011', at:'2026-09-23T08:03:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.217', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000012', at:'2026-09-23T08:04:00.000Z', referrer:'https://t.me/yasnafitbot' });
  analytics.recordVisit(db, { ip:'203.0.113.218', path:'/', userAgent:ua.chrome, visitorId:'visitor_dash0000013', at:'2026-09-23T08:05:00.000Z', referrer:'https://example.com/page' });
  const src = analytics.dashSources(db, { range:'today', now:NOW });
  const names = src.sources.map(row => row.name).sort();
  assert.deepEqual(names, ['Direct', 'Google', 'Instagram', 'Other', 'Referral', 'Telegram']);
  assert.ok(Math.abs(src.sources.reduce((total, row) => total + row.percent, 0) - 100) <= 1, 'source percentages cover the traffic');
  assert.equal(src.referrers.find(row => row.name === 'google.com').views, 1);
  assert.equal(src.campaigns.length, 2, 'every utm triple becomes its own campaign row');
  const spring = src.campaigns.find(row => row.utm_campaign === 'spring');
  assert.equal(spring.utm_source, 'newsletter');
  assert.equal(spring.utm_medium, 'email');
  assert.equal(spring.views, 1);
  const dev = analytics.dashDevices(db, { range:'today', now:NOW });
  assert.deepEqual(dev.devices.map(row => row.name).sort(), ['desktop', 'mobile', 'tablet']);
  assert.deepEqual(dev.browsers.map(row => row.name).sort(), ['Chrome', 'Safari'], 'browsers group into Chrome/Safari/Firefox/Edge/Other');
  assert.ok(dev.os.some(row => row.name === 'Windows' && row.views === 3));
  const geo = analytics.dashGeo(db, { range:'today', now:NOW });
  const tehran = geo.places.find(row => row.city === 'تهران');
  assert.equal(tehran.views, 2);
  assert.equal(tehran.visitors, 2);
  assert.ok(geo.places.some(row => row.city === 'بغداد'));
  noPrivateKeys(src);
  noPrivateKeys(dev);
  noPrivateKeys(geo);
});

check('8_dash_journey_steps_and_paths', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.219', path:'/', userAgent:ua.chrome, visitorId:'visitor_dashj40001', at:'2026-09-23T08:00:00.000Z', referrer:'https://www.google.com/' });
  analytics.recordVisit(db, { ip:'203.0.113.219', path:'/magazine', userAgent:ua.chrome, visitorId:'visitor_dashj40001', at:'2026-09-23T08:05:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.219', path:'/magazine/my-post', userAgent:ua.chrome, visitorId:'visitor_dashj40001', at:'2026-09-23T08:08:00.000Z' });
  analytics.recordRegistration(db, { ip:'203.0.113.219', kind:'student', label:'نمونه', visitorId:'visitor_dashj40001', at:'2026-09-23T08:20:00.000Z', userAgent:ua.chrome });
  const journey = analytics.dashJourney(db, { range:'today', now:NOW });
  const stepLabel = Object.fromEntries(journey.steps.map(step => [step.label, step.users]));
  assert.equal(stepLabel['صفحه اصلی'], 1);
  assert.equal(stepLabel['مجله'], 1);
  assert.equal(stepLabel['مقاله'], 1);
  assert.equal(stepLabel['ثبت‌نام'], 1);
  assert.equal(journey.paths[0].path, 'Google → صفحه اصلی → مجله → مقاله → ثبت‌نام', 'chains carry the source and end at registration');
  assert.equal(journey.paths[0].users, 1);
  noPrivateKeys(journey);
});

check('9_dash_funnel_five_stages', () => {
  const db = freshDb();
  analytics.recordVisit(db, { ip:'203.0.113.220', path:'/', userAgent:ua.chrome, visitorId:'visitor_dashf50001', at:'2026-09-23T08:00:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.220', path:'/about', userAgent:ua.chrome, visitorId:'visitor_dashf50001', at:'2026-09-23T08:03:00.000Z' });
  analytics.recordVisit(db, { ip:'203.0.113.221', path:'/', userAgent:ua.chrome, visitorId:'visitor_dashf50002', at:'2026-09-23T08:10:00.000Z' });
  analytics.recordEvent(db, { eventType:'register_start', visitorId:'visitor_dashf50001', path:'/student/register', at:'2026-09-23T08:15:00.000Z', userAgent:ua.chrome });
  analytics.recordRegistration(db, { ip:'203.0.113.220', kind:'student', label:'نمونه', visitorId:'visitor_dashf50001', at:'2026-09-23T08:20:00.000Z', userAgent:ua.chrome });
  analytics.recordEvent(db, { eventType:'telegram_connect', path:'/telegram', at:'2026-09-23T08:25:00.000Z', userAgent:'' });
  const funnel = analytics.dashFunnel(db, { range:'today', now:NOW });
  assert.deepEqual(funnel.stages.map(stage => stage.label), [
    'بازدید سایت', 'مشاهده صفحه مهم', 'شروع ثبت‌نام', 'ثبت‌نام موفق', 'اتصال تلگرام (در صورت وجود)',
  ]);
  assert.deepEqual(funnel.stages.map(stage => stage.count), [2, 1, 1, 1, 1]);
  assert.equal(funnel.stages[0].rate_prev, 100);
  assert.equal(funnel.stages[1].rate_prev, 50);
  assert.equal(funnel.stages[1].rate_first, 50);
  assert.equal(funnel.stages[2].rate_prev, 100);
  assert.equal(funnel.conversion_rate, 50);
  assert.deepEqual(funnel.key_pages, ['/about', '/contact', '/services'], 'key pages explain the second stage');
  assert.equal(funnel.stages[4].basis, 'events', 'telegram connects have no visitor binding');
  assert.equal(funnel.events.length, 6);
  noPrivateKeys(funnel);
});

check('10_about_no_coach_page_view_but_structure_kept', () => {
  const db = freshDb();
  assert.equal(analytics.commitSnapshot(db, { at:'2026-09-23T08:00:00.000Z', path:'/about', visitorId:'visitor_dashm60001', ip:'203.0.113.222', userAgent:ua.chrome, trafficSource:'Direct' }), true);
  const events = db.prepare('SELECT event_type FROM analytics_events').all().map(row => row.event_type);
  assert.equal(events.includes('coach_page_view'), false, 'the /about → coach_page_view mapping must stay removed (About ≠ Coach)');
  assert.equal(analytics.commitSnapshot(db, { at:'2026-09-23T08:01:00.000Z', path:'/', visitorId:'visitor_dashm60001', ip:'203.0.113.222', userAgent:ua.chrome, trafficSource:'Direct' }), true);
  const after = db.prepare('SELECT event_type FROM analytics_events').all().map(row => row.event_type);
  assert.deepEqual(after, ['landing_view'], 'the landing event is kept');
  assert.equal(analytics.recordEvent(db, { eventType:'coach_page_view', visitorId:'visitor_dashm60001', path:'/about', at:'2026-09-23T08:02:00.000Z', userAgent:ua.chrome }), true, 'the event type itself stays usable');
  const summary = analytics.visitSummary(db, { range:'today', now:NOW });
  assert.ok(summary.events.some(row => row.event_type === 'coach_page_view'), 'the event type stays in the analytics structure');
  assert.ok(!analyticsSrc.includes("snap.path === '/about'"), 'the removed mapping must not come back');
});

check('11_ui_and_routes_static', () => {
  assert.ok(appSrc.includes("['آمار و تحلیل سایت','/coach/analytics','📊']"), 'the coach menu needs the analytics entry');
  assert.match(appSrc, /\['آمار بازدید','\/coach\/visits'\]/, 'the legacy route label stays');
  assert.match(appSrc, /route==='\/coach\/analytics' && window\.renderAnalyticsDashboard/, 'the new route must be wired');
  assert.match(coreSrc, /window\.renderAnalyticsDashboard=async function/, 'the dashboard renderer must exist');
  for(const phrase of ['آمار و تحلیل سایت','🔄 بروزرسانی آمار','۷ روز اخیر','۳۰ روز اخیر','۹۰ روز اخیر','سفارشی','بازدیدکنندگان یکتا','بازدیدکنندگان برگشتی','میانگین مدت نشست','صفحات محبوب','منابع ورود','جغرافیا','مسیر بازدیدکنندگان','کاربران آنلاین','آخرین بازدیدها']){
    assert.ok(coreSrc.includes(phrase), `the dashboard UI must show «${phrase}»`);
  }
  assert.ok(stylesSrc.includes('§۲۴b'), 'the dashboard styles block must exist');
  assert.ok(stylesSrc.includes('§۲۴ — آمار بازدید سایت'), 'the legacy styles block must stay');
  for(const route of ['summary','timeseries','pages','visitors','sources','devices','geo','journey','funnel']){
    assert.ok(serverSrc.includes(`'/api/coach/analytics/${route}'`), `the ${route} endpoint must exist`);
  }
  assert.ok(serverSrc.includes("p.startsWith('/api/coach/analytics')"));
  const block = serverSrc.slice(serverSrc.indexOf("p.startsWith('/api/coach/analytics')"), serverSrc.indexOf("p.startsWith('/api/coach/analytics')") + 1600);
  assert.match(block, /requireCoach\(req,res\)/, 'the dashboard endpoints must stay behind the coach gate');
});

// ── HTTP: دسترسی واقعی مربی/شاگرد/مهمان + دادهٔ واقعی ──
function freePort(){ return new Promise((resolve,reject)=>{ const s=net.createServer(); s.listen(0,'127.0.0.1',()=>{ const port=s.address().port; s.close(()=>resolve(port)); }); s.on('error',reject); }); }
const ENDPOINTS = ['summary','timeseries','pages','visitors','sources','devices','geo','journey','funnel'];

async function httpPart(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-dash-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive:true });
  const seedDb = new DatabaseSync(path.join(dataDir, 'yasnafit.db'));
  seedDb.exec('PRAGMA foreign_keys=ON');
  runMigrations(seedDb);
  require(path.join(ROOT, 'src/coach-auth-service.js')).setupCoach(seedDb, { email:'mehdi.javan.64@gmail.com', password:'YasnafitCoach1', displayName:'مربی' });
  seedDb.close();

  const port = await freePort();
  const BASE = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [ROOT + '/server.js'], { env:{ ...process.env, PORT:String(port), YASNAFIT_DATA_DIR:dataDir }, stdio:['ignore','pipe','pipe'] });
  let up = false;
  for(let i = 0; i < 80; i++){
    try{ if((await fetch(BASE + '/api/health')).ok){ up = true; break; } }catch(error){}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  check('12_http_server_boots', () => assert.equal(up, true));
  if(!up){ server.kill('SIGKILL'); fs.rmSync(dir, { recursive:true, force:true }); return; }

  try{
    // بازدید واقعی صفحات عمومی با یک کوکی بازدیدکننده
    const browser = { 'User-Agent':ua.chrome };
    const landing = await fetch(BASE + '/', { headers:browser });
    const vidLine = (typeof landing.headers.getSetCookie === 'function' ? landing.headers.getSetCookie() : [landing.headers.get('set-cookie')]).find(line => line && line.startsWith('yasnafit_vid='));
    assert.ok(vidLine, 'public pages must set the anonymous visitor cookie');
    const vidCookie = vidLine.split(';')[0];
    await fetch(BASE + '/about', { headers:{ ...browser, Cookie:vidCookie, Referer:'https://www.google.com/' } });
    await fetch(BASE + '/magazine', { headers:{ ...browser, Cookie:vidCookie } });
    await fetch(BASE + '/coach/login', { headers:browser });
    const visitorId = analytics.visitorIdFromToken(decodeURIComponent(vidCookie.split('=')[1]));

    // مهمان ⇒ ۴۰۱
    for(const name of ENDPOINTS){
      const r = await fetch(`${BASE}/api/coach/analytics/${name}`);
      assert.equal(r.status, 401, `${name}: anonymous must get 401`);
    }
    const anonDetail = await fetch(`${BASE}/api/coach/analytics/visitors/${visitorId}`);
    assert.equal(anonDetail.status, 401, 'visitor detail must stay coach-only');

    // مربی ⇒ ۲۰۰ و شکل درست
    const login = await fetch(BASE + '/api/coach/auth/login', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ email:'mehdi.javan.64@gmail.com', password:'YasnafitCoach1' }),
    });
    assert.equal(login.status, 200, 'coach login must succeed on the seeded account');
    const coachCookie = (typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : [login.headers.get('set-cookie')]).find(line => line && line.startsWith('yasnafit_coach_session=')).split(';')[0];
    const coachHeaders = { 'Content-Type':'application/json', Cookie:coachCookie };
    const get = async name => {
      const r = await fetch(`${BASE}/api/coach/analytics/${name}`, { headers:coachHeaders });
      assert.equal(r.status, 200, `${name}: coach must get 200`);
      const text = await r.text();
      assert.equal(text.includes('"ip"'), false, `${name}: no ip key in payload`);
      assert.equal(text.includes('user_agent'), false, `${name}: no user agent in payload`);
      return JSON.parse(text);
    };

    const summary = await get('summary');
    assert.equal(summary.cards.pageviews, 3, '/, /about and /magazine are recorded; /coach/login is not');
    assert.equal(summary.cards.visitors, 1);
    assert.equal(summary.cards.sessions, 1);
    assert.equal(summary.online_now.length, 1);
    assert.match(summary.online_now[0].visitor_label, /^visitor_/);

    const pages = await get('pages');
    assert.deepEqual(pages.pages.map(row => row.path).sort(), ['/', '/about', '/magazine']);
    assert.equal(pages.pages.some(row => String(row.path).startsWith('/coach/')), false);

    const visitors = await get('visitors');
    assert.equal(visitors.total, 1);
    assert.equal(visitors.items[0].visitor_id, visitorId);
    assert.equal(visitors.items[0].views, 3);
    assert.equal(visitors.recent.length, 3);

    const detail = await (async () => {
      const r = await fetch(`${BASE}/api/coach/analytics/visitors/${visitorId}`, { headers:coachHeaders });
      assert.equal(r.status, 200);
      return r.json();
    })();
    assert.equal(detail.pageviews, 3);
    const missing = await fetch(`${BASE}/api/coach/analytics/visitors/visitor_zzzzzzzzzzzz`, { headers:coachHeaders });
    assert.equal(missing.status, 404);

    const timeseries = await get('timeseries');
    assert.equal(timeseries.daily[timeseries.daily.length - 1].views, 3);

    const sources = await get('sources');
    assert.ok(sources.sources.find(row => row.name === 'Google'), 'referer google must classify as Google');

    const funnel = await get('funnel');
    assert.equal(funnel.stages[0].count, 1);
    const journey = await get('journey');
    assert.equal(journey.steps[0].label, 'صفحه اصلی');
    await get('devices');
    await get('geo');

    const wide = await (async () => {
      const r = await fetch(`${BASE}/api/coach/analytics/summary?range=90d`, { headers:coachHeaders });
      assert.equal(r.status, 200);
      return r.json();
    })();
    assert.equal(wide.range.preset, '90d', 'the 90-day preset must work over HTTP');

    // شاگرد واقعی ⇒ ۴۰۱ روی همه
    const mobile = '0912' + String(Math.floor(Math.random() * 9000000) + 1000000);
    const register = await fetch(BASE + '/api/student/register', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ full_name:'شاگرد داشبورد آزمایشی', mobile, password:'YasnaDashPass1', date_of_birth:'1370/05/15', province:'تهران', city:'تهران', address:'تهران، خیابان آزمایشی، پلاک ۱' }),
    });
    assert.equal(register.status, 201, 'student register must work: ' + (await register.text()).slice(0, 120));
    const studentCookie = (typeof register.headers.getSetCookie === 'function' ? register.headers.getSetCookie() : [register.headers.get('set-cookie')]).find(line => line && line.startsWith('yasnafit_student_session=')).split(';')[0];
    for(const name of ENDPOINTS){
      const r = await fetch(`${BASE}/api/coach/analytics/${name}`, { headers:{ Cookie:studentCookie } });
      assert.equal(r.status, 401, `${name}: a signed-in student must get 401`);
    }
    const studentDetail = await fetch(`${BASE}/api/coach/analytics/visitors/${visitorId}`, { headers:{ Cookie:studentCookie } });
    assert.equal(studentDetail.status, 401, 'student must not read visitor details');

    // بازدیدکننده با کوکی yasnafit_vid هم فقط مهمان است
    const visitorView = await fetch(`${BASE}/api/coach/analytics/summary`, { headers:{ Cookie:vidCookie } });
    assert.equal(visitorView.status, 401);

    // پوستهٔ SPA مسیر جدید
    const shellAnon = await fetch(BASE + '/coach/analytics', { redirect:'manual' });
    assert.equal(shellAnon.status, 303, 'anonymous visits to the page must land on the login screen');
    assert.equal(shellAnon.headers.get('location'), '/coach/login');
    const shell = await fetch(BASE + '/coach/analytics', { headers:{ Cookie:coachCookie } });
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /app\.js/, 'the coach shell must load for /coach/analytics');

    // مسیر قدیمی همچنان زنده است
    const legacyApi = await fetch(`${BASE}/api/analytics/visits?days=7`, { headers:coachHeaders });
    assert.equal(legacyApi.status, 200, 'the legacy visits API stays');

    results['13_http_real_data_and_access'] = true;
    results['14_http_student_denied'] = true;
    results['15_http_spa_shell'] = true;
  } finally {
    server.kill('SIGKILL');
    fs.rmSync(dir, { recursive:true, force:true });
  }
}

httpPart().then(() => {
  const names = Object.keys(results);
  assert.equal(names.length, 15, 'all dashboard checks must run: ' + names.join(','));
  console.log(JSON.stringify({ ok:true, cases:names.length, results }));
}).catch(error => {
  console.error(error);
  process.exit(1);
});
