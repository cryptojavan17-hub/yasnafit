const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('./migrations');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const backupDir = path.join(root, 'backups');
const dataSourcePath = path.join(root, 'data-source', 'exercises_data.json');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });
const dbPath = path.join(dataDir, 'yasnafit.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Run versioned migrations first - ensures schema_migrations table and all tables
try {
  runMigrations(db);
} catch(e){
  console.error('Migration failed, continuing with fallback init:', e.message);
  // Fallback minimal init if migrations fail
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, mobile TEXT, goal TEXT, status TEXT NOT NULL DEFAULT 'فعال', weight REAL, height REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
}

db.exec(`
CREATE TABLE IF NOT EXISTS movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, muscle_group TEXT, equipment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
`);

function scalar(sql, ...params) { return db.prepare(sql).get(...params); }
function log(title, detail = '') { try { db.prepare('INSERT INTO activity_log (title, detail) VALUES (?, ?)').run(title, detail); } catch(e){} }

function seedCategories() {
  // 13 دسته اصلی تمیز - بدون قدیمی و سایر
  const categoryRows = [
    ['chest', 'سینه', 1, 4],
    ['back', 'پشت', 2, 5],
    ['shoulders', 'سرشانه', 3, 3],
    ['biceps', 'جلو بازو', 4, 1],
    ['triceps', 'پشت بازو', 5, 2],
    ['legs', 'پا', 6, 6],
    ['abs', 'شکم و میان‌تنه', 7, 7],
    ['forearms', 'ساعد', 8, 26],
    ['traps', 'کول و شراگ', 9, 27],
    ['lower_back', 'فیله کمر', 10, 22],
    ['neck', 'گردن', 11, 21],
    ['cardio', 'هوازی', 12, 8],
    ['warmup', 'گرم کردن و سرد کردن', 13, 9],
  ];

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    // Cleanup: حذف دسته‌های قدیمی و سایر
    try {
      // انتقال حرکت سایر (وای فلای) به سرشانه
      db.exec(`UPDATE exercises SET category_id='shoulders', subcategory_id='shoulders-fly' WHERE category_id='other'`);
      // حذف زیردسته‌های قدیمی
      db.prepare(`DELETE FROM exercise_subcategories WHERE category_id IN ('upper','lower','core','other')`).run();
      db.prepare(`DELETE FROM exercise_subcategories WHERE id IN ('chest-legacy','back-legacy','shoulder-legacy','arms-legacy','quads','hamstrings','glutes','abs-legacy','plank-legacy','running')`).run();
      // حذف دسته‌های قدیمی
      db.prepare(`DELETE FROM exercise_categories WHERE id IN ('upper','lower','core','other')`).run();
    } catch(e){
      console.log('Cleanup old categories:', e.message);
    }

    const catStmt = db.prepare('INSERT OR IGNORE INTO exercise_categories (id,name,sort_order,original_id) VALUES (?,?,?,?)');
    const catUpdate = db.prepare('UPDATE exercise_categories SET name=?, sort_order=?, original_id=? WHERE id=?');
    categoryRows.forEach(row => {
      const [id, name, sort_order, original_id] = row;
      const res = catStmt.run(id, name, sort_order, original_id);
      if (res.changes === 0) catUpdate.run(name, sort_order, original_id, id);
    });

    const subRows = [
      ['chest-upper', 'chest', 'بالا سینه', 1, 24],
      ['chest-lower', 'chest', 'زیر سینه', 2, 28],
      ['chest-mid', 'chest', 'سینه میانی', 3, 29],
      ['chest-fly', 'chest', 'قفسه سینه', 4, 30],
      ['shoulders-press', 'shoulders', 'پرس سرشانه', 1, 31],
      ['shoulders-reverse', 'shoulders', 'سرشانه معکوس', 2, 32],
      ['shoulders-fly', 'shoulders', 'فلای سرشانه', 3, 33],
      ['legs-press', 'legs', 'پرس پا', 1, 36],
      ['legs-curl', 'legs', 'پشت و جلو پا', 2, 37],
      ['calves', 'legs', 'ساق پا', 3, 38],
      ['legs-hack', 'legs', 'هاگ و باسن', 4, 39],
      ['abs-core', 'abs', 'شکم', 1, 34],
      ['abs-oblique', 'abs', 'پهلو', 2, null],
      ['abs-plank', 'abs', 'پلانک', 3, null],
      ['back-lats', 'back', 'زیربغل', 1, null],
      ['back-row', 'back', 'قایقی', 2, null],
      ['biceps-general', 'biceps', 'عمومی', 1, null],
      ['triceps-general', 'triceps', 'عمومی', 1, null],
      ['forearms-general', 'forearms', 'عمومی', 1, null],
      ['traps-general', 'traps', 'عمومی', 1, null],
      ['cardio-general', 'cardio', 'هوازی عمومی', 1, null],
      ['neck-general', 'neck', 'گردن عمومی', 1, null],
      ['lower_back-general', 'lower_back', 'فیله عمومی', 1, null],
    ];
    const subStmt = db.prepare('INSERT OR IGNORE INTO exercise_subcategories (id,category_id,name,sort_order,original_id) VALUES (?,?,?,?,?)');
    const subUpdate = db.prepare('UPDATE exercise_subcategories SET category_id=?, name=?, sort_order=?, original_id=? WHERE id=?');
    subRows.forEach(row => {
      const [id, catId, name, sort_order, original_id] = row;
      const res = subStmt.run(id, catId, name, sort_order, original_id);
      if (res.changes === 0) subUpdate.run(catId, name, sort_order, original_id, id);
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function importExercisesFromJson() {
  if (!fs.existsSync(dataSourcePath)) {
    console.log('No exercises_data.json found at', dataSourcePath);
    return 0;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(dataSourcePath, 'utf-8'));
  } catch (e) {
    console.error('Failed to parse exercises_data.json:', e.message);
    return 0;
  }
  const movements = raw.movements || raw.exercises || raw.data || [];
  if (!Array.isArray(movements) || movements.length === 0) {
    console.log('No movements found in JSON');
    return 0;
  }

  // Mapping numeric categoryId to string id - سایر حذف شد، وای فلای به سرشانه می‌رود
  const catMap = {
    1: 'biceps',
    2: 'triceps',
    3: 'shoulders',
    4: 'chest',
    5: 'back',
    6: 'legs',
    7: 'abs',
    8: 'cardio',
    9: 'warmup',
    21: 'neck',
    22: 'lower_back',
    23: 'shoulders', // سایر حذف شد - وای فلای به سرشانه فلای
    26: 'forearms',
    27: 'traps'
  };
  const subMap = {
    24: 'chest-upper',
    28: 'chest-lower',
    29: 'chest-mid',
    30: 'chest-fly',
    31: 'shoulders-press',
    32: 'shoulders-reverse',
    33: 'shoulders-fly',
    34: 'abs-core',
    36: 'legs-press',
    37: 'legs-curl',
    38: 'calves',
    39: 'legs-hack'
  };

  const existingCount = scalar('SELECT COUNT(*) as total FROM exercises').total;
  if (existingCount >= 2000) {
    console.log(`Exercises already imported: ${existingCount} items, skipping.`);
    return existingCount;
  }

  // Clear old small seed if less than 100
  if (existingCount < 100) {
    db.exec('DELETE FROM exercises');
  }

  const insert = db.prepare(`
    INSERT INTO exercises
    (original_id, name_fa, location, category_id, subcategory_id, status, image_path, video_path, priority)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  let imported = 0;
  const transaction = db.prepare('BEGIN');
  transaction.run;
  db.exec('BEGIN');
  try {
    for (const m of movements) {
      const origId = m.id;
      const title = (m.title || '').trim();
      if (!title) continue;
      const catIdNum = m.categoryId;
      const categoryId = catMap[catIdNum] || 'other';
      const subIdNum = m.subCat;
      let subcategoryId = subMap[subIdNum] || null;
      // If no sub mapping but category has general sub, use it
      if (!subcategoryId) {
        const fallbackMap = {
          'biceps': 'biceps-general',
          'triceps': 'triceps-general',
          'forearms': 'forearms-general',
          'traps': 'traps-general',
          'back': 'back-lats',
          'cardio': 'cardio-general',
          'neck': 'neck-general',
          'lower_back': 'lower_back-general',
          'abs': 'abs-core',
          'chest': 'chest-mid',
          'shoulders': 'shoulders-press',
          'legs': 'legs-press'
        };
        subcategoryId = fallbackMap[categoryId] || null;
      }

      let location = 'both';
      if (m.location === 'باشگاه') location = 'gym';
      else if (m.location === 'منزل') location = 'home';

      const isArchived = m.is_archive === true || m.is_removed === true;
      const status = isArchived ? 'archived' : 'active';
      const imagePath = m.image || null; // e.g. /files/exercise/images/4.png
      const videoPath = m.video || null;
      const priority = m.priority || 5;

      // Check duplicate by original_id
      const exists = db.prepare('SELECT id FROM exercises WHERE original_id = ?').get(origId);
      if (exists) continue;

      insert.run(origId, title, location, categoryId, subcategoryId, status, imagePath, videoPath, priority);
      imported++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Import failed:', e);
    return 0;
  }

  console.log(`Imported ${imported} exercises from JSON (total now ${scalar('SELECT COUNT(*) as total FROM exercises').total})`);
  log('حرکات تمرینی ایمپورت شد', `${imported} حرکت از فایل JSON`);
  return imported;
}

function seedExercises() {
  seedCategories();
  const count = importExercisesFromJson();
  if (count === 0) {
    // Fallback small seed if no JSON
    if (scalar('SELECT COUNT(*) AS total FROM exercises').total) return;
    const exercise = db.prepare('INSERT INTO exercises (name_fa,location,category_id,subcategory_id,status) VALUES (?,?,?,?,?)');
    [['پرس سینه هالتر','gym','chest','chest-mid','active'],['شنا سوئدی','home','chest','chest-mid','active'],['لت سیم‌کش از جلو','gym','back','back-lats','active'],['بارفیکس دست باز','both','back','back-lats','active'],['پرس سرشانه دمبل','both','shoulders','shoulders-press','active'],['جلو بازو دمبل','both','biceps','biceps-general','active'],['اسکوات هالتر','gym','legs','legs-press','active'],['اسکوات وزن بدن','home','legs','legs-press','active'],['ددلیفت رومانیایی','gym','legs','legs-curl','active'],['پل باسن','home','legs','legs-hack','active'],['کرانچ','home','abs','abs-core','active'],['پلانک ساعد','both','abs','abs-plank','active'],['دویدن روی تردمیل','gym','cardio','cardio-general','active'],['دویدن درجا','home','cardio','cardio-general','archived']].forEach(row => exercise.run(...row));
  }
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
module.exports = { db, dbPath, backup, log, importExercisesFromJson, seedCategories };
