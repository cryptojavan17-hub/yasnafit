#!/usr/bin/env node
/**
 * اتصال بانک حرکات شخصی به YasnaFit
 * فایل JSON حرکات را خوانده، تکراری‌ها را حذف و حرکات جدید را به دیتابیس اضافه می‌کند.
 *
 * استفاده:
 *   node tool/import-custom-bank.js                                (مسیرهای پیش‌فرض)
 *   node tool/import-custom-bank.js "C:\Users\MAHDI\Desktop\bodybuilding\exercises.json"
 *   node tool/import-custom-bank.js <مسیر> --dry-run               (فقط گزارش، بدون ثبت)
 *
 * ساختارهای JSON پشتیبانی‌شده (تشخیص خودکار):
 *   [{ "title"|"name"|"name_fa"|...: "...", "location": "باشگاه"|"منزل"|..., "category": "..." }]
 *   { "exercises"|"movements"|"items"|"data"|"list": [ ... ] }
 *   { "1": {...}, "2": {...} }   (کلید = شناسه)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const db = new DatabaseSync(path.join(root, 'data', 'yasnafit.db'));

const normalize = v => String(v || '')
  .replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9')
  .replace(/[\u0623\u0625\u0622]/g, '\u0627').replace(/\u0640/g, '')
  .replace(/[\u200c\u200f\u200e]/g, ' ').replace(/[\u064B-\u0652]/g, '')
  .replace(/\s+/g, ' ').trim();

function resolveInput(explicit) {
  const candidates = [
    explicit,
    path.join(root, 'data-source', 'exercises.json'),
    path.join(root, 'data-source', 'custom-exercises.json'),
    'C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises.json',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'bodybuilding', 'exercises.json'),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function toItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['exercises', 'movements', 'items', 'list', 'data', 'records', 'harakat', 'results']) {
      if (Array.isArray(data[key])) return data[key];
    }
    const values = Object.values(data);
    if (values.length && values.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      return Object.entries(data).map(([id, v]) => ({ id, ...v }));
    }
  }
  return null;
}

const nameFields = ['name_fa', 'nameFa', 'fa_name', 'title', 'name', 'label', 'نام', 'نام حرکت', 'نام_حرکت'];
const locationFields = ['location', 'محل', 'place', 'محل تمرین'];
const categoryFields = ['category', 'category_id', 'cat', 'دسته', 'دسته‌بندی', 'دستهبندی'];
const priorityFields = ['priority', 'اولویت'];

function pick(item, fields) {
  for (const f of fields) if (item[f] !== undefined && item[f] !== null && String(item[f]).trim() !== '') return item[f];
  return null;
}
function mapLocation(raw) {
  const v = normalize(raw).toLowerCase();
  if (!v) return 'both';
  if (v.includes('منزل') || v === 'home') return 'home';
  if (v.includes('باشگاه') || v.includes('جم') || v === 'gym') return 'gym';
  return 'both';
}

function ensureCustomCategory() {
  const exists = db.prepare("SELECT id FROM exercise_categories WHERE id='custom' AND deleted_at IS NULL").get();
  if (exists) return 'custom';
  db.prepare(`INSERT INTO exercise_categories (id, name, sort_order, stable_id, version)
              VALUES ('custom','حرکات شخصی',99,?,1)`).run(crypto.randomUUID());
  return 'custom';
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicit = args.find(a => !a.startsWith('--') && a.toLowerCase() !== 'node');
  const input = resolveInput(explicit);
  if (!input) {
    console.error('❌ فایل حرکات پیدا نشد. مسیر را بده:\n   node tool/import-custom-bank.js "C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises.json"');
    process.exit(1);
  }
  console.log('📄 فایل:', input);
  let items;
  try { items = toItems(JSON.parse(fs.readFileSync(input, 'utf8'))); }
  catch (e) { console.error('❌ خطا در خواندن/پارس JSON:', e.message); process.exit(1); }
  if (!items) { console.error('❌ ساختار JSON شناسایی نشد (آرایه یا کلیدهای معتبر لازم است)'); process.exit(1); }

  const existing = new Set(db.prepare('SELECT name_fa FROM exercises WHERE deleted_at IS NULL').all().map(r => normalize(r.name_fa)));
  const categories = db.prepare('SELECT id, name FROM exercise_categories WHERE deleted_at IS NULL').all();
  const catByNorm = new Map(categories.map(c => [normalize(c.name), c.id]));

  const plan = [];
  let skippedNoName = 0, dupe = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') { skippedNoName++; continue; }
    const name = String(pick(raw, nameFields) || '').trim();
    if (!name) { skippedNoName++; continue; }
    if (existing.has(normalize(name))) { dupe++; continue; }
    const loc = mapLocation(pick(raw, locationFields));
    const catRaw = String(pick(raw, categoryFields) || '').trim();
    const catNorm = normalize(catRaw);
    let catId = catByNorm.get(catNorm) || categories.find(c => c.id === catRaw)?.id || null;
    if (!catId && catNorm) {
      // تطبیق بخشی: «حرکات پا» ↔ دسته «پا»، «سینه» ↔ «حرکات سینه» و بالعکس
      const hit = categories.find(c => { const n = normalize(c.name); return n.length >= 2 && (catNorm.includes(n) || n.includes(catNorm)); });
      if (hit) catId = hit.id;
    }
    const pr = Number(pick(raw, priorityFields));
    plan.push({ name, location: loc, category_id: catId, priority: Number.isInteger(pr) && pr >= 1 && pr <= 10 ? pr : 5 });
    existing.add(normalize(name));
  }

  console.log(`📊 مجموع: ${items.length} | تکراری (نادیده): ${dupe} | بدون نام: ${skippedNoName} | جدید: ${plan.length}`);
  const noCat = plan.filter(p => !p.category_id).length;
  if (noCat) console.log(`ℹ️  ${noCat} حرکت بدون دسته شناخته‌شده → دسته «حرکات شخصی»`);
  if (!plan.length) { console.log('چیز جدیدی برای افزودن نیست ✅'); process.exit(0); }
  if (dryRun) { plan.slice(0, 15).forEach(p => console.log(`  + ${p.name} [${p.location}]`)); if (plan.length > 15) console.log(`  … و ${plan.length - 15} مورد دیگر`); console.log('(حالت dry-run — چیزی ثبت نشد)'); process.exit(0); }

  const customCat = noCat ? ensureCustomCategory() : null;
  const insert = db.prepare(`INSERT INTO exercises (name_fa, location, category_id, subcategory_id, status, priority, stable_id, version)
                             VALUES (?,?,?,?,'active',?,?,1)`);
  let done = 0;
  db.exec('BEGIN');
  try {
    for (const p of plan) {
      insert.run(p.name, p.location, p.category_id || customCat, null, p.priority, crypto.randomUUID());
      done++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('❌ خطا در ثبت (rollback شد):', e.message); process.exit(1); }
  console.log(`✅ ${done} حرکت جدید ثبت شد (فعال) — در بانک/جستجوها فوراً قابل استفاده است.`);
  console.log('ℹ️  اگر سرور روشن است لازم نیست ری‌استارت شود؛ لیست‌ها از دیتابیس می‌خوانند.');
}

try { main(); } finally { db.close(); }
