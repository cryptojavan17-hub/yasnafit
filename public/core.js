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
      content.innerHTML=`${head.replace('＋ افزودن','ساخت نسخه پشتیبان')}<section class="panel settings-card"><h2>تنظیمات سامانه محلی</h2><p>دیتابیس در <code>data/yasnafit.db</code> است و کپی پشتیبان در پوشه <code>backups</code> ذخیره می‌شود.</p><button class="primary" id="backupBtn">ساخت نسخه پشتیبان SQLite</button><p id="backupResult"></p></section>`;
      const back=async()=>{
        const r=await api('/api/backup',{method:'POST'});
        document.querySelector('#backupResult').textContent=`نسخه پشتیبان با نام ${r.file} ساخته شد.`;
      };
      document.querySelector('#addBtn').onclick=back;
      document.querySelector('#backupBtn').onclick=back;
      return;
    }
    history.replaceState({},'','/coach/dashboard');
    return render('داشبورد','/coach/dashboard');
  }catch(e){
    content.innerHTML=`<section class="panel error"><h2>ارتباط با سرور برقرار نشد</h2><p>${esc(e.message)}</p></section>`;
  }
}
window.renderCoreRoute=render;
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
