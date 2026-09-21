/* YASNAFIT — public site interactions.
   The pages are server-rendered (SEO + no-JS usable); this file only adds
   polish: sticky header state, accessible mobile menu, magazine category
   filters with URL query state, image fallbacks and reveal-on-scroll.
   CSP-safe: no inline handlers, data-* attributes + addEventListener only.
*/
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Image fallbacks (capture phase catches non-bubbling load errors) ----------
  window.addEventListener('error', event => {
    const el = event.target;
    if (!el || el.tagName !== 'IMG') return;
    const fallback = el.getAttribute('data-fallback');
    if (fallback && !el.dataset.fallbackDone && el.src !== fallback) {
      el.dataset.fallbackDone = '1';
      el.src = fallback;
    }
  }, true);

  // ---------- Sticky header state ----------
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---------- Mobile navigation ----------
  const navToggle = header ? header.querySelector('.nav-toggle') : null;
  if (navToggle && header) {
    const nav = document.getElementById('siteNav');
    const setOpen = open => {
      header.classList.toggle('is-nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        const first = nav ? nav.querySelector('a') : null;
        if (first) first.focus({ preventScroll: true });
      }
    };
    navToggle.addEventListener('click', () => setOpen(!header.classList.contains('is-nav-open')));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && header.classList.contains('is-nav-open')) {
        setOpen(false);
        navToggle.focus();
      }
    });
    document.addEventListener('click', event => {
      if (header.classList.contains('is-nav-open') && !header.contains(event.target)) setOpen(false);
    });
    if (nav) nav.addEventListener('click', event => {
      if (event.target.closest('a')) setOpen(false);
    });
    if (window.matchMedia('(min-width: 901px)').matches) setOpen(false);
  }

  // ---------- Active nav highlighting on popstate ----------
  const markActive = () => {
    const path = location.pathname;
    document.querySelectorAll('.site-nav__link').forEach(link => {
      const target = link.getAttribute('data-nav') || '/home';
      // «خانه» is the landing on /home (the domain root is the student entry page).
      const active = target === '/home' ? path === '/home' : path === target || path.startsWith(target + '/') || (target === '/magazine' && path.startsWith('/magazine/'));
      link.classList.toggle('is-active', active);
    });
  };
  window.addEventListener('popstate', markActive);
  markActive();

  // ---------- Magazine category filters ----------
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const faDigits = value => String(value ?? '').replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const jalaliDate = iso => {
    try { return (window.YasnaJalali && window.YasnaJalali.format(iso)) || ''; } catch (e) { return ''; }
  };

  function articleCardHtml(article) {
    const cover = article.cover_image || '/images/landing/cover-default.svg';
    const date = article.published_at ? jalaliDate(String(article.published_at).slice(0, 10)) : '';
    return `<article class="article-card">
  <a class="article-card__media" href="/magazine/${esc(article.slug)}" tabindex="-1" aria-hidden="true">
    <img loading="lazy" src="${esc(cover)}" alt="" data-fallback="/images/landing/cover-default.svg">
    ${article.category_name ? `<span class="article-card__badge">${esc(article.category_name)}</span>` : ''}
  </a>
  <div class="article-card__body">
    <h3 class="article-card__title"><a href="/magazine/${esc(article.slug)}">${esc(article.title)}</a></h3>
    <p class="article-card__summary">${esc(article.summary || '')}</p>
    <div class="article-card__meta">
      ${date ? `<time datetime="${esc(String(article.published_at).slice(0, 10))}">${esc(date)}</time>` : '<span>—</span>'}
      <span class="article-card__dot" aria-hidden="true">•</span>
      <span>${faDigits(article.reading_time || 1)} دقیقه مطالعه</span>
    </div>
    <a class="article-card__cta" href="/magazine/${esc(article.slug)}">مطالعه کامل مطلب</a>
  </div>
</article>`;
  }

  const grid = document.getElementById('magazineGrid');
  const pills = document.querySelectorAll('.magazine-pill');
  let requestToken = 0;

  function setPills(category) {
    pills.forEach(pill => {
      const active = (pill.dataset.category || '') === category;
      pill.classList.toggle('is-active', active);
      pill.setAttribute('aria-pressed', String(active));
    });
  }

  function updateCategoryUrl(category) {
    const url = new URL(location.href);
    if (category) url.searchParams.set('category', category);
    else url.searchParams.delete('category');
    history.pushState({ category }, '', url);
  }

  async function loadMagazine(category) {
    if (!grid) return;
    const token = ++requestToken;
    const endpoint = category ? `/api/magazine?category=${encodeURIComponent(category)}` : '/api/magazine';
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (token !== requestToken) return;
      if (!response.ok) throw new Error(data.error || 'خطا در بارگذاری مقالات');
      grid.innerHTML = (data.articles && data.articles.length)
        ? data.articles.map(articleCardHtml).join('')
        : `<div class="empty-state" role="status"><div class="empty-state__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/></svg></div><h3>مقاله‌ای با این فیلتر پیدا نشد</h3><p>دستهٔ دیگری را انتخاب کنید.</p></div>`;
      grid.dataset.category = category || '';
      setPills(category || '');
    } catch (error) {
      if (token === requestToken) grid.innerHTML = `<div class="empty-state" role="alert"><h3>خطا در بارگذاری</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  pills.forEach(pill => pill.addEventListener('click', () => {
    // On the home page the pills are plain links into /magazine?category=…
    // (the existing filtering system) — only intercept real button pills.
    if (!grid || pill.tagName !== 'BUTTON') return;
    const category = pill.dataset.category || '';
    const current = grid.dataset.category || '';
    if (category === current) return;
    updateCategoryUrl(category);
    loadMagazine(category);
  }));
  window.addEventListener('popstate', () => {
    const category = new URL(location.href).searchParams.get('category') || '';
    if (grid && category !== (grid.dataset.category || '')) {
      setPills(category);
      loadMagazine(category);
    }
  });

  // ---------- Reveal on scroll (subtle, opt-out with reduced motion) ----------
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.service-card, .article-card, .story-card, .about-preview__content, .hero__content').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      el.style.transition = 'opacity 520ms ease, transform 520ms ease';
      observer.observe(el);
    });
    // Safety net: if the observer never fires (older engines), show everything.
    setTimeout(() => {
      document.querySelectorAll('.service-card, .article-card, .story-card, .about-preview__content, .hero__content').forEach(el => {
        el.style.opacity = '';
        el.style.transform = '';
        el.style.transition = '';
      });
    }, 2500);
  }
  // ---------- Home magazine category filter (Task 25 PART 3) ----------
  // The home shows the same real article cards as /magazine; the pills filter
  // them in place (buttons + aria-pressed, same convention as the magazine page).
  const homeMagazineGrid = document.getElementById('magazineHomeGrid');
  if (homeMagazineGrid) {
    const homeSection = homeMagazineGrid.closest('section');
    const homePills = homeSection.querySelectorAll('.magazine-filters--home .magazine-pill');
    const homeNone = homeSection.querySelector('.magazine--home__none');
    homePills.forEach(pill => {
      pill.addEventListener('click', () => {
        homePills.forEach(p => { p.classList.remove('is-active'); p.setAttribute('aria-pressed', 'false'); });
        pill.classList.add('is-active');
        pill.setAttribute('aria-pressed', 'true');
        const category = pill.dataset.category || '';
        homeMagazineGrid.dataset.category = category;
        let visible = 0;
        homeMagazineGrid.querySelectorAll('.article-card').forEach(card => {
          const show = !category || card.dataset.category === category;
          card.classList.toggle('is-hidden', !show);
          if (show) visible += 1;
        });
        if (homeNone) homeNone.hidden = !(category && visible === 0);
      });
    });
  }

  // The guest «ربات تلگرام» control is a plain deep link now (owner spec
  // 2026-09-21): <a href="https://t.me/<bot>?start=landing">, rendered by the
  // server. No dialog, no username field and no public write endpoint here.
})();
