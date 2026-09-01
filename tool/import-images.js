#!/usr/bin/env node
/**
 * Import exercise images from organized folder to public/assets/images/exercises/imported
 * Flattens subfolders and copies all images
 * 
 * Usage:
 * node tool/import-images.js
 * node tool/import-images.js --src "C:\Users\MAHDI\Desktop\bodybuilding\exercises_organized" --dst "public\assets\images\exercises\imported"
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--src' && args[i+1]) opts.src = args[++i];
    if (args[i] === '--dst' && args[i+1]) opts.dst = args[++i];
  }
  return opts;
}

function findImagesRecursive(dir, exts = ['.png','.jpg','.jpeg','.gif','.webp']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (exts.includes(ext)) results.push(full);
        }
      }
    } catch (e) {}
  }
  return results;
}

function main() {
  const opts = parseArgs();
  const possibleSrc = [
    opts.src,
    path.join(__dirname, '..', 'exercises_organized'),
    'C:\\Users\\MAHDI\\Desktop\\bodybuilding\\exercises_organized',
    path.join(process.env.USERPROFILE || '', 'Desktop', 'bodybuilding', 'exercises_organized'),
    path.join(__dirname, '..', 'data-source', 'exercises_organized'),
    path.join(__dirname, '..', 'public', 'assets', 'images', 'exercises', 'organized')
  ].filter(Boolean);

  let src = null;
  for (const p of possibleSrc) {
    if (fs.existsSync(p)) { src = p; break; }
  }

  if (!src) {
    console.log('❌ Image source folder not found. Checked:');
    possibleSrc.forEach(p => console.log('  -', p));
    console.log('\nUsage: node tool/import-images.js --src "YOUR_PATH" --dst "public/assets/images/exercises/imported"');
    process.exit(1);
  }

  const dst = opts.dst || path.join(__dirname, '..', 'public', 'assets', 'images', 'exercises', 'imported');
  fs.mkdirSync(dst, { recursive: true });

  console.log(`📁 Source: ${src}`);
  console.log(`📁 Dest: ${dst}`);
  console.log('🔍 Scanning for images recursively...');

  const images = findImagesRecursive(src);
  console.log(`Found ${images.length} image files`);

  if (images.length === 0) {
    console.log('No images found. Checking source structure:');
    try {
      const top = fs.readdirSync(src);
      console.log('Top level:', top.slice(0, 20));
      const subDirs = fs.readdirSync(src, {withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
      console.log('Subdirectories:', subDirs.slice(0, 20));
      if (subDirs.length > 0) {
        const firstSub = path.join(src, subDirs[0]);
        console.log(`First subdir ${subDirs[0]} contents:`, fs.readdirSync(firstSub).slice(0, 20));
      }
    } catch(e){ console.log(e.message); }
    return;
  }

  // کپی با نام استاندارد {ID}.{ext} — تا مسیرهای استاتیکی برنامه (imported/4.png) پیدا کنند
  const opts2 = parseArgs();
  let copied = 0, skipped = 0, noId = 0;
  const seen = new Map();
  // اول: فایل‌هایی که با شناسه عددی شروع می‌شوند (مثل 4_پرس پا....png) اولویت دارند
  const withId = [], rest = [];
  for (const imgPath of images) {
    const m = /^(\d+)[_\- ]/.exec(path.basename(imgPath).replace(/\s/g, ' '));
    (m ? withId : rest).push({ imgPath, id: m ? m[1] : null });
  }
  for (const item of [...withId, ...rest]) {
    const ext = path.extname(item.imgPath).toLowerCase();
    const fileName = path.basename(item.imgPath);
    let targetName = fileName;
    if (item.id) {
      if (seen.has(item.id + ext)) { skipped++; continue; }
      seen.set(item.id + ext, true);
      targetName = item.id + ext;
    } else {
      const m2 = /^(\d+)/.exec(fileName);
      if (m2) { if (seen.has(m2[1] + ext)) { skipped++; continue; } seen.set(m2[1] + ext, true); targetName = m2[1] + ext; }
      else noId++;
    }
    if (noId > 0 && !item.id && !/^(\d+)/.test(fileName)) continue;
    const destPath = path.join(dst, targetName);
    if (!fs.existsSync(destPath)) {
      try {
        fs.copyFileSync(item.imgPath, destPath);
        copied++;
      } catch(e){
        console.log(`Error copying ${fileName}: ${e.message}`);
      }
    } else {
      skipped++;
    }
    if ((copied + skipped) % 500 === 0) {
      console.log(`Progress: ${copied + skipped}/${images.length} (copied: ${copied})`);
    }
  }

  console.log(`\n✅ Done! Copied: ${copied}, Skipped (already exists): ${skipped}`);
  const finalCount = fs.readdirSync(dst).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.png','.jpg','.jpeg','.gif','.webp'].includes(ext);
  }).length;
  console.log(`📊 Total images in ${dst}: ${finalCount}`);

  if (finalCount > 0) {
    console.log('\nSample images:');
    fs.readdirSync(dst).slice(0, 10).forEach(f => console.log('  -', f));
  }

  console.log('\n💡 Now restart server: node server.js or via launcher option 2');
}

main();
