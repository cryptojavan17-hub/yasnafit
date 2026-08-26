(() => {
  const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const genHash = () => Math.random().toString(36).substring(2,10) + Date.now().toString(36);
  
  let currentProgram = null;
  let exerciseCategories = [];
  let selectedSystemForAdd = null;
  let assessmentContext = null;
  let dirty = false;

  const goalLabels={weight_loss:'کاهش وزن',weight_gain:'افزایش وزن',fitness:'فیتنس',maintenance:'تثبیت وزن',muscle_gain:'عضله‌سازی',fat_loss:'چربی‌سوزی',competition:'آمادگی مسابقه'};

  // کاتالوگ سیستم‌های تمرینی (BR-14 — لیست کانونی ۱۲گانه مالک)
  // idهای ۱-۵ تاریخی و دست‌نخورده؛ idهای ۶-۱۲ جدید. ترتیب = ترتیب نمایش مالک.
  const systemTypes = [
    { id: 1,  label: 'معمولی',                  type: 'normal',          movements: 1, icon: '1️⃣' },
    { id: 6,  label: 'سیستم تمرینی رست پاز',    type: 'rest_pause',      movements: 1, icon: '⏸️' },
    { id: 5,  label: 'سیستم تمرینی دراپ ست',    type: 'drop',            movements: 1, icon: '📉' },
    { id: 7,  label: 'سیستم تمرینی پس خستگی',   type: 'post_exhaustion', movements: 1, icon: '🧯' },
    { id: 8,  label: 'سیستم تمرینی FST7',       type: 'fst7',            movements: 1, icon: '7️⃣' },
    { id: 9,  label: 'سیستم تمرینی ۲۱',         type: 'twenty_one',      movements: 1, icon: '🔢' },
    { id: 2,  label: 'سیستم تمرینی سوپر ست',    type: 'superset',        movements: 2, icon: '⚡' },
    { id: 10, label: 'سیستم تمرینی تکرار نیمه', type: 'partial_reps',    movements: 2, icon: '✂️' },
    { id: 3,  label: 'سیستم تمرینی تری ست',     type: 'triset',          movements: 3, icon: '🔺' },
    { id: 11, label: 'سیستم تمرینی ۲۰-۱۰-۵',    type: 'ladder_20_10_5',  movements: 3, icon: '🪜' },
    { id: 4,  label: 'سیستم تمرینی جاينت ست',   type: 'giant',           movements: 4, icon: '🔥' },
    { id: 12, label: 'سیستم تمرینی ماموت ست',   type: 'mammoth',         movements: 5, icon: '🦣' },
  ];
  const systemById = id => systemTypes.find(t=>t.id===Number(id));
  const systemRequired = sys => (systemById(sys?.exercise_system_id)||systemById(1)).movements;

  const setUnits = [
    { id: 'REPEAT', label: 'تکرار' },
    { id: 'TIME', label: 'ثانیه' },
    { id: 'MINUTE', label: 'دقیقه' },
    { id: 'DROPSET', label: 'دراپ ست' },
    { id: 'FAILURE', label: 'ماکسیمم توان' },
  ];

  // کاتالوگ عضلات هدف و تصاویر Overlay منطبق بر مدل‌های 3D
  const muscleCatalog = [
    // Front
    { id: 'front_deltoid_anterior', label: 'دلتوئید قدامی (سرشانه جلو)', side: 'front', file: 'front_deltoid_anterior.webp', cat: ['shoulders'] },
    { id: 'front_deltoid_lateral', label: 'دلتوئید جانبی (سرشانه میانی)', side: 'front', file: 'front_deltoid_lateral.webp', cat: ['shoulders'] },
    { id: 'front_chest', label: 'سینه (پکتورالیس)', side: 'front', file: 'front_chest.webp', cat: ['chest'] },
    { id: 'front_biceps', label: 'جلو بازو (دوسر بازویی)', side: 'front', file: 'front_biceps.webp', cat: ['biceps'] },
    { id: 'front_brachialis', label: 'براکیالیس', side: 'front', file: 'front_brachialis.webp', cat: ['biceps', 'forearms'] },
    { id: 'front_brachioradialis', label: 'ساعد (براکیورادیالیس)', side: 'front', file: 'front_brachioradialis.webp', cat: ['forearms'] },
    { id: 'front_rectus_abdominis', label: 'راست شکمی (سیکس‌پک)', side: 'front', file: 'front_rectus_abdominis.webp', cat: ['abs'] },
    { id: 'front_obliques', label: 'مورب شکمی (پهلو)', side: 'front', file: 'front_obliques.webp', cat: ['abs'] },
    { id: 'front_serratus_anterior', label: 'دندانه‌ای قدامی', side: 'front', file: 'front_serratus_anterior.webp', cat: ['abs', 'chest'] },
    { id: 'front_quadriceps', label: 'چهارسر ران (جلو پا)', side: 'front', file: 'front_quadriceps.webp', cat: ['legs'] },
    { id: 'front_iliopsoas', label: 'ایلیوپسواس (عضلات ران)', side: 'front', file: 'front_iliopsoas.webp', cat: ['legs', 'abs'] },

    // Back
    { id: 'back_trapezius', label: 'کول (ذوزنقه‌ای)', side: 'back', file: 'back_trapezius.webp', cat: ['traps', 'back'] },
    { id: 'back_latissimus_dorsi', label: 'زیربغل (پشتی بزرگ)', side: 'back', file: 'back_latissimus_dorsi.webp', cat: ['back', 'lats'] },
    { id: 'back_triceps', label: 'پشت بازو (سه‌سر بازویی)', side: 'back', file: 'back_triceps.webp', cat: ['triceps'] },
    { id: 'back_teres_major', label: 'گرد بزرگ (Teres Major)', side: 'back', file: 'back_teres_major.webp', cat: ['back'] },
    { id: 'back_teres_minor', label: 'گرد کوچک (Teres Minor)', side: 'back', file: 'back_teres_minor.webp', cat: ['back', 'shoulders'] },
    { id: 'back_infraspinatus', label: 'تحت‌خاری (Infraspinatus)', side: 'back', file: 'back_infraspinatus.webp', cat: ['back', 'shoulders'] },
    { id: 'back_gluteus_maximus', label: 'باسن (سرینی بزرگ)', side: 'back', file: 'back_gluteus_maximus.webp', cat: ['legs'] },
    { id: 'back_hamstrings', label: 'همسترینگ (پشت پا)', side: 'back', file: 'back_hamstrings.webp', cat: ['legs'] },
    { id: 'back_gastrocnemius', label: 'ساق پا (دوقلو)', side: 'back', file: 'back_gastrocnemius.webp', cat: ['legs', 'calves'] },
    { id: 'back_soleus', label: 'نعلی ساق (Soleus)', side: 'back', file: 'back_soleus.webp', cat: ['legs', 'calves'] }
  ];

  function getAutoMusclesForMovement(mov){
    if(mov.target_muscles && Array.isArray(mov.target_muscles) && mov.target_muscles.length > 0){
      return mov.target_muscles;
    }
    const det = mov._detail || {};
    const cat = String(det.category_id || det.category || '').toLowerCase();
    const name = String(mov.nameFa || mov.name || '').toLowerCase();

    if (cat === 'chest' || name.includes('سینه')) return ['front_chest'];
    if (cat === 'shoulders' || name.includes('سرشانه') || name.includes('نشر') || name.includes('دلتوئید')) {
      if (name.includes('خلفی') || name.includes('پشت')) return ['back_infraspinatus', 'back_teres_minor'];
      if (name.includes('بغل') || name.includes('جانبی')) return ['front_deltoid_lateral'];
      return ['front_deltoid_anterior', 'front_deltoid_lateral'];
    }
    if (cat === 'biceps' || name.includes('جلو بازو')) return ['front_biceps'];
    if (cat === 'triceps' || name.includes('پشت بازو')) return ['back_triceps'];
    if (cat === 'back' || cat === 'lats' || name.includes('زیربغل') || name.includes('لت') || name.includes('قایقی')) return ['back_latissimus_dorsi'];
    if (cat === 'traps' || name.includes('کول') || name.includes('شراگ')) return ['back_trapezius'];
    if (cat === 'abs' || name.includes('شکم') || name.includes('کرانچ')) {
      if (name.includes('پهلو') || name.includes('مورب')) return ['front_obliques'];
      return ['front_rectus_abdominis'];
    }
    if (cat === 'legs' || name.includes('پا') || name.includes('اسکوات')) {
      if (name.includes('پشت پا') || name.includes('همسترینگ') || name.includes('ددلیفت')) return ['back_hamstrings'];
      if (name.includes('باسن') || name.includes('سرینی') || name.includes('هیپ')) return ['back_gluteus_maximus'];
      if (name.includes('ساق')) return ['back_gastrocnemius', 'back_soleus'];
      return ['front_quadriceps'];
    }
    if (cat === 'forearms' || name.includes('ساعد') || name.includes('مچ')) return ['front_brachioradialis'];
    return ['front_chest'];
  }

  // کاتالوگ ست‌های پیشنهادی
  const setPresets = [
    {
      label: '۴ * ۱۰',
      spec: [
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 10 }
      ]
    },
    {
      label: '۳ * ۸',
      spec: [
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 }
      ]
    },
    {
      label: '۴ * ۱۵',
      spec: [
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 }
      ]
    },
    {
      label: '۱۲ | ۱۰ | ۸',
      spec: [
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 8 }
      ]
    },
    {
      label: '۲ * ۱۵ | ۱۵ | ۱۵ ثانیه',
      spec: [
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 },
        { type: 'TIME', count: 15 }
      ]
    },
    {
      label: '۱۲ | ۱۰ | ۸ | ۶',
      spec: [
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 6 }
      ]
    },
    {
      label: '۶ | ۸ | ۱۰ | ۱۲',
      spec: [
        { type: 'REPEAT', count: 6 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 12 }
      ]
    },
    {
      label: '۳ * ۹ | ۱۱',
      spec: [
        { type: 'REPEAT', count: 9 },
        { type: 'REPEAT', count: 9 },
        { type: 'REPEAT', count: 9 },
        { type: 'REPEAT', count: 11 }
      ]
    },
    {
      label: '۳ * ۸ | ماکسیمم توان',
      spec: [
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 },
        { type: 'FAILURE', count: null }
      ]
    },
    {
      label: '۳ * ۱۲ | ماکسیمم توان',
      spec: [
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 12 },
        { type: 'FAILURE', count: null }
      ]
    },
    {
      label: '۸ | ۱۰ | ۱۲ | ماکسیمم توان',
      spec: [
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 10 },
        { type: 'REPEAT', count: 12 },
        { type: 'FAILURE', count: null }
      ]
    },
    {
      label: '۲۵ | ۲ * ۸ | ۲ * ۱۲',
      spec: [
        { type: 'REPEAT', count: 25 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 12 }
      ]
    },
    {
      label: '۲۵ | ۳ * ۱۵',
      spec: [
        { type: 'REPEAT', count: 25 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 }
      ]
    },
    {
      label: '۲ * ۸ | ۲ * ۱۲',
      spec: [
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 8 },
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 12 }
      ]
    },
    {
      label: '۲ * ۱۲ | ۲ * ۱۵',
      spec: [
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 12 },
        { type: 'REPEAT', count: 15 },
        { type: 'REPEAT', count: 15 }
      ]
    }
  ];

  const levels = [
    { id: 'Beginner', label: 'مبتدی' },
    { id: 'Professional', label: 'حرفه‌ای' },
  ];

  const locations = [
    { id: 'Gym', label: 'باشگاه' },
    { id: 'Home', label: 'منزل' },
  ];

  const injuries = [
    { id: 'None', label: 'بدون آسیب' },
    { id: 'Injury', label: 'آسیبی (زانو/کمر)' },
  ];

  async function api(url, opt={}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'خطا');
    return d;
  }

  function createEmptyProgram() {
    const todayISO = new Date().toISOString().split('T')[0];
    const endISO = window.YasnaJalali?.addMonths ? window.YasnaJalali.addMonths(todayISO, 1) : new Date(Date.now()+30*24*3600*1000).toISOString().split('T')[0];
    return {
      title: 'برنامه تمرینی جدید',
      coach_note: '',
      start_date: todayISO,
      end_date: endISO,
      status: 'DRAFT',
      student_id: null,
      assessment_id: null,
      version: 2,
      days: [
        {
          day_number: 1,
          dayHash: genHash(),
          focus: '',
          coachNote: '',
          isRestDay: false,
          data: [
            {
              exercise_system_id: 1,
              exerciseSystemHash: genHash(),
              system_type: 'normal',
              movement_list: []
            }
          ]
        }
      ]
    };
  }

  function calculateVolume(program){
    let totalSets=0, totalMovs=0;
    (program.days||[]).forEach(day=>{
      if(day.isRestDay) return;
      (day.data||[]).forEach(sys=>{
        totalMovs += (sys.movement_list||[]).length;
        (sys.movement_list||[]).forEach(mov=>{
          totalSets += (mov.sets||[]).length;
        });
      });
    });
    return {totalSets, totalMovs, totalDays: program.days?.length||0};
  }

  let activeDayIdx=0;
  const expandedMovements={};
  function setDirty(value){ dirty=value; refreshDirtyUI(); }
  function refreshDirtyUI(){
    const badge=document.getElementById('dirtyBadge'),inline=document.getElementById('dirtyInline');
    if(badge)badge.hidden=!dirty;
    if(inline)inline.hidden=!dirty;
  }
  function closeAllMenus(){
    document.querySelectorAll('.builder-menu').forEach(menu=>{
      menu.hidden=true;
      menu.style.position='';menu.style.top='';menu.style.left='';menu.style.zIndex='';
      if(menu.parentElement===document.body&&menu._builderWrap)menu._builderWrap.appendChild(menu);
    });
  }
  let pickerDayIdx=null;
  function mountSystemPicker(){
    const picker=document.getElementById('systemPicker');
    if(!picker)return null;
    if(picker.parentElement!==document.body)document.body.appendChild(picker);
    return picker;
  }
  function openSystemPicker(dayIdx){
    const picker=mountSystemPicker();
    if(!picker)return;
    pickerDayIdx=dayIdx;
    const grid=picker.querySelector('#systemPickerGrid');
    if(grid){
      const counts=[...new Set(systemTypes.map(t=>t.movements))].sort((a,b)=>a-b);
      grid.innerHTML=counts.map(count=>`
        <div class="picker-group">
          <div class="picker-group-title">شامل ${count.toLocaleString('fa-IR')} حرکت</div>
          ${systemTypes.filter(t=>t.movements===count).map(t=>`
            <button type="button" class="picker-system" data-pick-system="${t.id}">
              <span class="picker-icon" aria-hidden="true">${t.icon}</span>
              <b>${esc(t.label)}</b>
              <small>${t.movements.toLocaleString('fa-IR')} حرکت</small>
            </button>`).join('')}
        </div>`).join('');
      grid.querySelectorAll('[data-pick-system]').forEach(btn=>{
        btn.onclick=()=>{
          const meta=systemById(btn.dataset.pickSystem);
          if(pickerDayIdx==null||!meta)return;
          currentProgram.days[pickerDayIdx].data.push({
            exercise_system_id: meta.id,
            exerciseSystemHash: genHash(),
            system_type: meta.type,
            movement_list: []
          });
          closeSystemPicker();
          setDirty(true);
          renderDays();
        };
      });
    }
    picker.hidden=false;
  }
  function closeSystemPicker(){const picker=document.getElementById('systemPicker');if(picker)picker.hidden=true;pickerDayIdx=null;}
  function toggleBuilderMenu(button){
    const wrap=button.closest('.builder-menu-wrap');
    let menu=wrap?wrap.querySelector('.builder-menu'):null;
    if(!menu)menu=document.querySelector('body > .builder-menu');
    if(!menu)return;
    const willOpen=menu.hidden;
    closeAllMenus();
    if(!willOpen)return;
    // پورتال به body + مختصات ثابت: منو هرگز زیر بلوک‌ها گیر نمی‌کند
    menu._builderWrap=wrap||menu.parentElement;
    document.body.appendChild(menu);
    menu.hidden=false;
    const r=button.getBoundingClientRect();
    const vw=window.innerWidth||1024,vh=window.innerHeight||768;
    const mw=menu.offsetWidth||216,mh=menu.offsetHeight||170;
    let top=r.bottom+6,left=r.left;
    if(top+mh>vh-8)top=Math.max(8,r.top-mh-6);
    if(left+mw>vw-8)left=vw-mw-8;
    if(left<8)left=8;
    menu.style.position='fixed';menu.style.top=top+'px';menu.style.left=left+'px';menu.style.zIndex='95';
  }
  function movementSummary(mov){
    const sets=mov.sets||[];
    const reps=sets.reduce((sum,set)=>sum+(Number(set.count)||0),0);
    const rests=(sets.map(set=>Number(set.restSeconds)||0)).filter(Boolean);
    const avgRest=rests.length?Math.round(rests.reduce((a,b)=>a+b,0)/rests.length):0;
    return `${sets.length.toLocaleString('fa-IR')} ست${reps?` • ${reps.toLocaleString('fa-IR')} تکرار`:''}${avgRest?` • استراحت ~${avgRest.toLocaleString('fa-IR')} ثانیه`:''}`;
  }
  function updateTopbar(){
    const titleEl=document.getElementById('topbarTitle');
    if(titleEl)titleEl.textContent=currentProgram?.title||'برنامه جدید';
    const sub=document.getElementById('topbarSub');
    if(sub){
      const vol=currentProgram?calculateVolume(currentProgram):{totalSets:0,totalMovs:0,totalDays:0};
      const select=document.getElementById('progStudent');
      let studentLabel='';
      if(select&&select.selectedOptions&&select.selectedOptions[0]&&select.value)studentLabel=(select.selectedOptions[0].textContent.split(' • ')[1]||'').trim();
      sub.textContent=`${vol.totalDays.toLocaleString('fa-IR')} روز • ${vol.totalMovs.toLocaleString('fa-IR')} حرکت • ${vol.totalSets.toLocaleString('fa-IR')} ست${studentLabel?` • برای: ${studentLabel}`:''}${currentProgram?.version?` • نسخه ${currentProgram.version}`:''}`;
    }
  }

  function root() {
    const vol = currentProgram ? calculateVolume(currentProgram) : {totalSets:0, totalMovs:0, totalDays:0};
    return `
    <div class="program-builder">
      <div class="builder-topbar">
        <div class="topbar-id">
          <p class="eyebrow">🏋️ ساخت برنامه تمرینی</p>
          <h2 class="topbar-title" id="topbarTitle">${esc(currentProgram?.title||'برنامه جدید')}</h2>
          <small class="topbar-sub" id="topbarSub">${vol.totalDays} روز • ${vol.totalMovs} حرکت • ${vol.totalSets} ست</small>
        </div>
        <span class="dirty-badge" id="dirtyBadge" hidden>⚠️ تغییرات ذخیره نشده</span>
        <div class="topbar-actions">
          <button class="btn btn-secondary btn-small" onclick="history.back()">← بازگشت</button>
        </div>
      </div>

      <div id="assessmentContext"></div>

      <details class="panel-section" id="programInfoPanel">
        <summary>
          <span class="section-num">۱</span>
          <span class="section-titles"><b>مشخصات برنامه و شاگرد</b><small>عنوان، شاگرد، سطح، هدف، آسیب‌دیدگی و بازه زمانی</small></span>
          <i class="chev" aria-hidden="true">⌄</i>
        </summary>
        <div class="builder-form">
          <div class="form-row">
            <label>عنوان برنامه *
              <input id="progTitle" placeholder="مثلاً برنامه چربی‌سوزی شهریور - ماه اول">
            </label>
            <label>شاگرد
              <select id="progStudent"><option value="">بدون شاگرد</option></select>
            </label>
          </div>
          <div class="form-row">
            <label>سطح تمرین
              <select id="progLevel">
                ${levels.map(l=>`<option value="${l.id}">${l.label}</option>`).join('')}
              </select>
            </label>
            <label>محل تمرین
              <select id="progLocation">
                ${locations.map(l=>`<option value="${l.id}">${l.label}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="form-row">
            <label>هدف اصلی
              <select id="progTarget">${Object.entries(goalLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select>
            </label>
            <label>وضعیت آسیب
              <select id="progInjury">
                ${injuries.map(i=>`<option value="${i.id}">${i.label}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="form-row">
            <label>تاریخ شروع
              <input type="text" id="progStart" data-jalali placeholder="مثلاً ۱۴۰۵/۰۶/۰۲">
            </label>
            <label>تاریخ پایان
              <input type="text" id="progEnd" data-jalali placeholder="مثلاً ۱۴۰۵/۰۷/۰۱">
            </label>
          </div>
          <div class="form-row full">
            <label>توضیحات مربی
              <textarea id="progNote" placeholder="توضیحات کلی برنامه، نکات تغذیه، استراحت..."></textarea>
            </label>
          </div>
        </div>
      </details>

      <section class="panel-section days-section">
        <header class="days-section-head">
          <span class="section-num">۲</span>
          <div><b>روزهای تمرین</b><small id="daysSummary"></small></div>
        </header>
        <div class="day-chips">
          <div class="chips-scroll" id="dayChipsList"></div>
          <button class="day-chip add-chip" id="btnAddDay" type="button" title="افزودن روز تمرینی جدید">＋ روز تمرینی</button>
          <button class="day-chip add-chip ghost" id="btnAddRestDay" type="button" title="افزودن روز استراحت">🌙 روز استراحت</button>
          <button class="day-chip add-chip ghost" id="btnCopyLastDay" type="button" title="کپی کامل آخرین روز به انتهای برنامه">📋 کپی آخرین روز</button>
        </div>
        <div class="days-container" id="daysContainer"></div>
      </section>

      <div class="bottom-toolbar">
        <span class="dirty-inline" id="dirtyInline" hidden>⚠️ ذخیره نشده</span>
        <span class="volume-badge" id="volBadge">${vol.totalSets} ست • ${vol.totalMovs} حرکت • ${vol.totalDays} روز</span>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="btnExportPDF" type="button" title="پیش‌نمایش و چاپ نسخه PDF">📄 خروجی PDF</button>
        <button class="btn btn-secondary" id="btnSaveReturn">💾 ذخیره و بازگشت</button>
        <button class="btn btn-primary" id="btnSave">💾 ذخیره پیش‌نویس</button>
        <button class="btn btn-assign" id="btnAssign">✅ ذخیره و اختصاص به شاگرد</button>
        <div class="builder-menu-wrap">
          <button class="btn-icon" id="moreMenuBtn" type="button" data-menu title="ابزارهای بیشتر">⋮</button>
          <div class="builder-menu" id="moreMenu" hidden>
            <button type="button" id="btnMenuAi">🤖 دستیار هوشمند هوش مصنوعی (AI)</button>
            <button type="button" id="btnMenuPDF">📄 خروجی و چاپ PDF</button>
            <button type="button" id="btnPreview">👁 پیش‌نمایش JSON</button>
            <button type="button" id="btnStats">📈 آمار برنامه</button>
            <button type="button" id="btnList">📋 لیست برنامه‌ها</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Training-system picker (12 systems — BR-14) -->
    <div class="system-picker" id="systemPicker" hidden>
      <div class="system-picker-backdrop" id="systemPickerBackdrop"></div>
      <div class="system-picker-panel" role="dialog" aria-modal="true" aria-label="انتخاب سیستم تمرینی">
        <header>
          <h3>انتخاب سیستم تمرینی</h3>
          <button class="btn-icon" id="closeSystemPicker" type="button" title="بستن">×</button>
        </header>
        <p class="picker-hint">هر سیستم تعداد حرکت مشخصی لازم دارد — بعد از انتخاب، «افزودن حرکات تمرینی» ظاهر می‌شود.</p>
        <div class="system-picker-grid" id="systemPickerGrid"></div>
      </div>
    </div>

    <!-- ویرایش حرکت: مودال تنظیم ست‌ها + آموزش (فیلم/عضله) -->
    <div class="mv-modal" id="movementModal" hidden>
      <div class="mv-backdrop" id="mvBackdrop"></div>
      <div class="mv-panel" role="dialog" aria-modal="true" aria-label="ویرایش حرکت">
        <header class="mv-head">
          <button class="btn btn-secondary btn-small" id="mvBack" type="button">→ برگشت</button>
          <span class="mv-chip" id="mvSystemChip">—</span>
          <h3 class="mv-title" id="mvTitle">ویرایش حرکت</h3>
          <button class="btn-icon" id="mvCloseX" type="button" title="بستن">×</button>
        </header>
        <div class="mv-body" id="mvBody"></div>
        <footer class="mv-foot">
          <button class="btn mv-confirm" id="mvConfirm" type="button">تایید</button>
          <button class="mv-text-danger" id="mvClose" type="button">بستن</button>
        </footer>
      </div>
    </div>

    <!-- Dedicated exercise-bank drawer -->
    <div class="drawer" id="exerciseDrawer">
      <div class="drawer-backdrop" id="drawerBackdrop"></div>
      <div class="drawer-panel">
        <div class="drawer-header">
          <div class="drawer-header-titles">
            <h3 id="drawerTitle">بانک حرکات تمرینی</h3>
            <div class="drawer-context" id="drawerContext" hidden></div>
          </div>
          <div class="drawer-header-actions">
            <button class="btn btn-primary btn-small" id="drawerDone" type="button" hidden>اتمام و بستن</button>
            <button class="btn-icon" id="closeDrawer" title="بستن">×</button>
          </div>
        </div>
        <div id="drawerTabAdd" style="display:flex">
          <div class="drawer-bank-flow">
            <section class="drawer-bank-step active" id="drawerLocationStep">
              <header><span>۱</span><div><b>محل تمرین</b><small>ابتدا یکی را انتخاب کنید</small></div></header>
              <div class="drawer-location-options"><button type="button" data-bank-location="gym">باشگاه</button><button type="button" data-bank-location="home">منزل</button></div>
              <div class="drawer-global-search"><input id="drawerGlobalSearch" placeholder="🔍 جستجوی حرکت در همه محل‌ها…" autocomplete="off"></div>
            </section>
            <section class="drawer-bank-step locked" id="drawerFilterStep" hidden>
              <header><span>۲</span><div><b>پیدا کردن حرکت</b><small>جستجو یا انتخاب دسته‌بندی</small></div></header>
              <div class="drawer-filter-accordion drawer-category-bar">
                <select id="drawerCategorySelect" data-cat-summary aria-label="دسته‌بندی حرکت"></select>
              </div>
              <div class="drawer-filter-accordion drawer-subchips" id="drawerSubChips"></div>
              <div class="drawer-filter-accordion drawer-tools">
                <div class="drawer-search"><input id="drawerSearch" placeholder="جستجوی حرکت…" autocomplete="off"></div>
                <button class="btn btn-secondary btn-small" id="drawerManualToggle" type="button" title="افزودن حرکت دلخواه به بانک">＋ افزودن حرکت دستی</button>
              </div>
            </section>
          </div>
          <div class="drawer-quickadd" id="drawerQuickAdd" hidden>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <b style="font-size:11px;color:var(--accent-hover);">＋ افزودن حرکت دستی به بانک</b>
              <button type="button" class="btn-icon" id="quickAddCloseX" style="width:24px;height:24px;font-size:14px;" title="بستن">×</button>
            </div>
            <div class="quickadd-grid">
              <input id="quickAddName" placeholder="نام حرکت (فارسی) *" maxlength="120">
              <select id="quickAddLocation">
                <option value="gym">باشگاه</option>
                <option value="home">منزل</option>
                <option value="both">همه محل‌ها</option>
              </select>
              <select id="quickAddCategory"></select>
            </div>
            <div class="quickadd-muscles-row" style="margin-top:4px;display:flex;flex-direction:column;gap:5px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                <span style="font-size:10px;color:var(--text-secondary);font-weight:700;">عضله‌های هدف درگیر:</span>
                <select id="quickAddMuscleSelect" style="min-height:30px;padding:3px 8px;font-size:10px;border-radius:6px;border:1px solid var(--border);background:var(--surface-3);color:var(--text);">
                  <option value="">＋ انتخاب و افزودن عضله...</option>
                  <optgroup label="عضلات جلو">
                    ${muscleCatalog.filter(m=>m.side==='front').map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}
                  </optgroup>
                  <optgroup label="عضلات پشت">
                    ${muscleCatalog.filter(m=>m.side==='back').map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}
                  </optgroup>
                </select>
              </div>
              <div class="quickadd-muscle-chips" id="quickAddMuscleChips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:22px;"></div>
            </div>
            <div class="quickadd-actions" style="margin-top:2px;">
              <span class="quickadd-hint">عضله‌های درگیر را با ＋ انتخاب کنید.</span>
              <button class="btn btn-primary btn-small" id="quickAddSubmit" type="button" style="min-height:32px;padding:5px 14px;font-weight:800;">ثبت حرکت</button>
            </div>
          </div>
          <div class="drawer-list" id="drawerList"><div class="drawer-guidance">ابتدا محل تمرین را انتخاب کنید.</div></div>
        </div>
      </div>
    </div>
    `;
  }

  function renderDays() {
    const chipsHost=document.getElementById('dayChipsList');
    const host = document.getElementById('daysContainer');
    if(!host) return;
    const days = currentProgram.days || [];
    if(activeDayIdx<0||activeDayIdx>=days.length)activeDayIdx=Math.max(0,days.length-1);
    if(chipsHost){
      chipsHost.innerHTML = days.map((day,idx)=>`
        <button type="button" class="day-chip ${idx===activeDayIdx?'active':''} ${day.isRestDay?'rest':''}" data-day-chip="${idx}">
          <b>روز ${day.day_number.toLocaleString('fa-IR')}</b>
          <small>${day.isRestDay?'🌙 استراحت':esc(day.focus||'بدون تمرکز')}</small>
        </button>`).join('');
    }
    const summary=document.getElementById('daysSummary');
    if(summary)summary.textContent=days.length?`${days.length.toLocaleString('fa-IR')} روز در برنامه`:'هنوز روزی اضافه نشده';

    if(days.length===0){
      host.innerHTML = `<div class="empty-day"><p>هنوز روزی اضافه نشده. با دکمه «＋ روز تمرینی» اولین روز را بسازید.</p></div>`;
      updateVolume();updateTopbar();
      return;
    }

    const dayIdx=activeDayIdx, day=days[dayIdx];
    const isRest = day.isRestDay;
    const vol = {movs:0, sets:0};
    (day.data||[]).forEach(sys=>{ vol.movs += (sys.movement_list||[]).length; (sys.movement_list||[]).forEach(m=> vol.sets += (m.sets||[]).length); });

    host.innerHTML = `
      <div class="day-card active-day" data-day-idx="${dayIdx}">
        <div class="day-header">
          <div class="day-header-title-group">
            <span class="day-number">${day.day_number.toLocaleString('fa-IR')}</span>
            <span class="day-label">روز ${day.day_number.toLocaleString('fa-IR')} —</span>
            ${isRest ? `<span class="day-rest-title">استراحت 🌙</span>` : `
              <input type="text" class="day-focus-input" data-focus="${dayIdx}" value="${esc(day.focus||'')}" placeholder="عنوان روز تمرین (مثلاً زیربغل و پشت بازو)…" title="عنوان روز تمرین">
            `}
            <small class="day-vol">${vol.movs.toLocaleString('fa-IR')} حرکت • ${vol.sets.toLocaleString('fa-IR')} ست</small>
          </div>
          <div class="day-actions">
            <label class="rest-toggle"><input type="checkbox" data-rest="${dayIdx}" ${isRest?'checked':''}> 🌙 روز استراحت</label>
            <div class="builder-menu-wrap">
              <button class="btn btn-secondary btn-small" type="button" data-menu title="تنظیمات این روز">⚙️ تنظیمات روز</button>
              <div class="builder-menu" hidden>
                <button type="button" data-copy-day="${dayIdx}">📋 کپی این روز</button>
                <button type="button" data-move-day-up="${dayIdx}" ${dayIdx===0?'disabled':''}>⬆️ انتقال روز به بالا</button>
                <button type="button" data-move-day-down="${dayIdx}" ${dayIdx===days.length-1?'disabled':''}>⬇️ انتقال روز به پایین</button>
                <div class="menu-sep"></div>
                <button type="button" class="menu-danger" data-del-day="${dayIdx}">🗑 حذف روز ${day.day_number.toLocaleString('fa-IR')}</button>
              </div>
            </div>
          </div>
        </div>
        ${isRest ? `<div style="padding:20px;text-align:center;color:var(--text-muted)">🌙 روز استراحت - ریکاوری و تغذیه • ${esc(day.coachNote||'')}</div>` : `
        <div class="day-body">
          <div class="systems-list">
            ${(day.data||[]).map((sys, sysIdx) => {
              const sysMeta=systemById(sys.exercise_system_id)||systemById(1);
              const sysMovs=(sys.movement_list||[]).length;
              const remaining=sysMeta.movements-sysMovs;
              const full=remaining<=0;
              return `
              <div class="system-card" data-sys-idx="${sysIdx}" data-day-idx="${dayIdx}">
                <div class="movements-list">
                  ${sysMovs===0 ? `<div class="empty-system">این سیستم به ${sysMeta.movements.toLocaleString('fa-IR')} حرکت نیاز دارد — «افزودن حرکات تمرینی» را بزنید.</div>` : ''}
                  ${(sys.movement_list||[]).map((mov, movIdx) => {
                    const movKey=`${dayIdx}-${sysIdx}-${movIdx}`;
                    const isExpanded=expandedMovements[movKey]===true;
                    return `
                  <div class="movement-card" data-mov-idx="${movIdx}" data-sys-idx="${sysIdx}" data-day-idx="${dayIdx}">
                    <div class="movement-summary-row">
                      <div class="movement-image">
                        <img src="${esc((mov.image_path&&mov.image_path.trim())?mov.image_path:(mov.original_exercise_id?`/api/exercise-image/${mov.original_exercise_id}`:'/assets/images/blank-white.svg'))}" alt="" onerror="this.src='/assets/images/blank-white.svg'" loading="lazy">
                      </div>
                      <button type="button" class="movement-head" data-edit-mov="${movKey}" title="ویرایش حرکت و ست‌ها">
                        <div class="mov-name-group">
                          <span class="mov-name-title">نام حرکت: <b>${esc(mov.nameFa||mov.name||'حرکت بدون نام')}</b></span>
                        </div>
                        <div class="mov-system-group">
                          <span class="mov-system-pill">${sysMeta.icon} ${esc(sysMeta.label)}</span>
                        </div>
                        <div class="mov-spacer"></div>
                        <div class="mov-set-boxes">
                          ${(mov.sets||[]).map((st, sIdx)=>{
                            let unitLabel = 'تکرار';
                            if(st.type === 'TIME') unitLabel = 'ثانیه';
                            else if(st.type === 'MINUTE') unitLabel = 'دقیقه';
                            else if(st.type === 'DROPSET') unitLabel = 'دراپ';
                            else if(st.type === 'FAILURE') unitLabel = 'توان';
                            const val = st.type === 'FAILURE' ? 'MAX' : (st.count ?? '—');
                            return `
                              <div class="mov-set-sq" title="ست ${(sIdx+1).toLocaleString('fa-IR')}: ${esc(String(st.count??''))} ${unitLabel}">
                                <span class="mov-set-sq-val">${esc(String(val))}</span>
                                <span class="mov-set-sq-unit">${unitLabel}</span>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      </button>
                      <div class="builder-menu-wrap">
                        <button class="btn-icon" type="button" data-menu title="عملیات حرکت">⋮</button>
                        <div class="builder-menu" hidden>
                          <button type="button" data-edit-mov="${movKey}">✏️ ویرایش حرکت و ست‌ها</button>
                          <button type="button" data-move-mov-up="${movKey}">⬆️ انتقال حرکت به بالا</button>
                          <button type="button" data-move-mov-down="${movKey}">⬇️ انتقال حرکت به پایین</button>
                          <div class="menu-sep"></div>
                          <button type="button" class="menu-danger" data-del-mov="${movKey}">🗑 حذف حرکت</button>
                          <button type="button" class="menu-danger" data-del-sys="${dayIdx}-${sysIdx}">🗑 حذف کل سیستم</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  `;}).join('')}
                  ${full?'':`<div class="add-movement-bar">
                        <button class="btn btn-primary btn-small" data-add-mov="${dayIdx}-${sysIdx}">＋ افزودن حرکات تمرینی</button>
                      </div>`}
                </div>
              </div>
              `;}).join('')}
            <button class="btn btn-secondary btn-small" data-add-sys="${dayIdx}">＋ افزودن سیستم تمرینی</button>
          </div>
        </div>
        `}
      </div>
    `;

    bindDayEvents();
    updateVolume();
    updateTopbar();
  }

  function updateVolume(){
    const vol = calculateVolume(currentProgram);
    const badge = document.getElementById('volBadge');
    if(badge) badge.textContent = `${vol.totalSets} ست • ${vol.totalMovs} حرکت • ${vol.totalDays} روز`;
    // Warning for high volume
    if(vol.totalSets > 100){
      if(!document.getElementById('volWarning')){
        const bar=document.querySelector('.bottom-toolbar');
        if(bar){
          const warn=document.createElement('span');
          warn.id='volWarning';
          warn.className='volume-badge vol-warning';
          warn.textContent=`⚠️ حجم بالا: ${vol.totalSets.toLocaleString('fa-IR')} ست`;
          bar.insertBefore(warn,bar.firstChild);
        }
      }
    } else {
      const w=document.getElementById('volWarning');
      if(w) w.remove();
    }
  }

  function bindDayEvents(){
    document.querySelectorAll('[data-day-chip]').forEach(b=>{
      b.onclick=()=>{activeDayIdx=Number(b.dataset.dayChip);closeAllMenus();renderDays();};
    });
    document.querySelectorAll('[data-menu]').forEach(b=>{
      b.onclick=event=>{event.stopPropagation();toggleBuilderMenu(b);};
    });
    document.querySelectorAll('[data-mov-toggle]').forEach(b=>{
      b.onclick=()=>{
        const key=b.dataset.movToggle;
        expandedMovements[key]=expandedMovements[key]!==true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-del-day]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.delDay);
        if(confirm(`روز ${currentProgram.days[idx].day_number} و همه محتوایش حذف شود؟`)){
          currentProgram.days.splice(idx,1);
          currentProgram.days.forEach((d,i)=>d.day_number=i+1);
          if(activeDayIdx>=currentProgram.days.length)activeDayIdx=Math.max(0,currentProgram.days.length-1);
          setDirty(true);
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-copy-day]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.copyDay);
        const dayToCopy = JSON.parse(JSON.stringify(currentProgram.days[idx]));
        dayToCopy.dayHash = genHash();
        dayToCopy.day_number = currentProgram.days.length+1;
        (dayToCopy.data||[]).forEach(sys=>{
          sys.exerciseSystemHash = genHash();
          (sys.movement_list||[]).forEach(mov=>{
            mov.movementHash = genHash();
            (mov.sets||[]).forEach(s=> s.setHash = genHash());
          });
        });
        currentProgram.days.push(dayToCopy);
        activeDayIdx=currentProgram.days.length-1;
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-move-day-up]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.moveDayUp);
        if(idx>0){
          [currentProgram.days[idx-1], currentProgram.days[idx]] = [currentProgram.days[idx], currentProgram.days[idx-1]];
          currentProgram.days.forEach((d,i)=>d.day_number=i+1);
          setDirty(true);
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-move-day-down]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.moveDayDown);
        if(idx < currentProgram.days.length-1){
          [currentProgram.days[idx+1], currentProgram.days[idx]] = [currentProgram.days[idx], currentProgram.days[idx+1]];
          currentProgram.days.forEach((d,i)=>d.day_number=i+1);
          setDirty(true);
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-focus]').forEach(inp=>{
      inp.oninput=()=>{
        const idx=Number(inp.dataset.focus);
        currentProgram.days[idx].focus = inp.value;
        setDirty(true);
        const chip = document.querySelector(`[data-day-chip="${idx}"] small`);
        if(chip) chip.textContent = currentProgram.days[idx].isRestDay ? '🌙 استراحت' : (inp.value || 'بدون تمرکز');
      };
      inp.onchange=()=>{
        const idx=Number(inp.dataset.focus);
        currentProgram.days[idx].focus = inp.value;
        setDirty(true);
      };
    });
    document.querySelectorAll('[data-rest]').forEach(chk=>{
      chk.onchange=()=>{
        const idx=Number(chk.dataset.rest);
        currentProgram.days[idx].isRestDay = chk.checked;
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-add-sys]').forEach(b=>{
      b.onclick=()=>{ openSystemPicker(Number(b.dataset.addSys)); };
    });
    document.querySelectorAll('[data-del-sys]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx]=b.dataset.delSys.split('-').map(Number);
        currentProgram.days[dayIdx].data.splice(sysIdx,1);
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-sys-type]').forEach(sel=>{
      sel.onchange=()=>{
        const [dayIdx, sysIdx]=sel.dataset.sysType.split('-').map(Number);
        const val=Number(sel.value);
        currentProgram.days[dayIdx].data[sysIdx].exercise_system_id = val;
        const typeObj = systemTypes.find(t=>t.id===val);
        if(typeObj) currentProgram.days[dayIdx].data[sysIdx].system_type = typeObj.type;
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-add-mov]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx]=b.dataset.addMov.split('-').map(Number);
        selectedSystemForAdd = {dayIdx, sysIdx};
        openExerciseDrawer();
      };
    });
    document.querySelectorAll('[data-suggest-mov]').forEach(b=>{
      b.onclick=()=>{
        alert('💡 پیشنهاد جایگزین: بر اساس عضله هدف، حرکات مشابه پیشنهاد می‌شود (در نسخه کامل با AI)');
      };
    });
    document.querySelectorAll('[data-del-mov]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.delMov.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list.splice(movIdx,1);
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-edit-mov]').forEach(b=>{
      b.onclick=()=>{ const [dayIdx,sysIdx,movIdx]=b.dataset.editMov.split('-').map(Number); openMovementModal(dayIdx,sysIdx,movIdx); };
    });
    document.querySelectorAll('[data-move-mov-up]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.moveMovUp.split('-').map(Number);
        const list=currentProgram.days[dayIdx].data[sysIdx].movement_list;
        if(movIdx>0){
          [list[movIdx-1], list[movIdx]]=[list[movIdx], list[movIdx-1]];
          setDirty(true);
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-move-mov-down]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.moveMovDown.split('-').map(Number);
        const list=currentProgram.days[dayIdx].data[sysIdx].movement_list;
        if(movIdx < list.length-1){
          [list[movIdx+1], list[movIdx]]=[list[movIdx], list[movIdx+1]];
          setDirty(true);
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-mov-desc]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx]=inp.dataset.movDesc.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].description = inp.value;
        setDirty(true);
      };
    });
    const addSet = (dayIdx, sysIdx, movIdx, type) => {
      const mov = currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx];
      if(!mov.sets) mov.sets=[];
      let count = 12;
      if(type==='TIME') count=30;
      if(type==='FAILURE') count=null;
      if(type==='AMRAP') count=null;
      mov.sets.push({type, count, restSeconds:60, setHash: genHash()});
      setDirty(true);
      renderDays();
    };
    document.querySelectorAll('[data-add-set]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.addSet.split('-').map(Number);
        addSet(dayIdx, sysIdx, movIdx, 'REPEAT');
      };
    });
    document.querySelectorAll('[data-add-set-time]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.addSetTime.split('-').map(Number);
        addSet(dayIdx, sysIdx, movIdx, 'TIME');
      };
    });
    document.querySelectorAll('[data-add-set-fail]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.addSetFail.split('-').map(Number);
        addSet(dayIdx, sysIdx, movIdx, 'FAILURE');
      };
    });
    document.querySelectorAll('[data-del-set]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=b.dataset.delSet.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets.splice(setIdx,1);
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-set-type]').forEach(sel=>{
      sel.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=sel.dataset.setType.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].type = sel.value;
        setDirty(true);
        renderDays();
      };
    });
    document.querySelectorAll('[data-set-count]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setCount.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].count = inp.value||null;
        setDirty(true);
      };
    });
    document.querySelectorAll('[data-set-weight]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setWeight.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].weight = Number(inp.value)||0;
        setDirty(true);
      };
    });
    document.querySelectorAll('[data-set-rest]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setRest.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].restSeconds = Number(inp.value)||60;
        setDirty(true);
      };
    });
  }

  // Drawer
  let drawerSearchTimeout,drawerCategoryRequest=0,currentDrawerCat=null,currentDrawerSub=null,currentDrawerLocation=null;
  function resetDrawerBankFlow(){
    drawerCategoryRequest+=1;currentDrawerCat=null;currentDrawerSub=null;currentDrawerLocation=null;
    document.querySelectorAll('[data-bank-location]').forEach(button=>{button.classList.remove('active');button.disabled=false;});
    const filter=document.getElementById('drawerFilterStep'),search=document.getElementById('drawerSearch'),searchSection=document.getElementById('drawerSearchSection'),categorySection=document.getElementById('drawerCategorySection'),list=document.getElementById('drawerList');
    if(filter){filter.hidden=true;filter.classList.add('locked');}if(search)search.value='';
    const globalSearchInput=document.getElementById('drawerGlobalSearch');if(globalSearchInput)globalSearchInput.value='';
    const subChips=document.getElementById('drawerSubChips');if(subChips)subChips.innerHTML='';
    if(list)list.innerHTML='<div class="drawer-guidance">ابتدا محل تمرین را انتخاب کنید.</div>';
  }
  function mountExerciseDrawer(){
    const drawer=document.getElementById('exerciseDrawer');
    if(!drawer)return null;
    // The page content has an entrance transform/animation. A fixed element kept
    // inside that container becomes its child containing block in Chromium and
    // can render the panel shell while clipping or hiding its body. Keep this
    // overlay as a direct body portal so its full content is always viewport-fixed.
    if(drawer.parentElement!==document.body)document.body.appendChild(drawer);
    return drawer;
  }
  async function refreshQuickAddCategories(){
    const host=document.getElementById('quickAddCategory');
    if(!host||host.options.length>1)return;
    try{
      const cats=await api('/api/categories/grouped?location=both');
      host.innerHTML=cats.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    }catch(error){}
  }
  let quickAddSelectedMuscles = [];
  function renderQuickAddMuscles(){
    const host = document.getElementById('quickAddMuscleChips');
    if(!host) return;
    host.innerHTML = quickAddSelectedMuscles.map(id => {
      const m = muscleCatalog.find(item => item.id === id);
      if(!m) return '';
      return `<span class="mv-muscle-chip" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border:1px solid var(--accent-border);border-radius:999px;background:var(--accent-surface);color:var(--accent-hover);font-size:8px;font-weight:750;">${esc(m.label)}<button type="button" data-del-qa-muscle="${m.id}" style="border:0;background:none;color:var(--text-muted);cursor:pointer;font-size:10px;padding:0;line-height:1;">×</button></span>`;
    }).join('');
    host.querySelectorAll('[data-del-qa-muscle]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        quickAddSelectedMuscles = quickAddSelectedMuscles.filter(id => id !== btn.dataset.delQaMuscle);
        renderQuickAddMuscles();
      };
    });
  }

  function toggleQuickAddPanel(force){
    const panel=document.getElementById('drawerQuickAdd'),button=document.getElementById('drawerManualToggle');
    if(!panel)return;
    panel.hidden=force!==undefined?!force:!panel.hidden;
    if(button)button.textContent=panel.hidden?'＋ افزودن حرکت دستی':'× بستن افزودن دستی';
    const closeX = document.getElementById('quickAddCloseX');
    if (closeX && !closeX._bound) {
      closeX._bound = true;
      closeX.onclick = () => toggleQuickAddPanel(false);
    }
    if(!panel.hidden){
      refreshQuickAddCategories();
      const qaSelect = document.getElementById('quickAddMuscleSelect');
      if (qaSelect && !qaSelect._bound) {
        qaSelect._bound = true;
        qaSelect.onchange = () => {
          if (!qaSelect.value) return;
          if (!quickAddSelectedMuscles.includes(qaSelect.value)) {
            quickAddSelectedMuscles.push(qaSelect.value);
            renderQuickAddMuscles();
          }
          qaSelect.value = '';
        };
      }
      document.getElementById('quickAddName')?.focus();
    }
  }
  async function submitQuickAddExercise(){
    const name=(document.getElementById('quickAddName')?.value||'').trim();
    const location=document.getElementById('quickAddLocation')?.value||'gym';
    const category=document.getElementById('quickAddCategory')?.value;
    if(!name)return alert('نام حرکت الزامی است');
    if(!category)return alert('دسته‌بندی را انتخاب کنید');
    const targetMuscles = [...quickAddSelectedMuscles];
    try{
      const created=await api('/api/exercises',{method:'POST',body:JSON.stringify({name_fa:name,location,category_id:category,target_muscles:targetMuscles,priority:5})});
      alert('✅ حرکت «'+name+'» به بانک اضافه شد');
      document.getElementById('quickAddName').value='';
      quickAddSelectedMuscles = [];
      renderQuickAddMuscles();
      toggleQuickAddPanel(false);
      // اگر سیستمی در حال تکمیل است و جا دارد، حرکت جدید را همان‌جا اضافه کن
      if(selectedSystemForAdd){
        const {dayIdx,sysIdx}=selectedSystemForAdd;
        const sys=currentProgram.days[dayIdx].data[sysIdx];
        const meta=systemById(sys.exercise_system_id)||systemById(1);
        if((sys.movement_list||[]).length<meta.movements){
          sys.movement_list.push({
            exercise_id:created.id,
            exerciseId:created.id,
            original_exercise_id:null,
            nameFa:name,
            name:name,
            image_path:null,
            movementHash:genHash(),
            description:'',
            target_muscles:targetMuscles,
            sets:[{type:'REPEAT',count:12,restSeconds:60,setHash:genHash()}]
          });
          expandedMovements[`${dayIdx}-${sysIdx}-${sys.movement_list.length-1}`]=true;
          setDirty(true);renderDays();refreshDrawerContext();
        }
      }
      loadDrawerExercises(null,null,document.getElementById('drawerSearch')?.value||'');
    }catch(error){alert('خطا در ثبت حرکت: '+error.message);}
  }
  function refreshDrawerContext(){
    const ctx=document.getElementById('drawerContext'),list=document.getElementById('drawerList');
    if(!ctx)return;
    if(!selectedSystemForAdd){ctx.hidden=true;if(list)list.classList.remove('full');return;}
    const {dayIdx,sysIdx}=selectedSystemForAdd;
    const sys=currentProgram?.days?.[dayIdx]?.data?.[sysIdx];
    if(!sys){ctx.hidden=true;return;}
    const meta=systemById(sys.exercise_system_id)||systemById(1);
    const selected=(sys.movement_list||[]).length;
    const full=selected>=meta.movements;
    ctx.hidden=false;
    ctx.innerHTML=`<b>${meta.icon} ${esc(meta.label)}</b><span class="drawer-progress ${full?'done':''}">حرکات انتخاب شده: ${selected.toLocaleString('fa-IR')} از ${meta.movements.toLocaleString('fa-IR')}</span>${full?'<span class="drawer-full-note">تکمیل شد — حرکت بیشتری برای این سیستم قابل افزودن نیست</span>':`<span class="drawer-remaining">${(meta.movements-selected).toLocaleString('fa-IR')} حرکت باقی‌مانده</span>`}`;
    if(list)list.classList.toggle('full',full);
  }
  function openExerciseDrawer(){
    const drawer=mountExerciseDrawer();
    if(!drawer)return;
    const list=drawer.querySelector('#drawerList'),title=drawer.querySelector('#drawerTitle'),tab=drawer.querySelector('#drawerTabAdd');
    if(!list||!title||!tab){
      console.error('Exercise drawer markup is incomplete');
      return;
    }
    title.textContent='بانک حرکات تمرینی';
    tab.style.display='flex';
    const done=drawer.querySelector('#drawerDone');
    if(done)done.hidden=false;
    resetDrawerBankFlow();drawer.classList.add('open');refreshDrawerContext();
  }
  function closeDrawer(){
    const drawer=document.getElementById('exerciseDrawer');
    if(drawer)drawer.classList.remove('open');
    const ctx=document.getElementById('drawerContext'),done=document.getElementById('drawerDone'),list=document.getElementById('drawerList');
    if(ctx)ctx.hidden=true;
    if(done)done.hidden=true;
    if(list)list.classList.remove('full');
    selectedSystemForAdd=null;
  }
  async function selectDrawerLocation(location){
    const requestId=++drawerCategoryRequest;currentDrawerLocation=location;currentDrawerCat=null;currentDrawerSub=null;exerciseCategories=[];
    const locationButtons=[...document.querySelectorAll('[data-bank-location]')];locationButtons.forEach(button=>{button.classList.toggle('active',button.dataset.bankLocation===location);button.disabled=true;});
    const filter=document.getElementById('drawerFilterStep'),list=document.getElementById('drawerList');
    filter.hidden=true;filter.classList.add('locked');list.innerHTML='<div class="drawer-loading">در حال آماده‌سازی بانک حرکات…</div>';
    try{
      const categories=await api(`/api/categories/grouped?location=${encodeURIComponent(location)}`);if(requestId!==drawerCategoryRequest)return;if(!categories.length)throw new Error('حرکتی برای این محل ثبت نشده است');
      exerciseCategories=categories;renderCategorySelect();filter.hidden=false;filter.classList.remove('locked');list.innerHTML='<div class="drawer-loading">در حال خواندن حرکات…</div>';document.getElementById('drawerSearch').focus();
    }catch(error){if(requestId!==drawerCategoryRequest)return;filter.hidden=true;cats.innerHTML='';list.innerHTML=`<div class="drawer-error">${esc(error.message)}</div>`;}
    finally{if(requestId===drawerCategoryRequest)locationButtons.forEach(button=>button.disabled=false);}
  }
  function renderCategorySelect(){
    const select=document.getElementById('drawerCategorySelect');
    if(!select)return;
    select.innerHTML=exerciseCategories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} (${c.count.toLocaleString('fa-IR')} حرکت)</option>`).join('');
    currentDrawerCat=exerciseCategories[0]?.id||null;currentDrawerSub='all';
    renderSubChips();
    document.querySelectorAll('[data-cat-summary]').forEach(el=>el.onchange=()=>{currentDrawerCat=el.value;currentDrawerSub='all';document.getElementById('drawerSearch').value='';renderSubChips();loadDrawerExercises(currentDrawerCat,'all','');});
    if(currentDrawerCat)loadDrawerExercises(currentDrawerCat,'all','');
  }
  function renderSubChips(){
    const host=document.getElementById('drawerSubChips');
    if(!host)return;
    const cat=exerciseCategories.find(c=>c.id===currentDrawerCat);
    const subs=(cat&&cat.subs)||[];
    host.innerHTML=`<button type="button" class="subchip ${currentDrawerSub==='all'?'active':''}" data-sub="all">همه</button>`+subs.map(sub=>`<button type="button" class="subchip ${currentDrawerSub===sub.id?'active':''}" data-sub="${esc(sub.id)}">${esc(sub.name)}</button>`).join('');
    host.querySelectorAll('[data-sub]').forEach(btn=>btn.onclick=()=>{currentDrawerSub=btn.dataset.sub;document.getElementById('drawerSearch').value='';host.querySelectorAll('[data-sub]').forEach(b=>b.classList.toggle('active',b===btn));loadDrawerExercises(currentDrawerCat,currentDrawerSub,'');});
  }
  // ===== مودال ویرایش حرکت =====
  let mvCtx=null;
  function mvMovement(){ if(!mvCtx)return null; return currentProgram.days[mvCtx.dayIdx]?.data[mvCtx.sysIdx]?.movement_list?.[mvCtx.movIdx]||null; }
  function closeMovementModal(){ const m=document.getElementById('movementModal'); if(m)m.hidden=true; mvCtx=null; }
  function applyPreset(mov,preset){
    mov.sets=preset.spec.map(item=>({type:item.type,count:item.count==null?null:item.count,restSeconds:60,setHash:genHash()}));
    setDirty(true);renderDays();
  }
  function findMatchingPresetIndex(sets){
    if(!sets||!sets.length)return -1;
    return setPresets.findIndex(p=>{
      if(p.spec.length!==sets.length)return false;
      return p.spec.every((expected,i)=>{
        const actual=sets[i];
        if(!actual)return false;
        if(expected.type!==actual.type)return false;
        if(expected.type==='FAILURE')return true;
        return String(expected.count??'')===String(actual.count??'');
      });
    });
  }
  function renderMovementModal(){
    const body=document.getElementById('mvBody'); if(!body||!mvCtx)return;
    const mov=mvMovement(); if(!mov){closeMovementModal();return;}
    const {dayIdx,sysIdx,movIdx}=mvCtx;
    const sys=currentProgram.days[dayIdx].data[sysIdx];
    const sysMeta=systemById(sys.exercise_system_id)||systemById(1);
    const exId=mov.original_exercise_id||mov.exercise_id;
    const det=(mov._detail||{});
    const rawVideo = (det.video_path && det.video_path.trim() && det.video_path !== 'null' && det.video_path !== 'undefined') 
      ? det.video_path 
      : (mov.original_exercise_id ? `/files/exercise/videos/${mov.original_exercise_id}.mp4` : '');
    const videoSrc = rawVideo || '';
    const sets=mov.sets||[];
    const matchedPresetIdx=findMatchingPresetIndex(sets);
    const activeMuscleIds=getAutoMusclesForMovement(mov);
    mov.target_muscles=activeMuscleIds;

    const frontOverlays=activeMuscleIds.map(id=>muscleCatalog.find(m=>m.id===id&&m.side==='front')).filter(Boolean);
    const backOverlays=activeMuscleIds.map(id=>muscleCatalog.find(m=>m.id===id&&m.side==='back')).filter(Boolean);
    const hasFront=frontOverlays.length>0;
    const hasBack=backOverlays.length>0;
    let showSides=[];
    if(hasFront&&!hasBack) showSides=['front'];
    else if(!hasFront&&hasBack) showSides=['back'];
    else if(hasFront&&hasBack) showSides=['front','back'];
    else showSides=['front'];

    document.getElementById('mvTitle').textContent=`ویرایش حرکت: ${mov.nameFa||mov.name||'حرکت'}`;
    const chip=document.getElementById('mvSystemChip');
    chip.textContent=`${sysMeta.icon} ${sysMeta.label}`;
    body.innerHTML=`
      <section class="mv-info">
        <div class="mv-info-grid">
          <label class="mv-field-label">نام حرکت
            <input type="text" id="mvName" value="${esc(mov.nameFa||mov.name||'حرکت')}" placeholder="نام حرکت">
          </label>
          <label class="mv-field-label">توضیحات
            <textarea id="mvDesc" placeholder="توضیح مربی: تمرکز، تمپو، نکات اجرا…">${esc(mov.description||'')}</textarea>
          </label>
        </div>
      </section>

      <section class="mv-sets" id="mvSetsContainer">
        <div class="mv-preset-row">
          <label for="mvPresetSelect"><b>ست‌های پیشنهادی <span class="mv-req-star">*</span></b></label>
          <select id="mvPresetSelect" class="mv-preset-select" required>
            <option value="">— انتخاب ست‌های پیشنهادی (الزامی) —</option>
            ${setPresets.map((p,i)=>`<option value="${i}" ${matchedPresetIdx===i?'selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
        </div>

        <div class="mv-sets-toolbar">
          <div class="mv-sets-title-wrap">
            <b>ست‌های حرکت</b>
            <small class="mv-sets-count">${sets.length ? `${sets.length.toLocaleString('fa-IR')} ست` : 'بدون ست'}</small>
          </div>
          <button type="button" class="mv-add-set-btn" id="mvAddSet" title="افزودن ست جدید">＋ افزودن ست جدید</button>
        </div>

        <div class="mv-set-cards-list" id="mvSetCardsList">
          ${sets.length ? sets.map((st, i) => {
            const isFailure = st.type === 'FAILURE';
            return `
            <div class="mv-set-card" data-set-card="${i}">
              <div class="mv-set-card-top">
                <span class="mv-set-badge">ست ${(i+1).toLocaleString('fa-IR')}</span>
                <button type="button" class="mv-set-del-btn" data-mv-del="${i}" title="حذف ست">×</button>
              </div>
              <select data-mv-unit="${i}" title="واحد ست" class="mv-unit-select">
                ${setUnits.map(u => `<option value="${u.id}" ${st.type === u.id ? 'selected' : ''}>${u.label}</option>`).join('')}
              </select>
              <input type="text" data-mv-count="${i}" value="${esc(isFailure ? '' : (st.count ?? ''))}" placeholder="${isFailure ? '—' : (st.type === 'TIME' ? '۳۰' : (st.type === 'MINUTE' ? '۱' : '۱۲'))}" ${isFailure ? 'disabled' : ''} title="مقدار" class="mv-count-input">
            </div>`;
          }).join('') : `
            <div class="mv-sets-empty">
              <span>هنوز ستی تعیین نشده است — از ست‌های پیشنهادی انتخاب کنید یا «افزودن ست جدید» را بزنید.</span>
            </div>
          `}
        </div>

        <small class="mv-error" id="mvSetsError" hidden>انتخاب ست‌های پیشنهادی یا تعیین حداقل یک ست الزامی است.</small>
      </section>

      <section class="mv-learn">
        <div class="mv-anatomy">
          <b>عضله هدف</b>
          <div class="mv-figures ${showSides.length===1?'single-view':'dual-view'}">
            ${showSides.includes('front') ? `
            <figure class="mv-body-figure">
              <div class="muscle-container mv-body-canvas-wrap" style="position: relative; width: 100%; max-width: ${showSides.length===1?'165px':'125px'}; height: ${showSides.length===1?'230px':'185px'}; margin: 0 auto; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: rgba(5, 5, 5, .95);">
                <img class="base-body mv-base-body" src="https://admin-morabiha.ir/images/common/muscles/front/front_grey_body.webp" alt="نمای جلو" style="width: 100%; height: 100%; object-fit: contain; display: block; position: relative; z-index: 1;" loading="lazy">
                ${frontOverlays.map(m => `
                  <img class="muscle-overlay mv-muscle-overlay" src="https://admin-morabiha.ir/images/common/muscles/front/${m.file}" alt="${esc(m.label)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2; pointer-events: none;" loading="lazy">
                `).join('')}
              </div>
              <figcaption>نمای جلو</figcaption>
            </figure>` : ''}

            ${showSides.includes('back') ? `
            <figure class="mv-body-figure">
              <div class="muscle-container mv-body-canvas-wrap" style="position: relative; width: 100%; max-width: ${showSides.length===1?'165px':'125px'}; height: ${showSides.length===1?'230px':'185px'}; margin: 0 auto; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: rgba(5, 5, 5, .95);">
                <img class="base-body mv-base-body" src="https://admin-morabiha.ir/images/common/muscles/back/back_grey_body.webp" alt="نمای پشت" style="width: 100%; height: 100%; object-fit: contain; display: block; position: relative; z-index: 1;" loading="lazy">
                ${backOverlays.map(m => `
                  <img class="muscle-overlay mv-muscle-overlay" src="https://admin-morabiha.ir/images/common/muscles/back/${m.file}" alt="${esc(m.label)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 2; pointer-events: none;" loading="lazy">
                `).join('')}
              </div>
              <figcaption>نمای پشت</figcaption>
            </figure>` : ''}
          </div>
        </div>

        <div class="mv-video">
          <b>آموزش حرکت</b>
          <div class="mv-player ${videoSrc ? '' : 'no-video'}" id="mvPlayerWrap">
            ${videoSrc ? `<video id="mvVideo" controls playsinline preload="metadata" src="${esc(videoSrc)}" onerror="this.closest('.mv-player').classList.add('no-video')"></video>` : ''}
            <div class="mv-video-placeholder"><span>▶</span><small>ویدیو برای این حرکت ثبت نشده است</small></div>
          </div>
          <small class="mv-muted">پخش / توقف / فول‌اسکرین با کنترل‌های پلیر</small>
        </div>
      </section>`;

    const nameEl=document.getElementById('mvName');
    if(nameEl)nameEl.oninput=()=>{
      mov.nameFa=nameEl.value;
      mov.name=nameEl.value;
      const titleEl=document.getElementById('mvTitle');
      if(titleEl)titleEl.textContent=`ویرایش حرکت: ${nameEl.value||'حرکت'}`;
      setDirty(true);
      renderDays();
    };
    const descEl=document.getElementById('mvDesc');
    if(descEl)descEl.oninput=()=>{mov.description=descEl.value;setDirty(true);};

    const presetSelect=document.getElementById('mvPresetSelect');
    if(presetSelect){
      presetSelect.onchange=()=>{
        if(presetSelect.value==='')return;
        const preset=setPresets[Number(presetSelect.value)];
        if(preset){
          applyPreset(mov,preset);
          renderMovementModal();
        }
      };
    }

    const addBtn=document.getElementById('mvAddSet');
    if(addBtn){
      addBtn.onclick=()=>{
        if(!mov.sets)mov.sets=[];
        const last=mov.sets[mov.sets.length-1];
        const newType=(last&&last.type)||'REPEAT';
        let defaultCount=12;
        if(newType==='TIME')defaultCount=30;
        else if(newType==='MINUTE')defaultCount=1;
        else if(newType==='DROPSET')defaultCount='12-10-8';
        else if(newType==='FAILURE')defaultCount=null;

        mov.sets.push({type:newType,count:defaultCount,restSeconds:(last&&last.restSeconds)||60,setHash:genHash()});
        setDirty(true);renderDays();renderMovementModal();
      };
    }

    body.querySelectorAll('[data-mv-unit]').forEach(sel=>{
      sel.onchange=()=>{
        const idx=Number(sel.dataset.mvUnit);
        if(mov.sets&&mov.sets[idx]){
          const newType=sel.value;
          mov.sets[idx].type=newType;
          if(newType==='FAILURE'){
            mov.sets[idx].count=null;
          }else if(mov.sets[idx].count==null||mov.sets[idx].count===''){
            if(newType==='TIME')mov.sets[idx].count=30;
            else if(newType==='MINUTE')mov.sets[idx].count=1;
            else if(newType==='DROPSET')mov.sets[idx].count='12-10-8';
            else mov.sets[idx].count=12;
          }
          setDirty(true);renderDays();renderMovementModal();
        }
      };
    });

    body.querySelectorAll('[data-mv-count]').forEach(inp=>{
      inp.oninput=()=>{
        const idx=Number(inp.dataset.mvCount);
        if(mov.sets&&mov.sets[idx]){
          const val=inp.value.trim();
          mov.sets[idx].count=val===''?null:(isNaN(Number(val))?val:Number(val));
          setDirty(true);renderDays();
        }
      };
    });

    body.querySelectorAll('[data-mv-del]').forEach(btn=>{
      btn.onclick=()=>{
        const idx=Number(btn.dataset.mvDel);
        if(mov.sets&&mov.sets[idx]!==undefined){
          mov.sets.splice(idx,1);
          setDirty(true);renderDays();renderMovementModal();
        }
      };
    });
  }
  async function openMovementModal(dayIdx,sysIdx,movIdx){
    let modal=document.getElementById('movementModal');
    if(!modal)return;
    if(modal.parentElement!==document.body)document.body.appendChild(modal);
    mvCtx={dayIdx,sysIdx,movIdx};
    const mov=mvMovement();
    if(mov&&!mov._detail){
      try{
        const ex=await api(`/api/exercises/${mov.exercise_id}`);
        mov._detail={name_en:ex.name_en,equipment:ex.equipment,difficulty:ex.difficulty,category:ex.category_id?String(ex.category_id):'',subcategory:ex.subcategory_id?String(ex.subcategory_id):'',video_path:ex.video_path,image_path:ex.image_path,target_muscles:ex.target_muscles};
        if((!mov.target_muscles || mov.target_muscles.length===0) && ex.target_muscles){
          mov.target_muscles = Array.isArray(ex.target_muscles) ? ex.target_muscles : (typeof ex.target_muscles==='string'?JSON.parse(ex.target_muscles):[]);
        }
      }catch(e){}
    }
    renderMovementModal();
    modal.hidden=false;
  }
  async function doGlobalDrawerSearch(term){
    const host=document.getElementById('drawerList');
    if(!host)return;
    term=String(term||'').trim();
    if(!term){host.innerHTML='<div class="drawer-guidance">ابتدا محل تمرین را انتخاب کنید.</div>';return;}
    host.innerHTML='<div class="drawer-loading">در حال خواندن بانک حرکات…</div>';
    try{
      const query=new URLSearchParams({query:term,location:'both',status:'active',page:0,pageSize:40});
      const response=await api(`/api/exercises?${query}`);
      renderDrawerList(response.items||[]);
    }catch(error){host.innerHTML=`<div class="drawer-error">خطا در دریافت حرکات: ${esc(error.message)}</div>`;}
  }
  async function loadDrawerExercises(catId=null,subId=null,searchValue=null){
    const host=document.getElementById('drawerList'),searchVal=searchValue===null?document.getElementById('drawerSearch').value.trim():String(searchValue).trim();
    if(!currentDrawerLocation){host.innerHTML='<div class="drawer-guidance">ابتدا محل تمرین را انتخاب کنید.</div>';return;}
    if(!catId && searchVal.length<2 && currentDrawerLocation!=='all'){host.innerHTML=`<div class="drawer-guidance">${searchVal?'حداقل دو حرف برای جستجو وارد کنید.':'نام حرکت را جستجو کنید یا یک دسته‌بندی انتخاب کنید.'}</div>`;return;}
    if(!catId && !searchVal && currentDrawerLocation!=='all'){host.innerHTML='<div class="drawer-guidance">نام حرکت را جستجو کنید یا یک دسته‌بندی انتخاب کنید.</div>';return;}
    host.innerHTML='<div class="drawer-loading">در حال خواندن بانک حرکات…</div>';
    try{
      if(!catId&&currentDrawerLocation==='all'){
        // جستجوی سراسری پویا: همه حرکات (باشگاه + منزل + هر دو) با نرمال‌سازی فارسی سمت سرور
        const query=new URLSearchParams({query:searchVal,location:currentDrawerLocation,status:'active',page:0,pageSize:40});
        const response=await api(`/api/exercises?${query}`);
        renderDrawerList(response.items||[]);
        return;
      }
      if(!catId){
        let allItems=[];
        for(const category of exerciseCategories){
          try{const query=new URLSearchParams({categoryId:category.id,location:currentDrawerLocation,status:'active',page:0,pageSize:15,query:searchVal}),response=await api(`/api/exercises?${query}`);allItems=allItems.concat(response.items||[]);if(allItems.length>=40)break;}catch(error){}
        }
        renderDrawerList(allItems.slice(0,40));return;
      }
      currentDrawerCat=catId;currentDrawerSub=subId;
      const query=new URLSearchParams({categoryId:catId,location:currentDrawerLocation,status:'active',page:0,pageSize:40,query:searchVal});
      if(subId&&subId!=='all')query.set('subCategoryId',subId);
      const response=await api(`/api/exercises?${query}`);renderDrawerList(response.items||[]);
    }catch(error){host.innerHTML=`<div class="drawer-error">خطا در دریافت حرکات: ${esc(error.message)}</div>`;}
  }
  function renderDrawerList(items){
    const host=document.getElementById('drawerList');
    if(items.length===0){
      host.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted)">حرکتی پیدا نشد</div>`;
      return;
    }
    host.innerHTML = `<div class="drawer-results-head"><b>${items.length.toLocaleString('fa-IR')} حرکت</b><span>برای افزودن روی حرکت بزنید — بانک باز می‌ماند</span></div>` + items.map(ex=>{
      const thumbSrc = (ex.image_path && ex.image_path.trim()) ? ex.image_path : (ex.original_id ? `/api/exercise-image/${ex.original_id}` : '/assets/images/blank-white.svg');
      return `
      <div class="drawer-item" data-ex-id="${ex.id}" data-ex-orig="${ex.original_id||''}" data-ex-name="${esc(ex.name_fa)}" data-ex-img="${esc(ex.image_path||'')}">
        <img src="${esc(thumbSrc)}" alt="" onerror="this.src='/assets/images/blank-white.svg'" loading="lazy">
        <div>
          <b>${esc(ex.name_fa)}</b>
          <small>${esc(exerciseCategories.find(category=>category.id===ex.category_id)?.name||ex.category_id)} • ${ex.location==='gym'?'باشگاه':ex.location==='home'?'منزل':'همه محل‌ها'}${ex.equipment?` • ${esc(ex.equipment)}`:''}</small>
        </div>
        <span style="margin-left:auto;color:var(--text-secondary)">＋</span>
      </div>
    `;}).join('');
    host.querySelectorAll('.drawer-item').forEach(el=>{
      el.onclick=()=>{
        if(!selectedSystemForAdd)return;
        const exId=Number(el.dataset.exId);
        const origId=el.dataset.exOrig;
        const name=el.dataset.exName;
        const imgPath=el.dataset.exImg||null;
        const {dayIdx, sysIdx}=selectedSystemForAdd;
        const sys=currentProgram.days[dayIdx].data[sysIdx];
        const meta=systemById(sys.exercise_system_id)||systemById(1);
        // سقف حرکت سیستم تمرینی (BR-14): بیش از تعداد لازم اضافه نمی‌شود
        if((sys.movement_list||[]).length>=meta.movements)return;
        sys.movement_list.push({
          exercise_id: exId,
          exerciseId: exId,
          original_exercise_id:origId?Number(origId):null,
          nameFa: name,
          name: name,
          image_path: imgPath,
          movementHash: genHash(),
          description: '',
          sets: [{type:'REPEAT', count:12, restSeconds:60, setHash: genHash()}]
        });
        expandedMovements[`${dayIdx}-${sysIdx}-${sys.movement_list.length-1}`]=true;
        setDirty(true);
        renderDays();
        // بانک عمداً بسته نمی‌شود — انتخاب چند حرکت پشت‌سرهم ممکن است (BR-14)
        refreshDrawerContext();
        openMovementModal(dayIdx,sysIdx,sys.movement_list.length-1); // ویرایش حرکت باز شود
      };
    });
  }

  async function loadHistory(){
    try {
      const list=await api('/api/training-programs');
      const host=document.getElementById('historyList');
      if(!host) return;
      if(list.length===0){
        host.innerHTML=`<div style="color:var(--text-muted);font-size:12px">هنوز سابقه‌ای نیست</div>`;
        return;
      }
      host.innerHTML = list.slice(0,10).map(p=>`
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
          <b style="font-size:12px">${esc(p.title)}</b><br>
          <small style="color:var(--text-muted)">${esc(p.start_date||'')} - ${p.program_data?.days?.length||0} روز</small><br>
          <button class="btn btn-secondary btn-small" onclick="window.loadProgramToCurrent(${p.id})">بارگزاری</button>
        </div>
      `).join('');
    } catch(e){}
  }

  window.loadProgramToCurrent = async (id) => {
    try {
      const prog=await api(`/api/training-programs/${id}/full`);
      if(confirm(`برنامه "${prog.title}" بارگزاری شود؟ برنامه فعلی جایگزین می‌شود.`)){
        currentProgram = {
          id: null,
          title: prog.title + ' (کپی)',
          coach_note: prog.coach_note||'',
          start_date: prog.start_date||'',
          end_date: prog.end_date||'',
          student_id: prog.student_id||null,
          status: 'پیش‌نویس',
          version: 2,
          days: JSON.parse(JSON.stringify(prog.program_data?.days||[])).map(d=>{
            d.dayHash = genHash();
            (d.data||[]).forEach(sys=>{
              sys.exerciseSystemHash = genHash();
              (sys.movement_list||[]).forEach(mov=>{
                mov.movementHash = genHash();
                (mov.sets||[]).forEach(s=> s.setHash = genHash());
              });
            });
            return d;
          })
        };
        document.getElementById('progTitle').value = currentProgram.title;
        activeDayIdx=0;
        setDirty(true);
        renderDays();
        closeDrawer();
      }
    } catch(e){ alert('خطا: '+e.message); }
  };

  function makeAssessmentDays(count){
    const total=Math.min(7,Math.max(1,Number(count)||3));
    // روزها بدون سیستم پیش‌فرض ساخته می‌شوند؛ مربی سیستم را از کاتالوگ ۱۲گانه انتخاب می‌کند (BR-14)
    return Array.from({length:total},(_,index)=>({day_number:index+1,dayHash:genHash(),focus:'',coachNote:'',isRestDay:false,data:[]}));
  }
  function renderAssessmentContext(){
    const host=document.getElementById('assessmentContext');if(!host)return;
    if(!assessmentContext){host.innerHTML='';return;}
    const {assessment,assessment_details:details={},student}=assessmentContext,measure=details.measurements||{},sports=details.sports||{},medical=details.medical||{},goals=(details.goals||String(assessment.goal||'').split(',').filter(Boolean));
    const facts=[
      ['هدف',goals.map(goal=>goalLabels[goal]||fa(goal)).join('، ')],['قد',measure.height||assessment.height?`${measure.height||assessment.height} سانتی‌متر`:'' ],['وزن',measure.weight||assessment.weight?`${measure.weight||assessment.weight} کیلوگرم`:'' ],
      ['جلسات پیشنهادی',sports.sessions_per_week?`${sports.sessions_per_week} جلسه در هفته`:'' ],['محل تمرین',sports.practice_place?fa(sports.practice_place):fa(student.preferred_location)],['سابقه تمرین',sports.practice_history? 'دارد':'ندارد']
    ].filter(([,value])=>value!==''&&value!=='—');
    const warnings=[];if(medical.has_injury)warnings.push(medical.injury_details||'سابقه آسیب‌دیدگی');if(medical.has_disease)warnings.push(medical.disease_details||'سابقه بیماری');if(medical.has_medication)warnings.push(medical.medication_details||'مصرف دارو');for(const item of details.medical_items||[])if(item.name)warnings.push(item.name);
    host.innerHTML=`<section class="assessment-program-context"><header><div><p class="eyebrow">مبنای ساخت برنامه</p><h2>${esc(student.full_name)} <span>پرونده ${esc(student.case_number||'------')}</span></h2><small>ارزیابی ${assessment.assessment_number} • تأییدشده</small></div><a href="/assessments/${assessment.id}" class="secondary">مشاهده پرونده کامل</a></header><div class="assessment-context-facts">${facts.map(([label,value])=>`<div><span>${label}</span><b>${esc(value)}</b></div>`).join('')}</div>${warnings.length?`<div class="assessment-context-warning"><b>ملاحظات پزشکی و آسیب‌ها</b><span>${esc([...new Set(warnings)].join('، '))}</span></div>`:''}${assessment.student_note?`<div class="assessment-context-note"><b>نکته شاگرد</b><span>${esc(assessment.student_note)}</span></div>`:''}</section>`;
  }
  async function loadAssessmentContext(assessmentId,expectedStudentId){
    if(!assessmentId)return null;
    const data=await api(`/api/assessments/${assessmentId}`),status=data.assessment.lifecycle_status||data.assessment.status;
    if(status!=='APPROVED')throw new Error('فقط ارزیابی تأییدشده می‌تواند مبنای برنامه باشد.');
    if(expectedStudentId&&Number(data.student.id)!==Number(expectedStudentId))throw new Error('ارزیابی به شاگرد انتخاب‌شده تعلق ندارد.');
    assessmentContext=data;
    const details=data.assessment_details||{},sports=details.sports||{},medical=details.medical||{},goals=details.goals||[];
    currentProgram.student_id=data.student.id;currentProgram.assessment_id=data.assessment.id;
    if(!currentProgram.id){currentProgram.title=`برنامه ۳۰ روزه ${data.student.full_name} - پرونده ${data.student.case_number}`;currentProgram.days=makeAssessmentDays(sports.sessions_per_week);}
    document.getElementById('progLevel').value=sports.practice_history?'Professional':'Beginner';
    document.getElementById('progLocation').value=(sports.practice_place||data.student.preferred_location)==='home'?'Home':'Gym';
    if(goals[0])document.getElementById('progTarget').value=goals[0];
    document.getElementById('progInjury').value=(medical.has_injury||(details.medical_items||[]).some(item=>item.kind==='injury'))?'Injury':'None';
    renderAssessmentContext();return data;
  }

  async function loadStudents(){
    try {
      const students = await api('/api/students');
      const sel=document.getElementById('progStudent');
      if(sel){
        sel.innerHTML = `<option value="">بدون شاگرد</option>` + students.map(s=>`<option value="${s.id}">پرونده ${esc(s.case_number||'------')} • ${esc(s.full_name)} • ${esc(s.goal||'بدون هدف')}</option>`).join('');
        if(currentProgram.student_id) sel.value = currentProgram.student_id;
        if(assessmentContext){sel.disabled=true;sel.title='شاگرد از ارزیابی تأییدشده انتخاب شده است';}
        updateTopbar();
      }
    } catch(e){}
  }

  function bindMainEvents(){
    document.getElementById('btnAddDay').onclick=()=>{
      const nextNum = (currentProgram.days?.length||0)+1;
      currentProgram.days.push({
        day_number: nextNum,
        dayHash: genHash(),
        focus: '',
        coachNote: '',
        isRestDay: false,
        data: []
      });
      activeDayIdx=currentProgram.days.length-1;
      setDirty(true);
      renderDays();
    };
    document.getElementById('btnAddRestDay').onclick=()=>{
      const nextNum = (currentProgram.days?.length||0)+1;
      currentProgram.days.push({
        day_number: nextNum,
        dayHash: genHash(),
        focus: 'استراحت',
        isRestDay: true,
        data: []
      });
      activeDayIdx=currentProgram.days.length-1;
      setDirty(true);
      renderDays();
    };
    document.getElementById('btnCopyLastDay').onclick=()=>{
      if(currentProgram.days.length===0) return;
      const last = currentProgram.days[currentProgram.days.length-1];
      const copy = JSON.parse(JSON.stringify(last));
      copy.dayHash = genHash();
      copy.day_number = currentProgram.days.length+1;
      (copy.data||[]).forEach(sys=>{
        sys.exerciseSystemHash = genHash();
        (sys.movement_list||[]).forEach(mov=>{
          mov.movementHash = genHash();
          (mov.sets||[]).forEach(s=> s.setHash = genHash());
        });
      });
      currentProgram.days.push(copy);
      activeDayIdx=currentProgram.days.length-1;
      setDirty(true);
      renderDays();
    };
    document.getElementById('btnSave').onclick=()=> saveProgram(false);
    document.getElementById('btnSaveReturn').onclick=()=> saveProgram(true);
    document.getElementById('btnAssign').onclick=async()=>{
      const studentId = document.getElementById('progStudent').value;
      if(!studentId && !currentProgram.student_id) return alert('لطفاً ابتدا شاگرد مورد نظر را در بخش مشخصات برنامه انتخاب کنید.');
      if(!confirm('برنامه ذخیره و برای شاگرد فعال شود؟')) return;
      currentProgram.student_id = Number(studentId || currentProgram.student_id);
      const saved=await saveProgram(false, true);
      if(!saved) return;
      try{
        await api(`/api/training-programs/${currentProgram.id}/activate`, {method:'POST'});
        setDirty(false);
        alert('✅ برنامه با موفقیت فعال و به شاگرد اختصاص داده شد');
        location.href=`/students/${currentProgram.student_id}/timeline`;
      }catch(e){ alert('خطا در اختصاص برنامه: '+e.message); }
    };
    const handleExportPDF = () => {
      syncFormToProgram();
      if (window.openProgramPDF) {
        window.openProgramPDF(currentProgram);
      }
    };
    const btnExportPDF = document.getElementById('btnExportPDF');
    if (btnExportPDF) btnExportPDF.onclick = handleExportPDF;
    const btnMenuPDF = document.getElementById('btnMenuPDF');
    if (btnMenuPDF) btnMenuPDF.onclick = handleExportPDF;

    const btnMenuAi = document.getElementById('btnMenuAi');
    if (btnMenuAi) {
      btnMenuAi.onclick = async () => {
        syncFormToProgram();
        const studentId = currentProgram.student_id;
        const defaultPrompt = studentId
          ? `شاگرد با شناسه ${studentId} را بررسی کن و با توجه به آخرین ارزیابی بدنی، اهداف و محدودیت‌های او، توصیه‌های تمرینی و ساختار بهینه جلسات را تحلیل و پیشنهاد بده.`
          : `ساختار یک برنامه تمرینی ۴ روزه هایپرتروفی استاندارد همراه با سیستم‌های تمرینی بهینه را پیشنهاد بده.`;

        const userPrompt = prompt('پیام یا درخواست از هوش مصنوعی برای این برنامه:', defaultPrompt);
        if (!userPrompt) return;

        try {
          btnMenuAi.textContent = '⏳ در حال دریافت پاسخ…';
          btnMenuAi.disabled = true;
          const res = await api('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({
              messages: [
                { role: 'system', content: 'شما دستیار ارشد مربیگری بدنسازی در سامانه یسنافیت هستید. پاسخ‌های دقیق، علمی و ساختاریافته به زبان فارسی ارائه دهید.' },
                { role: 'user', content: userPrompt }
              ]
            })
          });

          const reply = res.content || (res.message && res.message.content) || 'پاسخ دریافت شد.';
          alert(`🤖 پاسخ هوش مصنوعی:\n\n${reply}`);
        } catch (err) {
          alert(`خطا در هوش مصنوعی: ${err.message}`);
        } finally {
          btnMenuAi.textContent = '🤖 دستیار هوشمند هوش مصنوعی (AI)';
          btnMenuAi.disabled = false;
        }
      };
    }

    document.getElementById('btnList').onclick=()=>{ location.href='/templates/exercise/list'; };
    document.getElementById('btnPreview').onclick=()=>{
      const preview = JSON.stringify(currentProgram, null, 2);
      const w=window.open();
      w.document.write(`<html dir="ltr"><head><meta charset="UTF-8"><title>JSON Preview</title><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/unified-components.css"></head><body style="margin:0;padding:24px;background:var(--bg);color:var(--text-primary)"><pre style="font-family:monospace;white-space:pre-wrap;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px">${esc(preview)}</pre></body></html>`);
    };
    document.getElementById('btnStats').onclick=()=>{
      const vol=calculateVolume(currentProgram);
      alert(`📈 آمار برنامه:\n${vol.totalDays} روز\n${vol.totalMovs} حرکت\n${vol.totalSets} ست\n\nحجم تمرینی: ${vol.totalSets * 12} تکرار تقریبی`);
    };
    document.getElementById('progTitle').oninput=(e)=>{ currentProgram.title=e.target.value; setDirty(true); updateTopbar(); };
    document.getElementById('progNote').oninput=(e)=>{ currentProgram.coach_note=e.target.value; setDirty(true); };
    document.getElementById('progStudent').onchange=(e)=>{ currentProgram.student_id=e.target.value?Number(e.target.value):null; setDirty(true); updateTopbar(); };

    const startInput = document.getElementById('progStart');
    const endInput = document.getElementById('progEnd');
    if(startInput && endInput){
      const onStartChange = () => {
        const startISO = window.YasnaJalali ? window.YasnaJalali.iso(startInput) : startInput.value;
        if (startISO) {
          currentProgram.start_date = startISO;
          if (window.YasnaJalali?.addMonths) {
            const nextMonthISO = window.YasnaJalali.addMonths(startISO, 1);
            if (nextMonthISO) {
              window.YasnaJalali.set(endInput, nextMonthISO);
              currentProgram.end_date = nextMonthISO;
            }
          }
          setDirty(true);
        }
      };
      startInput.onchange = onStartChange;
      startInput.oninput = onStartChange;
      endInput.onchange = () => {
        const endISO = window.YasnaJalali ? window.YasnaJalali.iso(endInput) : endInput.value;
        if (endISO) {
          currentProgram.end_date = endISO;
          setDirty(true);
        }
      };
    }

    document.getElementById('closeDrawer').onclick=closeDrawer;
    document.getElementById('drawerBackdrop').onclick=closeDrawer;
    const drawerDoneButton=document.getElementById('drawerDone');
    if(drawerDoneButton)drawerDoneButton.onclick=closeDrawer;
    const manualToggle=document.getElementById('drawerManualToggle');
    if(manualToggle)manualToggle.onclick=()=>toggleQuickAddPanel();
    const quickAddSubmitButton=document.getElementById('quickAddSubmit');
    if(quickAddSubmitButton)quickAddSubmitButton.onclick=submitQuickAddExercise;
    document.querySelectorAll('[data-bank-location]').forEach(button=>button.onclick=()=>selectDrawerLocation(button.dataset.bankLocation));
    const globalSearch=document.getElementById('drawerGlobalSearch');
    if(globalSearch){
      let globalTimeout;
      globalSearch.oninput=()=>{clearTimeout(globalTimeout);globalTimeout=setTimeout(()=>doGlobalDrawerSearch(globalSearch.value),250);};
    }
    const drawerSearch=document.getElementById('drawerSearch');
    drawerSearch.oninput=()=>{
      clearTimeout(drawerSearchTimeout);
      drawerSearchTimeout=setTimeout(()=>{
        if(currentDrawerLocation!=='all'&&currentDrawerCat)loadDrawerExercises(currentDrawerCat,currentDrawerSub,drawerSearch.value);
        else loadDrawerExercises(null,null,drawerSearch.value);
      },200);
    };

    // Close contextual menus when clicking outside or pressing Escape
    document.addEventListener('click',event=>{ if(!event.target.closest('.builder-menu-wrap')) closeAllMenus(); });
    document.addEventListener('keydown',event=>{ if(event.key==='Escape'){ closeAllMenus(); closeSystemPicker(); } });
    document.getElementById('closeSystemPicker').onclick=closeSystemPicker;
    document.getElementById('systemPickerBackdrop').onclick=closeSystemPicker;
    document.getElementById('mvClose').onclick=closeMovementModal;
    document.getElementById('mvCloseX').onclick=closeMovementModal;
    document.getElementById('mvConfirm').onclick=()=>{
      const mov=mvMovement();
      const err=document.getElementById('mvSetsError');
      const container=document.getElementById('mvSetsContainer');
      const presetSelect=document.getElementById('mvPresetSelect');
      if(!mov||!(mov.sets&&mov.sets.length)){
        if(err){err.textContent='انتخاب ست‌های پیشنهادی یا تعیین حداقل یک ست الزامی است.';err.hidden=false;}
        if(container)container.classList.add('mv-shake');
        if(presetSelect){presetSelect.classList.add('mv-input-error');presetSelect.focus();}
        return;
      }
      closeMovementModal();
    };
    document.getElementById('mvBack').onclick=closeMovementModal;
    document.getElementById('mvBackdrop').onclick=closeMovementModal;


    // Dirty state warning
    window.addEventListener('beforeunload', (e)=>{
      if(dirty){
        e.preventDefault();
        e.returnValue = 'تغییرات ذخیره نشده دارید. آیا مطمئنید؟';
      }
    });

    // Autosave every 30 seconds
    setInterval(()=>{
      if(dirty && currentProgram.title){
        console.log('Autosave triggered...');
        // In real app, save to stash (localStorage)
        localStorage.setItem('yasnafit_program_stash', JSON.stringify(currentProgram));
      }
    }, 30000);
  }

  async function saveProgram(returnAfter, silent=false){
    const title=document.getElementById('progTitle').value.trim();
    const coachNote=document.getElementById('progNote').value.trim();
    const startEl=document.getElementById('progStart'),endEl=document.getElementById('progEnd');
    const start=window.YasnaJalali?window.YasnaJalali.iso(startEl):startEl.value;
    const end=window.YasnaJalali?window.YasnaJalali.iso(endEl):endEl.value;
    const studentId=document.getElementById('progStudent').value||null;

    if(!title) return alert('عنوان برنامه الزامی است');

    currentProgram.title=title;
    currentProgram.coach_note=coachNote;
    currentProgram.start_date=start;
    currentProgram.end_date=end;
    currentProgram.student_id=studentId?Number(studentId):null;

    try {
      let res;
      const programStatus = (currentProgram.status === 'ACTIVE' || currentProgram.status === 'فعال') ? 'ACTIVE' : 'DRAFT';
      if(currentProgram.id){
        res=await api(`/api/training-programs/${currentProgram.id}`, {method:'PUT', body: JSON.stringify({title, coach_note: coachNote, status: programStatus, start_date: start, end_date: end, student_id: studentId?Number(studentId):null, assessment_id:currentProgram.assessment_id||null, program_data: currentProgram})});
      } else {
        res=await api('/api/training-programs', {method:'POST', body: JSON.stringify({title, coach_note: coachNote, status:'DRAFT', start_date: start, end_date: end, student_id: studentId?Number(studentId):null, assessment_id:currentProgram.assessment_id||null, program_data: currentProgram})});
        currentProgram.id=res.id;
      }
      setDirty(false);
      localStorage.removeItem('yasnafit_program_stash');
      if(!silent) alert(programStatus==='ACTIVE' ? '✅ برنامه با موفقیت ذخیره و به‌روزرسانی شد' : '✅ پیش‌نویس برنامه با موفقیت ذخیره شد');
      if(returnAfter) location.href='/templates/exercise/list';
      return true;
    } catch(e){
      alert('خطا در ذخیره: '+e.message);
      return false;
    }
  }

  async function loadProgramIfEditing(){
    const params=new URLSearchParams(location.search);
    const id=params.get('id');
    const sourceStudentId=Number(params.get('student_id'))||null;
    const sourceAssessmentId=Number(params.get('assessment_id'))||null;
    if(id){
      try {
        const prog=await api(`/api/training-programs/${id}/full`);
        currentProgram = {
          id: prog.id,
          title: prog.title,
          coach_note: prog.coach_note||'',
          start_date: prog.start_date||'',
          end_date: prog.end_date||'',
          student_id: prog.student_id||null,
          assessment_id: prog.assessment_id||null,
          status: prog.status||'DRAFT',
          version: prog.program_data?.version||2,
          days: prog.program_data?.days||[]
        };
        if(currentProgram.days.length===0){
          currentProgram.days = createEmptyProgram().days;
        }
      } catch(e){
        console.error('Failed to load program', e);
        // Try stash
        const stash = localStorage.getItem('yasnafit_program_stash');
        if(stash){
          if(confirm('یک نسخه ذخیره موقت (stash) پیدا شد. بارگزاری شود؟')){
            currentProgram = JSON.parse(stash);
          } else {
            currentProgram = createEmptyProgram();
          }
        } else {
          currentProgram = createEmptyProgram();
        }
      }
    } else if(sourceStudentId && sourceAssessmentId) {
      // Starting from an approved assessment must never restore an unrelated stash.
      currentProgram=createEmptyProgram();
      currentProgram.student_id=sourceStudentId;
      currentProgram.assessment_id=sourceAssessmentId;
      currentProgram.title=`برنامه ماهانه - ارزیابی ${sourceAssessmentId}`;
    } else {
      const stash = localStorage.getItem('yasnafit_program_stash');
      if(stash){
        if(confirm('یک برنامه ذخیره نشده از قبل وجود دارد (autosave). ادامه می‌دهید؟')) currentProgram = JSON.parse(stash);
        else currentProgram = createEmptyProgram();
      } else currentProgram = createEmptyProgram();
    }

    if(currentProgram.assessment_id)await loadAssessmentContext(currentProgram.assessment_id,currentProgram.student_id);
    document.getElementById('progTitle').value = currentProgram.title||'';
    document.getElementById('progNote').value = currentProgram.coach_note||'';
    const setISOField=(el,iso)=>{ if(window.YasnaJalali) window.YasnaJalali.set(el, iso||''); else el.value=iso||''; };
    setISOField(document.getElementById('progStart'), currentProgram.start_date);
    setISOField(document.getElementById('progEnd'), currentProgram.end_date);
    activeDayIdx=0;
  }

  window.renderProgramBuilder = async (label, route) => {
    window.current=route;currentProgram=null;assessmentContext=null;setDirty(false);activeDayIdx=0;Object.keys(expandedMovements).forEach(key=>delete expandedMovements[key]);
    document.querySelector('#breadcrumb').textContent=label;
    document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active', x.dataset.route===route));
    const previousDrawer=document.querySelector('body > #exerciseDrawer');
    if(previousDrawer)previousDrawer.remove();
    const previousPicker=document.querySelector('body > #systemPicker');
    if(previousPicker)previousPicker.remove();
    document.querySelector('#content').innerHTML = root();
    if(window.YasnaJalali)window.YasnaJalali.autoInit();
    mountExerciseDrawer();
    bindMainEvents();
    try{await loadProgramIfEditing();await loadStudents();renderAssessmentContext();renderDays();}
    catch(error){document.querySelector('#content').innerHTML=`<section class="panel error"><h2>ساخت برنامه آماده نشد</h2><p>${esc(error.message)}</p><a class="secondary" href="/students/submissions">بازگشت به ارزیابی‌ها</a></section>`;}
  };

  window.renderTrainingProgramsList = async (label, route) => {
    window.current=route;
    document.querySelector('#breadcrumb').textContent=label;
    document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active', x.dataset.route===route));
    const content=document.querySelector('#content');
    content.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">بانک برنامه‌ها • بازطراحی شده</p><h1>${label}</h1><p>برنامه‌های تمرینی بر اساس ساختار روز → سیستم → حرکت → ست</p></div>
        <button class="primary" id="btnNewProg">＋ برنامه تمرینی جدید</button>
      </div>
      <div id="progList" class="program-list">در حال بارگذاری...</div>
    `;
    document.getElementById('btnNewProg').onclick=()=>{ location.href='/programs/exercise/form'; };
    try {
      const list=await api('/api/training-programs');
      const host=document.getElementById('progList');
      if(list.length===0){
        host.innerHTML=`<div class="empty-state"><div class="empty-icon">📋</div><h3>هنوز برنامه‌ای ساخته نشده</h3><p>یک برنامه تمرینی جدید با ساختار روز → سیستم → حرکت → ست بسازید (نسخه 2، با هش‌ها)</p><button class="btn btn-primary" onclick="location.href='/programs/exercise/form'">＋ ساخت اولین برنامه</button></div>`;
        return;
      }
      host.innerHTML = list.map(p=>{
        const daysCount = p.program_data?.days?.length||0;
        const movementsCount = (p.program_data?.days||[]).reduce((sum,d)=> sum + (d.data||[]).reduce((s2,sys)=> s2 + (sys.movement_list||[]).length,0),0);
        const setsCount = (p.program_data?.days||[]).reduce((sum,d)=> sum + (d.data||[]).reduce((s2,sys)=> s2 + (sys.movement_list||[]).reduce((s3,m)=> s3 + (m.sets||[]).length,0),0),0);
        return `
        <div class="program-card">
          <h3>${esc(p.title)} <small style="color:var(--text-muted)">v${p.program_data?.version||2}</small></h3>
          <p>${esc(p.coach_note||'بدون توضیح')}</p>
          <div class="program-meta">
            <span>📅 ${window.YasnaJalali?window.YasnaJalali.formatSafe(p.start_date):esc(p.start_date||'—')} تا ${window.YasnaJalali?window.YasnaJalali.formatSafe(p.end_date):esc(p.end_date||'—')}</span>
            <span>📆 ${daysCount} روز</span>
            <span>🏋️ ${movementsCount} حرکت</span>
            <span>🔁 ${setsCount} ست</span>
            <span>👤 ${esc(p.student_name||'بدون شاگرد')}${p.student_case_number?` • پرونده ${esc(p.student_case_number)}`:''}</span>
            <span>📋 ${p.assessment_number?`ارزیابی #${p.assessment_number} • ${esc(fa(p.assessment_type))}`:'بدون ارزیابی'}</span>
            <span>🗓 ${p.start_date?new Date(`${p.start_date}T00:00:00`).toLocaleDateString('fa-IR',{month:'long',year:'numeric'}):'—'}</span>
            <span>🔑 ${esc(fa(p.status||'DRAFT'))}</span>
          </div>
          <div class="program-actions">
            <button class="btn btn-primary btn-small" onclick="location.href='/programs/exercise/form?id=${p.id}'">✏️ ویرایش</button>
            <button class="btn btn-secondary btn-small" data-preview="${p.id}">👁 JSON</button>
            <button class="btn btn-secondary btn-small" data-pdf="${p.id}">📄 PDF</button>
            <button class="btn btn-danger btn-small" data-del="${p.id}">🗑 حذف</button>
          </div>
        </div>
        `;
      }).join('');
      host.querySelectorAll('[data-del]').forEach(b=>{
        b.onclick=async()=>{
          const id=b.dataset.del;
          if(confirm('برنامه حذف شود؟')){
            await api(`/api/training-programs/${id}`, {method:'DELETE'});
            location.reload();
          }
        };
      });
      host.querySelectorAll('[data-preview]').forEach(b=>{
        b.onclick=async()=>{
          const id=b.dataset.preview;
          const prog=await api(`/api/training-programs/${id}/full`);
          const w=window.open();
          w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>${esc(prog.title)}</title><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/unified-components.css"></head><body style="margin:0;padding:24px;background:var(--bg);color:var(--text-primary)"><h2>${esc(prog.title)}</h2><pre dir="ltr" style="text-align:left;background:var(--card);border:1px solid var(--border);padding:18px;border-radius:12px;color:var(--text-secondary)">${esc(JSON.stringify(prog.program_data, null, 2))}</pre></body></html>`);
        };
      });
      host.querySelectorAll('[data-pdf]').forEach(b=>{
        b.onclick = () => {
          const id = Number(b.dataset.pdf);
          if (window.openProgramPDF) {
            window.openProgramPDF(id);
          }
        };
      });
    } catch(e){
      document.getElementById('progList').innerHTML=`<div class="error">خطا: ${esc(e.message)}</div>`;
    }
  };
})();
