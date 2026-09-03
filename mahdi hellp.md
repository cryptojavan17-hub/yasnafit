# MAHDI HELLP — YASNAFIT PERSISTENT AGENT MEMORY

> **این فایل حافظهٔ دائمی پروژه است.** اولین کاری که هر Agent/Arena جدید باید بکند: فقط همین فایل را بخواند، سپس سراغ فایل‌های مرتبط با تسک جاری برود. **کل مخزن یا همهٔ مستندات را ناخوانده باز نکنید.**
> آخرین به‌روزرسانی: **2026-09-03** (توسط Agent جلسهٔ `arena/01a066e6-yasnafit` — پس از Task 22: پشتیبانی Volume برای عکس‌های حرکات).
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
* **شاخهٔ کاری جلسه:** `arena/01a066e6-yasnafit` (از `main` = `50aaa53` ساخته شده) — همهٔ کارها فقط روی همین شاخه، push فقط به همین شاخه. شاخهٔ قبلی `arena/01a0618b-yasnafit` آرشیو است؛ دو کامیت docs پایانی‌اش روی این شاخه cherry-pick شده‌اند.
* **مستندات ریشه (حذفشان ممنوع):** `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `CHANGELOG.md` (محصولی/نسخه‌ها), `EXERCISE_MANAGEMENT.md`, **`DEPLOYMENT.md` (جدید)**.
* **مستندات پیگیری:** `docs/project-tracking/` → `PROJECT-CONTEXT.md` (کسب‌وکار + قواعد)، `CHANGELOG.md` (توسعه/تسک‌ها — Task 1…17)، `KNOWN-ISSUES.md` (KI-001…KI-013)، `TODO.md` (T-01…T-16)، `TECHNICAL-DECISIONS.md` (TD-*)، `archive/`.

---

## 5. Git / Arena State

| مورد | وضعیت تأییدشده |
|---|---|
| شاخهٔ جاری | `arena/01a066e6-yasnafit` |
| آخرین کامیت | `e60d3eb` = **Task 22** (feat: سرو عکس‌های حرکات از Volume) روی `ef1be5a` (docs memory) روی `cc6cd25`/`b405fa6` (cherry-pick docs جلسهٔ قبل) روی `50aaa53` (merge PR #2) |
| کامیت قبلی | `695f4b1` (revert ویجت سشن‌های معاملاتی) • `ff635be` (همان ویجت، لغوشده) • `f66070f` (Task 15) |
| working tree | **تمیز** (`git status --short` خالی) |
| local vs origin | **برابر** — `arena/01a066e6-yasnafit` به origin push شده و `git ls-remote` با HEAD یکی است؛ `git status` تمیز |
| PR | **#2 MERGED** (2026-09-02 19:40 UTC، `gh pr merge 2 --merge` با تأیید صریح مهدی) • #1 CLOSED • شاخهٔ `arena/01a0618b-yasnafit` آرشیو شد (tip = `8f181b4`) و دو کامیت docs آن به شاخهٔ جدید منتقل شد |
| وضعیت merge | merge انجام‌شده و **برابربودن محتوا تأیید شد**: `git diff origin/main HEAD` خالی ⇒ چیزی حین merge گم نشده. برای کارهای بعدی همین شاخهٔ جلسه استفاده شود |
| اقدامات باز | (۱) مهدی در ویندوز: بلوک bat §17 — فقط `git pull --ff-only` (۲) **merge PR مربوط به Task 22 با تأیید مالک**، سپس redeploy روی Railway و چک §۹.۱۰ (`railway logs \| grep Media` → `Volume: 1888` و `curl /api/exercise-image/4` → ۲۰۰ تصویر) (۳) Volume وصل است — **mount path را عوض نکنید** (۴) پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` (و `YASNAFIT_REVEAL_AUTHENTICATOR_KEY` اگر استفاده شد) بعد از تست |
| هشدار Arena (تجربهٔ واقعی) | سندباکس ممکن است بین جلسات بازسازی شود و HEAD را به کامیتی قدیمی برگرداند. در آن صورت فقط در سندباکس: `git fetch -q origin arena/01a066e6-yasnafit` + `git update-ref refs/heads/arena/01a066e6-yasnafit FETCH_HEAD` + `git reset --hard FETCH_HEAD` (بدون تغییر شاخه، بدون force-push). **روی ماشین لوکال مهدی این کار را نکنید** — آنجا `git pull --ff-only`. |

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

* **عنوان (جلسهٔ جاری، ۲۰۲۶-۰۹-۰۳ — `arena/01a066e6-yasnafit`):** **Task 22 — پشتیبانی Volume برای عکس‌های حرکات روی Railway** (درخواست مستقیم مالک؛ فقط عکس‌ها، نه ویدیو) + هم‌زمان‌سازی شروع جلسه.
* **عنوان تسک قبلی:** Task 20 (بازیابی کلید Google Authenticator روی سرور ابری) + Task 21 (گریز موقت 2FA با `YASNAFIT_ALLOW_2FA_SKIP`) + انتشار: merge PR #2 به `main` — همه انجام‌شده.
* **هدف:** آماده‌سازی واقعی (قابل تست) برای هاست اینترنتی؛ حذف کد/فایل بلااستفاده؛ اطمینان از سالم بودن flow ورود مربی.
* **فایل‌های مرتبط:** `src/storage-paths.js`, `server.js` (هندلر `/api/exercise-image/{id}` و هندلر استاتیک `/assets/images/exercises/*` + `/files/exercise/*` و لاگ boot)، `tests/deployment-hardening-regression.js`, `DEPLOYMENT.md` (§۹.۱۰), `docs/project-tracking/KNOWN-ISSUES.md` (KI-015), `docs/project-tracking/CHANGELOG.md` (Task 22).
* **نتیجهٔ مورد انتظار:** `npm test` سبز + هدرها/گیت‌ها زنده + مستند استقرار.
* **وضعیت نهایی:** کد + تست + مستندات **انجام و push شد** (`e60d3eb` + docs حافظه)؛ **PR به `main` باز است و merge با تأیید مالک انجام می‌شود**؛ بعد از merge: redeploy و چک §۹.۱۰ (`[Media]` → `Volume: 1888`). نتیجه در §14.

---

## 14. Last Session Handoff

### What was done
1. **هم‌زمان‌سازی شروع جلسه (`ef1be5a`):** شاخهٔ `arena/01a066e6-yasnafit` از `main` = `50aaa53` (merge PR #2)؛ دو کامیت docs پایانی جلسهٔ قبل cherry-pick شد (`b405fa6`, `cc6cd25`) ⇒ درخت = tip شاخهٔ قبلی؛ حافظه با واقعیت جدید به‌روز شد؛ Railway از بیرون دوباره تأیید شد (`0.9.1` زنده).
2. **Task 22 — پشتیبانی Volume برای عکس‌های حرکات (`e60d3eb`):** درخواست دقیق مالک (فقط عکس‌ها). `mediaDir` (= `YASNAFIT_MEDIA_DIR` || `<dataDir>/media`)، `exerciseImagesDir` (= `<mediaDir>/images/exercises/imported`) و `ensureMediaDirs()` (۰۷۰۰) به `src/storage-paths.js` اضافه شد و در boot صدا زده می‌شود. در `server.js`: هندلر `/api/exercise-image/{id}` بعد از ریپو، Volume را هم می‌خواند (پروب مستقیم O(1) برای `{id}.png|jpg|jpeg|gif|webp` + جست‌وجوی بر اساس `original_id`؛ ترتیب: ریپو → Volume → organized → public؛ گارد مرکزی `allowedImageRoot`)؛ مسیرهای استاتیک `/assets/images/exercises/*` و `/files/exercise/*` دو پروب Volume گرفتند — **فقط برای پسوندهای تصویری**؛ مسیر ویدیو دست‌نخورده (۴۰۴ دقیق). لاگ boot: `[Media] تصاویر حرکات: N فایل (Volume: X | ریپو: Y) · ریشه: …` + هشدار وقتی صفر است.
3. **مستندات:** `DEPLOYMENT.md` §۹.۱۰ (محل، انتقال، راستی‌آزمایی)؛ مدخل Task 22 در `docs/project-tracking/CHANGELOG.md`؛ **KI-015** در `KNOWN-ISSUES.md` (FIXED)؛ به‌روزرسانی همین فایل.
4. **تخطئهٔ شعبه:** درخواست مالک «شاخهٔ جدید arena/media-volume-support» بود؛ جلسه به شاخهٔ ثابت `arena/01a066e6-yasnafit` گره خورده، پس کار روی همان انجام و به مالک توضیح داده شد — PR به `main`.

### What changed
`src/storage-paths.js`، `server.js`، `tests/deployment-hardening-regression.js` (۸ گارد جدید)، `DEPLOYMENT.md`، `docs/project-tracking/CHANGELOG.md`، `docs/project-tracking/KNOWN-ISSUES.md`، `mahdi hellp.md`.

### What was tested
`node --check` هر ۳ فایل کد ✅ • `npm test` = **۱۸/۱۸ ✅** (بعد از همهٔ تغییرات کد و مستندات) • **جهش‌سنجی گارد جدید:** حذف ارجاع Volume در `server.js` ⇒ MUTANT_EXIT=1؛ بازگردانی ⇒ 0 ✅ • **تست زنده با Volume ساختگی** (`RAILWAY_VOLUME_MOUNT_PATH=/tmp/yasna-media` + `4.png` و `2707.jpg`): لاگ `[Media] تصاویر حرکات: 2 فایل (Volume: 2 | ریپو: 0)` ✅ • `GET /api/exercise-image/4` → ۲۰۰ `image/png` (از Volume) ✅ • `/api/exercise-image/2707` → ۲۰۰ `image/jpeg` ✅ • id ناموجود → ۲۰۰ blank svg ✅ • `GET /assets/images/exercises/imported/4.png` → ۲۰۰ `image/png` (Volume) ✅ • `GET /files/exercise/videos/4.mp4` → ۴۰۴ ✅ • seed ۲۷۰۷ حرکت روی همان Volume ✅ • رفتار لوکال بدون env دست‌نخورده (ریپو اول) ✅

### What passed
همهٔ موارد بالا.

### What failed
هیچ تستی شکست نخورد. یک خطای گذرای ابزار هنگام یکی از ویرایش‌ها رخ داد که با retry برطرف شد. (یادآوری: سندباکس curl به اینترنت ندارد؛ بررسی‌های زندهٔ Railway با ابزار fetch انجام می‌شود.)

### What remains
1. **مالک:** merge PR مربوط به Task 22 → redeploy روی Railway → چک §۹.۱۰: `railway logs | grep Media` باید `Volume: 1888` نشان دهد و `curl https://yasnafit-production.up.railway.app/api/exercise-image/4` باید ۲۰۰ با `image/png|jpeg` برگرداند (نه `image/svg+xml`). اگر `Volume: 0` دیدید: mount path با محل آپلود ناسازگار است.
2. مهدی در ویندوز: بلوک bat §17 (pull) + ری‌استارت لانچر + `Ctrl+Shift+R`.
3. پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` (و `YASNAFIT_REVEAL_AUTHENTICATOR_KEY` اگر استفاده شده) پس از تست.
4. §۱۱: اصلاح مستندات `PROJECT-CONTEXT.md` (احراز هویت قدیمی را «فعلی» می‌داند) هنوز OPEN است.

### Exact next step for the next Agent
1. همین فایل را بخوان؛ بعد `git status --short` و `git log --oneline -1` (انتظار: تمیز + docs(memory) ثبت Task 22 روی `e60d3eb`).
2. اگر مالک گفت redeploy انجام شد: با fetch محتوایی `https://yasnafit-production.up.railway.app/api/exercise-image/4` را چک کن — انتظار `Content-Type: image/png|jpeg`؛ نتیجه را در §۶ و KI-015 و §۱۶ ثبت کن. اگر هنوز `image/svg+xml` بود، یعنی کد جدید deploy نشده یا عکس در مسیر Volume نیست.
3. تسک بعدی را از مالک/TODO بگیر؛ مدخل بعدی changelog: **Task 23**. پایان هر تسک: به‌روزرسانی همین فایل + commit + گزارش فارسی با بلوک `bat` §17.

---

## 15. Files Changed Recently

| مسیر | دلیل | وضعیت |
|---|---|---|
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
| Local (لوکال مهدی) | **BEHIND** | با بلوک bat §17 (شاخهٔ `arena/01a066e6-yasnafit`) هم‌زمان می‌شود (DB لوکال او دست‌نخورده می‌ماند) |
| Local (سندباکس Agent) | **CURRENT** | شاخهٔ `arena/01a066e6-yasnafit` = `e60d3eb` (Task 22) + docs(memory) این ثبت؛ روی `main` = `50aaa53` |
| Git / GitHub origin | **CURRENT** | `main` = `50aaa53` (اپ کامل — PR #2 merged)؛ `arena/01a066e6-yasnafit` push است؛ **PR #3 (Task 22 → main) باز — merge با تأیید مالک** |
| `main` | **`50aaa53` — اپ کامل روی main** | `package.json`/`server.js`/`railway.json`/`package-lock.json` روی `main` هستند ⇒ build روی `main` موفق است (KI-014 = FIXED) |
| Railway | **LIVE (0.9.1) — Volume تأیید شد** | گزارش مالک ۲۰۲۶-۰۹-۰۳: ۱۸۸۸ عکس حرکت در `/app/data/media/images/exercises/imported` روی Volume است؛ کد فعلیِ deploy عکس‌ها را نمی‌خواند تا وقتی PR #3 merge + redeploy شود؛ بعدش چک §۹.۱۰ |

**تا این لحظه هیچ workflow خودکار (GitHub Actions) در مخزن نیست؛ deploy با Railway از طریق اتصال repo انجام می‌شود (auto-deploy روی push به شاخهٔ متصل، محدود به `watchPatterns`).**

---

## 17. دستورات اجرای پروژه (پایان هر گزارش — قاعدهٔ ثابت)

نام شاخه در بلوک زیر باید با **شاخهٔ جلسهٔ جاری** جایگزین شود (فعلاً `arena/01a066e6-yasnafit`)؛ ساختار بلوک تغییر نکند:

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a066e6-yasnafit
git pull --ff-only origin arena/01a066e6-yasnafit
.\YASNAFIT-LAUNCHER.bat
```
