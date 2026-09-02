#!/usr/bin/env node
'use strict';
// Regression guard for "change a student's username and password from the edit dialog".
// 1) The three-dot menu may only contain actions that are actually wired up.
// 2) The student edit dialog owns the credential card and talks to the credentials API.
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
assert.doesNotMatch(renderBlock,/btn-credentials-student/,'the dead "رمز ورود" entry point is still rendered in the three-dot menu');
assert.doesNotMatch(renderBlock,/data-credentials-student/,'the three-dot menu still exposes an unwired credentials attribute');

// 2) The edit dialog is the single place that manages credentials.
const editStart=source.indexOf('function openEditStudentModal(');
const editEnd=source.indexOf('function openAddStudent(');
assert.ok(editStart>0&&editEnd>editStart,'the student edit dialog is missing');
const editBlock=source.slice(editStart,editEnd);
assert.match(editBlock,/مدیریت رمز ورود/,'the edit dialog lost the credential management card');
assert.match(editBlock,/اطلاعات پرونده/,'the edit dialog lost the profile section');
for(const field of ['editStudentFullName','editStudentGoal','editStudentCredentials','credUsername','credPassword','credConfirm']){
  assert.ok(editBlock.includes(`#${field}`),`the edit dialog is missing #${field}`);
}
assert.match(editBlock,/api\(`\/api\/students\/\$\{reference\}\/credentials`\)/,'the edit dialog never loads the credential state');
assert.match(editBlock,/method:'POST',body:JSON\.stringify\(payload\)/,'the edit dialog never posts credential changes');
assert.match(editBlock,/\/api\/students\/\$\{reference\}`,\{method:'PUT'/,'the edit dialog no longer saves the profile with PUT');
assert.match(editBlock,/حداقل ۸ کاراکتر/,'the edit dialog lacks the personal password length rule');
assert.match(editBlock,/تکرار رمز عبور با رمز جدید یکسان نیست/,'the edit dialog does not check the repeated password');
assert.match(editBlock,/data-toggle-reset/,'the temporary-password reset action is missing from the edit dialog');
assert.match(editBlock,/payload\.reset_temporary=true/,'the reset action does not ask the server to restore the temporary password');
assert.match(editBlock,/data-toggle-unlock/,'the account unlock action is missing from the edit dialog');
assert.match(editBlock,/payload\.unlock=true/,'the unlock action is not sent to the server');
assert.match(editBlock,/data-copy-login/,'the edit dialog cannot copy the login details');
assert.match(source,/نشست‌های فعال شاگرد را باطل می‌کند/,'the credential card does not warn about revoked sessions');
assert.match(editBlock,/نشست فعال شاگرد باطل شد/,'the edit dialog does not report the revoked sessions after saving');
assert.doesNotMatch(editBlock,/data-open-student/,'the edit dialog still navigates away instead of saving inline');

// 3) The credential card markup lives in one renderer used by the dialog.
assert.match(source,/function credentialEditorMarkup\(/,'the credential card renderer is missing');
assert.match(source,/function loginShareText\(/,'the copy-login template is missing');
const cardStart=source.indexOf('function credentialEditorMarkup(');
const cardBlock=source.slice(cardStart,source.indexOf('function openEditStudentModal('));
assert.match(cardBlock,/رمز موقت فعلی/,'the temporary password is not shown to the coach');
assert.match(cardBlock,/قابل مشاهده نیست/,'the card pretends a hashed personal password can be revealed');
assert.match(cardBlock,/password_once/,'the newly set personal password is not revealed once');
assert.match(cardBlock,/autocomplete="new-password"/,'password fields are not marked as new-password');
for(const selector of ['.edit-section','.edit-section-title','.credential-inline-actions','.credential-field-help','.credential-notice.ok','.credential-notice.error']){
  assert.ok(css.includes(selector),`students.css is missing ${selector}`);
}
assert.match(css,/\.student-modal\.edit-student-modal\s*\{/,'the edit dialog has no width rule');

// 4) Service contract behind the card.
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

  auth.manageCredentials(db,id,{password:'YasnaPass1',confirmPassword:'YasnaPass1'});
  const personal=db.prepare('SELECT * FROM students WHERE id=?').get(id);
  const keepHash=auth.mobileAuthUpdate(personal,'09121119988');
  assert.equal(keepHash.changed,true);
  assert.equal(keepHash.password_hash,null,'a personal password must never be replaced by the temporary one');
  assert.equal(keepHash.password_state,null);
  assert.equal(keepHash.sessions_revoked,true);
  assert.equal(auth.verifyPassword('9988',personal.password_hash),false);

  assert.throws(()=>auth.manageCredentials(db,id,{}),/تغییری برای ذخیره وجود ندارد/);
  assert.throws(()=>auth.manageCredentials(db,id,{username:'09121114455',password:'shorty',confirmPassword:'shorty'}),/حداقل ۸/);
  const otherColumns=auth.authColumnsForMobile('09121117788');
  const other=Number(insert.run('cred-ui-2','شاگرد دوم','09121117788',otherColumns.mobile_normalized,otherColumns.password_hash).lastInsertRowid);
  assert.throws(()=>auth.manageCredentials(db,other,{username:'09121114455'}),/برای شاگرد دیگری ثبت شده است/);
  const restored=auth.manageCredentials(db,id,{resetTemporary:true});
  assert.equal(restored.password_state,'TEMPORARY');
  assert.equal(restored.temporary_password,'4455');
  assert.equal(auth.authenticate(db,'09121114455','YasnaPass1').error,'INVALID_CREDENTIALS');
  assert.equal(auth.authenticate(db,'09121114455','4455').student.password_state,'TEMPORARY');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.close();
}finally{fs.rmSync(dir,{recursive:true,force:true});}

console.log(JSON.stringify({ok:true,menu_actions_wired:menuActions.length,edit_dialog_credentials_card:true,temporary_password_follows_mobile:true,personal_password_preserved:true,reset_and_unlock_exposed:true}));
