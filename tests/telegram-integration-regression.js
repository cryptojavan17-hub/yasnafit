#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const telegramService = require('../src/telegram-service');
const notificationService = require('../src/notification-service');
const engagement = require('../src/engagement-service');

async function main(){
// ─── محیط تست: دیتابیس موقت + پیکربندی ماک تلگرام (هیچ درخواست واقعی تلگرام زده نمی‌شود) ───
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-telegram-'));
const db = new DatabaseSync(path.join(dir, 'telegram.db'));
db.exec('PRAGMA foreign_keys=ON');
runMigrations(db);

db.prepare("INSERT INTO students(full_name,stable_id,mobile) VALUES('شاگرد تلگرام','tg-student-1','09120000001')").run();
const studentId = db.prepare("SELECT id FROM students WHERE stable_id='tg-student-1'").get().id;

// پیکربندی از همان مسیر env که production می‌خواند
process.env.TELEGRAM_BOT_TOKEN = 'test:token';
process.env.TELEGRAM_BOT_USERNAME = 'yasna_test_bot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
telegramService.reloadConfig();
assert.ok(telegramService.isConfigured(), 'config must load from env');

// ─── ۱. اتصال حساب با توکن یک‌بارمصرف معتبر (فلوط واقعی /start) ───
const link = telegramService.createLinkToken(db, studentId);
assert.match(link.link_code, /^[A-Za-z0-9_-]{20,}$/);
assert.equal(link.bot_username, 'yasna_test_bot');
assert.ok(link.deep_link.includes('t.me/yasna_test_bot?start='));

let sent = [];
telegramService.setTransport(async (method, payload) => {
  sent.push({ method, payload });
  return { ok: true, result: { message_id: sent.length } };
});

const startResult = await telegramService.handleUpdate(db, { update_id: 1, message: { message_id: 1, chat: { id: 555001 }, from: { id: 9001, username: 'mahdi_tg' }, text: `/start ${link.link_code}` } });
assert.equal(startResult.linked, studentId, 'valid link code must connect the account');
const account = telegramService.activeAccount(db, studentId);
assert.ok(account);
assert.equal(account.chat_id, '555001');
assert.equal(account.telegram_username, 'mahdi_tg');
assert.ok(sent.some(m => m.method === 'sendMessage' && /متصل شد/.test(m.payload.text)), 'bot must confirm linking in Persian');
const prefs = telegramService.preferences(db, studentId);
for (const key of telegramService.PREFERENCE_KEYS) assert.equal(Number(prefs[key]), 1, `default preference ${key} must be on`);
assert.ok(db.prepare("SELECT 1 FROM notification_deliveries WHERE type='TELEGRAM_CONNECTED'").get(), 'TELEGRAM_CONNECTED must be recorded');

// ─── ۲. توکن نامعتبر ───
sent = [];
const badRes = await telegramService.handleUpdate(db, { update_id: 2, message: { message_id: 2, chat: { id: 555001 }, text: '/start totally-invalid-code-123456' } });
assert.equal(badRes.link_failed, true, 'invalid linking token must fail');
assert.ok(sent.some(m => /کد اتصال نامعتبر/.test(m.payload.text)), 'bot must explain the invalid code in Persian');

// ─── ۳. توکن منقضی ───
const expToken = telegramService.createLinkToken(db, studentId);
const expRow = telegramService.findLinkToken(db, expToken.link_code);
db.prepare("UPDATE telegram_link_tokens SET expires_at='2020-01-01T00:00:00Z' WHERE id=?").run(expRow.id);
sent = [];
const expRes = await telegramService.handleUpdate(db, { update_id: 3, message: { message_id: 3, chat: { id: 555001 }, text: `/start ${expToken.link_code}` } });
assert.equal(expRes.link_failed, true, 'expired token must fail');
assert.ok(sent.some(m => /منقضی/.test(m.payload.text)), 'bot must explain the expired code in Persian');

// ─── ۴. توکن استفاده‌شده دوباره (single-use) ───
sent = [];
const reusedRes = await telegramService.handleUpdate(db, { update_id: 4, message: { message_id: 4, chat: { id: 555001 }, text: `/start ${link.link_code}` } });
assert.equal(reusedRes.already_linked, true, 'a reused code from the same chat is not an error — confirm the existing link');
assert.ok(sent.some(m => /قبلاً به یسنا فیت متصل شده/.test(m.payload.text)), 'bot must confirm the existing connection in Persian');

// ─── ۵. قطع اتصال + اتصال مجدد + مالکیت چت ───
let status = telegramService.statusForStudent(db, studentId);
assert.equal(status.connected, true);
telegramService.unlinkAccount(db, telegramService.activeAccount(db, studentId));
status = telegramService.statusForStudent(db, studentId);
assert.equal(status.connected, false, 'unlinking must deactivate the account');
assert.equal(db.prepare("SELECT status FROM telegram_accounts WHERE student_id=? AND unlinked_at IS NOT NULL").get(studentId).status, 'unlinked');

const relink = telegramService.createLinkToken(db, studentId);
await telegramService.handleUpdate(db, { update_id: 5, message: { message_id: 5, chat: { id: 555001 }, from: { id: 9001 }, text: `/start ${relink.link_code}` } });
assert.equal(telegramService.statusForStudent(db, studentId).connected, true, 'relinking must work');

// یک چت فقط به یک شاگرد: اتصال همان چت به شاگرد دوم، اتصال شاگرد اول را آزاد می‌کند
db.prepare("INSERT INTO students(full_name,stable_id,mobile) VALUES('شاگرد دوم','tg-student-2','09120000002')").run();
const student2 = db.prepare("SELECT id FROM students WHERE stable_id='tg-student-2'").get().id;
const link2 = telegramService.createLinkToken(db, student2);
await telegramService.handleUpdate(db, { update_id: 6, message: { message_id: 6, chat: { id: 555001 }, from: { id: 9001 }, text: `/start ${link2.link_code}` } });
assert.equal(telegramService.statusForStudent(db, studentId).connected, false, 'chat must belong to a single student');
assert.equal(telegramService.statusForStudent(db, student2).connected, true);
const link1b = telegramService.createLinkToken(db, studentId);
await telegramService.handleUpdate(db, { update_id: 7, message: { message_id: 7, chat: { id: 555001 }, from: { id: 9001 }, text: `/start ${link1b.link_code}` } });

// ─── ۶ و ۷. ساخت و تحویل موفق اعلان برنامه ───
sent = [];
const emitted = notificationService.emit(db, { type: 'PROGRAM_ASSIGNED', studentId, entityType: 'training_program', entityId: 42, dedupKey: 'program_assigned:42' });
assert.equal(emitted.queued, true);
await new Promise(r => setTimeout(r, 80));
const delivery = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='program_assigned:42'").get();
assert.equal(delivery.status, 'sent', 'delivery must succeed with a healthy transport');
assert.ok(sent.some(m => m.method === 'sendMessage' && /برنامه تمرینی جدید شما آماده شد/.test(m.payload.text)), 'student must receive the program-ready message');
assert.equal(delivery.attempts, 1);

// ─── ۱۰. جلوگیری از تکرار ───
sent = [];
const again = notificationService.emit(db, { type: 'PROGRAM_ASSIGNED', studentId, entityType: 'training_program', entityId: 42, dedupKey: 'program_assigned:42' });
assert.equal(again.deduplicated, true, 'the same event must be deduplicated');
await new Promise(r => setTimeout(r, 80));
assert.equal(sent.length, 0, 'no duplicate Telegram message may be sent');

// ─── ۸ و ۹. خطای موقت ⇒ retry؛ اتمام تلاش‌ها ⇒ failed ───
let failMode = 'network';
telegramService.setTransport(async () => failMode === 'network' ? { ok: false, description: 'network_error: ECONNRESET' } : { ok: false, error_code: failMode === 'blocked' ? 403 : 400, description: failMode === 'blocked' ? 'Forbidden: bot was blocked by the user' : 'Bad Request: chat not found' });
notificationService.emit(db, { type: 'PROGRAM_UPDATED', studentId, dedupKey: 'program_updated:retry-1' });
await new Promise(r => setTimeout(r, 80));
let retryRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='program_updated:retry-1'").get();
assert.equal(retryRow.status, 'retrying', 'temporary failures must schedule a retry');
assert.equal(retryRow.attempts, 1);
assert.ok(retryRow.next_attempt_at, 'retry must carry next_attempt_at');
for (let i = 0; i < 4; i++) {
  db.prepare("UPDATE notification_deliveries SET next_attempt_at=datetime('now','-1 minute') WHERE dedup_key='program_updated:retry-1'").run();
  await notificationService.processDue(db, { pauseMs: 0 });
}
retryRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='program_updated:retry-1'").get();
assert.equal(retryRow.status, 'failed', 'exhausted retries must end as failed');
assert.equal(retryRow.attempts, retryRow.max_attempts);

// ─── ۱۳. ربات بلاک شده ───
failMode = 'blocked';
notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, dedupKey: 'sys:blocked-test' });
await new Promise(r => setTimeout(r, 80));
const blockedRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='sys:blocked-test'").get();
assert.equal(blockedRow.status, 'cancelled', 'blocked-bot delivery must be cancelled (no pointless retries)');
assert.equal(telegramService.statusForStudent(db, studentId).status, 'blocked', 'account must be marked blocked');

// ─── ۱۴. شناسه چت نامعتبر ───
db.prepare("UPDATE telegram_accounts SET status='active' WHERE student_id=?").run(studentId);
failMode = 'invalid_chat';
notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, dedupKey: 'sys:invalid-chat-test' });
await new Promise(r => setTimeout(r, 80));
const invalidRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='sys:invalid-chat-test'").get();
assert.equal(invalidRow.status, 'cancelled', 'invalid chat id must cancel the delivery');
assert.equal(telegramService.statusForStudent(db, studentId).status, 'invalid');

// ─── ۱۱. شاگرد بدون تلگرام ───
telegramService.setTransport(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: {} }; });
notificationService.emit(db, { type: 'PROGRAM_ASSIGNED', studentId: student2, entityType: 'training_program', entityId: 7, dedupKey: 'program_assigned:7' });
await new Promise(r => setTimeout(r, 80));
const noTgRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='program_assigned:7'").get();
assert.equal(noTgRow.status, 'cancelled', 'a student without Telegram must cancel deliveries gracefully');
assert.match(noTgRow.last_error, /no_active_telegram_account/);

// ─── ۱۲. ترجیح غیرفعال ───
telegramService.setPreference(db, studentId, 'workout', 0);
const silenced = notificationService.emit(db, { type: 'PROGRAM_ASSIGNED', studentId, entityType: 'training_program', entityId: 99, dedupKey: 'program_assigned:99' });
assert.equal(silenced.skipped, 'preference_disabled', 'disabled workout preference must silence the notification');
telegramService.setPreference(db, studentId, 'workout', 1);

// ─── ۱۶. وب‌هوک: امضای مخفی + آپدیت‌های خراب ───
assert.equal(telegramService.verifyWebhookSecret('test-secret').ok, true);
assert.equal(telegramService.verifyWebhookSecret('wrong').ok, false);
assert.equal(telegramService.verifyWebhookSecret(undefined).ok, false);
await telegramService.handleUpdate(db, null);
await telegramService.handleUpdate(db, { weird: true });

// ─── کامندهای ربات (پاسخ فارسی) + کیبورد درون‌خطی ───
sent = [];
await telegramService.handleUpdate(db, { update_id: 10, message: { message_id: 10, chat: { id: 555001 }, from: { id: 9001 }, text: '/help' } });
assert.ok(sent.some(m => /راهنمای ربات یسنا فیت/.test(m.payload.text)), '/help must answer in Persian');
await telegramService.handleUpdate(db, { update_id: 11, message: { message_id: 11, chat: { id: 555001 }, from: { id: 9001 }, text: '/program' } });
assert.ok(sent.some(m => m.method === 'sendMessage' && /برنامه/.test(m.payload.text)), '/program must answer about the program');
await telegramService.handleUpdate(db, { update_id: 12, message: { message_id: 12, chat: { id: 555001 }, from: { id: 9001 }, text: '/settings' } });
assert.ok(sent.some(m => m.payload.reply_markup && m.payload.reply_markup.inline_keyboard), '/settings must send preference toggles');
const before = Number(telegramService.preferences(db, studentId).nutrition);
await telegramService.handleUpdate(db, { update_id: 13, callback_query: { id: 'cb1', data: 'pref:nutrition', from: { id: 9001 }, message: { message_id: 12, chat: { id: 555001 } } } });
assert.equal(Number(telegramService.preferences(db, studentId).nutrition), before === 1 ? 0 : 1, 'inline preference toggle must flip the value');

// ─── ۱۵. تریگر واقعی PROGRAM_ASSIGNED در سرور (بررسی سیم‌کشی) ───
const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.doesNotMatch(serverSrc, /emit\(db,\{type:'PROGRAM_ASSIGNED'/, 'manual per-event emits are replaced by the single in-app mirror');
assert.match(serverSrc, /p==='\/api\/telegram\/webhook'/, 'the webhook endpoint must be mounted');
assert.match(serverSrc, /verifyWebhookSecret\(req\.headers\['x-telegram-bot-api-secret-token'\]\)/, 'the webhook must verify the Telegram secret header');
assert.match(serverSrc, /\/api\/student\/telegram\/link/, 'the student link endpoint must exist');
assert.match(serverSrc, /setImmediate\(\(\) => \{ telegramService\.handleUpdate/, 'webhook must answer 200 immediately and process async (no telegram redeliveries)');

// ─── تنظیمات پنل مربی (ذخیره در جدول settings؛ env اولویت دارد) ───
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_BOT_USERNAME;
telegramService.reloadConfig();
telegramService.setTransport(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: { id: 1, username: 'stub_bot', first_name: 'ربات آزمایشی' } }; });
assert.equal(telegramService.isConfigured(), false, 'without env and DB settings the bot must be off');
const savedView = telegramService.saveCoachSettings(db, { bot_token: '  12345:db-secret-token  ', bot_username: '@db_bot', webhook_secret: 'db-webhook-secret', public_url: 'https://demo.example.com/', polling: true });
assert.equal(savedView.configured, true, 'saving a token from the coach panel must activate the bot');
assert.equal(savedView.source, 'database');
assert.equal(savedView.bot_username, 'db_bot', '@ must be normalized');
assert.equal(savedView.public_url, 'https://demo.example.com', 'trailing slash must be normalized');
assert.match(savedView.token_masked, /••••/, 'token must only ever be exposed masked');
assert.equal(savedView.has_webhook_secret, true);
assert.ok(!JSON.stringify(savedView).includes('db-secret-token'), 'the full token must never leak in the settings view');
assert.equal(telegramService.config().username, 'db_bot', 'saving from the panel must take effect immediately (no restart)');
const testResult = await telegramService.testConnection();
assert.equal(testResult.ok, true, 'connection test must use the active transport');
assert.equal(testResult.bot.username, 'stub_bot');
telegramService.reloadConfig();
assert.equal(telegramService.isConfigured(), false, 'env-only reload must not see DB token');
telegramService.applyDbSettings(db);
assert.equal(telegramService.isConfigured(), true, 'DB settings must survive a config reload (like a server restart)');
process.env.TELEGRAM_BOT_TOKEN = 'test:token';
telegramService.reloadConfig(); telegramService.applyDbSettings(db);
assert.equal(telegramService.settingsSource(db), 'env', 'environment variables must take precedence over panel settings');
delete process.env.TELEGRAM_BOT_TOKEN;
telegramService.reloadConfig(); telegramService.applyDbSettings(db);

// سیم‌کشی سرور: مسیرهای تنظیمات پنل مربی + صفحهٔ تنظیمات
const serverSrc2 = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.match(serverSrc2, /p==='\/api\/coach\/telegram\/settings'/, 'coach settings endpoints must exist');
assert.match(serverSrc2, /telegramService\.applyDbSettings\(db\)/, 'startup must apply panel settings');
assert.match(serverSrc2, /api\/coach\/telegram\/test-message/, 'the real test-message endpoint must exist');
assert.doesNotMatch(serverSrc2, /api\/coach\/telegram\/test'/, 'the redundant getMe test route must be gone');
const appSrc = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.match(appSrc, /'\/settings\/telegram'/, 'the coach menu must contain the telegram settings route');
const tgSettingsSrc = fs.readFileSync(path.join(__dirname, '../public/telegram-settings.js'), 'utf8');
assert.match(tgSettingsSrc, /renderTelegramSettings/, 'the coach settings page renderer must exist');
assert.match(tgSettingsSrc, /api\/coach\/telegram\/webhook/, 'the page must be able to register the webhook');

// ─── جریان واقعی ارزیابی: ASSESSMENT_READY برای مربیِ متصل ───
// اتصال مربی با کد اختصاصی (فلوط واقعی /start)
db.prepare("UPDATE students SET full_name='آرش محمدی' WHERE stable_id='tg-student-1'").run();
const coachLink = telegramService.createCoachLinkToken(db);
assert.match(coachLink.link_code, /^[A-Za-z0-9_-]{20,}$/);
assert.ok(coachLink.deep_link.includes(`t.me/${coachLink.bot_username}?start=`), 'coach deep link must use the configured bot username');
const coachStart = await telegramService.handleUpdate(db, { update_id: 30, message: { message_id: 30, chat: { id: 888001 }, from: { id: 7001, username: 'coach_tg' }, text: `/start ${coachLink.link_code}` } });
assert.equal(coachStart.linked_coach, 1, 'coach link code must connect the coach telegram');
assert.ok(telegramService.coachActiveAccount(db).chat_id === '888001', 'coach account must be active');
assert.ok(sent.some(m => m.method === 'sendMessage' && /پنل یسنا فیت متصل شد/.test(m.payload.text)), 'bot must confirm the coach linking in Persian');
// کد مربی یک‌بارمصرف است
sent = [];
const reusedCoach = await telegramService.handleUpdate(db, { update_id: 31, message: { message_id: 31, chat: { id: 888001 }, from: { id: 7001 }, text: `/start ${coachLink.link_code}` } });
assert.equal(reusedCoach.link_failed, true, 'a reused coach code must fail (single-use)');
assert.ok(sent.some(m => /قبلاً استفاده شده/.test(m.payload.text)), 'bot must explain reuse in Persian');

// رویداد واقعی: همان پارامترهایی که server.js کنار اعلان درون‌برنامه‌ای می‌فرستد
sent = [];
const assessmentEmit = notificationService.emit(db, {
  type: 'ASSESSMENT_READY', studentId, audience: 'coach',
  title: '📋 ارزیابی جدید آماده بررسی است',
  body: '👤 شاگرد: آرش محمدی\n📝 ارزیابی: #1\n\nیک ارزیابی جدید توسط شاگرد تکمیل شده و آماده بررسی شماست.',
  entityType: 'assessment', entityId: 501, dedupKey: 'assessment_ready:501',
});
assert.equal(assessmentEmit.queued, true, 'assessment-ready event must queue a telegram delivery');
await new Promise(r => setTimeout(r, 80));
const assessmentRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='assessment_ready:501'").get();
assert.equal(assessmentRow.status, 'sent', 'coach delivery must succeed with a healthy transport');
assert.equal(assessmentRow.audience, 'coach');
const assessmentMsgs = sent.filter(m => m.method === 'sendMessage' && /آماده بررسی/.test(m.payload.text || ''));
assert.ok(assessmentMsgs.length >= 1, 'a telegram message about the assessment must be sent');
assert.ok(assessmentMsgs.every(m => m.payload.chat_id === '888001'), 'the assessment notification must go to the coach chat — never to the student chat (555001)');
assert.match(assessmentMsgs[0].payload.text, /آرش محمدی/, 'the message must contain the real student name');
assert.match(assessmentMsgs[0].payload.text, /#1/, 'the message must contain the real assessment number');
const tgButton = assessmentMsgs[0].payload.reply_markup && assessmentMsgs[0].payload.reply_markup.inline_keyboard;
assert.ok(tgButton && JSON.stringify(tgButton).includes(`${'https://demo.example.com'}/assessments/501`), 'the مشاهده ارزیابی button must open the existing coach route');
assert.ok(/مشاهده ارزیابی/.test(JSON.stringify(tgButton)), 'the button label must be مشاهده ارزیابی');

// رویداد تکراری همان ارزیابی = یک پیام (dedup پایدار)
const dup = notificationService.emit(db, { type: 'ASSESSMENT_READY', studentId, audience: 'coach', entityType: 'assessment', entityId: 501, dedupKey: 'assessment_ready:501' });
assert.equal(dup.deduplicated, true, 'a duplicate assessment event must be deduplicated');

// مربیِ بدون تلگرام: شاگرد دوم (مربی پیش‌فرض 1 اما اتصال مربی را می‌بُریم)
telegramService.coachUnlinkAccount(db, telegramService.coachActiveAccount(db));
const noCoach = notificationService.emit(db, { type: 'ASSESSMENT_READY', studentId: student2, audience: 'coach', entityType: 'assessment', entityId: 502, dedupKey: 'assessment_ready:502' });
assert.equal(noCoach.queued, true);
await new Promise(r => setTimeout(r, 80));
const noCoachRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='assessment_ready:502'").get();
assert.equal(noCoachRow.status, 'cancelled', 'coach without telegram must cancel gracefully (no crash, no retry storm)');
assert.match(noCoachRow.last_error, /no_active_telegram_account/);

// خطای تلگرام نباید ارسال ارزیابی را بشکند (emit هرگز throw نمی‌کند)
telegramService.setTransport(async () => ({ ok: false, description: 'network_error: ECONNRESET' }));
telegramService.createCoachLinkToken; // (فقط مرجع)
db.prepare("DELETE FROM telegram_coach_accounts").run();
const relinkCoach = telegramService.createCoachLinkToken(db);
await telegramService.handleUpdate(db, { update_id: 32, message: { message_id: 32, chat: { id: 888001 }, from: { id: 7001 }, text: `/start ${relinkCoach.link_code}` } });
const failing = notificationService.emit(db, { type: 'ASSESSMENT_READY', studentId, audience: 'coach', entityType: 'assessment', entityId: 503, dedupKey: 'assessment_ready:503' });
assert.equal(failing.queued, true, 'telegram failure must never break the assessment flow');
await new Promise(r => setTimeout(r, 80));
assert.match(db.prepare("SELECT status FROM notification_deliveries WHERE dedup_key='assessment_ready:503'").get().status, /retrying/, 'telegram failure must land in the normal retry queue');

// اعلان درون‌برنامه‌ای همچنان توسط همان رویداد ساخته می‌شود (سیم‌کشی سرور)
const serverSrc3 = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.match(serverSrc3, /engagementService\.notify\(db,\{audienceType:'coach',studentId,type:'assessment_submitted'/, 'the existing in-app coach notification must stay untouched');
const hookIdx = serverSrc3.indexOf("type:'assessment_submitted'");
const hookChunk = serverSrc3.slice(hookIdx, hookIdx + 900);
assert.match(hookChunk, /ASSESSMENT_READY/, 'ASSESSMENT_READY must be emitted by the same event as the in-app notification');
assert.match(hookChunk, /dedupKey:`assessment_ready:\$\{submitted\.id\}`/, 'dedup key must be stable per assessment');
assert.match(serverSrc3, /api\/coach\/telegram\/connection/, 'coach connection endpoint must exist');
assert.match(serverSrc3, /api\/coach\/telegram\/link/, 'coach link endpoint must exist');
const nsSrc = fs.readFileSync(path.join(__dirname, '../src/notification-service.js'), 'utf8');
assert.match(nsSrc, /ASSESSMENT_READY:\s*\{ category: 'system' \}/, 'ASSESSMENT_READY must be a typed event in the existing notification catalog');
assert.match(nsSrc, /audience === 'coach'\n\s*\? tg\.coachActiveAccount/, 'recipient resolution must use coach_students → telegram_coach_accounts');
const tgSettingsSrc3 = fs.readFileSync(path.join(__dirname, '../public/telegram-settings.js'), 'utf8');
assert.match(tgSettingsSrc3, /اتصال تلگرام مربی/, 'the coach connection card must exist in the settings page');
assert.match(tgSettingsSrc3, /api\/coach\/telegram\/link/, 'the page must fetch coach link codes');

// ─── آینهٔ اعلان‌های درون‌برنامه‌ای شاگرد → تلگرام (engagement.notify → mirror) ───
telegramService.setTransport(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: { message_id: 1 } }; });
telegramService.setPreference(db, studentId, 'nutrition', 1); // (تست تاگل قبلی خاموشش کرده بود)
sent = [];
engagement.notify(db,{audienceType:'student',studentId,type:'diet_program_assigned',title:'برنامه غذایی شما به‌روزرسانی شد',body:'برنامه غذایی «برنامه تست» توسط مربی به‌روزرسانی شد.',entityType:'diet_program',entityId:77});
await new Promise(r => setTimeout(r, 120));
const mirrorRow = db.prepare("SELECT * FROM notification_deliveries WHERE type='NUTRITION_PLAN_READY' AND entity_id=77").get();
if(!mirrorRow) console.log('DBG deliveries:', JSON.stringify(db.prepare("SELECT type,status,audience,last_error FROM notification_deliveries ORDER BY id DESC LIMIT 4").all()), 'NOTIF:', JSON.stringify(db.prepare("SELECT type,audience_type FROM notifications ORDER BY id DESC LIMIT 3").all()));
assert.ok(mirrorRow, 'a student in-app notification must be mirrored to telegram');
assert.equal(mirrorRow.status, 'sent', 'the mirrored notification must be delivered');
assert.ok(sent.some(m => /برنامه غذایی شما به‌روزرسانی شد/.test(m.payload.text || '')), 'the mirrored message must keep the in-app title');

// تصمیم ارزیابی (approved) هم آینه می‌شود
sent = [];
engagement.notify(db,{audienceType:'student',studentId,type:'assessment_approved',title:'پرونده شما تأیید شد',body:'مربی پرونده شما را تأیید کرد.',entityType:'assessment',entityId:55});
await new Promise(r => setTimeout(r, 120));
assert.ok(db.prepare("SELECT 1 FROM notification_deliveries WHERE type='ASSESSMENT_APPROVED' AND entity_id=55").get(), 'assessment decision must reach telegram');

// اعلان مربی (audienceType coach) آینه نمی‌شود
sent = [];
const coachNotifyId = engagement.notify(db,{audienceType:'coach',studentId,type:'assessment_submitted',title:'x',body:'y',entityType:'assessment',entityId:56});
assert.ok(coachNotifyId, 'in-app coach notification still works');
await new Promise(r => setTimeout(r, 120));
assert.equal(sent.length, 0, 'coach-audience in-app notifications must not mirror (ASSESSMENT_READY is emitted explicitly)');

// نوع ناشناخته: درون‌برنامه‌ای می‌ماند، تلگرام رد می‌شود
sent = [];
engagement.notify(db,{audienceType:'student',studentId,type:'some_unknown_type',title:'t',body:'b',entityType:'x',entityId:57});
await new Promise(r => setTimeout(r, 100));
assert.equal(sent.length, 0, 'unknown types must not invent telegram messages');
assert.ok(db.prepare("SELECT 1 FROM notifications WHERE type='some_unknown_type'").get(), 'the in-app notification itself must still be created');

// ترجیح خاموش شاگرد، آینه را هم ساکت می‌کند (ویژگی، نه باگ)
telegramService.setPreference(db, studentId, 'messages', 0);
sent = [];
engagement.notify(db,{audienceType:'student',studentId,type:'coach_message',title:'پیام جدید مربی',body:'بی‌صدا',entityType:'conversation',entityId:'muted-1'});
await new Promise(r => setTimeout(r, 100));
assert.equal(sent.length, 0, 'a muted category must not reach telegram via the mirror');
telegramService.setPreference(db, studentId, 'messages', 1);

// آینه‌ی دوباره همان رویداد = dedup
sent = [];
engagement.notify(db,{audienceType:'student',studentId,type:'coach_message',title:'پیام جدید مربی',body:'سلام',entityType:'conversation',entityId:'stable-1'});
await new Promise(r => setTimeout(r, 100));
assert.equal(sent.length, 1);
engagement.notify(db,{audienceType:'student',studentId,type:'coach_message',title:'پیام جدید مربی',body:'سلام',entityType:'conversation',entityId:'stable-1'});
await new Promise(r => setTimeout(r, 100));
assert.equal(sent.length, 1, 'mirroring the same event twice must not double-send');

// پیام شاگرد در پنل → تلگرام مربیِ مسئول (STUDENT_MESSAGE)
sent = [];
const smLink = telegramService.createCoachLinkToken(db);
await telegramService.handleUpdate(db, { update_id: 40, message: { message_id: 40, chat: { id: 888001 }, from: { id: 7001 }, text: `/start ${smLink.link_code}` } });
sent = [];
engagement.notify(db,{audienceType:'coach',studentId,type:'student_message',title:'پیام جدید شاگرد',body:'سلام مربی، از پنل شاگرد',entityType:'conversation',entityId:'sm-1'});
await new Promise(r => setTimeout(r, 120));
const smRow = db.prepare("SELECT * FROM notification_deliveries WHERE type='STUDENT_MESSAGE' AND entity_id='sm-1'").get();
assert.ok(smRow, 'a student message from the panel must queue a telegram delivery');
assert.equal(smRow.audience, 'coach', 'the student-message telegram recipient must be the coach');
assert.ok(sent.some(m => m.method === 'sendMessage' && m.payload.chat_id === '888001' && /پیام جدید شاگرد/.test(m.payload.text || '')), 'the coach chat must receive the student-message notification');
assert.ok(!sent.some(m => m.payload.chat_id === '555001'), 'the student chat must NOT receive the student-message notification');

// ─── پیام آزمایشی مربی: endpoint و منطق ───
sent = [];
const testMsgAccount = telegramService.coachActiveAccount(db);
assert.ok(testMsgAccount, 'coach must still be connected from earlier steps');
const serverSrcTm = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.match(serverSrcTm, /api\/coach\/telegram\/test-message/, 'the real test-message endpoint must exist');
assert.doesNotMatch(serverSrcTm, /api\/coach\/telegram\/test'/, 'the redundant getMe test route must be gone');

// ─── ردیف «تلگرام» در پرونده شاگرد پنل مربی (رندر + وایرینگ) ───
const studentsSrc = fs.readFileSync(path.join(__dirname, '../public/students.js'), 'utf8');
assert.match(studentsSrc, /<div><span>تلگرام<\/span><b id="tgCoachStatusLine">/, 'the coach student-profile template must contain the telegram status row');
assert.match(studentsSrc, /api\(`\/api\/students\/\$\{studentId\}\/telegram`\)/, 'the detail view must fetch the student telegram status');
assert.match(studentsSrc, /telegramStatusPromise\.then\(tg=>\{/, 'the fetched status must be applied to the rendered row');
assert.match(studentsSrc, /✅ متصل/, 'connected status must render in Persian');
assert.match(studentsSrc, /🚫 ربات بلاک شده/, 'blocked status must render in Persian');

// ─── امنیت: توکن هرگز در پیام‌ها لوخ نمی‌رود ───
assert.ok(!sent.some(m => JSON.stringify(m).includes('test:token')), 'bot token must never leak into payloads');

// ─── بدون پیکربندی: صف می‌ماند و برنامه کرش نمی‌کند ───
db.prepare("DELETE FROM settings WHERE key IN ('telegram_bot_token','telegram_bot_username','telegram_webhook_secret','yasnafit_public_url','telegram_polling')").run();
delete process.env.TELEGRAM_BOT_TOKEN;
telegramService.reloadConfig();
telegramService.applyDbSettings(db);
assert.equal(telegramService.isConfigured(), false);
notificationService.emit(db, { type: 'SYSTEM_NOTIFICATION', studentId, dedupKey: 'sys:no-config' });
await new Promise(r => setTimeout(r, 80));
const unconfiguredRow = db.prepare("SELECT * FROM notification_deliveries WHERE dedup_key='sys:no-config'").get();
assert.ok(['pending','retrying'].includes(unconfiguredRow.status), 'without config the delivery must wait (pending/retrying), not crash');

db.close();
console.log(JSON.stringify({
  ok: true,
  linking_valid_invalid_expired_reused: true,
  relink_and_chat_ownership: true,
  unlink: true,
  delivery_and_confirmation: true,
  duplicate_prevented: true,
  retry_then_fail: true,
  blocked_bot_marked: true,
  invalid_chat_marked: true,
  student_without_telegram: true,
  preference_disabled_skips: true,
  webhook_secret_enforced: true,
  bot_commands_persian: true,
  preference_inline_toggle: true,
  real_program_trigger_wired: true,
  graceful_without_config: true,
  coach_panel_settings: true,
  assessment_ready_to_coach_telegram: true,
  in_app_mirror_to_telegram: true,
}));
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
