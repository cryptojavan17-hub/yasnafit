#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const programBuilderSrc = fs.readFileSync(path.join(__dirname, '../public/program-builder.js'), 'utf8');
const builderCss = fs.readFileSync(path.join(__dirname, '../public/program-builder.css'), 'utf8');

// ─── 1. مربع انتخاب کنار هر حرکت ───
assert.ok(programBuilderSrc.includes('data-pick-mov'), 'every movement card must expose a selection checkbox');
assert.ok(programBuilderSrc.includes('class="mov-pick"'), 'the checkbox must be wrapped in a tappable label');
assert.ok(programBuilderSrc.includes('const selectedMovements=new Set()'), 'selection state must be tracked per movement key');

// ─── 2. نوار تبدیل پایین صفحه + منوی کشویی ───
assert.ok(programBuilderSrc.includes('id="convertBar"'), 'the convert bar must exist');
assert.ok(programBuilderSrc.includes('id="convertCount"'), 'the convert bar must show the live selection count');
assert.ok(programBuilderSrc.includes('🔁 تبدیل به سیستم تمرینی'), 'the convert bar must carry its dropdown button');
assert.ok(programBuilderSrc.includes('data-convert-to'), 'the menu must offer conversion to every system type');
assert.ok(programBuilderSrc.includes('data-split-normal'), 'the menu must offer splitting back to normal movements');
assert.ok(programBuilderSrc.includes('↩️ تفکیک به حرکات معمولی'), 'the split action must carry its Persian label');
assert.match(programBuilderSrc, /systemTypes\.map\(t=>`<button type="button" data-convert-to/, 'the menu must be built from the systemTypes catalog so new types appear automatically');

// ─── 3. منطق تبدیل: ادغام دقیق، هشدار تعداد ناساز، تفکیک ───
assert.ok(programBuilderSrc.includes('function convertSelection'), 'the merge-conversion handler must exist');
assert.ok(programBuilderSrc.includes('function splitSelectionToNormal'), 'the split handler must exist');
assert.ok(programBuilderSrc.includes('function selectionComplete'), 'partial group selections must be detected');
assert.ok(programBuilderSrc.includes('function splitAllowed'), 'split availability must be computed');
assert.ok(programBuilderSrc.includes('function updateConvertBar'), 'the bar must update live when checkboxes change');
const convertFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function convertSelection'),
  programBuilderSrc.indexOf('function splitSelectionToNormal')
);
assert.ok(convertFn.includes('target.movements!==total'), 'conversion must enforce the exact movement count');
assert.ok(convertFn.includes("alert(`«${target.label}» دقیقاً"), 'a count mismatch must warn with the system name');
assert.ok(convertFn.includes("{exercise_system_id:target.id,system_type:target.type,movement_list:merged}"), 'merging must create a proper system-group entry');
assert.ok(convertFn.includes('setDirty(true)'), 'conversion must mark the program dirty');
const splitFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function splitSelectionToNormal'),
  programBuilderSrc.indexOf('function activeSystemIncomplete')
);
assert.ok(splitFn.includes("{exercise_system_id:1,system_type:'normal',movement_list:[mov]}"), 'splitting must yield one normal system per movement');

// ─── 4. اتصال بصری گروه (براکت) + بج گروه + انیمیشن ───
assert.ok(programBuilderSrc.includes("'grouped':''"), 'multi-movement systems must render with the grouped class');
assert.ok(programBuilderSrc.includes('sys-group-badge'), 'a group badge must show the system label on the group');
assert.ok(programBuilderSrc.includes('sys-flash'), 'converted systems must get a soft flash animation');
assert.match(builderCss, /\.system-card\.grouped::before \{[^}]*border: 2px solid var\(--accent\)/, 'the group connector bracket must be drawn with the accent color');
assert.match(builderCss, /\.system-card\.grouped::before \{[^}]*border-radius: 10px 0 0 10px/, 'the bracket must have rounded caps like the reference design');
assert.match(builderCss, /\.sys-group-badge \{[^}]*border-radius: 999px/, 'the group badge must be a rounded blue pill');
assert.match(builderCss, /\.convert-bar \{[^}]*position: sticky/, 'the convert bar must stick to the bottom of the view');
assert.match(builderCss, /\.mov-pick input \{[^}]*accent-color: var\(--accent\)/, 'checkboxes must use the panel accent');
assert.match(builderCss, /@keyframes sysFlash/, 'the conversion flash must be animated');
assert.match(builderCss, /@media \(max-width: 800px\) \{[^}]*\.system-card\.grouped \{ margin-right: 10px/, 'the bracket must stay responsive on phones');
assert.doesNotMatch(builderCss, /!important/, 'no !important overrides');

// ─── 5. اجبار ثبت کامل سیستم چندحرکته ───
assert.ok(programBuilderSrc.includes('function activeSystemIncomplete'), 'the partial-multi-system detector must exist');
const closeFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function closeDrawer'),
  programBuilderSrc.indexOf('  async function selectDrawerLocation')
);
assert.ok(closeFn.includes('activeSystemIncomplete()'), 'closing the bank must be blocked while a multi system is incomplete');
assert.ok(closeFn.includes('باقیمانده را از بانک اضافه کنید'), 'the blocker must explain what is missing');
const commitFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf("const setsCommitButton=document.getElementById('drawerSetsCommit');"),
  programBuilderSrc.indexOf("button.onclick=()=>selectDrawerLocation")
);
assert.ok(commitFn.includes('activeSystemIncomplete()'), 'committing must also be blocked while a multi system is incomplete');

console.log(JSON.stringify({
  ok: true,
  movement_checkboxes: true,
  convert_bar_menu: true,
  catalog_driven_convert_menu: true,
  exact_count_merge_and_split: true,
  group_bracket_and_badge: true,
  partial_multi_system_blocked: true,
  responsive_bracket: true
}));
