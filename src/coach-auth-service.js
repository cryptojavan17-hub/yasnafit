'use strict';
const crypto=require('crypto');
const fs=require('fs');
const net=require('net');
const path=require('path');
const tls=require('tls');
const {hashPassword,verifyPassword}=require('./student-auth-service');
const totp=require('./totp');

const SESSION_COOKIE='yasnafit_coach_session';
const SESSION_TTL_MS=12*60*60*1000;
const OTP_TTL_MS=5*60*1000;
const RESET_TTL_MS=15*60*1000;
const MAX_PASSWORD_FAILURES=5;
const MAX_OTP_FAILURES=3;
const LOCK_MS=15*60*1000;
const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
const SETUP_EMAIL='crypto.javan17@gmail.com';
const PLACEHOLDER_EMAIL='coach@yasnafit.local';
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
function requestIp(req){
  return String(req?.headers?.['x-forwarded-for']||req?.socket?.remoteAddress||'').split(',')[0].trim().slice(0,128);
}
function requestAgent(req){
  return String(req?.headers?.['user-agent']||'').slice(0,300);
}
function publicOrigin(req){
  const host=String(req?.headers?.['x-forwarded-host']||req?.headers?.host||'localhost:3020').split(',')[0].trim();
  const proto=secureRequest(req)?'https':'http';
  return `${proto}://${host}`;
}
function secureRequest(req){
  return Boolean(req?.socket?.encrypted) || String(req?.headers?.['x-forwarded-proto']||'').split(',')[0].trim()==='https';
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
function totpConfirmed(coach){
  return Boolean(coach?.totp_secret && coach?.totp_confirmed_at);
}
function normalizeOtp(value){
  return String(value??'')
    .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g,'');
}

function smtpAddress(value){
  const text=String(value||'').trim();
  const angled=text.match(/<([^>]+)>/);
  return (angled?angled[1]:text).trim();
}
function loadSmtpConfig(dataDir){
  const envHost=String(process.env.YASNAFIT_SMTP_HOST||'').trim();
  if(envHost){
    return {
      host:envHost,
      port:Number(process.env.YASNAFIT_SMTP_PORT||465),
      secure:String(process.env.YASNAFIT_SMTP_SECURE||'true').toLowerCase()!=='false',
      user:String(process.env.YASNAFIT_SMTP_USER||'').trim(),
      pass:String(process.env.YASNAFIT_SMTP_PASS||''),
      from:String(process.env.YASNAFIT_SMTP_FROM||process.env.YASNAFIT_SMTP_USER||'').trim()
    };
  }
  if(!dataDir) return null;
  const file=path.join(dataDir,'smtp.json');
  if(!fs.existsSync(file)) return null;
  try{
    const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!parsed || !parsed.host || !parsed.pass) return null;
    return {
      host:String(parsed.host||'').trim(),
      port:Number(parsed.port||465),
      secure:parsed.secure!==false,
      user:String(parsed.user||'').trim(),
      pass:String(parsed.pass||''),
      from:String(parsed.from||parsed.user||'').trim()
    };
  }catch(error){
    return null;
  }
}
function smtpConfigured(dataDir){
  const config=loadSmtpConfig(dataDir);
  return Boolean(config && config.host && config.pass);
}
function mailStatus(dataDir){
  const config=loadSmtpConfig(dataDir);
  return {
    mail_configured:Boolean(config && config.host && config.pass),
    mail_email:SETUP_EMAIL,
    mail_host:config?.host||'smtp.gmail.com'
  };
}
function writeSmtpConfig(dataDir,config){
  if(!dataDir) throw Object.assign(new Error('پوشه داده پیدا نشد'),{statusCode:400,code:'INVALID_SMTP'});
  fs.mkdirSync(dataDir,{recursive:true});
  fs.writeFileSync(path.join(dataDir,'smtp.json'),JSON.stringify({
    host:config.host,
    port:Number(config.port),
    secure:Boolean(config.secure),
    user:config.user,
    pass:config.pass,
    from:config.from||config.user
  },null,2),{mode:0o600});
}
function smtpError(raw){
  const text=String(raw||'');
  if(/535|534|530|Username and Password not accepted|Application-specific password/i.test(text)){
    return Object.assign(new Error('رمز برنامه جیمیل نادرست است. از App Password استفاده کنید، نه رمز خودِ جیمیل.'),{code:'MAIL_FAILED'});
  }
  if(/timeout|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(text)){
    return Object.assign(new Error('اتصال به سرور جیمیل برقرار نشد. اینترنت را بررسی کنید.'),{code:'MAIL_FAILED'});
  }
  return Object.assign(new Error('ارسال ایمیل به جیمیل انجام نشد.'),{code:'MAIL_FAILED'});
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
function smtpCode(response){
  return Number(String(response||'').match(/^(\d{3})/m)?.[1]||0);
}
async function smtpExpect(socket,command,ok){
  const response=command==null?await readSmtpResponse(socket):await smtpCommand(socket,command);
  const code=smtpCode(response);
  if(!(ok||[220,221,235,250,334,354]).includes(code)) throw new Error(String(response).split(/\r?\n/)[0]||'SMTP error');
  return response;
}
function connectSocket({host,port,secure,existing}){
  return new Promise((resolve,reject)=>{
    const socket=existing
      ? tls.connect({socket:existing,servername:host,timeout:20000})
      : secure
        ? tls.connect({host,port,servername:host,timeout:20000})
        : net.connect({host,port,timeout:20000});
    socket.setTimeout(20000);
    socket.once(secure||existing?'secureConnect':'connect',()=>resolve(socket));
    socket.once('error',reject);
    socket.once('timeout',()=>reject(new Error('SMTP timeout')));
  });
}
async function smtpSession(config,{to,subject,text}){
  const host=config.host;
  const port=Number(config.port||465);
  const useTls=config.secure!==false && port!==587;
  let socket=await connectSocket({host,port,secure:useTls});
  try{
    await smtpExpect(socket,null,[220]);
    let ehlo=await smtpExpect(socket,'EHLO yasnafit.local',[250]);
    if(!useTls && /STARTTLS/i.test(ehlo)){
      await smtpExpect(socket,'STARTTLS',[220]);
      socket=await connectSocket({host,port,secure:true,existing:socket});
      ehlo=await smtpExpect(socket,'EHLO yasnafit.local',[250]);
    }
    if(config.user){
      await smtpExpect(socket,'AUTH LOGIN',[334]);
      await smtpExpect(socket,Buffer.from(config.user).toString('base64'),[334]);
      await smtpExpect(socket,Buffer.from(config.pass).toString('base64'),[235]);
    }
    const fromAddr=smtpAddress(config.from||config.user);
    await smtpExpect(socket,`MAIL FROM:<${fromAddr}>`,[250]);
    await smtpExpect(socket,`RCPT TO:<${to}>`,[250]);
    await smtpExpect(socket,'DATA',[354]);
    const payload=[
      `From: Yasnafit <${fromAddr}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
      '.'
    ].join('\r\n');
    await smtpExpect(socket,payload,[250]);
    await smtpExpect(socket,'QUIT',[221]).catch(()=>{});
  }finally{
    try{socket.end();}catch(error){}
  }
}
async function sendSmtpEmail(config,mail){
  try{
    await smtpSession(config,mail);
    return config;
  }catch(error){
    if(Number(config.port)===465){
      try{
        const fallback={...config,port:587,secure:false};
        await smtpSession(fallback,mail);
        return fallback;
      }catch(second){
        throw smtpError(second.message||error.message);
      }
    }
    throw smtpError(error.message);
  }
}
async function configureGmail(dataDir,appPassword){
  const pass=String(appPassword||'').replace(/\s+/g,'');
  if(pass.length<8 || pass.length>128){
    throw Object.assign(new Error('رمز برنامه جیمیل را وارد کنید'),{statusCode:400,code:'INVALID_SMTP'});
  }
  let config={
    host:'smtp.gmail.com',
    port:465,
    secure:true,
    user:SETUP_EMAIL,
    pass,
    from:SETUP_EMAIL
  };
  config=await sendSmtpEmail(config,{
    to:SETUP_EMAIL,
    subject:'آزمایش ارسال ایمیل مربی Yasnafit',
    text:'اگر این پیام را می‌بینید، ارسال ایمیل بازیابی رمز مربی درست تنظیم شده است.'
  });
  writeSmtpConfig(dataDir,config);
  return {ok:true,email:SETUP_EMAIL,host:config.host};
}

function writeDevFile(dataDir,filename,contents){
  if(!dataDir) return;
  fs.mkdirSync(dataDir,{recursive:true});
  fs.writeFileSync(path.join(dataDir,filename),String(contents)+'\n',{mode:0o600});
}

async function deliverEmail({to,subject,text,code,token,dataDir,fallbackFile}){
  if(mailer){
    await mailer({to,subject,text,code,token});
    return 'custom';
  }
  const config=loadSmtpConfig(dataDir);
  if(config){
    await sendSmtpEmail(config,{to,subject,text});
    return 'smtp';
  }
  if(fallbackFile && (code||token)){
    writeDevFile(dataDir,fallbackFile,code||token);
    console.log(`[Coach Auth] SMTP is not configured; value written to data/${fallbackFile}`);
  }
  return 'file';
}

function safeCoach(row){
  if(!row) return null;
  return {
    id:row.id,
    display_name:row.display_name||'مربی',
    email:row.email||row.email_normalized||'',
    role:row.role||'coach',
    status:row.status||'ACTIVE'
  };
}

function primaryCoach(db){
  return db.prepare('SELECT * FROM coaches WHERE id=1').get()
    || db.prepare("SELECT * FROM coaches WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1").get()
    || null;
}

function setupRequired(db){
  const ready=db.prepare(`
    SELECT email_normalized,password_hash FROM coaches
    WHERE deleted_at IS NULL AND password_hash IS NOT NULL AND password_hash<>''
    ORDER BY id ASC LIMIT 1
  `).get();
  if(!ready) return true;
  return ready.email_normalized===PLACEHOLDER_EMAIL;
}

function authStatus(db,dataDir){
  const required=setupRequired(db);
  const coach=required?null:primaryCoach(db);
  return {
    setup_required:required,
    setup_email:required?SETUP_EMAIL:null,
    totp_required:!required && !totpConfirmed(coach),
    totp_confirmed:!required && totpConfirmed(coach),
    ...mailStatus(dataDir)
  };
}

function isLocked(coach){
  return Boolean(coach?.auth_locked_until && new Date(coach.auth_locked_until)>new Date());
}

function lockCoach(db,coachId){
  db.prepare('UPDATE coaches SET auth_failed_attempts=0,auth_locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(new Date(Date.now()+LOCK_MS).toISOString(),coachId);
}

function recordPasswordFailure(db,coachId,failures){
  const next=Number(failures||0)+1;
  if(next>=MAX_PASSWORD_FAILURES){
    lockCoach(db,coachId);
    return 'AUTH_LOCKED';
  }
  db.prepare('UPDATE coaches SET auth_failed_attempts=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,coachId);
  return 'INVALID_CREDENTIALS';
}

function clearFailures(db,coachId){
  db.prepare('UPDATE coaches SET auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(coachId);
}

function logAuthEvent(db,{coachId=null,email='',eventType,req=null,detail=''}={}){
  try{
    db.prepare(`
      INSERT INTO coach_auth_events(stable_id,coach_id,email,event_type,ip,user_agent,detail)
      VALUES(?,?,?,?,?,?,?)
    `).run(genUUID(),coachId,String(email||'').slice(0,254),eventType,requestIp(req),requestAgent(req),String(detail||'').slice(0,300));
  }catch(error){
    console.error('[Coach Auth] failed to record auth event', error.message);
  }
}

function revokeAllSessions(db,coachId){
  return db.prepare('UPDATE coach_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE coach_id=? AND revoked_at IS NULL').run(coachId).changes;
}

function ensureLocalCoach(db){
  const existing=db.prepare('SELECT * FROM coaches WHERE id=1').get();
  if(!existing){
    db.prepare("INSERT INTO coaches(id,stable_id,display_name,status,role) VALUES(1,'local-coach','مربی','ACTIVE','coach')").run();
  }else{
    if(!existing.role){
      try{db.prepare("UPDATE coaches SET role='coach' WHERE id=1 AND (role IS NULL OR role='')").run();}catch(error){}
    }
    if(existing.email_normalized===PLACEHOLDER_EMAIL){
      db.prepare(`
        UPDATE coaches
        SET email=NULL,email_normalized=NULL,password_hash=NULL,
            totp_secret=NULL,totp_confirmed_at=NULL,totp_last_counter=NULL,
            auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE id=1
      `).run();
      revokeAllSessions(db,1);
    }
  }
  return authStatus(db);
}

function setupCoach(db,{email,password,displayName='مربی',req=null}){
  if(!setupRequired(db)){
    throw Object.assign(new Error('اکانت مربی قبلاً ساخته شده است'),{statusCode:409,code:'SETUP_CLOSED'});
  }
  const normalized=normalizeEmail(email);
  if(normalized!==SETUP_EMAIL){
    throw Object.assign(new Error('ایمیل مربی باید crypto.javan17@gmail.com باشد'),{statusCode:400,code:'INVALID_SETUP_EMAIL'});
  }
  const validated=validateCoachPassword(password);
  ensureLocalCoach(db);
  db.prepare(`
    UPDATE coaches
    SET email=?,email_normalized=?,password_hash=?,display_name=?,role='coach',status='ACTIVE',
        totp_secret=NULL,totp_confirmed_at=NULL,totp_last_counter=NULL,
        auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE id=1
  `).run(normalized,normalized,hashPassword(validated),String(displayName||'مربی').trim()||'مربی');
  revokeAllSessions(db,1);
  logAuthEvent(db,{coachId:1,email:normalized,eventType:'setup_completed',req});
  return safeCoach(db.prepare('SELECT * FROM coaches WHERE id=1').get());
}

function createCoach(db,{email,password,displayName='مربی'}){
  const normalized=normalizeEmail(email);
  const validated=validateCoachPassword(password);
  const duplicate=db.prepare('SELECT id FROM coaches WHERE email_normalized=? AND deleted_at IS NULL').get(normalized);
  if(duplicate) throw Object.assign(new Error('این ایمیل قبلاً ثبت شده است'),{statusCode:409,code:'EMAIL_EXISTS'});
  const result=db.prepare(`
    INSERT INTO coaches(stable_id,display_name,status,role,email,email_normalized,password_hash,auth_failed_attempts)
    VALUES(?,?,?,?,?,?,?,0)
  `).run(genUUID(),displayName,'ACTIVE','coach',normalized,normalized,hashPassword(validated));
  return db.prepare('SELECT * FROM coaches WHERE id=?').get(Number(result.lastInsertRowid));
}

async function startLogin(db,{email,password,dataDir,req=null}){
  if(setupRequired(db)){
    logAuthEvent(db,{email:String(email||''),eventType:'login_failed',req,detail:'setup_required'});
    return {error:'SETUP_REQUIRED'};
  }
  let normalized=null;
  try{normalized=normalizeEmail(email);}catch(error){normalized=null;}
  const candidate=normalizePassword(password);
  const coach=normalized
    ? db.prepare('SELECT * FROM coaches WHERE email_normalized=? AND deleted_at IS NULL').get(normalized)
    : null;
  if(!coach || !coach.password_hash){
    verifyPassword(candidate,DUMMY_HASH);
    logAuthEvent(db,{email:normalized||String(email||''),eventType:'login_failed',req,detail:'unknown_account'});
    return {error:'INVALID_CREDENTIALS'};
  }
  if(coach.status!=='ACTIVE'){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'login_failed',req,detail:'inactive'});
    return {error:'INVALID_CREDENTIALS'};
  }
  if(isLocked(coach)){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'locked',req,detail:'already_locked'});
    return {error:'AUTH_LOCKED'};
  }
  if(!verifyPassword(candidate,coach.password_hash)){
    const failure=recordPasswordFailure(db,coach.id,coach.auth_failed_attempts);
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:failure==='AUTH_LOCKED'?'locked':'login_failed',req,detail:'bad_password'});
    return {error:failure};
  }
  if(!totpConfirmed(coach)){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'login_failed',req,detail:'totp_setup_required'});
    return {error:'TOTP_SETUP_REQUIRED'};
  }
  const challengeId=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+OTP_TTL_MS).toISOString();
  db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE coach_id=? AND consumed_at IS NULL').run(coach.id);
  db.prepare(`
    INSERT INTO coach_otp_challenges(stable_id,coach_id,code_hash,expires_at,failed_attempts)
    VALUES(?,?,?,?,0)
  `).run(challengeId,coach.id,hashToken('totp'),expiresAt);
  return {challenge_id:challengeId,expires_at:expiresAt,email:coach.email_normalized};
}

function beginTotpSetup(db,{req=null}={}){
  if(setupRequired(db)){
    throw Object.assign(new Error('ابتدا اکانت مربی را از صفحه راه‌اندازی بسازید'),{statusCode:409,code:'SETUP_REQUIRED'});
  }
  const coach=primaryCoach(db);
  if(!coach || !coach.password_hash){
    throw Object.assign(new Error('ابتدا اکانت مربی را از صفحه راه‌اندازی بسازید'),{statusCode:409,code:'SETUP_REQUIRED'});
  }
  if(totpConfirmed(coach)){
    throw Object.assign(new Error('تأیید دو مرحله‌ای قبلاً فعال شده است'),{statusCode:409,code:'TOTP_ALREADY_SET'});
  }
  let secret=coach.totp_secret;
  if(!secret){
    secret=totp.generateSecret();
    db.prepare(`
      UPDATE coaches
      SET totp_secret=?,totp_confirmed_at=NULL,totp_last_counter=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(secret,coach.id);
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'totp_setup_started',req});
  }
  return totp.enrollment({secret,email:coach.email_normalized||SETUP_EMAIL});
}

function confirmTotp(db,{code,req=null}={}){
  if(setupRequired(db)) return {error:'SETUP_REQUIRED'};
  const coach=primaryCoach(db);
  if(!coach?.totp_secret) return {error:'TOTP_SETUP_REQUIRED'};
  if(totpConfirmed(coach)) return {error:'TOTP_ALREADY_SET'};
  const checked=totp.verify(coach.totp_secret,code);
  if(!checked.ok){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'otp_failed',req,detail:'totp_confirm'});
    return {error:'INVALID_CODE'};
  }
  db.prepare(`
    UPDATE coaches
    SET totp_confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(coach.id);
  logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'totp_confirmed',req});
  return {ok:true,email:coach.email_normalized};
}

function verifyOtp(db,{challengeId,code,req=null}){
  const rawId=String(challengeId||'').trim();
  const otp=normalizeOtp(code);
  if(!TOKEN_PATTERN.test(rawId) || !/^\d{6}$/.test(otp)){
    hashToken(otp||'000000');
    logAuthEvent(db,{eventType:'otp_failed',req,detail:'malformed'});
    return {error:'INVALID_CODE'};
  }
  const challenge=db.prepare(`
    SELECT c.*, co.email_normalized, co.display_name, co.status, co.role, co.auth_failed_attempts, co.auth_locked_until, co.deleted_at,
           co.totp_secret, co.totp_confirmed_at, co.totp_last_counter
    FROM coach_otp_challenges c
    JOIN coaches co ON co.id=c.coach_id
    WHERE c.stable_id=?
  `).get(rawId);
  if(!challenge || challenge.deleted_at || challenge.status!=='ACTIVE'){
    hashToken(otp);
    logAuthEvent(db,{eventType:'otp_failed',req,detail:'unknown_challenge'});
    return {error:'INVALID_CODE'};
  }
  if(isLocked(challenge)){
    logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'locked',req,detail:'otp_while_locked'});
    return {error:'AUTH_LOCKED'};
  }
  if(challenge.consumed_at){
    logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'otp_failed',req,detail:'consumed'});
    return {error:'INVALID_CODE'};
  }
  const expires=new Date(challenge.expires_at);
  if(Number.isNaN(expires.getTime()) || expires<=new Date()){
    db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').run(challenge.id);
    logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'otp_failed',req,detail:'expired'});
    return {error:'CODE_EXPIRED'};
  }
  if(!totpConfirmed(challenge)){
    logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'otp_failed',req,detail:'totp_missing'});
    return {error:'TOTP_SETUP_REQUIRED'};
  }
  const checked=totp.verify(challenge.totp_secret,otp,{lastCounter:challenge.totp_last_counter});
  if(!checked.ok){
    const next=Number(challenge.failed_attempts||0)+1;
    db.prepare('UPDATE coach_otp_challenges SET failed_attempts=? WHERE id=?').run(next,challenge.id);
    if(next>=MAX_OTP_FAILURES){
      db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').run(challenge.id);
      lockCoach(db,challenge.coach_id);
      logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'locked',req,detail:'otp_lock'});
      return {error:'AUTH_LOCKED'};
    }
    logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'otp_failed',req,detail:`attempt_${next}`});
    return {error:'INVALID_CODE'};
  }
  db.prepare('UPDATE coach_otp_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE id=?').run(challenge.id);
  db.prepare('UPDATE coaches SET totp_last_counter=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(checked.counter,challenge.coach_id);
  clearFailures(db,challenge.coach_id);
  const rawSession=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO coach_sessions(stable_id,coach_id,session_hash,expires_at,last_seen_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(genUUID(),challenge.coach_id,hashToken(rawSession),expiresAt);
  db.prepare('UPDATE coaches SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(challenge.coach_id);
  logAuthEvent(db,{coachId:challenge.coach_id,email:challenge.email_normalized,eventType:'login_success',req});
  return {
    raw_session:rawSession,
    expires_at:expiresAt,
    coach:safeCoach({
      id:challenge.coach_id,
      display_name:challenge.display_name,
      email:challenge.email_normalized,
      role:challenge.role,
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

function logoutAll(db,req){
  const context=resolveSession(db,req);
  if(!context) return {error:'COACH_SESSION_REQUIRED'};
  const revoked=revokeAllSessions(db,context.coach_id);
  logAuthEvent(db,{coachId:context.coach_id,email:context.coach.email,eventType:'logout_all',req});
  return {revoked};
}

function setCoachPassword(db,coachId,password,{revokeAll=true}={}){
  const validated=validateCoachPassword(password);
  db.prepare('UPDATE coaches SET password_hash=?,auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(hashPassword(validated),coachId);
  if(revokeAll) revokeAllSessions(db,coachId);
}

function changePassword(db,req,{currentPassword,newPassword}){
  const context=resolveSession(db,req);
  if(!context) return {error:'COACH_SESSION_REQUIRED'};
  const coach=db.prepare('SELECT * FROM coaches WHERE id=?').get(context.coach_id);
  if(!verifyPassword(normalizePassword(currentPassword),coach.password_hash)){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'login_failed',req,detail:'bad_current_password'});
    return {error:'INVALID_CURRENT_PASSWORD'};
  }
  setCoachPassword(db,coach.id,newPassword,{revokeAll:true});
  logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'password_changed',req});
  return {ok:true};
}

async function requestPasswordReset(db,{email,req=null,dataDir}){
  let normalized=null;
  try{normalized=normalizeEmail(email);}catch(error){return {ok:true};}
  const coach=db.prepare('SELECT * FROM coaches WHERE email_normalized=? AND deleted_at IS NULL AND password_hash IS NOT NULL').get(normalized);
  if(!coach){
    logAuthEvent(db,{email:normalized,eventType:'password_reset_requested',req,detail:'unknown_email'});
    return {ok:true};
  }
  const rawToken=crypto.randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+RESET_TTL_MS).toISOString();
  db.prepare('UPDATE coach_password_resets SET consumed_at=CURRENT_TIMESTAMP WHERE coach_id=? AND consumed_at IS NULL').run(coach.id);
  db.prepare(`
    INSERT INTO coach_password_resets(stable_id,coach_id,token_hash,expires_at)
    VALUES(?,?,?,?)
  `).run(genUUID(),coach.id,hashToken(rawToken),expiresAt);
  const link=`${publicOrigin(req)}/coach/reset?token=${encodeURIComponent(rawToken)}`;
  let delivery;
  try{
    delivery=await deliverEmail({
      to:coach.email_normalized,
      subject:'بازیابی رمز عبور مربی Yasnafit',
      text:`برای تعیین رمز جدید این لینک را تا ۱۵ دقیقه آینده باز کنید:\n${link}\nاگر این درخواست را شما نداده‌اید، پیام را نادیده بگیرید.`,
      token:rawToken,
      dataDir,
      fallbackFile:'coach-reset-dev.txt'
    });
  }catch(error){
    logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'password_reset_failed',req,detail:'mail_failed'});
    return {error:error.code||'MAIL_FAILED',message:error.message};
  }
  logAuthEvent(db,{coachId:coach.id,email:coach.email_normalized,eventType:'password_reset_requested',req});
  return {ok:true,delivery};
}

function completePasswordReset(db,{token,password,req=null}){
  const raw=String(token||'').trim();
  if(!TOKEN_PATTERN.test(raw)) return {error:'INVALID_RESET'};
  const row=db.prepare(`
    SELECT r.*, c.email_normalized, c.status, c.deleted_at
    FROM coach_password_resets r
    JOIN coaches c ON c.id=r.coach_id
    WHERE r.token_hash=?
  `).get(hashToken(raw));
  if(!row || row.deleted_at || row.status!=='ACTIVE' || row.consumed_at){
    logAuthEvent(db,{eventType:'password_reset_failed',req,detail:'invalid'});
    return {error:'INVALID_RESET'};
  }
  const expires=new Date(row.expires_at);
  if(Number.isNaN(expires.getTime()) || expires<=new Date()){
    db.prepare('UPDATE coach_password_resets SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').run(row.id);
    logAuthEvent(db,{coachId:row.coach_id,email:row.email_normalized,eventType:'password_reset_failed',req,detail:'expired'});
    return {error:'RESET_EXPIRED'};
  }
  let validated;
  try{validated=validateCoachPassword(password);}catch(error){return {error:'WEAK_PASSWORD',message:error.message};}
  db.prepare('UPDATE coach_password_resets SET consumed_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
  setCoachPassword(db,row.coach_id,validated,{revokeAll:true});
  logAuthEvent(db,{coachId:row.coach_id,email:row.email_normalized,eventType:'password_reset_completed',req});
  return {ok:true,email:row.email_normalized};
}

module.exports={
  SESSION_COOKIE,SESSION_TTL_MS,OTP_TTL_MS,RESET_TTL_MS,MAX_PASSWORD_FAILURES,MAX_OTP_FAILURES,LOCK_MS,
  TOKEN_PATTERN,SETUP_EMAIL,PLACEHOLDER_EMAIL,
  setMailer,normalizeEmail,validateCoachPassword,ensureLocalCoach,setupRequired,authStatus,setupCoach,
  createCoach,startLogin,beginTotpSetup,confirmTotp,verifyOtp,resolveSession,revokeCurrentSession,logoutAll,changePassword,
  requestPasswordReset,completePasswordReset,sessionCookie,clearSessionCookie,safeCoach,logAuthEvent,
  smtpConfigured,mailStatus,loadSmtpConfig,writeSmtpConfig,configureGmail
};
