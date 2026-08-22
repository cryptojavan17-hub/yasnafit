/**
 * Validation helpers - no external dependencies
 * For Yasnafit hardening
 */

function isNonEmptyString(v){
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidDateString(s){
  if(!s) return true; // optional
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isValidEnum(value, allowed){
  return allowed.includes(value);
}

function isValidId(id){
  return Number.isInteger(Number(id)) && Number(id) > 0;
}

function isValidHash(hash){
  if(!hash) return false;
  // Hash should be alphanumeric, 6-32 chars, no spaces
  return typeof hash === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(hash);
}

function validateStudent(data){
  const errors=[];
  if(!isNonEmptyString(data.full_name)) errors.push('نام شاگرد الزامی است');
  if(data.full_name && data.full_name.length > 100) errors.push('نام شاگرد حداکثر 100 کاراکتر');
  if(data.mobile && data.mobile.length > 20) errors.push('موبایل نامعتبر');
  if(data.weight && (isNaN(Number(data.weight)) || Number(data.weight) < 20 || Number(data.weight) > 300)) errors.push('وزن نامعتبر');
  if(data.height && (isNaN(Number(data.height)) || Number(data.height) < 100 || Number(data.height) > 250)) errors.push('قد نامعتبر');
  return errors;
}

function validateExercise(data){
  const errors=[];
  if(!isNonEmptyString(data.name_fa)) errors.push('نام فارسی حرکت الزامی است');
  if(data.name_fa && data.name_fa.length > 150) errors.push('نام حرکت حداکثر 150 کاراکتر');
  if(!isNonEmptyString(data.category_id)) errors.push('دسته‌بندی الزامی است');
  if(data.location && !['gym','home','both'].includes(data.location)) errors.push('محل نامعتبر');
  if(data.status && !['active','archived'].includes(data.status)) errors.push('وضعیت نامعتبر');
  if(data.priority && (isNaN(Number(data.priority)) || Number(data.priority) < 1 || Number(data.priority) > 10)) errors.push('اولویت باید 1-10 باشد');
  return errors;
}

// ESetType from PROMPT
const ESetType = ['REPEAT','TIME','FAILURE','AMRAP','DROPSET','SUPERSET','GIANT_SET'];
const SystemTypes = ['normal','superset','triset','giant','drop'];
const ExerciseSystemIds = [1,2,3,4,5];

function validateSet(set, path=''){
  const errors=[];
  if(!set) { errors.push(`${path} ست نامعتبر`); return errors; }
  if(!isValidHash(set.setHash) && !isValidHash(set.set_hash)) errors.push(`${path} setHash نامعتبر`);
  if(!set.type && !set.set_type) errors.push(`${path} نوع ست الزامی است`);
  const type = set.type || set.set_type;
  if(type && !isValidEnum(type, ESetType)) errors.push(`${path} نوع ست نامعتبر: ${type} - باید یکی از ${ESetType.join(', ')} باشد`);
  // count can be string or number or null for FAILURE/AMRAP
  if(set.count !== undefined && set.count !== null && set.count !== ''){
    const countStr = String(set.count);
    if(countStr.length > 20) errors.push(`${path} تعداد طولانی است`);
  }
  if(set.weight !== undefined && set.weight !== null && set.weight !== ''){
    if(isNaN(Number(set.weight)) || Number(set.weight) < 0 || Number(set.weight) > 1000) errors.push(`${path} وزن نامعتبر`);
  }
  if(set.restSeconds !== undefined || set.rest_seconds !== undefined){
    const rest = set.restSeconds ?? set.rest_seconds;
    if(rest !== null && (isNaN(Number(rest)) || Number(rest) < 0 || Number(rest) > 600)) errors.push(`${path} استراحت نامعتبر`);
  }
  return errors;
}

function validateMovement(mov, path=''){
  const errors=[];
  if(!mov) { errors.push(`${path} حرکت نامعتبر`); return errors; }
  if(!isValidHash(mov.movementHash) && !isValidHash(mov.movement_hash)) errors.push(`${path} movementHash نامعتبر`);
  // exercise_id can be original_id or internal id - validate if present
  const exId = mov.exercise_id ?? mov.exerciseId;
  if(exId !== undefined && exId !== null && exId !== ''){
    if(isNaN(Number(exId)) || Number(exId) <= 0) errors.push(`${path} شناسه حرکت نامعتبر`);
  }
  if(mov.description && mov.description.length > 500) errors.push(`${path} توضیح حرکت حداکثر 500 کاراکتر`);
  if(!Array.isArray(mov.sets)) errors.push(`${path} ست‌ها باید آرایه باشد`);
  else {
    if(mov.sets.length > 20) errors.push(`${path} حداکثر 20 ست مجاز است`);
    mov.sets.forEach((s,i)=>{
      errors.push(...validateSet(s, `${path} -> ست ${i+1}`));
    });
  }
  return errors;
}

function validateSystem(sys, path=''){
  const errors=[];
  if(!sys) { errors.push(`${path} سیستم نامعتبر`); return errors; }
  if(!isValidHash(sys.exerciseSystemHash) && !isValidHash(sys.system_hash) && !isValidHash(sys.systemHash)) errors.push(`${path} systemHash نامعتبر`);
  const sysId = sys.exercise_system_id ?? sys.exerciseSystemId;
  if(sysId !== undefined && !ExerciseSystemIds.includes(Number(sysId))) errors.push(`${path} شناسه سیستم نامعتبر`);
  const sysType = sys.system_type ?? sys.systemType;
  if(sysType && !isValidEnum(sysType, SystemTypes)) errors.push(`${path} نوع سیستم نامعتبر: ${sysType}`);
  if(!Array.isArray(sys.movement_list) && !Array.isArray(sys.data) && !Array.isArray(sys.movements)){
    // Allow empty
    if(sys.movement_list !== undefined || sys.data !== undefined) errors.push(`${path} لیست حرکات باید آرایه باشد`);
  } else {
    const list = sys.movement_list || sys.data || sys.movements || [];
    if(list.length > 30) errors.push(`${path} حداکثر 30 حرکت در هر سیستم`);
    list.forEach((m,i)=>{
      errors.push(...validateMovement(m, `${path} -> حرکت ${i+1}`));
    });
  }
  return errors;
}

function validateDay(day, path=''){
  const errors=[];
  if(!day) { errors.push(`${path} روز نامعتبر`); return errors; }
  if(!isValidHash(day.dayHash) && !isValidHash(day.day_hash)) errors.push(`${path} dayHash نامعتبر`);
  if(day.day_number !== undefined || day.dayNumber !== undefined){
    const num = day.day_number ?? day.dayNumber;
    if(isNaN(Number(num)) || Number(num) < 1 || Number(num) > 30) errors.push(`${path} شماره روز باید 1-30 باشد`);
  }
  if(day.focus && day.focus.length > 100) errors.push(`${path} تمرکز حداکثر 100 کاراکتر`);
  if(day.isRestDay === undefined && day.is_rest_day !== undefined){
    // ok
  }
  const systems = day.data || day.systems || [];
  if(!Array.isArray(systems)) errors.push(`${path} سیستم‌ها باید آرایه باشد`);
  else {
    if(systems.length > 20) errors.push(`${path} حداکثر 20 سیستم در هر روز`);
    systems.forEach((sys,i)=>{
      errors.push(...validateSystem(sys, `${path} -> سیستم ${i+1}`));
    });
  }
  return errors;
}

function validateProgram(program){
  const errors=[];
  if(!program) return ['برنامه نامعتبر'];

  if(!isNonEmptyString(program.title)) errors.push('عنوان برنامه الزامی است');
  if(program.title && program.title.length > 200) errors.push('عنوان حداکثر 200 کاراکتر');

  if(program.coach_note && program.coach_note.length > 2000) errors.push('توضیحات مربی حداکثر 2000 کاراکتر');

  if(program.start_date && !isValidDateString(program.start_date)) errors.push('تاریخ شروع نامعتبر');
  if(program.end_date && !isValidDateString(program.end_date)) errors.push('تاریخ پایان نامعتبر');
  if(program.start_date && program.end_date && new Date(program.end_date) < new Date(program.start_date)) errors.push('تاریخ پایان باید بعد از تاریخ شروع باشد');
  if(program.status && !['DRAFT','ACTIVE','COMPLETED','ARCHIVED','پیش‌نویس'].includes(program.status)) errors.push('وضعیت برنامه نامعتبر است');

  if(program.student_id !== undefined && program.student_id !== null && program.student_id !== ''){
    if(!isValidId(program.student_id)) errors.push('شناسه شاگرد نامعتبر');
  }

  if(program.assessment_id !== undefined && program.assessment_id !== null && program.assessment_id !== ''){
    if(!isValidId(program.assessment_id)) errors.push('شناسه ارزیابی نامعتبر');
  }

  if(program.version !== undefined && program.version !== null){
    if(![1,2].includes(Number(program.version))) errors.push('نسخه برنامه باید 1 یا 2 باشد');
  }

  if(!program.days && !program.program_data){
    // Allow empty days for new program
  }

  const days = program.days || program.program_data?.days || [];
  if(!Array.isArray(days)) errors.push('روزها باید آرایه باشد');
  else {
    if(days.length > 30) errors.push('حداکثر 30 روز مجاز است');
    days.forEach((day,i)=>{
      errors.push(...validateDay(day, `روز ${i+1}`));
    });

    // Check duplicate day_numbers
    const dayNumbers = days.map(d=> d.day_number ?? d.dayNumber).filter(n=> n!==undefined);
    const dup = dayNumbers.filter((n,i)=> dayNumbers.indexOf(n) !== i);
    if(dup.length>0) errors.push(`شماره روز تکراری: ${[...new Set(dup)].join(', ')}`);

    // Check duplicate hashes - only count unique hashes per entity type to avoid double counting dayHash/day_hash same value
    const allHashes = [];
    const seenHashesPerEntity = new Set();
    days.forEach(d=>{
      const dayHashes = [d.dayHash, d.day_hash].filter(Boolean);
      // Only add one unique hash per day
      const uniqueDayHash = dayHashes[0];
      if(uniqueDayHash) allHashes.push(uniqueDayHash);

      (d.data||[]).forEach(sys=>{
        const sysHashes = [sys.exerciseSystemHash, sys.system_hash, sys.systemHash].filter(Boolean);
        const uniqueSysHash = sysHashes[0];
        if(uniqueSysHash) allHashes.push(uniqueSysHash);

        (sys.movement_list||[]).forEach(mov=>{
          const movHashes = [mov.movementHash, mov.movement_hash].filter(Boolean);
          const uniqueMovHash = movHashes[0];
          if(uniqueMovHash) allHashes.push(uniqueMovHash);

          (mov.sets||[]).forEach(s=>{
            const setHashes = [s.setHash, s.set_hash].filter(Boolean);
            const uniqueSetHash = setHashes[0];
            if(uniqueSetHash) allHashes.push(uniqueSetHash);
          });
        });
      });
    });
    const dupHashes = allHashes.filter((h,i)=> allHashes.indexOf(h) !== i);
    if(dupHashes.length>0) errors.push(`هش تکراری پیدا شد: ${[...new Set(dupHashes)].slice(0,5).join(', ')}`);
  }

  return errors;
}

function validateRequestBody(body, maxSize=1024*1024){
  const errors=[];
  if(!body || typeof body !== 'object') { errors.push('بدنه درخواست نامعتبر'); return errors; }
  const size = JSON.stringify(body).length;
  if(size > maxSize) errors.push(`بدنه درخواست بزرگ است: ${size} > ${maxSize}`);
  return errors;
}

module.exports = {
  ESetType,
  SystemTypes,
  ExerciseSystemIds,
  validateStudent,
  validateExercise,
  validateProgram,
  validateDay,
  validateSystem,
  validateMovement,
  validateSet,
  validateRequestBody,
  isNonEmptyString,
  isValidId,
  isValidHash,
  isValidDateString,
  isValidEnum
};
