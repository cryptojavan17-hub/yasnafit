const sidebarMenu = [
  ['داشبورد','/coach/dashboard','🏠'],
  ['شاگردان',null,'👥',[
    ['لیست شاگردان','/users-list'],
    ['ارزیابی‌های در انتظار','/students/submissions']
  ]],
  ['برنامه‌ها',null,'📚',[
    ['برنامه‌های تمرینی','/templates/exercise/list'],
    ['برنامه‌های غذایی','/programs/diet/list'],
    ['برنامه‌های مکمل','/programs/supplement/list'],
    ['بانک برنامه','/programs/exercise/movements-list']
  ]],
  ['سیستم',null,'📦',[
    ['پیکربندی هوش مصنوعی (AI)','/settings/ai'],
    ['تنظیمات و پشتیبان','/coach/settings'],
    ['نسخه و تغییرات','/coach/releases']
  ]]
];
// Only operational routes belong in navigation. Detail/review routes remain
// reachable from their relevant lists, without cluttering the sidebar.
const menu=sidebarMenu;

const menuEl=document.querySelector('#menu'), content=document.querySelector('#content'), crumb=document.querySelector('#breadcrumb');
let current='';
function go(label, route){ current=route; history.pushState({},'',route); renderRoute(label,route); document.querySelector('#sidebar').classList.remove('open'); }

function updateSidebarActiveState(route){
  document.querySelectorAll('.menu-link').forEach(link=>{
    const isDirectMatch = link.dataset.route === route;
    link.classList.toggle('active', isDirectMatch);
    if(isDirectMatch && link.classList.contains('child')){
      link.closest('.menu-group')?.classList.add('expanded');
    }
  });
}

function renderRoute(label,route){
  updateSidebarActiveState(route);
  // Student portal - no sidebar, secure token
  if(route.startsWith('/join/') && window.renderStudentPortal) return window.renderStudentPortal(route);
  if((route==='/users-list' || route.startsWith('/users-list/')) && window.renderStudentsPage) return window.renderStudentsPage(label,route);
  
  if(route==='/programs/exercise/movements-list' && window.renderExerciseManager) return window.renderExerciseManager(label,route);
  if(route==='/programs/exercise/form' && window.renderProgramBuilder) return window.renderProgramBuilder(label,route);
  if(route==='/templates/exercise/list' && window.renderTrainingProgramsList) return window.renderTrainingProgramsList(label,route);
  if((route==='/programs/diet/list' || route==='/diet-programs') && window.renderDietProgramsList) return window.renderDietProgramsList(label,route);
  if((route==='/programs/diet/form' || route.startsWith('/programs/diet/form')) && window.renderDietProgramBuilder) return window.renderDietProgramBuilder(label,route);
  if((route==='/programs/supplement/list' || route==='/supplement-programs') && window.renderSupplementProgramsList) return window.renderSupplementProgramsList(label,route);
  if((route==='/programs/supplement/form' || route.startsWith('/programs/supplement/form')) && window.renderSupplementProgramBuilder) return window.renderSupplementProgramBuilder(label,route);
  if(route==='/students/submissions' && window.renderCoachSubmissions) return window.renderCoachSubmissions(label,route);
  if(((route.startsWith('/students/')&&route.includes('/timeline'))||/^\/coach\/students\/\d+\/assessments$/.test(route)) && window.renderStudentTimeline) return window.renderStudentTimeline(label,route);
  if(route.startsWith('/assessments/') && window.renderAssessmentReview) return window.renderAssessmentReview(label,route);
  if((route==='/settings/ai' || route==='/coach/ai') && window.renderAISettings) return window.renderAISettings(label,route);
  if(route==='/coach/releases' && window.renderReleaseHistory) return window.renderReleaseHistory(label,route);
  if(window.renderCoreRoute)return window.renderCoreRoute(label,route);
  // core.js loads immediately after this shell and owns dashboard/settings.
  // Unknown legacy URLs are normalized instead of rendering dead placeholders.
  if(route!=='/coach/dashboard')history.replaceState({},'','/coach/dashboard');
  crumb.textContent='داشبورد';
  content.innerHTML='<div class="loading-state"><span class="spinner"></span><p>در حال بارگذاری داشبورد…</p></div>';
}

sidebarMenu.forEach(([label,route,icon,children])=>{
  const wrap=document.createElement('div');wrap.className='menu-group';
  if(children){
    const button=document.createElement('button'); button.className='menu-link parent';
    button.innerHTML=`<span class="menu-icon">${icon}</span><span>${label}</span><i>⌄</i>`;
    const sub=document.createElement('div');sub.className='submenu';
    children.forEach(([child,childRoute])=>{
      const a=document.createElement('button');a.className='menu-link child';a.dataset.route=childRoute;a.textContent=child;
      a.onclick=()=>go(child,childRoute);
      if(childRoute===location.pathname)wrap.classList.add('expanded');
      sub.append(a)
    });
    button.onclick=()=>{wrap.classList.toggle('expanded')};
    wrap.append(button,sub)
  } else {
    const a=document.createElement('button');a.className='menu-link';a.dataset.route=route;
    a.innerHTML=`<span class="menu-icon">${icon}</span><span>${label}</span>`;
    a.onclick=()=>go(label,route);
    wrap.append(a)
  }
  menuEl.append(wrap)
});

const sidebarToggle=document.querySelector('#sidebarToggle');
function setSidebarCollapsed(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);sidebarToggle?.setAttribute('aria-pressed',String(collapsed));sidebarToggle?.setAttribute('aria-label',collapsed?'نمایش سایدبار':'مخفی کردن سایدبار');try{localStorage.setItem('yasnafit_sidebar_collapsed',collapsed?'1':'0');}catch(error){}}
try{setSidebarCollapsed(localStorage.getItem('yasnafit_sidebar_collapsed')==='1');}catch(error){setSidebarCollapsed(false);}
if(sidebarToggle)sidebarToggle.onclick=()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
document.querySelector('#menuToggle').onclick=()=>document.querySelector('#sidebar').classList.toggle('open');
window.onpopstate=()=>{
  const path=location.pathname;
  let foundLabel='بخش انتخاب‌شده';
  menu.forEach(([label,route,icon,children])=>{
    if(route===path) foundLabel=label;
    if(children) children.forEach(([cl,cr])=>{ if(cr===path) foundLabel=cl; });
  });
  if(path==='/coach/releases') foundLabel='نسخه و تغییرات';
  renderRoute(foundLabel, path);
};
const initialPath=location.pathname;
if(initialPath==='/'||initialPath==='/index.html'||initialPath==='/coach/dashboard')renderRoute('داشبورد','/coach/dashboard');
else content.innerHTML='<div class="loading-state"><span class="spinner"></span><p>در حال بارگذاری صفحه…</p></div>';
window.goToRoute = go;
