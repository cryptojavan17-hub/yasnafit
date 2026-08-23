#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const auth=require('../src/student-auth-service');
const sessions=require('../src/student-session-service');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-auth-'));
try{
  const db=new DatabaseSync(path.join(dir,'auth.db'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  assert.equal(auth.normalizeMobile('+98 912 345 6789'),'09123456789');
  assert.equal(auth.normalizeMobile('۰۹۱۲۳۴۵۶۷۸۹'),'09123456789');
  assert.equal(auth.normalizeMobile('099123456789'),'09123456789');
  const columns=auth.authColumnsForMobile('09123456789');
  assert.equal(columns.mobile_normalized,'09123456789');assert.equal(columns.password_state,'TEMPORARY');assert.ok(columns.password_hash.startsWith('scrypt$'));assert.equal(columns.password_hash.includes('6789'),false);
  const id=Number(db.prepare("INSERT INTO students(stable_id,full_name,mobile,mobile_normalized,password_hash,password_state,status,version) VALUES('auth-student','Auth Student',?,?,?,'TEMPORARY','فعال',1)").run('09123456789',columns.mobile_normalized,columns.password_hash).lastInsertRowid);
  assert.equal(auth.authenticate(db,'09123456789','0000').error,'INVALID_CREDENTIALS');
  db.prepare('UPDATE students SET password_hash=? WHERE id=?').run(auth.hashPassword('stale-value'),id);
  const temporary=auth.authenticate(db,'+98 912 345 6789','۶۷۸۹');assert.equal(temporary.student.id,id);assert.equal(temporary.student.password_state,'TEMPORARY');assert.equal(auth.verifyPassword('6789',db.prepare('SELECT password_hash FROM students WHERE id=?').get(id).password_hash),true);assert.equal(auth.authenticate(db,'09123456789','6789').student.id,id);
  const session=sessions.createStudentSession(db,id);assert.ok(session.raw_session);assert.notEqual(db.prepare('SELECT session_hash FROM student_sessions WHERE student_id=?').get(id).session_hash,session.raw_session);
  assert.throws(()=>auth.setPersonalPassword(db,id,'short1'),/حداقل ۸/);assert.equal(auth.validatePersonalPassword('12345678'),'12345678');assert.equal(auth.validatePersonalPassword('!!!!!!!!'),'!!!!!!!!');
  auth.setPersonalPassword(db,id,'12345678');
  assert.equal(auth.authenticate(db,'09123456789','6789').error,'INVALID_CREDENTIALS');
  const personal=auth.authenticate(db,'09123456789','12345678');assert.equal(personal.student.password_state,'PERSONAL');
  assert.equal('password_hash' in auth.safeStudent(personal.student),false);assert.equal('mobile_normalized' in auth.safeStudent(personal.student),false);
  assert.throws(()=>db.prepare("INSERT INTO students(stable_id,full_name,mobile,mobile_normalized,status,version) VALUES('duplicate','Duplicate','0912 345 6789','09123456789','فعال',1)").run(),/UNIQUE/);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  db.close();console.log(JSON.stringify({ok:true,normalized_mobile:true,scrypt:true,temporary_reusable_until_change:true,localized_temporary_password:true,legacy_hash_repair:true,optional_personal_password:true,unique_mobile:true,hashed_session:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
