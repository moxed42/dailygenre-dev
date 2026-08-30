
    let hasUnsavedChanges = false;

    function setUnsavedState(isDirty) {
      hasUnsavedChanges = !!isDirty;
      // Daily Genre v219: expose the real dirty flag for add-on modules and
      // mobile diagnostics. Some Studio actions previously set window-level
      // flags that did not reflect the lexical save state used by Save.
      try { window.__dgHasUnsavedChanges = hasUnsavedChanges; } catch (_) {}
      const saveBtn = document.getElementById('saveBtn');
      if (saveBtn) saveBtn.dataset.dirty = hasUnsavedChanges ? 'true' : 'false';
      const listenTab = document.querySelector('.tab-btn[data-screen="listen"]');
      if (listenTab) listenTab.classList.toggle('dirty', hasUnsavedChanges);
    }

    let listeningFocusMode = 'songs';

    function listeningFocusStorageKey(genre = currentGenre) {
      const id = genre?.id || genre?.genre || 'default';
      return `dailyGenreListeningFocus:${id}`;
    }

    function genreHasAlbumDiveContent(genre = currentGenre) {
      const dive = genre?.albumDive || genre?.album_dive || null;
      const slots = Array.isArray(dive?.slots) ? dive.slots : [];
      return slots.some(slot => slot && (slot.album || slot.artist || slot.spotify_url || slot.spotifyUrl || slot.albumUrl || slot.url || slot.rationale || slot.albumArt || slot.manualAlbumArt));
    }

    function getListeningFocusMode(genre = currentGenre) {
      const key = listeningFocusStorageKey(genre);
      let saved = '';
      try { saved = safeStorageGet(key) || ''; } catch {}
      const hasAlbums = genreHasAlbumDiveContent(genre);
      const mode = saved || (hasAlbums ? 'albums' : 'songs');
      return mode === 'albums' && hasAlbums ? 'albums' : 'songs';
    }

    // Daily Genre v251: render the Album Dive pane once per mounted genre view.
    const albumDiveMountDiagnostics = {
      renders: 0,
      reuses: 0,
    };

    function ensureMountedAlbumDivePanel(pane, genre = currentGenre) {
      if (!pane || !genre || typeof renderAlbumDivePanel !== 'function') {
        return false;
      }

      if (pane.dataset.albumDiveMounted === 'true') {
        albumDiveMountDiagnostics.reuses += 1;
        window.__dailyGenrePerformanceTracker?.increment?.(
          'albumDiveMount.reuses',
        );
        return true;
      }

      const token =
        window.__dailyGenrePerformanceTracker?.start?.(
          'albumDiveMount.render',
          { genreId: String(genre.id || genre.genre || '') },
        ) || null;

      try {
        pane.innerHTML = renderAlbumDivePanel(genre);
        pane.dataset.albumDiveMounted = 'true';
        albumDiveMountDiagnostics.renders += 1;
        window.__dailyGenrePerformanceTracker?.increment?.(
          'albumDiveMount.renders',
        );
        return true;
      } finally {
        if (token) {
          window.__dailyGenrePerformanceTracker?.end?.(
            token,
            { genreId: String(genre.id || genre.genre || '') },
          );
        }
      }
    }

    window.dailyGenreAlbumDiveMountDiagnostics = () => ({
      strategy: 'mounted-pane-flag',
      ...albumDiveMountDiagnostics,
    });

    function setListeningFocusMode(mode, event = null) {
      if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
      const previousScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const previousScrollX = window.scrollX || document.documentElement.scrollLeft || 0;
      const previousActive = document.activeElement;
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      try { previousActive?.blur?.(); } catch {}

      listeningFocusMode = mode === 'albums' ? 'albums' : 'songs';
      try { safeStorageSet(listeningFocusStorageKey(currentGenre), listeningFocusMode); } catch {}

      const restoreListeningToggleScroll = () => {
        try { window.scrollTo({ left: previousScrollX, top: previousScrollY, behavior: 'auto' }); }
        catch { window.scrollTo(previousScrollX, previousScrollY); }
      };

      const shell = document.querySelector('.listening-focus-section-shell');
      const songsPane = document.querySelector('.listening-focus-songs');
      const albumsPane = document.querySelector('.listening-focus-albums');
      if (shell && songsPane && albumsPane && currentGenre) {
        shell.dataset.listeningFocus = listeningFocusMode;
        shell.querySelectorAll('.listening-focus-tab').forEach(tab => {
          const isActive = tab.dataset.focusMode === listeningFocusMode;
          tab.classList.toggle('active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        songsPane.classList.toggle('hidden', listeningFocusMode !== 'songs');
        albumsPane.classList.toggle('hidden', listeningFocusMode !== 'albums');
        if (listeningFocusMode === 'albums') {
          ensureMountedAlbumDivePanel(albumsPane, currentGenre);
        }
      } else if (currentGenre && typeof loadListenScreen === 'function') {
        loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      }

      restoreListeningToggleScroll();
      requestAnimationFrame(() => {
        restoreListeningToggleScroll();
        requestAnimationFrame(restoreListeningToggleScroll);
      });
      setTimeout(() => {
        if (typeof enhanceSongListeningExperience === 'function') enhanceSongListeningExperience();
        if (typeof hydrateAlbumDiveAmbient === 'function') hydrateAlbumDiveAmbient();
        restoreListeningToggleScroll();
      }, 0);
      [40, 120, 260, 520, 900].forEach(delay => setTimeout(restoreListeningToggleScroll, delay));
      setTimeout(() => { document.documentElement.style.scrollBehavior = previousBehavior; }, 940);
    }
    window.setListeningFocusMode = setListeningFocusMode;
    window.getListeningFocusMode = getListeningFocusMode;

    function renderListeningFocusTabs(genre) {
      const mode = getListeningFocusMode(genre);
      const albumReady = genreHasAlbumDiveContent(genre);
      const dive = genre?.albumDive || genre?.album_dive || null;
      let albumMeta = albumReady ? 'Album shelf ready' : 'Start or import a dive';
      if (albumReady && typeof albumDiveProgress === 'function') {
        const progress = albumDiveProgress(dive);
        albumMeta = `${progress.fetched}/${progress.total} fetched · ${progress.finished}/${progress.total} finished`;
      }
      return `<div class="listening-focus-head">
          <div>
            <div class="eyebrow listening-focus-eyebrow">Listening</div>
            <div class="small listening-focus-subtitle">Switch between the song carousel and this genre’s album shelf.</div>
          </div>
          <div class="listening-focus-tabs" role="tablist" aria-label="Listening focus">
            <button type="button" class="listening-focus-tab ${mode === 'songs' ? 'active' : ''}" data-focus-mode="songs" role="tab" aria-selected="${mode === 'songs'}" onclick="setListeningFocusMode('songs', event)">Songs</button>
            <button type="button" class="listening-focus-tab ${mode === 'albums' ? 'active' : ''}" data-focus-mode="albums" role="tab" aria-selected="${mode === 'albums'}" onclick="setListeningFocusMode('albums', event)">Albums <span>${escapeHtml(albumMeta)}</span></button>
          </div>
        </div>`;
    }

    let lastSavedListenSnapshot = '';

    function buildListenSnapshot() {
      if (!currentGenre) return '';
      return JSON.stringify({
        id: currentGenre.id || '',
        rating: currentGenre.rating || '',
        favoriteSong: document.getElementById('favoriteSong')?.value?.trim() || '',
        favoriteSongUrl: document.getElementById('favoriteSongUrl')?.value?.trim() || '',
        notes: document.getElementById('notes')?.value || '',
        songsListenedBulk: document.getElementById('songsListenedBulk')?.value || '',
        albumDive: currentGenre.albumDive ? JSON.stringify(currentGenre.albumDive) : '',
        songReactions: collectSongReactionSnapshot(currentGenre.songs_listened || []),
        pendingSongs: pendingSongsForStorage(currentGenre.pending_songs || []),
        contender: !!document.getElementById('monthlyContender')?.checked,
        favorite: !!document.getElementById('monthFavorite')?.checked,
        least: !!document.getElementById('monthLeastFavorite')?.checked
      });
    }

    function refreshDirtyFromSnapshot() {
      if (!currentGenre) {
        setUnsavedState(false);
        return;
      }
      setUnsavedState(buildListenSnapshot() !== lastSavedListenSnapshot);
    }

    function resetListenDirtySnapshot() {
      lastSavedListenSnapshot = buildListenSnapshot();
      setUnsavedState(false);
    }
    window.resetListenDirtySnapshot = resetListenDirtySnapshot;

    function markDirty() {
      refreshDirtyFromSnapshot();
    }

    function screenTitle(name) {
      const labels = {
        spin: 'Spin',
        history: 'Archive',
        viz: 'Visuals',
        review: 'Review',
        ranking: 'Ranking'
      };
      return labels[name] ? `${labels[name]} | Daily Genre` : DEFAULT_PAGE_TITLE;
    }

    // v193: keep non-active screens inert so Firefox/password-manager observers
    // have less live form/control surface to scan after the save-password modal.
    function applyScreenInertState(activeScreen) {
      document.querySelectorAll('.screen').forEach(el => {
        const isActive = el === activeScreen;
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        try { el.inert = !isActive; } catch (_) {}
      });
    }


    // Daily Genre v248.1: direct navigation render cache.
    const navigationScreenRenderCache =
      window.DailyGenreScreenCache?.createScreenRenderCache?.({
        getRevision: () => {
          try {
            const diagnostics = window.dailyGenreLibraryIndexDiagnostics?.();
            if (diagnostics?.revision != null) return diagnostics.revision;
          } catch {}
          return `${Array.isArray(genres) ? genres.length : 0}:${serverFileSha || ''}`;
        },
        getSignature: screen => {
          const value = id => String(document.getElementById(id)?.value || '');

          if (screen === 'history') {
            return JSON.stringify({
              archiveView: String(archiveView || ''),
              search: value('archiveSearchInput'),
              sort: value('archiveSortFilter'),
              month: value('historyMonthFilter'),
              rating: value('historyRatingFilter'),
              flag: value('archiveFlagFilter'),
            });
          }

          if (screen === 'review') {
            return JSON.stringify({
              search: value('reviewPendingSearch'),
              inboxSong: value('inboxSongInput'),
              inboxTarget: value('inboxTargetGenre'),
              queueLimit: Number(vizQueueLimits?.reviewPending || 0),
            });
          }

          if (screen === 'ranking') {
            return JSON.stringify({
              tier: value('ranksPolishTierFilter'),
              category: value('ranksPolishCategoryFilter'),
              parent: value('ranksPolishParentFilter'),
              search: value('ranksPolishSearch'),
            });
          }

          return '';
        },
        isReady: screen => {
          const targets = {
            history: [
              '#historyContent',
              '#historyList',
              '#historyWrap',
              '#screen-history .archive-list',
              '#screen-history .history-list',
            ],
            review: ['#reviewContent'],
            ranking: ['#rankingWrap'],
          };
          return (targets[screen] || []).some(selector => {
            const element = document.querySelector(selector);
            return Boolean(
              element &&
              (
                element.childElementCount > 0 ||
                String(element.textContent || '').trim()
              )
            );
          });
        },
        isAllowed: () => {
          if (libraryUpdatesPending) return false;
          const floatingSave = document.getElementById('floatingListeningSave');
          return !floatingSave || floatingSave.classList.contains('hidden');
        },
        onEvent: (type, detail) => {
          window.__dailyGenrePerformanceTracker?.event?.(
            `screenCache.${type}`,
            detail,
          );
          if (type === 'hit') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'screenCache.hits',
            );
          }
          if (type === 'render') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'screenCache.renders',
            );
          }
          if (type === 'bypass') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'screenCache.bypasses',
            );
          }
        },
      }) || null;

    function renderNavigationScreen(screen, renderFn, options = {}) {
      if (typeof renderFn !== 'function') return undefined;

      const shouldRender =
        !navigationScreenRenderCache ||
        navigationScreenRenderCache.shouldRender(screen, options);

      if (!shouldRender) return undefined;

      const token =
        window.__dailyGenrePerformanceTracker?.start?.(
          `screen.${screen}.render`,
          { directNavigationCache: true },
        ) || null;

      try {
        const result = renderFn();
        navigationScreenRenderCache?.markRendered(screen);
        return result;
      } finally {
        if (token) {
          window.__dailyGenrePerformanceTracker?.end?.(
            token,
            { directNavigationCache: true },
          );
        }
      }
    }

    window.dailyGenreScreenCacheInvalidate = (
      screen = null,
      reason = 'manual',
    ) => navigationScreenRenderCache?.invalidate(screen, reason);

    window.dailyGenreScreenCacheDiagnostics = () => ({
      installed: Boolean(navigationScreenRenderCache),
      strategy: 'direct-switchScreen',
      ...(
        navigationScreenRenderCache?.snapshot?.() || {
          entries: {},
          counters: {},
        }
      ),
    });

    // Daily Genre v252: cancel delayed work from superseded navigation.
    let screenNavigationRevision = 0;
    const screenNavigationScheduleDiagnostics = {
      scheduled: 0,
      executed: 0,
      cancelled: 0,
    };

    function scheduleCurrentScreenWork(name, revision, delay, work) {
      screenNavigationScheduleDiagnostics.scheduled += 1;

      setTimeout(() => {
        const isActive =
          document.getElementById(`screen-${name}`)
            ?.classList.contains('active') === true;

        if (revision !== screenNavigationRevision || !isActive) {
          screenNavigationScheduleDiagnostics.cancelled += 1;
          window.__dailyGenrePerformanceTracker?.increment?.(
            'screenSchedule.cancelled',
          );
          window.__dailyGenrePerformanceTracker?.event?.(
            'screenSchedule.cancelled',
            {
              screen: name,
              revision,
              currentRevision: screenNavigationRevision,
            },
          );
          return;
        }

        screenNavigationScheduleDiagnostics.executed += 1;
        window.__dailyGenrePerformanceTracker?.increment?.(
          'screenSchedule.executed',
        );
        work();
      }, delay);
    }

    window.dailyGenreScreenScheduleDiagnostics = () => ({
      revision: screenNavigationRevision,
      ...screenNavigationScheduleDiagnostics,
    });

function switchScreen(name, options = {}) {
      const currentActive = document.querySelector('.screen.active');
      const currentName = currentActive?.id?.replace('screen-', '') || '';

      if (!options.force && hasUnsavedChanges && currentName === 'listen' && name !== 'listen') {
        const shouldLeave = window.confirm('You have unsaved changes. Leave without saving?');
        if (!shouldLeave) return false;
      }

      const screen = document.getElementById(`screen-${name}`);
      if (!screen) return false;

      const navigationRevision = ++screenNavigationRevision;

      applyScreenInertState(screen);
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

      const tab = document.querySelector(`.tab-btn[data-screen="${name}"]`);
      if (tab) tab.classList.add('active');

      if (name !== 'listen') {
        document.title = screenTitle(name);
      }

      if (name === 'viz') {
        scheduleCurrentScreenWork('viz', navigationRevision, 50, () => {
          if (typeof initVisuals === 'function') {
            initVisuals();
          } else if (typeof renderVisuals === 'function') {
            renderVisuals();
          }
        });
      }

      if (name === 'review') {
        scheduleCurrentScreenWork('review', navigationRevision, 20, () => {
          if (typeof renderReview === 'function') {
            renderNavigationScreen('review', renderReview);
          }
        });
      }

      if (name === 'history' && !options.skipRender) {
        scheduleCurrentScreenWork('history', navigationRevision, 0, () => {
          if (typeof renderHistory === 'function') {
            renderNavigationScreen('history', renderHistory);
          }
        });
      }

      if (name === 'ranking' && !options.skipRender) {
        scheduleCurrentScreenWork('ranking', navigationRevision, 0, () => {
          if (typeof renderRankings === 'function') {
            renderNavigationScreen('ranking', renderRankings);
          }
        });
      }

      if (!options.preserveScroll && name !== 'listen') {
        requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      }

      return true;
    }

    function preserveScrollSnapshot() {
      const x = window.scrollX || window.pageXOffset || 0;
      const y = window.scrollY || window.pageYOffset || 0;
      return () => {
        requestAnimationFrame(() => window.scrollTo(x, y));
        setTimeout(() => window.scrollTo(x, y), 0);
      };
    }

    async function preserveScrollPosition(work) {
      const restore = preserveScrollSnapshot();
      try {
        return await work();
      } finally {
        restore();
      }
    }

    

    // Daily Genre v245: revisioned library index foundation.
    const genreByIdIndexState =
      window.DailyGenreLibraryIndex?.createRevisionedGenreIndex?.() || null;

    let reviewGenreDatalistHtml = null;
    let reviewGenreDatalistSource = null;
    let reviewGenreDatalistLength = -1;

    function invalidateGenreIndexes(reason = 'mutation') {
      window.dailyGenreArchiveRenderReuseInvalidate?.('genre-index-invalidation');
      if (genreByIdIndexState) {
        genreByIdIndexState.invalidate();
        try {
          window.__dailyGenreLibraryRevision = genreByIdIndexState.revision();
          window.__dailyGenreLibraryRevisionReason = String(reason || 'mutation');
        } catch (_) {}
      }
      reviewGenreDatalistHtml = null;
      reviewGenreDatalistSource = null;
      reviewGenreDatalistLength = -1;
      try { archiveViewModelCache?.clear?.(reason); } catch (_) {}
    }

    function replaceGenreLibrary(nextGenres, reason = 'replace-all') {
      genres = Array.isArray(nextGenres) ? nextGenres : [];
      window.genres = genres;
      invalidateGenreIndexes(reason);
      if (typeof invalidateUnlistenedCache === 'function') {
        invalidateUnlistenedCache();
      }
      return genres;
    }

    function replaceGenreAtIndex(index, nextGenre, reason = 'replace-one') {
      if (
        !Array.isArray(genres) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= genres.length
      ) {
        return false;
      }
      genres[index] = nextGenre;
      invalidateGenreIndexes(reason);
      return true;
    }

    function getGenreById(id) {
      if (genreByIdIndexState) {
        return genreByIdIndexState.getById(genres, id);
      }
      return (Array.isArray(genres) ? genres : []).find(
        genre => String(genre?.id ?? '') === String(id)
      ) || null;
    }

    window.dailyGenreLibraryIndexDiagnostics = () =>
      genreByIdIndexState
        ? genreByIdIndexState.stats()
        : {
            revision: null,
            indexedRevision: null,
            indexedLength: Array.isArray(genres) ? genres.length : 0,
            size: null,
            ready: false,
          };

    function isProgramListenedDate(genre) {
      // Daily Genre 2026 should only treat 2026 listen dates as proof that a genre
      // has been consumed. Some imported/legacy rows can carry older date_normalized
      // values that are not actual listening history for this project.
      return String(dateValue(genre) || '').startsWith('2026-');
    }

    function isGenreAlreadyListened(genre) {
      const status = normalizedGenreStatus(genre);
      return status === 'listened' || isProgramListenedDate(genre) || isGenreZanger(genre);
    }

    function isGenreRemaining(genre) {
      const status = normalizedGenreStatus(genre);
      if (isGenreAlreadyListened(genre)) return false;
      // Count legacy/imported rows with a blank status as remaining, because they have
      // not been listened to yet and should still be eligible for Spin. Older non-2026
      // dates are ignored unless the row is explicitly status=listened.
      return status === '' || status === 'unlistened';
    }

    let cachedUnlistenedGenres = null;

    function invalidateUnlistenedCache() {
      cachedUnlistenedGenres = null;
    }

    function getUnlistened() {
      if (!cachedUnlistenedGenres) {
        cachedUnlistenedGenres = genres.filter(isGenreRemaining);
      }
      return cachedUnlistenedGenres;
    }

    function remainingExclusionReason(genre) {
      const status = normalizedGenreStatus(genre);
      const date = dateValue(genre);
      if (isGenreZanger(genre)) return 'zanger/veto';
      if (status === 'listened' && date && !String(date).startsWith('2026-')) return `status=listened with older date (${date})`;
      if (status === 'listened') return date ? `status=listened (${date})` : 'status=listened with no date';
      if (date && String(date).startsWith('2026-')) return `listened/date-stamped in 2026 (${date})`;
      if (status && status !== 'unlistened') return `legacy/other status=${status}`;
      return '';
    }

    function getLoadedGenreIdAudit() {
      const numericIds = genres
        .map(g => Number(g && g.id))
        .filter(n => Number.isInteger(n) && n >= 0)
        .sort((a, b) => a - b);
      const seen = new Set(numericIds);
      const minId = numericIds.length ? numericIds[0] : null;
      const maxId = numericIds.length ? numericIds[numericIds.length - 1] : null;
      const missingIds = [];
      if (minId !== null && maxId !== null) {
        for (let id = minId; id <= maxId; id += 1) {
          if (!seen.has(id)) missingIds.push(id);
        }
      }
      return {
        actualRows: genres.length,
        numericIdRows: numericIds.length,
        minId,
        maxId,
        impliedRowsIfContiguous: minId !== null && maxId !== null ? (maxId - minId + 1) : genres.length,
        missingIdCount: missingIds.length,
        missingIds,
        missingIdPreview: missingIds.slice(0, 160)
      };
    }

    function getRemainingCountDiagnostics() {
      const total = genres.length;
      const remainingRows = getUnlistened();
      const zangerRows = genres.filter(isGenreZanger);
      const listenedRows = genres.filter(g => !isGenreZanger(g) && (normalizedGenreStatus(g) === 'listened' || isProgramListenedDate(g)));
      const olderDateRows = genres.filter(g => !isGenreZanger(g) && dateValue(g) && !isProgramListenedDate(g));
      const olderDateIgnoredRows = olderDateRows.filter(g => normalizedGenreStatus(g) !== 'listened');
      const blankStatusRows = genres.filter(g => normalizedGenreStatus(g) === '');
      const legacyOtherStatusRows = genres.filter(g => {
        const status = normalizedGenreStatus(g);
        return status && !['unlistened', 'listened', 'veto', 'zanger'].includes(status);
      });
      const statusBuckets = genres.reduce((acc, g) => {
        const status = normalizedGenreStatus(g) || '(blank)';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const listenedThisYear = listenedRows.filter(g => String(dateValue(g)).startsWith('2026-')).length;
      const listenedBeforeThisYear = listenedRows.length - listenedThisYear;
      const unavailable = Math.max(0, total - remainingRows.length);
      const excludedRows = genres.filter(g => !isGenreRemaining(g));
      const exclusionBuckets = excludedRows.reduce((acc, g) => {
        const reason = remainingExclusionReason(g) || 'unknown exclusion';
        const bucket = reason.replace(/ \(.+\)$/,'');
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
      }, {});
      const idAudit = getLoadedGenreIdAudit();
      window.dailyGenreIdAudit = idAudit;
      return {
        total,
        idAudit,
        remaining: remainingRows.length,
        unavailable,
        listened: listenedRows.length,
        listenedThisYear,
        listenedBeforeThisYear,
        olderDates: olderDateRows.length,
        olderDatesIgnored: olderDateIgnoredRows.length,
        zangers: zangerRows.length,
        blankStatus: blankStatusRows.length,
        legacyOtherStatus: legacyOtherStatusRows.length,
        statusBuckets,
        exclusionBuckets,
        excludedSamples: excludedRows.slice(0, 40).map(g => ({
          title: g.name || g.genre || g.title || g.id || '(untitled)',
          status: normalizedGenreStatus(g) || '(blank)',
          date: dateValue(g) || '',
          rating: g.rating || '',
          reason: remainingExclusionReason(g) || 'unknown exclusion'
        }))
      };
    }

    function remainingCountMessage(stats) {
      const lines = [
        `${stats.remaining} spin-eligible genres remaining`,
        `${stats.total} actual loaded genre rows`,
        `ID range: ${stats.idAudit?.minId ?? '?'}–${stats.idAudit?.maxId ?? '?'} (${stats.idAudit?.missingIdCount || 0} numeric ID gaps; max ID is not the same as total rows)`,
        `${stats.unavailable} loaded rows not in spinner`,
        `  • ${stats.listened} listened by Daily Genre 2026 logic`,
        `    - ${stats.listenedThisYear} dated in 2026`,
        `    - ${stats.listenedBeforeThisYear} explicitly status=listened with no/older date`,
        `  • ${stats.olderDatesIgnored} older/pre-2026 date-stamped rows ignored as listen history`,
        `  • ${stats.zangers} zangers/vetoed`,
        `  • ${stats.legacyOtherStatus} rows with other status values`,
        `  • ${stats.blankStatus} blank-status rows counted as remaining`,
        '',
        `Exclusion buckets: ${Object.entries(stats.exclusionBuckets || {}).map(([k,v]) => `${k}: ${v}`).join(' · ')}`,
        `Status buckets: ${Object.entries(stats.statusBuckets).map(([k,v]) => `${k}: ${v}`).join(' · ')}`
      ];
      return lines.join('\n');
    }

    function updateRemainingCount() {
      invalidateUnlistenedCache();
      const stats = getRemainingCountDiagnostics();
      remainingCount.textContent = `${stats.remaining} genres remaining`;
      remainingCount.title = remainingCountMessage(stats) + '\n\nClick for excluded samples.';
      console.debug('[Daily Genre] Remaining count diagnostics', stats);
    }

    function showRemainingCountAudit() {
      const stats = getRemainingCountDiagnostics();
      const sampleLines = (stats.excludedSamples || []).map((g, idx) => {
        const bits = [g.reason, g.status ? `status=${g.status}` : '', g.date ? `date=${g.date}` : '', g.rating ? `rating=${g.rating}` : ''].filter(Boolean).join(' · ');
        return `${idx + 1}. ${g.title} — ${bits}`;
      });
      const msg = [
        remainingCountMessage(stats),
        '',
        'Why this may look low:',
        'The spinner can only include actual loaded genre rows. If the max ID is much higher than the total row count, those are ID gaps or missing JSON objects, not hidden spin candidates.',
        `Missing numeric IDs in loaded data (${stats.idAudit?.missingIdCount || 0}): ${(stats.idAudit?.missingIdPreview || []).join(', ') || '(none)'}`,
        '',
        'First excluded loaded-row samples:',
        sampleLines.join('\n') || '(none)'
      ].join('\n');
      alert(msg);
      console.debug('[Daily Genre] Remaining count audit detail', stats);
    }

    function genreEmoji(genre) {
      const c = (genre.categorypath || genre.subcategory || '').toLowerCase();
      if (c.includes('jazz')) return '🎷';
      if (c.includes('rock')) return '🎸';
      if (c.includes('classical')) return '🎹';
      if (c.includes('world')) return '🌍';
      if (c.includes('electronic')) return '🎛️';
      if (c.includes('hip hop')) return '🎤';
      if (c.includes('country')) return '🤠';
      if (c.includes('latin')) return '💃';
      if (c.includes('pop')) return '✨';
      return '🎵';
    }


    function openRandomListenedGenre() {
      const pool = genres.filter(g =>
        (g.status || '').toLowerCase() === 'listened' &&
        !!dateValue(g) &&
        String(g.rating || '').toLowerCase() !== 'zanger'
      );
      if (!pool.length) {
        showSaveToast('No listened genres available for Crate Dig yet.', true);
        return false;
      }
      const genre = pool[Math.floor(Math.random() * pool.length)];
      return openGenreDetail(genre, false, { fromCrateDig: true }) !== false;
    }

    function openCrateDig(event) {
      if (event) event.preventDefault();
      const opened = openRandomListenedGenre();
      if (opened) {
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById('topCrateDigBtn')?.classList.add('active');
        requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      }
    }

    const ACTIVE_ALBUM_DIVE_STORAGE_KEY = 'dailyGenreActiveAlbumDive:v1';

    function albumDiveStateGenreId(genre) {
      return String(genre?.id ?? genre?.genre ?? '');
    }

    function readActiveAlbumDiveState() {
      try {
        return JSON.parse(safeStorageGet(ACTIVE_ALBUM_DIVE_STORAGE_KEY) || 'null') || null;
      } catch {
        return null;
      }
    }

    function albumDiveProgressScore(g) {
      const dive = g && g.albumDive;
      const slots = Array.isArray(dive?.slots) ? dive.slots : [];
      const total = slots.length;
      const finished = slots.filter(slot => slot?.listenState === 'finished' || slot?.listenState === 'completed' || Number(slot?.albumReaction || slot?.reaction || 0) > 0 || slot?.finished || slot?.completed).length;
      const sampledOnly = slots.filter(slot => slot?.listenState === 'sampled').length;
      const started = Math.min(total, finished + sampledOnly);
      return { total, finished, sampled: sampledOnly, started, active: !!(dive && (dive.enabled !== false) && String(dive.status || 'active').toLowerCase() !== 'completed') };
    }

    function findActiveAlbumDiveGenre() {
      const saved = readActiveAlbumDiveState();
      if (saved?.genreId) {
        const fromSaved = getGenreById(saved.genreId)
          || genres.find(g => albumDiveStateGenreId(g) === String(saved.genreId));
        const savedScore = albumDiveProgressScore(fromSaved);
        if (fromSaved && savedScore.total > 0 && savedScore.active) return fromSaved;
      }
      const active = genres
        .filter(g => albumDiveProgressScore(g).total > 0 || !!g.albumDive)
        .filter(g => albumDiveProgressScore(g).active)
        .sort((a,b) => String(b.albumDive?.lastWorkedAt || '').localeCompare(String(a.albumDive?.lastWorkedAt || '')) || String(a.genre || '').localeCompare(String(b.genre || '')));
      return active[0] || null;
    }

    function refreshTopAlbumDiveButton() {
      const btn = document.getElementById('topAlbumDiveBtn');
      if (!btn) return;
      const genre = findActiveAlbumDiveGenre();
      if (!genre) {
        btn.classList.remove('has-active-dive');
        btn.innerHTML = 'Album Dive';
        btn.title = 'Open the current Album Dive';
        return;
      }
      const saved = readActiveAlbumDiveState();
      const label = saved?.albumTitle ? ` · ${saved.albumTitle}` : '';
      btn.classList.add('has-active-dive');
      btn.innerHTML = 'Album Dive';
      btn.title = `Return to active Album Dive: ${genre.genre || 'Genre'}${label}`;
    }
    window.refreshTopAlbumDiveButton = refreshTopAlbumDiveButton;

    function openCurrentAlbumDive(event) {
      if (event) event.preventDefault();
      const activeState = readActiveAlbumDiveState();
      const genre = findActiveAlbumDiveGenre();
      if (!genre) {
        showSaveToast('No active Album Dive yet. Open a genre and start one from its Album Dive panel.', true);
        return false;
      }
      listeningFocusMode = 'albums';
      try {
        safeStorageSet(listeningFocusStorageKey(genre), 'albums');
        if (activeState?.slotKey) safeStorageSet(`dailyGenreAlbumDiveFocusSlot:${albumDiveStateGenreId(genre)}`, activeState.slotKey);
      } catch {}
      openGenreDetail(genre, false, { skipSpotifyHydration: true });
      if (typeof setAlbumDiveEditorMode === 'function') setAlbumDiveEditorMode(false);
      refreshTopAlbumDiveButton();
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById('topAlbumDiveBtn')?.classList.add('active');
      // v178: returning to an active dive should not force-scroll the page; keep the user's current viewport stable.
      return true;
    }
    window.openCurrentAlbumDive = openCurrentAlbumDive;

    function randomGenre() {
      const pool = getUnlistened();
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function buildSpinnerPool() {
      const pool = getUnlistened().slice(0, 28);
      spinnerTrack.innerHTML = pool.map(g => `<div class="genre-chip">${escapeHtml(g.genre || 'Unknown')}</div>`).join('');
    }

    function animateSpinnerToGenre(genre) {
      const names = [];
      for (let i = 0; i < 26; i++) {
        const pick = randomGenre();
        if (pick) names.push(pick.genre || 'Genre');
      }
      names.push(genre.genre || 'Genre');
      for (let i = 0; i < 12; i++) {
        const pick = randomGenre();
        if (pick) names.push(pick.genre || 'Genre');
      }

      spinnerTrack.innerHTML = names.map(name => `<div class="genre-chip">${escapeHtml(name)}</div>`).join('');
      const chips = [...spinnerTrack.children];
      const targetIndex = 26;
      const targetChip = chips[targetIndex];
      const containerWidth = spinnerTrack.parentElement.clientWidth;
      const targetCenter = targetChip.offsetLeft + targetChip.offsetWidth / 2;
      const finalX = -(targetCenter - containerWidth / 2);

      spinnerTrack.animate(
        [
          { transform: 'translateX(0px)' },
          { transform: `translateX(${finalX}px)` }
        ],
        {
          duration: 2850,
          easing: 'cubic-bezier(0.10, 0.78, 0.16, 1)',
          fill: 'forwards'
        }
      );

      setTimeout(() => renderSpinResult(genre), 2880);
    }

    function spinWheel() {
      const genre = randomGenre();
      if (!genre) {
        alert('No unlistened genres remaining.');
        return;
      }
      currentGenre = genre;
      animateSpinnerToGenre(genre);
    }

    function renderSpinResult(genre) {
      spinResult.classList.add('show');
      spinResult.innerHTML = `
        <div class="eyebrow">Today’s pull</div>
        <h2 class="genre-title">${escapeHtml(genre.genre || 'Unknown genre')}</h2>
        <div class="subtle">${escapeHtml(categoryLine(genre))}</div>
        ${genre.vibe ? `<div class="vibe">${genreEmoji(genre)} ${escapeHtml(genre.vibe)}</div>` : ''}
        <p>${genre.summary ? escapeHtml(genre.summary) : '<span class="small">No summary added yet.</span>'}</p>
        <div class="meta-grid">
          <div class="meta-box">
            <h3>Key artists</h3>
            <p>${genre.key_artists ? escapeHtml(genre.key_artists) : 'Not added yet.'}</p>
          </div>
          <div class="meta-box">
            <h3>Suggested songs</h3>
            <p>${genre.suggested_songs ? escapeHtml(genre.suggested_songs) : 'Not added yet.'}</p>
          </div>
        </div>
        <div class="spin-actions" style="justify-content:flex-start; margin-top:20px;">
          <button class="btn btn-secondary" id="respinBtn">Respin / Skip</button>
          <button class="btn btn-danger" id="vetoBtn">Mark as Zanger Today</button>
          <button class="btn btn-primary" id="listenBtn">I’ll Listen to This</button>
        </div>
      `;

      const _respin = spinResult.querySelector('#respinBtn');
      const _veto   = spinResult.querySelector('#vetoBtn');
      const _listen = spinResult.querySelector('#listenBtn');
      if (_respin) _respin.onclick = spinWheel;
      if (_veto) _veto.onclick = () => markAsZangerToday(genre);
      if (_listen) _listen.onclick = () => {
        markGenreInProgressForToday(genre, { fromSpin: true });
        openGenreDetail(genre, true, { preserveScroll: true, skipAutoScroll: true });
      };
    }

    function cleanPastedCitationArtifacts(value='') {
      return String(value || '')
        .replace(/:contentReference\[[^\]]*\]\{[^}]*\}/g, '')
        .replace(/contentReference\[[^\]]*\]\{[^}]*\}/g, '')
        .replace(/:oaicite\[[^\]]*\]\{[^}]*\}/g, '')
        .replace(/oaicite\[[^\]]*\]\{[^}]*\}/g, '')
        .replace(/\[(?:web|file):\s*[^\]]+\]/gi, '')
        .replace(/\s+↗\s*$/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim();
    }

    function parseSongLinks(text) {
      const extractUrl = (value) => {
        const v = String(value || '').trim();
        const md = v.match(/^\s*\[[^\]]*\]\((https?:\/\/[^\s)]+)\)\s*$/i);
        if (md) return md[1].trim();
        const inline = v.match(/https?:\/\/[^\s)]+/i);
        return inline ? inline[0].trim() : '';
      };

      const extractMarkdownLabel = (value) => {
        const md = String(value || '').trim().match(/^\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i);
        return md ? cleanPastedCitationArtifacts(md[1]) : '';
      };

      const stripUrlFromLabel = (value, url) => {
        let label = cleanPastedCitationArtifacts(value || '');
        if (url) label = label.replace(url, '').trim();
        label = label.replace(/^\[[^\]]*\]\(\s*\)$/i, '').trim();
        return label.replace(/^[-–—\s|]+|[-–—\s|]+$/g, '').trim();
      };

      const isPlaceholderUrl = (url) => /^https?:\/\/url\.com\/?$/i.test(String(url || '').trim());
      const isScore = (value) => /^[1-5]$/.test(String(value || '').trim());
      const lineParts = (line) => String(line || '').split('|').map(part => cleanPastedCitationArtifacts(part).trim());
      const prefixInfo = (line) => {
        let clean = String(line || '').trim();
        const flags = { isLevelUp:false, isAdd:false, isPromote:false };
        if (/^(?:🔼\s*)?LEVEL\s*UP\s*:/i.test(clean)) {
          flags.isLevelUp = true;
          clean = clean.replace(/^(?:🔼\s*)?LEVEL\s*UP\s*:\s*/i, '');
        } else if (/^(?:🔼\s*)?ADD\s*:/i.test(clean)) {
          flags.isAdd = true;
          clean = clean.replace(/^(?:🔼\s*)?ADD\s*:\s*/i, '');
        } else if (/^(?:🔼\s*)?PROMOTE\s*:/i.test(clean)) {
          flags.isPromote = true;
          clean = clean.replace(/^(?:🔼\s*)?PROMOTE\s*:\s*/i, '');
        }
        return { clean, ...flags };
      };

      const lines = String(text || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
      const songs = [];

      for (const rawLine of lines) {
        const { clean: line, isLevelUp, isAdd, isPromote } = prefixInfo(rawLine);
        const parts = lineParts(line);
        if (!parts.length) continue;

        const first = parts[0] || '';
        let url = extractUrl(first);
        const markdownLabel = extractMarkdownLabel(first);
        let score = null;
        let reason = '';
        let displayLabel = markdownLabel || stripUrlFromLabel(first, url);

        if (parts.length > 1 && isScore(parts[1])) {
          score = parts[1];
          reason = parts[2] || '';
          displayLabel = parts.slice(3).filter(Boolean).join(' | ') || displayLabel;
        } else if (parts.length > 1) {
          reason = parts[1] || '';
          displayLabel = parts.slice(2).filter(Boolean).join(' | ') || displayLabel;
        }

        if (!url) {
          const anyUrlPart = parts.find(part => extractUrl(part));
          if (anyUrlPart) url = extractUrl(anyUrlPart);
        }

        if (!displayLabel && !url && first && !isScore(first)) displayLabel = first;
        if (isPlaceholderUrl(url)) url = '';

        const extractPendingGenreTag = (value, { strict = false } = {}) => {
          let textValue = String(value || '');
          if (!textValue.trim()) return { text: textValue, tag: '' };
          // v217: legacy @genre routing tags may be typed at the end of the song label
          // itself, e.g. "Missy Elliott — Work It @hip_hop | 3 | reason".
          // Strip only a trailing @tag so legitimate mid-title text is left alone.
          const tagPattern = strict
            ? /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*)(?=\s*$)/
            : /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_'&/-]*)*)(?=\s*$)/;
          const match = textValue.match(tagPattern);
          if (!match) return { text: textValue, tag: '' };
          return {
            text: textValue.slice(0, match.index).trim(),
            tag: String(match[1] || '').replace(/_/g, ' ').trim().toLowerCase()
          };
        };
        const reasonTag = extractPendingGenreTag(reason);
        const labelTag = extractPendingGenreTag(displayLabel, { strict: true });
        const pendingGenreTag = reasonTag.tag || labelTag.tag || '';
        const cleanReason = reasonTag.text.trim();
        displayLabel = labelTag.text.trim();
        const label = normalizeSongArtistAndTitle(displayLabel || '', '');

        const song = {
          url,
          score,
          reason: cleanReason,
          title: label.title,
          artist: label.artist,
          source: songUrlSource(url),
          added: new Date().toISOString().slice(0,10)
        };

        if (pendingGenreTag) song._pendingGenreTag = pendingGenreTag;
        if (isAdd) song.isAdd = true;
        if (isPromote) song.isPromote = true;
        if (isLevelUp) song.isLevelUp = true;

        if (!song.url && !song.title && !song.reason) continue;
        if (!isLevelUp && !isAdd && !isPromote && !song.url && !song.title) continue;

        if (isLevelUp && songs.length > 0) {
          stampLevelUpParent(song, songs[songs.length - 1]);
          songs[songs.length - 1].levelUp = song;
        } else {
          songs.push(song);
        }
      }

      return songs;
    }

    function showSaveToast(message, isError) {
      const el = document.getElementById('saveToast');
      if (!el) return;
      el.textContent = message;
      el.style.borderColor = isError ? 'var(--danger)' : 'var(--border)';
      el.style.color = isError ? 'var(--danger)' : 'var(--accent)';
      el.classList.add('show');
      clearTimeout(window.__saveToastTimer);
      window.__saveToastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    function normalizeSongUrl(url) {
      let value = String(url || '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/^(?:🔼\s*)?LEVEL\s*UP:\s*/i, '')
        .replace(/^(?:🔼\s*)?ADD:\s*/i, '')
        .replace(/^(?:🔼\s*)?PROMOTE:\s*/i, '')
        .trim();

      if (!value) return '';

      // Let pasted Discord/Markdown/notes work in URL fields, e.g.
      // [Track](https://open.spotify.com/track/abc?si=...), <url>, or
      // "Artist — Title https://open.spotify.com/track/abc".
      const markdownHref = value.match(/\]\((https?:\/\/[^\s)]+)\)/i);
      if (markdownHref) value = markdownHref[1];
      value = value.replace(/^<|>$/g, '').trim();

      const spotifyUri = value.match(/spotify:track:([A-Za-z0-9]{22})/i);
      if (spotifyUri) return `https://open.spotify.com/track/${spotifyUri[1]}`;

      const spotifyTrack = value.match(/https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})(?:[?#][^\s]*)?/i);
      if (spotifyTrack) return `https://open.spotify.com/track/${spotifyTrack[1]}`;

      const rawSpotifyId = value.match(/^([A-Za-z0-9]{22})$/);
      if (rawSpotifyId) return `https://open.spotify.com/track/${rawSpotifyId[1]}`;

      const firstUrl = value.match(/https?:\/\/[^\s<>]+/i);
      if (firstUrl) return firstUrl[0].replace(/[),.;]+$/g, '');

      return value;
    }

    function isYoutubeUrl(url) {
      return /(?:youtube\.com|youtu\.be)/i.test(normalizeSongUrl(url || ''));
    }

    function youtubeVideoId(url='') {
      const value = normalizeSongUrl(url);
      if (!value) return '';
      const short = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
      if (short) return short[1];
      const watch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
      if (watch) return watch[1];
      const embed = value.match(/youtube\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/i);
      return embed ? embed[1] : '';
    }

    function isAppleMusicUrl(url='') {
      return /(?:music\.apple\.com|itunes\.apple\.com|geo\.music\.apple\.com)\//i.test(normalizeSongUrl(url || ''));
    }

    function appleMusicTrackId(url='') {
      const value = normalizeSongUrl(url || '');
      const iMatch = value.match(/[?&]i=(\d{6,})/);
      if (iMatch) return iMatch[1];
      const matches = Array.from(value.matchAll(/\/(\d{6,})(?:[/?#]|$)/g)).map((m) => m[1]);
      return matches.length ? matches[matches.length - 1] : '';
    }

    function youTubePlaceholderIcon() {
      return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#f4e4c6"/><rect x="18" y="28" width="60" height="40" rx="10" fill="#c4302b"/><path d="M43 38v20l18-10z" fill="#fff"/></svg>');
    }

    async function fetchYouTubeTrackMetadata(url='') {
      const id = youtubeVideoId(url);
      const fallbackThumb = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : youTubePlaceholderIcon();
      const metadata = { source: 'youtube', url, artwork: fallbackThumb, albumArt: fallbackThumb, title: '', artist: '' };
      try {
        const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          if (data?.title) metadata.title = data.title;
          if (data?.author_name) metadata.artist = data.author_name;
          if (data?.thumbnail_url) {
            metadata.artwork = data.thumbnail_url;
            metadata.albumArt = data.thumbnail_url;
          }
        }
      } catch (_) {}
      return metadata;
    }

    async function fetchAppleMusicTrackMetadata(url='') {
      const id = appleMusicTrackId(url);
      const metadata = { source: 'apple', url, title: '', artist: '', album: '', artwork: '', albumArt: '' };
      if (!id) return metadata;
      try {
        const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`);
        if (response.ok) {
          const data = await response.json();
          const item = Array.isArray(data?.results) ? (data.results.find((r) => r.wrapperType === 'track') || data.results[0]) : null;
          if (item) {
            metadata.title = item.trackName || item.collectionName || '';
            metadata.artist = item.artistName || '';
            metadata.album = item.collectionName || '';
            metadata.artwork = String(item.artworkUrl100 || '').replace(/100x100bb\./, '600x600bb.');
            metadata.albumArt = metadata.artwork;
            metadata.releaseDate = item.releaseDate || '';
            metadata.releaseYear = item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) || null : null;
            metadata.durationMs = Number(item.trackTimeMillis || 0) || null;
            metadata.itunesTrackUrl = item.trackViewUrl || url;
            metadata.itunesTrackId = String(item.trackId || id || '');
          }
        }
      } catch (_) {}
      return metadata;
    }

    async function fetchExternalTrackMetadata(url='') {
      if (isYoutubeUrl(url)) return fetchYouTubeTrackMetadata(url);
      if (isAppleMusicUrl(url)) return fetchAppleMusicTrackMetadata(url);
      return { source: 'web', url };
    }

    function applyExternalTrackMetadata(song, url='', metadata={}, savedTitle='', savedArtist='') {
      if (!song) return;
      const kind = metadata.source || (isYoutubeUrl(url) ? 'youtube' : (isAppleMusicUrl(url) ? 'apple' : 'web'));
      song.url = metadata.url || url;
      song.source = kind;
      song.spotifyId = '';
      song.spotifyUrl = '';
      song.spotifyMetadataFetched = false;
      song.spotifyMetadataFetchedAt = '';
      song.isrc = '';
      if (metadata.title) song.title = metadata.title;
      else song.title = savedTitle || song.title || (kind === 'youtube' ? 'YouTube track' : (kind === 'apple' ? 'Apple Music track' : 'Track'));
      if (metadata.artist) song.artist = metadata.artist;
      else song.artist = savedArtist || song.artist || '';
      song.artists = song.artist ? [song.artist] : [];
      song.album = metadata.album || '';
      song.artwork = metadata.artwork || metadata.albumArt || (kind === 'youtube' ? youTubePlaceholderIcon() : '');
      song.albumArt = metadata.albumArt || metadata.artwork || song.artwork || '';
      song.releaseDate = metadata.releaseDate || '';
      song.releaseYear = metadata.releaseYear || null;
      song.releaseSource = kind === 'apple' ? 'Apple/iTunes' : (kind === 'youtube' ? 'YouTube' : '');
      song.durationMs = metadata.durationMs || null;
      if (metadata.itunesTrackUrl) song.itunesTrackUrl = metadata.itunesTrackUrl;
      if (metadata.itunesTrackId) song.itunesTrackId = metadata.itunesTrackId;
    }

    function songUrlSource(url='') {
      const value = normalizeSongUrl(url);
      if (/spotify\.com\/track\//i.test(value) || /^spotify:track:/i.test(value)) return 'spotify';
      if (isYoutubeUrl(value)) return 'youtube';
      if (isAppleMusicUrl(value)) return 'apple';
      return value ? 'web' : 'manual';
    }

    function sourceBadgeHtml(source='') {
      const key = String(source || '').toLowerCase();
      if (key === 'youtube') return '<span class="song-source-badge youtube">YouTube</span>';
      if (key === 'apple' || key === 'itunes') return '<span class="song-source-badge web">Apple</span>';
      if (key === 'web' || key === 'other') return '<span class="song-source-badge web">Web</span>';
      return '';
    }
    
  function extractTrailingGenreTagFromText(value='', { allowSpaces = false } = {}) {
    const text = String(value || '');
    if (!text.trim()) return { text, tag: '' };
    // v217: support old @genre routing tags typed at the end of a song label/title.
    // Example: "Missy Elliott — Work It @hip_hop" should route by hip hop,
    // not display/save the title as "Work It @hip_hop".
    const tagPattern = allowSpaces
      ? /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_'&/-]*)*)(?=\s*$)/
      : /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*)(?=\s*$)/;
    const match = text.match(tagPattern);
    if (!match) return { text, tag: '' };
    return {
      text: text.slice(0, match.index).trim(),
      tag: String(match[1] || '').replace(/_/g, ' ').trim().toLowerCase()
    };
  }

  function normalizeSongArtistAndTitle(title='', artist='') {
    let normalizedTitle = cleanPastedCitationArtifacts(title);
    let normalizedArtist = cleanPastedCitationArtifacts(artist);
    if (!normalizedArtist) {
      const match = normalizedTitle.match(/^(.+?)\s+[—–]\s+(.+)$/);
      if (match) {
        normalizedArtist = cleanPastedCitationArtifacts(match[1]);
        normalizedTitle = cleanPastedCitationArtifacts(match[2]);
      }
    }
    const titleTag = extractTrailingGenreTagFromText(normalizedTitle);
    normalizedTitle = titleTag.text;
    return { title: normalizedTitle, artist: normalizedArtist, pendingGenreTag: titleTag.tag };
  }

  function normalizeSongsListened(arr) {
    return (arr || []).map(s => {
      const rawUrl = String(s?.url || '');
      const isLevelUp = !!s?.isLevelUp || /^(?:🔼\s*)?LEVEL\s*UP:\s*/i.test(rawUrl);
      const isAdd = !!s?.isAdd || /^(?:🔼\s*)?ADD:\s*/i.test(rawUrl);
      const reaction = [1,2,3].includes(Number(s?.reaction)) ? Number(s.reaction) : null;
      const originFit = [1,2,3,4,5].includes(Number(s?.originFit)) ? Number(s.originFit) : null;
      const nominatedFit = [1,2,3,4,5].includes(Number(s?.nominatedFit)) ? Number(s.nominatedFit) : null;
      const promotedFromFit = [1,2,3,4,5].includes(Number(s?.promotedFromFit)) ? Number(s.promotedFromFit) : null;
      const parsedReleaseYear = Number(s?.releaseYear || String(s?.releaseDate || '').slice(0, 4));
      const releaseYear = Number.isInteger(parsedReleaseYear) && parsedReleaseYear > 1800 && parsedReleaseYear < 2200 ? parsedReleaseYear : null;
      const songLabel = normalizeSongArtistAndTitle(s?.title || '', s?.artist || '');
      const normalized = {
        url: rawUrl,
        score: s?.score ?? null,
        reason: cleanPastedCitationArtifacts(s?.reason || ''),
        title: songLabel.title,
        artist: songLabel.artist,
        artwork: s?.artwork || '',
        source: s?.source || songUrlSource(rawUrl || s?.spotifyUrl || ''),
        added: s?.added || '',
        spotifyId: s?.spotifyId || '',
        spotifyUrl: s?.spotifyUrl || '',
        album: s?.album || '',
        artists: Array.isArray(s?.artists) ? s.artists.filter(Boolean) : [],
        durationMs: Number(s?.durationMs || 0) || null,
        isrc: s?.isrc || '',
        spotifyMetadataFetched: Boolean(s?.spotifyMetadataFetched || s?.spotifyId),
        spotifyMetadataFetchedAt: s?.spotifyMetadataFetchedAt || '',
        eraYear: s?.eraYear || '',
        eraDecade: s?.eraDecade || '',
        releaseDate: s?.releaseDate || '',
        releaseYear,
        releasePrecision: s?.releasePrecision || '',
        releaseSource: s?.releaseSource || '',
        reaction,
        isPending: !!s?.isPending,
        pendingFrom: s?.pendingFrom || '',
        originFit,
        nominatedFit,
        promotedFrom: s?.promotedFrom || '',
        promotedFromFit,
        isLevelUp,
        isAdd,
        isPromote: !!s?.isPromote,
        _pendingGenreTag: s?._pendingGenreTag || songLabel.pendingGenreTag || '',
        __levelUpParentKey: s?.__levelUpParentKey || s?.levelUpParentKey || s?.levelUpForKey || '',
        levelUpParentKey: s?.levelUpParentKey || s?.__levelUpParentKey || s?.levelUpForKey || '',
        levelUpParentTitle: s?.levelUpParentTitle || s?.levelUpForTitle || '',
        levelUpParentArtist: s?.levelUpParentArtist || s?.levelUpForArtist || '',
        levelUpParentUrl: s?.levelUpParentUrl || s?.levelUpForUrl || '',
        levelUp: s?.levelUp ? normalizeSongsListened([s.levelUp])[0] : null,
      };
      if (normalized.levelUp) stampLevelUpParent(normalized.levelUp, normalized);
      return normalized;
    });
  }

    function songUrlLooksPlaceholder(url = '') {
      const value = String(url || '').trim();
      if (!value) return false;
      return /^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i.test(value);
    }

    function songIdentity(song) {
      const isrc = String(song?.isrc || '').trim().toLowerCase();
      if (isrc) return `isrc:${isrc}`;
      const spotifyId = String(song?.spotifyId || '').trim().toLowerCase();
      if (spotifyId) return `spotify:${spotifyId}`;
      const normalizedUrl = normalizeSongUrl(song?.url || song?.spotifyUrl || '').trim().toLowerCase();
      const spotifyTrack = normalizedUrl.match(/spotify\.com\/track\/([a-z0-9]+)/i);
      if (spotifyTrack) return `spotify:${spotifyTrack[1].toLowerCase()}`;
      if (normalizedUrl && !songUrlLooksPlaceholder(normalizedUrl)) return `url:${normalizedUrl}`;
      return `meta:${String(song?.artist || '').trim().toLowerCase()}|${String(song?.title || '').trim().toLowerCase()}`;
    }

    function songIdentityKeys(song) {
      const keys = [];
      const add = key => {
        const clean = String(key || '').trim().toLowerCase();
        if (clean && !keys.includes(clean)) keys.push(clean);
      };
      const canonicalSongTitle = value => String(value || '')
        .toLowerCase()
        .replace(/\s*[\(\[]?(?:\d{4}\s*)?(?:remaster(?:ed)?|mono|stereo|single version|single edit|radio edit|edit|version)[^\)\]]*[\)\]]?\s*$/i, '')
        .replace(/\s*-\s*(?:\d{4}\s*)?(?:remaster(?:ed)?|mono|stereo|single version|single edit|radio edit|edit|version)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      const isrc = String(song?.isrc || '').trim().toLowerCase();
      if (isrc) add(`isrc:${isrc}`);

      const spotifyId = String(song?.spotifyId || '').trim().toLowerCase();
      if (spotifyId) add(`spotify:${spotifyId}`);

      const normalizedUrl = normalizeSongUrl(song?.url || song?.spotifyUrl || '').trim().toLowerCase();
      const spotifyTrack = normalizedUrl.match(/spotify\.com\/track\/([a-z0-9]+)/i);
      if (spotifyTrack) add(`spotify:${spotifyTrack[1].toLowerCase()}`);
      const isPlaceholderUrl = songUrlLooksPlaceholder(normalizedUrl);
      if (normalizedUrl && !isPlaceholderUrl) add(`url:${normalizedUrl}`);
      
      const title = String(song?.title || '').trim().toLowerCase();
      const artist = String(song?.artist || '').trim().toLowerCase();
      if (title || artist) add(`meta:${artist}|${title}`);

      const canonicalTitle = canonicalSongTitle(song?.title || '');
      if (canonicalTitle || artist) add(`canon:${artist}|${canonicalTitle}`);

      return keys.length ? keys : [songIdentity(song)];
    }
    
    function songsIdentityMatch(a, bOrKey) {
      const aKeys = new Set(songIdentityKeys(a));
      if (typeof bOrKey === 'string') return aKeys.has(String(bOrKey || '').trim().toLowerCase());
      return songIdentityKeys(bOrKey).some(key => aKeys.has(key));
    }

    function identityTrackAsSongLike(track = {}) {
      const artist = String(track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : '') || '').trim();
      const title = String(track.title || track.name || '').trim();
      const url = normalizeSongUrl(track.spotifyUrl || track.url || track.spotify_url || '');
      return {
        title,
        name: title,
        artist,
        artists: artist ? [artist] : (Array.isArray(track.artists) ? track.artists.slice() : []),
        url,
        spotifyUrl: url,
        spotifyId: track.spotifyId || '',
        isrc: track.isrc || '',
      };
    }

    function identityEntriesForSongSave(genre) {
      if (!genre) return [];
      const entries = [];
      const id = genre.identity && typeof genre.identity === 'object' ? genre.identity : {};
      const sem = id.seminalTrack || id.seminal_track || genre.seminal_song || genre.seminalTrack || null;
      if (sem && typeof sem === 'object') {
        const song = identityTrackAsSongLike(sem);
        if (song.title || song.artist || song.spotifyUrl || song.spotifyId || song.isrc) {
          entries.push({ type: 'seminal', label: 'Seminal', index: -1, track: sem, song });
        }
      }
      const media = Array.isArray(id.mediaTouchstones) && id.mediaTouchstones.length
        ? id.mediaTouchstones
        : (Array.isArray(genre.media_touchstones) ? genre.media_touchstones : []);
      (Array.isArray(media) ? media : []).forEach((track, index) => {
        if (!track || typeof track !== 'object') return;
        const song = identityTrackAsSongLike(track);
        if (song.title || song.artist || song.spotifyUrl || song.spotifyId || song.isrc) {
          entries.push({ type: 'media', label: 'Media', index, track, song });
        }
      });
      return entries;
    }

    function songMatchesIdentitySaveEntry(song, entry) {
      if (!song || !entry?.song) return false;
      if (songsIdentityMatch(song, entry.song)) return true;
      const clean = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\b(the|a|an|feat|ft)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const songTitle = clean(song.title || song.name || '');
      const entryTitle = clean(entry.song.title || entry.song.name || '');
      const songArtist = clean(song.artist || (Array.isArray(song.artists) ? song.artists.join(' ') : ''));
      const entryArtist = clean(entry.song.artist || (Array.isArray(entry.song.artists) ? entry.song.artists.join(' ') : ''));
      return Boolean(songTitle && entryTitle && songTitle === entryTitle && (!songArtist || !entryArtist || songArtist === entryArtist));
    }

    function filterNewSongsAlreadyRepresentedByGenreIdentity(candidateSongs, previousSongs, genre) {
      const identityEntries = identityEntriesForSongSave(genre);
      if (!identityEntries.length) return { songs: candidateSongs || [], skipped: [] };
      const previous = inflateSongsFromStorage(previousSongs || []).filter(song => song && !song.isPending);
      const skipped = [];
      const filtered = [];
      (candidateSongs || []).forEach(song => {
        const entry = identityEntries.find(identityEntry => songMatchesIdentitySaveEntry(song, identityEntry));
        if (!entry) {
          filtered.push(song);
          return;
        }
        const priorMatches = previous.filter(prior => songsIdentityMatch(prior, song) || songMatchesIdentitySaveEntry(prior, entry));
        const existingIdentityAnchor = priorMatches.some(prior => {
          const src = String(prior?.source || prior?.origin || '').toLowerCase();
          return !!(prior?.isIdentityTrack || prior?.identityType || src === 'genre_identity' || src === 'genre-identity' || src === 'identity');
        });
        // v228: if Genre Identity was loaded first, that track already has a
        // listenable Seminal/Media anchor at its existing position. Do not add a
        // duplicate recommendation row later. If the prior match was just a normal
        // recommendation, keep the pasted row so it can retain/update queue order.
        if (existingIdentityAnchor) {
          skipped.push({ song, entry });
          return;
        }
        if (priorMatches.length) {
          filtered.push(song);
          return;
        }
        filtered.push(song);
      });
      return { songs: filtered, skipped };
    }

    function identitySkipNotice(skipped = []) {
      const count = skipped.length;
      if (!count) return '';
      const names = skipped.slice(0, 3).map(item => {
        const song = item.song || {};
        const name = [song.artist, song.title || song.name].filter(Boolean).join(' — ') || song.url || 'identity track';
        return `${name} (${item.entry?.label || 'Identity'})`;
      }).join('; ');
      return `Skipped ${count} song${count === 1 ? '' : 's'} already represented by Genre Identity: ${names}${count > 3 ? `; +${count - 3} more` : ''}.`;
    }

    function eachSongInLog(arr, callback) {
      (arr || []).forEach(song => {
        callback(song);
        if (song.levelUp) callback(song.levelUp);
      });
    }

    function songUrlIsNonSpotifyLink(song) {
      const url = String(song?.url || song?.spotifyUrl || song?.itunesTrackUrl || '').trim();
      return /^https?:\/\//i.test(url) && !/spotify\.com\/track\//i.test(url);
    }

    function songUrlIsYoutubeLink(song) {
      const url = String(song?.url || song?.spotifyUrl || '').trim();
      return /(?:youtube\.com\/watch|youtu\.be\/|music\.youtube\.com\/watch)/i.test(url);
    }

    function genreHasSongMatching(genre, predicate) {
      let found = false;
      eachSongInLog(inflateSongsFromStorage(genre?.songs_listened || []), song => {
        if (!found && predicate(song)) found = true;
      });
      eachSongInLog(normalizePendingSongs(genre?.pending_songs || []), song => {
        if (!found && predicate(song)) found = true;
      });
      return found;
    }

    function levelUpIssuesForGenre(genre) {
      const raw = normalizeSongsListened(genre?.songs_listened || []);
      const inflated = inflateSongsFromStorage(genre?.songs_listened || []);
      const issues = [];
      if (raw[0]?.isLevelUp) issues.push('First stored row is a Level Up with no parent.');
      for (let i = 1; i < raw.length; i += 1) {
        if (raw[i]?.isLevelUp && raw[i - 1]?.isLevelUp) issues.push(`Consecutive Level Up rows near ${raw[i].artist || ''} — ${raw[i].title || raw[i].url || 'unknown track'}.`);
      }
      inflated.forEach(song => {
        const fit = Number(song?.score);
        if (Number.isFinite(fit) && fit <= 3 && !song.levelUp) {
          const title = [song.artist, song.title].filter(Boolean).join(' — ') || song.url || 'Untitled low-fit song';
          issues.push(`${title} is fit ${fit}/5 and has no Level Up attached.`);
        }
      });
      return [...new Set(issues)].slice(0, 12);
    }

    function genreHasLevelUpIssues(genre) {
      return levelUpIssuesForGenre(genre).length > 0;
    }

    function collectSongReactionSnapshot(arr) {
      const snapshot = [];
      eachSongInLog(inflateSongsFromStorage(arr || []), song => {
        if (song.reaction != null) snapshot.push([songIdentity(song), Number(song.reaction)]);
      });
      return snapshot.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    }

    function mergeSongMetadata(parsedSongs, previousSongs) {
      const stored = new Map();
      eachSongInLog(inflateSongsFromStorage(previousSongs || []), song => {
        songIdentityKeys(song).forEach(key => stored.set(key, song));
      });
      const apply = song => {
        const prior = songIdentityKeys(song).map(key => stored.get(key)).find(Boolean);
        if (prior) {
          if (prior.reaction != null) song.reaction = prior.reaction;
          if (prior.listenerNote) song.listenerNote = prior.listenerNote;
          if (prior.songNote && !song.listenerNote) song.listenerNote = prior.songNote;
          if (prior.promotedFrom) song.promotedFrom = prior.promotedFrom;
          if (prior.promotedFromFit != null) song.promotedFromFit = prior.promotedFromFit;
          // Preserve canonical URL + metadata when Overwrite is being used as a
          // curated list editor. If A/B/C becomes A/C/D, A and C should keep their
          // Spotify/YouTube/Apple URL, artwork, reaction, and fetched metadata; only
          // removed rows should disappear.
          if (!normalizeSongUrl(song.url || '') && prior.url) song.url = prior.url;
          if (prior.spotifyId) song.spotifyId = prior.spotifyId;
          if (prior.spotifyUrl) song.spotifyUrl = prior.spotifyUrl;
          if (prior.artwork) song.artwork = prior.artwork;
          if (prior.albumArt && !song.albumArt) song.albumArt = prior.albumArt;
          if (prior.source) song.source = prior.source;
          if (prior.album) song.album = prior.album;
          if (Array.isArray(prior.artists) && prior.artists.length) song.artists = prior.artists;
          if (prior.durationMs != null) song.durationMs = prior.durationMs;
          if (prior.isrc) song.isrc = prior.isrc;
          if (prior.itunesTrackUrl && !song.itunesTrackUrl) song.itunesTrackUrl = prior.itunesTrackUrl;
          if (prior.itunesTrackId && !song.itunesTrackId) song.itunesTrackId = prior.itunesTrackId;
          if (prior.youtubeVideoId && !song.youtubeVideoId) song.youtubeVideoId = prior.youtubeVideoId;
          if (prior.explicit != null) song.explicit = !!prior.explicit;
          if (prior.popularity != null) song.popularity = Number(prior.popularity);
          if (prior.trackNumber != null) song.trackNumber = Number(prior.trackNumber);
          if (prior.discNumber != null) song.discNumber = Number(prior.discNumber);
          if (prior.albumType) song.albumType = prior.albumType;
          if (prior.albumTotalTracks != null) song.albumTotalTracks = Number(prior.albumTotalTracks);
          if (prior.spotifyMetadataFetched) song.spotifyMetadataFetched = true;
          if (prior.spotifyMetadataFetchedAt) song.spotifyMetadataFetchedAt = prior.spotifyMetadataFetchedAt;
          if (prior.eraYear) song.eraYear = prior.eraYear;
          if (prior.eraDecade) song.eraDecade = prior.eraDecade;
          if (prior.releaseDate) song.releaseDate = prior.releaseDate;
          if (prior.releaseYear != null) song.releaseYear = prior.releaseYear;
          if (prior.releasePrecision) song.releasePrecision = prior.releasePrecision;
          if (prior.releaseSource) song.releaseSource = prior.releaseSource;
        }
        if (song.levelUp) apply(song.levelUp);
        return song;
      };
      return (parsedSongs || []).map(apply);
    }

    function reattachParsedLevelUpRelationships(targetSongs, parsedSongs) {
      const targets = inflateSongsFromStorage(targetSongs || []).filter(song => !song.isPending);
      const parsed = inflateSongsFromStorage(parsedSongs || []).filter(song => !song.isPending);
      const relationships = new Map();
      const targetLookup = new Map();
      const addLookup = song => {
        if (!song) return;
        songIdentityKeys(song).map(meaningfulSongIdentityKey).filter(Boolean).forEach(key => {
          if (!targetLookup.has(key)) targetLookup.set(key, song);
        });
      };
      targets.forEach(song => {
        addLookup(song);
        if (song.levelUp) addLookup(song.levelUp);
      });
      parsed.forEach(parent => {
        if (!parent?.levelUp) return;
        const child = clonePlainObject(parent.levelUp) || { ...parent.levelUp };
        songIdentityKeys(parent).map(meaningfulSongIdentityKey).filter(Boolean).forEach(key => {
          if (key) relationships.set(key, child);
        });
      });
      if (!relationships.size) return targets;
      targets.forEach(parent => {
        const keys = songIdentityKeys(parent).map(meaningfulSongIdentityKey).filter(Boolean);
        const parsedChild = keys.map(key => relationships.get(key)).find(Boolean);
        if (!parsedChild) return;
        const child = clonePlainObject(parsedChild) || { ...parsedChild };
        const existingChild = parent.levelUp || null;
        if (existingChild) mergeSongObjectsInPlace(child, existingChild);
        const duplicateTopLevel = songIdentityKeys(child).map(meaningfulSongIdentityKey).filter(Boolean).map(key => targetLookup.get(key)).find(Boolean);
        if (duplicateTopLevel) mergeSongObjectsInPlace(child, duplicateTopLevel);
        child.isLevelUp = true;
        child.isAdd = false;
        parent.levelUp = normalizeSongsListened([child])[0] || child;
      });
      return targets;
    }

    // Daily Genre v246.2: surgical song-reaction fast path.
    let songReactionFastPathHits = 0;
    let songReactionFallbackRenders = 0;

    function setSongReaction(encodedKey, value) {
      if (!currentGenre) return;
      const key = decodeURIComponent(encodedKey || '');
      const reaction = [1,2,3].includes(Number(value)) ? Number(value) : null;
      const songs = officialSongsForLookup(currentGenre);
      const resultingReactions = new Set();
      let updated = false;

      eachSongInLog(songs, song => {
        if (songIdentity(song) === key) {
          song.reaction = song.reaction === reaction ? null : reaction;
          resultingReactions.add(song.reaction == null ? 'none' : String(song.reaction));
          updated = true;
        }
      });

      if (!updated) return;

      // Daily Genre v247: explicit song reaction timing.
      const reactionPerformanceToken =
        window.__dailyGenrePerformanceTracker?.start?.(
          'app.songReaction',
          {
            genreId: currentGenre.id ?? null,
            matches: resultingReactions.size,
          },
        ) || null;

      stagedQueueReactionKeys.add(stagedReactionKey(currentGenre.id, key));
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);

      const nextReactionValue =
        resultingReactions.size === 1
          ? [...resultingReactions][0]
          : null;
      const nextReaction =
        nextReactionValue && nextReactionValue !== 'none'
          ? Number(nextReactionValue)
          : null;

      let repaintResult = null;
      try {
        if (resultingReactions.size === 1) {
          if (typeof window.refreshSongReactionUI === 'function') {
            repaintResult = window.refreshSongReactionUI(
              encodedKey,
              nextReaction,
            );
          } else {
            repaintResult =
              window.DailyGenreSongReaction?.repaint?.(
                document,
                encodedKey,
                nextReaction,
              ) || null;
          }
        }
      } catch (error) {
        console.warn(
          '[Daily Genre] Song reaction fast repaint failed; using full render.',
          error,
        );
      }

      if (repaintResult?.repainted) {
        songReactionFastPathHits += 1;
      } else {
        songReactionFallbackRenders += 1;
        const restore = preserveScrollSnapshot();
        loadListenScreen(currentGenre, {
          preserveDirty: true,
          skipSpotifyHydration: true,
        });
        applyDetailEditMode(detailEditMode);
        restore();
      }

      showSaveToast(
        'Reaction selected — use the floating Save button to persist it.',
        false,
      );

      if (reactionPerformanceToken) {
        window.__dailyGenrePerformanceTracker?.end?.(
          reactionPerformanceToken,
          {
            fastPath: Boolean(repaintResult?.repainted),
            fallbackRender: !repaintResult?.repainted,
            matchedControls: Number(repaintResult?.matchedControls || 0),
            structuralRefresh: Boolean(repaintResult?.structuralRefresh),
          },
        );
      }
    }

    const GENRE_RATING_LABELS = {
      '5': 'Inject This Into My Veins',
      '4': 'Hell Yeah, Run It Back',
      '3': 'Glad I Heard It',
      '2': 'Respectfully, Nah',
      '1': 'Get This Off My Turntable',
      'zanger': 'Zanger'
    };

    function genreRatingLabel(value) {
      return GENRE_RATING_LABELS[String(value || '')] || 'Unrated';
    }

    function refreshGenreRatingVisuals(value) {
      const active = String(value || '');
      const activeNumber = /^\d+$/.test(active) ? Number(active) : 0;
      const activeLabel = genreRatingLabel(active);
      document.querySelectorAll('.view-rating-star, .genre-header-star, .star-btn').forEach(btn => {
        const rating = String(btn.dataset?.rating || btn.getAttribute('data-rating') || (btn.getAttribute('onclick') || '').match(/setGenreRatingFromView\((\d+)\)/)?.[1] || '');
        const on = rating && (btn.classList.contains('genre-header-star') ? activeNumber >= Number(rating) : active === rating);
        btn.classList.toggle('active', !!on);
        btn.classList.toggle('is-active', !!on);
        btn.dataset.active = on ? 'true' : 'false';
        if (btn.classList.contains('genre-header-star') && rating) btn.textContent = on ? '★' : '☆';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      document.querySelectorAll('.view-rating-zanger, .genre-header-zanger').forEach(btn => {
        const isZ = active === 'zanger' && /zanger|Mark genre as Zanger|setGenreRatingFromView\('zanger'\)/i.test(`${btn.textContent || ''} ${btn.title || ''} ${btn.getAttribute('onclick') || ''}`);
        btn.classList.toggle('active', isZ);
        btn.classList.toggle('is-active', isZ);
        btn.dataset.active = isZ ? 'true' : 'false';
        btn.setAttribute('aria-pressed', isZ ? 'true' : 'false');
      });
      document.querySelectorAll('.genre-header-rating-label').forEach(el => { el.textContent = activeLabel; });
      const status = document.getElementById('ratingStatus');
      if (status) status.textContent = active === 'zanger' ? 'Marked as Zanger' : (active ? `${active} star${active === '1' ? '' : 's'} selected` : 'No rating selected');
      document.querySelectorAll('.view-rating-panel, .detail-record-card, .setup-editor, .rating-panel').forEach(el => {
        el.dataset.genreRating = active;
        el.classList.toggle('rating-dirty-repaint', true);
      });
      // v208: force a synchronous style flush so Firefox paints star changes immediately.
      // Earlier builds updated state correctly, but the heavy genre-page DOM sometimes did
      // not repaint until a second interaction such as a song reaction occurred.
      try { document.body.offsetHeight; } catch (_) {}
      requestAnimationFrame(() => {
        document.querySelectorAll('.rating-dirty-repaint').forEach(el => el.classList.remove('rating-dirty-repaint'));
      });
    }

    function repaintGenreRatingAfterInput(value) {
      refreshGenreRatingVisuals(value);
      setTimeout(() => refreshGenreRatingVisuals(value), 0);
      requestAnimationFrame(() => refreshGenreRatingVisuals(value));
      setTimeout(() => refreshGenreRatingVisuals(value), 80);
    }

    function genreRatingStarsOnly(genre) {
      if (!genre || !genre.rating) return 'Unrated';
      if (String(genre.rating) === 'zanger') return 'Z Zanger';
      const n = Number(genre.rating);
      if (!Number.isFinite(n) || n < 1 || n > 5) return 'Unrated';
      return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
    }

    function isSameFavoriteSong(genre, song) {
      const favUrl = normalizeSongUrl(genre?.favoritesongurl || '');
      const songUrl = normalizeSongUrl(song?.url || song?.spotifyUrl || '');
      if (favUrl || songUrl) return !!favUrl && !!songUrl && favUrl === songUrl;

      const favTitle = cleanPastedCitationArtifacts(genre?.favoritesong || '').toLowerCase();
      const favArtist = cleanPastedCitationArtifacts(genre?.favoriteartist || '').toLowerCase();
      const songTitle = cleanPastedCitationArtifacts(song?.title || '').toLowerCase();
      const songArtist = cleanPastedCitationArtifacts(song?.artist || '').toLowerCase();
      return !!favTitle && !!songTitle && favTitle === songTitle && (!favArtist || !songArtist || favArtist === songArtist);
    }

    function renderGenreRatingPanel(genre) {
      if (!genre) return '';
      const active = String(genre.rating || '');
      const inProgress = ['in_progress','in-progress'].includes(String(genre.status || '').toLowerCase()) && !active;
      return `<div class="view-rating-panel">
        <div class="view-rating-head">
          <div><div class="eyebrow" style="margin:0;">Genre Rating</div><div class="small">Listening action — available outside Setup Editor.</div></div>
          ${libraryUpdatesPending ? '<span class="inline-listening-save-hint">● Unsaved</span>' : ''}
        </div>
        <div class="view-rating-stars" aria-label="Genre rating controls">
          <button type="button" class="view-rating-zanger view-rating-progress ${inProgress ? 'active' : ''}" onclick="setGenreInProgressFromView()" title="Mark in progress for today" aria-label="Mark in progress for today">⏳</button>
          ${[1,2,3,4,5].map(n => `<button type="button" class="view-rating-star ${active === String(n) ? 'active' : ''}" onclick="setGenreRatingFromView(${n})" title="${escapeHtml(genreRatingLabel(n))}" aria-label="${n} stars, ${escapeHtml(genreRatingLabel(n))}">★</button>`).join('')}
          <button type="button" class="view-rating-zanger ${active === 'zanger' ? 'active' : ''}" onclick="setGenreRatingFromView('zanger')" title="Zanger">Zanger</button>
        </div>
      </div>`;
    }

    function renderListeningActionsPanel(genre) {
      if (!genre) return '';
      const contender = !!genre.monthlycontender;
      const favorite = !!genre.monthfavorite;
      const least = !!genre.monthleastfavorite;
      const genreId = encodeURIComponent(String(genre.id || ''));
      return `<div class="view-rating-panel listening-actions-panel">
        <div class="view-rating-head">
          <div><div class="eyebrow" style="margin:0;">Listening Actions</div><div class="small">Use these while/after listening. Setup Editor is only for curation text, song uploads, and song descriptions.</div></div>
          ${libraryUpdatesPending ? '<span class="inline-listening-save-hint">● Unsaved</span>' : ''}
        </div>
        <div class="view-rating-stars" aria-label="Listening action controls">
          <button type="button" class="view-rating-zanger ${contender ? 'active' : ''}" onclick="setMonthlyFlagFromView('contender')" title="Toggle monthly contender">📌 Monthly contender</button>
          <button type="button" class="view-rating-star ${favorite ? 'active' : ''}" onclick="setMonthlyFlagFromView('favorite')" title="Toggle month favorite" aria-label="Toggle month favorite">★</button>
          <button type="button" class="view-rating-zanger ${least ? 'active' : ''}" onclick="setMonthlyFlagFromView('least')" title="Toggle month least favorite">Least favorite</button>
          ${(contender || favorite || least) ? '<button type="button" class="btn btn-secondary btn-tiny" onclick="clearMonthlyFlagsFromView()">Clear month flags</button>' : ''}
          <button type="button" class="spotify-queue-btn" onclick="openSpotifyPlaylistModal('${genreId}')">＋ Playlist</button>
        </div>
      </div>`;
    }

    function markListeningUpdatePending() {
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
    }
    window.markListeningUpdatePending = markListeningUpdatePending;

    /* Daily Genre v214: shared save-pipeline bridge for Studio/Album scripts.
       Setting window.libraryUpdatesPending from another file only changes a
       window property; it does not touch this module's lexical
       libraryUpdatesPending flag that saveLibraryUpdates() checks. Route all
       Studio cleanup mutations through this bridge so Album repair and
       duplicate cleanup actually persist in the normal library save payload. */
    window.markLibraryUpdatesPending = function(message, options = {}) {
      if (options && options.studioMutation) window.__dgStudioCleanupSavePending = true;
      markListeningUpdatePending();
      if (message && typeof showSaveToast === 'function') showSaveToast(message, false);
      if (options && options.openPasswordPrompt && !appPassword && typeof openPasswordModal === 'function') {
        setTimeout(() => openPasswordModal('library_save'), 0);
      }
      return true;
    };

    async function applySongsBulkAndSave(button = null, options = {}) {
      if (!currentGenre) {
        showSaveToast('Open a genre before applying songs.', true);
        return;
      }
      const overwriteSongs = !!options.overwriteSongs;
      const previousFocusKey = (() => {
        try {
          return currentGenre
            ? (safeStorageGet(`dailyGenreSongFocusKey:${currentGenre.id || currentGenre.genre || 'unknown'}`) || '')
            : '';
        } catch (_) {
          return '';
        }
      })();
      const oldText = button?.textContent || '';
      if (button) {
        button.disabled = true;
        button.classList.add('is-saving');
        button.textContent = overwriteSongs ? 'Overwriting…' : 'Applying…';
      }
      try {
        await prepareAndSaveCurrentGenre({ overwriteSongs });
        if (previousFocusKey) {
          try {
            if (currentGenre) {
              safeStorageSet(`dailyGenreSongFocusKey:${currentGenre.id || currentGenre.genre || 'unknown'}`, previousFocusKey);
            }
            if (typeof setSongFocus === 'function') {
              setTimeout(() => setSongFocus(previousFocusKey), 0);
            } else if (typeof window.enhanceSongListeningExperience === 'function') {
              setTimeout(() => window.enhanceSongListeningExperience(), 0);
            }
          } catch (_) {}
        }
      } finally {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.classList.remove('is-saving');
          button.textContent = oldText || (overwriteSongs ? 'Overwrite & Save Songs' : 'Apply & Save Songs');
        }
      }
    }
    window.applySongsBulkAndSave = applySongsBulkAndSave;
    window.overwriteSongsBulkAndSave = (button = null) => applySongsBulkAndSave(button, { overwriteSongs: true });

    function setMonthlyFlagFromView(flag) {
      if (!currentGenre) return;
      if (!['contender', 'favorite', 'least'].includes(flag)) return;
      setListenDateTodayIfNeeded(currentGenre);
      if (flag === 'contender') {
        currentGenre.monthlycontender = !currentGenre.monthlycontender;
      } else if (flag === 'favorite') {
        const next = !currentGenre.monthfavorite;
        currentGenre.monthfavorite = next;
        if (next) currentGenre.monthleastfavorite = false;
      } else if (flag === 'least') {
        const next = !currentGenre.monthleastfavorite;
        currentGenre.monthleastfavorite = next;
        if (next) currentGenre.monthfavorite = false;
      }
      enforceMonthlyExclusiveFlags(currentGenre);
      markListeningUpdatePending();
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
      showSaveToast('Monthly listening flag updated — use the floating Save button to persist it.', false);
    }

    function clearMonthlyFlagsFromView() {
      if (!currentGenre) return;
      currentGenre.monthlycontender = false;
      currentGenre.monthfavorite = false;
      currentGenre.monthleastfavorite = false;
      markListeningUpdatePending();
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
      showSaveToast('Monthly flags cleared — use the floating Save button to persist it.', false);
    }

    function enforceMonthlyExclusiveFlags(genre) {
      if (!genre) return;
      const monthKey = (dateValue(genre) || '').slice(0, 7);
      if (!monthKey) return;
      if (genre.monthfavorite) {
        genres.forEach(g => {
          if (!g || g.id === genre.id) return;
          if ((dateValue(g) || '').slice(0, 7) === monthKey) g.monthfavorite = false;
        });
      }
      if (genre.monthleastfavorite) {
        genres.forEach(g => {
          if (!g || g.id === genre.id) return;
          if ((dateValue(g) || '').slice(0, 7) === monthKey) g.monthleastfavorite = false;
        });
      }
    }

    function setGenreInProgressFromView() {
      if (!currentGenre) return;
      setListenDateTodayIfNeeded(currentGenre);
      currentGenre.status = 'in_progress';
      currentGenre.rating = '';
      currentGenre.rank_order = null;
      selectedRating = '';
      markListeningUpdatePending();
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
      showSaveToast('Moved back to in progress — use the floating Save button to persist it.', false);
      if (!appPassword) promptLibrarySaveLogin();
    }
    window.setGenreInProgressFromView = setGenreInProgressFromView;

    function setGenreRatingFromView(value) {
      if (!currentGenre) return;
      if (String(value) === 'zanger') {
        setListenDateTodayIfNeeded(currentGenre);
        currentGenre.rating = 'zanger';
        currentGenre.status = 'veto';
        currentGenre.rank_order = null;
      } else {
        const rating = Number(value);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
        setListenDateTodayIfNeeded(currentGenre);
        currentGenre.rating = String(rating);
        currentGenre.status = 'listened';
        selectedRating = String(rating);
        if (currentGenre.rank_order == null) {
          const sameTier = (Array.isArray(genres) ? genres : [])
            .filter((genre) =>
              genre &&
              genre !== currentGenre &&
              String(genre.rating || '') === String(currentGenre.rating || '') &&
              Number.isFinite(Number(genre.rank_order))
            )
            .map((genre) => Number(genre.rank_order));
          currentGenre.rank_order = sameTier.length
            ? Math.max(...sameTier) + 1
            : 1;
        }
        if (typeof ensureRankOrderForRating === 'function') {
          ensureRankOrderForRating(currentGenre);
        }
      }
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
      // v208: rating clicks are intentionally local UI updates. Rebuilding the full
      // genre page here can block Firefox's repaint until another control is clicked.
      // The save flow persists currentGenre.rating; full renders happen when changing pages.
      repaintGenreRatingAfterInput(currentGenre.rating);
      showSaveToast(appPassword ? 'Genre rating updated — use the floating Save button to persist it.' : 'Genre rating updated — enter the save password to persist it.', false);
      // v209: let the browser paint the selected stars before opening the save-password modal.
      if (!appPassword) requestAnimationFrame(() => promptLibrarySaveLogin());
    }
    window.setGenreRatingFromView = setGenreRatingFromView;

    /* Daily Genre v209: genre star clicks must be immediate first interactions.
       Firefox occasionally delayed painting inline onclick-driven star state until a later
       song/reaction control fired. Capture the star click, repaint synchronously, then run
       the normal rating/save-password flow once. */
    function genreRatingValueFromControl(btn) {
      if (!btn) return null;
      if (btn.classList?.contains('view-rating-progress')) return null;
      if (btn.classList?.contains('genre-header-zanger')) return 'zanger';
      if (btn.classList?.contains('view-rating-zanger')) {
        const text = `${btn.textContent || ''} ${btn.title || ''} ${btn.getAttribute('onclick') || ''}`;
        return /zanger/i.test(text) ? 'zanger' : null;
      }
      if (btn.classList?.contains('genre-header-star') || btn.classList?.contains('view-rating-star')) {
        const raw = btn.dataset?.rating || btn.getAttribute('data-rating') || (btn.getAttribute('onclick') || '').match(/setGenreRatingFromView\((\d+)\)/)?.[1] || '';
        const n = Number(raw);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? String(n) : null;
      }
      return null;
    }

    function genreRatingControlFromEvent(event) {
      const btn = event.target?.closest?.('.genre-header-star, .genre-header-zanger, .view-rating-panel:not(.listening-actions-panel) .view-rating-star, .view-rating-panel:not(.listening-actions-panel) .view-rating-zanger');
      if (!btn || btn.disabled) return null;
      if (btn.closest?.('.listening-actions-panel')) return null;
      const value = genreRatingValueFromControl(btn);
      return value == null ? null : { btn, value };
    }

    document.addEventListener('pointerdown', (event) => {
      const hit = genreRatingControlFromEvent(event);
      if (!hit || !currentGenre) return;
      refreshGenreRatingVisuals(hit.value);
    }, true);

    document.addEventListener('click', (event) => {
      const hit = genreRatingControlFromEvent(event);
      if (!hit || !currentGenre) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      refreshGenreRatingVisuals(hit.value);
      setGenreRatingFromView(hit.value);
    }, true);

    function makeSongFavorite(encodedKey) {
      if (!currentGenre) return;
      const key = decodeURIComponent(encodedKey || '');
      let selected = null;
      const songs = inflateSongsFromStorage(currentGenre.songs_listened || []);
      eachSongInLog(songs, song => {
        if (!selected && songIdentity(song) === key) selected = song;
      });
      if (!selected) {
        showSaveToast('Could not find that song to mark favorite.', true);
        return;
      }

      const wasFavorite = isSameFavoriteSong(currentGenre, selected);
      if (wasFavorite) {
        currentGenre.favoritesong = '';
        currentGenre.favoriteartist = '';
        currentGenre.favoritesongurl = '';
        currentGenre.favoritesongartwork = '';
      } else {
        currentGenre.favoritesong = cleanPastedCitationArtifacts(selected.title || '');
        currentGenre.favoriteartist = cleanPastedCitationArtifacts(selected.artist || '');
        currentGenre.favoritesongurl = normalizeSongUrl(selected.url || selected.spotifyUrl || '');
        currentGenre.favoritesongartwork = selected.artwork || '';
      }

      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      showSaveToast(wasFavorite ? 'Favorite track cleared — use the floating Save button to persist it.' : 'Favorite track updated — use the floating Save button to persist it.', false);
    }

    function genreRatingHeroMarkup(genre) {
      const active = String(genre?.rating || '');
      const label = active ? genreRatingLabel(active) : 'Unrated';
      const activeNumber = /^\d+$/.test(active) ? Number(active) : 0;
      const starButtons = [1, 2, 3, 4, 5].map(n => {
        const isActive = activeNumber >= n;
        return `<button type="button" class="genre-header-star ${isActive ? 'active' : ''}" onclick="event.stopPropagation(); setGenreRatingFromView(${n})" title="${escapeHtml(genreRatingLabel(n))}" aria-label="Set genre rating to ${n} stars, ${escapeHtml(genreRatingLabel(n))}">${isActive ? '★' : '☆'}</button>`;
      }).join('');
      const zangerActive = active === 'zanger';
      return `<span class="genre-header-rating" role="group" aria-label="Genre rating: ${escapeHtml(label)}">
        <span class="genre-header-rating-label">${escapeHtml(label)}</span>
        <span class="genre-header-stars">${starButtons}</span>
        <button type="button" class="genre-header-zanger ${zangerActive ? 'active' : ''}" onclick="event.stopPropagation(); setGenreRatingFromView('zanger')" title="Zanger" aria-label="Mark genre as Zanger">Z</button>
      </span>`;
    }

    function genreRatingDisplay(genre) {
      if (!genre || !genre.rating) return 'Unrated';
      if (String(genre.rating) === 'zanger') return 'Z Zanger';
      const n = Number(genre.rating);
      return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} ${genreRatingLabel(genre.rating)}`;
    }

    function reactionEmoji(value) {
      return Number(value) === 3 ? '👍' : Number(value) === 2 ? '🤷' : Number(value) === 1 ? '👎' : '—';
    }

    function reactionLabel(value) {
      return Number(value) === 3 ? 'I Fuck With This' : Number(value) === 2 ? 'Meh, It’s Fine' : Number(value) === 1 ? 'Fuck Off' : 'Unrated';
    }

    function genreReactionSongs(genre) {
      const result = [];
      inflateSongsFromStorage(genre?.songs_listened || []).filter(song => !song.isPending).forEach(song => {
        result.push(song);
        if (song.levelUp) result.push(song.levelUp);
      });
      return result;
    }

    function genreReactionCounts(genre) {
      const counts = { 3:0, 2:0, 1:0, unrated:0 };
      genreReactionSongs(genre).forEach(song => {
        const value = Number(song.reaction || 0);
        if ([1,2,3].includes(value)) counts[value] += 1;
        else counts.unrated += 1;
      });
      return counts;
    }

    function renderGenreReactionSummary(genre) {
      const counts = genreReactionCounts(genre);
      const total = counts[1] + counts[2] + counts[3] + counts.unrated;
      if (!total) return '';
      return `<div class="track-reaction-summary">
        <div class="track-reaction-summary-head">
          <div class="eyebrow" style="margin:0;">Track Reactions</div>
          ${libraryUpdatesPending ? '<span class="inline-listening-save-hint">● Unsaved</span>' : ''}
        </div>
        <div class="track-reaction-counts">
          <div class="track-reaction-counter"><span class="emoji">👍</span><strong>${counts[3]}</strong><small>I Fuck With This</small></div>
          <div class="track-reaction-counter"><span class="emoji">🤷</span><strong>${counts[2]}</strong><small>Meh, It’s Fine</small></div>
          <div class="track-reaction-counter"><span class="emoji">👎</span><strong>${counts[1]}</strong><small>Fuck Off</small></div>
          <div class="track-reaction-counter"><span class="emoji">—</span><strong>${counts.unrated}</strong><small>Unrated</small></div>
        </div>
        <div class="genre-share-actions">
          <button type="button" class="btn btn-secondary btn-tiny" onclick="copyGenreReactionRecap(true)">Copy Track Reactions</button>
        </div>
        <div class="small" style="margin-top:8px;">Reaction recaps are separate from the genre summary / description post.</div>
      </div>`;
    }

    function reactionRecapBetterFit(song) {
      const direct = [
        song?.preferredGenre,
        song?.preferred_genre,
        song?.betterFitGenre,
        song?.better_fit_genre,
        song?.betterFit,
        song?.better_fit,
        song?.targetGenre,
        song?.target_genre,
        song?.routedTo,
        song?.routed_to,
        song?.pendingRoutedTo,
        song?.pending_routed_to,
        song?.suggestedGenre,
        song?.suggested_genre,
        song?._pendingGenreTag,
        song?.pendingGenre,
        song?.pending_genre,
      ]
        .map(value => String(value || '').trim().replace(/^@+/, ''))
        .find(Boolean);

      if (direct) return direct;

      const text = [
        song?.reason,
        song?.notes,
        song?.routingNote,
        song?.routing_note,
      ].filter(Boolean).join(' ');

      const tagged = text.match(/(?:better\s+fit(?:\s+for)?|preferred\s+genre|belongs\s+in|route(?:d)?\s+to)\s*[:\-–—>]*\s*@?([^.;,\n]+)/i);
      if (tagged?.[1]) return String(tagged[1]).trim().replace(/^@+/, '');

      const atTag = text.match(/@([a-z0-9][a-z0-9 _&+/'-]{1,60})/i);
      return atTag?.[1] ? String(atTag[1]).trim() : '';
    }

    function reactionRecapIsFavorite(song, genre=currentGenre) {
      if (!song) return false;
      if (song.favorite || song.isFavorite || song.is_favorite || song.trophy) return true;

      const favoriteTitle = String(
        genre?.favorite_song ||
        genre?.favoritesong ||
        genre?.favoriteSong ||
        ''
      ).trim().toLowerCase();

      const favoriteUrl = String(
        genre?.favorite_song_url ||
        genre?.favoritesongurl ||
        genre?.favoriteSongUrl ||
        ''
      ).trim();

      const title = String(song.title || song.name || '').trim().toLowerCase();
      const url = String(song.spotifyUrl || song.url || '').trim();

      return Boolean(
        (favoriteTitle && title && favoriteTitle === title) ||
        (favoriteUrl && url && favoriteUrl === url)
      );
    }

    function reactionRecapTrackLine(song, options={}) {
      const title = String(song?.title || song?.name || 'Untitled track').trim();
      const artist = String(
        song?.artist ||
        (Array.isArray(song?.artists) ? song.artists.join(', ') : '')
      ).trim();
      const favorite = reactionRecapIsFavorite(song) ? '🏆 ' : '';

      if (options.nonFit) {
        const betterFit = reactionRecapBetterFit(song);
        return `• ${title}${betterFit ? ` -> Better fit: *${betterFit}*` : ''}`;
      }

      return `• ${favorite}${artist ? `${artist} - ` : ''}${title}`;
    }

    function buildGenreReactionRecap(includeTracks=false) {
      if (!currentGenre) return '';

      const genreName = String(currentGenre.genre || 'Unknown genre').trim();
      const rating = String(currentGenre.rating || '').trim();
      const ratingText = rating
        ? `**${genreName}** gets a ${rating}`
        : `**${genreName}**`;

      const songs = genreReactionSongs(currentGenre);
      const nonFit = songs.filter(song => {
        const fit = Number(song?.score);
        return Number.isFinite(fit) && fit > 0 && fit <= 2;
      });
      const nonFitSet = new Set(nonFit);
      const regular = songs.filter(song => !nonFitSet.has(song));
      const sections = [];

      [
        { value: 3, label: 'I Fuck With This' },
        { value: 2, label: 'Meh, It’s Fine' },
        { value: 1, label: 'Fuck Off' },
      ].forEach(({ value, label }) => {
        const group = regular.filter(song => Number(song?.reaction) === value);
        if (!group.length) return;
        sections.push(
          `**${label}**\n` +
          group.map(song => reactionRecapTrackLine(song)).join('\n')
        );
      });

      const unrated = regular.filter(song => ![1, 2, 3].includes(Number(song?.reaction)));
      if (unrated.length) {
        sections.push(
          `**Unrated**\n` +
          unrated.map(song => reactionRecapTrackLine(song)).join('\n')
        );
      }

      if (nonFit.length) {
        sections.push(
          `Not a good fit for this genre\n` +
          nonFit.map(song => reactionRecapTrackLine(song, { nonFit: true })).join('\n')
        );
      }

      return [ratingText, ...sections].filter(Boolean).join('\n\n');
    }

    async function copyGenreReactionRecap(includeTracks=false) {
      const text = buildGenreReactionRecap(true);
      if (!text) return;
      await navigator.clipboard.writeText(text);
      showSaveToast('Track reactions copied.', false);
    }


    function buildSongsBulkEditorText(genre) {
      const displaySongLabel = song => {
        const title = String(song?.title || '').trim();
        const artist = String(song?.artist || '').trim();
        return artist && title ? `${artist} — ${title}` : (title || null);
      };
      return inflateSongsFromStorage(genre?.songs_listened || []).filter(song => !song.isPending).flatMap(song => {
        const prefix = song.isPromote ? '🔼 PROMOTE: ' : (song.isAdd ? '🔼 ADD: ' : '');
        const reason = song._pendingGenreTag ? `${song.reason || ''} @${song._pendingGenreTag}`.trim() : (song.reason || null);
        const lines = [
          prefix + [normalizeSongUrl(song.url), song.score != null ? song.score : null, reason, displaySongLabel(song)]
            .filter(value => value !== null && value !== '')
            .join(' | ')
        ];
        if (song.levelUp) {
          lines.push('🔼 LEVEL UP: ' + [
            normalizeSongUrl(song.levelUp.url),
            song.levelUp.score != null ? song.levelUp.score : null,
            song.levelUp.reason || null,
            displaySongLabel(song.levelUp)
          ].filter(value => value !== null && value !== '').join(' | '));
        }
        return lines;
      }).join('\n');
    }
    
    function queueModelIsAuthoritative() {
      return !!window.__dailyGenreQueueModelAuthoritativeUntil && Date.now() < Number(window.__dailyGenreQueueModelAuthoritativeUntil || 0);
    }

    function syncBulkDraftIntoSongModel(options = {}) {
      if (!currentGenre) return;
      const textarea = document.getElementById('songsListenedBulk');
      if (!textarea) return;
      const expected = buildSongsBulkEditorText(currentGenre);
      if (textarea.value === expected) return;

      // v85: the songs bulk editor and Genre Identity editor share the same side panel.
      // Applying/saving songs must never blank existing identity aliases, anchors, or
      // Seminal/Media queue rows just because the song textarea does not include them.
      const identitySnapshot = snapshotGenreIdentityData(currentGenre);

      // Inline queue actions (URL overwrite, Spotify refresh, remove/move) update
      // currentGenre.songs_listened directly, then repaint the hidden bulk textarea.
      // During that short authoritative window, do not let an older textarea snapshot
      // overwrite the live model on save. This was causing multi-row URL edits to
      // persist only the most recent row, or to wipe a prior corrected URL.
      if (!options.force && queueModelIsAuthoritative()) {
        textarea.value = expected;
        restoreGenreIdentityData(currentGenre, identitySnapshot);
        return;
      }

      const previous = inflateSongsFromStorage(currentGenre.songs_listened || []).filter(song => !song.isPending);
      const parsedDraft = parseSongLinks(textarea.value);
      const merged = reattachParsedLevelUpRelationships(mergeSongMetadata(parsedDraft, previous), parsedDraft);
      const seenKeys = new Set();
      currentGenre.songs_listened = merged.filter(song => {
        const k = songIdentity(song);
        if (!k || seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });
      restoreGenreIdentityData(currentGenre, identitySnapshot);
      syncBulkDraftEditorFromPreservedModel();
    }

    function syncBulkDraftEditorFromPreservedModel() {
      const textarea = document.getElementById('songsListenedBulk');
      if (!textarea || !currentGenre) return;
      try {
        textarea.value = buildSongsBulkEditorText(currentGenre);
      } catch (_) {}
    }

    function syncSongsBulkEditorFromModel() {
      const textarea = document.getElementById('songsListenedBulk');
      if (!textarea || !currentGenre) return;
      textarea.value = buildSongsBulkEditorText(currentGenre);
      window.__dailyGenreSuppressBulkSongSyncUntil = Date.now() + 60000;
      window.__dailyGenreQueueModelAuthoritativeUntil = Date.now() + 60000;
    }

    // Daily Genre v246: cache inflated official songs per genre and use a
    // self-healing identity index for parent and nested Level Up lookups.
    // Track arrays produced by inflateSongsFromStorage, including arrays created
    // by existing unsaved reaction/edit handlers outside officialSongsForLookup.
    const knownInflatedOfficialSongArrays = new WeakSet();

    const officialSongIdentityIndex =
      window.DailyGenreSongIndex?.createPerGenreSongIdentityIndex?.({
        keysForSong: songIdentityKeys,
        childForSong: song => song?.levelUp || null,
      }) || null;

    const inflatedOfficialSongsByGenre = new WeakMap();

    function officialSongsForLookup(genre = currentGenre) {
      if (!genre) return [];

      const source = Array.isArray(genre.songs_listened)
        ? genre.songs_listened
        : [];
      const cached = inflatedOfficialSongsByGenre.get(genre);
      const sourceAlreadyInflated =
        knownInflatedOfficialSongArrays.has(source);

      if (cached?.source === source || sourceAlreadyInflated) {
        if (cached?.source !== source) {
          inflatedOfficialSongsByGenre.set(genre, { source });
          officialSongIdentityIndex?.invalidate(genre);
        }
        return source;
      }

      const songs = inflateSongsFromStorage(source)
        .filter(song => !song.isPending);

      // filter() creates a second array, so mark the final assigned array too.
      knownInflatedOfficialSongArrays.add(songs);
      genre.songs_listened = songs;
      inflatedOfficialSongsByGenre.set(genre, { source: songs });
      officialSongIdentityIndex?.invalidate(genre);
      return songs;
    }

    function findOfficialSongByIdentity(key) {
      if (!currentGenre) return null;

      const songs = officialSongsForLookup(currentGenre);
      const indexed = officialSongIdentityIndex?.get(
        currentGenre,
        songs,
        key,
      );

      if (indexed?.song) return indexed;

      // Preserve a fully independent correctness fallback if the helper script
      // is unavailable or a malformed legacy row defeats indexed matching.
      for (let index = 0; index < songs.length; index += 1) {
        if (songsIdentityMatch(songs[index], key)) {
          return { song: songs[index], parent: null, index, songs };
        }
        if (
          songs[index].levelUp &&
          songsIdentityMatch(songs[index].levelUp, key)
        ) {
          return {
            song: songs[index].levelUp,
            parent: songs[index],
            index,
            songs,
          };
        }
      }
      return null;
    }

    window.dailyGenreSongIndexDiagnostics = () => {
      const currentSongs = Array.isArray(currentGenre?.songs_listened)
        ? currentGenre.songs_listened
        : [];

      return {
        genreId: currentGenre?.id ?? null,
        inflationReady: Boolean(
          currentGenre &&
          (
            knownInflatedOfficialSongArrays.has(currentSongs) ||
            inflatedOfficialSongsByGenre.get(currentGenre)?.source === currentSongs
          )
        ),
        ...(officialSongIdentityIndex
          ? officialSongIdentityIndex.stats(currentGenre, currentSongs)
          : {
              ready: false,
              stale: false,
              indexedLength: -1,
              size: 0,
              builds: 0,
            }),
        reactionFastPathHits: songReactionFastPathHits,
        reactionFallbackRenders: songReactionFallbackRenders,
        performanceRecording:
          Boolean(window.__dailyGenrePerformanceTracker),
      };
    };


    function encodeSongKeyForInline(song) {
      // encodeURIComponent intentionally leaves apostrophes unescaped; inline onclick strings do not.
      return encodeURIComponent(songIdentity(song)).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    }

    function decodeInlineSongKey(encodedKey) {
      try { return decodeURIComponent(encodedKey || ''); }
      catch (err) { return String(encodedKey || ''); }
    }

    function findOfficialSongByPath(path) {
      if (!currentGenre) return null;
      const match = String(path || '').match(/^song:(\d+)(?:\.(levelUp))?$/);
      if (!match) return null;
      const songs = officialSongsForLookup(currentGenre);
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index < 0 || index >= songs.length) return null;
      if (match[2] === 'levelUp') {
        if (!songs[index]?.levelUp) return null;
        return { song: songs[index].levelUp, parent: songs[index], index, songs };
      }
      return { song: songs[index], parent: null, index, songs };
    }

    function findEditableSongTarget(encodedKey, pendingIndex, path = '') {
      if (!currentGenre) return null;
      const isPendingEdit = Number.isInteger(pendingIndex) && pendingIndex >= 0;
      if (isPendingEdit) {
        currentGenre.pending_songs = normalizePendingSongs(currentGenre.pending_songs || []);
        const song = currentGenre.pending_songs[pendingIndex];
        return song ? { song, parent: null, index: pendingIndex, songs: currentGenre.pending_songs, isPending: true } : null;
      }

      const byPath = findOfficialSongByPath(path);
      if (byPath?.song) return byPath;

      const key = decodeInlineSongKey(encodedKey);
      const meaningfulKey = meaningfulSongIdentityKey(key);
      if (meaningfulKey) {
        const byIdentity = findOfficialSongByIdentity(key);
        if (byIdentity?.song) return byIdentity;
      }

      // Last-resort fallback for malformed/old curation rows: compare against common identity variants
      // without reparsing the editor again. This avoids silent failures on bad ALT TAKE / LEVEL UP rows.
      const songs = inflateSongsFromStorage(currentGenre.songs_listened || []).filter(song => !song.isPending);
      currentGenre.songs_listened = songs;
      if (meaningfulKey) {
        for (let index = 0; index < songs.length; index += 1) {
          const parent = songs[index];
          if (meaningfulSongIdentityKey(songIdentity(parent)) === meaningfulKey || songIdentityKeys(parent).map(meaningfulSongIdentityKey).includes(meaningfulKey)) {
            return { song: parent, parent: null, index, songs };
          }
          if (parent.levelUp && (meaningfulSongIdentityKey(songIdentity(parent.levelUp)) === meaningfulKey || songIdentityKeys(parent.levelUp).map(meaningfulSongIdentityKey).includes(meaningfulKey))) {
            return { song: parent.levelUp, parent, index, songs };
          }
        }
      }
      return null;
    }


    function looseSongTextKey(song) {
      const clean = value => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${clean(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(' ') : ''))}|${clean(song?.title || '')}`;
    }

    function queueDuplicateTextKey(song) {
      const clean = value => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\b(feat|ft|remix|remastered|version|explicit|clean)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(the|a|an|el|la|los|las|le|les|un|una)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return `${clean(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(' ') : ''))}|${clean(song?.title || '')}`;
    }

    function meaningfulQueueTextKey(key = '') {
      const value = String(key || '').trim();
      if (!value || value === '|') return '';
      const [artist = '', title = ''] = value.split('|');
      // A blank/blank key means multiple placeholder rows would look identical.
      // Do not use it for duplicate repair or URL overwrites.
      return (artist.trim() || title.trim()) ? value : '';
    }

    function meaningfulSongIdentityKey(key = '') {
      const value = String(key || '').trim().toLowerCase();
      if (!value) return '';
      if (value === 'meta:|' || /^meta:\s*\|\s*$/.test(value)) return '';
      return value;
    }

    function canonicalQueueUrlKey(url='') {
      const value = normalizeSongUrl(url || '');
      if (!value || songUrlLooksPlaceholder(value)) return '';
      return value.toLowerCase();
    }

    function queueSongMergeWeight(song) {
      if (!song) return 0;
      let weight = 0;
      if (song.artwork || song.albumArt) weight += 16;
      if (song.spotifyMetadataFetched) weight += 8;
      if (song.spotifyId) weight += 8;
      if (song.album) weight += 4;
      if (song.releaseYear || song.releaseDate) weight += 3;
      if (song.durationMs) weight += 2;
      if (song.isrc) weight += 2;
      if (song.reaction) weight += 1;
      if (song.reason) weight += 1;
      return weight;
    }

    function mergeSongObjectsInPlace(primary, duplicate) {
      if (!primary || !duplicate || primary === duplicate) return primary;
      const fields = ['url','spotifyUrl','spotifyId','title','artist','album','artwork','albumArt','releaseDate','releasePrecision','releaseSource','isrc','source','reason','listenerNote','songNote','spotifyMetadataFetchedAt'];
      fields.forEach(key => {
        if ((primary[key] == null || primary[key] === '') && duplicate[key] != null && duplicate[key] !== '') primary[key] = duplicate[key];
      });
      if (!Array.isArray(primary.artists) || !primary.artists.length) primary.artists = Array.isArray(duplicate.artists) ? duplicate.artists.slice() : primary.artists;
      ['releaseYear','durationMs','score','reaction','popularity','trackNumber','discNumber','albumTotalTracks'].forEach(key => {
        if ((primary[key] == null || primary[key] === '') && duplicate[key] != null && duplicate[key] !== '') primary[key] = duplicate[key];
      });
      if (!primary.spotifyMetadataFetched && duplicate.spotifyMetadataFetched) primary.spotifyMetadataFetched = true;
      if (!primary.levelUp && duplicate.levelUp) primary.levelUp = duplicate.levelUp;
      if (!primary.artwork && primary.albumArt) primary.artwork = primary.albumArt;
      if (!primary.albumArt && primary.artwork) primary.albumArt = primary.artwork;
      return primary;
    }

    function clonePlainObject(value) {
      if (!value || typeof value !== 'object') return null;
      try { return JSON.parse(JSON.stringify(value)); }
      catch (_) { return { ...value }; }
    }

    function snapshotGenreIdentityData(genre) {
      if (!genre || typeof genre !== 'object') return null;
      return {
        identity: clonePlainObject(genre.identity),
        seminal_song: clonePlainObject(genre.seminal_song),
        media_touchstones: Array.isArray(genre.media_touchstones) ? clonePlainObject(genre.media_touchstones) : null,
        aliases: Array.isArray(genre.aliases) ? genre.aliases.slice() : null,
        synonyms: Array.isArray(genre.synonyms) ? genre.synonyms.slice() : null,
      };
    }

    function identitySnapshotHasContent(snapshot) {
      if (!snapshot) return false;
      if (snapshot.identity && Object.keys(snapshot.identity).length) return true;
      if (snapshot.seminal_song && Object.keys(snapshot.seminal_song).length) return true;
      if (Array.isArray(snapshot.media_touchstones) && snapshot.media_touchstones.length) return true;
      if (Array.isArray(snapshot.aliases) && snapshot.aliases.length) return true;
      if (Array.isArray(snapshot.synonyms) && snapshot.synonyms.length) return true;
      return false;
    }

    function restoreGenreIdentityData(genre, snapshot) {
      if (!genre || !identitySnapshotHasContent(snapshot)) return;
      if (snapshot.identity) genre.identity = clonePlainObject(snapshot.identity) || {};
      if (snapshot.seminal_song) genre.seminal_song = clonePlainObject(snapshot.seminal_song) || {};
      if (Array.isArray(snapshot.media_touchstones)) genre.media_touchstones = clonePlainObject(snapshot.media_touchstones) || [];
      if (Array.isArray(snapshot.aliases)) genre.aliases = snapshot.aliases.slice();
      if (Array.isArray(snapshot.synonyms)) genre.synonyms = snapshot.synonyms.slice();
      if (genre.identity && Array.isArray(genre.identity.mediaTouchstones)) {
        genre.media_touchstones = genre.identity.mediaTouchstones;
      }
      // v224: Genre Identity data is separate from the listened-song queue.
      // Restoring identity metadata after a song save must not inject Seminal/Media
      // tracks into songs_listened or Level Up rows can shift under the wrong parent.
      try {
        if (window.DailyGenreIdentity?.purgeIdentityRowsFromSongQueue) window.DailyGenreIdentity.purgeIdentityRowsFromSongQueue(genre, false);
        else window.DailyGenreIdentity?.detachIdentityFlagsFromSongQueue?.(genre);
      } catch (error) {
        console.warn('Could not detach stale identity queue flags after song apply/save', error);
      }
    }

    function identityEditKeyFromSong(song) {
      if (!song || !song.isIdentityTrack) return '';
      const type = String(song.identityType || '').toLowerCase();
      if (!type) return '';
      const normalizedType = type === 'popular' ? 'media' : type;
      if (normalizedType !== 'seminal' && normalizedType !== 'media') return '';
      const index = normalizedType === 'seminal' ? -1 : Number(song.identityIndex ?? -1);
      return `identity:${normalizedType}:${Number.isFinite(index) ? index : -1}`;
    }

    function identityEditKeyFromAnchor(type, index) {
      const normalizedType = String(type || '').toLowerCase() === 'popular' ? 'media' : String(type || '').toLowerCase();
      if (normalizedType !== 'seminal' && normalizedType !== 'media') return '';
      const normalizedIndex = normalizedType === 'seminal' ? -1 : Number(index ?? -1);
      return `identity:${normalizedType}:${Number.isFinite(normalizedIndex) ? normalizedIndex : -1}`;
    }

    function snapshotIdentityQueueState(genre) {
      const snapshot = { songsByIdentityKey: {}, anchorsByIdentityKey: {} };
      if (!genre) return snapshot;
      try {
        inflateSongsFromStorage(genre.songs_listened || []).filter(song => song && !song.isPending).forEach(song => {
          const key = identityEditKeyFromSong(song);
          if (key) snapshot.songsByIdentityKey[key] = clonePlainObject(song);
        });
      } catch (_) {}
      try {
        const sem = (genre.identity && genre.identity.seminalTrack) || genre.seminal_song || null;
        if (sem && typeof sem === 'object') snapshot.anchorsByIdentityKey[identityEditKeyFromAnchor('seminal', -1)] = clonePlainObject(sem);
        const media = (genre.identity && Array.isArray(genre.identity.mediaTouchstones) && genre.identity.mediaTouchstones.length)
          ? genre.identity.mediaTouchstones
          : (Array.isArray(genre.media_touchstones) ? genre.media_touchstones : []);
        media.forEach((track, index) => {
          if (track && typeof track === 'object') snapshot.anchorsByIdentityKey[identityEditKeyFromAnchor('media', index)] = clonePlainObject(track);
        });
      } catch (_) {}
      return snapshot;
    }

    function identitySnapshotHasUsefulTrackData(track) {
      return !!(track && typeof track === 'object' && (
        track.spotifyId || track.spotifyUrl || track.url || track.artwork || track.albumArt ||
        track.album || track.releaseDate || track.releaseYear || track.durationMs || track.isrc ||
        track.title || track.name || track.artist
      ));
    }

    function restoreUneditedIdentityQueueState(genre, snapshot, editedSong, editedIdentityKeyOverride = '') {
      if (!genre || !snapshot) return;
      // v75: for identity placeholder backfills, the edited row may be transformed
      // from a stamped placeholder into new Spotify metadata during the overwrite.
      // Keep the pre-edit identity slot as the edited slot so restore logic does not
      // accidentally restore that same Seminal/Media anchor from the pre-edit snapshot.
      const editedKey = editedIdentityKeyOverride || identityEditKeyFromSong(editedSong);
      const restoreFields = ['url','spotifyUrl','spotifyId','title','name','artist','album','artwork','albumArt','releaseDate','releaseYear','releasePrecision','releaseSource','durationMs','isrc','source','artists','spotifyMetadataFetched','spotifyMetadataFetchedAt','mediaTitle','media','mediaType'];
      const copyFields = (target, source) => {
        if (!target || !source || !identitySnapshotHasUsefulTrackData(source)) return;
        restoreFields.forEach(key => {
          if (source[key] !== undefined) {
            target[key] = Array.isArray(source[key]) ? source[key].slice() : source[key];
          }
        });
        if (source.artwork && !target.albumArt) target.albumArt = source.artwork;
        if (source.albumArt && !target.artwork) target.artwork = source.albumArt;
      };

      try {
        const semKey = identityEditKeyFromAnchor('seminal', -1);
        if (editedKey !== semKey && snapshot.anchorsByIdentityKey?.[semKey]) {
          if (!genre.identity || typeof genre.identity !== 'object') genre.identity = {};
          if (!genre.identity.seminalTrack || typeof genre.identity.seminalTrack !== 'object') genre.identity.seminalTrack = {};
          copyFields(genre.identity.seminalTrack, snapshot.anchorsByIdentityKey[semKey]);
          if (!genre.seminal_song || typeof genre.seminal_song !== 'object') genre.seminal_song = {};
          copyFields(genre.seminal_song, snapshot.anchorsByIdentityKey[semKey]);
        }
        const mediaSnapshotKeys = Object.keys(snapshot.anchorsByIdentityKey || {}).filter(key => key.startsWith('identity:media:'));
        if (mediaSnapshotKeys.length) {
          if (!genre.identity || typeof genre.identity !== 'object') genre.identity = {};
          if (!Array.isArray(genre.identity.mediaTouchstones)) genre.identity.mediaTouchstones = [];
          if (!Array.isArray(genre.media_touchstones)) genre.media_touchstones = genre.identity.mediaTouchstones;
          mediaSnapshotKeys.forEach(key => {
            if (key === editedKey) return;
            const index = Number(key.split(':').pop());
            if (!Number.isInteger(index) || index < 0) return;
            if (!genre.identity.mediaTouchstones[index] || typeof genre.identity.mediaTouchstones[index] !== 'object') genre.identity.mediaTouchstones[index] = {};
            copyFields(genre.identity.mediaTouchstones[index], snapshot.anchorsByIdentityKey[key]);
            genre.media_touchstones = genre.identity.mediaTouchstones;
          });
        }
      } catch (err) {
        console.warn('Could not preserve unedited identity anchors after URL edit', err);
      }

      try {
        const songs = inflateSongsFromStorage(genre.songs_listened || []).filter(song => song && !song.isPending);
        let changed = false;
        songs.forEach(song => {
          const key = identityEditKeyFromSong(song);
          if (!key || key === editedKey) return;
          const saved = snapshot.songsByIdentityKey?.[key];
          if (!saved) return;
          copyFields(song, saved);
          changed = true;
        });
        if (changed) genre.songs_listened = songs;
      } catch (err) {
        console.warn('Could not preserve unedited identity queue rows after URL edit', err);
      }
    }

    function dedupeQueueSongsPreservingTarget(songs, target, match = {}) {
      const list = inflateSongsFromStorage(songs || []).filter(song => song && !song.isPending);
      if (!target) return list;
      const targetUrl = canonicalQueueUrlKey(target.url || target.spotifyUrl || match.newUrl || '');
      const oldUrl = canonicalQueueUrlKey(match.oldUrl || '');
      const targetSpotifyId = String(target.spotifyId || match.newSpotifyId || '').trim().toLowerCase();
      const oldSpotifyId = String(match.oldSpotifyId || '').trim().toLowerCase();
      const oldIdentity = meaningfulSongIdentityKey(match.oldIdentity || '');
      const targetIdentity = meaningfulSongIdentityKey(songIdentity(target) || '');
      const targetText = meaningfulQueueTextKey(queueDuplicateTextKey(target));
      const oldText = meaningfulQueueTextKey(match.oldTextKey || '');
      const newText = meaningfulQueueTextKey(match.newTextKey || '') || meaningfulQueueTextKey(targetText);
      const forceTextDedupe = !!match.forceTextDedupe;
      const maybeDuplicate = song => {
        if (!song || song === target) return false;
        const songUrl = canonicalQueueUrlKey(song.url || song.spotifyUrl || '');
        const songSpotifyId = String(song.spotifyId || '').trim().toLowerCase();
        const songIdentityValue = meaningfulSongIdentityKey(songIdentity(song) || '');
        const songText = meaningfulQueueTextKey(queueDuplicateTextKey(song));
        if (targetUrl && songUrl && songUrl === targetUrl) return true;
        if (oldUrl && songUrl && songUrl === oldUrl) return true;
        if (targetSpotifyId && songSpotifyId && songSpotifyId === targetSpotifyId) return true;
        if (oldSpotifyId && songSpotifyId && songSpotifyId === oldSpotifyId) return true;
        if (oldIdentity && songIdentityValue && songIdentityValue === oldIdentity) return true;
        if (targetIdentity && songIdentityValue && songIdentityValue === targetIdentity) return true;
        // URL replacement should collapse the pre-metadata text row (ex: “El Pistolón”)
        // into the Spotify-normalized metadata row (ex: “Pistolon”). Accents/articles
        // are normalized by queueDuplicateTextKey, so this catches the common case where
        // Spotify uses a slightly different title than the manually-entered line.
        if (forceTextDedupe && songText && (songText === targetText || songText === oldText || songText === newText)) return true;
        // Default path stays conservative: only text-dedupe if one side also has a Spotify URL/ID signal.
        if (targetText && songText && songText === targetText && (songUrl || songSpotifyId || targetUrl || targetSpotifyId)) return true;
        if (oldText && songText === oldText && (songUrl || songSpotifyId || targetUrl || targetSpotifyId)) return true;
        if (newText && songText === newText && (songUrl || songSpotifyId || targetUrl || targetSpotifyId)) return true;
        return false;
      };
      // If a duplicate already has richer metadata than the edited row, merge it into the edited row first.
      list.forEach(song => {
        if (maybeDuplicate(song) && queueSongMergeWeight(song) > queueSongMergeWeight(target)) mergeSongObjectsInPlace(target, song);
      });
      const out = [];
      let targetInserted = false;
      list.forEach(song => {
        if (song === target) {
          if (!targetInserted) { out.push(target); targetInserted = true; }
          return;
        }
        if (maybeDuplicate(song)) {
          mergeSongObjectsInPlace(target, song);
          if (!targetInserted) { out.push(target); targetInserted = true; }
          return;
        }
        out.push(song);
      });
      if (!targetInserted) out.push(target);
      return out;
    }

    function queueTextSimilarity(a = '', b = '') {
      const tokens = value => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter(token => !['the','a','an','el','la','los','las','le','les','un','una','feat','ft'].includes(token));
      const left = tokens(a);
      const right = tokens(b);
      if (!left.length && !right.length) return 1;
      if (!left.length || !right.length) return 0;
      const rightSet = new Set(right);
      const overlap = left.filter(token => rightSet.has(token)).length;
      return overlap / Math.max(left.length, right.length);
    }

    function queueMetadataLooksClose(oldSong, newSong) {
      if (!oldSong || !newSong) return false;
      const titleScore = queueTextSimilarity(oldSong.title || '', newSong.title || '');
      const artistScore = queueTextSimilarity(oldSong.artist || (Array.isArray(oldSong.artists) ? oldSong.artists.join(' ') : ''), newSong.artist || (Array.isArray(newSong.artists) ? newSong.artists.join(' ') : ''));
      if (!String(oldSong.title || '').trim() && !String(oldSong.artist || '').trim()) return true;
      return titleScore >= 0.45 && (artistScore >= 0.35 || !String(oldSong.artist || '').trim() || !String(newSong.artist || '').trim());
    }

    function confirmQueueUrlOverwrite(oldSong, newSong) {
      const oldLabel = `${oldSong?.artist ? `${oldSong.artist} — ` : ''}${oldSong?.title || 'this queue row'}`;
      const newLabel = `${newSong?.artist ? `${newSong.artist} — ` : ''}${newSong?.title || 'the Spotify track'}`;
      const closeEnough = queueMetadataLooksClose(oldSong, newSong);
      if (closeEnough) return true;
      return window.confirm(`This Spotify result does not look like a close match.

Current queue row: ${oldLabel}
Spotify result: ${newLabel}

Overwrite the selected queue row anyway? This will replace its title, artist, artwork, and Spotify metadata without creating a new row.`);
    }

    function replaceQueueTargetAtSelectedIndex(songs, target, match = {}) {
      const list = inflateSongsFromStorage(songs || []).filter(song => song && !song.isPending);
      const targetIndex = Number.isInteger(match.index) ? match.index : list.indexOf(target);
      if (!target || !Number.isInteger(targetIndex) || targetIndex < 0) return list;
      const out = [];
      let inserted = false;
      list.forEach((song, index) => {
        if (!song) return;
        if (index === targetIndex) {
          out.push(target);
          inserted = true;
          return;
        }
        // If the edited object also appears elsewhere after a stale re-render/reinflate,
        // keep only the explicit selected slot. This is especially important for confirmed
        // Spotify mismatches, where title/artist text intentionally no longer matches the
        // original row and loose dedupe must not decide row identity.
        if (song === target) return;
        out.push(song);
      });
      if (!inserted) out.push(target);
      return out;
    }

    function forceOverwriteQueueTarget(songs, target, match = {}) {
      const list = inflateSongsFromStorage(songs || []).filter(song => song && !song.isPending);
      if (!target) return list;
      const targetIndex = Number.isInteger(match.index) ? match.index : list.indexOf(target);
      const targetUrl = canonicalQueueUrlKey(target.url || target.spotifyUrl || match.newUrl || '');
      const oldUrl = canonicalQueueUrlKey(match.oldUrl || '');
      const targetSpotifyId = String(target.spotifyId || match.newSpotifyId || '').trim().toLowerCase();
      const oldSpotifyId = String(match.oldSpotifyId || '').trim().toLowerCase();
      const oldIdentity = meaningfulSongIdentityKey(match.oldIdentity || '');
      const targetIdentity = meaningfulSongIdentityKey(songIdentity(target) || '');
      const oldText = meaningfulQueueTextKey(match.oldTextKey || '');
      const newText = meaningfulQueueTextKey(match.newTextKey || queueDuplicateTextKey(target));
      const skipLooseTextDedupe = !!match.confirmedMetadataMismatch;
      const out = [];
      let inserted = false;
      list.forEach((song, index) => {
        if (!song) return;
        const isSelected = song === target || index === targetIndex;
        if (isSelected) {
          if (!inserted) { out.push(target); inserted = true; }
          return;
        }
        const songUrl = canonicalQueueUrlKey(song.url || song.spotifyUrl || '');
        const songSpotifyId = String(song.spotifyId || '').trim().toLowerCase();
        const songIdentityValue = meaningfulSongIdentityKey(songIdentity(song) || '');
        const songText = meaningfulQueueTextKey(queueDuplicateTextKey(song));
        const duplicateByUrl = (targetUrl && songUrl === targetUrl) || (oldUrl && songUrl === oldUrl);
        const duplicateBySpotify = (targetSpotifyId && songSpotifyId === targetSpotifyId) || (oldSpotifyId && songSpotifyId === oldSpotifyId);
        const duplicateByIdentity = (targetIdentity && songIdentityValue === targetIdentity) || (oldIdentity && songIdentityValue === oldIdentity);
        const duplicateByText = !skipLooseTextDedupe && !!(songText && (songText === oldText || songText === newText) && queueMetadataLooksClose(song, target));
        if (duplicateByUrl || duplicateBySpotify || duplicateByIdentity || duplicateByText) {
          mergeSongObjectsInPlace(target, song);
          if (!inserted && index < targetIndex) { out.push(target); inserted = true; }
          return;
        }
        out.push(song);
      });
      if (!inserted) out.push(target);
      return out;
    }

    function repairQueueAfterAuthoritativeUrlOverwrite(songs, target, match = {}) {
      const list = inflateSongsFromStorage(songs || []).filter(song => song && !song.isPending);
      if (!target) return list;
      const targetUrl = canonicalQueueUrlKey(target.url || target.spotifyUrl || match.newUrl || '');
      const oldUrl = canonicalQueueUrlKey(match.oldUrl || '');
      const targetSpotifyId = String(target.spotifyId || match.newSpotifyId || '').trim().toLowerCase();
      const oldSpotifyId = String(match.oldSpotifyId || '').trim().toLowerCase();
      const oldIdentity = meaningfulSongIdentityKey(match.oldIdentity || '');
      const targetIdentity = meaningfulSongIdentityKey(songIdentity(target) || '');
      const oldText = meaningfulQueueTextKey(match.oldTextKey || '');
      const newText = meaningfulQueueTextKey(match.newTextKey || queueDuplicateTextKey(target));
      const skipLooseTextDedupe = !!match.confirmedMetadataMismatch;
      const looksLikeSameManualSong = song => {
        if (!song || song === target) return false;
        const songUrl = canonicalQueueUrlKey(song.url || song.spotifyUrl || '');
        const songSpotifyId = String(song.spotifyId || '').trim().toLowerCase();
        const songIdentityValue = meaningfulSongIdentityKey(songIdentity(song) || '');
        const songText = meaningfulQueueTextKey(queueDuplicateTextKey(song));
        if (targetUrl && songUrl && songUrl === targetUrl) return true;
        if (oldUrl && songUrl && songUrl === oldUrl) return true;
        if (targetSpotifyId && songSpotifyId && songSpotifyId === targetSpotifyId) return true;
        if (oldSpotifyId && songSpotifyId && songSpotifyId === oldSpotifyId) return true;
        if (oldIdentity && songIdentityValue && songIdentityValue === oldIdentity) return true;
        if (targetIdentity && songIdentityValue && songIdentityValue === targetIdentity) return true;
        if (!skipLooseTextDedupe && songText && (songText === oldText || songText === newText)) return true;
        return false;
      };
      const out = [];
      let inserted = false;
      list.forEach(song => {
        if (song === target) {
          if (!inserted) { out.push(target); inserted = true; }
          return;
        }
        if (looksLikeSameManualSong(song)) {
          // The explicitly edited row wins. Only backfill user-owned fields from a duplicate.
          if (target.reaction == null && song.reaction != null) target.reaction = song.reaction;
          if (!target.reason && song.reason) target.reason = song.reason;
          if (!target.listenerNote && (song.listenerNote || song.songNote)) target.listenerNote = song.listenerNote || song.songNote;
          if (!inserted) { out.push(target); inserted = true; }
          return;
        }
        out.push(song);
      });
      if (!inserted) out.push(target);
      return out;
    }

    function dedupeSongsAfterTrackUrlUpdate(songs, target, oldUrl, oldIdentity, oldSpotifyId) {
      if (!Array.isArray(songs) || !target) return songs || [];
      const canonicalOldUrl = normalizeSongUrl(oldUrl || '').toLowerCase();
      const oldKeys = new Set([
        String(oldIdentity || '').toLowerCase(),
        canonicalOldUrl ? `url:${canonicalOldUrl}` : '',
        oldSpotifyId ? `spotify:${String(oldSpotifyId).toLowerCase()}` : ''
      ].filter(Boolean));
      const targetIdentity = songIdentity(target);
      const targetKeys = new Set(songIdentityKeys(target).map(k => String(k || '').toLowerCase()));
      const targetTextKey = looseSongTextKey(target);
      let keptTarget = false;
      const deduped = [];
      songs.forEach(song => {
        if (!song || song.isPending) return;
        if (song === target) {
          if (!keptTarget) {
            deduped.push(song);
            keptTarget = true;
          }
          return;
        }
        const songId = songIdentity(song);
        const songKeys = songIdentityKeys(song).map(k => String(k || '').toLowerCase());
        const songUrl = normalizeSongUrl(song.url || song.spotifyUrl || '').toLowerCase();
        const matchesOldUrl = !!canonicalOldUrl && songUrl === canonicalOldUrl;
        const matchesOldIdentity = songKeys.some(k => oldKeys.has(k)) || (!!songId && oldKeys.has(String(songId).toLowerCase()));
        const matchesNewIdentity = !!targetIdentity && (String(songId || '').toLowerCase() === String(targetIdentity).toLowerCase() || songKeys.some(k => targetKeys.has(k)));
        const matchesSameTextAndOld = targetTextKey && targetTextKey === looseSongTextKey(song) && (matchesOldUrl || matchesOldIdentity);
        if (matchesOldUrl || matchesOldIdentity || matchesNewIdentity || matchesSameTextAndOld) {
          return;
        }
        deduped.push(song);
      });
      if (!keptTarget) deduped.push(target);
      return deduped;
    }




    function readPendingSongNotesMap() {
      try {
        const raw = safeStorageGet(PENDING_SONG_NOTES_STORAGE_KEY) || '{}';
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (err) {
        console.warn('Could not read pending song notes', err);
        return {};
      }
    }

    function writePendingSongNotesMap(map) {
      try { safeStorageSet(PENDING_SONG_NOTES_STORAGE_KEY, JSON.stringify(map || {})); }
      catch (err) { console.warn('Could not save pending song notes', err); }
    }

    function pendingSongNoteId(genre, song, path = '', pendingIndex = -1) {
      const genreId = String(genre?.id || genre?.genre || 'unknown');
      const identity = songIdentity(song || {}) || normalizeSongUrl(song?.url || song?.spotifyUrl || '') || String(song?.title || 'song');
      if (Number.isInteger(pendingIndex) && pendingIndex >= 0) return `${genreId}::pending:${pendingIndex}::${identity}`;
      if (path) return `${genreId}::${path}::${identity}`;
      return `${genreId}::${identity}`;
    }

    function pendingSongNoteFor(genre, song, path = '', pendingIndex = -1) {
      const map = readPendingSongNotesMap();
      const id = pendingSongNoteId(genre, song, path, pendingIndex);
      return map[id]?.note || '';
    }

    function pendingSongNotesForGenre(genre = currentGenre) {
      if (!genre) return [];
      const prefix = `${String(genre.id || genre.genre || 'unknown')}::`;
      return Object.entries(readPendingSongNotesMap())
        .filter(([key, value]) => key.startsWith(prefix) && value?.note)
        .map(([key, value]) => ({ key, ...value }));
    }

    function renderPendingSongNotesPanel(genre = currentGenre) {
      const count = pendingSongNotesForGenre(genre).length;
      if (!count) return '';
      return `<div class="pending-song-notes-panel"><div><strong>${count} pending song note${count === 1 ? '' : 's'}</strong><div class="small">These are staged locally. The floating Save button will roll them into the song cards and persist them.</div></div><div class="row" style="justify-content:flex-end;"><button type="button" class="btn btn-secondary" onclick="rollUpPendingSongNotesForCurrentGenre()">Roll up pending notes</button></div></div>`;
    }

    function savePendingSongNoteFromCard(encodedKey, pendingIndex, path = '', button = null) {
      if (!currentGenre) return;
      const wrapper = button?.closest('.song-note-editor');
      const textarea = wrapper?.querySelector('[data-song-note-input]');
      const note = String(textarea?.value || '').trim();
      const result = findEditableSongTarget(encodedKey, pendingIndex, path);
      const song = result?.song;
      if (!song) {
        showSaveToast('That song changed. Reopen the card and try again.', true);
        return;
      }
      const id = pendingSongNoteId(currentGenre, song, path, pendingIndex);
      const map = readPendingSongNotesMap();
      if (note) {
        map[id] = {
          genreId: currentGenre.id || '',
          genre: currentGenre.genre || '',
          path: path || '',
          pendingIndex: Number.isInteger(pendingIndex) ? pendingIndex : -1,
          identity: songIdentity(song),
          title: song.title || '',
          artist: song.artist || '',
          url: normalizeSongUrl(song.url || song.spotifyUrl || ''),
          note,
          updatedAt: new Date().toISOString()
        };
        showSaveToast('Song note staged — roll up pending notes when ready.', false);
      } else {
        delete map[id];
        showSaveToast('Pending song note cleared.', false);
      }
      writePendingSongNotesMap(map);
      markListeningUpdatePending();
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
    }

    function clearPendingSongNoteFromCard(encodedKey, pendingIndex, path = '', button = null) {
      if (!currentGenre) return;
      const result = findEditableSongTarget(encodedKey, pendingIndex, path);
      const song = result?.song;
      if (!song) return;
      const map = readPendingSongNotesMap();
      delete map[pendingSongNoteId(currentGenre, song, path, pendingIndex)];
      writePendingSongNotesMap(map);
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
      showSaveToast('Pending song note cleared.', false);
    }

    function findSongForPendingNote(note) {
      if (!currentGenre || !note) return null;
      if (note.path) {
        const byPath = findOfficialSongByPath(note.path);
        if (byPath?.song) return byPath;
      }
      if (Number.isInteger(note.pendingIndex) && note.pendingIndex >= 0) {
        currentGenre.pending_songs = normalizePendingSongs(currentGenre.pending_songs || []);
        const song = currentGenre.pending_songs[note.pendingIndex];
        if (song) return { song, parent: null, index: note.pendingIndex, songs: currentGenre.pending_songs, isPending: true };
      }
      const key = note.identity || '';
      if (key) {
        const byIdentity = findOfficialSongByIdentity(key);
        if (byIdentity?.song) return byIdentity;
      }
      return null;
    }

    function rollUpPendingSongNotesForCurrentGenre() {
      if (!currentGenre) return;
      syncBulkDraftIntoSongModel();
      const notes = pendingSongNotesForGenre(currentGenre);
      if (!notes.length) {
        showSaveToast('No pending song notes to roll up.', false);
        return;
      }
      const map = readPendingSongNotesMap();
      let applied = 0;
      notes.forEach(note => {
        const target = findSongForPendingNote(note);
        if (!target?.song) return;
        target.song.listenerNote = String(note.note || '').trim();
        if (target.isPending) currentGenre.pending_songs = target.songs;
        else currentGenre.songs_listened = target.songs;
        delete map[note.key];
        applied += 1;
      });
      writePendingSongNotesMap(map);
      if (!applied) {
        showSaveToast('Could not match pending notes to current song rows. Reopen the genre and try again.', true);
        return;
      }
      markListeningUpdatePending();
      const restore = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      restore();
      showSaveToast(`${applied} song note${applied === 1 ? '' : 's'} rolled up — click use the floating Save button to persist.`, false);
    }

    function applyPendingSongNotesToCurrentGenreSilently() {
      if (!currentGenre) return 0;
      const notes = pendingSongNotesForGenre(currentGenre);
      if (!notes.length) return 0;
      const map = readPendingSongNotesMap();
      let applied = 0;
      notes.forEach(note => {
        const target = findSongForPendingNote(note);
        if (!target?.song) return;
        target.song.listenerNote = String(note.note || '').trim();
        if (target.isPending) currentGenre.pending_songs = target.songs;
        else currentGenre.songs_listened = target.songs;
        delete map[note.key];
        applied += 1;
      });
      if (applied) {
        writePendingSongNotesMap(map);
        libraryUpdatesPending = true;
        setUnsavedState(true);
        toggleLibrarySaveButton(true);
      }
      return applied;
    }

    function ensureCurrentGenreIsInLibrary() {
      if (!currentGenre || !Array.isArray(genres)) return;
      const idx = genres.findIndex(g => String(g?.id) === String(currentGenre.id));
      if (idx >= 0 && genres[idx] !== currentGenre) {
        replaceGenreAtIndex(idx, currentGenre, 'current-genre-sync');
      }
    }

    function finalizeListeningUpdatesBeforeSave() {
      if (currentGenre) {
        const studioCleanupSave = !!window.__dgStudioCleanupSavePending && document.getElementById('screen-review')?.classList.contains('active');
        try {
          if (!studioCleanupSave) {
            syncBulkDraftIntoSongModel();
          }
        } catch (error) { console.warn('Could not sync song draft before save', error); }
        if (!studioCleanupSave) {
          applyPendingSongNotesToCurrentGenreSilently();
        }
        ensureCurrentGenreIsInLibrary();
      }
    }

    async function applySpotifyOembedFallback(song, url, options = {}) {
      if (!song || !url || typeof fetchSpotifyOembed !== 'function') return false;
      const canonical = (typeof spotifyCanonicalTrackUrl === 'function') ? spotifyCanonicalTrackUrl(url) : normalizeSongUrl(url);
      if (!/open\.spotify\.com\/track\//i.test(canonical || '')) return false;
      const embed = await fetchSpotifyOembed(canonical, true);
      if (!embed) return false;
      let changed = false;
      const title = String(embed.title || '').trim();
      const artwork = String(embed.thumbnail_url || '').trim();
      if (artwork && (options.forceArtwork || song.artwork !== artwork || song.albumArt !== artwork)) {
        song.artwork = artwork;
        song.albumArt = artwork;
        changed = true;
      }
      if (title && (options.forceTitle || !song.title || song.title === 'Track' || song.title === 'Spotify track' || song.title === 'Linked track')) {
        song.title = title;
        changed = true;
      }
      if (canonical && song.url !== canonical) {
        song.url = canonical;
        changed = true;
      }
      if (canonical && song.spotifyUrl !== canonical) {
        song.spotifyUrl = canonical;
        changed = true;
      }
      const spotifyId = (typeof spotifyTrackId === 'function') ? spotifyTrackId(canonical) : '';
      if (spotifyId && song.spotifyId !== spotifyId) {
        song.spotifyId = spotifyId;
        changed = true;
      }
      song.source = 'spotify';
      song.spotifyMetadataFetched = false;
      song.spotifyMetadataFetchedAt = '';
      return changed || !!artwork;
    }


    async function refreshGenrePageSpotifyTrack(encodedKey, button, path = '') {
      if (!currentGenre) return;
      syncBulkDraftIntoSongModel();
      const result = findEditableSongTarget(encodedKey, -1, path);
      if (!result?.song) {
        showSaveToast('That song changed in the text editor. Reopen the card and try again.', true);
        return;
      }
      const url = normalizeSongUrl(result.song.url || result.song.spotifyUrl || '');
      if (!/spotify\.com\/track\//i.test(url) && !/^spotify:track:/i.test(url)) {
        showSaveToast('That track does not have a Spotify track URL to refresh.', true);
        return;
      }
      const oldText = button?.textContent || '';
      if (button) {
        button.disabled = true;
        button.classList.add('is-saving');
        button.textContent = 'Refreshing…';
      }
      try {
        const refreshed = await fetchSpotifyTrackResult(url, true);
        if (!refreshed.ok) {
          spotifyMetadataFailures.set(stagedReactionKey(currentGenre.id, songIdentity(result.song)), refreshed);
          if (refreshed.code === 'rate_limited') beginSpotifyPause(refreshed.retryAfterSeconds || 30);
          showSaveToast(`Spotify refresh failed: ${refreshed.error}`, true);
          return;
        }
        applyOfficialSpotifyMetadata(result.song, refreshed.track);
        currentGenre.songs_listened = result.songs;
        spotifyMetadataFailures.delete(stagedReactionKey(currentGenre.id, songIdentity(result.song)));
        const updatedFocusKey = songIdentity(target);
        try {
          if (updatedFocusKey && typeof setSongFocus === 'function') setSongFocus(updatedFocusKey);
        } catch {}
        const restore = preserveScrollSnapshot();
        loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
        try {
          if (updatedFocusKey && typeof setSongFocus === 'function') setSongFocus(updatedFocusKey);
        } catch {}
        applyDetailEditMode(detailEditMode);
        restore();
        markListeningUpdatePending();
        showSaveToast('Spotify metadata refreshed — use the floating Save button to keep it.', false);
      } catch (err) {
        console.error('Spotify refresh failed', err);
        showSaveToast(`Spotify refresh failed: ${err?.message || err || 'Unknown error'}`, true);
      } finally {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.classList.remove('is-saving');
          button.textContent = oldText || 'Refresh Spotify';
        }
      }
    }

    function classifySupportedTrackUrl(rawUrl = '') {
      const raw = String(rawUrl || '').trim();
      if (/^spotify:track:[A-Za-z0-9]{22}$/i.test(raw) || /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[A-Za-z0-9]{22}/i.test(raw)) return 'spotify';

      let parsed = null;
      try { parsed = new URL(raw); } catch (_) { return ''; }
      if (!/^https?:$/i.test(parsed.protocol)) return '';

      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      const path = parsed.pathname || '';

      if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
        return /\/watch|\/shorts\/|\/embed\//i.test(path) || host === 'youtu.be' ? 'youtube' : '';
      }
      if (host === 'music.apple.com' || host === 'itunes.apple.com') return 'apple';
      if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com') || host === 'on.soundcloud.com') return 'soundcloud';
      if (host === 'bandcamp.com' || host.endsWith('.bandcamp.com')) return 'bandcamp';
      return '';
    }

    async function fetchSoundCloudTrackMetadata(rawUrl) {
      const endpoint = `https://soundcloud.com/oembed?format=json&maxheight=450&url=${encodeURIComponent(rawUrl)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`SoundCloud metadata lookup returned ${response.status}.`);
      const data = await response.json();
      const title = String(data?.title || '').trim();
      const artist = String(data?.author_name || '').trim();
      const artwork = String(data?.thumbnail_url || '').trim();
      if (!title && !artist && !artwork) throw new Error('SoundCloud did not return track metadata for that URL.');
      return {
        source: 'soundcloud',
        url: rawUrl,
        title,
        artist,
        artists: artist ? [artist] : [],
        artwork,
        albumArt: artwork,
        externalMetadataFetched: true,
        externalMetadataFetchedAt: new Date().toISOString()
      };
    }

    function clearPlatformSpecificTrackMetadata(song) {
      if (!song) return;
      song.spotifyId = '';
      song.spotifyUrl = '';
      song.spotifyMetadataFetched = false;
      song.spotifyMetadataFetchedAt = '';
      song.isrc = '';
      song.album = '';
      song.artwork = '';
      song.albumArt = '';
      song.releaseDate = '';
      song.releaseYear = null;
      song.releasePrecision = '';
      song.releaseSource = '';
      song.durationMs = null;
    }

    async function updateTrackUrlFromCard(encodedKey, pendingIndex, button, path = '') {
      if (!currentGenre) return;
      // The inline detail editor and the focused Song Queue details drawer use
      // different containers. Look upward first, then fall back to the nearest
      // URL input in the focused details region so queue edits do not read blank.
      const editor = button?.closest('.track-card-editor, .song-focus-url-card, .song-focus-details-drawer, .song-focus-details-grid');
      const activeInput = document.activeElement?.matches?.('[data-track-url-input]') ? document.activeElement : null;
      const input = editor?.querySelector('[data-track-url-input]')
        || button?.parentElement?.querySelector?.('[data-track-url-input]')
        || activeInput
        || null;
      let nextUrl = normalizeSongUrl(input?.value || '');
      if ((/spotify\.com\/track\//i.test(nextUrl) || /^spotify:track:/i.test(nextUrl)) && typeof spotifyCanonicalTrackUrl === 'function') {
        nextUrl = spotifyCanonicalTrackUrl(nextUrl);
      }
      if (input && nextUrl) input.value = nextUrl;
      const overrideTitleInput = editor?.querySelector?.('[data-track-title-input]') || null;
      const overrideArtistInput = editor?.querySelector?.('[data-track-artist-input]') || null;
      const overrideTitle = cleanPastedCitationArtifacts(overrideTitleInput?.value || '').trim();
      const overrideArtist = cleanPastedCitationArtifacts(overrideArtistInput?.value || '').trim();
      const trackPlatform = classifySupportedTrackUrl(nextUrl);
      if (!trackPlatform) {
        showSaveToast('Use a valid Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track URL.', true);
        return;
      }

      const oldButtonText = button?.textContent || '';
      if (button) {
        button.disabled = true;
        button.classList.add('is-saving');
        button.textContent = 'Updating…';
      }

      try {
        const isPendingEdit = Number.isInteger(pendingIndex) && pendingIndex >= 0;
        const isQueueDrawerEdit = !isPendingEdit && (String(path || '').startsWith('song:') || !!button?.closest?.('.song-focus-details-drawer'));
        // Queue drawer URL edits already point at a concrete song path. Do not reparse the
        // hidden bulk textarea first; if that textarea is stale, reparsing can resurrect the
        // old URL as a duplicate row before we update the selected item.
        if (!isPendingEdit && !isQueueDrawerEdit) syncBulkDraftIntoSongModel();
        const result = findEditableSongTarget(encodedKey, pendingIndex, path);
        const target = result?.song || null;

        if (!target) {
          showSaveToast('That song changed or was malformed. Reopen the card and try again.', true);
          loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
          return;
        }

        const oldUrl = normalizeSongUrl(target.url || target.spotifyUrl || '');
        const oldIdentity = songIdentity(target);
        const oldSpotifyId = String(target.spotifyId || '').trim();
        const nestedLevelUp = target.levelUp || null;
        const savedReason = target.reason || '';
        const savedScore = target.score;
        const savedReaction = target.reaction;
        const savedTitle = target.title || '';
        const savedArtist = target.artist || '';
        const oldTextKey = queueDuplicateTextKey({ title: savedTitle, artist: savedArtist });
        const beforeOverwrite = { ...target, title: savedTitle, artist: savedArtist, url: oldUrl, spotifyId: oldSpotifyId };
        const identityQueueSnapshotBeforeEdit = snapshotIdentityQueueState(currentGenre);
        const editedIdentityKeyBeforeOverwrite = identityEditKeyFromSong(target);
        let proposedMetadataSong = null;
        let confirmedMetadataMismatch = false;

        const isSpotifyTrack = trackPlatform === 'spotify';
        let metadataWarning = '';

        if (isSpotifyTrack) {
          // v73: Build the Spotify overwrite in an isolated candidate first. Previously
          // we wrote the new URL to the live row and cleared artwork before showing the
          // mismatch-confirmation dialog. If that dialog was triggered, downstream queue
          // reconciliation could see the half-mutated row and then restore/re-render the
          // old row even after the user confirmed. The live row is now untouched until
          // the confirmation is accepted.
          proposedMetadataSong = { ...target, title: savedTitle, artist: savedArtist };
          proposedMetadataSong.url = nextUrl;
          proposedMetadataSong.artwork = '';
          proposedMetadataSong.albumArt = '';
          proposedMetadataSong.releaseDate = '';
          proposedMetadataSong.releaseYear = null;
          proposedMetadataSong.releaseSource = '';
          proposedMetadataSong.source = 'spotify';
          proposedMetadataSong.spotifyUrl = /^spotify:track:/i.test(nextUrl)
            ? `https://open.spotify.com/track/${spotifyTrackId(nextUrl)}`
            : nextUrl;
          proposedMetadataSong.spotifyId = spotifyTrackId(nextUrl) || proposedMetadataSong.spotifyId || '';

          const refreshed = await fetchSpotifyTrackResult(nextUrl, true);
          if (refreshed.ok) {
            applyOfficialSpotifyMetadata(proposedMetadataSong, refreshed.track);
            if (!proposedMetadataSong.artwork) {
              const usedEmbedFallback = await applySpotifyOembedFallback(proposedMetadataSong, nextUrl, { forceArtwork: true });
              if (usedEmbedFallback) metadataWarning = 'Spotify metadata refreshed, and artwork was filled from Spotify embed.';
            }
          } else {
            const usedEmbedFallback = await applySpotifyOembedFallback(proposedMetadataSong, nextUrl, { forceArtwork: true, forceTitle: true });
            if (usedEmbedFallback) {
              metadataWarning = 'Spotify API lookup failed, but artwork was recovered from Spotify embed.';
            } else {
              metadataWarning = refreshed.error || 'Spotify metadata could not be refreshed.';
            }
            if (refreshed.code === 'rate_limited') beginSpotifyPause(refreshed.retryAfterSeconds || 30);
          }

          const closeEnough = queueMetadataLooksClose(beforeOverwrite, proposedMetadataSong);
          if (!closeEnough && !confirmQueueUrlOverwrite(beforeOverwrite, proposedMetadataSong)) {
            showSaveToast('URL update cancelled. No queue rows were changed.', false);
            return;
          }
          confirmedMetadataMismatch = !closeEnough;

          Object.assign(target, proposedMetadataSong);
          target.url = proposedMetadataSong.spotifyUrl || nextUrl;
          target.spotifyUrl = proposedMetadataSong.spotifyUrl || nextUrl;
          if (target.artwork && !target.albumArt) target.albumArt = target.artwork;
          if (target.albumArt && !target.artwork) target.artwork = target.albumArt;
          try {
            if (window.DailyGenreIdentity && typeof window.DailyGenreIdentity.updateTrackFromQueueOverwrite === 'function') {
              window.DailyGenreIdentity.updateTrackFromQueueOverwrite(currentGenre, beforeOverwrite, target);
            }
          } catch (identityError) {
            console.warn('Could not sync queue URL overwrite back to Genre DNA', identityError);
          }
        } else {
          let externalMetadata = null;

          if (trackPlatform === 'soundcloud') {
            externalMetadata = await fetchSoundCloudTrackMetadata(nextUrl);
          } else if (trackPlatform === 'youtube' || trackPlatform === 'apple') {
            externalMetadata = await fetchExternalTrackMetadata(nextUrl);
          } else if (trackPlatform === 'bandcamp') {
            externalMetadata = {
              source: 'bandcamp',
              url: nextUrl,
              title: overrideTitle || savedTitle || '',
              artist: overrideArtist || savedArtist || '',
              artists: (overrideArtist || savedArtist) ? [overrideArtist || savedArtist] : []
            };
          }

          if (!externalMetadata) throw new Error('No metadata handler is available for that URL.');

          const proposedExternal = {
            ...target,
            ...externalMetadata,
            title: overrideTitle || externalMetadata.title || savedTitle || '',
            artist: overrideArtist || externalMetadata.artist || savedArtist || '',
          };

          if (
            trackPlatform === 'soundcloud' &&
            !queueMetadataLooksClose(beforeOverwrite, proposedExternal) &&
            !confirmQueueUrlOverwrite(beforeOverwrite, proposedExternal)
          ) {
            showSaveToast('URL update cancelled. No queue rows were changed.', false);
            return;
          }

          clearPlatformSpecificTrackMetadata(target);
          applyExternalTrackMetadata(target, nextUrl, {
            ...externalMetadata,
            title: overrideTitle || externalMetadata.title || savedTitle || '',
            artist: overrideArtist || externalMetadata.artist || savedArtist || '',
          }, savedTitle, savedArtist);

          target.source = trackPlatform;
          target.url = nextUrl;
          if (trackPlatform === 'soundcloud') {
            target.externalMetadataFetched = true;
            target.externalMetadataFetchedAt = new Date().toISOString();
          }
        }

        if (overrideTitle) target.title = overrideTitle;
        if (overrideArtist) {
          target.artist = overrideArtist;
          target.artists = [overrideArtist];
        } else if (target.artist && (!Array.isArray(target.artists) || !target.artists.length)) {
          target.artists = [target.artist];
        }

        target.levelUp = nestedLevelUp;
        target.reason = savedReason;
        target.score = savedScore;
        target.reaction = savedReaction;

        const currentFavUrl = normalizeSongUrl(currentGenre.favoritesongurl || '');
        if (!isPendingEdit && currentFavUrl && oldUrl && currentFavUrl === oldUrl) {
          currentGenre.favoritesongurl = nextUrl;
          currentGenre.favoritesong = target.title || currentGenre.favoritesong;
          currentGenre.favoriteartist = target.artist || currentGenre.favoriteartist;
          currentGenre.favoritesongartwork = target.artwork || currentGenre.favoritesongartwork;
        }

        if (result?.isPending) {
          currentGenre.pending_songs = result.songs;
        } else {
          // Always de-dupe against the live queue, not just the array returned by the finder.
          // The focused queue editor can outlive/re-render the hidden bulk editor, and using
          // only result.songs allowed stale rows to survive or be reintroduced.
          const isNestedLevelUpEdit = !!(result?.parent && result.parent.levelUp === target);
          if (isNestedLevelUpEdit) {
            // v72: a Level Up lives inside its parent song object, but the queue array only
            // contains the parent. The v69/v71 overwrite repair treated the child target as
            // if it were a top-level row and used the parent index, which promoted the Level
            // Up into its own row and broke the parent/child relationship. For nested edits,
            // the authoritative mutation is already result.parent.levelUp = target, so keep
            // the parent array intact and skip top-level duplicate repair.
            result.parent.levelUp = target;
            currentGenre.songs_listened = result?.songs || currentGenre.songs_listened || [];
          } else {
            if (confirmedMetadataMismatch && Number.isInteger(result?.index) && result.index >= 0) {
              // v74/v75: confirmed mismatches are intentional replacements of the selected row,
              // not normal duplicate/merge candidates. The old row text is supposed to differ
              // from the new Spotify metadata, so identity/text repair can append the updated
              // object while leaving the original row behind. Replace the concrete path/index
              // first, then only run conservative URL/Spotify/identity cleanup.
              currentGenre.songs_listened = replaceQueueTargetAtSelectedIndex(result?.songs || currentGenre.songs_listened || [], target, {
                index: result.index
              });
            } else {
              currentGenre.songs_listened = isQueueDrawerEdit
                ? forceOverwriteQueueTarget(result?.songs || currentGenre.songs_listened || [], target, {
                    index: result.index,
                    oldUrl,
                    oldIdentity,
                    oldSpotifyId,
                    newUrl: target.url || nextUrl,
                    newSpotifyId: target.spotifyId || '',
                    oldTextKey,
                    newTextKey: queueDuplicateTextKey(target),
                    confirmedMetadataMismatch
                  })
                : dedupeQueueSongsPreservingTarget(currentGenre.songs_listened || result?.songs || [], target, {
                    oldUrl,
                    oldIdentity,
                    oldSpotifyId,
                    newUrl: target.url || nextUrl,
                    newSpotifyId: target.spotifyId || '',
                    oldTextKey,
                    newTextKey: queueDuplicateTextKey(target),
                    forceTextDedupe: false
                  });
              currentGenre.songs_listened = repairQueueAfterAuthoritativeUrlOverwrite(currentGenre.songs_listened, target, {
                oldUrl,
                oldIdentity,
                oldSpotifyId,
                oldTextKey,
                newUrl: target.url || nextUrl,
                newSpotifyId: target.spotifyId || '',
                newTextKey: queueDuplicateTextKey(target),
                confirmedMetadataMismatch
              });
            }
          }
          restoreUneditedIdentityQueueState(currentGenre, identityQueueSnapshotBeforeEdit, target, editedIdentityKeyBeforeOverwrite);
          syncSongsBulkEditorFromModel();
          window.__dailyGenreSuppressBulkSongSyncUntil = Date.now() + 60000;
          window.__dailyGenreQueueModelAuthoritativeUntil = Date.now() + 60000;
        }

        removeLoggedSongsFromPending(currentGenre);
        // v174: Keep the focused song carousel on the edited row after a URL overwrite.
        // URL edits can change the row's identity key, so the old stored focus key no
        // longer matches after the re-render and the song carousel falls back to item 1.
        // Store the new identity key before rebuilding, then explicitly restore it after
        // the screen has been refreshed.
        const nextFocusKey = (() => {
          try {
            return typeof songIdentity === 'function' ? songIdentity(target) : '';
          } catch (_) {
            return '';
          }
        })();
        try {
          if (nextFocusKey && currentGenre) {
            safeStorageSet(`dailyGenreSongFocusKey:${currentGenre.id || currentGenre.genre || 'unknown'}`, nextFocusKey);
          }
        } catch (_) {}
        const restore = preserveScrollSnapshot();
        loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
        applyDetailEditMode(detailEditMode);
        restore();
        try {
          if (nextFocusKey && typeof window.setSongFocus === 'function') {
            setTimeout(() => window.setSongFocus(nextFocusKey), 0);
          } else if (typeof window.enhanceSongListeningExperience === 'function') {
            setTimeout(() => window.enhanceSongListeningExperience(), 0);
          }
        } catch (_) {}
        markListeningUpdatePending();
        if (metadataWarning) {
          console.warn('Track URL updated with metadata warning:', metadataWarning);
          const recovered = /recovered from Spotify embed/i.test(metadataWarning);
          showSaveToast(recovered
            ? 'URL saved and artwork recovered from Spotify embed — use Save to keep it.'
            : `URL saved, but Spotify metadata did not refresh: ${metadataWarning}`,
            !recovered);
        } else {
          showSaveToast('URL / overrides applied — use the floating Save button to keep them.', false);
        }
      } catch (err) {
        console.error('Track URL update failed', err);
        showSaveToast(`Track update failed: ${err?.message || err || 'Unknown error'}`, true);
      } finally {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.classList.remove('is-saving');
          button.textContent = oldButtonText || 'Apply URL / Overrides';
        }
      }
    }

    function removeTrackFromCard(encodedKey, pendingIndex, path = '') {
      if (!currentGenre) return;

      const isPendingRemove = Number.isInteger(pendingIndex) && pendingIndex >= 0;
      if (isPendingRemove) {
        // Removing a pending song: just delete it (no loop-back needed)
        if (!window.confirm('Remove this pending nomination? It will be permanently deleted from this genre.')) return;
        const pending = normalizePendingSongs(currentGenre.pending_songs || []);
        pending.splice(pendingIndex, 1);
        currentGenre.pending_songs = pending;
        loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
        markListeningUpdatePending();
        showSaveToast('Pending nomination removed — use the floating Save button to keep it.', false);
        return;
      }

      // Removing an official song: send it back to pending for re-review
      if (!window.confirm('Remove this track and send it back to Pending for re-review? You can suggest another genre from there.')) return;

      syncBulkDraftIntoSongModel();
      const result = findEditableSongTarget(encodedKey, -1, path);
      if (!result) {
        showSaveToast('That song changed or was malformed. Reopen the card and try again.', true);
        return;
      }

      const removedSong = result.song;

      if (result.parent) {
        result.parent.levelUp = null;
      } else {
        result.songs.splice(result.index, 1);
      }
      currentGenre.songs_listened = result.songs;

      // Queue removed song back into this genre's pending list for re-review
      currentGenre.pending_songs = normalizePendingSongs(currentGenre.pending_songs || []);
      const alreadyPending = currentGenre.pending_songs.some(p => songIdentity(p) === songIdentity(removedSong));
      if (!alreadyPending) {
        currentGenre.pending_songs.push({
          url: removedSong.url || '',
          score: removedSong.score ?? null,
          reason: removedSong.reason || '',
          title: removedSong.title || '',
          artist: removedSong.artist || '',
          artwork: removedSong.artwork || '',
          source: removedSong.source || '',
          spotifyId: removedSong.spotifyId || '',
          spotifyUrl: removedSong.spotifyUrl || '',
          album: removedSong.album || '',
          artists: Array.isArray(removedSong.artists) ? removedSong.artists.slice() : [],
          durationMs: removedSong.durationMs || null,
          isrc: removedSong.isrc || '',
          releaseDate: removedSong.releaseDate || '',
          releaseYear: removedSong.releaseYear || null,
          releasePrecision: removedSong.releasePrecision || '',
          releaseSource: removedSong.releaseSource || '',
          spotifyMetadataFetched: !!removedSong.spotifyMetadataFetched,
          spotifyMetadataFetchedAt: removedSong.spotifyMetadataFetchedAt || '',
          added: removedSong.added || new Date().toISOString().slice(0,10),
          isPending: true,
          pendingFrom: currentGenre.genre || '',
          originFit: removedSong.score != null ? Number(removedSong.score) : null,
          nominatedFit: null,
          isLevelUp: false,
          isAdd: false,
          levelUp: null
        });
      }

      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      markListeningUpdatePending();
      showSaveToast('Track moved to Pending — assign a genre and click Save Listening Updates.', false);
    }
    
    function setPendingNominationFit(index, value) {
      if (!currentGenre) return;
      const pending = normalizePendingSongs(getPendingSongs(currentGenre));
      if (!pending[index]) return;
      pending[index].nominatedFit = Number(value);
      currentGenre.pending_songs = pending;
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      markListeningUpdatePending();
    }


    /* Daily Genre v223: stable parent-key Level Up anchoring prevents identity saves from reattaching children.
       Level Up children need a stable parent anchor.
       Older saves inferred the parent from the previous row in the flattened
       textarea/JSON list. Genre DNA sync and identity backfills can rewrite or
       dedupe top-level rows, which made a child attach to whatever song happened
       to be immediately above it. Stamp the intended parent on every child and
       prefer that explicit parent during inflation. */
    function levelUpParentAnchorKey(song) {
      if (!song) return '';
      try {
        const key = songIdentity(song);
        if (key && key !== 'meta:|') return key;
      } catch (_) {}
      const artist = String(song.artist || (Array.isArray(song.artists) ? song.artists.join(', ') : '') || '').trim().toLowerCase();
      const title = String(song.title || song.name || '').trim().toLowerCase();
      const url = normalizeSongUrl(song.url || song.spotifyUrl || '').trim().toLowerCase();
      if (url) return `url:${url}`;
      return `meta:${artist}|${title}`;
    }

    function levelUpParentAnchorKeys(song) {
      const keys = [];
      ['__levelUpParentKey','levelUpParentKey','levelUpForKey'].forEach(field => {
        const value = String(song?.[field] || '').trim();
        if (value) keys.push(value);
      });
      const title = String(song?.levelUpParentTitle || song?.levelUpForTitle || '').trim().toLowerCase();
      const artist = String(song?.levelUpParentArtist || song?.levelUpForArtist || '').trim().toLowerCase();
      const url = normalizeSongUrl(song?.levelUpParentUrl || song?.levelUpForUrl || '').trim().toLowerCase();
      if (url) keys.push(`url:${url}`);
      if (title || artist) keys.push(`meta:${artist}|${title}`);
      return [...new Set(keys.filter(Boolean))];
    }

    function stampLevelUpParent(child, parent) {
      if (!child || !parent) return child;
      const key = levelUpParentAnchorKey(parent);
      if (key) {
        child.__levelUpParentKey = key;
        child.levelUpParentKey = key;
      }
      child.levelUpParentTitle = parent.title || parent.name || '';
      child.levelUpParentArtist = parent.artist || (Array.isArray(parent.artists) ? parent.artists.join(', ') : '') || '';
      child.levelUpParentUrl = normalizeSongUrl(parent.url || parent.spotifyUrl || '');
      return child;
    }
    window.stampLevelUpParent = stampLevelUpParent;

    function levelUpChildMatchesParent(child, parent) {
      if (!child || !parent) return false;
      const childKeys = levelUpParentAnchorKeys(child);
      if (!childKeys.length) return false;
      const parentKeys = [levelUpParentAnchorKey(parent), ...songIdentityKeys(parent)].filter(Boolean);
      return childKeys.some(key => parentKeys.includes(key));
    }

    function inflateSongsFromStorage(arr) {
      const inflated = [];
      normalizeSongsListened(arr || []).forEach(song => {
        song.url = normalizeSongUrl(song.url);
        if (song.isLevelUp) {
          song.isLevelUp = true;
          song.isAdd = false;
          // Prefer the explicit v223 parent key. Fall back to the immediately
          // previous top-level row only for older data with no parent metadata.
          let parent = inflated.find(candidate => levelUpChildMatchesParent(song, candidate));
          if (!parent && inflated.length) parent = inflated[inflated.length - 1];
          if (parent) {
            stampLevelUpParent(song, parent);
            parent.levelUp = song;
            return;
          }
          // Orphaned Level Up rows should not silently attach to the wrong song.
          song.isLevelUp = false;
        }
        if (song.levelUp) stampLevelUpParent(song.levelUp, song);
        inflated.push(song);
      });
      knownInflatedOfficialSongArrays.add(inflated);
      return inflated;
    }

    function normalizePendingSongs(arr) {
      const unique = [];
      const seen = new Set();
      normalizeSongsListened(arr || []).forEach(song => {
        song.url = normalizeSongUrl(song.url);
        song.isPending = true;
        song.isLevelUp = false;
        song.isAdd = false;
        song.levelUp = null;

        const keys = songIdentityKeys(song);
        const duplicate = keys.some(key => seen.has(key));
        if (duplicate) return;

        keys.forEach(key => seen.add(key));
        unique.push(song);
      });
      return unique;
    }
    
    function countSongsForDisplay(arr) {
      return normalizeSongsListened(arr || []).reduce((total, song) => total + 1 + (song.levelUp ? 1 : 0), 0);
    }

    function cleanSongForSave(song, isLevelUp) {
      const out = { ...(song || {}) };
      delete out.levelUp;
      out.url = normalizeSongUrl(out.url);
      out.title = cleanPastedCitationArtifacts(out.title || '');
      out.artist = cleanPastedCitationArtifacts(out.artist || '');
      out.reason = cleanPastedCitationArtifacts(out.reason || '');
      delete out.isPending;
      delete out.pendingFrom;
      if (isLevelUp) {
        out.url = `🔼 LEVEL UP: ${out.url}`;
        out.isLevelUp = true;
        delete out.isAdd;
      } else if (out.isAdd) {
        out.url = `🔼 ADD: ${out.url}`;
        out.isAdd = true;
        delete out.isLevelUp;
      } else {
        delete out.isLevelUp;
        delete out.isAdd;
      }
      if (out.title === '') delete out.title;
      if (out.reason === '') delete out.reason;
      if (out.listenerNote === '') delete out.listenerNote;
      if (out.songNote === '') delete out.songNote;
      if (out._pendingGenreTag === '') delete out._pendingGenreTag;
      return out;
    }

    function flattenSongsForStorage(arr) {
      const flat = [];
      inflateSongsFromStorage(arr || []).filter(song => !song.isPending).forEach(song => {
        flat.push(cleanSongForSave(song, false));
        if (song.levelUp) {
          const childForSave = { ...(song.levelUp || {}) };
          stampLevelUpParent(childForSave, song);
          flat.push(cleanSongForSave(childForSave, true));
        }
      });
      return flat;
    }

    function pendingSongsForStorage(arr) {
      return normalizePendingSongs(arr || []).map(song => {
        const out = { ...song, isPending: true };
        out.title = cleanPastedCitationArtifacts(out.title || '');
        out.artist = cleanPastedCitationArtifacts(out.artist || '');
        out.reason = cleanPastedCitationArtifacts(out.reason || '');
        delete out.isLevelUp;
        delete out.isAdd;
        delete out._pendingGenreTag;
        delete out.levelUp;
        if (out.title === '') delete out.title;
        if (out.reason === '') delete out.reason;
        if (out.listenerNote === '') delete out.listenerNote;
        if (out.songNote === '') delete out.songNote;
        return out;
      });
    }

    function genresForSave() {
      return genres.map(g => {
        const out = { ...g };
        if (Array.isArray(out.songs_listened)) out.songs_listened = flattenSongsForStorage(out.songs_listened);
        if (Array.isArray(out.pending_songs)) out.pending_songs = pendingSongsForStorage(out.pending_songs);
        return out;
      });
    }
    
    function songTitleWithEditionMarkup(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      const metaWords = '(?:b\s*[-–—]?\s*side|remaster(?:ed)?|radio edit|single edit|album version|extended mix|club mix|original mix|vinyl|mono|stereo|live(?:\s+(?:at|from|in|on|@))?|live recording|demo|bonus track|explicit|clean|edit|version|alternate(?:\s+take)?|alt(?:\.|ernate)?\s+version|acoustic|session|take\s+\d+|anniversary|concert|soundtrack|ost|mono|stereo|\b(?:19|20)\d{2}\b|dino synth|dungeon synth|feat\.?|ft\.?|featuring)';
      const patterns = [
        /^(.*?)(\s*(?:\((?:feat\.?|ft\.?|featuring)\s+[^)]{1,120}\)|\[(?:feat\.?|ft\.?|featuring)\s+[^\]]{1,120}\])\s*)$/i,
        // Multiple trailing parentheticals/brackets are almost always metadata: (B-Side) (2019) (Dino Synth, Dungeon Synth).
        /^(.*?)(\s*(?:\([^)]{1,90}\)|\[[^\]]{1,90}\])(?:\s*(?:\([^)]{1,90}\)|\[[^\]]{1,90}\]))+\s*)$/i,
        new RegExp('^(.*?)(\\s*(?:\\([^)]*' + metaWords + '[^)]*\\)|\\[[^\\]]*' + metaWords + '[^\\]]*\\])\\s*)$', 'i'),
        new RegExp('^(.*?)(\\s+(?:-|–|—)\\s*' + metaWords + '\\b.*)$', 'i'),
      ];
      for (const re of patterns) {
        const match = text.match(re);
        if (match && match[1] && match[2] && match[1].trim().length >= 2) {
          return `${escapeHtml(match[1].trim())}<span class="song-title-edition">${escapeHtml(match[2].trim())}</span>`;
        }
      }
      return escapeHtml(text);
    }

    function renderSongEntry(s, isChild, options = {}) {
      const rawUrl = normalizeSongUrl(s.url || s.spotifyUrl || '');
      const hasHref = /^https?:\/\//i.test(rawUrl);
      const source = songUrlSource(rawUrl || s.spotifyUrl || '');
      const defaultTitle = source === 'spotify' ? 'Spotify track' : (source === 'youtube' ? 'YouTube track' : (hasHref ? 'Track' : 'Linked track'));
      const titleText = songTitleWithEditionMarkup(s.title || defaultTitle);
      const href = escapeHtml(rawUrl);
      const pendingIndex = Number.isInteger(options.pendingIndex) ? options.pendingIndex : null;
      const originFit = s.originFit != null ? Number(s.originFit) : (s.isPending && s.score != null ? Number(s.score) : null);
      const nominatedFit = s.nominatedFit != null ? Number(s.nominatedFit) : null;
      const scoreBadge = s.isPending
        ? `<span class="song-theme-badge pending-fit" title="Theme fit: source genre to this genre">${originFit != null ? originFit : '?'}/5 → ${nominatedFit != null ? nominatedFit : '?'}/5</span>`
        : (s.score != null ? `<span class="song-theme-badge ${Number(s.score) <= 2 ? 'low' : ''}" title="Theme fit for this genre">${s.score}/5</span>` : '');
      const reasonHtml = s.reason ? `<div class="song-reason">${escapeHtml(s.reason)}</div>` : '';
      const showArtwork = !!s.artwork;
      const art = showArtwork ? artworkHtml(s.artwork, 'song-artwork', s.title || 'Album art') : '';
      const sourceBadge = sourceBadgeHtml(source);
      const titleHtml = hasHref
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="song-title-link">${titleText}${sourceBadge}<span class="song-link-arrow">↗</span></a>${spPlayBtn(s)}`
        : `<span class="song-title-link">${titleText}${sourceBadge}</span>${spPlayBtn(s)}`;
      const addBadge = (!isChild && s.isAdd)
        ? `<div class="add-badge"><span class="add-badge-icon">\uFF0B</span><span>Add</span></div>`
        : (!isChild && s.isPromote)
        ? `<div class="promote-badge"><span class="promote-badge-icon">🔼</span><span>Promote</span></div>`
        : '';
      const pendingNote = s.isPending
        ? `<div class="pending-origin-line">⏳ Nominated from <em>${escapeHtml(s.pendingFrom || 'source unavailable')}</em></div>
           ${pendingIndex != null ? `<div class="pending-fit-tools"><span class="pending-fit-label">Fit here</span>${[1,2,3,4,5].map(n => `<button type="button" class="pending-fit-btn ${Number(nominatedFit) === n ? 'active' : ''}" onclick="setPendingNominationFit(${pendingIndex}, ${n})">${n}</button>`).join('')}<button class="btn-inline" onclick="promotePendingSong(${pendingIndex})">Promote</button><button class="btn-inline btn-inline-danger" onclick="removePendingSong(${pendingIndex})">Remove</button></div>` : ''}`
        : '';
      const promotedNote = (!s.isPending && s.promotedFrom)
        ? `<div class="promoted-origin-line">⏳ Promoted from <em>${escapeHtml(s.promotedFrom)}</em>${s.promotedFromFit != null && s.score != null ? ` · theme fit ${s.promotedFromFit}/5 → ${s.score}/5` : ''}</div>`
        : '';
      const spotifyFacts = [];
      if (s.album) spotifyFacts.push(escapeHtml(s.album));
      if (s.releaseYear) spotifyFacts.push(`Released ${escapeHtml(String(s.releaseYear))}`);
      if (s.durationMs) spotifyFacts.push(formatTrackDuration(s.durationMs));
      if (s.releaseSource) spotifyFacts.push(escapeHtml(s.releaseSource));
      const releaseNote = (!s.isPending && spotifyFacts.length)
        ? `<div class="song-metadata-line">${spotifyFacts.join(' · ')}</div>`
        : '';
      const canShowTrackTools = options.allowTrackEdit === true || (!s.isPending && options.allowTrackEdit !== false);
      const levelUpHtml = (!isChild && s.levelUp)
        ? `<div class="alt-take-wrap"><div class="alt-take-label"><span class="alt-take-icon">\u21B3</span><span>Alt Take</span></div>${renderSongEntry(s.levelUp, true, { allowTrackEdit: canShowTrackTools, songIndex: options.songIndex, childKey: 'levelUp' })}</div>`
        : '';
      const favBtn = '';
      const encodedKey = encodeSongKeyForInline(s);
      const editPendingIndex = Number.isInteger(pendingIndex) ? pendingIndex : -1;
      const songPath = Number.isInteger(options.songIndex) ? `song:${options.songIndex}${options.childKey ? `.${options.childKey}` : ''}` : '';
      const encodedPath = encodeURIComponent(songPath).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
      const pendingSongNote = currentGenre ? pendingSongNoteFor(currentGenre, s, songPath, editPendingIndex) : '';
      const savedSongNote = s.listenerNote || s.songNote || '';
      const savedSongNoteHtml = savedSongNote ? `<div class="song-listener-note"><strong>Note:</strong> ${escapeHtml(savedSongNote)}</div>` : '';
      const pendingSongNoteHtml = pendingSongNote ? `<div class="song-pending-note-preview"><strong>Pending note:</strong> ${escapeHtml(pendingSongNote)}</div>` : '';
      const noteEditorHtml = canShowTrackTools
        ? `<details class="song-note-editor" ${pendingSongNote ? 'open' : ''}><summary>${pendingSongNote ? 'Edit pending note' : 'Add short note'}</summary><div class="song-note-body"><textarea data-song-note-input maxlength="320" placeholder="Short listening note for this song…">${escapeHtml(pendingSongNote)}</textarea><div class="song-note-actions"><button type="button" class="btn btn-secondary" onclick="savePendingSongNoteFromCard('${encodedKey}', ${editPendingIndex}, '${encodedPath}', this)">Stage Note</button>${pendingSongNote ? `<button type="button" class="btn btn-danger" onclick="clearPendingSongNoteFromCard('${encodedKey}', ${editPendingIndex}, '${encodedPath}', this)">Clear Pending Note</button>` : ''}</div><div class="track-card-edit-note">Staged locally. Save Listening Updates will roll this up and persist it.</div></div></details>`
        : '';
      const canSpotifyRefresh = !s.isPending && (/spotify\.com\/track\//i.test(rawUrl || s.spotifyUrl || '') || /^spotify:track:/i.test(rawUrl || s.spotifyUrl || ''));
      const trackEditHtml = canShowTrackTools
        ? `<details class="track-card-editor"><summary>Edit / refresh track</summary><div class="track-card-edit-body"><input type="url" data-track-url-input value="${escapeHtml(rawUrl)}" placeholder="Paste Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track URL"><div class="track-card-manual-meta"><input type="text" data-track-title-input value="${escapeHtml(s.title || '')}" placeholder="Override title if YouTube/Apple title is messy"><input type="text" data-track-artist-input value="${escapeHtml(s.artist || (Array.isArray(s.artists) ? s.artists.join(', ') : ''))}" placeholder="Override artist/channel if needed"></div><div class="track-card-edit-actions"><button type="button" class="btn btn-primary" onclick="updateTrackUrlFromCard('${encodedKey}', ${editPendingIndex}, this, '${encodedPath}')">Apply URL / Overrides</button>${canSpotifyRefresh ? `<button type="button" class="btn btn-secondary" onclick="refreshGenrePageSpotifyTrack('${encodedKey}', this, '${encodedPath}')">Refresh Spotify</button>` : ''}<button type="button" class="btn btn-danger" onclick="removeTrackFromCard('${encodedKey}', ${editPendingIndex}, '${encodedPath}')">Remove from genre</button></div><div class="track-card-edit-note">Update accepts Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track links. Optional title/artist overrides replace messy YouTube or Apple metadata. Use the floating Save button to persist.</div></div></details>`
        : '';
      const reactionStaged = currentGenre && stagedQueueReactionKeys.has(stagedReactionKey(currentGenre.id, songIdentity(s)));
      const isFavorite = currentGenre && isSameFavoriteSong(currentGenre, s);
      const reactionHtml = !s.isPending
        ? `<div class="song-reaction"><span class="song-reaction-label">How did this track hit?</span>
            <div class="song-quick-actions">
              <button type="button" class="song-reaction-btn ${Number(s.reaction) === 3 ? 'active' : ''}" onclick="setSongReaction('${encodedKey}', 3)" title="I Fuck With This" aria-label="I Fuck With This"><span class="reaction-emoji">👍</span></button>
              <button type="button" class="song-reaction-btn ${Number(s.reaction) === 2 ? 'active' : ''}" onclick="setSongReaction('${encodedKey}', 2)" title="Meh, It’s Fine" aria-label="Meh, It’s Fine"><span class="reaction-emoji">🤷</span></button>
              <button type="button" class="song-reaction-btn ${Number(s.reaction) === 1 ? 'active' : ''}" onclick="setSongReaction('${encodedKey}', 1)" title="Fuck Off" aria-label="Fuck Off"><span class="reaction-emoji">👎</span></button>
              <button type="button" class="song-favorite-btn ${isFavorite ? 'active' : ''}" onclick="makeSongFavorite('${encodedKey}')" title="${isFavorite ? 'Remove favorite track' : 'Make favorite track'}" aria-label="${isFavorite ? 'Remove favorite track' : 'Make favorite track'}">🏆</button>
              ${reactionStaged ? '<span class="song-reaction-unsaved">Unsaved</span>' : ''}
            </div>
           </div>`
        : '';
      return `<div class="song-card ${isChild ? 'song-card-alt' : ''} ${s.isAdd ? 'song-card-add' : (s.isPromote ? 'song-card-promote' : '')} ${s.isPending ? 'song-card-pending' : ''} ${(!isChild && s.score != null && Number(s.score) <= 2) ? 'song-card-dim' : ''} ${(!isChild && !s.isPending && currentGenre && normalizeSongUrl(currentGenre.favoritesongurl||'') === rawUrl) ? 'song-card-favorite' : ''}">${addBadge}<div class="song-card-row ${showArtwork ? '' : 'no-art'}">${art}<div style="min-width:0;">${titleHtml}${songArtistLine(s)}</div><div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">${scoreBadge}${favBtn}${canShowTrackTools ? `<button type="button" class="song-remove-btn" title="Remove from genre" onclick="removeTrackFromCard('${encodedKey}', ${editPendingIndex}, '${encodedPath}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}</div></div>${reasonHtml}${releaseNote}${promotedNote}${pendingNote}${savedSongNoteHtml}${pendingSongNoteHtml}${reactionHtml}${noteEditorHtml}${trackEditHtml}${levelUpHtml}</div>`;
    }
    function buildDiscordBlock() {
      if (!currentGenre) return '';
      const includeSongs = !!document.getElementById('includeSongsToggle')?.checked;
      const rawDate = dateValue(currentGenre) || new Date().toISOString().slice(0,10);
      const dateStr = new Date(rawDate + 'T00:00:00').toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'2-digit'});
      const lines = [];
      lines.push(`Today's Genre (${dateStr}) is..... **${String(currentGenre.genre || 'UNKNOWN').toUpperCase()}**`);
      if (currentGenre.vibe) lines.push(`${genreEmoji(currentGenre)} *Vibe: ${currentGenre.vibe}*`);
      if (currentGenre.summary) lines.push(String(currentGenre.summary).trim());
      if (currentGenre.key_artists) lines.push(`🎤 Key Artists: ${currentGenre.key_artists}`);
      const categoryText = currentGenre.category_path || categoryLine(currentGenre);
      if (categoryText) lines.push(`🗂️ ${categoryText}`);
      if (includeSongs && currentGenre.suggested_songs) {
        const songs = String(currentGenre.suggested_songs).split(',').map(s => s.trim()).filter(Boolean);
        if (songs.length) lines.push(`🎶 Suggested Songs:\n${songs.map(s => `• ${s}`).join('\n')}`);
      }
      return lines.filter(Boolean).join('\n\n').trim();
    }
    window.buildDiscordBlock = buildDiscordBlock;

    function mountDiscordShareSection() {
      const share = document.getElementById('shareSection');
      const slot = document.getElementById('discordShareSlot');
      if (share && slot && share.parentElement !== slot) {
        slot.appendChild(share);
      }
    }

    function updateDiscordBlock() {
      mountDiscordShareSection();
      const block = document.getElementById('discordBlock');
      if (block) block.value = buildDiscordBlock();
    }

    function renderStars() {
      const starsEl = document.getElementById('ratingStars');
      starsEl.innerHTML = [1,2,3,4,5].map(n =>
        `<button class="star-btn ${String(n) === String(selectedRating) ? 'active' : ''}" data-rating="${n}" aria-label="${n} stars">★</button>`
      ).join('');

      [...starsEl.querySelectorAll('.star-btn')].forEach(btn => {
        btn.onclick = () => {
          if (!currentGenre) return;
          selectedRating = btn.dataset.rating;
          const newlyDated = setListenDateTodayIfNeeded(currentGenre);
          currentGenre.rating = selectedRating;
          currentGenre.status = 'listened';
          // v208: keep setup-editor stars responsive without rebuilding the heavy
          // listen screen. A later navigation/save can do the full render.
          repaintGenreRatingAfterInput(selectedRating);
          markDirty();
          showSaveToast(newlyDated
            ? `Rated ${selectedRating}★ and marked as listened today — click Save Changes to keep it.`
            : `Rating updated to ${selectedRating}★ — click Save Changes to keep it.`, false);
        };
      });

      document.getElementById('ratingStatus').textContent =
        currentGenre?.rating === 'zanger' ? 'Marked as Zanger' :
        selectedRating ? `${selectedRating} star${selectedRating === '1' ? '' : 's'} selected` :
        'No rating selected';
    }

    function setFavoriteSong(btn) {
      if (!currentGenre) return;
      const url = btn.dataset.favUrl || '';
      const title = btn.dataset.favTitle || '';
      const artist = btn.dataset.favArtist || '';
      const artwork = btn.dataset.favArtwork || '';
      const isSame = normalizeSongUrl(currentGenre.favoritesongurl || '') === url;
      if (isSame) {
        currentGenre.favoritesongurl = '';
        currentGenre.favoritesong = '';
        currentGenre.favoriteartist = '';
        currentGenre.favoritesongartwork = '';
      } else {
        currentGenre.favoritesongurl = url;
        currentGenre.favoritesong = title;
        currentGenre.favoriteartist = artist;
        currentGenre.favoritesongartwork = artwork;
      }
      const favUrlInput = document.getElementById('favoriteSongUrl');
      const favTitleInput = document.getElementById('favoriteSong');
      if (favUrlInput) favUrlInput.value = currentGenre.favoritesongurl || '';
      if (favTitleInput) favTitleInput.value = currentGenre.favoritesong || '';
      markDirty();
      loadListenScreen(currentGenre, { preserveDirty: true });
    }


    function localIsoDateToday() {
      const now = new Date();
      return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('-');
    }

    function setListenDateTodayIfNeeded(genre) {
      if (!genre) return false;
      if (dateValue(genre)) return false;
      genre.date_normalized = localIsoDateToday();
      genre.datenormalized = '';
      return true;
    }

    function markGenreInProgressForToday(genre = currentGenre, options = {}) {
      if (!genre) return false;
      setListenDateTodayIfNeeded(genre);
      genre.status = 'in_progress';
      genre.rating = '';
      genre.rank_order = null;
      selectedRating = '';
      try {
        if (typeof markListeningUpdatePending === 'function') markListeningUpdatePending();
        else { markDirty(); toggleLibrarySaveButton(true); }
      } catch (_) {
        try { markDirty(); } catch (__) {}
      }
      if (options.fromSpin) {
        setTimeout(() => showSaveToast('Set as today’s genre and marked in progress — use Save to persist it.', false), 80);
      }
      try { if (!appPassword) setTimeout(() => promptLibrarySaveLogin(), 120); } catch (_) {}
      return true;
    }
    window.markGenreInProgressForToday = markGenreInProgressForToday;

    function markAsZangerToday(genre = currentGenre) {
      if (!genre) return;
      const onDetailPage = currentGenre === genre && document.getElementById('screen-listen')?.classList.contains('active');
      if (!onDetailPage) openGenreDetail(genre, true);
      setListenDateTodayIfNeeded(genre);
      genre.rating = 'zanger';
      genre.status = 'veto';
      genre.rank_order = null;
      selectedRating = '';
      loadListenScreen(genre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(true);
      markDirty();
      showSaveToast('Zanger logged for today — click Save Changes to keep it.', false);
    }

async function prepareAndSaveCurrentGenre(options = {}) {
      if (!currentGenre) {
        alert('Choose a genre first.');
        return;
      }
      const identitySnapshot = snapshotGenreIdentityData(currentGenre);
      const markListened = !!options.markListened;
      const alreadyListened = !!dateValue(currentGenre);

      currentGenre.rating = currentGenre.rating === 'zanger' ? 'zanger' : (selectedRating || currentGenre.rating || '');
      const favoriteSongInput = document.getElementById('favoriteSong');
      const favoriteSongUrlInput = document.getElementById('favoriteSongUrl');
      if (favoriteSongInput) currentGenre.favoritesong = favoriteSongInput.value.trim();
      if (favoriteSongUrlInput) currentGenre.favoritesongurl = favoriteSongUrlInput.value.trim();
      if (currentGenre.favoritesongurl && currentGenre.favoritesongurl.includes('spotify.com/track/')) {
        const officialFavorite = await fetchSpotifyTrackMetadata(currentGenre.favoritesongurl);
        if (officialFavorite) {
          currentGenre.favoritesong = officialFavorite.title || currentGenre.favoritesong || '';
          currentGenre.favoriteartist = officialFavorite.artist || currentGenre.favoriteartist || '';
          currentGenre.favoritesongartwork = officialFavorite.artwork || currentGenre.favoritesongartwork || '';
        } else {
          const favData = await fetchSpotifyOembed(currentGenre.favoritesongurl);
          if (favData) {
            const raw = favData.title || '';
            const clean = raw.split(/[·\u2013\u2014]/)[0].trim() || raw;
            if (!currentGenre.favoritesong && clean) currentGenre.favoritesong = clean;
            if (favData.author_name) currentGenre.favoriteartist = favData.author_name;
            if (favData.thumbnail_url) currentGenre.favoritesongartwork = favData.thumbnail_url;
          }
        }
      }
      currentGenre.monthlycontender = document.getElementById('monthlyContender').checked;
      currentGenre.monthfavorite = document.getElementById('monthFavorite').checked;
      currentGenre.monthleastfavorite = document.getElementById('monthLeastFavorite').checked;
      currentGenre.notes = document.getElementById('notes').value.trim();

      const previousOfficial = inflateSongsFromStorage(currentGenre.songs_listened || []).filter(song => !song.isPending);
      let resolvedOfficial = previousOfficial;
      let identityDuplicateSkips = [];
      if (queueModelIsAuthoritative() && !options.overwriteSongs) {
        // A recent inline queue edit is the source of truth. Do not reparse a stale
        // bulk textarea during setup/save, or earlier URL corrections can disappear.
        syncSongsBulkEditorFromModel();
      } else {
        const parsedFromBulk = normalizeSongsListened(parseSongLinks(document.getElementById('songsListenedBulk').value));
        const parsedOfficial = mergeSongMetadata(parsedFromBulk, previousOfficial);
        resolvedOfficial = await resolveSpotifyTitles(parsedOfficial);
        resolvedOfficial = reattachParsedLevelUpRelationships(resolvedOfficial, parsedOfficial);
        // v226: if Genre Identity was loaded first, Seminal/Media tracks already
        // have their own listenable DNA lane. Do not add a duplicate queue row
        // when recommendations later include the same track; keep existing queue
        // rows in place when they were already there before the song save.
        const identityFiltered = filterNewSongsAlreadyRepresentedByGenreIdentity(resolvedOfficial, previousOfficial, currentGenre);
        resolvedOfficial = identityFiltered.songs;
        identityDuplicateSkips = identityFiltered.skipped || [];
      }
      currentGenre.songs_listened = resolvedOfficial;
      restoreGenreIdentityData(currentGenre, identitySnapshot);
      if (options.overwriteSongs) {
        // v228: after a song overwrite, keep Genre Identity tracks listenable:
        // matching rows are badged in place and missing anchors are appended.
        try {
          if (window.DailyGenreIdentity?.ensureIdentityTracksInSongQueue) window.DailyGenreIdentity.ensureIdentityTracksInSongQueue(currentGenre, false);
          else window.DailyGenreIdentity?.syncIdentityTracksToSongQueue?.(currentGenre, false);
        } catch (_) {}
      }
      currentGenre.pending_songs = normalizePendingSongs(getPendingSongs(currentGenre));
      removeLoggedSongsFromPending(currentGenre);
      processPendingNominationsForGenre(currentGenre);

      const identitySkippedNotice = identitySkipNotice(identityDuplicateSkips);
      if (identitySkippedNotice) {
        showSaveToast(identitySkippedNotice, false);
      }

      if (markListened && !dateValue(currentGenre)) {
        currentGenre.date_normalized = new Date().toISOString().slice(0,10);
      }

      const completedListen = markListened || alreadyListened || !!dateValue(currentGenre);
      if (completedListen && dateValue(currentGenre)) {
        const currentMonthKey = (dateValue(currentGenre) || '').slice(0,7);
        if (currentMonthKey && (currentGenre.monthfavorite || currentGenre.monthleastfavorite)) {
          genres.forEach(g => {
            if (!g || g.id === currentGenre.id) return;
            if ((dateValue(g) || '').slice(0,7) !== currentMonthKey) return;
            if (currentGenre.monthfavorite) g.monthfavorite = false;
            if (currentGenre.monthleastfavorite) g.monthleastfavorite = false;
          });
        }

        if (currentGenre.rating === 'zanger') {
          currentGenre.status = 'veto';
          currentGenre.rank_order = null;
        } else {
          currentGenre.status = 'listened';
          if (currentGenre.rating) {
            if (!currentGenre.rank_order) {
              const sameTierCount = genres.filter(g => String(g.rating) === String(currentGenre.rating) && g.rating !== 'zanger' && g.id !== currentGenre.id).length;
              currentGenre.rank_order = sameTierCount + 1;
            }
            ensureRankOrderForRating(currentGenre.rating);
          }
        }
      } else {
        currentGenre.status = 'unlistened';
        currentGenre.rank_order = null;
        currentGenre.monthlycontender = false;
        currentGenre.monthfavorite = false;
        currentGenre.monthleastfavorite = false;
      }

      if (!appPassword) {
        pendingSaveAction = markListened ? 'mark_listened' : 'save';
        showSaveToast('Waiting for password…', false);
        openPasswordModal(pendingSaveAction);
        return;
      }

      try {
        await doSaveWithPassword(appPassword);
        updateRemainingCount();
        populateMonthFilter();
        const activeScreenId = document.querySelector('.screen.active')?.id || '';
        if (activeScreenId === 'screen-history') renderHistory();
        if (activeScreenId === 'screen-ranking') renderRankings();
        loadListenScreen(currentGenre, { preserveDirty: false });
        lastSavedListenSnapshot = buildListenSnapshot();
        setUnsavedState(false);
        showSaveToast(markListened ? `Saved. ${currentGenre.genre || 'Genre'} marked as listened today.` : `Saved changes to ${currentGenre.genre || 'genre'}.`, false);
      } catch (e) {
        if (e && (e.code === 'STALE_DATA' || e.code === 'NO_REVISION')) {
          showSaveToast('Newer data exists elsewhere — reload this page before saving.', true);
          return;
        }
        if (e && e.code === 'AUTH_FAILED') {
          appPassword = '';
          openPasswordModal(markListened ? 'mark_listened' : 'save');
          passwordNotice.textContent = 'That password did not work.';
          showSaveToast('Password not accepted.', true);
          return;
        }
        showSaveToast(`Save failed: ${e?.message || 'Unknown Worker error.'}`, true);
      }
    }

    function startListeningNow() {
      markCurrentGenreListened();
    }

    async function markCurrentGenreListened() {
      if (!currentGenre) return;
      await prepareAndSaveCurrentGenre({ markListened: true });
    }

    function genreHasListenMarkers(genre) {
      if (!genre) return false;
      const status = String(genre.status || '').trim().toLowerCase();
      const rating = String(genre.rating || '').trim().toLowerCase();
      return !!(
        dateValue(genre) ||
        genre.date ||
        genre.date_raw ||
        genre.dateraw ||
        status === 'listened' ||
        status === 'in_progress' ||
        status === 'in-progress' ||
        status === 'veto' ||
        status === 'zanger' ||
        rating === 'zanger' ||
        genre.monthlycontender ||
        genre.monthfavorite ||
        genre.monthleastfavorite
      );
    }

    function resetGenreListenMarkers(genre) {
      if (!genre) return;
      genre.date_normalized = '';
      genre.datenormalized = '';
      genre.date = '';
      genre.date_raw = '';
      genre.dateraw = '';
      genre.status = 'unlistened';
      genre.rating = '';
      genre.rank_order = null;
      genre.monthlycontender = false;
      genre.monthfavorite = false;
      genre.monthleastfavorite = false;
    }

    function unlistenCurrentGenre() {
      if (!currentGenre) return;
      const hadMarkers = genreHasListenMarkers(currentGenre);
      const okay = window.confirm(hadMarkers
        ? 'Return this genre to the unlistened spinner pool? Notes, songs, reactions, pending nominations, and Album Dive data will be kept.'
        : 'This genre already looks unlistened. Reset status and keep songs/notes anyway?');
      if (!okay) return;
      const formerRating = currentGenre.rating;
      resetGenreListenMarkers(currentGenre);
      selectedRating = '';
      if (formerRating && formerRating !== 'zanger') ensureRankOrderForRating(formerRating);
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      markDirty();
      showSaveToast('Genre reset to unlistened — click Save Changes to return it to the spinner.', false);
    }

    function promotePendingSongLegacy(url) {
      if (!currentGenre) return;
      const key = songIdentity({ url });
      const pending = normalizePendingSongs(getPendingSongs(currentGenre));
      const index = pending.findIndex(song => songIdentity(song) === key);
      if (index !== -1) promotePendingSong(index);
    }

    function removePendingSongLegacy(url) {
      if (!currentGenre) return;
      const key = songIdentity({ url });
      const pending = normalizePendingSongs(getPendingSongs(currentGenre));
      const index = pending.findIndex(song => songIdentity(song) === key);
      if (index !== -1) removePendingSong(index);
    }

    function getPendingSongs(genre) {
      if (!genre) return [];
      genre.pending_songs = normalizePendingSongs(genre.pending_songs || []);
      return genre.pending_songs;
    }

    function saveArchiveUiState() {
      archiveUiState = {
        archiveView,
        search: document.getElementById('archiveSearchInput')?.value || '',
        month: document.getElementById('historyMonthFilter')?.value || '',
        rating: document.getElementById('historyRatingFilter')?.value || '',
        flag: document.getElementById('archiveFlagFilter')?.value || '',
        sort: document.getElementById('archiveSortFilter')?.value || '',
        scrollY: window.scrollY || 0
      };
    }

    // Daily Genre v250: restore Archive state before one cache-aware render.
    function restoreArchiveUiState() {
      switchScreen('history', { skipRender: true });
      if (!archiveUiState) {
        renderNavigationScreen('history', renderHistory);
        return;
      }
      archiveView = archiveUiState.archiveView || archiveView;
      document.querySelectorAll('[data-archive-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.archiveView === archiveView));
      if (document.getElementById('archiveSearchInput')) document.getElementById('archiveSearchInput').value = archiveUiState.search || '';
      if (document.getElementById('historyMonthFilter')) document.getElementById('historyMonthFilter').value = archiveUiState.month || '';
      if (document.getElementById('historyRatingFilter')) document.getElementById('historyRatingFilter').value = archiveUiState.rating || '';
      if (document.getElementById('archiveFlagFilter')) document.getElementById('archiveFlagFilter').value = archiveUiState.flag || '';
      if (document.getElementById('archiveSortFilter')) document.getElementById('archiveSortFilter').value = archiveUiState.sort || 'newest';
      renderNavigationScreen('history', renderHistory);
      setTimeout(() => window.scrollTo({ top: archiveUiState.scrollY || 0, behavior: 'auto' }), 0);
    }

    function genreNavIsZanger(genre) {
      const status = String(genre?.status || '').trim().toLowerCase();
      const rating = String(genre?.rating || '').trim().toLowerCase();
      return status === 'veto' || status === 'zanger' || rating === 'zanger';
    }

    function genreNavDateValue(genre) {
      return String(dateValue(genre) || '').slice(0, 10);
    }

    function buildDetailNavList() {
      const source = (archiveCurrentItems && archiveCurrentItems.length) ? archiveCurrentItems.slice() : genres.slice();
      const dated = source.filter(g => genreNavDateValue(g));
      const undated = source.filter(g => !genreNavDateValue(g));
      const dates = [...new Set(dated.map(genreNavDateValue))].sort((a, b) => b.localeCompare(a));
      const ordered = [];

      dates.forEach(day => {
        const sameDay = dated
          .filter(g => genreNavDateValue(g) === day)
          .sort((a, b) => {
            const zangerDiff = Number(genreNavIsZanger(a)) - Number(genreNavIsZanger(b));
            if (zangerDiff) return zangerDiff;
            return String(a.genre || '').localeCompare(String(b.genre || ''));
          });
        ordered.push(...sameDay);
      });

      undated
        .sort((a, b) => String(a.genre || '').localeCompare(String(b.genre || '')))
        .forEach(g => ordered.push(g));

      detailNavList = ordered;
      return detailNavList;
    }

    function openAdjacentGenre(direction) {
      if (!currentGenre) return;
      const items = buildDetailNavList();
      const idx = items.findIndex(g => String(g.id) === String(currentGenre.id));
      if (idx === -1) return;
      // v184: Genre detail navigation is grouped by listen date, newest to oldest.
      // Back first walks through other genres for the same day, then the previous
      // day's non-zanger pick, then that day's zanger/veto rows. Next reverses it.
      const targetIndex = direction < 0 ? idx + 1 : idx - 1;
      const next = items[targetIndex];
      if (next) openGenreDetail(next, detailEditMode, { preserveScroll: true });
    }

    function promotePendingSong(index) {
      if (!currentGenre) return;
      const pending = normalizePendingSongs(getPendingSongs(currentGenre));
      const song = pending[index];
      if (!song) return;
      if (![1,2,3,4,5].includes(Number(song.nominatedFit))) {
        alert('Choose how well this song fits this genre before promoting it.');
        return;
      }
      const official = inflateSongsFromStorage(currentGenre.songs_listened || []).filter(s => !s.isPending);
      const key = songIdentity(song);
      if (!official.some(existing => songIdentity(existing) === key)) {
        const promoted = {
          ...song,
          score: Number(song.nominatedFit),
          isPromote: true,
          promotedFrom: song.pendingFrom || '',
          promotedFromFit: song.originFit != null ? Number(song.originFit) : (song.score != null ? Number(song.score) : null)
        };
        delete promoted.isPending;
        delete promoted.pendingFrom;
        delete promoted.originFit;
        delete promoted.nominatedFit;
        official.push(promoted);
      }
      pending.splice(index, 1);
      currentGenre.songs_listened = official;
      currentGenre.pending_songs = pending;
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      markDirty();
    }
    
    function removePendingSong(index) {
      if (!currentGenre) return;
      const pending = normalizePendingSongs(getPendingSongs(currentGenre));
      pending.splice(index, 1);
      currentGenre.pending_songs = pending;
      loadListenScreen(currentGenre, { preserveDirty: true });
      markDirty();
    }

    function clearPendingSongs() {
      if (!currentGenre) return;
      currentGenre.pending_songs = [];
      loadListenScreen(currentGenre, { preserveDirty: true });
      markDirty();
    }

    function renderLevelUpIntegrityPanel(genre) {
      const issues = levelUpIssuesForGenre(genre);
      if (!issues.length) return '';
      return `<div class="levelup-integrity-panel"><strong>Possible Level Up cleanup</strong><div class="small">Review these before saving if this genre was bulk-overwritten or imported from old annotations.</div><ul>${issues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
    }


    // Daily Genre v249: preserve the mounted genre screen on same-genre revisits.
    const mountedListenScreenCache =
      window.DailyGenreListenScreenCache?.createMountedListenScreenCache?.({
        getRevision: () => {
          try {
            const diagnostics = window.dailyGenreLibraryIndexDiagnostics?.();
            if (diagnostics?.revision != null) return diagnostics.revision;
          } catch {}
          return window.__dailyGenreLibraryRevision ?? '';
        },
        isReady: () => {
          const details = document.getElementById('listenDetails');
          return Boolean(details && details.childElementCount > 0);
        },
        onEvent: (type, detail) => {
          window.__dailyGenrePerformanceTracker?.event?.(
            `listenScreenCache.${type}`,
            detail,
          );
          if (type === 'hit') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'listenScreenCache.hits',
            );
          }
          if (type === 'render') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'listenScreenCache.renders',
            );
          }
        },
      }) || null;

    let pendingMountedListenReuse = null;

    function mountedListenGenreKey(genre) {
      return String(genre?.id ?? genre?.genre ?? '');
    }

    function requestMountedListenScreenReuse(genre) {
      const genreId = mountedListenGenreKey(genre);
      pendingMountedListenReuse = genreId
        ? {
            genreId,
            expiresAt: Date.now() + 5000,
          }
        : null;
    }

    function shouldReuseMountedListenScreen(genre, options = {}) {
      const genreId = mountedListenGenreKey(genre);
      const pendingMatches =
        pendingMountedListenReuse &&
        pendingMountedListenReuse.genreId === genreId &&
        pendingMountedListenReuse.expiresAt >= Date.now();

      const requested =
        options.reuseMounted === true ||
        Boolean(pendingMatches);

      if (pendingMatches) {
        pendingMountedListenReuse = null;
      } else if (
        pendingMountedListenReuse &&
        pendingMountedListenReuse.expiresAt < Date.now()
      ) {
        pendingMountedListenReuse = null;
      }

      if (!requested || !mountedListenScreenCache) return false;

      return mountedListenScreenCache.canReuse(genre, {
        force: options.forceRender === true,
      });
    }

    function markMountedListenScreenRendered(genre) {
      mountedListenScreenCache?.markRendered(genre);
    }

    window.dailyGenreListenScreenCacheInvalidate = (
      reason = 'manual',
    ) => mountedListenScreenCache?.invalidate(reason);

    window.dailyGenreListenScreenCacheDiagnostics = () => ({
      installed: Boolean(mountedListenScreenCache),
      strategy: 'same-genre-mounted-dom',
      ...(
        mountedListenScreenCache?.snapshot?.() || {
          state: null,
          counters: {},
        }
      ),
    });

function loadListenScreen(genre, options = {}) {
      if (shouldReuseMountedListenScreen(genre, options)) {
        currentGenre = genre;
        document.title = `${genre.genre || 'Genre'} | Daily Genre`;
        selectedRating =
          genre.rating && genre.rating !== 'zanger'
            ? String(genre.rating)
            : '';
        listeningFocusMode = getListeningFocusMode(genre);
        refreshTopAlbumDiveButton();
        return true;
      }

      currentGenre = genre;
      document.title = `${genre.genre || 'Genre'} | Daily Genre`;
      const preserveDirty = !!options.preserveDirty;
      selectedRating = genre.rating && genre.rating !== 'zanger' ? String(genre.rating) : '';
      listeningFocusMode = getListeningFocusMode(genre);

      const favTitleInput = document.getElementById('favoriteSong');
      const favUrlInput = document.getElementById('favoriteSongUrl');
      if (favTitleInput) favTitleInput.value = genre.favoritesong || '';
      if (favUrlInput) favUrlInput.value = genre.favoritesongurl || '';
      document.getElementById('monthlyContender').checked = !!genre.monthlycontender;
      document.getElementById('monthFavorite').checked = !!genre.monthfavorite;
      document.getElementById('monthLeastFavorite').checked = !!genre.monthleastfavorite;
      document.getElementById('notes').value = genre.notes || '';
      genre.songs_listened = inflateSongsFromStorage(genre.songs_listened || []);
      genre.pending_songs = normalizePendingSongs(genre.pending_songs || []);
      document.getElementById('songsListenedBulk').value = buildSongsBulkEditorText(genre);
      document.getElementById('includeSongsToggle').checked = false;

      const listenedDate = dateValue(genre);
      const hasListenMarkers = genreHasListenMarkers(genre);
      const mobileGenrePerf = isDailyGenreMobilePerfMode();
      const songs = inflateSongsFromStorage(genre.songs_listened || []);
      const activeSongs = songs.filter(s => !s.isPending);
      const pendingSongs = normalizePendingSongs(getPendingSongs(genre));
      const songCount = countSongsForDisplay(activeSongs);
      const art = getGenreArtwork(genre);
      const ratingHero = genreRatingHeroMarkup(genre);
      // Daily Genre v220: mobile genre pages should paint/tap quickly.  The
      // focused song carousel is the primary mobile interface, so the legacy
      // hidden list is rendered without heavy edit/details controls on phones.
      // Album Dive markup is also lazy-rendered unless the Album tab is active.
      const songCardOptions = (idx) => ({ allowTrackEdit: !mobileGenrePerf, songIndex: idx });
      const pendingCardOptions = (idx) => ({ pendingIndex: idx, allowTrackEdit: !mobileGenrePerf });
      const albumPaneMounted =
        !mobileGenrePerf || listeningFocusMode === 'albums';
      const albumPaneHtml = albumPaneMounted
        ? renderAlbumDivePanel(genre)
        : '<div class="pending-song-empty">Album shelf will load when you tap Albums.</div>';
      document.getElementById('listenDetails').innerHTML = `
        <div class="detail-hero">
          <div class="detail-record-card">
            ${artworkHtml(art, 'genre-art', genre.genre || 'Genre artwork')}
            <div>
              <div class="eyebrow">Genre Detail</div>
              <h2>${escapeHtml(genre.genre || 'Unknown')}</h2>
              <div class="subtle">${escapeHtml(categoryLine(genre))}</div>
              ${listenedDate ? `<div class="detail-listened-date">Listened ${escapeHtml(listenedDate)}</div>` : ''}
              <div class="status-row">
                ${ratingHero}
                ${!listenedDate && hasListenMarkers ? '<span class="tag tag-warn">Marked listened — reset if mistaken</span>' : ''}
                ${['in_progress','in-progress'].includes(String(genre.status || '').toLowerCase()) ? '<span class="tag tag-pending">⏳ In progress</span>' : ''}
                ${songCount ? `<span class="tag">${songCount} song${songCount === 1 ? '' : 's'} logged</span>` : '<span class="tag">Needs song log</span>'}
                ${hasAltTake(genre) ? '<span class="tag">Alt Take</span>' : ''}
                ${hasPending(genre) ? '<span class="tag tag-pending">⏳ Pending</span>' : ''}
                ${genre.monthlycontender ? '<span class="tag">📌 Monthly contender</span>' : ''}
                ${genre.monthfavorite ? '<span class="tag">★ Month favorite</span>' : ''}
                ${genre.monthleastfavorite ? '<span class="tag tag-warn">Month least favorite</span>' : ''}
              </div>              <div class="detail-actions">
                <button type="button" class="btn btn-secondary" onclick="openAdjacentGenre(-1)">← Previous</button>
                <button type="button" class="btn btn-secondary" onclick="restoreArchiveUiState()">Back to Archive</button>
                <button type="button" class="btn btn-secondary" onclick="openAdjacentGenre(1)">Next →</button>
                <button type="button" class="btn btn-secondary edit-mode-toggle" onclick="toggleDetailEditMode()">${detailEditMode ? 'Hide Setup Editor' : 'Edit Setup / Curation'}</button>
                <button type="button" class="spotify-queue-btn" onclick="openSpotifyPlaylistModal('${encodeURIComponent(String(genre.id || ''))}')">＋ Playlist</button>
                ${!hasListenMarkers
                  ? `<button type="button" class="btn btn-primary" onclick="markCurrentGenreListened()">✓ Mark as Listened Today</button>`
                  : `<button type="button" class="btn btn-danger btn-compact listen-correction-btn" onclick="unlistenCurrentGenre()">Reset to Unlistened</button>`}
              </div>

            </div>
          </div>

          ${genre.vibe ? `<div class="vibe">${genreEmoji(genre)} ${escapeHtml(genre.vibe)}</div>` : ''}
          <p>${genre.summary ? escapeHtml(genre.summary) : '<span class="small">No summary available yet.</span>'}</p>
          <div class="meta-grid">
            <div class="meta-box">
              <h3>Key artists</h3>
              <p>${genre.key_artists ? escapeHtml(genre.key_artists) : 'Not added yet.'}</p>
            </div>
            <div class="meta-box">
              <h3>Suggested songs</h3>
              <p>${genre.suggested_songs ? escapeHtml(genre.suggested_songs) : 'Not added yet.'}</p>
            </div>
          </div>
          ${renderGenreRatingPanel(genre)}
          ${renderListeningActionsPanel(genre)}
          ${renderGenreReactionSummary(genre)}
          ${renderPendingSongNotesPanel(genre)}
          ${renderLevelUpIntegrityPanel(genre)}
          <div class="detail-log-section listening-focus-section-shell" data-listening-focus="${escapeHtml(listeningFocusMode)}">
            ${renderListeningFocusTabs(genre)}
            <div class="listening-focus-pane listening-focus-songs ${listeningFocusMode === 'songs' ? '' : 'hidden'}">
              <div class="eyebrow listening-focus-pane-label">Song Queue</div>
              ${activeSongs.length ? `<div class="detail-song-list">${activeSongs.map((song, idx) => renderSongEntry(song, false, songCardOptions(idx))).join('')}</div>` : '<div class="small">No songs logged yet. Add songs on the right and save to update this page.</div>'}
              <div class="pending-section"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;margin-bottom:8px;"><div><div class="eyebrow" style="margin:0;">Pending Nominations</div><div class="small">Routing cleanup now lives in Review so cross-genre fixes happen in one place.</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="switchScreen('review')">Open Review</button></div>${pendingSongs.length ? `<div class="detail-song-list">${pendingSongs.map((song, idx) => renderSongEntry(song, false, pendingCardOptions(idx))).join('')}</div>` : '<div class="pending-song-empty">No pending songs queued.</div>'}</div>
            </div>
            <div class="listening-focus-pane listening-focus-albums ${listeningFocusMode === 'albums' ? '' : 'hidden'}" data-album-dive-mounted="${albumPaneMounted ? 'true' : 'false'}">
              ${albumPaneHtml}
            </div>
          </div>
        </div>
      `;

      renderStars();
      updateDiscordBlock();
      const markBtn = document.getElementById('markListenedBtn');
      const unlistenBtn = document.getElementById('unlistenBtn');
      if (markBtn) markBtn.classList.toggle('hidden', !!listenedDate);
      if (unlistenBtn) unlistenBtn.classList.toggle('hidden', !listenedDate);
      applyDetailEditMode(false);
      if (!preserveDirty) {
        lastSavedListenSnapshot = buildListenSnapshot();
        setUnsavedState(false);
      }

      refreshTopAlbumDiveButton();
      markMountedListenScreenRendered(genre);
      // Existing saved artwork/metadata is displayed here. Missing metadata is enriched
      // only through the explicit Refresh Metadata action in Visuals.
    }

    function openPasswordModal(action) {
      pendingSaveAction = action;
      passwordNotice.textContent = '';
      // v193: explicitly opt the app password field out of browser/password-manager
      // autofill scanning. Firefox started doing expensive form scans after this
      // modal was used on pages with thousands of generated controls.
      passwordInput.setAttribute('autocomplete', 'off');
      passwordInput.setAttribute('autocapitalize', 'none');
      passwordInput.setAttribute('autocorrect', 'off');
      passwordInput.setAttribute('spellcheck', 'false');
      passwordInput.setAttribute('data-lpignore', 'true');
      passwordInput.setAttribute('data-1p-ignore', 'true');
      passwordInput.setAttribute('data-bwignore', 'true');
      passwordInput.value = appPassword || '';
      passwordModal.classList.add('show');
      passwordInput.focus();
    }

    function closePasswordModal() {
      passwordModal.classList.remove('show');
      try { passwordInput.blur(); } catch (_) {}
      // Do not leave the password sitting in a hidden field after save; appPassword
      // keeps the session copy for future saves without reopening this modal.
      passwordInput.value = '';
      pendingSaveAction = null;
      passwordNotice.textContent = '';
    }

    function dailyGenreHasSavePassword() {
      return Boolean(appPassword);
    }

    function promptLibrarySaveLogin() {
      if (!appPassword) openPasswordModal('library_save');
      return Boolean(appPassword);
    }

    window.dailyGenreHasSavePassword = dailyGenreHasSavePassword;
    window.promptLibrarySaveLogin = promptLibrarySaveLogin;

    async function refreshServerFileSha() {
      if (serverFileSha) return serverFileSha;
      try {
        const apiRes = await fetch(DATA_API_URL, { cache: 'no-store' });
        const meta = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && meta && meta.sha) {
          serverFileSha = meta.sha;
          return serverFileSha;
        }
      } catch (error) {
        console.warn('Could not refresh GitHub file SHA before save', error);
      }
      return '';
    }


    // Daily Genre v254: carry forward one in-flight save and interrupted-response recovery.
  let productionSaveRequestInFlight = null;
  const productionSaveRecoveryDiagnostics = {
    attempts: 0,
    joined: 0,
    successes: 0,
    recovered: 0,
    failures: 0,
    recoveryChecks: 0,
    lastOutcome: '',
    lastError: '',
    lastExpectedSha: '',
    lastConfirmedSha: '',
  };

  function waitForProductionSaveRecovery(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  async function fetchLatestProductionFileSha() {
    const separator = DATA_API_URL.includes('?') ? '&' : '?';
    const response = await fetch(
      `${DATA_API_URL}${separator}_dgSaveRecovery=${Date.now()}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
        },
      },
    );
    const metadata = await response.json().catch(() => ({}));
    if (!response.ok || !metadata?.sha) {
      throw new Error(
        metadata?.message ||
        `GitHub revision check failed (${response.status}).`,
      );
    }
    return String(metadata.sha);
  }

  async function confirmProductionSaveAfterNetworkError(expectedSha) {
    for (const delayMs of [900, 1800]) {
      await waitForProductionSaveRecovery(delayMs);
      productionSaveRecoveryDiagnostics.recoveryChecks += 1;

      try {
        const latestSha = await fetchLatestProductionFileSha();
        if (latestSha && latestSha !== expectedSha) {
          return latestSha;
        }
      } catch (recoveryError) {
        console.warn(
          '[Daily Genre] Could not verify GitHub revision after the Worker response was interrupted.',
          recoveryError,
        );
      }
    }

    return '';
  }

  async function performSaveWithPassword(password) {
    finalizeListeningUpdatesBeforeSave();

    if (blockSaveIfDuplicateGenres()) {
      const error = new Error(
        'Duplicate genres detected. Clean the JSON before saving.',
      );
      error.code = 'DUPLICATE_GENRES';
      throw error;
    }

    if (!serverFileSha) await refreshServerFileSha();

    if (!serverFileSha) {
      const error = new Error(
        'No loaded data revision is available. Reload before saving.',
      );
      error.code = 'NO_REVISION';
      throw error;
    }

    const expectedSha = String(serverFileSha);
    productionSaveRecoveryDiagnostics.lastExpectedSha = expectedSha;
    window.__dgLastSaveRecovered = false;

    const payload = genresForSave();
    let serializedPayload;

    try {
      serializedPayload = JSON.stringify(payload);
    } catch (serializationError) {
      console.error(
        '[Daily Genre] Could not serialize the library for saving.',
        serializationError,
      );
      const error = new Error(
        'The library could not be prepared for saving.',
      );
      error.code = 'SERIALIZE_FAILED';
      error.cause = serializationError;
      throw error;
    }

    try {
      window.__dgLastSaveAttemptAt = new Date().toISOString();
      safeStorageSet('dailyGenreLastSaveAttempt:v254', JSON.stringify({
        at: window.__dgLastSaveAttemptAt,
        genres: Array.isArray(payload) ? payload.length : 0,
        bytes: serializedPayload.length,
        expectedSha,
        studioMutation: !!window.__dgStudioCleanupSavePending,
        activeScreen: document.querySelector('.screen.active')?.id || '',
      }));
    } catch (_) {}

    let response;
    try {
      response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Password': password,
          'X-Expected-Sha': expectedSha,
        },
        body: serializedPayload,
      });
    } catch (networkError) {
      console.error(
        '[Daily Genre] Production Worker save request ended without a readable response.',
        networkError,
      );

      const recoveredSha =
        await confirmProductionSaveAfterNetworkError(expectedSha);

      if (recoveredSha) {
        serverFileSha = recoveredSha;
        productionSaveRecoveryDiagnostics.recovered += 1;
        productionSaveRecoveryDiagnostics.lastConfirmedSha = recoveredSha;
        window.__dgLastSaveRecovered = true;

        console.info(
          '[Daily Genre] GitHub confirmed a new file revision after the Worker response was interrupted.',
          {
            expectedSha,
            confirmedSha: recoveredSha,
          },
        );

        return {
          ok: true,
          file: 'genres_data.json',
          sha: recoveredSha,
          recovered: true,
          responseInterrupted: true,
        };
      }

      const error = new Error(
        'The save response was interrupted and GitHub did not confirm a new revision. Wait a moment and check GitHub before retrying.',
      );
      error.code = 'NETWORK_ERROR';
      error.cause = networkError;
      throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      const error = new Error('That password did not work.');
      error.code = 'AUTH_FAILED';
      throw error;
    }

    if (response.status === 409 || data.conflict) {
      const error = new Error(
        'Newer saved data exists. Reload this page before saving.',
      );
      error.code = 'STALE_DATA';
      throw error;
    }

    if (!response.ok || !data.ok) {
      const error = new Error(
        data.error || `Save failed (${response.status}).`,
      );
      error.code = data.code || 'SAVE_FAILED';
      throw error;
    }

    serverFileSha = data.sha || serverFileSha;
    productionSaveRecoveryDiagnostics.lastConfirmedSha =
      String(serverFileSha || '');
    return data;
  }

  async function doSaveWithPassword(password) {
    // DEV-ONLY GUARD: this sandbox reads the real production dataset for realistic
    // testing, but must never write back to it. Remove this block when porting
    // verified changes back to the production repo.
    throw Object.assign(new Error('Saving is disabled on the dailygenre-dev sandbox — it shares production data and this prevents accidental writes. Verify saves in production directly.'), { code: 'DEV_SANDBOX_SAVE_DISABLED' });

    if (productionSaveRequestInFlight) {
      productionSaveRecoveryDiagnostics.joined += 1;
      console.info(
        '[Daily Genre] Reusing the save already in progress instead of creating another commit.',
      );
      return productionSaveRequestInFlight;
    }

    productionSaveRecoveryDiagnostics.attempts += 1;
    productionSaveRecoveryDiagnostics.lastOutcome = 'saving';
    productionSaveRecoveryDiagnostics.lastError = '';

    const request = performSaveWithPassword(password);
    productionSaveRequestInFlight = request;

    try {
      const result = await request;
      productionSaveRecoveryDiagnostics.successes += 1;
      productionSaveRecoveryDiagnostics.lastOutcome =
        result?.recovered ? 'recovered' : 'success';
      return result;
    } catch (error) {
      productionSaveRecoveryDiagnostics.failures += 1;
      productionSaveRecoveryDiagnostics.lastOutcome = 'failed';
      productionSaveRecoveryDiagnostics.lastError =
        String(error?.message || error || 'Unknown save error');
      throw error;
    } finally {
      if (productionSaveRequestInFlight === request) {
        productionSaveRequestInFlight = null;
      }
    }
  }

  window.dailyGenreSaveRecoveryDiagnostics = () => ({
    installed: true,
    strategy: 'single-flight-sha-recovery',
    inFlight: Boolean(productionSaveRequestInFlight),
    ...productionSaveRecoveryDiagnostics,
  });

    function ensureRankOrderForRating(rating) {
      const tierItems = genres
        .filter(g => String(g.rating) === String(rating) && g.rating !== 'zanger')
        .sort((a,b) => (a.rank_order ?? 9999) - (b.rank_order ?? 9999) || (dateValue(a) || '').localeCompare(dateValue(b) || '') || String(a.genre).localeCompare(String(b.genre)));

      tierItems.forEach((g, idx) => {
        g.rank_order = idx + 1;
      });
    }

    async function resolveSpotifyTitles(songs) {
      if (!songs || !songs.length) return songs;

      async function resolveOne(song) {
        const next = { ...song };
        next.url = normalizeSongUrl(next.url);

        if (next.url && (next.url.includes('spotify.com/track/') || /^spotify:track:/i.test(next.url))) {
          // Setup Editor saves should hydrate newly pasted Spotify URLs immediately.
          // Use force refresh when artwork/album/official metadata is missing so a stale cache
          // from an earlier failed lookup cannot leave the card blank until inline Update Track.
          const needsFreshSpotify = !next.spotifyMetadataFetched || !next.artwork || !next.album || !next.spotifyId;
          const official = await fetchSpotifyTrackMetadata(next.url, needsFreshSpotify);
          if (official) {
            applyOfficialSpotifyMetadata(next, official);
          } else {
            const fallback = await fetchSpotifyOembed(next.url);
            if (fallback) applySpotifyMetadata(next, fallback);
          }
        } else {
          await enrichSongReleaseMetadata(next);
        }

        if (next.levelUp) {
          next.levelUp = await resolveOne({ ...next.levelUp, url: normalizeSongUrl(next.levelUp.url) });
        }
        return next;
      }

      return Promise.all(songs.map(resolveOne));
    }

    let spotifyHydrationRun = 0;


    function hasPending(genre) {
      return inflateSongsFromStorage(genre?.songs_listened || []).some(s => !!s.isPending) || !!((genre?.pending_songs || []).length);
    }

    function hasAltTake(genre) {
      return inflateSongsFromStorage(genre?.songs_listened || []).some(song => !!song.levelUp);
    }

    function songSearchText(genre) {
      return inflateSongsFromStorage(genre?.songs_listened || []).flatMap(song => {
        const parts = [song.title, song.artist, song.reason, song.url, song.source, song.album, song.isrc, song.spotifyId];
        if (song.levelUp) parts.push(song.levelUp.title, song.levelUp.artist, song.levelUp.reason, song.levelUp.url, song.levelUp.source, song.levelUp.album, song.levelUp.isrc, song.levelUp.spotifyId);
        return parts;
      }).filter(Boolean).join(' ');
    }

    function numericRating(genre) {
      const n = parseInt(genre?.rating, 10);
      return Number.isFinite(n) ? n : 0;
    }

    function allSongsFlat(genre) {
      return inflateSongsFromStorage(genre?.songs_listened || []).flatMap(song => song.levelUp ? [song, song.levelUp] : [song]);
    }

    function getGenreArtwork(genre) {
      const songs = allSongsFlat(genre).filter(Boolean);
      const favoriteUrl = normalizeSongUrl(genre?.favoritesongurl || '');
      const favoriteMatch = favoriteUrl ? songs.find(s => normalizeSongUrl(s.url || s.spotifyUrl || '') === favoriteUrl && s.artwork) : null;
      if (favoriteMatch?.artwork) return favoriteMatch.artwork;
      if (genre?.favoritesongartwork) return genre.favoritesongartwork;
      const scored = songs.filter(s => s.artwork).sort((a,b) => Number(b.score || 0) - Number(a.score || 0));
      if (scored[0]?.artwork) return scored[0].artwork;
      const five = songs.find(s => Number(s.score) === 5 && s.artwork);
      if (five?.artwork) return five.artwork;
      const first = songs.find(s => s.artwork);
      return first?.artwork || '';
    }

    function artworkHtml(src, className, alt='') {
      if (src) return `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">`;
      return `<div class="${className}" aria-hidden="true"></div>`;
    }

    function songArtistLine(song) {
      return song.artist ? `<div class="song-artist">${escapeHtml(song.artist)}</div>` : '';
    }

    function formatTrackDuration(ms) {
      const totalSeconds = Math.round(Number(ms || 0) / 1000);
      if (!totalSeconds) return '';
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      return `${minutes}:${seconds}`;
    }



    function normalizePendingTag(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
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
      showSaveToast(`${message} Save Library Updates to persist.`, false);
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
      showSaveToast(`Routed to ${target.genre}. Save Library Updates to persist.`);
      renderReview();
    }

    function dismissInboxSong(idx) {
      songInbox.splice(idx, 1);
      renderReview();
    }
    function renderReview() {
      const mount = document.getElementById('reviewContent');
      if (!mount) return;
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
              ${libraryUpdatesPending ? '<button type="button" class="btn btn-primary" onclick="saveLibraryUpdates()">Save Library Updates</button>' : ''}
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
          ? `Moved pending nomination to ${target.genre}. Save Library Updates to persist.`
          : `Pending nomination already exists in ${target.genre}. Save Library Updates to persist.`,
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

    function toggleDetailEditMode() {
      if (!currentGenre) return;
      detailEditMode = !detailEditMode;
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode, detailEditMode);
    }

    function openGenreDetail(genre, editMode=false, options = {}) {
      requestMountedListenScreenReuse(genre);

      if (!genre) return false;
      saveArchiveUiState();
      detailEditMode = !!editMode;
      try {
        loadListenScreen(genre);
      } catch (error) {
        console.error('Could not open genre detail', error, genre);
        showSaveToast('Could not open that genre. Check the console for details.', true);
        return false;
      }
      const switched = switchScreen('listen', { force: !!options.force, preserveScroll: !!options.preserveScroll });
      if (!switched) return false;
      applyDetailEditMode(detailEditMode);
      // v191: Avoid redundant history writes when re-rendering the same genre.
      // Firefox can spend seconds in page-navigation observers after Genre Identity
      // saves when replaceState is called repeatedly for an unchanged #genre URL.
      if (genre.id != null && !options.skipHistory) {
        try {
          const targetHash = '#genre=' + encodeURIComponent(String(genre.id));
          if (location.hash !== targetHash) {
            history.replaceState(null, '', targetHash);
          }
        } catch (_) {}
      }
      // v197: opening a genre should start at the genre header, never at the song carousel.
      // Internal re-renders/save refreshes can pass preserveScroll to keep the current viewport.
      if (!options.preserveScroll || options.scrollTop) {
        requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      }
      return true;
    }

    window.openGenreDetail = openGenreDetail;


    function rankedGenresForTier(tier) {
      return genres
        .filter(g => String(g.rating) === String(tier) && g.rating !== 'zanger')
        .sort((a,b) => (a.rank_order ?? 9999) - (b.rank_order ?? 9999));
    }

    function moveRank(id, direction) {
      const item = getGenreById(id);
      if (!item || !item.rating || item.rating === 'zanger') return;

      const tierItems = rankedGenresForTier(item.rating);
      const index = tierItems.findIndex(g => String(g.id) === String(item.id));
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= tierItems.length) return;

      const other = tierItems[swapIndex];
      const temp = item.rank_order;
      item.rank_order = other.rank_order;
      other.rank_order = temp;

      ensureRankOrderForRating(item.rating);
      renderRankings();
    }

    function renderRankings() {
      const wrap = document.getElementById('rankingWrap');
      if (!wrap) return;
      const tiers = [
        { rating: 5, label: 'Inject This Into My Veins (5★)' },
        { rating: 4, label: 'Hell Yeah, Run It Back (4★)' },
        { rating: 3, label: 'Glad I Heard It (3★)' },
        { rating: 2, label: 'Respectfully, Nah (2★)' },
        { rating: 1, label: 'Get This Off My Turntable (1★)' }
      ];

      wrap.innerHTML = tiers.map(tier => {
        const items = rankedGenresForTier(tier.rating);
        return `
          <div class="ranking-tier">
            <h3>${tier.label}</h3>
            ${items.length ? items.map((g, idx) => `
              <div class="ranking-row">
                <div class="ranking-num">${idx + 1}</div>
                ${artworkHtml(getGenreArtwork(g), 'ranking-artwork', g.genre || 'Genre artwork')}
                <div>
                  <button type="button" class="linklike" data-rank-open-id="${g.id}" style="padding:0;border:0;background:transparent;color:inherit;text-align:left;font-weight:900;font-size:1rem;cursor:pointer;">${escapeHtml(g.genre || 'Unknown')}</button>
                  <div class="small">${escapeHtml(categoryLine(g))}${g.favoritesong ? ` · favorite: ${escapeHtml(g.favoritesong)}` : ''}</div>
                </div>
                <div class="rank-controls">
                  <button class="icon-btn" onclick="moveRank('${g.id}', 'up')" title="Move up">↑</button>
                  <button class="icon-btn" onclick="moveRank('${g.id}', 'down')" title="Move down">↓</button>
                </div>
              </div>
            `).join('') : '<div class="small">No genres in this tier yet.</div>'}
          </div>
        `;
      }).join('') + `
        <div class="ranking-tier">
          <h3>Zangers</h3>
          ${genres.filter(g => String(g.rating) === 'zanger' || (g.status || '').toLowerCase() === 'veto').map(g => `
            <div class="ranking-row">
              <div class="ranking-num">Z</div>
              ${artworkHtml(getGenreArtwork(g), 'ranking-artwork', g.genre || 'Genre artwork')}
              <div>
                <button type="button" class="linklike" data-rank-open-id="${g.id}" style="padding:0;border:0;background:transparent;color:inherit;text-align:left;font-weight:900;font-size:1rem;cursor:pointer;">${escapeHtml(g.genre || 'Unknown')}</button>
                <div class="small">${escapeHtml(categoryLine(g))}</div>
              </div>
              <div></div>
            </div>
          `).join('') || '<div class="small">No zangers yet.</div>'}
        </div>
      `;

      wrap.querySelectorAll('[data-rank-open-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const genre = getGenreById(btn.dataset.rankOpenId);
          if (genre) openGenreDetail(genre, false);
        });
      });
    }

    function renderArchiveSummary(items, label) {
      const summary = document.getElementById('archiveSummary');
      if (!summary) return;
      const altCount = items.filter(hasAltTake).length;
      const contenderCount = items.filter(g => !!g.monthlycontender).length;
      const zangerCount = items.filter(g => String(g.rating || '') === 'zanger' || (g.status || '').toLowerCase() === 'veto').length;
      const songCount = items.reduce((total, g) => total + countSongsForDisplay(g.songs_listened || []), 0);
      const rated = items.map(numericRating).filter(Boolean);
      const avg = rated.length ? (rated.reduce((a,b) => a+b, 0) / rated.length).toFixed(1) : '—';
      summary.innerHTML = `
        <span>${escapeHtml(label)} · ${items.length} entr${items.length === 1 ? 'y' : 'ies'}</span>
        <span class="archive-stat-chip">avg ${escapeHtml(avg)} ★</span>
        <span class="archive-stat-chip">${songCount} song${songCount === 1 ? '' : 's'}</span>
        <span class="archive-stat-chip">${altCount} Alt Take${altCount === 1 ? '' : 's'}</span>
        <span class="archive-stat-chip">${contenderCount} contender${contenderCount === 1 ? '' : 's'}</span>
        <span class="archive-stat-chip">${zangerCount} zanger${zangerCount === 1 ? '' : 's'}</span>
      `;
    }

    // Daily Genre v254: cache Archive filtering/search/sort by data revision.
    const archiveViewModelCache =
      window.DailyGenreArchiveViewModelCache?.createArchiveViewModelCache?.({
        maxEntries: 12,
        onEvent: (type, detail) => {
          window.__dailyGenrePerformanceTracker?.event?.(
            `archiveViewModelCache.${type}`,
            detail,
          );
          if (type === 'hit') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'archiveViewModelCache.hits',
            );
          }
          if (type === 'miss') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'archiveViewModelCache.misses',
            );
          }
          if (type === 'write') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'archiveViewModelCache.writes',
            );
          }
        },
      }) || null;

    const archiveViewModelRuntimeDiagnostics = {
      derivations: 0,
      bypasses: 0,
      lastOutcome: '',
      lastRevision: '',
      lastSignature: '',
    };

    function archiveViewModelRevision() {
      let revision = '';
      try {
        const diagnostics = window.dailyGenreLibraryIndexDiagnostics?.();
        if (diagnostics?.revision != null) {
          revision = String(diagnostics.revision);
        }
      } catch (_) {}

      return [
        revision || String(window.__dailyGenreLibraryRevision ?? ''),
        String(Array.isArray(genres) ? genres.length : 0),
        String(serverFileSha || ''),
      ].join(':');
    }

    function deriveArchiveViewModel({
      month = '',
      rating = '',
      query = '',
      flag = '',
      sort = 'newest',
    } = {}) {
      const listenedAll = genres
        .filter(g =>
          ['listened', 'veto'].includes(
            (g.status || '').toLowerCase(),
          ),
        )
        .filter(g => dateValue(g));

      const months = [
        ...new Set(
          listenedAll.map(g => dateValue(g).slice(0, 7)),
        ),
      ].sort((a, b) => b.localeCompare(a));
      const latestMonth = months[0] || '';
      const effectiveMonth =
        archiveView === 'monthly' && !month ? latestMonth : month;

      let items = listenedAll.slice();
      let label = 'All logs';

      if (archiveView === 'monthly') {
        label = effectiveMonth
          ? `Monthly view · ${effectiveMonth}`
          : 'Monthly view';
        if (effectiveMonth) {
          items = items.filter(g =>
            dateValue(g).startsWith(effectiveMonth),
          );
        }
      } else if (archiveView === 'contenders') {
        label = 'Monthly contenders';
        items = items.filter(g => !!g.monthlycontender);
      } else if (archiveView === 'zangers') {
        label = 'Zangers';
        items = items.filter(g =>
          String(g.rating || '') === 'zanger' ||
          (g.status || '').toLowerCase() === 'veto',
        );
      } else if (archiveView === 'alttakes') {
        label = 'Genres with Alt Takes';
        items = items.filter(hasAltTake);
      } else if (archiveView === 'pending') {
        label = 'Genres with Pending Nominations';
        items = items.filter(hasPending);
      }

      if (flag === 'album-dive') {
        items = genres.filter(g => genreHasAlbumDiveContent(g));
        label = 'Genres with Album Dive';
      } else if (flag === 'unlistened') {
        items = genres.filter(g => {
          const status = String(g.status || '').toLowerCase();
          return (
            !dateValue(g) &&
            (!status || status === 'unlistened')
          );
        });
        label = 'Unlistened genres';
      }

      if (
        effectiveMonth &&
        archiveView !== 'monthly' &&
        flag !== 'album-dive' &&
        flag !== 'unlistened'
      ) {
        items = items.filter(g =>
          dateValue(g).startsWith(effectiveMonth),
        );
      }

      if (rating) {
        items = items.filter(
          g => String(g.rating || '') === rating,
        );
      }

      if (flag === 'contender') {
        items = items.filter(g => !!g.monthlycontender);
      }
      if (flag === 'alt') items = items.filter(hasAltTake);
      if (flag === 'pending') items = items.filter(hasPending);
      if (flag === 'songs') {
        items = items.filter(
          g => countSongsForDisplay(g.songs_listened || []) > 0,
        );
      }
      if (flag === 'favorite') {
        items = items.filter(
          g => !!(g.favoritesong || g.favoritesongurl),
        );
      }
      if (flag === 'missing-songs') {
        items = items.filter(
          g => countSongsForDisplay(g.songs_listened || []) === 0,
        );
      }
      if (flag === 'missing-favorite') {
        items = items.filter(
          g => !(g.favoritesong || g.favoritesongurl),
        );
      }
      if (flag === 'non-spotify-links') {
        items = items.filter(g =>
          genreHasSongMatching(g, songUrlIsNonSpotifyLink),
        );
      }
      if (flag === 'youtube-links') {
        items = items.filter(g =>
          genreHasSongMatching(g, songUrlIsYoutubeLink),
        );
      }
      if (flag === 'level-up-issues') {
        items = items.filter(genreHasLevelUpIssues);
      }
      if (flag === 'missing-identity') {
        items = items.filter(g => !genreHasMeaningfulIdentity(g));
      }
      if (flag === 'notes') {
        items = items.filter(g => !!g.notes);
      }
      if (flag === 'zanger') {
        items = items.filter(g =>
          String(g.rating || '') === 'zanger' ||
          (g.status || '').toLowerCase() === 'veto',
        );
      }
      if (flag === 'unranked') {
        items = items.filter(g =>
          countSongsForDisplay(g.songs_listened || []) > 0 &&
          !g.rank_order &&
          g.rating !== 'zanger',
        );
      }

      if (query) {
        const normalizedQuery = normalizeGenreSearchText(query);
        items = items
          .map(g => ({
            g,
            rank: genreSearchRank(g, query),
            blob: normalizeGenreSearchText(genreSearchBlob(g)),
          }))
          .filter(
            row =>
              row.rank < 9 ||
              row.blob.includes(normalizedQuery),
          )
          .sort(
            (a, b) =>
              a.rank - b.rank ||
              String(a.g.genre || '').localeCompare(
                String(b.g.genre || ''),
              ),
          )
          .map(row => row.g);
      }

      const byGenre = (a, b) =>
        String(a.genre || '').localeCompare(
          String(b.genre || ''),
        );

      if (!query) {
        if (sort === 'oldest') {
          items.sort(
            (a, b) =>
              (dateValue(a) || '').localeCompare(
                dateValue(b) || '',
              ) || byGenre(a, b),
          );
        } else if (sort === 'rating-desc') {
          items.sort(
            (a, b) =>
              numericRating(b) - numericRating(a) ||
              byGenre(a, b),
          );
        } else if (sort === 'rating-asc') {
          items.sort(
            (a, b) =>
              numericRating(a) - numericRating(b) ||
              byGenre(a, b),
          );
        } else if (sort === 'genre') {
          items.sort(byGenre);
        } else if (sort === 'rank') {
          items.sort(
            (a, b) =>
              (a.rank_order ?? 9999) -
                (b.rank_order ?? 9999) ||
              numericRating(b) - numericRating(a) ||
              byGenre(a, b),
          );
        } else {
          items.sort(
            (a, b) =>
              (dateValue(b) || '').localeCompare(
                dateValue(a) || '',
              ) || byGenre(a, b),
          );
        }
      }

      archiveViewModelRuntimeDiagnostics.derivations += 1;
      window.__dailyGenrePerformanceTracker?.increment?.(
        'archiveViewModelCache.derivations',
      );

      return {
        items,
        label,
        effectiveMonth,
      };
    }

    function getArchiveViewModel(filters) {
      const revision = archiveViewModelRevision();
      const signature = JSON.stringify({
        archiveView: String(archiveView || ''),
        month: String(filters.month || ''),
        rating: String(filters.rating || ''),
        query: String(filters.query || ''),
        flag: String(filters.flag || ''),
        sort: String(filters.sort || ''),
      });
      const canUseCache =
        !hasUnsavedChanges && !libraryUpdatesPending;

      archiveViewModelRuntimeDiagnostics.lastRevision = revision;
      archiveViewModelRuntimeDiagnostics.lastSignature = signature;

      if (canUseCache && archiveViewModelCache) {
        const cached = archiveViewModelCache.get(
          revision,
          signature,
        );
        if (cached) {
          archiveViewModelRuntimeDiagnostics.lastOutcome = 'hit';
          return {
            ...cached,
            revision,
            signature,
            cacheOutcome: 'hit',
          };
        }
      } else {
        archiveViewModelRuntimeDiagnostics.bypasses += 1;
        archiveViewModelRuntimeDiagnostics.lastOutcome = 'bypass';
        window.__dailyGenrePerformanceTracker?.increment?.(
          'archiveViewModelCache.bypasses',
        );
      }

      const derived = deriveArchiveViewModel(filters);
      if (canUseCache && archiveViewModelCache) {
        archiveViewModelCache.set(
          revision,
          signature,
          derived,
        );
        archiveViewModelRuntimeDiagnostics.lastOutcome = 'miss';
      }

      return {
        ...derived,
        revision,
        signature,
        cacheOutcome: canUseCache ? 'miss' : 'bypass',
      };
    }

    window.dailyGenreArchiveViewModelCacheInvalidate = (
      reason = 'manual',
    ) => {
      archiveViewModelCache?.clear(reason);
      window.dailyGenreArchiveRenderReuseInvalidate?.(reason);
    };

    window.dailyGenreArchiveViewModelCacheDiagnostics = () => ({
      installed: Boolean(archiveViewModelCache),
      strategy: 'revision-signature-lru-12',
      currentRevision: archiveViewModelRevision(),
      ...archiveViewModelRuntimeDiagnostics,
      ...(
        archiveViewModelCache?.snapshot?.() || {
          maxEntries: null,
          size: 0,
          lastClearReason: '',
          counters: {},
        }
      ),
    });

    // Daily Genre v255: reuse unchanged Archive DOM on same-signature refreshes.
    const archiveRenderReuse =
      window.DailyGenreArchiveRenderReuse?.createArchiveRenderReuse?.({
        onEvent: (type, detail) => {
          window.__dailyGenrePerformanceTracker?.event?.(
            `archiveDomReuse.${type}`,
            detail,
          );
          if (type === 'reuse') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'archiveDomReuse.reuses',
            );
          }
          if (type === 'forced') {
            window.__dailyGenrePerformanceTracker?.increment?.(
              'archiveDomReuse.forced',
            );
          }
        },
      }) || null;

    window.dailyGenreArchiveRenderReuseInvalidate = (
      reason = 'manual',
    ) => archiveRenderReuse?.invalidate(reason);

    window.dailyGenreArchiveRenderReuseDiagnostics = () => ({
      installed: Boolean(archiveRenderReuse),
      strategy: 'same-signature-dom-reuse',
      ...(
        archiveRenderReuse?.snapshot?.() || {
          current: {
            signature: '',
            total: 0,
            rendered: 0,
            domCards: 0,
          },
          lastOutcome: '',
          lastReason: '',
          counters: {},
        }
      ),
      progressive: { ...archiveProgressiveRenderDiagnostics },
    });

    // Daily Genre v256: measured 80-card Archive changes caused 83–100 ms frame gaps.
    const ARCHIVE_DESKTOP_BATCH_SIZE = 48;
    const ARCHIVE_MOBILE_BATCH_SIZE = 32;
    const ARCHIVE_MOBILE_BATCH_QUERY = '(max-width: 760px)';

    function archiveRenderBatchSize() {
      try {
        return window.matchMedia?.(ARCHIVE_MOBILE_BATCH_QUERY)?.matches
          ? ARCHIVE_MOBILE_BATCH_SIZE
          : ARCHIVE_DESKTOP_BATCH_SIZE;
      } catch (_) {
        return ARCHIVE_DESKTOP_BATCH_SIZE;
      }
    }

    const ARCHIVE_RENDER_BATCH_SIZE = archiveRenderBatchSize();
    const archiveProgressiveState =
      window.DailyGenreArchiveProgressive?.createArchiveProgressiveState?.({
        batchSize: ARCHIVE_RENDER_BATCH_SIZE,
      }) || null;
    let archiveRenderedItems = [];
    const archiveProgressiveRenderDiagnostics = {
      renderPasses: 0,
      appendPasses: 0,
      reusePasses: 0,
      forcedPasses: 0,
      delegatedBindings: 0,
    };

    function archiveCardHtml(g) {
      const songs = normalizeSongsListened(g.songs_listened || []);
      const songCount = countSongsForDisplay(songs);
      const ratingLabel = escapeHtml(genreRatingStarsOnly(g));
      const art = getGenreArtwork(g);

      return `
        <div class="list-item archive-card">
          ${artworkHtml(art, 'archive-artwork', g.genre || 'Genre artwork')}
          <div class="archive-card-main">
            <div class="archive-card-body">
              <h3 class="archive-card-title">${escapeHtml(g.genre || 'Unknown')}</h3>
              <div class="small archive-card-meta">${escapeHtml(categoryLine(g))}</div>
              <div class="status-row">
                <span class="tag">${ratingLabel}</span>
                ${g.monthlycontender ? '<span class="tag">📌 Monthly contender</span>' : ''}
                ${(g.rank_order && g.rating !== 'zanger') ? `<span class="tag">Tier rank #${escapeHtml(String(g.rank_order))}</span>` : (songCount > 0 && !g.rank_order && g.rating !== 'zanger' ? '<span class="tag tag-warn">No rank yet</span>' : '')}
                ${hasAltTake(g) ? '<span class="tag">Alt Take</span>' : ''}
                ${hasPending(g) ? '<span class="tag tag-pending">⏳ Pending</span>' : ''}
                ${songCount ? `<span class="tag">${songCount} song${songCount === 1 ? '' : 's'}</span>` : '<span class="tag">Needs songs</span>'}
              </div>
              ${g.favoritesong ? `<div class="small" style="margin-top:8px;">Favorite song: ${
                g.favoritesongurl
                  ? `<a href="${escapeHtml(g.favoritesongurl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);font-weight:800;text-decoration:none;">${escapeHtml(g.favoritesong)} ↗</a>`
                  : escapeHtml(g.favoritesong)
              }</div>` : ''}
            </div>
            <div class="archive-card-right">
              <span class="small archive-card-date">${escapeHtml(dateValue(g) || 'No date')}</span>
              <button class="btn btn-primary archive-primary-action" data-open-id="${g.id}">Open / Edit</button>
              ${songCount ? `<label class="archive-select-genre"><input type="checkbox" data-archive-playlist-genre="${escapeHtml(String(g.id))}" ${archivePlaylistSelectedGenreIds.has(String(g.id)) ? 'checked' : ''} /> Playlist</label>` : ''}
              ${songCount ? `<span class="btn btn-ghost song-log-toggle" style="padding:5px 10px;font-size:.8rem;font-weight:900;white-space:nowrap;cursor:default;">${songCount} song${songCount === 1 ? '' : 's'} logged</span>` : ''}
            </div>
          </div>
        </div>`;
    }

    function archiveLoadMoreHtml(snapshot) {
      if (!snapshot?.hasMore) return '';
      const nextCount = Math.min(
        Number(snapshot.batchSize || ARCHIVE_RENDER_BATCH_SIZE),
        Number(snapshot.remaining || 0),
      );

      return `
        <div class="review-load-next-wrap archive-load-more-wrap" data-archive-load-more-wrap>
          <button type="button" class="btn btn-primary" data-archive-load-more>
            Load next ${nextCount}
          </button>
          <span class="small">${snapshot.rendered} shown of ${snapshot.total} · ${snapshot.remaining} more</span>
        </div>`;
    }

    function ensureArchiveListDelegation(list) {
      if (!list || list.dataset.archiveDelegated === 'true') return;
      list.dataset.archiveDelegated = 'true';
      archiveProgressiveRenderDiagnostics.delegatedBindings += 1;

      list.addEventListener('click', event => {
        const loadMore = event.target?.closest?.('[data-archive-load-more]');
        if (loadMore && list.contains(loadMore)) {
          event.preventDefault();
          loadMoreArchiveEntries();
          return;
        }

        const openButton = event.target?.closest?.('[data-open-id]');
        if (!openButton || !list.contains(openButton)) return;

        const genre = getGenreById(openButton.dataset.openId);
        if (genre) openGenreDetail(genre, false);
      });

      list.addEventListener('change', event => {
        const checkbox =
          event.target?.closest?.('[data-archive-playlist-genre]');
        if (!checkbox || !list.contains(checkbox)) return;
        archivePlaylistSelectionChanged(checkbox);
      });
    }

    function renderArchiveProgressiveList(
      list,
      items,
      signature,
      options = {},
    ) {
      ensureArchiveListDelegation(list);

      const snapshot =
        archiveProgressiveState?.prepare(signature, items.length) || {
          batchSize: items.length,
          signature,
          total: items.length,
          rendered: items.length,
          remaining: 0,
          hasMore: false,
          resets: 0,
          loads: 0,
        };

      archiveRenderedItems = items.slice(0, snapshot.rendered);

      const forceDomRender = Boolean(
        options.forceDomRender ||
        hasUnsavedChanges ||
        libraryUpdatesPending
      );
      const forceReason = options.forceDomRender
        ? 'explicit'
        : (hasUnsavedChanges || libraryUpdatesPending)
          ? 'unsaved-library-state'
          : '';
      const domCards =
        list.querySelectorAll('.archive-card').length;
      const canReuseArchiveDom =
        archiveRenderReuse?.shouldReuse?.({
          signature,
          total: snapshot.total,
          rendered: snapshot.rendered,
          domCards,
          force: forceDomRender,
          forceReason,
        }) || false;

      if (canReuseArchiveDom) {
        archiveProgressiveRenderDiagnostics.reusePasses += 1;
        window.__dailyGenrePerformanceTracker?.increment?.(
          'archiveProgressive.reusePasses',
        );
        window.__dailyGenrePerformanceTracker?.event?.(
          'archiveProgressive.reuse',
          {
            total: snapshot.total,
            rendered: snapshot.rendered,
            remaining: snapshot.remaining,
          },
        );
        archiveUpdatePlaylistButtons();
        return {
          reused: true,
          snapshot,
        };
      }

      if (forceDomRender) {
        archiveProgressiveRenderDiagnostics.forcedPasses += 1;
      }

      list.innerHTML =
        archiveRenderedItems.map(archiveCardHtml).join('') +
        archiveLoadMoreHtml(snapshot);

      archiveRenderReuse?.remember?.(
        {
          signature,
          total: snapshot.total,
          rendered: snapshot.rendered,
          domCards:
            list.querySelectorAll('.archive-card').length,
        },
        'render',
      );

      archiveProgressiveRenderDiagnostics.renderPasses += 1;
      window.__dailyGenrePerformanceTracker?.increment?.(
        'archiveProgressive.renderPasses',
      );
      window.__dailyGenrePerformanceTracker?.event?.(
        'archiveProgressive.render',
        {
          total: snapshot.total,
          rendered: snapshot.rendered,
          remaining: snapshot.remaining,
        },
      );
      archiveUpdatePlaylistButtons();
      return {
        reused: false,
        snapshot,
      };
    }

    function loadMoreArchiveEntries() {
      const list = document.getElementById('historyList');
      if (!list || !archiveProgressiveState) return false;

      const before = archiveProgressiveState.snapshot();
      if (!before.hasMore) return false;

      const after = archiveProgressiveState.loadMore();
      const nextItems = (archiveCurrentItems || []).slice(
        before.rendered,
        after.rendered,
      );

      list.querySelector('[data-archive-load-more-wrap]')?.remove();
      if (nextItems.length) {
        list.insertAdjacentHTML(
          'beforeend',
          nextItems.map(archiveCardHtml).join(''),
        );
      }

      archiveRenderedItems = (archiveCurrentItems || []).slice(
        0,
        after.rendered,
      );

      const controls = archiveLoadMoreHtml(after);
      if (controls) list.insertAdjacentHTML('beforeend', controls);

      archiveRenderReuse?.remember?.(
        {
          signature: String(
            after.signature || before.signature || '',
          ),
          total: after.total,
          rendered: after.rendered,
          domCards:
            list.querySelectorAll('.archive-card').length,
        },
        'append',
      );

      archiveProgressiveRenderDiagnostics.appendPasses += 1;
      window.__dailyGenrePerformanceTracker?.increment?.(
        'archiveProgressive.appendPasses',
      );
      window.__dailyGenrePerformanceTracker?.event?.(
        'archiveProgressive.append',
        {
          added: nextItems.length,
          total: after.total,
          rendered: after.rendered,
          remaining: after.remaining,
        },
      );
      archiveUpdatePlaylistButtons();
      return true;
    }

    window.loadMoreArchiveEntries = loadMoreArchiveEntries;
    window.dailyGenreArchiveProgressiveDiagnostics = () => {
      const state =
        archiveProgressiveState?.snapshot?.() || {
          batchSize: null,
          signature: '',
          total: (archiveCurrentItems || []).length,
          rendered: archiveRenderedItems.length,
          remaining: Math.max(
            0,
            (archiveCurrentItems || []).length - archiveRenderedItems.length,
          ),
          hasMore: false,
          resets: 0,
          loads: 0,
        };

      return {
        installed: Boolean(archiveProgressiveState),
        strategy: 'adaptive-batch-48-32-delegated',
        desktopBatchSize: ARCHIVE_DESKTOP_BATCH_SIZE,
        mobileBatchSize: ARCHIVE_MOBILE_BATCH_SIZE,
        mobileQuery: ARCHIVE_MOBILE_BATCH_QUERY,
        activeBatchSize: ARCHIVE_RENDER_BATCH_SIZE,
        ...state,
        domCards:
          document.querySelectorAll('#historyList .archive-card').length,
        ...archiveProgressiveRenderDiagnostics,
      };
    };

    function renderHistory(options = {}) {
      const monthEl =
        document.getElementById('historyMonthFilter');
      const ratingEl =
        document.getElementById('historyRatingFilter');
      const searchEl =
        document.getElementById('archiveSearchInput') ||
        document.getElementById('historyCategoryFilter');
      const flagEl =
        document.getElementById('archiveFlagFilter');
      const sortEl =
        document.getElementById('archiveSortFilter');
      const list = document.getElementById('historyList');
      if (!list) return;

      const filters = {
        month: monthEl ? monthEl.value : '',
        rating: ratingEl ? ratingEl.value : '',
        query: searchEl
          ? searchEl.value.trim().toLowerCase()
          : '',
        flag: flagEl ? flagEl.value : '',
        sort: sortEl ? sortEl.value : 'newest',
      };

      const viewModel = getArchiveViewModel(filters);
      const items = viewModel.items;
      const label = viewModel.label;
      const effectiveMonth = viewModel.effectiveMonth;

      archiveCurrentItems = items;
      archiveCurrentLabel = label;

      const archiveSignature = JSON.stringify({
        revision: viewModel.revision,
        view: viewModel.signature,
      });
      window._archiveItems = items;

      if (!items.length) {
        const emptySnapshot =
          archiveProgressiveState?.prepare(
            archiveSignature,
            0,
          ) || {
            signature: archiveSignature,
            total: 0,
            rendered: 0,
          };
        archiveRenderedItems = [];
        ensureArchiveListDelegation(list);
        list.innerHTML =
          `<div class="small">No matching entries yet.</div>`;
        archiveRenderReuse?.remember?.(
          {
            signature: archiveSignature,
            total: Number(emptySnapshot.total || 0),
            rendered: 0,
            domCards: 0,
          },
          'empty',
        );
        renderArchiveSummary(items, label);
        archiveUpdatePlaylistButtons();
        return;
      }

      const renderResult = renderArchiveProgressiveList(
        list,
        items,
        archiveSignature,
        {
          forceDomRender: Boolean(
            options.forceDomRender ||
            viewModel.cacheOutcome === 'bypass'
          ),
        },
      );

      if (!renderResult?.reused) {
        renderArchiveSummary(items, label);
      }
    }

    function archiveVisiblePlaylistGenreIds() {
      return (archiveRenderedItems || [])
        .filter(g => spotifyPlaylistSongRows(g).length > 0)
        .map(g => String(g.id));
    }

    function archiveUpdatePlaylistButtons() {
      const selectedCount = archivePlaylistSelectedGenreIds.size;
      const selectedBtn = document.getElementById('archivePlaylistSelectedBtn');
      if (selectedBtn) selectedBtn.textContent = selectedCount ? `＋ Playlist selected (${selectedCount})` : '＋ Playlist selected';
      const toggleBtn = document.getElementById('archivePlaylistToggleVisibleBtn');
      if (toggleBtn) {
        const visibleIds = archiveVisiblePlaylistGenreIds();
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => archivePlaylistSelectedGenreIds.has(id));
        toggleBtn.textContent = allVisibleSelected ? 'Clear visible playlist picks' : 'Select visible for playlist';
      }
    }

    function archivePlaylistSelectionChanged(box) {
      const id = String(box?.dataset?.archivePlaylistGenre || '');
      if (!id) return;
      if (box.checked) archivePlaylistSelectedGenreIds.add(id);
      else archivePlaylistSelectedGenreIds.delete(id);
      archiveUpdatePlaylistButtons();
    }

    function archiveToggleVisiblePlaylistSelection() {
      const visibleIds = archiveVisiblePlaylistGenreIds();
      if (!visibleIds.length) {
        showSaveToast('No visible archive entries have Spotify tracks.', true);
        return;
      }
      const allVisibleSelected = visibleIds.every(id => archivePlaylistSelectedGenreIds.has(id));
      visibleIds.forEach(id => {
        if (allVisibleSelected) archivePlaylistSelectedGenreIds.delete(id);
        else archivePlaylistSelectedGenreIds.add(id);
      });
      renderHistory({ forceDomRender: true });
      archiveUpdatePlaylistButtons();
    }

    async function openArchivePlaylistModal() {
      const selectedIds = [...archivePlaylistSelectedGenreIds];
      if (!selectedIds.length) {
        showSaveToast('Select at least one archive genre for the playlist.', true);
        return;
      }
      if (!(await spotifyEnsurePlaylistScopes({ reopenPlaylistGenreIds: selectedIds, returnScreen: 'history' }))) return;

      const selectedGenres = selectedIds
        .map(id => (genres || []).find(g => String(g.id) === String(id)))
        .filter(Boolean);
      const rows = spotifyPlaylistSongRowsForGenres(selectedGenres);
      if (!rows.length) {
        showSaveToast('The selected archive genres do not have Spotify track URLs.', true);
        return;
      }
      const dateStamp = new Date().toISOString().slice(0,10);
      spotifyOpenPlaylistModalWithRows({
        rows,
        sourceName: `${selectedGenres.length} selected archive genre${selectedGenres.length === 1 ? '' : 's'}`,
        playlistName: `Daily Genre — Backlog ${dateStamp}`,
        contextType: 'archive',
        genreIds: selectedGenres.map(g => String(g.id))
      });
    }

    function renderMonthly() {
      archiveView = 'monthly';
      document.querySelectorAll('.archive-view-btn').forEach(b => b.classList.toggle('active', b.dataset.archiveView === archiveView));
      renderHistory();
    }

    function populateMonthFilter() {
      const months = [...new Set(
        genres.filter(g => dateValue(g)).map(g => dateValue(g).slice(0,7))
      )].sort().reverse();

      const historyMonth = document.getElementById('historyMonthFilter');
      if (historyMonth) {
        historyMonth.innerHTML =
          `<option value="">All months</option>` +
          months.map(m => `<option value="${m}">${m}</option>`).join('');
      }
    }

    function genreAliasListForSearch(genre) {
      const values = [];
      const push = (value) => {
        if (Array.isArray(value)) value.forEach(push);
        else if (value && typeof value === 'object') Object.values(value).forEach(push);
        else if (value != null) String(value).split(/[\n;,|]+/).forEach(part => {
          const clean = part.trim();
          if (clean) values.push(clean);
        });
      };
      push(genre?.aliases);
      push(genre?.synonyms);
      push(genre?.aka);
      push(genre?.alsoKnownAs);
      push(genre?.also_known_as);

      // Small curated search bridges for common alternate spellings/names that
      // are not always present in the source JSON yet. Keep these search-only so
      // they do not rewrite the visible genre identity fields.
      const canonical = normalizeGenreSearchText(genre?.genre || '');
      if (canonical === 'hokkien pop') {
        push(['tai-pop', 'tai pop', 'taipop', 'taiwanese pop', 'taiwanese hokkien pop', 'taiwanese language pop']);
      }

      return [...new Set(values)];
    }

    function normalizeGenreSearchText(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function genreIdentityUsefulText(value) {
      return String(value ?? '').trim();
    }

    function genreIdentityUsefulUrl(value) {
      const url = genreIdentityUsefulText(value);
      if (!/^https?:\/\//i.test(url)) return '';
      if (/^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i.test(url)) return '';
      return url;
    }

    function genreIdentityTrackHasContent(track) {
      if (!track || typeof track !== 'object') return false;
      return Boolean(
        genreIdentityUsefulText(track.artist) ||
        genreIdentityUsefulText(track.title || track.name) ||
        genreIdentityUsefulText(track.reason) ||
        genreIdentityUsefulText(track.mediaTitle || track.media || track.mediaType) ||
        genreIdentityUsefulUrl(track.spotifyUrl || track.url || track.spotify_url)
      );
    }

    function genreIdentityMediaRows(genre) {
      const candidates = [];
      if (Array.isArray(genre?.media_touchstones)) candidates.push(...genre.media_touchstones);
      if (Array.isArray(genre?.mediaTouchstones)) candidates.push(...genre.mediaTouchstones);
      if (Array.isArray(genre?.identity?.mediaTouchstones)) candidates.push(...genre.identity.mediaTouchstones);
      if (Array.isArray(genre?.identity?.media_touchstones)) candidates.push(...genre.identity.media_touchstones);
      return candidates.filter(genreIdentityTrackHasContent);
    }

    function genreIdentitySeminalTrack(genre) {
      return genre?.identity?.seminalTrack || genre?.identity?.seminal_track || genre?.seminal_song || genre?.seminalTrack || null;
    }

    function genreHasMeaningfulIdentity(genre) {
      if (!genre) return false;
      if (genreAliasListForSearch(genre).length > 0) return true;
      if (genreIdentityTrackHasContent(genreIdentitySeminalTrack(genre))) return true;
      if (genreIdentityMediaRows(genre).length > 0) return true;
      if (Array.isArray(genre.songs_listened) && genre.songs_listened.some(song => song?.isIdentityTrack || song?.identityType)) return true;
      return false;
    }

    function genreSearchBlob(genre) {
      return [
        genre?.genre,
        categoryLine(genre),
        genre?.notes,
        genre?.favoritesong,
        genre?.favoritesongurl,
        songSearchText(genre),
        genreAliasListForSearch(genre).join(' ')
      ].join(' ');
    }

    function genreSearchRank(genre, query) {
      const rawQ = String(query || '').trim();
      const q = normalizeGenreSearchText(rawQ);
      if (!q) return 999;
      const name = normalizeGenreSearchText(genre?.genre || '');
      const aliases = genreAliasListForSearch(genre).map(normalizeGenreSearchText).filter(Boolean);
      const path = normalizeGenreSearchText(categoryLine(genre));
      if (name === q) return 0;
      if (aliases.includes(q)) return 1;
      // For one-word searches like "funk", keep the exact genre above
      // compound names like "free funk" even when the archive has another sort selected.
      if (name.split(' ').includes(q)) return 2;
      if (aliases.some(a => a.split(' ').includes(q))) return 3;
      if (name.startsWith(q)) return 4;
      if (aliases.some(a => a.startsWith(q))) return 5;
      if (name.includes(q)) return 6;
      if (aliases.some(a => a.includes(q))) return 7;
      if (path.includes(q)) return 8;
      return 9;
    }

    function searchGenresInto(inputEl, resultsEl) {
      if (!resultsEl) return;
      const rawQ = inputEl.value.trim();
      const q = normalizeGenreSearchText(rawQ);
      if (!q) {
        resultsEl.innerHTML = '';
        return;
      }

      const matches = (genres || [])
        .map(g => ({ g, rank: genreSearchRank(g, rawQ), blob: normalizeGenreSearchText(genreSearchBlob(g)) }))
        .filter(row => row.rank < 9 || row.blob.includes(q))
        .sort((a, b) => a.rank - b.rank || String(a.g.genre || '').localeCompare(String(b.g.genre || '')))
        .slice(0, 12);

      resultsEl.innerHTML = matches.map(({ g }) => {
        const aliasHit = genreAliasListForSearch(g).find(alias => normalizeGenreSearchText(alias).includes(q));
        return `
        <div class="list-item dc-manual-result-card" data-id="${g.id}" role="button" tabindex="0">
          <strong>${escapeHtml(g.genre || 'Unknown')}</strong>
          <div class="small">${escapeHtml(categoryLine(g))}${aliasHit ? ` · ${escapeHtml(aliasHit)}` : ''}</div>
        </div>
      `;
      }).join('');

      [...resultsEl.querySelectorAll('[data-id]')].forEach(btn => {
        const openPicked = () => {
          const picked = getGenreById(btn.dataset.id);
          if (!picked) return;
          openGenreDetail(picked, true);
        };
        btn.onclick = openPicked;
        btn.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicked();
          }
        };
      });
    }

    function levenshtein(a, b) {
      const m = Array.from({length: b.length + 1}, (_, i) => [i]);
      for (let j = 0; j <= a.length; j++) m[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
            ? m[i - 1][j - 1]
            : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
        }
      }
      return m[b.length][a.length];
    }

    function applyRankSeed() {
      const byNorm = new Map();
      genres.forEach(g => {
        const key = normalizeName(g.genre || '');
        if (!byNorm.has(key)) byNorm.set(key, []);
        byNorm.get(key).push(g);
      });

      unmatchedSeeds = [];

      Object.entries(RANK_SEED).forEach(([seedName, seedData]) => {
        const exact = byNorm.get(normalizeName(seedName));
        if (exact && exact.length) {
          const target = exact[0];
          if (!target.rating || target.rating === '' || target.rating === 'zanger') target.rating = seedData.rating;
          if (!target.rank_order) target.rank_order = seedData.rank_order;
          if ((target.status || '').toLowerCase() === 'unlistened') target.status = 'listened';
          return;
        }

        let best = null;
        let bestScore = Infinity;
        for (const g of genres) {
          const dist = levenshtein(normalizeName(seedName), normalizeName(g.genre || ''));
          if (dist < bestScore) {
            bestScore = dist;
            best = g;
          }
        }

        if (best && bestScore <= 4) {
          if (!best.rating || best.rating === '' || best.rating === 'zanger') best.rating = seedData.rating;
          if (!best.rank_order) best.rank_order = seedData.rank_order;
          if ((best.status || '').toLowerCase() === 'unlistened') best.status = 'listened';
        } else {
          unmatchedSeeds.push(seedName);
        }
      });

      [1,2,3,4,5].forEach(ensureRankOrderForRating);
    }


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

  // Start the lightweight SHA request alongside the Worker request. This keeps
  // the freshness check without putting a second full JSON transfer on startup.
  const githubMetadataPromise = fetchProductionDataMetadata();

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

  githubMetadata = await githubMetadataPromise;

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

  const workerCount = uniqueGenreCount(workerLoaded && workerLoaded.data);
  const githubCount = uniqueGenreCount(githubLoaded && githubLoaded.data);
  const workerMaxId = maxGenreId(workerLoaded && workerLoaded.data);
  const githubMaxId = maxGenreId(githubLoaded && githubLoaded.data);

  if (!loaded || !Array.isArray(loaded.data)) {
    remainingCount.textContent = 'Could not load production data.';
    showSaveToast('Could not load production data from the Worker or GitHub JSON.', true);
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
    window.addEventListener('beforeunload', (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    });

    document.querySelectorAll('.tab-btn[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.screen;
        const ok = switchScreen(name);
        if (!ok) return;
      });
    });

    spinBtn.addEventListener('click', spinWheel);
    document.getElementById('topCrateDigBtn')?.addEventListener('click', openCrateDig);
    document.getElementById('topAlbumDiveBtn')?.addEventListener('click', openCurrentAlbumDive);
    manualToggleBtn.addEventListener('click', () => manualPanel.classList.toggle('hidden'));
    remainingCount?.addEventListener('click', showRemainingCountAudit);

    const manualSearch2 = document.getElementById('manualSearch2');
    const manualResults2 = document.getElementById('manualResults2');

    if (manualSearch2) {
      let manualSearchTimer = null;
      manualSearch2.addEventListener('input', () => {
        clearTimeout(manualSearchTimer);
        const val = manualSearch2.value.trim();
        if (val.length === 0) { searchGenresInto(manualSearch2, manualResults2); return; }
        if (val.length < 3) return;
        manualSearchTimer = setTimeout(() => searchGenresInto(manualSearch2, manualResults2), 300);
      });
      manualSearch2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(manualSearchTimer); searchGenresInto(manualSearch2, manualResults2); }
      });
    }
    document.getElementById('includeSongsToggle').addEventListener('change', updateDiscordBlock);
    document.getElementById('shareToggle')?.addEventListener('click', () => document.getElementById('shareSection')?.classList.toggle('collapsed'));
    document.getElementById('favoriteSongUrl')?.addEventListener('change', function() {
      const url = this.value.trim();
      const statusEl = document.getElementById('favoriteSongFetchStatus');
      if (!url) { if (statusEl) statusEl.textContent = ''; refreshDirtyFromSnapshot(); return; }
      if (!url.includes('spotify.com/track/')) {
        if (statusEl) statusEl.textContent = 'Paste a Spotify track URL.';
        refreshDirtyFromSnapshot();
        return;
      }
      if (statusEl) statusEl.textContent = 'Spotify auto-fill disabled here; URL will still save.';
      refreshDirtyFromSnapshot();
    });

    document.getElementById('copyDiscordBtn').addEventListener('click', async () => {
      updateDiscordBlock();
      await navigator.clipboard.writeText(buildDiscordBlock());
      showSaveToast('Copied Discord genre details.', false);
    });
    document.getElementById('saveBtn').addEventListener('click', async () => {
      if (typeof setLibrarySaveBusy === 'function') setLibrarySaveBusy(true);
      try {
        await prepareAndSaveCurrentGenre();
      } finally {
        if (typeof setLibrarySaveBusy === 'function') setLibrarySaveBusy(false);
      }
    });
    document.getElementById('markListenedBtn')?.addEventListener('click', markCurrentGenreListened);
    document.getElementById('unlistenBtn')?.addEventListener('click', unlistenCurrentGenre);
    document.getElementById('clearPendingBtn')?.addEventListener('click', clearPendingSongs);
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('#reexaminePendingBtn');
      if (btn) reexaminePendingTags();
    });
    ['favoriteSong','favoriteSongUrl','songsListenedBulk','notes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', markDirty);
    });
    ['monthlyContender','monthFavorite','monthLeastFavorite'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', markDirty);
    });


    document.getElementById('zangerBtn').addEventListener('click', () => {
      if (currentGenre) markAsZangerToday(currentGenre);
    });

    const historyMonthFilter = document.getElementById('historyMonthFilter');
    const historyRatingFilter = document.getElementById('historyRatingFilter');
    const archiveSearchInput = document.getElementById('archiveSearchInput');
    const archiveFlagFilter = document.getElementById('archiveFlagFilter');
    const archiveSortFilter = document.getElementById('archiveSortFilter');
    const archiveCopyBtn = document.getElementById('archiveCopyBtn');
    const archiveRefreshBtn = document.getElementById('archiveRefreshBtn');
    const archivePlaylistToggleVisibleBtn = document.getElementById('archivePlaylistToggleVisibleBtn');
    const archivePlaylistSelectedBtn = document.getElementById('archivePlaylistSelectedBtn');

    if (historyMonthFilter) historyMonthFilter.addEventListener('change', renderHistory);
    if (historyRatingFilter) historyRatingFilter.addEventListener('change', renderHistory);
        if (archiveSearchInput) {
      let archiveSearchTimer = null;
      archiveSearchInput.addEventListener('input', () => {
        clearTimeout(archiveSearchTimer);
        const val = archiveSearchInput.value.trim();
        if (val.length === 0) { renderHistory(); return; }
        if (val.length < 3) return;
        archiveSearchTimer = setTimeout(renderHistory, 300);
      });
      archiveSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(archiveSearchTimer); renderHistory(); }
      });
    }
    if (archiveFlagFilter) archiveFlagFilter.addEventListener('change', renderHistory);
    if (archiveRefreshBtn) archiveRefreshBtn.addEventListener('click', () => { renderHistory(); showSaveToast('Archive results refreshed.', false); });
    if (archiveSortFilter) archiveSortFilter.addEventListener('change', renderHistory);
    if (archivePlaylistToggleVisibleBtn) archivePlaylistToggleVisibleBtn.addEventListener('click', archiveToggleVisiblePlaylistSelection);
    if (archivePlaylistSelectedBtn) archivePlaylistSelectedBtn.addEventListener('click', openArchivePlaylistModal);

    document.querySelectorAll('.archive-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        archiveView = btn.dataset.archiveView || 'all';
        document.querySelectorAll('.archive-view-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderHistory();
      });
    });

    if (archiveCopyBtn) {
      archiveCopyBtn.addEventListener('click', async () => {
        const items = window._archiveItems || [];
        if (!items.length) return;
        const lines = items.map(g => `${dateValue(g) || 'No date'}: ${g.genre || 'Unknown'}${g.rating ? ` (${g.rating}★)` : ''}`);
        await navigator.clipboard.writeText(lines.join('\n'));
        const old = archiveCopyBtn.textContent;
        archiveCopyBtn.textContent = 'Copied!';
        setTimeout(() => { archiveCopyBtn.textContent = old; }, 2000);
      });
    }

    passwordSubmitBtn.addEventListener('click', async () => {
      const pw = passwordInput.value.trim();
      if (!pw) {
        passwordNotice.textContent = 'Enter the password.';
        return;
      }
    const oldSubmitText = passwordSubmitBtn.textContent;
    passwordSubmitBtn.disabled = true;
    passwordSubmitBtn.classList.add('is-saving');
    passwordSubmitBtn.textContent = 'Saving…';
    passwordNotice.textContent = 'Saving to GitHub…';
      try {
        const completedAction = pendingSaveAction;
        await doSaveWithPassword(pw);
        appPassword = pw;
        closePasswordModal();
        pendingSaveAction = completedAction;
        updateRemainingCount();
        populateMonthFilter();
        const activeScreenId = document.querySelector('.screen.active')?.id || '';
        const skipListenRefresh = !!window.__dgSkipNextListenRefreshAfterSave || !!window.__dgIdentitySaveInFlight;
        // v193: Password-modal saves used to rebuild History + Rankings + Visuals +
        // the full Listen screen immediately after the first password entry. On large
        // annotated libraries that creates ~100k live nodes and triggers Firefox's
        // password/form observers after the password field has been used. Only refresh
        // the active screen, and keep Genre Identity saves from rebuilding Listen.
        if (activeScreenId === 'screen-history') renderHistory();
        if (activeScreenId === 'screen-ranking') renderRankings();
        if (activeScreenId === 'screen-viz') renderVisuals();
        if (pendingSaveAction === 'library_save') {
          libraryUpdatesPending = false;
          window.__dgStudioCleanupSavePending = false;
          stagedQueueReactionKeys.clear();
          toggleLibrarySaveButton(false);
          setUnsavedState(false);
          if (currentGenre && document.getElementById('screen-listen')?.classList.contains('active')) {
            const restore = preserveScrollSnapshot();
            if (!skipListenRefresh) {
              loadListenScreen(currentGenre, { preserveDirty: false, skipSpotifyHydration: true });
            } else {
              try {
                window.dispatchEvent(new CustomEvent('dailygenre:identity-save-skip-listen-refresh', { detail: { genreId: currentGenre?.id } }));
              } catch (_) {}
            }
            applyDetailEditMode(detailEditMode);
            resetListenDirtySnapshot();
            restore();
          }
          const status = document.getElementById('vizRefreshStatus');
          if (status) status.textContent = 'Library updates saved.';
          showSaveToast('Library updates saved.', false);
        } else {
          if (currentGenre && document.getElementById('screen-listen')?.classList.contains('active')) {
            loadListenScreen(currentGenre, { preserveDirty: false, skipSpotifyHydration: true });
          }
          lastSavedListenSnapshot = buildListenSnapshot();
          setUnsavedState(false);
          showSaveToast(pendingSaveAction === 'mark_listened' ? `Saved. ${currentGenre.genre || 'Genre'} marked as listened today.` : `Saved changes to ${currentGenre.genre || 'genre'}.`, false);
        }
        pendingSaveAction = null;
      } catch (e) {
        if (e && (e.code === 'STALE_DATA' || e.code === 'NO_REVISION')) {
          passwordNotice.textContent = 'Newer saved data exists. Reload this development page before saving so it is not overwritten.';
          showSaveToast('Newer data exists elsewhere — reload before saving.', true);
          return;
        }
        if (e && e.code === 'AUTH_FAILED') {
          passwordNotice.textContent = 'That password did not work.';
          return;
        }
        passwordNotice.textContent = `Save failed: ${e?.message || 'Unknown Worker error.'}`;
        showSaveToast(passwordNotice.textContent, true);
      }
        finally {
        passwordSubmitBtn.disabled = false;
        passwordSubmitBtn.classList.remove('is-saving');
        passwordSubmitBtn.textContent = oldSubmitText || 'Save now';
    }
    });

    passwordCancelBtn.addEventListener('click', closePasswordModal);

    passwordInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') passwordSubmitBtn.click();
    });

    passwordModal.addEventListener('click', (e) => {
      if (e.target === passwordModal) closePasswordModal();
    });

    function suppressAutofillOnGeneratedControls(root = document) {
      // v193: Generated library/detail controls are not login fields. Marking them
      // opt-out reduces extension/password-manager work after the save-password modal.
      try {
        root.querySelectorAll('input:not([type="password"]), textarea, select').forEach(el => {
          if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
          if (!el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'false');
          el.setAttribute('data-lpignore', 'true');
          el.setAttribute('data-1p-ignore', 'true');
          el.setAttribute('data-bwignore', 'true');
        });
      } catch (_) {}
    }
    window.suppressAutofillOnGeneratedControls = suppressAutofillOnGeneratedControls;

    // App boot is intentionally run after every helper and Spotify function is declared.
    // Running it here used to call Spotify/session helpers before they existed, which stopped data loading.

        // ── Visualization helpers ─────────────────────────────────────────
    let _vizCharts = {};
    let _vizMode = 'monthly';

    function vizDestroyAll() {
      Object.values(_vizCharts).forEach(c => { try { c.destroy(); } catch(e) {} });
      _vizCharts = {};
    }
    function vizMonths() {
      return [...new Set((genres || []).map(g => dateValue(g)).filter(Boolean).map(d => d.slice(0,7)))].sort();
    }
    function vizMode() { return _vizMode || 'monthly'; }

    function applyVizModeDisplay() {
      const mode = vizMode() === 'alltime' ? 'alltime' : 'monthly';
      const screen = document.getElementById('screen-viz');
      if (screen) {
        screen.classList.toggle('viz-mode-monthly', mode === 'monthly');
        screen.classList.toggle('viz-mode-alltime', mode === 'alltime');
      }
      document.querySelectorAll('[data-viz-mode]').forEach(btn => {
        btn.classList.toggle('active', (btn.dataset.vizMode || 'monthly') === mode);
      });
      const monthSel = document.getElementById('vizMonthSelect');
      if (monthSel) monthSel.style.display = mode === 'monthly' ? '' : 'none';
      const monthlyView = document.getElementById('vizViewMonthly');
      const alltimeView = document.getElementById('vizViewAlltime');
      if (monthlyView) monthlyView.style.setProperty('display', mode === 'monthly' ? 'grid' : 'none', 'important');
      if (alltimeView) alltimeView.style.setProperty('display', mode === 'alltime' ? 'grid' : 'none', 'important');
    }

    function setVizMode(mode) {
      _vizMode = mode === 'alltime' ? 'alltime' : 'monthly';
      clearVisualDrilldown(false);
      applyVizModeDisplay();
      renderVisuals();
    }
    function vizSelectedMonth() {
      const sel = document.getElementById('vizMonthSelect');
      const months = vizMonths();
      if (!months.length) return '';
      if (sel && sel.value) return sel.value;
      return months[months.length - 1];
    }
    function spotifyHref(song) {
      return normalizeSongUrl(song?.spotifyUrl || song?.url || '');
    }

    function songDisplayName(song) {
      return cleanPastedCitationArtifacts((song?.artist ? `${song.artist} — ` : '') + (song?.title || 'Untitled track'));
    }

    function vizSongTitleLink(song) {
      const href = spotifyHref(song);
      const label = escapeHtml(songDisplayName(song));
      return href
        ? `<a class="viz-song-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`
        : `<span>${label}</span>`;
    }

    function songEffectiveYear(song) {
      const eraYear = Number(String(song?.eraYear || '').match(/\d{4}/)?.[0] || 0) || null;
      if (eraYear) return { year: eraYear, source: 'Era override' };
      const eraDecade = String(song?.eraDecade || '').match(/(\d{3})0s?/);
      if (eraDecade) return { year: Number(`${eraDecade[1]}0`), source: 'Era override' };
      const releaseYear = Number(song?.releaseYear || 0) || null;
      return releaseYear ? { year: releaseYear, source: song?.releaseSource || 'Spotify' } : { year: null, source: '' };
    }

    function songDecadeLabel(song) {
      const effective = songEffectiveYear(song);
      return effective.year ? `${Math.floor(effective.year / 10) * 10}s` : 'Unknown';
    }

    function genreMatchesFocus(genre) {
      return !vizFocusedGenreId || String(genre?.id) === String(vizFocusedGenreId);
    }

    function vizFocusedGenre() {
      return (genres || []).find(g => String(g.id) === String(vizFocusedGenreId)) || null;
    }

    function vizFilteredItems(items) {
      return (items || []).filter(genreMatchesFocus);
    }

    function renderVisualFilters() {
      const mount = document.getElementById('vizFilterMount');
      if (!mount) return;
      const listened = allListenedGenresForMaintenance().slice().sort((a,b) => String(a.genre || '').localeCompare(String(b.genre || '')));
      mount.innerHTML = `<div class="viz-filter-row">
        <div class="viz-filter-control">
          <label for="vizGenreFocusSelect">Genre focus</label>
          <select id="vizGenreFocusSelect">
            <option value="">All genres</option>
            ${listened.map(g => `<option value="${escapeHtml(String(g.id))}" ${String(g.id) === String(vizFocusedGenreId) ? 'selected' : ''}>${escapeHtml(g.genre || 'Unknown')}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Clear drilldown</button>
      </div>`;
      document.getElementById('vizGenreFocusSelect')?.addEventListener('change', event => {
        vizFocusedGenreId = event.target.value || '';
        vizDrilldownState = null;
        renderVisuals();
      });
    }

    function renderFocusBanner() {
      const mount = document.getElementById('vizFocusBanner');
      if (!mount) return;
      const focused = vizFocusedGenre();
      if (!focused) { mount.innerHTML = ''; return; }
      const counts = genreReactionCounts(focused);
      const songs = genreReactionSongs(focused);
      mount.innerHTML = `<div class="viz-focus-banner"><div><div class="viz-focus-title">${escapeHtml(focused.genre || 'Focused genre')}</div><div class="small">${songs.length} track${songs.length === 1 ? '' : 's'} · 👍 ${counts[3]} · 🤷 ${counts[2]} · 👎 ${counts[1]} · — ${counts.unrated}</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="openGenreDetail(vizFocusedGenre(), false)">Open Genre</button></div>`;
    }

    function showMoreVizQueue(queue) {
      vizQueueLimits[queue] = (vizQueueLimits[queue] || 8) + 8;
      renderVisuals();
    }

    function clearVisualDrilldown(rerender=true) {
      vizDrilldownState = null;
      if (rerender) renderVisuals();
    }


    function setVisualDrilldown(type, value, mode='alltime') {
      const nextMode = mode || vizMode();
      if (nextMode && nextMode !== vizMode()) {
        _vizMode = nextMode;
        document.querySelectorAll('[data-viz-mode]').forEach(b => b.classList.toggle('active', (b.dataset.vizMode || 'monthly') === _vizMode));
        const monthSel = document.getElementById('vizMonthSelect');
        if (monthSel) monthSel.style.display = _vizMode === 'monthly' ? '' : 'none';
      }
      vizDrilldownState = { type, value, mode: nextMode };
      renderVisuals();
      setTimeout(() => {
        const target = document.getElementById(visualDrilldownMountId(vizDrilldownState));
        (target?.closest('.viz-card') || target)?.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 30);
    }

    function vizRowsForCurrentScope() {
      const mode = vizDrilldownState?.mode || vizMode();
      return mode === 'monthly' ? vizFilteredItems(vizBaseGenres()) : vizFilteredItems(allListenedGenresForMaintenance());
    }

    function findGenreSongByKey(genreId, key) {
      const genre = (genres || []).find(g => String(g.id) === String(genreId));
      if (!genre) return null;
      const songs = inflateSongsFromStorage(genre.songs_listened || []);
      let found = null;
      eachSongInLog(songs, song => { if (!found && songIdentity(song) === key) found = song; });
      return found ? { genre, songs, song: found } : null;
    }

    function saveEraOverride(encodedGenreId, encodedKey, inputId) {
      const genreId = decodeURIComponent(String(encodedGenreId || ''));
      const key = decodeURIComponent(String(encodedKey || ''));
      const value = cleanPastedCitationArtifacts(document.getElementById(inputId)?.value || '');
      const target = findGenreSongByKey(genreId, key);
      if (!target) { showSaveToast('Could not find that song for era override.', true); return; }
      const decade = value.match(/^(\d{3})0s?$/i);
      const year = value.match(/^(\d{4})$/);
      if (!year && !decade && value) { showSaveToast('Use a year like 1953 or a decade like 1950s.', true); return; }
      target.song.eraYear = year ? year[1] : '';
      target.song.eraDecade = decade ? `${decade[1]}0s` : '';
      target.genre.songs_listened = target.songs;
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
      const restore = preserveScrollSnapshot();
      renderVisuals();
      restore();
      showSaveToast('Era override updated — click Save Library Updates to persist it.', false);
    }

    function visualDrilldownMountId(state=vizDrilldownState) {
      if (!state) return 'vizDrilldownPanel';
      const suffix = state.mode === 'monthly' ? 'Monthly' : 'All';
      if (state.type === 'decade') return `vizDecadeDrilldown${suffix}`;
      if (state.type === 'reaction') return `vizReactionDrilldown${suffix}`;
      return 'vizDrilldownPanel';
    }

    function clearVisualDrilldownMounts() {
      ['vizDrilldownPanel','vizDecadeDrilldownMonthly','vizDecadeDrilldownAll','vizReactionDrilldownMonthly','vizReactionDrilldownAll'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
      });
      document.querySelectorAll('#screen-viz .viz-card-selected').forEach(el => el.classList.remove('viz-card-selected'));
      document.querySelectorAll('#screen-viz .viz-card-with-local-drilldown').forEach(el => el.classList.remove('viz-card-with-local-drilldown'));
    }

    function vizAllRowsForItems(items) {
      return (items || []).flatMap(genre => vizOfficialSongs(genre).map(song => ({ genre, song })));
    }

    function visualHealthStats(items) {
      const songs = vizAllOfficialSongs(items || []);
      const reactions = vizReactionCountSummary(songs);
      const rated = reactions[1] + reactions[2] + reactions[3];
      const liked = reactions[3];
      const metadataRows = collectMetadataRows(items || []);
      return {
        songs,
        reactions,
        rated,
        liked,
        likeRate: rated ? Math.round((liked / rated) * 100) : 0,
        ratedPct: songs.length ? Math.round((rated / songs.length) * 100) : 0,
        missingMetadata: metadataRows.length,
        brokenLinks: metadataRows.filter(row => row.group === 'broken').length,
        unrated: reactions.unrated
      };
    }

    function vizSourceLabel(song) {
      if (song?.isAdd) return 'ADD';
      if (song?.isLevelUp || song?.levelUpFor) return 'LEVEL UP';
      if (song?.promotedFrom) return `Promoted from ${song.promotedFrom}`;
      return 'Logged';
    }

    function vizDrilldownRowsForState(items, state) {
      let title = '';
      let rows = [];
      let explainer = '';
      if (state.type === 'decade') {
        title = `Songs in the ${state.value}`;
        rows = vizAllRowsForItems(items).filter(row => songDecadeLabel(row.song) === state.value);
        explainer = 'Uses effective era year first, then Spotify release year when no override exists.';
      } else if (state.type === 'reaction') {
        title = `${reactionEmoji(state.value)} ${reactionLabel(state.value)} songs`;
        rows = vizAllRowsForItems(items).filter(row => Number(state.value) ? Number(row.song.reaction) === Number(state.value) : ![1,2,3].includes(Number(row.song.reaction)));
        explainer = 'Shows the tracks behind the selected reaction bucket, separate from theme-fit score.';
      }
      rows.sort((a,b) => String(a.genre.genre || '').localeCompare(String(b.genre.genre || '')) || String(songDisplayName(a.song)).localeCompare(String(songDisplayName(b.song))));
      return { title, rows, explainer };
    }

    function renderVisualDrilldown() {
      clearVisualDrilldownMounts();
      if (!vizDrilldownState) return;
      const mount = document.getElementById(visualDrilldownMountId(vizDrilldownState));
      if (!mount) return;
      const activeCard = mount.closest('.viz-card');
      activeCard?.classList.add('viz-card-selected');
      activeCard?.classList.add('viz-card-with-local-drilldown');
      const items = vizRowsForCurrentScope();
      const { title, rows:allRows, explainer } = vizDrilldownRowsForState(items, vizDrilldownState);
      const totalRows = allRows.length;
      const rows = allRows.slice(0, 60);
      const modeLabel = vizDrilldownState.mode === 'monthly' ? `Monthly · ${vizMonthTitle(vizSelectedMonth())}` : 'All time';
      const focus = vizFocusedGenre();
      const focusLabel = focus ? focus.genre : 'All genres';
      const rated = rows.filter(row => [1,2,3].includes(Number(row.song.reaction))).length;
      const avgFit = rows.filter(row => Number(row.song.score)).length
        ? (rows.reduce((sum,row) => sum + (Number(row.song.score || 0) || 0), 0) / rows.filter(row => Number(row.song.score)).length).toFixed(1)
        : '—';
      mount.innerHTML = `<div class="viz-drilldown is-active"><div class="viz-drilldown-head"><div><div class="eyebrow" style="margin:0;">Selected crate · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(title)}</strong><div class="small">${totalRows} matching track${totalRows === 1 ? '' : 's'}${totalRows > rows.length ? ` · showing first ${rows.length} in a scrollable crate` : ''}</div><div class="viz-drill-context"><span>Focus: ${escapeHtml(focusLabel)}</span><span>Rated here: ${rated}/${rows.length}</span><span>Avg fit: ${escapeHtml(avgFit)}</span></div><div class="viz-drill-explain">${escapeHtml(explainer)}</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Close</button></div>${rows.length ? `<div class="viz-drilldown-list">${rows.map((row, idx) => {
        const effective = songEffectiveYear(row.song);
        const inputId = `eraOverride_${idx}_${String(row.genre.id).replace(/[^a-zA-Z0-9]/g,'')}`;
        const savedEra = row.song.eraYear || row.song.eraDecade || '';
        const reaction = Number(row.song.reaction || 0);
        const fit = Number(row.song.score || 0) || null;
        const art = row.song.artwork ? `<img class="viz-drill-art" src="${escapeHtml(row.song.artwork)}" alt="" loading="lazy">` : '<div class="viz-drill-art"></div>';
        const eraLine = effective.year ? `${effective.source}: ${effective.year}` : 'No year';
        const spotifyLine = row.song.releaseYear && (effective.source !== 'Spotify' || savedEra) ? ` · Spotify: ${row.song.releaseYear}` : '';
        return `<div class="viz-drill-row viz-record-row">${art}<div><div class="viz-drill-title-line">${vizSongTitleLink(row.song)}</div><div class="viz-drill-meta">${escapeHtml(row.genre.genre || 'Unknown genre')} · ${reactionEmoji(reaction)} ${escapeHtml(reactionLabel(reaction))}${fit ? ` · Fit ${fit}/5` : ''} · ${escapeHtml(vizSourceLabel(row.song))}</div><div class="viz-drill-meta">${escapeHtml(eraLine)}${escapeHtml(spotifyLine)}</div></div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open Genre</button>${spotifyHref(row.song) ? `<button type="button" onclick="window.open('${escapeHtml(spotifyHref(row.song))}', '_blank', 'noopener')">Spotify</button>` : ''}</div></div>`;
      }).join('')}</div>` : '<div class="viz-empty">No songs found for this drilldown.</div>'}</div>`;
    }

    function renderGenreDossier(items) {
      const mount = document.getElementById('vizGenreDossier');
      if (!mount) return;
      const focused = vizFocusedGenre();
      if (!focused) { mount.innerHTML = ''; return; }
      const songs = vizOfficialSongs(focused);
      const counts = vizReactionCountSummary(songs);
      const rated = counts[1] + counts[2] + counts[3];
      const likeRate = rated ? Math.round((counts[3] / rated) * 100) : 0;
      const fitSongs = songs.filter(song => Number(song.score));
      const avgFit = fitSongs.length ? (fitSongs.reduce((sum,song) => sum + Number(song.score || 0), 0) / fitSongs.length).toFixed(1) : '—';
      const strongFit = songs.filter(song => Number(song.score || 0) >= 4).length;
      const artists = [...new Set(songs.map(song => cleanPastedCitationArtifacts(song.artist || '')).filter(Boolean))];
      const decades = vizSongDecadeStats([focused]);
      const decadeLabels = Object.keys(decades.counts).sort((a,b) => decades.counts[b] - decades.counts[a]);
      const favorite = focused.favoritesong ? `${focused.favoriteartist ? `${focused.favoriteartist} — ` : ''}${focused.favoritesong}` : 'No favorite set';
      const playlistCandidates = songs.filter(song => Number(song.reaction) === 3 || Number(song.score || 0) >= 4).length;
      mount.innerHTML = `<div class="viz-dossier"><div class="viz-dossier-head"><div><div class="eyebrow" style="margin:0;">Genre dossier</div><h3 class="viz-dossier-title">${escapeHtml(focused.genre || 'Focused genre')}</h3><div class="small">A focused listening profile: taste, fit, era spread, and playlist readiness.</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="openGenreDetail(vizFocusedGenre(), false)">Open Genre</button></div><div class="viz-dossier-grid"><div class="viz-dossier-card"><div class="viz-dossier-label">Favorite track</div><div class="viz-dossier-value">${escapeHtml(favorite)}</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Reaction split</div><div class="viz-dossier-value">👍 ${counts[3]} · 🤷 ${counts[2]} · 👎 ${counts[1]}</div><div class="viz-dossier-sub">${likeRate}% like rate across rated tracks</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Theme fit</div><div class="viz-dossier-value">${escapeHtml(avgFit)} avg · ${strongFit} strong</div><div class="viz-dossier-sub">Strong = fit 4–5</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Artists</div><div class="viz-dossier-value">${artists.length}</div><div class="viz-dossier-sub">${escapeHtml(artists.slice(0,3).join(' · ') || 'No artist metadata')}</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Era spread</div><div class="viz-dossier-value">${escapeHtml(decadeLabels.slice(0,3).join(' · ') || 'Unknown')}</div><div class="viz-dossier-sub">${decades.overrides || 0} era override${decades.overrides === 1 ? '' : 's'} · ${decades.unknown || 0} unknown</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Playlist candidates</div><div class="viz-dossier-value">${playlistCandidates}</div><div class="viz-dossier-sub">👍 tracks plus strong theme fits</div></div></div></div>`;
    }

    function vizBaseGenres() {
      const all = (genres || []).filter(g => ['listened','veto'].includes((g.status || '').toLowerCase()) && dateValue(g));
      if (vizMode() === 'alltime') return all;
      const month = vizSelectedMonth();
      return all.filter(g => (dateValue(g) || '').startsWith(month));
    }
    function vizOfficialSongs(genre) { return inflateSongsFromStorage(genre?.songs_listened || []).filter(s => !s.isPending).flatMap(s => s.levelUp ? [s, s.levelUp] : [s]); }
    function vizAllOfficialSongs(items) { return items.flatMap(vizOfficialSongs); }
    function vizMonthTitle(month) {
      if (!month) return 'No month selected';
      const [y, m] = month.split('-').map(Number);
      try { return new Date(y, m - 1, 1).toLocaleString(undefined, { month:'long', year:'numeric' }); }
      catch(e) { return month; }
    }
    function vizNumericRating(g) {
      if (!g) return 0;
      if (String(g.rating || '') === 'zanger') return 0;
      return Number(g.rating || 0);
    }
    function vizCategoryRoot(g) {
      const raw = categoryLine(g) || 'Uncategorized';
      return raw.split(/[/>|]/).map(x => String(x || '').trim()).filter(Boolean)[0] || raw || 'Uncategorized';
    }
    function vizSongDecadeStats(items) {
      const counts = {};
      let known = 0;
      let unknown = 0;
      let overrides = 0;
      vizAllOfficialSongs(items).forEach(song => {
        const effective = songEffectiveYear(song);
        const year = effective.year;
        if (!Number.isInteger(year) || year < 1800 || year > 2200) {
          unknown += 1;
          return;
        }
        if (song.eraYear || song.eraDecade) overrides += 1;
        const decade = `${Math.floor(year / 10) * 10}s`;
        counts[decade] = (counts[decade] || 0) + 1;
        known += 1;
      });
      return { counts, known, unknown, overrides };
    }

    function vizArtists(items) {
      const names = new Set();
      let songsWithArtists = 0;
      items.forEach(g => {
        vizOfficialSongs(g).forEach(s => {
          const a = String(s.artist || '').trim();
          if (a) {
            songsWithArtists += 1;
            a.split(/,|&| feat\.? | featuring /i).map(x => x.trim()).filter(Boolean).forEach(n => names.add(n));
          }
        });
        const fa = String(g.favoriteartist || '').trim();
        if (fa) names.add(fa);
      });
      return { uniqueArtists: names.size, songsWithArtists };
    }
    function vizEstimatedMinutes(songs) {
      const list = Array.isArray(songs) ? songs : [];
      const totalMs = list.reduce((sum, song) => sum + (Number(song.durationMs || 0) || (3.5 * 60 * 1000)), 0);
      return Math.round(totalMs / 60000);
    }

    function vizFormatMinutes(mins) {
      const h = Math.floor(mins / 60), m = mins % 60;
      if (!h) return `${m}m`;
      return `${h}h ${m}m`;
    }
    function vizReactionRows(items) {
      return items.flatMap(g => vizOfficialSongs(g).map(song => ({ genre:g, song, reaction:Number(song.reaction || 0) })))
        .filter(row => [1,2,3].includes(row.reaction));
    }

    function vizCrossoverRows(items) {
      const bySong = new Map();
      items.forEach(genre => {
        vizOfficialSongs(genre).forEach(song => {
          if (Number(song.score || 0) <= 3) return;
          const key = songIdentity(song);
          if (!key) return;
          if (!bySong.has(key)) bySong.set(key, { song, genres:[] });
          const row = bySong.get(key);
          if (!row.genres.some(entry => String(entry.genre.id) === String(genre.id))) {
            row.genres.push({ genre, fit:Number(song.score) });
          }
        });
      });
      return [...bySong.values()]
        .filter(row => row.genres.length > 1)
        .sort((a,b) => b.genres.length - a.genres.length || String(a.song.title || '').localeCompare(String(b.song.title || '')));
    }

    function visualActionArg(value='') {
      return encodeURIComponent(String(value || '')).replace(/'/g, '%27');
    }

    function vizOpenGenreEncoded(encodedName) {
      vizOpenGenreChip(decodeURIComponent(String(encodedName || '')));
    }

    function openGenreByIdEncoded(encodedId, editMode=false) {
      const id = decodeURIComponent(String(encodedId || ''));
      const g = (genres || []).find(x => String(x.id) === String(id));
      if (g) openGenreDetail(g, !!editMode);
    }

    window.openGenreByIdEncoded = openGenreByIdEncoded;

    function vizOpenGenreChip(name) {
      const g = (genres || []).find(x => String(x.genre || '') === String(name || ''));
      if (g) openGenreDetail(g, false);
    }
    function vizPalette() { return ['#d88a22','#8c5b23','#4e8a35','#b83230','#5b6b82','#c9960e','#8c4fb8','#2c7fb8','#00a8a8','#f05a7e','#8b9b0f','#ff7f0e']; }
    function vizLegend(el, labels, values, colors) {
      if (!el) return;
      el.innerHTML = labels.map((label, i) => `<div class="viz-legend-item"><span class="viz-legend-dot" style="background:${colors[i]}"></span><span>${escapeHtml(String(label))} (${values[i]})</span></div>`).join('');
    }
    function vizRenderKPIs(el, stats) {
      if (!el) return;
      el.innerHTML = stats.map(s => `<div class="viz-kpi"><div class="viz-kpi-val">${escapeHtml(String(s.value))}</div><div class="viz-kpi-label">${escapeHtml(String(s.label))}</div></div>`).join('');
    }
    function vizRenderRatingsContent(items) {
      const map = { '5': [], '4': [], '3': [], '2': [], '1': [], 'zanger': [] };
      items.forEach(g => { const k = String(g.rating || ''); if (k === 'zanger') map.zanger.push(g); else if (map[k]) map[k].push(g); });
      const groups = [['5','Inject This Into My Veins'],['4','Hell Yeah, Run It Back'],['3','Glad I Heard It'],['2','Respectfully, Nah'],['1','Get This Off My Turntable'],['zanger','Zanger']];
      const root = document.getElementById('vizRatingsContent');
      if (!root) return;
      root.innerHTML = groups.map(([k, label]) => {
        const list = map[k].sort((a,b) => (a.rank_order ?? 9999) - (b.rank_order ?? 9999) || String(a.genre || '').localeCompare(String(b.genre || '')));
        return `<div class="viz-rating-group"><div class="viz-rating-heading"><span class="viz-star">${k === 'zanger' ? 'Z' : '★'.repeat(Number(k || 0))}</span><span>${escapeHtml(label)}</span></div><div class="viz-rating-chips">${list.length ? list.map(g => `<button type="button" class="viz-chip viz-click-chip" onclick="vizOpenGenreEncoded('${visualActionArg(g.genre || '')}')">${escapeHtml(g.genre || 'Unknown')}</button>`).join('') : '<div class="viz-chip-none">None yet.</div>'}</div></div>`;
      }).join('');
    }

    function vizRenderHighlights(items) {
      const mount = document.getElementById('vizHighlightsMonthly');
      if (!mount) return;
      if (!items.length) { mount.innerHTML = '<div class="viz-empty">No genres logged for this month yet.</div>'; return; }
      const sorted = items.slice().sort((a,b) => String(dateValue(a)||'').localeCompare(String(dateValue(b)||'')) || String(a.genre||'').localeCompare(String(b.genre||'')));
      const first = sorted[0], last = sorted[sorted.length - 1];
      const explicitFav = items.find(g => !!g.monthfavorite);
      const explicitLeast = items.find(g => !!g.monthleastfavorite);
      const rated = items.filter(g => String(g.rating || '') !== 'zanger' && g.rating !== '' && g.rating != null);
      const favorite = explicitFav || rated.slice().sort((a,b) => vizNumericRating(b) - vizNumericRating(a) || ((a.rank_order ?? 9999) - (b.rank_order ?? 9999)) || String(a.genre||'').localeCompare(String(b.genre||'')))[0] || first;
      const least = explicitLeast || rated.slice().sort((a,b) => vizNumericRating(a) - vizNumericRating(b) || String(a.genre||'').localeCompare(String(b.genre||'')))[0] || last;
      const favoriteSongGenre = items.find(g => g.favoritesong && (g.monthfavorite || g.monthlycontender)) || items.find(g => g.favoritesong) || null;
      mount.innerHTML = [
        ['Favorite genre', favorite?.genre || '—', categoryLine(favorite || {})],
        ['Least favorite', least?.genre || '—', categoryLine(least || {})],
        ['Favorite song', favoriteSongGenre?.favoritesong || '—', favoriteSongGenre?.favoriteartist || favoriteSongGenre?.genre || ''],
        ['First → Last', `${first?.genre || '—'} → ${last?.genre || '—'}`, `${dateValue(first) || ''} to ${dateValue(last) || ''}`],
      ].map(([label, val, sub]) => `<div class="viz-hl-card"><div class="viz-hl-label">${escapeHtml(String(label))}</div><div class="viz-hl-val">${escapeHtml(String(val))}</div><div class="viz-hl-sub">${escapeHtml(String(sub || ''))}</div></div>`).join('');
    }
    function vizRenderArtistStats(items) {
      const mount = document.getElementById('vizArtistsMonthly');
      if (!mount) return;
      const songs = vizAllOfficialSongs(items), artists = vizArtists(items), avg = items.length ? (artists.uniqueArtists / items.length).toFixed(1) : '0';
      mount.innerHTML = [['Unique Artists', artists.uniqueArtists],['Songs Logged', songs.length],['With Artist Data', artists.songsWithArtists],['Artists / Genre', avg]].map(([label, value]) => `<div class="viz-artist-stat"><div class="viz-artist-num">${escapeHtml(String(value))}</div><div class="viz-artist-lbl">${escapeHtml(String(label))}</div></div>`).join('') + (songs.length && !artists.uniqueArtists ? '<div class="small" style="grid-column:1/-1;">Artist names could not be inferred from stored song labels. Use Edit track URL or refresh metadata for those entries.</div>' : '');
    }
    function vizReactionCountSummary(songs) {
      const counts = { 3:0, 2:0, 1:0, unrated:0 };
      songs.forEach(song => {
        const reaction = Number(song.reaction || 0);
        if ([1,2,3].includes(reaction)) counts[reaction] += 1;
        else counts.unrated += 1;
      });
      return counts;
    }

    function vizRenderSongReactions(mountId, items) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const allSongs = vizAllOfficialSongs(items);
      if (!allSongs.length) {
        mount.innerHTML = '<div class="viz-empty">No logged songs in this view yet.</div>';
        return;
      }
      const overall = vizReactionCountSummary(allSongs);
      const rows = items.map(genre => {
        const songs = vizOfficialSongs(genre);
        return { genre, songs: songs.length, counts: vizReactionCountSummary(songs) };
      }).filter(row => row.songs > 0 && (row.counts[1] + row.counts[2] + row.counts[3]) > 0)
        .sort((a,b) => b.counts[3] - a.counts[3] || b.songs - a.songs || String(a.genre.genre || '').localeCompare(String(b.genre.genre || '')))
        .slice(0, 12);

      const chartId = `${mountId}Donut`;
      mount.innerHTML = `
        <div class="viz-reaction-compact">
          <div class="viz-reaction-overview">
            <div class="viz-reaction-ring viz-clickable-chart" title="Click a slice to drill into tracks"><canvas id="${chartId}"></canvas></div>
            <div class="viz-reaction-legend">
              <button type="button" class="viz-reaction-legend-row ${vizDrilldownState?.type === 'reaction' && Number(vizDrilldownState.value) === 3 && vizDrilldownState.mode === vizMode() ? 'active' : ''}" onclick="setVisualDrilldown('reaction', 3, vizMode())"><span><span class="emoji">👍</span>I Fuck With This</span><strong>${overall[3]}</strong></button>
              <button type="button" class="viz-reaction-legend-row ${vizDrilldownState?.type === 'reaction' && Number(vizDrilldownState.value) === 2 && vizDrilldownState.mode === vizMode() ? 'active' : ''}" onclick="setVisualDrilldown('reaction', 2, vizMode())"><span><span class="emoji">🤷</span>Meh, It’s Fine</span><strong>${overall[2]}</strong></button>
              <button type="button" class="viz-reaction-legend-row ${vizDrilldownState?.type === 'reaction' && Number(vizDrilldownState.value) === 1 && vizDrilldownState.mode === vizMode() ? 'active' : ''}" onclick="setVisualDrilldown('reaction', 1, vizMode())"><span><span class="emoji">👎</span>Fuck Off</span><strong>${overall[1]}</strong></button>
              <button type="button" class="viz-reaction-legend-row ${vizDrilldownState?.type === 'reaction' && Number(vizDrilldownState.value) === 0 && vizDrilldownState.mode === vizMode() ? 'active' : ''}" onclick="setVisualDrilldown('reaction', 0, vizMode())"><span><span class="emoji">—</span>Unrated</span><strong>${overall.unrated}</strong></button>
            </div>
          </div>
          ${rows.length ? `<div class="viz-reaction-bars">${rows.map(row => {
            const denom = row.songs || 1;
            return `<div class="viz-reaction-bar-row">
              <button type="button" class="viz-reaction-bar-genre" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">${escapeHtml(row.genre.genre || 'Unknown')}</button>
              <div class="viz-stackbar" title="${row.counts[3]} liked · ${row.counts[2]} meh · ${row.counts[1]} disliked · ${row.counts.unrated} unrated">
                <span class="viz-stack-like" style="width:${(row.counts[3] / denom) * 100}%"></span>
                <span class="viz-stack-meh" style="width:${(row.counts[2] / denom) * 100}%"></span>
                <span class="viz-stack-no" style="width:${(row.counts[1] / denom) * 100}%"></span>
                <span class="viz-stack-unrated" style="width:${(row.counts.unrated / denom) * 100}%"></span>
              </div>
              <span class="viz-stack-total">${row.songs}</span>
            </div>`;
          }).join('')}</div>` : '<div class="viz-empty">Rate songs to see per-genre reaction patterns.</div>'}
        </div>`;

      const canvas = document.getElementById(chartId);
      if (canvas) {
        const reactionChart = new Chart(canvas.getContext('2d'), {
          type:'doughnut',
          data:{ labels:['I Fuck With This','Meh, It’s Fine','Fuck Off','Unrated'], datasets:[{ data:[overall[3], overall[2], overall[1], overall.unrated], backgroundColor:[3,2,1,0].map((value, i) => (vizDrilldownState?.type === 'reaction' && Number(vizDrilldownState.value) === value && vizDrilldownState.mode === vizMode()) ? ['#6faa43','#f0a33a','#d94842','#8a7d68'][i] : ['#4e8a35','#d88a22','#b83230','#cabca6'][i]), borderWidth:2, borderColor:'#fffdf8' }] },
          options:{ responsive:true, maintainAspectRatio:false, events:[], plugins:{legend:{display:false}}, cutout:'62%' }
        });
        _vizCharts[chartId] = reactionChart;
        canvas.addEventListener('click', event => {
          const elements = reactionChart.getElementsAtEventForMode(event, 'nearest', { intersect:true }, false);
          if (!elements.length) return;
          const reactionValues = [3,2,1,0];
          setVisualDrilldown('reaction', reactionValues[elements[0].index], vizMode());
        });
        canvas.addEventListener('mousemove', event => {
          const elements = reactionChart.getElementsAtEventForMode(event, 'nearest', { intersect:true }, false);
          canvas.style.cursor = elements.length ? 'pointer' : 'default';
        });
      }
    }

    function vizRenderCrossovers(mountId, items, limit=10) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const rows = vizCrossoverRows(items).slice(0, limit);
      if (!rows.length) {
        mount.innerHTML = '<div class="viz-empty">No songs yet with a 4–5 fit in multiple logged genres.</div>';
        return;
      }
      mount.innerHTML = `<div class="viz-crossover-list">${rows.map(row => `<div class="viz-crossover-item">${row.song.artwork ? `<img class="viz-crossover-art" src="${escapeHtml(row.song.artwork)}" alt="" loading="lazy">` : '<div class="viz-crossover-art"></div>'}<div><div class="viz-crossover-name">${vizSongTitleLink(row.song)}</div><div class="viz-crossover-path">${row.genres.map(entry => `<button type="button" class="viz-fit-chip viz-click-chip" onclick="vizOpenGenreEncoded('${visualActionArg(entry.genre.genre || '')}')">${escapeHtml(entry.genre.genre || 'Unknown')} ${entry.fit}/5</button>`).join('')}</div></div></div>`).join('')}</div>`;
    }

    function renderDecadeCoverageNote(note, decadeStats, mode) {
      if (!note) return;
      if (decadeStats.known) {
        note.innerHTML = `<div class="viz-chart-hint">Click a decade bar to open the local track crate below this chart.</div>${decadeStats.known} song${decadeStats.known === 1 ? '' : 's'} placed by effective year${decadeStats.overrides ? ` · ${decadeStats.overrides} era override${decadeStats.overrides === 1 ? '' : 's'}` : ''}${decadeStats.unknown ? ` · <button type="button" class="viz-meta-link" onclick="openMetadataQueue('spotify', '${mode}')">${decadeStats.unknown} still missing year metadata</button>` : ''}.`;
      } else {
        note.innerHTML = `No effective years stored yet${decadeStats.unknown ? ` for <button type="button" class="viz-meta-link" onclick="openMetadataQueue('spotify', '${mode}')">${decadeStats.unknown} logged songs</button>` : ''}. Use Refresh Spotify Metadata above or add era overrides from a decade drilldown.`;
      }
    }

    function vizMonthlyCharts(items) {
      const palette = vizPalette();
      const catCounts = {};
      items.forEach(g => { const k = vizCategoryRoot(g); catCounts[k] = (catCounts[k] || 0) + 1; });
      const catLabels = Object.keys(catCounts).sort((a,b) => catCounts[b] - catCounts[a]).slice(0, 10);
      const catVals = catLabels.map(k => catCounts[k]);
      const catColors = catLabels.map((_, i) => palette[i % palette.length]);
      const catCanvas = document.getElementById('vizCatDonut');
      if (catCanvas) _vizCharts.catMonthly = new Chart(catCanvas.getContext('2d'), { type:'doughnut', data:{ labels:catLabels, datasets:[{ data:catVals, backgroundColor:catColors, borderWidth:2, borderColor:'#fffdf8' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, cutout:'62%' } });
      vizLegend(document.getElementById('vizCatLegend'), catLabels, catVals, catColors);

      const decadeStats = vizSongDecadeStats(items);
      const dLabels = Object.keys(decadeStats.counts).sort();
      const dVals = dLabels.map(k => decadeStats.counts[k]);
      const decadeCanvas = document.getElementById('vizDecadesBar');
      if (decadeCanvas && dLabels.length) {
        decadeCanvas.closest('.viz-card')?.classList.add('viz-clickable-chart');
        const selected = vizDrilldownState?.type === 'decade' && vizDrilldownState?.mode === 'monthly' ? vizDrilldownState.value : '';
        const colors = dLabels.map(label => label === selected ? '#d98d25' : '#8c5b23');
        _vizCharts.decadesMonthly = new Chart(decadeCanvas.getContext('2d'), { type:'bar', data:{ labels:dLabels, datasets:[{ data:dVals, backgroundColor:colors, borderRadius:4, borderSkipped:false }] }, options:{ responsive:true, plugins:{legend:{display:false}}, onClick:(event, elements) => { if (!elements.length) return; const label = dLabels[elements[0].index]; setVisualDrilldown('decade', label, 'monthly'); }, onHover:(event, elements) => { if (event?.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, scales:{ x:{ ticks:{ font:{ size:10 } } }, y:{ beginAtZero:true, precision:0 } } } });
      }
      renderDecadeCoverageNote(document.getElementById('vizDecadesNoteMonthly'), decadeStats, 'monthly');
    }

    function vizAllTimeCharts(items) {
      const palette = vizPalette();
      const ratingKeys = ['5','4','3','2','1','zanger'], ratingLabels = ['5★ Inject This Into My Veins','4★ Hell Yeah, Run It Back','3★ Glad I Heard It','2★ Respectfully, Nah','1★ Get This Off My Turntable','Zanger'], ratingColors = ['#3d7a1a','#6fa832','#d88a22','#c9540e','#b83230','#5b6b82'];
      const ratingMap = { '5':0,'4':0,'3':0,'2':0,'1':0,'zanger':0 };
      items.forEach(g => { const k = String(g.rating || ''); if (k === 'zanger') ratingMap.zanger += 1; else if (ratingMap[k] != null) ratingMap[k] += 1; });
      const rd = ratingKeys.map(k => ratingMap[k]);
      const ratingCanvas = document.getElementById('vizRatingsDonut');
      if (ratingCanvas) _vizCharts.ratingAll = new Chart(ratingCanvas.getContext('2d'), { type:'doughnut', data:{ labels:ratingLabels, datasets:[{ data:rd, backgroundColor:ratingColors, borderWidth:2, borderColor:'#fffdf8' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, cutout:'62%' } });
      vizLegend(document.getElementById('vizRatingsLegend'), ratingLabels, rd, ratingColors);

      const catCounts = {};
      items.forEach(g => { const k = vizCategoryRoot(g); catCounts[k] = (catCounts[k] || 0) + 1; });
      const catLabels = Object.keys(catCounts).sort((a,b) => catCounts[b] - catCounts[a]).slice(0, 10), catVals = catLabels.map(k => catCounts[k]), catColors = catLabels.map((_, i) => palette[i % palette.length]);
      const catCanvas = document.getElementById('vizCatDonutAll');
      if (catCanvas) _vizCharts.catAll = new Chart(catCanvas.getContext('2d'), { type:'doughnut', data:{ labels:catLabels, datasets:[{ data:catVals, backgroundColor:catColors, borderWidth:2, borderColor:'#fffdf8' }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, cutout:'62%' } });
      vizLegend(document.getElementById('vizCatLegendAll'), catLabels, catVals, catColors);

      const decadeStats = vizSongDecadeStats(items);
      const dLabels = Object.keys(decadeStats.counts).sort();
      const dVals = dLabels.map(k => decadeStats.counts[k]);
      const decadeCanvas = document.getElementById('vizDecadesBarAll');
      if (decadeCanvas && dLabels.length) {
        decadeCanvas.closest('.viz-card')?.classList.add('viz-clickable-chart');
        const selected = vizDrilldownState?.type === 'decade' && vizDrilldownState?.mode === 'alltime' ? vizDrilldownState.value : '';
        const colors = dLabels.map(label => label === selected ? '#d98d25' : '#8c5b23');
        _vizCharts.decadesAll = new Chart(decadeCanvas.getContext('2d'), { type:'bar', data:{ labels:dLabels, datasets:[{ data:dVals, backgroundColor:colors, borderRadius:4, borderSkipped:false }] }, options:{ responsive:true, plugins:{legend:{display:false}}, onClick:(event, elements) => { if (!elements.length) return; const label = dLabels[elements[0].index]; setVisualDrilldown('decade', label, 'alltime'); }, onHover:(event, elements) => { if (event?.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, scales:{ x:{ ticks:{ font:{ size:10 } } }, y:{ beginAtZero:true, precision:0 } } } });
      }
      renderDecadeCoverageNote(document.getElementById('vizDecadesNoteAll'), decadeStats, 'alltime');

      const topDepth = items.map(g => ({ genre: g.genre || 'Unknown', count: vizOfficialSongs(g).length })).filter(x => x.count > 0).sort((a,b) => b.count - a.count || a.genre.localeCompare(b.genre)).slice(0,15);
      const depthCanvas = document.getElementById('vizSongsDepth');
      if (depthCanvas) _vizCharts.depth = new Chart(depthCanvas.getContext('2d'), { type:'bar', data:{ labels:topDepth.map(x => x.genre), datasets:[{ data:topDepth.map(x => x.count), backgroundColor:'#5b6b82', borderRadius:4, borderSkipped:false }] }, options:{ indexAxis:'y', responsive:true, plugins:{legend:{display:false}}, scales:{ x:{ beginAtZero:true, precision:0 }, y:{ ticks:{ font:{ size:10 } } } } } });
    }



    function validSpotifyTrackUrl(url='') {
      return /open\.spotify\.com\/track\/[A-Za-z0-9]{22}/i.test(normalizeSongUrl(url));
    }

    function looksLikeSpotifyUrl(url='') {
      return /spotify/i.test(String(url || ''));
    }

    function spotifyMetadataMissingFields(song) {
      const missing = [];
      if (!String(song?.title || '').trim()) missing.push('title');
      if (!String(song?.artist || '').trim()) missing.push('artist');
      if (!String(song?.artwork || '').trim()) missing.push('album art');
      if (!song?.releaseYear) missing.push('year');
      if (!song?.durationMs) missing.push('duration');
      if (!song?.spotifyId) missing.push('Spotify ID');
      if (!song?.isrc && !song?.spotifyMetadataFetched) missing.push('ISRC');
      return missing;
    }

    function metadataRowMissingAlbumArt(row) {
      return (row?.missing || []).some(field => /art/i.test(String(field || '')));
    }

    function metadataFilterMatches(row, filter) {
      const active = ['spotify', 'art', 'broken', 'nonspotify'].includes(filter) ? filter : 'spotify';
      if (active === 'art') return metadataRowMissingAlbumArt(row);
      return row.group === active;
    }

    function spotifyTrackNeedsRefresh(song) {
      if (!validSpotifyTrackUrl(song?.url || '')) return false;
      if (!song?.spotifyMetadataFetched) return true;
      return !String(song?.artist || '').trim() || !String(song?.artwork || '').trim() || !song?.releaseYear || !song?.durationMs || !song?.spotifyId;
    }

    function collectMetadataRows(items) {
      return items.flatMap(genre => vizOfficialSongs(genre).map(song => {
        const missing = spotifyMetadataMissingFields(song);
        const url = normalizeSongUrl(song.url || '');
        const key = stagedReactionKey(genre.id, songIdentity(song));
        const failure = spotifyMetadataFailures.get(key) || null;
        const validSpotify = validSpotifyTrackUrl(url);
        const needsRefresh = validSpotify && spotifyTrackNeedsRefresh(song);
        const bulkSkipped = needsRefresh && spotifyFailureShouldSkipBulk(failure);
        let group = '';
        if (validSpotify && needsRefresh) group = bulkSkipped ? 'broken' : 'spotify';
        else if (!validSpotify && looksLikeSpotifyUrl(url)) group = 'broken';
        else if (missing.length) group = 'nonspotify';
        if (!group) return null;
        return { genre, song, missing, group, key, failure, validSpotify, bulkSkipped };
      }).filter(Boolean));
    }

    function setMetadataQueueFilter(filter, mountId) {
      metadataQueueFilter = ['spotify', 'art', 'broken', 'nonspotify'].includes(filter) ? filter : 'spotify';
      const base = mountId === 'vizMetadataQueueMonthly' ? vizBaseGenres() : allListenedGenresForMaintenance();
      renderMetadataQueue(mountId, vizFilteredItems(base));
    }

    function openMetadataQueue(filter='spotify', mode='alltime') {
      metadataQueueFilter = ['spotify', 'art', 'broken', 'nonspotify'].includes(filter) ? filter : 'spotify';
      if (mode === 'alltime' && vizMode() !== 'alltime') {
        document.querySelector('[data-viz-mode="alltime"]')?.click();
      }
      setTimeout(() => {
        const mount = document.getElementById(mode === 'monthly' ? 'vizMetadataQueueMonthly' : 'vizMetadataQueueAll');
        if (mount) {
          const base = mode === 'monthly' ? vizBaseGenres() : allListenedGenresForMaintenance();
          renderMetadataQueue(mount.id, vizFilteredItems(base));
          mount.closest('.viz-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
        }
      }, 30);
    }

    function findSongForMetadataAction(genreId, key) {
      const genre = (genres || []).find(g => String(g.id) === String(genreId));
      if (!genre) return null;
      const songs = inflateSongsFromStorage(genre.songs_listened || []);
      let found = null;
      eachSongInLog(songs, song => {
        if (!found && songsIdentityMatch(song, key)) found = song;
      });
      return found ? { genre, songs, song:found } : null;
    }

    async function refreshSingleSpotifyTrack(encodedGenreId, encodedKey) {
      const genreId = decodeURIComponent(String(encodedGenreId || ''));
      const key = decodeURIComponent(String(encodedKey || ''));
      if (Date.now() < spotifyRefreshPausedUntil) {
        const wait = Math.ceil((spotifyRefreshPausedUntil - Date.now()) / 1000);
        showSaveToast(`Spotify asked us to pause. Try again in ${wait} seconds.`, true);
        return;
      }
      const target = findSongForMetadataAction(genreId, key);
      if (!target) {
        showSaveToast('Could not find that track in its genre.', true);
        return;
      }
      const result = await fetchSpotifyTrackResult(target.song.url, true);
      if (!result.ok) {
        spotifyMetadataFailures.set(stagedReactionKey(genreId, key), result);
        if (result.code === 'rate_limited') {
          beginSpotifyPause(result.retryAfterSeconds || 30);
          if (!spotifyRefreshReport) spotifyRefreshReport = { updated: 0, remaining: 0, broken: 0, failed: 0, scope: 'single track' };
          const restore = preserveScrollSnapshot();
          renderVisuals();
          restore();
          return;
        }
        if (!spotifyRefreshReport) spotifyRefreshReport = { updated: 0, remaining: 0, broken: 0, failed: 0, scope: 'single track' };
        { const restore = preserveScrollSnapshot(); renderVisuals(); restore(); }
        showSaveToast(`Spotify refresh failed: ${result.error}`, true);
        return;
      }
      applyOfficialSpotifyMetadata(target.song, result.track);
      target.genre.songs_listened = target.songs;
      spotifyMetadataFailures.delete(stagedReactionKey(genreId, key));
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
        if (!spotifyRefreshReport) spotifyRefreshReport = { updated: 0, remaining: 0, broken: 0, failed: 0, scope: 'single track' };
        { const restore = preserveScrollSnapshot(); renderVisuals(); restore(); }
      showSaveToast('Spotify metadata updated — save library updates to persist it.', false);
      }

  function hardDeleteTargetDisplayKey(song) {
      const title = String(song?.title || song?.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      const artist = String(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(' ') : '') || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (title && artist) return `artist-title:${artist}::${title}`;
      const spotifyId = String(song?.spotifyId || '').trim().toLowerCase();
      if (spotifyId) return `spotify:${spotifyId}`;
      const url = String(normalizeSongUrl(song?.spotifyUrl || song?.url || '') || '').trim().toLowerCase();
      if (url) return `url:${url}`;
      return String(songIdentity(song) || '').trim().toLowerCase();
    }

    function hardDeleteTargetMatches(song, target) {
      if (!song || !target) return false;
      const rawKey = String(target.key || target.displayKey || '').trim().toLowerCase();
      if (rawKey) {
        if (songsIdentityMatch(song, rawKey)) return true;
        if (hardDeleteTargetDisplayKey(song) === rawKey) return true;
      }
      if (songsIdentityMatch(song, target)) return true;
      const display = String(target.displayKey || '').trim().toLowerCase();
      if (display && hardDeleteTargetDisplayKey(song) === display) return true;
      const targetUrl = String(normalizeSongUrl(target.spotifyUrl || target.url || '') || '').trim().toLowerCase();
      const songUrl = String(normalizeSongUrl(song.spotifyUrl || song.url || '') || '').trim().toLowerCase();
      if (targetUrl && songUrl && targetUrl === songUrl) return true;
      const targetIsrc = String(target.isrc || '').trim().toLowerCase();
      if (targetIsrc && String(song.isrc || '').trim().toLowerCase() === targetIsrc) return true;
      const targetSpotify = String(target.spotifyId || '').trim().toLowerCase();
      if (targetSpotify && String(song.spotifyId || '').trim().toLowerCase() === targetSpotify) return true;
      return false;
    }

    function hardDeleteFavoriteIfNeeded(genre, targets) {
      if (!genre || !Array.isArray(targets)) return;
      const favoriteProbe = {
        title: genre.favoritesong || genre.favorite_song || '',
        artist: genre.favoriteartist || '',
        url: genre.favoritesongurl || genre.favorite_song_url || '',
      };
      if (!favoriteProbe.title && !favoriteProbe.url) return;
      if (!targets.some(target => hardDeleteTargetMatches(favoriteProbe, target))) return;
      genre.favoritesong = '';
      genre.favoritesongurl = '';
      genre.favorite_song = '';
      genre.favorite_song_url = '';
      genre.favoriteartist = '';
      genre.favoritesongartwork = '';
    }

    function hardDeleteSongEverywhere(targetsInput, options = {}) {
      const targets = (Array.isArray(targetsInput) ? targetsInput : [targetsInput]).filter(Boolean);
      if (!targets.length) return { deleted: 0, genresTouched: 0 };
      let deleted = 0;
      let levelUpsDeleted = 0;
      let pendingDeleted = 0;
      let genresTouched = 0;
      let currentGenreTouched = false;
      (genres || []).forEach(genre => {
        let touched = false;
        const songs = inflateSongsFromStorage(genre.songs_listened || []);
        const kept = [];
        songs.forEach(song => {
          if (targets.some(target => hardDeleteTargetMatches(song, target))) {
            deleted += 1;
            touched = true;
            return;
          }
          if (song?.levelUp && targets.some(target => hardDeleteTargetMatches(song.levelUp, target))) {
            song.levelUp = null;
            deleted += 1;
            levelUpsDeleted += 1;
            touched = true;
          }
          kept.push(song);
        });
        const pending = Array.isArray(genre.pending_songs) ? genre.pending_songs : [];
        const pendingKept = pending.filter(song => {
          const match = targets.some(target => hardDeleteTargetMatches(song, target));
          if (match) {
            pendingDeleted += 1;
            deleted += 1;
            touched = true;
          }
          return !match;
        });
        if (touched) {
          genre.songs_listened = kept;
          genre.pending_songs = pendingKept;
          hardDeleteFavoriteIfNeeded(genre, targets);
          genresTouched += 1;
          if (currentGenre && String(currentGenre.id) === String(genre.id)) {
            currentGenre = genre;
            currentGenreTouched = true;
          }
        }
      });
      if (!deleted) return { deleted: 0, levelUpsDeleted, pendingDeleted, genresTouched: 0 };
      libraryUpdatesPending = true;
      if (typeof toggleLibrarySaveButton === 'function') toggleLibrarySaveButton(true);
      if (typeof setUnsavedState === 'function') setUnsavedState(true);
      if (currentGenreTouched) {
        try { if (typeof syncSongsBulkEditorFromModel === 'function') syncSongsBulkEditorFromModel(); } catch (_) {}
        try { if (typeof enhanceSongListeningExperience === 'function') enhanceSongListeningExperience(); } catch (_) {}
      }
      if (options.renderStudio && typeof renderReview === 'function') {
        const restore = typeof preserveScrollSnapshot === 'function' ? preserveScrollSnapshot() : null;
        renderReview();
        if (restore) restore();
      }
      if (typeof renderVisuals === 'function' && options.renderVisuals) {
        const restore = typeof preserveScrollSnapshot === 'function' ? preserveScrollSnapshot() : null;
        renderVisuals();
        if (restore) restore();
      }
      return { deleted, levelUpsDeleted, pendingDeleted, genresTouched };
    }
    window.hardDeleteSongEverywhere = hardDeleteSongEverywhere;

    function deleteFromMetadataQueue(encodedGenreId, encodedKey, mountId) {
      if (!window.confirm('Permanently delete this track from this genre? Use Delete everywhere in Studio to remove every copy everywhere. This cannot be undone until you reload without saving.')) return;
      const genreId = decodeURIComponent(encodedGenreId || '');
      const key = decodeURIComponent(encodedKey || '');
      const genre = getGenreById(genreId);
      if (!genre) return;
      const songs = inflateSongsFromStorage(genre.songs_listened || []).filter(s => !s.isPending);
      const filtered = [];
      for (const song of songs) {
        if (songsIdentityMatch(song, key)) continue; // skip deleted
        if (song.levelUp && songsIdentityMatch(song.levelUp, key)) song.levelUp = null;
        filtered.push(song);
      }
      genre.songs_listened = filtered;
      libraryUpdatesPending = true;
      toggleLibrarySaveButton(true);
      setUnsavedState(true);
      showSaveToast('Track deleted from this genre — click Save Library Updates to persist.', false);
      const metaDetailsOpen = !!document.getElementById(mountId)?.querySelector('details.viz-queue-fold')?.open;
      const restore = preserveScrollSnapshot();
      renderVisuals();
      restore();
      if (metaDetailsOpen) {
        document.getElementById(mountId)?.querySelector('details.viz-queue-fold')?.setAttribute('open', '');
      }
    }

    function editMetadataTrackUrl(encodedGenreName) {
      const name = decodeURIComponent(String(encodedGenreName || ''));
      const genre = (genres || []).find(g => String(g.genre || '') === name);
      if (!genre) return;
      openGenreDetail(genre, true);
      showSaveToast('Use Edit track URL on the song card, then click Save Changes.', false);
    }

    function renderMetadataQueue(mountId, items) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const rows = collectMetadataRows(items);
      const counts = {
        spotify: rows.filter(row => row.group === 'spotify').length,
        art: rows.filter(metadataRowMissingAlbumArt).length,
        broken: rows.filter(row => row.group === 'broken').length,
        nonspotify: rows.filter(row => row.group === 'nonspotify').length
      };
      if (!['spotify', 'art', 'broken', 'nonspotify'].includes(metadataQueueFilter)) metadataQueueFilter = 'spotify';
      const limit = vizQueueLimits.metadata || 8;
      const allVisible = rows.filter(row => metadataFilterMatches(row, metadataQueueFilter));
      const visible = allVisible.slice(0, limit);
      const report = spotifyRefreshReport
        ? `<div class="viz-metadata-report"><strong>Last refresh${spotifyRefreshReport.scope ? ` (${escapeHtml(spotifyRefreshReport.scope)})` : ''}:</strong> ${spotifyRefreshReport.updated} updated · ${spotifyRefreshReport.remaining} remaining Spotify tracks · ${spotifyRefreshReport.broken} broken/unresolved · ${spotifyRefreshReport.failed} other failures${spotifyRefreshReport.rateLimited ? ` · paused by Spotify${spotifyRefreshReport.pausedSeconds ? ` (${spotifyRefreshReport.pausedSeconds}s wait requested)` : ''}` : ''}${spotifyRefreshReport.stopped && !spotifyRefreshReport.rateLimited ? ' · stopped early' : ''}.</div>`
        : '';
      const emptyCopy = metadataQueueFilter === 'art'
        ? 'No tracks are missing album art in this scope.'
        : 'Nothing in this metadata group.';
      mount.innerHTML = `<details class="viz-queue-fold" ${spotifyRefreshReport ? 'open' : ''}>
      <summary><span>Missing Metadata Queue</span><span class="viz-queue-count">${rows.length}</span></summary>
        <div class="viz-queue-body">${report}<div class="viz-metadata-summary"><button type="button" class="viz-metadata-filter ${metadataQueueFilter === 'spotify' ? 'active' : ''}" onclick="setMetadataQueueFilter('spotify', '${mountId}')">Ready for Spotify refresh · ${counts.spotify}</button><button type="button" class="viz-metadata-filter ${metadataQueueFilter === 'art' ? 'active' : ''}" onclick="setMetadataQueueFilter('art', '${mountId}')">Missing album art · ${counts.art}</button><button type="button" class="viz-metadata-filter ${metadataQueueFilter === 'broken' ? 'active' : ''}" onclick="setMetadataQueueFilter('broken', '${mountId}')">Broken / unrecognized · ${counts.broken}</button><button type="button" class="viz-metadata-filter ${metadataQueueFilter === 'nonspotify' ? 'active' : ''}" onclick="setMetadataQueueFilter('nonspotify', '${mountId}')">Non-Spotify · ${counts.nonspotify}</button></div>${visible.length ? `<div class="viz-metadata-list">${visible.map((row, idx) => {
          const failure = row.failure ? `<span class="viz-missing-chip">${escapeHtml(row.failure.code === 'rate_limited' ? 'rate limited' : row.failure.error)}</span>` : '';
          const skipped = row.bulkSkipped ? '<span class="viz-missing-chip">skipped from bulk refresh</span>' : '';
          const canRefresh = row.validSpotify;
          const refreshText = metadataRowMissingAlbumArt(row) ? (row.bulkSkipped ? 'Retry Artwork' : 'Pull Album Art') : (row.bulkSkipped ? 'Retry Track' : 'Refresh Track');
          const eraInputId = `metadataEra_${mountId}_${idx}_${String(row.genre.id).replace(/[^a-zA-Z0-9]/g,'')}`;
          const savedEra = row.song.eraYear || row.song.eraDecade || '';
          const effective = songEffectiveYear(row.song);
          const eraNote = effective.year ? `${effective.source}: ${effective.year}${row.song.releaseYear && effective.source !== 'Spotify' ? ` · Spotify: ${row.song.releaseYear}` : ''}` : 'No era/release year yet';
          const eraForm = `<div class="viz-era-form viz-era-form-metadata"><span>${escapeHtml(eraNote)}</span><input id="${eraInputId}" type="text" placeholder="1950s or 1953" value="${escapeHtml(savedEra)}"><button type="button" onclick="saveEraOverride('${visualActionArg(row.genre.id)}','${visualActionArg(songIdentity(row.song))}','${eraInputId}')">Save Era</button></div>`;
          const trackLink = row.song.url ? `<a class="viz-meta-link" href="${escapeHtml(row.song.url)}" target="_blank" rel="noopener noreferrer">Open Track ↗</a>` : '';
          return `<div class="viz-metadata-row"><div><div class="viz-metadata-title">${vizSongTitleLink(row.song)}</div><div class="viz-metadata-context"><button type="button" class="viz-metadata-genre" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">${escapeHtml(row.genre.genre || 'Unknown')}</button>${row.missing.map(field => `<span class="viz-missing-chip">missing ${escapeHtml(field)}</span>`).join('')}${failure}${skipped}</div>${eraForm}</div><div class="viz-meta-actions">${canRefresh ? `<button type="button" class="primary" onclick="refreshSingleSpotifyTrack('${visualActionArg(row.genre.id)}', '${visualActionArg(songIdentity(row.song))}')">${refreshText}</button>` : ''}<button type="button" onclick="editMetadataTrackUrl('${visualActionArg(row.genre.genre || '')}')">Edit URL</button><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open Genre</button>${trackLink}<button type="button" class="viz-meta-delete" onclick="deleteFromMetadataQueue('${visualActionArg(row.genre.id)}', '${visualActionArg(songIdentity(row.song))}', '${mountId}')" title="Remove this track from the genre entirely">Delete</button></div></div>`;
        }).join('')}</div>` : `<div class="viz-empty">${escapeHtml(emptyCopy)}</div>`}${allVisible.length > limit ? `<button type="button" class="viz-show-more" onclick="showMoreVizQueue('metadata')">Show 8 more</button>` : ''}</div>
      </details>`;
    }

    function updateSpotifyPauseDisplay() {
      const status = document.getElementById('vizRefreshStatus');
      const button = document.getElementById('vizRefreshBtn');
      const remaining = Math.max(0, Math.ceil((spotifyRefreshPausedUntil - Date.now()) / 1000));
      if (remaining > 0) {
        const availableAt = new Date(spotifyRefreshPausedUntil).toLocaleString();
        if (status) status.innerHTML = `<span class="viz-refresh-paused">Spotify cooldown active — try again after ${escapeHtml(availableAt)} (${remaining}s remaining).</span>`;
        if (button && !spotifyRefreshRunning) {
          button.disabled = true;
          button.textContent = 'Spotify Cooldown Active';
        }
      } else {
        spotifyRefreshPausedUntil = 0;
        spotifyStorageRemove(SPOTIFY_COOLDOWN_STORAGE_KEY);
        if (spotifyRefreshCountdownTimer) {
          clearInterval(spotifyRefreshCountdownTimer);
          spotifyRefreshCountdownTimer = null;
        }
        if (button && !spotifyRefreshRunning) {
          button.disabled = false;
          button.textContent = '↺ Refresh Next 5 Spotify Tracks';
        }
        if (status && spotifyRefreshReport?.rateLimited) status.textContent = 'Spotify cooldown is over. Start a small five-track metadata batch when ready.';
      }
    }

    function beginSpotifyPause(seconds=30) {
      spotifyRefreshPausedUntil = Date.now() + (Math.max(1, Number(seconds || 30)) * 1000);
      spotifyStorageSet(SPOTIFY_COOLDOWN_STORAGE_KEY, String(spotifyRefreshPausedUntil));
      if (spotifyRefreshCountdownTimer) clearInterval(spotifyRefreshCountdownTimer);
      spotifyRefreshCountdownTimer = setInterval(updateSpotifyPauseDisplay, 1000);
      updateSpotifyPauseDisplay();
    }

    function waitForSpotifyPacing(ms=2500) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    function allListenedGenresForMaintenance() {
      return (genres || []).filter(g => ['listened','veto'].includes(String(g.status || '').toLowerCase()) && dateValue(g));
    }

    function visualRefreshScopeItems() {
      // Bulk Spotify refresh should respect the active Visuals scope:
      // monthly mode refreshes only that month; all-time mode refreshes the full archive.
      const scoped = vizMode() === 'monthly' ? vizBaseGenres() : allListenedGenresForMaintenance();
      return vizFilteredItems(scoped);
    }

    function visualRefreshScopeLabel() {
      const focus = vizFocusedGenre();
      const focusText = focus ? ` · ${focus.genre}` : '';
      return vizMode() === 'monthly'
        ? `${vizMonthTitle(vizSelectedMonth())}${focusText}`
        : `All time${focusText}`;
    }

    function maintenanceStats() {
      const listened = allListenedGenresForMaintenance();
      const pendingRows = collectQueuedPendingNominationRows();
      const missingMetadataRows = collectMetadataRows(listened);
      const unratedRows = listened.flatMap(genre => vizOfficialSongs(genre)
        .filter(song => ![1,2,3].includes(Number(song.reaction)))
        .map(song => ({ type:'unrated', genre, song, key:songIdentity(song) }))
      );
      const drafts = (genres || []).filter(g => (g.status || '').toLowerCase() === 'unlistened' && ((g.notes || '').trim() || vizOfficialSongs(g).length || g.favoritesong));
      const duplicates = collectDuplicateMaintenanceRows();
      return { pendingRows, missingMetadataRows, unratedRows, drafts, duplicates };
    }

    function renderNeedsAttention(mountId) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const stats = maintenanceStats();
      const buckets = [
        ['Pending nominations', stats.pendingRows],
        ['Missing song metadata', stats.missingMetadataRows],
        ['Unrated songs', stats.unratedRows],
        ['Prepared drafts', stats.drafts],
        ['Possible duplicates', stats.duplicates]
      ];
      mount.innerHTML = `<div class="viz-maint-grid">${buckets.map(([label, list]) => `<button type="button" class="viz-maint-card" data-maint-label="${escapeHtml(label)}" onclick="showMaintenanceGenres(${JSON.stringify(label)})"><strong>${list.length}</strong><span>${escapeHtml(label)}</span></button>`).join('')}</div><div class="viz-maint-detail" id="${mountId}Detail"><span class="small">Click a maintenance box to see the exact songs or genres behind that count.</span></div>`;
      mount.dataset.maintenance = JSON.stringify(buckets.reduce((acc, [label, list]) => { acc[label] = list.length; return acc; }, {}));
    }

    function maintenanceRowsForLabel(label) {
      const listened = allListenedGenresForMaintenance();
      if (label === 'Pending nominations') return collectQueuedPendingNominationRows().map(row => ({ ...row, type:'pending' }));
      if (label === 'Missing song metadata') return collectMetadataRows(listened).map(row => ({ ...row, type:'metadata' }));
      if (label === 'Unrated songs') return listened.flatMap(genre => vizOfficialSongs(genre)
        .filter(song => ![1,2,3].includes(Number(song.reaction)))
        .map(song => ({ type:'unrated', genre, song, key:songIdentity(song) }))
      );
      if (label === 'Prepared drafts') return (genres || [])
        .filter(g => (g.status || '').toLowerCase() === 'unlistened' && ((g.notes || '').trim() || vizOfficialSongs(g).length || g.favoritesong))
        .map(genre => ({ type:'draft', genre }));
      if (label === 'Possible duplicates') return collectDuplicateMaintenanceRows();
      return [];
    }

    function collectDuplicateMaintenanceRows() {
      const rows = [];
      allListenedGenresForMaintenance().forEach(genre => {
        const seen = [];
        vizOfficialSongs(genre).forEach(song => {
          const match = seen.find(entry => songsIdentityMatch(entry.song, song));
          if (match) rows.push({ type:'duplicate', genre, song, first:match.song, key:songIdentity(song) });
          else seen.push({ song, key:songIdentity(song) });
        });
      });
      return rows;
    }

    function maintenanceRowHtml(row, label) {
      if (row.type === 'pending') {
        const source = row.sourceName || 'Unknown source';
        const fit = row.fit !== '' && row.fit != null ? `<span class="review-chip">source fit ${escapeHtml(String(row.fit))}/5</span>` : '';
        return `<div class="viz-maint-row"><div><div class="viz-maint-title">${vizSongTitleLink(row.song)}</div><div class="viz-maint-meta"><span class="review-chip">queued in ${escapeHtml(row.targetGenre.genre || 'Unknown genre')}</span><span class="review-chip">from ${escapeHtml(source)}</span>${fit}</div></div><div class="viz-maint-actions"><button type="button" class="primary" onclick="openGenreByIdEncoded('${visualActionArg(row.targetGenre.id)}', false)">Open Target</button><button type="button" onclick="switchScreen('review'); setTimeout(scrollToReviewPendingQueue, 40);">Open Review</button></div></div>`;
      }
      if (row.type === 'metadata') {
        const groupLabel = row.group === 'spotify' ? 'ready for refresh' : row.group === 'broken' ? 'broken/unrecognized' : 'non-Spotify';
        const filter = metadataRowMissingAlbumArt(row) ? 'art' : (row.group === 'broken' ? 'broken' : row.group === 'nonspotify' ? 'nonspotify' : 'spotify');
        const refreshButton = row.validSpotify ? `<button type="button" class="primary" onclick="refreshSingleSpotifyTrack('${visualActionArg(row.genre.id)}', '${visualActionArg(songIdentity(row.song))}')">${metadataRowMissingAlbumArt(row) ? 'Pull Album Art' : 'Refresh Track'}</button>` : '';
        return `<div class="viz-maint-row"><div><div class="viz-maint-title">${vizSongTitleLink(row.song)}</div><div class="viz-maint-meta"><span class="review-chip">${escapeHtml(row.genre.genre || 'Unknown genre')}</span><span class="review-chip warn">${escapeHtml(groupLabel)}</span>${row.missing.map(field => `<span class="review-chip warn">missing ${escapeHtml(field)}</span>`).join('')}</div></div><div class="viz-maint-actions">${refreshButton}<button type="button" class="primary" onclick="openMetadataQueue('${filter}', 'alltime')">Open ${filter === 'art' ? 'Art' : 'Metadata'} Queue</button><button type="button" onclick="openGenreByIdEncoded('${visualActionArg(row.genre.id)}', true)">Open & Edit</button></div></div>`;
      }
      if (row.type === 'unrated') {
        const genreId = visualActionArg(row.genre.id);
        const songKey = visualActionArg(songIdentity(row.song));
        return `<div class="viz-maint-row"><div><div class="viz-maint-title">${vizSongTitleLink(row.song)}</div><div class="viz-maint-meta"><span class="review-chip">${escapeHtml(row.genre.genre || 'Unknown genre')}</span><span class="review-chip warn">unrated</span></div></div><div class="viz-maint-actions"><button type="button" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 3)">👍</button><button type="button" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 2)">🤷</button><button type="button" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 1)">👎</button><button type="button" class="primary" onclick="openGenreByIdEncoded('${genreId}', false)">Open Genre</button></div></div>`;
      }
      if (row.type === 'draft') {
        const songCount = vizOfficialSongs(row.genre).length;
        return `<div class="viz-maint-row"><div><div class="viz-maint-title">${escapeHtml(row.genre.genre || 'Untitled genre')}</div><div class="viz-maint-meta"><span class="review-chip">unlistened draft</span>${row.genre.notes ? '<span class="review-chip">has notes</span>' : ''}${songCount ? `<span class="review-chip">${songCount} song${songCount === 1 ? '' : 's'}</span>` : ''}${row.genre.favoritesong ? '<span class="review-chip">has favorite</span>' : ''}</div></div><div class="viz-maint-actions"><button type="button" class="primary" onclick="openGenreByIdEncoded('${visualActionArg(row.genre.id)}', true)">Open & Edit</button></div></div>`;
      }
      if (row.type === 'duplicate') {
        return `<div class="viz-maint-row"><div><div class="viz-maint-title">${vizSongTitleLink(row.song)}</div><div class="viz-maint-meta"><span class="review-chip">${escapeHtml(row.genre.genre || 'Unknown genre')}</span><span class="review-chip warn">possible duplicate in same genre</span></div></div><div class="viz-maint-actions"><button type="button" class="primary" onclick="openGenreByIdEncoded('${visualActionArg(row.genre.id)}', true)">Open & Edit</button></div></div>`;
      }
      return '';
    }

    function showMaintenanceGenres(label) {
      const visibleMount = document.getElementById(vizMode() === 'monthly' ? 'vizNeedsAttentionMonthly' : 'vizNeedsAttentionAll');
      if (!visibleMount) return;
      visibleMount.querySelectorAll('.viz-maint-card').forEach(card => card.classList.toggle('active', card.dataset.maintLabel === label));
      const detail = visibleMount.querySelector('.viz-maint-detail');
      if (!detail) return;
      const rows = maintenanceRowsForLabel(label);
      const limit = vizQueueLimits.maintenance || 40;
      const visible = rows.slice(0, limit);
      const copy = label === 'Pending nominations'
        ? 'Songs already queued in another genre’s pending list.'
        : label === 'Missing song metadata'
          ? 'Tracks missing Spotify/title/art/year/duration fields or needing URL repair.'
          : label === 'Unrated songs'
            ? 'Tracks that still need a 👍 / 🤷 / 👎 reaction.'
            : label === 'Prepared drafts'
              ? 'Unlistened genres that already have notes, songs, or favorite data prepared.'
              : 'Likely duplicate songs inside the same listened genre.';
      detail.innerHTML = `<div class="viz-maint-panel"><div class="viz-maint-panel-head"><div><h4 class="viz-maint-panel-title">${escapeHtml(label)} · ${rows.length}</h4><p class="viz-maint-panel-copy">${escapeHtml(copy)}</p></div>${label === 'Pending nominations' ? `<button type="button" class="btn btn-secondary btn-tiny" onclick="switchScreen('review'); setTimeout(scrollToReviewPendingQueue, 40);">Open full Review list</button>` : ''}</div>${visible.length ? `<div class="viz-maint-list">${visible.map(row => maintenanceRowHtml(row, label)).join('')}</div>${rows.length > limit ? `<button type="button" class="viz-show-more" onclick="showMoreVizQueue('maintenance'); showMaintenanceGenres(${JSON.stringify(label)})">Show more</button>` : ''}` : '<div class="viz-empty">Nothing in this queue.</div>'}</div>`;
      detail.scrollIntoView({ behavior:'smooth', block:'start' });
    }

    function stagedReactionKey(genreId, songKey) {
      return `${String(genreId || '')}::${String(songKey || '')}`;
    }

    function setSongReactionFromVisuals(encodedGenreId, encodedKey, value) {
      const genreId = decodeURIComponent(String(encodedGenreId || ''));
      const genre = (genres || []).find(g => String(g.id) === String(genreId));
      if (!genre) {
        showSaveToast('Could not find that genre for rating.', true);
        return;
      }
      const key = decodeURIComponent(String(encodedKey || ''));
      const songs = inflateSongsFromStorage(genre.songs_listened || []);
      let updated = false;
      eachSongInLog(songs, song => {
        if (songIdentity(song) === key) {
          song.reaction = Number(value);
          updated = true;
        }
      });
      if (!updated) {
        showSaveToast('Could not find that song for rating.', true);
        return;
      }
      genre.songs_listened = songs;
      stagedQueueReactionKeys.add(stagedReactionKey(genre.id, key));
      libraryUpdatesPending = true;
      setUnsavedState(true);
      toggleLibrarySaveButton(true);
      { const restore = preserveScrollSnapshot(); renderVisuals(); restore(); }
      const status = document.getElementById('vizRefreshStatus');
      if (status) status.innerHTML = '<span class="viz-library-save-callout">Reaction selected — click Save Library Updates to persist it.</span>';
      showSaveToast('Reaction selected — save library updates to persist it.', false);
    }

    function renderUnratedSongs(mountId, items) {
      const mount = document.getElementById(mountId);
      if (!mount) return;
      const allRows = items.flatMap(genre => vizOfficialSongs(genre)
        .filter(song => {
          const key = stagedReactionKey(genre.id, songIdentity(song));
          return ![1,2,3].includes(Number(song.reaction)) || stagedQueueReactionKeys.has(key);
        })
        .map(song => ({ genre, song, staged: stagedQueueReactionKeys.has(stagedReactionKey(genre.id, songIdentity(song))) }))
      );
      const limit = vizQueueLimits.unrated || 8;
      const rows = allRows.slice(0, limit);
      if (!allRows.length) { mount.innerHTML = '<div class="viz-empty">No unrated songs in this view.</div>'; return; }
      mount.innerHTML = `<details class="viz-queue-fold" ${libraryUpdatesPending ? 'open' : ''}>
        <summary><span>Unrated Songs</span><span class="viz-queue-count">${allRows.length}</span></summary>
        <div class="viz-queue-body"><div class="viz-unrated-list">${rows.map(row => {
          const genreId = visualActionArg(row.genre.id);
          const songKey = visualActionArg(songIdentity(row.song));
          const reaction = Number(row.song.reaction || 0);
          return `<div class="viz-unrated-row ${row.staged ? 'is-staged' : ''}"><div><div class="viz-unrated-song">${vizSongTitleLink(row.song)}</div><button type="button" class="viz-unrated-genre" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">${escapeHtml(row.genre.genre || 'Unknown')}</button>${row.staged ? '<div class="viz-unsaved-reaction">Unsaved reaction</div>' : ''}</div><div class="viz-quick-rate"><button type="button" class="${reaction === 3 ? 'active' : ''}" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 3)" title="I Fuck With This" aria-label="I Fuck With This">👍</button><button type="button" class="${reaction === 2 ? 'active' : ''}" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 2)" title="Meh, It’s Fine" aria-label="Meh, It’s Fine">🤷</button><button type="button" class="${reaction === 1 ? 'active' : ''}" onclick="setSongReactionFromVisuals('${genreId}', '${songKey}', 1)" title="Fuck Off" aria-label="Fuck Off">👎</button></div></div>`;
        }).join('')}</div>${allRows.length > limit ? `<button type="button" class="viz-show-more" onclick="showMoreVizQueue('unrated')">Show 8 more</button>` : ''}</div>
      </details>`;
    }

    function toggleLibrarySaveButton(show) {
      const button = document.getElementById('vizSaveLibraryBtn');
      if (button) button.classList.toggle('hidden', !show);
      const floating = document.getElementById('floatingListeningSave');
      if (floating) floating.classList.toggle('hidden', !show);
      if (!show) setLibrarySaveBusy(false);
    }

    function setLibrarySaveBusy(isSaving) {
      const floating = document.getElementById('floatingListeningSave');
      if (floating) {
        floating.classList.toggle('is-saving', !!isSaving);
        floating.setAttribute('aria-busy', isSaving ? 'true' : 'false');
      }

      const buttons = Array.from(document.querySelectorAll([
        '#saveBtn',
        '#vizSaveLibraryBtn',
        '.floating-save-submit',
        'button[onclick*="saveLibraryUpdates"]'
      ].join(',')));
      buttons.forEach((button) => {
        if (!button) return;
        if (!button.dataset.saveIdleText) button.dataset.saveIdleText = button.textContent || 'Save';
        button.disabled = !!isSaving;
        button.classList.toggle('is-saving', !!isSaving);
        button.setAttribute('aria-busy', isSaving ? 'true' : 'false');

        const idleText = button.dataset.saveIdleText || 'Save';
        if (isSaving) {
          button.textContent = 'Saving…';
        } else {
          button.textContent = idleText;
          button.removeAttribute('aria-busy');
        }
      });
    }

    function downloadGenreBackup() {
      const payload = genresForSave();
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `genres_data_backup_${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showSaveToast('Backup JSON downloaded.', false);
    }

    async function saveLibraryUpdates() {
      finalizeListeningUpdatesBeforeSave();
      if (!libraryUpdatesPending) {
        setLibrarySaveBusy(false);
        showSaveToast('No listening updates to save.', false);
        return;
      }
      if (!appPassword) {
        setLibrarySaveBusy(false);
        openPasswordModal('library_save');
        return;
      }
      setLibrarySaveBusy(true);
      try {
        await doSaveWithPassword(appPassword);
        libraryUpdatesPending = false;
        window.__dgStudioCleanupSavePending = false;
        stagedQueueReactionKeys.clear();
        toggleLibrarySaveButton(false);
        setUnsavedState(false);
        const activeScreenId = document.querySelector('.screen.active')?.id || '';
        if (activeScreenId === 'screen-viz') {
          const restore = preserveScrollSnapshot();
          renderVisuals();
          restore();
        }
        if (currentGenre && document.getElementById('screen-listen')?.classList.contains('active')) {
          const skipListenRefresh = !!window.__dgSkipNextListenRefreshAfterSave;
          const restore = preserveScrollSnapshot();
          if (!skipListenRefresh) {
            loadListenScreen(currentGenre, { preserveDirty: false, skipSpotifyHydration: true });
          } else {
            // v192: Genre Identity saves already update the visible DNA/editor blocks
            // before persisting. Rebuilding the whole genre detail page here was
            // causing Firefox to churn through a huge same-page navigation/form
            // observer path after save. Keep the DOM stable for this save only.
            try {
              window.dispatchEvent(new CustomEvent('dailygenre:identity-save-skip-listen-refresh', { detail: { genreId: currentGenre?.id } }));
            } catch (_) {}
          }
          applyDetailEditMode(detailEditMode);
          resetListenDirtySnapshot();
          restore();
        }
        const status = document.getElementById('vizRefreshStatus');
        if (status) status.textContent = 'Library updates saved.';
        showSaveToast('Library updates saved.', false);
      } catch(e) {
        if (e && (e.code === 'STALE_DATA' || e.code === 'NO_REVISION')) {
          showSaveToast('Newer data exists elsewhere — reload before saving.', true);
          return;
        }
        if (e && e.code === 'AUTH_FAILED') {
          appPassword = '';
          openPasswordModal('library_save');
          passwordNotice.textContent = 'That password did not work.';
          return;
        }
        showSaveToast(`Library save failed: ${e?.message || 'Unknown Worker error.'}`, true);
      } finally {
        setLibrarySaveBusy(false);
      }
    }

    async function refreshVisualMetadata() {
      const button = document.getElementById('vizRefreshBtn');
      const status = document.getElementById('vizRefreshStatus');

      if (spotifyRefreshRunning) {
        spotifyRefreshCancelRequested = true;
        if (status) status.textContent = 'Stopping Spotify refresh after the current track…';
        return;
      }

      if (Date.now() < spotifyRefreshPausedUntil) {
        updateSpotifyPauseDisplay();
        return;
      }

      const items = visualRefreshScopeItems();
      const scopeLabel = visualRefreshScopeLabel();
      const allMetadataRows = collectMetadataRows(items);
      const skippedBulkRows = allMetadataRows.filter(row => row.bulkSkipped);
      const allRows = allMetadataRows.filter(row => row.group === 'spotify' && !row.bulkSkipped);
      if (!allRows.length) {
        if (status) status.textContent = skippedBulkRows.length
          ? `No bulk-refreshable Spotify tracks remain in ${scopeLabel}. Resource-missing tracks were skipped; use Retry Track or Edit URL in the Broken queue.`
          : `No valid Spotify tracks are currently missing official metadata in ${scopeLabel}.`;
        openMetadataQueue('broken', vizMode());
        return;
      }

      const rows = allRows.slice(0, 5);
      spotifyRefreshRunning = true;
      spotifyRefreshCancelRequested = false;
      spotifyRefreshReport = { updated:0, attempted:0, remaining:allRows.length, broken:0, rateLimited:0, failed:0, stopped:false, pausedSeconds:0, scope:scopeLabel };
      if (button) button.textContent = '■ Stop Refresh';

      try {
        for (let i = 0; i < rows.length; i += 1) {
          if (spotifyRefreshCancelRequested) {
            spotifyRefreshReport.stopped = true;
            break;
          }
          const row = rows[i];
          spotifyRefreshReport.attempted += 1;
          if (status) status.innerHTML = `<div class="viz-refresh-progress"><div>Refreshing ${escapeHtml(scopeLabel)}… ${i + 1} / ${rows.length} (${allRows.length} initially pending in this scope)</div><div class="viz-refresh-bar"><span style="width:${Math.round(((i + 1) / rows.length) * 100)}%"></span></div><div class="small">Only five tracks are attempted per run to protect your Spotify API quota.</div></div>`;

          const result = await fetchSpotifyTrackResult(row.song.url, true);
          if (result.ok) {
            const target = findSongForMetadataAction(row.genre.id, songIdentity(row.song));
            if (target) {
              applyOfficialSpotifyMetadata(target.song, result.track);
              target.genre.songs_listened = target.songs;
              spotifyRefreshReport.updated += 1;
              spotifyMetadataFailures.delete(row.key);
            }
          } else if (result.code === 'rate_limited') {
            spotifyMetadataFailures.set(row.key, result);
            spotifyRefreshReport.rateLimited = 1;
            spotifyRefreshReport.pausedSeconds = result.retryAfterSeconds || 30;
            spotifyRefreshReport.stopped = true;
            beginSpotifyPause(spotifyRefreshReport.pausedSeconds);
            break;
          } else {
            spotifyMetadataFailures.set(row.key, result);
            if (result.code === 'broken') spotifyRefreshReport.broken += 1;
            else spotifyRefreshReport.failed += 1;
          }

          await waitForSpotifyPacing();
        }

        spotifyRefreshReport.remaining = collectMetadataRows(visualRefreshScopeItems()).filter(row => row.group === 'spotify' && !row.bulkSkipped).length;
        renderHistory();
        renderRankings();
        renderVisuals();

        if (spotifyRefreshReport.updated > 0) {
          libraryUpdatesPending = true;
          setUnsavedState(true);
          toggleLibrarySaveButton(true);
        }

        if (spotifyRefreshReport.rateLimited) {
          updateSpotifyPauseDisplay();
          showSaveToast('Spotify paused requests. Save any completed updates; do not retry until the countdown ends.', false);
        } else if (spotifyRefreshReport.updated > 0) {
          if (status) status.innerHTML = `<span class="viz-library-save-callout">Updated ${spotifyRefreshReport.updated} Spotify track${spotifyRefreshReport.updated === 1 ? '' : 's'} in ${escapeHtml(scopeLabel)}. Click Save Library Updates, then run another batch later.</span>`;
          showSaveToast('Spotify metadata batch complete — save library updates to persist it.', false);
        } else if (status) {
          status.textContent = 'No tracks were updated. Check the Missing Metadata Queue below.';
        }
      } finally {
        spotifyRefreshRunning = false;
        spotifyRefreshCancelRequested = false;
        if (button && Date.now() >= spotifyRefreshPausedUntil) {
          button.textContent = spotifyRefreshReport?.remaining ? '↺ Refresh Next 5 Spotify Tracks' : '↺ Refresh Next 5 Spotify Tracks';
        }
      }
    }


function ensureBackToTopButton() {
  if (document.getElementById('dgBackToTopBtn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'dgBackToTopBtn';
  btn.className = 'dg-back-to-top';
  btn.title = 'Back to top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.textContent = '↑';
  btn.addEventListener('click', () => {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch { window.scrollTo(0, 0); }
  });
  document.body.appendChild(btn);
  const sync = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    btn.classList.toggle('show', y > 520);
  };
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  sync();
}

bootApp().catch(err => {
  console.error('App boot failed:', err);
  if (remainingCount) remainingCount.textContent = 'Could not start app. Check console.';
  showSaveToast(`App boot failed: ${err?.message || 'Unknown error'}`, true);
});
async function bootApp() {
  const params = spotifySafeTopUrl().searchParams;
  const hasSpotifyCallback = params.has('code') || params.has('error');
  // Remove stale return intents from older patched builds so they cannot trigger auth loops.
  (typeof SPOTIFY_OLD_RETURN_STORAGE_KEYS !== 'undefined' ? SPOTIFY_OLD_RETURN_STORAGE_KEYS : []).forEach(key => {
    try { safeSessionStorageRemove(key); } catch {}
    try { safeStorageRemove(key); } catch {}
  });

  loadSpotifySession();
  if (hasSpotifyCallback) {
    await spotifyHandleCallback().catch(err => {
      console.error('Spotify callback error:', err);
      showSaveToast(`Spotify callback error: ${err?.message || 'Unknown error'}`, true);
    });
  }
  if (spotifySession?.access_token) spotifyStartPolling();
  await loadData();
  ensureBackToTopButton();
  suppressAutofillOnGeneratedControls();
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) applyScreenInertState(activeScreen);
}

/* Daily Genre v226: identity listening lanes stay separate from queue order; matching queue rows get badges in place. */
