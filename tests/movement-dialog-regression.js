#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const programBuilderSrc = fs.readFileSync(path.join(__dirname, '../public/program-builder.js'), 'utf8');

// 1. Verify exact 15 preset labels in exact order and format
const expectedPresets = [
  '۴ * ۱۰',
  '۳ * ۸',
  '۴ * ۱۵',
  '۱۲ | ۱۰ | ۸',
  '۲ * ۱۵ | ۱۵ | ۱۵ ثانیه',
  '۱۲ | ۱۰ | ۸ | ۶',
  '۶ | ۸ | ۱۰ | ۱۲',
  '۳ * ۹ | ۱۱',
  '۳ * ۸ | ماکسیمم توان',
  '۳ * ۱۲ | ماکسیمم توان',
  '۸ | ۱۰ | ۱۲ | ماکسیمم توان',
  '۲۵ | ۲ * ۸ | ۲ * ۱۲',
  '۲۵ | ۳ * ۱۵',
  '۲ * ۸ | ۲ * ۱۲',
  '۲ * ۱۲ | ۲ * ۱۵'
];

expectedPresets.forEach(label => {
  assert.ok(programBuilderSrc.includes(`label: '${label}'`), `Preset label missing: ${label}`);
});

// 2. Verify all 5 set units
const expectedUnits = ['تکرار', 'ثانیه', 'دقیقه', 'دراپ ست', 'ماکسیمم توان'];
expectedUnits.forEach(unit => {
  assert.ok(programBuilderSrc.includes(`label: '${unit}'`) || programBuilderSrc.includes(`>${unit}<`), `Set unit missing: ${unit}`);
});

// 3. Verify removal of old details (mv-equipment, mv-en, etc.)
assert.doesNotMatch(programBuilderSrc, /class="mv-equipment"/, 'mv-equipment must be removed');
assert.doesNotMatch(programBuilderSrc, /class="mv-en"/, 'mv-en must be removed');
assert.doesNotMatch(programBuilderSrc, /class="mv-tag"/, 'mv-tag in movement modal must be removed');

// 4. Verify required fields & elements
assert.ok(programBuilderSrc.includes('id="mvName"'), 'Movement name input field must exist');
assert.ok(programBuilderSrc.includes('id="mvDesc"'), 'Description field must exist');
assert.ok(programBuilderSrc.includes('id="mvPresetSelect"'), 'Suggested sets dropdown must exist');
assert.ok(programBuilderSrc.includes('id="mvAddSet"'), 'Add new set button must exist');
assert.ok(programBuilderSrc.includes('data-mv-del'), 'Delete set button must exist');
assert.ok(programBuilderSrc.includes('data-mv-unit'), 'Unit select must exist');
assert.ok(programBuilderSrc.includes('data-mv-count'), 'Count input must exist');

// 5. Target-muscle UI removed by owner decision (2026-09-08) — data + video must survive
assert.doesNotMatch(programBuilderSrc, /class="mv-anatomy"/, 'the target-muscle anatomy block must stay removed from the movement form (owner decision 2026-09-08)');
assert.doesNotMatch(programBuilderSrc, /front_grey_body\.webp|back_grey_body\.webp/, 'coach-side body figures must stay removed');
assert.doesNotMatch(programBuilderSrc, /quickAddMuscleSelect|quickAddSelectedMuscles|renderQuickAddMuscles/, 'the manual-add target-muscle picker must stay removed');
assert.ok(programBuilderSrc.includes('muscleCatalog'), 'the muscle catalog must stay — it still feeds mov.target_muscles for the PDF and the student panel');
assert.ok(programBuilderSrc.includes('mov.target_muscles=activeMuscleIds'), 'target_muscles data must still be attached to the movement');
assert.ok(programBuilderSrc.includes('class="mv-video"'), 'Video section must exist');
assert.ok(programBuilderSrc.includes('id="mvConfirm"'), 'Confirm button must exist');
assert.ok(programBuilderSrc.includes('id="mvClose"'), 'Close button must exist');
assert.doesNotMatch(programBuilderSrc, /id="mvMuscleQuickSelect"/, 'Muscle menu list must be removed');

// the catalog itself stays complete: the student panel and the PDF still render these overlays
const expectedMuscles = [
  // Front
  'front_deltoid_anterior.webp',
  'front_deltoid_lateral.webp',
  'front_chest.webp',
  'front_biceps.webp',
  'front_brachialis.webp',
  'front_brachioradialis.webp',
  'front_rectus_abdominis.webp',
  'front_obliques.webp',
  'front_serratus_anterior.webp',
  'front_quadriceps.webp',
  'front_iliopsoas.webp',
  // Back
  'back_trapezius.webp',
  'back_latissimus_dorsi.webp',
  'back_triceps.webp',
  'back_teres_major.webp',
  'back_teres_minor.webp',
  'back_infraspinatus.webp',
  'back_gluteus_maximus.webp',
  'back_hamstrings.webp',
  'back_gastrocnemius.webp',
  'back_soleus.webp'
];

expectedMuscles.forEach(file => {
  assert.ok(programBuilderSrc.includes(file), `Muscle catalog entry missing: ${file}`);
});

// 6. Sets picker now lives under the manual-add panel and auto-applies to new movements
const builderCss = fs.readFileSync(path.join(__dirname, '../public/program-builder.css'), 'utf8');
assert.ok(programBuilderSrc.includes('id="drawerSetPreset"'), 'the sets bar must exist in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('id="drawerPresetSelect"'), 'the sets preset select must exist in the exercise-bank drawer');
assert.ok(programBuilderSrc.includes('<option value="">۱ × ۱۲ (پیش‌فرض)</option>'), 'the sets picker must keep an explicit default option');
const quickAddIdx = programBuilderSrc.indexOf('id="drawerQuickAdd"');
const setsBarIdx = programBuilderSrc.indexOf('id="drawerSetPreset"');
assert.ok(quickAddIdx > -1 && setsBarIdx > quickAddIdx, 'the sets bar must be rendered BELOW the manual-add panel');
assert.ok(programBuilderSrc.includes('function setsForNewMovement'), 'the auto-apply helper must exist');
assert.equal((programBuilderSrc.match(/setsForNewMovement\(\)/g) || []).length, 3, 'both add paths (manual add + bank pick) must take their sets from the picker');
assert.ok(programBuilderSrc.includes('presetBar.hidden=false'), 'the sets bar must become visible while a system is being filled');

// 7. Manual-add panel must be readable and tappable (owner: "usually not visible, painful on mobile")
assert.match(builderCss, /\.quickadd-submit \{[^}]*min-height: var\(--component-control-height\)/, 'the register button must use the shared control height');
assert.match(builderCss, /\.quickadd-grid input, \.quickadd-grid select \{[^}]*min-height: var\(--component-control-height\)[^}]*font-size: 13px/, 'manual-add inputs must be readable');
assert.match(builderCss, /\.quickadd-head > b \{ font-size: 1[3-9]px/, 'the manual-add title must not stay at 10px');
assert.match(builderCss, /\.quickadd-hint \{[^}]*font-size: 1[1-9]px/, 'the hint text must not stay at 8px');
assert.match(builderCss, /\.drawer-manual-toggle \{[^}]*min-height: var\(--component-control-height\)/, 'the manual-add toggle must be a real tap target');
assert.match(builderCss, /\.drawer-preset-select \{[^}]*min-height: var\(--component-control-height\)/, 'the sets picker must be a real tap target');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.quickadd-submit \{ width: 100%; min-height: 46px/, 'the register button must go full-width on phones');
assert.doesNotMatch(builderCss, /\.mv-anatomy/, 'dead anatomy CSS must be gone');
assert.doesNotMatch(builderCss, /!important/, 'no !important overrides');

// 8. Task 27 — the exercise-bank drawer must scroll as ONE container (owner: "کشوی بانک حرکات اسکرول نمی‌شود")
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert.match(builderCss, /#drawerTabAdd\{flex:1;min-height:0;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;padding-bottom:calc\(10px \+ env\(safe-area-inset-bottom,0px\)\)\}/, 'the add tab must be the single scroll container with contained overscroll and safe-area padding');
assert.match(builderCss, /\.drawer-bank-flow\{position:sticky;top:0;z-index:4;flex:0 1 auto;max-height:min\(46vh,380px\);overflow-y:auto\}/, 'the bank flow (location + filters) must stay sticky with its own bounded scroll');
assert.match(builderCss, /\.drawer-list\{min-height:120px;flex:1 0 auto;overflow:visible\}/, 'the result list must grow inside the tab instead of nesting a second scrollbar');
assert.match(builderCss, /body\.drawer-open\{overflow:hidden\}/, 'the page behind the drawer must be locked while the bank is open');
assert.match(builderCss, /@media \(max-width: 640px\) \{[\s\S]*?\.drawer-bank-flow \{ max-height: min\(42vh, 320px\); \}/, 'phones must shrink the sticky bank flow so results stay reachable');
assert.match(programBuilderSrc, /tab\.scrollTop=0;/, 'reopening the bank must start from the top of the tab');
assert.match(programBuilderSrc, /document\.body\?\.classList\?\.add\('drawer-open'\)/, 'opening the bank must lock the page scroll');
assert.match(programBuilderSrc, /document\.body\?\.classList\?\.remove\('drawer-open'\)/, 'closing the bank must release the page scroll');
assert.match(programBuilderSrc, /panel\.scrollIntoView\(\{block:'start',inline:'nearest',behavior:'smooth'\}\)/, 'the manual-add panel must be scrolled into view inside the drawer');
assert.match(programBuilderSrc, /focus\(\{preventScroll:true\}\)/, 'focusing the manual-add name field must not yank the page');
assert.match(indexHtml, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover, interactive-widget=resizes-content" \/>/, 'the coach shell viewport must keep the drawer usable when the mobile keyboard opens');

console.log(JSON.stringify({
  ok: true,
  presets_count: expectedPresets.length,
  units_count: expectedUnits.length,
  muscles_catalog_count: expectedMuscles.length,
  top_cleaned: true,
  cards_configured: true,
  target_muscle_ui_removed: true,
  target_muscle_data_preserved: true,
  sets_picker_under_manual_add: true,
  manual_add_mobile_readable: true,
  drawer_scroll_single_container: true,
  bottom_preserved: true
}));
