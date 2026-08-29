(() => {
  'use strict';

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'')
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,\/]/g,'.').replace(/٬/g,'').replace(/\s+/g,'');
  const number=value=>{const normalized=normalize(value);return normalized===''?null:Number(normalized);};
  const bool=value=>value===undefined||value===null?null:value==='yes';
  const goalLabels={weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',fitness:'فیتنس',maintenance:'تثبیت وزن',muscle_gain:'عضله‌سازی',fat_loss:'چربی‌سوزی',competition:'آمادگی مسابقه'};
  const photoLabels={front_flex:'جلو با حالت بازو',back_flex:'پشت با حالت بازو',side:'نمای بغل'};
  const steps=[
    {title:'اطلاعات شخصی',hint:'مشخصات پایه شما'},
    {title:'هدف‌ها',hint:'انتخاب هدف این دوره'},
    {title:'اندازه‌های بدن',hint:'ثبت وضعیت فعلی'},
    {title:'سوابق پزشکی',hint:'ایمن‌سازی برنامه'},
    {title:'سابقه ورزشی',hint:'تنظیم سطح تمرین'},
    {title:'تغذیه و سبک زندگی',hint:'عادت‌های روزمره'},
    {title:'تصاویر و مدارک',hint:'کاملاً اختیاری'},
    {title:'بازبینی و ارسال',hint:'کنترل نهایی اطلاعات'}
  ];

  const field=id=>document.querySelector(`#${id}`)?.value?.trim()||'';
  const initJalaliInputs=()=>{if(window.YasnaJalali)window.YasnaJalali.autoInit();};
  const asciiDigits=value=>String(value??'').replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'');
  const mobileSuffix=value=>{const digits=asciiDigits(value);return digits.startsWith('09')?digits.slice(2):digits;};
  const completeMobile=value=>{const digits=asciiDigits(value);if(digits.startsWith('09'))return digits;if(digits.startsWith('9'))return `0${digits}`;return `09${digits}`;};
  const socialHandle=id=>{const value=field(id).replace(/^@+/, '').trim();return value?`@${value}`:'';};
  const checked=name=>document.querySelector(`[name="${name}"]:checked`)?.value;
  const selected=name=>[...document.querySelectorAll(`[name="${name}"]:checked`)].map(input=>input.value);
  const option=(value,label,current)=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${label}</option>`;
  const segment=(name,label,current,yes='بله',no='خیر')=>`
    <fieldset class="choice-card">
      <legend>${label}</legend>
      <div class="segmented-control">
        <label><input type="radio" name="${name}" value="no" ${current===0?'checked':''}><span>${no}</span></label>
        <label><input type="radio" name="${name}" value="yes" ${current===1?'checked':''}><span>${yes}</span></label>
      </div>
    </fieldset>`;
  const textArea=(id,label,value='',placeholder='در صورت نیاز کوتاه توضیح دهید')=>`
    <label class="field-control"><span>${label}</span><textarea id="${id}" rows="2" placeholder="${placeholder}">${esc(value)}</textarea></label>`;

  function setConditional(){
    document.querySelectorAll('[data-show-if]').forEach(element=>{
      const [name,value]=element.dataset.showIf.split(':');
      element.hidden=checked(name)!==value;
    });
  }

  window.YasnafitAssessmentWizard={
    async mount({root,api,me,toast,renderSuccess}){
      const [initial,catalogResponse]=await Promise.all([
        api('/api/student/onboarding'),
        api('/api/student/assessment/catalogs')
      ]);
      if(me.next_route!=='/student/onboarding'&&!initial.assessment){location.replace('/student/dashboard');return;}

      const student=initial.student||{};
      const assessment=initial.assessment||{};
      const details=initial.details||{};
      const measurements=details.measurements||{};
      const medical=details.medical||{};
      const sports=details.sports||{};
      const nutrition=details.nutrition||{};
      const habits=details.habits||{};
      const pregnancy=details.pregnancy||{};
      const state={
        step:0,
        assessment,
        details,
        student,
        photos:Object.fromEntries((assessment.photos||[]).map(photo=>[photo.photo_type,photo])),
        documents:assessment.documents||[],
        lastSaved:assessment.draft_saved_at||null,
        saving:false
      };

      const catalogItems=[];
      for(const [category,items] of Object.entries(catalogResponse.catalogs.injuries))for(const name of items)catalogItems.push({kind:'injury',category,name});
      for(const [category,items] of Object.entries(catalogResponse.catalogs.surgeries))for(const name of items)catalogItems.push({kind:'surgery',category,name});
      for(const [category,items] of Object.entries(catalogResponse.catalogs.diseases))for(const name of items)catalogItems.push({kind:'disease',category,name});
      for(const name of catalogResponse.catalogs.corrective)catalogItems.push({kind:'corrective',category:'ناهنجاری اصلاحی',name});
      const savedItems=new Set((details.medical_items||[]).map(item=>`${item.kind}|${item.category}|${item.name}`));

      const measureFields=[
        ['height','قد','cm',measurements.height??assessment.height,true],
        ['weight','وزن','kg',measurements.weight??assessment.weight,true],
        ['around_the_arm','دور بازو','cm',measurements.around_the_arm],
        ['around_the_chest','دور سینه','cm',measurements.around_the_chest],
        ['around_the_belly','دور شکم','cm',measurements.around_the_belly],
        ['around_the_hips','دور باسن','cm',measurements.around_the_hips],
        ['around_the_thigh','دور ران','cm',measurements.around_the_thigh],
        ['around_the_leg','دور ساق','cm',measurements.around_the_leg],
        ['around_the_wrist','دور مچ','cm',measurements.around_the_wrist]
      ];
      const measureInput=([id,label,unit,value,required])=>`
        <label class="metric-input"><span>${label}${required?' <i>ضروری</i>':''}</span><div><input id="m_${id}" inputmode="decimal" dir="ltr" value="${esc(value??'')}" placeholder="0"><b>${unit}</b></div></label>`;

      root.innerHTML=`
        <div class="onboarding-shell assessment-page">
          <div class="onboarding-wrap assessment-wizard">
            <header class="wizard-header">
              <a class="wizard-brand" href="/student/dashboard" aria-label="بازگشت به پنل"><span>Y</span><div><b>YASNAFIT</b><small>${assessment.assessment_type==='MONTHLY'?'ارزیابی ماهانه':'ارزیابی اولیه'}</small></div></a>
              <div class="assessment-case"><small>شماره پرونده</small><b>${esc(student.case_number||'------')}</b></div>
              <div class="save-state" id="saveState" aria-live="polite"><span></span><b>${state.lastSaved?'ذخیره شده':'آماده تکمیل'}</b><small id="lastSaved">${state.lastSaved?new Date(state.lastSaved).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'}):'ذخیره خودکار فعال است'}</small></div>
            </header>

            <section class="wizard-progress" aria-label="پیشرفت ارزیابی">
              <div class="wizard-progress-copy"><div><span id="stepCount"></span><h1 id="stepTitle"></h1></div><strong id="progressPercent"></strong></div>
              <div class="progress-track"><div class="progress-value" id="progressValue"></div></div>
              <div class="step-dots">${steps.map((step,index)=>`<button type="button" data-step-dot="${index}" aria-label="${step.title}"><span>${index+1}</span><small>${step.title}</small></button>`).join('')}</div>
            </section>

            <div class="wizard-top-error" data-wizard-error role="alert"></div>
            <main class="onboarding-card">
              <section class="onboarding-step" data-step="0">
                <div class="step-heading"><span class="step-icon">01</span><div><h2>اول خودتان را معرفی کنید</h2><p>این اطلاعات فقط برای پرونده خصوصی شما استفاده می‌شود.</p></div></div>
                <div class="form-grid compact-grid">
                  <label class="field-control wide"><span>نام و نام خانوادگی <i>ضروری</i></span><input id="personalName" maxlength="100" autocomplete="name" value="${esc(student.full_name||'')}" placeholder="نام کامل شما"></label>
                  <label class="field-control"><span>شماره همراه <i>ضروری</i></span><div class="prefixed-input" dir="ltr"><span>09-</span><input id="personalMobile" inputmode="tel" maxlength="10" autocomplete="tel" value="${esc(mobileSuffix(student.mobile))}" placeholder="0000000000"></div></label>
                  <label class="field-control"><span>تاریخ تولد</span><input id="personalBirthDate" type="text" data-jalali placeholder="مثلاً ۱۳۷۵/۰۴/۱۵" value="${esc(student.date_of_birth||'')}"></label>
                  <label class="field-control"><span>شناسه تلگرام <i>اختیاری</i></span><div class="prefixed-input" dir="ltr"><span>@</span><input id="personalTelegram" maxlength="99" value="${esc(String(student.telegram_id||'').replace(/^@+/,''))}" placeholder="نام کاربری"></div></label>
                  <label class="field-control"><span>اینستاگرام <i>اختیاری</i></span><div class="prefixed-input" dir="ltr"><span>@</span><input id="personalInstagram" maxlength="99" value="${esc(String(student.instagram_id||'').replace(/^@+/,''))}" placeholder="نام کاربری"></div></label>
                </div>
                <fieldset class="option-group"><legend>جنسیت <i>ضروری</i></legend><div class="select-cards two"><label><input type="radio" name="wizardGender" value="female" ${student.gender==='female'?'checked':''}><span>خانم</span></label><label><input type="radio" name="wizardGender" value="male" ${student.gender==='male'?'checked':''}><span>آقا</span></label></div></fieldset>
                <fieldset class="option-group"><legend>محل اصلی تمرین</legend><div class="select-cards two"><label><input type="radio" name="preferredLocation" value="gym" ${student.preferred_location!=='home'?'checked':''}><span>باشگاه</span></label><label><input type="radio" name="preferredLocation" value="home" ${student.preferred_location==='home'?'checked':''}><span>منزل</span></label></div></fieldset>
              </section>

              <section class="onboarding-step" data-step="1">
                <div class="step-heading"><span class="step-icon">02</span><div><h2>از این دوره چه می‌خواهید؟</h2><p>هدف اصلی این دوره را از فهرست انتخاب کنید.</p></div></div>
                <label class="field-control goal-select"><span>هدف اصلی این دوره <i>ضروری</i></span><select id="primaryGoal"><option value="">یک هدف را انتخاب کنید</option>${Object.entries(goalLabels).map(([code,label])=>option(code,label,(details.goals||[])[0]||'')).join('')}</select></label>
              </section>

              <section class="onboarding-step" data-step="2">
                <div class="step-heading"><span class="step-icon">03</span><div><h2>اندازه‌های فعلی بدن</h2><p>فقط قد و وزن ضروری است؛ سایر اندازه‌ها دقت برنامه را بیشتر می‌کنند.</p></div></div>
                <div class="metric-grid essentials">${measureFields.slice(0,2).map(measureInput).join('')}</div>
                <details class="optional-disclosure" ${measureFields.slice(2).some(item=>item[3]!=null)?'open':''}>
                  <summary><span><b>اندازه‌های تکمیلی</b><small>اختیاری • ۷ مورد</small></span><i>＋</i></summary>
                  <div class="metric-grid">${measureFields.slice(2).map(measureInput).join('')}</div>
                </details>
                <div class="measurement-tip"><span>◎</span><p>متر را بدون فشار و موازی زمین نگه دارید. اعداد فارسی و اعشاری پذیرفته می‌شوند.</p></div>
              </section>

              <section class="onboarding-step" data-step="3">
                <div class="step-heading"><span class="step-icon">04</span><div><h2>سوابق پزشکی</h2><p>چهار پاسخ سریع برای طراحی تمرین ایمن‌تر.</p></div></div>
                <div class="question-grid">
                  ${segment('has_disease','سابقه بیماری دارید؟',medical.has_disease,'دارم','ندارم')}
                  ${segment('has_medication','دارو مصرف می‌کنید؟',medical.has_medication,'مصرف می‌کنم','خیر')}
                  ${segment('has_injury','آسیب‌دیدگی داشته‌اید؟',medical.has_injury,'داشته‌ام','خیر')}
                  ${segment('has_surgery','سابقه جراحی دارید؟',medical.has_surgery,'دارم','ندارم')}
                </div>
                <div class="conditional-stack">
                  <div data-show-if="has_disease:yes">${textArea('diseaseDetails','نوع و مدت بیماری',medical.disease_details)}</div>
                  <div data-show-if="has_medication:yes">${textArea('medicationDetails','نام دارو و مدت مصرف',medical.medication_details)}</div>
                  <div data-show-if="has_injury:yes">${textArea('injuryDetails','محل و شرح آسیب',medical.injury_details)}</div>
                  <div data-show-if="has_surgery:yes">${textArea('surgeryDetails','نوع و زمان جراحی',medical.surgery_details)}</div>
                </div>
                <details class="optional-disclosure medical-picker" ${savedItems.size?'open':''}>
                  <summary><span><b>انتخاب سریع سابقه‌ها</b><small>${savedItems.size?`${savedItems.size} مورد انتخاب شده`:'اختیاری • جستجو در فهرست'}</small></span><i>＋</i></summary>
                  <div class="catalog"><input id="catalogSearch" type="search" placeholder="نام آسیب، بیماری یا جراحی را بنویسید"><div class="catalog-items" id="catalogItems">${catalogItems.map((item,index)=>`<label data-catalog-text="${esc(`${item.category} ${item.name}`)}"><input type="checkbox" name="medicalItem" value="${index}" ${savedItems.has(`${item.kind}|${item.category}|${item.name}`)?'checked':''}><span><b>${esc(item.name)}</b><small>${esc(item.category)}</small></span></label>`).join('')}</div></div>
                </details>
                <details class="optional-disclosure"><summary><span><b>یادداشت‌های تکمیلی پزشکی</b><small>اختیاری</small></span><i>＋</i></summary><div class="form-grid">${textArea('bloodTestNotes','نکته مهم از آخرین آزمایش خون',medical.last_blood_test_notes)}${textArea('correctiveNotes','ناهنجاری یا تمرین اصلاحی',medical.corrective_notes)}</div></details>
              </section>

              <section class="onboarding-step" data-step="4">
                <div class="step-heading"><span class="step-icon">05</span><div><h2>سابقه و شرایط تمرین</h2><p>پاسخ‌های کوتاه برای انتخاب حجم و شدت مناسب.</p></div></div>
                <div class="quick-select-grid">
                  <label class="field-control"><span>فعالیت روزانه</span><select id="dailyActivity">${option('low','کم',sports.average_daily_activity||'medium')}${option('medium','متوسط',sports.average_daily_activity||'medium')}${option('high','زیاد',sports.average_daily_activity||'medium')}</select></label>
                  <label class="field-control"><span>محل تمرین</span><select id="practicePlace">${option('gym','باشگاه',sports.practice_place||student.preferred_location||'gym')}${option('home','منزل',sports.practice_place||student.preferred_location||'gym')}</select></label>
                  <label class="field-control"><span>جلسه در هفته</span><select id="sessionsPerWeek">${[3,4,5].map(value=>option(value,`${value} جلسه`,sports.sessions_per_week||3)).join('')}</select></label>
                </div>
                <div class="question-grid">
                  ${segment('practice_history','سابقه تمرین منظم دارید؟',sports.practice_history,'دارم','ندارم')}
                  ${segment('practice_now','اکنون تمرین می‌کنید؟',sports.practice_now,'بله','خیر')}
                  ${segment('supplement_history','سابقه مصرف مکمل دارید؟',sports.supplement_history,'دارم','ندارم')}
                </div>
                <div class="conditional-stack">
                  <div data-show-if="practice_history:yes" class="form-grid"><label class="field-control"><span>مدت سابقه</span><select id="practiceDuration">${sports.practice_duration&&!['less_than_6_months','6_to_12_months','1_to_3_years','more_than_3_years'].includes(sports.practice_duration)?option(sports.practice_duration,sports.practice_duration,sports.practice_duration):''}${option('less_than_6_months','کمتر از ۶ ماه',sports.practice_duration)}${option('6_to_12_months','۶ تا ۱۲ ماه',sports.practice_duration)}${option('1_to_3_years','۱ تا ۳ سال',sports.practice_duration)}${option('more_than_3_years','بیشتر از ۳ سال',sports.practice_duration)}</select></label><label class="field-control"><span>رشته اصلی</span><input id="sportDiscipline" value="${esc(sports.sport_discipline||'')}" placeholder="مثلاً بدنسازی"></label>${textArea('practiceHistoryDetails','شرح کوتاه سابقه',sports.practice_history_details)}</div>
                  <div data-show-if="practice_now:yes">${textArea('currentPracticeDetails','تمرین فعلی شما',sports.current_practice_details)}</div>
                  <div data-show-if="supplement_history:yes">${textArea('supplementDetails','نوع و مقدار مکمل',sports.supplement_details)}</div>
                </div>
                <details class="optional-disclosure"><summary><span><b>اطلاعات تکمیلی تمرین</b><small>اختیاری</small></span><i>＋</i></summary><div class="form-grid"><label class="field-control"><span>تجهیزات موجود در منزل</span><input id="homeEquipment" value="${esc(sports.home_equipment||'')}" placeholder="دمبل، کش، نیمکت"></label>${textArea('dopingHistory','سابقه دوپینگ',sports.doping_history,'در صورت وجود توضیح دهید')}</div></details>
              </section>

              <section class="onboarding-step" data-step="5">
                <div class="step-heading"><span class="step-icon">06</span><div><h2>تغذیه و سبک زندگی</h2><p>سؤال‌های تغذیه و عادت‌ها به‌ترتیب و بدون بخش پنهان نمایش داده می‌شوند.</p></div></div>
                <div class="lifestyle-overview"><span>تمام سؤال‌ها در همین صفحه و به‌ترتیب نمایش داده می‌شوند.</span></div>
                <section class="lifestyle-panel active" data-lifestyle-panel="nutrition"><div class="lifestyle-title"><span>۱</span><div><b>تغذیه</b><small>الگوی غذا و اشتها</small></div></div>
<<<<<<< HEAD
                  <div class="quick-select-grid"><label class="field-control"><span>الگوی غذایی</span><select id="dietType">${option('iranian','سفره ایرانی',nutrition.diet_type||'iranian')}${option('professional','رژیم حرفه‌ای',nutrition.diet_type||'iranian')}</select></label><label class="field-control"><span>وضعیت اشتها</span><select id="appetiteStatus">${option('normal','معمولی و طبیعی',nutrition.appetite_status||'normal')}${option('low_eating','کم‌خوری',nutrition.appetite_status||'normal')}${option('overeating','پرخوری',nutrition.appetite_status||'normal')}${option('grazing','ریزه‌خوری',nutrition.appetite_status||'normal')}${option('emotional_overeating','پرخوری عصبی',nutrition.appetite_status||'normal')}${option('anorexia','بی‌اشتهایی عصبی',nutrition.appetite_status||'normal')}</select></label><label class="field-control"><span>وضعیت دفع</span><select id="defecationProblem">${option('none','بدون مشکل',nutrition.defecation_problem||'none')}${option('constipation','یبوست',nutrition.defecation_problem||'none')}${option('diarrhea','اسهال',nutrition.defecation_problem||'none')}${option('difficult_defecation','دفع سخت',nutrition.defecation_problem||'none')}</select></label></div>
=======
                  <div class="quick-select-grid"><label class="field-control"><span>محدودیت غذایی</span><select id="dietType">${option('none','بدون محدودیت',nutrition.diet_type||'none')}${option('vegetarian','گیاه‌خواری',nutrition.diet_type||'none')}${option('vegan','وگان',nutrition.diet_type||'none')}${option('celiac','سلیاک',nutrition.diet_type||'none')}${option('lactose_intolerance','حساسیت به لاکتوز',nutrition.diet_type||'none')}${option('gout','نقرس',nutrition.diet_type||'none')}${option('low_carb','لوکرب',nutrition.diet_type||'none')}${option('ketogenic','کتوژنیک',nutrition.diet_type||'none')}${option('fasting','فستینگ',nutrition.diet_type||'none')}${option('professional','حرفه‌ای',nutrition.diet_type||'none')}${option('competition','مسابقه ای',nutrition.diet_type||'none')}</select></label><label class="field-control"><span>وضعیت اشتها</span><select id="appetiteStatus">${option('normal','معمولی و طبیعی',nutrition.appetite_status||'normal')}${option('low_eating','کم‌خوری',nutrition.appetite_status||'normal')}${option('overeating','پرخوری',nutrition.appetite_status||'normal')}${option('grazing','ریزه‌خوری',nutrition.appetite_status||'normal')}${option('emotional_overeating','پرخوری عصبی',nutrition.appetite_status||'normal')}${option('anorexia','بی‌اشتهایی عصبی',nutrition.appetite_status||'normal')}</select></label><label class="field-control"><span>وضعیت دفع</span><select id="defecationProblem">${option('none','بدون مشکل',nutrition.defecation_problem||'none')}${option('constipation','یبوست',nutrition.defecation_problem||'none')}${option('diarrhea','اسهال',nutrition.defecation_problem||'none')}${option('difficult_defecation','دفع سخت',nutrition.defecation_problem||'none')}</select></label></div>
>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
                  ${segment('previous_diet','قبلاً رژیم داشته‌اید؟',nutrition.previous_diet)}
                  <div data-show-if="previous_diet:yes" class="form-grid"><label class="field-control"><span>مدت رژیم</span><input id="previousDietDuration" value="${esc(nutrition.previous_diet_duration||'')}"></label><label class="field-control"><span>نوع رژیم</span><input id="previousDietType" value="${esc(nutrition.previous_diet_type||'')}"></label>${textArea('previousDietNotes','نتیجه یا توضیح رژیم',nutrition.previous_diet_notes)}</div>
                  <details class="optional-disclosure"><summary><span><b>جزئیات بیشتر تغذیه</b><small>اختیاری</small></span><i>＋</i></summary><div class="form-grid">${textArea('foodAllergies','حساسیت یا عدم تحمل غذایی',nutrition.food_allergies)}${textArea('weightChanges','تغییرات اخیر وزن',nutrition.weight_changes)}${textArea('appetiteNotes','توضیح اشتها',nutrition.appetite_notes)}${textArea('breakfast','صبحانه معمول',nutrition.breakfast)}${textArea('lunch','ناهار معمول',nutrition.lunch)}${textArea('dinner','شام معمول',nutrition.dinner)}</div></details>
                </section>
                <section class="lifestyle-panel habits-panel" data-lifestyle-panel="habits">
                  <div class="lifestyle-title"><span>۲</span><div><b>عادت‌های روزمره</b><small>تمام پرسش‌های مربوط به عادت‌ها</small></div></div>
                  <div class="question-grid">${segment('smoking','مصرف دخانیات دارید؟',habits.smoking,'دارم','ندارم')}${segment('alcohol','مصرف الکل دارید؟',habits.alcohol,'دارم','ندارم')}</div>
                  <div class="conditional-stack"><div data-show-if="smoking:yes">${textArea('smokingDetails','نوع و میزان مصرف دخانیات',habits.smoking_details)}</div><div data-show-if="alcohol:yes">${textArea('alcoholDetails','نوع و میزان مصرف الکل',habits.alcohol_details)}</div></div>
                </section>
                <section class="lifestyle-panel pregnancy-panel" data-lifestyle-panel="pregnancy" ${student.gender==='female'?'':'hidden'}>
                  <div class="lifestyle-title"><span>۳</span><div><b>بارداری و زایمان</b><small>ویژه شاگرد خانم</small></div></div>
                  <div class="question-grid">${segment('childbirth_history','سابقه زایمان دارید؟',pregnancy.childbirth_history)}${segment('breastfeeding','در حال شیردهی هستید؟',pregnancy.breastfeeding)}${segment('formula_use','کودک شیر خشک مصرف می‌کند؟',pregnancy.formula_use)}${segment('child_food_allergy','کودک حساسیت غذایی دارد؟',pregnancy.child_food_allergy)}</div>
                  <div class="conditional-stack"><div data-show-if="childbirth_history:yes" class="form-grid"><label class="field-control"><span>تعداد زایمان</span><input id="childbirthCount" inputmode="numeric" value="${esc(pregnancy.childbirth_count??'')}"></label><label class="field-control"><span>نوع زایمان</span><select id="childbirthType">${option('natural','طبیعی',pregnancy.childbirth_type||'natural')}${option('cesarean','سزارین',pregnancy.childbirth_type||'natural')}</select></label>${textArea('childbirthNotes','توضیحات زایمان',pregnancy.childbirth_notes)}</div><div data-show-if="breastfeeding:yes" class="form-grid"><label class="field-control"><span>سن کودک به ماه</span><input id="childAgeMonths" inputmode="numeric" value="${esc(pregnancy.child_age_months??'')}"></label>${textArea('breastfeedingNotes','توضیحات شیردهی',pregnancy.breastfeeding_notes)}</div><div data-show-if="formula_use:yes" class="form-grid"><label class="field-control"><span>نوع شیر خشک</span><input id="formulaType" value="${esc(pregnancy.formula_type||'')}"></label><label class="field-control"><span>مقدار</span><input id="formulaAmount" value="${esc(pregnancy.formula_amount||'')}"></label><label class="field-control"><span>دفعات</span><input id="formulaFrequency" value="${esc(pregnancy.formula_frequency||'')}"></label></div><div data-show-if="child_food_allergy:yes">${textArea('childFoodAllergyNotes','شرح حساسیت کودک',pregnancy.child_food_allergy_notes)}</div></div>
                </section>
              </section>

              <section class="onboarding-step" data-step="6">
                <div class="step-heading"><span class="step-icon">07</span><div><h2>تصاویر و مدارک</h2><p>این مرحله کاملاً اختیاری است و بدون هیچ فایلی می‌توانید ادامه دهید.</p></div><span class="optional-badge">اختیاری</span></div>
                <div class="privacy-notice"><span>⌾</span><div><b>حریم خصوصی محفوظ است</b><p>تصاویر واقعی فقط برای مربی قابل مشاهده‌اند. راهنماها صرفاً حالت ایستادن را نشان می‌دهند.</p></div></div>
                <div class="upload-grid" id="uploadGrid"></div>
                <details class="optional-disclosure document-disclosure"><summary><span><b>مدارک تکمیلی</b><small>آزمایش خون، آنالیز بدن یا تصویر اضافی</small></span><i>＋</i></summary><div class="optional-documents"><div><b>آزمایش خون</b><span>PDF یا تصویر</span><button type="button" class="secondary" data-pick-document="blood_test">انتخاب فایل</button><input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-document-input="blood_test"></div><div><b>آنالیز بدن</b><span>PDF یا تصویر</span><button type="button" class="secondary" data-pick-document="body_analysis">انتخاب فایل</button><input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-document-input="body_analysis"></div><div><b>تصویر تکمیلی</b><span>تصویر خصوصی</span><button type="button" class="secondary" data-pick-document="additional_image">انتخاب تصویر</button><input hidden type="file" accept="image/jpeg,image/png,image/webp" data-document-input="additional_image"></div></div><div class="document-list" id="documentList"></div></details>
                <button type="button" class="skip-photos" id="skipPhotos">بدون تصویر ادامه می‌دهم <span>←</span></button>
              </section>

              <section class="onboarding-step" data-step="7">
                <div class="step-heading"><span class="step-icon success">✓</span><div><h2>همه‌چیز آماده است</h2><p>خلاصه اطلاعات را بررسی کنید و برای مربی بفرستید.</p></div></div>
                <div class="review-hero"><div class="review-score"><span>100%</span><small>آماده ارسال</small></div><div><b>${esc(student.full_name||'پرونده شما')}</b><p>اطلاعات پس از ارسال قفل می‌شود و فقط با درخواست اصلاح مربی قابل ویرایش خواهد بود.</p></div></div>
                <div class="review-sections" id="reviewSections"></div>
                <label class="review-confirm"><input type="checkbox" id="confirmAssessment"><span><b>اطلاعات را بررسی کردم</b><small>صحت اطلاعات واردشده را تأیید می‌کنم.</small></span></label>
                <div class="final-note">${textArea('generalNotes','آیا نکته یا توضیحاتی دارید که مربی بداند؟',assessment.student_note||'','اختیاری؛ آخرین نکته خود را اینجا بنویسید')}</div>
              </section>

              <div class="onboarding-error" data-wizard-error role="alert"></div>
              <footer class="wizard-actions"><button type="button" class="secondary back-button" id="prevStep">مرحله قبل</button><button type="button" class="ghost-save" id="saveDraft">ذخیره پیش‌نویس</button><button type="button" class="primary next-button" id="nextStep"><span>مرحله بعد</span><b>←</b></button></footer>
            </main>
          </div>
        </div>`;

      const saveState=document.querySelector('#saveState');
      function showError(message=''){
        document.querySelectorAll('[data-wizard-error]').forEach(box=>{box.textContent=message;box.classList.toggle('visible',Boolean(message));});
        if(message)document.querySelector('.wizard-top-error')?.scrollIntoView({behavior:'smooth',block:'center'});
      }
      function saving(active,error=false){
        state.saving=active;
        saveState.classList.toggle('saving',active);
        saveState.classList.toggle('failed',error);
        saveState.querySelector('b').textContent=error?'ذخیره نشد':active?'در حال ذخیره…':'ذخیره شد';
        if(!active&&!error)saveState.querySelector('#lastSaved').textContent='همین حالا';
      }
      function saved(response){state.lastSaved=response?.last_saved_at||new Date().toISOString();saving(false);}
      async function saveSection(section,payload,silent=false){
        saving(true);showError();
        try{const response=await api(`/api/student/assessment/sections/${section}`,{method:'PUT',body:JSON.stringify(payload)});state.assessment=response.assessment;state.details=response.details;saved(response);if(!silent)toast('پیش‌نویس ذخیره شد.');return response;}
        catch(error){saving(false,true);if(!silent)showError(error.message);throw error;}
      }
      async function saveProfile(silent=false){
        const full_name=field('personalName');if(!full_name)throw new Error('نام و نام خانوادگی را وارد کنید.');
        const gender=checked('wizardGender');if(!gender)throw new Error('جنسیت را انتخاب کنید.');
        saving(true);
        try{const response=await api('/api/student/profile',{method:'PUT',body:JSON.stringify({full_name,mobile:completeMobile(field('personalMobile')),telegram_id:socialHandle('personalTelegram'),instagram_id:socialHandle('personalInstagram'),date_of_birth:(window.YasnaJalali&&document.getElementById('personalBirthDate'))?window.YasnaJalali.iso(document.getElementById('personalBirthDate'))||null:field('personalBirthDate')||null,gender,preferred_location:checked('preferredLocation')||'gym'})});state.student=response.student;student.full_name=response.student.full_name;student.gender=response.student.gender;saved();if(!silent)toast('اطلاعات شخصی ذخیره شد.');return response;}
        catch(error){saving(false,true);if(!silent)showError(error.message);throw error;}
      }

      const payloads={
        general:()=>({goals:field('primaryGoal')?[field('primaryGoal')]:[],additional_notes:field('generalNotes'),gender:checked('wizardGender')||state.student.gender}),
        measurements:()=>Object.fromEntries(measureFields.map(([id])=>[id,number(field(`m_${id}`))])),
        medical:()=>({has_disease:bool(checked('has_disease')),disease_details:field('diseaseDetails'),has_medication:bool(checked('has_medication')),medication_details:field('medicationDetails'),has_injury:bool(checked('has_injury')),injury_details:field('injuryDetails'),has_surgery:bool(checked('has_surgery')),surgery_details:field('surgeryDetails'),last_blood_test_notes:field('bloodTestNotes'),corrective_notes:field('correctiveNotes'),items:[...document.querySelectorAll('[name="medicalItem"]:checked')].map(input=>catalogItems[Number(input.value)])}),
        sports:()=>({average_daily_activity:field('dailyActivity'),practice_history:bool(checked('practice_history')),practice_history_details:field('practiceHistoryDetails'),practice_duration:field('practiceDuration'),sport_discipline:field('sportDiscipline'),practice_now:bool(checked('practice_now')),current_practice_details:field('currentPracticeDetails'),practice_place:field('practicePlace'),home_equipment:field('homeEquipment'),sessions_per_week:Number(field('sessionsPerWeek')),supplement_history:bool(checked('supplement_history')),supplement_details:field('supplementDetails'),doping_history:field('dopingHistory')}),
        nutrition:()=>({diet_type:field('dietType'),previous_diet:bool(checked('previous_diet')),previous_diet_duration:field('previousDietDuration'),previous_diet_type:field('previousDietType'),previous_diet_notes:field('previousDietNotes'),food_allergies:field('foodAllergies'),weight_changes:field('weightChanges'),appetite_status:field('appetiteStatus'),appetite_notes:field('appetiteNotes'),defecation_problem:field('defecationProblem'),breakfast:field('breakfast'),lunch:field('lunch'),dinner:field('dinner')}),
        habits:()=>({smoking:bool(checked('smoking')),smoking_details:field('smokingDetails'),alcohol:bool(checked('alcohol')),alcohol_details:field('alcoholDetails')}),
        pregnancy:()=>({childbirth_history:bool(checked('childbirth_history')),childbirth_count:number(field('childbirthCount')),childbirth_type:field('childbirthType'),childbirth_notes:field('childbirthNotes'),breastfeeding:bool(checked('breastfeeding')),breastfeeding_notes:field('breastfeedingNotes'),child_age_months:number(field('childAgeMonths')),formula_use:bool(checked('formula_use')),formula_type:field('formulaType'),formula_amount:field('formulaAmount'),formula_frequency:field('formulaFrequency'),child_food_allergy:bool(checked('child_food_allergy')),child_food_allergy_notes:field('childFoodAllergyNotes')})
      };

      async function ensurePhotoReady(){
        if(state.assessment?.body_photos_preference==='willing')return;
        saving(true);
        const response=await api('/api/student/assessment',{method:'POST',body:JSON.stringify({body_photos_preference:'willing'})});
        state.assessment=response.assessment;state.photos=Object.fromEntries((response.assessment.photos||[]).map(photo=>[photo.photo_type,photo]));saved();
      }
      async function saveCurrent(silent=false){
        if(state.step===0)return saveProfile(silent);
        if(state.step===1)return saveSection('general',payloads.general(),silent);
        if(state.step===2)return saveSection('measurements',payloads.measurements(),silent);
        if(state.step===3)return saveSection('medical',payloads.medical(),silent);
        if(state.step===4)return saveSection('sports',payloads.sports(),silent);
        if(state.step===5){
          await saveSection('nutrition',payloads.nutrition(),true);
          await saveSection('habits',payloads.habits(),true);
          if((checked('wizardGender')||state.student.gender)==='female')await saveSection('pregnancy',payloads.pregnancy(),true);
          if(!silent)toast('تغذیه و سبک زندگی ذخیره شد.');return;
        }
        if(state.step===6)return ensurePhotoReady();
      }

      const photoSlots=['front_flex','back_flex','side'];
      function photoCards(){
        const grid=document.querySelector('#uploadGrid');
        grid.innerHTML=photoSlots.map((type,index)=>{const photo=state.photos[type];return `<article class="upload-card ${photo?'has-photo':''}" data-card="${type}">${photo?`<img src="/api/student-photos/${photo.id}" alt="${photoLabels[type]}"><div class="upload-card-overlay"><span class="upload-success">✓ ارسال شد</span><b>${photoLabels[type]}</b><button type="button" class="danger" data-delete="${type}">حذف</button></div>`:`<span class="photo-number">${index+1}</span><div class="upload-copy"><b>${photoLabels[type]}</b><small>اختیاری</small></div><button type="button" class="secondary" data-pick="${type}">انتخاب تصویر</button>`}<input hidden type="file" accept="image/jpeg,image/png,image/webp" data-file="${type}"></article>`;}).join('');
        grid.querySelectorAll('[data-pick]').forEach(button=>button.onclick=async()=>{await ensurePhotoReady();grid.querySelector(`[data-file="${button.dataset.pick}"]`).click();});
        grid.querySelectorAll('[data-file]').forEach(input=>input.onchange=()=>input.files[0]&&uploadPhoto(input.dataset.file,input.files[0]));
        grid.querySelectorAll('[data-delete]').forEach(button=>button.onclick=()=>deletePhoto(button.dataset.delete));
      }
      function uploadPhoto(type,file){
        if(file.size>5*1024*1024)return toast('حجم تصویر باید کمتر از ۵ مگابایت باشد.','error');
        const card=document.querySelector(`[data-card="${type}"]`);card?.classList.add('uploading');
        const form=new FormData();form.append('photo',file);form.append('photo_type',type);
        const xhr=new XMLHttpRequest();xhr.open('POST','/api/student/assessment/photos');xhr.withCredentials=true;
        xhr.onload=()=>{let response={};try{response=JSON.parse(xhr.responseText)}catch(error){}if(xhr.status>=200&&xhr.status<300){state.photos[type]=response.photo;photoCards();toast('تصویر با موفقیت ارسال شد.')}else{card?.classList.remove('uploading');toast(response.error||'ارسال تصویر انجام نشد.','error');}};
        xhr.onerror=()=>{card?.classList.remove('uploading');toast('ارتباط برای ارسال تصویر قطع شد.','error');};xhr.send(form);
      }
      async function deletePhoto(type){try{await api(`/api/student/assessment/photos/${state.photos[type].id}`,{method:'DELETE'});delete state.photos[type];photoCards();toast('تصویر حذف شد.');}catch(error){toast(error.message,'error');}}
      function documentList(){
        const host=document.querySelector('#documentList');
        host.innerHTML=state.documents.length?state.documents.map(document=>`<article><a href="/api/student-documents/${document.id}" target="_blank" rel="noopener"><b>${esc(document.original_filename)}</b><span>${esc(document.document_type)} • ${Math.ceil(document.size_bytes/1024)} KB</span></a><button type="button" class="danger" data-delete-document="${document.id}">حذف</button></article>`).join(''):'<div class="document-empty">هنوز مدرکی انتخاب نشده است.</div>';
        host.querySelectorAll('[data-delete-document]').forEach(button=>button.onclick=()=>deleteDocument(Number(button.dataset.deleteDocument)));
      }
      function uploadDocument(type,file){
        if(file.size>8*1024*1024)return toast('حجم فایل باید کمتر از ۸ مگابایت باشد.','error');
        const form=new FormData();form.append('file',file);form.append('document_type',type);
        const xhr=new XMLHttpRequest();xhr.open('POST','/api/student/assessment/documents');xhr.withCredentials=true;
        xhr.onload=()=>{let response={};try{response=JSON.parse(xhr.responseText)}catch(error){}if(xhr.status>=200&&xhr.status<300){state.documents.push(response.document);documentList();toast('مدرک خصوصی ارسال شد.')}else toast(response.error||'ارسال مدرک انجام نشد.','error');};xhr.send(form);
      }
      async function deleteDocument(id){try{await api(`/api/student/assessment/documents/${id}`,{method:'DELETE'});state.documents=state.documents.filter(document=>document.id!==id);documentList();}catch(error){toast(error.message,'error');}}

      function renderReview(){
        const groups=[];
        const add=(rows,label,value)=>{if(value!==undefined&&value!==null&&String(value).trim()!=='')rows.push([label,String(value).trim()]);};
        const answer=(name)=>checked(name)==='yes'?'بله':checked(name)==='no'?'خیر':'';
        const group=(title,step,rows)=>{if(rows.length)groups.push({title,step,rows});};

        const personal=[];
        add(personal,'شماره پرونده',student.case_number);
        add(personal,'نام و نام خانوادگی',field('personalName'));
        add(personal,'شماره همراه',completeMobile(field('personalMobile')));
        add(personal,'تلگرام',socialHandle('personalTelegram'));
        add(personal,'اینستاگرام',socialHandle('personalInstagram'));
        add(personal,'تاریخ تولد',(window.YasnaJalali&&document.getElementById('personalBirthDate'))?window.YasnaJalali.formatSafe(window.YasnaJalali.iso(document.getElementById('personalBirthDate'))):field('personalBirthDate'));
        add(personal,'جنسیت',checked('wizardGender')==='female'?'خانم':checked('wizardGender')==='male'?'آقا':'');
        add(personal,'محل تمرین',checked('preferredLocation')==='home'?'منزل':checked('preferredLocation')==='gym'?'باشگاه':'');
        group('اطلاعات شخصی',0,personal);

        const goal=[];add(goal,'هدف اصلی',goalLabels[field('primaryGoal')]||'');group('هدف دوره',1,goal);

        const body=[];
        for(const [id,label,unit] of measureFields)add(body,label,field(`m_${id}`)?`${field(`m_${id}`)} ${unit}`:'');
        group('اندازه‌های بدن',2,body);

        const health=[];
        add(health,'سابقه بیماری',answer('has_disease'));if(checked('has_disease')==='yes')add(health,'شرح بیماری',field('diseaseDetails'));
        add(health,'مصرف دارو',answer('has_medication'));if(checked('has_medication')==='yes')add(health,'شرح دارو',field('medicationDetails'));
        add(health,'آسیب‌دیدگی',answer('has_injury'));if(checked('has_injury')==='yes')add(health,'شرح آسیب',field('injuryDetails'));
        add(health,'سابقه جراحی',answer('has_surgery'));if(checked('has_surgery')==='yes')add(health,'شرح جراحی',field('surgeryDetails'));
        add(health,'آزمایش خون',field('bloodTestNotes'));add(health,'تمرین اصلاحی',field('correctiveNotes'));
        const selectedMedical=[...document.querySelectorAll('[name="medicalItem"]:checked')].map(input=>catalogItems[Number(input.value)]?.name).filter(Boolean).join('، ');add(health,'موارد انتخاب‌شده',selectedMedical);
        group('سوابق پزشکی',3,health);

        const training=[];
        const activity={low:'کم',medium:'متوسط',high:'زیاد'};add(training,'فعالیت روزانه',activity[field('dailyActivity')]);
        add(training,'محل تمرین',field('practicePlace')==='home'?'منزل':field('practicePlace')==='gym'?'باشگاه':'');
        add(training,'جلسات هفتگی',field('sessionsPerWeek')?`${field('sessionsPerWeek')} جلسه`:'');
        add(training,'سابقه تمرین',answer('practice_history'));if(checked('practice_history')==='yes'){add(training,'مدت سابقه',field('practiceDuration'));add(training,'رشته اصلی',field('sportDiscipline'));add(training,'شرح سابقه',field('practiceHistoryDetails'));}
        add(training,'تمرین فعلی',answer('practice_now'));if(checked('practice_now')==='yes')add(training,'شرح تمرین فعلی',field('currentPracticeDetails'));
        add(training,'مصرف مکمل',answer('supplement_history'));if(checked('supplement_history')==='yes')add(training,'شرح مکمل',field('supplementDetails'));add(training,'تجهیزات منزل',field('homeEquipment'));add(training,'سابقه دوپینگ',field('dopingHistory'));
        group('سابقه ورزشی',4,training);

        const food=[];
<<<<<<< HEAD
        const diets={iranian:'سفره ایرانی',professional:'رژیم حرفه‌ای'},appetites={normal:'معمولی و طبیعی',normal_eating:'معمولی و طبیعی',low_eating:'کم‌خوری',grazing:'ریزه‌خوری',overeating:'پرخوری',emotional_overeating:'پرخوری عصبی',anorexia:'بی‌اشتهایی عصبی'},defecation={none:'بدون مشکل',constipation:'یبوست',diarrhea:'اسهال',difficult_defecation:'دفع سخت'};
        add(food,'الگوی غذایی',diets[field('dietType')]);add(food,'وضعیت اشتها',appetites[field('appetiteStatus')]);add(food,'وضعیت دفع',defecation[field('defecationProblem')]);
=======
        const diets={none:'بدون محدودیت',no_restriction:'بدون محدودیت',vegetarian:'گیاه‌خواری',vegan:'وگان',celiac:'سلیاک',lactose_intolerance:'حساسیت به لاکتوز',gout:'نقرس',low_carb:'لوکرب',ketogenic:'کتوژنیک',fasting:'فستینگ',professional:'حرفه‌ای',competition:'مسابقه ای',iranian:'سفره ایرانی'},appetites={normal:'معمولی و طبیعی',normal_eating:'معمولی و طبیعی',low_eating:'کم‌خوری',grazing:'ریزه‌خوری',overeating:'پرخوری',emotional_overeating:'پرخوری عصبی',anorexia:'بی‌اشتهایی عصبی'},defecation={none:'بدون مشکل',constipation:'یبوست',diarrhea:'اسهال',difficult_defecation:'دفع سخت'};
        add(food,'محدودیت غذایی',diets[field('dietType')]||field('dietType'));add(food,'وضعیت اشتها',appetites[field('appetiteStatus')]);add(food,'وضعیت دفع',defecation[field('defecationProblem')]);
>>>>>>> de7f2b2 (feat(assessment): add dietary restrictions dropdown with exact options and integrate across wizard, coach review, and AI engine)
        add(food,'سابقه رژیم',answer('previous_diet'));if(checked('previous_diet')==='yes'){add(food,'مدت رژیم قبلی',field('previousDietDuration'));add(food,'نوع رژیم قبلی',field('previousDietType'));add(food,'توضیح رژیم قبلی',field('previousDietNotes'));}
        add(food,'حساسیت غذایی',field('foodAllergies'));add(food,'تغییرات وزن',field('weightChanges'));add(food,'توضیح اشتها',field('appetiteNotes'));add(food,'صبحانه',field('breakfast'));add(food,'ناهار',field('lunch'));add(food,'شام',field('dinner'));
        group('تغذیه',5,food);

        const lifestyle=[];
        add(lifestyle,'مصرف دخانیات',answer('smoking'));if(checked('smoking')==='yes')add(lifestyle,'شرح دخانیات',field('smokingDetails'));add(lifestyle,'مصرف الکل',answer('alcohol'));if(checked('alcohol')==='yes')add(lifestyle,'شرح الکل',field('alcoholDetails'));
        group('عادت‌های روزمره',5,lifestyle);

        if(checked('wizardGender')==='female'){
          const maternal=[];add(maternal,'سابقه زایمان',answer('childbirth_history'));if(checked('childbirth_history')==='yes'){add(maternal,'تعداد زایمان',field('childbirthCount'));add(maternal,'نوع زایمان',field('childbirthType'));add(maternal,'توضیحات زایمان',field('childbirthNotes'));}add(maternal,'شیردهی',answer('breastfeeding'));if(checked('breastfeeding')==='yes'){add(maternal,'سن کودک',field('childAgeMonths'));add(maternal,'توضیحات شیردهی',field('breastfeedingNotes'));}add(maternal,'مصرف شیر خشک',answer('formula_use'));if(checked('formula_use')==='yes'){add(maternal,'نوع شیر خشک',field('formulaType'));add(maternal,'مقدار شیر خشک',field('formulaAmount'));add(maternal,'دفعات شیر خشک',field('formulaFrequency'));}add(maternal,'حساسیت غذایی کودک',answer('child_food_allergy'));if(checked('child_food_allergy')==='yes')add(maternal,'شرح حساسیت کودک',field('childFoodAllergyNotes'));group('بارداری و زایمان',5,maternal);
        }

        const files=[];const photoCount=photoSlots.filter(type=>state.photos[type]).length;if(photoCount)add(files,'تصاویر بدنی',`${photoCount} تصویر`);if(state.documents.length)add(files,'مدارک خصوصی',`${state.documents.length} فایل`);group('تصاویر و مدارک',6,files);

        document.querySelector('#reviewSections').innerHTML=`<div class="review-groups">${groups.map(item=>`<section class="review-group"><header><h3>${item.title}</h3><button type="button" data-edit-step="${item.step}">ویرایش</button></header><dl>${item.rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></section>`).join('')}</div>`;
        document.querySelectorAll('[data-edit-step]').forEach(button=>button.onclick=()=>goTo(Number(button.dataset.editStep),false));
      }

      function draw(){
        showError();
        initJalaliInputs();
        document.querySelectorAll('.onboarding-step').forEach((element,index)=>element.classList.toggle('active',index===state.step));
        const percent=Math.round(((state.step+1)/steps.length)*100);
        document.querySelector('#stepCount').textContent=`مرحله ${state.step+1} از ${steps.length}`;
        document.querySelector('#stepTitle').textContent=steps[state.step].title;
        document.querySelector('#progressPercent').textContent=`${percent}٪`;
        document.querySelector('#progressValue').style.width=`${percent}%`;
        document.querySelectorAll('[data-step-dot]').forEach((dot,index)=>{dot.classList.toggle('active',index===state.step);dot.classList.toggle('done',index<state.step);dot.disabled=index>state.step;});
        document.querySelector('#prevStep').style.visibility=state.step===0?'hidden':'visible';
        document.querySelector('#saveDraft').style.display=state.step>=6?'none':'inline-flex';
        const next=document.querySelector('#nextStep');next.classList.toggle('submit',state.step===7);next.querySelector('span').textContent=state.step===7?'ارسال برای مربی':'ذخیره و ادامه';next.querySelector('b').textContent=state.step===7?'✓':'←';
        setConditional();
        if(state.step===6){photoCards();documentList();}
        if(state.step===7)renderReview();
        window.scrollTo({top:0,behavior:'smooth'});
      }
      async function goTo(step,saveFirst=true){
        if(step===state.step)return;
        if(saveFirst&&step>state.step)await saveCurrent(true);
        state.step=Math.max(0,Math.min(steps.length-1,step));draw();
      }

      document.querySelectorAll('input[type="radio"]').forEach(input=>input.addEventListener('change',()=>{setConditional();if(input.name==='wizardGender'){const pregnancyPanel=document.querySelector('[data-lifestyle-panel="pregnancy"]');if(pregnancyPanel)pregnancyPanel.hidden=input.value!=='female';}}));
      document.querySelector('#catalogSearch').addEventListener('input',event=>{const query=event.target.value.trim();document.querySelectorAll('[data-catalog-text]').forEach(item=>item.hidden=!item.dataset.catalogText.includes(query));});
      document.querySelectorAll('[data-pick-document]').forEach(button=>button.onclick=async()=>{await ensurePhotoReady();document.querySelector(`[data-document-input="${button.dataset.pickDocument}"]`).click();});
      document.querySelectorAll('[data-document-input]').forEach(input=>input.onchange=()=>input.files[0]&&uploadDocument(input.dataset.documentInput,input.files[0]));
      document.querySelector('#skipPhotos').onclick=()=>goTo(7,true).catch(error=>{showError(error.message);toast(error.message,'error');});
      document.querySelector('#prevStep').onclick=()=>goTo(state.step-1,false);
      document.querySelector('#saveDraft').onclick=()=>saveCurrent(false).catch(error=>showError(error.message));
      document.querySelector('#nextStep').onclick=async event=>{
        const button=event.currentTarget;if(button.dataset.busy==='1')return;button.dataset.busy='1';button.disabled=true;
        try{
          if(state.step===7){if(!document.querySelector('#confirmAssessment').checked)throw new Error('برای ارسال، تأیید نهایی اطلاعات را فعال کنید.');await saveSection('general',payloads.general(),true);await api('/api/student/assessment/submit',{method:'POST'});renderSuccess();return;}
          await goTo(state.step+1,true);
        }catch(error){showError(error.message);toast(error.message,'error');}
        finally{delete button.dataset.busy;if(button.isConnected)button.disabled=false;}
      };
      document.querySelectorAll('[data-step-dot]').forEach(button=>button.onclick=()=>goTo(Number(button.dataset.stepDot),false));

      function readyForAutosave(){
        if(state.step===0)return Boolean(field('personalName')&&checked('wizardGender'));
        if(state.step===1)return Boolean(field('primaryGoal'));
        if(state.step===2)return Boolean(field('m_height')&&field('m_weight'));
        if(state.step===3)return ['has_disease','has_medication','has_injury','has_surgery'].every(name=>checked(name));
        if(state.step===4)return ['practice_history','practice_now','supplement_history'].every(name=>checked(name));
        if(state.step===5){const base=['previous_diet','smoking','alcohol'].every(name=>checked(name));const female=(checked('wizardGender')||state.student.gender)==='female';return base&&(!female||['childbirth_history','breastfeeding','formula_use','child_food_allergy'].every(name=>checked(name)));}
        return false;
      }
      let autoTimer;
      document.querySelector('.onboarding-card').addEventListener('input',()=>{
        if(state.step>=6||!readyForAutosave())return;
        clearTimeout(autoTimer);
        autoTimer=setTimeout(()=>saveCurrent(true).catch(()=>{}),1400);
      });

      if(assessment.id){
        if(!(details.goals||[]).length)state.step=1;
        else if(!details.measurements)state.step=2;
        else if(!details.medical)state.step=3;
        else if(!details.sports)state.step=4;
        else if(!details.nutrition||!details.habits||(student.gender==='female'&&!details.pregnancy))state.step=5;
        else state.step=7;
      }
      draw();
    }
  };
})();
