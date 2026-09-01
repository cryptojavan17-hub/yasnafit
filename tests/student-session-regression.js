#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const students=require('../src/student-service');
const sessions=require('../src/student-session-service');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-session-'));
try{
  const db=new DatabaseSync(path.join(dir,'sessions.db'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  const add=db.prepare("INSERT INTO students(stable_id,full_name,status,version,created_at,updated_at) VALUES(?,?,'فعال',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
  const a=Number(add.run('session-a','Student A').lastInsertRowid),b=Number(add.run('session-b','Student B').lastInsertRowid),c=Number(add.run('session-c','Student C').lastInsertRowid);
  const inviteA=students.createInvite(db,a,30),inviteB=students.createInvite(db,b,30);
  const consumeAndCreate=token=>{const consumed=sessions.consumeInvitation(db,token);return consumed.error?consumed:sessions.createStudentSession(db,consumed.student_id,consumed.invitation_id);};
  assert.equal(sessions.inspectInvitation(db,inviteA.token).invitation.student_id,a);
  const acceptedA=consumeAndCreate(inviteA.token);assert.ok(acceptedA.raw_session);assert.equal(acceptedA.student_id,a);
  const acceptedA2=consumeAndCreate(inviteA.token);assert.ok(acceptedA2.raw_session);assert.equal(sessions.inspectInvitation(db,inviteA.token).invitation.remaining_uses,1);const acceptedA3=consumeAndCreate(inviteA.token);assert.ok(acceptedA3.raw_session);assert.equal(sessions.inspectInvitation(db,inviteA.token).error,'used');assert.equal(consumeAndCreate(inviteA.token).error,'used');
  assert.equal(db.prepare('SELECT session_hash FROM student_sessions WHERE student_id=?').get(a).session_hash,students.hashToken(acceptedA.raw_session));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM student_sessions WHERE session_hash=?").get(acceptedA.raw_session).c,0,'raw session stored in SQLite');
  const reqA={headers:{cookie:`${sessions.SESSION_COOKIE}=${acceptedA.raw_session}`},socket:{encrypted:false}};
  assert.match(sessions.sessionCookie({headers:{'x-forwarded-proto':'https'},socket:{encrypted:false}},acceptedA.raw_session),/HttpOnly; SameSite=Strict; Path=\/; Max-Age=\d+; Secure/);
  assert.equal(sessions.resolveStudentSession(db,reqA).student_id,a);
  assert.equal(sessions.resolveStudentSession(db,{headers:{cookie:`${sessions.SESSION_COOKIE}=%E0%A4%A`},socket:{encrypted:false}}),null);
  const acceptedB=consumeAndCreate(inviteB.token);const reqB={headers:{cookie:`${sessions.SESSION_COOKIE}=${acceptedB.raw_session}`},socket:{encrypted:false}};
  assert.equal(sessions.resolveStudentSession(db,reqB).student_id,b);
  assert.notEqual(sessions.resolveStudentSession(db,reqA).student_id,sessions.resolveStudentSession(db,reqB).student_id);

  const declined=students.createAssessment(db,a,{weight:70,height:170,goal:'fitness',training_experience:'beginner',body_photos_preference:'declined'});
  assert.equal(students.submitAssessment(db,declined.id).status,'SUBMITTED','declined/no-photo assessment was rejected');
  const willing=students.createAssessment(db,b,{weight:71,height:171,goal:'fitness',training_experience:'beginner',body_photos_preference:'willing'});
  assert.equal(students.submitAssessment(db,willing.id).status,'SUBMITTED','willing/zero-photo assessment was rejected');
  const unspecified=students.createAssessment(db,c,{weight:72,height:172,goal:'fitness',training_experience:'beginner'});
  assert.equal(students.submitAssessment(db,unspecified.id).status,'SUBMITTED','optional no-photo assessment was rejected');

  const expiredInvite=students.createInvite(db,b,30);db.prepare("UPDATE student_invites SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(expiredInvite.id);
  assert.equal(sessions.inspectInvitation(db,expiredInvite.token).error,'expired');
  const revokedInvite=students.createInvite(db,b,30);students.revokeInvite(db,revokedInvite.id);assert.equal(sessions.inspectInvitation(db,revokedInvite.token).error,'revoked');
  for(const token of ['',"' OR 1=1 --",'../etc/passwd','A'.repeat(200)])assert.equal(sessions.inspectInvitation(db,token).error,'invalid');

  db.prepare("UPDATE student_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE student_id=?").run(a);
  assert.equal(sessions.resolveStudentSession(db,reqA),null,'expired session accepted');
  assert.equal(sessions.revokeCurrentSession(db,reqB),true);assert.equal(sessions.resolveStudentSession(db,reqB),null,'logout session reuse accepted');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.close();
  console.log(JSON.stringify({ok:true,three_entry_invite:true,hashed_session:true,expiration:true,revocation:true,logout_reuse_blocked:true,isolation:true,declined_zero_photos_valid:true,willing_zero_photos_valid:true,photo_preference_optional:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
