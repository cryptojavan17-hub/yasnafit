/**
 * Yasnafit — Supplement Programs Module (برنامه‌های مکمل)
 * High-Performance Supplement Program Template Builder, Grid Selector, Detail Editor & AI Clinical Analysis
 */
(() => {
  'use strict';

  const fa = value => window.YasnafitLocale?.text(value) || String(value ?? '—');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opt = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'خطا در ارتباط با سرور');
    return d;
  }

  function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `alert-toast ${type}`;
    el.style.position = 'fixed';
    el.style.bottom = '24px';
    el.style.left = '24px';
    el.style.zIndex = '99999';
    el.style.padding = '12px 20px';
    el.style.borderRadius = 'var(--radius-md)';
    el.style.boxShadow = 'var(--shadow)';
    el.style.fontSize = '14px';
    el.style.fontWeight = '600';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '10px';
    el.style.animation = 'suppFadeIn 200ms ease';

    if (type === 'error') {
      el.style.background = 'var(--danger-surface)';
      el.style.color = 'var(--danger)';
      el.style.border = '1px solid var(--danger-border)';
      el.innerHTML = `<span>⚠️</span> <span>${esc(msg)}</span>`;
    } else if (type === 'success') {
      el.style.background = 'var(--success-surface)';
      el.style.color = 'var(--success)';
      el.style.border = '1px solid var(--success-border)';
      el.innerHTML = `<span>✅</span> <span>${esc(msg)}</span>`;
    } else {
      el.style.background = 'var(--surface-2)';
      el.style.color = 'var(--text-primary)';
      el.style.border = '1px solid var(--border)';
      el.innerHTML = `<span>ℹ️</span> <span>${esc(msg)}</span>`;
    }

    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 300ms ease';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  }

  // Exact 16 Timing Options in exact order requested
  const TIMING_OPTIONS = [
    'قبل صبحانه',
    'همراه صبحانه',
    'بعد صبحانه',
    'میان وعده صبح',
    'قبل ناهار',
    'همراه ناهار',
    'بعد ناهار',
    'میان وعده اول عصر',
    'میان وعده دوم عصر',
    'قبل تمرین',
    'حین تمرین',
    'بعد تمرین',
    'قبل شام',
    'همراه شام',
    'بعد شام',
    'قبل خواب'
  ];

  const CATEGORIES = [
    { id: 'muscle_building', label: 'عضله‌سازی و حجم (Hypertrophy)' },
    { id: 'fat_loss', label: 'چربی‌سوزی و کات (Fat Loss / Cutting)' },
    { id: 'performance_energy', label: 'افزایش توان و انرژی (Energy & Performance)' },
    { id: 'recovery_joints', label: 'ریکاوری و سلامت مفاصل (Recovery & Joints)' },
    { id: 'general_health', label: 'سلامت عمومی و ویتامین‌ها (General Wellness)' },
    { id: 'competition', label: 'آمادگی مسابقه و حرفه‌ای (Competition Prep)' }
  ];

  let catalogCache = null;

  async function loadCatalog() {
    if (catalogCache && catalogCache.length > 0) return catalogCache;
    try {
      catalogCache = await api('/api/supplement-catalog');
    } catch (e) {
      catalogCache = [
        { id: 'whey_protein', name: 'پروتئین وی', english_name: 'Whey Protein', category: 'protein', icon: '🥛', default_timing: 'بعد تمرین', default_notes: '۱ اسکوپ با ۳۰۰ میلی‌لیتر آب سرد بعد از تمرین' },
        { id: 'creatine_monohydrate', name: 'کراتین', english_name: 'Creatine Monohydrate', category: 'performance', icon: '⚡', default_timing: 'بعد تمرین', default_notes: '۵ گرم روزانه با پروتئین وی یا آبمیوه' },
        { id: 'bcaa', name: 'BCAA', english_name: 'Branched-Chain Amino Acids', category: 'protein', icon: '🧬', default_timing: 'حین تمرین', default_notes: '۷ تا ۱۰ گرم در ۵۰۰ میلی‌لیتر آب حین تمرین' },
        { id: 'omega_3', name: 'امگا ۳', english_name: 'Omega-3 Fish Oil', category: 'general_health', icon: '🐟', default_timing: 'همراه ناهار', default_notes: '۱ کپسول ۱۰۰۰ میلی‌گرم همراه با وعده ناهار' },
        { id: 'vitamin_b_complex', name: 'ویتامین B', english_name: 'Vitamin B-Complex', category: 'vitamins_minerals', icon: '💊', default_timing: 'همراه صبحانه', default_notes: '۱ قرص روزانه همراه با صبحانه' },
        { id: 'zinc_plus', name: 'زینک پلاس', english_name: 'Zinc Plus', category: 'vitamins_minerals', icon: '🛡️', default_timing: 'بعد ناهار', default_notes: '۱ کپسول روزانه بعد از غذا' },
        { id: 'glutamine', name: 'گلوتامین', english_name: 'L-Glutamine', category: 'recovery', icon: '🧪', default_timing: 'بعد تمرین', default_notes: '۵ گرم بعد تمرین یا قبل خواب' },
        { id: 'casein_protein', name: 'پروتئین کازئین', english_name: 'Casein Protein', category: 'protein', icon: '🌙', default_timing: 'قبل خواب', default_notes: '۱ اسکوپ قبل خواب با آب یا شیر کم‌چرب' },
        { id: 'eaa', name: 'EAA', english_name: 'Essential Amino Acids', category: 'protein', icon: '✨', default_timing: 'حین تمرین', default_notes: '۱۰ گرم در آب حین تمرین' },
        { id: 'pre_workout_pump', name: 'پمپ قبل تمرین', english_name: 'Pre-Workout Pump', category: 'performance', icon: '🔥', default_timing: 'قبل تمرین', default_notes: '۱ پیمانه ۲۰ الی ۳۰ دقیقه قبل تمرین' },
        { id: 'caffeine', name: 'کافئین', english_name: 'Caffeine', category: 'performance', icon: '☕', default_timing: 'قبل تمرین', default_notes: '۱۰۰ تا ۲۰۰ میلی‌گرم ۳۰ دقیقه قبل تمرین' },
        { id: 'beta_alanine', name: 'بتا آلانین', english_name: 'Beta-Alanine', category: 'performance', icon: '⚡', default_timing: 'قبل تمرین', default_notes: '۳ تا ۵ گرم قبل تمرین' },
        { id: 'l_carnitine', name: 'ال کارنیتین', english_name: 'L-Carnitine', category: 'fat_loss', icon: '🔥', default_timing: 'قبل تمرین', default_notes: '۱۰۰۰ تا ۲۰۰۰ میلی‌گرم قبل تمرین هوازی' },
        { id: 'cla', name: 'سی ال ای (CLA)', english_name: 'CLA', category: 'fat_loss', icon: '🥑', default_timing: 'همراه ناهار', default_notes: '۱۰۰۰ میلی‌گرم همراه با غذا' },
        { id: 'magnesium', name: 'منیزیم', english_name: 'Magnesium Bisglycinate', category: 'vitamins_minerals', icon: '💤', default_timing: 'قبل خواب', default_notes: '۲۰۰ تا ۴۰۰ میلی‌گرم شب قبل خواب' },
        { id: 'calcium_d3', name: 'کلسیم + D3', english_name: 'Calcium + D3', category: 'vitamins_minerals', icon: '🦴', default_timing: 'بعد ناهار', default_notes: '۱ قرص بعد ناهار با فاصله از آهن' },
        { id: 'vitamin_c', name: 'ویتامین C', english_name: 'Vitamin C', category: 'vitamins_minerals', icon: '🍊', default_timing: 'همراه صبحانه', default_notes: '۵۰۰ تا ۱۰۰۰ میلی‌گرم همراه غذا' },
        { id: 'vitamin_d3', name: 'ویتامین D3', english_name: 'Vitamin D3', category: 'vitamins_minerals', icon: '☀️', default_timing: 'همراه صبحانه', default_notes: '۱۰۰۰ تا ۲۰۰۰ واحد روزانه با غذا' },
        { id: 'multivitamin', name: 'مولتی ویتامین', english_name: 'Multivitamin', category: 'vitamins_minerals', icon: '🌈', default_timing: 'همراه صبحانه', default_notes: '۱ قرص همراه با صبحانه کامل' },
        { id: 'citrulline_malate', name: 'سیترولین مالات', english_name: 'Citrulline Malate', category: 'performance', icon: '🍉', default_timing: 'قبل تمرین', default_notes: '۶ تا ۸ گرم ۳۰ دقیقه قبل تمرین' },
        { id: 'ashwagandha', name: 'اشواگاندا', english_name: 'Ashwagandha', category: 'recovery', icon: '🌿', default_timing: 'قبل خواب', default_notes: '۳۰۰ تا ۶۰۰ میلی‌گرم شب قبل خواب' },
        { id: 'melatonin', name: 'ملاتونین', english_name: 'Melatonin', category: 'recovery', icon: '🌙', default_timing: 'قبل خواب', default_notes: '۱ تا ۳ میلی‌گرم ۳۰ دقیقه قبل خواب' },
        { id: 'hmb', name: 'HMB', english_name: 'HMB', category: 'protein', icon: '🛡️', default_timing: 'قبل تمرین', default_notes: '۳ گرم روزانه منقسم' },
        { id: 'iron_folic', name: 'آهن + فولیک اسید', english_name: 'Iron + Folic Acid', category: 'vitamins_minerals', icon: '🩸', default_timing: 'قبل صبحانه', default_notes: '۱ کپسول ناشتا با آب‌میوه تازه' },
        { id: 'coq10', name: 'کوآنزیم Q10', english_name: 'Coenzyme Q10', category: 'general_health', icon: '❤️', default_timing: 'همراه ناهار', default_notes: '۱۰۰ تا ۲۰۰ میلی‌گرم همراه غذا' },
        { id: 'collagen', name: 'کلاژن پپتاید', english_name: 'Collagen', category: 'recovery', icon: '🦴', default_timing: 'همراه صبحانه', default_notes: '۱۰ گرم پودر کلاژن همراه مایعات' },
        { id: 'probiotics', name: 'پروبیوتیک', english_name: 'Probiotics', category: 'general_health', icon: '🌱', default_timing: 'همراه صبحانه', default_notes: '۱ کپسول روزانه همراه صبحانه' },
        { id: 'glucosamine', name: 'گلوکوزامین و کندرویتین', english_name: 'Glucosamine', category: 'recovery', icon: '🦵', default_timing: 'همراه ناهار', default_notes: '۱۵۰۰ میلی‌گرم در روز همراه غذا' },
        { id: 'green_tea_extract', name: 'عصاره چای سبز', english_name: 'Green Tea Extract', category: 'fat_loss', icon: '🍵', default_timing: 'قبل ناهار', default_notes: '۴۰۰ میلی‌گرم بین وعده‌ها' },
        { id: 'l_arginine', name: 'ال آرژنین', english_name: 'L-Arginine', category: 'performance', icon: '⚡', default_timing: 'قبل تمرین', default_notes: '۳ تا ۵ گرم ۳۰ دقیقه قبل تمرین' },
        { id: 'mass_gainer', name: 'مس گینر', english_name: 'Mass Gainer', category: 'protein', icon: '🏋️', default_timing: 'میان وعده اول عصر', default_notes: '۱ سروینگ بین وعده‌ها یا بعد تمرین' },
        { id: 'curcumin', name: 'کورکومین', english_name: 'Curcumin', category: 'recovery', icon: '🔶', default_timing: 'همراه شام', default_notes: '۵۰۰ میلی‌گرم همراه با غذا' }
      ];
    }
    return catalogCache;
  }

  // ==============================================================
  // 1. MAIN SUPPLEMENT PROGRAM FORM BUILDER (افزودن نمونه برنامه مکمل)
  // ==============================================================
  let builderState = {
    programId: null,
    title: '',
    category: 'muscle_building',
    description: '',
    items: [], // Array of { id, supplement_name, timing, notes, icon, category }
    editingIndex: null
  };

  async function renderSupplementProgramBuilder(label, route) {
    document.querySelector('#breadcrumb').textContent = label || 'افزودن نمونه برنامه مکمل';
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === '/programs/supplement/form'));

    const content = document.querySelector('#content');
    content.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>در حال آماده‌سازی فرم برنامه مکمل…</p></div>';

    await loadCatalog();

    // Check if editing existing program
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('id');

    if (editId) {
      try {
        const prog = await api(`/api/supplement-programs/${editId}`);
        builderState = {
          programId: prog.id,
          title: prog.title || '',
          category: prog.category || 'muscle_building',
          description: prog.description || '',
          items: (prog.items || []).map(it => ({
            id: it.id,
            supplement_name: it.supplement_name,
            timing: it.timing || 'بعد تمرین',
            notes: it.notes || '',
            icon: it.icon || '💊',
            category: it.category || 'general'
          })),
          editingIndex: null
        };
      } catch (err) {
        showToast('خطا در بارگذاری برنامه مکمل: ' + err.message, 'error');
        builderState = {
          programId: null,
          title: '',
          category: 'muscle_building',
          description: '',
          items: [],
          editingIndex: null
        };
      }
    } else {
      builderState = {
        programId: null,
        title: '',
        category: 'muscle_building',
        description: '',
        items: [],
        editingIndex: null
      };
    }

    renderBuilderUI();
  }

  function renderBuilderUI() {
    const content = document.querySelector('#content');
    const isEdit = Boolean(builderState.programId);

    const categoryOptionsHtml = CATEGORIES.map(c => `
      <option value="${c.id}" ${builderState.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>
    `).join('');

    content.innerHTML = `
      <div class="supp-page">
        <!-- Top Header -->
        <div class="supp-header">
          <div class="supp-header-title">
            <span class="supp-header-icon">💊</span>
            <div>
              <h1>${isEdit ? 'ویرایش نمونه برنامه مکمل' : 'افزودن نمونه برنامه مکمل'}</h1>
              <p>طراحی علمی بسته مکمل‌ها با تنظیم دقیق زمان‌بندی و پایش هوشمند تداخلات</p>
            </div>
          </div>
          <div class="supp-header-actions">
            <button class="btn-supp-secondary" id="btnBackToList" type="button">
              بازگشت به لیست ↶
            </button>
          </div>
        </div>

        <!-- Main Form Container -->
        <div class="supp-form-container">
          <div class="supp-form-grid">
            <!-- دسته بندی -->
            <div class="supp-form-group">
              <label class="supp-label" for="suppCategory">
                <span>🏷️</span>
                <span>دسته‌بندی برنامه:</span>
              </label>
              <select class="supp-select" id="suppCategory">
                ${categoryOptionsHtml}
              </select>
            </div>

            <!-- عنوان نمونه برنامه -->
            <div class="supp-form-group">
              <label class="supp-label" for="suppTitle">
                <span>📝</span>
                <span>عنوان نمونه برنامه:</span>
              </label>
              <input type="text" class="supp-input" id="suppTitle"
                placeholder="مثلاً: پکیج حجم خشک و ریکاوری پیشرفته"
                value="${esc(builderState.title)}" />
            </div>

            <!-- توضیحات نمونه برنامه -->
            <div class="supp-form-group full-width">
              <label class="supp-label" for="suppDescription">
                <span>📄</span>
                <span>توضیحات نمونه برنامه:</span>
              </label>
              <textarea class="supp-textarea" id="suppDescription"
                placeholder="توضیحات، نکات کلی مربی، پروتکل مصرف آب و هیدراتاسیون و...">${esc(builderState.description)}</textarea>
            </div>
          </div>

          <!-- لیست مکمل‌های اضافه‌شده -->
          <div class="supp-items-section">
            <div class="supp-items-header">
              <div class="supp-items-title">
                <span>💊</span>
                <span>لیست مکمل‌های اضافه‌شده</span>
                <span class="supp-tab-count" id="suppItemsCountBadge">${fa(builderState.items.length)}</span>
              </div>
              ${builderState.items.length > 0 ? `
                <button class="btn-supp-green" id="btnAddMoreSupp" type="button">
                  افزودن مکمل +
                </button>
              ` : ''}
            </div>

            <div id="suppItemsContainer">
              ${renderItemsListHtml()}
            </div>
          </div>

          <!-- Bottom Action Bar -->
          <div class="supp-form-actions-bar">
            <div class="supp-actions-left">
              <button class="btn-supp-primary" id="btnSaveProgram" type="button">
                <span>💾</span>
                <span>ذخیره و بازگشت</span>
              </button>
              <button class="btn-supp-ai" id="btnAIAnalyze" type="button">
                <span>✨</span>
                <span>تحلیل هوشمند مکمل‌ها</span>
              </button>
            </div>
            <div class="supp-actions-right">
              <button class="btn-supp-secondary" id="btnCancelProgram" type="button">
                انصراف و بازگشت
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    bindBuilderEvents();
  }

  function renderItemsListHtml() {
    if (builderState.items.length === 0) {
      // Empty state: کادر با پس‌زمینه سبز کمرنگ و متن «برای شروع، یک مکمل جدید اضافه کنید!» و دکمه سبز رنگ «افزودن مکمل +»
      return `
        <div class="supp-empty-state-box">
          <div class="supp-empty-state-text">
            برای شروع، یک مکمل جدید اضافه کنید!
          </div>
          <button class="btn-supp-green" id="btnAddFirstSupp" type="button">
            افزودن مکمل +
          </button>
        </div>
      `;
    }

    return `
      <div class="supp-items-list">
        ${builderState.items.map((it, idx) => `
          <div class="supp-item-row" data-index="${idx}">
            <div class="supp-item-main">
              <div class="supp-item-icon-badge">${esc(it.icon || '💊')}</div>
              <div class="supp-item-details">
                <div class="supp-item-name-row">
                  <span class="supp-item-name">${esc(it.supplement_name)}</span>
                  <span class="supp-item-timing-pill">⏱️ ${esc(it.timing)}</span>
                </div>
                ${it.notes ? `
                  <div class="supp-item-notes" title="${esc(it.notes)}">
                    <span>✏️</span>
                    <span>${esc(it.notes)}</span>
                  </div>
                ` : `
                  <div class="supp-item-notes" style="color: var(--text-placeholder);">
                    <span>✏️</span>
                    <span>بدون یادداشت اختصاصی (برای افزودن ویرایش کنید)</span>
                  </div>
                `}
              </div>
            </div>
            <div class="supp-item-row-actions">
              <button class="btn-supp-icon btn-edit-item" data-index="${idx}" type="button" title="ویرایش زمان و دستور مصرف">
                ✏️
              </button>
              <button class="btn-supp-icon btn-danger btn-delete-item" data-index="${idx}" type="button" title="حذف این مکمل">
                🗑️
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function bindBuilderEvents() {
    const titleInput = document.querySelector('#suppTitle');
    const descInput = document.querySelector('#suppDescription');
    const catSelect = document.querySelector('#suppCategory');

    if (titleInput) titleInput.addEventListener('input', e => { builderState.title = e.target.value; });
    if (descInput) descInput.addEventListener('input', e => { builderState.description = e.target.value; });
    if (catSelect) catSelect.addEventListener('change', e => { builderState.category = e.target.value; });

    // Add Supplement Buttons
    const addFirst = document.querySelector('#btnAddFirstSupp');
    const addMore = document.querySelector('#btnAddMoreSupp');
    if (addFirst) addFirst.onclick = () => openGridSelectorModal();
    if (addMore) addMore.onclick = () => openGridSelectorModal();

    // Back & Cancel
    const backBtn = document.querySelector('#btnBackToList');
    const cancelBtn = document.querySelector('#btnCancelProgram');
    if (backBtn) backBtn.onclick = () => window.goToRoute('برنامه‌های مکمل', '/programs/supplement/list');
    if (cancelBtn) cancelBtn.onclick = () => window.goToRoute('برنامه‌های مکمل', '/programs/supplement/list');

    // Save & Return Button
    const saveBtn = document.querySelector('#btnSaveProgram');
    if (saveBtn) saveBtn.onclick = handleSaveProgram;

    // AI Analysis Button
    const aiBtn = document.querySelector('#btnAIAnalyze');
    if (aiBtn) aiBtn.onclick = handleAIAnalyze;

    // Edit & Delete row buttons
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
      btn.onclick = (e) => {
        const idx = Number(btn.dataset.index);
        openDetailEditModal(idx);
      };
    });

    document.querySelectorAll('.btn-delete-item').forEach(btn => {
      btn.onclick = (e) => {
        const idx = Number(btn.dataset.index);
        const item = builderState.items[idx];
        if (confirm(`آیا از حذف مکمل «${item?.supplement_name}» اطمینان دارید؟`)) {
          builderState.items.splice(idx, 1);
          renderBuilderUI();
          showToast('مکمل با موفقیت حذف شد.', 'info');
        }
      };
    });
  }

  // ==============================================================
  // 2. GRID SELECTOR MODAL (مودال انتخاب مکمل)
  // ==============================================================
  let selectorSearchQuery = '';
  let selectorActiveCat = 'all';

  async function openGridSelectorModal() {
    const catalog = await loadCatalog();
    selectorSearchQuery = '';
    selectorActiveCat = 'all';

    const overlay = document.createElement('div');
    overlay.className = 'supp-modal-overlay';
    overlay.id = 'suppGridModal';

    overlay.innerHTML = `
      <div class="supp-modal-box modal-large">
        <div class="supp-modal-header">
          <h3>
            <span>💊</span>
            <span>انتخاب مکمل ورزشی و تغذیه‌ای</span>
          </h3>
          <button class="supp-modal-close" id="btnCloseGridModal" type="button" aria-label="بستن">✕</button>
        </div>

        <div class="supp-modal-body">
          <div class="supp-selector-filter">
            <!-- نوار جستجو با متن نگه‌دارنده «جستجوی مکمل...» -->
            <div class="supp-search-wrap">
              <input type="text" class="supp-search-input" id="suppGridSearchInput"
                placeholder="جستجوی مکمل..." autofocus />
            </div>

            <!-- تب‌های دسته‌بندی مکمل‌ها -->
            <div class="supp-category-pills">
              <button class="supp-cat-pill active" data-cat="all" type="button">همه مکمل‌ها</button>
              <button class="supp-cat-pill" data-cat="protein" type="button">پروتئین و آمینو</button>
              <button class="supp-cat-pill" data-cat="performance" type="button">عملکرد و پمپ</button>
              <button class="supp-cat-pill" data-cat="vitamins_minerals" type="button">ویتامین و املاح</button>
              <button class="supp-cat-pill" data-cat="recovery" type="button">ریکاوری و مفاصل</button>
              <button class="supp-cat-pill" data-cat="fat_loss" type="button">چربی‌سوزی</button>
              <button class="supp-cat-pill" data-cat="general_health" type="button">سلامت عمومی</button>
            </div>
          </div>

          <!-- ساختار شبکه‌ای شامل کارت‌های کوچک -->
          <div class="supp-cards-grid" id="suppGridCardsContainer">
            ${renderGridCardsHtml(catalog)}
          </div>
        </div>

        <div class="supp-modal-footer">
          <button class="btn-supp-secondary" id="btnAddCustomSuppBtn" type="button">
            <span>➕</span>
            <span>افزودن مکمل دلخواه (سفارشی)</span>
          </button>
          <button class="btn-supp-secondary" id="btnCloseGridFooterBtn" type="button">
            انصراف
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const searchInput = overlay.querySelector('#suppGridSearchInput');
    const container = overlay.querySelector('#suppGridCardsContainer');

    searchInput.addEventListener('input', (e) => {
      selectorSearchQuery = e.target.value.trim().toLowerCase();
      container.innerHTML = renderGridCardsHtml(catalog);
      bindGridCardClicks(overlay);
    });

    overlay.querySelectorAll('.supp-cat-pill').forEach(btn => {
      btn.onclick = () => {
        overlay.querySelectorAll('.supp-cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectorActiveCat = btn.dataset.cat;
        container.innerHTML = renderGridCardsHtml(catalog);
        bindGridCardClicks(overlay);
      };
    });

    overlay.querySelector('#btnCloseGridModal').onclick = () => overlay.remove();
    overlay.querySelector('#btnCloseGridFooterBtn').onclick = () => overlay.remove();

    overlay.querySelector('#btnAddCustomSuppBtn').onclick = () => {
      overlay.remove();
      const customName = prompt('نام مکمل سفارشی را وارد کنید:');
      if (customName && customName.trim()) {
        openDetailEditModal(null, {
          supplement_name: customName.trim(),
          timing: 'بعد تمرین',
          notes: '',
          icon: '💊',
          category: 'custom'
        });
      }
    };

    bindGridCardClicks(overlay);
  }

  function renderGridCardsHtml(catalog) {
    const filtered = catalog.filter(it => {
      const matchCat = selectorActiveCat === 'all' || it.category === selectorActiveCat;
      const matchSearch = !selectorSearchQuery ||
        it.name.toLowerCase().includes(selectorSearchQuery) ||
        (it.english_name && it.english_name.toLowerCase().includes(selectorSearchQuery)) ||
        (it.benefits && it.benefits.toLowerCase().includes(selectorSearchQuery));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      return `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <span>🔍 مکملی با این عنوان یافت نشد. می‌توانید با کلیک بر روی «افزودن مکمل دلخواه»، آن را دستی وارد کنید.</span>
        </div>
      `;
    }

    return filtered.map(it => `
      <div class="supp-select-card" data-id="${it.id}" data-name="${esc(it.name)}" data-icon="${esc(it.icon || '💊')}" data-timing="${esc(it.default_timing || 'بعد تمرین')}" data-notes="${esc(it.default_notes || '')}" data-cat="${esc(it.category || 'general')}">
        <div class="supp-select-card-icon">
          ${esc(it.icon || '💊')}
        </div>
        <div class="supp-select-card-name">${esc(it.name)}</div>
        ${it.english_name ? `<div class="supp-select-card-cat">${esc(it.english_name)}</div>` : ''}
        <div class="supp-select-card-badge">انتخاب و تنظیم ↲</div>
      </div>
    `).join('');
  }

  function bindGridCardClicks(overlay) {
    overlay.querySelectorAll('.supp-select-card').forEach(card => {
      card.onclick = () => {
        const itemData = {
          supplement_name: card.dataset.name,
          timing: card.dataset.timing || 'بعد تمرین',
          notes: card.dataset.notes || '',
          icon: card.dataset.icon || '💊',
          category: card.dataset.cat || 'general'
        };
        overlay.remove();
        openDetailEditModal(null, itemData);
      };
    });
  }

  // ==============================================================
  // 3. DETAIL EDIT MODAL (فرم ویرایش مکمل و زمان مصرف)
  // ==============================================================
  function openDetailEditModal(index = null, newItemData = null) {
    const isEdit = index !== null && builderState.items[index];
    const targetItem = isEdit
      ? { ...builderState.items[index] }
      : (newItemData || { supplement_name: 'ویتامین B', timing: 'همراه صبحانه', notes: '', icon: '💊', category: 'general' });

    const suppName = targetItem.supplement_name || 'مکمل';

    const timingOptionsHtml = TIMING_OPTIONS.map(opt => `
      <option value="${esc(opt)}" ${targetItem.timing === opt ? 'selected' : ''}>${esc(opt)}</option>
    `).join('');

    const overlay = document.createElement('div');
    overlay.className = 'supp-modal-overlay';
    overlay.id = 'suppDetailModal';

    overlay.innerHTML = `
      <div class="supp-modal-box">
        <div class="supp-modal-header">
          <h3>
            <span>${esc(targetItem.icon || '💊')}</span>
            <span>ویرایش مکمل ${esc(suppName)}</span>
          </h3>
          <button class="supp-modal-close" id="btnCloseDetailModal" type="button" aria-label="بستن">✕</button>
        </div>

        <div class="supp-modal-body">
          <!-- فیلد توضیحات/یادداشت دلخواه با آیکون مداد در بالا -->
          <div class="supp-edit-note-field">
            <label class="supp-label" for="editSuppNotes">
              <span>✏️</span>
              <span>توضیحات و دستور مصرف اختصاصی (یادداشت مربی):</span>
            </label>
            <span class="supp-edit-note-icon">✏️</span>
            <input type="text" class="supp-input supp-input-with-icon" id="editSuppNotes"
              placeholder="مثال: ۱ اسکوپ با ۳۰۰ میلی‌لیتر آب خنک بعد از تمرین..."
              value="${esc(targetItem.notes || '')}" autofocus />
          </div>

          <!-- نام مکمل -->
          <div class="supp-form-group">
            <label class="supp-label" for="editSuppName">
              <span>🏷️</span>
              <span>نام مکمل:</span>
            </label>
            <input type="text" class="supp-input" id="editSuppName"
              value="${esc(suppName)}" />
          </div>

          <!-- زمان مصرف (Dropdown با ۱۶ گزینه دقیق) -->
          <div class="supp-form-group">
            <label class="supp-label" for="editSuppTiming">
              <span>⏱️</span>
              <span>زمان مصرف:</span>
            </label>
            <select class="supp-select" id="editSuppTiming">
              ${timingOptionsHtml}
            </select>
          </div>
        </div>

        <div class="supp-modal-footer">
          <button class="btn-supp-primary" id="btnConfirmDetail" type="button">
            <span>✅</span>
            <span>${isEdit ? 'بروزرسانی مکمل' : 'تایید و افزودن به برنامه'}</span>
          </button>
          <button class="btn-supp-secondary" id="btnCancelDetail" type="button">
            انصراف
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnCloseDetailModal').onclick = () => overlay.remove();
    overlay.querySelector('#btnCancelDetail').onclick = () => overlay.remove();

    overlay.querySelector('#btnConfirmDetail').onclick = () => {
      const updatedNotes = overlay.querySelector('#editSuppNotes').value.trim();
      const updatedName = overlay.querySelector('#editSuppName').value.trim();
      const updatedTiming = overlay.querySelector('#editSuppTiming').value;

      if (!updatedName) {
        showToast('نام مکمل الزامی است.', 'error');
        return;
      }

      const finalizedItem = {
        ...targetItem,
        supplement_name: updatedName,
        timing: updatedTiming,
        notes: updatedNotes
      };

      if (isEdit) {
        builderState.items[index] = finalizedItem;
        showToast(`مکمل «${updatedName}» بروزرسانی شد.`, 'success');
      } else {
        builderState.items.push(finalizedItem);
        showToast(`مکمل «${updatedName}» با موفقیت اضافه شد.`, 'success');
      }

      overlay.remove();
      renderBuilderUI();
    };
  }

  // ==============================================================
  // 4. AI CLINICAL & SYNERGY ANALYSIS (تحلیل هوشمند مکمل‌ها)
  // ==============================================================
  async function handleAIAnalyze() {
    if (builderState.items.length === 0) {
      showToast('لطفاً ابتدا حداقل یک مکمل به برنامه اضافه کنید!', 'error');
      return;
    }

    const aiBtn = document.querySelector('#btnAIAnalyze');
    const originalText = aiBtn ? aiBtn.innerHTML : '';
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.innerHTML = '<span>⏳</span> <span>در حال تحلیل بالینی هوشمند…</span>';
    }

    try {
      const payload = {
        title: builderState.title || 'نمونه برنامه مکمل',
        category: builderState.category || 'muscle_building',
        description: builderState.description || '',
        items: builderState.items.map(it => ({
          supplement_name: it.supplement_name,
          timing: it.timing,
          notes: it.notes,
          icon: it.icon,
          category: it.category
        }))
      };

      const analysis = await api('/api/supplement-programs/analyze-ai', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      openAIAnalysisModal(analysis);
    } catch (err) {
      showToast('خطا در تحلیل هوشمند مکمل‌ها: ' + err.message, 'error');
    } finally {
      if (aiBtn) {
        aiBtn.disabled = false;
        aiBtn.innerHTML = originalText;
      }
    }
  }

  function openAIAnalysisModal(analysis) {
    const overlay = document.createElement('div');
    overlay.className = 'supp-modal-overlay';
    overlay.id = 'suppAIAnalysisModal';

    const interactions = analysis.interactions || [];
    const timingOpt = analysis.timingOptimization || [];
    const synergies = analysis.synergies || [];
    const warnings = analysis.overdoseStimulantWarnings || [];

    overlay.innerHTML = `
      <div class="supp-modal-box modal-large">
        <div class="supp-modal-header">
          <h3>
            <span>✨</span>
            <span>گزارش تحلیل هوشمند و بالینی مکمل‌ها</span>
          </h3>
          <button class="supp-modal-close" id="btnCloseAIModal" type="button" aria-label="بستن">✕</button>
        </div>

        <div class="supp-modal-body">
          <div class="supp-ai-analysis-container">
            <!-- Score Banner -->
            <div class="supp-ai-score-banner">
              <div class="supp-ai-score-left">
                <div class="supp-ai-score-badge">${fa(analysis.overallScore || 90)}/۱۰۰</div>
                <div>
                  <h4 style="margin:0; font-size:15px; color:var(--text-primary);">نمره ایمنی و بهره‌وری برنامه</h4>
                  <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-muted);">${esc(analysis.summary)}</p>
                </div>
              </div>
              <button class="btn-supp-secondary" id="btnCopyAIReport" type="button">
                <span>📋</span>
                <span>کپی گزارش کامل</span>
              </button>
            </div>

            <!-- ۱. بررسی تداخلات (Interactions) -->
            <div class="supp-ai-section-card">
              <div class="supp-ai-section-header">
                <div class="supp-ai-section-title">
                  <span>⚡</span>
                  <span>۱. بررسی تداخلات دارویی و جذبی (Interactions)</span>
                </div>
                <span class="supp-item-chip">${fa(interactions.length)} مورد</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${interactions.map(item => `
                  <div class="supp-ai-item ${item.severity === 'danger' ? 'item-danger' : (item.severity === 'warning' ? 'item-warning' : 'item-optimal')}">
                    <div class="supp-ai-item-head">
                      <span class="supp-ai-item-title">${item.severity === 'danger' ? '🔴' : (item.severity === 'warning' ? '🟡' : '🟢')} ${esc(item.title)}</span>
                      <span class="supp-ai-item-badge">${esc(item.timing || '')}</span>
                    </div>
                    <p class="supp-ai-item-desc">${esc(item.description)}</p>
                    ${item.solution ? `<div class="supp-ai-item-solution">💡 <strong>راهکار مربی:</strong> ${esc(item.solution)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ۲. بهینه‌سازی زمان مصرف (Timing Optimization) -->
            <div class="supp-ai-section-card">
              <div class="supp-ai-section-header">
                <div class="supp-ai-section-title">
                  <span>⏱️</span>
                  <span>۲. بهینه‌سازی و انطباق زمان مصرف (Timing Optimization)</span>
                </div>
                <span class="supp-item-chip">${fa(timingOpt.length)} تحلیل زمان‌بندی</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${timingOpt.map(item => `
                  <div class="supp-ai-item ${item.status === 'suboptimal' ? 'item-warning' : 'item-optimal'}">
                    <div class="supp-ai-item-head">
                      <span class="supp-ai-item-title">${item.status === 'suboptimal' ? '🔄 نیاز به جابجایی:' : '✅ تایید زمان‌بندی:'} ${esc(item.supplement)}</span>
                      <span class="supp-item-timing-pill">${esc(item.currentTiming)} ${item.suggestedTiming !== item.currentTiming ? `← پیشنهاد: ${esc(item.suggestedTiming)}` : ''}</span>
                    </div>
                    <p class="supp-ai-item-desc">${esc(item.rationale)}</p>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ۳. بررسی ترکیبات هم‌افزا (Synergy) -->
            <div class="supp-ai-section-card">
              <div class="supp-ai-section-header">
                <div class="supp-ai-section-title">
                  <span>🧬</span>
                  <span>۳. بررسی ترکیبات هم‌افزا و سینرژیک (Synergy)</span>
                </div>
                <span class="supp-item-chip">${fa(synergies.length)} هم‌افزایی</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${synergies.map(item => `
                  <div class="supp-ai-item item-synergy">
                    <div class="supp-ai-item-head">
                      <span class="supp-ai-item-title">✨ ${esc(item.title)}</span>
                      <span class="supp-item-chip">${esc(item.supplements ? item.supplements.join(' + ') : '')}</span>
                    </div>
                    <p class="supp-ai-item-desc">${esc(item.benefits)}</p>
                    ${item.recommendation ? `<div class="supp-ai-item-solution">🎯 <strong>توصیه هم‌افزایی:</strong> ${esc(item.recommendation)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- ۴. هشدار اوردوز یا محرک‌ها (Overdose / Stimulant Safety) -->
            <div class="supp-ai-section-card">
              <div class="supp-ai-section-header">
                <div class="supp-ai-section-title">
                  <span>⚠️</span>
                  <span>۴. هشدار اوردوز، ایمنی کبد/کلیه و محرک‌ها (Safety & Stimulants)</span>
                </div>
                <span class="supp-item-chip">${fa(warnings.length)} پایش ایمنی</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:8px;">
                ${warnings.map(item => `
                  <div class="supp-ai-item ${item.severity === 'critical' ? 'item-danger' : (item.severity === 'high' || item.severity === 'moderate' ? 'item-warning' : 'item-optimal')}">
                    <div class="supp-ai-item-head">
                      <span class="supp-ai-item-title">${item.severity === 'critical' ? '🚨' : (item.severity === 'safe' ? '🛡️' : '⚠️')} ${esc(item.title)}</span>
                      <span class="supp-ai-item-badge">${item.severity === 'critical' ? 'اولویت بحرانی' : (item.severity === 'safe' ? 'ایمن' : 'احتیاط')}</span>
                    </div>
                    <p class="supp-ai-item-desc">${esc(item.details)}</p>
                    ${item.actionRequired ? `<div class="supp-ai-item-solution">🛡️ <strong>اقدام لازم:</strong> ${esc(item.actionRequired)}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="supp-modal-footer">
          ${timingOpt.some(t => t.status === 'suboptimal' && t.suggestedTiming) ? `
            <button class="btn-supp-green" id="btnAutoApplyTiming" type="button">
              <span>⚡</span>
              <span>اعمال خودکار زمان‌بندی‌های پیشنهادی</span>
            </button>
          ` : ''}
          <button class="btn-supp-secondary" id="btnCloseAIFooterBtn" type="button">
            بستن پنجره
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnCloseAIModal').onclick = () => overlay.remove();
    overlay.querySelector('#btnCloseAIFooterBtn').onclick = () => overlay.remove();

    const copyBtn = overlay.querySelector('#btnCopyAIReport');
    if (copyBtn) {
      copyBtn.onclick = () => {
        let text = `📋 گزارش بالینی برنامه مکمل: ${analysis.title}\nهدف: ${analysis.category}\nنمره ایمنی: ${analysis.overallScore}/100\n\n`;
        text += `۱. بررسی تداخلات:\n` + interactions.map(i => `- [${i.title}]: ${i.description}`).join('\n') + `\n\n`;
        text += `۲. زمان‌بندی:\n` + timingOpt.map(t => `- [${t.supplement} (${t.currentTiming})]: ${t.rationale}`).join('\n') + `\n\n`;
        text += `۳. هم‌افزایی:\n` + synergies.map(s => `- [${s.title}]: ${s.benefits}`).join('\n') + `\n\n`;
        text += `۴. پایش محرک‌ها و ایمنی:\n` + warnings.map(w => `- [${w.title}]: ${w.details}`).join('\n');

        navigator.clipboard?.writeText(text).then(() => {
          showToast('گزارش بالینی با موفقیت در کلیپ‌بورد کپی شد.', 'success');
        }).catch(() => {
          showToast('امکان کپی خودکار فراهم نشد.', 'error');
        });
      };
    }

    const autoApplyBtn = overlay.querySelector('#btnAutoApplyTiming');
    if (autoApplyBtn) {
      autoApplyBtn.onclick = () => {
        let appliedCount = 0;
        timingOpt.forEach(t => {
          if (t.status === 'suboptimal' && t.suggestedTiming) {
            const target = builderState.items.find(i => i.supplement_name === t.supplement || i.supplement_name.includes(t.supplement));
            if (target && target.timing !== t.suggestedTiming) {
              target.timing = t.suggestedTiming;
              appliedCount++;
            }
          }
        });
        overlay.remove();
        renderBuilderUI();
        showToast(`${fa(appliedCount)} مورد زمان‌بندی با موفقیت اصلاح شد.`, 'success');
      };
    }
  }

  // ==============================================================
  // SAVE PROGRAM
  // ==============================================================
  async function handleSaveProgram() {
    const title = (builderState.title || '').trim();
    if (!title) {
      showToast('لطفاً عنوان نمونه برنامه مکمل را وارد کنید.', 'error');
      document.querySelector('#suppTitle')?.focus();
      return;
    }

    if (builderState.items.length === 0) {
      showToast('لطفاً حداقل یک مکمل به برنامه اضافه کنید.', 'error');
      return;
    }

    const payload = {
      title,
      category: builderState.category,
      description: builderState.description,
      is_template: 1,
      status: 'DRAFT',
      items: builderState.items.map((it, idx) => ({
        supplement_name: it.supplement_name,
        timing: it.timing,
        notes: it.notes || '',
        icon: it.icon || '💊',
        category: it.category || 'general',
        sort_order: idx + 1
      }))
    };

    const saveBtn = document.querySelector('#btnSaveProgram');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>⏳</span> <span>در حال ذخیره…</span>';
    }

    try {
      if (builderState.programId) {
        await api(`/api/supplement-programs/${builderState.programId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('نمونه برنامه مکمل با موفقیت ویرایش شد.', 'success');
      } else {
        await api('/api/supplement-programs', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('نمونه برنامه مکمل جدید با موفقیت ایجاد شد.', 'success');
      }

      window.goToRoute('برنامه‌های مکمل', '/programs/supplement/list');
    } catch (err) {
      showToast('خطا در ذخیره برنامه مکمل: ' + err.message, 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span>💾</span> <span>ذخیره و بازگشت</span>';
      }
    }
  }

  // ==============================================================
  // 5. SUPPLEMENT PROGRAMS LIST VIEW (لیست برنامه‌های مکمل)
  // ==============================================================
  let listState = {
    activeTab: 'template', // 'template' | 'student'
    search: '',
    category: 'all'
  };

  async function renderSupplementProgramsList(label, route) {
    document.querySelector('#breadcrumb').textContent = label || 'برنامه‌های مکمل';
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === '/programs/supplement/list'));

    const content = document.querySelector('#content');
    content.innerHTML = `
      <div class="supp-page">
        <!-- Top Header -->
        <div class="supp-header">
          <div class="supp-header-title">
            <span class="supp-header-icon">💊</span>
            <div>
              <h1>مدیریت و بانک برنامه‌های مکمل</h1>
              <p>مشاهده، طراحی و بهینه‌سازی نمونه برنامه‌های مکمل و برنامه‌های اختصاصی شاگردان</p>
            </div>
          </div>
          <div class="supp-header-actions">
            <button class="btn-supp-green" id="btnNewSuppProgram" type="button">
              <span>➕</span>
              <span>افزودن نمونه برنامه مکمل</span>
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="supp-tabs">
          <button class="supp-tab-btn ${listState.activeTab === 'template' ? 'active' : ''}" id="tabTemplates" type="button">
            <span>📦</span>
            <span>نمونه برنامه‌های مکمل من</span>
            <span class="supp-tab-count" id="templateCountBadge">۰</span>
          </button>
          <button class="supp-tab-btn ${listState.activeTab === 'student' ? 'active' : ''}" id="tabStudents" type="button">
            <span>👤</span>
            <span>برنامه‌های مکمل شاگردان</span>
            <span class="supp-tab-count" id="studentCountBadge">۰</span>
          </button>
        </div>

        <!-- Filter Bar -->
        <div class="supp-filter-bar">
          <div class="supp-search-wrap">
            <input type="text" class="supp-search-input" id="suppListSearch"
              placeholder="جستجو در عنوان برنامه یا نام شاگرد..."
              value="${esc(listState.search)}" />
          </div>
          <select class="supp-select" id="suppListCategoryFilter">
            <option value="all">همه دسته‌بندی‌ها</option>
            ${CATEGORIES.map(c => `<option value="${c.id}" ${listState.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>

        <!-- Programs Grid -->
        <div id="suppListContainer">
          <div class="loading-state"><span class="spinner"></span><p>در حال دریافت برنامه‌های مکمل…</p></div>
        </div>
      </div>
    `;

    // Event bindings for header and filters
    document.querySelector('#btnNewSuppProgram').onclick = () => {
      window.goToRoute('افزودن نمونه برنامه مکمل', '/programs/supplement/form');
    };

    document.querySelector('#tabTemplates').onclick = () => {
      listState.activeTab = 'template';
      document.querySelector('#tabTemplates').classList.add('active');
      document.querySelector('#tabStudents').classList.remove('active');
      loadAndRenderList();
    };

    document.querySelector('#tabStudents').onclick = () => {
      listState.activeTab = 'student';
      document.querySelector('#tabStudents').classList.add('active');
      document.querySelector('#tabTemplates').classList.remove('active');
      loadAndRenderList();
    };

    let searchTimeout = null;
    document.querySelector('#suppListSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      listState.search = e.target.value.trim();
      searchTimeout = setTimeout(loadAndRenderList, 250);
    });

    document.querySelector('#suppListCategoryFilter').addEventListener('change', (e) => {
      listState.category = e.target.value;
      loadAndRenderList();
    });

    loadAndRenderList();
  }

  async function loadAndRenderList() {
    const container = document.querySelector('#suppListContainer');
    if (!container) return;

    try {
      const type = listState.activeTab;
      const search = listState.search;
      const category = listState.category;

      let url = `/api/supplement-programs?type=${encodeURIComponent(type)}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (category && category !== 'all') url += `&category=${encodeURIComponent(category)}`;

      const list = await api(url);

      // Update badge counts
      if (type === 'template') {
        const badge = document.querySelector('#templateCountBadge');
        if (badge) badge.textContent = fa(list.length);
      } else {
        const badge = document.querySelector('#studentCountBadge');
        if (badge) badge.textContent = fa(list.length);
      }

      if (list.length === 0) {
        container.innerHTML = `
          <div class="supp-empty-state-box" style="margin-top: 20px;">
            <div class="supp-empty-state-text">
              ${listState.search ? 'برنامه‌ای با عبارت جستجو شده یافت نشد.' : 'هنوز هیچ برنامه مکملی در این بخش ثبت نشده است.'}
            </div>
            <button class="btn-supp-green" id="btnEmptyStateNewProg" type="button">
              افزودن نمونه برنامه مکمل +
            </button>
          </div>
        `;
        const btn = container.querySelector('#btnEmptyStateNewProg');
        if (btn) btn.onclick = () => window.goToRoute('افزودن نمونه برنامه مکمل', '/programs/supplement/form');
        return;
      }

      container.innerHTML = `
        <div class="supp-grid">
          ${list.map(prog => `
            <div class="supp-card" data-id="${prog.id}">
              <div class="supp-card-header">
                <div>
                  <h3 class="supp-card-title">${esc(prog.title)}</h3>
                  <span class="supp-card-category">${esc(prog.category_fa || prog.category)}</span>
                  ${prog.student_name ? `<span class="supp-item-chip" style="margin-right:6px;">👤 شاگرد: ${esc(prog.student_name)}</span>` : ''}
                </div>
                <span class="supp-tab-count">${fa(prog.items_count || 0)} مکمل</span>
              </div>

              ${prog.description ? `<p class="supp-card-desc">${esc(prog.description)}</p>` : ''}

              <div class="supp-card-footer">
                <div class="supp-card-actions">
                  <button class="btn-supp-primary btn-edit-prog" data-id="${prog.id}" type="button" style="padding: 6px 14px; font-size: 12px;">
                    ✏️ ویرایش
                  </button>
                  <button class="btn-supp-ai btn-ai-prog" data-id="${prog.id}" type="button" style="padding: 6px 12px; font-size: 12px;">
                    ✨ تحلیل AI
                  </button>
                </div>
                <button class="btn-supp-icon btn-danger btn-del-prog" data-id="${prog.id}" data-title="${esc(prog.title)}" type="button" title="حذف برنامه">
                  🗑️
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Bind card actions
      container.querySelectorAll('.btn-edit-prog').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          window.goToRoute('ویرایش برنامه مکمل', `/programs/supplement/form?id=${id}`);
        };
      });

      container.querySelectorAll('.btn-ai-prog').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          try {
            const prog = await api(`/api/supplement-programs/${id}`);
            const analysis = await api('/api/supplement-programs/analyze-ai', {
              method: 'POST',
              body: JSON.stringify(prog)
            });
            openAIAnalysisModal(analysis);
          } catch (e) {
            showToast('خطا در تحلیل هوشمند: ' + e.message, 'error');
          }
        };
      });

      container.querySelectorAll('.btn-del-prog').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.id;
          const title = btn.dataset.title;
          if (confirm(`آیا از حذف برنامه مکمل «${title}» اطمینان دارید؟`)) {
            try {
              await api(`/api/supplement-programs/${id}`, { method: 'DELETE' });
              showToast('برنامه مکمل با موفقیت حذف شد.', 'success');
              loadAndRenderList();
            } catch (e) {
              showToast('خطا در حذف برنامه: ' + e.message, 'error');
            }
          }
        };
      });

    } catch (err) {
      container.innerHTML = `<div class="supp-empty-state-box"><div class="supp-empty-state-text" style="color:var(--danger);">خطا در دریافت لیست: ${esc(err.message)}</div></div>`;
    }
  }

  // Export functions to global window object
  window.renderSupplementProgramsList = renderSupplementProgramsList;
  window.renderSupplementProgramBuilder = renderSupplementProgramBuilder;
  window.openGridSelectorModal = openGridSelectorModal;
  window.openDetailEditModal = openDetailEditModal;
})();
