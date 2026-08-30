/* Daily Genre Library Polish - performance rescue v8
   Purpose: keep the Today shortcut and Dig Add Songs entry point without
   boot-time MutationObserver/render loops. This file intentionally avoids
   page-wide observers and heavy Archive card rewrites. */
(function dailyGenreLibraryPolishPerformanceRescue() {
  'use strict';

  const VERSION = 'queue-studio-v20';
  let installed = false;
  let enhanceQueued = false;

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function safeText(value) {
    return String(value == null ? '' : value);
  }

  function escapeHtml(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(value);
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, isError = false) {
    if (typeof window.showSaveToast === 'function') window.showSaveToast(message, isError);
    else console[isError ? 'warn' : 'info'](`[Daily Genre] ${message}`);
  }

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function localToday() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function dateValueSafe(genre) {
    if (!genre) return '';
    // Match the core app's canonical listen-date rules. Do not let stray
    // legacy date/date_raw values keep a reset genre attached to Today.
    if (typeof window.dateValue === 'function') return safeText(window.dateValue(genre)).slice(0, 10);
    return safeText(
      genre.date_normalized ||
      genre.datenormalized ||
      ''
    ).slice(0, 10);
  }

  function isLogged(genre) {
    const status = safeText(genre && genre.status).toLowerCase();
    const rating = safeText(genre && genre.rating).toLowerCase();
    return (
      status === 'listened' ||
      status === 'in_progress' ||
      status === 'in-progress' ||
      status === 'veto' ||
      rating === 'zanger'
    ) && !!dateValueSafe(genre);
  }

  function todaysLoggedGenres() {
    const today = localToday();
    return genres()
      .filter((genre) => isLogged(genre) && dateValueSafe(genre) === today)
      .sort((a, b) => safeText(a.genre).localeCompare(safeText(b.genre)));
  }

  function mostRecentLoggedGenre() {
    return genres()
      .filter(isLogged)
      .sort((a, b) => {
        const dateDiff = dateValueSafe(b).localeCompare(dateValueSafe(a));
        if (dateDiff) return dateDiff;
        return safeText(a.genre).localeCompare(safeText(b.genre));
      })[0] || null;
  }

  function openLibraryFallback() {
    if (typeof window.switchScreen === 'function') window.switchScreen('history', { force: true });
    else location.hash = '';
    toast('No listened genres yet — opened Library.');
  }

  function openGenre(genre, note) {
    if (!genre) return false;
    try {
      if (typeof window.openGenreDetail === 'function') {
        const ok = window.openGenreDetail(genre, false, { force: true }) !== false;
        if (ok) {
          if (note) setTimeout(() => toast(note), 30);
          queueEnhance(80);
          return true;
        }
      }
    } catch (error) {
      console.warn('[Daily Genre] openGenreDetail failed; falling back to hash.', error);
    }

    if (genre.id != null) {
      location.hash = `#genre=${encodeURIComponent(genre.id)}`;
      if (typeof window.switchScreen === 'function') window.switchScreen('listen', { force: true });
      if (note) setTimeout(() => toast(note), 30);
      queueEnhance(120);
      return true;
    }
    return false;
  }

  function openTodayOrRecent() {
    const ready = genres().length > 0;
    if (!ready) {
      toast('Genres are still loading. Trying Today again in a moment…');
      setTimeout(openTodayOrRecent, 600);
      return false;
    }

    const todayItems = todaysLoggedGenres();
    const today = todayItems.find((genre) => {
      const status = safeText(genre && genre.status).toLowerCase();
      const rating = safeText(genre && genre.rating).toLowerCase();
      return status !== 'veto' && rating !== 'zanger';
    }) || todayItems[0];
    if (today) return openGenre(today, `Opened today: ${today.genre || 'today\'s genre'}.`);

    const recent = mostRecentLoggedGenre();
    if (recent) return openGenre(recent, `No genre logged today — opened most recent: ${recent.genre || 'recent genre'}.`);

    openLibraryFallback();
    return false;
  }

  function normalizeTopNavLabels() {
    const labelMap = [
      ['#topTodayBtn, #topTodayGenreBtn, .tab-today-btn', 'Today'],
      ['.tab-btn[data-screen="history"]', 'Library'],
      ['#topCrateDigBtn', 'Dig'],
      ['.tab-btn[data-screen="viz"]', 'Stats'],
      ['.tab-btn[data-screen="review"]', 'Studio'],
      ['.tab-btn[data-screen="ranking"]', 'Ranks'],
    ];

    labelMap.forEach(([selector, label]) => {
      all(selector).forEach((button) => {
        if (!button) return;
        if (!safeText(button.textContent).trim()) button.textContent = label;
        button.setAttribute('aria-label', label);
        button.title = label;
      });
    });

    const todayBtn = $('#topTodayBtn') || $('#topTodayGenreBtn') || $('.tab-today-btn');
    if (todayBtn) {
      todayBtn.id = 'topTodayBtn';
      todayBtn.type = 'button';
      todayBtn.classList.add('tab-today-btn', 'dc-global-today-btn');
      todayBtn.removeAttribute('data-screen');
    }
  }

  function currentGenreName() {
    try {
      if (typeof currentGenre !== 'undefined' && currentGenre && currentGenre.genre) return currentGenre.genre;
    } catch (_) {}
    const title = $('#listenDetails .genre-title, #listenDetails h2, #listenDetails h1');
    return safeText(title && title.textContent).trim();
  }

  function setDetailEditMode(next, focusEditor = false) {
    try {
      // app.js keeps detailEditMode as a page-global. Touch it directly so
      // listened genres with existing songs can still reveal the existing editor.
      detailEditMode = !!next;
    } catch (_) {
      try { window.detailEditMode = !!next; } catch (__) {}
    }
    try {
      if (typeof window.applyDetailEditMode === 'function') window.applyDetailEditMode(!!focusEditor);
      else if (typeof applyDetailEditMode === 'function') applyDetailEditMode(!!focusEditor);
    } catch (_) {}
  }

  function ensureEditorCloseButton(panel) {
    if (!panel || panel.querySelector('[data-dg-close-song-editor]')) return;
    const head = panel.querySelector('.form-section') || panel.firstElementChild || panel;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-secondary dg-close-song-editor-btn';
    close.setAttribute('data-dg-close-song-editor', '');
    close.setAttribute('aria-label', 'Close song editor');
    close.title = 'Close song editor';
    close.textContent = '×';
    close.classList.add('editor-x-btn');
    if (head.classList && head.classList.contains('form-section')) {
      head.classList.add('dg-editor-head-with-close');
      head.appendChild(close);
    } else {
      panel.insertBefore(close, panel.firstChild);
    }
  }

  function revealEditorPanel() {
    const panel = $('#listenEditPanel');
    if (!panel) return null;
    setDetailEditMode(true, true);
    panel.classList.remove('hidden', 'collapsed', 'is-hidden', 'studio-section-collapsed', 'dc-editor-collapsed');
    panel.classList.add('is-editing');
    panel.removeAttribute('hidden');
    panel.style.display = '';
    ensureEditorCloseButton(panel);
    return panel;
  }

  function closeSongEditor() {
    const panel = $('#listenEditPanel');
    setDetailEditMode(false, false);
    if (panel) {
      panel.classList.add('is-hidden');
      panel.classList.remove('is-editing');
    }
    toast('Song editor closed. Unsaved edits are still on the page until you save or reload.');
  }


  function officialSongCount(genre) {
    try {
      const raw = Array.isArray(genre?.songs_listened) ? genre.songs_listened : [];
      const inflated = typeof window.inflateSongsFromStorage === 'function'
        ? window.inflateSongsFromStorage(raw)
        : raw;
      return inflated.filter((song) => song && !song.isPending).length;
    } catch (_) {
      return Array.isArray(genre?.songs_listened) ? genre.songs_listened.length : 0;
    }
  }

  function openRandomSongCleanupGenre() {
    const currentId = (() => {
      try { return String(window.currentGenre?.id ?? ''); } catch (_) { return ''; }
    })();
    const pool = genres()
      .filter((genre) => isLogged(genre) && officialSongCount(genre) > 0)
      .filter((genre) => genres().length <= 1 || String(genre.id ?? '') !== currentId);
    if (!pool.length) {
      toast('No listened genres with logged songs are available for cleanup yet.', true);
      return false;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const opened = openGenre(pick, `Random cleanup pick: ${pick.genre || 'listened genre'}.`);
    if (opened) {
      setTimeout(() => {
        const addBtn = document.querySelector('[data-dg-open-song-editor]');
        if (addBtn) addBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 260);
    }
    return opened;
  }

  function openSongEditor() {
    if (typeof window.switchScreen === 'function') window.switchScreen('listen', { force: true, preserveScroll: true });
    const panel = revealEditorPanel();
    const textarea = $('#songsListenedBulk');
    const target = textarea || panel;

    if (target) {
      const focusTextarea = () => {
        if (textarea) {
          textarea.focus({ preventScroll: true });
          const len = textarea.value.length;
          try { textarea.setSelectionRange(len, len); } catch (_) {}
        }
      };
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      [80, 220, 520].forEach((delay) => setTimeout(focusTextarea, delay));
      toast('Add songs in the existing Songs listened editor, then use Save Changes.');
      return true;
    }

    toast('Could not find the existing song editor on this page.', true);
    return false;
  }

  function buttonHtml(extraClass = '') {
    return `<button type="button" class="btn btn-primary dg-add-songs-btn ${extraClass}" data-dg-open-song-editor>+ Add songs</button>`;
  }

  function randomCleanupButtonHtml(extraClass = '') {
    return `<button type="button" class="btn btn-secondary dg-random-cleanup-btn ${extraClass}" data-dg-random-song-cleanup title="Open a random listened genre with logged songs for cleanup">Random cleanup</button>`;
  }

  function enhanceDigPage() {
    enhanceQueued = false;
    normalizeTopNavLabels();

    const listenScreen = $('#screen-listen');
    const details = $('#listenDetails');
    if (!listenScreen || !details) return;

    const isDetailActive = listenScreen.classList.contains('active') || !!currentGenreName();
    if (!isDetailActive) return;

    // Add songs is intentionally offered once in the song editor callout.
    details.querySelectorAll('.dg-add-songs-inline-wrap').forEach((el) => el.remove());

    // Add a visible callout above the listening/carousel area when possible.
    const songArea = details.querySelector('#dc-songs, .song-listening-room, .song-focus-shell, .song-focus-card, .song-carousel, .song-focus-queue');
    if (songArea && !details.querySelector('.dg-song-editor-callout')) {
      const callout = document.createElement('div');
      callout.className = 'dg-song-editor-callout';
      const name = currentGenreName();
      callout.innerHTML = `
        <div class="dg-song-editor-callout-copy">
          <strong>Add or edit songs</strong>
          <span>${name ? `Paste Spotify URLs for ${escapeHtml(name)} in the existing setup editor.` : 'Paste Spotify URLs in the existing setup editor.'}</span>
        </div>
        <div class="dg-song-editor-callout-actions">${buttonHtml('')}</div>
      `;
      songArea.parentNode.insertBefore(callout, songArea);
    }
  }

  function queueEnhance(delay = 0) {
    if (enhanceQueued) return;
    enhanceQueued = true;
    setTimeout(() => {
      if (typeof window.requestAnimationFrame === 'function') requestAnimationFrame(enhanceDigPage);
      else enhanceDigPage();
    }, delay);
  }

  function wrapHook(name, delay = 80) {
    const original = window[name];
    if (typeof original !== 'function' || original.__dgPerfV8Wrapped) return;
    const wrapped = function dailyGenrePerfV8Hook(...args) {
      const result = original.apply(this, args);
      queueEnhance(delay);
      return result;
    };
    wrapped.__dgPerfV8Wrapped = true;
    window[name] = wrapped;
  }

  function injectStyles() {
    if ($('#dgPerfV8Styles')) return;
    const style = document.createElement('style');
    style.id = 'dgPerfV8Styles';
    style.textContent = `
      .dg-add-songs-inline-wrap { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 12px; }
      .dg-add-songs-btn { white-space: nowrap; }
      .dg-editor-head-with-close { position: relative; padding-right: 148px; }
      .dg-close-song-editor-btn { position: absolute; right: 0; top: 0; padding: 7px 12px !important; font-size: .82rem !important; border-radius: 999px !important; }
      @media (max-width: 680px) { .dg-editor-head-with-close { padding-right: 0; padding-top: 42px; } .dg-close-song-editor-btn { left: 0; right: auto; } }
      .dg-song-editor-callout {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin: 12px 0;
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid color-mix(in srgb, var(--accent, #d98d25) 42%, transparent);
        background: color-mix(in srgb, var(--accent-soft, #ffe0a1) 42%, var(--surface, #fff6df));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.45);
      }
      .dg-song-editor-callout-copy { display: grid; gap: 3px; min-width: 0; }
      .dg-song-editor-callout-copy strong { color: var(--text, #22160d); font-weight: 950; }
      .dg-song-editor-callout-copy span { color: var(--muted, #735a3c); font-size: .88rem; line-height: 1.3; }
      @media (max-width: 680px) {
        .dg-song-editor-callout { align-items: stretch; flex-direction: column; }
        .dg-song-editor-callout .btn, .dg-add-songs-inline-wrap .btn { width: 100%; justify-content: center; }
      }
    `;
    document.head.appendChild(style);
  }

  function handleClick(event) {
    const today = event.target.closest('#topTodayBtn, #topTodayGenreBtn, .tab-today-btn.dc-global-today-btn');
    if (today) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openTodayOrRecent();
      return;
    }

    const closeEditor = event.target.closest('[data-dg-close-song-editor]');
    if (closeEditor) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      closeSongEditor();
      return;
    }


    const addSongs = event.target.closest('[data-dg-open-song-editor]');
    if (addSongs) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      openSongEditor();
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    injectStyles();
    normalizeTopNavLabels();
    queueEnhance(40);

    document.addEventListener('click', handleClick, true);
    window.addEventListener('hashchange', () => queueEnhance(80));
    window.addEventListener('dailygenre:data-ready', () => queueEnhance(80));
    window.addEventListener('load', () => queueEnhance(120), { once: true });

    ['openGenreDetail', 'switchScreen', 'loadListenScreen', 'renderListenDetails'].forEach((name) => wrapHook(name, 90));

    window.DailyGenreToday = {
      ...(window.DailyGenreToday || {}),
      version: VERSION,
      open: openTodayOrRecent,
      todayGenres: todaysLoggedGenres,
      mostRecentGenre: mostRecentLoggedGenre,
      enhanceDig: enhanceDigPage,
    };
    window.DailyGenreDigHotfix = {
      version: VERSION,
      openSongEditor,
      closeSongEditor,
      enhance: enhanceDigPage,
    };

    console.info('[Daily Genre] Library polish performance rescue installed', VERSION);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
