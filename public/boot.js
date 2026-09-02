// Feature modules load after the shell. Re-dispatch the real deep link only
// after student portal, submissions, and Program Builder renderers exist.
if (window.onpopstate) {
  window.onpopstate();
}
