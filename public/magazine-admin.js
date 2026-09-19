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
    profile: null
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
            <p class="magazine-admin__sub">مدیریت محتوای سایت عمومی YASNAFIT: مقالات، نتایج، دسته‌بندی‌ها و تنظیمات انتشار</p>
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
          ${toggleHtml('magazine.auto_fetch', s['magazine.auto_fetch'] === '1', 'به‌روزرسانی خودکار اخبار', 'در انتظار پیاده‌سازی موتور دریافت منابع؛ فعلاً محتوای دستی/پیش‌نویسی.')}
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
    const autoKeys = ['magazine.auto_fetch', 'magazine.auto_publish',
      'magazine.category_enabled.bodybuilding', 'magazine.category_enabled.sports-science',
      'magazine.category_enabled.nutrition', 'magazine.category_enabled.health', 'magazine.category_enabled.sports-news'];
    const contactKeys = ['site.contact_telegram', 'site.contact_instagram', 'site.contact_facebook', 'site.contact_email', 'site.contact_note'];
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

  window.renderMagazineAdmin = renderMagazineAdmin;
})();
