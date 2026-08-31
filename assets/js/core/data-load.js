

    // Daily Genre v242: Worker-first data loading.
    // GitHub's object media type returns the blob SHA and size without embedding
    // the multi-megabyte file contents, so normal launches can verify freshness
    // without downloading and parsing genres_data.json twice.
    async function fetchProductionDataMetadata() {
      try {
        const apiRes = await fetch(DATA_API_URL, {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github.object+json' }
        });
        const meta = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && meta && meta.sha) {
          return {
            sha: String(meta.sha || ''),
            size: Number(meta.size || 0) || 0
          };
        }
        console.info('[Daily Genre] GitHub revision metadata unavailable; continuing with Worker data.', {
          status: apiRes.status
        });
      } catch (apiError) {
        console.info('[Daily Genre] GitHub revision check failed; continuing with Worker data.', apiError);
      }
      return null;
    }

    async function fetchProductionDataFallback(metadata = null) {
      const meta = metadata || await fetchProductionDataMetadata();

      try {
        const rawRes = await fetch(DATA_URL, { cache: 'no-store' });
        const parsed = await rawRes.json().catch(() => null);
        if (rawRes.ok && Array.isArray(parsed)) {
          return {
            data: parsed,
            sha: String(meta?.sha || ''),
            size: Number(meta?.size || 0) || 0,
            source: 'github-raw'
          };
        }
      } catch (rawError) {
        console.warn('Raw JSON fallback failed', rawError);
      }

      return null;
    }

function spotifyRestoreReturnAfterDataLoad() {
  const state = spotifyReturnStateAfterCallback;
  if (!state) {
    // Never auto-resume a stored playlist intent during ordinary page load.
    // Stale stored intents after a canceled/failed Spotify auth can otherwise re-open the
    // playlist modal, which immediately starts auth again and creates an auth loop.
    spotifyClearReturnState();
    return;
  }
  if (!spotifySession?.access_token) {
    spotifyClearReturnState();
    spotifyReturnStateAfterCallback = null;
    return;
  }

  let restoredGenre = false;
  if (state.hash && /^#genre=/.test(state.hash)) {
    const id = decodeURIComponent(state.hash.replace(/^#genre=/, ''));
    const genre = (genres || []).find(g => String(g.id) === String(id));
    if (genre) restoredGenre = openGenreDetail(genre, false, { force: true }) !== false;
  } else if (state.screen && state.screen !== 'spin') {
    switchScreen(state.screen, { force: true });
  }

  if (Array.isArray(state.reopenPlaylistGenreIds) && state.reopenPlaylistGenreIds.length) {
    archivePlaylistSelectedGenreIds = new Set(state.reopenPlaylistGenreIds.map(String));
    if (!restoredGenre) switchScreen('history', { force: true });
    renderHistory();
    showSaveToast('Spotify connected. Click Playlist selected again when you are ready.', false);
  } else if (state.reopenPlaylistGenreId) {
    showSaveToast('Spotify connected. Click Playlist again when you are ready.', false);
  }

  spotifyClearReturnState();
  spotifyReturnStateAfterCallback = null;
}

function rerenderActiveScreenAfterDataLoad() {
  const activeScreenId = document.querySelector('.screen.active')?.id || '';

  if (activeScreenId === 'screen-review' && typeof renderReview === 'function') {
    renderReview();
  } else if (activeScreenId === 'screen-viz' && typeof renderVisuals === 'function') {
    renderVisuals();
  } else if (activeScreenId === 'screen-history' && typeof renderHistory === 'function') {
    renderHistory();
  } else if (activeScreenId === 'screen-ranking' && typeof renderRankings === 'function') {
    renderRankings();
  }
}

async function loadData() {
  remainingCount.textContent = 'Loading genres...';
  remainingCount.classList.remove('pill-error');
  remainingCount.classList.add('pill-loading');

  let workerLoaded = null;
  let githubLoaded = null;
  let githubMetadata = null;
  let loaded = null;

  function uniqueGenreCount(rows) {
    return new Set((rows || []).map(g => String(g && g.id != null ? g.id : (g && g.genre) || ''))).size;
  }

  function maxGenreId(rows) {
    return (rows || []).reduce((max, g) => {
      const id = Number(g && g.id);
      return Number.isFinite(id) ? Math.max(max, id) : max;
    }, -1);
  }

  // Check the cheap SHA metadata and the local IndexedDB cache in parallel,
  // before paying for any full data transfer. If the cached library's SHA
  // still matches the current remote SHA, skip the Worker/GitHub fetch
  // entirely -- the data changes at most once a day, but this runs on
  // every page load.
  const githubMetadataPromise = fetchProductionDataMetadata();
  const cachedEntryPromise = window.DailyGenreDataCache?.load?.() ?? Promise.resolve(null);
  const [githubMetadataResult, cachedEntry] = await Promise.all([
    githubMetadataPromise,
    cachedEntryPromise
  ]);
  githubMetadata = githubMetadataResult;

  const remoteShaForCache = String(githubMetadata?.sha || '');
  const canUseCachedLibrary =
    window.DailyGenreDataCache?.shouldUseCachedLibrary?.(cachedEntry, remoteShaForCache) ?? false;

  if (canUseCachedLibrary) {
    loaded = { data: cachedEntry.data, sha: cachedEntry.sha, source: 'cache' };
  } else {
    try {
      const res = await fetch(WORKER_URL, { method: 'GET', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && Array.isArray(data.data)) {
        workerLoaded = {
          data: data.data,
          sha: String(data.sha || ''),
          source: 'worker'
        };
      } else {
        console.warn('Production Worker data load did not return the expected shape; checking GitHub JSON.', data);
      }
    } catch (workerError) {
      console.warn('Production Worker data load failed; checking GitHub JSON.', workerError);
    }

    if (workerLoaded) {
      loaded = workerLoaded;

      const workerSha = String(workerLoaded.sha || '');
      const githubSha = String(githubMetadata?.sha || '');

      // A missing Worker SHA cannot be safely compared, so treat it like a
      // mismatch. The expensive raw download occurs only on this exceptional path.
      if (githubSha && (!workerSha || workerSha !== githubSha)) {
        githubLoaded = await fetchProductionDataFallback(githubMetadata);

        const workerCountForCheck = uniqueGenreCount(workerLoaded.data);
        const githubCountForCheck = uniqueGenreCount(githubLoaded?.data);

        if (githubLoaded && githubCountForCheck >= workerCountForCheck) {
          loaded = githubLoaded;
          console.warn('[Daily Genre] Worker revision differs from GitHub; using current GitHub data.', {
            workerCount: workerCountForCheck,
            githubCount: githubCountForCheck,
            workerSha,
            githubSha
          });
          showSaveToast('Worker revision was stale; loaded the current GitHub library.', false);
        } else if (githubLoaded) {
          console.warn('[Daily Genre] GitHub revision differed but returned fewer genres; keeping Worker data.', {
            workerCount: workerCountForCheck,
            githubCount: githubCountForCheck,
            workerSha,
            githubSha
          });
        }
      }
    } else {
      // The Worker is unavailable or malformed, so pay the cost of the full raw
      // GitHub download only as a true fallback.
      githubLoaded = await fetchProductionDataFallback(githubMetadata);
      loaded = githubLoaded;
    }
  }

  const workerCount = uniqueGenreCount(workerLoaded && workerLoaded.data);
  const githubCount = uniqueGenreCount(githubLoaded && githubLoaded.data);
  const workerMaxId = maxGenreId(workerLoaded && workerLoaded.data);
  const githubMaxId = maxGenreId(githubLoaded && githubLoaded.data);

  if (!loaded || !Array.isArray(loaded.data)) {
    remainingCount.classList.remove('pill-loading');
    remainingCount.classList.add('pill-error');
    remainingCount.textContent = 'Could not load production data.';
    showSaveToast('Could not load production data from the Worker or GitHub JSON.', true);
    // Surface the existing retry/diagnostics panel (assets/js/genre-data.js)
    // right away instead of waiting for its 8-20s window-load timer, since
    // we already know for certain the load failed.
    window.DailyGenreCore?.check?.({ showOnFailure: true, source: 'load-data-failed' });
    return;
  }

  // Daily Genre v244: normalize the selected library once after source
  // selection. This runtime path is intentionally storage-safe: it fixes
  // collection shape without coercing values that would cause broad save diffs.
  const runtimeLibraryNormalizer =
    window.DailyGenreNormalize?.normalizeGenreLibraryForRuntime;
  const normalizedAtLoad = typeof runtimeLibraryNormalizer === 'function';

  const nextGenreLibrary = normalizedAtLoad
    ? runtimeLibraryNormalizer(loaded.data)
    : loaded.data;

  if (!normalizedAtLoad) {
    console.warn(
      '[Daily Genre] Runtime normalizer was unavailable; using the legacy load path.'
    );
  }

  replaceGenreLibrary(nextGenreLibrary, 'data-load');
  serverFileSha = loaded.sha || '';
  window.dailyGenreDataSource = {
    source: loaded.source,
    normalizedAtLoad,
    normalizerMode: normalizedAtLoad ? 'runtime-storage-safe' : 'legacy',
    loadedCount: uniqueGenreCount(loaded.data),
    loadedMaxId: maxGenreId(loaded.data),
    workerCount,
    workerMaxId,
    githubCount,
    githubMaxId,
    githubDataFetched: Boolean(githubLoaded),
    githubRevisionChecked: Boolean(githubMetadata),
    githubDataSize: Number(githubMetadata?.size || githubLoaded?.size || 0) || 0,
    workerSha: workerLoaded && workerLoaded.sha,
    githubSha: String(githubMetadata?.sha || githubLoaded?.sha || '')
  };
  console.info('[Daily Genre] Data source selected', window.dailyGenreDataSource);

  // Persist a freshly fetched (non-cache) library for next load's SHA check
  // to short-circuit. Fire-and-forget: a cache write failure (quota,
  // unsupported browser) should never affect the current session.
  if (loaded.source !== 'cache' && loaded.sha) {
    window.DailyGenreDataCache?.save?.(loaded.sha, loaded.data)?.catch?.(() => {});
  }

  genres.forEach(g => {
    if (!Array.isArray(g.songs_listened)) g.songs_listened = g.songs_listened ? [].concat(g.songs_listened) : [];
    if (!Array.isArray(g.pending_songs)) g.pending_songs = g.pending_songs ? [].concat(g.pending_songs) : [];
  });

  warnDuplicateGenresOnLoad();

  genres.forEach(g => {
    g.songs_listened = inflateSongsFromStorage(g.songs_listened);
    g.pending_songs = normalizePendingSongs(g.pending_songs);
    removeLoggedSongsFromPending(g);
  });

  repairExistingPendingSources();

  updateRemainingCount();
  refreshTopAlbumDiveButton();
  buildSpinnerPool();
  populateMonthFilter();

  // Daily Genre v241: defer expensive inactive-screen rendering.
  // switchScreen() renders Archive/Rankings when opened, while this helper
  // still restores either screen if it was already active during data load.
  rerenderActiveScreenAfterDataLoad();

  const hashMatch = location.hash.match(/^#genre=(.+)$/);
  if (hashMatch) {
    const id = decodeURIComponent(hashMatch[1]);
    const genre = getGenreById(id);
    if (genre) openGenreDetail(genre, false);
  }
  spotifyRestoreReturnAfterDataLoad();
}
