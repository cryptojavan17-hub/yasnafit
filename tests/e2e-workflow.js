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
const immutableAssessment=item=>({assessment_number:item.assessment_number,weight:item.weight,height:item.height,waist:item.waist,goal:item.goal,student_note:item.student_note,body_photos_preference:item.body_photos_preference,submitted_at:item.submitted_at,photos:(item.photos||[]).map(photo=>photo.photo_type).sort()});
function programPayload(studentId,assessmentId,month){const start=new Date(Date.UTC(2026,month-1,1)),end=new Date(start.getTime()+29*86400000),iso=date=>date.toISOString().slice(0,10);return {title:`E2E monthly program ${month}`,student_id:studentId,assessment_id:assessmentId,status:'DRAFT',start_date:iso(start),end_date:iso(end),coach_note:`month ${month} notes`,program_data:{version:2,days:[{day_number:1,dayHash:hash('day'),focus:'full body',coachNote:'hydrate',isRestDay:false,data:[{exercise_system_id:1,exerciseSystemHash:hash('sys'),system_type:'normal',movement_list:[{exercise_id:1,movementHash:hash('mov'),description:'controlled tempo',sets:[{type:'REPEAT',count:12,weight:10,restSeconds:60,setHash:hash('set')}]}]}]}]}};}
async function upload(cookie,type,bytes=png,filename=`${type}.png`,mime='image/png'){
  const form=new FormData();form.append('photo',new Blob([bytes],{type:mime}),filename);form.append('photo_type',type);
  return request('/api/student/assessment/photos',{method:'POST',body:form,cookie});
}
async function completeStructuredAssessment(cookie,gender='male'){
  await ok('/api/student/assessment/sections/general',{method:'PUT',cookie,body:{goals:['fitness'],additional_notes:'structured assessment',gender}});
  await ok('/api/student/assessment/sections/measurements',{method:'PUT',cookie,body:{height:175,weight:70,around_the_arm:30,around_the_chest:90,around_the_belly:80,around_the_hips:95,around_the_leg:35,around_the_thigh:55,around_the_wrist:17}});
  await ok('/api/student/assessment/sections/medical',{method:'PUT',cookie,body:{has_disease:false,has_medication:false,has_injury:false,has_surgery:false,last_blood_test_notes:'',corrective_notes:'',items:[]}});
  await ok('/api/student/assessment/sections/sports',{method:'PUT',cookie,body:{average_daily_activity:'medium',practice_history:false,practice_now:false,practice_place:'gym',home_equipment:'',sessions_per_week:3,supplement_history:false,doping_history:''}});
  await ok('/api/student/assessment/sections/nutrition',{method:'PUT',cookie,body:{diet_type:'iranian',previous_diet:false,food_allergies:'',weight_changes:'',appetite_status:'low_eating',appetite_notes:'',defecation_problem:'none',breakfast:'',lunch:'',dinner:''}});
  await ok('/api/student/assessment/sections/habits',{method:'PUT',cookie,body:{smoking:false,smoking_details:'',alcohol:false,alcohol_details:''}});
  if(gender==='female')await ok('/api/student/assessment/sections/pregnancy',{method:'PUT',cookie,body:{childbirth_history:false,breastfeeding:false,formula_use:false,child_food_allergy:false}});
}
async function uploadDocument(cookie,type,bytes,filename,mime){const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),filename);form.append('document_type',type);return request('/api/student/assessment/documents',{method:'POST',body:form,cookie});}
async function loginWithInvitation(invite,mobile,newPassword=`Yasna${invite.case_number}Pass`){
  const shell=await request(invite.join_url);assert.equal(shell.response.status,200);const html=shell.data.toString('utf8');assert.match(html,/student-app\.js/);assert.doesNotMatch(html,/sidebar|coach-submissions\.js/);
  const inspected=await ok(`/api/student/join/${invite.token}`);assert.equal(inspected.valid,true);assert.equal(inspected.case_number,invite.case_number);
  await expectStatus(401,`/api/student/join/${invite.token}/accept`,{method:'POST'});
  const loggedIn=await request('/api/student/auth/login',{method:'POST',body:{mobile,password:invite.temporary_password,invitation_token:invite.token}});assert.equal(loggedIn.response.status,200,JSON.stringify(loggedIn.data));assert.equal(loggedIn.data.password_change_recommended,true);assert.equal(loggedIn.data.next_route,'/student/onboarding');
  const setCookie=loggedIn.response.headers.get('set-cookie')||'';assert.match(setCookie,/yasnafit_student_session=/);assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const cookie=setCookie.split(';')[0];
  assert.equal((await request('/api/student/dashboard',{cookie})).response.status,200);assert.equal((await request('/api/student/auth/login',{method:'POST',body:{mobile,password:invite.temporary_password}})).response.status,200);
  const changed=await ok('/api/student/auth/change-password',{method:'POST',cookie,body:{current_password:invite.temporary_password,new_password:newPassword,confirm_password:newPassword}});assert.equal(changed.password_state,'PERSONAL');
  await expectStatus(401,'/api/student/auth/login',{method:'POST',body:{mobile,password:invite.temporary_password}});
  return {cookie,next:changed.next_route,password:newPassword};
}
async function loginDirect(mobile,password){const response=await request('/api/student/auth/login',{method:'POST',body:{mobile,password}});assert.equal(response.response.status,200,JSON.stringify(response.data));assert.equal(response.data.password_change_recommended,false);return {cookie:(response.response.headers.get('set-cookie')||'').split(';')[0],next:response.data.next_route};}
async function onboard(cookie,{name,mobile,weight,preference='declined',photoTypes=[]}){
  await ok('/api/student/profile',{method:'PUT',cookie,body:{full_name:name,mobile,date_of_birth:'2000-01-01',height:175,weight,goal:'فیتنس',training_experience:'متوسط',preferred_location:'gym',limitations:'none',injuries:'none'}});
  await ok('/api/student/assessment',{method:'POST',cookie,body:{weight,height:175,waist:84,goal:'فیتنس',training_experience:'متوسط',limitations:'none',injuries:'none',student_note:'monthly assessment',body_photos_preference:preference}});
  await completeStructuredAssessment(cookie,'male');
  for(const type of photoTypes){const result=await upload(cookie,type);assert.equal(result.response.status,201,JSON.stringify(result.data));assert.equal('storage_path' in result.data.photo,false);}
  return ok('/api/student/assessment/submit',{method:'POST',cookie});
}
(async()=>{
  assert.equal((await fetch(BASE+'/')).status,401);assert.equal((await fetch(BASE+'/student/login')).status,200);await expectStatus(401,'/api/students');await expectStatus(401,'/student/dashboard');await expectStatus(401,'/api/student/me');
  const accessToken=process.env.YASNAFIT_COACH_TOKEN||fs.readFileSync(path.join(__dirname,'..','data','coach-access-token'),'utf8').trim();
  const access=await fetch(`${BASE}/coach-access/${accessToken}`,{redirect:'manual'});assert.equal(access.status,303);coachCookie=(access.headers.get('set-cookie')||'').split(';')[0];
  await expectStatus(401,'/api/student/me',{coach:true});
  const bankCategories=await ok('/api/categories/grouped',{coach:true});assert.ok(bankCategories.length>=1);const bankExercises=await ok(`/api/exercises?categoryId=${encodeURIComponent(bankCategories[0].id)}&status=active&page=0&pageSize=5`,{coach:true});assert.ok(bankExercises.items.length>=1);assert.ok(bankExercises.items[0].id);assert.ok(bankExercises.items[0].name_fa);

  const suffix=Date.now(),tail=String(suffix).slice(-8),mobileA=`091${tail}`,mobileB=`081${tail}`,mobileZero=`071${tail}`,mobileChange=`072${tail}`,mobileReject=`073${tail}`,mobileRevoke=`070${tail}`;
  const a=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Student A ${suffix}`,mobile:mobileA,goal:'فیتنس'}});
  const b=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Student B ${suffix}`,mobile:mobileB,goal:'فیتنس'}});await expectStatus(409,'/api/students',{method:'POST',coach:true,body:{full_name:'Duplicate Mobile',mobile:mobileA,goal:'test'}});assert.match(a.case_number,/^\d{6}$/);assert.match(b.case_number,/^\d{6}$/);assert.notEqual(a.case_number,b.case_number);
  await expectStatus(400,'/api/student-invites',{method:'POST',coach:true,body:{student_id:`${a.id} OR 1=1`}});
  const byCase=await ok(`/api/students?view=management&search=${a.case_number}`,{coach:true});assert.equal(byCase.items.length,1);assert.equal(byCase.items[0].case_number,a.case_number);assert.equal(byCase.items[0].goal,'');assert.equal(byCase.items[0].student_record_status,'فعال');
  const inviteA=a,inviteB=b;assert.equal(inviteA.temporary_password,mobileA.slice(-4));assert.equal(inviteB.temporary_password,mobileB.slice(-4));
  await expectStatus(404,'/api/student/join/not-a-valid-token-value');
  await expectStatus(404,`/api/student/join/${encodeURIComponent("' OR 1=1 --")}`);
  assert.notEqual((await fetch(BASE+'/join/..%2Fserver.js')).status,200);

  const sessionA=await loginWithInvitation(inviteA,mobileA),sessionB=await loginWithInvitation(inviteB,mobileB);
  const documentRoute=await request('/document/edit-document',{cookie:sessionA.cookie});assert.equal(documentRoute.response.status,200);assert.match(documentRoute.data.toString('utf8'),/assessment-wizard\.js/);
  assert.equal(sessionA.next,'/student/onboarding');assert.equal(sessionB.next,'/student/onboarding');
  assert.equal((await request(`/api/student/join/${inviteA.token}`)).response.status,200);assert.equal((await request('/api/student/auth/login',{method:'POST',body:{mobile:mobileA,password:sessionA.password,invitation_token:inviteA.token}})).response.status,200);assert.equal((await request('/api/student/auth/login',{method:'POST',body:{mobile:mobileA,password:sessionA.password,invitation_token:inviteA.token}})).response.status,200);await expectStatus(409,`/api/student/join/${inviteA.token}`);await expectStatus(409,'/api/student/auth/login',{method:'POST',body:{mobile:mobileA,password:sessionA.password,invitation_token:inviteA.token}});
  await expectStatus(410,`/api/student-portal/${inviteA.token}`);
  await expectStatus(401,'/api/dashboard',{cookie:sessionA.cookie});await expectStatus(403,'/api/student/profile',{method:'PUT',cookie:sessionA.cookie,headers:{Origin:'https://evil.example'},body:{full_name:'attacker'}});

  await ok('/api/student/profile',{method:'PUT',cookie:sessionA.cookie,body:{full_name:`Student A ${suffix}`,mobile:mobileA,telegram_id:'@yasnafit_test',instagram_id:'@yasnafit.test',height:175,weight:78,goal:'فیتنس',training_experience:'متوسط',preferred_location:'gym',limitations:'none',injuries:'none'}});const meA=await ok('/api/student/me',{cookie:sessionA.cookie});assert.equal(meA.student.telegram_id,'@yasnafit_test');assert.equal(meA.student.instagram_id,'@yasnafit.test');assert.equal(meA.student.case_number,a.case_number);
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{weight:78,height:175,waist:84,goal:'فیتنس',training_experience:'متوسط',student_note:'month one'}});
  await completeStructuredAssessment(sessionA.cookie,'male');
  await expectStatus(409,'/api/student/assessment/photos',{method:'POST',cookie:sessionA.cookie,body:new FormData()});
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{body_photos_preference:'willing'}});
  const fakePng=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('<script>alert(1)</script>'),Buffer.from([0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82])]);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.from('<svg/>'),'bad.svg','image/svg+xml')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',fakePng,'forged.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',png,'mismatch.jpg','image/jpeg')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.from('broken'),'broken.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',Buffer.alloc(5*1024*1024+1),'large.png','image/png')).response.status,400);
  assert.equal((await upload(sessionA.cookie,'other',png,'../escape.png','image/png')).response.status,400);
  for(const type of ['front','side','back','front_flex','back_flex'])assert.equal((await upload(sessionA.cookie,type)).response.status,201);
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');const medicalUpload=await uploadDocument(sessionA.cookie,'blood_test',pdf,'blood-test.pdf','application/pdf');assert.equal(medicalUpload.response.status,201,JSON.stringify(medicalUpload.data));const medicalDocumentId=medicalUpload.data.document.id;
  const activePdf=Buffer.from('%PDF-1.4\n1 0 obj<</JavaScript(test)>>endobj\n%%EOF');assert.equal((await uploadDocument(sessionA.cookie,'blood_test',activePdf,'active.pdf','application/pdf')).response.status,400);
  const submittedA1=await ok('/api/student/assessment/submit',{method:'POST',cookie:sessionA.cookie});assert.equal(submittedA1.assessment.status,'SUBMITTED');assert.equal(submittedA1.assessment.photos.length,5);assert.equal(submittedA1.assessment.body_photos_preference,'willing');
  await expectStatus(409,'/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{weight:77,height:175,goal:'فیتنس',training_experience:'متوسط'}});
  await onboard(sessionB.cookie,{name:`Student B ${suffix}`,mobile:mobileB,weight:67});

  const pendingCases=await ok('/api/student-submissions',{coach:true});assert.equal(pendingCases.find(item=>item.student_id===Number(a.id)).case_number,a.case_number);assert.equal(pendingCases.find(item=>item.student_id===Number(b.id)).case_number,b.case_number);
  const detailA1=await ok(`/api/students/${a.case_number}`,{coach:true}),detailB1=await ok(`/api/students/${b.case_number}`,{coach:true});assert.equal('password_hash' in detailA1.student,false);assert.equal('mobile_normalized' in detailA1.student,false);
  const assessmentA1=detailA1.current_assessment.id,assessmentB1=detailB1.current_assessment.id;const reviewPage=await request(`/assessments/${assessmentA1}`,{coach:true});assert.equal(reviewPage.response.status,200);assert.match(reviewPage.data.toString('utf8'),/coach-submissions\.js/);const coachAssessmentA=await ok(`/api/assessments/${assessmentA1}`,{coach:true});assert.equal(coachAssessmentA.student.case_number,a.case_number);assert.equal(coachAssessmentA.assessment.documents.length,1);assert.ok(coachAssessmentA.assessment_details.measurements);
  const snapshotA1=immutableAssessment(detailA1.current_assessment);assert.equal(detailA1.current_assessment.status,'SUBMITTED');assert.equal(detailB1.current_assessment.status,'SUBMITTED');assert.equal(detailB1.current_assessment.body_photos_preference,'declined');assert.equal(detailB1.current_assessment.photos.length,0);
  const photoA=detailA1.current_assessment.photos[0].id;
  await expectStatus(401,`/api/student-photos/${photoA}?token=${inviteA.token}`);
  assert.equal((await request(`/api/student-photos/${photoA}`,{cookie:sessionA.cookie})).response.status,200);
  await expectStatus(403,`/api/student-photos/${photoA}`,{cookie:sessionB.cookie});
  assert.equal((await request(`/api/student-documents/${medicalDocumentId}`,{cookie:sessionA.cookie})).response.status,200);await expectStatus(403,`/api/student-documents/${medicalDocumentId}`,{cookie:sessionB.cookie});await expectStatus(404,`/api/student/assessment/documents/${medicalDocumentId}`,{method:'DELETE',cookie:sessionA.cookie});
  await expectStatus(404,`/api/student/assessment/photos/${photoA}`,{method:'DELETE',cookie:sessionA.cookie});
  await expectStatus(404,'/api/student/assessment',{method:'DELETE',cookie:sessionA.cookie});
  await expectStatus(404,'/api/student/assessment/photos',{method:'POST',cookie:sessionA.cookie,body:new FormData()});

  await expectStatus(400,`/api/assessments/${assessmentA1}/approve`,{method:'POST',coach:true,body:{coach_note:'too early'}});
  await ok(`/api/assessments/${assessmentA1}/under-review`,{method:'POST',coach:true});await ok(`/api/assessments/${assessmentA1}/approve`,{method:'POST',coach:true,body:{coach_note:'A approved'}});const approvedContext=await ok(`/api/assessments/${assessmentA1}`,{coach:true});assert.equal(approvedContext.assessment.lifecycle_status,'APPROVED');assert.equal(approvedContext.student.id,Number(a.id));assert.ok(approvedContext.assessment_details.sports);const builderPage=await request(`/programs/exercise/form?student_id=${a.id}&assessment_id=${assessmentA1}`,{coach:true});assert.equal(builderPage.response.status,200);assert.match(builderPage.data.toString('utf8'),/program-builder\.js/);
  await ok(`/api/assessments/${assessmentB1}/under-review`,{method:'POST',coach:true});await ok(`/api/assessments/${assessmentB1}/approve`,{method:'POST',coach:true,body:{coach_note:'B approved'}});
  const draftA=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(a.id),assessmentA1,1)});
  const payloadB=programPayload(Number(b.id),assessmentB1,1);payloadB.title='E2E Student B program';
  const draftB=await ok('/api/training-programs',{method:'POST',coach:true,body:payloadB});const coachPrograms=await ok('/api/training-programs',{coach:true});assert.equal(coachPrograms.find(program=>program.id===draftA.id).student_case_number,a.case_number);assert.equal(coachPrograms.find(program=>program.id===draftB.id).student_case_number,b.case_number);
  assert.equal((await ok('/api/student/program',{cookie:sessionA.cookie})).program,null,'DRAFT leaked to Student A');
  assert.equal((await ok('/api/student/program',{cookie:sessionB.cookie})).program,null,'DRAFT leaked to Student B');
  await ok(`/api/training-programs/${draftA.id}/activate`,{method:'POST',coach:true});await ok(`/api/training-programs/${draftB.id}/activate`,{method:'POST',coach:true});
  const programA=await ok('/api/student/program',{cookie:sessionA.cookie}),programB=await ok('/api/student/program',{cookie:sessionB.cookie});
  assert.equal(programA.program.title,'E2E monthly program 1');assert.equal(programA.program.status,'ACTIVE');assert.equal(programA.program.program_data.days[0].systems[0].movements[0].sets[0].rest_seconds,60);
  assert.equal(programB.program.status,'ACTIVE');assert.equal(programB.program.title,'E2E Student B program');assert.equal('student_id' in programA.program,false);assert.equal('student_id' in programB.program,false);
  const dayRef=programA.program.program_data.days[0].day_ref,setRef=programA.program.program_data.days[0].systems[0].movements[0].sets[0].set_ref;assert.ok(dayRef&&setRef);
  const workoutStarted=await ok('/api/student/workouts',{method:'POST',cookie:sessionA.cookie,body:{day_ref:dayRef}});await ok(`/api/student/workouts/${workoutStarted.workout.stable_id}/results`,{method:'PUT',cookie:sessionA.cookie,body:{results:[{set_ref:setRef,actual_repetitions:'12',actual_weight:42.5,actual_duration_seconds:null,status:'COMPLETED',notes:'progress'}]}});await expectStatus(404,`/api/student/workouts/${workoutStarted.workout.stable_id}`,{cookie:sessionB.cookie});await ok(`/api/student/workouts/${workoutStarted.workout.stable_id}/complete`,{method:'POST',cookie:sessionA.cookie,body:{status:'COMPLETED'}});const coachPerformance=await ok(`/api/students/${a.case_number}/performance`,{coach:true});assert.equal(coachPerformance.sessions_completed,1);assert.equal(coachPerformance.completion_rate,100);
  const studentMessage=await ok('/api/student/messages',{method:'POST',cookie:sessionA.cookie,body:{body:'تمرین انجام شد'}});assert.equal(studentMessage.message.sender_type,'student');const coachMessage=await ok(`/api/students/${a.case_number}/messages`,{method:'POST',coach:true,body:{body:'عالی بود'}});assert.equal(coachMessage.message.sender_type,'coach');const messagesA=await ok('/api/student/messages',{cookie:sessionA.cookie});assert.equal(messagesA.messages.length>=2,true);
  const dashboardA=await ok('/api/student/dashboard',{cookie:sessionA.cookie});assert.equal(dashboardA.program.status,'ACTIVE');assert.equal(dashboardA.performance.sessions_completed,1);assert.ok(dashboardA.notifications.some(item=>item.type==='program_activate'||item.type==='assessment_approved'||item.type==='coach_message'));const coachNotifications=await ok('/api/coach/notifications',{coach:true});assert.ok(coachNotifications.notifications.some(item=>item.type==='assessment_submitted'));assert.ok(coachNotifications.notifications.some(item=>item.student_case_number===a.case_number));const clearedNotifications=await ok('/api/coach/notifications',{method:'DELETE',coach:true});assert.ok(clearedNotifications.cleared>0);assert.equal((await ok('/api/coach/notifications',{coach:true})).notifications.length,0);const auditA=await ok(`/api/students/${a.case_number}/audit`,{coach:true});assert.ok(auditA.events.some(item=>item.action==='workout.completed'));
  const assessmentViewA=await ok('/api/student/assessment',{cookie:sessionA.cookie});assert.equal(assessmentViewA.assessment.assessment_number,1);assert.equal(assessmentViewA.assessment.photos.length,5);
  await expectStatus(409,`/api/training-programs/${draftA.id}`,{method:'PUT',coach:true,body:programPayload(Number(a.id),assessmentA1,1)});

  // Month 2: the authenticated identity creates a new record; browser-supplied IDs are ignored.
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{student_id:b.id,assessment_id:assessmentA1,weight:76,height:175,waist:81,goal:'فیتنس',training_experience:'متوسط',student_note:'month two',body_photos_preference:'willing'}});
  await completeStructuredAssessment(sessionA.cookie,'male');
  assert.equal((await upload(sessionA.cookie,'front')).response.status,201);
  const declinedDraft=await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{body_photos_preference:'declined'}});assert.equal(declinedDraft.assessment.photos.length,0);
  await ok('/api/student/assessment',{method:'POST',cookie:sessionA.cookie,body:{body_photos_preference:'willing'}});assert.equal((await upload(sessionA.cookie,'front')).response.status,201);
  const submittedA2=await ok('/api/student/assessment/submit',{method:'POST',cookie:sessionA.cookie});assert.equal(submittedA2.assessment.photos.length,1);
  const detailA2=await ok(`/api/students/${a.case_number}`,{coach:true});assert.equal(detailA2.assessments.length,2);assert.deepEqual(immutableAssessment(detailA2.assessments[0]),snapshotA1);
  const assessmentA2=detailA2.current_assessment.id;await ok(`/api/assessments/${assessmentA2}/under-review`,{method:'POST',coach:true});await ok(`/api/assessments/${assessmentA2}/approve`,{method:'POST',coach:true,body:{coach_note:'A month two approved'}});
  const p2=await ok('/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(a.id),assessmentA2,2)});await ok(`/api/training-programs/${p2.id}/activate`,{method:'POST',coach:true});
  const historyA=await ok('/api/student/history',{cookie:sessionA.cookie});assert.equal(historyA.assessments.length,2);assert.equal(historyA.programs.length,2);assert.deepEqual(historyA.programs.map(item=>item.status),['COMPLETED','ACTIVE']);
  const historyB=await ok('/api/student/history',{cookie:sessionB.cookie});assert.equal(historyB.assessments.length,1);assert.equal(historyB.programs.length,1);

  // A willing student may submit zero photos; willingness is not a hidden requirement.
  const zero=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Zero photo willing ${suffix}`,mobile:mobileZero,goal:'test'}});
  const zeroInvite=zero;const zeroSession=await loginWithInvitation(zeroInvite,mobileZero);
  const zeroSubmitted=await onboard(zeroSession.cookie,{name:`Zero photo willing ${suffix}`,mobile:mobileZero,weight:72,preference:'willing',photoTypes:[]});assert.equal(zeroSubmitted.assessment.photos.length,0);assert.equal(zeroSubmitted.assessment.body_photos_preference,'willing');

  // Coach lifecycle: changes requested requires a note and can be resubmitted.
  const changeStudent=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Changes ${suffix}`,mobile:mobileChange,goal:'test'}});const changeInvite=changeStudent;const changeSession=await loginWithInvitation(changeInvite,mobileChange);await onboard(changeSession.cookie,{name:`Changes ${suffix}`,mobile:mobileChange,weight:73,preference:'declined'});let changeDetail=await ok(`/api/students/${changeStudent.case_number}`,{coach:true});const changeAssessment=changeDetail.current_assessment.id;await ok(`/api/assessments/${changeAssessment}/under-review`,{method:'POST',coach:true});await expectStatus(400,`/api/assessments/${changeAssessment}/request-changes`,{method:'POST',coach:true,body:{coach_note:''}});await ok(`/api/assessments/${changeAssessment}/request-changes`,{method:'POST',coach:true,body:{coach_note:'لطفاً وزن را بررسی کنید'}});await ok('/api/student/assessment',{method:'POST',cookie:changeSession.cookie,body:{weight:74}});await ok('/api/student/assessment/submit',{method:'POST',cookie:changeSession.cookie});changeDetail=await ok(`/api/students/${changeStudent.case_number}`,{coach:true});assert.equal(changeDetail.current_assessment.lifecycle_status,'SUBMITTED');

  // Coach lifecycle: rejected assessments cannot produce programs.
  const rejectStudent=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Rejected ${suffix}`,mobile:mobileReject,goal:'test'}});const rejectInvite=rejectStudent;const rejectSession=await loginWithInvitation(rejectInvite,mobileReject);await onboard(rejectSession.cookie,{name:`Rejected ${suffix}`,mobile:mobileReject,weight:75,preference:'declined'});const rejectDetail=await ok(`/api/students/${rejectStudent.case_number}`,{coach:true});const rejectedAssessment=rejectDetail.current_assessment.id;await ok(`/api/assessments/${rejectedAssessment}/under-review`,{method:'POST',coach:true});await expectStatus(400,`/api/assessments/${rejectedAssessment}/reject`,{method:'POST',coach:true,body:{coach_note:''}});const rejected=await ok(`/api/assessments/${rejectedAssessment}/reject`,{method:'POST',coach:true,body:{coach_note:'پرونده رد شد'}});assert.equal(rejected.lifecycle_status,'REJECTED');await expectStatus(400,'/api/training-programs',{method:'POST',coach:true,body:programPayload(Number(rejectStudent.id),rejectedAssessment,1)});

  // Revocation destroys sessions related to an invitation.
  const c=await ok('/api/students',{method:'POST',coach:true,body:{full_name:`Session revoke ${suffix}`,mobile:mobileRevoke,goal:'test'}});
  const inviteC=c;const sessionC=await loginWithInvitation(inviteC,mobileRevoke);
  await ok(`/api/student-invites/${inviteC.invitation_id}/revoke`,{method:'POST',coach:true});await expectStatus(401,'/api/student/me',{cookie:sessionC.cookie});

  const logout=await request('/api/student/logout',{method:'POST',cookie:sessionB.cookie});assert.equal(logout.response.status,200);assert.match(logout.response.headers.get('set-cookie')||'',/Max-Age=0/);
  await expectStatus(401,'/api/student/me',{cookie:sessionB.cookie});await expectStatus(401,'/student/dashboard',{cookie:sessionB.cookie});const reloggedB=await loginDirect(mobileB,sessionB.password);assert.ok(reloggedB.cookie);

  let rateLimited=false;for(let index=0;index<35;index++){const attempt=await request(`/api/student/join/${'A'.repeat(43)}`);if(attempt.response.status===429){rateLimited=true;break;}}assert.equal(rateLimited,true,'sensitive join endpoint was not rate limited');
  const versionInfo=await ok('/api/version');assert.deepEqual(versionInfo,{version:'0.9.0',name:'Yasnafit',environment:'development'});
  const releases=await ok('/api/releases');assert.deepEqual(releases.map(item=>item.version),['0.9.0','0.8.0','0.7.2','0.7.1','0.7.0','0.6.0','0.5.1','0.5.0','0.4.1','0.4.0','0.3.0','0.2.1','0.2.0','0.1.0']);
  const health=await ok('/api/health');assert.equal(health.exercises,2707);assert.equal(health.schema_version,'022_mobile_prefix_repair');
  for(const file of fs.readdirSync(path.join(__dirname,'..','public')).filter(name=>/\.(?:js|html|css)$/.test(name))){
    assert.equal(/\bv?\d+\.\d+\.\d+\b/.test(fs.readFileSync(path.join(__dirname,'..','public',file),'utf8')),false,`frontend hardcodes an application version in ${file}`);
  }
  const studentHtml=fs.readFileSync(path.join(__dirname,'..','public','student.html'),'utf8');assert.doesNotMatch(studentHtml,/sidebar|coach-submissions|src="\/app\.js"/);assert.match(studentHtml,/dir="rtl"/);
  console.log(JSON.stringify({ok:true,students:2,student_sessions:true,month_two:true,isolation:true,logout:true,application_version:versionInfo.version,releases:releases.length},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
