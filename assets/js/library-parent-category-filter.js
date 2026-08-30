/* Daily Genre v266 — reliable Library parent-category filter mount + filtering. */
(function installDailyGenreLibraryParentCategoryFilter() {
  'use strict';

  const BUILD = 'v266';
  const STORAGE_KEY = 'dailyGenreLibraryParentCategory:v266';
  let selectedCategory = '';
  let originalFilter = null;
  let filterWrapped = false;
  let observer = null;
  let refreshQueued = false;

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanLabel(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeGet() {
    try { return localStorage.getItem(STORAGE_KEY) || ''; } catch (_) { return ''; }
  }

  function safeSet(value) {
    try { localStorage.setItem(STORAGE_KEY, value || ''); } catch (_) {}
  }

  function parentCategory(genre) {
    const explicit =
      genre?.parent_category ||
      genre?.parentCategory ||
      genre?.category_parent ||
      genre?.categoryParent ||
      genre?.top_category ||
      genre?.topCategory ||
      '';

    if (String(explicit).trim()) return cleanLabel(explicit);

    const path = String(
      genre?.category_path ||
      genre?.categoryPath ||
      genre?.taxonomy_path ||
      genre?.taxonomyPath ||
      ''
    ).trim();

    if (path) {
      const parts = path
        .split(/\s*(?:>|→|»|\/|\||::)\s*/g)
        .map(cleanLabel)
        .filter(Boolean);
      if (parts.length) return parts[0];
    }

    return cleanLabel(
      genre?.category ||
      genre?.genre_category ||
      genre?.genreCategory ||
      ''
    );
  }

  function categoryOptions() {
    const byKey = new Map();

    genres().forEach(genre => {
      const label = parentCategory(genre);
      const key = normalize(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    });

    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }

  function matchesCategory(genre) {
    if (!selectedCategory) return true;
    return normalize(parentCategory(genre)) === normalize(selectedCategory);
  }

  function getBinding(name) {
    try {
      // eslint-disable-next-line no-eval
      return (0, eval)(name);
    } catch (_) {
      return window[name];
    }
  }

  function installGlobal(name, value) {
    try { window[name] = value; } catch (_) {}
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(`${name} = window[${JSON.stringify(name)}]`);
    } catch (_) {}
  }

  function wrapArchiveFilter() {
    if (filterWrapped) return true;

    const candidate = getBinding('filterGenresForArchive');
    if (typeof candidate !== 'function') return false;

    originalFilter = candidate;

    const wrapped = function categoryAwareFilterGenresForArchive(...args) {
      const result = originalFilter.apply(this, args);
      if (!Array.isArray(result) || !selectedCategory) return result;
      return result.filter(matchesCategory);
    };

    installGlobal('filterGenresForArchive', wrapped);
    filterWrapped = true;
    return true;
  }

  function findStatusSelect() {
    const direct =
      document.getElementById('archiveFlagFilter') ||
      document.getElementById('historyStatusFilter') ||
      document.getElementById('archiveStatusFilter');

    if (direct) return direct;

    return Array.from(
      document.querySelectorAll('#screen-history select')
    ).find(select =>
      Array.from(select.options || []).some(option =>
        /unlistened genres|listened genres/i.test(option.textContent || '')
      )
    ) || null;
  }

  function findSortSelect() {
    const direct =
      document.getElementById('archiveSortFilter') ||
      document.getElementById('historySortFilter');

    if (direct) return direct;

    return Array.from(
      document.querySelectorAll('#screen-history select')
    ).find(select =>
      Array.from(select.options || []).some(option =>
        /newest first|oldest first/i.test(option.textContent || '')
      )
    ) || null;
  }

  function controlContainer(element) {
    if (!element) return null;

    return (
      element.closest(
        '.archive-filter-control, .history-filter-control, .filter-control, label'
      ) ||
      element.parentElement
    );
  }

  function actualFilterRow() {
    const status = findStatusSelect();
    const sort = findSortSelect();

    if (status && sort) {
      let node = status.parentElement;
      while (node && node !== document.body) {
        if (node.contains(sort) && node.querySelectorAll('select').length >= 4) {
          return node;
        }
        node = node.parentElement;
      }
    }

    const search =
      document.getElementById('archiveSearchInput') ||
      document.getElementById('historySearch') ||
      document.getElementById('archiveSearch');

    if (search) {
      let node = search.parentElement;
      while (node && node !== document.body) {
        if (node.querySelectorAll('select').length >= 3) return node;
        node = node.parentElement;
      }
    }

    return document.querySelector('#screen-history .archive-filters, #screen-history .history-filters');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function buildSelectOptions() {
    const values = categoryOptions();
    const selectedStillExists = values.some(
      value => normalize(value) === normalize(selectedCategory)
    );

    if (selectedCategory && !selectedStillExists) {
      selectedCategory = '';
      safeSet('');
    }

    return [
      '<option value="">All parent categories</option>',
      ...values.map(value => {
        const selected =
          normalize(value) === normalize(selectedCategory)
            ? ' selected'
            : '';
        const escaped = escapeHtml(value);
        return `<option value="${escaped}"${selected}>${escaped}</option>`;
      }),
    ].join('');
  }

  function mountControl() {
    const screen = document.getElementById('screen-history');
    if (!screen) return false;

    const row = actualFilterRow();
    if (!row) return false;

    let wrapper = document.getElementById('libraryParentCategoryFilterWrap');
    let select = document.getElementById('libraryParentCategoryFilter');

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'libraryParentCategoryFilterWrap';
      wrapper.className = 'library-parent-category-filter archive-filter-control';
      wrapper.innerHTML = `
        <select
          id="libraryParentCategoryFilter"
          aria-label="Parent category"
          title="Filter by parent category"
        ></select>
      `;

      const sort = findSortSelect();
      const sortContainer = controlContainer(sort);

      if (sortContainer && sortContainer.parentElement === row) {
        row.insertBefore(wrapper, sortContainer);
      } else if (sort && sort.parentElement === row) {
        row.insertBefore(wrapper, sort);
      } else {
        row.appendChild(wrapper);
      }

      select = wrapper.querySelector('select');
      select.addEventListener('change', event => {
        selectedCategory = String(event.target.value || '');
        safeSet(selectedCategory);
        invalidateLibraryCache();
        rerenderLibrary();
      });
    }

    const options = buildSelectOptions();
    if (select && select.innerHTML !== options) select.innerHTML = options;
    if (select) select.value = selectedCategory;

    wrapper.dataset.v266Mounted = 'true';
    return true;
  }

  function invalidateLibraryCache() {
    try {
      if (typeof window.dailyGenreScreenCacheInvalidate === 'function') {
        window.dailyGenreScreenCacheInvalidate('library-parent-category');
      }
    } catch (_) {}
  }

  function rerenderLibrary() {
    const render = getBinding('renderHistory');
    if (typeof render === 'function') {
      try {
        render();
        queueRefresh();
        return true;
      } catch (error) {
        console.warn('[Daily Genre] Library rerender failed.', error);
      }
    }

    try {
      if (typeof window.switchScreen === 'function') {
        window.switchScreen('history', { force: true });
        queueRefresh();
        return true;
      }
    } catch (_) {}

    return false;
  }

  function injectStyles() {
    if (document.getElementById('dg-v266-library-category-style')) return;

    const style = document.createElement('style');
    style.id = 'dg-v266-library-category-style';
    style.textContent = `
      #screen-history #libraryParentCategoryFilterWrap {
        min-width: 220px;
      }

      #screen-history #libraryParentCategoryFilter {
        width: 100%;
        min-height: 48px;
        padding: 0 42px 0 16px;
        border: 1px solid var(--border);
        border-radius: 15px;
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }

      @media (max-width: 980px) {
        #screen-history #libraryParentCategoryFilterWrap {
          min-width: min(100%, 220px);
        }
      }

      @media (max-width: 720px) {
        #screen-history #libraryParentCategoryFilterWrap {
          width: 100%;
          min-width: 0;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function refresh() {
    refreshQueued = false;
    wrapArchiveFilter();
    mountControl();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  }

  function boot() {
    selectedCategory = safeGet();
    injectStyles();
    refresh();

    const screen = document.getElementById('screen-history') || document.body;
    observer = new MutationObserver(queueRefresh);
    observer.observe(screen, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      if (
        event.target.closest('[data-screen="history"], #screen-history') ||
        /refresh results/i.test(event.target.textContent || '')
      ) {
        setTimeout(refresh, 50);
        setTimeout(refresh, 160);
      }
    }, true);
  }

  window.dailyGenreLibraryCategoryDiagnostics = function diagnostics() {
    const status = findStatusSelect();
    const sort = findSortSelect();
    const row = actualFilterRow();
    const select = document.getElementById('libraryParentCategoryFilter');

    return {
      build: BUILD,
      installed: true,
      selectedCategory,
      filterWrapped,
      categoryCount: categoryOptions().length,
      categories: categoryOptions(),
      statusSelectFound: Boolean(status),
      sortSelectFound: Boolean(sort),
      filterRowFound: Boolean(row),
      controlVisible: Boolean(
        select &&
        select.offsetParent !== null
      ),
      controlParentTag: select?.parentElement?.parentElement?.tagName || '',
      matchingGenreCount: genres().filter(matchesCategory).length,
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  console.info('[Daily Genre] v266 Library category filter mount fix installed.');
})();