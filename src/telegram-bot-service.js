'use strict';
// Telegram bot @yasnafitbot — auto-reply to /start (owner spec 2026-09-21).
//
// Scope of this stage (deliberately small):
//   * `/start`, `/start landing` (any payload) → Persian welcome message that sends the
//     guest to the site registration page. `/help` and any other private text → a short
//     guide with the same link, so the bot is never silent in a private chat.
//   * Nothing is stored: no chat_id, no username, no account linking, no notifications,
//     no one-time deep-link tokens. Those belong to later T-20 phases.
//
// Transport (zero dependencies — the project has none; global fetch of Node ≥ 22):
//   * polling  — getUpdates long polling. Meant for development / a single local machine.
//   * webhook  — Telegram POSTs updates to `POST /api/telegram/webhook` on this very server.
//                Meant for production. The route is protected by the secret Telegram echoes
//                back in the `X-Telegram-Bot-Api-Secret-Token` header (setWebhook secret_token).
//
// Configuration — names only; values live in the execution environment, never in git:
//   TELEGRAM_BOT_TOKEN       enables the bot. Never logged, never written to disk.
//   TELEGRAM_BOT_MODE        off | polling | webhook | auto (default auto = webhook when
//                            TELEGRAM_WEBHOOK_URL is set, otherwise polling).
//   TELEGRAM_WEBHOOK_URL     public https origin of this deployment (e.g. https://yasnafit.ir);
//                            WEBHOOK_PATH is appended automatically.
//   TELEGRAM_WEBHOOK_SECRET  optional. Default: HMAC-SHA256 derived from the token (stable across
//                            restarts, never printed) — so the route is protected even when the
//                            operator sets nothing but the token and the URL.
//   TELEGRAM_API_BASE        optional, default https://api.telegram.org (tests point it at a fake).
//   YASNAFIT_PUBLIC_URL      optional, default https://yasnafit.ir — base of the registration link.
//
// Safety rule for polling: `auto` mode refuses to start polling while Telegram reports an
// existing webhook (that webhook is probably production). Only an explicit
// TELEGRAM_BOT_MODE=polling deletes the webhook and takes over the update stream.

const crypto = require('node:crypto');

const DEFAULT_API_BASE = 'https://api.telegram.org';
const DEFAULT_PUBLIC_URL = 'https://yasnafit.ir';
const REGISTER_PATH = '/student/register';
const WEBHOOK_PATH = '/api/telegram/webhook';
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const LANDING_START_PARAM = 'landing';
const API_TIMEOUT_MS = 15000;
const POLL_TIMEOUT_S = 30;
const POLL_MAX_BACKOFF_MS = 30000;
const BOT_COMMANDS = [
  { command: 'start', description: 'شروع و دریافت لینک ثبت‌نام در سایت' },
  { command: 'help', description: 'راهنمای ربات' }
];

const MODES = new Set(['off', 'polling', 'webhook', 'auto']);

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getConfig(env = process.env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const requestedMode = String(env.TELEGRAM_BOT_MODE || 'auto').trim().toLowerCase();
  const modeSetting = MODES.has(requestedMode) ? requestedMode : 'auto';
  const webhookOrigin = trimSlash(env.TELEGRAM_WEBHOOK_URL);
  const publicUrl = trimSlash(env.YASNAFIT_PUBLIC_URL) || DEFAULT_PUBLIC_URL;
  const apiBase = trimSlash(env.TELEGRAM_API_BASE) || DEFAULT_API_BASE;
  let mode = modeSetting;
  if (mode === 'auto') mode = webhookOrigin ? 'webhook' : 'polling';
  if (!token) mode = 'off';
  const explicitSecret = String(env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const secret = token ? (explicitSecret || deriveWebhookSecret(token)) : '';
  return {
    enabled: Boolean(token) && mode !== 'off',
    token,
    mode,
    modeSetting,
    apiBase,
    publicUrl,
    registerUrl: publicUrl + REGISTER_PATH,
    webhookOrigin,
    webhookUrl: webhookOrigin ? webhookOrigin + WEBHOOK_PATH : '',
    secret,
    secretIsDerived: Boolean(token) && !explicitSecret,
    // Webhook mode needs a public URL to register; without it the operator must fix the env.
    misconfigured: Boolean(token) && mode === 'webhook' && !webhookOrigin
  };
}

// Stable per-token secret for the webhook header. Telegram allows 1–256 chars of [A-Za-z0-9_-];
// 64 hex chars satisfy that. Deriving it (instead of a random value) keeps restarts idempotent.
function deriveWebhookSecret(token) {
  return crypto.createHmac('sha256', String(token)).update('yasnafit-telegram-webhook-v1').digest('hex');
}

function verifyWebhookSecret(headerValue, secret) {
  if (!secret || typeof headerValue !== 'string' || !headerValue) return false;
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// The token must never reach a log line, an error message or a health payload.
function redact(text, token) {
  const value = String(text == null ? '' : (text && text.message) || text);
  if (!token) return value;
  return value.split(token).join('[token]');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- Messages (owner's text, verbatim) ----------------------------------------------
function welcomeMessage({ registerUrl }) {
  const link = escapeHtml(registerUrl);
  const text = [
    'سلام 👋',
    '',
    'به ربات یسنا فیت خوش اومدی!',
    '',
    'برای دریافت نوتیفیکیشن وقتی مربی برنامه‌ات رو آماده کرد، اول در سایت ثبت‌نام کن.',
    '',
    'بعد از ثبت‌نام می‌تونی دوباره به ربات برگردی و حسابت رو وصل کنی تا پیام‌ها برات ارسال بشه.',
    '',
    '🌐 ثبت‌نام در سایت:',
    `<a href="${link}">${link}</a>`
  ].join('\n');
  return {
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: 'ثبت‌نام در سایت', url: registerUrl }]] }
  };
}

function helpMessage({ registerUrl }) {
  const link = escapeHtml(registerUrl);
  const text = [
    'راهنمای ربات یسنا فیت',
    '',
    'این ربات فعلاً برای معرفی و راهنمایی ثبت‌نام فعال است. دستورها:',
    '/start — پیام خوش‌آمد و لینک ثبت‌نام',
    '/help — همین راهنما',
    '',
    '🌐 ثبت‌نام در سایت:',
    `<a href="${link}">${link}</a>`
  ].join('\n');
  return {
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: 'ثبت‌نام در سایت', url: registerUrl }]] }
  };
}

// ---- Update parsing -------------------------------------------------------------------
// `/start`, `/start landing`, `/start@yasnafitbot landing`, `/HELP` … → { command, payload }.
function parseCommand(text) {
  const value = String(text == null ? '' : text).trim();
  const match = value.match(/^\/([A-Za-z0-9_]{1,32})(?:@[A-Za-z0-9_]{1,64})?(?:\s+([\s\S]*))?$/);
  if (!match) return { command: null, payload: '' };
  return { command: match[1].toLowerCase(), payload: String(match[2] || '').trim() };
}

// Deep-link payloads are limited by Telegram to 64 chars of [A-Za-z0-9_-]; anything else is
// reduced to that alphabet before it is allowed near a log line.
function startPayloadLabel(payload) {
  const cleaned = String(payload || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return cleaned || '(none)';
}

// Decide what to do with one update. Pure: returns the action, performs nothing.
function planReply(update, config) {
  if (!update || typeof update !== 'object') return { action: 'ignore', reason: 'not-an-update' };
  const message = update.message;
  if (!message || typeof message !== 'object') return { action: 'ignore', reason: 'no-message' };
  const chat = message.chat || {};
  if (chat.type !== 'private') return { action: 'ignore', reason: 'not-private' };
  if (!Number.isFinite(Number(chat.id))) return { action: 'ignore', reason: 'no-chat-id' };
  if (message.from && message.from.is_bot) return { action: 'ignore', reason: 'from-bot' };
  const { command, payload } = parseCommand(message.text);
  if (command === 'start') {
    return {
      action: 'reply',
      kind: 'welcome',
      from_landing: payload === LANDING_START_PARAM,
      start_param: startPayloadLabel(payload),
      chat_id: chat.id,
      message: welcomeMessage(config)
    };
  }
  if (command === 'help') {
    return { action: 'reply', kind: 'help', chat_id: chat.id, message: helpMessage(config) };
  }
  // Any other private message (text, sticker, photo…) gets the short guide instead of silence.
  return { action: 'reply', kind: 'guide', chat_id: chat.id, message: helpMessage(config) };
}

// ---- Bot API client -------------------------------------------------------------------
class TelegramApiError extends Error {
  constructor(method, description, code, parameters) {
    super(`Telegram ${method} failed${code ? ` (${code})` : ''}: ${description || 'unknown error'}`);
    this.name = 'TelegramApiError';
    this.method = method;
    this.code = code || 0;
    this.parameters = parameters || {};
  }
}

function createApi({ token, apiBase = DEFAULT_API_BASE, fetchImpl = globalThis.fetch, timeoutMs = API_TIMEOUT_MS } = {}) {
  if (!token) throw new Error('Telegram API client needs a token');
  const base = `${trimSlash(apiBase)}/bot${token}/`;
  async function call(method, params = {}, { timeout = timeoutMs, signal = null } = {}) {
    let response;
    try {
      const timeoutSignal = AbortSignal.timeout(timeout);
      response = await fetchImpl(base + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal
      });
    } catch (error) {
      // fetch errors carry the URL (and therefore the token) — rebuild the message without it.
      throw new TelegramApiError(method, redact(error && error.message, token) || 'network error', 0);
    }
    let payload = null;
    try { payload = await response.json(); } catch (error) { payload = null; }
    if (!payload || typeof payload !== 'object') {
      throw new TelegramApiError(method, `HTTP ${response.status} without a JSON body`, response.status);
    }
    if (!payload.ok) {
      throw new TelegramApiError(method, redact(payload.description, token), payload.error_code || response.status, payload.parameters);
    }
    return payload.result;
  }
  return { call, apiBase: trimSlash(apiBase) };
}

// ---- Runtime ---------------------------------------------------------------------------
function createBot({ config = getConfig(), api = null, logger = console, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const state = {
    mode: config.mode,
    enabled: config.enabled,
    running: false,
    username: '',
    webhook_url: config.webhookUrl,
    started_at: null,
    updates_received: 0,
    replies_sent: 0,
    last_update_at: null,
    last_error: null,
    last_error_at: null
  };
  let client = api;
  let stopped = false;
  let pollController = null;

  const info = (...parts) => { try { logger.log('[Telegram]', ...parts.map(p => redact(p, config.token))); } catch (e) { /* ignore */ } };
  const warn = (...parts) => { try { (logger.warn || logger.log).call(logger, '[Telegram] ⚠', ...parts.map(p => redact(p, config.token))); } catch (e) { /* ignore */ } };
  const noteError = (context, error) => {
    const message = redact(error, config.token);
    state.last_error = `${context}: ${message}`;
    state.last_error_at = new Date().toISOString();
    try { (logger.error || logger.log).call(logger, '[Telegram] ✗', context, message); } catch (e) { /* ignore */ }
  };

  function ensureClient() {
    if (!client) client = createApi({ token: config.token, apiBase: config.apiBase });
    return client;
  }

  async function reply(plan) {
    const result = await ensureClient().call('sendMessage', { chat_id: plan.chat_id, ...plan.message });
    state.replies_sent += 1;
    return result;
  }

  // Handles one update end-to-end. Never throws: a broken update must not break the stream.
  async function handleUpdate(update) {
    state.updates_received += 1;
    state.last_update_at = new Date().toISOString();
    const plan = planReply(update, config);
    if (plan.action !== 'reply') return plan;
    try {
      await reply(plan);
      if (plan.kind === 'welcome') info(`/start answered (update ${update.update_id ?? '?'}, start=${plan.start_param}${plan.from_landing ? ', from landing' : ''})`);
    } catch (error) {
      noteError(`reply to update ${update && update.update_id != null ? update.update_id : '?'}`, error);
      plan.failed = true;
    }
    return plan;
  }

  async function announceIdentity() {
    try {
      const me = await ensureClient().call('getMe');
      state.username = me && me.username ? String(me.username) : '';
      info(`bot identity confirmed: @${state.username || '?'}`);
    } catch (error) {
      noteError('getMe', error);
    }
    try {
      await ensureClient().call('setMyCommands', { commands: BOT_COMMANDS });
    } catch (error) {
      noteError('setMyCommands', error);
    }
  }

  async function installWebhook() {
    const params = { url: config.webhookUrl, secret_token: config.secret, allowed_updates: ['message'], drop_pending_updates: false };
    await ensureClient().call('setWebhook', params);
    info(`webhook registered at ${config.webhookUrl} (secret ${config.secretIsDerived ? 'derived from the token' : 'from TELEGRAM_WEBHOOK_SECRET'}; never logged)`);
  }

  async function pollLoop() {
    let offset = 0;
    let backoff = 1000;
    while (!stopped) {
      let updates;
      const startedAt = Date.now();
      try {
        pollController = new AbortController();
        updates = await ensureClient().call('getUpdates', { offset, timeout: POLL_TIMEOUT_S, allowed_updates: ['message'] }, { timeout: (POLL_TIMEOUT_S + 10) * 1000, signal: pollController.signal });
        backoff = 1000;
      } catch (error) {
        if (stopped) break;
        if (error && error.code === 409) {
          noteError('getUpdates', `${error.message} — another process is polling this bot or a webhook is set; retrying in ${Math.round(backoff / 1000)}s`);
        } else {
          noteError('getUpdates', error);
        }
        await sleep(backoff);
        backoff = Math.min(backoff * 2, POLL_MAX_BACKOFF_MS);
        continue;
      }
      if (!Array.isArray(updates)) updates = [];
      for (const update of updates) {
        if (update && Number.isFinite(Number(update.update_id))) offset = Math.max(offset, Number(update.update_id) + 1);
        await handleUpdate(update);
      }
      // Real long polling blocks server-side; a proxy or fake that returns instantly with
      // nothing must not turn this loop into a hot spin.
      if (!updates.length && Date.now() - startedAt < 500) await sleep(1000);
    }
  }

  async function startPolling() {
    let existing = null;
    try {
      existing = await ensureClient().call('getWebhookInfo');
    } catch (error) {
      noteError('getWebhookInfo', error);
    }
    const existingUrl = existing && existing.url ? String(existing.url) : '';
    if (existingUrl && config.modeSetting !== 'polling') {
      warn(`a webhook is already registered (${existingUrl}); refusing to start long polling in auto mode so a running deployment keeps its updates. Set TELEGRAM_BOT_MODE=polling explicitly to take over, or TELEGRAM_WEBHOOK_URL to run as webhook.`);
      state.running = false;
      state.last_error = 'polling not started: webhook already registered elsewhere';
      state.last_error_at = new Date().toISOString();
      return false;
    }
    if (existingUrl) {
      await ensureClient().call('deleteWebhook', { drop_pending_updates: false });
      info(`webhook ${existingUrl} removed (TELEGRAM_BOT_MODE=polling)`);
    }
    state.running = true;
    info('long polling started (development mode)');
    pollLoop().catch(error => { noteError('poll loop', error); state.running = false; });
    return true;
  }

  async function start() {
    if (!config.token) { info('disabled — TELEGRAM_BOT_TOKEN is not set'); return false; }
    if (config.mode === 'off') { info('disabled — TELEGRAM_BOT_MODE=off'); return false; }
    if (config.misconfigured) {
      warn('TELEGRAM_BOT_MODE=webhook needs TELEGRAM_WEBHOOK_URL (public https origin of this server); the bot stays off.');
      state.last_error = 'webhook mode without TELEGRAM_WEBHOOK_URL';
      state.last_error_at = new Date().toISOString();
      return false;
    }
    state.started_at = new Date().toISOString();
    await announceIdentity();
    if (config.mode === 'webhook') {
      try {
        await installWebhook();
        state.running = true;
        return true;
      } catch (error) {
        noteError('setWebhook', error);
        state.running = false;
        return false;
      }
    }
    return startPolling();
  }

  function stop() {
    stopped = true;
    state.running = false;
    try { if (pollController) pollController.abort(); } catch (e) { /* ignore */ }
  }

  // Node http handler for POST /api/telegram/webhook. Answers 200 fast and processes the
  // update afterwards; Telegram retries on non-2xx, which would only duplicate replies.
  function handleWebhookRequest(req, res, { readBody, send }) {
    if (!config.enabled || config.mode !== 'webhook') { send(res, 404, { error: 'مسیر پیدا نشد', code: 'NOT_FOUND' }); return true; }
    if (req.method !== 'POST') { send(res, 405, { error: 'متد مجاز نیست' }, { Allow: 'POST' }); return true; }
    if (!verifyWebhookSecret(req.headers[SECRET_HEADER], config.secret)) { send(res, 403, { error: 'دسترسی مجاز نیست' }); return true; }
    return readBody(req).then(update => {
      send(res, 200, { ok: true });
      handleUpdate(update).catch(error => noteError('webhook update', error));
      return true;
    }, () => {
      try { send(res, 400, { error: 'بدنهٔ درخواست نامعتبر است' }); } catch (e) { /* socket already destroyed (oversized body) */ }
      return true;
    });
  }

  function status() {
    return {
      enabled: state.enabled,
      mode: state.mode,
      running: state.running,
      username: state.username,
      webhook_url: state.webhook_url || null,
      register_url: config.registerUrl,
      started_at: state.started_at,
      updates_received: state.updates_received,
      replies_sent: state.replies_sent,
      last_update_at: state.last_update_at,
      last_error: state.last_error,
      last_error_at: state.last_error_at
    };
  }

  return { start, stop, status, handleUpdate, handleWebhookRequest, config };
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_PUBLIC_URL,
  REGISTER_PATH,
  WEBHOOK_PATH,
  SECRET_HEADER,
  LANDING_START_PARAM,
  BOT_COMMANDS,
  TelegramApiError,
  getConfig,
  deriveWebhookSecret,
  verifyWebhookSecret,
  redact,
  escapeHtml,
  welcomeMessage,
  helpMessage,
  parseCommand,
  startPayloadLabel,
  planReply,
  createApi,
  createBot
};
