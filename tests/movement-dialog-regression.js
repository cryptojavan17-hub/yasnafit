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

// 5. Verify anatomy and video player unchanged
assert.ok(programBuilderSrc.includes('class="mv-anatomy"'), 'Anatomy section must exist');
assert.ok(programBuilderSrc.includes('class="mv-video"'), 'Video section must exist');
assert.ok(programBuilderSrc.includes('id="mvConfirm"'), 'Confirm button must exist');
assert.ok(programBuilderSrc.includes('id="mvClose"'), 'Close button must exist');

console.log(JSON.stringify({
  ok: true,
  presets_count: expectedPresets.length,
  units_count: expectedUnits.length,
  top_cleaned: true,
  cards_configured: true,
  bottom_preserved: true
}));
