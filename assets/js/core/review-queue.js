function normalizeGenreNameForDedupe(value) {
  return normalizePendingTag(value);
}

function findDuplicateGenreGroups(list = genres) {
  const map = new Map();

  (list || []).forEach(g => {
    const key = normalizeGenreNameForDedupe(g?.genre || '');
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  });

  return [...map.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
}

function duplicateGenreSummary(groups, limit = 8) {
  return (groups || []).slice(0, limit).map(group => {
    const label = group.rows[0]?.genre || group.key;
    const ids = group.rows.map(g => g.id ?? '?').join(', ');
    return `${label} (${ids})`;
  }).join('\n');
}

function warnDuplicateGenresOnLoad() {
  const groups = findDuplicateGenreGroups(genres);
  if (!groups.length) return;

  console.warn('[Daily Genre] Duplicate genres found', groups);
  showSaveToast(
    `${groups.length} duplicate genre name${groups.length === 1 ? '' : 's'} found. Clean JSON before routing review items.`,
    true
  );
}

function blockSaveIfDuplicateGenres() {
  const groups = findDuplicateGenreGroups(genres);
  if (!groups.length) return false;

  const names = duplicateGenreSummary(groups, 10);
  alert(`Duplicate genres detected. Save blocked until cleaned:\n\n${names}`);
  console.warn('[Daily Genre] Save blocked because duplicate genres exist', groups);
  showSaveToast(`${groups.length} duplicate genre name${groups.length === 1 ? '' : 's'} must be cleaned before saving.`, true);
  return true;
}
    
    function resolvePendingTargetGenre(tag, sourceGenreId) {
      const wanted = normalizePendingTag(tag);
      if (!wanted) return { target: null, ambiguous: false };
      const candidates = genres.filter(g => g && String(g.id) !== String(sourceGenreId) && g.genre);
      const exact = candidates.filter(g => normalizePendingTag(g.genre) === wanted);
      if (exact.length === 1) return { target: exact[0], ambiguous: false };
      if (exact.length > 1) return { target: null, ambiguous: true };

      const near = candidates.filter(g => levenshtein(normalizePendingTag(g.genre), wanted) <= 2);
      if (near.length === 1) return { target: near[0], ambiguous: false };
      return { target: null, ambiguous: near.length > 1 };
    }

    function genresMatchPendingTag(tag, genreName) {
      return normalizePendingTag(tag) === normalizePendingTag(genreName);
    }

    function queuePendingNomination(target, sourceGenreName, songData) {
      if (!target || !songData) return false;
      target.pending_songs = normalizePendingSongs(target.pending_songs || []);
      target.songs_listened = inflateSongsFromStorage(target.songs_listened || []).filter(s => !s.isPending);
      const key = songIdentity(songData);
      if (!key) return false;
      if (target.songs_listened.some(song => songIdentity(song) === key)) return false;

      const existing = target.pending_songs.find(song => songIdentity(song) === key);
      if (existing) {
        let repaired = false;
        if (!existing.pendingFrom && sourceGenreName) { existing.pendingFrom = sourceGenreName; repaired = true; }
        if (existing.originFit == null && songData.score != null) { existing.originFit = Number(songData.score); repaired = true; }
        if (!existing.title && songData.title) { existing.title = songData.title; repaired = true; }
        if (!existing.artist && songData.artist) { existing.artist = songData.artist; repaired = true; }
        if (!existing.artwork && songData.artwork) { existing.artwork = songData.artwork; repaired = true; }
        return repaired;
      }

      target.pending_songs.push({
        ...songData,
        url: normalizeSongUrl(songData.url || ''),
        isPending: true,
        pendingFrom: sourceGenreName || '',
        originFit: songData.score != null ? Number(songData.score) : null,
        nominatedFit: null,
        isLevelUp: false,
        isAdd: false,
        levelUp: null
      });
      return true;
    }

    function processPendingNominationsForGenre(sourceGenre) {
      if (!sourceGenre) return 0;
      let added = 0;
      const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
      sourceGenre.songs_listened = sourceSongs;
      for (const song of sourceSongs) {
        if (!song._pendingGenreTag || song.score == null || Number(song.score) > 3) continue;
        const resolved = resolvePendingTargetGenre(song._pendingGenreTag, sourceGenre.id);
        const target = resolved.target;
        if (!target) continue;
        const pendingSong = {
          url: song.url || '',
          score: song.score ?? null,
          reason: song.reason || '',
          title: song.title || '',
          artist: song.artist || '',
          artwork: song.artwork || '',
          source: song.source || '',
          spotifyId: song.spotifyId || '',
          spotifyUrl: song.spotifyUrl || '',
          album: song.album || '',
          artists: Array.isArray(song.artists) ? song.artists.slice() : [],
          durationMs: song.durationMs || null,
          isrc: song.isrc || '',
          releaseDate: song.releaseDate || '',
          releaseYear: song.releaseYear || null,
          releasePrecision: song.releasePrecision || '',
          releaseSource: song.releaseSource || '',
          spotifyMetadataFetched: !!song.spotifyMetadataFetched,
          spotifyMetadataFetchedAt: song.spotifyMetadataFetchedAt || '',
          added: song.added || new Date().toISOString().slice(0,10)
        };
        if (queuePendingNomination(target, sourceGenre.genre, pendingSong)) added += 1;
      }
      return added;
    }

    function removeLoggedSongsFromPending(genre) {
      if (!genre) return;
      const loggedKeys = new Set(inflateSongsFromStorage(genre.songs_listened || []).filter(song => !song.isPending).map(songIdentity));
      genre.pending_songs = normalizePendingSongs(genre.pending_songs || []).filter(song => !loggedKeys.has(songIdentity(song)));
    }


    function repairExistingPendingSources() {
      let repaired = 0;
      genres.forEach(sourceGenre => {
        const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
        sourceSongs.forEach(song => {
          if (!song._pendingGenreTag || song.score == null || Number(song.score) > 3) return;
          const target = resolvePendingTargetGenre(song._pendingGenreTag, sourceGenre.id).target;
          if (!target) return;
          target.pending_songs = normalizePendingSongs(target.pending_songs || []);
          const pending = target.pending_songs.find(candidate => songIdentity(candidate) === songIdentity(song));
          if (!pending) return;
          if (!pending.pendingFrom) { pending.pendingFrom = sourceGenre.genre || ''; repaired += 1; }
          if (pending.originFit == null) { pending.originFit = Number(song.score); repaired += 1; }
        });
      });
      return repaired;
    }

    function pendingReviewSongPayload(song) {
      return {
        url: song.url || '',
        score: song.score ?? null,
        reason: song.reason || '',
        title: song.title || '',
        artist: song.artist || '',
        artwork: song.artwork || '',
        source: song.source || '',
        spotifyId: song.spotifyId || '',
        spotifyUrl: song.spotifyUrl || '',
        album: song.album || '',
        artists: Array.isArray(song.artists) ? song.artists.slice() : [],
        durationMs: song.durationMs || null,
        isrc: song.isrc || '',
        releaseDate: song.releaseDate || '',
        releaseYear: song.releaseYear || null,
        releasePrecision: song.releasePrecision || '',
        releaseSource: song.releaseSource || '',
        spotifyMetadataFetched: !!song.spotifyMetadataFetched,
        spotifyMetadataFetchedAt: song.spotifyMetadataFetchedAt || '',
        eraYear: song.eraYear || '',
        eraDecade: song.eraDecade || '',
        added: song.added || new Date().toISOString().slice(0,10)
      };
    }

    function collectPendingTagReviewRows() {
      const rows = [];
      (genres || []).forEach(sourceGenre => {
        const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
        sourceSongs.forEach(song => {
          if (!song._pendingGenreTag || song.score == null || Number(song.score) > 3) return;
          const resolution = resolvePendingTargetGenre(song._pendingGenreTag, sourceGenre.id);
          rows.push({
            sourceGenre,
            song,
            tag: song._pendingGenreTag,
            key: songIdentity(song),
            resolution,
            status: resolution.target ? 'routable' : (resolution.ambiguous ? 'ambiguous' : 'unresolved')
          });
        });
      });
      return rows;
    }

    function reexaminePendingTags(options = {}) {
      let added = 0;
      let removed = 0;
      let unresolved = 0;
      const unresolvedRows = [];

      genres.forEach(sourceGenre => {
        const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
        sourceSongs.forEach(song => {
          if (!song._pendingGenreTag || song.score == null || Number(song.score) > 3) return;
          const resolution = resolvePendingTargetGenre(song._pendingGenreTag, sourceGenre.id);
          const target = resolution.target;
          if (!target) {
            unresolved += 1;
            unresolvedRows.push({ sourceGenre, song, tag: song._pendingGenreTag, ambiguous: !!resolution.ambiguous });
            return;
          }

          const key = songIdentity(song);
          genres.forEach(possibleTarget => {
            if (String(possibleTarget.id) === String(target.id)) return;
            const pending = normalizePendingSongs(possibleTarget.pending_songs || []);
            const kept = pending.filter(candidate => {
              const fromSameSource = normalizePendingTag(candidate.pendingFrom || '') === normalizePendingTag(sourceGenre.genre || '');
              return !(fromSameSource && songIdentity(candidate) === key);
            });
            removed += pending.length - kept.length;
            possibleTarget.pending_songs = kept;
          });

          if (queuePendingNomination(target, sourceGenre.genre, pendingReviewSongPayload(song))) added += 1;
        });
      });

      if (added || removed) {
        setUnsavedState(true);
        if (currentGenre) {
          const restore = preserveScrollSnapshot();
          loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
          restore();
        }
        showSaveToast(`Pending review updated: ${added} queued, ${removed} misplaced removed.${unresolved ? ` ${unresolved} tag${unresolved === 1 ? '' : 's'} need manual review.` : ''}`);
      } else if (unresolved) {
        showSaveToast(`${unresolved} pending tag${unresolved === 1 ? '' : 's'} could not be routed automatically.`, true);
      } else if (!options.silent) {
        showSaveToast('No pending routing changes found.');
      }
      if (document.getElementById('screen-review')?.classList.contains('active')) renderReview();
      return { added, removed, unresolved, unresolvedRows };
    }

    function pendingReviewStats() {
      const rows = collectPendingTagReviewRows();
      const pendingTotal = (genres || []).reduce((sum, g) => sum + normalizePendingSongs(g.pending_songs || []).length, 0);
      return {
        rows,
        pendingTotal,
        routable: rows.filter(row => row.status === 'routable').length,
        unresolved: rows.filter(row => row.status !== 'routable').length,
        ambiguous: rows.filter(row => row.status === 'ambiguous').length
      };
    }

    function collectQueuedPendingNominationRows() {
      return (genres || []).flatMap(targetGenre => normalizePendingSongs(targetGenre.pending_songs || []).map((song, index) => {
        const sourceName = song.pendingFrom || song.source || '';
        const fit = song.originFit ?? song.nominatedFit ?? song.score ?? '';
        return {
          targetGenre,
          song,
          index,
          key: songIdentity(song),
          sourceName,
          fit,
          added: song.added || ''
        };
      })).sort((a, b) =>
        String(a.targetGenre.genre || '').localeCompare(String(b.targetGenre.genre || '')) ||
        String(a.sourceName || '').localeCompare(String(b.sourceName || '')) ||
        String(a.song.artist || '').localeCompare(String(b.song.artist || '')) ||
        String(a.song.title || '').localeCompare(String(b.song.title || ''))
      );
    }

    function reviewQueuedPendingRowHtml(row) {
      const source = row.sourceName || 'Unknown source';
      const originFit = row.fit !== '' && row.fit != null ? Number(row.fit) : null;
      const nominatedFit = row.song?.nominatedFit != null ? Number(row.song.nominatedFit) : null;
      const fitLine = originFit != null && Number.isFinite(originFit) ? `<span class="review-chip">source fit ${escapeHtml(String(originFit))}/5</span>` : '';
      const hereFitLine = nominatedFit != null && Number.isFinite(nominatedFit) && nominatedFit >= 4 ? `<span class="review-chip review-chip-good">ready ${escapeHtml(String(nominatedFit))}/5</span>` : '';
      const addedLine = row.added ? `<span class="review-chip">added ${escapeHtml(String(row.added))}</span>` : '';
      const searchText = [row.song.artist, row.song.title, row.targetGenre.genre, source, row.song.url].join(' ').toLowerCase();
      const copyTitle = String(row.song?.title || row.song?.name || row.song?.url || 'Untitled track').trim();
      const copyArtist = String(row.song?.artist || '').trim();
      const copyGenre = String(row.targetGenre?.genre || 'Unknown genre').trim();
      const copyLine = `* ${copyArtist ? `${copyArtist} - ` : ''}${copyTitle}: ${copyGenre}`;
      const targetArg = visualActionArg(row.targetGenre.id);
      const keyArg = encodeURIComponent(row.key || songIdentity(row.song) || '').replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
      const idx = Number(row.index) || 0;
      const rowId = pendingReviewRowId(row.targetGenre.id, row.key || songIdentity(row.song) || '');
      const genreInputId = `${rowId}-genre`;
      const fitInputId = `${rowId}-fit`;
      const currentFit = nominatedFit === 4 || nominatedFit === 5 ? nominatedFit : '';
      const fitBtns = [4,5].map(n => `<button type="button" class="pending-fit-btn pending-fit-strong ${currentFit === n ? 'active' : ''}" title="Route as a ${n}/5 match" onclick="setReviewPendingInlineFit('${escapeHtml(fitInputId)}', ${n}, this)">${n}</button>`).join('');
      const suggested = row.targetGenre.genre || 'Unknown genre';
      return `<div class="review-row review-pending-action-row review-pending-route-row" data-review-pending-row data-review-pending-text="${escapeHtml(searchText)}" data-review-pending-copy="${escapeHtml(copyLine)}" data-pending-target-id="${escapeHtml(String(row.targetGenre.id || ''))}" data-pending-target-name="${escapeHtml(String(row.targetGenre.genre || ''))}" data-pending-source="${escapeHtml(String(source || ''))}" data-pending-artist="${escapeHtml(String(row.song.artist || ''))}" data-pending-title="${escapeHtml(String(row.song.title || row.song.name || ''))}" data-pending-url="${escapeHtml(String(row.song.url || row.song.spotifyUrl || ''))}" data-pending-key="${escapeHtml(String(row.key || songIdentity(row.song) || ''))}">
        <div class="review-pending-main">
          <div class="review-track-title">${vizSongTitleLink(row.song)}</div>
          <div class="review-meta">
            <span class="review-chip review-chip-good">suggested: ${escapeHtml(suggested)}</span>
            <span class="review-chip">from ${escapeHtml(source)}</span>
            ${fitLine}
            ${hereFitLine}
            ${addedLine}
          </div>
          <p class="studio-pending-route-copy">Pick the best matching genre, choose fit 4/5 for a new genre, or choose the source genre to return it there.</p>
        </div>
        <div class="review-move review-pending-actions review-pending-route-actions">
          <label class="review-pending-route-genre"><span>Best match genre</span><input id="${escapeHtml(genreInputId)}" class="review-pending-send-input" list="reviewPendingMoveGenreOptions" value="${escapeHtml(suggested)}" aria-label="Best matching genre"></label>
          <div class="review-pending-fitline review-pending-fitline-strong"><span>Fit</span>${fitBtns}<input id="${escapeHtml(fitInputId)}" type="hidden" value="${escapeHtml(String(currentFit))}"></div>
          <button type="button" class="btn btn-primary review-pending-send-primary" title="Send this as an ADD to the selected genre" onclick="sendReviewPendingAsAdd('${targetArg}', ${idx}, '${keyArg}', '${escapeHtml(genreInputId)}', '${escapeHtml(fitInputId)}')">Send ADD</button>
          <button type="button" class="btn btn-ghost review-pending-dismiss-inline" title="Remove this stuck/incorrect nomination from the pending queue" onclick="dismissReviewPendingFromDesk('${targetArg}', ${idx}, '${keyArg}', '${escapeHtml(genreInputId)}')">Dismiss</button>
          ${spotifyHref(row.song) ? `<a class="btn btn-secondary review-pending-mini-action" href="${escapeHtml(spotifyHref(row.song))}" target="_blank" rel="noopener noreferrer" aria-label="Open track">▶</a>` : ''}
        </div>
      </div>`;
    }

    function pendingTagToGenreLabel(tag) {
      return String(tag || '')
        .replace(/^@+/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function reviewManualPendingRowHtml(row) {
      const source = row.sourceGenre?.genre || 'Unknown source';
      const sourceFit = row.song?.score != null && row.song?.score !== '' ? Number(row.song.score) : null;
      const fitLine = sourceFit != null && Number.isFinite(sourceFit) ? `<span class="review-chip">source fit ${escapeHtml(String(sourceFit))}/5</span>` : '';
      const suggested = pendingTagToGenreLabel(row.tag || row.song?._pendingGenreTag || '');
      const searchText = [row.song?.artist, row.song?.title, row.sourceGenre?.genre, row.tag, suggested, row.song?.url].join(' ').toLowerCase();
      const copyTitle = String(row.song?.title || row.song?.name || row.song?.url || 'Untitled track').trim();
      const copyArtist = String(row.song?.artist || '').trim();
      const copyGenre = suggested || 'Choose genre';
      const copyLine = `* ${copyArtist ? `${copyArtist} - ` : ''}${copyTitle}: ${copyGenre}`;
      const sourceArg = visualActionArg(row.sourceGenre?.id || '');
      const keyArg = encodeURIComponent(row.key || songIdentity(row.song) || '').replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
      const rowId = pendingReviewRowId(row.sourceGenre?.id || 'manual', row.key || songIdentity(row.song) || '');
      const genreInputId = `${rowId}-manual-genre`;
      const fitInputId = `${rowId}-manual-fit`;
      const fitBtns = [4,5].map(n => `<button type="button" class="pending-fit-btn pending-fit-strong" title="Route as a ${n}/5 match" onclick="setReviewPendingInlineFit('${escapeHtml(fitInputId)}', ${n}, this)">${n}</button>`).join('');
      return `<div class="review-row review-pending-action-row review-pending-route-row review-pending-manual-row" data-review-pending-row data-review-pending-text="${escapeHtml(searchText)}" data-review-pending-copy="${escapeHtml(copyLine)}" data-pending-kind="manual-tag" data-pending-source-id="${escapeHtml(String(row.sourceGenre?.id || ''))}" data-pending-source="${escapeHtml(String(source || ''))}" data-pending-artist="${escapeHtml(String(row.song?.artist || ''))}" data-pending-title="${escapeHtml(String(row.song?.title || row.song?.name || ''))}" data-pending-url="${escapeHtml(String(row.song?.url || row.song?.spotifyUrl || ''))}" data-pending-key="${escapeHtml(String(row.key || songIdentity(row.song) || ''))}">
        <div class="review-pending-main">
          <div class="review-track-title">${vizSongTitleLink(row.song)}</div>
          <div class="review-meta">
            <span class="review-chip review-chip-good">suggested: ${escapeHtml(suggested || 'Choose genre')}</span>
            <span class="review-chip">from ${escapeHtml(source)}</span>
            ${fitLine}
          </div>
          <p class="studio-pending-route-copy">Pick the best matching genre, choose fit 4/5 for a new genre, or choose the source genre to keep it there.</p>
        </div>
        <div class="review-move review-pending-actions review-pending-route-actions">
          <label class="review-pending-route-genre"><span>Best match genre</span><input id="${escapeHtml(genreInputId)}" class="review-pending-send-input" list="reviewPendingMoveGenreOptions" value="${escapeHtml(suggested)}" aria-label="Best matching genre"></label>
          <div class="review-pending-fitline review-pending-fitline-strong"><span>Fit</span>${fitBtns}<input id="${escapeHtml(fitInputId)}" type="hidden" value=""></div>
          <button type="button" class="btn btn-primary review-pending-send-primary" title="Send this as an ADD to the selected genre" onclick="sendManualPendingTagAsAdd('${sourceArg}', '${keyArg}', '${escapeHtml(genreInputId)}', '${escapeHtml(fitInputId)}')">Send ADD</button>
          <button type="button" class="btn btn-ghost review-pending-dismiss-inline" title="Clear this unresolved pending tag" onclick="dismissManualPendingTag('${sourceArg}', '${keyArg}', '${escapeHtml(genreInputId)}')">Dismiss</button>
          ${spotifyHref(row.song) ? `<a class="btn btn-secondary review-pending-mini-action" href="${escapeHtml(spotifyHref(row.song))}" target="_blank" rel="noopener noreferrer" aria-label="Open track">▶</a>` : ''}
        </div>
      </div>`;
    }


    function setReviewPendingInlineFit(inputId, value, button) {
      const input = document.getElementById(inputId);
      if (input) input.value = String(value);
      const wrap = button?.closest?.('.review-pending-fitline');
      if (wrap) {
        wrap.querySelectorAll('.pending-fit-btn').forEach(btn => btn.classList.toggle('active', btn === button));
      }
    }

    function reviewPendingContextFromRow(row) {
      if (!row) return {};
      return {
        targetId: row.dataset.pendingTargetId || '',
        targetName: row.dataset.pendingTargetName || '',
        sourceName: row.dataset.pendingSource || '',
        artist: row.dataset.pendingArtist || '',
        title: row.dataset.pendingTitle || '',
        url: row.dataset.pendingUrl || '',
        key: row.dataset.pendingKey || ''
      };
    }

    function normalizedPendingSongTitle(songOrText) {
      const raw = typeof songOrText === 'string' ? songOrText : (songOrText?.title || songOrText?.name || '');
      return normalizePendingTag(raw)
        .replace(/\b(?:remaster(?:ed)?|mono|stereo|single version|single edit|radio edit|edit|version)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function normalizedPendingSongArtist(songOrText) {
      const raw = typeof songOrText === 'string' ? songOrText : (songOrText?.artist || '');
      return normalizePendingTag(raw);
    }

    function pendingFieldLooksSame(a, b) {
      const left = normalizePendingTag(a || '');
      const right = normalizePendingTag(b || '');
      if (!left || !right) return false;
      return left === right || left.includes(right) || right.includes(left);
    }

    function pendingSongMatchesReviewContext(candidate, context = {}) {
      if (!candidate) return false;
      const wantedKeys = [context.decodedKey, context.key].filter(Boolean).map(key => String(key).trim().toLowerCase());
      const candidateKeys = songIdentityKeys(candidate);
      const candidateKey = songIdentity(candidate);
      if (wantedKeys.some(key => key && (candidateKey === key || candidateKeys.includes(key)))) return true;

      const wantedUrl = normalizeSongUrl(context.url || '').trim().toLowerCase();
      const candidateUrl = normalizeSongUrl(candidate.url || candidate.spotifyUrl || '').trim().toLowerCase();
      if (wantedUrl && candidateUrl && wantedUrl === candidateUrl) return true;

      const wantedTitle = normalizedPendingSongTitle(context.title || '');
      const candidateTitle = normalizedPendingSongTitle(candidate);
      const wantedArtist = normalizedPendingSongArtist(context.artist || '');
      const candidateArtist = normalizedPendingSongArtist(candidate);
      const wantedSource = normalizePendingTag(context.sourceName || '');
      const candidateSource = normalizePendingTag(candidate.pendingFrom || candidate.source || '');

      const titleMatches = wantedTitle && candidateTitle && (candidateTitle === wantedTitle || candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle));
      const artistMatches = !wantedArtist || !candidateArtist || candidateArtist === wantedArtist || candidateArtist.includes(wantedArtist) || wantedArtist.includes(candidateArtist);
      const sourceMatches = !wantedSource || !candidateSource || candidateSource === wantedSource;
      return !!(titleMatches && artistMatches && sourceMatches);
    }

    function findReviewPendingNominationInTarget(target, pendingIndex, decodedKey, context = {}) {
      if (!target) return null;
      const pending = normalizePendingSongs(target.pending_songs || []);
      let index = Number(pendingIndex);
      let song = Number.isInteger(index) && index >= 0 ? pending[index] : null;
      const rowContext = { ...context, decodedKey };
      if (song && pendingSongMatchesReviewContext(song, rowContext)) {
        target.pending_songs = pending;
        return { target, pending, song, index };
      }
      if (decodedKey) {
        index = pending.findIndex(candidate => songIdentity(candidate) === decodedKey || songIdentityKeys(candidate).includes(decodedKey));
        if (index >= 0) {
          target.pending_songs = pending;
          return { target, pending, song: pending[index], index };
        }
      }
      index = pending.findIndex(candidate => pendingSongMatchesReviewContext(candidate, rowContext));
      if (index >= 0) {
        target.pending_songs = pending;
        return { target, pending, song: pending[index], index };
      }
      return null;
    }

    function findReviewPendingNomination(targetId, pendingIndex, encodedKey = '', context = {}) {
      let decodedKey = '';
      try {
        decodedKey = decodeURIComponent(String(encodedKey || ''));
      } catch (error) {
        decodedKey = String(encodedKey || '');
      }
      const mergedContext = { ...context, decodedKey, key: context.key || decodedKey };
      const target = (genres || []).find(g => String(g?.id) === String(targetId));
      const foundInTarget = findReviewPendingNominationInTarget(target, pendingIndex, decodedKey, mergedContext);
      if (foundInTarget) return foundInTarget;

      const hintedTargetName = mergedContext.targetName || '';
      const hintedTarget = hintedTargetName
        ? (genres || []).find(g => normalizePendingTag(g?.genre || '') === normalizePendingTag(hintedTargetName))
        : null;
      if (hintedTarget && (!target || String(hintedTarget.id) !== String(target.id))) {
        const foundHinted = findReviewPendingNominationInTarget(hintedTarget, pendingIndex, decodedKey, mergedContext);
        if (foundHinted) return foundHinted;
      }

      for (const genre of (genres || [])) {
        if (!genre || String(genre.id) === String(target?.id || '') || String(genre.id) === String(hintedTarget?.id || '')) continue;
        const found = findReviewPendingNominationInTarget(genre, -1, decodedKey, mergedContext);
        if (found) return found;
      }
      return null;
    }

    function officialSongFromPending(song, targetGenre, mode = 'canon') {
      const out = { ...(song || {}) };
      const targetFit = out.nominatedFit != null ? Number(out.nominatedFit) : null;
      const sourceFit = out.originFit != null ? Number(out.originFit) : (out.score != null ? Number(out.score) : null);
      out.url = normalizeSongUrl(out.url || out.spotifyUrl || '');
      out.score = Number.isFinite(targetFit) ? targetFit : (Number.isFinite(sourceFit) ? sourceFit : null);
      out.promotedFrom = out.pendingFrom || out.source || '';
      out.promotedFromFit = Number.isFinite(sourceFit) ? sourceFit : null;
      out.promotedTo = targetGenre?.genre || '';
      out.reviewedAt = new Date().toISOString();
      delete out.isPending;
      delete out.pendingFrom;
      delete out.originFit;
      delete out.nominatedFit;
      delete out.levelUp;
      out.isLevelUp = false;
      out.isAdd = mode === 'add';
      return out;
    }

    function stageReviewPendingChange(message) {
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
      const restore = preserveScrollSnapshot();
      renderReview();
      restore();
      showSaveToast(`${message} Save in the top bar to persist.`, false);
    }

    function setReviewPendingFit(targetId, pendingIndex, encodedKey, value) {
      const found = findReviewPendingNomination(targetId, pendingIndex, encodedKey);
      if (!found) {
        showSaveToast('Could not find that pending nomination. Refresh Studio and try again.', true);
        return;
      }
      found.song.nominatedFit = Number(value);
      found.target.pending_songs = found.pending;
      stageReviewPendingChange(`Target fit set to ${value}/5.`);
    }

    function resolveReviewPendingNomination(targetId, pendingIndex, encodedKey, mode = 'canon') {
      const found = findReviewPendingNomination(targetId, pendingIndex, encodedKey);
      if (!found) {
        showSaveToast('Could not find that pending nomination. Refresh Studio and try again.', true);
        return;
      }
      const label = [found.song.artist, found.song.title].filter(Boolean).join(' — ') || found.song.title || found.song.url || 'This song';
      if (mode === 'dismiss') {
        if (!window.confirm(`Dismiss pending nomination for ${label}?`)) return;
        found.pending.splice(found.index, 1);
        found.target.pending_songs = found.pending;
        stageReviewPendingChange('Pending nomination dismissed.');
        return;
      }

      found.target.songs_listened = inflateSongsFromStorage(found.target.songs_listened || []).filter(song => !song.isPending);
      const official = officialSongFromPending(found.song, found.target, mode);
      const key = songIdentity(official);
      const already = key ? found.target.songs_listened.some(song => songIdentity(song) === key || songIdentityKeys(song).includes(key)) : false;
      if (!already) found.target.songs_listened.push(official);
      found.pending.splice(found.index, 1);
      found.target.pending_songs = found.pending;
      const action = mode === 'add' ? 'Accepted as ADD.' : 'Accepted as target song.';
      stageReviewPendingChange(already ? 'Song was already logged; pending nomination removed.' : action);
    }

    function findGenreByNameLoose(name) {
      const needle = normalizePendingTag(name || '');
      if (!needle) return null;
      return (genres || []).find(g => normalizePendingTag(g?.genre || '') === needle) ||
        (genres || []).find(g => normalizePendingTag(g?.genre || '').includes(needle) || needle.includes(normalizePendingTag(g?.genre || ''))) ||
        null;
    }

    function routeGenreSlug(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'genre';
    }

    function nextGenreNumericId() {
      const max = (genres || []).reduce((highest, genre) => {
        const id = Number(genre?.id);
        return Number.isFinite(id) ? Math.max(highest, id) : highest;
      }, -1);
      return max + 1;
    }

    function buildRoutedGenreScaffold(name, sourceGenre = null) {
      const cleanName = String(name || '').trim().replace(/^@+/, '');
      const now = new Date().toISOString();
      const sourcePath = sourceGenre ? categoryLine(sourceGenre) : '';
      const parts = sourcePath.split('>').map(part => part.trim()).filter(Boolean);
      const row = {
        id: nextGenreNumericId(),
        genre: cleanName,
        status: 'unlistened',
        rating: '',
        notes: '',
        summary: '',
        key_artists: [],
        suggested_songs: [],
        songs_listened: [],
        pending_songs: [],
        createdFromRoutingDesk: true,
        createdFromRoutingDeskAt: now
      };
      if (parts[0]) row.category = parts[0];
      if (parts[1]) row.subcategory = parts[1];
      if (parts.length) row.category_path = parts.slice(0, 2).join(' > ');
      if (sourceGenre?.genre) row.createdFromSourceGenre = sourceGenre.genre;
      row.slug = routeGenreSlug(cleanName);
      return row;
    }

    function ensureRoutingDestinationGenre(inputValue, options = {}) {
      const raw = String(inputValue || '').trim().replace(/^@+/, '');
      if (!raw) return { target: null, error: 'Choose a destination genre first.', created: false };
      const resolved = resolveReviewMoveGenre(raw, options.currentTargetId || '');
      if (resolved.target) return { ...resolved, created: false };
      if (!options.allowCreate) return { ...resolved, created: false };
      if (raw.length < 2) return { target: null, error: 'Type a clearer genre name first.', created: false };
      const unsafe = /https?:|spotify:|youtube|[\\/]/i.test(raw) || /[\t\n]/.test(raw);
      if (unsafe) return { target: null, error: `Could not use “${raw}” as a genre name.`, created: false };
      const existing = findGenreByNameLoose(raw);
      if (existing) return { target: existing, error: '', created: false };
      const scaffold = buildRoutedGenreScaffold(raw, options.sourceGenre || null);
      genres.push(scaffold);
      return { target: scaffold, error: '', created: true };
    }

    function updateSourceGenreSongFromPending(sourceGenre, pendingSong, score) {
      if (!sourceGenre || !pendingSong) return false;
      const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
      const pendingKeys = songIdentityKeys(pendingSong);
      const pendingKey = songIdentity(pendingSong);
      let matchIndex = sourceSongs.findIndex(song => {
        const keys = songIdentityKeys(song);
        return (pendingKey && keys.includes(pendingKey)) || pendingKeys.some(key => key && keys.includes(key));
      });
      if (matchIndex < 0) {
        const artist = normalizePendingTag(pendingSong.artist || '');
        const title = normalizePendingTag(pendingSong.title || pendingSong.name || '');
        matchIndex = sourceSongs.findIndex(song =>
          normalizePendingTag(song.artist || '') === artist &&
          normalizePendingTag(song.title || song.name || '') === title
        );
      }
      if (matchIndex >= 0) {
        sourceSongs[matchIndex] = {
          ...sourceSongs[matchIndex],
          score,
          pendingReevaluatedAt: new Date().toISOString()
        };
      } else {
        const restored = officialSongFromPending({ ...pendingSong, nominatedFit: score }, sourceGenre, 'canon');
        restored.score = score;
        restored.isAdd = false;
        restored.returnedFromPendingReview = true;
        restored.reviewedAt = new Date().toISOString();
        sourceSongs.push(restored);
      }
      sourceGenre.songs_listened = sourceSongs;
      return true;
    }


    function reviewPendingSameNomination(candidate, reference, context = {}) {
      if (!candidate || !reference) return false;
      const candidateKeys = typeof songIdentityKeys === 'function' ? songIdentityKeys(candidate) : [];
      const referenceKeys = typeof songIdentityKeys === 'function' ? songIdentityKeys(reference) : [];
      if (candidateKeys.some(key => key && referenceKeys.includes(key))) return true;

      const cTitle = normalizePendingTag(candidate.title || candidate.name || '');
      const rTitle = normalizePendingTag(reference.title || reference.name || context.title || '');
      if (!cTitle || !rTitle || cTitle !== rTitle) return false;

      const cArtist = normalizePendingTag(candidate.artist || '');
      const rArtist = normalizePendingTag(reference.artist || context.artist || '');
      const artistCompatible = !cArtist || !rArtist || cArtist === rArtist || cArtist.includes(rArtist) || rArtist.includes(cArtist);
      if (!artistCompatible) return false;

      const cSource = normalizePendingTag(candidate.pendingFrom || candidate.source || '');
      const rSource = normalizePendingTag(reference.pendingFrom || reference.source || context.source || context.sourceName || '');
      const sourceCompatible = context.looseSource || !cSource || !rSource || cSource === rSource;
      if (!sourceCompatible) return false;

      return true;
    }

    function removeMatchingPendingNominations(referenceSong, context = {}) {
      if (!referenceSong) return { removed: 0, genresTouched: 0 };
      let removed = 0;
      let genresTouched = 0;
      (genres || []).forEach(genre => {
        const pending = normalizePendingSongs(genre.pending_songs || []);
        if (!pending.length) return;
        const kept = [];
        pending.forEach(candidate => {
          if (reviewPendingSameNomination(candidate, referenceSong, context)) {
            removed += 1;
          } else {
            kept.push(candidate);
          }
        });
        if (kept.length !== pending.length) {
          genre.pending_songs = kept;
          genresTouched += 1;
        }
      });
      return { removed, genresTouched };
    }

    function clearManualPendingTagsForSong(referenceSong, context = {}) {
      if (!referenceSong) return 0;
      let cleared = 0;
      (genres || []).forEach(genre => {
        const songs = inflateSongsFromStorage(genre.songs_listened || []).filter(song => !song.isPending);
        let changed = false;
        songs.forEach((song, index) => {
          if (!song?._pendingGenreTag) return;
          if (!reviewPendingSameNomination(song, referenceSong, context)) return;
          songs[index] = {
            ...song,
            _pendingGenreTag: '',
            pendingTagDismissedAt: new Date().toISOString()
          };
          changed = true;
          cleared += 1;
        });
        if (changed) genre.songs_listened = songs;
      });
      return cleared;
    }

    function sendReviewPendingAsAdd(targetId, pendingIndex, encodedKey, genreInputId, fitInputId) {
      const input = document.getElementById(genreInputId);
      const fitInput = document.getElementById(fitInputId);
      const rowContext = reviewPendingContextFromRow(input?.closest?.('[data-review-pending-row]'));
      const found = findReviewPendingNomination(targetId, pendingIndex, encodedKey, rowContext);
      if (!found) {
        showSaveToast('Could not find that pending nomination. Use Dismiss to remove the stuck row, or refresh Studio and try again.', true);
        return;
      }
      const typedGenre = String(input?.value || found.target.genre || '').trim();

      const sourceName = found.song?.pendingFrom || found.song?.source || '';
      const sourceGenre = findGenreByNameLoose(sourceName);
      const ensured = ensureRoutingDestinationGenre(typedGenre, {
        allowCreate: true,
        sourceGenre,
        currentTargetId: found.target?.id || ''
      });
      const destination = ensured.target;
      const error = ensured.error;
      if (!destination) {
        showSaveToast(error || 'Choose the best matching genre first.', true);
        input?.focus?.();
        return;
      }
      const returningToSource = sourceGenre && String(destination.id) === String(sourceGenre.id);
      const sourceFit = Number(found.song?.originFit ?? found.song?.nominatedFit ?? found.song?.score ?? '');
      const requestedFit = Number(fitInput?.value || found.song?.nominatedFit || '');

      if (!returningToSource && ![4, 5].includes(requestedFit)) {
        showSaveToast('Choose fit 4 or 5 before sending.', true);
        const fitWrap = fitInput?.closest?.('.review-pending-fitline');
        fitWrap?.classList?.add?.('needs-attention');
        setTimeout(() => fitWrap?.classList?.remove?.('needs-attention'), 900);
        return;
      }

      const sourceTarget = found.target;
      sourceTarget.pending_songs = found.pending;
      const pendingSong = found.song || {};

      if (returningToSource) {
        const returnFit = Number.isFinite(requestedFit) && requestedFit > 0
          ? requestedFit
          : (Number.isFinite(sourceFit) && sourceFit > 0 ? sourceFit : null);
        if (!returnFit) {
          showSaveToast('Could not determine the original source fit. Choose 4 or 5, or open the source genre to edit manually.', true);
          return;
        }
        updateSourceGenreSongFromPending(sourceGenre, pendingSong, returnFit);
        const removedInfo = removeMatchingPendingByReviewContext({ ...rowContext, sourceName, targetName: sourceTarget.genre }, pendingSong);
        clearManualPendingTagsByReviewContext({ ...rowContext, sourceName }, pendingSong);
        stageReviewPendingChange(`Returned to ${sourceGenre.genre} at ${returnFit}/5 and removed ${removedInfo.removed || 1} pending nomination${(removedInfo.removed || 1) === 1 ? '' : 's'}.`);
        return;
      }

      pendingSong.nominatedFit = requestedFit;

      destination.songs_listened = inflateSongsFromStorage(destination.songs_listened || []).filter(song => !song.isPending);
      const official = officialSongFromPending(pendingSong, destination, 'add');
      official.score = requestedFit;
      official.isAdd = true;
      official.routedFromPendingGenre = sourceTarget.genre || '';
      official.routedAt = new Date().toISOString();

      const key = songIdentity(official);
      const already = key ? destination.songs_listened.some(song => songIdentity(song) === key || songIdentityKeys(song).includes(key)) : false;
      if (!already) destination.songs_listened.push(official);

      const removedInfo = removeMatchingPendingByReviewContext({ ...rowContext, sourceName, targetName: sourceTarget.genre, destination: destination.genre }, pendingSong);
      clearManualPendingTagsByReviewContext({ ...rowContext, sourceName }, pendingSong);

      const action = already
        ? `Already logged in ${destination.genre}; removed ${removedInfo.removed || 1} pending nomination${(removedInfo.removed || 1) === 1 ? '' : 's'}.`
        : `${ensured.created ? `Created ${destination.genre} and sent` : 'Sent'} as ADD (${requestedFit}/5).`;
      stageReviewPendingChange(action);
    }

    function reviewPendingReferenceFromContext(context = {}, fallback = {}) {
      return {
        ...(fallback || {}),
        title: context.title || fallback.title || fallback.name || '',
        name: context.title || fallback.name || fallback.title || '',
        artist: context.artist || fallback.artist || '',
        url: context.url || fallback.url || fallback.spotifyUrl || '',
        spotifyUrl: context.url || fallback.spotifyUrl || fallback.url || '',
        pendingFrom: context.sourceName || context.source || fallback.pendingFrom || fallback.source || '',
        source: context.sourceName || context.source || fallback.source || fallback.pendingFrom || ''
      };
    }

    function removeMatchingPendingByReviewContext(context = {}, fallbackSong = null) {
      const reference = reviewPendingReferenceFromContext(context, fallbackSong || {});
      let removed = 0;
      let genresTouched = 0;
      (genres || []).forEach(genre => {
        const pending = normalizePendingSongs(genre.pending_songs || []);
        if (!pending.length) return;
        const kept = [];
        pending.forEach(candidate => {
          const matchByRow = pendingSongMatchesReviewContext(candidate, {
            ...context,
            sourceName: context.sourceName || context.source || context.pendingFrom || '',
            key: context.key || '',
            decodedKey: context.key || ''
          });
          const matchByReference = reviewPendingSameNomination(candidate, reference, { ...context, looseSource: true });
          if (matchByRow || matchByReference) removed += 1;
          else kept.push(candidate);
        });
        if (kept.length !== pending.length) {
          genre.pending_songs = kept;
          genresTouched += 1;
        }
      });
      return { removed, genresTouched, reference };
    }

    function clearManualPendingTagsByReviewContext(context = {}, fallbackSong = null) {
      const reference = reviewPendingReferenceFromContext(context, fallbackSong || {});
      let cleared = 0;
      (genres || []).forEach(genre => {
        const songs = inflateSongsFromStorage(genre.songs_listened || []).filter(song => !song.isPending);
        let changed = false;
        songs.forEach((song, index) => {
          if (!song?._pendingGenreTag) return;
          const matchByRow = pendingSongMatchesReviewContext(song, {
            ...context,
            sourceName: context.sourceName || context.source || genre.genre || '',
            key: context.key || '',
            decodedKey: context.key || ''
          });
          const matchByReference = reviewPendingSameNomination(song, reference, { ...context, looseSource: true });
          if (!matchByRow && !matchByReference) return;
          songs[index] = {
            ...song,
            _pendingGenreTag: '',
            pendingTagDismissedAt: new Date().toISOString()
          };
          changed = true;
          cleared += 1;
        });
        if (changed) genre.songs_listened = songs;
      });
      return cleared;
    }

    function dismissReviewPendingFromDesk(targetId, pendingIndex, encodedKey, genreInputId) {
      const input = document.getElementById(genreInputId);
      const row = input?.closest?.('[data-review-pending-row]');
      const rowContext = reviewPendingContextFromRow(row);
      const found = findReviewPendingNomination(targetId, pendingIndex, encodedKey, rowContext);
      const fallbackSong = found?.song || null;
      const context = {
        ...rowContext,
        sourceName: found?.song?.pendingFrom || found?.song?.source || rowContext.sourceName || rowContext.source || '',
        targetName: found?.target?.genre || rowContext.targetName || ''
      };
      const label = [context.artist || fallbackSong?.artist, context.title || fallbackSong?.title || fallbackSong?.name].filter(Boolean).join(' — ') || fallbackSong?.url || 'this pending nomination';
      if (!window.confirm(`Dismiss ${label} from pending nominations?`)) return;

      const removedInfo = removeMatchingPendingByReviewContext(context, fallbackSong);
      const cleared = clearManualPendingTagsByReviewContext(context, fallbackSong);

      if (!removedInfo.removed && !cleared && found) {
        found.pending.splice(found.index, 1);
        found.target.pending_songs = found.pending;
        removedInfo.removed = 1;
      }

      if (!removedInfo.removed && !cleared) {
        showSaveToast('Could not find any matching pending rows to dismiss. Try searching the exact title, then dismiss again.', true);
        return;
      }

      stageReviewPendingChange(`Pending nomination dismissed${removedInfo.removed > 1 ? ` (${removedInfo.removed} queued rows removed)` : ''}${cleared ? `; ${cleared} source tag${cleared === 1 ? '' : 's'} cleared` : ''}.`);
    }

    function moveReviewPendingNomination(targetId, pendingIndex, encodedKey, inputId) {
      const input = document.getElementById(inputId);
      const rowContext = reviewPendingContextFromRow(input?.closest?.('[data-review-pending-row]'));
      const found = findReviewPendingNomination(targetId, pendingIndex, encodedKey, rowContext);
      if (!found) {
        showSaveToast('Could not find that pending nomination. Refresh Studio and try again.', true);
        return;
      }
      const { target: destination, error } = resolveReviewMoveGenre(input?.value || '', found.target.id);
      if (!destination) {
        showSaveToast(error || 'Choose a destination genre first.', true);
        input?.focus?.();
        return;
      }
      const destinationPending = normalizePendingSongs(destination.pending_songs || []);
      const key = songIdentity(found.song);
      const sourceName = found.song.pendingFrom || found.song.source || '';
      const alreadyQueued = destinationPending.some(candidate => {
        const sameSong = key && (songIdentity(candidate) === key || songIdentityKeys(candidate).includes(key));
        const sameSource = !sourceName || normalizePendingTag(candidate.pendingFrom || candidate.source || '') === normalizePendingTag(sourceName);
        return sameSong && sameSource;
      });
      if (!alreadyQueued) {
        const moved = { ...(found.song || {}) };
        moved.movedFromPendingGenre = found.target.genre || '';
        moved.movedAt = new Date().toISOString();
        destinationPending.push(moved);
        destination.pending_songs = destinationPending;
      }
      found.pending.splice(found.index, 1);
      found.target.pending_songs = found.pending;
      if (input) input.value = '';
      stageReviewPendingChange(
        alreadyQueued
          ? `Already queued in ${destination.genre}; removed duplicate pending nomination here.`
          : `Sent pending nomination to ${destination.genre}.`
      );
    }

    function findManualPendingSourceSong(sourceId, encodedKey = '', context = {}) {
      let decodedKey = '';
      try {
        decodedKey = decodeURIComponent(String(encodedKey || ''));
      } catch (error) {
        decodedKey = String(encodedKey || '');
      }
      const sourceGenre = (genres || []).find(g => String(g?.id) === String(sourceId));
      if (!sourceGenre) return null;
      const songs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
      let index = -1;
      if (decodedKey) {
        index = songs.findIndex(song => songIdentity(song) === decodedKey || songIdentityKeys(song).includes(decodedKey));
      }
      if (index < 0) {
        const rowContext = { ...context, decodedKey, key: decodedKey };
        index = songs.findIndex(song => pendingSongMatchesReviewContext(song, rowContext));
      }
      if (index < 0) return null;
      sourceGenre.songs_listened = songs;
      return { sourceGenre, songs, song: songs[index], index, decodedKey };
    }

    function sendManualPendingTagAsAdd(sourceId, encodedKey, genreInputId, fitInputId) {
      const input = document.getElementById(genreInputId);
      const fitInput = document.getElementById(fitInputId);
      const rowContext = reviewPendingContextFromRow(input?.closest?.('[data-review-pending-row]'));
      const found = findManualPendingSourceSong(sourceId, encodedKey, rowContext);
      if (!found) {
        showSaveToast('Could not find that pending source song. Refresh Studio and try again.', true);
        return;
      }
      const typedGenre = String(input?.value || '').trim();
      const ensured = ensureRoutingDestinationGenre(typedGenre, {
        allowCreate: true,
        sourceGenre: found.sourceGenre,
        currentTargetId: found.sourceGenre?.id || ''
      });
      const destination = ensured.target;
      const error = ensured.error;
      if (!destination) {
        showSaveToast(error || 'Choose the best matching genre first.', true);
        input?.focus?.();
        return;
      }
      const requestedFit = Number(fitInput?.value || '');
      if (![4, 5].includes(requestedFit)) {
        showSaveToast('Choose fit 4 or 5 before sending.', true);
        const fitWrap = fitInput?.closest?.('.review-pending-fitline');
        fitWrap?.classList?.add?.('needs-attention');
        setTimeout(() => fitWrap?.classList?.remove?.('needs-attention'), 900);
        return;
      }

      const sourceSong = found.song || {};
      if (String(destination.id) === String(found.sourceGenre.id)) {
        found.songs[found.index] = {
          ...sourceSong,
          score: requestedFit,
          _pendingGenreTag: '',
          pendingReevaluatedAt: new Date().toISOString()
        };
        found.sourceGenre.songs_listened = found.songs;
        stageReviewPendingChange(`Kept in ${found.sourceGenre.genre} at ${requestedFit}/5 and cleared the pending tag.`);
        return;
      }

      const pendingPayload = pendingReviewSongPayload(sourceSong);
      pendingPayload.nominatedFit = requestedFit;
      pendingPayload.originFit = sourceSong.score ?? pendingPayload.originFit ?? null;
      pendingPayload.pendingFrom = found.sourceGenre.genre || '';

      destination.songs_listened = inflateSongsFromStorage(destination.songs_listened || []).filter(song => !song.isPending);
      const official = officialSongFromPending(pendingPayload, destination, 'add');
      official.score = requestedFit;
      official.isAdd = true;
      official.routedFromPendingGenre = found.sourceGenre.genre || '';
      official.routedAt = new Date().toISOString();
      official.routedFromManualPendingTag = sourceSong._pendingGenreTag || '';

      const key = songIdentity(official);
      const already = key ? destination.songs_listened.some(song => songIdentity(song) === key || songIdentityKeys(song).includes(key)) : false;
      if (!already) destination.songs_listened.push(official);

      found.songs[found.index] = {
        ...sourceSong,
        _pendingGenreTag: '',
        pendingRoutedTo: destination.genre || '',
        pendingRoutedAt: new Date().toISOString()
      };
      found.sourceGenre.songs_listened = found.songs;
      stageReviewPendingChange(
        already
          ? `Already logged in ${destination.genre}; cleared the pending tag from ${found.sourceGenre.genre}.`
          : `${ensured.created ? `Created ${destination.genre} and sent` : `Sent to ${destination.genre}`} as ADD (${requestedFit}/5) and cleared the pending tag.`
      );
    }

    function dismissManualPendingTag(sourceId, encodedKey, genreInputId) {
      const input = document.getElementById(genreInputId);
      const rowContext = reviewPendingContextFromRow(input?.closest?.('[data-review-pending-row]'));
      const found = findManualPendingSourceSong(sourceId, encodedKey, rowContext);
      if (!found) {
        showSaveToast('Could not find that pending source song to dismiss. Refresh Studio and try again.', true);
        return;
      }
      const label = [found.song.artist, found.song.title || found.song.name].filter(Boolean).join(' — ') || found.song.url || 'this pending tag';
      if (!window.confirm(`Clear pending tag for ${label}?`)) return;
      found.songs[found.index] = {
        ...found.song,
        _pendingGenreTag: '',
        pendingTagDismissedAt: new Date().toISOString()
      };
      found.sourceGenre.songs_listened = found.songs;
      const removedInfo = removeMatchingPendingByReviewContext({ ...rowContext, sourceName: found.sourceGenre?.genre || rowContext.sourceName || rowContext.source || '' }, found.song);
      stageReviewPendingChange(`Pending tag dismissed${removedInfo.removed ? ` and ${removedInfo.removed} matching queued row${removedInfo.removed === 1 ? '' : 's'} removed` : ''}.`);
    }


    function filterReviewPendingQueue(inputId) {
      const input = document.getElementById(inputId);
      const term = String(input?.value || '').trim().toLowerCase();
      const rows = Array.from(document.querySelectorAll('[data-review-pending-row]'));
      let visible = 0;
      rows.forEach(row => {
        const haystack = String(row.dataset.reviewPendingText || '').toLowerCase();
        const show = !term || haystack.includes(term);
        row.classList.toggle('is-hidden', !show);
        if (show) visible += 1;
      });
      const count = document.getElementById('reviewPendingVisibleCount');
      const card = document.getElementById('reviewPendingQueueCard');
      const total = Number(card?.dataset.reviewPendingTotal || rows.length || 0);
      const rendered = Number(card?.dataset.reviewPendingVisible || rows.length || 0);
      if (count) count.textContent = term
        ? `${visible} matching in current ${rendered}${total > rendered ? ` of ${total} total` : ''}`
        : `${visible} shown${total > rendered ? ` of ${total} total · ${total - rendered} more available` : ''}`;
    }

    async function copyReviewPendingQueueFirst25() {
      const rows = Array.from(document.querySelectorAll('#reviewPendingQueueCard [data-review-pending-row]:not(.is-hidden)')).slice(0, 25);
      const lines = rows
        .map(row => String(row.dataset.reviewPendingCopy || '').trim())
        .filter(Boolean);
      if (!lines.length) {
        showSaveToast('No visible pending nominations to copy.', true);
        return;
      }
      const text = lines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showSaveToast(`Copied ${lines.length} pending nomination${lines.length === 1 ? '' : 's'}.`, false);
      } catch (error) {
        console.warn('Could not copy pending nominations', error);
        showSaveToast('Could not copy pending nominations. Browser blocked clipboard access.', true);
      }
    }

    function scrollToReviewPendingQueue() {
      const target = document.getElementById('reviewPendingQueueCard');
      target?.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function scrollToReviewManualQueue() {
      const target = document.getElementById('reviewManualQueueCard');
      target?.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    /* Daily Genre v221: Pending nominations are now an explicit visible batch.
       Clearing one batch should reveal/allow loading the next instead of making
       save+refresh feel like new surprise entries appeared. */
    const REVIEW_PENDING_BATCH_SIZE = 25;

    function reviewPendingVisibleLimit(total) {
      const count = Math.max(0, Number(total || 0));
      const current = Number(window.__dailyGenreReviewPendingVisibleLimit || REVIEW_PENDING_BATCH_SIZE);
      const limit = Math.max(REVIEW_PENDING_BATCH_SIZE, Number.isFinite(current) ? current : REVIEW_PENDING_BATCH_SIZE);
      const next = Math.min(count, limit);
      window.__dailyGenreReviewPendingVisibleLimit = next || REVIEW_PENDING_BATCH_SIZE;
      return next;
    }

    function loadNextReviewPendingQueue(batchSize = REVIEW_PENDING_BATCH_SIZE) {
      const card = document.getElementById('reviewPendingQueueCard');
      const total = Number(card?.dataset.reviewPendingTotal || 0);
      const current = Number(window.__dailyGenreReviewPendingVisibleLimit || REVIEW_PENDING_BATCH_SIZE);
      window.__dailyGenreReviewPendingVisibleLimit = Math.min(total || current + batchSize, current + batchSize);
      renderReview();
      setTimeout(scrollToReviewPendingQueue, 40);
    }

    function refreshReviewPendingQueueList() {
      renderReview();
      setTimeout(scrollToReviewPendingQueue, 40);
    }

    window.loadNextReviewPendingQueue = loadNextReviewPendingQueue;
    window.refreshReviewPendingQueueList = refreshReviewPendingQueueList;

    function reviewGenreOptions(excludeId='') {
      return (genres || [])
        .filter(g => g && g.genre && String(g.id) !== String(excludeId))
        .sort((a,b) => String(a.genre || '').localeCompare(String(b.genre || '')))
        .map(g => `<option value="${escapeHtml(String(g.id))}">${escapeHtml(g.genre || '')}</option>`)
        .join('');
    }


    function reviewGenreDatalistOptions() {
      if (
        reviewGenreDatalistSource !== genres ||
        reviewGenreDatalistLength !== genres.length ||
        reviewGenreDatalistHtml == null
      ) {
        reviewGenreDatalistHtml = (genres || [])
          .filter(g => g && g.genre)
          .sort((a,b) => String(a.genre || '').localeCompare(String(b.genre || '')))
          .map(g => `<option value="${escapeHtml(g.genre || '')}" data-id="${escapeHtml(String(g.id))}"></option>`)
          .join('');
        reviewGenreDatalistSource = genres;
        reviewGenreDatalistLength = genres.length;
      }
      return reviewGenreDatalistHtml;
    }

    function resolveReviewMoveGenre(inputValue, currentTargetId = '') {
      const raw = String(inputValue || '').trim().replace(/^@+/, '');
      if (!raw) return { target: null, error: 'Choose a destination genre first.' };
      // Include the current target in lookup. In the unified routing desk, choosing
      // the suggested/current target is a valid Send ADD action, not an error.
      const pool = (genres || []).filter(g => g && g.genre);
      const byId = pool.find(g => String(g?.id) === raw);
      if (byId) return { target: byId, error: '' };

      const normPending = normalizePendingTag(raw);
      const normSearch = typeof normalizeGenreSearchText === 'function'
        ? normalizeGenreSearchText(raw)
        : normPending;
      const compact = value => normalizePendingTag(value).replace(/\s+/g, '');
      const rawCompact = compact(raw);
      const namesForGenre = genre => {
        const names = [genre?.genre || ''];
        try {
          if (typeof genreAliasListForSearch === 'function') names.push(...genreAliasListForSearch(genre));
        } catch {}
        return [...new Set(names.filter(Boolean))];
      };

      const exact = pool.filter(g => namesForGenre(g).some(name =>
        normalizePendingTag(name) === normPending ||
        (typeof normalizeGenreSearchText === 'function' && normalizeGenreSearchText(name) === normSearch) ||
        compact(name) === rawCompact
      ));
      if (exact.length === 1) return { target: exact[0], error: '' };
      if (exact.length > 1) return { target: null, error: 'That genre name is ambiguous. Type the exact genre name.' };

      const scored = pool.map(g => {
        let best = 0;
        namesForGenre(g).forEach(name => {
          const p = normalizePendingTag(name);
          const q = typeof normalizeGenreSearchText === 'function' ? normalizeGenreSearchText(name) : p;
          const c = compact(name);
          if (p.startsWith(normPending) || normPending.startsWith(p)) best = Math.max(best, 82);
          if (q.startsWith(normSearch) || normSearch.startsWith(q)) best = Math.max(best, 82);
          if (p.includes(normPending) || normPending.includes(p)) best = Math.max(best, 70);
          if (q.includes(normSearch) || normSearch.includes(q)) best = Math.max(best, 70);
          if (c.includes(rawCompact) || rawCompact.includes(c)) best = Math.max(best, 66);
          try {
            if (Math.min(p.length, normPending.length) >= 5 && levenshtein(p, normPending) <= 2) best = Math.max(best, 60);
          } catch {}
        });
        return { genre: g, score: best };
      }).filter(item => item.score > 0).sort((a,b) => b.score - a.score || String(a.genre.genre || '').localeCompare(String(b.genre.genre || '')));

      if (scored.length && scored[0].score >= 80 && (scored.length === 1 || scored[0].score > scored[1].score)) {
        return { target: scored[0].genre, error: '' };
      }
      if (scored.length === 1 && scored[0].score >= 66) return { target: scored[0].genre, error: '' };
      if (scored.length > 1 && scored[0].score >= 66) {
        // If the typed value came from the datalist or is a clear prefix/completion,
        // prefer the single shortest completion. This keeps routing fast for cases like
        // Australian folk -> Australian folk-rock and Nightcore -> Nightcore-style labels.
        const completionMatches = scored.filter(item => namesForGenre(item.genre).some(name => {
          const n = normalizePendingTag(name);
          const c = compact(name);
          return n.startsWith(normPending) || normPending.startsWith(n) || c.startsWith(rawCompact) || rawCompact.startsWith(c);
        })).sort((a,b) => String(a.genre.genre || '').length - String(b.genre.genre || '').length);
        if (completionMatches.length === 1 && completionMatches[0].score >= 66) return { target: completionMatches[0].genre, error: '' };
        if (completionMatches.length > 1 && completionMatches[0].score >= 66) {
          const firstName = normalizePendingTag(completionMatches[0].genre.genre || '');
          const secondName = normalizePendingTag(completionMatches[1].genre.genre || '');
          if (firstName !== secondName && firstName.length + 5 <= secondName.length) return { target: completionMatches[0].genre, error: '' };
        }
        if (scored[0].score >= 80 && scored[0].score - scored[1].score >= 8) return { target: scored[0].genre, error: '' };
        return { target: null, error: `Multiple genres match “${raw}”. Try ${scored.slice(0, 3).map(item => item.genre.genre).join(', ')}.` };
      }
      return { target: null, error: `Could not find “${raw}”. Choose one of the suggested genres or type a closer match.` };
    }

    function pendingReviewRowId(sourceId, key) {
      const b64 = btoa(unescape(encodeURIComponent(String(key || '')))).replace(/[^a-z0-9_-]/gi, '');
      return `pending-review-${String(sourceId || '').replace(/[^a-z0-9_-]/gi, '-')}-${b64.slice(-24)}`;
    }

      function inboxGenreOptionsHtml() {
      return (genres || [])
        .filter(g => g && g.genre)
        .sort((a, b) => String(a.genre || '').localeCompare(String(b.genre || '')))
        .map(g => `<option value="${escapeHtml(String(g.id))}">${escapeHtml(g.genre || '')}</option>`)
        .join('');
    }

    function songInboxLines(raw) {
      const text = String(raw || '').trim();
      if (!text) return [];
      const urls = text.match(/https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}(?:\?[^\s\n<)]*)?|spotify:track:[A-Za-z0-9]{22}/gi) || [];
      const urlSet = new Set(urls.map(u => normalizeSongUrl(u)).filter(Boolean));
      const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const out = [];
      if (urlSet.size > 1) {
        urlSet.forEach(url => out.push(url));
        const nonUrlLines = lines.filter(line => !/open\.spotify\.com\/track\/[A-Za-z0-9]{22}|spotify:track:[A-Za-z0-9]{22}/i.test(line));
        nonUrlLines.forEach(line => out.push(line));
      } else {
        lines.forEach(line => {
          const found = line.match(/https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}(?:\?[^\s\n<)]*)?|spotify:track:[A-Za-z0-9]{22}/gi);
          if (found && found.length > 1) found.forEach(url => out.push(url));
          else out.push(line);
        });
      }
      return [...new Set(out.map(x => String(x || '').trim()).filter(Boolean))];
    }

    async function buildInboxSongFromText(raw) {
      raw = String(raw || '').trim();
      let song = { url: '', title: '', artist: '', artwork: '', spotifyId: '', guessNote: '' };
      const spotifyMatch = raw.match(/(?:spotify\.com\/track\/|spotify:track:)([A-Za-z0-9]{22})/i);

      if (spotifyMatch) {
        const canonical = normalizeSongUrl(raw);
        const track = await fetchSpotifyTrackMetadata(canonical || raw, true);
        if (track) {
          song.url = track.spotifyUrl || canonical || raw;
          song.title = track.title || '';
          song.artist = track.artist || '';
          song.artwork = track.artwork || track.albumArt || '';
          song.albumArt = track.albumArt || track.artwork || '';
          song.spotifyId = track.spotifyId || spotifyMatch[1];
          song.spotifyUrl = track.spotifyUrl || song.url;
          song.album = track.album || '';
          song.durationMs = track.durationMs || null;
          song.releaseYear = track.releaseYear || null;
          song.isrc = track.isrc || '';
          song.source = 'spotify';
        } else {
          song.url = canonical || raw;
          song.spotifyUrl = canonical || raw;
          song.spotifyId = spotifyMatch[1];
          song.source = 'spotify';
          const oembed = await fetchSpotifyOembed(canonical || raw);
          if (oembed) {
            song.title = oembed.title || '';
            song.artist = oembed.author_name || '';
            song.artwork = oembed.thumbnail_url || '';
            song.albumArt = oembed.thumbnail_url || '';
          }
        }
      } else {
        song.source = 'manual';
        const dashMatch = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
        const artist = dashMatch ? dashMatch[1].trim() : '';
        const title = dashMatch ? dashMatch[2].trim() : raw;
        song.title = title;
        song.artist = artist;
        try {
          const term = encodeURIComponent(artist ? `${artist} ${title}` : title);
          const resp = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${term}`);
          if (resp.ok) {
            const data = await resp.json();
            const best = (data.results || [])[0];
            if (best) {
              song.title = best.trackName || title;
              song.artist = best.artistName || artist;
              song.artwork = (best.artworkUrl100 || '').replace('100x100', '300x300');
              song.albumArt = song.artwork;
              song.album = best.collectionName || '';
              song.releaseYear = best.releaseDate ? Number(String(best.releaseDate).slice(0,4)) : null;
            }
          }
        } catch(e) {}
      }
      return song;
    }

    function studioSongRowsForRouting(raw) {
      const parsed = parseSongLinks(raw || []);
      const rows = [];
      const visit = (song, parent = null) => {
        if (!song) return;
        rows.push({ song, parent });
        if (song.levelUp) visit(song.levelUp, song);
      };
      (parsed || []).forEach(song => visit(song));
      return rows;
    }

    function studioPendingPayload(song) {
      const out = {
        url: normalizeSongUrl(song.url || song.spotifyUrl || ''),
        score: song.score != null && song.score !== '' ? Number(song.score) : null,
        reason: song.reason || '',
        title: song.title || '',
        artist: song.artist || '',
        artwork: song.artwork || song.albumArt || '',
        albumArt: song.albumArt || song.artwork || '',
        source: song.source || songUrlSource(song.url || song.spotifyUrl || ''),
        spotifyId: song.spotifyId || '',
        spotifyUrl: song.spotifyUrl || song.url || '',
        album: song.album || '',
        artists: Array.isArray(song.artists) ? song.artists.slice() : [],
        durationMs: song.durationMs || null,
        isrc: song.isrc || '',
        releaseDate: song.releaseDate || '',
        releaseYear: song.releaseYear || null,
        releasePrecision: song.releasePrecision || '',
        releaseSource: song.releaseSource || '',
        spotifyMetadataFetched: !!song.spotifyMetadataFetched,
        spotifyMetadataFetchedAt: song.spotifyMetadataFetchedAt || '',
        added: song.added || new Date().toISOString().slice(0,10)
      };
      return out;
    }

    async function hydrateStudioPendingPayload(song) {
      const out = studioPendingPayload(song);
      const url = normalizeSongUrl(out.spotifyUrl || out.url || '');
      if (!url || !/spotify\.com\/track\/[A-Za-z0-9]{22}|spotify:track:[A-Za-z0-9]{22}/i.test(url)) return out;
      try {
        const track = await fetchSpotifyTrackMetadata(url, true);
        if (track) {
          out.url = track.spotifyUrl || url;
          out.spotifyUrl = track.spotifyUrl || out.url;
          out.spotifyId = track.spotifyId || out.spotifyId;
          out.title = track.title || out.title;
          out.artist = track.artist || out.artist;
          out.artwork = track.artwork || track.albumArt || out.artwork;
          out.albumArt = track.albumArt || track.artwork || out.albumArt || out.artwork;
          out.album = track.album || out.album;
          out.artists = Array.isArray(track.artists) && track.artists.length ? track.artists.slice() : out.artists;
          out.durationMs = track.durationMs || out.durationMs;
          out.isrc = track.isrc || out.isrc;
          out.releaseDate = track.releaseDate || out.releaseDate;
          out.releaseYear = track.releaseYear || out.releaseYear;
          out.releasePrecision = track.releasePrecision || out.releasePrecision;
          out.releaseSource = track.releaseSource || out.releaseSource || 'Spotify';
          out.spotifyMetadataFetched = true;
          out.spotifyMetadataFetchedAt = new Date().toISOString();
          out.source = 'spotify';
        }
      } catch (error) {
        console.warn('Studio import Spotify hydration failed', error);
      }
      return out;
    }

    function addInboxSongToPending(target, song, sourceLabel = 'Song Inbox') {
      return queuePendingNomination(target, sourceLabel, {
        ...song,
        score: null,
        reason: '',
        isPending: true,
        pendingFrom: sourceLabel,
        originFit: null,
        nominatedFit: null,
        isLevelUp: false,
        isAdd: false,
        levelUp: null
      });
    }

    function renderSongInboxCard() {
      const unassigned = songInbox.filter(s => !s._routed);
      const unassignedHtml = unassigned.length ? `
        <div style="margin-top:14px;">
          <div class="eyebrow" style="margin-bottom:8px;">Unassigned (${unassigned.length})</div>
          <div class="inbox-unassigned-list">
            ${unassigned.map((song, idx) => {
              const selectId = `inbox-route-${idx}`;
              const label = (song.artist ? `${song.artist} — ` : '') + (song.title || song.url || 'Unknown');
              return `<div class="inbox-unassigned-row">
                <div>
                  <div class="inbox-unassigned-title">${escapeHtml(label)}</div>
                  <div class="inbox-unassigned-meta">${song.guessNote ? escapeHtml(song.guessNote) : 'Unknown genre tag'}</div>
                </div>
                <div class="inbox-move-row">
                  <select id="${selectId}" aria-label="Route to genre">
                    <option value="">Choose genre…</option>
                    ${inboxGenreOptionsHtml()}
                  </select>
                  <button type="button" class="btn btn-primary" style="white-space:nowrap;" onclick="routeInboxSong(${idx}, '${selectId}')">Route</button>
                  <button type="button" class="btn btn-danger" onclick="dismissInboxSong(${idx})">✕</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : '';

      return `<div class="inbox-card">
        <div class="review-card-head">
          <div>
            <h3>Song Inbox</h3>
            <p class="small" style="margin:6px 0 0;">Paste one song or many. Use <strong>Add to Inbox</strong> for normal routing. <strong>Import @tags</strong> is an advanced backfill for pasted Studio blocks only; it scans score 1–3 rows with @genre tags and can re-create pending nominations.</p>
          </div>
        </div>
        <div class="inbox-bulk-grid">
          <label class="inbox-bulk-text"><span class="sr-only">Songs</span><textarea id="inboxSongInput" rows="5" placeholder="https://open.spotify.com/track/…&#10;Artist — Title&#10;Artist — Title | 1 | @folk_rock&#10;I've Just Seen A Face (Across the Universe) | 1 | @folk_rock"></textarea></label>
          <label class="inbox-target-genre"><span>Optional genre</span><select id="inboxTargetGenre"><option value="">Unknown / unassigned</option>${inboxGenreOptionsHtml()}</select></label>
          <div class="inbox-action-stack" style="display:flex; flex-direction:column; gap:8px;">
            <button type="button" class="btn btn-primary" onclick="addToSongInbox()">Add to Inbox</button>
            <button type="button" class="btn btn-secondary" onclick="importStudioTaggedSongs()" title="Advanced backfill for pasted Studio @tag blocks only">Import @tags (advanced)</button>
          </div>
        </div>
        <div class="inbox-result" id="inboxResult"></div>
        ${unassignedHtml}
      </div>`;
    }

    async function importStudioTaggedSongs() {
      const input = document.getElementById('inboxSongInput');
      const resultEl = document.getElementById('inboxResult');
      const sourceSelect = document.getElementById('inboxTargetGenre');
      if (!input || !resultEl) return;
      const raw = input.value.trim();
      if (!raw) return;

      const sourceGenre = sourceSelect?.value ? (genres || []).find(g => String(g.id) === String(sourceSelect.value)) : null;
      if (sourceSelect?.value && !sourceGenre) {
        resultEl.className = 'inbox-result err';
        resultEl.textContent = 'Selected source genre was not found.';
        return;
      }

      const ok = window.confirm('Import @tags is an advanced backfill. It scans the pasted text and adds score 1–3 @genre rows back into pending nominations. Use Add to Inbox for normal routing. Continue?');
      if (!ok) {
        resultEl.className = 'inbox-result';
        resultEl.textContent = 'Import @tags canceled.';
        return;
      }

      const rows = studioSongRowsForRouting(raw);
      const eligible = rows
        .map(row => row.song)
        .filter(song => song && song._pendingGenreTag && song.score != null && Number(song.score) >= 1 && Number(song.score) <= 3);
      const ignoredHighFit = rows.filter(row => row.song && row.song.score != null && Number(row.song.score) >= 4).length;
      const ignoredNoTag = rows.filter(row => row.song && row.song.score != null && Number(row.song.score) <= 3 && !row.song._pendingGenreTag).length;

      if (!eligible.length) {
        resultEl.className = 'inbox-result err';
        resultEl.textContent = 'No score 1–3 rows with @genre tags were found.';
        showSaveToast('No routable Studio @tag songs found.', true);
        return;
      }

      resultEl.className = 'inbox-result';
      resultEl.textContent = `Routing ${eligible.length} low-fit @tag song${eligible.length === 1 ? '' : 's'}…`;

      const routed = [];
      const unresolved = [];
      const duplicates = [];
      for (const song of eligible) {
        const resolution = resolvePendingTargetGenre(song._pendingGenreTag, sourceGenre?.id || '');
        if (!resolution.target) {
          unresolved.push(song);
          continue;
        }
        const payload = await hydrateStudioPendingPayload(song);
        const added = queuePendingNomination(
          resolution.target,
          sourceGenre?.genre || 'Studio Import',
          payload
        );
        if (added) routed.push({ song, target: resolution.target });
        else duplicates.push({ song, target: resolution.target });
      }

      if (routed.length || duplicates.length) {
        setUnsavedState(true);
        libraryUpdatesPending = true;
        toggleLibrarySaveButton(true);
        input.value = '';
      }

      const byTarget = new Map();
      routed.forEach(item => byTarget.set(item.target.genre, (byTarget.get(item.target.genre) || 0) + 1));
      const routedSummary = [...byTarget.entries()].map(([name, count]) => `${count} → ${name}`).join(', ');
      const parts = [];
      if (routed.length) parts.push(`✓ Routed ${routed.length}: ${routedSummary}.`);
      if (duplicates.length) parts.push(`${duplicates.length} duplicate/existing song${duplicates.length === 1 ? '' : 's'} skipped.`);
      if (unresolved.length) parts.push(`${unresolved.length} unresolved @tag${unresolved.length === 1 ? '' : 's'}.`);
      if (ignoredHighFit) parts.push(`${ignoredHighFit} score 4–5 row${ignoredHighFit === 1 ? '' : 's'} ignored.`);
      if (ignoredNoTag) parts.push(`${ignoredNoTag} low-score row${ignoredNoTag === 1 ? '' : 's'} lacked @tag.`);
      const message = parts.join(' ');
      resultEl.className = unresolved.length && !routed.length ? 'inbox-result err' : 'inbox-result ok';
      resultEl.textContent = message || 'No changes.';
      showSaveToast(message || 'No Studio import changes.', unresolved.length && !routed.length);
      renderReview();
    }

    async function addToSongInbox() {
      const input = document.getElementById('inboxSongInput');
      const resultEl = document.getElementById('inboxResult');
      const targetSelect = document.getElementById('inboxTargetGenre');
      if (!input || !resultEl) return;
      const raw = input.value.trim();
      const lines = songInboxLines(raw);
      if (!lines.length) return;

      const target = targetSelect?.value ? (genres || []).find(g => String(g.id) === String(targetSelect.value)) : null;
      if (targetSelect?.value && !target) {
        resultEl.className = 'inbox-result err';
        resultEl.textContent = 'Selected genre was not found.';
        return;
      }

      resultEl.className = 'inbox-result';
      resultEl.textContent = `Processing ${lines.length} song${lines.length === 1 ? '' : 's'}…`;

      const routed = [];
      const unassigned = [];
      const failed = [];
      for (const line of lines) {
        try {
          const song = await buildInboxSongFromText(line);
          if (!song.title && !song.url) {
            failed.push(line);
            continue;
          }
          if (target) {
            addInboxSongToPending(target, song, 'Song Inbox');
            routed.push(song);
          } else {
            song.guessNote = 'Unknown genre tag — route manually when ready.';
            songInbox.push(song);
            unassigned.push(song);
          }
        } catch (error) {
          console.warn('Song inbox item failed', line, error);
          failed.push(line);
        }
      }

      if (routed.length || unassigned.length) {
        setUnsavedState(true);
        libraryUpdatesPending = true;
        toggleLibrarySaveButton(true);
        input.value = '';
      }

      const parts = [];
      if (routed.length) parts.push(`✓ Routed ${routed.length} to ${target.genre} pending.`);
      if (unassigned.length) parts.push(`Added ${unassigned.length} to Unknown / unassigned inbox.`);
      if (failed.length) parts.push(`${failed.length} could not be read.`);
      const message = parts.join(' ');
      resultEl.className = failed.length && !routed.length && !unassigned.length ? 'inbox-result err' : 'inbox-result ok';
      resultEl.textContent = message;
      if (message) showSaveToast(message, failed.length && !routed.length && !unassigned.length);
      renderReview();
    }

    function guessGenreForSong(song) {
      // Strategy 1: artist name directly matches a genre name (e.g. artist "Blues" → genre "Blues")
      // Strategy 2: fuzzy artist name appears inside a genre name or vice versa
      // Strategy 3: title keywords match genre name keywords
      const candidateGenres = (genres || []).filter(g => g && g.genre);
      if (!candidateGenres.length) return { target: null, note: 'No genres in library.' };

      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const artistNorm = norm(song.artist);
      const titleNorm = norm(song.title);

      // Score each genre
      const scored = candidateGenres.map(g => {
        const genreNorm = norm(g.genre);
        let score = 0;

        // Check existing songs in this genre for same artist
        const genreSongs = inflateSongsFromStorage(g.songs_listened || []).filter(s => !s.isPending);
        const artistMatch = genreSongs.some(s => norm(s.artist) === artistNorm && artistNorm.length > 2);
        if (artistMatch) score += 12; // Strong signal: artist already logged in this genre

        // Genre name words appear in artist or title
        const genreWords = genreNorm.split(' ').filter(w => w.length > 3);
        genreWords.forEach(w => {
          if (artistNorm.includes(w)) score += 3;
          if (titleNorm.includes(w)) score += 2;
        });

        // Levenshtein proximity between artist and genre name
        const lev = levenshtein(artistNorm, genreNorm);
        if (lev <= 2 && artistNorm.length > 3) score += 6;
        else if (lev <= 4 && artistNorm.length > 4) score += 2;

        return { genre: g, score };
      }).sort((a, b) => b.score - a.score);

      const best = scored[0];
      const second = scored[1];

      // Only auto-route if the top guess is confident and clearly ahead of second
      if (best.score >= 10 && (!second || best.score >= second.score + 4)) {
        return {
          target: best.genre,
          note: `Guessed "${best.genre.genre}" (score ${best.score}).`
        };
      }

      if (best.score >= 4) {
        return {
          target: null,
          note: `Top guesses: ${scored.slice(0,3).filter(s=>s.score>0).map(s=>`${s.genre.genre} (${s.score})`).join(', ')}. Needs manual routing.`
        };
      }

      return { target: null, note: 'No confident genre match found.' };
    }

    function routeInboxSong(idx, selectId) {
      const song = songInbox[idx];
      const select = document.getElementById(selectId);
      if (!song || !select?.value) { showSaveToast('Choose a target genre first.', true); return; }
      const target = (genres || []).find(g => String(g.id) === String(select.value));
      if (!target) { showSaveToast('Genre not found.', true); return; }
      queuePendingNomination(target, 'Song Inbox', {
        ...song,
        score: null,
        reason: '',
        isPending: true,
        pendingFrom: 'Song Inbox',
        originFit: null,
        nominatedFit: null,
        isLevelUp: false,
        isAdd: false,
        levelUp: null
      });
      songInbox[idx]._routed = true;
      setUnsavedState(true);
      libraryUpdatesPending = true;
      toggleLibrarySaveButton(true);
      showSaveToast(`Routed to ${target.genre}. Save in the top bar to persist.`);
      renderReview();
    }

    function dismissInboxSong(idx) {
      songInbox.splice(idx, 1);
      renderReview();
    }
    function renderReview() {
      const override = window.dgRunOverrideHooks?.('renderReview');
      if (override) return override.result;
      window.dgRunPreHooks?.('renderReview');
      const mount = document.getElementById('reviewContent');
      if (!mount) {
        window.dgRunPostHooks?.('renderReview');
        return;
      }
      const stats = pendingReviewStats();
      const manualRows = stats.rows.filter(row => row.status !== 'routable');
      const queuedRows = collectQueuedPendingNominationRows();
      const combinedRows = [
        ...queuedRows.map(row => ({ type: 'queued', row })),
        ...manualRows.map(row => ({ type: 'manual', row }))
      ];
      const pendingVisibleLimit = reviewPendingVisibleLimit(combinedRows.length);
      const visiblePendingRows = combinedRows.slice(0, pendingVisibleLimit);
      const hiddenPendingRows = Math.max(0, combinedRows.length - visiblePendingRows.length);
      const pendingShownCopy = combinedRows.length
        ? `${visiblePendingRows.length} shown of ${combinedRows.length} total`
        : '0 shown';
      mount.innerHTML = renderSongInboxCard() + `
        <div class="review-stat-grid">
          <button type="button" class="review-stat" onclick="scrollToReviewPendingQueue()"><strong>${combinedRows.length}</strong><span>Pending nominations</span></button>
          <div class="review-stat"><strong>${queuedRows.length}</strong><span>Queued by suggested genre</span></div>
          <div class="review-stat"><strong>${manualRows.length}</strong><span>Need best-match genre</span></div>
          <div class="review-stat"><strong>${libraryUpdatesPending || hasUnsavedChanges ? 'Yes' : 'No'}</strong><span>Unsaved cleanup</span></div>
        </div>
        <div class="review-card" id="reviewPendingQueueCard" data-review-pending-total="${combinedRows.length}" data-review-pending-visible="${visiblePendingRows.length}">
          <div class="review-card-head">
            <div>
              <h3>Pending nominations</h3>
              <p class="small" style="margin:6px 0 0;">One routing desk for queued nominations and songs that need a better genre match. Confirm the best matching genre, choose fit 4 or 5, then send the song as an <strong>ADD</strong>. Use the source genre to keep it there and clear the pending flag.</p>
            </div>
            <div class="review-card-copy-actions">
              <button type="button" class="btn btn-secondary review-pending-copy-btn" onclick="copyReviewPendingQueueFirst25()" title="Copy the first 25 visible pending nominations">⧉ Copy first 25</button>
              <button type="button" class="btn btn-secondary btn-tiny" onclick="refreshReviewPendingQueueList()" title="Refresh this visible routing batch from current data">Refresh list</button>
              ${hiddenPendingRows ? `<button type="button" class="btn btn-primary btn-tiny" onclick="loadNextReviewPendingQueue(25)" title="Show the next 25 pending nominations">Load next 25</button>` : ''}
              <span class="review-chip">${pendingShownCopy}${hiddenPendingRows ? ` · ${hiddenPendingRows} more` : ''}</span>
            </div>
          </div>
          <div class="review-filter-row">
            <input id="reviewPendingSearch" type="search" placeholder="Search queued songs, source genre, or target genre…" oninput="filterReviewPendingQueue('reviewPendingSearch')">
            <span class="small" id="reviewPendingVisibleCount">${pendingShownCopy}${hiddenPendingRows ? ` · ${hiddenPendingRows} more available` : ''}</span>
          </div>
          ${combinedRows.length ? `<datalist id="reviewPendingMoveGenreOptions">${reviewGenreDatalistOptions()}</datalist><div class="review-list-scroll" data-review-pending-total="${combinedRows.length}" data-review-pending-visible="${visiblePendingRows.length}">${visiblePendingRows.map(item => item.type === 'queued' ? reviewQueuedPendingRowHtml(item.row) : reviewManualPendingRowHtml(item.row)).join('')}</div>${hiddenPendingRows ? `<div class="review-load-next-wrap"><button type="button" class="btn btn-primary" onclick="loadNextReviewPendingQueue(25)">Load next 25 pending nominations</button><span class="small">${hiddenPendingRows} more remain after this visible batch.</span></div>` : ''}` : `<div class="viz-empty">No songs are currently queued as pending nominations.</div>`}
        </div>`
      window.dgRunPostHooks?.('renderReview');
    }

    function runPendingTagCleanupFromReview() {
      preserveScrollPosition(async () => {
        reexaminePendingTags();
        renderReview();
      });
    }

    function movePendingReviewItem(encodedSourceId, encodedKey, selectId) {
      const sourceId = decodeURIComponent(String(encodedSourceId || ''));
      const key = decodeURIComponent(String(encodedKey || ''));
      const select = document.getElementById(selectId);
      const targetId = select?.value || '';

      if (!targetId) {
        showSaveToast('Choose a target genre first.', true);
        return;
      }

      const sourceGenre = (genres || []).find(g => String(g.id) === String(sourceId));
      const target = (genres || []).find(g => String(g.id) === String(targetId));

      if (!sourceGenre || !target) {
        showSaveToast('Could not find that source or target genre.', true);
        return;
      }

      const sourceSongs = inflateSongsFromStorage(sourceGenre.songs_listened || []).filter(song => !song.isPending);
      const songIndex = sourceSongs.findIndex(candidate => songIdentity(candidate) === key);
      const song = songIndex >= 0 ? sourceSongs[songIndex] : null;

      if (!song) {
        showSaveToast('Could not find that pending source song.', true);
        return;
      }

      genres.forEach(possibleTarget => {
        const pending = normalizePendingSongs(possibleTarget.pending_songs || []);
        possibleTarget.pending_songs = pending.filter(candidate => {
          const fromSameSource = normalizePendingTag(candidate.pendingFrom || '') === normalizePendingTag(sourceGenre.genre || '');
          return !(fromSameSource && songIdentity(candidate) === key);
        });
      });

      const added = queuePendingNomination(target, sourceGenre.genre, pendingReviewSongPayload(song));

      // This manual Review move resolves the original pending tag marker.
      // Without clearing it, renderReview() immediately shows the same row again.
      sourceSongs[songIndex]._pendingGenreTag = '';
      sourceGenre.songs_listened = sourceSongs;

      setUnsavedState(true);
      libraryUpdatesPending = true;
      toggleLibrarySaveButton(true);
      renderReview();

      if (currentGenre) {
        const restore = preserveScrollSnapshot();
        loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
        applyDetailEditMode(detailEditMode);
        restore();
      }

      showSaveToast(
        added
          ? `Moved pending nomination to ${target.genre}. Save in the top bar to persist.`
          : `Pending nomination already exists in ${target.genre}. Save in the top bar to persist.`,
        false
      );
    }



    function applyDetailEditMode(focusEditor = false) {
      const screen = document.getElementById('screen-listen');
      const panel = document.getElementById('listenEditPanel');
      if (!screen || !panel) return;
      screen.classList.toggle('is-view-mode', !detailEditMode);
      panel.classList.toggle('is-hidden', !detailEditMode);
      panel.classList.toggle('is-editing', detailEditMode);
      if (detailEditMode && focusEditor) {
        setTimeout(() => {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.getElementById('songsListenedBulk')?.focus({ preventScroll: true });
        }, 0);
      }
    }
