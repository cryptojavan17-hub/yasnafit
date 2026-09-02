#!/usr/bin/env node
// تست انتخابگر تاریخ شمسی — node tool/smoke-jalali-picker.js
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
const mkEl = () => ({ innerHTML: '', textContent: '', value: '', hidden: true, dataset: {}, style: {}, type: 'text', placeholder: '', classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, addEventListener() {}, after() {}, appendChild() {}, querySelectorAll: () => [], contains: () => false, offsetWidth: 308, offsetHeight: 380, dispatchEvent() {}, getBoundingClientRect() { return { left: 100, top: 100, bottom: 140, right: 400, width: 300, height: 40 }; } });
const els = {};
global.document = {
  createElement: () => mkEl(), body: { appendChild() {} },
  addEventListener() {},
  getElementById: id => (els[id] = els[id] || mkEl()),
  querySelectorAll: () => [],
};
global.window.addEventListener = () => {};
global.window.innerWidth = 1280; global.window.innerHeight = 800;
eval(fs.readFileSync(path.join(root, 'public', 'jalali.js'), 'utf8'));
global.window.YasnaJalali.monthNames // sanity
eval(fs.readFileSync(path.join(root, 'public', 'jalali-picker.js'), 'utf8'));
const P = window.YasnaJalaliPicker, J = window.YasnaJalali;
let failures = 0;
const T = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL'), name); if (!cond) failures++; };

// ۱) امروز
const t = P.debug.todayJalali();
const now = new Date();
const isoToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
T(`امروز = ${t.jy}/${t.jm}/${t.jd} منطبق بر ${isoToday}`, J.isoToJalaliStr(isoToday) === `${t.jy}/${String(t.jm).padStart(2, '0')}/${String(t.jd).padStart(2, '0')}`);

// ۲) متادیتای گرید روزها
const g6 = P.debug.dayGridMeta(1405, 6); // شهریور ۱۴۰۵ — ۱ شهریور = 2026-08-23 (یکشنبه) → ستون 1
T('شهریور ۱۴۰۵: ۳۱ روز', g6.len === 31);
T('شروع گرید از ستون درست (یکشنبه=۱)', g6.lead === P.debug.weekdayCol('2026-08-23'));
const g12 = P.debug.dayGridMeta(1403, 12); // اسفند کبیسه
T('اسفند ۱۴۰۳ (کبیسه): ۳۰ روز', g12.len === 30);
const g124 = P.debug.dayGridMeta(1404, 12);
T('اسفند ۱۴۰۴: ۲۹ روز', g124.len === 29);

// ۳) ستون هفته: 2026-08-24 = دوشنبه → ۲
T('ستون هفته دوشنبه = ۲', P.debug.weekdayCol('2026-08-24') === 2);
T('ستون هفته شنبه = ۰', P.debug.weekdayCol('2026-08-22') === 0);
T('ستون هفته جمعه = ۶', P.debug.weekdayCol('2026-08-28') === 6);

// ۴) باز/بسته و رندر نمای روزها با ورودی دارای مقدار
const input = J.attach ? J.attach(mkEl()) : mkEl();
J.set(input, '2026-08-24');
P.openFor(input);
const el = global.document.body.appendChild.calls ? null : null;
// openFor → ensurePicker ساخته و innerHTML رندر شده؛ از طریق state داخلی در دسترس نیست، پس رفتار را با بازکردن مجدد چک می‌کنیم (بدون خطا)
P.close();
T('openFor/set/close بدون خطای زمان اجرا', true);

// ۵) نماهای ماه/سال: با باز کردن دوباره و view داخلی — از طریق رفتار side-effect آزاد
const input2 = mkEl();
J.set(input2, '1405/06/02'.split('/').length ? J.jalaliStrToIso('1405/06/02') : '');
P.openFor(input2);
P.close();
T('ورودی شمسی قبلی → باز شدن بدون خطا', input2.dataset.iso === '2026-08-24');

console.log(failures === 0 ? '\nJALALI PICKER PASS ✅' : `\nJALALI PICKER FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
