// Yasnafit — student shell only: keeps the mobile browser chrome color in sync
// with the active theme (light is the default; the dark theme flips it to #050505).
// External file because the client CSP forbids inline scripts (script-src 'self').
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="theme-color"]');
  function sync() {
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    if (meta) meta.setAttribute('content', light ? '#eef1f6' : '#050505');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
