/* Daily Genre v263 — listened-history navigation + compact aliases editor. */
(function installDailyGenreListenedNavigation() {
  'use strict';

  const BUILD = 'v263';
  let observer = null;
  let scheduled = false;

  function genres() { return Array.isArray(window.genres) ? window.genres : []; }

  function currentGenreValue() {
    try {
      const value = (0, eval)('currentGenre');
      if (value && typeof value === 'object') return value;
    } catch (_) {}
    return window.currentGenre && typeof window.currentGenre === 'object' ? window.currentGenre : null;
  }

  function dateValue(genre) {
    try {
      if (typeof window.dateValue === 'function') return String(window.dateValue(genre) || '').slice(0, 10);
    } catch (_) {}
    return String(genre?.date_normalized || genre?.datenormalized || genre?.listen_date || genre?.date || '').slice(0, 10);
  }

  function isListenedGenre(genre) {
    if (!genre || !dateValue(genre)) return false;
    const status = String(genre.status || '').toLowerCase();
    const rating = String(genre.rating || '').toLowerCase();
    return status === 'listened' || status === 'in_progress' || status === 'in-progress' || status === 'veto' || rating === 'zanger';
  }

  function listenedTimeline() {
    return genres().filter(isListenedGenre).slice().sort((a, b) => {
      const dateDiff = dateValue(a).localeCompare(dateValue(b));
      if (dateDiff) return dateDiff;
      const aOrder = Number(a.listen_order ?? a.listenOrder ?? a.rank_order ?? 0);
      const bOrder = Number(b.listen_order ?? b.listenOrder ?? b.rank_order ?? 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.genre || '').localeCompare(String(b.genre || ''));
    });
  }

  function sameGenre(a, b) {
    if (!a || !b) return false;
    if (a.id != null && b.id != null) return String(a.id) === String(b.id);
    return String(a.genre || '') === String(b.genre || '');
  }

  function adjacentGenre(direction, genre = currentGenreValue()) {
    const timeline = listenedTimeline();
    const index = timeline.findIndex(item => sameGenre(item, genre));
    if (index < 0) return null;
    return timeline[index + (direction < 0 ? -1 : 1)] || null;
  }

  function openGenre(genre) {
    if (!genre) return false;
    try {
      if (typeof window.openGenreDetail === 'function') {
        return window.openGenreDetail(genre, false, { force: true, preserveScroll: false, skipAutoScroll: false }) !== false;
      }
    } catch (error) {
      console.warn('[Daily Genre] Could not open listened-history neighbor.', error);
    }
    if (genre.id != null) {
      location.hash = `#genre=${encodeURIComponent(String(genre.id))}`;
      try { if (typeof window.switchScreen === 'function') window.switchScreen('listen', { force: true }); } catch (_) {}
      return true;
    }
    return false;
  }

  function openAdjacentListenedGenre(direction) {
    const target = adjacentGenre(direction);
    if (!target) {
      try {
        if (typeof window.showSaveToast === 'function') {
          window.showSaveToast(direction < 0 ? 'No earlier listened genre.' : 'No later listened genre.', false);
        }
      } catch (_) {}
      updateNavigationButtons();
      return false;
    }
    return openGenre(target);
  }

  function installGlobal(name, value) {
    try { window[name] = value; } catch (_) {}
    try { (0, eval)(`${name} = window[${JSON.stringify(name)}]`); } catch (_) {}
  }

  function navigationButtons() {
    const root = document.getElementById('listenDetails');
    if (!root) return { previous: [], next: [] };
    const buttons = Array.from(root.querySelectorAll('button, a'));
    const previous = buttons.filter(button => button.classList.contains('dc-prev-genre-btn') || /previous\s+genre|prev(?:ious)?\b/i.test(String(button.textContent || '').trim()) || /previous genre/i.test(String(button.getAttribute('aria-label') || '')));
    const next = buttons.filter(button => button.classList.contains('dc-next-genre-btn') || /^next(?:\s+genre)?\b/i.test(String(button.textContent || '').trim()) || /next genre/i.test(String(button.getAttribute('aria-label') || '')));
    return { previous, next };
  }

  function setButtonState(button, target, direction) {
    if (!button) return;
    const visible = Boolean(target);
    button.hidden = !visible;
    button.style.display = visible ? '' : 'none';
    button.disabled = !visible;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) {
      const date = dateValue(target);
      const directionLabel = direction < 0 ? 'Previous listened genre' : 'Next listened genre';
      const detail = `${target.genre || 'genre'}${date ? ` · ${date}` : ''}`;
      button.setAttribute('aria-label', `${directionLabel}: ${detail}`);
      button.title = `${directionLabel}: ${detail}`;
    }
  }

  function updateNavigationButtons() {
    const genre = currentGenreValue();
    const previousTarget = adjacentGenre(-1, genre);
    const nextTarget = adjacentGenre(1, genre);
    const buttons = navigationButtons();
    buttons.previous.forEach(button => setButtonState(button, previousTarget, -1));
    buttons.next.forEach(button => setButtonState(button, nextTarget, 1));
    return { genre, previousTarget, nextTarget, previousButtons: buttons.previous.length, nextButtons: buttons.next.length };
  }

  function compactAliasEditor() {
    const root = document.getElementById('genreIdentityWorkbench');
    if (!root) return false;
    const aliases = root.querySelector('#genreIdentityAliases');
    if (aliases) {
      aliases.rows = 3;
      aliases.style.minHeight = '74px';
      aliases.style.maxHeight = '150px';
      aliases.style.resize = 'vertical';
    }
    const block = root.querySelector('#v259AliasBlockImport');
    if (block) {
      block.rows = 5;
      block.style.minHeight = '104px';
      block.style.maxHeight = '190px';
      block.style.resize = 'vertical';
    }
    root.dataset.v263CompactAliases = 'true';
    return Boolean(aliases);
  }

  function refresh() { scheduled = false; updateNavigationButtons(); compactAliasEditor(); }
  function scheduleRefresh() { if (scheduled) return; scheduled = true; requestAnimationFrame(refresh); }

  function boot() {
    installGlobal('openAdjacentGenre', openAdjacentListenedGenre);
    refresh();
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-screen="listen"], #screen-listen') || event.target.closest('[data-screen="review"], #screen-review') || event.target.closest('[onclick*="openGenre"], [data-genre-id]')) {
        setTimeout(refresh, 80);
        setTimeout(refresh, 200);
      }
    }, true);
  }

  window.dailyGenreListenedNavigationDiagnostics = function diagnostics() {
    const state = updateNavigationButtons();
    const timeline = listenedTimeline();
    const aliases = document.getElementById('genreIdentityAliases');
    return {
      build: BUILD,
      installed: true,
      timelineSize: timeline.length,
      currentGenre: state.genre?.genre || '',
      previousGenre: state.previousTarget?.genre || '',
      previousDate: dateValue(state.previousTarget),
      nextGenre: state.nextTarget?.genre || '',
      nextDate: dateValue(state.nextTarget),
      previousButtons: state.previousButtons,
      nextButtons: state.nextButtons,
      aliasesRows: aliases?.rows || null,
      compactAliases: Boolean(document.getElementById('genreIdentityWorkbench')?.dataset.v263CompactAliases),
    };
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  console.info('[Daily Genre] v263 listened-history navigation installed.');
})();
