const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const backupDir = path.join(root, 'backups');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });
const dbPath = path.join(dataDir, 'yasnafit.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, mobile TEXT, goal TEXT,
 status TEXT NOT NULL DEFAULT 'فعال', weight REAL, height REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, muscle_group TEXT, equipment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS exercise_categories (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exercise_subcategories (
 id TEXT PRIMARY KEY, category_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(category_id) REFERENCES exercise_categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS exercises (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name_fa TEXT NOT NULL, location TEXT NOT NULL DEFAULT 'both' CHECK(location IN ('gym','home','both')),
 category_id TEXT NOT NULL, subcategory_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(category_id) REFERENCES exercise_categories(id), FOREIGN KEY(subcategory_id) REFERENCES exercise_subcategories(id)
);
CREATE TABLE IF NOT EXISTS programs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, title TEXT NOT NULL, type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'پیش‌نویس', start_date TEXT, end_date TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS measurements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, weight REAL, waist REAL, recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, service_type TEXT, status TEXT NOT NULL DEFAULT 'در انتظار تکمیل برنامه', amount REAL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS activity_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
function scalar(sql, ...params) { return db.prepare(sql).get(...params); }
function log(title, detail = '') { db.prepare('INSERT INTO activity_log (title, detail) VALUES (?, ?)').run(title, detail); }
function seedExercises() {
 const categoryRows = [['upper','بالاتنه',1],['lower','پایین‌تنه',2],['core','میان‌تنه',3],['cardio','هوازی',4]];
 const category = db.prepare('INSERT OR IGNORE INTO exercise_categories (id,name,sort_order) VALUES (?,?,?)');
 categoryRows.forEach(row => category.run(...row));
 const subRows = [['chest','upper','سینه',1],['back','upper','پشت',2],['shoulder','upper','سرشانه',3],['arms','upper','بازو',4],['quads','lower','چهارسر',1],['hamstrings','lower','همسترینگ',2],['glutes','lower','سرینی',3],['abs','core','شکم',1],['plank','core','پلانک',2],['running','cardio','دویدن',1]];
 const sub = db.prepare('INSERT OR IGNORE INTO exercise_subcategories (id,category_id,name,sort_order) VALUES (?,?,?,?)');
 subRows.forEach(row => sub.run(...row));
 if (scalar('SELECT COUNT(*) AS total FROM exercises').total) return;
 const exercise = db.prepare('INSERT INTO exercises (name_fa,location,category_id,subcategory_id,status) VALUES (?,?,?,?,?)');
 [['پرس سینه هالتر','gym','upper','chest','active'],['شنا سوئدی','home','upper','chest','active'],['لت سیم‌کش از جلو','gym','upper','back','active'],['بارفیکس دست باز','both','upper','back','active'],['پرس سرشانه دمبل','both','upper','shoulder','active'],['جلو بازو دمبل','both','upper','arms','active'],['اسکوات هالتر','gym','lower','quads','active'],['اسکوات وزن بدن','home','lower','quads','active'],['ددلیفت رومانیایی','gym','lower','hamstrings','active'],['پل باسن','home','lower','glutes','active'],['کرانچ','home','core','abs','active'],['پلانک ساعد','both','core','plank','active'],['دویدن روی تردمیل','gym','cardio','running','active'],['دویدن درجا','home','cardio','running','archived']].forEach(row => exercise.run(...row));
}
function seed() {
 seedExercises();
 const has = scalar('SELECT COUNT(*) AS total FROM students').total;
 if (has) return;
 const add = db.prepare('INSERT INTO students (full_name,mobile,goal,status,weight,height) VALUES (?,?,?,?,?,?)');
 add.run('سارا احمدی','09121234567','کاهش وزن','فعال',68,165);
 add.run('امیرحسین رضایی','09129876543','افزایش حجم','فعال',81,179);
 add.run('نگار محمدی','09351234567','اصلاح فرم بدن','در انتظار',59,161);
 const move = db.prepare('INSERT INTO movements (name,muscle_group,equipment) VALUES (?,?,?)');
 [['اسکوات هالتر','پا','هالتر'],['پرس سینه','سینه','هالتر'],['لت سیم‌کش','پشت','سیم‌کش'],['پلانک','میان‌تنه','وزن بدن']].forEach(x=>move.run(...x));
 db.prepare('INSERT INTO programs (student_id,title,type,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?)').run(1,'برنامه چربی‌سوزی شهریور','تمرینی','فعال','2026-08-01','2026-08-31','سه جلسه در هفته');
 db.prepare('INSERT INTO programs (student_id,title,type,status,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?)').run(2,'برنامه افزایش حجم','غذایی','فعال','2026-08-05','2026-09-05','پنج وعده غذایی');
 db.prepare('INSERT INTO orders (student_id,service_type,status,amount) VALUES (?,?,?,?)').run(3,'برنامه اصلاحی','در انتظار تکمیل برنامه',750000);
 log('Yasnafit آماده شد','دیتابیس محلی و داده‌های نمونه ایجاد شدند.');
}
seed();
function backup() { const file = path.join(backupDir, `yasnafit-${new Date().toISOString().replace(/[:.]/g,'-')}.db`); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); fs.copyFileSync(dbPath, file); return path.basename(file); }
module.exports = { db, dbPath, backup, log };
