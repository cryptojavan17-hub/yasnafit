/* YasnaFit — انتخابگر تاریخ شمسی (Jalali Date Picker)
   وابسته به: jalali.js (هسته تبدیل) — بدون وابستگی خارجی
   اتصال خودکار به همه input[data-jalali] (کلیک/فوکوس → باز شدن تقویم)
   نمای‌ها: روزها ← ماه‌ها ← سال‌ها (پرش سریع سال)
*/
(function () {
  'use strict';
  const J = () => window.YasnaJalali;
  const fa = n => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const weekdays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  const state = { input: null, view: 'days', jy: null, jm: null, picker: null, yearBase: null };

  function todayJalali() {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return J().isoToJalali(iso);
  }
  function weekdayCol(iso) { // شنبه=0 … جمعه=6
    const d = new Date(`${iso}T00:00:00`);
    return (d.getDay() + 1) % 7;
  }
  function dayGridMeta(jy, jm) {
    const iso = J().jalaliStrToIso(`${jy}/${jm}/1`);
    return { lead: weekdayCol(iso), len: J().monthLength(jy, jm) };
  }
  const clampYear = jy => Math.min(1499, Math.max(1201, jy));

  function ensurePicker() {
    if (state.picker) return state.picker;
    const el = document.createElement('div');
    el.className = 'jdp';
    el.setAttribute('dir', 'rtl');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'انتخاب تاریخ شمسی');
    el.hidden = true;
    // مدیریت همه کلیک‌ها با delegation روی خود پنل — با stopPropagation تا
    // رندر مجدد (جداشدن دکمه از DOM) باعث «کلیک بیرون» تلقی نشود
    el.addEventListener('click', event => {
      const b = event.target && event.target.closest ? event.target.closest('[data-day],[data-month],[data-year],[data-view],[data-nav],[data-yearnav],[data-yearpage],[data-today],[data-clear]') : null;
      event.stopPropagation();
      if (!b) return;
      if (b.dataset.day !== undefined) return pick(state.jy, state.jm, Number(b.dataset.day));
      if (b.dataset.month !== undefined) { state.jm = Number(b.dataset.month); state.view = 'years'; state.yearBase = null; return render(); } // بعد از ماه، انتخاب سال
      if (b.dataset.year !== undefined) { state.jy = Number(b.dataset.year); state.view = 'days'; return render(); } // بعد از سال، انتخاب روز
      if (b.dataset.view !== undefined) { state.view = b.dataset.view; if (state.view === 'years') state.yearBase = null; return render(); }
      if (b.dataset.nav !== undefined) {
        state.jm += Number(b.dataset.nav);
        if (state.jm > 12) { state.jm = 1; state.jy = clampYear(state.jy + 1); }
        if (state.jm < 1) { state.jm = 12; state.jy = clampYear(state.jy - 1); }
        return render();
      }
      if (b.dataset.yearnav !== undefined) { state.jy = clampYear(state.jy + Number(b.dataset.yearnav)); return render(); }
      if (b.dataset.yearpage !== undefined) { state.yearBase += Number(b.dataset.yearpage); return render(); }
      if (b.dataset.today !== undefined) { const t = todayJalali(); return pick(t.jy, t.jm, t.jd); }
      if (b.dataset.clear !== undefined) {
        if (state.input) { state.input.value = ''; state.input.dataset.iso = ''; J().attach(state.input); state.input.dispatchEvent(new Event('change', { bubbles: true })); }
        return close();
      }
    });
    document.body.appendChild(el);
    state.picker = el;
    return el;
  }

  function close() {
    if (state.picker) state.picker.hidden = true;
    state.input = null; state.view = 'days';
  }
  function pick(jy, jm, jd) {
    const iso = J().jalaliStrToIso(`${jy}/${jm}/${jd}`);
    if (iso && state.input) J().set(state.input, iso);
    close();
  }

  // ---------- نمای روزها ----------
  function renderDays() {
    const t = todayJalali();
    const { lead, len } = dayGridMeta(state.jy, state.jm);
    const selIso = state.input ? (J().iso(state.input) || '') : '';
    const sel = selIso ? J().isoToJalali(selIso) : null;
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="jdp-day empty"></span>';
    for (let d = 1; d <= len; d++) {
      const isToday = t.jy === state.jy && t.jm === state.jm && t.jd === d;
      const isSel = sel && sel.jy === state.jy && sel.jm === state.jm && sel.jd === d;
      cells += `<button type="button" class="jdp-day${isToday ? ' today' : ''}${isSel ? ' selected' : ''}" data-day="${d}">${fa(d)}</button>`;
    }
    return `
      <header class="jdp-head">
        <button type="button" class="jdp-nav" data-nav="-1" title="ماه قبل">›</button>
        <button type="button" class="jdp-title" data-view="months">${J().monthNames[state.jm - 1]} ${fa(state.jy)}</button>
        <button type="button" class="jdp-nav" data-nav="1" title="ماه بعد">‹</button>
      </header>
      <div class="jdp-week">${weekdays.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="jdp-grid">${cells}</div>
      <footer class="jdp-foot">
        <button type="button" class="jdp-today" data-today>امروز</button>
        <button type="button" class="jdp-clear" data-clear>پاک کردن</button>
      </footer>`;
  }
  // ---------- نمای ماه‌ها ----------
  function renderMonths() {
    const t = todayJalali();
    return `
      <header class="jdp-head">
        <button type="button" class="jdp-nav" data-yearnav="-1" title="سال قبل">›</button>
        <button type="button" class="jdp-title" data-view="years">${fa(state.jy)}</button>
        <button type="button" class="jdp-nav" data-yearnav="1" title="سال بعد">‹</button>
      </header>
      <div class="jdp-hint">ماه را انتخاب کنید، سپس سال</div><div class="jdp-grid months">${J().monthNames.map((m, i) =>
        `<button type="button" class="jdp-month${state.jm === i + 1 ? ' selected' : ''}${t.jy === state.jy && t.jm === i + 1 ? ' today' : ''}" data-month="${i + 1}">${m}</button>`).join('')}</div>
      <footer class="jdp-foot"><button type="button" class="jdp-today" data-today>امروز</button></footer>`;
  }
  // ---------- نمای سال‌ها ----------
  function renderYears() {
    const t = todayJalali();
    if (state.yearBase == null) state.yearBase = Math.max(1201, Math.min(1488, state.jy - 5));
    const base = state.yearBase;
    let cells = '';
    for (let y = base; y < base + 12; y++) {
      const inRange = y >= 1201 && y <= 1499;
      cells += `<button type="button" class="jdp-year${state.jy === y ? ' selected' : ''}${t.jy === y ? ' today' : ''}" data-year="${y}" ${inRange ? '' : 'disabled'}>${fa(y)}</button>`;
    }
    return `
      <header class="jdp-head">
        <button type="button" class="jdp-nav" data-yearpage="-12" title="۱۲ سال قبل">»</button>
        <button type="button" class="jdp-title" data-view="months">${fa(base)} – ${fa(base + 11)}</button>
        <button type="button" class="jdp-nav" data-yearpage="12" title="۱۲ سال بعد">«</button>
      </header>
      <div class="jdp-grid years">${cells}</div>
      <footer class="jdp-foot"><button type="button" class="jdp-today" data-today>امروز</button></footer>`;
  }

  function render() {
    const el = state.picker;
    el.innerHTML = state.view === 'days' ? renderDays() : state.view === 'months' ? renderMonths() : renderYears();
  }

  function position(input) {
    const el = state.picker, r = input.getBoundingClientRect();
    const vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    el.hidden = false;
    const w = el.offsetWidth || 308, h = el.offsetHeight || 380;
    el.hidden = true;
    el.classList.toggle('sheet', vw < 640);
    if (vw < 640) { el.style.top = ''; el.style.left = ''; el.hidden = false; return; } // شیت پایین در موبایل
    let top = r.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
    let left = r.left;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.hidden = false;
  }

  function openFor(input) {
    const core = J();
    if (!core) return;
    ensurePicker();
    state.input = input;
    const iso = core.iso(input) || '';
    const cur = iso ? core.isoToJalali(iso) : null;
    const t = todayJalali();
    state.jy = cur ? cur.jy : t.jy;
    state.jm = cur ? cur.jm : t.jm;
    state.view = 'days';
    state.yearBase = null;
    render();
    position(input);
  }

  // اتصال خودکار به همه input[data-jalali] — حتی موارد رندرشده بعداً
  document.addEventListener('click', event => {
    const target = event.target;
    if (target && target.closest && target.closest('input[data-jalali]')) { event.preventDefault(); openFor(target.closest('input[data-jalali]')); return; }
    if (state.picker && !state.picker.hidden && !state.picker.contains(target)) close();
  });
  document.addEventListener('focusin', event => {
    const t = event.target;
    if (t && t.matches && t.matches('input[data-jalali]') && !state.picker) openFor(t);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (state.picker && !state.picker.hidden && state.input) position(state.input); });

  window.YasnaJalaliPicker = {
    openFor, close,
    debug: { todayJalali, weekdayCol, dayGridMeta },
  };
})();
