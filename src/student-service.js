const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

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
    db.prepare(`UPDATE students SET profile_status='INVITED', updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(studentId);
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
  if(invite.status === 'used') {
    // Allow used tokens to still work for existing student? For now, allow but mark
    // We will allow used tokens to continue working for student portal access
  }

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
  timeline.sort((a,b)=> new Date(a.date) - new Date(b.date));

  return {
    student,
    assessments: assessmentsWithPhotos,
    programs,
    timeline,
    invites: db.prepare('SELECT id, stable_id, token_preview, status, created_at, expires_at, used_at, revoked_at FROM student_invites WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC').all(studentId)
  };
}

function getPendingSubmissions(db){
  // Coach view: assessments with status SUBMITTED or UNDER_REVIEW
  return db.prepare(`
    SELECT ba.*, s.full_name, s.mobile, s.goal,
           (SELECT COUNT(*) FROM assessment_photos WHERE assessment_id=ba.id AND deleted_at IS NULL) as photo_count,
           (SELECT COUNT(*) FROM body_assessments WHERE student_id=ba.student_id AND deleted_at IS NULL) as total_assessments
    FROM body_assessments ba
    JOIN students s ON s.id=ba.student_id AND s.deleted_at IS NULL
    WHERE ba.deleted_at IS NULL AND ba.status IN ('SUBMITTED','UNDER_REVIEW')
    ORDER BY ba.submitted_at DESC, ba.id DESC
  `).all();
}

function validateAssessmentFields(data){
  const errors=[];
  const ranges = {
    weight:[20,300], height:[100,250], waist:[30,250], chest:[30,250], hips:[30,250],
    body_fat:[1,80], muscle_mass:[1,200]
  };
  for(const [key,[min,max]] of Object.entries(ranges)){
    if(data[key] !== undefined && data[key] !== null && data[key] !== ''){
      const value=Number(data[key]);
      if(!Number.isFinite(value) || value<min || value>max) errors.push(`${key} نامعتبر است`);
    }
  }
  for(const key of ['goal','training_experience','limitations','injuries','student_note','coach_note']){
    if(data[key] != null && (typeof data[key] !== 'string' || data[key].length > 4000)) errors.push(`${key} نامعتبر است`);
  }
  if(data.measurements != null && (typeof data.measurements !== 'object' || Array.isArray(data.measurements))) errors.push('اندازه‌گیری‌ها نامعتبر است');
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
    const status = 'PROFILE_INCOMPLETE';
    const value = key => data[key] === undefined || data[key] === '' ? null : data[key];
    const res = db.prepare(`
      INSERT INTO body_assessments
      (stable_id, student_id, assessment_number, status, weight, height, waist, chest, hips, body_fat, muscle_mass, measurements, goal, training_experience, limitations, injuries, student_note, coach_note, version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    `).run(stableId, studentId, nextNumber, status, value('weight'), value('height'), value('waist'), value('chest'), value('hips'), value('body_fat'), value('muscle_mass'), JSON.stringify(data.measurements||{}), data.goal||'', data.training_experience||'', data.limitations||'', data.injuries||'', data.student_note||'', '');
    db.prepare(`UPDATE students SET last_assessment_id=?, profile_status=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(res.lastInsertRowid, status, studentId);
    db.exec('COMMIT');
    return {id:res.lastInsertRowid, stable_id:stableId, assessment_number:nextNumber, status};
  } catch(e){
    db.exec('ROLLBACK');
    throw e;
  }
}

function updateAssessment(db, assessmentId, data){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');
  if(!['PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED'].includes(existing.status)) {
    throw new Error('Assessment is frozen after submission');
  }
  const errors = validateAssessmentFields(data);
  if(errors.length) throw new Error(errors[0]);

  const fields=[];
  const params=[];
  const updatable=['weight','height','waist','chest','hips','body_fat','muscle_mass','goal','training_experience','limitations','injuries','student_note','measurements'];
  for(const key of updatable){
    if(data[key] !== undefined){
      fields.push(`${key}=?`);
      params.push(key === 'measurements' ? JSON.stringify(data[key]||{}) : (data[key] === '' ? null : data[key]));
    }
  }
  if(!fields.length) return existing;
  // Saving a draft does not accept arbitrary client-supplied workflow states.
  fields.push("status=CASE WHEN status='CHANGES_REQUESTED' THEN status ELSE 'ASSESSMENT_PENDING' END");
  fields.push('updated_at=CURRENT_TIMESTAMP');
  fields.push('version=version+1');
  params.push(assessmentId);
  db.prepare(`UPDATE body_assessments SET ${fields.join(', ')} WHERE id=?`).run(...params);
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function submitAssessment(db, assessmentId){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');
  if(!['PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED'].includes(existing.status)) throw new Error('این ارزیابی قبلاً ارسال شده است');
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(existing.student_id);
  if(!student) throw new Error('Student not found');

  if(!student.full_name?.trim()) throw new Error('نام و نام خانوادگی الزامی است');
  if(!existing.weight) throw new Error('وزن الزامی است');
  if(!(existing.height || student.height)) throw new Error('قد الزامی است');
  if(!(existing.goal || student.goal)) throw new Error('هدف تمرینی الزامی است');
  if(!(existing.training_experience || student.training_experience)) throw new Error('سابقه تمرین الزامی است');
  const required = new Set(db.prepare(`SELECT photo_type FROM assessment_photos WHERE assessment_id=? AND photo_type IN ('front','back','side') AND deleted_at IS NULL`).all(assessmentId).map(p=>p.photo_type));
  const missing = ['front','back','side'].filter(type=>!required.has(type));
  if(missing.length) throw new Error(`عکس‌های جلو، پشت و کنار الزامی هستند (ناقص: ${missing.join(', ')})`);

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE body_assessments SET status='SUBMITTED', submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(assessmentId);
    db.prepare(`UPDATE students SET profile_status='SUBMITTED', last_assessment_id=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(assessmentId, existing.student_id);
    db.prepare(`UPDATE student_invites SET status='used', used_at=COALESCE(used_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE student_id=? AND status='active'`).run(existing.student_id);
    db.exec('COMMIT');
  } catch(e){ db.exec('ROLLBACK'); throw e; }
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function reviewAssessment(db, assessmentId, action, coachNote=''){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');
  if(typeof coachNote !== 'string' || coachNote.length > 4000) throw new Error('یادداشت مربی نامعتبر است');
  const transitions = {
    SUBMITTED: {approve:'APPROVED', request_changes:'CHANGES_REQUESTED', under_review:'UNDER_REVIEW'},
    UNDER_REVIEW: {approve:'APPROVED', request_changes:'CHANGES_REQUESTED'}
  };
  const newStatus = transitions[existing.status]?.[action];
  if(!newStatus) throw new Error('تغییر وضعیت ارزیابی مجاز نیست');

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE body_assessments SET status=?, coach_note=?, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(newStatus, coachNote, assessmentId);
    db.prepare(`UPDATE students SET profile_status=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(newStatus, existing.student_id);
    db.exec('COMMIT');
  } catch(e){ db.exec('ROLLBACK'); throw e; }
  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
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
  reviewAssessment
};
