(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const genHash = () => Math.random().toString(36).substring(2,10) + Date.now().toString(36);
  
  let currentProgram = null;
  let exerciseCategories = [];
  let selectedSystemForAdd = null;
  let dirty = false;

  // Based on PROMPT: ESetType
  const setTypes = [
    { id: 'REPEAT', label: 'تکرار', placeholder: '12', icon: '🔁' },
    { id: 'TIME', label: 'زمان', placeholder: '30 ثانیه', icon: '⏱️' },
    { id: 'FAILURE', label: 'تا خستگی', placeholder: '-', icon: '💥' },
    { id: 'AMRAP', label: 'AMRAP', placeholder: 'تا حد توان', icon: '♾️' },
    { id: 'DROPSET', label: 'دراپ‌ست', placeholder: '12-10-8', icon: '📉' },
    { id: 'SUPERSET', label: 'سوپرست', placeholder: 'سوپرست', icon: '⚡' },
    { id: 'GIANT_SET', label: 'جاینت‌ست', placeholder: 'جاینت', icon: '🔥' },
  ];

  const systemTypes = [
    { id: 1, label: 'عادی', type: 'normal', desc: 'حرکت تکی', icon: '1️⃣' },
    { id: 2, label: 'سوپرست', type: 'superset', desc: 'دو حرکت پشت سر هم', icon: '⚡' },
    { id: 3, label: 'تری‌ست', type: 'triset', desc: 'سه حرکت', icon: '🔺' },
    { id: 4, label: 'جاینت‌ست', type: 'giant', desc: 'چهار+ حرکت', icon: '🔥' },
    { id: 5, label: 'دراپ‌ست', type: 'drop', desc: 'کاهش وزن تدریجی', icon: '📉' },
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
    return {
      title: 'برنامه تمرینی جدید',
      coach_note: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now()+29*24*3600*1000).toISOString().split('T')[0],
      status: 'DRAFT',
      student_id: null,
      assessment_id: null,
      version: 2,
      days: [
        {
          day_number: 1,
          dayHash: genHash(),
          focus: 'بالاتنه',
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

  function root() {
    const vol = currentProgram ? calculateVolume(currentProgram) : {totalSets:0, totalMovs:0, totalDays:0};
    return `
    <div class="program-builder">
      <div class="order-header">
        <div>
          <h2>ویرایش برنامه ${esc(currentProgram?.title||'جدید')} ${currentProgram?.start_date?` - ${esc(currentProgram.start_date)}`:''}</h2>
          <small>مسیر: /programs/exercise/form • موضوع مجوز: PRG-EXR • نسخه: ${currentProgram?.version||2} • ${dirty?'⚠️ تغییرات ذخیره نشده':''}</small>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-small" onclick="history.back()">← بازگشت به سفارشات</button>
        </div>
      </div>

      <div class="builder-header">
        <div>
          <h1>🏋️ ساخت برنامه تمرینی</h1>
          <p>ساختار: روز → سیستم تمرینی → حرکت → ست (بر اساس پرامپت بازطراحی)</p>
        </div>
        <div class="header-actions">
          <span class="volume-badge">📊 ${vol.totalDays} روز • ${vol.totalMovs} حرکت • ${vol.totalSets} ست</span>
          <button class="btn btn-secondary" id="btnList">📋 لیست برنامه‌ها</button>
          <button class="btn btn-secondary" id="btnPreview">👁 JSON</button>
          <button class="btn btn-secondary" id="btnStats">📈 آمار</button>
        </div>
      </div>

      <div class="builder-form">
        <div class="form-row">
          <label>عنوان برنامه * (title)
            <input id="progTitle" placeholder="مثلاً برنامه چربی‌سوزی شهریور - ماه اول">
          </label>
          <label>شاگرد
            <select id="progStudent"><option value="">بدون شاگرد</option></select>
          </label>
        </div>
        <div class="form-row">
          <label>سطح (Level)
            <select id="progLevel">
              ${levels.map(l=>`<option value="${l.id}">${l.label}</option>`).join('')}
            </select>
          </label>
          <label>مکان (Location)
            <select id="progLocation">
              ${locations.map(l=>`<option value="${l.id}">${l.label}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>هدف (Target)
            <select id="progTarget"><option value="Fitness">فیتنس</option></select>
          </label>
          <label>آسیب (Injury)
            <select id="progInjury">
              ${injuries.map(i=>`<option value="${i.id}">${i.label}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="form-row">
          <label>تاریخ شروع
            <input type="date" id="progStart">
          </label>
          <label>تاریخ پایان
            <input type="date" id="progEnd">
          </label>
        </div>
        <div class="form-row full">
          <label>توضیحات مربی (coach_note)
            <textarea id="progNote" placeholder="توضیحات کلی برنامه، نکات تغذیه، استراحت..."></textarea>
          </label>
        </div>
      </div>

      <div class="days-container" id="daysContainer"></div>

      <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btnAddDay">＋ افزودن روز تمرینی</button>
        <button class="btn btn-secondary" id="btnAddRestDay">🌙 روز استراحت</button>
        <button class="btn btn-secondary" id="btnCopyLastDay">📋 کپی آخرین روز</button>
      </div>

      <div class="bottom-toolbar">
        <button class="btn btn-secondary" id="btnSaveReturn">💾 ذخیره و بازگشت</button>
        <button class="btn btn-primary" id="btnSave">💾 ذخیره پیش‌نویس</button>
        <button class="btn btn-primary" id="btnAssign">✅ ذخیره و اختصاص به شاگرد</button>
        <button class="btn btn-secondary" id="btnSaveTemplate">📄 ذخیره به عنوان نمونه</button>
        <button class="btn btn-secondary" id="btnLoadTemplate">📂 بارگزاری از نمونه</button>
        <button class="btn btn-secondary" id="btnLoadPrev">🕘 برنامه قبلی</button>
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="btnCalorie">🧮 محاسبه‌گر کالری</button>
        <button class="btn btn-secondary" id="btnAssist">👥 دستیارها</button>
        <span class="volume-badge" id="volBadge">${vol.totalSets} ست • ${vol.totalMovs} حرکت</span>
      </div>
    </div>

    <!-- Drawer with 3 tabs: سوابق, افزودن حرکت, مقایسه -->
    <div class="drawer" id="exerciseDrawer">
      <div class="drawer-backdrop" id="drawerBackdrop"></div>
      <div class="drawer-panel">
        <div class="drawer-header">
          <h3 id="drawerTitle">افزودن حرکت</h3>
          <button class="btn-icon" id="closeDrawer">×</button>
        </div>
        <div class="drawer-tabs">
          <button data-tab="add" class="active">🏋️ افزودن حرکت</button>
          <button data-tab="history">🕘 سوابق</button>
          <button data-tab="compare">📊 مقایسه</button>
        </div>
        <div id="drawerTabAdd">
          <div class="drawer-search">
            <input id="drawerSearch" placeholder="جستجوی هوشمند حرکت... مثلاً پرس سینه">
          </div>
          <div class="drawer-cats" id="drawerCats"></div>
          <div class="drawer-list" id="drawerList"></div>
        </div>
        <div id="drawerTabHistory" style="display:none;padding:16px">
          <p style="color:var(--text-muted);font-size:13px">سوابق برنامه‌های قبلی کاربر اینجا نمایش داده می‌شود</p>
          <div id="historyList"></div>
        </div>
        <div id="drawerTabCompare" style="display:none;padding:16px">
          <p style="color:var(--text-muted);font-size:13px">مقایسه با اطرافیان و میانگین‌ها</p>
          <div id="compareContent">در دست ساخت</div>
        </div>
      </div>
    </div>
    `;
  }

  function renderDays() {
    const host = document.getElementById('daysContainer');
    if(!host) return;
    const days = currentProgram.days || [];

    if(days.length===0){
      host.innerHTML = `<div class="empty-day"><p>هنوز روزی اضافه نشده. یک روز تمرینی اضافه کنید.</p></div>`;
      return;
    }

    host.innerHTML = days.map((day, dayIdx) => {
      const isRest = day.isRestDay;
      const vol = {movs:0, sets:0};
      (day.data||[]).forEach(sys=>{ vol.movs += (sys.movement_list||[]).length; (sys.movement_list||[]).forEach(m=> vol.sets += (m.sets||[]).length); });

      return `
      <div class="day-card" data-day-idx="${dayIdx}">
        <div class="day-header">
          <h3>
            <span class="day-number">${day.day_number}</span>
            روز ${day.day_number} ${isRest ? '🌙 استراحت' : `💪 ${esc(day.focus||'بدون تمرکز')}`}
            <small style="color:var(--text-muted);font-size:11px">(${vol.movs} حرکت • ${vol.sets} ست) • Hash: ${esc((day.dayHash||'').substring(0,6))}</small>
          </h3>
          <div class="day-actions">
            <input class="day-focus-input" data-focus="${dayIdx}" value="${esc(day.focus||'')}" placeholder="تمرکز: بالاتنه، پا، فول بادی...">
            <label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" data-rest="${dayIdx}" ${isRest?'checked':''}> استراحت</label>
            <button class="btn btn-secondary btn-small" data-move-day-up="${dayIdx}" ${dayIdx===0?'disabled':''}>↑</button>
            <button class="btn btn-secondary btn-small" data-move-day-down="${dayIdx}" ${dayIdx===days.length-1?'disabled':''}>↓</button>
            <button class="btn btn-secondary btn-small" data-copy-day="${dayIdx}">📋 کپی</button>
            <button class="btn btn-danger btn-small" data-del-day="${dayIdx}">🗑 حذف روز</button>
          </div>
        </div>
        ${isRest ? `<div style="padding:20px;text-align:center;color:var(--text-muted)">🌙 روز استراحت - ریکاوری و تغذیه • ${esc(day.coachNote||'')}</div>` : `
        <div class="systems-list">
          ${(day.data||[]).map((sys, sysIdx) => `
            <div class="system-card" data-sys-idx="${sysIdx}" data-day-idx="${dayIdx}">
              <div class="system-header">
                <h4>
                  ${systemTypes.find(t=>t.id===(sys.exercise_system_id||1))?.icon||'1️⃣'} سیستم ${sysIdx+1}
                  <span class="system-type">${esc(systemTypes.find(t=>t.id===(sys.exercise_system_id||1))?.label||'عادی')} - ${esc(sys.system_type||'normal')}</span>
                  <small style="color:var(--text-muted)">Hash: ${(sys.exerciseSystemHash||'').substring(0,6)}</small>
                </h4>
                <div class="system-actions">
                  <select data-sys-type="${dayIdx}-${sysIdx}" class="day-focus-input" style="min-width:140px">
                    ${systemTypes.map(t=>`<option value="${t.id}" ${t.id===(sys.exercise_system_id||1)?'selected':''}>${t.icon} ${t.label} - ${t.desc}</option>`).join('')}
                  </select>
                  <button class="btn btn-danger btn-small" data-del-sys="${dayIdx}-${sysIdx}">حذف سیستم</button>
                </div>
              </div>
              <div class="movements-list">
                ${(sys.movement_list||[]).length===0 ? `<div class="empty-system">هنوز حرکتی اضافه نشده. از بانک 2707 تایی انتخاب کنید. تصویر و ویدیو نمایش داده می‌شود.</div>` : ''}
                ${(sys.movement_list||[]).map((mov, movIdx) => `
                  <div class="movement-card" data-mov-idx="${movIdx}" data-sys-idx="${sysIdx}" data-day-idx="${dayIdx}">
                    <div class="movement-image">
                      ${mov.exercise_id ? `<img src="/api/exercise-image/${mov.exercise_id}" onerror="this.parentElement.innerHTML='🏋️'" loading="lazy">` : '🏋️'}
                    </div>
                    <div class="movement-info">
                      <b>${esc(mov.nameFa||mov.name||'حرکت بدون نام')} <small style="color:var(--text-secondary)">${mov.exercise_id?`ID:${mov.exercise_id}`:''} • ${esc(mov.movementHash||'').substring(0,6)}</small></b>
                      <div class="movement-desc" style="margin-top:6px">
                        <input data-mov-desc="${dayIdx}-${sysIdx}-${movIdx}" value="${esc(mov.description||'')}" placeholder="توضیح: مثلاً 3 ثانیه مکث در پایین، تمرکز روی انقباض">
                      </div>
                      <div class="sets-list">
                        <div style="display:flex;gap:6px;font-size:10px;color:var(--text-muted);padding:4px 0">
                          <span style="min-width:80px">نوع ست (ESetType)</span>
                          <span style="min-width:80px">تعداد (count)</span>
                          <span>وزن</span>
                          <span>استراحت</span>
                          <span>عملیات</span>
                        </div>
                        ${(mov.sets||[]).map((s, setIdx) => `
                          <div class="set-row" data-set-idx="${setIdx}">
                            <span class="set-type">${esc(setTypes.find(t=>t.id===s.type)?.icon||'🔁')} ${esc(setTypes.find(t=>t.id===s.type)?.label||s.type)}</span>
                            <select data-set-type="${dayIdx}-${sysIdx}-${movIdx}-${setIdx}" style="min-width:110px">
                              ${setTypes.map(t=>`<option value="${t.id}" ${t.id===s.type?'selected':''}>${t.icon} ${t.label}</option>`).join('')}
                            </select>
                            <input data-set-count="${dayIdx}-${sysIdx}-${movIdx}-${setIdx}" type="text" value="${esc(s.count||'')}" placeholder="12 یا 30 ثانیه" style="min-width:90px">
                            <input data-set-weight="${dayIdx}-${sysIdx}-${movIdx}-${setIdx}" type="number" value="${s.weight||''}" placeholder="وزن" style="width:70px">
                            <input data-set-rest="${dayIdx}-${sysIdx}-${movIdx}-${setIdx}" type="number" value="${s.restSeconds||60}" placeholder="استراحت" style="width:70px">
                            <div class="set-actions">
                              <button class="btn-icon" data-del-set="${dayIdx}-${sysIdx}-${movIdx}-${setIdx}" title="حذف ست">×</button>
                            </div>
                          </div>
                        `).join('')}
                        <div style="display:flex;gap:8px;margin-top:6px">
                          <button class="btn btn-secondary btn-small" data-add-set="${dayIdx}-${sysIdx}-${movIdx}">＋ ست (REPEAT)</button>
                          <button class="btn btn-secondary btn-small" data-add-set-time="${dayIdx}-${sysIdx}-${movIdx}">⏱️ ست زمان‌دار</button>
                          <button class="btn btn-secondary btn-small" data-add-set-fail="${dayIdx}-${sysIdx}-${movIdx}">💥 تا خستگی</button>
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                      <button class="btn-icon" data-move-mov-up="${dayIdx}-${sysIdx}-${movIdx}" title="بالا">↑</button>
                      <button class="btn-icon" data-move-mov-down="${dayIdx}-${sysIdx}-${movIdx}" title="پایین">↓</button>
                      <button class="btn-icon" data-del-mov="${dayIdx}-${sysIdx}-${movIdx}" title="حذف حرکت">🗑</button>
                    </div>
                  </div>
                `).join('')}
                <div class="add-movement-bar">
                  <button class="btn btn-primary btn-small" data-add-mov="${dayIdx}-${sysIdx}">＋ افزودن حرکت از بانک (2707)</button>
                  <button class="btn btn-secondary btn-small" data-suggest-mov="${dayIdx}-${sysIdx}">💡 پیشنهاد جایگزین</button>
                </div>
              </div>
            </div>
          `).join('')}
          <button class="btn btn-secondary btn-small" data-add-sys="${dayIdx}">＋ افزودن سیستم تمرینی (ExerciseSystem)</button>
        </div>
        `}
      </div>
      `;
    }).join('');

    bindDayEvents();
    updateVolume();
  }

  function updateVolume(){
    const vol = calculateVolume(currentProgram);
    const badge = document.getElementById('volBadge');
    if(badge) badge.textContent = `${vol.totalSets} ست • ${vol.totalMovs} حرکت • ${vol.totalDays} روز`;
    // Warning for high volume
    if(vol.totalSets > 100){
      if(!document.getElementById('volWarning')){
        const header = document.querySelector('.builder-header .header-actions');
        if(header){
          const warn = document.createElement('span');
          warn.id='volWarning';
          warn.className='volume-badge';
          warn.style.background='var(--danger-surface)';
          warn.style.color='var(--danger)';
          warn.style.borderColor='var(--danger-border)';
          warn.textContent = `⚠️ حجم بالا: ${vol.totalSets} ست`;
          header.append(warn);
        }
      }
    } else {
      const w=document.getElementById('volWarning');
      if(w) w.remove();
    }
  }

  function bindDayEvents(){
    document.querySelectorAll('[data-del-day]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.delDay);
        if(confirm(`روز ${currentProgram.days[idx].day_number} حذف شود؟`)){
          currentProgram.days.splice(idx,1);
          currentProgram.days.forEach((d,i)=>d.day_number=i+1);
          dirty=true;
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
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-move-day-up]').forEach(b=>{
      b.onclick=()=>{
        const idx=Number(b.dataset.moveDayUp);
        if(idx>0){
          [currentProgram.days[idx-1], currentProgram.days[idx]] = [currentProgram.days[idx], currentProgram.days[idx-1]];
          currentProgram.days.forEach((d,i)=>d.day_number=i+1);
          dirty=true;
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
          dirty=true;
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-focus]').forEach(inp=>{
      inp.onchange=()=>{
        const idx=Number(inp.dataset.focus);
        currentProgram.days[idx].focus = inp.value;
        dirty=true;
      };
    });
    document.querySelectorAll('[data-rest]').forEach(chk=>{
      chk.onchange=()=>{
        const idx=Number(chk.dataset.rest);
        currentProgram.days[idx].isRestDay = chk.checked;
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-add-sys]').forEach(b=>{
      b.onclick=()=>{
        const dayIdx=Number(b.dataset.addSys);
        currentProgram.days[dayIdx].data.push({
          exercise_system_id: 1,
          exerciseSystemHash: genHash(),
          system_type: 'normal',
          movement_list: []
        });
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-del-sys]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx]=b.dataset.delSys.split('-').map(Number);
        currentProgram.days[dayIdx].data.splice(sysIdx,1);
        dirty=true;
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
        dirty=true;
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
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-move-mov-up]').forEach(b=>{
      b.onclick=()=>{
        const [dayIdx, sysIdx, movIdx]=b.dataset.moveMovUp.split('-').map(Number);
        const list=currentProgram.days[dayIdx].data[sysIdx].movement_list;
        if(movIdx>0){
          [list[movIdx-1], list[movIdx]]=[list[movIdx], list[movIdx-1]];
          dirty=true;
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
          dirty=true;
          renderDays();
        }
      };
    });
    document.querySelectorAll('[data-mov-desc]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx]=inp.dataset.movDesc.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].description = inp.value;
        dirty=true;
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
      dirty=true;
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
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-set-type]').forEach(sel=>{
      sel.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=sel.dataset.setType.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].type = sel.value;
        dirty=true;
        renderDays();
      };
    });
    document.querySelectorAll('[data-set-count]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setCount.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].count = inp.value||null;
        dirty=true;
      };
    });
    document.querySelectorAll('[data-set-weight]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setWeight.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].weight = Number(inp.value)||0;
        dirty=true;
      };
    });
    document.querySelectorAll('[data-set-rest]').forEach(inp=>{
      inp.onchange=()=>{
        const [dayIdx, sysIdx, movIdx, setIdx]=inp.dataset.setRest.split('-').map(Number);
        currentProgram.days[dayIdx].data[sysIdx].movement_list[movIdx].sets[setIdx].restSeconds = Number(inp.value)||60;
        dirty=true;
      };
    });
  }

  // Drawer
  let drawerSearchTimeout;
  async function openExerciseDrawer(){
    document.getElementById('exerciseDrawer').classList.add('open');
    if(exerciseCategories.length===0){
      try {
        exerciseCategories = await api('/api/categories/grouped');
        renderDrawerCats();
      } catch(e){ console.error(e); }
    }
    loadDrawerExercises();
    loadHistory();
  }
  function closeDrawer(){
    document.getElementById('exerciseDrawer').classList.remove('open');
    selectedSystemForAdd=null;
  }
  function renderDrawerCats(){
    const host=document.getElementById('drawerCats');
    host.innerHTML = `<button data-cat="all" class="active">همه</button>` + exerciseCategories.map(c=>`<button data-cat="${c.id}">${esc(c.name)} (${c.count})</button>`).join('');
    host.querySelectorAll('button').forEach(b=>{
      b.onclick=()=>{
        host.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        loadDrawerExercises(b.dataset.cat);
      };
    });
  }
  let currentDrawerCat='all';
  async function loadDrawerExercises(catId='all'){
    const host=document.getElementById('drawerList');
    host.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted)">در حال بارگذاری...</div>`;
    currentDrawerCat=catId;
    const searchVal=document.getElementById('drawerSearch').value.trim();
    try {
      if(catId==='all' && !searchVal){
        host.innerHTML=`<div style="text-align:center;padding:20px">یک دسته انتخاب کنید یا جستجو کنید<br><small>بانک 2707 حرکتی با تصویر</small></div>`;
        return;
      }
      let allItems=[];
      if(catId==='all' && searchVal){
        const catsToSearch=['chest','back','shoulders','legs','biceps','triceps','abs'];
        for(const c of catsToSearch){
          try{
            const res=await api(`/api/exercises?categoryId=${c}&status=active&page=0&pageSize=15&query=${encodeURIComponent(searchVal)}`);
            allItems = allItems.concat(res.items||[]);
            if(allItems.length>=40) break;
          }catch(e){}
        }
        renderDrawerList(allItems);
        return;
      } else {
        const q = new URLSearchParams({categoryId: catId, status:'active', page:0, pageSize:40, query: searchVal});
        const res = await api(`/api/exercises?${q}`);
        renderDrawerList(res.items||[]);
      }
    } catch(e){
      host.innerHTML=`<div style="color:var(--danger);padding:20px">خطا: ${esc(e.message)}</div>`;
    }
  }
  function renderDrawerList(items){
    const host=document.getElementById('drawerList');
    if(items.length===0){
      host.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted)">حرکتی پیدا نشد</div>`;
      return;
    }
    host.innerHTML = items.map(ex=>`
      <div class="drawer-item" data-ex-id="${ex.id}" data-ex-orig="${ex.original_id}" data-ex-name="${esc(ex.name_fa)}">
        <img src="/api/exercise-image/${ex.original_id}" onerror="this.style.display='none'" loading="lazy">
        <div>
          <b>${esc(ex.name_fa)}</b>
          <small>${esc(ex.category_id)} • ${esc(ex.subcategory_id||'')} • اولویت ${ex.priority||5}</small>
        </div>
        <span style="margin-left:auto;color:var(--text-secondary)">＋</span>
      </div>
    `).join('');
    host.querySelectorAll('.drawer-item').forEach(el=>{
      el.onclick=()=>{
        const exId=Number(el.dataset.exId);
        const origId=el.dataset.exOrig;
        const name=el.dataset.exName;
        if(selectedSystemForAdd){
          const {dayIdx, sysIdx}=selectedSystemForAdd;
          currentProgram.days[dayIdx].data[sysIdx].movement_list.push({
            exercise_id: origId,
            exerciseId: exId,
            nameFa: name,
            name: name,
            movementHash: genHash(),
            description: '',
            sets: [{type:'REPEAT', count:12, restSeconds:60, setHash: genHash()}]
          });
          dirty=true;
          renderDays();
          closeDrawer();
        }
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
        dirty=true;
        renderDays();
        closeDrawer();
      }
    } catch(e){ alert('خطا: '+e.message); }
  };

  async function loadStudents(){
    try {
      const students = await api('/api/students');
      const sel=document.getElementById('progStudent');
      if(sel){
        sel.innerHTML = `<option value="">بدون شاگرد</option>` + students.map(s=>`<option value="${s.id}">پرونده ${esc(s.case_number||'------')} • ${esc(s.full_name)} • ${esc(s.goal||'بدون هدف')}</option>`).join('');
        if(currentProgram.student_id) sel.value = currentProgram.student_id;
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
        data: [{exercise_system_id:1, exerciseSystemHash: genHash(), system_type:'normal', movement_list:[]}]
      });
      dirty=true;
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
      dirty=true;
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
      dirty=true;
      renderDays();
    };
    document.getElementById('btnSave').onclick=()=> saveProgram(false);
    document.getElementById('btnSaveReturn').onclick=()=> saveProgram(true);
    document.getElementById('btnAssign').onclick=async()=>{
      if(!currentProgram.assessment_id) return alert('برای اختصاص، برنامه را از صفحه ارزیابی تاییدشده ایجاد کنید.');
      if(!confirm('برنامه ذخیره و به شاگرد اختصاص داده شود؟ پس از اختصاص قابل ویرایش نیست.')) return;
      const saved=await saveProgram(false, true);
      if(!saved) return;
      try{
        await api(`/api/training-programs/${currentProgram.id}/activate`, {method:'POST'});
        dirty=false;
        alert('✅ برنامه فعال و به شاگرد اختصاص داده شد');
        location.href=`/students/${currentProgram.student_id}/timeline`;
      }catch(e){ alert('خطا در اختصاص برنامه: '+e.message); }
    };
    document.getElementById('btnSaveTemplate').onclick=()=>{
      alert('📄 ذخیره به عنوان نمونه برنامه: در نسخه کامل، برنامه به بانک نمونه‌ها ذخیره می‌شود (EExerciseTemplate)');
    };
    document.getElementById('btnLoadTemplate').onclick=()=>{
      alert('📂 بارگزاری از نمونه: لیست نمونه برنامه‌ها (getExerciseTemplateRequest) نمایش داده می‌شود');
    };
    document.getElementById('btnLoadPrev').onclick=()=>{
      selectedSystemForAdd=null;
      document.getElementById('drawerTitle').textContent='سوابق برنامه‌های قبلی';
      document.querySelectorAll('.drawer-tabs button').forEach(b=>b.classList.remove('active'));
      document.querySelector('[data-tab="history"]').classList.add('active');
      document.getElementById('drawerTabAdd').style.display='none';
      document.getElementById('drawerTabHistory').style.display='block';
      document.getElementById('drawerTabCompare').style.display='none';
      openExerciseDrawer();
    };
    document.getElementById('btnList').onclick=()=>{ location.href='/templates/exercise/list'; };
    document.getElementById('btnCalorie').onclick=()=> alert('🧮 محاسبه‌گر کالری: ابزار محاسبه کالری مورد نیاز شاگرد');
    document.getElementById('btnAssist').onclick=()=> alert('👥 دستیارها: مدیریت دستیارها (deleteOrderAssistDeleteRequest, putOrderAssistPassRequest)');
    document.getElementById('btnPreview').onclick=()=>{
      const preview = JSON.stringify(currentProgram, null, 2);
      const w=window.open();
      w.document.write(`<html dir="ltr"><head><meta charset="UTF-8"><title>JSON Preview</title><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/unified-components.css"></head><body style="margin:0;padding:24px;background:var(--bg);color:var(--text-primary)"><pre style="font-family:monospace;white-space:pre-wrap;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px">${esc(preview)}</pre></body></html>`);
    };
    document.getElementById('btnStats').onclick=()=>{
      const vol=calculateVolume(currentProgram);
      alert(`📈 آمار برنامه:\n${vol.totalDays} روز\n${vol.totalMovs} حرکت\n${vol.totalSets} ست\n\nحجم تمرینی: ${vol.totalSets * 12} تکرار تقریبی`);
    };
    document.getElementById('progTitle').oninput=(e)=>{ currentProgram.title=e.target.value; dirty=true; };
    document.getElementById('progNote').oninput=(e)=>{ currentProgram.coach_note=e.target.value; dirty=true; };
    document.getElementById('closeDrawer').onclick=closeDrawer;
    document.getElementById('drawerBackdrop').onclick=closeDrawer;
    document.querySelectorAll('.drawer-tabs button').forEach(btn=>{
      btn.onclick=()=>{
        document.querySelectorAll('.drawer-tabs button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const tab=btn.dataset.tab;
        document.getElementById('drawerTabAdd').style.display = tab==='add'?'block':'none';
        document.getElementById('drawerTabHistory').style.display = tab==='history'?'block':'none';
        document.getElementById('drawerTabCompare').style.display = tab==='compare'?'block':'none';
        if(tab==='history') loadHistory();
      };
    });
    const drawerSearch=document.getElementById('drawerSearch');
    drawerSearch.oninput=()=>{
      clearTimeout(drawerSearchTimeout);
      drawerSearchTimeout=setTimeout(()=>{
        loadDrawerExercises(currentDrawerCat);
      }, 400);
    };

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
    const start=document.getElementById('progStart').value;
    const end=document.getElementById('progEnd').value;
    const studentId=document.getElementById('progStudent').value||null;

    if(!title) return alert('عنوان برنامه الزامی است');

    currentProgram.title=title;
    currentProgram.coach_note=coachNote;
    currentProgram.start_date=start;
    currentProgram.end_date=end;
    currentProgram.student_id=studentId?Number(studentId):null;

    try {
      let res;
      if(currentProgram.id){
        res=await api(`/api/training-programs/${currentProgram.id}`, {method:'PUT', body: JSON.stringify({title, coach_note: coachNote, status:'DRAFT', start_date: start, end_date: end, student_id: studentId?Number(studentId):null, assessment_id:currentProgram.assessment_id||null, program_data: currentProgram})});
      } else {
        res=await api('/api/training-programs', {method:'POST', body: JSON.stringify({title, coach_note: coachNote, status:'DRAFT', start_date: start, end_date: end, student_id: studentId?Number(studentId):null, assessment_id:currentProgram.assessment_id||null, program_data: currentProgram})});
        currentProgram.id=res.id;
      }
      dirty=false;
      localStorage.removeItem('yasnafit_program_stash');
      if(!silent) alert('✅ پیش‌نویس برنامه با موفقیت ذخیره شد');
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

    document.getElementById('progTitle').value = currentProgram.title||'';
    document.getElementById('progNote').value = currentProgram.coach_note||'';
    document.getElementById('progStart').value = currentProgram.start_date||'';
    document.getElementById('progEnd').value = currentProgram.end_date||'';
  }

  window.renderProgramBuilder = async (label, route) => {
    window.current=route;
    document.querySelector('#breadcrumb').textContent=label;
    document.querySelectorAll('.menu-link').forEach(x=>x.classList.toggle('active', x.dataset.route===route));
    document.querySelector('#content').innerHTML = root();
    bindMainEvents();
    await loadProgramIfEditing();
    await loadStudents();
    renderDays();
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
            <span>📅 ${esc(p.start_date||'')} تا ${esc(p.end_date||'')}</span>
            <span>📆 ${daysCount} روز</span>
            <span>🏋️ ${movementsCount} حرکت</span>
            <span>🔁 ${setsCount} ست</span>
            <span>👤 ${esc(p.student_name||'بدون شاگرد')}${p.student_case_number?` • پرونده ${esc(p.student_case_number)}`:''}</span>
            <span>📋 ${p.assessment_number?`ارزیابی #${p.assessment_number} • ${esc(p.assessment_type||'')}`:'بدون ارزیابی'}</span>
            <span>🗓 ${p.start_date?new Date(`${p.start_date}T00:00:00`).toLocaleDateString('fa-IR',{month:'long',year:'numeric'}):'—'}</span>
            <span>🔑 ${esc(p.status||'پیش‌نویس')}</span>
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
        b.onclick=()=> alert('📄 خروجی PDF حرفه‌ای: در نسخه کامل، PDF با لوگو و جدول ست‌ها تولید می‌شود');
      });
    } catch(e){
      document.getElementById('progList').innerHTML=`<div class="error">خطا: ${esc(e.message)}</div>`;
    }
  };
})();
