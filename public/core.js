async function api(url, options={}) {
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options});
  const d=await r.json();
  if(!r.ok) throw new Error(d.error||'خطا در ارتباط با سرور');
  return d;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function table(h,rows,row){
  return `<div class="table-wrap"><table><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row).join(''):`<tr><td colspan="${h.length}" class="empty">اطلاعاتی برای نمایش وجود ندارد.</td></tr>`}</tbody></table></div>`;
}
function modal(title,fields,submit){
  const m=document.createElement('div');
  m.className='modal-backdrop';
  m.innerHTML=`<form class="modal"><div class="modal-head"><h2>${title}</h2><button type="button" class="close">×</button></div><div class="form-grid">${fields.map(x=>`<label>${x.label}<input name="${x.name}" type="${x.type||'text'}" ${x.required?'required':''} placeholder="${x.placeholder||''}"></label>`).join('')}</div><div class="modal-actions"><button type="button" class="secondary close">انصراف</button><button class="primary">ذخیره</button></div></form>`;
  document.body.append(m);
  m.querySelectorAll('.close').forEach(x=>x.onclick=()=>m.remove());
  m.querySelector('form').onsubmit=async e=>{
    e.preventDefault();
    try{
      await submit(Object.fromEntries(new FormData(e.currentTarget)));
      m.remove();
      render(crumb.textContent,current)
    }catch(x){alert(x.message)}
  }
}

async function render(label,route){
  if(route.startsWith('/join/') && window.renderStudentPortal) return window.renderStudentPortal(route);
  if(route==='/programs/exercise/movements-list' && window.renderExerciseManager) return window.renderExerciseManager(label,route);
  if(route==='/programs/exercise/form' && window.renderProgramBuilder) return window.renderProgramBuilder(label,route);
  if(route==='/templates/exercise/list' && window.renderTrainingProgramsList) return window.renderTrainingProgramsList(label,route);
  if(route==='/students/submissions' && window.renderCoachSubmissions) return window.renderCoachSubmissions(label,route);
  if(route.startsWith('/students/') && route.includes('/timeline') && window.renderStudentTimeline) return window.renderStudentTimeline(label,route);
  if(route.startsWith('/assessments/') && window.renderAssessmentReview) return window.renderAssessmentReview(label,route);
  current=route;
  crumb.textContent=label;
  document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active',x.dataset.route===route));
  const head=`<div class="page-head"><div><p class="eyebrow">پنل مدیریت Yasnafit</p><h1>${label}</h1><p>مدیریت اطلاعات محلی با ذخیره‌سازی امن در SQLite.</p></div><button class="primary" id="addBtn">＋ افزودن</button></div>`;
  try{
    if(route==='/coach/dashboard'){
      const d=await api('/api/dashboard');
      const pending = await api('/api/student-submissions').catch(()=>[]);
      content.innerHTML=`
        <div class="page-head dashboard-title"><div><p class="eyebrow">نمای کلی</p><h1>داشبورد</h1><p>خلاصه فعالیت‌های ثبت‌شده در سامانه محلی.</p></div></div>
        <div class="stat-grid">
          <article><span>کل شاگردها</span><strong>${d.stats.total}</strong></article>
          <article><span>برنامه‌های فعال</span><strong>${d.stats.trainingPrograms||d.stats.active||0}</strong></article>
          <article><span>سفارش‌های در انتظار</span><strong>${d.stats.waiting}</strong></article>
          <article><span>حرکات ثبت‌شده</span><strong>${d.stats.movements}</strong></article>
        </div>
        ${pending.length>0?`<div class="sp-card" style="border-color:#f59e0b;background:#fffbeb"><h2>📋 ${pending.length} ارزیابی در انتظار بررسی</h2><p style="font-size:12px">شاگردانی که اطلاعات خود را ارسال کرده‌اند و نیاز به بررسی دارند</p><button class="btn btn-primary btn-small" onclick="location.href='/students/submissions'">مشاهده درخواست‌ها</button></div>`:''}
        <div class="split"><section class="panel"><h2>شاگردهای اخیر</h2>${table(['نام','هدف','وضعیت'],d.students,x=>`<tr><td><b>${esc(x.full_name)}</b></td><td>${esc(x.goal||'—')}</td><td><b class="badge">${esc(x.profile_status||x.status)}</b></td></tr>`)}</section><section class="panel"><h2>فعالیت‌های اخیر</h2><ul class="activity">${d.activities.map(x=>`<li><b>${esc(x.title)}</b><span>${esc(x.detail||'')}</span></li>`).join('')}</ul></section></div>`;
      return;
    }
    if(route==='/users-list'){
      const list=await api('/api/students');
      content.innerHTML=head.replace('＋ افزودن','＋ افزودن شاگرد')+`
        <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="location.href='/students/submissions'" style="font-size:12px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer">📋 درخواست‌های جدید</button>
          <button class="btn btn-secondary" id="btnInvites" style="font-size:12px;padding:8px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer">🔑 لیست لینک‌های دعوت</button>
        </div>
      `+table(['نام و نام خانوادگی','موبایل','هدف','وزن','وضعیت','پروفایل','عملیات'],list,x=>`
        <tr>
          <td><b>${esc(x.full_name)}</b><br><small style="color:#888">${esc((x.stable_id||'').substring(0,8))}</small></td>
          <td>${esc(x.mobile||'—')}</td>
          <td>${esc(x.goal||'—')}</td>
          <td>${x.weight||'—'} کیلو</td>
          <td><b class="badge">${esc(x.profile_status||x.status)}</b></td>
          <td><small>${esc(x.training_level||'')} • ${esc(x.preferred_location||'')}</small></td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-primary btn-small" data-invite="${x.id}" title="ساخت لینک امن" style="padding:4px 8px;font-size:11px;border-radius:6px;background:#4aaf29;color:#fff;border:0;cursor:pointer">🔑 دعوت</button>
              <button class="btn btn-secondary btn-small" data-timeline="${x.id}" title="تایم‌لاین" style="padding:4px 8px;font-size:11px;border-radius:6px;background:#f2f5f3;border:1px solid #ddd;cursor:pointer">📜 تایم‌لاین</button>
              <button class="btn btn-secondary btn-small" data-assess="${x.id}" title="ارزیابی‌ها" style="padding:4px 8px;font-size:11px;border-radius:6px;background:#f2f5f3;border:1px solid #ddd;cursor:pointer">📋 ارزیابی</button>
              <button class="btn btn-danger btn-small" data-del-student="${x.id}" title="حذف" style="padding:4px 8px;font-size:11px;border-radius:6px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;cursor:pointer">🗑</button>
            </div>
          </td>
        </tr>
      `);

      document.querySelector('#addBtn').onclick=()=>modal('ثبت شاگرد جدید',[{label:'نام و نام خانوادگی',name:'full_name',required:true},{label:'شماره موبایل',name:'mobile'},{label:'هدف',name:'goal'},{label:'وزن',name:'weight',type:'number'},{label:'قد',name:'height',type:'number'}],b=>api('/api/students',{method:'POST',body:JSON.stringify(b)}));

      document.getElementById('btnInvites').onclick=async()=>{
        const invites=await api('/api/student-invites');
        const m=document.createElement('div');
        m.className='modal-backdrop';
        m.innerHTML=`<div class="modal" style="width:min(700px,95vw)"><div class="modal-head"><h2>🔑 لینک‌های دعوت امن</h2><button class="close" style="border:0;background:transparent;font-size:24px;cursor:pointer">×</button></div><div style="max-height:400px;overflow:auto">${table(['شاگرد','پیش‌نمایش توکن','وضعیت','انقضا','عملیات'],invites,x=>`<tr><td>${esc(x.full_name)}</td><td><code>${esc(x.token_preview)}</code></td><td>${esc(x.status)}</td><td>${esc(x.expires_at||'—')}</td><td><button class="btn btn-danger btn-small" data-revoke="${x.id}" style="padding:4px 8px;font-size:11px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;cursor:pointer">باطل</button></td></tr>`)}</div><div class="modal-actions" style="margin-top:12px"><button class="close btn btn-secondary" style="padding:8px 12px;border-radius:8px;background:#f2f5f3;border:1px solid #ddd;cursor:pointer">بستن</button></div></div>`;
        document.body.append(m);
        m.querySelectorAll('.close').forEach(b=>b.onclick=()=>m.remove());
        m.querySelectorAll('[data-revoke]').forEach(b=>{
          b.onclick=async()=>{
            if(confirm('لینک باطل شود؟')){
              await api(`/api/student-invites/${b.dataset.revoke}/revoke`,{method:'POST'});
              alert('باطل شد');
              m.remove();
            }
          };
        });
      };

      content.querySelectorAll('[data-invite]').forEach(b=>{
        b.onclick=async()=>{
          const studentId=b.dataset.invite;
          try {
            const res=await api('/api/student-invites',{method:'POST',body:JSON.stringify({student_id:Number(studentId),expires_in_days:30})});
            const m=document.createElement('div');
            m.className='modal-backdrop';
            m.innerHTML=`<div class="modal"><div class="modal-head"><h2>🔑 لینک امن ساخته شد</h2><button class="close" style="border:0;background:transparent;font-size:24px;cursor:pointer">×</button></div><div style="padding:12px"><p>لینک شخصی شاگرد (فقط یک بار نمایش داده می‌شود):</p><div style="background:#f7f9f8;border:1px solid #d1e9cb;border-radius:10px;padding:12px;word-break:break-all"><code>${esc(location.origin)}${esc(res.join_url)}</code></div><p style="font-size:12px;color:#888;margin-top:10px">توکن: <code>${esc(res.token_preview)}</code> • انقضا: ${esc(res.expires_at||'')}</p><p style="font-size:11px;color:#c00">⚠️ توکن خام فقط یک بار نمایش داده می‌شود. آن را کپی و برای شاگرد بفرستید. در دیتابیس فقط هش SHA256 ذخیره شده.</p></div><div class="modal-actions" style="margin-top:12px;display:flex;gap:8px"><button class="btn btn-primary" id="btnCopyLink" style="padding:8px 12px;border-radius:8px;background:#4aaf29;color:#fff;border:0;cursor:pointer">📋 کپی لینک</button><button class="close btn btn-secondary" style="padding:8px 12px;border-radius:8px;background:#f2f5f3;border:1px solid #ddd;cursor:pointer">بستن</button></div></div>`;
            document.body.append(m);
            m.querySelectorAll('.close').forEach(x=>x.onclick=()=>m.remove());
            document.getElementById('btnCopyLink').onclick=()=>{
              navigator.clipboard.writeText(location.origin + res.join_url);
              alert('کپی شد');
            };
          } catch(e){ alert('خطا: '+e.message); }
        };
      });

      content.querySelectorAll('[data-timeline]').forEach(b=>{
        b.onclick=()=>{ location.href=`/students/${b.dataset.timeline}/timeline`; };
      });
      content.querySelectorAll('[data-assess]').forEach(b=>{
        b.onclick=async()=>{
          const studentId=b.dataset.assess;
          const data=await api(`/api/students/${studentId}/timeline`);
          const m=document.createElement('div');
          m.className='modal-backdrop';
          m.innerHTML=`<div class="modal" style="width:min(600px,95vw)"><div class="modal-head"><h2>📋 ارزیابی‌های ${esc(data.student.full_name)}</h2><button class="close" style="border:0;background:transparent;font-size:24px;cursor:pointer">×</button></div><div style="max-height:400px;overflow:auto">${table(['#','وضعیت','وزن','تاریخ','برنامه','عملیات'],data.assessments,x=>`<tr><td>#${x.assessment_number}</td><td>${esc(x.status)}</td><td>${x.weight||'—'}kg</td><td>${new Date(x.created_at).toLocaleDateString('fa-IR')}</td><td>${x.program_id||'—'}</td><td><button class="btn btn-secondary btn-small" onclick="location.href='/assessments/${x.id}'" style="padding:4px 8px;font-size:11px;border-radius:6px;background:#f2f5f3;border:1px solid #ddd;cursor:pointer">بررسی</button></td></tr>`)}</div></div>`;
          document.body.append(m);
          m.querySelectorAll('.close').forEach(x=>x.onclick=()=>m.remove());
        };
      });
      content.querySelectorAll('[data-del-student]').forEach(b=>{
        b.onclick=async()=>{
          if(confirm('شاگرد حذف شود؟ (soft delete)')){
            await api(`/api/students/${b.dataset.delStudent}`,{method:'DELETE'});
            render(label,route);
          }
        };
      });

      return;
    }
    if(route==='/programs/exercise/movements-list'){
      const list=await api('/api/movements');
      content.innerHTML=head.replace('＋ افزودن','＋ افزودن حرکت')+table(['نام حرکت','عضله هدف','تجهیزات'],list,x=>`<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.muscle_group||'—')}</td><td>${esc(x.equipment||'—')}</td></tr>`);
      document.querySelector('#addBtn').onclick=()=>modal('ثبت حرکت جدید',[{label:'نام حرکت',name:'name',required:true},{label:'عضله هدف',name:'muscle_group'},{label:'تجهیزات',name:'equipment'}],b=>api('/api/movements',{method:'POST',body:JSON.stringify(b)}));
      return;
    }
    if(route==='/programs/exercise/list'||route==='/programs/diet/list'||route==='/programs/supplement/list'||route==='/programs/corrective/list'){
      const list=await api('/api/programs');
      content.innerHTML=head.replace('＋ افزودن','＋ افزودن برنامه')+table(['عنوان','شاگرد','نوع','وضعیت','بازه'],list,x=>`<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.student_name||'—')}</td><td>${esc(x.type)}</td><td><b class="badge">${esc(x.status)}</b></td><td>${esc(x.start_date||'—')} تا ${esc(x.end_date||'—')}</td></tr>`);
      document.querySelector('#addBtn').onclick=()=>modal('ایجاد برنامه جدید',[{label:'عنوان برنامه',name:'title',required:true},{label:'نوع برنامه',name:'type',required:true,placeholder:'تمرینی، غذایی، مکمل یا اصلاحی'},{label:'شناسه شاگرد',name:'student_id',type:'number'},{label:'تاریخ شروع',name:'start_date',type:'date'},{label:'تاریخ پایان',name:'end_date',type:'date'}],b=>api('/api/programs',{method:'POST',body:JSON.stringify(b)}));
      return;
    }
    if(route==='/coach/settings'||route==='/coach/profile'){
      content.innerHTML=`${head.replace('＋ افزودن','ساخت نسخه پشتیبان')}<section class="panel settings-card"><h2>تنظیمات سامانه محلی</h2><p>دیتابیس در <code>data/yasnafit.db</code> است و کپی پشتیبان در پوشه <code>backups</code> ذخیره می‌شود.</p><button class="primary" id="backupBtn">ساخت نسخه پشتیبان SQLite</button><p id="backupResult"></p></section>`;
      const back=async()=>{
        const r=await api('/api/backup',{method:'POST'});
        document.querySelector('#backupResult').textContent=`نسخه پشتیبان با نام ${r.file} ساخته شد.`;
      };
      document.querySelector('#addBtn').onclick=back;
      document.querySelector('#backupBtn').onclick=back;
      return;
    }
    content.innerHTML=`${head.replace('＋ افزودن','در دست ساخت')}<section class="panel"><h2>ماژول ${label}</h2><p>ساختار این صفحه و مسیر آن آماده است. قابلیت‌های عملیاتی آن در مرحله‌های بعدی به API داخلی و SQLite متصل می‌شوند.</p><div class="module-route">${esc(route||'بدون مسیر')}</div></section>`;
    document.querySelector('#addBtn').style.display='none';
  }catch(e){
    content.innerHTML=`<section class="panel error"><h2>ارتباط با سرور برقرار نشد</h2><p>${esc(e.message)}</p></section>`;
  }
}
render('داشبورد','/coach/dashboard');
