#!/usr/bin/env node
// شبیه‌سازی بوت صفحه /student/login — کشف خطای بارگذاری اولیه اسکریپت‌ها
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const mkEl = (id) => ({
  id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
  dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, focus() {}, click() {},
  setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  querySelector: () => null, querySelectorAll: () => [], closest: () => null, parentElement: null,
});
const studentApp = mkEl('studentApp');
studentApp.innerHTML = '<div class="student-loading"><span class="student-spinner"></span><p>در حال بارگذاری...</p></div>';
global.window = global;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => {};
global.document = {
  querySelector: sel => (sel === '#studentApp' ? studentApp : mkEl(sel)),
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => mkEl('tmp'),
  addEventListener() {}, body: { appendChild() {}, append() {} },
};
global.location = { pathname: '/student/login', search: '', href: '', replace() {} };
global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'unauth' }) });
global.FormData = class { get() { return ''; } };

let failed = 0;
const order = ['localization.js', 'jalali.js', 'jalali-picker.js', 'assessment-wizard.js', 'student-app.js'];
for (const file of order) {
  try {
    eval(fs.readFileSync(path.join(root, 'public', file), 'utf8'));
    console.log('PASS load', file);
  } catch (e) {
    console.log('FAIL load', file, '→', e.message);
    failed++;
  }
}
// بعد از بوت: استارت student-app باید فرم لاگین را رندر کند (رویداد DOMContentLoaded با defer شبیه‌سازی می‌شود)
setTimeout(() => {
  const html = studentApp.innerHTML;
  const rendered = html.includes('studentLoginForm') || html.includes('ورود شاگرد');
  console.log(rendered ? 'PASS فرم لاگین رندر شد' : 'FAIL فرم لاگین رندر نشد — محتوای root: ' + html.slice(0, 120));
  console.log(failed === 0 && rendered ? '\nSTUDENT LOGIN BOOT PASS ✅' : '\nSTUDENT LOGIN BOOT FAIL ❌');
  process.exit(failed === 0 && rendered ? 0 : 1);
}, 50);
