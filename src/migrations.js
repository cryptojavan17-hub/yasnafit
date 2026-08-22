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
