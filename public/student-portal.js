(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opt={}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'خطا');
    return d;
  }

  function getTokenFromPath(){
    const match = location.pathname.match(/^\/join\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function studentRoot(data, token){
    const student = data.student;
    const currentAss = data.current_assessment;
    const currentProg = data.current_program;
    const timeline = data.timeline||[];
    const status = student.profile_status||'INVITED';

    const statusLabels = {
      'INVITED': 'دعوت شده',
      'PROFILE_INCOMPLETE': 'پروفایل ناقص',
      'ASSESSMENT_PENDING': 'در انتظار ارزیابی',
      'SUBMITTED': 'ارسال شده برای مربی',
      'UNDER_REVIEW': 'در حال بررسی توسط مربی',
      'CHANGES_REQUESTED': 'نیاز به اصلاح',
      'APPROVED': 'تایید شده',
      'PROGRAM_ASSIGNED': 'برنامه اختصاص داده شد',
      'ACTIVE': 'فعال',
      'AWAITING_NEXT_ASSESSMENT': 'در انتظار ارزیابی بعدی',
      'ARCHIVED': 'آرشیو'
    };

    return `
    <div class="student-portal">
      <div class="sp-header">
        <div class="sp-brand">
          <div class="sp-logo">Y</div>
          <div><strong>Yasnafit</strong><span>پرتال شاگرد</span></div>
        </div>
        <div class="sp-status">
          <span class="status-badge">${esc(statusLabels[status]||status)}</span>
          <small>${esc(student.full_name||'شاگرد')}</small>
        </div>
      </div>

      <div class="sp-welcome">
        <h1>سلام ${esc(student.full_name||'')} 👋</h1>
        <p>به پرتال شخصی Yasnafit خوش آمدید. لطفاً اطلاعات خود را کامل کنید و ارزیابی بدنی خود را ارسال کنید.</p>
        ${status==='SUBMITTED' ? `<div class="sp-alert success">✅ اطلاعات شما برای مربی ارسال شد. منتظر بررسی باشید.</div>` : ''}
        ${status==='CHANGES_REQUESTED' ? `<div class="sp-alert warning">⚠️ مربی درخواست اصلاح دارد. لطفاً اطلاعات را ویرایش کنید.</div>` : ''}
        ${status==='APPROVED' || status==='PROGRAM_ASSIGNED' ? `<div class="sp-alert success">✅ ارزیابی شما تایید شد و برنامه اختصاص داده شد.</div>` : ''}
      </div>

      <div class="sp-grid">
        <div class="sp-main">
          <section class="sp-card">
            <h2>👤 اطلاعات شخصی</h2>
            <div class="sp-form" id="profileForm">
              <div class="sp-row">
                <label>نام و نام خانوادگی *<input id="spFullName" value="${esc(student.full_name||'')}"></label>
                <label>موبایل<input id="spMobile" value="${esc(student.mobile||'')}"></label>
              </div>
              <div class="sp-row">
                <label>تاریخ تولد<input type="date" id="spDob" value="${esc(student.date_of_birth||'')}"></label>
                <label>قد (cm)<input type="number" id="spHeight" value="${student.height||''}"></label>
              </div>
              <div class="sp-row">
                <label>وزن (kg)<input type="number" id="spWeight" value="${student.weight||''}"></label>
                <label>هدف<select id="spGoal"><option value="کاهش وزن" ${student.goal==='کاهش وزن'?'selected':''}>کاهش وزن</option><option value="افزایش حجم" ${student.goal==='افزایش حجم'?'selected':''}>افزایش حجم</option><option value="فیتنس" ${student.goal==='فیتنس'?'selected':''}>فیتنس</option><option value="اصلاح فرم" ${student.goal==='اصلاح فرم'?'selected':''}>اصلاح فرم</option></select></label>
              </div>
              <div class="sp-row">
                <label>سابقه تمرین<select id="spExp"><option value="مبتدی" ${student.training_experience==='مبتدی'?'selected':''}>مبتدی</option><option value="متوسط" ${student.training_experience==='متوسط'?'selected':''}>متوسط</option><option value="پیشرفته" ${student.training_experience==='پیشرفته'?'selected':''}>پیشرفته</option></select></label>
                <label>محل تمرین<select id="spLocation"><option value="gym" ${student.preferred_location==='gym'?'selected':''}>باشگاه</option><option value="home" ${student.preferred_location==='home'?'selected':''}>منزل</option></select></label>
              </div>
              <div class="sp-row full">
                <label>محدودیت‌ها<textarea id="spLimitations" placeholder="مثلاً زانو درد، دیسک کمر...">${esc(student.limitations||'')}</textarea></label>
              </div>
              <div class="sp-row full">
                <label>توضیحات پزشکی<textarea id="spMedical" placeholder="توضیحات پزشکی...">${esc(student.medical_notes||'')}</textarea></label>
              </div>
              <button class="btn btn-primary" id="btnSaveProfile">💾 ذخیره پروفایل</button>
            </div>
          </section>

          <section class="sp-card">
            <h2>📋 ارزیابی بدنی - ماه ${currentAss ? currentAss.assessment_number : 'جدید'}</h2>
            <div class="sp-form" id="assessmentForm">
              <div class="sp-row">
                <label>وزن فعلی (kg) *<input type="number" id="assWeight" value="${currentAss?.weight||student.weight||''}"></label>
                <label>دور کمر (cm)<input type="number" id="assWaist" value="${currentAss?.waist||''}"></label>
              </div>
              <div class="sp-row">
                <label>دور سینه<input type="number" id="assChest" value="${currentAss?.chest||''}"></label>
                <label>دور باسن<input type="number" id="assHips" value="${currentAss?.hips||''}"></label>
              </div>
              <div class="sp-row">
                <label>درصد چربی<input type="number" id="assFat" value="${currentAss?.body_fat||''}"></label>
                <label>توده عضلانی<input type="number" id="assMuscle" value="${currentAss?.muscle_mass||''}"></label>
              </div>
              <div class="sp-row full">
                <label>یادداشت شاگرد<textarea id="assStudentNote" placeholder="توضیحات شما برای مربی...">${esc(currentAss?.student_note||'')}</textarea></label>
              </div>
              <button class="btn btn-secondary" id="btnSaveAssessment">💾 ذخیره ارزیابی</button>
            </div>
          </section>

          <section class="sp-card">
            <h2>📸 عکس‌های ارزیابی</h2>
            <p style="font-size:12px;color:var(--text-muted)">ارسال تصاویر بدنی اختیاری است. فقط JPG/PNG/WEBP تا 5MB</p>
            <div class="photo-upload-grid">
              ${['front','back','side'].map(type=>{
                const labelMap = {front:'جلو', back:'پشت', side:'کنار'};
                const existing = (currentAss?.photos||[]).find(p=>p.photo_type===type);
                return `
                <div class="photo-upload-box" data-type="${type}">
                  <div class="photo-preview" id="preview-${type}">
                    ${existing ? `<img src="/api/student-photos/${existing.id}?token=${token}" style="width:100%;height:100%;object-fit:cover">` : `<span>${labelMap[type]}</span>`}
                  </div>
                  <label>${labelMap[type]}
                    <input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${type}" style="display:none">
                  </label>
                  <button class="btn btn-secondary btn-small" data-upload="${type}">📤 آپلود ${labelMap[type]}</button>
                </div>
                `;
              }).join('')}
            </div>
            <div id="allPhotos" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
              ${(currentAss?.photos||[]).map(p=>`
                <div style="position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
                  <img src="/api/student-photos/${p.id}?token=${token}" style="width:100%;height:100%;object-fit:cover">
                  <button data-del-photo="${p.id}" style="position:absolute;top:2px;right:2px;background:var(--danger);color:var(--on-accent);border:0;border-radius:50%;width:20px;height:20px;cursor:pointer">×</button>
                  <small style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:var(--text);font-size:9px;text-align:center">${esc(p.photo_type)}</small>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="sp-card" style="text-align:center">
            <h2>🚀 ارسال نهایی</h2>
            <p style="font-size:13px;color:var(--text-secondary)">اطلاعات خود را بررسی کنید و برای مربی ارسال کنید. بعد از ارسال قابل ویرایش نیست تا مربی بررسی کند.</p>
            <button class="btn btn-primary" id="btnSubmit" style="font-size:16px;padding:14px 28px">📤 ارسال اطلاعات برای مربی</button>
          </section>
        </div>

        <div class="sp-sidebar">
          <section class="sp-card">
            <h2>📆 برنامه تمرینی من</h2>
            ${currentProg ? `
              <div style="background:var(--glass-hover);border:1px solid var(--border-strong);border-radius:10px;padding:12px">
                <b>${esc(currentProg.title)}</b><br>
                <small>📅 ${esc(currentProg.start_date||'')} تا ${esc(currentProg.end_date||'')}</small><br>
                <small>📆 ${currentProg.program_data?.days?.length||0} روز • 🏋️ ${(() => { try { return (currentProg.program_data?.days||[]).reduce((s,d)=> s + (d.data||[]).reduce((s2,sys)=> s2 + (sys.movement_list||[]).length,0),0); } catch(e){ return 0; } })()} حرکت</small>
                <div style="margin-top:10px">
                  <button class="btn btn-primary btn-small" id="btnViewProgram">👁 مشاهده برنامه</button>
                </div>
              </div>
              <div id="programViewer" style="display:none;margin-top:12px"></div>
            ` : `<p style="color:var(--text-muted);font-size:13px">هنوز برنامه‌ای اختصاص داده نشده. بعد از تایید ارزیابی، مربی برنامه یک ماهه شما را می‌سازد.</p>`}
          </section>

          <section class="sp-card">
            <h2>📜 تاریخچه</h2>
            <div class="timeline">
              ${timeline.length===0 ? `<p style="color:var(--text-muted);font-size:12px">تاریخچه‌ای نیست</p>` : timeline.map(item=>{
                if(item.type==='assessment'){
                  return `<div class="tl-item"><span class="tl-dot assessment">📋</span><div><b>ارزیابی #${item.data.assessment_number}</b><br><small>${esc(item.data.status)} • ${item.data.weight||''}kg • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div></div>`;
                } else {
                  return `<div class="tl-item"><span class="tl-dot program">💪</span><div><b>${esc(item.data.title||'برنامه')}</b><br><small>${esc(item.data.start_date||'')} • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div></div>`;
                }
              }).join('')}
            </div>
          </section>
        </div>
      </div>
    </div>
    `;
  }

  function bindEvents(data, token){
    // Save profile
    document.getElementById('btnSaveProfile').onclick = async () => {
      const payload = {
        full_name: document.getElementById('spFullName').value.trim(),
        mobile: document.getElementById('spMobile').value.trim(),
        date_of_birth: document.getElementById('spDob').value,
        height: document.getElementById('spHeight').value ? Number(document.getElementById('spHeight').value) : null,
        weight: document.getElementById('spWeight').value ? Number(document.getElementById('spWeight').value) : null,
        goal: document.getElementById('spGoal').value,
        training_experience: document.getElementById('spExp').value,
        preferred_location: document.getElementById('spLocation').value,
        limitations: document.getElementById('spLimitations').value,
        medical_notes: document.getElementById('spMedical').value,
      };
      try {
        await api(`/api/student-portal/${token}/profile`, {method:'PUT', body: JSON.stringify(payload)});
        alert('✅ پروفایل ذخیره شد');
        location.reload();
      } catch(e){ alert('❌ '+e.message); }
    };

    // Save assessment
    document.getElementById('btnSaveAssessment').onclick = async () => {
      const payload = {
        weight: document.getElementById('assWeight').value ? Number(document.getElementById('assWeight').value) : null,
        waist: document.getElementById('assWaist').value ? Number(document.getElementById('assWaist').value) : null,
        chest: document.getElementById('assChest').value ? Number(document.getElementById('assChest').value) : null,
        hips: document.getElementById('assHips').value ? Number(document.getElementById('assHips').value) : null,
        body_fat: document.getElementById('assFat').value ? Number(document.getElementById('assFat').value) : null,
        muscle_mass: document.getElementById('assMuscle').value ? Number(document.getElementById('assMuscle').value) : null,
        student_note: document.getElementById('assStudentNote').value,
        status: 'ASSESSMENT_PENDING'
      };
      try {
        await api(`/api/student-portal/${token}/assessment`, {method:'POST', body: JSON.stringify(payload)});
        alert('✅ ارزیابی ذخیره شد');
        location.reload();
      } catch(e){ alert('❌ '+e.message); }
    };

    // Photo upload
    document.querySelectorAll('[data-upload]').forEach(btn=>{
      if(btn.tagName==='INPUT') return;
      btn.onclick = () => {
        const type = btn.dataset.upload;
        const input = document.querySelector(`input[data-upload="${type}"]`);
        if(input) input.click();
      };
    });
    document.querySelectorAll('input[data-upload]').forEach(inp=>{
      inp.onchange = async () => {
        const type = inp.dataset.upload;
        const file = inp.files[0];
        if(!file) return;
        if(file.size > 5*1024*1024) return alert('حجم زیاد - حداکثر 5MB');

        const formData = new FormData();
        formData.append('photo', file);
        formData.append('photo_type', type);
        if(data.current_assessment) formData.append('assessment_id', data.current_assessment.id);

        try {
          // Use fetch with FormData (multipart)
          const r = await fetch(`/api/student-portal/${token}/photos`, {method:'POST', body: formData});
          const d = await r.json();
          if(!r.ok) throw new Error(d.error||'خطا');
          alert('✅ عکس آپلود شد');
          location.reload();
        } catch(e){
          // Fallback to base64 JSON
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              await api(`/api/student-portal/${token}/photos`, {method:'POST', body: JSON.stringify({
                data: reader.result,
                filename: file.name,
                mime_type: file.type,
                photo_type: type,
                assessment_id: data.current_assessment?.id
              })});
              alert('✅ عکس آپلود شد');
              location.reload();
            } catch(err){ alert('❌ '+err.message); }
          };
          reader.readAsDataURL(file);
        }
      };
    });

    document.querySelectorAll('[data-del-photo]').forEach(btn=>{
      btn.onclick = async () => {
        const id=btn.dataset.delPhoto;
        if(confirm('عکس حذف شود؟')){
          try {
            await api(`/api/student-portal/${token}/photos/${id}`, {method:'DELETE'});
            location.reload();
          } catch(e){ alert(e.message); }
        }
      };
    });

    // Submit
    document.getElementById('btnSubmit').onclick = async () => {
      if(!confirm('آیا اطلاعات خود را برای مربی ارسال می‌کنید؟ بعد از ارسال قابل ویرایش نیست.')) return;
      try {
        await api(`/api/student-portal/${token}/submit`, {method:'POST'});
        alert('✅ اطلاعات با موفقیت برای مربی ارسال شد');
        location.reload();
      } catch(e){ alert('❌ '+e.message); }
    };

    // View program
    const btnView = document.getElementById('btnViewProgram');
    if(btnView){
      btnView.onclick = () => {
        const viewer = document.getElementById('programViewer');
        const prog = data.current_program;
        if(!prog) return;
        viewer.style.display = viewer.style.display==='none'?'block':'none';
        if(viewer.style.display==='block'){
          const days = prog.program_data?.days||[];
          viewer.innerHTML = days.map(day=>`
            <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
              <b>روز ${day.day_number} - ${esc(day.focus||'')}</b> ${day.isRestDay?'🌙 استراحت':''}
              ${day.coachNote||day.coach_note ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">یادداشت مربی: ${esc(day.coachNote||day.coach_note)}</div>` : ''}
              ${(day.data||[]).map(sys=>`
                <div style="margin-top:8px;background:var(--surface-inset);padding:8px;border-radius:8px">
                  <small>سیستم ${sys.exercise_system_id} - ${esc(sys.system_type)}</small>
                  ${(sys.movement_list||[]).map(mov=>`
                    <div style="background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:6px;margin-top:6px">
                      <b style="font-size:12px">${esc(mov.nameFa||mov.name||'حرکت')}</b>
                      <div style="font-size:11px;color:var(--text-secondary)">${esc(mov.description||'')}</div>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
                        ${(mov.sets||[]).map(s=>`<span style="background:var(--glass-hover);padding:2px 6px;border-radius:10px;font-size:10px">${esc(s.type||s.set_type)}: ${esc(s.count??s.count_value??'—')} • وزن ${esc(s.weight??'—')} • استراحت ${esc(s.restSeconds??s.rest_seconds??'—')} ثانیه</span>`).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          `).join('');
        }
      };
    }
  }

  window.renderStudentPortal = async (route) => {
    const token = route.replace('/join/','').split('/')[0];
    const content = document.querySelector('#content');
    const sidebar = document.getElementById('sidebar');
    const topbar = document.querySelector('.topbar');
    
    // Hide coach UI for student portal
    if(sidebar) sidebar.style.display='none';
    if(topbar) topbar.style.display='none';
    document.querySelector('.main').style.marginRight='0';
    document.querySelector('.main').style.width='100%';

    content.innerHTML = `<div style="text-align:center;padding:40px"><div class="spinner" style="width:32px;height:32px;border:3px solid var(--border-strong);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto"></div><p>در حال بارگذاری پرتال...</p></div>`;

    try {
      const data = await api(`/api/student-portal/${token}`);
      content.innerHTML = studentRoot(data, token);
      bindEvents(data, token);
    } catch(e){
      content.innerHTML = `
        <div class="student-portal">
          <div class="sp-header"><div class="sp-brand"><div class="sp-logo">Y</div><div><strong>Yasnafit</strong></div></div></div>
          <div style="text-align:center;padding:60px">
            <div style="font-size:64px">🔒</div>
            <h2>لینک نامعتبر</h2>
            <p style="color:var(--text-muted)">${esc(e.message)}</p>
            <p style="font-size:12px;color:var(--text-muted)">لینک دعوت باطل یا منقضی شده است. با مربی خود تماس بگیرید.</p>
          </div>
        </div>
      `;
    }
  };
})();
