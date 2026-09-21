#!/usr/bin/env node
'use strict';
/* YASNAFIT — Telegram bot (@yasnafitbot /start auto-reply) regression test.
   No real Telegram traffic: a local fake Bot API records every call. Covers
   (1) configuration + message + command parsing in-process, (2) a spawned server in
   webhook mode (setWebhook registration, secret-header guard, reply to /start landing,
   nothing stored, token never logged), (3) a spawned server in polling mode
   (deleteWebhook + getUpdates + reply), (4) the auto-mode safety that refuses to steal a
   registered webhook, (5) a server without a token (route is 404), and (6) source/doc guards.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const bot = require('../src/telegram-bot-service');

const TOKEN = '1000000000:TEST_fake_token_never_real_AbCdEf';
const SECRET = 'test-webhook-secret-1';
const REGISTER = 'https://yasnafit.ir/student/register';
const LOGIN = 'https://yasnafit.ir/student/login';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yasnafit-telegram-bot-'));
const dataDir = path.join(dir, 'data');
fs.mkdirSync(dataDir, { recursive: true });

let passed = 0;
const check = name => { passed += 1; console.log(`  ✓ ${name}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

// ---------- Fake Telegram Bot API ----------
async function startFakeTelegram() {
  const state = { calls: [], webhookUrl: '', queue: [], messageId: 0 };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const match = (req.url || '').match(/^\/bot([^/]+)\/([A-Za-z]+)$/);
      const reply = (code, payload) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
      if (!match) return reply(404, { ok: false, error_code: 404, description: 'Not Found' });
      const [, token, method] = match;
      let params = {};
      try { params = raw ? JSON.parse(raw) : {}; } catch (e) { params = { _invalid: raw }; }
      state.calls.push({ method, params, token_ok: token === TOKEN, content_type: req.headers['content-type'] || '' });
      if (token !== TOKEN) return reply(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      switch (method) {
        case 'getMe': return reply(200, { ok: true, result: { id: 1000000000, is_bot: true, first_name: 'YasnaFit', username: 'yasnafitbot' } });
        case 'setMyCommands': return reply(200, { ok: true, result: true });
        case 'setWebhook': state.webhookUrl = String(params.url || ''); return reply(200, { ok: true, result: true, description: 'Webhook was set' });
        case 'deleteWebhook': state.webhookUrl = ''; return reply(200, { ok: true, result: true, description: 'Webhook was deleted' });
        case 'getWebhookInfo': return reply(200, { ok: true, result: { url: state.webhookUrl, has_custom_certificate: false, pending_update_count: 0 } });
        case 'sendMessage': state.messageId += 1; return reply(200, { ok: true, result: { message_id: state.messageId, chat: { id: params.chat_id, type: 'private' }, text: params.text } });
        case 'getUpdates': {
          const batch = state.queue.splice(0, 100);
          if (batch.length) return reply(200, { ok: true, result: batch });
          // real long polling blocks; the fake blocks briefly so the loop stays realistic
          return void setTimeout(() => reply(200, { ok: true, result: [] }), 150);
        }
        default: return reply(404, { ok: false, error_code: 404, description: `Not Found: method ${method}` });
      }
    });
  });
  const port = await freePort();
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return {
    base: `http://127.0.0.1:${port}`,
    state,
    calls: method => state.calls.filter(call => call.method === method),
    queue: update => state.queue.push(update),
    async waitFor(method, count = 1, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = state.calls.filter(call => call.method === method);
        if (found.length >= count) return found;
        await sleep(50);
      }
      throw new Error(`fake Telegram never received ${method} ×${count}; calls: ${state.calls.map(c => c.method).join(',')}`);
    },
    close: () => new Promise(resolve => server.close(() => resolve()))
  };
}

// ---------- Spawned YasnaFit server ----------
async function bootServer(extraEnv) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const logs = [];
  const env = { ...process.env, PORT: String(port), YASNAFIT_DATA_DIR: dataDir };
  for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_MODE', 'TELEGRAM_WEBHOOK_URL', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_API_BASE', 'YASNAFIT_PUBLIC_URL']) delete env[key];
  Object.assign(env, extraEnv);
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { const res = await fetch(base + '/api/health'); if (res.ok) break; } catch (e) { /* not up yet */ }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs.join('')}`);
    await sleep(150);
  }
  return {
    base,
    logs,
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
      }
    }
  };
}

async function request(base, url, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  let payload = body;
  if (body !== undefined && typeof body !== 'string') { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const response = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.text();
  return { status: response.status, data, headers: response.headers };
}

function startUpdate(updateId, chatId, text, chatType = 'private') {
  return { update_id: updateId, message: { message_id: updateId, date: 1758400000, chat: { id: chatId, type: chatType, first_name: 'Guest' }, from: { id: chatId, is_bot: false, first_name: 'Guest' }, text } };
}

let fake = null;
let running = null;

(async () => {
  // ---------- 1. Configuration ----------
  console.log('· configuration (environment names only)');
  {
    const off = bot.getConfig({});
    assert.equal(off.enabled, false); assert.equal(off.mode, 'off'); assert.equal(off.secret, '');
    const polling = bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN });
    assert.equal(polling.enabled, true); assert.equal(polling.mode, 'polling');
    assert.equal(polling.registerUrl, REGISTER, 'registration link must default to the owner-specified page');
    assert.match(polling.secret, /^[0-9a-f]{64}$/, 'derived webhook secret must be 64 hex chars (Telegram: 1–256 of [A-Za-z0-9_-])');
    assert.equal(polling.secret, bot.deriveWebhookSecret(TOKEN), 'the derived secret must be stable for a token');
    assert.notEqual(polling.secret, bot.deriveWebhookSecret(TOKEN + 'x'));
    const webhook = bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_URL: 'https://yasnafit.ir/' });
    assert.equal(webhook.mode, 'webhook'); assert.equal(webhook.webhookUrl, 'https://yasnafit.ir' + bot.WEBHOOK_PATH);
    assert.equal(bot.WEBHOOK_PATH, '/api/telegram/webhook');
    const explicit = bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_URL: 'https://x.test', TELEGRAM_WEBHOOK_SECRET: SECRET });
    assert.equal(explicit.secret, SECRET); assert.equal(explicit.secretIsDerived, false);
    assert.equal(bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_MODE: 'off' }).enabled, false);
    assert.equal(bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_MODE: 'webhook' }).misconfigured, true, 'webhook mode without a public URL must be flagged, not silently polled');
    assert.equal(bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, YASNAFIT_PUBLIC_URL: 'https://staging.example/' }).registerUrl, 'https://staging.example/student/register');
    assert.equal(polling.loginUrl, LOGIN, 'login link must default to the student login page');
    check('token gates the bot; auto mode = webhook with URL, polling without; secret derived or explicit');
  }

  // ---------- 2. Command parsing + reply planning ----------
  console.log('· /start, /help and other messages');
  {
    const config = bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN });
    assert.deepEqual(bot.parseCommand('/start'), { command: 'start', payload: '' });
    assert.deepEqual(bot.parseCommand('/start landing'), { command: 'start', payload: 'landing' });
    assert.deepEqual(bot.parseCommand('/start@yasnafitbot landing'), { command: 'start', payload: 'landing' });
    assert.deepEqual(bot.parseCommand('/HELP'), { command: 'help', payload: '' });
    assert.equal(bot.parseCommand('سلام').command, null);
    assert.equal(bot.parseCommand('').command, null);
    check('command parser handles payloads, @mention and case');

    const landing = bot.planReply(startUpdate(1, 4242, '/start landing'), config);
    assert.equal(landing.action, 'reply'); assert.equal(landing.kind, 'welcome'); assert.equal(landing.from_landing, true); assert.equal(landing.chat_id, 4242);
    const plain = bot.planReply(startUpdate(2, 4242, '/start'), config);
    assert.equal(plain.kind, 'welcome'); assert.equal(plain.from_landing, false); assert.equal(plain.start_param, '(none)');
    assert.equal(plain.message.text, landing.message.text, 'owner: same welcome for /start with or without payload');
    const other = bot.planReply(startUpdate(3, 4242, '/start promo-2026'), config);
    assert.equal(other.kind, 'welcome'); assert.equal(other.start_param, 'promo-2026');
    check('/start with landing, without payload and with another payload → welcome');

    const text = landing.message.text;
    // Owner (second revision): respectful welcome first, then guidance — formal register.
    for (const line of ['سلام و درود 👋', 'خوش آمدید', 'راهنمای شروع', '۱) در سایت ثبت‌نام کنید:', '۲) فرم ارزیابی', '۳) پس از ثبت‌نام', 'ورود به پنل شخصی', '/help']) {
      assert.ok(text.includes(line), `welcome text is missing: ${line}`);
    }
    assert.ok(text.indexOf('خوش آمدید') < text.indexOf('راهنمای شروع'), 'welcome must come before the guidance');
    for (const informal of ['اومدی', 'می‌تونی', 'برات', 'برنامه‌ات رو']) assert.ok(!text.includes(informal), `informal wording must not appear: ${informal}`);
    assert.ok(text.includes(`<a href="${REGISTER}">${REGISTER}</a>`), 'registration link must be an explicit clickable anchor');
    assert.ok(text.includes(`<a href="${LOGIN}">${LOGIN}</a>`), 'login link must be an explicit clickable anchor');
    assert.equal(landing.message.parse_mode, 'HTML');
    assert.equal(landing.message.disable_web_page_preview, true);
    assert.deepEqual(landing.message.reply_markup, { inline_keyboard: [[{ text: 'ثبت‌نام در سایت', url: REGISTER }], [{ text: 'ورود به پنل شخصی', url: LOGIN }]] });
    assert.doesNotMatch(text, /<(?!\/?(?:a|b)\b)[^>]*>/, 'only <a> and <b> may appear in HTML mode');
    check('welcome = respectful greeting, then step-by-step guidance, register + login links and buttons');

    const help = bot.planReply(startUpdate(4, 7, '/help'), config);
    assert.equal(help.kind, 'help'); assert.ok(help.message.text.includes('/start')); assert.ok(help.message.text.includes(REGISTER)); assert.ok(help.message.text.includes(LOGIN));
    const guide = bot.planReply(startUpdate(5, 7, 'سلام، برنامه‌ام کی آماده می‌شه؟'), config);
    assert.equal(guide.kind, 'guide', 'other private text must get the short guide, never silence');
    const sticker = bot.planReply({ update_id: 6, message: { chat: { id: 7, type: 'private' }, sticker: { file_id: 'x' } } }, config);
    assert.equal(sticker.kind, 'guide');
    check('/help and any other private message → short guide with the same link');

    assert.equal(bot.planReply(startUpdate(7, -100123, '/start', 'supergroup'), config).action, 'ignore');
    assert.equal(bot.planReply(startUpdate(8, -1, '/start', 'group'), config).action, 'ignore');
    assert.equal(bot.planReply({ update_id: 9, edited_message: { chat: { id: 1, type: 'private' }, text: '/start' } }, config).action, 'ignore');
    assert.equal(bot.planReply({ update_id: 10, message: { chat: { id: 1, type: 'private' }, from: { id: 2, is_bot: true }, text: '/start' } }, config).action, 'ignore');
    assert.equal(bot.planReply(null, config).action, 'ignore');
    assert.equal(bot.planReply('garbage', config).action, 'ignore');
    check('groups, edited messages, bots and malformed payloads are ignored');

    const leaked = bot.redact(new Error(`fetch failed https://api.telegram.org/bot${TOKEN}/getMe`), TOKEN);
    assert.ok(!leaked.includes(TOKEN) && leaked.includes('/bot[token]/getMe'));
    assert.equal(bot.verifyWebhookSecret(SECRET, SECRET), true);
    assert.equal(bot.verifyWebhookSecret(SECRET + 'x', SECRET), false);
    assert.equal(bot.verifyWebhookSecret('', SECRET), false);
    assert.equal(bot.verifyWebhookSecret(undefined, SECRET), false);
    assert.equal(bot.verifyWebhookSecret(SECRET, ''), false);
    assert.equal(bot.escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
    check('token redaction, constant-time secret check, HTML escaping');
  }

  // ---------- 3. Bot API client against the fake ----------
  fake = await startFakeTelegram();
  console.log('· Bot API client (fake api.telegram.org)');
  {
    const api = bot.createApi({ token: TOKEN, apiBase: fake.base });
    const me = await api.call('getMe');
    assert.equal(me.username, 'yasnafitbot');
    const last = fake.state.calls.at(-1);
    assert.equal(last.method, 'getMe'); assert.match(last.content_type, /application\/json/);
    await assert.rejects(api.call('noSuchMethod'), error => error instanceof bot.TelegramApiError && error.code === 404 && !error.message.includes(TOKEN));
    const wrong = bot.createApi({ token: TOKEN + 'bad', apiBase: fake.base });
    await assert.rejects(wrong.call('getMe'), error => error.code === 401 && !error.message.includes(TOKEN));
    const dead = bot.createApi({ token: TOKEN, apiBase: 'http://127.0.0.1:9' });
    await assert.rejects(dead.call('getMe'), error => error instanceof bot.TelegramApiError && !error.message.includes(TOKEN));
    check('JSON POST calls, API errors and network errors never carry the token');
  }

  // ---------- 4. Server in webhook mode ----------
  console.log('· spawned server — webhook mode');
  {
    fake.state.calls.length = 0;
    running = await bootServer({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: fake.base, TELEGRAM_WEBHOOK_URL: 'https://yasnafit.example.test', TELEGRAM_WEBHOOK_SECRET: SECRET });
    const [hook] = await fake.waitFor('setWebhook');
    assert.equal(hook.params.url, 'https://yasnafit.example.test/api/telegram/webhook');
    assert.equal(hook.params.secret_token, SECRET);
    assert.deepEqual(hook.params.allowed_updates, ['message']);
    await fake.waitFor('getMe');
    const [commands] = await fake.waitFor('setMyCommands');
    assert.deepEqual(commands.params.commands.map(c => c.command), ['start', 'help']);
    assert.equal(fake.calls('deleteWebhook').length, 0, 'webhook mode must not touch deleteWebhook');
    assert.equal(fake.calls('getUpdates').length, 0, 'webhook mode must not poll');
    check('startup registers the webhook (URL + secret + allowed_updates), identity and commands');

    const hookPath = bot.WEBHOOK_PATH;
    assert.equal((await request(running.base, hookPath, { method: 'GET', headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } })).status, 405);
    assert.equal((await request(running.base, hookPath, { method: 'POST', body: startUpdate(1, 4242, '/start landing') })).status, 403);
    assert.equal((await request(running.base, hookPath, { method: 'POST', body: startUpdate(1, 4242, '/start landing'), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET + 'x' } })).status, 403);
    assert.equal((await request(running.base, hookPath, { method: 'POST', body: '{not json', headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' } })).status, 400);
    await sleep(200);
    assert.equal(fake.calls('sendMessage').length, 0, 'rejected requests must never trigger a reply');
    check('route guard: 405 on GET, 403 without/with wrong secret header, 400 on invalid JSON, no reply');

    const okStart = await request(running.base, hookPath, { method: 'POST', body: startUpdate(11, 4242, '/start landing'), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    assert.equal(okStart.status, 200); assert.deepEqual(okStart.data, { ok: true });
    const [sent] = await fake.waitFor('sendMessage');
    assert.equal(sent.params.chat_id, 4242);
    assert.equal(sent.params.parse_mode, 'HTML');
    assert.ok(sent.params.text.includes('خوش آمدید') && sent.params.text.includes('راهنمای شروع'));
    assert.ok(sent.params.text.includes(`<a href="${REGISTER}">${REGISTER}</a>`));
    assert.deepEqual(sent.params.reply_markup.inline_keyboard[0][0], { text: 'ثبت‌نام در سایت', url: REGISTER });
    assert.deepEqual(sent.params.reply_markup.inline_keyboard[1][0], { text: 'ورود به پنل شخصی', url: LOGIN });
    check('valid /start landing → 200 immediately, then sendMessage(welcome) to that chat');

    await request(running.base, hookPath, { method: 'POST', body: startUpdate(12, 4242, '/start'), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    const [, again] = await fake.waitFor('sendMessage', 2);
    assert.equal(again.params.text, sent.params.text, 'a repeated /start (already-started user) gets the welcome again');
    await request(running.base, hookPath, { method: 'POST', body: startUpdate(13, 4242, '/help'), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    const [, , help] = await fake.waitFor('sendMessage', 3);
    assert.ok(help.params.text.includes('/help') && help.params.text.includes(REGISTER));
    await request(running.base, hookPath, { method: 'POST', body: startUpdate(14, -100555, '/start landing', 'supergroup'), headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    await request(running.base, hookPath, { method: 'POST', body: { update_id: 15, channel_post: { chat: { id: -1, type: 'channel' }, text: '/start' } }, headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET } });
    await sleep(300);
    assert.equal(fake.calls('sendMessage').length, 3, 'group/channel updates are acknowledged but never answered');
    check('repeat /start answered again; /help answered; group and channel updates ignored');

    const db = new DatabaseSync(path.join(dataDir, 'yasnafit.db'), { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM telegram_bot_connections').get().n, 0, 'the bot must not write telegram_bot_connections');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM students WHERE telegram_id IS NOT NULL AND telegram_id <> ''").get().n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE title LIKE '%4242%' OR detail LIKE '%4242%'").get().n, 0, 'chat ids must not land in activity_log');
    } finally { db.close(); }
    check('nothing stored: no connection rows, no student telegram ids, no chat id in activity_log');

    const health = await request(running.base, '/api/health');
    assert.equal(health.status, 200); assert.equal(health.data.ok, true);
    assert.equal(health.data.telegram_bot, undefined, 'public health must not describe the bot');
    assert.equal((await request(running.base, '/api/health?detailed=1')).status, 401, 'detailed health (with bot status) stays coach-only');
    const joined = running.logs.join('');
    assert.ok(!joined.includes(TOKEN), 'the bot token must never appear in server logs');
    assert.ok(/\[Telegram\] webhook registered at https:\/\/yasnafit\.example\.test\/api\/telegram\/webhook/.test(joined), `expected webhook log line; got:\n${joined.slice(-1500)}`);
    assert.ok(/\[Telegram\] bot identity confirmed: @yasnafitbot/.test(joined));
    assert.ok(!/4242/.test(joined), 'chat ids must not be logged');
    check('token absent from logs; identity/webhook logged; public health unchanged; detailed health coach-only');
    await running.stop(); running = null;
  }

  // ---------- 5. Server in polling mode (development) ----------
  console.log('· spawned server — polling mode');
  {
    fake.state.calls.length = 0;
    fake.state.webhookUrl = 'https://old.example.test/api/telegram/webhook';
    fake.queue(startUpdate(21, 9001, '/start landing'));
    running = await bootServer({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_API_BASE: fake.base, TELEGRAM_BOT_MODE: 'polling' });
    await fake.waitFor('deleteWebhook');
    assert.equal(fake.state.webhookUrl, '', 'explicit polling mode removes the stale webhook');
    const [sent] = await fake.waitFor('sendMessage');
    assert.equal(sent.params.chat_id, 9001);
    assert.ok(sent.params.text.includes(REGISTER));
    const polls = await fake.waitFor('getUpdates', 2);
    assert.equal(polls[0].params.offset, 0);
    assert.equal(polls[1].params.offset, 22, 'offset must advance past the handled update');
    assert.equal(polls[0].params.timeout, 30);
    assert.equal(fake.calls('setWebhook').length, 0, 'polling mode must not register a webhook');
    assert.equal((await request(running.base, bot.WEBHOOK_PATH, { method: 'POST', body: startUpdate(1, 1, '/start'), headers: { 'X-Telegram-Bot-Api-Secret-Token': bot.deriveWebhookSecret(TOKEN) } })).status, 404, 'the webhook route is closed while polling');
    assert.ok(!running.logs.join('').includes(TOKEN));
    check('polling: deleteWebhook, getUpdates with advancing offset, reply sent, webhook route 404');
    await running.stop(); running = null;
  }

  // ---------- 6. Auto mode never steals a registered webhook ----------
  console.log('· auto mode safety (in-process, fake api object)');
  {
    const calls = [];
    const api = { call: async (method, params) => { calls.push({ method, params }); if (method === 'getWebhookInfo') return { url: 'https://prod.example.test/api/telegram/webhook' }; if (method === 'getMe') return { username: 'yasnafitbot' }; return true; } };
    const logs = [];
    const logger = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
    const instance = bot.createBot({ config: bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN }), api, logger });
    const started = await instance.start();
    assert.equal(started, false);
    assert.deepEqual(calls.map(c => c.method).filter(m => m === 'deleteWebhook' || m === 'getUpdates'), [], 'auto mode must neither delete the webhook nor poll');
    assert.ok(logs.some(line => line.includes('refusing to start long polling')));
    assert.equal(instance.status().running, false);
    instance.stop();
    check('auto mode with a registered webhook → warns and stays off (production keeps its updates)');

    // 409 conflict path: backs off and keeps the loop alive without throwing
    const sleeps = [];
    let polls = 0;
    const conflictApi = { call: async method => { if (method === 'getWebhookInfo') return { url: '' }; if (method === 'getMe') return { username: 'yasnafitbot' }; if (method === 'getUpdates') { polls += 1; if (polls === 1) throw new bot.TelegramApiError('getUpdates', 'Conflict: terminated by other getUpdates request', 409); return []; } return true; } };
    const conflictLogs = [];
    const conflictBot = bot.createBot({ config: bot.getConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_MODE: 'polling' }), api: conflictApi, logger: { log: l => conflictLogs.push(String(l)), warn: (...a) => conflictLogs.push(a.join(' ')), error: (...a) => conflictLogs.push(a.join(' ')) }, sleep: async ms => { sleeps.push(ms); if (sleeps.length > 3) conflictBot.stop(); } });
    assert.equal(await conflictBot.start(), true);
    const deadline = Date.now() + 3000;
    while (polls < 2 && Date.now() < deadline) await sleep(20);
    conflictBot.stop();
    assert.ok(polls >= 2, 'the loop must continue after a 409');
    assert.equal(sleeps[0], 1000, 'first backoff is 1s');
    assert.ok(conflictLogs.some(line => line.includes('another process is polling this bot')));
    assert.ok(conflictBot.status().last_error && conflictBot.status().last_error.includes('409'));
    check('409 conflict → logged hint + backoff, loop survives, status carries last_error');
  }

  // ---------- 7. Server without a token ----------
  console.log('· spawned server — no token');
  {
    running = await bootServer({});
    const res = await request(running.base, bot.WEBHOOK_PATH, { method: 'POST', body: startUpdate(1, 1, '/start landing'), headers: { 'X-Telegram-Bot-Api-Secret-Token': 'anything' } });
    assert.equal(res.status, 404, 'without a token the webhook route must not exist');
    assert.ok(running.logs.join('').includes('[Telegram] disabled — TELEGRAM_BOT_TOKEN is not set'));
    check('no token → bot off, route 404, one explicit log line');
    await running.stop(); running = null;
  }

  // ---------- 8. Source and documentation guards ----------
  console.log('· source + docs guards');
  {
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const tokenPattern = /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/;
    for (const file of ['server.js', 'src/telegram-bot-service.js', 'scripts/telegram-webhook.js', 'DEPLOYMENT.md', 'README.md']) {
      assert.doesNotMatch(read(file), tokenPattern, `${file} looks like it contains a hard-coded bot token`);
    }
    const server = read('server.js');
    assert.match(server, /telegramBot\.handleWebhookRequest\(req,res,\{readBody,send\}\)/, 'server must delegate the webhook path to the service');
    assert.ok(server.indexOf('telegramBotService.WEBHOOK_PATH') < server.indexOf("if(p==='/api/magazine' && req.method==='GET')"), 'webhook route must be resolved before the public content block / coach gate');
    assert.doesNotMatch(server, /process\.env\.TELEGRAM_BOT_TOKEN/, 'only the service reads the token');
    assert.match(server, /telegramBot\.start\(\)/, 'the bot must be started from server.listen');
    const deployment = read('DEPLOYMENT.md');
    for (const token of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_MODE', 'TELEGRAM_WEBHOOK_URL', 'TELEGRAM_WEBHOOK_SECRET', '/api/telegram/webhook', 'getWebhookInfo', 'scripts/telegram-webhook.js']) {
      assert.ok(deployment.includes(token), `DEPLOYMENT.md must document ${token}`);
    }
    assert.ok(read('README.md').includes('TELEGRAM_BOT_TOKEN'), 'README must name the token variable');
    assert.ok(!fs.existsSync(path.join(root, 'node_modules', 'telegraf')) && !fs.existsSync(path.join(root, 'node_modules', 'node-telegram-bot-api')), 'no bot framework dependency was expected (zero-dependency project)');
    assert.equal(JSON.parse(read('package.json')).dependencies, undefined, 'project must stay dependency-free');
    check('no hard-coded token, route wired before the coach gate, env names documented, still zero dependencies');
  }

  await fake.close(); fake = null;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, groups: passed }));
  setTimeout(() => process.exit(0), 100).unref();
})().catch(async error => {
  console.error('✗ telegram-bot-regression failed:');
  console.error(error);
  try { if (running) await running.stop(); } catch (e) { /* ignore */ }
  try { if (fake) await fake.close(); } catch (e) { /* ignore */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 100).unref();
});
