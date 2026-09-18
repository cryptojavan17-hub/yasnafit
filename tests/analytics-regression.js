#!/usr/bin/env node
'use strict';
// رگرسیون تحلیل بازدید + ربات حرفه‌ای تلگرام — با دیتابیس درون‌حافظه و ترنسپورت قلابی
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const migrations = read('src/migrations.js');
const analyticsSrc = read('src/analytics-service.js');
const telegramSrc = read('src/telegram-service.js');
const core = read('public/core.js');
const app = read('public/app.js');
const styles = read('public/styles.css');

// ─── دیتابیس واقعی درون‌حافظه + مهاجرت‌ها ───
const { migrations: MIGRATIONS, runMigrations } = require(path.join(root, 'src/migrations.js'));
const db = new DatabaseSync(':memory:');
runMigrations(db);
assert.ok(MIGRATIONS.some(m => m.id === '034_site_analytics'), 'the site analytics migration must exist');

const analytics = require(path.join(root, 'src/analytics-service.js'));
const telegram = require(path.join(root, 'src/telegram-service.js'));
process.env.TELEGRAM_BOT_TOKEN = 'test-token'; // برای مسیر ترنسپورت قلابی؛ هیچ تماس واقعی رخ نمی‌دهد
telegram.reloadConfig();

// ─── ۱. تشخیص دستگاه/مرورگر/بات ───
assert.deepEqual(analytics.parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1 Version/17.0 Mobile/15E148 Safari/604.1'), { device: 'mobile', browser: 'Safari', os: 'iOS' });
assert.equal(analytics.parseUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0)').device, 'tablet');
assert.equal(analytics.parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537').device, 'desktop');
assert.equal(analytics.parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0').browser, 'Chrome');
assert.equal(analytics.parseUserAgent('Mozilla/5.0 (Windows NT) Edg/120.0').browser, 'Edge');
assert.equal(analytics.isBotUserAgent('curl/8.0'), true);
assert.equal(analytics.isBotUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome Mobile'), false);
assert.equal(analytics.isPrivateIp('127.0.0.1'), true);
assert.equal(analytics.isPrivateIp('5.253.10.9'), false);

// ─── ۲. ثبت بازدید واقعی (بات‌ها نه؛ IPهای خصوصی با برچسب شبکهٔ محلی) ───
assert.equal(analytics.recordVisit(db, { ip: '5.253.10.9', path: '/', userAgent: 'Mozilla/5.0 (iPhone) Safari' }), true);
assert.equal(analytics.recordVisit(db, { ip: '31.7.90.11', path: '/coach/login', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }), true);
assert.equal(analytics.recordVisit(db, { ip: '127.0.0.1', path: '/', userAgent: 'Mozilla/5.0 (X11; Linux) Firefox/121' }), true);
assert.equal(analytics.recordVisit(db, { ip: '1.2.3.4', path: '/', userAgent: 'curl/8.0' }), false, 'bots must not be counted');
const resolved = analytics.resolveIps(db, ['127.0.0.1'], async () => { throw new Error('no network in test'); });
const cachedLocal = db.prepare("SELECT country_code FROM ip_geo_cache WHERE ip='127.0.0.1'").get();
assert.equal(cachedLocal.country_code, 'LN', 'private IPs must be labeled as local network without any network call');
analytics.backfillGeo(db);
assert.ok(db.prepare('SELECT COUNT(*) n FROM site_visits WHERE ip=? AND country_code=?').get('127.0.0.1','LN').n >= 1, 'the geo backfill must stamp existing visit rows');

// ─── ۳. خلاصهٔ آماری ───
const summary = analytics.visitSummary(db, 30);
assert.equal(summary.summary.total_views, 3, 'bot requests must not appear in the totals');
assert.equal(summary.summary.total_ips, 3);
assert.ok(summary.recent.length === 3 && summary.recent[0].path === '/', 'the most recent visit comes first');
assert.ok(summary.devices.some(d => d.device === 'mobile') && summary.devices.some(d => d.device === 'desktop'));

// ─── ۴. ثبت بازدید باید به نقاط سرو HTML سرور وصل باشد ───
for(const marker of ["analyticsService.recordVisit(db,{ip:requestSecurity.clientIp(req),path:'/',userAgent:req.headers['user-agent']})",
                     "analyticsService.recordVisit(db,{ip:requestSecurity.clientIp(req),path:url.pathname,userAgent:req.headers['user-agent']})"]){
  assert.ok(server.includes(marker), 'server must record visits at HTML serve points: ' + marker.slice(0, 70));
}
assert.match(server, /analyticsService\.cleanup\(db\)/, 'old visits must be pruned on boot');
assert.match(server, /analyticsService\.startGeoResolver\(db\)/, 'the geo resolver must start on boot');
assert.match(server, /if\(p\.startsWith\('\/api\/analytics\/'\)\)\{\s*if\(requireCoach\(req,res\)\) return true;/, 'the analytics API must be coach-only');
assert.match(server, /telegramService\.registerCommands\(\)\.catch\(\(\)=>\{\}\);/, 'bot menu commands must be registered when configured');

async function main(){
// ─── ۵. ربات: منوی مربی با دکمه‌های واقعی (رفتار واقعی با db واقعی و ترنسپورت قلابی) ───

db.prepare(`INSERT INTO students(id,stable_id,full_name,case_number) VALUES(7,'sb7','شاگرد آزمون','100070')`).run();
db.prepare(`INSERT INTO telegram_coach_accounts(stable_id,coach_id,chat_id,status) VALUES('tca1',1,'111','active')`).run();
db.prepare(`INSERT INTO telegram_accounts(stable_id,student_id,chat_id,status) VALUES('ta1',7,'222','active')`).run();
const sent = [];
telegram.setTransport(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: {} }; });

async function send(text, chatId){ return telegram.handleUpdate(db, { message: { chat: { id: chatId }, from: { id: chatId, username: 'u' }, text } }); }
async function tap(data, chatId){ return telegram.handleUpdate(db, { callback_query: { id: 'cb', data, from: { id: chatId }, message: { chat: { id: chatId } } } }); }

// /start مهمان → خوش‌آمد دوگانه + آموزش اتصال
await send('/start', 999);
assert.ok(/به ربات/.test(sent.at(-1).payload.text) && /کد-اتصال/.test(sent.at(-1).payload.text), 'guest /start must explain both link paths');

// /start مربی → منوی مدیریتی با آمار بازدید
await send('/start', 111);
let last = sent.at(-1).payload;
assert.match(last.text, /پنل مدیریت یسنا فیت/);
const coachRows = last.reply_markup.inline_keyboard.flat().map(b => b.text + '|' + (b.callback_data || b.url || ''));
assert.ok(coachRows.some(x => x.includes('📈 آمار بازدید سایت') && x.includes('coach:visits')), 'coach menu must include the visits button');
assert.ok(coachRows.some(x => x.includes('coach:pending')) && coachRows.some(x => x.includes('coach:students')), 'coach menu must include pending + students');

// دکمهٔ آمار بازدید → پیام آمار واقعی
await tap('coach:visits', 111);
last = sent.at(-1).payload;
assert.match(last.text, /آمار بازدید سایت/);
assert.match(last.text, /IP یکتا/);
assert.ok(sent.some(x => x.method === 'answerCallbackQuery'), 'inline taps must be acknowledged');

// دکمهٔ ارزیابی‌های در انتظار (خالی → پیام مؤدبانه)
await tap('coach:pending', 111);
assert.match(sent.at(-1).payload.text, /در انتظار بررسی نیست/);

// /visits مستقیم هم کار کند
await send('/visits', 111);
assert.match(sent.at(-1).payload.text, /آمار بازدید/);

// /start شاگرد → منوی شاگرد با دکمه‌های زنده (بدون noop)
await send('/start', 222);
const stuRows = sent.at(-1).payload.reply_markup.inline_keyboard.flat().map(b => b.callback_data || b.url || '');
assert.ok(stuRows.includes('stu:program') && stuRows.includes('stu:settings'), 'student menu buttons must be live callbacks');
assert.ok(!stuRows.some(x => String(x).startsWith('noop:')), 'noop buttons are not allowed anymore');

// دکمهٔ برنامه تمرینی شاگرد → پاسخ واقعی
await tap('stu:program', 222);
assert.match(sent.at(-1).payload.text, /برنامه تمرینی/);

// ─── ۶. صفحهٔ پنل مربی ───
assert.match(app, /\['آمار بازدید','\/coach\/visits'\]/, 'the sidebar must contain the visits page');
assert.match(app, /route==='\/coach\/visits' && window\.renderVisitAnalytics/, 'the route must be wired');
assert.match(core, /window\.renderVisitAnalytics=async function/, 'the visits renderer must exist');
assert.match(core, /api\/analytics\/visits\?days=/, 'the renderer must call the analytics API');
assert.match(core, /آخرین بازدیدها/, 'the page must show recent visits');
assert.match(core, /IPهای یکتا/, 'the page must show unique IPs');
assert.match(styles, /§۲۴ — آمار بازدید سایت/, 'the analytics styles must exist');
assert.match(styles, /@media\(max-width:680px\)\{\.visit-table/, 'the analytics page must be mobile-ready');

// ─── ۷. ثبت دستورات ربات (setMyCommands) ───
assert.match(telegramSrc, /setMyCommands/, 'the bot must register its command menu with Telegram');
assert.doesNotMatch(telegramSrc, /callback_data: 'noop:/, 'dead noop buttons must not exist in the bot');

console.log(JSON.stringify({ ok: true, ua_parse: true, visits_recorded: 2, geo_local: true, coach_menu: true, student_menu: true, panel_page: true }));
}
main().catch(error=>{ console.error(error && error.message || error); process.exit(1); });
