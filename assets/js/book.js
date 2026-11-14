'use strict';
(() => {
  const pages = [...document.querySelectorAll('.book-page')];
  if (!pages.length) return;
  const body = document.body;
  const spreadQuery = window.matchMedia('(min-width: 1001px)');
  const storageKey = '32pages-reader-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Reading also works with storage disabled. */ }
  const pageFromHash = () => {
    const match = /^#page-(\d+)$/.exec(location.hash);
    const number = match ? Number(match[1]) : 0;
    return number >= 1 && number <= pages.length ? number - 1 : null;
  };
  const validSavedPage = Number.isInteger(saved.page) && saved.page >= 0 && saved.page < pages.length ? saved.page : null;
  let current = pageFromHash() ?? 0;
  let mode = saved.mode === 'continuous' ? 'continuous' : 'paged';
  let size = Number.isFinite(saved.size) ? Math.min(26, Math.max(17, saved.size)) : (window.innerWidth <= 600 ? 18 : 20);
  let trackingPaused = false;
  let scrollFrame = 0;
  const byId = id => document.getElementById(id);
  const contents = byId('contents');
  const contentsToggle = byId('contents-toggle');
  const chapterLinks = [...contents.querySelectorAll('a[href^="#page-"]')];
  let contentsOpen = false;
  const setContentsOpen = (open, restoreFocus = false) => {
    contentsOpen = open;
    contents.inert = !open;
    contents.classList.toggle('is-open', open);
    contentsToggle.setAttribute('aria-expanded', String(open));
    contentsToggle.setAttribute('aria-label', open ? 'Закрыть оглавление' : 'Открыть оглавление');
    body.classList.toggle('contents-open', open);
    if (open) {
      setSettingsOpen(false);
      const link = contents.querySelector('[aria-current="location"]') || chapterLinks[0];
      link?.focus({ preventScroll: true });
      link?.scrollIntoView({ block: 'nearest' });
    } else if (restoreFocus) contentsToggle.focus({ preventScroll: true });
  };
  contentsToggle.addEventListener('click', () => setContentsOpen(!contentsOpen));
  contents.addEventListener('focusout', () => {
    queueMicrotask(() => {
      if (contentsOpen && !contents.contains(document.activeElement) && document.activeElement !== contentsToggle) setContentsOpen(false);
    });
  });
  const settings = byId('reading-settings');
  const settingsToggle = byId('settings-toggle');
  let settingsOpen = false;
  const setSettingsOpen = (open, restoreFocus = false) => {
    settingsOpen = open;
    settings.inert = !open;
    settings.classList.toggle('is-open', open);
    settingsToggle.setAttribute('aria-expanded', String(open));
    settingsToggle.setAttribute('aria-label', open ? 'Закрыть настройки чтения' : 'Открыть настройки чтения');
    if (open) {
      setContentsOpen(false);
      byId('mode-toggle').focus({ preventScroll: true });
    } else if (restoreFocus) settingsToggle.focus({ preventScroll: true });
  };
  settingsToggle.addEventListener('click', () => setSettingsOpen(!settingsOpen));
  byId('settings-close').addEventListener('click', () => setSettingsOpen(false, true));
  settings.addEventListener('focusout', event => {
    if (settingsOpen && !settings.contains(event.relatedTarget) && event.relatedTarget !== settingsToggle) setSettingsOpen(false);
  });
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify({ page: current, mode, size })); } catch { /* Preferences are optional. */ }
  };
  const setHash = () => {
    try { history.replaceState(null, '', `#page-${current + 1}`); } catch { /* Keep file-based viewing usable. */ }
  };
  const spreadStart = () => spreadQuery.matches && mode === 'paged' ? current - current % 2 : current;
  const spreadEnd = () => Math.min(pages.length - 1, spreadStart() + (spreadQuery.matches && mode === 'paged' ? 1 : 0));
  const updatePosition = () => {
    const first = spreadStart();
    const last = spreadEnd();
    byId('page-status').textContent = first === last ? `Страница ${current + 1} из ${pages.length}` : `Страницы ${first + 1}–${last + 1} из ${pages.length}`;
    byId('progress').value = last + 1;
    byId('percent').textContent = `${Math.round((last + 1) / pages.length * 100)}%`;
    byId('page-select').value = String(current + 1);
    byId('previous').disabled = first === 0;
    byId('next').disabled = last === pages.length - 1;
    const activeChapter = chapterLinks.filter(a => Number(a.hash.slice(6)) <= current + 1).at(-1);
    chapterLinks.forEach(a => {
      if (a === activeChapter) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  };
  const render = (animate = false) => {
    body.dataset.mode = mode;
    pages.forEach((page, index) => {
      page.hidden = mode === 'paged' && (index < spreadStart() || index > spreadEnd());
      page.classList.remove('turn-in');
      if (animate && mode === 'paged' && !page.hidden) {
        void page.offsetWidth;
        page.classList.add('turn-in');
      }
    });
    updatePosition();
  };
  const go = (index, { focus = true, scroll = true } = {}) => {
    const target = Math.min(pages.length - 1, Math.max(0, index));
    current = target;
    trackingPaused = true;
    render(true);
    setHash();
    save();
    const page = pages[current];
    if (focus) page?.focus({ preventScroll: true });
    if (scroll) {
      requestAnimationFrame(() => {
        page?.scrollIntoView({ block: 'start' });
      });
    }
    requestAnimationFrame(() => { trackingPaused = false; });
  };
  const turn = direction => {
    const target = direction > 0 ? spreadEnd() + 1 : spreadStart() - (spreadQuery.matches && mode === 'paged' ? 2 : 1);
    if ((direction < 0 && spreadStart() === 0) || (direction > 0 && spreadEnd() === pages.length - 1)) return;
    go(target);
  };
  const applySize = () => {
    body.style.setProperty('--reading-size', `${size}px`);
    byId('font-size').value = String(size);
    byId('font-smaller').disabled = size <= 17;
    byId('font-larger').disabled = size >= 26;
  };
  byId('font-smaller').addEventListener('click', () => { size = Math.max(17, size - 1); applySize(); save(); });
  byId('font-larger').addEventListener('click', () => { size = Math.min(26, size + 1); applySize(); save(); });
  const modeToggle = byId('mode-toggle');
  const syncModeButton = () => {
    const paged = mode === 'paged';
    byId('mode-label').textContent = paged ? 'По страницам' : 'Непрерывно';
    modeToggle.setAttribute('aria-checked', String(!paged));
  };
  modeToggle.addEventListener('click', () => {
    mode = mode === 'paged' ? 'continuous' : 'paged';
    syncModeButton();
    go(current, { focus: false });
  });
  syncModeButton();
  byId('previous').addEventListener('click', () => turn(-1));
  byId('next').addEventListener('click', () => turn(1));
  byId('page-select').addEventListener('change', event => go(Number(event.target.value) - 1));
  const handleChapterLink = (event, link) => {
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const targetIndex = Number.parseInt(link.hash.slice(6), 10) - 1;
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= pages.length) return;
    event.preventDefault();
    event.stopPropagation();
    setContentsOpen(false);
    go(targetIndex, { scroll: true });
  };
  byId('contents').addEventListener('pointerdown', event => {
    const link = event.target.closest('a[href^="#page-"]');
    if (!link || event.pointerType === 'mouse' && event.button !== 0) return;
    handleChapterLink(event, link);
  });
  byId('contents').addEventListener('click', event => {
    const link = event.target.closest('a[href^="#page-"]');
    if (!link || event.defaultPrevented) return;
    handleChapterLink(event, link);
  });
  window.addEventListener('hashchange', () => {
    const index = pageFromHash();
    if (index !== null) go(index);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsOpen) {
      event.preventDefault();
      setSettingsOpen(false, true);
      return;
    }
    if (event.key === 'Escape' && contentsOpen) {
      setContentsOpen(false, true);
      return;
    }
    if (contentsOpen || settingsOpen) return;
    if (mode !== 'paged' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, select, textarea, button, summary, [contenteditable]') || window.getSelection()?.toString()) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      turn(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  document.addEventListener('click', event => {
    if (!contents.contains(event.target) && !contentsToggle.contains(event.target)) setContentsOpen(false);
    if (!settings.contains(event.target) && !settingsToggle.contains(event.target)) setSettingsOpen(false);
  });
  let start = null;
  byId('pages').addEventListener('pointerdown', event => {
    if (mode !== 'paged' || event.target.closest('a,button') || (event.pointerType === 'mouse' && (event.button !== 0 || event.target.closest('.page-content')))) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  byId('pages').addEventListener('pointercancel', () => { start = null; });
  window.addEventListener('pointerup', event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && !window.getSelection()?.toString()) turn(dx < 0 ? 1 : -1);
  });
  // Reading position follows the first page at the top of the continuous view.
  window.addEventListener('scroll', () => {
    if (mode !== 'continuous' || trackingPaused || scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (trackingPaused) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let index = pages.findIndex(page => page.getBoundingClientRect().bottom > 120);
      if (atBottom) index = pages.length - 1;
      if (index >= 0 && index !== current) { current = index; updatePosition(); setHash(); save(); }
    });
  }, { passive: true });
  spreadQuery.addEventListener('change', () => { render(); });
  const fullscreen = byId('fullscreen');
  if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
    byId('fullscreen-setting').hidden = false;
    fullscreen.hidden = false;
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { document.querySelector('.reader-feedback').textContent = 'Браузер не разрешил полноэкранный режим. Чтение можно продолжить в этом окне.'; }
    });
    document.addEventListener('fullscreenchange', () => {
      const label = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
      fullscreen.setAttribute('aria-label', label);
      fullscreen.setAttribute('title', label);
      fullscreen.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
      fullscreen.textContent = document.fullscreenElement ? '⛶ Выйти из полного экрана' : '⛶ На весь экран';
    });
  }
  if (validSavedPage !== null && validSavedPage > 0 && pageFromHash() === null) {
    document.querySelector('.resume-row').hidden = false;
    byId('resume-button').textContent = `Продолжить со страницы ${validSavedPage + 1}`;
    byId('resume-button').addEventListener('click', () => {
      document.querySelector('.resume-row').hidden = true;
      go(validSavedPage);
    });
  }
  applySize();
  body.classList.add('reader-ready');
  setContentsOpen(false);
  contentsToggle.hidden = false;
  settings.hidden = false;
  settingsToggle.hidden = false;
  render();
  document.querySelectorAll('.reading-progress, .pagination, .reading-hint').forEach(el => { el.hidden = false; });
  if (pageFromHash() !== null) requestAnimationFrame(() => go(current, { focus: false }));
})();
