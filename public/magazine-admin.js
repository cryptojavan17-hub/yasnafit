/* YASNAFIT — Coach editorial panel (public site content management).
   Route: /coach/magazine — tabs: Articles | Results | Categories | Settings.
   CSP-safe: no inline handlers; data-* attributes + addEventListener.
   All mutations go through the coach-gated /api/magazine/admin/* endpoints.
*/
(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const faDigits = value => String(value ?? '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const faDate = iso => {
    if (!iso) return '—';
    const day = String(iso).slice(0, 10);
    try { return (window.YasnaJalali && window.YasnaJalali.format(day)) || day; } catch (e) { return day; }
  };

  const STATUS_LABELS = { DRAFT: 'پیش‌نویس', PENDING_REVIEW: 'در انتظار بررسی', REJECTED: 'رد شده', PUBLISHED: 'منتشر شده' };
  const ORIGIN_LABELS = { human: 'نویسشی انسان', generated: 'تولید خودکار', edited: 'تولید خودکار ویرایش‌شده', imported: 'ایمپورت‌شده' };
  const CONSENT_LABELS = { none: 'بدون رضایت', verbal: 'رضایت کلامی', written: 'رضایت کتبی' };

  const state = {
    tab: 'articles',
    status: '',
    categoryId: '',
    search: '',
    selection: new Set(),
    categories: [],
    articles: [],
    articleCounts: {},
    stories: [],
    settings: null,
    profile: null,
    reviewId: null,
    review: null,
    queue: [],
    newsStats: {},
    progress: { running: false, phase: 'idle' },
    canSearchMore: false,
    discoverRunning: false,
    sources: [],
    editingSource: null
  };

  async function api(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.replace('/coach/login');
      throw new Error(data.error || 'نشست مربی معتبر نیست.');
    }
    if (!response.ok) throw new Error(data.error || 'خطا در ارتباط با سرور');
    return data;
  }

  function toast(message, isError) {
    let el = document.getElementById('magazineToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'magazineToast';
      el.className = 'magazine-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('is-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('is-visible'), 3800);
  }

  // ---------- Shell ----------
  function renderMagazineAdmin(label, route) {
    const tabs = [
      ['articles', 'مقالات'],
      ['news', 'اخبار و مطالب جدید'],
      ['results', 'نتایج شاگردان'],
      ['categories', 'دسته‌بندی‌ها'],
      ['settings', 'تنظیمات سایت']
    ];
    const crumb = document.querySelector('#breadcrumb');
    if (crumb) crumb.textContent = 'مجله و سایت';
    const content = document.querySelector('#content');
    content.innerHTML = `
      <div class="magazine-admin">
        <div class="magazine-admin__head">
          <div>
            <h1>مجله و سایت عمومی</h2>
            <p class="magazine-admin__sub">مدیریت محتوای سایت عمومی YASNAFIT: اخبار و مطالب جدید، مقالات، نتایج، دسته‌بندی‌ها و تنظیمات انتشار</p>
          </div>
        </div>
        <div class="magazine-tabs" role="tablist" aria-label="بخش‌های مدیریت مجله">
          ${tabs.map(([id, name]) => `<button type="button" role="tab" class="magazine-tab${state.tab === id ? ' is-active' : ''}" data-tab="${id}" aria-selected="${state.tab === id}">${name}</button>`).join('')}
        </div>
        <div class="magazine-pane" id="magazinePane" aria-live="polite"></div>
      </div>`;
    content.querySelectorAll('.magazine-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.tab = tab.dataset.tab;
        content.querySelectorAll('.magazine-tab').forEach(t => {
          const active = t.dataset.tab === state.tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        renderPane();
      });
    });
    renderPane();
  }

  async function renderPane() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    pane.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>در حال بارگذاری…</p></div>';
    try {
      if (state.tab === 'articles') {
        const [articles, categories] = await Promise.all([
          api(`/api/magazine/admin/articles?status=${encodeURIComponent(state.status)}&category_id=${encodeURIComponent(state.categoryId)}&search=${encodeURIComponent(state.search)}`),
          api('/api/magazine/admin/categories')
        ]);
        state.articles = articles.items;
        state.articleCounts = articles.counts || {};
        state.categories = categories.categories;
        pane.innerHTML = articlesMarkup();
        bindArticles();
      } else if (state.tab === 'results') {
        const data = await api('/api/magazine/admin/results');
        state.stories = data.stories;
        pane.innerHTML = resultsMarkup();
        bindResults();
      } else if (state.tab === 'categories') {
        const data = await api('/api/magazine/admin/categories');
        state.categories = data.categories;
        pane.innerHTML = categoriesMarkup();
        bindCategories();
      } else if (state.tab === 'news') {
        if (state.reviewId) {
          const [detail, categories] = await Promise.all([
            api(`/api/magazine/admin/queue/${state.reviewId}`),
            api('/api/magazine/admin/categories')
          ]);
          state.review = detail;
          state.categories = categories.categories;
          pane.innerHTML = reviewMarkup();
          bindReview();
        } else {
          const [data, stats, categories] = await Promise.all([
            api('/api/magazine/admin/queue'),
            api('/api/magazine/admin/queue/stats'),
            api('/api/magazine/admin/categories')
          ]);
          state.queue = data.queue;
          state.newsStats = stats;
          state.categories = categories.categories;
          pane.innerHTML = newsMarkup();
          bindNews();
        }
      } else if (state.tab === 'sources') {
        const [data, categories] = await Promise.all([
          api('/api/magazine/admin/sources'),
          api('/api/magazine/admin/categories')
        ]);
        state.sources = data.sources;
        state.categories = categories.categories;
        pane.innerHTML = sourcesMarkup();
        bindSources();
      } else if (state.tab === 'settings') {
        const [settings, profile] = await Promise.all([api('/api/magazine/admin/settings'), api('/api/magazine/admin/coach-profile')]);
        state.settings = settings.settings;
        state.profile = profile;
        pane.innerHTML = settingsMarkup();
        bindSettings();
      }
    } catch (error) {
      pane.innerHTML = `<div class="empty-state-sm">${esc(error.message)}</div>`;
    }
  }

  // ---------- Articles ----------
  const STATUS_FILTERS = [['', 'همه'], ['DRAFT', 'پیش‌نویس‌ها'], ['PENDING_REVIEW', 'در انتظار بررسی'], ['PUBLISHED', 'منتشر شده'], ['REJECTED', 'رد شده']];

  function statusBadge(status) {
    return `<span class="mag-badge mag-badge--${esc(status)}">${STATUS_LABELS[status] || esc(status)}</span>`;
  }

  function articlesMarkup() {
    const allChecked = state.articles.length > 0 && state.articles.every(a => state.selection.has(a.id));
    const someChecked = state.articles.some(a => state.selection.has(a.id));
    const selectedCount = state.articles.filter(a => state.selection.has(a.id)).length;
    const total = ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PUBLISHED'].reduce((sum, key) => sum + (state.articleCounts[key] || 0), 0);
    return `
      <div class="mag-toolbar">
        <div class="mag-status-tabs" role="group" aria-label="فیلتر وضعیت">
          ${STATUS_FILTERS.map(([value, label]) => `<button type="button" class="mag-chip${state.status === value ? ' is-active' : ''}" data-status="${value}" aria-pressed="${state.status === value}">${label} (${faDigits(value ? (state.articleCounts[value] || 0) : total)})</button>`).join('')}
        </div>
        <div class="mag-toolbar__actions">
          <select class="field" id="magCategoryFilter" aria-label="فیلتر دسته‌بندی">
            <option value="">همه دسته‌ها</option>
            ${state.categories.map(c => `<option value="${c.id}" ${String(state.categoryId) === String(c.id) ? 'selected' : ''}>${esc(c.name_fa)}</option>`).join('')}
          </select>
          <input class="field" id="magSearch" type="search" placeholder="جستجو در عنوان و خلاصه…" value="${esc(state.search)}" aria-label="جستجوی مقاله">
          <button type="button" class="primary" id="magNewArticle">＋ مقاله جدید</button>
        </div>
      </div>
      ${selectedCount ? `
      <div class="mag-bulkbar">
        <span>${faDigits(selectedCount)} مقاله انتخاب شده</span>
        <div class="mag-bulkbar__actions">
          <button type="button" class="primary btn-small" data-bulk="publish">انتشار انتخاب‌شده</button>
          <button type="button" class="secondary btn-small" data-bulk="delete">حذف انتخاب‌شده</button>
        </div>
      </div>` : ''}
      <div class="table-wrap">
        <table class="mag-table">
          <thead>
            <tr>
              <th class="mag-table__check"><input type="checkbox" id="magSelectAll" aria-label="انتخاب همه" ${allChecked ? 'checked' : ''} ${someChecked && !allChecked ? 'indeterminate' : ''}></th>
              <th>مقاله</th>
              <th>دسته</th>
              <th>وضعیت</th>
              <th>منشأ</th>
              <th>بروزرسانی</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            ${state.articles.length ? state.articles.map(a => `
              <tr data-id="${a.id}">
                <td><input type="checkbox" class="mag-row-check" data-id="${a.id}" aria-label="انتخاب ${esc(a.title)}" ${state.selection.has(a.id) ? 'checked' : ''}></td>
                <td>
                  <div class="mag-title-cell">
                    <b>${esc(a.title)}</b>
                    <span class="mag-slug" dir="ltr">/${esc(a.slug)}</span>
                  </div>
                </td>
                <td>${esc(a.category_name || '—')}</td>
                <td>${statusBadge(a.status)}</td>
                <td class="mag-origin" title="${ORIGIN_LABELS[a.content_origin] || a.content_origin}">${ORIGIN_LABELS[a.content_origin] || esc(a.content_origin)}</td>
                <td>${faDate(a.updated_at)}</td>
                <td>
                  <div class="mag-actions">
                    <button type="button" class="mag-action" data-action="view" data-id="${a.id}">مشاهده</button>
                    <button type="button" class="mag-action" data-action="edit" data-id="${a.id}">ویرایش</button>
                    ${['DRAFT', 'PENDING_REVIEW', 'REJECTED'].includes(a.status) ? `<button type="button" class="mag-action mag-action--publish" data-action="publish" data-id="${a.id}">تأیید و انتشار</button>` : ''}
                    ${a.status === 'PENDING_REVIEW' || a.status === 'DRAFT' ? `<button type="button" class="mag-action mag-action--reject" data-action="reject" data-id="${a.id}">رد</button>` : ''}
                    ${a.status === 'DRAFT' ? `<button type="button" class="mag-action" data-action="to-review" data-id="${a.id}">ارسال به بررسی</button>` : ''}
                    ${a.status === 'PUBLISHED' ? `<button type="button" class="mag-action" data-action="to-draft" data-id="${a.id}">لغو انتشار</button>` : ''}
                    ${a.status !== 'PENDING_REVIEW' ? `<button type="button" class="mag-action mag-action--danger" data-action="delete" data-id="${a.id}">حذف</button>` : ''}
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="7" class="empty">مقاله‌ای با این فیلترها پیدا نشد.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function bindArticles() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    pane.querySelectorAll('.mag-chip').forEach(chip => chip.addEventListener('click', () => {
      state.status = chip.dataset.status;
      state.selection.clear();
      renderPane();
    }));
    const categoryFilter = pane.querySelector('#magCategoryFilter');
    if (categoryFilter) categoryFilter.addEventListener('change', () => {
      state.categoryId = categoryFilter.value;
      state.selection.clear();
      renderPane();
    });
    const search = pane.querySelector('#magSearch');
    if (search) {
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const pos = search.selectionStart;
          state.search = search.value.trim();
          state.selection.clear();
          await renderPane();
          const el = document.querySelector('#magSearch');
          if (el) {
            el.focus();
            try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
          }
        }, 450);
      });
    }
    const newBtn = pane.querySelector('#magNewArticle');
    if (newBtn) newBtn.addEventListener('click', () => articleModal(null));
    const selectAll = pane.querySelector('#magSelectAll');
    if (selectAll) {
      selectAll.indeterminate = state.articles.some(a => state.selection.has(a.id)) && !state.articles.every(a => state.selection.has(a.id));
      selectAll.addEventListener('change', () => {
        state.articles.forEach(a => {
          if (selectAll.checked) state.selection.add(a.id);
          else state.selection.delete(a.id);
        });
        renderPane();
      });
    }
    pane.querySelectorAll('.mag-row-check').forEach(box => box.addEventListener('change', () => {
      if (box.checked) state.selection.add(Number(box.dataset.id));
      else state.selection.delete(Number(box.dataset.id));
      renderPane();
    }));
    pane.querySelectorAll('[data-bulk]').forEach(btn => btn.addEventListener('click', async () => {
      const ids = [...state.selection];
      if (!ids.length) return;
      const action = btn.dataset.bulk;
      if (action === 'delete' && !window.confirm('مقاله‌های انتخاب‌شده حذف شوند؟')) return;
      try {
        const result = await api('/api/magazine/admin/articles/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) });
        toast(`${faDigits(result.count)} مقاله ${action === 'publish' ? 'انتشار یافت' : 'حذف شد'}`);
        state.selection.clear();
        renderPane();
      } catch (error) { toast(error.message, true); }
    }));
    pane.querySelectorAll('.mag-action').forEach(btn => btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);
      if (action === 'view' || action === 'edit') return articleModal(id, action === 'view' ? 'view' : 'edit');
      const verbs = { publish: 'تأیید و انتشار', reject: 'رد', 'to-review': 'ارسال به بررسی', 'to-draft': 'لغو انتشار', delete: 'حذف' };
      if (action === 'delete' && !window.confirm('این مقاله حذف شود؟')) return;
      try {
        if (action === 'delete') await api(`/api/magazine/admin/articles/${id}`, { method: 'DELETE' });
        else await api(`/api/magazine/admin/articles/${id}/${action}`, { method: 'POST' });
        toast(`عمل «${verbs[action]}» انجام شد`);
        state.selection.delete(id);
        renderPane();
      } catch (error) { toast(error.message, true); }
    }));
  }

  function articleModal(id, mode = 'edit') {
    const isView = mode === 'view';
    const existing = id ? state.articles.find(a => a.id === id) : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <form class="modal modal--wide" data-article-form>
        <div class="modal-head">
          <h2>${isView ? 'مشاهده مقاله' : existing ? 'ویرایش مقاله' : 'مقاله جدید'}</h2>
          <button type="button" class="close" data-close-modal aria-label="بستن">×</button>
        </div>
        <div class="modal-body">
          ${isView && existing ? `
            <div class="mag-article-view">
              <div class="mag-article-view__meta">
                <span class="mag-slug" dir="ltr">/${esc(existing.slug)}</span>
                ${statusBadge(existing.status)}
                <span class="mag-origin">${ORIGIN_LABELS[existing.content_origin] || ''}</span>
              </div>
              <h3>${esc(existing.title)}</h3>
              <p>${esc(existing.summary || '')}</p>
              <div class="article-body-preview">${existing.content || 'بدون متن'}</div>
            </div>` : `
            <div class="form-grid">
              <label class="field-label">عنوان *<input class="field" name="title" required maxlength="200" value="${esc(existing?.title || '')}"></label>
              <label class="field-label">Slug (اختیاری)<input class="field" name="slug" dir="ltr" maxlength="120" placeholder="auto-from-title" value="${esc(existing?.slug || '')}"></label>
              <label class="field-label">دسته‌بندی
                <select class="field" name="category">
                  <option value="">— بدون دسته —</option>
                  ${state.categories.filter(c => !c.deleted_at).map(c => `<option value="${c.id}" ${existing?.category_id === c.id ? 'selected' : ''}>${esc(c.name_fa)}</option>`).join('')}
                </select>
              </label>
              <label class="field-label">تصویر کاور (مسیر)<input class="field" name="cover_image" dir="ltr" placeholder="/images/landing/…" value="${esc(existing?.cover_image || '')}"></label>
              <label class="field-label field-label--full">خلاصه (SEO)<textarea class="field" name="summary" rows="2" maxlength="500">${esc(existing?.summary || '')}</textarea></label>
              <label class="field-label field-label--full">متن مقاله (HTML ساده: پاراگراف، هدر، لیست، نقل‌قول، جدول، لینک منبع)<textarea class="field" name="content" rows="10" dir="auto">${esc(existing?.content || '')}</textarea></label>
              <label class="field-label">نام منبع (اختیاری)<input class="field" name="source_name" maxlength="200" value="${esc(existing?.source_name || '')}"></label>
              <label class="field-label">آدرس منبع (اختیاری)<input class="field" name="source_url" dir="ltr" maxlength="500" placeholder="https://…" value="${esc(existing?.source_url || '')}"></label>
              <label class="field-label">منشأ محتوا (فقط داخلی)
                <select class="field" name="content_origin">
                  ${Object.entries(ORIGIN_LABELS).map(([value, label]) => `<option value="${value}" ${existing?.content_origin === value ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
              </label>
              ${existing ? '' : `<label class="field-label field-label--full check-label"><input type="checkbox" name="publish"> فوراً منتشر کن (بدون این گزینه: پیش‌نویس)</label>`}
            </div>
            <div class="mag-sources-editor" id="magSourcesEditor">
              <div class="mag-sources-editor__head"><h4>منابع مقاله</h4><button type="button" class="secondary btn-small" id="magAddSource">＋ افزودن منبع</button></div>
              <div id="magSourcesList"></div>
            </div>`}
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-close-modal>بستن</button>
          ${isView ? '' : '<button type="submit" class="primary">ذخیره</button>'}
        </div>
      </form>`;
    document.body.append(backdrop);
    const form = backdrop.querySelector('form');
    backdrop.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
    document.addEventListener('keydown', escClose);
    function escClose(event) { if (event.key === 'Escape') { backdrop.remove(); document.removeEventListener('keydown', escClose); } }

    if (isView || !existing) {
      // sources editor
      const sourcesList = backdrop.querySelector('#magSourcesList');
      const addBtn = backdrop.querySelector('#magAddSource');
      let sources = existing ? [...(existing.sources || [])] : [];
      function renderSources() {
        if (!sourcesList) return;
        sourcesList.innerHTML = sources.length ? sources.map((s, i) => `
          <div class="mag-source-row">
            <input class="field" data-source-index="${i}" data-source-field="name" placeholder="نام منبع" value="${esc(s.source_name || '')}">
            <input class="field" data-source-index="${i}" data-source-field="url" dir="ltr" placeholder="https://…" value="${esc(s.source_url || '')}">
            <button type="button" class="mag-action mag-action--danger" data-source-remove="${i}">حذف</button>
          </div>`).join('') : '<p class="mag-sources-empty">منبعی ثبت نشده است. (برای محتوای علمی، منبع را حتماً ثبت کنید.)</p>';
        sourcesList.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
          const index = Number(input.dataset.sourceIndex);
          sources[index] = { ...sources[index], [input.dataset.sourceField === 'url' ? 'source_url' : 'source_name']: input.value };
        }));
        sourcesList.querySelectorAll('[data-source-remove]').forEach(btn => btn.addEventListener('click', () => {
          sources.splice(Number(btn.dataset.sourceRemove), 1);
          renderSources();
        }));
      }
      if (addBtn) addBtn.addEventListener('click', () => { sources.push({ source_name: '', source_url: '' }); renderSources(); });
      renderSources();
      form._collectSources = () => sources.filter(s => (s.source_name || '').trim() || (s.source_url || '').trim());
    }

    if (!isView) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(form));
        const body = {
          title: fields.title,
          slug: fields.slug || undefined,
          category: fields.category ? fields.category : null,
          cover_image: fields.cover_image,
          summary: fields.summary,
          content: fields.content,
          source_name: fields.source_name,
          source_url: fields.source_url,
          content_origin: fields.content_origin,
          sources: form._collectSources ? form._collectSources() : undefined
        };
        try {
          const submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;
          let saved;
          if (existing) saved = await api(`/api/magazine/admin/articles/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
          else saved = await api('/api/magazine/admin/articles', { method: 'POST', body: JSON.stringify({ ...body, publish: Boolean(form.querySelector('[name="publish"]')?.checked) }) });
          toast(`مقاله «${saved.title}» ذخیره شد`);
          backdrop.remove();
          document.removeEventListener('keydown', escClose);
          renderPane();
        } catch (error) {
          toast(error.message, true);
          const submitBtn = form.querySelector('[type="submit"]');
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  // ---------- Results ----------
  function resultsMarkup() {
    return `
      <div class="mag-toolbar">
        <p class="mag-toolbar__note">نتایج فقط با رضایت شاگرد نمایش داده می‌شوند؛ هیچ اطلاعات هویتی درج نکنید.</p>
        <button type="button" class="primary" id="magNewStory">＋ نتیجه جدید</button>
      </div>
      <div class="table-wrap">
        <table class="mag-table">
          <thead><tr><th>عنوان</th><th>نام نمایشی</th><th>مدت</th><th>هدف</th><th>رضایت</th><th>وضعیت</th><th>عملیات</th></tr></thead>
          <tbody>
            ${state.stories.length ? state.stories.map(s => `
              <tr>
                <td><b>${esc(s.title)}</b></td>
                <td>${esc(s.display_name || '—')}</td>
                <td>${s.duration_months ? `${faDigits(s.duration_months)} ماه` : '—'}</td>
                <td>${esc(s.goal || '—')}</td>
                <td>${CONSENT_LABELS[s.consent_status] || '—'}</td>
                <td><span class="mag-badge mag-badge--${esc(s.status)}">${s.status === 'PUBLISHED' ? 'منتشر شده' : s.status === 'ARCHIVED' ? 'آرشیو' : 'پیش‌نویس'}</span></td>
                <td>
                  <div class="mag-actions">
                    <button type="button" class="mag-action" data-story-action="edit" data-id="${s.id}">ویرایش</button>
                    ${s.status === 'PUBLISHED'
                      ? `<button type="button" class="mag-action" data-story-action="unpublish" data-id="${s.id}">لغو انتشار</button>`
                      : `<button type="button" class="mag-action mag-action--publish" data-story-action="publish" data-id="${s.id}">انتشار</button>`}
                    <button type="button" class="mag-action mag-action--danger" data-story-action="delete" data-id="${s.id}">حذف</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="7" class="empty">هنوز نتیجه‌ای ثبت نشده است.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function bindResults() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    const newBtn = pane.querySelector('#magNewStory');
    if (newBtn) newBtn.addEventListener('click', () => storyModal(null));
    pane.querySelectorAll('[data-story-action]').forEach(btn => btn.addEventListener('click', async () => {
      const action = btn.dataset.storyAction;
      const id = Number(btn.dataset.id);
      if (action === 'edit') return storyModal(id);
      if (action === 'delete' && !window.confirm('این نتیجه حذف شود؟')) return;
      try {
        if (action === 'delete') await api(`/api/magazine/admin/results/${id}`, { method: 'DELETE' });
        else await api(`/api/magazine/admin/results/${id}/${action}`, { method: 'POST' });
        toast('عملیات انجام شد');
        renderPane();
      } catch (error) { toast(error.message, true); }
    }));
  }

  function storyModal(id) {
    const existing = id ? state.stories.find(s => s.id === id) : null;
    const metricsText = existing?.metrics ? (typeof existing.metrics === 'string' ? existing.metrics : JSON.stringify(existing.metrics, null, 2)) : '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <form class="modal modal--wide" data-story-form>
        <div class="modal-head">
          <h2>${existing ? 'ویرایش نتیجه' : 'نتیجه جدید'}</h2>
          <button type="button" class="close" data-close-modal aria-label="بستن">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="field-label">عنوان *<input class="field" name="title" required maxlength="160" value="${esc(existing?.title || '')}"></label>
            <label class="field-label">نام نمایشی (اختیاری، بدون هویت کامل)<input class="field" name="display_name" maxlength="80" value="${esc(existing?.display_name || '')}"></label>
            <label class="field-label">مدت دوره (ماه)<input class="field" name="duration_months" type="number" min="1" max="60" value="${existing?.duration_months ?? ''}"></label>
            <label class="field-label">هدف<input class="field" name="goal" maxlength="300" value="${esc(existing?.goal || '')}"></label>
            <label class="field-label">تصویر قبل (مسیر)<input class="field" name="before_image" dir="ltr" placeholder="/images/landing/…" value="${esc(existing?.before_image || '')}"></label>
            <label class="field-label">تصویر بعد (مسیر)<input class="field" name="after_image" dir="ltr" placeholder="/images/landing/…" value="${esc(existing?.after_image || '')}"></label>
            <label class="field-label field-label--full">اعداد شاخص (JSON، اختیاری)<textarea class="field" name="metrics" rows="3" dir="ltr" placeholder='{"کاهش وزن (کیلوگرم)": "7"}' ${existing?.metrics ? '' : ''}>${esc(metricsText)}</textarea></label>
            <label class="field-label field-label--full">نقل‌قول شاگرد (اختیاری)<textarea class="field" name="testimonial" rows="3" maxlength="1000">${esc(existing?.testimonial || '')}</textarea></label>
            <label class="field-label">وضعیت رضایت
              <select class="field" name="consent_status">
                ${Object.entries(CONSENT_LABELS).map(([value, label]) => `<option value="${value}" ${existing?.consent_status === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-close-modal>بستن</button>
          <button type="submit" class="primary">ذخیره</button>
        </div>
      </form>`;
    document.body.append(backdrop);
    backdrop.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
    const form = backdrop.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      let metrics = fields.metrics;
      if (metrics) {
        try { metrics = JSON.parse(metrics); } catch (e) { toast('اعداد شاخص باید JSON معتبر باشد', true); return; }
      } else metrics = null;
      const body = {
        title: fields.title, display_name: fields.display_name, goal: fields.goal,
        duration_months: fields.duration_months || null, before_image: fields.before_image,
        after_image: fields.after_image, testimonial: fields.testimonial,
        consent_status: fields.consent_status, metrics
      };
      try {
        if (existing) await api(`/api/magazine/admin/results/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        else await api('/api/magazine/admin/results', { method: 'POST', body: JSON.stringify(body) });
        toast('نتیجه ذخیره شد');
        backdrop.remove();
        renderPane();
      } catch (error) { toast(error.message, true); }
    });
  }

  // ---------- Categories ----------
  function categoriesMarkup() {
    return `
      <div class="mag-toolbar">
        <p class="mag-toolbar__note">دسته‌ها در فیلترهای مجلهٔ سایت عمومی و فرم مقاله استفاده می‌شوند.</p>
        <button type="button" class="primary" id="magNewCategory">＋ دسته جدید</button>
      </div>
      <div class="table-wrap">
        <table class="mag-table">
          <thead><tr><th>نام</th><th>Slug</th><th>تعداد مقاله</th><th>ترتیب</th><th>فعال</th><th>عملیات</th></tr></thead>
          <tbody>
            ${state.categories.map(c => `
              <tr>
                <td><b>${esc(c.name_fa)}</b></td>
                <td class="mag-slug" dir="ltr">${esc(c.slug)}</td>
                <td>${faDigits(c.article_count || 0)}</td>
                <td>${faDigits(c.sort_order || 0)}</td>
                <td>${c.is_active ? '<span class="mag-badge mag-badge--PUBLISHED">فعال</span>' : '<span class="mag-badge mag-badge--DRAFT">غیرفعال</span>'}</td>
                <td>
                  <div class="mag-actions">
                    <button type="button" class="mag-action" data-cat-action="edit" data-id="${c.id}">ویرایش</button>
                    <button type="button" class="mag-action mag-action--danger" data-cat-action="delete" data-id="${c.id}">حذف</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function bindCategories() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    const newBtn = pane.querySelector('#magNewCategory');
    if (newBtn) newBtn.addEventListener('click', () => categoryModal(null));
    pane.querySelectorAll('[data-cat-action]').forEach(btn => btn.addEventListener('click', async () => {
      const action = btn.dataset.catAction;
      const id = Number(btn.dataset.id);
      if (action === 'edit') return categoryModal(id);
      if (!window.confirm('این دسته حذف شود؟ مقالات آن «بدون دسته» می‌شوند.')) return;
      try {
        await api(`/api/magazine/admin/categories/${id}`, { method: 'DELETE' });
        toast('دسته حذف شد');
        renderPane();
      } catch (error) { toast(error.message, true); }
    }));
  }

  function categoryModal(id) {
    const existing = id ? state.categories.find(c => c.id === id) : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <form class="modal" data-category-form>
        <div class="modal-head">
          <h2>${existing ? 'ویرایش دسته' : 'دسته جدید'}</h2>
          <button type="button" class="close" data-close-modal aria-label="بستن">×</button>
        </div>
        <div class="form-grid">
          <label class="field-label">نام فارسی *<input class="field" name="name_fa" required maxlength="80" value="${esc(existing?.name_fa || '')}"></label>
          <label class="field-label">ترتیب نمایش<input class="field" name="sort_order" type="number" min="0" max="999" value="${existing?.sort_order ?? 0}"></label>
          ${existing ? `<label class="field-label check-label"><input type="checkbox" name="is_active" ${existing.is_active ? 'checked' : ''}> در سایت عمومی فعال باشد</label>` : ''}
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-close-modal>بستن</button>
          <button type="submit" class="primary">ذخیره</button>
        </div>
      </form>`;
    document.body.append(backdrop);
    backdrop.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
    const form = backdrop.querySelector('form');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      const body = { name_fa: fields.name_fa, sort_order: Number(fields.sort_order) || 0 };
      if (existing) body.is_active = form.querySelector('[name="is_active"]').checked;
      try {
        if (existing) await api(`/api/magazine/admin/categories/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        else await api('/api/magazine/admin/categories', { method: 'POST', body: JSON.stringify(body) });
        toast('دسته ذخیره شد');
        backdrop.remove();
        renderPane();
      } catch (error) { toast(error.message, true); }
    });
  }

  // ---------- Settings ----------
  function toggleHtml(name, checked, label, hint) {
    return `<div class="mag-toggle-row">
      <div>
        <b>${esc(label)}</b>
        ${hint ? `<small>${esc(hint)}</small>` : ''}
      </div>
      <label class="switch">
        <input type="checkbox" role="switch" data-setting="${esc(name)}" ${checked ? 'checked' : ''} aria-label="${esc(label)}">
        <span class="switch__track" aria-hidden="true"></span>
      </label>
    </div>`;
  }

  function settingsMarkup() {
    const s = state.settings || {};
    const p = state.profile || {};
    const lines = arr => (Array.isArray(arr) ? arr : []).map(item => typeof item === 'string' ? item : [item.label || item.title || item.name, item.period || item.date, item.text || item.value || item.issuer].filter(Boolean).join(' | ')).join('\n');
    return `
      <div class="mag-settings-grid">
        <section class="mag-settings-card">
          <h3>تنظیمات انتشار</h3>
          ${toggleHtml('magazine.auto_fetch', s['magazine.auto_fetch'] === '1', 'به‌روزرسانی خودکار اخبار', 'موتور دریافت منابع فعال است؛ مطالب کشف‌شده فقط به‌صورت پیش‌نویس می‌سازند و انتشار فقط با تأیید شما انجام می‌شود.')}
          <label class="field-label">بازهٔ بررسی خودکار
            <select class="field" data-setting="magazine.fetch_interval">
              <option value="6" ${s['magazine.fetch_interval'] === '6' ? 'selected' : ''}>هر ۶ ساعت</option>
              <option value="12" ${s['magazine.fetch_interval'] !== '6' && s['magazine.fetch_interval'] !== '24' ? 'selected' : ''}>هر ۱۲ ساعت</option>
              <option value="24" ${s['magazine.fetch_interval'] === '24' ? 'selected' : ''}>روزانه</option>
            </select>
          </label>
          ${toggleHtml('magazine.auto_publish', s['magazine.auto_publish'] === '1', 'انتشار خودکار', 'پیشنهاد: خاموش بماند — هر انتشار باید بازبینی انسانی داشته باشد.')}
          <h4>فعال بودن دسته‌ها در سایت عمومی</h4>
          ${['bodybuilding', 'sports-science', 'nutrition', 'health', 'sports-news'].map(slug => {
            const name = ({ 'bodybuilding': 'اخبار بدنسازی', 'sports-science': 'علم ورزش', 'nutrition': 'تغذیه', 'health': 'سلامت', 'sports-news': 'اخبار ورزشی' })[slug];
            return toggleHtml(`magazine.category_enabled.${slug}`, s[`magazine.category_enabled.${slug}`] !== '0', name);
          }).join('')}
          <div class="mag-settings-actions"><button type="button" class="primary" id="magSaveSettings">ذخیره تنظیمات انتشار</button></div>
        </section>

        <section class="mag-settings-card">
          <h3>اطلاعات تماس (سایت عمومی)</h3>
          <p class="mag-toolbar__note">تا زمانی که خالی باشد، صفحه تماس فقط راه‌های ثبت‌نام/ورود را نشان می‌دهد.</p>
          <div class="form-grid">
            <label class="field-label">تلیگرام (آیدی)<input class="field" dir="ltr" data-setting="site.contact_telegram" value="${esc(s['site.contact_telegram'] || '')}"></label>
            <label class="field-label">ربات تلگرام (نام کاربری ربات، بدون @)<input class="field" dir="ltr" data-setting="site.telegram_bot_username" value="${esc(s['site.telegram_bot_username'] || '')}"></label>
            <label class="field-label">اینستاگرام (آیدی)<input class="field" dir="ltr" data-setting="site.contact_instagram" value="${esc(s['site.contact_instagram'] || '')}"></label>
            <label class="field-label">فیسبوک (لینک)<input class="field" dir="ltr" data-setting="site.contact_facebook" value="${esc(s['site.contact_facebook'] || '')}"></label>
            <label class="field-label">ایمیل<input class="field" dir="ltr" data-setting="site.contact_email" value="${esc(s['site.contact_email'] || '')}"></label>
            <label class="field-label field-label--full">متن یادداشت تماس<textarea class="field" rows="2" data-setting="site.contact_note">${esc(s['site.contact_note'] || '')}</textarea></label>
          </div>
          <div class="mag-settings-actions"><button type="button" class="primary" id="magSaveContact">ذخیره اطلاعات تماس</button></div>
        </section>

        <section class="mag-settings-card">
          <h3>تصاویر سایت</h3>
          <div class="form-grid">
            <label class="field-label">تصویر هیرو (پشتیبان: تصویر فعلی برند)<input class="field" dir="ltr" data-setting="site.hero_image" value="${esc(s['site.hero_image'] || '')}"></label>
            <label class="field-label">تصویر درباره من<input class="field" dir="ltr" data-setting="site.about_image" value="${esc(s['site.about_image'] || '')}"></label>
            <label class="field-label">تصویر CTA پایانی (پای صفحه اصلی)<input class="field" dir="ltr" data-setting="site.cta_image" value="${esc(s['site.cta_image'] || '')}"></label>
            <label class="field-label">تصویر شبکه‌های اجتماعی (OG)<input class="field" dir="ltr" data-setting="site.og_image" value="${esc(s['site.og_image'] || '')}"></label>
          </div>
          <div class="mag-settings-actions"><button type="button" class="primary" id="magSaveImages">ذخیره تصاویر</button></div>
        </section>

        <section class="mag-settings-card">
          <h3>پروفایل مربی (صفحه «درباره من»)</h3>
          <p class="mag-toolbar__note">فقط اطلاعات واقعی را درج کنید. بخش‌های خالی، در سایت به‌صورت «در انتظار تکمیل» نمایش داده می‌شوند.</p>
          <div class="form-grid">
            <label class="field-label">نام نمایشی<input class="field" name="p_display_name" value="${esc(p.display_name || '')}"></label>
            <label class="field-label">عنوان شغلی<input class="field" name="p_title" value="${esc(p.title || '')}"></label>
            <label class="field-label field-label--full">جمله برجسته (highlight)<input class="field" name="p_highlight" value="${esc(p.highlight || '')}"></label>
            <label class="field-label">تصویر (مسیر)<input class="field" dir="ltr" name="p_photo" placeholder="/images/…" value="${esc(p.photo || '')}"></label>
            <label class="field-label field-label--full">بیوگرافی<textarea class="field" rows="4" name="p_bio">${esc(p.bio || '')}</textarea></label>
            <label class="field-label field-label--full">فلسفه مربیگری<textarea class="field" rows="3" name="p_philosophy">${esc(p.philosophy || '')}</textarea></label>
            <label class="field-label field-label--full">روش کار<textarea class="field" rows="3" name="p_methodology">${esc(p.methodology || '')}</textarea></label>
            <label class="field-label field-label--full">حوزه‌های تخصص (هر خط یکی)<textarea class="field" rows="4" name="p_specialties">${esc(lines(p.specialties))}</textarea></label>
            <label class="field-label field-label--full">گواهی‌نامه‌ها (هر خط: نام | صادرکننده)<textarea class="field" rows="4" name="p_certifications">${esc(lines(p.certifications))}</textarea></label>
            <label class="field-label field-label--full">سابقه (هر خط: دوره | عنوان | توضیح)<textarea class="field" rows="4" name="p_timeline">${esc(lines(p.timeline))}</textarea></label>
            <label class="field-label field-label--full">آمار کوتاه (هر خط: برچسب | مقدار)<textarea class="field" rows="3" name="p_stats">${esc(lines(p.stats))}</textarea></label>
          </div>
          <div class="mag-settings-actions"><button type="button" class="primary" id="magSaveProfile">ذخیره پروفایل مربی</button></div>
        </section>
      </div>`;
  }

  function bindSettings() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    const saveGroup = async (button, keys) => {
      const body = {};
      keys.forEach(key => {
        const el = pane.querySelector(`[data-setting="${key}"]`);
        if (!el) return;
        body[key] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      });
      try {
        button.disabled = true;
        await api('/api/magazine/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
        toast('تنظیمات ذخیره شد');
        state.settings = { ...state.settings, ...body };
        button.disabled = false;
      } catch (error) { toast(error.message, true); button.disabled = false; }
    };
    const autoKeys = ['magazine.auto_fetch', 'magazine.fetch_interval', 'magazine.auto_publish',
      'magazine.category_enabled.bodybuilding', 'magazine.category_enabled.sports-science',
      'magazine.category_enabled.nutrition', 'magazine.category_enabled.health', 'magazine.category_enabled.sports-news'];
    const contactKeys = ['site.contact_telegram', 'site.telegram_bot_username', 'site.contact_instagram', 'site.contact_facebook', 'site.contact_email', 'site.contact_note'];
    const imageKeys = ['site.hero_image', 'site.about_image', 'site.cta_image', 'site.og_image'];
    pane.querySelector('#magSaveSettings')?.addEventListener('click', event => saveGroup(event.currentTarget, autoKeys));
    pane.querySelector('#magSaveContact')?.addEventListener('click', event => saveGroup(event.currentTarget, contactKeys));
    pane.querySelector('#magSaveImages')?.addEventListener('click', event => saveGroup(event.currentTarget, imageKeys));

    pane.querySelector('#magSaveProfile')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const parseLines = (text, mode) => String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
        const parts = line.split('|').map(x => x.trim());
        if (mode === 'kv') return { label: parts[0] || '', value: parts[1] || '' };
        if (mode === 'certs') return { name: parts[0] || '', issuer: parts.slice(1).join(' | ') };
        if (mode === 'timeline') return { period: parts[0] || '', title: parts[1] || '', text: parts.slice(2).join(' | ') };
        return line;
      });
      const body = {
        display_name: pane.querySelector('[name="p_display_name"]').value,
        title: pane.querySelector('[name="p_title"]').value,
        highlight: pane.querySelector('[name="p_highlight"]').value,
        photo: pane.querySelector('[name="p_photo"]').value,
        bio: pane.querySelector('[name="p_bio"]').value,
        philosophy: pane.querySelector('[name="p_philosophy"]').value,
        methodology: pane.querySelector('[name="p_methodology"]').value,
        specialties: parseLines(pane.querySelector('[name="p_specialties"]').value, 'line'),
        certifications: parseLines(pane.querySelector('[name="p_certifications"]').value, 'certs'),
        timeline: parseLines(pane.querySelector('[name="p_timeline"]').value, 'timeline'),
        stats: parseLines(pane.querySelector('[name="p_stats"]').value, 'kv')
      };
      try {
        button.disabled = true;
        await api('/api/magazine/admin/coach-profile', { method: 'PUT', body: JSON.stringify(body) });
        toast('پروفایل مربی ذخیره شد');
        state.profile = body;
        button.disabled = false;
      } catch (error) { toast(error.message, true); button.disabled = false; }
    });
  }


  // ---------- Editorial queue (discovered drafts) ----------
  const REJECT_REASONS = ['منبع نامعتبر', 'خبر تکراری', 'محتوای ضعیف', 'نیاز به بررسی بیشتر', 'خارج از حوزه', 'اطلاعات کافی نیست'];
  const CATEGORY_EMOJI = { bodybuilding: '🏋️', 'sports-science': '🔬', nutrition: '🥗', health: '❤️', 'sports-news': '📰' };

  function faDateTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return String(iso).slice(0, 16); }
  }

  // rev11 simple card: Persian title / image / source / date / short summary /
  // [مشاهده] [ویرایش] [✓ انتشار] [رد] — no AI fields, no technical data.
  function newsCard(item) {
    const date = item.source_published_at || item.discovered_at || item.created_at;
    return `
    <article class="mag-news-card" data-id="${item.id}">
      <div class="mag-news-card__media">
        ${item.cover_image ? `<img src="${esc(item.cover_image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="mag-news-card__noimg"><span>تصویر برای این مطلب پیدا نشد</span><button type="button" class="mag-action" data-news-action="image" data-id="${item.id}">انتخاب تصویر</button></div>`}
      </div>
      <h4 class="mag-news-title">${esc(item.title)}</h4>
      <div class="mag-news-meta">${item.source_name ? `منبع: <b>${esc(item.source_name)}</b>` : ''}${item.source_name ? ' · ' : ''}تاریخ: ${faDate(date)}</div>
      ${item.source_url ? `<div class="mag-news-url" dir="ltr" title="${esc(item.source_url)}">${esc(item.source_url)}</div>` : ''}
      ${item.summary ? `<p class="mag-news-summary">${esc(item.summary)}</p>` : ''}
      <div class="mag-news-actions">
        ${item.source_url ? `<a class="mag-action mag-action--view" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">مشاهده</a>` : ''}
        <button type="button" class="mag-action" data-news-action="edit" data-id="${item.id}">ویرایش</button>
        <button type="button" class="mag-action mag-action--publish" data-news-action="publish" data-id="${item.id}">✓ انتشار</button>
        <button type="button" class="mag-action mag-action--reject" data-news-action="reject" data-id="${item.id}">رد</button>
      </div>
    </article>`;
  }

  function newsProgressMarkup() {
    const p = state.progress || {};
    let pct = 4;
    if (p.phase === 'sources') pct = p.sources_total ? Math.round((p.sources_done / p.sources_total) * 55) : 8;
    else if (p.phase === 'draft') pct = 55 + (p.items_total ? Math.round((p.items_done / p.items_total) * 35) : 20);
    else if (p.phase === 'images') pct = 90 + (p.images_total ? Math.round((p.images_done / p.images_total) * 10) : 5);
    else if (p.phase === 'done' || p.phase === 'done_with_errors') pct = 100;
    const phaseText = {
      sources: p.sources_total ? `در حال بررسی منابع روز دنیا… ${faDigits(p.sources_done)} از ${faDigits(p.sources_total)}` : 'در حال آماده‌سازی…',
      draft: p.items_total ? `در حال بررسی مطالب… ${faDigits(p.items_done || 0)} از ${faDigits(p.items_total)}` : 'در حال بررسی مطالب…',
      images: 'در حال به‌روزرسانی تصویرها…',
      done: 'تمام شد',
      done_with_errors: 'تمام شد — برخی منابع در دسترس نبود',
      error: 'خطا در بررسی'
    }[p.phase] || 'در حال بررسی…';
    const errCount = p.error_sources ? p.error_sources.length : 0;
    return `
      <div class="mag-progress" role="status">
        <div class="mag-progress__bar"><div class="mag-progress__fill" style="width:${pct}%"></div></div>
        <div class="mag-progress__status">${phaseText}${p.current_source ? ' — <b>' + esc(p.current_source) + '</b>' : ''}</div>
        <div class="mag-progress__counts">${p.items_found ? faDigits(p.items_found) + ' کاندیدا پیدا شد · ' : ''}${p.filtered ? faDigits(p.filtered) + ' مورد فیلتر شد · ' : ''}${p.drafted ? faDigits(p.drafted) + ' گزارش آماده' : ''}${errCount ? ' · ' + faDigits(errCount) + ' منبع در دسترس نبود' : ''}</div>
      </div>
    `;
  }

  function newsMarkup() {
    const st = state.newsStats || {};
    // rev10: two DIFFERENT numbers, shown separately and explained:
    //  • "آماده بررسی" = existing pending candidates that pass the editorial audit
    //  • "نیازمند پردازش مجدد" = parked drafts (stale / not Persian / AI retry)
    const readyQueue = state.queue.filter(q => !(q.audit_reasons || []).length);
    const reprocessQueue = state.queue.filter(q => (q.audit_reasons || []).length);
    const n = readyQueue.length;
    return `
      <div class="mag-news-head">
        <div class="mag-news-head__info">
          <p class="mag-news-last">آخرین بررسی: <b>${st.last_run_at ? faDateTime(st.last_run_at) : 'هنوز انجام نشده'}</b>${st.last_run ? ' — در این بررسی ' + faDigits(st.last_run.drafted || 0) + ' مطلب جدید پیدا شد' : ''}</p>
          <p class="mag-news-count">${n ? faDigits(n) + ' مطلب برای بررسی آماده است.' : 'مطلبی برای بررسی آماده نیست.'}</p>
          ${reprocessQueue.length ? `<p class="mag-news-count mag-news-reprocess">🔁 ${faDigits(reprocessQueue.length)} مطلب نیازمند پردازش مجدد است (در شمارش «آماده بررسی» نیست — در بررسی بعدی دوباره پردازش می‌شود).</p>` : ''}
        </div>
        <div class="mag-toolbar__actions">
          <button type="button" class="primary mag-news-run" id="magRunDiscover"${state.discoverRunning ? ' disabled' : ''}>${state.discoverRunning ? 'در حال بررسی…' : '🔍 بررسی مطالب جدید'}</button>          ${state.canSearchMore && !state.discoverRunning ? `<button type="button" class="secondary mag-news-run" id="magSearchMore">جستجو بیشتر (${faDigits(20)} مورد دیگر)</button>` : ''}

        </div>
      </div>
      ${state.canSearchMore && !state.discoverRunning ? `<p class="mag-toolbar__note mag-news-more-note">این بررسی ${faDigits(state.lastDrafted || 0)} مطلب جدید آماده کرد؛ برای بررسیٔ موارد بعدی «جستجو بیشتر» را بزنید.</p>` : ''}
      ${state.discoverRunning ? newsProgressMarkup() : ''}
      ${readyQueue.length ? `<div class="mag-news-grid">${readyQueue.map(newsCard).join('')}</div>` : reprocessQueue.length ? '' : '<div class="empty-state-sm">برای شروع، دکمهٔ «بررسی مطالب جدید» را بزنید — سیستم از منابع معتبر روز دنیا جستجو می‌کند، فارسی می‌کند و گزارش آماده می‌سازد.</div>'}
      ${reprocessQueue.length ? `<details class="mag-news-reprocess-list" open><summary>🔁 جزئیات ${faDigits(reprocessQueue.length)} مطلب نیازمند پردازش مجدد</summary>${reprocessQueue.map(q => `<div class="mag-news-reprocess-item"><span dir="auto">${esc(q.title || '—')}</span><small>${(q.audit_reasons || []).join('؛ ')}${q.ai_meta && q.ai_meta.reprocess_count ? ' · تلاش خودکار ' + faDigits(q.ai_meta.reprocess_count) + ' از ' + faDigits(3) : ''}</small><button type="button" class="mag-action" data-news-action="reprocess" data-id="${q.id}">🔄 پردازش مجدد</button><button type="button" class="mag-action mag-action--reject" data-news-action="reject" data-id="${q.id}">رد</button></div>`).join('')}</details>` : ''}
    `;
  }

  function imageModal(id, current) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal modal--sm">
        <div class="modal-head"><h2>تصویر مطلب</h2><button type="button" class="close" data-close-modal aria-label="بستن">×</button></div>
        <div class="modal-body">
          <p class="mag-toolbar__note">مسیر یا آدرس تصویر را وارد کنید (تصویر خود منبع یا تصویری که خودتان بارگذاری کرده‌اید). از تصاویر تصادفی استفاده نمی‌شود.</p>
          <label class="field-label">تصویر<input class="field" id="imgUrl" dir="ltr" value="${esc(current || '')}"></label>
          <div id="imgPreview" class="mag-news-preview"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary" data-close-modal>بستن</button>
          <button type="button" class="primary" id="imgSave">ذخیره تصویر</button>
        </div>
      </div>`;
    document.body.append(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', close));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    const input = backdrop.querySelector('#imgUrl');
    const prev = backdrop.querySelector('#imgPreview');
    const upd = () => {
      prev.innerHTML = '';
      if (!input.value) return;
      const img = document.createElement('img');
      img.src = input.value;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { prev.innerHTML = ''; const p = document.createElement('p'); p.className = 'mag-toolbar__note'; p.textContent = 'پیش‌نمایش در دسترس نیست.'; prev.append(p); });
      prev.append(img);
    };
    input.addEventListener('input', upd);
    upd();
    backdrop.querySelector('#imgSave').addEventListener('click', async () => {
      try {
        await api(`/api/magazine/admin/articles/${id}`, { method: 'PUT', body: JSON.stringify({ cover_image: input.value || '' }) });
        toast('تصویر ذخیره شد');
        close();
        renderPane();
      } catch (e) { toast(e.message, true); }
    });
  }

  function bindNews() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    const runDiscoverFlow = async (isMore) => {
      state.discoverRunning = true;
      state.progress = { running: true, phase: 'sources' };
      renderPane();
      let stopped = false;
      // Update only the progress panel in place — the cards/pane are NOT
      // re-rendered on every tick (no page flicker or scroll jumps).
      const applyPanel = () => {
        const paneEl = document.getElementById('magazinePane');
        if (!paneEl) return;
        let host = paneEl.querySelector('.mag-progress-host');
        if (!host) {
          const head = paneEl.querySelector('.mag-news-head');
          if (!head) return;
          host = document.createElement('div');
          host.className = 'mag-progress-host';
          head.insertAdjacentElement('afterend', host);
        }
        host.innerHTML = newsProgressMarkup();
      };
      applyPanel();
      const timer = setInterval(async () => {
        if (stopped) return;
        try {
          const p = await api('/api/magazine/admin/discover/progress');
          state.progress = p;
          if (!p.running && (p.phase === 'done' || p.phase === 'done_with_errors' || p.phase === 'error')) { stopped = true; clearInterval(timer); }
          if (state.discoverRunning) applyPanel();
        } catch (e) { /* keep the last known state */ }
      }, 1500);
      try {
        const result = await api('/api/magazine/admin/discover', { method: 'POST', body: '{}' });
        state.canSearchMore = Boolean(result.stopped_at_cap);
        state.lastDrafted = Number(result.drafted) || 0;
        const parts = [];
        // rev10 wording: "پیدا شد" = this scan's NEW finds; "آماده است" = the
        // existing pending review queue. The two numbers may differ on purpose.
        if (result.drafted) parts.push(`📰 در این بررسی ${faDigits(result.drafted)} ${isMore ? 'مطلب جدید فارسی دیگر پیدا شد' : 'مطلب جدید فارسی پیدا شد'}.`);
        else parts.push('در این بررسی مطلب جدیدی پیدا نشد — همهٔ منابع بررسی شد.');
        if (typeof result.ready_review === 'number') parts.push(faDigits(result.ready_review) + ' مطلب برای بررسی آماده است.');
        if (result.filtered) parts.push(`${faDigits(result.filtered)} مطلب به‌خاطر تازگی/کیفیت منبع مطابق نبود و حذف شد.`);
        if (result.not_prepared) parts.push(`توجه: ${faDigits(result.not_prepared)} مطلب «نیازمند پردازش مجدد» است (منبع اصلی حل نشد — در بررسی بعدی دوباره امتحان می‌شود).`);
        let msg = parts.join(' ');
        if (result.stopped_at_cap) msg += ' برای ادامهٔ بررسی «جستجو بیشتر» را بزنید.';
        else if (result.errors && result.errors.length) msg += ` (توجه: ${faDigits(result.errors.length)} منبع در این باره در دسترس نبود — دفعهٔ بعد دوباره امتحان می‌کنیم).`;
        toast(msg, Boolean(result.stopped_at_cap || result.not_prepared));
      } catch (error) {
        toast('بررسی خطا کرد: ' + error.message, true);
      } finally {
        stopped = true;
        clearInterval(timer);
        state.discoverRunning = false;
        await renderPane();
      }
    };
    const discoverBtn = pane.querySelector('#magRunDiscover');
    if (discoverBtn) discoverBtn.addEventListener('click', () => runDiscoverFlow(false));
    const moreBtn = pane.querySelector('#magSearchMore');
    if (moreBtn) moreBtn.addEventListener('click', () => runDiscoverFlow(true));
    pane.querySelectorAll('[data-news-action]').forEach(btn => {
      const id = Number(btn.dataset.id);
      const action = btn.dataset.newsAction;
      btn.addEventListener('click', async () => { await newsCardAction(id, action); });
    });
    // Broken/unreachable source images: replace with the clean placeholder + picker
    pane.querySelectorAll('.mag-news-card__media img').forEach(img => {
      img.addEventListener('error', () => {
        const card = img.closest('.mag-news-card');
        if (!card) return;
        const media = card.querySelector('.mag-news-card__media');
        if (!media) return;
        const cid = Number(card.dataset.id);
        media.innerHTML = '<div class="mag-news-card__noimg"><span>🖼️ تصویر بارگذاری نشد</span><button type="button" class="mag-action" data-fallback-image>انتخاب تصویر</button></div>';
        const fb = media.querySelector('[data-fallback-image]');
        if (fb) fb.addEventListener('click', () => {
          const item = state.queue.find(x => x.id === cid);
          imageModal(cid, item ? item.cover_image : '');
        });
      });
    });
    pane.querySelectorAll('[data-news-action]').forEach(btn => {
      const id2 = Number(btn.dataset.id);
      const action2 = btn.dataset.newsAction;
      btn.addEventListener('click', async () => { await newsCardAction(id2, action2); });
    });
  }
  async function newsCardAction(id, action) {
    try {
      if (action === 'review') {
        state.reviewId = id;
        await renderPane();
      } else if (action === 'edit') {
        const article = await api(`/api/magazine/admin/articles/${id}`);
        state.articles = state.articles.filter(x => x.id !== article.id);
        state.articles.unshift(article);
        articleModal(id);
      } else if (action === 'image') {
        const item = state.queue.find(x => x.id === id);
        imageModal(id, item ? item.cover_image : '');
      } else if (action === 'publish') {
        if (!window.confirm('این مطلب نهایی است و در سایت عمومی منتشر می‌شود. ادامه می‌دهید؟')) return;
        await api(`/api/magazine/admin/articles/${id}/publish`, { method: 'POST', body: '{}' });
        toast('مطلب منتشر شد');
        await renderPane();
      } else if (action === 'reject') {
        const reason = window.prompt('دلیل رد (اختیاری):', REJECT_REASONS[0]);
        if (reason === null) return;
        await api(`/api/magazine/admin/articles/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || null }) });
        toast('مطلب رد شد');
        await renderPane();
      } else if (action === 'reprocess') {
        toast('در حال پردازش مجدد… (منبع اصلی حل و گزارش فارسی دوباره ساخته می‌شود)');
        const out = await api(`/api/magazine/admin/queue/${id}/reprocess`, { method: 'POST', body: '{}' });
        if (out.reprocessed) toast('✅ مطلب با عنوان و منبع فارسی/اصلی به‌روز شد و به صف «آماده بررسی» برگشت.');
        else if (out.not_prepared) toast('پردازش هنوز کامل نشد: ' + (out.ai_failed || 'هوش مصنوعی در دسترس نبود') + ' — در بررسی بعد دوباره امتحان می‌شود.', true);
        else toast('مطلب به صف بررسی نرفت: ' + (out.ai_failed || 'دلیل در گزارش فنی'), true);
        await renderPane();
      }
    } catch (error) {
      toast(error.message, true);
    }
  }

  function reviewMarkup() {
    const r = state.review || {};
    const a = r.article || {};
    const d = r.discovery || {};
    const flags = r.quality_flags || [];
    const ai = r.ai_meta || {};
    const catOptions = (state.categories || []).filter(c => !c.deleted_at);
    return `
      <div class="mag-review">
        <div class="mag-review__main">
          <h3>ویرایش مطلب</h3>
          <div class="form-grid">
            <label class="field-label">عنوان *<input class="field" id="revTitle" required maxlength="200" value="${esc(a.title || '')}"></label>
            <label class="field-label">دسته‌بندی
              <select class="field" id="revCategory">
                <option value="">— بدون دسته —</option>
                ${catOptions.map(c => `<option value="${esc(c.slug)}" ${a.category_slug === c.slug ? 'selected' : ''}>${esc(c.name_fa)}</option>`).join('')}
              </select>
            </label>
            <label class="field-label field-label--full">خلاصه (SEO)<textarea class="field" id="revSummary" rows="2" maxlength="500">${esc(a.summary || '')}</textarea></label>
            <label class="field-label">تصویر کاور (مسیر)<input class="field" id="revCover" dir="ltr" placeholder="/images/…" value="${esc(a.cover_image || '')}"></label>
            <div id="revCoverPreview" class="mag-review__coverpreview"></div>
            <label class="field-label field-label--full">متن مقاله (HTML ساده)<textarea class="field" id="revContent" rows="12" dir="auto">${esc(a.content || '')}</textarea></label>
          </div>
          <div class="mag-sources-editor" style="margin-top:14px">
            <div class="mag-sources-editor__head"><h4>منابع و ارجاع‌ها (عمومی)</h4><button type="button" class="secondary btn-small" id="revAddRef">＋ افزودن منبع</button></div>
            <div id="revRefsList"></div>
          </div>
        </div>
        <aside class="mag-review__side">
          <h3>منبع اصلی (فقط برای شما)</h3>
          <dl class="mag-review__meta">
            <dt>منبع</dt><dd>${esc(d.source_name || a.source_name || '—')}</dd>
            <dt>آدرس اصلی</dt><dd>${a.source_url ? `<a href="${esc(a.source_url)}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(a.source_url)}</a>` : '—'}</dd>
            <dt>عنوان اصلی</dt><dd>${esc(d.original_title || '—')}</dd>
            <dt>تاریخ انتشار منبع</dt><dd>${faDate(d.source_published_at)}</dd>
            <dt>تاریخ کشف</dt><dd>${faDate(d.discovered_at)}</dd>
          </dl>
          ${flags.length ? `<div class="mag-review__flags"><b>نیاز به بررسی:</b><ul>${flags.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
          ${d.duplicate ? '<div class="mag-review__flags mag-review__flags--dup">هشدار: این مطلب ممکن است تکراری باشد.</div>' : ''}
          <p class="mag-toolbar__note">وضعیت فعلی: ${statusBadge(a.status)}</p>
        </aside>
      </div>
      <div class="mag-settings-actions mag-review__actions">
        <button type="button" class="secondary" id="revBack">بازگشت به فهرست</button>
        <button type="button" class="primary" id="revSave">ذخیره پیش‌نویس</button>
        <button type="button" class="primary" id="revPublish">تأیید و انتشار</button>
        <select class="field" id="revRejectReason" aria-label="دلیل رد">${REJECT_REASONS.map(reason => `<option value="${esc(reason)}">${esc(reason)}</option>`).join('')}</select>
        <input class="field" id="revRejectNote" placeholder="توضیح اختیاری…" maxlength="200">
        <button type="button" class="secondary mag-action--reject" id="revReject">رد</button>
      </div>`;
  }

  function renderRefsList() {
    const list = document.getElementById('revRefsList');
    if (!list) return;
    const refs = state.review?.references || [];
    list.innerHTML = refs.length ? refs.map((s, i) => `
      <div class="mag-source-row">
        <input class="field" data-ref-index="${i}" data-ref-field="name" placeholder="نام منبع" value="${esc(s.source_name || '')}">
        <input class="field" data-ref-index="${i}" data-ref-field="url" dir="ltr" placeholder="https://…" value="${esc(s.source_url || '')}">
        <button type="button" class="mag-action mag-action--danger" data-ref-remove="${i}">حذف</button>
      </div>`).join('') : '<p class="mag-sources-empty">منبعی ثبت نشده است.</p>';
    list.querySelectorAll('[data-ref-remove]').forEach(btn => btn.addEventListener('click', () => {
      const refs = state.review.references;
      refs.splice(Number(btn.dataset.refRemove), 1);
      renderRefsList();
    }));
    list.querySelectorAll('[data-ref-field]').forEach(input => input.addEventListener('input', () => {
      const refs = state.review.references;
      const ref = refs[Number(input.dataset.refIndex)];
      if (input.dataset.refField === 'name') ref.source_name = input.value;
      else ref.source_url = input.value;
    }));
  }

  async function saveReviewDraft() {
    const id = state.reviewId;
    const a = state.review?.article || {};
    const body = {
      title: document.getElementById('revTitle')?.value || '',
      summary: document.getElementById('revSummary')?.value || '',
      content: document.getElementById('revContent')?.value || '',
      category: document.getElementById('revCategory')?.value || null,
      cover_image: document.getElementById('revCover')?.value || '',
      source_name: a.source_name || null,
      source_url: a.source_url || '',
      sources: (state.review?.references || []).map(s => ({ name: s.source_name, url: s.source_url })).filter(s => s.name || s.url)
    };
    await api(`/api/magazine/admin/articles/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  function bindReview() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    renderRefsList();
    const id = state.reviewId;
    pane.querySelector('#revBack')?.addEventListener('click', () => { state.reviewId = null; renderPane(); });
    const revCover = pane.querySelector('#revCover');
    const revPrev = pane.querySelector('#revCoverPreview');
    if (revCover && revPrev) {
      const updCover = () => {
        revPrev.innerHTML = '';
        if (!revCover.value) return;
        const img = document.createElement('img');
        img.src = revCover.value;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          revPrev.innerHTML = '';
          const p = document.createElement('p');
          p.className = 'mag-toolbar__note';
          p.textContent = 'پیش‌نمایش تصویر در دسترس نیست.';
          revPrev.append(p);
        });
        revPrev.append(img);
      };
      revCover.addEventListener('input', updCover);
      updCover();
    }
    pane.querySelector('#revAddRef')?.addEventListener('click', () => {
      state.review.references.push({ source_name: '', source_url: '' });
      renderRefsList();
    });
    pane.querySelector('#revSave')?.addEventListener('click', async event => {
      const btn = event.currentTarget;
      try {
        btn.disabled = true;
        await saveReviewDraft();
        toast('تغییرات ذخیره شد');
        const updated = await api(`/api/magazine/admin/queue/${id}`);
        state.review = updated;
        renderRefsList();
      } catch (error) { toast(error.message, true); }
      btn.disabled = false;
    });
    pane.querySelector('#revPublish')?.addEventListener('click', async event => {
      const btn = event.currentTarget;
      if (!window.confirm('این مطلب نهایی است و در سایت عمومی منتشر می‌شود. ادامه می‌دهید؟')) return;
      try {
        btn.disabled = true;
        await saveReviewDraft();
        await api(`/api/magazine/admin/articles/${id}/publish`, { method: 'POST', body: '{}' });
        toast('مطلب تأیید و منتشر شد');
        state.reviewId = null;
        await renderPane();
      } catch (error) { toast(error.message, true); btn.disabled = false; }
    });
    pane.querySelector('#revReject')?.addEventListener('click', async event => {
      const btn = event.currentTarget;
      const reason = [pane.querySelector('#revRejectReason')?.value, pane.querySelector('#revRejectNote')?.value.trim()].filter(Boolean).join(' — ');
      try {
        btn.disabled = true;
        await api(`/api/magazine/admin/articles/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || null }) });
        toast('مطلب رد شد');
        state.reviewId = null;
        await renderPane();
      } catch (error) { toast(error.message, true); btn.disabled = false; }
    });
  }

  // ---------- News sources ----------
  function sourcesMarkup() {
    const editing = state.editingSource;
    const catOptions = (state.categories || []).filter(c => !c.deleted_at);
    const s = editing && editing !== 'new' ? state.sources.find(x => x.id === editing) : null;
    return `
      ${editing ? `
      <div class="mag-settings-card" style="margin-bottom:16px">
        <h3>${s ? 'ویرایش منبع' : 'افزودن منبع خبری'}</h3>
        <div class="form-grid">
          <label class="field-label">نام منبع *<input class="field" id="srcName" maxlength="120" value="${esc(s?.name || '')}"></label>
          <label class="field-label">آدرس فید *<input class="field" id="srcUrl" dir="ltr" maxlength="500" placeholder="https://example.com/feed.xml" value="${esc(s?.feed_url || '')}"></label>
          <label class="field-label">نوع فید
            <select class="field" id="srcType">
              ${[['rss', 'RSS'], ['atom', 'Atom'], ['api', 'API عمومی']].map(([v, l]) => `<option value="${v}" ${(s?.source_type || 'rss') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          <label class="field-label">دسته پیش‌فرض
            <select class="field" id="srcCategory">
              <option value="">— بدون دسته —</option>
              ${catOptions.map(c => `<option value="${esc(c.slug)}" ${s?.category_slug === c.slug ? 'selected' : ''}>${esc(c.name_fa)}</option>`).join('')}
            </select>
          </label>
          <label class="field-label">بازهٔ دریافت
            <select class="field" id="srcInterval">
              ${[['6', 'هر ۶ ساعت'], ['12', 'هر ۱۲ ساعت'], ['24', 'روزانه']].map(([v, l]) => `<option value="${v}" ${String(s?.fetch_interval_h || '12') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          <label class="check-label">فعال<input type="checkbox" id="srcActive" ${(!s || s.is_active) ? 'checked' : ''}></label>
        </div>
        <div class="mag-settings-actions">
          <button type="button" class="primary" id="srcSave">${s ? 'ذخیره منبع' : 'افزودن منبع'}</button>
          <button type="button" class="secondary" id="srcCancel">انصراف</button>
        </div>
      </div>` : `
      <div class="mag-toolbar">
        <p class="mag-toolbar__note">منابع پیش‌فرض روز دنیا (PubMed + رسانه‌های علمی/ورزشی) از قبل فعال هستند — نیازی به افزودن منبع نیست. این تب فقط برای تغییرات پیشرفته است (غیرفعال‌کردن/افزودن/تغییر بازه). کشف فقط پیش‌نویس می‌سازد؛ انتشار همیشه دستی و از طرف شماست.</p>
        <div class="mag-toolbar__actions"><button type="button" class="primary" id="srcAddNew">＋ افزودن منبع</button></div>
      </div>`}
      <div class="table-wrap">
        <table class="mag-table">
          <thead><tr><th>منبع</th><th>فید</th><th>نوع</th><th>دسته</th><th>وضعیت</th><th>آخرین دریافت</th><th>عملیات</th></tr></thead>
          <tbody>
            ${state.sources.length ? state.sources.map(x => `
              <tr data-id="${x.id}">
                <td><b>${esc(x.name)}</b></td>
                <td class="mag-slug" dir="ltr" title="${esc(x.feed_url)}">${esc((x.feed_url || '').slice(0, 42))}${(x.feed_url || '').length > 42 ? '…' : ''}</td>
                <td>${esc(x.source_type)}</td>
                <td>${esc(x.category_name || '—')}</td>
                <td>${x.is_active ? '<span class="mag-badge mag-badge--published">فعال</span>' : '<span class="mag-badge mag-badge--draft">غیرفعال</span>'}${x.last_error ? ` <span class="mag-badge mag-badge--flag" title="${esc(x.last_error)}">خطا</span>` : ''}</td>
                <td>${x.last_success_at ? faDate(x.last_success_at) : '—'}</td>
                <td>
                  <div class="mag-actions">
                    <button type="button" class="mag-action" data-src-action="edit" data-id="${x.id}">ویرایش</button>
                    <button type="button" class="mag-action" data-src-action="test" data-id="${x.id}">تست منبع</button>
                    <button type="button" class="mag-action" data-src-action="toggle" data-id="${x.id}">${x.is_active ? 'غیرفعال‌کردن' : 'فعال‌کردن'}</button>
                    <button type="button" class="mag-action mag-action--danger" data-src-action="delete" data-id="${x.id}">حذف</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="7" class="empty">هنوز منبع خبری ثبت نشده است.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function bindSources() {
    const pane = document.getElementById('magazinePane');
    if (!pane) return;
    pane.querySelector('#srcAddNew')?.addEventListener('click', () => { state.editingSource = 'new'; renderPane(); });
    pane.querySelector('#srcCancel')?.addEventListener('click', () => { state.editingSource = null; renderPane(); });
    pane.querySelector('#srcSave')?.addEventListener('click', async event => {
      const btn = event.currentTarget;
      const body = {
        name: document.getElementById('srcName')?.value || '',
        feed_url: document.getElementById('srcUrl')?.value || '',
        source_type: document.getElementById('srcType')?.value || 'rss',
        category_slug: document.getElementById('srcCategory')?.value || null,
        fetch_interval_h: Number(document.getElementById('srcInterval')?.value || 12),
        is_active: document.getElementById('srcActive') ? document.getElementById('srcActive').checked : true
      };
      try {
        btn.disabled = true;
        if (state.editingSource === 'new') await api('/api/magazine/admin/sources', { method: 'POST', body: JSON.stringify(body) });
        else await api(`/api/magazine/admin/sources/${state.editingSource}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('منبع ذخیره شد');
        state.editingSource = null;
        await renderPane();
      } catch (error) { toast(error.message, true); btn.disabled = false; }
    });
    pane.querySelectorAll('[data-src-action]').forEach(btn => {
      const id = Number(btn.dataset.id);
      btn.addEventListener('click', async () => {
        const action = btn.dataset.srcAction;
        try {
          if (action === 'edit') { state.editingSource = id; renderPane(); }
          else if (action === 'toggle') {
            const source = state.sources.find(x => x.id === id);
            await api(`/api/magazine/admin/sources/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: !source.is_active }) });
            await renderPane();
          } else if (action === 'test') {
            btn.disabled = true;
            const data = await api(`/api/magazine/admin/sources/${id}/test`, { method: 'POST', body: '{}' });
            toast(data.ok ? `فید معتبر است: ${faDigits(data.item_count)} خبر` : `فید خطا دارد: ${data.error || 'نامشخص'}`, !data.ok);
            btn.disabled = false;
            await renderPane();
          } else if (action === 'delete') {
            if (!window.confirm('این منبع حذف شود؟ (مطالب قبلی باقی می‌مانند)')) return;
            await api(`/api/magazine/admin/sources/${id}`, { method: 'DELETE' });
            toast('منبع حذف شد');
            await renderPane();
          }
        } catch (error) { toast(error.message, true); }
      });
    });
  }


  window.renderMagazineAdmin = renderMagazineAdmin;
})();
