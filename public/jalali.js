/* YasnaFit — تقویم شمسی (جلالی) — بدون وابستگی خارجی
   الگوریتم تبدیل: بر پایه jalaali-js (MIT, Behrang Norouzinia)
   داده همیشه ISO میلادی (YYYY-MM-DD) ذخیره می‌شود؛ این لایه فقط نمایش/ورود شمسی است.
   استفاده:
     YasnaJalali.format('2026-08-24')              → «۲ شهریور ۱۴۰۵»
     YasnaJalali.isoToJalaliStr('2026-08-24')      → '1405/06/02'
     YasnaJalali.jalaliStrToIso('۱۴۰۵/۶/۲')        → '2026-08-24' (یا null)
     <input data-jalali ...> + YasnaJalali.autoInit()  → ورودی شمسی با همگام‌سازی ISO
*/
(function () {
  'use strict';
  const div = (a, b) => ~~(a / b);
  const mod = (a, b) => a - ~~(a / b) * b;
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    const bl = breaks.length, gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
    if (jy < jp || jy >= breaks[bl - 1]) return null;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    return { gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1, gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    if (!r) return null;
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
      k -= 186;
    } else {
      jy -= 1; k += 179;
      if (isLeap(jy)) k += 1; // اسفند سال قبل ۳۰ روز دارد
    }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy, jm, jd };
  }

  const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const faDigits = value => String(value).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const enDigits = value => String(value).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const pad2 = n => String(n).padStart(2, '0');
  // کبیسه از «طول واقعی سال جلالی» (فاصله دو نوروز) — سازگار با j2d/d2j
  const yearLength = jy => {
    const a = jalCal(jy), b = jalCal(jy + 1);
    if (!a || !b) return 365;
    return g2d(jy + 622, 3, b.march) - g2d(jy + 621, 3, a.march);
  };
  const isLeap = jy => yearLength(jy) === 366;
  const monthLength = (jy, jm) => (jm <= 6 ? 31 : (jm <= 11 ? 30 : (isLeap(jy) ? 30 : 29)));

  function isoToJalali(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    const j = d2j(g2d(Number(m[1]), Number(m[2]), Number(m[3])));
    return j;
  }
  function isoToJalaliStr(iso) {
    const j = isoToJalali(iso);
    return j ? `${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}` : '';
  }
  function jalaliStrToIso(text) {
    const parts = enDigits(String(text || '')).split(/[^\d]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const jy = Number(parts[0]), jm = Number(parts[1]), jd = Number(parts[2]);
    if (jy < 1200 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > monthLength(jy, jm)) return null;
    const g = d2g(j2d(jy, jm, jd));
    return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  }
  function format(iso) { // «۲ شهریور ۱۴۰۵»
    const j = isoToJalali(iso);
    return j ? `${faDigits(j.jd)} ${monthNames[j.jm - 1]} ${faDigits(j.jy)}` : '';
  }

  function addMonths(iso, count = 1) {
    const j = isoToJalali(iso);
    if (!j) return null;
    let jy = j.jy;
    let jm = j.jm + count;
    while (jm > 12) {
      jm -= 12;
      jy += 1;
    }
    while (jm < 1) {
      jm += 12;
      jy -= 1;
    }
    const maxDay = monthLength(jy, jm);
    const jd = Math.min(j.jd, maxDay);
    const jdn = j2d(jy, jm, jd);
    const g = d2g(jdn);
    return `${g.gy}-${pad2(g.gm)}-${pad2(g.gd)}`;
  }

  // ---------- ویجت ورودی ----------
  function sync(el) {
    if (el._jalaliHidden) el._jalaliHidden.value = el.dataset.iso || '';
  }
  function revalidate(el, pretty) {
    const raw = el.value.trim();
    if (!raw) { el.dataset.iso = ''; el.classList.remove('jalali-bad', 'jalali-ok'); sync(el); return true; }
    const iso = jalaliStrToIso(raw);
    if (iso) {
      el.dataset.iso = iso;
      el.classList.add('jalali-ok'); el.classList.remove('jalali-bad');
      if (pretty) el.value = isoToJalaliStr(iso);
      sync(el);
      return true;
    }
    // اگر مقدار میلادی ISO وارد شد هم بپذیر
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && isoToJalali(raw)) {
      el.dataset.iso = raw;
      el.classList.add('jalali-ok'); el.classList.remove('jalali-bad');
      if (pretty) el.value = isoToJalaliStr(raw);
      sync(el);
      return true;
    }
    el.dataset.iso = '';
    el.classList.add('jalali-bad'); el.classList.remove('jalali-ok');
    sync(el);
    return false;
  }
  function attach(el) {
    if (el._jalaliInit) return el;
    el._jalaliInit = true;
    el.type = 'text';
    el.setAttribute('dir', 'ltr');
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    if (!el.placeholder) el.placeholder = '۱۴۰۵/۰۶/۰۲';
    // اگر مقدار اولیه ISO بود، به شمسی نمایش بده
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(el.value || '').trim())) el.value = isoToJalaliStr(el.value.trim());
    const name = el.getAttribute('name');
    if (name) {
      el.removeAttribute('name');
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = name;
      el.after(hidden);
      el._jalaliHidden = hidden;
    }
    el.addEventListener('input', () => revalidate(el, false));
    el.addEventListener('blur', () => revalidate(el, true));
    revalidate(el, false);
    return el;
  }
  function autoInit(root) {
    (root || document).querySelectorAll('input[data-jalali]').forEach(attach);
  }

  window.YasnaJalali = {
    isoToJalali, isoToJalaliStr, jalaliStrToIso, format, addMonths,
    monthNames, isLeap, monthLength,
    attach, autoInit,
    iso(el) { return (el && el.dataset && el.dataset.iso) || ''; },
    set(el, iso) { if (!el) return; el.value = iso ? isoToJalaliStr(iso) : ''; revalidate(el, false); },
    formatSafe(iso) { return format(iso) || (iso || '—'); },
  };
})();
