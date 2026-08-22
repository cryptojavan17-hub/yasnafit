#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const BASE=process.env.YASNAFIT_BASE_URL||'http://127.0.0.1:3020';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
let coachCookie='';
async function request(url,{method='GET',body,coach=false,cookie='',headers={}}={}){
  const h={...headers};if(coach&&coachCookie)h.Cookie=coachCookie;if(cookie)h.Cookie=cookie;
  let payload=body;if(body!==undefined&&!(body instanceof FormData)){h['Content-Type']='application/json';payload=JSON.stringify(body);}
  const response=await fetch(BASE+url,{method,headers:h,body:payload,redirect:'manual'});
  const type=response.headers.get('content-type')||'';const data=type.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
  return {response,data};
}
async function ok(url,options){const result=await request(url,options);assert.ok(result.response.ok,`${options?.method||'GET'} ${url}: ${result.response.status} ${JSON.stringify(result.data)}`);return result.data;}
async function expectStatus(status,url,options){const result=await request(url,options);assert.equal(result.response.status,status,`${options?.method||'GET'} ${url}: ${JSON.stringify(result.data)}`);return result.data;}
const hash=prefix=>prefix+Math.random().toString(36).slice(2,12)+Date.now().toString(36);
const immutableAssessment=item=>({assessment_number:item.assessment_number,weight:item.weight,height:item.height,waist:item.waist,goal:item.goal,student_note:item.student_note,submitted_at:item.submitted_at,photos:(item.photos||[]).map(photo=>photo.photo_type).sort()});
function programPayload(studentId,assessmentId,month){return {title:`E2E monthly program ${month}`,student_id:studentId,assessment_id:assessmentId,status:'DRAFT',start_date:`2026-${String(month).padStart(2,'0')}-01`,end_date:`2026-${String(month).padStart(2,'0')}-28`,coach_note:`month ${month} notes`,program_data:{version:2,days:[{day_number:1,dayHash:hash('day'),focus:'full body',coachNote:'hydrate',isRestDay:false,data:[{exercise_system_id:1,exerciseSystemHash:hash('sys'),system_type:'normal',movement_list:[{exercise_id:1,movementHash:hash('mov'),description:'controlled tempo',sets:[{type:'REPEAT',count:12,weight:10,restSeconds:60,setHash:hash('set')}]}]}]}]}};}
async function upload(cookie,type,bytes=png,filename=`${type}.png`,mime='image/png'){
  const form=new FormData();form.append('photo',new Blob([bytes],{type:mime}),filename);form.append('photo_type',type);
  return request('/api/student/assessment/photos',{method:'POST',body:form,cookie});
}
async function acceptInvitation(invite){
  const shell=await request(invite.join_url);assert.equal(shell.response.status,200);const html=shell.data.toString('utf8');assert.match(html,/student-app\.js/);assert.doesNotMatch(html,/sidebar|coach-submissions\.js/);
  const inspected=await ok(`/api/student/join/${invite.token}`);assert.equal(inspected.valid,true);
  const accepted=await request(`/api/student/join/${invite.token}/accept`,{method:'POST'});assert.equal(accepted.response.status,201,JSON.stringify(accepted.data));
  const setCookie=accepted.response.headers.get('set-cookie')||'';assert.match(setCookie,/yasnafit_student_session=/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
  return {cookie:setCookie.split(';')[0],next:accepted.data.next_route};
}
async function onboard(cookie,{name,mobile,weight}){
  await ok('/api/student/profile',{method:'PUT',cookie,body:{full_name:name,mobile,date_of_birth:'2000-01-01',height:175,weight,goal:'فیتنس',training_experience:'متوسط',preferred_location:'gym',limitations:'none',injuries:'none'}});
  await ok('/api/student/assessment',{method:'POST',cookie,body:{weight,height:175,waist:84,goal:'فیتنس',training_experience:'متوسط',limitations:'none',injuries:'none',student_note:'monthly assessment'}});
  for(const type of ['front','back','side']){const result=await upload(cookie,type);assert.equal(result.response.status,201,JSON.stringify(result.data));assert.equal('storage_path' in result.data.photo,false);}
  return ok('/api/student/assessment/submit',{method:'POST',cookie});
}
(async()=>{
  assert.equal((await fetch(BASE+'/')).status,401);await expectStatus(401,'/api/students');await expectStatus(401,'/student/dashboard');await expectStatus(401,'/api/student/me');
  const accessToken=process.env.YASNAFIT_COACH_TOKEN||fs.readFileSync(path.join(__dirname,'..','data','coach-access-token'),'utf8').trim();
  const access=await fetch(`${BASE}/coach-access/${accessToken}`,{redirect:'manual'});assert.equal(access.status,303);coachCookie=(access.headers.get('set-cookie')||'').split(';')[0];
  await expectStatus(401,'/api/student/me',{coach:true});

  const suffix=Date.now(),mobileA=`09${String(suffix).slice(-9)}`,mobileB=`08${String(suffix).slice(-9)}`;
  const a=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Student A ${suffix}`,mobile:mobileA,goal:'فیتنس'}});
  const b=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Student B ${suffix}`,mobile:mobileB,goal:'فیتنس'}});
  await expectStatus(400,'/api/student-invites',{method:'POST',coach:true,body:{student_id:`${a.id} OR 1=1`}});
  const inviteA=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(a.id),expires_in_days:30}});
  const inviteB=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(b.id),expires_in_days:30}});
  await expectStatus(404,'/api/student/join/not-a-valid-token-value');
  await expectStatus(404,`/api/student/join/${encodeURIComponent("' OR 1=1 --")}`);
  assert.notEqual((await fetch(BASE+'/join/..%2Fserver.js')).status,200);

  const sessionA=await acceptInvitation(inviteA),sessionB=await acceptInvitation(inviteB);
  assert.equal(sessionA.next,'/student/onboarding');assert.equal(sessionB.next,'/student/onboarding');
  await expectStatus(409,`/api/student/join/${inviteA.token}`);await expectStatus(409,`/api/student/join/${inviteA.token}/accept`,{method:'POST'});
  await expectStatus(410,`/api/student-portal/${inviteA.token}`);
  await expectStatus(401,'/api/dashboard',{cookie:sessionA.cookie});

  await ok('/api/student/profile',{method:'PUT',cookie:sessionA.cookie,body:{full_name:`Student A ${suffix}`,mobile:mobileA,height:175,weight:78,goal:'فیتنس',training_experience:'متوسط',preferred_location:'gym',limitations:'none',injuries:'none'}});
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{weight:78,height:175,waist:84,goal:'فیتنس',training_experience:'متوسط',student_note:'month one'}});
  for(const type of ['front','back'])assert.equal((await upload(sessionA.cookie,type)).response.status,201);
  await expectStatus(400,'/api/student/assessment/submit',{method:'POST',cookie:sessionA.cookie});
  const fakePng=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('<script>alert(1)</script>'),Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82])]);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.from('<svg/>'),'bad.svg','image/svg+xml')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',fakePng,'forged.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',png,'mismatch.jpg','image/jpeg')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.from('broken'),'broken.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.alloc(5*1024*1024+1),'large.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',png,'../escape.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'side')).response.status,201);
  const submittedA1=await ok('/api/student/assessment/submit',{method:'POST',cookie:sessionA.cookie});assert.equal(submittedA1.assessment.status,'SUBMITTED');
  await expectStatus(409,'/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{weight:77,height:175,goal:'فیتنس',training_experience:'متوسط'}});
  await onboard(sessionB.cookie,{name:`Student B ${suffix}`,mobile:mobileB,weight:67});

  const detailA1=await ok(`/api/students/${a.id}`,{coach:true}),detailB1=await ok(`/api/students/${b.id}`,{coach:true});
  const assessmentA1=detailA1.current_assessment.id,assessmentB1=detailB1.current_assessment.id;
  const snapshotA1=immutableAssessment(detailA1.current_assessment);assert.equal(detailA1.current_assessment.status,'SUBMITTED');assert.equal(detailB1.current_assessment.status,'SUBMITTED');
  const photoA=detailA1.current_assessment.photos[0].id;
  await expectStatus(401,`/api/student-photos/${photoA}?token=${inviteA.token}`);
  assert.equal((await request(`/api/student-photos/${photoA}`,{cookie:sessionA.cookie})).response.status,200);
  await expectStatus(403,`/api/student-photos/${photoA}`,{cookie:sessionB.cookie});
  await expectStatus(404,`/api/student/assessment/photos/${photoA}`,{method:'DELETE',cookie:sessionA.cookie});
  await expectStatus(404,'/api/student/assessment',{method:'DELETE',cookie:sessionA.cookie});
  await expectStatus(404,'/api/student/assessment/photos',{method:'POST',cookie:sessionA.cookie,body:new FormData()});

  await ok(`/api/assessments/${assessmentA1}/approve`,{method:'POST',coach:true,body:{coach_note:'A approved'}});
  await ok(`/api/assessments/${assessmentB1}/approve`,{method:'POST',coach:true,body:{coach_note:'B approved'}});
  const draftA=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(a.id),assessmentA1,1)});
  const payloadB=programPayload(Number(b.id),assessmentB1,1);payloadB.title='E2E Student B program';
  const draftB=await ok('/api/training-programs',{method:'POST',coach:true,body:payloadB});
  assert.equal((await ok('/api/student/program',{cookie:sessionA.cookie})).program,null,'DRAFT leaked to Student A');
  assert.equal((await ok('/api/student/program',{cookie:sessionB.cookie})).program,null,'DRAFT leaked to Student B');
  await ok(`/api/training-programs/${draftA.id}/activate`,{method:'POST',coach:true});await ok(`/api/training-programs/${draftB.id}/activate`,{method:'POST',coach:true});
  const programA=await ok('/api/student/program',{cookie:sessionA.cookie}),programB=await ok('/api/student/program',{cookie:sessionB.cookie});
  assert.equal(programA.program.title,'E2E monthly program 1');assert.equal(programA.program.status,'ACTIVE');assert.equal(programA.program.program_data.days[0].systems[0].movements[0].sets[0].rest_seconds,60);
  assert.equal(programB.program.status,'ACTIVE');assert.equal(programB.program.title,'E2E Student B program');assert.equal('student_id' in programA.program,false);assert.equal('student_id' in programB.program,false);
  const dashboardA=await ok('/api/student/dashboard',{cookie:sessionA.cookie});assert.equal(dashboardA.program.status,'ACTIVE');
  const assessmentViewA=await ok('/api/student/assessment',{cookie:sessionA.cookie});assert.equal(assessmentViewA.assessment.assessment_number,1);assert.equal(assessmentViewA.assessment.photos.length,3);
  await expectStatus(409,`/api/training-programs/${draftA.id}`,{method:'PUT',coach:true,body:programPayload(Number(a.id),assessmentA1,1)});

  // Month 2: the authenticated identity creates a new record; browser-supplied IDs are ignored.
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{student_id:b.id,assessment_id:assessmentA1,weight:76,height:175,waist:81,goal:'فیتنس',training_experience:'متوسط',student_note:'month two'}});
  for(const type of ['front','back','side'])assert.equal((await upload(sessionA.cookie,type)).response.status,201);
  await ok('/api/student/assessment/submit',{method:'POST',cookie:sessionA.cookie});
  const detailA2=await ok(`/api/students/${a.id}`,{coach:true});assert.equal(detailA2.assessments.length,2);assert.deepEqual(immutableAssessment(detailA2.assessments[0]),snapshotA1);
  const assessmentA2=detailA2.current_assessment.id;await ok(`/api/assessments/${assessmentA2}/approve`,{method:'POST',coach:true,body:{coach_note:'A month two approved'}});
  const p2=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(a.id),assessmentA2,2)});await ok(`/api/training-programs/${p2.id}/activate`,{method:'POST',coach:true});
  const historyA=await ok('/api/student/history',{cookie:sessionA.cookie});assert.equal(historyA.assessments.length,2);assert.equal(historyA.programs.length,2);assert.deepEqual(historyA.programs.map(item=>item.status),['COMPLETED','ACTIVE']);
  const historyB=await ok('/api/student/history',{cookie:sessionB.cookie});assert.equal(historyB.assessments.length,1);assert.equal(historyB.programs.length,1);

  // Revocation destroys sessions related to an invitation.
  const c=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Session revoke ${suffix}`,mobile:'07000000000',goal:'test'}});
  const inviteC=await ok('/api/student-invites',{method:'POST',coach:true,body:{student_id:Number(c.id),expires_in_days:30}});const sessionC=await acceptInvitation(inviteC);
  await ok(`/api/student-invites/${inviteC.id}/revoke`,{method:'POST',coach:true});await expectStatus(401,'/api/student/me',{cookie:sessionC.cookie});

  const logout=await request('/api/student/logout',{method:'POST',cookie:sessionB.cookie});assert.equal(logout.response.status,200);assert.match(logout.response.headers.get('set-cookie')||'',/Max-Age=0/);
  await expectStatus(401,'/api/student/me',{cookie:sessionB.cookie});await expectStatus(401,'/student/dashboard',{cookie:sessionB.cookie});

  const versionInfo=await ok('/api/version');assert.deepEqual(versionInfo,{version:'0.5.1',name:'Yasnafit',environment:'development'});
  const releases=await ok('/api/releases');assert.deepEqual(releases.map(item=>item.version),['0.5.1','0.5.0','0.4.1','0.4.0','0.3.0','0.2.1','0.2.0','0.1.0']);
  const health=await ok('/api/health');assert.equal(health.exercises,2707);assert.equal(health.schema_version,'012_onboarding_body_input_fix');
  for(const file of fs.readdirSync(path.join(__dirname,'..','public')).filter(name=>/\.(?:js|html|css)$/.test(name))){
    assert.equal(/\bv?\d+\.\d+\.\d+\b/.test(fs.readFileSync(path.join(__dirname,'..','public',file),'utf8')),false,`frontend hardcodes an application version in ${file}`);
  }
  const studentHtml=fs.readFileSync(path.join(__dirname,'..','public','student.html'),'utf8');assert.doesNotMatch(studentHtml,/sidebar|coach-submissions|src="\/app\.js"/);assert.match(studentHtml,/dir="rtl"/);
  console.log(JSON.stringify({ok:true,students:2,student_sessions:true,month_two:true,isolation:true,logout:true,application_version:versionInfo.version,releases:releases.length},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
