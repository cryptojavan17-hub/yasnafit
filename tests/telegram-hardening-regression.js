#!/usr/bin/env node
'use strict';
// رگرسیون امنیتی/عملکردی ربات — فقط ترنسپورت قلابی. هیچ درخواستی به تلگرام واقعی زده نمی‌شود.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const telegramService = require('../src/telegram-service');
const notificationService = require('../src/notification-service');
const requestSecurity = require('../src/request-security');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const RAW_NAME = 'مهدی <3 عباسی & Co';
const ESCAPED_NAME = 'مهدی &lt;3 عباسی &amp; Co';
const PRIVATE_CHAT = 424242;
const COACH_CHAT = 818181;

function startUpdate(updateId, chatId, type, text, fromId){
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      chat: { id: chatId, type },
      from: { id: fromId == null ? chatId : fromId, username: 'tester' },
      text,
    },
  };
}

async function main(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-tg-hard-'));
  const db = new DatabaseSync(path.join(dir, 'telegram.db'));
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  const sent = [];
  const results = {};
  try{
    process.env.TELEGRAM_BOT_TOKEN = 'test:hardening';
    process.env.TELEGRAM_BOT_USERNAME = 'yasnafitbot';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-webhook-secret';
    delete process.env.TELEGRAM_POLLING;
    telegramService.reloadConfig();
    telegramService.stopPolling();
    notificationService.stopRetryLoop();
    telegramService.setTransport(async (method, payload) => {
      sent.push({ method, payload });
      return { ok: true, result: { message_id: sent.length, username: 'yasnafitbot', first_name: 'ربات آزمایشی' } };
    });
    assert.equal(telegramService.isConfigured(), true);

    db.prepare('INSERT INTO students(full_name,stable_id,mobile) VALUES(?,?,?)').run(RAW_NAME, 'tg-hard-1', '09120000991');
    const studentId = db.prepare("SELECT id FROM students WHERE stable_id='tg-hard-1'").get().id;
    db.prepare("INSERT INTO training_programs(stable_id,student_id,title,status,start_date,end_date) VALUES('tg-hard-prog',?,'برنامه <قوی> & تست','ACTIVE','2026-09-01','2026-09-30')").run(studentId);

    const link = telegramService.createLinkToken(db, studentId);
    const tokenRow = () => telegramService.findLinkToken(db, link.link_code);
    const connectedCount = () => db.prepare("SELECT COUNT(*) n FROM notification_deliveries WHERE type='TELEGRAM_CONNECTED'").get().n;

    // ۱. گروه: لینک نشود، توکن مصرف نشود، اعلان ثبت نشود، پاسخ کوتاه.
    sent.length = 0;
    const groupRes = await telegramService.handleUpdate(db, startUpdate(1, -1001112223334, 'group', `/start ${link.link_code}`, 42));
    assert.equal(groupRes.link_rejected, 'non_private');
    assert.equal(telegramService.activeAccount(db, studentId), null);
    assert.equal(tokenRow().consumed_at, null);
    assert.equal(connectedCount(), 0);
    assert.ok(sent.some(m => m.method === 'sendMessage' && /گفتگوی خصوصی/.test(m.payload.text)));
    assert.ok(sent.every(m => !String(m.payload && m.payload.text || '').includes(link.link_code)));
    results.group_rejected = true;

    // ۲. سوپرگروه همان توکن را هم مصرف نمی‌کند.
    sent.length = 0;
    const superRes = await telegramService.handleUpdate(db, startUpdate(2, -1009876543210, 'supergroup', `/start ${link.link_code}`, 43));
    assert.equal(superRes.link_rejected, 'non_private');
    assert.equal(tokenRow().consumed_at, null);
    assert.equal(connectedCount(), 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM telegram_accounts WHERE chat_id=?').get('-1009876543210').n, 0);
    results.supergroup_rejected = true;

    // ۳. هر نوع دیگر (کانال) هم رد می‌شود.
    const channelRes = await telegramService.handleUpdate(db, startUpdate(3, 555000111, 'channel', `/start ${link.link_code}`, 44));
    assert.equal(channelRes.link_rejected, 'non_private');
    assert.equal(tokenRow().consumed_at, null);
    results.other_type_rejected = true;

    // ۴. شناسهٔ منفی حتی از مسیر مستقیم linkChat قابل اتصال نیست.
    assert.throws(() => telegramService.linkChat(db, studentId, { chat_id: '-1001234567890', type: 'supergroup' }), /گروهی|خصوصی/);
    assert.throws(() => telegramService.linkChat(db, studentId, { chat_id: '555000111', type: 'channel' }), /خصوصی/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_accounts WHERE chat_id LIKE '-%'").get().n, 0);
    results.negative_id_blocked_in_linkchat = true;

    // ۵. همان توکن بعد از رد گروه، در چت خصوصی وصل می‌شود و نام HTML-escape می‌شود.
    sent.length = 0;
    const privateRes = await telegramService.handleUpdate(db, startUpdate(4, PRIVATE_CHAT, 'private', `/start ${link.link_code}`, PRIVATE_CHAT));
    assert.equal(privateRes.linked, studentId);
    assert.ok(tokenRow().consumed_at, 'private chat must consume the token that groups left unused');
    assert.equal(String(telegramService.activeAccount(db, studentId).chat_id), String(PRIVATE_CHAT));
    const confirm = sent.find(m => m.method === 'sendMessage' && /متصل شد/.test(m.payload.text || ''));
    assert.ok(confirm, 'private link must confirm in Persian');
    assert.ok(confirm.payload.text.includes(ESCAPED_NAME), 'student name must be HTML-escaped');
    assert.equal(confirm.payload.text.includes(RAW_NAME), false);
    assert.equal(confirm.payload.parse_mode, 'HTML');
    results.private_link_and_html_escape = true;

    // ۶. /status همان نام را escape می‌کند.
    sent.length = 0;
    await telegramService.handleUpdate(db, startUpdate(5, PRIVATE_CHAT, 'private', '/status', PRIVATE_CHAT));
    const statusMsg = sent.find(m => m.method === 'sendMessage');
    assert.ok(statusMsg && statusMsg.payload.text.includes(ESCAPED_NAME));
    assert.equal(statusMsg.payload.text.includes('مهدی <3'), false);
    results.status_html_escape = true;

    // ۷. /program سالم می‌ماند و عنوان HTML را escape می‌کند.
    sent.length = 0;
    const programRes = await telegramService.handleUpdate(db, startUpdate(6, PRIVATE_CHAT, 'private', '/program', PRIVATE_CHAT));
    assert.equal(programRes.handled, true);
    const programMsg = sent.find(m => m.method === 'sendMessage' && /برنامه/.test(m.payload.text || ''));
    assert.ok(programMsg);
    assert.ok(programMsg.payload.text.includes('برنامه &lt;قوی&gt; &amp; تست'));
    assert.equal(programMsg.payload.text.includes('<قوی>'), false);
    results.program_intact = true;

    // ۸. صاحب چت preference را عوض می‌کند؛ کاربر دیگر نه، و دیتابیس عوض نمی‌شود.
    const beforeWorkout = Number(telegramService.preferences(db, studentId).workout);
    sent.length = 0;
    const ownerToggle = await telegramService.handleUpdate(db, {
      update_id: 7,
      callback_query: { id: 'cb-owner', data: 'pref:workout', from: { id: PRIVATE_CHAT }, message: { chat: { id: PRIVATE_CHAT, type: 'private' } } },
    });
    assert.equal(ownerToggle.handled, true);
    assert.equal(Number(telegramService.preferences(db, studentId).workout), beforeWorkout === 1 ? 0 : 1);
    results.owner_preference = true;

    const frozen = Number(telegramService.preferences(db, studentId).workout);
    const prefUpdatedAt = db.prepare('SELECT updated_at FROM notification_preferences WHERE student_id=?').get(studentId).updated_at;
    sent.length = 0;
    const stranger = await telegramService.handleUpdate(db, {
      update_id: 8,
      callback_query: { id: 'cb-stranger', data: 'pref:nutrition', from: { id: 999001 }, message: { chat: { id: PRIVATE_CHAT, type: 'private' } } },
    });
    assert.equal(stranger.forbidden, true);
    assert.equal(Number(telegramService.preferences(db, studentId).workout), frozen);
    assert.equal(Number(telegramService.preferences(db, studentId).nutrition), 1);
    assert.equal(db.prepare('SELECT updated_at FROM notification_preferences WHERE student_id=?').get(studentId).updated_at, prefUpdatedAt);
    assert.ok(sent.some(m => m.method === 'answerCallbackQuery' && /صاحب این حساب/.test(m.payload.text || '')));
    assert.ok(!sent.some(m => m.method === 'sendMessage'));
    results.stranger_preference_rejected = true;

    // ۹. دکمهٔ مردهٔ شاگرد به همان /notifications وصل است.
    notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, title: 'اعلان دکمه شاگرد', body: 'متن آزمایشی', dedupKey: 'harden:stu-notifs' });
    await new Promise(r => setTimeout(r, 80));
    sent.length = 0;
    const stuBtn = await telegramService.handleUpdate(db, {
      update_id: 9,
      callback_query: { id: 'cb-stu-notifs', data: 'stu:notifs', from: { id: PRIVATE_CHAT }, message: { chat: { id: PRIVATE_CHAT, type: 'private' } } },
    });
    assert.equal(stuBtn.handled, true);
    assert.ok(sent.some(m => m.method === 'sendMessage' && /اعلان دکمه شاگرد/.test(m.payload.text || '')), 'stu:notifs must show that student notifications');
    sent.length = 0;
    await telegramService.handleUpdate(db, startUpdate(10, PRIVATE_CHAT, 'private', '/notifications', PRIVATE_CHAT));
    assert.ok(sent.some(m => /اعلان‌های اخیر/.test(m.payload.text || '') && /اعلان دکمه شاگرد/.test(m.payload.text || '')), '/notifications must keep working');
    results.student_notifs_button = true;

    // ۱۰. دکمهٔ مردهٔ مربی به همان اعلان‌های مدیریتی وصل است.
    const coachLink = telegramService.createCoachLinkToken(db);
    const coachGroup = await telegramService.handleUpdate(db, startUpdate(11, -100555, 'group', `/start ${coachLink.link_code}`, 70));
    assert.equal(coachGroup.link_rejected, 'non_private');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM telegram_coach_link_tokens WHERE consumed_at IS NULL AND revoked_at IS NULL').get().n, 1);
    const coachOk = await telegramService.handleUpdate(db, startUpdate(12, COACH_CHAT, 'private', `/start ${coachLink.link_code}`, COACH_CHAT));
    assert.equal(coachOk.linked_coach, 1);
    notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, audience: 'coach', title: 'اعلان دکمه مربی', dedupKey: 'harden:coach-notifs' });
    await new Promise(r => setTimeout(r, 100));
    sent.length = 0;
    const coachBtn = await telegramService.handleUpdate(db, {
      update_id: 13,
      callback_query: { id: 'cb-coach-notifs', data: 'coach:notifs', from: { id: COACH_CHAT }, message: { chat: { id: COACH_CHAT, type: 'private' } } },
    });
    assert.equal(coachBtn.handled, true);
    assert.ok(sent.some(m => m.method === 'sendMessage' && /اعلان دکمه مربی/.test(m.payload.text || '')), 'coach:notifs must show coach notifications');
    results.coach_notifs_button = true;

    // ۱۱. کیبورد تنظیمات چندردیفه است، نه پنج دکمه در یک ردیف.
    sent.length = 0;
    await telegramService.handleUpdate(db, startUpdate(14, PRIVATE_CHAT, 'private', '/settings', PRIVATE_CHAT));
    const settings = sent.find(m => m.payload && m.payload.reply_markup);
    const rows = settings.payload.reply_markup.inline_keyboard;
    assert.ok(rows.length >= 3);
    assert.ok(rows.every(row => row.length <= 2));
    assert.equal(rows.flat().length, 5);
    results.settings_keyboard = true;

    // ۱۲. پیام بلند (مسیر /visits هم از همین sendMessage می‌گذرد) از ۴۰۹۶ رد نمی‌شود.
    const long = Array.from({ length: 80 }, (_, i) => `ردیف ${i} — متن بازدید آزمایشی برای رد نشدن از حد پیام تلگرام`).join('\n');
    assert.ok(long.length > telegramService.LIMITS.TELEGRAM_TEXT_LIMIT);
    sent.length = 0;
    await telegramService.sendMessage(db, PRIVATE_CHAT, long);
    const chunks = sent.filter(m => m.method === 'sendMessage').map(m => m.payload.text);
    assert.ok(chunks.length >= 2, 'long text must be paginated');
    assert.ok(chunks.every(text => text.length <= 4096));
    assert.ok(chunks.join('\n').includes('ردیف 0') && chunks.join('\n').includes('ردیف 79'));
    results.message_paginated = true;

    // ۱۳. /visits واقعی هم از حد رد نمی‌شود.
    const analytics = require('../src/analytics-service');
    analytics.recordVisit(db, { ip: '20.1.1.1', path: '/', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' });
    sent.length = 0;
    await telegramService.handleUpdate(db, startUpdate(15, COACH_CHAT, 'private', '/visits', COACH_CHAT));
    const visitMsgs = sent.filter(m => m.method === 'sendMessage').map(m => m.payload.text);
    assert.ok(visitMsgs.some(text => /آمار بازدید سایت/.test(text)));
    assert.ok(visitMsgs.every(text => text.length <= 4096));
    results.visits_within_limit = true;

    // ۱۴. ذخیرهٔ توکن بعد از startup حلقهٔ retry را روشن می‌کند و registerCommands را صدا می‌زند.
    notificationService.stopRetryLoop();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    telegramService.reloadConfig();
    telegramService.applyDbSettings(db);
    db.prepare("DELETE FROM settings WHERE key IN ('telegram_bot_token','telegram_bot_username','telegram_webhook_secret','yasnafit_public_url','telegram_polling')").run();
    telegramService.applyDbSettings(db);
    assert.equal(telegramService.isConfigured(), false);
    assert.equal(notificationService.isRetryLoopRunning(), false);
    sent.length = 0;
    const saved = telegramService.saveCoachSettings(db, { bot_token: 'test:panel-only', bot_username: 'yasnafitbot', polling: false });
    assert.equal(saved.configured, true);
    assert.equal(notificationService.isRetryLoopRunning(), false, 'saving alone must not be enough; the panel route arms runtime');
    assert.ok(!JSON.stringify(saved).includes('panel-only'));
    const armed = await telegramService.armConfiguredRuntime(db);
    assert.equal(armed.retry_loop, true);
    assert.equal(armed.commands_registered, true);
    assert.equal(notificationService.isRetryLoopRunning(), true);
    assert.ok(sent.some(m => m.method === 'setMyCommands'));
    results.retry_and_commands_after_save = true;

    // ۱۵. شکست registerCommands ذخیرهٔ توکن را fail نمی‌کند.
    telegramService.setTransport(async (method, payload) => {
      sent.push({ method, payload });
      if(method === 'setMyCommands') return { ok: false, description: 'commands_unavailable' };
      return { ok: true, result: { message_id: 1 } };
    });
    const failedArm = await telegramService.armConfiguredRuntime(db);
    assert.equal(failedArm.commands_registered, false);
    assert.equal(failedArm.configured, true);
    assert.equal(telegramService.isConfigured(), true);
    assert.equal(telegramService.settingsView(db).configured, true);
    results.command_registration_failure_isolated = true;

    // ۱۶. شکست موقت ارسال با مکانیزم retry موجود دوباره پردازش می‌شود؛ dedup سالم می‌ماند.
    let failOnce = true;
    telegramService.setTransport(async () => {
      if(failOnce){ failOnce = false; return { ok: false, description: 'network_error: ECONNRESET' }; }
      return { ok: true, result: { message_id: 1 } };
    });
    const queued = notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, title: 'تلاش مجدد', dedupKey: 'harden:retry' });
    assert.equal(queued.queued, true);
    await new Promise(r => setTimeout(r, 80));
    let retryRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='harden:retry'").get();
    assert.equal(retryRow.status, 'retrying');
    db.prepare("UPDATE notification_deliveries SET next_attempt_at=datetime('now','-1 minute') WHERE dedup_key='harden:retry'").run();
    await notificationService.processDue(db, { pauseMs: 0 });
    retryRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='harden:retry'").get();
    assert.equal(retryRow.status, 'sent');
    const duplicate = notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, title: 'تلاش مجدد', dedupKey: 'harden:retry' });
    assert.equal(duplicate.deduplicated, true);
    results.retry_and_dedup = true;

    // ۱۷. timeout پولینگ از ۲۵ثانیهٔ getUpdates بلندتر است و تماس معمولی ۱۵ثانیه می‌ماند.
    const calls = [];
    telegramService.setTransport(async (method, payload, timeoutMs) => {
      calls.push({ method, timeoutMs, payloadTimeout: payload && payload.timeout });
      return { ok: true, result: [] };
    });
    telegramService.stopPolling();
    assert.equal(await telegramService.startPolling(db), true);
    await new Promise(r => setTimeout(r, 180));
    telegramService.stopPolling();
    const updates = calls.filter(c => c.method === 'getUpdates');
    assert.ok(updates.length >= 1);
    assert.equal(updates[0].payloadTimeout, 25);
    assert.ok(updates[0].timeoutMs > 25000);
    assert.ok(updates[0].timeoutMs > telegramService.LIMITS.API_TIMEOUT_MS);
    await telegramService.callApi('getMe', {});
    assert.equal(calls.filter(c => c.method === 'getMe').at(-1).timeoutMs, 15000);
    assert.equal(telegramService.LIMITS.API_TIMEOUT_MS, 15000);
    assert.equal(telegramService.LIMITS.POLLING_HTTP_TIMEOUT_MS, 35000);
    results.polling_timeout_aligned = true;

    // ۱۸. سیم‌کشی سرور: webhook با sameOrigin هماهنگ است ولی وب‌هوک بدون Origin نمی‌شکند؛ startup ثبت دستورها باقی است.
    const server = read('server.js');
    const hookAt = server.indexOf("p==='/api/telegram/webhook'");
    const hook = server.slice(hookAt, hookAt + 1100);
    assert.match(hook, /sameOrigin\(req\)/);
    assert.match(hook, /x-telegram-bot-api-secret-token/);
    assert.match(hook, /verifyWebhookSecret/);
    assert.match(hook, /setImmediate\(\(\) => \{ telegramService\.handleUpdate/);
    assert.equal(requestSecurity.sameOrigin({ headers: { host: 'yasnafit.ir' }, socket: {} }), true, 'Telegram omits Origin; that must still pass');
    const coachHookAt = server.indexOf('coach\\/telegram\\/webhook');
    assert.ok(coachHookAt > 0);
    assert.match(server.slice(coachHookAt, coachHookAt + 280), /sameOrigin\(req\)/);
    const putAt = server.indexOf("p==='/api/coach/telegram/settings' && req.method==='PUT'");
    assert.match(server.slice(putAt, putAt + 800), /armConfiguredRuntime\(db\)/);
    assert.match(server, /telegramService\.registerCommands\(\)\.catch\(\(\)=>\{\}\);/);
    results.webhook_and_startup_wiring = true;

    // ۱۹. لینک عمومی شاگرد و نمونهٔ env با پیکربندی فعلی ربات یکی است؛ اینستاگرام ورود دست نخورده است.
    const app = read('public/student-app.js');
    assert.ok(app.includes("href:'https://t.me/yasnafitbot'"));
    assert.equal(app.includes('t.me/yasnaa1997'), false);
    assert.ok(app.includes('https://instagram.com/exercise._.yasna._'));
    const example = read('.env.example');
    assert.match(example, /^YASNAFIT_PUBLIC_URL=https:\/\/yasnafit\.ir$/m);
    assert.equal(example.includes('yasnafit-production.up.railway.app'), false);
    results.public_links_aligned = true;

    const scenarioCount = Object.keys(results).length;
    assert.ok(scenarioCount >= 13, 'at least 13 security/functional scenarios');
    console.log(JSON.stringify({ ok: true, scenarios: scenarioCount, results, telegram_called: false }));
  }finally{
    telegramService.stopPolling();
    notificationService.stopRetryLoop();
    telegramService.setTransport(null);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    telegramService.reloadConfig();
    try{ db.close(); }catch(error){}
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
