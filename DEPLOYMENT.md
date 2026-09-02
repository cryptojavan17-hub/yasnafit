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
