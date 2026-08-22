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
  if(!studentId) throw new Error('student_id required');
  
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
    db.prepare(`UPDATE student_invites SET status='revoked', revoked_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='active'`).run(studentId);
  } catch(e){}

  const res = db.prepare(`
    INSERT INTO student_invites (stable_id, student_id, token_hash, token_preview, status, expires_at, version)
    VALUES (?,?,?,?,?,?,?)
  `).run(stableId, studentId, tokenHash, tokenPreview, 'active', expiresAt, 1);

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

  // Check expiry
  if(invite.expires_at){
    const exp = new Date(invite.expires_at);
    if(exp < new Date()){
      // Mark as expired
      try { db.prepare(`UPDATE student_invites SET status='expired' WHERE id=?`).run(invite.id); } catch(e){}
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
    UPDATE student_invites SET status='revoked', revoked_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL
  `).run(inviteId);
  return res.changes > 0;
}

function getStudentFullData(db, studentId){
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(studentId);
  if(!student) return null;

  const assessments = db.prepare(`
    SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number ASC, id ASC
  `).all(studentId);

  const programs = db.prepare(`
    SELECT * FROM training_programs WHERE student_id=? AND deleted_at IS NULL ORDER BY program_number ASC, id ASC
  `).all(studentId);

  // Get photos for each assessment
  const assessmentsWithPhotos = assessments.map(a=>{
    const photos = db.prepare('SELECT * FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL ORDER BY photo_type, id').all(a.id);
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

function createAssessment(db, studentId, data={}){
  // Get next assessment number
  const last = db.prepare('SELECT MAX(assessment_number) as max_num FROM body_assessments WHERE student_id=? AND deleted_at IS NULL').get(studentId);
  const nextNumber = (last?.max_num||0) + 1;

  const stableId = genUUID();
  const status = data.status || 'PROFILE_INCOMPLETE';

  const res = db.prepare(`
    INSERT INTO body_assessments 
    (stable_id, student_id, assessment_number, status, weight, height, waist, chest, hips, body_fat, muscle_mass, measurements, goal, training_experience, limitations, injuries, student_note, coach_note, version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    stableId,
    studentId,
    nextNumber,
    status,
    data.weight||null,
    data.height||null,
    data.waist||null,
    data.chest||null,
    data.hips||null,
    data.body_fat||null,
    data.muscle_mass||null,
    JSON.stringify(data.measurements||{}),
    data.goal||'',
    data.training_experience||'',
    data.limitations||'',
    data.injuries||'',
    data.student_note||'',
    data.coach_note||'',
    1
  );

  // Update student last_assessment_id and profile_status
  try {
    db.prepare(`UPDATE students SET last_assessment_id=?, profile_status=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`)
      .run(res.lastInsertRowid, status, studentId);
  } catch(e){}

  return {
    id: res.lastInsertRowid,
    stable_id: stableId,
    assessment_number: nextNumber,
    status
  };
}

function updateAssessment(db, assessmentId, data){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');

  // Prevent editing if already submitted and frozen (unless coach requests changes)
  if(['SUBMITTED','UNDER_REVIEW','APPROVED','PROGRAM_ASSIGNED'].includes(existing.status) && !data.force){
    if(existing.status === 'SUBMITTED'){
      // Allow student to edit before review? For now, prevent silent editing after submission
      throw new Error('Assessment already submitted, cannot edit. Wait for coach review.');
    }
  }

  const fields = [];
  const params = [];

  const updatable = ['weight','height','waist','chest','hips','body_fat','muscle_mass','goal','training_experience','limitations','injuries','student_note','coach_note','status','program_id','measurements'];
  for(const key of updatable){
    if(data[key] !== undefined){
      if(key==='measurements'){
        fields.push(`${key}=?`);
        params.push(JSON.stringify(data[key]||{}));
      } else {
        fields.push(`${key}=?`);
        params.push(data[key]);
      }
    }
  }

  if(fields.length===0) return existing;

  fields.push('updated_at=CURRENT_TIMESTAMP');
  fields.push('version=version+1');

  const sql = `UPDATE body_assessments SET ${fields.join(', ')} WHERE id=?`;
  params.push(assessmentId);
  db.prepare(sql).run(...params);

  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function submitAssessment(db, assessmentId){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');

  // Validate required fields
  const student = db.prepare('SELECT * FROM students WHERE id=? AND deleted_at IS NULL').get(existing.student_id);
  if(!student) throw new Error('Student not found');

  // Check required: weight, height, at least one photo
  const photoCount = db.prepare('SELECT COUNT(*) as c FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL').get(assessmentId).c;
  if(!existing.weight) throw new Error('وزن الزامی است');
  if(photoCount < 1) throw new Error('حداقل یک عکس ارزیابی الزامی است');

  // Freeze assessment
  db.prepare(`
    UPDATE body_assessments SET status='SUBMITTED', submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?
  `).run(assessmentId);

  // Update student status
  db.prepare(`UPDATE students SET profile_status='SUBMITTED', updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(existing.student_id);

  // Update invite to used if exists
  try {
    db.prepare(`UPDATE student_invites SET status='used', used_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='active'`).run(existing.student_id);
  } catch(e){}

  return db.prepare('SELECT * FROM body_assessments WHERE id=?').get(assessmentId);
}

function reviewAssessment(db, assessmentId, action, coachNote=''){
  const existing = db.prepare('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL').get(assessmentId);
  if(!existing) throw new Error('Assessment not found');

  let newStatus;
  if(action==='approve'){
    newStatus='APPROVED';
  } else if(action==='request_changes'){
    newStatus='CHANGES_REQUESTED';
  } else if(action==='under_review'){
    newStatus='UNDER_REVIEW';
  } else {
    throw new Error('Invalid action');
  }

  db.prepare(`
    UPDATE body_assessments SET status=?, coach_note=?, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?
  `).run(newStatus, coachNote, assessmentId);

  // Update student
  db.prepare(`UPDATE students SET profile_status=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?`).run(newStatus, existing.student_id);

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
