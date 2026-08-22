#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const cssFiles=['styles.css','dark-theme.css','exercises.css','program-builder.css','student-portal.css','releases.css','students.css','student-app.css'];
const coachCssFiles=cssFiles.filter(file=>file!=='student-app.css');
const css=Object.fromEntries(cssFiles.map(file=>[file,fs.readFileSync(path.join(publicDir,file),'utf8')]));

for(const token of ['--bg: #050505','--surface: #101010','--glass: rgba(255, 255, 255, .045)','--border: rgba(255, 255, 255, .085)','--text: #fff','--radius-lg: 16px','--transition: 180ms ease']){
  assert.ok(css['styles.css'].includes(token),`missing central design token: ${token}`);
}
assert.doesNotMatch(Object.values(css).join('\n'),/!important/i,'CSS architecture regressed to !important overrides');
assert.doesNotMatch(Object.values(css).join('\n'),/background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/i,'pure white component background found');
assert.doesNotMatch(Object.values(css).join('\n'),/#(?:22c55e|4aaf29|4dc224|70d947|369b18|e0f2fe|e9f7e4|fffbeb|f6fff3|efe8ff|e8f2ff)/i,'legacy colorful palette found');

const requiredSelectors={
  'styles.css':['.sidebar {','.topbar {','.stat-grid {','.table-wrap {','.modal {','input:focus'],
  'exercises.css':['.exercise-card {','.exercise-card.selected-card','.image-wrap {'],
  'program-builder.css':['.day-card {','.system-card {','.movement-card {','.set-row {','.drawer-panel {'],
  'student-portal.css':['.student-portal {','.sp-card {','.photo-upload-box {'],
  'students.css':['.students-panel, .detail-section {','.students-table-wrap {','.student-modal {'],
  'releases.css':['.release-card {','.current-version-box {'],
  'student-app.css':['.student-auth-page{','.onboarding-card{','.student-bottom-nav{','.upload-card{']
};
for(const [file,selectors] of Object.entries(requiredSelectors)) for(const selector of selectors){
  assert.ok(css[file].includes(selector),`${file} missing redesigned selector ${selector}`);
}

const inlineSources=['core.js','coach-submissions.js','program-builder.js','student-portal.js','students.js','exercises.js','student-app.js'].map(file=>fs.readFileSync(path.join(publicDir,file),'utf8')).join('\n');
assert.doesNotMatch(inlineSources,/background\s*:\s*#(?:fff(?:fff)?|f[0-9a-f]{5}|e[0-9a-f]{5})/i,'light inline background can override dark theme');
assert.doesNotMatch(inlineSources,/var\(--[^)]+\)[0-9a-f]+/i,'malformed CSS variable found in inline styles');

const index=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
let previous=-1;
for(const file of coachCssFiles){
  const current=index.indexOf(`/${file}`);
  assert.ok(current>previous,`stylesheet order is wrong at ${file}`);
  previous=current;
}
const studentHtml=fs.readFileSync(path.join(publicDir,'student.html'),'utf8');
assert.match(studentHtml,/dir="rtl"/,'student shell is not RTL');
assert.match(studentHtml,/\/styles\.css/,'student shell misses design tokens');
assert.match(studentHtml,/\/student-app\.css/,'student shell misses dedicated responsive styles');
assert.match(studentHtml,/width=device-width/,'student shell misses mobile viewport');
assert.match(css['student-app.css'],/@media\(max-width:800px\)/,'student portal misses tablet/mobile layout');
assert.match(css['student-app.css'],/@media\(max-width:560px\)/,'student onboarding misses narrow mobile layout');
assert.match(css['student-app.css'],/\.onboarding-error\.visible/,'student onboarding misses persistent validation feedback');
const studentAppSource=fs.readFileSync(path.join(publicDir,'student-app.js'),'utf8');
assert.match(studentAppSource,/inputmode="decimal"/,'body inputs are not mobile-decimal compatible');
assert.match(studentAppSource,/\[۰-۹\]/,'Persian numeric input normalization is missing');
assert.match(studentAppSource,/requireRange\(height,100,250/,'body range validation is missing');
assert.match(studentAppSource,/name="bodyPhotoPreference"/,'explicit body-photo preference is missing');
assert.match(studentAppSource,/\['front','side','back','front_flex','back_flex'\]/,'five optional photo slots are missing');
assert.match(studentAppSource,/هر پنج تصویر اختیاری هستند/,'optional photo wording is missing');
assert.doesNotMatch(studentAppSource,/عکس‌های جلو، پشت و بغل الزامی/,'photo submission became mandatory again');
assert.doesNotMatch(studentHtml,/sidebar|coach-submissions|src="\/app\.js"/,'student shell includes coach UI assets');
console.log(JSON.stringify({ok:true,css_files:cssFiles.length,tokens:true,no_light_overrides:true,no_colorful_legacy_palette:true,components:true,stylesheet_order:true,dedicated_student_shell:true}));
