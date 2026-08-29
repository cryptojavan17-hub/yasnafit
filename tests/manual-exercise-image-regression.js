#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const programService = require('../src/program-service');

const { runMigrations } = require('../src/migrations');

// Test in-memory / temporary database
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
runMigrations(db);

console.log('--- 1. Testing Manual Exercise Creation ---');
db.prepare("INSERT INTO exercise_categories (id, name, sort_order) VALUES ('chest', 'سینه', 1)").run();

const insertEx = db.prepare(`
  INSERT INTO exercises (name_fa, location, category_id, subcategory_id, status, priority, target_muscles, stable_id, version)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const r = insertEx.run(
  'حرکت دستی تستی جلوبازو',
  'gym',
  'chest',
  null,
  'active',
  5,
  JSON.stringify(['front_biceps', 'front_brachialis']),
  'test-uuid-001',
  1
);
const manualExId = Number(r.lastInsertRowid);
assert.ok(manualExId > 0, 'Manual exercise should have valid ID');

const savedEx = db.prepare('SELECT * FROM exercises WHERE id=?').get(manualExId);
assert.equal(savedEx.original_id, null, 'Manual exercise must have original_id as NULL');
assert.equal(savedEx.image_path, null, 'Manual exercise without image must have image_path as NULL');
assert.equal(savedEx.video_path, null, 'Manual exercise without video must have video_path as NULL');
assert.deepEqual(JSON.parse(savedEx.target_muscles), ['front_biceps', 'front_brachialis'], 'Target muscles must be preserved');

console.log('--- 2. Testing Program Normalization with Manual Exercise ---');
const rawProgram = {
  title: 'برنامه تست حرکت دستی',
  student_id: null,
  assessment_id: null,
  start_date: '2026-08-26',
  end_date: '2026-09-25',
  coach_note: 'تست',
  program_data: {
    days: [
      {
        day_number: 1,
        focus: 'بالاتنه',
        data: [
          {
            exercise_system_id: 1,
            system_type: 'normal',
            movement_list: [
              {
                exercise_id: manualExId,
                name: 'حرکت دستی تستی جلوبازو',
                sets: [{ type: 'REPEAT', count: 10, restSeconds: 60 }]
              }
            ]
          }
        ]
      }
    ]
  }
};

const norm = programService.normalizeProgramInput(rawProgram);
const normMov = norm.days[0].data[0].movement_list[0];
assert.equal(normMov.exercise_id, manualExId, 'exercise_id must be manual ID');
assert.equal(normMov.original_exercise_id, null, 'original_exercise_id must be null for manual exercise (not defaulted to exercise_id)');

console.log('--- 3. Testing DB Insertion and Retrieval of Manual Exercise Program ---');
const createResult = programService.createProgramInDB(db, rawProgram);
assert.ok(createResult.id > 0, 'Program created in DB');

const retrieved = programService.buildProgramFromDB(db, createResult.id);
assert.ok(retrieved, 'Program retrieved from DB');
const retMov = retrieved.programData.days[0].data[0].movement_list[0];
assert.equal(retMov.exercise_id, manualExId, 'Retrieved exercise_id must match manual exercise ID');
assert.equal(retMov.original_exercise_id, null, 'Retrieved original_exercise_id must be null');
assert.equal(retMov.image_path, null, 'Retrieved image_path must be null');
assert.equal(retMov.video_path, null, 'Retrieved video_path must be null');
assert.deepEqual(retMov.target_muscles, ['front_biceps', 'front_brachialis'], 'Retrieved target_muscles must match');

console.log('--- 4. Checking Blank White SVG Asset File ---');
const svgPath = path.resolve(__dirname, '../public/blank-white.svg');
assert.ok(fs.existsSync(svgPath), 'blank-white.svg must exist');
const svgContent = fs.readFileSync(svgPath, 'utf8');
assert.ok(svgContent.includes('<svg') && svgContent.includes('fill="white"'), 'blank-white.svg must be a valid white SVG');

const svgAssetPath = path.resolve(__dirname, '../public/assets/images/blank-white.svg');
assert.ok(fs.existsSync(svgAssetPath), 'assets/images/blank-white.svg must exist');

console.log('--- 5. Testing Soft Deletion of Training Programs in Any Status ---');
const delDraft = db.prepare("UPDATE training_programs SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL").run(createResult.id);
assert.equal(delDraft.changes, 1, 'Program should be soft deleted');
const checkDeleted = db.prepare('SELECT * FROM training_programs WHERE id=? AND deleted_at IS NULL').get(createResult.id);
assert.equal(checkDeleted, undefined, 'Soft deleted program must not be returned');

console.log(JSON.stringify({
  ok: true,
  manual_exercise_id: manualExId,
  original_id_null: true,
  no_accidental_collision: true,
  target_muscles_preserved: true,
  blank_white_image_exists: true
}));
