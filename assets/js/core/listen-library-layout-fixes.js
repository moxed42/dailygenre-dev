/* Daily Genre v267 — responsive Library filters + Genre DNA ordering. */
(function installDailyGenreV267LayoutFixes() {
  'use strict';

  const BUILD = 'v267';
  let observer = null;
  let queued = false;

  function findLibraryFilterRow() {
    const screen = document.getElementById('screen-history');
    if (!screen) return null;

    const selects = Array.from(screen.querySelectorAll('select'));
    const statusSelect = selects.find(select =>
      Array.from(select.options || []).some(option =>
        /unlistened genres|listened genres|any flags/i.test(option.textContent || '')
      )
    );
    const categorySelect = document.getElementById('libraryParentCategoryFilter');
    const sortSelect = selects.find(select =>
      Array.from(select.options || []).some(option =>
        /newest first|oldest first/i.test(option.textContent || '')
      )
    );

    const anchors = [statusSelect, categorySelect, sortSelect].filter(Boolean);
    if (anchors.length < 2) return null;

    let node = anchors[0].parentElement;
    while (node && node !== screen && node !== document.body) {
      if (anchors.every(anchor => node.contains(anchor))) {
        const controlCount =
          node.querySelectorAll('select, input[type="search"], input[type="text"]').length;
        if (controlCount >= 4) return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  function normalizeLibraryFilterLayout() {
    const row = findLibraryFilterRow();
    if (!row) return false;

    row.classList.add('dg-v267-library-filter-row');
    row.style.display = 'grid';
    row.style.gridTemplateColumns =
      'repeat(auto-fit, minmax(min(100%, 220px), 1fr))';
    row.style.gap = '12px';
    row.style.alignItems = 'stretch';
    row.style.width = '100%';
    row.style.maxWidth = '100%';
    row.style.overflow = 'visible';

    Array.from(row.children).forEach(child => {
      child.classList.add('dg-v267-library-filter-cell');
      child.style.minWidth = '0';
      child.style.maxWidth = '100%';
      child.style.width = '100%';
      child.style.margin = '0';
    });

    row.querySelectorAll('select, input[type="search"], input[type="text"]').forEach(control => {
      control.style.width = '100%';
      control.style.maxWidth = '100%';
      control.style.minWidth = '0';
      control.style.boxSizing = 'border-box';
    });

    const categoryWrap = document.getElementById('libraryParentCategoryFilterWrap');
    if (categoryWrap) {
      categoryWrap.style.minWidth = '0';
      categoryWrap.style.width = '100%';
      categoryWrap.style.maxWidth = '100%';
    }

    return true;
  }

  function placeDnaBeforeAddSongs() {
    const details = document.getElementById('listenDetails');
    if (!details) return false;

    const dna = details.querySelector('.genre-identity-dna');
    const addSongs = details.querySelector(
      '.dg-song-editor-callout, [data-dg-open-song-editor], .dc-add-songs-section'
    );

    if (!dna || !addSongs) return false;

    const addSection =
      addSongs.closest('.dg-song-editor-callout, .dc-add-songs-section') ||
      addSongs.parentElement;

    if (!addSection || addSection === dna) return false;

    if (dna.nextElementSibling !== addSection) {
      addSection.insertAdjacentElement('beforebegin', dna);
    }

    dna.dataset.v267BeforeAddSongs = 'true';
    return true;
  }

  function injectStyles() {
    if (document.getElementById('dg-v267-layout-style')) return;

    const style = document.createElement('style');
    style.id = 'dg-v267-layout-style';
    style.textContent = `
      #screen-history .dg-v267-library-filter-row {
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)) !important;
        gap: 12px !important;
        align-items: stretch !important;
        width: 100% !important;
        max-width: 100% !important;
        overflow: visible !important;
      }

      #screen-history .dg-v267-library-filter-row > * {
        min-width: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
      }

      #screen-history .dg-v267-library-filter-row select,
      #screen-history .dg-v267-library-filter-row input[type="search"],
      #screen-history .dg-v267-library-filter-row input[type="text"],
      #screen-history #libraryParentCategoryFilter {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        box-sizing: border-box !important;
      }

      #screen-history #libraryParentCategoryFilterWrap {
        min-width: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
      }

      @media (max-width: 760px) {
        #screen-history .dg-v267-library-filter-row {
          grid-template-columns: 1fr !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function refresh() {
    queued = false;
    normalizeLibraryFilterLayout();
    placeDnaBeforeAddSongs();
  }

  function queueRefresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
  }

  function boot() {
    injectStyles();
    refresh();

    observer = new MutationObserver(queueRefresh);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('click', event => {
      if (
        event.target.closest('[data-screen="history"], #screen-history') ||
        event.target.closest('[data-screen="listen"], #screen-listen') ||
        event.target.closest('[onclick*="openGenre"], [data-genre-id]')
      ) {
        setTimeout(refresh, 60);
        setTimeout(refresh, 180);
      }
    }, true);
  }

  window.dailyGenreV267LayoutDiagnostics = function diagnostics() {
    const row = findLibraryFilterRow();
    const details = document.getElementById('listenDetails');
    const dna = details?.querySelector('.genre-identity-dna');
    const addSongs =
      details?.querySelector('.dg-song-editor-callout, .dc-add-songs-section') ||
      details?.querySelector('[data-dg-open-song-editor]')?.parentElement;

    return {
      build: BUILD,
      installed: true,
      libraryFilterRowFound: Boolean(row),
      libraryFilterGridApplied: Boolean(
        row?.classList.contains('dg-v267-library-filter-row')
      ),
      parentCategoryVisible: Boolean(
        document.getElementById('libraryParentCategoryFilter')?.offsetParent
      ),
      dnaFound: Boolean(dna),
      addSongsFound: Boolean(addSongs),
      dnaImmediatelyBeforeAddSongs: Boolean(
        dna && addSongs && dna.nextElementSibling === addSongs
      ),
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  console.info('[Daily Genre] v267 layout fixes installed.');
})();