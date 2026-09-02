#!/usr/bin/env node
'use strict';
// Provisions (or rotates) the coach TOTP key for THIS database only.
// The database is resolved through src/storage-paths.js, so on a container
// platform the key is written for the persistent volume instead of silently
// creating an empty <repo>/data/yasnafit.db (which would hand out a useless key).
const fs=require('fs');
const path=require('path');
const {DatabaseSync}=require('node:sqlite');
const auth=require('../src/coach-auth-service');
const {dataDir}=require('../src/storage-paths');

const dbPath=path.join(dataDir,'yasnafit.db');
const keyFile=path.join(dataDir,auth.AUTHENTICATOR_FILE);
const rotate=process.argv.includes('--rotate');
const password=process.env.YASNAFIT_COACH_PASSWORD||'';
// Railway (and any container) may capture stdout in the service logs, so the raw
// key is never printed there — read it from the file on the volume instead.
const printSecret=!process.env.RAILWAY_VOLUME_MOUNT_PATH;

if(!fs.existsSync(dbPath)){
  console.error(`دیتابیس پیدا نشد: ${dbPath}`);
  console.error('اول یک بار برنامه را اجرا کنید تا migrationها ساخته شوند، یا YASNAFIT_DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH را ست کنید.');
  process.exit(1);
}
console.log('Database:',dbPath);

const db=new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON');
try{
  auth.ensureLocalCoach(db);
  if(auth.setupRequired(db)){
    if(!password){
      console.error('Coach account is missing. Set YASNAFIT_COACH_PASSWORD and run again.');
      process.exit(1);
    }
    auth.setupCoach(db,{email:auth.SETUP_EMAIL,password,displayName:'مربی'});
    console.log('Coach account created for', auth.SETUP_EMAIL);
  }
  const result=auth.provisionCoachTotp(db,{rotate});
  auth.writeAuthenticatorKey(dataDir,result);
  console.log('Email:', result.email);
  if(printSecret){
    console.log('Add this key in Google Authenticator (manual entry).');
    console.log('Secret:', result.secret);
    console.log('URL:', result.otpauth_url);
  }else{
    console.log('کلید در محیط کانتینر چاپ نمی‌شود (لاگ سرویس ممکن است ثبت شود).');
    console.log(`محتوای فایل را روی Volume ببینید: ${keyFile}`);
  }
  console.log('Also written to', keyFile);
  console.log('نکته: همهٔ نشست‌های مربی باطل شد؛ با کد جدید وارد شوید.');
}finally{
  db.close();
}
