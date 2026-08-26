/**
 * Yasnafit — AI Settings & Live Test Chat Interface
 */
(() => {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let chatHistory = [];
  let isSending = false;

  function renderChatMessages(host) {
    if (!host) return;
    if (chatHistory.length === 0) {
      host.innerHTML = `
        <div class="ai-chat-empty">
          <span>🤖</span>
          <b>گفتگوی آزمایشی با هوش مصنوعی آماده است</b>
          <p>یک پیام بنویسید یا روی یکی از دستورات نمونه زیر بزنید تا اتصال کامبو و ابزارهای سامانه تست شوند.</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px;">
            <button type="button" class="btn btn-secondary btn-small" data-quick-prompt="سلام! وضعیت اتصال هوش مصنوعی را بررسی کن.">تست اتصال 👋</button>
            <button type="button" class="btn btn-secondary btn-small" data-quick-prompt="لیست شاگردهای من را بررسی و خلاصه کن.">لیست شاگردها 👥</button>
            <button type="button" class="btn btn-secondary btn-small" data-quick-prompt="حرکات مربوط به سینه را در بانک حرکات جستجو کن.">بانک حرکات سینه 🏋️</button>
          </div>
        </div>
      `;
      host.querySelectorAll('[data-quick-prompt]').forEach(btn => {
        btn.onclick = () => {
          const input = document.getElementById('aiChatInput');
          if (input) {
            input.value = btn.dataset.quickPrompt;
            document.getElementById('aiChatForm')?.requestSubmit();
          }
        };
      });
      return;
    }

    host.innerHTML = chatHistory.map(m => {
      const isUser = m.role === 'user';
      const timeStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
      let toolsHTML = '';
      if (m.tools && Array.isArray(m.tools) && m.tools.length > 0) {
        toolsHTML = `<div class="ai-msg-tools">🔧 <b>ابزارهای اجرا شده:</b> ${m.tools.map(t => esc(t.tool)).join('، ')}</div>`;
      }

      return `
        <div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-assistant'}">
          <div class="ai-msg-bubble">${esc(m.content)}</div>
          ${toolsHTML}
          <span class="ai-msg-time">${timeStr}</span>
        </div>
      `;
    }).join('');

    host.scrollTop = host.scrollHeight;
  }

  async function handleSendMessage(dbSettings) {
    if (isSending) return;
    const input = document.getElementById('aiChatInput');
    const msgList = document.getElementById('aiChatMessages');
    const sendBtn = document.getElementById('aiChatSend');
    if (!input || !msgList) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    isSending = true;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'در حال پردازش…';
    }

    chatHistory.push({ role: 'user', content: text });
    renderChatMessages(msgList);

    try {
      // Build API messages payload
      const apiMessages = chatHistory.map(m => ({ role: m.role, content: m.content }));
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'خطا در برقراری ارتباط با هوش مصنوعی');
      }

      chatHistory.push({
        role: 'assistant',
        content: data.content || (data.message && data.message.content) || 'پاسخ دریافت شد.',
        tools: data.tool_calls_executed || []
      });
      renderChatMessages(msgList);
    } catch (error) {
      chatHistory.push({
        role: 'assistant',
        content: `❌ خطا: ${error.message}`
      });
      renderChatMessages(msgList);
    } finally {
      isSending = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'ارسال';
      }
      input.focus();
    }
  }

  window.renderAISettings = async (label = 'تنظیمات هوش مصنوعی', route = '/settings/ai') => {
    window.current = route;
    const crumb = document.querySelector('#breadcrumb');
    if (crumb) crumb.textContent = label;
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    const content = document.querySelector('#content');
    if (!content) return;

    content.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>در حال دریافت تنظیمات هوش مصنوعی…</p></div>';

    let settings = {
      has_api_key: false,
      api_key_masked: '',
      base_url: 'https://9router-production-6a92.up.railway.app/v1',
      default_combo: '',
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 2000,
      timeout_ms: 30000
    };

    try {
      const res = await fetch('/api/ai/settings');
      if (res.ok) {
        settings = await res.json();
      }
    } catch (e) {}

    content.innerHTML = `
      <div class="ai-settings-page">
        <div class="page-head">
          <div>
            <p class="eyebrow">موتور مرکزی هوش مصنوعی Yasnafit</p>
            <h1>${esc(label)}</h1>
            <p>تنظیمات اتصال به ارائه‌دهنده 9Router و ابزارهای هوشمند کنترل سامانه</p>
          </div>
        </div>

        <div class="ai-settings-grid">
          <!-- Right / Configuration Panel -->
          <section class="ai-card">
            <header class="ai-card-head">
              <div>
                <h2>⚙️ پیکربندی هوش مصنوعی</h2>
                <p>تنظیمات اتصال به ارائه‌دهنده AI. این تنظیمات در تمام برنامه استفاده می‌شود.</p>
              </div>
            </header>

            <form id="aiSettingsForm">
              <!-- API Key -->
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="aiApiKey">کلید دسترسی (API Key)</label>
                  <span class="ai-badge ${settings.has_api_key ? 'ai-badge-ok' : 'ai-badge-warn'}" id="aiKeyBadge">
                    ${settings.has_api_key ? `ذخیره شده (${settings.api_key_masked})` : 'تعیین نشده'}
                  </span>
                </div>
                <input type="password" id="aiApiKey" name="api_key" autocomplete="off" placeholder="${settings.has_api_key ? 'برای تغییر، کلید جدید را وارد کنید…' : 'sk-...'}" value="">
                <small class="ai-help-text">کلید به صورت امن در سرور ذخیره می‌شود و هرگز به فرانت‌اند ارسال نمی‌شود.</small>
              </div>

              <!-- Base URL -->
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="aiBaseUrl">آدرس پایه (Base URL)</label>
                </div>
                <input type="text" id="aiBaseUrl" name="base_url" dir="ltr" required value="${esc(settings.base_url || 'https://9router-production-6a92.up.railway.app/v1')}">
                <small class="ai-help-text">برای 9Router از http://localhost:20128/v1 استفاده کنید. برای OpenRouter از https://openrouter.ai/api/v1</small>
              </div>

              <!-- Default Combo -->
              <div class="ai-form-group">
                <div class="ai-label-row">
                  <label class="ai-label" for="aiDefaultCombo">مدل / کامبو پیش‌فرض (Default Combo)</label>
                </div>
                <input type="text" id="aiDefaultCombo" name="default_combo" dir="ltr" placeholder="نام کامبوی 9Router را وارد کنید (مثلاً mimo-v2.5-free یا yasna-coach)" value="${esc(settings.default_combo || '')}">
                <small class="ai-help-text">نام کامبوی ساخته شده در 9Router را وارد کنید. این نام به عنوان شناسه مدل ارسال می‌شود.</small>
              </div>

              <!-- Advanced Parameters -->
              <div class="ai-params-grid">
                <div class="ai-form-group" style="margin:0;">
                  <label class="ai-label" for="aiTemp">Temperature</label>
                  <input type="number" id="aiTemp" name="temperature" step="0.1" min="0" max="2" value="${settings.temperature ?? 0.7}">
                </div>
                <div class="ai-form-group" style="margin:0;">
                  <label class="ai-label" for="aiTopP">Top P</label>
                  <input type="number" id="aiTopP" name="top_p" step="0.05" min="0" max="1" value="${settings.top_p ?? 1.0}">
                </div>
                <div class="ai-form-group" style="margin:0;">
                  <label class="ai-label" for="aiMaxTokens">Max Tokens</label>
                  <input type="number" id="aiMaxTokens" name="max_tokens" min="100" max="16000" step="100" value="${settings.max_tokens ?? 2000}">
                </div>
                <div class="ai-form-group" style="margin:0;">
                  <label class="ai-label" for="aiTimeout">Timeout (ms)</label>
                  <input type="number" id="aiTimeout" name="timeout_ms" min="5000" max="120000" step="5000" value="${settings.timeout_ms ?? 30000}">
                </div>
              </div>

              <div class="ai-form-actions">
                <button type="submit" class="btn btn-primary" id="btnSaveAiSettings" style="min-height:40px;padding:8px 24px;font-weight:800;">
                  💾 ذخیره تنظیمات
                </button>
                <span class="ai-save-feedback" id="aiSaveFeedback"></span>
              </div>
            </form>

            <details class="ai-tools-drawer-summary" style="margin-top:16px;">
              <summary style="cursor:pointer;font-weight:750;font-size:11px;color:var(--text-secondary);">
                🛠️ مشاهده ابزارهای فعال هوش مصنوعی (Function Calling)
              </summary>
              <ul class="ai-tools-list">
                <li><b>get_student & list_students:</b> مشاهده و جستجوی پرونده شاگردان</li>
                <li><b>get_latest_assessment:</b> بررسی آخرین وضعیت بدنی و ارزیابی</li>
                <li><b>search_exercises & get_exercise:</b> جستجو در بانک ۲۷۰۷ حرکتی</li>
                <li><b>create_draft_program:</b> ساخت هوشمند برنامه تمرینی پیش‌نویس</li>
                <li><b>update_draft_program & activate_program:</b> ویرایش و فعال‌سازی برنامه</li>
                <li><b>get_workout_results:</b> تحلیل عملکرد و ست‌های ثبت‌شده شاگرد</li>
              </ul>
            </details>
          </section>

          <!-- Left / Live Test Chat Panel -->
          <section class="ai-card ai-chat-card">
            <header class="ai-card-head">
              <div>
                <h2>💬 گفتگوی آزمایشی زنده</h2>
                <div class="ai-chat-status">
                  <span>کامبوی فعال:</span>
                  <span class="ai-combo-pill" id="aiCurrentComboPill">${esc(settings.default_combo || 'تعیین نشده')}</span>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-small" id="btnClearChat" title="پاک کردن گفتگو">
                🗑
              </button>
            </header>

            <div class="ai-chat-messages" id="aiChatMessages"></div>

            <form class="ai-chat-form" id="aiChatForm">
              <input type="text" class="ai-chat-input" id="aiChatInput" placeholder="پیام خود را بنویسید (مثلاً: وضعیت شاگردان را بررسی کن)…" autocomplete="off">
              <button type="submit" class="btn btn-primary ai-chat-send" id="aiChatSend">ارسال</button>
            </form>
          </section>
        </div>
      </div>
    `;

    const chatHost = document.getElementById('aiChatMessages');
    renderChatMessages(chatHost);

    // Bind Chat Form
    document.getElementById('aiChatForm').onsubmit = e => {
      e.preventDefault();
      handleSendMessage(settings);
    };

    document.getElementById('btnClearChat').onclick = () => {
      chatHistory = [];
      renderChatMessages(chatHost);
    };

    // Bind Settings Form
    document.getElementById('aiSettingsForm').onsubmit = async e => {
      e.preventDefault();
      const feedback = document.getElementById('aiSaveFeedback');
      const saveBtn = document.getElementById('btnSaveAiSettings');
      const fd = new FormData(e.currentTarget);
      const payload = Object.fromEntries(fd);

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'در حال ذخیره…';
      }
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'ai-save-feedback';
      }

      try {
        const response = await fetch('/api/ai/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'خطا در ذخیره تنظیمات');
        }

        settings = data;
        if (feedback) {
          feedback.textContent = '✅ تنظیمات با موفقیت ذخیره شد.';
          feedback.classList.add('success');
        }

        // Update badge & combo pill
        const badge = document.getElementById('aiKeyBadge');
        if (badge) {
          badge.className = `ai-badge ${data.has_api_key ? 'ai-badge-ok' : 'ai-badge-warn'}`;
          badge.textContent = data.has_api_key ? `ذخیره شده (${data.api_key_masked})` : 'تعیین نشده';
        }
        const comboPill = document.getElementById('aiCurrentComboPill');
        if (comboPill) {
          comboPill.textContent = data.default_combo || 'تعیین نشده';
        }
      } catch (err) {
        if (feedback) {
          feedback.textContent = `❌ ${err.message}`;
          feedback.classList.add('error');
        }
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 ذخیره تنظیمات';
        }
      }
    };
  };
})();
