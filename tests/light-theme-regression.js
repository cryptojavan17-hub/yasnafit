#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');
const read = f => fs.readFileSync(path.join(pub, f), 'utf8');

const theme = read('theme.css');
const styles = read('styles.css');

// ─── 1. توکن‌های مشترک پوشش‌ها در :root (تم تاریک پیش‌فرض) ───
for (const token of ['--tint-soft:', '--tint:', '--tint-strong:', '--border-hover:', '--bg-glow:', '--backdrop:', '--backdrop-soft:', '--overlay-solid:', '--toolbar-bg:', '--sidebar-bg:', '--topbar-bg:', '--scrim-solid:', '--card-solid-base:', '--chip-dark-bg:', '--focus-ring:']) {
  assert.ok(theme.includes(token), `missing shared surface token in theme.css :root: ${token}`);
}

// ─── 2. بلاک تم روشن: فعال‌سازی با data-theme و بازتعریف کامل توکن‌ها ───
assert.match(theme, /:root\[data-theme="light"\]\s*\{/, 'the light theme block must key off html[data-theme="light"]');
assert.match(theme, /:root\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/, 'the light theme must declare color-scheme: light');
for (const token of ['--bg: #eef1f6', '--surface: #ffffff', '--text: #0f172a', '--text-secondary: #334155', '--text-muted: #5b6b81', '--accent: #2563eb', '--danger: #dc2626', '--border: rgba(15, 23, 42, .1)', '--overlay-solid: rgba(255, 255, 255, .97)', '--sidebar-bg: rgba(255, 255, 255, .95)', '--topbar-bg: rgba(255, 255, 255, .86)', '--toolbar-bg: rgba(255, 255, 255, .94)']) {
  assert.ok(theme.includes(token), `light theme must redefine ${token}`);
}
assert.match(theme, /html\.theme-switching body/, 'theme switching must animate colors smoothly');

// ─── 3. هیچ رنگ دارکِ هاردکدشده بیرون از theme.css باقی نمانده باشد ───
const coachCss = ['styles.css', 'unified-components.css', 'program-builder.css', 'students.css', 'exercises.css', 'diet-programs.css', 'supplement-programs.css', 'ai-copilot.css', 'ai-settings.css', 'jalali-picker.css', 'releases.css'];
for (const file of coachCss) {
  const src = read(file);
  for (const banned of ['rgba(14,14,14', 'rgba(16,16,16', 'rgba(11,11,11', 'rgba(8,8,8', 'rgba(18, 18, 22', 'rgba(18,18,22']) {
    assert.ok(!src.includes(banned), `${file} still hardcodes dark surface ${banned} — use the shared tokens`);
  }
  // مقادیر سفیدِ کم‌رنگ (tint) فقط از توکن بخوانند
  assert.ok(!/rgba\(255, ?255, ?255, ?\.0[0-9]/.test(src), `${file} still hardcodes a white tint — use --tint tokens`);
}

// ─── 4. دکمهٔ تغییر تم: کنار اعلان‌ها در پوستهٔ مربی + اسکریپت + بوت‌استرپ ───
const index = read('index.html');
assert.ok(index.includes('data-theme-toggle'), 'index.html must contain the theme toggle button');
assert.ok(index.indexOf('themeToggle') < index.indexOf('coachNotificationCenter'), 'the toggle must sit BEFORE the notification bell in the top actions');
assert.ok(index.includes('<script src="/theme-toggle.js"></script>'), 'index.html must load theme-toggle.js');
assert.ok(index.indexOf('<script src="/theme-toggle.js"></script>') < index.indexOf('/theme.css'), 'the theme script must run in <head> BEFORE the stylesheets (no flash of wrong theme, CSP-safe)');

// ─── 5. منطق سوییچ: ذخیره‌سازی + اتصال سراسری + آیکون خورشید/ماه ───
const toggleJs = read('theme-toggle.js');
assert.ok(toggleJs.includes("KEY = 'yasna-theme'"), 'the switcher must persist under the yasna-theme key');
assert.ok(toggleJs.includes("localStorage.setItem(KEY"), 'the chosen theme must be saved');
assert.ok(toggleJs.includes("closest('[data-theme-toggle]')"), 'any element with data-theme-toggle must flip the theme');
assert.ok(toggleJs.includes("setAttribute('data-theme'"), 'the switcher must set html[data-theme]');
assert.ok(styles.includes('.theme-toggle'), 'the toggle button must be styled');
assert.match(styles, /\.theme-toggle \{ width: 38px/, 'the toggle must be a real tap target');
assert.match(styles, /:root\[data-theme="light"\] \.theme-toggle \.icon-moon \{ display: block; \}/, 'the moon icon must show in light mode');
assert.match(styles, /@media \(max-width: 680px\) \{ \.theme-toggle \{ width: 40px/, 'the toggle must grow on phones for comfortable touch');

// ─── 6. صفحه‌های ورود مربی: بوت‌استرپ + دکمهٔ شناور ───
for (const file of ['coach-login.html', 'coach-2fa.html', 'coach-forgot.html', 'coach-mail.html', 'coach-reset.html', 'coach-setup.html']) {
  const src = read(file);
  assert.ok(src.includes('theme-toggle-float'), `${file} must carry the floating theme toggle`);
  assert.ok(src.includes('<script src="/theme-toggle.js"></script>'), `${file} must load theme-toggle.js`);
  assert.ok(src.indexOf('<script src="/theme-toggle.js"></script>') < src.indexOf('/theme.css'), `${file} must apply the theme before the stylesheets`);
  assert.ok(!/<script>/.test(src), `${file} must stay CSP-clean (no inline scripts)`);
}

// ─── 7. موبایل: دکمهٔ اعلان‌ها و تم در عرض کم هم دیده شوند ───
assert.match(styles, /@media\(max-width:680px\)\{\.coach-review-bell\{width:38px/, 'the bell keeps its compact mobile rule');
assert.doesNotMatch(styles, /\.top-actions\s*\{[^}]*display:\s*none/, 'the top actions (theme + bell) must never be hidden on mobile');

console.log(JSON.stringify({
  ok: true,
  shared_surface_tokens: true,
  light_theme_block: true,
  no_hardcoded_dark_surfaces: true,
  toggle_next_to_notifications: true,
  persistence_via_localStorage: true,
  auth_pages_floating_toggle: true,
  mobile_touch_targets: true
}));
