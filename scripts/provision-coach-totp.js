#!/usr/bin/env node
'use strict';
const path=require('path');
const {DatabaseSync}=require('node:sqlite');
const auth=require('../src/coach-auth-service');

const dbPath=path.join(__dirname,'..','data','yasnafit.db');
const rotate=process.argv.includes('--rotate');
const password=process.env.YASNAFIT_COACH_PASSWORD||'';
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
  const dataDir=path.dirname(dbPath);
  auth.writeAuthenticatorKey(dataDir,result);
  console.log('Add this key in Google Authenticator (manual entry).');
  console.log('Email:', result.email);
  console.log('Secret:', result.secret);
  console.log('URL:', result.otpauth_url);
  console.log('Also written to data/coach-authenticator.txt');
}finally{
  db.close();
}
