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
  assert.equal(clean.prepare('SELECT COUNT(*) AS c FROM releases').get().c,14);
  assert.equal(clean.prepare("SELECT title FROM releases WHERE version='0.8.0'").get().title,'Coach Student Engagement Foundation');
  assert.ok(clean.prepare("SELECT 1 FROM pragma_table_info('body_assessments') WHERE name='body_photos_preference'").get());
  assert.ok(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='student_sessions'").get());
  for(const table of ['assessment_goals','assessment_measurements','assessment_medical_history','assessment_medical_items','assessment_sports_history','assessment_nutrition','assessment_habits','assessment_pregnancy','assessment_documents'])assert.ok(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),`missing normalized table ${table}`);
  for(const table of ['coaches','coach_students','assessment_ai_suggestions'])assert.ok(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),`missing ownership table ${table}`);
  assert.ok(clean.prepare("SELECT 1 FROM pragma_table_info('students') WHERE name='case_number'").get());
  clean.prepare("INSERT INTO students(full_name,stable_id) VALUES('case one','case-one'),('case two','case-two')").run();const caseNumbers=clean.prepare("SELECT case_number FROM students WHERE stable_id IN ('case-one','case-two') ORDER BY stable_id").all().map(row=>row.case_number);assert.equal(new Set(caseNumbers).size,2);for(const code of caseNumbers)assert.match(code,/^\d{6}$/);
  for(const column of ['telegram_id','instagram_id','mobile_normalized','password_hash','password_state','password_changed_at','temporary_login_at','auth_failed_attempts','auth_locked_until','last_login_at'])assert.ok(clean.prepare("SELECT 1 FROM pragma_table_info('students') WHERE name=?").get(column),`missing social profile column ${column}`);
  assert.ok(clean.prepare("SELECT 1 FROM pragma_table_info('student_invites') WHERE name='use_count'").get());
  for(const table of ['audit_events','notifications','conversations','messages','workout_sessions','workout_results'])assert.ok(clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),`missing engagement table ${table}`);
  for(const column of ['assessment_type','lifecycle_status','approved_at','archived_at'])assert.ok(clean.prepare("SELECT 1 FROM pragma_table_info('body_assessments') WHERE name=?").get(column),`missing assessment column ${column}`);
  clean.close();

  // Upgrade from schema 006 with duplicate current photo slots. Pending migrations
  // must preserve rows, soft-delete the superseded slot, seed releases, and remain idempotent.
  const upgrade=new DatabaseSync(path.join(dir,'upgrade.db'));
  upgrade.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  for(const migration of migrations.filter(m=>!['007_monthly_workflow_integrity','008_application_releases','009_my_students_crm_release','010_repair_legacy_student_timestamps','011_student_sessions_portal','012_onboarding_body_input_fix','013_optional_body_photos_preference','014_professional_assessment_profile','015_private_assessment_documents','016_measurement_input_compatibility','017_onboarding_next_button_recovery','018_engagement_audit_workouts','019_core_journey_stabilization','020_assessment_social_profiles','021_student_password_authentication','022_mobile_prefix_repair','023_exercise_target_muscles','024_ai_settings_and_router','025_diet_programs_and_meals'].includes(m.id))){
    upgrade.exec('BEGIN');
    migration.up(upgrade);
    upgrade.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(migration.id);
    upgrade.exec('COMMIT');
  }
  const student=upgrade.prepare("INSERT INTO students(full_name,stable_id) VALUES('upgrade','student-upgrade')").run().lastInsertRowid;
  const assessment=upgrade.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number) VALUES('assessment-upgrade',?,1)").run(student).lastInsertRowid;
  const noPhotoStudent=upgrade.prepare("INSERT INTO students(full_name,stable_id) VALUES('no photo legacy','student-no-photo')").run().lastInsertRowid;
  upgrade.prepare("INSERT INTO students(full_name,stable_id,mobile) VALUES('prefix repair','student-prefix-repair','099123456789')").run();
  const noPhotoAssessment=upgrade.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number) VALUES('assessment-no-photo',?,1)").run(noPhotoStudent).lastInsertRowid;
  upgrade.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path) VALUES('photo-old',?,?,'front','/tmp/old')").run(assessment,student);
  upgrade.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path) VALUES('photo-new',?,?,'front','/tmp/new')").run(assessment,student);
  runMigrations(upgrade);
  runMigrations(upgrade);
  const photos=upgrade.prepare('SELECT stable_id,deleted_at FROM assessment_photos ORDER BY id').all();
  assert.ok(photos[0].deleted_at,'superseded duplicate was not soft-deleted');
  assert.equal(photos[1].deleted_at,null,'latest photo was not retained');
  assert.equal(upgrade.prepare('SELECT body_photos_preference FROM body_assessments WHERE id=?').get(assessment).body_photos_preference,'willing');
  assert.equal(upgrade.prepare('SELECT body_photos_preference FROM body_assessments WHERE id=?').get(noPhotoAssessment).body_photos_preference,null,'legacy no-photo assessment was incorrectly inferred as declined');
  assert.deepEqual(upgrade.prepare("SELECT mobile,mobile_normalized FROM students WHERE stable_id='student-prefix-repair'").get(),Object.assign(Object.create(null),{mobile:'09123456789',mobile_normalized:'09123456789'}));
  assert.equal(upgrade.prepare('SELECT COUNT(*) AS c FROM releases').get().c,14);
  assert.ok(upgrade.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='student_sessions'").get());
  assert.equal(upgrade.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  upgrade.close();

  // Exact production regression: legacy databases could have migrations marked as
  // applied while students.updated_at was absent because ALTER TABLE rejected a
  // non-constant CURRENT_TIMESTAMP default.
  const legacy=new DatabaseSync(path.join(dir,'legacy-missing-updated-at.db'));
  legacy.exec('PRAGMA foreign_keys=ON; CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  for(const migration of migrations.filter(m=>!['010_repair_legacy_student_timestamps','011_student_sessions_portal','012_onboarding_body_input_fix','013_optional_body_photos_preference','014_professional_assessment_profile','015_private_assessment_documents','016_measurement_input_compatibility','017_onboarding_next_button_recovery','018_engagement_audit_workouts','019_core_journey_stabilization','020_assessment_social_profiles','021_student_password_authentication','022_mobile_prefix_repair','023_exercise_target_muscles','024_ai_settings_and_router','025_diet_programs_and_meals'].includes(m.id))){
    legacy.exec('BEGIN');migration.up(legacy);
    legacy.prepare('INSERT INTO schema_migrations(id) VALUES(?)').run(migration.id);
    legacy.exec('COMMIT');
  }
  legacy.prepare("INSERT INTO students(full_name,stable_id) VALUES('legacy student','legacy-student')").run();
  legacy.exec('ALTER TABLE students DROP COLUMN updated_at');
  assert.equal(legacy.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('students') WHERE name='updated_at'").get().c,0);
  runMigrations(legacy);
  runMigrations(legacy);
  assert.equal(legacy.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('students') WHERE name='updated_at'").get().c,1);
  const repaired=legacy.prepare("SELECT created_at,updated_at FROM students WHERE stable_id='legacy-student'").get();
  assert.ok(repaired.created_at);assert.ok(repaired.updated_at);
  assert.equal(legacy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.ok(legacy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='student_sessions'").get());
  assert.equal(legacy.prepare('SELECT COUNT(*) AS c FROM releases').get().c,14);
  legacy.close();
  console.log(JSON.stringify({ok:true,clean_migrations:migrations.length,upgrade:'006->022',releases:14,legacy_missing_updated_at:'repaired',student_sessions:true,integrity:'ok'}));
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
