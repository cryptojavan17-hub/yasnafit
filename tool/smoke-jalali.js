#!/usr/bin/env node
// تست صحت تبدیل تقویم شمسی — node tool/smoke-jalali.js
'use strict';
const fs = require('fs'), path = require('path');
global.window = {}; global.document = { createElement: () => ({}), querySelectorAll: () => [] };
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'jalali.js'), 'utf8'));
const J = window.YasnaJalali;
let failures = 0;
const T = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL'), name); if (!cond) failures++; };

const anchors = [
  ['2026-08-24', '1405/06/02', '۲ شهریور ۱۴۰۵'],
  ['2024-03-20', '1403/01/01', '۱ فروردین ۱۴۰۳'],
  ['2025-03-20', '1403/12/30', '۳۰ اسفند ۱۴۰۳'],
  ['2026-03-21', '1405/01/01', '۱ فروردین ۱۴۰۵'],
  ['1991-03-21', '1370/01/01', '۱ فروردین ۱۳۷۰'],
  ['2025-09-23', '1404/07/01', '۱ مهر ۱۴۰۴'],
];
for (const [iso, str, fmt] of anchors) {
  T(`${iso} → ${str}`, J.isoToJalaliStr(iso) === str);
  T(`${str} → ${iso} (بازگشت)`, J.jalaliStrToIso(str) === iso);
  T(`فرمت ${iso} = «${fmt}»`, J.format(iso) === fmt);
}
T('پارس ارقام فارسی ۱۴۰۵/۶/۲', J.jalaliStrToIso('۱۴۰۵/۶/۲') === '2026-08-24');
T('پارس جداکننده‌های مختلف', J.jalaliStrToIso('1405-6-2') === '2026-08-24' && J.jalaliStrToIso('1405.06.02') === '2026-08-24');
T('1404 کبیسه نیست → ۱۲/۳۰ نامعتبر', J.jalaliStrToIso('1404/12/30') === null);
T('1403 کبیسه → ۱۲/۳۰ معتبر', J.jalaliStrToIso('1403/12/30') === '2025-03-20');
T('ماه/روز نامعتبر رد می‌شود', J.jalaliStrToIso('1405/13/01') === null && J.jalaliStrToIso('1405/00/10') === null && J.jalaliStrToIso('1405/07/31') === null);
T('الگوی کبیسه ۳۳ ساله', J.isLeap(1403) && J.isLeap(1408) && !J.isLeap(1404) && !J.isLeap(1405) && !J.isLeap(1406));
T('ورودی خالی/مخالف → null/خالی', J.jalaliStrToIso('') === null && J.isoToJalaliStr('garbage') === '');
T('فرمت نامعتبر → «—» امن', J.formatSafe('') === '—' && J.formatSafe('2026-08-24') === '۲ شهریور ۱۴۰۵');
// رندوم roundtrip روی ۲۰ سال
let roundOk = true;
for (let i = 0; i < 2000; i++) {
  const base = Date.UTC(2000, 0, 1) + Math.floor(Math.random() * 3650 * 86400000);
  const iso = new Date(base).toISOString().slice(0, 10);
  const back = J.jalaliStrToIso(J.isoToJalaliStr(iso));
  if (back !== iso) { roundOk = false; console.log('  roundtrip fail:', iso, '→', J.isoToJalaliStr(iso), '→', back); break; }
}
T('roundtrip تصادفی ۲۰۰۰ تاریخ (۲۰۰۰-۲۰۰۹)', roundOk);

console.log(failures === 0 ? '\nJALALI PASS ✅' : `\nJALALI FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
