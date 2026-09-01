#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const auth=require('../src/coach-auth-service');
const totp=require('../src/totp');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-coach-auth-'));
const dataDir=path.join(dir,'data');
fs.mkdirSync(dataDir,{recursive:true});

function loginCode(db,secret,coachId=1){
  db.prepare('UPDATE coaches SET totp_last_counter=NULL WHERE id=?').run(coachId);
  return totp.generate(secret);
}

(async()=>{
try{
  const rfcSecret=totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.hotp(Buffer.from('12345678901234567890'),1,8),'94287082');
  assert.equal(totp.generate(rfcSecret,{now:59*1000,digits:8}),'94287082');
  assert.equal(totp.verify(rfcSecret,'94287082',{now:59*1000,digits:8,window:0}).ok,true);
  const liveSecret=totp.generateSecret();
  const liveCode=totp.generate(liveSecret);
  assert.match(liveCode,/^\d{6}$/);
  assert.equal(totp.verify(liveSecret,liveCode).ok,true);
  assert.equal(totp.verify(liveSecret,'000000').ok,false);
  const qr=totp.qrSvg(totp.otpauthUrl({secret:liveSecret,email:'crypto.javan17@gmail.com'}));
  assert.match(qr,/^<svg /);
  assert.match(qr,/<\/svg>$/);
  assert.ok((qr.match(/<rect /g)||[]).length>200);

  const db=new DatabaseSync(path.join(dir,'coach-auth.db'));
  db.exec('PRAGMA foreign_keys=ON');
  runMigrations(db);
  for(const column of ['email','email_normalized','password_hash','auth_failed_attempts','auth_locked_until','last_login_at','role','totp_secret','totp_confirmed_at','totp_last_counter']){
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('coaches') WHERE name=?").get(column),`missing coaches column ${column}`);
  }
  for(const table of ['coach_sessions','coach_otp_challenges','coach_password_resets','coach_auth_events']){
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),`missing ${table}`);
  }

  db.prepare("UPDATE coaches SET email='coach@yasnafit.local',email_normalized='coach@yasnafit.local',password_hash='scrypt$placeholder' WHERE id=1").run();
  const first=auth.ensureLocalCoach(db);
  assert.equal(first.setup_required,true);
  assert.equal(first.setup_email,'crypto.javan17@gmail.com');
  assert.equal(first.totp_required,false);
  assert.equal(db.prepare('SELECT email_normalized,password_hash FROM coaches WHERE id=1').get().password_hash,null);
  assert.equal(fs.existsSync(path.join(dataDir,'coach-credentials.txt')),false);
  const blocked=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(blocked.error,'SETUP_REQUIRED');

  assert.throws(()=>auth.setupCoach(db,{email:'other@example.com',password:'YasnafitCoach1'}),/crypto\.javan17@gmail.com/);
  assert.throws(()=>auth.validateCoachPassword('short1'),/حداقل ۸/);
  assert.throws(()=>auth.validateCoachPassword('abcdefgh'),/حرف و عدد/);
  const created=auth.setupCoach(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',displayName:'مربی'});
  assert.equal(created.email,'crypto.javan17@gmail.com');
  assert.equal(created.role,'coach');
  assert.equal('password_hash' in created,false);
  assert.equal(auth.authStatus(db).setup_required,false);
  assert.equal(auth.authStatus(db).totp_required,true);
  assert.throws(()=>auth.setupCoach(db,{email:'crypto.javan17@gmail.com',password:'AnotherPass9'}),/قبلاً ساخته شده/);
  const hash=db.prepare('SELECT password_hash FROM coaches WHERE id=1').get().password_hash;
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(hash.includes('YasnafitCoach1'),false);

  assert.throws(()=>auth.normalizeEmail('not-an-email'),/ایمیل معتبر نیست/);
  assert.equal(auth.normalizeEmail('Crypto.Javan17@Gmail.com'),'crypto.javan17@gmail.com');

  const beforeTotp=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(beforeTotp.error,'TOTP_SETUP_REQUIRED');
  const totpSetup=auth.beginTotpSetup(db);
  assert.match(totpSetup.secret,/^[A-Z2-7]{32}$/);
  assert.match(totpSetup.otpauth_url,/^otpauth:\/\/totp\/Yasnafit/);
  assert.match(totpSetup.qr_svg,/<svg /);
  assert.equal(totpSetup.secret.includes(' '),false);
  const again=auth.beginTotpSetup(db);
  assert.equal(again.secret,totpSetup.secret);
  assert.equal(auth.confirmTotp(db,{code:'000000'}).error,'INVALID_CODE');
  const confirmed=auth.confirmTotp(db,{code:totp.generate(totpSetup.secret)});
  assert.equal(confirmed.ok,true);
  assert.equal(auth.authStatus(db).totp_required,false);
  assert.equal(auth.authStatus(db).totp_confirmed,true);
  assert.throws(()=>auth.beginTotpSetup(db),/قبلاً فعال/);
  const provisioned=auth.provisionCoachTotp(db,{rotate:true});
  assert.match(provisioned.secret,/^[A-Z2-7]{32}$/);
  assert.notEqual(provisioned.secret,totpSetup.secret);
  assert.equal('qr_svg' in provisioned,false);
  assert.match(provisioned.otpauth_url,/^otpauth:\/\/totp\/Yasnafit/);
  assert.throws(()=>auth.provisionCoachTotp(db),/قبلاً فعال/);
  const secret=provisioned.secret;

  const delivered=[];
  auth.setMailer(async payload=>delivered.push(payload));
  const bad=await auth.startLogin(db,{email:'nobody@example.com',password:'YasnafitCoach1',dataDir});
  assert.equal(bad.error,'INVALID_CREDENTIALS');
  const wrong=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'WrongPass1',dataDir});
  assert.equal(wrong.error,'INVALID_CREDENTIALS');
  const started=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.ok(started.challenge_id);
  assert.equal(started.email,'crypto.javan17@gmail.com');
  assert.equal(started.code,undefined);
  assert.equal(started.delivery,undefined);
  assert.equal(started.secret,undefined);
  assert.equal(started.qr_svg,undefined);
  assert.equal(delivered.length,0);
  assert.equal(fs.existsSync(path.join(dataDir,'coach-otp-dev.txt')),false);
  const otpTtl=new Date(started.expires_at).getTime()-Date.now();
  assert.ok(otpTtl>4*60*1000 && otpTtl<=5*60*1000,`otp ttl ${otpTtl}`);
  const challengeRow=db.prepare('SELECT code_hash,consumed_at FROM coach_otp_challenges WHERE stable_id=?').get(started.challenge_id);
  assert.equal(challengeRow.code_hash.includes(secret),false);
  assert.equal(challengeRow.consumed_at,null);
  const challengeReq={headers:{cookie:`yasnafit_coach_challenge=${started.challenge_id}`},socket:{}};
  assert.equal(auth.pendingChallenge(db,challengeReq).pending,true);
  assert.equal(auth.pendingChallenge(db,{headers:{},socket:{}}).pending,false);
  assert.equal('challenge_id' in auth.pendingChallenge(db,challengeReq),false);

  assert.equal(auth.verifyOtp(db,{challengeId:started.challenge_id,code:'000000'}).error,'INVALID_CODE');
  const verified=auth.verifyOtp(db,{code:loginCode(db,secret),req:challengeReq});
  assert.ok(verified.raw_session);
  assert.match(verified.raw_session,/^[A-Za-z0-9_-]{43}$/);
  assert.equal('password_hash' in verified.coach,false);
  const sessionTtl=new Date(verified.expires_at).getTime()-Date.now();
  assert.ok(sessionTtl>11*60*60*1000 && sessionTtl<=12*60*60*1000,`session ttl ${sessionTtl}`);
  const sessionRow=db.prepare('SELECT session_hash FROM coach_sessions WHERE coach_id=1 ORDER BY id DESC LIMIT 1').get();
  assert.notEqual(sessionRow.session_hash,verified.raw_session);
  const replay=auth.verifyOtp(db,{challengeId:started.challenge_id,code:totp.generate(secret)});
  assert.equal(replay.error,'INVALID_CODE');

  const req={headers:{cookie:`yasnafit_coach_session=${verified.raw_session}`},socket:{}};
  const resolved=auth.resolveSession(db,req);
  assert.equal(resolved.coach.email,'crypto.javan17@gmail.com');
  assert.equal(auth.revokeCurrentSession(db,req),true);
  assert.equal(auth.resolveSession(db,req),null);

  auth.setMailer(null);
  assert.equal(auth.authStatus(db,dataDir).mail_configured,false);
  await assert.rejects(()=>auth.configureGmail(dataDir,'short'),/رمز برنامه/);
  const fileLogin=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(fileLogin.code,undefined);
  assert.equal(fs.existsSync(path.join(dataDir,'coach-otp-dev.txt')),false);
  const fileVerified=auth.verifyOtp(db,{challengeId:fileLogin.challenge_id,code:loginCode(db,secret)});
  assert.ok(fileVerified.raw_session);

  const otpLockLogin=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(auth.verifyOtp(db,{challengeId:otpLockLogin.challenge_id,code:'111111'}).error,'INVALID_CODE');
  assert.equal(auth.verifyOtp(db,{challengeId:otpLockLogin.challenge_id,code:'222222'}).error,'INVALID_CODE');
  assert.equal(auth.verifyOtp(db,{challengeId:otpLockLogin.challenge_id,code:'333333'}).error,'AUTH_LOCKED');
  const afterOtpLock=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(afterOtpLock.error,'AUTH_LOCKED');
  db.prepare('UPDATE coaches SET auth_locked_until=NULL,auth_failed_attempts=0 WHERE id=1').run();

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
  assert.equal(recovered.error,'TOTP_SETUP_REQUIRED');

  const expireLogin=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  db.prepare('UPDATE coach_otp_challenges SET expires_at=? WHERE stable_id=?').run(new Date(Date.now()-1000).toISOString(),expireLogin.challenge_id);
  assert.equal(auth.verifyOtp(db,{challengeId:expireLogin.challenge_id,code:loginCode(db,secret)}).error,'CODE_EXPIRED');

  const sessionA=auth.verifyOtp(db,{challengeId:(await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir})).challenge_id,code:loginCode(db,secret)});
  const sessionB=auth.verifyOtp(db,{challengeId:(await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir})).challenge_id,code:loginCode(db,secret)});
  const reqA={headers:{cookie:`yasnafit_coach_session=${sessionA.raw_session}`},socket:{}};
  const reqB={headers:{cookie:`yasnafit_coach_session=${sessionB.raw_session}`},socket:{}};
  assert.ok(auth.resolveSession(db,reqA));
  assert.ok(auth.resolveSession(db,reqB));
  const logoutAll=auth.logoutAll(db,reqA);
  assert.ok(logoutAll.revoked>=2);
  assert.equal(auth.resolveSession(db,reqA),null);
  assert.equal(auth.resolveSession(db,reqB),null);

  const liveLogin=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  const liveSession=auth.verifyOtp(db,{challengeId:liveLogin.challenge_id,code:loginCode(db,secret)});
  const liveReq={headers:{cookie:`yasnafit_coach_session=${liveSession.raw_session}`},socket:{}};
  const changed=auth.changePassword(db,liveReq,{currentPassword:'YasnafitCoach1',newPassword:'YasnafitCoach2'});
  assert.equal(changed.ok,true);
  assert.equal(auth.resolveSession(db,liveReq),null);
  const afterChange=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach1',dataDir});
  assert.equal(afterChange.error,'INVALID_CREDENTIALS');

  auth.setMailer(async payload=>delivered.push(payload));
  delivered.length=0;
  const forgot=await auth.requestPasswordReset(db,{email:'crypto.javan17@gmail.com',dataDir,req:{headers:{host:'localhost:3020'},socket:{}}});
  assert.equal(forgot.ok,true);
  assert.equal(delivered.length,1);
  assert.match(delivered[0].token,/^[A-Za-z0-9_-]{43}$/);
  const unknownForgot=await auth.requestPasswordReset(db,{email:'missing@example.com',dataDir});
  assert.equal(unknownForgot.ok,true);
  const reset=auth.completePasswordReset(db,{token:delivered[0].token,password:'YasnafitCoach3'});
  assert.equal(reset.ok,true);
  const replayReset=auth.completePasswordReset(db,{token:delivered[0].token,password:'YasnafitCoach4'});
  assert.equal(replayReset.error,'INVALID_RESET');
  const afterReset=await auth.startLogin(db,{email:'crypto.javan17@gmail.com',password:'YasnafitCoach3',dataDir});
  assert.ok(afterReset.challenge_id);
  assert.equal(afterReset.code,undefined);

  auth.setMailer(null);
  const fileForgot=await auth.requestPasswordReset(db,{email:'crypto.javan17@gmail.com',dataDir,req:{headers:{host:'localhost:3020'},socket:{}}});
  assert.equal(fileForgot.delivery,'file');
  const resetFile=fs.readFileSync(path.join(dataDir,'coach-reset-dev.txt'),'utf8').trim();
  assert.match(resetFile,/^[A-Za-z0-9_-]{43}$/);

  const failedEvents=db.prepare("SELECT COUNT(*) AS c FROM coach_auth_events WHERE event_type IN ('login_failed','otp_failed','locked')").get().c;
  assert.ok(failedEvents>=5,`expected failed login events, got ${failedEvents}`);

  const cookie=auth.sessionCookie({headers:{},socket:{}},'A'.repeat(43));
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/SameSite=Strict/);
  assert.match(cookie,/Max-Age=43200/);
  assert.doesNotMatch(cookie,/; Secure/);
  const secureCookie=auth.sessionCookie({headers:{'x-forwarded-proto':'https'},socket:{}},'A'.repeat(43));
  assert.match(secureCookie,/; Secure/);
  const challengeCookie=auth.challengeCookie({headers:{},socket:{}},'B'.repeat(43));
  assert.match(challengeCookie,/yasnafit_coach_challenge=/);
  assert.match(challengeCookie,/HttpOnly/);
  assert.match(challengeCookie,/SameSite=Strict/);
  assert.match(challengeCookie,/Max-Age=300/);
  assert.doesNotMatch(challengeCookie,/; Secure/);

  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  db.close();
  console.log(JSON.stringify({ok:true,setup:true,hashed_password:true,authenticator_totp:true,otp_five_minutes:true,session_twelve_hours:true,logout_all:true,password_reset:true,lockout:true,otp_lock:true,auth_events:true,no_plaintext:true,no_screen_code:true}));
}finally{
  auth.setMailer(null);
  fs.rmSync(dir,{recursive:true,force:true});
}
})().catch(error=>{console.error(error);process.exitCode=1;});
