(() => {
  const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
  const asciiDigits=value=>String(value??'').replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'');
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const listState={search:'',status:'ALL',page:1,pageSize:20};
  const generatedLinks=new Map();
  if(!window.__studentActionMenuCloser){
    window.__studentActionMenuCloser=true;
    document.addEventListener('click',()=>{
      document.querySelectorAll('.student-action-menu-dropdown').forEach(menu=>{menu.hidden=true;});
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape') document.querySelectorAll('.student-action-menu-dropdown').forEach(menu=>{menu.hidden=true;});
    });
  }

  const statusMeta={
    NEW:['جدید','new'], PROFILE_PENDING:['در انتظار تکمیل اطلاعات','pending'],
    PENDING_REVIEW:['در انتظار بررسی','review'], UNDER_REVIEW:['در حال بررسی','reviewing'],
    CHANGES_REQUESTED:['نیاز به اصلاح اطلاعات','warning'],
    APPROVED_AWAITING_PROGRAM:['تایید شده؛ در انتظار برنامه','approved'],
    ACTIVE_PROGRAM:['برنامه فعال','active'], NEEDS_ASSESSMENT:['نیاز به ارزیابی جدید','due'],
    INACTIVE:['غیرفعال','inactive']
  };
  const assessmentLabels={
    PROFILE_INCOMPLETE:'پروفایل ناقص',ASSESSMENT_PENDING:'در حال تکمیل',DRAFT:'پیش‌نویس',SUBMITTED:'ارسال شده',
    PENDING_REVIEW:'در حال بررسی',UNDER_REVIEW:'در حال بررسی',CHANGES_REQUESTED:'نیاز به اصلاح',APPROVED:'تایید شده',REJECTED:'رد شده',
    PROGRAM_ASSIGNED:'برنامه اختصاص داده شد',ACTIVE:'فعال',ARCHIVED:'آرشیو'
  };
  const programLabels={DRAFT:'پیش‌نویس',ACTIVE:'فعال',COMPLETED:'تکمیل‌شده',ARCHIVED:'آرشیو'};
  const nextLabels={REQUIRED:'ارزیابی لازم است',IN_PROGRESS:'ارزیابی در جریان',DUE:'زمان ارزیابی جدید',NOT_DUE:'فعلاً نیاز نیست',WAITING_PROGRAM:'در انتظار برنامه'};
  const inviteLabels={active:'فعال',used:'استفاده شده',expired:'منقضی',revoked:'لغو شده'};
  const photoLabels={front:'جلو',back:'پشت',side:'بغل',front_flex:'جلو فلکس',back_flex:'پشت فلکس',other:'سایر'};

  async function api(url,options={}){
    const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    const response=await fetch(url,{...options,headers});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'خطا در ارتباط با سرور');
    return data;
  }
  function formatDate(value){
    if(!value) return '—';
    const date=new Date(value.includes('T')?value:`${value.replace(' ','T')}Z`);
    return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('fa-IR');
  }
  function statusBadge(code){
    const meta=statusMeta[code]||[code||'نامشخص','neutral'];
    return `<span class="student-status ${meta[1]}">${esc(meta[0])}</span>`;
  }
  function closeModal(element){ element?.closest('.student-modal-backdrop')?.remove(); }
  function createModal(content,className=''){
    const backdrop=document.createElement('div');
    backdrop.className='student-modal-backdrop';
    backdrop.innerHTML=`<div class="student-modal ${className}">${content}</div>`;
    document.body.append(backdrop);
    backdrop.addEventListener('click',event=>{ if(event.target===backdrop) backdrop.remove(); });
    backdrop.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>backdrop.remove());
    return backdrop;
  }
  async function copyText(text){
    if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const textarea=document.createElement('textarea');textarea.value=text;document.body.append(textarea);textarea.select();document.execCommand('copy');textarea.remove();
  }
  function showInvitation(studentId,result,title='لینک شاگرد ایجاد شد'){
    const absolute=`${location.origin}${result.join_url}`;
    generatedLinks.set(Number(studentId),absolute);
    const shareText=result.temporary_password?`لینک ورود:\n${absolute}\n\nرمز موقت:\n${result.temporary_password}`:absolute;
    const modal=createModal(`<div class="student-modal-head"><h2>🔐 ${esc(title)}</h2><button data-close-modal>×</button></div>
      <p>این دو مورد را برای شاگرد بفرستید.</p>
      <span class="credential-label">لینک ورود</span>
      <div class="credential-link-row"><div class="generated-link"><code>${esc(absolute)}</code></div><button class="secondary" data-copy-url>کپی لینک</button></div>
      ${result.temporary_password?`<div class="temporary-password"><span>رمز موقت</span><b>${esc(result.temporary_password)}</b><small>چهار رقم آخر شماره همراه؛ فقط تا تعیین رمز شخصی معتبر است.</small></div>`:''}
      <div class="student-modal-actions"><button class="primary" data-copy-link>${result.temporary_password?'کپی اطلاعات ورود':'کپی لینک'}</button><button class="secondary" data-close-modal>بستن</button></div>`);
    modal.querySelector('[data-copy-url]').onclick=async()=>{await copyText(absolute);modal.querySelector('[data-copy-url]').textContent='کپی شد ✓';};
    modal.querySelector('[data-copy-link]').onclick=async()=>{ await copyText(shareText); modal.querySelector('[data-copy-link]').textContent='کپی شد ✓'; };
    modal.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>modal.remove());
  }
  async function generateInvitation(studentId,title){
    const result=await api('/api/student-invites',{method:'POST',body:JSON.stringify({student_id:Number(studentId),expires_in_days:30})});
    showInvitation(studentId,result,title);
    return result;
  }

  function renderListShell(){
    return `<div class="students-page">
      <div class="students-head-wrap">
        <div class="students-head-right">
          <h1 class="students-main-title">شاگرد های من</h1>
          <p class="students-sub-title">مدیریت جامع پرونده‌ها، پایش وضعیت ارزیابی و برنامه‌های فعال شاگردان <span class="students-build-chip" id="studentsBuildStamp"></span></p>
        </div>
        <div class="students-head-left">
          <a class="btn-ghost-header" href="/students/submissions">
            <span>📋</span>
            <span>بررسی ارزیابی‌ها</span>
          </a>
          <button class="btn-primary-header" id="addStudentButton">
            <span>＋</span>
            <span>افزودن شاگرد</span>
          </button>
        </div>
      </div>
      <div class="student-stat-grid" id="studentStats"></div>
      <section class="students-panel">
        <div class="students-filter-toolbar">
          <div class="students-search-box">
            <span class="search-icon">🔍</span>
            <input id="studentSearch" placeholder="جستجو با نام، موبایل یا شماره پرونده" autocomplete="off" value="${esc(listState.search)}">
          </div>
          <div class="students-pill-filters">
            <button type="button" class="pill-filter ${listState.status==='ALL'?'active':''}" data-pill-status="ALL">
              همه وضعیت‌ها
            </button>
            <button type="button" class="pill-filter ${listState.status==='NEEDS_ASSESSMENT'?'active':''}" data-pill-status="NEEDS_ASSESSMENT">
              <span class="dot dot-orange"></span>
              نیازمند ارزیابی
            </button>
            <button type="button" class="pill-filter ${listState.status==='APPROVED_AWAITING_PROGRAM'?'active':''}" data-pill-status="APPROVED_AWAITING_PROGRAM">
              <span class="dot dot-blue"></span>
              در انتظار برنامه
            </button>
            <button type="button" class="pill-filter ${listState.status==='ACTIVE_PROGRAM'?'active':''}" data-pill-status="ACTIVE_PROGRAM">
              <span class="dot dot-green"></span>
              فعال
            </button>
          </div>
          <select id="studentStatusFilter" class="student-status-more-select" aria-label="سایر وضعیت‌ها">
            <option value="ALL">سایر وضعیت‌ها...</option>
            <option value="NEW">جدید</option>
            <option value="PROFILE_PENDING">در انتظار تکمیل اطلاعات</option>
            <option value="PENDING_REVIEW">در انتظار بررسی</option>
            <option value="UNDER_REVIEW">در حال بررسی</option>
            <option value="CHANGES_REQUESTED">نیاز به اصلاح</option>
            <option value="INACTIVE">غیرفعال</option>
          </select>
        </div>
        <div id="studentsResult"><div class="students-loading">در حال دریافت شاگردها...</div></div>
        <div class="student-pagination" id="studentPagination"></div>
      </section>
    </div>`;
  }
  function renderStats(stats){
    document.querySelector('#studentStats').innerHTML = `
      <!-- کارت نارنجی: نیازمند ارزیابی -->
      <article class="metric-card metric-orange">
        <div class="metric-card-head">
          <span class="metric-card-label">نیازمند ارزیابی</span>
          <span class="metric-card-icon">📋</span>
        </div>
        <div class="metric-card-val">${Number(stats.needs_assessment || 0).toLocaleString('fa-IR')}</div>
      </article>

      <!-- کارت طوسی: برنامه فعال -->
      <article class="metric-card metric-gray">
        <div class="metric-card-head">
          <span class="metric-card-label">برنامه فعال</span>
          <span class="metric-card-icon">🏋️</span>
        </div>
        <div class="metric-card-val">${Number(stats.active_programs || 0).toLocaleString('fa-IR')}</div>
      </article>

      <!-- کارت بنفش: در انتظار بررسی -->
      <article class="metric-card metric-purple">
        <div class="metric-card-head">
          <span class="metric-card-label">در انتظار بررسی</span>
          <span class="metric-card-icon">⏱️</span>
        </div>
        <div class="metric-card-val">${Number(stats.pending_review || 0).toLocaleString('fa-IR')}</div>
      </article>

      <!-- کارت سبز: شاگردان فعال -->
      <article class="metric-card metric-green">
        <div class="metric-card-head">
          <span class="metric-card-label">شاگردان فعال</span>
          <span class="metric-card-icon">👥</span>
        </div>
        <div class="metric-card-val">${Number(stats.active || 0).toLocaleString('fa-IR')}</div>
      </article>

      <!-- کارت آبی-طوسی: شاگردان کل -->
      <article class="metric-card metric-blue">
        <div class="metric-card-head">
          <span class="metric-card-label">شاگردان کل</span>
          <span class="metric-card-icon">👥</span>
        </div>
        <div class="metric-card-val">${Number(stats.total || 0).toLocaleString('fa-IR')}</div>
      </article>
    `;
  }
  async function renderBuildStamp(){
    const chip=document.querySelector('#studentsBuildStamp');
    if(!chip)return;
    try{
      const build=await api('/api/build');
      const ok=Boolean(build.markers&&build.markers.student_credentials_in_edit_dialog);
      const stamp=build.students_ui&&build.students_ui.mtime?new Date(build.students_ui.mtime).toLocaleString('fa-IR'):'—';
      chip.className=`students-build-chip ${ok?'ok':'stale'}`;
      chip.title=`شاخه: ${build.branch||'?'} • کامیت: ${build.commit||'?'} • آخرین تغییر public/students.js: ${build.students_ui?build.students_ui.mtime:'?'}`;
      chip.textContent=ok?`✓ کد روز — ${build.commit||'local'} • ${stamp}`:`⚠️ کد قدیمی است — git pull اعمال نشده (کامیت: ${build.commit||'نامشخص'})`;
    }catch(error){
      const fresh=document.querySelector('#studentsBuildStamp');
      if(fresh)fresh.remove();
    }
  }
  function renderStudents(items){
    const host=document.querySelector('#studentsResult');
    if(!items.length){
      host.innerHTML=`<div class="students-empty"><div>👤</div><h2>هنوز شاگردی ثبت نشده است</h2><p>اولین شاگرد را اضافه کنید و لینک امن پورتال او را بسازید.</p><button class="primary" data-add-first>＋ افزودن اولین شاگرد</button></div>`;
      host.querySelector('[data-add-first]').onclick=openAddStudent;
      return;
    }
    host.innerHTML=`<div class="students-table-wrap"><table class="students-table"><thead><tr>
      <th class="student-row-number">ردیف</th><th>نام و نام خانوادگی</th><th>شماره همراه</th><th>وضعیت</th><th>ارزیابی فعلی</th><th>برنامه فعلی</th><th>آخرین ارزیابی</th><th>ارزیابی بعدی</th><th>تاریخ ثبت</th><th>عملیات</th>
    </tr></thead><tbody>${items.map((student,index)=>`<tr>
      <td class="student-row-number">${((listState.page-1)*listState.pageSize+index+1).toLocaleString('fa-IR')}</td>
      <td><button class="student-identity-cell" data-open-student="${student.case_number}"><b>${esc(student.full_name)}</b><span>شماره پرونده <bdi>${esc(student.case_number)}</bdi></span></button></td>
      <td class="student-mobile" dir="ltr">${esc(student.mobile||'—')}</td>
      <td>${statusBadge(student.management_status)}<small class="record-status">${esc(fa(student.student_record_status||''))}</small></td>
      <td>${student.current_assessment_id?`<div style="display:flex;flex-direction:column;gap:3px;"><button type="button" class="text-button" data-review-assessment="${student.current_assessment_id}" style="text-align:right;padding:2px 6px;color:var(--accent-hover);font-weight:850;font-size:11.5px;cursor:pointer;" title="بررسی ارزیابی شماره #${student.current_assessment_number}"><b>ارزیابی ${student.current_assessment_number}</b> ↗</button><small class="record-status">${esc(assessmentLabels[student.current_assessment_status]||fa(student.current_assessment_status))}</small></div>`:'<span class="cell-muted">ثبت نشده</span>'}</td>
      <td>${student.current_program_id?`<div style="display:flex;flex-direction:column;gap:2px;"><span class="program-status ${student.current_program_status==='ACTIVE'?'active':'draft'}">${esc(programLabels[student.current_program_status]||fa(student.current_program_status))}</span><small class="cell-dates">${formatDate(student.current_program_start_date)} تا ${formatDate(student.current_program_end_date)}</small></div>`:'<span class="cell-muted">بدون برنامه</span>'}</td>
      <td><span style="font-size:11.5px;color:var(--text-muted);">${formatDate(student.last_assessment_submitted_at||student.last_assessment_created_at)}</span></td>
      <td><span class="next-assessment ${String(student.next_assessment_status).toLowerCase()}">${esc(nextLabels[student.next_assessment_status]||fa(student.next_assessment_status))}</span></td>
      <td><span style="font-size:11.5px;color:var(--text-muted);">${formatDate(student.created_at)}</span></td>
      <td>
        <div class="student-row-actions">
          <select class="student-program-dropdown" data-program-select="${student.id}" title="انتخاب و طراحی برنامه شاگرد">
            <option value="" disabled selected>📋 برنامه‌ها ▾</option>
            <option value="exercise">🏋️ برنامه تمرینی</option>
            <option value="diet">🥗 برنامه غذایی</option>
            <option value="supplement">💊 برنامه مکمل</option>
          </select>
          <div class="student-action-menu-wrap">
            <button class="btn-action-dots" data-action-menu-toggle="${student.id}" type="button" title="عملیات">
              <span>⋮</span>
            </button>
            <div class="student-action-menu-dropdown" id="actionMenu-${student.id}" hidden>
              <button type="button" class="action-menu-item btn-edit-student" data-edit-student="${index}">
                <span>✏️</span>
                <span>ویرایش و رمز</span>
              </button>
              <button type="button" class="action-menu-item danger btn-delete-student" data-delete-student="${student.id}" data-student-name="${esc(student.full_name)}" data-case-number="${esc(student.case_number)}">
                <span>🗑️</span>
                <span>حذف</span>
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>`).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-open-student]').forEach(button=>button.onclick=()=>{ location.href=`/users-list/${button.dataset.openStudent}`; });
    host.querySelectorAll('[data-action-menu-toggle]').forEach(btn=>{
      btn.onclick=(e)=>{
        e.stopPropagation();
        const id=btn.dataset.actionMenuToggle;
        const menu=host.querySelector(`#actionMenu-${id}`);
        if(!menu) return;
        const wasHidden=menu.hidden;
        host.querySelectorAll('.student-action-menu-dropdown').forEach(m=>{ m.hidden=true; });
        menu.hidden=!wasHidden;
      };
    });
    host.querySelectorAll('.btn-edit-student').forEach(btn=>{
      btn.onclick=(e)=>{
        e.stopPropagation();
        btn.closest('.student-action-menu-dropdown').hidden=true;
        const idx=Number(btn.dataset.editStudent);
        const student=items[idx];
        if(student) openEditStudentModal(student);
      };
    });
    host.querySelectorAll('.btn-delete-student').forEach(btn=>{
      btn.onclick=async(e)=>{
        e.stopPropagation();
        btn.closest('.student-action-menu-dropdown').hidden=true;
        const studentId=btn.dataset.deleteStudent;
        const studentName=btn.dataset.studentName;
        const caseNumber=btn.dataset.caseNumber;
        if(confirm(`شاگرد «${studentName}» (پرونده ${caseNumber}) با تمام اطلاعات، عکس‌ها، مدارک، ارزیابی‌ها و برنامه‌ها برای همیشه حذف شود؟`)){
          try{
            await api(`/api/students/${studentId}`,{method:'DELETE'});
            loadStudentList();
          }catch(err){
            alert('خطا در حذف شاگرد: '+err.message);
          }
        }
      };
    });
    host.querySelectorAll('[data-program-select]').forEach(select=>{
      select.onchange=(e)=>{
        const studentId=select.dataset.programSelect;
        const val=select.value;
        if(val==='exercise'){
          if(window.goToRoute) window.goToRoute('برنامه تمرینی', `/programs/exercise/form?student_id=${studentId}`);
          else location.href=`/programs/exercise/form?student_id=${studentId}`;
        }else if(val==='diet'){
          if(window.goToRoute) window.goToRoute('طراحی برنامه غذایی', `/programs/diet/form?student_id=${studentId}`);
          else location.href=`/programs/diet/form?student_id=${studentId}`;
        }else if(val==='supplement'){
          if(window.goToRoute) window.goToRoute('افزودن برنامه مکمل', `/programs/supplement/form?student_id=${studentId}`);
          else location.href=`/programs/supplement/form?student_id=${studentId}`;
        }
        select.value='';
      };
    });
    host.querySelectorAll('[data-review-assessment]').forEach(button=>{
      button.onclick=(e)=>{
        e.stopPropagation();
        location.href=`/assessments/${button.dataset.reviewAssessment}`;
      };
    });
    host.querySelectorAll('[data-invite-student]').forEach(button=>button.onclick=async()=>{ try{await generateInvitation(button.dataset.inviteStudent);}catch(error){alert(error.message);} });
  }
  function renderPagination(pagination){
    const host=document.querySelector('#studentPagination');
    if(pagination.total_pages<=1){host.innerHTML='';return;}
    host.innerHTML=`<button ${pagination.page<=1?'disabled':''} data-page="${pagination.page-1}">قبلی</button><span>صفحه ${pagination.page.toLocaleString('fa-IR')} از ${pagination.total_pages.toLocaleString('fa-IR')}</span><button ${pagination.page>=pagination.total_pages?'disabled':''} data-page="${pagination.page+1}">بعدی</button>`;
    host.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{listState.page=Number(button.dataset.page);loadStudentList();});
  }
  async function loadStudentList(){
    const host=document.querySelector('#studentsResult');
    host.innerHTML='<div class="students-loading">در حال دریافت شاگردها...</div>';
    try{
      const query=new URLSearchParams({view:'management',search:listState.search,status:listState.status,page:String(listState.page),page_size:String(listState.pageSize)});
      const result=await api(`/api/students?${query}`);
      renderStats(result.stats);renderStudents(result.items);renderPagination(result.pagination);
    }catch(error){host.innerHTML=`<div class="students-error">${esc(error.message)}</div>`;}
  }
  function loginShareText(data){
    const password=data.password_once||data.temporary_password||'رمز شخصی شاگرد (قابل نمایش نیست)';
    return `ورود شاگرد یسنافیت\nآدرس: ${location.origin}/student/login\nنام کاربری: ${data.username||'—'}\nرمز عبور: ${password}`;
  }
  // A short, unambiguous alphabet: no I/l/1, O/0 so the coach can read it over the phone.
  const PASSWORD_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  function randomStudentPassword(length=10){
    let values;
    if(window.crypto?.getRandomValues){values=new Uint32Array(length);window.crypto.getRandomValues(values);}
    else values=Array.from({length},()=>Math.floor(Math.random()*4294967296));
    return Array.from(values,value=>PASSWORD_ALPHABET[value%PASSWORD_ALPHABET.length]).join('');
  }
  // The compact "رمز ورود" block of the edit dialog: one status line, one password
  // field with reveal + generator, and three small actions. Everything is optional.
  function credentialEditorMarkup(data,notice,noticeKind){
    const state=data.password_state||'RESET_REQUIRED';
    const temp=data.temporary_password||'';
    const revealed=data.password_once||'';
    const locked=Boolean(data.locked);
    const pendingReset=Boolean(data.pending_reset);
    const pendingUnlock=Boolean(data.pending_unlock);
    const visible=Boolean(data.reveal_password);
    const statusText=state==='PERSONAL'?'رمز شخصی':state==='TEMPORARY'?'رمز موقت':'هنوز رمزی ندارد';
    return `
      ${notice?`<div class="credential-notice ${noticeKind==='error'?'error':''}${noticeKind==='ok'?' ok':''}">${esc(notice)}</div>`:''}
      ${revealed?`<div class="temporary-password credential-once"><span>رمز تازه — فقط همین یک‌بار نمایش داده می‌شود</span><b dir="ltr">${esc(revealed)}</b></div>`:''}
      <p class="credential-status">
        <span>${esc(statusText)}</span>
        ${temp?`<span>۴ رقم آخر: <bdi dir="ltr">${esc(temp)}</bdi></span>`:''}
        ${locked?`<span class="credential-locked">ورود قفل است</span>`:pendingUnlock?`<span class="credential-unlock">قفل باز می‌شود</span>`:''}
      </p>
      ${pendingReset?`<div class="credential-notice warn">با ذخیره، رمز به ۴ رقم آخر شماره همراه برمی‌گردد. برای لغو همان دکمه را دوباره بزنید.</div>`:`
      <div class="credential-pass-row">
        <input id="credPassword" class="student-form-input" type="${visible?'text':'password'}" maxlength="128" placeholder="رمز جدید (حداقل ۸ کاراکتر) — خالی یعنی بدون تغییر" autocomplete="new-password" value="${esc(data.typed_password||'')}">
        <button type="button" class="credential-icon-btn" data-toggle-pass title="نمایش یا پنهان کردن رمز" aria-label="نمایش رمز">${visible?'🙈':'👁'}</button>
        <button type="button" class="credential-icon-btn" data-random-pass title="ساخت رمز تصادفی" aria-label="ساخت رمز تصادفی">🎲</button>
      </div>`}
      <div class="credential-actions">
        <button type="button" class="credential-action-btn" data-toggle-reset aria-pressed="${pendingReset?'true':'false'}">${pendingReset?'لغو':'رمز موقت ۴ رقمی'}</button>
        ${locked?`<button type="button" class="credential-action-btn" data-toggle-unlock aria-pressed="${pendingUnlock?'true':'false'}">${pendingUnlock?'لغو':'باز کردن قفل'}</button>`:''}
        <button type="button" class="credential-action-btn" data-copy-login>کپی نام کاربری و رمز</button>
      </div>`;
  }
  function openEditStudentModal(student){
    const modal=createModal(`
      <form id="editStudentForm">
        <div class="student-modal-head">
          <div>
            <h2>✏️ ویرایش و رمز</h2>
            <p class="credential-subtitle">${esc(student.full_name||'')} · پرونده ${esc(student.case_number||'—')}</p>
          </div>
          <button type="button" data-close-modal>×</button>
        </div>
        <div class="edit-form-grid">
          <label>نام و نام خانوادگی<input id="editStudentFullName" class="student-form-input" maxlength="100" autocomplete="off" value="${esc(student.full_name||'')}"></label>
          <label>شماره همراه (نام کاربری ورود)<input id="credUsername" class="student-form-input" dir="ltr" maxlength="15" inputmode="tel" autocomplete="off" value="${esc(student.mobile||'')}"></label>
          <label class="edit-form-full">هدف تمرینی<input id="editStudentGoal" class="student-form-input" maxlength="200" placeholder="مثال: کاهش وزن، هایپرتروفی، فیتنس" value="${esc(student.goal||'')}"></label>
        </div>
        <div class="edit-divider"><span>🔑 رمز ورود</span></div>
        <div id="editStudentCredentials" class="edit-section-body"><div class="students-loading">در حال دریافت وضعیت رمز…</div></div>
        <div class="student-modal-actions">
          <button type="button" class="secondary" data-close-modal>بستن</button>
          <button type="submit" class="primary" id="editStudentSave">ذخیره تغییرات</button>
        </div>
      </form>`,'edit-student-modal');
    const nameInput=modal.querySelector('#editStudentFullName');
    const goalInput=modal.querySelector('#editStudentGoal');
    const usernameInput=modal.querySelector('#credUsername');
    const section=modal.querySelector('#editStudentCredentials');
    const saveButton=modal.querySelector('#editStudentSave');
    const reference=student.id||student.case_number;
    let current={id:student.id,case_number:student.case_number||'',full_name:student.full_name||'',username:student.mobile||'',password_state:'RESET_REQUIRED',password_state_label:'',temporary_password:null,locked:false,last_login_at:null,password_changed_at:null};
    let typedPassword='',pendingReset=false,pendingUnlock='',revealPassword=false,notice='',noticeKind='',credentialsLoaded=false,busy=false;
    function state(){return {...current,typed_password:typedPassword,reveal_password:revealPassword,pending_reset:pendingReset,pending_unlock:pendingUnlock};}
    function markCopied(button){if(!button)return;const original=button.textContent;button.textContent='کپی شد ✓';setTimeout(()=>{if(button.isConnected)button.textContent=original;},1400);}
    function paint(){
      if(!credentialsLoaded){
        section.innerHTML=`<div class="students-loading">${esc(notice||'در حال دریافت وضعیت رمز…')}</div>${notice?`<div class="credential-actions"><button type="button" class="credential-action-btn" data-reload-credentials>تلاش دوباره</button></div>`:''}`;
        const retry=section.querySelector('[data-reload-credentials]');
        if(retry) retry.onclick=loadCredentials;
        return;
      }
      section.innerHTML=credentialEditorMarkup(state(),notice,noticeKind);
      const passwordField=section.querySelector('#credPassword');
      if(passwordField){
        passwordField.oninput=()=>{typedPassword=passwordField.value;};
        if(noticeKind==='error')passwordField.focus();
      }
      const togglePass=section.querySelector('[data-toggle-pass]');
      if(togglePass) togglePass.onclick=()=>{revealPassword=!revealPassword;notice='';noticeKind='';paint();};
      const randomButton=section.querySelector('[data-random-pass]');
      if(randomButton) randomButton.onclick=async()=>{
        pendingReset=false;
        typedPassword=randomStudentPassword();
        revealPassword=true;
        let copied=false;
        try{await copyText(loginShareText({...current,username:asciiDigits(usernameInput.value),password_once:typedPassword}));copied=true;}catch(error){copied=false;}
        noticeKind='ok';
        notice=copied?'رمز تصادفی ساخته شد و کپی هم شد — حالا «ذخیره تغییرات» را بزنید.':'رمز تصادفی ساخته شد؛ آن را برای شاگرد بفرستید و ذخیره کنید.';
        paint();
        const fresh=section.querySelector('#credPassword');
        if(fresh) fresh.focus();
      };
      const toggleReset=section.querySelector('[data-toggle-reset]');
      if(toggleReset) toggleReset.onclick=()=>{
        pendingReset=!pendingReset;
        if(pendingReset){pendingUnlock='';typedPassword='';}
        notice='';noticeKind='';paint();
      };
      const toggleUnlock=section.querySelector('[data-toggle-unlock]');
      if(toggleUnlock) toggleUnlock.onclick=()=>{pendingUnlock=pendingUnlock?'':'unlock';notice='';noticeKind='';paint();};
      const copyLogin=section.querySelector('[data-copy-login]');
      if(copyLogin) copyLogin.onclick=async()=>{
        await copyText(loginShareText({...current,username:asciiDigits(usernameInput.value),password_once:typedPassword||current.password_once||null}));
        markCopied(copyLogin);
      };
    }
    async function loadCredentials(){
      notice='';noticeKind='';credentialsLoaded=false;paint();
      try{
        current=await api(`/api/students/${reference}/credentials`);
        usernameInput.value=current.username||'';
        credentialsLoaded=true;paint();
      }catch(error){
        notice=`وضعیت رمز گرفته نشد: ${error.message}`;noticeKind='error';credentialsLoaded=false;paint();
      }
    }
    modal.querySelector('#editStudentForm').onsubmit=async event=>{
      event.preventDefault();
      if(busy) return;
      const fullName=nameInput.value.trim(),goal=goalInput.value.trim();
      const username=asciiDigits(usernameInput.value);
      const passwordField=section.querySelector('#credPassword');
      const password=passwordField?passwordField.value:'';
      typedPassword=password;
      if(!fullName){noticeKind='error';notice='نام و نام خانوادگی الزامی است.';paint();nameInput.focus();return;}
      if(credentialsLoaded&&username.length<7){noticeKind='error';notice='شماره همراه را کامل وارد کنید.';paint();usernameInput.focus();return;}
      if(credentialsLoaded&&!pendingReset&&password&&password.length<8){noticeKind='error';notice='رمز جدید باید حداقل ۸ کاراکتر باشد.';paint();const field=section.querySelector('#credPassword');if(field)field.focus();return;}
      const storedUsername=asciiDigits(student.mobile||'');
      if(!credentialsLoaded&&username!==storedUsername){noticeKind='error';notice='شمارهٔ ورود بدون اتصال به سرور ذخیره نمی‌شود؛ روی «تلاش دوباره» بزنید.';paint();usernameInput.focus();return;}
      const usernameChanged=credentialsLoaded&&username!==asciiDigits(current.username||'');
      const wantsPassword=!pendingReset&&Boolean(password);
      const wantsUnlock=Boolean(pendingUnlock)&&credentialsLoaded;
      const wantsCredentials=credentialsLoaded&&(usernameChanged||pendingReset||wantsPassword||wantsUnlock);
      busy=true;saveButton.disabled=true;saveButton.textContent='در حال ذخیره…';
      const messages=[];
      try{
        if(wantsCredentials){
          const payload={username};
          if(pendingReset) payload.reset_temporary=true;
          else if(wantsPassword) payload.password=password;
          if(wantsUnlock) payload.unlock=true;
          const result=await api(`/api/students/${reference}/credentials`,{method:'POST',body:JSON.stringify(payload)});
          current=result;
          usernameInput.value=result.username||username;
          if(result.password_once) messages.push('رمز شخصی ثبت شد.');
          if(result.temporary_password) messages.push(`رمز موقت: ${result.temporary_password}`);
          if(usernameChanged) messages.push(`نام کاربری به ${result.username} تغییر کرد.`);
          if(wantsUnlock) messages.push('قفل ورود باز شد.');
          if(Number(result.sessions_revoked||0)) messages.push(`${Number(result.sessions_revoked).toLocaleString('fa-IR')} نشست فعال شاگرد باطل شد.`);
          pendingReset=false;pendingUnlock='';typedPassword='';revealPassword=false;
        }
        const profileChanged=fullName!==String(student.full_name||'').trim()||goal!==String(student.goal||'').trim();
        if(profileChanged){
          await api(`/api/students/${reference}`,{method:'PUT',body:JSON.stringify({full_name:fullName,goal})});
          student.full_name=fullName;student.goal=goal;
          messages.unshift('اطلاعات پرونده ذخیره شد.');
        }
        if(!messages.length) messages.push('چیزی برای ذخیره تغییر نکرد.');
        notice=messages.join(' ');noticeKind='ok';paint();
        loadStudentList();
        saveButton.textContent='ذخیره شد ✓';
        setTimeout(()=>{if(saveButton.isConnected){saveButton.disabled=false;saveButton.textContent='ذخیره تغییرات';}},1400);
      }catch(error){
        noticeKind='error';notice=error.message;paint();
        saveButton.disabled=false;saveButton.textContent='ذخیره تغییرات';
      }finally{
        busy=false;
      }
    };
    loadCredentials();
  }

  function openAddStudent(){
    const modal=createModal(`<form id="addStudentForm"><div class="student-modal-head"><h2>افزودن شاگرد</h2><button type="button" data-close-modal>×</button></div>
      <div class="student-form-grid"><label>نام و نام خانوادگی *<input name="full_name" required maxlength="100" autocomplete="name"></label><label>شماره همراه *<input name="mobile" required maxlength="11" inputmode="tel" autocomplete="tel" placeholder="09123456789" dir="ltr"></label></div>
      <div class="student-modal-actions"><button type="button" class="secondary" data-close-modal>انصراف</button><button class="primary">ثبت شاگرد</button></div></form>`);
    modal.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>modal.remove());
    modal.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget)),rawMobile=asciiDigits(body.mobile);body.mobile=rawMobile;
      if(rawMobile.length<7)return alert('شماره همراه را کامل وارد کنید.');
      try{
        const created=await api('/api/students',{method:'POST',body:JSON.stringify(body)});modal.remove();await loadStudentList();showInvitation(created.id,created,'شاگرد و دسترسی ورود ایجاد شد');
      }catch(error){alert(error.message);}
    };
  }

  function photoGrid(assessment){
    if(assessment?.body_photos_preference==='declined')return '<div class="photo-preference-state declined">— این شاگرد ترجیح داده است تصاویر بدنی ارسال نکند.</div>';
    if(!assessment?.photos?.length)return `<div class="photo-preference-state ${assessment?.body_photos_preference==='willing'?'willing':'legacy'}">${assessment?.body_photos_preference==='willing'?'✓ مایل به ارسال تصاویر؛ تصویری ارسال نشده است.':'انتخاب تصاویر در این ارزیابی قدیمی ثبت نشده است.'}</div>`;
    return `<div class="photo-preference-state willing">✓ مایل به ارسال تصاویر • ${assessment.photos.length} تصویر</div><div class="student-photo-grid">${assessment.photos.map(photo=>`<button data-open-photo="${photo.id}" title="باز کردن عکس ${esc(photoLabels[photo.photo_type]||photo.photo_type)}"><img src="/api/student-photos/${photo.id}" alt="${esc(photoLabels[photo.photo_type]||photo.photo_type)}"><span>${esc(photoLabels[photo.photo_type]||photo.photo_type)}</span></button>`).join('')}</div>`;
  }
  function assessmentCard(assessment,current=false){
    return `<article class="history-card ${current?'current':''}"><header><div><b>ارزیابی ${assessment.assessment_number}</b><small>${formatDate(assessment.submitted_at||assessment.created_at)}</small></div><span class="student-status neutral">${esc(assessmentLabels[assessment.status]||fa(assessment.status))}</span></header>
      <div class="assessment-numbers"><span>وزن <b>${assessment.weight??'—'} kg</b></span><span>کمر <b>${assessment.waist??'—'} cm</b></span><span>سینه <b>${assessment.chest??'—'} cm</b></span><span>باسن <b>${assessment.hips??'—'} cm</b></span></div>
      ${photoGrid(assessment)}
      <div class="history-actions"><button class="secondary" data-review-assessment="${assessment.id}">بررسی کامل</button></div></article>`;
  }
  function programCard(program){
    return `<article class="history-card"><header><div><b>${esc(program.title)}</b><small>${formatDate(program.start_date)} تا ${formatDate(program.end_date)}</small></div><span class="program-status ${String(program.status).toLowerCase()}">${esc(programLabels[program.status]||fa(program.status))}</span></header><p>${esc(program.coach_note||'بدون توضیح')}</p><div class="history-actions"><button class="secondary" data-view-program="${program.id}">مشاهده</button><button class="secondary" data-pdf-program="${program.id}">📄 PDF</button></div></article>`;
  }
  function timelineItem(item){
    if(item.type==='assessment') return `<li><span class="timeline-dot assessment">📋</span><div><b>ارزیابی ${item.data.assessment_number}</b><small>${formatDate(item.date)} • ${esc(assessmentLabels[item.data.lifecycle_status||item.data.status]||fa(item.data.lifecycle_status||item.data.status))}</small></div></li>`;
    if(item.type==='workout')return `<li><span class="timeline-dot">✓</span><div><b>تمرین ${esc(item.data.program_title)} • روز ${item.data.day_number}</b><small>${formatDate(item.date)} • ${esc(fa(item.data.status))}</small></div></li>`;
    return `<li><span class="timeline-dot program">🏋️</span><div><b>${esc(item.data.title)}</b><small>${formatDate(item.date)} • ${esc(programLabels[item.data.status]||fa(item.data.status))}</small></div></li>`;
  }
  async function openProgramReadOnly(programId){
    try{
      const program=await api(`/api/training-programs/${programId}/full`);
      const days=program.program_data?.days||[];
      createModal(`<div class="student-modal-head"><div><h2>${esc(program.title)}</h2><small>${formatDate(program.start_date)} تا ${formatDate(program.end_date)} • ${esc(programLabels[program.status]||fa(program.status))}</small></div><button data-close-modal>×</button></div>
        <div class="readonly-program">${days.map(day=>`<section><h3>روز ${day.day_number} — ${esc(day.focus||'')}</h3>${day.isRestDay?'<p>روز استراحت</p>':(day.data||[]).map(system=>`<div class="readonly-system"><b>${esc(fa(system.system_type||'normal'))}</b>${(system.movement_list||[]).map(movement=>`<div class="readonly-movement"><strong>${esc(movement.nameFa||movement.name||'حرکت')}</strong><small>${esc(movement.description||'')}</small><div>${(movement.sets||[]).map(set=>`<span>${esc(fa(set.type||set.set_type))}: ${esc(set.count??set.count_value??'—')} • وزن ${esc(set.weight??'—')} • استراحت ${esc(set.restSeconds??set.rest_seconds??'—')} ثانیه</span>`).join('')}</div></div>`).join('')}</div>`).join('')}</section>`).join('')||'<p class="muted">روزی در برنامه ثبت نشده است.</p>'}</div>`, 'wide').querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>closeModal(button));
    }catch(error){alert(error.message);}
  }
  function invitationCard(invite,studentId){
    const cached=generatedLinks.get(Number(studentId));
    return `<article class="invite-card"><div><b>${esc(inviteLabels[invite.status]||fa(invite.status))}</b><small>توکن ${esc(invite.token_preview||'')} • ایجاد ${formatDate(invite.created_at)}${invite.expires_at?` • انقضا ${formatDate(invite.expires_at)}`:''}</small></div><div>${cached&&invite.status==='active'?`<button class="secondary" data-copy-cached="${studentId}">کپی لینک</button>`:''}${['active','used'].includes(invite.status)?`<button class="danger" data-revoke-invite="${invite.id}">لغو لینک</button>`:''}</div></article>`;
  }
  async function loadStudentDetail(studentId){
    const content=document.querySelector('#content');
    content.innerHTML='<div class="students-loading">در حال دریافت پرونده شاگرد...</div>';
    try{
      const [data,performance,messageData]=await Promise.all([api(`/api/students/${studentId}`),api(`/api/students/${studentId}/performance`),api(`/api/students/${studentId}/messages`)]);
      const student=data.student,summary=data.summary,internalStudentId=student.id,caseNumber=student.case_number;
      document.querySelector('#breadcrumb').textContent='پرونده شاگرد';

      content.innerHTML=`<div class="student-detail-page">
        <!-- Hero Header -->
        <div class="student-detail-head">
          <div class="student-detail-head-right">
            <button class="btn-ghost-header back-link" data-back-students type="button">
              <span>←</span>
              <span>شاگرد های من</span>
            </button>
            <div style="display:flex; align-items:center; gap:14px; margin-top:8px;">
              <div class="student-detail-avatar">
                ${esc((student.full_name || 'ش')[0])}
              </div>
              <div>
                <h1 class="student-detail-name">${esc(student.full_name)}</h1>
                <div class="student-detail-chips">
                  <span class="student-case-chip">شماره پرونده <b>${esc(student.case_number)}</b></span>
                  <span class="supp-item-chip" dir="ltr">📱 ${esc(student.mobile||'—')}</span>
                  <span class="supp-item-chip">🎯 ${esc(student.goal||'بدون هدف')}</span>
                  ${statusBadge(summary.management_status)}
                </div>
              </div>
            </div>
          </div>

          <div class="detail-head-actions">
            <select class="student-program-dropdown" id="detailHeaderProgramSelect" title="طراحی برنامه جدید">
              <option value="" disabled selected>➕ ساخت برنامه ▾</option>
              <option value="exercise">🏋️ برنامه تمرینی</option>
              <option value="diet">🥗 برنامه غذایی</option>
              <option value="supplement">💊 برنامه مکمل</option>
            </select>
            <button class="btn-ghost-header" data-new-invite type="button">
              <span>🔑</span>
              <span>لینک ورود جدید</span>
            </button>
            <button class="btn-primary-header" data-request-assessment type="button">
              <span>📋</span>
              <span>درخواست ارزیابی جدید</span>
            </button>
          </div>
        </div>

        <!-- 2-Column Dashboard Grid -->
        <div class="student-detail-grid">
          <!-- Main Left Column -->
          <main>
            <!-- 1. اطلاعات پرونده شاگرد -->
            <section class="detail-section">
              <div class="section-title">
                <h2>👤 اطلاعات شاگرد</h2>
                <span class="supp-item-chip">پرونده: <bdi>${esc(student.case_number)}</bdi></span>
              </div>
              <div class="profile-data">
                <div><span>شماره پرونده</span><b class="case-number-value">${esc(student.case_number)}</b></div>
                <div><span>نام</span><b>${esc(student.full_name)}</b></div>
                <div><span>موبایل</span><b dir="ltr">${esc(student.mobile||'—')}</b></div>
                <div><span>هدف</span><b>${esc(student.goal||'—')}</b></div>
                <div><span>قد</span><b>${student.height ? student.height + ' cm' : '—'}</b></div>
                <div><span>وزن</span><b>${student.weight ? student.weight + ' kg' : '—'}</b></div>
                <div><span>سطح تمرین</span><b>${esc(fa(student.training_level||student.training_experience)||'—')}</b></div>
                <div><span>محدودیت‌ها</span><b>${esc(student.limitations||'—')}</b></div>
                <div><span>آسیب‌ها</span><b>${esc(student.injuries||'—')}</b></div>
                <div class="wide"><span>یادداشت پزشکی</span><b>${esc(student.medical_notes||'—')}</b></div>
                <div class="wide"><span>یادداشت مربی</span><b>${esc(student.coach_notes||'—')}</b></div>
              </div>
            </section>

            <!-- 2. برنامه‌های ماهانه -->
            <section class="detail-section">
              <div class="section-title">
                <h2>🏋️ برنامه‌های ماهانه</h2>
                <span class="supp-item-chip">${data.programs.length.toLocaleString('fa-IR')} برنامه</span>
              </div>
              <div class="history-grid">
                ${data.programs.length ? data.programs.slice().reverse().map(programCard).join('') : '<div class="students-empty" style="padding:24px 0;"><p class="muted">هنوز برنامه‌ای ثبت نشده است.</p></div>'}
              </div>
            </section>

            <!-- 3. سوابق ارزیابی‌ها -->
            <section class="detail-section">
              <div class="section-title">
                <h2>📋 ارزیابی‌ها</h2>
                <span class="supp-item-chip">${data.assessments.length.toLocaleString('fa-IR')} سابقه</span>
              </div>
              <div class="history-grid">
                ${data.assessments.length ? data.assessments.slice().reverse().map((assessment,index)=>assessmentCard(assessment,index===0)).join('') : '<div class="students-empty" style="padding:24px 0;"><p class="muted">هنوز ارزیابی ثبت نشده است.</p></div>'}
              </div>
            </section>
          </main>

          <!-- Sidebar Aside Column -->
          <aside>
            <!-- 1. لینک و دسترسی دائمی شاگرد -->
            <section class="detail-section permanent-access-card">
              <div class="section-title">
                <h2>🔐 لینک و دسترسی دائمی شاگرد</h2>
              </div>
              <p style="margin:0 0 10px;font-size:11px;color:var(--text-muted);line-height:1.6;">لینک دائمی ورود شاگرد به پرتال. نیازی به ایجاد مجدد لینک نیست.</p>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <div>
                  <span class="credential-label">لینک ورود به پرتال</span>
                  <div class="credential-link-row">
                    <div class="generated-link"><code>${location.origin}/student/login</code></div>
                    <button class="secondary" data-copy-perm-url style="min-height:34px;padding:4px 10px;font-size:11px;white-space:nowrap;">کپی لینک</button>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <div style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);">
                    <span style="font-size:10px;color:var(--text-muted);display:block;">شماره همراه</span>
                    <b style="font-size:12px;color:var(--text-primary);display:block;margin-top:2px;" dir="ltr">${esc(student.mobile||'—')}</b>
                  </div>
                  <div class="temporary-password" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);margin:0;">
                    <span style="font-size:10px;color:var(--text-muted);display:block;">رمز موقت</span>
                    <b style="font-size:14px;color:var(--accent-hover);display:block;margin-top:2px;">${esc(student.temporary_password||(student.mobile?student.mobile.slice(-4):'—'))}</b>
                  </div>
                </div>
                <button class="primary" data-copy-perm-all style="min-height:36px;font-size:11.5px;font-weight:750;margin-top:4px;">📋 کپی کامل مشخصات ورود شاگرد</button>
              </div>
            </section>

            <!-- 2. وضعیت فعلی -->
            <section class="detail-section current-state">
              <div class="section-title">
                <h2>📊 وضعیت فعلی</h2>
              </div>
              <dl>
                <div><dt>ارزیابی</dt><dd>${data.current_assessment?`شماره ${data.current_assessment.assessment_number} — ${esc(assessmentLabels[data.current_assessment.status]||fa(data.current_assessment.status))}`:'ثبت نشده'}</dd></div>
                <div><dt>برنامه</dt><dd>${data.current_program?`${esc(data.current_program.title)} — ${esc(programLabels[data.current_program.status]||fa(data.current_program.status))}`:'اختصاص نیافته'}</dd></div>
                <div><dt>بازه برنامه</dt><dd>${data.current_program?`${formatDate(data.current_program.start_date)} تا ${formatDate(data.current_program.end_date)}`:'—'}</dd></div>
                <div><dt>ارزیابی بعدی</dt><dd>${esc(nextLabels[summary.next_assessment_status]||fa(summary.next_assessment_status))}</dd></div>
              </dl>
              ${data.current_assessment?`<button class="btn btn-secondary full" style="margin-top:10px;font-weight:750;" data-review-assessment="${data.current_assessment.id}">📋 بررسی ارزیابی #${data.current_assessment.assessment_number}</button>`:''}
              ${data.current_assessment?.status==='APPROVED'?`<button class="primary full" data-create-program="${data.current_assessment.id}" style="margin-top:8px;">ساخت برنامه ماهانه</button>`:''}
            </section>

            <!-- 3. لینک‌های دعوت سریع -->
            <section class="detail-section">
              <div class="section-title">
                <h2>🔗 لینک‌های دعوت سریع</h2>
                <button class="text-button" data-new-invite>＋ توکن جدید</button>
              </div>
              <div class="invite-list">
                ${data.invites.length?data.invites.map(invite=>invitationCard(invite,internalStudentId)).join(''):'<p class="muted" style="font-size:12px;margin:8px 0;">توکنی ساخته نشده است.</p>'}
              </div>
            </section>

            <!-- 4. عملکرد واقعی تمرین -->
            <section class="detail-section">
              <div class="section-title">
                <h2>⚡ عملکرد واقعی تمرین</h2>
              </div>
              <div class="profile-data" style="grid-template-columns:1fr 1fr;">
                <div><span>جلسات تکمیل‌شده</span><b>${performance.sessions_completed}</b></div>
                <div><span>جلسات از دست‌رفته</span><b>${performance.sessions_skipped}</b></div>
                <div><span>نرخ تکمیل</span><b>${performance.completion_rate==null?'داده‌ای نیست':`${performance.completion_rate}%`}</b></div>
                <div><span>آخرین تمرین</span><b>${formatDate(performance.last_workout)}</b></div>
              </div>
            </section>

            <!-- 5. پیام‌های مربی و شاگرد -->
            <section class="detail-section">
              <div class="section-title">
                <h2>💬 پیام‌های مربی و شاگرد</h2>
              </div>
              <div class="coach-message-list">
                ${messageData.messages.slice(-6).map(message=>`<div><b>${message.sender_type==='coach'?'مربی':'شاگرد'}:</b> <span style="color:var(--text-secondary);">${esc(message.body)}</span></div>`).join('')||'<p class="muted" style="font-size:12px;margin:8px 0;">پیامی ثبت نشده است.</p>'}
              </div>
              <form id="coachMessageForm" class="coach-message-form">
                <textarea name="body" required maxlength="2000" placeholder="پیام برای شاگرد..."></textarea>
                <button class="primary" style="align-self:flex-end;">ارسال پیام</button>
              </form>
            </section>

            <!-- 6. تایم‌لاین شاگرد -->
            <section class="detail-section">
              <div class="section-title">
                <h2>⏳ تایم‌لاین شاگرد</h2>
              </div>
              <ol class="student-timeline">
                ${data.timeline.length?data.timeline.map(timelineItem).join(''):'<li class="muted">رویدادی ثبت نشده است.</li>'}
              </ol>
            </section>
          </aside>
        </div>
      </div>`;

      // Event bindings
      const progSelect = content.querySelector('#detailHeaderProgramSelect');
      if (progSelect) {
        progSelect.onchange = (e) => {
          const val = e.target.value;
          if (val === 'exercise') window.goToRoute('برنامه تمرینی', `/programs/exercise/form?student_id=${internalStudentId}`);
          else if (val === 'diet') window.goToRoute('طراحی برنامه غذایی', `/programs/diet/form?student_id=${internalStudentId}`);
          else if (val === 'supplement') window.goToRoute('افزودن برنامه مکمل', `/programs/supplement/form?student_id=${internalStudentId}`);
          progSelect.value = '';
        };
      }

      content.querySelectorAll('[data-copy-perm-url]').forEach(button=>button.onclick=async()=>{await copyText(`${location.origin}/student/login`);button.textContent='کپی شد ✓';});
      content.querySelectorAll('[data-copy-perm-all]').forEach(button=>button.onclick=async()=>{
        const tempPass=student.temporary_password||(student.mobile?student.mobile.slice(-4):'—');
        const shareMsg=`لینک ورود:\n${location.origin}/student/login\n\nرمز موقت:\n${tempPass}`;
        await copyText(shareMsg);button.textContent='کپی شد ✓';
      });
      content.querySelector('[data-back-students]').onclick=()=>{location.href='/users-list';};
      content.querySelectorAll('[data-new-invite]').forEach(button=>button.onclick=async()=>{try{await generateInvitation(internalStudentId);setTimeout(()=>loadStudentDetail(caseNumber),300);}catch(error){alert(error.message);}});
      content.querySelector('[data-request-assessment]').onclick=async()=>{try{await generateInvitation(internalStudentId,'لینک ارزیابی جدید ایجاد شد');}catch(error){alert(error.message);}};
      content.querySelectorAll('[data-open-photo]').forEach(button=>button.onclick=()=>window.open(`/api/student-photos/${button.dataset.openPhoto}`,'_blank','noopener'));
      content.querySelectorAll('[data-review-assessment]').forEach(button=>button.onclick=()=>{location.href=`/assessments/${button.dataset.reviewAssessment}`;});
      content.querySelectorAll('[data-view-program]').forEach(button=>button.onclick=()=>openProgramReadOnly(button.dataset.viewProgram));
      content.querySelectorAll('[data-pdf-program]').forEach(button=>button.onclick=()=>{
        const progId = Number(button.dataset.pdfProgram);
        if(window.openProgramPDF) window.openProgramPDF(progId);
      });
      content.querySelectorAll('[data-create-program]').forEach(button=>button.onclick=()=>{location.href=`/programs/exercise/form?student_id=${internalStudentId}&assessment_id=${button.dataset.createProgram}`;});
      content.querySelectorAll('[data-copy-cached]').forEach(button=>button.onclick=async()=>{await copyText(generatedLinks.get(Number(internalStudentId)));button.textContent='کپی شد ✓';});
      content.querySelectorAll('[data-revoke-invite]').forEach(button=>button.onclick=async()=>{if(!confirm('این لینک لغو شود؟'))return;try{await api(`/api/student-invites/${button.dataset.revokeInvite}/revoke`,{method:'POST'});await loadStudentDetail(caseNumber);}catch(error){alert(error.message);}});
      content.querySelector('#coachMessageForm').onsubmit=async event=>{event.preventDefault();const body=new FormData(event.currentTarget).get('body');try{await api(`/api/students/${studentId}/messages`,{method:'POST',body:JSON.stringify({body})});await loadStudentDetail(caseNumber)}catch(error){alert(error.message)}};
    }catch(error){content.innerHTML=`<section class="panel error"><h2>پرونده شاگرد پیدا نشد</h2><p>${esc(error.message)}</p><button class="secondary" onclick="location.href='/users-list'">بازگشت</button></section>`;}
  }

  window.renderStudentsPage=async(label,route)=>{
    const detailMatch=route.match(/^\/users-list\/(\d+)$/);
    document.querySelectorAll('.menu-link').forEach(item=>item.classList.toggle('active',item.dataset.route==='/users-list'));
    if(detailMatch) return loadStudentDetail(detailMatch[1]);
    document.querySelector('#breadcrumb').textContent='شاگرد های من';
    const content=document.querySelector('#content');content.innerHTML=renderListShell();
    renderBuildStamp();
    document.querySelector('#addStudentButton').onclick=openAddStudent;
    document.querySelector('#studentSearch').value=listState.search;
    document.querySelector('#studentStatusFilter').value=listState.status;
    
    // Pill filters binding
    content.querySelectorAll('[data-pill-status]').forEach(btn=>{
      btn.onclick=()=>{
        content.querySelectorAll('[data-pill-status]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        listState.status=btn.dataset.pillStatus;
        listState.page=1;
        document.querySelector('#studentStatusFilter').value='ALL';
        loadStudentList();
      };
    });

    let searchTimer;
    document.querySelector('#studentSearch').oninput=event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{listState.search=event.target.value.trim();listState.page=1;loadStudentList();},350);};
    document.querySelector('#studentStatusFilter').onchange=event=>{
      listState.status=event.target.value;
      listState.page=1;
      content.querySelectorAll('[data-pill-status]').forEach(b=>{
        b.classList.toggle('active', b.dataset.pillStatus===listState.status);
      });
      loadStudentList();
    };
    await loadStudentList();
  };
})();
