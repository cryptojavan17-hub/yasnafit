#!/usr/bin/env node
'use strict';
// رگرسیون: رضایت اعلان تلگرام در ثبت‌نام + دکمهٔ مربی «ارسال اعلان به تلگرام شاگرد»
// سیاست: تیک رضایت → آیدی تلگرام الزامی؛ ارسال واقعی فقط به چتِ وصل‌شده به ربات (تلگرام اجازهٔ پیام ناشناس نمی‌دهد).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const auth = require('../src/student-auth-service');
const telegramService = require('../src/telegram-service');
const notificationService = require('../src/notification-service');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  // ─── ۱. سرویس ثبت‌نام: تیک بدون آیدی → خطا؛ با آیدی → ذخیره؛ بدون تیک → خالی ───
  console.log('--- 1. register opt-in validation & storage ---');
  {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    runMigrations(db);
    const base = {
      full_name: 'مجید تلگرامی', mobile: '09351234567',
      date_of_birth: '1375/04/15', province: 'تهران', city: 'تهران',
      address: 'تهران، خیابان ولیعصر، پلاک ۱۲، واحد ۳',
      password: 'SecurePassword123!', confirm_password: 'SecurePassword123!',
      terms_accepted: true,
    };
    assert.throws(
      () => auth.registerStudent(db, { ...base, telegram_opt_in: true }),
      err => err.code === 'TELEGRAM_ID_REQUIRED',
      'opt-in without telegram id must be rejected'
    );
    assert.throws(
      () => auth.registerStudent(db, { ...base, telegram_opt_in: true, telegram_id: 'ایران‌فارسی' }),
      err => err.code === 'TELEGRAM_ID_REQUIRED',
      'non-latin telegram id must be rejected'
    );
    const ok = auth.registerStudent(db, { ...base, telegram_opt_in: true, telegram_id: '@Ali_Ahmadi' });
    assert.equal(ok.telegram_id, 'Ali_Ahmadi', '@ must be stripped and stored');
    const no = auth.registerStudent(db, { ...base, mobile: '09351234568', telegram_id: 'NoOptIn' });
    assert.equal(no.telegram_id, '', 'id must be ignored without opt-in');
  }

  // ─── ۲. موتور تحویل: اتصال واقعی با کد → «برنامهٔ شما آماده شد» به همان چت ───
  console.log('--- 2. program-ready ping reaches the linked chat ---');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-optin-'));
    const db = new DatabaseSync(path.join(dir, 'tg.db'));
    db.exec('PRAGMA foreign_keys=ON');
    runMigrations(db);
    db.prepare("INSERT INTO students(full_name,stable_id,mobile) VALUES('شاگرد اعلان','tg-optin-1','09120000077')").run();
    const studentId = db.prepare("SELECT id FROM students WHERE stable_id='tg-optin-1'").get().id;
    process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test:token';
    telegramService.reloadConfig();
    const sent = [];
    telegramService.setTransport(async (method, payload) => { sent.push({ method, payload }); return { ok: true, result: { message_id: sent.length } }; });

    const link = telegramService.createLinkToken(db, studentId);
    await telegramService.handleUpdate(db, { update_id: 1, message: { message_id: 1, chat: { id: 555077 }, from: { id: 9077, username: 'ali_ahmadi' }, text: `/start ${link.link_code}` } });
    assert.ok(telegramService.activeAccount(db, studentId), 'student must have an active linked account');

    const r1 = notificationService.emit(db, {
      type: 'PROGRAM_ASSIGNED', studentId, audience: 'student',
      title: '🎉 برنامهٔ شما آماده شد!',
      body: 'مربی شما برنامهٔ شما را آماده کرده است. وارد یسنا فیت شوید تا برنامه را ببینید.',
      entityType: 'training_program', dedupKey: `program_ready_ping:${studentId}:1`,
    });
    assert.equal(r1.queued, true, 'delivery must be queued');
    await new Promise(r => setTimeout(r, 300));
    const ping = sent.find(m => m.method === 'sendMessage' && String(m.payload.text).includes('برنامهٔ شما آماده شد'));
    assert.ok(ping, 'the bot must send the program-ready message');
    assert.equal(String(ping.payload.chat_id), '555077', 'message must go to the linked chat');

    telegramService.setPreference(db, studentId, 'workout', false);
    const r2 = notificationService.emit(db, { type: 'PROGRAM_ASSIGNED', studentId, title: 'ت', body: 'ب', dedupKey: `x:${Date.now()}` });
    assert.equal(r2.skipped, 'preference_disabled', 'student preference must be respected');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── ۳. سیم‌کشی UI و مسیر سرور ───
  console.log('--- 3. wiring: register form, server route, coach button ---');
  {
    const app = read('public/student-app.js');
    assert.ok(app.includes('اگر مایلید به‌محض آماده‌شدن برنامه‌تان توسط مربی، در تلگرام خبردار شوید این تیک را بزنید'), 'opt-in checkbox text');
    assert.ok(app.includes('id="regTelegramOpt"') && app.includes('id="regTelegramId"'), 'checkbox + telegram id input exist');
    assert.ok(app.includes("tgOpt.addEventListener('change', syncTg)"), 'tick toggles the id field visibility/required');
    assert.ok(app.includes('وارد کردن آیدی تلگرام الزامی است'), 'client-side required-if-checked validation');
    assert.ok(app.includes('telegram_opt_in: telegramOptIn'), 'payload carries the opt-in');

    const authSvc = read('src/student-auth-service.js');
    assert.ok(authSvc.includes("code: 'TELEGRAM_ID_REQUIRED'"), 'server-side opt-in enforcement');
    assert.ok(/telegram_id,\n\s*version, created_at, updated_at/.test(authSvc), 'telegram_id persisted at signup');

    const server = read('server.js');
    assert.ok(/\/api\\\/students\\\/\(\\d\+\)\\\/telegram-notify/.test(server), 'coach notify route exists');
    assert.ok(server.includes('برنامهٔ شما آماده شد!'), 'route sends the program-ready message');
    assert.ok(server.includes('ربات تلگرام هنوز پیکربندی نشده است'), 'unconfigured bot → clear 503');
    assert.ok(server.includes('هنوز ربات را به حسابش وصل نکرده است'), 'unlinked student → clear coach guidance');

    const coach = read('public/students.js');
    assert.ok(coach.includes('ارسال اعلان به تلگرام شاگرد'), 'coach panel button');
    assert.ok(coach.includes('/telegram-notify`'), 'button handler hits the endpoint');
  }

  console.log('\n✅ telegram-register-optin-notify: all checks passed');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
