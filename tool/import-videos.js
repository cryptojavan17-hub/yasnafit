#!/usr/bin/env node
/**
 * اتصال ویدیوهای آموزشی حرکات به YasnaFit
 * ویدیوهای «[ID]_[نام].mp4» از پوشه سازمان‌یافته شما را پیدا کرده،
 * به نام {ID}.mp4 تبدیل و در public/assets/videos/exercises کپی می‌کند
 * (همان مسیری که سرور برای /files/exercise/videos/{id}.mp4 سرو می‌کند — gitignore).
 *
 * استفاده:
 *   node tool/import-videos.js
 *   node tool/import-videos.js --src "C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized"
 *   node tool/import-videos.js --force     (بازنویسی فایل‌های موجود)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2); const opts = { force: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--src' && args[i + 1]) opts.src = args[++i];
    if (args[i] === '--dst' && args[i + 1]) opts.dst = args[++i];
    if (args[i] === '--force') opts.force = true;
  }
  return opts;
}

function findVideosRecursive(dir) {
  const out = []; if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    try {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.mp4') out.push(full);
      }
    } catch (e) {}
  }
  return out;
}

function main() {
  const opts = parseArgs();
  const src = [
    opts.src,
    path.join(root, 'data-source', 'exercises_organized'),
    'C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises_organized',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'bodybuilding', 'exercises_organized'),
  ].filter(Boolean).find(p => fs.existsSync(p));
  const dst = opts.dst || path.join(root, 'public', 'assets', 'videos', 'exercises');
  if (!src) { console.error('❌ پوشه ویدیوها پیدا نشد. با --src مسیر بده:\n   node tool/import-videos.js --src "C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises_organized"'); process.exit(1); }

  const files = findVideosRecursive(src);
  if (!files.length) { console.error('❌ هیچ فایل mp4 پیدا نشد در:', src); process.exit(1); }
  fs.mkdirSync(dst, { recursive: true });

  let copied = 0, skipped = 0, noId = 0;
  const idSeen = new Map();
  for (const file of files) {
    const base = path.basename(file);
    const m = /^(\d+)/.exec(base.replace(/\s/g, ''));
    if (!m) { noId++; continue; }
    const id = m[1];
    if (idSeen.has(id)) continue; // اولین فایل هر شناسه کافی است
    idSeen.set(id, file);
    const target = path.join(dst, `${id}.mp4`);
    if (fs.existsSync(target) && !opts.force) { skipped++; continue; }
    fs.copyFileSync(file, target);
    copied++;
  }
  console.log(`🎬 منبع: ${src}`);
  console.log(`📊 کل mp4: ${files.length} | کپی شد: ${copied} | از قبل بود (رد شد): ${skipped} | بدون شناسه عددی: ${noId}`);
  console.log(`📁 مقصد: ${dst}  ← سرور از /files/exercise/videos/{id}.mp4 سرو می‌کند (بدون ری‌استارت).`);
  console.log('ℹ️  این پوشه gitignore است — حجم مخزن تغییر نمی‌کند.');
}

main();
