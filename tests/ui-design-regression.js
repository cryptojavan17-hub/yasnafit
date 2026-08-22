#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const cssFiles=['styles.css','dark-theme.css','exercises.css','program-builder.css','student-portal.css','releases.css','students.css'];
const css=Object.fromEntries(cssFiles.map(file=>[file,fs.readFileSync(path.join(publicDir,file),'utf8')]));

for(const token of ['--bg: #050505','--surface: #101010','--glass: rgba(255, 255, 255, .045)','--border: rgba(255, 255, 255, .085)','--text: #fff','--radius-lg: 16px','--transition: 180ms ease']){
  assert.ok(css['styles.css'].includes(token),`missing central design token: ${token}`);
}
assert.doesNotMatch(Object.values(css).join('\n'),/!important/i,'CSS architecture regressed to !important overrides');
assert.doesNotMatch(Object.values(css).join('\n'),/background(?:-color)?\s*:\s*(?:#fff(?:fff)?|white)\b/i,'pure white component background found');
assert.doesNotMatch(Object.values(css).join('\n'),/#(?:22c55e|4aaf29|4dc224|70d947|369b18|e0f2fe|e9f7e4|fffbeb|f6fff3|efe8ff|e8f2ff)/i,'legacy colorful palette found');

const requiredSelectors={
  'styles.css':['.sidebar {','.topbar {','.stat-grid {','.table-wrap {','.modal {','input:focus'],
  'exercises.css':['.exercise-card {','.exercise-card.selected-card','.image-wrap {'],
  'program-builder.css':['.day-card {','.system-card {','.movement-card {','.set-row {','.drawer-panel {'],
  'student-portal.css':['.student-portal {','.sp-card {','.photo-upload-box {'],
  'students.css':['.students-panel, .detail-section {','.students-table-wrap {','.student-modal {'],
  'releases.css':['.release-card {','.current-version-box {']
};
for(const [file,selectors] of Object.entries(requiredSelectors)) for(const selector of selectors){
  assert.ok(css[file].includes(selector),`${file} missing redesigned selector ${selector}`);
}

const inlineSources=['core.js','coach-submissions.js','program-builder.js','student-portal.js','students.js','exercises.js'].map(file=>fs.readFileSync(path.join(publicDir,file),'utf8')).join('\n');
assert.doesNotMatch(inlineSources,/background\s*:\s*#(?:fff(?:fff)?|f[0-9a-f]{5}|e[0-9a-f]{5})/i,'light inline background can override dark theme');
assert.doesNotMatch(inlineSources,/var\(--[^)]+\)[0-9a-f]+/i,'malformed CSS variable found in inline styles');

const index=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
let previous=-1;
for(const file of cssFiles){
  const current=index.indexOf(`/${file}`);
  assert.ok(current>previous,`stylesheet order is wrong at ${file}`);
  previous=current;
}
console.log(JSON.stringify({ok:true,css_files:cssFiles.length,tokens:true,no_light_overrides:true,no_colorful_legacy_palette:true,components:true,stylesheet_order:true}));
