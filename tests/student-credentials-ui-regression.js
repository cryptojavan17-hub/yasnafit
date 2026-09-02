#!/usr/bin/env node
'use strict';
// Regression guard for the student "ویرایش و رمز" dialog.
// 1) The three-dot menu may only contain actions that are actually wired up.
// 2) The edit dialog owns username + password management in one compact form
//    (no duplicate card, no repeat-password field, optional password, generator).
// 3) The auth service keeps the login credential consistent with a changed mobile number.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const auth=require('../src/student-auth-service');

const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const source=fs.readFileSync(path.join(publicDir,'students.js'),'utf8');
const css=fs.readFileSync(path.join(publicDir,'students.css'),'utf8');

const renderStart=source.indexOf('function renderStudents(');
const renderEnd=source.indexOf('function renderPagination(');
assert.ok(renderStart>0&&renderEnd>renderStart,'student list renderer is missing');
const renderBlock=source.slice(renderStart,renderEnd);

// 1) Every row action button that the table renders must have a click handler in the same function.
const menuActions=[...renderBlock.matchAll(/class="action-menu-item[^"]*?\b(btn-[a-z-]+)\b/g)].map(match=>match[1]);
assert.ok(menuActions.length>=2,'the three-dot menu lost its actions');
assert.equal(new Set(menuActions).size,menuActions.length,'duplicate three-dot action found');
for(const action of menuActions){
  assert.ok(renderBlock.includes(`host.querySelectorAll('.${action}')`),`the three-dot action .${action} is rendered but never wired — the button does nothing`);
}
assert.doesNotMatch(renderBlock,/btn-credentials-student|data-credentials-student/,'a second (unwired) credentials entry point came back');
assert.match(renderBlock,/ویرایش و رمز/,'the menu entry is not labelled as edit + password');

// 2) The dialog itself: one form, five inputs, three small actions.
const editStart=source.indexOf('function openEditStudentModal(');
const editEnd=source.indexOf('function openAddStudent(');
assert.ok(editStart>0&&editEnd>editStart,'the student edit dialog is missing');
const editBlock=source.slice(editStart,editEnd);
assert.match(editBlock,/✏️ ویرایش و رمز/,'the dialog title does not match the menu entry');
assert.match(editBlock,/رمز ورود/,'the dialog lost its password section');
for(const field of ['editStudentFullName','credUsername','editStudentGoal','credPassword','editStudentCredentials','editStudentSave']){
  assert.ok(editBlock.includes(`#${field}`)||editBlock.includes(`"${field}"`),`the edit dialog is missing ${field}`);
}
assert.doesNotMatch(editBlock,/credConfirm/,`the simplified dialog must not ask for the password twice`);
assert.doesNotMatch(editBlock,/credential-chips|credential-meta|credential-field-help|credential-link-row/,'the dialog is cluttered again');
// the username input lives in the static form, not inside the re-rendered card, so typing survives
assert.ok(editBlock.indexOf('"credUsername"')<editBlock.indexOf('"editStudentCredentials"'),'the username field is re-created by every repaint');
// password is optional, revealable and generatable
assert.match(source,/خالی یعنی بدون تغییر/,'the dialog does not say the password is optional');
assert.match(source,/data-toggle-pass/,'the password reveal toggle is missing');
assert.match(source,/data-random-pass/,'the random password button is missing');
assert.match(editBlock,/randomStudentPassword\(\)/,'the random button does not generate a password');
assert.match(source,/const PASSWORD_ALPHABET='([^']+)'/);
const alphabet=source.match(/const PASSWORD_ALPHABET='([^']+)'/)[1];
assert.ok(alphabet.length>=32,'the password alphabet is too small');
for(const ambiguous of ['0','O','I','l','1'])assert.equal(alphabet.includes(ambiguous),false,`ambiguous character ${ambiguous} is in the password alphabet`);
assert.match(editBlock,/رمز تصادفی ساخته شد و کپی هم شد/,'the generated password is not offered for sending');
assert.match(source,/type="\$\{visible\?'text':'password'\}"/,'the reveal toggle does not change the input type');
// save contract: credentials first (without a repeat field), then the profile
assert.match(editBlock,/api\(`\/api\/students\/\$\{reference\}\/credentials`\)/,'the dialog never loads the credential state');
assert.match(editBlock,/method:'POST',body:JSON\.stringify\(payload\)/,'the dialog never posts credential changes');
assert.match(editBlock,/payload\.reset_temporary=true/,'the reset action does not restore the temporary password');
assert.match(editBlock,/payload\.unlock=true/,'the unlock action is not sent to the server');
assert.doesNotMatch(editBlock,/confirm_password/,'the dialog still sends a repeat-password field');
assert.match(editBlock,/\/api\/students\/\$\{reference\}`,\{method:'PUT'/,'the dialog no longer saves the profile with PUT');
assert.match(editBlock,/اطلاعات پرونده ذخیره شد/,'the dialog does not confirm the profile save');
assert.match(editBlock,/چیزی برای ذخیره تغییر نکرد/,'the dialog can claim a save that never happened');
assert.doesNotMatch(editBlock,/full_name:fullName,goal,mobile|mobile:username/,'the dialog must not write the mobile through the profile PUT');
assert.match(editBlock,/حداقل ۸ کاراکتر/,'the personal password length rule is missing');
assert.match(source,/data-copy-login/,'the dialog cannot copy the login details');
assert.match(editBlock,/نشست فعال شاگرد باطل شد/,'the dialog does not report the revoked sessions');
assert.match(editBlock,/شمارهٔ ورود بدون اتصال به سرور ذخیره نمی‌شود/,'a username edit can be silently lost when the API is down');
assert.doesNotMatch(editBlock,/data-open-student|location\.href/,'the dialog navigates instead of saving inline');

// 2b) Every state variable the dialog reads must also be declared in it — a missing
// declaration inside an async handler silently kills the save button (ReferenceError).
const dialogDeclarations=new Set();
for(const line of editBlock.split('\n')){
  const head=line.match(/^\s*(?:let|const)\s+(.*)$/);
  if(!head)continue;
  for(const part of head[1].split(',')){
    const name=part.trim().match(/^([A-Za-z_$][\w$]*)\s*=/);
    if(name)dialogDeclarations.add(name[1]);
  }
}
for(const name of ['current','typedPassword','pendingReset','pendingUnlock','revealPassword','notice','noticeKind','credentialsLoaded','busy','usernameChanged','username','password','fullName','goal','messages','payload','result','profileChanged','reference']){
  assert.ok(dialogDeclarations.has(name),`the dialog reads ${name} but never declares it — saving would throw a ReferenceError`);
}

// 3) The credential card markup lives in one renderer used by the dialog (defined above section 2).
assert.match(source,/function credentialEditorMarkup\(/,'the credential card renderer is missing');
assert.match(source,/function loginShareText\(/,'the copy-login template is missing');
const cardBlock=source.slice(source.indexOf('function credentialEditorMarkup('),source.indexOf('function openEditStudentModal('));
assert.match(cardBlock,/۴ رقم آخر/,'the temporary password is not surfaced to the coach');
assert.match(cardBlock,/رمز شخصی|رمز موقت/,'the password state is missing from the status line');
assert.match(cardBlock,/ورود قفل است/,'the locked state is not shown');
assert.match(cardBlock,/password_once/,'the newly set password is not revealed once');
assert.match(cardBlock,/autocomplete="new-password"/,'the password field is not marked as new-password');
for(const selector of ['.edit-form-grid','.edit-divider','.edit-section-body','.credential-status','.credential-pass-row','.credential-icon-btn','.credential-actions','.credential-action-btn','.credential-notice.ok','.credential-notice.error','.credential-notice.warn']){
  assert.ok(css.includes(selector),`students.css is missing ${selector}`);
}
assert.match(css,/\.student-modal\.edit-student-modal\s*\{/,'the edit dialog has no width rule');
assert.doesNotMatch(cardBlock,/<h3|credential-hint/,'the credential block grew headings again');

// 4) Build stamp: the coach must be able to tell whether the pulled update is live.
const serverSource=fs.readFileSync(path.join(root,'server.js'),'utf8');
const launcher=fs.readFileSync(path.join(root,'YASNAFIT-LAUNCHER.bat'),'utf8');
assert.match(source,/api\('\/api\/build'\)/,'the students page never asks the server which build is running');
assert.match(source,/studentsBuildStamp/,'the build chip is missing from the students header');
assert.match(css,/\.students-build-chip\.stale/,'there is no visual warning for stale code');
assert.match(serverSource,/\/api\/build/,'GET /api/build is not routed');
assert.match(serverSource,/Build stamp: \$\{build\.branch/,'the server does not print the build stamp at startup');
assert.match(launcher,/credentialEditorMarkup/,'the launcher does not verify that the pulled code is present');
const buildInfo=require('../src/build-info');
const build=buildInfo.getBuildInfo();
assert.equal(build.version,require('../package.json').version);
assert.equal(build.markers.student_credentials_in_edit_dialog,true,'the build probe cannot see the delivered dialog');
assert.equal(build.markers.student_credentials_api,true,'the credentials endpoint is missing from this working copy');
assert.equal(build.markers.mobile_password_sync,true,'the mobile/password sync helper is missing from this working copy');
assert.ok(build.students_ui&&build.students_ui.mtime,'public/students.js is not readable for the stamp');

// 5) Service contract behind the card.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-credentials-ui-'));
try{
  const db=new DatabaseSync(path.join(dir,'credentials.db'));
  db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  const insert=db.prepare("INSERT INTO students(stable_id,full_name,mobile,mobile_normalized,password_hash,password_state,status,version) VALUES(?,?,?,?,?,'TEMPORARY','فعال',1)");
  const columns=auth.authColumnsForMobile('09121112233');
  const id=Number(insert.run('cred-ui','شاگرد آزمایشی','09121112233',columns.mobile_normalized,columns.password_hash).lastInsertRowid);
  const row=db.prepare('SELECT * FROM students WHERE id=?').get(id);
  const view=auth.credentialsView(row);
  assert.equal(view.username,'09121112233');
  assert.equal(view.password_state,'TEMPORARY');
  assert.equal(view.temporary_password,'2233');
  assert.equal('password_hash' in view,false);

  const renamed=auth.mobileAuthUpdate(row,'0912 111 4455');
  assert.equal(renamed.changed,true);
  assert.equal(renamed.mobile_normalized,'09121114455');
  assert.equal(renamed.password_state,'TEMPORARY');
  assert.equal(renamed.temporary_password,'4455');
  assert.equal(renamed.sessions_revoked,true);
  assert.ok(renamed.password_hash.startsWith('scrypt$'));
  db.prepare('UPDATE students SET mobile=?, mobile_normalized=?, password_hash=?, password_state=? WHERE id=?').run(renamed.mobile,renamed.mobile_normalized,renamed.password_hash,renamed.password_state,id);
  const after=db.prepare('SELECT * FROM students WHERE id=?').get(id);
  assert.equal(auth.authenticate(db,'09121114455','4455').student.id,id,'the temporary password must follow the new mobile number');
  assert.equal(auth.authenticate(db,'09121112233','2233').error,'INVALID_CREDENTIALS');
  assert.equal(auth.credentialsView(after).username,'09121114455');

  const same=auth.mobileAuthUpdate(after,'+98 912 111 4455');
  assert.equal(same.changed,false);
  assert.equal(same.password_hash,null);
  assert.equal(same.sessions_revoked,false);

  // the dialog sends password only (no repeat field)
  const personal=auth.manageCredentials(db,id,{password:'YasnaPass1'});
  assert.equal(personal.password_state,'PERSONAL');
  assert.equal(personal.password_once,'YasnaPass1');
  assert.equal(personal.temporary_password,null,'a personal password must not be reported next to a temporary one');
  const personalRow=db.prepare('SELECT * FROM students WHERE id=?').get(id);
  const keepHash=auth.mobileAuthUpdate(personalRow,'09121119988');
  assert.equal(keepHash.changed,true);
  assert.equal(keepHash.password_hash,null,'a personal password must never be replaced by the temporary one');
  assert.equal(keepHash.password_state,null);
  assert.equal(keepHash.sessions_revoked,true);
  assert.equal(auth.verifyPassword('9988',personalRow.password_hash),false);

  assert.throws(()=>auth.manageCredentials(db,id,{}),/تغییری برای ذخیره وجود ندارد/);
  assert.throws(()=>auth.manageCredentials(db,id,{username:'09121114455',password:'shorty'}),/حداقل ۸/);
  const otherColumns=auth.authColumnsForMobile('09121117788');
  const other=Number(insert.run('cred-ui-2','شاگرد دوم','09121117788',otherColumns.mobile_normalized,otherColumns.password_hash).lastInsertRowid);
  assert.throws(()=>auth.manageCredentials(db,other,{username:'09121114455'}),/برای شاگرد دیگری ثبت شده است/);
  const both=auth.manageCredentials(db,id,{username:'09121117799',password:'BothPass123',confirmPassword:'BothPass123'});
  assert.equal(both.password_state,'PERSONAL');
  assert.equal(both.password_once,'BothPass123');
  assert.equal(both.temporary_password,null,'a personal password must never be reported next to a temporary one');
  assert.equal(auth.authenticate(db,'09121117799','BothPass123').student.id,id);
  const restored=auth.manageCredentials(db,id,{resetTemporary:true});
  assert.equal(restored.password_state,'TEMPORARY');
  assert.equal(restored.temporary_password,'7799');
  assert.equal(auth.authenticate(db,'09121117799','BothPass123').error,'INVALID_CREDENTIALS');
  assert.equal(auth.authenticate(db,'09121117799','7799').student.password_state,'TEMPORARY');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.close();
}finally{fs.rmSync(dir,{recursive:true,force:true});}

console.log(JSON.stringify({ok:true,menu_actions_wired:menuActions.length,dialog:'ویرایش و رمز',single_password_field:true,random_password:true,temporary_password_follows_mobile:true,personal_password_preserved:true,reset_and_unlock_exposed:true}));
