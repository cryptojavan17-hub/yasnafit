#!/usr/bin/env node
'use strict';
// رگرسیون پشتیبان‌گیری/بازیابی — دانلود + بازیابی کامل (شاگرد، مربی، هوش مصنوعی، تلگرام)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server.js');
const database = read('src/database.js');
const core = read('public/core.js');
const styles = read('public/styles.css');

// ─── ۱. همهٔ مسیرهای پشتیبان محافظت‌شده‌اند (نشست مربی) ───
{
  const fn = server.slice(server.indexOf('async function handleBackup'), server.indexOf("if(url.pathname==='/api/backup' && req.method==='POST')"));
  assert.match(fn, /if\(requireCoach\(req,res\)\) return true;/, 'backup endpoints must require an authenticated coach');
}

// ─── ۲. دانلود: نام امن + محدود به پوشهٔ backups + هدر attachment ───
assert.match(server, /function backupSafeName\(value\)/, 'safe-name helper missing');
assert.match(server, /backupSafeName\(url\.searchParams\.get\('name'\)\)/, 'download must sanitize the requested name');
assert.match(server, /if\(!isSafePath\(backupDir,full\)\|\|!fs\.existsSync\(full\)\|\|!fs\.statSync\(full\)\.isFile\(\)\) return sendError\(res,404,'فایل پشتیبان پیدا نشد\.'\);/, 'download must stay inside the backups directory');
assert.match(server, /'Content-Disposition':`attachment; filename="\$\{name\}"; filename\*=UTF-8''\$\{encodeURIComponent\(name\)\}`/, 'download must use an attachment disposition');

// ─── ۳. بازیابی: اعتبارسنجی واقعی فایل قبل از هر جایگزینی ───
assert.match(server, /function validateRestoreCandidate\(file\)/, 'restore validator missing');
assert.match(server, /startsWith\('SQLite format 3'\)/, 'must check the SQLite file header');
assert.match(server, /PRAGMA integrity_check/, 'must run integrity_check');
for (const table of ['schema_migrations','coaches','students','settings']) {
  assert.match(server, new RegExp(`'${table}'`), `restore must require the ${table} table`);
}
assert.match(server, /function stageRestore\(candidatePath,originLabel\)/, 'restore staging missing');
{
  const stage = server.slice(server.indexOf('function stageRestore'));
  assert.match(stage, /VACUUM INTO/, 'a safety snapshot (VACUUM INTO) must be taken before staging a restore');
  assert.ok(stage.indexOf('VACUUM INTO') < stage.indexOf("fs.writeFileSync(path.join(path.dirname(dbPath),'restore-pending.json')"), 'the safety snapshot must happen BEFORE the pending file is staged');
}
assert.match(server, /restore-pending\.json/, 'restore must stage via the pending marker');
assert.match(server, /process\.exit\(0\)/, 'the server must exit after staging so the platform restarts it');

// ─── ۴. تعویض در بوت (سازگار با ویندوز/لینوکس — بدون فایل باز) ───
assert.match(database, /const restoreMarker = path\.join\(dataDir, 'restore-pending\.json'\);/, 'boot-time restore marker missing');
assert.match(database, /pre-restore-\$\{stamp\}\.db/, 'the previous database must be rotated into backups at boot');
assert.match(database, /\[Restore\] دیتابیس از/, 'restore must be announced in the boot log');
assert.ok(database.indexOf('const restoreMarker') < database.indexOf('const db = new DatabaseSync(dbPath);'), 'the swap must happen BEFORE the database connection opens');

// ─── ۵. سقف حجم آپلود ───
assert.match(server, /RESTORE_MAX_BYTES = 524288000/, 'the 500MB restore cap is missing');
assert.match(server, /function readRawBody\(req,maxBytes=RESTORE_MAX_BYTES\)/, 'raw-body reader for the upload missing');

// ─── ۶. رابط کاربری: فهرست + دانلود + بازیابی (سروری و آپلودی) ───
assert.match(core, /<h2>پشتیبان‌گیری و بازیابی<\/h2>/, 'the settings page must present backup/restore');
assert.match(core, /id="restoreFile" accept="\.db"/, 'the upload input must accept .db files');
assert.match(core, /api\/backup\/download\?name=\$\{encodeURIComponent\(b\.name\)\}/, 'each row must expose a download link');
assert.match(core, /data-restore="\$\{esc\(b\.name\)\}"/, 'each row must expose a restore button');
assert.match(core, /api\/backup\/restore-server'/, 'server-side restore must call the dedicated endpoint');
assert.match(core, /fetch\('\/api\/backup\/restore',\{method:'POST',headers:\{'Content-Type':'application\/octet-stream'\}/, 'upload restore must stream raw bytes');
assert.match(core, /همهٔ اطلاعات فعلی با نسخهٔ انتخابی جایگزین می‌شود و سرویس ری‌استارت می‌شود/, 'the restore confirmation must warn about full replacement + restart');
assert.match(core, /loadList\(\);/, 'the backup list must load on page open');

// ─── ۷. استایل جدول ───
assert.match(styles, /§۲۲ — پشتیبان‌گیری و بازیابی/, 'backup styles section missing');
assert.match(styles, /\.backup-table\{width:100%/, 'backup table styles missing');
assert.match(styles, /@media\(max-width:680px\)\{\.backup-table thead\{display:none\}/, 'the table must stack on phones');

console.log(JSON.stringify({ ok: true, coach_only_endpoints: true, safe_download: true, validated_restore: true, boot_swap: true, ui_complete: true }));
