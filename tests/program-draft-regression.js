#!/usr/bin/env node
'use strict';
// رگرسیون ذخیرهٔ خودکار سازندهٔ برنامه تمرینی — هیچ تایپی مربی با رفرش از بین نمی‌رود
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'program-builder.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'program-builder.css'), 'utf8');

// ─── ۱. کلید stash زمینه‌دار — نه کلید سراسری ───
assert.match(src, /draftKey='yasnafit_program_draft_'\+\(id\?\('id'\+id\):\(sid\?\('s'\+sid/, 'context-scoped draft key missing (id/student/blank)');
assert.match(src, /function stashKey\(\)\{return draftKey;\}/, 'the stash key must stay STABLE for the whole page lifetime (no key switch after the server returns an id)');
assert.match(src, /computeDraftKey\(\);cancelAutosaveTimers\(\)/, 'the draft key must be recomputed once per builder render');
assert.ok(!src.includes("'yasnafit_program_stash'"), 'the old global stash key must be gone');

// ─── ۲. ذخیرهٔ خودکار روی «هر» تغییر — قلاب داخل setDirty با دیبانس کوتاه ───
assert.match(src, /function setDirty\(value\)\{\s*dirty=value;\s*if\(value\)scheduleAutosave\(\);/, 'setDirty must trigger the autosave scheduler');
assert.match(src, /autosaveTimer=setTimeout\(runAutosave,\s*500\)/, 'local autosave debounce must be sub-second (500ms)');

// ─── ۳. ذخیرهٔ محلی فوری + پیش‌نویس بی‌صدای سرور (POST سپس PUT) ───
assert.match(src, /localStorage\.setItem\(stashKey\(\),stashPayload\(false\)\)/, 'local stash write missing');
assert.match(src, /serverDraftTimer=setTimeout\(autoServerDraft,\s*1200\)/, 'server draft debounce missing');
assert.match(src, /async function autoServerDraft\(\)/, 'silent server draft saver missing');
assert.match(src, /api\('\/api\/training-programs',\{method:'POST'/, 'server draft must create via POST');
assert.match(src, /api\('\/api\/training-programs\/'\+currentProgram\.id,\{method:'PUT'/, 'server draft must update via PUT');
{
  const fnStart = src.indexOf('async function autoServerDraft()');
  const fnEnd = src.indexOf('\n  }', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.ok(!fnBody.includes('alert('), 'autosave must never pop alerts');
  assert.ok(fnBody.includes("stashPayload(true)"), 'successful server sync must mark the stash synced');
  assert.ok(fnBody.includes("setSaveState('local')"), 'server failure must fall back to a visible local-only state');
}

// ─── ۴. بازیابی بی‌سروصدا و زمینه‌دار هنگام بارگذاری ───
{
  const fnStart = src.indexOf('async function loadProgramIfEditing(){');
  const fnEnd = src.indexOf('\n  }', src.indexOf('activeDayIdx=0;', fnStart));
  const fnBody = src.slice(fnStart, fnEnd);
  assert.ok(!fnBody.includes('confirm('), 'restore must be seamless — no confirm() dialogs');
  assert.ok(fnBody.includes('const lookupKey='), 'restore must use the context-scoped lookup key');
  assert.ok(fnBody.includes("readStash(lookupKey)"), 'restore must read the scoped stash');
  assert.ok(fnBody.includes("setSaveState('restored')"), 'restored drafts must be announced');
  // جریان ارزیابی: فقط پیش‌نویس «همین شاگرد + همین ارزیابی» — استش محلی نامرتبط ممکن نیست
  assert.ok(fnBody.includes("currentProgram.student_id=sourceStudentId"), 'student+assessment restore must pin the URL student');
  assert.ok(fnBody.includes("currentProgram.assessment_id=sourceAssessmentId"), 'student+assessment restore must pin the URL assessment');
}

// ─── ۵. هشدار پیش از خروج + فلاش همزمان لوکال‌استوریج ───
assert.match(src, /window\.addEventListener\('beforeunload',\s*\(e\)=>\{/, 'beforeunload guard missing');
assert.match(src, /localStorage\.setItem\(stashKey\(\),stashPayload\(false\)\);\s*\}catch\(err\)\{\}\s*\}\s*\n\s*if\(dirty\)\{/, 'beforeunload must flush pending edits synchronously');
assert.match(src, /e\.returnValue = 'تغییرات ذخیره نشده دارید/, 'unsaved-changes warning text missing');

// ─── ۶. نشانگر وضعیت ذخیره با هر پنج حالت ───
for (const state of ['saving','saved','local','restored','error']) {
  assert.match(css, new RegExp(`\\[data-state="${state}"\\]`), `save-state CSS missing for ${state}`);
}
assert.match(src, /'⏳ در حال ذخیره…'/, 'saving indicator text missing');
assert.match(src, /'✓ ذخیره شد'/, 'saved indicator text missing');
assert.match(src, /'↩ پیش‌نویس بازیابی شد'/, 'restored indicator text missing');

// ─── ۷. بهداشت تایمرها — نسل قبلی سازنده نباید چند برابر شود ───
assert.match(src, /function cancelAutosaveTimers\(\)/, 'timer cancellation helper missing');
assert.match(src, /cancelAutosaveTimers\(\);if\(autosaveInterval\)\{clearInterval\(autosaveInterval\);autosaveInterval=null;\}/, 're-render must cancel previous autosave timers');
assert.match(src, /if\(autosaveInterval\)clearInterval\(autosaveInterval\);\s*\n\s*autosaveInterval=setInterval/, 'safety-net interval must be tracked and replaced');

// ─── ۸. ذخیرهٔ دستی هم stash زمینه‌دار را پاک می‌کند ───
assert.match(src, /localStorage\.removeItem\(stashKey\(\)\)/, 'manual save must clear the context stash');

console.log(JSON.stringify({ ok: true, scoped_stash_keys: true, per_change_autosave: true, silent_server_draft: true, seamless_restore: true, unload_flush_and_warning: true, save_state_indicator: true, timer_hygiene: true }));
