#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const cssFiles=['theme.css','styles.css','dark-theme.css','exercises.css','program-builder.css','student-portal.css','releases.css','students.css','student-app.css','unified-components.css'];
const coachCssFiles=cssFiles.filter(file=>file!=='student-app.css');
const css=Object.fromEntries(cssFiles.map(file=>[file,fs.readFileSync(path.join(publicDir,file),'utf8')]));

for(const token of ['--bg: #050505','--card: rgba(18, 18, 22, .78)','--surface: #101010','--glass: rgba(255, 255, 255, .045)','--border: rgba(255, 255, 255, .085)','--text: #fff','--accent: #3b82f6','--success: #34d399','--danger: #f87171','--component-control-height: 42px','--component-radius: 13px','--component-padding: 14px','--radius-lg: 16px','--transition: 180ms ease']){
  assert.ok(css['theme.css'].includes(token),`missing central design token: ${token}`);
}
for(const [file,source] of Object.entries(css)){
  if(file!=='theme.css')assert.doesNotMatch(source,/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i,`${file} defines colors outside the central theme`);
}
assert.doesNotMatch(Object.values(css).join('\n'),/background(?:-color)?\s*:\s*var\(--white\)/i,'legacy white surface token is still used');
assert.doesNotMatch(Object.values(css).join('\n'),/color\s*:\s*var\(--black\)/i,'legacy black-on-light component remains');
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
  'student-app.css':['.student-auth-page{','.onboarding-card{','.student-bottom-nav{','.upload-card{'],
  'unified-components.css':['.sidebar,.topbar','.student-card{padding:var(--component-padding)','.program-builder,.exercise-page','.coach-review-hero{padding:var(--component-padding)']
};
for(const [file,selectors] of Object.entries(requiredSelectors)) for(const selector of selectors){
  assert.ok(css[file].includes(selector),`${file} missing redesigned selector ${selector}`);
}

const appSource=fs.readFileSync(path.join(publicDir,'app.js'),'utf8');
const operationalMenuRoutes=['/coach/dashboard','/users-list','/students/submissions','/programs/exercise/form','/templates/exercise/list','/programs/exercise/movements-list','/coach/settings','/coach/releases'];
for(const route of operationalMenuRoutes)assert.match(appSource,new RegExp(route.replaceAll('/','\\/')),`operational menu route is missing: ${route}`);
for(const removed of ['/coach/manage-landing','/products/my','/coach/assists','/templates/diet/list','/templates/supplement/list','/templates/corrective/list','/reports/coach/general','/coach/profile'])assert.doesNotMatch(appSource,new RegExp(removed.replaceAll('/','\\/')),`dead menu route remains: ${removed}`);
assert.doesNotMatch(appSource,/آماده طراحی|پیاده‌سازی امکانات|محتوای عملیاتی آن در مرحله بعد/,'dead placeholder page remains in the coach router');
assert.match(appSource,/window\.renderCoreRoute/,'operational core routes are not delegated from the sidebar router');
const inlineSources=['core.js','coach-submissions.js','program-builder.js','student-portal.js','students.js','exercises.js','student-app.js','assessment-wizard.js'].map(file=>fs.readFileSync(path.join(publicDir,file),'utf8')).join('\n');
assert.doesNotMatch(inlineSources,/background\s*:\s*#(?:fff(?:fff)?|f[0-9a-f]{5}|e[0-9a-f]{5})/i,'light inline background can override dark theme');
assert.doesNotMatch(inlineSources,/var\(--[^)]+\)[0-9a-f]+/i,'malformed CSS variable found in inline styles');
assert.match(fs.readFileSync(path.join(publicDir,'program-builder.js'),'utf8'),/unified-components\.css/,'Program Builder preview does not use the global component layer');

const index=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
let previous=-1;
for(const file of coachCssFiles){
  const current=index.indexOf(`/${file}`);
  assert.ok(current>previous,`stylesheet order is wrong at ${file}`);
  previous=current;
}
const studentHtml=fs.readFileSync(path.join(publicDir,'student.html'),'utf8');
assert.match(index,/id="coachReviewBell"/,'coach header review bell is missing');
assert.match(index,/href="\/students\/submissions"/,'coach review bell does not link to pending assessments');
assert.match(fs.readFileSync(path.join(publicDir,'core.js'),'utf8'),/ارزیابی در انتظار بررسی/,'pending assessment count is not loaded into the coach header');
assert.doesNotMatch(fs.readFileSync(path.join(publicDir,'coach-submissions.js'),'utf8'),/around_the_belly_from_the_navel|دور ناف/,'removed navel measurement is still shown to coach');
assert.match(studentHtml,/dir="rtl"/,'student shell is not RTL');
assert.match(studentHtml,/\/theme\.css/,'student shell misses central design tokens');
assert.match(studentHtml,/\/student-app\.css/,'student shell misses dedicated responsive styles');
assert.match(studentHtml,/\/unified-components\.css/,'student shell misses unified component layer');
assert.ok(studentHtml.indexOf('/unified-components.css')>studentHtml.indexOf('/student-app.css'),'student unified component layer must load last');
assert.match(studentHtml,/\/assessment-wizard\.js/,'student shell misses professional assessment wizard');
assert.match(studentHtml,/width=device-width/,'student shell misses mobile viewport');
assert.match(css['student-app.css'],/@media\(max-width:800px\)/,'student portal misses tablet/mobile layout');
assert.match(css['student-app.css'],/@media\(max-width:560px\)/,'student onboarding misses narrow mobile layout');
assert.match(css['student-app.css'],/\.onboarding-error\.visible/,'student onboarding misses persistent validation feedback');
const studentAppSource=fs.readFileSync(path.join(publicDir,'student-app.js'),'utf8');
const wizardSource=fs.readFileSync(path.join(publicDir,'assessment-wizard.js'),'utf8');
const coreSource=fs.readFileSync(path.join(publicDir,'core.js'),'utf8');
const reviewSource=fs.readFileSync(path.join(publicDir,'coach-submissions.js'),'utf8');
const dashboardBlock=coreSource.slice(coreSource.indexOf("if(route==='/coach/dashboard')"),coreSource.indexOf("if(route==='/programs/exercise/movements-list')"));
assert.doesNotMatch(dashboardBlock,/student-submissions|latestRelease|release-dashboard-card|اعلان‌های جدید|ارزیابی در انتظار بررسی/,'dashboard still contains duplicate assessment or release notifications');
assert.match(reviewSource,/href="\/assessments\/\$\{item\.id\}"[^>]*>مشاهده ارزیابی/,'submission button is not a reliable assessment link');
assert.match(reviewSource,/window\.renderAssessmentReview/,'assessment review component is missing');
assert.ok(reviewSource.includes('const match=route.match(')&&reviewSource.includes('assessments')&&reviewSource.includes('id=match?Number(match[1]):null'),'assessment review route is not wired');
for(const action of ['btnApprove','btnReject','btnRequestChanges'])assert.match(reviewSource,new RegExp(`id="${action}"`),`review action is missing: ${action}`);
assert.match(reviewSource,/پیام به شاگرد/,'student message action is missing');
assert.match(reviewSource,/case_number/,'case number is missing from coach review');
assert.match(reviewSource,/coach-review-group/,'organized assessment summary is missing');
assert.match(wizardSource,/inputmode="decimal"/,'body inputs are not mobile-decimal compatible');
assert.match(wizardSource,/\[۰-۹\]/,'Persian numeric input normalization is missing');
assert.match(wizardSource,/\[٫,\\\/\]/,'slash/Persian decimal normalization is missing');
assert.match(wizardSource,/wizard-top-error/,'measurement errors are not visible at the top of the wizard');
assert.match(wizardSource,/const button=event\.currentTarget/,'next-step button reference is not preserved across await');
assert.doesNotMatch(wizardSource,/finally\{[^}]*event\.currentTarget/,'async handler can leave the next-step button disabled');
assert.doesNotMatch(wizardSource,/around_the_belly_from_the_navel|دور ناف/,'removed navel measurement is still visible');
assert.match(studentAppSource,/\/student\/workouts/,'student workout UI route is missing');
assert.match(studentAppSource,/\/student\/messages/,'student messaging UI route is missing');
assert.match(studentAppSource,/data-start-day/,'active program cannot start a real workout');
assert.match(wizardSource,/مرحله \$\{state\.step\+1\} از \$\{steps\.length\}/,'eight-step progress indicator is missing');
assert.equal((wizardSource.match(/data-step=\"\d\"/g)||[]).length,8,'assessment wizard must have exactly eight main steps');
assert.match(wizardSource,/segmented-control/,'fast segmented controls are missing');
assert.match(wizardSource,/saveCurrent\(true\)/,'step-change autosave is missing');
assert.match(wizardSource,/id="personalTelegram"/,'Telegram field is missing');
assert.match(wizardSource,/id="personalInstagram"/,'Instagram field is missing');
assert.match(wizardSource,/assessment-case/,'case number is missing from assessment header');
assert.doesNotMatch(wizardSource,/ترجیح می‌دهم نگویم/,'assessment gender has an unsupported third option');
assert.match(wizardSource,/id="primaryGoal"/,'single goal dropdown is missing');
assert.doesNotMatch(wizardSource,/name="goals"/,'complex multi-goal controls still exist');
assert.match(wizardSource,/habits-panel/,'habit questions are not visibly grouped');
assert.doesNotMatch(wizardSource,/data-lifestyle-tab/,'habit questions are still hidden behind tabs');
assert.match(wizardSource,/review-groups/,'grouped review report is missing');
assert.match(wizardSource,/آیا نکته یا توضیحاتی دارید که مربی بداند؟/,'final coach note is missing');
assert.match(css['student-app.css'],/min-height:42px/,'compact touch target rules are missing');
assert.doesNotMatch(wizardSource,/name="bodyPhotoPreference"/,'optional photos still force a preference choice');
assert.match(wizardSource,/\['front_flex','back_flex','side'\]/,'three optional photo slots are missing');
assert.match(wizardSource,/بدون هیچ فایلی می‌توانید ادامه دهید/,'optional photo wording is missing');
for(const guide of ['female-front-flex.png','female-back-flex.png','female-side.png'])assert.match(css['student-app.css'],new RegExp(`guides/${guide.replace('.', '\\.')}`),`educational guide is missing: ${guide}`);
assert.match(wizardSource,/id="skipPhotos"/,'photo step cannot be skipped');
assert.doesNotMatch(wizardSource,/عکس‌های جلو، پشت و بغل الزامی/,'photo submission became mandatory again');
assert.doesNotMatch(studentHtml,/sidebar|coach-submissions|src="\/app\.js"/,'student shell includes coach UI assets');
console.log(JSON.stringify({ok:true,css_files:cssFiles.length,tokens:true,no_light_overrides:true,no_colorful_legacy_palette:true,components:true,stylesheet_order:true,dedicated_student_shell:true}));
