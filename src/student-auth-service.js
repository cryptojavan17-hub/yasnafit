'use strict';
const crypto=require('crypto');

const KEY_LENGTH=32;
const MAX_FAILURES=5;
const LOCK_MS=15*60*1000;
const PASSWORD_STATES=new Set(['TEMPORARY','PERSONAL','RESET_REQUIRED']);

function normalizeMobile(value){
  let digits=String(value??'').trim()
    .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/\D/g,'');
  if(digits.startsWith('0098'))digits=`0${digits.slice(4)}`;
  else if(digits.startsWith('98')&&digits.length===12)digits=`0${digits.slice(2)}`;
  else if(digits.startsWith('099')&&digits.length===12)digits=`0${digits.slice(2)}`;
  else if(digits.length===10&&digits.startsWith('9'))digits=`0${digits}`;
  if(digits.length<7||digits.length>15)throw Object.assign(new Error('شماره همراه معتبر نیست'),{statusCode:400});
  return digits;
}
function temporaryPassword(mobile){const normalized=normalizeMobile(mobile);return normalized.slice(-4);}
function normalizeTemporaryPasswordInput(value){return String(value??'').trim().replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));}
function hashPassword(password,salt=crypto.randomBytes(16)){
  const value=String(password??'');
  const derived=crypto.scryptSync(value,salt,KEY_LENGTH,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}
function verifyPassword(password,encoded){
  try{
    const [algorithm,saltText,hashText]=String(encoded||'').split('$');
    if(algorithm!=='scrypt'||!saltText||!hashText)return false;
    const expected=Buffer.from(hashText,'base64url'),salt=Buffer.from(saltText,'base64url');
    const actual=crypto.scryptSync(String(password??''),salt,expected.length,{N:16384,r:8,p:1,maxmem:64*1024*1024});
    return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
  }catch(error){return false;}
}
const DUMMY_HASH=hashPassword('yasnafit-dummy-password');
function validatePersonalPassword(password){
  const value=String(password??'');
  if(value.length<8||value.length>128)throw Object.assign(new Error('رمز جدید باید حداقل ۸ کاراکتر و حداکثر ۱۲۸ کاراکتر باشد'),{statusCode:400});
  return value;
}
function authColumnsForMobile(mobile){
  const mobileNormalized=normalizeMobile(mobile),temporary=temporaryPassword(mobileNormalized);
  return {mobile_normalized:mobileNormalized,password_hash:hashPassword(temporary),password_state:'TEMPORARY'};
}
function safeStudent(row){
  if(!row)return row;
  const {password_hash,mobile_normalized,password_state,password_changed_at,temporary_login_at,auth_failed_attempts,auth_locked_until,last_login_at,...safe}=row;
  return safe;
}
function authenticate(db,mobile,password){
  let normalized;
  try{normalized=normalizeMobile(mobile);}catch(error){verifyPassword(password,DUMMY_HASH);return {error:'INVALID_CREDENTIALS'};}
  const student=db.prepare('SELECT * FROM students WHERE mobile_normalized=? AND deleted_at IS NULL').get(normalized);
  if(!student){verifyPassword(password,DUMMY_HASH);return {error:'INVALID_CREDENTIALS'};}
  if(student.auth_locked_until&&new Date(student.auth_locked_until)>new Date())return {error:'AUTH_LOCKED'};
  if(!PASSWORD_STATES.has(student.password_state))return {error:'AUTH_SETUP_REQUIRED'};
  const candidate=student.password_state==='TEMPORARY'?normalizeTemporaryPasswordInput(password):String(password??'');
  let valid=student.password_hash?verifyPassword(candidate,student.password_hash):false,repairedHash=null;
  // Compatibility repair: older installations may have an absent/stale temporary
  // hash. The defined temporary credential is still the mobile's final four digits.
  if(!valid&&student.password_state==='TEMPORARY'&&candidate===temporaryPassword(student.mobile)){
    repairedHash=hashPassword(candidate);valid=true;
  }
  if(!valid){
    if(!student.password_hash&&student.password_state!=='TEMPORARY')return {error:'AUTH_SETUP_REQUIRED'};
    const failures=Number(student.auth_failed_attempts||0)+1,lockUntil=failures>=MAX_FAILURES?new Date(Date.now()+LOCK_MS).toISOString():null;
    db.prepare('UPDATE students SET auth_failed_attempts=?,auth_locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failures>=MAX_FAILURES?0:failures,lockUntil,student.id);
    return {error:lockUntil?'AUTH_LOCKED':'INVALID_CREDENTIALS'};
  }
  db.prepare('UPDATE students SET password_hash=COALESCE(?,password_hash),auth_failed_attempts=0,auth_locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(repairedHash,student.id);
  return {student:{...student,password_hash:repairedHash||student.password_hash,auth_failed_attempts:0,auth_locked_until:null}};
}
function setPersonalPassword(db,studentId,newPassword){
  const student=db.prepare('SELECT id,mobile,password_state FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student)throw Object.assign(new Error('شاگرد پیدا نشد'),{statusCode:404});
  const validated=validatePersonalPassword(newPassword),hash=hashPassword(validated);
  db.prepare("UPDATE students SET password_hash=?,password_state='PERSONAL',password_changed_at=CURRENT_TIMESTAMP,auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?").run(hash,studentId);
  return {password_state:'PERSONAL',password_changed_at:new Date().toISOString()};
}

function registerStudent(db, data = {}) {
  const fullName = String(data.full_name || '').trim();
  if (!fullName || fullName.length < 2 || fullName.length > 100) {
    throw Object.assign(new Error('نام و نام خانوادگی الزامی است (بین ۲ تا ۱۰۰ کاراکتر).'), { statusCode: 400 });
  }

  const normalizedMobile = normalizeMobile(data.mobile);
  const existing = db.prepare('SELECT id FROM students WHERE mobile_normalized = ? AND deleted_at IS NULL').get(normalizedMobile);
  if (existing) {
    throw Object.assign(new Error('این شماره همراه قبلاً در سامانه ثبت شده است. لطفاً وارد شوید یا از شماره دیگری استفاده کنید.'), { statusCode: 409, code: 'MOBILE_EXISTS' });
  }

  const password = validatePersonalPassword(data.password);
  if (data.confirm_password !== undefined && String(data.confirm_password) !== password) {
    throw Object.assign(new Error('تکرار رمز عبور با رمز عبور وارد شده مطابقت ندارد.'), { statusCode: 400 });
  }

  const passwordHash = hashPassword(password);
  const stableId = 'st_' + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const goal = data.goal ? String(data.goal).trim() : '';
  const height = (data.height !== undefined && data.height !== '' && Number.isFinite(Number(data.height))) ? Number(data.height) : null;
  const weight = (data.weight !== undefined && data.weight !== '' && Number.isFinite(Number(data.weight))) ? Number(data.weight) : null;
  
  let gender = 'unspecified';
  if (['male', 'female', 'unspecified'].includes(data.gender)) {
    gender = data.gender;
  } else if (data.gender === 'مرد' || data.gender === 'آقا') {
    gender = 'male';
  } else if (data.gender === 'زن' || data.gender === 'خانم') {
    gender = 'female';
  }

  db.exec('BEGIN');
  try {
    const insertRes = db.prepare(`
      INSERT INTO students (
        stable_id, full_name, mobile, mobile_normalized,
        password_hash, password_state, status, profile_status, goal,
        height, weight, gender, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PERSONAL', 'فعال', 'INVITED', ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      stableId,
      fullName,
      normalizedMobile,
      normalizedMobile,
      passwordHash,
      goal,
      height,
      weight,
      gender
    );

    const studentId = Number(insertRes.lastInsertRowid);
    const created = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
    db.exec('COMMIT');

    return created;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports={normalizeMobile,temporaryPassword,normalizeTemporaryPasswordInput,hashPassword,verifyPassword,validatePersonalPassword,authColumnsForMobile,safeStudent,authenticate,setPersonalPassword,registerStudent};
