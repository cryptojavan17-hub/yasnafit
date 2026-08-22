const http = require('http');
const fs = require('fs');
const path = require('path');
const { db, dbPath, backup, log, importExercisesFromJson } = require('./src/database');
const port = Number(process.env.PORT || 3020);
const publicDir = path.join(__dirname, 'public');
const dataSourceDir = path.join(__dirname, 'data-source');

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

function send(res, code, data) {
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function read(req) {
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',x=>raw+=x);
    req.on('end',()=>{
      try{resolve(raw?JSON.parse(raw):{})}
      catch(e){reject(e)}
    })
  })
}
function rows(sql, ...args){ return db.prepare(sql).all(...args); }
function one(sql, ...args){ return db.prepare(sql).get(...args); }

async function api(req,res,url){
 const p=url.pathname;

 if(req.method==='GET'&&p==='/api/health') {
   const totalExercises = one('SELECT COUNT(*) total FROM exercises')?.total || 0;
   return send(res,200,{ok:true,database:fs.existsSync(dbPath),port,exercises:totalExercises});
 }

 if(req.method==='GET'&&p==='/api/dashboard') {
   const total=one('SELECT COUNT(*) total FROM students').total;
   const active=one("SELECT COUNT(*) total FROM programs WHERE status='فعال'").total;
   const waiting=one("SELECT COUNT(*) total FROM orders WHERE status LIKE 'در انتظار%'").total;
   const movements = one('SELECT COUNT(*) total FROM exercises').total;
   const categories = one('SELECT COUNT(*) total FROM exercise_categories').total;
   return send(res,200,{
     stats:{total,active,waiting,movements,categories},
     activities:rows('SELECT * FROM activity_log ORDER BY id DESC LIMIT 8'),
     students:rows('SELECT * FROM students ORDER BY id DESC LIMIT 5')
   });
 }

 if(req.method==='GET'&&p==='/api/students') return send(res,200,rows('SELECT * FROM students ORDER BY id DESC'));
 if(req.method==='POST'&&p==='/api/students') {
   const b=await read(req);
   if(!b.full_name?.trim()) return send(res,400,{error:'نام شاگرد الزامی است.'});
   const r=db.prepare('INSERT INTO students (full_name,mobile,goal,status,weight,height) VALUES (?,?,?,?,?,?)')
     .run(b.full_name.trim(),b.mobile||'',b.goal||'',b.status||'فعال',Number(b.weight)||null,Number(b.height)||null);
   log('شاگرد جدید ثبت شد',b.full_name);
   return send(res,201,{id:r.lastInsertRowid});
 }

 if(req.method==='GET'&&p==='/api/movements') return send(res,200,rows('SELECT * FROM movements ORDER BY id DESC'));
 if(req.method==='POST'&&p==='/api/movements') {
   const b=await read(req);
   if(!b.name?.trim()) return send(res,400,{error:'نام حرکت الزامی است.'});
   const r=db.prepare('INSERT INTO movements (name,muscle_group,equipment) VALUES (?,?,?)')
     .run(b.name.trim(),b.muscle_group||'',b.equipment||'');
   log('حرکت جدید ثبت شد',b.name);
   return send(res,201,{id:r.lastInsertRowid});
 }

 if(req.method==='GET'&&p==='/api/categories') {
   // Return grouped categories with subs
   const raw = rows('SELECT c.id,c.name,c.sort_order,c.original_id, s.id subcategory_id,s.name subcategory_name,s.sort_order subcategory_sort_order, s.original_id subcategory_original_id FROM exercise_categories c LEFT JOIN exercise_subcategories s ON s.category_id=c.id ORDER BY c.sort_order,s.sort_order');
   // Also get counts per category
   const counts = {};
   try {
     const countRows = rows('SELECT category_id, COUNT(*) as cnt FROM exercises GROUP BY category_id');
     countRows.forEach(r=>counts[r.category_id]=r.cnt);
   } catch(e){}
   // Add counts to response as separate field
   return send(res,200,raw.map(r=>({...r, count: counts[r.id]||0})));
 }

 if(req.method==='GET'&&p==='/api/categories/grouped') {
   const cats = rows('SELECT * FROM exercise_categories ORDER BY sort_order');
   const subs = rows('SELECT * FROM exercise_subcategories ORDER BY sort_order');
   const counts = {};
   rows('SELECT category_id, COUNT(*) as cnt FROM exercises GROUP BY category_id').forEach(r=>counts[r.category_id]=r.cnt);
   const subCounts = {};
   rows('SELECT subcategory_id, COUNT(*) as cnt FROM exercises WHERE subcategory_id IS NOT NULL GROUP BY subcategory_id').forEach(r=>subCounts[r.subcategory_id]=r.cnt);
   const grouped = cats.map(c=>{
     return {
       id: c.id,
       name: c.name,
       sort_order: c.sort_order,
       original_id: c.original_id,
       count: counts[c.id]||0,
       subs: subs.filter(s=>s.category_id===c.id).map(s=>({
         id: s.id,
         name: s.name,
         sort_order: s.sort_order,
         original_id: s.original_id,
         count: subCounts[s.id]||0
       }))
     }
   });
   return send(res,200,grouped);
 }

 if(req.method==='GET'&&p==='/api/exercises') {
   const location=url.searchParams.get('location')||'both';
   const categoryId=url.searchParams.get('categoryId');
   const subCategoryId=url.searchParams.get('subCategoryId');
   const status=url.searchParams.get('status')||'active';
   const query=(url.searchParams.get('query')||'').trim();
   const page = parseInt(url.searchParams.get('page')||'0');
   const pageSize = parseInt(url.searchParams.get('pageSize')||'24');
   const sortBy = url.searchParams.get('sortBy')||'priority'; // priority, name, id

   if(!categoryId) {
     // If no category, return empty but with stats
     return send(res,200,{items:[], total:0, page, pageSize, totalPages:0});
   }

   let sql='SELECT * FROM exercises WHERE category_id=? AND status=?';
   let countSql='SELECT COUNT(*) as total FROM exercises WHERE category_id=? AND status=?';
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
     params.push(`%${query}%`);
     countParams.push(`%${query}%`);
   }

   const total = one(countSql,...countParams)?.total || 0;

   // Sorting
   if(sortBy==='name') sql+=' ORDER BY name_fa ASC';
   else if(sortBy==='id') sql+=' ORDER BY original_id ASC, id ASC';
   else sql+=' ORDER BY priority ASC, name_fa ASC';

   // Pagination
   sql+=` LIMIT ${pageSize} OFFSET ${page*pageSize}`;

   const items = rows(sql,...params);
   const totalPages = Math.ceil(total / pageSize);

   return send(res,200,{items, total, page, pageSize, totalPages});
 }

 if(req.method==='GET'&&p==='/api/exercises/all') {
   // For debugging, get all with filters but without pagination limit
   const categoryId=url.searchParams.get('categoryId');
   let sql='SELECT * FROM exercises';
   let params=[];
   if(categoryId){
     sql+=' WHERE category_id=?';
     params.push(categoryId);
   }
   sql+=' ORDER BY category_id, priority ASC, name_fa ASC LIMIT 500';
   return send(res,200,rows(sql,...params));
 }

 if(req.method==='POST'&&p==='/api/exercises') {
   const b=await read(req);
   if(!b.name_fa?.trim()||!b.category_id) return send(res,400,{error:'نام و دسته حرکت الزامی است.'});
   const r=db.prepare('INSERT INTO exercises (name_fa,location,category_id,subcategory_id,status,image_path,video_path,priority) VALUES (?,?,?,?,?,?,?,?)')
     .run(b.name_fa.trim(),b.location||'both',b.category_id,b.subcategory_id||null,b.status==='archived'?'archived':'active',b.image_path||null,b.video_path||null, Number(b.priority)||5);
   log('حرکت جدید ثبت شد',b.name_fa);
   return send(res,201,{id:Number(r.lastInsertRowid)});
 }

 const exerciseMatch=p.match(/^\/api\/exercises\/(\d+)$/);
 if(req.method==='GET'&&exerciseMatch) {
   const id=Number(exerciseMatch[1]);
   const ex = one('SELECT * FROM exercises WHERE id=?',id);
   if(!ex) return send(res,404,{error:'حرکت پیدا نشد.'});
   return send(res,200,ex);
 }
 if(req.method==='PUT'&&exerciseMatch) {
   const b=await read(req), id=Number(exerciseMatch[1]);
   if(!b.name_fa?.trim()||!b.category_id) return send(res,400,{error:'نام و دسته حرکت الزامی است.'});
   const r=db.prepare('UPDATE exercises SET name_fa=?,location=?,category_id=?,subcategory_id=?,status=?,image_path=?,video_path=?,priority=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
     .run(b.name_fa.trim(),b.location||'both',b.category_id,b.subcategory_id||null,b.status==='archived'?'archived':'active',b.image_path||null,b.video_path||null,Number(b.priority)||5,id);
   if(!r.changes)return send(res,404,{error:'حرکت پیدا نشد.'});
   log('حرکت ویرایش شد',b.name_fa);
   return send(res,200,{id});
 }
 if(req.method==='DELETE'&&exerciseMatch) {
   const id=Number(exerciseMatch[1]);
   const r=db.prepare('DELETE FROM exercises WHERE id=?').run(id);
   if(!r.changes) return send(res,404,{error:'حرکت پیدا نشد.'});
   log('حرکت حذف شد',`id ${id}`);
   return send(res,200,{id});
 }

 const bulkAction={ '/api/exercises/bulk-archive':'archived','/api/exercises/bulk-restore':'active' }[p];
 if(req.method==='POST'&&bulkAction){
   const b=await read(req),ids=Array.isArray(b.ids)?b.ids.map(Number).filter(Number.isInteger):[];
   if(!ids.length)return send(res,400,{error:'حداقل یک حرکت انتخاب کنید.'});
   const marks=ids.map(()=>'?').join(',');
   db.prepare(`UPDATE exercises SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (${marks})`).run(bulkAction,...ids);
   log(bulkAction==='active'?'حرکات بازیابی شدند':'حرکات آرشیو شدند',`${ids.length} حرکت`);
   return send(res,200,{count:ids.length});
 }
 if(req.method==='DELETE'&&p==='/api/exercises/bulk-delete'){
   const b=await read(req),ids=Array.isArray(b.ids)?b.ids.map(Number).filter(Number.isInteger):[];
   if(!ids.length)return send(res,400,{error:'حداقل یک حرکت انتخاب کنید.'});
   const marks=ids.map(()=>'?').join(',');
   db.prepare(`DELETE FROM exercises WHERE id IN (${marks})`).run(...ids);
   log('حرکات حذف شدند',`${ids.length} حرکت`);
   return send(res,200,{count:ids.length});
 }

 if(req.method==='POST'&&p==='/api/exercises/import') {
   const count = importExercisesFromJson();
   return send(res,200,{imported:count, total: one('SELECT COUNT(*) total FROM exercises').total});
 }

 if(req.method==='GET'&&p==='/api/images/status') {
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

   // DB breakdown
   let dbWithImage = 0, dbWithoutImage = 0, dbActiveWithImage = 0, dbActiveWithoutImage = 0, dbArchived = 0;
   try {
     dbWithImage = one('SELECT COUNT(*) as c FROM exercises WHERE image_path IS NOT NULL AND image_path != ""').c;
     dbWithoutImage = one('SELECT COUNT(*) as c FROM exercises WHERE image_path IS NULL OR image_path = ""').c;
     dbActiveWithImage = one('SELECT COUNT(*) as c FROM exercises WHERE status="active" AND image_path IS NOT NULL AND image_path != ""').c;
     dbActiveWithoutImage = one('SELECT COUNT(*) as c FROM exercises WHERE status="active" AND (image_path IS NULL OR image_path = "")').c;
     dbArchived = one('SELECT COUNT(*) as c FROM exercises WHERE status="archived"').c;
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

 // New: Direct image by original_id - most robust way
 if(req.method==='GET' && p.startsWith('/api/exercise-image/')) {
   const originalId = p.replace('/api/exercise-image/','').split('?')[0].trim();
   if(!originalId) return send(res,400,{error:'ID required'});

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
           if(entry.isFile()){
             const name = entry.name;
             const ext = path.extname(name).toLowerCase();
             if(!['.png','.jpg','.jpeg','.gif','.webp'].includes(ext)) continue;
             // Exact match: 4.png, 4.jpg
             if(name.toLowerCase() === idStr.toLowerCase() + ext) return full;
             // Starts with id_ : 4_xxx.png, 4-xxx.jpg
             if(name.startsWith(idStr + '_') || name.startsWith(idStr + '-') || name.startsWith(idStr + ' ')) return full;
             // Contains _id_ or id in name? More permissive
             // If filename starts with id and then non-digit
             const match = name.match(/^(\d+)[^0-9]/);
             if(match && match[1] === idStr) return full;
           }
           if(entry.isDirectory()){
             stack.push(full);
           }
         }
       } catch(e){}
     }
     return null;
   }

   const importedRoot = path.join(publicDir, 'assets', 'images', 'exercises', 'imported');
   const organizedRoot = path.join(dataSourceDir, 'exercises_organized');
   const publicRoot = path.join(publicDir, 'assets', 'images', 'exercises');

   let found = findByOriginalId(importedRoot, originalId)
            || findByOriginalId(organizedRoot, originalId)
            || findByOriginalId(publicRoot, originalId);

   // Also try to find by checking exercises_data.json image path directly if file exists in organized
   if(!found){
     // Try direct file paths from DB: /files/exercise/images/4.png -> basename
     const directPaths = [
       path.join(importedRoot, originalId + '.png'),
       path.join(importedRoot, originalId + '.jpg'),
       path.join(importedRoot, originalId + '.jpeg'),
     ];
     for(const dp of directPaths){
       if(fs.existsSync(dp)) { found = dp; break; }
     }
   }

   if(found && fs.existsSync(found)){
     const ext = path.extname(found).toLowerCase();
     res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
     return fs.createReadStream(found).pipe(res);
   }

   return send(res,404,{error:'Image not found for id', id: originalId, searchedIn: [importedRoot, organizedRoot]});
 }

 // --- Training Programs (Redesigned Exercise Program Page) ---
 function genHash(){ return Math.random().toString(36).substring(2,10) + Date.now().toString(36); }

 if(p==='/api/training-programs' && req.method==='GET'){
   const list = rows('SELECT tp.*, s.full_name student_name FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id ORDER BY tp.id DESC');
   return send(res,200,list.map(r=>{
     try{ r.program_data = JSON.parse(r.program_data||'{}'); }catch(e){ r.program_data={}; }
     return r;
   }));
 }
 if(p==='/api/training-programs' && req.method==='POST'){
   const b=await read(req);
   if(!b.title?.trim()) return send(res,400,{error:'عنوان برنامه الزامی است.'});
   const programData = b.program_data ? JSON.stringify(b.program_data) : JSON.stringify({days:[]});
   const r=db.prepare('INSERT INTO training_programs (student_id,title,coach_note,status,start_date,end_date,program_data) VALUES (?,?,?,?,?,?,?)')
     .run(b.student_id||null, b.title.trim(), b.coach_note||'', b.status||'پیش‌نویس', b.start_date||null, b.end_date||null, programData);
   const newId = r.lastInsertRowid;
   try {
     const data = typeof b.program_data === 'string' ? JSON.parse(b.program_data) : (b.program_data||{days:[]});
     if(data.days && Array.isArray(data.days)){
       db.exec('BEGIN');
       try {
         for(const day of data.days){
           const dayHash = day.dayHash || genHash();
           const dayRes = db.prepare('INSERT INTO program_days (program_id, day_number, day_hash, focus, coach_note, is_rest_day) VALUES (?,?,?,?,?,?)')
             .run(newId, day.day_number||1, dayHash, day.focus||'', day.coachNote||'', day.isRestDay?1:0);
           const dayId = dayRes.lastInsertRowid;
           const systems = day.data || day.systems || [];
           for(const sys of systems){
             const sysHash = sys.exerciseSystemHash || sys.systemHash || genHash();
             const sysRes = db.prepare('INSERT INTO exercise_systems (day_id, exercise_system_id, system_hash, system_type) VALUES (?,?,?,?)')
               .run(dayId, sys.exercise_system_id||1, sysHash, sys.system_type||'normal');
             const sysId = sysRes.lastInsertRowid;
             const movements = sys.movement_list || sys.movements || [];
             let orderIdx=0;
             for(const mov of movements){
               const movHash = mov.movementHash || genHash();
               let exId = mov.exercise_id || null;
               if(!exId && mov.exerciseId){
                 const ex = one('SELECT id FROM exercises WHERE original_id=? OR id=?', Number(mov.exerciseId), Number(mov.exerciseId));
                 if(ex) exId = ex.id;
               }
               const movRes = db.prepare('INSERT INTO program_movements (system_id, exercise_id, movement_hash, description, order_index) VALUES (?,?,?,?,?)')
                 .run(sysId, exId, movHash, mov.description||'', orderIdx++);
               const movId = movRes.lastInsertRowid;
               const sets = mov.sets || [];
               for(const s of sets){
                 const setHash = s.setHash || genHash();
                 db.prepare('INSERT INTO movement_sets (movement_id, set_hash, set_type, count_value, weight, rest_seconds) VALUES (?,?,?,?,?,?)')
                   .run(movId, setHash, s.type||'reps', s.count||s.count_value||null, s.weight||null, s.restSeconds||s.rest_seconds||60);
               }
             }
           }
         }
         db.exec('COMMIT');
       } catch(e){
         db.exec('ROLLBACK');
         console.error('Failed to save normalized on POST:', e);
       }
     }
   } catch(e){ console.error(e); }
   log('برنامه تمرینی جدید ساخته شد', b.title);
   return send(res,201,{id:newId});
 }

 const tpMatch = p.match(/^\/api\/training-programs\/(\d+)(\/full)?$/);
 if(tpMatch){
   const id = Number(tpMatch[1]);
   const isFull = !!tpMatch[2];
   if(req.method==='GET'){
     const prog = one('SELECT tp.*, s.full_name student_name FROM training_programs tp LEFT JOIN students s ON s.id=tp.student_id WHERE tp.id=?', id);
     if(!prog) return send(res,404,{error:'برنامه پیدا نشد.'});
     try{ prog.program_data = JSON.parse(prog.program_data||'{}'); }catch(e){ prog.program_data={days:[]}; }
     if(isFull){
       if(!prog.program_data.days || prog.program_data.days.length===0){
         const days = rows('SELECT * FROM program_days WHERE program_id=? ORDER BY day_number', id);
         const fullDays = days.map(d=>{
           const systems = rows('SELECT * FROM exercise_systems WHERE day_id=? ORDER BY id', d.id);
           const fullSystems = systems.map(sys=>{
             const movements = rows('SELECT pm.*, e.name_fa, e.original_id FROM program_movements pm LEFT JOIN exercises e ON e.id=pm.exercise_id WHERE pm.system_id=? ORDER BY pm.order_index', sys.id);
             const fullMovements = movements.map(m=>{
               const sets = rows('SELECT * FROM movement_sets WHERE movement_id=? ORDER BY id', m.id);
               return {...m, sets};
             });
             return {...sys, movement_list: fullMovements};
           });
           return {...d, data: fullSystems};
         });
         prog.program_data = {days: fullDays};
       }
     }
     return send(res,200,prog);
   }
   if(req.method==='PUT'){
     const b=await read(req);
     const programData = b.program_data ? JSON.stringify(b.program_data) : null;
     if(programData){
       try {
         const data = typeof b.program_data === 'string' ? JSON.parse(b.program_data) : b.program_data;
         db.exec('BEGIN');
         try {
           db.prepare('DELETE FROM program_days WHERE program_id=?').run(id);
           if(data.days && Array.isArray(data.days)){
             for(const day of data.days){
               const dayHash = day.dayHash || genHash();
               const dayRes = db.prepare('INSERT INTO program_days (program_id, day_number, day_hash, focus, coach_note, is_rest_day) VALUES (?,?,?,?,?,?)')
                 .run(id, day.day_number||1, dayHash, day.focus||'', day.coachNote||'', day.isRestDay?1:0);
               const dayId = dayRes.lastInsertRowid;
               const systems = day.data || day.systems || [];
               for(const sys of systems){
                 const sysHash = sys.exerciseSystemHash || sys.systemHash || genHash();
                 const sysRes = db.prepare('INSERT INTO exercise_systems (day_id, exercise_system_id, system_hash, system_type) VALUES (?,?,?,?)')
                   .run(dayId, sys.exercise_system_id||1, sysHash, sys.system_type||'normal');
                 const sysId = sysRes.lastInsertRowid;
                 const movements = sys.movement_list || sys.movements || [];
                 let orderIdx = 0;
                 for(const mov of movements){
                   const movHash = mov.movementHash || genHash();
                   let exId = mov.exercise_id || null;
                   if(!exId && mov.exerciseId){
                     const ex = one('SELECT id FROM exercises WHERE original_id=? OR id=?', Number(mov.exerciseId), Number(mov.exerciseId));
                     if(ex) exId = ex.id;
                   }
                   const movRes = db.prepare('INSERT INTO program_movements (system_id, exercise_id, movement_hash, description, order_index) VALUES (?,?,?,?,?)')
                     .run(sysId, exId, movHash, mov.description||'', orderIdx++);
                   const movId = movRes.lastInsertRowid;
                   const sets = mov.sets || [];
                   for(const s of sets){
                     const setHash = s.setHash || genHash();
                     db.prepare('INSERT INTO movement_sets (movement_id, set_hash, set_type, count_value, weight, rest_seconds) VALUES (?,?,?,?,?,?)')
                       .run(movId, setHash, s.type||'reps', s.count||s.count_value||null, s.weight||null, s.restSeconds||s.rest_seconds||60);
                   }
                 }
               }
             }
           }
           db.exec('COMMIT');
         } catch(e){
           db.exec('ROLLBACK');
           console.error('Failed to save normalized program:', e);
         }
       } catch(e){
         console.error('program_data parse error', e);
       }
       const r=db.prepare('UPDATE training_programs SET title=COALESCE(?,title), coach_note=COALESCE(?,coach_note), status=COALESCE(?,status), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), program_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
         .run(b.title||null, b.coach_note||null, b.status||null, b.start_date||null, b.end_date||null, programData, id);
       if(!r.changes) return send(res,404,{error:'برنامه پیدا نشد.'});
       log('برنامه تمرینی ویرایش شد', b.title||`id ${id}`);
       return send(res,200,{id});
     } else {
       const r=db.prepare('UPDATE training_programs SET title=COALESCE(?,title), coach_note=COALESCE(?,coach_note), status=COALESCE(?,status), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), updated_at=CURRENT_TIMESTAMP WHERE id=?')
         .run(b.title||null, b.coach_note||null, b.status||null, b.start_date||null, b.end_date||null, id);
       if(!r.changes) return send(res,404,{error:'برنامه پیدا نشد.'});
       return send(res,200,{id});
     }
   }
   if(req.method==='DELETE'){
     const r=db.prepare('DELETE FROM training_programs WHERE id=?').run(id);
     if(!r.changes) return send(res,404,{error:'برنامه پیدا نشد.'});
     log('برنامه تمرینی حذف شد', `id ${id}`);
     return send(res,200,{id});
   }
 }

 if(req.method==='GET'&&p==='/api/programs') return send(res,200,rows('SELECT p.*,s.full_name student_name FROM programs p LEFT JOIN students s ON s.id=p.student_id ORDER BY p.id DESC'));
 if(req.method==='POST'&&p==='/api/programs') {
   const b=await read(req);
   if(!b.title?.trim()||!b.type) return send(res,400,{error:'عنوان و نوع برنامه الزامی هستند.'});
   const r=db.prepare('INSERT INTO programs (student_id,title,type,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?)')
     .run(b.student_id||null,b.title.trim(),b.type,b.status||'پیش‌نویس',b.start_date||null,b.end_date||null,b.notes||'');
   log('برنامه جدید ثبت شد',b.title);
   return send(res,201,{id:r.lastInsertRowid});
 }

 if(req.method==='POST'&&p==='/api/backup') {
   const file=backup();
   log('نسخه پشتیبان ساخته شد',file);
   return send(res,201,{file});
 }

 return send(res,404,{error:'مسیر API پیدا نشد.'});
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);

    // Serve exercise images from data-source if exists, or from public/assets (recursive search)
    if(url.pathname.startsWith('/files/exercise/') || url.pathname.startsWith('/assets/images/exercises/')) {
      const relative = url.pathname.replace('/files/exercise/','').replace('/assets/images/exercises/','');
      const basename = path.basename(relative);
      const possiblePaths = [
        path.join(dataSourceDir, 'exercises_organized', relative),
        path.join(publicDir, 'assets', 'images', 'exercises', 'imported', basename),
        path.join(publicDir, 'assets', 'images', 'exercises', basename),
        path.join(publicDir, 'assets', 'images', 'exercises', 'imported', relative),
      ];

      // Helper to search recursively in imported folder
      function findRecursive(dir, fileName) {
        if(!fs.existsSync(dir)) return null;
        const stack = [dir];
        while(stack.length){
          const current = stack.pop();
          try {
            const entries = fs.readdirSync(current, {withFileTypes:true});
            for(const entry of entries){
              const full = path.join(current, entry.name);
              if(entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()){
                return full;
              }
              // Also match files that start with id_ (like 4_...png) or contain id
              if(entry.isFile()){
                // If basename is like 4.png, match files starting with 4_ or 4.
                const idPart = fileName.split('.')[0];
                if(entry.name.startsWith(idPart + '_') || entry.name.startsWith(idPart + '.')){
                  return full;
                }
              }
              if(entry.isDirectory()){
                stack.push(full);
              }
            }
          } catch(e){}
        }
        return null;
      }

      for(const fp of possiblePaths){
        if(fs.existsSync(fp) && fs.statSync(fp).isFile()){
          const ext = path.extname(fp).toLowerCase();
          res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
          return fs.createReadStream(fp).pipe(res);
        }
      }

      // Recursive search in imported folder
      const importedRoot = path.join(publicDir, 'assets', 'images', 'exercises', 'imported');
      const found = findRecursive(importedRoot, basename);
      if(found){
        const ext = path.extname(found).toLowerCase();
        res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
        return fs.createReadStream(found).pipe(res);
      }

      // Also search in data-source organized folder recursively
      const organizedRoot = path.join(dataSourceDir, 'exercises_organized');
      const found2 = findRecursive(organizedRoot, basename);
      if(found2){
        const ext = path.extname(found2).toLowerCase();
        res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'});
        return fs.createReadStream(found2).pipe(res);
      }

      res.writeHead(404,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'Image not found', searched: basename}));
    }

    // Serve public files
    let wanted = url.pathname==='/'?'/index.html':url.pathname;
    // Remove query
    wanted = wanted.split('?')[0];
    const file=path.normalize(path.join(publicDir,wanted));
    if(file.startsWith(publicDir)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
    // SPA fallback
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    fs.createReadStream(path.join(publicDir,'index.html')).pipe(res);
  }catch(error){
    console.error(error);
    send(res,500,{error:'خطای داخلی سرور',detail:error.message});
  }
});

server.listen(port,'0.0.0.0',()=>console.log(`Yasnafit is running at http://localhost:${port} with ${one('SELECT COUNT(*) total FROM exercises').total} exercises`));
