/**
 * Notification Service — لایهٔ رویداد/اعلان Yasnafit
 *
 * معماری:
 *   Yasnafit Core (رویداد واقعی کسب‌وکار)
 *     → notificationService.emit (این فایل: ترجیحات + dedup + دفتر تحویل)
 *       → Channel Adapter (تلگرام = پیاده‌سازی واقعی؛ ایمیل/پوش آینده‌اند و فقط نقطهٔ توسعه)
 *
 * قواعد:
 *  - فقط رویدادهای واقعی موجود در کد emit می‌شوند؛ نوع‌های آینده فقط در کاتالوگ‌اند.
 *  - dedup_key یکتا ⇒ پردازش تکراری همان رویداد پیام دوباره نمی‌فرستد.
 *  - خطای تلگرام هرگز Yasnafit را نمی‌اندازد؛ تلاش مجدد با backoff انجام می‌شود.
 */

const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(16).toString('hex'));

// کاتالوگ انواع اعلان — افزودن نوع جدید = یک خط اینجا (دستهٔ ترجیح متن را تعیین می‌کند)
const TYPES = {
  PROGRAM_ASSIGNED:      { category: 'workout' },
  PROGRAM_UPDATED:       { category: 'workout' },
  NUTRITION_PLAN_READY:  { category: 'nutrition' },
  SUPPLEMENT_PLAN_READY: { category: 'nutrition' },
  COACH_MESSAGE:         { category: 'messages' },
  TELEGRAM_CONNECTED:    { category: 'system' },
  TELEGRAM_DISCONNECTED: { category: 'system' },
  PROGRAM_ENDING_REMINDER: { category: 'reminders' },
  ASSESSMENT_READY:      { category: 'system' },
  ASSESSMENT_APPROVED:   { category: 'system' },
  ASSESSMENT_REJECTED:   { category: 'system' },
  ASSESSMENT_CHANGES_REQUESTED: { category: 'system' },
  REMINDER:              { category: 'reminders' },
  SYSTEM_NOTIFICATION:   { category: 'system' },
  // نقطه‌های توسعهٔ آینده (فعلاً وصل نیستند — رفتاری ساختگی ندارند):
  // PAYMENT_SUCCESS / APPOINTMENT_REMINDER / EVALUATION_READY / BODY_ASSESSMENT_READY
};

const CATEGORY_LABELS = { workout: 'تمرینی', nutrition: 'تغذیه', messages: 'پیام‌ها', reminders: 'یادآور', system: 'سیستم' };

function telegramService(){ return require('./telegram-service'); }

function portalButton(portalPath, label = '🌐 باز کردن یسنا فیت'){
  const svc = telegramService();
  const url = svc.config().publicUrl ? `${svc.config().publicUrl}${portalPath}` : null;
  return url ? [[{ text: label, url }]] : null;
}

function defaultCopy(type){
  const map = {
    PROGRAM_ASSIGNED:      { title: '🏋️ برنامه تمرینی جدید شما آماده شد', body: 'برنامه تمرینی جدید شما توسط مربی فعال شد. وارد یسنا فیت شوید تا برنامه خود را مشاهده کنید.', portal: '/student/login' },
    PROGRAM_UPDATED:       { title: '✏️ برنامه تمرینی شما به‌روزرسانی شد', body: 'تغییرات برنامه تمرینی شما ثبت شد. وارد یسنا فیت شوید تا نسخهٔ جدید را ببینید.', portal: '/student/login' },
    NUTRITION_PLAN_READY:  { title: '🥗 برنامه غذایی جدید شما آماده شد', body: 'برنامه غذایی شما توسط مربی ثبت شد. وارد یسنا فیت شوید تا آن را ببینید.', portal: '/student/diet' },
    SUPPLEMENT_PLAN_READY: { title: '💊 برنامه مکمل شما آماده شد', body: 'برنامه مکمل شما توسط مربی ثبت شد. وارد یسنا فیت شوید.', portal: '/student/supplement' },
    COACH_MESSAGE:         { title: '💬 پیام جدید مربی', body: 'مربی برای شما پیام فرستاده است. وارد یسنا فیت شوید تا پاسخ دهید.', portal: '/student/messages' },
    TELEGRAM_CONNECTED:    { title: '🔗 اتصال تلگرام انجام شد', body: 'حساب یسنا فیت شما با موفقیت به تلگرام متصل شد.', portal: null },
    TELEGRAM_DISCONNECTED: { title: '🔓 اتصال تلگرام قطع شد', body: 'اتصال حساب شما به تلگرام قطع شد. برای دریافت دوبارهٔ اعلان‌ها از پنل، دوباره متصل شوید.', portal: null },
    PROGRAM_ENDING_REMINDER: { title: '⏰ پایان برنامه نزدیک است', body: 'تا پایان برنامه تمرینی شما کم مانده است.', portal: '/student/login' },
    ASSESSMENT_READY:      { title: '📋 ارزیابی جدید آماده بررسی است', body: 'یک ارزیابی جدید توسط شاگرد تکمیل شده و آماده بررسی شماست.', portal: null },
    ASSESSMENT_APPROVED:   { title: '✅ پرونده شما تأیید شد', body: 'مربی پرونده شما را تأیید کرد.', portal: '/student/login' },
    ASSESSMENT_REJECTED:   { title: '❌ پرونده رد شد', body: '', portal: '/student/login' },
    ASSESSMENT_CHANGES_REQUESTED: { title: '✏️ اصلاح پرونده درخواست شد', body: '', portal: '/student/login' },
    REMINDER:              { title: '⏰ یادآور', body: '', portal: null },
    SYSTEM_NOTIFICATION:   { title: '🛡 اعلان سیستم', body: '', portal: null },
  };
  return map[type] || { title: type, body: '', portal: null };
}

function statusFa(status){
  const map = { sent: 'ارسال شد', pending: 'در انتظار', failed: 'ناموفق', retrying: 'تلاش مجدد', cancelled: 'لغو شد' };
  return map[status] || status;
}

/**
 * emit — نقطهٔ ورود همهٔ اعلان‌ها
 * گزینه‌ها: {type, studentId, title?, body?, entityType?, entityId?, dedupKey}
 * dedupKey مثلاً `program_assigned:<programId>` — پردازش دوبارهٔ همان رویداد بی‌اثر می‌شود.
 */
function emit(db, { type, studentId, audience = 'student', title = null, body = null, entityType = null, entityId = null, dedupKey = null }){
  const meta = TYPES[type];
  if(!meta) throw new Error(`نوع اعلان تعریف نشده است: ${type}`);
  if(!studentId) return { skipped: 'no_student' };
  if(!['student','coach'].includes(audience)) throw new Error('Invalid notification audience');
  const tg = telegramService();
  const defaults = defaultCopy(type);

  // ترجیحات شاگرد — دستهٔ خاموش ارسال نمی‌شود (اعلان‌های مربی مشمول ترجیح شاگرد نیستند)
  if(audience === 'student' && !tg.categoryEnabled(db, studentId, meta.category)){
    return { skipped: 'preference_disabled', category: meta.category };
  }

  const key = dedupKey || `${String(type).toLowerCase()}:${entityType || 'x'}:${entityId ?? 'x'}:${audience}:student:${studentId}`;
  const finalTitle = String(title || defaults.title).slice(0, 400);
  const finalBody = String(body ?? defaults.body ?? '').slice(0, 3000);

  const insert = db.prepare(`INSERT INTO notification_deliveries(stable_id,student_id,audience,channel,type,category,title,body,entity_type,entity_id,dedup_key,status,max_attempts,next_attempt_at)
    VALUES(?,?,?, 'telegram',?,?,?,?,?,?,?, 'pending',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  let deliveryId;
  try{
    deliveryId = insert.run(uuid(), studentId, audience, String(type), meta.category, finalTitle, finalBody, entityType, entityId, key, tg.LIMITS.MAX_DELIVERY_ATTEMPTS).lastInsertRowid;
  }catch(error){
    if(/UNIQUE/.test(String(error.message))) return { deduplicated: true, dedupKey: key };
    throw error;
  }
  setImmediate(() => { attemptDelivery(db, deliveryId).catch(() => {}); });
  return { queued: true, deliveryId, dedupKey: key, category: meta.category };
}

/**
 * mirrorInAppNotification — آینهٔ اعلان درون‌برنامه‌ای شاگرد به تلگرام
 * هر notify با audienceType:'student' یک‌بار از اینجا عبور می‌کند (از engagement-service.notify).
 * فقط نوع‌های شناخته‌شدهٔ واقعی آینه می‌شوند؛ عنوان/متن همان اعلان درون‌برنامه‌ای استفاده می‌شود.
 */
const MIRROR_MAP = {
  program_activate:                { type: 'PROGRAM_ASSIGNED' },
  program_complete:                { type: 'PROGRAM_UPDATED', unique: true },
  program_archive:                 { type: 'PROGRAM_UPDATED', unique: true },
  diet_program_assigned:           { type: 'NUTRITION_PLAN_READY' },
  supplement_program_assigned:     { type: 'SUPPLEMENT_PLAN_READY' },
  coach_message:                   { type: 'COACH_MESSAGE' },
  program_ending:                  { type: 'PROGRAM_ENDING_REMINDER' },
  assessment_approved:             { type: 'ASSESSMENT_APPROVED' },
  assessment_rejected:             { type: 'ASSESSMENT_REJECTED' },
  assessment_changes_requested:    { type: 'ASSESSMENT_CHANGES_REQUESTED' },
};
function mirrorInAppNotification(db, { type, studentId, title, body = '', entityType = null, entityId = null }){
  const mapped = MIRROR_MAP[type];
  if(!mapped || !studentId) return { skipped: 'unmapped' };
  const dedupKey = mapped.unique
    ? `${mapped.type.toLowerCase()}:${entityType || 'x'}:${entityId ?? 'x'}:student:${studentId}:${Date.now()}`
    : undefined; // کلید پایدار پیش‌فرض emit کافی است
  return emit(db, {
    type: mapped.type, studentId, title: title || undefined, body: body || undefined,
    entityType, entityId, dedupKey,
  });
}

function isPermanentFailure(result){
  const description = String(result && result.description || '');
  if(result && result.error_code === 403) return true;                 // ربات بلاک شده / چت ممنوع
  if(result && result.error_code === 400 && /chat not found/i.test(description)) return true; // chat_id نامعتبر
  if(/telegram_not_configured/.test(description)) return false;        // پیکربندی نیست — بعداً تلاش می‌کنیم
  return false;
}

async function attemptDelivery(db, deliveryId){
  const row = db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(deliveryId);
  if(!row || ['sent', 'cancelled'].includes(row.status)) return row || null;
  const tg = telegramService();
  let result = { ok: false, description: 'telegram_not_configured' };
  try{
    if(tg.isConfigured()){
      // گیرنده بر اساس مخاطب: شاگرد خودش، مربیِ مسئول همان شاگرد (coach_students → telegram_coach_accounts)
      const audience = row.audience || 'student';
      const account = audience === 'coach'
        ? tg.coachActiveAccount(db, (db.prepare('SELECT coach_id FROM coach_students WHERE student_id=?').get(row.student_id) || { coach_id: 1 }).coach_id)
        : tg.activeAccount(db, row.student_id);
      if(!account){
        // گیرنده تلگرام ندارد: تلاش بی‌معناست — لغو (اعلان درون‌برنامه‌ای به قوت خودش باقی است)
        db.prepare("UPDATE notification_deliveries SET status='cancelled',last_error='no_active_telegram_account',next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','retrying')").run(row.id);
        return db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(row.id);
      }else{
        const buttons = portalButtonFor(row);
        result = await tg.sendMessage(db, account.chat_id,
          `<b>${escapeHtml(row.title)}</b>${row.body ? `\n\n${escapeHtml(row.body)}` : ''}`, buttons);
      }
    }
  }catch(error){
    result = { ok: false, description: `exception: ${error.message}` };
  }

  if(result.ok){
    db.prepare("UPDATE notification_deliveries SET status='sent',sent_at=CURRENT_TIMESTAMP,attempts=attempts+1,last_error=NULL,next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
    return db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(row.id);
  }

  const description = String(result.description || 'unknown_error');
  if(isPermanentFailure(result)){
    // بلاک/چت نامعتبر: اتصال علامت‌خورده و تلاش بیشتر بی‌فایده است
    if(result.error_code === 403 || (result.error_code === 400 && /chat not found/i.test(description))){
      const account = tg.activeAccount(db, row.student_id);
      if(account){
        const newStatus = result.error_code === 403 ? 'blocked' : 'invalid';
        db.prepare("UPDATE telegram_accounts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newStatus, account.id);
      }
    }
    db.prepare("UPDATE notification_deliveries SET status='cancelled',attempts=attempts+1,last_error=?,account_status=?,next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(description.slice(0, 300), result.error_code ? String(result.error_code) : null, row.id);
    return db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(row.id);
  }

  const attempts = Number(row.attempts || 0) + 1;
  if(attempts >= Number(row.max_attempts || 3)){
    db.prepare("UPDATE notification_deliveries SET status='failed',attempts=?,last_error=?,next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(attempts, description.slice(0, 300), row.id);
    return db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(row.id);
  }
  const delayMinutes = tg.LIMITS.RETRY_DELAYS_MINUTES[Math.min(attempts - 1, tg.LIMITS.RETRY_DELAYS_MINUTES.length - 1)];
  db.prepare("UPDATE notification_deliveries SET status='retrying',attempts=?,last_error=?,next_attempt_at=datetime('now',?),updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(attempts, description.slice(0, 300), `+${delayMinutes} minutes`, row.id);
  return db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(row.id);
}

function portalButtonFor(row){
  const defaults = defaultCopy(row.type);
  if(row.type === 'ASSESSMENT_READY' && row.entity_id){
    // مسیر بررسی ارزیابی — همان مسیر فعلی پنل مربی (/assessments/:id) با نشست مربی؛ توکن در URL نیست
    return portalButton(`/assessments/${row.entity_id}`, '🔎 مشاهده ارزیابی');
  }
  return defaults.portal ? portalButton(defaults.portal) : null;
}

/** پردازش صف: موارد سررسید را دانه‌دانه (با احترام به rate limit) می‌فرستد. */
async function processDue(db, { limit = 15, pauseMs = 400 } = {}){
  const tg = telegramService();
  if(!tg.isConfigured()) return { processed: 0, reason: 'telegram_not_configured' };
  const due = db.prepare("SELECT id FROM notification_deliveries WHERE status IN ('pending','retrying') AND (next_attempt_at IS NULL OR next_attempt_at<=datetime('now')) ORDER BY id LIMIT ?").all(limit);
  let processed = 0;
  for(const item of due){
    // قبل از ارسال دوباره بررسی کن اتصال هنوز فعال است (شاگرد لینک را قطع کرده؟)
    const row = db.prepare("SELECT * FROM notification_deliveries WHERE id=?").get(item.id);
    if(!row) continue;
    const account = (row.audience || 'student') === 'coach'
      ? tg.coachActiveAccount(db, (db.prepare('SELECT coach_id FROM coach_students WHERE student_id=?').get(row.student_id) || { coach_id: 1 }).coach_id)
      : tg.activeAccount(db, row.student_id);
    if(!account){
      db.prepare("UPDATE notification_deliveries SET status='cancelled',last_error='no_active_telegram_account',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
      processed += 1;
      continue;
    }
    await attemptDelivery(db, row.id);
    processed += 1;
    if(pauseMs && due.length > 1) await new Promise(resolve => setTimeout(resolve, pauseMs));
  }
  return { processed };
}

let retryTimer = null;
function startRetryLoop(db, intervalMs = 60000){
  if(retryTimer) return;
  retryTimer = setInterval(() => {
    processDue(db).catch(() => {});
  }, intervalMs);
  if(retryTimer.unref) retryTimer.unref();
}
function stopRetryLoop(){ if(retryTimer){ clearInterval(retryTimer); retryTimer = null; } }

function escapeHtml(text){ return String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function listForStudent(db, studentId, limit = 10){
  return db.prepare("SELECT stable_id,type,category,title,status,attempts,last_error,sent_at,created_at FROM notification_deliveries WHERE student_id=? ORDER BY id DESC LIMIT ?").all(studentId, limit);
}
function integrationStatus(db){
  const tg = telegramService();
  const counts = db.prepare("SELECT status,COUNT(*) c FROM notification_deliveries GROUP BY status").all();
  const byStatus = Object.fromEntries(counts.map(r => [r.status, r.c]));
  return {
    configured: tg.isConfigured(),
    bot_username: tg.config().username,
    webhook_secret_set: Boolean(tg.config().webhookSecret),
    public_url_set: Boolean(tg.config().publicUrl),
    polling: tg.config().polling,
    deliveries: byStatus,
    connected_accounts: db.prepare("SELECT COUNT(*) c FROM telegram_accounts WHERE unlinked_at IS NULL").get().c,
  };
}

module.exports = {
  TYPES, CATEGORY_LABELS, emit, attemptDelivery, processDue, mirrorInAppNotification, MIRROR_MAP,
  startRetryLoop, stopRetryLoop, listForStudent, integrationStatus, statusFa,
};
