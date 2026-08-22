const menu = [
  ['داشبورد','/coach/dashboard','▦'],
  ['صفحه اختصاصی','/coach/manage-landing','◇'],
  ['مدیریت حساب',null,'⚙',[
    ['پکیج‌های من','/products/my'],
    ['مدیریت دستیار ها','/coach/assists'],
    ['لیست اشتراک ها','/licence/my'],
    ['خرید اشتراک','/licence/buy'],
    ['مدیریت حرکات تمرینی','/programs/exercise/movements-list'],
    ['دعوت از مربی ها','/monetization/invite']
  ]],
  ['لیست کارمندان','/employees-list','♙'],
  ['لیست مربی ها','/coach/list','♟'],
  ['کیف پول','/wallet/user-log','◉'],
  ['پایان دوره ها','/call-history/end-durations','◷'],
  ['تاریخچه کیف پول مربی ها','/wallet/full-log','◉'],
  ['شاگرد های من','/users-list','♚'],
  ['اشتراک ها',null,'◌',[
    ['تاریخچه کلی','/licence/list'],
    ['تراکنش ها','/licence/transactions']
  ]],
  ['مدیریت پیام‌های آماده','/messenger/quick-replies','✉'],
  ['بازخورد های سفارشات','/orders/feedback','★'],
  ['لیست مقایسه','/users-compare-images','▧'],
  ['فیدبک تیکت‌ها','/ticket-feedback','☻'],
  ['مشاوره موفقیت آمیز','/successful-call','✓'],
  ['کد تخفیف','/coupon','%'],
  ['پورتال فروش','/presentor-portal','⌁'],
  ['پورتال منشی','/secretary-portal','⌁'],
  ['لیست سفارشات',null,'▤',[
    ['در انتظار تکمیل برنامه','/orders/waiting'],
    ['در انتظار شروع دوره','/orders/waiting-for-duration'],
    ['سفارشات تکمیل شده','/orders/completed'],
    ['گزارش پیشرفته','/orders/advanced'],
    ['تراکنش های مالی','/payments']
  ]],
  ['سفارشات تکمیل نشده','/init-orders-list','!'],
  ['آخرین پیامک‌های ارسالی','/last-sms','✉'],
  ['نمودار فروش کارشناس','/presentor-chart','◫'],
  ['تماس‌های مشتریان من','/presentor/user-calls','☏'],
  ['پرداختی‌های مشتریان من','/presentor/payments','◉'],
  ['لیست انتظار تمرینی','/exercise/wait-list','◷'],
  ['لیست انتظار غذایی','/diet/wait-list','◷'],
  ['لیست انتظار اصلاحی','/corrective/wait-list','◷'],
  ['لیست انتظار مکمل','/supplement/wait-list','◷'],
  ['بانک برنامه ها',null,'▣',[
    ['ساخت برنامه تمرینی','/programs/exercise/form'],
    ['برنامه های غذایی','/templates/diet/list'],
    ['برنامه های مکمل','/templates/supplement/list'],
    ['برنامه های اصلاحی','/templates/corrective/list']
  ]],
  ['درآمد زایی',null,'◈',[['تاریخچه درآمد مربی ها','/monetization/log']]],
  ['ویدیو های آموزشی','/video-guides','▶'],
  ['رویداد ها',null,'◉',[
    ['لیست رویدادها','/events/list'],
    ['لیست ثبت نام','/events/orders'],
    ['کد های تخفیف','/events/discount'],
    ['تراکنش ها','/events/payments'],
    ['کیف پول رویداد','/events/wallet/user-log'],
    ['بلیت خوان','/events/scanner']
  ]],
  ['دوره ها',null,'▱',[
    ['لیست دوره ها','/courses/list'],
    ['لیست ثبت نام','/courses/orders'],
    ['کد های تخفیف','/courses/discount'],
    ['تراکنش ها','/courses/payments'],
    ['دسته بندی ها','/courses/tags'],
    ['کیف پول دوره ها','/courses/wallet/user-log']
  ]],
  ['ابزارها',null,'⌘',[
    ['محاسبه گر کالری','/tools/calorie-calculator'],
    ['محاسبه گر BMI','/tools/bmi-calculator']
  ]],
  ['اعلان ها و پاپ آپ ها','/notifs','♧'],
  ['تنظیمات پروفایل','/coach/profile','⚙'],
  ['تنظیمات سامانه','/coach/settings','⚙'],
  ['آمار ها',null,'◫',[
    ['آمار فروش','/reports/coach/general'],
    ['بیشترین تمدید شاگرد ها','/reports/coach/duration-sort'],
    ['شاگرد های تمدید نکرده','/reports/coach/not-extended'],
    ['گزارش لایسنس ها','/reports/admin/licence-charts'],
    ['گزارش اعتبارات','/reports/admin/credits'],
    ['گزارش لایسنس مربی‌ها','/reports/admin/coachs-data'],
    ['آمار بازخورد ها','/reports/coach/feedbacks']
  ]]
];

const visibleRoots = ['داشبورد', 'صفحه اختصاصی', 'مدیریت حساب', 'شاگرد های من', 'بانک برنامه ها', 'آمار ها'];
let sidebarMenu = menu.filter(item => visibleRoots.includes(item[0]));
const order = ['داشبورد','صفحه اختصاصی','مدیریت حساب','شاگرد های من','بانک برنامه ها','آمار ها'];
sidebarMenu.sort((a,b)=> order.indexOf(a[0]) - order.indexOf(b[0]));
const statsIndex = sidebarMenu.findIndex(item => item[0] === 'آمار ها');
sidebarMenu.splice(statsIndex, 0, ['تنظیمات', null, '⚙', [['پروفایل', '/coach/profile'], ['تنظیمات سامانه', '/coach/settings']]]);

const menuEl=document.querySelector('#menu'), content=document.querySelector('#content'), crumb=document.querySelector('#breadcrumb');
let current='';
function go(label, route){ current=route; history.pushState({},'',route); renderRoute(label,route); document.querySelector('#sidebar').classList.remove('open'); }

function renderRoute(label,route){
  if(route==='/programs/exercise/movements-list' && window.renderExerciseManager) return window.renderExerciseManager(label,route);
  if(route==='/programs/exercise/form' && window.renderProgramBuilder) return window.renderProgramBuilder(label,route);
  if(route==='/templates/exercise/list' && window.renderTrainingProgramsList) return window.renderTrainingProgramsList(label,route);
  crumb.textContent=label;
  document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active',x.dataset.route===route));
  content.innerHTML=`<div class="page-intro"><div><p class="eyebrow">پنل مدیریت Yasnafit</p><h1>${label}</h1><p>این بخش برای مدیریت <b>${label}</b> آماده شده است. محتوای عملیاتی آن در مرحله بعد به این صفحه افزوده می‌شود.</p></div><div class="page-icon">${route ? '◈' : '▦'}</div></div>
  <div class="placeholder-grid"><article><span>وضعیت صفحه</span><strong>آماده طراحی</strong><small>مسیر: ${route||'—'}</small></article><article><span>دسترسی</span><strong>مدیر / مربی</strong><small>ورود در نسخه فعلی غیرفعال است</small></article><article><span>گام بعدی</span><strong>پیاده‌سازی امکانات</strong><small>فرم‌ها، جدول‌ها و دیتابیس</small></article></div>`;
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

document.querySelector('#menuToggle').onclick=()=>document.querySelector('#sidebar').classList.toggle('open');
window.onpopstate=()=>{
  const path=location.pathname;
  let foundLabel='بخش انتخاب‌شده';
  menu.forEach(([label,route,icon,children])=>{
    if(route===path) foundLabel=label;
    if(children) children.forEach(([cl,cr])=>{ if(cr===path) foundLabel=cl; });
  });
  renderRoute(foundLabel, path);
};
renderRoute('داشبورد','/coach/dashboard');
window.goToRoute = go;
