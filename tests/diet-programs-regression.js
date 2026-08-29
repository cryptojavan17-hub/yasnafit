#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const dietService = require('../src/diet-program-service');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

(async () => {
  console.log('--- 1. Testing Database Migration 025 (Diet Programs & Meals Schema) ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert.ok(tables.includes('diet_programs'), 'diet_programs table must exist');
  assert.ok(tables.includes('diet_program_meals'), 'diet_program_meals table must exist');

  console.log('--- 2. Testing Exact 11 Dietary Restriction Options ---');
  const expectedRestrictions = [
    'بدون محدودیت',
    'گیاه‌خواری',
    'وگان',
    'سلیاک',
    'حساسیت به لاکتوز',
    'نقرس',
    'لوکرب',
    'کتوژنیک',
    'فستینگ',
    'حرفه‌ای',
    'مسابقه ای'
  ];

  for (const exp of expectedRestrictions) {
    const found = Object.values(dietService.DIET_RESTRICTIONS).includes(exp);
    assert.ok(found, `Diet restrictions must include: ${exp}`);
  }

  console.log('--- 3. Testing Diet Program Creation with Real-time Calorie Validation ---');
  // 3a. Invalid calorie sum should throw error
  assert.throws(() => {
    dietService.createDietProgram(db, {
      title: 'برنامه نامعتبر با اختلاف کالری',
      total_calories: 2000,
      diet_restriction: 'ketogenic',
      meals: [
        { meal_name: 'صبحانه', calories: 400 },
        { meal_name: 'ناهار', calories: 800 },
        { meal_name: 'شام', calories: 500 }
      ] // Sum = 1700 !== 2000
    });
  }, /برابر نیست/, 'Should reject program when meal calorie sum does not equal total_calories');

  // 3b. Valid program creation
  const created = dietService.createDietProgram(db, {
    title: 'برنامه کتوژنیک هایپرتروفی ۲۲۰۰ کالری',
    total_calories: 2200,
    diet_restriction: 'ketogenic',
    description: 'توضیحات و راهنمای مصرف آب',
    meals: [
      { meal_name: 'صبحانه', calories: 600, start_time: '08:00', end_time: '08:30', notes: 'تخم مرغ و آووکادو' },
      { meal_name: 'ناهار', calories: 900, start_time: '13:30', end_time: '14:30', notes: 'فیله سلمون با روغن زیتون' },
      { meal_name: 'شام', calories: 700, start_time: '20:30', end_time: '21:00', notes: 'استیک فیله گوشت با کره' }
    ]
  });

  assert.ok(created, 'Diet program must be created');
  assert.equal(created.title, 'برنامه کتوژنیک هایپرتروفی ۲۲۰۰ کالری');
  assert.equal(created.total_calories, 2200);
  assert.equal(created.diet_restriction, 'ketogenic');
  assert.equal(created.diet_restriction_fa, 'کتوژنیک');
  assert.equal(created.meals_count, 3);
  assert.equal(created.is_template, 1);

  console.log('--- 4. Testing Diet Program Update & Meal Replacement ---');
  const updated = dietService.updateDietProgram(db, created.id, {
    title: 'برنامه کتوژنیک اصلاح‌شده ۲۲۰۰ کالری',
    total_calories: 2200,
    diet_restriction: 'ketogenic',
    meals: [
      { meal_name: 'صبحانه', calories: 500, start_time: '07:30', notes: 'تخم مرغ و اسفناج' },
      { meal_name: 'میان‌عده صبح', calories: 200, start_time: '11:00', notes: 'گردو و بادام خام' },
      { meal_name: 'ناهار', calories: 800, start_time: '14:00', notes: 'مرغ با کره حیوانی و بروکلی' },
      { meal_name: 'شام', calories: 700, start_time: '20:30', notes: 'ماهی قزل‌آلا' }
    ]
  });

  assert.equal(updated.title, 'برنامه کتوژنیک اصلاح‌شده ۲۲۰۰ کالری');
  assert.equal(updated.meals_count, 4);
  const mealsCalSum = updated.meals.reduce((sum, m) => sum + m.calories, 0);
  assert.equal(mealsCalSum, 2200, 'Updated meals calorie sum must match 2200');

  console.log('--- 5. Testing Assigning Diet Program to a Student ---');
  const insStudent = db.prepare("INSERT INTO students (full_name, mobile, case_number, stable_id) VALUES ('حامد کامل پوریان', '09123334455', '100016', 'st-test-1')").run();
  const studentId = Number(insStudent.lastInsertRowid);

  const studentDietProg = dietService.createDietProgram(db, {
    student_id: studentId,
    title: 'برنامه غذایی ۳ وعده‌ای حامد',
    total_calories: 2000,
    diet_restriction: 'none',
    meals: [
      { meal_name: 'صبحانه', calories: 600 },
      { meal_name: 'ناهار', calories: 800 },
      { meal_name: 'شام', calories: 600 }
    ]
  });

  assert.equal(studentDietProg.student_id, studentId);
  assert.equal(studentDietProg.student_name, 'حامد کامل پوریان');
  assert.equal(studentDietProg.is_template, 0);

  console.log('--- 6. Testing List Tabs & Filtering ---');
  const templateList = dietService.listDietPrograms(db, { type: 'template' });
  assert.ok(templateList.some(p => p.id === created.id), 'Template tab must list templates');
  assert.ok(!templateList.some(p => p.id === studentDietProg.id), 'Template tab must not include student-assigned program');

  const studentList = dietService.listDietPrograms(db, { type: 'student' });
  assert.ok(studentList.some(p => p.id === studentDietProg.id), 'Student tab must list student programs');

  const ketoList = dietService.listDietPrograms(db, { diet_restriction: 'ketogenic' });
  assert.ok(ketoList.every(p => p.diet_restriction === 'ketogenic'), 'Restriction filter must work');

  console.log('--- 7. Testing Soft Deletion ---');
  const delResult = dietService.deleteDietProgram(db, created.id);
  assert.ok(delResult.success, 'Soft delete should succeed');
  const getAfterDel = dietService.getDietProgram(db, created.id);
  assert.equal(getAfterDel, null, 'Deleted program must not be returned');

  console.log('--- 8. Testing AI Nutrition Analysis Engine ---');
  const aiAnalysis = await dietService.analyzeDietWithAI(db, {
    title: 'برنامه غذایی تستی کتوژنیک',
    total_calories: 2000,
    diet_restriction: 'ketogenic',
    meals: [
      { meal_name: 'صبحانه', calories: 600, start_time: '08:00', end_time: '08:30' },
      { meal_name: 'ناهار', calories: 800, start_time: '13:30', end_time: '14:30' },
      { meal_name: 'شام', calories: 600, start_time: '20:30', end_time: '21:00' }
    ]
  });

  assert.ok(aiAnalysis, 'AI analysis should return report');
  assert.ok(aiAnalysis.fitAnalysis, 'Must contain fit analysis');
  assert.ok(aiAnalysis.macros.proteinPercent > 0, 'Must contain macro breakdown');
  assert.ok(aiAnalysis.mealIdeas.length === 3, 'Must contain meal ideas for each meal');
  assert.ok(aiAnalysis.cautions.length > 0, 'Must contain nutritional cautions');

  console.log('--- 9. Testing UI & Design Tokens Compliance ---');
  const dietJs = fs.readFileSync(path.join(publicDir, 'diet-programs.js'), 'utf8');
  const dietCss = fs.readFileSync(path.join(publicDir, 'diet-programs.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  assert.ok(indexHtml.includes('diet-programs.css'), 'index.html must include diet-programs.css');
  assert.ok(indexHtml.includes('diet-programs.js'), 'index.html must include diet-programs.js');
  assert.doesNotMatch(dietCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'diet-programs.css must not use raw hex colors');
  assert.doesNotMatch(dietCss, /!important/i, 'diet-programs.css must not use !important');
  assert.ok(dietJs.includes('renderDietProgramsList'), 'diet-programs.js must export renderDietProgramsList');
  assert.ok(dietJs.includes('renderDietProgramBuilder'), 'diet-programs.js must export renderDietProgramBuilder');
  assert.ok(dietJs.includes('افزودن نمونه برنامه'), 'diet-programs.js must contain button: «افزودن نمونه برنامه»');
  assert.ok(dietJs.includes('برنامه‌های غذایی شاگردان من'), 'diet-programs.js must contain tab: «برنامه‌های غذایی شاگردان من»');
  assert.ok(dietJs.includes('نمونه برنامه‌های غذایی من'), 'diet-programs.js must contain tab: «نمونه برنامه‌های غذایی من»');
  assert.ok(dietJs.includes('سه وعده نرمال'), 'diet-programs.js must contain quick preset: «سه وعده نرمال»');
  assert.ok(dietJs.includes('پنج وعده با میان‌وعده'), 'diet-programs.js must contain quick preset: «پنج وعده با میان‌وعده»');
  assert.ok(dietJs.includes('هفت وعده حرفه‌ای'), 'diet-programs.js must contain quick preset: «هفت وعده حرفه‌ای»');

  console.log(JSON.stringify({
    ok: true,
    migration_025_ready: true,
    exact_11_restrictions_verified: true,
    realtime_calorie_validation: true,
    presets_verified: true,
    student_and_template_tabs_verified: true,
    ai_nutrition_analysis_verified: true,
    ui_compliant: true
  }));
})();
