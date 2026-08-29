#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const suppService = require('../src/supplement-program-service');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

(async () => {
  console.log('--- 1. Testing Database Migration 026 (Supplement Programs & Items Schema) ---');
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert.ok(tables.includes('supplement_programs'), 'supplement_programs table must exist');
  assert.ok(tables.includes('supplement_program_items'), 'supplement_program_items table must exist');

  console.log('--- 2. Testing Exact 16 Timing Options in Exact Order ---');
  const expectedTimings = [
    'قبل صبحانه',
    'همراه صبحانه',
    'بعد صبحانه',
    'میان وعده صبح',
    'قبل ناهار',
    'همراه ناهار',
    'بعد ناهار',
    'میان وعده اول عصر',
    'میان وعده دوم عصر',
    'قبل تمرین',
    'حین تمرین',
    'بعد تمرین',
    'قبل شام',
    'همراه شام',
    'بعد شام',
    'قبل خواب'
  ];

  assert.equal(suppService.TIMING_OPTIONS.length, 16, 'Timing options count must be exactly 16');
  for (let i = 0; i < expectedTimings.length; i++) {
    assert.equal(suppService.TIMING_OPTIONS[i], expectedTimings[i], `Timing option at index ${i} must match '${expectedTimings[i]}'`);
  }

  // Ensure no duplicate timing options
  const uniqueTimings = new Set(suppService.TIMING_OPTIONS);
  assert.equal(uniqueTimings.size, 16, 'Timing options must not contain duplicates');

  console.log('--- 3. Testing Supplement Catalog (Exact 69 Items in Order) ---');
  const catalog = suppService.getSupplementCatalog();
  assert.ok(Array.isArray(catalog), 'Catalog must be an array');
  assert.equal(catalog.length, 69, 'Catalog must contain exactly 69 supplement items');

  const expected69 = [
    'ویتامین B6',
    'مولتی ویتامین',
    'ویتامین B',
    'ویتامین K',
    'ویتامین E',
    'ویتامین D',
    'ویتامین C',
    'ویتامین A',
    'بی کمپلکس',
    'قرص منیزیوم',
    'روی (Zinc)',
    'قرص سلنیوم',
    'ویتامین B12',
    'ویتامین B1',
    'ویتامین B3',
    'ویتامین B2',
    'ویتامین B5',
    'ویتامین B6',
    'ویتامین B7',
    'ویتامین B8',
    'ویتامین B9',
    'ویتامین B10',
    'ویتامین B11',
    'ویتامین B12',
    'کوآنزیم Q10',
    'آهن',
    'آلفا لیپوئیک اسید (ALA)',
    'رزوراترول',
    'بتا کاروتن',
    'بیوتین (B7)',
    'پروتئین وی',
    'پروتئین کازئین',
    'کراتین',
    'مکمل BCAA',
    'مکمل لوسین',
    'مکمل ایزولوسین',
    'مکمل والین',
    'مکمل EAA',
    'گینر',
    'پمپ ورزشی',
    'بتا آلانین',
    'سیترولین مالات',
    'کافئین',
    'ترموژنیک‌ها',
    'ال-کارنیتین',
    'چربی سوز CLA',
    'گلوتامین',
    'زینک + منیزیم (ZMA)',
    'جوشان سایز بزرگ',
    'مکمل HMB',
    'آرژنین',
    'پروتئین ایزوله',
    'قرص کلسیم',
    'قرص کرومیوم',
    'مکمل Inositol',
    'قرص سلنیوم پلاس',
    'زینک پلاس',
    'سدیم',
    'امگا ۳',
    'آستا',
    'امگا',
    'لیپوسیکس',
    'کلاژن ویتامین C',
    'نوروبیون خوراکی',
    'قرص مالتودکسترین',
    'پودر دکستروز یا مالتودکسترین',
    'منیزیم سیترات',
    'پودر سفیده تخم مرغ',
    'قرص فاکسید'
  ];

  for (let i = 0; i < expected69.length; i++) {
    assert.equal(catalog[i].name, expected69[i], `Supplement at index ${i} must be '${expected69[i]}'`);
    assert.ok(catalog[i].icon, `Supplement '${catalog[i].name}' must have an icon`);
  }

  console.log('--- 4. Testing Supplement Program Creation ---');
  // 4a. Reject program without title
  assert.throws(() => {
    suppService.createSupplementProgram(db, {
      title: '',
      category: 'muscle_building',
      items: []
    });
  }, /عنوان نمونه برنامه مکمل الزامی است/, 'Should reject program without title');

  // 4b. Create template program
  const created = suppService.createSupplementProgram(db, {
    title: 'پکیج حجم خشک حرفه‌ای و ریکاوری',
    category: 'muscle_building',
    description: 'پروتکل مصرف مکمل برای دوره هایپرتروفی همراه با مصرف ۴ لیتر آب روزانه',
    items: [
      { supplement_name: 'ویتامین B', timing: 'همراه صبحانه', notes: '۱ قرص روزانه با صبحانه', icon: '💊' },
      { supplement_name: 'پروتئین وی', timing: 'بعد تمرین', notes: '۱ اسکوپ با ۳۰۰ میلی‌لیتر آب سرد', icon: '🥛' },
      { supplement_name: 'کراتین', timing: 'بعد تمرین', notes: '۵ گرم همراه با پروتئین وی', icon: '⚡' },
      { supplement_name: 'پروتئین کازئین', timing: 'قبل خواب', notes: '۱ اسکوپ حل شده در شیر کم‌چرب قبل خواب', icon: '🌙' },
      { supplement_name: 'پمپ قبل تمرین', timing: 'قبل تمرین', notes: '۱ پیمانه ۲۰ دقیقه قبل تمرین', icon: '🔥' }
    ]
  });

  assert.ok(created, 'Supplement program must be created');
  assert.equal(created.title, 'پکیج حجم خشک حرفه‌ای و ریکاوری');
  assert.equal(created.category, 'muscle_building');
  assert.equal(created.is_template, 1);
  assert.equal(created.items_count, 5);
  assert.equal(created.items.length, 5);
  assert.equal(created.items[0].supplement_name, 'ویتامین B');
  assert.equal(created.items[0].timing, 'همراه صبحانه');

  console.log('--- 5. Testing Supplement Program Update & Item Replacement ---');
  const updated = suppService.updateSupplementProgram(db, created.id, {
    title: 'پکیج حجم خشک حرفه‌ای (اصلاح‌شده)',
    category: 'muscle_building',
    description: 'توضیحات اصلاح شده',
    items: [
      { supplement_name: 'ویتامین B', timing: 'همراه صبحانه', notes: '۱ قرص' },
      { supplement_name: 'پروتئین وی', timing: 'بعد تمرین', notes: '۱ اسکوپ' },
      { supplement_name: 'کراتین', timing: 'بعد تمرین', notes: '۵ گرم' },
      { supplement_name: 'BCAA', timing: 'حین تمرین', notes: '۱۰ گرم در آب' },
      { supplement_name: 'پروتئین کازئین', timing: 'قبل خواب', notes: '۱ اسکوپ' }
    ]
  });

  assert.equal(updated.title, 'پکیج حجم خشک حرفه‌ای (اصلاح‌شده)');
  assert.equal(updated.items_count, 5);
  assert.ok(updated.items.some(i => i.supplement_name === 'BCAA'), 'Updated program must include BCAA');

  console.log('--- 6. Testing Assigning Supplement Program to Student ---');
  const insStudent = db.prepare("INSERT INTO students (full_name, mobile, case_number, stable_id) VALUES ('رضا اسدی', '09127778899', '100099', 'st-supp-1')").run();
  const studentId = Number(insStudent.lastInsertRowid);

  const studentProg = suppService.createSupplementProgram(db, {
    student_id: studentId,
    title: 'برنامه مکمل اختصاصی رضا',
    category: 'fat_loss',
    items: [
      { supplement_name: 'ال کارنیتین', timing: 'قبل تمرین', notes: '۱۵۰۰ میلی‌گرم ۳۰ دقیقه قبل هوازی' },
      { supplement_name: 'امگا ۳', timing: 'همراه ناهار', notes: '۱ کپسول با ناهار' }
    ]
  });

  assert.equal(studentProg.student_id, studentId);
  assert.equal(studentProg.student_name, 'رضا اسدی');
  assert.equal(studentProg.is_template, 0);

  console.log('--- 7. Testing List Tabs & Filters ---');
  const templateList = suppService.listSupplementPrograms(db, { type: 'template' });
  assert.ok(templateList.some(p => p.id === created.id), 'Template tab must list template programs');
  assert.ok(!templateList.some(p => p.id === studentProg.id), 'Template tab must not include student-assigned programs');

  const studentList = suppService.listSupplementPrograms(db, { type: 'student' });
  assert.ok(studentList.some(p => p.id === studentProg.id), 'Student tab must list student programs');

  const catList = suppService.listSupplementPrograms(db, { category: 'fat_loss' });
  assert.ok(catList.every(p => p.category === 'fat_loss'), 'Category filter must work');

  console.log('--- 8. Testing Soft Deletion ---');
  const delRes = suppService.deleteSupplementProgram(db, created.id);
  assert.ok(delRes.success, 'Soft delete should succeed');
  const getAfterDel = suppService.getSupplementProgram(db, created.id);
  assert.equal(getAfterDel, null, 'Deleted program must not be retrieved');

  console.log('--- 9. Testing AI Clinical & Synergy Analysis Engine ---');
  // 9a. Test Clashing Interactions: Iron + Calcium in same timing
  const clashAnalysis = await suppService.analyzeSupplementsWithAI(db, {
    title: 'برنامه تستی با تداخل آهن و کلسیم',
    category: 'general_health',
    items: [
      { supplement_name: 'آهن + فولیک اسید', timing: 'همراه ناهار' },
      { supplement_name: 'کلسیم + D3', timing: 'همراه ناهار' }
    ]
  });

  assert.ok(clashAnalysis, 'AI analysis should return a report');
  assert.ok(clashAnalysis.interactions.length > 0, 'Must detect interactions');
  assert.ok(clashAnalysis.interactions.some(i => i.severity === 'danger' && i.title.includes('آهن و کلسیم')), 'Must flag dangerous Iron + Calcium collision');

  // 9b. Test Timing Suboptimality: Casein during workout + Caffeine at night
  const timingAnalysis = await suppService.analyzeSupplementsWithAI(db, {
    title: 'برنامه تستی با زمان‌بندی نامناسب',
    category: 'muscle_building',
    items: [
      { supplement_name: 'پروتئین کازئین', timing: 'حین تمرین' },
      { supplement_name: 'پمپ قبل تمرین', timing: 'قبل خواب' }
    ]
  });

  assert.ok(timingAnalysis.timingOptimization.some(t => t.supplement.includes('کازئین') && t.status === 'suboptimal' && t.suggestedTiming === 'قبل خواب'), 'Must suggest moving Casein to bedtime');
  assert.ok(timingAnalysis.timingOptimization.some(t => t.supplement.includes('پمپ') && t.status === 'suboptimal' && t.suggestedTiming === 'قبل تمرین'), 'Must suggest moving Pre-workout away from bedtime');
  assert.ok(timingAnalysis.overdoseStimulantWarnings.some(w => w.severity === 'high' && w.title.includes('ساعات عصر و شب')), 'Must issue evening stimulant warning');

  // 9c. Test Synergy: Vitamin C + Iron & Creatine + Beta-Alanine
  const synergyAnalysis = await suppService.analyzeSupplementsWithAI(db, {
    title: 'برنامه تستی با ترکیبات هم‌افزا',
    category: 'performance_energy',
    items: [
      { supplement_name: 'ویتامین C', timing: 'قبل صبحانه' },
      { supplement_name: 'آهن + فولیک اسید', timing: 'قبل صبحانه' },
      { supplement_name: 'کراتین', timing: 'بعد تمرین' },
      { supplement_name: 'بتا آلانین', timing: 'قبل تمرین' }
    ]
  });

  assert.ok(synergyAnalysis.synergies.some(s => s.title.includes('ویتامین C و آهن')), 'Must detect Vitamin C + Iron synergy');
  assert.ok(synergyAnalysis.synergies.some(s => s.title.includes('کراتین + بتا آلانین')), 'Must detect Creatine + Beta-Alanine synergy');

  // 9d. Test Multi-Stimulant Overdose Alert
  const stimAnalysis = await suppService.analyzeSupplementsWithAI(db, {
    title: 'برنامه تستی با چند محرک هم‌زمان',
    category: 'fat_loss',
    items: [
      { supplement_name: 'پمپ قبل تمرین', timing: 'قبل تمرین' },
      { supplement_name: 'کافئین', timing: 'قبل تمرین' },
      { supplement_name: 'ال کارنیتین', timing: 'قبل تمرین' }
    ]
  });

  assert.ok(stimAnalysis.overdoseStimulantWarnings.some(w => w.severity === 'critical' && w.title.includes('چند منبع کافئین')), 'Must issue multi-stimulant critical alert');

  console.log('--- 10. Testing UI & Design Tokens Compliance ---');
  const suppJs = fs.readFileSync(path.join(publicDir, 'supplement-programs.js'), 'utf8');
  const suppCss = fs.readFileSync(path.join(publicDir, 'supplement-programs.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');

  assert.ok(indexHtml.includes('supplement-programs.css'), 'index.html must include supplement-programs.css');
  assert.ok(indexHtml.includes('supplement-programs.js'), 'index.html must include supplement-programs.js');
  assert.doesNotMatch(suppCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'supplement-programs.css must not use raw hex colors');
  assert.doesNotMatch(suppCss, /!important/i, 'supplement-programs.css must not use !important');
  assert.ok(suppJs.includes('renderSupplementProgramsList'), 'supplement-programs.js must export renderSupplementProgramsList');
  assert.ok(suppJs.includes('renderSupplementProgramBuilder'), 'supplement-programs.js must export renderSupplementProgramBuilder');
  assert.ok(suppJs.includes('برای شروع، یک مکمل جدید اضافه کنید!'), 'Must contain exact empty state text: «برای شروع، یک مکمل جدید اضافه کنید!»');
  assert.ok(suppJs.includes('افزودن مکمل +'), 'Must contain exact button: «افزودن مکمل +»');
  assert.ok(suppJs.includes('ذخیره و بازگشت'), 'Must contain exact button: «ذخیره و بازگشت»');
  assert.ok(suppJs.includes('تحلیل هوشمند مکمل‌ها'), 'Must contain exact button: «تحلیل هوشمند مکمل‌ها»');
  assert.ok(suppJs.includes('جستجوی مکمل...'), 'Must contain exact search placeholder: «جستجوی مکمل...»');
  assert.ok(appJs.includes('/programs/supplement/list'), 'app.js must register /programs/supplement/list');
  assert.ok(appJs.includes('/programs/supplement/form'), 'app.js must register /programs/supplement/form');

  console.log(JSON.stringify({
    ok: true,
    migration_026_ready: true,
    exact_16_timings_verified: true,
    supplement_catalog_verified: true,
    crud_operations_verified: true,
    ai_clinical_analysis_verified: true,
    ui_and_design_tokens_compliant: true
  }));
})();
