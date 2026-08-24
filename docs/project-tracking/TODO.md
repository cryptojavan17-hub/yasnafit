# YasnaFit — TODO (اولویت‌بندی‌شده)

> اولویت‌ها: **P0**=بحرانی • **P1**=بالا • **P2**=متوسط • **P3**=کم
> هر تسک: عنوان | اولویت | وضعیت | دلیل | وابستگی | قدم بعدی پیشنهادی
> وضعیت‌ها: OPEN / IN PROGRESS / BLOCKED / DONE (پس از DONE به CHANGELOG منتقل و اینجا خط بزن)

---

## P0 — بحرانی
*(در حال حاضر مورد P0 باز وجود ندارد — 2026-08-24)*

---

## P1 — بالا

### T-01 | کاتالوگ ۱۲ سیستم + اتصال وب ~~در DB~~
- **Priority:** P1 • **Status:** **DONE** (2026-08-24 — با تغییر دامنه مصوب: کاتالوگ به‌صورت ثابت فرانت‌اند + لیست سفید validation؛ بدون مایگریشن برای حفظ امنیت داده‌های موجود — TD-17)
- **Reason:** شکاف KI-002 با تصمیم مالک (BR-14) رفع شد؛ ماتریس ۱۲ سیستم با `tool/smoke-program-builder.js` رگرسیون‌ شده.

### T-14 | انتقال کاتالوگ سیستم‌ها به DB (`training_system_catalog`)
- **Priority:** P2 • **Status:** OPEN • **Reason:** کاتالوگ فعلاً در فرانت‌اند است؛ هنگام لایه سینک/اندروید باید مرجع سمت سرور باشد. • **Dep:** T-07 (طراحی سینک). • **Next:** مایگریشن افزودنی + seed ۱۲ ردیف + endpoint کاتالوگ + اتصال فرانت‌اند به آن.

### T-02 | پخش ویدیوی حرکات در UI
- **Priority:** P1 (برای ارزش محصول حرکات) • **Status:** OPEN
- **Reason:** مسیر ویدیو در DB هست و `/files/exercise/videos/{id}.mp4` سرو می‌شود، ولی هیچ پخش‌کننده‌ای در UI نیست (فقط فیلد متنی video_path در مودال ویرایش حرکت). TODO رسمی EXERCISE_MANAGEMENT.
- **Dependencies:** موجود بودن فایل‌های mp4 روی دیسک (gitignore — ایمپورت با لانچر)؛ تصمیم UI (مودال vs داخل درایور).
- **Next step:** افزودن `<video controls preload="metadata">` به کارت حرکت در درایور Program Builder + fallback «ویدیو موجود نیست».

---

## P2 — متوسط

### T-03 | آپلود مستقیم عکس حرکت از UI
- **Priority:** P2 • **Status:** OPEN • **Reason:** TODO رسمی (EXERCISE_MANAGEMENT) — الان فقط ایمپورت دستی/لانچر. • **Dep:** الگوی upload-service موجود قابل استفاده مجدد است. • **Next:** endpoint multipart برای `/api/exercises/:id/image` + پنل آپلود.

### T-04 | پرکردن و نمایش فیلدهای ساختاریافته حرکت: تجهیزات، سختی، توضیحات، نام انگلیسی
- **Priority:** P2 • **Status:** OPEN • **Reason:** ستون‌های `equipment/difficulty/description/name_en` در DB موجود ولی خالی‌اند (۰ مقدار پرشده — ممیزی 2026-08-24)؛ فلوی موبایل «تگ تجهیزات» انتظار دارد. • **Dep:** فقط enrich دیتاست/DB + UI — **مایگریشن لازم نیست (ستون‌ها هست)**. • **Next:** غنی‌سازی `data-source/exercises_data.json` → sync به DB → نمایش در کارت حرکت و درایور.

### T-05 | تمیزکاری داده تستی e2e از DB محلی
- **Priority:** P2 • **Status:** OPEN • **Reason:** هر اجرای e2e شاگرد/برنامه تستی اضافه می‌کند (الان ۹ شاگرد/۳ برنامه). • **Dep:** — • **Next:** flag پاکسازی یا DB جدا برای تست (`YASNAFIT_TEST_DB`).

### T-06 | تصمیم سرنوشت جداول legacy
- **Priority:** P2 • **Status:** OPEN • **Reason:** `movements`, `programs`, `orders`, `measurements`, `activity_log` خارج از مدل نرمال؛ دین فنی. • **Dep:** تأیید مالک. • **Next:** بررسی ارجاع‌ها → مایگریشن حذف/علامت‌گذاری deprecated.

### T-07 | لایه سینک (سرور مرکزی + replica حرکات)
- **Priority:** P2 (بلندمدت) • **Status:** OPEN • **Reason:** معماری برایش آماده است (stable_id/version/soft-delete) ولی هیچ کدی نیست. • **Dep:** زیرساخت سرور، تصمیم last-write-wins یا منطق بهتر. • **Next:** سند طراحی سینک قبل از کدنویسی.

---

## P3 — کم

### T-08 | اپ اندروید شاگرد
- **Status:** OPEN • **Reason:** لایه نهایی چشم‌انداز؛ هیچ کدی در مخزن نیست. • **Dep:** T-07 (سینک) و T-01 (کاتالوگ سیستم‌ها). • **Next:** پس از سینک؛ پروتوتایپ روی فلوی ۱۲ سیستمی.

### T-09 | خروجی Excel از حرکات فیلترشده
- **Status:** OPEN • **Reason:** TODO رسمی EXERCISE_MANAGEMENT. • **Dep:** — • **Next:** CSV ساده (بدون وابستگی) یا xlsx سبک.

### T-10 | ویرایش گروهی دسته/محل حرکات + جستجوی چنددسته‌ای
- **Status:** OPEN • **Reason:** TODO رسمی؛ bulk bar فعلاً فقط آرشیو/بازیابی/حذف. • **Dep:** — • **Next:** افزودن اکشن bulk-edit به نوار موجود.

### T-11 | مقاوم‌سازی زیرساخت تست e2e
- **Status:** OPEN (KI-001 + KI-010) • **Reason:** e2e بدون سرورِ در حال اجرا fail می‌شود؛ و اجرای پشت‌سرهم (<۶۰ث) به rate limit لینک دعوت (429) می‌خورد. • **Dep:** — • **Next:** spawn خودکار سرور تستی + exempt کردن IP/env تست از rate limiter (یا پنجره شل‌تر فقط در حالت تست NODE_ENV).

### T-12 | پوشش تست برای tool/program-helper.py
- **Status:** OPEN (KI-008) • **Reason:** ابزار بدون تست خودکار است. • **Dep:** — • **Next:** چند assert ساده روی خروجی info/search.

### T-16 | ویجت تقویم شمسی گرافیکی (بازشو)
- **Status:** OPEN • **Reason:** ورودی فعلی متنی با placeholder است؛ تقویم بازشو UX بهتری دارد. • **Dep:** — • **Next:** گریل ماهانه سبک روی jalali.js فعلی.

### T-15 | افزودن ابزارهای smoke به npm test
- **Status:** OPEN (KI-008/KI-011 مرتبط) • **Reason:** smoke-jalali و smoke-program-builder در زنجیره npm test نیستند. • **Dep:** — • **Next:** افزودن دو خط به package.json scripts و زنجیره test.
- **Status:** OPEN • **Reason:** رگرسیون داخلی UI برنامه‌ساز ساخته شد ولی در زنجیره `npm test` نیست. • **Dep:** — • **Next:** خط `"test:builder": "node tool/smoke-program-builder.js"` + افزودن به test chain.

### T-13 | انتقال rate-limiter به پایدار (در صورت چندکاربره‌شدن)
- **Status:** OPEN • **Reason:** باکت‌ها در حافظه‌اند و با ری‌استارت ریست می‌شوند — برای local تک‌کاربره قابل‌قبول. • **Dep:** نیاز واقعی. • **Next:** جدول DB یا فایل در صورت لزوم.

---

## DONE (آرشیو سریع)
- ~~ایجاد سیستم مستندات `docs/project-tracking/`~~ — 2026-08-24 (تسک ۲)
- ~~ابزار `tool/program-helper.py`~~ — 2026-08-24 (تسک ۱)
