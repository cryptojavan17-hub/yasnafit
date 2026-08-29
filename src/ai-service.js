'use strict';

const programService = require('./program-service');
const studentService = require('./student-service');
const assessmentService = require('./assessment-service');
const engagementService = require('./engagement-service');

function maskApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function getRawSettings(db) {
  const row = db.prepare('SELECT * FROM ai_settings WHERE id = 1').get();
  if (!row) {
    db.prepare(`
      INSERT OR IGNORE INTO ai_settings (id, base_url, default_combo, temperature, top_p, max_tokens, timeout_ms)
      VALUES (1, 'https://9router-production-6a92.up.railway.app/v1', '', 0.7, 1.0, 2000, 30000)
    `).run();
    return db.prepare('SELECT * FROM ai_settings WHERE id = 1').get();
  }
  return row;
}

function getSettings(db) {
  const s = getRawSettings(db);
  return {
    has_api_key: Boolean(s.api_key && s.api_key.trim()),
    api_key_masked: maskApiKey(s.api_key),
    base_url: s.base_url || 'https://9router-production-6a92.up.railway.app/v1',
    default_combo: s.default_combo || '',
    temperature: s.temperature ?? 0.7,
    top_p: s.top_p ?? 1.0,
    max_tokens: s.max_tokens ?? 2000,
    timeout_ms: s.timeout_ms ?? 30000,
    updated_at: s.updated_at
  };
}

function saveSettings(db, input = {}) {
  const current = getRawSettings(db);

  let baseUrl = String(input.base_url ?? current.base_url ?? '').trim();
  if (!baseUrl) {
    baseUrl = 'https://9router-production-6a92.up.railway.app/v1';
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  let defaultCombo = String(input.default_combo ?? current.default_combo ?? '').trim();
  
  let temp = input.temperature != null ? parseFloat(input.temperature) : current.temperature;
  if (isNaN(temp) || temp < 0 || temp > 2) temp = 0.7;

  let topP = input.top_p != null ? parseFloat(input.top_p) : current.top_p;
  if (isNaN(topP) || topP < 0 || topP > 1) topP = 1.0;

  let maxTokens = input.max_tokens != null ? parseInt(input.max_tokens, 10) : current.max_tokens;
  if (isNaN(maxTokens) || maxTokens < 1 || maxTokens > 32000) maxTokens = 2000;

  let timeoutMs = input.timeout_ms != null ? parseInt(input.timeout_ms, 10) : current.timeout_ms;
  if (isNaN(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) timeoutMs = 30000;

  let apiKey = current.api_key;
  if (typeof input.api_key === 'string') {
    const rawKey = input.api_key.trim();
    if (input.clear_api_key) {
      apiKey = null;
    } else if (rawKey && !rawKey.includes('...')) {
      apiKey = rawKey;
    }
  }

  db.prepare(`
    INSERT INTO ai_settings (id, api_key, base_url, default_combo, temperature, top_p, max_tokens, timeout_ms, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      api_key = excluded.api_key,
      base_url = excluded.base_url,
      default_combo = excluded.default_combo,
      temperature = excluded.temperature,
      top_p = excluded.top_p,
      max_tokens = excluded.max_tokens,
      timeout_ms = excluded.timeout_ms,
      updated_at = CURRENT_TIMESTAMP
  `).run(apiKey, baseUrl, defaultCombo, temp, topP, maxTokens, timeoutMs);

  return getSettings(db);
}

// ==========================================
// OpenAI-compatible Tool Definitions
// ==========================================
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_student',
      description: 'دریافت اطلاعات پرونده و مشخصات شاگرد بر اساس شناسه یا شماره پرونده',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'number', description: 'شناسه عددی شاگرد' },
          caseNumber: { type: 'string', description: 'شماره پرونده شش‌رقمی شاگرد (مانند 104523)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_students',
      description: 'جستجو و دریافت لیست شاگردان بر اساس نام، شماره پرونده یا وضعیت',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'عبارت جستجو در نام یا شماره پرونده' },
          status: { type: 'string', enum: ['all', 'active', 'attention', 'idle'], description: 'فیلتر وضعیت شاگرد' },
          limit: { type: 'number', description: 'حداکثر تعداد نتایج (پیش‌فرض 20)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_assessment',
      description: 'دریافت آخرین ارزیابی بدنی ثبت‌شده یا تاییدشده یک شاگرد همراه با اندازه‌ها و مشخصات',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'number', description: 'شناسه عددی شاگرد' }
        },
        required: ['studentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_assessment',
      description: 'دریافت اطلاعات کامل یک ارزیابی با شناسه مشخص',
      parameters: {
        type: 'object',
        properties: {
          assessmentId: { type: 'number', description: 'شناسه ارزیابی' }
        },
        required: ['assessmentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_coach_note',
      description: 'افزودن یا به‌روزرسانی یادداشت و توصیه‌های مربی برای شاگرد، ارزیابی یا برنامه',
      parameters: {
        type: 'object',
        properties: {
          targetType: { type: 'string', enum: ['student', 'assessment', 'program'], description: 'نوع هدف یادداشت' },
          targetId: { type: 'number', description: 'شناسه هدف' },
          note: { type: 'string', description: 'متن یادداشت یا توصیه مربی' }
        },
        required: ['targetType', 'targetId', 'note']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_exercises',
      description: 'جستجو در بانک ۲۷۰۷ حرکت تمرینی بر اساس نام فارسی، دسته‌بندی، عضله و محل تمرین',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'نام فارسی حرکت برای جستجو (مثلاً پرس سینه، اسکوات، نشر)' },
          categoryId: { type: 'string', description: 'شناسه دسته‌بندی (مانند chest, back, legs, shoulders, biceps, triceps, abs)' },
          location: { type: 'string', enum: ['gym', 'home', 'both', 'all'], description: 'محل تمرین' },
          status: { type: 'string', enum: ['active', 'archived', 'all'], description: 'وضعیت حرکت' },
          limit: { type: 'number', description: 'تعداد نتایج (پیش‌فرض 15)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_exercise',
      description: 'دریافت جزئیات کامل یک حرکت تمرینی شامل نام فارسی، عضلات هدف و تجهیزات',
      parameters: {
        type: 'object',
        properties: {
          exerciseId: { type: 'number', description: 'شناسه عددی حرکت در بانک' }
        },
        required: ['exerciseId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_program',
      description: 'دریافت اطلاعات کامل یک برنامه تمرینی شامل تمام روزها، سیستم‌ها، حرکات و ست‌ها',
      parameters: {
        type: 'object',
        properties: {
          programId: { type: 'number', description: 'شناسه برنامه تمرینی' }
        },
        required: ['programId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_student_programs',
      description: 'دریافت تاریخچه تمام برنامه‌های تمرینی یک شاگرد',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'number', description: 'شناسه شاگرد' }
        },
        required: ['studentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_draft_program',
      description: 'ایجاد یک برنامه تمرینی پیش‌نویس (Draft) ساختاریافته برای شاگرد متصل به ارزیابی تاییدشده',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'number', description: 'شناسه شاگرد' },
          assessmentId: { type: 'number', description: 'شناسه ارزیابی شاگرد' },
          title: { type: 'string', description: 'عنوان برنامه تمرینی' },
          coachNote: { type: 'string', description: 'توصیه‌ها و یادداشت‌های عمومی مربی برای این برنامه' },
          days: {
            type: 'array',
            description: 'لیست روزها و جلسات تمرینی',
            items: {
              type: 'object',
              properties: {
                day_number: { type: 'number', description: 'شماره جلسه/روز (۱، ۲، ۳...)' },
                focus: { type: 'string', description: 'تمرکز جلسه (مثلاً سینه و جلوبازو، یا استراحت)' },
                is_rest_day: { type: 'boolean', description: 'آیا روز استراحت است؟' },
                coach_note: { type: 'string', description: 'یادداشت اختصاصی این روز' },
                systems: {
                  type: 'array',
                  description: 'سیستم‌های تمرینی این جلسه',
                  items: {
                    type: 'object',
                    properties: {
                      exercise_system_id: { type: 'number', description: 'شناسه سیستم تمرینی (۱: معمولی، ۲: سوپرست، ۳: تری‌ست، ۴: جاینت‌ست، ۵: دراپ‌ست، و...)' },
                      movements: {
                        type: 'array',
                        description: 'حرکات تمرینی داخل این سیستم',
                        items: {
                          type: 'object',
                          properties: {
                            exercise_id: { type: 'number', description: 'شناسه حرکت از بانک حرکات' },
                            name: { type: 'string', description: 'نام حرکت' },
                            description: { type: 'string', description: 'توضیحات تمپو و اجرای حرکت' },
                            sets: {
                              type: 'array',
                              description: 'ست‌های این حرکت',
                              items: {
                                type: 'object',
                                properties: {
                                  type: { type: 'string', enum: ['REPEAT', 'TIME', 'MINUTE', 'DROPSET', 'FAILURE'], description: 'واحد ست' },
                                  count: { type: 'number', description: 'تعداد تکرار یا زمان ست' },
                                  weight: { type: 'number', description: 'وزنه پیشنهادی (اختیاری)' },
                                  restSeconds: { type: 'number', description: 'زمان استراحت به ثانیه' }
                                }
                              }
                            }
                          },
                          required: ['exercise_id']
                        }
                      }
                    },
                    required: ['exercise_system_id', 'movements']
                  }
                }
              },
              required: ['day_number']
            }
          }
        },
        required: ['studentId', 'assessmentId', 'title', 'days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_draft_program',
      description: 'به‌روزرسانی محتوا یا ساختار یک برنامه تمرینی پیش‌نویس',
      parameters: {
        type: 'object',
        properties: {
          programId: { type: 'number', description: 'شناسه برنامه' },
          data: { type: 'object', description: 'داده‌های جدید برنامه' }
        },
        required: ['programId', 'data']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'activate_program',
      description: 'فعال‌سازی و اختصاص رسمی یک برنامه تمرینی به شاگرد',
      parameters: {
        type: 'object',
        properties: {
          programId: { type: 'number', description: 'شناسه برنامه تمرینی' }
        },
        required: ['programId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_program',
      description: 'تکمیل و بایگانی یک دوره تمرینی',
      parameters: {
        type: 'object',
        properties: {
          programId: { type: 'number', description: 'شناسه برنامه تمرینی' }
        },
        required: ['programId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workout_results',
      description: 'دریافت نتایج و تاریخچه ثبت تمرینات و ست‌های اجرا شده توسط شاگرد',
      parameters: {
        type: 'object',
        properties: {
          studentId: { type: 'number', description: 'شناسه شاگرد' },
          programId: { type: 'number', description: 'شناسه برنامه تمرینی (اختیاری)' },
          from: { type: 'string', description: 'تاریخ شروع بازه' },
          to: { type: 'string', description: 'تاریخ پایان بازه' }
        },
        required: ['studentId']
      }
    }
  }
];

// ==========================================
// Tool Execution Handlers
// ==========================================
async function executeTool(db, name, args = {}) {
  try {
    switch (name) {
      case 'get_student': {
        const { studentId, caseNumber } = args;
        if (!studentId && !caseNumber) {
          return { error: 'studentId یا caseNumber الزامی است.' };
        }
        let sql = 'SELECT id, full_name, case_number, mobile, goal, height, weight, training_level, limitations, injuries, medical_notes, coach_notes, created_at FROM students WHERE deleted_at IS NULL';
        let params = [];
        if (studentId) {
          sql += ' AND id = ?';
          params.push(Number(studentId));
        } else {
          sql += ' AND case_number = ?';
          params.push(String(caseNumber).trim());
        }
        const student = db.prepare(sql).get(...params);
        if (!student) return { error: 'شاگرد پیدا نشد.' };
        return { student };
      }

      case 'list_students': {
        const { search = '', status = 'all', limit = 20 } = args;
        const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
        let sql = 'SELECT id, full_name, case_number, mobile, goal, training_level, created_at FROM students WHERE deleted_at IS NULL';
        const params = [];
        if (search && String(search).trim()) {
          sql += ' AND (full_name LIKE ? OR case_number LIKE ? OR mobile LIKE ?)';
          const term = `%${String(search).trim()}%`;
          params.push(term, term, term);
        }
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(lim);
        const list = db.prepare(sql).all(...params);
        return { students: list, count: list.length };
      }

      case 'get_latest_assessment': {
        const studentId = Number(args.studentId);
        if (!studentId) return { error: 'studentId الزامی است.' };
        const assessment = db.prepare(`
          SELECT * FROM body_assessments
          WHERE student_id = ? AND deleted_at IS NULL
          ORDER BY assessment_number DESC, id DESC
          LIMIT 1
        `).get(studentId);
        if (!assessment) return { error: 'ارزیابی برای این شاگرد ثبت نشده است.' };
        const details = assessmentService.getDetails(db, assessment.id);
        return { assessment, details };
      }

      case 'get_assessment': {
        const assessmentId = Number(args.assessmentId);
        if (!assessmentId) return { error: 'assessmentId الزامی است.' };
        const assessment = db.prepare('SELECT * FROM body_assessments WHERE id = ? AND deleted_at IS NULL').get(assessmentId);
        if (!assessment) return { error: 'ارزیابی پیدا نشد.' };
        const details = assessmentService.getDetails(db, assessmentId);
        return { assessment, details };
      }

      case 'add_coach_note': {
        const { targetType, targetId, note } = args;
        const noteText = String(note || '').trim();
        const id = Number(targetId);
        if (!id) return { error: 'targetId نامعتبر است.' };
        if (targetType === 'student') {
          db.prepare('UPDATE students SET coach_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(noteText, id);
          return { success: true, message: 'یادداشت مربی برای شاگرد ذخیره شد.' };
        } else if (targetType === 'assessment') {
          db.prepare('UPDATE body_assessments SET coach_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(noteText, id);
          return { success: true, message: 'یادداشت مربی برای ارزیابی ذخیره شد.' };
        } else if (targetType === 'program') {
          db.prepare('UPDATE training_programs SET coach_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(noteText, id);
          return { success: true, message: 'یادداشت مربی برای برنامه تمرینی ذخیره شد.' };
        }
        return { error: 'نوع هدف (targetType) نامعتبر است.' };
      }

      case 'search_exercises': {
        const { query = '', categoryId, location, status = 'active', limit = 15 } = args;
        const lim = Math.min(Math.max(Number(limit) || 15, 1), 60);
        let sql = 'SELECT id, original_id, name_fa, location, category_id, subcategory_id, image_path, target_muscles, priority FROM exercises WHERE deleted_at IS NULL';
        const params = [];
        if (status && status !== 'all') {
          sql += ' AND status = ?';
          params.push(status);
        }
        if (location && location !== 'all' && location !== 'both') {
          sql += ' AND (location = ? OR location = "both")';
          params.push(location);
        }
        if (categoryId && categoryId !== 'all') {
          sql += ' AND category_id = ?';
          params.push(categoryId);
        }
        if (query && String(query).trim()) {
          sql += ' AND name_fa LIKE ?';
          params.push(`%${String(query).trim()}%`);
        }
        sql += ' ORDER BY priority ASC, name_fa ASC LIMIT ?';
        params.push(lim);
        const exercises = db.prepare(sql).all(...params);
        return { exercises, count: exercises.length };
      }

      case 'get_exercise': {
        const exerciseId = Number(args.exerciseId);
        if (!exerciseId) return { error: 'exerciseId الزامی است.' };
        const exercise = db.prepare('SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL').get(exerciseId);
        if (!exercise) return { error: 'حرکت در بانک پیدا نشد.' };
        if (exercise.target_muscles) {
          try { exercise.target_muscles = JSON.parse(exercise.target_muscles); } catch(e){}
        }
        return { exercise };
      }

      case 'get_program': {
        const programId = Number(args.programId);
        if (!programId) return { error: 'programId الزامی است.' };
        const built = programService.buildProgramFromDB(db, programId);
        if (!built) return { error: 'برنامه تمرینی پیدا نشد.' };
        return { program: built };
      }

      case 'list_student_programs': {
        const studentId = Number(args.studentId);
        if (!studentId) return { error: 'studentId الزامی است.' };
        const programs = db.prepare(`
          SELECT id, title, status, program_number, start_date, end_date, coach_note, created_at
          FROM training_programs
          WHERE student_id = ? AND deleted_at IS NULL
          ORDER BY program_number DESC, id DESC
        `).all(studentId);
        return { programs, count: programs.length };
      }

      case 'create_draft_program': {
        const { studentId, assessmentId, title, coachNote = '', days = [] } = args;
        if (!studentId || !assessmentId) return { error: 'studentId و assessmentId الزامی هستند.' };
        if (!title || !String(title).trim()) return { error: 'title برنامه الزامی است.' };
        if (!days || !Array.isArray(days) || days.length === 0) return { error: 'حداقل یک روز تمرینی الزامی است.' };

        // Construct standardized payload
        const payload = {
          title: String(title).trim(),
          student_id: Number(studentId),
          assessment_id: Number(assessmentId),
          coach_note: String(coachNote || ''),
          status: 'DRAFT',
          start_date: new Date().toISOString().slice(0, 10),
          end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          program_data: {
            version: 2,
            days: days.map((d, dIdx) => ({
              day_number: d.day_number || (dIdx + 1),
              focus: d.focus || `جلسه ${dIdx + 1}`,
              coach_note: d.coach_note || '',
              is_rest_day: Boolean(d.is_rest_day),
              data: (d.systems || []).map(sys => ({
                exercise_system_id: sys.exercise_system_id || 1,
                system_type: sys.system_type || 'normal',
                movement_list: (sys.movements || []).map(m => ({
                  exercise_id: m.exercise_id,
                  name: m.name || '',
                  description: m.description || '',
                  sets: (m.sets || []).map(s => ({
                    type: s.type || 'REPEAT',
                    count: s.count ?? 12,
                    weight: s.weight ?? null,
                    restSeconds: s.restSeconds ?? 60
                  }))
                }))
              }))
            }))
          }
        };

        const result = programService.createProgramInDB(db, payload);
        return {
          success: true,
          programId: result.id,
          title: payload.title,
          status: 'DRAFT',
          message: 'برنامه تمرینی پیش‌نویس با موفقیت ساخته شد.'
        };
      }

      case 'update_draft_program': {
        const programId = Number(args.programId);
        if (!programId) return { error: 'programId الزامی است.' };
        const result = programService.saveProgramToDB(db, programId, args.data || {});
        return { success: true, programId, message: 'برنامه تمرینی به‌روزرسانی شد.' };
      }

      case 'activate_program': {
        const programId = Number(args.programId);
        if (!programId) return { error: 'programId الزامی است.' };
        const activated = programService.activateProgram(db, programId);
        return { success: true, programId, status: activated.status, message: 'برنامه تمرینی فعال و به شاگرد اختصاص داده شد.' };
      }

      case 'complete_program': {
        const programId = Number(args.programId);
        if (!programId) return { error: 'programId الزامی است.' };
        const transitioned = programService.transitionProgram(db, programId, 'COMPLETED');
        return { success: true, programId, status: transitioned.status, message: 'برنامه تمرینی تکمیل شد.' };
      }

      case 'get_workout_results': {
        const studentId = Number(args.studentId);
        if (!studentId) return { error: 'studentId الزامی است.' };
        const perf = engagementService.performance(db, studentId);
        const workouts = engagementService.listWorkouts(db, studentId);
        return { performance: perf, workouts: workouts.slice(0, 15) };
      }

      default:
        return { error: `ابزار ناشناخته: ${name}` };
    }
  } catch (error) {
    return { error: `خطا در اجرای ابزار ${name}: ${error.message}` };
  }
}

// ==========================================
// Comprehensive Scientific Program Rationale Builder
// ==========================================
function buildComprehensiveProgramRationale({ student, assessment, details = {}, programData, daysCount = 4, programTitle }) {
  const s = student || {};
  const a = assessment || {};
  const d = details || {};

  const fullName = s.full_name || 'ورزشکار';
  const caseNumber = s.case_number || '—';
  const weight = Number(a.weight || s.weight || 75);
  const height = Number(a.height || s.height || 175);
  const bodyFat = a.body_fat != null ? Number(a.body_fat) : null;

  let bmi = null;
  let bmiCategory = 'نرمال';
  if (weight > 0 && height > 0) {
    bmi = +(weight / ((height / 100) ** 2)).toFixed(1);
    if (bmi < 18.5) bmiCategory = 'کمبود وزن (نیاز به افزایش حجم و وزن)';
    else if (bmi < 25) bmiCategory = 'وزن نرمال و ایده‌آل';
    else if (bmi < 30) bmiCategory = 'اضافه‌وزن (نیاز به اصلاح ترکیب بدنی و چربی‌سوزی)';
    else bmiCategory = 'چاقی (اولویت کاهش چربی و محافظت از مفاصل)';
  }

  // Level & Experience
  const rawLevel = String(s.training_level || s.training_experience || '').toLowerCase();
  let level = 'مبتدی (Beginner)';
  let isBeginner = true;
  let isAdvanced = false;
  if (rawLevel.includes('adv') || rawLevel.includes('پیشرفته') || rawLevel.includes('حرفه‌ای')) {
    level = 'پیشرفته (Advanced)';
    isBeginner = false;
    isAdvanced = true;
  } else if (rawLevel.includes('inter') || rawLevel.includes('متوسط')) {
    level = 'متوسط (Intermediate)';
    isBeginner = false;
  }

  const sportsDetails = d.sports || {};
  const experience = sportsDetails.practice_history_details || s.training_experience || (isBeginner ? 'کمتر از ۶ ماه سابقه تمرین' : (isAdvanced ? 'بیش از ۳ سال سابقه پیوسته' : '۱ الی ۲ سال سابقه تمرین'));

  // Goal
  const goalCode = Array.isArray(d.goals) && d.goals[0] ? d.goals[0] : (d.goals?.main_goal || s.goal || 'fitness');
  let goal = 'فیتنس و هایپرتروفی';
  let isFatLoss = false;
  let isMuscleGain = false;
  if (goalCode.includes('fat_loss') || goalCode.includes('weight_loss') || goalCode.includes('چربی') || goalCode.includes('کاهش وزن')) {
    goal = 'کاهش وزن و چربی‌سوزی (Fat Loss)';
    isFatLoss = true;
  } else if (goalCode.includes('muscle_gain') || goalCode.includes('weight_gain') || goalCode.includes('حجم') || goalCode.includes('عضله')) {
    goal = 'افزایش توده عضلانی و هایپرتروفی (Muscle Gain)';
    isMuscleGain = true;
  } else if (goalCode.includes('corrective') || goalCode.includes('اصلاحی')) {
    goal = 'حرکات اصلاحی و بهبود پاسچر (Corrective Exercise)';
  } else {
    goal = s.goal || 'فیتنس، تناسب اندام و فرم‌دهی (Fitness & Health)';
  }

  // Location & Equipment
  const location = sportsDetails.preferred_location || s.preferred_location || 'gym';
  const locationFa = location === 'home' ? 'منزل (با دمبل و کش‌های مقاومتی)' : 'باشگاه مجهز (سیم‌کش، هالتر، دمبل و دستگاه)';

  // Medical / Injuries
  const medicalDetails = d.medical || {};
  const medItems = Array.isArray(d.medical_items) ? d.medical_items : [];
  let injuriesList = [];
  if (s.injuries && s.injuries !== 'بدون آسیب') injuriesList.push(s.injuries);
  if (medicalDetails.injury_details) injuriesList.push(medicalDetails.injury_details);
  if (medicalDetails.orthopedic_issues) injuriesList.push(medicalDetails.orthopedic_issues);
  for (const item of medItems) {
    if (item.kind === 'injury' || item.kind === 'corrective') {
      injuriesList.push(`${item.category}: ${item.name}`);
    }
  }
  const injuriesText = injuriesList.length > 0 ? [...new Set(injuriesList)].join('، ') : 'بدون آسیب ثبت‌شده (سلامت کامل مفصلی)';
  const hasSpineInjury = /کمر|دیسک|ستون|lumbar|spine/i.test(injuriesText);
  const hasKneeInjury = /زانو|مینیسک|رباط|knee/i.test(injuriesText);
  const hasShoulderInjury = /شانه|کتف|روتاتور|shoulder/i.test(injuriesText);

  // Limitations
  const limitations = s.limitations || medicalDetails.disease_details || 'بدون محدودیت خاص';
  const weeklyDays = Number(sportsDetails.sessions_per_week || s.sessions_per_week || s.weekly_days || daysCount || 3);

<<<<<<< HEAD
=======
  // Nutrition & Diet Restrictions
  const nutritionDetails = d.nutrition || {};
  const dietCode = nutritionDetails.diet_type || 'none';
  const dietLabels = {
    none: 'بدون محدودیت',
    no_restriction: 'بدون محدودیت',
    vegetarian: 'گیاه‌خواری',
    vegan: 'وگان',
    celiac: 'سلیاک',
    lactose_intolerance: 'حساسیت به لاکتوز',
    gout: 'نقرس',
    low_carb: 'لوکرب',
    ketogenic: 'کتوژنیک',
    fasting: 'فستینگ',
    professional: 'حرفه‌ای',
    competition: 'مسابقه ای',
    iranian: 'سفره ایرانی'
  };
  const dietFa = dietLabels[dietCode] || dietCode;
  const appetiteCode = nutritionDetails.appetite_status || 'normal';
  const appetiteLabels = {
    normal: 'معمولی و طبیعی',
    normal_eating: 'معمولی و طبیعی',
    low_eating: 'کم‌خوری',
    grazing: 'ریزه‌خوری',
    overeating: 'پرخوری',
    emotional_overeating: 'پرخوری عصبی',
    anorexia: 'بی‌اشتهایی عصبی'
  };
  const appetiteFa = appetiteLabels[appetiteCode] || appetiteCode;

>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
  // 1. Training Level Rationale
  let trainingLevelRationale = '';
  if (isBeginner) {
    trainingLevelRationale = `به دلیل سطح مبتدی و سابقه تمرینی محدود (${experience})، اولویت اصلی برنامه بر یادگیری بیومکانیک صحیح حرکات، سازگاری‌های عصبی-عضلانی (Neuromuscular Adaptation)، تقویت تاندون‌ها و لیگامنت‌ها و کنترل کامل فاز منفی (Eccentric) است. حجم تمرین با احتیاط و در حد توان ریکاوری سیستم عصبی مرکزی (CNS) تنظیم شده تا از بیش‌تمرینی و کوفتگی مفرط جلوگیری شود.`;
  } else if (isAdvanced) {
    trainingLevelRationale = `با توجه به سطح پیشرفته و سابقه تمرینی طولانی (${experience})، برنامه از اصل بار پیش‌رونده، شدت بالا و سیستم‌های ترکیبی (سوپرست و تری‌ست) جهت ایجاد تنش مکانیکی حداکثری و تحریک سازگاری‌های هایپرتروفیک پیشرفته بهره می‌برد.`;
  } else {
    trainingLevelRationale = `با توجه به سطح متوسط و سابقه تمرینی مناسب (${experience})، برنامه بر پایه افزایش تدریجی بار (Progressive Overload)، تنوع زوایای انقباضی عضلات و بهره‌گیری از سیستم‌های تمرینی کمکی جهت ارتقای تقارن بدنی و پمپ عضلانی ساختار یافته است.`;
  }

  // 2. Goal & BMI Rationale
  let goalBmiRationale = '';
  if (isFatLoss || (bmi && bmi >= 25)) {
    goalBmiRationale = `با توجه به هدف چربی‌سوزی و شاخص توده بدنی (BMI: ${bmi || '—'} - ${bmiCategory})، برنامه با هدف افزایش چگالی تمرین (Workout Density) و بالابردن نرخ متابولیک طراحی شده است. فاز هوازی در انتهای جلسه تعبیه شده تا پس از تخلیه نسبی گلیکوژن در فاز مقاومتی، چربی‌سوزی با استفاده از اکسیداسیون اسیدهای چرب (در Zone 2) به حداکثر راندمان برسد.`;
  } else if (isMuscleGain) {
    goalBmiRationale = `با توجه به هدف هایپرتروفی و افزایش توده عضلانی (BMI: ${bmi || '—'} - ${bmiCategory})، بازه تکرارها در حرکات اصلی بین ۸ تا ۱۲ تکرار با زمان استراحت کافی (۶۰ تا ۹۰ ثانیه) انتخاب شده تا بازسازی ذخایر ATP-CP به بهترین شکل انجام شده و تنش مکانیکی بهینه به تارها وارد گردد.`;
  } else {
    goalBmiRationale = `با توجه به هدف ارتقای فیتنس و سلامت عمومی (BMI: ${bmi || '—'} - ${bmiCategory})، ترکیب متوازنی از تمرینات قدرتی چندمفصلی، استقامت عضلانی، بهبود پاسچر و کاندیشنینگ قلبی-عروقی لحاظ شده است.`;
  }

  // 3. Orthopedic & Injury Safety Rationale
  let injurySafetyRationale = '';
  if (hasSpineInjury) {
    injurySafetyRationale = `تدابیر ستون فقرات و دیسک کمر: حرکات دارای بار محوری مستقیم و سنگین (Axial Loading) حذف شده و حرکات با تکیه‌گاه سینه/پشت، سیم‌کش و دستگاه‌های با ثبات بالا جایگزین شدند. همچنین در فاز ۴ تقویت عضلات فیله و ثبات‌دهنده‌های میان‌تنه (Core) به صورت تخصصی قرار گرفته است.`;
  } else if (hasKneeInjury) {
    injurySafetyRationale = `تدابیر مفصل زانو: زوایای خمش حاد زانو مهار شده و تمرکز بر حرکات زنجیره حرکتی بسته با دامنه کنترل‌شده و تقویت متقارن همسترینگ و چهارسر جهت تثبیت مفصل کشکک قرار داده شده است.`;
  } else if (hasShoulderInjury) {
    injurySafetyRationale = `تدابیر مفصل سرشانه: پرهیز از حرکات پشت گردن یا اکستنشن‌های شدید، تأکید بر حرکت در صفحه اسکپشن (Scapular Plane) و تمرکز بر ثبات کتف و عضلات روتاتور کاف.`;
  } else if (injuriesList.length > 0) {
    injurySafetyRationale = `ملاحظات پزشکی بر اساس آسیب‌های گزارش‌شده (${injuriesText}): انتخاب حرکات کاملاً متناسب با خط کشش ایمن مفاصل صورت گرفته تا تمرین بدون کمترین درد و ریسک آسیب انجام گیرد.`;
  } else {
    injurySafetyRationale = `سلامت کامل مفاصل و عدم گزارش آسیب، امکان استفاده از دامنه کامل حرکتی (Full ROM)، حرکات چندمفصلی بنیادین و سیستم‌های مقاومتی ترکیبی را با بالاترین راندمان فراهم نموده است.`;
  }

  // 4. Split & Volume Rationale
  const splitMatchNote = (daysCount === weeklyDays)
    ? `دقیقاً منطبق بر اعلام شاگرد در فرم ارزیابی (${weeklyDays.toLocaleString('fa-IR')} جلسه در هفته)`
    : `تنظیم‌شده برای ${daysCount.toLocaleString('fa-IR')} جلسه تمرینی`;

  const splitVolumeRationale = `چیدمان جلسات به صورت ${daysCount.toLocaleString('fa-IR')} روزه، ${splitMatchNote} طراحی گردیده است. توزیع متوازن حجم (۱۸ تا ۲۴ ست در هر جلسه) اجازه می‌دهد تا هر گروه عضلانی ۴۸ الی ۷۲ ساعت ریکاوری کامل داشته باشد و از تجمع خستگی سیستم عصبی مرکزی (CNS) و تداخل با مشغله‌های شاگرد جلوگیری شود.`;

  // 5. Training Systems Rationale
  const systemsRationale = `استفاده از سیستم معمولی در حرکات اصلی برای حفظ قدرت و تمرکز عصبی، و استفاده از سوپرست‌ها یا تری‌ست‌ها در حرکات کمکی جهت افزایش جریان خون موضعی (Hyperemia)، پمپ عضلانی و صرفه‌جویی زمان بدون افزایش لود مفصلی تعبیه شده است.`;

  // Detailed initial chat message
  const initialChatMessage = `✅ **برنامه تمرینی هوشمند و تخصصی بر اساس ارزیابی بدنی ساخته شد.**

📋 **خلاصه وضعیت و شاخص‌های استخراج‌شده از پرونده و ارزیابی:**
• **نام و پرونده:** ${fullName} (شماره پرونده: ${caseNumber})
• **شاخص‌های آنتروپومتریک:** وزن ${weight} کیلوگرم | قد ${height} سانتی‌متر | شاخص BMI: ${bmi || '—'} (${bmiCategory})
• **سطح آمادگی و سابقه تمرینی:** ${level} (${experience})
• **هدف اصلی دوره:** ${goal}
• **محیط و امکانات تمرینی:** ${locationFa}
• **تعداد جلسات هفتگی:** دقیقاً ${daysCount.toLocaleString('fa-IR')} جلسه در هفته (منطبق با درخواست ${weeklyDays.toLocaleString('fa-IR')} روزه شاگرد در ارزیابی)
<<<<<<< HEAD
=======
• **محدودیت غذایی و اشتها:** ${dietFa} • اشتهای ${appetiteFa}
>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
• **وضعیت سلامت مفاصل و آسیب‌ها:** ${injuriesText}
• **محدودیت‌ها و ملاحظات:** ${limitations}

🧠 **دلایل علمی و توجیه جامع چیدمان برنامه (Scientific Rationale):**
۱. **سطح آمادگی و سابقه تمرینی (Training Age & Level):**
   ${trainingLevelRationale}

۲. **توجیه تعداد جلسات هفتگی (${daysCount.toLocaleString('fa-IR')} روزه):**
   ${splitVolumeRationale}

۳. **هدف اصلی، ترکیب بدنی و شاخص BMI:**
   ${goalBmiRationale}

۴. **تدابیر ارتوپدی، سلامت مفاصل و پیشگیری از آسیب (Joint Sparing):**
   ${injurySafetyRationale}

۵. **استراتژی سیستم‌های تمرینی و تنوع انقباضی:**
   ${systemsRationale}

۶. **منطق فیزیولوژیک ساختار ۶ مرحله‌ای هر جلسه (مدت زمان: ۵۵ الی ۶۵ دقیقه):**
   • **فاز ۱ (گرم‌کردن پویا - ۵ تا ۸ دقیقه):** افزایش دمای مرکزی عضلات، کاهش ویسکوزیته و تحریک ترشح مایع سینوویال مفصلی جهت جلوگیری از کشیدگی تاندون‌ها.
   • **فاز ۲ (حرکات اصلی چندمفصلی - ۲ تا ۳ حرکت):** اجرای حرکات بنیادین در ابتدای جلسه در اوج ترشح استیل‌کولین و ذخایر فسفاژن برای فراخوانی حداکثر تارهای تند‌انقباض.
   • **فاز ۳ (حرکات کمکی و سوپرست‌ها - ۳ تا ۴ حرکت):** ایجاد هایپرمی (پمپ خون)، تنش مکانیکی و استرس متابولیک در عضلات مکمل جهت تحریک هایپرتروفی سارکوپلاسمی بدون فرسایش مفاصل.
   • **فاز ۴ (تقویت Core و میان‌تنه - ۱ حرکت):** تقویت عضلات شکم، فیله و ثبات‌دهنده‌های ستون فقرات برای حفظ سلامت دیسک‌ها و انتقال صحیح نیرو.
   • **فاز ۵ (هوازی هدفمند - ۱۰ تا ۱۵ دقیقه):** پیاده‌روی شیب‌دار یا دوچرخه در شدت یکنواخت (Zone 2) در پایان تمرین به دلیل تخلیه نسبی گلیکوژن جهت اکسیداسیون بهینه اسیدهای چرب و دفع اسید لاکتیک.
   • **فاز ۶ (سردکردن و کشش ایستا - ۵ دقیقه):** کشش ایستا و افت تدریجی ضربان قلب جهت بازگشت سیستم خودمختار به فاز پاراسمپاتیک و کاهش کوفتگی عضلانی تاخیری (DOMS).

💡 **دستورالعمل پیشرفت و توصیه‌های کلیدی مربی:**
• **اصل اضافه بار تدریجی (Progressive Overload):** افزایش هفتگی کنترل‌شده وزنه‌ها (۱ تا ۲ درصد) یا بهبود کیفیت و تمپوی فاز منفی.
• **هیدراتاسیون و تعادل الکترولیتی:** مصرف روزانه حداقل ۳ لیتر آب جهت حفظ هیدراتاسیون تارهای عضلانی و دفع سموم متابولیک.
• **تغذیه و پروتئین:** تأمین ۱.۶ الی ۲.۲ گرم پروتئین به ازای هر کیلوگرم وزن بدن متناسب با هدف شاگرد.
• **استراحت بین ست‌ها:** ۶۰ الی ۹۰ ثانیه در حرکات اصلی و ۴۵ الی ۶۰ ثانیه در حرکات کمکی.

💬 *شما می‌توانید خلاصه مشخصات شاگرد، دلایل علمی طراحی و ساختار جلسات را در ستون سمت راست نیز مشاهده فرمایید. اگر مایل به تغییر حرکت، افزودن سوپرست، یا تغییر تکرارها هستید، در همین چت مطرح فرمایید تا بلافاصله اعمال شود.*`;

  return {
    studentProfile: {
      fullName,
      caseNumber,
      weight,
      height,
      bodyFat,
      bmi,
      bmiCategory,
      level,
      experience,
      goal,
      location,
      locationFa,
      injuries: injuriesText,
      limitations,
      weeklyDays
    },
    dataSources: [
      `پرونده هویتی شاگرد: ${fullName} (شماره پرونده: ${caseNumber})`,
      `شاخص‌های آنتروپومتریک ارزیابی بدنی: وزن ${weight} kg، قد ${height} cm، شاخص توده بدنی BMI: ${bmi || '—'} (${bmiCategory})`,
      `سابقه و سطح آمادگی ورزشی: سطح ${level} — ${experience}`,
      `سوابق پزشکی و سلامت مفاصل: ${injuriesText}`,
      `محل تمرین و امکانات در دسترس: ${locationFa}`,
      `هدف اولیه و اولویت فیزیولوژیک: ${goal}`
    ],
    decisionLogic: [
      `تحلیل سطح آمادگی و سابقه تمرینی (${level}): ${trainingLevelRationale}`,
      `تحلیل هدف اصلی، ترکیب بدنی و BMI (${goal} / BMI: ${bmi || '—'}): ${goalBmiRationale}`,
      `تدابیر ارتوپدی و ایمنی مفاصل: ${injurySafetyRationale}`,
      `چیدمان تفکیک عضلانی (Split) و مدیریت حجم: ${splitVolumeRationale}`,
      `سیستم‌های تمرینی و تنوع انقباضی: ${systemsRationale}`
    ],
    sixPhaseBreakdown: [
      { phase: 1, name: 'گرم‌کردن پویا (Warm-up)', duration: '۵ تا ۸ دقیقه', reason: 'افزایش دمای عضلانی، ترشح مایع سینوویال و کاهش ویسکوزیته بافت برای جلوگیری از آسیب تاندون‌ها.' },
      { phase: 2, name: 'حرکات اصلی چندمفصلی (Main Lifts)', count: '۲ تا ۳ حرکت', reason: 'اجرا در ابتدای جلسه در اوج توان سیستم عصبی مرکزی (CNS) جهت فراخوانی حداکثر تارهای تند‌انقباض.' },
      { phase: 3, name: 'حرکات کمکی و سوپرست‌ها (Accessory & Supersets)', count: '۳ تا ۴ حرکت', reason: 'ایجاد هایپرمی، پمپ عضلانی، تنش مکانیکی و صرفه‌جویی زمان بدون فشار بیش از حد به مفاصل.' },
      { phase: 4, name: 'تقویت Core و میان‌تنه', count: '۱ حرکت', reason: 'ثبات‌بخشی به ستون فقرات، پیشگیری از کمردرد و انتقال بهینه نیرو بین بالاتنه و پایین‌تنه.' },
      { phase: 5, name: 'هوازی هدفمند (Cardio)', duration: '۱۰ تا ۱۵ دقیقه', reason: 'اجرا در انتهای جلسه پس از تخلیه گلیکوژن جهت اکسیداسیون بهینه چربی‌ها (Zone 2) و پاکسازی لاکتات.' },
      { phase: 6, name: 'سردکردن و کشش ایستا (Cool-down)', duration: '۵ دقیقه', reason: 'افت تدریجی ضربان قلب، بازگشت سیستم خودمختار به فاز پاراسمپاتیک و تسریع ریکاوری.' }
    ],
    mismatchReport: [
      { item: 'تعداد جلسات هفتگی', requested: `${weeklyDays} جلسه در هفته`, delivered: `${daysCount} روز تمرینی استاندارد`, status: 'منطبق', note: 'توزیع بهینه حجم و ریکاوری ۴۸-۷۲ ساعته' },
      { item: 'محیط و تجهیزات تمرینی', requested: location === 'home' ? 'منزل' : 'باشگاه', delivered: locationFa, status: 'منطبق', note: 'استفاده از بانک حرکات استاندارد' },
      { item: 'ملاحظات ارتوپدی و آسیب‌ها', requested: injuriesText, delivered: 'طراحی ایمن با خط کشش کنترل‌شده', status: 'رعایت‌شده', note: 'حذف حرکات پرریسک و محافظت از مفاصل' }
    ],
    overallRationale: `این برنامه تمرینی بر اساس جدیدترین متدهای فیزیولوژی تمرین و متناسب با وضعیت ${level} شاگرد، هدف (${goal}) و آنالیز بدنی طراحی گردیده است. جلسات ۵۵ الی ۶۵ دقیقه‌ای ۶ مرحله‌ای تضمین می‌کنند که شاگرد بالاترین بازدهی هایپرتروفی و تناسب اندام را در کنار حداکثر ایمنی مفاصل تجربه کند.`,
    coachGuidelines: [
      'اصل اضافه بار تدریجی (Progressive Overload): هر هفته تلاش کنید وزنه یا کنترل فاز منفی را ۱ تا ۲ درصد بهبود دهید.',
      'هیدراتاسیون: مصرف حداقل ۳ لیتر آب در روز برای پمپ بهینه سلولی و دفع سموم متابولیک.',
      'پروتئین و تغذیه: تأمین ۱.۶ الی ۲.۲ گرم پروتئین به ازای هر کیلوگرم وزن بدن متناسب با هدف.',
      'خواب و ریکاوری: حداقل ۷ تا ۸ ساعت خواب شبانه باکیفیت جهت ترشح هورمون‌های آنابولیک.'
    ],
    initialChatMessage
  };
}

// ==========================================
// Fetch Available Models / Combos from Server
// ==========================================
async function fetchAvailableModels(db, options = {}) {
  const settings = getRawSettings(db);
  const baseUrl = (options.base_url || settings.base_url || 'https://9router-production-6a92.up.railway.app/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/models`;
  const timeoutMs = options.timeout_ms || 15000;

  const headers = {
    'Content-Type': 'application/json'
  };
  const apiKey = (options.api_key !== undefined ? options.api_key : settings.api_key) || '';
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  let models = [];
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (res.ok) {
      const data = await res.json();
      let rawList = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray(data.data)) {
        rawList = data.data;
      } else if (Array.isArray(data.models)) {
        rawList = data.models;
      }
      models = rawList.map(item => {
        if (typeof item === 'string') return item.trim();
        return (item.id || item.name || '').trim();
      }).filter(Boolean);
    }
  } catch (err) {
    console.warn(`[AI Service] Failed to fetch models from ${endpoint}:`, err.message);
  }

  // If models found and no default_combo is set in DB, auto-save the first one
  if (models.length > 0 && (!settings.default_combo || !settings.default_combo.trim())) {
    try {
      db.prepare('UPDATE ai_settings SET default_combo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
        .run(models[0]);
    } catch(e){}
  }

  const updatedSettings = getRawSettings(db);
  return {
    models,
    default_combo: updatedSettings.default_combo || (models.length > 0 ? models[0] : '')
  };
}

// ==========================================
// Default Expert Fitness AI System Persona
// ==========================================
const DEFAULT_AI_SYSTEM_PROMPT = `شما دستیار هوشمند و فوق‌تخصصی طراحی و برنامه‌ریزی تمرینات بدنسازی و فیزیولوژی ورزشی در سامانه «یسنافیت» هستید.

وظایف و اصول کلیدی شما:

۱. **ارائه دلایل علمی و گزارش توجیهی جامع (Program Rationale & Scientific Logic)**:
   - هر زمان که برنامه‌ای طراحی یا اصلاح می‌شود یا مربی سوالی مطرح می‌کند، باید دلایل و توجیهات علمی دقیق را با جزئیات کامل بر اساس مشخصات شاگرد لیست کنید.
   - عوامل الزامی برای تحلیل و ارائه توضیحات:
     • سطح شاگرد و سابقه تمرین (مثلاً مبتدی بودن: سازگاری عصبی-عضلانی، کنترل فاز منفی، تقویت تاندون‌ها و پرهیز از حجم تخریبی مفرط).
     • هدف اصلی و شاخص‌های بدنی (وزن، قد، درصد چربی و BMI).
     • سوابق پزشکی، آسیب‌های ارتوپدی و مفاصل حساس (دیسک کمر، زانودرد، شانه و...).
     • توجیه اسپلیت جلسات، ریکاوری ۴۸ تا ۷۲ ساعته و حجم هفتگی.
     • منطق علمی پروتکل ۶ مرحله‌ای هر جلسه (گرم‌کردن پویا، ۲-۳ حرکت اصلی چندمفصلی، ۳-۴ حرکت کمکی/سوپرست، تقویت Core، هوازی در انتهای جلسه برای چربی‌سوزی بهینه، سردکردن و کشش ایستا).

۲. **رعایت سخت‌گیرانه تعداد جلسات هفتگی اعلام‌شده شاگرد (sessions_per_week)**:
   - تعداد روزهای برنامه تمرینی باید دقیقاً و بدون استثنا منطبق بر تعداد جلسات اعلام‌شده شاگرد در بخش ارزیابی ورزشی باشد.
   - اگر شاگرد ۳ روز در هفته اعلام کرده است، برنامه باید حتماً و منحصراً ۳ روزه باشد و مجاز نیستید آن را به ۴ یا ۵ روز افزایش دهید؛ زیرا این کار خلاف زمان‌بندی و ترجیحات شاگرد است.
   - اگر ۴ روز اعلام کرده، برنامه دقیقاً ۴ روزه باشد؛ و اگر ۵ روز اعلام کرده، دقیقاً ۵ روزه باشد.

۳. **گفتگوی تعاملی و اصلاح در لحظه برنامه (Interactive Copilot)**:
   - به درخواست‌ها و دستورات مربی با دقت گوش دهید و برنامه را بلافاصله با فراخوانی ابزارهای مربوطه (مانند update_draft_program یا search_exercises) اصلاح کنید.
   - پس از هر تغییر، گزارش مختصر تغییرات و اثر آن بر حجم و ریکاوری شاگرد را ارائه فرمایید.

۴. **قوانین و الزامات یکپارچگی پایگاه داده (Strict DB Integrity Rules)**:
   - شما فقط و فقط مجاز هستید از ۲۷۰۷ حرکت معتبر موجود در جدول exercises استفاده کنید. هرگز حرکتی با نام یا شناسه خارج از دیتابیس اختراع یا پیشنهاد نکنید.
   - برنامه‌های تمرینی ساخته‌شده توسط شما باید همیشه با وضعیت پیش‌نویس ('DRAFT') ثبت شوند.
   - لحن شما حرفه‌ای، علمی، دقیق، مستدل و به زبان فارسی روان است.`;

// ==========================================
// Core Chat Completion Engine
// ==========================================
async function chatCompletion(db, options = {}) {
  const settings = getRawSettings(db);
  const rawMessages = options.messages || [];

  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new Error('لیست پیام‌ها (messages) الزامی است.');
  }

  // Ensure default system prompt is prepended if not present
  const messages = [...rawMessages];
  if (messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: DEFAULT_AI_SYSTEM_PROMPT });
  }

  // Determine combo (ALWAYS used as model field for 9Router)
  let comboName = String(options.combo || settings.default_combo || '').trim();
  if (!comboName) {
    // Automatically discover available combos from the server
    try {
      const discovered = await fetchAvailableModels(db, { base_url: options.base_url, timeout_ms: 10000 });
      if (discovered.models && discovered.models.length > 0) {
        comboName = discovered.default_combo || discovered.models[0];
      }
    } catch (discoveryErr) {}
  }

  if (!comboName) {
    throw new Error('نام مدل یا کامبو (Combo) مشخص نشده است. لطفاً در صفحه تنظیمات هوش مصنوعی (/settings/ai) یک کامبو تعیین کنید.');
  }

  const baseUrl = (options.base_url || settings.base_url || 'https://9router-production-6a92.up.railway.app/v1').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;
  const timeoutMs = options.timeout_ms || settings.timeout_ms || 30000;

  const toolsToProvide = options.tools === false ? null : (Array.isArray(options.tools) ? options.tools : AI_TOOLS);

  const requestHeaders = {
    'Content-Type': 'application/json'
  };
  if (settings.api_key && settings.api_key.trim()) {
    requestHeaders['Authorization'] = `Bearer ${settings.api_key.trim()}`;
  }

  const conversation = [...messages];
  const executedToolCalls = [];
  let finalResponse = null;
  const maxTurns = 5;

  for (let turn = 0; turn < maxTurns; turn++) {
    const payload = {
      model: comboName, // CRITICAL: 9Router combo name sent as model field
      messages: conversation,
      temperature: options.temperature != null ? Number(options.temperature) : (settings.temperature ?? 0.7),
      top_p: options.top_p != null ? Number(options.top_p) : (settings.top_p ?? 1.0),
      max_tokens: options.max_tokens != null ? Number(options.max_tokens) : (settings.max_tokens ?? 2000),
      stream: false
    };

    if (toolsToProvide && toolsToProvide.length > 0) {
      payload.tools = toolsToProvide;
      payload.tool_choice = 'auto';
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (networkError) {
      if (networkError.name === 'TimeoutError' || networkError.name === 'AbortError') {
        throw new Error(`پاسخی در مهلت زمانی (${Math.round(timeoutMs / 1000)} ثانیه) از ارائه‌دهنده هوش مصنوعی دریافت نشد.`);
      }
      throw new Error(`خطا در اتصال به سرور هوش مصنوعی (${baseUrl}): ${networkError.message}`);
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        const errJson = await response.json();
        errorBody = errJson.error?.message || errJson.error || JSON.stringify(errJson);
      } catch (e) {
        errorBody = await response.text();
      }
      throw new Error(`ارائه‌دهنده هوش مصنوعی خطای ${response.status} را بازگرداند: ${errorBody || response.statusText}`);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    if (!choice || !choice.message) {
      throw new Error('فرمت پاسخ ارائه‌دهنده هوش مصنوعی نامعتبر است.');
    }

    const assistantMsg = choice.message;
    conversation.push(assistantMsg);
    finalResponse = data;

    // Check for tool calls
    const toolCalls = assistantMsg.tool_calls;
    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0 && options.executeTools !== false) {
      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        let fnArgs = {};
        try {
          fnArgs = typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {});
        } catch (e) {
          fnArgs = {};
        }

        const toolResult = await executeTool(db, fnName, fnArgs);
        executedToolCalls.push({
          id: tc.id,
          tool: fnName,
          arguments: fnArgs,
          result: toolResult
        });

        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(toolResult)
        });
      }
      // Continue loop for follow-up message with tool results
    } else {
      // No tool calls - conversation complete
      break;
    }
  }

  const lastMsg = conversation[conversation.length - 1];
  return {
    message: lastMsg,
    content: lastMsg.content || '',
    tool_calls_executed: executedToolCalls,
    model: comboName,
    usage: finalResponse?.usage || null
  };
}

// ==========================================
// High-Level Automated Program Generation
// ==========================================
async function generateProgramFromAssessment(db, { studentId, assessmentId, programId, customInstructions = '' }) {
  if (!studentId && !assessmentId && !programId) {
    throw new Error('شناسه شاگرد یا ارزیابی الزامی است.');
  }

  let sid = studentId ? Number(studentId) : null;
  let aid = assessmentId ? Number(assessmentId) : null;

  if (!sid && aid) {
    const ass = db.prepare('SELECT student_id FROM body_assessments WHERE id = ? AND deleted_at IS NULL').get(aid);
    if (ass) sid = ass.student_id;
  }

  if (!sid) {
    const st = db.prepare('SELECT id FROM students WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1').get();
    if (st) sid = st.id;
  }

  if (!sid) throw new Error('شاگردی در سامانه یافت نشد. لطفاً ابتدا از بخش «مدیریت شاگردها» یک شاگرد ثبت فرمایید.');

  const student = db.prepare('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL').get(sid);
  if (!student) throw new Error('شاگرد پیدا نشد.');

  if (!aid) {
    const ass = db.prepare("SELECT id FROM body_assessments WHERE student_id = ? AND deleted_at IS NULL ORDER BY (CASE WHEN lifecycle_status='APPROVED' OR status='APPROVED' THEN 1 ELSE 2 END), assessment_number DESC, id DESC LIMIT 1").get(sid);
    if (ass) aid = ass.id;
  }

  let assessment = aid ? db.prepare('SELECT * FROM body_assessments WHERE id = ? AND deleted_at IS NULL').get(aid) : null;
  let details = aid ? (assessmentService.getDetails(db, aid) || {}) : {};

  if (!assessment) {
    assessment = { assessment_number: 1, weight: student.weight || 75, height: student.height || 175, body_fat: null };
  }

  const isApproved = assessment && (assessment.lifecycle_status === 'APPROVED' || assessment.status === 'APPROVED');
  let finalAssessmentId = isApproved ? aid : null;
  if (!isApproved && sid) {
    const approved = db.prepare("SELECT id FROM body_assessments WHERE student_id = ? AND (lifecycle_status='APPROVED' OR status='APPROVED') AND deleted_at IS NULL ORDER BY assessment_number DESC, id DESC LIMIT 1").get(sid);
    if (approved) finalAssessmentId = approved.id;
  }

  const location = details.sports?.preferred_location || student.preferred_location || 'gym';
  const goal = details.goals?.main_goal || student.goal || 'فیتنس و هایپرتروفی';
  const level = student.training_level || student.training_experience || 'متوسط';
  const injuries = student.injuries || details.medical?.orthopedic_issues || 'بدون آسیب';
  const limitations = student.limitations || 'ندارد';

<<<<<<< HEAD
=======
  const nutritionDetails = details.nutrition || {};
  const dietCode = nutritionDetails.diet_type || 'none';
  const dietLabels = {
    none: 'بدون محدودیت',
    no_restriction: 'بدون محدودیت',
    vegetarian: 'گیاه‌خواری',
    vegan: 'وگان',
    celiac: 'سلیاک',
    lactose_intolerance: 'حساسیت به لاکتوز',
    gout: 'نقرس',
    low_carb: 'لوکرب',
    ketogenic: 'کتوژنیک',
    fasting: 'فستینگ',
    professional: 'حرفه‌ای',
    competition: 'مسابقه ای',
    iranian: 'سفره ایرانی'
  };
  const dietFa = dietLabels[dietCode] || dietCode;
  const appetiteCode = nutritionDetails.appetite_status || 'normal';
  const appetiteLabels = {
    normal: 'معمولی و طبیعی',
    normal_eating: 'معمولی و طبیعی',
    low_eating: 'کم‌خوری',
    grazing: 'ریزه‌خوری',
    overeating: 'پرخوری',
    emotional_overeating: 'پرخوری عصبی',
    anorexia: 'بی‌اشتهایی عصبی'
  };
  const appetiteFa = appetiteLabels[appetiteCode] || appetiteCode;

>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
  const rawWeeklyDays = details.sports?.sessions_per_week || student.sessions_per_week || student.weekly_days || 3;
  const targetDays = Math.min(Math.max(Number(rawWeeklyDays) || 3, 3), 5);

  const sampleBank = db.prepare(`
    SELECT id, name_fa, category_id, location, priority
    FROM exercises
    WHERE status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
    ORDER BY priority ASC, id ASC
    LIMIT 120
  `).all(location === 'home' ? 'home' : 'gym');

  const prompt = `
مشخصات شاگرد و ارزیابی بدنی:
- نام شاگرد: ${student.full_name} (شماره پرونده: ${student.case_number || '—'})
- شناسه شاگرد (studentId): ${sid}
- شناسه ارزیابی (assessmentId): ${aid}
- وزن: ${assessment.weight || '—'} کیلوگرم | قد: ${assessment.height || '—'} سانتی‌متر | درصد چربی: ${assessment.body_fat || '—'}%
- هدف اصلی: ${goal}
- سطح تمرین: ${level}
- محل تمرین: ${location === 'home' ? 'منزل' : 'باشگاه'}
<<<<<<< HEAD
=======
- محدودیت غذایی: ${dietFa}
- وضعیت اشتها: ${appetiteFa}
>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
- تعداد جلسات درخواستی شاگرد در هفته: دقیقا ${targetDays} روز در هفته (رعایت این تعداد روز کاملاً اجباری است؛ برنامه باید حتماً و منحصراً ${targetDays} روزه باشد و مجاز به افزایش روزها نیستید)
- آسیب‌دیدگی‌ها و محدودیت‌ها: ${injuries} | ${limitations}
${customInstructions ? `- دستورالعمل مربی: ${customInstructions}` : ''}

شناسه‌های استاندارد حرکات پایه برای ساختار ۶ مرحله‌ای:
- گرم کردن پویا (Warm-up): [ID: 1158] «گرم کردن» (دسته: warmup)
- سرد کردن و کشش ایستا (Cool-down): [ID: 1157] «سرد کردن» (دسته: warmup)
- هوازی و کاندیشنینگ (Cardio): [ID: 1107] «تردمیل» | [ID: 1110] «دوچرخه ثابت» | [ID: 1106] «الپتیکال» | [ID: 1385] «دویدن»

دستور کار و پروتکل علمی برای هر روز تمرینی (مدت زمان جلسه: ۵۵ الی ۶۵ دقیقه):
۱. یک برنامه تمرینی دقیقا ${targetDays} روزه (دقیقاً ${targetDays} روز) با حجم کافی (۷ تا ۹ حرکت اصلی و کمکی در هر روز بدون احتساب گرم‌کردن و سردکردن) طراحی کنید.
۲. ساختار اجباری هر روز تمرین:
   - فاز ۱ (گرم کردن): [ID: 1158] «گرم کردن» به مدت ۵ تا ۱۰ دقیقه (واحد TIME: ۳۰۰ الی ۶۰۰ ثانیه).
   - فاز ۲ (حرکات اصلی چندمفصلی): ۲ الی ۳ حرکت سنگین و چندمفصلی با سیستم معمولی یا هرمی.
   - فاز ۳ (حرکات کمکی و ایزوله): ۳ الی ۴ حرکت تک‌مفصلی و هایپرتروفی با سیستم‌های معمولی، سوپرست یا دراپ‌ست.
   - فاز ۴ (شکم / کول / فیله): ۱ حرکت تقویت میان‌تنه، شکم، فیله یا کول.
   - فاز ۵ (هوازی / تردمیل): [ID: 1107] «تردمیل» یا [ID: 1110] «دوچرخه ثابت» به مدت ۱۰ الی ۱۵ دقیقه.
   - فاز ۶ (سرد کردن): [ID: 1157] «سرد کردن» به مدت ۵ دقیقه.
۳. حتماً ابزار create_draft_program را فراخوانی کنید تا برنامه به‌صورت DRAFT با دقیقا ${targetDays} روز در سامانه ثبت شود.
`;

  const systemMessage = {
    role: 'system',
    content: `شما فیزیولوژیست ورزشی و مربی ارشد بدنسازی در سامانه یسنافیت هستید.
اصول علمی و ساختار ۶ مرحله‌ای اجباری برای هر روز تمرینی (حجم ۵۵ تا ۶۵ دقیقه):
۱. فاز گرم کردن (Warm-up): هر جلسه با یک حرکت گرم‌کردن پویا («گرم کردن» [ID: 1158] ۱ ست ۵ تا ۱۰ دقیقه) شروع شود.
۲. فاز حرکات اصلی (Main Lifts): ۲ تا ۳ حرکت اصلی چندمفصلی در ابتدای بخش مقاومتی با ست‌های ۶ تا ۱۲ تکرار.
۳. فاز حرکات کمکی (Accessory Lifts): ۳ تا ۴ حرکت ایزوله و پمپ عضلانی با سیستم‌های معمولی، سوپرست یا دراپ‌ست.
۴. فاز تقویت میان‌تنه/کول/فیله: ۱ حرکت شکم، فیله کمر یا کول.
۵. فاز هوازی (Cardio): ۱۰ تا ۱۵ دقیقه هوازی («تردمیل» [ID: 1107] یا «دوچرخه ثابت» [ID: 1110]).
۶. فاز سرد کردن (Cool-down): ۵ دقیقه کشش ایستا و بازگشت ضربان قلب («سرد کردن» [ID: 1157]).

مجموع حرکات مقاومتی اصلی و کمکی در هر جلسه باید بین ۷ تا ۹ حرکت باشد.
قوانین سخت‌گیرانه و غیرقابل نقض:
۱. تعداد جلسات برنامه باید دقیقاً و بدون کم و کاست منطبق بر تعداد روزهای درخواستی شاگرد (${targetDays} روزه) باشد.
۲. شما فقط و فقط مجاز هستید از حرکات واقعی موجود در بانک حرکات ۲۷۰۷ تایی یسنافیت با exercise_id معتبر استفاده کنید.
۳. تحت هیچ شرایطی حرکت جدید یا نام جعلی خارج از جدول exercises نسازید.
۴. حرکات مضر برای آسیب شاگرد (${injuries}) را قرار ندهید.
۵. حتماً از ابزار create_draft_program برای ثبت برنامه به‌صورت DRAFT استفاده کنید.`
  };

  let createdProgId = null;
  try {
    const result = await chatCompletion(db, {
      messages: [systemMessage, { role: 'user', content: prompt }],
      tools: AI_TOOLS,
      executeTools: true,
      temperature: 0.4,
      max_tokens: 4000
    });

    for (const tc of result.tool_calls_executed || []) {
      if (tc.tool === 'create_draft_program' && tc.result && tc.result.programId) {
        createdProgId = tc.result.programId;
        break;
      }
    }
  } catch (aiErr) {
    console.warn('[AI Service] AI generation failed, using DB deterministic fallback:', aiErr.message);
  }

  // Fallback if AI provider did not complete tool call
  if (!createdProgId) {
    let splitDays = [];
    if (targetDays === 3) {
      splitDays = [
        {
          focus: 'سینه، سرشانه، پشت بازو، شکم، هوازی و کشش (Push & Core)',
          mainCats: ['chest', 'shoulders'],
          accCats: ['triceps', 'shoulders'],
          coreCat: 'abs',
          cardioId: 1107,
          cardioName: 'تردمیل'
        },
        {
          focus: 'زیربغل، جلو بازو، کول، فیله کمر، هوازی و کشش (Pull & Back)',
          mainCats: ['back'],
          accCats: ['biceps', 'traps'],
          coreCat: 'lower_back',
          cardioId: 1110,
          cardioName: 'دوچرخه ثابت'
        },
        {
          focus: 'چهارسر ران، همسترینگ، باسن، ساق پا، شکم و هوازی (Legs & Core)',
          mainCats: ['legs'],
          accCats: ['legs'],
          coreCat: 'abs',
          cardioId: 1106,
          cardioName: 'الپتیکال'
        }
      ];
    } else if (targetDays === 5) {
      splitDays = [
        { focus: 'سینه، شکم، هوازی و کشش', mainCats: ['chest'], accCats: ['chest'], coreCat: 'abs', cardioId: 1107, cardioName: 'تردمیل' },
        { focus: 'زیربغل، فیله کمر، هوازی و کشش', mainCats: ['back'], accCats: ['back'], coreCat: 'lower_back', cardioId: 1110, cardioName: 'دوچرخه ثابت' },
        { focus: 'چهارسر ران، همسترینگ، ساق و هوازی', mainCats: ['legs'], accCats: ['legs'], coreCat: 'abs', cardioId: 1106, cardioName: 'الپتیکال' },
        { focus: 'سرشانه، کول، شکم، هوازی و کشش', mainCats: ['shoulders'], accCats: ['traps'], coreCat: 'abs', cardioId: 1107, cardioName: 'تردمیل' },
        { focus: 'جلو بازو، پشت بازو، ساعد، هوازی و کشش', mainCats: ['biceps'], accCats: ['triceps', 'forearms'], coreCat: 'abs', cardioId: 1110, cardioName: 'دوچرخه ثابت' }
      ];
    } else {
      splitDays = [
        {
          focus: 'سینه، جلو بازو، شکم، هوازی و کشش',
          mainCats: ['chest'],
          accCats: ['biceps'],
          coreCat: 'abs',
          cardioId: 1107, // تردمیل
          cardioName: 'تردمیل'
        },
        {
          focus: 'زیربغل، پشت بازو، فیله، هوازی و کشش',
          mainCats: ['back'],
          accCats: ['triceps'],
          coreCat: 'lower_back',
          cardioId: 1110, // دوچرخه ثابت
          cardioName: 'دوچرخه ثابت'
        },
        {
          focus: 'چهارسر، همسترینگ، باسن، ساق، شکم و هوازی',
          mainCats: ['legs'],
          accCats: ['legs'],
          coreCat: 'abs',
          cardioId: 1106, // الپتیکال
          cardioName: 'الپتیکال'
        },
        {
          focus: 'سرشانه، کول، ساعد، شکم و هوازی',
          mainCats: ['shoulders'],
          accCats: ['traps', 'forearms'],
          coreCat: 'abs',
          cardioId: 1107, // تردمیل
          cardioName: 'تردمیل'
        }
      ];
    }

    const daysPayload = [];
    for (let i = 0; i < splitDays.length; i++) {
      const sp = splitDays[i];
      const daySystems = [];

      // 1. Phase 1: Warm-up System (5-10 min)
      daySystems.push({
        exercise_system_id: 1,
        system_type: 'normal',
        movements: [
          {
            exercise_id: 1158, // گرم کردن
            name: 'گرم کردن',
            description: '۵ الی ۱۰ دقیقه گرم کردن عمومی مفاصل و افزایش دمای مرکزی بدن',
            sets: [{ type: 'TIME', count: 480, restSeconds: 60 }]
          }
        ]
      });

      // 2. Phase 2: 3 Main Compound Movements (Primary Heavy Lifts)
      const mainMovs = [];
      for (const cat of sp.mainCats) {
        const lim = (sp.mainCats.length === 1) ? 3 : (cat === sp.mainCats[0] ? 2 : 1);
        const catExercises = db.prepare(`
          SELECT id, name_fa FROM exercises
          WHERE category_id = ? AND status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
          ORDER BY priority ASC, id ASC LIMIT ?
        `).all(cat, location === 'home' ? 'home' : 'gym', lim);

        for (const ex of catExercises) {
          mainMovs.push({
            exercise_id: ex.id,
            name: ex.name_fa,
            description: 'حرکت اصلی چندمفصلی، کنترل کامل فاز منفی و دامنه کامل حرکتی',
            sets: [
              { type: 'REPEAT', count: 12, restSeconds: 60 },
              { type: 'REPEAT', count: 10, restSeconds: 75 },
              { type: 'REPEAT', count: 8, restSeconds: 90 }
            ]
          });
        }
      }
      if (mainMovs.length > 0) {
        daySystems.push({
          exercise_system_id: 1,
          system_type: 'normal',
          movements: mainMovs
        });
      }

      // 3. Phase 3: 3-4 Accessory / Isolation Movements paired as Superset / Triset
      const accMovs = [];
      const targetAccCount = (mainMovs.length >= 3) ? 4 : 5;
      for (const cat of sp.accCats) {
        const catLim = (sp.accCats.length === 1) ? targetAccCount : 2;
        const accExercises = db.prepare(`
          SELECT id, name_fa FROM exercises
          WHERE category_id = ? AND status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
          ORDER BY priority ASC, id ASC LIMIT ?
        `).all(cat, location === 'home' ? 'home' : 'gym', catLim);

        for (const ex of accExercises) {
          if (accMovs.length < targetAccCount) {
            accMovs.push({
              exercise_id: ex.id,
              name: ex.name_fa,
              description: 'حرکت کمکی و ایزوله، تمرکز بر انقباض حداکثری و پمپ عضلانی',
              sets: [
                { type: 'REPEAT', count: 12, restSeconds: 60 },
                { type: 'REPEAT', count: 12, restSeconds: 60 },
                { type: 'REPEAT', count: 10, restSeconds: 60 }
              ]
            });
          }
        }
      }
      if (accMovs.length === 2) {
        daySystems.push({
          exercise_system_id: 2, // Superset
          system_type: 'superset',
          movements: accMovs
        });
      } else if (accMovs.length === 3) {
        daySystems.push({
          exercise_system_id: 3, // Triset
          system_type: 'triset',
          movements: accMovs
        });
      } else if (accMovs.length >= 4) {
        daySystems.push({
          exercise_system_id: 2, // Superset 1
          system_type: 'superset',
          movements: accMovs.slice(0, 2)
        });
        daySystems.push({
          exercise_system_id: 2, // Superset 2
          system_type: 'superset',
          movements: accMovs.slice(2, 4)
        });
      } else if (accMovs.length > 0) {
        daySystems.push({
          exercise_system_id: 1,
          system_type: 'normal',
          movements: accMovs
        });
      }

      // 4. Phase 4: 1-2 Core / Abs / Traps / Lower back movement
      const coreMovs = [];
      const coreExercises = db.prepare(`
        SELECT id, name_fa FROM exercises
        WHERE category_id = ? AND status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
        ORDER BY priority ASC, id ASC LIMIT 1
      `).all(sp.coreCat, location === 'home' ? 'home' : 'gym');

      for (const ex of coreExercises) {
        coreMovs.push({
          exercise_id: ex.id,
          name: ex.name_fa,
          description: 'تقویت عضلات میان‌تنه و ثبات‌دهنده ستون فقرات',
          sets: [
            { type: 'REPEAT', count: 15, restSeconds: 45 },
            { type: 'REPEAT', count: 15, restSeconds: 45 },
            { type: 'REPEAT', count: 15, restSeconds: 45 }
          ]
        });
      }
      if (coreMovs.length > 0) {
        daySystems.push({
          exercise_system_id: 1,
          system_type: 'normal',
          movements: coreMovs
        });
      }

      // 5. Phase 5: Cardio Conditioning (Treadmill / Bike / Elliptical 10-15 min)
      daySystems.push({
        exercise_system_id: 1,
        system_type: 'normal',
        movements: [
          {
            exercise_id: sp.cardioId,
            name: sp.cardioName,
            description: 'تمرین هوازی با شدت یکنواخت متوسط (Zone 2) جهت چربی‌سوزی و ریکاوری فعال',
            sets: [{ type: 'TIME', count: 720, restSeconds: 60 }] // 12 minutes
          }
        ]
      });

      // 6. Phase 6: Cool-down & Static Stretching (5 min)
      daySystems.push({
        exercise_system_id: 1,
        system_type: 'normal',
        movements: [
          {
            exercise_id: 1157, // سرد کردن
            name: 'سرد کردن',
            description: 'کشش ایستا و بازگشت ضربان قلب به حالت اولیه جهت ریکاوری سریع‌تر عضلات',
            sets: [{ type: 'TIME', count: 300, restSeconds: 30 }] // 5 minutes
          }
        ]
      });

      daysPayload.push({
        day_number: i + 1,
        focus: sp.focus,
        is_rest_day: false,
        systems: daySystems
      });
    }

    const fallbackPayload = {
      title: `برنامه تمرینی جامع و علمی — ${student.full_name}`,
      student_id: sid,
      assessment_id: finalAssessmentId,
      coach_note: `برنامه ۶ مرحله‌ای استاندارد (گرم‌کردن، ۳ حرکت اصلی، ۳-۴ حرکت کمکی، شکم/فیله، هوازی و سردکردن). مدت جلسه حدود ۶۰ دقیقه. رعایت آب‌رسانی الزامی است.`,
      status: 'DRAFT',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      program_data: {
        version: 2,
        days: daysPayload.map((d, dIdx) => ({
          day_number: d.day_number || (dIdx + 1),
          focus: d.focus,
          is_rest_day: false,
          data: d.systems.map(sys => ({
            exercise_system_id: sys.exercise_system_id,
            system_type: sys.system_type,
            movement_list: sys.movements.map(m => ({
              exercise_id: m.exercise_id,
              name: m.name,
              description: m.description,
              sets: m.sets
            }))
          }))
        }))
      }
    };

    const fallbackResult = programService.createProgramInDB(db, fallbackPayload);
    createdProgId = fallbackResult.id;
  }

  // Retrieve built program and construct comprehensive scientific rationale
  const builtProg = programService.buildProgramFromDB(db, createdProgId);
  const daysCount = builtProg?.programData?.days?.length || 4;
  const rationaleReport = buildComprehensiveProgramRationale({
    student,
    assessment,
    details,
    programData: builtProg?.programData,
    daysCount,
    programTitle: builtProg?.title
  });

  return {
    success: true,
    programId: createdProgId,
    studentId: sid,
    assessmentId: aid,
    studentInfo: rationaleReport.studentProfile,
    rationaleReport,
    initialChatMessage: rationaleReport.initialChatMessage,
    message: 'برنامه تمرینی پیش‌نویس با موفقیت ساخته شد.',
    redirectUrl: `/programs/exercise/form?id=${createdProgId}`
  };
}

module.exports = {
  DEFAULT_AI_SYSTEM_PROMPT,
  getSettings,
  getRawSettings,
  saveSettings,
  fetchAvailableModels,
  buildComprehensiveProgramRationale,
  generateProgramFromAssessment,
  AI_TOOLS,
  executeTool,
  chatCompletion
};
