#!/usr/bin/env node
'use strict';
// Opt-in external-network acceptance check. NEVER part of npm test. Uses a
// temporary database and the real HTTP/auth/queue/UI paths; no source overrides.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations } = require('../src/migrations');
const auth = require('../src/coach-auth-service');
const totp = require('../src/totp');
const root = path.join(__dirname, '..');
const output = path.join(root, 'logs', 'magazine-live');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-live-'));
const port = Number(process.env.YASNAFIT_LIVE_PORT || 3042);
const base = `http://127.0.0.1:${port}`;
let server, browser;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'yasnafit.db'));
  runMigrations(db);
  const email = 'crypto.javan17@gmail.com', password = crypto.randomBytes(24).toString('hex');
  auth.setupCoach(db, { email, password, displayName: 'بررسی زندهٔ مجله' });
  const secret = auth.provisionCoachTotp(db).secret;
  db.close();
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), YASNAFIT_DATA_DIR: dir }, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) throw new Error('Temporary server did not start');
  const login = await fetch(base + '/api/coach/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const challenge = (login.headers.get('set-cookie') || '').split(';')[0];
  const verify = await fetch(base + '/api/coach/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: challenge }, body: JSON.stringify({ code: totp.generate(secret) }) });
  if (!verify.ok) throw new Error('Temporary coach authentication failed');
  const cookie = verify.headers.get('set-cookie').split(';')[0];
  const get = async url => { const r = await fetch(base + url, { headers: { Cookie: cookie } }); if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`); return r.json(); };
  const response = await fetch(base + '/api/magazine/admin/discover', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}' });
  const result = await response.json();
  const diagnostic = await get('/api/magazine/admin/discover/diagnostics');
  const queue = (await get('/api/magazine/admin/queue')).queue;
  const report = {
    generated_at: new Date().toISOString(), runtime: process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'local Node',
    provenance: 'Live publisher network calls, temporary DB, no mock, no source substitution, no AI, no publish',
    run: diagnostic.last_run, response_status: response.status, result,
    queue: queue.map(q => ({ id: q.id, title: q.title, source_name: q.source_name, source_url: q.source_url, source_published_at: q.source_published_at, cover_image: q.cover_image, audit_reasons: q.audit_reasons, status: q.status })),
    browser: { tested: false }
  };
  const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  console.log(JSON.stringify({ fetched: result.fetched, drafted: result.drafted, queue: report.queue.length, sources: diagnostic.last_run?.sources, titles: report.queue.map(q => q.title) }, null, 2));
  if (process.env.YASNAFIT_LIVE_BROWSER === '1') {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, locale: 'fa-IR' });
    const split = cookie.indexOf('=');
    await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: base }]);
    const page = await context.newPage();
    await page.goto(base + '/coach/magazine', { waitUntil: 'networkidle' });
    await Promise.all([page.waitForResponse(r => r.url().includes('/api/magazine/admin/queue/stats')), page.locator('[data-tab="news"]').click()]);
    const expected = queue.filter(q => !q.audit_reasons.length).length;
    if (expected) await page.locator('.mag-news-card').first().waitFor();
    // Lazy-loaded images: scroll every visible card into view and inspect pixels.
    const cards = page.locator('.mag-news-card');
    const inspected = [];
    for (let i = 0; i < await cards.count(); i++) {
      const card = cards.nth(i); await card.scrollIntoViewIfNeeded();
      const img = card.locator('img');
      if (await img.count()) await img.evaluate(el => new Promise(resolve => {
        if (el.complete) return resolve();
        el.addEventListener('load', () => resolve(), { once: true });
        el.addEventListener('error', () => resolve(), { once: true });
        setTimeout(resolve, 10000);
      }));
      inspected.push(await card.evaluate(el => ({
        id: Number(el.dataset.id), title: el.querySelector('.mag-news-title')?.textContent,
        image_loaded: Boolean(el.querySelector('img')?.naturalWidth), missing_image_shown: el.textContent.includes('تصویر پیدا نشد')
      })));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'coach-review.png'), fullPage: true });
    report.browser = { tested: true, expected_cards: expected, cards: inspected, queue_ids_match: inspected.length === expected && inspected.every(c => queue.some(q => q.id === c.id)) };
    save();
  }
  if (!response.ok || !queue.some(q => !q.audit_reasons.length)) throw new Error('LIVE ACCEPTANCE BLOCKED: no ready review articles. See report.json');
  if (report.browser.tested && !report.browser.queue_ids_match) throw new Error('Actual coach cards do not match API queue');
  console.log('LIVE QUEUE VERIFIED (not the owner database; no publication performed)');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.signalCode === null) { const stopped = new Promise(r => server.once('exit', r)); server.kill(); await stopped; }
  fs.rmSync(dir, { recursive: true, force: true });
});
