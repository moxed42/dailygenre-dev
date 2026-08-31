/* Daily Genre v259 — true Genre Name + Aliases-only identity editor. */
(function installDailyGenreAliasEditor() {
  'use strict';

  const BUILD = 'v259';
  let selectedGenreId = '';
  let observer = null;
  let rendering = false;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const norm = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—―_/-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function currentGenreValue() {
    try {
      // eslint-disable-next-line no-eval
      return (0, eval)('currentGenre') || null;
    } catch (_) {
      return null;
    }
  }

  function aliasList(genre) {
    const values = [];
    [genre?.aliases, genre?.synonyms, genre?.aka, genre?.alternateNames, genre?.alternate_names]
      .forEach((field) => {
        if (Array.isArray(field)) values.push(...field);
        else if (typeof field === 'string') values.push(...field.split(/[,;|\n]/g));
      });
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  }

  function genreId(genre) {
    return String(genre?.id ?? genre?.genre ?? '');
  }

  function findGenre(id) {
    return genres().find(genre => genreId(genre) === String(id || '')) || null;
  }

  function bestGenreMatch(query) {
    const key = norm(query);
    if (!key) return null;
    return genres().find(genre => norm(genre.genre) === key)
      || genres().find(genre => aliasList(genre).some(alias => norm(alias) === key))
      || genres().find(genre => norm(genre.genre).startsWith(key))
      || null;
  }

  function resolveSelectedGenre(root) {
    const ids = [
      selectedGenreId,
      root?.dataset?.v259GenreId,
      root?.querySelector('[data-genre-id]')?.dataset?.genreId,
      genreId(currentGenreValue()),
    ].filter(Boolean);
    for (const id of ids) {
      const found = findGenre(id);
      if (found) {
        selectedGenreId = genreId(found);
        return found;
      }
    }
    const first = genres()[0] || null;
    if (first) selectedGenreId = genreId(first);
    return first;
  }

  function optionsHtml() {
    return genres()
      .slice()
      .sort((a, b) => String(a.genre || '').localeCompare(String(b.genre || '')))
      .map((genre) => {
        const aliases = aliasList(genre).slice(0, 3).join(', ');
        const label = aliases ? `${genre.genre} · aka ${aliases}` : genre.genre;
        return `<option value="${esc(label)}" data-id="${esc(genreId(genre))}"></option>`;
      })
      .join('');
  }

  function injectStyles() {
    if (document.getElementById('dg-v259-alias-editor-style')) return;
    const style = document.createElement('style');
    style.id = 'dg-v259-alias-editor-style';
    style.textContent = `
      #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-identity-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: end;
      }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-identity-fields {
        display: grid;
        grid-template-columns: minmax(220px, .8fr) minmax(280px, 1.2fr);
        gap: 14px;
        margin-top: 14px;
      }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] label { display: grid; gap: 6px; }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] label > span { font-weight: 850; }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-identity-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 14px;
      }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-alias-import {
        margin-top: 14px;
      }
      #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-alias-import textarea {
        width: 100%;
        margin-top: 10px;
      }
      @media (max-width: 720px) {
        #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-identity-grid,
        #genreIdentityWorkbench[data-v259-alias-editor="true"] .v259-identity-fields {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderEditor(root, genre) {
    if (!root || !genre) return;
    selectedGenreId = genreId(genre);
    root.dataset.v259AliasEditor = 'true';
    root.dataset.v259GenreId = selectedGenreId;
    root.dataset.v258AliasOnly = 'true';
    root.classList.remove('studio-section-collapsed');

    const aliases = aliasList(genre).join('\n');
    const pickerLabel = aliasList(genre).length
      ? `${genre.genre} · aka ${aliasList(genre).slice(0, 2).join(', ')}`
      : String(genre.genre || '');

    root.innerHTML = `
      <div class="studio-lane-head genre-identity-editor-head">
        <div>
          <div class="eyebrow">Genre Identity</div>
          <h3>Genre name and aliases</h3>
          <p>Seminal and Media tracks now come from role columns in the listened-song block.</p>
          <div class="genre-identity-status-line">${esc(aliasList(genre).length)} alias${aliasList(genre).length === 1 ? '' : 'es'} · queue-native listening anchors</div>
        </div>
        <div class="genre-identity-head-actions">
          <button type="button" class="btn btn-secondary btn-tiny" data-v259-open-genre>Open genre</button>
        </div>
      </div>

      <div class="v259-identity-grid genre-identity-picker">
        <label>
          <span>Choose genre record</span>
          <input id="v259GenreIdentityPick" type="search" list="v259GenreIdentityDatalist" value="${esc(pickerLabel)}" placeholder="Type a genre or alias…" autocomplete="off">
        </label>
        <datalist id="v259GenreIdentityDatalist">${optionsHtml()}</datalist>
        <button type="button" class="btn btn-secondary btn-tiny" data-v259-load>Load</button>
      </div>

      <div class="v259-identity-fields">
        <label>
          <span>Canonical genre name</span>
          <input id="v259GenreName" value="${esc(genre.genre || '')}" placeholder="Minimal Psytrance">
          <small>This is the primary name displayed throughout Daily Genre.</small>
        </label>
        <label>
          <span>Aliases / known synonyms</span>
          <textarea id="genreIdentityAliases" rows="5" placeholder="One alias per line">${esc(aliases)}</textarea>
          <small>Used by search and genre matching. Enter one alias per line.</small>
        </label>
      </div>

      <div class="v259-identity-actions">
        <button type="button" class="btn btn-primary" data-v259-save>Save genre identity</button>
        <span class="small">Tracks: use <code>| SEMINAL</code> or <code>| MEDIA | media title | media type</code> in the song block.</span>
      </div>

      <details class="v259-alias-import">
        <summary>Paste genre name and aliases block</summary>
        <textarea id="v259AliasBlockImport" rows="7" placeholder="GENRE: Minimal Psytrance\n\nALIASES:\nZenonesque\nMinimal Psy"></textarea>
        <div class="v259-identity-actions">
          <button type="button" class="btn btn-secondary btn-tiny" data-v259-parse>Parse into fields</button>
          <button type="button" class="btn btn-primary btn-tiny" data-v259-apply-block>Apply & Save</button>
        </div>
      </details>
    `;
  }

  function parseAliasBlock(text) {
    const result = { genre: '', aliases: [] };
    let section = '';
    String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      const header = line.match(/^([A-Z_ ]+)\s*:\s*(.*)$/i);
      if (header) {
        const key = header[1].trim().toUpperCase().replace(/\s+/g, '_');
        const value = header[2].trim();
        if (key === 'GENRE' || key === 'GENRE_NAME') {
          result.genre = value;
          section = '';
          return;
        }
        if (key === 'ALIASES' || key === 'SYNONYMS') {
          section = 'aliases';
          if (value) result.aliases.push(...value.split(/[,;|]/g));
          return;
        }
      }
      if (section === 'aliases') result.aliases.push(line);
    });
    result.aliases = [...new Set(result.aliases.map(value => String(value || '').trim()).filter(Boolean))];
    return result;
  }

  function fillFromBlock(root) {
    const parsed = parseAliasBlock(root.querySelector('#v259AliasBlockImport')?.value || '');
    if (parsed.genre) root.querySelector('#v259GenreName').value = parsed.genre;
    if (parsed.aliases.length) root.querySelector('#genreIdentityAliases').value = parsed.aliases.join('\n');
    return parsed;
  }

  function markDirty(message) {
    try {
      if (typeof window.markLibraryUpdatesPending === 'function') {
        window.markLibraryUpdatesPending(message || 'Genre identity updated.', { studioMutation: true });
        return;
      }
    } catch (_) {}
    try {
      if (typeof window.setUnsavedState === 'function') window.setUnsavedState(true);
    } catch (_) {}
  }

  async function saveEditor(root) {
    const genre = findGenre(root.dataset.v259GenreId || selectedGenreId);
    if (!genre) return false;
    const name = String(root.querySelector('#v259GenreName')?.value || '').trim();
    const aliases = String(root.querySelector('#genreIdentityAliases')?.value || '')
      .split(/[\n,;|]/g)
      .map(value => value.trim())
      .filter(Boolean);
    const uniqueAliases = [...new Set(aliases.filter(alias => norm(alias) !== norm(name)))];

    if (!name) {
      window.alert('Enter a canonical genre name before saving.');
      return false;
    }

    const conflicting = genres().find(other => other !== genre && norm(other.genre) === norm(name));
    if (conflicting) {
      window.alert(`A genre named “${conflicting.genre}” already exists. Choose a unique canonical name.`);
      return false;
    }

    genre.genre = name;
    genre.aliases = uniqueAliases;
    genre.synonyms = uniqueAliases.slice();
    selectedGenreId = genreId(genre);
    root.dataset.v259GenreId = selectedGenreId;
    markDirty('Genre name and aliases updated.');

    try {
      if (typeof window.saveLibraryUpdates === 'function') {
        await window.saveLibraryUpdates();
      }
    } catch (error) {
      console.error('[Daily Genre] Genre identity save failed.', error);
      return false;
    }

    renderEditor(root, genre);
    return true;
  }

  function handleClick(event) {
    const root = event.target.closest('#genreIdentityWorkbench[data-v259-alias-editor="true"]');
    if (!root) return;

    if (event.target.closest('[data-v259-load]')) {
      const input = root.querySelector('#v259GenreIdentityPick');
      const datalistOption = Array.from(root.querySelectorAll('#v259GenreIdentityDatalist option'))
        .find(option => option.value === input.value);
      const genre = findGenre(datalistOption?.dataset?.id) || bestGenreMatch(input.value);
      if (!genre) {
        window.alert('No matching genre was found.');
        return;
      }
      selectedGenreId = genreId(genre);
      renderEditor(root, genre);
      return;
    }

    if (event.target.closest('[data-v259-open-genre]')) {
      const genre = findGenre(root.dataset.v259GenreId || selectedGenreId);
      try {
        if (genre && typeof window.DailyGenreIdentity?.openGenre === 'function') {
          window.DailyGenreIdentity.openGenre(genreId(genre));
        }
      } catch (_) {}
      return;
    }

    if (event.target.closest('[data-v259-parse]')) {
      fillFromBlock(root);
      return;
    }

    if (event.target.closest('[data-v259-apply-block]')) {
      fillFromBlock(root);
      void saveEditor(root);
      return;
    }

    if (event.target.closest('[data-v259-save]')) {
      void saveEditor(root);
    }
  }

  function installEditor() {
    if (rendering) return;
    const root = document.getElementById('genreIdentityWorkbench');
    if (!root) return;
    if (root.dataset.v259AliasEditor === 'true' && root.querySelector('#v259GenreName')) return;
    const genre = resolveSelectedGenre(root);
    if (!genre) return;
    rendering = true;
    try {
      injectStyles();
      renderEditor(root, genre);
    } finally {
      rendering = false;
    }
  }

  document.addEventListener('click', handleClick);
  installEditor();

  observer = new MutationObserver(() => installEditor());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.dailyGenreAliasEditorDiagnostics = function diagnostics() {
    const root = document.getElementById('genreIdentityWorkbench');
    return {
      build: BUILD,
      installed: true,
      aliasOnlyEditor: Boolean(root?.dataset?.v259AliasEditor === 'true'),
      selectedGenreId: root?.dataset?.v259GenreId || selectedGenreId,
      hasGenreNameField: Boolean(root?.querySelector('#v259GenreName')),
      hasAliasesField: Boolean(root?.querySelector('#genreIdentityAliases')),
      hasLegacySeminalFields: Boolean(root?.querySelector('#genreSeminalArtist, #genreSeminalTitle, #genreSeminalUrl, #genreSeminalReason')),
      hasLegacyMediaFields: Boolean(root?.querySelector('#genreMediaRows, #genreAddMediaBtn')),
    };
  };

  console.info('[Daily Genre] v259 aliases-only identity editor installed.', window.dailyGenreAliasEditorDiagnostics());
})();
