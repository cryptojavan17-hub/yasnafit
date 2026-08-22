(() => {
  const state = {
    location: 'both',
    categoryId: null,
    subCategoryId: 'all',
    status: 'active',
    query: '',
    selected: new Set(),
    categories: [],
    page: 0,
    pageSize: 24,
    total: 0,
    totalPages: 0,
    sortBy: 'priority',
    loading: false
  };

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function request(url, opt = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opt });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'خطا در ارتباط با سرور');
    return d;
  }

  function grouped(raw) {
    const map = new Map();
    raw.forEach(x => {
      if (!map.has(x.id)) map.set(x.id, { id: x.id, name: x.name, sort_order: x.sort_order, count: x.count || 0, subs: [] });
      if (x.subcategory_id) {
        const existing = map.get(x.id).subs.find(s => s.id === x.subcategory_id);
        if (!existing) map.get(x.id).subs.push({ id: x.subcategory_id, name: x.subcategory_name, count: 0 });
      }
    });
    return [...map.values()].sort((a,b)=>a.sort_order-b.sort_order);
  }

  function imageHtml(ex) {
    const origId = ex.original_id || ex.id;
    // Primary robust endpoint that searches recursively for any file starting with originalId
    const primary = `/api/exercise-image/${origId}`;
    const candidates = [
      `/assets/images/exercises/imported/${origId}.png`,
      `/assets/images/exercises/imported/${origId}.jpg`,
      `/assets/images/exercises/imported/${origId}.jpeg`,
      ex.image_path ? ex.image_path : null,
      `/files/exercise/images/${origId}.png`,
      `/files/exercise/images/${origId}.jpg`
    ].filter(Boolean);

    // Store candidates as JSON in data attribute safely (base64 to avoid escaping issues)
    const fallbacksJson = JSON.stringify(candidates);
    const fallbacksB64 = btoa(unescape(encodeURIComponent(fallbacksJson)));

    return `
      <div class="image-wrap loading" id="wrap-${origId}-${ex.id}">
        <img class="exercise-image" src="${esc(primary)}" alt="${esc(ex.name_fa)}"
          data-fallbacks-b64="${fallbacksB64}"
          data-orig-id="${origId}"
          data-ex-id="${ex.id}"
          onerror="window.handleImageError(this)"
          onload="window.handleImageLoad(this)"
          loading="lazy"
        >
        <div class="no-image">تصویر<br>موجود نیست<br><small>ID:${origId}</small></div>
      </div>
    `;
  }

  // When image loads successfully - hide placeholder
  window.handleImageLoad = function(img) {
    const wrap = img.parentElement;
    if(wrap){
      wrap.classList.remove('loading','has-error');
      wrap.classList.add('has-image');
    }
  };

  // Global image error handler with fallback chain - robust version
  window.handleImageError = function(img) {
    try {
      // Try to decode base64 fallbacks
      let fallbacks = [];
      if (img.dataset.fallbacksB64) {
        try {
          const jsonStr = decodeURIComponent(escape(atob(img.dataset.fallbacksB64)));
          fallbacks = JSON.parse(jsonStr);
        } catch(e){
          // Fallback to old attribute if exists
          try {
            fallbacks = JSON.parse(img.dataset.fallbacks || '[]');
          } catch(e2){}
        }
      } else if (img.dataset.fallbacks) {
        try {
          fallbacks = JSON.parse(img.dataset.fallbacks);
        } catch(e){}
      }

      // If we have fallbacks, try next
      if (fallbacks.length > 0) {
        const next = fallbacks.shift();
        const remainingJson = JSON.stringify(fallbacks);
        img.dataset.fallbacksB64 = btoa(unescape(encodeURIComponent(remainingJson)));
        // console.log('Trying fallback:', next, 'for', img.dataset.origId);
        img.src = next;
        return;
      }

      // No more fallbacks - show no-image placeholder
      console.warn('Image failed for ID:', img.dataset.origId, 'all fallbacks tried');
      const wrap = img.parentElement;
      if(wrap){
        wrap.classList.remove('loading','has-image');
        wrap.classList.add('has-error');
      }
      img.style.display = 'none';
    } catch (e) {
      console.error('handleImageError failed', e);
      const wrap = img.parentElement;
      if(wrap){
        wrap.classList.add('has-error');
        wrap.classList.remove('loading','has-image');
      }
      img.style.display = 'none';
    }
  };

  function cardHtml(x) {
    const selected = state.selected.has(x.id) ? 'checked' : '';
    const isSelectedClass = state.selected.has(x.id) ? 'selected-card' : '';
    return `
      <article class="exercise-card ${isSelectedClass}">
        ${imageHtml(x)}
        <div class="card-info">
          <b title="${esc(x.name_fa)}">${esc(x.name_fa)}</b>
          <small>${esc(x.category_id)}${x.subcategory_id ? ' / ' + esc(x.subcategory_id) : ''} • اولویت ${x.priority||5}</small>
        </div>
        <div class="card-actions">
          <button class="edit-exercise" data-edit="${x.id}" title="ویرایش">✎</button>
          <label class="exercise-check"><input type="checkbox" data-check="${x.id}" ${selected}><span></span></label>
        </div>
      </article>
    `;
  }

  function root(label) {
    return `
    <div class="exercise-page">
      <div class="page-head">
        <div>
          <p class="eyebrow">مدیریت حساب • ${state.total} حرکت</p>
          <h1>${label}</h1>
          <p>حرکت‌ها را بر اساس محل، دسته، زیردسته و وضعیت مدیریت کنید. دیتابیس شامل <b>${state.total || '...'}</b> حرکت است.</p>
          <div id="imageStatus" class="image-status">در حال بررسی تصاویر...</div>
        </div>
        <div class="head-stats">
          <div class="stat-mini"><b id="totalCount">...</b><span>کل حرکات</span></div>
          <div class="stat-mini"><b id="imageCount">...</b><span>تصاویر</span></div>
        </div>
      </div>

      <section class="exercise-controls">
        <div class="location-row">
          <button data-location="gym" class="location-btn">🏋️ باشگاه</button>
          <button data-location="home" class="location-btn">🏠 منزل</button>
          <button data-location="both" class="location-btn active">هر دو</button>

          <div class="category-picker">
            <button id="categoryToggle" class="category-toggle">
              <span id="categoryName">دسته‌بندی حرکت را انتخاب کنید</span>
              <span class="category-x" id="clearCategory" title="پاک کردن">×</span>
              <i>⌄</i>
            </button>
            <div id="categoryMenu" class="category-menu"></div>
          </div>
        </div>

        <div id="afterCategory"></div>

        <div class="search-row">
          <div id="tabs" class="exercise-tabs hidden">
            <button data-status="active" class="tab active">حرکات اصلی</button>
            <button data-status="archived" class="tab">حرکات آرشیو</button>
          </div>

          <div class="search-add">
            <div class="search-box">
              <input id="exerciseSearch" placeholder="جستجو در نام حرکت…" value="${esc(state.query)}">
              <span class="search-icon">⌕</span>
            </div>
            <select id="sortBy" class="sort-select">
              <option value="priority">اولویت</option>
              <option value="name">نام</option>
              <option value="id">شناسه</option>
            </select>
            <button id="addExercise" class="primary">＋ افزودن حرکت</button>
          </div>
        </div>

        <div id="bulkBar" class="bulk-bar hidden">
          <span id="bulkCount">0 انتخاب</span>
          <div class="bulk-actions">
            <button id="bulkArchive" class="secondary small">${state.status==='active'?'📦 آرشیو':'♻️ بازیابی'}</button>
            <button id="bulkDelete" class="danger small">🗑 حذف</button>
            <button id="clearSelection" class="secondary small">لغو</button>
          </div>
        </div>
      </section>

      <section id="exerciseResults" class="results-section">
        <div class="empty-state">
          <div class="empty-icon">🏋️</div>
          <h3>دسته‌بندی حرکت را انتخاب کنید</h3>
          <p>برای مشاهده حرکات، ابتدا یک دسته مثل سینه، پشت، پا یا سرشانه را انتخاب کنید.</p>
        </div>
      </section>

      <div id="pagination" class="pagination hidden"></div>
    </div>`;
  }

  function renderCategoryMenu() {
    const host = $('#categoryMenu');
    if (!host) return;
    host.innerHTML = state.categories.map(c => {
      const count = c.count || 0;
      return `<button data-category="${c.id}" class="cat-item"><span>${esc(c.name)}</span><small>${count} حرکت</small></button>`;
    }).join('');

    host.querySelectorAll('[data-category]').forEach(b => {
      b.onclick = () => selectCategory(b.dataset.category);
    });
  }

  function selectedCategory() {
    return state.categories.find(x => x.id === state.categoryId);
  }

  function selectCategory(id) {
    state.categoryId = id;
    state.subCategoryId = 'all';
    state.page = 0;
    state.selected.clear();
    const cat = selectedCategory();
    $('#categoryName').textContent = cat ? `${cat.name} (${cat.count||0})` : 'دسته‌بندی حرکت را انتخاب کنید';
    $('#categoryMenu').classList.remove('open');
    renderAfter();
    load();
  }

  function renderAfter() {
    const host = $('#afterCategory');
    const tabs = $('#tabs');
    if (!state.categoryId) {
      host.innerHTML = '';
      tabs.classList.add('hidden');
      $('#exerciseResults').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏋️</div>
          <h3>دسته‌بندی حرکت را انتخاب کنید</h3>
          <p>برای مشاهده حرکات، ابتدا یک دسته مثل سینه، پشت، پا یا سرشانه را انتخاب کنید.</p>
        </div>`;
      $('#pagination').classList.add('hidden');
      return;
    }
    tabs.classList.remove('hidden');
    const cat = selectedCategory();
    const subs = cat?.subs || [];
    host.innerHTML = `
      <div class="subchips">
        <button class="chip ${state.subCategoryId==='all'?'selected':''}" data-sub="all">همه (${cat.count||0})</button>
        ${subs.map(s => `<button class="chip ${state.subCategoryId===s.id?'selected':''}" data-sub="${s.id}">${esc(s.name)} <small>${s.count||''}</small></button>`).join('')}
      </div>
    `;
    host.querySelectorAll('[data-sub]').forEach(b => {
      b.onclick = () => {
        state.subCategoryId = b.dataset.sub;
        state.page = 0;
        state.selected.clear();
        renderAfter();
        load();
      };
    });
    $('#tabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.status === state.status));
  }

  function renderPagination() {
    const host = $('#pagination');
    if (state.totalPages <= 1) {
      host.classList.add('hidden');
      return;
    }
    host.classList.remove('hidden');
    let html = `<button class="page-btn" data-page="prev" ${state.page===0?'disabled':''}>‹ قبلی</button>`;
    // Show page numbers: first, current-1, current, current+1, last
    const pages = [];
    const total = state.totalPages;
    const current = state.page;
    const addPage = (p) => { if(p>=0 && p<total && !pages.includes(p)) pages.push(p); };
    addPage(0);
    addPage(total-1);
    addPage(current);
    addPage(current-1);
    addPage(current+1);
    pages.sort((a,b)=>a-b);
    let last = -2;
    for(const p of pages){
      if(p - last > 1) html += `<span class="page-dots">…</span>`;
      html += `<button class="page-btn ${p===current?'active':''}" data-page="${p}">${p+1}</button>`;
      last = p;
    }
    html += `<button class="page-btn" data-page="next" ${state.page>=total-1?'disabled':''}>بعدی ›</button>`;
    html += `<span class="page-info">${state.total} حرکت • صفحه ${state.page+1} از ${total}</span>`;
    host.innerHTML = html;
    host.querySelectorAll('[data-page]').forEach(btn=>{
      btn.onclick = ()=>{
        const v = btn.dataset.page;
        if(v==='prev' && state.page>0) state.page--;
        else if(v==='next' && state.page < state.totalPages-1) state.page++;
        else if(!isNaN(v)) state.page = parseInt(v);
        load();
      };
    });
  }

  async function load() {
    if (!state.categoryId) return;
    if (state.loading) return;
    state.loading = true;
    const host = $('#exerciseResults');
    host.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>در حال بارگذاری حرکات...</p></div>`;

    try {
      const q = new URLSearchParams({
        location: state.location,
        categoryId: state.categoryId,
        subCategoryId: state.subCategoryId,
        status: state.status,
        query: state.query,
        page: state.page,
        pageSize: state.pageSize,
        sortBy: state.sortBy
      });
      const res = await request('/api/exercises?' + q);
      const list = res.items || [];
      state.total = res.total || 0;
      state.totalPages = res.totalPages || 0;

      // Update total count in header
      const totalEl = $('#totalCount');
      if(totalEl) totalEl.textContent = state.total;

      if (list.length === 0) {
        host.innerHTML = `
          <div class="no-results">
            <div class="empty-icon">🔍</div>
            <h3>حرکتی پیدا نشد</h3>
            <p>با این فیلتر (${esc(state.query) || 'بدون جستجو'}) حرکتی وجود ندارد.</p>
          </div>`;
        renderPagination();
        updateBulkBar();
        return;
      }

      host.innerHTML = `
        <div class="result-head">
          <b>${state.total} حرکت • ${list.length} نمایش</b>
          <div class="result-actions">
            <label class="select-all"><input type="checkbox" id="selectAll"> انتخاب همه</label>
          </div>
        </div>
        <div class="exercise-scroll">
          <div class="exercise-grid">
            ${list.map(cardHtml).join('')}
          </div>
        </div>
      `;

      // Bind events
      host.querySelectorAll('[data-check]').forEach(x => {
        x.onchange = () => {
          const id = Number(x.dataset.check);
          if (x.checked) state.selected.add(id);
          else state.selected.delete(id);
          x.closest('.exercise-card').classList.toggle('selected-card', x.checked);
          updateBulkBar();
          const selectAll = $('#selectAll');
          if(selectAll) selectAll.checked = state.selected.size === list.length;
        };
      });
      host.querySelectorAll('[data-edit]').forEach(x => {
        x.onclick = async () => {
          const id = Number(x.dataset.edit);
          const item = list.find(a => a.id === id);
          if(item) openForm(item);
          else {
            // fetch full
            const full = await request('/api/exercises/' + id);
            openForm(full);
          }
        };
      });

      const selectAll = $('#selectAll');
      if(selectAll){
        selectAll.onchange = () => {
          if(selectAll.checked){
            list.forEach(it=>state.selected.add(it.id));
          } else {
            state.selected.clear();
          }
          host.querySelectorAll('[data-check]').forEach(cb=>{
            cb.checked = selectAll.checked;
            cb.closest('.exercise-card').classList.toggle('selected-card', cb.checked);
          });
          updateBulkBar();
        };
      }

      renderPagination();
      updateBulkBar();
      bindBulkActions();

    } catch (e) {
      host.innerHTML = `<div class="error-state"><p>خطا در بارگذاری: ${esc(e.message)}</p><button onclick="location.reload()">تلاش مجدد</button></div>`;
    } finally {
      state.loading = false;
    }
  }

  function updateBulkBar() {
    const bar = $('#bulkBar');
    const countEl = $('#bulkCount');
    if (!bar) return;
    if (state.selected.size > 0) {
      bar.classList.remove('hidden');
      countEl.textContent = `${state.selected.size} انتخاب`;
      $('#bulkArchive').textContent = state.status==='active' ? `📦 آرشیو (${state.selected.size})` : `♻️ بازیابی (${state.selected.size})`;
    } else {
      bar.classList.add('hidden');
    }
  }

  function bindBulkActions(){
    const a = $('#bulkArchive');
    if (a) a.onclick = () => bulk(state.status === 'active' ? 'bulk-archive' : 'bulk-restore');
    const d = $('#bulkDelete');
    if (d) d.onclick = () => bulk('bulk-delete');
    const c = $('#clearSelection');
    if (c) c.onclick = () => { state.selected.clear(); load(); };
  }

  async function bulk(action) {
    if (action === 'bulk-delete' && !confirm(`آیا ${state.selected.size} حرکت انتخاب‌شده حذف شوند؟ این عمل غیرقابل بازگشت است.`)) return;
    if (state.selected.size===0) return;
    try {
      await request('/api/exercises/' + action, {
        method: action === 'bulk-delete' ? 'DELETE' : 'POST',
        body: JSON.stringify({ ids: [...state.selected] })
      });
      state.selected.clear();
      load();
    } catch(e){
      alert('خطا: ' + e.message);
    }
  }

  function openForm(item) {
    const cat = selectedCategory();
    const subOptions = (cat?.subs || []).map(s => `<option value="${s.id}" ${item?.subcategory_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const m = document.createElement('div');
    m.className = 'modal-backdrop';
    m.innerHTML = `
      <form class="modal exercise-form">
        <div class="modal-head">
          <h2>${item ? 'ویرایش حرکت' : 'افزودن حرکت'}</h2>
          <button class="close" type="button">×</button>
        </div>
        <div class="form-grid">
          <label>نام حرکت فارسی *
            <input name="name_fa" required value="${esc(item?.name_fa || '')}" placeholder="مثلاً پرس سینه هالتر">
          </label>
          <label>محل انجام
            <select name="location">
              <option value="both" ${item?.location==='both'?'selected':''}>هر دو</option>
              <option value="gym" ${item?.location==='gym'?'selected':''}>باشگاه</option>
              <option value="home" ${item?.location==='home'?'selected':''}>منزل</option>
            </select>
          </label>
          <label>زیردسته
            <select name="subcategory_id">
              <option value="">بدون زیردسته</option>
              ${subOptions}
            </select>
          </label>
          <label>وضعیت
            <select name="status">
              <option value="active" ${item?.status!=='archived'?'selected':''}>اصلی</option>
              <option value="archived" ${item?.status==='archived'?'selected':''}>آرشیو</option>
            </select>
          </label>
          <label>اولویت (1-10)
            <input name="priority" type="number" min="1" max="10" value="${item?.priority||5}">
          </label>
          <label>مسیر تصویر
            <input name="image_path" value="${esc(item?.image_path||'')}" placeholder="/files/exercise/images/4.png">
          </label>
          <label>مسیر ویدیو
            <input name="video_path" value="${esc(item?.video_path||'')}" placeholder="/files/exercise/videos/4.mp4">
          </label>
        </div>
        ${item?.image_path ? `<div class="form-preview"><p>پیش‌نمایش تصویر:</p><img src="${esc(item.image_path)}" style="max-width:100px;max-height:100px;border-radius:8px;" onerror="this.style.display='none'"></div>` : ''}
        <div class="modal-actions">
          <button class="secondary close" type="button">انصراف</button>
          <button class="primary">💾 ذخیره</button>
        </div>
      </form>
    `;
    document.body.append(m);
    m.querySelectorAll('.close').forEach(x => x.onclick = () => m.remove());
    m.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const b = Object.fromEntries(fd);
      b.category_id = state.categoryId;
      b.priority = parseInt(b.priority)||5;
      if(!b.subcategory_id) b.subcategory_id = null;
      try {
        await request(item ? '/api/exercises/' + item.id : '/api/exercises', {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(b)
        });
        m.remove();
        load();
        // Refresh categories counts
        const groupedCats = await request('/api/categories/grouped');
        state.categories = groupedCats;
        renderCategoryMenu();
        renderAfter();
      } catch(err){
        alert('خطا: ' + err.message);
      }
    };
  }

  function bindEvents() {
    renderCategoryMenu();
    $('#categoryToggle').onclick = e => {
      if (e.target.id === 'clearCategory') return;
      $('#categoryMenu').classList.toggle('open');
    };
    $('#clearCategory').onclick = e => {
      e.stopPropagation();
      state.categoryId = null;
      state.subCategoryId = 'all';
      state.page = 0;
      state.selected.clear();
      $('#categoryName').textContent = 'دسته‌بندی حرکت را انتخاب کنید';
      $('#categoryMenu').classList.remove('open');
      renderAfter();
    };
    document.querySelectorAll('[data-location]').forEach(b => {
      b.classList.toggle('active', b.dataset.location === state.location);
      b.onclick = () => {
        state.location = b.dataset.location;
        document.querySelectorAll('[data-location]').forEach(x => x.classList.toggle('active', x === b));
        state.page = 0;
        if (state.categoryId) load();
      };
    });

    const searchInput = $('#exerciseSearch');
    let searchTimeout;
    searchInput.oninput = e => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(()=>{
        state.query = e.target.value;
        state.page = 0;
        if (state.categoryId) load();
      }, 400);
    };

    $('#tabs').querySelectorAll('.tab').forEach(b => {
      b.onclick = () => {
        state.status = b.dataset.status;
        state.page = 0;
        state.selected.clear();
        renderAfter();
        load();
      };
    });

    $('#addExercise').onclick = () => {
      if (!state.categoryId) return alert('ابتدا دسته‌بندی حرکت را انتخاب کنید.');
      openForm();
    };

    $('#sortBy').onchange = e => {
      state.sortBy = e.target.value;
      state.page = 0;
      if(state.categoryId) load();
    };

    // Close dropdown on outside click
    document.addEventListener('click', (e)=>{
      const picker = $('.category-picker');
      if(picker && !picker.contains(e.target)){
        $('#categoryMenu').classList.remove('open');
      }
    });
  }

  window.renderExerciseManager = async (label, route) => {
    window.current = route;
    const breadcrumb = document.querySelector('#breadcrumb');
    if(breadcrumb) breadcrumb.textContent = label;
    document.querySelectorAll('.menu-link').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    const content = document.querySelector('#content');
    content.innerHTML = root(label);

    try {
      // Fetch grouped categories with counts
      const groupedCats = await request('/api/categories/grouped');
      state.categories = groupedCats;
      state.total = groupedCats.reduce((sum,c)=>sum + (c.count||0), 0);
      const totalEl = $('#totalCount');
      if(totalEl) totalEl.textContent = state.total;

      // Check images
      try {
        const imgStatus = await request('/api/images/status');
        const imgEl = $('#imageCount');
        const statusEl = $('#imageStatus');
        if(imgEl) imgEl.textContent = imgStatus.imported || 0;
        if(statusEl){
          const db = imgStatus.db || {};
          if(imgStatus.imported === 0){
            statusEl.innerHTML = `
              ⚠️ هیچ تصویری در <code>public/assets/images/exercises/imported</code> پیدا نشد.<br>
              از لانچر گزینه 6 را بزنید.<br>
              <small>دیتابیس: ${db.withImage||0} حرکت دارای عکس، ${db.withoutImage||0} بدون عکس (فعال بدون عکس: ${db.activeWithoutImage||0}، آرشیو: ${db.archived||0})</small>
            `;
            statusEl.className = 'image-status warning';
          } else {
            statusEl.innerHTML = `
              ✅ ${imgStatus.imported} فایل تصویر در پوشه imported موجود است<br>
              <small>دیتابیس: ${db.total||0} کل، ${db.withImage||0} دارای مسیر عکس، ${db.withoutImage||0} بدون مسیر عکس<br>
              فعال با عکس: ${db.activeWithImage||0}، فعال بدون عکس: ${db.activeWithoutImage||0} (طبیعی است - در دیتای اصلی عکس ندارند)، آرشیو: ${db.archived||0}</small>
            `;
            statusEl.className = 'image-status success';
          }
        }
      } catch(e){
        console.log('Image status check failed', e);
      }

      bindEvents();

      // Auto-select chest if exists (like old Flutter app)
      if(!state.categoryId){
        const chest = state.categories.find(c=>c.id==='chest');
        if(chest){
          // Don't auto-select immediately, let user choose, but we can show hint
          // selectCategory(chest.id); // Uncomment to auto-select
        }
      }

    } catch(e){
      content.innerHTML = `<div class="error-state"><h3>خطا در بارگذاری دسته‌بندی‌ها</h3><p>${esc(e.message)}</p></div>`;
    }
  };
})();
