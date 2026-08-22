#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
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
  coachCookie=(landing.headers.get('set-cookie')||'').split(';')[0];
  assert.match(coachCookie,/^yasnafit_coach_session=/,'coach session cookie was not issued');
  await expectStatus(401,'/api/students');

  const suffix=Date.now();
  const s1=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`E2E Student A ${suffix}`,mobile:'09120000001',goal:'فیتنس'}});
  const s2=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`E2E Student B ${suffix}`,mobile:'09120000002',goal:'فیتنس'}});
  const inv1=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s1.id),expires_in_days:30}});
  const revoked=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s2.id),expires_in_days:30}});
  const inv2=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(s2.id),expires_in_days:0}});
  await expectStatus(404,`/api/student-portal/${revoked.token}`);
  await expectStatus(404,'/api/student-portal/not-a-real-secure-token-value');

  await ok(`/api/student-portal/${inv1.token}/profile`,{method:'PUT',body:{
    full_name:`E2E Student A ${suffix}`,mobile:'09120000001',height:175,weight:78,goal:'فیتنس',
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
  const traversal=await upload(inv1.token,a1.id,'other',png,'../escape.png','image/png');
  assert.equal(traversal.response.status,400,'traversal filename must be rejected');
  const crossUpload=await upload(inv2.token,a1.id,'front');
  assert.equal(crossUpload.response.status,403,'another student uploaded to this assessment');

  const submitted1=await ok(`/api/student-portal/${inv1.token}/submit`,{method:'POST'});
  assert.equal(submitted1.status,'SUBMITTED');
  const pending=await ok('/api/student-submissions',{coach:true});
  assert.ok(pending.some(x=>x.id===a1.id),'coach pending queue omitted assessment');
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
  const p1=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(s1.id),a1.id,1)});
  const active1=await ok(`/api/training-programs/${p1.id}/activate`,{method:'POST',coach:true});
  assert.equal(active1.status,'ACTIVE');
  const portal1=await ok(`/api/student-portal/${inv1.token}`);
  assert.equal(portal1.current_program.id,p1.id);
  assert.equal(portal1.current_program.program_data.days[0].data[0].movement_list[0].sets[0].rest_seconds,60);
  await expectStatus(409,`/api/training-programs/${p1.id}`,{method:'PUT',coach:true,body:programPayload(Number(s1.id),a1.id,1)});

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

  await ok(`/api/student-invites/${inv1.id}/revoke`,{method:'POST',coach:true});
  await expectStatus(404,`/api/student-portal/${inv1.token}`);
  const traversalResponse=await fetch(BASE+'/%2e%2e/server.js');
  assert.notEqual(traversalResponse.status,200,'encoded path traversal served source');

  const health=await ok('/api/health');
  assert.equal(health.exercises,2707);
  assert.equal(health.schema_version,'007_monthly_workflow_integrity');
  console.log(JSON.stringify({ok:true,student_id:s1.id,assessments:[a1.id,a2.id],programs:[p1.id,p2.id],checks:26},null,2));
})().catch(error=>{ console.error(error); process.exitCode=1; });
