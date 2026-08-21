const http = require('http');
const fs = require('fs');
const path = require('path');
const { db, dbPath, backup, log } = require('./src/database');
const port = Number(process.env.PORT || 3020);
const publicDir = path.join(__dirname, 'public');
const types = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8' };
function send(res, code, data) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function read(req) { return new Promise((resolve,reject)=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})}) }
function rows(sql, ...args){ return db.prepare(sql).all(...args); }
function one(sql, ...args){ return db.prepare(sql).get(...args); }
async function api(req,res,url){
 const p=url.pathname;
 if(req.method==='GET'&&p==='/api/health') return send(res,200,{ok:true,database:fs.existsSync(dbPath),port});
 if(req.method==='GET'&&p==='/api/dashboard') { const total=one('SELECT COUNT(*) total FROM students').total, active=one("SELECT COUNT(*) total FROM programs WHERE status='فعال'").total, waiting=one("SELECT COUNT(*) total FROM orders WHERE status LIKE 'در انتظار%'").total; return send(res,200,{stats:{total,active,waiting,movements:one('SELECT COUNT(*) total FROM movements').total},activities:rows('SELECT * FROM activity_log ORDER BY id DESC LIMIT 6'),students:rows('SELECT * FROM students ORDER BY id DESC LIMIT 5')}); }
 if(req.method==='GET'&&p==='/api/students') return send(res,200,rows('SELECT * FROM students ORDER BY id DESC'));
 if(req.method==='POST'&&p==='/api/students') { const b=await read(req); if(!b.full_name?.trim()) return send(res,400,{error:'نام شاگرد الزامی است.'}); const r=db.prepare('INSERT INTO students (full_name,mobile,goal,status,weight,height) VALUES (?,?,?,?,?,?)').run(b.full_name.trim(),b.mobile||'',b.goal||'',b.status||'فعال',Number(b.weight)||null,Number(b.height)||null); log('شاگرد جدید ثبت شد',b.full_name); return send(res,201,{id:r.lastInsertRowid}); }
 if(req.method==='GET'&&p==='/api/movements') return send(res,200,rows('SELECT * FROM movements ORDER BY id DESC'));
 if(req.method==='POST'&&p==='/api/movements') { const b=await read(req); if(!b.name?.trim()) return send(res,400,{error:'نام حرکت الزامی است.'}); const r=db.prepare('INSERT INTO movements (name,muscle_group,equipment) VALUES (?,?,?)').run(b.name.trim(),b.muscle_group||'',b.equipment||''); log('حرکت جدید ثبت شد',b.name); return send(res,201,{id:r.lastInsertRowid}); }
 if(req.method==='GET'&&p==='/api/programs') return send(res,200,rows('SELECT p.*,s.full_name student_name FROM programs p LEFT JOIN students s ON s.id=p.student_id ORDER BY p.id DESC'));
 if(req.method==='POST'&&p==='/api/programs') { const b=await read(req); if(!b.title?.trim()||!b.type) return send(res,400,{error:'عنوان و نوع برنامه الزامی هستند.'}); const r=db.prepare('INSERT INTO programs (student_id,title,type,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?)').run(b.student_id||null,b.title.trim(),b.type,b.status||'پیش‌نویس',b.start_date||null,b.end_date||null,b.notes||''); log('برنامه جدید ثبت شد',b.title); return send(res,201,{id:r.lastInsertRowid}); }
 if(req.method==='POST'&&p==='/api/backup') { const file=backup(); log('نسخه پشتیبان ساخته شد',file); return send(res,201,{file}); }
 return send(res,404,{error:'مسیر API پیدا نشد.'});
}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host}`);try{if(url.pathname.startsWith('/api/')) return await api(req,res,url); const wanted=url.pathname==='/'?'/index.html':url.pathname;const file=path.normalize(path.join(publicDir,wanted));if(file.startsWith(publicDir)&&fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res)}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(path.join(publicDir,'index.html')).pipe(res)}catch(error){console.error(error);send(res,500,{error:'خطای داخلی سرور',detail:error.message})}});
server.listen(port,'0.0.0.0',()=>console.log(`Yasnafit is running at http://localhost:${port}`));
