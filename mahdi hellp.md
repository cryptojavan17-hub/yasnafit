# MAHDI HELLP — YASNAFIT PERSISTENT AGENT MEMORY

> **این فایل حافظهٔ دائمی پروژه است.** اولین کاری که هر Agent/Arena جدید باید بکند: فقط همین فایل را بخواند، سپس سراغ فایل‌های مرتبط با تسک جاری برود. **کل مخزن یا همهٔ مستندات را ناخوانده باز نکنید.**
> آخرین به‌روزرسانی: **2026-09-20** (توسط Agent جلسهٔ `arena/01a0b993-yasnafit` — **Task 25 (شماره‌گذاری docs/project-tracking): بازسازی لندینگ — مرحلهٔ ۲ از ۴: درباره من = کل About Me.png (صفحهٔ جدید /about + بخش زیر هیرو، سقف عرض ۹۴۱px)؛ لینک هدر «درباره من» مستقیم به صفحهٔ جدید می‌رسد — مرحله‌های ۳–۴ منتظر تصویرهای دیگر مالک**. قبل‌تر: Task 17–24 (همه committed + push شده). جلسهٔ قبل: `arena/01a0817f-yasnafit` — Task 25/26).
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
* **شاخه‌های مهم:** `main` — الان **`607587f`** (merge PR #5 = Task 24، 2026-09-03 18:41:45Z)؛ قبل‌تر از ۲۰۲۶-۰۹-۰۲ **`50aaa53` = اپ کامل** (PR #2 merge شد؛ قبلاً فقط `README.md` + `login-hero.png` بود، و آن تصویر با `R100` به `public/login-hero.png` منتقل شد). `086f3e0` («Add exact login hero image - do not change face») پدر آن است
* **شاخهٔ کاری جلسه (فعلاً):** `arena/01a0b993-yasnafit` (از `main` = `6301712` = merge PR #8 «غیرفعال‌کردن 2FA روی لانچر» ساخته شده) — همهٔ کارها فقط روی همین شاخه، push فقط به همین شاخه. ✅ **همهٔ کارهای Task 17–20 (سایت عمومی + wireframe + بازسازی کامل + launcher + تصویرهای برند) committed + push شده (2026-09-20).** `origin/main` از 2026-09-19 = `8b693cb`. شاخهٔ قبلی: `arena/01a0817f-yasnafit`. شاخه‌های آرشیو: `arena/01a06884-yasnafit` (tip `8abd85c` = docs بعد از merge PR #5؛ کامیت کد Task 24 = `ab2a8a9`)، `arena/01a0671e-yasnafit` (`58615d4` = Task 23)، `arena/01a066e6-yasnafit` (`6e79fd9`). ⚠️ **سه کامیت docs پایانی جلسهٔ `arena/01a06884-yasnafit` (`a8132ae` + `57ea75c` + `5c61866`) هرگز push نشدند و با بازسازی سندباکس از دست رفتند** ⇒ در این جلسه محتوایشان از گزارش مالک بازسازی شد؛ کامیت push‌شدهٔ `8abd85c` روی origin بود و با cherry-pick به `583af1b` روی شاخهٔ این جلسه برگشت (بدون force-push). نکتهٔ قدیمی‌تر: جلسهٔ کوتاه‌شدهٔ `arena/01a0686c-yasnafit` هم هیچ کامیت/pushی نداشت و Task 24 از نو ساخته شد.
* **مستندات ریشه (حذفشان ممنوع):** `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `CHANGELOG.md` (محصولی/نسخه‌ها), `EXERCISE_MANAGEMENT.md`, **`DEPLOYMENT.md` (جدید)**.
* **مستندات پیگیری:** `docs/project-tracking/` → `PROJECT-CONTEXT.md` (کسب‌وکار + قواعد)، `CHANGELOG.md` (توسعه/تسک‌ها — Task 1…22)، `KNOWN-ISSUES.md` (KI-001…KI-018)، `TODO.md` (T-01…T-19)، `TECHNICAL-DECISIONS.md` (TD-1…TD-25)، `archive/`.

---

## 5. Git / Arena State

| مورد | وضعیت تأییدشده |
|---|---|
| شاخهٔ جاری | `arena/01a0b993-yasnafit` (از `main` = `6301712` = merge PR #8 «غیرفعال‌کردن 2FA روی لانچر» ساخته شده) |
| آخرین کامیت | Task 17–22 همه committed (آخرین = کامیت Task 22) — مبنا `6301712` |
| working tree | **تمیز** — همهٔ Task 17–22 (سایت عمومی + wireframe + بازسازی + launcher + تصویرها + تصویر کامل لندینگ + هدر/دکمه‌ها) committed روی `arena/01a0b993-yasnafit` و push شده (2026-09-20) |
| local vs origin | شاخهٔ جلسه با origin هم‌خوان است (push شده 2026-09-20)؛ `origin/main` از 2026-09-19 = `8b693cb` (merge‌های جلسات دیگر، بی‌ربط به این شاخه) |
| PR | **هنوز ساخته نشده** — فقط با تأیید صریح مالک |
| اقدامات باز | (۱) مالک: apply/merge شاخهٔ جلسه (روش معمول خودش) (۲) T-17 (auto-fetch) فقط با تأیید مالک (۳) T-18 باقی‌مانده: فقط تصویر OG (اختیاری) (۴) تصمیم «غیرفعال‌کردن گوگل‌اتنتیکاتور» از جلسهٔ قبل هنوز بی‌پاسخ است |
| هشدار Arena | همان درس‌های قبل: بلافاصله بعد از هر کامیت **push کنید** (کامیت local می‌سوزد)؛ قبل از هر کاری `git status` + قضاوت با محتوا نه هش. ⚠️ در این session فایل `data/` چندین بار پاک/بازسازی شده (سندباکس) ⇒ DB فعلی = تازه + داده e2e؛ **هیچ ربطی به DB لوکال/production مالک ندارد** |

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
* **Auto-deploy روشن شد (۲۰۲۶-۰۹-۰۳ عصر — از جلسهٔ `arena/01a0671e-yasnafit` به بعد):** مالک Auto-deploy را روی Branch = `main` روشن کرد ⇒ بعد از هر merge، Railway خودش منتشر می‌کند و **«Check for updates» دیگر لازم نیست**؛ فقط بعد از merge با `GET /api/health` (fetch) ریست uptime را تأیید کنید. تأیید مالک بعد از merge PR #4 (Task 23): ریست uptime + خواندن کد جدید از خود `program-builder.js` سرو‌شده روی production.
* **وضعیت زنده (۲۰۲۶-۰۹-۰۳، جلسهٔ `arena/01a06884-yasnafit` — baseline قبل از merge PR #5):** `GET /api/health` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":2999}` (پروسه ~۵۰ دقیقه قبل از fetch ری‌استارت شده — سازگار با auto-deploy پس از merge PR #4) ⇒ کد Task 23 روی production اجرا می‌شود.
* **تأیید انتشار Task 24 (۲۰۲۶-۰۹-۰۳ 18:4x UTC، جلسهٔ `arena/01a06884-yasnafit`):** PR #5 با تأیید صریح مالک در **18:41:45Z** merge شد (merge commit `607587f`). یک ریست uptime در ~18:34:40Z دیده شد که **قبل از** merge بود (ملاک نیست)؛ ریست ملاک: fetch بعدی در 18:46:15Z → `uptime: 213` ⇒ استارت پروسه ~**18:42:42Z = ۵۷ ثانیه بعد از merge** ⇒ auto-deploy کد Task 24 روی production اجرا می‌شود. کامیتِ deploy از بیرون خواندنی نیست (قاعدهٔ ثابت) ⇒ اثبات نهایی رفتار جدید = تست چشمی مالک (دکمهٔ «🤖 تولید پیش‌نویس هوشمند» روی برنامهٔ باز ⇒ بدون کارت تکراری).
* **وضعیت زنده (۲۰۲۶-۰۹-۰۸ — راستی‌آزمایی مجدد از بیرون، جلسهٔ `arena/01a0b993-yasnafit`):** `GET /api/health` در `2026-09-08T14:54:25Z` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":418274}` ⇒ ۴٫۸۴ روز بدون ری‌استارت؛ استارت پروسه ≈ **2026-09-03T18:43:11Z** = دقیقاً auto-deploy بعد از merge PR #5 (18:41:45Z) ⇒ **کد Task 24 همین حالا روی production زنده است** (بدون نیاز به «Check for updates»). این عدد با build stamp `18:41:44Z` در لاگ Railway مالک هم سازگار است.
* **فکت‌های production (از لاگ مالک — ۲۰۲۶-۰۹-۰۳، در این جلسه ثبت شد چون کامیت قبلی‌اش local ماند و از دست رفت):** پورت داخلی **`8080`** با bind **`0.0.0.0`** (Railway `PORT` را inject می‌کند) • **۳۰ مایگریشن applied** (تا `030_coach_totp_authenticator`) • پیام «Exercises already imported: **2724** items» که از دیتاست مرجع ۲٬۷۰۷ بیشتر است ⇒ **علت نامعلوم، در `KI-016` ثبت شد؛ هیچ حرکت/دادهٔ ساختگی نسازید و هیچ رکوردی را حدسی حذف نکنید** • شناسه‌های Railway: Project `01244a7a…` • Service `5f6f027f…` • Environment `05a2bb2d…` (ادامهٔ شناسه‌ها عمداً نوشته نمی‌شود؛ رمز/توکن نیستند ولی نیازی هم به ثبت کاملشان نیست).
* **تأیید چشمی مالک (۲۰۲۶-۰۹-۰۸ ⇒ دو مورد بسته شد):** (۱) **Task 24 CLOSED** — زدن چندبارهٔ «🤖 تولید پیش‌نویس هوشمند» روی برنامهٔ باز فقط همان کارت را به‌روز کرد و کارت تکراری نساخت؛ کارت‌های تکراری قدیمی (ساختهٔ قبل از merge) هم دستی پاک شدند و شمارش چشمی کارت‌ها تأیید شد. (۲) **KI-015 CLOSED** — لاگ `[Media] تصاویر حرکات: 1888 فایل (Volume: 1888 | ریپو: 0)` و بازکردن `/api/exercise-image/4` در مرورگر ⇒ **عکس واقعی حرکت، نه مربع سفید**.
* **ماجرای «کد Google Authenticator کار نمی‌کند» (علت قطعی، از کد):** کلید TOTP در دیتابیس همان سرور است (`coaches.totp_secret`) و `setupCoach` آن را `NULL` می‌گذارد؛ در اولین restart، `ensureCoachAuthenticator()` یک **کلید تازه** می‌سازد، `totp_confirmed_at` را ست می‌کند و کلید را در `<mount>/coach-authenticator.txt` می‌نویسد ⇒ کلید قدیمیِ نسخهٔ لوکال روی Railway هیچ‌وقت قبول نمی‌شود. در UI هم هیچ‌وقت کلید نشان داده نمی‌شود (طراحی عمدی؛ مسیر HTTP برای نمایش/چرخش کلید وجود ندارد). راه‌حل‌ها در `DEPLOYMENT.md` §۹.۸: (۱) خواندن فایل از Volume با `railway ssh`/`railway volume browse`، (۲) `node scripts/provision-coach-totp.js --rotate` داخل کانتینر، (۳) اگر CLI ندارید: موقتاً `YASNAFIT_REVEAL_AUTHENTICATOR_KEY=1` و بعد از ورود پاکش کنید. ⚠️ اعداد قفل: `MAX_OTP_FAILURES=3` ⇒ `AUTH_LOCKED` به مدت `LOCK_MS=15 دقیقه`؛ عمر چلنج `OTP_TTL_MS=5 دقیقه`؛ کد یک‌بارمصرف (`totp_last_counter`)؛ تلورانس ساعت ±۳۰ ثانیه (`window=1`).
* **Domain:** Settings → Networking → **Generate Domain** ⇒ `https://<name>.up.railway.app`.
* **شبیه‌سازی Volume با مسیر دلخواه (2026-09-02، موفق):** `RAILWAY_VOLUME_MOUNT_PATH=/tmp/yasna-vol node server.js` ⇒ `yasnafit.db` + `assessments/` + `backups/` همه داخل Volume با مجوز `drwx------` و seed ۲۷۰۷ حرکت ✅. (e2e روی این حالت در مرحلهٔ provisioning مربی 409 می‌دهد، چون مسیر DB را hardcode به `data/` نگه می‌دارد — محدودیت harness، ذیل T-11.)
* **راستی‌آزمایی‌های دیگر:** با `NODE_ENV=production YASNAFIT_TRUST_PROXY=1 YASNAFIT_COOKIE_SECURE=1` → `GET /api/health` = 200 با بدنهٔ حداقلی ✓، `POST /api/coach/auth/login` → 200 و `Set-Cookie …; Secure` ✓، `POST /api/test/reset-rate-limit` → 404 ✓، `GET /api/build` → 401 ✓، بکاپ داخل `data/backups` نوشته شد ✓، دیتابیس تازه با ۳۰ مایگریشن + seed ۲۷۰۷ حرکت از `data-source/exercises_data.json` (موجود در git) بالا آمد ✓.
* **گزارش مالک (۲۰۲۶-۰۹-۰۳ — Volume رسماً تأیید شد):** ۱۸۸۸ عکس حرکت (≈۵۷MB) در `/app/data/media/images/exercises/imported/{ID}.png|jpg` قرار گرفت (`railway ssh -- "ls … | wc -l"` → `1888`؛ `4.png` موجود). کد قبل از Task 22 فقط مسیر ریپو را می‌خواند ⇒ روی production همیشه `blank-white.svg`. تصمیم مالک: **ویدیوها منتقل نمی‌شوند** (حجم زیاد). رفع: **Task 22** همین جلسه (`e60d3eb`) — راستی‌آزمایی در `DEPLOYMENT.md` §۹.۱۰.
* **هنوز تأییدنشده:** `region` و `کامیت دقیق deploy زنده` ⇒ `UNKNOWN — needs verification` (کامیت deploy از بیرون خواندنی نیست — قاعدهٔ پایین). **تأییدشده‌ها:** `Railway project/service/environment ID` از لاگ مالک (بند بالا) • وصل‌بودن Volume با گزارش مالک (۱۸۸۸ عکس) • لاگ `[Media] Volume: 1888 | ریپو: 0` • سرو واقعی عکس با تست چشمی مالک (۲۰۲۶-۰۹-۰۸).
* **ریسک‌های اعلام‌شده در `DEPLOYMENT.md` §۹:** عکس/ویدیوی ۱۸۸۸ حرکت عمداً در git نیست ⇒ روی Railway placeholder می‌بینیم؛ پایان ماه رایگان ممکن است Volume را پاک کند ⇒ بکاپ منظم؛ انتقال `data\yasnafit.db` لوکال به Volume بدون endpoint جدید ممکن است: `railway volume browse` (upload) — مستند در `DEPLOYMENT.md` §۹.۶؛ اگر CLI را ترجیح ندادید، گزینهٔ دیگر «از صفر شروع کردن» است (API restore عمداً ساخته نشد).
* **قاعده:** تا وقتی کامیت دیپلوی‌شده با `git rev-parse` و لاگ سرویس مقایسه نشده، هرگز اعلام نکنید Local و Railway هم‌زمان‌اند.

---

## 7. Local Environment

* **مسیر:** `C:\Users\MAHDI\Desktop\yasnafit-git`
* **اجرا:** دابل‌کلیک `YASNAFIT-LAUNCHER.bat` (یا `npm start` / `node server.js`) — منو: `1. Start Server & Open Site` • `2. Restart Server` • `3. Stop Server` • `4. View Live Server Logs & Diagnostics` • `5. Exit`
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
* **مایگریشن:** `src/migrations.js`، **۳۱ مایگریشن** `001_initial` … `031_magazine_public_site` (Task 17 — ۴ جدول جدید: `articles`, `article_sources`, `article_related`, `magazine_settings`؛ وضعیت جاری = `031_magazine_public_site`، ۵۳ جدول)؛ جدول `schema_migrations` + `settings.schema_version`.
* **جداول کلیدی:** `students`, `student_sessions`, `student_invites`, `assessments` + `assessment_*` (section‌های ساختاریافته)، `training_programs` + `training_days`/`training_sets` (و همتایا)، `diet_*`, `supplement_*`, `exercises`, `exercise_categories`, `workout_sessions`/نتایج، `notifications`, `messages`, `audit_events`, `coach_auth_events`, `coach_totp …`، `releases`. جداول legacy: `movements`, `programs`, `orders`, `measurements`, `activity_log` (سرنوشتشان T-06؛ مسیر `/api/programs` هنوز مصرف می‌شود).
* **قواعد مایگریشن:** فقط **افزودن** مایگریشن جدید؛ حذف/بازنویسی مایگریشن اعمال‌شده ممنوع. هر تسک جدید مایگریشن، شمارش `tests/migration-regression.js` را می‌شکند → باید هم‌زمان به‌روز شود (و `tests/e2e-workflow.js` `schema_version` را assert می‌کند).
* **Backups:** دکمهٔ پنل = `POST /api/backup` (چرخش ۱۰ نسخه) و در سرور cron با کپی فایل (سند `DEPLOYMENT.md` §۶). WAL قبل از بکاپ چک‌پوینت می‌شود.
* **⚠️ CRITICAL:** هیچ عملیات مخرب دیتابیس (DROP/DELETE سراسری/حذف `data/yasnafit.db`/reset) **بدون تأیید صریح مهدی** انجام نشود. برای حل مشکل دیپلوی هرگز DB را ریست نکنید. در سندباکس Agent یک DB تازه با داده تست e2e وجود دارد و ربطی به DB لوکال مهدی ندارد.

---

## 9. Important Project Rules (قواعد دائمی)

**کاری/ابزاری**
1. هرگز مستقیم روی `main` کار نکن؛ فقط شاخهٔ Arena جلسهٔ جاری (فعلاً `arena/01a0b993-yasnafit`). push فقط به همان شاخه.
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
16. شروع هر جلسه = خواندن `mahdi hellp.md` **اول از همه**، سپس فقط فایل‌های مرتبط با تسک؛ کل مخزن/همهٔ مستندات را ناخوانده باز نکن. پایان هر تسک معنادار = به‌روزرسانی همین فایل (§5، §10، §11، §12، §13، §14، §15، §16) و commit آن. `tests/deployment-hardening-regression.js` عمداً این فایل را از اسکن «ارجاع به فایل حذف‌شده» مستثنا کرده، چون اینجا باید نام فایل‌های حذف‌شده بیاید. مدخل‌های `docs/project-tracking/CHANGELOG.md` با شماره‌گذاری جداگانه خود را پیش می‌برند؛ در آن سیستم: **Task 17** = سایت عمومی + پنل مجله (انجام‌شده، بدون کامیت) و **Task 18** = تطبیق صفحهٔ اصلی با wireframe (انجام‌شده، بدون کامیت) ⇒ **Task 19** = بازسازی کامل صفحهٔ اصلی دقیقاً طبق wireframe (انجام‌شده، بدون کامیت) ⇒ مدخل بعدی **Task 20**.

---

## 10. Current Completed Work (فقط کارهای واقعاً انجام‌شده)

* **2026-09-20** — **Task 22 (همین جلسه/شاخه — هدر روی لندینگ + دکمه‌ها + اندازهٔ تصویر — T-19 مرحلهٔ ۱):** مالک: «عکس خیلی بزرگه — کوچک‌تر کن مناسب موبایل هم باشه — بالا هدر — دکمه‌ها: خانه - درباره من - خدمات - مجله - نتایج - ثبت نام - ورود» ⇒ (1) هدر واقعی بالای تصویر با دقیقاً همین ۵ لینک (`HEADER_NAV`) + دکمهٔ **ثبت نام** → `/student/register` + دکمهٔ **ورود** → `/student/login` (فلوهای موجود)؛ برای نشست مربی: «پنل مربی»؛ منوی همبرگری موبایل فعال. (2) تصویر سقف عرض ۹۴۱px (عرض طبیعی طرح) + وسط‌چین — موبایل: تمام‌عرض. هدر در همهٔ صفحات عمومی مشترک؛ فوتر دست‌نخورده (تماس در فوتر). **T-19 DONE** (مالک هدر بالا را به‌جای دکمه‌روی‌تصویر انتخاب کرد). ۵۸ گروه test:public-site + ۱۹/۱۹ npm test + smoke زنده.
* **2026-09-20** — **Task 23 (همین جلسه/شاخه — پاک‌کردن نوشته‌های هدرِ خودِ تصویر لندینگ):** مالک: «خوبه — ولی زیر دکمه‌ها نوشته‌های قبلی عکس بود؛ اون نوشته‌ها رو پاک کن» ⇒ نوار بالای `public/images/landing/landing2.png` (۶۲px = لوگو YASNAFIT + منو + شعار «مربی و برنامه‌ریز پیشگیری بانوان» + دکمهٔ ورودِ داخل تصویر) برش خورد (۹۴۱×۱۶۷۲ → ۹۴۱×۱۶۱۰)؛ بقیهٔ طرح دست‌نخورده؛ هیچ کد/HTML/CSS تغییر نکرد (مسیر تصویر ثابت). smoke: تصویر ۲۰۰ (۹۴۱×۱۶۱۰).
* **2026-09-20** — **Task 24 (همین جلسه/شاخه — حذف کامل لندینگ قبلی / شروع از نو):** مالک: «تمام قسمت‌های لندینگ رو حذف کن — میخوام دوباره شروع کنم» ⇒ (1) رندر تصویر کامل طرح (landing2.png) از home حذف شد → صفحهٔ placeholder مینیمال (YASNAFIT + «صفحهٔ اصلی در حال بازطراحی است.») در پوستهٔ هدر + فوتر معمولی؛ (2) CSS `landing-full` حذف → `home-placeholder`؛ (3) فایل `public/images/landing/landing2.png` حذف (۴۰۴)؛ (4) گروه home تست بازمهندسی‌شده (placeholder + هدر مالک + فوتر + نبود تصویر). **دست‌نخورده:** هدر مشترک (۵ لینک + ثبت نام/ورود + منوی موبایل) + فوتر در همهٔ صفحات عمومی؛ /about /services /results /magazine /contact؛ تصاویر woman/cover (سرو‌دهندهٔ /about + /results + مجله)؛ API/ورود/پنل‌ها. ۵۸ گروه + ۱۹/۱۹ + smoke زنده (landing2.png = ۴۰۴؛ بقیه = ۲۰۰).
* **2026-09-20** — **Task 25 (همین جلسه/شاخه — بازسازی لندینگ، مرحلهٔ ۱ از ۴: هیرو):** مالک Hero.png (۱۶۷۲×۹۴۱) را بارگذاری کرد: «فقط هیرو را بساز — بخش‌های دیگر بعداً می‌آیند» ⇒ (1) عکس = برش دقیق از مرجع (۷۳۱×۹۴۱، بدون ناحیهٔ متن) به‌عنوان `public/images/landing/hero-photo.jpg` در ستون چپ (~۴۴٪)؛ (2) ستون راست: لوگو «yasnafit.ir» (fit.ir فیروزه‌ای) + تیتر «بدنی قوی‌تر، زندگی بهتر» («بهتر» فیروزه‌ای) + لید سه‌خطی — HTML/CSS با توکن‌های طراحی موجود؛ **بدون دکمه** (در تصویر نیست)؛ (3) هدر/فوتر مشترک دست‌نخورده؛ بالای هیرو تیره (هدر fixed). Responsive: دسکتاپ دو ستون (عکس چپ/متن راست) • موبایل عکس بالا + متن زیر. ۵۸ گروه + ۱۹/۱۹ + smoke زنده (hero-photo 200؛ /about /magazine /results 200). **مرحله‌های ۲–۴ منتظر تصویرهای دیگر مالک.**
* **2026-09-20** — **Task 25 (اصلاح — سایز و تعادل هیرو، گزارش مالک):** «عکس خیلی بزرگ/زوم‌شده، چیدمان نامتعادل، متن فشرده» ⇒ فقط `public/landing.css` بازنویسی شد: (1) عکس دیگر به ارتفاع کامل هیرو کشیده نمی‌شود (قبلی: height:100% + cover → ~۱۵%% زوم روی مانیتور بزرگ)؛ حالا نسبت طبیعی ۷۳۱:۹۴۱ + سقف 700px/540px، وسط‌چین در ستون ۴۸٪ — کل بالاتنه (ژاکت+شانه‌ها) بدون زوم/برش/تغییر هویت؛ (2) ستون‌ها ۴۸/۵۲؛ (3) حاشیهٔ راست متن 16vw→6vw + لوگو/تیتر بزرگ‌تر؛ (4) فاصلهٔ 96px زیر پاراگراف برای دکمه‌های آینده؛ (5) موبایل: عکس قاب (حداکثر 380px) وسط‌چین بالای متن. ۵۸ گروه + ۱۹/۱۹ + smoke زنده (CSS جدید سبز؛ هدر/فوتر دست‌نخورده).
* **2026-09-20** — **Task 25 (اصلاح ۲ — ریشه‌ای، لایه‌بندی هیرو، گزارش مالک):** «بین عکس و متن گپ خیلی زیاد و خالی + عکس خراب/درست رندر نشده» ⇒ ریشه‌ها: (1) ستون‌ها بدون سقف عرض روی صفحهٔ عریض + مارجین/پدینگ متن → گپ تا ~۲۵۰px؛ (2) sizing خودکار عکس (auto + سقف‌ها + justify-self:center) → رندر ناپایدار؛ (3) JPEG q88 → نرمی روی ریتینا. رفع (فقط بلاک هیرو): (الف) کانتینر `max-width: 1160px` وسط‌چین → گپ روی صفحهٔ عریض ثابت می‌ماند؛ (ب) ستون‌ها متن 54٪/عکس 46٪ + **gap 40px** + حذف مارجین‌های اضافه متن؛ (ج) عکس `object-fit: contain` در جعبهٔ کشیده‌شده (نسبت ۷۳۱:۹۴۱ دقیق، بدون کشیدگی/برش/زوم)؛ (د) تصویر → **PNG lossless** (815KB) به‌جای JPEG 93KB (صفر آرتیفکت)؛ (هـ) موبایل: عکس قاب 380px وسط‌چین + متن زیرش (28px) بدون فاصلهٔ اضافه. ۵۸ گروه + ۱۹/۱۹ + smoke زنده (PNG 200 با ۷۳۱×۹۴۱؛ هدر/فوتر دست‌نخورده).
* **2026-09-20** — **Task 25 (اصلاح ۳ — نهایی، هیرو، اعتراض مالک):** «چرا عکس من رو نابود کردی — وسط عکس دستکاری شده و نیست — دقیقاً همین عکس رو استفاده کن بدون هیچ فاصله‌ای و حذفیاتی» ⇒ **کل برش 731px و نسخه‌های چیدمانی/دو ستونه رد شد**؛ هیرو = **دقیقاً کل Hero.png اصلی مالک** (فایل از main، byte-identical، 1672×941) تمام‌عرض با نسبت طبیعی — بدون هیچ برش/ویرایش/فاصله‌ای؛ متن/لوگو بخشی از تصویر است (متن HTML تکراری نیست). `hero-photo.png` (برش) حذف شد. فقط `server.js` (home)، `landing.css` (یک قانون ساده)، تست‌ها و فایل‌های تصویر. ۵۸ گروه + ۱۹/۱۹ + smoke (hero.png = 200 با 1672×941؛ برش قدیمی = 404). **درس: تصویر مرجع مالک هرگز بدون اجازهٔ صریح برش/تغییر نمی‌شود.**
* **2026-09-20** — **Task 25 (اصلاح ۴ — اندازهٔ هیرو، تأیید+درخواست مالک):** «بهتر شد ولی عکس خیلی بزرگه — کوچک‌تر جمع‌وجور‌ترش کن؛ موبایل هم مناسب باشد» ⇒ فقط `landing.css`: `home-hero__img` سقف عرض 941px + وسط‌چین (دسکتاپ: بنر جمع‌وجور با فضای تیره دو طرف؛ موبایل <941px: تمام‌عرض ریسپانسیو) — همان الگوی تأییدشدهٔ Task 22. تصویر همچنان **کل Hero.png بدون برش**. ۵۸ گروه + ۱۹/۱۹ + smoke (قانون جدید + hero.png 200).
* **2026-09-20** — **Task 25 (مرحلهٔ ۲ از ۴ — درباره من، درخواست مالک):** حذف کامل About Me قدیمی + بخش تمیز دقیقاً بر اساس About Me.png ⇒ `server.js`: حذف aboutBody + ۵ تابع کمکی (۱۳۴ خط) + about از meta/sitemap؛ `/about` → **302 → /#about**؛ home: هیرو دست‌نخورده (فقط داخل div.home-hero پیچیده شد) + بخش جدید `section#about.home-about` با **دقیقاً کل About Me.png** (byte-identical با main، بدون برش، بدون تکرار متن). `landing.css`: ۲ قانون جدید با همان قاعدهٔ هیرو تأییدشده (سقف عرض ۹۴۱px + وسط‌چین؛ موبایل تمام‌عرض) + حذف ~۲۳۰ خط CSS قدیمی about. لینک هدر «درباره من» ماند و به بخش می‌رسد. ۵۹ گروه سبز + smoke زنده (تصویر 200 / 302 درست / sitemap بدون about / ۰ ارجاع محتوای قدیمی). پنل مربی + auth دست‌نخورده (API پروفیل سالم).
* **2026-09-20** — **Task 25 (اصلاح مرحلهٔ ۲ از ۴ — درباره من، دستور مالک):** «روی درباره من کلیک میکنم باید صفحه جدید درباره من باز بشه» ⇒ ریدایرکت 302 حذف شد؛ `/about` دوباره صفحهٔ عمومی = **صفحهٔ جداگانهٔ جدید درباره من**: هدر مشترک + دقیقاً کل About Me.png (سقف عرض ۹۴۱px، همان هیرو) + فوتر مشترک — صفر محتوای قدیمی. لینک هدر «درباره من» مستقیم به آن می‌رسد. بخش about روی لندینگ (زیر هیرو) هم ماند. ۶۰ گروه سبز + smoke زنده (200 / title «درباره من» / تصویر کامل / هدر+فوتر / ۰ محتوای قدیمی / sitemap OK).
* **2026-09-20** — **Task 21 (همین جلسه/شاخه — لندینگ = تصویر کامل طرح مرجع `landing2.png`):** مالک از Task 20 (فقط عکس‌ها) راضی نبود: «خوب نشد راضی نیستم — همین تصویر مرجع رو کامل استفاده کن؛ بعدا جای دکمه ها رو مشخص میکنیم» ⇒ بدی صفحهٔ `/` حالا تصویر کامل `public/images/landing/landing2.png` است (تمام‌عرض، بدون هدر/فوتر/دکمه — همهٔ المان‌های طرح بصری)؛ `<head>`/SEO دست‌نخورده؛ ساختار لندینگ قبلی (`homeBody` + sample cards) از `server.js` حذف شد؛ سایر صفحات عمومی/دکمه‌ها/API/ورود دست‌نخورده؛ ورود مربی فعلاً مستقیم `/coach/login` یا `/coach/dashboard`. ۵۷ گروه test:public-site + ۱۹/۱۹ npm test + smoke زنده. تسک جدید T-19: جای‌گذاری دکمه‌ها بعد از مشخص‌شدن توسط مالک.
* **2026-09-20** — **Task 20 (همین جلسه/شاخه — تصویرهای اصلی برند لندینگ از طراحی مالک `landing2.png`):** مالک: «فقط عکس‌ها رو عوض کن. هیچ چیز دیگه‌ای رو تغییر نده» ⇒ هیرو = زن با کلاه مشکی (دست‌به‌سینه)، درباره = همان زن، CTA = نمای پشت، + ۴ تصویر کارت مجله (بدنسازی/تغذیه/علم ورزش/سلامت) — ۷ تصویر برش‌خورده در `public/images/landing/` + پیش‌فرض‌های `site.hero_image`/`site.about_image`/`site.cta_image` + src کارت‌های نمونه (`server.js`)؛ **هیچ** تغییر ساختار/متن/دکمه/فیلتر/آمار/چیدمان/رنگ؛ ۵۷ گروه test:public-site + ۱۹/۱۹ npm test + smoke زنده. KI-018 بسته شد؛ T-18 → PARTIAL (فقط OG).
* **افزونه (2026-09-19، درخواست مالک):** launcher (گزینه 1/2) به‌جای /coach/login حالا صفحه اصلی (لندینگ) را باز می‌کند — «نمیخوام این صفحه باز بشه اول، صفحه لندینگ بزار صفحه اصلی». `:OPEN_DASHBOARD` ⇒ `:OPEN_SITE` (URL `http://localhost:%PORT%/`)؛ منو همچنان 5 گزینه‌ای (گاردهای تست دست‌نخورده). ورود مربی از دکمه «ورود» هدر لندینگ یا مستقیم /coach/login. هم‌چنین ردیف راستی‌آزمایی deploy در DEPLOYMENT.md اصلاح شد (=/ = 200 لندینگ، نه 303). تست‌ها: ui-design + student-credentials + deployment + public-site سبز.
* **2026-09-19** — **Task 19 (همین جلسه/شاخه — بازسازی کامل صفحهٔ اصلی دقیقاً طبق wireframe `newlanding.png`):** مالک خروجی Task 18 را «کاملاً اشتباهه و شبیه طرح نیست» دید و خواست «از اول طبق newlanding.png بساز — نه شبیهش، دقیقاً همون ساختار و چیدمان». تغییرات: (1) ترتیب دقیق بخش‌ها از بالا به پایین (هیدر → هیرو → ۳ ویژگی → درباره → مجله → آمار → CTA → فوتر) — در تست assert شده. (2) ردیف ۳ ویژگی به ترتیب RTL طرح: مربیگری حرفه‌ای (دمبل) | ارزیابی و پیگیری (نمودار) | برنامه اختصاصی (کلیپ‌بورد). (3) درباره: جملهٔ فیروزه‌ای + بیو verbatim طرح + ۴ بج (پشتیبانی از تغذیه و ورزش / تخصیص بدنسازی بانوان / مدرک بین‌المللی IFBB / ۷ سال تجربه مربیگری) + «مشاهده رزومه». (4) مجله: وقتی مقالهٔ منتشرشده‌ای نیست، همیشه ۴ کارت نمونه (متن‌های طرح verbatim + تاریخ ۱۴۰۵/۶/۲۷ + «۵ دقیقه») — نسخهٔ قبلی empty-state بود؛ همهٔ کارت‌ها به `/magazine` واقعی لینک دارند؛ رنگ badge بدنسازی (بنفش‌آبی) / علم ورزش (آبی) جابجا شد. (5) آمار: اعداد دقیق طرح ۵۰۰+ شاگرد موفق / ۷۰+ سال تجربه / ۱۲۰+ برنامه اختصاصی / ۹۸٪ رضایت شاگردان (آیکون در دایرهٔ خطی) — پیش‌فرض تا مالک عدد واقعی از پنل بزند (data از `profile.stats` اولویت دارد). (6) ساب‌لاین CTA verbatim: «همین حالا مسیر تغییر را شروع کن. من در کارت هستم.» (7) فوتر: ۳ آیکون اجتماعی (اینستاگرام/تلیگرام/فیسبوک) — با ست‌شدن، لینک واقعی (کلید جدید `site.contact_facebook` در جدول `settings` موجود + فیلد در تب تماس پنل)؛ تا آن وقت placeholder تزئینی (نه لینک مرده)؛ «ورود مربی» از فوتر حذف شد (روت `/coach/login` مستقیماً کار می‌کند؛ پنل از دکمهٔ هدر — TD-21)؛ copyright وسط‌چین `YASNAFIT © 2026 | تمامی حقوق محفوظ است.` (سال گریگوری خودکار). فایل‌ها: `server.js` (SSR home + آیکون‌های جدید cap/image/facebook)، `public/landing.css` (label دو‌رنگ، pill فعال، رنگ badge، .about-badges، مدیای نمونه، فوتر)، `src/public-content-service.js` (کلید facebook)، `public/magazine-admin.js` (فیلد facebook)، `tests/public-site-regression.js` (گروه home بازنویسی). **۵۷ گروه** `test:public-site` + **۱۹/۱۹** `npm test` + smoke زندهٔ 3020 (۸ URL = 200؛ `/coach/dashboard` ناشناس → 303؛ `/` با کوکی جعلی → 200 لندینگ `data-coach-session="0"`). **بدون کامیت.**
* **2026-09-19** — **Task 18 (جلسهٔ `arena/01a0b993-yasnafit` — شماره‌گذاری docs — تطبیق دقیق صفحهٔ اصلی با wireframe `newlanding.png`):** صفحهٔ `/` عمومی دقیقاً ۸ بخش به ترتیب `هیدر → هیرو → ۳ ویژگی → درباره → مجله → آمار → CTA پایانی → فوتر` با ترکیب عمداً **تصویر چپ / متن راست** (DOM RTL، بدون آینه‌سازی — TD-20). هیرو: eyebrow YASNAFIT + تیتر دوخطی (خط دوم cyan) + «شروع مسیر من»/«آشنایی با من» + تصویر با `object-fit:cover` و `object-position: 26% 26%`. نوار ۳ ویژگی (برنامه اختصاصی / ارزیابی و پیگیری / مربیگری حرفه‌ای). درباره: تصویر چپ + متن راست + ۴ کارت آیکون‌دار + «مشاهده رزومه» → `/about`. مجله: «YASNAFIT MAGAZINE» + ۶ pill که **لینک** به فیلتر موجود `/magazine?category=…`‌اند (سیستم دوم نساخته شد) + «مشاهده همه مقالات»؛ کارت مقاله با badge رنگی دسته (۵ رنگ پیش‌فرض)، meta با آیکون تاریخ/ساعت + «۵ دقیقه» + CTA «مطالعه مقاله». نوار آمار ۴ ستونه **داده‌محور** (`profile.stats` یا ۴ عبارت کیفی — آمار ساختگی منتشر نمی‌شود). CTA پایانی: چیدمان دو‌ستونه + تنظیم جدید `site.cta_image` (جدول `settings` موجود، بدون مایگریشن). فوتر یک‌ردیفه (brand | nav | socials فقط با آیدی واقعی). بخش‌های services/results از home خارج شدند (صفحاتشان دست‌نخورده). `tests/public-site-regression.js` ⇒ **۵۴ گروه**؛ `npm test` = **۱۹/۱۹**؛ e2e سبز؛ smoke زنده ۱۶/۱۶ URL ۲۰. **بدون کامیت.**
* **2026-09-19** — **Task 17 (همین جلسه/شاخه — شماره‌گذاری docs — سایت عمومی YASNAFIT + پنل مجله):** ۷ صفحه SSR فارسی/RTL (home, about, services, results, contact, magazine, article) + SEO (canonical/OG/JSON-LD/sitemap/robots) + `src/article-service.js` + `src/public-content-service.js` + مایگریشن `031_magazine_public_site` (۴ جدول) + پنل مربی `/coach/magazine` (CRUD مقاله، دسته‌ها، تنظیمات سایت شامل `site.{hero,about,cta,og}_image`) + مسیر دوقلو `/` (ناشناس=عمومی، مربی=SPA). UI عمومی بدون واژهٔ AI (فقط `content_origin` داخلی). `package.json` ⇒ ۱۹ سوئیت. **بدون کامیت** (با Task 18 در یک working tree).

* **2026-09-08** — **Task 26 (همین جلسه — بانک حرکات: سه درخواست مالک):** (۱) **خوانایی/موبایل «افزودن حرکت دستی»:** اندازه‌های ریز inline (عنوان ۱۱px، ورودی ۱۰px/۳۶px، راهنما ۸px، دکمهٔ «ثبت حرکت» ۳۲px) حذف و به `program-builder.css` منتقل شد ⇒ عنوان ۱۳px/۸۰۰، ورودی‌ها ۱۳px با `min-height: var(--component-control-height)` (۴۲px)، راهنما ۱۱px، دکمهٔ ثبت ۴۲px و در موبایل **تمام‌عرض/۴۶px/۱۴px**، دکمهٔ «＋ افزودن حرکت دستی» هم `drawer-manual-toggle` (۴۲px) و در موبایل تمام‌عرض. (۲) **انتخابگر ست زیر افزودن دستی با اعمال خودکار:** بلوک `#drawerSetPreset` + سلکت `#drawerPresetSelect` (گزینهٔ صریح «۱ × ۱۲ (پیش‌فرض)» + هر ۱۵ preset) دقیقاً زیر `#drawerQuickAdd`؛ هلپر `setsForNewMovement()` و استفاده در **هر دو مسیر افزودن** (ثبت دستی و انتخاب از لیست بانک) ⇒ حرکت تازه با همان ست‌ها ساخته می‌شود و دوباره‌کاری در کارت حرکت لازم نیست؛ نوار فقط هنگام تکمیل یک سیستم دیده می‌شود و با بستن بانک مخفی می‌شود. (۳) **حذف «عضله هدف درگیر»** از پنل افزودن دستی (سلکت/چیپ/state/بایندینگ) و از فرم ویرایش حرکت (بلوک `mv-anatomy` با آدمک جلو/پشت و ۲۱ لایهٔ عضله + متغیرهای مرده) و CSS مردهٔ مربوطه؛ `.mv-learn` تک‌ستونه شد. **حفظ‌شده‌ها (عمدی):** `muscleCatalog` + `mov.target_muscles=activeMuscleIds` ⇒ دادهٔ عضلات هدف همچنان ذخیره و در **PDF و پنل شاگرد** نمایش داده می‌شود؛ ستون DB/مایگریشن ۰۲۳/API دست‌نخورده (بدون مایگریشن مخرب)؛ «آموزش حرکت» (ویدیو) سر جایش؛ دیالوگ بانک حرکات (`exercises.js`) دست‌نخورده. گارد `tests/movement-dialog-regression.js` با تصمیم مالک هم‌زمان شد (بخش ۵ معکوس + بخش‌های ۶/۷ جدید) و `tool/smoke-program-builder.js` پنج چک عملکردی گرفت. `npm test` = ۱۸/۱۸ ✅ • هر سه smoke ✅ • **جهش‌سنجی ۴/۴** ✅.
* **2026-09-08** — **Task 25 (جلسهٔ `arena/01a0817f-yasnafit` — اصلاح `docs/project-tracking/PROJECT-CONTEXT.md`: احراز هویت قدیمی «فعلی/VERIFIED» نوشته شده بود):** انتخاب مستقیم مالک از بین گزینه‌ها. آن سند مکانیزم **حذف‌شده** را فعال اعلام می‌کرد (خطوط ۵۷/۶۳/۲۵۲: فایل توکن `data/coach-access-token`، مسیر `/coach-access/{token}`، env مشترک `YASNAFIT_COACH_TOKEN`). اول همه‌چیز از کد راستی‌آزمایی شد: `YASNAFIT_COACH_TOKEN` در کل کد صفر مورد • `server.js:2667` ⇒ `/coach-access/*` عمداً ۴۰۴ • روت‌های واقعی `/api/coach/auth/*` و صفحه‌های `/coach/login|2fa|forgot|reset` • ثابت‌ها (`SESSION_TTL_MS=12h`, `OTP_TTL_MS=5min`, `RESET_TTL_MS=15min`, `MAX_OTP_FAILURES=3`, `MAX_PASSWORD_FAILURES=5`, `LOCK_MS=15min`, `SETUP_EMAIL` قفل‌شده، کوکی‌ها و فلگ‌ها) • `src/totp.js` (`PERIOD=30`, `DIGITS=6`, `window=1`) • هدرهای `src/request-security.js` • لیست کامل env با اسکن `process.env`. بعد §3 (ردیف احراز هویت + متغیرهای محیطی)، §6 (ردیف Authentication) و §11 (دسترسی مربی + هدرهای امنیتی) بازنویسی شدند؛ شمارنده‌های راستی‌آزمایی‌شده هم اصلاح شد (`server.js` ~1937⇒~۲۸۴۸ خط، ۲۲⇒۳۰ مایگریشن، ۹⇒۱۸ سوئیت تست، نسخهٔ مستندشده 0.9.0⇒0.9.1 بدون دست‌زدن به `package.json`)؛ شمارش ۳۹ جدول بازراستی‌آزمایی نشد ⇒ صریحاً `PARTIALLY VERIFIED`/snapshot. **رفع خطر تکرار خطای BR-13:** نام شاخهٔ کهنهٔ `arena/01a02ff4-yasnafit` از §۱۳ و پایین سند حذف و به §۱۷ همین حافظه ارجاع داده شد. **بدون هیچ تغییر کد/مایگریشن/API.** `npm test` = ۱۸/۱۸ ✅.
* **2026-09-08** — **بستن Task 24 و KI-015 با تأیید چشمی مالک + بازیابی docs:** هر دو تست چشمی روی production سبز شدند (بند §۶ بالا) ⇒ Task 24 و KI-015 در حافظه و `KNOWN-ISSUES.md` کامل بسته شدند. سه کامیت docs فقط-local جلسهٔ قبل با بازسازی سندباکس از دست رفته بودند (`git cat-file -t` ⇒ not a valid object) ⇒ کامیت push‌شدهٔ `8abd85c` cherry-pick شد (`583af1b`) و محتوای باقی‌مانده (لاگ `[Media]`، فکت‌های production، تست زندهٔ `programId:10` ⇒ `replacedExisting:true`) از گزارش مالک بازسازی و ثبت شد. `KI-016` (اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷) به‌عنوان مشاهدهٔ ثبت‌شدهٔ `UNKNOWN` اضافه شد — بدون ساخت داده.
* **2026-09-03** — **Task 24 (جلسهٔ `arena/01a06884-yasnafit` — رفع کارت تکراری «🤖 تولید پیش‌نویس هوشمند»):** گزارش مالک: هر بار زدن دکمه یک برنامه/کارت جدید ساخته می‌شود حتی وقتی برنامه‌ای در فرم باز است. ریشه: `generateProgramFromAssessment` پارامتر `programId` را در ساخت استفاده نمی‌کرد و ابزار `create_draft_program` (و fallback قطعی) همیشه INSERT جدید می‌زدند. رفع: resolve/اعتبارسنجی ردیف برنامهٔ باز در ابتدای تابع (نبود ⇒ 404 بدون ساخت ردیف؛ شاگرد دیگر ⇒ 400)؛ بعد از تولید، اگر `originalProgramId` هست، محتوا با `saveProgramToDB` روی **همان ردیف** اعمال می‌شود (روزها در جداول نرمال‌شده جایگزین می‌شوند — منبع حقیقت — و JSON همگام می‌شود) و ردیف گذرا hard-delete می‌شود (fallback: soft-delete) — در هر سناریویی کارت تکراری باقی نمی‌ماند. هش‌ها هنگام مهاجرت strip می‌شوند (تضاد UNIQUE `day_hash` — ریشهٔ شکست تلاش قبلی). پاسخ API همان `programId` قبلی + `replacedExisting` را برمی‌گرداند تا چت کپیلوت با `update_draft_program` روی همان برنامه بماند. مسیر چت AI (`update_draft_program`) دست‌نخورده. گارد 4d در `test:ai` (بدون AI واقعی — BR-8) + جهش‌سنجی (mutant ⇒ exit 1). `npm test` = ۱۸/۱۸. **PR #5 با تأیید مالک merge شد (`607587f`) و انتشارش با ریست uptime (~18:42:42Z) تأیید شد.** نکته: نسخهٔ قبلی این کار در جلسهٔ کوتاه‌شدهٔ `arena/01a0686c-yasnafit` کامیت/push نشد و با قطع شدن چت از دست رفت؛ در این جلسه از نو ساخته شد.
* **2026-09-03** — **Task 23 (جلسهٔ `arena/01a0671e-yasnafit` — رفع دکمه‌های مردهٔ CSP در بانک برنامه‌ها):** گزارش مالک: دکمهٔ «✏️ ویرایش» کار نمی‌کند و هر تغییر برنامه یک کارت جدید می‌سازد. ریشه: CSP `script-src 'self'` ویژگی‌های `onclick="…"` درون‌خطیِ تزریقی از `public/*.js` را بلاک می‌کند و گارد فقط `*.html` را اسکن می‌کرد؛ چون ویرایش مرده بود، تغییر برنامه همیشه از فرم خالی ⇒ POST ⇒ کارت جدید (منطق PUT سرور از اول درست بود).fix: ۹ دکمه به الگوی `data-*` + بایندینگ JS و ۱۱ fallback رسانه به listener سراسری capture (در `app.js` و `student-app.js`) تبدیل شد؛ گارد تست حالا `public/*.js` را هم اسکن می‌کند (جهش‌سنجی‌شده). `npm test` = ۱۸/۱۸. **merge شد (PR #4) و با auto-deploy منتشر شد** — مالک خواندن کد جدید از `program-builder.js` سرو‌شده روی production را تأیید کرد.
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
| KI-015 | عکس‌های ۱۸۸۸ حرکت روی Railway سرو نمی‌شد (کد فقط مسیر ریپو را می‌خواند ⇒ همیشه placeholder) | Medium (UX) | ✅ **CLOSED/VERIFIED** (رفع ۲۰۲۶-۰۹-۰۳ Task 22 — تأیید نهایی ۲۰۲۶-۰۹-۰۸: لاگ `[Media] Volume: 1888 \| ریپو: 0` + عکس واقعی `/api/exercise-image/4` در مرورگر مالک) | `src/storage-paths.js`, `server.js` | — (بسته شد؛ ویدیو عمداً روی Railway ۴۰۴ است) |
| KI-016 | لاگ production: «Exercises already imported: **2724** items» در برابر دیتاست مرجع **۲٬۷۰۷** (اختلاف ۱۷) | Low (مشاهده) | OPEN — `UNKNOWN / needs verification` | `data-source/exercises_data.json`, DB production | فقط با تأیید مالک و **کاملاً خواندنی**؛ هیچ حرکت ساختگی/حذف حدسی نه؛ DB/Volume هرگز ریست نشود |
| KI-004 | `node:sqlite` experimental | Low | OPEN (پایش) | `src/database.js` | پایش Node LTS |
| KI-005 | کلون تازه ۱۸۸۸ عکس حرکت را ندارد (by design) | Medium | OPEN | `public/assets/images/exercises/imported/` | ایمپورت لوکال |
| KI-006 | rate limiter در حافظه (با ری‌استارت ریست) | Low | OPEN/WONTFIX | `server.js` | T-13 |
| KI-007 | داده تستی e2e در DB محلی انباشته می‌شود | Low | OPEN | `tests/e2e-workflow.js` | T-05 |
| KI-008 | `tool/program-helper.py` بدون تست | Low | OPEN | `tool/` | T-12 |
| KI-010 | اجرای متوالی e2e (<۶۰ث) روی همان پروسه → 429 | Low | OPEN | `server.js` rate buckets | exempt در حالت تست |
| KI-011 | نبود تست مرورگر واقعی برای UI | Low-Med | OPEN | — | Playwright؟ (نیاز به تأیید مالک) |
| KI-012 | جستجوی «دسته+کوئری» فقط LIKE نرمال‌شده | Low | OPEN | `server.js` | رتبه‌بندی در صورت نیاز |
| KI-013 | آیتم «رمز ورود» منوی ⋮ مرده بود | Medium | **FIXED** (Task 13) | `public/students.js` | — |
| — | ✅ **بسته شد (Task 25 — ۲۰۲۶-۰۹-۰۸):** `docs/project-tracking/PROJECT-CONTEXT.md` مکانیزم احراز هویت قدیمی را «VERIFIED/فعلی» می‌دانست (خطوط ۵۷/۶۳/۲۵۲) | Low (مستندات) | **FIXED** (Task 25 — بازنویسی §3/§6/§11 از روی کد، با ارجاع به Task 16) | `docs/project-tracking/PROJECT-CONTEXT.md` | — |
| KI-017 | موتور auto-fetch مقالات (RSS/وب) در تنظیمات مجله خاموش است و پیاده نشده | Low (P2) | OPEN (T-17) | `src/public-content-service.js` | فقط با تأیید مالک |
| KI-018 | تصاویر برند سایت عمومی (هیرو/درباره/CTA/OG) | Low (بصری) | **CLOSED** (Task 20 — 2026-09-20: ۷ تصویر از `landing2.png` مالک در `public/images/landing/` + پیش‌فرض‌های `site.*_image`) | `server.js`, `src/public-content-service.js` | باقی‌مانده: فقط OG ⇒ T-18 (PARTIAL، اختیاری) |

---

## 12. Current TODO

مرجع اصلی: `docs/project-tracking/TODO.md` (T-01…T-16). **کار ساختگی اینجا نوشته نشده** — موارد زیر فقط تکرار وضعیت واقعی همان فایل + دو موردِ همین جلسه است:

### High Priority
* **P0:** در حال حاضر هیچ مورد P0 بازی وجود ندارد (تأییدشده در TODO).
* ~~وصل کردن سرویس در داشبورد Railway (مالک)~~ ✅ **انجام شده و زنده** (Project/Deploy از `main` + Volume روی `/app/data` + Domain `yasnafit-production.up.railway.app` + Auto-deploy روشن). باقی‌ماندهٔ واقعی فقط: پاک‌کردن `YASNAFIT_ALLOW_REMOTE_SETUP` و `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست. (هرگز DB/Volume را برای «حل مشکل deploy» ریست نکنید.)
* **تصمیم انتقال دادهٔ لوکال → Railway:** (الف) از صفر شروع کردن (پیشنهاد فعلی) یا (ب) افزودن endpoint ادمین «restore from upload» — گزینهٔ (ب) API جدید است و فقط با تأیید صریح مالک نوشته می‌شود.
* (به‌روز ۲۰۲۶-۰۹-۰۸) **اعمال تغییرات روی لوکال مهدی:** بلوک bat §17 با شاخهٔ `arena/01a0817f-yasnafit` + ری‌استارت لانچر + `Ctrl+Shift+R`. ⚠️ تغییرات این جلسه **فقط مستندات** است ⇒ رفتار برنامه عوض نمی‌شود و ری‌استارت سرور لازم نیست (رفرش مرورگر کافی است). DB لوکال دست‌نخورده می‌ماند.
* (جدید، فقط با تأیید مالک) **`KI-016` — اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷ حرکت:** بررسی **کاملاً خواندنی** (یافتن متن دقیق پیام لاگ در کد + گزارش تفکیکی شمارش `exercises`)؛ بدون نوشتار روی DB، بدون ساخت/حذف حرکت.
* (به‌روز ۲۰۲۶-۰۹-۲۰ — Task 22) **T-17: موتور auto-fetch مقالات** (P2 — فقط با تأیید مالک) • **T-18: تصاویر نهایی برند سایت عمومی** (PARTIAL — فقط تصویر OG باقی است؛ KI-018 بسته شد) • **T-19: هدر + دکمه‌های لندینگ** (DONE — Task 22: هدر ۵ لینک + ثبت نام/ورود + منوی موبایل + تصویر ۹۴۱px).

### Medium Priority
* T-14 کاتالوگ ۱۲ سیستم به DB (هنگام سینک) • T-02 پخش ویدیوی حرکات در UI • T-03 آپلود عکس حرکت از UI • T-04 پرکردن `equipment/difficulty/description/name_en` • T-05 پاکسازی داده تستی e2e • T-06 سرنوشت جداول legacy • T-07 طراحی لایهٔ سینک • T-15 افزودن `tool/smoke-*.js` به زنجیرهٔ `npm test` • T-11 مقاوم‌سازی harness تست.

### Low Priority
* T-08 اپ اندروید شاگرد • T-09 خروجی Excel/CSV • T-10 ویرایش گروهی دسته/محل حرکت • T-12 تست `program-helper.py` • T-13 rate-limiter پایدار.

---

## 13. Current Task

* **عنوان (جلسهٔ جاری، 2026-09-19 — `arena/01a0b993-yasnafit`):** **Task 17 (شماره‌گذاری docs): سایت عمومی YASNAFIT — ۷ صفحه SSR (لندینگ + مجله + مقالات) + پنل ویرایشی محتوای مربی `/coach/magazine` + مایگریشن 031**، و روی آن **Task 18: تطبیق دقیق صفحهٔ اصلی با wireframe `newlanding.png`** (۸ بخش به ترتیب، تصویر چپ/متن راست عمداً، نوار آمار داده‌محور، CTA دو‌ستونه با `site.cta_image`، فوتر یک‌ردیفه، pillهای مجله به‌عنوان لینک به فیلتر موجود، و روی اون بازسازی کامل صفحهٔ اصلی دقیقاً طبق wireframe** (متن‌های verbatim، ۴ کارت نمونه مجله، بج/آمار/CTA/فوتر، socials سه‌گانه).
* **مبنای wireframe:** تصویر `newlanding.png` (در ریشهٔ remote main) **فقط** نقش blueprint دارد — نه سایت، نه background، نه منبع عکس. ترکیب چپ/راست عمداً آینه نیست (DOM RTL، متن=اولین فرزند).
* **قواعد اجرا (مالک):** عکس شخص فقط مالک/پلاسی‌هولدر برند (هرگز تولید/جستجوی تصویر)؛ آمار و اطلاعات شخصی فقط از داده/تنظیمات (پیش‌فرض: ۴ عبارت کیفی)؛ بدون دکمهٔ مرده، بدون سیستم فیلتر/اداری دوم، بدون واژهٔ AI در UI؛ همهٔ تنظیمات از پنل مربی موجود.
* **نتیجهٔ مورد انتظار و حاصل:** پیاده‌سازی + اتصال + responsive + تست. ✅ `npm test` = **۱۹/۱۹** (public-site = ۵۴ گروه) • e2e روی سرور زنده = PASS • smoke ۱۶/۱۶ URL • بررسی توالی DOM همهٔ ۸ بخش در HTML زنده.
* **وضعیت نهایی:** ✅ **انجام شد و مستند شد — کاملاً بدون کامیت** (5 مستند پیگیری + حافظه این فایل به‌روز؛ commit/PR منتظر تأیید مالک).
* **افزونه (۲۰۲۶-۰۹-۱۹، درخواست مالک):** «/» قبل دوقلو بود (مربی نشست‌دار ⇒ داشبورد) ⇒ حالا «/» همیشه لندینگ عمومی است؛ پنل مربی از دکمهٔ «پنل مربی» هدر یا `/coach/dashboard` (TD-21). تست‌ها ۵۷ گروه + ۱۹/۱۹.
* **افزونه (2026-09-19، درخواست مالک — Task 19):** صفحهٔ اصلی طبق ۷ دستور صریح مالک (ترتیب دقیق بخش‌ها و حذف/جابجایی ممنوع، کپی verbatim همهٔ متن‌ها از طراحی — حتی متن نمونهٔ مقالات، رنگ مشکی/آبی تیره + فیروزه‌ای، فونت فارسی با وزن‌های مختلف، RTL کامل، حفظ تصاویر placeholder فقط ساختار/چیدمان) از اول و دقیقاً طبق `newlanding.png` بازسازی شد — TD-22. خروجی قبلی (Task 18) به‌عنوان «کاملاً اشتباهه و شبیه طرح نیست» رد شد. ۵۷ گروه + ۱۹/۱۹ + smoke زنده سبز. **بدون کامیت.**
* **Task 20 (2026-09-20، درخواست مالک — تصویرهای برند):** «فقط عکس‌ها رو عوض کن. هیچ چیز دیگه‌ای رو تغییر نده» ⇒ ۷ تصویر از `landing2.png` (هیرو/درباره/CTA + ۴ کارت مجله) در `public/images/landing/` + پیش‌فرض‌های `site.*_image` + src کارت‌ها؛ چیدمان/متن/دکمه/فیلتر/آمار کاملاً دست‌نخورده (قاعدهٔ صریح مالک). ✅ ۵۷ گروه + ۱۹/۱۹ + smoke زنده؛ committed + push شده.
* **Task 21 (2026-09-20، درخواست مالک — لندینگ = تصویر کامل):** مالک از Task 20 راضی نبود («خوب نشد راضی نیستم») و دستور داد «همین تصویر مرجع رو کامل استفاده کن؛ بعدا جای دکمه ها رو مشخص میکنیم» ⇒ صفحهٔ `/` حالا کل `landing2.png` را تمام‌عرض رندر می‌کند (بدون هدر/فوتر/دکمه — بقیهٔ صفحات عمومی هدر/فوتر دارند؛ ورود مربی مستقیم `/coach/login` یا `/coach/dashboard`). ساختار قبلی لندینگ از کد حذف شد. ✅ ۵۷ گروه + ۱۹/۱۹ + smoke زنده؛ committed + push شده.
* **Task 22 (2026-09-20، درخواست مالک — هدر + دکمه‌ها + اندازه):** «عکس خیلی بزرگه؛ کوچک‌تر کن مناسب موبایل هم باشه؛ بالا هدر؛ دکمه‌ها: خانه - درباره من - خدمات - مجله - نتایج - ثبت نام - ورود» ⇒ هدر واقعی با لیست دقیق مالک + ثبت نام/ورود (فلوهای موجود) + منوی موبایل؛ تصویر به عرض ۹۴۱px وسط‌چین (موبایل: تمام‌عرض). ✅ ۵۸ گروه + ۱۹/۱۹ + smoke زنده؛ committed + push شده.
* **Task 23 (2026-09-20، درخواست مالک — پاک‌کردن نوشته‌های تکراری):** «زیر دکمه‌ها نوشته‌های قبلی عکس بود؛ پاک کن» ⇒ نوار هدرِ خودِ تصویر (۶۲px: لوگو/منو/شعار/دکمه داخل تصویر) برش خورد؛ فقط فایل تصویر عوض شد (۹۴۱×۱۶۱۰)، کد دست‌نخورده. ✅ smoke سبز؛ committed + push شده.
* **Task 24 (2026-09-20، درخواست مالک — حذف کامل لندینگ / شروع از نو):** «تمام قسمت‌های لندینگ رو حذف کن — میخوام دوباره شروع کنم» ⇒ کل لندینگ تصویر‌محور (تصویر + کد + CSS + تست‌های خاصش) حذف شد؛ «/» = placeholder مینیمال در پوستهٔ هدر/فوتر مشترک (که دست‌نخورده ماند). منتظر طرح جدید مالک. ✅ ۵۸ گروه + ۱۹/۱۹ + smoke سبز؛ committed + push شده.
* **Task 25 (2026-09-20، درخواست مالک — بازسازی لندینگ، مرحلهٔ ۲ از ۴: درباره من):** About Me قدیمی کاملاً رفت ⇒ **صفحهٔ جدید /about** (هدر مشترک + دقیقاً کل About Me.png + فوتر مشترک؛ سقف عرض ۹۴۱px، همان هیرو تأییدشده) + بخش about زیر هیرو روی لندینگ؛ لینک هدر «درباره من» مستقیم به صفحهٔ جدید می‌رسد. ✅ ۶۰ گروه + ۱۹/۱۹ + smoke سبز؛ committed + push شده. **مرحله‌های ۳–۴: منتظر تصویرهای دیگر مالک.**


## 14. Last Session Handoff

### What was done
1. **Task 17 (سایت عمومی):** ۷ صفحه SSR فارسی/RTL با SEO (canonical/OG/JSON-LD/sitemap/robots)؛ مسیر دوقلو `/` (ناشناس=عمومی، مربی=SPA)؛ مجله با فیلتر pill + query URL؛ صفحهٔ مقاله با برادکرامب/منابع/مرتبط؛ `src/article-service.js` + `src/public-content-service.js`؛ مایگریشن `031_magazine_public_site` (۴ جدول: `articles`, `article_sources`, `article_related`, `magazine_settings` ⇒ ۵۳ جدول)؛ پنل مربی `/coach/magazine` (CRUD مقاله/دسته + «تنظیمات سایت» شامل `site.{hero,about,cta,og}_image` و auto-fetch خاموش)؛ ۱۹ سوئیت در `package.json`.
2. **Task 18 (wireframe):** صفحهٔ اصلی دقیقاً ۸ بخش: هیدر (لوگو راست، منو، «ورود» با آیکون) → هیرو (متن راست: eyebrow + تیتر دوخطی خط دوم cyan + «شروع مسیر من»/«آشنایی با من»؛ تصویر چپ: crop 26% 26%) → ۳ ویژگی (برنامه اختصاصی/ارزیابی و پیگیری/مربیگری حرفه‌ای) → درباره (تصویر چپ/متن راست + ۴ کارت آیکون + «مشاهده رزومه») → مجله (تیتر + ۶ pill **لینک** + کارت با badge رنگی/meta/CTA) → نوار آمار ۴ستونه داده‌محور → CTA پایانی دو‌ستونه (`site.cta_image`) → فوتر یک‌ردیفه. خدمات/نتایج از home حذف (صفحاتشان دست‌نخورده).
3. **تست‌ها:** `tests/public-site-regression.js` ⇒ **۵۴ گروه** (ترتیب DOM، empty-state، cta_image round-trip، footer socials gate، badge رنگ‌ها، pill guard)؛ `npm test` = ۱۹/۱۹ exit 0؛ `npm run test:e2e` روی سرور زنده = ok:true؛ smoke ۱۶ URL (۷ صفحه + category + sitemap/robots + assetها) همه 200.
4. **مستندات:** ۵ فایل `docs/project-tracking/` (Task 17/18 در CHANGELOG، TD-20، KI-017/018، T-17/18، PROJECT-CONTEXT) + همین حافظه.
5. **افزونهٔ Task 18 (ریشه):** با درخواست مالک «فقط لندینگ را خواستم ارتقا بدم؛ الان میره تو صفحهٔ مربی» ⇒ «/» برای همه (از جمله مربی نشست‌دار) لندینگ عمومی شد؛ ورودی پنل «/coach/dashboard» (gate + redirect ورود از قبل همین بود) — TD-21 + addendum CHANGELOG + بازنویسی گروه ۱۲ تست.

### What changed (همه committed + push شده — 2026-09-20)
**کد:** `server.js` (+۹۶۷ — homeBody/stats/CTA/footer/articleCard/header + ۱۳ آیکن SVG)، `src/migrations.js` (+۱۰۵)، `src/article-service.js` (جدید)، `src/public-content-service.js` (جدید)، `public/landing.css` (جدید — تمام sectionها + responsive 1180/960/640)، `public/landing.js` (جدید — pill guard)، `public/magazine-admin.css/js` (جدید — پنل مجله + فیلد `site.cta_image`)، `public/images/landing/` (SVG placeholderها)، `public/app.js`+`core.js`+`index.html` (لینک «ورود» به `/student/login` + assetهای CSP)، `package.json` (سوئیت جدید)، `tests/e2e-workflow.js`+`migration-regression.js` (assert 031).
**مستندات:** ۵ فایل docs/project-tracking + `mahdi hellp.md`. **هیچ مایگریشن مخرب/اضافی، هیچ API جدید خارج از docs، `version` = 0.9.1 دست‌نخورده.**

### What was tested
* `npm test` (۱۹ سوئیت) exit 0 — اجرا شده، نه ادعا.
* `npm run test:e2e` روی سرور زندهٔ 3020 = ok:true (fresh DB: 31 مایگریشن، ۲۷۰۷ حرکت).
* smoke زنده: ۱۶/۱۶ URL 200 + HEAD 200.
* DOM-order check روی HTML زنده: `hero__content` < `hero__media`، `about-preview__content` < `about-preview__media`، `cta-split__content` < `cta-split__media`، توالی offset همهٔ ۸ بخش صحیح؛ صفر services/results در home؛ ۶ pill + ۴ stats + ۴ about-card + ۳ features در HTML.

### What failed
* (تجربهٔ این session) نوشتار فارسی از طریق اسکریپت/ترمینال می‌تواند **هوموگلیف سیریلیک** داخل فایل جا بیندازد ⇒ بعد از هر نوشتار، ناحیهٔ هدف را با dump codepoint راستی‌آزمایی کنید و رفع را با index-splice (نه literal-match) انجام دهید.
* (تجربه) `pkill -f "node server.js"` پوستهٔ فراخواننده را هم می‌کشد ⇒ از PID یا `-xf` استفاده کنید.

### What remains
1. ~~**مالک: تصمیم commit + PR**~~ ✅ انجام شد — Task 17–20 committed + push روی `arena/01a0b993-yasnafit` (2026-09-20؛ طبق قاعدهٔ مالک **بدون PR**).
2. بعد از merge: auto-deploy ⇒ ریست uptime + تست چشمی مالک (هیرو/درباره/CTA، pillها، فوتر، پنل مجله).
3. **T-18 (باقی‌مانده):** فقط تصویر OG نهایی مالک (اختیاری) → `public/images/landing/` + ست `site.og_image` از «تنظیمات سایت» (KI-018 بسته شد؛ بقیهٔ تصاویر در Task 20 DONE).
4. ~~**T-19:** جای‌گذاری دکمه‌ها روی لندینگ~~ ✅ انجام شد (Task 22 — هدر بالا با لیست دقیق مالک + ثبت نام/ورود + منوی موبایل؛ مالک هدر را به‌جای دکمه‌روی‌تصویر انتخاب کرد).
5. **T-17:** موتور auto-fetch (P2، فقط با تأیید مالک).
6. تصمیم باز «غیرفعال‌کردن گوگل‌اتنتیکاتور» (جلسهٔ قبل) هنوز بی‌پاسخ.

### Exact next step for the next Agent
1. فقط `mahdi hellp.md` را بخوان؛ بعد `git status --short` (انتظار: تمیز روی `arena/01a0b993-yasnafit` — همهٔ کارهای Task 17–20 committed + push شده است).
2. کار بعدی فقط با درخواست مالک (کارهای باز فعلی: T-17/P2 + T-18-OG اختیاری — فقط با تأیید مالک).
3. پایان هر تسک: به‌روزرسانی همین فایل + commit + push + گزارش فارسی + بلوک `bat` §17 با نام شاخهٔ جلسه.


## 15. Files Changed Recently

| `server.js` | **Task 17+18 (بدون کامیت):** ۷ صفحهٔ عمومی SSR + API عمومی/مدیریتی + `statsMarkup`/`statsBandMarkup`/`cta-split`/`footerMarkup`/`articleCardMarkup` + ۱۳ آیکن SVG + header «ورود» | uncommitted این session |
| `src/article-service.js`, `src/public-content-service.js` | **Task 17 (جدید):** CRUD/فیلتر مقالات + تنظیمات سایت (`site.{hero,about,cta,og}_image`، auto-fetch خاموش) | uncommitted |
| `src/migrations.js` | **Task 17:** مایگریشن `031_magazine_public_site` (۴ جدول) | uncommitted |
| `public/landing.css`, `public/landing.js` | **Task 17+18 (جدید):** استایل/رفتار تمام ۸ بخش + responsive + pill guard | uncommitted |
| `public/magazine-admin.css`, `public/magazine-admin.js` | **Task 17+18 (جدید):** پنل مجله مربی + فیلد `site.cta_image` | uncommitted |
| `public/images/landing/` | **Task 18 (جدید):** SVG placeholderهای برند‌شده (coach/cover) | uncommitted |
| `tests/public-site-regression.js` | **Task 17+18 (جدید):** ۵۴ گروه (ترتیب DOM، wireframe composition، cta_image، footer gate) | uncommitted |
| `package.json`, `tests/e2e-workflow.js`, `tests/migration-regression.js`, `public/app.js`, `public/core.js`, `public/index.html` | ۱۹ سوئیت، assert 031، لینک «ورود» → `/student/login`، assetهای CSP | uncommitted |
| ۵ فایل `docs/project-tracking/` + `mahdi hellp.md` | Task 17/18 (CHANGELOG, TD-20, KI-017/018, T-17/18, PROJECT-CONTEXT, این حافظه) | uncommitted |
| مسیر | دلیل | وضعیت |
|---|---|---|
| `public/program-builder.js` | **Task 26 (این جلسه):** اندازه‌های خوانای پنل «افزودن حرکت دستی» (حذف inlineهای ریز)، نوار `#drawerSetPreset` زیر آن با `#drawerPresetSelect`، هلپر `setsForNewMovement()` در هر دو مسیر افزودن، حذف «عضله هدف درگیر» از پنل دستی و `mv-anatomy` از فرم حرکت (با حفظ `muscleCatalog` و `mov.target_muscles`) | committed این جلسه |
| `public/program-builder.css` | **Task 26:** ارتفاع/فونت کنترل‌های پنل دستی، `quickadd-submit` و `drawer-manual-toggle` با `--component-control-height`، حالت موبایل (تمام‌عرض/۴۶px)، استایل نوار ست‌ها، `.mv-learn` تک‌ستونه و پاک‌سازی CSS مردهٔ آناتومی | committed این جلسه |
| `tests/movement-dialog-regression.js` | **Task 26:** بخش ۵ معکوس (آناتومی باید حذف بماند، داده/ویدیو باید زنده بماند) + بخش ۶ (نوار ست زیر پنل دستی، ترتیب رندر، هر دو مسیر افزودن) + بخش ۷ (اندازه‌های خوانا/لمسی، نبود `!important` و CSS مرده) — جهش‌سنجی‌شده | committed این جلسه |
| `tool/smoke-program-builder.js` | **Task 26:** پنج چک عملکردی جدید (اعمال خودکار ۴×۱۰، پیش‌فرض ۱×۱۲، دید/پنهان‌شدن نوار ست، نبود «عضله هدف» و ماندن «آموزش حرکت») | committed این جلسه |
| `docs/project-tracking/PROJECT-CONTEXT.md` | **Task 25 (این جلسه):** بازنویسی احراز هویت (§3 ردیف «احراز هویت» + متغیرهای محیطی، §6 ردیف Authentication، §11 دسترسی مربی + هدرهای امنیتی) از روی کد راستی‌آزمایی‌شده؛ اصلاح شمارنده‌های کهنه (`server.js` ~۲۸۴۸ خط، ۳۰ مایگریشن، ۱۸ سوئیت، 0.9.1)؛ علامت‌زدن شمارش ۳۹ جدول به‌عنوان snapshot؛ حذف نام شاخهٔ کهنه از §۱۳ و پایین سند (دام BR-13) | committed این جلسه |
| `docs/project-tracking/KNOWN-ISSUES.md` | KI-015 ⇒ ✅ CLOSED/VERIFIED (با سه شاهد: لاگ `[Media]`، تست چشمی مالک، uptime زنده) + KI-016 جدید (اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷ — `UNKNOWN`، فقط خواندنی) | committed این جلسه |
| `docs/project-tracking/CHANGELOG.md` | دو مدخل ۱۴۰۵/۰۶/۱۷: (۱) بستن Task 24/KI-015 + بازیابی docs (۲) Task 25 | committed این جلسه |
| `mahdi hellp.md` | به‌روزرسانی کامل برای جلسهٔ `arena/01a0817f-yasnafit` (§4/§5/§6/§9/§10/§11/§12/§13/§14/§15/§16/§17) + cherry-pick `583af1b` (بازیابی کامیت docs جلسهٔ قبل) | committed این جلسه |
| `src/ai-service.js` | Task 24: جایگزینی درجای «تولید پیش‌نویس هوشمند» وقتی برنامه‌ای باز است (resolve `originalProgramId` + بلوک مهاجرت با strip هش + `discardGeneratedProgramRow` + پاسخ با همان id و `replacedExisting`) | committed این جلسه |
| `tests/ai-service-regression.js` | Task 24: گارد 4d — بدون programId ⇒ ردیف جدید؛ با programId ⇒ همان id، بدون ردیف تکراری (live/total)، روزها/هش‌ها/پیوندها؛ programId ناموجود ⇒ خطا و صفر ردیف (جهش‌سنجی‌شده) | committed این جلسه |
| `docs/project-tracking/CHANGELOG.md` | مدخل Task 24 | committed این جلسه |
| `mahdi hellp.md` | به‌روزرسانی جلسهٔ `arena/01a06884-yasnafit` (Task 24 + auto-deploy روشن + بازسازی از دست رفتن کار جلسهٔ `arena/01a0686c`) | committed این جلسه |
| `public/program-builder.js`, `public/diet-programs.js`, `public/coach-submissions.js`, `public/students.js`, `public/exercises.js`, `public/student-app.js`, `public/app.js`, `public/ai-copilot.js`, `public/program-pdf.js` | Task 23: حذف هندلرهای درون‌خطیِ CSP-مرده ⇒ `data-*` + بایندینگ JS + fallback رسانهٔ سراسری | committed جلسهٔ قبل (merge PR #4) |
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
| Local (لوکال مهدی) | **BEHIND** | با بلوک bat §17 (شاخهٔ `arena/01a0b993-yasnafit`) هم‌زمان می‌شود؛ چون `public/*` و `server.js` تغییر کرده **ری‌استارت سرور + `Ctrl+Shift+R` لازم است**؛ DB لوکال دست‌نخورده می‌ماند |
| Local (سندباکس Agent) | **CURRENT (بدون کامیت)** | شاخهٔ `arena/01a0b993-yasnafit` = base `6301712` + کل Task 17/18 در working tree؛ سرور زنده روی 3020 با DB تازه (۳۱ مایگریشن، ۲۷۰۷ حرکت، داده e2e، بدون مربی provisioned) |
| Git / GitHub origin | **BEHIND** | `origin/main` = `8b693cb`؛ شاخهٔ جلسه push نشده؛ **PR باز نشده** — فقط با تأیید مالک |
| `main` | **`6301712` + merge‌های جدید (`8b693cb`)** | سایت عمومی هنوز روی main نیست؛ بعد از merge PR، build باید موفق شود و auto-deploy منتشر کند |
| Railway | **LIVE (0.9.1) — کد سایت عمومی هنوز نیست** | بعد از merge، auto-deploy ⇒ ریست uptime ملاک است. ⚠️ DB production مالک با DB سندباکس **هیچ ارتباطی ندارد**؛ دادهٔ e2e سندباکس نباید به production برسد |


**تا این لحظه هیچ workflow خودکار (GitHub Actions) در مخزن نیست؛ deploy با Railway از طریق اتصال repo انجام می‌شود (auto-deploy روی push به شاخهٔ متصل، محدود به `watchPatterns`).**

---

## 17. دستورات اجرای پروژه (پایان هر گزارش — قاعدهٔ ثابت)

نام شاخه در بلوک زیر باید با **شاخهٔ جلسهٔ جاری** جایگزین شود (فعلاً `arena/01a0b993-yasnafit`)؛ ساختار بلوک تغییر نکند:

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a0b993-yasnafit
git pull --ff-only origin arena/01a0b993-yasnafit
.\YASNAFIT-LAUNCHER.bat
```
