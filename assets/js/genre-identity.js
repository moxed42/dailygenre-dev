/* Daily Genre Identity v1
   Adds genre aliases, seminal track, and media touchstones as genre-level curation fields.
   Add-on only: no app.js, genre loader, carousel, or save pipeline changes.
*/
(function () {
  "use strict";

  const VERSION = "4.4.0-identity-overwrite-v87";
  let lastListenGenre = null;
  let selectedGenreId = "";
  let applying = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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

  function toast(msg, err = false) {
    if (typeof window.showSaveToast === "function")
      window.showSaveToast(msg, !!err);
  }

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[‐‑‒–—―_/-]+/g, " ")
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function linkUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
  }

  function trackArtwork(track) {
    return linkUrl(
      track?.artwork ||
        track?.albumArt ||
        track?.album_art ||
        track?.image ||
        track?.imageUrl ||
        track?.cover ||
        track?.coverUrl ||
        "",
    );
  }

  function identityUrlLooksPlaceholder(url) {
    const value = String(url || "").trim();
    if (!value) return false;
    return /^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i.test(value);
  }

  function identityUsableTrackUrl(track) {
    const url = linkUrl(track?.spotifyUrl || track?.url || track?.spotify_url || "");
    return identityUrlLooksPlaceholder(url) ? "" : url;
  }

  function trackSpotifyUrl(track) {
    return identityUsableTrackUrl(track);
  }


  function aliasList(genre) {
    const vals = [];
    [
      genre?.aliases,
      genre?.synonyms,
      genre?.aka,
      genre?.alternateNames,
      genre?.alternate_names,
    ].forEach((field) => {
      if (Array.isArray(field)) vals.push(...field);
      else if (typeof field === "string") vals.push(...field.split(/[,;|\n]/g));
    });
    return [
      ...new Set(vals.map((x) => String(x || "").trim()).filter(Boolean)),
    ];
  }

  function implicitAliasList(genre) {
    const name = norm(genre?.genre || "");
    if (name === "hokkien pop") {
      return [
        "tai-pop",
        "tai pop",
        "taipop",
        "taiwanese pop",
        "taiwanese hokkien pop",
        "taiwanese language pop",
      ];
    }
    return [];
  }

  function searchAliasList(genre) {
    return [...new Set([...aliasList(genre), ...implicitAliasList(genre)])];
  }

  function stripIdentityReferences(value) {
    return String(value || "")
      .replace(/\s*\[(?:web|file):\d+\]\s*/gi, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function cleanAliasValue(value) {
    return stripIdentityReferences(value)
      .replace(/_/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function setAliases(genre, aliases) {
    const clean = [
      ...new Set(
        (aliases || []).map(cleanAliasValue).filter(Boolean),
      ),
    ];
    genre.aliases = clean;
    // Keep the existing Library add-on happy; it already knows about synonyms/aliases.
    genre.synonyms = clean;
  }

  function identity(genre) {
    if (!genre.identity || typeof genre.identity !== "object")
      genre.identity = {};
    if (
      !genre.identity.seminalTrack ||
      typeof genre.identity.seminalTrack !== "object"
    ) {
      genre.identity.seminalTrack = {};
    }
    if (!Array.isArray(genre.identity.mediaTouchstones))
      genre.identity.mediaTouchstones = [];

    if (genre.seminal_song && typeof genre.seminal_song === "object") {
      genre.identity.seminalTrack = {
        ...genre.seminal_song,
        ...genre.identity.seminalTrack,
      };
    }
    if (
      Array.isArray(genre.media_touchstones) &&
      !genre.identity.mediaTouchstones.length
    ) {
      genre.identity.mediaTouchstones = genre.media_touchstones.slice();
    }
    return genre.identity;
  }

  function getSeminal(genre) {
    const id = identity(genre);
    const flat =
      genre?.seminal_song && typeof genre.seminal_song === "object"
        ? genre.seminal_song
        : {};
    return { ...flat, ...(id.seminalTrack || {}) };
  }

  function getMedia(genre) {
    const id = identity(genre);
    const flat = Array.isArray(genre?.media_touchstones)
      ? genre.media_touchstones
      : [];
    const list = id.mediaTouchstones?.length ? id.mediaTouchstones : flat;
    return (Array.isArray(list) ? list : []).filter(
      (x) => x && typeof x === "object",
    );
  }

  function searchText(genre) {
    const sem = getSeminal(genre);
    const media = getMedia(genre);
    return norm(
      [
        genre?.genre,
        genre?.category_path,
        genre?.subcategory,
        genre?.subsubcategory,
        ...searchAliasList(genre),
        sem.title,
        sem.artist,
        ...media.flatMap((m) => [
          m.title,
          m.artist,
          m.mediaTitle,
          m.media,
          m.mediaType,
        ]),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  function markDirty() {
    try {
      eval("libraryUpdatesPending = true");
    } catch (_) {}
    try {
      if (typeof toggleLibrarySaveButton === "function")
        toggleLibrarySaveButton(true);
    } catch (_) {}
    try {
      if (typeof setUnsavedState === "function") setUnsavedState(true);
    } catch (_) {}
    document.body.classList.add("genre-identity-dirty");
  }

  function findGenre(id) {
    return genres().find((g) => String(g.id) === String(id));
  }

  function currentGenre() {
    const root = $("#listenDetails");
    const title =
      root
        ?.querySelector(
          ".detail-record-card h2, .detail-hero h2, .dc-genre-hero h2, .dc-hero-title",
        )
        ?.textContent?.trim() || "";
    if (
      lastListenGenre &&
      (!title || String(lastListenGenre.genre || "").trim() === title)
    )
      return lastListenGenre;
    try {
      // Some builds expose currentGenre globally; split builds usually do not.
      const g = eval("currentGenre");
      if (g && typeof g === "object") return g;
    } catch (_) {}
    return genres().find((g) => String(g.genre || "").trim() === title) || null;
  }

  function bestGenreMatch(query) {
    const q = norm(query);
    if (!q) return null;
    const rows = genres().map((g) => ({
      g,
      name: norm(g.genre || ""),
      aliases: aliasList(g).map(norm),
      search: searchText(g),
    }));
    return (
      rows.find((r) => r.name === q)?.g ||
      rows.find((r) => r.aliases.includes(q))?.g ||
      rows.find((r) => r.name.startsWith(q))?.g ||
      rows.find((r) => r.aliases.some((a) => a.startsWith(q)))?.g ||
      rows.find((r) => r.search.includes(q))?.g ||
      null
    );
  }

  function genreOptionsHtml() {
    return genres()
      .slice()
      .sort((a, b) =>
        String(a.genre || "").localeCompare(String(b.genre || "")),
      )
      .map((g) => {
        const also = aliasList(g).slice(0, 3).join(", ");
        const label = also ? `${g.genre} · aka ${also}` : g.genre;
        return `<option value="${esc(label)}" data-id="${esc(String(g.id ?? ""))}"></option>`;
      })
      .join("");
  }

  function trackLink(track, fallbackLabel = "Track") {
    const title = String(track?.title || track?.name || "").trim();
    const artist = String(track?.artist || "").trim();
    const label =
      [artist, title].filter(Boolean).join(" — ") || title || fallbackLabel;
    const url = linkUrl(track?.spotifyUrl || track?.url || track?.spotify_url);
    return url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
      : esc(label);
  }

  function genreNameLabel(genre) {
    return String(genre?.genre || "genre").trim();
  }

  function identityStatus(genre) {
    const aliases = aliasList(genre);
    const sem = getSeminal(genre);
    const media = getMedia(genre);
    const hasSem = !!(sem?.title || sem?.artist || sem?.spotifyUrl || sem?.url);
    const pieces = [];
    if (aliases.length)
      pieces.push(`${aliases.length} alias${aliases.length === 1 ? "" : "es"}`);
    if (hasSem) pieces.push("seminal track");
    if (media.length)
      pieces.push(
        `${media.length} media touchstone${media.length === 1 ? "" : "s"}`,
      );
    return pieces.join(" · ") || "No identity anchors yet";
  }

  function identityTrackCard(track, kind, extra = "") {
    const url = linkUrl(track?.spotifyUrl || track?.url || track?.spotify_url);
    const title = String(track?.title || track?.name || "").trim();
    const artist = String(track?.artist || "").trim();
    const label = [artist, title].filter(Boolean).join(" — ") || title || kind;
    const reason = String(track?.reason || "").trim();
    const mediaTitle = String(track?.mediaTitle || track?.media || "").trim();
    const mediaType = String(track?.mediaType || "").trim();
    const icon = kind === "Seminal track" ? "✦" : "▣";
    const copy =
      kind === "Seminal track"
        ? "Canonical anchor"
        : [mediaTitle ? `from ${mediaTitle}` : "Media touchstone", mediaType]
            .filter(Boolean)
            .join(" · ");
    const play = url && typeof spPlayBtn === "function"
      ? spPlayBtn({ url, spotifyUrl: url, title, artist, artwork: track?.artwork || track?.image || "" })
      : "";
    return `<article class="genre-identity-track-card ${kind === "Seminal track" ? "is-seminal" : "is-media"}">
      <div class="genre-identity-track-icon" aria-hidden="true">${esc(icon)}</div>
      <div class="genre-identity-track-main">
        <div class="genre-identity-track-kicker">${esc(kind)}</div>
        <strong>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>` : esc(label)}${play}</strong>
        ${copy ? `<small>${esc(copy)}</small>` : ""}
        ${reason ? `<em>${esc(reason)}</em>` : ""}
      </div>
    </article>`;
  }

  function injectHeroAliases(genre) {
    const root = $("#listenDetails");
    if (!root || !genre) return;
    $$(".genre-identity-alias-line", root).forEach((el) => el.remove());
    const aliases = aliasList(genre);
    if (!aliases.length) return;
    const titleEl = $(
      "#listenDetails .detail-record-card h2, #listenDetails .detail-record-card .genre-title, #listenDetails .detail-hero h2, #listenDetails .dc-hero-title",
    );
    if (!titleEl) return;
    const visible = aliases.slice(0, 5).join(", ");
    titleEl.insertAdjacentHTML(
      "afterend",
      `<div class="genre-identity-alias-line"><em>${esc(visible)}</em>${aliases.length > 5 ? ` <span>+${aliases.length - 5}</span>` : ""}</div>`,
    );
  }

  function identityTrackId(track) {
    const url = norm(trackSpotifyUrl(track));
    if (url) return `url:${url}`;
    return `name:${norm([track?.artist, track?.title || track?.name].filter(Boolean).join("::"))}`;
  }

  function identityLooseText(value) {
    return String(value || "")
      .normalize("NFKC")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(the|a|an|el|la|los|las|le|les|un|una|feat|ft)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function identityQueueTextKey(track) {
    const artist = track?.artist || (Array.isArray(track?.artists) ? track.artists.join(" ") : "");
    const title = track?.title || track?.name || "";
    return `${identityLooseText(artist)}|${identityLooseText(title)}`;
  }

  function identitySongHasUsefulData(song) {
    if (!song) return false;
    const title = identityLooseText(song.title || song.name || "");
    const artist = identityLooseText(song.artist || (Array.isArray(song.artists) ? song.artists.join(" ") : ""));
    return Boolean(title || artist || song.spotifyId || song.spotifyUrl || song.spotify_url || song.url);
  }

  function parsedIdentityTrack(track) {
    const out = { ...(track || {}) };
    let title = String(out.title || out.name || "").trim();
    let artist = String(out.artist || (Array.isArray(out.artists) ? out.artists.join(", ") : "")).trim();
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

  function clearIdentityStamp(song) {
    if (!song) return song;
    delete song.isIdentityTrack;
    delete song.identityType;
    delete song.identityIndex;
    delete song.identityLabel;
    return song;
  }

  function identityTextLooksClose(a, b) {
    const titleA = identityLooseText(a?.title || a?.name || "");
    const titleB = identityLooseText(b?.title || b?.name || "");
    const artistA = identityLooseText(a?.artist || (Array.isArray(a?.artists) ? a.artists.join(" ") : ""));
    const artistB = identityLooseText(b?.artist || (Array.isArray(b?.artists) ? b.artists.join(" ") : ""));
    if (!titleA || !titleB) return false;
    const titleClose = titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA);
    const artistClose = !artistA || !artistB || artistA === artistB || artistA.includes(artistB) || artistB.includes(artistA);
    return titleClose && artistClose;
  }

  function spotifyIdFromTrackLike(track) {
    const explicit = String(track?.spotifyId || "").trim();
    if (explicit) return explicit.toLowerCase();
    const url = trackSpotifyUrl(track);
    const match = String(url || "").match(/spotify\.com\/track\/([a-z0-9]+)/i) || String(url || "").match(/^spotify:track:([a-z0-9]+)/i);
    return match ? match[1].toLowerCase() : "";
  }

  function identityEntries(genre) {
    if (!genre) return [];
    const out = [];
    const sem = parsedIdentityTrack(getSeminal(genre));
    if (sem?.title || sem?.artist || sem?.spotifyUrl || sem?.url) {
      out.push({ track: sem, type: "seminal", index: -1, label: "Seminal track" });
    }
    getMedia(genre).forEach((rawTrack, index) => {
      const track = parsedIdentityTrack(rawTrack);
      if (track?.title || track?.artist || track?.spotifyUrl || track?.url || track?.spotify_url) {
        out.push({ track, type: "media", index, label: "Media track" });
      }
    });
    return out;
  }

  function queueSongs(genre) {
    if (!genre) return [];
    if (!Array.isArray(genre.songs_listened)) genre.songs_listened = [];
    try {
      return typeof window.inflateSongsFromStorage === "function"
        ? window.inflateSongsFromStorage(genre.songs_listened || [])
        : genre.songs_listened;
    } catch (_) {
      return genre.songs_listened || [];
    }
  }

  function hasIdentityComparableData(song, track) {
    if (!song || !track) return false;
    if (spotifyIdFromTrackLike(song) || spotifyIdFromTrackLike(track)) return true;
    const songId = identityTrackId(song);
    const trackId = identityTrackId(track);
    if ((songId && !songId.startsWith("name:")) || (trackId && !trackId.startsWith("name:"))) return true;
    const songTitle = identityLooseText(song?.title || song?.name || "");
    const trackTitle = identityLooseText(track?.title || track?.name || "");
    return Boolean(songTitle || trackTitle);
  }

  function identityEntryContentMatchesSong(song, entry) {
    if (!song || song.isPending || !entry?.track) return false;
    const songText = identitySongDuplicateKey(song);
    const entryText = identitySongDuplicateKey(entry.track);
    if (songText && entryText && songText === entryText) return true;

    const target = identityTrackId(entry.track);
    const songId = identityTrackId(song);
    if (target && songId && !target.startsWith("name:") && target === songId) return true;
    const targetSpotifyId = spotifyIdFromTrackLike(entry.track);
    const songSpotifyId = spotifyIdFromTrackLike(song);
    if (targetSpotifyId && songSpotifyId && targetSpotifyId === songSpotifyId) return true;

    const songTitle = identityLooseText(song?.title || song?.name || "");
    const entryTitle = identityLooseText(entry.track?.title || entry.track?.name || "");
    const songArtist = identityLooseText(song?.artist || (Array.isArray(song?.artists) ? song.artists.join(" ") : ""));
    const entryArtist = identityLooseText(entry.track?.artist || (Array.isArray(entry.track?.artists) ? entry.track.artists.join(" ") : ""));
    const hasBothTitles = Boolean(songTitle && entryTitle);
    const titleClose = hasBothTitles && (songTitle === entryTitle || songTitle.includes(entryTitle) || entryTitle.includes(songTitle));
    const hasBothArtists = Boolean(songArtist && entryArtist);
    const artistClose = !hasBothArtists || songArtist === entryArtist || songArtist.includes(entryArtist) || entryArtist.includes(songArtist);

    // v67: visible title/artist is authoritative when present. This prevents a stale
    // copied Spotify URL or old identityType flag from turning a media row into a
    // seminal row. Covers are still allowed because different artists do not match.
    if (hasBothTitles && !titleClose) return false;
    if (hasBothTitles && titleClose && !artistClose) return false;
    if (hasBothTitles && titleClose && artistClose) return true;

    return false;
  }

  function identityStoredFlagMatchesEntry(song, entry) {
    const type = String(song?.identityType || "");
    return Boolean(
      song?.isIdentityTrack &&
      (type === entry.type || (type === "popular" && entry.type === "media")) &&
      Number(song.identityIndex ?? -1) === Number(entry.index ?? -1)
    );
  }

  function findQueuedIdentitySong(genre, entry, songs = queueSongs(genre)) {
    return (songs || []).find((song) => {
      if (identityEntryContentMatchesSong(song, entry)) return true;
      return !identitySongHasUsefulData(song) && identityStoredFlagMatchesEntry(song, entry);
    }) || null;
  }

  function identityValueEqual(a, b) {
    if (Array.isArray(a) || Array.isArray(b) || (a && typeof a === "object") || (b && typeof b === "object")) {
      try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch (_) {}
    }
    return a === b;
  }

  function identitySongPayload(genre, entry, prior = {}) {
    const track = entry.track || {};
    const trackUrl = identityUsableTrackUrl(track);
    const priorUrl = identityUsableTrackUrl(prior);
    const url = priorUrl || trackUrl || "";
    const trackArtist = String(track.artist || (Array.isArray(track.artists) ? track.artists.join(", ") : "")).trim();
    const priorArtist = String(prior.artist || (Array.isArray(prior.artists) ? prior.artists.join(", ") : "")).trim();
    const trackTitle = String(track.title || track.name || "").trim();
    const priorTitle = String(prior.title || prior.name || "").trim();
    const reason = String(track.reason || prior.reason || "").trim();

    // The queue row is the live, user-edited state. Genre DNA anchors can be stale
    // placeholders while the user is updating Seminal/Media URLs one by one. Prefer
    // richer queue metadata over anchor metadata so a later identity sync does not
    // revert an earlier unsaved Spotify lookup.
    const payload = {
      ...prior,
      url: url || "",
      spotifyUrl: url || "",
      title: priorTitle || trackTitle || entry.label,
      name: prior.name || priorTitle || track.name || trackTitle || entry.label,
      artist: priorArtist || trackArtist || "",
      artwork: prior.artwork || prior.albumArt || trackArtwork(track) || "",
      albumArt: prior.albumArt || prior.artwork || trackArtwork(track) || "",
      album: prior.album || track.album || "",
      artists: Array.isArray(prior.artists) && prior.artists.length
        ? prior.artists.slice()
        : (Array.isArray(track.artists) && track.artists.length ? track.artists.slice() : ((priorArtist || trackArtist) ? [priorArtist || trackArtist] : [])),
      spotifyId: prior.spotifyId || track.spotifyId || "",
      durationMs: prior.durationMs ?? track.durationMs ?? null,
      isrc: prior.isrc || track.isrc || "",
      releaseDate: prior.releaseDate || track.releaseDate || "",
      releaseYear: prior.releaseYear ?? track.releaseYear ?? null,
      releasePrecision: prior.releasePrecision || track.releasePrecision || "",
      releaseSource: prior.releaseSource || track.releaseSource || "",
      spotifyMetadataFetched: prior.spotifyMetadataFetched || track.spotifyMetadataFetched || false,
      spotifyMetadataFetchedAt: prior.spotifyMetadataFetchedAt || track.spotifyMetadataFetchedAt || "",
      reason,
      source: prior.source || track.source || "genre_identity",
      isIdentityTrack: true,
      identityType: entry.type,
      identityIndex: entry.index,
      identityLabel: entry.label,
      score: (prior.score != null && prior.score !== "") ? prior.score : ((track.score != null && track.score !== "") ? track.score : 5),
    };
    if (!payload.artwork && payload.albumArt) payload.artwork = payload.albumArt;
    if (!payload.albumArt && payload.artwork) payload.albumArt = payload.artwork;
    if (track.mediaTitle && !payload.mediaTitle) payload.mediaTitle = track.mediaTitle;
    if (track.media && !payload.media) payload.media = track.media;
    if (track.mediaType && !payload.mediaType) payload.mediaType = track.mediaType;
    if (track.reaction != null && payload.reaction == null) payload.reaction = track.reaction;
    if (prior.reaction != null && track.reaction == null) track.reaction = prior.reaction;
    return payload;
  }

  function identitySongDuplicateKey(song) {
    const textKey = identityQueueTextKey(song);
    return textKey && textKey !== "|" ? textKey : "";
  }

  function identitySongValueIsBlank(value) {
    if (value == null || value === "") return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function mergeQueueSongPreservingExisting(target, source) {
    if (!target || !source || target === source) return target;
    Object.keys(source).forEach((key) => {
      if (key === "levelUp") {
        if (!target.levelUp && source.levelUp) target.levelUp = source.levelUp;
        return;
      }
      if (identitySongValueIsBlank(target[key]) && !identitySongValueIsBlank(source[key])) {
        target[key] = source[key];
      }
    });
    return target;
  }

  function identityTrackIsPlaceholderish(track) {
    if (!track || typeof track !== "object") return true;
    const url = String(track.spotifyUrl || track.url || track.spotify_url || "").trim();
    const title = identityLooseText(track.title || track.name || "");
    const artist = identityLooseText(track.artist || (Array.isArray(track.artists) ? track.artists.join(" ") : ""));
    return Boolean(
      (!spotifyIdFromTrackLike(track)) &&
      (!trackArtwork(track)) &&
      (!track.album) &&
      (identityUrlLooksPlaceholder(url) || (!url && !title && !artist) || title === "seminal track" || title === "media track")
    );
  }

  function queueSongMatchesIdentityEntry(song, entry) {
    if (identityEntryContentMatchesSong(song, entry)) return true;
    const storedSlotMatch = identityStoredFlagMatchesEntry(song, entry);
    if (!storedSlotMatch) return false;
    // Placeholder Seminal/Media anchors are intentionally backfilled from the visible
    // queue row. Trust the explicit identity slot in that narrow case; otherwise a
    // confirmed Spotify mismatch can update the row but fail to hydrate the stale
    // url.com anchor, and the next sync rebuilds the placeholder over the new art.
    if (identityTrackIsPlaceholderish(entry.track) && (spotifyIdFromTrackLike(song) || identityTrackUrl(song) || trackArtwork(song))) return true;
    return !identitySongHasUsefulData(song);
  }

  function syncIdentityTracksToSongQueue(genre, mark = false) {
    // v228: Genre Identity tracks are listenable anchors. Keep existing queue
    // matches in place, and prepend missing Seminal/Media anchors to the top.
    return ensureIdentityTracksInSongQueue(genre, mark);
  }

  // v224/v225: Genre Identity and the listened song queue are separate data lanes.
  // Applying Genre DNA must never inject Seminal/Media touchstone rows into
  // songs_listened; that positional mutation can shift Level Up children under
  // the wrong parent after save/reload. Existing rows that were previously
  // stamped as identity tracks are kept as normal listened songs, but their
  // identity-only flags are removed so future queue saves do not treat them as
  // DNA anchors.
  function detachIdentityFlagsFromSongQueue(genre) {
    if (!genre || !Array.isArray(genre.songs_listened)) return false;
    let changed = false;
    const clearOne = (song) => {
      if (!song || typeof song !== "object") return;
      if (song.levelUp) clearOne(song.levelUp);
      if (song.isIdentityTrack || song.identityType || song.identityLabel || song.identityIndex != null) {
        clearIdentityStamp(song);
        changed = true;
      }
    };
    genre.songs_listened.forEach(clearOne);
    return changed;
  }

  function identityInjectedQueueRow(song) {
    if (!song || typeof song !== "object") return false;
    const source = String(song.source || song.origin || "").toLowerCase();
    return Boolean(
      song.isIdentityTrack ||
      song.identityType ||
      song.identityLabel ||
      song.identityIndex != null ||
      source === "genre_identity" ||
      source === "genre-identity" ||
      source === "identity"
    );
  }

  function identityQueueAnchorSource(song) {
    return String(song?.source || song?.origin || '').toLowerCase();
  }

  function identityQueueRowIsAnchor(song) {
    const src = identityQueueAnchorSource(song);
    return Boolean(
      song &&
      (song.isIdentityTrack ||
        song.identityType ||
        song.identityLabel ||
        song.identityIndex != null ||
        src === 'genre_identity' ||
        src === 'genre-identity' ||
        src === 'identity')
    );
  }

  function stampQueueSongAsIdentityAnchor(song, entry, { created = false } = {}) {
    if (!song || !entry) return song;
    song.isIdentityTrack = true;
    song.identityType = entry.type;
    song.identityIndex = entry.index;
    song.identityLabel = entry.label;
    if (created && !song.source) song.source = 'genre_identity';
    if (song.score == null || song.score === '') song.score = 5;
    return song;
  }

  function findIdentitySongInQueueRows(rows, entry) {
    let found = null;
    (Array.isArray(rows) ? rows : []).some((row) => {
      if (!row || typeof row !== 'object') return false;
      if (identityEntryContentMatchesSong(row, entry) || identityStoredFlagMatchesEntry(row, entry)) {
        found = row;
        return true;
      }
      if (row.levelUp && (identityEntryContentMatchesSong(row.levelUp, entry) || identityStoredFlagMatchesEntry(row.levelUp, entry))) {
        found = row.levelUp;
        return true;
      }
      return false;
    });
    return found;
  }

  function ensureIdentityTracksInSongQueue(genre, mark = false) {
    // v228: Identity tracks are listenable, but existing recommendation rows must
    // not move. If an identity track already exists, badge/update that row in
    // place. If the identity track does not exist anywhere in the queue, insert a
    // dedicated Seminal/Media anchor at the top of the queue in identity order so
    // it is immediately visible in the list/carousel.
    if (!genre) return false;
    if (!Array.isArray(genre.songs_listened)) genre.songs_listened = [];
    const before = (() => { try { return JSON.stringify(genre.songs_listened || []); } catch (_) { return ''; } })();
    const rows = genre.songs_listened;
    const missingIdentityAnchors = [];
    identityEntries(genre).forEach((entry) => {
      if (!entry || !entry.track || identityTrackIsPlaceholderish(entry.track)) return;
      const existing = findIdentitySongInQueueRows(rows, entry) || findIdentitySongInQueueRows(missingIdentityAnchors, entry);
      if (existing) {
        const src = identityQueueAnchorSource(existing);
        const isDedicatedAnchor = src === 'genre_identity' || src === 'genre-identity' || src === 'identity';
        if (isDedicatedAnchor) {
          const keep = {
            reaction: existing.reaction,
            listenerNote: existing.listenerNote,
            songNote: existing.songNote,
            favorite: existing.favorite,
            isFavorite: existing.isFavorite,
            trophy: existing.trophy,
            added: existing.added,
          };
          const payload = identitySongPayload(genre, entry, {});
          Object.assign(existing, payload);
          Object.keys(keep).forEach((key) => {
            if (keep[key] != null && keep[key] !== '') existing[key] = keep[key];
          });
        } else {
          const payload = identitySongPayload(genre, entry, existing);
          mergeQueueSongPreservingExisting(existing, payload);
        }
        stampQueueSongAsIdentityAnchor(existing, entry, { created: isDedicatedAnchor });
        return;
      }
      const payload = identitySongPayload(genre, entry, {});
      stampQueueSongAsIdentityAnchor(payload, entry, { created: true });
      missingIdentityAnchors.push(payload);
    });
    if (missingIdentityAnchors.length) {
      rows.unshift(...missingIdentityAnchors);
    }
    const after = (() => { try { return JSON.stringify(genre.songs_listened || []); } catch (_) { return ''; } })();
    const changed = before !== after;
    if (changed && mark) markDirty();
    return changed;
  }

  function purgeIdentityRowsFromSongQueue(genre, mark = false) {
    // v228: keep valid, current Genre Identity anchors in the song queue. This
    // cleanup now only removes stale identity helper rows that no longer match any
    // Seminal/Media entry, and clears impossible stale child anchors.
    if (!genre || !Array.isArray(genre.songs_listened)) return false;
    const before = (() => { try { return JSON.stringify(genre.songs_listened || []); } catch (_) { return ''; } })();
    const rows = Array.isArray(genre.songs_listened) ? genre.songs_listened : [];
    const cleaned = [];
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') {
        cleaned.push(row);
        return;
      }
      if (identityQueueRowIsAnchor(row)) {
        const entry = findIdentityEntryForQueueSong(genre, row);
        if (!entry) return;
        stampQueueSongAsIdentityAnchor(row, entry, { created: identityQueueAnchorSource(row) === 'genre_identity' });
      }
      if (row.levelUp && identityQueueRowIsAnchor(row.levelUp)) {
        const childEntry = findIdentityEntryForQueueSong(genre, row.levelUp);
        if (childEntry) stampQueueSongAsIdentityAnchor(row.levelUp, childEntry, { created: false });
        else delete row.levelUp;
      }
      cleaned.push(row);
    });
    genre.songs_listened = cleaned;
    const after = (() => { try { return JSON.stringify(genre.songs_listened || []); } catch (_) { return ''; } })();
    const changed = before !== after;
    if (changed && mark) markDirty();
    return changed;
  }

  function findIdentityEntryForQueueSong(genre, song) {
    const entries = identityEntries(genre);
    if (!song) return null;
    const contentMatch = entries.find((entry) => identityEntryContentMatchesSong(song, entry));
    if (contentMatch) return contentMatch;
    // v75: identity rows can have useful-looking placeholder data, especially
    // `https://url.com` while backfilling Seminal/Media tracks. Do not require
    // the row to be blank before trusting its stored identity slot; otherwise a
    // confirmed Spotify mismatch can fail to update the anchor and then re-sync
    // the stale placeholder back over the edited row.
    if (song.isIdentityTrack) {
      return entries.find((entry) => identityStoredFlagMatchesEntry(song, entry)) || null;
    }
    return null;
  }

  function updateTrackFromQueueOverwrite(genre, beforeSong, updatedSong) {
    if (!genre || !updatedSong) return false;
    identity(genre);
    const entry = findIdentityEntryForQueueSong(genre, beforeSong) || findIdentityEntryForQueueSong(genre, updatedSong);
    if (!entry || !entry.track) return false;
    const track = entry.track;
    const keepReason = track.reason || beforeSong?.reason || updatedSong.reason || "";
    const keepMediaTitle = track.mediaTitle || track.media || "";
    const keepMediaType = track.mediaType || "";
    Object.assign(track, {
      title: updatedSong.title || track.title || track.name || "",
      name: updatedSong.title || track.name || track.title || "",
      artist: updatedSong.artist || (Array.isArray(updatedSong.artists) ? updatedSong.artists.join(", ") : track.artist || ""),
      spotifyUrl: updatedSong.spotifyUrl || updatedSong.url || track.spotifyUrl || track.url || "",
      url: updatedSong.spotifyUrl || updatedSong.url || track.url || track.spotifyUrl || "",
      artwork: updatedSong.artwork || updatedSong.albumArt || track.artwork || track.albumArt || "",
      albumArt: updatedSong.albumArt || updatedSong.artwork || track.albumArt || track.artwork || "",
      album: updatedSong.album || track.album || "",
      artists: Array.isArray(updatedSong.artists) && updatedSong.artists.length ? updatedSong.artists.slice() : (updatedSong.artist ? [updatedSong.artist] : track.artists || []),
      spotifyId: updatedSong.spotifyId || track.spotifyId || "",
      durationMs: updatedSong.durationMs ?? track.durationMs ?? null,
      isrc: updatedSong.isrc || track.isrc || "",
      releaseDate: updatedSong.releaseDate || track.releaseDate || "",
      releaseYear: updatedSong.releaseYear ?? track.releaseYear ?? null,
      releasePrecision: updatedSong.releasePrecision || track.releasePrecision || "",
      releaseSource: updatedSong.releaseSource || track.releaseSource || "",
      score: (track.score != null && track.score !== "") ? track.score : 5,
      reason: keepReason,
    });
    if (entry.type === "media") {
      track.mediaTitle = keepMediaTitle;
      track.media = keepMediaTitle;
      track.mediaType = keepMediaType;
    }
    if (entry.type === "seminal") {
      genre.identity.seminalTrack = track;
      genre.seminal_song = track;
    } else if (entry.index >= 0) {
      genre.identity.mediaTouchstones[entry.index] = track;
      genre.media_touchstones = genre.identity.mediaTouchstones;
    }
    try {
      updatedSong.isIdentityTrack = true;
      updatedSong.identityType = entry.type;
      updatedSong.identityIndex = entry.index;
      updatedSong.identityLabel = entry.label;
      if (updatedSong.score == null || updatedSong.score === "") updatedSong.score = 5;
    } catch (_) {}
    return true;
  }



  function renderDnaCard(genre) {
    const aliases = aliasList(genre);
    const sem = getSeminal(genre);
    const media = getMedia(genre);
    const hasSem = sem?.title || sem?.artist || sem?.spotifyUrl || sem?.url;
    if (!aliases.length && !hasSem && !media.length) return "";
    return `<section class="genre-identity-dna" aria-label="Genre DNA">
      <div class="genre-identity-dna-head">
        <div><div class="eyebrow">Genre DNA</div><h3>Aliases and listening anchors</h3><p class="small">Reference tracks for identity, not automatically counted as logged listens.</p></div>
      </div>
      ${aliases.length ? `<div class="genre-identity-alias-card"><span>Known aliases</span><strong>${esc(aliases.slice(0, 8).join(", "))}</strong></div>` : ""}
      <div class="genre-identity-track-grid">
        ${hasSem ? identityTrackCard(sem, "Seminal track") : ""}
        ${media
          .slice(0, 3)
          .map((m) => identityTrackCard(m, "Media touchstone"))
          .join("")}
      </div>
    </section>`;
  }

  function injectDnaCard(explicitGenre) {
    const g = explicitGenre || currentGenre();
    const root = $("#listenDetails");
    if (!g || !root) return;
    injectHeroAliases(g);
    const existing = $(".genre-identity-dna", root);
    const html = renderDnaCard(g);
    if (!html) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.outerHTML = html;
      return;
    }

    // Discovery Console / Dig mode restructures the original detail DOM after
    // loadListenScreen. Insert DNA into that final layout first, then fall back
    // to the older detail page anchors. This is the piece that makes localhost
    // and production behave the same.
    const consoleWrap = $(".discovery-console", root);
    if (consoleWrap) {
      const consoleAnchor = $(
        ".dc-vibe-line, .dc-progress-strip, .detail-record-card",
        consoleWrap,
      );
      if (consoleAnchor) {
        consoleAnchor.insertAdjacentHTML("afterend", html);
        return;
      }
      consoleWrap.insertAdjacentHTML("afterbegin", html);
      return;
    }

    const anchor = $(
      ".song-listening-room, .dc-song-listening-section, .album-dive-panel, .detail-log-section",
      root,
    );
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else $(".detail-hero", root)?.insertAdjacentHTML("beforeend", html);
  }

  function renderIdentityEditor() {
    const sId =
      selectedGenreId ||
      String(currentGenre()?.id ?? "") ||
      String(genres()[0]?.id ?? "");
    selectedGenreId = sId;
    const g = findGenre(sId) || genres()[0];
    if (!g)
      return '<section class="genre-identity-editor"><div class="studio-empty">Load genres first.</div></section>';
    const aliases = aliasList(g).join("\n");
    const sem = getSeminal(g);
    const media = getMedia(g);
    const label = aliasList(g).length
      ? `${g.genre} · aka ${aliasList(g).slice(0, 2).join(", ")}`
      : g.genre;
    return `<section class="genre-identity-editor studio-collapsible-section studio-section-collapsed" id="genreIdentityWorkbench" aria-label="Genre Identity Editor" data-studio-collapsible="1">
      <div class="studio-lane-head genre-identity-editor-head">
        <div><div class="eyebrow">Genre Identity</div><h3>Aliases, seminal track, and media touchstones</h3><p>These fields make search smarter and give each genre a compact cultural/canonical context.</p><div class="genre-identity-status-line">${esc(identityStatus(g))}</div></div>
        <div class="genre-identity-head-actions"><button type="button" class="btn btn-secondary btn-tiny" onclick="DailyGenreIdentity.openGenre(${JSON.stringify(String(g.id ?? ""))})">Open genre</button><button type="button" class="studio-collapse-btn" aria-expanded="false"><span aria-hidden="true">＋</span><strong>Expand</strong></button></div>
      </div>
      <div class="genre-identity-picker">
        <label><span>Genre</span><input id="genreIdentityPick" type="search" list="genreIdentityDatalist" value="${esc(label || "")}" placeholder="Type a genre or alias…" autocomplete="off"></label>
        <datalist id="genreIdentityDatalist">${genreOptionsHtml()}</datalist>
        <button type="button" class="btn btn-secondary btn-tiny" id="genreIdentityFocusBtn">Load</button>
      </div>
      <details class="genre-identity-import genre-identity-full">
        <summary>Paste structured identity block</summary>
        <textarea id="genreIdentityBlockImport" rows="8" placeholder="GENRE: synth pop&#10;&#10;ALIASES:&#10;synth-pop&#10;&#10;SEMINAL_TRACK:&#10;ARTIST: Gary Numan&#10;TITLE: Cars&#10;SPOTIFY_URL: https://open.spotify.com/track/...&#10;REASON: Short reason&#10;&#10;MEDIA_TOUCHSTONE:&#10;ARTIST: a-ha&#10;TITLE: Take On Me&#10;MEDIA_TITLE: MTV music video&#10;MEDIA_TYPE: tv&#10;SPOTIFY_URL: https://open.spotify.com/track/...&#10;REASON: Short reason"></textarea>
        <div class="genre-identity-import-actions">
          <button type="button" class="btn btn-secondary btn-tiny" id="genreIdentityParseBlockBtn">Parse into form</button>
          <button type="button" class="btn btn-primary btn-tiny" id="genreIdentityApplyBlockBtn">Apply & Save block</button>
          <button type="button" class="btn btn-secondary btn-tiny" id="genreIdentityOverwriteBlockBtn">Overwrite & Save block</button>
        </div>
        <small>“None” values are ignored. GENRE can be a canonical name or alias.</small>
      </details>
      <div class="genre-identity-form" data-genre-id="${esc(String(g.id ?? ""))}">
        <label class="genre-identity-full"><span>Aliases / known synonyms</span><textarea id="genreIdentityAliases" rows="3" placeholder="One per line, e.g. Synth pop&#10;Synthpop&#10;Technopop">${esc(aliases)}</textarea><small>Used by Spin search, Studio typeahead, Stats focus, and future duplicate checks.</small></label>
        <div class="genre-identity-section-title">Seminal track</div>
        <label><span>Artist</span><input id="genreSeminalArtist" value="${esc(sem.artist || "")}" placeholder="Donna Summer"></label>
        <label><span>Title</span><input id="genreSeminalTitle" value="${esc(sem.title || sem.name || "")}" placeholder="I Feel Love"></label>
        <label class="genre-identity-full"><span>Spotify URL</span><input id="genreSeminalUrl" value="${esc(sem.spotifyUrl || sem.url || sem.spotify_url || "")}" placeholder="https://open.spotify.com/track/…"></label>
        <label class="genre-identity-full"><span>Why this is seminal</span><textarea id="genreSeminalReason" rows="3" placeholder="Why this track explains the genre historically or sonically.">${esc(sem.reason || "")}</textarea></label>
        <div class="genre-identity-section-title genre-identity-full">Media touchstones</div>
        <div id="genreMediaRows" class="genre-identity-media-list genre-identity-full">
          ${renderMediaRows(media)}
        </div>
        <div class="genre-identity-actions genre-identity-full">
          <button type="button" class="btn btn-secondary" id="genreAddMediaBtn">+ Add media touchstone</button>
          <button type="button" class="btn btn-primary" id="genreIdentityApplyBtn">Apply & Save identity fields</button>
          <button type="button" class="btn btn-secondary" id="genreIdentityOverwriteBtn">Overwrite & Save identity fields</button>
        </div>
      </div>
    </section>`;
  }

  function renderMediaRows(media) {
    const rows = media.length ? media : [{}];
    return rows
      .map(
        (m, idx) => `<fieldset class="genre-media-row" data-media-row="${idx}">
      <legend>Touchstone ${idx + 1}</legend>
      <label><span>Artist</span><input data-field="artist" value="${esc(m.artist || "")}" placeholder="Pixies"></label>
      <label><span>Song</span><input data-field="title" value="${esc(m.title || m.name || "")}" placeholder="Where Is My Mind?"></label>
      <label><span>Media title</span><input data-field="mediaTitle" value="${esc(m.mediaTitle || m.media || "")}" placeholder="Fight Club"></label>
      <label><span>Type</span><select data-field="mediaType"><option value="">Choose…</option>${["film", "tv", "game", "ad", "internet", "trailer", "anime", "other"].map((x) => `<option value="${esc(x)}" ${String(m.mediaType || "").toLowerCase() === x.toLowerCase() ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="genre-identity-full"><span>Spotify URL</span><input data-field="spotifyUrl" value="${esc(m.spotifyUrl || m.url || m.spotify_url || "")}" placeholder="https://open.spotify.com/track/…"></label>
      <label class="genre-identity-full"><span>Why it matters</span><textarea data-field="reason" rows="2" placeholder="How this media placement shaped recognition.">${esc(m.reason || "")}</textarea></label>
      <button type="button" class="btn btn-ghost btn-tiny genre-remove-media">Remove</button>
    </fieldset>`,
      )
      .join("");
  }

  function cleanIdentityBlockValue(value) {
    const raw = stripIdentityReferences(value);
    return /^none$/i.test(raw) ? "" : raw;
  }

  function normalizeIdentityKey(key) {
    return String(key || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
  }

  function parseIdentityBlock(text) {
    const parsed = {
      genre: "",
      aliases: [],
      seminal: {},
      mediaTouchstones: [],
    };
    const lines = String(text || "")
      .replace(/\r/g, "")
      .split("\n");
    let section = "";
    let currentMedia = null;
    const commitMedia = () => {
      if (!currentMedia) return;
      if (currentMedia.spotifyUrl && !currentMedia.url)
        currentMedia.url = currentMedia.spotifyUrl;
      if (
        currentMedia.title ||
        currentMedia.artist ||
        currentMedia.spotifyUrl ||
        currentMedia.mediaTitle ||
        currentMedia.mediaType ||
        currentMedia.reason
      ) {
        parsed.mediaTouchstones.push(currentMedia);
      }
      currentMedia = null;
    };
    const assignTrack = (obj, key, value) => {
      const clean = cleanIdentityBlockValue(value);
      if (key === "ARTIST") obj.artist = clean;
      else if (key === "TITLE" || key === "SONG") obj.title = clean;
      else if (key === "SPOTIFY_URL" || key === "URL") {
        obj.spotifyUrl = clean;
        obj.url = clean;
      } else if (key === "REASON") obj.reason = clean;
      else if (key === "MEDIA_TITLE" || key === "MEDIA") obj.mediaTitle = clean;
      else if (key === "MEDIA_TYPE" || key === "TYPE")
        obj.mediaType = clean.toLowerCase();
    };

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const header = line.match(/^([A-Z_ ]+)\s*:\s*(.*)$/i);
      const key = header ? normalizeIdentityKey(header[1]) : "";
      const value = header ? header[2] : "";

      if (key === "GENRE") {
        parsed.genre = cleanIdentityBlockValue(value);
        section = "";
        return;
      }
      if (key === "ALIASES") {
        commitMedia();
        section = "aliases";
        if (value) {
          value
            .split(/[,;|]/g)
            .map(cleanAliasValue)
            .filter(Boolean)
            .forEach((alias) => parsed.aliases.push(alias));
        }
        return;
      }
      if (key === "SEMINAL_TRACK") {
        commitMedia();
        section = "seminal";
        return;
      }
      if (key === "MEDIA_TOUCHSTONE" || key === "MEDIA_TOUCHSTONES") {
        commitMedia();
        section = "media";
        currentMedia = {};
        return;
      }

      if (section === "aliases" && !header) {
        const alias = cleanAliasValue(line);
        if (alias) parsed.aliases.push(alias);
        return;
      }
      if (section === "seminal" && header) {
        assignTrack(parsed.seminal, key, value);
        return;
      }
      if (section === "media" && header) {
        if (!currentMedia) currentMedia = {};
        assignTrack(currentMedia, key, value);
      }
    });
    commitMedia();
    parsed.aliases = [
      ...new Set(parsed.aliases.map(cleanAliasValue).filter(Boolean)),
    ];
    return parsed;
  }

  function looksLikeIdentityBlock(text) {
    const raw = String(text || "").trim();
    if (!raw) return false;
    return /(^|\n)\s*(GENRE|ALIASES|SEMINAL[_\s-]*TRACK|MEDIA[_\s-]*TOUCHSTONE)\s*:/i.test(raw);
  }

  async function importStructuredIdentityBlock(text, options = {}) {
    const parsed = parseIdentityBlock(text);
    if (options.genreFallback && !parsed.genre) parsed.genre = options.genreFallback;
    if (
      !parsed.genre &&
      !parsed.aliases.length &&
      !parsed.seminal.title &&
      !parsed.seminal.artist &&
      !parsed.seminal.spotifyUrl &&
      !parsed.mediaTouchstones.length
    ) {
      toast("Paste a structured identity block first.", true);
      return false;
    }
    const ok = applyIdentityBlockDirect(parsed, { overwrite: !!options.overwrite });
    return ok !== false;
  }

  function fillIdentityFormFromParsed(parsed, allowSwitch = true) {
    if (!parsed) return false;
    const target = parsed.genre ? bestGenreMatch(parsed.genre) : null;
    if (
      allowSwitch &&
      target &&
      String(target.id ?? "") !==
        String($(".genre-identity-form")?.dataset.genreId || "")
    ) {
      selectedGenreId = String(target.id ?? "");
      refreshStudioEditor();
      setTimeout(() => fillIdentityFormFromParsed(parsed, false), 0);
      return true;
    }
    const root = $("#genreIdentityWorkbench");
    if (!root) return false;
    const set = (sel, value) => {
      const el = $(sel, root);
      if (el) el.value = value || "";
    };
    set("#genreIdentityAliases", parsed.aliases.join("\n"));
    set("#genreSeminalArtist", parsed.seminal.artist || "");
    set("#genreSeminalTitle", parsed.seminal.title || "");
    set(
      "#genreSeminalUrl",
      parsed.seminal.spotifyUrl || parsed.seminal.url || "",
    );
    set("#genreSeminalReason", parsed.seminal.reason || "");
    const mediaRows = $("#genreMediaRows", root);
    if (mediaRows)
      mediaRows.innerHTML = renderMediaRows(
        parsed.mediaTouchstones.length ? parsed.mediaTouchstones : [{}],
      );
    return true;
  }

  function identityTrackMergeKey(track) {
    const url = identityUsableTrackUrl(track || '').toLowerCase();
    if (url) return `url:${url}`;
    const artist = identityLooseText(track?.artist || (Array.isArray(track?.artists) ? track.artists.join(' ') : ''));
    const title = identityLooseText(track?.title || track?.name || '');
    return title ? `name:${artist}|${title}` : '';
  }

  function mergeIdentityTrack(existing = {}, incoming = {}) {
    const out = { ...(existing || {}) };
    Object.entries(incoming || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') out[key] = value;
    });
    if (out.spotifyUrl && !out.url) out.url = out.spotifyUrl;
    if (out.url && !out.spotifyUrl) out.spotifyUrl = out.url;
    return out;
  }

  function mergeMediaTouchstones(existing = [], incoming = []) {
    const out = (Array.isArray(existing) ? existing : []).map(m => ({ ...(m || {}) }));
    (Array.isArray(incoming) ? incoming : []).forEach(raw => {
      const item = { ...(raw || {}) };
      const key = identityTrackMergeKey(item);
      const idx = key ? out.findIndex(m => identityTrackMergeKey(m) === key) : -1;
      if (idx >= 0) out[idx] = mergeIdentityTrack(out[idx], item);
      else if (item.title || item.artist || item.mediaTitle || item.mediaType || item.spotifyUrl || item.url || item.reason) out.push(item);
    });
    return out.filter(m => m && (m.title || m.artist || m.mediaTitle || m.mediaType || m.spotifyUrl || m.url || m.reason));
  }

  async function applyIdentityBlockDirect(parsed, options = {}) {
    if (!parsed) return toast("Paste a structured identity block first.", true);
    const g =
      (parsed.genre && bestGenreMatch(parsed.genre)) ||
      findGenre($(".genre-identity-form")?.dataset.genreId) ||
      currentGenre();
    if (!g)
      return toast(
        "Could not match the GENRE line to an existing genre.",
        true,
      );
    const overwrite = !!options.overwrite;
    const existingAliases = aliasList(g);
    setAliases(g, overwrite ? (parsed.aliases || []) : [...existingAliases, ...(parsed.aliases || [])]);
    const id = identity(g);
    const sem = {
      artist: parsed.seminal.artist || "",
      title: parsed.seminal.title || "",
      spotifyUrl: parsed.seminal.spotifyUrl || parsed.seminal.url || "",
      reason: parsed.seminal.reason || "",
    };
    if (sem.spotifyUrl) sem.url = sem.spotifyUrl;
    const hasIncomingSeminal = !!(sem.artist || sem.title || sem.spotifyUrl || sem.reason);
    if (overwrite || hasIncomingSeminal) {
      const nextSem = overwrite ? sem : mergeIdentityTrack(id.seminalTrack || g.seminal_song || {}, sem);
      id.seminalTrack = nextSem;
      g.seminal_song = nextSem;
    }
    const incomingMedia = (parsed.mediaTouchstones || [])
      .map((m) => ({
        artist: m.artist || "",
        title: m.title || "",
        mediaTitle: m.mediaTitle || m.media || "",
        mediaType: m.mediaType || "",
        spotifyUrl: m.spotifyUrl || m.url || "",
        url: m.spotifyUrl || m.url || "",
        reason: m.reason || "",
      }))
      .filter(
        (m) =>
          m.title ||
          m.artist ||
          m.mediaTitle ||
          m.mediaType ||
          m.spotifyUrl ||
          m.reason,
      );
    id.mediaTouchstones = overwrite ? incomingMedia : mergeMediaTouchstones(id.mediaTouchstones || g.media_touchstones || [], incomingMedia);
    g.media_touchstones = id.mediaTouchstones;
    // v228: keep identity anchors listenable. Existing queue matches are badged in
    // place; missing Seminal/Media tracks are inserted at the top.
    ensureIdentityTracksInSongQueue(g);
    selectedGenreId = String(g.id ?? selectedGenreId);
    markDirty();
    refreshStudioEditor();
    setTimeout(() => injectDnaCard(g), 60);
    await persistIdentityApplyNow(`Imported and saved identity block for ${g.genre || parsed.genre || "genre"}.`);
    return true;
  }


  async function persistIdentityApplyNow(message = '') {
    try {
      if (typeof markListeningUpdatePending === "function") markListeningUpdatePending();
      // v222: identity saves just mutated genre.songs_listened in memory. Tell the
      // app save finalizer that the queue model is authoritative so a stale hidden
      // bulk textarea cannot reparse flattened Level Up rows and shift children to
      // the wrong parent during password save.
      try { window.__dailyGenreQueueModelAuthoritativeUntil = Date.now() + 60000; } catch (_) {}
      try { window.__dgIdentitySaveInFlight = true; } catch (_) {}
      if (typeof saveLibraryUpdates === "function") {
        await saveLibraryUpdates();
        if (message) toast(message, false);
      } else {
        markDirty();
        if (message) toast(message, false);
      }
    } catch (error) {
      console.warn("Could not save identity update", error);
      toast(`Identity applied, but save failed: ${error?.message || error || "Unknown error"}`, true);
    } finally {
      try { window.__dgIdentitySaveInFlight = false; } catch (_) {}
    }
  }

  function readMediaRows(root) {
    return $$(".genre-media-row", root)
      .map((row) => {
        const obj = {};
        $$("[data-field]", row).forEach((el) => {
          obj[el.dataset.field] = String(el.value || "").trim();
        });
        if (obj.spotifyUrl && !obj.url) obj.url = obj.spotifyUrl;
        return obj;
      })
      .filter(
        (m) =>
          m.title ||
          m.artist ||
          m.spotifyUrl ||
          m.mediaTitle ||
          m.mediaType ||
          m.reason,
      );
  }

  async function saveEditor(options = {}) {
    const form = $(".genre-identity-form");
    if (!form) return;
    const g = findGenre(form.dataset.genreId);
    if (!g) return toast("Could not find selected genre.", true);
    const overwrite = !!options.overwrite;
    const aliases = String($("#genreIdentityAliases")?.value || "").split(
      /[\n,;|]/g,
    );
    setAliases(g, overwrite ? aliases : [...aliasList(g), ...aliases]);
    const id = identity(g);
    const sem = {
      artist: String($("#genreSeminalArtist")?.value || "").trim(),
      title: String($("#genreSeminalTitle")?.value || "").trim(),
      spotifyUrl: String($("#genreSeminalUrl")?.value || "").trim(),
      reason: String($("#genreSeminalReason")?.value || "").trim(),
    };
    if (sem.spotifyUrl) sem.url = sem.spotifyUrl;
    const hasSem = !!(sem.artist || sem.title || sem.spotifyUrl || sem.reason);
    if (overwrite || hasSem) {
      const nextSem = overwrite ? sem : mergeIdentityTrack(id.seminalTrack || g.seminal_song || {}, sem);
      id.seminalTrack = nextSem;
      g.seminal_song = nextSem;
    }
    const mediaRows = readMediaRows(form);
    id.mediaTouchstones = overwrite ? mediaRows : mergeMediaTouchstones(id.mediaTouchstones || g.media_touchstones || [], mediaRows);
    g.media_touchstones = id.mediaTouchstones;
    // v228: keep identity anchors listenable. Existing queue matches are badged in
    // place; missing Seminal/Media tracks are inserted at the top.
    ensureIdentityTracksInSongQueue(g);
    markDirty();
    injectDnaCard();
    await persistIdentityApplyNow(`Updated and saved identity for ${g.genre || "genre"}.`);
  }


  function identityBlockHasContent(genre) {
    if (!genre) return false;
    const aliases = aliasList(genre);
    const sem = getSeminal(genre);
    const media = getMedia(genre);
    const hasSem = !!(sem?.artist || sem?.title || sem?.name || sem?.spotifyUrl || sem?.url || sem?.reason);
    const hasMedia = media.some((m) => m && (m.artist || m.title || m.name || m.mediaTitle || m.media || m.mediaType || m.spotifyUrl || m.url || m.reason));
    return Boolean(aliases.length || hasSem || hasMedia);
  }

  function identityBlockFromGenre(genre) {
    if (!genre) return "";
    const lines = [`GENRE: ${genre.genre || genre.name || ""}`.trim(), "", "ALIASES:"];
    aliasList(genre).forEach((alias) => lines.push(alias));
    return lines.join("\n").trim();
  }

  function identityEntriesMatchingExistingSongs(genre, parsed) {
    if (!genre || !parsed) return [];
    const entries = [];
    const sem = parsed.seminal || {};
    if (sem.artist || sem.title || sem.spotifyUrl || sem.url || sem.reason) entries.push({ label: "Seminal track", type: "seminal", index: -1, track: sem });
    (parsed.mediaTouchstones || []).forEach((track, index) => {
      if (track && (track.artist || track.title || track.spotifyUrl || track.url || track.reason || track.mediaTitle || track.mediaType)) entries.push({ label: "Media touchstone", type: "media", index, track });
    });
    const songs = queueSongs(genre).filter((song) => song && !song.isPending && !song.isIdentityTrack);
    return entries.filter((entry) => songs.some((song) => identityEntryContentMatchesSong(song, entry)));
  }


  function injectDetailIdentityImport(genre = null, options = {}) {
    const g = genre || currentGenre();
    const panel = document.getElementById("listenEditPanel");
    if (!panel || !g) return;
    const genreId = String(g.id ?? "");
    const existing = panel.querySelector("#detailGenreIdentityImport");
    if (existing) {
      const sameGenre = String(existing.dataset.genreId || "") === genreId;
      const active = existing.contains(document.activeElement);
      if (sameGenre && !options.force) return;
      if (active && !options.force) return;
      existing.remove();
    }
    const section = document.createElement("div");
    section.dataset.genreId = genreId;
    section.className = "form-section genre-identity-detail-import genre-identity-detail-block";
    section.id = "detailGenreIdentityImport";
    section.innerHTML = `
      <div class="eyebrow" style="margin:0 0 6px;">Genre Identity</div>
      <div class="genre-identity-form genre-identity-detail-form" data-genre-id="${esc(String(g.id ?? ""))}">
        <textarea id="detailGenreIdentityBlock" rows="5" spellcheck="false" data-dg-identity-textarea="1" style="font-family: monospace; font-size: 0.86rem; width:100%; max-width:none; min-height:112px; max-height:210px; resize:vertical;" placeholder="GENRE: ${esc(g.genre || "Genre name")}&#10;&#10;ALIASES:&#10;known synonym">${esc(identityBlockFromGenre(g))}</textarea>
        <div class="small" style="margin-top:7px;">Enter the canonical genre name and one alias per line. Seminal and Media tracks belong in Songs listened.</div>
        <div class="genre-identity-actions genre-identity-full" style="margin-top:10px;">
          <button type="button" class="btn btn-primary btn-tiny" id="detailGenreIdentityApplyBtn">Apply &amp; Save Aliases</button>
          <button type="button" class="btn btn-secondary btn-tiny" id="detailGenreIdentityOverwriteBtn">Overwrite Aliases</button>
        </div>
      </div>`;
    const songBulk = document.getElementById("songsListenedBulk")?.closest("div");
    if (songBulk && songBulk.parentNode === panel) songBulk.insertAdjacentElement("afterend", section);
    else panel.appendChild(section);

    const identityTextarea = section.querySelector("#detailGenreIdentityBlock");
    if (identityTextarea) {
      ["click", "mousedown", "mouseup", "keydown", "keyup", "input", "paste", "focus"].forEach((type) => {
        identityTextarea.addEventListener(type, (event) => event.stopPropagation());
      });
    }

    const saveBlock = async (overwrite = false) => {
      const target = currentGenre() || g;
      if (!target) return toast("Open a genre before saving aliases.", true);
      const text = section.querySelector("#detailGenreIdentityBlock")?.value || "";
      const parsed = parseIdentityBlock(text);
      const incomingAliases = Array.isArray(parsed.aliases) ? parsed.aliases : [];
      const nextAliases = overwrite
        ? incomingAliases
        : [...aliasList(target), ...incomingAliases];
      setAliases(target, nextAliases);
      markDirty();
      injectDnaCard(target);
      await persistIdentityApplyNow(
        `${overwrite ? "Overwrote" : "Updated"} and saved aliases for ${target.genre || "genre"}.`
      );
      setTimeout(() => injectDetailIdentityImport(target, { force: true }), 120);
    };
    section.querySelector("#detailGenreIdentityApplyBtn")?.addEventListener("click", () => saveBlock(false));
    section.querySelector("#detailGenreIdentityOverwriteBtn")?.addEventListener("click", () => saveBlock(true));
  }


  function installEditorEvents(root = document) {
    if (!root) return;
    if (root.dataset && root.dataset.genreIdentityEvents === "1") return;
    if (root.dataset) root.dataset.genreIdentityEvents = "1";
    const pick = $("#genreIdentityPick", root);
    $("#genreIdentityFocusBtn", root)?.addEventListener("click", () => {
      const match = bestGenreMatch(pick?.value || "");
      if (match) {
        selectedGenreId = String(match.id ?? "");
        refreshStudioEditor();
      } else toast("No genre or alias match found.", true);
    });
    pick?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        $("#genreIdentityFocusBtn", root)?.click();
      }
    });
    $("#genreIdentityApplyBtn", root)?.addEventListener("click", () => saveEditor({ overwrite: false }));
    $("#genreIdentityOverwriteBtn", root)?.addEventListener("click", () => saveEditor({ overwrite: true }));
    $("#genreIdentityParseBlockBtn", root)?.addEventListener("click", () => {
      const text = $("#genreIdentityBlockImport", root)?.value || "";
      const parsed = parseIdentityBlock(text);
      if (
        !parsed.genre &&
        !parsed.aliases.length &&
        !parsed.seminal.title &&
        !parsed.mediaTouchstones.length
      ) {
        toast("Paste a structured identity block first.", true);
        return;
      }
      fillIdentityFormFromParsed(parsed);
      toast(
        "Parsed identity block into the manual fields. Review, then apply/save.",
        false,
      );
    });
    $("#genreIdentityApplyBlockBtn", root)?.addEventListener("click", async () => {
      const text = $("#genreIdentityBlockImport", root)?.value || "";
      await importStructuredIdentityBlock(text, { overwrite: false });
    });
    $("#genreIdentityOverwriteBlockBtn", root)?.addEventListener("click", async () => {
      const text = $("#genreIdentityBlockImport", root)?.value || "";
      await importStructuredIdentityBlock(text, { overwrite: true });
    });
    $("#genreAddMediaBtn", root)?.addEventListener("click", () => {
      const list = $("#genreMediaRows", root);
      if (!list) return;
      list.insertAdjacentHTML("beforeend", renderMediaRows([{}]));
    });
    root.addEventListener("click", (ev) => {
      const collapseBtn = ev.target.closest(".studio-collapse-btn");
      if (collapseBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        const section = collapseBtn.closest(".studio-collapsible-section");
        if (section) {
          const collapsed = !section.classList.contains(
            "studio-section-collapsed",
          );
          section.classList.toggle("studio-section-collapsed", collapsed);
          collapseBtn.setAttribute(
            "aria-expanded",
            collapsed ? "false" : "true",
          );
          collapseBtn.innerHTML = collapsed
            ? '<span aria-hidden="true">＋</span><strong>Expand</strong>'
            : '<span aria-hidden="true">−</span><strong>Collapse</strong>';
        }
        return;
      }
      const btn = ev.target.closest(".genre-remove-media");
      if (!btn) return;
      const rows = $$(".genre-media-row", root);
      if (rows.length <= 1) {
        btn
          .closest(".genre-media-row")
          ?.querySelectorAll("input, textarea")
          .forEach((el) => {
            el.value = "";
          });
        return;
      }
      btn.closest(".genre-media-row")?.remove();
    });
  }

  function studioIdentityAnchor(mount) {
    if (!mount) return null;
    return (
      $(".studio-toolbar", mount) ||
      $("#studioExpandAllBtn", mount)?.closest(".studio-toolbar") ||
      $(".studio-workbench-hero", mount) ||
      $(".review-hero", mount)
    );
  }

  function placeStudioIdentityEditor(mount, editor) {
    if (!mount || !editor) return;
    const anchor = studioIdentityAnchor(mount);
    if (anchor && anchor.nextElementSibling !== editor)
      anchor.insertAdjacentElement("afterend", editor);
    else if (!anchor && mount.firstElementChild !== editor)
      mount.insertBefore(editor, mount.firstElementChild || null);
  }

  function refreshStudioEditor() {
    const old = $("#genreIdentityWorkbench");
    if (!old) return;
    const mount = old.closest("#reviewContent") || $("#reviewContent");
    old.outerHTML = renderIdentityEditor();
    const editor = $("#genreIdentityWorkbench", mount || document);
    if (mount && editor) placeStudioIdentityEditor(mount, editor);
    installEditorEvents(editor);
  }

  function injectStudioEditor() {
    const mount = $("#reviewContent");
    if (!mount) return;
    let editor = $("#genreIdentityWorkbench", mount);
    if (!editor) {
      const anchor = studioIdentityAnchor(mount);
      if (anchor) anchor.insertAdjacentHTML("afterend", renderIdentityEditor());
      else mount.insertAdjacentHTML("afterbegin", renderIdentityEditor());
      editor = $("#genreIdentityWorkbench", mount);
    }
    placeStudioIdentityEditor(mount, editor);
    installEditorEvents(editor);
  }

  function patchManualSpinSearch() {
    const original = window.searchGenresInto;
    if (typeof original !== "function" || original.__identityWrapped) return;
    const wrapped = function (inputEl, resultsEl) {
      const q = String(inputEl?.value || "").trim();
      if (!q) return original.apply(this, arguments);
      const nq = norm(q);
      const matches = genres()
        .map((g) => {
          const name = norm(g.genre || "");
          const aliases = searchAliasList(g).map(norm);
          const exactAlias = aliases.includes(nq);
          let score = 9;
          if (name === nq) score = 0;
          else if (exactAlias) score = 1;
          else if (name.startsWith(nq)) score = 2;
          else if (aliases.some((a) => a.startsWith(nq))) score = 3;
          else if (name.includes(nq)) score = 4;
          else if (aliases.some((a) => a.includes(nq))) score = 5;
          else if (searchText(g).includes(nq)) score = 6;
          return { g, score };
        })
        .filter((x) => x.score < 9)
        .sort(
          (a, b) =>
            a.score - b.score ||
            String(a.g.genre || "").localeCompare(String(b.g.genre || "")),
        )
        .slice(0, 12);
      if (!matches.length) return original.apply(this, arguments);
      resultsEl.innerHTML = matches
        .map(({ g, score }) => {
          const aliases = searchAliasList(g);
          const aliasHit = aliases.find((a) => norm(a).includes(nq));
          return `<button type="button" class="list-item dc-manual-result-card" data-id="${esc(String(g.id ?? ""))}"><strong>${esc(g.genre || "Unknown")}</strong><div class="small" style="margin-top:6px;">${esc(typeof categoryLine === "function" ? categoryLine(g) : g.category_path || g.subcategory || "")}${aliasHit ? ` · ${esc(aliasHit)}` : ""}</div></button>`;
        })
        .join("");
      $$("[data-id]", resultsEl).forEach((btn) => {
        btn.onclick = () => {
          const picked = findGenre(btn.dataset.id);
          if (!picked) return;
          if (typeof openGenreDetail === "function")
            openGenreDetail(picked, false);
        };
      });
    };
    wrapped.__identityWrapped = true;
    window.searchGenresInto = wrapped;
  }

  function patchStatsFocusAliases() {
    if (
      typeof window.dgStatsGenreFocusCandidates === "function" &&
      !window.dgStatsGenreFocusCandidates.__identityWrapped
    ) {
      const original = window.dgStatsGenreFocusCandidates;
      const wrapped = function () {
        return original.apply(this, arguments).map((c) => {
          const g = findGenre(c.id);
          const aliasText = searchAliasList(g).join(" ");
          return {
            ...c,
            search: norm(
              [c.name, aliasText, g?.category_path, g?.subcategory].join(" "),
            ),
          };
        });
      };
      wrapped.__identityWrapped = true;
      window.dgStatsGenreFocusCandidates = wrapped;
    }
  }

  function patchLibraryAliasFallback() {
    const original = window.renderHistory;
    if (typeof original !== "function" || original.__identityWrapped) return;
    function wrapped() {
      const search = $("#archiveSearchInput");
      const raw = search?.value || "";
      const result = original.apply(this, arguments);
      if (search && raw.trim()) {
        setTimeout(() => {
          const list = $("#historyList");
          if (!list || list.querySelector(".archive-card")) return;
          const matches = genres().filter((g) =>
            aliasList(g).some(
              (a) => norm(a).includes(norm(raw)) || norm(raw).includes(norm(a)),
            ),
          );
          if (!matches.length) return;
          const previous = search.value;
          search.value = matches[0].genre || previous;
          try {
            original.apply(this, arguments);
          } finally {
            search.value = previous;
          }
        }, 0);
      }
      return result;
    }
    wrapped.__identityWrapped = true;
    window.renderHistory = wrapped;
  }

  function patchListenLoadForDna() {
    const original =
      typeof loadListenScreen === "function" ? loadListenScreen : null;
    if (!original || original.__identityDnaWrapped) return;
    const wrapped = function identityWrappedLoadListenScreen(genre, ...rest) {
      if (genre && typeof genre === "object") lastListenGenre = genre;
      const result = original.call(this, genre, ...rest);
      setTimeout(() => { injectDnaCard(genre); injectDetailIdentityImport(genre); }, 40);
      setTimeout(() => { injectDnaCard(genre); injectDetailIdentityImport(genre); }, 180);
      return result;
    };
    wrapped.__identityDnaWrapped = true;
    loadListenScreen = wrapped;
  }

  function installNavigationHistory() {
    if (window.__dailyGenreUxHistoryInstalled) return;
    if (typeof window.history?.pushState !== "function") return;
    window.__dailyGenreUxHistoryInstalled = true;
    let suppress = false;
    const activeScreen = () =>
      document.querySelector(".screen.active")?.id?.replace(/^screen-/, "") ||
      "spin";
    const screenUrl = (name) => {
      const base = `${location.pathname}${location.search}`;
      return name === "spin"
        ? base
        : `${base}#screen=${encodeURIComponent(name)}`;
    };
    const genreUrl = (id) =>
      `${location.pathname}${location.search}#genre=${encodeURIComponent(String(id))}`;
    const stateForScreen = (name) => ({
      dgUxNav: true,
      type: "screen",
      screen: name || "spin",
    });
    const stateForGenre = (genre, editMode) => ({
      dgUxNav: true,
      type: "genre",
      genreId: String(genre?.id ?? ""),
      editMode: !!editMode,
    });

    try {
      const hashGenre = location.hash.match(/^#genre=(.+)$/);
      const hashScreen = location.hash.match(/^#screen=(.+)$/);
      if (hashGenre)
        history.replaceState(
          {
            dgUxNav: true,
            type: "genre",
            genreId: decodeURIComponent(hashGenre[1]),
          },
          "",
          location.href,
        );
      else if (hashScreen)
        history.replaceState(
          stateForScreen(decodeURIComponent(hashScreen[1])),
          "",
          location.href,
        );
      else
        history.replaceState(stateForScreen(activeScreen()), "", location.href);
    } catch (_) {}

    const originalSwitch = window.switchScreen;
    if (
      typeof originalSwitch === "function" &&
      !originalSwitch.__dgUxHistoryWrapped
    ) {
      const wrappedSwitch = function dgUxSwitchScreen(name, options = {}) {
        const result = originalSwitch.apply(this, arguments);
        if (
          result !== false &&
          !suppress &&
          name !== "listen" &&
          !options.skipHistory
        ) {
          try {
            const nextUrl = screenUrl(name);
            if (
              location.hash !==
              (name === "spin" ? "" : `#screen=${encodeURIComponent(name)}`)
            ) {
              history.pushState(stateForScreen(name), "", nextUrl);
            }
          } catch (_) {}
        }
        return result;
      };
      wrappedSwitch.__dgUxHistoryWrapped = true;
      window.switchScreen = wrappedSwitch;
    }

    const originalOpen = window.openGenreDetail;
    if (
      typeof originalOpen === "function" &&
      !originalOpen.__dgUxHistoryWrapped
    ) {
      const wrappedOpen = function dgUxOpenGenreDetail(
        genre,
        editMode = false,
        options = {},
      ) {
        if (genre && !suppress && !options.skipHistory && genre.id != null) {
          try {
            const targetHash = `#genre=${encodeURIComponent(String(genre.id))}`;
            if (location.hash !== targetHash)
              history.pushState(
                stateForGenre(genre, editMode),
                "",
                genreUrl(genre.id),
              );
          } catch (_) {}
        }
        const result = originalOpen.apply(this, arguments);
        if (result !== false && genre?.id != null) {
          try {
            history.replaceState(
              stateForGenre(genre, editMode),
              "",
              genreUrl(genre.id),
            );
          } catch (_) {}
        }
        return result;
      };
      wrappedOpen.__dgUxHistoryWrapped = true;
      window.openGenreDetail = wrappedOpen;
    }

    window.addEventListener("popstate", (event) => {
      const st = event.state || {};
      const genreMatch = location.hash.match(/^#genre=(.+)$/);
      const screenMatch = location.hash.match(/^#screen=(.+)$/);
      suppress = true;
      try {
        if (st.type === "genre" || genreMatch) {
          const id = st.genreId || decodeURIComponent(genreMatch?.[1] || "");
          const g = findGenre(id);
          if (g && typeof window.openGenreDetail === "function")
            window.openGenreDetail(g, !!st.editMode, {
              force: true,
              skipHistory: true,
            });
          else if (typeof window.switchScreen === "function")
            window.switchScreen("spin", { force: true, skipHistory: true });
        } else {
          const screen =
            st.screen ||
            (screenMatch ? decodeURIComponent(screenMatch[1]) : "spin");
          if (typeof window.switchScreen === "function")
            window.switchScreen(screen || "spin", {
              force: true,
              skipHistory: true,
            });
        }
      } finally {
        suppress = false;
      }
    });
  }

  function installFloatingSaveControls() {
    if (window.__dailyGenreFloatingSaveControls) return;
    window.__dailyGenreFloatingSaveControls = true;
    document.addEventListener(
      "click",
      (event) => {
        const move = event.target.closest("[data-floating-save-move]");
        const collapse = event.target.closest("[data-floating-save-collapse]");
        if (!move && !collapse) return;
        const bar = document.getElementById("floatingListeningSave");
        if (!bar) return;
        if (move) {
          const positions = ["", "is-left", "is-top", "is-top is-left"];
          const current = bar.dataset.positionIndex
            ? Number(bar.dataset.positionIndex)
            : 0;
          const next = (current + 1) % positions.length;
          bar.classList.remove("is-left", "is-top");
          positions[next]
            .split(/\s+/)
            .filter(Boolean)
            .forEach((c) => bar.classList.add(c));
          bar.dataset.positionIndex = String(next);
        }
        if (collapse) {
          const minimized = !bar.classList.contains("is-minimized");
          bar.classList.toggle("is-minimized", minimized);
          collapse.textContent = minimized ? "+" : "×";
          collapse.setAttribute(
            "aria-label",
            minimized ? "Expand save bar" : "Collapse save bar",
          );
          collapse.title = minimized ? "Expand save bar" : "Collapse save bar";
        }
      },
      true,
    );
  }

  function boot() {
    installNavigationHistory();
    installFloatingSaveControls();
    patchListenLoadForDna();
    patchManualSpinSearch();
    patchStatsFocusAliases();
    patchLibraryAliasFallback();
    injectDnaCard();
    injectDetailIdentityImport();
    if ($("#screen-review")?.classList.contains("active")) injectStudioEditor();
    document.addEventListener(
      "click",
      (ev) => {
        if (ev.target.closest('[data-screen="review"], #screen-review'))
          setTimeout(injectStudioEditor, 80);
        if (ev.target.closest('[data-screen="listen"], #screen-listen'))
          setTimeout(() => { injectDnaCard(); injectDetailIdentityImport(); }, 80);
      },
      true,
    );
    // Do not observe the whole document body. That made Studio feel laggy because
    // every render/micro-update in the workbench retriggered identity injection.
    // The explicit render wrappers and tab-click hooks above are enough for Studio;
    // this small scoped observer only helps when the Dig details area is rebuilt
    // asynchronously after a genre opens.
    const listenRoot = $("#screen-listen");
    if (listenRoot && typeof MutationObserver === "function") {
      let listenTimer = null;
      const observer = new MutationObserver(() => {
        clearTimeout(listenTimer);
        listenTimer = setTimeout(() => { injectDnaCard(); injectDetailIdentityImport(); }, 120);
      });
      observer.observe(listenRoot, { childList: true, subtree: true });
    }
  }

  window.DailyGenreIdentity = {
    version: VERSION,
    aliases: aliasList,
    searchText,
    looksLikeIdentityBlock,
    parseIdentityBlock,
    importStructuredIdentityBlock,
    injectDetailIdentityImport,
    syncIdentityTracksToSongQueue,
    ensureIdentityTracksInSongQueue,
    detachIdentityFlagsFromSongQueue,
    purgeIdentityRowsFromSongQueue,
    updateTrackFromQueueOverwrite,
    openStudio(id) {
      selectedGenreId = String(id || selectedGenreId || "");
      if (typeof switchScreen === "function") switchScreen("review");
      setTimeout(() => {
        injectStudioEditor();
        refreshStudioEditor();
        const workbench = $("#genreIdentityWorkbench");
        if (workbench) {
          workbench.classList.remove("studio-section-collapsed");
          const btn = workbench.querySelector(".studio-collapse-btn");
          if (btn) {
            btn.setAttribute("aria-expanded", "true");
            btn.innerHTML =
              '<span aria-hidden="true">−</span><strong>Collapse</strong>';
          }
          workbench.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 80);
    },
    openGenre(id) {
      const g = findGenre(id) || bestGenreMatch(id);
      if (!g) return toast("Could not find that genre.", true);
      lastListenGenre = g;
      const openDetail = window.openGenreDetail || (typeof openGenreDetail === "function" ? openGenreDetail : null);
      try {
        if (typeof openDetail === "function") {
          const ok = openDetail(g, false, { force: true });
          if (ok !== false) {
            setTimeout(() => { injectDnaCard(g); injectDetailIdentityImport(g); }, 120);
            return;
          }
        }
      } catch (error) { console.warn("Genre identity openGenre failed", error); }
      try {
        if (typeof window.openGenreByIdEncoded === "function") {
          window.openGenreByIdEncoded(encodeURIComponent(String(g.id ?? "")), false);
          setTimeout(() => { injectDnaCard(g); injectDetailIdentityImport(g); }, 120);
          return;
        }
      } catch (_) {}
      try {
        if (typeof switchScreen === "function") switchScreen("listen", { force: true });
        const mount = document.getElementById("listenDetails");
        if (mount)
          mount.innerHTML = `<div class="panel"><h2>${esc(g.genre || "Genre")}</h2><p class="small">Open Genre Detail was not available. Try opening this genre from Library.</p></div>`;
      } catch (_) {}
    },
    apply: function () {
      injectStudioEditor();
      injectDnaCard();
      patchManualSpinSearch();
      patchStatsFocusAliases();
      patchLibraryAliasFallback();
    },
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* Daily Genre v65 cache-bust marker */

/* Daily Genre v226: identity listening lanes stay separate from queue order; matching queue rows get badges in place. */
