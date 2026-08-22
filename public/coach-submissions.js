(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(url, opt={}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'خطا');
    return d;
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
            <span>📸 ${item.photo_count||0} عکس</span>
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

      content.innerHTML=`
        <div class="program-builder">
          <div class="order-header">
            <div><h2>ارزیابی #${ass.assessment_number} - ${esc(student.full_name)} • ${esc(ass.status)}</h2><small>ارسال: ${ass.submitted_at?new Date(ass.submitted_at).toLocaleString('fa-IR'):''} • وزن: ${ass.weight}kg</small></div>
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
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                  ${(ass.photos||[]).map(p=>`
                    <div style="width:120px;height:120px;border-radius:10px;overflow:hidden;border:1px solid var(--border);position:relative">
                      <img src="/api/student-photos/${p.id}" style="width:100%;height:100%;object-fit:cover">
                      <small style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:#fff;text-align:center;font-size:10px">${esc(p.photo_type)}</small>
                    </div>
                  `).join('')}
                </div>
              </section>

              ${prev?`
              <section class="sp-card" style="border-color:var(--border-strong);background:var(--glass-hover)">
                <h2>📚 مقایسه با ارزیابی قبلی #${prev.assessment_number}</h2>
                <p style="font-size:12px">
                  وزن قبلی: ${prev.weight}kg → فعلی: ${ass.weight}kg • تفاوت: ${(ass.weight - prev.weight).toFixed(1)}kg<br>
                  کمر قبلی: ${prev.waist||'—'} → فعلی: ${ass.waist||'—'}<br>
                </p>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <div><small>قبلی:</small><br>${(prev.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--border);margin:2px">`).join('')}</div>
                  <div><small>فعلی:</small><br>${(ass.photos||[]).map(p=>`<img src="/api/student-photos/${p.id}" style="width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid var(--border-strong);margin:2px">`).join('')}</div>
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
                  <button class="btn btn-secondary" id="btnUnderReview">🔍 در حال بررسی</button>
                  <button class="btn btn-danger" id="btnRequestChanges">✏️ درخواست اصلاح</button>
                  <button class="btn btn-primary" id="btnApprove">✅ تایید</button>
                </div>
                <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
                  <button class="btn btn-primary" id="btnCreateProgram">💪 ساخت برنامه یک ماهه</button>
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

      document.getElementById('btnUnderReview').onclick=async()=>{
        await api(`/api/assessments/${id}/under-review`, {method:'POST'});
        alert('وضعیت به در حال بررسی تغییر کرد');
        location.reload();
      };
      document.getElementById('btnRequestChanges').onclick=async()=>{
        const note=document.getElementById('coachNote').value;
        await api(`/api/assessments/${id}/request-changes`, {method:'POST', body: JSON.stringify({coach_note: note})});
        alert('درخواست اصلاح ارسال شد');
        location.reload();
      };
      document.getElementById('btnApprove').onclick=async()=>{
        const note=document.getElementById('coachNote').value;
        await api(`/api/assessments/${id}/approve`, {method:'POST', body: JSON.stringify({coach_note: note})});
        alert('✅ تایید شد - حالا برنامه بسازید');
        location.reload();
      };
      document.getElementById('btnCreateProgram').onclick=()=>{
        location.href=`/programs/exercise/form?student_id=${student.id}&assessment_id=${id}`;
      };

      // Load timeline
      try {
        const full=await api(`/api/students/${student.id}/timeline`);
        const host=document.getElementById('timelineMini');
        host.innerHTML = (full.timeline||[]).map(item=>{
          if(item.type==='assessment'){
            return `<div style="padding:8px;background:var(--surface-inset);border-radius:8px;margin-bottom:6px"><b>ارزیابی #${item.data.assessment_number}</b> - ${esc(item.data.status)}<br><small>${item.data.weight||''}kg • ${new Date(item.date).toLocaleDateString('fa-IR')}</small></div>`;
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
    const match=route.match(/\/students\/(\d+)\/timeline/);
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
