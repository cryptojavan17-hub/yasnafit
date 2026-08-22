# Yasnafit - Authoritative Database Schema

## Schema Version
Current: `010_repair_legacy_student_timestamps` stored in `settings` table and `schema_migrations`

## Migrations
Run via `src/migrations.js` `runMigrations(db)` - idempotent, ordered, transactional.

- `001_initial` - Core tables
- `002_exercises_full` - Full exercise model + indexes
- `003_program_builder` - Training program builder tables + unique hash indexes
- `004_program_integrity` - Program source of truth, cleanup old categories, stable_id, version, deleted_at
- `005_sync_metadata` - Sync readiness for all tables
- `006_student_portal_lifecycle` - Invitations, assessments, private photos, monthly program links
- `007_monthly_workflow_integrity` - Historical and lifecycle integrity hardening
- `008_application_releases` - Structured application release history
- `009_my_students_crm_release` - Release record for the complete My Students CRM
- `010_repair_legacy_student_timestamps` - Repair missing student timestamps in legacy databases

## Full Schema

```sql
-- Tracking
CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Students (sync-ready, soft delete)
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  mobile TEXT,
  goal TEXT,
  status TEXT NOT NULL DEFAULT 'فعال',
  weight REAL,
  height REAL,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX idx_students_deleted ON students(deleted_at);
CREATE INDEX idx_students_stable ON students(stable_id);

-- Legacy movements (isolated, do not use for new code)
CREATE TABLE movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  muscle_group TEXT,
  equipment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Exercise Categories (13 clean, sync-ready)
CREATE TABLE exercise_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  original_id INTEGER,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE exercise_subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  original_id INTEGER,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(category_id) REFERENCES exercise_categories(id) ON DELETE CASCADE
);

-- Exercises (2707, sync-ready, soft delete)
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER, -- Source dataset ID (e.g., 4, 4446)
  name_fa TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  location TEXT NOT NULL DEFAULT 'both' CHECK(location IN ('gym','home','both')),
  category_id TEXT NOT NULL,
  subcategory_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  image_path TEXT, -- e.g., /files/exercise/images/4.png
  video_path TEXT,
  priority INTEGER DEFAULT 5,
  equipment TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'beginner',
  description TEXT DEFAULT '',
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(category_id) REFERENCES exercise_categories(id),
  FOREIGN KEY(subcategory_id) REFERENCES exercise_subcategories(id)
);
CREATE INDEX idx_exercises_category ON exercises(category_id);
CREATE INDEX idx_exercises_status ON exercises(status);
CREATE INDEX idx_exercises_location ON exercises(location);
CREATE INDEX idx_exercises_original ON exercises(original_id);
CREATE INDEX idx_exercises_name ON exercises(name_fa);
CREATE INDEX idx_exercises_deleted ON exercises(deleted_at);
CREATE INDEX idx_exercises_stable ON exercises(stable_id);

-- Legacy programs (isolated)
CREATE TABLE programs (
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

-- Training Programs (NEW - Primary Source of Truth is normalized tables)
CREATE TABLE training_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  title TEXT NOT NULL DEFAULT 'برنامه تمرینی جدید',
  coach_note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'پیش‌نویس',
  start_date TEXT,
  end_date TEXT,
  program_data TEXT DEFAULT '{}', -- Synchronized JSON representation from normalized tables
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
);
CREATE INDEX idx_training_programs_student ON training_programs(student_id);
CREATE INDEX idx_training_programs_deleted ON training_programs(deleted_at);
CREATE UNIQUE INDEX idx_training_programs_stable ON training_programs(stable_id);

CREATE TABLE program_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL, -- 1..30
  day_hash TEXT NOT NULL, -- Stable hash for sync/state
  focus TEXT DEFAULT '', -- e.g., بالاتنه, پا
  coach_note TEXT DEFAULT '',
  is_rest_day INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  stable_id TEXT, -- UUID for sync
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(program_id) REFERENCES training_programs(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_program_days_hash ON program_days(day_hash);
CREATE INDEX idx_program_days_program ON program_days(program_id);

CREATE TABLE exercise_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  exercise_system_id INTEGER DEFAULT 1, -- 1 normal, 2 superset, 3 triset, 4 giant, 5 drop
  system_hash TEXT NOT NULL,
  system_type TEXT DEFAULT 'normal' CHECK(system_type IN ('normal','superset','triset','giant','drop')),
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(day_id) REFERENCES program_days(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_exercise_systems_hash ON exercise_systems(system_hash);
CREATE INDEX idx_exercise_systems_day ON exercise_systems(day_id);

CREATE TABLE program_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL,
  exercise_id INTEGER, -- Internal FK to exercises.id (primary truth)
  original_exercise_id INTEGER, -- Source ID for compatibility/debugging
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
CREATE UNIQUE INDEX idx_program_movements_hash ON program_movements(movement_hash);
CREATE INDEX idx_program_movements_system ON program_movements(system_id);

CREATE TABLE movement_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id INTEGER NOT NULL,
  set_hash TEXT NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'REPEAT' CHECK(set_type IN ('REPEAT','TIME','FAILURE','AMRAP','DROPSET','SUPERSET','GIANT_SET')),
  count_value TEXT, -- Can be number or string like "12" or "30 ثانیه"
  weight REAL,
  rest_seconds INTEGER DEFAULT 60,
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(movement_id) REFERENCES program_movements(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_movement_sets_hash ON movement_sets(set_hash);
CREATE INDEX idx_movement_sets_movement ON movement_sets(movement_id);

-- Other
CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  weight REAL,
  waist REAL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  service_type TEXT,
  status TEXT NOT NULL DEFAULT 'در انتظار تکمیل برنامه',
  amount REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Data Integrity

### Exercises
- Total: 2707 (from data-source/exercises_data.json)
- With image_path: 1888 (active only)
- Without image_path: 819 (27 active without + 792 archived)
- Active: 1915, Archived: 792
- Categories: 13 clean (chest 477, shoulders 720, legs 511, etc.)
- Original_id preserved for all
- Stable_id, version, deleted_at for sync

### Categories
- 13 clean, no upper/lower/core/other
- other had 1 exercise (وای فلای) moved to shoulders-fly
- Subcategories: 23 clean

### Training Programs
- program_data JSON is synchronized from normalized tables, not independent
- On save: validate -> BEGIN -> delete old days (cascade) -> insert days/systems/movements/sets -> build JSON from DB -> update program_data + version+1 -> COMMIT
- On load full: always build from normalized tables
- Hashes stable if provided, generated if missing
- exercise_id is internal FK, original_exercise_id kept for compatibility

## ID Strategy

- `id` = local INTEGER PK AUTOINCREMENT
- `original_id` / `original_exercise_id` = source dataset ID (e.g., 4, 4446) - only for import compatibility
- `stable_id` = UUID (crypto.randomUUID) - sync identifier, stable across devices
- `*_hash` = random + timestamp, stable across save/load if provided (e.g., dayHash, systemHash, movementHash, setHash) - for UI state and sync
- `version` = INTEGER incremented on update - for conflict detection
- `created_at`, `updated_at`, `deleted_at` = timestamps, deleted_at for soft delete

**Rule:** All internal FKs use `id`, never original_id. Original_id only for mapping.

## Sync Readiness

All sync-relevant tables have stable_id, version, created_at, updated_at, deleted_at.

- **Sync-relevant:** students, exercises, categories, subcategories, training_programs, program_days, exercise_systems, program_movements, movement_sets
- **Local-only:** activity_log, measurements, orders, movements (legacy), programs (legacy)
- **Server-owned (future):** exercises dataset (2707) - local is replica
- **Coach-owned:** training_programs

Future sync endpoints: /api/sync/push, /api/sync/pull using stable_id and version.

## Soft Delete

- Soft: students, training_programs, exercises, categories, subcategories (deleted_at)
- Hard (transactional): program_days, exercise_systems, program_movements, movement_sets when recreated during program edit (inside transaction, explicitly handled)

## Indexes

For performance and sync:
- exercises: category, status, location, original_id, name, deleted_at, stable_id
- students: deleted_at, stable_id
- training_programs: student_id, deleted_at, stable_id
- program_days: day_hash unique, program_id
- exercise_systems: system_hash unique, day_id
- program_movements: movement_hash unique, system_id
- movement_sets: set_hash unique, movement_id

## Legacy Handling

- `movements` and `programs` are legacy, isolated, no new dependencies
- APIs /api/movements and /api/programs still work but are legacy
- New code uses training_programs and exercises

## Validation

All POST/PUT validated via src/validation.js:
- Required fields, types, dates, IDs, enums, arrays, limits
- ESetType: REPEAT,TIME,FAILURE,AMRAP,DROPSET,SUPERSET,GIANT_SET
- System types: normal,superset,triset,giant,drop
- Max limits: 30 days, 20 systems/day, 30 movements/system, 20 sets/movement
- Duplicate day_numbers and hashes detection (fixed double counting)
- Body size limit 1MB

## Backup

- POST /api/backup does WAL checkpoint, timestamped file, rotation keeps 10 latest
- Before destructive migrations, backup extension point exists

## Security

- isSafePath(base, target) prevents path traversal
- sanitizeFileName removes special chars, limits 100
- Allowed exts only: html,js,css,json,png,jpg,jpeg,gif,webp,svg,ico,mp4
- Parameterized SQL everywhere
- Body size limit 1MB
- No stack traces to client
```

## Testing the Schema

```bash
rm -rf data/yasnafit.db* && node -e "require('./src/database.js')"
# Should show migrations 001..010 applied and Imported 2707 exercises

sqlite3 data/yasnafit.db "SELECT id, name, COUNT(*) OVER() as total FROM exercise_categories ORDER BY sort_order;"
# Should show 13 categories

sqlite3 data/yasnafit.db "SELECT category_id, COUNT(*) FROM exercises GROUP BY category_id;"
# Should show 13 categories with counts summing to 2707, shoulders 720

sqlite3 data/yasnafit.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# Should include training_programs, program_days, exercise_systems, program_movements, movement_sets, schema_migrations
```

---

# Schema 007: Student Portal and Monthly Coaching (Authoritative Addendum)

The following tables/columns extend the normalized program schema. Migration files remain
the executable authority.

```sql
CREATE TABLE student_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_id TEXT UNIQUE,
  student_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT,
  status TEXT NOT NULL CHECK(status IN ('active','used','revoked','expired')),
  expires_at TEXT,
  used_at TEXT,
  revoked_at TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX idx_student_invites_student ON student_invites(student_id);
CREATE INDEX idx_student_invites_hash ON student_invites(token_hash);

CREATE TABLE body_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_id TEXT UNIQUE,
  student_id INTEGER NOT NULL,
  assessment_number INTEGER NOT NULL,
  status TEXT NOT NULL,
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
CREATE UNIQUE INDEX idx_body_assessments_student_number
  ON body_assessments(student_id, assessment_number);
CREATE INDEX idx_body_assessments_status ON body_assessments(status);

CREATE TABLE assessment_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stable_id TEXT,
  assessment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  photo_type TEXT NOT NULL CHECK(photo_type IN
    ('front','back','side','front_flex','back_flex','other')),
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY(assessment_id) REFERENCES body_assessments(id) ON DELETE CASCADE,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_assessment_photos_current_type
  ON assessment_photos(assessment_id, photo_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_assessment_photos_student ON assessment_photos(student_id);
```

`students` additionally has profile/training/medical fields, `profile_status`, and
`last_assessment_id`.

`training_programs` additionally has:

```sql
assessment_id INTEGER;       -- source body assessment
program_number INTEGER;      -- monotonic per student
status TEXT;                 -- DRAFT | ACTIVE | COMPLETED | ARCHIVED
assigned_at TEXT;
completed_at TEXT;
archived_at TEXT;
```

Indexes:

```sql
CREATE INDEX idx_training_programs_assessment ON training_programs(assessment_id);
CREATE INDEX idx_training_programs_student_status
  ON training_programs(student_id, status, deleted_at);
CREATE INDEX idx_training_programs_dates ON training_programs(start_date, end_date);
```

## Historical Invariants

1. `(student_id, assessment_number)` is unique.
2. Submission freezes an assessment and its photos.
3. One current photo row exists per `(assessment_id, photo_type)`; replacements are
   soft-deletes while the assessment is editable.
4. Program activation, not draft save, creates the assessment-program assignment.
5. ACTIVE/COMPLETED/ARCHIVED programs are immutable; monthly renewal inserts a new row.
6. Activating the next program completes (but never deletes or rewrites) the prior plan.
7. Private filesystem paths are database-internal and are never serialized to clients.

## Sync Metadata

Stable IDs are cross-device identifiers. Integer IDs remain local foreign keys. Android
sync should use stable IDs and versions, carry tombstones via `deleted_at`, and treat
submitted assessments and assigned programs as immutable historical aggregates.

---

# Schema 008: Application Release History

Application release versions are not database schema versions. `package.json.version` is
the current application-version source; this table is the immutable structured history.

```sql
CREATE TABLE releases (
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
CREATE INDEX idx_releases_date ON releases(release_date DESC, id DESC);
```

`changes_json` has five arrays: `features`, `improvements`, `fixes`, `security`, and
`breaking_changes`. Migration `008_application_releases` seeds the actual release history
from `0.1.0` through `0.3.0` and uses `INSERT OR IGNORE` for idempotency.
Migration `009_my_students_crm_release` adds the intentional `0.4.0` feature release; it
does not introduce a competing student table or alter student business data.

## Schema 010: Legacy Student Timestamp Repair

Some pre-migration databases had `001`/`002` recorded while `students.updated_at` was
missing: SQLite rejects `ALTER TABLE ... ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP` on a
populated table and the old compatibility helper swallowed that error. Migration
`010_repair_legacy_student_timestamps` adds missing timestamp columns without a
non-constant default, backfills every existing student from `created_at`/current time, and
preserves all rows. Application and seed inserts now explicitly write both timestamps so
repaired legacy tables remain complete.
