/**
 * Yasnafit — تنظیمات تلگرام (پنل مربی)
 * فعال‌سازی ربات بدون دست‌زدن به سرور: توکن/یوزرنیم/رمز وب‌هوک/آدرس عمومی + آزمون اتصال + ثبت وب‌هوک
 * الگوی امنیت مثل AI: مقادیر مخفی فقط ماسک‌شده برمی‌گردند و هرگز لاگ نمی‌شوند.
 */
(() => {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطای ناشناخته سرور');
    return data;
  }

  function strongSecret() {
    const bytes = new Uint8Array(32);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => bytes[i] = Math.floor(Math.random() * 256));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  window.renderTelegramSettings = async (label = 'تنظیمات تلگرام', route = '/settings/telegram') => {
    window.current = route;
    const crumb = document.querySelector('#breadcrumb');
    if (crumb) crumb.textContent = label;
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    const content = document.querySelector('#content');
    if (!content) return;

    content.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>در حال دریافت تنظیمات تلگرام…</p></div>';

    let settings = { configured: false, source: 'none', bot_username: null, token_masked: null, has_webhook_secret: false, public_url: null, polling: false };
    let status = { configured: false, deliveries: {}, connected_accounts: 0 };
    let connection = { connected: false, status: 'never_linked' };
    try { settings = await api('/api/coach/telegram/settings'); } catch (e) {}
    try { status = await api('/api/coach/telegram'); } catch (e) {}
    try { connection = await api('/api/coach/telegram/connection'); } catch (e) {}

    const sourceLabel = settings.source === 'env' ? 'متغیر محیطی (اولویت دارد)' : settings.source === 'database' ? 'ذخیره‌شده در همین صفحه' : 'تنظیم نشده';
    const d = status.deliveries || {};
    const deliveryLine = `ارسال‌شده: ${d.sent || 0} · در انتظار/تلاش مجدد: ${(d.pending || 0) + (d.retrying || 0)} · ناموفق: ${d.failed || 0} · لغوشده: ${d.cancelled || 0}`;

    content.innerHTML = `
      <div class="ai-settings-page tg-settings-page">
        <div class="page-head">
          <div>
            <p class="eyebrow">اعلان‌های خودکار ربات تلگرام YasnaFit</p>
            <h1>${esc(label)}</h1>
            <p>فعال‌سازی کامل ربات از همین صفحه — بدون ویرایش سرور. متغیرهای محیطی در صورت بودن اولویت دارند.</p>
          </div>
          <span class="ai-badge ${settings.configured ? 'ai-badge-ok' : 'ai-badge-warn'}" id="tgStateBadge">
            ${settings.configured ? `✅ فعال (@${esc(settings.bot_username || '?')})` : '⚪ غیرفعال'}
          </span>
        </div>

        <div class="ai-settings-grid">
          <!-- پیکربندی -->
          <section class="ai-card">
            <header class="ai-card-head">
              <div>
                <h2>⚙️ پیکربندی ربات</h2>
                <p>توکن از @BotFather گرفته می‌شود. مقادیر مخفی فقط ماسک‌شده نمایش داده می‌شوند و روی سرور ذخیره می‌مانند.</p>
              </div>
            </header>
            <form id="tgSettingsForm">
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="tgToken">توکن ربات (Bot Token)</label>
                  ${settings.token_masked ? `<span class="ai-badge ai-badge-ok">ذخیره شده (${esc(settings.token_masked)})</span>` : '<span class="ai-badge ai-badge-warn">تعیین نشده</span>'}
                </div>
                <input type="password" id="tgToken" autocomplete="off" dir="ltr" placeholder="${settings.token_masked ? 'برای تغییر، توکن جدید را وارد کنید…' : '123456:ABC-DEF...'}" value="">
                <small class="ai-help-text">در تلگرام به @BotFather پیام دهید ← ‎/newbot‎ ← توکن را اینجا بگذارید. خالی بگذارید تا فعلی حفظ شود.</small>
              </div>
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="tgUsername">یوزرنیم ربات (بدون @)</label>
                </div>
                <input type="text" id="tgUsername" dir="ltr" placeholder="yasna_bot" value="${esc(settings.bot_username || '')}">
                <small class="ai-help-text">برای ساخت دکمهٔ «اتصال» در پورتال شاگرد استفاده می‌شود.</small>
              </div>
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="tgSecret">رمز وب‌هوک (Secret Token)</label>
                  <button type="button" class="btn btn-secondary btn-small" id="tgGenSecret" style="font-size:10px;padding:2px 8px;">🎲 تولید رمز قوی</button>
                </div>
                <input type="password" id="tgSecret" autocomplete="off" dir="ltr" placeholder="${settings.has_webhook_secret ? '••••ذخیره شده — برای تغییر جایگزین کنید' : 'رشتهٔ تصادفی امن'}" value="">
                <small class="ai-help-text">با این رمز، تلگرامْ آپدیت‌ها را امضا می‌کند و سرور فقط آپدیت‌های امضاشده را می‌پذیرد.</small>
              </div>
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="tgPublicUrl">آدرس عمومی سایت (برای دکمه‌های ربات)</label>
                </div>
                <input type="url" id="tgPublicUrl" dir="ltr" placeholder="https://yasnafit-production.up.railway.app" value="${esc(settings.public_url || '')}">
                <small class="ai-help-text">در Railway همان دامنه‌ای که اپ روی آن است. دکمهٔ «مشاهده برنامه» در پیام‌های ربات به همین آدرس می‌رود.</small>
              </div>
              <div class="ai-form-group">
                <label class="tg-check"><input type="checkbox" id="tgPolling" ${settings.polling ? 'checked' : ''}> دریافت پیام‌ها با Long-polling به‌جای وب‌هوک (فقط توسعهٔ محلی بدون HTTPS)</label>
              </div>
              <div class="tg-actions">
                <button type="submit" class="btn btn-primary" id="tgSave" style="min-height:40px;padding:8px 24px;font-weight:800;">💾 ذخیره تنظیمات</button>
                <span class="ai-save-feedback" id="tgSaveFeedback"></span>
              </div>
              <small class="ai-help-text">منبع پیکربندی فعلی: <b>${esc(sourceLabel)}</b></small>
            </form>
          </section>

          <!-- اتصال تلگرام مربی -->
          <section class="ai-card" id="tgCoachConnectCard">
            <header class="ai-card-head">
              <div>
                <h2>👤 اتصال تلگرام مربی</h2>
                <p>گیرندهٔ اعلان‌های مدیریتی (مثل «📋 ارزیابی جدید آماده بررسی»). پیام آزمایشی، تحویل واقعی را همان‌جا در تلگرام نشان می‌دهد.</p>
              </div>
              <span class="ai-badge ${connection.connected ? 'ai-badge-ok' : 'ai-badge-warn'}" id="tgCoachConnBadge">
                ${connection.connected ? `✅ متصل${connection.telegram_username ? ` (@${esc(connection.telegram_username)})` : ''}` : '⚪ متصل نیست'}
              </span>
            </header>
            <div id="tgCoachConnBody">
              ${connection.connected
                ? `<div class="tg-stats"><div><span>چت</span><b dir="ltr">${esc(connection.chat_id_masked || '—')}</b></div></div>
                   <div class="ai-form-group" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
                     <button type="button" class="btn btn-primary" id="tgCoachTestMsg" style="min-height:38px;">📨 ارسال پیام آزمایشی</button>
                     <button type="button" class="btn btn-secondary" id="tgCoachUnlink" style="min-height:38px;">قطع اتصال</button>
                   </div>
                   <div id="tgTestMsgResult" class="tg-result"></div>`
                : `<div class="ai-form-group"><button type="button" class="btn btn-primary" id="tgCoachLink" style="min-height:40px;" ${settings.configured ? '' : 'disabled title="اول ربات را ذخیره کنید"'}>🎯 گرفتن کد اتصال مربی</button></div>
                   <div id="tgCoachLinkBox"></div>`}
            </div>
          </section>

          <!-- وب‌هوک -->
          <section class="ai-card">
            <header class="ai-card-head">
              <div>
                <h2>📡 دریافت پیام‌ها (وب‌هوک)</h2>
                <p>روی Railway/سرور عمومی لازم است. برای توسعهٔ محلی همان گزینهٔ polling بالا کافی است.</p>
              </div>
            </header>
            <div class="ai-form-group">
              <div class="ai-label-row">
                <label class="ai-label" for="tgWebhookUrl">آدرس وب‌هوک</label>
              </div>
              <input type="url" id="tgWebhookUrl" dir="ltr" placeholder="https://…/api/telegram/webhook" value="${settings.public_url ? esc(settings.public_url + '/api/telegram/webhook') : ''}">
            </div>
            <div class="ai-form-group">
              <button type="button" class="btn btn-primary" id="tgRegisterWebhook" style="min-height:40px;">📤 ثبت وب‌هوک در تلگرام</button>
              <div id="tgWebhookResult" class="tg-result"></div>
            </div>
          </section>
        </div>

        <section class="ai-card tg-guide">
          <header class="ai-card-head"><div><h2>📘 راهنمای سریع</h2></div></header>
          <ol class="tg-steps">
            <li>از <b dir="ltr">@BotFather</b> توکن بگیرید، بالا وارد کنید و «ذخیره» بزنید — ربات فوراً فعال می‌شود.</li>
            <li>روی Railway «آدرس عمومی» را ذخیره و «ثبت وب‌هوک» را بزنید (محلی: گزینهٔ polling).</li>
            <li>تلگرام خودتان را از کارت «اتصال تلگرام مربی» وصل کنید و با «پیام آزمایشی» سلام‌وبالیک بگیرید.</li>
          </ol>
        </section>
      </div>`;

    // ── ذخیره ──
    const feedback = content.querySelector('#tgSaveFeedback');
    content.querySelector('#tgSettingsForm').onsubmit = async event => {
      event.preventDefault();
      const button = content.querySelector('#tgSave');
      button.disabled = true; button.textContent = '⏳ در حال ذخیره…';
      feedback.className = 'ai-save-feedback'; feedback.textContent = '';
      try {
        const view = await api('/api/coach/telegram/settings', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            bot_token: content.querySelector('#tgToken').value.trim() || undefined,
            bot_username: content.querySelector('#tgUsername').value.trim(),
            webhook_secret: content.querySelector('#tgSecret').value.trim() || undefined,
            public_url: content.querySelector('#tgPublicUrl').value.trim(),
            polling: content.querySelector('#tgPolling').checked,
          }),
        });
        feedback.className = 'ai-save-feedback success';
        feedback.textContent = view.configured ? '✅ ذخیره شد — ربات فعال است' : '⚠ ذخیره شد اما توکن هنوز تنظیم نشده';
        content.querySelector('#tgWebhookUrl').value = view.public_url ? view.public_url + '/api/telegram/webhook' : content.querySelector('#tgWebhookUrl').value;
        content.querySelector('#tgToken').value = ''; content.querySelector('#tgSecret').value = '';
        content.querySelector('#tgStateBadge').className = 'ai-badge ' + (view.configured ? 'ai-badge-ok' : 'ai-badge-warn');
        content.querySelector('#tgStateBadge').textContent = view.configured ? `✅ فعال (@${view.bot_username || '?'})` : '⚪ غیرفعال';
      } catch (error) {
        feedback.className = 'ai-save-feedback error';
        feedback.textContent = 'خطا: ' + error.message;
      } finally {
        button.disabled = false; button.textContent = '💾 ذخیره تنظیمات';
      }
    };

    content.querySelector('#tgGenSecret').onclick = () => { content.querySelector('#tgSecret').value = strongSecret(); };

    // ── پیام آزمایشی واقعی به تلگرام مربی ──
    const testMsg = content.querySelector('#tgCoachTestMsg');
    if (testMsg) testMsg.onclick = async () => {
      const box = content.querySelector('#tgTestMsgResult');
      testMsg.disabled = true; box.textContent = '⏳ در حال ارسال…'; box.className = 'tg-result';
      try {
        await api('/api/coach/telegram/test-message', { method: 'POST' });
        box.innerHTML = '✅ پیام آزمایشی ارسال شد — همین حالا تلگرام خود را ببینید.';
        box.classList.add('ok');
      } catch (error) {
        box.textContent = '❌ ' + error.message; box.classList.add('bad');
      } finally { testMsg.disabled = false; }
    };

    // ── ثبت وب‌هوک ──
    // ── اتصال تلگرام مربی ──
    const coachLink = content.querySelector('#tgCoachLink');
    if (coachLink) coachLink.onclick = async () => {
      const box = content.querySelector('#tgCoachLinkBox');
      coachLink.disabled = true;
      try {
        const link = await api('/api/coach/telegram/link', { method: 'POST' });
        box.innerHTML = `<p style="margin-top:8px;font-size:11px;color:var(--text-secondary)">۱. روی دکمه بزنید و در تلگرام «Start» کنید:<br><a class="btn btn-primary" style="display:inline-block;margin-top:6px;min-height:38px;line-height:38px;padding:0 14px;" href="${esc(link.deep_link)}" target="_blank" rel="noopener">رفتن به ربات @${esc(link.bot_username)}</a></p><p style="margin-top:8px;font-size:11px;color:var(--text-secondary)">۲. یا این کد را در ربات بفرستید (<small>اعتبار ${link.ttl_minutes} دقیقه — یک‌بارمصرف</small>):<br><code dir="ltr" style="display:inline-block;margin-top:6px;padding:8px 14px;border:1px dashed var(--border-strong);border-radius:8px;user-select:all">${esc(link.link_code)}</code></p><p style="font-size:10px;color:var(--text-muted);margin-top:6px">پس از /start در تلگرام، این صفحه را دوباره باز کنید.</p>`;
      } catch (error) {
        box.textContent = 'خطا: ' + error.message;
      } finally { coachLink.disabled = false; }
    };
    const coachUnlink = content.querySelector('#tgCoachUnlink');
    if (coachUnlink) coachUnlink.onclick = async () => {
      if (!window.confirm('اتصال تلگرام مربی قطع شود؟ اعلان‌های مدیریتی دیگر دریافت نمی‌شوند.')) return;
      try { await api('/api/coach/telegram/unlink', { method: 'POST' }); window.renderTelegramSettings(label, route); }
      catch (error) { window.alert(error.message); }
    };

    content.querySelector('#tgRegisterWebhook').onclick = async () => {
      const box = content.querySelector('#tgWebhookResult');
      const url = content.querySelector('#tgWebhookUrl').value.trim();
      if (!url) { box.textContent = 'آدرس وب‌هوک را وارد کنید.'; box.className = 'tg-result bad'; return; }
      box.textContent = '⏳ در حال ثبت…'; box.className = 'tg-result';
      try {
        await api('/api/coach/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
        box.textContent = '✅ وب‌هوک در تلگرام ثبت شد؛ از این پس پیام‌ها به سرور می‌آیند.';
        box.classList.add('ok');
      } catch (error) {
        box.textContent = '❌ ثبت نشد: ' + error.message; box.classList.add('bad');
      }
    };
  };
})();
