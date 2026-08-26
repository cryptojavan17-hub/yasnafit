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
// Core Chat Completion Engine
// ==========================================
async function chatCompletion(db, options = {}) {
  const settings = getRawSettings(db);
  const messages = options.messages || [];

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('لیست پیام‌ها (messages) الزامی است.');
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

  if (!aid && sid) {
    const ass = db.prepare("SELECT id FROM body_assessments WHERE student_id = ? AND status IN ('APPROVED', 'SUBMITTED', 'PENDING_REVIEW') AND deleted_at IS NULL ORDER BY assessment_number DESC, id DESC LIMIT 1").get(sid);
    if (ass) aid = ass.id;
  }

  if (!sid) throw new Error('شاگرد پیدا نشد.');
  if (!aid) throw new Error('ارزیابی معتبری برای این شاگرد یافت نشد. ابتدا ارزیابی شاگرد را ثبت و تایید کنید.');

  const student = db.prepare('SELECT * FROM students WHERE id = ? AND deleted_at IS NULL').get(sid);
  if (!student) throw new Error('شاگرد پیدا نشد.');

  const assessment = db.prepare('SELECT * FROM body_assessments WHERE id = ? AND deleted_at IS NULL').get(aid);
  if (!assessment) throw new Error('ارزیابی پیدا نشد.');

  const isApproved = (assessment.lifecycle_status === 'APPROVED' || assessment.status === 'APPROVED');
  let finalAssessmentId = isApproved ? aid : null;
  if (!isApproved && sid) {
    const approved = db.prepare("SELECT id FROM body_assessments WHERE student_id = ? AND (lifecycle_status='APPROVED' OR status='APPROVED') AND deleted_at IS NULL ORDER BY assessment_number DESC, id DESC LIMIT 1").get(sid);
    if (approved) finalAssessmentId = approved.id;
  }

  const details = assessmentService.getDetails(db, aid) || {};

  const location = details.sports?.preferred_location || student.preferred_location || 'gym';
  const goal = details.goals?.main_goal || student.goal || 'فیتنس و هایپرتروفی';
  const level = student.training_level || student.training_experience || 'متوسط';
  const injuries = student.injuries || details.medical?.orthopedic_issues || 'بدون آسیب';
  const limitations = student.limitations || 'ندارد';

  const sampleBank = db.prepare(`
    SELECT id, name_fa, category_id, location, priority
    FROM exercises
    WHERE status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
    ORDER BY priority ASC, id ASC
    LIMIT 120
  `).all(location === 'home' ? 'home' : 'gym');

  const categories = db.prepare('SELECT id, name FROM exercise_categories WHERE deleted_at IS NULL ORDER BY sort_order').all();

  const prompt = `
مشخصات شاگرد و ارزیابی بدنی:
- نام شاگرد: ${student.full_name} (شماره پرونده: ${student.case_number || '—'})
- شناسه شاگرد (studentId): ${sid}
- شناسه ارزیابی (assessmentId): ${aid}
- وزن: ${assessment.weight || '—'} کیلوگرم | قد: ${assessment.height || '—'} سانتی‌متر | درصد چربی: ${assessment.body_fat || '—'}%
- هدف اصلی: ${goal}
- سطح تمرین: ${level}
- محل تمرین: ${location === 'home' ? 'منزل' : 'باشگاه'}
- آسیب‌دیدگی‌ها و محدودیت‌ها: ${injuries} | ${limitations}
${customInstructions ? `- دستورالعمل مربی: ${customInstructions}` : ''}

شناسه‌های استاندارد حرکات پایه برای ساختار ۶ مرحله‌ای:
- گرم کردن پویا (Warm-up): [ID: 1158] «گرم کردن» (دسته: warmup)
- سرد کردن و کشش ایستا (Cool-down): [ID: 1157] «سرد کردن» (دسته: warmup)
- هوازی و کاندیشنینگ (Cardio): [ID: 1107] «تردمیل» | [ID: 1110] «دوچرخه ثابت» | [ID: 1106] «الپتیکال» | [ID: 1385] «دویدن»

نمونه‌ای از حرکات قدرتی و هایپرتروفی معتبر بانک:
${sampleBank.slice(0, 50).map(e => `[ID:${e.id}] ${e.name_fa} (${e.category_id})`).join(' | ')}

دستور کار و پروتکل علمی برای هر روز تمرینی (مدت زمان جلسه: ۵۵ الی ۶۵ دقیقه):
۱. یک برنامه تمرینی ۳ الی ۴ روزه با حجم کافی (۷ تا ۹ حرکت اصلی و کمکی در هر روز بدون احتساب گرم‌کردن و سردکردن) طراحی کنید.
۲. ساختار اجباری هر روز تمرین:
   - فاز ۱ (گرم کردن): [ID: 1158] «گرم کردن» به مدت ۵ تا ۱۰ دقیقه (واحد TIME: ۳۰۰ الی ۶۰۰ ثانیه).
   - فاز ۲ (حرکات اصلی چندمفصلی): ۲ الی ۳ حرکت سنگین و چندمفصلی (پرس سینه، زیربغل، پرس پا، پرس سرشانه و...) با سیستم معمولی یا هرمی.
   - فاز ۳ (حرکات کمکی و ایزوله): ۳ الی ۴ حرکت تک‌مفصلی و هایپرتروفی (قفسه سینه، جلوبازو، پشت‌بازو، جلوپا، پشت‌پا، نشر جانب) با سیستم‌های معمولی، سوپرست یا دراپ‌ست.
   - فاز ۴ (شکم / کول / فیله): ۱ حرکت تقویت میان‌تنه، شکم، فیله یا کول.
   - فاز ۵ (هوازی / تردمیل): [ID: 1107] «تردمیل» یا [ID: 1110] «دوچرخه ثابت» به مدت ۱۰ الی ۱۵ دقیقه (واحد TIME: ۶۰۰ الی ۹۰۰ ثانیه).
   - فاز ۶ (سرد کردن): [ID: 1157] «سرد کردن» به مدت ۵ دقیقه (واحد TIME: ۳۰۰ ثانیه).
۳. حتماً ابزار create_draft_program را فراخوانی کنید تا برنامه به‌صورت DRAFT در سامانه ثبت شود.
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
۱. شما فقط و فقط مجاز هستید از حرکات واقعی موجود در بانک حرکات ۲۷۰۷ تایی یسنافیت با exercise_id معتبر استفاده کنید.
۲. تحت هیچ شرایطی حرکت جدید یا نام جعلی خارج از جدول exercises نسازید.
۳. حرکات مضر برای آسیب شاگرد (${injuries}) را قرار ندهید.
۴. حتماً از ابزار create_draft_program برای ثبت برنامه به‌صورت DRAFT استفاده کنید.`
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
    const splitDays = [
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
        const catExercises = db.prepare(`
          SELECT id, name_fa FROM exercises
          WHERE category_id = ? AND status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
          ORDER BY priority ASC, id ASC LIMIT 3
        `).all(cat, location === 'home' ? 'home' : 'gym');

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

      // 3. Phase 3: 3-4 Accessory / Isolation Movements
      const accMovs = [];
      const accLimitPerCat = sp.accCats.length === 1 ? 4 : 2;
      for (const cat of sp.accCats) {
        const accExercises = db.prepare(`
          SELECT id, name_fa FROM exercises
          WHERE category_id = ? AND status = 'active' AND deleted_at IS NULL AND (location = ? OR location = 'both')
          ORDER BY priority ASC, id ASC LIMIT ?
        `).all(cat, location === 'home' ? 'home' : 'gym', accLimitPerCat);

        for (const ex of accExercises) {
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
      if (accMovs.length > 0) {
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

  return {
    success: true,
    programId: createdProgId,
    studentId: sid,
    assessmentId: aid,
    message: 'برنامه تمرینی پیش‌نویس با موفقیت ساخته شد.',
    redirectUrl: `/programs/exercise/form?id=${createdProgId}`
  };
}

module.exports = {
  getSettings,
  getRawSettings,
  saveSettings,
  fetchAvailableModels,
  generateProgramFromAssessment,
  AI_TOOLS,
  executeTool,
  chatCompletion
};
