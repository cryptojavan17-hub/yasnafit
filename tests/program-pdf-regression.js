#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

console.log('--- 1. Testing PDF Files Existence and Linkage ---');
const pdfJsPath = path.join(publicDir, 'program-pdf.js');
const pdfCssPath = path.join(publicDir, 'program-pdf.css');
assert.ok(fs.existsSync(pdfJsPath), 'program-pdf.js must exist');
assert.ok(fs.existsSync(pdfCssPath), 'program-pdf.css must exist');

const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const studentHtml = fs.readFileSync(path.join(publicDir, 'student.html'), 'utf8');

assert.ok(indexHtml.includes('program-pdf.css'), 'index.html must include program-pdf.css');
assert.ok(indexHtml.includes('program-pdf.js'), 'index.html must include program-pdf.js');
assert.ok(studentHtml.includes('program-pdf.css'), 'student.html must include program-pdf.css');
assert.ok(studentHtml.includes('program-pdf.js'), 'student.html must include program-pdf.js');

console.log('--- 2. Testing PDF CSS Architecture and Constraints ---');
const pdfCss = fs.readFileSync(pdfCssPath, 'utf8');
assert.doesNotMatch(pdfCss, /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i, 'program-pdf.css must not define raw hex colors');
assert.doesNotMatch(pdfCss, /!important/i, 'program-pdf.css must not use !important');
assert.ok(pdfCss.includes('@media print'), 'program-pdf.css must include @media print');
assert.ok(pdfCss.includes('@page'), 'program-pdf.css must include @page setup for A4');
assert.ok(pdfCss.includes('.pdf-sheet'), 'program-pdf.css must include .pdf-sheet');
assert.ok(pdfCss.includes('.pdf-mov-row'), 'program-pdf.css must include .pdf-mov-row');
assert.ok(pdfCss.includes('.pdf-set-sq'), 'program-pdf.css must include .pdf-set-sq');

console.log('--- 3. Testing PDF HTML Generator Logic ---');
global.window = global;
global.document = { body: { style: {} } };

const jalaliCode = fs.readFileSync(path.join(publicDir, 'jalali.js'), 'utf8');
eval(jalaliCode);

const pdfJsCode = fs.readFileSync(pdfJsPath, 'utf8');
eval(pdfJsCode);

assert.ok(global.YasnafitPDF, 'YasnafitPDF must be exposed globally');
assert.equal(typeof global.YasnafitPDF.generateHTML, 'function', 'generateHTML must be a function');
assert.equal(typeof global.YasnafitPDF.open, 'function', 'open must be a function');

const sampleProgram = {
  id: 10,
  title: 'برنامه تمرینی اختصاصی فاز حجم',
  student_name: 'علیرضا راد',
  student_case_number: 'YASNA-2045',
  start_date: '2026-08-24',
  end_date: '2026-09-23',
  status: 'ACTIVE',
  coach_note: 'حداقل ۸ ساعت خواب شبانه و مصرف ۳ لیتر آب در روز.',
  program_data: {
    days: [
      {
        day_number: 1,
        focus: 'سینه و سرشانه',
        is_rest_day: false,
        coach_note: 'تمپو ۲-۰-۲ رعایت شود.',
        data: [
          {
            exercise_system_id: 2,
            system_type: 'superset',
            movement_list: [
              {
                name: 'پرس سینه دمبل',
                description: 'تمرکز بر بخش بالایی',
                target_muscles: ['front_chest', 'front_deltoid_anterior'],
                sets: [
                  { type: 'REPEAT', count: 12 },
                  { type: 'REPEAT', count: 10 },
                  { type: 'FAILURE', count: 0 }
                ]
              }
            ]
          }
        ]
      },
      {
        day_number: 2,
        focus: 'استراحت و ریکاوری',
        is_rest_day: true,
        data: []
      }
    ]
  }
};

const html = global.YasnafitPDF.generateHTML(sampleProgram);
assert.ok(html.includes('برنامه تمرینی اختصاصی فاز حجم'), 'HTML must include program title');
assert.ok(html.includes('علیرضا راد'), 'HTML must include student name');
assert.ok(html.includes('YASNA-2045'), 'HTML must include case number');
assert.ok(html.includes('1405/06/02') || html.includes('۱۴۰۵/۰۶/۰۲'), 'HTML must include formatted Jalali date');
assert.ok(html.includes('پرس سینه دمبل'), 'HTML must include exercise name');
assert.ok(html.includes('سوپر ست (Superset)'), 'HTML must include training system name');
assert.ok(html.includes('سینه'), 'HTML must include Persian muscle name');
assert.ok(html.includes('سرشانه جلو'), 'HTML must include Persian muscle name');
assert.ok(html.includes('تکرار'), 'HTML must include Persian unit name');
assert.ok(html.includes('MAX') || html.includes('توان'), 'HTML must include failure set badge');
assert.ok(html.includes('روز استراحت و ریکاوری فعال'), 'HTML must render rest day card');
assert.ok(html.includes('حداقل ۸ ساعت خواب شبانه'), 'HTML must render coach note');

console.log('--- 4. Testing PDF Triggers in Builder, Student App & CRM ---');
const builderJs = fs.readFileSync(path.join(publicDir, 'program-builder.js'), 'utf8');
assert.ok(builderJs.includes('openProgramPDF'), 'program-builder.js must call openProgramPDF');
assert.ok(builderJs.includes('btnExportPDF'), 'program-builder.js must contain btnExportPDF');

const studentAppJs = fs.readFileSync(path.join(publicDir, 'student-app.js'), 'utf8');
assert.ok(studentAppJs.includes('btnStudentProgramPDF'), 'student-app.js must contain btnStudentProgramPDF');
assert.ok(studentAppJs.includes('openProgramPDF'), 'student-app.js must call openProgramPDF');

const studentsJs = fs.readFileSync(path.join(publicDir, 'students.js'), 'utf8');
assert.ok(studentsJs.includes('data-pdf-program'), 'students.js must contain data-pdf-program');
assert.ok(studentsJs.includes('openProgramPDF'), 'students.js must call openProgramPDF');

console.log(JSON.stringify({
  ok: true,
  pdf_module_ready: true,
  pdf_css_valid: true,
  jalali_dates_supported: true,
  all_panels_integrated: true
}));
