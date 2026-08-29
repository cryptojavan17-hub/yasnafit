/**
 * Yasnafit - Hardened Production-Ready Server
 * Lightweight Node.js HTTP server with SQLite
 * Architecture: Normalized DB is source of truth, JSON is synchronized representation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Configuration ---
const port = Number(process.env.PORT || 3020);
const publicDir = path.join(__dirname, 'public');
const dataSourceDir = path.join(__dirname, 'data-source');
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
// Optional deployment boundary. The Windows local app remains zero-config; hosted
// deployments should set YASNAFIT_COACH_TOKEN and send it as a Bearer token.
const COACH_ACCESS_TOKEN = process.env.YASNAFIT_COACH_TOKEN || '';
const LOCAL_COACH_SESSION = crypto.randomBytes(32).toString('base64url');

// --- Database & Services ---
const { db, dbPath, backup, log } = require('./src/database');
const coachAccessFile = path.join(path.dirname(dbPath), 'coach-access-token');
function loadLocalCoachAccessToken(){
  if(COACH_ACCESS_TOKEN) return COACH_ACCESS_TOKEN;
  try {
    const existing=fs.readFileSync(coachAccessFile,'utf8').trim();
    if(/^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  } catch(e){}
  const generated=crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(coachAccessFile, generated+'\n', {mode:0o600, flag:'w'});
  try { fs.chmodSync(coachAccessFile,0o600); } catch(e){}
  return generated;
}
const LOCAL_COACH_ACCESS_TOKEN = loadLocalCoachAccessToken();
const { runMigrations } = require('./src/migrations');
const validation = require('./src/validation');
const programService = require('./src/program-service');
const studentService = require('./src/student-service');
const uploadService = require('./src/upload-service');
const releaseService = require('./src/release-service');
const studentSessionService = require('./src/student-session-service');
const assessmentService = require('./src/assessment-service');
const assessmentDocumentService = require('./src/assessment-document-service');
const engagementService = require('./src/engagement-service');
const auditService = require('./src/audit-service');
const studentAuthService = require('./src/student-auth-service');
const aiService = require('./src/ai-service');

// --- MIME Types ---
const types = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.gif':'image/gif',
  '.webp':'image/webp',
  '.mp4':'video/mp4',
  '.svg':'image/svg+xml'
};

// --- Utilities ---
function send(res, code, data, extraHeaders={}) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extraHeaders});
  res.end(JSON.stringify(data));
  return true; // Return truthy to indicate handled
}

function sendError(res, code, message, details=null){
  const payload = {error: message};
  if(details) payload.details = details;
  return send(res, code, payload);
}

function readBody(req) {
  return new Promise((resolve,reject)=>{
    let raw='';
    let size=0;
    req.on('data',chunk=>{
      size += chunk.length;
      if(size > MAX_BODY_SIZE){
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw+=chunk;
    });
    req.on('end',()=>{
      if(!raw) return resolve({});
      try{
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch(e){
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error',reject);
  });
}

function rows(sql, ...args){
  // Security: always use parameterized queries, no string concatenation for values
  return db.prepare(sql).all(...args);
}
function one(sql, ...args){
  return db.prepare(sql).get(...args);
}

// The six-digit case number is the public/business reference used by coach-facing
// routes. Numeric primary keys remain private relational keys inside SQLite.
function studentByReference(reference){
  const value=String(reference??'').trim();
  if(!/^\d+$/.test(value))return null;
  if(/^\d{6}$/.test(value)){
    const byCase=one('SELECT * FROM students WHERE case_number=? AND deleted_at IS NULL',value);
    if(byCase)return byCase;
  }
  const id=Number(value);
  return Number.isSafeInteger(id)&&id>0?one('SELECT * FROM students WHERE id=? AND deleted_at IS NULL',id):null;
}
function studentIdByReference(reference){return studentByReference(reference)?.id||null;}
function safeCoachStudent(row){return studentAuthService.safeStudent(row);}

function isSafePath(base, target){
  const normalizedBase = path.resolve(base);
  const normalizedTarget = path.resolve(target);
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(normalizedBase + path.sep);
}

function constantTimeEqual(expectedValue, suppliedValue){
  const expected=Buffer.from(String(expectedValue));
  const actual=Buffer.from(String(suppliedValue||''));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function isCoachAuthorized(req){
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers['x-coach-token'] || '');
  if(COACH_ACCESS_TOKEN && constantTimeEqual(COACH_ACCESS_TOKEN, bearer)) return true;
  const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('='); return i<0?[v,'']:[v.slice(0,i),v.slice(i+1)];
  }));
  return constantTimeEqual(LOCAL_COACH_SESSION, cookies.yasnafit_coach_session);
}

function requireCoach(req, res){
  if(isCoachAuthorized(req)) return false;
  sendError(res, 401, 'دسترسی مربی احراز نشد');
  return true;
}

const rateBuckets=new Map();
function rateLimit(req,res,scope,limit,windowMs){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim(),key=`${scope}:${ip}`,now=Date.now();let bucket=rateBuckets.get(key);if(!bucket||bucket.resetAt<=now)bucket={count:0,resetAt:now+windowMs};bucket.count++;rateBuckets.set(key,bucket);if(bucket.count>limit){send(res,429,{error:'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.',code:'RATE_LIMITED'},{'Retry-After':String(Math.ceil((bucket.resetAt-now)/1000))});return false;}if(rateBuckets.size>5000)for(const [entry,value] of rateBuckets)if(value.resetAt<=now)rateBuckets.delete(entry);return true;}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{const expected=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();return new URL(origin).host===expected;}catch(error){return false;}}

function requireStudent(req,res){
  const context=studentSessionService.resolveStudentSession(db,req);
  if(!context){
    send(res,401,{error:'جلسه شما منقضی شده است.',code:'STUDENT_SESSION_REQUIRED'});
    return null;
  }
  req.studentContext=context;
  return context;
}

function studentAssessmentView(assessment,photos=[]){
  if(!assessment) return null;
  return {
    assessment_number:assessment.assessment_number,assessment_type:assessment.assessment_type||((assessment.assessment_number||1)===1?'INITIAL':'MONTHLY'),
    status:assessment.lifecycle_status||assessment.status,
    weight:assessment.weight,height:assessment.height,waist:assessment.waist,chest:assessment.chest,
    hips:assessment.hips,body_fat:assessment.body_fat,muscle_mass:assessment.muscle_mass,
    goal:assessment.goal||'',training_experience:assessment.training_experience||'',
    limitations:assessment.limitations||'',injuries:assessment.injuries||'',
    body_photos_preference:assessment.body_photos_preference||null,
    student_note:assessment.student_note||'',coach_note:assessment.coach_note||'',
    draft_saved_at:assessment.draft_saved_at,submitted_at:assessment.submitted_at,reviewed_at:assessment.reviewed_at,
    approved_at:assessment.approved_at,rejected_at:assessment.rejected_at,archived_at:assessment.archived_at,created_at:assessment.created_at,
    photos:photos.map(photo=>({id:photo.id,photo_type:photo.photo_type,mime_type:photo.mime_type,size_bytes:photo.size_bytes,created_at:photo.created_at})),
    documents:assessmentDocumentService.list(db,assessment.id)
  };
}
function studentProgramView(program){
  if(!program) return null;
  return {
    title:program.title,coach_note:program.coach_note||'',status:program.status,
    program_number:program.program_number,start_date:program.start_date,end_date:program.end_date,
    assigned_at:program.assigned_at,completed_at:program.completed_at,archived_at:program.archived_at,
    created_at:program.created_at
  };
}
function studentProgramData(programData={}){
  return {
    days:(programData.days||[]).map(day=>({
      day_ref:day.stable_id,day_number:day.day_number,focus:day.focus||'',coach_note:day.coach_note||day.coachNote||'',
      is_rest_day:Boolean(day.is_rest_day||day.isRestDay),
      systems:(day.data||[]).map(system=>({
        system_type:system.system_type||'normal',exercise_system_id:system.exercise_system_id,
        movements:(system.movement_list||[]).map(movement=>({
          exercise_id:movement.exercise_id||movement.exerciseId||movement.original_exercise_id||null,
          original_exercise_id:movement.original_exercise_id||null,
          name:movement.nameFa||movement.name||'حرکت',
          description:movement.description||'',
          image_path:movement.image_path||(movement.original_exercise_id ? `/api/exercise-image/${movement.original_exercise_id}` : '/blank-white.svg'),
          video_path:movement.video_path||(movement.original_exercise_id ? `/files/exercise/videos/${movement.original_exercise_id}.mp4` : null),
          target_muscles:movement.target_muscles||[],
          sets:(movement.sets||[]).map(set=>({
            set_ref:set.stable_id,type:set.type||set.set_type,count:set.count??set.count_value??null,
            weight:set.weight??null,rest_seconds:set.restSeconds??set.rest_seconds??null
          }))
        }))
      }))
    }))
  };
}

const PHOTO_METADATA_COLUMNS = `id, stable_id, assessment_id, student_id, photo_type,
  original_filename, mime_type, size_bytes, version, created_at, updated_at`;

function editableStudentAssessment(studentId, assessmentId){
  return one(`SELECT id FROM body_assessments WHERE id=? AND student_id=? AND deleted_at IS NULL AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED')`, assessmentId, studentId);
}

function sanitizeFileName(name){
  // Remove path traversal, null bytes, etc.
  return path.basename(String(name)).replace(/[^a-zA-Z0-9._-]/g,'_').substring(0,100);
}

// --- Validation Middleware ---
function validateStudentPayload(data){
  const errs = validation.validateStudent(data);
  const bodyErrs = validation.validateRequestBody(data);
  return [...errs, ...bodyErrs];
}
function normalizeFaText(value){
  return String(value||'')
    .replace(/[\u064A\u0649]/g,'\u06CC')           // ي/ى → ی
    .replace(/\u0643/g,'\u06A9')                    // ك → ک
    .replace(/[\u0623\u0625\u0622]/g,'\u0627')    // أ/إ/آ → ا
    .replace(/\u0640/g,'')                           // کشیده
    .replace(/[\u200c\u200f\u200e]/g,' ')          // نیم‌فاصله/نشانه‌ها → فاصله
    .replace(/[\u064B-\u0652]/g,'')                 // اعراب
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g,' ')
    .trim();
}
function exerciseSearchScore(nameFa, term){
  const name=normalizeFaText(nameFa), q=normalizeFaText(term);
  if(!q||!name)return -1;
  if(name===q)return 0;
  if(name.startsWith(q))return 1;
  if(name.split(' ').some(word=>word.startsWith(q)))return 2;
  if(name.includes(q))return 3;
  return -1;
}
function validateExercisePayload(data){
  const errs = validation.validateExercise(data);
  const bodyErrs = validation.validateRequestBody(data);
  return [...errs, ...bodyErrs];
}
function validateProgramPayload(data){
  const errs = validation.validateProgram(data);
  const bodyErrs = validation.validateRequestBody(data);
  return [...errs, ...bodyErrs];
}

// --- API Handlers ---

async function handleHealth(req,res){
  const totalExercises = one('SELECT COUNT(*) as total FROM exercises WHERE deleted_at IS NULL')?.total || 0;
  const totalStudents = one('SELECT COUNT(*) as total FROM students WHERE deleted_at IS NULL')?.total || 0;
  const totalPrograms = one('SELECT COUNT(*) as total FROM training_programs WHERE deleted_at IS NULL')?.total || 0;
  const schemaVersion = one('SELECT value FROM settings WHERE key=?','schema_version')?.value || 'unknown';
  return send(res,200,{
    ok:true,
    database: fs.existsSync(dbPath),
    port,
    exercises: totalExercises,
    students: totalStudents,
    programs: totalPrograms,
    schema_version: schemaVersion,
    uptime: process.uptime()
  });
}

async function handleReleaseInfo(req,res,url){
  if(req.method!=='GET') return sendError(res,405,'متد مجاز نیست');
  if(url.pathname==='/api/version') return send(res,200,releaseService.getApplicationInfo());
  if(url.pathname==='/api/releases') return send(res,200,releaseService.listReleases(db));
  const match=url.pathname.match(/^\/api\/releases\/([^/]+)$/);
  if(match){
    const release=releaseService.getRelease(db,match[1]);
    if(!release) return sendError(res,404,'نسخه پیدا نشد');
    return send(res,200,release);
  }
  return null;
}

async function handleDashboard(req,res){
  const total=one('SELECT COUNT(*) as total FROM students WHERE deleted_at IS NULL')?.total||0;
  const active=one("SELECT COUNT(*) as total FROM programs WHERE status='فعال'")?.total||0;
  const waiting=one("SELECT COUNT(*) as total FROM orders WHERE status LIKE 'در انتظار%'")?.total||0;
  const movements = one('SELECT COUNT(*) as total FROM exercises WHERE deleted_at IS NULL')?.total||0;
  const categories = one('SELECT COUNT(*) as total FROM exercise_categories WHERE deleted_at IS NULL')?.total||0;
  const trainingProgs = one('SELECT COUNT(*) as total FROM training_programs WHERE deleted_at IS NULL')?.total||0;

  // ===== داشبورد v2 — داده واقعی، افزایشی (سازگار با پاسخ قبلی) =====
  const isoDay=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10);};
  const cnt=(sql,...params)=>one(sql,...params)?.total||0;
  const today=isoDay(0), in3Days=isoDay(3), d7=isoDay(-7), d14=isoDay(-14), d30=isoDay(-30), d60=isoDay(-60);
  const activePrograms=cnt("SELECT COUNT(*) total FROM training_programs WHERE status='ACTIVE' AND deleted_at IS NULL");
  const activeStudents=cnt("SELECT COUNT(DISTINCT student_id) total FROM training_programs WHERE status='ACTIVE' AND deleted_at IS NULL AND student_id IS NOT NULL");
  const trend={
    newStudents:{now:cnt('SELECT COUNT(*) total FROM students WHERE deleted_at IS NULL AND created_at>=?',d30),prev:cnt('SELECT COUNT(*) total FROM students WHERE deleted_at IS NULL AND created_at>=? AND created_at<?',d60,d30)},
    newPrograms:{now:cnt('SELECT COUNT(*) total FROM training_programs WHERE deleted_at IS NULL AND created_at>=?',d30),prev:cnt('SELECT COUNT(*) total FROM training_programs WHERE deleted_at IS NULL AND created_at>=? AND created_at<?',d60,d30)},
    workouts:{now:cnt('SELECT COUNT(*) total FROM workout_sessions WHERE deleted_at IS NULL AND started_at>=?',d30),prev:cnt('SELECT COUNT(*) total FROM workout_sessions WHERE deleted_at IS NULL AND started_at>=? AND started_at<?',d60,d30)}
  };
  // --- نیازمند توجه (فقط وضعیت‌های واقعی مدل داده) ---
  const attention=[];
  rows(`SELECT tp.id tp_id, tp.title, tp.end_date, s.id student_id, s.full_name, s.case_number FROM training_programs tp JOIN students s ON s.id=tp.student_id
        WHERE tp.status='ACTIVE' AND tp.deleted_at IS NULL AND tp.end_date IS NOT NULL AND tp.end_date<=? ORDER BY tp.end_date ASC LIMIT 6`,in3Days)
    .forEach(r=>{
      const ended=r.end_date<today;
      attention.push({severity:ended?'red':'yellow',kind:ended?'program_ended':'program_ending',
        name:r.full_name,case_number:r.case_number,text:ended?'برنامه تمرینی‌اش به پایان رسیده است':'برنامه تمرینی‌اش به‌زودی به پایان می‌رسد',
        sub:ended?`پایان: ${r.end_date}`:`${Math.max(1,Math.round((new Date(r.end_date)-new Date(today))/86400000))} روز آینده • ${r.end_date}`,
        action:`/users-list/${r.case_number}`,action_label:'مشاهده شاگرد'});
    });
  rows(`SELECT ba.id assessment_id, ba.assessment_number, s.full_name, s.case_number FROM body_assessments ba JOIN students s ON s.id=ba.student_id
        WHERE ba.status IN ('SUBMITTED','PENDING_REVIEW') AND ba.deleted_at IS NULL ORDER BY ba.id DESC LIMIT 6`)
    .forEach(r=>attention.push({severity:'yellow',kind:'assessment_review',name:r.full_name,case_number:r.case_number,
      text:`ارزیابی شماره ${r.assessment_number} آماده بررسی شماست`,sub:'برای تأیید یا درخواست تغییر، پرونده را باز کنید',
      action:`/assessments/${r.assessment_id}`,action_label:'باز کردن ارزیابی'}));
  rows(`SELECT ba.id assessment_id, ba.status, s.full_name, s.case_number FROM body_assessments ba JOIN students s ON s.id=ba.student_id
        WHERE ba.status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND ba.deleted_at IS NULL ORDER BY ba.id DESC LIMIT 5`)
    .forEach(r=>attention.push({severity:'blue',kind:'assessment_incomplete',name:r.full_name,case_number:r.case_number,
      text:r.status==='CHANGES_REQUESTED'?'درخواست تغییرات ارزیابی ارسال شده':'فرم ارزیابی هنوز تکمیل نشده است',sub:'شاگرد باید فرم را کامل کند',
      action:`/users-list/${r.case_number}`,action_label:'مشاهده شاگرد'}));
  rows(`SELECT si.id, si.student_id, si.expires_at, s.full_name, s.case_number FROM student_invites si LEFT JOIN students s ON s.id=si.student_id
        WHERE si.used_at IS NULL AND si.revoked_at IS NULL ORDER BY si.id DESC LIMIT 5`)
    .forEach(r=>attention.push({severity:'blue',kind:'invite_pending',name:r.full_name||'شاگرد جدید',case_number:r.case_number,
      text:'دعوت ورود هنوز پذیرفته نشده است',sub:r.expires_at?`انقضا: ${String(r.expires_at).slice(0,10)}`:'',
      action:r.case_number?`/users-list/${r.case_number}`:'/users-list',action_label:'مشاهده پرونده'}));
  rows(`SELECT DISTINCT s.id student_id, s.full_name, s.case_number, tp.start_date FROM training_programs tp JOIN students s ON s.id=tp.student_id
        WHERE tp.status='ACTIVE' AND tp.deleted_at IS NULL AND tp.start_date IS NOT NULL AND tp.start_date<=?
          AND NOT EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.student_id=tp.student_id AND ws.deleted_at IS NULL AND ws.started_at>=?)`,d7,d14)
    .forEach(r=>attention.push({severity:'yellow',kind:'inactive_student',name:r.full_name,case_number:r.case_number,
      text:'بیش از ۱۴ روز است جلسه تمرینی ثبت نکرده است',sub:'با یک پیام او را به تمرین برگردانید',
      action:`/users-list/${r.case_number}`,action_label:'پیام / مشاهده'}));
  const severityRank={red:0,yellow:1,blue:2};
  attention.sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]);
  const attentionTop=attention.slice(0,8);

  // --- نمای شاگردها (واقعی: آخرین برنامه/تمرین/پیشرفت زمانی) ---
  const students_overview=rows(`SELECT s.id, s.full_name, s.case_number, s.goal, s.created_at,
      (SELECT title FROM training_programs tp WHERE tp.student_id=s.id AND tp.deleted_at IS NULL ORDER BY tp.id DESC LIMIT 1) program_title,
      (SELECT status FROM training_programs tp WHERE tp.student_id=s.id AND tp.deleted_at IS NULL ORDER BY tp.id DESC LIMIT 1) program_status,
      (SELECT start_date FROM training_programs tp WHERE tp.student_id=s.id AND tp.deleted_at IS NULL ORDER BY tp.id DESC LIMIT 1) program_start,
      (SELECT end_date FROM training_programs tp WHERE tp.student_id=s.id AND tp.deleted_at IS NULL ORDER BY tp.id DESC LIMIT 1) program_end,
      (SELECT MAX(ws.started_at) FROM workout_sessions ws WHERE ws.student_id=s.id AND ws.deleted_at IS NULL) last_workout,
      (SELECT COUNT(*) FROM workout_sessions ws WHERE ws.student_id=s.id AND ws.deleted_at IS NULL AND ws.status='COMPLETED') completed_sessions
    FROM students s WHERE s.deleted_at IS NULL ORDER BY (SELECT MAX(COALESCE(ws.started_at,'')) FROM workout_sessions ws WHERE ws.student_id=s.id) DESC, s.id DESC LIMIT 6`)
    .map(r=>{
      let progress=null;
      if(r.program_status==='ACTIVE'&&r.program_start&&r.program_end){
        const totalDays=Math.round((new Date(r.program_end)-new Date(r.program_start))/86400000)||1;
        const passed=Math.round((new Date(today)-new Date(r.program_start))/86400000);
        progress=Math.min(100,Math.max(0,Math.round(passed/totalDays*100)));
      }
      const lastDays=r.last_workout?Math.floor((new Date(today)-new Date(String(r.last_workout).slice(0,10)))/86400000):null;
      const status=!r.program_title?'idle':(r.program_status==='ACTIVE'?(lastDays!=null&&lastDays>7?'attention':'active'):'idle');
      return {...r,progress,last_days:lastDays,status};
    });
  const statusSummary={active:activeStudents,attention:students_overview.filter(x=>x.status==='attention').length+attentionTop.filter(a=>a.severity!=='blue').length,idle:Math.max(0,total-activeStudents)};

  // --- تایم‌لاین واقعی (ادغام رویدادهای موجود) ---
  const events=[];
  rows('SELECT id, full_name, case_number, created_at FROM students WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 5').forEach(r=>events.push({type:'student',name:r.full_name,text:'به سیستم اضافه شد',at:r.created_at,route:`/users-list/${r.case_number}`}));
  rows(`SELECT tp.id, tp.title, tp.status, tp.created_at, s.full_name, s.case_number FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id WHERE tp.deleted_at IS NULL ORDER BY tp.id DESC LIMIT 5`).forEach(r=>events.push({type:'program',name:r.full_name||r.title,text:`برنامه «${r.title}» ساخته شد`,at:r.created_at,route:r.case_number?`/users-list/${r.case_number}`:'/templates/exercise/list'}));
  rows(`SELECT ba.id, ba.assessment_number, ba.submitted_at, s.full_name, s.case_number FROM body_assessments ba JOIN students s ON s.id=ba.student_id WHERE ba.submitted_at IS NOT NULL AND ba.deleted_at IS NULL ORDER BY ba.submitted_at DESC LIMIT 4`).forEach(r=>events.push({type:'assessment',name:r.full_name,text:`ارزیابی شماره ${r.assessment_number} را ارسال کرد`,at:r.submitted_at,route:`/assessments/${r.id}`}));
  rows(`SELECT ws.id, ws.completed_at, s.full_name, s.case_number FROM workout_sessions ws JOIN students s ON s.id=ws.student_id WHERE ws.status='COMPLETED' AND ws.deleted_at IS NULL ORDER BY ws.completed_at DESC LIMIT 4`).forEach(r=>events.push({type:'workout',name:r.full_name,text:'جلسه تمرینی را تکمیل کرد',at:r.completed_at,route:`/users-list/${r.case_number}`}));
  events.sort((a,b)=>new Date(String(b.at).replace(' ','T')+(String(b.at).includes('Z')?'':'Z'))-new Date(String(a.at).replace(' ','T')+(String(a.at).includes('Z')?'':'Z')));
  const timeline=events.slice(0,8);

  // --- سری روند ۳۰ روزه (جلسات تمرین + برنامه‌های ساخته‌شده) ---
  const workoutByDay={},programByDay={};
  rows(`SELECT substr(started_at,1,10) d, COUNT(*) c FROM workout_sessions WHERE deleted_at IS NULL AND started_at>=? GROUP BY substr(started_at,1,10)`,d30).forEach(r=>workoutByDay[r.d]=r.c);
  rows(`SELECT substr(created_at,1,10) d, COUNT(*) c FROM training_programs WHERE deleted_at IS NULL AND created_at>=? GROUP BY substr(created_at,1,10)`,d30).forEach(r=>programByDay[r.d]=r.c);
  const series=[];for(let i=29;i>=0;i--){const day=isoDay(-i);series.push({day,workouts:workoutByDay[day]||0,programs:programByDay[day]||0});}

  return send(res,200,{
    stats:{total,active,waiting,movements,categories, trainingPrograms: trainingProgs},
    activities: rows('SELECT * FROM activity_log ORDER BY id DESC LIMIT 8'),
    students: rows('SELECT * FROM students WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 5').map(safeCoachStudent),
    // v2 (افزایشی)
    v2:{activePrograms,activeStudents,trend,attention:attentionTop,students_overview,statusSummary,timeline,series,
        greeting:{attentionCount:attentionTop.filter(a=>a.severity!=='blue').length,endingSoon:attentionTop.filter(a=>a.kind==='program_ending').length,ended:attentionTop.filter(a=>a.kind==='program_ended').length}}
  });
}

async function handleStudents(req,res,url){
  if(url.pathname!=='/api/students') return null;
  if(req.method==='GET'){
    const management=url.searchParams.get('view')==='management';
    if(management){
      const result=studentService.getManagedStudents(db,{
        search:url.searchParams.get('search')||'',
        status:url.searchParams.get('status')||'ALL',
        page:url.searchParams.get('page')||1,
        pageSize:url.searchParams.get('page_size')||20
      });
      return send(res,200,result);
    }
    // Backward-compatible compact list used by the existing Program Builder.
    return send(res,200,rows('SELECT * FROM students WHERE deleted_at IS NULL ORDER BY id DESC').map(safeCoachStudent));
  }
  if(req.method==='POST'){
    const b=await readBody(req);
    const errors = validateStudentPayload(b);
    if(errors.length) return sendError(res,400, errors[0], errors);
    if(!String(b.mobile||'').trim())return sendError(res,400,'شماره همراه الزامی است');
    let auth;
    try{auth=studentAuthService.authColumnsForMobile(b.mobile);}catch(error){return sendError(res,error.statusCode||400,error.message);}
    if(one('SELECT id FROM students WHERE mobile_normalized=? AND deleted_at IS NULL',auth.mobile_normalized))return sendError(res,409,'این شماره همراه قبلاً ثبت شده است');
    const stableId = crypto.randomUUID ? crypto.randomUUID() : programService.genUUID();
    db.exec('BEGIN');
    try{
      const r=db.prepare(`
        INSERT INTO students
          (full_name,mobile,mobile_normalized,goal,status,weight,height,stable_id,password_hash,password_state,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).run(b.full_name.trim(),auth.mobile_normalized,auth.mobile_normalized,'','فعال',null,null,stableId,auth.password_hash,auth.password_state);
      const studentId=Number(r.lastInsertRowid),invite=studentService.createInvite(db,studentId,30),created=one('SELECT id,stable_id,case_number,mobile FROM students WHERE id=?',studentId),temporaryPassword=studentAuthService.temporaryPassword(created.mobile);
      db.exec('COMMIT');
      log('شاگرد جدید ثبت شد',`${created.case_number} - ${b.full_name}`);
      auditService.record(db,{actorType:'coach',action:'student.created',entityType:'student',entityId:studentId,entityStableId:stableId,metadata:{case_number:created.case_number}});
      return send(res,201,{...created,invitation_id:invite.id,join_url:`/join/${invite.token}`,token:invite.token,token_preview:invite.token_preview,expires_at:invite.expires_at,temporary_password:temporaryPassword,password_change_recommended:true});
    }catch(error){try{db.exec('ROLLBACK');}catch(rollbackError){}if(String(error.message).includes('UNIQUE constraint failed'))return sendError(res,409,'این شماره همراه قبلاً ثبت شده است');return sendError(res,400,error.message);}
  }
  return sendError(res,405,'متد مجاز نیست');
}

async function handleStudentsDelete(req,res,url){
  const match = url.pathname.match(/^\/api\/students\/(\d+)$/);
  if(!match) return null;
  const student=studentByReference(match[1]);
  if(!student)return sendError(res,404,'شاگرد پیدا نشد');
  const id=student.id;
  if(req.method==='DELETE'){
    // Soft delete
    const r=db.prepare('UPDATE students SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL').run(id);
    if(!r.changes) return sendError(res,404,'شاگرد پیدا نشد');
    log('شاگرد حذف شد (soft)', `id ${id}`);
    return send(res,200,{id, soft_deleted:true});
  }
  if(req.method==='GET'){
    const detail=studentService.getManagedStudentDetail(db,id);
    if(!detail) return sendError(res,404,'شاگرد پیدا نشد');
    return send(res,200,detail);
  }
  return null;
}

async function handleExercises(req,res,url){
  const p=url.pathname;

  if(p==='/api/categories' && req.method==='GET'){
    const raw = rows('SELECT c.id,c.name,c.sort_order,c.original_id, s.id subcategory_id,s.name subcategory_name,s.sort_order subcategory_sort_order, s.original_id subcategory_original_id FROM exercise_categories c LEFT JOIN exercise_subcategories s ON s.category_id=c.id WHERE c.deleted_at IS NULL AND (s.deleted_at IS NULL OR s.deleted_at IS NULL) ORDER BY c.sort_order,s.sort_order');
    const counts = {};
    try {
      const countRows = rows('SELECT category_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL GROUP BY category_id');
      countRows.forEach(r=>counts[r.category_id]=r.cnt);
    } catch(e){}
    return send(res,200,raw.map(r=>({...r, count: counts[r.id]||0})));
  }

  if(p==='/api/categories/grouped' && req.method==='GET'){
    const locationRaw=url.searchParams.get('location')||'both';
    const location=locationRaw==='all'?'both':locationRaw; // «همه محل‌ها» = both
    if(!['gym','home','both'].includes(location))return sendError(res,400,'محل تمرین نامعتبر است');
    const cats = rows('SELECT * FROM exercise_categories WHERE deleted_at IS NULL ORDER BY sort_order');
    const subs = rows('SELECT * FROM exercise_subcategories WHERE deleted_at IS NULL ORDER BY sort_order');
    const counts = {},countSql=location==='both'?'SELECT category_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL GROUP BY category_id':"SELECT category_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL AND (location=? OR location='both') GROUP BY category_id";
    rows(countSql,...(location==='both'?[]:[location])).forEach(r=>counts[r.category_id]=r.cnt);
    const subCounts = {},subCountSql=location==='both'?'SELECT subcategory_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL AND subcategory_id IS NOT NULL GROUP BY subcategory_id':"SELECT subcategory_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL AND subcategory_id IS NOT NULL AND (location=? OR location='both') GROUP BY subcategory_id";
    rows(subCountSql,...(location==='both'?[]:[location])).forEach(r=>subCounts[r.subcategory_id]=r.cnt);
    const grouped = cats.filter(c=>location==='both'||Number(counts[c.id]||0)>0).map(c=>{
      return {
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
        original_id: c.original_id,
        stable_id: c.stable_id,
        version: c.version,
        count: counts[c.id]||0,
        subs: subs.filter(s=>s.category_id===c.id&&(location==='both'||Number(subCounts[s.id]||0)>0)).map(s=>({
          id: s.id,
          name: s.name,
          sort_order: s.sort_order,
          original_id: s.original_id,
          stable_id: s.stable_id,
          version: s.version,
          count: subCounts[s.id]||0
        }))
      };
    });
    return send(res,200,grouped);
  }

  if(p==='/api/exercises' && req.method==='GET'){
    const location=url.searchParams.get('location')||'gym';
    const categoryId=url.searchParams.get('categoryId');
    const subCategoryId=url.searchParams.get('subCategoryId');
    const status=url.searchParams.get('status')||'active';
    const query=(url.searchParams.get('query')||'').trim();
    const page = parseInt(url.searchParams.get('page')||'0');
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize')||'24'), 100); // limit max 100
    const sortBy = url.searchParams.get('sortBy')||'priority';

    // جستجوی سراسری پویا: بدون دسته، همه محل‌ها، با نرمال‌سازی فارسی
    if(!categoryId) {
      if(!query) return send(res,200,{items:[], total:0, page, pageSize, totalPages:0});
      const loc=url.searchParams.get('location')||'both';
      const safeLoc=['gym','home','both','all'].includes(loc)?loc:'both';
      let sql='SELECT * FROM exercises WHERE status=? AND deleted_at IS NULL';
      const params=[status];
      if(safeLoc==='gym'||safeLoc==='home'){
        sql+=' AND (location=? OR location=\'both\')';
        params.push(safeLoc);
      }
      const candidates=rows(sql,...params);
      const scored=candidates
        .map(ex=>({ex,score:exerciseSearchScore(ex.name_fa,query)}))
        .filter(item=>item.score>=0)
        .sort((a,b)=>a.score-b.score||(a.ex.priority||5)-(b.ex.priority||5)||a.ex.name_fa.localeCompare(b.ex.name_fa,'fa'));
      const total=scored.length;
      const items=scored.slice(page*pageSize,page*pageSize+pageSize).map(item=>item.ex);
      return send(res,200,{items, total, page, pageSize, totalPages:Math.ceil(total/pageSize)});
    }

    // Validate category exists
    const catExists = one('SELECT id FROM exercise_categories WHERE id=? AND deleted_at IS NULL', categoryId);
    if(!catExists) return sendError(res,400,'دسته‌بندی نامعتبر');

    let sql='SELECT * FROM exercises WHERE category_id=? AND status=? AND deleted_at IS NULL';
    let countSql='SELECT COUNT(*) as total FROM exercises WHERE category_id=? AND status=? AND deleted_at IS NULL';
    let params=[categoryId,status];
    let countParams=[categoryId,status];

    if(location!=='both'){
      sql+=' AND (location=? OR location=\'both\')';
      countSql+=' AND (location=? OR location=\'both\')';
      params.push(location);
      countParams.push(location);
    }
    if(subCategoryId&&subCategoryId!=='all'){
      sql+=' AND subcategory_id=?';
      countSql+=' AND subcategory_id=?';
      params.push(subCategoryId);
      countParams.push(subCategoryId);
    }
    if(query){
      sql+=' AND name_fa LIKE ?';
      countSql+=' AND name_fa LIKE ?';
      const normalizedQuery=normalizeFaText(query);
      params.push(`%${normalizedQuery}%`);
      countParams.push(`%${normalizedQuery}%`);
    }

    const total = one(countSql,...countParams)?.total || 0;

    if(sortBy==='name') sql+=' ORDER BY name_fa ASC';
    else if(sortBy==='id') sql+=' ORDER BY original_id ASC, id ASC';
    else sql+=' ORDER BY priority ASC, name_fa ASC';

    sql+=` LIMIT ? OFFSET ?`;
    params.push(pageSize, page*pageSize);

    const items = rows(sql,...params);
    const totalPages = Math.ceil(total / pageSize);

    return send(res,200,{items, total, page, pageSize, totalPages});
  }

  if(p==='/api/exercises/all' && req.method==='GET'){
    const categoryId=url.searchParams.get('categoryId');
    let sql='SELECT * FROM exercises WHERE deleted_at IS NULL';
    let params=[];
    if(categoryId){
      sql+=' AND category_id=?';
      params.push(categoryId);
    }
    sql+=' ORDER BY category_id, priority ASC, name_fa ASC LIMIT 500';
    return send(res,200,rows(sql,...params));
  }

  if(p==='/api/exercises' && req.method==='POST'){
    const b=await readBody(req);
    const errors = validateExercisePayload(b);
    if(errors.length) return sendError(res,400, errors[0], errors);

    // Validate category exists
    const catExists = one('SELECT id FROM exercise_categories WHERE id=? AND deleted_at IS NULL', b.category_id);
    if(!catExists) return sendError(res,400,'دسته‌بندی نامعتبر');

    const stableId = crypto.randomUUID ? crypto.randomUUID() : programService.genUUID();
    const targetMusclesStr = b.target_muscles ? (Array.isArray(b.target_muscles) ? JSON.stringify(b.target_muscles) : String(b.target_muscles)) : null;
    const r=db.prepare('INSERT INTO exercises (original_id, name_fa, location, category_id, subcategory_id, status, image_path, video_path, priority, target_muscles, stable_id, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(b.original_id||null, b.name_fa.trim(), b.location||'gym', b.category_id, b.subcategory_id||null, b.status==='archived'?'archived':'active', b.image_path||null, b.video_path||null, Number(b.priority)||5, targetMusclesStr, stableId, 1);
    log('حرکت جدید ثبت شد', b.name_fa);
    return send(res,201,{id:Number(r.lastInsertRowid), stable_id: stableId});
  }

  // Single exercise
  const exerciseMatch=p.match(/^\/api\/exercises\/(\d+)$/);
  if(exerciseMatch){
    const id=Number(exerciseMatch[1]);
    if(req.method==='GET'){
      const ex = one('SELECT * FROM exercises WHERE id=? AND deleted_at IS NULL', id);
      if(!ex) return sendError(res,404,'حرکت پیدا نشد');
      if(ex.target_muscles){
        try{ ex.target_muscles = JSON.parse(ex.target_muscles); }catch(e){}
      }
      return send(res,200,ex);
    }
    if(req.method==='PUT'){
      const b=await readBody(req);
      const errors = validateExercisePayload(b);
      if(errors.length) return sendError(res,400, errors[0], errors);

      const catExists = one('SELECT id FROM exercise_categories WHERE id=? AND deleted_at IS NULL', b.category_id);
      if(!catExists) return sendError(res,400,'دسته‌بندی نامعتبر');

      const targetMusclesStr = b.target_muscles ? (Array.isArray(b.target_muscles) ? JSON.stringify(b.target_muscles) : String(b.target_muscles)) : null;
      const r=db.prepare('UPDATE exercises SET name_fa=?,location=?,category_id=?,subcategory_id=?,status=?,image_path=?,video_path=?,priority=?,target_muscles=?,updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL')
        .run(b.name_fa.trim(), b.location||'gym', b.category_id, b.subcategory_id||null, b.status==='archived'?'archived':'active', b.image_path||null, b.video_path||null, Number(b.priority)||5, targetMusclesStr, id);
      if(!r.changes) return sendError(res,404,'حرکت پیدا نشد');
      log('حرکت ویرایش شد', b.name_fa);
      return send(res,200,{id});
    }
    if(req.method==='DELETE'){
      // Soft delete for exercises
      const r=db.prepare('UPDATE exercises SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL').run(id);
      if(!r.changes) return sendError(res,404,'حرکت پیدا نشد');
      log('حرکت حذف شد (soft)', `id ${id}`);
      return send(res,200,{id, soft_deleted:true});
    }
  }

  // Bulk
  if(p==='/api/exercises/bulk-archive' && req.method==='POST'){
    const b=await readBody(req);
    const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(n=>Number.isInteger(n)&&n>0):[];
    if(!ids.length) return sendError(res,400,'حداقل یک حرکت انتخاب کنید');
    if(ids.length>100) return sendError(res,400,'حداکثر 100 حرکت در هر درخواست');
    const marks=ids.map(()=>'?').join(',');
    db.prepare(`UPDATE exercises SET status=?,updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id IN (${marks}) AND deleted_at IS NULL`).run('archived',...ids);
    log('حرکات آرشیو شدند', `${ids.length} حرکت`);
    return send(res,200,{count:ids.length});
  }
  if(p==='/api/exercises/bulk-restore' && req.method==='POST'){
    const b=await readBody(req);
    const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(n=>Number.isInteger(n)&&n>0):[];
    if(!ids.length) return sendError(res,400,'حداقل یک حرکت انتخاب کنید');
    if(ids.length>100) return sendError(res,400,'حداکثر 100 حرکت');
    const marks=ids.map(()=>'?').join(',');
    db.prepare(`UPDATE exercises SET status=?,updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id IN (${marks}) AND deleted_at IS NULL`).run('active',...ids);
    log('حرکات بازیابی شدند', `${ids.length} حرکت`);
    return send(res,200,{count:ids.length});
  }
  if(p==='/api/exercises/bulk-delete' && req.method==='DELETE'){
    const b=await readBody(req);
    const ids=Array.isArray(b.ids)?b.ids.map(Number).filter(n=>Number.isInteger(n)&&n>0):[];
    if(!ids.length) return sendError(res,400,'حداقل یک حرکت انتخاب کنید');
    if(ids.length>100) return sendError(res,400,'حداکثر 100 حرکت');
    const marks=ids.map(()=>'?').join(',');
    // Soft delete bulk
    db.prepare(`UPDATE exercises SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id IN (${marks}) AND deleted_at IS NULL`).run(...ids);
    log('حرکات حذف شدند (soft)', `${ids.length} حرکت`);
    return send(res,200,{count:ids.length, soft_deleted:true});
  }

  if(p==='/api/exercises/import' && req.method==='POST'){
    const { importExercisesFromJson } = require('./src/database');
    const count = importExercisesFromJson();
    return send(res,200,{imported:count, total: one('SELECT COUNT(*) as total FROM exercises WHERE deleted_at IS NULL').total});
  }

  if(p==='/api/images/status' && req.method==='GET'){
    const importedDir = path.join(publicDir, 'assets', 'images', 'exercises', 'imported');
    let count = 0, sample = [];
    try {
      if (fs.existsSync(importedDir)) {
        const files = fs.readdirSync(importedDir);
        const images = files.filter(f => ['.png','.jpg','.jpeg','.gif','.webp'].includes(path.extname(f).toLowerCase()));
        count = images.length;
        sample = images.slice(0, 20);
      }
    } catch(e){}
    const organizedDir = path.join(dataSourceDir, 'exercises_organized');
    let organizedCount = 0;
    try {
      if (fs.existsSync(organizedDir)) {
        const stack = [organizedDir];
        while(stack.length){
          const cur = stack.pop();
          const entries = fs.readdirSync(cur, {withFileTypes:true});
          for(const en of entries){
            if(en.isDirectory()) stack.push(path.join(cur, en.name));
            else if(en.isFile() && ['.png','.jpg','.jpeg','.gif','.webp'].includes(path.extname(en.name).toLowerCase())) organizedCount++;
          }
        }
      }
    } catch(e){}
    let dbWithImage = 0, dbWithoutImage = 0, dbActiveWithImage = 0, dbActiveWithoutImage = 0, dbArchived = 0;
    try {
      dbWithImage = one('SELECT COUNT(*) as c FROM exercises WHERE deleted_at IS NULL AND image_path IS NOT NULL AND image_path != ""').c;
      dbWithoutImage = one('SELECT COUNT(*) as c FROM exercises WHERE deleted_at IS NULL AND (image_path IS NULL OR image_path = "")').c;
      dbActiveWithImage = one('SELECT COUNT(*) as c FROM exercises WHERE deleted_at IS NULL AND status="active" AND image_path IS NOT NULL AND image_path != ""').c;
      dbActiveWithoutImage = one('SELECT COUNT(*) as c FROM exercises WHERE deleted_at IS NULL AND status="active" AND (image_path IS NULL OR image_path = "")').c;
      dbArchived = one('SELECT COUNT(*) as c FROM exercises WHERE deleted_at IS NULL AND status="archived"').c;
    } catch(e){}
    return send(res,200,{
      imported: count,
      organized: organizedCount,
      sample,
      importedDir,
      organizedDir,
      db: {
        total: dbWithImage + dbWithoutImage,
        withImage: dbWithImage,
        withoutImage: dbWithoutImage,
        activeWithImage: dbActiveWithImage,
        activeWithoutImage: dbActiveWithoutImage,
        archived: dbArchived
      }
    });
  }

  if(p.startsWith('/api/exercise-image/') && req.method==='GET'){
    const originalId = p.replace('/api/exercise-image/','').split('?')[0].trim();
    if(!originalId || originalId.length>50) return sendError(res,400,'ID نامعتبر');
    const sanitizedId = originalId.replace(/[^a-zA-Z0-9_-]/g,'').substring(0,50);
    if(!sanitizedId) return sendError(res,400,'ID نامعتبر');

    const blankWhiteSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>');

    function findByOriginalId(dir, id) {
      if(!fs.existsSync(dir)) return null;
      const stack = [dir];
      const idStr = String(id);
      while(stack.length){
        const current = stack.pop();
        try {
          const entries = fs.readdirSync(current, {withFileTypes:true});
          for(const entry of entries){
            const full = path.join(current, entry.name);
            if(!isSafePath(dir, full)) continue; // Security: prevent escaping
            if(entry.isFile()){
              const name = entry.name;
              const ext = path.extname(name).toLowerCase();
              if(!['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) continue;
              if(name.toLowerCase() === idStr.toLowerCase() + ext) return full;
              if(name.startsWith(idStr + '_') || name.startsWith(idStr + '-') || name.startsWith(idStr + ' ')) return full;
              const match = name.match(/^(\d+)[^0-9]/);
              if(match && match[1] === idStr) return full;
            }
            if(entry.isDirectory()){
              if(isSafePath(dir, full)) stack.push(full);
            }
          }
        } catch(e){}
      }
      return null;
    }

    const importedRoot = path.join(publicDir, 'assets', 'images', 'exercises', 'imported');
    const organizedRoot = path.join(dataSourceDir, 'exercises_organized');
    const publicRoot = path.join(publicDir, 'assets', 'images', 'exercises');

    // 1. Check in database first to disambiguate internal ID vs original_id vs manual exercise
    const ex = one('SELECT id, original_id, image_path FROM exercises WHERE original_id=? OR id=? AND deleted_at IS NULL', sanitizedId, sanitizedId);
    if(ex){
      if(ex.image_path && ex.image_path.trim()){
        const rel = ex.image_path.replace('/files/exercise/','').replace('/assets/images/exercises/','');
        const base = path.basename(rel);
        const candidates = [
          path.join(importedRoot, base),
          path.join(organizedRoot, rel),
          path.join(publicRoot, base)
        ];
        for(const c of candidates){
          if(fs.existsSync(c) && (isSafePath(publicDir, c) || isSafePath(dataSourceDir, c))){
            const ext = path.extname(c).toLowerCase();
            res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
            return fs.createReadStream(c).pipe(res);
          }
        }
      }
      if(ex.original_id){
        const origIdStr = String(ex.original_id);
        let found = findByOriginalId(importedRoot, origIdStr)
                 || findByOriginalId(organizedRoot, origIdStr)
                 || findByOriginalId(publicRoot, origIdStr);
        if(found && fs.existsSync(found) && (isSafePath(publicDir, found) || isSafePath(dataSourceDir, found))){
          const ext = path.extname(found).toLowerCase();
          res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
          return fs.createReadStream(found).pipe(res);
        }
      }
      // Manual exercise or stock exercise with missing image: serve blank white image
      res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'});
      return res.end(blankWhiteSvg);
    }

    // 2. Direct lookup on disk for sanitizedId
    let found = findByOriginalId(importedRoot, sanitizedId)
             || findByOriginalId(organizedRoot, sanitizedId)
             || findByOriginalId(publicRoot, sanitizedId);

    if(!found){
      const directPaths = [
        path.join(importedRoot, sanitizedId + '.png'),
        path.join(importedRoot, sanitizedId + '.jpg'),
        path.join(importedRoot, sanitizedId + '.jpeg'),
      ];
      for(const dp of directPaths){
        if(isSafePath(importedRoot, dp) && fs.existsSync(dp)) { found = dp; break; }
      }
    }

    if(found && fs.existsSync(found) && (isSafePath(publicDir, found) || isSafePath(dataSourceDir, found))){
      const ext = path.extname(found).toLowerCase();
      res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
      return fs.createReadStream(found).pipe(res);
    }

    // Fallback: blank white image
    res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'});
    return res.end(blankWhiteSvg);
  }

  return null; // not handled
}

async function handleTrainingPrograms(req,res,url){
  if(requireCoach(req,res)) return true;
  const p=url.pathname;

  if(p==='/api/training-programs' && req.method==='GET'){
    const list = rows('SELECT tp.*,s.full_name student_name,s.case_number student_case_number,ba.assessment_number,ba.assessment_type FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id LEFT JOIN body_assessments ba ON ba.id=tp.assessment_id WHERE tp.deleted_at IS NULL ORDER BY tp.id DESC');
    return send(res,200,list.map(r=>{
      try{ r.program_data = JSON.parse(r.program_data||'{}'); }catch(e){ r.program_data={days:[]}; }
      return r;
    }));
  }

  if(p==='/api/training-programs' && req.method==='POST'){
    try {
      const b=await readBody(req);
      const errors = validation.validateRequestBody(b);
      if(errors.length) return sendError(res,400, errors[0], errors);

      // Use service for single source of truth
      const result = programService.createProgramInDB(db, b);
      log('برنامه تمرینی جدید ساخته شد', b.title||`id ${result.id}`);
      const created=one('SELECT stable_id,student_id,assessment_id FROM training_programs WHERE id=?',result.id);auditService.record(db,{actorType:'coach',action:'program.created',entityType:'training_program',entityId:Number(result.id),entityStableId:created?.stable_id,metadata:{student_id:created?.student_id,assessment_id:created?.assessment_id}});
      return send(res,201,{id: result.id, programData: result.programData});
    } catch(e){
      if(e.validationErrors){
        return sendError(res, e.statusCode||400, e.message, e.validationErrors);
      }
      console.error('Create program error:', e);
      return sendError(res,e.statusCode||500,e.statusCode?e.message:'خطا در ساخت برنامه');
    }
  }

  const lifecycleMatch = p.match(/^\/api\/training-programs\/(\d+)\/(activate|complete|archive)$/);
  if(lifecycleMatch && req.method==='POST'){
    const id=Number(lifecycleMatch[1]);
    try {
      const action=lifecycleMatch[2],previousActive=action==='activate'?one("SELECT id,stable_id,student_id FROM training_programs WHERE student_id=(SELECT student_id FROM training_programs WHERE id=?) AND status='ACTIVE' AND id<>? AND deleted_at IS NULL",id,id):null;
      const updated = action==='activate'
        ? programService.activateProgram(db,id)
        : programService.transitionProgram(db,id,action==='complete'?'COMPLETED':'ARCHIVED');
      log(action==='activate'?'برنامه به شاگرد اختصاص یافت':'چرخه برنامه تغییر کرد', `program ${id}: ${updated.status}`);
      if(updated.student_id)engagementService.notify(db,{audienceType:'student',studentId:updated.student_id,type:`program_${action}`,title:action==='activate'?'برنامه جدید شما فعال شد':`وضعیت برنامه: ${updated.status}`,body:updated.title||'',entityType:'training_program',entityId:id});
      auditService.record(db,{actorType:'coach',action:`program.${action}`,entityType:'training_program',entityId:id,entityStableId:updated.stable_id,metadata:{student_id:updated.student_id,status:updated.status}});if(previousActive)auditService.record(db,{actorType:'system',action:'program.completed',entityType:'training_program',entityId:previousActive.id,entityStableId:previousActive.stable_id,metadata:{student_id:previousActive.student_id,replaced_by:id}});
      return send(res,200,updated);
    } catch(e){ return sendError(res,e.statusCode||400,e.message); }
  }

  const tpMatch = p.match(/^\/api\/training-programs\/(\d+)(\/full)?$/);
  if(tpMatch){
    const id = Number(tpMatch[1]);
    if(!Number.isInteger(id) || id<=0) return sendError(res,400,'شناسه نامعتبر');
    const isFull = !!tpMatch[2];

    if(req.method==='GET'){
      try {
        const prog = one('SELECT tp.*,s.full_name student_name,s.case_number student_case_number,ba.assessment_number,ba.assessment_type FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id LEFT JOIN body_assessments ba ON ba.id=tp.assessment_id WHERE tp.id=? AND tp.deleted_at IS NULL', id);
        if(!prog) return sendError(res,404,'برنامه پیدا نشد');
        try{ prog.program_data = JSON.parse(prog.program_data||'{}'); }catch(e){ prog.program_data={days:[]}; }

        if(isFull){
          // Always build from normalized tables - primary source of truth
          const built = programService.buildProgramFromDB(db, id);
          if(built){
            prog.program_data = built.programData;
            // Sync JSON representation
            try {
              db.prepare('UPDATE training_programs SET program_data=? WHERE id=?').run(JSON.stringify(built.programData), id);
            } catch(e){}
          }
        }

        return send(res,200,prog);
      } catch(e){
        console.error('Get program error:', e);
        return sendError(res,500,'خطا در دریافت برنامه');
      }
    }

    if(req.method==='PUT'){
      try {
        const b=await readBody(req);
        const bodyErrors = validation.validateRequestBody(b);
        if(bodyErrors.length) return sendError(res,400, bodyErrors[0], bodyErrors);

        // If program_data present, validate full program
        if(b.program_data){
          const progToValidate = typeof b.program_data === 'string' ? JSON.parse(b.program_data) : b.program_data;
          // Merge with existing title for validation if needed
          const existing = one('SELECT title FROM training_programs WHERE id=?', id);
          if(!progToValidate.title) progToValidate.title = b.title || existing?.title || 'برنامه';
          const valErrors = validation.validateProgram(progToValidate);
          if(valErrors.length) return sendError(res,400, valErrors[0], valErrors);
        }

        const result = programService.saveProgramToDB(db, id, b);
        log('برنامه تمرینی ویرایش شد', b.title||`id ${id}`);
        return send(res,200,{id, programData: result.programData});
      } catch(e){
        if(e.validationErrors){
          return sendError(res, e.statusCode||400, e.message, e.validationErrors);
        }
        console.error('Update program error:', e);
        return sendError(res, e.statusCode||500, e.message||'خطا در ویرایش');
      }
    }

    if(req.method==='DELETE'){
      try {
        const existing = one('SELECT id, stable_id, student_id, status FROM training_programs WHERE id=? AND deleted_at IS NULL', id);
        if(!existing) return sendError(res,404,'برنامه پیدا نشد یا قبلاً حذف شده است');

        const r=db.prepare("UPDATE training_programs SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL").run(id);
        log('برنامه تمرینی حذف شد (soft)', `id ${id}`);
        auditService.record(db,{actorType:'coach',action:'program.deleted',entityType:'training_program',entityId:Number(id),entityStableId:existing.stable_id,metadata:{student_id:existing.student_id,status:existing.status}});
        return send(res,200,{id, soft_deleted:true, message: 'برنامه تمرینی با موفقیت حذف شد'});
      } catch(e){
        console.error('Delete program error:', e);
        return sendError(res,500,'خطا در حذف برنامه: ' + e.message);
      }
    }
  }

  return null;
}

async function handleStudentInvites(req,res,url){
  if(requireCoach(req,res)) return true;
  const p=url.pathname;
  if(p==='/api/student-invites' && req.method==='GET'){
    const list = rows(`
      SELECT si.id, si.stable_id, si.student_id, si.token_preview, si.status, si.created_at, si.expires_at, si.used_at, si.opened_at, si.use_count, si.max_uses, si.revoked_at, s.full_name, s.mobile, s.case_number
      FROM student_invites si
      JOIN students s ON s.id=si.student_id AND s.deleted_at IS NULL
      WHERE si.deleted_at IS NULL
      ORDER BY si.id DESC
    `);
    return send(res,200,list);
  }
  if(p==='/api/student-invites' && req.method==='POST'){
    if(!rateLimit(req,res,'coach-invitations',20,10*60*1000))return true;
    const b=await readBody(req);
    if(!b.student_id || !Number.isInteger(Number(b.student_id))) return sendError(res,400,'student_id الزامی است');
    const studentId = Number(b.student_id);
    const student = one('SELECT id,case_number FROM students WHERE id=? AND deleted_at IS NULL', studentId);
    if(!student) return sendError(res,404,'شاگرد پیدا نشد');
    const expiresDays = b.expires_in_days != null ? Number(b.expires_in_days) : 30;
    if(!Number.isInteger(expiresDays) || expiresDays < 0 || expiresDays > 3650) return sendError(res,400,'اعتبار دعوت باید بین صفر تا ۳۶۵۰ روز باشد');
    let result;
    try { result = studentService.createInvite(db, studentId, expiresDays); }
    catch(e){ return sendError(res,400,e.message); }
    log('لینک دعوت شاگرد ساخته شد', `${result.token_preview} برای ${studentId}`);
    auditService.record(db,{actorType:'coach',action:'invitation.created',entityType:'student_invitation',entityId:Number(result.id),entityStableId:result.stable_id,metadata:{student_id:studentId,expires_at:result.expires_at}});
    // Return token only once, plus join URL
    const joinUrl = `/join/${result.token}`;
    return send(res,201,{id: result.id, stable_id: result.stable_id, student_id: studentId, case_number:student.case_number, token: result.token, token_preview: result.token_preview, join_url: joinUrl, expires_at: result.expires_at});
  }

  const revokeMatch = p.match(/^\/api\/student-invites\/(\d+)\/revoke$/);
  if(revokeMatch && req.method==='POST'){
    const id=Number(revokeMatch[1]);
    const ok = studentService.revokeInvite(db, id);
    if(!ok) return sendError(res,404,'دعوت پیدا نشد');
    studentSessionService.revokeInvitationSessions(db,id);
    log('لینک دعوت و نشست‌های مرتبط باطل شد', `id ${id}`);
    auditService.record(db,{actorType:'coach',action:'invitation.revoked',entityType:'student_invitation',entityId:id});
    return send(res,200,{id, revoked:true});
  }

  return null;
}

function invitationErrorResponse(res,error){
  const errors={
    invalid:[404,'لینک نامعتبر است','INVALID_INVITATION'],
    expired:[410,'این لینک منقضی شده است','EXPIRED_INVITATION'],
    revoked:[410,'این لینک لغو شده است','REVOKED_INVITATION'],
    used:[409,'این دعوت قبلاً استفاده شده است','USED_INVITATION']
  };
  const [status,message,code]=errors[error]||errors.invalid;
  return send(res,status,{error:message,code});
}
function latestStudentAssessment(studentId,submittedOnly=false){
  return one(`SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ${submittedOnly?'AND submitted_at IS NOT NULL':''} ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
}
function assessmentPhotos(assessmentId){
  if(!assessmentId)return [];
  return rows(`SELECT ${PHOTO_METADATA_COLUMNS} FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL ORDER BY photo_type`,assessmentId);
}
function studentNextRoute(studentId){
  const latest=latestStudentAssessment(studentId);
  const lifecycle=latest?.lifecycle_status||latest?.status;
  if(!latest || ['DRAFT','CHANGES_REQUESTED','PROFILE_INCOMPLETE','ASSESSMENT_PENDING'].includes(lifecycle))return '/student/onboarding';
  if(lifecycle==='APPROVED'&&latest.program_id){
    const active=one("SELECT end_date FROM training_programs WHERE student_id=? AND status='ACTIVE' AND deleted_at IS NULL ORDER BY program_number DESC,id DESC LIMIT 1",studentId);
    const endTime=active?.end_date?new Date(String(active.end_date).includes('T')?active.end_date:`${active.end_date}T23:59:59`).getTime():null;
    if(!active || (Number.isFinite(endTime)&&endTime<Date.now()))return '/student/onboarding';
  }
  return '/student/dashboard';
}

async function handleStudentJoin(req,res,url){
  const inspectMatch=url.pathname.match(/^\/api\/student\/join\/([A-Za-z0-9_-]{43})$/);
  const acceptMatch=url.pathname.match(/^\/api\/student\/join\/([A-Za-z0-9_-]{43})\/accept$/);
  if((inspectMatch||acceptMatch)&&!rateLimit(req,res,'student-join',30,60*1000))return true;
  if(inspectMatch && req.method==='GET'){
    const inspected=studentSessionService.inspectInvitation(db,inspectMatch[1]);
    if(inspected.error)return invitationErrorResponse(res,inspected.error);
    return send(res,200,{valid:true,student_name:inspected.student.full_name||'',case_number:inspected.student.case_number||'',remaining_entries:inspected.invitation.remaining_uses,message:'دعوت معتبر است'});
  }
  if(acceptMatch && req.method==='POST'){
    return send(res,401,{error:'برای ورود، شماره همراه و رمز عبور را وارد کنید.',code:'PASSWORD_LOGIN_REQUIRED'});
  }
  return null;
}

function studentAuthError(res,code){
  const errors={INVALID_CREDENTIALS:[401,'شماره همراه یا رمز عبور نادرست است.'],AUTH_LOCKED:[429,'ورود موقتاً قفل شده است. ۱۵ دقیقه بعد دوباره تلاش کنید.'],AUTH_SETUP_REQUIRED:[403,'ورود این حساب هنوز آماده نیست؛ با مربی تماس بگیرید.']};
  const [status,message]=errors[code]||errors.INVALID_CREDENTIALS;return send(res,status,{error:message,code});
}
async function handleStudentAuth(req,res,url){
  if(url.pathname!=='/api/student/auth/login'||req.method!=='POST')return null;
  if(!sameOrigin(req))return sendError(res,403,'مبدأ درخواست مجاز نیست');
  if(!rateLimit(req,res,'student-password-login',30,15*60*1000))return true;
  const body=await readBody(req);
  if(body.invitation_token){
    const inspected=studentSessionService.inspectInvitation(db,body.invitation_token);
    if(inspected.error)return invitationErrorResponse(res,inspected.error);
    let normalized;try{normalized=studentAuthService.normalizeMobile(body.mobile);}catch(error){return studentAuthError(res,'INVALID_CREDENTIALS');}
    const invited=one('SELECT id,mobile,mobile_normalized FROM students WHERE id=? AND deleted_at IS NULL',inspected.invitation.student_id);
    let invitedMobile=invited?.mobile_normalized;
    if(invited&&!invitedMobile){try{invitedMobile=studentAuthService.normalizeMobile(invited.mobile);if(!one('SELECT id FROM students WHERE mobile_normalized=? AND id<>? AND deleted_at IS NULL',invitedMobile,invited.id))db.prepare('UPDATE students SET mobile_normalized=? WHERE id=?').run(invitedMobile,invited.id);}catch(error){}}
    if(!invited||invitedMobile!==normalized)return studentAuthError(res,'INVALID_CREDENTIALS');
  }
  const authenticated=studentAuthService.authenticate(db,body.mobile,body.password);
  if(authenticated.error)return studentAuthError(res,authenticated.error);
  let invitationId=null;
  if(body.invitation_token){
    const consumed=studentSessionService.consumeInvitation(db,body.invitation_token,authenticated.student.id);
    if(consumed.error)return invitationErrorResponse(res,consumed.error);
    invitationId=consumed.invitation_id;
  }
  const session=studentSessionService.createStudentSession(db,authenticated.student.id,invitationId),passwordChangeRecommended=authenticated.student.password_state!=='PERSONAL';
  auditService.record(db,{actorType:'student',actorId:authenticated.student.id,action:'student.login',entityType:'student',entityId:authenticated.student.id,metadata:{case_number:authenticated.student.case_number,password_change_recommended:passwordChangeRecommended,via_invitation:Boolean(invitationId)}});
  return send(res,200,{success:true,password_change_recommended:passwordChangeRecommended,next_route:studentNextRoute(authenticated.student.id),student:studentSessionService.safeStudent(authenticated.student),expires_at:session.expires_at},{'Set-Cookie':studentSessionService.sessionCookie(req,session.raw_session)});
}

function updateStudentProfileFromSession(studentId,body){
  const allowed=['full_name','mobile','telegram_id','instagram_id','date_of_birth','gender','height','weight','goal','training_experience','training_level','preferred_location','limitations','injuries','medical_notes'];
  const updates={};
  for(const key of allowed)if(body[key]!==undefined)updates[key]=body[key];
  if(!Object.keys(updates).length){const error=new Error('هیچ فیلدی برای ویرایش نیست');error.statusCode=400;throw error;}
  if(updates.full_name!==undefined && (!String(updates.full_name).trim()||String(updates.full_name).length>100)){const error=new Error('نام نامعتبر است');error.statusCode=400;throw error;}
  if(updates.mobile!==undefined && (typeof updates.mobile!=='string'||updates.mobile.length>20)){const error=new Error('موبایل نامعتبر است');error.statusCode=400;throw error;}
  if(updates.mobile!==undefined){
    const current=one('SELECT mobile,password_state FROM students WHERE id=? AND deleted_at IS NULL',studentId),normalized=studentAuthService.normalizeMobile(updates.mobile),duplicate=one('SELECT id FROM students WHERE mobile_normalized=? AND id<>? AND deleted_at IS NULL',normalized,studentId);
    if(duplicate)throw Object.assign(new Error('این شماره همراه قبلاً ثبت شده است'),{statusCode:409});
    updates.mobile_normalized=normalized;
    if(current?.password_state==='TEMPORARY'&&String(current.mobile)!==normalized){updates.password_hash=studentAuthService.hashPassword(studentAuthService.temporaryPassword(normalized));updates.temporary_login_at=null;}
    updates.mobile=normalized;
  }
  for(const key of ['telegram_id','instagram_id']){
    if(updates[key]!==undefined && (typeof updates[key]!=='string'||updates[key].length>100)){const error=new Error('شناسه شبکه اجتماعی نامعتبر است');error.statusCode=400;throw error;}
  }
  if(updates.date_of_birth){
    const birth=new Date(`${updates.date_of_birth}T00:00:00Z`),earliest=new Date('1900-01-01T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(updates.date_of_birth)||Number.isNaN(birth.getTime())||birth<earliest||birth>new Date()){
      const error=new Error('تاریخ تولد نامعتبر است');error.statusCode=400;throw error;
    }
  }
  if(updates.height!==undefined && updates.height!==null && (!Number.isFinite(Number(updates.height))||Number(updates.height)<100||Number(updates.height)>250)){const error=new Error('قد نامعتبر است');error.statusCode=400;throw error;}
  if(updates.weight!==undefined && updates.weight!==null && (!Number.isFinite(Number(updates.weight))||Number(updates.weight)<20||Number(updates.weight)>300)){const error=new Error('وزن نامعتبر است');error.statusCode=400;throw error;}
  if(updates.gender&&!['female','male','unspecified'].includes(updates.gender)){const error=new Error('جنسیت نامعتبر است');error.statusCode=400;throw error;}
  if(updates.preferred_location && !['gym','home'].includes(updates.preferred_location)){const error=new Error('محل تمرین نامعتبر است');error.statusCode=400;throw error;}
  for(const key of ['goal','training_experience','training_level','limitations','injuries','medical_notes']){
    if(updates[key]!==undefined && (typeof updates[key]!=='string'||updates[key].length>4000)){const error=new Error('اطلاعات متنی نامعتبر است');error.statusCode=400;throw error;}
  }
  const fields=[],params=[];
  for(const [key,value] of Object.entries(updates)){fields.push(`${key}=?`);params.push(value===null?null:(typeof value==='string'?value.trim():value));}
  fields.push("profile_status=CASE WHEN profile_status='INVITED' THEN 'PROFILE_INCOMPLETE' ELSE profile_status END");
  fields.push('updated_at=CURRENT_TIMESTAMP');fields.push('version=version+1');params.push(studentId);
  db.prepare(`UPDATE students SET ${fields.join(',')} WHERE id=? AND deleted_at IS NULL`).run(...params);
  return one('SELECT * FROM students WHERE id=? AND deleted_at IS NULL',studentId);
}

function applyDraftPhotoPreference(assessment){
  if(assessment?.body_photos_preference==='declined'){
    db.prepare(`
      UPDATE assessment_photos
      SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1
      WHERE assessment_id=? AND deleted_at IS NULL
    `).run(assessment.id);
  }
  return one('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL',assessment.id);
}
async function saveSessionAssessment(studentId,body){
  let assessment=one(`SELECT * FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
  if(assessment)return applyDraftPhotoPreference(studentService.updateAssessment(db,assessment.id,body));
  const previous=latestStudentAssessment(studentId);
  if(previous && studentNextRoute(studentId)!=='/student/onboarding'){
    const error=new Error('ارزیابی قبلی هنوز در حال بررسی است یا زمان ارزیابی جدید نرسیده است.');error.statusCode=409;throw error;
  }
  const student=one('SELECT * FROM students WHERE id=? AND deleted_at IS NULL',studentId);
  const created=studentService.createAssessment(db,studentId,{
    height:student.height,weight:student.weight,goal:student.goal,training_experience:student.training_experience,
    limitations:student.limitations,injuries:student.injuries,...body
  });
  auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.created',entityType:'assessment',entityId:Number(created.id),entityStableId:created.stable_id,metadata:{assessment_number:created.assessment_number,assessment_type:created.assessment_type}});
  return applyDraftPhotoPreference(one('SELECT * FROM body_assessments WHERE id=?',created.id));
}

async function handleSessionPhotoUpload(req,res,studentId){
  const assessment=one(`SELECT id,body_photos_preference FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
  if(!assessment)return sendError(res,404,'ابتدا اطلاعات ارزیابی را ذخیره کنید');
  if(assessment.body_photos_preference!=='willing')return sendError(res,409,'برای ارسال عکس، ابتدا گزینه «مایل هستم» را انتخاب کنید');
  const contentType=req.headers['content-type']||'';
  let file,photoType;
  if(contentType.includes('multipart/form-data')){
    const boundary=contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/"/g,'');
    if(!boundary)return sendError(res,400,'درخواست آپلود نامعتبر است');
    try{
      const parts=await uploadService.parseMultipart(req,boundary);
      const files=parts.filter(part=>part.type==='file');
      const fields=Object.fromEntries(parts.filter(part=>part.type==='field').map(part=>[part.name,part.value]));
      if(files.length!==1)return sendError(res,400,'در هر درخواست دقیقاً یک عکس ارسال کنید');
      file=files[0];photoType=fields.photo_type;
    }catch(error){return sendError(res,error.statusCode||400,error.message||'خطا در آپلود');}
  }else{
    const body=await readBody(req);photoType=body.photo_type;
    const raw=String(body.data||body.base64||'');
    const base64=raw.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i,'');
    if(!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length%4!==0)return sendError(res,400,'داده عکس نامعتبر است');
    const buffer=Buffer.from(base64,'base64');
    file={originalFilename:body.filename||`${photoType}.jpg`,mimeType:body.mime_type||'image/jpeg',size:buffer.length,data:buffer};
  }
  if(!uploadService.PHOTO_TYPES.includes(photoType))return sendError(res,400,'نوع عکس نامعتبر است');
  try{const photo=uploadService.saveAssessmentPhoto(db,studentId,assessment.id,file,photoType);auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.photo_uploaded',entityType:'assessment',entityId:assessment.id,metadata:{photo_id:Number(photo.id),photo_type:photoType,size_bytes:photo.size_bytes}});return send(res,201,{photo});}
  catch(error){return sendError(res,error.statusCode||400,error.message,error.validationErrors||null);}
}

async function handleSessionDocumentUpload(req,res,studentId){
  const assessment=one(`SELECT id FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
  if(!assessment)return sendError(res,404,'ابتدا ارزیابی را ذخیره کنید');
  const contentType=req.headers['content-type']||'',boundary=contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/"/g,'');
  if(!boundary)return sendError(res,400,'درخواست فایل نامعتبر است');
  try{
    const parts=await uploadService.parseMultipart(req,boundary),files=parts.filter(part=>part.type==='file'),fields=Object.fromEntries(parts.filter(part=>part.type==='field').map(part=>[part.name,part.value]));
    if(files.length!==1)return sendError(res,400,'در هر درخواست دقیقاً یک فایل ارسال کنید');
    const document=assessmentDocumentService.save(db,studentId,assessment.id,files[0],fields.document_type);auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.document_uploaded',entityType:'assessment',entityId:assessment.id,metadata:{document_id:Number(document.id),document_type:document.document_type,size_bytes:document.size_bytes}});return send(res,201,{document});
  }catch(error){return sendError(res,error.statusCode||400,error.message,error.validationErrors||null);}
}

async function handleStudentSessionApi(req,res,url){
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!sameOrigin(req))return sendError(res,403,'مبدأ درخواست مجاز نیست');
  const context=requireStudent(req,res);if(!context)return true;
  const studentId=context.student_id;
  const p=url.pathname;
  if(p==='/api/student/logout' && req.method==='POST'){
    studentSessionService.revokeCurrentSession(db,req);
    return send(res,200,{success:true},{'Set-Cookie':studentSessionService.clearSessionCookie(req)});
  }
  if(p==='/api/student/me' && req.method==='GET'){
    const passwordChangeRecommended=context.student.password_state!=='PERSONAL';
    return send(res,200,{student:studentSessionService.safeStudent(context.student),session_expires_at:context.expires_at,password_change_recommended:passwordChangeRecommended,next_route:studentNextRoute(studentId)});
  }
  if(p==='/api/student/auth/change-password'&&req.method==='POST'){
    try{
      const body=await readBody(req);
      if(body.new_password!==body.confirm_password)return sendError(res,400,'تکرار رمز جدید مطابقت ندارد');
      if(!studentAuthService.verifyPassword(body.current_password,context.student.password_hash))return send(res,401,{error:'رمز فعلی نادرست است',code:'INVALID_CURRENT_PASSWORD'});
      const changed=studentAuthService.setPersonalPassword(db,studentId,body.new_password);
      db.prepare('UPDATE student_sessions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND id<>? AND revoked_at IS NULL').run(studentId,context.session_id);
      auditService.record(db,{actorType:'student',actorId:studentId,action:'student.password_changed',entityType:'student',entityId:studentId,metadata:{from_temporary_password:context.student.password_state!=='PERSONAL'}});
      return send(res,200,{success:true,...changed,next_route:studentNextRoute(studentId)});
    }catch(error){return sendError(res,error.statusCode||400,error.message);}
  }
  if(p==='/api/student/notifications'&&req.method==='GET')return send(res,200,{notifications:engagementService.listNotifications(db,'student',studentId)});
  const studentNotificationRead=p.match(/^\/api\/student\/notifications\/([A-Za-z0-9_-]+)\/read$/);if(studentNotificationRead&&req.method==='POST'){if(!engagementService.markNotificationRead(db,studentNotificationRead[1],'student',studentId))return sendError(res,404,'اعلان پیدا نشد');return send(res,200,{success:true});}
  if(p==='/api/student/messages'&&req.method==='GET')return send(res,200,{messages:engagementService.listMessages(db,studentId,'student')});
  if(p==='/api/student/messages'&&req.method==='POST'){try{const message=engagementService.sendMessage(db,studentId,'student',(await readBody(req)).body);engagementService.notify(db,{audienceType:'coach',studentId,type:'student_message',title:'پیام جدید شاگرد',body:message.body,entityType:'conversation'});auditService.record(db,{actorType:'student',actorId:studentId,action:'message.sent',entityType:'conversation',metadata:{sender_type:'student'}});return send(res,201,{message});}catch(error){return sendError(res,400,error.message);}}
  if(p==='/api/student/workouts'&&req.method==='GET')return send(res,200,{workouts:engagementService.listWorkouts(db,studentId),performance:engagementService.performance(db,studentId)});
  if(p==='/api/student/workouts'&&req.method==='POST'){try{const workout=engagementService.startWorkout(db,studentId,(await readBody(req)).day_ref);auditService.record(db,{actorType:'student',actorId:studentId,action:'workout.started',entityType:'workout_session',entityStableId:workout.stable_id});return send(res,201,{workout});}catch(error){return sendError(res,400,error.message);}}
  const workoutResults=p.match(/^\/api\/student\/workouts\/([A-Za-z0-9_-]+)\/results$/);if(workoutResults&&req.method==='PUT'){try{return send(res,200,{workout:engagementService.saveWorkoutResults(db,studentId,workoutResults[1],(await readBody(req)).results)});}catch(error){return sendError(res,400,error.message);}}
  const workoutComplete=p.match(/^\/api\/student\/workouts\/([A-Za-z0-9_-]+)\/complete$/);if(workoutComplete&&req.method==='POST'){try{const workout=engagementService.completeWorkout(db,studentId,workoutComplete[1],await readBody(req));auditService.record(db,{actorType:'student',actorId:studentId,action:'workout.completed',entityType:'workout_session',entityStableId:workout.stable_id,metadata:{status:workout.status}});return send(res,200,{workout});}catch(error){return sendError(res,400,error.message);}}
  const workoutGet=p.match(/^\/api\/student\/workouts\/([A-Za-z0-9_-]+)$/);if(workoutGet&&req.method==='GET'){const workout=engagementService.workoutSession(db,studentId,workoutGet[1]);if(!workout)return sendError(res,404,'جلسه پیدا نشد');return send(res,200,{workout});}
  if((p==='/api/student/profile') && req.method==='GET')return send(res,200,{student:studentSessionService.safeStudent(context.student)});
  if((p==='/api/student/profile') && req.method==='PUT'){
    try{return send(res,200,{student:studentSessionService.safeStudent(updateStudentProfileFromSession(studentId,await readBody(req)))});}
    catch(error){return sendError(res,error.statusCode||400,error.message);}
  }
  if(p==='/api/student/dashboard' && req.method==='GET'){
    const assessment=latestStudentAssessment(studentId);
    const active=one("SELECT * FROM training_programs WHERE student_id=? AND status='ACTIVE' AND deleted_at IS NULL ORDER BY program_number DESC,id DESC LIMIT 1",studentId);
    engagementService.ensureProgramEndReminder(db,studentId);const notifications=engagementService.listNotifications(db,'student',studentId,10),performance=engagementService.performance(db,studentId);
    return send(res,200,{student:studentSessionService.safeStudent(context.student),assessment:studentAssessmentView(assessment),program:studentProgramView(active),notifications,unread_notifications:notifications.filter(item=>!item.read_at).length,performance,onboarding_required:studentNextRoute(studentId)==='/student/onboarding'});
  }
  if(p==='/api/student/onboarding' && req.method==='GET'){
    const assessment=one(`SELECT * FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
    return send(res,200,{student:studentSessionService.safeStudent(context.student),assessment:studentAssessmentView(assessment,assessmentPhotos(assessment?.id)),details:assessment?assessmentService.getDetails(db,assessment.id):null});
  }
  if(p==='/api/student/assessment/catalogs' && req.method==='GET')return send(res,200,{catalogs:assessmentService.CATALOGS,goals:assessmentService.GOALS});
  const sectionMatch=p.match(/^\/api\/student\/assessment\/sections\/(general|measurements|medical|sports|nutrition|habits|pregnancy)$/);
  if(sectionMatch && req.method==='PUT'){
    try{
      const assessment=await saveSessionAssessment(studentId,{});
      const details=assessmentService.saveSection(db,assessment.id,studentId,sectionMatch[1],await readBody(req));
      const refreshed=one('SELECT * FROM body_assessments WHERE id=?',assessment.id);
      return send(res,200,{assessment:studentAssessmentView(refreshed,assessmentPhotos(refreshed.id)),details,last_saved_at:refreshed.draft_saved_at||refreshed.updated_at});
    }catch(error){return sendError(res,error.statusCode||400,error.message);}
  }
  if(p==='/api/student/assessment' && req.method==='POST'){
    try{
      const assessment=await saveSessionAssessment(studentId,await readBody(req));
      return send(res,assessment.version===1?201:200,{assessment:studentAssessmentView(assessment,assessmentPhotos(assessment.id))});
    }catch(error){return sendError(res,error.statusCode||400,error.message);}
  }
  if(p==='/api/student/assessment/photos' && req.method==='POST')return handleSessionPhotoUpload(req,res,studentId);
  if(p==='/api/student/assessment/documents' && req.method==='POST')return handleSessionDocumentUpload(req,res,studentId);
  const deleteDocumentMatch=p.match(/^\/api\/student\/assessment\/documents\/(\d+)$/);
  if(deleteDocumentMatch&&req.method==='DELETE'){
    const documentId=Number(deleteDocumentMatch[1]);if(!assessmentDocumentService.remove(db,documentId,studentId))return sendError(res,404,'مدرک پیدا نشد یا پرونده قفل است');auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.document_deleted',entityType:'assessment_document',entityId:documentId});
    return send(res,200,{success:true});
  }
  const deletePhotoMatch=p.match(/^\/api\/student\/assessment\/photos\/(\d+)$/);
  if(deletePhotoMatch && req.method==='DELETE'){
    const photoId=Number(deletePhotoMatch[1]),deleted=uploadService.deletePhoto(db,photoId,studentId);
    if(!deleted)return sendError(res,404,'عکس پیدا نشد یا ارزیابی قفل شده است');auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.photo_deleted',entityType:'assessment_photo',entityId:photoId});
    return send(res,200,{success:true});
  }
  if(p==='/api/student/assessment/submit' && req.method==='POST'){
    const assessment=one(`SELECT * FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY assessment_number DESC,id DESC LIMIT 1`,studentId);
    if(!assessment)return sendError(res,409,'ارزیابی قابل ارسال پیدا نشد');
    const completeness=assessmentService.validateForSubmission(db,assessment,context.student);
    if(completeness.length)return sendError(res,400,completeness[0],completeness);
    try{
      const submitted=studentService.submitAssessment(db,assessment.id);
      engagementService.notify(db,{audienceType:'coach',studentId,type:'assessment_submitted',title:'ارزیابی جدید ارسال شد',body:`ارزیابی #${submitted.assessment_number} آماده بررسی است`,entityType:'assessment',entityId:submitted.id});
      auditService.record(db,{actorType:'student',actorId:studentId,action:'assessment.submitted',entityType:'assessment',entityId:submitted.id,entityStableId:submitted.stable_id,metadata:{assessment_number:submitted.assessment_number,assessment_type:submitted.assessment_type}});
      return send(res,200,{success:true,assessment:studentAssessmentView(submitted,assessmentPhotos(assessment.id))});
    }catch(error){return sendError(res,400,error.message);}
  }
  if(p==='/api/student/assessment' && req.method==='GET'){
    const assessment=latestStudentAssessment(studentId,true);
    return send(res,200,{assessment:studentAssessmentView(assessment,assessmentPhotos(assessment?.id)),details:assessment?assessmentService.getDetails(db,assessment.id):null});
  }
  if(p==='/api/student/assessments' && req.method==='GET'){
    const list=rows('SELECT * FROM body_assessments WHERE student_id=? AND submitted_at IS NOT NULL AND deleted_at IS NULL ORDER BY assessment_number ASC,id ASC',studentId);
    return send(res,200,{assessments:list.map(item=>studentAssessmentView(item,assessmentPhotos(item.id)))});
  }
  if(p==='/api/student/program' && req.method==='GET'){
    const program=one("SELECT * FROM training_programs WHERE student_id=? AND status='ACTIVE' AND deleted_at IS NULL ORDER BY program_number DESC,id DESC LIMIT 1",studentId);
    if(!program)return send(res,200,{program:null});
    const built=programService.buildProgramFromDB(db,program.id);
    return send(res,200,{program:{...studentProgramView(program),program_data:studentProgramData(built?.programData)}});
  }
  if(p==='/api/student/programs' && req.method==='GET'){
    const programs=rows("SELECT * FROM training_programs WHERE student_id=? AND status IN ('ACTIVE','COMPLETED','ARCHIVED') AND deleted_at IS NULL ORDER BY program_number ASC,id ASC",studentId);
    return send(res,200,{programs:programs.map(studentProgramView)});
  }
  if(p==='/api/student/history' && req.method==='GET'){
    const assessments=rows('SELECT * FROM body_assessments WHERE student_id=? AND submitted_at IS NOT NULL AND deleted_at IS NULL ORDER BY assessment_number ASC,id ASC',studentId);
    const programs=rows("SELECT * FROM training_programs WHERE student_id=? AND status IN ('ACTIVE','COMPLETED','ARCHIVED') AND deleted_at IS NULL ORDER BY program_number ASC,id ASC",studentId);
    return send(res,200,{assessments:assessments.map(item=>studentAssessmentView(item,assessmentPhotos(item.id))),programs:programs.map(studentProgramView)});
  }
  return sendError(res,404,'مسیر شاگرد پیدا نشد');
}

async function handleStudentPortal(req,res,url){
  const p=url.pathname;

  // Resolve token
  const portalMatch = p.match(/^\/api\/student-portal\/([^\/]+)(\/.*)?$/);
  if(!portalMatch) return null;
  const token = portalMatch[1];
  const subPath = portalMatch[2]||'';

  // Security: token format check
  if(!token || token.length<20 || token.length>100) return sendError(res,400,'توکن نامعتبر');

  const resolved = studentService.resolveInvite(db, token);
  if(!resolved || resolved.error){
    const errMap = {
      revoked: 'لینک باطل شده است',
      expired: 'لینک منقضی شده است',
      student_not_found: 'شاگرد پیدا نشد',
    };
    const msg = errMap[resolved?.error] || 'لینک نامعتبر';
    return sendError(res,404,msg);
  }

  const {student} = resolved;
  const studentId = student.id;

  // GET /api/student-portal/:token -> full student data for portal
  if((subPath==='' || subPath==='/') && req.method==='GET'){
    const full = studentService.getStudentFullData(db, studentId, {studentView:true});
    const currentAssessment = one('SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number DESC LIMIT 1', studentId);
    let currentPhotos=[];
    if(currentAssessment){
      currentPhotos = rows(`SELECT ${PHOTO_METADATA_COLUMNS} FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL`, currentAssessment.id);
    }
    // Draft programs are coach-private. Students only see explicitly assigned plans.
    const currentProgram = one(`SELECT * FROM training_programs WHERE student_id=? AND status='ACTIVE' AND deleted_at IS NULL ORDER BY program_number DESC, id DESC LIMIT 1`, studentId);
    let programFull=null;
    if(currentProgram){
      try {
        const built = programService.buildProgramFromDB(db, currentProgram.id);
        if(built) programFull = { ...currentProgram, program_data: built.programData };
        else programFull = currentProgram;
      } catch(e){ programFull=currentProgram; }
    }

    return send(res,200,{
      student:safeCoachStudent(student),
      current_assessment: currentAssessment ? {...currentAssessment, photos: currentPhotos} : null,
      current_program: programFull,
      timeline: full.timeline,
      assessments: full.assessments,
      programs: full.programs
    });
  }

  // PUT /api/student-portal/:token/profile
  if(subPath==='/profile' && req.method==='PUT'){
    const b=await readBody(req);
    // Allow updating profile fields
    const allowed = ['full_name','mobile','date_of_birth','height','weight','goal','training_experience','training_level','occupation','preferred_location','limitations','injuries','medical_notes'];
    const updates={};
    for(const key of allowed){
      if(b[key]!==undefined) updates[key]=b[key];
    }
    if(Object.keys(updates).length===0) return sendError(res,400,'هیچ فیلدی برای ویرایش نیست');

    // Validate
    if(updates.full_name !== undefined && (!String(updates.full_name).trim() || updates.full_name.length>100)) return sendError(res,400,'نام نامعتبر است');
    if(updates.mobile && (typeof updates.mobile !== 'string' || updates.mobile.length>20)) return sendError(res,400,'موبایل نامعتبر');
    if(updates.height != null && (!Number.isFinite(Number(updates.height)) || Number(updates.height)<100 || Number(updates.height)>250)) return sendError(res,400,'قد نامعتبر است');
    if(updates.weight != null && (!Number.isFinite(Number(updates.weight)) || Number(updates.weight)<20 || Number(updates.weight)>300)) return sendError(res,400,'وزن نامعتبر است');
    for(const key of ['goal','training_experience','limitations','injuries','medical_notes']) if(updates[key] != null && (typeof updates[key] !== 'string' || updates[key].length>4000)) return sendError(res,400,'اطلاعات متنی نامعتبر است');

    const fields=[];
    const params=[];
    for(const [k,v] of Object.entries(updates)){
      fields.push(`${k}=?`);
      params.push(v);
    }
    fields.push('updated_at=CURRENT_TIMESTAMP');
    fields.push('version=version+1');
    fields.push(`profile_status=CASE WHEN profile_status='INVITED' THEN 'PROFILE_INCOMPLETE' ELSE profile_status END`);
    params.push(studentId);
    db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE id=? AND deleted_at IS NULL`).run(...params);

    const updated = one('SELECT * FROM students WHERE id=?', studentId);
    log('پروفایل شاگرد ویرایش شد', updated.full_name);
    return send(res,200,safeCoachStudent(updated));
  }

  // POST /api/student-portal/:token/assessment
  if(subPath==='/assessment' && req.method==='POST'){
    const b=await readBody(req);
    // Check if there is already an incomplete assessment
    let assessment = one(`SELECT * FROM body_assessments WHERE student_id=? AND status IN ('PROFILE_INCOMPLETE','ASSESSMENT_PENDING','CHANGES_REQUESTED') AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`, studentId);

    if(assessment){
      // Update existing
      try {
        const updated = studentService.updateAssessment(db, assessment.id, b);
        return send(res,200,updated);
      } catch(e){
        return sendError(res,400,e.message);
      }
    } else {
      // Create new
      try {
        const created = studentService.createAssessment(db, studentId, {
          height: student.height, goal: student.goal, training_experience: student.training_experience,
          limitations: student.limitations, injuries: student.injuries, ...b
        });
        const full = one('SELECT * FROM body_assessments WHERE id=?', created.id);
        return send(res,201,full);
      } catch(e){
        return sendError(res,400,e.message);
      }
    }
  }

  // POST /api/student-portal/:token/submit
  if(subPath==='/submit' && req.method==='POST'){
    // Find latest assessment that is not submitted
    const assessment = one('SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number DESC LIMIT 1', studentId);
    if(!assessment) return sendError(res,404,'ارزیابی پیدا نشد');
    try {
      const submitted = studentService.submitAssessment(db, assessment.id);
      log('ارزیابی شاگرد ارسال شد', `${student.full_name} - ارزیابی #${submitted.assessment_number}`);
      return send(res,200,submitted);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  // GET /api/student-portal/:token/assessments
  if(subPath==='/assessments' && req.method==='GET'){
    const list = rows('SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number ASC', studentId);
    return send(res,200,list);
  }

  // GET /api/student-portal/:token/timeline
  if(subPath==='/timeline' && req.method==='GET'){
    const full = studentService.getStudentFullData(db, studentId, {studentView:true});
    return send(res,200,full.timeline);
  }

  // Photo upload via JSON base64 (simpler than multipart for now) - POST /api/student-portal/:token/photos
  if(subPath==='/photos' && req.method==='POST'){
    const contentType = req.headers['content-type']||'';
    if(contentType.includes('multipart/form-data')){
      // Handle multipart
      const boundaryMatch = contentType.match(/boundary=([^;]+)/);
      if(!boundaryMatch) return sendError(res,400,'boundary not found');
      const boundary = boundaryMatch[1].replace(/"/g,'');
      try {
        const parts = await uploadService.parseMultipart(req, boundary);
        const files = parts.filter(p=>p.type==='file');
        const fields = {};
        parts.filter(p=>p.type==='field').forEach(f=> fields[f.name]=f.value);

        const photoType = fields.photo_type || 'front';
        const assessmentId = fields.assessment_id ? Number(fields.assessment_id) : null;
        let targetAssessmentId = assessmentId;
        if(!targetAssessmentId){
          const latest = one('SELECT id FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', studentId);
          if(!latest) return sendError(res,404,'ارزیابی پیدا نشد - اول ارزیابی بسازید');
          targetAssessmentId = latest.id;
        }

        if(!editableStudentAssessment(studentId, targetAssessmentId)) return sendError(res,403,'ارزیابی متعلق به شما نیست یا پس از ارسال قفل شده است');
        if(!uploadService.PHOTO_TYPES.includes(photoType)) return sendError(res,400,'نوع عکس نامعتبر است');
        if(files.length !== 1) return sendError(res,400,'در هر درخواست دقیقاً یک عکس ارسال کنید');
        const results=[];
        for(const file of files){
          try {
            const saved = uploadService.saveAssessmentPhoto(db, studentId, targetAssessmentId, file, photoType);
            results.push(saved);
          } catch(e){
            return sendError(res, e.statusCode||400, e.message, e.validationErrors||null);
          }
        }
        return send(res,201,{photos: results});
      } catch(e){
        console.error('Multipart error', e);
        return sendError(res, e.statusCode||400, e.message||'خطا در آپلود');
      }
    } else {
      // JSON base64 upload
      const b=await readBody(req);
      if(!b.data && !b.base64) return sendError(res,400,'دیتای عکس الزامی است');
      const photoType = b.photo_type || 'front';
      const assessmentId = b.assessment_id ? Number(b.assessment_id) : null;
      let targetAssessmentId = assessmentId;
      if(!targetAssessmentId){
        const latest = one('SELECT id FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', studentId);
        if(!latest) return sendError(res,404,'ارزیابی پیدا نشد');
        targetAssessmentId = latest.id;
      }

      if(!editableStudentAssessment(studentId, targetAssessmentId)) return sendError(res,403,'ارزیابی متعلق به شما نیست یا پس از ارسال قفل شده است');
      if(!uploadService.PHOTO_TYPES.includes(photoType)) return sendError(res,400,'نوع عکس نامعتبر است');

      // Decode strict base64 (reject ignored garbage characters).
      let buffer;
      try {
        const rawBase64 = String(b.data||b.base64);
        const base64Data = rawBase64.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
        if(!base64Data || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) throw new Error('invalid base64');
        buffer = Buffer.from(base64Data, 'base64');
      } catch(e){
        return sendError(res,400,'base64 نامعتبر');
      }

      const file = {
        originalFilename: b.filename || `${photoType}.jpg`,
        mimeType: b.mime_type || 'image/jpeg',
        size: buffer.length,
        data: buffer
      };

      try {
        const saved = uploadService.saveAssessmentPhoto(db, studentId, targetAssessmentId, file, photoType);
        return send(res,201,{photo: saved});
      } catch(e){
        return sendError(res, e.statusCode||400, e.message, e.validationErrors||null);
      }
    }
  }

  // GET /api/student-portal/:token/photos
  if(subPath==='/photos' && req.method==='GET'){
    const photos = rows(`
      SELECT ap.id, ap.stable_id, ap.assessment_id, ap.student_id, ap.photo_type,
             ap.original_filename, ap.mime_type, ap.size_bytes, ap.version, ap.created_at,
             ap.updated_at, ba.assessment_number
      FROM assessment_photos ap
      JOIN body_assessments ba ON ba.id=ap.assessment_id
      WHERE ap.student_id=? AND ap.deleted_at IS NULL
      ORDER BY ba.assessment_number DESC, ap.photo_type
    `, studentId);
    return send(res,200,photos);
  }

  // DELETE /api/student-portal/:token/photos/:id - ownership scoped and draft-only.
  const ownPhotoDelete = subPath.match(/^\/photos\/(\d+)$/);
  if(ownPhotoDelete && req.method==='DELETE'){
    const photoId=Number(ownPhotoDelete[1]);
    const ok=uploadService.deletePhoto(db, photoId, studentId);
    if(!ok) return sendError(res,404,'عکس پیدا نشد یا ارزیابی قفل شده است');
    return send(res,200,{id:photoId, soft_deleted:true});
  }

  // GET /api/student-portal/:token/program
  if(subPath==='/program' && req.method==='GET'){
    const prog = one(`SELECT * FROM training_programs WHERE student_id=? AND status='ACTIVE' AND deleted_at IS NULL ORDER BY program_number DESC, id DESC LIMIT 1`, studentId);
    if(!prog) return sendError(res,404,'برنامه‌ای اختصاص داده نشده');
    try {
      const built = programService.buildProgramFromDB(db, prog.id);
      if(built) prog.program_data = built.programData;
      else {
        try { prog.program_data = JSON.parse(prog.program_data||'{}'); } catch(e){ prog.program_data={}; }
      }
    } catch(e){}
    return send(res,200,prog);
  }

  return null;
}

async function handleBodyAssessments(req,res,url){
  if(requireCoach(req,res)) return true;
  const p=url.pathname;

  if(p==='/api/student-submissions' && req.method==='GET'){
    const list = studentService.getPendingSubmissions(db);
    return send(res,200,list);
  }

  const studentProgramsMatch=p.match(/^\/api\/students\/(\d+)\/programs$/);
  if(studentProgramsMatch && req.method==='GET'){
    const list=studentService.getStudentPrograms(db,studentIdByReference(studentProgramsMatch[1]));
    if(!list) return sendError(res,404,'شاگرد پیدا نشد');
    return send(res,200,list);
  }

  const studentInvitesMatch=p.match(/^\/api\/students\/(\d+)\/invites$/);
  if(studentInvitesMatch && req.method==='GET'){
    const list=studentService.getStudentInvites(db,studentIdByReference(studentInvitesMatch[1]));
    if(!list) return sendError(res,404,'شاگرد پیدا نشد');
    return send(res,200,list);
  }

  const studentAssessMatch = p.match(/^\/api\/students\/(\d+)\/assessments$/);
  if(studentAssessMatch && req.method==='GET'){
    const studentId=studentIdByReference(studentAssessMatch[1]);
    if(!studentId)return sendError(res,404,'شاگرد پیدا نشد');
    const list = rows('SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number ASC', studentId);
    return send(res,200,list);
  }

  const studentTimelineMatch = p.match(/^\/api\/students\/(\d+)\/timeline$/);
  if(studentTimelineMatch && req.method==='GET'){
    const studentId=studentIdByReference(studentTimelineMatch[1]);
    if(!studentId)return sendError(res,404,'شاگرد پیدا نشد');
    const full = studentService.getStudentFullData(db, studentId);
    if(!full) return sendError(res,404,'شاگرد پیدا نشد');
    return send(res,200,full);
  }

  const assessMatch = p.match(/^\/api\/assessments\/(\d+)(\/photos)?$/);
  if(assessMatch){
    const id=Number(assessMatch[1]);
    const isPhotos = !!assessMatch[2];
    if(req.method==='GET'){
      if(isPhotos){
        const photos = rows(`SELECT ${PHOTO_METADATA_COLUMNS} FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL ORDER BY photo_type`, id);
        return send(res,200,photos);
      } else {
        const ass = one('SELECT * FROM body_assessments WHERE id=? AND deleted_at IS NULL', id);
        if(!ass) return sendError(res,404,'ارزیابی پیدا نشد');
        const photos = rows(`SELECT ${PHOTO_METADATA_COLUMNS} FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL`, id);
        const student = one('SELECT * FROM students WHERE id=?', ass.student_id);
        // Previous assessment for comparison
        const prev = one('SELECT * FROM body_assessments WHERE student_id=? AND assessment_number < ? AND deleted_at IS NULL ORDER BY assessment_number DESC LIMIT 1', ass.student_id, ass.assessment_number);
        let prevPhotos=[];
        if(prev) prevPhotos = rows(`SELECT ${PHOTO_METADATA_COLUMNS} FROM assessment_photos WHERE assessment_id=? AND deleted_at IS NULL`, prev.id);
        let prevProgram=null;
        if(prev && prev.program_id){
          prevProgram = one('SELECT * FROM training_programs WHERE id=?', prev.program_id);
          if(prevProgram){
            try {
              const built = programService.buildProgramFromDB(db, prevProgram.id);
              if(built) prevProgram.program_data = built.programData;
            } catch(e){}
          }
        }
        return send(res,200,{assessment: {...ass, photos, documents:assessmentDocumentService.list(db,ass.id)}, assessment_details:assessmentService.getDetails(db,ass.id), student:safeCoachStudent(student), previous_assessment: prev ? {...prev, photos: prevPhotos} : null, previous_assessment_details:prev?assessmentService.getDetails(db,prev.id):null, previous_program: prevProgram});
      }
    }
  }

  const requestChangesMatch = p.match(/^\/api\/assessments\/(\d+)\/request-changes$/);
  if(requestChangesMatch && req.method==='POST'){
    const id=Number(requestChangesMatch[1]);
    const b=await readBody(req);
    try {
      const updated = studentService.reviewAssessment(db, id, 'request_changes', b.coach_note||'');
      log('ارزیابی نیاز به اصلاح دارد', `ارزیابی #${updated.assessment_number} - ${updated.student_id}`);
      engagementService.notify(db,{audienceType:'student',studentId:updated.student_id,type:'assessment_changes_requested',title:'اصلاح پرونده درخواست شد',body:updated.coach_note,entityType:'assessment',entityId:updated.id});
      auditService.record(db,{actorType:'coach',action:'assessment.changes_requested',entityType:'assessment',entityId:updated.id,entityStableId:updated.stable_id,metadata:{student_id:updated.student_id}});
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  const approveMatch = p.match(/^\/api\/assessments\/(\d+)\/approve$/);
  if(approveMatch && req.method==='POST'){
    const id=Number(approveMatch[1]);
    const b=await readBody(req);
    try {
      const updated = studentService.reviewAssessment(db, id, 'approve', b.coach_note||'');
      log('ارزیابی تایید شد', `ارزیابی #${updated.assessment_number}`);
      engagementService.notify(db,{audienceType:'student',studentId:updated.student_id,type:'assessment_approved',title:'پرونده شما تأیید شد',body:updated.coach_note||'مربی پرونده شما را تأیید کرد.',entityType:'assessment',entityId:updated.id});
      auditService.record(db,{actorType:'coach',action:'assessment.approved',entityType:'assessment',entityId:updated.id,entityStableId:updated.stable_id,metadata:{student_id:updated.student_id}});
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  const rejectMatch=p.match(/^\/api\/assessments\/(\d+)\/reject$/);
  if(rejectMatch&&req.method==='POST'){
    const id=Number(rejectMatch[1]),body=await readBody(req);
    try{const updated=studentService.reviewAssessment(db,id,'reject',body.coach_note||'');engagementService.notify(db,{audienceType:'student',studentId:updated.student_id,type:'assessment_rejected',title:'پرونده رد شد',body:updated.coach_note,entityType:'assessment',entityId:updated.id});auditService.record(db,{actorType:'coach',action:'assessment.rejected',entityType:'assessment',entityId:updated.id,entityStableId:updated.stable_id,metadata:{student_id:updated.student_id}});return send(res,200,updated);}
    catch(error){return sendError(res,400,error.message);}
  }

  const underReviewMatch = p.match(/^\/api\/assessments\/(\d+)\/under-review$/);
  if(underReviewMatch && req.method==='POST'){
    const id=Number(underReviewMatch[1]);
    try {
      const updated = studentService.reviewAssessment(db, id, 'under_review');
      auditService.record(db,{actorType:'coach',action:'assessment.review_started',entityType:'assessment',entityId:updated.id,entityStableId:updated.stable_id,metadata:{student_id:updated.student_id}});
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  return null;
}

async function handleAssessmentDocuments(req,res,url){
  const match=url.pathname.match(/^\/api\/student-documents\/(\d+)$/);if(!match||req.method!=='GET')return null;
  const document=assessmentDocumentService.get(db,Number(match[1]));if(!document)return sendError(res,404,'مدرک پیدا نشد');
  const coach=isCoachAuthorized(req),student=coach?null:studentSessionService.resolveStudentSession(db,req);
  if(!coach&&(!student||student.student_id!==document.student_id))return sendError(res,student?403:401,'دسترسی به این مدرک مجاز نیست');
  res.writeHead(200,{'Content-Type':document.mime_type,'Content-Length':document.size_bytes,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${sanitizeFileName(document.original_filename)}"`,'Content-Security-Policy':"default-src 'none'"});
  return fs.createReadStream(document.storage_path).pipe(res);
}

async function handleAssessmentPhotos(req,res,url){
  const p=url.pathname;

  // GET /api/student-photos/:photoId - protected with token check
  const photoMatch = p.match(/^\/api\/student-photos\/(\d+)$/);
  if(photoMatch && req.method==='GET'){
    const photoId=Number(photoMatch[1]);
    if(!Number.isInteger(photoId) || photoId<=0) return sendError(res,400,'شناسه نامعتبر');

    const photo = uploadService.getPhotoFilePath(db, photoId);
    if(!photo) return sendError(res,404,'عکس پیدا نشد');

    // Security: ensure path is inside data/assessments
    const assessmentsRoot = path.resolve(path.join(__dirname, 'data', 'assessments'));
    if(!isSafePath(assessmentsRoot, photo.storage_path)){
      return sendError(res,403,'دسترسی غیرمجاز');
    }

    const ext = path.extname(photo.storage_path).toLowerCase();
    if(!['.png','.jpg','.jpeg','.webp'].includes(ext)){
      return sendError(res,403,'نوع فایل نامعتبر');
    }

    // Student photo access is session-bound. Invitation tokens never authorize files.
    const coachAuthorized=isCoachAuthorized(req);
    const studentContext=coachAuthorized?null:studentSessionService.resolveStudentSession(db,req);
    if(!coachAuthorized){
      if(!studentContext)return sendError(res,401,'نشست معتبر پیدا نشد');
      if(studentContext.student_id!==photo.student_id)return sendError(res,403,'دسترسی به این عکس مجاز نیست');
    }
    log('دسترسی به عکس ارزیابی',`photo ${photoId} student ${photo.student_id} ${coachAuthorized?'via coach':'via student session'}`);

    res.writeHead(200,{
      'Content-Type': photo.mime_type||types[ext]||'image/jpeg',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'",
      'Content-Disposition':'inline; filename="assessment-image' + ext + '"'
    });
    return fs.createReadStream(photo.storage_path).pipe(res);
  }

  // DELETE /api/assessment-photos/:id
  const delMatch = p.match(/^\/api\/assessment-photos\/(\d+)$/);
  if(delMatch && req.method==='DELETE'){
    if(requireCoach(req,res)) return true;
    const photoId=Number(delMatch[1]);
    const ok = uploadService.deletePhoto(db, photoId);
    if(!ok) return sendError(res,404,'عکس پیدا نشد');
    return send(res,200,{id: photoId, soft_deleted:true});
  }

  return null;
}

async function handleLegacyPrograms(req,res,url){
  if(url.pathname==='/api/programs' && req.method==='GET'){
    return send(res,200,rows('SELECT p.*,s.full_name student_name,s.case_number student_case_number FROM programs p LEFT JOIN students s ON s.id=p.student_id ORDER BY p.id DESC'));
  }
  if(url.pathname==='/api/programs' && req.method==='POST'){
    const b=await readBody(req);
    if(!b.title?.trim()||!b.type) return sendError(res,400,'عنوان و نوع برنامه الزامی هستند');
    if(b.title.length>200) return sendError(res,400,'عنوان طولانی است');
    const r=db.prepare('INSERT INTO programs (student_id,title,type,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?)')
      .run(b.student_id||null,b.title.trim(),b.type,b.status||'پیش‌نویس',b.start_date||null,b.end_date||null,b.notes||'');
    log('برنامه جدید ثبت شد',b.title);
    return send(res,201,{id:r.lastInsertRowid});
  }
  return null;
}

async function handleBackup(req,res,url){
  if(url.pathname==='/api/backup' && req.method==='POST'){
    try {
      // Before backup, checkpoint WAL
      try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch(e){}
      const file=backup();
      // Rotation: keep only last 10 backups
      try {
        const backupDir = path.join(__dirname, 'backups');
        const files = fs.readdirSync(backupDir).filter(f=>f.startsWith('yasnafit-') && f.endsWith('.db')).map(f=>{
          const full = path.join(backupDir,f);
          return {name:f, full, mtime: fs.statSync(full).mtime.getTime()};
        }).sort((a,b)=>b.mtime-a.mtime);
        if(files.length>10){
          const toDelete = files.slice(10);
          toDelete.forEach(f=>{
            try { fs.unlinkSync(f.full); console.log(`[Backup] Deleted old backup ${f.name}`); } catch(e){}
          });
        }
      } catch(e){ console.log('Backup rotation error', e.message); }

      log('نسخه پشتیبان ساخته شد',file);
      return send(res,201,{file});
    } catch(e){
      console.error('Backup error', e);
      return sendError(res,500,'خطا در پشتیبان‌گیری', e.message);
    }
  }
  return null;
}

async function handleAi(req,res,url){
  if(requireCoach(req,res)) return true;
  const p=url.pathname;

  if(p==='/api/ai/settings' && req.method==='GET'){
    return send(res,200,aiService.getSettings(db));
  }

  if(p==='/api/ai/settings' && req.method==='PUT'){
    try {
      const b=await readBody(req);
      const updated=aiService.saveSettings(db,b);
      log('تنظیمات هوش مصنوعی به‌روزرسانی شد', `Combo: ${updated.default_combo||'تعیین‌نشده'}`);
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  if(p==='/api/ai/tools' && req.method==='GET'){
    return send(res,200,{tools:aiService.AI_TOOLS});
  }

  if(p==='/api/ai/models' && req.method==='GET'){
    try {
      const baseUrl = url.searchParams.get('base_url');
      const result = await aiService.fetchAvailableModels(db, { base_url: baseUrl });
      return send(res, 200, result);
    } catch(e){
      return sendError(res, 400, e.message);
    }
  }

  if(p==='/api/ai/chat' && req.method==='POST'){
    try {
      const b=await readBody(req);
      const result=await aiService.chatCompletion(db,b);
      return send(res,200,result);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  if(p==='/api/ai/generate-program' && req.method==='POST'){
    try {
      const b=await readBody(req);
      const result=await aiService.generateProgramFromAssessment(db,b);
      log('برنامه تمرینی با هوش مصنوعی ساخته شد', `Program ID: ${result.programId}`);
      return send(res,201,result);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  return null;
}

async function handleCoachEngagement(req,res,url){
  const p=url.pathname;
  if(p==='/api/coach/notifications'&&req.method==='GET')return send(res,200,{notifications:engagementService.listNotifications(db,'coach',null,100)});
  if(p==='/api/coach/notifications'&&req.method==='DELETE'){if(!sameOrigin(req))return sendError(res,403,'مبدأ درخواست مجاز نیست');const cleared=engagementService.clearNotifications(db,'coach');auditService.record(db,{actorType:'coach',action:'notifications.cleared',entityType:'notification',metadata:{cleared_count:cleared}});return send(res,200,{success:true,cleared});}
  const notificationRead=p.match(/^\/api\/coach\/notifications\/([A-Za-z0-9_-]+)\/read$/);if(notificationRead&&req.method==='POST'){if(!engagementService.markNotificationRead(db,notificationRead[1],'coach'))return sendError(res,404,'اعلان پیدا نشد');return send(res,200,{success:true});}
  const messagesMatch=p.match(/^\/api\/students\/(\d+)\/messages$/);if(messagesMatch){const studentId=studentIdByReference(messagesMatch[1]);if(!studentId)return sendError(res,404,'شاگرد پیدا نشد');if(req.method==='GET')return send(res,200,{messages:engagementService.listMessages(db,studentId,'coach')});if(req.method==='POST'){try{const message=engagementService.sendMessage(db,studentId,'coach',(await readBody(req)).body);engagementService.notify(db,{audienceType:'student',studentId,type:'coach_message',title:'پیام جدید مربی',body:message.body,entityType:'conversation'});auditService.record(db,{actorType:'coach',action:'message.sent',entityType:'conversation',metadata:{student_id:studentId,sender_type:'coach'}});return send(res,201,{message});}catch(error){return sendError(res,400,error.message);}}}
  const performanceMatch=p.match(/^\/api\/students\/(\d+)\/performance$/);if(performanceMatch&&req.method==='GET'){const studentId=studentIdByReference(performanceMatch[1]);if(!studentId)return sendError(res,404,'شاگرد پیدا نشد');return send(res,200,engagementService.performance(db,studentId));}
  const auditMatch=p.match(/^\/api\/students\/(\d+)\/audit$/);if(auditMatch&&req.method==='GET'){const studentId=studentIdByReference(auditMatch[1]);if(!studentId)return sendError(res,404,'شاگرد پیدا نشد');return send(res,200,{events:auditService.listForStudent(db,studentId,200)});}
  return null;
}

// --- Main API Router ---
async function api(req,res,url){
  try {
    const p=url.pathname;

    if(p==='/api/test/reset-rate-limit' && req.method==='POST'){
      rateBuckets.clear();
      return send(res, 200, { ok: true });
    }
    if(p==='/api/health') return await handleHealth(req,res);
    if(p==='/api/version' || p==='/api/releases' || p.startsWith('/api/releases/')){
      const releaseResponse=await handleReleaseInfo(req,res,url);
      if(releaseResponse) return releaseResponse;
    }
    if(p==='/api/student/auth/login')return await handleStudentAuth(req,res,url);
    if(p.startsWith('/api/student/join/')){
      const joined=await handleStudentJoin(req,res,url);
      if(joined)return joined;
      return sendError(res,404,'لینک دعوت نامعتبر است');
    }
    if(p.startsWith('/api/student-portal/')){
      return send(res,410,{error:'این API منسوخ شده است؛ از لینک دعوت برای ساخت نشست امن استفاده کنید.',code:'STUDENT_SESSION_REQUIRED'});
    }
    if(p.startsWith('/api/student/'))return handleStudentSessionApi(req,res,url);
    const studentScoped = p.startsWith('/api/student-photos/')||p.startsWith('/api/student-documents/')||p.startsWith('/api/exercise-image/');
    if(!studentScoped && requireCoach(req,res)) return true;
    if(p==='/api/dashboard') return await handleDashboard(req,res);
    if(p.startsWith('/api/coach/')||p.startsWith('/api/students/')){const engagement=await handleCoachEngagement(req,res,url);if(engagement)return engagement;}

    if(p.startsWith('/api/ai/')){
      const r = await handleAi(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/students')){
      const r1 = await handleStudentsDelete(req,res,url);
      if(r1) return r1;
      // New: student assessments and timeline
      const rBody = await handleBodyAssessments(req,res,url);
      if(rBody) return rBody;
      if(p.startsWith('/api/students')){
        const r = await handleStudents(req,res,url);
        if(r) return r;
      }
    }

    if(p.startsWith('/api/exercises') || p.startsWith('/api/categories') || p.startsWith('/api/images') || p.startsWith('/api/exercise-image/')){
      const r = await handleExercises(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/training-programs')){
      const r = await handleTrainingPrograms(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/student-invites')){
      const r = await handleStudentInvites(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/student-portal/')){
      const r = await handleStudentPortal(req,res,url);
      if(r) return r;
    }

    if(p==='/api/student-submissions' || p.startsWith('/api/assessments/')){
      const r = await handleBodyAssessments(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/student-documents/')){
      const documentResponse=await handleAssessmentDocuments(req,res,url);if(documentResponse)return documentResponse;
    }
    if(p.startsWith('/api/student-photos/') || p.startsWith('/api/assessment-photos/')){
      const r = await handleAssessmentPhotos(req,res,url);
      if(r) return r;
    }

    if(p.startsWith('/api/programs')){
      const r = await handleLegacyPrograms(req,res,url);
      if(r) return r;
    }

    if(p==='/api/backup'){
      const r = await handleBackup(req,res,url);
      if(r) return r;
    }

    // Legacy movements
    if(url.pathname==='/api/movements' && req.method==='GET'){
      return send(res,200,rows('SELECT * FROM movements WHERE deleted_at IS NULL ORDER BY id DESC'));
    }
    if(url.pathname==='/api/movements' && req.method==='POST'){
      const b=await readBody(req);
      if(!b.name?.trim()) return sendError(res,400,'نام حرکت الزامی است');
      const r=db.prepare('INSERT INTO movements (name,muscle_group,equipment) VALUES (?,?,?)').run(b.name.trim(),b.muscle_group||'',b.equipment||'');
      log('حرکت جدید ثبت شد',b.name);
      return send(res,201,{id:r.lastInsertRowid});
    }

    return sendError(res,404,'مسیر API پیدا نشد');
  } catch(e){
    console.error('[API Error]', e);
    if(e.message==='Request body too large'){
      return sendError(res,413,'بدنه درخواست بزرگ است');
    }
    if(e.statusCode===400){
      return sendError(res,400, e.message, e.validationErrors||null);
    }
    return sendError(res,500,'خطای داخلی سرور');
  }
}

// --- Static File Serving with Security ---
function findRecursiveSafe(baseDir, fileName){
  if(!fs.existsSync(baseDir)) return null;
  const stack=[baseDir];
  const idPart = fileName.split('.')[0];
  while(stack.length){
    const current=stack.pop();
    try {
      const entries=fs.readdirSync(current,{withFileTypes:true});
      for(const entry of entries){
        const full=path.join(current, entry.name);
        if(!isSafePath(baseDir, full)) continue;
        if(entry.isFile()){
          if(entry.name.toLowerCase()===fileName.toLowerCase()) return full;
          if(entry.name.startsWith(idPart+'_') || entry.name.startsWith(idPart+'.')) return full;
        }
        if(entry.isDirectory() && isSafePath(baseDir, full)){
          stack.push(full);
        }
      }
    } catch(e){}
  }
  return null;
}

const server=http.createServer(async(req,res)=>{
  // Security: check raw URL for traversal before normalization
  const rawUrl = req.url || '';
  if(rawUrl.includes('..') || rawUrl.includes('\0') || rawUrl.includes('%00')){
    res.writeHead(400,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({error:'Bad Request - invalid path'}));
  }

  const url=new URL(req.url,`http://${req.headers.host}`);
  try{
    // Security: limit URL length
    if(url.pathname.length>500) {
      res.writeHead(414); return res.end('URI Too Long');
    }

    // Local launcher/bootstrap: possession of the filesystem-protected coach token
    // establishes an HttpOnly process session, then immediately removes it from the URL.
    const coachAccessMatch=url.pathname.match(/^\/coach-access\/([A-Za-z0-9_-]{43})$/);
    if(coachAccessMatch){
      if(req.method!=='GET' || !constantTimeEqual(LOCAL_COACH_ACCESS_TOKEN,coachAccessMatch[1])){
        return sendError(res,401,'دسترسی مربی احراز نشد');
      }
      const secureCookie=req.socket.encrypted || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https' ? '; Secure' : '';
      res.writeHead(303,{
        'Location':'/',
        'Set-Cookie':`yasnafit_coach_session=${LOCAL_COACH_SESSION}; HttpOnly; SameSite=Strict; Path=/${secureCookie}`,
        'Cache-Control':'no-store',
        'Referrer-Policy':'no-referrer'
      });
      return res.end();
    }
    if(url.pathname.startsWith('/coach-access/')) return sendError(res,401,'دسترسی مربی احراز نشد');

    if(url.pathname.startsWith('/api/')) return await api(req,res,url);

    const isJoinPage=/^\/join\/[^/]+$/.test(url.pathname);
    const isStudentPage=['/student/login','/student/change-password','/student/onboarding','/document/edit-document','/student/dashboard','/student/program','/student/workouts','/student/messages','/student/notifications','/student/assessment','/student/history','/student/profile','/student/logout'].includes(url.pathname);
    if(req.method==='GET' && (isJoinPage||isStudentPage)){
      const authenticated=isJoinPage || url.pathname==='/student/login' || Boolean(studentSessionService.resolveStudentSession(db,req));
      res.writeHead(authenticated?200:401,{
        'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
      });
      return fs.createReadStream(path.join(publicDir,'student.html')).pipe(res);
    }

    // Coach SPA routes contain no public data, but the dashboard shell itself is also
    // private. Student routes use a separate HTML shell and student session.
    const requestExt=path.extname(url.pathname).toLowerCase();
    const isCoachSpaRoute=!url.pathname.startsWith('/join/') &&
      (url.pathname==='/' || url.pathname==='/index.html' || !requestExt);
    if(isCoachSpaRoute && !isCoachAuthorized(req)) return sendError(res,401,'دسترسی مربی احراز نشد');

    // Blank white placeholder image serving
    if(url.pathname==='/blank-white.svg' || url.pathname==='/assets/images/blank-white.svg'){
      const blankWhiteSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>');
      res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'});
      return res.end(blankWhiteSvg);
    }
    // Secure image serving
    if(url.pathname.startsWith('/files/exercise/') || url.pathname.startsWith('/assets/images/exercises/') || url.pathname.startsWith('/assets/videos/')){
      const relative = url.pathname.replace('/files/exercise/','').replace('/assets/images/exercises/','').replace('/assets/videos/','');
      const basename = sanitizeFileName(path.basename(relative));

      if(!basename || basename.length>100) {
        res.writeHead(400,{'Content-Type':'application/json'});
        return res.end(JSON.stringify({error:'Invalid filename'}));
      }

      const possiblePaths = [
        path.join(dataSourceDir, 'exercises_organized', relative),
        path.join(publicDir, 'assets', 'images', 'exercises', 'imported', basename),
        path.join(publicDir, 'assets', 'images', 'exercises', basename),
        path.join(publicDir, 'assets', 'images', 'exercises', 'imported', relative),
        path.join(publicDir, 'assets', 'videos', 'exercises', basename),
      ];

      for(const fp of possiblePaths){
        if(!isSafePath(publicDir, fp) && !isSafePath(dataSourceDir, fp)) continue;
        if(fs.existsSync(fp) && fs.statSync(fp).isFile()){
          const ext = path.extname(fp).toLowerCase();
          if(!types[ext]) continue; // only allow known types
          res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
          return fs.createReadStream(fp).pipe(res);
        }
      }

      const importedRoot = path.join(publicDir, 'assets', 'images', 'exercises', 'imported');
      const found = findRecursiveSafe(importedRoot, basename);
      if(found && isSafePath(importedRoot, found)){
        const ext = path.extname(found).toLowerCase();
        res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
        return fs.createReadStream(found).pipe(res);
      }

      const organizedRoot = path.join(dataSourceDir, 'exercises_organized');
      const found2 = findRecursiveSafe(organizedRoot, basename);
      if(found2 && isSafePath(organizedRoot, found2)){
        const ext = path.extname(found2).toLowerCase();
        res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
        return fs.createReadStream(found2).pipe(res);
      }

      res.writeHead(404,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'Image not found', searched: basename}));
    }

    // Serve public files with path traversal protection
    let wanted = url.pathname==='/'?'/index.html':url.pathname;
    wanted = wanted.split('?')[0];
    // Security: prevent null bytes and traversal
    if(wanted.includes('\0') || wanted.includes('..')) {
      res.writeHead(400,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'Bad Request'}));
    }
    const file=path.normalize(path.join(publicDir,wanted));
    if(!isSafePath(publicDir, file)){
      res.writeHead(403,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'Forbidden'}));
    }
    if(fs.existsSync(file)&&fs.statSync(file).isFile()){
      const ext = path.extname(file).toLowerCase();
      // Only serve known safe types
      const allowedExts = ['.html','.js','.css','.json','.png','.jpg','.jpeg','.gif','.webp','.svg','.ico','.mp4'];
      if(!allowedExts.includes(ext)){
        res.writeHead(403,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'Forbidden file type'}));
      }
      const headers={'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'};
      res.writeHead(200,headers);
      return fs.createReadStream(file).pipe(res);
    }

    // Security: For /assets/ and /files/ paths, return 404 if file not found, not SPA fallback (prevents leaking via fallback)
    if(wanted.startsWith('/assets/') || wanted.startsWith('/files/')){
      res.writeHead(404,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'File not found'}));
    }

    // SPA fallback only for non-file routes (no extension or known SPA routes)
    const ext = path.extname(wanted).toLowerCase();
    if(ext && ext !== '.html'){
      // If it has extension but file doesn't exist, 404
      res.writeHead(404,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'Not found'}));
    }
    const spaHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'};
    res.writeHead(200,spaHeaders);
    fs.createReadStream(path.join(publicDir,'index.html')).pipe(res);
  }catch(error){
    console.error('[Server Error]', error);
    try {
      sendError(res,500,'خطای داخلی سرور');
    } catch(e){}
  }
});

server.listen(port,'0.0.0.0',()=>{
  const totalEx = (()=>{ try { return db.prepare('SELECT COUNT(*) as total FROM exercises WHERE deleted_at IS NULL').get().total; } catch(e){ return 0; } })();
  const totalProg = (()=>{ try { return db.prepare('SELECT COUNT(*) as total FROM training_programs WHERE deleted_at IS NULL').get().total; } catch(e){ return 0; } })();
  console.log(`Yasnafit is running at http://localhost:${port} with ${totalEx} exercises and ${totalProg} training programs`);
  console.log(`Application version: ${releaseService.getApplicationInfo().version}`);
  console.log(`Database schema version: ${(() => { try { return db.prepare('SELECT value FROM settings WHERE key=?').get('schema_version')?.value || 'unknown'; } catch(e){ return 'unknown'; } })()}`);
});
