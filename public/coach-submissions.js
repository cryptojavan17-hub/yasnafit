(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(url, opt={}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'خطا');
    return d;
  }
  const detailLabels={height:'قد',weight:'وزن',around_the_arm:'دور بازو',around_the_chest:'دور سینه',around_the_belly:'دور شکم',around_the_belly_from_the_navel:'دور ناف',around_the_hips:'دور باسن',around_the_leg:'دور ساق',around_the_thigh:'دور ران',around_the_wrist:'دور مچ',disease_details:'بیماری',medication_details:'دارو',injury_details:'آسیب',surgery_details:'جراحی',last_blood_test_notes:'آزمایش خون',corrective_notes:'ناهنجاری اصلاحی',average_daily_activity:'فعالیت روزانه',practice_history_details:'سابقه تمرین',current_practice_details:'تمرین فعلی',supplement_details:'مکمل',doping_history:'دوپینگ',diet_type:'نوع رژیم',food_allergies:'حساسیت غذایی',weight_changes:'تغییر وزن',appetite_status:'اشتها',defecation_problem:'دفع',breakfast:'صبحانه',lunch:'نهار',dinner:'شام',smoking_details:'دخانیات',alcohol_details:'الکل'};
  function detailsCard(title,object){
    if(!object)return `<section class="assessment-detail-group"><h3>${title}</h3><p class="muted">ثبت نشده</p></section>`;
    const hidden=new Set(['assessment_id','created_at','updated_at']);
    const entries=Object.entries(object).filter(([key,value])=>!hidden.has(key)&&value!==null&&value!==''&&!key.startsWith('has_')&&![0,1].includes(value));
    return `<section class="assessment-detail-group"><h3>${title}</h3><div>${entries.map(([key,value])=>`<span><small>${esc(detailLabels[key]||key)}</small><b>${esc(value)}</b></span>`).join('')||'<p class="muted">موردی ثبت نشده</p>'}</div></section>`;
  }
  function measurementComparison(current,previous){
    if(!current||!previous)return '';
    const keys=['weight','height','around_the_arm','around_the_chest','around_the_belly','around_the_belly_from_the_navel','around_the_hips','around_the_thigh','around_the_leg','around_the_wrist'];
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
          <h3>${esc(item.full_name)} <small style="color:var(--text-muted)">#${item.assessment_number}</small></h3>
          <p>وزن: ${item.weight||'—'}kg • قد: ${item.height||'—'} • ${esc(item.goal||'')}</p>
          <div class="program-meta">
            <span>📅 ${new Date(item.submitted_at||item.created_at).toLocaleDateString('fa-IR')}</span>
            <span>${item.body_photos_preference==='declined'?'— عدم تمایل به تصاویر':`📸 ${item.photo_count||0} عکس`}</span>
            <span>📚 ${item.total_assessments||0} ارزیابی کل</span>
            <span>🔑 ${esc(item.status)}</span>
          </div>
          <div class="program-actions">
            <button class="btn btn-primary btn-small" onclick="location.href='/assessments/${item.id}'">👁 بررسی</button>
            <button class="btn btn-secondary btn-small" onclick="location.href='/students/${item.student_id}/timeline'">📜 تاریخچه شاگرد</button>
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
    const match = route.match(/\/assessments\/(\d+)/);
    const id = match ? Number(match[1]) : null;
    if(!id) return;

    document.querySelector('#breadcrumb').textContent='بررسی ارزیابی';
    document.querySelectorAll('.menu-link').forEach(x=>x.classList.remove('active'));
    const content=document.querySelector('#content');
    content.innerHTML=`<div style="text-align:center;padding:40px">در حال بارگذاری ارزیابی #${id}...</div>`;

    try {
      const data=await api(`/api/assessments/${id}`);
      const ass=data.assessment;
      const student=data.student;
      const prev=data.previous_assessment;
      const prevProg=data.previous_program;
      const details=data.assessment_details||{};
      const prevDetails=data.previous_assessment_details||{};
      const lifecycle=ass.lifecycle_status||ass.status;

      content.innerHTML=`
        <div class="program-builder">
          <div class="order-header">
            <div><h2>ارزیابی #${ass.assessment_number} - ${esc(student.full_name)} • ${esc(lifecycle)}</h2><small>${esc(ass.assessment_type||'INITIAL')} • ایجاد: ${new Date(ass.created_at).toLocaleString('fa-IR')} • ارسال: ${ass.submitted_at?new Date(ass.submitted_at).toLocaleString('fa-IR'):'—'} • وزن: ${ass.weight}kg</small></div>
            <button class="btn btn-secondary" onclick="history.back()">← بازگشت</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div>
              <section class="sp-card">
                <h2>👤 ${esc(student.full_name)}</h2>
                <p style="font-size:13px;line-height:1.8">
                  موبایل: ${esc(student.mobile||'—')}<br>
                  هدف: ${esc(student.goal||ass.goal||'—')}<br>
                  قد: ${student.height||ass.height||'—'}<br>
                  وزن فعلی: ${ass.weight||'—'}kg<br>
                  سابقه: ${esc(student.training_experience||'—')}<br>
                  محدودیت: ${esc(student.limitations||ass.limitations||'—')}
                </p>
              </section>

              <section class="sp-card">
                <h2>📋 ارزیابی فعلی #${ass.assessment_number}</h2>
                <p style="font-size:12px;line-height:1.8">
                  وزن: ${ass.weight}kg • کمر: ${ass.waist||'—'} • سینه: ${ass.chest||'—'} • باسن: ${ass.hips||'—'}<br>
                  چربی: ${ass.body_fat||'—'}% • عضله: ${ass.muscle_mass||'—'}<br>
                  یادداشت شاگرد: ${esc(ass.student_note||'—')}<br>
                  یادداشت مربی: ${esc(ass.coach_note||'—')}
                </p>
                ${photoPreferenceState(ass)}
                ${ass.body_photos_preference==='declined'?'':`<div class="private-photo-gallery">
                  ${(ass.photos||[]).map(p=>`
                    <div class="private-photo-item">
                      <img src="/api/student-photos/${p.id}" alt="تصویر خصوصی ${esc(p.photo_type)}">
                      <small>${esc(p.photo_type)}</small>
                    </div>
                  `).join('') || '<span class="muted">تصویری ارسال نشده است؛ این موضوع مانع بررسی نیست.</span>'}
                </div>`}
                <h3 style="margin-top:14px">مدارک پزشکی و آنالیز</h3>
                <div class="document-list">${(ass.documents||[]).map(document=>`<article><a href="/api/student-documents/${document.id}" target="_blank" rel="noopener"><b>${esc(document.original_filename)}</b><span>${esc(document.document_type)} • ${Math.ceil(document.size_bytes/1024)} KB</span></a></article>`).join('')||'<p class="muted">ارسال نشده • اختیاری</p>'}</div>
              </section>
              <section class="sp-card assessment-detail-sections">
                <h2>جزئیات حرفه‌ای پرونده</h2>
                <section class="assessment-detail-group"><h3>اطلاعات کلی</h3><div><span><small>اهداف</small><b>${esc((details.goals||[]).join('، ')||'—')}</b></span></div></section>
                ${detailsCard('اندازه‌ها',details.measurements)}
                ${detailsCard('سوابق پزشکی',details.medical)}
                ${detailsCard('سوابق ورزشی',details.sports)}
                ${detailsCard('تغذیه',details.nutrition)}
                ${detailsCard('عادات',details.habits)}
                ${detailsCard('بارداری و زایمان',details.pregnancy)}
              </section>

              ${prev?`
              <section class="sp-card" style="border-color:var(--border-strong);background:var(--glass-hover)">
                <h2>📚 مقایسه با ارزیابی قبلی #${prev.assessment_number}</h2>
                <p style="font-size:12px">
                  وزن قبلی: ${prev.weight}kg → فعلی: ${ass.weight}kg • تفاوت: ${(ass.weight - prev.weight).toFixed(1)}kg<br>
                  کمر قبلی: ${prev.waist||'—'} → فعلی: ${ass.waist||'—'}<br>
                </p>
                ${measurementComparison(details.measurements,prevDetails.measurements)}
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <div><small>قبلی:</small>${photoPreferenceState(prev)}${prev.body_photos_preference==='declined'?'':(prev.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--border);margin:2px">`).join('')}</div>
                  <div><small>فعلی:</small>${photoPreferenceState(ass)}${ass.body_photos_preference==='declined'?'':(ass.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--border-strong);margin:2px">`).join('')}</div>
                </div>
                ${prevProg?`<div style="margin-top:10px"><small>برنامه قبلی: ${esc(prevProg.title)}</small></div>`:''}
              </section>
              `:''}
            </div>

            <div>
              <section class="sp-card">
                <h2>✅ تصمیم مربی</h2>
                <textarea id="coachNote" placeholder="یادداشت برای شاگرد..." style="width:100%;min-height:80px;border:1px solid var(--border);border-radius:10px;padding:10px">${esc(ass.coach_note||'')}</textarea>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                  ${lifecycle==='SUBMITTED'?'<button class="btn btn-secondary" id="btnUnderReview">🔍 شروع بررسی</button>':''}
                  ${lifecycle==='PENDING_REVIEW'?'<button class="btn btn-danger" id="btnRequestChanges">✏️ درخواست اصلاح</button><button class="btn btn-danger" id="btnReject">رد پرونده</button><button class="btn btn-primary" id="btnApprove">✅ تایید پرونده</button>':''}
                </div>
                <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
                  ${lifecycle==='APPROVED'?'<button class="btn btn-primary" id="btnCreateProgram">💪 ساخت برنامه یک ماهه</button>':'<span class="muted">ساخت برنامه پس از تأیید پرونده فعال می‌شود.</span>'}
                  <small style="display:block;color:var(--text-muted);font-size:11px;margin-top:6px">از Program Builder موجود استفاده می‌شود و به ارزیابی لینک می‌شود</small>
                </div>
              </section>

              <section class="sp-card">
                <h2>📜 تایم‌لاین شاگرد</h2>
                <div id="timelineMini">در حال بارگذاری...</div>
              </section>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btnUnderReview')?.addEventListener('click',async()=>{
        await api(`/api/assessments/${id}/under-review`, {method:'POST'});location.reload();
      });
      document.getElementById('btnRequestChanges')?.addEventListener('click',async()=>{
        const note=document.getElementById('coachNote').value;if(!note.trim())return alert('یادداشت مربی الزامی است.');
        await api(`/api/assessments/${id}/request-changes`, {method:'POST', body: JSON.stringify({coach_note: note})});location.reload();
      });
      document.getElementById('btnReject')?.addEventListener('click',async()=>{
        const note=document.getElementById('coachNote').value;if(!note.trim())return alert('برای رد پرونده یادداشت مربی الزامی است.');
        await api(`/api/assessments/${id}/reject`,{method:'POST',body:JSON.stringify({coach_note:note})});location.reload();
      });
      document.getElementById('btnApprove')?.addEventListener('click',async()=>{
        const note=document.getElementById('coachNote').value;
        await api(`/api/assessments/${id}/approve`, {method:'POST', body: JSON.stringify({coach_note: note})});location.reload();
      });
      document.getElementById('btnCreateProgram')?.addEventListener('click',()=>{
        location.href=`/programs/exercise/form?student_id=${student.id}&assessment_id=${id}`;
      });

      // Load timeline
      try {
        const full=await api(`/api/students/${student.id}/timeline`);
        const host=document.getElementById('timelineMini');
        host.innerHTML = (full.timeline||[]).map(item=>{
          if(item.type==='assessment'){
            return `<div style="padding:8px;background:var(--surface-inset);border-radius:8px;margin-bottom:6px"><b>ارزیابی #${item.data.assessment_number}</b> - ${esc(item.data.status)}<br><small>${item.data.weight||''}kg • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div>`;
          } else if(item.type==='workout'){
            return `<div style="padding:8px;background:var(--surface-inset);border-radius:8px;margin-bottom:6px"><b>تمرین ${esc(item.data.program_title)} • روز ${item.data.day_number}</b><br><small>${esc(item.data.status)} • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div>`;
          } else {
            return `<div style="padding:8px;background:var(--glass-hover);border-radius:8px;margin-bottom:6px"><b>${esc(item.data.title)}</b><br><small>${esc(item.data.start_date||'')} • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div>`;
          }
        }).join('') || 'تاریخچه‌ای نیست';
      } catch(e){}

    } catch(e){
      content.innerHTML=`<div style="color:var(--danger);padding:20px">خطا: ${esc(e.message)}</div>`;
    }
  };

  window.renderStudentTimeline = async (label, route) => {
    const match=route.match(/\/students\/(\d+)\/(?:timeline|assessments)/);
    const studentId=match?Number(match[1]):null;
    if(!studentId) return;
    document.querySelector('#breadcrumb').textContent='تایم‌لاین شاگرد';
    const content=document.querySelector('#content');
    content.innerHTML=`<div style="text-align:center;padding:40px">در حال بارگذاری تایم‌لاین...</div>`;
    try {
      const data=await api(`/api/students/${studentId}/timeline`);
      const student=data.student;
      content.innerHTML=`
        <div class="program-builder">
          <div class="page-head"><div><h1>📜 تایم‌لاین ${esc(student.full_name)}</h1><p>ارزیابی‌ها و برنامه‌های ماهانه</p></div><button class="btn btn-secondary" onclick="history.back()">← بازگشت</button></div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${(data.timeline||[]).map(item=>{
              if(item.type==='assessment'){
                const a=item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">📋</div>
                  <div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">ارزیابی #${a.assessment_number} - ${esc(a.status)}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">وزن: ${a.weight}kg • ${new Date(a.date).toLocaleDateString('fa-IR')}</p>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">${(a.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:60px;height:60px;border-radius:8px;object-fit:cover">`).join('')}</div>
                    <button class="btn btn-secondary btn-small" onclick="location.href='/assessments/${a.id}'" style="margin-top:8px">بررسی</button>
                  </div>
                </div>
                `;
              } else if(item.type==='workout'){
                const workout=item.data;return `<div style="display:flex;gap:16px"><div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">✓</div><div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px"><h3 style="margin:0 0 8px">تمرین ${esc(workout.program_title)} • روز ${workout.day_number}</h3><p>${esc(workout.status)} • ${new Date(item.date).toLocaleDateString('fa-IR')}</p></div></div>`;
              } else {
                const p=item.data;
                return `
                <div style="display:flex;gap:16px">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-hover);display:grid;place-items:center;flex:0 0 40px">💪</div>
                  <div style="flex:1;background:var(--surface-3);border:1px solid var(--border);border-radius:12px;padding:16px">
                    <h3 style="margin:0 0 8px">${esc(p.title)}</h3>
                    <p style="font-size:12px;color:var(--text-secondary)">📅 ${esc(p.start_date||'')} تا ${esc(p.end_date||'')} • ${esc(p.status||'')}</p>
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
                  <p>وزن: ${a.weight}kg • وضعیت: ${esc(a.status)}</p>
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
