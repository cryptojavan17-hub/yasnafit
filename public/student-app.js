(() => {
  const root=document.querySelector('#studentApp');
  const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
  const faList=value=>String(value??'').split(',').filter(Boolean).map(fa).join('، ')||'—';
  const asciiDigits=value=>String(value??'').replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'');
  const completeMobile=value=>{const digits=asciiDigits(value);if(digits.startsWith('09'))return digits;if(digits.startsWith('9'))return `0${digits}`;return `09${digits}`;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const statusLabels={PROFILE_INCOMPLETE:'در حال تکمیل',ASSESSMENT_PENDING:'در حال تکمیل',DRAFT:'پیش‌نویس',SUBMITTED:'ارسال‌شده',PENDING_REVIEW:'در انتظار بررسی',UNDER_REVIEW:'در حال بررسی',CHANGES_REQUESTED:'نیاز به اصلاح',APPROVED:'تأیید شده',REJECTED:'رد شده',PROGRAM_ASSIGNED:'برنامه اختصاص داده شد',ACTIVE:'فعال',COMPLETED:'تکمیل‌شده',ARCHIVED:'آرشیو'};
  const photoLabels={front:'جلو',side:'بغل',back:'پشت',front_flex:'جلو با فیگور بازو',back_flex:'پشت با فیگور بازو'};
  const routes=[
    ['/student/dashboard','⌂','خانه'],
    ['/student/program','🏋️','برنامه تمرینی'],
    ['/student/diet','🥗','برنامه غذایی'],
    ['/student/supplement','💊','برنامه مکمل'],
    ['/student/workouts','✓','ثبت تمرین'],
    ['/student/assessment','◫','ارزیابی من'],
    ['/student/history','◷','تاریخچه'],
    ['/student/messages','✉','پیام‌ها'],
    ['/student/notifications','◉','اعلان‌ها'],
    ['/student/profile','○','پروفایل من']
  ];
  const mobileRoutes=routes.filter(([href])=>['/student/dashboard','/student/program','/student/diet','/student/supplement','/student/workouts','/student/messages'].includes(href));
  let me=null;

  async function api(url,options={}){
    const headers={Accept:'application/json',...(options.body && !(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{...options,headers,credentials:'same-origin',signal:options.signal||controller.signal});
      let data={};try{data=await response.json();}catch(error){}
      if(!response.ok){const err=new Error(data.error||'خطا در ارتباط با سرور');err.status=response.status;err.code=data.code;throw err;}
      return data;
    }catch(error){if(error.name==='AbortError')throw new Error('ارتباط با سرور طول کشید. دوباره تلاش کنید.');throw error;}
    finally{clearTimeout(timeout);}
  }
  const jsonBody=value=>JSON.stringify(value);
  function dateFa(value){if(!value)return '—';const date=new Date(String(value).includes('T')?value:`${String(value).replace(' ','T')}Z`);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('fa-IR');}
  function toast(message,type='info'){
    document.querySelector('.student-toast')?.remove();const el=document.createElement('div');el.className=`student-toast ${type==='error'?'error':''}`;el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),3600);
  }
  function loading(message='در حال بارگذاری اطلاعات...'){root.innerHTML=`<div class="student-loading"><span class="student-spinner"></span><p>${esc(message)}</p></div>`;}
  function errorPage(title,message,icon='!'){
    root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="student-error-icon">${icon}</div><span class="join-brand">YASNAFIT</span><h1>${esc(title)}</h1><p>${esc(message)}</p><div class="student-error-actions"><button class="secondary" onclick="location.reload()">تلاش دوباره</button></div><small class="join-meta">برای دریافت لینک جدید با مربی خود تماس بگیرید.</small></div></section>`;
  }
  function nav(path){
    const links=routes.map(([href,icon,label])=>`<a href="${href}" class="${path===href?'active':''}"><span>${icon}</span>${label}</a>`).join('');
    return {side:`<nav class="student-nav" aria-label="منوی شاگرد">${links}<button data-student-logout>⇥ خروج</button></nav>`,bottom:`<nav class="student-bottom-nav" aria-label="منوی موبایل">${mobileRoutes.map(([href,icon,label])=>`<a href="${href}" class="${path===href?'active':''}"><span>${icon}</span>${label}</a>`).join('')}</nav>`};
  }
  function shell(path,content){
    const navigation=nav(path),name=me?.student?.full_name||'شاگرد',passwordSuggestion=me?.password_change_recommended?'<aside class="password-recommendation"><div><b>پیشنهاد امنیتی</b><span>بهتر است رمز موقت را به یک رمز شخصی حداقل ۸ کاراکتری تغییر دهید.</span></div><a href="/student/change-password">تغییر رمز</a></aside>':'';
    root.innerHTML=`<div class="student-shell"><header class="student-header"><div class="student-brand"><div class="student-brand-mark">Y</div><div><b>YASNAFIT</b><small>پنل شخصی شما</small></div></div><div class="student-header-user"><div><b>سلام، ${esc(name)} 👋</b><small>برنامه و ارزیابی شخصی</small>${me?.student?.case_number?`<span class="portal-case-number">پرونده <b>${esc(me.student.case_number)}</b></span>`:''}</div><button data-student-logout class="student-header-logout" title="خروج" aria-label="خروج">⇥</button></div></header><div class="student-layout">${navigation.side}<section class="student-main">${passwordSuggestion}${content}</section></div>${navigation.bottom}</div>`;
    root.querySelectorAll('[data-student-logout]').forEach(button=>button.addEventListener('click',logout));
    if(window.YasnaJalali)window.YasnaJalali.autoInit();
  }
  async function logout(){
    try{await api('/api/student/logout',{method:'POST'});}catch(error){}
    location.replace('/student/logout');
  }
  function status(value){return `<span class="student-status-pill">${esc(statusLabels[value]||fa(value)||'ثبت نشده')}</span>`;}
  function photosHtml(assessment){
    const photos=assessment?.photos||[];
    if(assessment?.body_photos_preference==='declined')return '<div class="student-empty privacy-choice"><span>—</span><p>شما ترجیح داده‌اید تصاویر بدنی ارسال نکنید.</p></div>';
    if(!photos.length)return '<div class="student-empty"><span>▧</span><p>تصویر بدنی ارسال نشده است. ارسال تصاویر اختیاری است.</p></div>';
    return `<div class="student-photo-row">${photos.map(photo=>`<figure class="student-photo"><img src="/api/student-photos/${photo.id}" alt="عکس ${esc(photoLabels[photo.photo_type]||photo.photo_type)}"><span>${esc(photoLabels[photo.photo_type]||photo.photo_type)}</span></figure>`).join('')}</div>`;
  }

  function documentsHtml(documents=[]){
    if(!documents.length)return '<div class="student-empty"><p>مدرک پزشکی ارسال نشده است. این بخش اختیاری است.</p></div>';
    return `<div class="history-list">${documents.map(document=>`<article class="history-item"><a href="/api/student-documents/${document.id}" target="_blank" rel="noopener"><b>${esc(document.original_filename)}</b><small>${esc(document.document_type)} • ${Math.ceil(document.size_bytes/1024)} KB</small></a></article>`).join('')}</div>`;
  }

  function evaluatePasswordStrength(password){
    const val = String(password||'');
    if(val.length < 8) return { score: 1, label: 'ضعیف', class: 'weak' };
    let points = 1;
    if(val.length >= 10) points++;
    if(/[a-zA-Z]/.test(val) && /[0-9]/.test(val)) points++;
    if(/[^a-zA-Z0-9]/.test(val)) points++;
    if(points >= 4) return { score: 3, label: 'قوی و ایمن', class: 'strong' };
    if(points >= 2) return { score: 2, label: 'متوسط', class: 'medium' };
    return { score: 1, label: 'ضعیف', class: 'weak' };
  }

  const IRAN_PROVINCES_AND_CITIES = {
    'تهران': ['تهران', 'ری', 'شمیرانات', 'اسلامشهر', 'شهریار', 'قدس', 'ملارد', 'ورامین', 'پاکدشت', 'بهارستان', 'دماوند', 'پردیس', 'قرچک', 'رباط‌کریم', 'فیروزکوه'],
    'اصفهان': ['اصفهان', 'کاشان', 'نجف‌آباد', 'خمینی‌شهر', 'شاهین‌شهر', 'لنجان', 'فلاورجان', 'فولادشهر', 'مبارکه', 'شهرضا', 'گلپایگان', 'نائین', 'نطنز', 'خوانسار', 'اردستان', 'سمیرم'],
    'خراسان رضوی': ['مشهد', 'نیشابور', 'سبزوار', 'تربت حیدریه', 'کاشمر', 'قوچان', 'تربت جام', 'چناران', 'تایباد', 'سرخس', 'گناباد', 'فریمان', 'درگز'],
    'فارس': ['شیراز', 'مرودشت', 'کازرون', 'جهرم', 'فسا', 'لارستان', 'داراب', 'آباده', 'اقلید', 'فیروزآباد', 'نی‌ریز', 'ممسنی', 'استهبان', 'سپیدان'],
    'خوزستان': ['اهواز', 'دزفول', 'آبادان', 'ماهشهر', 'خرمشهر', 'بهبهان', 'ایذه', 'شوشتر', 'شوش', 'اندیمشک', 'مسجدسلیمان', 'رامهرمز', 'امیدیه', 'هندیجان'],
    'آذربایجان شرقی': ['تبریز', 'مراغه', 'مرند', 'میانه', 'اهر', 'بناب', 'شبستر', 'سراب', 'آذرشهر', 'اسکو', 'هریس', 'عجب‌شیر', 'جلفا', 'ملکان'],
    'مازندران': ['ساری', 'بابل', 'آمل', 'قائم‌شهر', 'بهشهر', 'بابلسر', 'تنکابن', 'نوشهر', 'چالوس', 'نکا', 'نور', 'رامسر', 'محمودآباد', 'فریدونکنار'],
    'گیلان': ['رشت', 'انزلی', 'لاهیجان', 'لنگرود', 'تالش', 'رودسر', 'فومن', 'صومعه‌سرا', 'آستارا', 'رودبار', 'املش', 'ماسال', 'شفت', 'سیاهکل'],
    'البرز': ['کرج', 'فردیس', 'ساوجبلاغ', 'نظرآباد', 'اشتهارد', 'هشتگرد', 'طالقان', 'چهارباغ'],
    'آذربایجان غربی': ['ارومیه', 'خوی', 'بوکان', 'مهاباد', 'میاندوآب', 'سلماس', 'پیرانشهر', 'نقده', 'سردشت', 'شاهین‌دژ', 'تکاب', 'ماکو'],
    'کرمان': ['کرمان', 'سیرجان', 'رفسنجان', 'جیرفت', 'بم', 'زرند', 'بافت', 'کهنوج', 'شهربابک', 'بردسیر', 'عنبرآباد', 'منوجان'],
    'هرمزگان': ['بندرعباس', 'قشم', 'کیش', 'میناب', 'بندرلنگه', 'رودان', 'بستک', 'حاجی‌آباد', 'جاسک', 'پارسیان', 'خمیر'],
    'کرمانشاه': ['کرمانشاه', 'اسلام‌آباد غرب', 'کنگاور', 'سنقر', 'هرسین', 'صحنه', 'پاوه', 'سرپل ذهاب', 'جوانرود', 'روانسر'],
    'یزد': ['یزد', 'میبد', 'اردکان', 'بافق', 'مهریز', 'ابرکوه', 'تفت', 'خاتم', 'اشکذر', 'بهاباد'],
    'مرکزی': ['اراک', 'ساوه', 'خمین', 'محلات', 'دلیجان', 'شازند', 'زرندیه', 'تفرش', 'فراهان', 'آشتیان'],
    'قم': ['قم', 'قنوات', 'سلفچگان', 'جعفریه', 'کهک', 'دستجرد'],
    'همدان': ['همدان', 'ملایر', 'نهاوند', 'تویسرکان', 'اسدآباد', 'کبودرآهنگ', 'بهار', 'رزن', 'درگزین', 'فامنین'],
    'قزوین': ['قزوین', 'تاکستان', 'الوند', 'بویین‌زهرا', 'آبیک', 'اقبالیه', 'محمدیه', 'محمودآباد نمونه'],
    'گلستان': ['گرگان', 'گنبد کاووس', 'علی‌آباد کتول', 'بندر ترکمن', 'کلاله', 'آق‌قلا', 'کردکوی', 'مینودشت', 'آزادشهر'],
    'لرستان': ['خرم‌آباد', 'بروجرد', 'دورود', 'کوهدشت', 'الیگودرز', 'نورآباد', 'ازنا', 'پلدختر', 'الشتر', 'چگنی'],
    'اردبیل': ['اردبیل', 'پارس‌آباد', 'مشگین‌شهر', 'خلخال', 'گرمی', 'بیله‌سوار', 'نمین', 'سرعین', 'کوثر', 'اصلاندوز'],
    'کردستان': ['سنندج', 'سقز', 'مریوان', 'بانه', 'قروه', 'کامیاران', 'بیجار', 'دیواندره', 'دهگلان', 'سروآباد'],
    'سمنان': ['سمنان', 'شاهرود', 'دامغان', 'گرمسار', 'مهدی‌شهر', 'ایوانکی', 'شهمیرزاد', 'آرادان', 'سرخه'],
    'سیستان و بلوچستان': ['زاهدان', 'زابل', 'چابهار', 'ایرانشهر', 'سراوان', 'خاش', 'کنارک', 'نیک‌شهر', 'دشتیاری', 'راسک'],
    'بوشهر': ['بوشهر', 'برازجان', 'کنگان', 'گناوه', 'عسلویه', 'خورموج', 'جم', 'دیر', 'دیلم', 'تنگستان'],
    'زنجان': ['زنجان', 'ابهر', 'خرمدره', 'قیدار', 'هیدج', 'صائین‌قلعه', 'ماهنشان', 'آب‌بر', 'زرین‌رود'],
    'چهارمحال و بختیاری': ['شهرکرد', 'بروجن', 'لردگان', 'فرخ‌شهر', 'فارسان', 'هفشجان', 'سامان', 'بن', 'کیار'],
    'خراسان جنوبی': ['بیرجند', 'قائنات', 'طبس', 'فردوس', 'نهبندان', 'سرایان', 'سربیشه', 'درمیان', 'بشرویه'],
    'خراسان شمالی': ['بجنورد', 'شیروان', 'اسفراین', 'آشخانه', 'جاجرم', 'گرمه', 'فاروج', 'راز و جرگلان'],
    'کهگیلویه و بویراحمد': ['یاسوج', 'دوگنبدان', 'دهدشت', 'چرام', 'سی‌سخت', 'باشت', 'لنده', 'لیکک'],
    'ایلام': ['ایلام', 'دهلران', 'ایوان', 'آبدانان', 'دره‌شهر', 'مهران', 'سرابله', 'لومار', 'ملکشاهی', 'چوار']
  };

  function loginForm({token='',studentName='',caseNumber='',initialTab='login'}={}){
    const isJoin = Boolean(token);
    let activeTab = isJoin ? 'login' : (initialTab === 'register' ? 'register' : 'login');

    const provinceOptionsHtml = Object.keys(IRAN_PROVINCES_AND_CITIES).map(prov => `<option value="${esc(prov)}">${esc(prov)}</option>`).join('');

    root.innerHTML = `
      <section class="student-auth-page">
        <div class="join-card glass-auth-card auth-split-card">
          <!-- Left Side: Pure Minimal Welcome Section -->
          <div class="auth-welcome-panel">
            <div class="auth-welcome-head">
              <div class="join-logo">Y</div>
              <div>
                <span class="join-brand">YASNAFIT</span>
              </div>
            </div>

            <div class="auth-welcome-content">
              <h2 class="auth-welcome-title">خوش آمدید!</h2>
              <p class="auth-welcome-desc">به پورتال شاگردان Yasnafit خوش آمدید.</p>
            </div>

            <div class="auth-welcome-footer"></div>
          </div>

          <!-- Right Side: Clean Form Section -->
          <div class="auth-form-panel">
            <div class="auth-form-header">
              <h1 class="auth-form-title" id="authFormTitle">${activeTab === 'login' ? (token ? 'ورود به پنل دعوت‌شده' : 'ورود') : 'ثبت‌نام'}</h1>
              ${studentName ? `<p style="margin:4px 0 0; font-size:13px; color:var(--text-primary);">سلام <strong class="student-name">${esc(studentName)}</strong> 👋</p>` : ''}
              ${caseNumber ? `<div class="created-case-number" style="margin-top:2px;"><span style="font-size:11px;color:var(--text-muted);">شماره پرونده: </span><b style="color:rgba(45,212,191,1);">${esc(caseNumber)}</b></div>` : ''}
            </div>

            <!-- TAB 1: LOGIN FORM -->
            <div id="authLoginPanel" style="${activeTab==='login'?'display:block;':'display:none;'}">
              <form class="student-auth-form" id="studentLoginForm"><div class="auth-field-group"><label for="loginMobile"><span>شماره همراه</span></label><div class="prefixed-input" dir="ltr"><span>09-</span><input id="loginMobile" name="mobile" inputmode="tel" autocomplete="username" required maxlength="10" placeholder="0000000000"></div></div>

                <div class="auth-field-group">
                  <label for="loginPassword"><span>رمز عبور</span></label>
                  <div class="password-input-wrap">
                    <input id="loginPassword" name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="رمز عبور">
                    <button type="button" class="password-toggle-btn" data-toggle-for="loginPassword" aria-label="نمایش یا مخفی کردن رمز">👁️</button>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <button type="button" class="auth-forgot-link" id="btnForgotPassword">رمز عبور را فراموش کرده‌اید؟</button>
                </div>

                <button class="btn-auth-turquoise btn-auth-submit" id="btnLoginSubmit">
                  <span>ورود</span>
                </button>

                <div class="auth-bottom-switch">
                  <span>حساب کاربری ندارید؟</span>
                  <button type="button" id="btnGoToRegister">ثبت‌نام کنید</button>
                </div>
              </form>
              ${token ? '<small class="join-meta">این لینک حداکثر سه ورود موفق را می‌پذیرد.</small>' : ''}
            </div>

            <!-- TAB 2: REGISTER FORM -->
            <div id="authRegisterPanel" style="${activeTab==='register'?'display:block;':'display:none;'}">
              <form class="student-auth-form" id="studentRegisterForm">
                <div id="registerErrorBanner" class="auth-error-banner" style="display:none;"></div>

                <div class="auth-field-group">
                  <label for="regFullName"><span>نام و نام خانوادگی *</span></label>
                  <input class="auth-input" id="regFullName" name="full_name" required minlength="2" maxlength="100" autocomplete="name" placeholder="نام و نام خانوادگی">
                </div>

                <div class="auth-field-group">
                  <label for="regMobile"><span>شماره همراه *</span></label>
                  <div class="prefixed-input" dir="ltr">
                    <span>09-</span>
                    <input id="regMobile" name="mobile" inputmode="tel" autocomplete="tel" required maxlength="10" placeholder="0000000000">
                  </div>
                </div>

                <!-- تاریخ تولد -->
                <div class="auth-field-group">
                  <label for="regDob"><span>تاریخ تولد *</span></label>
                  <input class="auth-input" id="regDob" name="date_of_birth" data-jalali required placeholder="مثلاً: ۱۳۷۵/۰۴/۱۵">
                </div>

                <!-- استان و شهر وابسته -->
                <div class="auth-grid-2">
                  <div class="auth-field-group">
                    <label for="regProvince"><span>استان *</span></label>
                    <select class="auth-input" id="regProvince" name="province" required>
                      <option value="" disabled selected>انتخاب استان...</option>
                      ${provinceOptionsHtml}
                    </select>
                  </div>
                  <div class="auth-field-group">
                    <label for="regCity"><span>شهر *</span></label>
                    <select class="auth-input" id="regCity" name="city" required disabled>
                      <option value="" disabled selected>انتخاب شهر...</option>
                    </select>
                  </div>
                </div>

                <!-- آدرس کامل محل سکونت -->
                <div class="auth-field-group">
                  <label for="regAddress"><span>آدرس کامل محل سکونت *</span></label>
                  <textarea class="auth-input" id="regAddress" name="address" required minlength="5" placeholder="آدرس پستی و محل سکونت..." style="height:56px; padding:8px 12px; resize:vertical;"></textarea>
                </div>

                <div class="auth-field-group">
                  <label for="regPassword"><span>رمز عبور * (حداقل ۸ کاراکتر)</span></label>
                  <div class="password-input-wrap">
                    <input class="auth-input" id="regPassword" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="رمز عبور">
                    <button type="button" class="password-toggle-btn" data-toggle-for="regPassword" aria-label="نمایش یا مخفی کردن رمز">👁️</button>
                  </div>
                  <div class="password-strength-wrap" id="regPasswordStrength" style="display:none;">
                    <div class="password-strength-track">
                      <div class="strength-seg" id="strengthSeg1"></div>
                      <div class="strength-seg" id="strengthSeg2"></div>
                      <div class="strength-seg" id="strengthSeg3"></div>
                    </div>
                    <div class="password-strength-text">
                      <span>قدرت رمز:</span>
                      <strong id="strengthTextLabel">ضعیف</strong>
                    </div>
                  </div>
                </div>

                <div class="auth-field-group">
                  <label for="regConfirmPassword"><span>تکرار رمز عبور *</span></label>
                  <div class="password-input-wrap">
                    <input class="auth-input" id="regConfirmPassword" name="confirm_password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="تکرار رمز عبور">
                    <button type="button" class="password-toggle-btn" data-toggle-for="regConfirmPassword" aria-label="نمایش یا مخفی کردن رمز">👁️</button>
                  </div>
                  <small id="passwordMatchHint" style="font-size:10.5px; color:var(--text-muted); display:none;"></small>
                </div>

                <!-- Optional Profile Fields -->
                <div class="auth-field-group">
                  <label for="regGoal"><span>هدف اصلی تمرین (اختیاری)</span></label>
                  <select class="auth-input" id="regGoal" name="goal">
                    <option value="فیتنس و تناسب اندام عمومی">فیتنس و تناسب اندام عمومی</option>
                    <option value="کاهش وزن و چربی‌سوزی">کاهش وزن و چربی‌سوزی</option>
                    <option value="عضله‌سازی و افزایش حجم">عضله‌سازی و افزایش حجم (هایپرتروفی)</option>
                    <option value="افزایش استقامت و توان بدنی">افزایش استقامت و توان بدنی</option>
                    <option value="اصلاح وضعیت بدنی و سلامت">اصلاح وضعیت بدنی و سلامت</option>
                    <option value="آمادگی مسابقه و سطح حرفه‌ای">آمادگی مسابقه و سطح حرفه‌ای</option>
                  </select>
                </div>

                <div class="auth-grid-2">
                  <div class="auth-field-group">
                    <label for="regGender"><span>جنسیت</span></label>
                    <select class="auth-input" id="regGender" name="gender">
                      <option value="male">آقا</option>
                      <option value="female">خانم</option>
                      <option value="unspecified">ترجیح می‌دهم نگویم</option>
                    </select>
                  </div>
                  <div class="auth-grid-2">
                    <div class="auth-field-group">
                      <label for="regHeight"><span>قد (cm)</span></label>
                      <input class="auth-input" id="regHeight" name="height" inputmode="decimal" placeholder="۱۷۵">
                    </div>
                    <div class="auth-field-group">
                      <label for="regWeight"><span>وزن (kg)</span></label>
                      <input class="auth-input" id="regWeight" name="weight" inputmode="decimal" placeholder="۷۰">
                    </div>
                  </div>
                </div>

                <label class="auth-checkbox-label">
                  <input type="checkbox" name="terms_accepted" id="regTerms" required checked>
                  <span>شرایط استفاده و حریم خصوصی سامانه ورزشی یاسنافیت را می‌پذیرم.</span>
                </label>

                <button class="btn-auth-turquoise btn-auth-submit" id="btnRegisterSubmit">
                  <span>ثبت‌نام</span>
                </button>

                <div class="auth-bottom-switch">
                  <span>قبلاً ثبت‌نام کرده‌اید؟</span>
                  <button type="button" id="btnGoToLogin">وارد شوید</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    `;

    if (window.YasnaJalali) window.YasnaJalali.autoInit();

    // Elements
    const panelLogin = root.querySelector('#authLoginPanel');
    const panelRegister = root.querySelector('#authRegisterPanel');
    const formTitle = root.querySelector('#authFormTitle');
    const goToRegBtn = root.querySelector('#btnGoToRegister');
    const goToLogBtn = root.querySelector('#btnGoToLogin');

    function switchToTab(tab) {
      activeTab = tab;
      const isLog = tab === 'login';
      panelLogin.style.display = isLog ? 'block' : 'none';
      panelRegister.style.display = !isLog ? 'block' : 'none';
      if (formTitle) formTitle.textContent = isLog ? (token ? 'ورود به پنل دعوت‌شده' : 'ورود') : 'ثبت‌نام';
    }

    if (goToRegBtn) goToRegBtn.onclick = () => switchToTab('register');
    if (goToLogBtn) goToLogBtn.onclick = () => switchToTab('login');

    // Dependent Province & City Dropdowns Binding
    const provSelect = root.querySelector('#regProvince');
    const citySelect = root.querySelector('#regCity');
    if(provSelect && citySelect){
      provSelect.addEventListener('change', () => {
        const prov = provSelect.value;
        const cities = IRAN_PROVINCES_AND_CITIES[prov] || [];
        citySelect.innerHTML = '<option value="" disabled selected>انتخاب شهر...</option>' +
          cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        citySelect.disabled = false;
        citySelect.classList.remove('anim-fade');
        void citySelect.offsetWidth; // trigger reflow
        citySelect.classList.add('anim-fade');
      });
    }

    // Password show/hide toggle
    root.querySelectorAll('.password-toggle-btn').forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.dataset.toggleFor;
        const input = root.querySelector(`#${targetId}`);
        if(input){
          const isPass = input.type === 'password';
          input.type = isPass ? 'text' : 'password';
          btn.textContent = isPass ? '🙈' : '👁️';
        }
      };
    });

    // Password strength meter binding
    const regPassInput = root.querySelector('#regPassword');
    const strengthBox = root.querySelector('#regPasswordStrength');
    const seg1 = root.querySelector('#strengthSeg1');
    const seg2 = root.querySelector('#strengthSeg2');
    const seg3 = root.querySelector('#strengthSeg3');
    const strengthLabel = root.querySelector('#strengthTextLabel');

    if(regPassInput && strengthBox){
      regPassInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if(!val){
          strengthBox.style.display = 'none';
          return;
        }
        strengthBox.style.display = 'flex';
        const str = evaluatePasswordStrength(val);
        strengthLabel.textContent = str.label;
        seg1.className = 'strength-seg ' + (str.score >= 1 ? str.class : '');
        seg2.className = 'strength-seg ' + (str.score >= 2 ? str.class : '');
        seg3.className = 'strength-seg ' + (str.score >= 3 ? str.class : '');
      });
    }

    // Confirm password live match check
    const regConfirmInput = root.querySelector('#regConfirmPassword');
    const matchHint = root.querySelector('#passwordMatchHint');
    if(regConfirmInput && regPassInput && matchHint){
      regConfirmInput.addEventListener('input', () => {
        if(!regConfirmInput.value){
          matchHint.style.display = 'none';
          return;
        }
        matchHint.style.display = 'block';
        if(regConfirmInput.value === regPassInput.value){
          matchHint.textContent = '✓ تکرار رمز عبور مطابقت دارد.';
          matchHint.style.color = 'var(--success)';
        } else {
          matchHint.textContent = '✕ رمز عبور و تکرار آن یکسان نیستند.';
          matchHint.style.color = 'var(--danger)';
        }
      });
    }

    // Forgot password info trigger
    const forgotBtn = root.querySelector('#btnForgotPassword');
    if(forgotBtn){
      forgotBtn.onclick = () => {
        alert('در صورت فراموشی رمز عبور شخصی، با مربی خود تماس بگیرید یا از رمز موقت ۴ رقمی پایان شماره همراه خود استفاده کنید.');
      };
    }

    // Login Form Submit Handler
    const loginFormEl = root.querySelector('#studentLoginForm');
    if(loginFormEl){
      loginFormEl.onsubmit = async event => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button');
        const form = new FormData(event.currentTarget);
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span>⏳</span> <span>در حال ورود امن…</span>';
        try{
          const result = await api('/api/student/auth/login', {
            method: 'POST',
            body: jsonBody({
              mobile:completeMobile(form.get('mobile')),
              password: form.get('password'),
              invitation_token: token || undefined
            })
          });
          location.replace(result.next_route);
        }catch(error){
          toast(error.message, 'error');
          button.disabled = false;
          button.innerHTML = originalText;
        }
      };
    }

    // Register Form Submit Handler
    const registerFormEl = root.querySelector('#studentRegisterForm');
    const errorBanner = root.querySelector('#registerErrorBanner');

    if(registerFormEl){
      registerFormEl.onsubmit = async event => {
        event.preventDefault();
        if(errorBanner) errorBanner.style.display = 'none';

        const form = new FormData(event.currentTarget);
        const fullName = String(form.get('full_name')||'').trim();
        const rawMobile = String(form.get('mobile')||'').trim();
        const dob = String(form.get('date_of_birth')||'').trim();
        const province = String(form.get('province')||'').trim();
        const city = String(form.get('city')||'').trim();
        const address = String(form.get('address')||'').trim();
        const password = String(form.get('password')||'');
        const confirmPassword = String(form.get('confirm_password')||'');
        const goal = String(form.get('goal')||'').trim();
        const gender = String(form.get('gender')||'unspecified');
        const height = form.get('height') ? Number(form.get('height')) : null;
        const weight = form.get('weight') ? Number(form.get('weight')) : null;
        const termsAccepted = form.get('terms_accepted') === 'on' || form.get('terms_accepted') === 'true';

        if(!province || !city){
          if(errorBanner){
            errorBanner.textContent = 'لطفاً استان و شهر محل سکونت خود را انتخاب فرمایید.';
            errorBanner.style.display = 'flex';
          }
          return;
        }

        if(!address || address.length < 5){
          if(errorBanner){
            errorBanner.textContent = 'لطفاً آدرس کامل محل سکونت را وارد نمایید.';
            errorBanner.style.display = 'flex';
          }
          return;
        }

        if(password !== confirmPassword){
          if(errorBanner){
            errorBanner.textContent = 'تکرار رمز عبور با رمز عبور وارد شده مطابقت ندارد.';
            errorBanner.style.display = 'flex';
          }
          return;
        }

        const button = event.currentTarget.querySelector('button[type="submit"]');
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span>⏳</span> <span>در حال ساخت حساب و شروع ارزیابی…</span>';

        try{
          const payload = {
            full_name: fullName,
            mobile: completeMobile(rawMobile),
            date_of_birth: dob,
            province,
            city,
            address,
            password,
            confirm_password: confirmPassword,
            goal,
            gender,
            height,
            weight,
            terms_accepted: termsAccepted
          };

          const result = await api('/api/student/auth/register', {
            method: 'POST',
            body: jsonBody(payload)
          });

          toast('ثبت‌نام با موفقیت انجام شد. هدایت به فرم ارزیابی…', 'success');
          location.replace(result.next_route || '/student/onboarding');
        }catch(error){
          if(errorBanner){
            errorBanner.textContent = error.message;
            errorBanner.style.display = 'flex';
          } else {
            toast(error.message, 'error');
          }
          button.disabled = false;
          button.innerHTML = originalText;
        }
      };
    }
  }

  async function renderLogin(){loginForm({initialTab:'login'});}
  async function renderRegister(){loginForm({initialTab:'register'});}
  async function renderJoin(){
    const token=location.pathname.match(/^\/join\/([^/]+)$/)?.[1];
    if(!token)return errorPage('لینک نامعتبر است','آدرس دعوت کامل نیست.');
    loading('در حال بررسی لینک...');
    try{const result=await api(`/api/student/join/${encodeURIComponent(token)}`);loginForm({token,studentName:result.student_name,caseNumber:result.case_number,initialTab:'login'});}
    catch(error){renderInvitationError(error);}
  }
  function renderInvitationError(error){
    const map={INVALID_INVITATION:['لینک نامعتبر است','این لینک دعوت معتبر نیست.'],EXPIRED_INVITATION:['این لینک منقضی شده است','برای دریافت لینک جدید با مربی تماس بگیرید.'],REVOKED_INVITATION:['این لینک لغو شده است','این دعوت توسط مربی لغو شده است.'],USED_INVITATION:['این دعوت قبلاً استفاده شده است','برای ورود دوباره از نشست فعال خود استفاده کنید یا از مربی لینک جدید بخواهید.']};
    const [title,message]=map[error.code]||['خطا در ورود',error.message];errorPage(title,message,'×');
  }

  async function loadMe(){
    try{me=await api('/api/student/me');return true;}
    catch(error){errorPage('جلسه شما منقضی شده است.','از صفحه ورود با شماره همراه و رمز شخصی وارد شوید.','⌛');setTimeout(()=>{const actions=document.querySelector('.student-error-actions');if(actions)actions.innerHTML='<a class="primary" href="/student/login">صفحه ورود</a>';},0);return false;}
  }
  async function renderDashboard(){
    loading();if(!await loadMe())return;
    const data=await api('/api/student/dashboard');
    if(data.onboarding_required)return location.replace('/student/onboarding');
    const program=data.program, diet=data.diet, supplement=data.supplement, assessment=data.assessment;

    shell('/student/dashboard',`
      <div class="student-page-head">
        <h1>خانه</h1>
        <p>وضعیت فعلی برنامه‌های تمرین، تغذیه، مکمل و ارزیابی شما</p>
      </div>

      <!-- ۳ برنامه اصلی شاگرد: تمرینی، غذایی، مکمل -->
      <div class="student-programs-tri-grid">
        <!-- ۱. برنامه تمرینی -->
        <article class="student-tri-card">
          <div class="student-tri-head">
            <span class="student-tri-title">🏋️ برنامه تمرینی</span>
            ${program?status(program.status):'<span class="student-status-pill">ثبت نشده</span>'}
          </div>
          ${program?`
            <div>
              <h3 style="margin:0 0 4px 0;font-size:14px;color:var(--text-primary);">${esc(program.title)}</h3>
              <small class="muted">${dateFa(program.start_date)} ← ${dateFa(program.end_date)}</small>
            </div>
            <div class="student-actions" style="margin-top:auto;">
              <a class="primary" href="/student/program" style="width:100%;text-align:center;">مشاهده برنامه تمرینی</a>
            </div>
          `:`
            <p class="muted" style="font-size:12px;margin:0;">هنوز برنامه تمرینی ثبت نشده است.</p>
            <div class="student-actions" style="margin-top:auto;">
              <a class="secondary" href="/student/program" style="width:100%;text-align:center;">مشاهده وضعیت</a>
            </div>
          `}
        </article>

        <!-- ۲. برنامه غذایی -->
        <article class="student-tri-card">
          <div class="student-tri-head">
            <span class="student-tri-title">🥗 برنامه غذایی</span>
            ${diet?status(diet.status):'<span class="student-status-pill">ثبت نشده</span>'}
          </div>
          ${diet?`
            <div>
              <h3 style="margin:0 0 4px 0;font-size:14px;color:var(--text-primary);">${esc(diet.title)}</h3>
              <small class="muted">${Number(diet.total_calories||0).toLocaleString('fa-IR')} کالری روزانه</small>
            </div>
            <div class="student-actions" style="margin-top:auto;">
              <a class="primary" href="/student/diet" style="width:100%;text-align:center;">مشاهده برنامه غذایی</a>
            </div>
          `:`
            <p class="muted" style="font-size:12px;margin:0;">هنوز برنامه غذایی ثبت نشده است.</p>
            <div class="student-actions" style="margin-top:auto;">
              <a class="secondary" href="/student/diet" style="width:100%;text-align:center;">مشاهده وضعیت</a>
            </div>
          `}
        </article>

        <!-- ۳. برنامه مکمل -->
        <article class="student-tri-card">
          <div class="student-tri-head">
            <span class="student-tri-title">💊 برنامه مکمل</span>
            ${supplement?status(supplement.status):'<span class="student-status-pill">ثبت نشده</span>'}
          </div>
          ${supplement?`
            <div>
              <h3 style="margin:0 0 4px 0;font-size:14px;color:var(--text-primary);">${esc(supplement.title)}</h3>
              <small class="muted">${esc(supplement.category_fa||supplement.category||'پکیج مکمل')}</small>
            </div>
            <div class="student-actions" style="margin-top:auto;">
              <a class="primary" href="/student/supplement" style="width:100%;text-align:center;">مشاهده برنامه مکمل</a>
            </div>
          `:`
            <p class="muted" style="font-size:12px;margin:0;">هنوز برنامه مکملی ثبت نشده است.</p>
            <div class="student-actions" style="margin-top:auto;">
              <a class="secondary" href="/student/supplement" style="width:100%;text-align:center;">مشاهده وضعیت</a>
            </div>
          `}
        </article>
      </div>

      <!-- آخرین ارزیابی و عملکرد تمرینی و اعلان‌ها -->
      <div class="student-grid" style="margin-top:13px">
        <article class="student-card">
          <h2>آخرین ارزیابی</h2>
          ${assessment?`
            <div class="student-stat">
              <span>ارزیابی ${assessment.assessment_number}</span>
              <strong>${assessment.weight??'—'} کیلوگرم</strong>
              ${status(assessment.status)}
            </div>
            ${assessment.coach_note?`<div class="coach-note">${esc(assessment.coach_note)}</div>`:''}
            <div class="student-actions"><a class="secondary" href="/student/assessment">مشاهده ارزیابی</a></div>
          `:'<div class="student-empty"><span>◫</span><p>هنوز ارزیابی ثبت نشده است.</p></div>'}
        </article>

        <article class="student-card">
          <h2>عملکرد تمرین</h2>
          <div class="student-assessment-data">
            <div><span>جلسات تکمیل‌شده</span><b>${data.performance.sessions_completed}</b></div>
            <div><span>نرخ تکمیل</span><b>${data.performance.completion_rate==null?'داده‌ای نیست':`${data.performance.completion_rate}%`}</b></div>
            <div><span>آخرین تمرین</span><b>${dateFa(data.performance.last_workout)}</b></div>
          </div>
          <div class="student-actions"><a class="secondary" href="/student/workouts">ثبت و مشاهده تمرین‌ها</a></div>
        </article>
      </div>

      <div class="student-grid" style="margin-top:13px">
        <article class="student-card" style="grid-column: 1 / -1;">
          <h2>اعلان‌ها ${data.unread_notifications?`(${data.unread_notifications})`:''}</h2>
          ${data.notifications.length?data.notifications.slice(0,3).map(item=>`<div class="notification-item"><b>${esc(item.title)}</b><small>${esc(item.body)} • ${dateFa(item.created_at)}</small></div>`).join(''):'<p class="muted">اعلان جدیدی ندارید.</p>'}
          <div class="student-actions"><a class="secondary" href="/student/notifications">همه اعلان‌ها</a></div>
        </article>
      </div>
    `);
  }
  const studentMuscleCatalog=[
    {id:'front_deltoid_anterior',label:'دلتوئید قدامی (سرشانه جلو)',side:'front',file:'front_deltoid_anterior.webp'},
    {id:'front_deltoid_lateral',label:'دلتوئید جانبی (سرشانه میانی)',side:'front',file:'front_deltoid_lateral.webp'},
    {id:'front_chest',label:'سینه (پکتورالیس)',side:'front',file:'front_chest.webp'},
    {id:'front_biceps',label:'جلو بازو (دوسر بازویی)',side:'front',file:'front_biceps.webp'},
    {id:'front_brachialis',label:'براکیالیس',side:'front',file:'front_brachialis.webp'},
    {id:'front_brachioradialis',label:'ساعد (براکیورادیالیس)',side:'front',file:'front_brachioradialis.webp'},
    {id:'front_rectus_abdominis',label:'راست شکمی (سیکس‌پک)',side:'front',file:'front_rectus_abdominis.webp'},
    {id:'front_obliques',label:'مورب شکمی (پهلو)',side:'front',file:'front_obliques.webp'},
    {id:'front_serratus_anterior',label:'دندانه‌ای قدامی',side:'front',file:'front_serratus_anterior.webp'},
    {id:'front_quadriceps',label:'چهارسر ران (جلو پا)',side:'front',file:'front_quadriceps.webp'},
    {id:'front_iliopsoas',label:'ایلیوپسواس (عضلات ران)',side:'front',file:'front_iliopsoas.webp'},
    {id:'back_trapezius',label:'کول (ذوزنقه‌ای)',side:'back',file:'back_trapezius.webp'},
    {id:'back_latissimus_dorsi',label:'زیربغل (پشتی بزرگ)',side:'back',file:'back_latissimus_dorsi.webp'},
    {id:'back_triceps',label:'پشت بازو (سه‌سر بازویی)',side:'back',file:'back_triceps.webp'},
    {id:'back_teres_major',label:'گرد بزرگ',side:'back',file:'back_teres_major.webp'},
    {id:'back_teres_minor',label:'گرد کوچک',side:'back',file:'back_teres_minor.webp'},
    {id:'back_infraspinatus',label:'تحت‌خاری',side:'back',file:'back_infraspinatus.webp'},
    {id:'back_gluteus_maximus',label:'باسن (سرینی بزرگ)',side:'back',file:'back_gluteus_maximus.webp'},
    {id:'back_hamstrings',label:'همسترینگ (پشت پا)',side:'back',file:'back_hamstrings.webp'},
    {id:'back_gastrocnemius',label:'ساق پا (دوقلو)',side:'back',file:'back_gastrocnemius.webp'},
    {id:'back_soleus',label:'نعلی ساق',side:'back',file:'back_soleus.webp'}
  ];

  function getStudentMovementMuscles(movement){
    if(movement.target_muscles&&Array.isArray(movement.target_muscles)&&movement.target_muscles.length>0){
      return movement.target_muscles;
    }
    const name=String(movement.name||'').toLowerCase();
    if(name.includes('سینه'))return ['front_chest'];
    if(name.includes('سرشانه')||name.includes('نشر')||name.includes('دلتوئید')){
      if(name.includes('خلفی')||name.includes('پشت'))return ['back_infraspinatus','back_teres_minor'];
      if(name.includes('بغل')||name.includes('جانبی'))return ['front_deltoid_lateral'];
      return ['front_deltoid_anterior','front_deltoid_lateral'];
    }
    if(name.includes('جلو بازو')||name.includes('دوسر'))return ['front_biceps'];
    if(name.includes('پشت بازو')||name.includes('سه‌سر'))return ['back_triceps'];
    if(name.includes('زیربغل')||name.includes('پشت')||name.includes('لت')||name.includes('قایقی'))return ['back_latissimus_dorsi'];
    if(name.includes('کول')||name.includes('شراگ'))return ['back_trapezius'];
    if(name.includes('شکم')||name.includes('کرانچ')||name.includes('پلانک')){
      if(name.includes('پهلو')||name.includes('مورب'))return ['front_obliques'];
      return ['front_rectus_abdominis'];
    }
    if(name.includes('پا')||name.includes('اسکوات')||name.includes('پرس پا')){
      if(name.includes('پشت پا')||name.includes('همسترینگ')||name.includes('ددلیفت'))return ['back_hamstrings'];
      if(name.includes('باسن')||name.includes('سرینی')||name.includes('هیپ'))return ['back_gluteus_maximus'];
      if(name.includes('ساق'))return ['back_gastrocnemius','back_soleus'];
      return ['front_quadriceps'];
    }
    if(name.includes('ساعد')||name.includes('مچ'))return ['front_brachioradialis'];
    return ['front_chest'];
  }

  function openStudentMovementModal(movement){
    let modal=document.getElementById('studentLearningModal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='studentLearningModal';
      modal.className='student-modal-overlay';
      document.body.appendChild(modal);
    }
    const rawVideo = (movement.video_path && movement.video_path.trim() && movement.video_path !== 'null' && movement.video_path !== 'undefined')
      ? movement.video_path
      : (movement.original_exercise_id ? `/files/exercise/videos/${movement.original_exercise_id}.mp4` : '');
    const videoSrc = rawVideo || '';
    const activeMuscleIds=getStudentMovementMuscles(movement);
    const frontOverlays=activeMuscleIds.map(id=>studentMuscleCatalog.find(m=>m.id===id&&m.side==='front')).filter(Boolean);
    const backOverlays=activeMuscleIds.map(id=>studentMuscleCatalog.find(m=>m.id===id&&m.side==='back')).filter(Boolean);
    const hasFront=frontOverlays.length>0;
    const hasBack=backOverlays.length>0;
    let showSides=[];
    if(hasFront&&!hasBack)showSides=['front'];
    else if(!hasFront&&hasBack)showSides=['back'];
    else if(hasFront&&hasBack)showSides=['front','back'];
    else showSides=['front'];

    modal.innerHTML=`
      <div class="student-modal-backdrop" id="studentModalBackdrop"></div>
      <div class="student-modal-panel" role="dialog" aria-modal="true" aria-label="آموزش حرکت">
        <header class="student-modal-head">
          <h3>🏋️ آموزش حرکت: ${esc(movement.name)}</h3>
          <button type="button" class="student-modal-close-x" id="studentModalCloseX" title="بستن">×</button>
        </header>
        <div class="student-modal-body">
          <div class="student-modal-anatomy">
            <b>عضله هدف</b>
            <div class="mv-figures ${showSides.length===1?'single-view':'dual-view'}" style="display:flex;gap:8px;justify-content:center;align-items:center;">
              ${showSides.includes('front')?`
              <figure class="mv-body-figure" style="flex:1;margin:0;display:flex;flex-direction:column;align-items:center;gap:3px;">
                <div class="muscle-container mv-body-canvas-wrap" style="position:relative;width:100%;max-width:${showSides.length===1?'160px':'125px'};height:${showSides.length===1?'225px':'185px'};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);border-radius:8px;background:rgba(5,5,5,.95);">
                  <img class="base-body mv-base-body" src="https://admin-morabiha.ir/images/common/muscles/front/front_grey_body.webp" alt="نمای جلو" style="width:100%;height:100%;object-fit:contain;display:block;position:relative;z-index:1;" loading="lazy">
                  ${frontOverlays.map(m=>`
                    <img class="muscle-overlay mv-muscle-overlay" src="https://admin-morabiha.ir/images/common/muscles/front/${m.file}" alt="${esc(m.label)}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:2;pointer-events:none;" loading="lazy">
                  `).join('')}
                </div>
                <figcaption style="text-align:center;color:var(--text-muted);font-size:8px;margin-top:3px">نمای جلو</figcaption>
              </figure>`:''}
              ${showSides.includes('back')?`
              <figure class="mv-body-figure" style="flex:1;margin:0;display:flex;flex-direction:column;align-items:center;gap:3px;">
                <div class="muscle-container mv-body-canvas-wrap" style="position:relative;width:100%;max-width:${showSides.length===1?'160px':'125px'};height:${showSides.length===1?'225px':'185px'};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);border-radius:8px;background:rgba(5,5,5,.95);">
                  <img class="base-body mv-base-body" src="https://admin-morabiha.ir/images/common/muscles/back/back_grey_body.webp" alt="نمای پشت" style="width:100%;height:100%;object-fit:contain;display:block;position:relative;z-index:1;" loading="lazy">
                  ${backOverlays.map(m=>`
                    <img class="muscle-overlay mv-muscle-overlay" src="https://admin-morabiha.ir/images/common/muscles/back/${m.file}" alt="${esc(m.label)}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:2;pointer-events:none;" loading="lazy">
                  `).join('')}
                </div>
                <figcaption style="text-align:center;color:var(--text-muted);font-size:8px;margin-top:3px">نمای پشت</figcaption>
              </figure>`:''}
            </div>
          </div>
          <div class="student-modal-video">
            <b>فیلم آموزش حرکت</b>
            <div class="mv-player ${videoSrc ? '' : 'no-video'}" style="position:relative;flex:1;min-height:185px;max-height:225px;border-radius:8px;overflow:hidden;background:var(--surface-inset);">
              ${videoSrc ? `<video controls playsinline preload="metadata" src="${esc(videoSrc)}" onerror="this.closest('.mv-player').classList.add('no-video')" style="width:100%;height:100%;min-height:185px;max-height:225px;object-fit:contain;display:block;"></video>` : ''}
              <div class="mv-video-placeholder" style="position:absolute;inset:0;display:${videoSrc ? 'none' : 'flex'};flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--text-muted);background:var(--surface-inset);">
                <span style="width:44px;height:44px;display:grid;place-items:center;border:2px solid var(--accent);border-radius:50%;color:var(--accent);font-size:16px;">▶</span>
                <small style="font-size:8px;">ویدیو برای این حرکت ثبت نشده است</small>
              </div>
            </div>
          </div>
        </div>
        <footer class="student-modal-foot">
          <button type="button" class="secondary" id="studentModalCloseBtn" style="min-height:36px;padding:5px 14px;font-size:10px;">بستن</button>
        </footer>
      </div>
    `;
    modal.hidden=false;
    const close=()=>{modal.hidden=true;};
    document.getElementById('studentModalCloseX').onclick=close;
    document.getElementById('studentModalCloseBtn').onclick=close;
    document.getElementById('studentModalBackdrop').onclick=close;
  }

  async function renderProgram(){
    loading();if(!await loadMe())return;const {program}=await api('/api/student/program');
    if(!program)return shell('/student/program',`<div class="student-page-head"><h1>برنامه من</h1></div><div class="student-empty"><span>▤</span><h2>هنوز برنامه فعالی برای شما ثبت نشده است.</h2><p>برنامه‌های پیش‌نویس در پنل شما نمایش داده نمی‌شوند.</p></div>`);
    const days=program.program_data?.days||[];
    const body=days.map(day=>`<article class="program-day"><header><h2>روز ${day.day_number} — ${esc(day.focus||'تمرین')}</h2><span>${day.is_rest_day?'روز استراحت':`${day.systems?.length||0} سیستم`}</span>${day.is_rest_day?'':`<button class="primary" data-start-day="${esc(day.day_ref)}">شروع تمرین</button>`}</header>${day.coach_note?`<div class="coach-note">${esc(day.coach_note)}</div>`:''}${day.is_rest_day?'<div class="student-empty"><p>استراحت، ریکاوری و تغذیه مناسب</p></div>':(day.systems||[]).map(system=>`<section class="program-system"><header>سیستم ${esc(fa(system.system_type||'normal'))}</header>${(system.movements||[]).map((movement,mIdx)=>{const studentImgSrc=(movement.image_path&&movement.image_path.trim())?movement.image_path:(movement.original_exercise_id?`/api/exercise-image/${movement.original_exercise_id}`:'/blank-white.svg');return `<article class="student-movement" data-view-mov="${day.day_number}-${system.exercise_system_id||1}-${mIdx}" title="برای مشاهده ویدیو و عضله هدف کلیک کنید"><div class="student-movement-image"><img src="${esc(studentImgSrc)}" alt="${esc(movement.name)}" onerror="this.onerror=null; this.src='/blank-white.svg';" loading="lazy"></div><div class="student-movement-content"><div class="student-mov-head"><span class="student-mov-title">نام حرکت: <b>${esc(movement.name)}</b></span><span class="student-system-pill">سیستم ${esc(fa(system.system_type||'normal'))}</span></div>${movement.description?`<p class="student-mov-desc">${esc(movement.description)}</p>`:''}<div class="student-mov-spacer"></div><div class="student-set-boxes">${(movement.sets||[]).map((set,index)=>{let unitLabel='تکرار';if(set.type==='TIME')unitLabel='ثانیه';else if(set.type==='MINUTE')unitLabel='دقیقه';else if(set.type==='DROPSET')unitLabel='دراپ';else if(set.type==='FAILURE')unitLabel='توان';const val=set.type==='FAILURE'?'MAX':(set.count??'—');return `<div class="student-set-sq" title="ست ${(index+1).toLocaleString('fa-IR')}: ${esc(String(set.count??''))} ${unitLabel}"><span class="student-set-val">${esc(String(val))}</span><span class="student-set-unit">${unitLabel}</span></div>`;}).join('')}</div></div></article>`;}).join('')}</section>`).join('')}</article>`).join('');
    shell('/student/program',`<div class="student-page-head"><h1>برنامه من</h1><p>برنامه فقط‌خواندنی اختصاص داده‌شده توسط مربی • برای مشاهده ویدیو و عضله هدف روی هر حرکت بزنید</p></div><article class="student-card"><div class="student-program-head"><div><h2>${esc(program.title)}</h2><span class="student-program-dates">${dateFa(program.start_date)} ← ${dateFa(program.end_date)}</span></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><button type="button" class="secondary small" id="btnStudentProgramPDF" style="display:inline-flex;align-items:center;gap:5px;font-weight:750;">📄 دریافت PDF و چاپ</button>${status(program.status)}</div></div>${program.coach_note?`<div class="coach-note"><b>یادداشت مربی</b><br>${esc(program.coach_note)}</div>`:''}</article>${body}`);
    const btnPdf = document.getElementById('btnStudentProgramPDF');
    if(btnPdf){
      btnPdf.onclick = () => {
        if (window.openProgramPDF) {
          window.openProgramPDF(program);
        }
      };
    }
    document.querySelectorAll('[data-start-day]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const {workout}=await api('/api/student/workouts',{method:'POST',body:jsonBody({day_ref:button.dataset.startDay})});location.href=`/student/workouts?session=${encodeURIComponent(workout.stable_id)}`}catch(error){toast(error.message,'error');button.disabled=false}});
    document.querySelectorAll('[data-view-mov]').forEach(card=>{
      card.onclick=()=>{
        const [dayNum,sysId,mIdx]=card.dataset.viewMov.split('-').map(Number);
        const day=days.find(d=>d.day_number===dayNum);
        if(!day)return;
        const sys=(day.systems||[]).find(s=>(s.exercise_system_id||1)===sysId)||day.systems?.[0];
        if(!sys)return;
        const mov=sys.movements?.[mIdx];
        if(!mov)return;
        openStudentMovementModal(mov);
      };
    });
  }

  async function renderDietProgram(){
    loading();if(!await loadMe())return;
    const {program}=await api('/api/student/diet');
    if(!program)return shell('/student/diet',`<div class="student-page-head"><h1>برنامه غذایی من</h1></div><div class="student-empty"><span>🥗</span><h2>هنوز برنامه غذایی فعالی برای شما ثبت نشده است.</h2><p>پس از بررسی و تنظیم توسط مربی، برنامه تغذیه شما در این بخش قرار می‌گیرد.</p></div>`);

    const meals=program.meals||[];
    const mealsHtml=meals.map((meal,idx)=>`
      <div class="student-meal-box">
        <div class="student-meal-head">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">🍽️</span>
            <strong style="font-size:14px;color:var(--text-primary);">${idx+1}. ${esc(meal.meal_name)}</strong>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${meal.start_time?`<span class="student-status-pill" style="font-size:11px;">⏱️ ${esc(meal.start_time)}${meal.end_time?' تا '+esc(meal.end_time):''}</span>`:''}
            <span class="student-status-pill" style="background:var(--accent-surface);border-color:var(--accent-border);color:var(--accent-hover);font-weight:750;">🔥 ${Number(meal.calories||0).toLocaleString('fa-IR')} کالری</span>
          </div>
        </div>
        ${meal.notes?`<p style="margin:4px 0 0 0;font-size:12px;color:var(--text-secondary);line-height:1.7;">${esc(meal.notes)}</p>`:''}
      </div>
    `).join('');

    shell('/student/diet',`
      <div class="student-page-head">
        <h1>برنامه غذایی من</h1>
        <p>برنامه تغذیه و زمان‌بندی وعده‌ها اختصاص داده‌شده توسط مربی</p>
      </div>
      <article class="student-card">
        <div class="student-program-head">
          <div>
            <h2>${esc(program.title)}</h2>
            <span class="student-program-dates">محدودیت غذایی: <b>${esc(program.diet_restriction_fa||program.diet_restriction||'بدون محدودیت')}</b> • کل کالری: <b>${Number(program.total_calories||0).toLocaleString('fa-IR')} kcal</b></span>
          </div>
          ${status(program.status)}
        </div>
        ${program.description?`<div class="coach-note"><b>توضیحات و راهنمای مربی</b><br>${esc(program.description)}</div>`:''}
      </article>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${mealsHtml||'<div class="student-empty"><p>وعده‌ای برای این برنامه ثبت نشده است.</p></div>'}
      </div>
    `);
  }

  async function renderSupplementProgram(){
    loading();if(!await loadMe())return;
    const {program}=await api('/api/student/supplement');
    if(!program)return shell('/student/supplement',`<div class="student-page-head"><h1>برنامه مکمل من</h1></div><div class="student-empty"><span>💊</span><h2>هنوز برنامه مکمل فعالی برای شما ثبت نشده است.</h2><p>پس از بررسی و تنظیم توسط مربی، برنامه مکمل‌های شما در این بخش قرار می‌گیرد.</p></div>`);

    const items=program.items||[];
    const itemsHtml=items.map((item,idx)=>`
      <div class="student-supp-item-box">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:38px;height:38px;border-radius:8px;background:var(--accent-surface);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${esc(item.icon||'💊')}</div>
          <div>
            <strong style="font-size:14px;color:var(--text-primary);display:block;">${idx+1}. ${esc(item.supplement_name)}</strong>
            ${item.notes?`<small style="font-size:11px;color:var(--text-secondary);display:block;margin-top:2px;">✏️ ${esc(item.notes)}</small>`:''}
          </div>
        </div>
        <span class="student-status-pill" style="background:var(--accent-surface);border-color:var(--accent-border);color:var(--accent-hover);font-weight:750;">⏱️ ${esc(item.timing)}</span>
      </div>
    `).join('');

    shell('/student/supplement',`
      <div class="student-page-head">
        <h1>برنامه مکمل من</h1>
        <p>دستور مصرف و زمان‌بندی مکمل‌های ورزشی و تغذیه‌ای</p>
      </div>
      <article class="student-card">
        <div class="student-program-head">
          <div>
            <h2>${esc(program.title)}</h2>
            <span class="student-program-dates">دسته‌بندی: <b>${esc(program.category_fa||program.category||'عمومی')}</b> • تعداد: <b>${fa(items.length)} مکمل</b></span>
          </div>
          ${status(program.status)}
        </div>
        ${program.description?`<div class="coach-note"><b>توضیحات و پروتکل مصرف آب مربی</b><br>${esc(program.description)}</div>`:''}
      </article>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${itemsHtml||'<div class="student-empty"><p>مکملی در این برنامه ثبت نشده است.</p></div>'}
      </div>
    `);
  }
  async function renderAssessment(){
    loading();if(!await loadMe())return;const {assessment,details}=await api('/api/student/assessment');
    if(!assessment)return shell('/student/assessment',`<div class="student-page-head"><h1>ارزیابی من</h1></div><div class="student-empty"><span>◫</span><h2>هنوز ارزیابی ثبت نشده است.</h2></div>`);
    const structured=details?`<div class="student-card" style="margin-top:13px"><h2>جزئیات پرونده</h2><div class="student-assessment-data"><div><span>نوع ارزیابی</span><b>${esc(fa(assessment.assessment_type))}</b></div><div><span>اهداف</span><b>${esc((details.goals||[]).map(fa).join('، ')||'—')}</b></div><div><span>فعالیت روزانه</span><b>${esc(fa(details.sports?.average_daily_activity))}</b></div><div><span>نوع رژیم</span><b>${esc(fa(details.nutrition?.diet_type))}</b></div><div><span>سوابق پزشکی</span><b>${details.medical?'ثبت شده':'—'}</b></div><div><span>عادات شخصی</span><b>${details.habits?'ثبت شده':'—'}</b></div></div></div>`:'';
    shell('/student/assessment',`<div class="student-page-head"><h1>ارزیابی من</h1><p>آخرین ارزیابی ارسال‌شده و تغییرناپذیر</p></div><article class="student-card"><div class="student-program-head"><div><h2>ارزیابی ${assessment.assessment_number}</h2><span class="student-program-dates">${dateFa(assessment.submitted_at)}</span></div>${status(assessment.status)}</div><div class="student-assessment-data"><div><span>وزن</span><b>${assessment.weight??'—'} kg</b></div><div><span>قد</span><b>${assessment.height??'—'} cm</b></div><div><span>هدف</span><b>${esc(faList(assessment.goal))}</b></div><div><span>محدودیت‌ها</span><b>${esc(assessment.limitations||'—')}</b></div><div><span>یادداشت شما</span><b>${esc(assessment.student_note||'—')}</b></div><div><span>بازخورد مربی</span><b>${esc(assessment.coach_note||'—')}</b></div></div>${photosHtml(assessment)}<h2 style="margin-top:16px">مدارک پزشکی و آنالیز</h2>${documentsHtml(assessment.documents)}</article>${structured}`);
  }
  async function renderHistory(){
    loading();if(!await loadMe())return;const data=await api('/api/student/history');
    shell('/student/history',`<div class="student-page-head"><h1>تاریخچه</h1><p>تمام ارزیابی‌ها و برنامه‌های ماهانه شما</p></div><section class="student-card history-section"><h2>تاریخچه ارزیابی‌ها</h2><div class="history-list">${data.assessments.length?data.assessments.slice().reverse().map(item=>`<article class="history-item"><div><b>ارزیابی ${item.assessment_number}</b><small>${dateFa(item.submitted_at)} • ${item.weight??'—'} kg</small></div>${status(item.status)}</article>`).join(''):'<div class="student-empty"><p>هنوز ارزیابی ثبت نشده است.</p></div>'}</div></section><section class="student-card history-section"><h2>تاریخچه برنامه‌ها</h2><div class="history-list">${data.programs.length?data.programs.slice().reverse().map(item=>`<article class="history-item"><div><b>${esc(item.title)}</b><small>${dateFa(item.start_date)} ← ${dateFa(item.end_date)}</small></div>${status(item.status)}</article>`).join(''):'<div class="student-empty"><p>هنوز برنامه‌ای ثبت نشده است.</p></div>'}</div></section>`);
  }
  async function renderProfile(){
    loading();if(!await loadMe())return;const {student}=await api('/api/student/profile');
    shell('/student/profile',`<div class="student-page-head"><h1>پروفایل من</h1><p>ویرایش این اطلاعات، ارزیابی‌های تاریخی را تغییر نمی‌دهد.</p></div><form class="student-card" id="profileForm"><div class="student-profile-grid"><label>نام و نام خانوادگی<input name="full_name" required maxlength="100" value="${esc(student.full_name)}"></label><label>موبایل<input name="mobile" maxlength="20" value="${esc(student.mobile)}"></label><label>تاریخ تولد<input type="text" name="date_of_birth" data-jalali placeholder="مثلاً ۱۳۷۵/۰۴/۱۵" value="${esc(student.date_of_birth||'')}"></label><label>جنسیت<select name="gender"><option value="unspecified">ترجیح می‌دهم نگویم</option><option value="female" ${student.gender==='female'?'selected':''}>خانم</option><option value="male" ${student.gender==='male'?'selected':''}>آقا</option></select></label><label>محل تمرین<select name="preferred_location"><option value="gym" ${student.preferred_location==='gym'?'selected':''}>باشگاه</option><option value="home" ${student.preferred_location==='home'?'selected':''}>منزل</option></select></label><label class="wide">هدف تمرینی<textarea name="goal" maxlength="4000">${esc(student.goal)}</textarea></label><label class="wide">محدودیت‌ها<textarea name="limitations" maxlength="4000">${esc(student.limitations)}</textarea></label><label class="wide">آسیب‌ها<textarea name="injuries" maxlength="4000">${esc(student.injuries)}</textarea></label></div><div class="student-actions"><button class="primary">ذخیره پروفایل</button></div></form><section class="student-card" style="margin-top:10px"><h2>امنیت حساب</h2><p>رمز شخصی خود را در هر زمان می‌توانید تغییر دهید.</p><div class="student-actions"><a class="secondary" href="/student/change-password">تغییر رمز عبور</a></div></section>`);
    document.querySelector('#profileForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{await api('/api/student/profile',{method:'PUT',body:jsonBody(Object.fromEntries(new FormData(event.currentTarget)))});toast('پروفایل ذخیره شد.');}catch(error){toast(error.message,'error');}finally{button.disabled=false;}};
  }

  async function renderWorkouts(){
    loading();if(!await loadMe())return;const sessionRef=new URLSearchParams(location.search).get('session');
    if(!sessionRef){const data=await api('/api/student/workouts');return shell('/student/workouts',`<div class="student-page-head"><h1>ثبت تمرین</h1><p>نتایج واقعی جدا از برنامه تجویزی ذخیره می‌شوند.</p></div><article class="student-card"><div class="student-assessment-data"><div><span>کل جلسات</span><b>${data.performance.sessions_total}</b></div><div><span>تکمیل‌شده</span><b>${data.performance.sessions_completed}</b></div><div><span>نرخ تکمیل</span><b>${data.performance.completion_rate==null?'—':`${data.performance.completion_rate}%`}</b></div></div></article><div class="history-list" style="margin-top:13px">${data.workouts.length?data.workouts.map(item=>`<article class="history-item"><div><b>${esc(item.program_title)} • روز ${item.day_number}</b><small>${dateFa(item.started_at)} • ${item.completed_sets} ست ثبت‌شده</small></div>${status(item.status)}</article>`).join(''):'<div class="student-empty"><p>هنوز جلسه تمرینی ثبت نشده است. از صفحه برنامه یک روز را شروع کنید.</p></div>'}</div>`);}
    const [{workout},{program}]=await Promise.all([api(`/api/student/workouts/${encodeURIComponent(sessionRef)}`),api('/api/student/program')]);if(!workout||!program)return errorPage('جلسه پیدا نشد','جلسه یا برنامه فعال در دسترس نیست.');const day=(program.program_data?.days||[]).find(item=>item.day_number===workout.day_number),existing=new Map((workout.results||[]).map(item=>[item.set_ref,item]));const rows=(day?.systems||[]).flatMap(system=>(system.movements||[]).flatMap(movement=>(movement.sets||[]).map((set,index)=>{const saved=existing.get(set.set_ref)||{};return `<article class="workout-set-row" data-set-ref="${esc(set.set_ref)}"><div><b>${esc(movement.name)} — ست ${index+1}</b><small>تجویزی: ${esc(set.count??'—')} تکرار • ${esc(set.weight??'—')} کیلو</small></div><input data-result="reps" placeholder="تکرار واقعی" value="${esc(saved.actual_repetitions||'')}"><input data-result="weight" inputmode="decimal" placeholder="وزن واقعی" value="${esc(saved.actual_weight??'')}"><input data-result="duration" inputmode="numeric" placeholder="زمان (ثانیه)" value="${esc(saved.actual_duration_seconds??'')}"><select data-result="status"><option value="COMPLETED" ${saved.status==='COMPLETED'?'selected':''}>انجام شد</option><option value="SKIPPED" ${saved.status==='SKIPPED'?'selected':''}>رد شد</option></select></article>`}))).join('');shell('/student/workouts',`<div class="student-page-head"><h1>${esc(workout.program_title)} — روز ${workout.day_number}</h1><p>مقادیر واقعی اجرا را ثبت کنید؛ برنامه تجویزی تغییر نمی‌کند.</p></div><div class="workout-results">${rows||'<div class="student-empty">ستی برای ثبت وجود ندارد.</div>'}</div><div class="student-actions"><button class="secondary" id="saveWorkout">ذخیره نتایج</button><button class="primary" id="completeWorkout">تکمیل جلسه</button></div>`);const collect=()=>[...document.querySelectorAll('[data-set-ref]')].map(row=>({set_ref:row.dataset.setRef,actual_repetitions:row.querySelector('[data-result="reps"]').value,actual_weight:row.querySelector('[data-result="weight"]').value||null,actual_duration_seconds:row.querySelector('[data-result="duration"]').value?Number(row.querySelector('[data-result="duration"]').value):null,status:row.querySelector('[data-result="status"]').value,notes:''}));document.querySelector('#saveWorkout').onclick=()=>api(`/api/student/workouts/${encodeURIComponent(sessionRef)}/results`,{method:'PUT',body:jsonBody({results:collect()})}).then(()=>toast('نتایج ذخیره شد.')).catch(error=>toast(error.message,'error'));document.querySelector('#completeWorkout').onclick=async()=>{try{await api(`/api/student/workouts/${encodeURIComponent(sessionRef)}/results`,{method:'PUT',body:jsonBody({results:collect()})});await api(`/api/student/workouts/${encodeURIComponent(sessionRef)}/complete`,{method:'POST',body:jsonBody({status:'COMPLETED'})});location.href='/student/workouts'}catch(error){toast(error.message,'error')}};
  }
  async function renderMessages(){loading();if(!await loadMe())return;const data=await api('/api/student/messages');shell('/student/messages',`<div class="student-page-head"><h1>پیام‌ها</h1><p>گفت‌وگوی خصوصی با مربی</p></div><section class="student-card"><div class="message-list" id="messageList">${data.messages.length?data.messages.map(message=>`<article class="message ${message.sender_type}"><b>${message.sender_type==='coach'?'مربی':'شما'}</b><p>${esc(message.body)}</p><small>${dateFa(message.created_at)}</small></article>`).join(''):'<div class="student-empty"><p>هنوز پیامی ثبت نشده است.</p></div>'}</div><form class="message-form" id="messageForm"><textarea name="body" required maxlength="2000" placeholder="پیام شما..."></textarea><button class="primary">ارسال</button></form></section>`);document.querySelector('#messageForm').onsubmit=async event=>{event.preventDefault();const body=new FormData(event.currentTarget).get('body');try{await api('/api/student/messages',{method:'POST',body:jsonBody({body})});renderMessages()}catch(error){toast(error.message,'error')}};}
  async function renderNotifications(){loading();if(!await loadMe())return;const data=await api('/api/student/notifications');shell('/student/notifications',`<div class="student-page-head"><h1>اعلان‌ها</h1></div><div class="history-list">${data.notifications.length?data.notifications.map(item=>`<article class="history-item notification-item ${item.read_at?'read':''}" data-notification="${esc(item.stable_id)}"><div><b>${esc(item.title)}</b><small>${esc(item.body)} • ${dateFa(item.created_at)}</small></div>${item.read_at?'':'<button class="secondary">خواندم</button>'}</article>`).join(''):'<div class="student-empty"><p>اعلانی ندارید.</p></div>'}</div>`);document.querySelectorAll('[data-notification] button').forEach(button=>button.onclick=async()=>{await api(`/api/student/notifications/${button.closest('[data-notification]').dataset.notification}/read`,{method:'POST'});button.closest('[data-notification]').classList.add('read');button.remove()});}
  async function renderOnboarding(){
    loading();if(!await loadMe())return;
    if(!window.YasnafitAssessmentWizard)return errorPage('خطا در بارگذاری فرم','ماژول ارزیابی در دسترس نیست.');
    return window.YasnafitAssessmentWizard.mount({root,api,me,toast,renderSuccess});
  }
  async function renderChangePassword(){
    loading();if(!await loadMe())return;
    const form=`<form class="student-auth-form" id="passwordChangeForm"><label>رمز فعلی<input name="current_password" type="password" autocomplete="current-password" required maxlength="128"></label><label>رمز جدید<input name="new_password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" placeholder="حداقل ۸ کاراکتر؛ هر ترکیبی قابل قبول است"></label><label>تکرار رمز جدید<input name="confirm_password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><p class="password-help">رمز جدید فقط باید حداقل ۸ کاراکتر باشد.</p><button class="primary">ثبت رمز جدید</button></form>`;
    shell('/student/profile',`<div class="student-page-head"><h1>تغییر رمز عبور</h1><p>این کار اختیاری است و هر زمان بخواهید می‌توانید انجام دهید.</p></div><section class="student-card password-change-card">${form}</section>`);
    document.querySelector('#passwordChangeForm').onsubmit=async event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget)),button=event.currentTarget.querySelector('button');button.disabled=true;try{const result=await api('/api/student/auth/change-password',{method:'POST',body:jsonBody(body)});toast('رمز شخصی با موفقیت ثبت شد.');location.replace(result.next_route);}catch(error){toast(error.message,'error');button.disabled=false;}};
  }
  function renderSuccess(){root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="student-success-icon">✓</div><span class="join-brand">YASNAFIT</span><h1>اطلاعات شما با موفقیت ارسال شد</h1><p>متشکریم. اطلاعات و تصاویر شما برای مربی ارسال شد.</p><p>پس از بررسی مربی، برنامه تمرینی شما در پنل شخصی‌تان قرار خواهد گرفت.</p><a class="primary" href="/student/dashboard">ورود به پنل شخصی</a></div></section>`;}
  async function renderLogout(){
    try{await api('/api/student/logout',{method:'POST'});}catch(error){}
    root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="student-success-icon">✓</div><h1>با موفقیت خارج شدید</h1><p>نشست شما بسته شد. برای ورود دوباره از شماره همراه و رمز شخصی استفاده کنید.</p><a class="primary" href="/student/login">ورود دوباره</a></div></section>`;
  }
  async function start(){
    const path=location.pathname;
    if(path.startsWith('/join/'))return renderJoin();
    if(path==='/student/login')return renderLogin();
    if(path==='/student/register')return renderRegister();
    if(path==='/student/logout')return renderLogout();
    const pages={
      '/student/register':renderRegister,
      '/student/change-password':renderChangePassword,
      '/student/onboarding':renderOnboarding,
      '/document/edit-document':renderOnboarding,
      '/student/dashboard':renderDashboard,
      '/student/program':renderProgram,
      '/student/diet':renderDietProgram,
      '/student/supplement':renderSupplementProgram,
      '/student/workouts':renderWorkouts,
      '/student/messages':renderMessages,
      '/student/notifications':renderNotifications,
      '/student/assessment':renderAssessment,
      '/student/history':renderHistory,
      '/student/profile':renderProfile
    };
    return (pages[path]||(()=>errorPage('صفحه پیدا نشد','مسیر درخواستی وجود ندارد.')))();
  }
  start().catch(error=>{console.error(error);errorPage('خطای غیرمنتظره','لطفاً دوباره تلاش کنید.');});
})();
