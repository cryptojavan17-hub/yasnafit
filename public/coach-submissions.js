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

  const faNum2 = v => String(v ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

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

  Object.assign(detailLabels, {
    practice_duration: 'مدت سابقه تمرین', sport_discipline: 'رشته ورزشی',
    home_equipment: 'تجهیزات اختصاصی منزل',
    weight_changes: 'روند تغییرات وزن', corrective_notes: 'ناهنجاری‌های وضعیتی',
    last_blood_test_notes: 'یادداشت آزمایش خون',
    date_of_birth: 'تاریخ تولد', province: 'استان', city: 'شهر', address: 'نشانی',
    preferred_location: 'محل تمرین ترجیحی'
  });

  const photoLabels = { front_flex: 'روبه‌رو (با انقباض)', back_flex: 'از پشت (با انقباض)', side: 'از پهلو' };
  const documentLabels = { blood_test: 'آزمایش خون', body_analysis: 'آنالیز بدنی', additional_image: 'تصویر تکمیلی' };
  const itemKindLabels = { injury: 'آسیب', surgery: 'جراحی', disease: 'بیماری', corrective: 'ناهنجاری' };
  const lifecycleLabels = {
    SUBMITTED: 'ارسال‌شده', PENDING_REVIEW: 'در انتظار بررسی', UNDER_REVIEW: 'در حال بررسی',
    APPROVED: 'تأییدشده', REJECTED: 'ردشده', CHANGES_REQUESTED: 'نیازمند اصلاح'
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
          <h3>${esc(item.full_name)} <span class="case-chip">پرونده ${esc(item.case_number || '------')}</span> <small style="color:var(--text-muted)">ارزیابی شماره ${faNum2(item.assessment_number)}</small></h3>
          <p>وزن: ${item.weight ? faNum2(item.weight) + ' کیلوگرم' : '—'} • قد: ${item.height ? faNum2(item.height) + ' سانتی‌متر' : '—'} • ${esc(goalLabels[item.goal] || item.goal || 'فیتنس')}</p>
          <div class="program-meta">
            <span>📅 ${new Date(item.submitted_at || item.created_at).toLocaleDateString('fa-IR')}</span>
            <span>${item.body_photos_preference === 'declined' ? '— عدم تمایل به تصاویر' : `📸 ${item.photo_count || 0} عکس`}</span>
            <span>📚 ${item.total_assessments || 0} ارزیابی کل</span>
            <span>🔑 ${esc(fa(item.status))}</span>
          </div>
          <div class="program-actions">
            <a class="btn btn-primary btn-small" href="/assessments/${item.id}">مشاهده ارزیابی</a>
            <button class="btn btn-secondary btn-small" data-student-timeline="${item.case_number || item.student_id}">📜 تاریخچه شاگرد</button>
          </div>
        </div>
      `).join('');
      host.querySelectorAll('[data-student-timeline]').forEach(b=>{
        b.onclick=()=>{ location.href=`/students/${b.dataset.studentTimeline}/timeline`; };
      });
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
    const content=document.querySelector('#content');
    document.querySelector('#breadcrumb').textContent='بررسی ارزیابی بدنی';
    document.querySelectorAll('.menu-link').forEach(item=>item.classList.remove('active'));
    if(!id){content.innerHTML='<section class="coach-review-error">شناسه ارزیابی معتبر نیست.</section>';return;}
    content.innerHTML='<div class="coach-review-loading"><span></span><p>در حال دریافت اطلاعات ارزیابی شاگرد…</p></div>';

    try{
      const data=await api(`/api/assessments/${id}`);
      const ass=data.assessment, student=data.student, details=data.assessment_details||{};
      const lifecycle=ass.lifecycle_status||ass.status;
      const reviewable=['SUBMITTED','PENDING_REVIEW','UNDER_REVIEW'].includes(lifecycle);
      const photos=ass.photos||[], documents=ass.documents||[];
      const faDigits='۰۱۲۳۴۵۶۷۸۹';
      const faNum=v=>String(v??'').replace(/\d/g,d=>faDigits[+d]);
      const faDate=ts=>{if(!ts)return '—';const d=new Date(ts);return isNaN(d)?faNum(ts):d.toLocaleDateString('fa-IR');};
      const qty=v=>v===null||v===undefined||v===''?null:faNum(v);
      const boolOn=v=>Number(v)===1||v===true;
      const pill=(txt,kind='')=>`<span class="rvw-pill ${kind}">${txt}</span>`;
      const yesNo=(v,okTxt='بله')=>boolOn(v)?pill(okTxt,'ok'):pill('خیر','dim');
      const riskNo=v=>boolOn(v)?pill('دارد ⚠','bad'):pill('ندارد','ok');
      const emptyBox=(txt='اطلاعاتی ثبت نشده')=>`<div class="rvw-empty">— ${txt} —</div>`;

      // ── هدف دوره ──
      const rawGoals=(details.goals||[]).length?details.goals:String(ass.goal||student.goal||'').split(',').filter(Boolean);
      const goalTags=rawGoals.map(g=>`<span class="rvw-goal">🎯 ${esc(goalLabels[g]||g)}</span>`).join('');

      // ── اندازه‌ها و شاخص بدنی ──
      const m=details.measurements?{...details.measurements}:{};
      if(ass.body_fat!=null)m.body_fat=ass.body_fat;
      if(ass.muscle_mass!=null)m.muscle_mass=ass.muscle_mass;
      const wNum=parseFloat(m.weight??ass.weight??student.weight), hNum=parseFloat(m.height??ass.height??student.height);
      let bmi=null,bmiTxt='نامشخص',bmiKind='dim';
      if(wNum>0&&hNum>0){
        bmi=+(wNum/((hNum/100)**2)).toFixed(1);
        if(bmi<18.5){bmiTxt='کمبود وزن';bmiKind='warn';}
        else if(bmi<25){bmiTxt='وزن نرمال';bmiKind='ok';}
        else if(bmi<30){bmiTxt='اضافه‌وزن';bmiKind='warn';}
        else{bmiTxt='چاقی';bmiKind='bad';}
      }
      const measRows=[
        ['قد (سانتی‌متر)',qty(m.height),true],
        ['وزن (کیلوگرم)',qty(m.weight),true],
        ['دور سینه',qty(m.around_the_chest),false],
        ['دور شکم',qty(m.around_the_belly),false],
        ['دور باسن',qty(m.around_the_hips),false],
        ['دور بازو',qty(m.around_the_arm),false],
        ['دور ران',qty(m.around_the_thigh),false],
        ['دور ساق پا',qty(m.around_the_leg),false],
        ['دور مچ',qty(m.around_the_wrist),false],
        ['درصد چربی بدن',m.body_fat!=null?qty(m.body_fat):null,false],
        ['توده عضلانی',m.muscle_mass!=null?qty(m.muscle_mass):null,false]
      ].filter(r=>r[1]!==null).map(r=>[r[0],`<b>${r[1]}</b>${r[2]?' <span class="rvw-key">کلیدی</span>':''}`]);

      // ── جدول عمومی ──
      const table=(rows,emptyTxt)=>{
        const body=rows.filter(r=>r[1]!==null&&r[1]!==undefined&&r[1]!=='');
        if(!body.length)return emptyBox(emptyTxt);
        return `<table class="rvw-table"><thead><tr><th class="c-lbl">مشخصه</th><th class="c-val">وضعیت ثبت‌شده</th><th class="c-note">توضیح شاگرد</th></tr></thead><tbody>${body.map(r=>`<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td class="cell-note">${r[2]?esc(r[2]):'—'}</td></tr>`).join('')}</tbody></table>`;
      };
      const card=(icon,title,inner,tag='')=>`
        <section class="rvw-card">
          <header><span class="rvw-ico">${icon}</span><h2>${title}</h2>${tag?`<span class="rvw-tag">${tag}</span>`:''}</header>
          <div class="rvw-pad">${inner}</div>
        </section>`;

      // ۲) اطلاعات فردی
      const tg=student.telegram_id?`<a class="rvw-linkchip" href="https://t.me/${esc(String(student.telegram_id).replace(/^@+/,''))}" target="_blank" rel="noopener">${esc(String(student.telegram_id))}</a>`:null;
      const ig=student.instagram_id?`<a class="rvw-linkchip" href="https://instagram.com/${esc(String(student.instagram_id).replace(/^@+/,''))}" target="_blank" rel="noopener">${esc(String(student.instagram_id))}</a>`:null;
      const personalRows=[
        ['جنسیت',student.gender==='female'?pill('خانم'):student.gender==='male'?pill('آقا'):pill('نامشخص','dim')],
        ['موبایل',student.mobile?`<a href="tel:${esc(student.mobile)}" class="rvw-tel" dir="ltr">${esc(faNum(student.mobile))}</a>`:null],
        ['تاریخ تولد',student.date_of_birth?faDate(student.date_of_birth):null],
        ['استان',student.province?esc(student.province):null],
        ['شهر',student.city?esc(student.city):null],
        ['نشانی',student.address?esc(student.address):null],
        ['محل تمرین ترجیحی',student.preferred_location==='gym'?pill('باشگاه'):student.preferred_location==='home'?pill('منزل'):null],
        ['تلگرام',tg],
        ['اینستاگرام',ig]
      ];

      // ۴) پزشکی
      const med=details.medical||{}, items=details.medical_items||[];
      const riskItems=items.map(x=>`<span class="rvw-pill bad">${esc(itemKindLabels[x.kind]||x.kind)}: ${esc(x.name)}${x.category?` (${esc(x.category)})`:''}</span>`).join('');
      const hasRisk=boolOn(med.has_disease)||boolOn(med.has_medication)||boolOn(med.has_injury)||boolOn(med.has_surgery)||items.length>0;
      const medicalInner=`
        ${hasRisk?`<div class="rvw-alert">⚠️ <b>جمع‌بندی سلامت:</b> این شاگرد سابقه پزشکی ثبت‌شده دارد؛ پیش از طراحی برنامه بندهای زیر را بخوانید.</div>`:''}
        ${riskItems?`<div class="rvw-chips">${riskItems}</div>`:''}
        ${table([
          ['بیماری',riskNo(med.has_disease),med.disease_details],
          ['مصرف دارو',riskNo(med.has_medication),med.medication_details],
          ['آسیب‌دیدگی',riskNo(med.has_injury),med.injury_details],
          ['جراحی',riskNo(med.has_surgery),med.surgery_details],
          ['آزمایش خون',med.last_blood_test_notes?pill('ثبت‌شده','ok'):null,med.last_blood_test_notes],
          ['ناهنجاری وضعیتی',med.corrective_notes?pill('ثبت‌شده','warn'):null,med.corrective_notes]
        ],'سابقه پزشکی ثبت نشده — هیچ بیماری، آسیب یا جراحی‌ای اعلام نشده است')}`;

      // ۵) ورزشی
      const sp=details.sports||{};
      const sportsRows=[
        ['فعالیت روزانه',sp.average_daily_activity?pill({low:'کم',medium:'متوسط',high:'زیاد'}[sp.average_daily_activity]||sp.average_daily_activity,sp.average_daily_activity==='high'?'ok':sp.average_daily_activity==='low'?'warn':''):null],
        ['سابقه تمرین',sp.practice_history!==undefined?yesNo(sp.practice_history):null,sp.practice_history_details],
        ['رشته ورزشی',sp.sport_discipline?esc(sp.sport_discipline):null],
        ['مدت سابقه تمرین',sp.practice_duration?esc(sp.practice_duration):null],
        ['تمرین در حال حاضر',sp.practice_now!==undefined?yesNo(sp.practice_now):null,sp.current_practice_details],
        ['محل تمرین',sp.practice_place==='gym'?pill('باشگاه'):sp.practice_place==='home'?pill('منزل'):null],
        ['جلسات تمرین در هفته',sp.sessions_per_week!=null?`<b class="rvw-strong">${faNum(sp.sessions_per_week)} جلسه</b>`:null],
        ['تجهیزات منزل',sp.home_equipment?esc(sp.home_equipment):null],
        ['سابقه مصرف مکمل',sp.supplement_history!==undefined?yesNo(sp.supplement_history):null,sp.supplement_details],
        ['سابقه دوپینگ',sp.doping_history?pill('ثبت‌شده ⚠','bad'):null,sp.doping_history]
      ];

      // ۶) تغذیه
      const nu=details.nutrition||{};
      const nutritionRows=[
        ['نوع رژیم / محدودیت',nu.diet_type?pill(enumLabels[nu.diet_type]||nu.diet_type,(nu.diet_type==='none'||nu.diet_type==='no_restriction')?'dim':'ok'):null],
        ['سابقه رژیم قبلی',nu.previous_diet!==undefined?yesNo(nu.previous_diet):null,[nu.previous_diet_type,nu.previous_diet_duration,nu.previous_diet_notes].filter(Boolean).join(' — ')||undefined],
        ['حساسیت غذایی',nu.food_allergies?pill('ثبت‌شده ⚠','warn'):null,nu.food_allergies],
        ['روند تغییرات وزن',nu.weight_changes?esc(nu.weight_changes):null],
        ['وضعیت اشتها',nu.appetite_status?pill(enumLabels[nu.appetite_status]||nu.appetite_status,(['low_eating','overeating','grazing','emotional_overeating','anorexia'].includes(nu.appetite_status))?'warn':'ok'):null,nu.appetite_notes],
        ['وضعیت دفع',nu.defecation_problem?pill(enumLabels[nu.defecation_problem]||nu.defecation_problem,nu.defecation_problem==='none'?'ok':'warn'):null],
        ['صبحانه',nu.breakfast?esc(nu.breakfast):null],
        ['ناهار',nu.lunch?esc(nu.lunch):null],
        ['شام',nu.dinner?esc(nu.dinner):null]
      ];

      // ۷) عادات
      const hb=details.habits||{};
      const habitRows=[
        ['مصرف دخانیات',hb.smoking!==undefined?yesNo(hb.smoking):null,hb.smoking_details],
        ['مصرف الکل',hb.alcohol!==undefined?yesNo(hb.alcohol):null,hb.alcohol_details]
      ];

      // ۸) بارداری (فقط خانم‌ها)
      const pr=details.pregnancy||{};
      const pregRows=student.gender==='female'?[
        ['سابقه زایمان',pr.childbirth_history!==undefined?yesNo(pr.childbirth_history):null,pr.childbirth_count?`${faNum(pr.childbirth_count)} بار`:(pr.childbirth_notes||undefined)],
        ['نوع زایمان',pr.childbirth_type?pill(enumLabels[pr.childbirth_type]||pr.childbirth_type):null,pr.childbirth_notes||undefined],
        ['شیردهی',pr.breastfeeding!==undefined?yesNo(pr.breastfeeding):null,[pr.breastfeeding_notes,pr.child_age_months!=null?`سن کودک: ${faNum(pr.child_age_months)} ماه`:null].filter(Boolean).join(' — ')||undefined],
        ['شیر خشک',pr.formula_use!==undefined?yesNo(pr.formula_use):null,[pr.formula_type,pr.formula_amount,pr.formula_frequency].filter(Boolean).join(' — ')||undefined],
        ['حساسیت غذایی کودک',pr.child_food_allergy!==undefined?yesNo(pr.child_food_allergy,'ثبت‌شده'):null,pr.child_food_allergy_notes]
      ]:null;

      const studentNote=ass.student_note?`<div class="rvw-note"><b>توضیح شاگرد:</b> ${esc(ass.student_note)}</div>`:'';

      // مقایسه با ارزیابی قبلی
      const prevDet=data.previous_assessment_details;
      let compareCard='';
      if(data.previous_assessment&&prevDet&&prevDet.measurements){
        const prev=prevDet.measurements;
        const rowsC=['height','weight','around_the_arm','around_the_chest','around_the_belly','around_the_hips','around_the_thigh','around_the_leg','around_the_wrist']
          .filter(k=>m[k]!=null||prev[k]!=null)
          .map(k=>{
            const p=prev[k]??'—',c=m[k]??'—';
            const d=Number.isFinite(Number(p))&&Number.isFinite(Number(c))?+(c-p).toFixed(1):null;
            const dTxt=d===null?'':d>0?pill(`+${faNum(d)}`,'warn'):d<0?pill(faNum(d),'ok'):pill('بی‌تغییر','dim');
            return `<tr><th scope="row">${esc(detailLabels[k]||k)}</th><td>${faNum(p)}</td><td><b>${faNum(c)}</b></td><td>${dTxt||'—'}</td></tr>`;
          }).join('');
        if(rowsC)compareCard=`
          <section class="rvw-card">
            <header><span class="rvw-ico">📈</span><h2>مقایسه با ارزیابی شماره ${faNum(data.previous_assessment.assessment_number)}</h2></header>
            <div class="rvw-pad"><table class="rvw-table rvw-table-4"><thead><tr><th class="c-lbl">مشخصه</th><th>ارزیابی قبلی</th><th>ارزیابی فعلی</th><th>تغییر</th></tr></thead><tbody>${rowsC}</tbody></table></div>
          </section>`;
      }

      const photosCard=photos.length?card('📸','تصاویر ارزیابی',`
        <div class="rvw-photos">${photos.map(p=>`<a href="/api/student-photos/${p.id}" target="_blank" rel="noopener"><img src="/api/student-photos/${p.id}" alt="${esc(photoLabels[p.photo_type]||'تصویر ارزیابی')}"><span>${esc(photoLabels[p.photo_type]||p.photo_type)}</span></a>`).join('')}</div>`,`${faNum(photos.length)} تصویر خصوصی`):'';
      const docsCard=documents.length?card('📁','مدارک پزشکی',`
        <div class="rvw-docs">${documents.map(d=>`<a href="/api/student-documents/${d.id}" target="_blank" rel="noopener"><span class="rvw-doc-ico">📄</span><span class="rvw-doc-name">${esc(documentLabels[d.document_type]||d.document_type)}<small>${esc(d.original_filename)} · ${faNum(Math.ceil(d.size_bytes/1024))} کیلوبایت</small></span><span class="rvw-pill">مشاهده</span></a>`).join('')}</div>`):'';

      // ── ۹) بررسی و پاسخ مربی ──
      const statusPill=lifecycleLabels[lifecycle]?pill(lifecycleLabels[lifecycle],{SUBMITTED:'accent',PENDING_REVIEW:'accent',UNDER_REVIEW:'accent',APPROVED:'ok',REJECTED:'bad',CHANGES_REQUESTED:'warn'}[lifecycle]||''):pill(lifecycle);
      const decideCard=`
        <section class="rvw-card rvw-decide">
          <header><span class="rvw-ico">🧭</span><h2>بررسی و پاسخ مربی</h2>${statusPill}</header>
          <div class="rvw-pad">
            <button type="button" class="btn btn-secondary rvw-ai" id="btnAiAnalyze">🤖 تحلیل ارزیابی و پیشنهاد یادداشت با هوش مصنوعی</button>
            <label class="rvw-note-label"><span>یادداشت و بازخورد برای شاگرد:</span>
              <textarea id="coachNote" maxlength="50000" placeholder="متن بازخورد یا توضیحات اختصاصی برای شاگرد…">${esc(ass.coach_note||'')}</textarea>
            </label>
            <div class="rvw-actions">
              <button class="rvw-act ok" id="btnApprove" ${reviewable?'':'disabled'}>✓ تأیید ارزیابی</button>
              <button class="rvw-act warn" id="btnRequestChanges" ${reviewable?'':'disabled'}>↻ درخواست اصلاح</button>
              <button class="rvw-act bad" id="btnReject" ${reviewable?'':'disabled'}>✕ رد ارزیابی</button>
              <button class="rvw-act bad" id="btnDeleteAssessment" type="button">🗑 حذف ارزیابی</button>
              <a class="rvw-act" href="/users-list/${esc(student.case_number||student.id)}">✉ پیام به شاگرد</a>
            </div>
            <p class="rvw-feedback" id="reviewActionFeedback" role="alert"></p>
            ${lifecycle==='APPROVED'?`
            <div class="rvw-program-row">
              <button type="button" class="btn btn-primary" id="btnAiBuildProgram">🤖 ساخت برنامه با هوش مصنوعی</button>
              <a class="btn btn-secondary" href="/programs/exercise/form?student_id=${student.id}&assessment_id=${id}">ساخت برنامه ۳۰ روزه (دستی)</a>
            </div>`:''}
          </div>
        </section>`;

      content.innerHTML=`
        <div class="rvw">
          <header class="rvw-head">
            <div class="rvw-head-main">
              <a href="/students/submissions" class="rvw-back" aria-label="بازگشت به فهرست ارزیابی‌ها">→</a>
              <div class="rvw-id">
                <div class="rvw-title-row"><h1>${esc(student.full_name)}</h1>${statusPill}</div>
                <div class="rvw-chips">
                  <span class="rvw-chip">پرونده <b>${esc(student.case_number||'------')}</b></span>
                  <span class="rvw-chip">ارزیابی شماره <b>${faNum(ass.assessment_number)}</b></span>
                  <span class="rvw-chip">تاریخ ثبت <b>${faDate(ass.submitted_at||ass.created_at)}</b></span>
                  <span class="rvw-chip rvw-chip-goal">🎯 هدف: <b>${esc(rawGoals.map(g=>goalLabels[g]||g).join('، ')||'ثبت نشده')}</b></span>
                  ${bmi!==null?`<span class="rvw-chip">شاخص بدنی <b>${faNum(bmi)} — ${bmiTxt}</b></span>`:''}
                </div>
              </div>
            </div>
            <div class="rvw-head-links">
              <a class="rvw-link" href="/students/${esc(student.case_number||student.id)}/timeline">📜 تاریخچه</a>
              <a class="rvw-link" href="/users-list/${esc(student.case_number||student.id)}">👤 پروفایل</a>
            </div>
          </header>

          ${card('🎯','هدف اصلی و اولویت‌های دوره',`<div class="rvw-goals">${goalTags||emptyBox('هدفی ثبت نشده')}</div>${studentNote}`)}
          ${card('👤','اطلاعات فردی و ارتباطی',table(personalRows,'اطلاعات فردی ثبت نشده'))}
          ${card('📊','اندازه‌های بدنی و آنتروپومتریک',`
            ${bmi!==null?`<div class="rvw-bmi ${bmiKind}"><span class="rvw-bmi-val">شاخص توده بدنی: <b>${faNum(bmi)}</b></span>${pill(bmiTxt,bmiKind)}<small>بر پایه قد ${faNum(hNum)} سانتی‌متر و وزن ${faNum(wNum)} کیلوگرم</small></div>`:''}
            ${table(measRows,'اندازه‌ای ثبت نشده')}`)}
          ${card('🛡️','سوابق پزشکی، آسیب‌ها و سلامت مفاصل',medicalInner,hasRisk?'نیازمند توجه ⚠':'')}
          ${card('🏋️','سابقه ورزشی و تمرینی',table(sportsRows,'سابقه ورزشی ثبت نشده'))}
          ${card('🥗','تغذیه و الگوی غذایی',table(nutritionRows,'اطلاعات تغذیه ثبت نشده'))}
          ${card('⏱️','عادت‌های روزمره',table(habitRows,'عادتی ثبت نشده'))}
          ${student.gender==='female'?card('🤱','بارداری و زایمان',table(pregRows,'اطلاعات بارداری و زایمان ثبت نشده')):''}
          ${photosCard}
          ${docsCard}
          ${compareCard}
          ${decideCard}
        </div>`;

      async function decide(action,requiresNote){
        const feedback=document.querySelector('#reviewActionFeedback');
        const note=document.querySelector('#coachNote').value.trim();
        if(requiresNote&&!note){feedback.textContent='برای این تصمیم، نوشتن یادداشت الزامی است.';feedback.classList.add('bad');return;}
        document.querySelectorAll('button.rvw-act').forEach(b=>b.disabled=true);
        feedback.textContent='در حال ثبت تصمیم…';
        try{
          if(lifecycle==='SUBMITTED')await api(`/api/assessments/${id}/under-review`,{method:'POST'});
          await api(`/api/assessments/${id}/${action}`,{method:'POST',body:JSON.stringify({coach_note:note})});
          if(action==='approve')location.href=`/programs/exercise/form?student_id=${student.id}&assessment_id=${id}`;
          else location.reload();
        }catch(error){
          feedback.textContent=error.message;feedback.classList.add('bad');
          document.querySelectorAll('button.rvw-act').forEach(b=>{b.disabled=false;});
        }
      }
      document.querySelector('#btnApprove')?.addEventListener('click',()=>decide('approve',false));
      document.querySelector('#btnRequestChanges')?.addEventListener('click',()=>decide('request-changes',true));
      document.querySelector('#btnReject')?.addEventListener('click',()=>decide('reject',true));
      document.querySelector('#btnDeleteAssessment')?.addEventListener('click',async()=>{
        if(!confirm(`ارزیابی شماره ${ass.assessment_number} شاگرد «${student.full_name}» همراه با عکس‌ها و مدارکش برای همیشه حذف شود؟`))return;
        const feedback=document.querySelector('#reviewActionFeedback'),button=document.querySelector('#btnDeleteAssessment');
        button.disabled=true;feedback.textContent='در حال حذف…';
        try{await api(`/api/assessments/${id}`,{method:'DELETE'});location.href='/students/submissions';}
        catch(error){feedback.textContent=error.message;button.disabled=false;}
      });
      document.querySelector('#btnAiBuildProgram')?.addEventListener('click',()=>{if(window.openAICopilot)window.openAICopilot({studentId:student.id,assessmentId:id});});
      document.querySelector('#btnAiAnalyze')?.addEventListener('click',()=>{if(window.openAIAssessmentModal)window.openAIAssessmentModal({student,assessment:ass,assessmentDetails:details,assessmentId:id});});
    }catch(error){
      content.innerHTML=`<section class="coach-review-error"><b>ارزیابی باز نشد</b><p>${esc(error.message)}</p><a class="btn btn-secondary" href="/students/submissions">بازگشت به فهرست</a></section>`;
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
            <button class="btn btn-secondary" data-back>← بازگشت</button>
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
                    <button class="btn btn-secondary btn-small" data-open-assessment="${a.id}" style="margin-top:8px">بررسی</button>
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
                    <button class="btn btn-primary btn-small" data-edit-program="${p.id}">ویرایش برنامه</button>
                  </div>
                </div>
                `;
              }
            }).join('')}
          </div>
        </div>
      `;
      content.querySelector('[data-back]').onclick=()=>history.back();
      content.querySelectorAll('[data-open-assessment]').forEach(b=>{
        b.onclick=()=>{ location.href=`/assessments/${b.dataset.openAssessment}`; };
      });
      content.querySelectorAll('[data-edit-program]').forEach(b=>{
        b.onclick=()=>{ location.href=`/programs/exercise/form?id=${b.dataset.editProgram}`; };
      });
    } catch (e) {
      content.innerHTML = `<div style="color:var(--danger)">خطا: ${esc(e.message)}</div>`;
    }
  };
})();
