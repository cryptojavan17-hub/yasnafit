'use strict';
const crypto=require('crypto');
const fs=require('fs');
const net=require('net');
const path=require('path');
const tls=require('tls');
const {hashPassword,verifyPassword}=require('./student-auth-service');

const SESSION_COOKIE='yasnafit_coach_session';
const SESSION_TTL_MS=24*60*60*1000;
const OTP_TTL_MS=10*60*1000;
const MAX_FAILURES=5;
const LOCK_MS=15*60*1000;
const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
const DEFAULT_EMAIL='coach@yasnafit.local';
const DEFAULT_PASSWORD='YasnafitCoach1';
const DUMMY_HASH=hashPassword('yasnafit-coach-dummy-password');

let mailer=null;
function setMailer(fn){mailer=typeof fn==='function'?fn:null;}

function hashToken(token){
  return crypto.createHash('sha256').update(String(token||'')).digest('hex');
}
function genUUID(){
  return crypto.randomUUID?crypto.randomUUID():crypto.randomBytes(16).toString('hex');
}
function parseCookies(req){
  const result={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const trimmed=part.trim();if(!trimmed)continue;
    const index=trimmed.indexOf('=');
    if(index>0){
      try{result[trimmed.slice(0,index)]=decodeURIComponent(trimmed.slice(index+1));}
      catch(error){result[trimmed.slice(0,index)]='';}
    }
  }
  return result;
}
function secureRequest(req){
  return Boolean(req.socket?.encrypted) || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
}
function sessionCookie(req,rawSession,maxAgeSeconds=Math.floor(SESSION_TTL_MS/1000)){
  return `${SESSION_COOKIE}=${encodeURIComponent(rawSession)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secureRequest(req)?'; Secure':''}`;
}
function clearSessionCookie(req){return sessionCookie(req,'',0);}

function normalizeEmail(value){
  const email=String(value??'').trim().toLowerCase();
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || email.length>254){
    throw Object.assign(new Error('ایمیل معتبر نیست'),{statusCode:400,code:'INVALID_EMAIL'});
  }
  return email;
}
function normalizePassword(value){
  return String(value??'')
    .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}
function validateCoachPassword(password){
  const value=normalizePassword(password);
  if(value.length<8 || value.length>128){
    throw Object.assign(new Error('رمز عبور باید حداقل ۸ کاراکتر باشد'),{statusCode:400,code:'WEAK_PASSWORD'});
  }
  if(!/[A-Za-z]/.test(value) || !/\d/.test(value)){
    throw Object.assign(new Error('رمز عبور باید ترکیبی از حرف و عدد باشد'),{statusCode:400,code:'WEAK_PASSWORD'});
  }
  return value;
}
function generateOtp(){
  return String(crypto.randomInt(0,1000000)).padStart(6,'0');
}
function normalizeOtp(value){
  return String(value??'')
    .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g,'');
}

function smtpConfigured(){
  return Boolean(String(process.env.YASNAFIT_SMTP_HOST||'').trim());
}

function readSmtpResponse(socket){
  return new Promise((resolve,reject)=>{
    let buffer='';
    const onData=chunk=>{
      buffer+=chunk.toString('utf8');
      const lines=buffer.split(/\r?\n/).filter(Boolean);
      const last=lines[lines.length-1]||'';
      if(/^\d{3} /.test(last)){
        cleanup();
        resolve(buffer);
      }
    };
    const onError=error=>{cleanup();reject(error);};
    const onTimeout=()=>{cleanup();reject(new Error('SMTP timeout'));};
    const cleanup=()=>{
      socket.off('data',onData);
      socket.off('error',onError);
      socket.off('timeout',onTimeout);
    };
    socket.on('data',onData);
    socket.on('error',onError);
    socket.on('timeout',onTimeout);
  });
}
function smtpCommand(socket,command){
  return new Promise((resolve,reject)=>{
    socket.write(command+'\r\n','utf8',error=>error?reject(error):resolve());
  }).then(()=>readSmtpResponse(socket));
}
async function sendSmtpEmail({to,subject,text}){
  const host=String(process.env.YASNAFIT_SMTP_HOST||'').trim();
  if(!host) throw new Error('SMTP is not configured');
  const port=Number(process.env.YASNAFIT_SMTP_PORT||465);
  const user=String(process.env.YASNAFIT_SMTP_USER||'').trim();
  const pass=String(process.env.YASNAFIT_SMTP_PASS||'');
  const from=String(process.env.YASNAFIT_SMTP_FROM||user||'yasnafit@localhost').trim();
  const secure=String(process.env.YASNAFIT_SMTP_SECURE||'true').toLowerCase()!=='false';
  const socket=secure
    ? tls.connect({host,port,servername:host,timeout:15000})
    : net.connect({host,port,timeout:15000});
  socket.setTimeout(15000);
  await new Promise((resolve,reject)=>{
    socket.once(secure?'secureConnect':'connect',resolve);
    socket.once('error',reject);
  });
  try{
    await readSmtpResponse(socket);
    await smtpCommand(socket,'EHLO yasnafit.local');
    if(user){
      await smtpCommand(socket,'AUTH LOGIN');
      await smtpCommand(socket,Buffer.from(user).toString('base64'));
      await smtpCommand(socket,Buffer.from(pass).toString('base64'));
    }
    await smtpCommand(socket,`MAIL FROM:<${from}>`);
    await smtpCommand(socket,`RCPT TO:<${to}>`);
    await smtpCommand(socket,'DATA');
    const payload=[
      `From: Yasnafit <${from}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      '.'
    ].join('\r\n');
    await smtpCommand(socket,payload);
    await smtpCommand(socket,'QUIT').catch(()=>{});
  }finally{
    try{socket.end();}catch(error){}
  }
}

function writeDevOtp(dataDir,code){
  if(!dataDir) return;
  fs.mkdirSync(dataDir,{recursive:true});
  fs.writeFileSync(path.join(dataDir,'coach-otp-dev.txt'),String(code)+'\n',{mode:0o600});
}

async function deliverOtp({email,code,dataDir}){
  const subject='کد ورود دو مرحله‌ای مربی Yasnafit';
  const text=`کد ورود شما: ${code}\nاین کد تا ۱۰ دقیقه معتبر است.\nاگر این درخواست را شما نداده‌اید، آن را نادیده بگیرید.`;
  if(mailer){
    await mailer({to:email,subject,text,code});
    return 'custom';
  }
  if(smtpConfigured()){
    await sendSmtpEmail({to:email,subject,text});
    return 'smtp';
  }
  writeDevOtp(dataDir,code);
  console.log('[Coach 2FA] SMTP is not configured; one-time code written to data/coach-otp-dev.txt');
  return 'file';
}

function safeCoach(row){
  if(!row) return null;
  return {
    id:row.id,
    display_name:row.display_name||'مربی',
    email:row.email||row.email_normalized||'',
    status:row.status||'ACTIVE'
  };
}

function isLocked(coach){
  return Boolean(coach?.auth_locked_until && new Date(coach.auth_locked_until)>new Date());
}

function recordFailure(db,coachId,failures){
  const next=Number(failures||0)+1;
  const lockUntil=next>=MAX_FAILURES?new Date(Date.now()+LOCK_MS).toISOString():null;
  db.prepare('UPDATE coaches SET auth_failed_attempts=?,auth_locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(lockUntil?0:next,lockUntil,coachId);
  return lockUntil?'AUTH_LOCKED':'INVALID_CREDENTIALS';
}

function clearFailures(db,coachId){
  db.prepare('UPDATE coaches SET auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(coachId);
}

function ensureLocalCoach(db,dataDir){
  const existing=db.prepare('SELECT * FROM coaches WHERE id=1').get();
  if(!existing){
    db.prepare("INSERT INTO coaches(id,stable_id,display_name,status) VALUES(1,'local-coach','مربی محلی','ACTIVE')").run();
  }
  const coach=db.prepare('SELECT * FROM coaches WHERE id=1').get();
  if(coach.password_hash && coach.email_normalized){
    return {email:coach.email_normalized,bootstrapped:false};
  }
  const email=normalizeEmail(process.env.YASNAFIT_COACH_EMAIL||coach.email||DEFAULT_EMAIL);
  const rawPassword=process.env.YASNAFIT_COACH_PASSWORD||DEFAULT_PASSWORD;
  const password=validateCoachPassword(rawPassword);
  db.prepare(`
    UPDATE coaches
    SET email=?,email_normalized=?,password_hash=?,auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(email,email,hashPassword(password));
  if(dataDir){
    fs.mkdirSync(dataDir,{recursive:true});
    fs.writeFileSync(
      path.join(dataDir,'coach-credentials.txt'),
      `email=${email}\npassword=${password}\n`,
      {mode:0o600}
    );
  }
  return {email,bootstrapped:true};
}

function createCoach(db,{email,password,displayName='مربی'}){
  const normalized=normalizeEmail(email);
  const validated=validateCoachPassword(password);
  const duplicate=db.prepare('SELECT id FROM coaches WHERE email_normalized=? AND deleted_at IS NULL').get(normalized);
  if(duplicate) throw Object.assign(new Error('این ایمیل قبلاً ثبت شده است'),{statusCode:409,code:'EMAIL_EXISTS'});
  const result=db.prepare(`
    INSERT INTO coaches(stable_id,display_name,status,email,email_normalized,password_hash,auth_failed_attempts)
    VALUES(?,?,?,?,?,?,0)
  `).run(genUUID(),displayName,'ACTIVE',normalized,normalized,hashPassword(validated));
  return db.prepare('SELECT * FROM coaches WHERE id=?').get(Number(result.lastInsertRowid));
}

async function startLogin(db,{email,password,dataDir}){
  let normalized=null;
  try{normalized=normalizeEmail(email);}catch(error){normalized=null;}
  const candidate=normalizePassword(password);
  const coach=normalized
    ? db.prepare('SELECT * FROM coaches WHERE email_normalized=? AND deleted_at IS NULL').get(normalized)
    : null;
  if(!coach || !coach.password_hash){
    verifyPassword(candidate,DUMMY_HASH);
    return {error:'INVALID_CREDENTIALS'};
  }
  if(coach.status!=='ACTIVE') return {error:'INVALID_CREDENTIALS'};
  if(isLocked(coach)) return {error:'AUTH_LOCKED'};
  if(!verifyPassword(candidate,coach.password_hash)){
    return {error:recordFailure(db,coach.id,coach.auth_failed_attempts)};
  }
  const code=generateOtp();
  const challengeId=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+OTP_TTL_MS).toISOString();
  db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE coach_id=? AND consumed_at IS NULL').run(coach.id);
  db.prepare(`
    INSERT INTO coach_otp_challenges(stable_id,coach_id,code_hash,expires_at,failed_attempts)
    VALUES(?,?,?,?,0)
  `).run(challengeId,coach.id,hashToken(code),expiresAt);
  try{
    await deliverOtp({email:coach.email_normalized,code,dataDir});
  }catch(error){
    writeDevOtp(dataDir,code);
    console.error('[Coach 2FA] email delivery failed; code written to data/coach-otp-dev.txt', error.message);
  }
  return {challenge_id:challengeId,expires_at:expiresAt,email:coach.email_normalized};
}

function verifyOtp(db,{challengeId,code}){
  const rawId=String(challengeId||'').trim();
  const otp=normalizeOtp(code);
  if(!TOKEN_PATTERN.test(rawId) || !/^\d{6}$/.test(otp)){
    hashToken(otp||'000000');
    return {error:'INVALID_CODE'};
  }
  const challenge=db.prepare(`
    SELECT c.*, co.email_normalized, co.display_name, co.status, co.auth_failed_attempts, co.auth_locked_until, co.deleted_at
    FROM coach_otp_challenges c
    JOIN coaches co ON co.id=c.coach_id
    WHERE c.stable_id=?
  `).get(rawId);
  if(!challenge || challenge.deleted_at || challenge.status!=='ACTIVE'){
    hashToken(otp);
    return {error:'INVALID_CODE'};
  }
  if(isLocked(challenge)) return {error:'AUTH_LOCKED'};
  if(challenge.consumed_at) return {error:'INVALID_CODE'};
  const expires=new Date(challenge.expires_at);
  if(Number.isNaN(expires.getTime()) || expires<=new Date()){
    db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').run(challenge.id);
    return {error:'CODE_EXPIRED'};
  }
  if(hashToken(otp)!==challenge.code_hash){
    db.prepare('UPDATE coach_otp_challenges SET failed_attempts=failed_attempts+1 WHERE id=?').run(challenge.id);
    const failure=recordFailure(db,challenge.coach_id,challenge.auth_failed_attempts);
    return {error:failure==='AUTH_LOCKED'?'AUTH_LOCKED':'INVALID_CODE'};
  }
  db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=?').run(challenge.id);
  clearFailures(db,challenge.coach_id);
  const rawSession=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO coach_sessions(stable_id,coach_id,session_hash,expires_at,last_seen_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(genUUID(),challenge.coach_id,hashToken(rawSession),expiresAt);
  db.prepare('UPDATE coaches SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(challenge.coach_id);
  return {
    raw_session:rawSession,
    expires_at:expiresAt,
    coach:safeCoach({
      id:challenge.coach_id,
      display_name:challenge.display_name,
      email:challenge.email_normalized,
      status:challenge.status
    })
  };
}

function resolveSession(db,req){
  const raw=parseCookies(req)[SESSION_COOKIE];
  if(!TOKEN_PATTERN.test(String(raw||''))) return null;
  const row=db.prepare(`
    SELECT cs.id AS session_id, cs.coach_id, cs.expires_at, cs.revoked_at, c.*
    FROM coach_sessions cs
    JOIN coaches c ON c.id=cs.coach_id AND c.deleted_at IS NULL AND c.status='ACTIVE'
    WHERE cs.session_hash=?
  `).get(hashToken(raw));
  if(!row || row.revoked_at) return null;
  const expires=new Date(row.expires_at);
  if(Number.isNaN(expires.getTime()) || expires<=new Date()){
    db.prepare('UPDATE coach_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL').run(row.session_id);
    return null;
  }
  db.prepare('UPDATE coach_sessions SET last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.session_id);
  return {
    session_id:row.session_id,
    coach_id:row.coach_id,
    expires_at:row.expires_at,
    coach:safeCoach(row)
  };
}

function revokeCurrentSession(db,req){
  const raw=parseCookies(req)[SESSION_COOKIE];
  if(!TOKEN_PATTERN.test(String(raw||''))) return false;
  return db.prepare('UPDATE coach_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE session_hash=? AND revoked_at IS NULL').run(hashToken(raw)).changes>0;
}

module.exports={
  SESSION_COOKIE,SESSION_TTL_MS,OTP_TTL_MS,MAX_FAILURES,LOCK_MS,TOKEN_PATTERN,DEFAULT_EMAIL,DEFAULT_PASSWORD,
  setMailer,normalizeEmail,validateCoachPassword,ensureLocalCoach,createCoach,startLogin,verifyOtp,
  resolveSession,revokeCurrentSession,sessionCookie,clearSessionCookie,safeCoach
};
