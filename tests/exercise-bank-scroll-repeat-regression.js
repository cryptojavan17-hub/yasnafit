#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const programBuilderSrc = fs.readFileSync(path.join(__dirname, '../public/program-builder.js'), 'utf8');
const builderCss = fs.readFileSync(path.join(__dirname, '../public/program-builder.css'), 'utf8');
const slice = (start, end) => programBuilderSrc.slice(programBuilderSrc.indexOf(start), programBuilderSrc.indexOf(end));

// ─── 1. بانک حرکات باید اسکرول‌پذیر باشد — دکمهٔ «ثبت حرکت» نباید دیگر بریده شود ───
assert.match(builderCss, /#drawerTabAdd\{[^}]*overflow-y:auto/, 'the exercise-bank tab must scroll vertically instead of clipping content');
assert.doesNotMatch(builderCss, /#drawerTabAdd\{[^}]*overflow:hidden/, 'the exercise-bank tab must NOT keep the old overflow:hidden clip');
assert.match(builderCss, /#drawerTabAdd\{[^}]*overscroll-behavior:contain/, 'the exercise-bank scroll must not chain-scroll the page behind');

// ─── 2. با باز شدن «افزودن حرکت تمرینی»، پنل «افزودن حرکت دستی» باید خودکار باز شود ───
assert.ok(programBuilderSrc.includes('function revealQuickAddActions'), 'the reveal helper must exist');
assert.match(programBuilderSrc, /getElementById\('quickAddName'\)\?\.focus\(\{preventScroll:true\}\)/, 'focus must not yank scroll away from the register row');
assert.match(programBuilderSrc, /resetDrawerBankFlow\(\);drawer\.classList\.add\('open'\);refreshDrawerContext\(\);\s*\n\s*\/\/ با «افزودن حرکت تمرینی»/, 'opening the bank must lead straight into the manual-add flow');
assert.match(programBuilderSrc, /toggleQuickAddPanel\(true\);/, 'the manual-add panel must auto-open with the bank');

// ─── 3. «ست‌های حرکت» اکاردیونی است: با باز شدن بانک پنهان، بعد از ثبت حرکت دستی آشکار ───
assert.ok(programBuilderSrc.includes('id="drawerSetPresetToggle"'), 'the sets accordion must have a header toggle');
assert.ok(programBuilderSrc.includes('id="drawerSetPresetBody"'), 'the sets accordion must have a collapsible body');
assert.ok(programBuilderSrc.includes('let drawerSetsRevealed'), 'the reveal state must be tracked');
assert.doesNotMatch(programBuilderSrc, /presetBar\.hidden=false/, 'the accordion must NOT auto-show while a system is being filled');
const refreshCtxFn = slice('function refreshDrawerContext', 'function openExerciseDrawer');
assert.match(refreshCtxFn, /presetBar\.hidden=!drawerSetsRevealed/, 'the accordion stays hidden until a manual add reveals it');
const submitFn = slice('async function submitQuickAddExercise', 'function refreshDrawerContext');
assert.ok(submitFn.includes('revealDrawerSets(true)'), 'registering a manual movement must reveal AND expand the accordion');
assert.ok(submitFn.includes('sets:[]'), 'a manually registered movement must start with NO sets so choosing them becomes mandatory');
assert.ok(programBuilderSrc.includes('function revealDrawerSets'), 'the reveal helper must exist');
const revealFn = slice('function revealDrawerSets', 'function removeDrawerSetAtIndex');
assert.ok(revealFn.includes('scrollIntoView'), 'the revealed accordion must scroll into view');
const resetFlowFn = slice('function resetDrawerBankFlow', 'function mountExerciseDrawer');
assert.ok(resetFlowFn.includes('drawerSetsRevealed=false'), 'reopening the bank must re-hide the accordion');

// ─── 4. اجباری بودن انتخاب ست‌ها: با حرکتِ بدون ست، بانک بسته نمی‌شود ───
assert.ok(programBuilderSrc.includes('function activeSystemHasEmptySets'), 'the empty-sets guard must exist');
const closeFn = slice('function closeDrawer', 'async function selectDrawerLocation');
assert.ok(closeFn.includes('activeSystemHasEmptySets()'), 'closing the bank with a setless movement must be blocked');
assert.ok(closeFn.includes("classList.add('flash')"), 'the blocked close must shake the accordion for attention');
assert.match(programBuilderSrc, /note\.classList\.toggle\('warn',count===0\)/, 'the note must switch to a warning while sets are missing');

// ─── 5. مربع‌های کوچک ست: نمایش + افزودن/حذف راحت ───
assert.ok(programBuilderSrc.includes('id="drawerSetChips"'), 'the set-chips host must exist in the accordion');
assert.ok(programBuilderSrc.includes('function renderDrawerSetChips'), 'the chips renderer must exist');
assert.ok(programBuilderSrc.includes('data-chip-del'), 'every set square must have a remove control');
assert.ok(programBuilderSrc.includes('data-chip-add'), 'an add square must sit next to the sets');
assert.ok(programBuilderSrc.includes('function removeDrawerSetAtIndex'), 'removing a square must splice that set index');
assert.match(programBuilderSrc, /drawerSetChipsHost\.onclick=event=>/, 'the chips host must handle taps via delegation');
assert.ok(programBuilderSrc.includes("closest('[data-chip-add]'))repeatDrawerSet()"), 'the add square must reuse the repeat-set logic');
assert.ok(programBuilderSrc.includes('id="drawerSetPresetSummary"'), 'the accordion header must show a live sets summary');

// ─── 6. دکمهٔ «＋ تکرار ست» کنار انتخابگر «ست‌های حرکت» ───
assert.ok(programBuilderSrc.includes('id="drawerPresetRepeat"'), 'the repeat-set button must exist in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('＋ تکرار ست'), 'the repeat-set button must carry its Persian label');
const presetRowIdx = programBuilderSrc.indexOf('id="drawerPresetSelect"');
const repeatBtnIdx = programBuilderSrc.indexOf('id="drawerPresetRepeat"');
assert.ok(presetRowIdx > -1 && repeatBtnIdx > presetRowIdx, 'the repeat button must sit right after the preset select');
assert.ok(programBuilderSrc.includes('function repeatDrawerSet'), 'the repeat handler must exist');
assert.ok(programBuilderSrc.includes('let drawerPresetExtra'), 'repeat state must be tracked');
const repeatFn = slice('function repeatDrawerSet', 'function findMatchingPresetIndex');
assert.ok(repeatFn.includes('movement_list'), 'repeating must also apply to movements already added to the active system');
assert.ok(repeatFn.includes('setHash:genHash()'), 'every repeated set must get a fresh setHash');
assert.ok(repeatFn.includes('setDirty(true)'), 'repeating existing sets must mark the program dirty');
assert.ok(programBuilderSrc.includes('function drawerBaseSpec'), 'the effective-spec helper must exist');
const setsFn = slice('function drawerBaseSpec', 'function findMatchingPresetIndex');
assert.ok(setsFn.includes('drawerPresetExtra'), 'new movements must inherit the repeated sets too');

// ─── 7. انتخاب پیشنهاد ست، روی همهٔ حرکات همین سیستم هم اعمال می‌شود ───
assert.ok(programBuilderSrc.includes('function applyDrawerPresetToAll'), 'preset-to-all helper must exist');
assert.match(programBuilderSrc, /if\(preset&&drawerSetsRevealed\)\{\s*applyDrawerPresetToAll\(preset\);/, 'choosing a preset while revealed must apply to current movements');
assert.match(programBuilderSrc, /drawerPresetSelectEl\.onchange=/, 'changing the base preset must reset repeats');

// ─── 8. استایل: منوی نرم و روان + مربع‌های لمسی ───
assert.match(builderCss, /\.drawer-setpreset-body \{[^}]*grid-template-rows: 0fr/, 'the accordion must collapse via grid rows');
assert.match(builderCss, /\.drawer-setpreset\.open \.drawer-setpreset-body \{[^}]*grid-template-rows: 1fr/, 'the accordion must expand smoothly');
assert.match(builderCss, /\.drawer-setpreset-body \{[^}]*transition: grid-template-rows \.3s ease/, 'the expand/collapse must animate');
assert.match(builderCss, /@keyframes accordionIn/, 'the accordion reveal must have an entrance animation');
assert.match(builderCss, /@keyframes chipIn/, 'set squares must pop in');
assert.match(builderCss, /@keyframes setShake/, 'the accordion must have a shake for the mandatory warning');
assert.match(builderCss, /\.drawer-set-chip \{[^}]*min-height: 58px/, 'set squares must be real tap targets');
assert.match(builderCss, /\.drawer-set-chip-del \{[^}]*width: 20px/, 'each square needs its own small remove button');
assert.match(builderCss, /\.drawer-set-chip-add \{[^}]*cursor: pointer/, 'the add square must be clickable');
assert.match(builderCss, /\.drawer-preset-note\.warn \{[^}]*color: var\(--danger\)/, 'the mandatory note must read as a warning');
assert.match(builderCss, /@media \(prefers-reduced-motion: reduce\)/, 'animations must respect reduced motion');
assert.match(builderCss, /\.drawer-preset-row \{[^}]*display: flex/, 'the select + repeat button must sit in one row on desktop');
assert.match(builderCss, /\.drawer-preset-repeat \{[^}]*min-height: var\(--component-control-height\)/, 'the repeat button must be a real tap target');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.drawer-preset-repeat \{ width: 100%; min-height: 46px/, 'the repeat button must go full-width on phones');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.drawer-preset-row \{ flex-direction: column/, 'the row must stack on phones');
assert.doesNotMatch(builderCss, /!important/, 'no !important overrides');

// ─── 9. سازگاری با رفتار قبلی بانک (invariantهای تست movement-dialog) ───
assert.ok(programBuilderSrc.includes('id="drawerSetPreset"'), 'the sets bar must stay in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('<option value="">۱ × ۱۲ (پیش‌فرض)</option>'), 'the explicit default option must stay');
assert.ok(programBuilderSrc.indexOf('id="drawerQuickAdd"') < programBuilderSrc.indexOf('id="drawerSetPreset"'), 'the sets bar must stay below the manual-add panel');
assert.equal((programBuilderSrc.match(/setsForNewMovement\(\)/g) || []).length, 2, 'bank picks must still take their sets from the picker (manual add goes through the mandatory sets accordion)');

console.log(JSON.stringify({
  ok: true,
  bank_scrollable: true,
  manual_add_opens_with_bank: true,
  sets_accordion_hidden_until_manual_add: true,
  sets_selection_mandatory: true,
  set_chips_add_remove: true,
  repeat_set_button: true,
  preset_applies_to_current_system: true,
  smooth_animations: true,
  legacy_invariants_kept: true
}));
