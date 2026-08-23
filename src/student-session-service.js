'use strict';
const crypto=require('crypto');
const {hashToken,genUUID}=require('./student-service');

const SESSION_COOKIE='yasnafit_student_session';
const SESSION_TTL_MS=30*24*60*60*1000;
const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;

function parseCookies(req){
  const result={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const trimmed=part.trim();if(!trimmed)continue;
    const index=trimmed.indexOf('=');
    if(index>0){
      try{result[trimmed.slice(0,index)]=decodeURIComponent(trimmed.slice(index+1));}
      catch(error){result[trimmed.slice(0,index)]='';}
    }
  }
  return result;
}
function secureRequest(req){
  return Boolean(req.socket?.encrypted) || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https';
}
function sessionCookie(req,rawSession,maxAgeSeconds=Math.floor(SESSION_TTL_MS/1000)){
  return `${SESSION_COOKIE}=${encodeURIComponent(rawSession)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secureRequest(req)?'; Secure':''}`;
}
function clearSessionCookie(req){ return sessionCookie(req,'',0); }

function inspectInvitation(db,rawToken){
  if(!TOKEN_PATTERN.test(String(rawToken||''))) return {error:'invalid'};
  const invitation=db.prepare(`
    SELECT si.id,si.student_id,si.status,si.expires_at,si.used_at,si.revoked_at,
           si.use_count,si.max_uses,si.opened_at,s.full_name,s.profile_status
    FROM student_invites si
    JOIN students s ON s.id=si.student_id AND s.deleted_at IS NULL
    WHERE si.token_hash=? AND si.deleted_at IS NULL
  `).get(hashToken(rawToken));
  if(!invitation) return {error:'invalid'};
  if(invitation.status==='revoked') return {error:'revoked'};
  if(invitation.status==='used' || invitation.use_count>=invitation.max_uses) return {error:'used'};
  if(invitation.status==='expired') return {error:'expired'};
  if(invitation.status!=='active') return {error:'invalid'};
  if(invitation.expires_at){
    const expires=new Date(invitation.expires_at);
    if(Number.isNaN(expires.getTime()) || expires<=new Date()){
      db.prepare("UPDATE student_invites SET status='expired',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND status='active'").run(invitation.id);
      return {error:'expired'};
    }
  }
  db.prepare('UPDATE student_invites SET opened_at=COALESCE(opened_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(invitation.id);
  return {
    invitation:{
      id:invitation.id,
      student_id:invitation.student_id,
      use_count:invitation.use_count,
      max_uses:invitation.max_uses,
      remaining_uses:Math.max(0,invitation.max_uses-invitation.use_count)
    },
    student:{full_name:invitation.full_name,profile_status:invitation.profile_status}
  };
}

function acceptInvitation(db,rawToken){
  const inspected=inspectInvitation(db,rawToken);
  if(inspected.error) return inspected;
  const rawSession=crypto.randomBytes(32).toString('base64url');
  const sessionHash=hashToken(rawSession);
  const stableId=genUUID();
  const expiresAt=new Date(Date.now()+SESSION_TTL_MS).toISOString();
  db.exec('BEGIN');
  try{
    const consumed=db.prepare(`
      UPDATE student_invites
      SET use_count=use_count+1,
          status=CASE WHEN use_count+1>=max_uses THEN 'used' ELSE 'active' END,
          used_at=CASE WHEN use_count+1>=max_uses THEN CURRENT_TIMESTAMP ELSE used_at END,
          updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE id=? AND status='active' AND use_count<max_uses AND deleted_at IS NULL
    `).run(inspected.invitation.id);
    if(consumed.changes!==1){ db.exec('ROLLBACK'); return {error:'used'}; }
    db.prepare(`
      INSERT INTO student_sessions
        (stable_id,invitation_id,student_id,session_hash,expires_at,last_seen_at,updated_at)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(stableId,inspected.invitation.id,inspected.invitation.student_id,sessionHash,expiresAt);
    db.exec('COMMIT');
    return {raw_session:rawSession,expires_at:expiresAt,student_id:inspected.invitation.student_id};
  }catch(error){
    try{db.exec('ROLLBACK');}catch(rollbackError){}
    throw error;
  }
}

function resolveStudentSession(db,req){
  const rawSession=parseCookies(req)[SESSION_COOKIE];
  if(!TOKEN_PATTERN.test(String(rawSession||''))) return null;
  const row=db.prepare(`
    SELECT ss.id AS session_id,ss.stable_id AS session_stable_id,ss.student_id,
           ss.expires_at,ss.revoked_at,ss.last_seen_at,s.*
    FROM student_sessions ss
    JOIN students s ON s.id=ss.student_id AND s.deleted_at IS NULL
    WHERE ss.session_hash=?
  `).get(hashToken(rawSession));
  if(!row || row.revoked_at) return null;
  const expires=new Date(row.expires_at);
  if(Number.isNaN(expires.getTime()) || expires<=new Date()){
    db.prepare('UPDATE student_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL').run(row.session_id);
    return null;
  }
  db.prepare('UPDATE student_sessions SET last_seen_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(row.session_id);
  return {raw_session:rawSession,session_id:row.session_id,student_id:row.student_id,expires_at:row.expires_at,student:row};
}
function revokeCurrentSession(db,req){
  const raw=parseCookies(req)[SESSION_COOKIE];
  if(!TOKEN_PATTERN.test(String(raw||''))) return false;
  return db.prepare('UPDATE student_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE session_hash=? AND revoked_at IS NULL').run(hashToken(raw)).changes>0;
}
function revokeInvitationSessions(db,invitationId){
  return db.prepare('UPDATE student_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE invitation_id=? AND revoked_at IS NULL').run(invitationId).changes;
}
function safeStudent(student){
  return {
    case_number:student.case_number||'',
    full_name:student.full_name||'',mobile:student.mobile||'',date_of_birth:student.date_of_birth||'',gender:student.gender||'unspecified',
    goal:student.goal||'',height:student.height,weight:student.weight,
    training_experience:student.training_experience||'',training_level:student.training_level||'',
    preferred_location:student.preferred_location||'gym',limitations:student.limitations||'',
    injuries:student.injuries||'',medical_notes:student.medical_notes||'',profile_status:student.profile_status||''
  };
}
module.exports={
  SESSION_COOKIE,SESSION_TTL_MS,TOKEN_PATTERN,parseCookies,sessionCookie,clearSessionCookie,
  inspectInvitation,acceptInvitation,resolveStudentSession,revokeCurrentSession,revokeInvitationSessions,safeStudent
};
