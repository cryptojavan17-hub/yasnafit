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
assert.equal(reusedRes.link_failed, true, 'reused token must fail (single-use)');
assert.ok(sent.some(m => /قبلاً استفاده شده/.test(m.payload.text)), 'bot must explain reuse in Persian');

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
assert.match(serverSrc, /notificationService\.emit\(db,\{type:'PROGRAM_ASSIGNED'[\s\S]{0,400}dedupKey:`program_assigned:\$\{id\}`/, 'program activate must emit PROGRAM_ASSIGNED');
assert.match(serverSrc, /p==='\/api\/telegram\/webhook'/, 'the webhook endpoint must be mounted');
assert.match(serverSrc, /verifyWebhookSecret\(req\.headers\['x-telegram-bot-api-secret-token'\]\)/, 'the webhook must verify the Telegram secret header');
assert.match(serverSrc, /\/api\/student\/telegram\/link/, 'the student link endpoint must exist');

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
delete process.env.TELEGRAM_BOT_TOKEN;
telegramService.reloadConfig();
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
}));
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
