async function api(url, options={}) {
  const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options});
  const d=await r.json();
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
      content.innerHTML=`
        <div class="page-head dashboard-title"><div><p class="eyebrow">نمای کلی</p><h1>داشبورد</h1><p>خلاصه فعالیت‌های ثبت‌شده در سامانه محلی.</p><small class="dashboard-version">${esc(versionInfo.name)} v${esc(versionInfo.version)}</small></div></div>
        <div class="stat-grid">
          <article><span>کل شاگردها</span><strong>${d.stats.total}</strong></article>
          <article><span>برنامه‌های فعال</span><strong>${d.stats.trainingPrograms||d.stats.active||0}</strong></article>
          <article><span>سفارش‌های در انتظار</span><strong>${d.stats.waiting}</strong></article>
          <article><span>حرکات ثبت‌شده</span><strong>${d.stats.movements}</strong></article>
        </div>
        <div class="split"><section class="panel"><h2>شاگردهای اخیر</h2>${table(['نام / پرونده','هدف','وضعیت'],d.students,x=>`<tr><td><b>${esc(x.full_name)}</b><small class="case-number-inline">پرونده ${esc(x.case_number||'------')}</small></td><td>${esc(fa(x.goal||'—'))}</td><td><b class="badge">${esc(fa(x.profile_status||x.status))}</b></td></tr>`)}</section><section class="panel"><h2>فعالیت‌های اخیر</h2><ul class="activity">${d.activities.map(x=>`<li><b>${esc(x.title)}</b><span>${esc(x.detail||'')}</span></li>`).join('')}</ul></section></div>`;
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
const initialCoachPath=location.pathname;
if(initialCoachPath==='/'||initialCoachPath==='/index.html'||initialCoachPath==='/coach/dashboard')render('داشبورد','/coach/dashboard');
