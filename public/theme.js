// Day/night mode. Loaded in <head> without "defer" so the right theme is applied before the page paints.
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#090e1a' : '#f8fafc');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  var initial = stored === 'light' || stored === 'dark' ? stored : mq && mq.matches ? 'dark' : 'light';
  root.setAttribute('data-theme', initial);

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.classList.add('theme-anim');
        apply(next);
        try { localStorage.setItem('theme', next); stored = next; } catch (e) {}
        window.setTimeout(function () { root.classList.remove('theme-anim'); }, 450);
      });
    });
  });

  // Follow the device setting until the visitor makes their own choice.
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) {
      if (!stored) apply(e.matches ? 'dark' : 'light');
    });
  }
})();
