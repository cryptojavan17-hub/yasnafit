/**
 * Yasnafit — Dedicated AI Copilot & Assessment Analysis Workspace
 * Interactive Program Generation, Live Chat Customization & Diagnostic Modals
 */
(() => {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const muscleNames = {
    front_deltoid_anterior: 'سرشانه جلو',
    front_deltoid_lateral: 'سرشانه میانی',
    front_chest: 'سینه',
    front_biceps: 'جلو بازو',
    front_brachialis: 'براکیالیس',
    front_brachioradialis: 'ساعد',
    front_rectus_abdominis: 'راست شکمی',
    front_obliques: 'مورب شکمی (پهلو)',
    front_serratus_anterior: 'دندانه‌ای',
    front_quadriceps: 'چهارسر ران',
    front_iliopsoas: 'عضلات ران',
    back_trapezius: 'کول (ذوزنقه‌ای)',
    back_latissimus_dorsi: 'زیربغل',
    back_triceps: 'پشت بازو',
    back_teres_major: 'گرد بزرگ',
    back_teres_minor: 'گرد کوچک',
    back_infraspinatus: 'تحت‌خاری',
    back_gluteus_maximus: 'باسن (سرینی)',
    back_hamstrings: 'همسترینگ',
    back_gastrocnemius: 'ساق پا',
    back_soleus: 'نعلی ساق'
  };

  const systems = {
    1: { label: 'معمولی', icon: '📌' },
    2: { label: 'سوپر ست (Superset)', icon: '⚡' },
    3: { label: 'تری ست (Triset)', icon: '🔺' },
    4: { label: 'جاینت ست (Giant Set)', icon: '🔥' },
    5: { label: 'دراپ ست (Drop Set)', icon: '💧' },
    6: { label: 'هرمی (Pyramid)', icon: '🏛️' },
    7: { label: 'هرمی معکوس (Reverse Pyramid)', icon: '🔻' },
    8: { label: 'استراحت-توقف (Rest-Pause)', icon: '⏸️' },
    9: { label: 'سیستم ۲۱ (Twenty-One)', icon: '🔢' },
    10: { label: 'تکرار نیمه (Partial Reps)', icon: '✂️' },
    11: { label: 'نردبانی ۲۰-۱۰-۵ (Ladder)', icon: '🪜' },
    12: { label: 'ماموت ست (Mammoth Set)', icon: '🦣' }
  };

  const units = {
    REPEAT: 'تکرار',
    TIME: 'ثانیه',
    SECONDS: 'ثانیه',
    MINUTE: 'دقیقه',
    DROPSET: 'دراپ',
    FAILURE: 'توان'
  };

  function resolveMusclesLabel(muscles) {
    if (!muscles || !Array.isArray(muscles) || muscles.length === 0) return '';
    return muscles.map(m => muscleNames[m] || m).filter(Boolean).join('، ');
  }

  // ==============================================================
  // 1. Assessment AI Analysis & Feedback Large Modal (Request 1)
  // ==============================================================
  async function openAIAssessmentModal(params = {}) {
    const { student, assessment, assessmentDetails = {}, assessmentId } = params;
    const studentName = student?.full_name || 'ورزشکار';
    const caseNumber = student?.case_number || '—';
    const assNum = assessment?.assessment_number || 1;
    const goal = student?.goal || assessmentDetails?.goals?.main_goal || 'فیتنس و سلامتی';
    const weight = assessment?.weight || '—';
    const height = assessment?.height || '—';
    const bodyFat = assessment?.body_fat || '—';
    const injuries = student?.injuries || assessmentDetails?.medical?.orthopedic_issues || 'بدون آسیب ثبت‌شده';
    const limitations = student?.limitations || 'ندارد';
    const noteEl = document.getElementById('coachNote');

    let modal = document.getElementById('aiAssessmentModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aiAssessmentModal';
      modal.className = 'ai-modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="ai-modal-dialog" role="dialog" aria-modal="true">
        <header class="ai-modal-header">
          <h3>🤖 تحلیل هوشمند ارزیابی بدنی و نگارش بازخورد مربی</h3>
          <button type="button" class="btn-icon" id="closeAiAssModalX" title="بستن">×</button>
        </header>

        <div class="ai-modal-body">
          <div class="ai-diag-grid">
            <div class="ai-diag-card">
              <b>👤 مشخصات شاگرد</b>
              <span>${esc(studentName)} • پرونده ${esc(caseNumber)}</span>
              <span>ارزیابی شماره #${assNum}</span>
            </div>
            <div class="ai-diag-card">
              <b>📊 وضعیت بدنی</b>
              <span>وزن: ${weight} kg • قد: ${height} cm</span>
              <span>درصد چربی: ${bodyFat !== '—' ? `${bodyFat}%` : 'ثبت‌نشده'}</span>
            </div>
            <div class="ai-diag-card">
              <b>🎯 هدف و سطح</b>
              <span>هدف: ${esc(goal)}</span>
              <span>سطح: ${esc(student?.training_level || student?.training_experience || 'متوسط')}</span>
            </div>
            <div class="ai-diag-card">
              <b>⚠️ ملاحظات پزشکی</b>
              <span>آسیب‌ها: ${esc(injuries)}</span>
              <span>محدودیت‌ها: ${esc(limitations)}</span>
            </div>
          </div>

          <div class="ai-modal-textarea-wrap">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <label for="aiAssFeedbackText">📝 متن پیشنهادی بازخورد مربی برای شاگرد (قابل ویرایش):</label>
              <span id="aiAssLoadingIndicator" style="font-size:10px;color:var(--accent-hover);font-weight:750;">در حال تحلیل با هوش مصنوعی…</span>
            </div>
            <textarea id="aiAssFeedbackText" class="ai-modal-textarea" placeholder="در حال پردازش و نگارش پیام بازخورد توسط هوش مصنوعی…"></textarea>
          </div>
        </div>

        <footer class="ai-modal-footer">
          <button type="button" class="secondary" id="closeAiAssModalBtn">انصراف و بستن</button>
          <div style="display:flex;gap:8px;">
            <button type="button" class="btn btn-secondary" id="btnCopyAiAssFeedback">📋 کپی متن</button>
            <button type="button" class="btn btn-primary" id="btnApplyAiAssFeedback" style="font-weight:800;">✓ اعمال در یادداشت مربی و بستن</button>
          </div>
        </footer>
      </div>
    `;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = '';
    };

    document.getElementById('closeAiAssModalX').onclick = close;
    document.getElementById('closeAiAssModalBtn').onclick = close;

    const textarea = document.getElementById('aiAssFeedbackText');
    const indicator = document.getElementById('aiAssLoadingIndicator');
    const applyBtn = document.getElementById('btnApplyAiAssFeedback');
    const copyBtn = document.getElementById('btnCopyAiAssFeedback');

    // Fetch AI Analysis from server
    try {
      const prompt = `ارزیابی بدنی شماره ${assNum} شاگرد ${studentName} را تحلیل کن:
- وزن: ${weight} kg | قد: ${height} cm | چربی: ${bodyFat}%
- هدف: ${goal}
- آسیب‌ها: ${injuries}
- محدودیت‌ها: ${limitations}

یک یادداشت بازخورد مربی بنویس که:
۱. وضعیت فعلی و پیشرفت شاگرد را ارزیابی کند.
۲. نکات ایمنی مرتبط با آسیب‌ها و تمرکز اصلی تمرینات را شرح دهد.
۳. توصیه‌های کلیدی رژیم و آب‌رسانی را متذکر شود.
لحن پیام صمیمی، حرفه‌ای، انگیزشی و متناسب با فرهنگ مربیگری بدنسازی باشد.`;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'شما مربی و مشاور ارشد تناسب اندام در سامانه یسنافیت هستید. پاسخ‌های دقیق، علمی، انگیزشی و کاربردی به زبان فارسی بنویسید.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      const data = await res.json();
      const content = data.content || (data.message && data.message.content) || '';
      textarea.value = content;
      indicator.textContent = '✅ تحلیل کامل شد.';
    } catch (err) {
      textarea.value = `سلام ${studentName} عزیز، ارزیابی بدنی شما با دقت بررسی شد. با توجه به هدف شما (${goal}) و سوابق بدنی، برنامه تمرینی جدید با تمرکز بر دامنه کامل حرکتی، کنترل فاز منفی و رعایت سلامت مفاصل طراحی شد. مصرف منظم آب (حداقل ۳ لیتر در روز) و خواب باکیفیت را در اولویت قرار دهید.`;
      indicator.textContent = '⚠️ پیشنهاد بر اساس الگوی استاندارد';
    }

    applyBtn.onclick = () => {
      if (noteEl && textarea.value) {
        noteEl.value = textarea.value;
      }
      close();
    };

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        copyBtn.textContent = 'کپی شد ✓';
        setTimeout(() => { copyBtn.textContent = '📋 کپی متن'; }, 2000);
      } catch(e) {}
    };
  }

  // ==============================================================
  // 2. Dedicated AI Copilot Workspace & Live Interactive Chat (Request 2)
  // ==============================================================
  let activeCopilotState = {
    programId: null,
    studentId: null,
    assessmentId: null,
    program: null,
    rationaleReport: null,
    chatHistory: [],
    isSending: false
  };

  function renderCopilotPreview(host) {
    if (!host) return;
    const prog = activeCopilotState.program;
    if (!prog) {
      host.innerHTML = '<div class="ai-chat-empty">در حال آماده‌سازی پیش‌نمایش برنامه…</div>';
      return;
    }

    const progData = prog.programData || prog.program_data || {};
    const days = progData.days || [];
    const rationale = activeCopilotState.rationaleReport;

    let rationaleHTML = '';
    if (rationale) {
      rationaleHTML = `
        <article class="ai-copilot-card">
          <header class="ai-copilot-card-head">
            <h3>📋 گزارش توجیه علمی و مبنای طراحی برنامه (Program Rationale)</h3>
          </header>
          <div class="ai-copilot-card-body">
            <div class="ai-rationale-section">
              <h4>📂 منابع داده‌های ارزیابی استفاده‌شده:</h4>
              <ul class="ai-rationale-list">
                ${(rationale.dataSources || []).map(d => `<li>${esc(d)}</li>`).join('')}
              </ul>
            </div>

            <div class="ai-rationale-section">
              <h4>🧠 منطق تصمیم‌گیری و ساختار فیزیولوژیک:</h4>
              <ul class="ai-rationale-list">
                ${(rationale.decisionLogic || []).map(d => `<li>${esc(d)}</li>`).join('')}
              </ul>
            </div>

            ${rationale.overallRationale ? `
              <div class="ai-rationale-section" style="margin-bottom:0;">
                <h4>💡 جمع‌بندی و توجیه علمی مربی:</h4>
                <p style="margin:0;font-size:10px;color:var(--text-secondary);line-height:1.7;">${esc(rationale.overallRationale)}</p>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }

    let daysHTML = days.map((day, dIdx) => {
      const dayNum = day.day_number || (dIdx + 1);
      const dayFocus = day.focus ? esc(day.focus) : `جلسه ${dayNum.toLocaleString('fa-IR')}`;
      const daySystems = day.data || day.systems || [];

      const systemsHTML = daySystems.map(sys => {
        const sysId = Number(sys.exercise_system_id || sys.exerciseSystemId || 1);
        const sysMeta = systems[sysId] || systems[1];
        const movs = sys.movement_list || sys.movements || [];

        if (movs.length > 1 && sysId !== 1) {
          return `
            <div class="ai-preview-combo-block">
              <span class="ai-preview-combo-title">${sysMeta.icon} سیستم: ${esc(sysMeta.label)}</span>
              ${movs.map((mov, mIdx) => `
                <div class="ai-preview-mov-row">
                  <div class="ai-preview-mov-img">
                    <img src="${esc((mov.image_path&&mov.image_path.trim())?mov.image_path:(mov.original_exercise_id?`/api/exercise-image/${mov.original_exercise_id}`:'/assets/images/blank-white.svg'))}" alt="" onerror="this.src='/assets/images/blank-white.svg'">
                  </div>
                  <div class="ai-preview-mov-info">
                    <span class="ai-preview-mov-name">${esc(mov.nameFa || mov.name)}</span>
                    <span class="ai-preview-mov-meta">${resolveMusclesLabel(mov.target_muscles) ? `عضلات: ${resolveMusclesLabel(mov.target_muscles)}` : ''}</span>
                  </div>
                  <div class="ai-preview-sets-pills">
                    ${(mov.sets || []).map(s => `<span class="ai-preview-set-pill">${s.count || '—'} ${units[s.type] || 'تکرار'}</span>`).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }

        return movs.map(mov => `
          <div class="ai-preview-mov-row">
            <div class="ai-preview-mov-img">
              <img src="${esc((mov.image_path&&mov.image_path.trim())?mov.image_path:(mov.original_exercise_id?`/api/exercise-image/${mov.original_exercise_id}`:'/assets/images/blank-white.svg'))}" alt="" onerror="this.src='/assets/images/blank-white.svg'">
            </div>
            <div class="ai-preview-mov-info">
              <span class="ai-preview-mov-name">${esc(mov.nameFa || mov.name)}</span>
              <span class="ai-preview-mov-meta">${resolveMusclesLabel(mov.target_muscles) ? `عضلات: ${resolveMusclesLabel(mov.target_muscles)} • ` : ''}${sysMeta.label}</span>
            </div>
            <div class="ai-preview-sets-pills">
              ${(mov.sets || []).map(s => `<span class="ai-preview-set-pill">${s.count || '—'} ${units[s.type] || 'تکرار'}</span>`).join('')}
            </div>
          </div>
        `).join('');
      }).join('');

      return `
        <div class="ai-preview-day">
          <header class="ai-preview-day-head">
            <span>روز ${dayNum.toLocaleString('fa-IR')} — ${dayFocus}</span>
            <small style="font-size:9px;color:var(--text-muted)">${daySystems.length.toLocaleString('fa-IR')} سیستم تمرینی</small>
          </header>
          <div class="ai-preview-day-body">
            ${systemsHTML || '<div style="font-size:9px;color:var(--text-muted);padding:8px">حرکتی در این روز نیست.</div>'}
          </div>
        </div>
      `;
    }).join('');

    host.innerHTML = `
      ${rationaleHTML}
      <article class="ai-copilot-card">
        <header class="ai-copilot-card-head">
          <h3>🏋️ ساختار جلسات و حرکات تمرینی (Live Workout Split)</h3>
          <span style="font-size:10px;color:var(--accent-hover);font-weight:750;">وضعیت: پیش‌نویس (DRAFT)</span>
        </header>
        <div class="ai-copilot-card-body">
          ${daysHTML || '<div class="ai-chat-empty">روزی تعریف نشده است.</div>'}
        </div>
      </article>
    `;
  }

  function renderCopilotChat(host) {
    if (!host) return;
    if (activeCopilotState.chatHistory.length === 0) {
      host.innerHTML = `
        <div class="ai-chat-empty">
          <span>🤖</span>
          <b>دستیار تعاملی هوش مصنوعی آماده است</b>
          <p>اگر تغییری در حرکات، روزها، سوپرست‌ها یا ست‌ها مدنظرتان است، همین‌جا به دستیار بگویید تا برنامه را در لحظه اصلاح کند.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = activeCopilotState.chatHistory.map(m => {
      const isUser = m.role === 'user';
      let toolsHTML = '';
      if (m.tools && Array.isArray(m.tools) && m.tools.length > 0) {
        toolsHTML = `<div class="ai-msg-tools">🔧 <b>تغییرات اعمال‌شده در برنامه:</b> ${m.tools.map(t => esc(t.tool)).join('، ')}</div>`;
      }

      return `
        <div class="ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-assistant'}">
          <div class="ai-msg-bubble">${esc(m.content)}</div>
          ${toolsHTML}
        </div>
      `;
    }).join('');

    host.scrollTop = host.scrollHeight;
  }

  async function handleSendCopilotChat() {
    if (activeCopilotState.isSending) return;
    const input = document.getElementById('aiCopilotInput');
    const stream = document.getElementById('aiCopilotChatStream');
    const sendBtn = document.getElementById('aiCopilotSendBtn');
    if (!input || !stream) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    activeCopilotState.isSending = true;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'در حال اعمال…';
    }

    activeCopilotState.chatHistory.push({ role: 'user', content: text });
    renderCopilotChat(stream);

    try {
      const promptContext = `
دستور مربی درباره برنامه تمرینی جاری (شناسه برنامه: ${activeCopilotState.programId}):
«${text}»

وظیفه:
۱. درخواست مربی را با فراخوانی ابزارهای مربوطه (مانند update_draft_program، search_exercises، get_program) در دیتابیس اعمال کنید.
۲. فقط از حرکات واقعی بانک استفاده کنید.
۳. گزارش تغییرات و توجیه برنامه را در پاسخ خود اعلام فرمایید.
`;

      const apiMessages = [
        ...activeCopilotState.chatHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: promptContext }
      ];

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در گفتگو با هوش مصنوعی');

      activeCopilotState.chatHistory.push({
        role: 'assistant',
        content: data.content || (data.message && data.message.content) || 'تغییرات با موفقیت اعمال شد.',
        tools: data.tool_calls_executed || []
      });

      // Reload updated program from server to refresh live preview
      if (activeCopilotState.programId) {
        try {
          const updatedRes = await fetch(`/api/training-programs/${activeCopilotState.programId}/full`);
          if (updatedRes.ok) {
            const updatedProg = await updatedRes.json();
            activeCopilotState.program = {
              ...updatedProg,
              programData: updatedProg.program_data
            };
            const previewHost = document.getElementById('aiCopilotPreviewCol');
            renderCopilotPreview(previewHost);
          }
        } catch(e) {}
      }

      renderCopilotChat(stream);
    } catch (err) {
      activeCopilotState.chatHistory.push({
        role: 'assistant',
        content: `❌ خطا در اعمال تغییرات: ${err.message}`
      });
      renderCopilotChat(stream);
    } finally {
      activeCopilotState.isSending = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'ارسال و اصلاح';
      }
      input.focus();
    }
  }

  async function openAICopilot(params = {}) {
    let { studentId, assessmentId, programId } = params;

    let modal = document.getElementById('aiCopilotModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aiCopilotModal';
      modal.className = 'ai-copilot-modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="ai-copilot-topbar">
        <div class="ai-copilot-title-group">
          <div class="ai-copilot-icon">🤖</div>
          <div class="ai-copilot-headings">
            <h2>دستیار هوشمند طراحی و اصلاح تعاملی برنامه تمرینی (AI Copilot)</h2>
            <div class="ai-copilot-meta-badges">
              <span class="ai-copilot-badge active-combo" id="aiCopilotComboBadge">مدل در حال بارگذاری…</span>
              <span class="ai-copilot-badge" id="aiCopilotStudentBadge">در حال دریافت پرونده شاگرد…</span>
            </div>
          </div>
        </div>
        <div class="ai-copilot-top-actions">
          <button type="button" class="btn btn-secondary btn-small" id="btnCopilotPDF">📄 خروجی PDF</button>
          <button type="button" class="btn btn-primary btn-small" id="btnCopilotApplyToBuilder" style="font-weight:850;">✅ تایید و انتقال به برنامه‌ساز</button>
          <button type="button" class="btn btn-secondary btn-small" id="closeCopilotX">✕ بستن</button>
        </div>
      </div>

      <div class="ai-copilot-workspace">
        <!-- Right Column: Program Rationale & Live Preview -->
        <div class="ai-copilot-preview-col" id="aiCopilotPreviewCol">
          <div class="loading-state"><span class="spinner"></span><p>در حال فراخوانی هوش مصنوعی، تحلیل ارزیابی و ساخت ساختار برنامه…</p></div>
        </div>

        <!-- Left Column: Live Interactive Chat -->
        <div class="ai-copilot-chat-col">
          <header class="ai-copilot-chat-head">
            <h3>💬 گفتگوی تعاملی و اصلاح در لحظه برنامه</h3>
            <button type="button" class="btn btn-secondary btn-small" id="btnClearCopilotChat" title="پاک کردن چت">🗑</button>
          </header>

          <div class="ai-copilot-chat-stream" id="aiCopilotChatStream"></div>

          <div class="ai-copilot-quick-prompts">
            <button type="button" class="ai-quick-chip" data-quick-chat="حرکات بازو را به صورت سوپرست تنظیم کن.">⚡ سوپرست کردن بازو</button>
            <button type="button" class="ai-quick-chip" data-quick-chat="جای پرس پا، هاگ اسکوات قرار بده.">🔄 هاگ اسکوات</button>
            <button type="button" class="ai-quick-chip" data-quick-chat="تعداد ست‌های سینه را افزایش بده.">📈 افزایش حجم سینه</button>
            <button type="button" class="ai-quick-chip" data-quick-chat="تعداد روزهای تمرینی را به ۳ روز تغییر بده.">📅 تبدیل به ۳ روزه</button>
          </div>

          <form class="ai-copilot-input-bar" id="aiCopilotChatForm">
            <input type="text" class="ai-copilot-textarea" id="aiCopilotInput" placeholder="دستور اصلاح برنامه را بنویسید (مثلاً: در روز اول حرکت فلای سینه اضافه کن)…" autocomplete="off">
            <button type="submit" class="btn btn-primary ai-copilot-send-btn" id="aiCopilotSendBtn">ارسال و اصلاح</button>
          </form>
        </div>
      </div>
    `;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = '';
    };

    document.getElementById('closeCopilotX').onclick = close;

    // Generate or Load Program
    try {
      const genRes = await fetch('/api/ai/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId ? Number(studentId) : undefined,
          assessmentId: assessmentId ? Number(assessmentId) : undefined,
          programId: programId ? Number(programId) : undefined
        })
      });

      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || 'خطا در ساخت برنامه با هوش مصنوعی');

      const progId = genData.programId;
      activeCopilotState.programId = progId;
      activeCopilotState.studentId = genData.studentId || studentId;
      activeCopilotState.assessmentId = genData.assessmentId || assessmentId;
      activeCopilotState.rationaleReport = genData.rationaleReport || null;
      activeCopilotState.chatHistory = [
        {
          role: 'assistant',
          content: `✅ برنامه تمرینی هوشمند بر اساس ارزیابی بدنی ساخته شد.\n\nشما می‌توانید ساختار جلسات و گزارش توجیه علمی را در ستون سمت راست مشاهده کنید. اگر مایل به تغییر حرکت، افزودن سوپرست، یا تغییر تکرارها هستید، در همین چت مطرح فرمایید تا بلافاصله اعمال شود.`
        }
      ];

      // Fetch Full Program
      const fullProgRes = await fetch(`/api/training-programs/${progId}/full`);
      if (fullProgRes.ok) {
        const fullProg = await fullProgRes.json();
        activeCopilotState.program = {
          ...fullProg,
          programData: fullProg.program_data
        };

        const studentBadge = document.getElementById('aiCopilotStudentBadge');
        if (studentBadge) {
          studentBadge.textContent = `👤 ${fullProg.student_name || 'ورزشکار'} (پرونده ${fullProg.student_case_number || '—'}) • ${fullProg.title || 'برنامه پیش‌نویس'}`;
        }
      }

      // Update AI combo badge
      try {
        const aiSetRes = await fetch('/api/ai/settings');
        if (aiSetRes.ok) {
          const aiSet = await aiSetRes.json();
          const comboBadge = document.getElementById('aiCopilotComboBadge');
          if (comboBadge) {
            comboBadge.textContent = `⚡ کامبو: ${aiSet.default_combo || 'فعال'}`;
          }
        }
      } catch(e) {}

      const previewHost = document.getElementById('aiCopilotPreviewCol');
      renderCopilotPreview(previewHost);

      const streamHost = document.getElementById('aiCopilotChatStream');
      renderCopilotChat(streamHost);

    } catch (err) {
      const previewHost = document.getElementById('aiCopilotPreviewCol');
      if (previewHost) {
        previewHost.innerHTML = `<div class="error-state"><h3>خطا در ایجاد پیش‌نویس هوشمند</h3><p>${esc(err.message)}</p></div>`;
      }
    }

    // Bind Quick Chat Chips
    modal.querySelectorAll('[data-quick-chat]').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById('aiCopilotInput');
        if (input) {
          input.value = btn.dataset.quickChat;
          document.getElementById('aiCopilotChatForm')?.requestSubmit();
        }
      };
    });

    // Bind Chat Form
    document.getElementById('aiCopilotChatForm').onsubmit = e => {
      e.preventDefault();
      handleSendCopilotChat();
    };

    document.getElementById('btnClearCopilotChat').onclick = () => {
      activeCopilotState.chatHistory = [];
      const stream = document.getElementById('aiCopilotChatStream');
      renderCopilotChat(stream);
    };

    // Bind Action Buttons
    document.getElementById('btnCopilotApplyToBuilder').onclick = () => {
      if (activeCopilotState.programId) {
        close();
        location.href = `/programs/exercise/form?id=${activeCopilotState.programId}`;
      } else {
        close();
      }
    };

    document.getElementById('btnCopilotPDF').onclick = () => {
      if (activeCopilotState.program && window.openProgramPDF) {
        window.openProgramPDF(activeCopilotState.program);
      }
    };
  }

  // Export globally
  win.openAICopilot = openAICopilot;
  win.openAIAssessmentModal = openAIAssessmentModal;
})();
