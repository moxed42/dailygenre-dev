/* Daily Genre Studio Workbench v1
   Add-on only: wraps renderReview() after app.js renders Review/Studio content.
   Does not touch app.js, genre loading, spin, library, stats, songs, or album carousel.
*/
(function () {
  "use strict";

  const VERSION = "studio-polish-v290-repair-bay-linear-metadata-index";
  let isApplying = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function isEditableStudioTarget(target) {
    const el = target?.closest?.(
      'input, textarea, select, option, [contenteditable="true"], .inbox-card, .studio-genre-typeahead-wrap, .studio-inline-track-edit',
    );
    return Boolean(el);
  }

  let inboxPasteGuardUntil = 0;

  function armInboxPasteGuard(duration = 900) {
    inboxPasteGuardUntil = Math.max(inboxPasteGuardUntil, Date.now() + duration);
  }

  function isInboxPasteGuardActive() {
    return Date.now() < inboxPasteGuardUntil;
  }

  function isReviewActive() {
    return document.getElementById("screen-review")?.classList.contains("active");
  }

  function isMobileStudioPerfMode() {
    try {
      if (typeof window.isDailyGenreMobilePerfMode === "function") return !!window.isDailyGenreMobilePerfMode();
      return Boolean((window.matchMedia && window.matchMedia('(max-width: 760px)').matches) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || ''));
    } catch (_) { return false; }
  }

  function deferStudioWork(fn) {
    if (typeof fn !== "function") return;
    const run = () => { try { fn(); } catch (error) { console.warn("Deferred Studio work failed", error); } };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 900 });
    else window.setTimeout(run, isMobileStudioPerfMode() ? 80 : 0);
  }

  function isStudioTextEntryActive() {
    return isReviewActive() && isEditableStudioTarget(document.activeElement);
  }

  function captureInboxDraft() {
    const input = document.getElementById("inboxSongInput");
    const select = document.getElementById("inboxGenreSelect");
    if (!input && !select) return null;
    return {
      activeId: document.activeElement?.id || "",
      value: input?.value || "",
      selectionStart:
        typeof input?.selectionStart === "number" ? input.selectionStart : null,
      selectionEnd:
        typeof input?.selectionEnd === "number" ? input.selectionEnd : null,
      genreValue: select?.value || "",
    };
  }

  function restoreInboxDraft(draft) {
    if (!draft) return;
    const input = document.getElementById("inboxSongInput");
    const select = document.getElementById("inboxGenreSelect");
    if (input && draft.value && !input.value) input.value = draft.value;
    if (select && draft.genreValue) select.value = draft.genreValue;
    if (input && draft.activeId === "inboxSongInput") {
      try {
        input.focus({ preventScroll: true });
        if (draft.selectionStart !== null && draft.selectionEnd !== null)
          input.setSelectionRange(draft.selectionStart, draft.selectionEnd);
      } catch (_) {}
    }
  }

  function esc(value) {
    if (typeof window.escapeHtml === "function")
      return window.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Daily Genre v190: Repair Bay clean helper.
     Repair Bay URL applies read manual title/artist overrides through clean(). */
  function clean(value) {
    return String(value ?? "").trim();
  }

  function studioArtworkUrl(song) {
    return String(song?.artwork || song?.albumArt || song?.image || song?.thumbnail || song?.cover || "").trim();
  }

  function updateRepairRowThumbnail(rowEl, songOrArt) {
    if (!rowEl) return false;
    const art = typeof songOrArt === "string" ? songOrArt.trim() : studioArtworkUrl(songOrArt);
    if (!art) return false;
    const thumbSlot = rowEl.querySelector(".studio-thumb, .studio-thumb-empty");
    if (!thumbSlot) return false;
    if (thumbSlot.tagName === "IMG") {
      thumbSlot.src = art;
      thumbSlot.classList.remove("studio-thumb-empty");
      return true;
    }
    const img = document.createElement("img");
    img.className = "studio-thumb studio-thumb-updated";
    img.src = art;
    img.alt = "";
    img.loading = "lazy";
    thumbSlot.replaceWith(img);
    return true;
  }

  function toast(msg, isErr) {
    if (typeof window.showSaveToast === "function")
      window.showSaveToast(msg, !!isErr);
  }

  function getGenres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function inflateSongs(raw) {
    if (typeof window.inflateSongsFromStorage === "function")
      return window.inflateSongsFromStorage(raw || []);
    return Array.isArray(raw) ? raw : [];
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function songTitle(song) {
    const artist =
      song?.artist ||
      (Array.isArray(song?.artists) ? song.artists.join(", ") : "");
    const title = song?.title || song?.name || song?.url || "Untitled track";
    return artist ? `${artist} — ${title}` : title;
  }

  function songKey(song) {
    if (typeof window.songIdentity === "function")
      return window.songIdentity(song);
    return norm(
      [
        song?.spotifyId,
        song?.isrc,
        song?.spotifyUrl || song?.url,
        song?.artist,
        song?.title,
      ].join(" "),
    );
  }


  function repairDisplayKey(song) {
    const title = norm(song?.title || song?.name || "");
    const artist = norm(
      song?.artist || (Array.isArray(song?.artists) ? song.artists.join(" ") : ""),
    );
    if (title && artist) return `artist-title:${artist}::${title}`;
    const id = norm(song?.spotifyId || "");
    if (id) return `spotify:${id}`;
    const url = norm(song?.spotifyUrl || song?.url || "");
    if (url) return `url:${url}`;
    return norm(songTitle(song));
  }

  const REPAIR_SKIP_STORAGE_KEY = "dailyGenreStudioRepairSkipOrder:v1";

  function readRepairSkipMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REPAIR_SKIP_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeRepairSkipMap(map) {
    try { localStorage.setItem(REPAIR_SKIP_STORAGE_KEY, JSON.stringify(map || {})); } catch (_) {}
  }

  const REPAIR_RESOLVED_STORAGE_KEY = "dailyGenreStudioRepairResolvedRows:v1";

  function readRepairResolvedMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REPAIR_RESOLVED_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeRepairResolvedMap(map) {
    try { localStorage.setItem(REPAIR_RESOLVED_STORAGE_KEY, JSON.stringify(map || {})); } catch (_) {}
  }

  function markRepairResolved(key) {
    if (!key) return;
    const map = readRepairResolvedMap();
    map[String(key)] = Date.now();
    writeRepairResolvedMap(map);
  }

  function clearRepairResolved(key) {
    if (!key) return;
    const map = readRepairResolvedMap();
    if (map && Object.prototype.hasOwnProperty.call(map, String(key))) {
      delete map[String(key)];
      writeRepairResolvedMap(map);
    }
  }

  function isRepairRecentlyResolved(row) {
    const key = repairSkipKey(row);
    if (!key) return false;
    const markedAt = Number(readRepairResolvedMap()[key] || 0);
    if (!markedAt) return false;
    const missing = Array.isArray(row?.repairProblems) && row.repairProblems.length ? row.repairProblems : missingKinds(row?.song || row);
    if (!missing.length) return true;
    // Keep it hidden for this browser session after a successful inline apply. If it still truly
    // needs work after a fresh page reload, it will reappear instead of sticking at the top forever.
    return Date.now() - markedAt < 6 * 60 * 60 * 1000;
  }

  function repairSkipKey(rowOrSong) {
    const song = rowOrSong?.song || rowOrSong;
    return repairDisplayKey(song) || songKey(song) || norm(songTitle(song));
  }

  function markRepairSkipped(key) {
    if (!key) return;
    const map = readRepairSkipMap();
    map[String(key)] = Date.now();
    writeRepairSkipMap(map);
  }

  function isRepairSkipped(row) {
    const key = repairSkipKey(row);
    const map = readRepairSkipMap();
    return key && Number(map[key] || 0) > 0;
  }

  function consolidateRepairRows(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      if (!row?.song || !row?.genre) return;
      const displayKey = repairDisplayKey(row.song) || songKey(row.song);
      if (!displayKey) return;
      const group = groups.get(displayKey) || {
        ...row,
        problemSet: new Set(),
        targetMap: new Map(),
        priority: row.priority || 0,
      };
      group.priority = Math.max(group.priority || 0, row.priority || 0);
      if ((row.priority || 0) >= (group.primaryPriority || -1)) {
        group.primaryPriority = row.priority || 0;
        group.genre = row.genre;
        group.song = row.song;
        group.type = row.type;
      }
      const problemLabel =
        row.type === "missingArt"
          ? "art"
          : row.type === "missingYear"
            ? "year"
            : row.type === "missingMeta"
              ? "metadata"
              : row.problem || "repair";
      group.problemSet.add(problemLabel);
      const targetKey = `${String(row.genre?.id ?? "")}::${songKey(row.song)}`;
      if (!group.targetMap.has(targetKey)) {
        group.targetMap.set(targetKey, {
          genreId: String(row.genre?.id ?? ""),
          key: songKey(row.song),
          genreName: row.genre?.genre || "Unknown genre",
          title: row.song?.title || row.song?.name || "",
          artist: row.song?.artist || (Array.isArray(row.song?.artists) ? row.song.artists.join(" ") : ""),
          url: row.song?.spotifyUrl || row.song?.url || "",
          spotifyId: row.song?.spotifyId || "",
          isrc: row.song?.isrc || "",
          displayKey: repairDisplayKey(row.song) || songKey(row.song),
        });
      }
      groups.set(displayKey, group);
    });
    return Array.from(groups.values()).map((group) => {
      const problems = Array.from(group.problemSet).sort((a, b) => {
        const order = { art: 0, year: 1, metadata: 2 };
        return (order[a] ?? 9) - (order[b] ?? 9) || String(a).localeCompare(String(b));
      });
      return {
        ...group,
        problem: problems.length ? `Missing ${problems.join(" + ")}` : group.problem,
        repairProblems: problems,
        targets: Array.from(group.targetMap.values()).filter((x) => x.genreId && x.key),
        targetCount: group.targetMap.size,
      };
    });
  }

  function topRepairRows(limit = 10) {
    return consolidateRepairRows(
      [
        ...topRows("missingArt", 80),
        ...topRows("missingYear", 80),
        ...topRows("missingMeta", 80),
      ].filter((row) => !isRepairRecentlyResolved(row))
    )
      .concat(topRows("albumRepair", 80).filter((row) => !isRepairRecentlyResolved(row)))
      .sort((a, b) => {
        const aSkipped = isRepairSkipped(a) ? 1 : 0;
        const bSkipped = isRepairSkipped(b) ? 1 : 0;
        return aSkipped - bSkipped || b.priority - a.priority;
      })
      .slice(0, limit);
  }

  function spotifyUrl(song) {
    if (typeof window.spotifyHref === "function")
      return window.spotifyHref(song);
    return song?.spotifyUrl || song?.url || "";
  }

  function allNonPendingSongs(g) {
    return inflateSongs(g?.songs_listened || []).filter((s) => !s?.isPending);
  }

  function allPendingSongs(g) {
    const pending = [];
    inflateSongs(g?.pending_songs || []).forEach((song) => pending.push(song));
    inflateSongs(g?.songs_listened || [])
      .filter((song) => song?.isPending)
      .forEach((song) => pending.push(song));
    return pending;
  }

  function hasTrackMetadata(song) {
    return !!(
      song?.spotifyId ||
      song?.spotifyUrl ||
      song?.externalMetadataFetched ||
      song?.source === "youtube" ||
      song?.source === "apple" ||
      song?.releaseYear ||
      song?.releaseDate ||
      song?.durationMs ||
      song?.isrc
    );
  }

  function missingKinds(song) {
    const missing = [];
    const url = spotifyUrl(song);
    const isSpotify = /open\.spotify\.com\/track\//i.test(url || "") || /spotify:track:/i.test(url || "");
    if (!song?.artwork && !song?.albumArt) missing.push("art");
    if (isSpotify && !song?.spotifyId) missing.push("id");
    if (url && !song?.releaseYear && !song?.releaseDate && !song?.eraYear && song?.source !== "youtube")
      missing.push("year");
    if (url && !hasTrackMetadata(song)) missing.push("metadata");
    return missing;
  }

  // Daily Genre v290: Repair Bay may encounter the same recording in several
  // genres. Build one linear metadata index per Studio stats pass so a sparse
  // copy is not falsely reported when another copy already has authoritative
  // artwork/year/Spotify metadata. This intentionally avoids per-song library scans.
  function repairMetadataKeys(song) {
    const keys = [];
    const spotifyId = String(song?.spotifyId || "").trim().toLowerCase();
    const isrc = String(song?.isrc || "").trim().toLowerCase();
    const url = String(spotifyUrl(song) || "").trim().toLowerCase().replace(/[?#].*$/, "");
    const title = norm(song?.title || song?.name || "");
    const artist = norm(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(" ") : ""));
    if (spotifyId) keys.push(`spotify:${spotifyId}`);
    if (isrc) keys.push(`isrc:${isrc}`);
    if (url) keys.push(`url:${url}`);
    if (title && artist) keys.push(`artist-title:${artist}::${title}`);
    return keys;
  }

  function repairMetadataScore(song) {
    let score = 0;
    if (studioArtworkUrl(song)) score += 8;
    if (song?.spotifyId) score += 5;
    if (song?.isrc) score += 4;
    if (song?.releaseYear || song?.releaseDate || song?.eraYear) score += 3;
    if (song?.durationMs) score += 2;
    if (song?.spotifyMetadataFetched || song?.externalMetadataFetched) score += 2;
    if (song?.title || song?.name) score += 1;
    if (song?.artist || (Array.isArray(song?.artists) && song.artists.length)) score += 1;
    return score;
  }

  function buildRepairMetadataIndex() {
    const index = new Map();
    getGenres().forEach((genre) => {
      allNonPendingSongs(genre).forEach((song) => {
        const score = repairMetadataScore(song);
        repairMetadataKeys(song).forEach((key) => {
          const current = index.get(key);
          if (!current || score > current.score) index.set(key, { song, score });
        });
      });
    });
    return index;
  }

  function repairMetadataView(song, index) {
    if (!song || !index) return song;
    let donor = null;
    for (const key of repairMetadataKeys(song)) {
      const candidate = index.get(key);
      if (candidate && (!donor || candidate.score > donor.score)) donor = candidate;
    }
    if (!donor?.song || donor.song === song) return song;
    const source = donor.song;
    return {
      ...source,
      ...song,
      artwork: song.artwork || song.albumArt || source.artwork || source.albumArt || "",
      albumArt: song.albumArt || song.artwork || source.albumArt || source.artwork || "",
      spotifyId: song.spotifyId || source.spotifyId || "",
      isrc: song.isrc || source.isrc || "",
      releaseYear: song.releaseYear || source.releaseYear || "",
      releaseDate: song.releaseDate || source.releaseDate || "",
      eraYear: song.eraYear || source.eraYear || "",
      durationMs: song.durationMs || source.durationMs || 0,
      spotifyMetadataFetched: song.spotifyMetadataFetched || source.spotifyMetadataFetched || false,
      externalMetadataFetched: song.externalMetadataFetched || source.externalMetadataFetched || false,
    };
  }



  /* Daily Genre v211: same-genre duplicate merge collapses visible QA rows. */
  function isListenedGenreForStudio(genre) {
    /* v210: Genre DNA only applies after a genre has actually been listened to.
       Do not count genres merely because songs have been nominated/routed to them. */
    const status = String(genre?.status || "").trim().toLowerCase();
    const rating = String(genre?.rating || "").trim().toLowerCase();
    let canonicalDate = "";
    try {
      if (typeof dateValue === "function") canonicalDate = String(dateValue(genre) || "").trim();
    } catch (_) {
      canonicalDate = "";
    }
    return !!(
      canonicalDate ||
      genre?.date ||
      genre?.date_normalized ||
      genre?.datenormalized ||
      genre?.date_raw ||
      genre?.dateraw ||
      genre?.listenedAt ||
      genre?.listened_at ||
      genre?.listenedDate ||
      status === "listened" ||
      status === "in_progress" ||
      status === "in-progress" ||
      status === "veto" ||
      status === "zanger" ||
      rating === "zanger" ||
      genre?.monthlycontender ||
      genre?.monthfavorite ||
      genre?.monthleastfavorite
    );
  }

  function studioAliasListForGenre(genre) {
    const aliasList = [];
    [
      genre?.aliases,
      genre?.synonyms,
      genre?.aka,
      genre?.alternateNames,
      genre?.alternate_names,
    ].forEach((field) => {
      if (Array.isArray(field)) aliasList.push(...field);
      else if (typeof field === "string") aliasList.push(...field.split(/[,;|\n]/g));
    });
    return aliasList.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function studioSeminalForGenre(genre) {
    return genre?.seminal_song || genre?.identity?.seminalTrack || genre?.identity?.seminal_track || {};
  }

  function studioMediaRowsForGenre(genre) {
    if (Array.isArray(genre?.media_touchstones)) return genre.media_touchstones;
    if (Array.isArray(genre?.identity?.mediaTouchstones)) return genre.identity.mediaTouchstones;
    if (Array.isArray(genre?.identity?.media_touchstones)) return genre.identity.media_touchstones;
    const single = genre?.media_touchstone || genre?.identity?.mediaTouchstone || genre?.identity?.media_touchstone;
    return single && typeof single === "object" ? [single] : [];
  }

  function studioGenreDescriptionText(genre) {
    return String(genre?.summary || genre?.description || genre?.genre_description || genre?.identity?.description || genre?.identity?.summary || "").trim();
  }

  function identityIssuesForGenre(genre) {
    /* Daily Genre v202: Identity is a lightweight watchlist.
       Only count listened genres that have no usable Genre DNA block at all.
       Do not add one issue per missing subfield; one missing genre = one count. */
    const aliases = studioAliasListForGenre(genre);
    const sem = studioSeminalForGenre(genre);
    const mediaRows = studioMediaRowsForGenre(genre);
    const hasSem = !!(sem?.title || sem?.artist || sem?.spotifyUrl || sem?.url || sem?.spotify_url);
    const hasMedia = mediaRows.some((m) => !!(m?.title || m?.mediaTitle || m?.media_title || m?.artist || m?.spotifyUrl || m?.url || m?.spotify_url));
    const hasDescription = !!studioGenreDescriptionText(genre);
    const hasAnyIdentity = hasDescription || aliases.length > 0 || hasSem || hasMedia;
    return hasAnyIdentity ? [] : ["identity block"];
  }

  function identityQueueRows(limit = 60) {
    return getGenres()
      .filter(isListenedGenreForStudio)
      .map((genre) => ({ genre, issues: identityIssuesForGenre(genre) }))
      .filter((row) => row.issues.length)
      .sort((a, b) => b.issues.length - a.issues.length || String(a.genre?.genre || "").localeCompare(String(b.genre?.genre || "")))
      .slice(0, limit);
  }

  function albumDiveSlotsForGenre(genre) {
    const dive = genre?.albumDive || genre?.album_dive || genre?.album_dive_data || null;
    const slots = Array.isArray(dive?.slots) ? dive.slots : Array.isArray(genre?.albumDiveSlots) ? genre.albumDiveSlots : [];
    return slots.filter((slot) => slot && (slot.album || slot.albumTitle || slot.artist || slot.albumProviderUrl || slot.spotifyAlbumUrl || slot.spotifyUrl || slot.itunesAlbumUrl || slot.appleAlbumUrl || slot.albumArt || slot.manualAlbumArt));
  }

  function albumDiveRepairKinds(slot) {
    const problems = [];
    const url = String(slot?.albumProviderUrl || slot?.spotifyAlbumUrl || slot?.spotifyUrl || slot?.itunesAlbumUrl || slot?.appleAlbumUrl || slot?.url || "");
    const hasArt = !!(slot?.albumArt || slot?.manualAlbumArt || slot?.cover || slot?.image || slot?.artwork || slot?.favoriteSong?.albumArt);
    const hasYear = !!(slot?.year || slot?.releaseYear || slot?.releaseDate || slot?.albumYear);
    const hasMeta = !!(slot?.album && slot?.artist) || !!(slot?.albumTitle && slot?.albumArtist);
    if (!hasArt) problems.push("album art");
    if (url && !hasYear) problems.push("album year");
    if (url && !hasMeta) problems.push("album metadata");
    return problems;
  }

  function findSongByGenreAndKey(genreId, key) {
    const genre = getGenres().find((g) => String(g?.id ?? "") === String(genreId ?? ""));
    if (!genre) return null;
    const songs = allNonPendingSongs(genre);
    return songs.find((song) => String(songKey(song)) === String(key || "")) || null;
  }

  function repairLabel(kind) {
    const clean = String(kind || "").replace(/^missing\s+/i, "").trim();
    return clean ? `missing ${clean}` : "missing metadata";
  }

  function updateRepairMetaChips(metaEl, missing) {
    if (!metaEl) return;
    metaEl.querySelectorAll(".studio-repair-missing-chip").forEach((chip) => chip.remove());
    const anchor = metaEl.querySelector(".studio-inline-group-updated-chip, .studio-inline-updated-chip");
    const html = (missing || []).map((kind) => `<span class="studio-repair-missing-chip" data-repair-kind="${esc(kind)}">${esc(repairLabel(kind))}</span>`).join("");
    if (html) {
      if (anchor) anchor.insertAdjacentHTML("afterend", html);
      else metaEl.insertAdjacentHTML("afterbegin", html);
    }
  }

  function stats() {
    const genres = getGenres();
    const repairMetadataIndex = buildRepairMetadataIndex();
    const rows = [];
    let pending = 0;
    let missingArt = 0;
    let missingYear = 0;
    let missingMeta = 0;
    let unrated = 0;
    let duplicate = 0;
    let drafts = 0;
    const seen = new Map();

    genres.forEach((genre) => {
      allPendingSongs(genre).forEach((song) => {
        pending += 1;
        rows.push({
          type: "pending",
          genre,
          song,
          priority: scorePending(song),
          problem: "Pending routing",
        });
      });

      const songs = allNonPendingSongs(genre);
      if (
        String(genre.status || "").toLowerCase() === "unlistened" &&
        songs.length
      )
        drafts += 1;

      songs.forEach((song, songIndex) => {
        const missing = missingKinds(repairMetadataView(song, repairMetadataIndex));
        if (missing.includes("art")) missingArt += 1;
        if (missing.includes("year")) missingYear += 1;
        if (missing.includes("metadata")) missingMeta += 1;
        if (!song?.reaction) unrated += 1;

        missing.forEach((kind) => {
          rows.push({
            type:
              kind === "art"
                ? "missingArt"
                : kind === "year"
                  ? "missingYear"
                  : "missingMeta",
            genre,
            song,
            priority: scoreRepair(song, kind),
            problem: `Missing ${kind}`,
          });
        });

        const key = songKey(song);
        if (key) {
          const arr = seen.get(key) || [];
          arr.push({ genre, song, songIndex });
          seen.set(key, arr);
        }
      });

      albumDiveSlotsForGenre(genre).forEach((slot) => {
        const albumProblems = albumDiveRepairKinds(slot);
        if (!albumProblems.length) return;
        const albumSongLike = {
          title: slot.album || slot.albumTitle || slot.label || "Untitled album",
          artist: slot.artist || slot.albumArtist || "Unknown artist",
          artwork: slot.albumArt || slot.manualAlbumArt || slot.cover || slot.image || slot.artwork || "",
          albumArt: slot.albumArt || slot.manualAlbumArt || slot.cover || slot.image || slot.artwork || "",
          spotifyUrl: slot.albumProviderUrl || slot.spotifyAlbumUrl || slot.spotifyUrl || slot.itunesAlbumUrl || slot.appleAlbumUrl || slot.url || "",
          url: slot.albumProviderUrl || slot.spotifyAlbumUrl || slot.spotifyUrl || slot.itunesAlbumUrl || slot.appleAlbumUrl || slot.url || "",
          source: "album-dive",
          albumDiveSlotKey: slot.key || slot.id || slot.label || slot.album || "",
        };
        albumProblems.forEach((kind) => {
          if (kind === "album art") missingArt += 1;
          else if (kind === "album year") missingYear += 1;
          else missingMeta += 1;
        });
        rows.push({
          type: "albumRepair",
          genre,
          song: albumSongLike,
          priority: 62 + Math.min(20, albumProblems.length * 5),
          problem: "Album Dive repair",
          repairProblems: albumProblems,
          isAlbumRepair: true,
        });
      });
    });

    seen.forEach((arr) => {
      const uniqueGenres = new Set(
        arr.map((x) => String(x.genre?.id ?? x.genre?.genre ?? "")),
      );
      if (arr.length > 1 && uniqueGenres.size >= 1) {
        duplicate += arr.length;
        arr.forEach(({ genre, song, songIndex }) =>
          rows.push({
            type: "duplicate",
            genre,
            song,
            songIndex,
            priority: 70,
            problem: "Possible duplicate",
          }),
        );
      }
    });

    const libraryDirty = !!(
      window.libraryUpdatesPending || window.hasUnsavedChanges
    );
    return {
      pending,
      missingArt,
      missingYear,
      missingMeta,
      unrated,
      duplicate,
      drafts,
      libraryDirty,
      rows,
    };
  }

  function genreIdentityStats() {
    const rows = identityQueueRows(100000);
    const listenedGenres = getGenres().filter(isListenedGenreForStudio);
    let aliases = 0;
    let seminal = 0;
    let media = 0;
    let description = 0;
    let complete = 0;
    listenedGenres.forEach((genre) => {
      const aliasList = studioAliasListForGenre(genre);
      const sem = studioSeminalForGenre(genre);
      const mediaRows = studioMediaRowsForGenre(genre);
      const hasSem = !!(sem?.title || sem?.artist || sem?.spotifyUrl || sem?.url || sem?.spotify_url);
      const hasMedia = mediaRows.some((m) => !!(m?.title || m?.mediaTitle || m?.media_title || m?.artist || m?.spotifyUrl || m?.url || m?.spotify_url));
      const hasDescription = !!studioGenreDescriptionText(genre);
      if (aliasList.length) aliases += 1;
      if (hasSem) seminal += 1;
      if (hasMedia) media += 1;
      if (hasDescription) description += 1;
      if (!identityIssuesForGenre(genre).length) complete += 1;
    });
    return {
      total: listenedGenres.length,
      aliases,
      seminal,
      media,
      description,
      complete,
      missing: rows.length,
      rows,
    };
  }

  function scorePending(song) {
    const fit =
      Number(song?.score ?? song?.originFit ?? song?.nominatedFit ?? 0) || 0;
    if (song?.isLevelUp || /^🔼\s*LEVEL UP/i.test(String(song?.url || "")))
      return 95;
    if (song?.isAdd || /^🔼\s*ADD/i.test(String(song?.url || ""))) return 85;
    if (fit && fit <= 2) return 80;
    if (fit === 3) return 65;
    return 50;
  }

  function scoreRepair(song, kind) {
    const fit = Number(song?.score ?? 0) || 0;
    const reactionBoost =
      song?.reaction === 3 ? 20 : song?.reaction === 1 ? 8 : 0;
    const fitBoost = fit >= 4 ? 16 : fit === 3 ? 8 : 0;
    const kindBoost = kind === "art" ? 10 : kind === "year" ? 8 : 4;
    return 30 + reactionBoost + fitBoost + kindBoost;
  }

  function topRows(type, limit = 8) {
    return stats()
      .rows.filter((r) => r.type === type)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          String(songTitle(a.song)).localeCompare(songTitle(b.song)),
      )
      .slice(0, limit);
  }



  /* Daily Genre v198: duplicate/routing cleanup tools. */
  const DUPLICATE_RESOLVED_STORAGE_KEY = "dailyGenreStudioDuplicateResolved:v198";

  function readDuplicateResolvedMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DUPLICATE_RESOLVED_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeDuplicateResolvedMap(map) {
    try { localStorage.setItem(DUPLICATE_RESOLVED_STORAGE_KEY, JSON.stringify(map || {})); } catch (_) {}
  }

  function duplicateClusterKeyForSong(song) {
    return repairDisplayKey(song) || songKey(song) || norm(songTitle(song));
  }

  function markDuplicateClusterResolved(clusterKey) {
    if (!clusterKey) return;
    const map = readDuplicateResolvedMap();
    map[String(clusterKey)] = Date.now();
    writeDuplicateResolvedMap(map);
  }

  function duplicateClusterIsResolved(clusterKey) {
    return !!(clusterKey && readDuplicateResolvedMap()[String(clusterKey)]);
  }

  function duplicateGroups(limit = 12) {
    const groups = new Map();
    stats().rows.filter((r) => r.type === "duplicate").forEach((row) => {
      /* v210: hide only the individual appearance that was staged for Routing Desk,
         instead of deleting every matching song from the duplicate cluster. */
      if (row?.song?.qaPendingRouteStaged || row?.song?.duplicateQaPendingRouteStaged) return;
      const key = duplicateClusterKeyForSong(row.song);
      if (row?.song?.duplicateQaResolved && (!row.song.duplicateQaResolvedKey || String(row.song.duplicateQaResolvedKey) === String(key || ""))) return;
      if (!key || duplicateClusterIsResolved(key)) return;
      const group = groups.get(key) || { key, entries: [], priority: 0 };
      group.priority = Math.max(group.priority || 0, row.priority || 0);
      group.entries.push(row);
      groups.set(key, group);
    });
    return Array.from(groups.values())
      .filter((group) => group.entries.length > 1)
      .sort((a, b) => (b.entries.length - a.entries.length) || (b.priority || 0) - (a.priority || 0) || String(songTitle(a.entries[0]?.song)).localeCompare(songTitle(b.entries[0]?.song)))
      .slice(0, limit);
  }

  function encodeStudioInline(value) {
    /* Daily Genre v213: encode inline onclick payloads so apostrophes / parentheses
       in song titles (for example Oingo Boingo-style names) cannot break the
       generated JavaScript before Send to Pending runs. */
    return encodeURIComponent(String(value ?? "")).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  function encodeStudioPayload(value) {
    return encodeStudioInline(JSON.stringify(value || {}));
  }

  function decodeStudioPayload(encoded) {
    try { return JSON.parse(decodeURIComponent(String(encoded || ""))); } catch (_) { return {}; }
  }

  function encodeStudioScalar(value) {
    return encodeStudioInline(value);
  }

  function decodeStudioScalar(value) {
    return decodeMaybe(value);
  }

  function clonePlain(value) {
    try { return JSON.parse(JSON.stringify(value || null)); } catch (_) { return value ? { ...value } : value; }
  }

  function normalizeSongKeyForCompare(song) {
    return String(songKey(song) || duplicateClusterKeyForSong(song) || "");
  }

  function songsMatchForRouting(song, targetKey, displayKey) {
    const keys = [normalizeSongKeyForCompare(song), duplicateClusterKeyForSong(song), repairDisplayKey(song)].filter(Boolean).map(String);
    return keys.includes(String(targetKey || "")) || keys.includes(String(displayKey || ""));
  }

  function findGenreByIdOrName(value) {
    const wanted = String(value || "").trim();
    if (!wanted) return null;
    const wantedNorm = norm(wanted);
    return getGenres().find((genre) => String(genre?.id ?? "") === wanted || norm(genre?.genre || genre?.name || "") === wantedNorm) || null;
  }

  function findSongIndexForDuplicate(genre, targetKey, displayKey, preferredIndex = null) {
    const songs = inflateSongs(genre?.songs_listened || []);
    const nonPending = songs
      .map((song, index) => ({ song, index }))
      .filter((entry) => !entry.song?.isPending);
    const wantedIndex = Number(preferredIndex);

    /* v206: QA rows are built from the non-pending song list. Preserve that
       indexing when applying the action back to the full stored song list so
       sending one appearance to Pending cannot remove the wrong same-title row. */
    if (Number.isInteger(wantedIndex) && wantedIndex >= 0 && wantedIndex < nonPending.length) {
      const candidate = nonPending[wantedIndex];
      if (songsMatchForRouting(candidate.song, targetKey, displayKey)) {
        return { songs, index: candidate.index, song: candidate.song };
      }
    }

    const found = nonPending.find((entry) => songsMatchForRouting(entry.song, targetKey, displayKey));
    return { songs, index: found ? found.index : -1, song: found ? found.song : null };
  }

  function storageReadySongs(arr) {
    // The main save pipeline knows how to persist nested Level Up rows. Store the edited model plainly here.
    return (arr || []).map((song) => song && typeof song === "object" ? song : null).filter(Boolean);
  }

  function markStudioLibraryDirty(message = "Cleanup staged — save pending.") {
    /* Daily Genre v216: Studio cleanup changes must persist as Studio mutations,
       not be overwritten by a stale genre-page bulk textarea during save. */
    let bridged = false;
    window.__dgStudioCleanupSavePending = true;
    try {
      if (typeof window.markLibraryUpdatesPending === "function") {
        window.markLibraryUpdatesPending(message, { studioMutation: true });
        bridged = true;
      } else if (typeof window.markListeningUpdatePending === "function") {
        window.markListeningUpdatePending();
        bridged = true;
      }
    } catch (_) { bridged = false; }
    window.libraryUpdatesPending = true;
    window.hasUnsavedChanges = true;
    if (typeof window.updateSaveState === "function") window.updateSaveState();
    if (!bridged) toast(message, false);
  }

  function sameGenreDuplicateCountForGroup(group) {
    const counts = new Map();
    (group?.entries || []).forEach((row) => {
      const key = String(row.genre?.id ?? norm(row.genre?.genre || row.genre?.name || ""));
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    let duplicates = 0;
    counts.forEach((count) => { if (count > 1) duplicates += count - 1; });
    return duplicates;
  }


  /* Daily Genre v297: conservative bulk resolve for obvious valid crossovers. */
  function duplicateGenreKey(row) {
    const genre = row?.genre || {};
    const id = String(genre?.id ?? "").trim();
    if (id) return `id:${id}`;
    const name = norm(genre?.genre || genre?.name || "");
    return name ? `name:${name}` : "";
  }

  function isSafeHighFitCrossGenreGroup(group) {
    const entries = Array.isArray(group?.entries) ? group.entries : [];
    if (entries.length < 2) return false;
    const genres = new Set();
    for (const row of entries) {
      const fit = Number(row?.song?.score ?? row?.song?.originFit ?? row?.song?.nominatedFit ?? 0);
      const genreKey = duplicateGenreKey(row);
      if (!genreKey || (fit !== 4 && fit !== 5) || genres.has(genreKey)) return false;
      genres.add(genreKey);
    }
    return genres.size === entries.length;
  }

  function safeHighFitCrossGenreGroups(limit = 100000) {
    return duplicateGroups(limit).filter(isSafeHighFitCrossGenreGroup);
  }

  window.bulkResolveSafeHighFitQa = function bulkResolveSafeHighFitQa(button) {
    const groups = safeHighFitCrossGenreGroups(100000);
    if (!groups.length) return toast("No unresolved 4–5 fit cross-genre clusters qualify right now.", true);

    const appearances = groups.reduce((total, group) => total + group.entries.length, 0);
    const ok = window.confirm(
      `Mark ${groups.length} QA cluster${groups.length === 1 ? "" : "s"} valid/resolved?\n\n` +
      `${appearances} appearances qualify because every fit is 4 or 5 and no genre repeats inside a cluster.\n\n` +
      `Mixed-fit clusters and same-genre duplicates will remain untouched.`
    );
    if (!ok) return;

    const keys = new Set(groups.map((group) => String(group.key || "")).filter(Boolean));
    keys.forEach(markDuplicateClusterResolved);

    let stamped = 0;
    getGenres().forEach((genre) => {
      const songs = inflateSongs(genre?.songs_listened || []);
      let changed = false;
      songs.forEach((song) => {
        const key = String(duplicateClusterKeyForSong(song) || "");
        if (!keys.has(key)) return;
        song.duplicateQaResolved = true;
        song.duplicateQaResolvedKey = key;
        song.duplicateQaResolvedAt = new Date().toISOString();
        stamped += 1;
        changed = true;
      });
      if (changed) genre.songs_listened = storageReadySongs(songs);
    });

    markStudioLibraryDirty(
      `Marked ${groups.length} safe 4–5 cross-genre QA cluster${groups.length === 1 ? "" : "s"} resolved — save cleanup to persist.`
    );
    if (button) button.disabled = true;
    if (typeof window.refreshStudioQaLab === "function") window.refreshStudioQaLab();
    toast(`Resolved ${groups.length} safe QA cluster${groups.length === 1 ? "" : "s"} (${stamped} appearances). Save cleanup to persist.`);
  };

  function updateDuplicateGroupDomAfterPendingRoute(button) {
    const instance = button?.closest?.(".studio-duplicate-instance");
    const group = button?.closest?.(".studio-duplicate-group");
    if (!instance || !group) return false;
    instance.remove();
    const remaining = group.querySelectorAll(".studio-duplicate-instance").length;
    if (remaining <= 1) {
      group.remove();
      return true;
    }
    const countNode = group.querySelector("[data-studio-duplicate-count]");
    if (countNode) countNode.textContent = String(remaining);
    const copyNode = group.querySelector("[data-studio-duplicate-copy]");
    if (copyNode) {
      copyNode.innerHTML = `${remaining} appearances. Keep valid cross-genre uses, send low-fit source rows to Pending, or mark the remaining appearances valid.`;
    }
    group.dataset.studioDuplicateRemaining = String(remaining);
    return true;
  }

  function updateDuplicateGroupDomAfterSameGenreMerge(button, clusterKey) {
    /* v211: after a same-genre merge, rebuild just this duplicate card from the
       canonical song arrays. The old v210 behavior changed the button label but
       left stale duplicate rows visible, making it unsafe to know whether Mark
       valid / resolved would hide real leftovers. */
    const groupEl = button?.closest?.(".studio-duplicate-group");
    if (!groupEl) return false;
    const freshGroup = duplicateGroups(200).find((group) => String(group.key || "") === String(clusterKey || ""));
    if (!freshGroup || freshGroup.entries.length <= 1) {
      groupEl.remove();
      return true;
    }
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderDuplicateGroup(freshGroup, 0).trim();
    const freshEl = wrapper.firstElementChild;
    if (freshEl) {
      groupEl.replaceWith(freshEl);
      return true;
    }
    return false;
  }

  function renderDuplicateGroup(group, idx) {
    const first = group.entries[0] || {};
    const title = songTitle(first.song);
    const clusterPayload = encodeStudioScalar(group.key);
    const sameGenreDuplicateCount = sameGenreDuplicateCountForGroup(group);
    const rows = group.entries.map((row) => {
      const fit = row.song?.score || row.song?.originFit || row.song?.nominatedFit || "";
      const payload = encodeStudioPayload({
        clusterKey: group.key,
        genreId: String(row.genre?.id ?? ""),
        genreName: row.genre?.genre || "Unknown genre",
        songKey: songKey(row.song),
        displayKey: duplicateClusterKeyForSong(row.song),
        title: row.song?.title || row.song?.name || "",
        artist: row.song?.artist || (Array.isArray(row.song?.artists) ? row.song.artists.join(", ") : ""),
        fit,
        hasLevelUp: !!row.song?.levelUp,
        songIndex: Number.isFinite(Number(row.songIndex)) ? Number(row.songIndex) : null,
      });
      const levelUp = row.song?.levelUp ? `<span class="studio-duplicate-levelup-chip">Level Up → ${esc(songTitle(row.song.levelUp))}</span>` : "";
      return `<div class="studio-duplicate-instance" data-studio-duplicate-instance="1" data-studio-duplicate-genre-id="${esc(String(row.genre?.id ?? ""))}" data-studio-duplicate-song-index="${esc(String(row.songIndex ?? ""))}">
        <div>
          <strong>${esc(row.genre?.genre || "Unknown genre")}</strong>
          <span>${fit ? `fit ${esc(fit)}/5` : "no fit"}</span>
          ${row.song?.reaction ? `<span>reacted</span>` : ""}
          ${levelUp}
        </div>
        <div class="studio-duplicate-actions">
          <button type="button" class="btn btn-secondary btn-tiny" onclick="event.stopPropagation(); openGenreByIdEncoded('${encodeURIComponent(String(row.genre?.id ?? ""))}', true)">Open genre</button>
          <button type="button" class="btn btn-primary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof routeDuplicateSourceKeepLevelUp === 'function' ? routeDuplicateSourceKeepLevelUp('${payload}', this) : null; return false;">Send to Pending…</button>
        </div>
      </div>`;
    }).join("");
    const copyLine = [`Duplicate QA | ${title}`, ...group.entries.map((r) => {
      const bits = [r.genre?.genre || "Unknown genre", r.song?.score ? `fit ${r.song.score}/5` : "", r.song?.levelUp ? `Level Up → ${songTitle(r.song.levelUp)}` : ""].filter(Boolean);
      return bits.join(" · ");
    })].join(" | ");
    return `<article class="studio-duplicate-group" data-studio-row data-studio-copy-line="${esc(copyLine)}" data-studio-duplicate-group="1" data-studio-duplicate-key="${esc(String(group.key || ""))}" data-studio-duplicate-remaining="${esc(String(group.entries.length))}" data-studio-text="${esc(norm([title, ...group.entries.map((r) => r.genre?.genre || "")].join(" ")))}" data-studio-type="review" data-studio-priority="high">
      <div class="studio-duplicate-head">
        ${renderSongThumb(first.song)}
        <div>
          <h4>${esc(title)}</h4>
          <p data-studio-duplicate-copy><span data-studio-duplicate-count>${esc(String(group.entries.length))}</span> appearances. Keep valid cross-genre uses, send low-fit source rows to Pending, or mark the remaining appearances valid.</p>
        </div>
        <div class="studio-duplicate-head-actions">
          ${sameGenreDuplicateCount ? `<button type="button" class="btn btn-primary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof mergeSameGenreDuplicateCluster === 'function' ? mergeSameGenreDuplicateCluster('${clusterPayload}', this) : null; return false;">Merge same-genre duplicates</button>` : `<button type="button" class="btn btn-primary btn-tiny studio-duplicate-no-same" disabled aria-disabled="true" title="No same-genre duplicate rows in this cluster">Merge same-genre duplicates</button>`}
          <button type="button" class="btn btn-secondary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof markDuplicateGroupValid === 'function' ? markDuplicateGroupValid('${clusterPayload}', this) : null; return false;">Mark valid / resolved</button>
        </div>
      </div>
      <div class="studio-duplicate-instances">${rows}</div>
    </article>`;
  }

  function renderDuplicateGroups(groups) {
    if (!groups.length) return '<div class="studio-empty">No unresolved duplicate-looking clusters found in this pass.</div>';
    return `<div class="studio-duplicate-list">${groups.map(renderDuplicateGroup).join("")}</div>`;
  }

  window.markDuplicateGroupValid = function(encodedClusterKey, button) {
    const key = decodeStudioScalar(encodedClusterKey);
    markDuplicateClusterResolved(key);
    let stamped = 0;
    getGenres().forEach((genre) => {
      const songs = inflateSongs(genre?.songs_listened || []);
      let changed = false;
      songs.forEach((song) => {
        if (String(duplicateClusterKeyForSong(song) || "") === String(key || "")) {
          song.duplicateQaResolved = true;
          song.duplicateQaResolvedKey = key;
          song.duplicateQaResolvedAt = new Date().toISOString();
          stamped += 1;
          changed = true;
        }
      });
      if (changed) genre.songs_listened = storageReadySongs(songs);
    });
    button?.closest?.(".studio-duplicate-group")?.remove?.();
    markStudioLibraryDirty(stamped ? "Duplicate marked resolved and will persist after Save." : "Duplicate marked resolved locally — save if you changed song data.");
  };



  function mergeSongObjectsForStudioDuplicate(keeper, duplicate) {
    if (!keeper || !duplicate) return keeper;
    ["reaction", "favorite", "isFavorite", "trophy", "notes", "reason", "artwork", "albumArt", "spotifyUrl", "url", "spotifyId", "isrc", "releaseYear", "releaseDate", "durationMs", "album", "source"].forEach((field) => {
      if ((keeper[field] === undefined || keeper[field] === null || keeper[field] === "") && duplicate[field] !== undefined && duplicate[field] !== null && duplicate[field] !== "") {
        keeper[field] = duplicate[field];
      }
    });
    if (!keeper.levelUp && duplicate.levelUp) keeper.levelUp = duplicate.levelUp;
    if (!keeper.altTake && duplicate.altTake) keeper.altTake = duplicate.altTake;
    const keepScore = Number(keeper.score || 0);
    const dupScore = Number(duplicate.score || 0);
    if (!keepScore && dupScore) keeper.score = duplicate.score;
    return keeper;
  }

  function mergeSameGenreDuplicatesForCluster(clusterKey) {
    if (!clusterKey) return 0;
    let removed = 0;
    getGenres().forEach((genre) => {
      const list = Array.isArray(genre?.songs_listened) ? genre.songs_listened : [];
      const matches = [];
      list.forEach((song, idx) => {
        const key = duplicateClusterKeyForSong(song);
        if (String(key || "") === String(clusterKey || "")) matches.push({ song, idx });
      });
      if (matches.length < 2) return;
      const keeper = matches.find((x) => Number(x.song?.score || 0) >= 4) || matches[0];
      matches.forEach((entry) => {
        if (entry.idx === keeper.idx) return;
        mergeSongObjectsForStudioDuplicate(keeper.song, entry.song);
      });
      for (let i = matches.length - 1; i >= 0; i--) {
        const entry = matches[i];
        if (entry.idx !== keeper.idx) {
          list.splice(entry.idx, 1);
          removed += 1;
        }
      }
    });
    if (removed) {
      /* v204: do not mark the entire duplicate cluster resolved here. A song may
         still have cross-genre appearances that need routing/validation after
         same-genre duplicate rows are merged. Re-render so the remaining issues
         stay visible until explicitly resolved. */
      markStudioLibraryDirty(`Merged ${removed} same-genre duplicate row${removed === 1 ? "" : "s"} — save cleanup to persist.`);
      /* v210: do not rebuild/resolve the whole duplicate card after a same-genre
         merge. The remaining cross-genre appearances stay available until Mark
         valid / resolved is clicked. */
    }
    return removed;
  }

  window.mergeSameGenreDuplicateCluster = function(encodedClusterKey, button) {
    const key = decodeStudioScalar(encodedClusterKey);
    const removed = mergeSameGenreDuplicatesForCluster(key);
    if (!removed) return toast("No same-genre duplicate rows were found to merge.", true);
    updateDuplicateGroupDomAfterSameGenreMerge(button, key);
    toast(`Merged ${removed} same-genre duplicate row${removed === 1 ? "" : "s"}. Save cleanup to persist.`);
  };

  function makeDetachedLevelUpSongForDuplicateRouting(levelUp, source, origin) {
    const detached = clonePlain(levelUp) || {};
    detached.isDetachedLevelUp = true;
    detached.isPending = false;
    detached.isAdd = false;
    delete detached.isLevelUp;
    delete detached.levelUp;
    detached.levelUpFromTitle = source?.title || source?.name || songTitle(source);
    detached.levelUpFromArtist = source?.artist || (Array.isArray(source?.artists) ? source.artists.join(", ") : "");
    detached.levelUpFromUrl = source?.url || source?.spotifyUrl || "";
    detached.levelUpFromGenre = origin?.genre || origin?.name || "";
    detached.levelUpFromGenreId = String(origin?.id ?? "");
    detached.levelUpFromKey = normalizeSongKeyForCompare(source) || duplicateClusterKeyForSong(source) || "";
    detached.cleanupSource = "duplicate-qa-detached-levelup";
    detached.routedFromSourceTitle = detached.levelUpFromTitle;
    detached.routedFromSourceArtist = detached.levelUpFromArtist;
    detached.reviewedAt = new Date().toISOString();
    return detached;
  }

  function makePendingSongFromDuplicateSource(source, origin) {
    const moved = clonePlain(source) || {};
    delete moved.levelUp;
    moved.isLevelUp = false;
    moved.isAdd = false;
    moved.isDetachedLevelUp = false;
    moved.isPending = true;
    moved.pendingFrom = origin?.genre || origin?.name || "";
    moved.pendingFromGenreId = String(origin?.id ?? "");
    moved.originFit = source?.score != null ? Number(source.score) : (source?.originFit ?? source?.nominatedFit ?? null);
    moved.nominatedFit = null;
    moved.cleanupSource = "duplicate-qa";
    if (source?.levelUp) {
      const child = clonePlain(source.levelUp) || {};
      moved.pendingLevelUpTitle = child.title || child.name || "";
      moved.pendingLevelUpArtist = child.artist || (Array.isArray(child.artists) ? child.artists.join(", ") : "");
      moved.pendingLevelUpUrl = child.url || child.spotifyUrl || "";
      moved.pendingLevelUpReason = child.reason || "";
    }
    moved.routedFromGenre = origin?.genre || origin?.name || "";
    moved.routedFromGenreId = String(origin?.id ?? "");
    moved.reviewedAt = new Date().toISOString();
    return moved;
  }

  window.routeDuplicateSourceKeepLevelUp = function(encodedPayload, button) {
    /* Daily Genre v212-v214: allow rows with no genre id to route by genreName, keep header disabled controls from blocking row actions, and persist through the real save pipeline. */
    const payload = decodeStudioPayload(encodedPayload);
    const origin = findGenreByIdOrName(payload.genreId || payload.genreName);
    if (!origin) return toast(`Could not find source genre for that duplicate row${payload?.genreName ? ` (${payload.genreName})` : ""}. Refresh Studio and try again.`, true);

    const found = findSongIndexForDuplicate(origin, payload.songKey, payload.displayKey, payload.songIndex);
    if (!found.song || found.index < 0) return toast("Could not find the source song in that genre. Refresh Studio and try again.", true);
    const source = clonePlain(found.song);
    const sourceLabel = songTitle(source);
    const detachedLevelUp = source.levelUp ? clonePlain(source.levelUp) : null;
    /* v216: make Send to Pending a real persisted move. Earlier versions only
       staged a hidden flag on the listened row; that could be overwritten before
       save and the duplicate QA card would return after refresh. Remove only this
       exact source appearance from its source genre, and keep a detached Level Up
       annotation behind when needed. */
    const nextOriginSongs = found.songs.slice();
    if (detachedLevelUp) {
      nextOriginSongs.splice(found.index, 1, makeDetachedLevelUpSongForDuplicateRouting(detachedLevelUp, source, origin));
    } else {
      nextOriginSongs.splice(found.index, 1);
    }

    const pendingSong = makePendingSongFromDuplicateSource(source, origin);
    origin.songs_listened = storageReadySongs(nextOriginSongs);
    const pending = Array.isArray(origin.pending_songs) ? origin.pending_songs.slice() : [];
    const alreadyPending = pending.some((song) => songsMatchForRouting(song, normalizeSongKeyForCompare(pendingSong), duplicateClusterKeyForSong(pendingSong)));
    if (!alreadyPending) pending.push(pendingSong);
    origin.pending_songs = storageReadySongs(pending.map((song) => ({ ...(song || {}), isPending: true })));

    /* v204: keep the duplicate cluster unresolved after sending one source row to
       Pending. The remaining appearances still need either routing or explicit
       Mark valid / resolved. */
    markStudioLibraryDirty(detachedLevelUp ? `Sent ${sourceLabel} to Pending; kept Level Up annotation in ${origin.genre || "original genre"}.` : `Sent ${sourceLabel} to Pending for routing.`);
    toast(detachedLevelUp ? `Sent to Pending and kept Level Up context in ${origin.genre || "original genre"}.` : "Sent to Pending for routing.", false);

    /* v210: no full Studio rebuild here. Remove only this visible QA row and open
       Routing Desk so the newly staged pending item can be handled after save/reload. */
    updateDuplicateGroupDomAfterPendingRoute(button);
    setTimeout(() => {
      const routeLane = document.getElementById("studio-route-lane");
      if (routeLane && typeof setSectionCollapsed === "function") setSectionCollapsed(routeLane, false);
    }, 0);
  };

  function severity(n) {
    if (n >= 100) return "high";
    if (n >= 25) return "med";
    return "low";
  }

  function laneCard(id, title, count, copy, actionLabel, sample) {
    return `<button type="button" class="studio-lane-card studio-severity-${severity(count)}" data-studio-jump="${esc(id)}">
      <span class="studio-lane-kicker">${esc(actionLabel)}</span>
      <strong>${esc(String(count))}</strong>
      <span class="studio-lane-title">${esc(title)}</span>
      <span class="studio-lane-copy">${esc(copy)}</span>
      ${sample ? `<span class="studio-lane-sample">Next: ${esc(sample)}</span>` : ""}
    </button>`;
  }

  function renderHero(s) {
    const identity = genreIdentityStats();
    const pendingSample = topRows("pending", 1)[0];
    /* Daily Genre v296: use the exact same filtered/consolidated rows shown in
       Repair Bay. Raw stats include rows temporarily hidden after repair, which
       made the Control Room count and “Next” sample point to invisible work. */
    const visibleRepairRows = topRepairRows(100000);
    const repairSample = visibleRepairRows[0] || null;
    const visibleRepairCount = visibleRepairRows.length;
    const unresolvedQaGroups = duplicateGroups(100000);
    const unresolvedQaCount = unresolvedQaGroups.reduce(
      (total, group) => total + group.entries.length,
      0,
    );
    const reviewSample = unresolvedQaGroups[0]?.entries?.[0] || null;
    return `<section class="studio-workbench-hero" aria-label="Studio workbench">
      <div class="studio-workbench-copy">
        <div class="eyebrow">Studio Workbench</div>
        <h2>Curation control room</h2>
        <p>Route ambiguous songs, repair Spotify metadata, and keep the library clean without turning the listening pages into admin screens.</p>
      </div>
      <div class="studio-save-state ${s.libraryDirty ? "is-dirty" : ""}">
        <span>${s.libraryDirty ? "Unsaved cleanup pending" : "No unsaved cleanup"}</span>
        ${s.libraryDirty ? '<button type="button" class="btn btn-primary btn-tiny" onclick="saveLibraryUpdates()">Save cleanup</button>' : ""}
      </div>
      <div class="studio-lane-grid">
        ${laneCard("studio-route-lane", "Needs decision", s.pending, "Pending nominations and unresolved routing choices.", "Route", pendingSample ? songTitle(pendingSample.song) : "")}
        ${laneCard("genreIdentityWorkbench", "Quick editor", identity.missing, identity.missing ? `${identity.missing} listened genre${identity.missing === 1 ? "" : "s"} missing a Genre DNA block.` : "No listened identity backlog. Editor stays available for targeted fixes.", "Identity", identity.missing ? "Paste a structured block when needed" : "0 missing")}
        ${laneCard("studio-repair-lane", "Needs repair", visibleRepairCount, "Album art, years, IDs, and suspicious metadata.", "Repair", repairSample ? songTitle(repairSample.song) : "")}
        ${laneCard("studio-review-lane", "Needs taste / QA", unresolvedQaCount, "Unresolved duplicate-looking appearances currently shown in QA Lab.", "Review", reviewSample ? songTitle(reviewSample.song) : "")}
      </div>
    </section>`;
  }

  function renderToolbar() {
    return `<div class="studio-toolbar" aria-label="Studio controls">
      <label class="studio-search-wrap">
        <span>Search Studio</span>
        <input id="studioGlobalSearch" type="search" placeholder="Track, artist, genre, problem…" autocomplete="off">
      </label>
      <label class="studio-filter-wrap">
        <span>Priority</span>
        <select id="studioPriorityFilter">
          <option value="">All priorities</option>
          <option value="high">High impact</option>
          <option value="repair">Repair only</option>
          <option value="route">Routing only</option>
          <option value="review">Review only</option>
        </select>
      </label>
      <button type="button" class="btn btn-secondary" id="studioExpandAllBtn" aria-expanded="false">Expand all sections</button>
    </div>`;
  }


  /* Daily Genre v215: Studio subsections get the same LLM-friendly
     "Copy first 25" workflow as Pending nominations. */
  function studioCopyButton(kind, title = "Copy the first 25 visible rows from this Studio subsection") {
    return `<button type="button" class="btn btn-secondary btn-tiny studio-copy-first25-btn" onclick="event.preventDefault(); event.stopPropagation(); typeof copyStudioSubsectionFirst25 === 'function' ? copyStudioSubsectionFirst25('${esc(kind)}') : null; return false;" title="${esc(title)}">⧉ Copy first 25</button>`;
  }

  function cleanStudioCopyLine(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,;:])/g, "$1")
      .trim();
  }

  window.copyStudioSubsectionFirst25 = async function(kind) {
    const selectors = {
      identity: "#studio-identity-cleanup-lane [data-studio-copy-line]",
      repair: "#studio-repair-lane [data-studio-copy-line]",
      "repair-track": "#studio-repair-lane .studio-repair-track-subsection [data-studio-copy-line]",
      "repair-album": "#studio-repair-lane .studio-repair-album-subsection [data-studio-copy-line]",
      qa: "#studio-review-lane [data-studio-copy-line]",
      studio: "#screen-review .studio-lane [data-studio-copy-line]",
    };
    const selector = selectors[String(kind || "")] || selectors.studio;
    const rows = $$(selector)
      .filter((row) => !row.classList.contains("is-hidden") && !row.classList.contains("is-resolved") && row.offsetParent !== null)
      .slice(0, 25);
    const lines = rows
      .map((row) => cleanStudioCopyLine(row.dataset.studioCopyLine || row.innerText || row.textContent || ""))
      .filter(Boolean);
    if (!lines.length) {
      toast("No visible Studio rows to copy.", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast(`Copied ${lines.length} Studio row${lines.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.warn("Could not copy Studio subsection rows", error);
      toast("Could not copy Studio rows. Browser blocked clipboard access.", true);
    }
  };

  function renderSongThumb(song) {
    const art = studioArtworkUrl(song);
    if (!art) return '<div class="studio-thumb studio-thumb-empty">♪</div>';
    return `<img class="studio-thumb" src="${esc(art)}" alt="" loading="lazy">`;
  }

  function renderQueueRows(rows, emptyCopy) {
    if (!rows.length)
      return `<div class="studio-empty">${esc(emptyCopy)}</div>`;
    return `<div class="studio-mini-list">${rows
      .map((row, idx) => {
        const href = spotifyUrl(row.song);
        const problem = row.problem || "Needs review";
        const genreName = row.genre?.genre || "Unknown genre";
        const fit =
          row.song?.score ||
          row.song?.originFit ||
          row.song?.nominatedFit ||
          "";
        const isRepair = ["missingArt", "missingYear", "missingMeta", "albumRepair"].includes(row.type);
        const isAlbumRepair = row.type === "albumRepair" || row.isAlbumRepair;
        const inputId = `studioRepairUrl_${String(row.genre?.id ?? "").replace(/[^a-zA-Z0-9_-]/g, "")}_${idx}`;
        const key = songKey(row.song);
        const currentUrl = row.song?.spotifyUrl || row.song?.url || "";
        const repairTargetForRow = (target = {}) => ({
          ...target,
          genreId: String(target.genreId ?? row.genre?.id ?? ""),
          key: String(target.key ?? key ?? ""),
          genreName: target.genreName || genreName,
          title: target.title || row.song?.title || row.song?.name || "",
          artist: target.artist || row.song?.artist || (Array.isArray(row.song?.artists) ? row.song.artists.join(" ") : ""),
          url: target.url || row.song?.spotifyUrl || row.song?.url || "",
          spotifyId: target.spotifyId || row.song?.spotifyId || "",
          isrc: target.isrc || row.song?.isrc || "",
          displayKey: target.displayKey || repairDisplayKey(row.song) || String(key || ""),
          isAlbumRepair: !!(row.type === "albumRepair" || row.isAlbumRepair),
          albumDiveSlotKey: target.albumDiveSlotKey || row.song?.albumDiveSlotKey || "",
        });
        const groupTargets = isRepair && Array.isArray(row.targets) && row.targets.length
          ? row.targets.map(repairTargetForRow)
          : [repairTargetForRow()];
        const encodedTargets = encodeURIComponent(JSON.stringify(groupTargets));
        const copyChip = isRepair && row.targetCount > 1
          ? `<span class="studio-repair-copy-chip">${esc(String(row.targetCount))} copies</span>`
          : "";
        const problemChips = isRepair && Array.isArray(row.repairProblems) && row.repairProblems.length
          ? row.repairProblems.map((kind) => `<span class="studio-repair-missing-chip" data-repair-kind="${esc(kind)}">missing ${esc(kind)}</span>`).join("")
          : `<span class="studio-repair-missing-chip" data-repair-kind="${esc(problem)}">${esc(problem)}</span>`;
        const titleOverrideId = `${inputId}_title`;
        const artistOverrideId = `${inputId}_artist`;
        const inlineRepair = isRepair && !isAlbumRepair
          ? `<div class="studio-inline-track-edit" data-studio-repair-form="1" data-studio-repair-targets="${encodedTargets}" data-studio-repair-input="${esc(inputId)}" onpointerdown="event.preventDefault(); event.stopPropagation();" onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"><label for="${esc(inputId)}">Spotify / YouTube / Apple Music / SoundCloud / Bandcamp URL${row.targetCount > 1 ? ` · updates ${esc(String(row.targetCount))} matching copies` : ""}</label><div><input id="${esc(inputId)}" type="url" placeholder="Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track URL" value="${esc(currentUrl)}" onclick="event.stopPropagation();" onkeydown="if(event.key === 'Enter'){ event.preventDefault(); event.stopPropagation(); const wrap=this.closest('[data-studio-repair-form]'); const btn=wrap?.querySelector('[data-studio-repair-update]'); if(btn) btn.click(); }"><button type="button" class="btn btn-primary btn-tiny" data-studio-repair-update="1" onclick="event.preventDefault(); event.stopPropagation(); typeof updateStudioRepairGroupUrlFromQueue === 'function' ? updateStudioRepairGroupUrlFromQueue('${encodedTargets}', '${esc(inputId)}', this) : null; return false;">${row.targetCount > 1 ? "Apply to copies / Overrides" : "Apply URL / Overrides"}</button></div><div class="studio-repair-manual-meta"><input id="${esc(titleOverrideId)}" type="text" value="${esc(row.song?.title || row.song?.name || '')}" placeholder="Override title if YouTube/Apple title is messy" onclick="event.stopPropagation();"><input id="${esc(artistOverrideId)}" type="text" value="${esc(row.song?.artist || (Array.isArray(row.song?.artists) ? row.song.artists.join(', ') : ''))}" placeholder="Override artist/channel if needed" onclick="event.stopPropagation();"></div><div class="studio-inline-repair-status" data-studio-repair-status aria-live="polite">Edit title/artist, then Apply URL / Overrides. Use Save cleanup to persist.</div></div>`
          : isAlbumRepair
            ? `<div class="studio-inline-track-edit studio-inline-album-repair" data-studio-album-repair-form="1" data-studio-repair-targets="${encodedTargets}" data-studio-repair-input="${esc(inputId)}" onpointerdown="event.preventDefault(); event.stopPropagation();" onmousedown="event.stopPropagation();" onclick="event.stopPropagation();"><label for="${esc(inputId)}">Correct Album Dive URL</label><div><input id="${esc(inputId)}" type="url" placeholder="https://open.spotify.com/album/... or Apple/YouTube album link" value="${esc(currentUrl)}" onclick="event.stopPropagation();" onkeydown="if(event.key === 'Enter'){ event.preventDefault(); event.stopPropagation(); const wrap=this.closest('[data-studio-album-repair-form]'); const btn=wrap?.querySelector('[data-studio-album-repair-update]'); if(btn) btn.click(); }"><button type="button" class="btn btn-primary btn-tiny" data-studio-album-repair-update="1" onclick="event.preventDefault(); event.stopPropagation(); typeof updateStudioAlbumRepairUrlFromQueue === 'function' ? updateStudioAlbumRepairUrlFromQueue('${encodedTargets}', '${esc(inputId)}', this) : null; return false;">Apply album URL</button></div><div class="studio-inline-repair-status" data-studio-repair-status aria-live="polite">Paste the correct album URL, apply it, then Save cleanup to persist.</div></div>`
            : "";
        const skipKey = isRepair ? encodeURIComponent(repairSkipKey(row) || "") : "";
        const copyLine = [isAlbumRepair ? "Album Dive Repair" : "Track Repair", problem, genreName, songTitle(row.song), fit ? `fit ${fit}/5` : "", row.targetCount > 1 ? `${row.targetCount} copies` : "", row.song?.pendingFrom ? `from ${row.song.pendingFrom}` : ""].filter(Boolean).join(" | ");
        return `<article class="studio-mini-row ${isRepair ? "studio-mini-row-repair studio-mini-row-repair-grouped" : ""}" data-studio-row data-studio-copy-line="${esc(copyLine)}" data-studio-text="${esc(norm([problem, genreName, songTitle(row.song), row.song?.reason, row.song?.pendingFrom, row.targetCount > 1 ? `${row.targetCount} copies` : ""].join(" ")))}" data-studio-type="${esc(row.type)}" data-studio-priority="${row.priority >= 70 ? "high" : row.priority >= 45 ? "med" : "low"}">
          ${renderSongThumb(row.song)}
          <div class="studio-mini-main">
            <div class="studio-mini-title">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(songTitle(row.song))}</a>` : esc(songTitle(row.song))}</div>
            <div class="studio-mini-meta">${copyChip}${problemChips}<span>${esc(genreName)}</span>${fit ? `<span>fit ${esc(fit)}/5</span>` : ""}${row.song?.pendingFrom ? `<span>from ${esc(row.song.pendingFrom)}</span>` : ""}</div>
            ${inlineRepair}
          </div>
          <div class="studio-mini-actions">
            ${isRepair && !isAlbumRepair ? `<button type="button" class="btn btn-secondary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof skipStudioRepairRow === 'function' ? skipStudioRepairRow('${skipKey}', this) : null; return false;">Skip for now</button><button type="button" class="btn btn-danger btn-tiny studio-hard-delete-btn" onclick="event.preventDefault(); event.stopPropagation(); typeof hardDeleteStudioRepairGroup === 'function' ? hardDeleteStudioRepairGroup('${encodedTargets}', this) : null; return false;" title="Permanently delete this track from every genre and every queue">Delete everywhere</button>` : ""}
            <button type="button" class="btn btn-secondary btn-tiny" onclick="event.stopPropagation(); openGenreByIdEncoded('${encodeURIComponent(String(row.genre?.id ?? ""))}', ${row.type === "missingArt" || row.type === "missingYear" || row.type === "missingMeta" || row.type === "albumRepair" || row.type === "duplicate"})">Open genre</button>
          </div>
        </article>`;
      })
      .join("")}</div>`;
  }



  function renderIdentityQueueLane(identity) {
    const rows = identity.rows || identityQueueRows(60);
    const issueCounts = rows.reduce((acc, row) => {
      row.issues.forEach((issue) => { acc[issue] = (acc[issue] || 0) + 1; });
      return acc;
    }, {});
    const chips = ["description", "aliases", "seminal track", "media touchstone"]
      .map((issue) => `<span>${esc(String(issueCounts[issue] || 0))} ${esc(issue)}</span>`)
      .join("");
    const body = rows.length
      ? `<div class="studio-mini-list studio-identity-queue-list">${rows.map((row) => {
          const genre = row.genre || {};
          const genreName = genre.genre || genre.name || "Unknown genre";
          const issueChips = row.issues.map((issue) => `<span class="studio-repair-missing-chip">missing ${esc(issue)}</span>`).join("");
          return `<article class="studio-mini-row studio-identity-queue-row" data-studio-row data-studio-text="${esc(norm([genreName, row.issues.join(' ')].join(' ')))}" data-studio-type="identity" data-studio-priority="${row.issues.length >= 3 ? 'high' : row.issues.length >= 2 ? 'med' : 'low'}">
            <div class="studio-thumb studio-thumb-empty">ID</div>
            <div class="studio-mini-main">
              <div class="studio-mini-title">${esc(genreName)}</div>
              <div class="studio-mini-meta">${issueChips}</div>
            </div>
            <div class="studio-mini-actions">
              <button type="button" class="btn btn-secondary btn-tiny" onclick="event.stopPropagation(); openGenreByIdEncoded('${encodeURIComponent(String(genre?.id ?? ''))}', true)">Open genre</button>
            </div>
          </article>`;
        }).join("")}</div>`
      : '<div class="studio-empty">All listened genres have the required Genre Identity fields.</div>';
    return `<section class="studio-lane studio-identity-queue-lane" id="studio-identity-queue-lane" data-studio-lane="identity">
      <div class="studio-lane-head">
        <div><div class="eyebrow">Identity Queue</div><h3>Listened genres needing Genre Identity</h3><p>The count now matches this visible queue: only listened genres missing description, aliases, seminal track, or media touchstone appear here.</p></div>
        <div class="studio-lane-counts">${chips}</div>
      </div>
      ${body}
    </section>`;
  }

  function identityQueueRowsAll() {
    return getGenres()
      .filter(isListenedGenreForStudio)
      .map((genre) => ({ genre, issues: identityIssuesForGenre(genre) }))
      .filter((row) => row.issues.length)
      .sort((a, b) => String(a.genre?.genre || "").localeCompare(String(b.genre?.genre || "")));
  }

  function renderIdentityCleanupLane() {
    const rows = identityQueueRowsAll();
    const body = rows.length
      ? `<div class="studio-identity-cleanup-list">${rows.map((row, idx) => {
          const genre = row.genre || {};
          const genreName = genre.genre || genre.name || "Unknown genre";
          const genreId = encodeURIComponent(String(genre?.id ?? ""));
          const textId = `studioIdentityBlock_${String(genre?.id ?? idx).replace(/[^a-z0-9_-]/gi, "_")}`;
          const issueText = row.issues.length ? row.issues.join(", ") : "identity block";
          const copyLine = `Genre Identity | ${genreName} | missing: ${issueText}`;
          return `<article class="studio-identity-cleanup-row" data-studio-row data-studio-copy-line="${esc(copyLine)}" data-studio-text="${esc(norm([genreName, issueText].join(" ")))}" data-studio-type="identity" data-studio-priority="high">
            <div class="studio-identity-row-main">
              <div class="studio-mini-title">${esc(genreName)}</div>
              <div class="studio-mini-meta"><span>missing ${esc(issueText)}</span></div>
            </div>
            <div class="studio-identity-row-actions">
              <button type="button" class="btn btn-secondary btn-tiny" onclick="event.stopPropagation(); openGenreByIdEncoded('${genreId}', true)">Open genre</button>
              <button type="button" class="btn btn-primary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); this.closest('.studio-identity-cleanup-row')?.classList.toggle('is-expanded'); return false;">Expand</button>
            </div>
            <div class="studio-identity-row-editor">
              <label for="${esc(textId)}">Structured Genre DNA block</label>
              <textarea id="${esc(textId)}" rows="9" placeholder="GENRE: ${esc(genreName)}&#10;&#10;ALIASES:&#10;...&#10;&#10;SEMINAL_TRACK:&#10;ARTIST: ...&#10;TITLE: ...&#10;SPOTIFY_URL: ...&#10;REASON: ...&#10;&#10;MEDIA_TOUCHSTONE:&#10;ARTIST: ...&#10;TITLE: ...&#10;MEDIA_TITLE: ...&#10;MEDIA_TYPE: game/film/tv/etc.&#10;SPOTIFY_URL: ...&#10;REASON: ..."></textarea>
              <div class="studio-identity-row-editor-actions">
                <button type="button" class="btn btn-primary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof applyStudioIdentityQueueBlock === 'function' ? applyStudioIdentityQueueBlock('${genreId}', '${esc(textId)}', false, this) : null; return false;">Apply & Save block</button>
                <button type="button" class="btn btn-secondary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); typeof applyStudioIdentityQueueBlock === 'function' ? applyStudioIdentityQueueBlock('${genreId}', '${esc(textId)}', true, this) : null; return false;">Overwrite & Save block</button>
              </div>
              <div class="small studio-identity-row-status" aria-live="polite">Paste the full Genre DNA block here. Manual per-field editing is intentionally hidden from Studio.</div>
            </div>
          </article>`;
        }).join("")}</div>`
      : '<div class="studio-empty">0 listened genres need Genre Identity cleanup.</div>';
    return `<section class="studio-lane studio-identity-cleanup-lane" id="studio-identity-cleanup-lane" data-studio-lane="identity">
      <div class="studio-lane-head">
        <div><div class="eyebrow">Genre Identity</div><h3>Listened genres missing Genre DNA</h3><p>Each row expands into a structured block paste tool. The big manual form stays hidden so this works like Repair Bay cleanup.</p></div>
        <div class="studio-lane-counts"><span>${rows.length} missing</span>${studioCopyButton("identity", "Copy the first 25 visible Genre Identity cleanup rows")}</div>
      </div>
      ${body}
    </section>`;
  }

  async function applyStudioIdentityQueueBlock(genreIdEncoded, textareaId, overwrite, button) {
    const id = decodeURIComponent(String(genreIdEncoded || ""));
    const genre = getGenres().find((g) => String(g?.id ?? "") === String(id));
    const textarea = document.getElementById(textareaId);
    const text = textarea?.value || "";
    const status = button?.closest?.(".studio-identity-row-editor")?.querySelector?.(".studio-identity-row-status");
    if (!text.trim()) {
      if (status) status.textContent = "Paste a structured Genre DNA block first.";
      if (typeof toast === "function") toast("Paste a structured Genre DNA block first.", true);
      return false;
    }
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = overwrite ? "Overwriting…" : "Saving…";
    try {
      const api = window.DailyGenreIdentity;
      if (!api || typeof api.importStructuredIdentityBlock !== "function") throw new Error("Genre Identity importer is not available.");
      const ok = await api.importStructuredIdentityBlock(text, { overwrite: !!overwrite, genreFallback: genre?.genre || genre?.name || "" });
      if (ok !== false) {
        if (status) status.textContent = `Saved ${genre?.genre || "Genre Identity"}. Refresh Studio to remove it from the queue.`;
        button.closest?.(".studio-identity-cleanup-row")?.classList.add("is-resolved");
        if (typeof markStudioLibraryDirty === "function") markStudioLibraryDirty("Genre Identity block saved — save cleanup if prompted.");
      }
      return ok;
    } catch (error) {
      console.warn("Studio identity queue block save failed", error);
      if (status) status.textContent = error?.message || "Could not save identity block.";
      if (typeof toast === "function") toast(error?.message || "Could not save identity block.", true);
      return false;
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  window.applyStudioIdentityQueueBlock = applyStudioIdentityQueueBlock;

  function renderRepairLane(s) {
    const rows = topRepairRows(80);
    const trackRows = rows.filter((row) => !(row.type === "albumRepair" || row.isAlbumRepair));
    const albumRows = rows.filter((row) => row.type === "albumRepair" || row.isAlbumRepair);
    const repairCounts = rows.reduce((acc, row) => {
      const problems = Array.isArray(row.repairProblems) && row.repairProblems.length ? row.repairProblems : missingKinds(row.song);
      problems.forEach((kind) => { acc[kind] = (acc[kind] || 0) + 1; });
      return acc;
    }, {});
    const trackBody = renderQueueRows(trackRows, "No visible track metadata/artwork repair rows.");
    const albumBody = renderQueueRows(albumRows, "No visible Album Dive metadata/artwork repair rows.");
    return `<section class="studio-lane" id="studio-repair-lane" data-studio-lane="repair">
      <div class="studio-lane-head">
        <div><div class="eyebrow">Repair Bay</div><h3>Metadata and artwork cleanup</h3><p>Track and Album Dive issues live here together so Library, Stats, song carousels, and album carousels stay trustworthy.</p></div>
        <div class="studio-lane-counts"><span>${repairCounts.art || 0} track art</span><span>${repairCounts.year || 0} track years</span><span>${repairCounts.metadata || 0} track metadata</span><span>${repairCounts["album art"] || 0} album art</span><span>${repairCounts["album year"] || 0} album years</span><span>${repairCounts["album metadata"] || 0} album metadata</span>${studioCopyButton("repair", "Copy the first 25 visible Repair Bay rows")}</div>
      </div>
      <div class="studio-action-strip studio-repair-actions-compact">
        <button type="button" class="btn btn-secondary" onclick="typeof refreshNextSpotifyTracks === 'function' ? refreshNextSpotifyTracks(5) : null">Auto-refresh next 5 tracks</button>
        <button type="button" class="btn btn-secondary" onclick="typeof refreshStudioRepairList === 'function' ? refreshStudioRepairList(this) : (typeof renderReview === 'function' ? renderReview() : null)">Refresh repair list</button>
        <div class="studio-action-helper">Track rows support inline URL/override repair. Album Dive rows are visible here and open the genre/Album Dive editor for album art, year, and album metadata repair.</div>
      </div>
      <div class="studio-repair-subsection studio-repair-track-subsection"><div class="studio-subsection-head"><h4>Track metadata/artwork</h4>${studioCopyButton("repair-track", "Copy the first 25 visible track repair rows")}</div>${trackBody}</div>
      <div class="studio-repair-subsection studio-repair-album-subsection"><div class="studio-subsection-head"><h4>Album Dive metadata/artwork</h4>${studioCopyButton("repair-album", "Copy the first 25 visible Album Dive repair rows")}</div>${albumBody}</div>
    </section>`;
  }

  function renderReviewLane(s) {
    const groups = duplicateGroups(25);
    const safeGroups = safeHighFitCrossGenreGroups(100000);
    const safeAppearances = safeGroups.reduce((total, group) => total + group.entries.length, 0);
    return `<section class="studio-lane" id="studio-review-lane" data-studio-lane="review">
      <div class="studio-lane-head">
        <div><div class="eyebrow">QA Lab</div><h3>Taste pass and structural checks</h3><p>Resolve duplicate-looking songs, route low-fit source rows, and keep Level Up context attached to the original genre.</p></div>
        <div class="studio-lane-counts"><span>${s.unrated} unrated</span><span>${groups.reduce((total, group) => total + group.entries.length, 0)} duplicate hits</span><span>${s.drafts} drafts</span><button type="button" class="btn btn-primary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); bulkResolveSafeHighFitQa(this); return false;" ${safeGroups.length ? "" : 'disabled aria-disabled="true"'} title="Resolve clusters where every appearance is fit 4–5 and every genre is unique">✓ Resolve safe 4–5 crossovers (${safeGroups.length})</button><button type="button" class="btn btn-secondary btn-tiny" onclick="event.preventDefault(); event.stopPropagation(); refreshStudioQaLab(); return false;">Refresh checks</button>${studioCopyButton("qa", "Copy the first 25 visible QA duplicate clusters")}</div>
      </div>
      ${safeGroups.length ? `<div class="studio-action-strip"><div class="studio-action-helper">${safeGroups.length} cluster${safeGroups.length === 1 ? "" : "s"} / ${safeAppearances} appearances currently qualify: all fits are 4–5 and no genre repeats within a cluster.</div></div>` : ""}
      ${renderDuplicateGroups(groups)}
    </section>`;
  }

  window.refreshStudioQaLab = function refreshStudioQaLab() {
    const mount = document.getElementById("reviewContent");
    const current = document.getElementById("studio-review-lane");
    if (!mount || !current) {
      if (typeof window.renderReview === "function") window.renderReview();
      return;
    }

    const wasOpen = !current.classList.contains("studio-section-collapsed");
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    current.insertAdjacentHTML("afterend", renderReviewLane(stats()));
    current.remove();

    const next = document.getElementById("studio-review-lane");
    if (next) {
      next.classList.add("studio-collapsible-section");
      next.dataset.studioCollapsible = "1";
      ensureCollapsibleHeader(next);
      setSectionCollapsed(next, !wasOpen);
    }

    filterStudioRows(mount);
    requestAnimationFrame(() => window.scrollTo({ top: currentScrollY, left: 0, behavior: "auto" }));
    toast("QA Lab refreshed with up to 25 current checks.");
  };

  function decorateExistingReviewSections(mount) {
    const inbox = $(".inbox-card", mount);
    if (inbox && !inbox.closest(".studio-lane")) {
      const wrap = document.createElement("section");
      wrap.id = "studio-inbox-lane";
      wrap.className = "studio-lane studio-inbox-lane";
      wrap.dataset.studioLane = "route";
      wrap.innerHTML =
        '<div class="studio-lane-head"><div><div class="eyebrow">Inbox</div><h3>New song intake</h3><p>Drop a Spotify URL or Artist — Title and route it to the right pending queue.</p></div></div>';
      inbox.parentNode.insertBefore(wrap, inbox);
      wrap.appendChild(inbox);
    }

    const pending = $("#reviewPendingQueueCard", mount);
    const manual = $("#reviewManualQueueCard", mount);
    if (pending && !pending.closest("#studio-route-lane")) {
      const route = document.createElement("section");
      route.id = "studio-route-lane";
      route.className = "studio-lane studio-route-lane";
      route.dataset.studioLane = "route";
      route.innerHTML =
        `<div class="studio-lane-head"><div><div class="eyebrow">Routing Desk</div><h3>Pending nominations and ambiguous tags</h3><p>Decide whether a track is misplaced, a crossover, a Level Up, an Add, or simply needs dismissal.</p></div><div class="studio-lane-counts"><button type="button" class="btn btn-secondary btn-tiny studio-copy-first25-btn" onclick="event.preventDefault(); event.stopPropagation(); typeof copyReviewPendingQueueFirst25 === 'function' ? copyReviewPendingQueueFirst25() : null; return false;" title="Copy the first 25 visible pending nominations">⧉ Copy first 25</button></div></div>`;
      pending.parentNode.insertBefore(route, pending);
      route.appendChild(pending);
      if (manual) route.appendChild(manual);
    }

    $$(".review-card", mount).forEach((card) =>
      card.classList.add("studio-native-card"),
    );
    $$(".review-row", mount).forEach((row) => {
      row.dataset.studioRow = "native";
      if (!row.dataset.studioText)
        row.dataset.studioText = norm(row.textContent || "");
    });
  }

  function enhanceSelects(mount) {
    $$('select[id^="pending-review-"]', mount).forEach((select) => {
      if (select.dataset.studioEnhanced === "1") return;
      select.dataset.studioEnhanced = "1";
      const wrap = document.createElement("div");
      wrap.className = "studio-genre-typeahead-wrap";
      const input = document.createElement("input");
      input.type = "search";
      input.className = "studio-genre-typeahead";
      input.placeholder = "Type target genre…";
      input.setAttribute("aria-label", "Type target genre");
      const list = document.createElement("div");
      list.className = "studio-genre-typeahead-list hidden";
      select.parentNode.insertBefore(wrap, select);
      wrap.appendChild(input);
      wrap.appendChild(list);
      wrap.appendChild(select);
      select.classList.add("studio-original-select");

      const options = Array.from(select.options)
        .filter((o) => o.value)
        .map((o) => ({ id: o.value, label: o.textContent || "" }));
      function render(term = "") {
        const n = norm(term);
        const matches = options
          .map((o) => {
            const labelNorm = norm(o.label);
            let score = 0;
            if (!n) score = 1;
            else if (labelNorm === n) score = 100;
            else if (labelNorm.startsWith(n)) score = 80;
            else if (labelNorm.includes(n)) score = 40;
            return { ...o, score };
          })
          .filter((o) => o.score)
          .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
          .slice(0, 8);
        list.innerHTML = matches.length
          ? matches
              .map(
                (o) =>
                  `<button type="button" data-id="${esc(o.id)}">${esc(o.label)}</button>`,
              )
              .join("")
          : '<div class="studio-typeahead-empty">No genre matches.</div>';
        list.classList.toggle("hidden", !term && !matches.length);
      }
      input.addEventListener("input", () => render(input.value));
      input.addEventListener("focus", () => render(input.value));
      list.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-id]");
        if (!btn) return;
        select.value = btn.dataset.id || "";
        input.value = btn.textContent || "";
        list.classList.add("hidden");
      });
      document.addEventListener(
        "click",
        (ev) => {
          if (!wrap.contains(ev.target)) list.classList.add("hidden");
        },
        { capture: true },
      );
    });
  }

  function sectionTitle(section) {
    return (
      section.querySelector("h3, h2")?.textContent?.trim() ||
      section.id ||
      "Section"
    );
  }

  function ensureCollapsibleHeader(section) {
    let head = section.querySelector(
      ":scope > .studio-lane-head, :scope > .genre-identity-editor-head, :scope > .review-card-head",
    );
    if (!head) {
      const first = section.firstElementChild;
      const title = sectionTitle(section);
      head = document.createElement("div");
      head.className = "studio-lane-head studio-generated-head";
      head.innerHTML = `<div><h3>${esc(title)}</h3></div>`;
      section.insertBefore(head, first || null);
    }
    if (!head.querySelector(".studio-collapse-btn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "studio-collapse-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML =
        '<span aria-hidden="true">＋</span><strong>Expand</strong>';
      head.appendChild(btn);
    }
    return head;
  }

  function setSectionCollapsed(section, collapsed) {
    section.classList.toggle("studio-section-collapsed", !!collapsed);
    const btn = section.querySelector(
      ":scope > .studio-lane-head .studio-collapse-btn, :scope > .genre-identity-editor-head .studio-collapse-btn, :scope > .review-card-head .studio-collapse-btn",
    );
    if (btn) {
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.innerHTML = collapsed
        ? '<span aria-hidden="true">＋</span><strong>Expand</strong>'
        : '<span aria-hidden="true">−</span><strong>Collapse</strong>';
    }
  }


  function captureStudioSectionState(mount) {
    if (!mount) return null;
    const openIds = [];
    $$(".studio-collapsible-section[id]", mount).forEach((section) => {
      if (!section.classList.contains("studio-section-collapsed")) {
        openIds.push(section.id);
      }
    });
    return {
      openIds,
      showAll: mount.classList.contains("studio-show-all"),
    };
  }

  function restoreStudioSectionState(mount, state) {
    if (!mount || !state) return;
    if (state.showAll) mount.classList.add("studio-show-all");
    state.openIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section && section.closest("#reviewContent") === mount) {
        setSectionCollapsed(section, false);
      }
    });
    const expand = document.getElementById("studioExpandAllBtn");
    if (expand && state.showAll) {
      expand.textContent = "Collapse all sections";
      expand.setAttribute("aria-expanded", "true");
    }
  }

  function getStudioCollapsibleSections(mount) {
    return [
      ...$$(":scope > .studio-lane", mount),
      ...$$(":scope > .review-card", mount),
      ...$$(":scope > .genre-identity-editor", mount),
    ].filter(
      (section) =>
        !section.classList.contains("studio-workbench-hero") &&
        !section.classList.contains("studio-toolbar"),
    );
  }

  function makeStudioSectionsCollapsible(mount) {
    const sections = getStudioCollapsibleSections(mount);

    sections.forEach((section) => {
      if (section.dataset.studioCollapsible === "1") return;
      section.dataset.studioCollapsible = "1";
      section.classList.add("studio-collapsible-section");
      ensureCollapsibleHeader(section);
      setSectionCollapsed(section, true);
    });
  }

  function installInteractions(mount) {
    if (mount.dataset.studioInteractions === "1") return;
    mount.dataset.studioInteractions = "1";
    mount.addEventListener("click", (ev) => {
      if (ev.target?.closest?.(".studio-inline-track-edit")) {
        return;
      }
      const collapseBtn = ev.target.closest(".studio-collapse-btn");
      if (collapseBtn) {
        ev.preventDefault();
        const section = collapseBtn.closest(".studio-collapsible-section");
        if (section)
          setSectionCollapsed(
            section,
            !section.classList.contains("studio-section-collapsed"),
          );
        return;
      }
      const jump = ev.target.closest("[data-studio-jump]");
      if (jump) {
        ev.preventDefault();
        const target = document.getElementById(jump.dataset.studioJump || "");
        if (target) {
          setSectionCollapsed(target, false);
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
      const expand = ev.target.closest("#studioExpandAllBtn");
      if (expand) {
        ev.preventDefault();
        const shouldOpen = !mount.classList.contains("studio-show-all");
        mount.classList.toggle("studio-show-all", shouldOpen);
        const sections = getStudioCollapsibleSections(mount);
        sections.forEach((section) =>
          setSectionCollapsed(section, !shouldOpen),
        );
        expand.textContent = shouldOpen
          ? "Collapse all sections"
          : "Expand all sections";
        expand.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        return;
      }
    });

    mount.addEventListener("input", (ev) => {
      if (
        ev.target?.id === "studioGlobalSearch" ||
        ev.target?.id === "studioPriorityFilter"
      ) {
        filterStudioRows(mount);
      }
    });
    mount.addEventListener("change", (ev) => {
      if (ev.target?.id === "studioPriorityFilter") filterStudioRows(mount);
    });
  }

  function filterStudioRows(mount) {
    const term = norm($("#studioGlobalSearch", mount)?.value || "");
    const mode = $("#studioPriorityFilter", mount)?.value || "";
    $$("[data-studio-row]", mount).forEach((row) => {
      const text = row.dataset.studioText || norm(row.textContent || "");
      const type = row.dataset.studioType || "";
      const pri = row.dataset.studioPriority || "";
      const lane = row.closest("[data-studio-lane]")?.dataset.studioLane || "";
      const matchesTerm = !term || text.includes(term);
      const matchesMode =
        !mode ||
        (mode === "high" ? pri === "high" : mode === lane || mode === type);
      row.classList.toggle("is-hidden", !(matchesTerm && matchesMode));
    });
  }

  function decodeMaybe(value) {
    try {
      return decodeURIComponent(String(value || ""));
    } catch (_) {
      return String(value || "");
    }
  }

  function miniPlayerButtonForSong(song) {
    const href = spotifyUrl(song);
    if (!href) return "";
    const rawUrl = encodeURIComponent(href);
    const title = encodeURIComponent(
      song?.title || songTitle(song) || "Spotify track",
    );
    const artist = encodeURIComponent(
      song?.artist ||
        (Array.isArray(song?.artists) ? song.artists.join(", ") : "") ||
        "",
    );
    const artwork = encodeURIComponent(song?.artwork || "");
    return `<button type="button" class="btn btn-secondary btn-tiny studio-mini-player-btn" title="Open in mini player" aria-label="Open in mini player" onclick="event.preventDefault(); event.stopPropagation(); if (typeof stickyPlayerOpen === 'function') stickyPlayerOpen('${rawUrl}', '${title}', '${artist}', '${artwork}'); else window.open('${esc(href)}','_blank','noopener');">▶</button>`;
  }

  function annotatePendingQueueRows(mount) {
    const card = $("#reviewPendingQueueCard", mount);
    if (!card) return;
    let queued = [];
    try {
      if (typeof window.collectQueuedPendingNominationRows === "function")
        queued = window.collectQueuedPendingNominationRows() || [];
    } catch (_) {}
    const rows = $$("[data-review-pending-row]", card);
    rows.forEach((rowEl, idx) => {
      const row = queued[idx] || null;
      const song = row?.song || null;
      const move = $(".review-move", rowEl);
      const titleLink = $(".review-track-title a", rowEl);
      const href = song ? spotifyUrl(song) : titleLink?.href || "";

      // Keep only one web/mini-player action. Older layers can leave both a Spotify
      // text button and a compact play button in the same row.
      if (move) {
        Array.from(move.querySelectorAll("button")).forEach((btn) => {
          const txt = (btn.textContent || "").trim();
          if (btn.classList.contains("studio-mini-player-btn") || /^spotify$/i.test(txt) || txt === "▶") btn.remove();
        });
        if (song && href) {
          move.insertAdjacentHTML("beforeend", miniPlayerButtonForSong(song));
        } else if (href) {
          const label = (titleLink?.textContent || "Spotify track").replace(/↗/g, "").trim();
          const rawUrl = encodeURIComponent(href);
          const title = encodeURIComponent(label);
          move.insertAdjacentHTML(
            "beforeend",
            `<button type="button" class="btn btn-secondary btn-tiny studio-mini-player-btn" title="Open in mini player" aria-label="Open in mini player" onclick="event.preventDefault(); event.stopPropagation(); if (typeof stickyPlayerOpen === 'function') stickyPlayerOpen('${rawUrl}', '${title}', '', ''); else window.open('${esc(href)}','_blank','noopener');">▶</button>`,
          );
        }
      }

      // Add the curator explanation/reason when available.
      if (
        song &&
        song.reason &&
        !rowEl.querySelector(".studio-pending-reason")
      ) {
        const main = rowEl.firstElementChild;
        if (main) {
          const reason = esc(song.reason);
          main.insertAdjacentHTML(
            "beforeend",
            `<div class="studio-pending-reason"><strong>Why queued:</strong> ${reason}</div>`,
          );
          rowEl.dataset.studioText = norm(
            [
              rowEl.dataset.studioText || "",
              song.reason,
              song.pendingFrom,
              song.artist,
              song.title,
            ].join(" "),
          );
        }
      }
    });
  }

  function clarifyNativeStudioLabels(mount) {
    const hero = document.querySelector("#screen-review .review-hero");
    if (hero && !hero.dataset.studioClarified) {
      hero.dataset.studioClarified = "1";
      const pendingBtn = Array.from(hero.querySelectorAll("button")).find(
        (btn) => /pending tag cleanup/i.test(btn.textContent || ""),
      );
      if (pendingBtn) {
        pendingBtn.textContent = "Import @tags (advanced)";
        pendingBtn.title =
          "Advanced backfill only: scans pasted low-fit @genre rows and can re-create pending nominations. Manual Routing Desk decisions are the normal flow.";
        const wrap = pendingBtn.closest('.review-hero, .panel, .review-card') || hero;
        if (wrap && !wrap.querySelector('.studio-retired-tag-route-note')) {
          pendingBtn.insertAdjacentHTML('afterend', '<div class="studio-retired-tag-route-note"><strong>Heads up:</strong> @tag import is only for old pasted Studio blocks. For everyday cleanup, use the Routing Desk rows below.</div>');
        }
      }
    }
  }


  /* v202: Studio identity cleanup is row-based; hide the manual field grid. */
  function ensureStudioV201Styles() {
    if (document.getElementById("studio-v202-style")) return;
    const style = document.createElement("style");
    style.id = "studio-v202-style";
    style.textContent = `
      #screen-review .studio-identity-paste-only .genre-identity-form > label,
      #screen-review .studio-identity-paste-only .genre-identity-form > .genre-identity-section-title,
      #screen-review .studio-identity-paste-only .genre-identity-form > .genre-identity-media-list,
      #screen-review .studio-identity-paste-only .genre-identity-form > .genre-identity-actions { display: none !important; }
      #screen-review .studio-identity-paste-only .genre-identity-form > .genre-identity-import { display: block !important; }
      #screen-review .studio-identity-paste-only .genre-identity-import { margin-top: 10px; }
      #screen-review .studio-legacy-tag-import { margin: 16px 0 0; padding: 12px 14px; border: 1px solid rgba(127,82,28,.2); border-radius: 18px; background: rgba(255,252,241,.5); }
      #screen-review .studio-legacy-tag-import summary { cursor: pointer; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
      #screen-review #genreIdentityWorkbench,
      #screen-review .genre-identity-editor.studio-identity-quick-editor { display: none !important; }
      #screen-review .studio-inline-album-repair input { min-width: 0; }
      #screen-review .studio-identity-cleanup-list { display: grid; gap: 10px; margin-top: 12px; }
      #screen-review .studio-identity-cleanup-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; padding: 12px 14px; border: 1px solid rgba(120,74,27,.16); border-radius: 18px; background: rgba(255,252,241,.58); }
      #screen-review .studio-identity-row-main { min-width: 0; }
      #screen-review .studio-identity-row-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      #screen-review .studio-identity-row-editor { display: none; grid-column: 1 / -1; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(120,74,27,.12); }
      #screen-review .studio-identity-cleanup-row.is-expanded .studio-identity-row-editor { display: grid; }
      #screen-review .studio-identity-cleanup-row.is-resolved { opacity: .72; }
      #screen-review .studio-identity-row-editor textarea { min-height: 190px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .84rem; line-height: 1.4; }
      #screen-review .studio-identity-row-editor-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      /* v203-v206: keep duplicate-cluster header actions readable and cluster rows stable. */
      #screen-review .studio-duplicate-head {
        grid-template-columns: 64px minmax(0,1fr) minmax(260px,320px) !important;
        align-items: start !important;
        column-gap: 14px !important;
      }
      #screen-review .studio-duplicate-head-actions {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        min-width: 260px !important;
        max-width: 320px !important;
        width: 100% !important;
        justify-self: end !important;
      }
      #screen-review .studio-duplicate-head-actions .btn {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 42px !important;
        padding: 10px 14px !important;
        white-space: normal !important;
        line-height: 1.12 !important;
        text-align: center !important;
      }
      #screen-review .studio-duplicate-head .btn { white-space: normal !important; min-height: 38px; line-height: 1.08; }
      #screen-review .studio-duplicate-actions .btn { white-space: nowrap; }
      @media(max-width:760px){
        #screen-review .studio-identity-cleanup-row { grid-template-columns: 1fr; }
        #screen-review .studio-identity-row-actions { justify-content: flex-start; }
        #screen-review .studio-duplicate-head { grid-template-columns: 1fr !important; }
        #screen-review .studio-duplicate-head-actions { min-width: 0 !important; max-width: none !important; justify-self: stretch !important; }
        #screen-review .studio-duplicate-head .studio-duplicate-actions { min-width: 0; justify-content: flex-start; }
      }
    `;
    document.head.appendChild(style);
  }

  function tuneIdentityEditorForV200(mount) {
    ensureStudioV201Styles();
    const editor = mount?.querySelector?.(".genre-identity-editor, #genreIdentityWorkbench");
    if (!editor || editor.dataset.studioIdentityV201 === "1") return;
    editor.dataset.studioIdentityV201 = "1";
    editor.classList.add("studio-identity-quick-editor", "studio-identity-paste-only");
    const head = editor.querySelector(".genre-identity-editor-head, .studio-lane-head") || editor.firstElementChild;
    const h = editor.querySelector("h2, h3");
    if (h) h.textContent = "Quick Genre Identity paste tool";
    if (head && !head.querySelector(".studio-identity-v200-note")) {
      head.insertAdjacentHTML("beforeend", `<p class="studio-identity-v200-note small">Paste a structured Genre DNA block here for the occasional listened genre that still needs identity data. Manual per-field editing has been hidden to keep Studio focused.</p>`);
    }
  }

  /* v201: Move legacy @tag import to the bottom of Studio, collapsed by default. */
  function moveLegacyTagImport(mount) {
    const hero = document.querySelector("#screen-review .review-hero");
    if (!hero || !mount || mount.dataset.legacyTagMovedV201 === "1") return;
    const pendingBtn = Array.from(hero.querySelectorAll("button")).find((btn) => /Import @tags|pending tag cleanup/i.test(btn.textContent || ""));
    if (!pendingBtn) return;
    mount.dataset.legacyTagMovedV201 = "1";
    pendingBtn.textContent = "Run legacy @tag import";
    const details = document.createElement("details");
    details.className = "studio-legacy-tag-import";
    details.innerHTML = `<summary><strong>Legacy / Advanced tools</strong><span>Old pasted @tag blocks only</span></summary><div class="studio-legacy-tag-import-body"><p class="small"><strong>Heads up:</strong> @tag import is kept only for older pasted Studio blocks. For everyday cleanup, use Routing Desk, Repair Bay, and QA Lab actions.</p></div>`;
    const body = details.querySelector(".studio-legacy-tag-import-body");
    body.appendChild(pendingBtn);
    const oldNote = hero.querySelector(".studio-retired-tag-route-note");
    if (oldNote) body.appendChild(oldNote);
    mount.appendChild(details);
  }

  let lastMobileApplyAt = 0;
  function apply() {
    if (isApplying) return;
    const mount = document.getElementById("reviewContent");
    if (!mount) return;
    const now = Date.now();
    // v219 mobile stabilization: Studio wraps a large native Review DOM. On
    // phones, accidental double-applies during tab/navigation clicks made the
    // page feel frozen. Skip no-op wrapper passes that happen back-to-back.
    if (isMobileStudioPerfMode() && mount.classList.contains("studio-workbench") && (now - lastMobileApplyAt) < 450) return;
    lastMobileApplyAt = now;
    isApplying = true;
    try {
      if (!mount.classList.contains("studio-workbench"))
        mount.classList.add("studio-workbench");
      const s = stats();
      clarifyNativeStudioLabels(mount);
      decorateExistingReviewSections(mount);
      annotatePendingQueueRows(mount);
      if (!$(".studio-workbench-hero", mount))
        mount.insertAdjacentHTML("afterbegin", renderHero(s) + renderToolbar());
      const oldIdentityQueue = $("#studio-identity-queue-lane", mount);
      if (oldIdentityQueue) oldIdentityQueue.remove();
      const oldIdentityCleanup = $("#studio-identity-cleanup-lane", mount);
      if (oldIdentityCleanup) oldIdentityCleanup.remove();
      tuneIdentityEditorForV200(mount);
      moveLegacyTagImport(mount);
      const routeLane = $("#studio-route-lane", mount) || $("#studio-inbox-lane", mount);
      if (routeLane) routeLane.insertAdjacentHTML("afterend", renderIdentityCleanupLane());
      else mount.insertAdjacentHTML("beforeend", renderIdentityCleanupLane());
      if (!$("#studio-repair-lane", mount))
        mount.insertAdjacentHTML("beforeend", renderRepairLane(s));
      if (!$("#studio-review-lane", mount))
        mount.insertAdjacentHTML("beforeend", renderReviewLane(s));
      enhanceSelects(mount);
      makeStudioSectionsCollapsible(mount);
      installInteractions(mount);
      filterStudioRows(mount);
      document.body.classList.add("studio-workbench-enabled");
    } finally {
      isApplying = false;
    }
  }

  function wrapRenderReview() {
    const original = window.renderReview;
    if (typeof original !== "function" || original.__studioWrapped)
      return false;
    function wrappedRenderReview() {
      // Do not rebuild Studio while the Song Inbox/editor is actively receiving keyboard paste.
      // Ctrl/Cmd+V fires before the textarea value changes; replacing the textarea in that
      // window makes the paste appear as a flash and then disappear. Context-menu paste did
      // not hit this path, which is why it worked before.
      if (isStudioTextEntryActive() || isInboxPasteGuardActive()) {
        const draft = captureInboxDraft();
        apply();
        restoreInboxDraft(draft);
        return null;
      }
      const draft = captureInboxDraft();
      const mount = document.getElementById("reviewContent");
      const sectionState = captureStudioSectionState(mount);
      if (mount) mount.classList.add("studio-rendering");
      const result = original.apply(this, arguments);
      const finishApply = () => {
        apply();
        restoreStudioSectionState(mount, sectionState);
        restoreInboxDraft(draft);
        if (mount) requestAnimationFrame(() => mount.classList.remove("studio-rendering"));
      };
      if (isMobileStudioPerfMode()) {
        // v219: let the Review/Pending list paint first on mobile, then install
        // the heavy Studio lanes in idle time instead of blocking the tap.
        deferStudioWork(finishApply);
      } else {
        finishApply();
      }
      return result;
    }
    wrappedRenderReview.__studioWrapped = true;
    window.__dgStudioRenderReviewWrapped = true;
    window.renderReview = wrappedRenderReview;
    return true;
  }


  function setStudioLibraryDirty() {
    try { libraryUpdatesPending = true; } catch (_) {}
    try { setUnsavedState(true); } catch (_) {}
    try { toggleLibrarySaveButton(true); } catch (_) {}
  }

  function canonicalSpotifyTrackUrl(url = "") {
    const raw = String(url || "").trim();
    if (typeof window.spotifyCanonicalTrackUrl === "function") return window.spotifyCanonicalTrackUrl(raw);
    const match = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/i) || raw.match(/spotify:track:([A-Za-z0-9]{22})/i) || raw.match(/^[A-Za-z0-9]{22}$/);
    const id = match ? (match[1] || match[0]) : "";
    return id ? `https://open.spotify.com/track/${id}` : raw;
  }

  function findRepairTargetSong(target) {
    const genre = getGenres().find((g) => String(g?.id ?? "") === String(target?.genreId ?? ""));
    if (!genre) return null;
    const songs = inflateSongs(genre.songs_listened || []);
    let found = null;
    const key = String(target?.key || "");
    const displayKey = String(target?.displayKey || "");
    const targetUrl = canonicalSpotifyTrackUrl(target?.url || "");
    const targetTitle = norm(target?.title || "");
    const targetArtist = norm(target?.artist || "");
    const visit = (song) => {
      if (!song || found) return;
      const keys = [songKey(song), repairDisplayKey(song)].filter(Boolean).map(String);
      const songUrl = canonicalSpotifyTrackUrl(song.spotifyUrl || song.url || "");
      const title = norm(song.title || song.name || "");
      const artist = norm(song.artist || (Array.isArray(song.artists) ? song.artists.join(" ") : ""));
      if ((key && keys.includes(key)) || (displayKey && keys.includes(displayKey)) || (targetUrl && songUrl && targetUrl === songUrl) || (targetTitle && targetArtist && title === targetTitle && artist === targetArtist)) found = song;
    };
    songs.forEach((song) => {
      visit(song);
      if (song?.levelUp) visit(song.levelUp);
    });
    return found ? { genre, songs, song: found } : null;
  }


  function classifyRepairUrl(rawUrl = "") {
    const raw = String(rawUrl || "").trim();
    if (/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[A-Za-z0-9]{22}/i.test(raw) || /^spotify:track:[A-Za-z0-9]{22}$/i.test(raw)) return "spotify";

    let parsed = null;
    try { parsed = new URL(raw); } catch (_) { return ""; }
    if (!/^https?:$/i.test(parsed.protocol)) return "";

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname || "";

    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
      return (/\/watch|\/shorts\/|\/embed\//i.test(path) || host === "youtu.be") ? "youtube" : "";
    }
    if (host === "music.apple.com" || host === "itunes.apple.com") return "apple";
    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com") || host === "on.soundcloud.com") return "soundcloud";
    if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) return "bandcamp";
    return "";
  }

  function extractYouTubeId(rawUrl = "") {
    const raw = String(rawUrl || "").trim();
    const match = raw.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i) || raw.match(/[?&]v=([A-Za-z0-9_-]{6,})/i) || raw.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i) || raw.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
    return match ? match[1] : "";
  }

  function youTubePlaceholderIcon() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#f4e4c6"/><rect x="18" y="28" width="60" height="40" rx="10" fill="#c4302b"/><path d="M43 38v20l18-10z" fill="#fff"/></svg>`);
  }

  async function fetchYouTubeRepairMetadata(rawUrl) {
    const id = extractYouTubeId(rawUrl);
    const metadata = { source: "youtube", url: rawUrl, artwork: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : youTubePlaceholderIcon(), albumArt: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : youTubePlaceholderIcon() };
    try {
      const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`;
      const response = await fetch(endpoint);
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

  function extractAppleMusicId(rawUrl = "") {
    const raw = String(rawUrl || "");
    const iMatch = raw.match(/[?&]i=(\d+)/);
    if (iMatch) return iMatch[1];
    const matches = Array.from(raw.matchAll(/\/(\d{6,})(?:[/?#]|$)/g)).map((m) => m[1]);
    return matches.length ? matches[matches.length - 1] : "";
  }

  async function fetchAppleMusicRepairMetadata(rawUrl) {
    const id = extractAppleMusicId(rawUrl);
    const metadata = { source: "apple", url: rawUrl };
    if (!id) return metadata;
    try {
      const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`);
      if (response.ok) {
        const data = await response.json();
        const item = Array.isArray(data?.results) ? (data.results.find((r) => r.wrapperType === "track") || data.results[0]) : null;
        if (item) {
          metadata.title = item.trackName || item.collectionName || "";
          metadata.artist = item.artistName || "";
          metadata.album = item.collectionName || "";
          metadata.artwork = String(item.artworkUrl100 || "").replace(/100x100bb\./, "600x600bb.");
          metadata.albumArt = metadata.artwork;
          metadata.releaseDate = item.releaseDate || "";
          metadata.releaseYear = item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) || null : null;
          metadata.durationMs = Number(item.trackTimeMillis || 0) || null;
        }
      }
    } catch (_) {}
    return metadata;
  }

  async function fetchSoundCloudRepairMetadata(rawUrl) {
    const endpoint = `https://soundcloud.com/oembed?format=json&maxheight=450&url=${encodeURIComponent(rawUrl)}`;
    const response = await fetch(endpoint, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`SoundCloud metadata lookup returned ${response.status}.`);
    const data = await response.json();
    const title = String(data?.title || "").trim();
    const artist = String(data?.author_name || "").trim();
    const artwork = String(data?.thumbnail_url || "").trim();
    if (!title && !artist && !artwork) throw new Error("SoundCloud did not return track metadata for that URL.");
    return { source: "soundcloud", url: rawUrl, title, artist, artists: artist ? [artist] : [], artwork, albumArt: artwork };
  }

  async function fetchExternalRepairMetadata(rawUrl) {
    const kind = classifyRepairUrl(rawUrl);
    if (kind === "youtube") return fetchYouTubeRepairMetadata(rawUrl);
    if (kind === "apple") return fetchAppleMusicRepairMetadata(rawUrl);
    if (kind === "soundcloud") return fetchSoundCloudRepairMetadata(rawUrl);
    if (kind === "bandcamp") return { source: "bandcamp", url: rawUrl };
    throw new Error("Use a valid Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track URL.");
  }

  function applyExternalRepairMetadata(song, rawUrl, metadata = {}) {
    const kind = classifyRepairUrl(rawUrl);
    song.url = rawUrl;
    song.spotifyUrl = "";
    song.spotifyId = "";
    song.spotifyMetadataFetched = false;
    song.spotifyMetadataFetchedAt = "";
    song.isrc = "";
    song.album = "";
    song.artwork = "";
    song.albumArt = "";
    song.releaseDate = "";
    song.releaseYear = null;
    song.releasePrecision = "";
    song.releaseSource = "";
    song.durationMs = null;
    song.source = metadata.source || kind;
    if (metadata.title) song.title = metadata.title;
    if (metadata.artist) {
      song.artist = metadata.artist;
      song.artists = [metadata.artist].filter(Boolean);
    }
    if (metadata.album) song.album = metadata.album;
    if (metadata.artwork) {
      song.artwork = metadata.artwork;
      song.albumArt = metadata.albumArt || metadata.artwork;
    }
    if (metadata.releaseDate) song.releaseDate = metadata.releaseDate;
    if (metadata.releaseYear) song.releaseYear = metadata.releaseYear;
    if (metadata.durationMs) song.durationMs = metadata.durationMs;
    song.externalMetadataFetched = !!(metadata.title || metadata.artist || metadata.artwork || metadata.album);
    song.externalMetadataFetchedAt = song.externalMetadataFetched ? new Date().toISOString() : "";
  }

  function repairTextSimilarity(a = "", b = "") {
    const tokens = (value) => String(value || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !["the", "a", "an", "el", "la", "los", "las", "le", "les", "un", "una", "feat", "ft", "official", "video", "audio"].includes(token));
    const left = tokens(a);
    const right = tokens(b);
    if (!left.length && !right.length) return 1;
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    const overlap = left.filter((token) => rightSet.has(token)).length;
    return overlap / Math.max(left.length, right.length);
  }

  function repairArtistName(value) {
    if (Array.isArray(value?.artists)) return value.artists.filter(Boolean).join(" ");
    return String(value?.artist || value?.author || value?.artistName || "");
  }

  function repairTitleName(value) {
    return String(value?.title || value?.trackName || value?.name || "");
  }

  function repairMetadataLooksClose(oldSong, newMetadata) {
    if (!oldSong || !newMetadata) return true;
    const oldTitle = repairTitleName(oldSong);
    const oldArtist = repairArtistName(oldSong);
    const newTitle = repairTitleName(newMetadata);
    const newArtist = repairArtistName(newMetadata);
    if (!oldTitle.trim() && !oldArtist.trim()) return true;
    if (!newTitle.trim() && !newArtist.trim()) return true;
    const titleScore = repairTextSimilarity(oldTitle, newTitle);
    const artistScore = repairTextSimilarity(oldArtist, newArtist);
    return titleScore >= 0.45 && (artistScore >= 0.35 || !oldArtist.trim() || !newArtist.trim());
  }

  function repairDisplayLabel(songLike, fallback = "this repair row") {
    const title = repairTitleName(songLike).trim();
    const artist = repairArtistName(songLike).trim();
    if (artist && title) return `${artist} — ${title}`;
    return title || artist || fallback;
  }

  function repairSourceLabel(kind = "") {
    if (kind === "spotify") return "Spotify";
    if (kind === "youtube") return "YouTube";
    if (kind === "apple") return "Apple Music";
    return "linked";
  }

  function confirmStudioRepairUrlOverwrite(oldSong, newMetadata, kind = "") {
    if (repairMetadataLooksClose(oldSong, newMetadata)) return true;
    const currentLabel = repairDisplayLabel(oldSong, "this repair row");
    const resultLabel = repairDisplayLabel(newMetadata, `the ${repairSourceLabel(kind)} track`);
    return window.confirm(`This ${repairSourceLabel(kind)} result does not look like a close match.

Current repair row: ${currentLabel}
${repairSourceLabel(kind)} result: ${resultLabel}

Overwrite the selected repair row anyway? This will replace its title, artist, artwork, URL, and metadata without creating a new row.`);
  }

  async function applyRepairUrlTarget(target, inputId) {
    const input = document.getElementById(inputId);
    const rawUrl = String(input?.value || "").trim();
    const manualTitle = clean(String(document.getElementById(`${inputId}_title`)?.value || "")).trim();
    const manualArtist = clean(String(document.getElementById(`${inputId}_artist`)?.value || "")).trim();
    if (!rawUrl) return { ok: false, error: "Paste a Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp URL first." };
    const kind = classifyRepairUrl(rawUrl);
    if (!kind) return { ok: false, error: "Use a valid Spotify, YouTube, Apple Music, SoundCloud, or Bandcamp track URL." };
    // v196: Repair Bay rows can become stale after the first URL apply because the
    // song identity key changes from the old missing-metadata row to the repaired
    // YouTube/Apple/Spotify row. If the user then edits title/artist overrides and
    // clicks Apply again, find by the current URL and/or typed override fields before
    // giving up. This lets Apply URL / Overrides behave like a save action.
    let located = findRepairTargetSong(target);
    if (!located) {
      located = findRepairTargetSong({
        ...target,
        url: rawUrl,
        title: manualTitle || target?.title || "",
        artist: manualArtist || target?.artist || "",
      });
    }
    if (!located) return { ok: false, error: "Could not find that track in the current library rows." };


    const canonical = kind === "spotify" ? canonicalSpotifyTrackUrl(rawUrl) : rawUrl;
    const oldSong = {
      title: located.song.title || located.song.name || target?.title || "",
      artist: located.song.artist || (Array.isArray(located.song.artists) ? located.song.artists.join(" ") : "") || target?.artist || "",
      artists: Array.isArray(located.song.artists) ? located.song.artists.slice() : [],
    };

    let refreshed = false;
    let refreshError = "";
    if (kind !== "spotify") {
      const metadata = await fetchExternalRepairMetadata(canonical);
      const proposedExternal = {
        ...metadata,
        title: manualTitle || metadata.title || (kind === "bandcamp" ? oldSong.title : ""),
        artist: manualArtist || metadata.artist || (kind === "bandcamp" ? oldSong.artist : ""),
      };
      const hasLookupIdentity = !!(proposedExternal.title || proposedExternal.artist);
      if (!manualTitle && !manualArtist && hasLookupIdentity && !confirmStudioRepairUrlOverwrite(oldSong, metadata, kind)) {
        return { ok: false, cancelled: true, error: "Apply cancelled." };
      }
      applyExternalRepairMetadata(located.song, canonical, proposedExternal);
      refreshed = !!(metadata.artwork || metadata.title || metadata.artist || metadata.album || metadata.releaseYear || metadata.releaseDate);
      if (!metadata.artwork && kind === "youtube") {
        located.song.artwork = youTubePlaceholderIcon();
        located.song.albumArt = located.song.artwork;
        refreshed = true;
      }
    } else if (/open\.spotify\.com\/track\//i.test(canonical) && typeof fetchSpotifyTrackResult === "function") {
      const result = await fetchSpotifyTrackResult(canonical, true);
      if (result?.ok && result.track) {
        if (!confirmStudioRepairUrlOverwrite(oldSong, result.track, kind)) {
          return { ok: false, cancelled: true, error: "Apply cancelled." };
        }
        located.song.url = canonical;
        located.song.spotifyUrl = result.track.spotifyUrl || canonical;
        if (typeof applyOfficialSpotifyMetadata === "function") applyOfficialSpotifyMetadata(located.song, result.track);
        Object.assign(located.song, {
          spotifyId: result.track.spotifyId || located.song.spotifyId || "",
          spotifyUrl: result.track.spotifyUrl || canonical,
          title: result.track.title || located.song.title || "",
          artist: result.track.artist || located.song.artist || "",
          artists: Array.isArray(result.track.artists) ? result.track.artists.filter(Boolean) : (located.song.artists || []),
          album: result.track.album || located.song.album || "",
          artwork: result.track.artwork || located.song.artwork || located.song.albumArt || "",
          albumArt: result.track.artwork || located.song.albumArt || located.song.artwork || "",
          releaseDate: result.track.releaseDate || located.song.releaseDate || "",
          releaseYear: result.track.releaseYear || located.song.releaseYear || null,
          durationMs: Number(result.track.durationMs || 0) || located.song.durationMs || null,
          isrc: result.track.isrc || located.song.isrc || "",
          source: "spotify",
          spotifyMetadataFetched: true,
          spotifyMetadataFetchedAt: new Date().toISOString(),
        });
        refreshed = true;
      } else {
        located.song.url = canonical;
        located.song.spotifyUrl = /open\.spotify\.com\/track\//i.test(canonical) ? canonical : (located.song.spotifyUrl || "");
        refreshError = result?.error || "Spotify lookup did not return metadata.";
      }
    } else {
      located.song.url = canonical;
      located.song.spotifyUrl = /open\.spotify\.com\/track\//i.test(canonical) ? canonical : (located.song.spotifyUrl || "");
    }

    if (manualTitle) located.song.title = manualTitle;
    if (manualArtist) {
      located.song.artist = manualArtist;
      located.song.artists = [manualArtist];
    } else if (located.song.artist && (!Array.isArray(located.song.artists) || !located.song.artists.length)) {
      located.song.artists = [located.song.artist];
    }

    located.genre.songs_listened = located.songs;
    setStudioLibraryDirty();
    return { ok: true, key: songKey(located.song), song: located.song, genre: located.genre, refreshed, refreshError };
  }

  window.updateStudioRepairUrlTarget = async function updateStudioRepairUrlTarget(target, inputId) {
    return applyRepairUrlTarget(target, inputId);
  };

  async function updateStudioRepairGroupUrlFromQueue(encodedTargetsJson, inputId, button) {
    let targets = [];
    try {
      targets = JSON.parse(decodeURIComponent(String(encodedTargetsJson || "[]")));
    } catch (_) {
      targets = [];
    }
    const unique = [];
    const seen = new Set();
    targets.forEach((target) => {
      const genreId = String(target?.genreId ?? "");
      const key = String(target?.key ?? "");
      const displayKey = String(target?.displayKey ?? "");
      const title = String(target?.title ?? "");
      const artist = String(target?.artist ?? "");
      const id = `${genreId}::${key || displayKey || `${artist}::${title}`}`;
      if (!genreId || seen.has(id)) return;
      seen.add(id);
      unique.push({ ...target, genreId, key });
    });
    if (!unique.length) {
      toast("Could not find matching repair rows. Refresh Studio and try again.", true);
      return;
    }

    const originalText = button?.textContent || "Apply URL";
    const rowForStatus = button?.closest?.(".studio-mini-row-repair");
    const statusEl = rowForStatus?.querySelector?.("[data-studio-repair-status]");
    const setStatus = (copy, isErr = false) => { if (statusEl) { statusEl.textContent = copy || ""; statusEl.classList.toggle("is-error", !!isErr); } };
    const setBusy = (copy) => {
      if (!button) return;
      button.disabled = true;
      button.classList.add("is-saving");
      button.textContent = copy;
    };
    const clearBusy = () => {
      if (!button || !document.body.contains(button)) return;
      button.disabled = false;
      button.classList.remove("is-saving");
      button.textContent = originalText;
    };

    let updated = 0;
    let cancelled = 0;
    const resolved = [];
    try {
      setStatus("Applying URL and checking artwork/metadata…");
      setBusy(unique.length > 1 ? `Applying 1/${unique.length}…` : "Applying…");
      for (let idx = 0; idx < unique.length; idx += 1) {
        const target = unique[idx];
        if (idx > 0) setBusy(`Applying ${idx + 1}/${unique.length}…`);
        let result = null;
        if (typeof window.updateStudioRepairUrlTarget === "function") {
          result = await window.updateStudioRepairUrlTarget(target, inputId, idx === 0 ? button : null, "review");
        } else if (typeof window.updateMetadataTrackUrlFromQueue === "function" && target.key) {
          result = await window.updateMetadataTrackUrlFromQueue(
            encodeURIComponent(target.genreId),
            encodeURIComponent(target.key),
            inputId,
            idx === 0 ? button : null,
            "review",
          );
        }
        if (result?.cancelled) {
          cancelled += 1;
          break;
        }
        if (result?.ok !== false) {
          updated += 1;
          resolved.push({ ...target, key: result?.key || target.key, song: result?.song || null, genre: result?.genre || null });
        }
      }
      if (!updated) {
        if (cancelled) {
          setStatus("Apply cancelled — no repair rows changed.", false);
          toast("Apply cancelled. The repair row was left unchanged.", false);
        } else {
          setStatus("No matching row was updated.", true);
          toast("Could not find matching repair rows. The row may be stale; open the genre once or use the Metadata Queue delete/open tools.", true);
        }
        return;
      }
      const rowEl = button?.closest?.(".studio-mini-row-repair");
      const metaEl = rowEl?.querySelector?.(".studio-mini-meta");
      if (metaEl) {
        const existing = metaEl.querySelector(".studio-inline-group-updated-chip");
        const label = `applied ${updated} ${updated === 1 ? "copy" : "copies"} · save pending`;
        if (existing) existing.textContent = label;
        else metaEl.insertAdjacentHTML("afterbegin", `<span class="studio-inline-group-updated-chip">${esc(label)}</span>`);
      }
      const primaryUpdate = resolved.find((item) => item.song) || null;
      const updatedSong = primaryUpdate?.song || null;
      const rowElVisible = button?.closest?.(".studio-mini-row-repair");
      if (updatedSong && rowElVisible) {
        const titleEl = rowElVisible.querySelector(".studio-mini-title");
        const href = spotifyUrl(updatedSong);
        const titleText = songTitle(updatedSong);
        if (titleEl) titleEl.innerHTML = href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(titleText)}</a>` : esc(titleText);
        updateRepairRowThumbnail(rowElVisible, updatedSong);
        if (metaEl) {
          const info = [];
          if (updatedSong.artist) info.push(updatedSong.artist);
          if (updatedSong.year) info.push(updatedSong.year);
          if (updatedSong.album) info.push(updatedSong.album);
          if (info.length) {
            const oldInfo = metaEl.querySelector(".studio-inline-updated-info-chip");
            const text = `now: ${info.slice(0, 3).join(" · ")}`;
            if (oldInfo) oldInfo.textContent = text;
            else metaEl.insertAdjacentHTML("beforeend", `<span class="studio-inline-updated-info-chip">${esc(text)}</span>`);
          }
        }
      }
      const remainingKinds = Array.from(new Set(resolved.flatMap((target) => {
        const song = findSongByGenreAndKey(target.genreId, target.key);
        return song ? missingKinds(song) : [];
      })));
      const rowElForChips = button?.closest?.(".studio-mini-row-repair");
      updateRepairMetaChips(rowElForChips?.querySelector?.(".studio-mini-meta"), remainingKinds);
      if (rowElForChips && !remainingKinds.length) {
        rowElForChips.classList.add("studio-repair-resolved");
        const meta = rowElForChips.querySelector(".studio-mini-meta");
        if (meta && !meta.querySelector(".studio-repair-resolved-chip")) {
          meta.insertAdjacentHTML("afterbegin", '<span class="studio-repair-resolved-chip">resolved · refresh list to remove</span>');
        }
      }
      // v178: remember the original repair keys that were successfully handled so Refresh Repair List
      // does not keep a stale/sticky first row pinned at the top until the user presses Skip.
      resolved.forEach((item) => {
        markRepairResolved(item.displayKey || item.key || repairSkipKey(item.song));
      });
      const refreshedCount = resolved.filter((item) => item.song && (item.song.artwork || item.song.albumArt)).length;
      setStatus(refreshedCount ? `Applied URL / overrides · artwork found for ${refreshedCount} ${refreshedCount === 1 ? "track" : "tracks"}. Save cleanup to persist.` : "Applied URL / overrides. Save cleanup to persist.", false);
      if (updated > 1) toast(`Applied URL to ${updated} matching copies — Save cleanup to persist.`, false);
      else toast("URL / overrides applied — Save cleanup to persist.", false);
    } catch (err) {
      console.error("Repair Bay apply failed", err);
      setStatus(`Apply failed: ${err?.message || err || "Unknown error"}`, true);
      toast("Repair Bay update failed. Check the row message and try again.", true);
    } finally {
      clearBusy();
    }
  }


  function hardDeleteStudioRepairGroup(encodedTargetsJson, button = null) {
    let targets = [];
    try {
      targets = JSON.parse(decodeURIComponent(String(encodedTargetsJson || "[]")));
    } catch (_) {
      targets = [];
    }
    const unique = [];
    const seen = new Set();
    targets.forEach((target) => {
      const id = `${target?.genreId || ""}::${target?.key || target?.displayKey || target?.url || target?.title || ""}`;
      if (!id || seen.has(id)) return;
      seen.add(id);
      unique.push(target);
    });
    if (!unique.length) {
      toast("Could not identify that track for Delete everywhere.", true);
      return;
    }
    const label = unique[0]?.artist || unique[0]?.title
      ? `${unique[0]?.artist ? `${unique[0].artist} — ` : ""}${unique[0]?.title || "this track"}`
      : "this track";
    const copyCount = unique.length > 1 ? ` and ${unique.length - 1} matching ${unique.length === 2 ? "copy" : "copies"}` : "";
    if (!window.confirm(`Delete ${label}${copyCount} everywhere?

This removes it from every genre queue and pending list. It becomes permanent after Save Library Updates.`)) return;
    const previous = button?.textContent || "Delete everywhere";
    if (button) {
      button.disabled = true;
      button.textContent = "Deleting…";
    }
    try {
      if (typeof window.hardDeleteSongEverywhere !== "function") {
        toast("Delete everywhere helper is not available. Refresh and try again.", true);
        return;
      }
      const result = window.hardDeleteSongEverywhere(unique, { renderStudio: false });
      if (!result?.deleted) {
        toast("No matching songs were found to delete.", true);
        return;
      }
      unique.forEach((target) => markRepairResolved(target.displayKey || target.key || target.url || target.title || ""));
      const row = button?.closest?.(".studio-mini-row-repair");
      if (row) {
        row.classList.add("studio-repair-resolved");
        row.style.opacity = "0.55";
        const meta = row.querySelector(".studio-mini-meta");
        if (meta && !meta.querySelector(".studio-repair-resolved-chip")) {
          meta.insertAdjacentHTML("afterbegin", '<span class="studio-repair-resolved-chip">deleted everywhere · save pending</span>');
        }
      }
      toast(`Deleted ${result.deleted} ${result.deleted === 1 ? "track" : "tracks"} everywhere from ${result.genresTouched} ${result.genresTouched === 1 ? "genre" : "genres"} — Save Library Updates to persist.`, false);
      setTimeout(() => refreshStudioRepairList(null), 180);
    } catch (error) {
      console.error("Studio delete everywhere failed", error);
      toast(`Delete everywhere failed: ${error?.message || error || "Unknown error"}`, true);
    } finally {
      if (button && document.body.contains(button)) {
        button.disabled = false;
        button.textContent = previous;
      }
    }
  }

  window.hardDeleteStudioRepairGroup = hardDeleteStudioRepairGroup;

  function skipStudioRepairRow(encodedKey, button = null) {
    let key = "";
    try { key = decodeURIComponent(String(encodedKey || "")); } catch (_) { key = String(encodedKey || ""); }
    if (!key) {
      toast("Could not identify that repair row.", true);
      return;
    }
    markRepairSkipped(key);
    const row = button?.closest?.(".studio-mini-row-repair");
    if (row) {
      row.classList.add("studio-repair-skipped-now");
      row.style.opacity = "0.64";
    }
    toast("Skipped for now — it will move to the bottom of the Repair Bay list.", false);
    setTimeout(() => refreshStudioRepairList(null), 120);
  }

  window.skipStudioRepairRow = skipStudioRepairRow;

  function refreshStudioRepairList(button = null) {
    const original = button?.textContent || "Refresh repair list";
    if (button) {
      button.disabled = true;
      button.textContent = "Refreshing…";
    }
    const restore = typeof preserveScrollSnapshot === "function" ? preserveScrollSnapshot() : null;
    try {
      if (typeof renderReview === "function") renderReview();
      setTimeout(() => {
        // v178: re-check the repair list without moving the user's scroll position.
        if (restore) restore();
      }, 0);
    } finally {
      setTimeout(() => {
        if (button && document.body.contains(button)) {
          button.disabled = false;
          button.textContent = original;
        }
      }, 120);
    }
  }

  window.refreshStudioRepairList = refreshStudioRepairList;


  /* Daily Genre v209: album repair URL applies artwork/metadata and updates thumbnails. */
  function spotifyAlbumIdFromUrl(rawUrl = "") {
    const raw = String(rawUrl || "").trim();
    const uri = raw.match(/spotify:album:([A-Za-z0-9]{22})/i);
    if (uri) return uri[1];
    const web = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/([A-Za-z0-9]{22})/i);
    return web ? web[1] : "";
  }

  function appleAlbumIdFromUrl(rawUrl = "") {
    const raw = String(rawUrl || "");
    const matches = Array.from(raw.matchAll(/\/(\d{6,})(?:[/?#]|$)/g)).map((m) => m[1]);
    return matches.length ? matches[matches.length - 1] : "";
  }

  async function fetchAlbumRepairMetadata(rawUrl = "") {
    const url = String(rawUrl || "").trim();
    const metadata = { url, source: "album-url", album: "", artist: "", artwork: "", releaseDate: "", releaseYear: null };
    if (!url) return metadata;
    if (/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\//i.test(url)) {
      metadata.source = "spotify";
      metadata.spotifyAlbumUrl = url;
      metadata.spotifyAlbumId = spotifyAlbumIdFromUrl(url);
      try {
        const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (data?.thumbnail_url) metadata.artwork = data.thumbnail_url;
          if (data?.title) {
            const title = String(data.title || "").trim();
            const by = title.match(/^(.+?)\s+by\s+(.+)$/i);
            if (by) { metadata.album = by[1].trim(); metadata.artist = by[2].trim(); }
            else metadata.album = title;
          }
        }
      } catch (_) {}
      return metadata;
    }
    if (/music\.apple\.com|itunes\.apple\.com/i.test(url)) {
      metadata.source = "apple";
      metadata.appleAlbumUrl = url;
      const id = appleAlbumIdFromUrl(url);
      if (id) {
        try {
          const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}`);
          if (response.ok) {
            const data = await response.json();
            const item = Array.isArray(data?.results) ? (data.results.find((r) => r.wrapperType === "collection") || data.results[0]) : null;
            if (item) {
              metadata.album = item.collectionName || metadata.album;
              metadata.artist = item.artistName || metadata.artist;
              metadata.artwork = String(item.artworkUrl100 || "").replace(/100x100bb\./, "600x600bb.");
              metadata.releaseDate = item.releaseDate || "";
              metadata.releaseYear = item.releaseDate ? Number(String(item.releaseDate).slice(0, 4)) || null : null;
            }
          }
        } catch (_) {}
      }
      return metadata;
    }
    if (/(youtube\.com|youtu\.be)/i.test(url)) {
      const id = extractYouTubeId(url);
      metadata.source = "youtube";
      metadata.artwork = id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
      try {
        const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          if (data?.thumbnail_url) metadata.artwork = data.thumbnail_url;
          if (data?.title) metadata.album = data.title;
          if (data?.author_name) metadata.artist = data.author_name;
        }
      } catch (_) {}
    }
    return metadata;
  }

  function applyAlbumRepairMetadataToSlot(slot, rawUrl, metadata = {}) {
    if (!slot) return;
    const isSpotifyAlbum = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\//i.test(rawUrl);
    const isAppleAlbum = /music\.apple\.com|itunes\.apple\.com/i.test(rawUrl);

    // v287: keep every legacy URL alias in agreement. Metadata Cleanup previously
    // rediscovered repaired albums because slot.url was correct while spotifyUrl
    // still contained the original http://url.com placeholder.
    slot.albumProviderUrl = rawUrl;
    slot.url = rawUrl;
    slot.albumUrl = rawUrl;

    if (isSpotifyAlbum) {
      slot.spotifyAlbumUrl = rawUrl;
      slot.spotifyUrl = rawUrl;
      slot.spotifyAlbumId = metadata.spotifyAlbumId || spotifyAlbumIdFromUrl(rawUrl) || "";
      slot.appleAlbumUrl = "";
    } else if (isAppleAlbum) {
      slot.appleAlbumUrl = rawUrl;
      slot.spotifyAlbumUrl = "";
      slot.spotifyUrl = "";
      slot.spotifyAlbumId = "";
    } else {
      slot.spotifyAlbumUrl = "";
      slot.spotifyUrl = "";
      slot.spotifyAlbumId = "";
      slot.appleAlbumUrl = "";
    }

    if (metadata.album) { slot.album = metadata.album; slot.albumTitle = metadata.album; }
    if (metadata.artist) { slot.artist = metadata.artist; slot.albumArtist = metadata.artist; }
    if (metadata.artwork) {
      slot.albumArt = metadata.artwork;
      slot.manualAlbumArt = metadata.artwork;
      slot.artwork = metadata.artwork;
      slot.cover = metadata.artwork;
      slot.image = metadata.artwork;
    }
    if (metadata.releaseDate) { slot.releaseDate = metadata.releaseDate; slot.albumReleaseDate = metadata.releaseDate; }
    if (metadata.releaseYear) { slot.year = metadata.releaseYear; slot.releaseYear = metadata.releaseYear; slot.albumYear = metadata.releaseYear; }
    slot.needsMetadataRefresh = !metadata.artwork && !metadata.album && !metadata.artist && !metadata.releaseYear;
    slot.albumMetadataFetchedAt = new Date().toISOString();
  }

  function updateVisibleAlbumRepairThumb(form, metadata = {}) {
    const row = form?.closest?.(".studio-mini-row");
    if (!row || !metadata.artwork) return;
    const img = row.querySelector("img.studio-thumb, .studio-thumb img");
    if (img) { img.src = metadata.artwork; return; }
    const empty = row.querySelector(".studio-thumb-empty, .studio-thumb");
    if (empty) {
      empty.outerHTML = `<img class="studio-thumb" src="${esc(metadata.artwork)}" alt="Album art" loading="lazy">`;
    }
  }

  function studioAlbumMatchTokens(value = "") {
    const stop = new Set([
      "a", "an", "and", "at", "by", "deluxe", "edition", "expanded", "feat",
      "featuring", "from", "in", "live", "mix", "of", "official", "original",
      "remaster", "remastered", "special", "the", "version",
    ]);
    return norm(value)
      .split(" ")
      .filter((token) => token && token.length > 1 && !stop.has(token));
  }

  function studioAlbumNameSimilarity(expected = "", detected = "") {
    const a = studioAlbumMatchTokens(expected);
    const b = studioAlbumMatchTokens(detected);
    if (!a.length || !b.length) return null;
    const aSet = new Set(a);
    const bSet = new Set(b);
    let shared = 0;
    aSet.forEach((token) => {
      if (bSet.has(token)) shared += 1;
    });
    const containment = shared / Math.max(1, Math.min(aSet.size, bSet.size));
    const union = new Set([...aSet, ...bSet]).size;
    const jaccard = shared / Math.max(1, union);
    return Math.max(containment * 0.72 + jaccard * 0.28, 0);
  }

  function studioAlbumRepairMismatch(targetOrSlot = {}, metadata = {}) {
    const target = Array.isArray(targetOrSlot)
      ? ((targetOrSlot || []).find((item) => item && (item.title || item.artist)) || {})
      : (targetOrSlot || {});
    const expectedAlbum = clean(
      target.album ||
      target.albumTitle ||
      target.title ||
      ""
    );
    const expectedArtist = clean(
      target.artist ||
      target.albumArtist ||
      ""
    );
    const detectedAlbum = clean(metadata.album || "");
    const detectedArtist = clean(metadata.artist || "");
    const albumScore = studioAlbumNameSimilarity(expectedAlbum, detectedAlbum);
    const artistScore = studioAlbumNameSimilarity(expectedArtist, detectedArtist);
    const reasons = [];

    const strongAlbumMatch = albumScore !== null && albumScore >= 0.82;
    const strongArtistMatch = artistScore !== null && artistScore >= 0.72;

    if (expectedAlbum && !detectedAlbum) {
      reasons.push("album title could not be verified");
    } else if (albumScore !== null && albumScore < 0.58) {
      reasons.push("album title");
    }

    // A strongly matching album title is enough to accept providers that return
    // album identity but omit the artist in oEmbed/preview metadata. Only warn
    // about an unavailable artist when the album evidence is also weak.
    if (expectedArtist && !detectedArtist) {
      if (!strongAlbumMatch) reasons.push("artist could not be verified");
    } else if (artistScore !== null && artistScore < 0.48) {
      if (!strongAlbumMatch || !strongArtistMatch) reasons.push("artist");
    }

    if (!expectedAlbum && !expectedArtist) reasons.push("existing album identity is incomplete");
    if (!detectedAlbum && !detectedArtist) reasons.push("submitted URL metadata could not be verified");

    return {
      suspicious: reasons.length > 0,
      reasons,
      expectedAlbum,
      expectedArtist,
      detectedAlbum,
      detectedArtist,
      albumScore,
      artistScore,
    };
  }

  function confirmStudioAlbumRepairMismatch(match, rawUrl) {
    if (!match?.suspicious) return true;
    const expected = [
      match.expectedArtist,
      match.expectedAlbum,
    ].filter(Boolean).join(" — ") || "Unknown current album";
    const detected = [
      match.detectedArtist,
      match.detectedAlbum,
    ].filter(Boolean).join(" — ") || "No recognizable album metadata";
    const reason = match.reasons.join("; ");

    return window.confirm(
      `Studio could not confidently verify this album URL against the existing Album Dive entry.\n\n` +
      `Current entry:\n${expected}\n\n` +
      `URL appears to be:\n${detected}\n\n` +
      `Possible mismatch: ${reason}.\n\n` +
      `Apply this URL anyway?\n\n${rawUrl}`
    );
  }

  async function updateStudioAlbumRepairUrlFromQueue(encodedTargets, inputId, btn) {
    const form = btn?.closest?.("[data-studio-album-repair-form]");
    const status = form?.querySelector?.("[data-studio-repair-status]");
    const input = document.getElementById(inputId);
    const rawUrl = clean(input?.value || "");
    if (!rawUrl) {
      if (status) status.textContent = "Paste an album URL first.";
      return toast("Paste an album URL first.", true);
    }
    const originalText = btn?.textContent || "Apply album URL";
    if (btn) { btn.disabled = true; btn.textContent = "Applying…"; }
    if (status) status.textContent = "Fetching album art/metadata…";
    let targets = [];
    try { targets = JSON.parse(decodeURIComponent(encodedTargets || "%5B%5D")); } catch (_) { targets = []; }
    let updated = 0;
    let metadata = {};
    try { metadata = await fetchAlbumRepairMetadata(rawUrl); } catch (_) { metadata = { url: rawUrl }; }

    const resolved = [];
    const resolvedSlots = new Set();
    targets.forEach((target) => {
      const genre = findGenreByIdOrName(target.genreId || target.genreName);
      if (!genre) return;
      const slots = albumDiveSlotsForGenre(genre);
      const wanted = norm(target.albumDiveSlotKey || target.title || "");
      const targetAlbum = norm(target.title || target.album || "");

      const primary = slots.find((candidate) => {
        return norm(candidate?.key || candidate?.id || candidate?.label || candidate?.album || candidate?.albumTitle || "") === wanted ||
          norm(candidate?.album || candidate?.albumTitle || "") === targetAlbum;
      }) || slots.find((candidate) => norm(candidate?.album || candidate?.albumTitle || "") === targetAlbum);

      if (!primary) return;

      const primaryAlbum = norm(primary?.album || primary?.albumTitle || target.title || "");
      const primaryArtist = norm(primary?.artist || primary?.albumArtist || target.artist || "");

      // v287: update every exact duplicate album slot in the same genre. The old
      // code used Array.find(), so only the first matching slot was repaired.
      const matchingSlots = slots.filter((candidate) => {
        const candidateAlbum = norm(candidate?.album || candidate?.albumTitle || "");
        const candidateArtist = norm(candidate?.artist || candidate?.albumArtist || "");
        if (!candidateAlbum || candidateAlbum !== primaryAlbum) return false;
        if (primaryArtist && candidateArtist) return candidateArtist === primaryArtist;
        return true;
      });

      (matchingSlots.length ? matchingSlots : [primary]).forEach((slot) => {
        if (resolvedSlots.has(slot)) return;
        resolvedSlots.add(slot);
        resolved.push({ genre, slot, target });
      });
    });

    const suspiciousMatches = resolved
      .map(({ slot }) => studioAlbumRepairMismatch(slot, metadata))
      .filter((match) => match.suspicious);

    if (suspiciousMatches.length) {
      if (status) status.textContent = "Album identity needs confirmation before applying…";
      const match = suspiciousMatches[0];
      if (!confirmStudioAlbumRepairMismatch(match, rawUrl)) {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
        if (status) status.textContent = "Album URL update cancelled — existing Album Dive entry was left unchanged.";
        return toast("Album URL update cancelled.", false);
      }
    }

    resolved.forEach(({ slot }) => {
      applyAlbumRepairMetadataToSlot(slot, rawUrl, metadata);
      updated += 1;
    });
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    if (!updated) {
      if (status) status.textContent = "No matching Album Dive slot was updated. Open the genre and check the album row.";
      return toast("No matching Album Dive slot was updated.", true);
    }
    updateVisibleAlbumRepairThumb(form, metadata);
    const foundArt = !!metadata.artwork;
    const foundMeta = !!(metadata.album || metadata.artist || metadata.releaseYear || metadata.releaseDate);
    markStudioLibraryDirty(`Applied album URL to ${updated} Album Dive row${updated === 1 ? "" : "s"}${foundArt ? " and updated artwork" : ""} — save cleanup to persist.`);
    if (status) status.textContent = foundArt || foundMeta ? "Album URL, art, and metadata applied — Save cleanup to persist." : "Album URL applied — Save cleanup to persist.";
    if (typeof renderReview === "function") setTimeout(() => renderReview(), foundArt ? 220 : 60);
  }

  window.updateStudioRepairGroupUrlFromQueue = updateStudioRepairGroupUrlFromQueue;
  window.updateStudioAlbumRepairUrlFromQueue = updateStudioAlbumRepairUrlFromQueue;


  // v137/v161: Repair Bay rows are clickable containers, so URL/edit controls must
  // never bubble into the row-level open-genre behavior. In capture phase, button
  // clicks must also run the apply action here; otherwise stopPropagation prevents
  // the inline onclick from ever reaching the target in some browsers.
  document.addEventListener("click", (event) => {
    const albumButton = event.target?.closest?.("[data-studio-album-repair-update]");
    if (albumButton) {
      event.preventDefault();
      event.stopPropagation();
      const form = albumButton.closest?.("[data-studio-album-repair-form]");
      const encodedTargets = form?.getAttribute?.("data-studio-repair-targets") || "";
      const inputId = form?.getAttribute?.("data-studio-repair-input") || "";
      updateStudioAlbumRepairUrlFromQueue(encodedTargets, inputId, albumButton);
      return;
    }
    const button = event.target?.closest?.("[data-studio-repair-update]");
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      const form = button.closest?.("[data-studio-repair-form]");
      const encodedTargets = form?.getAttribute?.("data-studio-repair-targets") || "";
      const inputId = form?.getAttribute?.("data-studio-repair-input") || "";
      updateStudioRepairGroupUrlFromQueue(encodedTargets, inputId, button);
      return;
    }
    const edit = event.target?.closest?.(".studio-inline-track-edit, [data-studio-repair-form], [data-studio-album-repair-form]");
    if (!edit) return;
    event.stopPropagation();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.closest?.(".studio-inline-track-edit, [data-studio-repair-form], [data-studio-repair-update]")) {
      event.stopPropagation();
    }
  }, true);
  document.addEventListener("submit", (event) => {
    if (event.target?.closest?.(".studio-inline-track-edit, [data-studio-repair-form]")) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function boot() {
    wrapRenderReview();
    if (document.getElementById("screen-review")?.classList.contains("active"))
      apply();
    ["click", "pointerdown", "mousedown"].forEach((eventName) => {
      document.addEventListener(eventName, (ev) => {
        if (ev.target.closest?.(".studio-inline-track-edit")) {
          ev.stopPropagation();
        }
      }, true);
    });
    document.addEventListener("submit", (ev) => {
      if (ev.target?.matches?.(".studio-inline-track-edit")) {
        ev.stopPropagation();
      }
    }, true);

    document.addEventListener(
      "click",
      (ev) => {
        if (ev.target.closest?.(".studio-inline-track-edit")) {
          ev.stopPropagation();
          return;
        }
        const reviewTab = ev.target.closest?.('[data-screen="review"]');
        if (reviewTab) {
          // v219: renderReview is already wrapped and will apply Studio once.
          // Avoid the old second immediate apply that made mobile tab switches
          // slow and sometimes interrupted taps/save prompts.
          if (window.__dgStudioRenderReviewWrapped) return;
          const mount = document.getElementById("reviewContent");
          if (mount) mount.classList.add("studio-rendering");
          deferStudioWork(() => {
            if (isStudioTextEntryActive() || isInboxPasteGuardActive()) return;
            apply();
            requestAnimationFrame(() => mount?.classList.remove("studio-rendering"));
          });
          return;
        }
        // Avoid re-applying Studio wrappers while a text field is being clicked/focused.
        // Replacing the Song Inbox textarea during the paste event caused the flash/lost paste bug.
        if (ev.target.closest?.("#screen-review") && isEditableStudioTarget(ev.target)) {
          armInboxPasteGuard(500);
          return;
        }
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (ev) => {
        if (!ev.target?.closest?.("#screen-review")) return;
        if (!isEditableStudioTarget(ev.target)) return;
        const key = String(ev.key || "").toLowerCase();
        if ((ev.metaKey || ev.ctrlKey) && (key === "v" || key === "x" || key === "a")) {
          armInboxPasteGuard(1200);
        }
      },
      true,
    );

    document.addEventListener(
      "paste",
      (ev) => {
        if (ev.target?.closest?.("#screen-review") && isEditableStudioTarget(ev.target))
          armInboxPasteGuard(1200);
      },
      true,
    );

    document.addEventListener(
      "input",
      (ev) => {
        if (ev.target?.closest?.("#screen-review") && isEditableStudioTarget(ev.target))
          armInboxPasteGuard(350);
      },
      true,
    );
  }

  window.DailyGenreStudioWorkbench = { apply, stats, version: VERSION };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  function injectV198DuplicateStyles() {
    if (document.getElementById("dg-v198-duplicate-routing-styles")) return;
    const style = document.createElement("style");
    style.id = "dg-v198-duplicate-routing-styles";
    style.textContent = `
      .studio-duplicate-list{display:grid;gap:10px;margin-top:12px;}
      .studio-duplicate-group{display:grid;gap:10px;padding:12px;border:1px solid rgba(120,74,27,.16);border-radius:18px;background:rgba(255,252,241,.58);}
      .studio-duplicate-head{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:10px;align-items:center;}
      .studio-duplicate-head h4{margin:0;font-size:1.02rem;line-height:1.08;letter-spacing:-.035em;}
      .studio-duplicate-head p{margin:4px 0 0;color:var(--muted,#735a3c);font-size:.84rem;line-height:1.3;}
      .studio-duplicate-instances{display:grid;gap:7px;}
      .studio-duplicate-instance{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 9px;border-radius:14px;background:rgba(255,248,229,.64);border:1px solid rgba(120,74,27,.12);}
      .studio-duplicate-instance div:first-child{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0;}
      .studio-duplicate-instance span,.studio-duplicate-levelup-chip{display:inline-flex;align-items:center;min-height:22px;padding:3px 7px;border-radius:999px;background:rgba(61,36,18,.08);border:1px solid rgba(120,74,27,.12);color:var(--muted,#735a3c);font-size:.76rem;font-weight:850;}
      .studio-duplicate-levelup-chip{color:#4a2e80;background:rgba(100,60,180,.1);border-color:rgba(100,60,180,.16);}
      .studio-duplicate-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;}
      .studio-duplicate-head-actions{display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:260px;justify-self:end;}
      .studio-duplicate-head-actions .btn{width:100%;min-height:42px;white-space:normal;line-height:1.12;}.studio-duplicate-head-actions .btn[disabled]{opacity:.68;cursor:not-allowed;transform:none;}
      .studio-copy-first25-btn{white-space:nowrap;}
      .studio-subsection-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 8px;}
      .studio-subsection-head h4{margin:0;}
      .studio-lane-counts .studio-copy-first25-btn{margin-left:4px;}
      @media(max-width:760px){.studio-duplicate-head,.studio-duplicate-instance{grid-template-columns:1fr}.studio-duplicate-actions{justify-content:flex-start}.studio-duplicate-head-actions{min-width:0;justify-self:stretch}.studio-subsection-head{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  injectV198DuplicateStyles();

})();
