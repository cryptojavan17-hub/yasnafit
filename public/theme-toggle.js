// Yasnafit theme switcher — light (default) / dark, persisted in localStorage.
// Any element with [data-theme-toggle] flips the theme; state survives refresh.
(function () {
  'use strict';
  var KEY = 'yasna-theme';
  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.title = theme === 'light' ? 'رفتن به تم تاریک' : 'رفتن به تم روشن';
    });
  }
  function switchTheme() {
    var html = document.documentElement;
    html.classList.add('theme-switching');
    var next = current() === 'light' ? 'dark' : 'light';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
    window.setTimeout(function () { html.classList.remove('theme-switching'); }, 320);
  }
  var stored = 'light';
  try { stored = localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) {}
  apply(stored);
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-theme-toggle]')) switchTheme();
  });
  window.YasnafitTheme = { apply: apply, current: current };
})();
