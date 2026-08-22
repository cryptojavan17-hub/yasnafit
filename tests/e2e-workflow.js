#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.YASNAFIT_BASE_URL || 'http://127.0.0.1:3020';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
let coachCookie = '';

async function request(path, {method='GET', body, coach=false, headers={}}={}){
  const h={...headers};
  if(coach && coachCookie) h.Cookie=coachCookie;
  let payload=body;
  if(body !== undefined && !(body instanceof FormData)){
    h['Content-Type']='application/json';
    payload=JSON.stringify(body);
  }
  const response=await fetch(BASE+path,{method,headers:h,body:payload,redirect:'manual'});
  const type=response.headers.get('content-type')||'';
  const data=type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return {response,data};
}
async function ok(path, options){
  const result=await request(path,options);
  assert.ok(result.response.ok, `${options?.method||'GET'} ${path}: ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function expectStatus(status,path,options){
  const result=await request(path,options);
  assert.equal(result.response.status,status,`${options?.method||'GET'} ${path}: ${JSON.stringify(result.data)}`);
  return result.data;
}
const hash=(prefix)=>prefix+Math.random().toString(36).slice(2,12)+Date.now().toString(36);
function programPayload(studentId, assessmentId, month){
  return {
    title:`E2E monthly program ${month}`, student_id:studentId, assessment_id:assessmentId,
    status:'DRAFT', start_date:`2026-${String(month).padStart(2,'0')}-01`, end_date:`2026-${String(month).padStart(2,'0')}-28`,
    coach_note:`month ${month} notes`, program_data:{version:2,days:[{
      day_number:1, dayHash:hash('day'), focus:'full body', coachNote:'hydrate', isRestDay:false,
      data:[{exercise_system_id:1,exerciseSystemHash:hash('sys'),system_type:'normal',movement_list:[{
        exercise_id:1,movementHash:hash('mov'),description:'controlled tempo',sets:[
          {type:'REPEAT',count:12,weight:10,restSeconds:60,setHash:hash('set')}
        ]
      }]}]
    }]}
  };
}
async function upload(token, assessmentId, type, bytes=png, filename=`${type}.png`, mime='image/png'){
  const form=new FormData();
  form.append('photo',new Blob([bytes],{type:mime}),filename);
  form.append('photo_type',type);
  form.append('assessment_id',String(assessmentId));
  return request(`/api/student-portal/${token}/photos`,{method:'POST',body:form});
}

(async()=>{
  const landing=await fetch(BASE+'/');
  assert.equal(landing.status,401,'coach dashboard shell was public');
  assert.equal(landing.headers.get('set-cookie'),null,'public dashboard minted a coach session without authentication');
  await expectStatus(401,'/api/students');
  await expectStatus(401,'/users-list');
  await expectStatus(401,'/coach-access/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  const accessToken=process.env.YASNAFIT_COACH_TOKEN || fs.readFileSync(path.join(__dirname,'..','data','coach-access-token'),'utf8').trim();
  const access=await fetch(`${BASE}/coach-access/${accessToken}`,{redirect:'manual',headers:{'X-Forwarded-Proto':'https'}});
  assert.equal(access.status,303,'valid coach bootstrap did not redirect');
  assert.equal(access.headers.get('location'),'/');
  assert.match(access.headers.get('set-cookie')||'',/; Secure(?:;|$)/,'HTTPS coach cookie was not marked Secure');
  coachCookie=(access.headers.get('set-cookie')||'').split(';')[0];
  assert.match(coachCookie,/^yasnafit_coach_session=/,'authenticated coach session cookie was not issued');

  const suffix=Date.now();
  const mobileA=`09${String(suffix).slice(-9)}`;
  const mobileB=`08${String(suffix).slice(-9)}`;
  const s1=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`E2E Student A ${suffix}`,mobile:mobileA,goal:'فیتنس'}});
  const s2=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`E2E Student B ${suffix}`,mobile:mobileB,goal:'فیتنس'}});
  const newStudentSearch=await ok(`/api/students?view=management&search=${encodeURIComponent(String(suffix))}&status=NEW&page=1&page_size=10`,{coach:true});
  assert.equal(newStudentSearch.items.length,2);assert.equal(newStudentSearch.items[0].management_status,'NEW');
  const mobileSearch=await ok(`/api/students?view=management&search=${mobileA}&page=1&page_size=10`,{coach:true});
  assert.equal(mobileSearch.items.length,1);assert.equal(mobileSearch.items[0].id,s1.id);
  await expectStatus(400,'/api/student-invites',{method:'POST',coach:true,body:{student_id:`${s1.id} OR 1=1`}});
  const inv1=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s1.id),expires_in_days:30}});
  const revoked=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s2.id),expires_in_days:30}});
  const inv2=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s2.id),expires_in_days:0}});
  await expectStatus(404,`/api/student-portal/${revoked.token}`);
  await expectStatus(404,'/api/student-portal/not-a-real-secure-token-value');

  await ok(`/api/student-portal/${inv1.token}/profile`,{method:'PUT',body:{
    full_name:`E2E Student A ${suffix}`,mobile:mobileA,height:175,weight:78,goal:'فیتنس',
    training_experience:'متوسط',preferred_location:'gym',limitations:'none',injuries:'none'
  }});
  const a1=await ok(`/api/student-portal/${inv1.token}/assessment`,{method:'POST',body:{weight:78,height:175,waist:84,goal:'فیتنس',training_experience:'متوسط',student_note:'month one'}});
  assert.equal(a1.assessment_number,1);

  for(const type of ['front','back']){
    const result=await upload(inv1.token,a1.id,type);
    assert.equal(result.response.status,201,JSON.stringify(result.data));
    assert.equal('storage_path' in result.data.photos[0],false,'filesystem path leaked');
  }
  await expectStatus(400,`/api/student-portal/${inv1.token}/submit`,{method:'POST'});
  const sideUpload=await upload(inv1.token,a1.id,'side');
  assert.equal(sideUpload.response.status,201,JSON.stringify(sideUpload.data));
  const invalid=await upload(inv1.token,a1.id,'other',Buffer.from('<svg onload=alert(1)>'),'bad.svg','image/svg+xml');
  assert.equal(invalid.response.status,400,'SVG upload must be rejected');
  const fakePng=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('<script>alert(1)</script>'),Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82])]);
  const forged=await upload(inv1.token,a1.id,'other',fakePng,'forged.png','image/png');
  assert.equal(forged.response.status,400,'signature/trailer-only forged PNG must be rejected');
  const traversal=await upload(inv1.token,a1.id,'other',png,'../escape.png','image/png');
  assert.equal(traversal.response.status,400,'traversal filename must be rejected');
  const crossUpload=await upload(inv2.token,a1.id,'front');
  assert.equal(crossUpload.response.status,403,'another student uploaded to this assessment');

  const submitted1=await ok(`/api/student-portal/${inv1.token}/submit`,{method:'POST'});
  assert.equal(submitted1.status,'SUBMITTED');
  const pending=await ok('/api/student-submissions',{coach:true});
  assert.ok(pending.some(x=>x.id===a1.id),'coach pending queue omitted assessment');
  const managementPending=await ok('/api/students?view=management&status=PENDING_REVIEW&page=1&page_size=100',{coach:true});
  assert.ok(managementPending.items.some(student=>student.id===s1.id),'My Students did not show the submitted assessment as pending review');
  const studentDetailPending=await ok(`/api/students/${s1.id}`,{coach:true});
  assert.equal(studentDetailPending.current_assessment.id,a1.id);assert.equal(studentDetailPending.assessments.length,1);
  const detail1=await ok(`/api/assessments/${a1.id}`,{coach:true});
  assert.equal(detail1.assessment.photos.length,3);
  const photoId=detail1.assessment.photos[0].id;
  assert.equal('storage_path' in detail1.assessment.photos[0],false,'coach JSON leaked storage path');
  await expectStatus(401,`/api/student-photos/${photoId}`);
  const ownPhoto=await request(`/api/student-photos/${photoId}?token=${encodeURIComponent(inv1.token)}`);
  assert.equal(ownPhoto.response.status,200);
  assert.equal(ownPhoto.response.headers.get('x-content-type-options'),'nosniff');
  await expectStatus(403,`/api/student-photos/${photoId}?token=${encodeURIComponent(inv2.token)}`);
  const coachPhoto=await request(`/api/student-photos/${photoId}`,{coach:true});
  assert.equal(coachPhoto.response.status,200);
  await expectStatus(404,`/api/student-portal/${inv1.token}/photos/${photoId}`,{method:'DELETE'});

  await ok(`/api/assessments/${a1.id}/under-review`,{method:'POST',coach:true});
  const approved1=await ok(`/api/assessments/${a1.id}/approve`,{method:'POST',coach:true,body:{coach_note:'approved month one'}});
  assert.equal(approved1.status,'APPROVED');
  const invalidDay=programPayload(Number(s1.id),a1.id,1);
  invalidDay.program_data.days[0].day_number=31;
  await expectStatus(400,'/api/training-programs',{method:'POST',coach:true,body:invalidDay});
  const invalidExercise=programPayload(Number(s1.id),a1.id,1);
  invalidExercise.program_data.days[0].data[0].movement_list[0].exercise_id=999999999;
  await expectStatus(400,'/api/training-programs',{method:'POST',coach:true,body:invalidExercise});
  const invalidRest=programPayload(Number(s1.id),a1.id,1);
  invalidRest.program_data.days[0].data[0].movement_list[0].sets[0].restSeconds=-1;
  await expectStatus(400,'/api/training-programs',{method:'POST',coach:true,body:invalidRest});
  const p1=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(s1.id),a1.id,1)});
  const active1=await ok(`/api/training-programs/${p1.id}/activate`,{method:'POST',coach:true});
  assert.equal(active1.status,'ACTIVE');
  const portal1=await ok(`/api/student-portal/${inv1.token}`);
  assert.equal(portal1.current_program.id,p1.id);
  assert.equal(portal1.current_program.program_data.days[0].data[0].movement_list[0].sets[0].rest_seconds,60);
  const managementActive=await ok(`/api/students?view=management&search=${encodeURIComponent(`E2E Student A ${suffix}`)}&page=1&page_size=10`,{coach:true});
  assert.equal(managementActive.items[0].current_program_id,p1.id);assert.equal(managementActive.items[0].current_program_status,'ACTIVE');
  await expectStatus(409,`/api/training-programs/${p1.id}`,{method:'PUT',coach:true,body:programPayload(Number(s1.id),a1.id,1)});
  await expectStatus(409,`/api/training-programs/${p1.id}`,{method:'DELETE',coach:true});

  const a2=await ok(`/api/student-portal/${inv1.token}/assessment`,{method:'POST',body:{weight:76,height:175,waist:81,goal:'فیتنس',training_experience:'متوسط',student_note:'month two'}});
  assert.equal(a2.assessment_number,2);
  for(const type of ['front','back','side']){
    const result=await upload(inv1.token,a2.id,type);
    assert.equal(result.response.status,201,JSON.stringify(result.data));
  }
  await ok(`/api/student-portal/${inv1.token}/submit`,{method:'POST'});
  await ok(`/api/assessments/${a2.id}/approve`,{method:'POST',coach:true,body:{coach_note:'approved month two'}});
  const p2=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(s1.id),a2.id,2)});
  await ok(`/api/training-programs/${p2.id}/activate`,{method:'POST',coach:true});

  const timeline=await ok(`/api/students/${s1.id}/timeline`,{coach:true});
  assert.equal(timeline.assessments.length,2,'assessment history was overwritten');
  assert.equal(timeline.programs.length,2,'program history was overwritten');
  assert.ok(timeline.timeline.filter(x=>x.type==='assessment').length===2);
  const programs=timeline.programs.sort((a,b)=>a.program_number-b.program_number);
  assert.equal(programs[0].status,'COMPLETED');
  assert.equal(programs[1].status,'ACTIVE');
  const portal2=await ok(`/api/student-portal/${inv1.token}`);
  assert.equal(portal2.current_program.id,p2.id);
  assert.equal(portal2.assessments.length,2);
  assert.equal(portal2.programs.length,2);
  assert.ok(!portal2.programs.some(p=>p.status==='DRAFT'),'student saw a draft');
  const finalStudentDetail=await ok(`/api/students/${s1.id}`,{coach:true});
  assert.equal(finalStudentDetail.assessments.length,2);assert.equal(finalStudentDetail.programs.length,2);
  assert.equal(finalStudentDetail.timeline.filter(item=>item.type==='assessment').length,2);
  assert.equal(finalStudentDetail.timeline.filter(item=>item.type==='program').length,2);
  const studentPrograms=await ok(`/api/students/${s1.id}/programs`,{coach:true});
  assert.deepEqual(studentPrograms.map(program=>program.status),['COMPLETED','ACTIVE']);
  const studentInvites=await ok(`/api/students/${s1.id}/invites`,{coach:true});
  assert.ok(studentInvites.length>=1);assert.equal('token_hash' in studentInvites[0],false);

  await ok(`/api/student-invites/${inv1.id}/revoke`,{method:'POST',coach:true});
  await expectStatus(404,`/api/student-portal/${inv1.token}`);
  await expectStatus(404,'/api/students/999999999',{coach:true});
  await expectStatus(404,'/api/students/not-a-number',{coach:true});
  const disposable=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`E2E Deleted ${suffix}`,mobile:'09000000000',goal:'test'}});
  await ok(`/api/students/${disposable.id}`,{method:'DELETE',coach:true});
  await expectStatus(404,`/api/students/${disposable.id}`,{coach:true});
  const deletedSearch=await ok(`/api/students?view=management&search=${encodeURIComponent(`E2E Deleted ${suffix}`)}&page=1&page_size=10`,{coach:true});
  assert.equal(deletedSearch.items.length,0);
  const traversalResponse=await fetch(BASE+'/%2e%2e/server.js');
  assert.notEqual(traversalResponse.status,200,'encoded path traversal served source');

  const versionInfo=await ok('/api/version');
  assert.deepEqual(versionInfo,{version:'0.4.0',name:'Yasnafit',environment:'development'});
  const releases=await ok('/api/releases');
  assert.deepEqual(releases.map(release=>release.version),['0.4.0','0.3.0','0.2.1','0.2.0','0.1.0']);
  assert.ok(releases.every(release=>release.changes && Array.isArray(release.changes.features)));
  assert.equal(releases.filter(release=>release.is_current).length,1);
  const currentRelease=await ok('/api/releases/0.4.0');
  assert.equal(currentRelease.title,'Complete My Students CRM');
  assert.equal(currentRelease.is_current,true);
  await expectStatus(404,'/api/releases/9.9.9');

  const coreSource=fs.readFileSync(path.join(__dirname,'..','public','core.js'),'utf8');
  const appSource=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const studentsSource=fs.readFileSync(path.join(__dirname,'..','public','students.js'),'utf8');
  const releaseSource=fs.readFileSync(path.join(__dirname,'..','public','releases.js'),'utf8');
  assert.match(appSource,/renderStudentsPage/,'/users-list is not delegated to the real student CRM renderer');
  assert.match(studentsSource,/view:'management'/,'student CRM is not connected to the management API');
  assert.match(studentsSource,/هنوز شاگردی ثبت نشده است/,'student CRM empty state is missing');
  assert.doesNotMatch(coreSource,/if\(route==='\/users-list'\)\{/,'legacy competing users-list renderer still exists');
  assert.match(coreSource,/api\/version/,'dashboard does not load the central version API');
  assert.match(coreSource,/dashboard-version/,'dashboard version display is missing');
  assert.match(releaseSource,/api\/releases/,'release history UI is not connected to the releases API');
  for(const file of fs.readdirSync(path.join(__dirname,'..','public')).filter(name=>/\.(?:js|html|css)$/.test(name))){
    const source=fs.readFileSync(path.join(__dirname,'..','public',file),'utf8');
    assert.equal(/\bv?\d+\.\d+\.\d+\b/.test(source),false,`frontend hardcodes an application-like version in ${file}`);
  }

  const health=await ok('/api/health');
  assert.equal(health.exercises,2707);
  assert.equal(health.schema_version,'009_my_students_crm_release');
  console.log(JSON.stringify({ok:true,student_id:s1.id,assessments:[a1.id,a2.id],programs:[p1.id,p2.id],application_version:versionInfo.version,releases:releases.length},null,2));
})().catch(error=>{ console.error(error); process.exitCode=1; });
