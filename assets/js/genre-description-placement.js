/* Daily Genre v265 — always show genre.summary in Genre DNA above aliases. */
(function installDailyGenreAlwaysVisibleDnaDefinition() {
  'use strict';

  const BUILD = 'v265';
  let observer = null;
  let scheduled = false;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function currentGenreValue() {
    try {
      // eslint-disable-next-line no-eval
      const value = (0, eval)('currentGenre');
      if (value && typeof value === 'object') return value;
    } catch (_) {}

    const root = document.getElementById('listenDetails');
    const title = root?.querySelector(
      '.detail-record-card h2, .detail-record-card .genre-title, .detail-hero h2, .dc-genre-hero h2, .dc-hero-title'
    )?.textContent?.trim() || '';

    if (!title) return null;
    return genres().find(genre => String(genre?.genre || '').trim() === title) || null;
  }

  function summaryForGenre(genre) {
    // This is intentionally the exact field used by the genre page/Discord copy.
    return String(genre?.summary || '').trim();
  }

  function ensureStyles() {
    if (document.getElementById('dg-v265-dna-definition-style')) return;
    const style = document.createElement('style');
    style.id = 'dg-v265-dna-definition-style';
    style.textContent = `
      #listenDetails .genre-identity-dna .genre-identity-definition-card {
        margin: 0 0 12px;
        padding: 13px 15px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--surface) 88%, transparent);
      }
      #listenDetails .genre-identity-dna .genre-identity-definition-card span {
        display: block;
        margin-bottom: 5px;
        color: var(--muted);
        font-size: .72rem;
        font-weight: 900;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      #listenDetails .genre-identity-dna .genre-identity-definition-card p {
        margin: 0;
        color: var(--text);
        font-size: .96rem;
        line-height: 1.55;
      }
      #listenDetails .genre-identity-dna[data-v265-summary-only="true"] {
        margin-top: 16px;
      }
    `;
    document.head.appendChild(style);
  }

  function createMinimalDna(root) {
    const section = document.createElement('section');
    section.className = 'genre-identity-dna';
    section.setAttribute('aria-label', 'Genre DNA');
    section.dataset.v265SummaryOnly = 'true';
    section.innerHTML = `
      <div class="genre-identity-dna-head">
        <div>
          <div class="eyebrow">Genre DNA</div>
          <h3>Definition and identity</h3>
          <p class="small">Core context for this genre.</p>
        </div>
      </div>
    `;

    const anchor = root.querySelector(
      '.song-listening-room, .dc-song-listening-section, .listening-focus-section-shell, .album-dive-panel, .detail-log-section, #dc-songs'
    );

    if (anchor) {
      anchor.insertAdjacentElement('beforebegin', section);
      return section;
    }

    const consoleWrap = root.querySelector('.discovery-console');
    if (consoleWrap) {
      const insertAfter = consoleWrap.querySelector(
        '.dc-vibe-line, .dc-progress-strip, .detail-record-card'
      );
      if (insertAfter) insertAfter.insertAdjacentElement('afterend', section);
      else consoleWrap.insertAdjacentElement('afterbegin', section);
      return section;
    }

    const hero = root.querySelector('.detail-hero');
    if (hero) hero.insertAdjacentElement('afterend', section);
    else root.insertAdjacentElement('afterbegin', section);
    return section;
  }

  function ensureDnaSection(root, genre) {
    let dna = root.querySelector('.genre-identity-dna');
    if (dna) return dna;

    if (!summaryForGenre(genre)) return null;
    return createMinimalDna(root);
  }

  function restoreDefinition() {
    const root = document.getElementById('listenDetails');
    if (!root) return false;

    // Remove the old incorrect header-level placement if present.
    root.querySelectorAll('.genre-identity-description-line').forEach(element => element.remove());

    const genre = currentGenreValue();
    if (!genre) return false;

    const summary = summaryForGenre(genre);
    const dna = ensureDnaSection(root, genre);
    if (!dna) return false;

    let card = dna.querySelector('.genre-identity-definition-card');

    if (!summary) {
      card?.remove();

      // Remove only the minimal section created by this patch.
      if (dna.dataset.v265SummaryOnly === 'true') dna.remove();
      return false;
    }

    if (!card) {
      card = document.createElement('div');
      card.className = 'genre-identity-definition-card';
    }

    card.dataset.genreId = String(genre.id ?? genre.genre ?? '');
    card.innerHTML = `<span>Definition</span><p>${esc(summary)}</p>`;

    const aliasCard = dna.querySelector('.genre-identity-alias-card');
    const trackGrid = dna.querySelector('.genre-identity-track-grid');
    const head = dna.querySelector('.genre-identity-dna-head');

    // Required order: heading → definition → aliases → tracks.
    if (aliasCard) {
      aliasCard.insertAdjacentElement('beforebegin', card);
    } else if (trackGrid) {
      trackGrid.insertAdjacentElement('beforebegin', card);
    } else if (head) {
      head.insertAdjacentElement('afterend', card);
    } else {
      dna.insertAdjacentElement('afterbegin', card);
    }

    return true;
  }

  function scheduleRestore() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      restoreDefinition();
    });
  }

  function boot() {
    ensureStyles();
    restoreDefinition();

    const listenRoot =
      document.getElementById('screen-listen') ||
      document.getElementById('listenDetails') ||
      document.body;

    if (typeof MutationObserver === 'function') {
      observer = new MutationObserver(scheduleRestore);
      observer.observe(listenRoot, { childList: true, subtree: true });
    }

    document.addEventListener('click', event => {
      if (
        event.target.closest('[data-screen="listen"], #screen-listen') ||
        event.target.closest('[onclick*="openGenre"], [data-genre-id]')
      ) {
        setTimeout(restoreDefinition, 60);
        setTimeout(restoreDefinition, 160);
        setTimeout(restoreDefinition, 320);
      }
    }, true);
  }

  window.dailyGenreDnaDefinitionDiagnostics = function diagnostics() {
    const genre = currentGenreValue();
    const root = document.getElementById('listenDetails');
    const dna = root?.querySelector('.genre-identity-dna');
    const card = dna?.querySelector('.genre-identity-definition-card');
    const alias = dna?.querySelector('.genre-identity-alias-card');

    return {
      build: BUILD,
      installed: true,
      genre: genre?.genre || '',
      listenedDate: String(
        genre?.date_normalized ||
        genre?.datenormalized ||
        genre?.date ||
        ''
      ).slice(0, 10),
      summaryPresent: Boolean(summaryForGenre(genre)),
      dnaVisible: Boolean(dna),
      definitionVisibleInDna: Boolean(card),
      definitionImmediatelyBeforeAliases: Boolean(
        card && alias && card.nextElementSibling === alias
      ),
      minimalDnaCreated: dna?.dataset.v265SummaryOnly === 'true',
      exactSourceField: 'summary',
      headerDefinitionRemoved: !root?.querySelector('.genre-identity-description-line'),
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  console.info('[Daily Genre] v265 always-visible Genre DNA definition installed.');
})();