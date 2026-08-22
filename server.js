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
const { runMigrations } = require('./src/migrations');
const validation = require('./src/validation');
const programService = require('./src/program-service');
const studentService = require('./src/student-service');
const uploadService = require('./src/upload-service');

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
function send(res, code, data) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
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
  if(COACH_ACCESS_TOKEN) return constantTimeEqual(COACH_ACCESS_TOKEN, bearer);
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

async function handleDashboard(req,res){
  const total=one('SELECT COUNT(*) as total FROM students WHERE deleted_at IS NULL')?.total||0;
  const active=one("SELECT COUNT(*) as total FROM programs WHERE status='فعال'")?.total||0;
  const waiting=one("SELECT COUNT(*) as total FROM orders WHERE status LIKE 'در انتظار%'")?.total||0;
  const movements = one('SELECT COUNT(*) as total FROM exercises WHERE deleted_at IS NULL')?.total||0;
  const categories = one('SELECT COUNT(*) as total FROM exercise_categories WHERE deleted_at IS NULL')?.total||0;
  const trainingProgs = one('SELECT COUNT(*) as total FROM training_programs WHERE deleted_at IS NULL')?.total||0;
  return send(res,200,{
    stats:{total,active,waiting,movements,categories, trainingPrograms: trainingProgs},
    activities: rows('SELECT * FROM activity_log ORDER BY id DESC LIMIT 8'),
    students: rows('SELECT * FROM students WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 5')
  });
}

async function handleStudents(req,res,url){
  if(req.method==='GET'){
    // Exclude soft deleted
    return send(res,200,rows('SELECT * FROM students WHERE deleted_at IS NULL ORDER BY id DESC'));
  }
  if(req.method==='POST'){
    const b=await readBody(req);
    const errors = validateStudentPayload(b);
    if(errors.length) return sendError(res,400, errors[0], errors);

    const stableId = crypto.randomUUID ? crypto.randomUUID() : programService.genUUID();
    const r=db.prepare('INSERT INTO students (full_name,mobile,goal,status,weight,height,stable_id,version) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.full_name.trim(), b.mobile||'', b.goal||'', b.status||'فعال', Number(b.weight)||null, Number(b.height)||null, stableId, 1);
    log('شاگرد جدید ثبت شد', b.full_name);
    return send(res,201,{id:r.lastInsertRowid, stable_id: stableId});
  }
}

async function handleStudentsDelete(req,res,url){
  const match = url.pathname.match(/^\/api\/students\/(\d+)$/);
  if(!match) return null;
  const id=Number(match[1]);
  if(req.method==='DELETE'){
    // Soft delete
    const r=db.prepare('UPDATE students SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL').run(id);
    if(!r.changes) return sendError(res,404,'شاگرد پیدا نشد');
    log('شاگرد حذف شد (soft)', `id ${id}`);
    return send(res,200,{id, soft_deleted:true});
  }
  if(req.method==='GET'){
    const s=one('SELECT * FROM students WHERE id=? AND deleted_at IS NULL', id);
    if(!s) return sendError(res,404,'شاگرد پیدا نشد');
    return send(res,200,s);
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
    const cats = rows('SELECT * FROM exercise_categories WHERE deleted_at IS NULL ORDER BY sort_order');
    const subs = rows('SELECT * FROM exercise_subcategories WHERE deleted_at IS NULL ORDER BY sort_order');
    const counts = {};
    rows('SELECT category_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL GROUP BY category_id').forEach(r=>counts[r.category_id]=r.cnt);
    const subCounts = {};
    rows('SELECT subcategory_id, COUNT(*) as cnt FROM exercises WHERE deleted_at IS NULL AND subcategory_id IS NOT NULL GROUP BY subcategory_id').forEach(r=>subCounts[r.subcategory_id]=r.cnt);
    const grouped = cats.map(c=>{
      return {
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
        original_id: c.original_id,
        stable_id: c.stable_id,
        version: c.version,
        count: counts[c.id]||0,
        subs: subs.filter(s=>s.category_id===c.id).map(s=>({
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

    if(!categoryId) {
      return send(res,200,{items:[], total:0, page, pageSize, totalPages:0});
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
      // Prevent % and _ injection in LIKE by escaping? For now use parameterized LIKE
      sql+=' AND name_fa LIKE ?';
      countSql+=' AND name_fa LIKE ?';
      params.push(`%${query}%`);
      countParams.push(`%${query}%`);
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
    const r=db.prepare('INSERT INTO exercises (original_id, name_fa, location, category_id, subcategory_id, status, image_path, video_path, priority, stable_id, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(b.original_id||null, b.name_fa.trim(), b.location||'gym', b.category_id, b.subcategory_id||null, b.status==='archived'?'archived':'active', b.image_path||null, b.video_path||null, Number(b.priority)||5, stableId, 1);
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
      return send(res,200,ex);
    }
    if(req.method==='PUT'){
      const b=await readBody(req);
      const errors = validateExercisePayload(b);
      if(errors.length) return sendError(res,400, errors[0], errors);

      const catExists = one('SELECT id FROM exercise_categories WHERE id=? AND deleted_at IS NULL', b.category_id);
      if(!catExists) return sendError(res,400,'دسته‌بندی نامعتبر');

      const r=db.prepare('UPDATE exercises SET name_fa=?,location=?,category_id=?,subcategory_id=?,status=?,image_path=?,video_path=?,priority=?,updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND deleted_at IS NULL')
        .run(b.name_fa.trim(), b.location||'gym', b.category_id, b.subcategory_id||null, b.status==='archived'?'archived':'active', b.image_path||null, b.video_path||null, Number(b.priority)||5, id);
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

    return sendError(res,404,'تصویر پیدا نشد', {id: sanitizedId});
  }

  return null; // not handled
}

async function handleTrainingPrograms(req,res,url){
  if(requireCoach(req,res)) return true;
  const p=url.pathname;

  if(p==='/api/training-programs' && req.method==='GET'){
    const list = rows('SELECT tp.*, s.full_name student_name FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id WHERE tp.deleted_at IS NULL ORDER BY tp.id DESC');
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
      const action=lifecycleMatch[2];
      const updated = action==='activate'
        ? programService.activateProgram(db,id)
        : programService.transitionProgram(db,id,action==='complete'?'COMPLETED':'ARCHIVED');
      log(action==='activate'?'برنامه به شاگرد اختصاص یافت':'چرخه برنامه تغییر کرد', `program ${id}: ${updated.status}`);
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
        const prog = one('SELECT tp.*, s.full_name student_name FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id WHERE tp.id=? AND tp.deleted_at IS NULL', id);
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
        // Soft delete
        const r=db.prepare("UPDATE training_programs SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=? AND status='DRAFT' AND deleted_at IS NULL").run(id);
        if(!r.changes) return sendError(res,409,'فقط پیش‌نویس قابل حذف است؛ برنامه تاریخی باید آرشیو شود');
        log('برنامه تمرینی حذف شد (soft)', `id ${id}`);
        return send(res,200,{id, soft_deleted:true});
      } catch(e){
        console.error('Delete program error:', e);
        return sendError(res,500,'خطا در حذف');
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
      SELECT si.id, si.stable_id, si.student_id, si.token_preview, si.status, si.created_at, si.expires_at, si.used_at, si.revoked_at, s.full_name, s.mobile
      FROM student_invites si
      JOIN students s ON s.id=si.student_id AND s.deleted_at IS NULL
      WHERE si.deleted_at IS NULL
      ORDER BY si.id DESC
    `);
    return send(res,200,list);
  }
  if(p==='/api/student-invites' && req.method==='POST'){
    const b=await readBody(req);
    if(!b.student_id || !Number.isInteger(Number(b.student_id))) return sendError(res,400,'student_id الزامی است');
    const studentId = Number(b.student_id);
    const student = one('SELECT id FROM students WHERE id=? AND deleted_at IS NULL', studentId);
    if(!student) return sendError(res,404,'شاگرد پیدا نشد');
    const expiresDays = b.expires_in_days != null ? Number(b.expires_in_days) : 30;
    if(!Number.isInteger(expiresDays) || expiresDays < 0 || expiresDays > 3650) return sendError(res,400,'اعتبار دعوت باید بین صفر تا ۳۶۵۰ روز باشد');
    let result;
    try { result = studentService.createInvite(db, studentId, expiresDays); }
    catch(e){ return sendError(res,400,e.message); }
    log('لینک دعوت شاگرد ساخته شد', `${result.token_preview} برای ${studentId}`);
    // Return token only once, plus join URL
    const joinUrl = `/join/${result.token}`;
    return send(res,201,{id: result.id, stable_id: result.stable_id, student_id: studentId, token: result.token, token_preview: result.token_preview, join_url: joinUrl, expires_at: result.expires_at});
  }

  const revokeMatch = p.match(/^\/api\/student-invites\/(\d+)\/revoke$/);
  if(revokeMatch && req.method==='POST'){
    const id=Number(revokeMatch[1]);
    const ok = studentService.revokeInvite(db, id);
    if(!ok) return sendError(res,404,'دعوت پیدا نشد');
    log('لینک دعوت باطل شد', `id ${id}`);
    return send(res,200,{id, revoked:true});
  }

  return null;
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
      student,
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
    return send(res,200,updated);
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

  const studentAssessMatch = p.match(/^\/api\/students\/(\d+)\/assessments$/);
  if(studentAssessMatch && req.method==='GET'){
    const studentId=Number(studentAssessMatch[1]);
    const list = rows('SELECT * FROM body_assessments WHERE student_id=? AND deleted_at IS NULL ORDER BY assessment_number ASC', studentId);
    return send(res,200,list);
  }

  const studentTimelineMatch = p.match(/^\/api\/students\/(\d+)\/timeline$/);
  if(studentTimelineMatch && req.method==='GET'){
    const studentId=Number(studentTimelineMatch[1]);
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
        return send(res,200,{assessment: {...ass, photos}, student, previous_assessment: prev ? {...prev, photos: prevPhotos} : null, previous_program: prevProgram});
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
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  const underReviewMatch = p.match(/^\/api\/assessments\/(\d+)\/under-review$/);
  if(underReviewMatch && req.method==='POST'){
    const id=Number(underReviewMatch[1]);
    try {
      const updated = studentService.reviewAssessment(db, id, 'under_review');
      return send(res,200,updated);
    } catch(e){
      return sendError(res,400,e.message);
    }
  }

  return null;
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

    // Authorization: check token query param for student portal access
    const token = url.searchParams.get('token');
    if(token){
      const resolved = studentService.resolveInvite(db, token);
      if(!resolved || resolved.error || resolved.student.id !== photo.student_id){
        return sendError(res,403,'دسترسی غیرمجاز - توکن نامعتبر برای این عکس');
      }
    } else if(!isCoachAuthorized(req)) {
      return sendError(res,401,'دسترسی مربی احراز نشد');
    }
    log('دسترسی به عکس ارزیابی', `photo ${photoId} student ${photo.student_id} ${token?'via student token':'via coach'}`);

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
    return send(res,200,rows('SELECT p.*,s.full_name student_name FROM programs p LEFT JOIN students s ON s.id=p.student_id ORDER BY p.id DESC'));
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

// --- Main API Router ---
async function api(req,res,url){
  try {
    const p=url.pathname;

    if(p==='/api/health') return await handleHealth(req,res);
    const studentScoped = p.startsWith('/api/student-portal/') || p.startsWith('/api/student-photos/');
    if(!studentScoped && requireCoach(req,res)) return true;
    if(p==='/api/dashboard') return await handleDashboard(req,res);

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

    if(url.pathname.startsWith('/api/')) return await api(req,res,url);

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
      if(ext==='.html' && !url.pathname.startsWith('/join/') && !COACH_ACCESS_TOKEN){
        headers['Set-Cookie']=`yasnafit_coach_session=${LOCAL_COACH_SESSION}; HttpOnly; SameSite=Strict; Path=/`;
      }
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
    if(!url.pathname.startsWith('/join/') && !COACH_ACCESS_TOKEN){
      spaHeaders['Set-Cookie']=`yasnafit_coach_session=${LOCAL_COACH_SESSION}; HttpOnly; SameSite=Strict; Path=/`;
    }
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
  console.log(`Schema version: ${(() => { try { return db.prepare('SELECT value FROM settings WHERE key=?').get('schema_version')?.value || 'unknown'; } catch(e){ return 'unknown'; } })()}`);
});
