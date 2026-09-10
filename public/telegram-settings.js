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
    try { settings = await api('/api/coach/telegram/settings'); } catch (e) {}
    try { status = await api('/api/coach/telegram'); } catch (e) {}

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

          <!-- اتصال و وب‌هوک -->
          <section class="ai-card">
            <header class="ai-card-head">
              <div>
                <h2>🔌 اتصال و وب‌هوک</h2>
                <p>پس از ذخیره، اتصال را بیازمایید و وب‌هوک را روی دامنهٔ عمومی ثبت کنید.</p>
              </div>
            </header>
            <div class="ai-form-group">
              <button type="button" class="btn btn-secondary" id="tgTest" style="min-height:40px;">🔍 آزمون اتصال به تلگرام</button>
              <div id="tgTestResult" class="tg-result"></div>
            </div>
            <div class="ai-form-group">
              <div class="ai-label-row">
                <label class="ai-label" for="tgWebhookUrl">آدرس وب‌هوک</label>
              </div>
              <input type="url" id="tgWebhookUrl" dir="ltr" placeholder="https://…/api/telegram/webhook" value="${settings.public_url ? esc(settings.public_url + '/api/telegram/webhook') : ''}">
              <small class="ai-help-text">تلگرام فقط HTTPS می‌پذیرد؛ برای توسعهٔ محلی از تونل (مثلاً cloudflared) یا گزینهٔ polling بالا استفاده کنید.</small>
            </div>
            <div class="ai-form-group">
              <button type="button" class="btn btn-primary" id="tgRegisterWebhook" style="min-height:40px;">📤 ثبت وب‌هوک در تلگرام</button>
              <div id="tgWebhookResult" class="tg-result"></div>
            </div>
            <div class="tg-stats">
              <div><span>شاگردان متصل</span><b>${Number(status.connected_accounts || 0)}</b></div>
              <div><span>${esc(deliveryLine)}</span></div>
            </div>
          </section>
        </div>

        <section class="ai-card tg-guide">
          <header class="ai-card-head"><div><h2>📘 راهنمای سریع</h2></div></header>
          <ol class="tg-steps">
            <li>در تلگرام به <b dir="ltr">@BotFather</b> پیام دهید و با ‎/newbot‎ یک ربات بسازید؛ توکن را کپی کنید.</li>
            <li>توکن و یوزرنیم ربات را بالا وارد و «ذخیره تنظیمات» را بزنید — ربات فوراً فعال می‌شود (بدون ری‌استارت).</li>
            <li>«آزمون اتصال» را بزنید؛ باید نام ربات را برگرداند.</li>
            <li>روی Railway: «آدرس عمومی سایت» را بدهید، ذخیره کنید، سپس «ثبت وب‌هوک در تلگرام» را بزنید.</li>
            <li>حالا شاگردان از «پروفایل من ← اتصال تلگرام» حسابشان را متصل می‌کنند و اعلان‌ها می‌رسد.</li>
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

    // ── آزمون اتصال ──
    content.querySelector('#tgTest').onclick = async () => {
      const box = content.querySelector('#tgTestResult');
      box.textContent = '⏳ در حال آزمون…'; box.className = 'tg-result';
      try {
        const result = await api('/api/coach/telegram/test', { method: 'POST' });
        box.innerHTML = `✅ اتصال برقرار است — ربات: <b dir="ltr">@${esc(result.bot.username)}</b> (${esc(result.bot.first_name || '')})`;
        box.classList.add('ok');
      } catch (error) {
        box.textContent = '❌ اتصال برقرار نشد: ' + error.message; box.classList.add('bad');
      }
    };

    // ── ثبت وب‌هوک ──
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
