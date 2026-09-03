/**
 * Yasnafit — Diet Programs Module (برنامه‌های غذایی)
 * Comprehensive Diet Program Management, Interactive Meal Builder & AI Nutrition Analysis
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

  const DIET_OPTIONS = [
    { id: 'none', label: 'بدون محدودیت' },
    { id: 'vegetarian', label: 'گیاه‌خواری' },
    { id: 'vegan', label: 'وگان' },
    { id: 'celiac', label: 'سلیاک' },
    { id: 'lactose_intolerance', label: 'حساسیت به لاکتوز' },
    { id: 'gout', label: 'نقرس' },
    { id: 'low_carb', label: 'لوکرب' },
    { id: 'ketogenic', label: 'کتوژنیک' },
    { id: 'fasting', label: 'فستینگ' },
    { id: 'professional', label: 'حرفه‌ای' },
    { id: 'competition', label: 'مسابقه ای' }
  ];

  const MEAL_NAME_OPTIONS = [
    'صبحانه',
    'میان‌عده بین صبحانه و ناهار',
    'ناهار',
    'وعده قبل تمرین',
    'میان‌وعده عصر ۱',
    'میان‌وعده عصر ۲',
    'وعده بعد تمرین',
    'شام',
    'وعده قبل از خواب'
  ];

  const TIME_OPTIONS = [
    '05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
    '21:00', '21:30', '22:00', '22:30', '23:00', '23:30'
  ];

  const QUICK_PRESETS = {
    three_meals: {
      label: 'سه وعده نرمال',
      meals: [
        { meal_name: 'صبحانه', ratio: 0.30, start_time: '08:00', end_time: '08:30', notes: 'منابع غنی پروتئین، جو دوسر و میوه تازه' },
        { meal_name: 'ناهار', ratio: 0.40, start_time: '13:30', end_time: '14:30', notes: 'پروتئین کامل (مرغ/گوشت/ماهی) + غلات کامل و سالاد' },
        { meal_name: 'شام', ratio: 0.30, start_time: '20:30', end_time: '21:00', notes: 'پروتئین زودهضم و سالاد با روغن زیتون' }
      ]
    },
    five_meals: {
      label: 'پنج وعده با میان‌وعده',
      meals: [
        { meal_name: 'صبحانه', ratio: 0.25, start_time: '07:30', end_time: '08:00', notes: 'تخم مرغ، جو دوسر و میوه' },
        { meal_name: 'میان‌عده بین صبحانه و ناهار', ratio: 0.10, start_time: '10:30', end_time: '11:00', notes: 'مغزها، میوه یا میان‌وعده پروتئینی' },
        { meal_name: 'ناهار', ratio: 0.35, start_time: '13:30', end_time: '14:30', notes: 'مرغ/ماهی با برنج قهوه‌ای و سبزیجات' },
        { meal_name: 'میان‌وعده عصر ۱', ratio: 0.10, start_time: '17:00', end_time: '17:30', notes: 'ماست یونانی یا نان تست جو با کره بادام زمینی' },
        { meal_name: 'شام', ratio: 0.20, start_time: '20:30', end_time: '21:00', notes: 'سوپ، سبزیجات بخارپز و پروتئین کم‌چرب' }
      ]
    },
    seven_meals: {
      label: 'هفت وعده حرفه‌ای',
      meals: [
        { meal_name: 'صبحانه', ratio: 0.20, start_time: '07:00', end_time: '07:30', notes: 'صبحانه کامل پرپروتئین' },
        { meal_name: 'میان‌عده بین صبحانه و ناهار', ratio: 0.10, start_time: '10:00', end_time: '10:30', notes: 'میوه تازه و بادام خام' },
        { meal_name: 'ناهار', ratio: 0.25, start_time: '13:00', end_time: '13:45', notes: 'وعده اصلی متوازن' },
        { meal_name: 'وعده قبل تمرین', ratio: 0.10, start_time: '16:30', end_time: '17:00', notes: 'کربوهیدرات زودجذب و قهوه' },
        { meal_name: 'وعده بعد تمرین', ratio: 0.15, start_time: '18:45', end_time: '19:15', notes: 'شیک پروتئین یا فیله مرغ با سیب‌زمینی' },
        { meal_name: 'شام', ratio: 0.15, start_time: '21:00', end_time: '21:30', notes: 'پروتئین با چربی‌های مفید' },
        { meal_name: 'وعده قبل از خواب', ratio: 0.05, start_time: '23:00', end_time: '23:30', notes: 'کازئین یا پنیر کاتیج برای ریکاوری شبانه' }
      ]
    }
  };

  // ==============================================================
  // 1. Diet Programs Main List View
  // ==============================================================
  let listState = {
    activeTab: 'student', // 'student' | 'template'
    search: '',
    restriction: 'all'
  };

  async function renderDietProgramsList(label, route) {
    document.querySelector('#breadcrumb').textContent = label || 'برنامه‌های غذایی';
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === '/programs/diet/list'));

    const content = document.querySelector('#content');
    content.innerHTML = `
      <div class="diet-page">
        <header class="diet-page-head">
          <div class="diet-head-title">
            <p class="eyebrow">مدیریت تغذیه و رژیم‌های غذایی</p>
            <h1>برنامه‌های غذایی</h1>
            <p>طراحی، بالانس کالری و مدیریت برنامه‌های غذایی شاگردان و نمونه‌های آماده</p>
          </div>
          <div class="diet-head-actions">
            <button type="button" class="btn btn-success btn-add-diet" id="btnNewDietProg">
              ＋ افزودن نمونه برنامه
            </button>
          </div>
        </header>

        <!-- Tabs Navigation -->
        <div class="diet-tabs-nav">
          <button type="button" class="diet-tab-btn ${listState.activeTab === 'student' ? 'active' : ''}" data-diet-tab="student">
            👥 برنامه‌های غذایی شاگردان من
          </button>
          <button type="button" class="diet-tab-btn ${listState.activeTab === 'template' ? 'active' : ''}" data-diet-tab="template">
            📋 نمونه برنامه‌های غذایی من
          </button>
        </div>

        <!-- Filter & Search Bar -->
        <div class="diet-filter-toolbar">
          <div class="diet-search-box">
            <span>🔍</span>
            <input type="text" id="dietSearchInput" placeholder="جستجو در عنوان برنامه یا نام شاگرد…" value="${esc(listState.search)}">
          </div>
          <select id="dietRestrictionFilter" class="diet-select-filter">
            <option value="all">همه محدودیت‌ها</option>
            ${DIET_OPTIONS.map(opt => `<option value="${opt.id}" ${listState.restriction === opt.id ? 'selected' : ''}>${esc(opt.label)}</option>`).join('')}
          </select>
        </div>

        <!-- List Container -->
        <div id="dietProgramsListContainer" class="diet-list-wrap">
          <div class="loading-state"><span class="spinner"></span><p>در حال دریافت برنامه‌های غذایی…</p></div>
        </div>
      </div>
    `;

    document.getElementById('btnNewDietProg').onclick = () => {
      location.href = '/programs/diet/form';
    };

    // Bind Tabs
    content.querySelectorAll('[data-diet-tab]').forEach(btn => {
      btn.onclick = () => {
        listState.activeTab = btn.dataset.dietTab;
        renderDietProgramsList(label, route);
      };
    });

    // Bind Search & Filter
    let searchTimer;
    document.getElementById('dietSearchInput').oninput = e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        listState.search = e.target.value.trim();
        loadDietPrograms();
      }, 300);
    };

    document.getElementById('dietRestrictionFilter').onchange = e => {
      listState.restriction = e.target.value;
      loadDietPrograms();
    };

    await loadDietPrograms();
  }

  async function loadDietPrograms() {
    const host = document.getElementById('dietProgramsListContainer');
    if (!host) return;

    try {
      const query = new URLSearchParams({
        type: listState.activeTab,
        search: listState.search,
        diet_restriction: listState.restriction
      });

      const list = await api(`/api/diet-programs?${query}`);
      if (!list || list.length === 0) {
        host.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🥗</div>
            <h3>هنوز برنامه غذایی در این بخش ثبت نشده است</h3>
            <p>یک برنامه غذایی جدید با ساختار هم‌تراز کالری، بالانس وعده‌ها و تحلیل هوش مصنوعی بسازید.</p>
            <button type="button" class="btn btn-success" data-goto-diet-form>＋ ساخت برنامه غذایی</button>
          </div>
        `;
        host.querySelector('[data-goto-diet-form]').onclick=()=>{ location.href='/programs/diet/form'; };
        return;
      }

      host.innerHTML = `
        <div class="diet-cards-grid">
          ${list.map(p => `
            <article class="diet-program-card">
              <header class="diet-card-head">
                <div class="diet-card-title-group">
                  <h3>${esc(p.title)}</h3>
                  <span class="diet-restriction-badge">🥗 ${esc(p.diet_restriction_fa || 'بدون محدودیت')}</span>
                </div>
                <div class="diet-cal-badge">
                  <b>${Number(p.total_calories || 2000).toLocaleString('fa-IR')}</b>
                  <small>کالری کل</small>
                </div>
              </header>

              <div class="diet-card-body">
                ${p.description ? `<p class="diet-card-desc">${esc(p.description)}</p>` : '<p class="diet-card-desc muted">بدون توضیحات تکمیلی</p>'}
                <div class="diet-card-meta">
                  <span>🍽️ <b>${Number(p.meals_count || 0).toLocaleString('fa-IR')}</b> وعده غذایی</span>
                  <span>👤 ${p.student_name ? `${esc(p.student_name)} (پرونده ${esc(p.student_case_number || '—')})` : '<b class="sample-tag">نمونه آماده</b>'}</span>
                  <span>📅 ${new Date(p.created_at).toLocaleDateString('fa-IR')}</span>
                </div>
              </div>

              <footer class="diet-card-foot">
                <button type="button" class="btn btn-secondary btn-small" data-view-diet="${p.id}">👁 مشاهده وعده‌ها</button>
                <button type="button" class="btn btn-primary btn-small" data-edit-diet="${p.id}">✏️ ویرایش</button>
                <button type="button" class="btn btn-secondary btn-small" data-ai-diet="${p.id}" title="تحلیل هوش مصنوعی">✨ تحلیل AI</button>
                <button type="button" class="btn btn-danger btn-small" data-del-diet="${p.id}">🗑 حذف</button>
              </footer>
            </article>
          `).join('')}
        </div>
      `;

      // Bind Actions
      host.querySelectorAll('[data-view-diet]').forEach(b => {
        b.onclick = () => openDietViewModal(Number(b.dataset.viewDiet));
      });

      host.querySelectorAll('[data-edit-diet]').forEach(b => {
        b.onclick = () => { location.href = `/programs/diet/form?id=${b.dataset.editDiet}`; };
      });

      host.querySelectorAll('[data-ai-diet]').forEach(b => {
        b.onclick = () => openAIAnalysisModal(Number(b.dataset.aiDiet));
      });

      host.querySelectorAll('[data-del-diet]').forEach(b => {
        b.onclick = async () => {
          const id = b.dataset.delDiet;
          if (confirm('آیا از حذف این برنامه غذایی اطمینان دارید؟')) {
            b.disabled = true;
            try {
              await api(`/api/diet-programs/${id}`, { method: 'DELETE' });
              if (window.toast) window.toast('برنامه غذایی با موفقیت حذف شد.', 'success');
              loadDietPrograms();
            } catch (err) {
              alert('خطا در حذف برنامه: ' + err.message);
              b.disabled = false;
            }
          }
        };
      });

    } catch (err) {
      host.innerHTML = `<div class="error-state"><h3>خطا در بارگذاری برنامه‌های غذایی</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  // ==============================================================
  // 2. Diet Program Form & Interactive Meals Builder
  // ==============================================================
  let builderState = {
    programId: null,
    title: '',
    dietRestriction: 'none',
    description: '',
    studentId: null,
    totalCalories: 2000,
    isConfirmedCalories: false,
    meals: [],
    editingMealIdx: null
  };

  async function renderDietProgramBuilder(label, route) {
    const urlParams = new URLSearchParams(location.search);
    const editId = urlParams.get('id') ? Number(urlParams.get('id')) : null;

    document.querySelector('#breadcrumb').textContent = editId ? 'ویرایش برنامه غذایی' : 'طراحی و ثبت برنامه غذایی';
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === '/programs/diet/list'));

    builderState = {
      programId: editId,
      title: '',
      dietRestriction: 'none',
      description: '',
      studentId: null,
      totalCalories: 2000,
      isConfirmedCalories: true,
      meals: [],
      editingMealIdx: null
    };

    const content = document.querySelector('#content');
    content.innerHTML = `
      <div class="diet-builder-page">
        <header class="diet-builder-hero">
          <div class="diet-builder-head-text">
            <a href="/programs/diet/list" class="review-back" title="بازگشت">→</a>
            <div>
              <p class="eyebrow">${editId ? 'ویرایش و اصلاح برنامه' : 'طراحی نمونه برنامه جدید'}</p>
              <h1>${editId ? 'ویرایش برنامه غذایی' : 'طراحی و ثبت برنامه غذایی'}</h1>
              <p>تعیین کالری کل، انتخاب ساختار وعده‌ها، و بالانس لحظه‌ای انرژی</p>
            </div>
          </div>
          <div class="diet-builder-top-actions">
            <button type="button" class="btn btn-secondary" id="btnAiAnalyzeDiet">✨ تحلیل هوشمند با هوش مصنوعی</button>
            <button type="button" class="btn btn-primary" id="btnSaveDietProgram" disabled>💾 ثبت و ذخیره برنامه غذایی</button>
          </div>
        </header>

        <!-- Main Form Section (فاز ۱: اطلاعات اصلی) -->
        <section class="diet-form-card">
          <header class="diet-form-card-head">
            <span class="card-icon-badge">📋</span>
            <h2>۱. اطلاعات و مشخصات کلی برنامه غذایی</h2>
          </header>
          <div class="diet-form-card-body">
            <div class="diet-form-grid">
              <label class="field-control wide">
                <span>عنوان نمونه برنامه *</span>
                <input type="text" id="dietProgTitle" placeholder="مثلاً: برنامه کتوژنیک هایپرتروفی ۲۲۰۰ کالری…" value="">
              </label>

              <label class="field-control">
                <span>محدودیت غذایی *</span>
                <select id="dietProgRestriction">
                  ${DIET_OPTIONS.map(opt => `<option value="${opt.id}">${esc(opt.label)}</option>`).join('')}
                </select>
              </label>

              <label class="field-control">
                <span>اختصاص به شاگرد (اختیاری)</span>
                <select id="dietProgStudent">
                  <option value="">بدون شاگرد (ذخیره به عنوان نمونه برنامه)</option>
                </select>
              </label>

              <label class="field-control wide">
                <span>توضیحات و راهنمای مربی</span>
                <textarea id="dietProgDesc" rows="3" placeholder="توضیحات کلی، توصیه‌های مصرف آب، زمان‌بندی مکمل‌ها و نکات اختصاصی…"></textarea>
              </label>

              <!-- Total Calories Field with Confirm Button -->
              <div class="diet-calorie-target-wrap wide">
                <div class="calorie-input-row">
                  <label class="field-control" style="flex:1;">
                    <span>🔥 کالری کل برنامه (مجموع انرژی روزانه) *</span>
                    <input type="number" id="dietTotalCaloriesInput" min="500" max="15000" step="50" value="2000">
                  </label>
                  <button type="button" class="btn btn-primary btn-confirm-cal" id="btnConfirmCalories">
                    ✓ تأیید کالری
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Meals Section (فاز ۲: ثبت وعده‌ها و اعتبارسنجی) -->
        <section class="diet-form-card" style="margin-top:16px;">
          <header class="diet-form-card-head">
            <span class="card-icon-badge icon-food">🍽️</span>
            <h2>۲. ثبت و زمان‌بندی وعده‌های غذایی</h2>
            <div class="diet-target-display-pill" id="dietTargetDisplayPill">
              🔥 کالری انتخابی برنامه: <b id="displayTargetCalories">۲,۰۰۰</b> کالری
            </div>
          </header>

          <div class="diet-form-card-body">
            <!-- Info Alert Bar (آبی) -->
            <div class="diet-info-alert">
              <span>ℹ️</span>
              <p>دقت کنید که مجموع کالری وعده‌ها، باید هم‌اندازه کالری کل انتخابی برای برنامه باشد.</p>
            </div>

            <!-- Quick Select Preset Chips -->
            <div class="diet-presets-bar">
              <span class="presets-label">⚡ تگ‌های پیشنهادی سریع:</span>
              <div class="presets-chips">
                <button type="button" class="preset-chip" data-preset="three_meals">🔘 سه وعده نرمال</button>
                <button type="button" class="preset-chip" data-preset="five_meals">🔘 پنج وعده با میان‌وعده</button>
                <button type="button" class="preset-chip" data-preset="seven_meals">🔘 هفت وعده حرفه‌ای</button>
              </div>
            </div>

            <!-- Add / Edit Meal Input Bar -->
            <div class="meal-input-bar">
              <h4 id="mealInputBarTitle">＋ افزودن وعده غذایی جدید:</h4>
              <div class="meal-inputs-grid">
                <label class="field-control">
                  <span>نام وعده *</span>
                  <select id="inputMealName">
                    ${MEAL_NAME_OPTIONS.map(m => `<option value="${m}">${m}</option>`).join('')}
                  </select>
                </label>

                <label class="field-control">
                  <span>میزان کالری *</span>
                  <select id="inputMealCalories">
                    ${[100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1500].map(c => `
                      <option value="${c}" ${c === 300 ? 'selected' : ''}>${c.toLocaleString('fa-IR')} کالری</option>
                    `).join('')}
                  </select>
                </label>

                <label class="field-control">
                  <span>ساعت شروع (اختیاری)</span>
                  <select id="inputMealStart">
                    <option value="">نامشخص</option>
                    ${TIME_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('')}
                  </select>
                </label>

                <label class="field-control">
                  <span>ساعت پایان (اختیاری)</span>
                  <select id="inputMealEnd">
                    <option value="">نامشخص</option>
                    ${TIME_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join('')}
                  </select>
                </label>

                <label class="field-control wide">
                  <span>اقلام غذایی و توضیحات وعده (اختیاری)</span>
                  <input type="text" id="inputMealNotes" placeholder="مثلاً: ۳ عدد سفیده تخم‌مرغ + ۵۰ گرم جو دوسر + ۱ قاشق عسل…">
                </label>
              </div>

              <div class="meal-input-actions">
                <button type="button" class="btn btn-secondary btn-small" id="btnCancelEditMeal" style="display:none;">انصراف از ویرایش</button>
                <button type="button" class="btn btn-primary" id="btnAddMealBtn">＋ افزودن این وعده</button>
              </div>
            </div>

            <!-- Real-time Validation Bar -->
            <div id="dietValidationAlert" class="diet-validation-bar"></div>

            <!-- Registered Meals List -->
            <div class="registered-meals-section">
              <div class="meals-list-header">
                <h3>لیست وعده‌های ثبت‌شده:</h3>
                <span id="registeredMealsCount" class="meals-count-tag">۰ وعده</span>
              </div>
              <div id="registeredMealsList" class="registered-meals-grid">
                <div class="meals-empty-box">هنوز وعده‌ای اضافه نشده است. از گزینه‌های بالا یک وعده اضافه فرمایید.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    // Load Students for dropdown
    try {
      const stData = await api('/api/students?view=management&page_size=100');
      const studentSel = document.getElementById('dietProgStudent');
      if (studentSel && stData.items) {
        stData.items.forEach(st => {
          const opt = document.createElement('option');
          opt.value = String(st.id);
          opt.textContent = `${st.full_name} (پرونده ${st.case_number || '—'})`;
          studentSel.appendChild(opt);
        });
      }
    } catch (e) {}

    // If Editing, load existing program
    if (editId) {
      try {
        const prog = await api(`/api/diet-programs/${editId}`);
        builderState.programId = editId;
        builderState.title = prog.title || '';
        builderState.dietRestriction = prog.diet_restriction || 'none';
        builderState.description = prog.description || '';
        builderState.studentId = prog.student_id || null;
        builderState.totalCalories = Number(prog.total_calories || 2000);
        builderState.meals = (prog.meals || []).map(m => ({
          meal_name: m.meal_name,
          calories: Number(m.calories),
          start_time: m.start_time || '',
          end_time: m.end_time || '',
          notes: m.notes || ''
        }));

        document.getElementById('dietProgTitle').value = builderState.title;
        document.getElementById('dietProgRestriction').value = builderState.dietRestriction;
        document.getElementById('dietProgDesc').value = builderState.description;
        if (builderState.studentId) document.getElementById('dietProgStudent').value = String(builderState.studentId);
        document.getElementById('dietTotalCaloriesInput').value = builderState.totalCalories;
      } catch (e) {
        alert('خطا در بارگذاری برنامه غذایی: ' + e.message);
      }
    } else {
      const paramStudentId = urlParams.get('student_id');
      if (paramStudentId && document.getElementById('dietProgStudent')) {
        document.getElementById('dietProgStudent').value = String(paramStudentId);
        builderState.studentId = Number(paramStudentId);
      }
    }

    // Bind Calorie Target Confirm
    const updateTargetDisplay = () => {
      const val = Number(document.getElementById('dietTotalCaloriesInput').value) || 2000;
      builderState.totalCalories = val;
      document.getElementById('displayTargetCalories').textContent = val.toLocaleString('fa-IR');
      renderMealsList();
    };

    document.getElementById('btnConfirmCalories').onclick = updateTargetDisplay;
    document.getElementById('dietTotalCaloriesInput').onchange = updateTargetDisplay;

    // Bind Quick Preset Chips
    content.querySelectorAll('[data-preset]').forEach(btn => {
      btn.onclick = () => {
        const presetKey = btn.dataset.preset;
        const preset = QUICK_PRESETS[presetKey];
        if (!preset) return;

        const targetCal = builderState.totalCalories || 2000;
        let runningSum = 0;

        builderState.meals = preset.meals.map((pMeal, idx) => {
          let mCal = 0;
          if (idx === preset.meals.length - 1) {
            mCal = targetCal - runningSum;
          } else {
            mCal = Math.round((targetCal * pMeal.ratio) / 50) * 50;
            runningSum += mCal;
          }
          return {
            meal_name: pMeal.meal_name,
            calories: mCal,
            start_time: pMeal.start_time,
            end_time: pMeal.end_time,
            notes: pMeal.notes
          };
        });

        renderMealsList();
      };
    });

    // Bind Add / Edit Meal Button
    document.getElementById('btnAddMealBtn').onclick = () => {
      const mealName = document.getElementById('inputMealName').value;
      const calories = Number(document.getElementById('inputMealCalories').value) || 100;
      const startTime = document.getElementById('inputMealStart').value;
      const endTime = document.getElementById('inputMealEnd').value;
      const notes = document.getElementById('inputMealNotes').value.trim();

      const newMeal = {
        meal_name: mealName,
        calories,
        start_time: startTime || null,
        end_time: endTime || null,
        notes
      };

      if (builderState.editingMealIdx != null) {
        builderState.meals[builderState.editingMealIdx] = newMeal;
        builderState.editingMealIdx = null;
        document.getElementById('mealInputBarTitle').textContent = '＋ افزودن وعده غذایی جدید:';
        document.getElementById('btnAddMealBtn').textContent = '＋ افزودن این وعده';
        document.getElementById('btnCancelEditMeal').style.display = 'none';
      } else {
        builderState.meals.push(newMeal);
      }

      document.getElementById('inputMealNotes').value = '';
      renderMealsList();
    };

    document.getElementById('btnCancelEditMeal').onclick = () => {
      builderState.editingMealIdx = null;
      document.getElementById('mealInputBarTitle').textContent = '＋ افزودن وعده غذایی جدید:';
      document.getElementById('btnAddMealBtn').textContent = '＋ افزودن این وعده';
      document.getElementById('btnCancelEditMeal').style.display = 'none';
      document.getElementById('inputMealNotes').value = '';
    };

    // Bind AI Analysis Button
    document.getElementById('btnAiAnalyzeDiet').onclick = () => {
      openAIAnalysisFromCurrentForm();
    };

    // Bind Save Button
    document.getElementById('btnSaveDietProgram').onclick = async () => {
      const title = document.getElementById('dietProgTitle').value.trim();
      if (!title) {
        alert('لطفاً عنوان برنامه غذایی را وارد فرمایید.');
        document.getElementById('dietProgTitle').focus();
        return;
      }

      const dietRestriction = document.getElementById('dietProgRestriction').value;
      const description = document.getElementById('dietProgDesc').value.trim();
      const studentId = document.getElementById('dietProgStudent').value ? Number(document.getElementById('dietProgStudent').value) : null;
      const totalCalories = builderState.totalCalories;

      const payload = {
        title,
        diet_restriction: dietRestriction,
        description,
        student_id: studentId,
        total_calories: totalCalories,
        status: studentId ? 'ACTIVE' : 'DRAFT',
        notify_student: Boolean(studentId),
        meals: builderState.meals
      };

      const btn = document.getElementById('btnSaveDietProgram');
      btn.disabled = true;
      btn.textContent = 'در حال ذخیره…';

      try {
        let res;
        if (builderState.programId) {
          res = await api(`/api/diet-programs/${builderState.programId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          if (window.toast) window.toast(studentId ? 'برنامه غذایی بروزرسانی شد و در پنل شاگرد قرار گرفت.' : 'برنامه غذایی با موفقیت ویرایش شد.', 'success');
        } else {
          res = await api('/api/diet-programs', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (window.toast) window.toast(studentId ? 'برنامه غذایی برای شاگرد ثبت شد و به پنل شاگرد منتقل گردید.' : 'برنامه غذایی با موفقیت ثبت شد.', 'success');
        }

        location.href = '/programs/diet/list';
      } catch (err) {
        alert('خطا در ذخیره برنامه: ' + err.message);
        btn.disabled = false;
        btn.textContent = '💾 ثبت و ذخیره برنامه غذایی';
      }
    };

    renderMealsList();
  }

  function renderMealsList() {
    const listHost = document.getElementById('registeredMealsList');
    const valBar = document.getElementById('dietValidationAlert');
    const saveBtn = document.getElementById('btnSaveDietProgram');
    const countTag = document.getElementById('registeredMealsCount');
    if (!listHost || !valBar) return;

    const meals = builderState.meals || [];
    const targetCal = Number(builderState.totalCalories) || 2000;
    const currentSum = meals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
    const diff = targetCal - currentSum;

    if (countTag) {
      countTag.textContent = `${meals.length.toLocaleString('fa-IR')} وعده`;
    }

    // Real-time Validation Bar Rendering
    if (meals.length === 0) {
      valBar.className = 'diet-validation-bar warning';
      valBar.innerHTML = `⚠️ هنوز وعده‌ای ثبت نشده است. لطفاً وعده‌ها را ثبت کنید تا مجموع کالری با کالری کل (${targetCal.toLocaleString('fa-IR')} کالری) برابر شود.`;
      if (saveBtn) saveBtn.disabled = true;
    } else if (currentSum === targetCal) {
      valBar.className = 'diet-validation-bar success';
      valBar.innerHTML = `✓ مجموع کالری وعده‌ها (${currentSum.toLocaleString('fa-IR')} کالری) کاملاً با کالری انتخابی برنامه هم‌تراز است. برنامه آماده ثبت است.`;
      if (saveBtn) saveBtn.disabled = false;
    } else {
      valBar.className = 'diet-validation-bar danger';
      const signText = diff > 0 ? `${diff.toLocaleString('fa-IR')} کالری کمبود نسبت به کالری انتخابی` : `${Math.abs(diff).toLocaleString('fa-IR')} کالری بیش از حد مجاز`;
      valBar.innerHTML = `⚠️ مجموع کالری وعده‌ها: <b>${currentSum.toLocaleString('fa-IR')} کالری</b> | <b>${signText} (${targetCal.toLocaleString('fa-IR')} کالری)</b>. لطفاً کالری وعده‌ها را اصلاح کنید.`;
      if (saveBtn) saveBtn.disabled = true;
    }

    if (meals.length === 0) {
      listHost.innerHTML = `<div class="meals-empty-box">هنوز وعده‌ای اضافه نشده است. از گزینه‌های بالا یک وعده اضافه فرمایید.</div>`;
      return;
    }

    listHost.innerHTML = meals.map((m, idx) => {
      const timeBadge = m.start_time ? `<span class="meal-time-badge">⏰ ${esc(m.start_time)}${m.end_time ? ' تا ' + esc(m.end_time) : ''}</span>` : '';
      const percent = targetCal > 0 ? Math.round((Number(m.calories) / targetCal) * 100) : 0;
      return `
        <article class="registered-meal-card">
          <div class="meal-card-right">
            <div class="meal-card-num">${(idx + 1).toLocaleString('fa-IR')}</div>
            <div class="meal-card-info">
              <div class="meal-card-head-line">
                <b class="meal-card-name">${esc(m.meal_name)}</b>
                ${timeBadge}
              </div>
              ${m.notes ? `<p class="meal-card-notes">${esc(m.notes)}</p>` : ''}
            </div>
          </div>
          <div class="meal-card-left">
            <div class="meal-card-cal-pill">
              <b>${Number(m.calories).toLocaleString('fa-IR')}</b>
              <small>کالری (${percent}٪)</small>
            </div>
            <div class="meal-card-actions">
              <button type="button" class="btn-icon" data-edit-meal-idx="${idx}" title="ویرایش این وعده">✏️</button>
              <button type="button" class="btn-icon btn-del-meal" data-del-meal-idx="${idx}" title="حذف این وعده">🗑</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Bind Edit / Delete Meal Actions
    listHost.querySelectorAll('[data-edit-meal-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.editMealIdx);
        const m = builderState.meals[idx];
        if (!m) return;

        builderState.editingMealIdx = idx;
        document.getElementById('inputMealName').value = m.meal_name;
        document.getElementById('inputMealCalories').value = m.calories;
        document.getElementById('inputMealStart').value = m.start_time || '';
        document.getElementById('inputMealEnd').value = m.end_time || '';
        document.getElementById('inputMealNotes').value = m.notes || '';

        document.getElementById('mealInputBarTitle').textContent = `✏️ ویرایش وعده شماره ${(idx + 1).toLocaleString('fa-IR')} (${m.meal_name}):`;
        document.getElementById('btnAddMealBtn').textContent = '✓ ثبت تغییرات این وعده';
        document.getElementById('btnCancelEditMeal').style.display = 'inline-flex';
        document.getElementById('inputMealName').focus();
      };
    });

    listHost.querySelectorAll('[data-del-meal-idx]').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.delMealIdx);
        builderState.meals.splice(idx, 1);
        renderMealsList();
      };
    });
  }

  // ==============================================================
  // 3. AI Nutrition Analysis Modal
  // ==============================================================
  async function openAIAnalysisFromCurrentForm() {
    const title = document.getElementById('dietProgTitle')?.value || 'برنامه غذایی جاری';
    const dietRestriction = document.getElementById('dietProgRestriction')?.value || 'none';
    const totalCalories = builderState.totalCalories || 2000;
    const meals = builderState.meals || [];

    if (meals.length === 0) {
      alert('لطفاً ابتدا حداقل یک یا چند وعده غذایی ثبت نمایید تا هوش مصنوعی بتواند ساختار برنامه را تحلیل کند.');
      return;
    }

    openAIAnalysisModalCore({
      title,
      diet_restriction: dietRestriction,
      total_calories: totalCalories,
      meals
    });
  }

  async function openAIAnalysisModal(programId) {
    try {
      const prog = await api(`/api/diet-programs/${programId}`);
      openAIAnalysisModalCore(prog);
    } catch (err) {
      alert('خطا در دریافت اطلاعات برنامه: ' + err.message);
    }
  }

  async function openAIAnalysisModalCore(dietData) {
    let modal = document.getElementById('dietAiModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dietAiModal';
      modal.className = 'ai-modal-overlay';
      document.body.appendChild(modal);
    }

    const restrictionFa = DIET_OPTIONS.find(o => o.id === dietData.diet_restriction)?.label || dietData.diet_restriction || 'بدون محدودیت';

    modal.innerHTML = `
      <div class="ai-modal-dialog" role="dialog" aria-modal="true" style="max-width:860px;">
        <header class="ai-modal-header">
          <h3>✨ تحلیل هوشمند و ارزیابی متابولیک برنامه غذایی با هوش مصنوعی</h3>
          <button type="button" class="btn-icon" id="closeDietAiModalX" title="بستن">×</button>
        </header>

        <div class="ai-modal-body">
          <!-- Top Overview Badges -->
          <div class="diet-modal-kpi-row">
            <div class="diet-modal-kpi">
              <span>عنوان برنامه</span>
              <b>${esc(dietData.title || 'برنامه غذایی')}</b>
            </div>
            <div class="diet-modal-kpi">
              <span>محدودیت غذایی</span>
              <b style="color:var(--accent-hover);">🥗 ${esc(restrictionFa)}</b>
            </div>
            <div class="diet-modal-kpi">
              <span>کالری کل</span>
              <b style="color:var(--success);">🔥 ${Number(dietData.total_calories || 2000).toLocaleString('fa-IR')} kcal</b>
            </div>
            <div class="diet-modal-kpi">
              <span>تعداد وعده‌ها</span>
              <b>🍽️ ${(dietData.meals || []).length.toLocaleString('fa-IR')} وعده</b>
            </div>
          </div>

          <!-- Loading Indicator -->
          <div id="dietAiLoading" class="loading-state" style="padding:24px 0;">
            <span class="spinner"></span>
            <p>در حال فراخوانی مدل هوش مصنوعی، محاسبه دقیق درشت‌مغذی‌ها و استخراج ایده‌های غذایی…</p>
          </div>

          <!-- Output Container -->
          <div id="dietAiResultContent" style="display:none;display:flex;flex-direction:column;gap:14px;"></div>
        </div>

        <footer class="ai-modal-footer">
          <button type="button" class="secondary" id="closeDietAiModalBtn">بستن</button>
          <button type="button" class="btn btn-secondary" id="btnCopyDietAiReport">📋 کپی گزارش کامل</button>
        </footer>
      </div>
    `;

    modal.hidden = false;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const close = () => {
      modal.hidden = true;
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };

    document.getElementById('closeDietAiModalX').onclick = close;
    document.getElementById('closeDietAiModalBtn').onclick = close;

    const loadingHost = document.getElementById('dietAiLoading');
    const resultHost = document.getElementById('dietAiResultContent');
    const copyBtn = document.getElementById('btnCopyDietAiReport');

    let fullReportText = '';

    try {
      const res = await api('/api/diet-programs/analyze-ai', {
        method: 'POST',
        body: JSON.stringify(dietData)
      });

      loadingHost.style.display = 'none';
      resultHost.style.display = 'flex';

      const macros = res.macros || { proteinPercent: 30, proteinGrams: 150, carbPercent: 45, carbGrams: 225, fatPercent: 25, fatGrams: 55 };
      const mealIdeas = res.mealIdeas || [];
      const cautions = res.cautions || [];

      fullReportText = `گزارش تحلیل هوشمند برنامه غذایی (${res.title}):
- محدودیت: ${res.restriction}
- کالری کل: ${Number(res.totalCalories).toLocaleString('fa-IR')} کالری

۱. تحلیل تناسب و ساختار:
${res.fitAnalysis || '—'}

۲. تخمین درشت‌مغذی‌ها (ماکروها):
• پروتئین: ${macros.proteinPercent}٪ (${macros.proteinGrams} گرم)
• کربوهیدرات: ${macros.carbPercent}٪ (${macros.carbGrams} گرم)
• چربی مفید: ${macros.fatPercent}٪ (${macros.fatGrams} گرم)

۳. ایده‌های پیشنهادی برای وعده‌ها:
${mealIdeas.map(m => `• ${m.mealName} (${m.calories} کالری): ${m.suggestedFoods}`).join('\n')}

۴. نکات و هشدارهای ارگونومی تغذیه:
${cautions.map(c => `• ${c}`).join('\n')}`;

      resultHost.innerHTML = `
        <!-- Section 1: Fit Analysis -->
        <div class="diet-report-section">
          <h4>🎯 ۱. بررسی تناسب ساختار وعده‌ها با محدودیت «${esc(res.restriction)}»:</h4>
          <p class="diet-report-text">${esc(res.fitAnalysis || '')}</p>
        </div>

        <!-- Section 2: Macro Breakdown -->
        <div class="diet-report-section">
          <h4>📊 ۲. تخمین درشت‌مغذی‌ها (Macros Breakdown):</h4>
          <div class="macro-cards-grid">
            <div class="macro-card protein">
              <span class="macro-label">🥩 پروتئین</span>
              <b>${macros.proteinGrams.toLocaleString('fa-IR')} <small>گرم</small></b>
              <span class="macro-percent">${macros.proteinPercent}٪ از کل انرژی</span>
            </div>
            <div class="macro-card carb">
              <span class="macro-label">🌾 کربوهیدرات</span>
              <b>${macros.carbGrams.toLocaleString('fa-IR')} <small>گرم</small></b>
              <span class="macro-percent">${macros.carbPercent}٪ از کل انرژی</span>
            </div>
            <div class="macro-card fat">
              <span class="macro-label">🥑 چربی‌های مفید</span>
              <b>${macros.fatGrams.toLocaleString('fa-IR')} <small>گرم</small></b>
              <span class="macro-percent">${macros.fatPercent}٪ از کل انرژی</span>
            </div>
          </div>
        </div>

        <!-- Section 3: Smart Food Ideas per Meal -->
        <div class="diet-report-section">
          <h4>💡 ۳. پیشنهادهای هوشمند غذایی برای تک‌تک وعده‌ها:</h4>
          <div class="meal-ideas-list">
            ${mealIdeas.map(m => `
              <div class="meal-idea-item">
                <div class="meal-idea-head">
                  <b>🍽️ ${esc(m.mealName)}</b>
                  <span class="meal-idea-cal">${Number(m.calories).toLocaleString('fa-IR')} کالری</span>
                </div>
                <p class="meal-idea-foods">🥗 ${esc(m.suggestedFoods)}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Section 4: Cautions & Nutritional Timing -->
        <div class="diet-report-section">
          <h4>⚠️ ۴. هشدارهای زمان‌بندی و نکات ارگونومی تغذیه:</h4>
          <ul class="cautions-list">
            ${cautions.map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
        </div>
      `;

    } catch (err) {
      loadingHost.style.display = 'none';
      resultHost.style.display = 'flex';
      resultHost.innerHTML = `<div class="error-state"><h3>خطا در تحلیل هوشمند</h3><p>${esc(err.message)}</p></div>`;
    }

    copyBtn.onclick = async () => {
      if (fullReportText) {
        try {
          await navigator.clipboard.writeText(fullReportText);
          copyBtn.textContent = 'کپی شد ✓';
          setTimeout(() => { copyBtn.textContent = '📋 کپی گزارش کامل'; }, 2000);
        } catch(e) {}
      }
    };
  }

  // ==============================================================
  // 4. Quick View Modal for Diet Program
  // ==============================================================
  async function openDietViewModal(programId) {
    try {
      const prog = await api(`/api/diet-programs/${programId}`);
      let modal = document.getElementById('dietViewModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'dietViewModal';
        modal.className = 'ai-modal-overlay';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="ai-modal-dialog" role="dialog" aria-modal="true" style="max-width:720px;">
          <header class="ai-modal-header">
            <h3>👁 جزئیات برنامه غذایی: ${esc(prog.title)}</h3>
            <button type="button" class="btn-icon" id="closeDietViewModalX" title="بستن">×</button>
          </header>
          <div class="ai-modal-body">
            <div class="diet-modal-kpi-row">
              <div class="diet-modal-kpi"><span>محدودیت</span><b>🥗 ${esc(prog.diet_restriction_fa)}</b></div>
              <div class="diet-modal-kpi"><span>کالری کل</span><b>🔥 ${Number(prog.total_calories).toLocaleString('fa-IR')} kcal</b></div>
              <div class="diet-modal-kpi"><span>تعداد وعده</span><b>🍽️ ${(prog.meals || []).length.toLocaleString('fa-IR')} وعده</b></div>
            </div>
            ${prog.description ? `<p style="margin:10px 0;font-size:11.5px;color:var(--text-secondary);line-height:1.7;">${esc(prog.description)}</p>` : ''}
            <div class="registered-meals-grid" style="margin-top:10px;">
              ${(prog.meals || []).map((m, idx) => `
                <div class="registered-meal-card">
                  <div class="meal-card-right">
                    <div class="meal-card-num">${(idx + 1).toLocaleString('fa-IR')}</div>
                    <div class="meal-card-info">
                      <div class="meal-card-head-line">
                        <b class="meal-card-name">${esc(m.meal_name)}</b>
                        ${m.start_time ? `<span class="meal-time-badge">⏰ ${esc(m.start_time)}${m.end_time ? ' تا ' + esc(m.end_time) : ''}</span>` : ''}
                      </div>
                      ${m.notes ? `<p class="meal-card-notes">${esc(m.notes)}</p>` : ''}
                    </div>
                  </div>
                  <div class="meal-card-left">
                    <div class="meal-card-cal-pill"><b>${Number(m.calories).toLocaleString('fa-IR')}</b><small>کالری</small></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <footer class="ai-modal-footer">
            <button type="button" class="secondary" id="closeDietViewModalBtn">بستن</button>
            <button type="button" class="btn btn-primary" data-edit-diet="${prog.id}">✏️ ویرایش برنامه</button>
          </footer>
        </div>
      `;

      modal.hidden = false;
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      const close = () => {
        modal.hidden = true;
        modal.style.display = 'none';
        document.body.style.overflow = '';
      };
      document.getElementById('closeDietViewModalX').onclick = close;
      document.getElementById('closeDietViewModalBtn').onclick = close;
      const editDietBtn=document.querySelector('[data-edit-diet]');
      if(editDietBtn)editDietBtn.onclick=()=>{ location.href=`/programs/diet/form?id=${editDietBtn.dataset.editDiet}`; };
    } catch (err) {
      alert('خطا در بارگذاری برنامه: ' + err.message);
    }
  }

  // Export globally
  window.renderDietProgramsList = renderDietProgramsList;
  window.renderDietProgramBuilder = renderDietProgramBuilder;
})();
