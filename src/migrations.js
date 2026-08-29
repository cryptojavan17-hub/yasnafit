const fs = require('fs');
const path = require('path');
const studentAuth = require('./student-auth-service');

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
      ensureColumn('exercises','target_muscles','TEXT');
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
  },
  {
    id: '009_my_students_crm_release',
    description: 'Release record for the complete coach My Students CRM',
    up: (db) => {
      const changes={
        features:[
          'صفحه واقعی شاگرد های من با جستجو، فیلتر و آمار زنده',
          'پرونده کامل شاگرد شامل ارزیابی‌ها، عکس‌های خصوصی، برنامه‌ها و تایم‌لاین',
          'مدیریت لینک دعوت و درخواست ارزیابی جدید از پرونده شاگرد',
          'نمایش فقط‌خواندنی برنامه‌های تاریخی'
        ],
        improvements:[
          'تجمیع وضعیت ارزیابی و برنامه ماهانه در API مدیریت شاگردان',
          'صفحه‌بندی سمت سرور برای رشد تعداد شاگردان'
        ],
        fixes:['حذف renderer قدیمی و جلوگیری از نمایش placeholder در مسیر /users-list'],
        security:['حفظ دسترسی coach-only و استفاده از endpoint محافظت‌شده عکس‌ها'],
        breaking_changes:[]
      };
      db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `).run(
        '0.4.0','Complete My Students CRM','2026-08-22',
        'مرکز واقعی مدیریت شاگرد، دعوت، ارزیابی، برنامه و تاریخچه ماهانه',
        JSON.stringify(changes)
      );
    }
  },
  {
    id: '010_repair_legacy_student_timestamps',
    description: 'Repair missing student timestamps in legacy SQLite databases',
    up: (db) => {
      const columns=new Set(db.prepare('PRAGMA table_info(students)').all().map(column=>column.name));
      // SQLite cannot add a column with CURRENT_TIMESTAMP as a non-constant default
      // to a populated legacy table. Add nullable columns first, then backfill safely.
      if(!columns.has('created_at')) db.exec('ALTER TABLE students ADD COLUMN created_at TEXT');
      if(!columns.has('updated_at')) db.exec('ALTER TABLE students ADD COLUMN updated_at TEXT');
      db.exec(`
        UPDATE students
        SET created_at=COALESCE(created_at,CURRENT_TIMESTAMP),
            updated_at=COALESCE(updated_at,created_at,CURRENT_TIMESTAMP)
        WHERE created_at IS NULL OR updated_at IS NULL;
      `);

      const changes={
        features:[], improvements:[],
        fixes:['ترمیم خودکار ستون updated_at برای دیتابیس‌های قدیمی شاگردان'],
        security:[], breaking_changes:[]
      };
      db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `).run(
        '0.4.1','Legacy Student Database Compatibility','2026-08-22',
        'رفع خطای صفحه شاگردها در دیتابیس‌های قدیمی بدون حذف اطلاعات',
        JSON.stringify(changes)
      );
    }
  },
  {
    id: '011_student_sessions_portal',
    description: 'Dedicated hashed student sessions and production student portal release',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS student_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT NOT NULL UNIQUE,
          invitation_id INTEGER,
          student_id INTEGER NOT NULL,
          session_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(invitation_id) REFERENCES student_invites(id) ON DELETE SET NULL,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_student_sessions_student
          ON student_sessions(student_id, revoked_at, expires_at);
        CREATE INDEX IF NOT EXISTS idx_student_sessions_invitation
          ON student_sessions(invitation_id);
        CREATE INDEX IF NOT EXISTS idx_student_sessions_hash
          ON student_sessions(session_hash);
      `);
      const changes={
        features:[
          'نشست مستقل و امن شاگرد با cookie از نوع HttpOnly',
          'صفحه اختصاصی join و onboarding چندمرحله‌ای',
          'داشبورد، برنامه، ارزیابی، پروفایل و تاریخچه شاگرد'
        ],
        improvements:['جداسازی کامل پوسته شاگرد از داشبورد مربی','تجربه موبایل RTL برای عکس و ارزیابی'],
        fixes:['حذف استفاده دائمی از توکن دعوت به‌عنوان credential شاگرد'],
        security:['ذخیره فقط hash نشست، انقضا، logout و کنترل دسترسی عکس بر اساس نشست'],
        breaking_changes:[]
      };
      db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `).run(
        '0.5.0','Dedicated Student Portal and Session Authentication','2026-08-22',
        'پورتال واقعی شاگرد با نشست مستقل، onboarding و تاریخچه ماهانه',
        JSON.stringify(changes)
      );
    }
  },
  {
    id: '012_onboarding_body_input_fix',
    description: 'Release record for robust localized body-information onboarding input',
    up: (db) => {
      const changes={
        features:[],improvements:['پشتیبانی از ارقام فارسی، عربی و ممیز فارسی در اطلاعات بدنی'],
        fixes:['رفع توقف مرحله اطلاعات بدنی و نمایش خطای پایدار و دقیق داخل فرم'],
        security:[],breaking_changes:[]
      };
      db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `).run(
        '0.5.1','Localized Body Information Onboarding Fix','2026-08-22',
        'رفع مشکل عبور از مرحله اطلاعات بدنی در موبایل و صفحه‌کلید فارسی',
        JSON.stringify(changes)
      );
    }
  },
  {
    id: '013_optional_body_photos_preference',
    description: 'Explicit optional body-photo preference for assessments',
    up: (db) => {
      const columns=new Set(db.prepare('PRAGMA table_info(body_assessments)').all().map(column=>column.name));
      if(!columns.has('body_photos_preference')){
        db.exec(`
          ALTER TABLE body_assessments
          ADD COLUMN body_photos_preference TEXT
          CHECK(body_photos_preference IS NULL OR body_photos_preference IN ('willing','declined'));
        `);
      }
      // Uploading a photo is explicit evidence of willingness. No-photo historical
      // records remain NULL; they must never be misclassified as declined.
      db.exec(`
        UPDATE body_assessments
        SET body_photos_preference='willing',updated_at=CURRENT_TIMESTAMP
        WHERE body_photos_preference IS NULL
          AND EXISTS (
            SELECT 1 FROM assessment_photos ap
            WHERE ap.assessment_id=body_assessments.id AND ap.deleted_at IS NULL
          );
        CREATE INDEX IF NOT EXISTS idx_body_assessments_photo_preference
          ON body_assessments(body_photos_preference,status);
      `);
      const changes={
        features:['انتخاب صریح تمایل یا عدم تمایل به ارسال تصاویر بدنی'],
        improvements:['اختیاری شدن تمام پنج جایگاه تصویر بدنی و نمایش وضعیت محترمانه به مربی'],
        fixes:['حذف کامل الزام تصویر از اعتبار و ارسال ارزیابی'],
        security:['حفظ اعتبارسنجی ساختاری و دسترسی خصوصی برای تصاویر اختیاری'],
        breaking_changes:[]
      };
      db.prepare(`
        INSERT OR IGNORE INTO releases (version,title,release_date,summary,changes_json)
        VALUES (?,?,?,?,?)
      `).run(
        '0.6.0','Optional Body Photos and Explicit Consent','2026-08-22',
        'ارسال تصاویر بدنی کاملاً اختیاری و مبتنی بر انتخاب صریح شاگرد شد',
        JSON.stringify(changes)
      );
    }
  },
  {
    id: '014_professional_assessment_profile',
    description: 'Normalized ten-step student assessment profile and canonical lifecycle',
    up: (db) => {
      const ensureColumn=(table,column,definition)=>{
        const columns=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(item=>item.name));
        if(!columns.has(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      };
      ensureColumn('students','gender',"TEXT CHECK(gender IS NULL OR gender IN ('female','male','unspecified'))");
      ensureColumn('body_assessments','assessment_type',"TEXT CHECK(assessment_type IS NULL OR assessment_type IN ('INITIAL','MONTHLY'))");
      ensureColumn('body_assessments','lifecycle_status',"TEXT CHECK(lifecycle_status IS NULL OR lifecycle_status IN ('DRAFT','SUBMITTED','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED','ARCHIVED'))");
      ensureColumn('body_assessments','approved_at','TEXT');
      ensureColumn('body_assessments','rejected_at','TEXT');
      ensureColumn('body_assessments','archived_at','TEXT');
      ensureColumn('body_assessments','draft_saved_at','TEXT');
      db.exec(`
        UPDATE body_assessments SET assessment_type=CASE WHEN assessment_number=1 THEN 'INITIAL' ELSE 'MONTHLY' END WHERE assessment_type IS NULL;
        UPDATE body_assessments SET lifecycle_status=CASE
          WHEN status IN ('INVITED','PROFILE_INCOMPLETE','ASSESSMENT_PENDING') THEN 'DRAFT'
          WHEN status='SUBMITTED' THEN 'SUBMITTED'
          WHEN status='UNDER_REVIEW' THEN 'PENDING_REVIEW'
          WHEN status='CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
          WHEN status IN ('APPROVED','ACTIVE','PROGRAM_ASSIGNED','AWAITING_NEXT_ASSESSMENT') THEN 'APPROVED'
          WHEN status='ARCHIVED' THEN 'ARCHIVED'
          ELSE 'DRAFT' END
        WHERE lifecycle_status IS NULL;
        UPDATE body_assessments SET approved_at=COALESCE(approved_at,reviewed_at)
          WHERE lifecycle_status='APPROVED';
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS assessment_goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          assessment_id INTEGER NOT NULL,goal_code TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE,
          UNIQUE(assessment_id,goal_code)
        );
        CREATE TABLE IF NOT EXISTS assessment_measurements (
          assessment_id INTEGER PRIMARY KEY,height REAL,weight REAL,around_the_arm REAL,
          around_the_chest REAL,around_the_belly REAL,around_the_belly_from_the_navel REAL,around_the_hips REAL,
          around_the_leg REAL,around_the_thigh REAL,around_the_wrist REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assessment_medical_history (
          assessment_id INTEGER PRIMARY KEY,has_disease INTEGER,disease_details TEXT,
          has_medication INTEGER,medication_details TEXT,has_injury INTEGER,injury_details TEXT,
          has_surgery INTEGER,surgery_details TEXT,last_blood_test_notes TEXT,corrective_notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assessment_medical_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          assessment_id INTEGER NOT NULL,item_kind TEXT NOT NULL CHECK(item_kind IN ('injury','surgery','disease','corrective')),
          category TEXT NOT NULL,item_name TEXT NOT NULL,notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_assessment_medical_items_assessment ON assessment_medical_items(assessment_id,item_kind);
        CREATE TABLE IF NOT EXISTS assessment_sports_history (
          assessment_id INTEGER PRIMARY KEY,average_daily_activity TEXT,practice_history INTEGER,
          practice_history_details TEXT,practice_duration TEXT,sport_discipline TEXT,
          practice_now INTEGER,current_practice_details TEXT,practice_place TEXT,
          home_equipment TEXT,sessions_per_week INTEGER,supplement_history INTEGER,
          supplement_details TEXT,doping_history TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assessment_nutrition (
          assessment_id INTEGER PRIMARY KEY,diet_type TEXT,previous_diet INTEGER,
          previous_diet_duration TEXT,previous_diet_type TEXT,previous_diet_notes TEXT,
          food_allergies TEXT,weight_changes TEXT,appetite_status TEXT,appetite_notes TEXT,
          defecation_problem TEXT,breakfast TEXT,lunch TEXT,dinner TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assessment_habits (
          assessment_id INTEGER PRIMARY KEY,smoking INTEGER,smoking_details TEXT,
          alcohol INTEGER,alcohol_details TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS assessment_pregnancy (
          assessment_id INTEGER PRIMARY KEY,childbirth_history INTEGER,childbirth_count INTEGER,
          childbirth_type TEXT,childbirth_notes TEXT,breastfeeding INTEGER,
          breastfeeding_notes TEXT,child_age_months INTEGER,formula_use INTEGER,
          formula_type TEXT,formula_amount TEXT,formula_frequency TEXT,child_food_allergy INTEGER,
          child_food_allergy_notes TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_assessments_type_status ON body_assessments(assessment_type,lifecycle_status,student_id);
      `);
      const changes={
        features:['فرم حرفه‌ای ده‌مرحله‌ای ارزیابی شاگرد','ذخیره ساخت‌یافته پزشکی، ورزشی، تغذیه، عادات و بارداری','نوع INITIAL/MONTHLY و lifecycle مستقل ارزیابی'],
        improvements:['ذخیره موقت، autosave و بازبینی کامل قبل از ارسال','مقایسه ماهانه و اتصال صریح برنامه به ارزیابی'],
        fixes:['جایگزینی کامل placeholder مسیر document/edit-document'],
        security:['اعتبارسنجی server-side همه بخش‌ها و حفظ session-bound ownership'],breaking_changes:[]
      };
      db.prepare(`INSERT OR IGNORE INTO releases(version,title,release_date,summary,changes_json) VALUES(?,?,?,?,?)`).run(
        '0.7.0','Professional Student Assessment Profile','2026-08-22',
        'ارزیابی ده‌مرحله‌ای ساخت‌یافته برای چرخه اولیه و ماهانه',JSON.stringify(changes)
      );
    }
  },
  {
    id: '015_private_assessment_documents',
    description: 'Optional private medical documents and assessment gallery files',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS assessment_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          assessment_id INTEGER NOT NULL,student_id INTEGER NOT NULL,
          document_type TEXT NOT NULL CHECK(document_type IN ('blood_test','body_analysis','additional_image')),
          storage_path TEXT NOT NULL,original_filename TEXT NOT NULL,mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_assessment_documents_assessment ON assessment_documents(assessment_id,document_type,deleted_at);
        CREATE INDEX IF NOT EXISTS idx_assessment_documents_student ON assessment_documents(student_id,deleted_at);
      `);
    }
  },
  {
    id: '016_measurement_input_compatibility',
    description: 'Release record for localized measurement step compatibility',
    up: (db) => {
      const changes={features:[],improvements:['اعتبارسنجی عددی دوطرفه در مرورگر و سرور'],fixes:['رفع توقف مرحله اندازه‌های بدنی برای ارقام فارسی، عربی و ممیز /'],security:[],breaking_changes:[]};
      db.prepare('INSERT OR IGNORE INTO releases(version,title,release_date,summary,changes_json) VALUES(?,?,?,?,?)').run('0.7.1','Localized Measurement Step Compatibility','2026-08-22','رفع قطعی توقف مرحله اندازه‌های بدنی و نمایش خطای ثابت در بالای فرم',JSON.stringify(changes));
    }
  },
  {
    id: '017_onboarding_next_button_recovery',
    description: 'Release record for async onboarding next-button recovery',
    up: (db) => {
      const changes={features:[],improvements:['مهلت ۱۵ ثانیه‌ای برای درخواست‌های پورتال شاگرد'],fixes:['رفع باقی‌ماندن دکمه مرحله بعد در حالت disabled پس از await یا خطای API'],security:[],breaking_changes:[]};
      db.prepare('INSERT OR IGNORE INTO releases(version,title,release_date,summary,changes_json) VALUES(?,?,?,?,?)').run('0.7.2','Onboarding Next Button Recovery','2026-08-22','رفع قطعی خاموش ماندن دکمه مرحله بعد در wizard ارزیابی',JSON.stringify(changes));
    }
  },
  {
    id: '018_engagement_audit_workouts',
    description: 'Workout results, notifications, secure messages and structured audit events',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          actor_type TEXT NOT NULL CHECK(actor_type IN ('coach','student','system')),
          actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id INTEGER,
          entity_stable_id TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK(json_valid(metadata_json))
        );
        CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type,entity_id,created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_type,actor_id,created_at);
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          audience_type TEXT NOT NULL CHECK(audience_type IN ('coach','student')),
          student_id INTEGER,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',
          entity_type TEXT,entity_id INTEGER,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience_type,student_id,read_at,created_at);
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          student_id INTEGER NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          conversation_id INTEGER NOT NULL,sender_type TEXT NOT NULL CHECK(sender_type IN ('coach','student')),
          sender_student_id INTEGER,body TEXT NOT NULL,read_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,
          FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY(sender_student_id) REFERENCES students(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at,deleted_at);
        CREATE TABLE IF NOT EXISTS workout_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          student_id INTEGER NOT NULL,program_id INTEGER NOT NULL,program_day_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','COMPLETED','SKIPPED')),
          started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,notes TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
          FOREIGN KEY(program_id) REFERENCES training_programs(id) ON DELETE RESTRICT,
          FOREIGN KEY(program_day_id) REFERENCES program_days(id) ON DELETE RESTRICT
        );
        CREATE INDEX IF NOT EXISTS idx_workout_sessions_student ON workout_sessions(student_id,status,started_at);
        CREATE INDEX IF NOT EXISTS idx_workout_sessions_program ON workout_sessions(program_id,program_day_id,status);
        CREATE TABLE IF NOT EXISTS workout_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,stable_id TEXT NOT NULL UNIQUE,
          workout_session_id INTEGER NOT NULL,prescribed_set_id INTEGER NOT NULL,
          actual_repetitions TEXT,actual_weight REAL,actual_duration_seconds INTEGER,
          status TEXT NOT NULL CHECK(status IN ('COMPLETED','SKIPPED')),
          notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT,
          FOREIGN KEY(workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY(prescribed_set_id) REFERENCES movement_sets(id) ON DELETE RESTRICT,
          UNIQUE(workout_session_id,prescribed_set_id)
        );
        CREATE INDEX IF NOT EXISTS idx_workout_results_session ON workout_results(workout_session_id,status);
      `);
      const changes={features:['ثبت اجرای تمرین جدا از ست تجویزی','اعلان‌های درون‌برنامه‌ای واقعی','پیام‌رسانی سبک مربی و شاگرد','audit log ساخت‌یافته'],improvements:['نمای عملکرد مربی فقط بر اساس داده واقعی تمرین'],fixes:[],security:['مالکیت session-bound برای تمرین، پیام و اعلان و حذف اسرار از audit metadata'],breaking_changes:[]};
      db.prepare('INSERT OR IGNORE INTO releases(version,title,release_date,summary,changes_json) VALUES(?,?,?,?,?)').run('0.8.0','Coach Student Engagement Foundation','2026-08-23','ثبت واقعی تمرین، اعلان، پیام و audit برای چرخه بلندمدت مربیگری',JSON.stringify(changes));
    }
  },
  {
    id: '019_core_journey_stabilization',
    description: 'Central theme, three-entry invitations, permanent ownership and case identity',
    up: (db) => {
      const columns = table => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
      db.exec(`
        CREATE TABLE IF NOT EXISTS assessment_ai_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT NOT NULL UNIQUE,
          assessment_id INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY','DISMISSED','APPLIED','FAILED')),
          provider TEXT,
          model TEXT,
          suggestion_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(suggestion_json)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_assessment_ai_suggestions_status ON assessment_ai_suggestions(status,updated_at);
        CREATE TABLE IF NOT EXISTS coaches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT
        );
        INSERT OR IGNORE INTO coaches(id,stable_id,display_name) VALUES(1,'local-coach','مربی محلی');
        CREATE TABLE IF NOT EXISTS coach_students (
          student_id INTEGER PRIMARY KEY,
          coach_id INTEGER NOT NULL,
          assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
          FOREIGN KEY(coach_id) REFERENCES coaches(id) ON DELETE RESTRICT
        );
        INSERT OR IGNORE INTO coach_students(student_id,coach_id) SELECT id,1 FROM students;
        CREATE INDEX IF NOT EXISTS idx_coach_students_coach ON coach_students(coach_id,student_id);
        CREATE TRIGGER IF NOT EXISTS trg_students_default_coach
        AFTER INSERT ON students WHEN NOT EXISTS(SELECT 1 FROM coach_students WHERE student_id=NEW.id)
        BEGIN INSERT INTO coach_students(student_id,coach_id) VALUES(NEW.id,1); END;
      `);
      const studentColumns=columns('students');
      if(!studentColumns.has('case_number')) db.exec('ALTER TABLE students ADD COLUMN case_number TEXT');
      db.exec(`
        UPDATE students SET case_number=printf('%06d',100000+id) WHERE case_number IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_students_case_number_unique ON students(case_number);
        CREATE TRIGGER IF NOT EXISTS trg_students_case_number
        AFTER INSERT ON students WHEN NEW.case_number IS NULL
        BEGIN UPDATE students SET case_number=printf('%06d',100000+NEW.id) WHERE id=NEW.id; END;
        CREATE TRIGGER IF NOT EXISTS trg_students_case_number_format_insert
        BEFORE INSERT ON students WHEN NEW.case_number IS NOT NULL AND NEW.case_number NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
        BEGIN SELECT RAISE(ABORT,'case_number must be six digits'); END;
        CREATE TRIGGER IF NOT EXISTS trg_students_case_number_format_update
        BEFORE UPDATE OF case_number ON students WHEN NEW.case_number IS NULL OR NEW.case_number NOT GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
        BEGIN SELECT RAISE(ABORT,'case_number must be six digits'); END;
      `);
      const inviteColumns=columns('student_invites');
      if(!inviteColumns.has('use_count')) db.exec('ALTER TABLE student_invites ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0');
      if(!inviteColumns.has('max_uses')) db.exec('ALTER TABLE student_invites ADD COLUMN max_uses INTEGER NOT NULL DEFAULT 3');
      if(!inviteColumns.has('opened_at')) db.exec('ALTER TABLE student_invites ADD COLUMN opened_at TEXT');
      db.exec(`
        UPDATE student_invites SET use_count=3,max_uses=3 WHERE status='used';
        UPDATE student_invites SET max_uses=3 WHERE max_uses IS NULL OR max_uses<>3;
      `);

      // Correct already-persisted historical release copy without retaining obsolete terminology in source.
      const obsolete=[
        String.fromCodePoint(0x62f,0x627,0x646,0x634,0x20,0x622,0x645,0x648,0x632),
        String.fromCodePoint(0x62f,0x627,0x646,0x634,0x200c,0x622,0x645,0x648,0x632),
        String.fromCodePoint(0x62f,0x627,0x646,0x634,0x20,0x627,0x645,0x648,0x632)
      ];
      for(const word of obsolete){
        db.prepare('UPDATE releases SET summary=replace(summary,?,?),changes_json=replace(changes_json,?,?),updated_at=CURRENT_TIMESTAMP').run(word,'شاگرد',word,'شاگرد');
      }
      const changes={
        features:['مالکیت دائمی هر شاگرد توسط یک مربی','شماره پرونده یکتای شش‌رقمی','دعوت امن با سه بار امکان ساخت نشست','ساختار غیرفعال پیشنهاد اولیه AI برای بررسی مربی'],
        improvements:['توکن‌های طراحی متمرکز برای همه صفحات','راهنمای تصویری بدون چهره برای تصاویر اختیاری','نمای نسخه و آخرین تغییرات در داشبورد مربی'],
        fixes:['یکسان‌سازی کامل واژگان کسب‌وکار','حذف اجبار انتخاب در بخش تصاویر اختیاری'],
        security:['توکن دعوت همچنان فقط به‌صورت hash ذخیره می‌شود و نشست‌ها قابل ابطال هستند'],
        breaking_changes:[]
      };
      db.prepare('INSERT OR IGNORE INTO releases(version,title,release_date,summary,changes_json) VALUES(?,?,?,?,?)')
        .run('0.9.0','Core Journey Stabilization','2026-08-23','تثبیت مسیر دعوت، پورتال خصوصی، ارزیابی و مالکیت مربی',JSON.stringify(changes));
    }
  },
  {
    id: '020_assessment_social_profiles',
    description: 'Optional Telegram and Instagram profile fields for assessment onboarding',
    up: (db) => {
      const columns=new Set(db.prepare('PRAGMA table_info(students)').all().map(column=>column.name));
      if(!columns.has('telegram_id')) db.exec("ALTER TABLE students ADD COLUMN telegram_id TEXT NOT NULL DEFAULT ''");
      if(!columns.has('instagram_id')) db.exec("ALTER TABLE students ADD COLUMN instagram_id TEXT NOT NULL DEFAULT ''");
    }
  },
  {
    id: '021_student_password_authentication',
    description: 'Unique normalized mobile identity, scrypt passwords and first-login password state',
    up: (db) => {
      const columns=new Set(db.prepare('PRAGMA table_info(students)').all().map(column=>column.name));
      if(!columns.has('mobile_normalized')) db.exec('ALTER TABLE students ADD COLUMN mobile_normalized TEXT');
      if(!columns.has('password_hash')) db.exec('ALTER TABLE students ADD COLUMN password_hash TEXT');
      if(!columns.has('password_state')) db.exec("ALTER TABLE students ADD COLUMN password_state TEXT NOT NULL DEFAULT 'RESET_REQUIRED'");
      if(!columns.has('password_changed_at')) db.exec('ALTER TABLE students ADD COLUMN password_changed_at TEXT');
      if(!columns.has('temporary_login_at')) db.exec('ALTER TABLE students ADD COLUMN temporary_login_at TEXT');
      if(!columns.has('auth_failed_attempts')) db.exec('ALTER TABLE students ADD COLUMN auth_failed_attempts INTEGER NOT NULL DEFAULT 0');
      if(!columns.has('auth_locked_until')) db.exec('ALTER TABLE students ADD COLUMN auth_locked_until TEXT');
      if(!columns.has('last_login_at')) db.exec('ALTER TABLE students ADD COLUMN last_login_at TEXT');

      const claimed=new Set();
      for(const student of db.prepare('SELECT id,mobile,password_hash,password_state FROM students WHERE deleted_at IS NULL ORDER BY id').all()){
        try{
          const normalized=studentAuth.normalizeMobile(student.mobile);
          if(claimed.has(normalized)){
            db.prepare("UPDATE students SET mobile_normalized=NULL,password_state='RESET_REQUIRED',password_hash=NULL WHERE id=?").run(student.id);
            continue;
          }
          claimed.add(normalized);
          const passwordHash=student.password_hash||studentAuth.hashPassword(studentAuth.temporaryPassword(normalized));
          const state=student.password_hash&&['TEMPORARY','PERSONAL'].includes(student.password_state)?student.password_state:'TEMPORARY';
          db.prepare('UPDATE students SET mobile_normalized=?,password_hash=?,password_state=? WHERE id=?').run(normalized,passwordHash,state,student.id);
        }catch(error){
          db.prepare("UPDATE students SET mobile_normalized=NULL,password_state='RESET_REQUIRED',password_hash=NULL WHERE id=?").run(student.id);
        }
      }
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_students_mobile_normalized_unique ON students(mobile_normalized) WHERE mobile_normalized IS NOT NULL AND mobile_normalized<>''");
    }
  },
  {
    id: '022_mobile_prefix_repair',
    description: 'Repair accidental duplicated 09 prefixes and canonicalize stored mobile values',
    up: (db) => {
      for(const student of db.prepare('SELECT id,mobile,mobile_normalized FROM students WHERE deleted_at IS NULL ORDER BY id').all()){
        try{
          const corrected=studentAuth.normalizeMobile(student.mobile);
          if(corrected===student.mobile&&corrected===student.mobile_normalized)continue;
          const duplicate=db.prepare('SELECT id FROM students WHERE mobile_normalized=? AND id<>? AND deleted_at IS NULL').get(corrected,student.id);
          if(!duplicate)db.prepare('UPDATE students SET mobile=?,mobile_normalized=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(corrected,corrected,student.id);
        }catch(error){}
      }
    }
  },
  {
    id: '023_exercise_target_muscles',
    description: 'Add target_muscles JSON column for multi-muscle highlighting',
    up: (db) => {
      const cols = new Set(db.prepare('PRAGMA table_info(exercises)').all().map(r => r.name));
      if (!cols.has('target_muscles')) {
        db.exec('ALTER TABLE exercises ADD COLUMN target_muscles TEXT');
      }
    }
  },
  {
    id: '024_ai_settings_and_router',
    description: 'Central 9Router AI engine configuration and settings singleton',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          api_key TEXT,
          base_url TEXT NOT NULL DEFAULT 'https://9router-production-6a92.up.railway.app/v1',
          default_combo TEXT,
          temperature REAL NOT NULL DEFAULT 0.7,
          top_p REAL NOT NULL DEFAULT 1.0,
          max_tokens INTEGER NOT NULL DEFAULT 2000,
          timeout_ms INTEGER NOT NULL DEFAULT 30000,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.prepare(`
        INSERT OR IGNORE INTO ai_settings (id, base_url, default_combo, temperature, top_p, max_tokens, timeout_ms)
        VALUES (1, 'https://9router-production-6a92.up.railway.app/v1', '', 0.7, 1.0, 2000, 30000)
      `).run();
    }
  },
  {
    id: '025_diet_programs_and_meals',
    description: 'Dedicated diet programs and meals structure with calorie balancing',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS diet_programs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT UNIQUE NOT NULL,
          student_id INTEGER,
          title TEXT NOT NULL,
          diet_restriction TEXT NOT NULL DEFAULT 'none',
          description TEXT,
          total_calories INTEGER NOT NULL DEFAULT 2000,
          is_template INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          program_data TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          version INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS diet_program_meals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stable_id TEXT UNIQUE NOT NULL,
          diet_program_id INTEGER NOT NULL,
          meal_name TEXT NOT NULL,
          calories INTEGER NOT NULL DEFAULT 0,
          start_time TEXT,
          end_time TEXT,
          notes TEXT,
          sort_order INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT,
          FOREIGN KEY(diet_program_id) REFERENCES diet_programs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_diet_programs_student ON diet_programs(student_id);
        CREATE INDEX IF NOT EXISTS idx_diet_programs_template ON diet_programs(is_template);
        CREATE INDEX IF NOT EXISTS idx_diet_programs_deleted ON diet_programs(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_diet_meals_program ON diet_program_meals(diet_program_id);
      `);
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
