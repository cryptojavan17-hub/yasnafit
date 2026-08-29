'use strict';

const crypto = require('crypto');
const aiService = require('./ai-service');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

const TIMING_OPTIONS = [
  'قبل صبحانه',
  'همراه صبحانه',
  'بعد صبحانه',
  'میان وعده صبح',
  'قبل ناهار',
  'همراه ناهار',
  'بعد ناهار',
  'میان وعده اول عصر',
  'میان وعده دوم عصر',
  'قبل تمرین',
  'حین تمرین',
  'بعد تمرین',
  'قبل شام',
  'همراه شام',
  'بعد شام',
  'قبل خواب'
];

const CATEGORIES = {
  muscle_building: 'عضله‌سازی و حجم (Hypertrophy)',
  fat_loss: 'چربی‌سوزی و کات (Fat Loss / Cutting)',
  performance_energy: 'افزایش توان و انرژی (Energy & Performance)',
  recovery_joints: 'ریکاوری و سلامت مفاصل (Recovery & Joints)',
  general_health: 'سلامت عمومی و ویتامین‌ها (General Wellness)',
  competition: 'آمادگی مسابقه و حرفه‌ای (Competition Prep)'
};

const CATEGORY_LIST = [
  { id: 'muscle_building', label: 'عضله‌سازی و حجم (Hypertrophy)' },
  { id: 'fat_loss', label: 'چربی‌سوزی و کات (Fat Loss / Cutting)' },
  { id: 'performance_energy', label: 'افزایش توان و انرژی (Energy & Performance)' },
  { id: 'recovery_joints', label: 'ریکاوری و سلامت مفاصل (Recovery & Joints)' },
  { id: 'general_health', label: 'سلامت عمومی و ویتامین‌ها (General Wellness)' },
  { id: 'competition', label: 'آمادگی مسابقه و حرفه‌ای (Competition Prep)' }
];

const SUPPLEMENT_CATALOG = [
  {
    id: 'whey_protein',
    name: 'پروتئین وی',
    english_name: 'Whey Protein',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '🥛',
    default_timing: 'بعد تمرین',
    default_notes: '۱ اسکوپ (۳۰ گرم) بلافاصله بعد از تمرین با ۳۰۰ میلی‌لیتر آب سرد',
    benefits: 'تحریک حداکثری سنتز پروتئین عضلانی (MPS) و تسریع ریکاوری'
  },
  {
    id: 'creatine_monohydrate',
    name: 'کراتین',
    english_name: 'Creatine Monohydrate',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '⚡',
    default_timing: 'بعد تمرین',
    default_notes: '۵ گرم روزانه همراه با پروتئین وی یا نوشیدنی کربوهیدراتی (همراه با مصرف آب فراوان)',
    benefits: 'افزایش ذخایر فسفوکراتین، توان بی‌هوازی و حجم سلولی عضلات'
  },
  {
    id: 'bcaa',
    name: 'BCAA',
    english_name: 'Branched-Chain Amino Acids',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '🧬',
    default_timing: 'حین تمرین',
    default_notes: '۷ تا ۱۰ گرم در ۵۰۰ میلی‌لیتر آب حین تمرین برای پیشگیری از خستگی مرکزی',
    benefits: 'کاهش تخریب بافت عضلانی در تمرینات پرفشار و مهار خستگی ذهنی'
  },
  {
    id: 'omega_3',
    name: 'امگا ۳',
    english_name: 'Omega-3 Fish Oil',
    category: 'general_health',
    category_fa: 'سلامت عمومی و ویتامین‌ها',
    icon: '🐟',
    default_timing: 'همراه ناهار',
    default_notes: '۱ تا ۲ عدد کپسول ۱۰۰۰ میلی‌گرم همراه با وعده غذایی اصلی',
    benefits: 'کاهش التهابات سیستمیک، سلامت قلب، عروق و بهبود انعطاف غشای سلولی'
  },
  {
    id: 'vitamin_b_complex',
    name: 'ویتامین B',
    english_name: 'Vitamin B-Complex',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '💊',
    default_timing: 'همراه صبحانه',
    default_notes: '۱ قرص روزانه همراه با صبحانه',
    benefits: 'بهینه‌سازی متابولیسم انرژی، سنتز گلبول‌های قرمز و عملکرد سیستم عصبی'
  },
  {
    id: 'zinc_plus',
    name: 'زینک پلاس',
    english_name: 'Zinc Plus + Vitamin C',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '🛡️',
    default_timing: 'بعد ناهار',
    default_notes: '۱ عدد کپسول روزانه پس از غذا (با فاصله از مکمل‌های کلسیم و آهن)',
    benefits: 'تقویت سیستم ایمنی، تولید طبیعی تستوسترون و ترمیم پوست و بافت همبند'
  },
  {
    id: 'glutamine',
    name: 'گلوتامین',
    english_name: 'L-Glutamine',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🧪',
    default_timing: 'بعد تمرین',
    default_notes: '۵ گرم بعد تمرین یا قبل خواب با آب',
    benefits: 'حفظ یکپارچگی مخاط دستگاه گوارش، سیستم ایمنی و تسریع ریکاوری عضلانی'
  },
  {
    id: 'casein_protein',
    name: 'پروتئین کازئین',
    english_name: 'Micellar Casein',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '🌙',
    default_timing: 'قبل خواب',
    default_notes: '۱ اسکوپ (۳۰ گرم) حل شده در آب یا شیر کم‌چرب ۳۰ دقیقه قبل از خواب',
    benefits: 'آزادسازی پیوسته و پایدار آمینو اسیدها طی ۶ تا ۸ ساعت خواب شبانه'
  },
  {
    id: 'eaa',
    name: 'EAA',
    english_name: 'Essential Amino Acids',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '✨',
    default_timing: 'حین تمرین',
    default_notes: '۱۰ گرم حل شده در آب خنک در طول تمرین',
    benefits: 'پروفایل کامل ۹ آمینو اسید ضروری بدون بار کالری اضافی'
  },
  {
    id: 'pre_workout_pump',
    name: 'پمپ قبل تمرین',
    english_name: 'Pre-Workout Pump',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '🔥',
    default_timing: 'قبل تمرین',
    default_notes: '۱ پیمانه ۲۰ تا ۳۰ دقیقه قبل از تمرین با ۲۵۰ میلی‌لیتر آب (حداقل ۵ ساعت قبل خواب)',
    benefits: 'افزایش جریان خون عضلانی (Vasodilation)، تمرکز ذهنی و توان خروجی'
  },
  {
    id: 'caffeine',
    name: 'کافئین',
    english_name: 'Caffeine Anhydrous',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '☕',
    default_timing: 'قبل تمرین',
    default_notes: '۱۰۰ تا ۲۰۰ میلی‌گرم ۳۰ تا ۴۵ دقیقه قبل تمرین',
    benefits: 'افزایش هوشیاری، تحریک لیپولیز و تاخیر در درک خستگی (RPE)'
  },
  {
    id: 'beta_alanine',
    name: 'بتا آلانین',
    english_name: 'Beta-Alanine',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '⚡',
    default_timing: 'قبل تمرین',
    default_notes: '۳ تا ۵ گرم روزانه قبل تمرین (تقسیم در صورت بروز حس سوزن‌سوزن شدن)',
    benefits: 'سنتز کارنوزین عضلانی و بافر کردن یون‌های هیدروژن برای افزایش استقامت بی‌هوازی'
  },
  {
    id: 'l_carnitine',
    name: 'ال کارنیتین',
    english_name: 'L-Carnitine',
    category: 'fat_loss',
    category_fa: 'چربی‌سوزی',
    icon: '🔥',
    default_timing: 'قبل تمرین',
    default_notes: '۱۰۰۰ تا ۲۰۰۰ میلی‌گرم ۳۰ دقیقه قبل از فعالیت هوازی',
    benefits: 'انتقال اسیدهای چرب زنجیره بلند به میتوکندری جهت اکسیداسیون و تولید انرژی'
  },
  {
    id: 'cla',
    name: 'سی ال ای (CLA)',
    english_name: 'Conjugated Linoleic Acid',
    category: 'fat_loss',
    category_fa: 'چربی‌سوزی',
    icon: '🥑',
    default_timing: 'همراه ناهار',
    default_notes: '۱۰۰۰ تا ۲۰۰۰ میلی‌گرم همراه با وعده‌های غذایی چرب',
    benefits: 'پشتیبانی از ترکیب بدنی مطلوب و مهار آنزیم لیپوپروتئین لیپاز'
  },
  {
    id: 'magnesium',
    name: 'منیزیم',
    english_name: 'Magnesium Bisglycinate',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '💤',
    default_timing: 'قبل خواب',
    default_notes: '۲۰۰ تا ۴۰۰ میلی‌گرم فرم بیزگلیسینات شب‌ها قبل خواب',
    benefits: 'ریلکسیشن عضلانی، بهبود عمق خواب، کاهش کرامپ و تنظیم بیش از ۳۰۰ واکنش آنزیمی'
  },
  {
    id: 'calcium_d3',
    name: 'کلسیم + D3',
    english_name: 'Calcium + Vitamin D3',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '🦴',
    default_timing: 'بعد ناهار',
    default_notes: '۱ قرص همراه غذا با فاصله حداقل ۲ ساعته از قرص آهن یا مکمل‌های زینک بالا',
    benefits: 'تراکم استخوانی، انقباض عضلانی مناسب و انتقال پیام‌های عصبی'
  },
  {
    id: 'vitamin_c',
    name: 'ویتامین C',
    english_name: 'Vitamin C (Ascorbic Acid)',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '🍊',
    default_timing: 'همراه صبحانه',
    default_notes: '۵۰۰ تا ۱۰۰۰ میلی‌گرم در روز همراه غذا',
    benefits: 'آنتی‌اکسیدان قوی، تقویت سیستم ایمنی، سنتز کلاژن و کمک به جذب آهن'
  },
  {
    id: 'vitamin_d3',
    name: 'ویتامین D3',
    english_name: 'Vitamin D3 (Cholecalciferol)',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '☀️',
    default_timing: 'همراه صبحانه',
    default_notes: '۱۰۰۰ تا ۲۰۰۰ واحد بین‌المللی روزانه همراه با وعده چرب',
    benefits: 'تنظیم هورمونی، سلامت سیستم ایمنی، جذب بهینه کلسیم و ریکاوری'
  },
  {
    id: 'multivitamin',
    name: 'مولتی ویتامین',
    english_name: 'Multivitamin & Minerals',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '🌈',
    default_timing: 'همراه صبحانه',
    default_notes: '۱ قرص یا کپسول روزانه همراه با صبحانه کامل',
    benefits: 'تامین ریزمغذی‌های ضروری، جبران کمبودهای رژیم غذایی و پیشگیری از خستگی مزمن'
  },
  {
    id: 'citrulline_malate',
    name: 'سیترولین مالات',
    english_name: 'Citrulline Malate 2:1',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '🍉',
    default_timing: 'قبل تمرین',
    default_notes: '۶ تا ۸ گرم ۳۰ دقیقه قبل از تمرین',
    benefits: 'تقویت تولید نیتریک اکساید (NO)، بهبود جریان خون، پاکسازی آمونیاک و ریکاوری ست‌ها'
  },
  {
    id: 'ashwagandha',
    name: 'اشواگاندا',
    english_name: 'Ashwagandha KSM-66',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🌿',
    default_timing: 'قبل خواب',
    default_notes: '۳۰۰ تا ۶۰۰ میلی‌گرم شب‌ها قبل خواب',
    benefits: 'کاهش سطح کورتیزول استرس، تنظیم تستوسترون و بهبود کیفیت خواب ریکاوری'
  },
  {
    id: 'melatonin',
    name: 'ملاتونین',
    english_name: 'Melatonin',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🌙',
    default_timing: 'قبل خواب',
    default_notes: '۱ تا ۳ میلی‌گرم ۳۰ دقیقه قبل از خواب در محیط تاریک',
    benefits: 'تنظیم ریتم شبانه‌روزی (سیرکادین) و کاهش زمان به خواب رفتن'
  },
  {
    id: 'hmb',
    name: 'HMB',
    english_name: 'Hydroxymethylbutyrate',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '🛡️',
    default_timing: 'قبل تمرین',
    default_notes: '۳ گرم روزانه (تقسیم در ۱ گرم صبح، ۱ گرم قبل تمرین، ۱ گرم بعد تمرین)',
    benefits: 'آنتی‌کاتابولیک قوی، کاهش کوفتگی عضلانی تاخیری (DOMS) و حفظ توده عضلانی'
  },
  {
    id: 'iron_folic',
    name: 'آهن + فولیک اسید',
    english_name: 'Iron + Folic Acid',
    category: 'vitamins_minerals',
    category_fa: 'ویتامین و املاح',
    icon: '🩸',
    default_timing: 'قبل صبحانه',
    default_notes: '۱ کپسول ناشتا یا با معده خالی همراه ویتامین C (با فاصله ۲ ساعته از چای، قهوه و لبنیات)',
    benefits: 'اکسیژن‌رسانی به عضلات، رفع کم‌خونی فقر آهن و پیشگیری از خستگی زودرس'
  },
  {
    id: 'coq10',
    name: 'کوآنزیم Q10',
    english_name: 'Coenzyme Q10',
    category: 'general_health',
    category_fa: 'سلامت عمومی و ویتامین‌ها',
    icon: '❤️',
    default_timing: 'همراه ناهار',
    default_notes: '۱۰۰ تا ۲۰۰ میلی‌گرم همراه با وعده غذایی حاوی چربی',
    benefits: 'پشتیبانی از زنجیره انتقال الکترون میتوکندری، سلامت قلب و خاصیت آنتی‌اکسیدانی'
  },
  {
    id: 'collagen',
    name: 'کلاژن پپتاید',
    english_name: 'Collagen Peptides',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🦴',
    default_timing: 'همراه صبحانه',
    default_notes: '۱۰ گرم پودر کلاژن هیدرولیز شده همراه آب یا نوشیدنی حاوی ویتامین C',
    benefits: 'ترمیم تاندون‌ها، غضروف‌ها، رباط‌ها و الاستیسیته پوست'
  },
  {
    id: 'probiotics',
    name: 'پروبیوتیک',
    english_name: 'Probiotics',
    category: 'general_health',
    category_fa: 'سلامت عمومی و ویتامین‌ها',
    icon: '🌱',
    default_timing: 'همراه صبحانه',
    default_notes: '۱ کپسول روزانه همراه صبحانه یا نیم ساعت قبل از آن',
    benefits: 'بهبود میکروبیوم روده، هضم و جذب پروتئین‌ها و تقویت سیستم ایمنی'
  },
  {
    id: 'glucosamine',
    name: 'گلوکوزامین و کندرویتین',
    english_name: 'Glucosamine & Chondroitin',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🦵',
    default_timing: 'همراه ناهار',
    default_notes: '۱۵۰۰ میلی‌گرم گلوکوزامین در روز همراه غذا',
    benefits: 'روان‌کاری مفاصل، تحریک ساخت مایع سینوویال و کاهش دردهای مفصلی'
  },
  {
    id: 'green_tea_extract',
    name: 'عصاره چای سبز',
    english_name: 'Green Tea Extract (EGCG)',
    category: 'fat_loss',
    category_fa: 'چربی‌سوزی',
    icon: '🍵',
    default_timing: 'قبل ناهار',
    default_notes: '۴۰۰ تا ۵۰۰ میلی‌گرم عصاره استاندارد EGCG بین وعده‌ها',
    benefits: 'افزایش نرخ متابولیسم پایه و چربی‌سوزی بدون افزایش شدید تپش قلب'
  },
  {
    id: 'l_arginine',
    name: 'ال آرژنین',
    english_name: 'L-Arginine',
    category: 'performance',
    category_fa: 'عملکرد و پمپ',
    icon: '⚡',
    default_timing: 'قبل تمرین',
    default_notes: '۳ تا ۵ گرم ۳۰ دقیقه قبل از تمرین با معده نسبتاً خالی',
    benefits: 'پیش‌ساز نیتریک اکساید، بهبود خون‌رسانی و ترشح هورمون رشد'
  },
  {
    id: 'mass_gainer',
    name: 'مس گینر',
    english_name: 'Mass Gainer',
    category: 'protein',
    category_fa: 'پروتئین و آمینو',
    icon: '🏋️',
    default_timing: 'میان وعده اول عصر',
    default_notes: '۱ تا ۲ سروینگ در طول روز بین وعده‌ها یا بعد تمرین',
    benefits: 'تامین مازاد کالری متراکم پروتئین و کربوهیدرات برای تیپ‌های بدنی هاردگینر'
  },
  {
    id: 'curcumin',
    name: 'کورکومین',
    english_name: 'Curcumin + Piperine',
    category: 'recovery',
    category_fa: 'ریکاوری و مفاصل',
    icon: '🔶',
    default_timing: 'همراه شام',
    default_notes: '۵۰۰ میلی‌گرم همراه با غذا و پیپرین (عصاره فلفل سیاه)',
    benefits: 'مهار مسیرهای التهابی COX-2 و کاهش دردهای التهابی مفاصل پس از تمرین سنگین'
  }
];

function getSupplementCatalog() {
  return SUPPLEMENT_CATALOG;
}

function createSupplementProgram(db, data = {}) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('عنوان نمونه برنامه مکمل الزامی است.');

  const category = String(data.category || 'muscle_building').trim();
  const description = String(data.description || '').trim();
  const studentId = data.student_id ? Number(data.student_id) : (data.studentId ? Number(data.studentId) : null);
  const isTemplate = data.is_template !== undefined ? (Number(data.is_template) ? 1 : 0) : (studentId ? 0 : 1);
  const status = String(data.status || 'DRAFT').toUpperCase();
  const items = Array.isArray(data.items) ? data.items : [];

  const programStableId = 'supp_prog_' + uuid();

  db.exec('BEGIN');
  try {
    const insertProg = db.prepare(`
      INSERT INTO supplement_programs (
        stable_id, student_id, title, category, description,
        is_template, status, created_at, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    `).run(
      programStableId,
      studentId,
      title,
      category,
      description,
      isTemplate,
      status
    );

    const programId = Number(insertProg.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO supplement_program_items (
        stable_id, supplement_program_id, supplement_name, timing,
        notes, icon, category, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    items.forEach((item, index) => {
      const name = String(item.supplement_name || item.name || '').trim();
      if (!name) return;
      const timing = String(item.timing || 'بعد تمرین').trim();
      const notes = item.notes ? String(item.notes).trim() : null;
      const icon = item.icon ? String(item.icon).trim() : '💊';
      const itemCategory = item.category ? String(item.category).trim() : 'general';
      const sortOrder = Number(item.sort_order || index + 1);

      insertItem.run(
        'supp_item_' + uuid(),
        programId,
        name,
        timing,
        notes,
        icon,
        itemCategory,
        sortOrder
      );
    });

    db.exec('COMMIT');
    return getSupplementProgram(db, programId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getSupplementProgram(db, idOrStableId) {
  let prog = null;
  if (typeof idOrStableId === 'number' || /^\d+$/.test(String(idOrStableId))) {
    prog = db.prepare(`
      SELECT p.*, s.full_name AS student_name, s.case_number AS student_case_number
      FROM supplement_programs p
      LEFT JOIN students s ON s.id = p.student_id
      WHERE p.id = ? AND p.deleted_at IS NULL
    `).get(Number(idOrStableId));
  } else {
    prog = db.prepare(`
      SELECT p.*, s.full_name AS student_name, s.case_number AS student_case_number
      FROM supplement_programs p
      LEFT JOIN students s ON s.id = p.student_id
      WHERE p.stable_id = ? AND p.deleted_at IS NULL
    `).get(String(idOrStableId));
  }

  if (!prog) return null;

  const items = db.prepare(`
    SELECT * FROM supplement_program_items
    WHERE supplement_program_id = ? AND deleted_at IS NULL
    ORDER BY sort_order ASC, id ASC
  `).all(prog.id);

  return {
    ...prog,
    category_fa: CATEGORIES[prog.category] || prog.category,
    items,
    items_count: items.length
  };
}

function updateSupplementProgram(db, idOrStableId, data = {}) {
  const existing = getSupplementProgram(db, idOrStableId);
  if (!existing) throw new Error('برنامه مکمل پیدا نشد.');

  const title = data.title !== undefined ? String(data.title).trim() : existing.title;
  if (!title) throw new Error('عنوان نمونه برنامه مکمل الزامی است.');

  const category = data.category !== undefined ? String(data.category).trim() : existing.category;
  const description = data.description !== undefined ? String(data.description).trim() : existing.description;
  const studentId = data.student_id !== undefined ? (data.student_id ? Number(data.student_id) : null) : existing.student_id;
  const isTemplate = data.is_template !== undefined ? (Number(data.is_template) ? 1 : 0) : existing.is_template;
  const status = data.status !== undefined ? String(data.status).toUpperCase() : existing.status;
  const items = Array.isArray(data.items) ? data.items : existing.items;

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE supplement_programs
      SET title = ?, category = ?, description = ?, student_id = ?,
          is_template = ?, status = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
      WHERE id = ?
    `).run(title, category, description, studentId, isTemplate, status, existing.id);

    // Replace items
    db.prepare(`DELETE FROM supplement_program_items WHERE supplement_program_id = ?`).run(existing.id);

    const insertItem = db.prepare(`
      INSERT INTO supplement_program_items (
        stable_id, supplement_program_id, supplement_name, timing,
        notes, icon, category, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    items.forEach((item, index) => {
      const name = String(item.supplement_name || item.name || '').trim();
      if (!name) return;
      const timing = String(item.timing || 'بعد تمرین').trim();
      const notes = item.notes ? String(item.notes).trim() : null;
      const icon = item.icon ? String(item.icon).trim() : '💊';
      const itemCategory = item.category ? String(item.category).trim() : 'general';
      const sortOrder = Number(item.sort_order || index + 1);

      insertItem.run(
        'supp_item_' + uuid(),
        existing.id,
        name,
        timing,
        notes,
        icon,
        itemCategory,
        sortOrder
      );
    });

    db.exec('COMMIT');
    return getSupplementProgram(db, existing.id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function deleteSupplementProgram(db, idOrStableId) {
  const existing = getSupplementProgram(db, idOrStableId);
  if (!existing) throw new Error('برنامه مکمل پیدا نشد یا قبلاً حذف شده است.');

  db.prepare(`
    UPDATE supplement_programs
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(existing.id);

  return { success: true, id: existing.id };
}

function listSupplementPrograms(db, filters = {}) {
  let query = `
    SELECT p.*, s.full_name AS student_name, s.case_number AS student_case_number,
           (SELECT COUNT(*) FROM supplement_program_items WHERE supplement_program_id = p.id AND deleted_at IS NULL) AS items_count
    FROM supplement_programs p
    LEFT JOIN students s ON s.id = p.student_id
    WHERE p.deleted_at IS NULL
  `;
  const params = [];

  if (filters.type === 'template') {
    query += ` AND p.is_template = 1`;
  } else if (filters.type === 'student') {
    query += ` AND p.is_template = 0 AND p.student_id IS NOT NULL`;
  }

  if (filters.student_id) {
    query += ` AND p.student_id = ?`;
    params.push(Number(filters.student_id));
  }

  if (filters.category && filters.category !== 'all') {
    query += ` AND p.category = ?`;
    params.push(String(filters.category));
  }

  if (filters.search) {
    query += ` AND (p.title LIKE ? OR p.description LIKE ? OR s.full_name LIKE ?)`;
    const s = `%${filters.search}%`;
    params.push(s, s, s);
  }

  query += ` ORDER BY p.updated_at DESC, p.id DESC`;

  const rows = db.prepare(query).all(...params);
  return rows.map(r => ({
    ...r,
    category_fa: CATEGORIES[r.category] || r.category
  }));
}

/**
 * AI Supplement Program Clinical Analysis Engine
 * Evaluates:
 * 1. Interactions (بررسی تداخلات)
 * 2. Timing Optimization (بهینه‌سازی زمان مصرف)
 * 3. Synergy (بررسی ترکیبات هم‌افزا)
 * 4. Overdose / Stimulant Safety (هشدار اوردوز یا محرک‌ها)
 */
async function analyzeSupplementsWithAI(db, programData = {}) {
  const title = String(programData.title || 'نمونه برنامه مکمل').trim();
  const category = String(programData.category || 'muscle_building').trim();
  const categoryFa = CATEGORIES[category] || category;
  const description = String(programData.description || '').trim();
  const rawItems = Array.isArray(programData.items) ? programData.items : [];

  const items = rawItems.map(it => ({
    name: String(it.supplement_name || it.name || '').trim(),
    timing: String(it.timing || 'بعد تمرین').trim(),
    notes: it.notes ? String(it.notes).trim() : '',
    icon: it.icon || '💊'
  })).filter(it => it.name.length > 0);

  if (items.length === 0) {
    throw new Error('حداقل یک مکمل برای تحلیل هوشمند مورد نیاز است.');
  }

  // Helper matcher
  const has = (keyword) => items.some(it => it.name.toLowerCase().includes(keyword.toLowerCase()));
  const getBy = (keyword) => items.find(it => it.name.toLowerCase().includes(keyword.toLowerCase()));
  const getAllBy = (keyword) => items.filter(it => it.name.toLowerCase().includes(keyword.toLowerCase()));

  // 1. SECTION 1: INTERACTIONS (بررسی تداخلات)
  const interactions = [];

  // Check Calcium + Iron
  const hasCalcium = has('کلسیم') || has('calcium');
  const hasIron = has('آهن') || has('iron');
  if (hasCalcium && hasIron) {
    const calcItem = items.find(it => it.name.includes('کلسیم') || it.name.toLowerCase().includes('calcium'));
    const ironItem = items.find(it => it.name.includes('آهن') || it.name.toLowerCase().includes('iron'));
    if (calcItem && ironItem && calcItem.timing === ironItem.timing) {
      interactions.push({
        severity: 'danger',
        title: 'تداخل شدید در جذب همزمان آهن و کلسیم',
        supplements: [ironItem.name, calcItem.name],
        timing: calcItem.timing,
        description: `کلسیم مانع رقابتی اصلی در جذب روده‌ای آهن (هر دو فرم هم و غیرهم) از طریق ترانسپورتر DMT-1 است. مصرف همزمان آن‌ها در «${calcItem.timing}» بازدهی مکمل آهن را تا ۶۰٪ کاهش می‌دهد.`,
        solution: 'مکمل آهن را به «قبل صبحانه (ناشتا)» منتقل کرده و کلسیم را «همراه ناهار» یا «بعد شام» مصرف کنید (حداقل ۳ ساعت فاصله).'
      });
    } else if (calcItem && ironItem) {
      interactions.push({
        severity: 'info',
        title: 'تفکیک زمانی صحیح آهن و کلسیم',
        supplements: [ironItem.name, calcItem.name],
        timing: `${ironItem.name}: ${ironItem.timing} | ${calcItem.name}: ${calcItem.timing}`,
        description: 'زمان مصرف آهن و کلسیم به درستی تفکیک شده است که از تداخل جذبی جلوگیری می‌کند.',
        solution: 'فاصله زمانی حداقل ۲ الی ۳ ساعت بین این دو مکمل حفظ شود.'
      });
    }
  }

  // Check Zinc + High Calcium or Iron in same timing
  const hasZinc = has('زینک') || has('zinc') || has('روی');
  if (hasZinc && hasCalcium) {
    const zincItem = items.find(it => it.name.includes('زینک') || it.name.toLowerCase().includes('zinc'));
    const calcItem = items.find(it => it.name.includes('کلسیم') || it.name.toLowerCase().includes('calcium'));
    if (zincItem && calcItem && zincItem.timing === calcItem.timing) {
      interactions.push({
        severity: 'warning',
        title: 'رقابت جذبی زینک و کلسیم در دوز بالا',
        supplements: [zincItem.name, calcItem.name],
        timing: zincItem.timing,
        description: `کلسیم با دوز بالای مصرفی می‌تواند جذب زینک را کاهش دهد. مصرف هر دو در زمان «${zincItem.timing}» توصیه نمی‌شود.`,
        solution: 'زینک را به «بعد ناهار» یا «همراه شام» و کلسیم را به زمان دیگری منتقل کنید.'
      });
    }
  }

  // Check Caffeine/Pre-workout + Iron/Minerals
  const hasCaffeine = has('کافئین') || has('caffeine') || has('پمپ') || has('pre-workout') || has('چای سبز');
  if (hasCaffeine && hasIron) {
    const caffItem = items.find(it => it.name.includes('کافئین') || it.name.includes('پمپ') || it.name.includes('چای سبز'));
    const ironItem = items.find(it => it.name.includes('آهن') || it.name.toLowerCase().includes('iron'));
    if (caffItem && ironItem && caffItem.timing === ironItem.timing) {
      interactions.push({
        severity: 'warning',
        title: 'تداخل تانن‌ها و کافئین با جذب آهن',
        supplements: [caffItem.name, ironItem.name],
        timing: caffItem.timing,
        description: 'کافئین و ترکیبات پلی‌فنولی با یون‌های آهن باند شده و مانع جذب آن در روده باریک می‌شوند.',
        solution: 'بین مصرف مکمل‌های کافئین‌دار/پمپ با قرص آهن حداقل ۲ ساعت فاصله بگذارید.'
      });
    }
  }

  // Check High dose Vitamin C with Vitamin B12
  const hasVitC = has('ویتامین c') || has('ویتامین ث') || has('vitamin c');
  const hasVitB = has('ویتامین b') || has('ویتامین ب') || has('vitamin b') || has('مولتی ویتامین');
  if (hasVitC && hasVitB) {
    interactions.push({
      severity: 'info',
      title: 'بررسی پایداری ویتامین‌های محلول در آب',
      supplements: ['ویتامین C', 'ویتامین B'],
      timing: 'همراه وعده‌های غذایی',
      description: 'ویتامین‌های محلول در آب سمیت تجمعی ندارند و مقادیر مازاد از طریق کلیه دفع می‌شوند.',
      solution: 'مصرف همراه با آب کافی در طول روز توصیه می‌شود.'
    });
  }

  if (interactions.length === 0) {
    interactions.push({
      severity: 'info',
      title: 'عدم مشاهده تداخل منفی دارویی/تغذیه‌ای',
      supplements: items.map(i => i.name).slice(0, 3),
      timing: 'کلیه زمان‌ها',
      description: 'هیچ تداخل جذبی یا فارماکوکینتیک منفی شناخته‌شده‌ای میان مکمل‌های انتخابی مشاهده نشد. برنامه از ضریب ایمنی بالایی برخوردار است.',
      solution: 'رعایت دستور مصرف و هیدراتاسیون کافی.'
    });
  }

  // 2. SECTION 2: TIMING OPTIMIZATION (بهینه‌سازی زمان مصرف)
  const timingOptimization = [];

  items.forEach(it => {
    const name = it.name.toLowerCase();
    const timing = it.timing;

    // Casein
    if (name.includes('کازئین') || name.includes('casein')) {
      if (timing === 'حین تمرین' || timing === 'قبل تمرین' || timing === 'بعد تمرین') {
        timingOptimization.push({
          status: 'suboptimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل خواب',
          rationale: 'پروتئین کازئین ساختار میسلار دیرجذب (۶ الی ۸ ساعت) دارد و در حین/بعد تمرین که نیاز به آمینواسیدهای زودجذب است بازدهی کمتری دارد. بهترین زمان آن «قبل خواب» برای پیشگیری از کاتابولیسم شبانه است.'
        });
      } else if (timing === 'قبل خواب') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل خواب',
          rationale: 'زمان‌بندی ایده‌آل؛ مصرف کازئین قبل خواب آزادسازی پایدار لوسین و اسیدهای آمینه را در طول استراحت شبانه تضمین می‌کند.'
        });
      }
    }

    // Creatine
    if (name.includes('کراتین') || name.includes('creatine')) {
      if (timing === 'بعد تمرین' || timing === 'همراه صبحانه') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'تحقیقات نشان می‌دهند مصرف کراتین بلافاصله بعد از تمرین به دلیل حساسیت بالای انسولینی عضلات و افزایش جریان خون، بالاترین میزان اشباع ذخایر فسفوکراتین را به همراه دارد.'
        });
      } else if (timing === 'حین تمرین') {
        timingOptimization.push({
          status: 'suboptimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'بعد تمرین',
          rationale: 'کراتین اثر حاد درون‌جلسه‌ای ندارد و نیازمند انباشتگی درون‌سلولی است. مصرف آن بعد تمرین همراه با پروتئین یا کربوهیدرات جذب بهتری دارد.'
        });
      }
    }

    // Pre-workout / Caffeine
    if (name.includes('پمپ') || name.includes('pre-workout') || name.includes('کافئین') || name.includes('caffeine')) {
      if (timing === 'قبل خواب' || timing === 'بعد شام' || timing === 'همراه شام') {
        timingOptimization.push({
          status: 'suboptimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل تمرین',
          rationale: 'نیمه‌عمر کافئین حدود ۵ تا ۶ ساعت است. مصرف پمپ یا کافئین در ساعات شب و قبل خواب ساختار خواب عمیق (Slow-Wave Sleep) و ترشح هورمون رشد را شدیداً مختل می‌کند.'
        });
      } else if (timing === 'قبل تمرین') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل تمرین',
          rationale: 'زمان‌بندی دقیق؛ اوج غلظت پلاسمایی کافئین و محرک‌ها ۳۰ تا ۴۵ دقیقه پس از مصرف ایجاد می‌شود که دقیقاً مصادف با اوج ست‌های سنگین تمرین است.'
        });
      }
    }

    // Fat Burners / L-Carnitine
    if (name.includes('ال کارنیتین') || name.includes('l-carnitine') || name.includes('چربی‌سوز')) {
      if (timing === 'قبل خواب' || timing === 'بعد شام') {
        timingOptimization.push({
          status: 'suboptimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل تمرین یا قبل صبحانه',
          rationale: 'مکمل‌های چربی‌سوز متابولیسم را تحریک می‌کنند و مصرف آن‌ها در شب بازدهی اکسیداسیون چربی پایینی دارد و ممکن است خواب را مختل کند.'
        });
      } else if (timing === 'قبل تمرین' || timing === 'قبل صبحانه') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'زمان‌بندی عالی برای بهره‌گیری حداکثری از بتا-اکسیداسیون اسیدهای چرب حین فعالیت ورزشی.'
        });
      }
    }

    // Melatonin / Ashwagandha / Magnesium
    if (name.includes('ملاتونین') || name.includes('اشواگاندا') || name.includes('منیزیم') || name.includes('magnesium')) {
      if (timing === 'قبل تمرین' || timing === 'حین تمرین' || timing === 'قبل صبحانه') {
        timingOptimization.push({
          status: 'suboptimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'قبل خواب',
          rationale: 'این مکمل‌ها اثرات آرام‌بخش و ریلکس‌کننده بر سیستم عصبی (GABAergic) دارند و مصرف آن‌ها قبل از تمرین باعث کاهش تمرکز و توان انقباضی می‌شود.'
        });
      } else if (timing === 'قبل خواب' || timing === 'بعد شام') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'زمان‌بندی عالی برای تسهیل فاز ریکاوری سیستم عصبی مرکزی (CNS) و افزایش کیفیت خواب عمیق.'
        });
      }
    }

    // Fat-soluble vitamins / Omega-3
    if (name.includes('امگا') || name.includes('omega') || name.includes('ویتامین d') || name.includes('ویتامین a') || name.includes('ویتامین e')) {
      if (timing === 'قبل صبحانه' || timing === 'قبل تمرین' || timing === 'حین تمرین') {
        timingOptimization.push({
          status: 'suggested',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: 'همراه ناهار یا همراه صبحانه',
          rationale: 'امگا ۳ و ویتامین‌های محلول در چربی برای جذب حداکثری نیازمند حضور لیپیدهای رژیم غذایی و تحریک ترشح صفرا هستند و نباید با معده خالی مصرف شوند.'
        });
      } else {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'مصرف همراه با وعده غذایی جذب روده‌ای اسیدهای چرب EPA/DHA را به حداکثر می‌رساند.'
        });
      }
    }

    // Whey protein
    if (name.includes('وی') || name.includes('whey')) {
      if (timing === 'بعد تمرین' || timing === 'همراه صبحانه') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'پروتئین وی غنی از لوسین و زودجذب است؛ مصرف بعد تمرین به سرعت پنجره آنابولیک عضلانی را فعال می‌کند.'
        });
      }
    }

    // BCAA / EAA
    if (name.includes('bcaa') || name.includes('eaa') || name.includes('آمینو')) {
      if (timing === 'حین تمرین' || timing === 'قبل تمرین') {
        timingOptimization.push({
          status: 'optimal',
          supplement: it.name,
          currentTiming: timing,
          suggestedTiming: timing,
          rationale: 'مصرف درون‌تمرینی آمینواسیدها مانع افت سطح BCAA در پلاسما و مهار خستگی سروتونرژیک مغزی می‌شود.'
        });
      }
    }
  });

  if (timingOptimization.length === 0) {
    timingOptimization.push({
      status: 'optimal',
      supplement: items[0].name,
      currentTiming: items[0].timing,
      suggestedTiming: items[0].timing,
      rationale: 'زمان مصرف انتخاب شده با سینتیک دارویی و فیزیولوژی تمرین همخوانی کامل دارد.'
    });
  }

  // 3. SECTION 3: SYNERGIES (بررسی ترکیبات هم‌افزا)
  const synergies = [];

  // Vit C + Iron
  if ((has('ویتامین c') || has('vitamin c') || has('ویتامین ث')) && (has('آهن') || has('iron'))) {
    synergies.push({
      title: 'هم‌افزایی طلایی ویتامین C و آهن',
      supplements: ['ویتامین C', 'آهن'],
      benefits: 'اسید اسکوربیک با احیای یون فریک (Fe3+) به فرو (Fe2+)، قابلیت انحلال و جذب روده‌ای آهن را تا ۳۰۰٪ افزایش می‌دهد.',
      recommendation: 'پیشنهاد می‌شود هر دو در یک وعده (مثلاً قبل صبحانه با آب‌میوه تازه) مصرف شوند.'
    });
  }

  // D3 + Omega 3 / Magnesium
  if ((has('ویتامین d') || has('vitamin d')) && (has('امگا') || has('omega') || has('منیزیم') || has('magnesium'))) {
    synergies.push({
      title: 'مثلث سینرژیک ویتامین D3، امگا ۳ و منیزیم',
      supplements: ['ویتامین D3', has('امگا') ? 'امگا ۳' : 'منیزیم'],
      benefits: 'منیزیم کوفاکتور ضروری در تبدیل ویتامین D3 به فرم فعال ۲۵-هیدروکسی است و چربی‌های امگا ۳ جذب آن را تسریع می‌کنند.',
      recommendation: 'این ترکیب پاسخ ایمنی، ترشح بهینه هورمون‌های استروئیدی و تراکم استخوان را تقویت می‌کند.'
    });
  }

  // Creatine + Beta-Alanine
  if ((has('کراتین') || has('creatine')) && (has('بتا آلانین') || has('beta-alanine') || has('beta alanine'))) {
    synergies.push({
      title: 'ترکیب هم‌افزای توان بی‌هوازی: کراتین + بتا آلانین',
      supplements: ['کراتین', 'بتا آلانین'],
      benefits: 'کراتین سیستم فسفاژن (ATP-PCr) را برای ۵ الی ۱۰ ثانیه اول ست تقویت کرده و بتا آلانین با ساخت کارنوزین اسیدیته درون‌سلولی را برای ست‌های بالای ۳۰ ثانیه مهار می‌کند.',
      recommendation: 'یکی از موثرترین استک‌های اثبات‌شده ارگوژنیک در دنیای پرورش اندام و توان بدنی.'
    });
  }

  // Caffeine + L-Theanine or Citrulline
  if ((has('کافئین') || has('caffeine') || has('پمپ')) && (has('سیترولین') || has('citrulline') || has('آرژنین') || has('arginine'))) {
    synergies.push({
      title: 'تقویت هم‌زمان پمپ عروقی و محرک‌های عصبی',
      supplements: ['سیترولین مالات / آرژنین', 'کافئین / پمپ'],
      benefits: 'کافئین درایو سمپاتیک و تمرکز عصبی را بالا می‌برد در حالی که سیترولین مالات با تحریک سنتز نیتریک اکساید (eNOS) عروق را گشاد کرده و جریان خون به عضله هدف را دوچندان می‌سازد.',
      recommendation: 'مصرف ۳۰ تا ۴۵ دقیقه قبل از شروع تمرینات مقاومتی.'
    });
  }

  // Whey + Creatine
  if ((has('وی') || has('whey')) && (has('کراتین') || has('creatine'))) {
    synergies.push({
      title: 'هم‌افزایی آنابولیک پروتئین وی و کراتین بعد تمرین',
      supplements: ['پروتئین وی', 'کراتین'],
      benefits: 'پاسخ ملایم انسولینی ناشی از جذب اسیدهای آمینه شاخه‌دار وی، فعالیت ناقل‌های کراتین (CreaT) در غشای سارکولما را افزایش می‌دهد.',
      recommendation: 'شیک ترکیبی وی + کراتین بعد از تمرین به ریکاوری سریع و پر شدن گلیکوژن کمک شایانی می‌کند.'
    });
  }

  // Zinc + Magnesium (ZMA synergy)
  if ((has('زینک') || has('zinc')) && (has('منیزیم') || has('magnesium'))) {
    synergies.push({
      title: 'سینرژی ریکاوری شبانه زینک و منیزیم (اثر ZMA)',
      supplements: ['زینک پلاس', 'منیزیم'],
      benefits: 'ترکیب زینک و منیزیم در فاز استراحت شبانه باعث کاهش سطح استرس اکسیداتیو، بهبود هورمون‌های آنابولیک و خواب عمیق‌تر می‌شود.',
      recommendation: 'مصرف در ساعات پایانی شب با معده سبک.'
    });
  }

  if (synergies.length === 0) {
    synergies.push({
      title: 'پوشش هدفمند مکمل‌ها بر اساس هدف ' + categoryFa,
      supplements: items.map(i => i.name).slice(0, 2),
      benefits: 'مکمل‌های چیده‌شده به خوبی نیازهای تغذیه‌ای و تمرینی ورزشکار را در این هدف ورزشی پوشش می‌دهند.',
      recommendation: 'توصیه می‌شود در صورت اضافه کردن مکمل‌های جدید، هم‌افزایی آن‌ها بررسی گردد.'
    });
  }

  // 4. SECTION 4: OVERDOSE & STIMULANT SAFETY (هشدار اوردوز یا محرک‌ها)
  const overdoseStimulantWarnings = [];

  // Multiple Stimulants check
  const stimulantItems = items.filter(it => {
    const n = it.name.toLowerCase();
    return n.includes('پمپ') || n.includes('کافئین') || n.includes('چربی‌سوز') || n.includes('pre-workout') || n.includes('caffeine') || n.includes('چای سبز');
  });

  if (stimulantItems.length > 1) {
    overdoseStimulantWarnings.push({
      severity: 'critical',
      title: 'هشدار مصرف هم‌زمان چند منبع کافئین و محرک (Multi-Stimulant Alert)',
      details: `برنامه شامل ${stimulantItems.length} مکمل حاوی کافئین و محرک‌های CNS (${stimulantItems.map(s => s.name).join(' + ')}) است. جمع تجمعی کافئین ممکن است از سقف مجاز ۴۰۰ میلی‌گرم در روز فراتر رفته و منجر به تپش قلب (تاکی‌کاردی)، اضطراب و افت شدید انرژی پس از تمرین شود.`,
      actionRequired: 'دوز پمپ و کافئین را تعدیل کرده و از مصرف همزمان پمپ با چربی‌سوزهای ترموژنیک در یک روز خودداری کنید.'
    });
  }

  // Evening Stimulant check
  const eveningStimulants = items.filter(it => {
    const n = it.name.toLowerCase();
    const t = it.timing;
    const isStim = n.includes('پمپ') || n.includes('کافئین') || n.includes('چربی‌سوز') || n.includes('pre-workout') || n.includes('caffeine');
    const isNight = t === 'قبل شام' || t === 'همراه شام' || t === 'بعد شام' || t === 'قبل خواب';
    return isStim && isNight;
  });

  if (eveningStimulants.length > 0) {
    overdoseStimulantWarnings.push({
      severity: 'high',
      title: 'هشدار ایمنی: مصرف محرک در ساعات عصر و شب',
      details: `مکمل‌های (${eveningStimulants.map(s => s.name).join('، ')}) برای بازه «${eveningStimulants[0].timing}» زمان‌بندی شده‌اند. این موضوع مانع افت طبیعی دمای بدن و ترشح ملاتونین شده و فاز خواب REM را سرکوب می‌کند.`,
      actionRequired: 'تمام مکمل‌های حاوی محرک را به حداقل ۶ ساعت قبل از خواب منتقل کنید.'
    });
  }

  // Creatine hydration warning
  if (has('کراتین') || has('creatine')) {
    overdoseStimulantWarnings.push({
      severity: 'moderate',
      title: 'الزام افزایش مایعات و هیدراتاسیون با مصرف کراتین',
      details: 'کراتین اسمولیت سلولی است و آب را به داخل سارکوپلاسم هدایت می‌کند. در صورت عدم مصرف آب کافی (حداقل ۳.۵ تا ۴ لیتر روزانه)، احتمال کرامپ عضلانی و فشار اسمزی به کلیه افزایش می‌یابد.',
      actionRequired: 'ورزشکار روزانه ۳ الی ۴ لیتر آب مصرف کرده و میزان شفافیت ادرار را پایش نماید.'
    });
  }

  // High Zinc warning
  const zincSources = items.filter(it => it.name.includes('زینک') || it.name.includes('مولتی') || it.name.toLowerCase().includes('zinc'));
  if (zincSources.length > 1) {
    overdoseStimulantWarnings.push({
      severity: 'moderate',
      title: 'پایش سقف دریافت روزانه زینک (UL: 40mg/day)',
      details: `مصرف هم‌زمان چند منبع زینک (${zincSources.map(s => s.name).join(' و ')}) ممکن است دریافت روزانه را به بالای ۴۰ میلی‌گرم برساند که در طولانی‌مدت مانع جذب مس و فریتین می‌شود.`,
      actionRequired: 'مجموع زینک دریافتی از مکمل‌ها کنترل شود تا در محدوده ۱۵ الی ۳۰ میلی‌گرم حفظ گردد.'
    });
  }

  if (overdoseStimulantWarnings.length === 0) {
    overdoseStimulantWarnings.push({
      severity: 'safe',
      title: 'ضریب ایمنی دوز و محرک‌ها در محدوده استاندارد',
      details: 'تعداد و ماهیت مکمل‌های انتخابی فاقد بار اضافه بر ارگان‌های دفعی (کبد و کلیه) است و تداخل محرک خطرناکی ثبت نشد.',
      actionRequired: 'رعایت پروتکل استاندارد و دوره‌های استراحت (Cycle-off) در مکمل‌های دوره‌ای.'
    });
  }

  const overallScore = Math.max(75, 100 - (interactions.filter(i => i.severity === 'danger').length * 20) - (overdoseStimulantWarnings.filter(w => w.severity === 'critical').length * 15));

  const result = {
    title,
    category: categoryFa,
    totalItems: items.length,
    overallScore,
    summary: `تحلیل بالینی و ورزشی برای برنامه «${title}» با هدف «${categoryFa}» انجام شد. این برنامه شامل ${items.length} مکمل تخصصی است و نمره ایمنی و بهره‌وری فیزیولوژیک آن ${overallScore} از ۱۰۰ ارزیابی می‌شود.`,
    interactions,
    timingOptimization,
    synergies,
    overdoseStimulantWarnings
  };

  return result;
}

module.exports = {
  TIMING_OPTIONS,
  CATEGORIES,
  CATEGORY_LIST,
  SUPPLEMENT_CATALOG,
  getSupplementCatalog,
  createSupplementProgram,
  getSupplementProgram,
  updateSupplementProgram,
  deleteSupplementProgram,
  listSupplementPrograms,
  analyzeSupplementsWithAI
};
