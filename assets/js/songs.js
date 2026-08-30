/* Daily Genre - Song Listening Focus add-on
   Loaded after app.js. It upgrades the genre detail song area in Listen mode without changing song storage. */
(() => {
  const FOCUS_STORAGE_PREFIX = "dailyGenreSongFocusKey:";
  const DETAILS_STORAGE_PREFIX = "dailyGenreSongDetailsOpen:";
  const FILTER_STORAGE_PREFIX = "dailyGenreSongQueueFilter:";
  const QUEUE_OPEN_STORAGE_PREFIX = "dailyGenreSongQueueOpen:";

  function isMobilePerfMode() {
    try {
      if (typeof window.isDailyGenreMobilePerfMode === "function") return window.isDailyGenreMobilePerfMode();
      return Boolean(window.matchMedia && window.matchMedia("(max-width: 760px)").matches);
    } catch (_) { return false; }
  }

  function safeCall(fn, fallback = "") {
    try {
      return typeof fn === "function" ? fn() : fallback;
    } catch {
      return fallback;
    }
  }

  function html(value) {
    return typeof escapeHtml === "function"
      ? escapeHtml(value == null ? "" : String(value))
      : String(value == null ? "" : value);
  }

  function songTitleWithMetaMarkup(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const metaWords = '(?:b\s*[-–—]?\s*side|remaster(?:ed)?|radio edit|single edit|album version|extended mix|club mix|original mix|vinyl|mono|stereo|live(?:\s+(?:at|from|in|on|@))?|live recording|demo|bonus track|explicit|clean|edit|version|alternate(?:\s+take)?|alt(?:\.|ernate)?\s+version|acoustic|session|take\s+\d+|anniversary|concert|soundtrack|ost|\b(?:19|20)\d{2}\b|dino synth|dungeon synth|feat\.?|ft\.?|featuring)';
    const patterns = [
      /^(.*?)(\s*(?:\((?:feat\.?|ft\.?|featuring)\s+[^)]{1,120}\)|\[(?:feat\.?|ft\.?|featuring)\s+[^\]]{1,120}\])\s*)$/i,
      /^(.*?)(\s*(?:\([^)]{1,90}\)|\[[^\]]{1,90}\])(?:\s*(?:\([^)]{1,90}\)|\[[^\]]{1,90}\]))+\s*)$/i,
      new RegExp('^(.*?)(\\s*(?:\\([^)]*' + metaWords + '[^)]*\\)|\\[[^\\]]*' + metaWords + '[^\\]]*\\])\\s*)$', 'i'),
      new RegExp('^(.*?)(\\s+(?:-|–|—)\\s*' + metaWords + '\\b.*)$', 'i'),
    ];
    for (const re of patterns) {
      const match = text.match(re);
      if (match && match[1] && match[2] && match[1].trim().length >= 2) {
        return `${html(match[1].trim())}<span class="song-title-edition">${html(match[2].trim())}</span>`;
      }
    }
    return html(text);
  }

  function looseSongText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(the|a|an|feat|ft)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function displayedSongDuplicateKey(song) {
    const title = looseSongText(song?.title || song?.name || "");
    const artist = looseSongText(
      song?.artist || (Array.isArray(song?.artists) ? song.artists.join(" ") : ""),
    );
    return title ? `${artist}|${title}` : "";
  }

  function songHasUsefulIdentityData(song) {
    if (!song) return false;
    const title = looseSongText(song.title || song.name || "");
    const artist = looseSongText(song.artist || (Array.isArray(song.artists) ? song.artists.join(" ") : ""));
    return Boolean(title || artist || song.spotifyId || identityTrackUrl(song));
  }

  function parsedIdentityTrack(track) {
    const out = { ...(track || {}) };
    let title = String(out.title || out.name || "").trim();
    let artist = String(out.artist || (Array.isArray(out.artists) ? out.artists.join(", ") : "")).trim();
    // Identity blocks are often entered as "Artist — Title" in a title/name field.
    // Split that only when there is no explicit artist, so covers remain distinct.
    if (!artist && title) {
      const parts = title.split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        artist = parts.shift();
        title = parts.join(" — ");
      }
    }
    out.title = title || out.title || out.name || "";
    out.name = out.name || out.title;
    out.artist = artist || out.artist || "";
    if (!Array.isArray(out.artists) && artist) out.artists = [artist];
    return out;
  }

  function clearStaleIdentityStamp(song) {
    if (!song) return song;
    if (!song.__dgIdentityMatched) {
      delete song.isIdentityTrack;
      delete song.identityType;
      delete song.identityIndex;
      delete song.identityLabel;
    }
    delete song.__dgIdentityMatched;
    return song;
  }

  function identityUrlLooksPlaceholder(url = "") {
    const value = String(url || "").trim();
    if (!value) return false;
    return /^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i.test(value);
  }

  function identityTrackUrl(song) {
    const url = safeCall(
      () => normalizeSongUrl(song?.spotifyUrl || song?.url || song?.spotify_url || ""),
      String(song?.spotifyUrl || song?.url || song?.spotify_url || "").trim(),
    );
    return identityUrlLooksPlaceholder(url) ? "" : url;
  }

  function identityTrackSpotifyId(song) {
    const explicit = String(song?.spotifyId || "").trim().toLowerCase();
    if (explicit) return explicit;
    const url = identityTrackUrl(song);
    const match = String(url || "").match(/spotify\.com\/track\/([a-z0-9]+)/i) || String(url || "").match(/^spotify:track:([a-z0-9]+)/i);
    return match ? match[1].toLowerCase() : "";
  }

  function identityTrackEntriesForGenre(genre) {
    if (!genre) return [];
    const id = genre.identity && typeof genre.identity === "object" ? genre.identity : {};
    const sem = parsedIdentityTrack({ ...(genre.seminal_song && typeof genre.seminal_song === "object" ? genre.seminal_song : {}), ...(id.seminalTrack && typeof id.seminalTrack === "object" ? id.seminalTrack : {}) });
    const mediaFlat = Array.isArray(genre.media_touchstones) ? genre.media_touchstones : [];
    const mediaId = Array.isArray(id.mediaTouchstones) ? id.mediaTouchstones : [];
    const media = mediaId.length ? mediaId : mediaFlat;
    const entries = [];
    if (sem.title || sem.name || sem.artist || sem.spotifyUrl || sem.url || sem.spotify_url) {
      entries.push({ type: "seminal", index: -1, label: "Seminal", track: sem, order: 0 });
    }
    (Array.isArray(media) ? media : []).forEach((rawTrack, index) => {
      const track = parsedIdentityTrack(rawTrack);
      if (track && typeof track === "object" && (track.title || track.name || track.artist || track.spotifyUrl || track.url || track.spotify_url)) {
        entries.push({ type: "media", index, label: "Media", track, order: 1 + index });
      }
    });
    return entries;
  }

  function hasIdentityComparableData(song, track) {
    if (!song || !track) return false;
    if (identityTrackSpotifyId(song) || identityTrackSpotifyId(track)) return true;
    if (identityTrackUrl(song) || identityTrackUrl(track)) return true;
    const songTitle = looseSongText(song?.title || song?.name || "");
    const entryTitle = looseSongText(track?.title || track?.name || "");
    return Boolean(songTitle || entryTitle);
  }

  function identityMatchScore(song, entry) {
    if (!song || !entry?.track) return 0;
    const songKeyText = displayedSongDuplicateKey(song);
    const entryKeyText = displayedSongDuplicateKey(entry.track);
    if (songKeyText && entryKeyText && songKeyText === entryKeyText) return 120;

    const songTitle = looseSongText(song?.title || song?.name || "");
    const entryTitle = looseSongText(entry.track?.title || entry.track?.name || "");
    const songArtist = looseSongText(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(" ") : ""));
    const entryArtist = looseSongText(entry.track?.artist || (Array.isArray(entry.track?.artists) ? entry.track.artists.join(" ") : ""));
    const hasBothTitles = Boolean(songTitle && entryTitle);
    const titleClose = hasBothTitles && (songTitle === entryTitle || songTitle.includes(entryTitle) || entryTitle.includes(songTitle));
    const hasBothArtists = Boolean(songArtist && entryArtist);
    const artistClose = !hasBothArtists || songArtist === entryArtist || songArtist.includes(entryArtist) || entryArtist.includes(songArtist);

    // v67: title/artist wins over stale URL/identity stamps. If a queue row has useful
    // text and it clearly does not describe this identity anchor, do not match it by an
    // old copied Spotify URL or identityType. This is what keeps Wonderwall from being
    // rendered as the Seminal track when its stored row has stale metadata.
    if (hasBothTitles && !titleClose) return 0;
    if (hasBothTitles && titleClose && !artistClose) return 0;
    if (hasBothTitles && titleClose && artistClose) return songTitle === entryTitle ? 110 : 70;

    const songSpotify = identityTrackSpotifyId(song);
    const entrySpotify = identityTrackSpotifyId(entry.track);
    if (songSpotify && entrySpotify && songSpotify === entrySpotify) return 100;
    const songUrl = identityTrackUrl(song);
    const entryUrl = identityTrackUrl(entry.track);
    if (songUrl && entryUrl && songUrl === entryUrl) return 90;

    // Last-resort legacy fallback: only use stale stored flags when the row has no URL/title/artist data.
    if (!songHasUsefulIdentityData(song)) {
      const songType = String(song.identityType || "").toLowerCase();
      if (song.isIdentityTrack && (songType === entry.type || (songType === "popular" && entry.type === "media")) && Number(song.identityIndex ?? -999) === Number(entry.index ?? -999)) return 10;
    }
    return 0;
  }

  function songMatchesIdentityEntry(song, entry) {
    return identityMatchScore(song, entry) > 0;
  }

  function identityEntryForSong(song, genre) {
    const entries = identityTrackEntriesForGenre(genre || (typeof currentGenre !== "undefined" ? currentGenre : null));
    let best = null;
    let bestScore = 0;
    entries.forEach((entry) => {
      const score = identityMatchScore(song, entry);
      if (score > bestScore || (score === bestScore && best && identityEntryOrder(entry) < identityEntryOrder(best))) {
        best = entry;
        bestScore = score;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function stampSongAsIdentity(song, entry) {
    // v228: Badge the visible row, but never move it. Existing recommendation rows
    // stay where they are; missing identity anchors are appended by genre-identity.js.
    if (!song || !entry) return song;
    song.__dgIdentityMatched = true;
    song.isIdentityTrack = true;
    song.identityType = entry.type;
    song.identityIndex = entry.index;
    song.identityLabel = entry.label;
    return song;
  }

  function identityEntryOrder(entry) {
    if (!entry) return 9999;
    return entry.type === "seminal" ? 0 : 100 + Math.max(0, Number(entry.index) || 0);
  }

  /* Daily Genre v198: detached Level Up annotations keep their source-song label after routing cleanup. */
  function songListForFocus(genre) {
    // v228: Genre DNA tracks are listenable anchors. Preserve existing matching
    // queue rows in place; newly missing Seminal/Media anchors are inserted at the
    // top by genre-identity.js so they are visible in the list/carousel.
    safeCall(() => window.DailyGenreIdentity?.ensureIdentityTracksInSongQueue?.(genre, false), false);
    const rawSongs = safeCall(
      () => inflateSongsFromStorage(genre?.songs_listened || []),
      genre?.songs_listened || [],
    );
    const out = [];
    (rawSongs || []).forEach((song, index) => {
      if (!song || song.isPending) return;
      clearStaleIdentityStamp(song);
      const identityEntry = identityEntryForSong(song, genre);
      const detachedLevelUpParent = song.isDetachedLevelUp
        ? {
            title: song.levelUpFromTitle || song.levelUpFrom || "routed source song",
            artist: song.levelUpFromArtist || "",
            url: song.levelUpFromUrl || "",
            genre: song.levelUpFromGenre || "",
          }
        : null;
      out.push({
        song,
        path: `song:${index}`,
        label: song.isDetachedLevelUp ? "Level Up" : song.isAdd ? "Add" : song.isPromote ? "Promote" : "Canon",
        isChild: !!song.isDetachedLevelUp,
        parentSong: detachedLevelUpParent,
        parentKey: song.isDetachedLevelUp ? `detached:${song.levelUpFromKey || song.levelUpFromUrl || song.levelUpFromTitle || index}` : null,
        identityEntry,
      });
      if (song.levelUp) {
        const childIdentityEntry = identityEntryForSong(song.levelUp, genre);
        if (!childIdentityEntry) clearStaleIdentityStamp(song.levelUp);
        out.push({
          song: song.levelUp,
          path: `song:${index}.levelUp`,
          label: "Level Up",
          isChild: true,
          parentSong: song,
          parentKey: songKey(song),
          identityEntry: childIdentityEntry,
        });
      }
    });
    const seen = new Set();
    return out.filter((entry) => {
      const key = displayedSongDuplicateKey(entry.song);
      if (!key) return true;
      // v194: Level Up rows are relationship rows. Keep them visible even when
      // the same target track also exists as a normal/canon row elsewhere in the genre.
      // Otherwise low-fit parents like "Turbo Lover" look like they have no Level Up.
      if (entry.isChild) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function songKey(song) {
    return safeCall(
      () => songIdentity(song),
      normalizeSongUrl(song?.url || song?.spotifyUrl || "") ||
        `${song?.artist || ""}::${song?.title || ""}`,
    );
  }

  function encodedSongKey(song) {
    return safeCall(
      () => encodeSongKeyForInline(song),
      encodeURIComponent(songKey(song)),
    );
  }

  function spotifyHref(song) {
    return safeCall(
      () => normalizeSongUrl(song?.spotifyUrl || song?.url || ""),
      song?.spotifyUrl || song?.url || "",
    );
  }

  function songSubline(song) {
    const parts = [];
    const artist =
      song.artist ||
      (Array.isArray(song.artists) ? song.artists.join(", ") : "");
    if (artist) parts.push(artist);
    if (song.releaseYear) parts.push(String(song.releaseYear));
    if (song.album) parts.push(song.album);
    if (song.durationMs && typeof formatTrackDuration === "function")
      parts.push(formatTrackDuration(song.durationMs));
    return parts.join(" · ");
  }

  function songTypeBadge(entry) {
    const matchedIdentity = entry.identityEntry || identityEntryForSong(entry.song);
    if (matchedIdentity) {
      stampSongAsIdentity(entry.song, matchedIdentity);
      if (matchedIdentity.type === "seminal")
        return '<span class="song-focus-badge seminal">Seminal</span>';
      if (matchedIdentity.type === "media")
        return '<span class="song-focus-badge media">Media</span>';
    }
    const identityType = String(entry.song?.identityType || "").toLowerCase();
    if (!songHasUsefulIdentityData(entry.song) && (entry.song?.isIdentityTrack || identityType)) {
      if (identityType === "seminal")
        return '<span class="song-focus-badge seminal">Seminal</span>';
      if (identityType === "media" || identityType === "popular")
        return '<span class="song-focus-badge media">Media</span>';
      return `<span class="song-focus-badge identity">${html(entry.song?.identityLabel || "Anchor")}</span>`;
    }
    if (entry.label === "Level Up" || entry.song?.isDetachedLevelUp)
      return '<span class="song-focus-badge level">Level Up</span>';
    if (entry.song?.promotedFrom || entry.song?.promotedTo || entry.song?.reviewedAt || entry.label === "Routed")
      return '<span class="song-focus-badge routed">Routed</span>';
    if (entry.label === "Add")
      return '<span class="song-focus-badge add">Add</span>';
    if (entry.song?.score != null)
      return `<span class="song-focus-badge">Fit ${html(entry.song.score)}/5</span>`;
    return '<span class="song-focus-badge">Canon</span>';
  }

  function genreFocusStorageKey(genre) {
    return `${FOCUS_STORAGE_PREFIX}${genre?.id || genre?.genre || "unknown"}`;
  }

  function genreDetailsStorageKey(genre) {
    return `${DETAILS_STORAGE_PREFIX}${genre?.id || genre?.genre || "unknown"}`;
  }

  function genreFilterStorageKey(genre) {
    return `${FILTER_STORAGE_PREFIX}${genre?.id || genre?.genre || "unknown"}`;
  }

  function genreQueueOpenStorageKey(genre) {
    return `${QUEUE_OPEN_STORAGE_PREFIX}${genre?.id || genre?.genre || "unknown"}`;
  }

  function isSongQueueOpen(genre) {
    try {
      return safeStorageGet(genreQueueOpenStorageKey(genre)) === "1";
    } catch {
      return false;
    }
  }

  function setSongQueueOpen(open) {
    try {
      if (typeof currentGenre !== "undefined" && currentGenre) {
        safeStorageSet(
          genreQueueOpenStorageKey(currentGenre),
          open ? "1" : "0",
        );
      }
    } catch {}
    enhanceSongListeningExperience();
  }

  function getSongQueueFilter(genre) {
    try {
      return safeStorageGet(genreFilterStorageKey(genre)) || "all";
    } catch {
      return "all";
    }
  }

  function setSongQueueFilter(filter) {
    const allowed = new Set([
      "all",
      "unrated",
      "favorites",
      "levelups",
      "adds",
      "fit5",
      "lowfit",
    ]);
    const next = allowed.has(filter) ? filter : "all";
    try {
      if (typeof currentGenre !== "undefined" && currentGenre) {
        safeStorageSet(genreFilterStorageKey(currentGenre), next);
      }
    } catch {}
    enhanceSongListeningExperience();
  }

  function isFavoriteEntry(entry) {
    return safeCall(() => isSameFavoriteSong(currentGenre, entry.song), false);
  }

  function numericFit(song) {
    const n = Number(song?.score);
    return Number.isFinite(n) ? n : null;
  }

  function filterSongEntries(entries, filter) {
    const selected = filter || "all";
    const parentMatches = (predicate) => {
      const matchedParents = new Set();
      const visible = [];
      (entries || []).forEach((entry) => {
        if (!entry?.isChild && predicate(entry)) {
          visible.push(entry);
          if (entry.song) matchedParents.add(songKey(entry.song));
        }
      });
      // v194: if a parent row is visible in a filtered view, keep its Level Up child
      // directly available for context even if the child itself does not match the filter.
      (entries || []).forEach((entry) => {
        if (entry?.isChild && entry.parentKey && matchedParents.has(entry.parentKey)) {
          if (!visible.includes(entry)) visible.push(entry);
        }
      });
      return visible;
    };
    if (selected === "unrated")
      return parentMatches((entry) => !entry.song?.reaction);
    if (selected === "favorites")
      return entries.filter((entry) => isFavoriteEntry(entry));
    if (selected === "levelups")
      return entries.filter(
        (entry) => entry.label === "Level Up" || entry.song?.isLevelUp,
      );
    if (selected === "adds")
      return entries.filter(
        (entry) => entry.label === "Add" || entry.song?.isAdd,
      );
    if (selected === "fit5")
      return entries.filter((entry) => numericFit(entry.song) === 5);
    if (selected === "lowfit")
      return parentMatches((entry) => {
        const fit = numericFit(entry.song);
        return fit != null && fit <= 3;
      });
    return entries;
  }

  function renderSongQueueFilters(entries, activeFilter) {
    const filterDefs = [
      ["all", "All", entries.length],
      [
        "unrated",
        "Unrated",
        entries.filter((entry) => !entry.song?.reaction).length,
      ],
      [
        "favorites",
        "Favorites",
        entries.filter((entry) => isFavoriteEntry(entry)).length,
      ],
      [
        "levelups",
        "Level Ups",
        entries.filter(
          (entry) => entry.label === "Level Up" || entry.song?.isLevelUp,
        ).length,
      ],
      [
        "adds",
        "Adds",
        entries.filter((entry) => entry.label === "Add" || entry.song?.isAdd)
          .length,
      ],
      [
        "fit5",
        "Fit 5",
        entries.filter((entry) => numericFit(entry.song) === 5).length,
      ],
      [
        "lowfit",
        "Fit ≤3",
        entries.filter((entry) => {
          const fit = numericFit(entry.song);
          return fit != null && fit <= 3;
        }).length,
      ],
    ];
    return `<div class="song-focus-filters" role="group" aria-label="Song queue filters">
      ${filterDefs.map(([key, label, count]) => `<button type="button" class="song-focus-filter ${activeFilter === key ? "active" : ""}" onclick="setSongQueueFilter('${key}')">${html(label)} <span>${count}</span></button>`).join("")}
    </div>`;
  }

  function getSelectedSongEntry(genre, entries) {
    if (!entries.length) return null;
    let stored = "";
    try {
      stored = safeStorageGet(genreFocusStorageKey(genre)) || "";
    } catch {}
    const storedMatch = stored
      ? entries.find((entry) => songKey(entry.song) === stored)
      : null;
    if (storedMatch) return storedMatch;
    const unrated = entries.find((entry) => !entry.song?.reaction);
    return unrated || entries[0];
  }

  function setSelectedSongKey(key) {
    try {
      if (typeof currentGenre !== "undefined" && currentGenre) {
        safeStorageSet(genreFocusStorageKey(currentGenre), key || "");
      }
    } catch {}
    enhanceSongListeningExperience();
  }

  function moveSongFocus(delta) {
    if (typeof currentGenre === "undefined" || !currentGenre) return;
    const entries = songListForFocus(currentGenre);
    if (!entries.length) return;
    const activeFilter = getSongQueueFilter(currentGenre);
    const visibleEntries = filterSongEntries(entries, activeFilter);
    const sequence = visibleEntries.length ? visibleEntries : entries;
    const currentKey = (() => {
      try {
        return safeStorageGet(genreFocusStorageKey(currentGenre)) || "";
      } catch {
        return "";
      }
    })();
    const currentIndex = Math.max(
      0,
      sequence.findIndex((entry) => songKey(entry.song) === currentKey),
    );
    const nextIndex =
      (currentIndex + delta + sequence.length) % sequence.length;
    setSelectedSongKey(songKey(sequence[nextIndex].song));
  }

  function setSongDetailsOpen(open) {
    try {
      if (typeof currentGenre !== "undefined" && currentGenre) {
        safeStorageSet(
          genreDetailsStorageKey(currentGenre),
          open ? "1" : "0",
        );
      }
    } catch {}
    enhanceSongListeningExperience();
  }

  function isSongDetailsOpen(genre) {
    try {
      return safeStorageGet(genreDetailsStorageKey(genre)) === "1";
    } catch {
      return false;
    }
  }


  function decodeFocusPath(encodedPath = "") {
    try {
      return decodeURIComponent(String(encodedPath || ""));
    } catch {
      return String(encodedPath || "");
    }
  }

  function clearFavoriteIfDeleted(song) {
    if (typeof currentGenre === "undefined" || !currentGenre || !song) return;
    const sameFavorite = safeCall(() => isSameFavoriteSong(currentGenre, song), false);
    const deletedUrl = safeCall(() => normalizeSongUrl(song.spotifyUrl || song.url || ""), song.spotifyUrl || song.url || "");
    const favoriteUrl = safeCall(() => normalizeSongUrl(currentGenre.favoritesongurl || currentGenre.favorite_song_url || ""), currentGenre.favoritesongurl || currentGenre.favorite_song_url || "");
    if (!sameFavorite && (!deletedUrl || deletedUrl !== favoriteUrl)) return;
    currentGenre.favoritesong = "";
    currentGenre.favoritesongurl = "";
    currentGenre.favorite_song = "";
    currentGenre.favorite_song_url = "";
    currentGenre.favoriteartist = "";
    currentGenre.favoritesongartwork = "";
  }

  function deleteSongFromDetails(encodedKey, encodedPath = "", button = null) {
    if (typeof currentGenre === "undefined" || !currentGenre) return;
    const path = decodeFocusPath(encodedPath);
    if (!window.confirm("Remove this song from this genre only? This does not delete copies from other genres or Studio queues.")) return;

    const previousText = button?.textContent || "";
    if (button) {
      button.disabled = true;
      button.textContent = "Deleting…";
    }

    try {
      if (typeof syncBulkDraftIntoSongModel === "function") syncBulkDraftIntoSongModel();
      const result = typeof findEditableSongTarget === "function"
        ? findEditableSongTarget(encodedKey, -1, path)
        : null;
      if (!result?.song || !Array.isArray(result.songs)) {
        if (typeof showSaveToast === "function") showSaveToast("That song changed. Reopen details and try again.", true);
        return;
      }

      const deletedSong = result.song;
      if (result.parent) {
        result.parent.levelUp = null;
      } else if (Number.isInteger(result.index) && result.index >= 0) {
        result.songs.splice(result.index, 1);
      } else {
        if (typeof showSaveToast === "function") showSaveToast("Could not locate that song for deletion.", true);
        return;
      }

      currentGenre.songs_listened = result.songs;
      clearFavoriteIfDeleted(deletedSong);
      if (typeof syncSongsBulkEditorFromModel === "function") syncSongsBulkEditorFromModel();
      window.__dailyGenreSuppressBulkSongSyncUntil = Date.now() + 60000;
      window.__dailyGenreQueueModelAuthoritativeUntil = Date.now() + 60000;

      const nextEntries = songListForFocus(currentGenre);
      try {
        if (nextEntries.length) safeStorageSet(genreFocusStorageKey(currentGenre), songKey(nextEntries[0].song));
        else safeStorageRemove(genreFocusStorageKey(currentGenre));
      } catch {}
      if (!nextEntries.length) setSongDetailsOpen(false);

      if (typeof markListeningUpdatePending === "function") markListeningUpdatePending();
      enhanceSongListeningExperience();
      if (typeof showSaveToast === "function") showSaveToast("Removed from this genre — use Save Listening Updates to keep it.", false);
    } catch (error) {
      console.error("Could not delete song from details", error);
      if (typeof showSaveToast === "function") showSaveToast(`Could not delete song: ${error?.message || error || "Unknown error"}`, true);
    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = previousText || "Remove from genre";
      }
    }
  }

  function v197SongMatchesDeleteTarget(song, target) {
    if (!song || !target) return false;
    const norm = (value) => String(value || "").trim().toLowerCase();
    const songUrl = norm(safeCall(() => normalizeSongUrl(song.spotifyUrl || song.url || ""), song.spotifyUrl || song.url || ""));
    const targetUrl = norm(safeCall(() => normalizeSongUrl(target.spotifyUrl || target.url || ""), target.spotifyUrl || target.url || ""));
    if (songUrl && targetUrl && songUrl === targetUrl) return true;
    if (norm(song.spotifyId) && norm(song.spotifyId) === norm(target.spotifyId)) return true;
    if (norm(song.isrc) && norm(song.isrc) === norm(target.isrc)) return true;
    if (target.key && norm(songKey(song)) === norm(target.key)) return true;
    const songMeta = `${norm(song.artist || (Array.isArray(song.artists) ? song.artists.join(" ") : ""))}|${norm(song.title || song.name || "")}`;
    const targetMeta = `${norm(target.artist)}|${norm(target.title)}`;
    return songMeta !== "|" && songMeta === targetMeta;
  }

  function v197PruneCurrentGenreForHardDelete(target) {
    if (typeof currentGenre === "undefined" || !currentGenre) return 0;
    const songs = Array.isArray(currentGenre.songs_listened) ? currentGenre.songs_listened : [];
    let removed = 0;
    const kept = [];
    songs.forEach((song) => {
      if (v197SongMatchesDeleteTarget(song, target)) {
        removed += 1;
        return;
      }
      if (song?.levelUp && v197SongMatchesDeleteTarget(song.levelUp, target)) {
        song.levelUp = null;
        removed += 1;
      }
      kept.push(song);
    });
    if (removed) currentGenre.songs_listened = kept;
    return removed;
  }

  function hardDeleteSongFromDetails(encodedKey, encodedPath = "", button = null) {
    if (typeof currentGenre === "undefined" || !currentGenre) return;
    try {
      if (typeof syncBulkDraftIntoSongModel === "function") syncBulkDraftIntoSongModel();
    } catch {}
    const path = decodeFocusPath(encodedPath);
    const result = typeof findEditableSongTarget === "function"
      ? findEditableSongTarget(encodedKey, -1, path)
      : null;
    if (!result?.song) {
      if (typeof showSaveToast === "function") showSaveToast("That song changed. Reopen details and try again.", true);
      return;
    }
    const song = result.song;
    const label = [song.artist, song.title || song.name].filter(Boolean).join(" — ") || "this song";
    if (!window.confirm(`Delete ${label} everywhere?

This removes it from every genre and Studio queue. It becomes permanent after Save Library Updates.`)) return;
    const previousText = button?.textContent || "Delete everywhere";
    if (button) {
      button.disabled = true;
      button.textContent = "Deleting…";
    }
    try {
      if (typeof window.hardDeleteSongEverywhere !== "function") {
        if (typeof showSaveToast === "function") showSaveToast("Delete everywhere helper is not available. Refresh and try again.", true);
        return;
      }
      const target = {
        key: safeCall(() => songKey(song), ""),
        title: song.title || song.name || "",
        artist: song.artist || (Array.isArray(song.artists) ? song.artists.join(" ") : ""),
        url: song.spotifyUrl || song.url || "",
        spotifyId: song.spotifyId || "",
        isrc: song.isrc || "",
      };
      const outcome = window.hardDeleteSongEverywhere(target, { renderStudio: false });
      const localRemoved = v197PruneCurrentGenreForHardDelete(target);
      if (!outcome?.deleted && !localRemoved) {
        if (typeof showSaveToast === "function") showSaveToast("No matching songs were found to delete.", true);
        return;
      }
      window.__dailyGenreSuppressBulkSongSyncUntil = Date.now() + 60000;
      window.__dailyGenreQueueModelAuthoritativeUntil = Date.now() + 60000;
      if (typeof syncSongsBulkEditorFromModel === "function") syncSongsBulkEditorFromModel();
      if (typeof markListeningUpdatePending === "function") markListeningUpdatePending();
      const nextEntries = songListForFocus(currentGenre);
      try {
        if (nextEntries.length) safeStorageSet(genreFocusStorageKey(currentGenre), songKey(nextEntries[0].song));
        else safeStorageRemove(genreFocusStorageKey(currentGenre));
      } catch {}
      if (!nextEntries.length) setSongDetailsOpen(false);
      enhanceSongListeningExperience();
      const deletedCount = (outcome?.deleted || 0) + (localRemoved && !outcome?.deleted ? localRemoved : 0);
      if (typeof showSaveToast === "function") showSaveToast(`Deleted ${deletedCount} ${deletedCount === 1 ? "copy" : "copies"} everywhere — Save Library Updates to persist.`, false);
    } catch (error) {
      console.error("Could not delete song everywhere", error);
      if (typeof showSaveToast === "function") showSaveToast(`Could not delete song everywhere: ${error?.message || error || "Unknown error"}`, true);
    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = previousText;
      }
    }
  }

  function refreshSongReactionUI(encodedKey, reaction) {
    const repaintResult =
      window.DailyGenreSongReaction?.repaint?.(
        document,
        encodedKey,
        reaction,
      ) || {
        repainted: false,
        matchedControls: 0,
        groupsUpdated: 0,
      };

    if (typeof currentGenre === "undefined" || !currentGenre) {
      return repaintResult;
    }

    const activeFilter = getSongQueueFilter(currentGenre);

    // A reaction changes membership in the Unrated lane. Rebuild only the
    // focused carousel/queue, not the complete listening screen.
    if (activeFilter === "unrated") {
      enhanceSongListeningExperience();
      return {
        ...repaintResult,
        repainted: true,
        structuralRefresh: true,
      };
    }

    // Keep the visible Unrated count accurate without rebuilding song data.
    // The hidden canonical cards remain mounted for edit/save helpers, so their
    // reaction groups provide a cheap source of truth for this badge.
    const reactionByKey = new Map();
    Array.from(document.querySelectorAll(".song-quick-actions")).forEach((group) => {
      const controls = Array.from(
        group.querySelectorAll(".song-reaction-btn"),
      );
      const metadata = controls
        .map((button) =>
          window.DailyGenreSongReaction?.controlMetadata?.(button),
        )
        .find(Boolean);
      if (!metadata?.encodedKey) return;
      reactionByKey.set(
        metadata.encodedKey,
        controls.some((button) => button.classList.contains("active")),
      );
    });
    const unratedCount = Array.from(reactionByKey.values())
      .filter((isRated) => !isRated)
      .length;
    Array.from(document.querySelectorAll(".song-focus-filter")).forEach((button) => {
      const onclick = button.getAttribute("onclick") || "";
      if (!/setSongQueueFilter\(['"]unrated['"]\)/.test(onclick)) return;
      const count = button.querySelector("span");
      if (count) count.textContent = String(unratedCount);
    });

    return repaintResult;
  }

  function renderReactionButtons(song, extraClass = "") {
    const encodedKey = encodedSongKey(song);
    const isFavorite = safeCall(
      () => isSameFavoriteSong(currentGenre, song),
      false,
    );
    const staged = safeCall(
      () =>
        stagedQueueReactionKeys.has(
          stagedReactionKey(currentGenre.id, songKey(song)),
        ),
      false,
    );
    return `<div class="song-focus-actions ${extraClass}">
      <button type="button" class="song-focus-reaction ${Number(song.reaction) === 3 ? "active" : ""}" onclick="event.stopPropagation(); setSongReaction('${encodedKey}', 3)" title="I Fuck With This" aria-label="I Fuck With This">👍</button>
      <button type="button" class="song-focus-reaction ${Number(song.reaction) === 2 ? "active" : ""}" onclick="event.stopPropagation(); setSongReaction('${encodedKey}', 2)" title="Meh, It’s Fine" aria-label="Meh, It’s Fine">🤷</button>
      <button type="button" class="song-focus-reaction ${Number(song.reaction) === 1 ? "active" : ""}" onclick="event.stopPropagation(); setSongReaction('${encodedKey}', 1)" title="Fuck Off" aria-label="Fuck Off">👎</button>
      <button type="button" class="song-focus-trophy ${isFavorite ? "active" : ""}" onclick="event.stopPropagation(); makeSongFavorite('${encodedKey}')" title="${isFavorite ? "Remove favorite song" : "Make favorite song"}" aria-label="${isFavorite ? "Remove favorite song" : "Make favorite song"}">🏆</button>
      ${staged ? '<span class="song-focus-unsaved">Unsaved</span>' : ""}
    </div>`;
  }

  function renderFocusedSong(
    entry,
    detailsOpen,
    entries = [],
    activeFilter = "all",
  ) {
    const song = entry.song;
    const href = spotifyHref(song);
    const hasHref = /^https?:\/\//i.test(href);
    const title = song.title || (hasHref ? "Linked track" : "Track");
    const titleMarkup = songTitleWithMetaMarkup(title);
    const art = song.artwork || song.albumArt || "";
    const artStyle = art
      ? ` style="--song-focus-art:url('${html(art).replace(/'/g, "%27")}')"`
      : "";
    const reason = song.reason || "";
    const subline = songSubline(song);
    const miniTitle = encodeURIComponent(title || "Spotify track");
    const miniArtist = encodeURIComponent(
      song.artist ||
        (Array.isArray(song.artists) ? song.artists.join(", ") : ""),
    );
    const miniArtwork = encodeURIComponent(art || "");
    const miniUrl = encodeURIComponent(href || "");
    const miniButton = hasHref
      ? `<button type="button" class="song-focus-mini-btn spotify-mini-play" onclick="event.preventDefault(); event.stopPropagation(); if (typeof stickyPlayerOpen === 'function') stickyPlayerOpen('${miniUrl}', '${miniTitle}', '${miniArtist}', '${miniArtwork}');" title="Open mini player" aria-label="Open Spotify mini player">▶</button>`
      : "";
    const readMore = "";
    const filterLabel =
      activeFilter && activeFilter !== "all" ? ` in current filter` : "";
    const relation =
      entry.isChild && entry.parentSong
        ? `<div class="song-focus-relation-hero">↳ Level up from ${html([entry.parentSong.artist, entry.parentSong.title].filter(Boolean).join(" — ") || entry.parentSong.title || "previous pick")}</div>`
        : "";
    const sequenceCount =
      filterSongEntries(entries, activeFilter).length || entries.length;
    return `<section class="song-focus-player"${artStyle}>
      ${sequenceCount > 1 ? `<button type="button" class="song-focus-nav song-focus-nav-prev" onclick="moveSongFocus(-1)" title="Previous song${filterLabel}" aria-label="Previous song${filterLabel}">‹</button><button type="button" class="song-focus-nav song-focus-nav-next" onclick="moveSongFocus(1)" title="Next song${filterLabel}" aria-label="Next song${filterLabel}">›</button>` : ""}
      <div class="song-focus-art-wrap">
        ${art ? `<img class="song-focus-art" src="${html(art)}" alt="${html(title)} artwork" loading="lazy">` : '<div class="song-focus-art song-focus-art-placeholder">♪</div>'}
      </div>
      <div class="song-focus-main">
        <div class="song-focus-kicker">Now Listening · ${songTypeBadge(entry)}</div>
        <h3 class="song-focus-title">${hasHref ? `<a href="${html(href)}" target="_blank" rel="noopener noreferrer">${titleMarkup} <span class="song-link-arrow">↗</span></a>` : titleMarkup}</h3>
        ${subline ? `<div class="song-focus-subline">${html(subline)}</div>` : ""}
        ${relation}
        ${reason ? `<p class="song-focus-reason">${html(reason)}</p>` : ""}
        <div class="song-focus-control-row">
          ${renderReactionButtons(song, "hero")}
          ${miniButton}
          <button type="button" class="song-focus-details-btn" onclick="setSongFocusDetailsOpen(${detailsOpen ? "false" : "true"})">${detailsOpen ? "Hide details" : "Details"}</button>
        </div>
      </div>
    </section>`;
  }

  function renderSongDetails(entry) {
    const song = entry.song;
    const encodedKey = encodedSongKey(song);
    const encodedPath = encodeURIComponent(entry.path || "").replace(
      /[!'()*]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const trackUrl = safeCall(
      () => normalizeSongUrl(song.spotifyUrl || song.url || ""),
      song.spotifyUrl || song.url || "",
    );
    const canRefreshSpotify =
      /spotify\.com\/track\//i.test(trackUrl) ||
      /^spotify:track:/i.test(trackUrl);
    const meta = [];
    if (song.spotifyId) meta.push(`Spotify ID: ${song.spotifyId}`);
    if (song.isrc) meta.push(`ISRC: ${song.isrc}`);
    if (song.releaseDate) meta.push(`Release: ${song.releaseDate}`);
    if (song.releaseSource) meta.push(`Source: ${song.releaseSource}`);
    return `<section class="song-focus-details-drawer song-focus-details-compact">
      <div class="song-focus-details-head">
        <div>
          <div class="eyebrow">Song details</div>
          <h3>${songTitleWithMetaMarkup(song.title || "Selected song")}</h3>
        </div>
        <div class="song-focus-details-actions">
          <button type="button" class="btn btn-danger btn-tiny song-focus-delete-inline" onclick="event.preventDefault(); event.stopPropagation(); deleteSongFromDetails('${encodedKey}', '${encodedPath}', this)">Remove from genre</button>
          <button type="button" class="btn btn-danger btn-tiny song-focus-delete-inline" onclick="event.preventDefault(); event.stopPropagation(); hardDeleteSongFromDetails('${encodedKey}', '${encodedPath}', this)" title="Permanently delete this song from every genre and every queue">Delete everywhere</button>
          <button type="button" class="btn btn-secondary btn-tiny" onclick="setSongFocusDetailsOpen(false)">Close</button>
        </div>
      </div>
      <div class="song-focus-details-grid compact">
        <div class="song-focus-detail-card song-focus-fit-card">
          <button type="button" class="song-focus-pencil-btn" onclick="if (typeof openStudioMode === 'function') openStudioMode(); else if (typeof toggleDetailEditMode === 'function') toggleDetailEditMode();" title="Edit reason" aria-label="Edit reason">✎</button>
          <h4>Why this song fits</h4>
          <p>${song.reason ? html(song.reason) : "No fit note yet."}</p>
        </div>
        <div class="song-focus-detail-card song-focus-url-card">
          <h4>Track URL</h4>
          <div class="song-focus-url-row">
            <input data-track-url-input type="url" value="${html(trackUrl)}" placeholder="Paste Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp URL">
            <button type="button" class="btn btn-primary btn-tiny" onclick="updateTrackUrlFromCard('${encodedKey}', -1, this, '${encodedPath}')">Apply URL / Overrides</button>
          </div>
          <div class="track-card-manual-meta song-focus-manual-meta">
            <input data-track-title-input type="text" value="${html(song.title || '')}" placeholder="Override title if metadata is messy">
            <input data-track-artist-input type="text" value="${html(song.artist || (Array.isArray(song.artists) ? song.artists.join(', ') : ''))}" placeholder="Override artist/channel if needed">
          </div>
          <p class="song-focus-helper">Title/artist overrides are staged here. Click Apply URL / Overrides, then use the floating Save button to persist.</p>
        </div>
        <div class="song-focus-detail-card song-focus-meta-card">
          <h4>Metadata</h4>
          <p>${meta.length ? html(meta.join(" · ")) : "No extra metadata available."}</p>
        </div>

      </div>
    </section>`;
  }

  function renderSongQueue(
    entries,
    selectedKey,
    activeFilter = "all",
    queueOpen = false,
  ) {
    const allVisibleEntries = filterSongEntries(entries, activeFilter);
    const mobilePerf = isMobilePerfMode();
    const selectedVisibleIndex = Math.max(0, allVisibleEntries.findIndex((entry) => songKey(entry.song) === selectedKey));
    const mobileWindowStart = mobilePerf ? Math.max(0, selectedVisibleIndex - 8) : 0;
    const visibleEntries = mobilePerf ? allVisibleEntries.slice(mobileWindowStart, mobileWindowStart + 18) : allVisibleEntries;
    const hiddenMobileEntries = mobilePerf ? Math.max(0, allVisibleEntries.length - visibleEntries.length) : 0;
    const reactedCount = entries.filter((entry) => entry.song?.reaction).length;
    const favoriteCount = entries.filter((entry) =>
      isFavoriteEntry(entry),
    ).length;
    const unratedCount = entries.length - reactedCount;
    const selectedIndex = Math.max(
      0,
      entries.findIndex((entry) => songKey(entry.song) === selectedKey),
    );
    const selectedEntry = entries[selectedIndex] || entries[0];
    const nextEntries = [];
    for (let i = 1; i <= Math.min(6, Math.max(0, entries.length - 1)); i++) {
      nextEntries.push(entries[(selectedIndex + i) % entries.length]);
    }

    const collapsedPreview = `<div class="song-focus-queue-collapsed">
      <div>
        <div class="song-focus-queue-summary-title">${entries.length} songs · ${reactedCount} reacted · ${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"} · ${unratedCount} unrated</div>
        ${selectedEntry ? `<div class="song-focus-queue-summary-sub">Current: ${html(selectedEntry.song?.title || "Selected song")}${selectedEntry.isChild && selectedEntry.parentSong ? ` · Level up from ${html([selectedEntry.parentSong.artist, selectedEntry.parentSong.title].filter(Boolean).join(" — ") || selectedEntry.parentSong.title || "previous pick")}` : ""}</div>` : ""}
      </div>
      <div class="song-focus-cover-strip" aria-label="Upcoming songs">
        ${nextEntries
          .map((entry) => {
            const art = entry.song?.artwork || entry.song?.albumArt || "";
            const title = entry.song?.title || "Track";
            return `<button type="button" class="song-focus-cover-peek ${entry.isChild ? "levelup" : ""}" onclick="setSongFocus('${html(songKey(entry.song)).replace(/'/g, "&#39;")}')" title="${html(title)}">
            ${art ? `<img src="${html(art)}" alt="" loading="lazy">` : "<span>♪</span>"}
          </button>`;
          })
          .join("")}
        ${entries.length > nextEntries.length + 1 ? `<span class="song-focus-cover-more">+${entries.length - nextEntries.length - 1}</span>` : ""}
      </div>
    </div>`;

    return `<section class="song-focus-queue-card ${queueOpen ? "expanded" : "collapsed"}">
      <div class="song-focus-section-head">
        <div>
          <div class="eyebrow">Song queue</div>
          <div class="small">${reactedCount}/${entries.length} reacted · ${favoriteCount} favorite${activeFilter !== "all" ? ` · ${allVisibleEntries.length} shown` : ""}</div>
        </div>
        <button type="button" class="song-focus-queue-toggle" onclick="setSongQueueOpen(${queueOpen ? "false" : "true"})">${queueOpen ? "Collapse queue" : "Show queue"}</button>
      </div>
      ${
        queueOpen
          ? `${renderSongQueueFilters(entries, activeFilter)}
      <div class="song-focus-queue">
        ${
          visibleEntries.length
            ? visibleEntries
                .map((entry) => {
                  const song = entry.song;
                  const key = songKey(song);
                  const selected = key === selectedKey;
                  const art = song.artwork || song.albumArt || "";
                  const title = song.title || "Track";
                  const subline = songSubline(song);
                  const href = spotifyHref(song);
                  const hasHref = /^https?:\/\//i.test(href);
                  const safeKeyAttr = html(key).replace(/'/g, "&#39;");
                  const titleMarkup = hasHref
                    ? `<a class="song-focus-row-title" href="${html(href)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${html(title)} <span class="song-link-arrow">↗</span></a>`
                    : `<span class="song-focus-row-title">${html(title)}</span>`;
                  const rowMiniTitle = encodeURIComponent(title || "Spotify track");
                  const rowMiniArtist = encodeURIComponent(song.artist || (Array.isArray(song.artists) ? song.artists.join(", ") : ""));
                  const rowMiniArtwork = encodeURIComponent(art || "");
                  const rowMiniUrl = encodeURIComponent(href || "");
                  const rowMiniButton = hasHref
                    ? `<button type="button" class="song-focus-row-play spotify-mini-play" onclick="event.preventDefault(); event.stopPropagation(); if (typeof stickyPlayerOpen === 'function') stickyPlayerOpen('${rowMiniUrl}', '${rowMiniTitle}', '${rowMiniArtist}', '${rowMiniArtwork}');" title="Open mini player" aria-label="Open Spotify mini player">▶</button>`
                    : "";
                  const childRelation =
                    entry.isChild && entry.parentSong
                      ? `<span class="song-focus-row-relation">↳ Level up from ${html([entry.parentSong.artist, entry.parentSong.title].filter(Boolean).join(" — ") || entry.parentSong.title || "previous pick")}</span>`
                      : "";
                  const childReason =
                    entry.isChild && song.reason
                      ? `<span class="song-focus-row-reason">${html(song.reason)}</span>`
                      : "";
                  const parentSelected =
                    !selected &&
                    entry.parentKey &&
                    entry.parentKey === selectedKey;
                  return `<div role="button" tabindex="0" class="song-focus-row ${selected ? "active" : ""} ${parentSelected ? "parent-active" : ""} ${entry.isChild ? "levelup-child" : ""} ${Number(song.reaction) ? "reacted" : ""}" onclick="setSongFocus('${safeKeyAttr}')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); setSongFocus('${safeKeyAttr}'); }">
            ${art ? `<img class="song-focus-row-art" src="${html(art)}" alt="${html(title)} artwork" loading="lazy">` : '<span class="song-focus-row-art placeholder">♪</span>'}
            <span class="song-focus-row-main">
              <span class="song-focus-row-title-line">${rowMiniButton}${titleMarkup}${selected ? '<span class="song-focus-now-badge">Now Listening</span>' : ""}</span>
              ${subline ? `<span class="song-focus-row-sub">${html(subline)}</span>` : ""}
              ${childRelation}
              ${childReason}
            </span>
            <span class="song-focus-row-badge-wrap">${songTypeBadge(entry)}</span>
            ${renderReactionButtons(song, "queue")}
          </div>`;
                })
                .join("") + (hiddenMobileEntries ? `<div class="song-focus-empty-filter">Showing nearby 18 of ${allVisibleEntries.length} songs on mobile. Use Next/Previous or filters to move through the queue.</div>` : "")
            : '<div class="song-focus-empty-filter">No songs match this filter.</div>'
        }
      </div>`
          : collapsedPreview
      }
    </section>`;
  }

  function enhanceSongListeningExperience() {
    if (typeof currentGenre === "undefined" || !currentGenre) return;
    const screen = document.getElementById("screen-listen");
    if (!screen || !screen.classList.contains("active")) return;
    const section = screen.querySelector(".detail-log-section");
    if (!section) return;
    const focusShell = screen.querySelector(".listening-focus-section-shell") || section;
    const songsPane = focusShell.querySelector(".listening-focus-songs") || section;
    if (songsPane.classList.contains("hidden")) return;
    const activeList = songsPane.querySelector(".detail-song-list");
    if (!activeList) return;

    const entries = songListForFocus(currentGenre);
    if (!entries.length) return;

    const activeFilter = getSongQueueFilter(currentGenre);
    const visibleEntries = filterSongEntries(entries, activeFilter);
    let selected = getSelectedSongEntry(currentGenre, entries);
    if (
      visibleEntries.length &&
      !visibleEntries.some(
        (entry) => songKey(entry.song) === songKey(selected.song),
      )
    ) {
      selected = visibleEntries[0];
    }
    const selectedKey = songKey(selected.song);
    try {
      safeStorageSet(genreFocusStorageKey(currentGenre), selectedKey);
    } catch {}
    const detailsOpen = isSongDetailsOpen(currentGenre);
    const queueOpen = isSongQueueOpen(currentGenre);

    screen.classList.add("listen-experience-mode");
    section.classList.add("song-focus-section");
    songsPane.classList.add("song-focus-section");
    const heading = Array.from(songsPane.children).find((el) =>
      el.classList?.contains("eyebrow"),
    );
    if (heading) heading.textContent = "Song Carousel";

    // The focused queue replaces the legacy logged-song list inside the Songs
    // pane. Keep the legacy DOM present for older edit/save helpers, but remove
    // it visually so the same songs are not shown twice under the carousel.
    songsPane.querySelectorAll(":scope .detail-song-list").forEach((list) => {
      list.classList.add("song-original-list-hidden");
      list.setAttribute("aria-hidden", "true");
    });

    let mount = songsPane.querySelector(":scope > .song-focus-experience");
    if (!mount) {
      mount = document.createElement("div");
      mount.className = "song-focus-experience";
      songsPane.insertBefore(mount, activeList);
    }
    mount.innerHTML = `${renderFocusedSong(selected, detailsOpen, entries, activeFilter)}${detailsOpen ? renderSongDetails(selected) : ""}${renderSongQueue(entries, selectedKey, activeFilter, queueOpen)}`;
  }

  function installNoJumpReactionWrapper() {
    if (window.__dailyGenreNoJumpReactionV32) return;
    const original = window.setSongReaction;
    if (typeof original !== "function") return;
    window.__dailyGenreNoJumpReactionV32 = true;
    window.setSongReaction = function dcNoJumpSetSongReaction(...args) {
      const anchor =
        document.querySelector(".song-focus-player") ||
        document.querySelector(".song-focus-experience") ||
        document.getElementById("dc-songs");
      const beforeTop = anchor?.getBoundingClientRect?.().top;
      const beforeScroll = window.scrollY || window.pageYOffset || 0;
      try {
        document.activeElement?.blur?.();
      } catch {}
      const result = original.apply(this, args);
      const restore = () => {
        const nextAnchor =
          document.querySelector(".song-focus-player") ||
          document.querySelector(".song-focus-experience") ||
          document.getElementById("dc-songs");
        if (Number.isFinite(beforeTop) && nextAnchor?.getBoundingClientRect) {
          const nextTop = nextAnchor.getBoundingClientRect().top;
          window.scrollTo({
            top:
              (window.scrollY || window.pageYOffset || 0) + nextTop - beforeTop,
            left: window.scrollX || window.pageXOffset || 0,
            behavior: "auto",
          });
        } else {
          window.scrollTo({
            top: beforeScroll,
            left: window.scrollX || 0,
            behavior: "auto",
          });
        }
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 40);
      setTimeout(restore, 140);
      return result;
    };
  }

  window.setSongFocus = setSelectedSongKey;
  window.setSongFocusDetailsOpen = setSongDetailsOpen;
  window.deleteSongFromDetails = deleteSongFromDetails;
  window.hardDeleteSongFromDetails = hardDeleteSongFromDetails;
  window.setSongQueueFilter = setSongQueueFilter;
  window.setSongQueueOpen = setSongQueueOpen;
  window.moveSongFocus = moveSongFocus;
  window.refreshSongReactionUI = refreshSongReactionUI;
  window.enhanceSongListeningExperience = enhanceSongListeningExperience;
  installNoJumpReactionWrapper();

  const originalLoadListenScreen =
    typeof loadListenScreen === "function" ? loadListenScreen : null;
  if (originalLoadListenScreen && !window.__dailyGenreSongFocusWrapped) {
    window.__dailyGenreSongFocusWrapped = true;
    loadListenScreen = function patchedLoadListenScreen(...args) {
      const beforeX = window.scrollX || window.pageXOffset || 0;
      const beforeY = window.scrollY || window.pageYOffset || 0;
      const result = originalLoadListenScreen.apply(this, args);
      setTimeout(() => {
        enhanceSongListeningExperience();
        // v197: the carousel enhancement must not pull the viewport down to the songs
        // when entering or refreshing a genre page.
        if (!window.__dailyGenreAllowSongFocusAutoScroll) {
          window.scrollTo({ top: beforeY, left: beforeX, behavior: 'auto' });
        }
      }, isMobilePerfMode() ? 60 : 0);
      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", () =>
    setTimeout(enhanceSongListeningExperience, isMobilePerfMode() ? 80 : 0),
  );
})();

/* Daily Genre v65 cache-bust marker */

/* Daily Genre v226: identity listening lanes stay separate from queue order; matching queue rows get badges in place. */
