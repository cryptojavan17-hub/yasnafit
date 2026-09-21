'use strict';
// Bounded, local-only characterization audit. Records defects; NOT a security-pass test.
// Never accepts a target URL or accesses the operator's DB/bot credentials.
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
let db, server, browser, attacker;
const report = {
  recorded_at: new Date().toISOString(),
  reviewed_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  scope: 'Temporary SQLite, synthetic accounts, real local HTTP API. No Telegram API requests, credentials, real-user data or live bot delivery. Observations are NOT assertions that behavior is secure.',
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
(async () => {
  db = new DatabaseSync(dbPath); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  runMigrations(db);
  const add = db.prepare("INSERT INTO students(stable_id, full_name, status, version, password_state) VALUES (?,?,'فعال',1,'PERSONAL')");
  const a = Number(add.run(crypto.randomUUID(), 'شاگرد آزمایشی الف').lastInsertRowid);
  const b = Number(add.run(crypto.randomUUID(), 'شاگرد آزمایشی ب').lastInsertRowid);
  const rawA = sessions.createStudentSession(db, a).raw_session;
  const rawB = sessions.createStudentSession(db, b).raw_session;
  const cookieA = `${sessions.SESSION_COOKIE}=${rawA}`, cookieB = `${sessions.SESSION_COOKIE}=${rawB}`;
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', PORT: String(port), YASNAFIT_HOST: '0.0.0.0', YASNAFIT_DATA_DIR: dir, YASNAFIT_BACKUP_DIR: path.join(dir, 'backups'), YASNAFIT_MEDIA_DIR: path.join(dir, 'media'), YASNAFIT_REVEAL_AUTHENTICATOR_KEY: '0', YASNAFIT_ALLOW_2FA_SKIP: '0', YASNAFIT_TRUST_PROXY: '0' } });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch (_) {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw new Error('Temporary audit server did not start');
  async function request(url, { method = 'GET', body, cookie, headers = {}, raw } = {}) {
    const response = await fetch(base + url, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw, signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json(), no_store: response.headers.get('cache-control') === 'no-store' };
  }
  const connect = (value, options = {}) => request('/api/telegram-bot/connect', { method: 'POST', body: { telegram_id: value }, ...options });
  const count = () => db.prepare('SELECT COUNT(*) n FROM telegram_bot_connections').get().n;
  const handle = id => db.prepare('SELECT telegram_id FROM students WHERE id=?').get(id).telegram_id;
  observations.unconfigured = await connect('audit_demo');
  observations.validation = [];
  for (const [kind, value] of [['blank', ' '], ['length65', 'a'.repeat(65)], ['object', {}], ['number', 12345], ['boolean', true], ['embedded_space', 'bad name'], ['non_latin', 'نام_آزمایشی'], ['url', 'https://example.invalid/user'], ['leading_space_at', ' @audit_demo ']]) {
    const response = await connect(value);
    observations.validation.push({ kind, status: response.status, stored: response.status === 200 ? db.prepare('SELECT telegram_id FROM telegram_bot_connections ORDER BY id DESC LIMIT 1').get().telegram_id : null });
  }
  observations.invalid_json = (await request('/api/telegram-bot/connect', { method: 'POST', raw: '{broken', headers: { 'Content-Type': 'application/json' } })).status;
  observations.wrong_method = (await request('/api/telegram-bot/connect', { method: 'DELETE' })).status;
  observations.anonymous_admin_settings = (await request('/api/magazine/admin/settings')).status;
  const first = await connect('audit_a', { cookie: cookieA });
  await connect('audit_b', { cookie: cookieB });
  const ownA = await request('/api/telegram-bot', { cookie: cookieA }), ownB = await request('/api/telegram-bot', { cookie: cookieB }), anon = await request('/api/telegram-bot');
  observations.ownership = { own_a_only: ownA.data.telegram_id === '@audit_a', own_b_only: ownB.data.telegram_id === '@audit_b', anonymous_no_id: anon.data.telegram_id === null, no_store: ownA.no_store && ownB.no_store && anon.no_store, authenticated_connect: first.status };
  await connect('audit_same', { cookie: cookieA }); await connect('audit_same', { cookie: cookieB });
  observations.same_claimed_handle_on_two_accounts = handle(a) === handle(b);
  const before = count(); for (let i = 0; i < 3; i++) await connect('audit_repeat');
  observations.repeat_requests = { submitted: 3, rows_added: count() - before };
  const beforeAudit = db.prepare('SELECT COUNT(*) n FROM audit_events').get().n;
  observations.cross_origin_with_explicit_cookie = (await connect('audit_cross_origin', { cookie: cookieA, headers: { Origin: 'https://untrusted.example' } })).status;
  observations.same_attempt_via_profile = (await request('/api/student/profile', { method: 'PUT', cookie: cookieA, body: { telegram_id: '@audit_profile' }, headers: { Origin: 'https://untrusted.example' } })).status;
  observations.plain_text_body = (await request('/api/telegram-bot/connect', { method: 'POST', raw: JSON.stringify({ telegram_id: 'audit_plain' }), headers: { 'Content-Type': 'text/plain', Origin: 'https://untrusted.example' } })).status;
  observations.connection_audit_events_added = db.prepare('SELECT COUNT(*) n FROM audit_events').get().n - beforeAudit;
  // Fault injection only in the temporary DB: test atomicity of log + profile writes.
  const beforeFailure = count(), oldHandle = handle(a);
  db.exec(`CREATE TRIGGER audit_block_profile BEFORE UPDATE OF telegram_id ON students WHEN OLD.id=${a} BEGIN SELECT RAISE(ABORT,'audit simulated DB failure'); END;`);
  const failure = await connect('audit_atomic', { cookie: cookieA });
  db.exec('DROP TRIGGER audit_block_profile');
  observations.partial_write = { status: failure.status, rows_added_despite_failure: count() - beforeFailure, profile_unchanged: handle(a) === oldHandle };
  settings.updateSiteSettings(db, { 'site.telegram_bot_username': 'not a bot/url' });
  observations.invalid_bot_setting_returned = (await request('/api/telegram-bot')).data.bot_username;
  settings.updateSiteSettings(db, { 'site.telegram_bot_username': 'yasnafit_audit_bot' });
  const samples = []; // Warm-up, then sequential GET baseline.
  for (let i = 0; i < 5; i++) await request('/api/telegram-bot');
  for (let i = 0; i < 40; i++) { const t = performance.now(); await request('/api/telegram-bot'); samples.push(performance.now() - t); }
  const writes = [], health = [], statuses = {}, rowsBeforeBurst = count();
  const bytes = () => ['', '-wal', '-shm'].reduce((sum, suffix) => sum + (fs.existsSync(dbPath + suffix) ? fs.statSync(dbPath + suffix).size : 0), 0);
  const bytesBefore = bytes(), started = performance.now();
  await Promise.all([
    ...Array.from({ length: 8 }, async () => { for (let i = 0; i < 20; i++) { const t = performance.now(), r = await connect('audit_burst'); writes.push(performance.now() - t); statuses[r.status] = (statuses[r.status] || 0) + 1; } }),
    (async () => { for (let i = 0; i < 40; i++) { const t = performance.now(); await request('/api/health'); health.push(performance.now() - t); } })()
  ]);
  report.local_load_sample = { note: 'Single bounded local synthetic sample; no production capacity or Telegram latency claim. 8 POST workers + 1 health worker. DB file bytes include WAL and SHM, not durable growth per row.', sequential_get: timings(samples), anonymous_connect: timings(writes), health_during_burst: timings(health), elapsed_ms: rounded(performance.now() - started), post_statuses: statuses, rows_added: count() - rowsBeforeBurst, db_related_bytes_before: bytesBefore, db_related_bytes_after: bytes() };
  if (process.argv.includes('--browser')) {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, executablePath: process.env.YASNAFIT_BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await context.addCookies([{ name: sessions.SESSION_COOKIE, value: rawA, url: base, httpOnly: true, sameSite: 'Strict' }]);
    await context.route('https://**/*', route => route.abort()); // No real external navigation/resources.
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(base + '/');
    const prefillBefore = handle(a).replace(/^@+/, '');
    let releasePrefill; const gate = new Promise(r => { releasePrefill = r; });
    await page.route(base + '/api/telegram-bot', async route => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
    await page.locator('[data-telegram-bot]').click();
    const input = page.locator('.tg-dialog input'); await input.fill('new_unsaved_audit'); releasePrefill();
    await page.waitForFunction(v => document.querySelector('.tg-dialog input').value === v, prefillBefore);
    report.browser = { run: true, chromium: browser.version(), prefill_overwrote_typed_value: (await input.inputValue()) !== 'new_unsaved_audit' };
    await page.unroute(base + '/api/telegram-bot');
    await input.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    report.browser.focus_escaped_dialog = await page.evaluate(() => !document.activeElement.closest('.tg-dialog__backdrop'));
    await page.keyboard.press('Escape');
    report.browser.focus_restored_to_opener = await page.evaluate(() => document.activeElement.matches('[data-telegram-bot]'));
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-telegram-bot]').click();
    const modal = page.locator('.tg-dialog'); report.browser.mobile_box = await modal.boundingBox();
    report.browser.mobile_document_overflow_px = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
    // Simulated blocked popup, to examine fallback behavior without contacting Telegram.
    await page.evaluate(() => { window.__attemptedBotUrl = null; window.open = url => { window.__attemptedBotUrl = url; return null; }; });
    await input.fill('audit_browser'); await page.locator('.tg-dialog [type="submit"]').click();
    await page.waitForFunction(() => Boolean(window.__attemptedBotUrl));
    report.browser.attempted_url = await page.evaluate(() => window.__attemptedBotUrl);
    report.browser.message_when_popup_blocked = await page.locator('.tg-dialog__message').textContent();
    report.browser.fallback_links_when_popup_blocked = await modal.locator('a').count();
    await page.goto(base + '/student/profile');
    await page.locator('#telegramForm').waitFor();
    const profileRowsBefore = count();
    let profileResponse;
    const profileSaved = page.waitForResponse(r => r.url() === base + '/api/student/profile' && r.request().method() === 'PUT');
    await page.locator('#telegramForm input').fill('audit_profile_ui');
    await page.locator('#telegramForm button').click(); profileResponse = await profileSaved;
    report.browser.profile_card = { present: true, status: profileResponse.status(), handle_saved: handle(a) === '@audit_profile_ui', connection_rows_added: count() - profileRowsBefore, stayed_on_profile: page.url() === base + '/student/profile' };
    // Genuine cross-origin, same-site browser POST: Strict cookie is valid across ports.
    // This does NOT claim that a third-party cross-site attacker receives Strict cookies.
    attacker = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<title>Local audit origin</title>'); });
    await new Promise(r => attacker.listen(0, '0.0.0.0', r));
    await page.goto(`http://127.0.0.1:${attacker.address().port}/`);
    report.browser.same_site_response = await page.evaluate(async target => { try { await fetch(target + '/api/telegram-bot/connect', { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ telegram_id: 'audit_browser_same_site' }) }); return 'opaque'; } catch (_) { return 'blocked-response'; } }, base);
    report.browser.same_site_cross_origin_changed_profile = handle(a) === '@audit_browser_same_site';
    report.browser.page_errors = pageErrors;
  }
  observations.profile_clear = (await request('/api/student/profile', { method: 'PUT', cookie: cookieA, body: { telegram_id: '' } })).status;
  observations.connection_rows_retained_after_clear = db.prepare('SELECT COUNT(*) n FROM telegram_bot_connections WHERE student_id=?').get(a).n;
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('Audit observations written to logs/telegram-audit.json. This is not a security approval.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (attacker) await new Promise(r => attacker.close(r));
  if (server && server.exitCode === null && server.signalCode === null) { const done = new Promise(r => server.once('exit', r)); server.kill(); await done; }
  if (db) db.close(); fs.rmSync(dir, { recursive: true, force: true });
});
