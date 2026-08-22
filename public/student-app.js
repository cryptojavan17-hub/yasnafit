(() => {
  const root=document.querySelector('#studentApp');
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const statusLabels={PROFILE_INCOMPLETE:'در حال تکمیل',ASSESSMENT_PENDING:'در حال تکمیل',SUBMITTED:'در انتظار بررسی',UNDER_REVIEW:'در حال بررسی',CHANGES_REQUESTED:'نیاز به اصلاح',APPROVED:'تأیید شده',PROGRAM_ASSIGNED:'برنامه اختصاص داده شد',ACTIVE:'فعال',COMPLETED:'تکمیل‌شده',ARCHIVED:'آرشیو',DRAFT:'پیش‌نویس'};
  const photoLabels={front:'جلو',side:'بغل',back:'پشت',front_flex:'جلو با فیگور بازو',back_flex:'پشت با فیگور بازو'};
  const routes=[['/student/dashboard','⌂','خانه'],['/student/program','▤','برنامه من'],['/student/assessment','◫','ارزیابی من'],['/student/profile','○','پروفایل من'],['/student/history','◷','تاریخچه']];
  let me=null;

  async function api(url,options={}){
    const headers={Accept:'application/json',...(options.body && !(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    const response=await fetch(url,{...options,headers,credentials:'same-origin'});
    let data={};try{data=await response.json();}catch(error){}
    if(!response.ok){const err=new Error(data.error||'خطا در ارتباط با سرور');err.status=response.status;err.code=data.code;throw err;}
    return data;
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
    return {side:`<nav class="student-nav" aria-label="منوی دانش‌آموز">${links}<button data-student-logout>⇥ خروج</button></nav>`,bottom:`<nav class="student-bottom-nav" aria-label="منوی موبایل">${routes.map(([href,icon,label])=>`<a href="${href}" class="${path===href?'active':''}"><span>${icon}</span>${label}</a>`).join('')}</nav>`};
  }
  function shell(path,content){
    const navigation=nav(path),name=me?.student?.full_name||'دانش‌آموز';
    root.innerHTML=`<div class="student-shell"><header class="student-header"><div class="student-brand"><div class="student-brand-mark">Y</div><div><b>YASNAFIT</b><small>پنل شخصی شما</small></div></div><div class="student-header-user"><div><b>سلام، ${esc(name)} 👋</b><small>برنامه و ارزیابی شخصی</small></div><button data-student-logout class="student-header-logout" title="خروج" aria-label="خروج">⇥</button></div></header><div class="student-layout">${navigation.side}<section class="student-main">${content}</section></div>${navigation.bottom}</div>`;
    root.querySelectorAll('[data-student-logout]').forEach(button=>button.addEventListener('click',logout));
  }
  async function logout(){
    try{await api('/api/student/logout',{method:'POST'});}catch(error){}
    location.replace('/student/logout');
  }
  function status(value){return `<span class="student-status-pill">${esc(statusLabels[value]||value||'ثبت نشده')}</span>`;}
  function photosHtml(assessment){
    const photos=assessment?.photos||[];
    if(assessment?.body_photos_preference==='declined')return '<div class="student-empty privacy-choice"><span>—</span><p>شما ترجیح داده‌اید تصاویر بدنی ارسال نکنید.</p></div>';
    if(!photos.length)return '<div class="student-empty"><span>▧</span><p>تصویر بدنی ارسال نشده است. ارسال تصاویر اختیاری است.</p></div>';
    return `<div class="student-photo-row">${photos.map(photo=>`<figure class="student-photo"><img src="/api/student-photos/${photo.id}" alt="عکس ${esc(photoLabels[photo.photo_type]||photo.photo_type)}"><span>${esc(photoLabels[photo.photo_type]||photo.photo_type)}</span></figure>`).join('')}</div>`;
  }

  async function renderJoin(){
    const token=location.pathname.match(/^\/join\/([^/]+)$/)?.[1];
    if(!token)return errorPage('لینک نامعتبر است','آدرس دعوت کامل نیست.');
    loading('در حال بررسی لینک...');
    try{
      const result=await api(`/api/student/join/${encodeURIComponent(token)}`);
      root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="join-logo">Y</div><span class="join-brand">YASNAFIT</span><h1>دعوت به پنل شخصی شما</h1><p>سلام <span class="student-name">${esc(result.student_name||'')}</span> 👋</p><p>مربی شما یک پنل اختصاصی در Yasnafit برایتان ایجاد کرده است.</p><button class="primary" id="acceptInvitation">شروع</button><small class="join-meta">اطلاعات و تصاویر شما خصوصی و فقط در اختیار خودتان و مربی است.</small></div></section>`;
      document.querySelector('#acceptInvitation').onclick=async event=>{
        event.currentTarget.disabled=true;event.currentTarget.textContent='در حال ساخت پنل امن...';
        try{const accepted=await api(`/api/student/join/${encodeURIComponent(token)}/accept`,{method:'POST'});location.replace(accepted.next_route);}
        catch(error){renderInvitationError(error);}
      };
    }catch(error){renderInvitationError(error);}
  }
  function renderInvitationError(error){
    const map={INVALID_INVITATION:['لینک نامعتبر است','این لینک دعوت معتبر نیست.'],EXPIRED_INVITATION:['این لینک منقضی شده است','برای دریافت لینک جدید با مربی تماس بگیرید.'],REVOKED_INVITATION:['این لینک لغو شده است','این دعوت توسط مربی لغو شده است.'],USED_INVITATION:['این دعوت قبلاً استفاده شده است','برای ورود دوباره از نشست فعال خود استفاده کنید یا از مربی لینک جدید بخواهید.']};
    const [title,message]=map[error.code]||['خطا در ورود',error.message];errorPage(title,message,'×');
  }

  async function loadMe(){
    try{me=await api('/api/student/me');return true;}
    catch(error){errorPage('جلسه شما منقضی شده است.','برای ورود امن، از مربی خود یک لینک جدید دریافت کنید.','⌛');return false;}
  }
  async function renderDashboard(){
    loading();if(!await loadMe())return;
    const data=await api('/api/student/dashboard');
    if(data.onboarding_required)return location.replace('/student/onboarding');
    const program=data.program,assessment=data.assessment;
    shell('/student/dashboard',`<div class="student-page-head"><h1>خانه</h1><p>وضعیت فعلی برنامه و ارزیابی شما</p></div><div class="student-grid"><article class="student-card"><h2>برنامه فعلی</h2>${program?`<div class="student-program-head"><div><h2>${esc(program.title)}</h2><span class="student-program-dates">${dateFa(program.start_date)} ← ${dateFa(program.end_date)}</span></div>${status(program.status)}</div>${program.coach_note?`<div class="coach-note"><b>یادداشت مربی</b><br>${esc(program.coach_note)}</div>`:''}<div class="student-actions"><a class="primary" href="/student/program">مشاهده برنامه</a></div>`:'<div class="student-empty"><span>▤</span><h2>هنوز برنامه فعالی برای شما ثبت نشده است.</h2><p>پس از بررسی مربی، برنامه در این بخش نمایش داده می‌شود.</p></div>'}</article><article class="student-card"><h2>آخرین ارزیابی</h2>${assessment?`<div class="student-stat"><span>ارزیابی ${assessment.assessment_number}</span><strong>${assessment.weight??'—'} کیلوگرم</strong>${status(assessment.status)}</div>${assessment.coach_note?`<div class="coach-note">${esc(assessment.coach_note)}</div>`:''}<div class="student-actions"><a class="secondary" href="/student/assessment">مشاهده ارزیابی</a></div>`:'<div class="student-empty"><span>◫</span><p>هنوز ارزیابی ثبت نشده است.</p></div>'}</article></div>`);
  }
  async function renderProgram(){
    loading();if(!await loadMe())return;const {program}=await api('/api/student/program');
    if(!program)return shell('/student/program',`<div class="student-page-head"><h1>برنامه من</h1></div><div class="student-empty"><span>▤</span><h2>هنوز برنامه فعالی برای شما ثبت نشده است.</h2><p>برنامه‌های پیش‌نویس در پنل شما نمایش داده نمی‌شوند.</p></div>`);
    const days=program.program_data?.days||[];
    const body=days.map(day=>`<article class="program-day"><header><h2>روز ${day.day_number} — ${esc(day.focus||'تمرین')}</h2><span>${day.is_rest_day?'روز استراحت':`${day.systems?.length||0} سیستم`}</span></header>${day.coach_note?`<div class="coach-note">${esc(day.coach_note)}</div>`:''}${day.is_rest_day?'<div class="student-empty"><p>استراحت، ریکاوری و تغذیه مناسب</p></div>':(day.systems||[]).map(system=>`<section class="program-system"><header>سیستم ${esc(system.system_type||'normal')}</header>${(system.movements||[]).map(movement=>`<article class="student-movement"><div class="student-movement-image">${movement.image_path?`<img src="${esc(movement.image_path)}" alt="${esc(movement.name)}" onerror="this.remove()">`:'◇'}</div><div><h3>${esc(movement.name)}</h3>${movement.description?`<p>${esc(movement.description)}</p>`:''}<div class="student-sets">${(movement.sets||[]).map((set,index)=>`<div class="student-set"><b>ست ${index+1}</b> • ${esc(set.type||'REPEAT')}<br>تعداد/زمان: ${esc(set.count??'—')} • وزن: ${esc(set.weight??'—')} • استراحت: ${esc(set.rest_seconds??'—')} ثانیه</div>`).join('')}</div></div></article>`).join('')}</section>`).join('')}</article>`).join('');
    shell('/student/program',`<div class="student-page-head"><h1>برنامه من</h1><p>برنامه فقط‌خواندنی اختصاص داده‌شده توسط مربی</p></div><article class="student-card"><div class="student-program-head"><div><h2>${esc(program.title)}</h2><span class="student-program-dates">${dateFa(program.start_date)} ← ${dateFa(program.end_date)}</span></div>${status(program.status)}</div>${program.coach_note?`<div class="coach-note"><b>یادداشت مربی</b><br>${esc(program.coach_note)}</div>`:''}</article>${body}`);
  }
  async function renderAssessment(){
    loading();if(!await loadMe())return;const {assessment}=await api('/api/student/assessment');
    if(!assessment)return shell('/student/assessment',`<div class="student-page-head"><h1>ارزیابی من</h1></div><div class="student-empty"><span>◫</span><h2>هنوز ارزیابی ثبت نشده است.</h2></div>`);
    shell('/student/assessment',`<div class="student-page-head"><h1>ارزیابی من</h1><p>آخرین ارزیابی ارسال‌شده و تغییرناپذیر</p></div><article class="student-card"><div class="student-program-head"><div><h2>ارزیابی ${assessment.assessment_number}</h2><span class="student-program-dates">${dateFa(assessment.submitted_at)}</span></div>${status(assessment.status)}</div><div class="student-assessment-data"><div><span>وزن</span><b>${assessment.weight??'—'} kg</b></div><div><span>قد</span><b>${assessment.height??'—'} cm</b></div><div><span>هدف</span><b>${esc(assessment.goal||'—')}</b></div><div><span>محدودیت‌ها</span><b>${esc(assessment.limitations||'—')}</b></div><div><span>یادداشت شما</span><b>${esc(assessment.student_note||'—')}</b></div><div><span>بازخورد مربی</span><b>${esc(assessment.coach_note||'—')}</b></div></div>${photosHtml(assessment)}</article>`);
  }
  async function renderHistory(){
    loading();if(!await loadMe())return;const data=await api('/api/student/history');
    shell('/student/history',`<div class="student-page-head"><h1>تاریخچه</h1><p>تمام ارزیابی‌ها و برنامه‌های ماهانه شما</p></div><section class="student-card history-section"><h2>تاریخچه ارزیابی‌ها</h2><div class="history-list">${data.assessments.length?data.assessments.slice().reverse().map(item=>`<article class="history-item"><div><b>ارزیابی ${item.assessment_number}</b><small>${dateFa(item.submitted_at)} • ${item.weight??'—'} kg</small></div>${status(item.status)}</article>`).join(''):'<div class="student-empty"><p>هنوز ارزیابی ثبت نشده است.</p></div>'}</div></section><section class="student-card history-section"><h2>تاریخچه برنامه‌ها</h2><div class="history-list">${data.programs.length?data.programs.slice().reverse().map(item=>`<article class="history-item"><div><b>${esc(item.title)}</b><small>${dateFa(item.start_date)} ← ${dateFa(item.end_date)}</small></div>${status(item.status)}</article>`).join(''):'<div class="student-empty"><p>هنوز برنامه‌ای ثبت نشده است.</p></div>'}</div></section>`);
  }
  async function renderProfile(){
    loading();if(!await loadMe())return;const {student}=await api('/api/student/profile');
    shell('/student/profile',`<div class="student-page-head"><h1>پروفایل من</h1><p>ویرایش این اطلاعات، ارزیابی‌های تاریخی را تغییر نمی‌دهد.</p></div><form class="student-card" id="profileForm"><div class="student-profile-grid"><label>نام و نام خانوادگی<input name="full_name" required maxlength="100" value="${esc(student.full_name)}"></label><label>موبایل<input name="mobile" maxlength="20" value="${esc(student.mobile)}"></label><label>تاریخ تولد<input type="date" name="date_of_birth" value="${esc(student.date_of_birth)}"></label><label>محل تمرین<select name="preferred_location"><option value="gym" ${student.preferred_location==='gym'?'selected':''}>باشگاه</option><option value="home" ${student.preferred_location==='home'?'selected':''}>منزل</option></select></label><label class="wide">هدف تمرینی<textarea name="goal" maxlength="4000">${esc(student.goal)}</textarea></label><label class="wide">محدودیت‌ها<textarea name="limitations" maxlength="4000">${esc(student.limitations)}</textarea></label><label class="wide">آسیب‌ها<textarea name="injuries" maxlength="4000">${esc(student.injuries)}</textarea></label></div><div class="student-actions"><button class="primary">ذخیره پروفایل</button></div></form>`);
    document.querySelector('#profileForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{await api('/api/student/profile',{method:'PUT',body:jsonBody(Object.fromEntries(new FormData(event.currentTarget)))});toast('پروفایل ذخیره شد.');}catch(error){toast(error.message,'error');}finally{button.disabled=false;}};
  }

  async function renderOnboarding(){
    loading();if(!await loadMe())return;const data=await api('/api/student/onboarding');
    if(me.next_route!=='/student/onboarding' && !data.assessment)return location.replace('/student/dashboard');
    const state={step:0,student:data.student,assessment:data.assessment||{},preference:data.assessment?.body_photos_preference||'',photos:Object.fromEntries((data.assessment?.photos||[]).map(photo=>[photo.photo_type,photo]))};
    const steps=['اطلاعات شخصی','اطلاعات بدنی','هدف تمرینی','شرایط و محدودیت‌ها','عکس‌های ارزیابی','بررسی و ارسال'];
    root.innerHTML=`<div class="onboarding-shell"><div class="onboarding-wrap"><header class="onboarding-head"><div class="student-brand"><div class="student-brand-mark">Y</div><div><b>YASNAFIT</b><small>تکمیل پرونده شخصی</small></div></div><span class="onboarding-progress-label" id="progressLabel"></span></header><div class="progress-track"><div class="progress-value" id="progressValue"></div></div><main class="onboarding-card"><section class="onboarding-step" data-step="0"><h1>اطلاعات شخصی</h1><p>اطلاعات پایه خود را بررسی و تکمیل کنید.</p><div class="student-profile-grid"><label>نام و نام خانوادگی *<input id="obName" required maxlength="100" value="${esc(state.student.full_name)}"></label><label>موبایل<input id="obMobile" maxlength="20" value="${esc(state.student.mobile)}"></label><label>تاریخ تولد<input id="obDob" type="date" value="${esc(state.student.date_of_birth)}"></label><label>محل تمرین<select id="obLocation"><option value="gym" ${state.student.preferred_location==='gym'?'selected':''}>باشگاه</option><option value="home" ${state.student.preferred_location==='home'?'selected':''}>منزل</option></select></label></div></section><section class="onboarding-step" data-step="1"><h1>اطلاعات بدنی</h1><p>مقادیر واقعی و فعلی را وارد کنید.</p><div class="student-profile-grid"><label>قد (سانتی‌متر) *<input id="obHeight" type="text" inputmode="decimal" dir="ltr" placeholder="مثلاً 175" value="${state.assessment.height??state.student.height??''}"></label><label>وزن (کیلوگرم) *<input id="obWeight" type="text" inputmode="decimal" dir="ltr" placeholder="مثلاً 78.5" value="${state.assessment.weight??state.student.weight??''}"></label><label>دور کمر<input id="obWaist" type="text" inputmode="decimal" dir="ltr" placeholder="اختیاری" value="${state.assessment.waist??''}"></label><label>دور سینه<input id="obChest" type="text" inputmode="decimal" dir="ltr" placeholder="اختیاری" value="${state.assessment.chest??''}"></label><label>دور باسن<input id="obHips" type="text" inputmode="decimal" dir="ltr" placeholder="اختیاری" value="${state.assessment.hips??''}"></label><label>درصد چربی<input id="obFat" type="text" inputmode="decimal" dir="ltr" placeholder="اختیاری" value="${state.assessment.body_fat??''}"></label></div></section><section class="onboarding-step" data-step="2"><h1>هدف تمرینی</h1><p>هدف و سابقه تمرین خود را توضیح دهید.</p><div class="student-profile-grid"><label class="wide">هدف تمرینی *<textarea id="obGoal" maxlength="4000">${esc(state.assessment.goal||state.student.goal)}</textarea></label><label>سابقه تمرین<select id="obExperience"><option value="مبتدی">مبتدی</option><option value="متوسط">متوسط</option><option value="پیشرفته">پیشرفته</option></select></label></div></section><section class="onboarding-step" data-step="3"><h1>شرایط و محدودیت‌ها</h1><p>برای طراحی برنامه ایمن، موارد مهم را صادقانه وارد کنید.</p><div class="student-profile-grid"><label class="wide">محدودیت‌ها<textarea id="obLimitations" maxlength="4000">${esc(state.assessment.limitations||state.student.limitations)}</textarea></label><label class="wide">آسیب‌ها<textarea id="obInjuries" maxlength="4000">${esc(state.assessment.injuries||state.student.injuries)}</textarea></label><label class="wide">یادداشت برای مربی<textarea id="obNote" maxlength="4000">${esc(state.assessment.student_note||'')}</textarea></label></div></section><section class="onboarding-step" data-step="4"><div class="optional-section-title"><div><h1>تصاویر بدنی</h1><span>اختیاری</span></div></div><div class="privacy-notice">ارسال تصاویر کاملاً اختیاری است. در صورت تمایل می‌توانید تصاویر بدنی خود را برای بررسی بهتر وضعیت بدنی در اختیار مربی قرار دهید.</div><fieldset class="photo-preference"><legend>آیا مایل هستید تصاویر بدنی خود را برای مربی ارسال کنید؟</legend><label><input type="radio" name="bodyPhotoPreference" value="willing" ${state.preference==='willing'?'checked':''}> بله، مایل هستم تصاویر بدنی خود را ارسال کنم</label><label><input type="radio" name="bodyPhotoPreference" value="declined" ${state.preference==='declined'?'checked':''}> خیر، مایل نیستم تصویر بدنی ارسال کنم</label></fieldset><div id="photoPreferenceResult"></div><div class="upload-grid" id="uploadGrid"></div><div class="upload-error" id="uploadError"></div><div class="optional-documents"><div><b>مدارک پزشکی و آزمایش‌ها</b><span>ارسال نشده • اختیاری</span></div><div><b>گالری تصاویر تکمیلی</b><span>ارسال نشده • اختیاری</span></div></div></section><section class="onboarding-step" data-step="5"><h1>بررسی نهایی</h1><p>قبل از ارسال، اطلاعات خود را بررسی کنید.</p><div class="student-review-grid" id="reviewGrid"></div><label class="review-confirm"><input type="checkbox" id="confirmAssessment"> اطلاعات واردشده صحیح است.</label></section><div class="onboarding-error" id="onboardingError" role="alert"></div><div class="student-actions"><button class="secondary" id="prevStep" type="button">مرحله قبل</button><button class="primary" id="nextStep" type="button">مرحله بعد</button></div></main></div></div>`;
    const value=id=>document.querySelector(id)?.value?.trim()||'';
    const normalizeNumber=value=>String(value||'')
      .replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[٫,]/g,'.').replace(/٬/g,'').replace(/\s+/g,'');
    const number=id=>{const raw=value(id);if(raw==='')return null;const parsed=Number(normalizeNumber(raw));return Number.isFinite(parsed)?parsed:NaN;};
    const requireRange=(input,min,max,label,required=false)=>{
      if(input===null){if(required)throw new Error(`${label} الزامی است.`);return;}
      if(!Number.isFinite(input))throw new Error(`${label} باید با عدد معتبر وارد شود؛ ارقام فارسی و ممیز نیز پشتیبانی می‌شوند.`);
      if(input<min||input>max)throw new Error(`${label} باید بین ${min} و ${max} باشد.`);
    };
    const showStepError=message=>{const box=document.querySelector('#onboardingError');if(!box)return;box.textContent=message||'';box.classList.toggle('visible',Boolean(message));if(message)box.scrollIntoView({behavior:'smooth',block:'nearest'});};
    document.querySelector('#obExperience').value=state.assessment.training_experience||state.student.training_experience||'مبتدی';
    const photoSlots=['front','side','back','front_flex','back_flex'];
    let preferenceSavePromise=Promise.resolve();
    function uploadCards(){
      const grid=document.querySelector('#uploadGrid');
      if(state.preference!=='willing'){grid.innerHTML='';return;}
      grid.innerHTML=photoSlots.map(type=>{const photo=state.photos[type];return `<article class="upload-card ${photo?'has-photo':''}" data-upload-card="${type}">${photo?`<img src="/api/student-photos/${photo.id}" alt="عکس ${photoLabels[type]}"><div class="upload-card-overlay"><strong>${photoLabels[type]}</strong><span class="optional-photo-status sent">ارسال شد ✓</span><div><button type="button" class="secondary" data-pick-photo="${type}">تعویض</button><button type="button" class="danger" data-remove-photo="${type}">حذف</button></div></div>`:`<strong>${photoLabels[type]}</strong><span class="optional-photo-status">ارسال نشده • اختیاری</span><p>در صورت تمایل عکس واضح و تمام‌قد ارسال کنید.</p><button type="button" class="secondary" data-pick-photo="${type}">انتخاب عکس</button>`}<input hidden type="file" accept="image/jpeg,image/png,image/webp" data-photo-input="${type}"></article>`;}).join('');
      document.querySelectorAll('[data-pick-photo]').forEach(button=>button.onclick=()=>document.querySelector(`[data-photo-input="${button.dataset.pickPhoto}"]`).click());
      document.querySelectorAll('[data-photo-input]').forEach(input=>input.onchange=()=>input.files[0]&&uploadPhoto(input.dataset.photoInput,input.files[0]));
      document.querySelectorAll('[data-remove-photo]').forEach(button=>button.onclick=()=>removePhoto(button.dataset.removePhoto));
    }
    function renderPhotoPreference(){
      const result=document.querySelector('#photoPreferenceResult');
      if(state.preference==='declined')result.innerHTML='<div class="privacy-choice-confirmed"><b>✓ انتخاب شما ثبت شد</b><span>تصاویر بدنی ارسال نخواهند شد و ارزیابی شما کاملاً معتبر است.</span></div>';
      else if(state.preference==='willing')result.innerHTML='<div class="privacy-choice-confirmed"><b>انتخاب شما ثبت شد</b><span>هر پنج تصویر اختیاری هستند؛ بدون ارسال عکس نیز می‌توانید ادامه دهید.</span></div>';
      else result.innerHTML='<div class="privacy-choice-pending">برای ادامه یکی از دو گزینه بالا را انتخاب کنید.</div>';
      uploadCards();
    }
    async function persistPhotoPreference(preference){
      const previous=state.preference;state.preference=preference;renderPhotoPreference();showStepError('');
      try{
        const response=await api('/api/student/assessment',{method:'POST',body:jsonBody({body_photos_preference:preference})});
        state.assessment=response.assessment;state.preference=response.assessment.body_photos_preference;
        state.photos=Object.fromEntries((response.assessment.photos||[]).map(photo=>[photo.photo_type,photo]));renderPhotoPreference();
      }catch(error){state.preference=previous;document.querySelectorAll('input[name="bodyPhotoPreference"]').forEach(input=>input.checked=input.value===previous);renderPhotoPreference();showStepError(error.message);throw error;}
    }
    function uploadPhoto(type,file){
      if(file.size>5*1024*1024)return toast('حجم عکس حداکثر ۵ مگابایت است.','error');
      const card=document.querySelector(`[data-upload-card="${type}"]`),progress=document.createElement('div');progress.className='upload-progress';progress.innerHTML='<i style="width:0"></i>';card.append(progress);
      const form=new FormData();form.append('photo',file);form.append('photo_type',type);
      const xhr=new XMLHttpRequest();xhr.open('POST','/api/student/assessment/photos');xhr.withCredentials=true;
      xhr.upload.onprogress=event=>{if(event.lengthComputable)progress.querySelector('i').style.width=`${Math.round(event.loaded/event.total*100)}%`;};
      xhr.onload=()=>{progress.remove();let response={};try{response=JSON.parse(xhr.responseText);}catch(error){}if(xhr.status>=200&&xhr.status<300){state.photos[type]=response.photo;uploadCards();toast(`عکس ${photoLabels[type]} ارسال شد.`);}else toast(response.error||'ارسال عکس ناموفق بود.','error');};
      xhr.onerror=()=>{progress.remove();toast('خطای شبکه هنگام ارسال عکس.','error');};xhr.send(form);
    }
    async function removePhoto(type){try{await api(`/api/student/assessment/photos/${state.photos[type].id}`,{method:'DELETE'});delete state.photos[type];uploadCards();}catch(error){toast(error.message,'error');}}
    document.querySelectorAll('input[name="bodyPhotoPreference"]').forEach(input=>input.onchange=async()=>{
      document.querySelectorAll('input[name="bodyPhotoPreference"]').forEach(option=>option.disabled=true);
      try{preferenceSavePromise=persistPhotoPreference(input.value);await preferenceSavePromise;toast('انتخاب شما ثبت شد.');}
      catch(error){toast(error.message,'error');}
      finally{document.querySelectorAll('input[name="bodyPhotoPreference"]').forEach(option=>option.disabled=false);}
    });
    async function saveStep(){
      if(state.step===0){const full_name=value('#obName');if(!full_name)throw new Error('نام و نام خانوادگی الزامی است.');const result=await api('/api/student/profile',{method:'PUT',body:jsonBody({full_name,mobile:value('#obMobile'),date_of_birth:value('#obDob'),preferred_location:value('#obLocation')})});state.student=result.student;}
      if(state.step===1){
        const height=number('#obHeight'),weight=number('#obWeight'),waist=number('#obWaist'),chest=number('#obChest'),hips=number('#obHips'),body_fat=number('#obFat');
        requireRange(height,100,250,'قد',true);requireRange(weight,20,300,'وزن',true);
        requireRange(waist,30,250,'دور کمر');requireRange(chest,30,250,'دور سینه');requireRange(hips,30,250,'دور باسن');requireRange(body_fat,1,80,'درصد چربی');
        await api('/api/student/profile',{method:'PUT',body:jsonBody({height,weight})});
        const result=await api('/api/student/assessment',{method:'POST',body:jsonBody({height,weight,waist,chest,hips,body_fat})});state.assessment=result.assessment;
      }
      if(state.step===2){const goal=value('#obGoal');if(!goal)throw new Error('هدف تمرینی الزامی است.');const training_experience=value('#obExperience');await api('/api/student/profile',{method:'PUT',body:jsonBody({goal,training_experience})});const result=await api('/api/student/assessment',{method:'POST',body:jsonBody({goal,training_experience})});state.assessment=result.assessment;}
      if(state.step===3){const payload={limitations:value('#obLimitations'),injuries:value('#obInjuries')};await api('/api/student/profile',{method:'PUT',body:jsonBody(payload)});const result=await api('/api/student/assessment',{method:'POST',body:jsonBody({...payload,student_note:value('#obNote')})});state.assessment=result.assessment;}
      if(state.step===4){
        await preferenceSavePromise;
        const selected=document.querySelector('input[name="bodyPhotoPreference"]:checked')?.value||state.preference;
        if(!['willing','declined'].includes(selected))throw new Error('لطفاً مشخص کنید آیا مایل به ارسال تصاویر بدنی هستید یا خیر.');
        if(state.preference!==selected)await persistPhotoPreference(selected);
      }
    }
    function review(){document.querySelector('#reviewGrid').innerHTML=`<div class="student-review-item"><span>نام</span><b>${esc(value('#obName'))}</b></div><div class="student-review-item"><span>موبایل</span><b>${esc(value('#obMobile')||'—')}</b></div><div class="student-review-item"><span>قد و وزن</span><b>${esc(value('#obHeight'))} cm • ${esc(value('#obWeight'))} kg</b></div><div class="student-review-item"><span>هدف</span><b>${esc(value('#obGoal'))}</b></div><div class="student-review-item"><span>محدودیت‌ها</span><b>${esc(value('#obLimitations')||'—')}</b></div><div class="student-review-item"><span>تصاویر بدنی</span><b>${state.preference==='declined'?'تمایلی به ارسال تصاویر ندارم':`${Object.keys(state.photos).length} تصویر اختیاری ارسال شده`}</b></div>`;}
    function draw(){showStepError('');document.querySelectorAll('.onboarding-step').forEach((step,index)=>step.classList.toggle('active',index===state.step));document.querySelector('#progressLabel').textContent=`مرحله ${state.step+1} از ${steps.length} — ${steps[state.step]}`;document.querySelector('#progressValue').style.width=`${(state.step+1)/steps.length*100}%`;document.querySelector('#prevStep').style.visibility=state.step===0?'hidden':'visible';document.querySelector('#nextStep').textContent=state.step===steps.length-1?'ارسال اطلاعات برای مربی':'مرحله بعد';if(state.step===4)renderPhotoPreference();if(state.step===5)review();}
    document.querySelector('#prevStep').onclick=()=>{if(state.step>0){state.step--;draw();}};
    document.querySelector('#nextStep').onclick=async event=>{
      const button=event.currentTarget;button.disabled=true;showStepError('');
      try{
        if(state.step===steps.length-1){
          if(!document.querySelector('#confirmAssessment').checked)throw new Error('صحت اطلاعات را تأیید کنید.');
          button.textContent='در حال ارسال اطلاعات...';await api('/api/student/assessment/submit',{method:'POST'});renderSuccess();return;
        }
        button.textContent='در حال ذخیره...';await saveStep();state.step++;draw();
      }catch(error){showStepError(error.message);toast(error.message,'error');}
      finally{
        if(button.isConnected){button.disabled=false;button.textContent=state.step===steps.length-1?'ارسال اطلاعات برای مربی':'مرحله بعد';}
      }
    };
    draw();
  }
  function renderSuccess(){root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="student-success-icon">✓</div><span class="join-brand">YASNAFIT</span><h1>اطلاعات شما با موفقیت ارسال شد</h1><p>متشکریم. اطلاعات و تصاویر شما برای مربی ارسال شد.</p><p>پس از بررسی مربی، برنامه تمرینی شما در پنل شخصی‌تان قرار خواهد گرفت.</p><a class="primary" href="/student/dashboard">ورود به پنل شخصی</a></div></section>`;}
  async function renderLogout(){
    try{await api('/api/student/logout',{method:'POST'});}catch(error){}
    root.innerHTML=`<section class="student-auth-page"><div class="join-card"><div class="student-success-icon">✓</div><h1>با موفقیت خارج شدید</h1><p>نشست شما بسته شد. برای ورود دوباره، از مربی لینک جدید دریافت کنید.</p></div></section>`;
  }
  async function start(){
    const path=location.pathname;
    if(path.startsWith('/join/'))return renderJoin();
    if(path==='/student/logout')return renderLogout();
    const pages={'/student/onboarding':renderOnboarding,'/student/dashboard':renderDashboard,'/student/program':renderProgram,'/student/assessment':renderAssessment,'/student/history':renderHistory,'/student/profile':renderProfile};
    return (pages[path]||(()=>errorPage('صفحه پیدا نشد','مسیر درخواستی وجود ندارد.')))();
  }
  start().catch(error=>{console.error(error);errorPage('خطای غیرمنتظره','لطفاً دوباره تلاش کنید.');});
})();
