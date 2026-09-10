/**
 * Telegram Service — لایهٔ ارتباطی تلگرام برای Yasnafit
 *
 * تلگرام فقط لایهٔ رابط است؛ دیتابیس Yasnafit منبع حقیقت باقی می‌ماند.
 * پیکربندی کاملاً با متغیرهای محیطی:
 *   TELEGRAM_BOT_TOKEN        توکن ربات (از BotFather) — بدون آن همه‌چیز بی‌اثر و ایمن غیرفعال است
 *   TELEGRAM_BOT_USERNAME     یوزرنیم ربات برای ساخت deep-link اتصال
 *   TELEGRAM_WEBHOOK_SECRET   رمز هدر X-Telegram-Bot-Api-Secret-Token برای تأیید وب‌هوک
 *   YASNAFIT_PUBLIC_URL       آدرس عمومی پورتال شاگرد برای دکمه‌های «مشاهده برنامه»
 *   TELEGRAM_POLLING=1        فقط برای توسعهٔ محلی بدون HTTPS: long-polling به‌جای webhook
 */

const crypto = require('crypto');

const API_TIMEOUT_MS = 15000;
const LINK_TOKEN_TTL_MINUTES = 15;
const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAYS_MINUTES = [1, 5, 15];
const POLLING_BATCH_LIMIT = 20;

function uuid(){ return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'); }
function sha256(value){ return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function safeEqual(a, b){
  const bufA = Buffer.from(String(a)), bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function loadConfig(){
  return {
    token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim() || null,
    username: String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '') || null,
    webhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim() || null,
    publicUrl: String(process.env.YASNAFIT_PUBLIC_URL || '').trim().replace(/\/+$/, '') || null,
    polling: process.env.TELEGRAM_POLLING === '1',
  };
}
let config = loadConfig();
function reloadConfig(){ config = loadConfig(); return config; }
function isConfigured(){ return Boolean(config.token); }

// ── Transport (قابل جایگزینی در تست‌ها؛ هرگز توکن لاگ نمی‌شود) ──
let transport = null; // async (method, payload) => {ok, result?, error_code?, description?, retry_after?}
async function defaultTransport(method, payload){
  if(!config.token) throw new Error('telegram_not_configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try{
    const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({ ok: false, description: 'invalid JSON from Telegram' }));
    return data;
  }catch(error){
    return { ok: false, description: error.name === 'AbortError' ? 'telegram_timeout' : `network_error: ${error.code || error.message}` };
  }finally{
    clearTimeout(timer);
  }
}
async function callApi(method, payload = {}){
  if(!isConfigured()) return { ok: false, error_code: 0, description: 'telegram_not_configured' };
  const fn = transport || defaultTransport;
  try{ return (await fn(method, payload)) || { ok: false, description: 'empty transport result' }; }
  catch(error){ return { ok: false, description: `transport_exception: ${error.message}` }; }
}
function setTransport(fn){ transport = typeof fn === 'function' ? fn : null; } // فقط برای تست

// ── حساب‌های متصل ──
function activeAccount(db, studentId){
  return db.prepare("SELECT * FROM telegram_accounts WHERE student_id=? AND unlinked_at IS NULL ORDER BY id DESC LIMIT 1").get(studentId) || null;
}
function accountByChatId(db, chatId){
  return db.prepare("SELECT * FROM telegram_accounts WHERE chat_id=? AND unlinked_at IS NULL ORDER BY id DESC LIMIT 1").get(String(chatId)) || null;
}
function maskChatId(chatId){
  const text = String(chatId || '');
  return text.length <= 4 ? '•••' : `••••${text.slice(-4)}`;
}
function unlinkAccount(db, account, reason = 'unlinked'){
  db.prepare("UPDATE telegram_accounts SET status=?, unlinked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(reason).slice(0, 20), account.id);
}

// ── توکن‌های یک‌بارمصرف اتصال ──
function createLinkToken(db, studentId){
  // توکن‌های قبلیِ باز همان شاگرد باطل می‌شوند تا فقط یک کد فعال بماند
  db.prepare("UPDATE telegram_link_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE student_id=? AND consumed_at IS NULL AND revoked_at IS NULL").run(studentId);
  const raw = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MINUTES * 60000).toISOString();
  db.prepare("INSERT INTO telegram_link_tokens(stable_id,student_id,token_hash,token_hint,expires_at) VALUES(?,?,?,?,?)")
    .run(uuid(), studentId, sha256(raw), raw.slice(-4), expiresAt);
  const username = config.username || 'YASNAFIT_BOT';
  return {
    link_code: raw,
    expires_at: expiresAt,
    bot_username: username,
    deep_link: `https://t.me/${username}?start=${raw}`,
    ttl_minutes: LINK_TOKEN_TTL_MINUTES,
  };
}
function findLinkToken(db, rawCode){
  if(!rawCode || String(rawCode).length < 16 || String(rawCode).length > 128) return null;
  return db.prepare("SELECT * FROM telegram_link_tokens WHERE token_hash=?").get(sha256(String(rawCode))) || null;
}
function linkTokenError(token){
  if(!token) return 'کد اتصال نامعتبر است.';
  if(token.revoked_at) return 'این کد اتصال باطل شده است؛ از پنل یسنا فیت کد جدید بگیرید.';
  if(token.consumed_at) return 'این کد قبلاً استفاده شده است؛ هر کد فقط یک‌بار کار می‌کند.';
  if(new Date(token.expires_at).getTime() < Date.now()) return 'این کد منقضی شده است؛ از پنل یسنا فیت کد جدید بگیرید.';
  return null;
}
function linkByToken(db, rawCode, chat){
  const token = findLinkToken(db, rawCode);
  const problem = linkTokenError(token);
  if(problem) throw new Error(problem);
  const account = linkChat(db, token.student_id, chat);
  db.prepare("UPDATE telegram_link_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE id=?").run(token.id);
  return { account, student_id: token.student_id };
}
function linkChat(db, studentId, chat){
  const chatId = String(chat.chat_id || chat.id || '').trim();
  if(!/^-?\d{3,20}$/.test(chatId)) throw new Error('شناسه چت تلگرام معتبر نیست.');
  // هر چت و هر شاگرد فقط یک اتصال فعال — اتصال قبلی با سابقه آزاد می‌شود (relink)
  const previousByChat = accountByChatId(db, chatId);
  if(previousByChat && previousByChat.student_id !== studentId) unlinkAccount(db, previousByChat, 'unlinked');
  const previousByStudent = activeAccount(db, studentId);
  if(previousByStudent) unlinkAccount(db, previousByStudent, 'unlinked');
  db.prepare("INSERT INTO telegram_accounts(stable_id,student_id,chat_id,telegram_user_id,telegram_username,status) VALUES(?,?,?,?,?,'active')")
    .run(uuid(), studentId, chatId, String(chat.telegram_user_id || chat.id || '') || null, String(chat.telegram_username || '').slice(0, 64) || null);
  ensurePreferences(db, studentId);
  return activeAccount(db, studentId);
}

// ── ترجیحات اعلان ──
const PREFERENCE_KEYS = ['workout', 'nutrition', 'messages', 'reminders', 'system'];
function ensurePreferences(db, studentId){
  const existing = db.prepare("SELECT * FROM notification_preferences WHERE student_id=?").get(studentId);
  if(existing) return existing;
  db.prepare("INSERT INTO notification_preferences(stable_id,student_id) VALUES(?,?)").run(uuid(), studentId);
  return db.prepare("SELECT * FROM notification_preferences WHERE student_id=?").get(studentId);
}
function preferences(db, studentId){ return ensurePreferences(db, studentId); }
function setPreference(db, studentId, key, enabled){
  if(!PREFERENCE_KEYS.includes(key)) throw new Error('کلید ترجیح نامعتبر است');
  ensurePreferences(db, studentId);
  db.prepare(`UPDATE notification_preferences SET ${key}=?, updated_at=CURRENT_TIMESTAMP WHERE student_id=?`).run(enabled ? 1 : 0, studentId);
  return preferences(db, studentId);
}
function categoryEnabled(db, studentId, category){
  const prefs = ensurePreferences(db, studentId);
  const value = prefs[category];
  return value === undefined ? true : Number(value) === 1;
}

// ── وضعیت برای پنل مربی / پورتال شاگرد ──
function statusForStudent(db, studentId){
  const account = activeAccount(db, studentId);
  const lastDelivery = db.prepare("SELECT type,status,sent_at,last_error,created_at FROM notification_deliveries WHERE student_id=? ORDER BY id DESC LIMIT 1").get(studentId) || null;
  const lastSuccess = db.prepare("SELECT type,sent_at FROM notification_deliveries WHERE student_id=? AND status='sent' ORDER BY id DESC LIMIT 1").get(studentId) || null;
  const lastFailure = db.prepare("SELECT type,last_error,sent_at,created_at FROM notification_deliveries WHERE student_id=? AND status IN ('failed','cancelled') ORDER BY id DESC LIMIT 1").get(studentId) || null;
  return {
    connected: Boolean(account),
    status: account ? account.status : 'never_linked',
    telegram_username: account ? account.telegram_username : null,
    chat_id_masked: account ? maskChatId(account.chat_id) : null,
    linked_at: account ? account.linked_at : null,
    last_delivery: lastDelivery,
    last_success: lastSuccess,
    last_failure: lastFailure,
  };
}

// ── ارسال پیام ──
function portalUrl(pathname){
  if(!config.publicUrl) return null;
  return `${config.publicUrl}${pathname}`;
}
async function sendMessage(db, chatId, text, buttons = null){
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if(buttons && buttons.length){
    payload.reply_markup = { inline_keyboard: buttons };
  }
  return callApi('sendMessage', payload);
}
async function answerCallback(callbackQueryId, text){
  return callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text || undefined });
}

// ── پردازش آپدیت‌های دریافتی از تلگرام ──
const HELP_TEXT = [
  '<b>راهنمای ربات یسنا فیت</b>',
  '',
  '/status — وضعیت اتصال حساب',
  '/program — برنامه تمرینی فعال',
  '/nutrition — برنامه غذایی و مکمل',
  '/notifications — اعلان‌های اخیر',
  '/settings — تنظیمات اعلان‌ها',
  '/unlink — قطع اتصال حساب',
  '/help — همین راهنما',
  '',
  'برای دریافت اعلان‌ها ابتدا حساب خود را از پنل یسنا فیت متصل کنید.',
].join('\n');

async function handleUpdate(db, update){
  if(!update || typeof update !== 'object') return { handled: false };
  try{
    if(update.message && Array.isArray(update.message)) return { handled: false };
    if(update.message && update.message.text){
      return await handleMessage(db, update.message);
    }
    if(update.callback_query){
      return await handleCallback(db, update.callback_query);
    }
    return { handled: false };
  }catch(error){
    console.log('[Telegram] خطا در پردازش آپدیت:', error.message);
    return { handled: false, error: error.message };
  }
}

function chatOf(message){
  const chat = message && message.chat ? message.chat : null;
  const from = message && message.from ? message.from : null;
  if(!chat) return null;
  return {
    chat_id: chat.id,
    telegram_user_id: from ? String(from.id) : null,
    telegram_username: from ? from.username : null,
  };
}

async function handleMessage(db, message){
  const chat = chatOf(message);
  if(!chat) return { handled: false };
  const text = String(message.text || '').trim();
  const account = accountByChatId(db, chat.chat_id);
  const [rawCommand, ...rest] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const startPayload = command === '/start' ? rest.join(' ').trim() : '';

  if(command === '/start' && startPayload){
    // اتصال حساب با توکن یک‌بارمصرف از پنل شاگرد
    try{
      const { student_id } = linkByToken(db, startPayload, chat);
      const student = db.prepare('SELECT full_name FROM students WHERE id=?').get(student_id);
      await sendMessage(db, chat.chat_id,
        `سلام ${student ? student.full_name : ''} 👋\n✅ حساب شما با موفقیت به یسنا فیت متصل شد.\n\nاز این پس اعلان‌های برنامه‌ها و پیام‌های مربی را همین‌جا دریافت می‌کنید.`,
        mainKeyboard(db, student_id));
      try{ getServices().notificationService.emit(db, { type: 'TELEGRAM_CONNECTED', studentId: student_id, dedupKey: `telegram_connected:${chat.chat_id}` }); }catch(e){ console.log('[Telegram] TELEGRAM_CONNECTED emit failed:', e.message); }
      return { handled: true, linked: student_id };
    }catch(error){
      await sendMessage(db, chat.chat_id, `⚠️ ${error.message}\n\nاز پورتال یسنا فیت → پروفایل من → «اتصال تلگرام» کد تازه بگیرید.`);
      return { handled: true, link_failed: true };
    }
  }

  if(command === '/start'){
    await sendMessage(db, chat.chat_id,
      'سلام 👋\nبه ربات یسنا فیت خوش آمدید.\n\nبرای دریافت برنامه‌ها و اعلان‌ها، ابتدا از پورتال یسنا فیت → «پروفایل من» → «اتصال تلگرام» کد اتصال بگیرید و همین‌جا بفرستید:\n<code>/start کد-اتصال</code>');
    return { handled: true };
  }

  if(!account){
    await sendMessage(db, chat.chat_id, 'هنوز حسابی به این چت متصل نشده است.\nاز پورتال یسنا فیت کد اتصال بگیرید و <code>/start کد</code> را بفرستید.');
    return { handled: true, no_account: true };
  }
  const studentId = account.student_id;

  switch(command){
    case '/help':
      await sendMessage(db, chat.chat_id, HELP_TEXT);
      return { handled: true };
    case '/status': {
      const status = statusForStudent(db, studentId);
      const student = db.prepare('SELECT full_name FROM students WHERE id=?').get(studentId);
      await sendMessage(db, chat.chat_id,
        `👤 ${student ? student.full_name : 'شاگر'}\nوضعیت اتصال: ${status.connected ? '✅ متصل' : '❌ متصل نیست'}\nزمان اتصال: ${status.linked_at || '—'}\nآخرین اعلان: ${status.last_delivery ? `${status.last_delivery.type} (${status.last_delivery.status})` : '—'}`);
      return { handled: true };
    }
    case '/program': {
      const program = db.prepare("SELECT title,status,start_date,end_date FROM training_programs WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1").get(studentId);
      const buttons = [];
      const url = portalUrl('/student/login');
      if(url) buttons.push([{ text: '🏋️ مشاهده برنامه تمرینی', url }]);
      await sendMessage(db, chat.chat_id,
        program
          ? `🏋️ <b>${escapeHtml(program.title || 'برنامه تمرینی')}</b>\nوضعیت: ${statusFa(program.status)}\nاز تاریخ: ${program.start_date || '—'}\nتا تاریخ: ${program.end_date || '—'}`
          : 'هنوز برنامه تمرینی فعال ندارید — مربی شما به‌زودی برنامه را آماده می‌کند.',
        buttons.length ? buttons : null);
      return { handled: true };
    }
    case '/nutrition': {
      const diet = db.prepare("SELECT title,status FROM diet_programs WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1").get(studentId);
      const supplement = db.prepare("SELECT title,status FROM supplement_programs WHERE student_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1").get(studentId);
      const url = portalUrl('/student/login');
      const buttons = url ? [[{ text: '🥗 مشاهده در یسنا فیت', url }]] : null;
      await sendMessage(db, chat.chat_id,
        `🥗 برنامه غذایی: ${diet ? `${escapeHtml(diet.title || '')} (${statusFa(diet.status)})` : 'ثبت نشده'}\n💊 برنامه مکمل: ${supplement ? `${escapeHtml(supplement.title || '')} (${statusFa(supplement.status)})` : 'ثبت نشده'}`, buttons);
      return { handled: true };
    }
    case '/notifications': {
      const rows = db.prepare("SELECT type,title,status,created_at FROM notification_deliveries WHERE student_id=? ORDER BY id DESC LIMIT 10").all(studentId);
      const text = rows.length
        ? rows.map(r => `• ${escapeHtml(r.title || r.type)} — ${statusFa(r.status)} (${r.created_at})`).join('\n')
        : 'اعلانی ثبت نشده است.';
      await sendMessage(db, chat.chat_id, `🔔 <b>اعلان‌های اخیر</b>\n${text}`);
      return { handled: true };
    }
    case '/settings':
      await sendMessage(db, chat.chat_id, settingsText(db, studentId), settingsKeyboard(db, studentId));
      return { handled: true };
    case '/unlink':
      await sendMessage(db, chat.chat_id,
        'برای قطع اتصال، از پورتال یسنا فیت → «پروفایل من» → «قطع اتصال تلگرام» استفاده کنید.\n\n⚠️ تا اتصال مجدد، اعلان‌ها دریافت نمی‌شوند.');
      return { handled: true };
    default:
      await sendMessage(db, chat.chat_id, 'دستور شناخته نشد. /help را امتحان کنید.');
      return { handled: true };
  }
}

async function handleCallback(db, callback){
  const data = String(callback.data || '');
  const chat = chatOf({ chat: callback.message ? callback.message.chat : null, from: callback.from });
  if(!chat) return { handled: false };
  const account = accountByChatId(db, chat.chat_id);
  if(!account){ await answerCallback(callback.id, 'ابتدا حساب خود را متصل کنید'); return { handled: true }; }
  if(!data.startsWith('pref:')){ await answerCallback(callback.id); return { handled: true }; }
  const key = data.slice(5);
  if(!PREFERENCE_KEYS.includes(key)){ await answerCallback(callback.id, 'نامعتبر'); return { handled: true }; }
  const prefs = preferences(db, account.student_id);
  setPreference(db, account.student_id, key, Number(prefs[key]) !== 1);
  await answerCallback(callback.id, 'ذخیره شد ✓');
  await sendMessage(db, chat.chat_id, settingsText(db, account.student_id), settingsKeyboard(db, account.student_id));
  return { handled: true };
}

function mainKeyboard(db, studentId){
  const url = portalUrl('/student/login');
  const rows = [
    [{ text: '🏋️ برنامه تمرینی', callback_data: 'noop:program' }, { text: '🥗 برنامه غذایی', callback_data: 'noop:nutrition' }],
    [{ text: '🔔 اعلان‌ها', callback_data: 'noop:notifs' }, { text: '⚙️ تنظیمات', callback_data: 'noop:settings' }],
  ];
  if(url) rows.push([{ text: '🌐 باز کردن یسنا فیت', url }]);
  return rows;
}
function settingsKeyboard(db, studentId){
  const prefs = preferences(db, studentId);
  const label = { workout: '🏋️ تمرین', nutrition: '🥗 تغذیه', messages: '💬 پیام‌ها', reminders: '⏰ یادآور', system: '🛡 سیستم' };
  return [PREFERENCE_KEYS.map(key => ({ text: `${label[key]}: ${Number(prefs[key]) === 1 ? 'روشن ✓' : 'خاموش'}`, callback_data: `pref:${key}` }))];
}
function settingsText(db, studentId){
  return '<b>⚙️ تنظیمات اعلان‌ها</b>\nروی هر دسته بزنید تا روشن/خاموش شود.';
}
function statusFa(status){
  const map = { ACTIVE: '✅ فعال', DRAFT: '📝 پیش‌نویس', COMPLETED: '🏁 تکمیل', ARCHIVED: '📦 آرشیو', sent: '✅ ارسال شد', pending: '⏳ در انتظار', failed: '❌ ناموفق', retrying: '🔁 تلاش مجدد', cancelled: '🚫 لغو شد' };
  return map[String(status)] || String(status || '—');
}
function escapeHtml(text){ return String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function account_key(chat){ return `${chat.chat_id}`; }

// تزریق سرویس اعلان — در نبودِ تزریق، بارگذاری تنبل برای جلوگیری از وابستگی حلقوی
let _services = null;
function setServices(map){ _services = map; }
function getServices(){ return _services || { notificationService: require('./notification-service') }; }

// ── Webhook ──
function verifyWebhookSecret(headerValue){
  if(!config.webhookSecret) return { ok: false, reason: 'secret_not_set' };
  if(!headerValue) return { ok: false, reason: 'missing_header' };
  return { ok: safeEqual(config.webhookSecret, headerValue) };
}

// ── Long polling (فقط توسعهٔ محلی) ──
let pollingState = { running: false, offset: 0, timer: null };
async function startPolling(db){
  if(!isConfigured()){ console.log('[Telegram] POLLING خواسته شد ولی TELEGRAM_BOT_TOKEN تنظیم نیست؛ صرف‌نظر شد.'); return false; }
  if(pollingState.running) return true;
  pollingState.running = true;
  console.log('[Telegram] Long-polling فعال شد (حالت توسعه).');
  const loop = async () => {
    if(!pollingState.running) return;
    const result = await callApi('getUpdates', { offset: pollingState.offset, timeout: 25, limit: POLLING_BATCH_LIMIT });
    if(result.ok && Array.isArray(result.result)){
      for(const update of result.result){
        pollingState.offset = Math.max(pollingState.offset, (update.update_id || 0) + 1);
        await handleUpdate(db, update);
      }
      pollingState.timer = setTimeout(loop, 500);
    }else{
      if(result.description && !/timeout/.test(result.description)) console.log('[Telegram] polling:', result.description || 'unknown');
      pollingState.timer = setTimeout(loop, 3000);
    }
  };
  pollingState.timer = setTimeout(loop, 100);
  return true;
}
function stopPolling(){
  pollingState.running = false;
  if(pollingState.timer) clearTimeout(pollingState.timer);
  pollingState.timer = null;
}

module.exports = {
  loadConfig, reloadConfig, isConfigured, config: () => config,
  setTransport, callApi,
  createLinkToken, findLinkToken, linkTokenError, linkByToken, linkChat,
  activeAccount, accountByChatId, unlinkAccount, maskChatId,
  preferences, setPreference, categoryEnabled, PREFERENCE_KEYS, ensurePreferences,
  statusForStudent,
  sendMessage, handleUpdate, verifyWebhookSecret,
  startPolling, stopPolling,
  setServices,
  LIMITS: { MAX_DELIVERY_ATTEMPTS, RETRY_DELAYS_MINUTES, LINK_TOKEN_TTL_MINUTES },
};
