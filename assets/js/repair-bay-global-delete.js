/* Daily Genre v294: Repair Bay scoped/global delete with undo */
(function () {
  "use strict";

  let undoState = null;

  const clean = (v) => String(v ?? "").trim();
  const norm = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  function getGenres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function esc(v) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(v);
    return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function toast(message, error = false) {
    if (typeof window.showSaveToast === "function") window.showSaveToast(message, error);
  }

  function inflate(raw) {
    try {
      if (typeof window.inflateSongsFromStorage === "function") return window.inflateSongsFromStorage(raw || []);
    } catch (_) {}
    return Array.isArray(raw) ? raw : [];
  }

  function spotifyId(value = "") {
    const raw = clean(value);
    const uri = raw.match(/spotify:(?:track|album):([A-Za-z0-9]{22})/i);
    if (uri) return uri[1];
    const web = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:track|album)\/([A-Za-z0-9]{22})/i);
    if (web) return web[1];
    return /^[A-Za-z0-9]{22}$/.test(raw) ? raw : "";
  }

  function songArtist(song) {
    return clean(song?.artist || song?.artistName || (Array.isArray(song?.artists) ? song.artists.join(", ") : ""));
  }

  function songTitle(song) {
    return clean(song?.title || song?.name);
  }

  function songUrl(song) {
    return clean(song?.spotifyUrl || song?.spotify_url || song?.url);
  }

  function songMatchKey(song) {
    const id = clean(song?.spotifyId) || spotifyId(songUrl(song));
    if (id) return `spotify:${id}`;
    if (clean(song?.isrc)) return `isrc:${clean(song.isrc).toUpperCase()}`;
    const artist = norm(songArtist(song));
    const title = norm(songTitle(song));
    return artist && title ? `artist-title:${artist}::${title}` : "";
  }

  function targetSongKey(target) {
    const id = clean(target?.spotifyId) || spotifyId(target?.url);
    if (id) return `spotify:${id}`;
    if (clean(target?.isrc)) return `isrc:${clean(target.isrc).toUpperCase()}`;
    const artist = norm(target?.artist);
    const title = norm(target?.title);
    return artist && title ? `artist-title:${artist}::${title}` : "";
  }

  function albumSlots(genre) {
    const dive = genre?.albumDive || genre?.album_dive || genre?.album_dive_data || null;
    if (Array.isArray(dive?.slots)) return { owner: dive, key: "slots", slots: dive.slots };
    if (Array.isArray(genre?.albumDiveSlots)) return { owner: genre, key: "albumDiveSlots", slots: genre.albumDiveSlots };
    return { owner: null, key: "", slots: [] };
  }

  function albumKey(slot) {
    const url = clean(slot?.albumProviderUrl || slot?.spotifyAlbumUrl || slot?.spotifyUrl || slot?.url);
    const id = spotifyId(url);
    if (id) return `spotify-album:${id}`;
    const artist = norm(slot?.artist || slot?.albumArtist);
    const title = norm(slot?.album || slot?.albumTitle || slot?.title);
    return artist && title ? `album:${artist}::${title}` : "";
  }

  function targetAlbumKey(target) {
    const id = spotifyId(target?.url);
    if (id) return `spotify-album:${id}`;
    const artist = norm(target?.artist);
    const title = norm(target?.title || target?.album);
    return artist && title ? `album:${artist}::${title}` : "";
  }

  function parseTargets(encoded) {
    try {
      const parsed = JSON.parse(decodeURIComponent(String(encoded || "[]")));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function cloneAffectedGenres(ids) {
    const wanted = new Set(ids.map(String));
    return getGenres()
      .filter(g => wanted.has(String(g?.id ?? "")))
      .map(g => ({ id: String(g.id ?? ""), snapshot: JSON.parse(JSON.stringify(g)) }));
  }

  function restoreSnapshot() {
    if (!undoState) return;
    const list = getGenres();
    undoState.snapshots.forEach(({ id, snapshot }) => {
      const index = list.findIndex(g => String(g?.id ?? "") === id);
      if (index >= 0) list[index] = snapshot;
    });
    undoState = null;
    markDirty("Deletion undone. Save cleanup if other edits remain.");
    renderUndoBar();
    refreshStudio();
  }

  function markDirty(message) {
    try { window.libraryUpdatesPending = true; } catch (_) {}
    try { window.__dgHasUnsavedChanges = true; } catch (_) {}
    const save = document.getElementById("saveBtn");
    if (save) save.dataset.dirty = "true";
    toast(message, false);
  }

  function refreshStudio() {
    if (typeof window.renderReview === "function") {
      setTimeout(() => window.renderReview(), 20);
    }
  }

  function renderUndoBar() {
    let bar = document.getElementById("studioGlobalDeleteUndo");
    if (!undoState) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "studioGlobalDeleteUndo";
      bar.className = "studio-global-delete-undo";
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${esc(undoState.message)}</span><button type="button" class="btn btn-secondary btn-tiny">Undo</button>`;
    bar.querySelector("button")?.addEventListener("click", restoreSnapshot);
  }

  function removeIdentitySongRefs(genre, key) {
    let removed = 0;
    const matches = obj => obj && songMatchKey(obj) === key;

    ["seminal_song", "media_touchstone"].forEach(field => {
      if (matches(genre?.[field])) { genre[field] = null; removed += 1; }
    });
    if (Array.isArray(genre?.media_touchstones)) {
      const before = genre.media_touchstones.length;
      genre.media_touchstones = genre.media_touchstones.filter(x => !matches(x));
      removed += before - genre.media_touchstones.length;
    }
    if (genre?.identity && typeof genre.identity === "object") {
      ["seminalTrack","seminal_track","mediaTouchstone","media_touchstone"].forEach(field => {
        if (matches(genre.identity[field])) { genre.identity[field] = null; removed += 1; }
      });
      ["mediaTouchstones","media_touchstones"].forEach(field => {
        if (Array.isArray(genre.identity[field])) {
          const before = genre.identity[field].length;
          genre.identity[field] = genre.identity[field].filter(x => !matches(x));
          removed += before - genre.identity[field].length;
        }
      });
    }

    const favoriteUrl = clean(genre?.favoritesongurl || genre?.favoriteSongUrl);
    const favoriteTitle = clean(genre?.favoritesong || genre?.favoriteSong);
    const favoriteArtist = clean(genre?.favoriteartist || genre?.favoriteArtist);
    const favoriteKey = songMatchKey({ url: favoriteUrl, title: favoriteTitle, artist: favoriteArtist });
    if (favoriteKey && favoriteKey === key) {
      ["favoritesong","favoriteSong","favoritesongurl","favoriteSongUrl","favoriteartist","favoriteArtist","favoritesongartwork"].forEach(field => {
        if (field in genre) genre[field] = "";
      });
      removed += 1;
    }
    return removed;
  }

  function impactForSong(key, scopeGenreId = "") {
    const genres = [];
    let occurrences = 0;
    let identityRefs = 0;
    getGenres().forEach(genre => {
      if (scopeGenreId && String(genre?.id ?? "") !== String(scopeGenreId)) return;
      let count = 0;
      inflate(genre?.songs_listened || []).forEach(song => { if (songMatchKey(song) === key) count += 1; });
      inflate(genre?.pending_songs || []).forEach(song => { if (songMatchKey(song) === key) count += 1; });
      const temp = JSON.parse(JSON.stringify(genre));
      const refs = removeIdentitySongRefs(temp, key);
      if (count || refs) {
        genres.push({ id: String(genre.id ?? ""), name: genre.genre || genre.name || "Unknown genre", count, refs });
        occurrences += count;
        identityRefs += refs;
      }
    });
    return { genres, occurrences, identityRefs };
  }

  function deleteSong(key, scopeGenreId = "") {
    const impact = impactForSong(key, scopeGenreId);
    if (!impact.genres.length) return { ...impact, removed: 0 };

    undoState = {
      snapshots: cloneAffectedGenres(impact.genres.map(x => x.id)),
      message: `${scopeGenreId ? "Genre removal" : "Global deletion"} staged for ${impact.occurrences + impact.identityRefs} reference${impact.occurrences + impact.identityRefs === 1 ? "" : "s"}.`,
    };

    let removed = 0;
    getGenres().forEach(genre => {
      if (scopeGenreId && String(genre?.id ?? "") !== String(scopeGenreId)) return;
      ["songs_listened","pending_songs"].forEach(field => {
        if (!Array.isArray(genre?.[field])) return;
        const before = genre[field].length;
        genre[field] = genre[field].filter(song => songMatchKey(song) !== key);
        removed += before - genre[field].length;
      });
      removed += removeIdentitySongRefs(genre, key);
    });

    renderUndoBar();
    markDirty(`Removed ${removed} matching song reference${removed === 1 ? "" : "s"} — Save cleanup to persist.`);
    refreshStudio();
    return { ...impact, removed };
  }

  function impactForAlbum(key, scopeGenreId = "") {
    const genres = [];
    let occurrences = 0;
    getGenres().forEach(genre => {
      if (scopeGenreId && String(genre?.id ?? "") !== String(scopeGenreId)) return;
      const matches = albumSlots(genre).slots.filter(slot => albumKey(slot) === key).length;
      if (matches) {
        genres.push({ id: String(genre.id ?? ""), name: genre.genre || genre.name || "Unknown genre", count: matches });
        occurrences += matches;
      }
    });
    return { genres, occurrences };
  }

  function deleteAlbum(key, scopeGenreId = "") {
    const impact = impactForAlbum(key, scopeGenreId);
    if (!impact.genres.length) return { ...impact, removed: 0 };

    undoState = {
      snapshots: cloneAffectedGenres(impact.genres.map(x => x.id)),
      message: `${scopeGenreId ? "Genre album removal" : "Global album deletion"} staged for ${impact.occurrences} Album Dive slot${impact.occurrences === 1 ? "" : "s"}.`,
    };

    let removed = 0;
    getGenres().forEach(genre => {
      if (scopeGenreId && String(genre?.id ?? "") !== String(scopeGenreId)) return;
      const ref = albumSlots(genre);
      if (!ref.owner) return;
      const before = ref.slots.length;
      ref.owner[ref.key] = ref.slots.filter(slot => albumKey(slot) !== key);
      removed += before - ref.owner[ref.key].length;
    });

    renderUndoBar();
    markDirty(`Removed ${removed} matching Album Dive slot${removed === 1 ? "" : "s"} — Save cleanup to persist.`);
    refreshStudio();
    return { ...impact, removed };
  }

  function confirmImpact(kind, impact, everywhere) {
    const names = impact.genres.map(x => `${x.name}${x.count ? ` (${x.count})` : ""}`).join("\n");
    const extra = kind === "song" && impact.identityRefs ? `\nIdentity/favorite references: ${impact.identityRefs}` : "";
    const label = kind === "album" ? "album" : "song";
    return window.confirm(
      `${everywhere ? "DELETE EVERYWHERE" : "REMOVE FROM THIS GENRE"}\n\n` +
      `This will stage removal of ${impact.occurrences} ${label} occurrence${impact.occurrences === 1 ? "" : "s"}${extra}.\n\n` +
      `Affected genres:\n${names || "None"}\n\n` +
      `Nothing is persisted until you click Save cleanup. An Undo button will remain available until another delete action.`
    );
  }

  function primaryTarget(targets) {
    return targets.find(t => t && (t.genreId || t.title || t.url)) || {};
  }

  window.hardDeleteStudioRepairGroup = function(encodedTargets, button) {
    const targets = parseTargets(encodedTargets);
    const target = primaryTarget(targets);
    const key = targetSongKey(target);
    if (!key) return toast("Could not identify this song safely enough to delete.", true);
    const impact = impactForSong(key);
    if (!impact.genres.length) return toast("No matching song references were found.", true);
    if (!confirmImpact("song", impact, true)) return;
    deleteSong(key);
  };

  window.removeStudioRepairGroupFromGenre = function(encodedTargets, button) {
    const targets = parseTargets(encodedTargets);
    const target = primaryTarget(targets);
    const key = targetSongKey(target);
    const genreId = clean(target?.genreId);
    if (!key || !genreId) return toast("Could not identify this genre/song pair safely.", true);
    const impact = impactForSong(key, genreId);
    if (!impact.genres.length) return toast("No matching song reference was found in this genre.", true);
    if (!confirmImpact("song", impact, false)) return;
    deleteSong(key, genreId);
  };

  window.hardDeleteStudioAlbumGroup = function(encodedTargets) {
    const targets = parseTargets(encodedTargets);
    const target = primaryTarget(targets);
    const key = targetAlbumKey(target);
    if (!key) return toast("Could not identify this album safely enough to delete.", true);
    const impact = impactForAlbum(key);
    if (!impact.genres.length) return toast("No matching Album Dive slots were found.", true);
    if (!confirmImpact("album", impact, true)) return;
    deleteAlbum(key);
  };

  window.removeStudioAlbumFromGenre = function(encodedTargets) {
    const targets = parseTargets(encodedTargets);
    const target = primaryTarget(targets);
    const key = targetAlbumKey(target);
    const genreId = clean(target?.genreId);
    if (!key || !genreId) return toast("Could not identify this genre/album pair safely.", true);
    const impact = impactForAlbum(key, genreId);
    if (!impact.genres.length) return toast("No matching Album Dive slot was found in this genre.", true);
    if (!confirmImpact("album", impact, false)) return;
    deleteAlbum(key, genreId);
  };

  function enhanceRows(root = document) {
    root.querySelectorAll(".studio-mini-row-repair").forEach(row => {
      const form = row.querySelector("[data-studio-repair-targets]");
      const encoded = form?.getAttribute("data-studio-repair-targets") || "";
      if (!encoded) return;
      const targets = parseTargets(encoded);
      const album = Boolean(targets[0]?.isAlbumRepair || row.querySelector("[data-studio-album-repair-form]"));
      const actions = row.querySelector(".studio-mini-actions");
      if (!actions) return;

      if (!actions.querySelector("[data-remove-local]")) {
        const local = document.createElement("button");
        local.type = "button";
        local.className = "btn btn-secondary btn-tiny studio-row-icon-btn";
        local.dataset.removeLocal = "1";
        local.textContent = "−";
        local.title = "Remove from this genre";
        local.setAttribute("aria-label", "Remove from this genre");
        local.addEventListener("click", e => {
          e.preventDefault(); e.stopPropagation();
          album ? window.removeStudioAlbumFromGenre(encoded, local) : window.removeStudioRepairGroupFromGenre(encoded, local);
        });
        actions.insertBefore(local, actions.firstChild);
      }

      if (album && !actions.querySelector("[data-delete-album-everywhere]")) {
        const global = document.createElement("button");
        global.type = "button";
        global.className = "btn btn-danger btn-tiny studio-hard-delete-btn studio-row-icon-btn";
        global.dataset.deleteAlbumEverywhere = "1";
        global.textContent = "×";
        global.title = "Delete everywhere";
        global.setAttribute("aria-label", "Delete everywhere");
        global.addEventListener("click", e => {
          e.preventDefault(); e.stopPropagation();
          window.hardDeleteStudioAlbumGroup(encoded, global);
        });
        actions.insertBefore(global, actions.querySelector("button:last-child"));
      }

      actions.querySelectorAll(".studio-hard-delete-btn").forEach(button => {
        button.classList.add("studio-row-icon-btn");
        button.textContent = "×";
        button.title = "Delete everywhere";
        button.setAttribute("aria-label", "Delete everywhere");
      });

      actions.querySelectorAll("button").forEach(button => {
        const label = (button.textContent || "").trim().toLowerCase();
        if (label === "open genre") {
          button.classList.add("studio-row-icon-btn");
          button.textContent = "↗";
          button.title = "Open genre";
          button.setAttribute("aria-label", "Open genre");
        }
      });
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) enhanceRows(node);
      });
    }
  });

  function boot() {
    enhanceRows();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();