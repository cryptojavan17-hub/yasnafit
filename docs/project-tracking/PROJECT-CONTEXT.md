# YasnaFit Project Context

> **این سند حافظه فنی دائمی پروژه YasnaFit است.**
> بعد از هر تسک توسعه، این فایل باید به‌روز شود (قواعد کامل: انتهای همین فایل و `CHANGELOG.md`).
> هر ادعایی در این سند یکی از این وضعیت‌ها را دارد: `VERIFIED` (تأییدشده با کد/اجرا)، `PARTIALLY VERIFIED`، `NOT VERIFIED`، `NOT IMPLEMENTED`.

**آخرین به‌روزرسانی:** 2026-08-24 • **نسخه برنامه:** 0.9.0 • **وضعیت تست‌ها:** همه پاس (اجرا‌شده در 2026-08-24)

---

## 1. Project Identity

**YasnaFit چیست؟** `VERIFIED`
پلتفرم مربیگری بدنسازی/فیتنس **local-first** برای کامپیوتر شخصی مربی — داشبورد وب محلی (Node.js + SQLite) که کل چرخه مربیگری را پوشش می‌دهد: مدیریت شاگرد، ارزیابی چندمرحله‌ای، ساخت برنامه تمرینی از بانک ۲٬۷۰۷ حرکتی، تحویل به شاگرد از طریق پورتال وب جداگانه، ثبت تمرین واقعی، پیام‌رسان و اعلان‌ها.

- **مأموریت اعلام‌شده مالک (مهدی):** پلتفرم مربیگری فیتنس بانوان. کد هر دو جنسیت را پوشش می‌دهد (بخش بارداری فقط برای خانم‌ها `VERIFIED`، راهنمای ژست عکس بدن فقط با تصاویر زنانه: `public/guides/female-*.png` — `VERIFIED`).
- **کاربر اصلی:** یک مربی (single-coach local) — جدول `coaches` با رکورد seed «مربی محلی» (`VERIFIED`).
- **نقش مربی:** ساخت برنامه، بررسی ارزیابی‌ها، CRM شاگردها، اعلان/پیام، پشتیبان‌گیری.
- **نقش شاگرد:** ورود با موبایل+رمز یا لینک دعوت، تکمیل ارزیابی ۱۰ مرحله‌ای، مشاهده برنامه، ثبت جلسه تمرین، پیام.

### ⛔ قاعده واژگانی (TERMINOLOGY RULE)
**اصطلاح ممنوع پروژه** (forbidden student terminology) در هیچ متن، UI، کامنت، تست یا مستندی نوشته نمی‌شود — همیشه فقط **«شاگرد»**.
نکته فنی نوشتار: برای ارجاع به آن، هرگز خودِ واژه (به هیچ شکلی: کامل، فاصله‌دار، نیم‌فاصله‌دار یا تقسیم‌شده) نوشته نشود؛ فقط بنویسید «اصطلاح ممنوع پروژه». گارد واژگانی کل مخزن (شامل docs) را اسکن می‌کند و خودِ واژه را در هر توالی مجاز نمی‌داند (نمونه واقعی: KNOWN-ISSUES KI-009).
گارد خودکار: `tests/terminology-regression.js`.
وضعیت فعلی: `VERIFIED` — اسکن در 2026-08-24 → **۰ مورد**.

---

## 2. Product Vision

```
دسکتاپ/وب مربی (فعلاً همان سرور محلی Node روی پورت 3020 + BAT لانچر ویندوز)
        ↓  (لایه سینک — آینده)
Backend / Sync Layer (سرور مرکزی — NOT IMPLEMENTED)
        ↓
اپ اندروید شاگرد (NOT IMPLEMENTED — فقط آماده‌سازی داده‌ای شده)
```

- **دسکتاپ مربی:** مالک حقیقت داده‌ها (برنامه‌ها و شاگردها محلی ساخته/ذخیره می‌شوند).
- **لایه سینک/سرور:** در آینده مالکیت بانک حرکات (۲٬۷۰۷) را می‌گیرد؛ نسخه‌های محلی read-only replica می‌شوند (مستند در ARCHITECTURE.md — `VERIFIED` به‌عنوان سند، `NOT IMPLEMENTED` به‌عنوان کد).
- **اپ اندروید:** در مخزن هیچ کد اندرویدی وجود ندارد `VERIFIED`. آماده‌سازی فقط داده‌ای است: ستون‌های `stable_id` (UUID)، `version`، `created_at/updated_at`، حذف نرم `deleted_at` روی موجودیت‌های sync. فلوی موبایلِ «افزودن نمونه برنامه تمرینی» فقط به‌صورت **مشخصات ارائه‌شده توسط مالک** شناخته شده (۱۲ سیستم تمرینی — بنگرید §7).

---

## 3. Current Architecture

`VERIFIED` (کد بررسی و سرور اجرا شد — 2026-08-24)

| لایه | پیاده‌سازی واقعی |
|---|---|
| Runtime | Node.js >= 22.5 (تست‌شده با v22.22.3) — `engines` در package.json |
| Backend | **یک فایل `server.js` (~1937 خط)** — HTTP سرور خالش Node بدون Express؛ روتر دستی با regex روی pathname |
| دیتابیس | `node:sqlite` داخلی (experimental) → `data/yasnafit.db` حالت WAL، `foreign_keys=ON`؛ ۳۹ جدول |
| Frontend | Vanilla JS + HTML + CSS خالص؛ بدون فریم‌ورک/باندلر؛ دو شل جدا: `public/index.html` (مربی) و `public/student.html` (شاگرد) |
| API | REST‌مانند JSON با پیشوندهای `/api/...`؛ رشته‌های خطا فارسی |
| سرویس‌ها | لایه `src/*-service.js` (program, student, assessment, engagement, upload, release, audit, student-auth, student-session, assessment-document) + `src/database.js`، `src/migrations.js`، `src/validation.js` |
| احراز هویت | مربی: توکن فایل محلی `data/coach-access-token` (۴۳ کاراکتر) → کوکی سشن تصادفی per-boot، یا Bearer با env `YASNAFIT_COACH_TOKEN`؛ مقایسه constant-time. شاگرد: موبایل + رمز scrypt + سشن هش‌شده در جدول `student_sessions` |
| Storage | استاتیک از `public/`؛ فایل‌های خصوصی شاگرد در `data/assessments` و `data/assessment-documents` (خارج از public) با محافظ path-traversal |
| آماده‌سازی سینک | stable_id + version + soft-delete روی موجودیت‌های sync (بنگرید §5) |
| Migrations | ۲۲ مایگریشن نسخه‌ای idempotent در `src/migrations.js`؛ جدول `schema_migrations`؛ `settings.schema_version` |
| تست | ۹ سوئیت رگرسیون + e2e با `node:assert` — بدون فریم‌ورک تست خارجی؛ `npm test` |

**متغیرهای محیطی شناخته‌شده** `VERIFIED`: `PORT`، `NODE_ENV`، `YASNAFIT_COACH_TOKEN` (حالت سرور/Bearer)، `YASNAFIT_BASE_URL` و `YASNAFIT_COACH_TOKEN` (تست e2e). مقدار توکن‌ها هرگز در مستندات نوشته نمی‌شود.

---

## 4. Directory Structure

`VERIFIED` — 2026-08-24

```
yasnafit/
├── server.js                  ← کل HTTP سرور: روتینگ، احراز هویت، API، سرو فایل استاتیک
├── src/
│   ├── database.js            ← اتصال DB، seed، ایمپورت ۲۷۰۷ حرکت از JSON
│   ├── migrations.js          ← ۲۲ مایگریشن (001_initial … 022_mobile_prefix_repair)
│   ├── program-service.js     ← ساخت/ذخیره/بازخوانی برنامه از جدول‌های نرمال (منبع حقیقت)
│   ├── student-service.js     ← CRM شاگرد، آنبوردینگ، ارزیابی‌ها
│   ├── student-auth-service.js / student-session-service.js ← رمز scrypt + سشن هش‌شده
│   ├── assessment-service.js (+ assessment-document-service.js) ← ارزیابی ۱۰ مرحله‌ای + مدارک
│   ├── engagement-service.js  ← تمرین واقعی، پیام، اعلان
│   ├── upload-service.js      ← آپلود امن عکس/مدرک خصوصی
│   ├── audit-service.js       ← رویدادهای ممیزی
│   ├── release-service.js     ← نسخه و تاریخچه انتشار
│   └── validation.js          ← اعتبارسنجی ورودی (بدون وابستگی)
├── public/                    ← فرانت‌اند (مربی + شاگرد) — بنگرید §6
├── data/                      ← (gitignore) دیتابیس، توکن مربی، فایل‌های خصوصی شاگرد
├── data-source/exercises_data.json ← دیتاست مرجع ۲۷۰۷ حرکت
├── tests/                     ← ۹ سوئیت رگرسیون + e2e
├── tool/                      ← اسکریپت‌های کمکی (program-helper.py)
├── docs/project-tracking/     ← همین سیستم مستندات (منبع حقیقت فنی)
├── YASNAFIT-LAUNCHER.bat      ← لانچر ویندوز (اجرای سرور، ایمپورت عکس‌ها و...)
└── README.md / ARCHITECTURE.md / DATABASE_SCHEMA.md / CHANGELOG.md / EXERCISE_MANAGEMENT.md
```

فایل‌های ریشه‌ای مستندات موجود (نباید حذف شوند): `README.md` (راهنمای دوزبانه + راهنمای پلتفرم Morabiha)، `ARCHITECTURE.md` (معماری harden‌شده)، `DATABASE_SCHEMA.md` (اسکیمای مرجع)، `CHANGELOG.md` (تاریخچه **محصولی** — با CHANGELOG توسعه‌ای این پوشه اشتباه گرفته نشود)، `EXERCISE_MANAGEMENT.md` (مدیریت حرکات).

---

## 5. Database Architecture

`VERIFIED` — ۳۹ جدول (بدون جدول‌های سیستمی sqlite).

### زنجیره برنامه تمرینی (منبع حقیقت نرمال‌شده)
```
training_programs → program_days → exercise_systems → program_movements → movement_sets
```
- **قاعده حیاتی:** جدول‌های نرمال **منبع حقیقت‌اند**؛ ستون `program_data` (JSON) فقط نمای همگام‌شده برای انتقال/بکاپ است و همیشه از DB بازسازی می‌شود (`buildProgramFromDB`). `VERIFIED` در `src/program-service.js`.
- `exercise_systems` جدولِ فرزندِ روزِ برنامه است (`day_id` FK) با فیلد کاتالوگی `exercise_system_id` (int) + `system_type` (text) — **جدول کاتالوگ سیستم‌ها در DB وجود ندارد**؛ لیست سیستم‌ها فعلاً فقط در فرانت‌اند تعریف می‌شود (بنگرید §7).

### مدل ID
- `id` = PK داخلی AUTOINCREMENT؛ `original_id` = شناسه دیتاست مبدا (سازگاری ایمپورت) — همه FKها به `id` داخلی.
- هش‌های پایدار UI: `dayHash / exerciseSystemHash / movementHash / setHash` با فرمت `/^[a-zA-Z0-9_-]{4,64}$/` و یکتایی در کل برنامه.

### آماده‌سازی سینک `VERIFIED`
روی موجودیت‌های sync-relevant: `stable_id` (UUID از `crypto.randomUUID`)، `version` (هر آپدیت +1)، `created_at/updated_at`، `deleted_at` (حذف نرم). راهبرد تعارض فعلی: last-write-wins با نقطه توسعه برای منطق اختصاصی.

### حذف نرم/سخت
- نرم (`deleted_at`): شاگردها، برنامه‌ها، حرکات، دسته‌ها و موجودیت‌های sync.
- سخت: فقط فرزندان برنامه (days/systems/movements/sets) **داخل تراکنش** هنگام ویرایش برنامه (بازسازی کامل).

### جداول اصلی (گروه‌بندی‌شده)
- **حرکات:** `exercises` (۲٬۷۰۷)، `exercise_categories` (۱۳)، `exercise_subcategories` (۲۳)
- **برنامه:** `training_programs`, `program_days`, `exercise_systems`, `program_movements`, `movement_sets`
- **تمرین واقعی:** `workout_sessions`, `workout_results` (ست‌های اجراشده، upsert با مالکیت)
- **ارزیابی:** `body_assessments` + ۱۰ جدول بخش نرمال (`assessment_*`: general/goals/measurements/medical/medical_items/sports/nutrition/habits/pregnancy/photos/documents)
- **شاگرد:** `students`, `student_sessions`, `student_invites`, `coaches`, `coach_students`
- **تعامل:** `conversations`, `messages`, `notifications`, `audit_events`
- **نسخه/سیستم:** `releases`, `settings`, `schema_migrations`
- **Legacy (محلی، خارج از سینک):** `movements`, `programs`, `orders`, `measurements`, `activity_log` — حذف نشوند ولی مهاجرتشان در آینده لازم است.
- **خفته:** `assessment_ai_suggestions` (ساختار آماده پیشنهاد AI با status PENDING/READY/… — هیچ فراخوانی AI در پروداکشن وجود ندارد `VERIFIED`)

---

## 6. Main Product Modules

| ماژول | STATUS | توضیح (وضعیت واقعی در 2026-08-24) |
|---|---|---|
| Coach Dashboard | **IMPLEMENTED** `VERIFIED` | آمار، نسخه، آخرین تغییرات، زنگ اعلان با پول ۳۰ ثانیه‌ای |
| Student CRM | **IMPLEMENTED** `VERIFIED` | لیست/جستجو، پرونده ۶ رقمی، تایم‌لاین، ارزیابی‌های در انتظار |
| Student Onboarding | **IMPLEMENTED** `VERIFIED` | ورود با دعوت/رمز، ویزارد ۱۰ مرحله‌ای، عکس اختیاری |
| Assessment | **IMPLEMENTED** `VERIFIED` | چرخه canonical (DRAFT→SUBMITTED→…→CHANGES_REQUESTED)، بررسی/رد مربی، مدارک پزشکی خصوصی |
| Program Builder (وب) | **IMPLEMENTED** `VERIFIED` (UI بازطراحی‌شده 2026-08-24) | روز→سیستم→حرکت→ست؛ درایور بانک حرکات؛ **UI جدید:** نوار بالای چسبان + فرم جمع‌شونده + چیپ‌رِیل روزها (فقط روز فعال رندر می‌شود) + منوهای زمینه‌ای + کارت حرکت دووضعیت + نوار ذخیره سه‌گانه؛ شکاف §7 هنوز باز |
| Exercise Library | **IMPLEMENTED** `VERIFIED` | ۲٬۷۰۷ حرکت، فیلتر محل/دسته/زیردسته/وضعیت، جستجوی debounce، آرشیو/بازیابی/حذف گروهی، صفحه‌بندی ۲۴ |
| Training Systems | **IMPLEMENTED** `VERIFIED` (2026-08-24) | وب: ۱۲ سیستم با سقف حرکت واقعی + انتخابگر + بانک چندانتخابی — بنگرید §7 |
| Workout Tracking | **IMPLEMENTED** `VERIFIED` | شروع جلسه، ثبت ست‌های اجراشده (upsert + اعتبارسنجی مالکیت ست تجویزی)، تکمیل، عملکرد |
| Messaging | **IMPLEMENTED** `VERIFIED` | پیام‌رسان سبک coach↔student scoped + اعلان طرف مقابل |
| Notifications | **IMPLEMENTED** `VERIFIED` | هر دو طرف، خوانده‌شده/خوانده‌نشده، یادآوری پایان برنامه |
| Media (عکس) | **IMPLEMENTED** `VERIFIED` | آپلود امن خصوصی، fallback تصویر حرکات (زنجیره ۴ مرحله‌ای)، گاید ژست زنانه |
| Media (ویدیو) | **PARTIAL** | مسیر ویدیو در DB + سرو از `/files/exercise/videos/` `VERIFIED`؛ **پخش‌کننده در UI وجود ندارد** `VERIFIED` |
| Authentication | **IMPLEMENTED** `VERIFIED` | مربی (توکن/کوکی/Bearer) + شاگرد (scrypt + سشن هش‌شده) کاملاً جدا |
| Access Control | **PARTIAL** | تک‌مربی محلی؛ جدول coaches/coach_students پایه‌گذاری شده اما UI چندمربی/نقش وجود ندارد `VERIFIED` |
| Audit Logs | **IMPLEMENTED** `VERIFIED` | رویدادهای ساختاریافته (message.sent, workout.started/completed و...) |
| Android Preparation | **PARTIAL** | فقط metadata سینک؛ کدی نیست `VERIFIED` |
| Sync | **NOT IMPLEMENTED** | نقشه‌راه مستند؛ هیچ کد سینکی وجود ندارد `VERIFIED` |
| AI | **NOT IMPLEMENTED** (خفته) | جدول suggestions خفته؛ قاعده: ممنوع در پروداکشن `VERIFIED` |

---

## 7. Training Systems

### WEB — ۱۲ سیستم پیاده‌شده `VERIFIED` (کاتالوگ BR-14 در `public/program-builder.js` → systemTypes — 2026-08-24)
| id | نام نمایشی | type | حرکت لازم |
|---|---|---|---|
| 1 | معمولی | normal | ۱ |
| 6 | سیستم تمرینی رست پاز | rest_pause | ۱ |
| 5 | سیستم تمرینی دراپ ست | drop | ۱ |
| 7 | سیستم تمرینی پس خستگی | post_exhaustion | ۱ |
| 8 | سیستم تمرینی FST7 | fst7 | ۱ |
| 9 | سیستم تمرینی ۲۱ | twenty_one | ۱ |
| 2 | سیستم تمرینی سوپر ست | superset | ۲ |
| 10 | سیستم تمرینی تکرار نیمه | partial_reps | ۲ |
| 3 | سیستم تمرینی تری ست | triset | ۳ |
| 11 | سیستم تمرینی ۲۰-۱۰-۵ | ladder_20_10_5 | ۳ |
| 4 | سیستم تمرینی جاينت ست | giant | ۴ |
| 12 | سیستم تمرینی ماموت ست | mammoth | ۵ |

- **idهای ۱–۵ تاریخی و بدون تغییر** (سازگاری برنامه‌های موجود)؛ ۶–۱۲ جدید. اعتبارسنجی سرور: `src/validation.js` لیست سفید ۱–۱۲ + نوع‌های جدید را می‌پذیرد و ناشناخته‌ها را رد می‌کند `VERIFIED`.
- **رفتار واقعی (نه صرفاً نمایشی):** سقف حرکت هر سیستم در UI اعمال می‌شود (افزودن بیشتر از N غیرممکن)، شمارنده «n از m»، نشان «تکمیل»، بانک چندانتخابیِ بازماندن، ترتیب حفظ‌شده — پوشش تست: `tool/smoke-program-builder.js` (ماتریس ۱۲ سیستم) `VERIFIED`.
- روز جدید بدون سیستم پیش‌فرض ساخته می‌شود؛ سیستم فقط از انتخابگر ۱۲گانه («افزودن سیستم تمرینی») انتخاب می‌شود.
- **بدون حذف روز:** هیچ عملیات حذف روز در UI وجود ندارد (BR-14).
- (تگ‌های کمکی ست: DROPSET/SUPERSET/GIANT_SET همچنان در عنوان ست موجود — دست‌نخورده.)

### ANDROID — همان ۱۲ سیستم (مشخصات مالک = حالا همان کاتالوگ وب) — کد اندرویدی همچنان `NOT IMPLEMENTED`

### GAP
شکاف ۵↔۱۲ رفع شد (KI-002 → FIXED). باقی‌مانده: کاتالوگ در DB جدول ندارد (ثابت فرانت‌اند + لیست سفید validation — TD-17)؛ هنگام سینک/اندروید باید به کاتالوگ سمت سرور منتقل شود (T-14).

### NEXT ACTION
T-14: انتقال کاتالوگ به DB (`training_system_catalog`) هنگام ساخت لایه سینک — نه قبل از آن.

---

## 8. Assessment / Onboarding — سفر کامل شاگرد

`VERIFIED` (همه مراحل با کد/e2e تأیید شد)

```
دعوت (۳ لینک یک‌بارمصرف، سشن مستقل)
  → ثبت‌نام/ورود (موبایل + رمز موقت scrypt؛ توصیه تغییر رمز)
  → آنبوردینگ (پروفایل + فرم ارزیابی)
  → ارزیابی ۱۰ مرحله‌ای: عمومی، اهداف، اندازه‌گیری‌ها، پزشکی، تاریخچه ورزشی،
     تغذیه، عادات، (بارداری — فقط خانم‌ها)، عکس بدن (اختیاری/قابل‌رد)، مدارک پزشکی
  → SUBMIT → بررسی مربی (تأیید / رد / درخواست تغییر)
  → ساخت برنامه ماهانه ۳۰ روزه (متصل به ارزیابی)
  → شاگرد: مشاهده برنامه → شروع جلسه → ثبت ست‌های اجراشده → تکمیل
  → عملکرد/پیشرفت + یادآوری پایان برنامه → ارزیابی ماه بعد (چرخه تکرار)
```

---

## 9. Exercise Database

`VERIFIED` (شمارش مستقیم از `data-source/exercises_data.json` و DB — 2026-08-24)

- **۲٬۷۰۷ حرکت** کل (۱۹۱۵ فعال + ۷۹۲ آرشیو) — منبع: `data-source/exercises_data.json`
- توزیع محل: باشگاه ۱٬۹۴۲ / منزل ۷۶۵ (کل)؛ فعال: باشگاه ۱٬۵۹۸ / منزل ۷۶۸
- **۱۳ دسته اصلی** (پا ۱۶۲ فعالِ باشگاه، سرشانه ۲۵۸، سینه ۱۵۳، جلو بازو ۱۲۵، زیربغل ۱۲۳، شکم ۱۲۹، پشت بازو ۱۰۷، مچ/ساعد ۲۵، کول ۲۰، هوازی ۱۹، پشت-back ۱۵، گردن ۱۲، گرم‌کردن ۲) + ۲۳ زیردسته (بالا سینه، چهارسر ران، همسترینگ، ساق، سرینی و…)
- ساختار هر حرکت: نام فارسی، محل (enum: gym/home/both)، دسته، زیردسته، اولویت، مسیر عکس/ویدیو (`/files/exercise/{images|videos}/{original_id}.{png|mp4}`)
- **فیلدهای ساختاریافته تجهیزات/سختی/توضیحات: `PARTIAL`** — ستون‌های `equipment`, `difficulty`, `description`, `name_en` در اسکیمای DB **موجودند ولی همگی خالی‌اند** `VERIFIED` (شمارش 2026-08-24: صفر مقدار پرشده) و در UI هم افشا نمی‌شوند. پرکردن داده + نمایش UI = TODO T-04 (نیاز به مایگریشن جدید **ندارد**).
- کتابخانه فایل‌های محلی مالک: `exercises_organized/[باشگاه|منزل]/[دسته]/videos/[ID]_[نام فارسی].mp4` (خارج از مخزن، gitignore). ابزار نگاشت: `tool/program-helper.py`.
- جستجو/انتخاب: درایور Program Builder با فلوی محل←دسته/جستجو←انتخاب؛ ورود به برنامه با `exercise_id` داخلی (+ `original_exercise_id` برای دیباگ).
- **قاعده:** حرکت غیرواقعی ساختن ممنوع — همیشه از بانک/دیتاست.

---

## 10. Important Business Rules

| # | قاعده | وضعیت |
|---|---|---|
| BR-1 | برنامه ماهانه دقیقاً بازه **۳۰ روزه** (start→end) | `VERIFIED` (0.9.0) |
| BR-2 | دقیقاً **۳ لینک دعوت**، هر کدام سشن هش‌شده مستقل | `VERIFIED` |
| BR-3 | شماره پرونده **۶ رقمی** یکتا برای هر شاگرد | `VERIFIED` |
| BR-4 | واژه «شاگرد» الزامی — «اصطلاح ممنوع پروژه» در هیچ‌جا نوشته نمی‌شود (گارد تست) | `VERIFIED` |
| BR-5 | حرکت جدید فقط از بانک واقعی — اختراع حرکت ممنوع | قاعده عمومی |
| BR-6 | تعداد حرکت هر سیستم تمرینی از نوع سیستم پیروی می‌کند | `VERIFIED` (وب ۵ سیستم؛ موبایل ۱۲ — §7) |
| BR-7 | عکس بدن کاملاً اختیاری، بدون اجبار به «رد»؛ ژست‌های خنثی | `VERIFIED` |
| BR-8 | هیچ فراخوانی AI در پروداکشن ممنوع (ساختار خفته فقط با بازبینی مربی) | `VERIFIED` |
| BR-9 | جدول‌های نرمال = منبع حقیقت برنامه؛ JSON فقط transport | `VERIFIED` |
| BR-10 | فایل خصوصی هرگز از `public/` سرو نشود؛ مالکیت از سشن | `VERIFIED` |
| BR-11 | ترتیب ثابت فلوی برنامه: متادیتا←جلسات←تمرین←سیستم←محل←دسته←حرکت←ست | مشخصات موبایل |
| BR-12 | هر تغییر قاعده کسب‌وکار باید در همین بخش مستند شود | فرایندی |
| BR-15 | تاریخ‌ها همیشه ISO میلادی ذخیره می‌شوند؛ شمسی فقط لایه نمایش/ورود (`jalali.js`) — API/DB بدون تغییر | `VERIFIED` (2026-08-24) |
| BR-14 | کاتالوگ ۱۲ سیستم تمرینی مالک (لیست §7) تک‌نمایشی است؛ سقف حرکت هر سیستم در UI اجباری؛ بانک حرکات پس از هر انتخاب بسته نمی‌شود (بستن فقط دستی)؛ **حذف روز تمرینی در UI ممنوع/حذف‌شده**؛ ترتیب حرکات انتخابی حفظ شود | `VERIFIED` (2026-08-24) |

---

## 11. Security Rules

`VERIFIED` — خلاصه (مقادیر محرمانه هرگز در مستندات نمی‌آید):

- **دسترسی مربی:** فایل `data/coach-access-token` (gitignore، مقدارش اینجا نمی‌آید) → `/coach-access/{token}` → کوکی `yasnafit_coach_session` (HttpOnly, SameSite=Strict, Path=/)؛ سشن تصادفی per-boot؛ یا Bearer/x-coach-token با env `YASNAFIT_COACH_TOKEN`؛ مقایسه constant-time.
- **شاگرد:** رمز scrypt، سشن هش‌شده در DB با انقضا، کوکی HttpOnly/SameSite=Strict.
- **Rate limiting:** روی لینک دعوت (۲۰/۱۰دقیقه)، join (۳۰/دقیقه)، ورود شاگرد (۳۰/۱۵دقیقه) — در حافظه (ریست با ری‌استارت).
- **CSP:** `default-src 'self'` + nosniff + Referrer-Policy no-referrer؛ مدارک با CSP جدا `default-src 'none'` و Cache-Control private/no-store.
- **Same-origin** برای تغییرات (mutation) شاگرد.
- **مغالطه مسیر (path traversal):** محافظ `isWithin(root,…)` روی سرو فایل‌های خصوصی.
- **ممیزی:** رویدادهای ساختاریافته با redaction.
- **DO NOT:** افشای توکن/رمز/کلید در مستندات، chat یا Git.

---

## 12. Testing

- **فریم‌ورک:** `node:assert/strict` + fetch — بدون وابستگی خارجی؛ ۹ فایل تست.
- **انواع:** رگرسیون مایگریشن، UI-design (استاتیک روی سورس)، واژگانی، auth، سشن شاگرد، پروفایل ارزیابی، engagement، مدیریت شاگرد، و **e2e** (چرخه کامل دعوت→آنبوردینگ→ارزیابی→برنامه→تمرین→ماه دوم→ایزوله‌سازی).
- **دستور:** `npm test` (یا تک‌تک: `npm run test:e2e` و…).
- **شرط e2e:** سرور باید روی 3020 در حال اجرا باشد (`npm start`)، وگرنه ECONNREFUSED می‌گیرد — گارد نشده (KI-001).
- **وضعیت آخرین اجرا (2026-08-24):** ✅ همه ۹ سوئیت PASS — قبل از ثبت هر ادعای «پاس» باید واقعاً اجرا شده باشد.
- حجم تقریبی: ~۳۰۰ نقطه assert در ۹ فایل (شمارش grep؛ عدد دقیق اجرا متغیر است).

---

## 13. Current Development State

```
VERSION:            0.9.0
CURRENT BRANCH:     arena/01a02ff4-yasnafit  (هیچ کاری مستقیم روی main ممنوع)
LAST COMMIT:        0f6a28a "fix: portal exercise drawer outside animated content"
LAST VERIFIED:      2026-08-24 (بعد از Task 6: تقویم شمسی + جستجوی سراسری نرمال‌شده + افزودن دستی — همه تست‌ها PASS)
TEST STATUS:        ✅ PASS (۹/۹ سوئیت — نیازمند سرور در حال اجرا برای e2e)
BUILD STATUS:       N/A (بدون مرحله بیلد — جاوااسکریپت خالص)
SERVER STATUS:      اجراشده و سالم روی پورت 3020 (در محیط این تسک)
DATABASE STATUS:    schema 022_mobile_prefix_repair؛ ۳۹ جدول؛ ۲۷۰۷ حرکت؛ داده تستی e2e انباشته می‌شود (ممیزی 2026-08-24 آخرِ روز: ۲۵ شاگرد/۹ برنامه/۳ جلسه تمرین — با هر اجرای e2e رشد می‌کند، بنگرید KI-007)
```

**COMPLETED:** همه ماژول‌های §6 با وضعیت IMPLEMENTED + مستندات ریشه + ۲۲ مایگریشن.
**IN PROGRESS:** سیستم مستندات دائمی (همین پوشه — ایجاد شد در 2026-08-24).
**BLOCKED:** —
**TODO / TECHNICAL DEBT:** → `TODO.md` (خلاصه: کاتالوگ ۱۲ سیستم، پخش ویدیو، آپلود عکس از UI، فیلد تجهیزات/عضله هدف، سینک، اندروید، جداول legacy).

---

## 14. Known Architectural Gaps

1. ~~وب ۵ سیستم ↔ موبایل ۱۲~~ — رفع شد (2026-08-24، BR-14/KI-002). باقی‌مانده: کاتالوگ فقط در فرانت‌اند است (T-14 برای سینک آینده).
2. **سینک:** فقط metadata؛ هیچ کد سینک/سرور مرکزی وجود ندارد.
3. **کاتالوگ سیستم‌ها در DB نیست** — فقط در فرانت‌اند؛ ریسک واگرایی وب/موبایل.
4. **پخش ویدیو در UI نیست** با اینکه مسیرها سرو می‌شوند.
5. **جداول legacy** (`movements`, `programs`, `orders`, `measurements`, `activity_log`) خارج از مدل نرمال — نیازمند تصمیم مهاجرت/حذف در آینده.
6. **داده تستی e2e** داخل DB محلی می‌ماند (۹ شاگرد/۳ برنامه) — تمیزکاری دوره‌ای لازم.
7. **Rate limiter در حافظه** — با ری‌استارت ریست می‌شود (برای local تک‌کاربره قابل‌قبول).
8. **`node:sqlite` experimental** — هشدار رسمی Node؛ خطر تغییر API در آینده.
9. **عکس‌ها/ویدیوها gitignore** — کلون تازه ۱٬۸۸۸ عکس ندارد (باید با لانچر ایمپورت شود).
10. **گزارش‌های قدیمی** → `archive/` همین پوشه.

---

## 15. DO NOT BREAK (قواعد تخلف‌ناپذیر)

1. **هرگز مستقیم روی `main` کار نکن** — فقط شاخه‌های Arena مطابق قواعد جلسه.
2. **هرگز «اصطلاح ممنوع پروژه» را به هیچ شکلی (کامل/فاصله‌دار/تقسیم‌شده) ننویس** — فقط «شاگرد» (گارد تست فعال است).
3. **فایل/رسانه خصوصی شاگرد را هرگز از `public/` سرو نکن.**
4. **منبع حقیقت نرمال‌شده DB را دور نزن** — JSON فقط transport، همیشه از DB بازسازی شود.
5. **مایگریشن‌ها را حذف/بازنویسی نکن** — فقط افزودن مایگریشن جدید مجاز است.
6. **API موجود را بی‌صدا تغییر نده** — تغییر = ثبت در CHANGELOG توسعه‌ای + TECHNICAL-DECISIONS.
7. **حرکت تمرینی غیرواقعی نساز** — فقط از بانک/دیتاست ۲۷۰۷ تایی.
8. **فراخوانی AI در پروداکشن ممنوع** (BR-8).
9. **قواعد کسب‌وکار (BR-*) را بدون ثبت تصمیم تغییر نده.**
10. **حذف عملکرد موجود بدون تأیید صریح مالک ممنوع.**
11. **توکن/رمز/کلید را در مستندات، چت یا Git افشا نکن.**
12. **مستندات ریشه (README/ARCHITECTURE/DATABASE_SCHEMA/CHANGELOG محصولی/EXERCISE_MANAGEMENT) را حذف نکن** — با این پوشه تکمیل می‌شوند نه جایگزین.
13. **تست‌ها را بدون اجرا «پاس» اعلام نکن.**
14. بعد از هر تسکِ تغییردهنده: این فایل + `CHANGELOG.md` توسعه‌ای را به‌روز کن (§فرایند پایین).

---

## فرایند به‌روزرسانی (پس از هر تسک توسعه)

۱) تسک را کامل کن ← ۲) تست را اجرا کن ← ۳) نتیجه را بازرسی کن ← ۴) تغییرات/اثر معماری/قواعد/باگ/TODO را تعیین کن ← ۵) `PROJECT-CONTEXT.md` (در صورت تغییر وضعیت دائمی)، `CHANGELOG.md` (همیشه)، `TODO.md`، `KNOWN-ISSUES.md`، `TECHNICAL-DECISIONS.md` (در صورت نیاز) را به‌روز کن. **این مرحله اختیاری نیست.**

### قاعده مالک (BR-13 — 2026-08-24): راهنمای کوتاه به‌روزرسانی در پایان هر تسک
در پایان **هر** تسک/جلسه، یک راهنمای کوتاه PowerShell برای دریافت آخرین تغییرات ارائه شود.
**مهم:** هر جلسه Arena یک شاخه جدید دارد — همیشه «شاخه جلسه فعلی» اعلام شود و کاربر از دستورهای قدیمی جلسات قبل استفاده نکند (رخداد واقعی: کاربر به شاخه جلسه قبلی pull می‌زد و چیزی نمی‌آمد). شاخه جلسه فعلی: `arena/01a02ff4-yasnafit`
```powershell
cd <مسیر پوشه yasnafit روی سیستم شما>
git fetch origin
git switch <شاخه جلسه فعلی>
git pull --ff-only origin <شاخه جلسه فعلی>
.\YASNAFIT-LAUNCHER.bat   # گزینه 1
```
نکته‌ها: دیتابیس `data/` و عکس‌های ایمپورت‌شده gitignore هستند و با pull دست نمی‌خورند؛ وابستگی جدیدی اضافه نشده (npm install لازم نیست).
