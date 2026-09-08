# MAHDI HELLP — YASNAFIT PERSISTENT AGENT MEMORY

> **این فایل حافظهٔ دائمی پروژه است.** اولین کاری که هر Agent/Arena جدید باید بکند: فقط همین فایل را بخواند، سپس سراغ فایل‌های مرتبط با تسک جاری برود. **کل مخزن یا همهٔ مستندات را ناخوانده باز نکنید.**
> آخرین به‌روزرسانی: **2026-09-08** (توسط Agent جلسهٔ `arena/01a0817f-yasnafit` — Task 25: اصلاح احراز هویت قدیمی در `PROJECT-CONTEXT.md` + بستن کامل Task 24 و KI-015 با تأیید چشمی مالک + بازیابی docsِ ازدست‌رفتهٔ سندباکس قبل • **Task 26: بانک حرکات — خوانایی «افزودن حرکت دستی» در موبایل + انتخابگر ست زیر آن با اعمال خودکار + حذف «عضله هدف درگیر»**).
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
* **شاخهٔ کاری جلسه:** `arena/01a0817f-yasnafit` (از `main` = `607587f` = merge PR #5 ساخته شده) — همهٔ کارها فقط روی همین شاخه، push فقط به همین شاخه. شاخه‌های آرشیو: `arena/01a06884-yasnafit` (tip `8abd85c` = docs بعد از merge PR #5؛ کامیت کد Task 24 = `ab2a8a9`)، `arena/01a0671e-yasnafit` (`58615d4` = Task 23)، `arena/01a066e6-yasnafit` (`6e79fd9`). ⚠️ **سه کامیت docs پایانی جلسهٔ `arena/01a06884-yasnafit` (`a8132ae` + `57ea75c` + `5c61866`) هرگز push نشدند و با بازسازی سندباکس از دست رفتند** ⇒ در این جلسه محتوایشان از گزارش مالک بازسازی شد؛ کامیت push‌شدهٔ `8abd85c` روی origin بود و با cherry-pick به `583af1b` روی شاخهٔ این جلسه برگشت (بدون force-push). نکتهٔ قدیمی‌تر: جلسهٔ کوتاه‌شدهٔ `arena/01a0686c-yasnafit` هم هیچ کامیت/pushی نداشت و Task 24 از نو ساخته شد.
* **مستندات ریشه (حذفشان ممنوع):** `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `CHANGELOG.md` (محصولی/نسخه‌ها), `EXERCISE_MANAGEMENT.md`, **`DEPLOYMENT.md` (جدید)**.
* **مستندات پیگیری:** `docs/project-tracking/` → `PROJECT-CONTEXT.md` (کسب‌وکار + قواعد)، `CHANGELOG.md` (توسعه/تسک‌ها — Task 1…17)، `KNOWN-ISSUES.md` (KI-001…KI-013)، `TODO.md` (T-01…T-16)، `TECHNICAL-DECISIONS.md` (TD-*)، `archive/`.

---

## 5. Git / Arena State

| مورد | وضعیت تأییدشده |
|---|---|
| شاخهٔ جاری | `arena/01a0817f-yasnafit` (از `main` = `607587f` = merge PR #5 ساخته شد) |
| آخرین کامیت | **Task 26** (UI بانک حرکات: `public/program-builder.js` + `.css` + گارد + harness) روی **Task 25** (docs احراز هویت) روی `607587f` (merge PR #5) با واسطهٔ `583af1b` (cherry-pick کامیت docs جلسهٔ قبل) |
| کامیت قبلی | `8abd85c` (docs بعد از merge PR #5، جلسهٔ `arena/01a06884-yasnafit`) • `ab2a8a9` (کد Task 24) • `23fbbf1` (merge PR #4 = Task 23) • `58615d4` (Task 23) • `8354a68` (merge PR #3) • `e60d3eb` (Task 22) |
| working tree | **تمیز** بعد از کامیت‌های این جلسه (`git status --short` خالی) |
| local vs origin | شاخهٔ جلسهٔ `arena/01a0817f-yasnafit` به origin push شده؛ `main` = `607587f` (PR #5 MERGED — Task 24) |
| PR | **#6 باز** (Task 25 مستندات **+ Task 26 UI بانک حرکات** → main — merge فقط با تأیید مالک؛ چون هر دو روی شاخهٔ همین جلسه‌اند، در یک PR نشسته‌اند) • **#5 MERGED** (Task 24 → main، 2026-09-03 18:41:45Z با تأیید صریح مالک — merge commit `607587f`) • #4 MERGED (Task 23) • #3 MERGED • #2 MERGED • #1 CLOSED |
| وضعیت merge | محتوای PR #5 روی `main` است (`main` = `607587f`) و با auto-deploy منتشر شد (ریست uptime ~18:42:42Z) **و 2026-09-08 دوباره از بیرون راستی‌آزمایی شد**: `uptime:418274` در 14:54:25Z ⇒ استارت پروسه ≈ 2026-09-03T18:43:11Z = همان auto-deploy، ۴٫۸۴ روز بدون ری‌استارت ⇒ کد Task 24 هنوز زنده است. **تأیید چشمی مالک هم گرفته شد ⇒ Task 24 کاملاً بسته است** |
| اقدامات باز | (۰) **مالک: تصمیم دربارهٔ «غیرفعال‌کردن گوگل‌اتنتیکاتور»** — چهار گزینه در گزارش همین جلسه داده شد (فقط متغیر محیطی `YASNAFIT_ALLOW_2FA_SKIP=1` / تغییر کد با سوئیچ بازگشت / حل ریشه با چرخش کلید / حذف کامل). **هیچ تغییری در کد احراز هویت انجام نشد** چون روشش انتخاب نشد و کاهش امنیت روی دامنهٔ عمومی بدون انتخاب صریح مالک انجام‌شدنی نیست (۱) مالک: merge **PR #6** (Task 25 مستندات + Task 26 UI) ⇒ با merge، auto-deploy منتشر می‌کند و **این بار ریست uptime انتظار می‌رود** (چون `public/**` در `watchPatterns` است)؛ سپس تست چشمی سه مورد Task 26 (۲) مهدی در ویندوز: بلوک bat §17 با نام شاخهٔ همین جلسه (۳) پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست (۴) `KI-016` (اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷ حرکت) فقط با تأیید مالک و **کاملاً خواندنی** (۵) اختیاری با تأیید مالک: cache-busting نسخه‌دار اسکریپت‌ها (کش ۲۴ ساعتهٔ JS). ✅ **در این جلسه بسته شدند:** تست چشمی Task 24 • پاک‌کردن دستی کارت‌های تکراری قدیمی + تأیید چشمی شمارش کارت‌ها (کار مالک انجام شد) • لاگ `[Media]` + تست عکس `/api/exercise-image/4` ⇒ KI-015 بسته • اصلاح `PROJECT-CONTEXT.md` ⇒ Task 25 • بازیابی کامیت docs جلسهٔ قبل |
| هشدار Arena (تجربهٔ واقعی — دو رخداد) | سندباکس ممکن است بین جلسات بازسازی شود. **روش بازیابی (فقط داخل سندباکس، فقط شاخهٔ همین جلسه، بدون force-push):** اول `git status` را چک کن، بعد `git fetch -q origin arena/01a0817f-yasnafit` + `git update-ref refs/heads/arena/01a0817f-yasnafit FETCH_HEAD` + `git reset --hard FETCH_HEAD`. **روی ماشین لوکال مهدی این کار را نکنید** — آنجا فقط `git pull --ff-only`. ⚠️ درس ۱ (`arena/01a0686c`): کارِ کامیت‌نشده با قطع شدن چت از دست می‌رود. ⚠️ درس ۲ (همین جلسه): **کامیتِ push‌نشده هم از دست می‌رود** — سه کامیت docs جلسهٔ `arena/01a06884-yasnafit` فقط local بودند و سندباکس نو آن‌ها را نداشت (`git cat-file -t` ⇒ not a valid object name) ⇒ بلافاصله بعد از هر کامیت، push کنید. راه تشخیص درست: **محتوا نه هش** (`grep -c originalProgramId src/ai-service.js` = ۶). |

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
* **Auto-deploy روشن شد (۲۰۲۶-۰۹-۰۳ عصر — از جلسهٔ `arena/01a0671e-yasnafit` به بعد):** مالک Auto-deploy را روی Branch = `main` روشن کرد ⇒ بعد از هر merge، Railway خودش منتشر می‌کند و **«Check for updates» دیگر لازم نیست**؛ فقط بعد از merge با `GET /api/health` (fetch) ریست uptime را تأیید کنید. تأیید مالک بعد از merge PR #4 (Task 23): ریست uptime + خواندن کد جدید از خود `program-builder.js` سرو‌شده روی production.
* **وضعیت زنده (۲۰۲۶-۰۹-۰۳، جلسهٔ `arena/01a06884-yasnafit` — baseline قبل از merge PR #5):** `GET /api/health` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":2999}` (پروسه ~۵۰ دقیقه قبل از fetch ری‌استارت شده — سازگار با auto-deploy پس از merge PR #4) ⇒ کد Task 23 روی production اجرا می‌شود.
* **تأیید انتشار Task 24 (۲۰۲۶-۰۹-۰۳ 18:4x UTC، جلسهٔ `arena/01a06884-yasnafit`):** PR #5 با تأیید صریح مالک در **18:41:45Z** merge شد (merge commit `607587f`). یک ریست uptime در ~18:34:40Z دیده شد که **قبل از** merge بود (ملاک نیست)؛ ریست ملاک: fetch بعدی در 18:46:15Z → `uptime: 213` ⇒ استارت پروسه ~**18:42:42Z = ۵۷ ثانیه بعد از merge** ⇒ auto-deploy کد Task 24 روی production اجرا می‌شود. کامیتِ deploy از بیرون خواندنی نیست (قاعدهٔ ثابت) ⇒ اثبات نهایی رفتار جدید = تست چشمی مالک (دکمهٔ «🤖 تولید پیش‌نویس هوشمند» روی برنامهٔ باز ⇒ بدون کارت تکراری).
* **وضعیت زنده (۲۰۲۶-۰۹-۰۸ — راستی‌آزمایی مجدد از بیرون، جلسهٔ `arena/01a0817f-yasnafit`):** `GET /api/health` در `2026-09-08T14:54:25Z` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":418274}` ⇒ ۴٫۸۴ روز بدون ری‌استارت؛ استارت پروسه ≈ **2026-09-03T18:43:11Z** = دقیقاً auto-deploy بعد از merge PR #5 (18:41:45Z) ⇒ **کد Task 24 همین حالا روی production زنده است** (بدون نیاز به «Check for updates»). این عدد با build stamp `18:41:44Z` در لاگ Railway مالک هم سازگار است.
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
1. هرگز مستقیم روی `main` کار نکن؛ فقط شاخهٔ Arena جلسهٔ جاری (فعلاً `arena/01a0817f-yasnafit`). push فقط به همان شاخه.
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
16. شروع هر جلسه = خواندن `mahdi hellp.md` **اول از همه**، سپس فقط فایل‌های مرتبط با تسک؛ کل مخزن/همهٔ مستندات را ناخوانده باز نکن. پایان هر تسک معنادار = به‌روزرسانی همین فایل (§5، §10، §11، §12، §13، §14، §15، §16) و commit آن. `tests/deployment-hardening-regression.js` عمداً این فایل را از اسکن «ارجاع به فایل حذف‌شده» مستثنا کرده، چون اینجا باید نام فایل‌های حذف‌شده بیاید. مدخل بعدی `docs/project-tracking/CHANGELOG.md`: **Task 27** (Task 26 = بانک حرکات: خوانایی افزودن دستی + انتخابگر ست با اعمال خودکار + حذف «عضله هدف درگیر»؛ Task 25 = اصلاح احراز هویت قدیمی در `PROJECT-CONTEXT.md` — هر دو انجام شده).

---

## 10. Current Completed Work (فقط کارهای واقعاً انجام‌شده)

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

---

## 12. Current TODO

مرجع اصلی: `docs/project-tracking/TODO.md` (T-01…T-16). **کار ساختگی اینجا نوشته نشده** — موارد زیر فقط تکرار وضعیت واقعی همان فایل + دو موردِ همین جلسه است:

### High Priority
* **P0:** در حال حاضر هیچ مورد P0 بازی وجود ندارد (تأییدشده در TODO).
* ~~وصل کردن سرویس در داشبورد Railway (مالک)~~ ✅ **انجام شده و زنده** (Project/Deploy از `main` + Volume روی `/app/data` + Domain `yasnafit-production.up.railway.app` + Auto-deploy روشن). باقی‌ماندهٔ واقعی فقط: پاک‌کردن `YASNAFIT_ALLOW_REMOTE_SETUP` و `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست. (هرگز DB/Volume را برای «حل مشکل deploy» ریست نکنید.)
* **تصمیم انتقال دادهٔ لوکال → Railway:** (الف) از صفر شروع کردن (پیشنهاد فعلی) یا (ب) افزودن endpoint ادمین «restore from upload» — گزینهٔ (ب) API جدید است و فقط با تأیید صریح مالک نوشته می‌شود.
* (به‌روز ۲۰۲۶-۰۹-۰۸) **اعمال تغییرات روی لوکال مهدی:** بلوک bat §17 با شاخهٔ `arena/01a0817f-yasnafit` + ری‌استارت لانچر + `Ctrl+Shift+R`. ⚠️ تغییرات این جلسه **فقط مستندات** است ⇒ رفتار برنامه عوض نمی‌شود و ری‌استارت سرور لازم نیست (رفرش مرورگر کافی است). DB لوکال دست‌نخورده می‌ماند.
* (جدید، فقط با تأیید مالک) **`KI-016` — اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷ حرکت:** بررسی **کاملاً خواندنی** (یافتن متن دقیق پیام لاگ در کد + گزارش تفکیکی شمارش `exercises`)؛ بدون نوشتار روی DB، بدون ساخت/حذف حرکت.

### Medium Priority
* T-14 کاتالوگ ۱۲ سیستم به DB (هنگام سینک) • T-02 پخش ویدیوی حرکات در UI • T-03 آپلود عکس حرکت از UI • T-04 پرکردن `equipment/difficulty/description/name_en` • T-05 پاکسازی داده تستی e2e • T-06 سرنوشت جداول legacy • T-07 طراحی لایهٔ سینک • T-15 افزودن `tool/smoke-*.js` به زنجیرهٔ `npm test` • T-11 مقاوم‌سازی harness تست.

### Low Priority
* T-08 اپ اندروید شاگرد • T-09 خروجی Excel/CSV • T-10 ویرایش گروهی دسته/محل حرکت • T-12 تست `program-helper.py` • T-13 rate-limiter پایدار.

---

## 13. Current Task

* **عنوان (جلسهٔ جاری، 2026-09-08 — `arena/01a0817f-yasnafit`):** **Task 26 — بانک حرکات: خوانایی/موبایل «افزودن حرکت دستی» + انتخابگر ست زیر آن با اعمال خودکار + حذف «عضله هدف درگیر»** (انجام شد؛ منتظر merge PR #6 و تست چشمی مالک). پیش‌تر در همین جلسه: **Task 25** (اصلاح احراز هویت قدیمی در `PROJECT-CONTEXT.md`) + بستن Task 24 و KI-015 با تأیید چشمی مالک.
* **انتخاب تسک‌ها:** Task 25 از میان چهار گزینه توسط مالک انتخاب شد (گزینه‌های باقی‌مانده برای جلسات بعد: cache-busting نسخه‌دار اسکریپت‌ها، بررسی خواندنی `KI-016`). Task 26 سه درخواست مستقیم مالک دربارهٔ بانک حرکات بود و دامنهٔ دو مورد مبهم آن با پرسش روشن شد: حذف «عضله هدف» = **پنل افزودن دستی + فرم ویرایش حرکت** (نه دیالوگ `exercises.js`) • انتخابگر ست = **زیر پنل دستی + اعمال خودکار**. ⚠️ **درخواست «غیرفعال‌کردن گوگل‌اتنتیکاتور» هنوز بی‌پاسخ مانده** (مالک از پاسخ به گزینه‌ها صرف‌نظر کرد) ⇒ هیچ تغییری در کد احراز هویت داده نشد؛ چهار گزینه در §۱۴ و گزارش جلسه هست.
* **عنوان تسک قبلی:** Task 24 (رفع کارت تکراری «🤖 تولید پیش‌نویس هوشمند») — merge شد (PR #5، `607587f`)، انتشارش با auto-deploy تأیید شد و **تست چشمی مالک هم سبز شد ⇒ کامل بسته است**.
* **هدف Task 25:** سندِ «حافظهٔ فنی دائمی» نباید مکانیزم حذف‌شده را فعال نشان دهد؛ همهٔ ادعاها باید از کد راستی‌آزمایی شوند و هر شمارندهٔ کهنه یا اصلاح شود یا صریحاً snapshot علامت بخورد.
* **فایل‌های مرتبط:** `docs/project-tracking/PROJECT-CONTEXT.md` (تنها فایل ویرایش‌شدهٔ محتوایی تسک)، `docs/project-tracking/KNOWN-ISSUES.md` (بستن KI-015 + KI-016 جدید)، `docs/project-tracking/CHANGELOG.md` (دو مدخل ۱۴۰۵/۰۶/۱۷)، همین فایل. **فایل‌های فقط-خوانده‌شده برای راستی‌آزمایی:** `server.js`، `src/coach-auth-service.js`، `src/totp.js`، `src/request-security.js`، `src/migrations.js`، `package.json`، `tests/deployment-hardening-regression.js`.
* **نتیجهٔ مورد انتظار:** `npm test` سبز (۱۸/۱۸) بدون هیچ تغییر کد + صفر ادعای کهنهٔ احراز هویت در `PROJECT-CONTEXT.md` + ثبت وضعیت‌های بسته‌شده در حافظه.
* **وضعیت نهایی:** ✅ **انجام شد** — `npm test` = ۱۸/۱۸ (exit 0) بعد از ویرایش؛ همهٔ ویرایش‌ها با anchor یکتا و assert انجام شد. کامیت `ca53577` روی شاخهٔ جلسه + push فوری + **PR #6 باز** (merge فقط با تأیید مالک). تسک بعدی از مالک/TODO گرفته می‌شود؛ مدخل بعدی changelog: **Task 26**.

---

## 14. Last Session Handoff

### What was done
1. **شروع جلسهٔ جدید `arena/01a0817f-yasnafit` از `main` = `607587f` (merge PR #5).** طبق قانون اول فقط `mahdi hellp.md` خوانده شد، سپس `git status` (تمیز) و `git log --oneline -1` (`607587f`).
2. **قضاوت محتوا-محور (نه هش‌محور):** `grep -c originalProgramId src/ai-service.js` = **۶** ⇒ کد Task 24 واقعاً روی `main`. هر سه کامیت docs فقط-local جلسهٔ قبل (`a8132ae`/`57ea75c`/`5c61866`) با `git cat-file -t` ⇒ *not a valid object name* ⇒ سندباکس نو است و آن‌ها از دست رفته‌اند؛ کامیت **push‌شدهٔ** `8abd85c` روی origin بود و cherry-pick شد ⇒ `583af1b` (بدون force-push، بدون بازنویسی تاریخچه).
3. **پرسش از مالک (تسک اصلی جلسه) با چهار سؤال اولویت‌دار** و دریافت پاسخ: تست چشمی Task 24 ✅ • عکس `/api/exercise-image/4` = عکس واقعی ✅ • پاک‌کردن دستی کارت‌های تکراری قدیمی + تأیید چشمی شمارش ✅ • Task 25 = اصلاح `PROJECT-CONTEXT.md`.
4. **راستی‌آزمایی زندهٔ production از بیرون:** `GET /api/health` در `2026-09-08T14:54:25Z` → `uptime:418274` ⇒ استارت ≈ `2026-09-03T18:43:11Z` = auto-deploy بعد از merge PR #5، ۴٫۸۴ روز بدون ری‌استارت ⇒ کد Task 24 زنده است.
5. **بستن Task 24 و KI-015** در همین فایل و `KNOWN-ISSUES.md` + ثبت فکت‌های production از لاگ مالک (پورت 8080/`0.0.0.0`، ۳۰ مایگریشن، شناسه‌های Railway) + افزودن `KI-016` برای اختلاف ۲۷۲۴ ↔ ۲٬۷۰۷ (فقط مشاهدهٔ `UNKNOWN`؛ بدون ساخت/حذف داده).
6. **Task 25:** راستی‌آزمایی تک‌تک فکت‌های احراز هویت از کد (روت‌ها، ۴۰۴ بودن `/coach-access/*`، صفر بودن `YASNAFIT_COACH_TOKEN`، TTLها، قفل‌ها، کوکی‌ها، TOTP، هدرها، لیست کامل env با اسکن `process.env`) سپس بازنویسی §3/§6/§11 آن سند + اصلاح شمارنده‌های کهنه + حذف نام شاخهٔ کهنه (دام BR-13).
7. **به‌روزرسانی کامل همین فایل:** §4/§5/§6/§9/§10/§11/§12/§13/§14/§15/§16/§17.
8. **Task 26 (بانک حرکات):** سه درخواست مالک پیاده شد — خوانا/لمسی‌کردن پنل «افزودن حرکت دستی» و دکمهٔ «ثبت حرکت» (به‌ویژه موبایل)، افزودن نوار «ست‌های حرکت» **زیر** همان پنل با **اعمال خودکار** روی هر حرکت تازه (هلپر `setsForNewMovement()` در هر دو مسیر افزودن)، و حذف کامل «عضله هدف درگیر» از پنل دستی و فرم ویرایش حرکت (+ CSS مرده) با حفظ دادهٔ `target_muscles` و نمایش PDF/شاگرد. گارد `tests/movement-dialog-regression.js` هم‌زمان بازنویسی شد و `tool/smoke-program-builder.js` پنج چک عملکردی گرفت.
9. **درخواست «غیرفعال‌کردن گوگل‌اتنتیکاتور»:** بررسی کامل انجام شد ( footprint: `src/coach-auth-service.js`، `src/totp.js`، روت‌های `/api/coach/auth/*`، صفحهٔ `/coach/2fa`، `YASNAFIT_ALLOW_2FA_SKIP` در `src/request-security.js` و ۴۰+ ادعای تست) و **چهار گزینهٔ اجرایی** به مالک داده شد؛ چون انتخابی صورت نگرفت، **هیچ تغییری در کد/کانفیگ احراز هویت انجام نشد** (کاهش امنیت روی دامنهٔ عمومی بدون تصمیم صریح مالک مجاز نیست).

### What changed
**Task 26 (کد/UI):** `public/program-builder.js` (−۴٫۷KB)، `public/program-builder.css`، `tests/movement-dialog-regression.js` (بخش ۵ معکوس + بخش‌های ۶/۷)، `tool/smoke-program-builder.js` (۵ چک عملکردی جدید).
**Task 25 و بستن‌ها (فقط مستندات):** `docs/project-tracking/PROJECT-CONTEXT.md` (۲۱ جایگزینی: ۴ بخش احراز هویت + ۱۷ شمارنده/شاخه)، `docs/project-tracking/KNOWN-ISSUES.md` (KI-015 بسته + KI-016 جدید)، `docs/project-tracking/CHANGELOG.md` (دو مدخل ۱۴۰۵/۰۶/۱۷)، `mahdi hellp.md`. **هیچ فایل کد/تست/مایگریشن/`package.json` تغییر نکرد** و `version` = 0.9.1 دست‌نخورده است.

### What was tested
* `npm test` **قبل از** ویرایش‌ها = exit 0 (۱۸/۱۸) ✅ و `npm test` **بعد از همهٔ ویرایش‌های Task 25 و Task 26** = exit 0 (**۱۸/۱۸**) ✅ — اجرا شده، نه ادعا.
* **تست عملکردی واقعی (Task 26):** `tool/smoke-program-builder.js` (اجرای واقعی `program-builder.js` با استاب DOM + fetch mock) ⇒ PASS با پنج چک جدید: دیده‌شدن نوار ست هنگام افزودن • اعمال خودکار preset «۴ * ۱۰» ⇒ **دقیقاً ۴ ست با مقدار ۱۰** • فرم حرکت بدون «عضله هدف» ولی با «آموزش حرکت» • مخفی‌شدن نوار پس از بستن بانک • حفظ رفتار قبلی بدون preset (**۱ ست × ۱۲**). `smoke-jalali-picker.js` و `smoke-jalali.js` هم exit 0.
* **جهش‌سنجی (Task 26): هر ۴ جهش گرفته شد** — بازگرداندن `mv-anatomy` ⇒ exit 1 • `.quickadd-submit` با `min-height:32px` ⇒ exit 1 • hardcoded کردن ست در یکی از دو مسیر افزودن ⇒ exit 1 • نادیده‌گرفتن انتخابگر در `setsForNewMovement` ⇒ شکست چک عملکردی. بعد از هر جهش فایل‌ها با diff بازراستی‌آزمایی و بازگردانده شدند.
* نکتهٔ واقعی از دیباگ: شمارش `value="10"` در HTML مودال گمراه‌کننده است چون خودِ `mvPresetSelect` پانزده `<option value="0..14">` دارد ⇒ چک‌ها به `data-mv-count="N" value="10"` محدود شدند.
* راستی‌آزمایی متنی: `grep` برای `coach-access-token`/`YASNAFIT_COACH_TOKEN`/`coach-access/{token}` در `PROJECT-CONTEXT.md` ⇒ تنها داخل جمله‌های «حذف شده/۴۰۴» باقی مانده، هیچ ادعای فعال بودن نیست ✅ • `grep` برای شمارنده‌های کهنه (`~1937`, `۲۲ مایگریشن`, `۹ سوئیت`, `arena/01a02ff4`) ⇒ صفر ✅ (تنها `0.9.0` در تگ تاریخی BR-1 ماند که درست است).
* همهٔ ویرایش‌ها با anchor یکتا + `assert` (اگر anchor پیدا نمی‌شد، اسکریپت بدون نوشتن exit 1 می‌داد) ✅.
* تاریخ شمسی مدخل‌ها با `Intl` (ca-persian) راستی‌آزمایی شد: 2026-09-03 = ۱۴۰۵/۰۶/۱۲ (مطابق مدخل‌های موجود) و 2026-09-08 = **۱۴۰۵/۰۶/۱۷** ✅.
* fetch زندهٔ `/api/health` ✅. **تصویر تست نشد** (fetch ابزار Agent روی پاسخ تصویری خطای گمراه‌کننده می‌دهد) ⇒ تشخیص فقط با مرورگر مالک، که گرفته شد.

### What passed
همهٔ موارد بالا؛ working tree تمیز؛ کامیت‌ها روی شاخهٔ جلسهٔ `arena/01a0817f-yasnafit` + push به همان شاخه.

### What failed
* **سه کامیت docs فقط-local جلسهٔ `arena/01a06884-yasnafit` برای همیشه از دست رفتند** (سندباکس بازسازی شد و objectهایشان وجود نداشت) ⇒ محتوایشان از گزارش مالک بازسازی شد. **درس ثبت‌شده در §5: بلافاصله بعد از هر کامیت push کنید — کامیتِ local هم می‌سوزد.**
* (تجربهٔ تکرارشده: ابزار `edit_file` فازی گاهی بلاک‌های مشابه را اشتباه می‌گیرد ⇒ این جلسه ویرایش‌های انبوه با اسکریپت `assert`-دار انجام شد تا هیچ جایگزینی بی‌صدا جا نیفتد.)

### What remains
1. **مالک:** merge **PR #6** (Task 25 مستندات **+ Task 26 UI بانک حرکات**) ⇒ این بار چون `public/**` تغییر کرده، **auto-deploy منتشر می‌کند و ریست uptime ملاک است**.
1b. **مالک (تصمیم باز):** روش «غیرفعال‌کردن گوگل‌اتنتیکاتور» را از چهار گزینهٔ §۱۴ بند ۹ انتخاب کنید — پیشنهاد Agent: **فقط متغیر محیطی `YASNAFIT_ALLOW_2FA_SKIP=1`** (بدون تغییر کد، از قبل کامل سیم‌کشی و مستند در `DEPLOYMENT.md` §۹.۹، فوری و قابل بازگشت) یا اگر هدف «کارکردن کدها» است: **چرخش/خواندن کلید از Volume** (§۹.۸) تا 2FA سالم بماند.
2. **مالک (تست چشمی Task 26 بعد از deploy):** در بانک حرکات روی موبایل ⇒ درشت/راحت دیده‌شدن «＋ افزودن حرکت دستی» و دکمهٔ «ثبت حرکت»؛ نوار «ست‌های حرکت» زیر همان پنل؛ با انتخاب «۴ * ۱۰» حرکت اضافه‌شده از بانک باید همان ۴ ست را داشته باشد (بدون انتخاب مجدد در کارت)؛ در فرم ویرایش حرکت بخش «عضله هدف» نباشد ولی «آموزش حرکت» باشد. سپس پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` (و `YASNAFIT_ALLOW_REMOTE_SETUP` اگر هنوز هست) **فقط اگر** تصمیم بند ۱b «حفظ 2FA» باشد.
3. **مهدی در ویندوز:** بلوک bat §17 با شاخهٔ `arena/01a0817f-yasnafit` ⇒ چون `public/*` تغییر کرده، **رفرش `Ctrl+Shift+R` لازم است** (ری‌استارت سرور لازم نیست؛ کش JS بیست‌وچهار ساعته است).
4. **اختیاری، فقط با تأیید مالک:** cache-busting نسخه‌دار اسکریپت‌ها به‌خاطر کش ۲۴ ساعتهٔ JS (`max-age=86400`) بعد از هر deploy.
5. **اختیاری، فقط با تأیید مالک و کاملاً خواندنی:** `KI-016` (۲۷۲۴ ↔ ۲٬۷۰۷) — بدون نوشتار روی DB.
6. **تسک بعدی (Task 26):** از مالک/`TODO.md` گرفته شود؛ P0 بازی وجود ندارد.

### Exact next step for the next Agent
1. فقط `mahdi hellp.md` را بخوان؛ بعد `git status --short` و `git log --oneline -1` (انتظار: تمیز + کامیت‌های Task 25 روی `arena/01a0817f-yasnafit`؛ مبنا `main` = `607587f`). اگر سندباکس بازسازی شده بود: §5 (بازیابی) + قضاوت با محتوا نه هش.
2. وضعیت **PR #6** را بگیر (`gh pr view 6`)؛ اگر merged شد: فقط مستندات بوده ⇒ **ریست uptime انتظار نمی‌رود**؛ در §۵/§۱۶ ثبت کن و `main` جدید را در §۴/§۱۶ بنویس.
3. تسک بعدی را از مالک بپرس (اولویت‌های باز در §۱۲ + تصمیم باز «گوگل‌اتنتیکاتور»)؛ مدخل بعدی changelog: **Task 27**.
4. پایان هر تسک: به‌روزرسانی همین فایل (§5/§10/§11/§12/§13/§14/§15/§16/§17) + commit + **push فوری** + گزارش فارسی با هدر SUCCESS/PARTIAL/FAILED و بلوک `bat` §17 با نام شاخهٔ همان جلسه.

---

## 15. Files Changed Recently

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
| Local (لوکال مهدی) | **BEHIND** | با بلوک bat §17 (شاخهٔ `arena/01a0817f-yasnafit`) هم‌زمان می‌شود؛ چون `public/*` (Task 26) تغییر کرده **`Ctrl+Shift+R` لازم است** (ری‌استارت سرور نه)؛ DB لوکال دست‌نخورده می‌ماند |
| Local (سندباکس Agent) | **CURRENT** | شاخهٔ `arena/01a0817f-yasnafit` = `583af1b` (بازیابی docs) + کامیت Task 25/بستن KI-015 + کامیت **Task 26** (UI بانک حرکات)؛ مبنا `main` = `607587f` |
| Git / GitHub origin | **CURRENT** | `main` = `607587f` (**merge PR #5 = Task 24**)؛ شاخهٔ جلسهٔ `arena/01a0817f-yasnafit` push شده (tip `ca53577`) و کامیت docs بازماندهٔ جلسهٔ قبل را هم با خودش برد ⇒ دیگر کامیت فقط-local نداریم؛ **PR #6** (Task 25) باز — merge فقط با تأیید مالک |
| `main` | **`607587f` — Task 24 روی main** | بلافاصله بعد از هر merge، build باید موفق شود (`railway.json` و lockfile از PR #2 روی main هستند) |
| Railway | **LIVE (0.9.1) — کد Task 24 اجرا می‌شود؛ Task 26 بعد از merge PR #6 منتشر می‌شود (ریست uptime ملاک است). راستی‌آزمایی مجدد ۲۰۲۶-۰۹-۰۸** | **Auto-deploy روشن** (Branch = `main`)؛ استارت پروسه ≈ `2026-09-03T18:43:11Z` (از `uptime:418274` در `2026-09-08T14:54:25Z`) = auto-deploy بعد از merge PR #5 ⇒ ۴٫۸۴ روز بدون ری‌استارت. ۱۸۸۸ عکس روی Volume در `/app/data/media/images/exercises/imported`؛ **لاگ `[Media] Volume: 1888 \| ریپو: 0` و تست چشمی عکس از مالک گرفته شد ⇒ KI-015 بسته**. پورت داخلی 8080 با `0.0.0.0`؛ ۳۰ مایگریشن applied. merge تسک 25 (فقط `.md`) ریست uptime نمی‌دهد و انتظار هم نمی‌رود |

**تا این لحظه هیچ workflow خودکار (GitHub Actions) در مخزن نیست؛ deploy با Railway از طریق اتصال repo انجام می‌شود (auto-deploy روی push به شاخهٔ متصل، محدود به `watchPatterns`).**

---

## 17. دستورات اجرای پروژه (پایان هر گزارش — قاعدهٔ ثابت)

نام شاخه در بلوک زیر باید با **شاخهٔ جلسهٔ جاری** جایگزین شود (فعلاً `arena/01a0817f-yasnafit`)؛ ساختار بلوک تغییر نکند:

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a0817f-yasnafit
git pull --ff-only origin arena/01a0817f-yasnafit
.\YASNAFIT-LAUNCHER.bat
```
