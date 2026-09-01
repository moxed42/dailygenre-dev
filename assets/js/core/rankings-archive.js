
    function rankedGenresForTier(tier) {
      return genres
        .filter(g => String(g.rating) === String(tier) && g.rating !== 'zanger')
        .sort((a,b) => (a.rank_order ?? 9999) - (b.rank_order ?? 9999));
    }

    function moveRank(id, direction) {
      const item = getGenreById(id);
      if (!item || !item.rating || item.rating === 'zanger') {
        window.dgRunPostHooks?.('moveRank', id, direction);
        return;
      }

      const tierItems = rankedGenresForTier(item.rating);
      const index = tierItems.findIndex(g => String(g.id) === String(item.id));
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= tierItems.length) {
        window.dgRunPostHooks?.('moveRank', id, direction);
        return;
      }

      const other = tierItems[swapIndex];
      const temp = item.rank_order;
      item.rank_order = other.rank_order;
      other.rank_order = temp;

      ensureRankOrderForRating(item.rating);
      renderRankings();
      window.dgRunPostHooks?.('moveRank', id, direction);
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
    // Phase 5 fix: this used to be computed once, synchronously, at this
    // file's own top level -- but archive-progressive.js (which defines
    // window.DailyGenreArchiveProgressive) loads AFTER core/rankings-archive.js
    // in index.html's real script order, so window.DailyGenreArchiveProgressive
    // was always undefined at this point and archiveProgressiveState was
    // permanently null. That silently disabled all batching: every Archive
    // render fell through to the "no progressive state" fallback (rendered:
    // items.length), i.e. the FULL genre list rendered as real DOM every
    // single time regardless of ARCHIVE_RENDER_BATCH_SIZE -- confirmed live,
    // 1036 genres rendering ~2400 DOM nodes and a ~135,000px tall screen.
    // Lazily creating it on first real use (well after all scripts have
    // loaded) fixes this without depending on script tag order at all.
    let archiveProgressiveStateInstance;
    let archiveProgressiveStateInitialized = false;
    function archiveProgressiveState() {
      if (!archiveProgressiveStateInitialized) {
        archiveProgressiveStateInitialized = true;
        archiveProgressiveStateInstance =
          window.DailyGenreArchiveProgressive?.createArchiveProgressiveState?.({
            batchSize: ARCHIVE_RENDER_BATCH_SIZE,
          }) || null;
      }
      return archiveProgressiveStateInstance;
    }
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
        archiveProgressiveState()?.prepare(signature, items.length) || {
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
      const progressiveState = archiveProgressiveState();
      if (!list || !progressiveState) return false;

      const before = progressiveState.snapshot();
      if (!before.hasMore) return false;

      const after = progressiveState.loadMore();
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
        archiveProgressiveState()?.snapshot?.() || {
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
        installed: Boolean(archiveProgressiveState()),
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
      if (!list) {
        window.dgRunPostHooks?.('renderHistory', options);
        return;
      }

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
          archiveProgressiveState()?.prepare(
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
        window.dgRunPostHooks?.('renderHistory', options);
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
      window.dgRunPostHooks?.('renderHistory', options);
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
