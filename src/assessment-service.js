'use strict';
const crypto=require('crypto');
const EDITABLE=['DRAFT','CHANGES_REQUESTED'];
const GOALS=['weight_loss','weight_gain','fitness','maintenance','muscle_gain','fat_loss','competition'];
const ACTIVITY=['low','medium','high'];
const PLACE=['gym','home'];
const DIET=['iranian','professional'];
const APPETITE=['low_eating','grazing','overeating','emotional_overeating','anorexia'];
const DEFECATION=['none','constipation','diarrhea','difficult_defecation'];
const CATALOGS={
  corrective:['اسکولیوز','کیفوز','لوردوز','سر به جلو','شانه‌های نابرابر','تیلت لگن','نابرابری پاها','زانوی ضربدری','زانوی پرانتزی','پای پرانتزی'],
  injuries:{'ستون فقرات':['دیسک کمر','فتق دیسک','شکستگی'],'زانو':['پارگی ACL/PCL','آسیب مینیسک','دررفتگی'],'شانه':['روتاتورکاف','دررفتگی','ایمپینجمنت'],'آرنج':['دررفتگی','شکستگی'],'مچ پا':['پیچ خوردگی','شکستگی'],'مچ و دست':['پیچ خوردگی','شکستگی']},
  surgeries:{'ستون فقرات':['جراحی دیسک','فیوژن'],'لگن/ران':['تعویض مفصل','ترمیم شکستگی'],'زانو':['بازسازی رباط','ترمیم مینیسک'],'شانه':['ترمیم روتاتورکاف','تثبیت مفصل'],'عمومی':['آپاندیس','سایر']},
  diseases:{'قلب و عروق':['فشار خون','بیماری قلبی'],'ریه':['آسم','بیماری مزمن ریه'],'سیستم عصبی':['صرع','اختلال عصبی'],'متابولیک':['دیابت','اختلال تیروئید']}
};
function uuid(){return crypto.randomUUID?crypto.randomUUID():crypto.randomBytes(16).toString('hex');}
function bool(value,name,required=false){if(value===undefined||value===null||value===''){if(required)throw new Error(`${name} الزامی است`);return null;}if(value===true||value===1||value==='1'||value==='yes')return 1;if(value===false||value===0||value==='0'||value==='no')return 0;throw new Error(`${name} نامعتبر است`);}
function text(value,name,max=4000,required=false){const output=String(value??'').trim();if(required&&!output)throw new Error(`${name} الزامی است`);if(output.length>max)throw new Error(`${name} طولانی است`);return output;}
function normalizeLocalizedNumber(value){return String(value??'').trim().replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[٫,\/]/g,'.').replace(/٬/g,'').replace(/\s+/g,'');}
function number(value,name,min,max,required=false){if(value===undefined||value===null||value===''){if(required)throw new Error(`${name} الزامی است`);return null;}const output=Number(normalizeLocalizedNumber(value));if(!Number.isFinite(output)||output<min||output>max)throw new Error(`${name} باید عددی بین ${min} و ${max} باشد`);return output;}
function editableAssessment(db,id,studentId){const row=db.prepare('SELECT * FROM body_assessments WHERE id=? AND student_id=? AND deleted_at IS NULL').get(id,studentId);if(!row)throw new Error('ارزیابی پیدا نشد');const lifecycle=row.lifecycle_status||(['PROFILE_INCOMPLETE','ASSESSMENT_PENDING'].includes(row.status)?'DRAFT':row.status);if(!EDITABLE.includes(lifecycle))throw new Error('ارزیابی پس از ارسال قابل ویرایش نیست');return row;}
function upsert(db,table,assessmentId,values){const columns=Object.keys(values),marks=columns.map(()=>'?').join(',');const updates=columns.map(column=>`${column}=excluded.${column}`).join(',');db.prepare(`INSERT INTO ${table}(assessment_id,${columns.join(',')},updated_at) VALUES(?,${marks},CURRENT_TIMESTAMP) ON CONFLICT(assessment_id) DO UPDATE SET ${updates},updated_at=CURRENT_TIMESTAMP`).run(assessmentId,...columns.map(column=>values[column]));}
function saveSection(db,assessmentId,studentId,section,data={}){
  editableAssessment(db,assessmentId,studentId);db.exec('BEGIN');
  try{
    if(section==='general'){
      let goals=Array.isArray(data.goals)?[...new Set(data.goals)]:[];if(goals.includes('competition'))goals=['competition'];if(!goals.length||goals.some(goal=>!GOALS.includes(goal)))throw new Error('حداقل یک هدف معتبر انتخاب کنید');
      db.prepare('DELETE FROM assessment_goals WHERE assessment_id=?').run(assessmentId);const insert=db.prepare('INSERT INTO assessment_goals(stable_id,assessment_id,goal_code) VALUES(?,?,?)');for(const goal of goals)insert.run(uuid(),assessmentId,goal);
      db.prepare('UPDATE body_assessments SET goal=?,student_note=?,draft_saved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?').run(goals.join(','),text(data.additional_notes,'توضیحات'),assessmentId);
      if(data.gender!==undefined){if(!['female','male','unspecified'].includes(data.gender))throw new Error('جنسیت نامعتبر است');db.prepare('UPDATE students SET gender=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?').run(data.gender,studentId);}
    }else if(section==='measurements'){
      const values={height:number(data.height,'قد',100,250,true),weight:number(data.weight,'وزن',20,300,true),around_the_arm:number(data.around_the_arm,'دور بازو',10,100),around_the_chest:number(data.around_the_chest,'دور سینه',30,250),around_the_belly:number(data.around_the_belly,'دور شکم',30,250),around_the_hips:number(data.around_the_hips,'دور باسن',30,250),around_the_leg:number(data.around_the_leg,'دور ساق',10,120),around_the_thigh:number(data.around_the_thigh,'دور ران',20,150),around_the_wrist:number(data.around_the_wrist,'دور مچ',5,50)};upsert(db,'assessment_measurements',assessmentId,values);db.prepare('UPDATE body_assessments SET height=?,weight=?,chest=?,waist=?,hips=?,draft_saved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?').run(values.height,values.weight,values.around_the_chest,values.around_the_belly,values.around_the_hips,assessmentId);
    }else if(section==='medical'){
      const hasDisease=bool(data.has_disease,'سابقه بیماری',true),hasMedication=bool(data.has_medication,'سابقه دارو',true),hasInjury=bool(data.has_injury,'سابقه آسیب',true),hasSurgery=bool(data.has_surgery,'سابقه جراحی',true);
      const values={has_disease:hasDisease,disease_details:text(data.disease_details,'شرح بیماری',4000,hasDisease===1),has_medication:hasMedication,medication_details:text(data.medication_details,'شرح دارو',4000,hasMedication===1),has_injury:hasInjury,injury_details:text(data.injury_details,'شرح آسیب',4000,hasInjury===1),has_surgery:hasSurgery,surgery_details:text(data.surgery_details,'شرح جراحی',4000,hasSurgery===1),last_blood_test_notes:text(data.last_blood_test_notes,'آزمایش خون'),corrective_notes:text(data.corrective_notes,'ناهنجاری')};upsert(db,'assessment_medical_history',assessmentId,values);
      db.prepare('DELETE FROM assessment_medical_items WHERE assessment_id=?').run(assessmentId);const insert=db.prepare('INSERT INTO assessment_medical_items(stable_id,assessment_id,item_kind,category,item_name,notes) VALUES(?,?,?,?,?,?)');for(const item of (Array.isArray(data.items)?data.items:[])){if(!['injury','surgery','disease','corrective'].includes(item.kind))throw new Error('نوع سابقه پزشکی نامعتبر است');insert.run(uuid(),assessmentId,item.kind,text(item.category,'دسته',100,true),text(item.name,'عنوان',150,true),text(item.notes,'یادداشت',1000));}
    }else if(section==='sports'){
      if(!ACTIVITY.includes(data.average_daily_activity))throw new Error('فعالیت روزانه نامعتبر است');const practiceHistory=bool(data.practice_history,'سابقه تمرین',true),practiceNow=bool(data.practice_now,'تمرین فعلی',true),supplement=bool(data.supplement_history,'سابقه مکمل',true);if(data.practice_place&&!PLACE.includes(data.practice_place))throw new Error('محل تمرین نامعتبر است');const sessions=number(data.sessions_per_week,'جلسات تمرین',3,5),historyDetails=text(data.practice_history_details,'شرح سابقه',4000,practiceHistory===1);upsert(db,'assessment_sports_history',assessmentId,{average_daily_activity:data.average_daily_activity,practice_history:practiceHistory,practice_history_details:historyDetails,practice_duration:text(data.practice_duration,'مدت تمرین',500,practiceHistory===1),sport_discipline:text(data.sport_discipline,'رشته',500,practiceHistory===1),practice_now:practiceNow,current_practice_details:text(data.current_practice_details,'شرح تمرین فعلی',4000,practiceNow===1),practice_place:data.practice_place||null,home_equipment:text(data.home_equipment,'تجهیزات منزل',500),sessions_per_week:sessions,supplement_history:supplement,supplement_details:text(data.supplement_details,'شرح مکمل',2000,supplement===1),doping_history:text(data.doping_history,'سابقه دوپینگ')});db.prepare('UPDATE body_assessments SET training_experience=? WHERE id=?').run(practiceHistory?historyDetails:'بدون سابقه تمرین',assessmentId);
    }else if(section==='nutrition'){
      if(!DIET.includes(data.diet_type))throw new Error('نوع رژیم نامعتبر است');const previous=bool(data.previous_diet,'رژیم قبلی',true);if(data.appetite_status&&!APPETITE.includes(data.appetite_status))throw new Error('وضعیت اشتها نامعتبر است');if(data.defecation_problem&&!DEFECATION.includes(data.defecation_problem))throw new Error('وضعیت دفع نامعتبر است');upsert(db,'assessment_nutrition',assessmentId,{diet_type:data.diet_type,previous_diet:previous,previous_diet_duration:text(data.previous_diet_duration,'مدت رژیم',500,previous===1),previous_diet_type:text(data.previous_diet_type,'نوع رژیم قبلی',500,previous===1),previous_diet_notes:text(data.previous_diet_notes,'شرح رژیم قبلی'),food_allergies:text(data.food_allergies,'حساسیت غذایی'),weight_changes:text(data.weight_changes,'تغییرات وزن'),appetite_status:data.appetite_status||null,appetite_notes:text(data.appetite_notes,'توضیح اشتها'),defecation_problem:data.defecation_problem||null,breakfast:text(data.breakfast,'صبحانه'),lunch:text(data.lunch,'نهار'),dinner:text(data.dinner,'شام')});
    }else if(section==='habits'){
      const smoking=bool(data.smoking,'مصرف دخانیات',true),alcohol=bool(data.alcohol,'مصرف الکل',true);upsert(db,'assessment_habits',assessmentId,{smoking,smoking_details:text(data.smoking_details,'شرح دخانیات',2000,smoking===1),alcohol,alcohol_details:text(data.alcohol_details,'شرح الکل',2000,alcohol===1)});
    }else if(section==='pregnancy'){
      const student=db.prepare('SELECT gender FROM students WHERE id=?').get(studentId);if(student?.gender!=='female')throw new Error('این بخش فقط برای شاگرد خانم فعال است');const childbirth=bool(data.childbirth_history,'سابقه زایمان',true),breastfeeding=bool(data.breastfeeding,'شیردهی',true),formula=bool(data.formula_use,'شیر خشک',true),allergy=bool(data.child_food_allergy,'حساسیت کودک',true);upsert(db,'assessment_pregnancy',assessmentId,{childbirth_history:childbirth,childbirth_count:number(data.childbirth_count,'تعداد زایمان',1,20,childbirth===1),childbirth_type:childbirth?text(data.childbirth_type,'نوع زایمان',100,true):'',childbirth_notes:text(data.childbirth_notes,'شرح زایمان'),breastfeeding,breastfeeding_notes:text(data.breastfeeding_notes,'شرح شیردهی',2000,breastfeeding===1),child_age_months:number(data.child_age_months,'سن کودک',0,60,breastfeeding===1),formula_use:formula,formula_type:text(data.formula_type,'نوع شیر خشک',500,formula===1),formula_amount:text(data.formula_amount,'مقدار شیر خشک',500,formula===1),formula_frequency:text(data.formula_frequency,'دفعات شیر خشک',500,formula===1),child_food_allergy:allergy,child_food_allergy_notes:text(data.child_food_allergy_notes,'حساسیت کودک',2000,allergy===1)});
    }else throw new Error('بخش ارزیابی نامعتبر است');
    db.prepare('UPDATE body_assessments SET draft_saved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(assessmentId);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return getDetails(db,assessmentId);
}
function getDetails(db,assessmentId){
  const one=table=>db.prepare(`SELECT * FROM ${table} WHERE assessment_id=?`).get(assessmentId)||null;
  return {goals:db.prepare('SELECT goal_code FROM assessment_goals WHERE assessment_id=? ORDER BY id').all(assessmentId).map(item=>item.goal_code),measurements:one('assessment_measurements'),medical:one('assessment_medical_history'),medical_items:db.prepare('SELECT item_kind AS kind,category,item_name AS name,notes FROM assessment_medical_items WHERE assessment_id=? ORDER BY id').all(assessmentId),sports:one('assessment_sports_history'),nutrition:one('assessment_nutrition'),habits:one('assessment_habits'),pregnancy:one('assessment_pregnancy')};
}
function validateForSubmission(db,assessment,student){
  const details=getDetails(db,assessment.id),errors=[];
  if(!details.goals.length)errors.push('هدف دوره تکمیل نشده است');
  if(!details.measurements)errors.push('اندازه‌های بدنی تکمیل نشده است');
  if(!details.medical)errors.push('سوابق پزشکی تکمیل نشده است');
  if(!details.sports)errors.push('سوابق ورزشی تکمیل نشده است');
  if(!details.nutrition)errors.push('سوابق تغذیه تکمیل نشده است');
  if(!details.habits)errors.push('عادات شخصی تکمیل نشده است');
  if(student?.gender==='female'&&!details.pregnancy)errors.push('بخش بارداری و زایمان تکمیل نشده است');
  return errors;
}
module.exports={GOALS,CATALOGS,normalizeLocalizedNumber,saveSection,getDetails,editableAssessment,validateForSubmission};
