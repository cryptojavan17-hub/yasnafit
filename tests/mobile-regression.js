#!/usr/bin/env node
'use strict';
// رگرسیون موبایل — مناسب بودن تمام صفحه‌ها در تمام اندازه‌ها (۳۲۰ تا دسکتاپ)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const files = {};
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  if (f.endsWith('.css') || f.endsWith('.html')) files[f] = read('public/' + f);
}

// ─── ۱. همهٔ HTMLها باید viewport داشته باشند ───
for (const [name, html] of Object.entries(files)) {
  if (!name.endsWith('.html')) continue;
  assert.match(html, /name="viewport"\s+content="[^"]*width=device-width/, `${name} must declare a device-width viewport`);
}
assert.match(files['student.html'], /viewport-fit=cover/, 'student shell must be notch-aware');

// ─── ۲. پیش‌فرض روشن سطح شاگرد: color-scheme نباید dark باشد ───
assert.match(files['student.html'], /name="color-scheme" content="light"/, 'student shell must start with a light color-scheme');
assert.doesNotMatch(files['student.html'], /color-scheme" content="dark/, 'dark color-scheme contradicts the light-default directive');

// ─── ۳. گریدهای auto-fill/auto-fit هرگز نباید از عرض دید بزرگ‌تر باشند ───
const guards = [
  ['diet-programs.css', /repeat\(auto-fill,\s*minmax\(min\(360px,\s*100%\),\s*1fr\)\)/],
  ['supplement-programs.css', /repeat\(auto-fill,\s*minmax\(min\(320px,\s*100%\),\s*1fr\)\)/],
  ['program-builder.css', /repeat\(auto-fill,\s*minmax\(min\(310px,\s*100%\),\s*1fr\)\)/],
  ['student-app.css', /repeat\(auto-fit,\s*minmax\(min\(280px,\s*100%\),\s*1fr\)\)/],
  ['styles.css', /repeat\(auto-fit,\s*minmax\(min\(220px,\s*100%\),\s*1fr\)\)/],
];
for (const [f, re] of guards) assert.match(files[f], re, `${f}: wide auto-fill tracks must clamp to 100%`);
// هیچ minmax پیکسلی ≥280px بدون محافظ min(...,100%) نمانده باشد
for (const [name, css] of Object.entries(files)) {
  if (!name.endsWith('.css')) continue;
  for (const m of css.matchAll(/repeat\((?:auto-fill|auto-fit),\s*minmax\((\d{3})px/g)) {
    const n = Number(m[1]);
    if (n >= 280) assert.match(css, new RegExp(`minmax\\(min\\(${n}px`), `${name}: minmax(${n}px,…) needs a min(…,100%) clamp`);
  }
}

// ─── ۴. تاپ‌بار پنل مربی در موبایل باید جمع شود ───
const styles = files['styles.css'];
assert.match(styles, /@media \(max-width: 850px\) \{\s*\.sidebar-toggle \{ display: none; \}/, 'the desktop sidebar toggle must disappear behind the hamburger');
assert.match(styles, /\.topbar \{ height: auto; min-height: 64px; flex-wrap: wrap/, 'the topbar must wrap instead of overflowing on phones');
assert.match(styles, /\.breadcrumb \{ order: 10; flex-basis: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; \}/, 'the breadcrumb must take its own truncated row');
assert.match(styles, /@media \(max-width: 430px\) \{\s*#coachLogoutAll \{ display: none; \}/, 'logout-all must collapse on very narrow phones');

// ─── ۵. ضد زوم iOS: ورودی‌ها در موبایل ≥16px ───
const inputRule = /font-size: 16px; \}/;
assert.match(styles, /@media \(max-width: 680px\) \{\s*\.app-shell :is\(input, select, textarea\)[^{}]*\{ font-size: 16px; \}/, 'coach inputs must be 16px on phones');
assert.match(files['student-app.css'], /@media \(max-width: 680px\) \{\s*\.student-app :is\(input, select, textarea\)[^{}]*\{ font-size: 16px; \}/, 'student inputs must be 16px on phones');

// ─── ۶. جدول شاگردان در موبایل فشرده می‌شود ───
assert.match(files['students.css'], /\.students-table-wrap \{\s*overflow-x: auto;/, 'the students table must scroll inside its card');
assert.match(files['students.css'], /@media \(max-width: 600px\) \{\s*\.students-table \{ min-width: 1010px; font-size: 11\.5px; \}/, 'the students table must compact on phones');
assert.match(files['students.css'], /\.students-search-box \{ width: 100%; flex-shrink: 1; \}/, 'the students search box must go fluid on phones');

// ─── ۷. ریل تماس صفحهٔ اصلی در موبایل باید داخل قاب بماند ───
// قاب پوستر overflow:hidden دارد؛ ریلِ بیرون‌رفته از لبه قاب قیچی می‌شود (ناپدید در حالت عادی موبایل).
const sacss = files['student-app.css'];
assert.doesNotMatch(sacss, /\.entry-contact-rail\{[^}]*top:calc\(100%/, 'the contact rail must never be pushed outside the clipping frame');
assert.match(sacss, /@media\(max-width:680px\)\{\s*\.entry-contact-rail\{[^}]*\}\s*\.contact-ico\{width:15px;height:15px/, 'phone contact icons must stay at the compact standard size, not oversized');
assert.match(sacss, /@media\(max-width:680px\)\{\s*\.entry-contact-rail\{top:auto;bottom:max\(6px,1\.8%\);left:4%;right:auto;transform:none/, 'on phones the rail must stay anchored inside the frame, bottom-left under the quote');

// ─── ۸. هدر لندینگ در موبایل پک می‌شود (باگ مالک ۲۰۲۶-۰۹-۳۰: سه دکمهٔ هدر بیرون می‌زدند) ───
const landing = files['landing.css'];
assert.match(landing, /@media \(max-width: 900px\) \{\s*\.nav-toggle \{ display: flex; \}\s*\/\* سه فرزند در جریان[^*]*\*\/\s*\.site-header__inner \{ grid-template-columns: auto 1fr auto; gap: 16px; \}\s*\.site-header__actions \{ justify-self: end; margin-inline-start: 0; \}/,
  'the ≤900px header grid must place actions in the 1fr middle column — a 2-column grid pushed the action buttons into an implicit column and off-screen');
assert.match(landing, /@media \(max-width: 640px\) \{[^@]*?\.site-header__actions \{ gap: 8px; \}\s*\.site-header__actions \.btn \{ padding: 0 12px; min-height: 40px; font-size: 13px; \}\s*\.site-header__actions \.btn__icon svg \{ width: 16px; height: 16px; \}\s*\.brand__text \{ display: none; \}/,
  'on phones BOTH header buttons must stay visible and compact — hiding ghost buttons erased «ثبت نام» (owner bug 2026-09-30); the brand wordmark yields instead');
assert.doesNotMatch(landing, /\.site-header__actions \.btn--ghost \{ display: none/, 'the register button must never be hidden on phones again');
assert.match(landing, /@media \(max-width: 400px\) \{\s*\.site-header__actions \.btn__icon \{ display: none; \}\s*\}/, 'at ≤400px the button icons drop so both labels always fit');

console.log(JSON.stringify({ ok: true, viewports: true, light_scheme: true, grid_clamps: true, topbar_pack: true, ios_zoom_guard: true, students_table: true, landing_header_pack: true }));
