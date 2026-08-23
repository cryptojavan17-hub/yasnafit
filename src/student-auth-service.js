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
  else if(digits.length===10&&digits.startsWith('9'))digits=`0${digits}`;
  if(digits.length<7||digits.length>15)throw Object.assign(new Error('شماره همراه معتبر نیست'),{statusCode:400});
  return digits;
}
function temporaryPassword(mobile){const normalized=normalizeMobile(mobile);return normalized.slice(-4);}
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
  if(!student.password_hash||!PASSWORD_STATES.has(student.password_state))return {error:'AUTH_SETUP_REQUIRED'};
  if(!verifyPassword(password,student.password_hash)){
    const failures=Number(student.auth_failed_attempts||0)+1,lockUntil=failures>=MAX_FAILURES?new Date(Date.now()+LOCK_MS).toISOString():null;
    db.prepare('UPDATE students SET auth_failed_attempts=?,auth_locked_until=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(failures>=MAX_FAILURES?0:failures,lockUntil,student.id);
    return {error:lockUntil?'AUTH_LOCKED':'INVALID_CREDENTIALS'};
  }
  db.prepare('UPDATE students SET auth_failed_attempts=0,auth_locked_until=NULL,last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(student.id);
  return {student:{...student,auth_failed_attempts:0,auth_locked_until:null}};
}
function setPersonalPassword(db,studentId,newPassword){
  const student=db.prepare('SELECT id,mobile,password_state FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student)throw Object.assign(new Error('شاگرد پیدا نشد'),{statusCode:404});
  const validated=validatePersonalPassword(newPassword),hash=hashPassword(validated);
  db.prepare("UPDATE students SET password_hash=?,password_state='PERSONAL',password_changed_at=CURRENT_TIMESTAMP,auth_failed_attempts=0,auth_locked_until=NULL,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?").run(hash,studentId);
  return {password_state:'PERSONAL',password_changed_at:new Date().toISOString()};
}

module.exports={normalizeMobile,temporaryPassword,hashPassword,verifyPassword,validatePersonalPassword,authColumnsForMobile,safeStudent,authenticate,setPersonalPassword};
