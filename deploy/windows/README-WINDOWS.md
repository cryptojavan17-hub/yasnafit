# کیت استقرار ویندوز Yasnafit

این پوشه سرور را روی ویندوز از GitHub می‌گیرد، دیتابیس را دست نمی‌زند، بکاپ می‌گیرد و `node server.js` را مخفی بالا می‌آورد. لانچر روزمرهٔ `YASNAFIT-LAUNCHER.bat` عوض نشده است؛ این کیت برای نصب و به‌روزرسانی از گیت است.

اسکریپت برای **Windows PowerShell 5.1 و PowerShell 7** نوشته شده. در محیط ساختِ مخزن PowerShell نبود؛ اینجا اجرا نشده و فقط بازبینی نحوی شده است. اجرا روی ویندوز مالک است.

## سه حالت اجرا

1. **دابل‌کلیک `deploy.cmd`**  
   عمل پیش‌فرض `deploy` است. چون آرگومانی نیست، در پایان `pause` می‌شود تا متن را ببینید.

2. **خط فرمان (`cmd`)** — از همین پوشه:
   ```bat
   deploy.cmd
   deploy.cmd update
   deploy.cmd start
   deploy.cmd stop
   deploy.cmd restart
   deploy.cmd status
   deploy.cmd logs
   deploy.cmd backup
   deploy.cmd update -AppDir "C:\Users\MAHDI\Desktop\yasnafit-git" -NoBrowser
   deploy.cmd update -Force
   ```
   اگر خطا باشد `pause` می‌شود. اگر آرگومان داشته باشد و موفق باشد، پنجره نمی‌ماند.

3. **خودِ PowerShell** (۵.۱ یا ۷):
   ```bat
   powershell -NoProfile -ExecutionPolicy Bypass -File .\Deploy-Yasnafit.ps1 status
   ```
   اگر PowerShell 7 نصب است، همان فایل را با `pwsh` هم می‌توانید اجرا کنید.

خط داخل `deploy.cmd` همین است:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Deploy-Yasnafit.ps1" %*
```

## AppDir و شاخه

- `-AppDir` اگر داده نشود: اگر `..\..\server.js` و `..\..\.git` باشند (کیت داخل همین ریپو)، ریشهٔ ریپو استفاده می‌شود. وگرنه `<همین پوشه>\app` و در صورت نبود checkout آنجا clone می‌شود.
- `-Repo` پیش‌فرض: `https://github.com/cryptojavan17-hub/yasnafit.git`
- `-Branch` پیش‌فرض: `main`
- `-Port` پیش‌فرض: `3020` — مگر `PORT` در `yasnafit.env` مقدار داشته باشد؛ آن وقت فایل مقدم است.
- `-NoBrowser` مرورگر را باز نمی‌کند.
- `-Force` فقط برای دور ریختن تغییر **tracked** و `git reset --hard origin/<Branch>`. `data\` پاک نمی‌شود. `git clean` اجرا نمی‌شود.

اگر کیت را از داخل checkout خودتان اجرا می‌کنید و نمی‌خواهید به `main` بروید، شاخه را صریح بدهید. بدون `-Force`، تغییر tracked مانع ادامه می‌شود.

## کار هر اکشن

| اکشن | کار |
|---|---|
| `deploy` / `update` | Git و Node ≥ 22.5 (نبود ⇒ راهنمای `winget`، بدون نصب خودکار). ساخت `yasnafit.env` از example اگر نباشد. خواندن `KEY=VALUE`. مقدار خالی = تنظیم‌نشدن. نام متغیرهای دارای `TOKEN` / `SECRET` / `PASS` چاپ می‌شود، نه مقدار. توقف شنوندهٔ پورت (`Get-NetTCPConnection -State Listen`، وگرنه `netstat -ano`). بکاپ `data\yasnafit.db` به‌همراه `-wal`/`-shm` در `backups\deploy-<yyyyMMdd-HHmmss>.db`، حداکثر ۱۰ نسخه. اگر checkout نیست `git clone`، وگرنه `git fetch --prune`، سوئیچ شاخه، `pull --ff-only` یا با `-Force` همان `reset --hard`. `git log --oneline old..new`. استارت مخفی `cmd /c node server.js >> logs\server.log 2>&1`. تا ۱۲۰ ثانیه `http://127.0.0.1:<port>/api/health` و چاپ `version` / `uptime`. شکست ⇒ ۴۰ خط آخر لاگ. خلاصهٔ بوت: خطوط `[Migrations] ✅ … applied` (نه `Skipping` و نه `Applying`)، `Database schema version:`، `Build stamp:`، خطوط `[Telegram]`. مرورگر مگر `-NoBrowser`. |
| `start` | اگر پورت آزاد است استارت مخفی، سپس health و مرورگر. گیت را عوض نمی‌کند. |
| `stop` | شنوندهٔ همان پورت را می‌بندد. |
| `restart` | stop سپس start. گیت را عوض نمی‌کند. |
| `status` | پورت، PID، وجود و اندازهٔ DB، آخرین بکاپ `deploy-*.db`، و اگر بالا باشد version/uptime. |
| `logs` | ۶۰ خط آخر `logs\server.log`. اگر فایل نباشد خطا. |
| `backup` | فقط بکاپ و چرخش ۱۰ نسخه. سرور را ری‌استارت نمی‌کند. |

`data\` در آپدیت گیت دست نمی‌خورد (gitignore است و `reset --hard` فایل نادیده‌گرفته را پاک نمی‌کند).

## yasnafit.env

کنار اسکریپت است، نه داخل AppDir. نمونه: `yasnafit.env.example`. توکن واقعی را فقط در `yasnafit.env` بگذارید. توکن ربات را همزمان روی ویندوز و Railway نگذارید.

اگر خلاصهٔ لاگ بلافاصله بعد از استارت خالی بود، سرور را با health بسنجید و چند ثانیه بعد `deploy.cmd logs` را بزنید. وقتی خروجی به فایل می‌رود، Node ممکن است stdout را بافر کند.

## عیب‌یابی

- **Git یا Node نیست:** دستورهای `winget` که اسکریپت چاپ می‌کند را خودتان اجرا کنید. Node باید `v22.5` یا جدیدتر باشد.
- **تغییر محلی tracked:** یا commit/stash کنید، یا فقط اگر می‌خواهید آن‌ها دور ریخته شوند `update -Force`.
- **`pull --ff-only` شکست:** تاریخچه جلوتر از origin است. `-Force` یعنی پذیرش `reset --hard`.
- **health قرمز:** ۴۰ خط آخر `logs\server.log` چاپ می‌شود. پورت اشغال، `PORT` فایل، یا خطای مایگریشن را همان‌جا ببینید.
- **فارسی درهم:** `deploy.cmd` قبل از PowerShell `chcp 65001` می‌زند. فایل env را UTF-8 ذخیره کنید.
