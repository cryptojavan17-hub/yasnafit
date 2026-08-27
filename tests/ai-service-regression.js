#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const aiService = require('../src/ai-service');
const programService = require('../src/program-service');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

(async () => {
  console.log('--- 1. Testing AI Database Migration & Singleton Settings ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);

  const initialSettings = aiService.getSettings(db);
  assert.equal(initialSettings.has_api_key, false, 'Initial settings should not have API key');
  assert.equal(initialSettings.api_key_masked, '', 'Masked API key should be empty');
  assert.equal(initialSettings.base_url, 'https://9router-production-6a92.up.railway.app/v1', 'Default base URL should match');
  assert.equal(initialSettings.default_combo, '', 'Default combo should be empty');
  assert.equal(initialSettings.temperature, 0.7, 'Default temperature should be 0.7');

  console.log('--- 2. Testing Saving AI Settings & Secret Masking ---');
  const saved = aiService.saveSettings(db, {
    api_key: 'sk-9router-test-secret-key-1234567890',
    base_url: 'http://localhost:20128/v1/',
    default_combo: 'yasna-coach-combo',
    temperature: 0.8,
    top_p: 0.95,
    max_tokens: 3000,
    timeout_ms: 25000
  });

  assert.equal(saved.has_api_key, true, 'has_api_key must be true');
  assert.ok(saved.api_key_masked.startsWith('sk-9ro') && saved.api_key_masked.endsWith('7890'), 'api_key_masked must be properly masked');
  assert.equal(saved.base_url, 'http://localhost:20128/v1', 'Trailing slash must be stripped from base_url');
  assert.equal(saved.default_combo, 'yasna-coach-combo', 'default_combo must match');
  assert.equal(saved.temperature, 0.8, 'temperature must match');
  assert.equal(saved.top_p, 0.95, 'top_p must match');
  assert.equal(saved.max_tokens, 3000, 'max_tokens must match');
  assert.equal(saved.timeout_ms, 25000, 'timeout_ms must match');

  // Verify raw key remains in database
  const raw = aiService.getRawSettings(db);
  assert.equal(raw.api_key, 'sk-9router-test-secret-key-1234567890', 'Raw API key must remain stored in database');

  console.log('--- 3. Testing AI Tool Definitions and Function Schemas ---');
  assert.ok(Array.isArray(aiService.AI_TOOLS), 'AI_TOOLS must be an array');
  assert.ok(aiService.AI_TOOLS.length >= 10, 'Must have at least 10 tools defined');

  const toolNames = aiService.AI_TOOLS.map(t => t.function.name);
  for (const requiredTool of [
    'get_student',
    'list_students',
    'get_latest_assessment',
    'get_assessment',
    'add_coach_note',
    'search_exercises',
    'get_exercise',
    'get_program',
    'list_student_programs',
    'create_draft_program',
    'update_draft_program',
    'activate_program',
    'complete_program',
    'get_workout_results'
  ]) {
    assert.ok(toolNames.includes(requiredTool), `AI_TOOLS must include tool: ${requiredTool}`);
  }

  console.log('--- 4. Testing Tool Execution Handlers ---');
  // Insert dummy student & category for tool testing
  db.prepare("INSERT OR IGNORE INTO exercise_categories (id, name, sort_order) VALUES ('chest', 'سینه', 1), ('warmup', 'گرم کردن و سرد کردن', 12), ('cardio', 'هوازی', 13), ('biceps', 'جلو بازو', 4), ('triceps', 'پشت بازو', 5), ('legs', 'پا', 6), ('shoulders', 'سرشانه', 3), ('abs', 'شکم', 7), ('back', 'پشت', 2), ('traps', 'کول', 9), ('lower_back', 'فیله کمر', 10), ('forearms', 'ساعد', 8)").run();
  db.prepare("INSERT OR IGNORE INTO exercises (id, name_fa, location, category_id, status, priority, stable_id) VALUES (1158, 'گرم کردن', 'gym', 'warmup', 'active', 1, 'ex-1158'), (1157, 'سرد کردن', 'gym', 'warmup', 'active', 1, 'ex-1157'), (1107, 'تردمیل', 'gym', 'cardio', 'active', 1, 'ex-1107'), (1110, 'دوچرخه ثابت', 'gym', 'cardio', 'active', 1, 'ex-1110'), (1106, 'الپتیکال', 'gym', 'cardio', 'active', 1, 'ex-1106')").run();

  const sampleData = [
    // Chest
    { id: 101, name: 'پرس سینه هالتر', cat: 'chest' },
    { id: 102, name: 'پرس بالا سینه دمبل', cat: 'chest' },
    { id: 103, name: 'قفسه سینه دمبل', cat: 'chest' },
    { id: 104, name: 'کراس اور سیم‌کش', cat: 'chest' },
    // Biceps
    { id: 105, name: 'جلو بازو هالتر ایستاده', cat: 'biceps' },
    { id: 106, name: 'جلو بازو دمبل لاری', cat: 'biceps' },
    { id: 107, name: 'جلو بازو چکشی', cat: 'biceps' },
    // Back
    { id: 108, name: 'زیربغل سیم کش از بالا', cat: 'back' },
    { id: 109, name: 'زیربغل قایقی سیم کش', cat: 'back' },
    { id: 110, name: 'زیربغل هالتر خم', cat: 'back' },
    { id: 111, name: 'پلاور سیم کش', cat: 'back' },
    // Triceps
    { id: 112, name: 'پشت بازو سیم کش طناب', cat: 'triceps' },
    { id: 113, name: 'پشت بازو هالتر خوابیده', cat: 'triceps' },
    { id: 114, name: 'پشت بازو دیپ', cat: 'triceps' },
    // Legs
    { id: 115, name: 'اسکوات با هالتر', cat: 'legs' },
    { id: 116, name: 'پرس پا دستگاه', cat: 'legs' },
    { id: 117, name: 'جلو پا دستگاه', cat: 'legs' },
    { id: 118, name: 'پشت پا دستگاه', cat: 'legs' },
    { id: 119, name: 'ساق پا ایستاده', cat: 'legs' },
    // Shoulders
    { id: 120, name: 'پرس سرشانه دمبل نشسته', cat: 'shoulders' },
    { id: 121, name: 'نشر از جانب دمبل', cat: 'shoulders' },
    { id: 122, name: 'نشر خم دمبل', cat: 'shoulders' },
    { id: 123, name: 'نشر روبرو دمبل', cat: 'shoulders' },
    // Traps
    { id: 124, name: 'شراگ دمبل', cat: 'traps' },
    { id: 125, name: 'شراگ هالتر', cat: 'traps' },
    // Abs
    { id: 126, name: 'کرانچ شکم روی زمین', cat: 'abs' },
    { id: 127, name: 'پلانک روی زمین', cat: 'abs' },
    // Lower back
    { id: 128, name: 'فیله کمر ۴۵ درجه', cat: 'lower_back' },
    // Forearms
    { id: 129, name: 'ساعد هالتر نشسته', cat: 'forearms' }
  ];
  for (const s of sampleData) {
    db.prepare("INSERT OR IGNORE INTO exercises (id, name_fa, location, category_id, status, priority, stable_id) VALUES (?, ?, 'gym', ?, 'active', 1, ?)").run(s.id, s.name, s.cat, `ex-${s.id}`);
  }

  const exId = 101;

<<<<<<< HEAD
  const insStudent = db.prepare("INSERT INTO students (full_name, mobile, case_number, stable_id) VALUES ('امیر رضایی', '09121112233', '100200', 'st-uuid-1')").run();
  const studentId = Number(insStudent.lastInsertRowid);

  const insAss = db.prepare("INSERT INTO body_assessments (student_id, assessment_number, status, lifecycle_status, weight, height, stable_id) VALUES (?, 1, 'APPROVED', 'APPROVED', 80, 180, 'ass-uuid-1')").run(studentId);
=======
  const insStudent = db.prepare("INSERT INTO students (full_name, mobile, case_number, training_level, training_experience, goal, stable_id) VALUES ('امیر رضایی', '09121112233', '100200', 'مبتدی', 'کمتر از ۶ ماه', 'fat_loss', 'st-uuid-1')").run();
  const studentId = Number(insStudent.lastInsertRowid);

  const insAss = db.prepare("INSERT INTO body_assessments (student_id, assessment_number, status, lifecycle_status, weight, height, goal, stable_id) VALUES (?, 1, 'APPROVED', 'APPROVED', 80, 180, 'fat_loss', 'ass-uuid-1')").run(studentId);
>>>>>>> 975119c (feat(ai): provide comprehensive physiological rationale, student diagnostics, and scientific decision breakdown in AI Copilot)
  const assessmentId = Number(insAss.lastInsertRowid);

  // Test list_students tool
  const listStudentsResult = await aiService.executeTool(db, 'list_students', { search: 'امیر' });
  assert.ok(listStudentsResult.students.length >= 1, 'list_students should return matching student');
  assert.equal(listStudentsResult.students[0].id, studentId);

  // Test get_student tool
  const getStudentResult = await aiService.executeTool(db, 'get_student', { caseNumber: '100200' });
  assert.ok(getStudentResult.student, 'get_student should find student by caseNumber');
  assert.equal(getStudentResult.student.full_name, 'امیر رضایی');

  // Test search_exercises tool
  const searchExResult = await aiService.executeTool(db, 'search_exercises', { query: 'سینه' });
  assert.ok(searchExResult.exercises.length >= 1, 'search_exercises should find exercise');
  assert.ok(searchExResult.exercises.some(e => e.name_fa.includes('سینه')), 'search_exercises should find exercises containing سینه');

  // Test create_draft_program tool
  const createProgResult = await aiService.executeTool(db, 'create_draft_program', {
    studentId,
    assessmentId,
    title: 'برنامه هوشمند تست',
    coachNote: 'نکات مربی',
    days: [
      {
        day_number: 1,
        focus: 'سینه',
        systems: [
          {
            exercise_system_id: 1,
            movements: [
              {
                exercise_id: exId,
                name: 'پرس سینه هالتر',
                sets: [{ type: 'REPEAT', count: 10, restSeconds: 60 }]
              }
            ]
          }
        ]
      }
    ]
  });
  assert.ok(createProgResult.success, 'create_draft_program should succeed');
  assert.ok(createProgResult.programId > 0, 'Program ID must be returned');

  // Test get_program tool
  const getProgResult = await aiService.executeTool(db, 'get_program', { programId: createProgResult.programId });
  assert.ok(getProgResult.program, 'get_program must retrieve program');
  assert.equal(getProgResult.program.programData.days[0].data[0].movement_list[0].exercise_id, exId);

  // Test activate_program tool
  const activateResult = await aiService.executeTool(db, 'activate_program', { programId: createProgResult.programId });
  assert.ok(activateResult.success, 'activate_program should succeed');
  assert.equal(activateResult.status, 'ACTIVE');

  console.log('--- 4b. Testing Available Models Fetch Handler ---');
  assert.equal(typeof aiService.fetchAvailableModels, 'function', 'fetchAvailableModels must be a function');
  const modelsRes = await aiService.fetchAvailableModels(db);
  assert.ok(Array.isArray(modelsRes.models), 'models must be an array');

<<<<<<< HEAD
  console.log('--- 4c. Testing AI Generate Program from Assessment ---');
  assert.equal(typeof aiService.generateProgramFromAssessment, 'function', 'generateProgramFromAssessment must be a function');
=======
  console.log('--- 4c. Testing AI Generate Program from Assessment & Scientific Rationale ---');
  assert.equal(typeof aiService.generateProgramFromAssessment, 'function', 'generateProgramFromAssessment must be a function');
  assert.equal(typeof aiService.buildComprehensiveProgramRationale, 'function', 'buildComprehensiveProgramRationale must be a function');

>>>>>>> 975119c (feat(ai): provide comprehensive physiological rationale, student diagnostics, and scientific decision breakdown in AI Copilot)
  const genResult = await aiService.generateProgramFromAssessment(db, {
    studentId,
    assessmentId
  });
  assert.ok(genResult.success, 'Program generation must succeed');
  assert.ok(genResult.programId > 0, 'Must return valid program ID');
<<<<<<< HEAD
=======
  assert.ok(genResult.rationaleReport, 'Must return rationaleReport');
  assert.ok(genResult.initialChatMessage, 'Must return initialChatMessage');
  assert.ok(genResult.studentInfo, 'Must return studentInfo');

  // Verify rationale details & reasoning
  const rat = genResult.rationaleReport;
  assert.ok(rat.dataSources.length >= 4, 'Must list at least 4 data sources');
  assert.ok(rat.decisionLogic.length >= 4, 'Must provide detailed decision logic reasons');
  assert.ok(rat.sixPhaseBreakdown.length === 6, 'Must provide full 6-phase scientific breakdown');
  assert.ok(rat.studentProfile.bmi > 0, 'Must calculate student BMI');
  assert.ok(rat.coachGuidelines.length >= 3, 'Must provide actionable coach guidelines');

  // Verify chat message content
  assert.ok(genResult.initialChatMessage.includes('مبتدی') || genResult.initialChatMessage.includes('سطح'), 'Chat message must explain training level rationale');
  assert.ok(genResult.initialChatMessage.includes('BMI') || genResult.initialChatMessage.includes('ترکیب بدنی'), 'Chat message must explain BMI/body composition');
  assert.ok(genResult.initialChatMessage.includes('گرم‌کردن') && genResult.initialChatMessage.includes('سردکردن'), 'Chat message must detail 6 phases');
  assert.ok(genResult.initialChatMessage.includes('اضافه بار تدریجی') || genResult.initialChatMessage.includes('تغذیه'), 'Chat message must include coach guidelines');

>>>>>>> 975119c (feat(ai): provide comprehensive physiological rationale, student diagnostics, and scientific decision breakdown in AI Copilot)
  const genProgram = programService.buildProgramFromDB(db, genResult.programId);
  assert.ok(genProgram, 'Generated program must exist in DB');
  const progRow = genProgram.dbProgram || genProgram;
  assert.equal(progRow.status, 'DRAFT', 'Generated program MUST remain in DRAFT status (never auto-activated)');
  assert.equal(progRow.student_id, studentId, 'Must link correct student_id');
  assert.equal(progRow.assessment_id, assessmentId, 'Must link correct assessment_id');
<<<<<<< HEAD
=======
  
>>>>>>> 975119c (feat(ai): provide comprehensive physiological rationale, student diagnostics, and scientific decision breakdown in AI Copilot)
  // Verify 6-phase scientific structure: Warm-up, 7-9 Main/Accessory/Core, Cardio, and Cool-down
  for (const day of genProgram.programData.days) {
    const allMovNames = (day.data || []).flatMap(sys => (sys.movement_list || []).map(m => m.name));
    const allMovIds = (day.data || []).flatMap(sys => (sys.movement_list || []).map(m => m.exercise_id));

    assert.ok(allMovIds.includes(1158) || allMovNames.some(n => n.includes('گرم')), 'Day must contain Warm-up movement');
    assert.ok(allMovIds.includes(1157) || allMovNames.some(n => n.includes('سرد')), 'Day must contain Cool-down movement');
    assert.ok(allMovIds.some(id => [1107, 1110, 1106, 1385].includes(id)) || allMovNames.some(n => n.includes('تردمیل') || n.includes('دوچرخه') || n.includes('الپتیکال')), 'Day must contain Cardio/Conditioning movement');

    const resistanceMovs = allMovIds.filter(id => id !== 1158 && id !== 1157 && ![1107, 1110, 1106, 1385].includes(id));
    assert.ok(resistanceMovs.length >= 7 && resistanceMovs.length <= 9, `Day must have 7 to 9 main+accessory resistance movements (got ${resistanceMovs.length})`);

    for (const sys of (day.data || [])) {
      for (const mov of (sys.movement_list || [])) {
        assert.ok(mov.exercise_id > 0, 'Every movement must have a valid exercise_id');
        const exCheck = db.prepare('SELECT id FROM exercises WHERE id = ?').get(mov.exercise_id);
        assert.ok(exCheck, `Exercise ID ${mov.exercise_id} must exist in the exercises database`);
      }
    }
  }

  // Verify diverse training systems (Supersets, Trisets, Dropsets)
  const allSystems = genProgram.programData.days.flatMap(d => (d.data || []).map(s => Number(s.exercise_system_id)));
  const nonNormalSystems = allSystems.filter(sysId => sysId !== 1);
  assert.ok(nonNormalSystems.length >= 2, `Program must contain diverse training systems like Superset/Triset/Dropset (got ${nonNormalSystems.length})`);

  console.log('--- 5. Testing Settings Page UI & Design Tokens Compliance ---');
  const aiSettingsJs = fs.readFileSync(path.join(publicDir, 'ai-settings.js'), 'utf8');
  const aiSettingsCss = fs.readFileSync(path.join(publicDir, 'ai-settings.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  assert.ok(indexHtml.includes('ai-settings.css'), 'index.html must include ai-settings.css');
  assert.ok(indexHtml.includes('ai-settings.js'), 'index.html must include ai-settings.js');
  assert.doesNotMatch(aiSettingsCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'ai-settings.css must not use raw hex colors');
  assert.doesNotMatch(aiSettingsCss, /!important/i, 'ai-settings.css must not use !important');
  assert.ok(aiSettingsJs.includes('renderAISettings'), 'ai-settings.js must expose renderAISettings');
  assert.ok(aiSettingsJs.includes('aiSettingsForm'), 'ai-settings.js must contain settings form');
  assert.ok(aiSettingsJs.includes('aiChatMessages'), 'ai-settings.js must contain live test chat');

  console.log('--- 6. Testing Mandatory Button Names and Triggers ---');
  const submissionsJs = fs.readFileSync(path.join(publicDir, 'coach-submissions.js'), 'utf8');
  assert.ok(submissionsJs.includes('ساخت برنامه با AI'), 'coach-submissions.js must contain exact button text: «ساخت برنامه با AI»');
  assert.ok(submissionsJs.includes('btnAiBuildProgram'), 'coach-submissions.js must contain btnAiBuildProgram');

  const builderJs = fs.readFileSync(path.join(publicDir, 'program-builder.js'), 'utf8');
  assert.ok(builderJs.includes('تولید پیش‌نویس هوشمند'), 'program-builder.js must contain exact button text: «تولید پیش‌نویس هوشمند»');
  assert.ok(builderJs.includes('btnAiGenerateDraft'), 'program-builder.js must contain btnAiGenerateDraft');

  console.log(JSON.stringify({
    ok: true,
    ai_settings_singleton: true,
    secret_masking: true,
    tool_definitions_count: aiService.AI_TOOLS.length,
    tool_execution_functional: true,
    ai_draft_generation_verified: true,
    mandatory_buttons_verified: true,
    ui_compliant: true
  }));
})();
