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
  '/start — شروع و نمایش منو',
  '/menu — نمایش منو',
  '/help — همین راهنما',
  '',
  'شاگردان: از پورتال یسنا فیت → «پروفایل من» → «اتصال تلگرام» کد بگیرید و <code>/start کد</code> را بفرستید.',
  'مربی: پنل مدیریت → سیستم → تنظیمات تلگرام → «اتصال تلگرام مربی».',
].join('\n');
const COACH_HELP_TEXT = [
  '<b>🛡 راهنمای ربات مدیریت یسنا فیت</b>',
  '',
  '/start یا /menu — منوی مدیریت',
  '/status — وضعیت سامانه در یک نگاه',
  '/pending — ارزیابی‌های در انتظار بررسی',
  '/students — آخرین شاگردان',
  '/visits — آمار بازدید سایت',
  '/notifications — آخرین اعلان‌ها',
  '/help — همین راهنما',
].join('\n');
const STUDENT_HELP_TEXT = [
  '<b>🏋️ راهنمای ربات یسنا فیت (شاگرد)</b>',
  '',
  '/start یا /menu — منوی اصلی',
  '/status — وضعیت اتصال حساب',
  '/program — برنامه تمرینی فعال',
  '/nutrition — برنامه غذایی و مکمل',
  '/notifications — اعلان‌های اخیر',
  '/settings — تنظیمات اعلان‌ها',
  '/unlink — قطع اتصال حساب',
  '/help — همین راهنما',
].join('\n');

function coachByChatId(db, chatId){
  try{
    return db.prepare("SELECT * FROM telegram_coach_accounts WHERE chat_id=? AND unlinked_at IS NULL ORDER BY id DESC LIMIT 1").get(String(chatId));
  }catch(error){ return null; }
}
function coachMenuKeyboard(){
  const url = portalUrl('/coach/dashboard');
  const rows = [
    [{ text: '📊 وضعیت سامانه', callback_data: 'coach:status' }, { text: '📋 ارزیابی‌های در انتظار', callback_data: 'coach:pending' }],
    [{ text: '👥 شاگردان', callback_data: 'coach:students' }, { text: '📈 آمار بازدید سایت', callback_data: 'coach:visits' }],
    [{ text: '🔔 اعلان‌های اخیر', callback_data: 'coach:notifs' }, { text: '❓ راهنما', callback_data: 'coach:help' }],
  ];
  if(url) rows.push([{ text: '🌐 باز کردن پنل مدیریت', url }]);
  return rows;
}
const COACH_WELCOME = '🛡 <b>پنل مدیریت یسنا فیت</b>\nسلام مربی 👋\nاز منوی زیر سامانه را مدیریت کنید:';
function studentMenuKeyboard(){
  const url = portalUrl('/student/login');
  const rows = [
    [{ text: '🏋️ برنامه تمرینی', callback_data: 'stu:program' }, { text: '🥗 برنامه غذایی و مکمل', callback_data: 'stu:nutrition' }],
    [{ text: '🔔 اعلان‌های اخیر', callback_data: 'stu:notifs' }, { text: '⚙️ تنظیمات اعلان‌ها', callback_data: 'stu:settings' }],
    [{ text: '📊 وضعیت حساب', callback_data: 'stu:status' }, { text: '❓ راهنما', callback_data: 'stu:help' }],
  ];
  if(url) rows.push([{ text: '🌐 باز کردن یسنا فیت', url }]);
  return rows;
}
const STUDENT_WELCOME = '🏋️ <b>ربات یسنا فیت</b>\nسلام! از منوی زیر برنامه‌ها و اعلان‌هایت را دنبال کن:';

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
    // اتصال حساب با توکن یک‌بارمصرف — اول توکن شاگرد، بعد توکن مربی/مدیر
    let studentError = null;
    try{
      const { student_id } = linkByToken(db, startPayload, chat);
      const student = db.prepare('SELECT full_name FROM students WHERE id=?').get(student_id);
      await sendMessage(db, chat.chat_id,
        `سلام ${student ? student.full_name : ''} 👋\n✅ حساب شما با موفقیت به یسنا فیت متصل شد.\n\nاز این پس اعلان‌های برنامه‌ها و پیام‌های مربی را همین‌جا دریافت می‌کنید.`,
        mainKeyboard(db, student_id));
      try{ getServices().notificationService.emit(db, { type: 'TELEGRAM_CONNECTED', studentId: student_id, dedupKey: `telegram_connected:${chat.chat_id}` }); }catch(e){ console.log('[Telegram] TELEGRAM_CONNECTED emit failed:', e.message); }
      return { handled: true, linked: student_id };
    }catch(error){ studentError = error; }
    try{
      const linked = linkCoachByToken(db, startPayload, chat);
      await sendMessage(db, chat.chat_id,
        `سلام مربی 👋\n✅ تلگرام شما با موفقیت به پنل یسنا فیت متصل شد.\n\nاز این پس اعلان‌های مدیریتی (مثل «📋 ارزیابی جدید آماده بررسی») همین‌جا دریافت می‌شود.`, coachMenuKeyboard());
      return { handled: true, linked_coach: linked.coach_id };
    }catch(coachError){
      if(coachError && /^حداکثر \d+ حساب/.test(String(coachError.message||''))){
        await sendMessage(db, chat.chat_id, `⚠️ ${coachError.message}`);
        return { handled: true, link_failed: true, reason: 'coach_account_limit' };
      }
      // کد تکراری از همان چتی که قبلاً وصل شده ⇒ خطا نیست؛ وضعیت را تأیید کن
      const alreadyStudent = accountByChatId(db, chat.chat_id);
      const alreadyCoach = db.prepare("SELECT 1 FROM telegram_coach_accounts WHERE chat_id=? AND unlinked_at IS NULL").get(chat.chat_id);
      if((studentError && /قبلاً استفاده/.test(studentError.message) && alreadyStudent) || alreadyCoach){
        await sendMessage(db, chat.chat_id, '✅ این چت قبلاً به یسنا فیت متصل شده است؛ نیازی به اتصال دوباره نیست.');
        return { handled: true, already_linked: true };
      }
      // دقیق‌ترین توضیح: اگر کد مربی شناخته شد ولی رد شد (مصرف/انقضا/بطلان)، همان را بگو
      const reason = coachError && coachError.message && /قبلاً استفاده|باطل|منقضی/.test(coachError.message) ? coachError.message : studentError.message;
      await sendMessage(db, chat.chat_id, `⚠️ ${reason}\n\nشاگردان: پورتال یسنا فیت → پروفایل من → «اتصال تلگرام». مربیان: پنل مدیریت → سیستم → تنظیمات تلگرام.`);
      return { handled: true, link_failed: true };
    }
  }

  const coachAccount = coachByChatId(db, chat.chat_id);

  if(command === '/start' || command === '/menu'){
    if(coachAccount){
      await sendMessage(db, chat.chat_id, COACH_WELCOME, coachMenuKeyboard());
      return { handled: true, coach_menu: true };
    }
    if(account){
      await sendMessage(db, chat.chat_id, STUDENT_WELCOME, studentMenuKeyboard());
      return { handled: true, student_menu: true };
    }
    await sendMessage(db, chat.chat_id,
      'سلام 👋\nبه ربات <b>یسنا فیت</b> خوش آمدید!\n\nاین ربات برای دو گروه است:\n🏋️ <b>شاگردان</b> — برنامه تمرینی و غذایی، اعلان‌های مربی و یادآورها\n🛡 <b>مربی/مدیر</b> — اعلان ارزیابی‌ها، آمار سامانه و آمار بازدید سایت\n\nبرای اتصال:\n• شاگرد: پورتال یسنا فیت → «پروفایل من» → «اتصال تلگرام» → کد را بفرستید:\n<code>/start کد-اتصال</code>\n• مربی: پنل مدیریت → سیستم → تنظیمات تلگرام → «اتصال تلگرام مربی»');
    return { handled: true, guest: true };
  }

  if(coachAccount && !account){
    const handled = await handleCoachCommand(db, chat, command, coachAccount);
    if(handled) return { handled: true, coach: true };
  }

  if(!account){
    await sendMessage(db, chat.chat_id, 'هنوز حسابی به این چت متصل نشده است.\nاز پورتال یسنا فیت کد اتصال بگیرید و <code>/start کد</code> را بفرستید.');
    return { handled: true, no_account: true };
  }
  const studentId = account.student_id;

  switch(command){
    case '/help':
      await sendMessage(db, chat.chat_id, STUDENT_HELP_TEXT);
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
      await sendMessage(db, chat.chat_id, 'دستور شناخته نشد. /menu را امتحان کنید.');
      return { handled: true };
  }
}

// ── دستورات و دادهٔ سمت مربی/مدیر ──
const _analytics = () => { try{ return require('./analytics-service'); }catch(error){ return null; } };
function coachStatusText(db){
  const students = db.prepare('SELECT COUNT(*) n FROM students WHERE deleted_at IS NULL').get().n;
  const activePrograms = db.prepare("SELECT COUNT(*) n FROM training_programs WHERE status='ACTIVE' AND deleted_at IS NULL").get().n;
  const pending = db.prepare("SELECT COUNT(*) n FROM body_assessments WHERE status IN ('SUBMITTED','PENDING_REVIEW') AND deleted_at IS NULL").get().n;
  const diet = db.prepare("SELECT COUNT(*) n FROM diet_programs WHERE status='ACTIVE' AND deleted_at IS NULL").get().n;
  return `📊 <b>وضعیت سامانه</b>\n👥 شاگردان: ${students}\n🏋️ برنامه‌های تمرینی فعال: ${activePrograms}\n🥗 برنامه‌های غذایی فعال: ${diet}\n📋 ارزیابی‌های در انتظار بررسی: ${pending}`;
}
async function sendPendingAssessments(db, chatId){
  const rows = db.prepare(`SELECT ba.id, s.full_name FROM body_assessments ba
                     JOIN students s ON s.id=ba.student_id
                     WHERE ba.status IN ('SUBMITTED','PENDING_REVIEW') AND ba.deleted_at IS NULL
                     ORDER BY ba.submitted_at DESC LIMIT 8`).all();
  if(!rows.length){ await sendMessage(db, chatId, '📋 در حال حاضر ارزیابی در انتظار بررسی نیست.'); return; }
  const buttons = rows.map(r => {
    const url = portalUrl(`/assessments/${r.id}`);
    const label = `📋 #${r.id} — ${r.full_name || 'شاگرد'}`;
    return url ? [{ text: label, url }] : [{ text: label, callback_data: 'coach:pending' }];
  });
  await sendMessage(db, chatId, `📋 <b>ارزیابی‌های در انتظار بررسی (${rows.length})</b>\nروی هر مورد بزنید تا مستقیم باز شود:`, buttons);
}
async function sendStudentsList(db, chatId){
  const total = db.prepare('SELECT COUNT(*) n FROM students WHERE deleted_at IS NULL').get().n;
  const rows = db.prepare('SELECT full_name, case_number FROM students WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 8').all();
  const text = rows.length ? rows.map(r => `• ${escapeHtml(r.full_name || 'بی‌نام')} — پروندهٔ ${r.case_number || '—'}`).join('\n') : 'هنوز شاگردی ثبت نشده است.';
  await sendMessage(db, chatId, `👥 <b>شاگردان (${total})</b> — آخرین‌ها:\n${text}`);
}
async function sendVisitStats(db, chatId){
  const analytics = _analytics();
  if(!analytics){ await sendMessage(db, chatId, '📈 آمار بازدید در دسترس نیست.'); return; }
  const data = analytics.visitSummary(db, 7);
  const s = data.summary;
  const topCountries = data.countries.filter(c => c.code !== '??').slice(0, 4).map(c => `${analytics.flagOf(c.code)} ${escapeHtml(c.name)}: ${c.ips} IP`).join('\n');
  const devices = data.devices.map(d => `${analytics.deviceFa(d.device)}: ${d.views} بازدید`).join('\n');
  await sendMessage(db, chatId,
    `📈 <b>آمار بازدید سایت (۷ روز اخیر)</b>\n\nامروز: ${s.today_views} بازدید • ${s.today_ips} IP یکتا\n۷ روز: ${s.day7_views} بازدید • ${s.day7_ips} IP یکتا\nکل: ${s.total_views} بازدید • ${s.total_ips} IP یکتا\n\n<b>کشورها:</b>\n${topCountries || '— هنوز جغرافیایی حل نشده'}\n\n<b>دستگاه‌ها:</b>\n${devices || '—'}`);
}
async function sendCoachNotifications(db, chatId){
  const rows = db.prepare("SELECT title,status,created_at FROM notification_deliveries WHERE audience='coach' ORDER BY id DESC LIMIT 10").all();
  const text = rows.length ? rows.map(r => `• ${escapeHtml(r.title || '')} — ${statusFa(r.status)} (${r.created_at})`).join('\n') : 'اعلانی ثبت نشده است.';
  await sendMessage(db, chatId, `🔔 <b>آخرین اعلان‌های مدیریتی</b>\n${text}`);
}
async function handleCoachCommand(db, chat, command, coachAccount){
  const chatId = chat.chat_id;
  switch(command){
    case '/help': await sendMessage(db, chatId, COACH_HELP_TEXT, coachMenuKeyboard()); return true;
    case '/status': await sendMessage(db, chatId, coachStatusText(db)); return true;
    case '/pending': await sendPendingAssessments(db, chatId); return true;
    case '/students': await sendStudentsList(db, chatId); return true;
    case '/visits': await sendVisitStats(db, chatId); return true;
    case '/notifications': await sendCoachNotifications(db, chatId); return true;
    case '/panel': {
      const url = portalUrl('/coach/dashboard');
      await sendMessage(db, chatId, url ? `🌐 پنل مدیریت:\n${url}` : 'آدرس عمومی پنل تنظیم نشده است (yasnafit_public_url).');
      return true;
    }
    default: return false;
  }
}

async function handleCallback(db, callback){
  const data = String(callback.data || '');
  const chat = chatOf({ chat: callback.message ? callback.message.chat : null, from: callback.from });
  if(!chat) return { handled: false };
  const account = accountByChatId(db, chat.chat_id);
  const coachAccount = coachByChatId(db, chat.chat_id);
  if(data.startsWith('coach:')){
    if(!coachAccount){ await answerCallback(callback.id, 'ابتدا تلگرام مربی را متصل کنید'); return { handled: true }; }
    await answerCallback(callback.id);
    const handled = await handleCoachCommand(db, chat, '/' + data.slice(6), coachAccount);
    if(!handled) await sendMessage(db, chat.chat_id, 'این بخش در دسترس نیست.');
    return { handled: true, coach: true };
  }
  if(data.startsWith('stu:') && account){
    await answerCallback(callback.id);
    const cmd = '/' + data.slice(4);
    if(cmd === '/help'){ await sendMessage(db, chat.chat_id, STUDENT_HELP_TEXT, studentMenuKeyboard()); return { handled: true, student: true }; }
    if(cmd === '/menu'){ await sendMessage(db, chat.chat_id, STUDENT_WELCOME, studentMenuKeyboard()); return { handled: true, student: true }; }
    if(['/program','/nutrition','/notifications','/settings','/status'].includes(cmd)){
      await handleMessage(db, { chat: { id: chat.chat_id }, from: callback.from, text: cmd });
      return { handled: true, student: true };
    }
    await sendMessage(db, chat.chat_id, 'این بخش در دسترس نیست.');
    return { handled: true };
  }
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

function mainKeyboard(db, studentId){ return studentMenuKeyboard(); }
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

// ── ثبت دکمهٔ منوی ربات (BotCommands) هنگام پیکربندی ──
async function registerCommands(){
  if(!isConfigured()) return false;
  const result = await callApi('setMyCommands', { commands: [
    { command: 'start', description: 'شروع و نمایش منو' },
    { command: 'menu', description: 'نمایش منو' },
    { command: 'status', description: 'وضعیت (مربی: سامانه / شاگرد: حساب)' },
    { command: 'pending', description: 'ارزیابی‌های در انتظار بررسی (مربی)' },
    { command: 'students', description: 'آخرین شاگردان (مربی)' },
    { command: 'visits', description: 'آمار بازدید سایت (مربی)' },
    { command: 'program', description: 'برنامه تمرینی (شاگرد)' },
    { command: 'nutrition', description: 'برنامه غذایی و مکمل (شاگرد)' },
    { command: 'settings', description: 'تنظیمات اعلان‌ها (شاگرد)' },
    { command: 'help', description: 'راهنما' },
  ] });
  if(result && result.ok) console.log('[Telegram] منوی دستورات ربات ثبت شد.');
  return Boolean(result && result.ok);
}

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
  try{ await callApi('deleteWebhook', { drop_pending_updates: false }); }catch(e){}
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

// ── تنظیمات از رابط مربی (جدول settings) — متغیرهای محیطی اولویت دارند ──
const SETTING_KEYS = {
  token: 'telegram_bot_token',
  username: 'telegram_bot_username',
  webhookSecret: 'telegram_webhook_secret',
  publicUrl: 'yasnafit_public_url',
  polling: 'telegram_polling',
};
function dbSettings(db){
  const rows = db.prepare("SELECT key,value FROM settings WHERE key IN (?,?,?,?,?)").all(SETTING_KEYS.token, SETTING_KEYS.username, SETTING_KEYS.webhookSecret, SETTING_KEYS.publicUrl, SETTING_KEYS.polling);
  const map = {};
  for(const row of rows) map[row.key] = row.value;
  return map;
}
function effectiveConfig(db){
  const stored = dbSettings(db);
  const env = loadConfig();
  const pick = (envValue, key, normalize) => {
    let value = envValue !== null && envValue !== undefined ? envValue : String(stored[key] || '').trim();
    if(value === '' || value === null || value === undefined) return null;
    return normalize ? normalize(value) : value;
  };
  return {
    token: pick(env.token, SETTING_KEYS.token),
    username: pick(env.username, SETTING_KEYS.username, v => String(v).replace(/^@/, '')),
    webhookSecret: pick(env.webhookSecret, SETTING_KEYS.webhookSecret),
    publicUrl: pick(env.publicUrl, SETTING_KEYS.publicUrl, v => String(v).replace(/\/+$/, '')),
    polling: env.polling || stored[SETTING_KEYS.polling] === '1',
  };
}
function applyDbSettings(db){ config = effectiveConfig(db); return config; }
function settingsSource(db){
  const stored = dbSettings(db);
  if(loadConfig().token) return 'env';
  if(stored[SETTING_KEYS.token]) return 'database';
  return 'none';
}
function maskSecret(value){
  if(!value) return null;
  const clean = String(value);
  return clean.length <= 8 ? '••••' : `••••${clean.slice(-4)}`;
}
function settingsView(db){
  return {
    configured: Boolean(config.token),
    source: settingsSource(db),
    bot_username: config.username,
    token_masked: maskSecret(config.token),
    has_webhook_secret: Boolean(config.webhookSecret),
    public_url: config.publicUrl,
    polling: Boolean(config.polling),
  };
}
function saveCoachSettings(db, input = {}){
  const upsert = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  // توکن/رمز فقط وقتی مقدار غیرخالی بدهند جایگزین می‌شوند (خالی = حفظ مقدار فعلی)
  if(input.bot_token !== undefined && String(input.bot_token).trim() !== '') upsert.run(SETTING_KEYS.token, String(input.bot_token).trim());
  if(input.bot_username !== undefined) upsert.run(SETTING_KEYS.username, String(input.bot_username).trim().replace(/^@/, ''));
  if(input.webhook_secret !== undefined && String(input.webhook_secret).trim() !== '') upsert.run(SETTING_KEYS.webhookSecret, String(input.webhook_secret).trim());
  if(input.public_url !== undefined) upsert.run(SETTING_KEYS.publicUrl, String(input.public_url).trim());
  if(input.polling !== undefined) upsert.run(SETTING_KEYS.polling, input.polling ? '1' : '0');
  applyDbSettings(db);
  return settingsView(db);
}
// ── حساب تلگرام مربی/مدیر (گیرندهٔ اعلان‌های مدیریتی مثل «ارزیابی جدید آماده بررسی») ──
const COACH_ACCOUNT_LIMIT = 3;
function coachActiveAccounts(db, coachId = 1){
  return db.prepare("SELECT * FROM telegram_coach_accounts WHERE coach_id=? AND unlinked_at IS NULL AND status='active' ORDER BY id ASC").all(Number(coachId) || 1) || [];
}
function coachActiveAccount(db, coachId = 1){ return coachActiveAccounts(db, coachId)[0] || null; }
function coachStatus(db, coachId = 1){
  const accounts = coachActiveAccounts(db, coachId);
  const account = accounts[0] || null;
  if(!account) return { connected: false, status: 'never_linked', telegram_username: null, chat_id_masked: null, linked_at: null, account_limit: COACH_ACCOUNT_LIMIT, accounts: [] };
  return {
    connected: true,
    status: account.status,
    telegram_username: account.telegram_username,
    chat_id_masked: maskChatId(account.chat_id),
    linked_at: account.linked_at,
    account_limit: COACH_ACCOUNT_LIMIT,
    accounts: accounts.map(a => ({ id: a.id, chat_id_masked: maskChatId(a.chat_id), telegram_username: a.telegram_username, linked_at: a.linked_at })),
  };
}
function createCoachLinkToken(db, coachId = 1){
  // توکن‌های باز قبلیِ همین مربی باطل می‌شوند (فقط آخرین کد معتبر است)
  db.prepare("UPDATE telegram_coach_link_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE coach_id=? AND consumed_at IS NULL AND revoked_at IS NULL").run(Number(coachId) || 1);
  const raw = crypto.randomBytes(24).toString('base64url');
  db.prepare("INSERT INTO telegram_coach_link_tokens(stable_id,coach_id,token_hash,token_hint,expires_at) VALUES(?,?,?,?,datetime('now',?))")
    .run(uuid(), Number(coachId) || 1, sha256(raw), raw.slice(-4), `+${LINK_TOKEN_TTL_MINUTES} minutes`);
  const username = config.username;
  if(!username) throw new Error('یوزرنیم ربات تنظیم نشده است');
  return {
    link_code: raw,
    expires_at: db.prepare("SELECT expires_at FROM telegram_coach_link_tokens WHERE token_hash=?").get(sha256(raw)).expires_at,
    bot_username: username,
    deep_link: `https://t.me/${username}?start=${raw}`,
    ttl_minutes: LINK_TOKEN_TTL_MINUTES,
  };
}
function findCoachLinkToken(db, rawCode){
  const cleanCode = String(rawCode || '').trim();
  if(!cleanCode) return null;
  const row = db.prepare("SELECT * FROM telegram_coach_link_tokens WHERE token_hash=?").get(sha256(cleanCode));
  if(!row) return null;
  if(row.consumed_at) return { error: 'این کد قبلاً استفاده شده است. کد تازه بگیرید.' };
  if(row.revoked_at) return { error: 'این کد باطل شده است. کد تازه بگیرید.' };
  if(new Date(row.expires_at + 'Z').getTime() < Date.now()) return { error: 'این کد منقضی شده است. کد تازه بگیرید.' };
  return row;
}
function linkCoachByToken(db, rawCode, chat){
  const row = findCoachLinkToken(db, rawCode);
  if(!row || row.error) throw new Error(row && row.error ? row.error : 'کد اتصال نامعتبر است');
  // هر چت فقط یک‌بار فعال؛ یک مربی می‌تواند چند چت فعال داشته باشد (سقف ۳) — اعلان‌ها به همه می‌رود
  db.prepare("UPDATE telegram_coach_accounts SET unlinked_at=CURRENT_TIMESTAMP,status='unlinked',updated_at=CURRENT_TIMESTAMP WHERE chat_id=? AND unlinked_at IS NULL").run(chat.chat_id);
  if(coachActiveAccounts(db, row.coach_id).length >= COACH_ACCOUNT_LIMIT) throw new Error(`حداکثر ${COACH_ACCOUNT_LIMIT} حساب تلگرام می‌توانید به پنل متصل کنید؛ ابتدا یکی را قطع کنید`);
  db.prepare("INSERT INTO telegram_coach_accounts(stable_id,coach_id,chat_id,telegram_user_id,telegram_username) VALUES(?,?,?,?,?)")
    .run(uuid(), row.coach_id, String(chat.chat_id), chat.telegram_user_id || null, chat.telegram_username || null);
  db.prepare("UPDATE telegram_coach_link_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  return { coach_id: row.coach_id };
}
function coachUnlinkAccount(db, account){
  db.prepare("UPDATE telegram_coach_accounts SET status='unlinked',unlinked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(account.id);
}

// آزمون واقعی اتصال با پیکربندی فعلی (getMe) — توکن هرگز در پاسخ/لاگ نمی‌آید
async function testConnection(){
  if(!config.token) return { ok: false, description: 'telegram_not_configured' };
  const result = await callApi('getMe', {});
  if(result.ok && result.result) return { ok: true, bot: { username: result.result.username, first_name: result.result.first_name } };
  return { ok: false, description: result.description || 'unknown_error' };
}

module.exports = {
  loadConfig, reloadConfig, isConfigured, config: () => config,
  setTransport, callApi,
  createLinkToken, findLinkToken, linkTokenError, linkByToken, linkChat,
  activeAccount, accountByChatId, unlinkAccount, maskChatId, coachActiveAccounts, COACH_ACCOUNT_LIMIT,
  preferences, setPreference, categoryEnabled, PREFERENCE_KEYS, ensurePreferences,
  statusForStudent,
  sendMessage, handleUpdate, verifyWebhookSecret,
  startPolling, stopPolling, registerCommands, coachByChatId,
  setServices,
  applyDbSettings, settingsView, settingsSource, saveCoachSettings, testConnection, SETTING_KEYS,
  coachActiveAccount, coachStatus, createCoachLinkToken, linkCoachByToken, coachUnlinkAccount,
  LIMITS: { MAX_DELIVERY_ATTEMPTS, RETRY_DELAYS_MINUTES, LINK_TOKEN_TTL_MINUTES },
};
