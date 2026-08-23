#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const launcher=fs.readFileSync(path.join(root,'YASNAFIT-LAUNCHER.bat'),'utf8');
assert.doesNotMatch(launcher,/Update Yasnafit from GitHub|Import Exercise Images|:UPDATE|:IMPORT_IMAGES/,'removed launcher maintenance actions returned');
assert.match(launcher,/echo 5\. Exit/,'launcher exit option is not compactly renumbered');
assert.match(launcher,/Select an option \(1-5\)/,'launcher prompt still advertises removed options');
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
assert.match(appSource,/if\(initialPath==='\/'\|\|initialPath==='\/index\.html'\|\|initialPath==='\/coach\/dashboard'\)/,'app shell does not guard dashboard rendering on deep routes');
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
const localizationSource=fs.readFileSync(path.join(publicDir,'localization.js'),'utf8');
assert.match(index,/\/localization\.js/,'coach shell misses Persian localization layer');
assert.match(studentHtml,/\/localization\.js/,'student shell misses Persian localization layer');
for(const code of ['INVITED','PROFILE_INCOMPLETE','SUBMITTED','PENDING_REVIEW','APPROVED','REJECTED','DRAFT','ACTIVE','COMPLETED','ARCHIVED'])assert.match(localizationSource,new RegExp(`${code}:'[^']+'`),`Persian label is missing for ${code}`);
assert.match(index,/id="coachReviewBell"/,'coach header notification bell is missing');
assert.match(index,/id="coachNotificationPanel" hidden/,'notification panel must be closed by default');
assert.match(index,/id="coachReviewBellCount" hidden/,'notification count must stay hidden when there are no unread items');
assert.match(index,/href="\/students\/submissions"/,'notification panel does not link to pending assessments');
assert.match(index,/id="clearNotifications"[^>]*>پاک کردن همه/,'notification clear-all button is missing');
assert.match(fs.readFileSync(path.join(publicDir,'core.js'),'utf8'),/api\('\/api\/coach\/notifications',\{method:'DELETE'\}\)/,'notification clear-all action is not wired');
assert.match(index,/id="sidebarToggle"/,'desktop sidebar visibility control is missing');
assert.match(fs.readFileSync(path.join(publicDir,'app.js'),'utf8'),/yasnafit_sidebar_collapsed/,'sidebar visibility preference is not persisted');
assert.match(fs.readFileSync(path.join(publicDir,'core.js'),'utf8'),/notifications\.filter\(item=>!item\.read_at\)/,'header badge is not based on unread notifications');
assert.match(fs.readFileSync(path.join(publicDir,'core.js'),'utf8'),/coach\/notifications\/\$\{encodeURIComponent/,'notification items cannot be marked read');
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
assert.match(coreSource,/if\(initialCoachPath==='\/'\|\|initialCoachPath==='\/index\.html'\|\|initialCoachPath==='\/coach\/dashboard'\)render/,'core dashboard rendering is not guarded from deep routes');
assert.match(dashboardBlock,/if\(!\['\/','\/index\.html','\/coach\/dashboard'\]\.includes\(location\.pathname\)\)return/,'late dashboard response can overwrite Program Builder');
assert.doesNotMatch(dashboardBlock,/student-submissions|latestRelease|release-dashboard-card|اعلان‌های جدید|ارزیابی در انتظار بررسی/,'dashboard still contains duplicate assessment or release notifications');
assert.match(reviewSource,/href="\/assessments\/\$\{item\.id\}"[^>]*>مشاهده ارزیابی/,'submission button is not a reliable assessment link');
assert.match(reviewSource,/window\.renderAssessmentReview/,'assessment review component is missing');
assert.ok(reviewSource.includes('const match=route.match(')&&reviewSource.includes('assessments')&&reviewSource.includes('id=match?Number(match[1]):null'),'assessment review route is not wired');
for(const action of ['btnApprove','btnReject','btnRequestChanges'])assert.match(reviewSource,new RegExp(`id="${action}"`),`review action is missing: ${action}`);
assert.match(reviewSource,/پیام به شاگرد/,'student message action is missing');
assert.match(reviewSource,/case_number/,'case number is missing from coach review');
assert.match(reviewSource,/item\.case_number/,'case number is missing from pending submissions');
const studentsSource=fs.readFileSync(path.join(publicDir,'students.js'),'utf8');
const addStudentStart=studentsSource.indexOf('addStudentForm'),addStudentBlock=studentsSource.slice(addStudentStart,studentsSource.indexOf("modal.querySelectorAll('[data-close-modal]')",addStudentStart));
assert.match(addStudentBlock,/name=\\?"full_name\\?"/,'student creation name field is missing');
assert.match(addStudentBlock,/name=\\?"mobile\\?"/,'student creation mobile field is missing');
assert.doesNotMatch(addStudentBlock,/name=\\?"(?:goal|status|weight|height)\\?"/,'student creation form contains extra fields');
assert.match(addStudentBlock,/prefixed-input[^\n]+<span>09-<\/span>/,'student mobile prefix is missing');
assert.match(addStudentBlock,/placeholder=\\?"0000000000\\?"/,'student mobile placeholder is missing');
assert.match(css['unified-components.css'],/\.student-mobile\{font-weight:850/,'student mobile numbers are not bold');
assert.match(wizardSource,/prefixed-input[^\n]+<span>09-<\/span>/,'assessment mobile prefix is missing');
assert.equal((wizardSource.match(/<span>@<\/span>/g)||[]).length,2,'Telegram and Instagram prefixes are missing');
assert.match(wizardSource,/socialHandle\('personalTelegram'\).*socialHandle\('personalInstagram'\)/,'social prefixes are not normalized before save');
assert.match(studentsSource,/data-open-student="\$\{student\.case_number\}"/,'student list does not use case number as its public route');
for(const heading of ['ردیف','نام و نام خانوادگی','شماره همراه'])assert.match(studentsSource,new RegExp(`<th[^>]*>${heading}<\\/th>`),`student table column is missing: ${heading}`);
assert.match(studentsSource,/student-identity-cell[^\n]+student\.full_name[^\n]+شماره پرونده[^\n]+student\.case_number/,'case number is not placed below the student name');
assert.doesNotMatch(css['students.css'],/student-identity-cell\{min-width:1[5-9]0px/,'student identity cell still forces a wide gap');
assert.match(css['students.css'],/td:nth-child\(2\)\{width:1%/,'student identity column is not content-sized');
assert.doesNotMatch(studentsSource,/<th>شماره پرونده<\/th>|شماره پرونده \/ نام و نام خانوادگی/,'case number still has a separate or wide table heading');
assert.match(studentsSource,/listState\.page-1\)\*listState\.pageSize\+index\+1/,'student row number does not respect pagination');
assert.match(studentsSource,/جستجو با نام، موبایل یا شماره پرونده/,'case-number search is missing');
assert.match(studentsSource,/data-copy-url/,'invitation dialog has no dedicated link-copy action');
assert.match(studentsSource,/`لینک ورود:\\n\$\{absolute\}\\n\\nرمز موقت:\\n/,'shared login template is not simple and ordered');
assert.doesNotMatch(studentsSource,/لینک ورود Yasnafit:|شماره پرونده: \$\{result\.case_number\}/,'shared login text still contains removed labels');
assert.match(fs.readFileSync(path.join(publicDir,'program-builder.js'),'utf8'),/student_case_number|s\.case_number/,'program pages do not display case numbers');
assert.match(studentAppSource,/result\.case_number/,'join page does not display the permanent case number');
assert.match(reviewSource,/coach-review-group/,'organized assessment summary is missing');
assert.match(reviewSource,/action==='approve'[^\n]+programs\/exercise\/form\?student_id=\$\{student\.id\}&assessment_id=\$\{id\}/,'approval does not continue to Program Builder');
const builderSource=fs.readFileSync(path.join(publicDir,'program-builder.js'),'utf8');
assert.match(builderSource,/loadAssessmentContext/,'Program Builder does not load its approved assessment context');
assert.match(builderSource,/assessment-program-context/,'Program Builder assessment summary is missing');
assert.match(builderSource,/makeAssessmentDays\(sports\.sessions_per_week\)/,'training-day count is not initialized from the assessment');
for(const field of ['progLevel','progLocation','progTarget','progInjury'])assert.match(builderSource,new RegExp(`getElementById\\('${field}'\\)\\.value`),`assessment does not prefill ${field}`);
assert.match(builderSource,/sel\.disabled=true/,'assessment-selected student is not locked in Program Builder');
assert.match(builderSource,/selectedSystemForAdd = \{dayIdx, sysIdx\};\s*openExerciseDrawer\(\)/,'add-movement button is not connected to the exercise drawer');
assert.match(builderSource,/api\('\/api\/categories\/grouped'\)/,'drawer does not load real exercise categories');
assert.match(builderSource,/currentDrawerCat=exerciseCategories\[0\]\.id/,'drawer does not open with a real category');
assert.match(builderSource,/api\(`\/api\/exercises\?\$\{q\}`\)/,'drawer does not read exercises from the bank API');
assert.match(builderSource,/exercise_id: exId[\s\S]{0,120}original_exercise_id:origId/,'selected bank exercise IDs are not preserved correctly');
assert.match(css['program-builder.css'],/inset: 0 auto 0 0/,'exercise drawer is not anchored to the left');
assert.doesNotMatch(coreSource,/esc\(x\.profile_status\|\|x\.status\)/,'dashboard exposes an English profile status');
assert.doesNotMatch(reviewSource,/esc\(item\.status\)/,'submissions list exposes an English status');
assert.match(studentAppSource,/const fa=value=>/,'student portal is not using centralized Persian labels');
assert.match(wizardSource,/inputmode="decimal"/,'body inputs are not mobile-decimal compatible');
assert.match(wizardSource,/\[۰-۹\]/,'Persian numeric input normalization is missing');
assert.match(wizardSource,/\[٫,\\\/\]/,'slash/Persian decimal normalization is missing');
assert.match(wizardSource,/wizard-top-error/,'measurement errors are not visible at the top of the wizard');
assert.match(wizardSource,/const button=event\.currentTarget/,'next-step button reference is not preserved across await');
assert.doesNotMatch(wizardSource,/finally\{[^}]*event\.currentTarget/,'async handler can leave the next-step button disabled');
assert.doesNotMatch(wizardSource,/around_the_belly_from_the_navel|دور ناف/,'removed navel measurement is still visible');
assert.match(studentAppSource,/\/student\/login/,'student login page is missing');
assert.match(studentAppSource,/studentLoginForm[^\n]+prefixed-input[^\n]+<span>09-<\/span>/,'student login mobile prefix is missing');
assert.match(studentAppSource,/mobile:completeMobile\(form\.get\('mobile'\)\)/,'student login does not rebuild the full mobile number');
assert.match(studentAppSource,/\/api\/student\/auth\/login/,'student password login API is not wired');
assert.match(studentAppSource,/\/student\/change-password/,'optional password-change route is missing');
assert.match(studentAppSource,/password-recommendation/,'non-blocking password recommendation is missing');
assert.doesNotMatch(studentAppSource,/password_change_required.*location\.replace/,'student is still forced onto the password-change page');
assert.match(studentAppSource,/\/api\/student\/auth\/change-password/,'student password-change API is not wired');
assert.match(studentAppSource,/current_password/,'personal password change is unavailable from the student panel');
assert.doesNotMatch(studentAppSource,/join\/\$\{encodeURIComponent\(token\)\}\/accept/,'invitation still creates a passwordless session');
assert.match(studentsSource,/temporary_password/,'coach credential handoff does not show the temporary password');
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
