# YasnaFit Project Context

> **این سند حافظه فنی دائمی پروژه YasnaFit است.**
> بعد از هر تسک توسعه، این فایل باید به‌روز شود (قواعد کامل: انتهای همین فایل و `CHANGELOG.md`).
> هر ادعایی در این سند یکی از این وضعیت‌ها را دارد: `VERIFIED` (تأییدشده با کد/اجرا)، `PARTIALLY VERIFIED`، `NOT VERIFIED`، `NOT IMPLEMENTED`.

**آخرین به‌روزرسانی:** 2026-09-10 — **Task 15 (یکپارچه‌سازی تلگرام):** ربات + موتور اعلان + تحویل با retry/dedup اضافه شد (`src/telegram-service.js`، `src/notification-service.js`، مایگریشن 031 با ۴ جدول جدید، مسیرهای `/api/telegram/webhook` و `/api/student/telegram/*` و `/api/coach/telegram*`). تلگرام **فقط کانال اعلان** است و هرگز منبع حقیقت نیست؛ بدون env (TELEGRAM_BOT_TOKEN/USERNAME/WEBHOOK_SECRET/YASNAFIT_PUBLIC_URL) کل قابلیت no-op امن است. جزئیات کامل: `CHANGELOG.md` همین پوشه و TD-24. (پیش از این: 2026-09-08 —) **Task 25: اصلاح بخش‌های احراز هویت (§3 ردیف «احراز هویت» + متغیرهای محیطی، §6 ردیف Authentication، §11)** چون مکانیزم قدیمی «توکن مربی» در Task 16 (2026-09-02) حذف شده بود ولی اینجا هنوز `VERIFIED`/فعلی نوشته می‌شد. شمارنده‌های قابل‌راستی‌آزمایی هم در همین پاس اصلاح شدند (طول `server.js`، تعداد مایگریشن، تعداد سوئیت تست، نسخه)؛ تنها **تعداد جدول‌ها (۳۹)** همچنان snapshot 2026-08-24 است و بازراستی‌آزمایی نشده. مرجع زندهٔ وضعیت جلسه/استقرار: فایل حافظهٔ ریشهٔ مخزن.
**نسخه برنامه:** 0.9.1 (مقدار فعلی `package.json` — در این تسک تغییر نکرد) • **وضعیت تست‌ها:** ۲۱/۲۱ سوئیت پاس (`npm test` شامل `test:telegram` جدید؛ اجرای واقعی در 2026-09-10، سندباکس Agent)

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
| Backend | **یک فایل `server.js` (~۲۸۴۸ خط در 2026-09-08)** — HTTP سرور خالش Node بدون Express؛ روتر دستی با regex روی pathname |
| دیتابیس | `node:sqlite` داخلی (experimental) → `data/yasnafit.db` حالت WAL، `foreign_keys=ON`؛ ۳۹ جدول |
| Frontend | Vanilla JS + HTML + CSS خالص؛ بدون فریم‌ورک/باندلر؛ دو شل جدا: `public/index.html` (مربی) و `public/student.html` (شاگرد) |
| API | REST‌مانند JSON با پیشوندهای `/api/...`؛ رشته‌های خطا فارسی |
| سرویس‌ها | لایه `src/*-service.js` (program, student, assessment, engagement, upload, release, audit, student-auth, student-session, assessment-document) + `src/database.js`، `src/migrations.js`، `src/validation.js` |
| احراز هویت | `VERIFIED` (بازبینی کد 2026-09-08 — Task 25) **مربی:** ایمیل + رمز (scrypt) + **TOTP گوگل‌اتنتیکاتور**؛ فلوی سه‌مرحله‌ای `/coach/login` → `/coach/2fa` با API‌های `/api/coach/auth/{setup,login,challenge,verify,forgot,reset,change-password,logout,logout-all,status,mail}`. کوکی `yasnafit_coach_session` (HttpOnly, SameSite=Strict, Path=/, Max-Age ۱۲ ساعت، `+Secure` روی HTTPS) و کوکی چلنج `yasnafit_coach_challenge` (۵ دقیقه). ایمیل مربی در کد قفل است (`SETUP_EMAIL` در `src/coach-auth-service.js`) و ساخت حساب فقط از لوپ‌بک مجاز است (مگر `YASNAFIT_ALLOW_REMOTE_SETUP=1`). **مکانیزم قدیمی «توکن فایل محلی `data/coach-access-token` + کوکی per-boot + Bearer با env مشترک» در Task 16 کاملاً حذف شده** و مسیر `/coach-access/*` عمداً **۴۰۴** برمی‌گرداند. **شاگرد:** موبایل + رمز scrypt + نشست تصادفی ۳۲ بایتی که فقط هشش در `student_sessions` ذخیره می‌شود؛ ورود با لینک دعوت یک‌بارمصرف `/join/:token` |
| Storage | استاتیک از `public/`؛ فایل‌های خصوصی شاگرد در `data/assessments` و `data/assessment-documents` (خارج از public) با محافظ path-traversal |
| آماده‌سازی سینک | stable_id + version + soft-delete روی موجودیت‌های sync (بنگرید §5) |
| Migrations | **۳۰ مایگریشن** نسخه‌ای idempotent در `src/migrations.js` (`001_initial` … `030_coach_totp_authenticator`)؛ جدول `schema_migrations`؛ `settings.schema_version` |
| تست | **۱۸ سوئیت رگرسیون** در زنجیرهٔ `npm test` + `npm run test:e2e` جدا — با `node:assert` و بدون فریم‌ورک تست خارجی |

**متغیرهای محیطی شناخته‌شده** `VERIFIED` (اسکن `process.env` در `server.js` + `src/*.js` — 2026-09-08): `PORT`، `NODE_ENV`، `YASNAFIT_HOST` (fallback به `HOST`؛ پیش‌فرض `0.0.0.0`)، `YASNAFIT_TRUST_PROXY` (تنها دروازهٔ خواندن `X-Forwarded-*`)، `YASNAFIT_COOKIE_SECURE`، مسیرهای دائمی `YASNAFIT_DATA_DIR` / `YASNAFIT_BACKUP_DIR` / `YASNAFIT_MEDIA_DIR` / `RAILWAY_VOLUME_MOUNT_PATH` (همه از `src/storage-paths.js`)، ایمیل `YASNAFIT_SMTP_{HOST,PORT,USER,PASS,FROM,SECURE}`، و فقط برای تست/ابزار: `YASNAFIT_BASE_URL`، `YASNAFIT_COACH_EMAIL`، `YASNAFIT_COACH_PASSWORD` (`tests/e2e-workflow.js` و `scripts/provision-coach-totp.js`). سه فلگ **موقت/اضطراری** هم وجود دارد که باید بعد از استفاده پاک شوند: `YASNAFIT_ALLOW_REMOTE_SETUP`، `YASNAFIT_ALLOW_2FA_SKIP`، `YASNAFIT_REVEAL_AUTHENTICATOR_KEY`. ⚠️ **`YASNAFIT_COACH_TOKEN` دیگر در کد وجود ندارد** (حذف در Task 16) و گارد `tests/deployment-hardening-regression.js` مستندشدنش را هم ممنوع کرده است. مقدار هیچ متغیری هرگز در مستندات، چت یا Git نوشته نمی‌شود — فقط نام‌ها.

---

## 4. Directory Structure

`VERIFIED` — 2026-08-24

```
yasnafit/
├── server.js                  ← کل HTTP سرور: روتینگ، احراز هویت، API، سرو فایل استاتیک
├── src/
│   ├── database.js            ← اتصال DB، seed، ایمپورت ۲۷۰۷ حرکت از JSON
│   ├── migrations.js          ← ۳۰ مایگریشن (001_initial … 030_coach_totp_authenticator)
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
├── tests/                     ← ۱۸ سوئیت رگرسیون + e2e
├── tool/                      ← اسکریپت‌های کمکی (program-helper.py)
├── docs/project-tracking/     ← همین سیستم مستندات (منبع حقیقت فنی)
├── YASNAFIT-LAUNCHER.bat      ← لانچر ویندوز (اجرای سرور، ایمپورت عکس‌ها و...)
└── README.md / ARCHITECTURE.md / DATABASE_SCHEMA.md / CHANGELOG.md / EXERCISE_MANAGEMENT.md
```

فایل‌های ریشه‌ای مستندات موجود (نباید حذف شوند): `README.md` (راهنمای دوزبانه + راهنمای پلتفرم Morabiha)، `ARCHITECTURE.md` (معماری harden‌شده)، `DATABASE_SCHEMA.md` (اسکیمای مرجع)، `CHANGELOG.md` (تاریخچه **محصولی** — با CHANGELOG توسعه‌ای این پوشه اشتباه گرفته نشود)، `EXERCISE_MANAGEMENT.md` (مدیریت حرکات).

---

## 5. Database Architecture

`PARTIALLY VERIFIED` — ۳۹ جدول (بدون جدول‌های سیستمی sqlite)؛ **این شمارش snapshot 2026-08-24 است** و بعد از مایگریشن‌های ۰۲۳…۰۳۰ بازراستی‌آزمایی نشده.

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
| Authentication | **IMPLEMENTED** `VERIFIED` (بازبینی 2026-09-08 — Task 25) | مربی: ایمیل+رمز+TOTP سه‌مرحله‌ای، نشست ۱۲ ساعته، قفل ۱۵ دقیقه‌ای پس از ۳ خطای کد یا ۵ خطای رمز، بازیابی رمز با لینک ۱۵ دقیقه‌ای • شاگرد: scrypt + سشن هش‌شده — دو مسیر کاملاً جدا. توکن مشترک قدیمی حذف شده (`/coach-access/*` = ۴۰۴) |
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
| BR-14 | کاتالوگ ۱۲ سیستم تمرینی مالک (لیست §7) تک‌نمایشی است؛ سقف حرکت هر سیستم در UI اجباری؛ بانک حرکات پس از هر انتخاب بسته نمی‌شود (بستن فقط دستی)؛ حذف روز با تأیید از منوی ⚙️ روز مجاز است (اصلاح مالک 2026-08-24)؛ ترتیب حرکات انتخابی حفظ شود | `VERIFIED` (2026-08-24) |

---

## 11. Security Rules

`VERIFIED` — خلاصه (مقادیر محرمانه هرگز در مستندات نمی‌آید):

- **دسترسی مربی (از Task 16 — 2026-09-02):** ایمیل قفل‌شده در کد + رمز scrypt + **TOTP شش‌رقمی** (`src/totp.js`: دورهٔ ۳۰ ثانیه، تلورانس `window=1` ⇒ ±۳۰ ثانیه، کد یک‌بارمصرف با `totp_last_counter`). فلوی سه‌مرحله‌ای `/coach/login` → `/coach/2fa`؛ کوکی `yasnafit_coach_session` (HttpOnly, SameSite=Strict, Path=/, Max-Age = `SESSION_TTL_MS` ۱۲ ساعت، `Secure` روی HTTPS) + کوکی چلنج `yasnafit_coach_challenge` (`OTP_TTL_MS` ۵ دقیقه). قفل‌ها: `MAX_OTP_FAILURES=3` و `MAX_PASSWORD_FAILURES=5` ⇒ `LOCK_MS=15 دقیقه`؛ لینک بازیابی رمز `RESET_TTL_MS=15 دقیقه` اعتبار دارد و در نبود SMTP در `data/coach-reset-dev.txt` نوشته می‌شود. نشست تصادفی ۳۲ بایتی است و کلید TOTP در `coaches.totp_secret` روی همان سرور نگهداری می‌شود؛ در UI هرگز نمایش داده نمی‌شود (راه‌های بازیابی/چرخش: `DEPLOYMENT.md` §۹.۸). ⚠️ **مکانیزم قبلی — فایل `data/coach-access-token`، مسیر `/coach-access/{token}` و Bearer با env مشترک — حذف شده و `/coach-access/*` عمداً ۴۰۴ است**؛ هیچ مسیر HTTP برای خواندن توکن مشترک وجود ندارد.
- **شاگرد:** رمز scrypt، سشن هش‌شده در DB با انقضا، کوکی HttpOnly/SameSite=Strict.
- **Rate limiting:** روی لینک دعوت (۲۰/۱۰دقیقه)، join (۳۰/دقیقه)، ورود شاگرد (۳۰/۱۵دقیقه) — در حافظه (ریست با ری‌استارت).
- **هدرهای امنیتی (متمرکز از Task 16):** `src/request-security.js` روی **همهٔ پاسخ‌ها** اعمال می‌شود — CSP (`default-src 'self'` + `script-src 'self'` ⇒ اسکریپت درون‌خطی و `on*=` در `public/*.html` ممنوع، گارد تست فعال)، `X-Content-Type-Options: nosniff`، `X-Frame-Options: DENY`، `Referrer-Policy: no-referrer`، `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy: same-origin` و `Permissions-Policy` بسته. مدارک/فایل‌های خصوصی CSP جدا `default-src 'none'` + `Cache-Control: private, no-store` دارند. **تنها** جای خواندن `X-Forwarded-*` در کل مخزن همین ماژول است و فقط با `YASNAFIT_TRUST_PROXY=1`.
- **Same-origin** برای تغییرات (mutation) شاگرد.
- **مغالطه مسیر (path traversal):** محافظ `isWithin(root,…)` روی سرو فایل‌های خصوصی.
- **ممیزی:** رویدادهای ساختاریافته با redaction.
- **DO NOT:** افشای توکن/رمز/کلید در مستندات، chat یا Git.

---

## 12. Testing

- **فریم‌ورک:** `node:assert/strict` + fetch — بدون وابستگی خارجی؛ ۱۸ سوئیت در `npm test` + `tests/e2e-workflow.js`.
- **انواع:** رگرسیون مایگریشن، UI-design (استاتیک روی سورس)، واژگانی، auth، سشن شاگرد، پروفایل ارزیابی، engagement، مدیریت شاگرد، و **e2e** (چرخه کامل دعوت→آنبوردینگ→ارزیابی→برنامه→تمرین→ماه دوم→ایزوله‌سازی).
- **دستور:** `npm test` (یا تک‌تک: `npm run test:e2e` و…).
- **شرط e2e:** سرور باید روی 3020 در حال اجرا باشد (`npm start`)، وگرنه ECONNREFUSED می‌گیرد — گارد نشده (KI-001).
- **وضعیت آخرین اجرا (2026-09-08، سندباکس Agent):** ✅ `npm test` = **۱۸/۱۸ سوئیت PASS** (exit 0) — قبل از ثبت هر ادعای «پاس» باید واقعاً اجرا شده باشد.
- حجم تقریبی: ~۳۰۰ نقطه assert در ۹ فایل (شمارش grep؛ عدد دقیق اجرا متغیر است).

---

## 13. Current Development State

```
VERSION:            0.9.1  (مقدار package.json — در مستندات تغییر داده نمی‌شود)
CURRENT BRANCH:     شاخهٔ جلسهٔ جاری Arena (هیچ کاری مستقیم روی main ممنوع) — نام دقیق شاخه فقط در §۱۷ فایل حافظهٔ ریشهٔ مخزن و در گزارش پایان هر جلسه اعلام می‌شود
MAIN:               607587f  (merge PR #5 = Task 24)
LAST COMMIT (main): 607587f "Merge pull request #5" (Task 24 — جایگزینی درجای تولید پیش‌نویس هوشمند)
LAST VERIFIED:      2026-09-08 (Task 25 — بازبینی احراز هویت و شمارنده‌ها؛ `npm test` = ۱۸/۱۸ PASS؛ `GET /api/health` روی production = `0.9.1` با uptime 418274)
TEST STATUS:        ✅ PASS (۱۸/۱۸ سوئیت — `test:e2e` نیازمند سرور در حال اجراست، KI-001)
BUILD STATUS:       N/A (بدون مرحله بیلد — جاوااسکریپت خالص)
SERVER STATUS:      اجراشده و سالم روی پورت 3020 (در محیط این تسک)
DATABASE STATUS:    schema 030_coach_totp_authenticator؛ ۳۹ جدول (snapshot 2026-08-24)؛ ۲۷۰۷ حرکت در دیتاست مرجع؛ داده تستی e2e انباشته می‌شود (ممیزی 2026-08-24 آخرِ روز: ۲۵ شاگرد/۹ برنامه/۳ جلسه تمرین — با هر اجرای e2e رشد می‌کند، بنگرید KI-007)
```

**COMPLETED:** همه ماژول‌های §6 با وضعیت IMPLEMENTED + مستندات ریشه + `DEPLOYMENT.md` + ۳۰ مایگریشن + لایهٔ امنیتی متمرکز (Task 16) + استقرار Railway (§۶ حافظه).
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

**قاعده سرعت (اصلاح مالک — 2026-08-24):** اندازهٔ بررسی/تست/مستندسازی با اندازهٔ تسک متناسب باشد —
- **تسک کوچک (UI/CSS/متن):** خواندن فقط مستنداتِ مرتبط، اجرای فقط تست‌های مرتبط (حداقل terminology برای متن فارسی + تستِ همان ناحیه)، بدون بازبینی کل پروژه. اگر رفتار/معماری/قواعد تغییری نکرد → مستندات بازنویسی نشود.
- **تسک بزرگ (DB/API/معماری/امنیت/سینک/منطق اصلی):** بررسی عمیق + تست کامل + به‌روزرسانی مستندات طبق چرخه زیر.

۱) تسک را کامل کن ← ۲) تستِ متناسب را اجرا کن ← ۳) نتیجه را بازرسی کن ← ۴) فقط در صورت تغییر وضعیت دائمی: `PROJECT-CONTEXT.md`، `CHANGELOG.md` (همیشه برای تغییر واقعی)، `TODO.md`، `KNOWN-ISSUES.md`، `TECHNICAL-DECISIONS.md` را به‌روز کن. **صحت و ایمنی فدای سرعت نمی‌شود.**

### قاعده مالک (BR-13 — 2026-08-24): راهنمای کوتاه به‌روزرسانی در پایان هر تسک
در پایان **هر** تسک/جلسه، یک راهنمای کوتاه PowerShell برای دریافت آخرین تغییرات ارائه شود.
**مهم:** هر جلسه Arena یک شاخه جدید دارد — همیشه «شاخه جلسه فعلی» اعلام شود و کاربر از دستورهای قدیمی جلسات قبل استفاده نکند (رخداد واقعی: کاربر به شاخه جلسه قبلی pull می‌زد و چیزی نمی‌آمد). نام شاخهٔ جلسهٔ فعلی را **همیشه** از §۱۷ فایل حافظهٔ ریشهٔ مخزن یا از گزارش پایان همان جلسه بگیرید (این سند عمداً نام شاخهٔ ثابتی نگه نمی‌دارد تا کهنه نشود)
```powershell
cd C:\Users\MAHDI\Desktop\yasnafit-git
git pull --ff-only origin <شاخه جلسه فعلی>
.\YASNAFIT-LAUNCHER.bat
```
سپس منوی لانچر می‌آید → گزینه 1 (Start Server & Open Dashboard). **قالب ثابت: فقط همین دستورات، بدون توضیح اضافه — قاعده مالک 2026-08-24.** (اگر سرور روشن است ابتدا با گزینه 3 لانچر Stop شود یا پنجره قبلی بسته شود؛ اگر مرورگر نسخه قدیم نشان داد Ctrl+F5.)
نکته‌ها: دیتابیس `data/` و عکس‌های ایمپورت‌شده gitignore هستند و با pull دست نمی‌خورند؛ وابستگی جدیدی اضافه نشده (npm install لازم نیست).
