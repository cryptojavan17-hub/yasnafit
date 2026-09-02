'use strict';
// Local build stamp. A desktop install has no visible version marker, so "did my
// git pull actually land?" can only be answered by looking at the code on disk.
// This module reads the git HEAD (when available) and probes the working copy for
// feature markers, exposed through GET /api/build for the coach dashboard.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const manifest=require('../package.json');

function git(args){
  try{
    return String(execFileSync('git',args,{cwd:root,timeout:1500,stdio:['ignore','pipe','ignore']})).trim()||null;
  }catch(error){return null;}
}
function read(relative){
  try{return fs.readFileSync(path.join(root,relative),'utf8');}catch(error){return '';}
}
function fileStat(relative){
  try{
    const stats=fs.statSync(path.join(root,relative));
    return {size:stats.size,mtime:stats.mtime.toISOString()};
  }catch(error){return null;}
}

// Each marker answers "is this delivered feature present in this working copy?".
const MARKERS={
  'student_credentials_in_edit_dialog':files=>/function credentialEditorMarkup\(/.test(files['public/students.js'])&&/editStudentCredentials/.test(files['public/students.js']),
  'student_credentials_api':files=>/\/credentials\$/.test(files['server.js'])&&/manageCredentials/.test(files['server.js']),
  'mobile_password_sync':files=>/function mobileAuthUpdate\(/.test(files['src/student-auth-service.js']),
  'launcher':files=>/YASNAFIT/.test(files['YASNAFIT-LAUNCHER.bat'])
};
const PROBED=['public/students.js','server.js','src/student-auth-service.js','YASNAFIT-LAUNCHER.bat'];

function getBuildInfo(){
  const files=Object.fromEntries(PROBED.map(file=>[file,read(file)]));
  const markers={};
  for(const [name,test] of Object.entries(MARKERS))markers[name]=Boolean(test(files));
  return {
    version:manifest.version,
    displayName:manifest.displayName||manifest.name,
    commit:git(['rev-parse','--short=8','HEAD']),
    commit_date:git(['log','-1','--format=%cI']),
    branch:git(['rev-parse','--abbrev-ref','HEAD']),
    uncommitted:Boolean(git(['status','--porcelain'])),
    students_ui:fileStat('public/students.js'),
    markers
  };
}

module.exports={getBuildInfo,MARKERS,PROBED};
