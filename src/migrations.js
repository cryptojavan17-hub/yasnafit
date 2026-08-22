const fs = require('fs');
const path = require('path');

// Versioned migrations - idempotent, ordered
const migrations = [
  {
    id: '001_initial',
    description: 'Initial core tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name TEXT NOT NULL,
          mobile TEXT,
          goal TEXT,
          status TEXT NOT NULL DEFAULT 'فعال',
          weight REAL,
          height REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          muscle_group TEXT,
          equipment TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS exercise_categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS exercise_subcategories (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(category_id) REFERENCES exercise_categories(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS exercises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name_fa TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT 'both' CHECK(location IN ('gym','home','both')),
          category_id TEXT NOT NULL,
          subcategory_id TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(category_id) REFERENCES exercise_categories(id),
          FOREIGN KEY(subcategory_id) REFERENCES exercise_subcategories(id)
        );
        CREATE TABLE IF NOT EXISTS programs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'پیش‌نویس',
          start_date TEXT,
          end_date TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS measurements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          weight REAL,
          waist REAL,
          recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER,
          service_type TEXT,
          status TEXT NOT NULL DEFAULT 'در انتظار تکمیل برنامه',
          amount REAL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          detail TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  },
  {
    id: '002_exercises_full',
    description: 'Full exercise model with 2707 movements, images, 13 clean categories',
    up: (db) => {
      // Add columns if not exists
      const ensureColumn = (table, col, def) => {
        try {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
          if(!cols.includes(col)){
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch(e){}
      };
      ensureColumn('exercises','original_id','INTEGER');
      ensureColumn('exercises','name_en',"TEXT DEFAULT ''");
      ensureColumn('exercises','image_path','TEXT');
      ensureColumn('exercises','video_path','TEXT');
      ensureColumn('exercises','priority','INTEGER DEFAULT 5');
      ensureColumn('exercises','equipment',"TEXT DEFAULT ''");
      ensureColumn('exercises','difficulty',"TEXT DEFAULT 'beginner'");
      ensureColumn('exercises','description',"TEXT DEFAULT ''");
      ensureColumn('exercise_categories','original_id','INTEGER');
      ensureColumn('exercise_subcategories','original_id','INTEGER');
      ensureColumn('students','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
      ensureColumn('students','stable_id','TEXT');
      ensureColumn('students','version','INTEGER DEFAULT 1');
      ensureColumn('students','deleted_at','TEXT');

      // Create indexes for exercises
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_status ON exercises(status)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_location ON exercises(location)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_original ON exercises(original_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name_fa)'); } catch(e){}
    }
  },
  {
    id: '003_program_builder',
    description: 'Redesigned training program builder tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS training_programs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER,
          title TEXT NOT NULL DEFAULT 'برنامه تمرینی جدید',
          coach_note TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'پیش‌نویس',
          start_date TEXT,
          end_date TEXT,
          program_data TEXT DEFAULT '{}',
          version INTEGER DEFAULT 1,
          stable_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS program_days (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          program_id INTEGER NOT NULL,
          day_number INTEGER NOT NULL,
          day_hash TEXT NOT NULL,
          focus TEXT DEFAULT '',
          coach_note TEXT DEFAULT '',
          is_rest_day INTEGER DEFAULT 0,
          version INTEGER DEFAULT 1,
          stable_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(program_id) REFERENCES training_programs(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS exercise_systems (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          day_id INTEGER NOT NULL,
          exercise_system_id INTEGER DEFAULT 1,
          system_hash TEXT NOT NULL,
          system_type TEXT DEFAULT 'normal',
          version INTEGER DEFAULT 1,
          stable_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(day_id) REFERENCES program_days(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS program_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          system_id INTEGER NOT NULL,
          exercise_id INTEGER,
          original_exercise_id INTEGER,
          movement_hash TEXT NOT NULL,
          description TEXT DEFAULT '',
          order_index INTEGER DEFAULT 0,
          version INTEGER DEFAULT 1,
          stable_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(system_id) REFERENCES exercise_systems(id) ON DELETE CASCADE,
          FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS movement_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          movement_id INTEGER NOT NULL,
          set_hash TEXT NOT NULL,
          set_type TEXT NOT NULL DEFAULT 'REPEAT',
          count_value TEXT,
          weight REAL,
          rest_seconds INTEGER DEFAULT 60,
          version INTEGER DEFAULT 1,
          stable_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(movement_id) REFERENCES program_movements(id) ON DELETE CASCADE
        );
      `);

      // Unique constraints for hashes
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_program_days_hash ON program_days(day_hash)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_systems_hash ON exercise_systems(system_hash)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_program_movements_hash ON program_movements(movement_hash)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_sets_hash ON movement_sets(set_hash)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_training_programs_stable ON training_programs(stable_id)'); } catch(e){}

      // Indexes for performance
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_program_days_program ON program_days(program_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercise_systems_day ON exercise_systems(day_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_program_movements_system ON program_movements(system_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_movement_sets_movement ON movement_sets(movement_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_training_programs_student ON training_programs(student_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_training_programs_deleted ON training_programs(deleted_at)'); } catch(e){}
    }
  },
  {
    id: '004_program_integrity',
    description: 'Ensure program source of truth is normalized tables, cleanup old categories',
    up: (db) => {
      // Add missing columns to existing tables if needed
      const ensureColumn = (table, col, def) => {
        try {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
          if(!cols.includes(col)){
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch(e){}
      };
      ensureColumn('program_movements','original_exercise_id','INTEGER');
      ensureColumn('movement_sets','count_value','TEXT');
      ensureColumn('training_programs','version','INTEGER DEFAULT 1');
      ensureColumn('training_programs','stable_id','TEXT');
      ensureColumn('training_programs','deleted_at','TEXT');
      ensureColumn('program_days','version','INTEGER DEFAULT 1');
      ensureColumn('program_days','stable_id','TEXT');
      ensureColumn('program_days','deleted_at','TEXT');
      ensureColumn('program_days','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
      ensureColumn('exercise_systems','version','INTEGER DEFAULT 1');
      ensureColumn('exercise_systems','stable_id','TEXT');
      ensureColumn('exercise_systems','deleted_at','TEXT');
      ensureColumn('exercise_systems','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
      ensureColumn('program_movements','version','INTEGER DEFAULT 1');
      ensureColumn('program_movements','stable_id','TEXT');
      ensureColumn('program_movements','deleted_at','TEXT');
      ensureColumn('program_movements','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
      ensureColumn('movement_sets','version','INTEGER DEFAULT 1');
      ensureColumn('movement_sets','stable_id','TEXT');
      ensureColumn('movement_sets','deleted_at','TEXT');
      ensureColumn('movement_sets','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

      // Cleanup old categories
      try {
        db.exec('PRAGMA foreign_keys = OFF');
        db.exec(`UPDATE exercises SET category_id='shoulders', subcategory_id='shoulders-fly' WHERE category_id='other'`);
        db.prepare(`DELETE FROM exercise_subcategories WHERE category_id IN ('upper','lower','core','other')`).run();
        db.prepare(`DELETE FROM exercise_subcategories WHERE id IN ('chest-legacy','back-legacy','shoulder-legacy','arms-legacy','quads','hamstrings','glutes','abs-legacy','plank-legacy','running')`).run();
        db.prepare(`DELETE FROM exercise_categories WHERE id IN ('upper','lower','core','other')`).run();
        db.exec('PRAGMA foreign_keys = ON');
      } catch(e){ console.log('Cleanup:', e.message); }

      // Ensure stable_id for existing programs
      try {
        const programs = db.prepare('SELECT id, stable_id FROM training_programs WHERE stable_id IS NULL').all();
        const upd = db.prepare('UPDATE training_programs SET stable_id=? WHERE id=?');
        for(const p of programs){
          upd.run(require('crypto').randomUUID ? require('crypto').randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36), p.id);
        }
      } catch(e){}
    }
  },
  {
    id: '005_sync_metadata',
    description: 'Sync readiness: add sync metadata to all relevant tables',
    up: (db) => {
      const ensureColumn = (table, col, def) => {
        try {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
          if(!cols.includes(col)){
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch(e){}
      };

      // Students already has sync fields from 002
      // Exercises
      ensureColumn('exercises','stable_id','TEXT');
      ensureColumn('exercises','version','INTEGER DEFAULT 1');
      ensureColumn('exercises','deleted_at','TEXT');
      // Categories
      ensureColumn('exercise_categories','stable_id','TEXT');
      ensureColumn('exercise_categories','version','INTEGER DEFAULT 1');
      ensureColumn('exercise_categories','deleted_at','TEXT');
      ensureColumn('exercise_categories','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
      ensureColumn('exercise_subcategories','stable_id','TEXT');
      ensureColumn('exercise_subcategories','version','INTEGER DEFAULT 1');
      ensureColumn('exercise_subcategories','deleted_at','TEXT');
      ensureColumn('exercise_subcategories','updated_at',"TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

      // Indexes for sync
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_deleted ON exercises(deleted_at)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_students_deleted ON students(deleted_at)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_exercises_stable ON exercises(stable_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_students_stable ON students(stable_id)'); } catch(e){}

      // Settings for migration version
      try {
        db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').run('schema_version','005');
      } catch(e){}
    }
  },
  {
    id: '006_student_portal_lifecycle',
    description: 'Phase 2: Student Portal + Assessment + Monthly Coaching Lifecycle',
    up: (db) => {
      const ensureColumn = (table, col, def) => {
        try {
          const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
          if(!cols.includes(col)){
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
          }
        } catch(e){}
      };

      // Enhance students table with full profile fields
      ensureColumn('students','date_of_birth','TEXT');
      ensureColumn('students','training_experience','TEXT DEFAULT ""');
      ensureColumn('students','training_level','TEXT DEFAULT "beginner"');
      ensureColumn('students','occupation','TEXT DEFAULT ""');
      ensureColumn('students','preferred_location','TEXT DEFAULT "gym"');
      ensureColumn('students','limitations','TEXT DEFAULT ""');
      ensureColumn('students','injuries','TEXT DEFAULT ""');
      ensureColumn('students','medical_notes','TEXT DEFAULT ""');
      ensureColumn('students','coach_notes','TEXT DEFAULT ""');
      ensureColumn('students','profile_status','TEXT DEFAULT "INVITED"');
      ensureColumn('students','last_assessment_id','INTEGER');

      // Add assessment_id to training_programs for Assessment -> Program link
      ensureColumn('training_programs','assessment_id','INTEGER');
      ensureColumn('training_programs','program_number','INTEGER DEFAULT 1');

      // Student Invites - secure token system
      db.exec(`
        CREATE TABLE IF NOT EXISTS student_invites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT,
          student_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          token_preview TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','revoked','expired')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TEXT,
          used_at TEXT,
          revoked_at TEXT,
          version INTEGER DEFAULT 1,
          deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
      `);
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_student_invites_student ON student_invites(student_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_student_invites_hash ON student_invites(token_hash)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_student_invites_stable ON student_invites(stable_id)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_student_invites_stable_unique ON student_invites(stable_id)'); } catch(e){}

      // Body Assessments - historical, never overwritten
      db.exec(`
        CREATE TABLE IF NOT EXISTS body_assessments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT,
          student_id INTEGER NOT NULL,
          assessment_number INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'PROFILE_INCOMPLETE' CHECK(status IN ('INVITED','PROFILE_INCOMPLETE','ASSESSMENT_PENDING','SUBMITTED','UNDER_REVIEW','CHANGES_REQUESTED','APPROVED','ACTIVE','PROGRAM_ASSIGNED','AWAITING_NEXT_ASSESSMENT','ARCHIVED')),
          weight REAL,
          height REAL,
          waist REAL,
          chest REAL,
          hips REAL,
          body_fat REAL,
          muscle_mass REAL,
          measurements TEXT DEFAULT '{}',
          goal TEXT DEFAULT '',
          training_experience TEXT DEFAULT '',
          limitations TEXT DEFAULT '',
          injuries TEXT DEFAULT '',
          student_note TEXT DEFAULT '',
          coach_note TEXT DEFAULT '',
          submitted_at TEXT,
          reviewed_at TEXT,
          program_id INTEGER,
          version INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
          FOREIGN KEY(program_id) REFERENCES training_programs(id) ON DELETE SET NULL
        );
      `);
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_body_assessments_student ON body_assessments(student_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_body_assessments_status ON body_assessments(status)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_body_assessments_number ON body_assessments(student_id, assessment_number)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_body_assessments_stable ON body_assessments(stable_id)'); } catch(e){}
      try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_body_assessments_stable_unique ON body_assessments(stable_id)'); } catch(e){}

      // Assessment Photos - private, secure
      db.exec(`
        CREATE TABLE IF NOT EXISTS assessment_photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT,
          assessment_id INTEGER NOT NULL,
          student_id INTEGER NOT NULL,
          photo_type TEXT NOT NULL DEFAULT 'front' CHECK(photo_type IN ('front','back','side','front_flex','back_flex','other')),
          storage_path TEXT NOT NULL,
          original_filename TEXT,
          mime_type TEXT,
          size_bytes INTEGER,
          version INTEGER DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
      `);
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_assessment_photos_assessment ON assessment_photos(assessment_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_assessment_photos_student ON assessment_photos(student_id)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_assessment_photos_type ON assessment_photos(photo_type)'); } catch(e){}
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_assessment_photos_stable ON assessment_photos(stable_id)'); } catch(e){}

      // Ensure training_programs has assessment_id index
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_training_programs_assessment ON training_programs(assessment_id)'); } catch(e){}

      // Create data directory for private photos
      try {
        const path = require('path');
        const fs = require('fs');
        const root = path.resolve(__dirname, '..');
        const assessmentsDir = path.join(root, 'data', 'assessments');
        fs.mkdirSync(assessmentsDir, {recursive:true});
      } catch(e){}
    }
  },
  {
    id: '007_monthly_workflow_integrity',
    description: 'Harden assessment history, private photos, invitations, and program lifecycle',
    up: (db) => {
      const ensureColumn = (table, col, def) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        if(!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      };

      // Sync/audit metadata omitted by the first lifecycle migration.
      ensureColumn('student_invites', 'updated_at', 'TEXT');
      ensureColumn('assessment_photos', 'updated_at', 'TEXT');
      ensureColumn('training_programs', 'assigned_at', 'TEXT');
      ensureColumn('training_programs', 'completed_at', 'TEXT');
      ensureColumn('training_programs', 'archived_at', 'TEXT');
      db.exec(`
        UPDATE student_invites SET updated_at=COALESCE(updated_at, created_at);
        UPDATE assessment_photos SET updated_at=COALESCE(updated_at, created_at);
        UPDATE training_programs SET status='DRAFT' WHERE status IN ('پیش‌نویس', 'draft', 'Draft');
      `);

      // Older Phase 2 builds allowed duplicate current slots. Preserve every row but
      // soft-delete superseded copies before enforcing one current photo per type.
      db.exec(`
        UPDATE assessment_photos
        SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP, version=version+1
        WHERE deleted_at IS NULL AND id NOT IN (
          SELECT MAX(id) FROM assessment_photos WHERE deleted_at IS NULL GROUP BY assessment_id, photo_type
        );
      `);

      // Historical numbering is immutable and unique per student. A photo type may
      // have one current file per assessment; replacements soft-delete the prior file.
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_body_assessments_student_number
          ON body_assessments(student_id, assessment_number);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_photos_current_type
          ON assessment_photos(assessment_id, photo_type) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_training_programs_student_status
          ON training_programs(student_id, status, deleted_at);
        CREATE INDEX IF NOT EXISTS idx_training_programs_dates
          ON training_programs(start_date, end_date);
      `);
    }
  },
  {
    id: '008_application_releases',
    description: 'Structured application release history (independent of schema version)',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS releases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          release_date TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          changes_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK(json_valid(changes_json))
        );
        CREATE INDEX IF NOT EXISTS idx_releases_date ON releases(release_date DESC, id DESC);
      `);

      const seed=db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `);
      const releases=[
        {
          version:'0.1.0',
          title:'Initial Development Release',
          release_date:'2026-08-22',
          summary:'انتشار توسعه اولیه و معماری محلی Yasnafit',
          changes:{
            features:[
              'مدیریت بانک ۲۷۰۷ حرکت تمرینی و ۱۳ دسته‌بندی',
              'Program Builder با ساختار روز، سیستم، حرکت و ست',
              'ذخیره‌سازی محلی SQLite، migrationها، پشتیبان‌گیری و launcher'
            ],
            improvements:['یکپارچه‌سازی جداول نرمال‌شده به‌عنوان منبع اصلی برنامه تمرینی'],
            fixes:[], security:[], breaking_changes:[]
          }
        },
        {
          version:'0.2.0',
          title:'Student Portal and Monthly Coaching',
          release_date:'2026-08-22',
          summary:'چرخه کامل دعوت شاگرد، ارزیابی، بررسی مربی و برنامه ماهانه',
          changes:{
            features:[
              'پورتال خصوصی شاگرد و لینک دعوت اختصاصی',
              'ارزیابی بدنی ماهانه و عکس‌های جلو، پشت و کنار',
              'بررسی و تایید ارزیابی توسط مربی',
              'اتصال ارزیابی تاییدشده به برنامه ماهانه در Program Builder',
              'تاریخچه دائمی ارزیابی‌ها و برنامه‌ها و مقایسه ماهانه'
            ],
            improvements:['نمایش فقط‌خواندنی برنامه فعال در پورتال شاگرد'],
            fixes:[],
            security:['هش‌کردن توکن دعوت و نگهداری خصوصی عکس‌های ارزیابی'],
            breaking_changes:[]
          }
        },
        {
          version:'0.2.1',
          title:'Production Readiness and Security Fixes',
          release_date:'2026-08-22',
          summary:'اصلاحات ممیزی نهایی امنیت، اعتبارسنجی و تغییرناپذیری سوابق',
          changes:{
            features:[],
            improvements:['افزایش پوشش تست چرخه کامل دو شاگرد و دو ماه'],
            fixes:[
              'جلوگیری از ویرایش ارزیابی ارسال‌شده و برنامه فعال یا تاریخی',
              'اعتبارسنجی شماره روز، زمان استراحت و شناسه حرکت در Program Builder'
            ],
            security:[
              'تقویت احراز دسترسی مربی و جداسازی کامل پورتال شاگرد',
              'اعتبارسنجی ساختاری JPEG، PNG و WEBP و جلوگیری از فایل جعلی',
              'تقویت مجوز دسترسی به عکس خصوصی و جلوگیری از path traversal'
            ],
            breaking_changes:[]
          }
        },
        {
          version:'0.3.0',
          title:'Application Versioning and Release History',
          release_date:'2026-08-22',
          summary:'نسخه‌بندی معنایی متمرکز و تاریخچه ساخت‌یافته انتشارها',
          changes:{
            features:[
              'منبع مرکزی نسخه برنامه با Semantic Versioning',
              'API نسخه فعلی و تاریخچه انتشارها',
              'صفحه نسخه و تغییرات در پنل مربی'
            ],
            improvements:['نمایش ظریف نسخه فعلی در داشبورد و نوار کناری'],
            fixes:[], security:[], breaking_changes:[]
          }
        }
      ];
      for(const release of releases){
        seed.run(release.version,release.title,release.release_date,release.summary,JSON.stringify(release.changes));
      }
    }
  }
];

function runMigrations(db){
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map(r=>r.id));
  console.log(`[Migrations] Applied: ${[...applied].join(', ') || 'none'}`);

  for(const mig of migrations){
    if(applied.has(mig.id)){
      console.log(`[Migrations] Skipping ${mig.id} - already applied`);
      continue;
    }
    console.log(`[Migrations] Applying ${mig.id}: ${mig.description}`);
    try {
      db.exec('BEGIN');
      mig.up(db);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(mig.id);
      db.exec('COMMIT');
      console.log(`[Migrations] ✅ ${mig.id} applied`);
    } catch(e){
      db.exec('ROLLBACK');
      console.error(`[Migrations] ❌ Failed ${mig.id}:`, e);
      throw e;
    }
  }

  // Update schema_version setting
  try {
    const latest = migrations[migrations.length-1].id;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('schema_version', latest);
  } catch(e){}
}

module.exports = { migrations, runMigrations };
