#!/usr/bin/env node
'use strict';
// رگرسیون: «نسخه برنامه باید 1 یا 2 باشد» نباید ذخیره/اختصاص را مسدود کند.
// ریشه: version ردیف DB (شمارندهٔ همگام‌سازی) به programData درز می‌کرد و در ذخیرهٔ بعدی ولیدیشن سند (۱|۲) را می‌شکست.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const programService = require('../src/program-service');
const { validateProgram } = require('../src/validation');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  console.log('--- 1. row-version leak is gone: programData.version stays 2 ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  db.prepare("INSERT INTO students(full_name,stable_id,mobile) VALUES('شاگرد نسخه','ver-student-1','09120000091')").run();
  const studentId = db.prepare("SELECT id FROM students WHERE stable_id='ver-student-1'").get().id;

  const created = programService.createProgramInDB(db, { title: 'برنامه نسخه', student_id: studentId, status: 'DRAFT', program_data: { version: 2, days: [] } });
  const pid = Number(created.id || created.lastInsertRowid || created);
  // شبیه‌سازی چند بار ذخیره/فعال‌سازی → شمارندهٔ ردیف بالا می‌رود
  db.prepare('UPDATE training_programs SET version=version+4 WHERE id=?').run(pid);
  const rowVersion = db.prepare('SELECT version FROM training_programs WHERE id=?').get(pid).version;
  assert.ok(rowVersion >= 5, 'row version counter must be >2 for the repro');

  const built = programService.buildProgramFromDB(db, pid);
  assert.equal(built.programData.version, 2, 'programData.version must be the schema constant 2, not the row counter');
  assert.equal(built.programData.program_version, rowVersion, 'row counter stays available as program_version');

  console.log('--- 2. saving a program whose row counter is high must succeed ---');
  const payload = {
    title: 'برنامه نسخه', coach_note: '', status: 'DRAFT', student_id: studentId,
    assessment_id: null, start_date: '2026-09-18', end_date: '2026-10-18',
    program_data: { version: 5, days: [] }, // مثل کلاینتی که نسخهٔ آلودهٔ قدیمی را برگردانده
  };
  const saved = programService.saveProgramToDB(db, pid, payload);
  assert.ok(saved && saved.programData, 'save must not be blocked by a poisoned version');

  console.log('--- 3. validation itself stays strict for raw payloads ---');
  assert.ok(validateProgram({ title: 'x', version: 5, days: [] }).length > 0, 'raw validation still rejects version 5');

  console.log('--- 4. wiring: server route + builder clamps ---');
  const server = read('server.js');
  assert.ok(server.includes("progToValidate.version = [1,2].includes(Number(progToValidate.version)) ? Number(progToValidate.version) : 2;"), 'PUT route coerces poisoned program_data.version');
  const builder = read('public/program-builder.js');
  assert.ok(/version: 2, \/\/ نسخهٔ سند ثابت/.test(builder), 'builder load no longer inherits the leaked counter');
  assert.ok(builder.includes('currentProgram.version=2; // قفل نسخهٔ سند'), 'builder save locks the schema version');
  assert.doesNotMatch(builder, /version: prog\.program_data\?\.version\|\|2/, 'old leaky load path must be gone');

  console.log('\n✅ program-version-fix: all checks passed');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
