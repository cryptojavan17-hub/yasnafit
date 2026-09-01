#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const auth=require('../src/coach-auth-service');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-coach-auth-'));
const dataDir=path.join(dir,'data');
fs.mkdirSync(dataDir,{recursive:true});
(async()=>{
try{
  const db=new DatabaseSync(path.join(dir,'coach-auth.db'));
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  for(const column of ['email','email_normalized','password_hash','auth_failed_attempts','auth_locked_until','last_login_at']){
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('coaches') WHERE name=?").get(column),`missing coaches column ${column}`);
  }
  for(const table of ['coach_sessions','coach_otp_challenges']){
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),`missing ${table}`);
  }

  const first=auth.ensureLocalCoach(db,dataDir);
  assert.equal(first.email,'coach@yasnafit.local');
  assert.equal(first.bootstrapped,true);
  const stored=fs.readFileSync(path.join(dataDir,'coach-credentials.txt'),'utf8');
  assert.match(stored,/email=coach@yasnafit.local/);
  assert.match(stored,/password=YasnafitCoach1/);
  const hash=db.prepare('SELECT password_hash FROM coaches WHERE id=1').get().password_hash;
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(hash.includes('YasnafitCoach1'),false);
  const second=auth.ensureLocalCoach(db,dataDir);
  assert.equal(second.bootstrapped,false);
  assert.equal(db.prepare('SELECT password_hash FROM coaches WHERE id=1').get().password_hash,hash);

  assert.throws(()=>auth.validateCoachPassword('short1'),/حداقل ۸/);
  assert.throws(()=>auth.validateCoachPassword('abcdefgh'),/حرف و عدد/);
  assert.throws(()=>auth.normalizeEmail('not-an-email'),/ایمیل معتبر نیست/);
  assert.equal(auth.normalizeEmail('Coach@Yasnafit.Local'),'coach@yasnafit.local');

  const delivered=[];
  auth.setMailer(async payload=>delivered.push(payload));
  const bad=await auth.startLogin(db,{email:'nobody@example.com',password:'YasnafitCoach1',dataDir});
  assert.equal(bad.error,'INVALID_CREDENTIALS');
  const wrong=await auth.startLogin(db,{email:'coach@yasnafit.local',password:'WrongPass1',dataDir});
  assert.equal(wrong.error,'INVALID_CREDENTIALS');
  const started=await auth.startLogin(db,{email:'coach@yasnafit.local',password:'YasnafitCoach1',dataDir});
  assert.ok(started.challenge_id);
  assert.equal(started.email,'coach@yasnafit.local');
  assert.equal(delivered.length,1);
  assert.match(delivered[0].code,/^\d{6}$/);
  assert.equal(delivered[0].to,'coach@yasnafit.local');
  const challengeRow=db.prepare('SELECT code_hash,consumed_at FROM coach_otp_challenges WHERE stable_id=?').get(started.challenge_id);
  assert.equal(challengeRow.code_hash.includes(delivered[0].code),false);
  assert.equal(challengeRow.consumed_at,null);

  assert.equal(auth.verifyOtp(db,{challengeId:started.challenge_id,code:'000000'}).error,'INVALID_CODE');
  const verified=auth.verifyOtp(db,{challengeId:started.challenge_id,code:delivered[0].code});
  assert.ok(verified.raw_session);
  assert.match(verified.raw_session,/^[A-Za-z0-9_-]{43}$/);
  assert.equal('password_hash' in verified.coach,false);
  const sessionRow=db.prepare('SELECT session_hash FROM coach_sessions WHERE coach_id=1 ORDER BY id DESC LIMIT 1').get();
  assert.notEqual(sessionRow.session_hash,verified.raw_session);
  const replay=auth.verifyOtp(db,{challengeId:started.challenge_id,code:delivered[0].code});
  assert.equal(replay.error,'INVALID_CODE');

  const req={headers:{cookie:`yasnafit_coach_session=${verified.raw_session}`},socket:{}};
  const resolved=auth.resolveSession(db,req);
  assert.equal(resolved.coach.email,'coach@yasnafit.local');
  assert.equal(auth.revokeCurrentSession(db,req),true);
  assert.equal(auth.resolveSession(db,req),null);

  auth.setMailer(null);
  const fileLogin=await auth.startLogin(db,{email:'coach@yasnafit.local',password:'YasnafitCoach1',dataDir});
  const otpFile=fs.readFileSync(path.join(dataDir,'coach-otp-dev.txt'),'utf8').trim();
  assert.match(otpFile,/^\d{6}$/);
  const fileVerified=auth.verifyOtp(db,{challengeId:fileLogin.challenge_id,code:otpFile});
  assert.ok(fileVerified.raw_session);

  const extra=auth.createCoach(db,{email:'second@yasnafit.local',password:'SecondCoach9',displayName:'مربی دوم'});
  for(let i=0;i<4;i++){
    const fail=await auth.startLogin(db,{email:'second@yasnafit.local',password:'WrongPass1',dataDir});
    assert.equal(fail.error,'INVALID_CREDENTIALS');
  }
  const locked=await auth.startLogin(db,{email:'second@yasnafit.local',password:'WrongPass1',dataDir});
  assert.equal(locked.error,'AUTH_LOCKED');
  const stillLocked=await auth.startLogin(db,{email:'second@yasnafit.local',password:'SecondCoach9',dataDir});
  assert.equal(stillLocked.error,'AUTH_LOCKED');
  db.prepare('UPDATE coaches SET auth_locked_until=NULL,auth_failed_attempts=0 WHERE id=?').run(extra.id);
  const recovered=await auth.startLogin(db,{email:'second@yasnafit.local',password:'SecondCoach9',dataDir});
  assert.ok(recovered.challenge_id);
  db.prepare("UPDATE coach_otp_challenges SET expires_at=? WHERE stable_id=?").run(new Date(Date.now()-1000).toISOString(),recovered.challenge_id);
  const expiredCode=fs.readFileSync(path.join(dataDir,'coach-otp-dev.txt'),'utf8').trim();
  assert.equal(auth.verifyOtp(db,{challengeId:recovered.challenge_id,code:expiredCode}).error,'CODE_EXPIRED');

  const cookie=auth.sessionCookie({headers:{},socket:{}},'A'.repeat(43));
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
  assert.match(cookie,/Max-Age=86400/);
  assert.doesNotMatch(cookie,/; Secure/);
  const secureCookie=auth.sessionCookie({headers:{'x-forwarded-proto':'https'},socket:{}},'A'.repeat(43));
  assert.match(secureCookie,/; Secure/);

  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  db.close();
  console.log(JSON.stringify({ok:true,hashed_password:true,email_2fa:true,hashed_session:true,lockout:true,otp_file_fallback:true,no_plaintext:true}));
}finally{
  auth.setMailer(null);
  fs.rmSync(dir,{recursive:true,force:true});
}
})().catch(error=>{console.error(error);process.exitCode=1;});
