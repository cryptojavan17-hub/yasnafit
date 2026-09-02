# Yasnafit

Yasnafit is a local-first Node.js + SQLite coaching platform with permanent students, one-time invitations, a dedicated student portal, normalized INITIAL/MONTHLY assessments, private files, assessment-linked programs, real workout execution, in-app notifications/messages and structured audit events.

- Start: `YASNAFIT-LAUNCHER.bat` or `npm start`
- Tests: `npm test`
- Port: `3020`
- Application version: `package.json`
- Database schema: `settings.schema_version` / `schema_migrations`
- Deployment: `DEPLOYMENT.md` (nginx + TLS + systemd)
- Architecture: `ARCHITECTURE.md`
- Database: `DATABASE_SCHEMA.md`
- Releases: `CHANGELOG.md` and `/coach/releases`

Student and coach authorization are separate. Student entry is `/join/:token`; private body photos/documents are never served from `public/`.

---

## ⚡ دریافت آخرین فیکس — Getting the latest fix

> **قاعده ثابت (persistent rule):** در پایان هر گزارش، دستورهای اجرا را دقیقاً به این شکل به کاربر بدهید — فقط نام شاخه را با شاخه فعلی جلسه جایگزین کنید. نمونه (شاخه فعلی: `arena/01a05c59-yasnafit`):

```bat
cd C:\Users\MAHDI\Desktop\yasnafit-git
git fetch origin
git checkout arena/01a05c59-yasnafit
git pull --ff-only origin arena/01a05c59-yasnafit
.\YASNAFIT-LAUNCHER.bat
```

- `git pull --ff-only` فقط جلو می‌برد؛ اگر لوکال تغییر داشته باشد، از شما می‌خواهد اول تغییرات را stash یا commit کنید.
- بعد از آپدیت، اگر صفحه قدیمی ماند: `Ctrl+Shift+R` (پاک کردن کش مرورگر).

### از کجا بفهمم آپدیت واقعاً اعمال شده؟

۱) در پنل مربی، صفحهٔ **لیست شاگردان** را باز کنید؛ زیر تیتر «شاگرد های من» یک چیپ کوچک هست:

- `✓ کد روز — <کامیت> • <تاریخ فایل>` → کد تازه روی همین پوشه اجرا می‌شود.
- `⚠️ کد قدیمی است — git pull اعمال نشده` → فایل‌های این پوشه هنوز قدیمی‌اند (pull نشده یا پوشهٔ دیگری را اجرا می‌کنید). با ماوس روی چیپ بگذارید تا شاخه/کامیت/زمان فایل را ببینید.

همین اطلاعات را می‌توانید از API هم بگیرید: `GET /api/build` (فیلدهای `commit` و `markers`) — این مسیر از version 0.9.1 **فقط با نشست لاگین‌شدهٔ مربی** جواب می‌دهد (بدون کوکی ۴۰۱ می‌گیرد)، پس از curl مستقیم با `curl -b "$(cat cookie.txt)" http://localhost:3020/api/build` یا از همان مرورگرِ لاگین‌شده استفاده کنید. لانچر هم در منو `UI check: NEW CODE / OLD CODE` چاپ می‌کند.

۲) اگر چیپ «کد روز» را نشان می‌دهد ولی صفحه همچنان قدیمی است → در مرورگر `Ctrl+Shift+R` بزنید (یا تب را ببندید و دوباره باز کنید).

۳) اگر پوشه به‌روز است ولی سرور، کد قدیمی می‌دهد (مثلاً `server.js`/`src` عوض شده) → در لانچر گزینهٔ **۲. Restart Server**. اگر باز هم همان بود، همهٔ پروسه‌های node را ببندید و دوباره لانچر را از **همان پوشه‌ای که pull کرده‌اید** اجرا کنید:

```bat
taskkill /F /IM node.exe
cd C:\Users\MAHDI\Desktop\yasnafit-git
.\YASNAFIT-LAUNCHER.bat
```

۴) اگر `git checkout` یا `git pull` خطا داد، معمولاً یکی از این سه حالت است:

- **تغییر لوکال دارید:** `git stash` سپس دوباره `git pull --ff-only origin <شاخه جلسه>` (برگرداندن تغییرات خودتان: `git stash pop`).
- **پوشهٔ دیگری را باز کرده‌اید:** `git rev-parse --show-toplevel` باید مسیر همان پوشه‌ای را بدهد که در آن pull می‌کنید.
- **شاخهٔ جلسه fetch نشده:** `git fetch origin --prune --tags` و سپس `git branch -r` را ببینید؛ اگر شاخهٔ جلسه نیست یعنی کار هنوز push نشده است.
- اجرا بدون Node نیز با `.\YASNAFIT-LAUNCHER.bat` (پورت ۳۰۲۰): مربی `/coach`، ثبت‌نام `/student/register`، ورود `/student/login`، ارزیابی `/student/onboarding`.

---

## 🖼 تصویر هیروی صفحه ورود

صفحه ورود (طراحی لوکس دارک) برای هیرو به‌ترتیب این دو مسیر را امتحان می‌کند:

1. **عکس شخصی شما:** `public/image/logo.png` — فایل را با همین نام در این پوشه بگذارید (این فایل در `.gitignore` است و هرگز به مخزن عمومی ارسال نمی‌شود).
2. **تصویر پیش‌فرض:** `public/images/auth-hero.jpg` — اگر عکس شخصی موجود نباشد، این تصویر نمایش داده می‌شود.
3. اگر هیچ‌کدام موجود نباشد، پس‌زمینه گرادیان لوکس نمایش داده می‌شود و صفحه خراب نمی‌شود.

- عکس عمودی/پرتره با پس‌زمینه تاریک بهترین نتیجه را می‌دهد (برش خودکار با `object-fit: cover`).
- بعد از قرار دادن فایل، فقط برنامه را ری‌استارت کنید (و در مرورگر `Ctrl+Shift+R` بزنید).

---

## 🔒 اجرای روی سرور — Server deployment

راهنمای کامل (nginx + TLS + systemd + بکاپ + چک‌لیست) در **`DEPLOYMENT.md`** است. خلاصهٔ چهار نکته‌ای که باید بدانید:

```bash
PORT=3020 YASNAFIT_HOST=127.0.0.1 YASNAFIT_TRUST_PROXY=1 YASNAFIT_COOKIE_SECURE=1 NODE_ENV=production node server.js
```

- `YASNAFIT_HOST=127.0.0.1` یعنی فقط nginx به برنامه دسترسی دارد؛ پورت ۳۰۲۰ را در فایروال باز نکنید.
- `YASNAFIT_TRUST_PROXY=1` **فقط** وقتی که ترافیک حتماً از پروکسی می‌آید. تا این پرچم خاموش باشد، هدرهای `X-Forwarded-For/Host/Proto` نادیده گرفته می‌شوند تا کسی با جعل هدر، IP محدودیتِ ورود یا `Secure` بودنِ کوکی را بازی نزند.
- `NODE_ENV=production` مسیر تستی `POST /api/test/reset-rate-limit` (پاک‌کردن شمارندهٔ تلاش ناموفق) را حذف می‌کند.
- `data/` و `backups/` با مجوز `700` و `data/smtp.json` (App Password جیمیل) با `600` ساخته می‌شوند.

نکته‌های کاربردی که قبلاً در `راهنمای_اجرا.md` بود و حالا همین‌جا جمع شده است:

- مسیرهای ورودی: `/coach` (پنل مربی، لاگین با ایمیل + رمز + Google Authenticator)، `/student/login`، `/student/register`، `/student/onboarding`، `/join/:token` (لینک دعوت یک‌بارمصرف که خودِ برنامه می‌سازد).
- دیتابیس فقط `data/yasnafit.db` است؛ مایگریشن‌ها هنگام بالا آمدن سرور خودکار اجرا می‌شوند. ریست کامل = بستن سرور و حذف `data/yasnafit.db*`.
- فرانت‌اند بدون بیلد است: تغییر `public/*` با رفرش مرورگر دیده می‌شود، ولی تغییر `server.js` یا `src/*` به ری‌استارت نیاز دارد.
- پورت ۳۰۲۰ اشغال بود: لینوکس/مک `lsof -ti:3020 | xargs kill -9` — ویندوز `netstat -ano | findstr :3020` سپس `taskkill /PID <PID> /F`.
- اگر شمارهٔ موبایل را `9123456789` وارد کنید همان ذخیره می‌شود (دیگر `09` خودکار اضافه نمی‌شود) و قد/وزن با رقم فارسی (`۷۰`) هم قبول است.

---

# Morabiha — User Guide | راهنمای کاربر مربیها

<details>
<summary><strong>English Guide</strong></summary>

## Introduction

This guide explains the daily use of Morabiha for coaches in the admin panel (`admin-morabiha.ir`) and students in the student panel (`panel.morabiha.com`). Menu labels are shown in Persian in parentheses so they can be found quickly.

## How to get started

1. Open the panel that matches your role.
2. Sign in with the mobile number or credentials provided for your account.
3. Complete your profile before creating programs, receiving orders, or inviting team members.
4. Use the sidebar to open the required section. Access to some items depends on your role and subscription.

## Login

- **Coaches and staff:** go to `admin-morabiha.ir` and enter your account details.
- **Students:** go to `panel.morabiha.com` and enter your account details.
- If you cannot sign in, check the entered mobile number, request a new verification code where available, or contact the relevant coach/support team.
- Sign out on shared devices after finishing your work.

## Dashboard overview

The **Dashboard (داشبورد)** is the first screen after login. It provides a quick view of relevant activity, such as programs, orders, messages, notifications, tasks, and account information. Open a card or sidebar item to review its details. Coaches should check new students, unfinished orders, wallet activity, and waiting lists regularly. Students should check new programs, messages, and upcoming course or event items.

## Main menu — Coach admin panel

| Menu section | Use it to |
|---|---|
| Dashboard (داشبورد) | Review the day’s summary, recent activity, and action items. |
| Dedicated Landing Page (صفحه اختصاصی) | Set up and maintain the coach’s dedicated public page and its displayed information. |
| Account Management (مدیریت حساب) | Manage packages, assistants, subscriptions, exercise movements, and coach invitations. |
| Staff List (لیست کارمندان) | View and manage staff accounts and their assigned access. |
| Coaches List (لیست مربی ها) | View and manage coach records available to your role. |
| Wallet (کیف پول) | Review wallet balance and related transactions. |
| Course Endings (پایان دوره ها) | Follow up on programs or periods that are ending. |
| Coaches’ Wallet History (تاریخچه کیف پول مربی ها) | Review wallet transaction history for coaches. |
| My Students (شاگرد های من) | Search students, open their records, and manage their coaching work. |
| Subscriptions (اشتراک ها) | View and manage available or active subscriptions. |
| Saved Messages Management (مدیریت پیام‌های آماده) | Create, edit, and use reusable message templates. |
| Order Feedback (بازخورد های سفارشات) | Review feedback submitted for orders and follow up when needed. |
| Comparison List (لیست مقایسه) | Review records saved for comparison. |
| Ticket Feedback (فیدبک تیکت‌ها) | Review feedback related to support tickets. |
| Successful Consultations (مشاوره موفقیت آمیز) | Track consultations marked as successfully completed. |
| Sales Portal (پورتال فروش) | Access sales-related work assigned to your account. |
| Secretary Portal (پورتال منشی) | Access secretary tasks and student follow-up work. |
| Incomplete Orders (سفارشات تکمیل نشده) | Find orders that need information, action, or completion. |
| Latest Sent SMS Messages (آخرین پیامک‌های ارسالی) | Review recently sent text messages. |
| Specialist Sales Chart (نمودار فروش کارشناس) | Review sales figures and trends for specialists. |
| My Customer Calls (تماس‌های مشتریان من) | Log, review, and follow up on your customer calls. |
| My Customer Payments (پرداختی‌های مشتریان من) | Review payments associated with your customers. |
| Waiting Lists (لیست‌های انتظار) | Manage exercise, diet, corrective, and supplement waiting lists. |
| Program Bank (بانک برنامه ها) | Save, find, reuse, and organize program templates. |
| Programs (برنامه ها) | Maintain movements, foods, tags, packages, and supplements used in programs. |
| Monetization (درآمد زایی) | Review and manage available earning-related items. |
| Events (رویداد ها) | Create or manage event information and participation. |
| Courses (دوره ها) | Create or manage course information and enrollment-related work. |
| Tools (ابزارها) | Use the Calorie and BMI calculators when preparing guidance. |
| Notifications & Pop-ups (اعلان ها و پاپ آپ ها) | Review, create, or manage in-panel notices and pop-ups. |
| Settings (تنظیمات) | Update profile details and account or panel settings. |
| Statistics (آمار ها) | Review available performance and activity statistics. |

## Main menu — Student panel

| Menu section | Use it to |
|---|---|
| Dashboard (داشبورد) | Check current activity, recent updates, and pending items. |
| Programs (برنامه‌ها) | Open exercise, diet, supplement, and corrective programs assigned to you. |
| Courses (دوره‌ها) | View your course materials and course-related information. |
| Events (رویدادها) | Check event details and participation information. |
| Orders (سفارشات) | View the status and details of your requests. |
| Messenger (پیام‌رسان) | Exchange messages with your coach or the assigned team. |
| Tickets (تیکت‌ها) | Send support requests and follow their replies. |
| Profile (پروفایل) | Keep your personal and account details up to date. |
| Document (پرونده) | Review or complete the information in your personal case file. |
| Changes Chart (نمودار تغییرات) | Record and review progress changes over time. |

## Key workflows — Coaches

### Create and deliver a program

1. Open **My Students (شاگرد های من)** and select the student.
2. Review the student’s **Document (پرونده)**, goals, and previous information.
3. Open **Programs (برنامه ها)** and select or build the required exercise, diet, corrective, or supplement content.
4. Use items from the **Program Bank (بانک برنامه ها)** when a suitable template exists.
5. Check movements, foods, tags, packages, and supplements before saving.
6. Assign or deliver the program, then confirm it appears in the student’s panel.
7. Use **Messenger (پیام‌رسان)** or a saved message template for follow-up when appropriate.

### Manage a new or incomplete order

1. Open **Incomplete Orders (سفارشات تکمیل نشده)**.
2. Select the order and identify missing information or the next required action.
3. Contact the customer through the available communication workflow and record follow-up as needed.
4. Complete the required work, then verify the order status is updated.
5. Review **Order Feedback (بازخورد های سفارشات)** after completion if feedback is available.

### Manage your account and team

1. Open **Account Management (مدیریت حساب)** for packages, assistants, subscriptions, movements, or coach invitations.
2. Use **Staff List (لیست کارمندان)** or **Coaches List (لیست مربی ها)** to review the relevant person’s access or record.
3. Update profile details from **Settings (تنظیمات)**.
4. Check **Wallet (کیف پول)** and wallet history before following up on payment-related matters.

## Key workflows — Students

### Review a new program

1. Open **Programs (برنامه‌ها)**.
2. Choose the appropriate program type: exercise, diet, supplement, or corrective.
3. Read the instructions, schedule, and related notes before starting.
4. Use **Messenger (پیام‌رسان)** to ask your coach a program question.
5. Record progress in **Changes Chart (نمودار تغییرات)** when requested.

### Send a support request

1. Open **Tickets (تیکت‌ها)**.
2. Create a new ticket with a clear subject and a short description.
3. Add relevant details, such as the program name or issue date.
4. Check the ticket later for replies and respond in the same ticket.

### Keep your information current

1. Open **Profile (پروفایل)** and update personal or contact details.
2. Open **Document (پرونده)** and complete requested health, goal, or measurement information accurately.
3. Save changes and notify your coach through **Messenger (پیام‌رسان)** if an important detail changes.

## Important notes

- Menu items may differ based on role, permission, subscription, or assigned service.
- Enter student health, contact, and payment-related information carefully; do not share account access with others.
- Review all program details before assigning them as a coach or following them as a student.
- Use clear, respectful messages and keep follow-up inside the relevant order, conversation, or ticket when possible.
- If a page does not load or a change is not saved, refresh once, verify your connection, and then contact support with a screenshot and the relevant record details.

## FAQ

**I cannot see a menu item. What should I do?**
Your role or subscription may not include it. Ask the account owner or support team to verify your access.

**How do I contact my coach?**
Open **Messenger (پیام‌رسان)** in the student panel and send a message in the relevant conversation.

**Where can I see my program?**
Students can open **Programs (برنامه‌ها)**. Coaches can open the student from **My Students (شاگرد های من)** and review the assigned work.

**How do I report a technical issue?**
Create a clear request in **Tickets (تیکت‌ها)** or contact the designated support channel with screenshots and the affected page name.

</details>

<details dir="rtl">
<summary><strong>راهنمای فارسی</strong></summary>

## مقدمه

این راهنما استفاده روزمره از مربیها را برای **مربی‌ها** در پنل مدیریت (`admin-morabiha.ir`) و **شاگردها** در پنل شاگرد (`panel.morabiha.com`) توضیح می‌دهد. بعضی گزینه‌ها با توجه به نقش کاربری، دسترسی و اشتراک شما نمایش داده می‌شوند.

## شروع کار

1. پنل متناسب با نقش خود را باز کنید.
2. با شماره موبایل یا اطلاعات ورود حساب خود وارد شوید.
3. پیش از ساخت برنامه، دریافت سفارش یا دعوت همکار، پروفایل خود را کامل کنید.
4. برای دسترسی به هر بخش، از منوی کناری استفاده کنید.

## ورود به حساب

- **مربی‌ها و کارکنان:** وارد `admin-morabiha.ir` شوید و اطلاعات حساب را وارد کنید.
- **شاگردها:** وارد `panel.morabiha.com` شوید و اطلاعات حساب را وارد کنید.
- اگر ورود انجام نشد، شماره موبایل را بررسی کنید، در صورت وجود گزینه ارسال مجدد کد را انتخاب کنید یا با مربی/پشتیبانی تماس بگیرید.
- در دستگاه‌های مشترک، پس از پایان کار از حساب خارج شوید.

## نمای کلی داشبورد

**داشبورد** نخستین صفحه پس از ورود است و خلاصه‌ای از فعالیت‌های مرتبط مانند برنامه‌ها، سفارش‌ها، پیام‌ها، اعلان‌ها و اطلاعات حساب را نمایش می‌دهد. برای دیدن جزئیات، کارت موردنظر یا گزینه مربوط در منوی کناری را باز کنید. مربی‌ها بهتر است شاگردهای جدید، سفارشات تکمیل نشده، کیف پول و لیست‌های انتظار را به‌طور منظم بررسی کنند. شاگردها نیز برنامه‌های جدید، پیام‌ها و موارد مربوط به دوره یا رویداد را بررسی کنند.

## منوی اصلی — پنل مدیریت مربی

| بخش منو | کاربرد |
|---|---|
| داشبورد | مشاهده خلاصه فعالیت‌ها و کارهای نیازمند پیگیری. |
| صفحه اختصاصی | تنظیم و به‌روزرسانی صفحه اختصاصی و اطلاعات قابل نمایش مربی. |
| مدیریت حساب | مدیریت پکیج‌ها، منشی‌ها، اشتراک‌ها، حرکات ورزشی و دعوت از مربی‌ها. |
| لیست کارمندان | مشاهده و مدیریت حساب کارکنان و دسترسی‌های آن‌ها. |
| لیست مربی ها | مشاهده و مدیریت اطلاعات مربی‌ها در محدوده دسترسی شما. |
| کیف پول | مشاهده موجودی و تراکنش‌های مرتبط. |
| پایان دوره ها | پیگیری برنامه‌ها یا دوره‌های در حال پایان. |
| تاریخچه کیف پول مربی ها | بررسی سابقه تراکنش‌های کیف پول مربی‌ها. |
| شاگرد های من | جست‌وجو، مشاهده پرونده و مدیریت امور شاگردها. |
| اشتراک ها | مشاهده و مدیریت اشتراک‌های موجود یا فعال. |
| مدیریت پیام‌های آماده | ساخت، ویرایش و استفاده از قالب‌های پیام آماده. |
| بازخورد های سفارشات | بررسی بازخورد سفارش‌ها و پیگیری موارد لازم. |
| لیست مقایسه | مشاهده موارد ذخیره‌شده برای مقایسه. |
| فیدبک تیکت‌ها | بررسی بازخوردهای مربوط به تیکت‌ها. |
| مشاوره موفقیت آمیز | پیگیری مشاوره‌هایی که با موفقیت تکمیل شده‌اند. |
| پورتال فروش | انجام امور فروش تخصیص‌یافته به حساب شما. |
| پورتال منشی | انجام امور منشی و پیگیری شاگردها. |
| سفارشات تکمیل نشده | یافتن سفارش‌هایی که به اطلاعات یا اقدام نیاز دارند. |
| آخرین پیامک‌های ارسالی | بررسی پیامک‌های ارسال‌شده اخیر. |
| نمودار فروش کارشناس | مشاهده آمار و روند فروش کارشناسان. |
| تماس‌های مشتریان من | ثبت، مشاهده و پیگیری تماس‌های مشتریان. |
| پرداختی‌های مشتریان من | بررسی پرداخت‌های مشتریان شما. |
| لیست‌های انتظار | مدیریت لیست‌های انتظار تمرینی، غذایی، اصلاحی و مکمل. |
| بانک برنامه ها | ذخیره، جست‌وجو، استفاده مجدد و دسته‌بندی قالب برنامه‌ها. |
| برنامه ها | مدیریت حرکات، غذاها، تگ‌ها، پکیج‌ها و مکمل‌های موردنیاز برنامه‌ها. |
| درآمد زایی | مشاهده و مدیریت موارد مرتبط با درآمدزایی. |
| رویداد ها | ایجاد یا مدیریت اطلاعات و ثبت‌نام رویدادها. |
| دوره ها | ایجاد یا مدیریت اطلاعات دوره‌ها و امور مرتبط با ثبت‌نام. |
| ابزارها | استفاده از محاسبه‌گر کالری و BMI هنگام آماده‌سازی راهنمایی. |
| اعلان ها و پاپ آپ ها | مشاهده، ایجاد یا مدیریت اعلان‌ها و پاپ‌آپ‌های داخل پنل. |
| تنظیمات | به‌روزرسانی پروفایل و تنظیمات حساب یا پنل. |
| آمار ها | مشاهده آمار فعالیت و عملکرد موجود. |

## منوی اصلی — پنل شاگرد

| بخش منو | کاربرد |
|---|---|
| داشبورد | مشاهده فعالیت‌های جاری، به‌روزرسانی‌ها و موارد نیازمند اقدام. |
| برنامه ها | مشاهده برنامه‌های تمرینی، غذایی، مکمل و اصلاحی تخصیص‌یافته. |
| دوره ها | مشاهده محتوای دوره‌ها و اطلاعات مرتبط. |
| رویداد ها | مشاهده جزئیات رویدادها و اطلاعات شرکت در آن‌ها. |
| سفارشات | مشاهده وضعیت و جزئیات درخواست‌ها. |
| پیام‌رسان | ارسال و دریافت پیام با مربی یا تیم مربوطه. |
| تیکت‌ها | ثبت درخواست پشتیبانی و پیگیری پاسخ‌ها. |
| پروفایل | به‌روزرسانی اطلاعات شخصی و حساب. |
| پرونده | مشاهده یا تکمیل اطلاعات پرونده شخصی. |
| نمودار تغییرات | ثبت و بررسی روند تغییرات و پیشرفت. |

## کارهای اصلی — مربی‌ها

### ساخت و تحویل برنامه

1. وارد **شاگرد های من** شوید و شاگرد را انتخاب کنید.
2. **پرونده**، هدف‌ها و اطلاعات قبلی شاگرد را بررسی کنید.
3. از بخش **برنامه ها**، محتوای تمرینی، غذایی، اصلاحی یا مکمل موردنیاز را انتخاب یا ایجاد کنید.
4. اگر قالب مناسبی وجود دارد، از **بانک برنامه ها** استفاده کنید.
5. پیش از ذخیره، حرکات، غذاها، تگ‌ها، پکیج‌ها و مکمل‌ها را بررسی کنید.
6. برنامه را تخصیص یا ارسال دهید و نمایش آن در پنل شاگرد را بررسی کنید.
7. در صورت نیاز، از **پیام‌رسان** یا پیام‌های آماده برای پیگیری استفاده کنید.

### پیگیری سفارش جدید یا تکمیل نشده

1. بخش **سفارشات تکمیل نشده** را باز کنید.
2. سفارش را انتخاب کنید و اطلاعات ناقص یا اقدام بعدی را مشخص کنید.
3. از مسیر ارتباطی موجود با مشتری پیگیری کنید و در صورت نیاز، نتیجه را ثبت کنید.
4. کار لازم را انجام دهید و از به‌روزرسانی وضعیت سفارش مطمئن شوید.
5. پس از تکمیل، در صورت وجود، **بازخورد های سفارشات** را بررسی کنید.

### مدیریت حساب و تیم

1. برای پکیج‌ها، منشی‌ها، اشتراک‌ها، حرکات یا دعوت مربی‌ها، **مدیریت حساب** را باز کنید.
2. برای بررسی رکورد یا دسترسی افراد، از **لیست کارمندان** یا **لیست مربی ها** استفاده کنید.
3. مشخصات پروفایل را از **تنظیمات** به‌روزرسانی کنید.
4. پیش از پیگیری امور پرداخت، **کیف پول** و تاریخچه آن را بررسی کنید.

## کارهای اصلی — شاگردها

### مشاهده برنامه جدید

1. وارد **برنامه ها** شوید.
2. نوع برنامه را انتخاب کنید: تمرینی، غذایی، مکمل یا اصلاحی.
3. پیش از شروع، دستورها، زمان‌بندی و یادداشت‌های برنامه را کامل بخوانید.
4. برای پرسش درباره برنامه، از **پیام‌رسان** استفاده کنید.
5. در صورت درخواست مربی، پیشرفت خود را در **نمودار تغییرات** ثبت کنید.

### ثبت درخواست پشتیبانی

1. بخش **تیکت‌ها** را باز کنید.
2. یک تیکت جدید با عنوان روشن و توضیح کوتاه ثبت کنید.
3. جزئیات مرتبط مانند نام برنامه یا تاریخ بروز مشکل را وارد کنید.
4. برای دریافت پاسخ، همان تیکت را بعداً بررسی و در همان گفتگو پاسخ دهید.

### به‌روز نگه داشتن اطلاعات

1. وارد **پروفایل** شوید و اطلاعات شخصی یا تماس را به‌روز کنید.
2. بخش **پرونده** را باز کنید و اطلاعات درخواستی مربوط به سلامت، هدف یا اندازه‌گیری‌ها را دقیق تکمیل کنید.
3. تغییرات را ذخیره کنید و اگر تغییر مهمی رخ داده است، از طریق **پیام‌رسان** به مربی اطلاع دهید.

## نکات مهم

- نمایش بخش‌های منو به نقش، دسترسی، اشتراک یا خدمات تخصیص‌یافته شما بستگی دارد.
- اطلاعات سلامت، تماس و پرداخت را با دقت وارد کنید و دسترسی حساب خود را در اختیار دیگران قرار ندهید.
- مربی‌ها پیش از تخصیص و شاگردها پیش از اجرای برنامه، جزئیات آن را بررسی کنند.
- پیام‌ها را روشن و محترمانه بنویسید و تا حد امکان پیگیری را در همان سفارش، گفتگو یا تیکت انجام دهید.
- اگر صفحه‌ای باز نشد یا تغییرات ذخیره نشد، یک‌بار صفحه را تازه‌سازی و اتصال اینترنت را بررسی کنید؛ سپس همراه با تصویر و نام صفحه با پشتیبانی تماس بگیرید.

## پرسش‌های متداول

**یک گزینه از منو را نمی‌بینم؛ چه کار کنم؟**
ممکن است این گزینه در دسترسی یا اشتراک شما نباشد. از صاحب حساب یا پشتیبانی بخواهید دسترسی را بررسی کند.

**چطور با مربی تماس بگیرم؟**
در پنل شاگرد، بخش **پیام‌رسان** را باز کنید و در گفتگوی مربوط پیام بفرستید.

**برنامه خود را از کجا ببینم؟**
شاگردها از **برنامه ها** استفاده کنند. مربی‌ها نیز می‌توانند از **شاگرد های من** وارد پرونده شاگرد شوند و برنامه‌های تخصیص‌یافته را بررسی کنند.

**چطور مشکل فنی را گزارش کنم؟**
در **تیکت‌ها** درخواست واضحی ثبت کنید یا از مسیر پشتیبانی تعیین‌شده، تصویر صفحه و نام بخش دارای مشکل را ارسال کنید.

</details>
