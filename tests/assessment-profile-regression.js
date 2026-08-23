#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');const {runMigrations}=require('../src/migrations');
const students=require('../src/student-service');const assessments=require('../src/assessment-service');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-assessment-'));
function complete(db,id,studentId,gender='male'){
  assessments.saveSection(db,id,studentId,'general',{goals:['fitness','fat_loss'],additional_notes:'test',gender});
  assessments.saveSection(db,id,studentId,'measurements',{height:'۱۷۵',weight:'۷۵/۵',around_the_arm:'۳۱',around_the_chest:95,around_the_belly:82,around_the_hips:98,around_the_leg:36,around_the_thigh:56,around_the_wrist:17});
  assessments.saveSection(db,id,studentId,'medical',{has_disease:false,has_medication:false,has_injury:false,has_surgery:false,last_blood_test_notes:'normal',corrective_notes:'',items:[{kind:'corrective',category:'ناهنجاری اصلاحی',name:'سر به جلو',notes:''}]});
  assessments.saveSection(db,id,studentId,'sports',{average_daily_activity:'medium',practice_history:false,practice_now:false,practice_place:'gym',home_equipment:'',sessions_per_week:3,supplement_history:false,doping_history:''});
  assessments.saveSection(db,id,studentId,'nutrition',{diet_type:'iranian',previous_diet:false,food_allergies:'',weight_changes:'',appetite_status:'grazing',appetite_notes:'',defecation_problem:'none',breakfast:'',lunch:'',dinner:''});
  assessments.saveSection(db,id,studentId,'habits',{smoking:false,alcohol:false});
  if(gender==='female')assessments.saveSection(db,id,studentId,'pregnancy',{childbirth_history:false,breastfeeding:false,formula_use:false,child_food_allergy:false});
}
try{
  assert.equal(assessments.normalizeLocalizedNumber('۱۷۵'),'175');assert.equal(assessments.normalizeLocalizedNumber('۷۸/۵'),'78.5');assert.equal(assessments.normalizeLocalizedNumber('٧٨٫٥'),'78.5');
  const db=new DatabaseSync(path.join(dir,'assessment.db'));db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  const studentId=Number(db.prepare("INSERT INTO students(stable_id,full_name,status,gender,version,created_at,updated_at) VALUES('profile-student','Student','فعال','male',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run().lastInsertRowid);
  const initial=students.createAssessment(db,studentId,{body_photos_preference:'declined'});assert.equal(initial.assessment_type,'INITIAL');assert.equal(initial.lifecycle_status,'DRAFT');complete(db,Number(initial.id),studentId);
  const initialRow=db.prepare('SELECT * FROM body_assessments WHERE id=?').get(initial.id);assert.deepEqual(assessments.validateForSubmission(db,initialRow,db.prepare('SELECT * FROM students WHERE id=?').get(studentId)),[]);
  let submitted=students.submitAssessment(db,initial.id);assert.equal(submitted.lifecycle_status,'SUBMITTED');assert.throws(()=>students.updateAssessment(db,initial.id,{weight:70}),/frozen/);assert.throws(()=>students.reviewAssessment(db,initial.id,'approve',''),/مجاز نیست/);
  let reviewing=students.reviewAssessment(db,initial.id,'under_review','');assert.equal(reviewing.lifecycle_status,'PENDING_REVIEW');assert.throws(()=>students.reviewAssessment(db,initial.id,'request_changes',''),/یادداشت/);
  let changes=students.reviewAssessment(db,initial.id,'request_changes','وزن را اصلاح کنید');assert.equal(changes.lifecycle_status,'CHANGES_REQUESTED');students.updateAssessment(db,initial.id,{weight:74});submitted=students.submitAssessment(db,initial.id);students.reviewAssessment(db,initial.id,'under_review','');const approved=students.reviewAssessment(db,initial.id,'approve','تأیید');assert.equal(approved.lifecycle_status,'APPROVED');assert.ok(approved.approved_at);
  const monthly=students.createAssessment(db,studentId,{body_photos_preference:'willing'});assert.equal(monthly.assessment_type,'MONTHLY');complete(db,Number(monthly.id),studentId);students.submitAssessment(db,monthly.id);students.reviewAssessment(db,monthly.id,'under_review','');const rejected=students.reviewAssessment(db,monthly.id,'reject','اطلاعات کافی نیست');assert.equal(rejected.lifecycle_status,'REJECTED');assert.ok(rejected.rejected_at);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM body_assessments WHERE student_id=?').get(studentId).c,2);
  const femaleId=Number(db.prepare("INSERT INTO students(stable_id,full_name,status,gender,version,created_at,updated_at) VALUES('female-student','Female','فعال','female',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run().lastInsertRowid);const femaleAssessment=students.createAssessment(db,femaleId,{body_photos_preference:'declined'});complete(db,Number(femaleAssessment.id),femaleId,'female');const femaleRow=db.prepare('SELECT * FROM body_assessments WHERE id=?').get(femaleAssessment.id);assert.deepEqual(assessments.validateForSubmission(db,femaleRow,db.prepare('SELECT * FROM students WHERE id=?').get(femaleId)),[]);assert.equal(students.submitAssessment(db,femaleAssessment.id).lifecycle_status,'SUBMITTED');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
  console.log(JSON.stringify({ok:true,initial:true,monthly:true,normalized_sections:true,draft:true,submit:true,pending_review:true,changes_requested:true,approved:true,rejected:true,history_preserved:true,female_pregnancy_section:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
