(() => {
  const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(url, opt={}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'خطا');
    return d;
  }
  const detailLabels={height:'قد',weight:'وزن',around_the_arm:'دور بازو',around_the_chest:'دور سینه',around_the_belly:'دور شکم',around_the_hips:'دور باسن',around_the_leg:'دور ساق',around_the_thigh:'دور ران',around_the_wrist:'دور مچ',disease_details:'بیماری',medication_details:'دارو',injury_details:'آسیب',surgery_details:'جراحی',last_blood_test_notes:'آزمایش خون',corrective_notes:'ناهنجاری اصلاحی',average_daily_activity:'فعالیت روزانه',practice_history_details:'سابقه تمرین',current_practice_details:'تمرین فعلی',supplement_details:'مکمل',doping_history:'دوپینگ',diet_type:'نوع رژیم',food_allergies:'حساسیت غذایی',weight_changes:'تغییر وزن',appetite_status:'اشتها',defecation_problem:'دفع',breakfast:'صبحانه',lunch:'نهار',dinner:'شام',smoking_details:'دخانیات',alcohol_details:'الکل'};
  function detailsCard(title,object){
    if(!object)return `<section class="assessment-detail-group"><h3>${title}</h3><p class="muted">ثبت نشده</p></section>`;
    const hidden=new Set(['assessment_id','created_at','updated_at']);
    const entries=Object.entries(object).filter(([key,value])=>!hidden.has(key)&&value!==null&&value!==''&&!key.startsWith('has_')&&![0,1].includes(value));
    return `<section class="assessment-detail-group"><h3>${title}</h3><div>${entries.map(([key,value])=>`<span><small>${esc(detailLabels[key]||key)}</small><b>${esc(value)}</b></span>`).join('')||'<p class="muted">موردی ثبت نشده</p>'}</div></section>`;
  }
  function measurementComparison(current,previous){
    if(!current||!previous)return '';
    const keys=['weight','height','around_the_arm','around_the_chest','around_the_belly','around_the_hips','around_the_thigh','around_the_leg','around_the_wrist'];
    return `<div class="measurement-comparison">${keys.filter(key=>current[key]!=null||previous[key]!=null).map(key=>{const change=Number.isFinite(Number(current[key]))&&Number.isFinite(Number(previous[key]))?(Number(current[key])-Number(previous[key])).toFixed(1):'—';return `<span><small>${esc(detailLabels[key]||key)}</small><b>${esc(previous[key]??'—')} ← ${esc(current[key]??'—')}</b><i>${change==='—'?'':`${change>0?'+':''}${change}`}</i></span>`}).join('')}</div>`;
  }
  function photoPreferenceState(assessment){
    if(assessment.body_photos_preference==='declined')return '<div class="photo-preference-state declined">— این شاگرد ترجیح داده است تصاویر بدنی ارسال نکند.</div>';
    if(assessment.body_photos_preference==='willing')return `<div class="photo-preference-state willing">✓ مایل به ارسال تصاویر • ${(assessment.photos||[]).length} تصویر ارسال شده</div>`;
    return '<div class="photo-preference-state legacy">انتخاب تصاویر در این ارزیابی قدیمی ثبت نشده است.</div>';
  }

  function root(label){
    return `
    <div class="program-builder">
      <div class="page-head">
        <div><p class="eyebrow">ارزیابی‌ها</p><h1>${label}</h1><p>درخواست‌های جدید شاگردان برای بررسی</p></div>
        <button class="btn btn-secondary" id="btnRefresh">🔄 بروزرسانی</button>
      </div>
      <div id="submissionsList" class="program-list">در حال بارگذاری...</div>
    </div>
    `;
  }

  async function loadSubmissions(){
    const host=document.getElementById('submissionsList');
    try {
      const list=await api('/api/student-submissions');
      if(list.length===0){
        host.innerHTML=`<div class="empty-state"><div class="empty-icon">📋</div><h3>درخواستی نیست</h3><p>هنوز شاگردی ارزیابی ارسال نکرده است. لینک دعوت بسازید و برای شاگرد بفرستید.</p></div>`;
        return;
      }
      host.innerHTML = list.map(item=>`
        <div class="program-card">
          <h3>${esc(item.full_name)} <span class="case-chip">پرونده ${esc(item.case_number||'------')}</span> <small style="color:var(--text-muted)">ارزیابی ${item.assessment_number}</small></h3>
          <p>وزن: ${item.weight||'—'}kg • قد: ${item.height||'—'} • ${esc(item.goal||'')}</p>
          <div class="program-meta">
            <span>📅 ${new Date(item.submitted_at||item.created_at).toLocaleDateString('fa-IR')}</span>
            <span>${item.body_photos_preference==='declined'?'— عدم تمایل به تصاویر':`📸 ${item.photo_count||0} عکس`}</span>
            <span>📚 ${item.total_assessments||0} ارزیابی کل</span>
            <span>🔑 ${esc(fa(item.status))}</span>
          </div>
          <div class="program-actions">
            <a class="btn btn-primary btn-small" href="/assessments/${item.id}">مشاهده ارزیابی</a>
            <button class="btn btn-secondary btn-small" onclick="location.href='/students/${item.case_number||item.student_id}/timeline'">📜 تاریخچه شاگرد</button>
          </div>
        </div>
      `).join('');
    } catch(e){
      host.innerHTML=`<div style="color:var(--danger)">خطا: ${esc(e.message)}</div>`;
    }
  }

  window.renderCoachSubmissions = async (label, route) => {
    document.querySelector('#breadcrumb').textContent=label;
    document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active',x.dataset.route===route));
    document.querySelector('#content').innerHTML = root(label);
    document.getElementById('btnRefresh').onclick=loadSubmissions;
    await loadSubmissions();
  };

  window.renderAssessmentReview = async (label, route) => {
    const match=route.match(/^\/assessments\/(\d+)$/),id=match?Number(match[1]):null;
    const content=document.querySelector('#content');
    document.querySelector('#breadcrumb').textContent='بررسی ارزیابی';
    document.querySelectorAll('.menu-link').forEach(item=>item.classList.remove('active'));
    if(!id){content.innerHTML='<section class="coach-review-error">شناسه ارزیابی معتبر نیست.</section>';return;}
    content.innerHTML='<div class="coach-review-loading"><span></span><p>در حال دریافت ارزیابی…</p></div>';

    const labels={
      full_name:'نام و نام خانوادگی',mobile:'موبایل',telegram_id:'تلگرام',instagram_id:'اینستاگرام',date_of_birth:'تاریخ تولد',gender:'جنسیت',preferred_location:'محل تمرین',
height:'قد',weight:'وزن',around_the_arm:'دور بازو',around_the_chest:'دور سینه',around_the_belly:'دور شکم',around_the_hips:'دور باسن',around_the_leg:'دور ساق',around_the_thigh:'دور ران',around_the_wrist:'دور مچ',body_fat:'درصد چربی',muscle_mass:'توده عضلانی',
      has_disease:'سابقه بیماری',disease_details:'شرح بیماری',has_medication:'مصرف دارو',medication_details:'شرح دارو',has_injury:'آسیب‌دیدگی',injury_details:'شرح آسیب',has_surgery:'سابقه جراحی',surgery_details:'شرح جراحی',last_blood_test_notes:'آزمایش خون',corrective_notes:'تمرین اصلاحی',
      average_daily_activity:'فعالیت روزانه',practice_history:'سابقه تمرین',practice_history_details:'شرح سابقه',practice_duration:'مدت سابقه',sport_discipline:'رشته ورزشی',practice_now:'تمرین فعلی',current_practice_details:'شرح تمرین فعلی',practice_place:'محل تمرین',home_equipment:'تجهیزات منزل',sessions_per_week:'جلسه در هفته',supplement_history:'مصرف مکمل',supplement_details:'شرح مکمل',doping_history:'سابقه دوپینگ',
      diet_type:'الگوی غذایی',previous_diet:'سابقه رژیم',previous_diet_duration:'مدت رژیم',previous_diet_type:'نوع رژیم قبلی',previous_diet_notes:'توضیح رژیم قبلی',food_allergies:'حساسیت غذایی',weight_changes:'تغییرات وزن',appetite_status:'وضعیت اشتها',appetite_notes:'توضیح اشتها',defecation_problem:'وضعیت دفع',breakfast:'صبحانه',lunch:'ناهار',dinner:'شام',
      smoking:'مصرف دخانیات',smoking_details:'شرح دخانیات',alcohol:'مصرف الکل',alcohol_details:'شرح الکل',
      childbirth_history:'سابقه زایمان',childbirth_count:'تعداد زایمان',childbirth_type:'نوع زایمان',childbirth_notes:'توضیحات زایمان',breastfeeding:'شیردهی',breastfeeding_notes:'توضیحات شیردهی',child_age_months:'سن کودک به ماه',formula_use:'مصرف شیر خشک',formula_type:'نوع شیر خشک',formula_amount:'مقدار شیر خشک',formula_frequency:'دفعات شیر خشک',child_food_allergy:'حساسیت غذایی کودک',child_food_allergy_notes:'شرح حساسیت کودک',
      student_note:'توضیحات شاگرد',limitations:'محدودیت‌ها',injuries:'آسیب‌ها'
    };
    const enumLabels={female:'خانم',male:'آقا',gym:'باشگاه',home:'منزل',low:'کم',medium:'متوسط',high:'زیاد',iranian:'سفره ایرانی',professional:'رژیم حرفه‌ای',low_eating:'کم‌خوری',grazing:'ریزخوری',overeating:'پرخوری',emotional_overeating:'پرخوری عصبی',anorexia:'بی‌اشتهایی عصبی',none:'بدون مشکل',constipation:'یبوست',diarrhea:'اسهال',difficult_defecation:'دفع سخت',natural:'طبیعی',cesarean:'سزارین'};
    const booleanKeys=new Set(['has_disease','has_medication','has_injury','has_surgery','practice_history','practice_now','supplement_history','previous_diet','smoking','alcohol','childbirth_history','breastfeeding','formula_use','child_food_allergy']);
    const hiddenKeys=new Set(['id','stable_id','assessment_id','student_id','created_at','updated_at','deleted_at','version']);
    const valueFor=(key,value)=>booleanKeys.has(key)?(Number(value)===1?'بله':'خیر'):(enumLabels[value]||value);
    const rowsFrom=(object,allowed=null)=>{
      if(!object)return [];
      return Object.entries(object).filter(([key,value])=>!hiddenKeys.has(key)&&(!allowed||allowed.includes(key))&&value!==null&&value!==undefined&&value!=='').map(([key,value])=>[labels[key]||key,valueFor(key,value)]);
    };
    const group=(title,rows,icon)=>rows.length?`<section class="coach-review-group"><header><span>${icon}</span><h2>${title}</h2></header><dl>${rows.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`:'';

    try{
      const data=await api(`/api/assessments/${id}`),ass=data.assessment,student=data.student,details=data.assessment_details||{},lifecycle=ass.lifecycle_status||ass.status;
      const lifecycleLabels={SUBMITTED:'ارسال‌شده',PENDING_REVIEW:'در حال بررسی',APPROVED:'تأییدشده',REJECTED:'ردشده',CHANGES_REQUESTED:'نیازمند اصلاح'};
      const rawGoals=(details.goals||[]).length?details.goals:String(ass.goal||student.goal||'').split(',').filter(Boolean),goals=rawGoals.map(goal=>({weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',fitness:'فیتنس',maintenance:'تثبیت وزن',muscle_gain:'عضله‌سازی',fat_loss:'چربی‌سوزی',competition:'آمادگی مسابقه'}[goal]||goal));
      const measurementData=details.measurements?{...details.measurements}:{height:ass.height,weight:ass.weight,around_the_chest:ass.chest,around_the_belly:ass.waist,around_the_hips:ass.hips};if(ass.body_fat!=null)measurementData.body_fat=ass.body_fat;if(ass.muscle_mass!=null)measurementData.muscle_mass=ass.muscle_mass;
      const profileRows=rowsFrom(student,['mobile','telegram_id','instagram_id','date_of_birth','gender','preferred_location']);
      const noteRows=[];if(ass.student_note)noteRows.push(['توضیحات شاگرد',ass.student_note]);if(ass.limitations||student.limitations)noteRows.push(['محدودیت‌ها',ass.limitations||student.limitations]);if(ass.injuries||student.injuries)noteRows.push(['آسیب‌ها',ass.injuries||student.injuries]);
      const medicalRows=rowsFrom(details.medical);if((details.medical_items||[]).length)medicalRows.push(['موارد انتخاب‌شده',details.medical_items.map(item=>item.name).filter(Boolean).join('، ')]);
      const reviewable=['SUBMITTED','PENDING_REVIEW'].includes(lifecycle);
      const photos=ass.photos||[],documents=ass.documents||[];

      content.innerHTML=`
        <div class="coach-review-page">
          <header class="coach-review-hero">
            <div class="coach-review-heading"><a href="/students/submissions" class="review-back" aria-label="بازگشت">→</a><div><p class="eyebrow">بررسی ارزیابی ${ass.assessment_number}</p><h1>${esc(student.full_name)}</h1><div class="review-meta"><span class="case-chip">پرونده <b>${esc(student.case_number||'------')}</b></span><span>${ass.submitted_at?new Date(ass.submitted_at).toLocaleString('fa-IR'):'تاریخ ارسال ثبت نشده'}</span><span class="review-status ${esc(lifecycle.toLowerCase())}">${esc(lifecycleLabels[lifecycle]||fa(lifecycle))}</span></div></div></div>
            <div class="review-header-links"><a class="secondary" href="/students/${student.case_number||student.id}/timeline">تاریخچه شاگرد</a><a class="secondary" href="/users-list/${student.case_number||student.id}">پروفایل شاگرد</a></div>
          </header>

          <div class="coach-review-layout">
            <main class="coach-review-main">
              ${group('اطلاعات شخصی',profileRows,'●')}
              ${group('هدف دوره',goals.length?[['هدف اصلی',goals.join('، ')]]:[],'◆')}
              ${group('اندازه‌های بدن',rowsFrom(measurementData),'↕')}
              ${group('سوابق پزشکی',medicalRows,'＋')}
              ${group('سابقه ورزشی',rowsFrom(details.sports),'↗')}
              ${group('تغذیه',rowsFrom(details.nutrition),'◐')}
              ${group('عادت‌های روزمره',rowsFrom(details.habits),'○')}
              ${group('بارداری و زایمان',rowsFrom(details.pregnancy),'◇')}
              ${group('توضیحات تکمیلی',noteRows,'✎')}

              ${photos.length?`<section class="coach-review-group coach-review-photos"><header><span>▧</span><h2>تصاویر خصوصی</h2><b>${photos.length} تصویر</b></header><div class="review-photo-grid">${photos.map(photo=>`<a href="/api/student-photos/${photo.id}" target="_blank" rel="noopener"><img src="/api/student-photos/${photo.id}" alt="تصویر خصوصی ${esc(photo.photo_type)}"><small>${esc(photo.photo_type)}</small></a>`).join('')}</div></section>`:''}
              ${documents.length?`<section class="coach-review-group"><header><span>⌑</span><h2>مدارک خصوصی</h2></header><div class="review-document-list">${documents.map(document=>`<a href="/api/student-documents/${document.id}" target="_blank" rel="noopener"><div><b>${esc(document.original_filename)}</b><small>${esc(document.document_type)} • ${Math.ceil(document.size_bytes/1024)} KB</small></div><span>مشاهده</span></a>`).join('')}</div></section>`:''}

              ${data.previous_assessment&&details.measurements&&data.previous_assessment_details?.measurements?`<section class="coach-review-group"><header><span>◫</span><h2>مقایسه با ارزیابی قبلی</h2></header>${measurementComparison(details.measurements,data.previous_assessment_details.measurements)}</section>`:''}
            </main>

            <aside class="coach-review-sidebar">
              <section class="review-decision-card">
                <div><p class="eyebrow">تصمیم مربی</p><h2>${reviewable?'نتیجه بررسی را ثبت کنید':esc(lifecycleLabels[lifecycle]||fa(lifecycle))}</h2></div>
                <button type="button" class="btn btn-secondary btn-small" id="btnAiAnalyze" style="width:100%;margin-bottom:8px;font-size:10px;font-weight:750;">🤖 تحلیل ارزیابی و پیشنهاد یادداشت با AI</button>
                <label>یادداشت برای شاگرد<textarea id="coachNote" maxlength="4000" placeholder="توضیح کوتاه و روشن…">${esc(ass.coach_note||'')}</textarea></label>
                <div class="review-actions">
                  <button class="review-action approve" id="btnApprove" ${reviewable?'':'disabled'}>✓ <span>تأیید</span></button>
                  <button class="review-action revise" id="btnRequestChanges" ${reviewable?'':'disabled'}>↻ <span>درخواست اصلاح</span></button>
                  <button class="review-action reject" id="btnReject" ${reviewable?'':'disabled'}>× <span>رد</span></button>
                  <a class="review-action message" href="/users-list/${student.case_number||student.id}">✉ <span>پیام به شاگرد</span></a>
                </div>
                <p class="review-action-feedback" id="reviewActionFeedback" role="alert"></p>
                ${lifecycle==='APPROVED'?`
                  <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
                    <button type="button" class="btn btn-primary review-program-link" id="btnAiBuildProgram" style="width:100%;font-weight:850;display:flex;align-items:center;justify-content:center;gap:6px;">
                      🤖 ساخت برنامه با AI
                    </button>
                    <a class="secondary review-program-link" href="/programs/exercise/form?student_id=${student.id}&assessment_id=${id}" style="text-align:center;">
                      ساخت برنامه ۳۰ روزه (دستی)
                    </a>
                  </div>
                `:''}
              </section>
            </aside>
          </div>
        </div>`;

      async function decide(action,requiresNote){
        const feedback=document.querySelector('#reviewActionFeedback'),note=document.querySelector('#coachNote').value.trim();
        if(requiresNote&&!note){feedback.textContent='برای این تصمیم، نوشتن یادداشت الزامی است.';return;}
        document.querySelectorAll('.review-action button,button.review-action').forEach(button=>button.disabled=true);feedback.textContent='در حال ثبت تصمیم…';
        try{
          if(lifecycle==='SUBMITTED')await api(`/api/assessments/${id}/under-review`,{method:'POST'});
          await api(`/api/assessments/${id}/${action}`,{method:'POST',body:JSON.stringify({coach_note:note})});
          if(action==='approve')location.href=`/programs/exercise/form?student_id=${student.id}&assessment_id=${id}`;
          else location.reload();
        }catch(error){feedback.textContent=error.message;document.querySelectorAll('button.review-action').forEach(button=>button.disabled=false);}
      }
      document.querySelector('#btnApprove')?.addEventListener('click',()=>decide('approve',false));
      document.querySelector('#btnRequestChanges')?.addEventListener('click',()=>decide('request-changes',true));
      document.querySelector('#btnReject')?.addEventListener('click',()=>decide('reject',true));
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
    }catch(error){
      content.innerHTML=`<section class="coach-review-error"><b>ارزیابی باز نشد</b><p>${esc(error.message)}</p><a class="secondary" href="/students/submissions">بازگشت به فهرست</a></section>`;
    }
  };

  window.renderStudentTimeline = async (label, route) => {
    const match=route.match(/\/students\/(\d+)\/(?:timeline|assessments)/);
    const studentId=match?match[1]:null;
    if(!studentId) return;
    document.querySelector('#breadcrumb').textContent='تایم‌لاین شاگرد';
    const content=document.querySelector('#content');
    content.innerHTML=`<div style="text-align:center;padding:40px">در حال بارگذاری تایم‌لاین...</div>`;
    try {
      const data=await api(`/api/students/${studentId}/timeline`);
      const student=data.student;
      content.innerHTML=`
        <div class="program-builder">
          <div class="page-head"><div><h1>📜 تایم‌لاین ${esc(student.full_name)}</h1><p><span class="case-chip">پرونده ${esc(student.case_number||'------')}</span> • ارزیابی‌ها و برنامه‌های ماهانه</p></div><button class="btn btn-secondary" onclick="history.back()">← بازگشت</button></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${(data.timeline||[]).map(item=>{
              if(item.type==='assessment'){
                const a=item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">📋</div>
                  <div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">ارزیابی #${a.assessment_number} - ${esc(fa(a.status))}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">وزن: ${a.weight}kg • ${new Date(a.date).toLocaleDateString('fa-IR')}</p>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">${(a.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:60px;height:60px;border-radius:8px;object-fit:cover">`).join('')}</div>
                    <button class="btn btn-secondary btn-small" onclick="location.href='/assessments/${a.id}'" style="margin-top:8px">بررسی</button>
                  </div>
                </div>
                `;
              } else if(item.type==='workout'){
                const workout=item.data;return `<div style="display:flex;gap:16px"><div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">✓</div><div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px"><h3 style="margin:0 0 8px">تمرین ${esc(workout.program_title)} • روز ${workout.day_number}</h3><p>${esc(fa(workout.status))} • ${new Date(item.date).toLocaleDateString('fa-IR')}</p></div></div>`;
              } else {
                const p=item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">💪</div>
                  <div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">${esc(p.title)}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">📅 ${esc(p.start_date||'')} تا ${esc(p.end_date||'')} • ${esc(fa(p.status))}</p>
                    <button class="btn btn-primary btn-small" onclick="location.href='/programs/exercise/form?id=${p.id}'">ویرایش برنامه</button>
                  </div>
                </div>
                `;
              }
            }).join('')}
          </div>
          <div style="margin-top:20px">
            <h3>ارزیابی‌ها</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
              ${(data.assessments||[]).map(a=>`
                <div class="program-card">
                  <h3>ارزیابی #${a.assessment_number}</h3>
                  <p>وزن: ${a.weight}kg • وضعیت: ${esc(fa(a.status))}</p>
                  <button class="btn btn-secondary btn-small" onclick="location.href='/assessments/${a.id}'">بررسی</button>
                </div>
              `).join('')}
            </div>
            <h3 style="margin-top:20px">برنامه‌ها</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
              ${(data.programs||[]).map(p=>`
                <div class="program-card">
                  <h3>${esc(p.title)}</h3>
                  <p>${esc(p.coach_note||'')}</p>
                  <button class="btn btn-primary btn-small" onclick="location.href='/programs/exercise/form?id=${p.id}'">ویرایش</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    } catch(e){
      content.innerHTML=`<div style="color:var(--danger)">خطا: ${esc(e.message)}</div>`;
    }
  };
})();
