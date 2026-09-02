#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {runMigrations}=require('../src/migrations');
const studentService=require('../src/student-service');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yasnafit-students-'));
try{
  const db=new DatabaseSync(path.join(dir,'students.db'));
  db.exec('PRAGMA foreign_keys=ON');runMigrations(db);
  let result=studentService.getManagedStudents(db,{page:1,pageSize:20});
  assert.equal(result.items.length,0);assert.deepEqual(result.stats,{total:0,active:0,pending_review:0,active_programs:0,needs_assessment:0});

  const add=db.prepare("INSERT INTO students(stable_id,full_name,mobile,goal,status,profile_status,version) VALUES(?,?,?,?,?,'INVITED',1)");
  const first=Number(add.run('student-one','علی رضایی','09121111111','فیتنس','فعال').lastInsertRowid);
  const second=Number(add.run('student-two','مریم احمدی','09352222222','کاهش وزن','فعال').lastInsertRowid);
  const third=Number(add.run('student-three','رضا محمدی','09903333333','حجم','فعال').lastInsertRowid);
  const deleted=Number(add.run('student-deleted','حذف شده','09000000000','—','فعال').lastInsertRowid);
  db.prepare('UPDATE students SET deleted_at=CURRENT_TIMESTAMP WHERE id=?').run(deleted);

  result=studentService.getManagedStudents(db,{page:1,pageSize:20});
  assert.equal(result.items.length,3);const firstItem=result.items.find(item=>item.id===first);assert.equal(firstItem.management_status,'NEW');assert.match(firstItem.case_number,/^\d{6}$/);
  const byCase=studentService.getManagedStudents(db,{search:firstItem.case_number,page:1,pageSize:20});assert.equal(byCase.items.length,1);assert.equal(byCase.items[0].id,first);
  studentService.createInvite(db,first,30);
  result=studentService.getManagedStudents(db,{search:'091211',page:1,pageSize:20});
  assert.equal(result.items.length,1);assert.equal(result.items[0].id,first);assert.equal(result.items[0].management_status,'PROFILE_PENDING');

  db.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number,status,weight,submitted_at) VALUES('assessment-two',?,1,'SUBMITTED',70,CURRENT_TIMESTAMP)").run(second);
  db.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number,status,weight,submitted_at) VALUES('assessment-three',?,1,'PROGRAM_ASSIGNED',82,CURRENT_TIMESTAMP)").run(third);
  db.prepare("INSERT INTO training_programs(stable_id,student_id,assessment_id,program_number,title,status,start_date,end_date) VALUES('program-three',?,?,1,'برنامه فعال','ACTIVE','2099-01-01','2099-01-31')").run(third,2);

  const pending=studentService.getManagedStudents(db,{status:'PENDING_REVIEW',page:1,pageSize:20});
  assert.equal(pending.items.length,1);assert.equal(pending.items[0].id,second);
  const active=studentService.getManagedStudents(db,{status:'ACTIVE_PROGRAM',page:1,pageSize:20});
  assert.equal(active.items.length,1);assert.equal(active.items[0].id,third);assert.equal(active.items[0].current_program_status,'ACTIVE');
  const detail=studentService.getManagedStudentDetail(db,third);
  assert.equal(detail.assessments.length,1);assert.equal(detail.programs.length,1);assert.equal(detail.timeline.length,2);
  assert.equal(studentService.getStudentPrograms(db,deleted),null);assert.equal(studentService.getStudentInvites(db,deleted),null);

  const photosRoot=path.resolve(__dirname,'..','data','assessments');
  const docsRoot=path.resolve(__dirname,'..','data','assessment-documents');
  const purgeId=Number(add.run('student-purge','حذف کامل','09124444444','—','فعال').lastInsertRowid);
  const assessmentId=Number(db.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number,status,weight,submitted_at) VALUES('assessment-purge',?,1,'SUBMITTED',68,CURRENT_TIMESTAMP)").run(purgeId).lastInsertRowid);
  const photoDir=path.join(photosRoot,String(purgeId),String(assessmentId));
  fs.mkdirSync(photoDir,{recursive:true});
  const photoFile=path.join(photoDir,'front.jpg');
  fs.writeFileSync(photoFile,'photo');
  db.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path,original_filename,mime_type,size_bytes) VALUES('photo-purge',?,?,'front',?,'front.jpg','image/jpeg',5)").run(assessmentId,purgeId,photoFile);
  try{
    const remainingAssessment=Number(db.prepare("INSERT INTO body_assessments(stable_id,student_id,assessment_number,status,weight,submitted_at) VALUES('assessment-keep',?,2,'SUBMITTED',69,CURRENT_TIMESTAMP)").run(purgeId).lastInsertRowid);
    const remainingDir=path.join(photosRoot,String(purgeId),String(remainingAssessment));
    fs.mkdirSync(remainingDir,{recursive:true});
    const remainingFile=path.join(remainingDir,'side.jpg');
    fs.writeFileSync(remainingFile,'keep');
    db.prepare("INSERT INTO assessment_photos(stable_id,assessment_id,student_id,photo_type,storage_path,original_filename,mime_type,size_bytes) VALUES('photo-keep',?,?,'side',?,'side.jpg','image/jpeg',4)").run(remainingAssessment,purgeId,remainingFile);
    const assessmentPurged=studentService.purgeAssessment(db,assessmentId);
    assert.equal(assessmentPurged.purged,true);
    assert.equal(db.prepare('SELECT id FROM body_assessments WHERE id=?').get(assessmentId),undefined);
    assert.equal(db.prepare('SELECT id FROM body_assessments WHERE id=?').get(remainingAssessment).id,remainingAssessment);
    assert.equal(fs.existsSync(photoFile),false);
    assert.equal(fs.existsSync(remainingFile),true);
    const purged=studentService.purgeStudent(db,purgeId);
    assert.equal(purged.purged,true);
    assert.equal(db.prepare('SELECT id FROM students WHERE id=?').get(purgeId),undefined);
    assert.equal(db.prepare('SELECT id FROM body_assessments WHERE student_id=?').get(purgeId),undefined);
    assert.equal(db.prepare('SELECT id FROM assessment_photos WHERE student_id=?').get(purgeId),undefined);
    assert.equal(fs.existsSync(remainingFile),false);
  }finally{
    fs.rmSync(path.join(photosRoot,String(purgeId)),{recursive:true,force:true});
    fs.rmSync(path.join(docsRoot,String(purgeId)),{recursive:true,force:true});
  }

  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  db.close();
  console.log(JSON.stringify({ok:true,empty_state:true,search:true,filters:true,soft_delete:true,hard_purge:true,detail:true,timeline:true}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
