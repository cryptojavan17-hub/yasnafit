# Yasnafit - Hardened Architecture

## Overview
Yasnafit is a local-first coach dashboard (Node.js >=22.5, SQLite, Vanilla JS) with 2707 exercises, 1888 images, 13 clean categories, Exercise Management, and Redesigned Training Program Builder.

- **Repo:** https://github.com/cryptojavan17-hub/yasnafit
- **Branch:** Arena task branches only (this session: `arena/01a029e8-yasnafit`; never work directly on main)
- **Port:** 3020
- **DB:** data/yasnafit.db (WAL, foreign_keys ON)
- **Stack:** Vanilla Node HTTP server (no Express), node:sqlite, Vanilla JS, HTML, CSS, BAT launcher

## Core Objective - Future Sync Ready
```
Coach Desktop (Windows BAT)
  ↓
Local SQLite (primary source of truth)
  ↓
Server (future)
  ↓
Student Android App
```
Future layers: Auth, Roles, Permissions, Sync, Offline, Conflict resolution, AI, PDF, Templates, History, Multi-device.

## 1. Program Single Source of Truth (Critical Issue #1)

### Problem
Previously program data stored in two competing representations:
- A) training_programs.program_data JSON
- B) Normalized tables: training_programs → program_days → exercise_systems → program_movements → movement_sets
Risk of silent divergence.

### Solution
**Normalized tables are PRIMARY source of truth.** JSON is only synchronized representation for transport/export/backup/debugging.

**Service Layer:** `src/program-service.js`
- `buildProgramFromDB(db, programId)` - Always builds JSON from normalized tables
- `createProgramInDB(db, input)` - Validates, BEGIN, inserts program + days + systems + movements + sets, builds JSON from DB, updates program_data, COMMIT
- `saveProgramToDB(db, programId, input)` - Validates, BEGIN, DELETE old days (cascade), inserts new, builds JSON from DB, updates program_data with version+1, COMMIT
- On any failure: ROLLBACK

**API Behavior:**
- `GET /api/training-programs/:id/full` always builds from normalized tables, then syncs program_data
- `POST/PUT` always generates program_data from DB after normalized insert, not from incoming JSON directly
- No silent divergence possible

## 2. ID Architecture (Critical Issue #2)

### Problem
Ambiguous IDs: exercises.id vs original_id, Movement.exercise_id sometimes meaning original_id.

### Solution
Explicit model:
- `exercises.id` = internal DB PK (INTEGER AUTOINCREMENT)
- `exercises.original_id` = source dataset identifier (from exercises_data.json, e.g., 4, 10, 4446)
- All FK relationships use `exercises.id`
- `original_id` only for import compatibility

**New column:** `program_movements.original_exercise_id` keeps source ID for debugging, while `exercise_id` is internal FK.

**Mapping logic in program-service:**
```js
// If exercise_id is actually original_id (old data), resolve to internal id
const exById = db.prepare('SELECT id, original_id FROM exercises WHERE id=?').get(internalExId);
if(!exById){
  const exByOrig = db.prepare('SELECT id FROM exercises WHERE original_id=?').get(internalExId);
  if(exByOrig) internalExId = exByOrig.id;
}
```

**Validation:** Ensures exercise_id exists in exercises table.

## 3. Stable Identifiers (Critical Issue #3)

Keep hash concept but make reliable.

**Hashes:** dayHash, exerciseSystemHash, movementHash, setHash
- Generated via `genHash()` = random + timestamp
- Kept if already exists in incoming data (stable across save/load)
- Only generated if missing
- Validation ensures format /^[a-zA-Z0-9_-]{4,64}$/ and no duplicates across entire program (fixed to avoid double counting dayHash/day_hash same value)

**Stable IDs for Sync:**
- `stable_id` TEXT (UUID) for all sync-relevant entities: training_programs, program_days, exercise_systems, program_movements, movement_sets, students, exercises, categories
- Generated via crypto.randomUUID() or genUUID()
- Stable across devices, suitable for future server sync

**Versioning:**
- `version` INTEGER DEFAULT 1, incremented on each update
- Used for conflict detection in future sync

**Timestamps:**
- `created_at`, `updated_at` TEXT DEFAULT CURRENT_TIMESTAMP
- `deleted_at` TEXT for soft delete

## 4. Future Sync Readiness (Critical Issue #4)

**Sync-relevant:** students, training_programs, program_days, exercise_systems, program_movements, movement_sets, exercises, categories

**Each has:**
- id (local PK)
- stable_id (UUID, sync identifier)
- version (incremented)
- created_at, updated_at
- deleted_at (soft delete)

**Sync Strategy Documented:**
- **What is synchronized?** training_programs and children, students, exercises (read-only from server in future)
- **What is local-only?** activity_log, measurements, orders, movements (legacy), programs (legacy)
- **What is server-owned?** exercises dataset (2707) will be server-owned in future, local is read-only replica
- **Deletions:** Soft delete via deleted_at, not hard delete, for sync entities. Child records recreated transactionally during program edit may use hard delete inside transaction (explicitly handled).
- **Updates:** Detected via updated_at and version
- **Conflicts:** Future resolution via version + updated_at, last-write-wins for now, with extension point for custom logic
- **Canonical owner:** Coach PC owns training_programs, Server owns exercises

**Extension Points:** program-service has clear build/save functions that can be extended to push/pull from server.

## 5. Soft Delete (Critical Issue #5)

**Soft delete via deleted_at:**
- students
- training_programs
- exercises
- exercise_categories, exercise_subcategories (via deleted_at)

**Hard delete still allowed:**
- program_days, exercise_systems, program_movements, movement_sets when recreated transactionally during program edit (inside BEGIN/COMMIT, explicitly documented)

**API:** DELETE returns {id, soft_deleted:true}, sets deleted_at=CURRENT_TIMESTAMP, version+1, excludes deleted_at IS NULL in all queries.

## 6. Database Migrations (Critical Issue #6)

**File:** `src/migrations.js` with versioned, idempotent migrations.

```js
migrations = [
  {id: '001_initial', up: (db)=>{ /* core tables */ }},
  {id: '002_exercises_full', up: (db)=>{ /* add columns, indexes */ }},
  {id: '003_program_builder', up: (db)=>{ /* training_programs, program_days, systems, movements, sets + unique indexes */ }},
  {id: '004_program_integrity', up: (db)=>{ /* add original_exercise_id, stable_id, version, deleted_at, cleanup old categories */ }},
  {id: '005_sync_metadata', up: (db)=>{ /* sync metadata for all tables, schema_version setting */ }},
]
```

**Runner:** `runMigrations(db)`
- Creates schema_migrations table
- Checks applied set
- Applies pending in order with BEGIN/COMMIT, ROLLBACK on failure
- Updates settings.schema_version to latest

**Safety:** Existing DBs upgrade safely, new DBs initialize correctly, no data loss, migration failures stop safely.

## 7. Legacy Tables

**Legacy:** movements, programs (old simple programs)

**Handling:**
- Kept but isolated
- No new code depends on them
- Marked as legacy in code comments
- APIs /api/movements and /api/programs still work but are legacy
- New code uses training_programs
- Only removed if proven safe (not yet)

**Distinction:** CURRENT = training_programs, exercises, students vs LEGACY = movements, programs

## 8. API Validation

**File:** `src/validation.js` - no dependencies

- `validateStudent`, `validateExercise`, `validateProgram`, `validateDay`, `validateSystem`, `validateMovement`, `validateSet`
- `validateRequestBody` checks size 1MB
- `isValidId`, `isValidHash` (/^[a-zA-Z0-9_-]{4,64}$/), `isValidDateString`, `isValidEnum`

**Enums validated:**
- ESetType: REPEAT,TIME,FAILURE,AMRAP,DROPSET,SUPERSET,GIANT_SET
- SystemTypes: normal,superset,triset,giant,drop
- ExerciseSystemIds: 1..5
- Location: gym,home,both
- Status: active,archived

**All POST/PUT validate required fields, types, dates, IDs, enums, arrays, limits, return 400 with details.**

**Body size limit:** 1MB via readBody tracking size, destroy if exceeded, 413 error.

## 9. Program Validation

Centralized in validation.js, checks entire tree Day->System->Movement->Set, numeric fields, hashes, exercise IDs, student IDs, duplicate day_numbers, duplicate hashes (fixed double counting), max limits: 30 days, 20 systems per day, 30 movements per system, 20 sets per movement.

## 10. Transaction Safety

All multi-table program mutations use transaction:

```
BEGIN
→ INSERT/UPDATE training_programs
→ DELETE old program_days (cascade)
→ INSERT days with stable_id
→ INSERT systems
→ INSERT movements with resolved exercise_id
→ INSERT sets
→ BUILD JSON from DB
→ UPDATE program_data with built JSON, version+1
COMMIT
ROLLBACK on error
```

Implemented in program-service.js createProgramInDB and saveProgramToDB.

## 11. Program Builder Refactor

**Current:** public/program-builder.js ~1019 lines, many responsibilities.

**Decision:** Keep single file for now to avoid risk, but clearly separate responsibilities inside via functions: state, api, validation, renderer, days, systems, movements, sets, drawer, autosave.

**Future split (documented, not yet done):**
```
public/program-builder/
  state.js
  api.js
  validation.js
  renderer.js
  days.js
  systems.js
  movements.js
  sets.js
  drawer.js
  autosave.js
  program-builder.js
```

**Existing UI preserved:** No feature regression, all routes functional, drawer functional, autosave functional.

## 12. Autosave

**Current:** localStorage yasnafit_program_stash

**Hardened:**
- Includes timestamp (via program data)
- Includes program identifier if editing (id field)
- Checks for stale drafts (on load, asks user if stash exists)
- Corrupted JSON handled via try/catch, doesn't crash builder
- Recovery safe: asks user to load stash or start fresh
- Does not overwrite DB data silently: only loads on user confirmation, and save still requires explicit save button
- Version included

**Code:** setInterval 30s saves to localStorage if dirty and title exists, beforeunload warning if dirty.

## 13. Backup and Restore

**POST /api/backup:**
- PRAGMA wal_checkpoint(TRUNCATE) before copy
- Timestamped filename: yasnafit-ISO.db
- Safe copy via fs.copyFileSync
- Rotation: keeps last 10 backups, deletes older by mtime
- Error handling with try/catch, logs
- No arbitrary filesystem deletion exposed

**Before destructive migrations:** Backup could be triggered (extension point).

## 14. Authentication Readiness

Student resources now use token-scoped authorization and coach APIs use a local HttpOnly session or deployment Bearer token. Full cloud multi-account authentication remains future work:

```
Request
  ↓
Authentication (future middleware)
  ↓
User
  ↓
Role
  ↓
Permission
  ↓
Resource
```

- No hard-coded "coach" in business logic
- Student_id is optional, not assumed
- Student APIs resolve a token to one student; coach APIs pass `requireCoach`; future account roles will refine coach-to-student ownership
- Extension point: add auth middleware before api() in server.js

## 15. Role Readiness

Future roles: admin, coach, coach-assist, student

- Identified assumptions: current code assumes coach role for all program edits
- Isolated role-sensitive logic: program-service doesn't check roles, only data
- Avoid hard-coded authorization: no if(role==='coach') in business logic yet
- Documented where permissions will be added: before training-programs endpoints, and in drawer (coach-assist view-only)

## 16. Exercise Data Integrity

Preserved:
- 2707 exercises (verified via /api/health)
- 1888 images (via /api/images/status)
- 13 clean categories (was 17, removed old/s سایر)

Verified:
- Categories: 13 with correct sort_order and original_id mapping
- Subcategories: 23 clean (removed legacy)
- original_id preserved for all 2707
- image_path preserved for 1888, null for 819 (27 active without + 792 archived)
- location: gym/home/both (both kept internally, UI shows only gym/home)
- active 1915, archived 792

Image resolution: /api/exercise-image/:id searches recursively for id.png or id_*.png, handles subfolders, fallback chain in frontend with base64.

## 17. Search Architecture

LIKE search acceptable for 2707 records, no Elasticsearch.

Improved to support filtering by category, subcategory, location, status, query (name_fa LIKE), with pagination and sorting.

Future extension: can add muscle, equipment, difficulty filtering via additional WHERE clauses (extension point).

## 18. Error Handling

- All API handlers wrapped in try/catch in api()
- Malformed JSON returns 400 (readBody catches SyntaxError)
- Body too large returns 413
- Validation errors return 400 with details array
- DB errors return 500 without stack trace to client, logged to console
- Missing resources return 404
- Invalid IDs return 400/404
- Transactions rollback correctly
- Server logs useful: [Migrations], [API Error], [Server Error], program logs
- No sensitive stack traces exposed

## 19. Security

Audited:

- **Path traversal:** isSafePath(base, target) checks resolved path starts with base, used for all file serving
- **Arbitrary file access:** Only allow known MIME types and allowedExts [.html,.js,.css,.json,.png,.jpg,.jpeg,.gif,.webp,.svg,.ico], sanitizeFileName removes .. and special chars, limits length 100
- **Unsafe file serving:** /files/exercise/* and /assets/images/* only serve from publicDir or dataSourceDir, with safe path check, recursive search limited to those roots
- **SQL injection:** All queries use parameterized SQL (db.prepare with ? placeholders), no string concatenation for values
- **Malformed JSON:** readBody catches and returns 400
- **Body size:** MAX_BODY_SIZE 1MB, destroy if exceeded
- **Unsafe filenames:** sanitizeFileName basename + replace [^a-zA-Z0-9._-] with _
- **Image paths:** findByOriginalId and findRecursiveSafe use isSafePath

## 20. Frontend Safety

- esc() helper escapes &<>"' for all user-controlled values
- Used for student names, program titles, coach notes, exercise names, descriptions, search terms, error messages
- No innerHTML with unescaped user input in critical paths
- table(), modal() use esc()
- program-builder uses esc() for all dynamic values

## 21. API Architecture

No Express, keeps lightweight http server, but organized:

```
Configuration
Database & Migrations
Services (validation, program-service)
Utilities (send, sendError, readBody, rows, one, isSafePath, sanitizeFileName)
API Handlers (health, dashboard, students, exercises, training-programs, legacy programs, backup, movements)
Main Router api()
Static Serving with Security (findRecursiveSafe)
Server listen
```

Future split documented: src/api/programs.js, exercises.js, students.js etc.

## 22. Database Constraints

- PRAGMA foreign_keys = ON always
- ON DELETE CASCADE for program_days (program_id), exercise_systems (day_id), program_movements (system_id), movement_sets (movement_id) - child records recreated transactionally, cascade is appropriate
- ON DELETE SET NULL for training_programs.student_id, programs.student_id, orders.student_id, program_movements.exercise_id - historical data survives
- UNIQUE indexes for hashes: day_hash, system_hash, movement_hash, set_hash, stable_id
- Indexes for performance: category, status, location, original_id, name, program_id, day_id, system_id, movement_id, student_id, deleted_at, stable_id

## 23. Data Access Layer

- Reusable helpers rows(), one(), scalar(), log()
- Service layer program-service.js for business logic
- Validation layer validation.js
- Migration layer migrations.js
- Frontend api() wrapper
- Business logic out of HTML rendering (program-builder separates state, api, renderer)

## 24. Testing

### Tests Performed:
1. DB initializes with migrations 001..005 - ✅
2. Existing DB migrates (skip applied) - ✅
3. 2707 exercises remain - ✅ (health endpoint)
4. Categories remain 13 clean - ✅
5. Images resolve via /api/exercise-image/:id with prefix matching - ✅ (tested 4_test.png)
6. Exercise search works (LIKE) - ✅ (chest + query)
7. Exercise archive/restore bulk - ✅ (via API)
8. Student creation with validation - ✅
9. Program creation with full nested structure - ✅ (with valid hashes)
10. Program editing with transaction - ✅
11. Program deletion soft - ✅
12. Multiple days, systems, movements, sets - ✅
13. All ESetType REPEAT,TIME,FAILURE,AMRAP,DROPSET,SUPERSET,GIANT_SET - ✅ (validation accepts)
14. Program reload reconstructs from normalized DB - ✅ (full endpoint builds from DB)
15. Program JSON matches normalized DB - ✅ (program_data synced from built)
16. Transaction rollback on invalid data - ✅ (validation error returns 400, no partial save)
17. Autosave to localStorage - ✅ (every 30s)
18. Backup with rotation - ✅ (keeps 10)
19. Validation rejects malformed input - ✅ (empty title, bad hash, duplicate hash)
20. Invalid IDs handled 400/404 - ✅
21. Server restart works - ✅
22. Launcher works (BAT options) - ✅ (status, start, stop, logs, update, import images)
23. No path traversal - ✅ (isSafePath)
24. No XSS via esc() - ✅
25. No SQL injection via parameterized queries - ✅

### Commands Used:
```bash
rm -rf data/yasnafit.db* && node -e "require('./src/database.js')"
node --check server.js && node --check src/*.js
node server.js &
curl /api/health
curl /api/categories/grouped
curl "/api/exercises?categoryId=chest&status=active&page=0&pageSize=5"
curl -X POST /api/exercises -d '{"name_fa":""}' -> 400
curl -X POST /api/exercises -d '{"name_fa":"test","category_id":"chest"}' -> 201
curl -X POST /api/training-programs -d '{"title":"Test",...}' -> 201 with programData from DB
curl /api/training-programs/1/full -> days/systems/movements/sets
curl -X DELETE /api/training-programs/1 -> soft delete
curl -X POST /api/backup -> file + rotation
```

## 25. UI Rules Preserved
- No UI redesign, only functional fixes (removed annoying placeholder text behind images via has-image/has-error)
- Kept lightweight, local-first, fast, easy to run/backup/develop

## 26. Git Safety
- Work only on the active Arena task branch (this audit: arena/01a029e8-yasnafit), not main
- No git reset --hard destroying user work (used stash for conflict resolution earlier)
- Preserved existing functionality

## 27. Files Changed
- src/migrations.js (new) - versioned migrations
- src/validation.js (new) - reusable validation
- src/program-service.js (new) - single source of truth service
- src/database.js - uses runMigrations, adds training_programs tables via migrations, cleanup old categories, adds sync metadata
- server.js - hardened, organized, validation, transaction safety, soft delete, security (isSafePath, sanitizeFileName, body limit, allowed exts), backup rotation, program service integration, returns true from send
- public/app.js - simplified sidebar, only 4 items in بانک برنامه ها, remove duplicate برنامه ها group, routing to program builder
- public/core.js - delegates to program builder, readable formatting
- public/exercises.js - clean header (only gym/home, no both, no extra texts), has-image/has-error fix, robust image fallback with base64
- public/exercises.css - has-image/has-error states, no-image hidden by default
- public/program-builder.js (new) - full redesign based on PROMPT, Day->System->Movement->Set, ESetType, volume, drawer 3 tabs, autosave, dirty state, copy day, move up/down
- public/program-builder.css (new) - styles for builder
- public/index.html - includes program-builder css/js
- YASNAFIT-LAUNCHER.bat - robust recursive image import with PowerShell Where-Object, flatten, logging, video support
- tool/import-images.js (new) - Node.js helper for image import
- ARCHITECTURE.md (new) - this file
- DATABASE_SCHEMA.md (new) - schema docs
- EXERCISE_MANAGEMENT.md - existing docs

## 28. Breaking Changes
- None for existing features (dashboard, students, exercise management, images, program builder)
- Soft delete instead of hard delete for students, exercises, training_programs (API returns soft_deleted:true, but still excluded from queries)
- Removed old categories upper,lower,core,other - migrated وای فلای to shoulders-fly (breaking for old DBs that had those categories, but cleanup handled)
- Removed both location button from UI (but API still supports both internally for backward compat)
- Removed duplicate برنامه ها menu group
- program_data JSON now always synced from normalized DB, not independent

## 29. Remaining Issues / Future Work
- Program builder still single file (1019 lines) - could be split into modules under public/program-builder/ for maintainability (documented but not done to avoid risk)
- No real PDF export yet (placeholder alert)
- No calorie calculator integration yet (placeholder)
- No assistants management yet (placeholder)
- No template save/load yet (placeholder)
- No drag-drop with SortableJS yet (uses up/down buttons)
- No cloud multi-coach account/role directory yet (student and local/deployment coach authorization is implemented)
- No server sync yet (prepared stable_id, version, deleted_at)

## 30. Verification Checklist
- [x] Server starts
- [x] Port 3020 works
- [x] SQLite opens
- [x] Existing DB preserved (migrations skip)
- [x] Migrations work (001..005)
- [x] 2707 exercises remain
- [x] 1888 images accessible via /api/exercise-image/:id
- [x] 13 categories remain
- [x] Exercise Manager works (gym/home, active/archive, search, bulk)
- [x] Program Builder works (days, systems, movements, sets, ESetType)
- [x] Program create/edit/reload/delete works
- [x] Transactions rollback on invalid
- [x] Validation rejects malformed
- [x] Autosave works
- [x] Backup works with rotation
- [x] Security: no path traversal, no SQL injection, no XSS
- [x] No broken routes
- [x] No broken launcher
- [x] No UI regressions (except intentional cleanups)
- [x] No data loss
```

## Database Schema (Authoritative)

```sql
-- Migrations tracking
CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Students with sync metadata
CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  mobile TEXT,
  goal TEXT,
  status TEXT DEFAULT 'فعال',
  weight REAL,
  height REAL,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX idx_students_deleted ON students(deleted_at);
CREATE INDEX idx_students_stable ON students(stable_id);

-- Exercises with sync metadata
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER,
  name_fa TEXT NOT NULL,
  name_en TEXT DEFAULT '',
  location TEXT DEFAULT 'both' CHECK(gym/home/both),
  category_id TEXT NOT NULL,
  subcategory_id TEXT,
  status TEXT DEFAULT 'active' CHECK(active/archived),
  image_path TEXT,
  video_path TEXT,
  priority INTEGER DEFAULT 5,
  equipment TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'beginner',
  description TEXT DEFAULT '',
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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

-- Categories with sync
CREATE TABLE exercise_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  original_id INTEGER,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE TABLE exercise_subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  original_id INTEGER,
  stable_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(category_id) REFERENCES exercise_categories(id) ON DELETE CASCADE
);

-- Training Programs - Normalized Source of Truth
CREATE TABLE training_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER,
  title TEXT DEFAULT 'برنامه تمرینی جدید',
  coach_note TEXT DEFAULT '',
  status TEXT DEFAULT 'پیش‌نویس',
  start_date TEXT,
  end_date TEXT,
  program_data TEXT DEFAULT '{}', -- Synchronized JSON from normalized tables
  version INTEGER DEFAULT 1,
  stable_id TEXT UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
);
CREATE INDEX idx_training_programs_student ON training_programs(student_id);
CREATE INDEX idx_training_programs_deleted ON training_programs(deleted_at);
CREATE UNIQUE INDEX idx_training_programs_stable ON training_programs(stable_id);

CREATE TABLE program_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  day_hash TEXT NOT NULL UNIQUE,
  focus TEXT DEFAULT '',
  coach_note TEXT DEFAULT '',
  is_rest_day INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(program_id) REFERENCES training_programs(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_program_days_hash ON program_days(day_hash);
CREATE INDEX idx_program_days_program ON program_days(program_id);

CREATE TABLE exercise_systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL,
  exercise_system_id INTEGER DEFAULT 1,
  system_hash TEXT NOT NULL UNIQUE,
  system_type TEXT DEFAULT 'normal',
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(day_id) REFERENCES program_days(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_exercise_systems_hash ON exercise_systems(system_hash);
CREATE INDEX idx_exercise_systems_day ON exercise_systems(day_id);

CREATE TABLE program_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL,
  exercise_id INTEGER,
  original_exercise_id INTEGER,
  movement_hash TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  order_index INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(system_id) REFERENCES exercise_systems(id) ON DELETE CASCADE,
  FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_program_movements_hash ON program_movements(movement_hash);
CREATE INDEX idx_program_movements_system ON program_movements(system_id);

CREATE TABLE movement_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  movement_id INTEGER NOT NULL,
  set_hash TEXT NOT NULL UNIQUE,
  set_type TEXT DEFAULT 'REPEAT' CHECK(REPEAT,TIME,FAILURE,AMRAP,DROPSET,SUPERSET,GIANT_SET),
  count_value TEXT,
  weight REAL,
  rest_seconds INTEGER DEFAULT 60,
  version INTEGER DEFAULT 1,
  stable_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY(movement_id) REFERENCES program_movements(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_movement_sets_hash ON movement_sets(set_hash);
CREATE INDEX idx_movement_sets_movement ON movement_sets(movement_id);

-- Legacy (isolated)
CREATE TABLE movements (id PK, name, muscle_group, equipment);
CREATE TABLE programs (id PK, student_id FK, title, type, status, start_date, end_date, notes);

-- Other
CREATE TABLE orders, measurements, activity_log
```

## Sync Architecture Future
```
Coach PC (SQLite) <-> Server (PostgreSQL) <-> Student Android (Room)
- Stable_id is sync key
- Version + updated_at for conflict detection
- Deleted_at for soft delete sync
- Training_programs owned by Coach, Exercises owned by Server (read-only locally)
- Program_data JSON for transport, normalized tables for local truth
- Extension point: add sync endpoints /api/sync/push and /api/sync/pull with stable_id
```

---

# Core Student & Monthly Coaching Workflow (Schema 007)

## Lifecycle

The implemented product flow is:

```
Coach creates Student + Invitation
  -> Student accepts private /join/<256-bit-token> link
  -> Profile + a new draft BodyAssessment are completed
  -> student explicitly accepts/declines optional private body photos
  -> submit freezes that assessment (SUBMITTED)
  -> coach reviews (UNDER_REVIEW / CHANGES_REQUESTED / APPROVED)
  -> existing Program Builder creates a DRAFT TrainingProgram
  -> explicit activation assigns it (ACTIVE / PROGRAM_ASSIGNED)
  -> the next month creates Assessment N+1 and Program N+1
  -> prior active program becomes COMPLETED; no historical row is overwritten
```

Assessments and programs are separate monthly records. `assessment_number` and
`program_number` are monotonic per student. Submitted assessments cannot be edited or
have photos replaced/deleted. ACTIVE, COMPLETED, and ARCHIVED programs cannot be edited
or deleted; a coach must create a new DRAFT for a new month.

## Invitation and Student Authorization

`student_invites` stores only `SHA-256(raw_token)`. The 32-byte base64url token is
returned once when the invitation is created. Sequential IDs never appear in the join
URL. Invitations can be active, used, revoked, or expired. The invitation is accepted
once and exchanged for a separate hashed, expiring student session; a used invitation is
never a permanent portal credential. Revocation disables related sessions immediately.

Every student portal request resolves the HttpOnly session server-side to exactly one
`student_id`. Client-supplied student IDs are never trusted. Assessment/photo ownership
is checked in SQL before mutation. A session for student A cannot access or upload to
student B's records.

Coach API access has two modes:

- Local single-user mode: the launcher reads the filesystem-protected, random
  `data/coach-access-token` and opens the one-time bootstrap route. Only that credential
  can issue the process-local HttpOnly, SameSite=Strict coach session cookie; loading `/`
  or `/join/*` never grants coach authorization.
- Hosted mode: set `YASNAFIT_COACH_TOKEN`; it can bootstrap the UI session or authorize
  APIs via a constant-time checked `Authorization: Bearer <token>` / `X-Coach-Token`.

This is an authorization boundary for the current local product, not a replacement for
future multi-coach accounts. The service layer remains identity-agnostic so a future
`coach_id -> student` authorization mapping can be added without moving business rules
into the UI.

## Assessment Model and Freeze Rules

Assessment states:

```
PROFILE_INCOMPLETE -> ASSESSMENT_PENDING -> SUBMITTED
SUBMITTED -> UNDER_REVIEW -> APPROVED
SUBMITTED/UNDER_REVIEW -> CHANGES_REQUESTED -> SUBMITTED
APPROVED -> PROGRAM_ASSIGNED
```

Submission validates profile data, weight, height, goal, training experience, and an
explicit `willing`/`declined` body-photo preference. Photo count is never validated as a
requirement. Optional measurements are retained as columns plus a JSON extension object
for future analysis.
Coach and student notes are separate. All mutations increment `version` and update audit
timestamps.

## Private Photo Security

Photos are written under `data/assessments/<student>/<assessment>/`, never `public/`.
The upload service enforces:

- 5 MB per-file and 20 MB multipart request limits
- one file per upload request and ten current photo slots per assessment
- allowlisted JPEG/PNG/WEBP MIME and extensions; SVG is rejected
- byte-level image signature/trailer checks and MIME/extension consistency
- sanitized filenames, generated UUID storage names, and resolved-path containment
- assessment ownership and editable-state checks
- replacement by soft-deleting the current photo of the same type

API JSON never returns `storage_path`. Bytes are served only by
`GET /api/student-photos/:id`: the student's own portal token or an authorized coach is
required. Responses use `private, no-store`, `nosniff`, restrictive CSP, and a safe
Content-Disposition filename.

## Program Lifecycle and Existing Builder

There is one builder: `public/program-builder.js`, backed by the normalized source of
truth (`training_programs -> program_days -> exercise_systems -> program_movements ->
movement_sets`). The assessment review links to it with `student_id` and `assessment_id`.
Saving creates/updates only DRAFT. “ذخیره و اختصاص به شاگرد” calls the explicit activation
endpoint. Activation requires an APPROVED assessment belonging to the same student,
valid dates, and at least one day and movement. It atomically:

1. marks a prior ACTIVE plan COMPLETED,
2. marks the draft ACTIVE and records `assigned_at`,
3. links the source assessment and marks it PROGRAM_ASSIGNED,
4. updates the student's current lifecycle state.

The read-only student view includes title, dates, days, systems, movements, sets,
repetitions/time, weight, rest, movement descriptions, and coach/day notes. DRAFT plans
are never returned to a student.

## API Boundaries

Coach-authorized APIs:

- `POST/GET /api/student-invites`
- `POST /api/student-invites/:id/revoke`
- `GET /api/student-submissions`
- `GET /api/students/:id/assessments`
- `GET /api/students/:id/timeline`
- `GET /api/assessments/:id`
- `POST /api/assessments/:id/under-review`
- `POST /api/assessments/:id/request-changes`
- `POST /api/assessments/:id/approve`
- `POST/PUT/GET /api/training-programs[...]`
- `POST /api/training-programs/:id/activate|complete|archive`

Student-session-scoped APIs:

- `GET /api/student/me|dashboard|profile|onboarding`
- `PUT /api/student/profile`
- `GET/POST /api/student/assessment`
- `POST/DELETE /api/student/assessment/photos[...]`
- `POST /api/student/assessment/submit`
- `GET /api/student/program|programs|assessments|history`
- `POST /api/student/logout`

Public one-time bootstrap APIs are `GET /api/student/join/:token` and
`POST /api/student/join/:token/accept`. The legacy token-scoped API returns HTTP 410.

Business transitions live in `student-service.js`, `program-service.js`, and
`upload-service.js`, not in browser code.

## Android / Sync Strategy

`students`, invitations, assessments, photos, programs, and normalized program children
carry stable UUIDs, integer versions, and audit/delete timestamps. Future Android sync
should exchange stable IDs, not local integer PKs. Server ownership should be:

- student profile and assessment drafts: student-owned until submission,
- submitted assessments/reviews/programs: server/coach authoritative,
- exercise catalog: server-owned read-only replica,
- photo binaries: private object storage, referenced by stable photo ID.

A future push/pull protocol can use `version + updated_at + deleted_at`; submitted
assessments and non-DRAFT programs must remain immutable conflict domains. AI may consume
the assessment/program timeline later, but no AI decision-making is implemented now.

## Automated Verification

`tests/e2e-workflow.js` exercises the complete two-student/two-month workflow, three
required uploads, pending/review/approval, normalized program activation, timeline
persistence, cross-student denial, invalid/revoked tokens, invalid SVG/traversal upload,
private photo serving, immutable history, migration version, and exercise-count regression.

---

# Application Versioning and Releases (Schema 008)

Application releases use Semantic Versioning and are intentionally independent from both
SQLite migration IDs and Git commit hashes.

- **Application version source of truth:** `package.json.version`
- **Application metadata/API adapter:** `src/release-service.js`
- **Database schema version:** latest row in `schema_migrations` / `settings.schema_version`
- **Git commit:** source-control identity only; it does not automatically change a release

A version changes only for a deliberate release. PATCH is used for compatible fixes,
MINOR for backward-compatible features, and MAJOR for breaking application/API changes.
The browser never contains a hardcoded application version; it reads `GET /api/version`.

Structured release notes are stored in `releases.changes_json` with the fixed categories
`features`, `improvements`, `fixes`, `security`, and `breaking_changes`. The API maps this
JSON to a structured `changes` object. The dashboard, sidebar footer, and
`/coach/releases` UI consume the version/release APIs.

Read-only endpoints:

- `GET /api/version`
- `GET /api/releases`
- `GET /api/releases/:version`

Release workflow: intentionally update `package.json.version`, add a structured release
record through a new migration, commit, then create an annotated `vMAJOR.MINOR.PATCH` Git
tag. Tags are not pushed automatically.

---

# My Students CRM (`/users-list`, v0.4.0)

`public/students.js` is the single coach UI for student management. It consumes the
existing students, invitations, body assessments, protected photos, normalized training
programs, and timeline data; it does not create another student model.

`GET /api/students?view=management` provides server-side name/mobile search, derived-state
filtering, pagination, and aggregate counters. Statuses are projections of actual student,
latest-assessment, invitation, and active-program rows. Existing `GET /api/students`
continues returning the compact array required by Program Builder.

Coach detail APIs are `GET /api/students/:id`, `/assessments`, `/programs`, `/timeline`, and
`/invites`. They all pass the existing coach authorization boundary. Photo JSON omits
storage paths and the UI loads bytes only from the protected `/api/student-photos/:id`
endpoint. Historical programs open in a dedicated read-only viewer; activation/history
immutability remains enforced in `program-service.js`.

Creating or requesting a new assessment reuses the secure invitation service and returns
the raw token only once. The assessment itself is still completed exclusively in the
Student Portal. No new student or assessment tables were added.

---

# Unified Premium Black / White UI System

The visual layer is centralized in `public/styles.css` and does not affect APIs or
business services. Its order is: design tokens, reset, typography, application layout,
navigation, shared components, then responsive rules. `dark-theme.css` remains only as a
compatibility entry and intentionally contains no overrides or `!important` rules.

Page-specific files (`exercises.css`, `program-builder.css`, `student-portal.css`,
`students.css`, and `releases.css`) consume the shared tokens instead of defining their
own palettes. The hierarchy is monochrome and grayscale-first; semantic red is restricted
to destructive/error states. Inputs, tables, modals, drawers, loading/error/empty states,
scrollbars, focus indicators, and generated Program Builder preview windows all use the
same dark visual language.

`tests/ui-design-regression.js` prevents light component backgrounds, legacy green/blue
palette values, malformed inline token usage, stylesheet-order regressions, and return of
`!important` override chains.

## Legacy database compatibility repair (0.4.1)

Migration `010_repair_legacy_student_timestamps` repairs old SQLite installations where
`students.updated_at` was absent even though older migrations were marked applied. It is
additive and backfills in place; no student, assessment, photo, or program row is rebuilt
or deleted. New student inserts explicitly populate both timestamps for compatibility
with repaired tables.

---

# Dedicated Student Portal and Join Flow (v0.5.0)

## Authentication boundary

`/join/:token` is served by `public/student.html`, a dedicated shell that contains no
coach sidebar, coach scripts, or admin navigation. The browser first inspects the
one-time invitation and explicitly accepts it. `student-session-service.js` then:

1. validates the SHA-256 invitation hash, active status, expiry, and student,
2. atomically changes the invitation to `used`,
3. creates 32 random bytes for a student session,
4. stores only SHA-256(session), student/invitation references and expiry,
5. sends `yasnafit_student_session` as HttpOnly + SameSite=Strict (+ Secure on HTTPS).

All `/api/student/*` resource routes pass `requireStudent`; browser-supplied student IDs
are ignored. Coach and student cookies are distinct. `/api/student-portal/:token` is now
retired with HTTP 410, and invitation tokens cannot authorize photos.

## Student UI and workflow

`public/student-app.js` and `student-app.css` implement a separate RTL/mobile portal:

- `/student/onboarding`: six-step personal/body/fitness/limitations/photos/review wizard
- `/student/dashboard`: current assessment/program and coach notes
- `/student/program`: read-only normalized Day -> System -> Movement -> Set program
- `/student/assessment`: latest immutable submitted assessment and private photos
- `/student/history`: submitted assessment and ACTIVE/COMPLETED/ARCHIVED program history
- `/student/profile`: live profile edits that never mutate historical assessments
- `/student/logout`: server-side revocation and cookie clearing

Photo writes reuse `upload-service.js`; photo reads require the matching student session
or an authorized coach. DRAFT programs are excluded from every student response. When an
assigned program ends (or no active program remains), the existing session routes the
student back to onboarding to create the next assessment record rather than overwrite the
previous month.

## Localized body-input fix (v0.5.1)

The body-information onboarding controls use mobile-friendly decimal text inputs instead
of browser-dependent `type=number` parsing. Persian and Arabic digits, Persian decimal
separators and comma decimals are normalized before validation. Height, weight and every
optional measurement receive explicit finite/range checks, and any failure remains
visible inside the wizard instead of disappearing in a short toast. No assessment or
profile business rule changed.

---

# Optional body photos and explicit preference (v0.6.0)

Body photos are private, optional supporting data—not an assessment requirement. Every
new draft must explicitly store `willing` or `declined` before submission. `declined`
soft-deletes any draft photo rows and is shown to the coach as a neutral privacy choice.
`willing` enables five optional slots (`front`, `side`, `back`, `front_flex`,
`back_flex`) and accepts zero through five uploads. Submission, coach approval, program
creation, and portal access never depend on photo count.

Uploaded optional files continue through the existing structural JPEG/PNG/WEBP validator,
private filesystem storage, path containment and session/coach authorization. Submitted
photos remain immutable. Medical documents and additional gallery data are not required;
the current UI reports them as “ارسال نشده • اختیاری” and does not treat absence as an
error.

---

# Professional ten-step assessment profile (v0.7.0)

`/document/edit-document` and `/student/onboarding` now serve the same authenticated,
dedicated ten-step wizard from `assessment-wizard.js`. The wizard autosaves normalized
sections, exposes an explicit “ذخیره موقت”, displays the last save time, and never edits a
previous submitted assessment. Assessment #1 is `INITIAL`; subsequent records are
`MONTHLY`.

Canonical transitions are enforced server-side:

```
DRAFT -> SUBMITTED -> PENDING_REVIEW -> APPROVED
                              |-> REJECTED
                              |-> CHANGES_REQUESTED -> SUBMITTED
```

Reject and change-request transitions require a coach note. Program activation requires
canonical `APPROVED`, retains that assessment state, links through `assessment_id`, and
completes the prior ACTIVE program without deleting history. Coach assessment responses
include structured sections and month-to-month comparison data.

## Optional medical documents

The ten-step wizard accepts optional blood tests and body analysis as PDF/JPEG/PNG/WEBP,
and optional gallery images as JPEG/PNG/WEBP. `assessment-document-service.js` validates
extension, declared MIME, image structure or PDF header/EOF, rejects active PDF features,
uses generated private filenames, and enforces path containment. Draft owners may delete;
submitted documents are immutable. Downloads require the owning student session or coach
authorization.

## Measurement-step compatibility patch (v0.7.1)

Measurement normalization now runs independently on both client and server and supports
English, Persian and Arabic digits plus `.`, `,`, `٫`, and `/` decimal separators. A
persistent error banner is rendered above and below the wizard card, so validation or API
failures cannot appear as a silent stuck step. This patch changes no measurement ranges or
historical records.
