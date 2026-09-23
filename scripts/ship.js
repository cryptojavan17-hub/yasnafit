#!/usr/bin/env node
'use strict';
/**
 * ship — یک‌چیزی برای دیپلوی سریع و امن روی Railway.
 *
 *   npm run ship            = چک حجم آپلود + تست‌ها + دیپلوی + تأیید سایت
 *   npm run ship -- --fast  = بدون تست (فقط چک حجم، دیپلوی، تأیید)
 *
 * چرا این اسکریپت وجود دارد: آپلود لوکال Railway حدود ~65KB/s روی این اینترنت
 * است و CLI بعد از ~120 ثانیه timeout می‌کند، یعنی مجموعهٔ آپلود باید زیر
 * ~7MB بماند. این اسکریپت جلوی دیپلویِ حجیم را می‌گیرد، بعد تست می‌زند و بعد
 * تأیید می‌کند سایت و عکس‌ها واقعاً بالا آمده‌اند.
 *
 * متغیرها:
 *   SHIP_MAX_MB     سقف حجم آپلود (پیش‌فرض 7)
 *   SHIP_BASE_URL   آدرس سایت برای تأیید (پیش‌فرض https://yasnafit.ir)
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const FAST = ARGS.includes('--fast') || ARGS.includes('--skip-tests');
const MAX_MB = Number(process.env.SHIP_MAX_MB || 7);
const BASE = (process.env.SHIP_BASE_URL || 'https://yasnafit.ir').replace(/\/+$/, '');

const t0 = Date.now();
const say = (...a) => console.log(...a);
const step = (n, total, msg) => say(`\n[${n}/${total}] ${msg}`);
const ok = (msg) => say(`   ✅ ${msg}`);
const warn = (msg) => say(`   ⚠️  ${msg}`);
const fail = (msg) => say(`   ❌ ${msg}`);
const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;

function run(cmd, opts = {}) {
  const r = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: opts.timeout || 15 * 60 * 1000,
    env: process.env,
  });
  return {
    status: r.status === null ? 1 : r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    error: r.error,
  };
}

/* ─────────────────────────── ۱. حجم آپلود ─────────────────────────── */

function loadIgnoreRules() {
  const p = path.join(ROOT, '.railwayignore');
  if (!fs.existsSync(p)) return { rules: null, exists: false };
  const rules = fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
  return { rules, exists: true };
}

// تقریبِ رفتار gitignore برای همان چیزهایی که در .railwayignore استفاده می‌کنیم:
//   /ریشه/فایل  → فقط از ریشه     مسیر/با/اسلش  → پیشوند-مسیر
//   *.پسوند     → پسوند هر فایل   اسمِ裸         → هر جزء از مسیر
function isIgnored(file, rules) {
  const parts = file.split('/');
  const base = parts[parts.length - 1];
  return rules.some((rule) => {
    let r = rule;
    const rootOnly = r.startsWith('/');
    if (rootOnly) r = r.slice(1);
    if (r.endsWith('/')) r = r.slice(0, -1);
    if (!r) return false;
    if (r.includes('*')) {
      const re = new RegExp(
        '^' + r.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
      );
      return re.test(file) || re.test(base);
    }
    if (rootOnly || r.includes('/')) return file === r || file.startsWith(r + '/');
    return parts.includes(r);
  });
}

function checkPayload() {
  step(1, FAST ? 4 : 5, 'چک حجم آپلود (باید زیر ' + MAX_MB + 'MB بماند)…');
  const { rules, exists } = loadIgnoreRules();
  if (!exists) {
    fail('.railwayignore وجود ندارد — آپلود شامل .git (چند گیگ) می‌شود و timeout می‌خورد.');
    say('   راه‌حل: فایل .railwayignore را از تاریخ گیت برگردان:  git checkout HEAD -- .railwayignore');
    return false;
  }
  const files = run('git ls-files').out.split(/\r?\n/).filter(Boolean);
  let total = 0;
  const big = [];
  for (const f of files) {
    if (isIgnored(f, rules)) continue;
    let st;
    try {
      st = fs.statSync(path.join(ROOT, f));
    } catch {
      continue;
    }
    total += st.size;
    if (st.size > 300 * 1024) big.push([st.size, f]);
  }
  const mb = total / 1048576;
  big.sort((a, b) => b[0] - a[0]);
  for (const [s, f] of big.slice(0, 5)) say(`      ${(s / 1048576).toFixed(2)} MB  ${f}`);
  say(`      جمع: ${mb.toFixed(2)} MB از ${files.length} فایل`);
  if (mb > MAX_MB) {
    fail(`${mb.toFixed(2)}MB بیشتر از سقف ${MAX_MB}MB است → آپلود timeout می‌خورد.`);
    say('   قاعده: عکس‌ها را JPEG کیفیت ۸۸ نگه دار (نه PNG) و فایل حجیم جدید اضافه نکن.');
    return false;
  }
  ok(`حجم سالم است (${mb.toFixed(2)}MB ≤ ${MAX_MB}MB)`);
  return true;
}

/* ─────────────────────── ۲. وضعیت گیت (اطلاع‌رسانی) ─────────────────────── */

function reportGit() {
  const status = run('git status --porcelain').out.split(/\r?\n/).filter(Boolean);
  const branch = run('git rev-parse --abbrev-ref HEAD').out.trim();
  const unpushed = run('git rev-list --count @{u}..HEAD').out.trim();
  if (status.length) {
    warn(`${status.length} تغییر کامیت‌نشده داری (دیپلوی از درخت محلی است، پس همین‌ها می‌روند):`);
    for (const l of status.slice(0, 8)) say(`      ${l}`);
  } else {
    ok('درخت گیت تمیز است');
  }
  if (/^\d+$/.test(unpushed) && Number(unpushed) > 0)
    warn(`${unpushed} کامیت هنوز push نشده:  git push origin ${branch}`);
}

/* ─────────────────────────── ۳. تست‌ها ─────────────────────────── */

function runTests() {
  step(2, 5, 'اجرای کامل تست‌ها (npm run test)…');
  const logPath = path.join(ROOT, 'logs', 'ship-test.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  } catch {}
  const started = Date.now();
  const r = run('npm run test');
  fs.writeFileSync(logPath, r.out, 'utf8');
  const duration = Math.round((Date.now() - started) / 1000);
  const suites = (r.out.match(/> node tests\//g) || []).length;
  if (r.status === 0) {
    ok(`${suites} سویئت پاس شد (${duration}s) — لاگ: logs/ship-test.log`);
    return true;
  }
  fail(`تست‌ها شکست خوردند (${duration}s). آخرین خروجی:`);
  say(r.out.split(/\r?\n/).slice(-30).map((l) => '      ' + l).join('\n'));
  say('   لاگ کامل: logs/ship-test.log');
  return false;
}

/* ─────────────────────────── ۴. دیپلوی ─────────────────────────── */

function deploy() {
  step(3, FAST ? 3 : 5, 'دیپلوی با railway up --detach …');
  const r = run('railway up --detach --json', { timeout: 10 * 60 * 1000 });
  const m = r.out.match(/\{[\s\S]*?"deploymentId"[\s\S]*?\}/);
  if (r.status !== 0 || !m) {
    fail('دیپلوی شروع نشد:');
    say(r.out.split(/\r?\n/).slice(-15).map((l) => '      ' + l).join('\n'));
    return null;
  }
  let id = null;
  try {
    id = JSON.parse(m[0]).deploymentId;
  } catch {}
  ok(`آپلود رفت → deployment ${id ? id.slice(0, 8) : '?'}`);
  return id;
}

function waitDeploy(id) {
  say('   … منتظر build/deploy (هر ۱۵ ثانیه چک می‌شود)');
  for (let i = 1; i <= 40; i++) {
    const r = run('railway deployment list --json');
    let st = 'UNKNOWN';
    try {
      const j = JSON.parse(r.out);
      const d = Array.isArray(j) ? j.find((x) => x.id === id) || j[0] : null;
      st = d ? d.status : 'UNKNOWN';
    } catch {}
    say(`      [${i}] ${st}`);
    if (st === 'SUCCESS') return true;
    if (['FAILED', 'CRASHED', 'CANCELED', 'REMOVED'].includes(st)) {
      fail(`دیپلوی با وضعیت ${st} تمام شد — لاگ‌ها: https://railway.com (deployment ${id})`);
      return false;
    }
    spawnSync('node', ['-e', 'setTimeout(()=>process.exit(0), 15000)']); // sleep 15s
  }
  fail('زمان انتظار دیپلوی تمام شد.');
  return false;
}

/* ─────────────────────────── ۵. تأیید سایت ─────────────────────────── */

function get(url, timeout = 20000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const abs = new URL(res.headers.location, url).toString();
        return resolve(get(abs, timeout));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) })
      );
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, type: '', body: Buffer.from(String(e.message)) }));
  });
}

async function verify() {
  step(FAST ? 4 : 5, 5, `تأیید سایت ${BASE} …`);
  let bad = 0;

  const health = await get(`${BASE}/api/health`);
  if (health.status === 200) {
    let body = '';
    try {
      body = JSON.parse(health.body.toString('utf8')).status || '';
    } catch {}
    body === 'ok' ? ok('/api/health → 200 ok') : (fail(`/api/health → 200 ولی status=${body || '?'}`), bad++);
  } else {
    fail(`/api/health → ${health.status}`);
    bad++;
  }

  for (const p of ['/', '/about', '/coach/login', '/student/login']) {
    const r = await get(BASE + p);
    if (r.status === 200) ok(`${p} → 200`);
    else {
      fail(`${p} → ${r.status}`);
      bad++;
    }
  }

  // فقط عکس‌هایی که واقعاً در ریپو هستند چک می‌شوند (اگر PNG برگشت، 404 می‌شود)
  const imgs = [
    'public/images/landing/hero.jpg',
    'public/images/landing/about-me.jpg',
    'public/login-hero.jpg',
    'public/guides/female-front-flex.jpg',
  ].filter((f) => fs.existsSync(path.join(ROOT, f)));
  const missing = [];
  for (const f of imgs) {
    const url = BASE + '/' + f.replace(/^public\//, '');
    const r = await get(url);
    const good = r.status === 200 && (r.type || '').includes('image/');
    if (!good) missing.push(`${url.replace(BASE, '')} → ${r.status}`);
  }
  if (missing.length) {
    fail(`عکس(ها) مشکل دارند: ${missing.join(' ، ')}`);
    bad++;
  } else if (imgs.length) {
    ok(`${imgs.length} عکس اصلی (هیرو/درباره من/راهنماها) با 200 image/* بالا است`);
  }

  return bad === 0;
}

/* ─────────────────────────── اجرا ─────────────────────────── */

(async () => {
  say(`\n══ ship ══  شاخه: ${run('git rev-parse --abbrev-ref HEAD').out.trim()} · ${new Date().toISOString()}`);

  if (!checkPayload()) {
    say(`\n⛔ متوقف شد (حجم آپلود). ${secs()}`);
    process.exit(1);
  }

  step(2, FAST ? 4 : 5, 'وضعیت گیت');
  reportGit();

  if (!FAST) {
    if (!runTests()) {
      say(`\n⛔ متوقف شد (تست). ${secs()}`);
      process.exit(1);
    }
  } else {
    warn('--fast: تست‌ها رد شد');
  }

  const id = deploy();
  if (!id) {
    say(`\n⛔ متوقف شد (دیپلوی). ${secs()}`);
    process.exit(1);
  }
  if (!waitDeploy(id)) {
    say(`\n⛔ دیپلوی ناموفق. ${secs()}`);
    process.exit(1);
  }
  ok('دیپلوی SUCCESS');

  const good = await verify();
  say(good ? `\n🚀 همه‌چیز سبز است — ${BASE}  (${secs()})\n` : `\n⛔ تأیید سایت ناقص ماند. ${secs()}\n`);
  process.exit(good ? 0 : 1);
})();
