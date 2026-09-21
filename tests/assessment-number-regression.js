#!/usr/bin/env node
'use strict';
// رگرسیون شمارهٔ فرم ارزیابی — هر فرم باید شمارهٔ یکتا داشته باشد، نه شمارهٔ per-student که همیشه #1 می‌شود.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const students = read('public/students.js');
const submissions = read('public/coach-submissions.js');

// ─── ۱. پیام تلگرام و اعلان مربی باید با id یکتا ساخته شوند ───
assert.match(server, /📝 ارزیابی: #\$\{submitted\.id\}/, 'the telegram message must show the globally unique assessment id');
assert.match(server, /body:`ارزیابی #\$\{submitted\.id\} آماده بررسی است`/, 'the in-app coach notification must show the unique id');
assert.ok(!server.includes('📝 ارزیابی: #${submitted.assessment_number}'), 'telegram must not use the per-student counter');

// ─── ۲. داشبورد و فید رخدادها هم شمارهٔ یکتا ───
assert.match(server, /text:`ارزیابی شماره \$\{r\.assessment_id\} آماده بررسی شماست`/, 'dashboard attention card must show the unique id');
assert.match(server, /text:`ارزیابی شماره \$\{r\.id\} را ارسال کرد`/, 'recent-events feed must show the unique id');

// ─── ۳. پنل مربی (پروفایل + تایم‌لاین) ───
assert.match(students, /بررسی ارزیابی #\$\{data\.current_assessment\.id\}/, 'student profile review button must show the unique id');
assert.match(students, /شماره \$\{data\.current_assessment\.id\} — /, 'student profile summary must show the unique id');
assert.match(submissions, /ارزیابی #\$\{a\.id\} - /, 'the coach timeline must show the unique id');

// ─── ۴. شمارهٔ نمایش‌داده‌شده باید همان شناسهٔ لینک بررسی باشد ───
// لینک: /assessments/${submitted.id} → پس متن هم #${submitted.id} تا متن و لینک همیشه یکی باشند.
assert.match(server, /notificationService\.portalLink\(`\/assessments\/\$\{submitted\.id\}`\)/, 'the review link is built from the same id shown in the message');

// ─── ۵. تاریخچهٔ خود شاگرد مجاز است شمارهٔ ماهانهٔ خودش باشد (ماه ۱، ماه ۲…) ───
assert.match(read('public/student-app.js'), /ارزیابی \$\{item\.assessment_number\}/, 'the student history keeps its per-student month sequence');

console.log(JSON.stringify({ ok: true, telegram_unique: true, dashboard_unique: true, coach_ui_unique: true, link_text_match: true }));
