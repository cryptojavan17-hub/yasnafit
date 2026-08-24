#!/usr/bin/env node
/**
 * اتصال بانک حرکات شخصی به YasnaFit — نسخه ۲ (تشخیص خودکار حالت)
 *
 * حالت ۱) تغذیه (فایل غنی با id + name_fa + category — خروجی exercises_organized):
 *    • حرکت موجود (تطبیق original_id یا نام نرمال‌شده) → پر کردن name_en/equipment/difficulty/description/video_path
 *    • حرکت جدید → درج کامل (دسته‌های نبود مثل lats/trx خودکار ساخته می‌شوند)
 * حالت ۲) درج ساده (ساختارهای عمومی دیگر)
 *
 * استفاده:
 *   node tool/import-custom-bank.js [مسیر] [--dry-run]
 * مسیرهای پیش‌فرض: data-source\exercises.json، C:\Users\MAHDI\Desktop\bodybuilding\exercises.json
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
    'C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises.json',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'bodybuilding', 'exercises.json'),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function toItems(data) {
  if (Array.isArray(data)) return { items: data, meta: {} };
  if (data && typeof data === 'object') {
    for (const key of ['exercises', 'movements', 'items', 'list', 'data', 'records', 'harakat', 'results']) {
      if (Array.isArray(data[key])) return { items: data[key], meta: data };
    }
    const values = Object.values(data);
    if (values.length && values.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      return { items: Object.entries(data).map(([id, v]) => ({ id, ...v })), meta: {} };
    }
  }
  return null;
}

const isRichBank = items => items.length > 0 && items.filter(x => x && typeof x === 'object'
  && Number.isInteger(Number(x.id)) && (x.name_fa || x.name_en) && (x.category || x.categoryId)).length >= Math.ceil(items.length / 2);

const allowedDifficulty = new Set(['beginner', 'intermediate', 'advanced']);
const clean = (v, max) => String(v || '').trim().slice(0, max || 2000);
const joinList = v => Array.isArray(v) ? v.map(x => clean(x, 60)).filter(Boolean).join('، ').slice(0, 200) : clean(v, 200);

function ensureCategoriesFromFile(meta) {
  // دسته‌های نبود (مثل lats/trx) را از فایل بساز — idافعلاً معتبر: حروف لاتین/عدد/خط تیره
  const fromFile = Array.isArray(meta.categories) ? meta.categories : [];
  const existing = db.prepare('SELECT id FROM exercise_categories WHERE deleted_at IS NULL').all().map(r => r.id);
  const have = new Set(existing);
  const created = [];
  for (const c of fromFile) {
    const id = String(c && (c.id || c.slug) || '').trim();
    if (!id || !/^[a-z0-9_-]{2,30}$/i.test(id) || have.has(id)) continue;
    db.prepare(`INSERT INTO exercise_categories (id, name, sort_order, stable_id, version) VALUES (?,?,98,?,1)`)
      .run(id, clean(c.name_fa, 60) || id, crypto.randomUUID());
    have.add(id); created.push(`${id} (${clean(c.name_fa, 40)})`);
  }
  return created;
}

function runEnrich(items, meta, dryRun) {
  const created = dryRun ? [] : ensureCategoriesFromFile(meta);
  const byOrig = new Map(db.prepare('SELECT id, original_id FROM exercises WHERE deleted_at IS NULL').all()
    .filter(r => r.original_id != null).map(r => [Number(r.original_id), r.id]));
  const byName = new Map(db.prepare('SELECT id, name_fa FROM exercises WHERE deleted_at IS NULL').all()
    .map(r => [normalize(r.name_fa), r.id]));

  let enriched = 0, inserted = 0, noMatchInfo = [];
  const planUpdate = [], planInsert = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const name = clean(it.name_fa, 150);
    if (!name) continue;
    const numId = Number(it.id);
    const existingId = byOrig.get(numId) || byName.get(normalize(name));
    const equipment = joinList(it.equipment);
    const difficulty = allowedDifficulty.has(String(it.difficulty || '').toLowerCase()) ? String(it.difficulty).toLowerCase() : null;
    const nameEn = clean(it.name_en, 150) || null;
    const description = clean(it.description, 4000) || null;
    const videoPath = it.hasVideo !== false && (it.video || it.hasVideo === true)
      ? `/files/exercise/videos/${numId}.mp4` : null;
    if (existingId) {
      const sets = [];
      if (nameEn) sets.push(['name_en', nameEn]);
      if (equipment) sets.push(['equipment', equipment]);
      if (difficulty) sets.push(['difficulty', difficulty]);
      if (description) sets.push(['description', description]);
      if (videoPath) sets.push(['video_path', videoPath]);
      if (!sets.length) continue;
      enriched++;
      planUpdate.push({ id: existingId, name, sets });
    } else {
      inserted++;
      const loc = String(it.location || '').toLowerCase() === 'home' ? 'home' : String(it.location || '').toLowerCase() === 'gym' ? 'gym' : 'both';
      const cat = clean(it.category || it.categoryId, 30);
      planInsert.push({ original_id: Number.isInteger(numId) ? numId : null, name, location: loc, category_id: /^[a-z0-9_-]{2,30}$/i.test(cat) ? cat : null, equipment, difficulty, nameEn, description, videoPath });
    }
  }

  console.log(`📊 کل: ${items.length} | تغذیه حرکات موجود: ${enriched} | حرکت جدید: ${inserted}`);
  if (created.length) console.log(`🗂  دسته‌های جدید ساخته شد: ${created.join('، ')}`);
  if (dryRun) {
    planUpdate.slice(0, 5).forEach(p => console.log(`  ~ ${p.name} ← ${p.sets.map(s => s[0]).join('+')}`));
    planInsert.slice(0, 5).forEach(p => console.log(`  + ${p.name} [${p.location}/${p.category_id}]`));
    if (planUpdate.length + planInsert.length > 10) console.log(`  … و ${planUpdate.length + planInsert.length - 10} مورد دیگر`);
    console.log('(dry-run — چیزی ثبت نشد)'); return;
  }
  db.exec('BEGIN');
  try {
    const upd = db.prepare('UPDATE exercises SET name_en=?, equipment=?, difficulty=?, description=?, video_path=?, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE id=?');
    for (const p of planUpdate) {
      const map = Object.fromEntries(p.sets);
      upd.run(map.name_en || null, map.equipment || null, map.difficulty || null, map.description || null, map.video_path || null, p.id);
    }
    const customCat = planInsert.some(p => !p.category_id) ? ensureCategoriesFromFile({ categories: [{ id: 'custom', name_fa: 'حرکات شخصی' }] }) && 'custom' : null;
    const ins = db.prepare(`INSERT INTO exercises (original_id, name_fa, location, category_id, subcategory_id, status, priority, name_en, equipment, difficulty, description, video_path, stable_id, version)
                            VALUES (?,?,?,?,NULL,'active',5,?,?,?,?,?,?,1)`);
    for (const p of planInsert) ins.run(p.original_id, p.name, p.location, p.category_id || customCat || 'legs', p.nameEn, p.equipment || null, p.difficulty, p.description, p.videoPath, crypto.randomUUID());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('❌ خطا (rollback):', e.message); process.exit(1); }
  console.log(`✅ انجام شد: ${enriched} حرکت تغذیه شد (تجهیزات/سختی/توضیح/نام انگلیسی/ویدیو) و ${inserted} حرکت جدید ثبت شد.`);
  console.log('ℹ️  بدون ری‌استارت — جستجو و بانک فوراً به‌روزند. (نمایش equipment در درایور بانک فعال است)');
}

// ---------- حالت ساده (نسخه قبل) ----------
const nameFields = ['name_fa', 'nameFa', 'fa_name', 'title', 'name', 'label', 'نام', 'نام حرکت'];
const locationFields = ['location', 'محل', 'place'];
const categoryFields = ['category', 'category_id', 'cat', 'دسته', 'دسته‌بندی'];
const pick = (item, fields) => { for (const f of fields) if (item[f] !== undefined && item[f] !== null && String(item[f]).trim() !== '') return item[f]; return null; };
const mapLocation = raw => { const v = normalize(raw).toLowerCase(); if (!v) return 'both'; if (v.includes('منزل') || v === 'home') return 'home'; if (v.includes('باشگاه') || v === 'gym') return 'gym'; return 'both'; };

function runSimple(items, dryRun) {
  const existing = new Set(db.prepare('SELECT name_fa FROM exercises WHERE deleted_at IS NULL').all().map(r => normalize(r.name_fa)));
  const categories = db.prepare('SELECT id, name FROM exercise_categories WHERE deleted_at IS NULL').all();
  const catByNorm = new Map(categories.map(c => [normalize(c.name), c.id]));
  const plan = []; let dupe = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const name = String(pick(raw, nameFields) || '').trim();
    if (!name) continue;
    if (existing.has(normalize(name))) { dupe++; continue; }
    const loc = mapLocation(pick(raw, locationFields));
    const catRaw = String(pick(raw, categoryFields) || '').trim();
    const catNorm = normalize(catRaw);
    let catId = catByNorm.get(catNorm) || categories.find(c => c.id === catRaw)?.id || null;
    if (!catId && catNorm) { const hit = categories.find(c => { const n = normalize(c.name); return n.length >= 2 && (catNorm.includes(n) || n.includes(catNorm)); }); if (hit) catId = hit.id; }
    plan.push({ name, location: loc, category_id: catId });
    existing.add(normalize(name));
  }
  console.log(`📊 کل: ${items.length} | تکراری: ${dupe} | جدید: ${plan.length}`);
  if (!plan.length) { console.log('چیز جدیدی نیست ✅'); return; }
  if (dryRun) { plan.slice(0, 15).forEach(p => console.log(`  + ${p.name} [${p.location}]`)); console.log('(dry-run)'); return; }
  const fallback = ensureCategoriesFromFile({ categories: [{ id: 'custom', name_fa: 'حرکات شخصی' }] }) ? 'custom' : 'custom';
  const insert = db.prepare(`INSERT INTO exercises (name_fa, location, category_id, subcategory_id, status, priority, stable_id, version) VALUES (?,?,?,NULL,'active',5,?,1)`);
  db.exec('BEGIN');
  try { for (const p of plan) insert.run(p.name, p.location, p.category_id || fallback, crypto.randomUUID()); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); console.error('❌', e.message); process.exit(1); }
  console.log(`✅ ${plan.length} حرکت جدید ثبت شد.`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const explicit = args.find(a => !a.startsWith('--'));
  const input = resolveInput(explicit);
  if (!input) { console.error('❌ فایل پیدا نشد. مسیر بده:\n   node tool/import-custom-bank.js "C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises.json"'); process.exit(1); }
  console.log('📄 فایل:', input);
  let parsed; try {
    const raw = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''); // حذف BOM
    parsed = toItems(JSON.parse(raw));
  }
  catch (e) { console.error('❌ پارس JSON:', e.message); process.exit(1); }
  if (!parsed) { console.error('❌ ساختار شناسایی نشد'); process.exit(1); }
  if (isRichBank(parsed.items)) { console.log('🧠 حالت تغذیه (بانک غنی با شناسه/دسته) شناسایی شد'); runEnrich(parsed.items, parsed.meta, dryRun); }
  else { console.log('🧠 حالت درج ساده شناسایی شد'); runSimple(parsed.items, dryRun); }
}

try { main(); } finally { db.close(); }
