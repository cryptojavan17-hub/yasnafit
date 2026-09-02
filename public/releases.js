(() => {
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  const categoryMeta={
    features:{label:'ویژگی جدید',className:'feature'},
    improvements:{label:'بهبود',className:'improvement'},
    fixes:{label:'رفع خطا',className:'fix'},
    security:{label:'امنیت',className:'security'},
    breaking_changes:{label:'تغییر مهم',className:'breaking'}
  };

  async function getJson(url){
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||'خطا در دریافت اطلاعات نسخه');
    return data;
  }

  function formatDate(value){
    if(!value) return '—';
    const date=new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'});
  }

  function renderCategories(changes={}){
    return Object.entries(categoryMeta).map(([key,meta])=>{
      const items=Array.isArray(changes[key])?changes[key]:[];
      if(!items.length) return '';
      return `<section class="release-change-group">
        <h3><span class="release-badge ${meta.className}">${meta.label}</span></h3>
        <ul>${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </section>`;
    }).join('');
  }

  function renderRelease(release){
    return `<article class="release-card ${release.is_current?'current':''}">
      <header>
        <div>
          <div class="release-version-row">
            <h2>${escapeHtml(release.title)}</h2>
            <span class="release-version">v${escapeHtml(release.version)}</span>
            ${release.is_current?'<span class="current-release-badge">نسخه فعلی</span>':''}
          </div>
          <p>${escapeHtml(release.summary||'')}</p>
        </div>
        <time datetime="${escapeHtml(release.release_date)}">${formatDate(release.release_date)}</time>
      </header>
      <div class="release-changes">${renderCategories(release.changes)}</div>
    </article>`;
  }

  async function decorateVersion(){
    try{
      const info=await getJson('/api/version');
      document.querySelectorAll('[data-app-version]').forEach(element=>{
        element.textContent=`${info.name} v${info.version}`;
      });
      const footer=document.querySelector('.sidebar-footer');
      if(footer && !footer.querySelector('.sidebar-version')){
        const version=document.createElement('small');
        version.className='sidebar-version';
        version.dataset.appVersion='';
        version.textContent=`${info.name} v${info.version}`;
        footer.append(version);
      }
    }catch(error){
      console.warn('Application version unavailable:',error.message);
    }
  }

  window.renderReleaseHistory=async(label='نسخه و تغییرات')=>{
    const content=document.querySelector('#content');
    const crumb=document.querySelector('#breadcrumb');
    if(crumb) crumb.textContent=label;
    document.querySelectorAll('.menu-link').forEach(item=>item.classList.toggle('active',item.dataset.route==='/coach/releases'));
    content.innerHTML='<div class="release-loading">در حال دریافت تاریخچه نسخه‌ها...</div>';
    try{
      const [info,releases,health]=await Promise.all([
        getJson('/api/version'),
        getJson('/api/releases'),
        getJson('/api/health?detailed=1')
      ]);
      content.innerHTML=`<div class="release-page">
        <div class="page-head release-page-head">
          <div>
            <p class="eyebrow">درباره Yasnafit</p>
            <h1>نسخه و تغییرات</h1>
            <p>تاریخچه انتشارهای معنادار برنامه بر اساس Semantic Versioning</p>
          </div>
          <div class="current-version-box">
            <span>نسخه فعلی برنامه</span>
            <strong>${escapeHtml(info.name)} v${escapeHtml(info.version)}</strong>
            <small>محیط: ${escapeHtml(info.environment)}</small>
          </div>
        </div>
        <div class="version-distinction" aria-label="تفکیک نسخه‌ها">
          <span><b>نسخه برنامه</b> v${escapeHtml(info.version)}</span>
          <span><b>نسخه دیتابیس</b> ${escapeHtml(health.schema_version||'—')}</span>
          <span><b>Git</b> مستقل از نسخه انتشار</span>
        </div>
        <div class="release-list">
          ${releases.map(renderRelease).join('') || '<div class="empty-state">هنوز انتشاری ثبت نشده است.</div>'}
        </div>
      </div>`;
    }catch(error){
      content.innerHTML=`<section class="panel error"><h2>خطا در دریافت تاریخچه نسخه‌ها</h2><p>${escapeHtml(error.message)}</p></section>`;
    }
  };

  window.refreshApplicationVersion=decorateVersion;
  decorateVersion();
})();
