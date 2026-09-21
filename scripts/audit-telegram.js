'use strict';
// Bounded, local-only Telegram audit — revised 2026-09-21 for the owner spec
// («دکمهٔ اتصال به ربات تلگرام برای کاربران مهمان»): the public surface is a
// plain deep link and nothing is collected, stored or verified, so this script
// observes THAT contract instead of the removed username form. It never accepts
// a target URL and never touches the operator's DB, bot token or real accounts.
// Optional --browser requires an independently installed Playwright + Chromium.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const http = require('node:http'), net = require('node:net'), crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const sessions = require('../src/student-session-service');
const settings = require('../src/public-content-service');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-telegram-audit-'));
const dbPath = path.join(dir, 'yasnafit.db');
const output = path.join(root, 'logs', 'telegram-audit.json');
const DEFAULT_BOT_URL = 'https://t.me/yasnafitbot?start=landing';
let db, server, browser, attacker;
const report = {
  recorded_at: new Date().toISOString(),
  reviewed_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Temporary SQLite, synthetic accounts, real local HTTP API. No Telegram API requests, bot token, real-user data or live delivery. Observations are NOT a security approval and NOT proof of a working bot.',
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  observations: {}, browser: { run: false }
};
const observations = report.observations;
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
const rounded = n => Math.round(n * 100) / 100;
function timings(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return { n: s.length, p50_ms: rounded(s[Math.ceil(s.length * .5) - 1]), p95_ms: rounded(s[Math.ceil(s.length * .95) - 1]), max_ms: rounded(s.at(-1)) };
}
const botLinks = html => [...html.matchAll(/href="(https:\/\/t\.me\/[^"]*)"/g)].map(m => m[1]);
(async () => {
  db = new DatabaseSync(dbPath); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  runMigrations(db);
  const add = db.prepare("INSERT INTO students(stable_id, full_name, status, version, password_state) VALUES (?,?,'فعال',1,'PERSONAL')");
  const a = Number(add.run(crypto.randomUUID(), 'شاگرد آزمایشی الف').lastInsertRowid);
  const b = Number(add.run(crypto.randomUUID(), 'شاگرد آزمایشی ب').lastInsertRowid);
  const rawA = sessions.createStudentSession(db, a).raw_session;
  const cookieA = `${sessions.SESSION_COOKIE}=${rawA}`;
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', PORT: String(port), YASNAFIT_HOST: '0.0.0.0', YASNAFIT_DATA_DIR: dir, YASNAFIT_BACKUP_DIR: path.join(dir, 'backups'), YASNAFIT_MEDIA_DIR: path.join(dir, 'media'), YASNAFIT_REVEAL_AUTHENTICATOR_KEY: '0', YASNAFIT_ALLOW_2FA_SKIP: '0', YASNAFIT_TRUST_PROXY: '0' } });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch (_) {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw new Error('Temporary audit server did not start');
  async function request(url, { method = 'GET', body, cookie, headers = {}, raw } = {}) {
    const response = await fetch(base + url, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw, signal: AbortSignal.timeout(5000) });
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: response.status, data, no_store: response.headers.get('cache-control') === 'no-store' };
  }
  const count = () => db.prepare('SELECT COUNT(*) n FROM telegram_bot_connections').get().n;
  const handle = id => db.prepare('SELECT telegram_id FROM students WHERE id=?').get(id).telegram_id;

  // 1) The guest control is a deep link: header + CTA band, same URL, no form.
  //    The landing lives on /home since 2026-09-21 («/» = student entry page).
  const home = await request('/home');
  const links = botLinks(home.data);
  observations.landing = {
    status: home.status,
    telegram_links: links,
    every_link_is_the_bot_deep_link: links.length > 0 && links.every(url => url === DEFAULT_BOT_URL),
    header_link: links.includes(DEFAULT_BOT_URL),
    username_form_markup_present: /data-telegram-bot|tg-dialog|name="telegram_id"/.test(home.data),
    landing_js_has_modal: (await request('/landing.js')).data.includes('tg-dialog'),
    link_rel_ok: /href="https:\/\/t\.me\/[^"]+"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(home.data)
  };
  const publicPages = {};
  for (const page of ['/magazine', '/about', '/services', '/contact']) publicPages[page] = botLinks((await request(page)).data).filter(url => url === DEFAULT_BOT_URL).length;
  observations.landing.every_public_page_has_the_header_link = Object.values(publicPages).every(n => n === 1);

  // 2) The public write/read endpoints are gone: unknown /api paths stop at the
  //    coach gate (401), so no anonymous or student request can store a username.
  const rowsBefore = count(), handleBefore = handle(a);
  observations.removed_endpoints = {
    get_anonymous: (await request('/api/telegram-bot')).status,
    post_anonymous: (await request('/api/telegram-bot/connect', { method: 'POST', body: { telegram_id: 'audit_anonymous' } })).status,
    post_student_session: (await request('/api/telegram-bot/connect', { method: 'POST', cookie: cookieA, body: { telegram_id: 'audit_student' } })).status,
    delete_anonymous: (await request('/api/telegram-bot/connect', { method: 'DELETE' })).status,
    post_without_json_content_type: (await request('/api/telegram-bot/connect', { method: 'POST', raw: JSON.stringify({ telegram_id: 'audit_plain' }), headers: { 'Content-Type': 'text/plain', Origin: 'https://untrusted.example' } })).status,
    connection_rows_added: count() - rowsBefore,
    student_handle_unchanged: handle(a) === handleBefore
  };

  // 3) The profile contact field still behaves like the rest of the student API
  //    (own session only, cross-origin mutation rejected) — it is a contact
  //    handle, not a verified bot connection.
  observations.profile_contact_field = {
    own_session_put: (await request('/api/student/profile', { method: 'PUT', cookie: cookieA, body: { telegram_id: '@audit_contact' } })).status,
    stored_handle: handle(a),
    cross_origin_put: (await request('/api/student/profile', { method: 'PUT', cookie: cookieA, body: { telegram_id: '@audit_cross' }, headers: { Origin: 'https://untrusted.example' } })).status,
    anonymous_put: (await request('/api/student/profile', { method: 'PUT', body: { telegram_id: '@audit_anon' } })).status,
    connection_rows_added: count() - rowsBefore
  };

  // 4) The configured bot username drives the link; a junk value falls back to
  //    the default bot so the button can never point at a dead target.
  settings.updateSiteSettings(db, { 'site.telegram_bot_username': 'yasnafit_audit_bot' });
  observations.configured_username = { link: botLinks((await request('/home')).data).at(0) };
  settings.updateSiteSettings(db, { 'site.telegram_bot_username': 'not a bot/url' });
  observations.invalid_username_fallback = { link: botLinks((await request('/home')).data).at(0), expected: DEFAULT_BOT_URL };
  settings.updateSiteSettings(db, { 'site.telegram_bot_username': '' });

  // 5) Local sample of the landing page render only. This is NOT bot throughput,
  //    not Telegram latency and not a capacity claim.
  const samples = [];
  for (let i = 0; i < 5; i++) await request('/home');
  for (let i = 0; i < 40; i++) { const t = performance.now(); await request('/home'); samples.push(performance.now() - t); }
  const followedStudent = await request('/home', { cookie: cookieA });
  report.local_load_sample = {
    note: 'Sequential GET /home (landing SSR) on one temporary loopback server. No Telegram call was made; no throughput or SLA claim.',
    landing_render: timings(samples),
    landing_status_with_student_cookie: followedStudent.status,
    same_link_for_signed_in_visitor: botLinks(followedStudent.data).every(url => url === DEFAULT_BOT_URL)
  };

  if (process.argv.includes('--browser')) {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, executablePath: process.env.YASNAFIT_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await context.addCookies([{ name: sessions.SESSION_COOKIE, value: rawA, url: base, httpOnly: true, sameSite: 'Strict' }]);
    await context.route('https://**/*', route => route.abort()); // Never navigate to Telegram during the audit.
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(base + '/home');
    const headerLink = page.locator(`.site-header__actions a[href="${DEFAULT_BOT_URL}"]`);
    const ctaLink = page.locator(`.telegram-cta a[href="${DEFAULT_BOT_URL}"]`);
    report.browser = {
      run: true,
      chromium: browser.version(),
      header_link_visible: await headerLink.isVisible(),
      cta_link_visible: await ctaLink.isVisible(),
      header_target_blank: await headerLink.getAttribute('target') === '_blank',
      header_rel: await headerLink.getAttribute('rel'),
      dialog_after_click: await (async () => { await headerLink.click({ modifiers: ['Control'] }).catch(() => {}); await page.waitForTimeout(150); return page.locator('.tg-dialog').count(); })()
    };
    await page.setViewportSize({ width: 390, height: 844 });
    report.browser.mobile_document_overflow_px = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
    report.browser.mobile_cta_visible = await page.locator('.telegram-cta a[href="' + DEFAULT_BOT_URL + '"]').isVisible();
    // The student profile card is a contact handle now: saving it must not create
    // a «connection» row and must keep the visitor on the profile page.
    await page.goto(base + '/student/profile');
    await page.locator('#telegramForm').waitFor();
    const rowsBeforeCard = count();
    const saved = page.waitForResponse(r => r.url() === base + '/api/student/profile' && r.request().method() === 'PUT');
    await page.locator('#telegramForm input').fill('audit_profile_ui');
    await page.locator('#telegramForm button').click();
    report.browser.profile_card = { status: (await saved).status(), handle_saved: handle(a) === '@audit_profile_ui', connection_rows_added: count() - rowsBeforeCard, stayed_on_profile: page.url() === base + '/student/profile' };
    report.browser.page_errors = pageErrors;
  }

  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Audit observations written to logs/telegram-audit.json. This is not a security approval and not proof of a working bot.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (attacker) await new Promise(r => attacker.close(r));
  if (server && server.exitCode === null && server.signalCode === null) { const done = new Promise(r => server.once('exit', r)); server.kill(); await done; }
  if (db) db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
