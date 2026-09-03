# MAHDI HELLP — YASNAFIT PERSISTENT AGENT MEMORY

> **این فایل حافظهٔ دائمی پروژه است.** اولین کاری که هر Agent/Arena جدید باید بکند: فقط همین فایل را بخواند، سپس سراغ فایل‌های مرتبط با تسک جاری برود. **کل مخزن یا همهٔ مستندات را ناخوانده باز نکنید.**
> آخرین به‌روزرسانی: **2026-09-03** (توسط Agent جلسهٔ `arena/01a0671e-yasnafit` — تأیید زندهٔ redeploy Task 22 + Task 23: رفع دکمه‌های مردهٔ CSP در بانک برنامه‌ها).
> هر مقدار تأییدنشده با برچسب `UNKNOWN — needs verification` آمده است. هیچ مقدار اختراعی در این فایل نیست.

---

## 1. Owner / Communication

* **Owner:** Mehdi (مهدي / مهدی)
* **زبان ارتباط:** **فارسی** — گزارش، توضیح باگ، جمع‌بندی نهایی. نام‌های فنی، کد، دستور، مسیر فایل، نام شاخه، URL و API به انگلیسی می‌مانند.
* **Project:** YasnaFit (در کد/مخزن با نام `yasnafit` / `Yasnafit`؛ در UI «مربیها / مربی» و «شاگرد»)
* **قاعدهٔ ثابت گزارش (مالک، الزامی):** در **پایان هر گزارش** باید دقیقاً بلوک دستورهای ویندوز (§14 و انتهای این فایل) بیاید و **فقط نام شاخه** با شاخهٔ جلسهٔ جاری جایگزین شود. حذف یا تغییر ساختار آن ممنوع.
* **عبارات ممنوع:** «اصطلاح ممنوع پروژه» (گارد تست فعال — فقط «شاگرد» نوشته می‌شود).

---

## 2. Project Purpose

پلتفرم محلی (local-first) مربی‌گری فیتنس: ثبت **شاگرد** دائمی با شمارهٔ همراه به‌عنوان نام کاربری، لینک دعوت یک‌بارمصرف برای ورود امن، فرم ارزیابی چندمرحله‌ای (ساختاریافته/مغلف)، ساخت **برنامهٔ تمرینی ماهانه** با ساختار Day → System → Movement → Set، برنامهٔ تغذیه و مکمل، اجرای واقعی تمرین (prescribed vs performed)، پیام/نوتیفیکیشن/ممیزی، خروجی PDF برنامه، و بانک ۲۷۰۷ حرکت تمرینی با عکس/ویدیوی محلی.

**مدل داده‌ای کلیدی:** دیتابیس نرمال‌شدهٔ SQLite «منبع حقیقت» است؛ JSON فقط لایهٔ انتقال/همگام‌سازی است که از DB بازسازی می‌شود.

---

## 3. Current Architecture

* **Backend:** `server.js` (تک‌فایل، ~۱۶۱KB) — `http.createServer` بدون فریم‌ورک؛ روتینگ دستی `/api/*` + سرو استاتیک. توابع مشترک: `send()/sendError()`، `readBody()` (سقف `MAX_BODY_SIZE = 1MB`)، `rateLimit()`، `isSafePath()`.
* **Services:** `src/*.js` — `database.js`, `migrations.js`, `validation.js`, `student-service.js`, `student-auth-service.js`, `student-session-service.js`, `coach-auth-service.js`, `assessment-service.js`, `assessment-document-service.js`, `engagement-service.js`, `program-service.js`, `diet-program-service.js`, `supplement-program-service.js`, `audit-service.js`, `upload-service.js`, `ai-service.js`, `release-service.js`, `totp.js`, `qr-svg.js`, `build-info.js`, **`request-security.js` (جدید)**.
* **Frontend:** بدون بیلد؛ `public/index.html` = شل SPA مربی (۱۴ فایل CSS + ۱۶ فایل JS، ازآخر `public/boot.js`)، `public/student.html` = شل اختصاصی شاگرد (بدون سایدبار مربی). ماژول‌های اصلی: `app.js`, `core.js`, `students.js`, `exercises.js`, `program-builder.js`, `program-pdf.js`, `diet-programs.js`, `supplement-programs.js`, `coach-submissions.js`, `releases.js`, `ai-settings.js`, `ai-copilot.js`, `student-app.js`, `assessment-wizard.js`, `jalali*.js`, `localization.js`.
* **Design system:** سلسله‌مراتب مونوکروم مشکی/سفید؛ تنها `public/theme.css` مجاز به تعریف هگز رنگ است؛ `!important` ممنوع (گارد `tests/ui-design-regression.js`).
* **Database:** SQLite (`node:sqlite` — experimental) در `data/yasnafit.db`، `journal_mode=WAL`، `foreign_keys=ON`. مایگریشن‌ها هنگام بالا آمدن سرور خودکار اجرا می‌شوند.
* **Authentication:**
  * **مربی:** ایمیل + رمز + TOTP گوگل‌اتنتیکاتور (flow سه‌مرحله‌ای: `/coach/login` → `/coach/2fa`). کوکی `yasnafit_coach_session` (HttpOnly, SameSite=Strict, Path=/, +`Secure` در HTTPS) و کوکی چلنج `yasnafit_coach_challenge`. ایمیل مربی در کد قفل است: `crypto.javan17@gmail.com`. **توکن مشترک `YASNAFIT_COACH_TOKEN` و مسیر `/coach-access/*` حذف شده‌اند** (۴۰۴). بازیابی رمز با لینک ایمیلی (App Password جیمیل) و در نبود SMTP با نوشتن در `data/coach-reset-dev.txt`.
  * **شاگرد:** شمارهٔ همراه + رمز scrypt؛ نشست تصادفی ۳۲ بایتی که فقط هشش در DB ذخیره می‌شود؛ کوکی `yasnafit_student_session`؛ ورود از لینک دعوت `/join/:token` (یک‌بارمصرف).
* **File storage:** آپلود عکس بدن/مدارک خصوصی با `src/upload-service.js` (سقف ۵MB هر فایل، ۱۰ فایل هر ارزیابی، ۲۰MB multipart، allowlist MIME+پسوندم + بررسی امضای بایت + `sanitizeFileName`)؛ فایل‌های خصوصی **هرگز از `public/` سرو نمی‌شوند** و فقط با نشست متناظر خوانده می‌شوند. عکس/ویدیوی حرکات: `public/assets/images/exercises/imported/` (gitignored، ~۱۸۸۸ فایل فقط لوکال) و `/files/exercise/*`. **از Task 22** عکس‌های حرکات علاوه‌بر ریپو از **Volume** هم سرو می‌شوند: `mediaDir` = `YASNAFIT_MEDIA_DIR` || `<dataDir>/media` و `exerciseImagesDir` = `<mediaDir>/images/exercises/imported` (در `src/storage-paths.js`)؛ ترتیب خواندن: ریپو → Volume؛ **ویدیوها repo-side می‌مانند** (تصمیم مالک — روی Railway ۴۰۴).
* **Security layer (جدید، §Task 16):** `src/request-security.js` — CSP یکنواخت + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer` + `Permissions-Policy` + `Cross-Origin-Opener/Resource-Policy` که روی **همهٔ پاسخ‌ها** اعمال می‌شود؛ تنها جای خواندن `X-Forwarded-*` در کل مخزن همین فایل است و فقط با `YASNAFIT_TRUST_PROXY=1`.
* **Railway deployment:** از 2026-09-02 **`railway.json` در ریشه وجود دارد** (Nixpacks + `node server.js` + `healthcheckPath: /api/health` + `numReplicas: 1`) و همهٔ مسیرهای دائمی (دیتابیس، عکس‌ها/اسناد خصوصی، بکاپ‌ها) از `src/storage-paths.js` خوانده می‌شوند تا روی Volume بنشینند. همچنان **Dockerfile/Procfile/CI وجود ندارد** و مسیر جایگزینِ مستندشده VPS + nginx + systemd است (`DEPLOYMENT.md` §۱–۸؛ §۹ مخصوص Railway). وضعیت اکانت Railway: `UNKNOWN — needs verification` (§۶).
* **Android/mobile:** هیچ کد موبایل در مخزن نیست (فقط فلوی موبایل-پسند UI شاگرد). TODO: T-08.
* **Synchronization:** لایهٔ سینک **وجود ندارد**؛ زیرساخت آماده است (`stable_id`, `version`, soft-delete). TODO: T-07.

---

## 4. Repository

* **GitHub:** `https://github.com/cryptojavan17-hub/yasnafit`
* **مسیر لوکال (مهدی):** `C:\Users\MAHDI\Desktop\yasnafit-git`
* **شاخه‌های مهم:** `main` — از ۲۰۲۶-۰۹-۰۲ **`50aaa53` = اپ کامل** (PR #2 merge شد؛ قبلاً فقط `README.md` + `login-hero.png` بود، و آن تصویر با `R100` به `public/login-hero.png` منتقل شد). `086f3e0` («Add exact login hero image - do not change face») پدر آن است
* **شاخهٔ کاری جلسه:** `arena/01a0671e-yasnafit` (از `main` = `8354a68` = merge PR #3 ساخته شده) — همهٔ کارها فقط روی همین شاخه، push فقط به همین شاخه. شاخه‌های قبلی (`arena/01a066e6-yasnafit` با tip `6e79fd9`، و `arena/01a0618b-yasnafit`) آرشیو هستند.
* **مستندات ریشه (حذفشان ممنوع):** `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `CHANGELOG.md` (محصولی/نسخه‌ها), `EXERCISE_MANAGEMENT.md`, **`DEPLOYMENT.md` (جدید)**.
* **مستندات پیگیری:** `docs/project-tracking/` → `PROJECT-CONTEXT.md` (کسب‌وکار + قواعد)، `CHANGELOG.md` (توسعه/تسک‌ها — Task 1…17)، `KNOWN-ISSUES.md` (KI-001…KI-013)، `TODO.md` (T-01…T-16)، `TECHNICAL-DECISIONS.md` (TD-*)، `archive/`.

---

## 5. Git / Arena State

| مورد | وضعیت تأییدشده |
|---|---|
| شاخهٔ جاری | `arena/01a0671e-yasnafit` (از `main` = `8354a68` = merge PR #3 ساخته شد) |
| آخرین کامیت | Task 23 (fix: دکمه‌های مردهٔ CSP) روی docs(memory) روی `8354a68` (merge PR #3 = Task 22 روی main) |
| کامیت قبلی | `6e79fd9` (docs memory جلسهٔ قبل) • `e60d3eb` (Task 22) • `50aaa53` (merge PR #2) |
| working tree | **تمیز** بعد از کامیت Task 23 (`git status --short` خالی) |
| local vs origin | شاخهٔ جلسه به origin push شده؛ `main` = `8354a68` (PR #3 MERGED در 2026-09-03 11:24 UTC) |
| PR | **#3 MERGED** (Task 22 → main) • #2 MERGED • #1 CLOSED • **PR #4 (Task 23 → main) — merge با تأیید مالک** |
| وضعیت merge | محتوای PR #3 روی `main` است و deploy شده (تأیید با ریست uptime) |
| اقدامات باز | (۱) مالک: لاگ `[Media]` و تست چشمی `/api/exercise-image/4` برای بستن کامل KI-015 (۲) merge PR #4 + Check for updates در Railway (۳) مهدی در ویندوز: بلوک bat §17 (۴) پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست (۵) Auto-deploy Railway خاموش است — روشن‌کردن پیشنهاد شد |
| هشدار Arena (تجربهٔ واقعی) | سندباکس ممکن است بین جلسات بازسازی شود و HEAD را به کامیتی قدیمی برگرداند. در آن صورت فقط در سندباکس: `git fetch -q origin arena/01a0671e-yasnafit` + `git update-ref refs/heads/arena/01a0671e-yasnafit FETCH_HEAD` + `git reset --hard FETCH_HEAD` (بدون تغییر شاخه، بدون force-push). **روی ماشین لوکال مهدی این کار را نکنید** — آنجا `git pull --ff-only`. |

---

## 6. Railway Deployment

**حساب:** مهدی با ایمیل `yasnafit@atomicmail.io` پلن یک‌ماههٔ رایگان Railway گرفته (تاریخ ثبت: 2026-09-02). **اتصال انجام شده:** سرویس `yasnafit-production.up.railway.app` بالا است (تأیید از `GET /api/health` → `0.9.1` و `GET /api/coach/auth/status`). Agent به داشبورد Railway دسترسی ندارد؛ volume/region/commitِ دیپلوی‌شده از بیرون قابل تشخیص نیست ⇒ `UNKNOWN — needs verification`.
* **اولین attempt واقعی (لاگ مهدی، ۲۰۲۶-۰۹-۰۲ ۲۱:۵۵):** سرویس **`main`** را build کرد (آن موقع `main` خالی بود؛ بعداً PR #2 merge شد و این حالت تمام شده)

* **سمت مخزن (انجام‌شده، commit همین جلسه):** `railway.json` در ریشه — `builder: NIXPACKS`، `buildCommand: npm install --no-audit --no-fund && node --check server.js` (build خراب را زود می‌شکند)، `startCommand: node server.js`، `healthcheckPath: /api/health` (عمومی و سبک — دقیقاً همین را Railway پروب می‌کند)، `restartPolicyType: ON_FAILURE` + `maxRetries: 5`، `numReplicas: 1`، `sleepApplication: false`، `watchPatterns` فقط `server.js|src/**|public/**|data-source/**|package.json|railway.json`.
* **پشتیبانی state (مرجع واحد):** ماژول بدون-اثر-جانبی `src/storage-paths.js` مسیرهای دائمی را حل می‌کند: `dataDir = YASNAFIT_DATA_DIR || RAILWAY_VOLUME_MOUNT_PATH || <repo>/data`، `backupDir = YASNAFIT_BACKUP_DIR || (روی کانتینر داخل dataDir) || <repo>/backups`، به‌علاوهٔ `assessmentsDir`/`documentsDir`. پنج نقطه‌ای که `data/` را hardcode داشتند (`src/database.js`, `src/upload-service.js`, `src/assessment-document-service.js`, `src/student-service.js`, `src/migrations.js`) به این ماژول کلید شدند ⇒ هیچ فایل خصوصی بیرون Volume نوشته نمی‌شود؛ رفتار لوکال/ویندوز دقیقاً مثل قبل است.
* **CLI (کارهایی که داشبورد نمی‌کند):** `railway login --browserless`، `railway up`، `railway volume add --mount-path /app/data`، `railway volume attach/list/detach`، `railway variables --set "KEY=value"`، `railway domain`، `railway logs`، `railway ssh -s <service> -- <cmd>` و **`railway volume browse`** (مرورگر فایل تعاملی با upload/download ⇒ عملی‌ترین راه بردن `data\yasnafit.db` لوکال داخل Volume یا بیرون کشیدن بکاپ).
* **Volume (قدم دستی مالک):** Right-click سرویس → **Attach Volume** → Mount Path `/app/data` **یا `/data`** — هر دو کار می‌کند چون برنامه `RAILWAY_VOLUME_MOUNT_PATH` را که Railway inject می‌کند دنبال می‌کند. ⚠️ بعد از نوشته‌شدن داده، mount path را عوض نکنید (مسیر فایل‌های خصوصی در DB به‌صورت absolute ذخیره می‌شود). هر سرویس فقط **یک** Volume دارد و با replica کار نمی‌کند؛ پلن رایگان/trial ~۰٫۵GB.
* **Variables (فقط نام — مقدار در داشبورد):** `NODE_ENV=production`، `YASNAFIT_TRUST_PROXY=1`، `YASNAFIT_COOKIE_SECURE=1`، و **موقتاً** `YASNAFIT_ALLOW_REMOTE_SETUP=1` برای اولین ساخت حساب مربی (بعد از ساخت باید پاک شود). اختیاری/در صورت خطا: `NIXPACKS_NODE_VERSION=22`، `RAILWAY_RUN_UID=0`. **فقط در اضطرار و موقتاً:** `YASNAFIT_REVEAL_AUTHENTICATOR_KEY=1` ⇒ کلید 2FA را یک‌بار در لاگ چاپ می‌کند (§۹.۸)، و `YASNAFIT_ALLOW_2FA_SKIP=1` ⇒ مرحلهٔ کد ۶ رقمی مربی را رد می‌کند تا پنل برای تست باز شود (§۹.۹)؛ هر دو باید بعد از تست پاک شوند (رمز عبور همیشه الزامی می‌ماند و `totp_secret` هم دست‌نخورده). `PORT` را ست نکنید (Railway می‌دهد) و `YASNAFIT_HOST` هم **نگذارید** `127.0.0.1` شود.
* **وضعیت زنده (۲۰۲۶-۰۹-۰۲ ۲۲:۴x، تأییدشده با fetch از بیرون):** `https://yasnafit-production.up.railway.app` بالا است — `GET /api/health` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":856}` (یعنی کد همین شاخه deploy شده) و `GET /api/coach/auth/status` → `setup_required:false، totp_required:false، totp_confirmed:true، mail_configured:false`. **Volume: تأیید نشده** (از بیرون قابل تشخیص نیست؛ با یک redeploy و نگاه‌کردن به شمارش رکوردها ثابت می‌شود).
* **وضعیت زنده (۲۰۲۶-۰۹-۰۳، تأیید مجدد با fetch از بیرون، جلسهٔ `arena/01a066e6-yasnafit`):** سرویس همچنان بالاست — `GET /api/health` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":53053}` (پروسه ~۱۴٫۷ ساعت پیش ری‌استارت شده؛ سازگار با auto-deploy پس از merge PR #2، ولی **کامیت deploy از بیرون تأییدنشده** — قاعدهٔ §6 پایین) و `GET /api/coach/auth/status` → `setup_required:false، totp_confirmed:true، mail_configured:false` (بدون تغییر نسبت به دیروز؛ `mail_email`/`mail_host` در پاسخ هست ولی `mail_configured:false`).
* **وضعیت زنده (۲۰۲۶-۰۹-۰۳، جلسهٔ `arena/01a0671e-yasnafit`):** قبل از ظهر: uptime هنوز ~۵۷هزار (پروسهٔ دیشب ۲۰:۱۲ UTC) چون **Auto-deploy خاموش بود** و merge PR #3 (11:24 UTC) منتشر نشده بود؛ اسکرین‌شات مالک از Settings این را تأیید کرد («Auto deploy is disabled»، Branch = `main`). مالک «Check for updates/Deploy latest» زد ⇒ **~۱۳:۰۴ UTC پروسه ری‌استارت شد** (`uptime: 915` در 13:19 UTC، `version: 0.9.1`) — یعنی کد Task 22 (merge PR #3 = `8354a68`) الان روی production اجرا می‌شود. **هنوز باز:** لاگ `[Media]` (انتظار `Volume: 1888 | ریپو: 0`) و تست چشمی `/api/exercise-image/4` (عکس واقعی نه مربع سفید) — KI-015 تا این دو مورد سبز شود بسته نمی‌شود. نکتهٔ ابزار: fetch ابزار Agent روی هر پاسخ تصویری (حتی SVG سالم `blank-white.svg`) خطای گمراه‌کنندهٔ HTTP 500 می‌دهد ⇒ تشخیص content-type تصویر فقط با لاگ/مرورگر مالک.
* **ماجرای «کد Google Authenticator کار نمی‌کند» (علت قطعی، از کد):** کلید TOTP در دیتابیس همان سرور است (`coaches.totp_secret`) و `setupCoach` آن را `NULL` می‌گذارد؛ در اولین restart، `ensureCoachAuthenticator()` یک **کلید تازه** می‌سازد، `totp_confirmed_at` را ست می‌کند و کلید را در `<mount>/coach-authenticator.txt` می‌نویسد ⇒ کلید قدیمیِ نسخهٔ لوکال روی Railway هیچ‌وقت قبول نمی‌شود. در UI هم هیچ‌وقت کلید نشان داده نمی‌شود (طراحی عمدی؛ مسیر HTTP برای نمایش/چرخش کلید وجود ندارد). راه‌حل‌ها در `DEPLOYMENT.md` §۹.۸: (۱) خواندن فایل از Volume با `railway ssh`/`railway volume browse`، (۲) `node scripts/provision-coach-totp.js --rotate` داخل کانتینر، (۳) اگر CLI ندارید: موقتاً `YASNAFIT_REVEAL_AUTHENTICATOR_KEY=1` و بعد از ورود پاکش کنید. ⚠️ اعداد قفل: `MAX_OTP_FAILURES=3` ⇒ `AUTH_LOCKED` به مدت `LOCK_MS=15 دقیقه`؛ عمر چلنج `OTP_TTL_MS=5 دقیقه`؛ کد یک‌بارمصرف (`totp_last_counter`)؛ تلورانس ساعت ±۳۰ ثانیه (`window=1`).
* **Domain:** Settings → Networking → **Generate Domain** ⇒ `https://<name>.up.railway.app`.
* **شبیه‌سازی Volume با مسیر دلخواه (2026-09-02، موفق):** `RAILWAY_VOLUME_MOUNT_PATH=/tmp/yasna-vol node server.js` ⇒ `yasnafit.db` + `assessments/` + `backups/` همه داخل Volume با مجوز `drwx------` و seed ۲۷۰۷ حرکت ✅. (e2e روی این حالت در مرحلهٔ provisioning مربی 409 می‌دهد، چون مسیر DB را hardcode به `data/` نگه می‌دارد — محدودیت harness، ذیل T-11.)
* **راستی‌آزمایی‌های دیگر:** با `NODE_ENV=production YASNAFIT_TRUST_PROXY=1 YASNAFIT_COOKIE_SECURE=1` → `GET /api/health` = 200 با بدنهٔ حداقلی ✓، `POST /api/coach/auth/login` → 200 و `Set-Cookie …; Secure` ✓، `POST /api/test/reset-rate-limit` → 404 ✓، `GET /api/build` → 401 ✓، بکاپ داخل `data/backups` نوشته شد ✓، دیتابیس تازه با ۳۰ مایگریشن + seed ۲۷۰۷ حرکت از `data-source/exercises_data.json` (موجود در git) بالا آمد ✓.
* **گزارش مالک (۲۰۲۶-۰۹-۰۳ — Volume رسماً تأیید شد):** ۱۸۸۸ عکس حرکت (≈۵۷MB) در `/app/data/media/images/exercises/imported/{ID}.png|jpg` قرار گرفت (`railway ssh -- "ls … | wc -l"` → `1888`؛ `4.png` موجود). کد قبل از Task 22 فقط مسیر ریپو را می‌خواند ⇒ روی production همیشه `blank-white.svg`. تصمیم مالک: **ویدیوها منتقل نمی‌شوند** (حجم زیاد). رفع: **Task 22** همین جلسه (`e60d3eb`) — راستی‌آزمایی در `DEPLOYMENT.md` §۹.۱۰.
* **هنوز تأییدنشده:** `Railway project/service ID`، `region`، `کامیت دقیق deploy زنده` ⇒ `UNKNOWN — needs verification`. (وصل‌بودن Volume: از ۲۰۲۶-۰۹-۰۳ با گزارش مالک **تأیید شد** — بند بالا.)
* **ریسک‌های اعلام‌شده در `DEPLOYMENT.md` §۹:** عکس/ویدیوی ۱۸۸۸ حرکت عمداً در git نیست ⇒ روی Railway placeholder می‌بینیم؛ پایان ماه رایگان ممکن است Volume را پاک کند ⇒ بکاپ منظم؛ انتقال `data\yasnafit.db` لوکال به Volume بدون endpoint جدید ممکن است: `railway volume browse` (upload) — مستند در `DEPLOYMENT.md` §۹.۶؛ اگر CLI را ترجیح ندادید، گزینهٔ دیگر «از صفر شروع کردن» است (API restore عمداً ساخته نشد).
* **قاعده:** تا وقتی کامیت دیپلوی‌شده با `git rev-parse` و لاگ سرویس مقایسه نشده، هرگز اعلام نکنید Local و Railway هم‌زمان‌اند.

---

## 7. Local Environment

* **مسیر:** `C:\Users\MAHDI\Desktop\yasnafit-git`
* **اجرا:** دابل‌کلیک `YASNAFIT-LAUNCHER.bat` (یا `npm start` / `node server.js`) — منو: `1. Start Server & Open Dashboard` • `2. Restart Server` • `3. Stop Server` • `4. View Live Server Logs & Diagnostics` • `5. Exit`
* **URL/پورت:** `http://localhost:3020` (پورت با `PORT` عوض می‌شود)
* **دیتابیس لوکال:** `data\yasnafit.db` (+ `-wal`/`-shm`) — gitignored
* **تصویر هیروی صفحهٔ ورود:** `public\login-hero.png` (نسخهٔ **مورد استفاده**، ارجاع در `public/student-app.js` و `public/luxury-login.css`)؛ جایگزین شخصی: `public\image\logo.png` (gitignore). چهرهٔ تصویر هیرو را عوض نکنید (تأکید مالک در کامیت `086f3e0`).
* **مسیر داده/بکاپ:** همه از `src/storage-paths.js` (`YASNAFIT_DATA_DIR`، `YASNAFIT_BACKUP_DIR`، و `RAILWAY_VOLUME_MOUNT_PATH` به‌صورت خودکار). لوکال بدون این متغیرها دقیقاً مثل قبل `data/` و `backups/` است.
* **قاعدهٔ ری‌استارت:** تغییر `public/*` ← فقط رفرش مرورگر (`Ctrl+Shift+R`)؛ تغییر `server.js` یا `src/*` ← ری‌استارت سرور (لانچر گزینهٔ ۲).
* **LAN برای شاگرد:** لانچر **هیچ IP شبکه‌ای چاپ نمی‌کند** و فقط `http://localhost:3020/coach/login` را باز می‌کند. برای دسترسی شاگرد در شبکهٔ محلی: سرور با پیش‌فرض `YASNAFIT_HOST=0.0.0.0` بالا بیاید (همین حالت فعلی) و IP ویندوز + باز بودن پورت ۳۰۲۰ در فایروال (پروفایل Private) دستی بررسی شود. (در صورت نیاز می‌توان چاپ IP را به لانچر افزود — تا امروز درخواست/کد آن وجود ندارد.)
* **بقیهٔ رفتار لانچر (تأییدشده):** `:STATUS` با `Get-NetTCPConnection` وضعیت پورت و وجود `data\yasnafit.db` را نشان می‌دهد؛ `:CHECKCODE` با `findstr credentialEditorMarkup public\students.js` «NEW CODE / OLD CODE» چاپ می‌کند؛ `:START` سرور را در پس‌زمینه با لاگ در `logs\server.log` بالا می‌آورد؛ `:SHOW_AUTHENTICATOR` محتوای `data\coach-authenticator.txt` را نمایش/نوتپد می‌کند؛ `:STOP` با `netstat` پروسهٔ پورت را می‌کشد؛ `:LOGS` دم ۶۰ خط لاگ را نشان می‌دهد.
* **مصرف Node:** نسخهٔ ≥ 22.5 (هشدار experimental برای SQLite طبیعی است).

---

## 8. Database

* **تکنولوژی:** SQLite از طریق ماژول داخلی `node:sqlite` (`DatabaseSync`) — بدون ORM، بدون سرور دیتابیس.
* **محل فایل:** `data/yasnafit.db`؛ بکاپ‌ها در `backups/`؛ مجوزها: `data/` و `backups/` → `700`، فایل DB و `data/smtp.json` و `data/coach-authenticator.txt` → `600` (از Task 16).
* **مایگریشن:** `src/migrations.js`، **۳۰ مایگریشن** `001_initial` … `030_coach_totp_authenticator`؛ وضعیت جاری = `030_coach_totp_authenticator`؛ جدول `schema_migrations` + `settings.schema_version`.
* **جداول کلیدی:** `students`, `student_sessions`, `student_invites`, `assessments` + `assessment_*` (section‌های ساختاریافته)، `training_programs` + `training_days`/`training_sets` (و همتایا)، `diet_*`, `supplement_*`, `exercises`, `exercise_categories`, `workout_sessions`/نتایج، `notifications`, `messages`, `audit_events`, `coach_auth_events`, `coach_totp …`، `releases`. جداول legacy: `movements`, `programs`, `orders`, `measurements`, `activity_log` (سرنوشتشان T-06؛ مسیر `/api/programs` هنوز مصرف می‌شود).
* **قواعد مایگریشن:** فقط **افزودن** مایگریشن جدید؛ حذف/بازنویسی مایگریشن اعمال‌شده ممنوع. هر تسک جدید مایگریشن، شمارش `tests/migration-regression.js` را می‌شکند → باید هم‌زمان به‌روز شود (و `tests/e2e-workflow.js` `schema_version` را assert می‌کند).
* **Backups:** دکمهٔ پنل = `POST /api/backup` (چرخش ۱۰ نسخه) و در سرور cron با کپی فایل (سند `DEPLOYMENT.md` §۶). WAL قبل از بکاپ چک‌پوینت می‌شود.
* **⚠️ CRITICAL:** هیچ عملیات مخرب دیتابیس (DROP/DELETE سراسری/حذف `data/yasnafit.db`/reset) **بدون تأیید صریح مهدی** انجام نشود. برای حل مشکل دیپلوی هرگز DB را ریست نکنید. در سندباکس Agent یک DB تازه با داده تست e2e وجود دارد و ربطی به DB لوکال مهدی ندارد.

---

## 9. Important Project Rules (قواعد دائمی)

**کاری/ابزاری**
1. هرگز مستقیم روی `main` کار نکن؛ فقط شاخهٔ Arena جلسه (`arena/01a066e6-yasnafit`). push فقط به همان شاخه.
2. **دستکاری/بازنویسی تاریخچه و force-push ممنوع.** قبل از pull/reset/checkout/rebase اول `git status` و شاخه را چک کن؛ `git reset --hard` روی ماشین مهدی فقط با اجازهٔ صریح.
3. هیچ داده/حرکت/شاگرد غیرواقعی (fake) ساخته نشود؛ حرکات فقط از دیتاست ۲۷۰۷تایی.
4. فایل/رسانه خصوصی شاگرد هرگز از `public/` سرو نشود؛ ریشهٔ فایل‌ها با `isSafePath` محدود شود.
5. رمز/API key/token در Git، مستندات یا چت **افشا نشود** (این فایل هم فقط نام متغیر).
6. تغییر معماری بی‌دلیل ممنوع؛ تغییر API عمومی = ثبت در `docs/project-tracking/CHANGELOG.md` + `TECHNICAL-DECISIONS.md`.
7. حذف عملکرد موجود بدون تأیید صریح مالک ممنوع؛ فایل‌های بی‌استفاده فقط پس از **اسکن ارجاع** حذف شوند.
8. قواعد کسب‌وکار (BR-* در `PROJECT-CONTEXT.md`) حفظ شوند؛ فراخوانی AI در پروداکشن ممنوع (BR-8).
9. تست‌ها را بدون اجرا «پاس» اعلام نکن. اندازهٔ بررسی/تست با اندازهٔ تسک متناسب باشد (قاعدهٔ سرعت مالک).
10. **پایان هر گزارش = بلوک دستور `bat`** با نام شاخهٔ جلسه (ساختار ثابت، بدون حذف).
11. ارتباط همیشه فارسی.
12. `YASNAFIT-LAUNCHER.bat` نباید گزینه‌های `:UPDATE` / «Update Yasnafit from GitHub» / `:IMPORT_IMAGES` بگیرد و باید `echo 5. Exit` و `Select an option (1-5)` را حفظ کند (گارد تست).
13. CSP جدید (`script-src 'self'`) ⇒ **اسکریپت درون‌خطی و `on*=` در `public/*.html` ممنوع** (گارد `tests/deployment-hardening-regression.js`). هر اسکریپت جدید باید فایل جدا در `public/` باشد.
14. **رد شده/ممنوع‌العودت:** ویجت «سشن‌های معاملاتی» (لغو و revert شد — دیگر پیشنهاد/ساخته نشود)؛ دکمهٔ «رمز ورود» در منوی ⋮ لیست شاگردان (جایش در دیالوگ «ویرایش و رمز» است — دوباره در منو اضافه نشود).

**محیط اجرا**
15. روی سرور: `YASNAFIT_HOST=127.0.0.1` + پروکسی nginx با TLS؛ `YASNAFIT_TRUST_PROXY=1` **فقط** وقتی ترافیک حتماً از پروکسی است؛ `NODE_ENV=production`؛ `YASNAFIT_COOKIE_SECURE=1` در HTTPS. جزئیات: `DEPLOYMENT.md`.

**حافظهٔ جلسه (این فایل)**
16. شروع هر جلسه = خواندن `mahdi hellp.md` **اول از همه**، سپس فقط فایل‌های مرتبط با تسک؛ کل مخزن/همهٔ مستندات را ناخوانده باز نکن. پایان هر تسک معنادار = به‌روزرسانی همین فایل (§5، §10، §11، §12، §13، §14، §15، §16) و commit آن. `tests/deployment-hardening-regression.js` عمداً این فایل را از اسکن «ارجاع به فایل حذف‌شده» مستثنا کرده، چون اینجا باید نام فایل‌های حذف‌شده بیاید. مدخل بعدی `docs/project-tracking/CHANGELOG.md`: **Task 23** (Task 22 = پشتیبانی Volume برای عکس‌های حرکات).

---

## 10. Current Completed Work (فقط کارهای واقعاً انجام‌شده)

* **2026-09-03** — **Task 23 (جلسهٔ `arena/01a0671e-yasnafit` — رفع دکمه‌های مردهٔ CSP در بانک برنامه‌ها):** گزارش مالک: دکمهٔ «✏️ ویرایش» کار نمی‌کند و هر تغییر برنامه یک کارت جدید می‌سازد. ریشه: CSP `script-src 'self'` ویژگی‌های `onclick="…"` درون‌خطیِ تزریقی از `public/*.js` را بلاک می‌کند و گارد فقط `*.html` را اسکن می‌کرد؛ چون ویرایش مرده بود، تغییر برنامه همیشه از فرم خالی ⇒ POST ⇒ کارت جدید (منطق PUT سرور از اول درست بود).fix: ۹ دکمه به الگوی `data-*` + بایندینگ JS و ۱۱ fallback رسانه به listener سراسری capture (در `app.js` و `student-app.js`) تبدیل شد؛ گارد تست حالا `public/*.js` را هم اسکن می‌کند (جهش‌سنجی‌شده). `npm test` = ۱۸/۱۸.
* **2026-09-03** — **تأیید زندهٔ انتشار Task 22 (همان جلسه):** تشخیص اینکه Auto-deploy خاموش است (اسکرین‌شات Settings مالک) → راهنمای Deploy latest → **ری‌استارت پروسه در ~۱۳:۰۴ UTC تأیید شد** (uptime از ~۵۷هزار به ۹۱۵ ریست؛ version 0.9.1) ⇒ کد merge PR #3 (`8354a68`) روی production اجرا می‌شود. لاگ `[Media]` و تست چشمی عکس هنوز از مالک نگرفته شده (KI-015 همچنان در انتظار تأیید نهایی).
* **2026-09-03** — **Task 22 (`e60d3eb` — پشتیبانی Volume برای عکس‌های حرکات):** درخواست مستقیم مالک (۱۸۸۸ عکس روی `/app/data/media/images/exercises/imported`، فقط عکس نه ویدیو). `mediaDir`/`exerciseImagesDir`/`ensureMediaDirs()` (۰۷۰۰) در `src/storage-paths.js`؛ خواندن Volume در `/api/exercise-image/{id}` (پروب مستقیم `{id}.png|jpg|jpeg` + بر اساس `original_id`؛ اولویت ریپو) و در مسیرهای استاتیک `/assets/images/exercises/*` و `/files/exercise/*` (فقط پسوندهای تصویری، گارد `isSafePath`)؛ لاگ boot `[Media] تصاویر حرکات: N فایل (Volume: X | ریپو: Y)` + هشدار صفر؛ ویدیو repo-side (۴۰۴). ۸ گارد جدید (جهش‌سنجی‌شده)؛ `npm test` = ۱۸/۱۸؛ تست زنده با Volume ساختگی سبز؛ KI-015 = FIXED؛ `DEPLOYMENT.md` §۹.۱۰. PR باز شد — **merge با تأیید مالک**.
* **2026-09-03** — **شروع جلسهٔ `arena/01a066e6-yasnafit` (هم‌زمان‌سازی، بدون تغییر کد):** شاخهٔ جدید از `main` = `50aaa53` ساخته شد؛ دو کامیت docs پایانی جلسهٔ قبل (`9102182` → `b405fa6` و `8f181b4` → `cc6cd25`) cherry-pick شدند ⇒ درخت دقیقاً = tip شاخهٔ قبلی. Railway دوباره از بیرون تأیید شد (`0.9.1` زنده، auth-status بدون تغییر — §6). حافظه (همین فایل: §4/§5/§6/§9/§12/§13/§15/§16/§17) با واقعیت جدید به‌روز شد.
* **2026-09-02** — **Task 18 (آماده‌سازی Railway، کامیت `8331634` + تکمیل storage-paths در همین جلسه):** افزودن `railway.json`، ماژول جدید `src/storage-paths.js` (دیتابیس + عکس‌ها/اسناد خصوصی + بکاپ همه از یک مرجع و روی Volume)، بخش کامل «§۹ استقرار روی Railway» به `DEPLOYMENT.md`، و گاردهای جدید در `tests/deployment-hardening-regression.js` (اعتبار `railway.json`، routable بودن `/api/health` قبل از گیت مربی، tracked بودن `data-source/exercises_data.json`، نبود `path.join(__dirname,'backups')` در server.js). شبیه‌سازی زنده با متغیرهای Railway موفق بود (§۶). اتصال واقعی به داشبورد Railway **انجام نشده** (کار مالک).

* **2026-08-24** — Task 1…5: ابزار program-helper، ساخت سیستم مستندات، ممیزی نهایی، بانک حرکات/ویدیو، BR-14 (کاتالوگ ۱۲ سیستم)، بازطراحی Program Builder.
* **2026-08-24** — Task 6…11: انتخابگر تاریخ شمسی گرافیکی (`jalali-picker.js`)، بازگشت «حذف روز» به منوی روز، بازطراحی داشبورد مربی.
* **2026-08-31 … 2026-09-02** — Task 12: انتقال مدیریت رمز ورود از منوی ⋮ به **دیالوگ ویرایش** (`efac0c4`) + مُهر بیلد (`src/build-info.js`, `GET /api/build`, چیپ `#studentsBuildStamp`, `:CHECKCODE` در لانچر).
* **2026-09-02** — Task 15 (`f66070f`): برچسب «ویرایش و رمز»، ساده‌سازی دیالوگ، حذف فیلد تکرار رمز، دکمهٔ 🎲 رمز تصادفی ۱۰ نویسه‌ای بدون کاراکتر مبهم.
* **2026-09-02** — `ff635be` ویجت سشن معاملاتی ← **باطلرف و `695f4b1` revert شد** (فایل دیگر در HEAD نیست).
* **2026-09-02** — **Task 16** (`9be37bb`): ممیزی امنیتی کامل + پاک‌سازی — هدرها/CSP روی همهٔ پاسخ‌ها، حذف inline script به `public/boot.js`، گیت `X-Forwarded-*` پشت `YASNAFIT_TRUST_PROXY`، `YASNAFIT_HOST`، حذف افشا از `/api/health` و `/api/build`، بستن `/api/test/reset-rate-limit` در production، `sendCaughtError()` (~۴۰ جا)، مجوز `700/600`، محدودسازی `POST /api/coach/auth/setup` به لوپ‌بک، ۴۰۴ برای `*.html` ناموجود، **حذف ۷ فایل مرده (۲٫۸۸MB)**، افزودن `DEPLOYMENT.md`، سوئیت جدید `test:deployment` (حالا **۱۸ سوئیت**).
* **2026-09-02** — **Task 17** (`9be37bb`): اثبات زنده + تست VM‌محور که دکمهٔ «ادامهٔ» صفحهٔ اول ورود مربی (`#coachPasswordSubmit`) واقعی کار می‌کند و گارد علیه «دکمهٔ مرده» روی هر ۶ صفحهٔ احراز هویت.

---

## 11. Current Known Issues

مرجع کامل و به‌روز: `docs/project-tracking/KNOWN-ISSUES.md` (وضعیت‌ها: OPEN / INVESTIGATING / FIXED / WONTFIX / BLOCKED). خلاصهٔ معتبر:

| ID | توضیح | Severity | Status | فایل‌ها | قدم بعد |
|---|---|---|---|---|---|
| KI-001 | `tests/e2e-workflow.js` بدون سرورِ در حال اجرا fail می‌شود | Low | OPEN | `tests/e2e-workflow.js` | spawn خودکار سرور تست (T-11) |
| KI-002 | شکاف ۵↔۱۲ سیستم تمرینی | High | **FIXED** (BR-14) | — | کاتالوگ DB در T-14 |
| KI-003 | پخش ویدیو در UI پیاده نشده | Medium | OPEN | `public/program-builder.js` | T-02 |
| KI-014 | `main` در GitHub فقط `README.md` + `login-hero.png` داشت ⇒ build روی `main` با Railpack می‌شکست | High (deploy) | **FIXED** (۲۰۲۶-۰۹-۰۲: PR #2 merge شد ⇒ `main` = `50aaa53` اپ کامل + `railway.json` + `package-lock.json`) | `main`, PR #2 | اگر deploy بعدی روی `main` خطا داد، لاگ را با `git ls-tree -r --name-only origin/main` مقایسه کنید |
| KI-015 | عکس‌های ۱۸۸۸ حرکت روی Railway سرو نمی‌شد (کد فقط مسیر ریپو را می‌خواند ⇒ همیشه placeholder) | Medium (UX) | **FIXED** (۲۰۲۶-۰۹-۰۳، Task 22 — `e60d3eb`) | `src/storage-paths.js`, `server.js` | merge PR + redeploy + چک `[Media]` (§۹.۱۰) |
| KI-004 | `node:sqlite` experimental | Low | OPEN (پایش) | `src/database.js` | پایش Node LTS |
| KI-005 | کلون تازه ۱۸۸۸ عکس حرکت را ندارد (by design) | Medium | OPEN | `public/assets/images/exercises/imported/` | ایمپورت لوکال |
| KI-006 | rate limiter در حافظه (با ری‌استارت ریست) | Low | OPEN/WONTFIX | `server.js` | T-13 |
| KI-007 | داده تستی e2e در DB محلی انباشته می‌شود | Low | OPEN | `tests/e2e-workflow.js` | T-05 |
| KI-008 | `tool/program-helper.py` بدون تست | Low | OPEN | `tool/` | T-12 |
| KI-010 | اجرای متوالی e2e (<۶۰ث) روی همان پروسه → 429 | Low | OPEN | `server.js` rate buckets | exempt در حالت تست |
| KI-011 | نبود تست مرورگر واقعی برای UI | Low-Med | OPEN | — | Playwright؟ (نیاز به تأیید مالک) |
| KI-012 | جستجوی «دسته+کوئری» فقط LIKE نرمال‌شده | Low | OPEN | `server.js` | رتبه‌بندی در صورت نیاز |
| KI-013 | آیتم «رمز ورود» منوی ⋮ مرده بود | Medium | **FIXED** (Task 13) | `public/students.js` | — |
| — | **جدید، بدون KI:** `docs/project-tracking/PROJECT-CONTEXT.md` هنوز مکانیزم احراز هویت قدیمی را «VERIFIED/فعلی» می‌داند (خطوط ۵۷، ۶۳، ۲۵۲: `data/coach-access-token`، `/coach-access/{token}`، `YASNAFIT_COACH_TOKEN`) در حالی که جایشان ایمیل+رمز+TOTP آمده و `/coach-access/*` عمداً ۴۰۴ است. | Low (مستندات) | OPEN — نیازمند اصلاح | `docs/project-tracking/PROJECT-CONTEXT.md` | بازنویسی §3/§11 (و خط ۶۳) با ارجاع به Task 16 |

---

## 12. Current TODO

مرجع اصلی: `docs/project-tracking/TODO.md` (T-01…T-16). **کار ساختگی اینجا نوشته نشده** — موارد زیر فقط تکرار وضعیت واقعی همان فایل + دو موردِ همین جلسه است:

### High Priority
* **P0:** در حال حاضر هیچ مورد P0 بازی وجود ندارد (تأییدشده در TODO).
* **وصل کردن سرویس در داشبورد Railway (مالک):** New Project → Deploy from GitHub (شاخهٔ مربوطه) → **Attach Volume با mount path `/app/data`** → Variables طبق §۶ → Generate Domain → بعد از ساخت حساب مربی، `YASNAFIT_ALLOW_REMOTE_SETUP` را پاک کنید. (هرگز DB را برای «حل مشکل deploy» ریست نکنید.)
* **تصمیم انتقال دادهٔ لوکال → Railway:** (الف) از صفر شروع کردن (پیشنهاد فعلی) یا (ب) افزودن endpoint ادمین «restore from upload» — گزینهٔ (ب) API جدید است و فقط با تأیید صریح مالک نوشته می‌شود.
* (به‌روز ۲۰۲۶-۰۹-۰۳) **اعمال کد روی لوکال مهدی:** کپی ویندوزی پشت سر است → بلوک bat §17 با شاخهٔ `arena/01a066e6-yasnafit` + ری‌استارت لانچر + `Ctrl+Shift+R`. DB لوکال دست‌نخورده می‌ماند.

### Medium Priority
* T-14 کاتالوگ ۱۲ سیستم به DB (هنگام سینک) • T-02 پخش ویدیوی حرکات در UI • T-03 آپلود عکس حرکت از UI • T-04 پرکردن `equipment/difficulty/description/name_en` • T-05 پاکسازی داده تستی e2e • T-06 سرنوشت جداول legacy • T-07 طراحی لایهٔ سینک • T-15 افزودن `tool/smoke-*.js` به زنجیرهٔ `npm test` • T-11 مقاوم‌سازی harness تست.

### Low Priority
* T-08 اپ اندروید شاگرد • T-09 خروجی Excel/CSV • T-10 ویرایش گروهی دسته/محل حرکت • T-12 تست `program-helper.py` • T-13 rate-limiter پایدار.

---

## 13. Current Task

* **عنوان (جلسهٔ جاری، ۲۰۲۶-۰۹-۰۳ — `arena/01a0671e-yasnafit`):** **Task 23 — رفع دکمه‌های مردهٔ CSP («✏️ ویرایش» بانک برنامه‌ها + کارت تکراری به‌ازای هر تغییر)** + راستی‌آزمایی انتشار Task 22 روی production.
* **عنوان تسک قبلی:** Task 22 (پشتیبانی Volume عکس حرکات) — merge شد (PR #3) و deploy آن با ریست uptime تأیید شد.
* **هدف:** دکمهٔ ویرایش کار کند و هر برنامه فقط یک کارت داشته باشد که تغییراتش در همان کارت ذخیره شود (PUT).
* **فایل‌های مرتبط:** `public/program-builder.js`, `public/diet-programs.js`, `public/coach-submissions.js`, `public/students.js`, `public/exercises.js`, `public/student-app.js`, `public/app.js`, `public/ai-copilot.js`, `public/program-pdf.js`, `tests/deployment-hardening-regression.js`, `docs/project-tracking/CHANGELOG.md`.
* **نتیجهٔ مورد انتظار:** `npm test` سبز + گارد جدید جهش‌سنجی‌شده + بعد از merge/redeploy، تأیید چشمی مالک در بانک برنامه‌ها.
* **وضعیت نهایی:** کد + تست + مستندات انجام شد؛ **PR #4 به `main` باز است — merge با تأیید مالک**؛ بعد از merge: مالک در Railway «Check for updates» بزند و در بانک برنامه‌ها ویرایش/ذخیره را چشمی تست کند.

---

## 14. Last Session Handoff

### What was done
1. **راستی‌آزمایی انتشار Task 22:** با fetch زنده مشخص شد پروسهٔ قدیمی هنوز بالا بود (uptime ~۵۶–۵۷هزار = بوت ۲۰۲۶-۰۹-۰۲ ۲۰:۱۲ UTC در حالی که merge PR #3 ساعت 11:24 UTC بود)؛ اسکرین‌شات Settings مالک علت را قطعی کرد: **Auto deploy خاموش** (Branch = `main`). بعد از «Deploy latest» مالک، **ریست uptime تأیید شد** (`uptime: 915` در 13:19 UTC، `version: 0.9.1`) ⇒ کد Task 22 روی production اجرا می‌شود. برای مالک توضیح داده شد که دامین یکی است و مسیرها نقش‌ها را جدا می‌کنند (`/` مربی، `/student/login` شاگرد، `/join/<token>` دعوت) و چک «چه کسانی وارد شده‌اند» با دو دستور SELECT در تب Console Railway انجام می‌شود (جداول `coach_auth_events` و `student_sessions`).
2. **Task 23 — رفع دکمه‌های مردهٔ CSP (گزارش مالک از بانک برنامه‌ها):** ریشهٔ واحد برای «ویرایش کار نمی‌کند» و «کارت جدید به‌ازای هر تغییر»: ویژگی‌های `onclick="…"` درون‌خطیِ تزریقی از `public/*.js` توسط CSP `script-src 'self'` بلاک می‌شوند و گارد فقط `*.html` را می‌دید. ۹ دکمه به `data-*` + بایندینگ JS تبدیل شد؛ ۱۱ `onerror` رسانه به listener سراسری capture-phase در `app.js`/`student-app.js` تبدیل شد (`data-fallback` / `data-fallback-class`)؛ گارد تست به اسکن `public/*.js` گسترش یافت (جهش‌سنجی: exit 1/0).
3. **مستندات:** مدخل Task 23 در `docs/project-tracking/CHANGELOG.md`؛ به‌روزرسانی همین فایل (§4/§5/§6/§10/§13/§14/§15/§16/§17).

### What changed
`public/program-builder.js`, `public/diet-programs.js`, `public/coach-submissions.js`, `public/students.js`, `public/exercises.js`, `public/student-app.js`, `public/app.js`, `public/ai-copilot.js`, `public/program-pdf.js`, `tests/deployment-hardening-regression.js`, `docs/project-tracking/CHANGELOG.md`, `mahdi hellp.md`.

### What was tested
`node --check` ۱۱ فایل ✅ • `npm test` = **۱۸/۱۸ ✅** (سه بار اجرا، exit 0) • **جهش‌سنجی گارد جدید:** افزودن ` onclick="…"` به program-builder ⇒ exit 1؛ بازگردانی ⇒ exit 0 ✅ • grep نهایی: صفر هندلر صفحتی باقی‌مانده در `public/*.js` ✅ • تشخیص ابزار fetch روی پاسخ تصویری مستند شد (خطای HTTP 500 گمراه‌کننده؛ حتی روی SVG سالم) ✅

### What passed
همهٔ موارد بالا + تأیید زندهٔ redeploy (ریست uptime).

### What failed
هیچ تستی شکست نخورد. دو نکتهٔ عملی: (۱) curl سندباکس به اینترنت دسترسی ندارد (SSL_ERROR_SYSCALL) — بررسی زنده فقط با ابزار fetch؛ (۲) ویرایش fuzzy یک‌بار دو بولت §۶ را ادغام کرد که بلافاصله جداسازی شد.

### What remains
1. **مالک:** لاگ `[Media]` (Railway → Logs → جست‌وجوی Media؛ انتظار `Volume: 1888 | ریپو: 0`) و باز کردن `/api/exercise-image/4` در مرورگر (عکس واقعی) ⇒ بعدش KI-015 بسته می‌شود.
2. **مالک:** merge PR #4 (Task 23) → Railway «Check for updates» → تست چشمی: در بانک برنامه‌ها «✏️ ویرایش» باید فرم را با همان برنامه باز کند و ذخیره همان کارت را آپدیت کند.
3. پیشنهاد به مالک: روشن‌کردن Auto-deploy در Settings (فعلاً خاموش است).
4. مهدی در ویندوز: بلوک bat §17 (pull) + ری‌استارت لانچر + `Ctrl+Shift+R`.
5. پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست.
6. §۱۱: اصلاح `PROJECT-CONTEXT.md` (احراز هویت قدیمی) هنوز OPEN.

### Exact next step for the next Agent
1. همین فایل را بخوان؛ بعد `git status --short` و `git log --oneline -1` (انتظار: تمیز + کامیت Task 23 روی شاخهٔ `arena/01a0671e-yasnafit`).
2. وضعیت PR #4 را بگیر (`gh pr view 4`): اگر merged → مالک Check for updates زده؟ uptime را با fetch چک کن و تست چشمی ویرایش را از مالک بپرس؛ نتیجه را در §۶/§۱۴/§۱۶ ثبت کن.
3. اگر مالک لاگ `[Media]` را داد: `Volume: 1888` ⇒ KI-015 را در `KNOWN-ISSUES.md` و §۱۱ همین فایل به‌عنوان تأییدشدهٔ زنده ببند؛ `Volume: 0` ⇒ طبق DEPLOYMENT.md §۹.۱۰ مسیر را بررسی کن (DB/Volume هرگز ریست نشود).
4. تسک بعدی را از مالک/TODO بگیر؛ مدخل بعدی changelog: **Task 24**. پایان هر تسک: به‌روزرسانی همین فایل + commit + گزارش فارسی با بلوک `bat` §17.

---

## 15. Files Changed Recently

| مسیر | دلیل | وضعیت |
|---|---|---|
| `public/program-builder.js`, `public/diet-programs.js`, `public/coach-submissions.js`, `public/students.js`, `public/exercises.js`, `public/student-app.js`, `public/app.js`, `public/ai-copilot.js`, `public/program-pdf.js` | Task 23: حذف هندلرهای درون‌خطیِ CSP-مرده ⇒ `data-*` + بایندینگ JS + fallback رسانهٔ سراسری | committed این جلسه |
| `tests/deployment-hardening-regression.js` | Task 23: گارد اسکن `public/*.js` برای هندلر صفحتی (جهش‌سنجی‌شده) | committed این جلسه |
| `docs/project-tracking/CHANGELOG.md` | مدخل Task 23 | committed این جلسه |
| `mahdi hellp.md` | به‌روزرسانی جلسهٔ `arena/01a0671e-yasnafit` (تأیید redeploy + Task 23) | committed این جلسه |
| `src/storage-paths.js` | `mediaDir`/`exerciseImagesDir`/`ensureMediaDirs()` (Task 22) | committed `e60d3eb` |
| `server.js` | خواندن Volume برای عکس‌های حرکات + لاگ boot `[Media]` (Task 22) | committed `e60d3eb` |
| `tests/deployment-hardening-regression.js` | ۸ گارد media-volume (جهش‌سنجی‌شده) | committed `e60d3eb` |
| `DEPLOYMENT.md` | §۹.۱۰ عکس‌های حرکات روی Volume | committed `e60d3eb` |
| `docs/project-tracking/KNOWN-ISSUES.md` | KI-015 (FIXED) | committed `e60d3eb` |
| `docs/project-tracking/CHANGELOG.md` | مدخل Task 22 | committed `e60d3eb` |
| `mahdi hellp.md` | هم‌زمان‌سازی شروع جلسهٔ `arena/01a066e6-yasnafit` (۲۰۲۶-۰۹-۰۳) + ثبت Task 22 | committed این جلسه |
| `src/request-security.js` | لایهٔ متمرکز هدرها/اعتماد به پروکسی/پیام خطا (Task 16) | committed `9be37bb` |
| `public/boot.js` | جایگزین inline script صفحهٔ مربی | committed |
| `server.js` | اعمال هدرها، گیت‌های `/api/health`+`/api/build`+reset-rate-limit، `listenHost`، `sendCaughtError`، ۴۰۴ `*.html`، setup لوپ‌بک | committed |
| `src/database.js`, `src/coach-auth-service.js`, `src/student-session-service.js` | مجوز `700/600`، واگذاری `secureRequest`/`clientIp`/`requestHost` به ماژول امنیتی | committed |
| `public/index.html`, `public/releases.js` | حذف `student-portal.css`، اسکریپت `/boot.js`؛ health دقیق با کوکی مربی | committed |
| `DEPLOYMENT.md` | راهنمای استقرار (nginx/systemd/بکاپ/چک‌لیست) | committed (فایل جدید) |
| `README.md`, `ARCHITECTURE.md` | به‌روزرسانی (مرجع DEPLOYMENT، بخش سرور، لایهٔ امنیتی، حذف ارجاع به فایل‌های مرده) | committed |
| `tests/deployment-hardening-regression.js`, `tests/ui-design-regression.js`, `tests/coach-auth-regression.js`, `tests/student-session-regression.js`, `tests/e2e-workflow.js`, `package.json` | قفل رفتار جدید (۱۸ سوئیت)، اصلاح قیاس کوکی Secure، رفع false-positive نسخه | committed |
| `public/students.js`, `public/students.css` | دیالوگ «ویرایش و رمز» + رمز تصادفی (Task 13/15 — از قبل) | committed `f66070f` |
| `YASNAFIT-LAUNCHER.bat` | **بدون تغییر** (فقط `:CHECKCODE` از قبل) | committed `ac94262` |
| `mahdi hellp.md` | حافظهٔ دائمی/دست‌به‌دست Agent (ایجاد در 2026-09-02) | committed (فایل جدید، ریشهٔ مخزن) |
| `railway.json` | کانفیگ build/deploy ریل‌وی (Task 18) | committed این جلسه |
| `src/database.js` | `YASNAFIT_BACKUP_DIR` + export `dataDir/backupDir` (بکاپ داخل Volume) | committed این جلسه |
| `server.js` | چرخش بکاپ روی `backupDir` مشترک (حذف مسیر hardcode `backups/`) | committed این جلسه |
| `DEPLOYMENT.md` | افزودن §۹ «استقرار روی Railway» + اصلاح بند لانچر/Node | committed این جلسه |
| `tests/deployment-hardening-regression.js` | گاردهای `railway.json`/seed/backup-dir (بخش ۸) | committed این جلسه |
| `public/trading-sessions.html` | ویجت لغوشده — **دیگر وجود ندارد** | reverted `695f4b1` |

---

## 16. Deployment / Local Synchronization State

```
LOCAL (مهدی / ویندوز)  →  GIT (شاخهٔ Arena)  →  GITHUB (origin)  →  RAILWAY/سرور
```

| محیط | وضعیت | یادداشت |
|---|---|---|
| Local (لوکال مهدی) | **BEHIND** | با بلوک bat §17 (شاخهٔ `arena/01a0671e-yasnafit`) هم‌زمان می‌شود (DB لوکال او دست‌نخورده می‌ماند) |
| Local (سندباکس Agent) | **CURRENT** | شاخهٔ `arena/01a0671e-yasnafit` = کامیت Task 23 (این جلسه)؛ مبنا `main` = `8354a68` |
| Git / GitHub origin | **CURRENT** | `main` = `8354a68` (merge PR #3 = Task 22)؛ شاخهٔ جلسه push است؛ **PR #4 (Task 23 → main) باز — merge با تأیید مالک** |
| `main` | **`8354a68` — Task 22 روی main** | بلافاصله بعد از merge، build باید موفق شود (`railway.json` و lockfile از PR #2 روی main هستند) |
| Railway | **LIVE (0.9.1) — کد Task 22 اجرا می‌شود** | Auto-deploy **خاموش** است؛ مالک ۲۰۲۶-۰۹-۰۳ «Deploy latest» زد ⇒ ~۱۳:۰۴ UTC پروسه ری‌استارت شد (تأیید با ریست uptime). ۱۸۸۸ عکس روی Volume در `/app/data/media/images/exercises/imported`؛ لاگ `[Media]` و تست چشمی عکس هنوز از مالک نگرفته شده (KI-015 منتظر) |

**تا این لحظه هیچ workflow خودکار (GitHub Actions) در مخزن نیست؛ deploy با Railway از طریق اتصال repo انجام می‌شود (auto-deploy روی push به شاخهٔ متصل، محدود به `watchPatterns`).**

---

## 17. دستورات اجرای پروژه (پایان هر گزارش — قاعدهٔ ثابت)

نام شاخه در بلوک زیر باید با **شاخهٔ جلسهٔ جاری** جایگزین شود (فعلاً `arena/01a0671e-yasnafit`)؛ ساختار بلوک تغییر نکند:

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a0671e-yasnafit
git pull --ff-only origin arena/01a0671e-yasnafit
.\YASNAFIT-LAUNCHER.bat
```
