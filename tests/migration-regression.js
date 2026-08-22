#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {migrations,runMigrations}=require('../src/migrations');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-migration-'));
try {
  // Clean installation.
  const clean=new DatabaseSync(path.join(dir,'clean.db'));
  clean.exec('PRAGMA foreign_keys=ON');
  runMigrations(clean);
  assert.deepEqual(clean.prepare('PRAGMA integrity_check').get(),Object.assign(Object.create(null),{integrity_check:'ok'}));
  assert.equal(clean.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get().c,migrations.length);
  assert.ok(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_body_assessments_student_number'").get());
  assert.equal(clean.prepare('SELECT COUNT(*) AS c FROM releases').get().c,5);
  assert.equal(clean.prepare("SELECT title FROM releases WHERE version='0.4.0'").get().title,'Complete My Students CRM');
  clean.close();

  // Upgrade from schema 006 with duplicate current photo slots. Pending migrations
  // must preserve rows, soft-delete the superseded slot, seed releases, and remain idempotent.
  const upgrade=new DatabaseSync(path.join(dir,'upgrade.db'));
  upgrade.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  for(const migration of migrations.filter(m=>!['007_monthly_workflow_integrity','008_application_releases','009_my_students_crm_release'].includes(m.id))){
    upgrade.exec('BEGIN');
    migration.up(upgrade);
    upgrade.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(migration.id);
    upgrade.exec('COMMIT');
  }
  const student=upgrade.prepare("INSERT INTO students(full_name,stable_id) VALUES('upgrade','student-upgrade')").run().lastInsertRowid;
  const assessment=upgrade.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number) VALUES('assessment-upgrade',?,1)").run(student).lastInsertRowid;
  upgrade.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path) VALUES('photo-old',?,?,'front','/tmp/old')").run(assessment,student);
  upgrade.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path) VALUES('photo-new',?,?,'front','/tmp/new')").run(assessment,student);
  runMigrations(upgrade);
  runMigrations(upgrade);
  const photos=upgrade.prepare('SELECT stable_id,deleted_at FROM assessment_photos ORDER BY id').all();
  assert.ok(photos[0].deleted_at,'superseded duplicate was not soft-deleted');
  assert.equal(photos[1].deleted_at,null,'latest photo was not retained');
  assert.equal(upgrade.prepare('SELECT COUNT(*) AS c FROM releases').get().c,5);
  assert.equal(upgrade.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  upgrade.close();
  console.log(JSON.stringify({ok:true,clean_migrations:migrations.length,upgrade:'006->009',releases:5,integrity:'ok'}));
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
