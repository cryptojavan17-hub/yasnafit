const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const studentAuth = require('./student-auth-service');

function genSecureToken(bytes=32){
  // Cryptographically random token, base64url
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token){
  // SHA256 hash for storage
  return crypto.createHash('sha256').update(token).digest('hex');
}

function genUUID(){
  if(crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function createInvite(db, studentId, expiresInDays=30){
  if(!Number.isInteger(Number(studentId)) || Number(studentId) <= 0) throw new Error('student_id required');
  if(expiresInDays !== null && expiresInDays !== 0 && (!Number.isInteger(Number(expiresInDays)) || Number(expiresInDays) < 1 || Number(expiresInDays) > 3650)) {
    throw new Error('expires_in_days must be an integer between 1 and 3650, or 0 for no expiration');
  }
  
  const token = genSecureToken(32);
  const tokenHash = hashToken(token);
  const tokenPreview = token.substring(0,8) + '...';
  const stableId = genUUID();
  
  let expiresAt = null;
  if(expiresInDays){
    const exp = new Date();
    exp.setDate(exp.getDate() + expiresInDays);
    expiresAt = exp.toISOString();
  }

  // Invalidate old active invites for same student (optional - keep only latest active)
  // We will keep old but mark as expired? For simplicity, revoke old active invites
  try {
    db.prepare(`UPDATE student_invites SET status='revoked', revoked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE student_id=? AND status='active'`).run(studentId);
  } catch(e){}

  const res = db.prepare(`
    INSERT INTO student_invites (stable_id, student_id, token_hash, token_preview, status, expires_at, version, updated_at)
    VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP)
  `).run(stableId, studentId, tokenHash, tokenPreview, 'active', expiresAt);

  // Update student profile_status to INVITED
  try {
    db.prepare(`
      UPDATE students
      SET profile_status=CASE
        WHEN profile_status IS NULL OR profile_status='' THEN 'INVITED'
        ELSE profile_status
      END,
      updated_at=CURRENT_TIMESTAMP, version=version+1
      WHERE id=?
    `).run(studentId);
  } catch(e){}

  return {
    id: res.lastInsertRowid,
    stable_id: stableId,
    student_id: studentId,
    token, // Return raw token only once
    token_preview: tokenPreview,
    expires_at: expiresAt
  };
}

function resolveInvite(db, token){
  if(!token) return null;
  const tokenHash = hashToken(token);
  const invite = db.prepare(`
    SELECT si.*, s.full_name, s.mobile, s.profile_status
    FROM student_invites si
    JOIN students s ON s.id=si.student_id
    WHERE si.token_hash=? AND si.deleted_at IS NULL
  `).get(tokenHash);

  if(!invite) return null;

  // Check status
  if(invite.status === 'revoked') return {error: 'revoked', invite};
  if(invite.status === 'expired') return {error: 'expired', invite};
  // Invitation links are one-time bootstrap credentials. A used invitation can never
  // authorize portal APIs; the student session cookie is the permanent boundary.
  if(invite.status === 'used') return {error: 'used', invite};

  // Expiration limits accepting an unused invitation. Once accepted, the same
  // high-entropy credential is the student's persistent private-portal key.
  if(invite.status === 'active' && invite.expires_at){
    const exp = new Date(invite.expires_at);
    if(Number.isNaN(exp.getTime()) || exp < new Date()){
      try {
        db.prepare(`UPDATE student_invites SET status='expired', updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(invite.id);
      } catch(e){}
      return {error: 'expired', invite};
    }
  }

  // Check if student soft deleted
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(invite.student_id);
  if(!student) return {error: 'student_not_found'};

  return {invite, student};
}

function revokeInvite(db, inviteId){
  const res = db.prepare(`
    UPDATE student_invites SET status='revoked', revoked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND status IN ('active','used') AND deleted_at IS NULL
  `).run(inviteId);
  return res.changes > 0;
}

function getStudentFullData(db, studentId, options={}){
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student) return null;

  const assessments = db.prepare(`
    SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number ASC, id ASC
  `).all(studentId);

  const programs = options.studentView
    ? db.prepare(`SELECT * FROM training_programs WHERE student_id=? AND deleted_at IS NULL AND status IN ('ACTIVE','COMPLETED','ARCHIVED') ORDER BY program_number ASC, id ASC`).all(studentId)
    : db.prepare(`SELECT * FROM training_programs WHERE student_id=? AND deleted_at IS NULL ORDER BY program_number ASC, id ASC`).all(studentId);

  // Never expose private filesystem paths in JSON responses.
  const assessmentsWithPhotos = assessments.map(a=>{
    const photos = db.prepare(`
      SELECT id, stable_id, assessment_id, student_id, photo_type, original_filename,
             mime_type, size_bytes, version, created_at, updated_at
      FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL ORDER BY photo_type, id
    `).all(a.id);
    return {...a, photos};
  });

  // Build timeline - Assessment -> Program
  const timeline = [];
  assessmentsWithPhotos.forEach(ass=>{
    timeline.push({type:'assessment', date: ass.submitted_at||ass.created_at, data: ass});
    // Find program linked via assessment.program_id OR via program.assessment_id
    let linkedProg = null;
    if(ass.program_id){
      linkedProg = programs.find(p=>p.id===ass.program_id);
    }
    if(!linkedProg){
      linkedProg = programs.find(p=>p.assessment_id===ass.id);
    }
    if(linkedProg){
      timeline.push({type:'program', date: linkedProg.start_date||linkedProg.created_at, data: linkedProg});
    }
  });
  // Programs not linked to any assessment in timeline yet
  const linkedProgramIds = new Set(timeline.filter(t=>t.type==='program').map(t=>t.data.id));
  programs.forEach(p=>{
    if(!linkedProgramIds.has(p.id)){
      timeline.push({type:'program', date: p.start_date||p.created_at, data: p});
    }
  });
  try{
    const workouts=db.prepare('SELECT ws.stable_id,ws.status,ws.started_at,ws.completed_at,ws.notes,pd.day_number,tp.title program_title FROM workout_sessions ws JOIN program_days pd ON pd.id=ws.program_day_id JOIN training_programs tp ON tp.id=ws.program_id WHERE ws.student_id=? AND ws.deleted_at IS NULL ORDER BY ws.started_at').all(studentId);
    workouts.forEach(workout=>timeline.push({type:'workout',date:workout.completed_at||workout.started_at,data:workout}));
  }catch(error){}
  timeline.sort((a,b)=> new Date(a.date) - new Date(b.date));

  const studentSafe = studentAuth.safeStudent(student);
  studentSafe.id = student.id;
  studentSafe.temporary_password = student.mobile ? String(student.mobile).slice(-4) : '';
  studentSafe.portal_url = '/student/login';

  return {
    student: studentSafe,
    assessments: assessmentsWithPhotos,
    programs,
    timeline,
    invites: db.prepare('SELECT id, stable_id, token_preview, status, created_at, expires_at, used_at, revoked_at FROM student_invites WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC').all(studentId)
  };
}

function getPendingSubmissions(db){
  // Coach view: assessments with status SUBMITTED or UNDER_REVIEW
  return db.prepare(`
    SELECT ba.*, s.full_name, s.mobile, s.goal, s.case_number,
           (SELECT COUNT(*) FROM assessment_photos WHERE assessment_id=ba.id AND deleted_at IS NULL) as photo_count,
           (SELECT COUNT(*) FROM body_assessments WHERE student_id=ba.student_id AND deleted_at IS NULL) as total_assessments
    FROM body_assessments ba
    JOIN students s ON s.id=ba.student_id AND s.deleted_at IS NULL
    WHERE ba.deleted_at IS NULL AND ba.lifecycle_status IN ('SUBMITTED','PENDING_REVIEW')
    ORDER BY ba.submitted_at DESC, ba.id DESC
  `).all();
}

function normalizePersianNumber(value){
  return String(value??'').trim()
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\u066B,\/]/g,'.').replace(/\u060C/g,',').replace(/\u066C/g,'').replace(/\s+/g,'').replace(/[^\d.\-]/g,'');
}
function parseLocalizedNumber(value){
  const raw = String(value??'').trim();
  if(raw==='') return null;
  const n = normalizePersianNumber(raw);
  if(n==='' || n==='-' || n==='.' || n==='-.') return null;
  const num = Number(n);
  return Number.isFinite(num) ? num : null;
}
function validateAssessmentFields(data){
  const errors=[];
  const ranges = {
    weight:[20,300], height:[100,250], waist:[30,250], chest:[30,250], hips:[30,250],
    body_fat:[1,80], muscle_mass:[1,200]
  };
  for(const [key,[min,max]] of Object.entries(ranges)){
    if(data[key] !== undefined && data[key] !== null && data[key] !== ''){
      const value=parseLocalizedNumber(data[key]);
      if(value===null || !Number.isFinite(value) || value<min || value>max) errors.push(`${key} نامعتبر است`);
    }
  }
  for(const key of ['goal','training_experience','limitations','injuries','student_note','coach_note']){
    if(data[key] != null && (typeof data[key] !== 'string' || data[key].length > 50000)) errors.push(`${key} نامعتبر است`);
  }
  if(data.measurements != null && (typeof data.measurements !== 'object' || Array.isArray(data.measurements))) errors.push('اندازه‌گیری‌ها نامعتبر است');
  if(data.body_photos_preference !== undefined && data.body_photos_preference !== null && !['willing','declined'].includes(data.body_photos_preference)){
    errors.push('انتخاب مربوط به تصاویر بدنی نامعتبر است');
  }
  return errors;
}

function createAssessment(db, studentId, data={}){
  const student = db.prepare('SELECT id FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student) throw new Error('Student not found');
  const errors = validateAssessmentFields(data);
  if(errors.length) throw new Error(errors[0]);

  db.exec('BEGIN');
  try {
    const last = db.prepare('SELECT MAX(assessment_number) AS max_num FROM body_assessments WHERE student_id=?').get(studentId);
    const nextNumber = (last?.max_num || 0) + 1;
    const stableId = genUUID();
    const status = 'ASSESSMENT_PENDING';
    const assessmentType=nextNumber===1?'INITIAL':'MONTHLY';
    const value = key => {
      if(data[key]===undefined || data[key]==='') return null;
      if(['weight','height','waist','chest','hips','body_fat','muscle_mass'].includes(key)){
        const parsed = parseLocalizedNumber(data[key]);
        return parsed!==null ? parsed : data[key];
      }
      return data[key];
    };
    const res = db.prepare(`
      INSERT INTO body_assessments
      (stable_id, student_id, assessment_number, assessment_type, lifecycle_status, status, weight, height, waist, chest, hips, body_fat, muscle_mass, measurements, goal, training_experience, limitations, injuries, student_note, coach_note, body_photos_preference, draft_saved_at, version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,1)
    `).run(stableId, studentId, nextNumber, assessmentType, 'DRAFT', status, value('weight'), value('height'), value('waist'), value('chest'), value('hips'), value('body_fat'), value('muscle_mass'), JSON.stringify(data.measurements||{}), data.goal||'', data.training_experience||'', data.limitations||'', data.injuries||'', data.student_note||'', '', data.body_photos_preference||null);
    db.prepare(`UPDATE students SET last_assessment_id=?, profile_status=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(res.lastInsertRowid, status, studentId);
    db.exec('COMMIT');
    return {id:res.lastInsertRowid, stable_id:stableId, assessment_number:nextNumber, assessment_type:assessmentType, lifecycle_status:'DRAFT', status};
  } catch(e){
    db.exec('ROLLBACK');
    throw e;
  }
}

function updateAssessment(db, assessmentId, data){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');
  const lifecycle=existing.lifecycle_status||(['PROFILE_INCOMPLETE','ASSESSMENT_PENDING'].includes(existing.status)?'DRAFT':existing.status);
  if(!['DRAFT','CHANGES_REQUESTED'].includes(lifecycle)) {
    throw new Error('Assessment is frozen after submission');
  }
  const errors = validateAssessmentFields(data);
  if(errors.length) throw new Error(errors[0]);

  const fields=[];
  const params=[];
  const updatable=['weight','height','waist','chest','hips','body_fat','muscle_mass','goal','training_experience','limitations','injuries','student_note','measurements','body_photos_preference'];
  for(const key of updatable){
    if(data[key] !== undefined){
      fields.push(`${key}=?`);
      if(key==='measurements') params.push(JSON.stringify(data[key]||{}));
      else if(data[key]==='') params.push(null);
      else if(['weight','height','waist','chest','hips','body_fat','muscle_mass'].includes(key)){
        const parsed=parseLocalizedNumber(data[key]);
        params.push(parsed!==null?parsed:data[key]);
      } else params.push(data[key]);
    }
  }
  if(!fields.length) return existing;
  // Saving a draft does not accept arbitrary client-supplied workflow states.
  fields.push("status=CASE WHEN lifecycle_status='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED' ELSE 'ASSESSMENT_PENDING' END");
  fields.push("lifecycle_status=CASE WHEN lifecycle_status='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED' ELSE 'DRAFT' END");
  fields.push('draft_saved_at=CURRENT_TIMESTAMP');
  fields.push('updated_at=CURRENT_TIMESTAMP');
  fields.push('version=version+1');
  params.push(assessmentId);
  db.prepare(`UPDATE body_assessments SET ${fields.join(', ')} WHERE id=?`).run(...params);
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function submitAssessment(db, assessmentId){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');
  const lifecycle=existing.lifecycle_status||(['PROFILE_INCOMPLETE','ASSESSMENT_PENDING'].includes(existing.status)?'DRAFT':existing.status);
  if(!['DRAFT','CHANGES_REQUESTED'].includes(lifecycle)) throw new Error('این ارزیابی قبلاً ارسال شده است');
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(existing.student_id);
  if(!student) throw new Error('Student not found');

  if(!student.full_name?.trim()) throw new Error('نام و نام خانوادگی الزامی است');
  if(!existing.weight) throw new Error('وزن الزامی است');
  if(!(existing.height || student.height)) throw new Error('قد الزامی است');
  if(!(existing.goal || student.goal)) throw new Error('هدف تمرینی الزامی است');
  if(!(existing.training_experience || student.training_experience)) throw new Error('سابقه تمرین الزامی است');
  // Body photos and the preference flag are optional. Submission validity never
  // depends on a photo count; historical explicit choices remain compatible.

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE body_assessments SET status='SUBMITTED',lifecycle_status='SUBMITTED',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).run(assessmentId);
    db.prepare(`UPDATE students SET profile_status='SUBMITTED', last_assessment_id=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(assessmentId, existing.student_id);
    db.exec('COMMIT');
  } catch(e){ db.exec('ROLLBACK'); throw e; }
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function reviewAssessment(db, assessmentId, action, coachNote=''){
  const existing=db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing)throw new Error('Assessment not found');
  if(typeof coachNote!=='string'||coachNote.length>4000)throw new Error('یادداشت مربی نامعتبر است');
  const lifecycle=existing.lifecycle_status||({UNDER_REVIEW:'PENDING_REVIEW',PROFILE_INCOMPLETE:'DRAFT',ASSESSMENT_PENDING:'DRAFT'}[existing.status]||existing.status);
  const transitions={SUBMITTED:{under_review:'PENDING_REVIEW'},PENDING_REVIEW:{approve:'APPROVED',reject:'REJECTED',request_changes:'CHANGES_REQUESTED'}};
  const next=transitions[lifecycle]?.[action];if(!next)throw new Error('تغییر وضعیت ارزیابی مجاز نیست');
  if(['REJECTED','CHANGES_REQUESTED'].includes(next)&&!coachNote.trim())throw new Error('یادداشت مربی برای رد یا درخواست اصلاح الزامی است');
  const legacy={PENDING_REVIEW:'UNDER_REVIEW',APPROVED:'APPROVED',REJECTED:'ARCHIVED',CHANGES_REQUESTED:'CHANGES_REQUESTED'}[next];
  const approvedAt=next==='APPROVED'?'CURRENT_TIMESTAMP':'approved_at';
  const rejectedAt=next==='REJECTED'?'CURRENT_TIMESTAMP':'rejected_at';
  db.exec('BEGIN');
  try{
    db.prepare(`UPDATE body_assessments SET status=?,lifecycle_status=?,coach_note=?,reviewed_at=CURRENT_TIMESTAMP,approved_at=${approvedAt},rejected_at=${rejectedAt},updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?`).run(legacy,next,coachNote.trim(),assessmentId);
    db.prepare('UPDATE students SET profile_status=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?').run(next,existing.student_id);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

const MANAGEMENT_STATUS_VALUES = [
  'NEW','PROFILE_PENDING','PENDING_REVIEW','UNDER_REVIEW','CHANGES_REQUESTED',
  'APPROVED_AWAITING_PROGRAM','ACTIVE_PROGRAM','NEEDS_ASSESSMENT','INACTIVE'
];

const MANAGEMENT_CTE = `
  WITH ranked_assessments AS (
    SELECT ba.*, ROW_NUMBER() OVER (
      PARTITION BY ba.student_id ORDER BY ba.assessment_number DESC, ba.id DESC
    ) AS row_num
    FROM body_assessments ba WHERE ba.deleted_at IS NULL
  ),
  latest_assessment AS (SELECT * FROM ranked_assessments WHERE row_num=1),
  ranked_programs AS (
    SELECT tp.*, ROW_NUMBER() OVER (
      PARTITION BY tp.student_id ORDER BY tp.program_number DESC, tp.id DESC
    ) AS row_num
    FROM training_programs tp WHERE tp.deleted_at IS NULL
  ),
  latest_program AS (SELECT * FROM ranked_programs WHERE row_num=1),
  ranked_active_programs AS (
    SELECT tp.*, ROW_NUMBER() OVER (
      PARTITION BY tp.student_id ORDER BY tp.program_number DESC, tp.id DESC
    ) AS row_num
    FROM training_programs tp WHERE tp.deleted_at IS NULL AND tp.status='ACTIVE'
  ),
  active_program AS (SELECT * FROM ranked_active_programs WHERE row_num=1),
  invitation_summary AS (
    SELECT student_id, COUNT(*) AS invite_count,
           SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_invite_count
    FROM student_invites WHERE deleted_at IS NULL GROUP BY student_id
  ),
  student_management AS (
    SELECT
      s.id, s.stable_id, s.case_number, s.full_name, s.mobile, s.goal, s.status AS student_record_status,
      s.profile_status, s.weight, s.height, s.training_level, s.preferred_location,
      s.created_at, s.updated_at,
      la.id AS current_assessment_id,
      la.assessment_number AS current_assessment_number,
      COALESCE(la.lifecycle_status,la.status) AS current_assessment_status,
      la.submitted_at AS last_assessment_submitted_at,
      la.created_at AS last_assessment_created_at,
      lp.id AS current_program_id,
      lp.title AS current_program_title,
      lp.status AS current_program_status,
      lp.start_date AS current_program_start_date,
      lp.end_date AS current_program_end_date,
      ap.id AS active_program_id,
      ap.end_date AS active_program_end_date,
      COALESCE(ins.invite_count,0) AS invite_count,
      COALESCE(ins.active_invite_count,0) AS active_invite_count,
      CASE
        WHEN s.status IN ('غیرفعال','inactive','INACTIVE') THEN 'INACTIVE'
        WHEN la.id IS NULL AND COALESCE(ins.invite_count,0)=0 THEN 'NEW'
        WHEN la.id IS NULL THEN 'PROFILE_PENDING'
        WHEN COALESCE(la.lifecycle_status,la.status)='SUBMITTED' THEN 'PENDING_REVIEW'
        WHEN COALESCE(la.lifecycle_status,la.status)='PENDING_REVIEW' THEN 'UNDER_REVIEW'
        WHEN COALESCE(la.lifecycle_status,la.status)='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
        WHEN ap.id IS NOT NULL AND ap.end_date IS NOT NULL AND date(ap.end_date)<date('now') THEN 'NEEDS_ASSESSMENT'
        WHEN ap.id IS NOT NULL THEN 'ACTIVE_PROGRAM'
        WHEN (COALESCE(la.lifecycle_status,la.status)='APPROVED' AND la.program_id IS NOT NULL) OR lp.status IN ('COMPLETED','ARCHIVED') THEN 'NEEDS_ASSESSMENT'
        WHEN COALESCE(la.lifecycle_status,la.status)='APPROVED' THEN 'APPROVED_AWAITING_PROGRAM'
        ELSE 'PROFILE_PENDING'
      END AS management_status,
      CASE
        WHEN la.id IS NULL THEN 'REQUIRED'
        WHEN COALESCE(la.lifecycle_status,la.status) IN ('DRAFT','SUBMITTED','PENDING_REVIEW','CHANGES_REQUESTED') THEN 'IN_PROGRESS'
        WHEN ap.id IS NOT NULL AND ap.end_date IS NOT NULL AND date(ap.end_date)<date('now') THEN 'DUE'
        WHEN ap.id IS NOT NULL THEN 'NOT_DUE'
        WHEN lp.status IN ('COMPLETED','ARCHIVED') OR (COALESCE(la.lifecycle_status,la.status)='APPROVED' AND la.program_id IS NOT NULL) THEN 'DUE'
        WHEN COALESCE(la.lifecycle_status,la.status)='APPROVED' THEN 'WAITING_PROGRAM'
        ELSE 'REQUIRED'
      END AS next_assessment_status
    FROM students s
    LEFT JOIN latest_assessment la ON la.student_id=s.id
    LEFT JOIN latest_program lp ON lp.student_id=s.id
    LEFT JOIN active_program ap ON ap.student_id=s.id
    LEFT JOIN invitation_summary ins ON ins.student_id=s.id
    WHERE s.deleted_at IS NULL
  )
`;

function normalizeManagementOptions(options={}){
  const page=Math.max(1,Number.parseInt(options.page,10)||1);
  const pageSize=Math.min(100,Math.max(1,Number.parseInt(options.pageSize,10)||20));
  const search=String(options.search||'').trim().slice(0,100);
  const status=MANAGEMENT_STATUS_VALUES.includes(options.status)?options.status:'ALL';
  const studentId=Number.isInteger(Number(options.studentId)) && Number(options.studentId)>0 ? Number(options.studentId) : null;
  return {page,pageSize,search,status,studentId};
}

function getManagedStudents(db,options={}){
  const normalized=normalizeManagementOptions(options);
  const searchLike=`%${normalized.search}%`;
  const filters=`
    WHERE (?='' OR full_name LIKE ? COLLATE NOCASE OR COALESCE(mobile,'') LIKE ? OR COALESCE(case_number,'') LIKE ?)
      AND (?='ALL' OR management_status=?)
      AND (? IS NULL OR id=?)
  `;
  const params=[normalized.search,searchLike,searchLike,searchLike,normalized.status,normalized.status,normalized.studentId,normalized.studentId];
  const total=db.prepare(`${MANAGEMENT_CTE} SELECT COUNT(*) AS total FROM student_management ${filters}`).get(...params).total;
  const items=db.prepare(`${MANAGEMENT_CTE}
    SELECT * FROM student_management ${filters}
    ORDER BY id DESC LIMIT ? OFFSET ?
  `).all(...params,normalized.pageSize,(normalized.page-1)*normalized.pageSize);
  const stats=db.prepare(`${MANAGEMENT_CTE}
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN student_record_status IN ('فعال','active','ACTIVE') THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN management_status IN ('PENDING_REVIEW','UNDER_REVIEW') THEN 1 ELSE 0 END) AS pending_review,
      SUM(CASE WHEN active_program_id IS NOT NULL THEN 1 ELSE 0 END) AS active_programs,
      SUM(CASE WHEN management_status='NEEDS_ASSESSMENT' THEN 1 ELSE 0 END) AS needs_assessment
    FROM student_management
  `).get();
  return {
    items,
    pagination:{page:normalized.page,page_size:normalized.pageSize,total,total_pages:Math.max(1,Math.ceil(total/normalized.pageSize))},
    stats:{
      total:Number(stats.total||0),active:Number(stats.active||0),pending_review:Number(stats.pending_review||0),
      active_programs:Number(stats.active_programs||0),needs_assessment:Number(stats.needs_assessment||0)
    },
    filters:{search:normalized.search,status:normalized.status}
  };
}

function getManagedStudentDetail(db,studentId){
  const summary=getManagedStudents(db,{studentId,pageSize:1}).items[0];
  if(!summary) return null;
  const full=getStudentFullData(db,studentId);
  return {
    student:full.student,
    summary,
    current_assessment:full.assessments.length?full.assessments[full.assessments.length-1]:null,
    current_program:full.programs.length?full.programs[full.programs.length-1]:null,
    assessments:full.assessments,
    programs:full.programs,
    timeline:full.timeline,
    invites:full.invites
  };
}

function getStudentPrograms(db,studentId){
  const exists=db.prepare('SELECT id FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!exists) return null;
  return db.prepare(`
    SELECT id, stable_id, student_id, assessment_id, program_number, title, coach_note,
           status, start_date, end_date, assigned_at, completed_at, archived_at,
           version, created_at, updated_at
    FROM training_programs
    WHERE student_id=? AND deleted_at IS NULL
    ORDER BY program_number ASC, id ASC
  `).all(studentId);
}

function getStudentInvites(db,studentId){
  const exists=db.prepare('SELECT id FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!exists) return null;
  return db.prepare(`
    SELECT id, stable_id, student_id, token_preview, status, expires_at, used_at,
           use_count, max_uses, opened_at, revoked_at, created_at, updated_at
    FROM student_invites
    WHERE student_id=? AND deleted_at IS NULL
    ORDER BY id DESC
  `).all(studentId);
}

function storageRoot(kind){
  return path.resolve(__dirname,'..','data',kind);
}
function isInside(root, target){
  const base=path.resolve(root), resolved=path.resolve(target);
  return resolved===base || resolved.startsWith(base+path.sep);
}
function unlinkInside(filePath, root){
  try{
    if(!filePath) return;
    const resolved=path.resolve(filePath);
    if(!isInside(root, resolved)) return;
    if(fs.existsSync(resolved) && fs.statSync(resolved).isFile()) fs.unlinkSync(resolved);
  }catch(error){}
}
function rmDirInside(dirPath, root){
  try{
    const resolved=path.resolve(dirPath);
    if(!isInside(root, resolved)) return;
    if(fs.existsSync(resolved)) fs.rmSync(resolved,{recursive:true,force:true});
  }catch(error){}
}

function purgeAssessment(db, assessmentId){
  const assessment=db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
  if(!assessment) return null;
  const photos=db.prepare('SELECT storage_path FROM assessment_photos WHERE assessment_id=?').all(assessmentId);
  const documents=db.prepare('SELECT storage_path FROM assessment_documents WHERE assessment_id=?').all(assessmentId);
  const photosRoot=storageRoot('assessments');
  const documentsRoot=storageRoot('assessment-documents');
  db.exec('BEGIN');
  try{
    db.prepare('UPDATE training_programs SET assessment_id=NULL WHERE assessment_id=?').run(assessmentId);
    db.prepare('UPDATE students SET last_assessment_id=NULL WHERE last_assessment_id=?').run(assessmentId);
    db.prepare('DELETE FROM assessment_photos WHERE assessment_id=?').run(assessmentId);
    db.prepare('DELETE FROM assessment_documents WHERE assessment_id=?').run(assessmentId);
    db.prepare('DELETE FROM body_assessments WHERE id=?').run(assessmentId);
    const latest=db.prepare('SELECT id FROM body_assessments WHERE student_id=? ORDER BY assessment_number DESC, id DESC LIMIT 1').get(assessment.student_id);
    if(latest) db.prepare('UPDATE students SET last_assessment_id=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?').run(latest.id, assessment.student_id);
    else db.prepare("UPDATE students SET last_assessment_id=NULL, profile_status=CASE WHEN profile_status IN ('SUBMITTED','PENDING_REVIEW','UNDER_REVIEW','APPROVED','REJECTED','CHANGES_REQUESTED') THEN 'PROFILE_INCOMPLETE' ELSE profile_status END, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?").run(assessment.student_id);
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK');}catch(rollbackError){}
    throw error;
  }
  for(const photo of photos) unlinkInside(photo.storage_path, photosRoot);
  for(const document of documents) unlinkInside(document.storage_path, documentsRoot);
  rmDirInside(path.join(photosRoot, String(assessment.student_id), String(assessmentId)), photosRoot);
  rmDirInside(path.join(documentsRoot, String(assessment.student_id), String(assessmentId)), documentsRoot);
  return {id:assessmentId, student_id:assessment.student_id, purged:true};
}

function purgeStudent(db, studentId){
  const student=db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
  if(!student) return null;
  const photos=db.prepare('SELECT storage_path FROM assessment_photos WHERE student_id=?').all(studentId);
  const documents=db.prepare('SELECT storage_path FROM assessment_documents WHERE student_id=?').all(studentId);
  const photosRoot=storageRoot('assessments');
  const documentsRoot=storageRoot('assessment-documents');
  const sessions=db.prepare('SELECT id FROM workout_sessions WHERE student_id=?').all(studentId);
  const programs=db.prepare('SELECT id FROM training_programs WHERE student_id=?').all(studentId);
  db.exec('BEGIN');
  try{
    for(const session of sessions) db.prepare('DELETE FROM workout_results WHERE workout_session_id=?').run(session.id);
    db.prepare('DELETE FROM workout_sessions WHERE student_id=?').run(studentId);
    for(const program of programs) db.prepare('DELETE FROM training_programs WHERE id=?').run(program.id);
    db.prepare('DELETE FROM diet_programs WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM supplement_programs WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM assessment_photos WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM assessment_documents WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM body_assessments WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM student_invites WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM student_sessions WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM notifications WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM conversations WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM measurements WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM coach_students WHERE student_id=?').run(studentId);
    db.prepare('UPDATE programs SET student_id=NULL WHERE student_id=?').run(studentId);
    db.prepare('UPDATE orders SET student_id=NULL WHERE student_id=?').run(studentId);
    db.prepare('DELETE FROM students WHERE id=?').run(studentId);
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK');}catch(rollbackError){}
    throw error;
  }
  for(const photo of photos) unlinkInside(photo.storage_path, photosRoot);
  for(const document of documents) unlinkInside(document.storage_path, documentsRoot);
  rmDirInside(path.join(photosRoot, String(studentId)), photosRoot);
  rmDirInside(path.join(documentsRoot, String(studentId)), documentsRoot);
  return {id:studentId, case_number:student.case_number, purged:true};
}

module.exports = {
  genSecureToken,
  hashToken,
  genUUID,
  createInvite,
  resolveInvite,
  revokeInvite,
  getStudentFullData,
  getPendingSubmissions,
  createAssessment,
  updateAssessment,
  submitAssessment,
  reviewAssessment,
  purgeAssessment,
  purgeStudent,
  MANAGEMENT_STATUS_VALUES,
  getManagedStudents,
  getManagedStudentDetail,
  getStudentPrograms,
  getStudentInvites
};
