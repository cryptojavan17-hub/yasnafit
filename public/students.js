(() => {
  const fa=value=>window.YasnafitLocale?.text(value)||String(value??'—');
  const asciiDigits=value=>String(value??'').replace(/[۰-۹]/g,digit=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g,digit=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/\D/g,'');
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const listState={search:'',status:'ALL',page:1,pageSize:20};
  const generatedLinks=new Map();

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
      <div class="page-head students-head"><div><p class="eyebrow">مدیریت ارتباط با شاگرد</p><h1>شاگرد های من</h1><p>دعوت، ارزیابی، برنامه ماهانه و تاریخچه هر شاگرد در یک محل</p></div><button class="primary" id="addStudentButton">＋ افزودن شاگرد</button></div>
      <div class="student-stat-grid" id="studentStats"></div>
      <section class="students-panel">
        <div class="student-toolbar">
          <label class="student-search"><span>⌕</span><input id="studentSearch" placeholder="جستجو با نام، موبایل یا شماره پرونده" autocomplete="off"></label>
          <select id="studentStatusFilter" aria-label="فیلتر وضعیت">
            <option value="ALL">همه وضعیت‌ها</option><option value="NEW">جدید</option><option value="PROFILE_PENDING">در انتظار تکمیل اطلاعات</option>
            <option value="PENDING_REVIEW">در انتظار بررسی</option><option value="UNDER_REVIEW">در حال بررسی</option>
            <option value="CHANGES_REQUESTED">نیاز به اصلاح</option><option value="APPROVED_AWAITING_PROGRAM">در انتظار برنامه</option>
            <option value="ACTIVE_PROGRAM">برنامه فعال</option><option value="NEEDS_ASSESSMENT">نیاز به ارزیابی جدید</option><option value="INACTIVE">غیرفعال</option>
          </select>
        </div>
        <div id="studentsResult"><div class="students-loading">در حال دریافت شاگردها...</div></div>
        <div class="student-pagination" id="studentPagination"></div>
      </section>
    </div>`;
  }
  function renderStats(stats){
    const cards=[['شاگردان کل',stats.total,'👥'],['شاگردان فعال',stats.active,'●'],['در انتظار بررسی',stats.pending_review,'📋'],['برنامه فعال',stats.active_programs,'🏋️'],['نیازمند ارزیابی',stats.needs_assessment,'↻']];
    document.querySelector('#studentStats').innerHTML=cards.map(([label,value,icon])=>`<article><span>${icon} ${label}</span><strong>${Number(value||0).toLocaleString('fa-IR')}</strong></article>`).join('');
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
      <td>${student.current_assessment_id?`<b>ارزیابی ${student.current_assessment_number}</b><small>${esc(assessmentLabels[student.current_assessment_status]||fa(student.current_assessment_status))}</small>`:'<span class="muted">ثبت نشده</span>'}</td>
      <td>${student.current_program_id?`<b>${esc(programLabels[student.current_program_status]||fa(student.current_program_status))}</b><small>${formatDate(student.current_program_start_date)} تا ${formatDate(student.current_program_end_date)}</small>`:'<span class="muted">بدون برنامه</span>'}</td>
      <td>${formatDate(student.last_assessment_submitted_at||student.last_assessment_created_at)}</td>
      <td><span class="next-assessment ${String(student.next_assessment_status).toLowerCase()}">${esc(nextLabels[student.next_assessment_status]||fa(student.next_assessment_status))}</span></td>
      <td>${formatDate(student.created_at)}</td>
      <td><div class="student-row-actions"><button class="secondary" data-open-student="${student.case_number}">مشاهده</button><button class="secondary" data-access-student="${index}">🔗 لینک شاگرد</button></div></td>
    </tr>`).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-open-student]').forEach(button=>button.onclick=()=>{ location.href=`/users-list/${button.dataset.openStudent}`; });
    host.querySelectorAll('[data-access-student]').forEach(button=>{
      button.onclick=()=>{
        const student=items[Number(button.dataset.accessStudent)];
        if(student) showInvitation(student.id, {join_url:'/student/login', temporary_password:student.mobile?student.mobile.slice(-4):''}, `اطلاعات ورود ${student.full_name}`);
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
  function openAddStudent(){
    const modal=createModal(`<form id="addStudentForm"><div class="student-modal-head"><h2>افزودن شاگرد</h2><button type="button" data-close-modal>×</button></div>
      <div class="student-form-grid"><label>نام و نام خانوادگی *<input name="full_name" required maxlength="100" autocomplete="name"></label><label>شماره همراه *<div class="prefixed-input" dir="ltr"><span>09-</span><input name="mobile" required maxlength="10" inputmode="tel" autocomplete="tel" placeholder="0000000000"></div></label></div>
      <div class="student-modal-actions"><button type="button" class="secondary" data-close-modal>انصراف</button><button class="primary">ثبت شاگرد</button></div></form>`);
    modal.querySelectorAll('[data-close-modal]').forEach(button=>button.onclick=()=>modal.remove());
    modal.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget)),rawMobile=asciiDigits(body.mobile),mobileSuffix=rawMobile.startsWith('09')?rawMobile.slice(2):rawMobile;body.mobile=rawMobile.startsWith('09')?rawMobile:rawMobile.startsWith('9')?`0${rawMobile}`:`09${rawMobile}`;
      if(mobileSuffix.length<9)return alert('شماره همراه را کامل وارد کنید.');
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
      const [data,performance,messageData]=await Promise.all([api(`/api/students/${studentId}`),api(`/api/students/${studentId}/performance`),api(`/api/students/${studentId}/messages`)]);const student=data.student,summary=data.summary,internalStudentId=student.id,caseNumber=student.case_number;
      document.querySelector('#breadcrumb').textContent='پرونده شاگرد';
      content.innerHTML=`<div class="student-detail-page">
        <div class="page-head student-detail-head"><div><button class="back-link" data-back-students>← شاگرد های من</button><h1>${esc(student.full_name)}</h1><div class="student-case-chip">شماره پرونده <b>${esc(student.case_number)}</b></div><p>${esc(student.mobile||'بدون موبایل')} • ${esc(student.goal||'بدون هدف')}</p>${statusBadge(summary.management_status)}</div><div class="detail-head-actions"><button class="secondary" data-new-invite>ایجاد لینک جدید</button><button class="primary" data-request-assessment>درخواست ارزیابی جدید</button></div></div>
        <div class="student-detail-grid">
          <main>
            <section class="detail-section"><h2>اطلاعات شاگرد</h2><div class="profile-data">
              <div><span>شماره پرونده</span><b class="case-number-value">${esc(student.case_number)}</b></div><div><span>نام</span><b>${esc(student.full_name)}</b></div><div><span>موبایل</span><b>${esc(student.mobile||'—')}</b></div><div><span>هدف</span><b>${esc(student.goal||'—')}</b></div><div><span>قد</span><b>${student.height??'—'} cm</b></div><div><span>وزن</span><b>${student.weight??'—'} kg</b></div><div><span>سطح تمرین</span><b>${esc(student.training_level||student.training_experience||'—')}</b></div><div><span>محدودیت‌ها</span><b>${esc(student.limitations||'—')}</b></div><div><span>آسیب‌ها</span><b>${esc(student.injuries||'—')}</b></div><div class="wide"><span>یادداشت پزشکی</span><b>${esc(student.medical_notes||'—')}</b></div><div class="wide"><span>یادداشت مربی</span><b>${esc(student.coach_notes||'—')}</b></div>
            </div></section>
            <section class="detail-section"><div class="section-title"><h2>ارزیابی‌ها</h2><span>${data.assessments.length.toLocaleString('fa-IR')} سابقه</span></div><div class="history-grid">${data.assessments.length?data.assessments.slice().reverse().map((assessment,index)=>assessmentCard(assessment,index===0)).join(''):'<p class="muted">هنوز ارزیابی ثبت نشده است.</p>'}</div></section>
            <section class="detail-section"><div class="section-title"><h2>برنامه‌های ماهانه</h2><span>${data.programs.length.toLocaleString('fa-IR')} برنامه</span></div><div class="history-grid">${data.programs.length?data.programs.slice().reverse().map(programCard).join(''):'<p class="muted">هنوز برنامه‌ای ثبت نشده است.</p>'}</div></section>
          </main>
          <aside>
            <section class="detail-section permanent-access-card" style="border:1px solid var(--accent-border);background:var(--accent-surface);">
              <div class="section-title">
                <h2>🔐 لینک و دسترسی دائمی شاگرد</h2>
              </div>
              <p style="margin:0 0 8px;font-size:9px;color:var(--text-secondary);">لینک دائمی ورود شاگرد به پرتال. نیازی به ایجاد مجدد لینک نیست.</p>
              <div style="display:flex;flex-direction:column;gap:7px;">
                <div>
                  <span class="credential-label" style="font-size:8px;color:var(--text-muted);display:block;margin-bottom:2px;">لینک ورود به پرتال</span>
                  <div class="credential-link-row" style="display:flex;gap:5px;">
                    <div class="generated-link" style="flex:1;overflow:hidden;"><code style="font-size:10px;">${location.origin}/student/login</code></div>
                    <button class="secondary" data-copy-perm-url style="min-height:28px;padding:2px 8px;font-size:9px;white-space:nowrap;">کپی لینک</button>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                  <div style="padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--surface-inset);">
                    <span style="font-size:8px;color:var(--text-muted);display:block;">شماره همراه</span>
                    <b style="font-size:10px;color:var(--text);display:block;" dir="ltr">${esc(student.mobile||'—')}</b>
                  </div>
                  <div class="temporary-password" style="padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:var(--surface-inset);">
                    <span style="font-size:8px;color:var(--text-muted);display:block;">رمز موقت</span>
                    <b style="font-size:11px;color:var(--accent-hover);display:block;">${esc(student.temporary_password||(student.mobile?student.mobile.slice(-4):'—'))}</b>
                  </div>
                </div>
                <button class="primary" data-copy-perm-all style="min-height:34px;font-size:9px;font-weight:750;margin-top:2px;">📋 کپی کامل مشخصات ورود شاگرد</button>
              </div>
            </section>
            <section class="detail-section current-state"><h2>وضعیت فعلی</h2><dl><div><dt>ارزیابی</dt><dd>${data.current_assessment?`شماره ${data.current_assessment.assessment_number} — ${esc(assessmentLabels[data.current_assessment.status]||fa(data.current_assessment.status))}`:'ثبت نشده'}</dd></div><div><dt>برنامه</dt><dd>${data.current_program?`${esc(data.current_program.title)} — ${esc(programLabels[data.current_program.status]||fa(data.current_program.status))}`:'اختصاص نیافته'}</dd></div><div><dt>بازه برنامه</dt><dd>${data.current_program?`${formatDate(data.current_program.start_date)} تا ${formatDate(data.current_program.end_date)}`:'—'}</dd></div><div><dt>ارزیابی بعدی</dt><dd>${esc(nextLabels[summary.next_assessment_status]||fa(summary.next_assessment_status))}</dd></div></dl>${data.current_assessment?.status==='APPROVED'?`<button class="primary full" data-create-program="${data.current_assessment.id}">ساخت برنامه ماهانه</button>`:''}</section>
            <section class="detail-section"><div class="section-title"><h2>لینک‌های دعوت سریع</h2><button class="text-button" data-new-invite>＋ توکن جدید</button></div><div class="invite-list">${data.invites.length?data.invites.map(invite=>invitationCard(invite,internalStudentId)).join(''):'<p class="muted">توکنی ساخته نشده است.</p>'}</div></section>
            <section class="detail-section"><h2>عملکرد واقعی تمرین</h2><div class="profile-data"><div><span>جلسات تکمیل‌شده</span><b>${performance.sessions_completed}</b></div><div><span>جلسات از دست‌رفته</span><b>${performance.sessions_skipped}</b></div><div><span>نرخ تکمیل</span><b>${performance.completion_rate==null?'داده‌ای نیست':`${performance.completion_rate}%`}</b></div><div><span>آخرین تمرین</span><b>${formatDate(performance.last_workout)}</b></div></div></section>
            <section class="detail-section"><h2>پیام‌های مربی و شاگرد</h2><div class="coach-message-list">${messageData.messages.slice(-6).map(message=>`<div><b>${message.sender_type==='coach'?'مربی':'شاگرد'}</b><span>${esc(message.body)}</span></div>`).join('')||'<p class="muted">پیامی ثبت نشده است.</p>'}</div><form id="coachMessageForm" class="coach-message-form"><textarea name="body" required maxlength="2000" placeholder="پیام برای شاگرد..."></textarea><button class="primary">ارسال</button></form></section>
            <section class="detail-section"><h2>تایم‌لاین شاگرد</h2><ol class="student-timeline">${data.timeline.length?data.timeline.map(timelineItem).join(''):'<li class="muted">رویدادی ثبت نشده است.</li>'}</ol></section>
          </aside>
        </div>
      </div>`;
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
    document.querySelector('#addStudentButton').onclick=openAddStudent;
    document.querySelector('#studentSearch').value=listState.search;
    document.querySelector('#studentStatusFilter').value=listState.status;
    let searchTimer;
    document.querySelector('#studentSearch').oninput=event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{listState.search=event.target.value.trim();listState.page=1;loadStudentList();},350);};
    document.querySelector('#studentStatusFilter').onchange=event=>{listState.status=event.target.value;listState.page=1;loadStudentList();};
    await loadStudentList();
  };
})();
