async function api(url, options={}) {
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){
    location.replace('/coach/login');
    throw new Error(d.error||'نشست مربی معتبر نیست.');
  }
  if(!r.ok) throw new Error(d.error||'خطا در ارتباط با سرور');
  return d;
}
const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
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
  if((route==='/users-list' || route.startsWith('/users-list/')) && window.renderStudentsPage) return window.renderStudentsPage(label,route);
  if(route==='/programs/exercise/movements-list' && window.renderExerciseManager) return window.renderExerciseManager(label,route);
  if(route==='/programs/exercise/form' && window.renderProgramBuilder) return window.renderProgramBuilder(label,route);
  if(route==='/templates/exercise/list' && window.renderTrainingProgramsList) return window.renderTrainingProgramsList(label,route);
  if((route==='/programs/diet/list' || route==='/diet-programs') && window.renderDietProgramsList) return window.renderDietProgramsList(label,route);
  if((route==='/programs/diet/form' || route.startsWith('/programs/diet/form')) && window.renderDietProgramBuilder) return window.renderDietProgramBuilder(label,route);
  if((route==='/programs/supplement/list' || route==='/supplement-programs') && window.renderSupplementProgramsList) return window.renderSupplementProgramsList(label,route);
  if((route==='/programs/supplement/form' || route.startsWith('/programs/supplement/form')) && window.renderSupplementProgramBuilder) return window.renderSupplementProgramBuilder(label,route);
  if((route==='/settings/ai' || route==='/coach/ai') && window.renderAISettings) return window.renderAISettings(label,route);
  if(route==='/students/submissions' && window.renderCoachSubmissions) return window.renderCoachSubmissions(label,route);
  if(((route.startsWith('/students/')&&route.includes('/timeline'))||/^\/coach\/students\/\d+\/assessments$/.test(route)) && window.renderStudentTimeline) return window.renderStudentTimeline(label,route);
  if(route.startsWith('/assessments/') && window.renderAssessmentReview) return window.renderAssessmentReview(label,route);
  if(route==='/coach/releases' && window.renderReleaseHistory) return window.renderReleaseHistory(label,route);
  if(route==='/coach/magazine' && window.renderMagazineAdmin) return window.renderMagazineAdmin(label,route);
  current=route;
  crumb.textContent=label;
  document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active',x.dataset.route===route));
  const head=`<div class="page-head"><div><p class="eyebrow">پنل مدیریت Yasnafit</p><h1>${label}</h1><p>مدیریت اطلاعات محلی با ذخیره‌سازی امن در SQLite.</p></div><button class="primary" id="addBtn">＋ افزودن</button></div>`;
  try{
    if(route==='/coach/dashboard'){
      const [d,versionInfo]=await Promise.all([api('/api/dashboard'),api('/api/version')]);
      if(!['/','/index.html','/coach/dashboard'].includes(location.pathname))return;
      const v=d.v2||{trend:{},attention:[],students_overview:[],statusSummary:{active:0,attention:0,idle:0},timeline:[],series:[],greeting:{attentionCount:0,endingSoon:0,ended:0}};
      const faNum=n=>Number(n||0).toLocaleString('fa-IR');
      const relTime=ts=>{
        if(!ts)return'';
        const t=new Date(String(ts).replace(' ','T')+(String(ts).includes('Z')?'':'Z'));
        if(Number.isNaN(t.getTime()))return String(ts).slice(0,10);
        const mins=Math.floor((Date.now()-t.getTime())/60000);
        if(mins<1)return'همین حالا';
        if(mins<60)return `${faNum(mins)} دقیقه پیش`;
        const hours=Math.floor(mins/60);
        if(hours<24)return `${faNum(hours)} ساعت پیش`;
        const days=Math.floor(hours/24);
        if(days===1)return'دیروز';
        if(days<7)return `${faNum(days)} روز پیش`;
        return t.toLocaleDateString('fa-IR');
      };
      // جمله روزانه بر پایه داده واقعی
      const g=v.greeting||{};
      const dailyMessage = g.ended>0 ? `${faNum(g.ended)} برنامه به پایان رسیده و ${faNum(g.attentionCount)} مورد نیاز به پیگیری دارد.`
        : g.endingSoon>0 ? `${faNum(g.endingSoon)} برنامه تمرینی در چند روز آینده به پایان می‌رسد.`
        : (g.attentionCount>0 ? `${faNum(g.attentionCount)} مورد نیاز به پیگیری شما دارد.` : 'همه‌چیز مرتب است؛ شاگردهای شما در وضعیت خوبی هستند.');
      const delta=(t)=>{if(!t||t.now==null)return'';const diff=t.now-t.prev;if(diff===0)return'بدون تغییر نسبت به ۳۰ روز قبل';const sign=diff>0?'+':'−';return `${sign}${faNum(Math.abs(diff))} نسبت به ۳۰ روز قبل`;};
      const sevClass={red:'sev-red',yellow:'sev-yellow',blue:'sev-blue'};
      const maxSeries=Math.max(1,...v.series.map(p=>p.workouts));
      const chart=v.series.length?v.series.map(p=>`<span class="db-chart-col" style="--h:${Math.round(p.workouts/maxSeries*100)}%" title="${p.day} • ${faNum(p.workouts)} جلسه${p.programs?` • ${faNum(p.programs)} برنامه`:''}"></span>`).join(''):'';
      const timelineIcon={student:'👤',program:'📋',assessment:'🧾',workout:'💪'};
      content.innerHTML=`
      <div class="db-hero">
        <div class="db-hero-text">
          <p class="eyebrow">مرکز کنترل مربی</p>
          <h1>سلام، مربی 👋</h1>
          <p class="db-daily">${esc(dailyMessage)}</p>
        </div>
        <small class="dashboard-version">${esc(versionInfo.name)} v${esc(versionInfo.version)}</small>
      </div>

      <div class="db-stats">
        <article class="db-stat">
          <span class="db-stat-icon db-ico-blue">👥</span>
          <div><strong>${faNum(v.activeStudents||d.stats.total)}</strong><span>شاگرد فعال</span>
          <small>${v.trend.newStudents?esc(delta(v.trend.newStudents)):`از مجموع ${faNum(d.stats.total)} شاگرد`}</small></div>
        </article>
        <article class="db-stat">
          <span class="db-stat-icon db-ico-green">📋</span>
          <div><strong>${faNum(v.activePrograms ?? (d.stats.trainingPrograms||d.stats.active||0))}</strong><span>برنامه فعال</span>
          <small>${v.trend.newPrograms?esc(delta(v.trend.newPrograms)):`از ${faNum(d.stats.trainingPrograms)} برنامه ساخته‌شده`}</small></div>
        </article>
        <article class="db-stat">
          <span class="db-stat-icon db-ico-orange">💪</span>
          <div><strong>${faNum(v.trend.workouts?.now||0)}</strong><span>جلسه تمرین (۳۰ روز)</span>
          <small>${v.trend.workouts?esc(delta(v.trend.workouts)):''}</small></div>
        </article>
        <article class="db-stat">
          <span class="db-stat-icon db-ico-violet">🏋️</span>
          <div><strong>${faNum(d.stats.movements)}</strong><span>حرکت ثبت‌شده</span>
          <small>${d.stats.waiting>0?`${faNum(d.stats.waiting)} سفارش در انتظار`:'بانک حرکات آماده است'}</small></div>
        </article>
      </div>

      <div class="db-mid">
        <section class="db-panel db-attention">
          <header><h2>نیازمند توجه شما</h2>${v.attention.length?`<b class="db-count">${faNum(v.attention.length)}</b>`:''}</header>
          ${v.attention.length?v.attention.map(a=>`
            <div class="db-attn ${sevClass[a.severity]||''}">
              <i class="db-dot" aria-hidden="true"></i>
              <div class="db-attn-body"><b>${esc(a.name)}</b><span>${esc(a.text)}</span>${a.sub?`<small>${esc(a.sub)}</small>`:''}</div>
              <a class="btn btn-secondary btn-small" href="${esc(a.action)}">${esc(a.action_label)}</a>
            </div>`).join(''):
          `<div class="db-empty"><b>همه‌چیز مرتب است 🎉</b><span>در حال حاضر موردی برای پیگیری وجود ندارد.</span></div>`}
        </section>
        <section class="db-panel db-quick">
          <header><h2>اقدامات سریع</h2></header>
          <div class="db-quick-grid">
            <a href="/users-list"><span>👤</span>افزودن شاگرد</a>
            <a href="/programs/exercise/form"><span>📋</span>ساخت برنامه تمرینی</a>
            <a href="/programs/diet/form"><span>🥗</span>ثبت برنامه غذایی</a>
            <a href="/students/submissions"><span>🧾</span>بررسی ارزیابی‌ها</a>
            <a href="/templates/exercise/list"><span>🗂</span>بانک برنامه‌ها</a>
            <a href="/programs/exercise/movements-list"><span>🏋️</span>بانک حرکات</a>
          </div>
        </section>
      </div>

      <section class="db-panel">
        <header class="db-row-head"><h2>شاگردهای شما</h2><a class="secondary" href="/users-list">مشاهده همه</a></header>
        ${v.students_overview.length?v.students_overview.map(x=>`
          <div class="db-student">
            <span class="db-avatar" aria-hidden="true">${esc(String(x.full_name||'؟').trim().charAt(0))}</span>
            <div class="db-student-main">
              <b>${esc(x.full_name)}</b>
              <small>پرونده ${esc(x.case_number||'------')}${x.goal?` • ${esc(fa(x.goal))}`:''}</small>
            </div>
            <div class="db-student-program">
              ${x.program_title?`<b>${esc(x.program_title)}</b>${x.progress!=null?`<span class="db-progress"><i style="width:${Math.max(3,x.progress)}%"></i></span><small>${faNum(x.progress)}٪</small>`:`<small>${esc(fa(x.program_status||''))}</small>`}`:'<small>بدون برنامه</small>'}
            </div>
            <div class="db-student-activity">
              <small>${x.last_days==null?'بدون ثبت تمرین':x.last_days===0?'آخرین فعالیت: امروز':x.last_days===1?'آخرین فعالیت: دیروز':`آخرین فعالیت: ${faNum(x.last_days)} روز پیش`}</small>
            </div>
            <span class="db-badge ${x.status==='active'?'ok':x.status==='attention'?'warn':''}">${x.status==='active'?'فعال':x.status==='attention'?'نیازمند پیگیری':'غیرفعال'}</span>
            <a class="btn btn-secondary btn-small" href="/users-list/${esc(x.case_number)}">مشاهده</a>
          </div>`).join(''):
        `<div class="db-empty"><b>هنوز شاگردی ثبت نشده است.</b><span>با «افزودن شاگرد» اولین پرونده را بسازید.</span><a class="btn btn-primary" href="/users-list">افزودن شاگرد</a></div>`}
      </section>

      <div class="db-bottom">
        <section class="db-panel db-status">
          <header><h2>وضعیت شاگردان</h2></header>
          ${(()=>{const tot=Math.max(1,d.stats.total);const bar=[['فعال',v.statusSummary.active,'ok'],['نیازمند پیگیری',v.statusSummary.attention,'warn'],['بدون برنامه فعال',v.statusSummary.idle,'idle']];
            return d.stats.total?bar.map(([label,val,cls])=>`<div class="db-status-row"><span>${label}</span><div class="db-bar"><i class="${cls}" style="width:${Math.max(2,Math.round(val/tot*100))}%"></i></div><b>${faNum(val)}</b></div>`).join(''):
            '<div class="db-empty"><span>داده‌ای برای نمایش وجود ندارد.</span></div>';})()}
        </section>
        <section class="db-panel db-trend">
          <header><h2>روند جلسات تمرینی</h2><small>۳۰ روز اخیر</small></header>
          ${v.trend.workouts&&(v.trend.workouts.now>0||v.trend.workouts.prev>0)?`<div class="db-chart" dir="ltr">${chart}</div><small class="db-chart-note">ستون‌ها: جلسات ثبت‌شده روزانه — با ماوس ببینید</small>`:
          `<div class="db-empty"><span>اطلاعات کافی برای نمایش روند فعالیت وجود ندارد.</span><small>با ثبت اولین جلسات تمرینی توسط شاگردها، نمودار این‌جا فعال می‌شود.</small></div>`}
        </section>
        <section class="db-panel db-timeline">
          <header><h2>فعالیت‌های اخیر</h2></header>
          ${v.timeline.length?`<ul class="db-tl">${v.timeline.map(e=>`<li><span class="db-tl-ico">${timelineIcon[e.type]||'•'}</span><div><b>${esc(e.name)}</b> ${esc(e.text)}<small>${relTime(e.at)}</small></div></li>`).join('')}</ul>`:
          `<div class="db-empty"><span>فعالیتی برای نمایش وجود ندارد.</span></div>`}
        </section>
      </div>`;
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
      content.innerHTML=head.replace('＋ افزودن','＋ افزودن برنامه')+table(['عنوان','شاگرد / پرونده','نوع','وضعیت','بازه'],list,x=>`<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.student_name||'—')}${x.student_case_number?`<small class="case-number-inline">پرونده ${esc(x.student_case_number)}</small>`:''}</td><td>${esc(fa(x.type))}</td><td><b class="badge">${esc(fa(x.status))}</b></td><td>${esc(x.start_date||'—')} تا ${esc(x.end_date||'—')}</td></tr>`);
      document.querySelector('#addBtn').onclick=()=>modal('ایجاد برنامه جدید',[{label:'عنوان برنامه',name:'title',required:true},{label:'نوع برنامه',name:'type',required:true,placeholder:'تمرینی، غذایی، مکمل یا اصلاحی'},{label:'شناسه شاگرد',name:'student_id',type:'number'},{label:'تاریخ شروع',name:'start_date',type:'date'},{label:'تاریخ پایان',name:'end_date',type:'date'}],b=>api('/api/programs',{method:'POST',body:JSON.stringify(b)}));
      return;
    }
    if(route==='/coach/settings'||route==='/coach/profile'){
      content.innerHTML=`${head.replace('＋ افزودن','ساخت نسخه پشتیبان')}<section class="panel settings-card"><h2>پشتیبان‌گیری و بازیابی</h2><p>دیتابیس در <code>data/yasnafit.db</code> است؛ نسخه‌های پشتیبان در پوشه <code>backups</code> نگهداری می‌شوند. بازیابی همهٔ داده‌ها (شاگردان، مربی، تنظیمات هوش مصنوعی، اتصال تلگرام و…) را با نسخهٔ انتخابی جایگزین می‌کند و سرویس یک بار ری‌استارت می‌شود.</p><button class="primary" id="backupBtn">ساخت نسخه پشتیبان SQLite</button><div class="restore-upload-row"><input type="file" id="restoreFile" accept=".db" aria-label="انتخاب فایل پشتیبان"><button class="secondary" id="restoreUploadBtn" disabled>بازیابی از فایل</button></div><p id="backupResult" class="backup-result"></p><div id="backupList" class="backup-list">در حال دریافت فهرست پشتیبان‌ها…</div></section><section class="panel settings-card"><h2>تغییر رمز مربی</h2><p>پس از تغییر رمز، همه نشست‌های قبلی باطل می‌شوند و باید دوباره وارد شوید.</p><form id="coachPasswordChangeForm" class="form-grid"><label>رمز فعلی<input name="current_password" type="password" required minlength="8" maxlength="128"></label><label>رمز جدید<input name="new_password" type="password" required minlength="8" maxlength="128"></label><button class="primary" type="submit">ذخیره رمز جدید</button></form><p id="coachPasswordChangeResult"></p></section>`;
      const resultEl=document.querySelector('#backupResult');
      const back=async()=>{
        try{
          const r=await api('/api/backup',{method:'POST'});
          resultEl.textContent=`نسخه پشتیبان با نام ${r.file} ساخته شد.`;
          await loadList();
        }catch(error){resultEl.textContent='خطا در پشتیبان‌گیری: '+error.message;}
      };
      const restoreConfirm=(label,run)=>{
        if(!confirm(`بازیابی ${label}: همهٔ اطلاعات فعلی با نسخهٔ انتخابی جایگزین می‌شود و سرویس ری‌استارت می‌شود. ادامه می‌دهید؟`))return;
        resultEl.textContent='در حال آماده‌سازی بازیابی…';
        run().then(()=>{
          resultEl.textContent='✓ بازیابی انجام شد. سرویس در حال ری‌استارت است؛ چند ثانیه بعد صفحه به‌صورت خودکار باز می‌شود.';
          setTimeout(()=>location.replace('/coach/dashboard'),7000);
        }).catch(e=>{resultEl.textContent='خطا در بازیابی: '+e.message;});
      };
      const loadList=async()=>{
        const host=document.querySelector('#backupList');
        try{
          const data=await api('/api/backup');
          if(!data.backups.length){host.innerHTML='<p class="backup-empty">هنوز نسخه پشتیبانی ساخته نشده است.</p>';return;}
          host.innerHTML='<table class="backup-table"><thead><tr><th>فایل پشتیبان</th><th>حجم</th><th>تاریخ</th><th>عملیات</th></tr></thead><tbody>'+data.backups.map(b=>`<tr><td class="backup-name">${esc(b.name)}</td><td>${b.size_mb} مگابایت</td><td>${esc(b.date)}</td><td class="backup-actions"><a class="btn-backup-dl" href="/api/backup/download?name=${encodeURIComponent(b.name)}">↧ دانلود</a><button type="button" class="btn-backup-rs" data-restore="${esc(b.name)}">↺ بازیابی</button></td></tr>`).join('')+'</tbody></table>';
          host.querySelectorAll('[data-restore]').forEach(btn=>btn.onclick=()=>restoreConfirm(`نسخه «${btn.dataset.restore}»`,()=>api('/api/backup/restore-server',{method:'POST',body:JSON.stringify({name:btn.dataset.restore})})));
        }catch(error){host.textContent='خطا در فهرست پشتیبان‌ها: '+error.message;}
      };
      const fileInput=document.querySelector('#restoreFile');
      const uploadBtn=document.querySelector('#restoreUploadBtn');
      fileInput.onchange=()=>{uploadBtn.disabled=!fileInput.files.length;};
      uploadBtn.onclick=()=>{
        const f=fileInput.files[0];
        if(!f)return;
        restoreConfirm(`فایل «${f.name}»`,async()=>{
          const buffer=await f.arrayBuffer();
          const r=await fetch('/api/backup/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:buffer});
          const d=await r.json().catch(()=>({}));
          if(!r.ok)throw new Error(d.error||'بازیابی ناموفق بود.');
          return d;
        });
      };
      document.querySelector('#addBtn').onclick=back;
      document.querySelector('#backupBtn').onclick=back;
      loadList();
      document.querySelector('#coachPasswordChangeForm').onsubmit=async event=>{
        event.preventDefault();
        const form=Object.fromEntries(new FormData(event.currentTarget));
        try{
          await api('/api/coach/auth/change-password',{method:'POST',body:JSON.stringify(form)});
          location.replace('/coach/login');
        }catch(error){
          document.querySelector('#coachPasswordChangeResult').textContent=error.message;
        }
      };
      return;
    }
    history.replaceState({},'','/coach/dashboard');
    return render('داشبورد','/coach/dashboard');
  }catch(e){
    content.innerHTML=`<section class="panel error"><h2>ارتباط با سرور برقرار نشد</h2><p>${esc(e.message)}</p></section>`;
  }
}
// ── آمار بازدید سایت (صفحهٔ عمومی، شناسهٔ ناشناس، نشست ۳۰ دقیقه‌ای، منطقهٔ Asia/Tehran) ──
window.renderVisitAnalytics=async function(label,route){
  let range='7d';
  let days=7;
  let from='';
  let to='';
  let metric='views';
  const load=async()=>{
    updateSidebarActiveState(route);
    crumb.textContent=label;
    content.innerHTML='<div class="loading-state"><span class="spinner"></span><p>در حال بارگذاری آمار…</p></div>';
    let data;
    try{ data=await api(`/api/analytics/visits?days=${days}&range=${encodeURIComponent(range)}${range==='custom'?`&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`:''}`); }
    catch(error){ content.innerHTML=`<section class="panel"><h2>آمار بازدید</h2><p class="error">${esc(error.message)}</p></section>`; return; }
    const s=data.summary||{};
    const today=data.today||{};
    const span=data.range||{};
    const fa=n=>Number(n||0).toLocaleString('fa-IR');
    const flag=code=>{ const cc=String(code||'').toUpperCase(); if(cc==='LN')return '🏠'; if(!/^[A-Z]{2}$/.test(cc))return '🌐'; return String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0))); };
    const deviceFa={mobile:'📱 موبایل',tablet:'💻 تبلت',desktop:'🖥 دسکتاپ',unknown:'نامشخص'};
    const sourceFa={Direct:'مستقیم · Direct',Google:'گوگل · Google',Instagram:'اینستاگرام · Instagram',Telegram:'تلگرام · Telegram',Referral:'ارجاع · Referral',Other:'سایر · Other'};
    const eventFa={landing_view:'بازدید لندینگ',coach_page_view:'بازدید صفحهٔ مربی',register_start:'شروع ثبت‌نام',registration_complete:'تکمیل ثبت‌نام',login:'ورود',telegram_connect:'اتصال تلگرام'};
    const osFa={Android:'Android',iOS:'iOS',Windows:'Windows',macOS:'macOS',Linux:'Linux',Other:'Other'};
    const metricFa={views:'بازدید صفحه',visitors:'بازدیدکننده',sessions:'نشست',registrations:'ثبت‌نام'};
    const ranges=[['today','امروز'],['yesterday','دیروز'],['7d','۷ روز'],['30d','۳۰ روز'],['custom','سفارشی']];
    const daily=data.daily||[];
    const maxDaily=Math.max(1,...daily.map(d=>Number(d[metric]||0)));
    const bars=daily.map(d=>{
      const value=Number(d[metric]||0);
      return `<div class="visit-bar" title="${esc(d.day)} — ${fa(value)}"><i style="height:${Math.round(value/maxDaily*100)}%"></i><small>${esc(String(d.day||'').slice(5))}</small></div>`;
    }).join('');
    const pageRows=(data.pages||[]).slice(0,12);
    const pages=pageRows.length?`<table class="visit-table"><thead><tr><th>صفحه</th><th>بازدید</th><th>بازدیدکنندهٔ یکتا</th><th>میانگین زمان</th></tr></thead><tbody>${pageRows.map(p=>`<tr><td class="visit-path" dir="ltr">${esc(p.path||'/')}</td><td>${fa(p.views)}</td><td>${fa(p.visitors)}</td><td>${esc(p.avg_time_fa||'نامشخص')}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">هنوز بازدید صفحهٔ عمومی ثبت نشده است.</p>';
    const countries=(data.countries||[]).length?`<table class="visit-table"><thead><tr><th>کشور</th><th>بازدیدکننده</th><th>بازدید</th></tr></thead><tbody>${data.countries.map(c=>`<tr><td>${flag(c.code)} ${esc(c.name||'نامشخص')}</td><td>${fa(c.visitors)}</td><td>${fa(c.views)}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">هنوز کشوری ثبت نشده است.</p>';
    const cities=(data.cities||[]).filter(c=>c.city).slice(0,8);
    const cityBlock=cities.length?`<h2 style="margin-top:16px">شهر</h2><div class="visit-chips">${cities.map(c=>`<div class="visit-chip"><b>${esc(c.city)}</b><span>${fa(c.visitors)} نفر</span></div>`).join('')}</div>`:'';
    const chip=(rows,label)=>rows&&rows.length?rows.map(d=>`<div class="visit-chip"><b>${esc(label(d))}</b><span>${fa(d.views)} بازدید • ${fa(d.visitors)} نفر</span></div>`).join(''):'<p class="visit-empty">—</p>';
    const journeys=(data.journeys||[]).slice(0,6);
    const journeyHtml=journeys.length?`<ol class="visit-journey">${journeys.map(j=>`<li>${esc(j.path)}</li>`).join('')}</ol>`:'<p class="visit-empty">هنوز مسیر چندصفحه‌ای ثبت نشده است.</p>';
    const funnel=data.funnel||{};
    const online=data.online_now||[];
    const onlineHtml=online.length?`<table class="visit-table"><thead><tr><th>بازدیدکننده</th><th>صفحه</th><th>کشور</th><th>دستگاه</th><th>آخرین فعالیت</th></tr></thead><tbody>${online.map(r=>`<tr><td class="visit-id" dir="ltr">${esc(r.visitor_label||'visitor_…')}</td><td class="visit-path" dir="ltr">${esc(r.path||'/')}</td><td>${esc([r.country_name,r.city].filter(Boolean).join('، ')||'نامشخص')}</td><td>${deviceFa[r.device]||esc(r.device||'—')}</td><td class="visit-time">${esc(r.last_fa||'—')}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">در ۵ دقیقهٔ اخیر کسی در صفحه‌های عمومی فعال نیست.</p>';
    const recent=(data.recent||[]).length?`<table class="visit-table"><thead><tr><th>زمان</th><th>بازدیدکننده</th><th>کشور</th><th>دستگاه</th><th>صفحه</th></tr></thead><tbody>${data.recent.map(r=>`<tr><td class="visit-time">${esc(new Date(r.visited_at).toLocaleString('fa-IR',{timeZone:'Asia/Tehran'}))}</td><td class="visit-id" dir="ltr">${esc(r.visitor_label||'visitor_…')}</td><td>${flag(r.country_code)} ${esc(r.country_name||'نامشخص')}</td><td>${deviceFa[r.device]||esc(r.device||'—')}${r.browser&&r.browser!=='سایر'?' • '+esc(r.browser):''}</td><td class="visit-path" dir="ltr">${esc(r.path||'/')}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">هنوز بازدیدی ثبت نشده است.</p>';
    const visitors=(data.visitors||[]).length?`<table class="visit-table visit-visitors"><thead><tr><th>بازدیدکننده</th><th>کشور</th><th>دستگاه</th><th>بازدید</th><th>اولین ورود</th><th>آخرین فعالیت</th><th>مدت نشست</th><th>نشست</th><th>وضعیت</th></tr></thead><tbody>${data.visitors.map(v=>`<tr class="${v.online?'visit-online':''}"><td class="visit-id" dir="ltr">${esc(v.visitor_label||'visitor_…')}${v.online?' <span class="visit-live-dot" title="فعال در ۵ دقیقهٔ اخیر"></span>':''}</td><td>${flag(v.country_code)} ${esc(v.country_name||'نامشخص')}</td><td>${deviceFa[v.device]||esc(v.device||'—')}</td><td>${fa(v.views)}</td><td class="visit-time">${esc(v.first_fa||'—')}</td><td class="visit-time">${esc(v.last_fa||'—')}</td><td>${esc(v.duration_fa||'نامشخص')}</td><td>${fa(v.sessions)}</td><td>${v.returning?'<span class="visit-badge yes">بازگشتی</span>':'<span class="visit-badge no">جدید</span>'}${v.registrations>0?' <span class="visit-badge yes">ثبت‌نام</span>':''}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">هنوز بازدیدی ثبت نشده است.</p>';
    const events=(data.events||[]).map(e=>`<div class="visit-chip"><b>${esc(eventFa[e.event_type]||e.event_type)}</b><span>${fa(e.count)}</span></div>`).join('');
    const campaigns=(data.campaigns||[]);
    const campaignHtml=campaigns.length?`<table class="visit-table"><thead><tr><th>utm_source</th><th>utm_medium</th><th>utm_campaign</th><th>بازدید</th><th>نفر</th></tr></thead><tbody>${campaigns.map(c=>`<tr><td>${esc(c.utm_source||'—')}</td><td>${esc(c.utm_medium||'—')}</td><td>${esc(c.utm_campaign||'—')}</td><td>${fa(c.views)}</td><td>${fa(c.visitors)}</td></tr>`).join('')}</tbody></table>`:'<p class="visit-empty">کمپینی با utm ثبت نشده است.</p>';
    const exportQs=range==='custom'?`range=custom&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`:`range=${encodeURIComponent(range)}`;
    const geoNote=data.pending_geo?`<p class="visit-geo-note">🌍 ${fa(data.pending_geo)} مورد در صف تعیین کشور است و در پس‌زمینه کامل می‌شود.</p>`:'';
    content.innerHTML=`
      <div class="page-head"><div><h1>آمار بازدید سایت</h1><p>صفحات عمومی، نشست واقعی و منطقهٔ زمانی تهران. IPهای یکتا فقط به‌صورت شناسهٔ ناشناس visitor_ نمایش داده می‌شوند.</p></div>
        <div class="visit-ranges">${ranges.map(([key,title])=>`<button class="secondary ${key===range?'active':''}" data-range="${key}">${title}</button>`).join('')}<a class="secondary" href="/api/analytics/export?${exportQs}">خروجی</a></div></div>
      ${geoNote}
      <div class="stat-grid visit-stats">
        <article><span>بازدیدکنندهٔ امروز</span><strong>${fa(today.visitors)}</strong><small>Asia/Tehran</small></article>
        <article><span>بازدید صفحهٔ امروز</span><strong>${fa(today.pageviews)}</strong><small>فقط صفحات عمومی</small></article>
        <article><span>نشست امروز</span><strong>${fa(today.sessions)}</strong><small>وقفهٔ ۳۰ دقیقه</small></article>
        <article><span>ثبت‌نام امروز</span><strong>${fa(today.registrations)}</strong><small>تکمیل‌شده</small></article>
      </div>
      <section class="panel">
        <h2>بازهٔ انتخاب‌شده</h2>
        <div class="visit-custom">${range==='custom'?`<label>از <input type="date" id="visitFrom" value="${esc(from)}"></label><label>تا <input type="date" id="visitTo" value="${esc(to)}"></label><button class="secondary" id="visitApply">اعمال</button>`:''}</div>
        <div class="stat-grid visit-stats">
          <article><span>بازدیدکننده</span><strong>${fa(span.visitors)}</strong><small>جدید ${fa(s.new_visitors)} • بازگشتی ${fa(s.returning_visitors)}</small></article>
          <article><span>بازدید صفحه</span><strong>${fa(span.pageviews)}</strong><small>${fa(span.pages_per_session)} صفحه در هر نشست</small></article>
          <article><span>نشست</span><strong>${fa(span.sessions)}</strong><small>میانگین ${esc(span.average_session_fa||'نامشخص')}</small></article>
          <article><span>ثبت‌نام</span><strong>${fa(span.registrations)}</strong><small>اول ${esc(span.first_fa||'—')} • آخر ${esc(span.last_fa||'—')}</small></article>
        </div>
      </section>
      <section class="panel"><h2>نمودار روزانه</h2>
        <div class="visit-ranges">${Object.entries(metricFa).map(([key,title])=>`<button class="secondary ${key===metric?'active':''}" data-metric="${key}">${title}</button>`).join('')}</div>
        <div class="visit-bars">${bars||'<p class="visit-empty">—</p>'}</div>
      </section>
      <section class="panel"><h2>قیف تبدیل</h2>
        <div class="visit-funnel">
          <article><span>بازدیدکننده</span><strong>${fa(funnel.visitors)}</strong></article>
          <article><span>شروع ثبت‌نام</span><strong>${fa(funnel.register_start)}</strong><small>${fa(funnel.register_rate)}٪</small></article>
          <article><span>تکمیل ثبت‌نام</span><strong>${fa(funnel.registration_complete)}</strong><small>نرخ تبدیل ${fa(funnel.conversion_rate)}٪</small></article>
        </div>
        <div class="visit-chips" style="margin-top:12px">${events||'<p class="visit-empty">—</p>'}</div>
      </section>
      <div class="split">
        <section class="panel"><h2>صفحات پربازدید عمومی</h2>${pages}</section>
        <section class="panel"><h2>مسیر نشست</h2>${journeyHtml}</section>
      </div>
      <div class="split">
        <section class="panel"><h2>کشور</h2>${countries}${cityBlock}</section>
        <section class="panel"><h2>دستگاه، مرورگر و سیستم‌عامل</h2>
          <div class="visit-chips">${chip(data.devices,d=>deviceFa[d.device]||d.device)}</div>
          <h2 style="margin-top:16px">مرورگر</h2><div class="visit-chips">${chip(data.browser_groups,b=>b.browser_group||'Other')}</div>
          <h2 style="margin-top:16px">سیستم‌عامل</h2><div class="visit-chips">${chip(data.os,o=>osFa[o.os]||o.os||'Other')}</div>
        </section>
      </div>
      <div class="split">
        <section class="panel"><h2>منبع</h2><div class="visit-chips">${chip(data.sources,x=>sourceFa[x.traffic_source]||x.traffic_source||'Other')}</div></section>
        <section class="panel"><h2>کمپین</h2>${campaignHtml}</section>
      </div>
      <section class="panel"><h2>آنلاین الان <small>(۵ دقیقهٔ اخیر)</small></h2>${onlineHtml}</section>
      <section class="panel"><h2>بازدیدکنندگان</h2>${visitors}</section>
      <section class="panel"><h2>آخرین بازدیدها</h2>${recent}</section>`;
    content.querySelectorAll('[data-range]').forEach(btn=>btn.onclick=()=>{
      range=btn.dataset.range;
      if(range==='7d') days=7;
      if(range==='30d') days=30;
      if(range==='custom' && (!from || !to)){ load(); return; }
      load();
    });
    content.querySelectorAll('[data-metric]').forEach(btn=>btn.onclick=()=>{ metric=btn.dataset.metric; load(); });
    const apply=content.querySelector('#visitApply');
    if(apply) apply.onclick=()=>{
      from=(content.querySelector('#visitFrom')||{}).value||'';
      to=(content.querySelector('#visitTo')||{}).value||'';
      if(from && to && from<=to) load();
    };
  };
  await load();
};

window.renderCoreRoute=render;

// ── داشبورد «آمار و تحلیل سایت» — صفحهٔ کامل Analytics پنل مربی (RTL، دادهٔ واقعی دیتابیس) ──
window.renderAnalyticsDashboard=async function(label,route){
  const state={range:'7d',from:'',to:'',tab:'overview',page:1,pageSize:10,q:'',device:'',source:''};
  const fa=n=>Number(n||0).toLocaleString('fa-IR');
  const pctText=n=>`${fa(Number(n||0))}٪`;
  const flag=code=>{const cc=String(code||'').toUpperCase();if(cc==='LN')return '🏠';if(!/^[A-Z]{2}$/.test(cc))return '🌐';return String.fromCodePoint(...[...cc].map(c=>127397+c.charCodeAt(0)));};
  const deviceFa={mobile:'📱 موبایل',tablet:'💻 تبلت',desktop:'🖥 دسکتاپ'};
  const sourceFa={Direct:'مستقیم · Direct',Google:'گوگل · Google',Instagram:'اینستاگرام · Instagram',Telegram:'تلگرام · Telegram',Referral:'ارجاع دیگر · Referral',Other:'سایر · Other'};
  const osFa={Android:'Android',iOS:'iOS',Windows:'Windows',macOS:'macOS',Linux:'Linux',Other:'سایر'};
  const eventFa={landing_view:'بازدید لندینگ',coach_page_view:'بازدید صفحهٔ مربی',register_start:'شروع ثبت‌نام',registration_complete:'تکمیل ثبت‌نام',login:'ورود',telegram_connect:'اتصال تلگرام'};
  const ranges=[['today','امروز'],['yesterday','دیروز'],['7d','۷ روز اخیر'],['30d','۳۰ روز اخیر'],['90d','۹۰ روز اخیر'],['custom','سفارشی']];
  const tabs=[['overview','نمای کلی'],['sources','منابع و دستگاه‌ها'],['visitors','بازدیدکنندگان'],['journey','مسیر و قیف'],['online','کاربران آنلاین']];
  let data=null;
  const rangeQs=()=>`range=${encodeURIComponent(state.range)}${state.range==='custom'?`&from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}`:''}`;
  const visitorsQs=()=>`${rangeQs()}&page=${state.page}&page_size=${state.pageSize}&q=${encodeURIComponent(state.q)}&device=${encodeURIComponent(state.device)}&source=${encodeURIComponent(state.source)}`;
  const showLoading=text=>{content.innerHTML=`<div class="loading-state"><span class="spinner"></span><p>${esc(text||'در حال بارگذاری آمار…')}</p></div>`;};
  const showError=message=>{
    content.innerHTML=`<section class="panel error"><h2>دریافت آمار ممکن نشد</h2><p>${esc(message)}</p><button class="primary" id="vaRetry">تلاش دوباره</button></section>`;
    const retry=content.querySelector('#vaRetry');
    if(retry)retry.onclick=()=>loadAll();
  };
  const fetchVisitors=async()=>{
    data.visitors=await api(`/api/coach/analytics/visitors?${visitorsQs()}`);
  };
  const loadAll=async()=>{
    updateSidebarActiveState(route);
    crumb.textContent=label;
    showLoading();
    try{
      const [summary,timeseries,pages,visitors,sources,devices,geo,journey,funnel]=await Promise.all([
        api(`/api/coach/analytics/summary?${rangeQs()}`),
        api(`/api/coach/analytics/timeseries?${rangeQs()}`),
        api(`/api/coach/analytics/pages?${rangeQs()}`),
        api(`/api/coach/analytics/visitors?${visitorsQs()}`),
        api(`/api/coach/analytics/sources?${rangeQs()}`),
        api(`/api/coach/analytics/devices?${rangeQs()}`),
        api(`/api/coach/analytics/geo?${rangeQs()}`),
        api(`/api/coach/analytics/journey?${rangeQs()}`),
        api(`/api/coach/analytics/funnel?${rangeQs()}`),
      ]);
      data={summary,timeseries,pages,visitors,sources,devices,geo,journey,funnel};
      render();
    }catch(error){ showError(error.message); }
  };
  const hbar=rows=>rows.length?`<div class="visit-hbars">${rows.map(r=>`
    <div class="visit-hbar">
      <span class="visit-hbar-label">${esc(r.label||r.name||'—')}</span>
      <div class="visit-hbar-track"><i style="width:${Math.max(2,Math.round(Number(r.percent)||0))}%"></i></div>
      <b>${fa(r.views)}</b><small>${pctText(r.percent)}${r.visitors!=null?` • ${fa(r.visitors)} نفر`:''}</small>
    </div>`).join('')}</div>`:'<p class="visit-empty">داده‌ای در این بازه ثبت نشده است.</p>';
  const tableHtml=(head,rows)=>`<div class="table-wrap"><table class="visit-table"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${head.length}" class="empty">اطلاعاتی برای نمایش وجود ندارد.</td></tr>`}</tbody></table></div>`;
  const openDetail=async id=>{
    let d;
    try{ d=await api('/api/coach/analytics/visitors/'+encodeURIComponent(id)); }
    catch(error){ alert(error.message); return; }
    const m=document.createElement('div');
    m.className='modal-backdrop';
    const pagesList=(d.pages||[]).map(p=>`<li><span dir="ltr">${esc(p.path)}</span><b>${fa(p.views)}</b></li>`).join('');
    const sourcesList=(d.sources||[]).map(s=>`<li><span>${esc(sourceFa[s.source]||s.source)}</span><b>${fa(s.views)}</b></li>`).join('');
    const utmList=(d.utms||[]).map(u=>`<li><span dir="ltr">${esc([u.utm_source,u.utm_medium,u.utm_campaign].filter(Boolean).join(' / ')||'—')}</span><b>${fa(u.views)}</b></li>`).join('');
    m.innerHTML=`<div class="modal visit-detail">
      <div class="modal-head"><h2>جزئیات بازدیدکننده</h2><button type="button" class="close" aria-label="بستن">×</button></div>
      <dl class="visit-detail-grid">
        <div><dt>Visitor ID</dt><dd class="visit-id" dir="ltr">${esc(d.visitor_id)}</dd></div>
        <div><dt>نوع</dt><dd>${d.kind==='returning'?'🔁 بازگشتی':'✨ جدید'}</dd></div>
        <div><dt>کشور</dt><dd>${flag(d.country_code)} ${esc(d.country_name||'نامشخص')}</dd></div>
        <div><dt>شهر</dt><dd>${esc(d.city||'—')}</dd></div>
        <div><dt>دستگاه</dt><dd>${esc(deviceFa[d.device]||d.device||'—')}</dd></div>
        <div><dt>Browser</dt><dd>${esc(d.browser||'—')}</dd></div>
        <div><dt>OS</dt><dd>${esc(d.os||'—')}</dd></div>
        <div><dt>تعداد Session</dt><dd>${fa(d.sessions)}</dd></div>
        <div><dt>تعداد Page View</dt><dd>${fa(d.pageviews)}</dd></div>
        <div><dt>اولین ورود</dt><dd>${esc(d.first_fa||'—')}</dd></div>
        <div><dt>آخرین فعالیت</dt><dd>${esc(d.last_fa||'—')}</dd></div>
        <div><dt>میانگین مدت Session</dt><dd>${esc(d.average_session_fa||'نامشخص')}</dd></div>
        <div><dt>وضعیت</dt><dd>${d.online?'🟢 آنلاین':'آفلاین'}</dd></div>
        <div><dt>وضعیت ثبت‌نام</dt><dd>${d.registered?`✅ ثبت‌نام‌شده${d.registration_fa?` — ${esc(d.registration_fa)}`:''}`:'❌ ثبت‌نام نکرده'}</dd></div>
      </dl>
      <h3>صفحات مشاهده‌شده</h3><ul class="visit-detail-list">${pagesList||'<li>—</li>'}</ul>
      <h3>منابع ورود</h3><ul class="visit-detail-list">${sourcesList||'<li>—</li>'}</ul>
      ${utmList?`<h3>کمپین‌ها (UTM)</h3><ul class="visit-detail-list">${utmList}</ul>`:''}
    </div>`;
    document.body.append(m);
    m.querySelectorAll('.close').forEach(x=>x.onclick=()=>m.remove());
    m.addEventListener('click',event=>{ if(event.target===m) m.remove(); });
  };
  const render=()=>{
    updateSidebarActiveState(route);
    crumb.textContent=label;
    const s=data.summary||{};
    const cards=s.cards||{};
    const today=s.today||{};
    const span=data.timeseries||{};
    const daily=span.daily||[];
    const maxDaily=Math.max(1,...daily.map(d=>Math.max(Number(d.views||0),Number(d.visitors||0),Number(d.sessions||0))));
    const trendBars=daily.length?daily.map(d=>`
      <div class="visit-col" title="${esc(d.day)} — بازدید ${fa(d.views)} • بازدیدکننده ${fa(d.visitors)} • نشست ${fa(d.sessions)}">
        <i class="s1" style="height:${Math.round(Number(d.views||0)/maxDaily*100)}%"></i>
        <i class="s2" style="height:${Math.round(Number(d.visitors||0)/maxDaily*100)}%"></i>
        <i class="s3" style="height:${Math.round(Number(d.sessions||0)/maxDaily*100)}%"></i>
        <small>${esc(String(d.day||'').slice(5))}</small>
      </div>`).join(''):'';
    const legend=`<div class="visit-legend"><span><i class="s1"></i>بازدید صفحه</span><span><i class="s2"></i>بازدیدکننده یکتا</span><span><i class="s3"></i>نشست</span></div>`;
    const pagesData=data.pages||{};
    const pageRows=(pagesData.pages||[]);
    const pagesTable=tableHtml(['صفحه','بازدید','بازدیدکننده یکتا','درصد','میانگین زمان'],pageRows.map(p=>`<tr><td class="visit-path" dir="ltr">${esc(p.path)}</td><td>${fa(p.views)}</td><td>${fa(p.visitors)}</td><td>${pctText(p.percent)}</td><td>${esc(p.avg_time_fa||'نامشخص')}</td></tr>`));
    const sourcesData=data.sources||{};
    const devicesData=data.devices||{};
    const geoData=data.geo||{};
    const geoTable=tableHtml(['کشور','شهر','بازدید','بازدیدکننده'],(geoData.places||[]).map(g=>`<tr><td>${flag(g.country_code)} ${esc(g.country_name||'نامشخص')}</td><td>${esc(g.city||'—')}</td><td>${fa(g.views)}</td><td>${fa(g.visitors)}</td></tr>`));
    const campaignsTable=tableHtml(['utm_source','utm_medium','utm_campaign','بازدید','نفر','درصد'],(sourcesData.campaigns||[]).map(c=>`<tr><td dir="ltr">${esc(c.utm_source||'—')}</td><td dir="ltr">${esc(c.utm_medium||'—')}</td><td dir="ltr">${esc(c.utm_campaign||'—')}</td><td>${fa(c.views)}</td><td>${fa(c.visitors)}</td><td>${pctText(c.percent)}</td></tr>`));
    const visitorsData=data.visitors||{};
    const visitorRows=(visitorsData.items||[]).map(v=>`<tr class="va-row ${v.online?'visit-online':''}" data-visitor="${esc(v.visitor_id)}">
      <td class="visit-id" dir="ltr">${esc(v.visitor_label||'visitor_…')}${v.online?' <span class="visit-live-dot" title="فعال در ۵ دقیقهٔ اخیر"></span>':''}<br><span class="visit-badge ${v.returning?'yes':'no'}">${v.returning?'بازگشتی':'جدید'}</span></td>
      <td>${flag(v.country_code)} ${esc(v.country_name||'نامشخص')}</td>
      <td>${esc(v.city||'—')}</td>
      <td>${esc(deviceFa[v.device]||v.device||'—')}</td>
      <td>${esc(v.browser||'—')}</td>
      <td>${fa(v.views)}</td>
      <td class="visit-time">${esc(v.first_fa||'—')}</td>
      <td class="visit-time">${esc(v.last_fa||'—')}</td>
      <td>${esc(v.duration_fa||'نامشخص')}</td>
      <td>${v.online?'<span class="visit-badge yes">🟢 آنلاین</span>':'<span class="visit-badge no">آفلاین</span>'}</td>
      <td>${v.registered?'<span class="visit-badge yes">✅ ثبت‌نام</span>':'<span class="visit-badge no">—</span>'}</td>
    </tr>`);
    const visitorsTable=tableHtml(['Visitor','کشور','شهر','دستگاه','مرورگر','صفحات','ورود','آخرین فعالیت','مدت نشست','وضعیت','ثبت‌نام'],visitorRows);
    const pager=`<div class="va-pager">
      <button class="secondary" id="vaPrev" ${visitorsData.page<=1?'disabled':''}>قبلی</button>
      <span>صفحهٔ ${fa(visitorsData.page)} از ${fa(visitorsData.pages_count)} — ${fa(visitorsData.total)} بازدیدکننده</span>
      <button class="secondary" id="vaNext" ${(visitorsData.page||1)>=(visitorsData.pages_count||1)?'disabled':''}>بعدی</button>
      <label>در هر صفحه
        <select id="vaSize">${[10,25,50].map(n=>`<option value="${n}" ${n===Number(visitorsData.page_size)?'selected':''}>${fa(n)}</option>`).join('')}</select>
      </label>
    </div>`;
    const recentTable=tableHtml(['زمان','بازدیدکننده','کشور','دستگاه','صفحه'],(visitorsData.recent||[]).map(r=>`<tr><td class="visit-time">${esc(r.visited_fa||'—')}</td><td class="visit-id" dir="ltr">${esc(r.visitor_label||'visitor_…')}</td><td>${flag(r.country_code)} ${esc(r.country_name||'نامشخص')}</td><td>${esc(deviceFa[r.device]||r.device||'—')}</td><td class="visit-path" dir="ltr">${esc(r.path||'/')}</td></tr>`));
    const journeyData=data.journey||{};
    const stepsHtml=(journeyData.steps||[]).length?`<ol class="visit-steps">${(journeyData.steps||[]).map(step=>`<li><b>${esc(step.label)}</b><span>${fa(step.users)} کاربر</span></li>`).join('')}</ol>`:'<p class="visit-empty">هنوز مسیری ثبت نشده است.</p>';
    const pathsHtml=(journeyData.paths||[]).length?`<ol class="visit-journey">${(journeyData.paths||[]).map(j=>`<li><span dir="auto">${esc(j.path)}</span><b class="visit-badge yes">${fa(j.users)} کاربر</b></li>`).join('')}</ol>`:'<p class="visit-empty">هنوز مسیر چندصفحه‌ای ثبت نشده است.</p>';
    const funnel=data.funnel||{};
    const stages=funnel.stages||[];
    const funnelHtml=stages.length?`<div class="visit-funnel-v">${stages.map((st,i)=>`
      ${i?'<div class="visit-funnel-arrow" aria-hidden="true">↓</div>':''}
      <div class="visit-funnel-stage">
        <header><b>${esc(st.label)}</b><strong>${fa(st.count)}</strong></header>
        <div class="visit-hbar-track"><i style="width:${Math.max(2,Math.round(Number(st.rate_first)||0))}%"></i></div>
        <small>نسبت به مرحلهٔ قبل: ${pctText(st.rate_prev)} • نسبت به بازدید سایت: ${pctText(st.rate_first)}</small>
      </div>`).join('')}</div>
      <p class="visit-funnel-note">نرخ تبدیل نهایی (بازدید سایت ← ثبت‌نام موفق): <b>${pctText(funnel.conversion_rate)}</b>${funnel.key_pages&&funnel.key_pages.length?` — صفحات مهم: ${funnel.key_pages.map(k=>esc(k)).join('، ')}`:''}</p>`:'<p class="visit-empty">هنوز داده‌ای برای قیف تبدیل ثبت نشده است.</p>';
    const eventsHtml=(funnel.events||[]).map(e=>`<div class="visit-chip"><b>${esc(eventFa[e.event_type]||e.event_type)}</b><span>${fa(e.count)}</span></div>`).join('');
    const onlineRows=(s.online_now||[]).map(o=>`<tr><td class="visit-id" dir="ltr">${esc(o.visitor_label||'visitor_…')}</td><td>${flag(o.country_code)} ${esc([o.country_name,o.city].filter(Boolean).join('، ')||'نامشخص')}</td><td>${esc(deviceFa[o.device]||o.device||'—')}</td><td class="visit-path" dir="ltr">${esc(o.path||'/')}</td><td class="visit-time">${esc(o.last_fa||'—')}</td></tr>`);
    const onlineTable=tableHtml(['بازدیدکننده','کشور','دستگاه','صفحه فعلی','آخرین فعالیت'],onlineRows);
    const exportHref=`/api/analytics/export?${rangeQs()}`;
    const customBlock=state.range==='custom'?`<div class="visit-custom"><label>از <input type="date" id="vaFrom" value="${esc(state.from)}"></label><label>تا <input type="date" id="vaTo" value="${esc(state.to)}"></label><button class="secondary" id="vaApply">اعمال</button></div>`:'';
    const geoNote=geoData.pending_geo?`<p class="visit-geo-note">🌍 ${fa(geoData.pending_geo)} مورد در صف تعیین کشور است و در پس‌زمینه کامل می‌شود.</p>`:'';
    const tabBodies={
      overview:`
        <div class="stat-grid visit-stats">
          <article><span>👁️ بازدید صفحات (Page Views)</span><strong>${fa(cards.pageviews)}</strong><small>فقط صفحات عمومی سایت</small></article>
          <article><span>👤 بازدیدکنندگان یکتا (Unique Visitors)</span><strong>${fa(cards.visitors)}</strong><small>بر اساس شناسهٔ ناشناس yasnafit_vid</small></article>
          <article><span>🔄 نشست‌ها (Sessions)</span><strong>${fa(cards.sessions)}</strong><small>وقفهٔ ۳۰ دقیقه</small></article>
          <article><span>⏱ میانگین مدت نشست</span><strong>${esc(cards.average_session_fa||'نامشخص')}</strong><small>از نشست‌های واقعی</small></article>
          <article><span>🟢 آنلاین‌های ۵ دقیقه اخیر</span><strong>${fa(cards.online)}</strong><small>فعالیت ۵ دقیقهٔ اخیر</small></article>
          <article><span>📝 ثبت‌نام‌ها</span><strong>${fa(cards.registrations)}</strong><small>در همین بازه</small></article>
          <article><span>🔁 بازدیدکنندگان برگشتی</span><strong>${fa(cards.returning_visitors)}</strong><small>جدید ${fa(cards.new_visitors)}</small></article>
          <article><span>📄 میانگین صفحات در هر نشست</span><strong>${fa(cards.pages_per_session)}</strong><small>بازدید صفحه ÷ نشست</small></article>
        </div>
        <p class="visit-today">امروز (${esc(today_fa||'—')}): ${fa(today.visitors)} بازدیدکننده • ${fa(today.pageviews)} بازدید صفحه • ${fa(today.sessions)} نشست • ${fa(today.registrations)} ثبت‌نام</p>
        <section class="panel"><h2>روند بازدید</h2><div class="visit-bars visit-bars-grouped" dir="ltr">${trendBars||'<p class="visit-empty">—</p>'}</div>${legend}</section>
        <section class="panel"><h2>صفحات محبوب</h2>${hbar(pageRows.slice(0,8).map(p=>({label:p.path,views:p.views,percent:p.percent,visitors:p.visitors})))}${pagesTable}</section>`,
      sources:`
        <section class="panel"><h2>منابع ورود</h2>${hbar((sourcesData.sources||[]).map(x=>({label:sourceFa[x.name]||x.name,views:x.views,percent:x.percent,visitors:x.visitors})))}
          <h2 style="margin-top:16px">سایر Referrerها</h2>${hbar((sourcesData.referrers||[]).map(x=>({label:x.name,views:x.views,percent:x.percent,visitors:x.visitors})))}
          <h2 style="margin-top:16px">کمپین‌ها (utm)</h2>${campaignsTable}</section>
        <section class="panel"><h2>دستگاه</h2>${hbar((devicesData.devices||[]).map(x=>({label:deviceFa[x.name]||x.name,views:x.views,percent:x.percent,visitors:x.visitors})))}
          <h2 style="margin-top:16px">Browser</h2>${hbar((devicesData.browsers||[]).map(x=>({label:x.name==='Other'?'سایر':x.name,views:x.views,percent:x.percent,visitors:x.visitors})))}
          <h2 style="margin-top:16px">سیستم‌عامل</h2>${hbar((devicesData.os||[]).map(x=>({label:osFa[x.name]||x.name,views:x.views,percent:x.percent,visitors:x.visitors})))}</section>
        <section class="panel"><h2>جغرافیا</h2>${geoTable}${geoNote}</section>`,
      visitors:`
        <section class="panel"><h2>بازدیدکنندگان</h2>
          <div class="va-filters">
            <input id="vaQ" type="search" placeholder="جستجو: شناسه، کشور، شهر، صفحه…" value="${esc(state.q)}">
            <select id="vaDevice"><option value="">همهٔ دستگاه‌ها</option>${['mobile','tablet','desktop'].map(d=>`<option value="${d}" ${state.device===d?'selected':''}>${esc((deviceFa[d]||d).replace(/^\S+\s/,''))}</option>`).join('')}</select>
            <select id="vaSource"><option value="">همهٔ منابع</option>${['Direct','Google','Instagram','Telegram','Referral','Other'].map(x=>`<option value="${x}" ${state.source===x?'selected':''}>${esc(sourceFa[x]||x)}</option>`).join('')}</select>
            <button class="secondary" id="vaSearch">جستجو</button>
          </div>
          ${visitorsTable}${pager}
          <p class="visit-empty">برای مشاهدهٔ جزئیات، روی هر ردیف کلیک کنید. IP خام و User-Agent نمایش داده نمی‌شود.</p>
        </section>
        <section class="panel"><h2>آخرین بازدیدها</h2>${recentTable}</section>`,
      journey:`
        <section class="panel"><h2>مسیر بازدیدکنندگان</h2><p class="visit-empty">تعداد کاربران در هر مرحله از مسیر:</p>${stepsHtml}<h2 style="margin-top:16px">مسیرهای پرتکرار</h2>${pathsHtml}</section>
        <section class="panel"><h2>Funnel — قیف تبدیل</h2>${funnelHtml}<div class="visit-chips" style="margin-top:14px">${eventsHtml||'<p class="visit-empty">—</p>'}</div></section>`,
      online:`
        <section class="panel"><h2>🟢 کاربران آنلاین <small>(فعال در ۵ دقیقهٔ اخیر)</small></h2>${onlineTable}</section>`,
    };
    content.innerHTML=`
      <div class="page-head"><div><h1>آمار و تحلیل سایت</h1><p>آمار واقعی سایت از دیتابیس Analytics — صفحات عمومی، نشست واقعی، منطقهٔ زمانی Asia/Tehran. بازدیدکنندگان با شناسهٔ ناشناس yasnafit_vid شمرده می‌شوند.</p></div>
        <div class="visit-ranges">${ranges.map(([key,title])=>`<button class="secondary ${key===state.range?'active':''}" data-range="${key}">${title}</button>`).join('')}
          <button class="primary" id="vaRefresh">🔄 بروزرسانی آمار</button><a class="secondary" href="${exportHref}">خروجی</a></div></div>
      ${customBlock}
      <div class="va-tabs" role="tablist">${tabs.map(([key,title])=>`<button class="secondary ${key===state.tab?'active':''}" data-tab="${key}" role="tab">${title}</button>`).join('')}</div>
      ${tabBodies[state.tab]||''}`;
    content.querySelectorAll('[data-range]').forEach(btn=>btn.onclick=()=>{
      state.range=btn.dataset.range;
      state.page=1;
      if(state.range==='custom'&&(!state.from||!state.to)){
        const todayKey=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'});
        state.from=state.from||todayKey;state.to=state.to||todayKey;
        render();
        return;
      }
      loadAll();
    });
    content.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{ state.tab=btn.dataset.tab; render(); });
    const refresh=content.querySelector('#vaRefresh');
    if(refresh) refresh.onclick=()=>loadAll();
    const apply=content.querySelector('#vaApply');
    if(apply) apply.onclick=()=>{
      state.from=(content.querySelector('#vaFrom')||{}).value||'';
      state.to=(content.querySelector('#vaTo')||{}).value||'';
      if(state.from&&state.to&&state.from<=state.to) loadAll();
    };
    content.querySelectorAll('.va-row').forEach(row=>row.onclick=()=>openDetail(row.dataset.visitor));
    const reloadVisitors=async()=>{
      showLoading('در حال بارگذاری بازدیدکنندگان…');
      try{ await fetchVisitors(); render(); }catch(error){ showError(error.message); }
    };
    const searchBtn=content.querySelector('#vaSearch');
    if(searchBtn) searchBtn.onclick=()=>{ state.q=(content.querySelector('#vaQ')||{}).value||''; state.device=(content.querySelector('#vaDevice')||{}).value||''; state.source=(content.querySelector('#vaSource')||{}).value||''; state.page=1; reloadVisitors(); };
    const qInput=content.querySelector('#vaQ');
    if(qInput) qInput.addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); if(searchBtn) searchBtn.click(); } });
    const prev=content.querySelector('#vaPrev');
    if(prev) prev.onclick=()=>{ if(state.page>1){ state.page-=1; reloadVisitors(); } };
    const next=content.querySelector('#vaNext');
    if(next) next.onclick=()=>{ state.page+=1; reloadVisitors(); };
    const size=content.querySelector('#vaSize');
    if(size) size.onchange=()=>{ state.pageSize=Number(size.value)||10; state.page=1; reloadVisitors(); };
  };
  const today_fa=new Date().toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'});
  await loadAll();
};
function coachNotificationTarget(item){
  if(item.entity_type==='assessment'&&item.entity_id)return `/assessments/${item.entity_id}`;
  if(item.student_case_number)return `/users-list/${item.student_case_number}`;
  return '';
}
async function updateCoachNotifications(){
  const bell=document.querySelector('#coachReviewBell'),badge=document.querySelector('#coachReviewBellCount'),summary=document.querySelector('#coachNotificationSummary'),list=document.querySelector('#coachNotificationList'),clearButton=document.querySelector('#clearNotifications');
  if(!bell||!badge||!summary||!list)return;
  try{
    const response=await api('/api/coach/notifications'),notifications=Array.isArray(response.notifications)?response.notifications:[],unread=notifications.filter(item=>!item.read_at).length,localized=unread.toLocaleString('fa-IR');
    badge.textContent=localized;badge.hidden=unread===0;if(clearButton)clearButton.disabled=notifications.length===0;summary.textContent=unread?`${localized} اعلان خوانده‌نشده`:'اعلان جدیدی ندارید';bell.setAttribute('aria-label',unread?`${localized} اعلان جدید`:'اعلان‌ها');
    const recent=notifications.slice(0,12);
    list.innerHTML=recent.length?recent.map(item=>{const target=coachNotificationTarget(item),date=new Date(String(item.created_at||'').replace(' ','T')+'Z'),dateText=Number.isNaN(date.getTime())?'':date.toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'});return `<button type="button" class="coach-notification-item ${item.read_at?'read':'unread'}" data-notification="${esc(item.stable_id)}" data-target="${esc(target)}"><i></i><span><b>${esc(item.title)}</b><span>${esc(item.body||'')}</span><small>${item.student_name?`${esc(item.student_name)}${item.student_case_number?` • پرونده ${esc(item.student_case_number)}`:''} • `:''}${esc(dateText)}</small></span></button>`}).join(''):'<p>اعلانی برای نمایش وجود ندارد.</p>';
    list.querySelectorAll('[data-notification]').forEach(item=>item.onclick=async()=>{const target=item.dataset.target;try{if(item.classList.contains('unread'))await api(`/api/coach/notifications/${encodeURIComponent(item.dataset.notification)}/read`,{method:'POST'});}catch(error){}if(target)location.href=target;else updateCoachNotifications();});
  }catch(error){summary.textContent='دریافت اعلان‌ها انجام نشد';list.innerHTML='<p>برای تلاش دوباره زنگ را ببندید و باز کنید.</p>';}
}
function setupCoachNotifications(){
  const center=document.querySelector('#coachNotificationCenter'),bell=document.querySelector('#coachReviewBell'),panel=document.querySelector('#coachNotificationPanel'),close=document.querySelector('#closeNotifications'),clear=document.querySelector('#clearNotifications');if(!center||!bell||!panel||!clear)return;
  const setOpen=open=>{panel.hidden=!open;bell.setAttribute('aria-expanded',String(open));if(open)updateCoachNotifications();};
  bell.onclick=event=>{event.stopPropagation();setOpen(panel.hidden);};
  close.onclick=()=>setOpen(false);
  clear.onclick=async()=>{if(!confirm('همه اعلان‌ها پاک شوند؟'))return;clear.disabled=true;try{await api('/api/coach/notifications',{method:'DELETE'});await updateCoachNotifications();}catch(error){clear.disabled=false;alert(error.message);}};
  panel.onclick=event=>event.stopPropagation();
  document.addEventListener('click',event=>{if(!center.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});
  updateCoachNotifications();setInterval(updateCoachNotifications,30000);window.addEventListener('focus',updateCoachNotifications);
}
setupCoachNotifications();
document.querySelector('#coachLogout')?.addEventListener('click',async()=>{
  try{await fetch('/api/coach/auth/logout',{method:'POST'});}catch(error){}
  location.replace('/coach/login');
});
const initialCoachPath=location.pathname;
if(initialCoachPath==='/'||initialCoachPath==='/index.html'||initialCoachPath==='/coach/dashboard')render('داشبورد','/coach/dashboard');
