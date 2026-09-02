# MAHDI HELLP — YASNAFIT PERSISTENT AGENT MEMORY

> **این فایل حافظهٔ دائمی پروژه است.** اولین کاری که هر Agent/Arena جدید باید بکند: فقط همین فایل را بخواند، سپس سراغ فایل‌های مرتبط با تسک جاری برود. **کل مخزن یا همهٔ مستندات را ناخوانده باز نکنید.**
> آخرین به‌روزرسانی: **2026-09-02** (توسط Agent جلسهٔ `arena/01a0618b-yasnafit` — پس از Task 16 و Task 17).
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
* **File storage:** آپلود عکس بدن/مدارک خصوصی با `src/upload-service.js` (سقف ۵MB هر فایل، ۱۰ فایل هر ارزیابی، ۲۰MB multipart، allowlist MIME+پسوندم + بررسی امضای بایت + `sanitizeFileName`)؛ فایل‌های خصوصی **هرگز از `public/` سرو نمی‌شوند** و فقط با نشست متناظر خوانده می‌شوند. عکس/ویدیوی حرکات: `public/assets/images/exercises/imported/` (gitignored، ~۱۸۸۸ فایل فقط لوکال) و `/files/exercise/*`.
* **Security layer (جدید، §Task 16):** `src/request-security.js` — CSP یکنواخت + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer` + `Permissions-Policy` + `Cross-Origin-Opener/Resource-Policy` که روی **همهٔ پاسخ‌ها** اعمال می‌شود؛ تنها جای خواندن `X-Forwarded-*` در کل مخزن همین فایل است و فقط با `YASNAFIT_TRUST_PROXY=1`.
* **Railway deployment:** **در این مخزن هیچ پیکربندی Railway وجود ندارد** — نه `railway.json/JSONC`، نه `Dockerfile`، نه `Procfile`، نه `.github/workflows`. مسیر رسمی استقرارِ مستندشده **VPS + nginx + systemd** است (`DEPLOYMENT.md`). وضعیت Railway واقعی: `UNKNOWN — needs verification`.
* **Android/mobile:** هیچ کد موبایل در مخزن نیست (فقط فلوی موبایل-پسند UI شاگرد). TODO: T-08.
* **Synchronization:** لایهٔ سینک **وجود ندارد**؛ زیرساخت آماده است (`stable_id`, `version`, soft-delete). TODO: T-07.

---

## 4. Repository

* **GitHub:** `https://github.com/cryptojavan17-hub/yasnafit`
* **مسیر لوکال (مهدی):** `C:\Users\MAHDI\Desktop\yasnafit-git`
* **شاخه‌های مهم:** `main` (تایپ فعلی `086f3e0` — «Add files via upload … Add exact login hero image - do not change face»، یعنی فقط README + تصویر هیرو؛ **روی `main` مستقیم کار نکنید**)، `arena/01a0618b-yasnafit` (جلسهٔ جاری، `9be37bb`)، و ۸ شاخهٔ آرشیوی `arena/01a0…` روی origin.
* **شاخهٔ کاری جلسه:** `arena/01a0618b-yasnafit` — همهٔ کارها فقط روی همین شاخه، push فقط به همین شاخه.
* **مستندات ریشه (حذفشان ممنوع):** `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `CHANGELOG.md` (محصولی/نسخه‌ها), `EXERCISE_MANAGEMENT.md`, **`DEPLOYMENT.md` (جدید)**.
* **مستندات پیگیری:** `docs/project-tracking/` → `PROJECT-CONTEXT.md` (کسب‌وکار + قواعد)، `CHANGELOG.md` (توسعه/تسک‌ها — Task 1…17)، `KNOWN-ISSUES.md` (KI-001…KI-013)، `TODO.md` (T-01…T-16)، `TECHNICAL-DECISIONS.md` (TD-*)، `archive/`.

---

## 5. Git / Arena State

| مورد | وضعیت تأییدشده |
|---|---|
| شاخهٔ جاری | `arena/01a0618b-yasnafit` |
| آخرین کامیت | `9be37bb` — “security(server): complete hardening pass and dead-file cleanup for deployment” |
| کامیت قبلی | `695f4b1` (revert ویجت سشن‌های معاملاتی) • `ff635be` (همان ویجت، لغوشده) • `f66070f` (Task 15) |
| working tree | **تمیز** (`git status --short` خالی) |
| local vs origin | **برابر** — `git ls-remote` و `git rev-parse HEAD` هر دو `9be37bb` |
| PR | **#2 OPEN** (head: همین شاخه، title: “student password management inside the edit dialog (+ build stamp)”, `mergeable: UNKNOWN`) • PR **#1 CLOSED** |
| وضعیت merge | تاکنون هیچ merge ای توسط Agent انجام نشده؛ تصمیم merge با مالک است |
| اقدامات باز | (۱) مهدی باید در ویندوز `git pull --ff-only` بزند (کپی لوکال **پشت سر** `9be37bb` است) (۲) در صورت تأیید مالک: merge PR #2 به `main` |
| هشدار Arena (تجربهٔ واقعی) | سندباکس ممکن است بین جلسات بازسازی شود و `main` را checkout کرده باشد. اگر `git log -1` شد `086f3e0`: `git fetch -q origin arena/01a0618b-yasnafit` + `git update-ref refs/heads/arena/01a0618b-yasnafit FETCH_HEAD` + `git reset --hard FETCH_HEAD` (بدون تغییر شاخه، بدون force-push). **روی ماشین لوکال مهدی این کار را نکنید** — آنجا `git pull --ff-only`. |

---

## 6. Railway Deployment

* **Railway project/service:** `UNKNOWN — needs verification` (هیچ اثری از آن در مخزن نیست)
* **مخزن متصل / شاخهٔ دیپلوی / URL عمومی / build & start command / تنظیم PORT / وضعیت volume / وضعیت persist SQLite / آخرین دیپلوی:** همه `UNKNOWN — needs verification`
* **متغیرهای محیطی (فقط نام — مقدار هرگز اینجا نمی‌آید):** `PORT`, `NODE_ENV`, `HOST`, `YASNAFIT_HOST`, `YASNAFIT_TRUST_PROXY`, `YASNAFIT_COOKIE_SECURE`, `YASNAFIT_ALLOW_REMOTE_SETUP`, `YASNAFIT_COACH_PASSWORD`, `YASNAFIT_SMTP_HOST`, `YASNAFIT_SMTP_PORT`, `YASNAFIT_SMTP_USER`, `YASNAFIT_SMTP_PASS`, `YASNAFIT_SMTP_FROM`, `YASNAFIT_BASE_URL` (فقط در `tests/e2e-workflow.js` برای آدرس سرور تست)
* **نکتهٔ حیاتی اگر روزی روی Railway برود:** برنامه **stateful** است (فایل SQLite + آپلودها + بکاپ روی دیسک). بدون **persistent volume** روی مسیر `data/` و `backups/`، داده با هر deploy/فشارخاکستر از بین می‌رود. ریسک دوم: `node:sqlite` به Node ≥ 22.5 نیاز دارد (image پیش‌فرض Railway باید ارتقا یابد). سوم: `node_modules` لازم نیست (صفر وابستگی) — build command می‌تواند خالی/`echo` باشد و start `node server.js`.
* **قاعده:** تا وقتی کامیت دیپلوی‌شده روی Railway با `git rev-parse` مقایسه و از لاگ سرویس راستی‌آزمایی نشده، **هیچ‌وقت اعلام نکنید Local و Railway هم‌زمان‌اند.**

---

## 7. Local Environment

* **مسیر:** `C:\Users\MAHDI\Desktop\yasnafit-git`
* **اجرا:** دابل‌کلیک `YASNAFIT-LAUNCHER.bat` (یا `npm start` / `node server.js`) — منو: `1. Start Server & Open Dashboard` • `2. Restart Server` • `3. Stop Server` • `4. View Live Server Logs & Diagnostics` • `5. Exit`
* **URL/پورت:** `http://localhost:3020` (پورت با `PORT` عوض می‌شود)
* **دیتابیس لوکال:** `data\yasnafit.db` (+ `-wal`/`-shm`) — gitignored
* **تصویر هیروی صفحهٔ ورود:** `public\login-hero.png` (نسخهٔ **مورد استفاده**، ارجاع در `public/student-app.js` و `public/luxury-login.css`)؛ جایگزین شخصی: `public\image\logo.png` (gitignore). چهرهٔ تصویر هیرو را عوض نکنید (تأکید مالک در کامیت `086f3e0`).
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
1. هرگز مستقیم روی `main` کار نکن؛ فقط شاخهٔ Arena جلسه (`arena/01a0618b-yasnafit`). push فقط به همان شاخه.
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
16. شروع هر جلسه = خواندن `mahdi hellp.md` **اول از همه**، سپس فقط فایل‌های مرتبط با تسک؛ کل مخزن/همهٔ مستندات را ناخوانده باز نکن. پایان هر تسک معنادار = به‌روزرسانی همین فایل (§5، §10، §11، §12، §13، §14، §15، §16) و commit آن. `tests/deployment-hardening-regression.js` عمداً این فایل را از اسکن «ارجاع به فایل حذف‌شده» مستثنا کرده، چون اینجا باید نام فایل‌های حذف‌شده بیاید. مدخل بعدی `docs/project-tracking/CHANGELOG.md`: **Task 18**.

---

## 10. Current Completed Work (فقط کارهای واقعاً انجام‌شده)

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
* (جدید) **بررسی/پیکربندی دیپلوی واقعی:** وضعیت Railway در این مخزن بی‌نتیجه است؛ اگر مهدی Railway می‌خواهد: مشخص کردن project/service + persistent volume برای `data/` + Node ≥22.5 image، سپس تست لاگ. (هرگز بدون اجازه DB را ریست نکنید.)
* (جدید) **اعمال کد روی لوکال مهدی:** `9be37bb` push شده اما کپی ویندوزی هنوز قدیمی است → `git pull --ff-only` + ری‌استارت لانچر + `Ctrl+Shift+R`.

### Medium Priority
* T-14 کاتالوگ ۱۲ سیستم به DB (هنگام سینک) • T-02 پخش ویدیوی حرکات در UI • T-03 آپلود عکس حرکت از UI • T-04 پرکردن `equipment/difficulty/description/name_en` • T-05 پاکسازی داده تستی e2e • T-06 سرنوشت جداول legacy • T-07 طراحی لایهٔ سینک • T-15 افزودن `tool/smoke-*.js` به زنجیرهٔ `npm test` • T-11 مقاوم‌سازی harness تست.

### Low Priority
* T-08 اپ اندروید شاگرد • T-09 خروجی Excel/CSV • T-10 ویرایش گروهی دسته/محل حرکت • T-12 تست `program-helper.py` • T-13 rate-limiter پایدار.

---

## 13. Current Task

* **عنوان:** ممیزی نهایی امنیتی + پاک‌سازی فایل‌های مرده برای بردن برنامه روی سرور، و پاسخ به گزارش «دکمهٔ ادامه صفحهٔ اول».
* **هدف:** آماده‌سازی واقعی (قابل تست) برای هاست اینترنتی؛ حذف کد/فایل بلااستفاده؛ اطمینان از سالم بودن flow ورود مربی.
* **فایل‌های مرتبط:** `src/request-security.js`, `public/boot.js`, `server.js`, `src/database.js`, `src/coach-auth-service.js`, `src/student-session-service.js`, `public/index.html`, `public/coach-login.html`/`.js`, `DEPLOYMENT.md`, `tests/deployment-hardening-regression.js`, `tests/coach-auth-regression.js`.
* **نتیجهٔ مورد انتظار:** `npm test` سبز + هدرها/گیت‌ها زنده + مستند استقرار.
* **وضعیت نهایی:** **انجام شد و push شد** (`9be37bb`) — نتیجه در §14.

---

## 14. Last Session Handoff

### What was done
* لایهٔ امنیتی متمرکز `src/request-security.js` (CSP + ۶ هدر دیگر روی همهٔ پاسخ‌ها؛ گیت `X-Forwarded-*` پشت `YASNAFIT_TRUST_PROXY`؛ `YASNAFIT_COOKIE_SECURE`؛ `YASNAFIT_HOST`).
* حذف تنها `<script>` درون‌خطی `public/index.html` → `public/boot.js` (تا CSP بدون `unsafe-inline` ممکن بماند)؛ افزودن `frame-ancestors`/`base-uri`/`form-action` به صفحه‌های احراز هویت.
* کم کردن افشا: `/api/health` عمومی فقط `{ok,status,version,uptime}`؛ آمار پشت `?detailed=1`+سشن مربی (`public/releases.js` به همان کلید شد)؛ `/api/build` نیازمند سشن مربی؛ `POST /api/test/reset-rate-limit` در `NODE_ENV=production` → ۴۰۴؛ `*.html` ناموجود → ۴۰۴ (دیگر شل پنل به ناشناس داده نمی‌شود).
* `sendCaughtError()` جای ~۴۰ تا `sendError(res,400,error.message)`؛ مسیر backup هم پیام خام برنمی‌گرداند.
* مجوزها: `data/` و `backups/` → `0700`، فایل‌های `yasnafit.db*` → `0600`، `data/smtp.json` → `0600` + `chmod` روی فایل موجود؛ محدودسازی first-run `coach setup` به لوپ‌بک.
* حذف ۷ فایل تأییدشدهٔ مرده (۲٫۸۸MB) + به‌روزرسانی `index.html`، `tests/ui-design-regression.js`، `ARCHITECTURE.md`، `README.md` (فایل‌های زندهٔ `public/login-hero.png`، `scripts/provision-coach-totp.js`، `data-source/exercises_data.json`، `/api/programs` عمداً حفظ شدند).
* `DEPLOYMENT.md` نوشته شد (nginx+TLS، systemd، متغیرها، مجوزها، پروویژن TOTP، بکاپ، به‌روزرسانی، چک‌لیست ۱۰ بندی) و محتوای درستِ `راهنمای_اجرا.md` (منسوخ‌شده) به `README.md` منتقل شد.
* سوئیت جدید `tests/deployment-hardening-regression.js` + `test:deployment` (زنجیرهٔ `npm test` = ۱۸ سوئیت).
* تسک ۱۷: اثبات اینکه «ادامه» صفحهٔ اول (`#coachPasswordSubmit`) در این ریپو پیاده‌سازی‌شده است؛ `btnContinueAuth` در **هیچ کامیتی** این مخزن وجود نداشته (`git log --all -S` خالی).

### What changed
25 فایل (`git show --stat 9be37bb`): +`DEPLOYMENT.md`, +`public/boot.js`, +`src/request-security.js`, +`tests/deployment-hardening-regression.js`؛ تغییر `server.js`, `package.json`, `README.md`, `ARCHITECTURE.md`, `docs/project-tracking/CHANGELOG.md`, `public/index.html`, `public/releases.js`, `src/{database,coach-auth-service,student-session-service}.js`, ۵ فایل تست؛ **حذف** `login-hero.png`, `public/assets/hero-login.jpg`, `public/yasnafit-students-dashboard-mockup.png`, `public/student-portal.js`, `public/student-portal.css`, `tool/test-movement-modal-interactive.js`, `راهنمای_اجرا.md`. **`YASNAFIT-LAUNCHER.bat` دست‌نخورده.**

### What was tested
`npm test` (۱۸/۱۸) ✅ • `npm run test:e2e` ✅ • چک زنده با سرور روی 3020: هدرها روی `/`، `/coach/login`، `/boot.js`، `/api/health`، `/login-hero.png` ✓؛ `/api/build` ناشناس ۴۰۱ ✓؛ `/api/health?detailed=1` ناشناس ۴۰۱ ✓؛ `POST /api/test/reset-rate-limit` با `NODE_ENV=production` ۴۰۴ ✓؛ `/student-portal.css` و `/trading-sessions.html` ۴۰۴ ✓؛ `POST /api/coach/auth/login` رمز درست → ۲۰۰ + کوکی چلنج + `next:/coach/2fa`، رمز غلط → `INVALID_CREDENTIALS` ✓؛ `ls -ld data backups` → `drwx------` ✓.

### What passed
همهٔ موارد بالا — بدون شکست.

### What failed
* در حین کار، دو تست **عمداً به‌روزرسانی** شدند چون رفتار امنیتی جدید را مثل باگ می‌دیدند: `tests/coach-auth-regression.js` و `tests/student-session-regression.js` (تشخیص HTTPS از `x-forwarded-proto` جعلی → حالا `socket.encrypted`؛ به‌علاوه assert جدید «هدر جعلی نباید Secure بچسباند»).
* یک **false-positive از پیش موجود** در `tests/e2e-workflow.js` (تشخیص «ورژن هاردکد‌شده» که دادهٔ مسیر SVG داخل `public/student-app.js` را نسخه می‌خواند) رفع شد: الگو حالا فقط شمارهٔ نسخهٔ داخل نقل‌قول را می‌گیرد.
* در اجرای اول e2e روی سندباکسِ DB‌تازه، assert قدیمی `POST /api/coach/auth/setup → 404` شکست (چون DB تازه بود و setup واقعاً مجاز); تست جابه‌جا شد تا بعد از provisioning بررسی شود. **روی DB لوکال مهدی (که coach از قبل ساخته شده) این موضوعی نیست.**

### What remains
1. **Pull روی ویندوز مهدی** (§12 High) و ری‌استارت سرور + `Ctrl+Shift+R`.
2. تصمیم مالک دربارهٔ merge PR #2 به `main`.
3. اصلاح `docs/project-tracking/PROJECT-CONTEXT.md` (بخش‌های احراز هویت و متغیرهای محیطی هنوز `data/coach-access-token` و `YASNAFIT_COACH_TOKEN` را «فعلی» می‌دانند؛ این‌ها حذف شده‌اند).
4. اگر هدف واقعی Railway است: §6 این فایل (همه `UNKNOWN`) باید با اطلاعات پروژهٔ Railway پر شود + volume پایدار تأیید شود.
5. در صورت خواست، `npm run test:e2e` را جداگانه هم اجرا کنید (جزو `npm test` نیست).

### Exact next step for the next Agent
1. همین فایل را بخوان. 2. `git -C /home/user/yasnafit status --short; git log --oneline -1` (باید `9be37bb` و تمیز باشد؛ اگر نشد §5 «هشدار Arena» را اجرا کن). 3. از مهدی بپرس کدام شاخهٔ بعدی/تسک — **بدون تکرار پرسیدن چیزهایی که این‌جا نوشته شده.** 4. اگر تسک امنیتی/دیپلوی بود: `DEPLOYMENT.md` + `tests/deployment-hardening-regression.js` نقطهٔ شروع‌اند؛ `npm run test:deployment` را اول اجرا کن. 5. پایان تسک: به‌روزرسانی §5/§10/§13/§14/§16 همین فایل + `docs/project-tracking/CHANGELOG.md` (تسک بعدی: **Task 18**) و سپس گزارش فارسی با بلوک `bat`.

---

## 15. Files Changed Recently

| مسیر | دلیل | وضعیت |
|---|---|---|
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
| `public/trading-sessions.html` | ویجت لغوشده — **دیگر وجود ندارد** | reverted `695f4b1` |

---

## 16. Deployment / Local Synchronization State

```
LOCAL (مهدی / ویندوز)  →  GIT (شاخهٔ Arena)  →  GITHUB (origin)  →  RAILWAY/سرور
```

| محیط | وضعیت | یادداشت |
|---|---|---|
| Local (لوکال مهدی) | **BEHIND** | هنوز `9be37bb` را pull نکرده؛ با `git pull --ff-only` هم‌زمان می‌شود (DB لوکال او دست‌نخورده می‌ماند) |
| Local (سندباکس Agent) | **CURRENT** | `9be37bb`، working tree تمیز؛ سرور روی 3020 زنده و تست‌ها سبز |
| Git / GitHub origin | **CURRENT** | `refs/heads/arena/01a0618b-yasnafit = 9be37bb`؛ PR #2 باز |
| `main` | `086f3e0` — **پشت سر** شاخهٔ جلسه (تصمیم merge با مالک) |
| Railway | `UNKNOWN — needs verification` (هیچ کانفیگی در مخزن نیست؛ مستندات فعلی `DEPLOYMENT.md` برای VPS+nginx+systemd است) |

**تا این لحظه هیچ دیپلوی خودکار (CI/CD) در مخزن تعریف نشده است.**

---

## 17. دستورات اجرای پروژه (پایان هر گزارش — قاعدهٔ ثابت)

نام شاخه در بلوک زیر باید با **شاخهٔ جلسهٔ جاری** جایگزین شود (فعلاً `arena/01a0618b-yasnafit`)؛ ساختار بلوک تغییر نکند:

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a0618b-yasnafit
git pull --ff-only origin arena/01a0618b-yasnafit
.\YASNAFIT-LAUNCHER.bat
```
