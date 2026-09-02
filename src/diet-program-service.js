'use strict';

const crypto = require('crypto');
const aiService = require('./ai-service');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

const DIET_RESTRICTIONS = {
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
  competition: 'مسابقه ای'
};

const DEFAULT_MEAL_PRESETS = {
  three_meals: [
    { meal_name: 'صبحانه', ratio: 0.30, start_time: '08:00', end_time: '08:30', notes: 'منابع غنی پروتئین و کربوهیدرات پیچیده' },
    { meal_name: 'ناهار', ratio: 0.40, start_time: '13:30', end_time: '14:30', notes: 'پروتئین کامل، غلات کامل و فیبر سبزیجات' },
    { meal_name: 'شام', ratio: 0.30, start_time: '20:00', end_time: '20:30', notes: 'پروتئین زودهضم و سالاد با روغن زیتون' }
  ],
  five_meals: [
    { meal_name: 'صبحانه', ratio: 0.25, start_time: '07:30', end_time: '08:00', notes: 'تخم مرغ، جو دوسر و میوه' },
    { meal_name: 'میان‌عده بین صبحانه و ناهار', ratio: 0.10, start_time: '10:30', end_time: '11:00', notes: 'مغزها، میوه یا میان‌وعده پروتئینی' },
    { meal_name: 'ناهار', ratio: 0.35, start_time: '13:30', end_time: '14:30', notes: 'مرغ/گوشت/ماهی به همراه برنج قهوه‌ای و سالاد' },
    { meal_name: 'میان‌وعده عصر ۱', ratio: 0.10, start_time: '17:00', end_time: '17:30', notes: 'ماست یونانی یا نان تست جو با کره بادام زمینی' },
    { meal_name: 'شام', ratio: 0.20, start_time: '20:30', end_time: '21:00', notes: 'سوپ، سبزیجات بخارپز و پروتئین کم‌چرب' }
  ],
  seven_meals: [
    { meal_name: 'صبحانه', ratio: 0.20, start_time: '07:00', end_time: '07:30', notes: 'صبحانه کامل پرپروتئین' },
    { meal_name: 'میان‌عده بین صبحانه و ناهار', ratio: 0.10, start_time: '10:00', end_time: '10:30', notes: 'میوه تازه و آجیل خام' },
    { meal_name: 'ناهار', ratio: 0.25, start_time: '13:00', end_time: '13:45', notes: 'وعده اصلی متوازن' },
    { meal_name: 'وعده قبل تمرین', ratio: 0.10, start_time: '16:30', end_time: '17:00', notes: 'کربوهیدرات زودجذب و پروتئین سبک' },
    { meal_name: 'وعده بعد تمرین', ratio: 0.15, start_time: '18:45', end_time: '19:15', notes: 'شیک پروتئین یا فیله مرغ با سیب‌زمینی' },
    { meal_name: 'شام', ratio: 0.15, start_time: '21:00', end_time: '21:30', notes: 'پروتئین با چربی‌های مفید' },
    { meal_name: 'وعده قبل از خواب', ratio: 0.05, start_time: '23:00', end_time: '23:30', notes: 'کازئین یا پنیر کاتیج برای ریکاوری شبانه' }
  ]
};

function createDietProgram(db, data = {}) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('عنوان برنامه غذایی الزامی است.');

  const totalCalories = Number(data.total_calories || data.totalCalories || 2000);
  if (!Number.isFinite(totalCalories) || totalCalories < 500 || totalCalories > 15000) {
    throw new Error('کالری کل برنامه باید عددی بین ۵۰۰ تا ۱۵,۰۰۰ باشد.');
  }

  const dietRestriction = String(data.diet_restriction || data.dietRestriction || 'none').trim();
  const description = String(data.description || '').trim();
  const studentId = data.student_id ? Number(data.student_id) : (data.studentId ? Number(data.studentId) : null);
  const isTemplate = studentId ? 0 : 1;
  const status = String(data.status || 'DRAFT').toUpperCase();

  const rawMeals = Array.isArray(data.meals) ? data.meals : [];
  if (rawMeals.length === 0) {
    throw new Error('حداقل یک وعده غذایی برای برنامه الزامی است.');
  }

  const meals = rawMeals.map((m, idx) => ({
    meal_name: String(m.meal_name || m.mealName || `وعده ${idx + 1}`).trim(),
    calories: Number(m.calories || 0),
    start_time: m.start_time || m.startTime || null,
    end_time: m.end_time || m.endTime || null,
    notes: String(m.notes || '').trim(),
    sort_order: m.sort_order ?? (idx + 1)
  }));

  const mealsCalorieSum = meals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
  if (mealsCalorieSum !== totalCalories) {
    const diff = Math.abs(totalCalories - mealsCalorieSum);
    throw new Error(`مجموع کالری وعده‌ها (${mealsCalorieSum.toLocaleString('fa-IR')}) با کالری انتخابی برنامه (${totalCalories.toLocaleString('fa-IR')}) برابر نیست (${diff.toLocaleString('fa-IR')} کالری اختلاف).`);
  }

  const stableId = uuid();
  db.exec('BEGIN');
  try {
    const insertProg = db.prepare(`
      INSERT INTO diet_programs (stable_id, student_id, title, diet_restriction, description, total_calories, is_template, status, program_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const progData = {
      title,
      total_calories: totalCalories,
      diet_restriction: dietRestriction,
      description,
      meals
    };

    const res = insertProg.run(
      stableId,
      studentId,
      title,
      dietRestriction,
      description,
      totalCalories,
      isTemplate,
      status,
      JSON.stringify(progData)
    );
    const progId = Number(res.lastInsertRowid);

    const insertMeal = db.prepare(`
      INSERT INTO diet_program_meals (stable_id, diet_program_id, meal_name, calories, start_time, end_time, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of meals) {
      insertMeal.run(
        uuid(),
        progId,
        m.meal_name,
        m.calories,
        m.start_time,
        m.end_time,
        m.notes,
        m.sort_order
      );
    }

    db.exec('COMMIT');
    return getDietProgram(db, progId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function updateDietProgram(db, id, data = {}) {
  const progId = Number(id);
  if (!progId) throw new Error('شناسه برنامه نامعتبر است.');

  const existing = db.prepare('SELECT * FROM diet_programs WHERE id = ? AND deleted_at IS NULL').get(progId);
  if (!existing) throw new Error('برنامه غذایی پیدا نشد.');

  const title = data.title !== undefined ? String(data.title).trim() : existing.title;
  if (!title) throw new Error('عنوان برنامه غذایی الزامی است.');

  const totalCalories = data.total_calories != null ? Number(data.total_calories) : existing.total_calories;
  if (!Number.isFinite(totalCalories) || totalCalories < 500 || totalCalories > 15000) {
    throw new Error('کالری کل برنامه باید عددی بین ۵۰۰ تا ۱۵,۰۰۰ باشد.');
  }

  const dietRestriction = data.diet_restriction !== undefined ? String(data.diet_restriction).trim() : existing.diet_restriction;
  const description = data.description !== undefined ? String(data.description).trim() : (existing.description || '');
  const studentId = data.student_id !== undefined ? (data.student_id ? Number(data.student_id) : null) : existing.student_id;
  const isTemplate = studentId ? 0 : (data.is_template !== undefined ? (data.is_template ? 1 : 0) : existing.is_template);
  const status = data.status !== undefined ? String(data.status).toUpperCase() : existing.status;

  let meals = [];
  if (Array.isArray(data.meals)) {
    meals = data.meals.map((m, idx) => ({
      meal_name: String(m.meal_name || m.mealName || `وعده ${idx + 1}`).trim(),
      calories: Number(m.calories || 0),
      start_time: m.start_time || m.startTime || null,
      end_time: m.end_time || m.endTime || null,
      notes: String(m.notes || '').trim(),
      sort_order: m.sort_order ?? (idx + 1)
    }));

    const mealsCalorieSum = meals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
    if (mealsCalorieSum !== totalCalories) {
      const diff = Math.abs(totalCalories - mealsCalorieSum);
      throw new Error(`مجموع کالری وعده‌ها (${mealsCalorieSum.toLocaleString('fa-IR')}) با کالری انتخابی برنامه (${totalCalories.toLocaleString('fa-IR')}) برابر نیست (${diff.toLocaleString('fa-IR')} کالری اختلاف).`);
    }
  }

  db.exec('BEGIN');
  try {
    const progData = {
      title,
      total_calories: totalCalories,
      diet_restriction: dietRestriction,
      description,
      meals: meals.length > 0 ? meals : undefined
    };

    db.prepare(`
      UPDATE diet_programs
      SET title = ?, diet_restriction = ?, description = ?, total_calories = ?, student_id = ?, is_template = ?, status = ?, program_data = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE id = ?
    `).run(
      title,
      dietRestriction,
      description,
      totalCalories,
      studentId,
      isTemplate,
      status,
      JSON.stringify(progData),
      progId
    );

    if (meals.length > 0) {
      db.prepare('DELETE FROM diet_program_meals WHERE diet_program_id = ?').run(progId);
      const insertMeal = db.prepare(`
        INSERT INTO diet_program_meals (stable_id, diet_program_id, meal_name, calories, start_time, end_time, notes, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of meals) {
        insertMeal.run(uuid(), progId, m.meal_name, m.calories, m.start_time, m.end_time, m.notes, m.sort_order);
      }
    }

    db.exec('COMMIT');
    return getDietProgram(db, progId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getDietProgram(db, id) {
  const progId = Number(id);
  if (!progId) return null;

  const prog = db.prepare(`
    SELECT dp.*, s.full_name as student_name, s.case_number as student_case_number
    FROM diet_programs dp
    LEFT JOIN students s ON s.id = dp.student_id
    WHERE dp.id = ? AND dp.deleted_at IS NULL
  `).get(progId);

  if (!prog) return null;

  const meals = db.prepare(`
    SELECT * FROM diet_program_meals
    WHERE diet_program_id = ? AND deleted_at IS NULL
    ORDER BY sort_order ASC, id ASC
  `).all(progId);

  try {
    prog.program_data = JSON.parse(prog.program_data || '{}');
  } catch (e) {
    prog.program_data = {};
  }
  prog.meals = meals;
  prog.meals_count = meals.length;
  prog.diet_restriction_fa = DIET_RESTRICTIONS[prog.diet_restriction] || prog.diet_restriction;

  return prog;
}

function listDietPrograms(db, filter = {}) {
  const { type = 'all', search = '', diet_restriction = '', student_id } = filter;
  let sql = `
    SELECT dp.*, s.full_name as student_name, s.case_number as student_case_number,
           (SELECT COUNT(*) FROM diet_program_meals dpm WHERE dpm.diet_program_id = dp.id AND dpm.deleted_at IS NULL) as meals_count
    FROM diet_programs dp
    LEFT JOIN students s ON s.id = dp.student_id
    WHERE dp.deleted_at IS NULL
  `;
  const params = [];

  if (type === 'template') {
    sql += ' AND (dp.is_template = 1 OR dp.student_id IS NULL)';
  } else if (type === 'student') {
    sql += ' AND dp.student_id IS NOT NULL';
  }

  if (student_id) {
    sql += ' AND dp.student_id = ?';
    params.push(Number(student_id));
  }

  if (diet_restriction && diet_restriction !== 'all') {
    sql += ' AND dp.diet_restriction = ?';
    params.push(diet_restriction);
  }

  if (search && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    sql += ' AND (dp.title LIKE ? OR dp.description LIKE ? OR s.full_name LIKE ? OR s.case_number LIKE ?)';
    params.push(term, term, term, term);
  }

  sql += ' ORDER BY dp.id DESC';
  const list = db.prepare(sql).all(...params);

  return list.map(item => {
    item.diet_restriction_fa = DIET_RESTRICTIONS[item.diet_restriction] || item.diet_restriction;
    try {
      item.program_data = JSON.parse(item.program_data || '{}');
    } catch (e) {
      item.program_data = {};
    }
    return item;
  });
}

function deleteDietProgram(db, id) {
  const progId = Number(id);
  if (!progId) throw new Error('شناسه برنامه نامعتبر است.');

  const res = db.prepare('UPDATE diet_programs SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(progId);
  if (!res.changes) throw new Error('برنامه پیدا نشد یا قبلاً حذف شده است.');
  return { success: true, id: progId, message: 'برنامه غذایی با موفقیت حذف شد.' };
}

// ==========================================
// AI Intelligent Diet Analysis Engine
// ==========================================
async function analyzeDietWithAI(db, dietData = {}) {
  const title = String(dietData.title || 'برنامه غذایی').trim();
  const totalCalories = Number(dietData.total_calories || dietData.totalCalories || 2000);
  const dietRestriction = String(dietData.diet_restriction || dietData.dietRestriction || 'none').trim();
  const restrictionFa = DIET_RESTRICTIONS[dietRestriction] || dietRestriction;
  const meals = Array.isArray(dietData.meals) ? dietData.meals : [];

  const mealsSummary = meals.map((m, idx) => {
    const timeStr = m.start_time ? ` (ساعت ${m.start_time}${m.end_time ? ' تا ' + m.end_time : ''})` : '';
    const noteStr = m.notes ? ` - جزئیات: ${m.notes}` : '';
    const percentage = totalCalories > 0 ? Math.round((Number(m.calories) / totalCalories) * 100) : 0;
    return `${idx + 1}. ${m.meal_name || 'وعده'}: ${Number(m.calories).toLocaleString('fa-IR')} کالری (${percentage}٪ کل)${timeStr}${noteStr}`;
  }).join('\n');

  // Macro Estimation Logic based on Diet Restriction
  let proteinRatio = 0.30;
  let carbRatio = 0.45;
  let fatRatio = 0.25;

  if (dietRestriction === 'ketogenic') {
    proteinRatio = 0.25;
    carbRatio = 0.05;
    fatRatio = 0.70;
  } else if (dietRestriction === 'low_carb') {
    proteinRatio = 0.35;
    carbRatio = 0.25;
    fatRatio = 0.40;
  } else if (dietRestriction === 'competition') {
    proteinRatio = 0.40;
    carbRatio = 0.40;
    fatRatio = 0.20;
  } else if (dietRestriction === 'vegetarian' || dietRestriction === 'vegan') {
    proteinRatio = 0.25;
    carbRatio = 0.50;
    fatRatio = 0.25;
  } else if (dietRestriction === 'fasting') {
    proteinRatio = 0.30;
    carbRatio = 0.40;
    fatRatio = 0.30;
  }

  const proteinCals = Math.round(totalCalories * proteinRatio);
  const carbCals = Math.round(totalCalories * carbRatio);
  const fatCals = Math.round(totalCalories * fatRatio);

  const proteinGrams = Math.round(proteinCals / 4);
  const carbGrams = Math.round(carbCals / 4);
  const fatGrams = Math.round(fatCals / 9);

  // Deterministic Expert Nutrition Generator
  const deterministicReport = {
    title,
    restriction: restrictionFa,
    totalCalories,
    fitAnalysis: `ساختار ${meals.length} وعده‌ای با کالری کل ${totalCalories.toLocaleString('fa-IR')} کالری و الگوی «${restrictionFa}» بررسی شد. توزیع انرژی در طول روز تعادل متابولیک مناسبی ایجاد کرده و از افت ناگهانی قند خون و تخریب پروتئین عضلانی جلوگیری می‌کند.`,
    macros: {
      proteinPercent: Math.round(proteinRatio * 100),
      proteinGrams,
      carbPercent: Math.round(carbRatio * 100),
      carbGrams,
      fatPercent: Math.round(fatRatio * 100),
      fatGrams
    },
    mealIdeas: meals.map((m, idx) => {
      const cal = Number(m.calories) || 300;
      let idea = '';
      if (m.meal_name.includes('صبحانه')) {
        idea = dietRestriction === 'ketogenic'
          ? '۳ عدد تخم‌مرغ کامل نیمرو در روغن نارگیل + ۱/۲ آووکادو + اسفناج'
          : dietRestriction === 'vegan'
            ? 'اوتمیل با شیر بادام، بذر کتان، دانه چیا و توت‌فرنگی'
            : '۳ عدد سفیده + ۱ زرده تخم‌مرغ، ۵۰ گرم جو دوسر، ۱ لیوان شیر کم‌چرب و یک قاشق عسل';
      } else if (m.meal_name.includes('ناهار')) {
        idea = dietRestriction === 'ketogenic'
          ? '۱۸۰ گرم فیله سلمون گریل‌شده + سالاد سبز فراوان با روغن زیتون فرابکر'
          : dietRestriction === 'vegan'
            ? 'توفو تفت داده شده با کینوا، کلم بروکلی، قارچ و سس ارده'
            : '۱۵۰ گرم سینه مرغ یا فیله گوشت کم‌چرب + ۸۰ گرم برنج قهوه‌ای و سبزیجات بخارپز';
      } else if (m.meal_name.includes('شام')) {
        idea = dietRestriction === 'ketogenic'
          ? 'استیک فیله گوشت یا مرغ با کره حیوانی و بروکلی گریل'
          : '۱۲۰ گرم ماهی قزل‌آلا یا تن ماهی بدون روغن + سالاد کلم و لیموترش';
      } else if (m.meal_name.includes('قبل تمرین') || m.meal_name.includes('پیش')) {
        idea = '۱ عدد موز + ۳۰ گرم جو دوسر + قهوه تلخ جهت افزایش تمرکز و سوخت‌رسانی';
      } else if (m.meal_name.includes('بعد تمرین') || m.meal_name.includes('پس')) {
        idea = '۱ اسکوپ پروتئین وی (یا پروتئین ایزوله گیاهی) + ۱ عدد سیب یا نان برنجی';
      } else if (m.meal_name.includes('خواب')) {
        idea = '۱۵۰ گرم ماست یونانی یا پنیر کاتیج کم‌نمک جهت آزادسازی تدریجی اسیدهای آمینه در طول خواب';
      } else {
        idea = 'مشت کوچک بادام خام یا گردو + ۱ عدد سیب یا هویج ترد';
      }
      return {
        mealName: m.meal_name,
        calories: cal,
        suggestedFoods: idea
      };
    }),
    cautions: [
      'هیدراتاسیون: مصرف روزانه حداقل ۳ تا ۴ لیتر آب برای بهینه‌سازی فرآیندهای سنتز پروتئین و دفع اوره ضروری است.',
      meals.some(m => m.meal_name.includes('خواب') && Number(m.calories) > 300)
        ? 'هشدار کالری شبانه: کالری وعده قبل از خواب بیش از ۳۰۰ کالری است؛ بهتر است به زیر ۲۰۰ کالری کاهش یابد تا کیفیت خواب مختل نشود.'
        : 'زمان‌بندی مناسب: توزیع کالری در ساعات بیداری مانع از احساس گرسنگی مفرط شبانه می‌شود.',
      dietRestriction === 'celiac'
        ? 'ملاحظه سلیاک: تمام مکمل‌ها و چاشنی‌ها باید دارای برچسب رسمی Gluten-Free باشند.'
        : dietRestriction === 'lactose_intolerance'
          ? 'ملاحظه لاکتوز: از پروتئین وی ایزوله ۱۰۰٪ فاقد لاکتوز یا منابع گیاهی استفاده شود.'
          : 'تنوع ریزمغذی‌ها: مصرف مکمل مولتی‌ویتامین و امگا-۳ در کنار وعده‌ها توصیه می‌شود.'
    ]
  };

  // If 9Router / OpenAI is connected, enhance with LLM completion
  try {
    const prompt = `شما متخصص ارشد تغذیه و رژیم‌درمانی ورزشی در سامانه یسنافیت هستید.
برنامه غذایی زیر را با دقت و به زبان فارسی تحلیل کنید:
- عنوان برنامه: ${title}
- محدودیت غذایی: ${restrictionFa}
- مجموع کالری: ${totalCalories} کالری
- لیست وعده‌ها:
${mealsSummary}

لطفاً خروجی را با این ساختار تحلیل و ارائه دهید:
۱. بررسی تناسب ساختار وعده‌ها با محدودیت غذایی «${restrictionFa}»
۲. تخمین دقیق گرم و درصد درشت‌مغذی‌ها (پروتئین، کربوهیدرات، چربی)
۳. ارائه پیشنهادهای دقیق و لذیذ غذایی برای تک‌تک وعده‌ها
۴. نکات کلیدی و هشدارهای زمان‌بندی مصرف و آب‌رسانی`;

    const aiRes = await aiService.chatCompletion(db, {
      messages: [
        { role: 'system', content: 'شما متخصص ارشد تغذیه ورزشی و فیزیولوژی متابولیسم در سامانه یسنافیت هستید. پاسخ‌های دقیق، علمی، انطباقی و کاربردی به زبان فارسی بنویسید.' },
        { role: 'user', content: prompt }
      ],
      tools: false,
      temperature: 0.5,
      max_tokens: 2500
    });

    if (aiRes && aiRes.content && aiRes.content.trim()) {
      deterministicReport.aiContent = aiRes.content;
    }
  } catch (err) {
    console.warn('[Diet AI Analysis Fallback]', err.message);
  }

  return deterministicReport;
}

module.exports = {
  DIET_RESTRICTIONS,
  DEFAULT_MEAL_PRESETS,
  createDietProgram,
  updateDietProgram,
  getDietProgram,
  listDietPrograms,
  deleteDietProgram,
  analyzeDietWithAI
};
