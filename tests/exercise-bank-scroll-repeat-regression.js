#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const programBuilderSrc = fs.readFileSync(path.join(__dirname, '../public/program-builder.js'), 'utf8');
const builderCss = fs.readFileSync(path.join(__dirname, '../public/program-builder.css'), 'utf8');

// ─── 1. بانک حرکات باید اسکرول‌پذیر باشد — دکمهٔ «ثبت حرکت» نباید دیگر بریده شود ───
assert.match(builderCss, /#drawerTabAdd\{[^}]*overflow-y:auto/, 'the exercise-bank tab must scroll vertically instead of clipping content');
assert.doesNotMatch(builderCss, /#drawerTabAdd\{[^}]*overflow:hidden/, 'the exercise-bank tab must NOT keep the old overflow:hidden clip');
assert.match(builderCss, /#drawerTabAdd\{[^}]*overscroll-behavior:contain/, 'the exercise-bank scroll must not chain-scroll the page behind');

// ─── 2. با باز شدن «افزودن حرکت دستی»، ردیف «ثبت حرکت» باید داخل دید بیاید ───
assert.ok(programBuilderSrc.includes('function revealQuickAddActions'), 'the reveal helper must exist');
assert.match(programBuilderSrc, /getElementById\('quickAddName'\)\?\.focus\(\{preventScroll:true\}\)/, 'focus must not yank scroll away from the register row');
assert.match(programBuilderSrc, /querySelector\('\.quickadd-actions'\)/, 'the reveal helper must target the register-button row');
assert.match(programBuilderSrc, /tab\.scrollTo\(\{top:tab\.scrollTop\+delta/, 'the tab must be scrolled just enough to show the register button');

// ─── 3. دکمهٔ «＋ تکرار ست» کنار انتخابگر «ست‌های حرکت» بانک ───
assert.ok(programBuilderSrc.includes('id="drawerPresetRepeat"'), 'the repeat-set button must exist in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('＋ تکرار ست'), 'the repeat-set button must carry its Persian label');
assert.ok(programBuilderSrc.includes('id="drawerPresetNote"'), 'a live note must confirm what the repeat did');
const presetRowIdx = programBuilderSrc.indexOf('id="drawerPresetSelect"');
const repeatBtnIdx = programBuilderSrc.indexOf('id="drawerPresetRepeat"');
assert.ok(presetRowIdx > -1 && repeatBtnIdx > presetRowIdx, 'the repeat button must sit right after the preset select');

// ─── 4. منطق تکرار: ست آخر تکرار می‌شود + به حرکت‌های همین سیستم هم اعمال می‌شود ───
assert.ok(programBuilderSrc.includes('function repeatDrawerSet'), 'the repeat handler must exist');
assert.ok(programBuilderSrc.includes('let drawerPresetExtra'), 'repeat state must be tracked');
const repeatFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function repeatDrawerSet'),
  programBuilderSrc.indexOf('function findMatchingPresetIndex')
);
assert.ok(repeatFn.includes('movement_list'), 'repeating must also apply to movements already added to the active system');
assert.ok(repeatFn.includes('setHash:genHash()'), 'every repeated set must get a fresh setHash');
assert.ok(repeatFn.includes('setDirty(true)'), 'repeating existing sets must mark the program dirty');
assert.ok(programBuilderSrc.includes('function drawerBaseSpec'), 'the effective-spec helper must exist');
const setsFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function drawerBaseSpec'),
  programBuilderSrc.indexOf('function findMatchingPresetIndex')
);
assert.ok(setsFn.includes('drawerPresetExtra'), 'new movements must inherit the repeated sets too');

// ─── 5. ریست رفتار تکرار: با عوض کردن انتخابگر و با باز شدن دوبارهٔ بانک ───
assert.match(programBuilderSrc, /drawerPresetSelectEl\.onchange=resetDrawerPresetExtra/, 'changing the base preset must reset repeats');
const resetFlowFn = programBuilderSrc.slice(
  programBuilderSrc.indexOf('function resetDrawerBankFlow'),
  programBuilderSrc.indexOf('function mountExerciseDrawer')
);
assert.ok(resetFlowFn.includes('resetDrawerPresetExtra()'), 'reopening the bank must reset repeats');
assert.match(programBuilderSrc, /presetRepeatButton\.onclick=repeatDrawerSet/, 'the repeat button must be wired to its handler');

// ─── 6. سازگاری با رفتار قبلی بانک (invariantهای تست movement-dialog) ───
assert.ok(programBuilderSrc.includes('id="drawerSetPreset"'), 'the sets bar must stay in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('<option value="">۱ × ۱۲ (پیش‌فرض)</option>'), 'the explicit default option must stay');
assert.ok(programBuilderSrc.indexOf('id="drawerQuickAdd"') < programBuilderSrc.indexOf('id="drawerSetPreset"'), 'the sets bar must stay below the manual-add panel');
assert.equal((programBuilderSrc.match(/setsForNewMovement\(\)/g) || []).length, 3, 'both add paths (manual add + bank pick) must still take their sets from the picker');
assert.ok(programBuilderSrc.includes('presetBar.hidden=false'), 'the sets bar must still become visible while a system is being filled');

// ─── 7. استایل دکمهٔ تکرار — هدف لمسی واقعی، در موبایل هم تمام‌عرض ───
assert.match(builderCss, /\.drawer-preset-row \{[^}]*display: flex/, 'the select + repeat button must sit in one row on desktop');
assert.match(builderCss, /\.drawer-preset-repeat \{[^}]*min-height: var\(--component-control-height\)/, 'the repeat button must be a real tap target');
assert.match(builderCss, /\.drawer-preset-note \{[^}]*color: var\(--success\)/, 'the confirmation note must use the success color');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.drawer-preset-repeat \{ width: 100%; min-height: 46px/, 'the repeat button must go full-width on phones');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.drawer-preset-row \{ flex-direction: column/, 'the row must stack on phones');
assert.doesNotMatch(builderCss, /!important/, 'no !important overrides');

console.log(JSON.stringify({
  ok: true,
  bank_scrollable: true,
  quickadd_submit_revealed: true,
  repeat_set_button: true,
  repeat_applies_to_current_system: true,
  repeat_state_reset: true,
  legacy_invariants_kept: true,
  mobile_full_width: true
}));
