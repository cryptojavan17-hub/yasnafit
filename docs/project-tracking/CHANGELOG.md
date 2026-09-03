# YasnaFit — Development Changelog (گزارش توسعه)

> **تفاوت مهم:** این فایل **گزارش توسعه/تسک‌ها** است (چه تغییری، چرا، چه تستی، چه نتیجه‌ای).
> تاریخچه **نسخه‌های محصولی** در [`../../CHANGELOG.md`](../../CHANGELOG.md) (ریشه مخزن) است — این دو با هم اشتباه گرفته نشوند.
> قالب هر مدخل: تاریخ، تسک، فایل‌ها، تغییر، دلیل، تست، نتیجه، عوارض جانبی شناخته‌شده.

---

## 2026-09-02

### Task 13 — «مدیریت رمز ورود» از منوی ⋮ به پنجره ویرایش شاگرد منتقل شد (درخواست مالک)

- **FILES:** `public/students.js`، `public/students.css`، `server.js` (`PUT /api/students/:id`)، `src/student-auth-service.js` (`mobileAuthUpdate`)، `tests/student-credentials-ui-regression.js` (جدید)، `package.json` (`test:student-credentials`)
- **WHAT:**
  1. **رفع باگ گزارش‌شده:** آیتم «🔑 رمز ورود» در منوی ⋮ لیست شاگردان هیچ handler نداشت؛ کلیک فقط منو را می‌بست و «اصلاً کار نمی‌کرد». آن آیتم (و جداکننده‌اش) از منو حذف شد تا منوی ⋮ فقط دو عملکرِ واقعی «ویرایش» و «حذف» داشته باشد.
  2. **تجمیع در ویرایش:** پنجره «ویرایش شاگرد» دو بخش شد — «📄 اطلاعات پرونده» (نام و هدف) و «🔑 مدیریت رمز ورود». بخش رمز هنگام باز شدن پنجره از `GET /api/students/:id/credentials` پر می‌شود: وضعیت رمز (موقت/شخصی/نیازمند بازنشانی)، قفل ورود، رمز موقت جاری (۴ رقم آخر)، آخرین ورود/تغییر رمز/تلاش ناموفق.
  3. **تغییر نام کاربری و رمز در یک جا:** یک ورودی «نام کاربری (شماره همراه)» + دو ورودی «رمز شخصی جدید/تکرار» + دکمه‌های «بازنشانی به رمز موقت»، «باز کردن قفل ورود» (فقط وقتی قفل است) و «کپی اطلاعات ورود». همه با یک دکمه «ذخیره تغییرات» ذخیره می‌شوند: نخست `POST .../credentials` (اگر تغییری در ورود باشد) سپس `PUT` پروفایل؛ خطای سرور (مثلاً شماره تکراری) پیش از ذخیره پروفایل نمایش داده می‌شود و ورودی‌های تایپ‌شده بازنشانی نمی‌شوند.
  4. **رمز تازه فقط یک‌بار** در همان پنجره نمایش داده می‌شود (`password_once`) و پیام «N نشست فعال شاگرد باطل شد» در کنارش می‌آید؛ لیست پشت پنجره خودکار تازه می‌شود و پنجره باز می‌ماند تا مربی رمز را کپی کند. اگر هیچ چیزی تغییر نکرده باشد، پیام «چیزی برای ذخیره تغییر نکرد.» نمایش داده می‌شود و هیچ درخواستی به سرور نمی‌رود.
  5. **هم‌سازی سمت سرور:** تغییر شماره همراه از مسیر `PUT /api/students/:id` دیگر hash رمز موقتِ کهنه جا نمی‌گذارد — تابع جدید `mobileAuthUpdate` در حالت غیرشخصی، رمز موقت را با ۴ رقم جدید بازمی‌سازد، قفل/شمارنده تلاش را صفر می‌کند و نشست‌ها را باطل می‌کند و `temporary_password` را در پاسخ برمی‌گرداند.
- **WHY:** مربی (مالک) نمی‌توانست نام کاربری/رمز شاگرد را عوض کند؛ تنها راه‌حل موجود در UI مرده بود و ویرایش پروفایل هم رمز را دست نمی‌زد.
- **TESTS:** سوئیت جدید `node tests/student-credentials-ui-regression.js` (new in the `npm test` chain as `test:student-credentials`) (گارد «هر آیتم منوی ⋮ باید بایندینگ داشته باشد» + قرارداد پنجره ویرایش + قرارداد سرویس) ✅ • `npm test` کامل (۱۷ سوئیت) ✅ • راستی‌آزمایی زنده روی سرور: ساخت شاگرد → ذخیره نام‌کاربری+رمز از پنجره → ورود شاگرد با رمز نو ✅ / ورود با شماره کهنه ۴۰۱ ✅ → بازنشانی به رمز موقت → ورود با ۴ رقم جدید ✅ • همان جریان با jsdom و `public/students.js` واقعی (باز شدن منو، باز شدن پنجره، اعتبارسنجی تکرار رمز، ذخیره، نمایش یک‌باره رمز، کپی اطلاعات ورود) ✅
- **RESULT:** PASS — در جریان راستی‌آزمایی سه اشکال دیگر هم گرفته و رفع شد:
  1. پس از خطای اعتبارسنجی، مقدار تایپ‌شده در فیلدها پاک می‌شد (اکنون در بازنمایش نگه داشته می‌شود).
  2. اگر همزمان نام کاربری و رمز شخصی ذخیره می‌شد، کارت «رمز موقت این شاگرد: …» را هم نمایش می‌داد؛ `manageCredentials` اکنون رمز موقتِ بازسازی‌شده را وقتی گزارش می‌کند که وضعیت نهایی PERSONAL نباشد (`revealedTemporary&&passwordState!=='PERSONAL'`).
  3. پیام «نشست‌ها باطل شد» حتی وقتی نشست فعالی وجود نداشت نمایش داده می‌شد؛ اکنون تعداد واقعی نشست‌های باطل‌شده (با رقم فارسی) و فقط در صورت لزوم نمایش داده می‌شود.
- **COMPAT:** API جدید اضافه نشد (`GET/POST /api/students/:ref/credentials` از قبل بود). پاسخ `PUT /api/students/:id` فقط در صورت تغییر شماره همراه سه فیلد افزایشی دارد (`credentials`، `temporary_password`، `sessions_revoked`). مایگریشن/نسخه محصول تغییر نکرد.

### Task 14 — مُهر «بیلد» روی سرِ لیست شاگردان + بررسی خودکار لانچر (تشخیص آپدیت‌نشده)

- **FILES:** `src/build-info.js` (جدید)، `server.js` (`GET /api/build` + خط `Build stamp:` در لاگ شروع)، `public/students.js` / `public/students.css` (چیپ `#studentsBuildStamp`)، `YASNAFIT-LAUNCHER.bat` (زیرروال `:CHECKCODE`)، `tests/student-credentials-ui-regression.js`، `README.md` (بخش «نصب/به‌روزرسانی از گیت‌هاب»)
- **WHY:** گزارش مالک: «کار نمی‌کند، اصلاً آپدیت نشد». در نصب دسکتاپ هیچ نشانه‌ای از کامیت روی صفحه نیست، پس نمی‌شود فهمید پوشهٔ در حال اجرا کد قدیمی است یا نه (شاخهٔ اشتباه، pull ناموفق، یا سروری که از پوشهٔ دیگری بالا آمده).
- **WHAT:**
  1. `GET /api/build` نسخه، شاخه، کامیت کوتاه، `uncommitted`، زمان آخرین تغییر `public/students.js` و نشانک‌های قابلیت (`student_credentials_in_edit_dialog`، `student_credentials_api`، `mobile_password_sync`، `launcher`) را می‌دهد — نشانک‌ها با خواندن خودِ فایل‌ها محاسبه می‌شوند، پس به git وابسته نیستند.
  2. چیپ کوچک زیر تیتر «شاگرد های من»: `✓ کد روز — <commit> • <تاریخ جلالی فایل>` و در حالت کد قدیمی `⚠️ کد قدیمی است — git pull اعمال نشده` (با hover: شاخه/کامیت/زمان فایل).
  3. لانچر: در منو و در پیام «port busy»، `:CHECKCODE` شاخه/کامیت محلی را چاپ می‌کند و با `findstr` وجود `credentialEditorMarkup` در `public\students.js` را اعلام می‌کند (NEW/OLD CODE) + راهنمای «برای بارگذاری کد تازه گزینه ۲ را بزنید».
  4. README: مسیر درست نصب/به‌روزرسانی (فراخوانی همهٔ شاخه‌ها + clone از شاخهٔ جلسه، چون `main` هنوز مخزن خالیِ اولیه است) و عیب‌یابی سه‌حالته.
- **TESTS:** `npm test` کامل (۱۷ سوئیت، شامل قیود جدید لانچر/چیپ/`/api/build`) ✅ • چک زنده: `curl /api/build` و رندر چیپ با jsdom ✅
- **COMPAT:** `GET /api/version` دست‌نخورده (e2e آن را deepEqual می‌کند)؛ `/api/build` فقط اعداد/تاریخ/نشانک بولین نشان می‌دهد و داده کاربر یا رمز را فاش نمی‌کند. هیچ مایگریشنی اضافه نشد.

### Task 15 — «ویرایش» → «ویرایش و رمز» + ساده‌سازی پنجره + دکمهٔ ساخت رمز تصادفی (درخواست مالک)

- **FILES:** `public/students.js`، `public/students.css`، `tests/student-credentials-ui-regression.js`
- **WHAT:**
  1. نام آیتم منوی ⋮ و تیتر پنجره به **«ویرایش و رمز»** تغییر کرد (قبلاً «ویرایش» بود و «مدیریت رمز ورود» جدا).
  2. پنجره تک‌فرم و کوتاه شد: سه فیلد بالا (نام، شمارهٔ همراه/نام کاربری، هدف) و یک بخش «🔑 رمز ورود» که فقط سه عنصر دارد: خط وضعیت فشرده (`رمز موقت · ۴ رقم آخر: ۱۲۳۴` / `رمز شخصی` / `ورود قفل است`)، یک خانهٔ رمز با دکمهٔ 👁 (نمایش/پنهان) و 🎲 (ساخت رمز تصادفی)، و سه دکمهٔ متنی کوچک («رمز موقت ۴ رقمی»، «باز کردن قفل» فقط هنگام قفل، «کپی نام کاربری و رمز»). چیپ‌ها، جدول «رمز موقت فعلی»، پاراگراف‌های راهنما، ردیف «کپی نام کاربری» و خطوط «آخرین ورود/تغییر رمز/تلاش ناموفق» حذف شدند.
  3. **فیلد «تکرار رمز» حذف شد** (منبع اصلی شلوغی و خطای تایپی نبود؛ با دکمهٔ 👁 رمز قابل دیدن است و رمز جدید پس از ذخیره یک‌بار کامل نمایش داده و کپی می‌شود). `confirm_password` دیگر ارسال نمی‌شود؛ اعتبارسنجی طول ۸ کاراکتر در کلاینت و سرور همچنان برقرار است.
  4. **🎲 ساخت رمز تصادفی:** ۱۰ نویسه از الفبای بدون کاراکتر مبهم (بدون `0 O I l 1`) با `crypto.getRandomValues` (و fallback). بلافاصله رمز در خانه نمایش داده می‌شود و «نام کاربری + رمز + لینک» روی کلیپ‌بورد کپی می‌شود؛ فقط باید «ذخیره تغییرات» زد.
  5. ورودی «شمارهٔ همراه (نام کاربری ورود)» از کارتِ بازنمایش‌شونده به فرم ثابت بالای پنجره منتقل شد، پس هیچ بازنمایشی مقدار تایپ‌شده را پاک نمی‌کند (و `typedUsername` حذف شد).
- **WHY:** بازخورد مالک: «اسم ویرایش رو بزار ویرایش و رمز» و «صفحه شلوغه» + نیاز به رمز تصادفی.
- **TESTS:** سوئیت `test:student-credentials` بازنویسی شد تا قرارداد جدید را قفل کند: برچسب منو، نبود `credConfirm`/چیپ‌ها/متن‌های حذف‌شده، وجود 👁/🎲/کپی، الفبای بدون ابهام رمز، «رمز اختیاری است»، و گارد جدید «همهٔ متغیرهای وضعیتِ دیالوگ باید اعلام‌شده باشند» (یک `ReferenceError` واقعی که همین حین گرفته شد: اعلام `usernameChanged` حذف شده بود و دکمهٔ ذخیره بی‌صدا از کار می‌افتاد). `npm test` کامل (۱۷ سوئیت) ✅ • راستی‌آزمایی زنده + jsdom: منو ← پنجره ← 🎲 ← ذخیره (تغییر شماره + رمز) ← ورود شاگرد با رمز تولیدی ✓ / نشست قبلی ۴۰۱ ✓ ← «رمز موقت ۴ رقمی» ← ورود با ۴ رقم ✓
- **RESULT:** PASS — پنجره از ~۱۴ عنصر قابل‌مشاهده به ۶ فیلد/کنترل + ۴ دکمه رسید؛ تعداد `button`های پنجره در تست قفل شد (۷ در حالت عادی).

### Task 16 — ممیزی نهایی امنیتی + پاک‌سازی فایل‌های مرده برای بردن برنامه روی سرور (درخواست مالک)

- **FILES:** `src/request-security.js` (جدید)، `public/boot.js` (جدید)، `DEPLOYMENT.md` (جدید)، `tests/deployment-hardening-regression.js` (جدید)، `package.json` (`test:deployment`؛ زنجیره `npm test` به ۱۸ سوئیت)، `server.js`، `src/database.js`، `src/coach-auth-service.js`، `src/student-session-service.js`، `public/index.html`، `public/releases.js`، `tests/ui-design-regression.js`، `tests/coach-auth-regression.js`، `tests/student-session-regression.js`، `tests/e2e-workflow.js`، `README.md`، `ARCHITECTURE.md` — **حذف:** `login-hero.png` (ریشه)، `public/assets/hero-login.jpg`، `public/yasnafit-students-dashboard-mockup.png`، `public/student-portal.js`، `public/student-portal.css`، `tool/test-movement-modal-interactive.js`، `راهنمای_اجرا.md`
- **WHAT:**
  1. **هدرهای امنیتی روی همهٔ پاسخ‌ها:** ماژول جدید `src/request-security.js` یک مجموعه هدر می‌سازد (CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` + `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `Referrer-Policy: no-referrer` + `Permissions-Policy` + `Cross-Origin-Opener/Resource-Policy`). `server.js` آن را در ابتدای هندلر درخواست اعمال می‌کند (فایل استاتیک، HTML و پاسخ‌های خطا هم شامل می‌شوند) و `send()` هم آن را merge می‌کند. صفحه‌های مستقل ورود مربی ۲FA/بازیابی/ساخت اکانت هم `frame-ancestors 'none'` + `base-uri` + `form-action` گرفتند.
  2. **حذف inline script:** تنها `<script>` درون‌خطی `public/index.html` (بازپخش `window.onpopstate`) به `public/boot.js` منتقل شد تا CSP بدون `unsafe-inline` برای اسکریپت قابل اعمال باشد. بررسی شد: در همهٔ `public/*.html` صفر `<script>` درون‌خطی و صفر `on*=` وجود دارد.
  3. **اعتماد به هدرهای پروکسی:** پیش از این `x-forwarded-for` (کلید rate-limit)، `x-forwarded-host` (بررسی same-origin/CSRF) و `x-forwarded-proto` (پرچم `Secure` کوکی) بدون قید خوانده می‌شدند؛ حالا تنها وقتی `YASNAFIT_TRUST_PROXY=1` set باشد. `YASNAFIT_COOKIE_SECURE=1` پرچم Secure را اجباری می‌کند و `YASNAFIT_HOST` آدرس bind را (پیش‌فرض `0.0.0.0`، پشت nginx روی `127.0.0.1`) تعیین می‌کند. همهٔ خواندن‌های `X-Forwarded-*` در کل مخزن حالا فقط در یک فایل است.
  4. **کاهش افشای اطلاعات:** `POST /api/test/reset-rate-limit` (پاک‌کنندهٔ شمارندهٔ تلاش ناموفق ورود) در `NODE_ENV=production` ۴۰۴ می‌شود. `GET /api/health` به ناشناس فقط `{ok,status,version,uptime}` می‌دهد؛ شمارش شاگرد/حرکت/برنامه، `port`، وجود فایل دیتابیس و `schema_version` پشت `?detailed=1` + نشست مربی رفت (`public/releases.js` به همان حالت کلید شد). `GET /api/build` (شاخهٔ git، mtime فایل‌ها، نشانک‌ها) دیگر عمومی نیست و نشست مربی می‌خواهد.
  5. **نشت پیام داخلی:** ~۴۰ مورد `sendError(res,400,error.message)` در مسیرهای شاگرد/احراز هویت/برنامه به `sendCaughtError()` تبدیل شد — پیام‌های فارسی اعتبارسنجی که سرویس‌ها عمداً می‌فرستند دست‌نخورده می‌مانند، ولی هر متن شبیه خطای SQLite/کتابخانه فقط لاگ می‌شود و پاسخ ۵۰۰ عمومی است. پیام `sendError` مسیر بکاپ هم از بدنهٔ خطا پاک شد.
  6. **مجوز فایل‌های حساس:** `data/` و `backups/` با `0700` ساخته و در هر اجرا `chmod` می‌شوند؛ فایل دیتابیس (`yasnafit.db` + `-wal`/`-shm`) `0600`؛ `data/smtp.json` (App Password جیمیل) علاوه بر `writeFileSync({mode:0o600})` یک `chmodSync` هم می‌گیرد (حالتی که فایل از قبل وجود دارد).
  7. **اشغال حساب مربی در اولین اجرا:** `POST /api/coach/auth/setup` فقط از لوپ‌بک مجاز است (یا با `YASNAFIT_ALLOW_REMOTE_SETUP=1`)؛ وگرنه هر اسکنری که زودتر به سرور عمومی برسد می‌توانست حساب مربی را بسازد.
  8. **۴۰۴ واقعی برای فایل حذف‌شده:** درخواست `*.html` ناموجود به‌جای fallback به شل SPA (که به کاربر ناشناس هم داده می‌شد) حالا ۴۰۴ می‌گیرد؛ بنابراین `/trading-sessions.html` (ویجت لغوشده) دیگر پاسخ ۲۰۰ نمی‌دهد.
  9. **پاک‌سازی:** با اسکن ارجاع روی کل `git ls-files`، هفت مسیر بدون استفاده حذف شد — `login-hero.png` ریشه و `public/assets/hero-login.jpg` بایت‌به‌بایت تکراری بودند (نسخهٔ واقعی `public/login-hero.png` است که `public/student-app.js` و `luxury-login.css` از `/login-hero.png` می‌خوانند؛ حفظ شد)، `student-portal.js`/`.css` جفت مرده بودند (کلاس‌هایش فقط توسط خود JS مرده استفاده می‌شد؛ `public/student-app.js` جای آن را گرفته)، موکاپ PNG و یک اسکریپت یک‌بارمصرف در `tool/` هیچ ارجاعی نداشتند و `راهنمای_اجرا.md` محتوای منسوخ داشت (`YASNAFIT_COACH_TOKEN` و توکن مشترک که از این مخزن حذف شده). `link` استایل حذف‌شده از `index.html` برداشته شد و `tests/ui-design-regression.js` به لیست جدید CSS/JS به‌روز شد. `scripts/provision-coach-totp.js`، سایر `tool/*`، `data-source/exercises_data.json` و مسیرهای `/api/programs` (که `public/core.js` هنوز مصرف می‌کند) **حفظ شدند**.
  10. **راهنمای استقرار:** `DEPLOYMENT.md` (فارسی) اضافه شد: پیش‌نیاز Node ≥ 22.5 و صفر وابستگی، جدول متغیرهای محیطی، بلوک nginx با TLS و `proxy_set_header X-Forwarded-*`، یونیت systemd با `NoNewPrivileges`/`ProtectSystem`، `chmod 700/600`، پروویژن TOTP مربی با `scripts/provision-coach-totp.js`، App Password جیمیل، بکاپ (دکمهٔ پنل + اسکریپت cron)، روش به‌روزرسانی و چک‌لیست ۱۰ بند قبل از باز کردن سرویس. نکته‌های درست `راهنمای_اجرا.md` (مسیرهای ورودی، ریست دیتابیس، قاعدهٔ ری‌استارت، اشغال پورت، موبایل/وزن فارسی) به `README.md` منتقل شد.
- **WHY:** درخواست مالک: «می‌خوام برنامه رو ببرم رو سرور — بررسی نهایی و امنیتی کامل… کد و فایلهای اضافی و بیکار حذف کن سریع».
- **TESTS:** سوئیت جدید `test:deployment` (حذف‌شده‌ها بازمی‌گردند؟ ارجاع جا‌مانده؟ هدرها روی پاسخ استاتیک؟ گیت‌های `X-Forwarded` با req جعل‌شده/صادق در دو حالت env؛ گیت‌های `/api/health?detailed`، `/api/build`، reset-rate-limit، مجوز فایل‌ها، و چک موجود بودن همهٔ دارایی‌های ارجاع‌شده در `index.html`) • `tests/coach-auth-regression.js` / `tests/student-session-regression.js`: قیاس کوکی `Secure` از هدر جعلی به `socket.encrypted` تغییر کرد + تست جدید «هدر جعلی نباید Secure بچسباند» • `tests/e2e-workflow.js`: بررسی زندهٔ هدرها روی `/` و `/boot.js`، شکل حداقلی `/api/health`، ۴۰۱ بودن `/api/build` و health دقیق، و رفع false-positive بازرسی «ورژن هاردکد‌شده» (دادهٔ مسیر SVG در `student-app.js` با regex شمارهٔ نسخه داخل نقل‌قول جدا شد). `npm test` = **۱۸/۱۸ ✅** • `npm run test:e2e` ✅ • چک زنده با سرور روی 3020: هدرها روی `/`، `/coach/login`، `/api/health`، `/boot.js`، `/login-hero.png` ✓ — `POST /api/test/reset-rate-limit` در `NODE_ENV=production` → ۴۰۴ ✓ — `/api/health` → `{"ok":true,"status":"ok","version":"0.9.1","uptime":…}` ✓ — `/api/build` ناشناس → ۴۰۱ ✓ — `/student-portal.css`، `/trading-sessions.html` → ۴۰۴ ✓ — `ls -ld data backups` → `drwx------` ✓
- **RESULT:** PASS — بدون فریم‌ورک جدید، بدون تغییر API عمومی، بدون مایگریشن، بدون تغییر نسخهٔ محصولی؛ همهٔ ۱۸ سوئیت سبز و لایهٔ امنیتی در یک ماژول متمرکز شد.
- **KNOWN SIDE EFFECTS:** (۱) اگر روی سرورِ بدون nginx مستقیم در اینترنت اجرا کنید و `YASNAFIT_TRUST_PROXY=1` را فراموش کنید، IP همهٔ مشتریان برای rate-limit یکی می‌شود (قفل‌شدن جمعی در حملات) — عمداً ترجیح داده شد چون حالت امن‌ترِ «پشت پروکسی» لازم است. (۲) `/api/health?detailed=1` برای مانیتورینگ بیرونی نیازمند نشست مربی است؛ برای آپ‌تایم واچ از همان `/api/health` استفاده شود. (۳) `chmod` روی ویندوز بی‌اثر است (به‌صورت best-effort خورده می‌شود). (۴) نسخهٔ لوکال شما اگر `btnContinueAuth` داشته باشد (کاربر در پیام بعدی اشاره کرد) از این مخزن نیست — این شاخه `#coachPasswordSubmit` را با تست DOM بررسی می‌کند (Task 17).

---

### Task 17 — راستی‌آزمایی «ادامه» صفحهٔ اول ورود مربی + گارد علیه دکمهٔ مرده (درخواست مالک)

- **FILES:** `tests/coach-auth-regression.js`
- **WHAT:** ادعای «دکمهٔ ادامه صفحه اول پیاده‌سازی نشده» با جستجو در کل تاریخچهٔ مخزن (`git log --all -S`) بررسی شد: `btnContinueAuth` هرگز در این ریپو وجود نداشته؛ صفحهٔ `/coach/login` این شاخه یک `form#coachPasswordForm` با `button#coachPasswordSubmit` از نوع `type="submit"` و برچسب «ادامه» دارد که `/api/coach/auth/login` را صدا می‌زند. برای اینکه این باگ کلاسِ «دکمهٔ متنی بی‌عمل» دوباره برنگردد، به سوئیت مربی اضافه شد: (۱) برای هر شش صفحهٔ احراز هویت، دکمه باید `type="submit"` و بدون `disabled` باشد، داخل فرم با `id` درست باشد، `coach-login.js` روی همان فرم `submit` بگیرد و endpoint مربوطه را صدا بزند، و هیچ `<button type="button">` با برچسب «ادامه/ورود» وجود نداشته باشد؛ (۲) اجرای واقعی `public/coach-login.js` در `node:vm` با DOM ساختگی: مقدار دادن ایمیل/رمز، dispatch روی `submit` → assert اینکه `POST /api/coach/auth/login` با بدنهٔ درست ارسال و سپس `location.replace('/coach/2fa')` فراخوانی می‌شود.
- **WHY:** مالک گزارش داد دکمهٔ «ادامه» در صفحهٔ اول عمل نمی‌کند.
- **TESTS:** `npm run test:coach-auth` ✅ • چک زنده روی سرور: `GET /coach/login` (مارک‌آپ و اسکریپت) ✓ — `POST /api/coach/auth/login` با رمز درست → ۲۰۰ + کوکی `yasnafit_coach_challenge` + `"next":"/coach/2fa"` ✓ — با رمز غلط → `INVALID_CREDENTIALS` با پیام فارسی (بدون متن داخلی) ✓ — `npm test` کامل ۱۸/۱۸ ✅
- **RESULT:** PASS — «ادامه» در کد این شاخه کار می‌کند و با تست قفل شد؛ اگر در کپی لوکال همچنان بی‌عمل است، آن پوشه کد قدیمی/دست‌کاری‌شده دارد (با `git pull --ff-only` همین شاخه جایگزین می‌شود؛ چیپ «کد روز» در لیست شاگردان همان را نشان می‌دهد).
- **KNOWN SIDE EFFECTS:** —

### Task 18 — آماده‌سازی deploy روی Railway (کانفیگ مخزن + Volume + بکاپ)

- **FILES:** `railway.json` (جدید)، `src/database.js`، `server.js`، `DEPLOYMENT.md` (بخش §۹)، `tests/deployment-hardening-regression.js` (بخش ۸)، `mahdi hellp.md` (§۶/§۱۴/§۱۵/§۱۶)
- **WHAT:**
  1. `railway.json`: `builder: NIXPACKS`، `buildCommand: npm install --no-audit --no-fund && node --check server.js` (build خراب زود می‌شکند)، `startCommand: node server.js`، `healthcheckPath: /api/health` (عمومی و حداقلی — همان چیزی که Railway پروب می‌کند؛ گیت نشدنی)، `restartPolicyType: ON_FAILURE` + `restartPolicyMaxRetries: 5`، `numReplicas: 1`، `sleepApplication: false`، `watchPatterns` فقط `server.js|src/**|public/**|data-source/**|package.json|railway.json`. هیچ Dockerfile/CI اضافه نشد.
  2. **پشتیبانی state روی Railway:** هر سرویس فقط یک Volume دارد، پس مسیر بکاپ قابل جابه‌جایی شد: `src/database.js` مقدار `YASNAFIT_BACKUP_DIR` را می‌پذیرد (پیش‌فرض `backups/` کنار برنامه ⇒ رفتار لوکال/ویندوز بدون تغییر) و `dataDir`/`backupDir` را export می‌کند؛ `server.js` چرخش ۱۰ نسخه را روی همان `backupDir` مشترک انجام می‌دهد (به‌جای `path.join(__dirname,'backups')` hardcode). با Volume روی `/app/data` و `YASNAFIT_BACKUP_DIR=/app/data/backups`، همه‌چیز (DB، `assessments/`، `assessment-documents/`، `smtp.json`، `coach-authenticator.txt`، بکاپ‌ها) روی دیسک دائمی است.
  3. `DEPLOYMENT.md` §۹: مراحل داشبورد (Deploy from GitHub → Attach Volume با mount path `/app/data` → Variables → Generate Domain)، جدول متغیرها (`NODE_ENV=production`, `YASNAFIT_TRUST_PROXY=1`, `YASNAFIT_COOKIE_SECURE=1`, `YASNAFIT_BACKUP_DIR`, موقتاً `YASNAFIT_ALLOW_REMOTE_SETUP=1` برای اولین ساخت حساب مربی، و در صورت نیاز `NIXPACKS_NODE_VERSION=22` / `RAILWAY_RUN_UID=0`)، قاعدهٔ «`PORT`/`YASNAFIT_HOST` را ست نکنید»، چک‌لیست curl پس از deploy، و ریسک‌های صادقانه (عکس ۱۸۸۸ حرکت در git نیست ⇒ placeholder؛ حجم ~۰٫۵GB Volume در پلن رایگان؛ پاک‌شدن سرویس در پایان ماه ⇒ بکاپ‌گیری قبل از آن؛ نبود UI آپلود فایل روی Volume ⇒ انتقال داده یا «از صفر» یا یک API جدید restore که نیازمند تأیید مالک است).
  4. گاردهای جدید در `test:deployment`: اعتبار `railway.json` و فیلدهای حیاتی، routable بودن `/api/health` قبل از گیت مربی، tracked بودن `data-source/exercises_data.json` (بدون آن کانتینر تازه ۲۷۰۷ حرکت را seed نمی‌کند)، export شدن `backupDir` و نبود مسیر hardcode بکاپ.
- **WHY:** مالک سرور یک‌ماههٔ رایگان Railway گرفته (حساب `yasnafit@atomicmail.io`) و خواست پروژه وصل شود. اتصال داشبورد (لاگین/کلیک) فقط توسط مالک ممکن است؛ کاری که از سمت Agent شدنی بود، آماده‌سازی کامل مخزن + مستندات + قفل تستی است.
- **TESTS:** `npm test` = **۱۸/۱۸ ✅** • `npm run test:e2e` ✅ • **شبیه‌سازی محیط Railway** با `NODE_ENV=production YASNAFIT_TRUST_PROXY=1 YASNAFIT_COOKIE_SECURE=1 YASNAFIT_BACKUP_DIR=$PWD/data/backups`: `GET /api/health` → 200 `{"ok":true,"status":"ok","version":"0.9.1","uptime":…}` ✅ • `POST /api/coach/auth/login` → 200 + `Set-Cookie: yasnafit_coach_challenge=…; HttpOnly; SameSite=Strict; Path=/; Max-Age=300; Secure` ✅ (پرچم Secure از env می‌آید، نه از هدر جعلی) • `POST /api/test/reset-rate-limit` → 404 ✅ • `GET /api/build` → 401 ✅ • `backup()` فایلی در `data/backups/` نوشت و چرخش همان مسیر را می‌خواند ✅ • بوت با DB تازه: ۳۰ مایگریشن + `Imported 2707 exercises from JSON` ✅ • `ls -ld data data/backups` → `drwx------` ✅
- **RESULT:** PASS (سمت مخزن) — **اتصال واقعی به Railway هنوز انجام نشده** و در `mahdi hellp.md` §۶ عمداً `UNKNOWN — needs verification` مانده است.
- **KNOWN SIDE EFFECTS:** (۱) اگر Volume روی `/app/data` وصل نشود، هر deploy دیتابیس را پاک می‌کند — این ریسک در DEPLOYMENT.md و §۶ ذکر شده و در تست قابل بررسی نیست. (۲) `buildCommand` حالا `npm install` را صریح اجرا می‌کند؛ اگر روزی وابستگی اضافه شود، همان‌جا install می‌شود و چیزی عوض نمی‌کند. (۳) رفتار لوکال/ویندوز بدون تغییر (پیش‌فرض `backupDir` همان `backups/` است). (۴) سندباکس این جلسه میانهٔ کار به `main` rewind شد و با fetch/update-ref/reset --hard (بدون force-push) بازیابی شد — روی ماشین مهدی تکرار نشود.

---

## 2026-08-24

### Task 11 — بازگشت «حذف روز» به منوی تنظیمات روز (اصلاح قاعده BR-14)

- **FILES:** `public/program-builder.js`، `tool/smoke-program-builder.js`، مستندات
- **WHAT:** به درخواست مالک، حذف روز (با تأیید + شماره‌گذاری مجدد + کلمپ روز فعال) به منوی ⚙️ تنظیمات روز برگشت.
- **TESTS:** smoke برنامه‌ساز ✅ terminology ✅

### Task 10 — بازطراحی داشبورد مربی («مرکز کنترل مربی»)

- **FILES:** `server.js` (handleDashboard توسعه افزایشی — فیلد v2)، `public/core.js` (بلاک رندر داشبورد بازنویسی)، `public/styles.css` (بخش Dashboard v2)، `public/theme.css` (توکن‌های --warning/--warning-surface)
- **WHAT:** داشبورد مربی‌محور: هدر «سلام، مربی 👋» + جمله پویا از داده واقعی | کارت‌های آماری فشرده با روند واقعی ۳۰ روزه | بخش «نیازمند توجه شما» (برنامه پایان‌یافته/در حال پایان، ارزیابی آماده بررسی، ارزیابی تکمیل‌نشده، دعوت استفاده‌نشده، شاگرد بدون تمرین ۱۴روزه — همگی با دکمه اقدام) | «اقدامات سریع» | نمای شاگردها (آواتار حرف اول، برنامه، نوار پیشرفت زمانی واقعی، آخرین فعالیت، بَج وضعیت) | «وضعیت شاگردان» (میله‌های توزیع) | نمودار ۳۰روزه جلسات (ستونی، بدون کتابخانه) | تایم‌لاین فعالیت با زمان نسبی فارسی | empty stateها برای همه بخش‌ها. بدون داده جعلی — همه اعداد از DB.
- **COMPAT:** فیلدهای قدیمی پاسخ (/api/dashboard: stats/activities/students) دست‌نخورده؛ v2 افزایشی. روت/دسترسی/منطق بدون تغییر.
- **TESTS:** ui ✅ (شامل قیود بلاک داشبورد) • terminology ✅ • e2e ✅ • API v2 با داده واقعی e2e راستی‌آزمایی شد (توجه/روند/نمای شاگردها/تایم‌لاین/سری).
- **RESULT:** PASS — دو باگ در حین کار کشف و رفع شد: ستون درست دعوت‌ها used_at (نه accepted_at) و حذف case_number از student_invites (به students join شد).

### Task 9 — ارتقای ابزار اتصال بانک: حالت «تغذیه» برای ساختار غنی مالک

- **FILES:** `tool/import-custom-bank.js` (بازنویسی — حالت‌دار)
- **WHAT:** با دیدن ساختار واقعی فایل مالک (`exercises.json` غنی: id/name_fa/name_en/category/equipment/difficulty/description/video/hasVideo — ۲۶۹۷ حرکت با همان شناسه‌های بانک ۲۷۰۷): حالت جدید «تغذیه» — تطبیق با original_id یا نام نرمال‌شده → پر کردن name_en/equipment/difficulty/description/video_path روی حرکات موجود (T-04 بدون مایگریشن!) + درج حرکات واقعاً جدید + ساخت خودکار دسته‌های نبود (trx/lats). حالت درج ساده قبلی حفظ شد.
- **TESTS:** fixture دقیق مطابق ساختار مالک → dry-run + اجرا: ۲ تغذیه (تأیید DB + API) + ۱ درج با دسته trx ساخته‌شده ✅؛ سپس پاک‌سازی کامل (۲۷۰۷ برقرار).
- **RESULT:** PASS — دیده شد equipment در نتایج درایور بانک خودکار نمایش داده می‌شود.

### Task 8 — اتصال بانک شخصی حرکات (داده + ویدیو)

- **FILES:** `tool/import-custom-bank.js` (جدید)، `tool/import-videos.js` (جدید)
- **WHAT:** دو ابزار اتصال بانک محلی مالک (`C:\Users\MAHDI\Desktop\bodybuilding`):
  1. **داده:** تشخیص خودکار ساختار JSON (آرایه/کلید موجود/کلید عددی + فیلدهای فارسی نام/محل/دسته) + حذف تکراری با نرمال‌سازی فارسی + تطبیق دسته دقیق/بخشی + دسته پناهگاه «حرکات شخصی» + ثبت تراکنشی؛ بی‌نیاز از ری‌استارت سرور (همان لحظه در جستجو/بانک). `--dry-run` پشتیبانی می‌شود.
  2. **ویدیو:** اسکن بازگشتی `exercises_organized` (مسیر مالک به‌صورت پیش‌فرض) → استخراج ID از ابتدای نام فایل → کپی به `public/assets/videos/exercises/{ID}.mp4` (gitignore) → سرو از `/files/exercise/videos/{id}.mp4` بدون ری‌استارت. `--force` بازنویسی.
  3. عکس‌ها از قبل با `tool/import-images.js` متصل بودند.
- **TESTS:** درون‌زا با fixture: dry-run + ثبت ۲ حرکت تستی + تأیید API جستجو (۲ نتیجه) + تشخیص ۲ تکراری (با فاصله اضافه) ✅؛ ویدیو: ۲ فایل دامی از ساختار تودرتو فارسی → کپی + سرو HTTP 200 ✅؛ داده تستی پاک شد (۲۷۰۷ برقرار).
- **RESULT:** PASS — فایل پیوستی مالک (`exercises.json`) به سندباکس نرسید؛ ابزار روی سیستم خودش مسیر را خودکار پیدا می‌کند.

### Task 7 — انتخابگر تاریخ شمسی گرافیکی (Jalali Date Picker)

- **FILES:** `public/jalali-picker.js` (جدید)، `public/jalali-picker.css` (جدید)، `index.html`، `student.html`، `tool/smoke-jalali-picker.js` (جدید)
- **WHAT:** تقویم بازشوی تمام‌شمسی برای همه `input[data-jalali]` (اتصال خودکار): نمای روز/ماه/سال، ناوبری ماه (‹›)، پرش سریع سال (گرید ۱۲ ساله با ‹‹››)، هایلایت امروز (حاشیه آبی) و تاریخ انتخاب‌شده (پر)، دکمه «امروز» و «پاک کردن»، اعداد و ماه‌های فارسی، RTL کامل، پاپ‌اور زیر فیلد در دسکتاپ و شیت پایین در موبایل، بستن با کلیک بیرون/Escape. ورود متنی همچنان ممکن است.
- **TESTS:** `tool/smoke-jalali-picker.js` ✅ ۱۰ چک (امروز/طول ماه‌ها/کبیسه ۱۴۰۳-۱۴۰۴/ستون‌های هفته/باز-بسته) • ui ✅ • term ✅ • smoke برنامه‌ساز ✅ • فایل‌ها 200 ✅
- **RESULT:** PASS • **NOTES:** T-16 انجام شد؛ ذخیره‌سازی همچنان ISO (BR-15).

### Task 6 — تقویم شمسی + جستجوی پویای بانک حرکات + افزودن دستی حرکت

- **FILES CHANGED:** `public/jalali.js` (جدید)، `public/index.html`، `public/student.html`، `public/program-builder.js`، `public/program-builder.css`، `public/assessment-wizard.js`، `public/student-app.js`، `public/student-portal.js`، `public/exercises.js`، `server.js`، `tool/smoke-jalali.js` (جدید)
- **WHAT CHANGED:**
  1. **تقویم شمسی (نمایش/ورود):** کتابخانه بدون‌وابستگی `jalali.js` (الگوریتم jalaali، کبیسه از طول واقعی سال). فیلدها: تاریخ شروع/پایان برنامه‌ساز + لیست برنامه‌ها + تاریخ تولد (ویزارد ارزیابی، پروفایل شاگرد، پورتال مربی). **ذخیره‌سازی همچنان ISO میلادی** — شمسی فقط لایه UI (BR-15). ورودی: ارقام فارسی/لاتین، جداکننده‌های مختلف، ISO؛ اعتبارسنجی روز/ماه/کبیسه.
  2. **جستجوی بانک:** سرور — `normalizeFaText` (ي/ى→ی، ك→ک، أ/إ/آ→ا، نیم‌فاصله، اعراب، ارقام) + جستجوی سراسری جدید (بدون دسته = همه ۲۷۰۷ حرکت، همه محل‌ها، رتبه‌بندی شروع‌شودن/شامل‌شدن) + `location=all`. درایور — دکمه «🌐 همه محل‌ها» + در حالت همه: جستجو از ۱ حرف + دیبانس ۴۰۰→۲۰۰ms + بَج محل (باشگاه/منزل) روی هر نتیجه. بانک مدیریت — دیبانس ۲۰۰ms.
  3. **افزودن دستی:** پنل «＋ افزودن حرکت دستی» در پایین درایور برنامه‌ساز (نام/محل/دسته → POST → بلافاصله به سیستم جاری اضافه می‌شود اگر جا باشد) + مودال بانک مدیریت ساده‌تر شد (انتخاب دسته داخل فرم + گزینه «همه محل‌ها»).
- **WHY:** درخواست مالک — تقویم شمسی برای کاربر فارسی‌زبان؛ جستجوی سریع همه‌محلی؛ افزودن آسان حرکت دلخواه.
- **TESTS:** `tool/smoke-jalali.js` ✅ (۲۵ چک + ۲۰۰۰ roundtrip تصادفی؛ انکرهای ۱۴۰۳/۱۴۰۵) • `test:ui` ✅ • `test:terminology` ✅ • `tool/smoke-program-builder.js` ✅ ۲۸/۲۸ • ۶ سوئیت ✅ • e2e ✅ کامل (پس از حذف حرکت تستی و ری‌استارت طبق KI-010) • API زنده: جستجوی سراسری/نرمال‌سازی (سكوات→۱۲۷ نتیجه)/هر دو محل/POST دستی ✅
- **RESULT:** **PASS**
- **KNOWN SIDE EFFECTS:** مسیر دسته+جستجو فقط LIKE نرمال‌شده دارد (بدون رتبه‌بندی JS) — کفایت عملی دارد؛ ورودی تاریخ شمسی متنی است (نه تقویم بازشو) — ویجت تقویم گرافیکی = T-16.

### Task 5 — BR-14: کاتالوگ ۱۲ سیستم تمرینی + سقف حرکت + بانک چندانتخابی + حذفِ «حذف روز»

- **FILES CHANGED:** `public/program-builder.js` (کاتالوگ ۱۲گانه، انتخابگر سیستم، پیشرفت/سقف، بانک بازماندن، حذف data-del-day)، `public/program-builder.css` (انتخابگر/چیپ‌ها/زمینه بانک)، `src/validation.js` (لیست سفید ۱–۱۲ + ۷ type جدید)، `tool/smoke-program-builder.js` (جدید — رگرسیون داخلی UI)، مستندات.
- **WHAT CHANGED:**
  1. کاتالوگ ۱۲ سیستم با نام‌های دقیق مالک؛ **idهای ۱–۵ تاریخی حفظ شدند** (1=معمولی، 2=سوپر، 3=تری، 4=جاینت، 5=دراپ) و idهای 6–12 جدیدند؛ ترتیب نمایش = ترتیب مالک.
  2. «افزودن سیستم تمرینی» → انتخابگر مودال ۱۲گانه (portal به body)؛ روز جدید/روزهای ارزیابی بدون سیستم پیش‌فرض.
  3. سقف حرکت واقعی: افزودن حرکت بیش از N سیستم غیرممکن؛ نشان «n از m حرکت» + «تکمیل»؛ دکمه «افزودن حرکات تمرینی (k باقی‌مانده)» فقط تا تکمیل.
  4. بانک حرکات: بعد از انتخاب **بسته نمی‌شود**؛ زمینه سیستم + شمارنده «حرکات انتخاب شده: n از m» + پیام تکمیل + دکمه «اتمام و بستن»؛ در حالت تکمیل آیتم‌ها غیرفعال.
  5. «حذف روز» به‌طور کامل از UI حذف شد (دکمه + بایندینگ)؛ کپی/جابجایی روز باقی است.
  6. بک‌اند: فقط لیست سفید validation گسترش یافت (افزودنی) — بدون مایگریشن، بدون تغییر API.
- **WHY:** درخواست دقیق مالک (BR-14) — هم‌ترازی وب با فلوی موبایل؛ تصمیم معوق KI-002/T-01.
- **TESTS (اجرا شده):** validation ۱۲ سیستم ✅ (id 13 و type ناشناخته رد) • `test:ui` ✅ • `test:terminology` ✅ • `test:e2e` ✅ کامل (سرور تازه) • ۸ سوئیت غیرسروری ✅ • **smoke جدید ۲۸/۲۸ ✅** شامل ماتریس ۱۲ سیستم (1,1)(6,1)(5,1)(7,1)(8,1)(9,1)(2,2)(10,2)(3,3)(11,3)(4,4)(12,5) + بازماندن بانک + بستن دستی + ترتیب + نبود حذف روز + باز شدن برنامه قدیمی.
- **RESULT:** **PASS**
- **KNOWN SIDE EFFECTS / LIMITS:**
  - کاتالوگ در فرانت‌اند است (ثابت) نه جدول DB — برای سینک/اندروید باید به سرور منتقل شود (T-14).
  - سقف حرکت فقط UI است؛ سرور تعداد را اعتبارسنجی نمی‌کند (عمدی — برنامه‌های قدیمی با تعداد متفاوت باید ذخیره شوند).
  - رفتار اختصاصی ست‌ساز هر سیستم (مثل ۷ ست خودکار FST7) وجود ندارد و ساخته نشد — محدودیت مستند.

### Task 4 — بازطراحی UI صفحه «ساخت برنامه تمرینی» (Program Builder)

- **FILES CHANGED:** `public/program-builder.js` (root/renderDays بازنویسی؛ وصله‌های bindDayEvents/bindMainEvents/updateVolume)، `public/program-builder.css` (افزودن بخش REDESIGN v2). **هیچ فایل بک‌اند/DB/API تغییر نکرد.**
- **WHAT CHANGED:**
  1. نوار بالای چسبان: عنوان زنده + شاگرد + شمارش حجم + نشان «⚠️ ذخیره نشده» + بازگشت.
  2. فرم مشخصات → پنل جمع‌شونده شماره‌دار «۱) مشخصات برنامه و شاگرد» (details؛ همه IDهای فیلد حفظ شد).
  3. روزها → چیپ‌رِیل «روز ۱، روز ۲، …» فقط روزِ فعال رندر می‌شود (activeDayIdx) + دکمه‌های «＋ روز / 🌙 استراحت / 📋 کپی آخرین» در انتهای ریل؛ روز جدید خودکار فعال می‌شود.
  4. عملیات ثانویه به منوهای زمینه‌ای منتقل شد: منوی «⚙️ تنظیمات روز» (کپی/بالا/پایین/حذف) و منوی «⋮» هر حرکت (بالا/پایین/حذف) و منوی «⋮» نوار ذخیره (JSON/آمار/لیست).
  5. کارت حرکت دووضعیت شد: حالت جمع‌شده (تصویر+نام+خلاصه ست‌ها) / باز‌شده (توضیح+جدول ست‌ها+افزودن ست) — حرکت تازه‌اضافه خودکار باز می‌شود.
  6. نوار ذخیره چسبان: dirty + حجم + [ذخیره و بازگشت][ذخیره پیش‌نویس][ذخیره و اختصاص (سبز)] + ⋮.
  7. حذف از نمای اصلی: ۵ دکمه stub بدون عملکرد واقعی (کالری/دستیارها/ذخیره نمونه/بارگذاری نمونه/برنامه قبلی) — بایندینگ‌هایشان هم حذف شد؛ «برنامه قبلی» با «لیست برنامه‌ها» (در منوی ⋮) هم‌ارز بود.
  8. dirty=true/false در ۳۰ نقطه → setDirty() با refreshDirtyUI؛ هشدار حجم بالا به نوار ذخیره منتقل شد.
- **WHY:** صفحه شلوغ و بدون سلسله‌مراتب بود؛ درخواست مالک: UX ساده‌تر بدون شکستن منطق.
- **TESTS (اجرا شده):** `node --check` ✅ • cross-check ID/data-attr ✅ • `test:ui` ✅ • `test:terminology` ✅ • ری‌استارت سرور → `test:e2e` ✅ کامل • ۶ سوئیت غیرسروری ✅ • GET صفحه با کوکی مربی 200 ✅ • **smoke رندر DOM با استاب** (رندر برنامه ۲ روزه/سوپرست/۲ حرکت/۳ ست) ✅ ۱۰/۱۰.
- **RESULT:** **PASS**
- **KNOWN SIDE EFFECTS / LIMITS:**
  - فقط روز فعال در DOM است (ورودی‌های بقیه روزها رندر نمی‌شوند) — مدل داده در حافظه است؛ ورودی فوکوس‌شده هنگام سوییچ با blur قبل از click مقدارش ثبت می‌شود (onchange).
  - `loadHistory()/window.loadProgramToCurrent` کد مرده قدیمی (عنصر historyList هرگز وجود نداشت) دست‌نخورده ماند.
  - سیستم‌های تمرینی به‌عمد دست نخورد (KI-002 هنوز باز — تصمیم مالک لازم).
  - تست مرورگر واقعی (پخش زنده) موجود نیست — راستی‌آزمایی با گارد استاتیک + e2e سطح API + smoke استاب (KI-011 جدید).

### Task 2 — ایجاد سیستم مستندات و پیگیری دائمی پروژه

- **FILES CREATED:**
  - `docs/project-tracking/PROJECT-CONTEXT.md` (منبع حقیقت فنی دائمی — ۱۵ بخش)
  - `docs/project-tracking/CHANGELOG.md` (همین فایل)
  - `docs/project-tracking/TODO.md`
  - `docs/project-tracking/TECHNICAL-DECISIONS.md`
  - `docs/project-tracking/KNOWN-ISSUES.md`
  - `docs/project-tracking/archive/2026-08-24-project-report-fa.md` (آرشیو گزارش یک‌باره قبلی؛ منبع حقیقت = PROJECT-CONTEXT)
- **FILES CHANGED:** هیچ فایل کد تغییر نکرد.
- **WHAT CHANGED:** ساختار `docs/project-tracking/` به مخزن اضافه شد؛ گزارش فارسی قبلی از ریشه workspace به داخل مخزن آرشیو شد (با هدر «نسخه آرشیوی»).
- **WHY:** ایجاد حافظه فنی دائمی برای ایجنت‌های آینده — درخواست صریح مالک.
- **TESTS:** اجرا شد (2026-08-24): `npm test` → ✅ همه ۹ سوئیت پاس (e2e با سرور در حال اجرا). تعدیل: در این تسک تغییری در کد نبود؛ تست برای تأیید وضعیت پایه اجرا شد.
- **RESULT:** **PASS** — مستندات بر اساس ممیزی واقعی کد (نه حدس) نوشته شد؛ ادعاهای غیرقابل‌راستی‌آزمایی با برچسب `NOT VERIFIED` علامت خوردند.
- **KNOWN SIDE EFFECTS:**
  - اصلاح یک خطای گزارش قبلی: «۴۱ جدول» → عدد صحیح **۳۹ جدول** (بدون جدول‌های سیستمی sqlite).
  - شکاف ۵ سیستم وب ↔ ۱۲ سیستم موبایل به‌عنوان GAP رسمی در §7 PROJECT-CONTEXT ثبت شد (تغییری در کد داده نشد — طبق قاعده «تغییر یک‌طرفه ممنوع»).
- **NOTES:** از این پس به‌روزرسانی این پوشه بخش الزامی چرخه توسعه است (بنگرید PROJECT-CONTEXT §فرایند).

### Task 1 — ابزار کمکی نگاشت حرکات (جلسه قبل، همین روز)

- **FILES CREATED:** `tool/program-helper.py` (جست‌وجوی بانک حرکات + تولید مسیر ویدیوی `exercises_organized/…/[ID]_[نام].mp4`)
- **WHAT CHANGED:** اسکریپت CLI خالص Python بدون وابستگی؛ فقط خواندن `data-source/exercises_data.json`.
- **WHY:** تضمین اینکه هیچ حرکت غیرواقعی در پیشنهاد برنامه‌ها استفاده نشود (BR-5).
- **TESTS:** اجرای دستی چند کوئری (info/list/search) — پاس. جزو `npm test` نیست.
- **RESULT:** PASS (ابزار کمکی؛ پوشش تست خودکار ندارد → KNOWN-ISSUES KI-008).
- **KNOWN SIDE EFFECTS:** —

### Task 3 — ممیزی نهایی سیستم مستندات (FINAL AUDIT)

- **FILES CHANGED:** `PROJECT-CONTEXT.md`, `TECHNICAL-DECISIONS.md`, `KNOWN-ISSUES.md`, `TODO.md`, `archive/2026-08-24-project-report-fa.md`, `CHANGELOG.md`
- **WHAT CHANGED:**
  1. طبق قاعده جدید مالک، تکنیک «تقسیم واژه» برای ارجاع به «اصطلاح ممنوع پروژه» حذف شد (۷ مورد)؛ همه ارجاع‌ها به عبارت استاندارد «اصطلاح ممنوع پروژه» تغییر کرد. قاعده جدید در §1 PROJECT-CONTEXT و §15-2 قید شد.
  2. رفع ناسازگاری واقعی مستندات↔کد (کشف ممیزی): ستون‌های `equipment/difficulty/description/name_en` در جدول exercises **موجود ولی خالی‌اند** (۰ مقدار پرشده) — قبلاً «وجود ندارد» نوشته شده بود؛ به `PARTIAL` اصلاح شد و TODO T-04 به‌روز شد (مایگریشن لازم نیست).
  3. رفع خرابی‌های تایپی باقی‌مانده (گیوم دوتایی، واژه غیرفارسی اشتباهی در KI-009).
  4. راستی‌آزمایی عددهای کلیدی مستندات با DB زنده: ۲۷۰۷ حرکت (۱۹۱۵ active/۷۹۲ archived)، ۳۹ جدول، ۲۲ مایگریشن، ۱۳ دسته/۲۳ زیردسته، gym ۱۹۴۲/home ۷۶۵ — همه مطابق مستندات ✅.
  5. اسکن اسرار: مقدار `data/coach-access-token` و هیچ الگوی کلید/رمزی در مستندات نیست ✅.
- **WHY:** درخواست ممیزی نهایی مالک — اطمینان از قابلیت اطمینان مستندات برای ایجنت‌های آینده.
- **TESTS:** `node tests/terminology-regression.js` ✅ PASS (پس از اصلاحات) • `npm test` کامل: اجرای اول ✅ ۹/۹ سوئیت (با سرور در حال اجرا روی 3020). اجرای دومِ بلافاصله فقط در e2e با **429 RATE_LIMITED** شکست خورد — ریشه‌یابی و ثبت شد: **KI-010** (باکت در-حافظه rate-limiter بین اجراها روی همان پروسه سرور باقی می‌ماند؛ خودِ e2e در انتها باکت را عمداً پر می‌کند). **ری‌استارت سرور → e2e ✅ PASS کامل** (راستی‌آزمایی شد). جزء کد محصول تغییری نکرد.
- **RESULT:** **PASS** — ممیزی: «PASS WITH WARNINGS» قبول نشد؛ همه ناسازگاری‌های یافته در همان جلسه رفع شد (هشدارهای باقی‌مانده فقط موارد OPEN شناخته‌شده در KNOWN-ISSUES، شامل KI-010 جدید).
- **KNOWN SIDE EFFECTS:** —

---

## الگوی مدخل‌های بعدی (Template)

```markdown
## YYYY-MM-DD

### Task
<عنوان>

### Files Changed
- <مسیر>

### What changed
<خلاصه فنی>

### Why
<دلیل>

### Tests
<چه اجرا شد + نتیجه واقعی؛ اگر اجرا نشد صریحاً بنویس>

### Result
PASS / PARTIAL / FAILED

### Known side effects
<…>
```

---

## ۱۴۰۴/۰۶/۱۱ — Task 18b: همهٔ مسیرهای private داده از یک مرجع (رو به Volume)

- **SCOPE (ادامهٔ Task 18؛ بدون endpoint/مایگریشن جدید):** بسته‌شدن ریسک «رفتَن فایل خصوصی بیرون Volume».
- **CHANGE:** ماژول جدید `src/storage-paths.js` (فقط resolve/cleanup path، بدون اثر جانبی): `dataDir = YASNAFIT_DATA_DIR || RAILWAY_VOLUME_MOUNT_PATH || <repo>/data`، `backupDir = YASNAFIT_BACKUP_DIR || (روی کانتینر داخل dataDir) || <repo>/backups`، + `assessmentsDir`/`documentsDir` و helper مشترک `ensurePrivateDir` (mkdir 0700). مصرف‌کننده‌ها: `src/database.js`، `src/upload-service.js`، `src/assessment-document-service.js`، `src/student-service.js`، `src/migrations.js`. افزودن `DEPLOYMENT.md` §۹.۶ = دستورهای Railway CLI (`up`، `volume add --mount-path`، `variables --set`، `domain`، `logs`، `ssh`، `volume browse` برای upload/download فایل داخل Volume).
- **REASON:** در کانتینر Railway فقط مسیر Volume persisted است؛ `backups/` در Task 18 اصلاح شد ولی `data/assessments` و `data/assessment-documents` (عکس‌ها و PDFهای خصوصی) هنوز به `<repo>/data` hardcode بودند و با هر deploy پاک می‌شدند.
- **FILES:** `src/storage-paths.js` (new)، `src/database.js`، `src/upload-service.js`، `src/assessment-document-service.js`، `src/student-service.js`، `src/migrations.js`، `tests/deployment-hardening-regression.js`، `DEPLOYMENT.md`، `mahdi hellp.md`.
- **TESTS:** `node --check` همهٔ فایل‌های دست‌خورده ✅ • `npm run test:deployment` = `{"ok":true, … "railway_config":true}` ✅ • `npm test` = **۱۸/۱۸ ✅** • شبیه‌سازی Volume (`RAILWAY_VOLUME_MOUNT_PATH=/tmp/yasna-vol`) ⇒ دیتابیس + `assessments/` + `backups/` داخل Volume با `drwx------` و seed ۲۷۰۷ حرکت ✅؛ بدون env، مسیرهای قبلی دقیقاً حفظ شد ✅ (e2e روی حالت Volume در مرحلهٔ provisioning مربی 409 می‌دهد چون مسیر DB در تست hardcode است → پیشنهاد اصلاح در §۱۴ حافظه).

---

## ۱۴۰۴/۰۶/۱۱ — Task 19: اولین attempt دپلوی روی Railway + رفع همان دلیل شکست

- **REPORTED (لاگ واقعی مهدی، 2026-09-02 ساعت 21:55):** سرویس در Railway با builder **Railpack** اجرا شد و خطا داد: `⚠ Script start.sh not found` و `✖ Railpack could not determine how to build the app` — درختی که تحلیل شده فقط `./README.md` و `./login-hero.png` بود.
- **CAUSE (تأییدشده با `git ls-tree origin/main`):** سرویس **شاخهٔ `main`** را build می‌کرد. `main` در این مخزن یک شاخهٔ فقط-دارایی است (README + تصویر لاگین) و `package.json`/`server.js`/`railway.json` ندارد؛ پس نه کدی برای اجرا هست و نه config-as-code برای انتخاب builder. سمت برنامه (شاخهٔ `arena/01a0618b-yasnafit` = `0896bba`) سالم است.
- **CHANGE:** commit شدن **`package-lock.json`** (پروژه صفر وابستگی دارد ⇒ قفل کوچک و بی‌ریسک) تا هر builder — Nixpacks یا Railpack — پروژهٔ Node را قطعی تشخیص بدهد؛ افزودن **`DEPLOYMENT.md` §۹.۷ «عیب‌یابی: اولین build چرا شکست خورد؟»** (جدول «متن لاگ ← علت ← کار» شامل همان دو خط خطای بالا، `NIXPACKS_NODE_VERSION`، `RAILWAY_RUN_UID`، و «Volume وصل نیست»؛ همچنین نکتهٔ اینکه تنظیم builder در داشبورد بر `railway.json` اولویت دارد)؛ هشدار در §۹.۱ بند ۱ که `main` خالی است؛ به‌روزرسانی §۹.۴ دربارهٔ انتقال داده با `railway volume browse` (به‌جای ساخت endpoint restore).
- **GUARD:** `tests/deployment-hardening-regression.js` — commit بودن `package-lock.json` بررسی می‌شود (کنار گارد track بودن `data-source/exercises_data.json`).
- **NO-CODE:** هیچ تغییری در `server.js`/`src/**` لازم نبود؛ نه endpoint جدید، نه مایگریشن، نه تغییر `version`.
- **OPEN (منتظر تأیید مالک):** `PR #2` الان `MERGEABLE` و `mergeStateStatus: CLEAN` است ( قبلاً dirty گزارش شده بود) و `main` ancestor شاخهٔ ماست ⇒ merge fast-forward-able. merge فقط با دستور مالک انجام می‌شود؛ تا آن موقع یا شاخهٔ deploy سرویس را روی `arena/01a0618b-yasnafit` بگذارد.
- **TESTS:** `npm run test:deployment` = `{"ok":true,…,"railway_config":true}` ✅ • `npm test` = **۱۸/۱۸ ✅** • `npm ci --dry-run` با قفل جدید بدون خطا ✅

---

## ۱۴۰۴/۰۶/۱۱ — Task 20: بازیابی کلید Google Authenticator روی سرور ابری

- **REPORTED (مهدی، بعد از بالا آمدن `yasnafit-production.up.railway.app`):** «سایت بالا اومد، ثبت‌نام هم کردم، ولی کد قبلی گوگل authenticator کار نمی‌کنه».
- **DIAGNOSIS (از کد + بررسی زندهٔ endpoint عمومی):** باگ نیست، انتظار معماری است. کلید TOTP در `coaches.totp_secret` **همان دیتابیس** است؛ `setupCoach()` آن را `NULL` می‌کند و `ensureCoachAuthenticator()` در اولین restart کلید تازه می‌سازد، `totp_confirmed_at` را ست می‌کند و کلید را در `<mount>/coach-authenticator.txt` می‌نویسد. دیتابیس Railway تازه بود ⇒ کلید گوشی (نسخهٔ لوکال) هیچ‌وقت مطابقت نمی‌کند. `GET /api/coach/auth/status` روی سرور زنده: `setup_required:false، totp_confirmed:true، mail_configured:false` — سازگار با همین مسیر. هیچ route ای برای نمایش/چرخش کلید عمداً وجود ندارد.
- **CHANGE:** (۱) `scripts/provision-coach-totp.js` از `src/storage-paths.js` استفاده می‌کند (روی container کلید را برای Volume می‌سازد نه `<repo>/data`)، اگر فایل دیتابیس نبود **رد می‌کند** تا کلید بی‌فایده روی دیتابیس تازه نسازد، مسیر DB را چاپ می‌کند، و در محیط کانتینر (`RAILWAY_VOLUME_MOUNT_PATH` ست باشد) کلید خام را در stdout چاپ نمی‌کند؛ (۲) متغیر اضطراری **`YASNAFIT_REVEAL_AUTHENTICATOR_KEY`** — فقط وقتی ست باشد کلید فعلی یک‌بار در لاگ چاپ می‌شود و پیام «همین الان پاکش کنید» دارد؛ accessor جدید `currentAuthenticatorEnrollment(db)` که **هیچ فایلی نمی‌نویسد** (تا پاک‌شدن کلید بعد از اولین ورود موفق بی‌اثر نشود)؛ (۳) `DEPLOYMENT.md` §۹.۸ «اگر کد Google Authenticator کار نکرد»: سه راه بازیابی + شش علت شیوع‌یافته (کلید اشتباه، قفل ۳×/۱۵ دقیقه، عمر ۵ دقیقهٔ چلنج، کد یک‌بارمصرف، ±۳۰ ثانیه ساعت، ورودی تکراری در اپ) و اصلاح ادعای نادرست §۹.۳ («کلید در لاگ هست» — نیست).
- **GUARDS (با تست جهش بررسی شد: حذف گیت ⇒ fail):** `test:deployment` — off-by-default بودن `REVEAL_AUTHENTICATOR_KEY`، گیت‌شدن چاپ در `server.js`، وجود `coach-authenticator.txt` و `YASNAFIT_REVEAL_AUTHENTICATOR_KEY` در DEPLOYMENT، storage-path بودن اسکریپت پروویژن و ردّ `existsSync(dbPath)`، و نبود `path.join(__dirname,'..','data')` در آن.
- **FILES:** `scripts/provision-coach-totp.js`، `src/request-security.js`، `src/coach-auth-service.js` (export `AUTHENTICATOR_FILE` + `currentAuthenticatorEnrollment`)، `server.js`، `tests/deployment-hardening-regression.js`، `DEPLOYMENT.md`، `mahdi hellp.md`. بدون endpoint جدید، بدون مایگریشن، بدون تغییر `version`.
- **TESTS:** `node --check` همه ✅ • `node tests/deployment-hardening-regression.js` → `ok:true` ✅ (و با میوتیشن: MUTANT_EXIT=1، RESTORED_EXIT=0) • `npm test` = **۱۸/۱۸ ✅** • دود محلی روی کپی دیتابیس: اسکریپت در حالت عادی کلید را چاپ و در حالت کانتینر مخفی می‌کند، فایل `coach-authenticator.txt` نوشته شد و کدِ تولیدشده از همان کلید با `totp.verify` → `{ok:true}` پاس شد ✅ • در `data/` سندباکس یک حساب مربی تستی ساخته شد (فقط سندباکس؛ gitignored).

---

## ۱۴۰۴/۰۶/۱۱ — Task 21: کلید تست — رد کردن **موقت** تأیید دو مرحله‌ای مربی

- **REQUESTED (مهدی):** «کد گوگل authenticator رو موقت حذف کن تا برنامه رو تست کنم».
- **DECISION:** کلید 2FA **حذف/ریست نشد** (هم چرخش کلید هم پاک‌کردن `totp_secret` دادهٔ احراز هویت را خراب می‌کرد و بعد از تست باید دوباره enrolled می‌شد). به‌جاش یک گریزِ صریح، opt-in و موقت ساخته شد که فقط **مرحلهٔ کد** را رد می‌کند: `YASNAFIT_ALLOW_2FA_SKIP` (الگوی نام‌گذاری مثل `YASNAFIT_ALLOW_REMOTE_SETUP`؛ `truthy` فقط `1|true|yes|on` را روشن می‌شمارد، پس مقدار تهی = خاموش).
- **CHANGE:** `startLogin(db,{…,skipTotp})` ⇒ اگر پرچم روشن باشد، بعد از **بررسی موفق رمز عبور**، نشست ۱۲ساعته ساخته می‌شود (`coach_sessions`)، `clearFailures` و `last_login_at` به‌روز می‌شود و رویداد `login_success` با `detail='two_factor_skipped'` ثبت می‌شود؛ پاسخ `POST /api/coach/auth/login` ⇒ `{ok:true,next:'/coach/dashboard',two_factor_skipped:true,coach,…}` با کوکی `yasnafit_coach_session` (بدون چلنج OTP). `public/coach-login.js` حالا `data.next || '/coach/2fa'` را دنبال می‌کند (بدون این، لاگین رد شده به صفحهٔ کد می‌پرید). هشدار در استارت لاگ و فیلد `two_factor_skipped` در `/api/health?detailed=1` (فقط با نشست مربی).
- **INVARIANTS (تأیید‌شده با تست):** رمز غلط همان `INVALID_CREDENTIALS` را می‌دهد حتی با پرچم روشن ⇒ این متغیر رمز را رد نمی‌کند؛ `totp_secret` و `totp_confirmed_at` **دست‌نخورده** می‌مانند (پاک‌کردن متغیر = برگشتن به 2FA با همان کلید)؛ مسیر احراز هویت شاگرد (`src/student-auth-service.js`) هیچ ارجاعی به `skipTotp` ندارد؛ کوکی‌ها، `SameSite=Strict`، rate limit ها و CSP بی‌تغییر؛ بدون مایگریشن، بدون endpoint جدید، بدون تغییر `version`.
- **FILES:** `src/request-security.js`، `src/coach-auth-service.js`، `server.js`، `public/coach-login.js`، `tests/coach-auth-regression.js` (۶ assert جدید روی رفتار skip)، `tests/deployment-hardening-regression.js` (۵ گارد + توکن مستندات)، `DEPLOYMENT.md` §۹.۹ و جدول Variables.
- **TESTS:** `node --check` ✅ • `npm test` = **۱۸/۱۸ ✅** • `npm run test:e2e` = exit 0 ✅ (همچنان `next === '/coach/2fa'` را در حالت پیش‌فرض تأیید می‌کند) • **تست جهش روی خودِ گاردها:** حذف آرگومان `skipTotp` ⇒ fail با پیام «POST /api/coach/auth/login is not honoring the 2FA skip flag»؛ hardcode‌کردن مسیر کلاینت ⇒ fail؛ `YASNAFIT_ALLOW_2FA_SKIP=1` در محیط تست ⇒ fail («must be off unless explicitly requested»)؛ هر سه بعد از بازگردانی سبز ✅ • **دود زنده:** سرور بدون flag → `Set-Cookie: yasnafit_coach_challenge…` + `next:'/coach/2fa'`؛ با flag → `Set-Cookie: yasnafit_coach_session…` + `next:'/coach/dashboard'`، `/api/build` با آن کوکی `200`، `/api/health?detailed=1` → `two_factor_skipped:true` ✅
- **NOTE:** در سندباکس، پلت‌فرم یک‌بار `data/` (gitignored) را پاک کرد و DB dev از نو ساخته شد؛ برای سازگاری با `tests/e2e-workflow.js` حساب مربی dev سندباکس با رمز پیش‌فرض همان تست بازسازی شد (فقط سندباکس؛ هیچ اثری روی ماشین مهدی یا Railway).

---

## ۱۴۰۴/۰۶/۱۱ — انتشار: merge PR #2 به `main`

- **ACTION (با تأیید صریح مالک):** `gh pr merge 2 --merge` → `main` = **`50aaa53`** («Merge pull request #2 from cryptojavan17-hub/arena/01a0618b-yasnafit»، 2026-09-02 19:40 UTC). قبل از merge، توضیح کامل PR (۴ دسته تغییر + نتایج تست + ۶ نکتهٔ pre-merge) بازنویسی شد؛ `mergeable: MERGEABLE` و `mergeStateStatus: CLEAN`.
- **VERIFIED:** `git diff --stat origin/main HEAD` **خالی** ⇒ محتوای `main` بایت‌به‌بایت همان `5cc8a17` تست‌شده است (۱۲۲ فایل، ۷۱٬۳۸۷ خط اضافه / ۱ حذف) و `login-hero.png` ریشه با `R100` به `public/login-hero.png` رفته. `npm test` روی `50aaa53` = **۱۸/۱۸ ✅**.
- **CONSEQUENCE (مهم‌ترین اثر):**KI-014 بسته شد — از این بعد **deploy از `main` هم build می‌شود**، چون `package.json`/`server.js`/`railway.json`/`package-lock.json` روی `main` هستند (قبلاً `main` فقط README + تصویر لاگین بود و Railpack می‌شکست). `DEPLOYMENT.md` §۹.۱ و §۹.۷ و `mahdi hellp.md` (§3/§5/§6/§11/§14/§16) با همین واقعیت به‌روز شدند.
- **STILL OPEN:** اتصال سرویس به `main` (در داشبورد)، **Attach Volume**، سه متغیر پروداکشن، پاک‌کردن `YASNAFIT_ALLOW_2FA_SKIP` بعد از تست، تنظیم `/coach/mail`، و `git pull --ff-only` روی ویندوز. `version` همچنان `0.9.1` (عمداً).

---

## ۱۴۰۵/۰۶/۱۲ — Task 22: پشتیبانی Volume برای عکس‌های حرکات (Railway media)

- **REPORTED (مهدی):** ۱۸۸۸ عکس حرکت (≈۵۷MB) روی Volume در `/app/data/media/images/exercises/imported/{ID}.png|jpg` قرار گرفته (`ls | wc -l` = 1888؛ `4.png` موجود)، ولی `/api/exercise-image/{id}` روی production همیشه `blank-white.svg` می‌دهد چون کد فقط مسیر ریپو را می‌خواند. تصمیم مالک: **ویدیوها منتقل نمی‌شوند** (حجم زیاد)؛ این تسک فقط عکس‌هاست.
- **CHANGE:** (۱) `src/storage-paths.js` ⇒ `mediaDir` (= `YASNAFIT_MEDIA_DIR` یا `<dataDir>/media`) و `exerciseImagesDir` (= `<mediaDir>/images/exercises/imported`) و `ensureMediaDirs()` با mode `0700` که در boot صدا زده می‌شود؛ با Volume روی `/app/data` دقیقاً همان مسیر آپلودشده حاصل می‌شود. (۲) `server.js` ⇒ هندلر `/api/exercise-image/{id}` بعد از ریپو، Volume را هم می‌خواند: پروب مستقیم O(1) برای `{id}.png|jpg|jpeg|gif|webp` + جست‌وجوی بازگشتی بر اساس `original_id` (ترتیب: ریپو → Volume → organized → public root) و گارد مرکزی `allowedImageRoot` (public | data-source | mediaDir). (۳) مسیرهای استاتیک `/files/exercise/*` و `/assets/images/exercises/*` دو پروب Volume گرفتند — **فقط برای پسوندهای تصویری**؛ مسیر ویدیو دست‌نخورده (۴۰۴ دقیق). (۴) لاگ boot: `[Media] تصاویر حرکات: N فایل (Volume: X | ریپو: Y) · ریشه: …` با هشدار وقتی صفر است.
- **GUARDS (۸ گارد جدید در `test:deployment`، جهش‌سنجی‌شده):** وجود `YASNAFIT_MEDIA_DIR`، شکل `exerciseImagesDir`، `ensureMediaDirs`، ارجاع handler و boot به `storagePaths.exerciseImagesDir`/`ensureMediaDirs()`، متن لاگ `[Media]`، گارد `isSafePath(storagePaths.mediaDir)` و اولویت ریپو بر Volume؛ جهش (حذف ارجاع Volume در `server.js`) ⇒ **MUTANT_EXIT=1**، بازگردانی ⇒ ۰.
- **INVARIANTS:** رفتار لوکال/ویندوز بدون env دقیقاً مثل قبل (ریپو اول)؛ بدون مایگریشن؛ بدون endpoint جدید؛ `version` همان `0.9.1`؛ هیچ مسیر ویدیویی به Volume اضافه نشده؛ روی لوکال فقط پوشهٔ خالی `data/media/` ساخته می‌شود (gitignored).
- **FILES:** `src/storage-paths.js`, `server.js`, `tests/deployment-hardening-regression.js`, `DEPLOYMENT.md` (§۹.۱۰), `docs/project-tracking/KNOWN-ISSUES.md` (KI-015), `mahdi hellp.md`.
- **TESTS:** `node --check` هر ۳ فایل ✅ • `npm test` = **۱۸/۱۸ ✅** • تست زنده با Volume ساختگی (`RAILWAY_VOLUME_MOUNT_PATH=/tmp/yasna-media` + `4.png` و `2707.jpg`): لاگ `[Media] … (Volume: 2 | ریپو: 0)` ✅ • `GET /api/exercise-image/4` → ۲۰۰ `image/png` ✅ • `/2707` → ۲۰۰ `image/jpeg` ✅ • id ناموجود → ۲۰۰ blank svg ✅ • `GET /assets/images/exercises/imported/4.png` → ۲۰۰ `image/png` (Volume) ✅ • `GET /files/exercise/videos/4.mp4` → ۴۰۴ ✅.
- **AFTER MERGE (مالک):** redeploy روی Railway؛ انتظار: `railway logs | grep Media` → `Volume: 1888` و `curl https://yasnafit-production.up.railway.app/api/exercise-image/4` → ۲۰۰ `image/png|jpeg` (DEPLOYMENT.md §۹.۱۰).

---

## ۱۴۰۵/۰۶/۱۲ — Task 23: رفع دکمه‌های مردهٔ «ویرایش» و کارت تکراری در بانک برنامه‌ها (CSP)

- **REPORTED (مهدی):** در صفحهٔ «بانک برنامه‌ها • بازطراحی شده» (برنامه‌های تمرینی): (۱) دکمهٔ «✏️ ویرایش» اصلاً کار نمی‌کند؛ (۲) هر تغییر برنامه به‌جای آپدیت همان کارت، **یک کارت جدید** می‌سازد — «باید همه تغییرات داخل یک کارت باشه».
- **ROOT CAUSE (یک ریشه برای هر دو):** CSP سراسری `script-src 'self'` (از Task 16) ویژگی‌های رویداد درون‌خطی (`onclick="…"`) در HTML را در مرورگر **بلاک** می‌کند. گارد تست فقط `public/*.html` را اسکن می‌کرد، اما این دکمه‌ها داخل رشته‌های قالب `public/*.js` تزریق می‌شدند — نقطهٔ کور. چون «ویرایش» مرده بود، تنها راه تغییر برنامه ساخت دوباره از فرم خالی بود ⇒ `saveProgram` بدون `currentProgram.id` همیشه `POST` (ایجاد) می‌زد ⇒ کارت جدید به‌ازای هر تغییر. منطق PUT سمت سرور (`PUT /api/training-programs/{id}`) از ابتدا درست بود.
- **CHANGE:** همهٔ ویژگی‌های رویداد درون‌خطیِ تزریقی در `public/*.js` حذف و با الگوی CSP-امن «اَتریبیوت `data-*` + بایندینگ JS بعد از تزریق» جایگزین شد — ۹ دکمه: ویرایش/ساخت‌برنامه (تمرینی)، ویرایش/ساخت (غذایی)، بازگشت (بیلدر + تایم‌لاین)، بارگزاری (تاریخچهٔ برنامه‌ها)، تاریخچهٔ شاگرد، بررسی ارزیابی، ویرایش برنامه (تایم‌لاین)، تلاش مجدد (بانک حرکات)، تلاش دوباره (صفحهٔ خطای شاگرد)، بازگشت (پروندهٔ یافت‌نشده)؛ و ۱۱ fallback رسانه: `onerror` تصاویر → `data-fallback="/blank-white.svg"` و ویدیو → `data-fallback-class="no-video"` با یک listener سراسری capture-phase در ابتدای `public/app.js` و `public/student-app.js` (خطاهای بارگذاری منبع bubble نمی‌شوند؛ capture آن‌ها را می‌گیرد و جایی که کانتینر به DOM وصل باشد — از جمله پیش‌نمایش PDF — کار می‌کند).
- **GUARD:** `tests/deployment-hardening-regression.js` حالا `public/*.js` را هم با `/\son[a-z]+\s*=\s*["'\`]/i` اسکن می‌کند (نقطهٔ کور بسته شد؛ خروجی `js_modules_scanned_for_inline_handlers: 19`). **جهش‌سنجی:** افزودن ` onclick="…"` دوباره به program-builder ⇒ exit 1؛ بازگردانی ⇒ exit 0.
- **INVARIANTS:** بدون تغییر API/مایگریشن/`version` (0.9.1)؛ DOM0 property bindingها (`el.onclick=`) مجازماند و دست‌نخورده؛ ظاهر و متن دکمه‌ها بدون تغییر؛ fallback حلقهٔ بی‌نهایت ندارد (`fallbackDone`).
- **FILES:** `public/program-builder.js`, `public/diet-programs.js`, `public/coach-submissions.js`, `public/students.js`, `public/exercises.js`, `public/student-app.js`, `public/app.js`, `public/ai-copilot.js`, `public/program-pdf.js`, `tests/deployment-hardening-regression.js`, `mahdi hellp.md`, این فایل.
- **TESTS:** `node --check` ۱۱ فایل ✅ • `npm test` = **۱۸/۱۸ ✅** • جهش گارد ⇒ MUTANT_EXIT=1 ✅ • grep نهایی: صفر هندلر صفحتی باقی‌مانده در `public/*.js` ✅.
- **VERIFY AFTER DEPLOY (مالک):** در بانک برنامه‌ها دکمهٔ «✏️ ویرایش» باید فرم را با همان برنامه باز کند و «ذخیره» باید همان کارت را آپدیت کند (نه کارت جدید).
