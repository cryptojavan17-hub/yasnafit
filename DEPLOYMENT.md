# راهنمای استقرار روی سرور — Yasnafit

این برنامه یک سرور تک‌فایلی Node.js + SQLite است؛ هیچ دیتابیس خارجی، هیچ بیلد استپ و
**هیچ وابستگی npm** ندارد. روی سرور لینوکسی آن را پشت nginx (با TLS) اجرا کنید و پورت
برنامه را هرگز مستقیم در اینترانت باز نگذارید.

---

## ۱. پیش‌نیاز

| مورد | مقدار |
|---|---|
| Node.js | **22.5 یا بالاتر** (`node -v`) — چون از ماژول داخلی `node:sqlite` استفاده می‌کند |
| وابستگی npm | ندارد (`npm install` اختیاری و بی‌اثر است) |
| تست | `npm test` (۱۸ سوئیت رگرسیون) |
| پورت پیش‌فرض | `3020` |

```bash
git clone https://github.com/cryptojavan17-hub/yasnafit.git /srv/yasnafit
cd /srv/yasnafit
git checkout main
npm test
```

## ۲. متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PORT` | `3020` | پورت HTTP برنامه |
| `YASNAFIT_HOST` | `0.0.0.0` | آدرس bind. **پشت nginx مقدار `127.0.0.1`** تا پورت برنامه از بیرون باز نباشد |
| `YASNAFIT_TRUST_PROXY` | خاموش | فقط وقتی `1` کنید که ترافیک حتماً از پروکسی (nginx/caddy) می‌آید. تا این پرچم خاموش است، `X-Forwarded-For/Host/Proto` کاملاً نادیده گرفته می‌شود |
| `YASNAFIT_COOKIE_SECURE` | خاموش | `1` کنید تا کوکی نشست‌ها همیشه `Secure` بخورند (لازمی وقتی TLS در پروکسی خاتمه می‌یابد) |
| `NODE_ENV` | — | `production` باعث می‌شود مسیر تستی `POST /api/test/reset-rate-limit` کاملاً حذف شود |

نکته امنیتی: هر سه هدر `X-Forwarded-*` قابل جعل هستند. کلید محدودیت تلاش‌های ناموفق
ورود، بررسی same-origin (ضد CSRF) و پرچم `Secure` کوکی فقط با `YASNAFIT_TRUST_PROXY=1`
به آن‌ها نگاه می‌کنند؛ پس اگر پورت `3020` را مستقیم در اینترنت بگذارید، **این پرچم را
روشن نکنید** (در آن حالت IP همه مشتریان یکی دیده می‌شود، ولی کسی نمی‌تواند قفل حساب را
دور بزند).

## ۳. nginx + TLS

```nginx
server {
  listen 443 ssl http2;
  server_name yasnafit.example;

  ssl_certificate     /etc/letsencrypt/live/yasnafit.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yasnafit.example/privkey.pem;

  # عکس/ویدیوی حرکات و آپلود عکس بدن شاگرد
  client_max_body_size 25m;

  add_header Strict-Transport-Security "max-age=31536000" always;

  location / {
    proxy_pass http://127.0.0.1:3020;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    proxy_read_timeout 120s;
  }
}

server { listen 80; server_name yasnafit.example; return 301 https://$host$request_uri; }
```

بقیه هدرهای امنیتی (CSP با `frame-ancestors 'none'`، `X-Content-Type-Options: nosniff`،
`X-Frame-Options: DENY`، `Referrer-Policy: no-referrer`، `Permissions-Policy`،
`Cross-Origin-*`) را خودِ سرور روی **همه** پاسخ‌ها ست می‌کند؛ لازم نیست در nginx تکرارشان کنید.

## ۴. سرویس systemd

`/etc/systemd/system/yasnafit.service`:

```ini
[Unit]
Description=Yasnafit coach and student platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=yasnafit
Group=yasnafit
WorkingDirectory=/srv/yasnafit
Environment=PORT=3020
Environment=YASNAFIT_HOST=127.0.0.1
Environment=YASNAFIT_TRUST_PROXY=1
Environment=YASNAFIT_COOKIE_SECURE=1
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
# سخت‌سازی
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectKernelTunables=true
ProtectControlGroups=true
ReadWritePaths=/srv/yasnafit/data /srv/yasnafit/backups /srv/yasnafit/logs /srv/yasnafit/public/image

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin yasnafit
sudo chown -R yasnafit:yasnafit /srv/yasnafit
sudo chmod 700 /srv/yasnafit/data /srv/yasnafit/backups
sudo systemctl daemon-reload
sudo systemctl enable --now yasnafit
sudo ufw allow 80,443/tcp && sudo ufw deny 3020/tcp   # پورت برنامه بیرون از دسترس
```

مسیرهای `data/` و `backups/` هنگام بالا آمدن سرور با مجوز `700` ساخته می‌شوند و
`data/smtp.json` (شامل App Password جیمیل) و `data/coach-authenticator.txt` با مجوز `600`
نوشته می‌شوند. اگر از نسخه‌های قبلی ارتقا می‌دهید، یک‌بار دستی محکمشان کنید:

```bash
sudo chmod 700 data backups
sudo chmod 600 data/smtp.json data/coach-authenticator.txt 2>/dev/null || true
```

## ۵. حساب مربی و Google Authenticator (بدون رابط گرافیکی)

> **مهم:** ساخت حساب مربی (`/coach/setup`) فقط از روی خودِ سرور (آدرس لوپ‌بک) مجاز است؛ تا
> وقتی حسابی ساخته نشده، هر کس دیگری که زودتر به آدرس عمومی سرور برسد می‌توانست حساب را
> تصاحب کند. برای اجرای از راه دور یا `YASNAFIT_ALLOW_REMOTE_SETUP=1` بگذارید یا از تونل
> SSH (`ssh -L 3020:127.0.0.1:3020 server`) استفاده کنید. بعد از اولین ساخت، این مسیر برای
> همه ۴۰۴ می‌شود.

```bash
# یک‌بار: ساخت حساب مربی + چاپ کلید TOTP (کلید در data/coach-authenticator.txt هم ذخیره می‌شود)
sudo -u yasnafit YASNAFIT_COACH_PASSWORD='یک-رمز-قوی' node scripts/provision-coach-totp.js

# در صورت نشتی/گم‌شدن گوشی:
sudo -u yasnafit node scripts/provision-coach-totp.js --rotate
```

ایمیل ورود مربی ثابت است: `crypto.javan17@gmail.com`. برای بازیابی رمز، از
`/coach/mail` (یا تنظیمات مربی) یک **App Password** جیمیل وارد کنید تا لینک ریست واقعی
ارسال شود؛ بدون آن لینک در `data/coach-reset-dev.txt` روی سرور نوشته می‌شود.

## ۶. پشتیبان‌گیری

دیتابیس یک فایل SQLite در `data/yasnafit.db` (+ فایل‌های WAL) است.

```bash
# از داخل پنل: «پشتیبان‌گیری» (POST /api/backup) — ۱۰ نسخه آخر در backups/ نگه داشته می‌شود

# در cron (نسخه‌ی بدون نیاز به نشست کاربری):
cat > /etc/cron.daily/yasnafit-backup <<'CRON'
#!/bin/sh
set -e
cd /srv/yasnafit
install -d -m 700 -o yasnafit -g yasnafit backups
cp -a data/yasnafit.db backups/yasnafit-$(date +%F-%H%M).db
cp -a data/yasnafit.db-wal backups/yasnafit-$(date +%F-%H%M).db-wal 2>/dev/null || true
ls -1t backups/yasnafit-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
CRON
chmod +x /etc/cron.daily/yasnafit-backup
```

برای بازگردانی: سرور را متوقف کنید، `data/yasnafit.db*` را با نسخه سالم عوض کنید و دوباره
راه بیندازید (مایگریشن‌ها خودکار اجرا می‌شوند).

## ۷. به‌روزرسانی

```bash
cd /srv/yasnafit
git fetch origin && git merge --ff-only origin/main
npm test && sudo systemctl restart yasnafit
```

`public/*` را می‌توان بدون ری‌استارت عوض کرد (از روی دیسک سرو می‌شود)، اما هر تغییری در
`server.js` یا `src/*` نیاز به ری‌استارت سرویس دارد. روی ویندوز همان `YASNAFIT-LAUNCHER.bat`
(گزینه به‌روزرسانی/بررسی کد) کار می‌کند.

## ۸. چک‌لیست پیش از باز کردن سرویس

- [ ] `node -v` ≥ 22.5 و `npm test` سبز (۱۸ سوئیت)
- [ ] `YASNAFIT_HOST=127.0.0.1` و پورت 3020 در فایروال بسته
- [ ] TLS فعال، `http` فقط ریدایرکت ۳۰۱
- [ ] `YASNAFIT_TRUST_PROXY=1` + `YASNAFIT_COOKIE_SECURE=1` + `NODE_ENV=production`
- [ ] `curl -I https://domain/` → CSP، `X-Frame-Options: DENY`، `nosniff` دیده شود
- [ ] `curl https://domain/api/test/reset-rate-limit -X POST` → ۴۰۴
- [ ] `curl https://domain/api/health` → فقط `{ok,status,version,uptime}` (بدون تعداد شاگرد/پورت)
- [ ] `curl https://domain/api/build` → ۴۰۱ برای کاربر ناشناس
- [ ] `data/` و `backups/` با مجوز ۷۰۰، `smtp.json` با ۶۰۰
- [ ] کلید TOTP مربی در گوشی ذخیره و یک بکاپ تست‌شده در جای دیگر گرفته شده

---

## ۹. استقرار روی Railway (سرور ابری + Volume)

این برنامه روی Railway هم بالا می‌آید، ولی چون stateful است (SQLite + آپلودها) **باید Volume بگیرد**، وگرنه هر deploy همه‌چیز را پاک می‌کند. پیکربندی build/deploy داخل خود مخزن است: `railway.json` (و `package-lock.json` هم commit شده تا هر builder — Nixpacks یا Railpack — پروژهٔ Node را بدون ابهام تشخیص بدهد؛ پروژه هیچ وابستگی نصب‌کردنی ندارد) (builder: Nixpacks، `buildCommand` با `node --check server.js` تا کد خراب همان‌جا رد شود، `startCommand: node server.js`، `healthcheckPath: /api/health`، `restartPolicyType: ON_FAILURE`، `numReplicas: 1` و `watchPatterns` تا فقط تغییر واقعی باعث build شود).

### ۹.۱ مراحل (حدود ۵ دقیقه)

1. **New Project → Deploy from GitHub repo** → `cryptojavan17-hub/yasnafit` و **شاخهٔ درست را انتخاب کنید** (تا PR #2 merge نشده، همان شاخهٔ `arena/…`؛ `main` فعلاً فقط `README.md` و `login-hero.png` دارد و **هیچ کدی در آن نیست** ⇒ build روی `main` حتماً می‌شکند، §۹.۷).
2. روی سرویس: **Right click → Attach Volume** و Mount Path را `/app/data` (یا `/data`) بگذارید. برنامه خودش `RAILWAY_VOLUME_MOUNT_PATH` را که Railway به‌صورت خودکار inject می‌کند دنبال می‌کند (`src/storage-paths.js`)، پس هر دو مسیر کار می‌کند؛ با این کار دیتابیس، آپلودهای خصوصی شاگرد (`assessments/`, `assessment-documents/`)، `smtp.json`، `coach-authenticator.txt` و **بکاپ‌ها** روی دیسک دائمی می‌نشینند. ⚠️ بعد از اینکه داده‌ای روی Volume نوشته شد، **mount path را عوض نکنید** — مسیر فایل‌های خصوصی در DB به‌صورت absolute ذخیره می‌شود.
3. در **Variables** این نام‌ها را ست کنید (مقادیر محرمانه را فقط در همان داشبورد بگذارید؛ هیچ رمزی در این فایل نمی‌آید):

| متغیر | مقدار | چرا |
|---|---|---|
| `PORT` | لازم نیست | Railway خودش می‌دهد؛ `listenHost` هم پیش‌فرض `0.0.0.0` است و **ست نکنید** |
| `NODE_ENV` | `production` | حذف `POST /api/test/reset-rate-limit` و رفتار پروداکشن |
| `YASNAFIT_TRUST_PROXY` | `1` | ترافیک فقط از پروکسی Railway می‌آید ⇒ IP واقعی برای rate-limit و تشخیص HTTPS |
| `YASNAFIT_COOKIE_SECURE` | `1` | کوکی نشست‌ها حتماً `Secure` بخورد |
| `YASNAFIT_BACKUP_DIR` | لازم نیست | وقتی Volume وصل باشد بکاپ به‌صورت خودکار داخل آن می‌نشیند؛ فقط اگر خواستید جای دیگری برود ستش کنید |
| `YASNAFIT_ALLOW_REMOTE_SETUP` | `1` **فقط موقتاً** | برای اولین ورود — بند ۹.۳ را ببینید |

   اگر build نسخهٔ Node قدیمی گرفت: `NIXPACKS_NODE_VERSION=22`؛ اگر روی Volume خطای `EACCES` دیدید: `RAILWAY_RUN_UID=0`.
4. **Settings → Networking → Generate Domain** ⇒ `https://<name>.up.railway.app`.
5. Deploy را ببینید؛ در لاگ باید این خطوط باشد: `Imported 2707 exercises from JSON`، `Application version: …`، `Build stamp: …` و `[Security] …` (اگر پرچمی خاموش باشد هشدار می‌دهد).

### ۹.۲ اولین بالا آمدن چه کار می‌کند
۳۰ مایگریشن خودکار اجرا می‌شود و بانک حرکات از `data-source/exercises_data.json` (که در git هست) seed می‌شود ⇒ سرور تازه با ۲۷۰۷ حرکت بالا می‌آید و دیتابیس کاربری خالی است.

### ۹.۳ ساخت حساب مربی (نکتهٔ امنیتی مهم)
`POST /api/coach/auth/setup` عمداً **فقط از لوپ‌بک** کار می‌کند، پس از آدرس عمومی Railway همان اول نمی‌توانید حساب بسازید. راه مجاز:

1. موقتاً `YASNAFIT_ALLOW_REMOTE_SETUP=1` بگذارید و redeploy کنید،
2. به `https://<domain>/coach/setup` بروید و اکانت را بسازید (ایمیل مربی در کد قفل است)،
3. `data/coach-authenticator.txt` روی Volume نوشته می‌شود ⇒ کلید TOTP را در Google Authenticator وارد کنید (محتوای فایل از لاگ سرویس هم خوانده می‌شود)،
4. **متغیر را پاک کنید** و دوباره redeploy کنید.

برای ایمیل بازیابی هم بعد از ورود به `/coach/mail` بروید و App Password جیمیل را وارد کنید (در `data/smtp.json` روی Volume ذخیره می‌شود؛ نیاز به متغیر محیطی ندارد).

### ۹.۴ محدودیت‌ها و ریسک‌های واقعی Railway
* **عکس/ویدیوی حرکات روی سرور نیست:** `public/assets/images/exercises/imported/` (۱۸۸۸ فایل ~۶۰MB) عمداً در `.gitignore` است، پس Railway آن‌ها را دریافت نمی‌کند؛ UI با placeholder (`/blank-white.svg`) کار می‌کند. برای آوردنشان باید یک‌بار داخل Volume کپی شوند (سرویس موقت با همان Volume + rsync) — فعلاً انجام نشده.
* **هر سرویس فقط یک Volume** دارد و با replica کار نمی‌کند؛ `numReplicas: 1` در `railway.json` هم به همین دلیل قفل شده است.
* **حجم Volume روی پلن رایگان/trial کوچک است** (در حد ۰٫۵GB). چرخش ۱۰ نسخهٔ بکاپ از همان فضا کم می‌کند؛ اگر جا کم آوردید `YASNAFIT_BACKUP_DIR` را به بیرون Volume منتقل کنید (آگاه باشید که آن‌وقت بکاپ‌ها با redeploy می‌پرند).
* **پایان ماه رایگان:** اگر سرویس/Volume پاک شود، داده از دست می‌رود. **قبل از آن**: از پنل «پشتیبان‌گیری» (یا `POST /api/backup` با نشست مربی) بکاپ بگیرید و فایل `yasnafit-*.db` را از Volume بیرون بکشید و در دیسک شخصی/فضای ابری دیگر نگه دارید. بازگردانی = گذاشتن فایل به‌جای `data/yasnafit.db` و restart.
* **انتقال دادهٔ لوکال به Railway:** از داشبورد راهی برای آپلود فایل روی Volume نیست، ولی با CLI شدنی است: `railway volume browse` (upload/download — §۹.۶). دو گزینه: (الف) از صفر شروع کنید و لوکال را مدتی موازی نگه دارید — ساده‌ترین و بی‌ریسک‌ترین (حرکت‌ها خودکار seed می‌شوند)؛ (ب) `data\yasnafit.db` لوکال (بعد از بستن سرور لوکال تا WAL checkpoint شود) را داخل Volume بگذارید و redeploy کنید. endpoint ادمینی «restore from upload» عمداً ساخته نشد؛ اگر روزی لازم شد، API جدید است و فقط با تأیید صریح مالک.

### ۹.۵ راستی‌آزمایی پس از deploy
```bash
curl -s  https://<domain>/api/health                        # {"ok":true,"status":"ok","version":"…","uptime":…}
curl -i  https://<domain>/                                  # 303 به /coach/login + CSP و X-Frame-Options
curl -i  https://<domain>/api/build                         # 401 بدون کوکی مربی
curl -i -X POST https://<domain>/api/test/reset-rate-limit   # 404 چون NODE_ENV=production
```
سپس در مرورگر: `/coach/login` ← «ادامه» ← `/coach/2fa` ← ورود. یک شاگرد بسازید و **یک redeploy بزنید**: اگر همان شاگرد سر جایش ماند، Volume درست وصل است.

### ۹.۶ روش سریع با Railway CLI (بدون داشبورد)
اگر CLI را نصب دارید (`npm i -g @railway/cli` یا `curl -fsSL cli.new | sh`)، همهٔ کارها از ترمینال هم می‌شود — لاگین را خودتان انجام دهید (توکن را در چت/فایل نگه دارید نه در history):

```bash
railway login --browserless          # احراز هویت با مرورگر، بدون نیاز به باز کردن داشبورد
railway init -n yasnafit             # یا railway link برای اتصال به پروژهٔ موجود
railway up --detach                  # اولین deploy از همین پوشه
railway volume add --mount-path /app/data --name yasnafit-data
railway variables --set "NODE_ENV=production" --set "YASNAFIT_TRUST_PROXY=1" --set "YASNAFIT_COOKIE_SECURE=1"
railway domain                       # ساخت دامنهٔ عمومی *.up.railway.app
railway logs --limit 80              # باید «Imported 2707 exercises…» و «Build stamp: …» دیده شود
```

**انتقال دیتابیس لوکال به Volume** (چیزی که از داشبورد نشدنی بود، با CLI شدنی است): `railway volume browse` یک مرورگر فایل تعاملی دارد که **upload/download** هم می‌کند؛ با آن `data\yasnafit.db` را داخل Volume بگذارید (فایل‌های `-wal`/`-shm` را نبرید؛ اگر بودند، اول سرور لوکال را ببندید تا checkpoint شود) و بعد سرویس را `railway redeploy` کنید. برای کارهای یک‌باره هم `railway ssh -s <service> -- <cmd>` موجود است.

> اگر این کار را کردید، حتماً بعد از بالا آمدن سرویس، تعداد شاگردان را با لوکال مقایسه کنید و **یک‌بار redeploy بزنید** تا مطمئن شوید داده روی Volume ماند.

### ۹.۷ عیب‌یابی: اولین build چرا شکست خورد؟

| چیزی که در لاگ می‌بینید | معنی دقیق | کار |
|---|---|---|
| `The app contents that Railpack analyzed contains: ./ ├── README.md └── login-hero.png` | سرویس **شاخهٔ `main`** را build می‌کند؛ `main` در این مخزن فقط یک مخزنِ تصویر/README است و `package.json` و `server.js` ندارد | Service → **Settings → Source → Branch** را روی `arena/01a0618b-yasnafit` (یا `main` بعد از merge PR #2) بگذارید و **Redeploy** |
| `⚠ Script start.sh not found` + `✖ Railpack could not determine how to build the app` | همان مورد بالا: builder هیچ پروژه‌ای پیدا نکرده. روی شاخه‌های برنامه این خطا تکرار نمی‌شود، چون `railway.json` (همان‌جا commit شده) `builder: NIXPACKS` و `startCommand: node server.js` را دیکته می‌کند | شاخه را درست کنید؛ اگر خواستید از Railpack استفاده کنید، `package-lock.json` (که برای همین کار commit شده) و `startCommand` را چک کنید |
| `Railpack could not determine how to build the app` ولی درخت، `package.json` دارد | builder روی Railpack قفل شده (تنظیم سرویس) و چیزی برای تشخیص Node پیدا نکرده | یا `builder` سرویس را روی **Nixpacks** بگذارید، یا بگذارید `railway.json` حاکم باشد (تنظیم دستی داشبورد بر config-as-code اولویت دارد) |
| build با Node قدیمی / خطای syntax | نسخهٔ Node ایمیج | `NIXPACKS_NODE_VERSION=22` |
| `EACCES` روی `mkdir` مسیر Volume | کانتینر با کاربر non-root اجرا می‌شود | `RAILWAY_RUN_UID=0` |
| deploy موفق ولی بعد از redeploy همه‌چیز خالی | **Volume وصل نیست** یا mount path عوض شده | §۹.۱ بند ۲؛ هرگز mount path را بعد از نوشتن داده تغییر ندهید |

**نکتهٔ ترتیب کار:** هیچ لاگ build را با «برنامه خراب است» اشتباه نگیرید — تا وقتی درخت build شامل `server.js` نباشد، کد اصلاً اجرا نشده. بعد از هر deploy هم اول `GET /api/health` را چک کنید (§۹.۵).
