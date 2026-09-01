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

  const detailLabels = {
    height: 'قد', weight: 'وزن', around_the_arm: 'دور بازو', around_the_chest: 'دور سینه',
    around_the_belly: 'دور شکم', around_the_hips: 'دور باسن', around_the_leg: 'دور ساق',
    around_the_thigh: 'دور ران', around_the_wrist: 'دور مچ', body_fat: 'درصد چربی', muscle_mass: 'توده عضلانی',
    disease_details: 'شرح بیماری', medication_details: 'شرح دارو', injury_details: 'شرح آسیب',
    surgery_details: 'شرح جراحی', last_blood_test_notes: 'آزمایش خون', corrective_notes: 'ناهنجاری اصلاحی',
    average_daily_activity: 'فعالیت روزانه', practice_history_details: 'شرح سابقه تمرین',
    current_practice_details: 'شرح تمرین فعلی', supplement_details: 'شرح مکمل', doping_history: 'سابقه دوپینگ',
    diet_type: 'محدودیت غذایی', previous_diet: 'سابقه رژیم', previous_diet_duration: 'مدت رژیم',
    previous_diet_type: 'نوع رژیم قبلی', previous_diet_notes: 'توضیح رژیم قبلی', food_allergies: 'حساسیت غذایی',
    weight_changes: 'تغییرات وزن', appetite_status: 'وضعیت اشتها', appetite_notes: 'توضیح اشتها',
    defecation_problem: 'وضعیت دفع', breakfast: 'صبحانه', lunch: 'ناهار', dinner: 'شام',
    smoking_details: 'شرح دخانیات', alcohol_details: 'شرح الکل',
    childbirth_history: 'سابقه زایمان', childbirth_count: 'تعداد زایمان', childbirth_type: 'نوع زایمان',
    childbirth_notes: 'توضیحات زایمان', breastfeeding: 'شیردهی', breastfeeding_notes: 'توضیحات شیردهی',
    child_age_months: 'سن کودک به ماه', formula_use: 'مصرف شیر خشک', formula_type: 'نوع شیر خشک',
    formula_amount: 'مقدار شیر خشک', formula_frequency: 'دفعات شیر خشک', child_food_allergy: 'حساسیت غذایی کودک',
    child_food_allergy_notes: 'شرح حساسیت کودک', student_note: 'توضیحات شاگرد', limitations: 'محدودیت‌ها', injuries: 'آسیب‌ها'
  };

  const enumLabels = {
    female: 'خانم', male: 'آقا', gym: 'باشگاه', home: 'منزل',
    low: 'کم', medium: 'متوسط', high: 'زیاد',
    none: 'بدون محدودیت', no_restriction: 'بدون محدودیت',
    vegetarian: 'گیاه‌خواری', vegan: 'وگان', celiac: 'سلیاک',
    lactose_intolerance: 'حساسیت به لاکتوز', gout: 'نقرس',
    low_carb: 'لوکرب', ketogenic: 'کتوژنیک', fasting: 'فستینگ',
    professional: 'حرفه‌ای', competition: 'مسابقه ای',
    iranian: 'سفره ایرانی',
    normal: 'معمولی و طبیعی', normal_eating: 'معمولی و طبیعی',
    low_eating: 'کم‌خوری', grazing: 'ریزه‌خوری', overeating: 'پرخوری',
    emotional_overeating: 'پرخوری عصبی', anorexia: 'بی‌اشتهایی عصبی',
    constipation: 'یبوست', diarrhea: 'اسهال',
    difficult_defecation: 'دفع سخت', natural: 'طبیعی', cesarean: 'سزارین'
  };

  const goalLabels = {
    weight_loss: 'کاهش وزن', weight_gain: 'افزایش وزن', fitness: 'فیتنس و سلامتی',
    maintenance: 'تثبیت وزن', muscle_gain: 'عضله‌سازی و هایپرتروفی',
    fat_loss: 'چربی‌سوزی', competition: 'آمادگی مسابقه'
  };

  function measurementComparison(current, previous) {
    if (!current || !previous) return '';
    const keys = ['weight', 'height', 'around_the_arm', 'around_the_chest', 'around_the_belly', 'around_the_hips', 'around_the_thigh', 'around_the_leg', 'around_the_wrist'];
    const activeKeys = keys.filter(k => current[k] != null || previous[k] != null);
    if (!activeKeys.length) return '';

    return `
      <div class="measurement-comparison-grid">
        ${activeKeys.map(k => {
          const prevVal = previous[k] ?? '—';
          const curVal = current[k] ?? '—';
          const pNum = Number(prevVal);
          const cNum = Number(curVal);
          let changeHTML = '';
          if (Number.isFinite(pNum) && Number.isFinite(cNum)) {
            const diff = +(cNum - pNum).toFixed(1);
            if (diff > 0) changeHTML = `<span class="meas-diff plus">+${diff}</span>`;
            else if (diff < 0) changeHTML = `<span class="meas-diff minus">${diff}</span>`;
            else changeHTML = `<span class="meas-diff zero">۰</span>`;
          }
          return `
            <div class="meas-comp-item">
              <span class="meas-comp-label">${esc(detailLabels[k] || k)}</span>
              <div class="meas-comp-vals">
                <span class="meas-prev">${esc(String(prevVal))}</span>
                <span class="meas-arrow">←</span>
                <span class="meas-cur">${esc(String(curVal))}</span>
                ${changeHTML}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function root(label) {
    return `
    <div class="program-builder">
      <div class="page-head">
        <div><p class="eyebrow">ارزیابی‌ها</p><h1>${label}</h1><p>درخواست‌های جدید ارزیابی بدنی شاگردان برای بررسی و تصمیم‌گیری مربی</p></div>
        <button class="btn btn-secondary" id="btnRefresh">🔄 بروزرسانی</button>
      </div>
      <div id="submissionsList" class="program-list">در حال بارگذاری...</div>
    </div>
    `;
  }

  async function loadSubmissions() {
    const host = document.getElementById('submissionsList');
    try {
      const list = await api('/api/student-submissions');
      if (list.length === 0) {
        host.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>درخواستی برای بررسی نیست</h3><p>هنوز شاگردی ارزیابی ارسال نکرده است. لینک دعوت بسازید و برای شاگرد بفرستید.</p></div>`;
        return;
      }
      host.innerHTML = list.map(item => `
        <div class="program-card">
          <h3>${esc(item.full_name)} <span class="case-chip">پرونده ${esc(item.case_number || '------')}</span> <small style="color:var(--text-muted)">ارزیابی #${item.assessment_number}</small></h3>
          <p>وزن: ${item.weight || '—'} kg • قد: ${item.height || '—'} cm • ${esc(goalLabels[item.goal] || item.goal || 'فیتنس')}</p>
          <div class="program-meta">
            <span>📅 ${new Date(item.submitted_at || item.created_at).toLocaleDateString('fa-IR')}</span>
            <span>${item.body_photos_preference === 'declined' ? '— عدم تمایل به تصاویر' : `📸 ${item.photo_count || 0} عکس`}</span>
            <span>📚 ${item.total_assessments || 0} ارزیابی کل</span>
            <span>🔑 ${esc(fa(item.status))}</span>
          </div>
          <div class="program-actions">
            <a class="btn btn-primary btn-small" href="/assessments/${item.id}">مشاهده ارزیابی</a>
            <button class="btn btn-secondary btn-small" onclick="location.href='/students/${item.case_number || item.student_id}/timeline'">📜 تاریخچه شاگرد</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      host.innerHTML = `<div style="color:var(--danger)">خطا: ${esc(e.message)}</div>`;
    }
  }

  window.renderCoachSubmissions = async (label, route) => {
    document.querySelector('#breadcrumb').textContent = label;
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    document.querySelector('#content').innerHTML = root(label);
    document.getElementById('btnRefresh').onclick = loadSubmissions;
    await loadSubmissions();
  };

  window.renderAssessmentReview = async (label, route) => {
    const match=route.match(/^\/assessments\/(\d+)$/),id=match?Number(match[1]):null;
    const content = document.querySelector('#content');
    document.querySelector('#breadcrumb').textContent = 'بررسی ارزیابی بدنی';
    document.querySelectorAll('.menu-link').forEach(item => item.classList.remove('active'));
    if (!id) {
      content.innerHTML = '<section class="coach-review-error">شناسه ارزیابی معتبر نیست.</section>';
      return;
    }
    content.innerHTML = '<div class="coach-review-loading"><span></span><p>در حال دریافت اطلاعات ارزیابی شاگرد…</p></div>';

    try {
      const data = await api(`/api/assessments/${id}`);
      const ass = data.assessment;
      const student = data.student;
      const details = data.assessment_details || {};
      const lifecycle = ass.lifecycle_status || ass.status;

      const lifecycleLabels = {
        SUBMITTED: 'ارسال‌شده', PENDING_REVIEW: 'در انتظار بررسی',
        UNDER_REVIEW: 'در حال بررسی', APPROVED: 'تأییدشده',
        REJECTED: 'ردشده', CHANGES_REQUESTED: 'نیازمند اصلاح'
      };

      const rawGoals = (details.goals || []).length
        ? details.goals
        : String(ass.goal || student.goal || '').split(',').filter(Boolean);
      const goals = rawGoals.map(g => goalLabels[g] || g);

      // Measurements & BMI
      const mData = details.measurements ? { ...details.measurements } : {
        height: ass.height, weight: ass.weight,
        around_the_chest: ass.chest, around_the_belly: ass.waist, around_the_hips: ass.hips
      };
      if (ass.body_fat != null) mData.body_fat = ass.body_fat;
      if (ass.muscle_mass != null) mData.muscle_mass = ass.muscle_mass;

      const weightNum = parseFloat(mData.weight || ass.weight || student.weight);
      const heightNum = parseFloat(mData.height || ass.height || student.height);
      let bmi = null;
      let bmiCategory = 'نرمال';
      if (weightNum > 0 && heightNum > 0) {
        bmi = +(weightNum / ((heightNum / 100) ** 2)).toFixed(1);
        if (bmi < 18.5) bmiCategory = 'کمبود وزن';
        else if (bmi < 25) bmiCategory = 'وزن نرمال';
        else if (bmi < 30) bmiCategory = 'اضافه‌وزن';
        else bmiCategory = 'چاقی';
      }

      const reviewable = ['SUBMITTED', 'PENDING_REVIEW', 'UNDER_REVIEW'].includes(lifecycle);
      const photos = ass.photos || [];
      const documents = ass.documents || [];

      // Helper for clean rendering of key-values
      const booleanKeys = new Set(['has_disease', 'has_medication', 'has_injury', 'has_surgery', 'practice_history', 'practice_now', 'supplement_history', 'previous_diet', 'smoking', 'alcohol', 'childbirth_history', 'breastfeeding', 'formula_use', 'child_food_allergy']);
      const hiddenKeys = new Set(['id', 'stable_id', 'assessment_id', 'student_id', 'created_at', 'updated_at', 'deleted_at', 'version']);

      const formatVal = (key, val) => {
        if (booleanKeys.has(key)) {
          const isTrue = Number(val) === 1 || val === true || val === 'yes';
          if (key === 'has_injury' || key === 'has_disease' || key === 'has_surgery') {
            return isTrue ? '<span class="status-pill danger">⚠️ دارد</span>' : '<span class="status-pill success">✓ ندارد</span>';
          }
          return isTrue ? '<span class="status-pill active">✓ بله</span>' : '<span class="status-pill muted">خیر</span>';
        }
        if (key === 'diet_type') {
          if (val === 'none' || val === 'no_restriction') return '<span class="status-pill default">بدون محدودیت</span>';
          return `<span class="status-pill active">🥗 ${esc(enumLabels[val] || val)}</span>`;
        }
        if (key === 'defecation_problem') {
          return val === 'none' ? '<span class="status-pill success">✓ بدون مشکل</span>' : `<span class="status-pill warning">⚠️ ${esc(enumLabels[val] || val)}</span>`;
        }
        if (enumLabels[val]) {
          if (val === 'gym') return '<span class="status-pill active">🏋️ باشگاه</span>';
          if (val === 'home') return '<span class="status-pill active">🏠 منزل</span>';
          if (val === 'normal' || val === 'normal_eating') return '<span class="status-pill success">🍽️ معمولی و طبیعی</span>';
          if (val === 'low_eating' || val === 'overeating' || val === 'grazing') return `<span class="status-pill warning">⚠️ ${enumLabels[val]}</span>`;
          return `<span class="status-pill default">${esc(enumLabels[val])}</span>`;
        }
        if (key === 'telegram_id' && val) return `<a href="https://t.me/${esc(String(val).replace(/^@+/, ''))}" target="_blank" class="social-chip telegram">✈️ @${esc(String(val).replace(/^@+/, ''))}</a>`;
        if (key === 'instagram_id' && val) return `<a href="https://instagram.com/${esc(String(val).replace(/^@+/, ''))}" target="_blank" class="social-chip instagram">📷 @${esc(String(val).replace(/^@+/, ''))}</a>`;
        if (key === 'mobile' && val) return `<a href="tel:${esc(val)}" class="tel-link" dir="ltr">📞 ${esc(val)}</a>`;
        return esc(String(val));
      };

      const renderGroupCard = (title, iconClass, itemsObj, allowedKeys = null) => {
        if (!itemsObj) return '';
        const entries = Object.entries(itemsObj).filter(([k, v]) => !hiddenKeys.has(k) && (!allowedKeys || allowedKeys.includes(k)) && v !== null && v !== undefined && v !== '');
        if (!entries.length) return '';

        return `
          <section class="coach-review-group coach-review-card">
            <header class="coach-review-card-head">
              <span class="card-icon-badge ${iconClass}">${iconClass === 'icon-user' ? '👤' : (iconClass === 'icon-target' ? '🎯' : (iconClass === 'icon-med' ? '🛡️' : (iconClass === 'icon-sport' ? '🏋️' : (iconClass === 'icon-food' ? '🥗' : (iconClass === 'icon-habit' ? '⏱️' : (iconClass === 'icon-mom' ? '🤱' : '📝'))))))}</span>
              <h2>${esc(title)}</h2>
            </header>
            <div class="coach-review-card-body">
              <dl class="review-dl">
                ${entries.map(([k, v]) => `
                  <div class="review-dl-row">
                    <dt>${esc(detailLabels[k] || k)}</dt>
                    <dd>${formatVal(k, v)}</dd>
                  </div>
                `).join('')}
              </dl>
            </div>
          </section>
        `;
      };

      // 1. Personal profile card
      const profileCard = renderGroupCard('اطلاعات فردی و ارتباطی', 'icon-user', student, ['mobile', 'telegram_id', 'instagram_id', 'date_of_birth', 'gender', 'preferred_location']);

      // 2. Goal card
      const goalsCard = `
        <section class="coach-review-group coach-review-card">
          <header class="coach-review-card-head">
            <span class="card-icon-badge icon-target">🎯</span>
            <h2>هدف اصلی و اولویت‌های دوره</h2>
          </header>
          <div class="coach-review-card-body">
            <div class="goals-badges-wrap">
              ${goals.map(g => `<span class="goal-tag">🎯 ${esc(g)}</span>`).join('') || '<span class="muted">هدفی تعیین نشده است</span>'}
            </div>
          </div>
        </section>
      `;

      // 3. Measurements Grid Card
      const measCards = [
        { label: 'قد', val: mData.height, unit: 'cm', icon: '📏' },
        { label: 'وزن', val: mData.weight, unit: 'kg', icon: '⚖️' },
        { label: 'دور سینه', val: mData.around_the_chest, unit: 'cm', icon: '👕' },
        { label: 'دور شکم', val: mData.around_the_belly, unit: 'cm', icon: '⭕' },
        { label: 'دور باسن', val: mData.around_the_hips, unit: 'cm', icon: '📐' },
        { label: 'دور بازو', val: mData.around_the_arm, unit: 'cm', icon: '💪' },
        { label: 'دور ران', val: mData.around_the_thigh, unit: 'cm', icon: '🦵' },
        { label: 'دور ساق', val: mData.around_the_leg, unit: 'cm', icon: '🦶' },
        { label: 'دور مچ', val: mData.around_the_wrist, unit: 'cm', icon: '⏱️' }
      ].filter(m => m.val != null && m.val !== '');

      const measurementsCard = `
        <section class="coach-review-group coach-review-card meas-card-wrap">
          <header class="coach-review-card-head">
            <span class="card-icon-badge icon-meas">📊</span>
            <h2>اندازه‌های بدنی و آنتروپومتریک</h2>
            ${bmi ? `<span class="bmi-header-pill">BMI: <b>${bmi}</b> (${esc(bmiCategory)})</span>` : ''}
          </header>
          <div class="coach-review-card-body">
            <div class="meas-grid">
              ${measCards.map(m => `
                <div class="meas-stat-box">
                  <div class="meas-stat-head">
                    <span>${m.icon} ${esc(m.label)}</span>
                  </div>
                  <div class="meas-stat-val">
                    <b>${esc(String(m.val))}</b>
                    <small>${m.unit}</small>
                  </div>
                </div>
              `).join('')}
              ${mData.body_fat ? `
                <div class="meas-stat-box highlight">
                  <div class="meas-stat-head"><span>💧 درصد چربی</span></div>
                  <div class="meas-stat-val"><b>${esc(String(mData.body_fat))}</b><small>%</small></div>
                </div>
              ` : ''}
            </div>
          </div>
        </section>
      `;

      // 4. Medical / Injuries Card
      const medicalDetails = details.medical || {};
      const injuryText = student.injuries || medicalDetails.injury_details || (details.medical_items || []).filter(i => i.kind === 'injury').map(i => i.name).join('، ');
      const hasAnyInjury = Boolean(injuryText && injuryText !== 'بدون آسیب' && injuryText !== 'ندارد');

      const medicalCard = `
        <section class="coach-review-group coach-review-card ${hasAnyInjury ? 'card-has-injury' : ''}">
          <header class="coach-review-card-head">
            <span class="card-icon-badge icon-med">🛡️</span>
            <h2>سوابق پزشکی، آسیب‌ها و سلامت مفاصل</h2>
          </header>
          <div class="coach-review-card-body">
            ${hasAnyInjury ? `
              <div class="injury-alert-box">
                <div class="injury-alert-head">
                  <b>⚠️ شرح آسیب‌دیدگی ثبت‌شده:</b>
                </div>
                <p>${esc(injuryText)}</p>
              </div>
            ` : ''}
            <dl class="review-dl">
              ${Object.entries(medicalDetails).filter(([k, v]) => !hiddenKeys.has(k) && v !== null && v !== '' && !k.startsWith('has_')).map(([k, v]) => `
                <div class="review-dl-row">
                  <dt>${esc(detailLabels[k] || k)}</dt>
                  <dd>${formatVal(k, v)}</dd>
                </div>
              `).join('')}
              ${(details.medical_items || []).length ? `
                <div class="review-dl-row">
                  <dt>ناهنجاری و بیماری انتخابی</dt>
                  <dd><span class="status-pill warning">${esc(details.medical_items.map(i => i.name).join('، '))}</span></dd>
                </div>
              ` : ''}
              ${!hasAnyInjury && !Object.keys(medicalDetails).length ? `
                <div class="review-dl-row"><dt>وضعیت سلامت</dt><dd><span class="status-pill success">✓ بدون آسیب یا بیماری گزارش‌شده</span></dd></div>
              ` : ''}
            </dl>
          </div>
        </section>
      `;

      // 5. Sports History Card
      const sportsCard = renderGroupCard('سابقه ورزشی و تمرینی', 'icon-sport', details.sports);

      // 6. Nutrition & Lifestyle Card
      const nutritionCard = renderGroupCard('تغذیه و الگوی غذایی', 'icon-food', details.nutrition);

      // 7. Habits Card
      const habitsCard = renderGroupCard('عادت‌های روزمره', 'icon-habit', details.habits);

      // 8. Pregnancy Card (if female)
      const pregnancyCard = student.gender === 'female' ? renderGroupCard('بارداری و زایمان', 'icon-mom', details.pregnancy) : '';

      // 9. Notes & Limitations Card
      const noteRows = [];
      if (ass.student_note) noteRows.push(['یادداشت شاگرد', ass.student_note]);
      if (ass.limitations || student.limitations) noteRows.push(['محدودیت‌های حرکتی', ass.limitations || student.limitations]);

      const notesCard = noteRows.length ? `
        <section class="coach-review-group coach-review-card">
          <header class="coach-review-card-head">
            <span class="card-icon-badge icon-notes">📝</span>
            <h2>توضیحات و یادداشت شاگرد</h2>
          </header>
          <div class="coach-review-card-body">
            <dl class="review-dl">
              ${noteRows.map(([k, v]) => `
                <div class="review-dl-row">
                  <dt>${esc(k)}</dt>
                  <dd style="color:var(--text);font-weight:750;">${esc(v)}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
        </section>
      ` : '';

      content.innerHTML = `
        <div class="coach-review-page">
          <!-- Hero Header -->
          <header class="coach-review-hero">
            <div class="coach-review-heading">
              <a href="/students/submissions" class="review-back" aria-label="بازگشت به ارزیابی‌ها">→</a>
              <div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <p class="eyebrow" style="margin:0;">بررسی ارزیابی #${ass.assessment_number}</p>
                  <span class="review-status ${esc(lifecycle.toLowerCase())}">${esc(lifecycleLabels[lifecycle] || fa(lifecycle))}</span>
                </div>
                <h1>${esc(student.full_name)}</h1>
                <div class="review-meta">
                  <span class="case-chip">شماره پرونده: <b>${esc(student.case_number || '------')}</b></span>
                  <span>📅 تاریخ ثبت: ${ass.submitted_at ? new Date(ass.submitted_at).toLocaleString('fa-IR') : 'ثبت‌نشده'}</span>
                  <span>🎯 هدف: <b>${esc(goals.join('، ') || 'فیتنس')}</b></span>
                </div>
              </div>
            </div>
            <div class="review-header-links">
              <a class="btn btn-secondary btn-small" href="/students/${student.case_number || student.id}/timeline">📜 تاریخچه شاگرد</a>
              <a class="btn btn-secondary btn-small" href="/users-list/${student.case_number || student.id}">👤 پروفایل شاگرد</a>
            </div>
          </header>

          <div class="coach-review-layout">
            <!-- Main Content Area: High-contrast 2-column cards grid -->
            <main class="coach-review-main">
              ${goalsCard}
              ${profileCard}
              ${measurementsCard}
              ${medicalCard}
              ${sportsCard}
              ${nutritionCard}
              ${habitsCard}
              ${pregnancyCard}
              ${notesCard}

              ${photos.length ? `
                <section class="coach-review-group coach-review-card coach-review-photos">
                  <header class="coach-review-card-head">
                    <span class="card-icon-badge icon-photo">📸</span>
                    <h2>تصاویر ارزیابی بدنی شاگرد</h2>
                    <b style="color:var(--accent-hover);">${photos.length} تصویر خصوصی</b>
                  </header>
                  <div class="review-photo-grid">
                    ${photos.map(p => `
                      <a href="/api/student-photos/${p.id}" target="_blank" rel="noopener" class="photo-card-item">
                        <img src="/api/student-photos/${p.id}" alt="تصویر ${esc(p.photo_type)}">
                        <span class="photo-type-pill">${esc(p.photo_type)}</span>
                      </a>
                    `).join('')}
                  </div>
                </section>
              ` : ''}

              ${documents.length ? `
                <section class="coach-review-group coach-review-card">
                  <header class="coach-review-card-head">
                    <span class="card-icon-badge icon-doc">📁</span>
                    <h2>مدارک و آزمایش‌های پزشکی شاگرد</h2>
                  </header>
                  <div class="review-document-list">
                    ${documents.map(d => `
                      <a href="/api/student-documents/${d.id}" target="_blank" rel="noopener">
                        <div>
                          <b>${esc(d.original_filename)}</b>
                          <small>${esc(d.document_type)} • ${Math.ceil(d.size_bytes / 1024)} KB</small>
                        </div>
                        <span class="btn btn-secondary btn-small">👁 مشاهده مدرک</span>
                      </a>
                    `).join('')}
                  </div>
                </section>
              ` : ''}

              ${data.previous_assessment && details.measurements && data.previous_assessment_details?.measurements ? `
                <section class="coach-review-group coach-review-card" style="grid-column:1/-1;">
                  <header class="coach-review-card-head">
                    <span class="card-icon-badge icon-compare">📊</span>
                    <h2>مقایسه تغییرات با ارزیابی شماره #${data.previous_assessment.assessment_number}</h2>
                  </header>
                  <div class="coach-review-card-body">
                    ${measurementComparison(details.measurements, data.previous_assessment_details.measurements)}
                  </div>
                </section>
              ` : ''}
            </main>

            <!-- Sidebar: Decision & Actions Card -->
            <aside class="coach-review-sidebar">
              <section class="review-decision-card">
                <header class="decision-card-head">
                  <p class="eyebrow">ثبت تصمیم مربی</p>
                  <h2>${reviewable ? 'بررسی و پاسخ به ارزیابی' : esc(lifecycleLabels[lifecycle] || fa(lifecycle))}</h2>
                </header>

                <button type="button" class="btn btn-primary btn-ai-sparkle" id="btnAiAnalyze" style="width:100%;margin-bottom:12px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:8px;">
                  🤖 تحلیل ارزیابی و پیشنهاد یادداشت با AI
                </button>

                <label class="coach-note-label">
                  <span>یادداشت و بازخورد مربی برای شاگرد:</span>
                  <textarea id="coachNote" maxlength="50000" placeholder="متن بازخورد، تحلیل ارزیابی یا توضیحات اختصاصی برای شاگرد…">${esc(ass.coach_note || '')}</textarea>
                </label>

                <div class="review-actions">
                  <button class="review-action approve" id="btnApprove" ${reviewable ? '' : 'disabled'}>✓ <span>تأیید ارزیابی</span></button>
                  <button class="review-action revise" id="btnRequestChanges" ${reviewable ? '' : 'disabled'}>↻ <span>درخواست اصلاح</span></button>
                  <button class="review-action reject" id="btnReject" ${reviewable ? '' : 'disabled'}>× <span>رد ارزیابی</span></button>
                  <button class="review-action reject" id="btnDeleteAssessment" type="button">🗑 <span>حذف ارزیابی</span></button>
                  <a class="review-action message" href="/users-list/${student.case_number || student.id}">✉ <span>پیام به شاگرد</span></a>
                </div>

                <p class="review-action-feedback" id="reviewActionFeedback" role="alert"></p>

                ${lifecycle === 'APPROVED' ? `
                  <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
                    <button type="button" class="btn btn-primary review-program-link" id="btnAiBuildProgram" style="width:100%;font-weight:900;display:flex;align-items:center;justify-content:center;gap:6px;">
                      🤖 ساخت برنامه با AI
                    </button>
                    <a class="btn btn-secondary review-program-link" href="/programs/exercise/form?student_id=${student.id}&assessment_id=${id}" style="text-align:center;font-weight:750;">
                      ساخت برنامه ۳۰ روزه (دستی)
                    </a>
                  </div>
                ` : ''}
              </section>
            </aside>
          </div>
        </div>
      `;

      async function decide(action, requiresNote) {
        const feedback = document.querySelector('#reviewActionFeedback');
        const note = document.querySelector('#coachNote').value.trim();
        if (requiresNote && !note) {
          feedback.textContent = 'برای این تصمیم، نوشتن یادداشت الزامی است.';
          return;
        }
        document.querySelectorAll('.review-action button, button.review-action').forEach(b => b.disabled = true);
        feedback.textContent = 'در حال ثبت تصمیم مربی…';

        try {
          if(lifecycle==='SUBMITTED')await api(`/api/assessments/${id}/under-review`,{method:'POST'});
          await api(`/api/assessments/${id}/${action}`,{method:'POST',body:JSON.stringify({coach_note:note})});
          if(action==='approve')location.href=`/programs/exercise/form?student_id=${student.id}&assessment_id=${id}`;
          else location.reload();
        } catch (error) {
          feedback.textContent = error.message;
          document.querySelectorAll('button.review-action').forEach(b => b.disabled = false);
        }
      }

      document.querySelector('#btnApprove')?.addEventListener('click', () => decide('approve', false));
      document.querySelector('#btnRequestChanges')?.addEventListener('click', () => decide('request-changes', true));
      document.querySelector('#btnReject')?.addEventListener('click', () => decide('reject', true));
      document.querySelector('#btnDeleteAssessment')?.addEventListener('click', async () => {
        if(!confirm(`ارزیابی #${ass.assessment_number} شاگرد «${student.full_name}» با عکس‌ها و مدارک آن برای همیشه حذف شود؟`)) return;
        const feedback = document.querySelector('#reviewActionFeedback');
        const button = document.querySelector('#btnDeleteAssessment');
        if(button) button.disabled = true;
        if(feedback) feedback.textContent = 'در حال حذف ارزیابی…';
        try{
          await api(`/api/assessments/${id}`, {method:'DELETE'});
          location.href = '/students/submissions';
        }catch(error){
          if(feedback) feedback.textContent = error.message;
          if(button) button.disabled = false;
        }
      });

      document.querySelector('#btnAiBuildProgram')?.addEventListener('click', () => {
        if (window.openAICopilot) {
          window.openAICopilot({ studentId: student.id, assessmentId: id });
        }
      });

      document.querySelector('#btnAiAnalyze')?.addEventListener('click', () => {
        if (window.openAIAssessmentModal) {
          window.openAIAssessmentModal({ student, assessment: ass, assessmentDetails: details, assessmentId: id });
        }
      });
    } catch (error) {
      content.innerHTML = `<section class="coach-review-error"><b>ارزیابی باز نشد</b><p>${esc(error.message)}</p><a class="btn btn-secondary" href="/students/submissions">بازگشت به فهرست</a></section>`;
    }
  };

  window.renderStudentTimeline = async (label, route) => {
    const match = route.match(/\/students\/(\d+)\/(?:timeline|assessments)/);
    const studentId = match ? match[1] : null;
    if (!studentId) return;
    document.querySelector('#breadcrumb').textContent = 'تایم‌لاین شاگرد';
    const content = document.querySelector('#content');
    content.innerHTML = `<div style="text-align:center;padding:40px">در حال بارگذاری تایم‌لاین...</div>`;
    try {
      const data = await api(`/api/students/${studentId}/timeline`);
      const student = data.student;
      content.innerHTML = `
        <div class="program-builder">
          <div class="page-head">
            <div><h1>📜 تایم‌لاین ${esc(student.full_name)}</h1><p><span class="case-chip">پرونده ${esc(student.case_number || '------')}</span> • ارزیابی‌ها و برنامه‌های ماهانه</p></div>
            <button class="btn btn-secondary" onclick="history.back()">← بازگشت</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${(data.timeline || []).map(item => {
              if (item.type === 'assessment') {
                const a = item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-surface);border:1px solid var(--accent-border);display:grid;place-items:center;flex:0 0 40px;font-size:16px;">📋</div>
                  <div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">ارزیابی #${a.assessment_number} - ${esc(fa(a.status))}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">وزن: ${a.weight} kg • ${new Date(a.date).toLocaleDateString('fa-IR')}</p>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">${(a.photos || []).map(p => `<img src="/api/student-photos/${p.id}" style="width:60px;height:60px;border-radius:8px;object-fit:cover">`).join('')}</div>
                    <button class="btn btn-secondary btn-small" onclick="location.href='/assessments/${a.id}'" style="margin-top:8px">بررسی</button>
                  </div>
                </div>
                `;
              } else if (item.type === 'workout') {
                const workout = item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--success-surface);border:1px solid var(--success-border);display:grid;place-items:center;flex:0 0 40px;font-size:16px;">✓</div>
                  <div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">تمرین ${esc(workout.program_title)} • روز ${workout.day_number}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">${esc(fa(workout.status))} • ${new Date(item.date).toLocaleDateString('fa-IR')}</p>
                  </div>
                </div>
                `;
              } else {
                const p = item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-surface);border:1px solid var(--accent-border);display:grid;place-items:center;flex:0 0 40px;font-size:16px;">💪</div>
                  <div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">${esc(p.title)}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">📅 ${esc(p.start_date || '')} تا ${esc(p.end_date || '')} • ${esc(fa(p.status))}</p>
                    <button class="btn btn-primary btn-small" onclick="location.href='/programs/exercise/form?id=${p.id}'">ویرایش برنامه</button>
                  </div>
                </div>
                `;
              }
            }).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      content.innerHTML = `<div style="color:var(--danger)">خطا: ${esc(e.message)}</div>`;
    }
  };
})();
