#!/usr/bin/env node
// Smoke داخلی جریان Program Builder بدون مرورگر (استاب DOM + fetch mock)
// پوشش: کاتالوگ ۱۲ سیستم، سقف حرکت، باز ماندن بانک، ترتیب، عدم حذف روز، سازگاری idهای قدیمی
// اجرا:  node tool/smoke-program-builder.js
'use strict';
const fs = require('fs');
const path = require('path');
const clsRec = () => { const s = new Set(); return { add: c => s.add(c), remove: c => s.delete(c), toggle: (c, f) => { f ? s.add(c) : s.delete(c); }, contains: c => s.has(c) }; };
const els = {};
const mkEl = id => ({
  id, innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, open: false,
  onclick: null, oninput: null, onchange: null, title: '', dataset: {}, style: {},
  selectedOptions: [{ textContent: 'پرونده ۱۲۳ • زینب تست • فیتنس' }],
  classList: clsRec(), appendChild() {}, insertBefore() {}, remove() {}, focus() {},
  parentElement: { appendChild() {} },
  querySelector: sel => els[sel.replace('#', '')] || null,
  querySelectorAll: function(sel) { return (typeof this._qs === 'function' && this._qs(sel)) || []; },
});
const get = id => (els[id] = els[id] || mkEl(id));
['exerciseDrawer', 'drawerList', 'drawerTitle', 'drawerTabAdd', 'drawerContext', 'drawerDone', 'drawerSearch', 'drawerFilterStep', 'drawerSearchSection', 'drawerCategorySection', 'systemPicker', 'systemPickerGrid'].forEach(get);

const registry = {};
const btn = (ds) => ({ dataset: ds, onclick: null, classList: clsRec(), disabled: false, style: {} });
const addSysBtn = btn({ addSys: '1' });
const addMovBtn = btn({ addMov: '1-0' });
const chipBtn = btn({ dayChip: '0' });
const gymBtn = btn({ bankLocation: 'gym' });
const picks = [1, 6, 5, 7, 8, 9, 2, 10, 3, 11, 4, 12].map(id => btn({ pickSystem: String(id) }));
registry['[data-add-sys]'] = [addSysBtn];
registry['[data-add-mov]'] = [addMovBtn];
registry['[data-day-chip]'] = [chipBtn];
registry['[data-bank-location]'] = [gymBtn];

global.window = globalThis;
globalThis.addEventListener = () => {}; globalThis.dispatchEvent = () => {};
const content = mkEl('content');
global.document = {
  getElementById: get,
  querySelector: sel => (sel === '#content' ? content : ((sel === 'body > #exerciseDrawer' || sel === 'body > #systemPicker') ? null : mkEl(sel))),
  querySelectorAll: sel => registry[sel] || [],
  createElement: () => mkEl('tmp'),
  addEventListener() {}, body: { appendChild() {} },
};
global.location = { search: '?id=101', pathname: '/programs/exercise/form', href: '' };
global.history = { pushState() {}, replaceState() {} };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.alert = m => { throw new Error('alert: ' + m); };
global.confirm = () => true;

const bank = [
  { id: 39, original_id: 39, name_fa: 'داخل پا دستگاه', category_id: 'legs' },
  { id: 620, original_id: 620, name_fa: 'پرس سینه هالتر', category_id: 'chest' },
  { id: 2064, original_id: 2064, name_fa: 'جلو پا دستگاه نشسته', category_id: 'legs' },
  { id: 618, original_id: 618, name_fa: 'پرس سینه هالتر دست باز', category_id: 'chest' },
  { id: 376, original_id: 376, name_fa: 'ددلیفت زیر بغل دستگاه', category_id: 'legs' },
  { id: 5, original_id: 5, name_fa: 'پرس پا دستگاه خوابیده پا بالای صفحه', category_id: 'legs' },
];
const prog = {
  id: 101, title: 'برنامه تست ۱۲ سیستم', coach_note: '', start_date: '2026-08-01', end_date: '2026-08-31',
  student_id: null, assessment_id: null, status: 'DRAFT',
  program_data: { version: 2, days: [
    { day_number: 1, dayHash: 'day1test', focus: 'بالاتنه', coachNote: '', isRestDay: false, data: [
      { exercise_system_id: 2, exerciseSystemHash: 'sysold1', system_type: 'superset', movement_list: [
        { exercise_id: 620, original_exercise_id: 620, nameFa: 'پرس سینه هالتر', movementHash: 'movold1', description: '', sets: [{ type: 'REPEAT', count: 12, weight: 40, restSeconds: 60, setHash: 'setold1' }] },
      ] },
    ] },
  ] },
};
global.fetch = async url => {
  const u = String(url);
  if (u.includes('/api/training-programs/101/full')) return { ok: true, json: async () => prog };
  if (u.includes('/api/students')) return { ok: true, json: async () => [] };
  if (u.includes('/api/training-programs')) return { ok: true, json: async () => [] };
  if (u.includes('/api/categories/grouped')) return { ok: true, json: async () => [{ id: 'legs', name: 'حرکات پا', count: 3, subs: [] }, { id: 'chest', name: 'حرکات سینه', count: 3, subs: [] }] };
  if (u.includes('/api/exercises')) return { ok: true, json: async () => ({ items: bank.filter(x => u.includes('legs') ? x.category_id === 'legs' : x.category_id === 'chest') }) };
  return { ok: true, json: async () => ({}) };
};
eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'program-builder.js'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await window.renderProgramBuilder('ساخت برنامه', '/programs/exercise/form');
  const dayHtml = () => els['daysContainer'].innerHTML;
  const results = {};
  const check = (name, ok) => { results[name] = ok; console.log((ok ? '✅' : '❌'), name); };

  check('برنامه قدیمی: برچسب «سوپر ست» بدون چیپ پیشرفت', dayHtml().includes('سوپر ست') && !dayHtml().includes('از ۲ حرکت'));
  check('حذف روز در منوی تنظیمات روز موجود است', dayHtml().includes('data-del-day'));

  get('btnAddDay').onclick();
  check('روز جدید بدون سیستم پیش‌فرض', dayHtml().includes('افزودن سیستم تمرینی'));

  addSysBtn.dataset.addSys = '1';
  els['systemPickerGrid']._qs = sel => sel === '[data-pick-system]' ? picks : [];
  addSysBtn.onclick();
  check('انتخابگر باز شد', els['systemPicker'].hidden === false);
  check('۱۲ سیستم بایند شدند', picks.length === 12 && picks.every(p => p.onclick !== null));
  picks.find(p => p.dataset.pickSystem === '12').onclick();
  check('ماموت ست اضافه شد (بدون چیپ پیشرفت)', dayHtml().includes('ماموت ست') && !dayHtml().includes('از ۵ حرکت'));
  check('انتخابگر بعد از انتخاب بسته شد', els['systemPicker'].hidden === true);

  addMovBtn.dataset.addMov = '1-0';
  addMovBtn.onclick();
  const drawer = els['exerciseDrawer'];
  check('بانک باز شد', drawer.classList.contains('open'));
  check('زمینه بانک: شمارنده «۰ از ۵»', !els['drawerContext'].hidden && els['drawerContext'].innerHTML.includes('۰ از ۵'));

  gymBtn.onclick();
  await sleep(50);
  els['drawerSearch'].value = 'پا';
  els['drawerSearch'].oninput();
  await sleep(500);
  const fakeItems = bank.map(b => btn({ exId: String(b.id), exOrig: String(b.original_id), exName: b.name_fa }));
  els['drawerList']._qs = sel => sel === '.drawer-item' ? fakeItems : [];
  els['drawerSearch'].oninput();
  await sleep(500);
  check('آیتم‌های بانک بایند شدند', fakeItems.every(i => i.onclick !== null));

  fakeItems.forEach(i => i.onclick());
  const ctx = els['drawerContext'].innerHTML;
  check('سقف ۵: «۵ از ۵» + پیام تکمیل', ctx.includes('۵ از ۵') && ctx.includes('تکمیل'));
  check('بانک بسته نشد (چندانتخابی)', drawer.classList.contains('open'));
  const html = dayHtml();
  const order = ['داخل پا دستگاه', 'پرس سینه هالتر', 'جلو پا دستگاه نشسته', 'پرس سینه هالتر دست باز', 'ددلیفت زیر بغل دستگاه'].map(n => html.indexOf(n));
  check('ترتیب انتخاب حفظ شد', order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])));
  check('حرکت ششم رد شد (۵ کارت در روز فعال)', (html.match(/movement-card/g) || []).length === 5);

  els['drawerDone'].onclick();
  check('بستن دستی + مخفی‌شدن زمینه', !drawer.classList.contains('open') && els['drawerContext'].hidden);
  check('سیستم کامل: بدون دکمه افزودن و بدون متن تکمیل', !dayHtml().includes('data-add-mov') && !dayHtml().includes('system-complete'));

  // ۹) ماتریس ۱۲ سیستم: ۶ کلیک روی هر سیستم، انتظار دقیقاً N حرکت
  const sysMatrix = [[1,1],[6,1],[5,1],[7,1],[8,1],[9,1],[2,2],[10,2],[3,3],[11,3],[4,4],[12,5]];
  let dayCount = 2; // روز ۱ قدیمی + روز ۲ ماموت
  let matrixOk = true;
  const labels = {1:'معمولی',6:'رست پاز',5:'دراپ ست',7:'پس خستگی',8:'FST7',9:'۲۱',2:'سوپر ست',10:'تکرار نیمه',3:'تری ست',11:'۲۰-۱۰-۵',4:'جاينت ست',12:'ماموت ست'};
  for (const [sid, req] of sysMatrix) {
    get('btnAddDay').onclick();
    dayCount += 1;
    const dayIdx = dayCount - 1;
    addSysBtn.dataset.addSys = String(dayIdx);
    addSysBtn.onclick();
    picks.find(p => p.dataset.pickSystem === String(sid)).onclick();
    addMovBtn.dataset.addMov = `${dayIdx}-0`;
    addMovBtn.onclick();
    fakeItems.forEach(i => i.onclick());
    els['drawerDone'].onclick();
    const h = els['daysContainer'].innerHTML;
    const n = (h.match(/movement-card/g) || []).length;
    const ok = n === req && !h.includes('data-add-mov');
    if (!ok) matrixOk = false;
    console.log((ok ? '✅' : '❌'), `${labels[sid]} (id=${sid}): ${n}/${req} حرکت`);
  }
  check('ماتریس ۱۲ سیستم: سقف همه درست اعمال شد', matrixOk);

  const pass = Object.values(results).every(Boolean);
  console.log(pass ? '\nSMOKE PROGRAM-BUILDER PASS ✅' : '\nSMOKE PROGRAM-BUILDER FAIL ❌');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('❌ RUNTIME ERROR:', e); process.exit(1); });
