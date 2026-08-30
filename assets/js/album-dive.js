/* === Album Dive feature === */
let albumDivePanelOpen = false;
let albumDiveQueueOpen = false;

const ALBUM_DIVE_SLOT_DEFS = [
  ["breakout", "Breakout"],
  ["originator", "Originator"],
  ["archetype", "Archetype"],
  ["consensus", "Consensus"],
  ["popular", "Popular"],
  ["purist", "Purist"],
  ["cult_hit", "Cult Hit"],
  ["modern", "Modern"],
  ["revival", "Revival"],
  ["wave", "Wave"],
];

function albumDiveCleanPastedRefs(value = "") {
  const cleaner = typeof cleanPastedCitationArtifacts === "function" ? cleanPastedCitationArtifacts : null;
  const cleaned = cleaner ? cleaner(value) : String(value || "");
  return cleaned
    .replace(/\[(?:web|file):\s*[^\]]+\]/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function albumDiveJsonImportMarkup(id = "albumDiveJsonImport") {
  return `<div class="album-dive-json-import">
    <div class="album-dive-json-head">
      <div>
        <label for="${id}">Paste structured Album Dive JSON</label>
        <p class="small">Drop in the full album list; it will fill Breakout, Originator, Archetype, Consensus, etc. Manual slot editing still works below.</p>
      </div>
      <button type="button" class="btn btn-primary btn-tiny" onclick="importAlbumDiveJson('${id}')">Import JSON</button>
    </div>
    <textarea id="${id}" rows="8" placeholder='[{"type":"Breakout","album":"...","artist":"...","spotify_url":"https://open.spotify.com/album/...","year":1991,"reason":"..."}]'></textarea>
  </div>`;
}

function defaultAlbumDiveSlot(key, label) {
  return {
    key,
    label,
    album: "",
    artist: "",
    year: null,
    releaseDate: "",
    albumType: "",
    totalTracks: null,
    rationale: "",
    spotifyAlbumUrl: "",
    spotifyAlbumId: "",
    spotifyUrl: "",
    itunesAlbumUrl: "",
    appleAlbumUrl: "",
    itunesCollectionId: "",
    albumProviderUrl: "",
    metadataSource: "",
    albumArt: "",
    manualAlbumArt: "",
    tracks: [],
    listenState: "not_started",
    rating: null,
    albumReaction: null,
    favoriteAlbum: false,
    topTracks: [],
    favoriteSong: {
      title: "",
      artist: "",
      spotifyTrackUrl: "",
      spotifyTrackId: "",
      itunesTrackUrl: "",
      itunesTrackId: "",
      previewUrl: "",
      albumArt: "",
      durationMs: null,
      trackNumber: null,
      discNumber: null,
      note: "",
      promotedToSongLog: false,
    },
    standoutTracks: [],
    spawnedSongs: [],
    notes: "",
  };
}

function normalizeAlbumDiveTrack(raw = {}) {
  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .map((a) => (typeof a === "string" ? a : a?.name))
        .filter(Boolean)
    : [];
  return {
    title: raw.title || raw.name || "",
    artist: raw.artist || artists.join(", ") || "",
    artists,
    spotifyTrackUrl:
      raw.spotifyTrackUrl || raw.spotifyUrl || raw.external_urls?.spotify || "",
    spotifyTrackId: raw.spotifyTrackId || raw.spotifyId || raw.id || "",
    itunesTrackUrl: raw.itunesTrackUrl || raw.appleTrackUrl || raw.trackViewUrl || "",
    itunesTrackId: raw.itunesTrackId || raw.appleTrackId || raw.trackId || "",
    previewUrl: raw.previewUrl || raw.preview_url || "",
    durationMs: Number(raw.durationMs || raw.duration_ms || raw.trackTimeMillis || 0) || null,
    trackNumber: Number(raw.trackNumber || raw.track_number || 0) || null,
    discNumber: Number(raw.discNumber || raw.disc_number || 0) || null,
    reaction: [1, 2, 3].includes(Number(raw.reaction))
      ? Number(raw.reaction)
      : null,
    note: raw.note || "",
  };
}

function normalizeAlbumDiveSlot(raw, key, label) {
  const base = defaultAlbumDiveSlot(key, label);
  const slot = { ...base, ...(raw || {}) };
  slot.key = key;
  slot.label = slot.label || label;
  slot.year = slot.year ? Number(slot.year) : null;
  slot.rating = slot.rating ? Number(slot.rating) : null;
  slot.albumReaction = albumDiveSlotReaction(slot);
  slot.favoriteAlbum = Boolean(slot.favoriteAlbum);
  slot.totalTracks = slot.totalTracks ? Number(slot.totalTracks) : null;
  slot.itunesCollectionId = String(slot.itunesCollectionId || slot.appleCollectionId || slot.collectionId || "");
  slot.itunesAlbumUrl = slot.itunesAlbumUrl || slot.appleAlbumUrl || slot.collectionViewUrl || "";
  slot.albumProviderUrl = slot.albumProviderUrl || slot.spotifyAlbumUrl || slot.spotifyUrl || slot.itunesAlbumUrl || slot.appleAlbumUrl || "";
  slot.metadataSource = slot.metadataSource || (slot.spotifyAlbumId || slot.spotifyAlbumUrl || slot.spotifyUrl ? "spotify" : slot.itunesCollectionId || slot.itunesAlbumUrl || slot.appleAlbumUrl ? "itunes" : "");
  slot.favoriteSong = { ...base.favoriteSong, ...(slot.favoriteSong || {}) };
  slot.favoriteSong.durationMs = slot.favoriteSong.durationMs
    ? Number(slot.favoriteSong.durationMs)
    : null;
  slot.favoriteSong.trackNumber = slot.favoriteSong.trackNumber
    ? Number(slot.favoriteSong.trackNumber)
    : null;
  slot.favoriteSong.discNumber = slot.favoriteSong.discNumber
    ? Number(slot.favoriteSong.discNumber)
    : null;
  slot.tracks = Array.isArray(slot.tracks)
    ? slot.tracks
        .map(normalizeAlbumDiveTrack)
        .filter((t) => t.title || t.spotifyTrackId || t.spotifyTrackUrl)
    : [];
  slot.topTracks = Array.isArray(slot.topTracks) ? slot.topTracks : [];
  if (!slot.topTracks.length && slot.favoriteSong?.title) {
    const favValue = slot.favoriteSong.spotifyTrackId || slot.favoriteSong.spotifyTrackUrl || slot.favoriteSong.itunesTrackId || slot.favoriteSong.itunesTrackUrl || slot.favoriteSong.title;
    if (favValue) slot.topTracks = [String(favValue)];
  }
  slot.standoutTracks = Array.isArray(slot.standoutTracks)
    ? slot.standoutTracks
    : [];
  slot.spawnedSongs = Array.isArray(slot.spawnedSongs) ? slot.spawnedSongs : [];
  return slot;
}

function normalizeAlbumDive(genre, create = false) {
  if (!genre) return null;
  if (!genre.albumDive && !create) return null;
  const existing = genre.albumDive || {};
  const existingSlots = Array.isArray(existing.slots) ? existing.slots : [];
  const slotDefKeys = new Set(ALBUM_DIVE_SLOT_DEFS.map(([key]) => key));
  const deletedKeys = new Set(
    Array.isArray(existing.deletedSlotKeys) ? existing.deletedSlotKeys : [],
  );
  const byKey = Object.fromEntries(
    existingSlots.map((slot) => [slot?.key, slot]),
  );
  const slots = ALBUM_DIVE_SLOT_DEFS.flatMap(([key, label]) => {
    const rawSlot = byKey[key];
    const hasSavedContent = albumDiveSlotHasContent(rawSlot);
    if (deletedKeys.has(key) && !hasSavedContent) return [];
    if (hasSavedContent) deletedKeys.delete(key);
    return [normalizeAlbumDiveSlot(rawSlot, key, label)];
  });
  const normalized = {
    enabled: existing.enabled !== false,
    mode: existing.mode || "canon",
    status: existing.status || "not_started",
    summary: existing.summary || "",
    verdict: existing.verdict || "",
    verdictImpact: ({ reinforced: "better", complicated: "no_change", weakened: "worse" }[existing.verdictImpact] || existing.verdictImpact || ""),
    slots,
    deletedSlotKeys: [...deletedKeys].filter((key) => slotDefKeys.has(key)),
    completedAt: existing.completedAt || "",
    lastWorkedAt: existing.lastWorkedAt || "",
  };
  genre.albumDive = normalized;
  return normalized;
}

function albumDiveEligible(genre) {
  const n = numericRating(genre);
  return n >= 3;
}

function albumDiveProgress(dive) {
  const slots = dive?.slots || [];
  const finished = slots.filter(
    (slot) =>
      slot.listenState === "finished" || slot.listenState === "completed",
  ).length;
  const sampled = slots.filter((slot) => slot.listenState === "sampled").length;
  const fetched = slots.filter(
    (slot) =>
      slot.spotifyAlbumId || slot.itunesCollectionId || slot.albumArt || (slot.tracks || []).length,
  ).length;
  return {
    finished,
    sampled,
    fetched,
    total: slots.length || ALBUM_DIVE_SLOT_DEFS.length,
  };
}

function albumDiveCtaText(genre) {
  const n = numericRating(genre);
  if (n >= 5) return "Build the Shelf";
  if (n === 4) return "Start Canon Dive";
  if (n === 3) return "Interrogate Through Albums";
  return "Start Album Dive";
}

function albumDiveArtUrl(slot) {
  return (
    slot?.albumArt || slot?.manualAlbumArt || slot?.favoriteSong?.albumArt || ""
  );
}

function albumDiveArtHtml(slot) {
  const src = albumDiveArtUrl(slot);
  return src
    ? `<img class="album-slot-art" src="${escapeHtml(src)}" alt="${escapeHtml(slot.album || "Album art")}" loading="lazy">`
    : '<div class="album-slot-art" aria-hidden="true"></div>';
}

const albumDiveAmbientColorCache = new Map();
let albumDiveEditorMode = false;

function albumDiveFallbackAccent(value = "") {
  const palette = [
    [189, 44, 38],
    [211, 129, 32],
    [43, 103, 137],
    [91, 69, 149],
    [41, 115, 82],
    [148, 70, 101],
    [86, 76, 58],
  ];
  let hash = 0;
  String(value || "album")
    .split("")
    .forEach((ch) => {
      hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
    });
  return palette[Math.abs(hash) % palette.length];
}

function albumDiveNormalizeAccent(rgb) {
  const [r, g, b] = rgb.map((n) =>
    Math.max(0, Math.min(255, Math.round(Number(n) || 0))),
  );
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r / 255) h = ((g / 255 - b / 255) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g / 255) h = ((b / 255 - r / 255) / d + 2) / 6;
    else h = ((r / 255 - g / 255) / d + 4) / 6;
  }
  s = Math.max(0.42, Math.min(0.78, s * 1.2));
  l = Math.max(0.34, Math.min(0.54, l));
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let rr;
  let gg;
  let bb;
  if (s === 0) {
    rr = gg = bb = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = hue2rgb(p, q, h + 1 / 3);
    gg = hue2rgb(p, q, h);
    bb = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
}

function albumDiveExtractAverageColor(src) {
  if (!src) return Promise.resolve(null);
  if (albumDiveAmbientColorCache.has(src))
    return Promise.resolve(albumDiveAmbientColorCache.get(src));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 28;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 16) {
          const alpha = data[i + 3];
          if (alpha < 180) continue;
          const rr = data[i];
          const gg = data[i + 1];
          const bb = data[i + 2];
          const light = (rr + gg + bb) / 3;
          const chroma = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
          if (light > 246 || light < 12) continue;
          const weight = 1 + chroma / 90;
          r += rr * weight;
          g += gg * weight;
          b += bb * weight;
          total += weight;
        }
        if (!total) throw new Error("No usable pixels");
        const accent = albumDiveNormalizeAccent([
          r / total,
          g / total,
          b / total,
        ]);
        albumDiveAmbientColorCache.set(src, accent);
        resolve(accent);
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function albumDiveSetAmbientVars(rgb) {
  const panel = document.getElementById("albumDivePanel");
  if (!panel || !rgb) return;
  const [r, g, b] = rgb;
  panel.style.setProperty("--album-accent-rgb", `${r}, ${g}, ${b}`);
  panel.style.setProperty("--album-accent", `rgb(${r} ${g} ${b})`);
  panel.classList.add("has-album-accent");
}

function hydrateAlbumDiveAmbient() {
  const panel = document.getElementById("albumDivePanel");
  const dive = normalizeAlbumDive(currentGenre, false);
  if (!panel || !dive?.slots?.length || !albumDiveIsListenMode()) return;
  const selectedKey = getAlbumDiveFocusSlotKey(dive);
  const slot =
    dive.slots.find((item) => item.key === selectedKey) || dive.slots[0];
  const art = albumDiveArtUrl(slot);
  const fallback = albumDiveFallbackAccent(
    `${slot?.album || ""} ${slot?.artist || ""} ${slot?.label || ""}`,
  );
  albumDiveSetAmbientVars(fallback);
  if (!art) return;
  albumDiveExtractAverageColor(art).then((rgb) => {
    const latest = normalizeAlbumDive(currentGenre, false);
    if (!rgb || !latest || getAlbumDiveFocusSlotKey(latest) !== selectedKey)
      return;
    albumDiveSetAmbientVars(rgb);
  });
}

function albumDiveIsListenMode() {
  const screen = document.getElementById("screen-listen");
  const focusMode =
    typeof getListeningFocusMode === "function" ? getListeningFocusMode(currentGenre) : "songs";
  return (
    !!screen &&
    screen.classList.contains("active") &&
    focusMode === "albums" &&
    !albumDiveEditorMode
  );
}

function setAlbumDiveEditorMode(enabled) {
  albumDiveEditorMode = !!enabled;
  rerenderAlbumDive({ preserveScroll: true });
  setTimeout(() => {
    document
      .getElementById("albumDivePanel")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

function albumDiveStorageKey() {
  const id = currentGenre?.id || currentGenre?.genre || "default";
  return `dailyGenreAlbumDiveFocusSlot:${id}`;
}


const ALBUM_DIVE_ACTIVE_STATE_KEY = "dailyGenreActiveAlbumDive:v1";

function albumDiveGenreStateId(genre = currentGenre) {
  return String(genre?.id ?? genre?.genre ?? "");
}

function albumDiveReadActiveState() {
  try {
    return JSON.parse(localStorage.getItem(ALBUM_DIVE_ACTIVE_STATE_KEY) || "null") || null;
  } catch {
    return null;
  }
}

function albumDiveWriteActiveState(state) {
  try {
    localStorage.setItem(ALBUM_DIVE_ACTIVE_STATE_KEY, JSON.stringify(state || {}));
  } catch {}
  if (typeof window.refreshTopAlbumDiveButton === "function") {
    window.refreshTopAlbumDiveButton();
  }
}

function albumDiveActiveStateForCurrent(slotKey = "") {
  const dive = normalizeAlbumDive(currentGenre, false);
  const selectedSlotKey = slotKey || getAlbumDiveFocusSlotKey(dive);
  const slot = (dive?.slots || []).find((item) => item.key === selectedSlotKey) || null;
  return {
    genreId: albumDiveGenreStateId(currentGenre),
    genreName: currentGenre?.genre || "",
    slotKey: selectedSlotKey || "",
    slotLabel: slot?.label || "",
    albumTitle: slot?.album || "",
    mode: "albums",
    updatedAt: new Date().toISOString(),
  };
}

function albumDiveCurrentGenreIsActiveDive() {
  const active = albumDiveReadActiveState();
  return !!active && !!currentGenre && String(active.genreId || "") === albumDiveGenreStateId(currentGenre);
}

function albumDiveMaybeUpdateActiveSlot(slotKey) {
  if (!albumDiveCurrentGenreIsActiveDive()) return;
  albumDiveWriteActiveState(albumDiveActiveStateForCurrent(slotKey));
}

function albumDiveActiveChipMarkup(dive, selectedKey) {
  if (!albumDiveCurrentGenreIsActiveDive()) return "";
  const progress = albumDiveProgress(dive);
  const started = (progress.sampled || 0) + (progress.finished || 0);
  const slot = (dive?.slots || []).find((item) => item.key === selectedKey);
  const albumText = slot?.album ? ` · ${slot.album}` : "";
  return `<div class="album-dive-active-chip" title="This is your active Album Dive session">Album Dive active · ${started}/${progress.total} albums sampled${escapeHtml(albumText)}</div>`;
}

function albumDiveInstantScrollTo(x, y) {
  try {
    window.scrollTo({ left: x, top: y, behavior: "instant" });
  } catch {
    window.scrollTo(x, y);
  }
}

function albumDivePreserveViewport(callback) {
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  const active = document.activeElement;
  const root = document.documentElement;
  const body = document.body;
  const panel = document.getElementById("albumDivePanel");
  const previousMinHeight = panel?.style?.minHeight || "";
  if (panel) panel.style.minHeight = `${Math.max(panel.offsetHeight || 0, 1)}px`;
  if (active && typeof active.blur === "function") {
    try { active.blur(); } catch {}
  }
  root?.classList?.add("dg-album-dive-scroll-lock");
  body?.classList?.add("dg-album-dive-scroll-lock");
  const restore = () => albumDiveInstantScrollTo(scrollX, scrollY);
  const release = () => {
    const latestPanel = document.getElementById("albumDivePanel");
    if (latestPanel) latestPanel.style.minHeight = previousMinHeight;
    root?.classList?.remove("dg-album-dive-scroll-lock");
    body?.classList?.remove("dg-album-dive-scroll-lock");
  };
  try {
    callback?.();
  } finally {
    restore();
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
    setTimeout(restore, 0);
    setTimeout(restore, 40);
    setTimeout(restore, 120);
    setTimeout(restore, 260);
    setTimeout(() => { restore(); release(); }, 520);
  }
}

function albumDiveSlotHasContent(slot) {
  const fav = slot?.favoriteSong || {};
  return !!(
    slot?.album ||
    slot?.artist ||
    slot?.albumArt ||
    slot?.manualAlbumArt ||
    slot?.spotifyAlbumUrl ||
    slot?.spotifyUrl ||
    slot?.itunesAlbumUrl ||
    slot?.appleAlbumUrl ||
    slot?.albumProviderUrl ||
    slot?.notes ||
    slot?.rationale ||
    fav.title ||
    (slot?.tracks || []).length
  );
}

function getAlbumDiveFocusSlotKey(dive) {
  const slots = dive?.slots || [];
  if (!slots.length) return "";
  try {
    const saved = localStorage.getItem(albumDiveStorageKey()) || "";
    if (saved && slots.some((slot) => slot.key === saved)) return saved;
  } catch {}
  return (slots.find(albumDiveSlotHasContent) || slots[0]).key;
}

function setAlbumDiveFocusSlot(slotKey, options = {}) {
  if (options.event) { options.event.preventDefault?.(); options.event.stopPropagation?.(); }
  const panel = document.getElementById("albumDivePanel");
  if (panel) albumDivePanelOpen = !!panel.open;
  if (options.preserveQueue) albumDiveQueueOpen = true;
  try {
    localStorage.setItem(albumDiveStorageKey(), slotKey || "");
  } catch {}
  albumDiveMaybeUpdateActiveSlot(slotKey || "");

  // In listening mode, changing the focused album should feel like moving a
  // carousel, not like rebuilding the whole Album Dive section. Replacing only
  // the focused view prevents the browser from jumping down to the queue and
  // then snapping back up.
  if (albumDiveIsListenMode() && document.querySelector(".album-focus-view")) {
    albumDiveReplaceFocusViewInPlace({ preserveScroll: !!options.preserveScroll });
    return;
  }

  rerenderAlbumDive({ preserveScroll: true });
}

function albumDiveReactionEmoji(value) {
  return Number(value) === 3
    ? "👍"
    : Number(value) === 2
      ? "🤷"
      : Number(value) === 1
        ? "👎"
        : "—";
}

function albumDiveReactionLabel(value) {
  return Number(value) === 3
    ? "Up"
    : Number(value) === 2
      ? "Meh"
      : Number(value) === 1
        ? "Down"
        : "Unrated";
}


function albumDiveSlotCopySummary(slot = {}) {
  const reaction = albumDiveSlotReaction(slot);
  const reactionLabel = reaction ? albumDiveReactionEmoji(reaction) : "unrated";
  const rawAlbum = slot.album || slot.albumTitle || "Untitled album";
  const album = albumDiveCleanEditionTitle(rawAlbum) || String(rawAlbum || "Untitled album").trim();
  const artist = String(slot.artist || slot.albumArtist || "Unknown artist").trim();
  const category = String(slot.label || slot.key || "Album").trim();
  const year = slot.year || (slot.releaseDate ? String(slot.releaseDate).slice(0, 4) : "");
  const favorite = slot.favoriteAlbum ? "🏆 favorite album" : "";
  const tail = [year, reactionLabel, favorite].filter(Boolean).join(" · ");
  return `* [${category}] ${artist} — ${album}${tail ? `: ${tail}` : ""}`;
}

function buildAlbumDiveStatsCopy(genre = currentGenre) {
  const dive = normalizeAlbumDive(genre, false);
  const slots = (dive?.slots || []).filter(albumDiveSlotHasContent);
  if (!genre || !slots.length) return "";
  const header = `Album Dive — ${genre.genre || "Unknown genre"}`;
  const lines = [header, ...slots.map(albumDiveSlotCopySummary)];
  const verdictMap = { better: "made me like the genre better", no_change: "no change", worse: "made me like the genre worse" };
  const verdict = verdictMap[dive.verdictImpact] || dive.verdictImpact || "";
  if (verdict) lines.push(`Overall: ${verdict}`);
  return lines.join("\n");
}

async function copyAlbumDiveStats(genre = currentGenre) {
  const text = buildAlbumDiveStatsCopy(genre);
  if (!text) {
    if (typeof showSaveToast === "function") showSaveToast("No Album Dive stats to copy yet.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    if (typeof showSaveToast === "function") showSaveToast("Album Dive stats copied.", false);
  } catch (error) {
    console.warn("Could not copy Album Dive stats", error);
    if (typeof showSaveToast === "function") showSaveToast("Could not copy Album Dive stats.", true);
  }
}

window.copyAlbumDiveStats = copyAlbumDiveStats;

function albumDiveReactionFromLegacyRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 4) return 3;
  if (n >= 2) return 2;
  return 1;
}

function albumDiveSlotReaction(slot = {}) {
  const direct = Number(slot.albumReaction ?? slot.reaction);
  if ([1, 2, 3].includes(direct)) return direct;
  return albumDiveReactionFromLegacyRating(slot.rating);
}

function albumDiveMarkSlotSampled(slot = {}) {
  if (!slot || typeof slot !== "object") return false;
  const state = String(slot.listenState || "not_started").toLowerCase();
  if (["sampled", "finished", "completed"].includes(state)) return false;
  slot.listenState = "sampled";
  return true;
}

function albumDiveReactionButtons(slotKey, currentValue, compact = false) {
  const safeKey = escapeHtml(slotKey);
  return `<div class="album-reaction-buttons ${compact ? "compact" : ""}" aria-label="Album reaction" data-album-slot-key="${safeKey}">
    ${[3, 2, 1].map((value) => `<button type="button" class="album-reaction-btn ${Number(currentValue) === value ? "active" : ""}" data-album-slot-key="${safeKey}" data-album-reaction="${value}" onclick="setAlbumDiveSlotReaction('${safeKey}', ${value}, event)" title="${albumDiveReactionLabel(value)}" aria-label="${albumDiveReactionLabel(value)}"><span>${albumDiveReactionEmoji(value)}</span><small>${albumDiveReactionLabel(value)}</small></button>`).join("")}
  </div>`;
}

function albumDiveTopTrackValues(slot = {}) {
  const values = new Set();
  if (Array.isArray(slot.topTracks)) {
    slot.topTracks.forEach((item) => {
      if (typeof item === "string") values.add(item);
      else {
        const value = item?.value || item?.spotifyTrackId || item?.spotifyTrackUrl || item?.itunesTrackId || item?.itunesTrackUrl || item?.title || "";
        if (value) values.add(String(value));
      }
    });
  }
  if (!values.size && slot.favoriteSong?.title) {
    const fav = slot.favoriteSong;
    const value = fav.spotifyTrackId || fav.spotifyTrackUrl || fav.itunesTrackId || fav.itunesTrackUrl || fav.title;
    if (value) values.add(String(value));
  }
  return [...values];
}

function albumDiveTopTracks(slot = {}) {
  const selected = new Set(albumDiveTopTrackValues(slot));
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  return tracks.filter((track) => {
    const candidates = [
      albumDiveTrackOptionValue(track),
      track.spotifyTrackId,
      track.spotifyTrackUrl,
      track.itunesTrackId,
      track.itunesTrackUrl,
      track.title,
    ].filter(Boolean).map(String);
    return candidates.some((value) => selected.has(value));
  });
}

function albumDiveTopTrackSummary(slot = {}) {
  const tracks = albumDiveTopTracks(slot);
  if (!tracks.length) return "No top songs picked";
  return tracks.map((track) => track.artist && track.artist !== slot.artist ? `${track.artist} — ${track.title}` : track.title).filter(Boolean).join(" · ");
}

function albumDiveTrackReactionSummary(slot) {
  const counts = { 3: 0, 2: 0, 1: 0 };
  (slot?.tracks || []).forEach((track) => {
    if ([1, 2, 3].includes(Number(track.reaction)))
      counts[Number(track.reaction)] += 1;
  });
  const rated = counts[1] + counts[2] + counts[3];
  return rated ? ` · 👍 ${counts[3]} · 🤷 ${counts[2]} · 👎 ${counts[1]}` : "";
}

function albumDiveTrackReactionButtons(slotKey, track, compact = false) {
  const safeKey = escapeHtml(slotKey);
  const trackValue = escapeHtml(albumDiveTrackOptionValue(track));
  return `<div class="album-track-reactions ${compact ? "compact" : ""}" aria-label="Track reaction for ${escapeHtml(track.title || "album track")}" data-album-slot-key="${safeKey}" data-track-value="${trackValue}">
        ${[3, 2, 1].map((value) => `<button type="button" class="album-track-reaction-btn ${Number(track.reaction) === value ? "active" : ""}" data-album-slot-key="${safeKey}" data-track-value="${trackValue}" data-track-reaction="${value}" onclick="setAlbumDiveTrackReaction('${safeKey}', '${trackValue}', ${value}, event)" title="${albumDiveReactionLabel(value)}" aria-label="${albumDiveReactionLabel(value)}">${albumDiveReactionEmoji(value)}</button>`).join("")}
      </div>`;
}

function albumDiveTrackTopButton(slotKey, slot, track) {
  const value = albumDiveTrackOptionValue(track);
  const safeKey = escapeHtml(slotKey);
  const safeValue = escapeHtml(value);
  const selected = new Set(albumDiveTopTrackValues(slot));
  const candidates = [value, track.spotifyTrackId, track.spotifyTrackUrl, track.itunesTrackId, track.itunesTrackUrl, track.title].filter(Boolean).map(String);
  const active = candidates.some((candidate) => selected.has(candidate));
  return `<button type="button" class="album-track-top-btn ${active ? "active" : ""}" data-album-slot-key="${safeKey}" data-track-value="${safeValue}" onclick="toggleAlbumDiveTopTrack('${safeKey}', '${safeValue}', undefined, event)" title="${active ? "Remove top song" : "Mark as top song"}" aria-label="${active ? "Remove top song" : "Mark as top song"}">${active ? "★ Top" : "☆ Top"}</button>`;
}

function renderAlbumDiveTrackReactionRows(slot, safeKey) {
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  if (!tracks.length)
    return `<div class="album-focus-empty small">Fetch this album first to review its track list.</div>`;
  return `<div class="album-track-reaction-list album-track-queue-list">
        ${tracks
          .map((track) => {
            const meta = [
              track.discNumber && track.discNumber > 1 ? `D${track.discNumber}` : "",
              track.trackNumber ? `#${track.trackNumber}` : "",
              track.durationMs ? formatTrackDuration(track.durationMs) : "",
            ]
              .filter(Boolean)
              .join(" · ");
            const href = track.spotifyTrackUrl || track.itunesTrackUrl || "";
            return `<div class="album-track-reaction-row">
            <div class="album-track-reaction-main">
              <div class="album-track-title">${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(track.title || "Untitled track")} <span class="song-link-arrow">↗</span></a>` : escapeHtml(track.title || "Untitled track")}</div>
              <div class="album-track-meta">${escapeHtml([track.artist && track.artist !== slot.artist ? track.artist : "", meta].filter(Boolean).join(" · "))}</div>
            </div>
            <div class="album-track-row-actions">
              ${albumDiveTrackTopButton(safeKey, slot, track)}
              ${albumDiveTrackReactionButtons(safeKey, track, true)}
            </div>
          </div>`;
          })
          .join("")}
      </div>`;
}


function albumDiveSlotIndex(dive, selectedKey) {
  const slots = dive?.slots || [];
  const index = slots.findIndex((slot) => slot.key === selectedKey);
  return index >= 0 ? index : 0;
}

function albumDiveAdjacentSlot(dive, selectedKey, direction) {
  const slots = dive?.slots || [];
  if (!slots.length) return null;
  const index = albumDiveSlotIndex(dive, selectedKey);
  const nextIndex = (index + direction + slots.length) % slots.length;
  return slots[nextIndex] || null;
}

function setAlbumDiveFocusRelative(direction, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const dive = normalizeAlbumDive(currentGenre, false);
  if (!dive?.slots?.length) return;
  const currentKey = getAlbumDiveFocusSlotKey(dive);
  const next = albumDiveAdjacentSlot(dive, currentKey, Number(direction) || 0);
  if (next?.key) setAlbumDiveFocusSlot(next.key, { event, preserveScroll: true });
}


function albumDiveEditionPatterns() {
  const editionTerms = '(?:remaster(?:ed)?|radio edit|single edit|album version|extended mix|club mix|original mix|vinyl|mono|stereo|live(?:\\s+(?:at|from|in|on|@))?|live recording|concert(?:\\s*\\(live\\))?|anniversary(?:\\s+concert)?|demo|bonus track|explicit|clean|edit|version|alternate(?:\\s+take)?|alt(?:\\.|ernate)?\\s+version|acoustic|session|take\\s+\\d+)';
  return [
    new RegExp('^(.*?)(\\s+(?:-|–|—)\\s*(?:[^()\\[\\]]*' + editionTerms + '[^()\\[\\]]*)(?:\\([^)]*\\))?\\s*)$', 'i'),
    new RegExp('^(.*?)(\\s*\\((?:[^)]*' + editionTerms + '[^)]*)\\)\\s*)$', 'i'),
    new RegExp('^(.*?)(\\s*\\[(?:[^\\]]*' + editionTerms + '[^\\]]*)\\]\\s*)$', 'i'),
  ];
}

function albumDiveCleanEditionTitle(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of albumDiveEditionPatterns()) {
      const match = text.match(re);
      if (match && match[1] && match[1].trim().length >= 2) {
        text = match[1].trim();
        changed = true;
        break;
      }
    }
  }
  return text;
}

function albumDiveTitleWithEditionMarkup(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  for (const re of albumDiveEditionPatterns()) {
    const match = text.match(re);
    if (match && match[1] && match[2] && match[1].trim().length >= 2) {
      return `${escapeHtml(match[1].trim())}<span class="song-title-edition">${escapeHtml(match[2].trim().replace(/^[-–—]\\s*/, ''))}</span>`;
    }
  }
  return escapeHtml(text);
}

function albumDiveEditQuickBlock(slot, safeKey) {
  const inputUrl = albumDiveSlotInputUrl(slot);
  return `<div class="album-focus-edit-help">Most edits should be a quick URL/reason update, or a single pasted album block. Use JSON when you want to replace the whole slot.</div>
    <div class="album-focus-edit-quick-grid">
      <label class="wide"><span>Album URL</span><input type="url" value="${escapeHtml(inputUrl)}" placeholder="Spotify, Apple Music, or iTunes album URL" onchange="updateAlbumDiveSlotField('${safeKey}', 'albumProviderUrl', this.value)"></label>
      <label><span>Album</span><input type="text" value="${escapeHtml(slot.album || '')}" placeholder="Album title" oninput="updateAlbumDiveSlotField('${safeKey}', 'album', this.value)"></label>
      <label><span>Artist</span><input type="text" value="${escapeHtml(slot.artist || '')}" placeholder="Artist" oninput="updateAlbumDiveSlotField('${safeKey}', 'artist', this.value)"></label>
      <label><span>Year</span><input type="number" value="${slot.year || ''}" placeholder="Year" oninput="updateAlbumDiveSlotField('${safeKey}', 'year', this.value)"></label>
      <label><span>Album art URL</span><input type="url" value="${escapeHtml(slot.manualAlbumArt || '')}" placeholder="Manual album art URL" onchange="updateAlbumDiveSlotField('${safeKey}', 'manualAlbumArt', this.value)"></label>
      <label class="wide"><span>Description / reason</span><textarea rows="3" placeholder="Why this album belongs in this slot" oninput="updateAlbumDiveSlotField('${safeKey}', 'rationale', this.value)">${escapeHtml(slot.rationale || '')}</textarea></label>
    </div>
    <div class="row" style="margin-top:8px;gap:8px;">
      <button type="button" class="btn btn-primary btn-tiny" onclick="fetchAlbumDiveAlbumMetadata('${safeKey}', this)">Fetch / refresh metadata</button>
    </div>
    <div class="album-slot-replace-block" style="margin-top:12px;">
      <label for="albumSlotReplace_${safeKey}">Paste JSON or text block to replace this slot</label>
      <textarea id="albumSlotReplace_${safeKey}" rows="4" placeholder='{"type":"${escapeHtml(slot.label || 'Breakout')}","artist":"Artist","album":"Album","spotify_url":"https://open.spotify.com/album/...","year":1999,"reason":"why it belongs"}'></textarea>
      <div class="row" style="margin-top:8px;gap:8px;">
        <button type="button" class="btn btn-primary btn-tiny" onclick="replaceAlbumDiveSlotFromPaste('${safeKey}', 'albumSlotReplace_${safeKey}', this, true)">Replace + fetch</button>
        <button type="button" class="btn btn-secondary btn-tiny" onclick="replaceAlbumDiveSlotFromPaste('${safeKey}', 'albumSlotReplace_${safeKey}', this, false)">Replace only</button>
      </div>
    </div>`;
}

function renderAlbumDiveSidePeek(slot, sideLabel) {
  if (!slot)
    return '<div class="album-focus-peek album-focus-peek-empty" aria-hidden="true"></div>';
  const art =
    slot.albumArt || slot.manualAlbumArt || slot.favoriteSong?.albumArt || "";
  const title = slot.album || slot.label;
  const meta = [slot.label, slot.artist].filter(Boolean).join(" · ");
  const state = slot.listenState || "not_started";
  const isFinished = state === "finished" || state === "completed";
  const isSampled = state === "sampled";
  return `<button type="button" class="album-focus-peek ${isFinished ? "finished" : ""} ${isSampled ? "sampled" : ""} ${slot.favoriteAlbum ? "favorite-album" : ""}" onclick="setAlbumDiveFocusSlot('${escapeHtml(slot.key)}', { event })" title="${escapeHtml(sideLabel)}: ${escapeHtml(title)}">
        <span class="album-focus-peek-direction">${escapeHtml(sideLabel)}</span>
        ${art ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(title)} cover" loading="lazy">` : '<span class="album-rail-placeholder"></span>'}
        ${slot.favoriteAlbum ? '<span class="album-favorite-marker" title="Favorite album">🏆</span>' : ""}
        <span class="album-focus-peek-title">${escapeHtml(title)}</span>
        ${meta ? `<span class="album-focus-peek-meta">${escapeHtml(meta)}</span>` : ""}
      </button>`;
}

function renderAlbumDiveFocusRail(dive, selectedKey) {
  /* Daily Genre v212: shelf slots can be deleted directly from the Album Shelf. */
  const shelfDeleteStyles = `<style id="album-shelf-delete-v212">
    .album-rail-card-wrap{position:relative;display:flex;align-items:stretch;justify-content:center;}
    .album-rail-card-wrap .album-rail-card{width:100%;}
    .album-rail-delete{position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(78,45,25,.28);background:rgba(255,248,232,.96);color:#4e2d19;font-weight:900;line-height:1;box-shadow:0 2px 8px rgba(44,24,12,.18);opacity:.76;cursor:pointer;z-index:3;}
    .album-rail-delete:hover,.album-rail-delete:focus{opacity:1;transform:translateY(-1px);outline:2px solid rgba(244,178,69,.42);}
  </style>`;
  return `${shelfDeleteStyles}<div class="album-focus-rail" role="list" aria-label="Album Dive shelf">
        ${(dive?.slots || [])
          .map((slot) => {
            const art =
              slot.albumArt ||
              slot.manualAlbumArt ||
              slot.favoriteSong?.albumArt ||
              "";
            const label = slot.album || slot.label;
            const isActive = slot.key === selectedKey;
            const isFinished =
              slot.listenState === "finished" ||
              slot.listenState === "completed";
            const isSampled = slot.listenState === "sampled";
            const reaction = albumDiveSlotReaction(slot);
            const hasRating = Number(reaction) > 0;
            return `<div role="listitem" class="album-rail-card-wrap ${isActive ? "active" : ""}" data-album-slot-key="${escapeHtml(slot.key)}">
            <button type="button" class="album-rail-card ${isActive ? "active" : ""} ${isFinished ? "finished" : ""} ${isSampled ? "sampled" : ""} ${hasRating ? "has-rating" : ""} ${slot.favoriteAlbum ? "favorite-album" : ""}" data-album-slot-key="${escapeHtml(slot.key)}" onclick="setAlbumDiveFocusSlot('${escapeHtml(slot.key)}', { event })" title="${escapeHtml(label)}">
              ${art ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(label)} cover" loading="lazy">` : '<span class="album-rail-placeholder"></span>'}
              <span>${escapeHtml(slot.label)}</span>
              <em class="album-rail-status-dot" aria-hidden="true"></em>
              ${slot.favoriteAlbum ? '<span class="album-rail-trophy" title="Favorite album">🏆</span>' : ""}
              ${hasRating ? `<strong>${albumDiveReactionEmoji(reaction)}</strong>` : ""}
            </button>
            <button type="button" class="album-rail-delete" onclick="deleteAlbumDiveSlotFromShelf('${escapeHtml(slot.key)}', event)" title="Delete ${escapeHtml(slot.label)} slot" aria-label="Delete ${escapeHtml(slot.label)} album slot">×</button>
          </div>`;
          })
          .join("")}
      </div>`;
}

function renderAlbumDiveFocusPanel(dive) {
  const selectedKey = getAlbumDiveFocusSlotKey(dive);
  const slot =
    (dive.slots || []).find((item) => item.key === selectedKey) ||
    dive.slots[0];
  if (!slot) return "";
  const safeKey = escapeHtml(slot.key);
  const state = slot.listenState || "not_started";
  const fav = slot.favoriteSong || {};
  const albumUrl = albumDiveSlotCanonicalUrl(slot);
  const displayTitle = slot.album || "Paste a Spotify or Apple/iTunes album URL";
  const displaySub = [
    slot.artist,
    slot.year || (slot.releaseDate ? String(slot.releaseDate).slice(0, 4) : ""),
    slot.totalTracks ? `${slot.totalTracks} tracks` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const albumReaction = albumDiveSlotReaction(slot);
  const reactionButtons = albumDiveReactionButtons(safeKey, albumReaction, true);
  const favoriteLabel = albumDiveTopTrackSummary(slot);
  const listenStateSelect = `<select onchange="updateAlbumDiveSlotField('${safeKey}', 'listenState', this.value)">
        ${[
          ["not_started", "Not started"],
          ["sampled", "Sampled"],
          ["finished", "Finished"],
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${state === value ? "selected" : ""}>${label}</option>`,
          )
          .join("")}
      </select>`;
  const trackSummary = albumDiveTrackReactionSummary(slot);
  const manualMetadataDetails = `<details class="album-focus-edit-details album-focus-edit-bottom">
        <summary>Edit / replace this album</summary>
        ${albumDiveEditQuickBlock(slot, safeKey)}
      </details>`;
  return `<div class="album-focus-view album-focus-view-shelf-top album-focus-view-arrows-only" data-album-focus-key="${safeKey}">
        <div class="album-focus-shelf-top-wrap">
          <div class="album-focus-shelf-top-head">
            <span>Album shelf</span>
            <small>Pick an album to load its hero and track queue below.</small>
          </div>
          ${renderAlbumDiveFocusRail(dive, selectedKey)}
        </div>
        ${albumDiveActiveChipMarkup(dive, selectedKey)}
        <div class="album-focus-carousel album-focus-carousel-arrows-only" aria-label="Focused Album Dive carousel">
          <button type="button" class="album-focus-nav album-focus-prev" onclick="setAlbumDiveFocusRelative(-1, event)" aria-label="Previous Album Dive slot">‹</button>
          <div class="album-focus-hero">
            <div class="album-focus-art-wrap">${albumDiveArtHtml(slot)}</div>
            <div class="album-focus-main">
              <div class="album-focus-topline">
                <span class="album-focus-label">${escapeHtml(slot.label)}</span>
                ${state === "not_started" ? "" : `<span class="album-focus-state ${escapeHtml(state)}">${escapeHtml(state.replaceAll("_", " "))}</span>`}
              </div>
              <h4 class="album-focus-title">${albumUrl ? `<a href="${escapeHtml(albumUrl)}" target="_blank" rel="noopener">${albumDiveTitleWithEditionMarkup(displayTitle)} <span class="song-link-arrow">↗</span></a>` : albumDiveTitleWithEditionMarkup(displayTitle)}</h4>
              ${displaySub ? `<div class="album-focus-sub">${escapeHtml(displaySub)}</div>` : ""}
              ${slot.rationale ? `<p class="album-focus-rationale">${escapeHtml(slot.rationale)}</p>` : ""}
              <div class="album-focus-actions">
                <div class="album-focus-rating"><span>Album</span>${reactionButtons}</div>
                <button type="button" class="album-focus-trophy ${slot.favoriteAlbum ? "active" : ""}" onclick="setAlbumDiveFavoriteAlbum('${safeKey}', event)" title="${slot.favoriteAlbum ? "Remove favorite album" : "Mark as favorite album"}" aria-label="${slot.favoriteAlbum ? "Remove favorite album" : "Mark as favorite album"}">🏆</button>
                <button type="button" class="btn btn-secondary btn-tiny album-focus-details-button" onclick="toggleAlbumDiveFocusDetails('${safeKey}', event)">Details</button>
              </div>
              <div class="album-focus-favorite album-focus-favorite-summary ${favoriteLabel ? "" : "empty"}"><strong>Top songs:</strong> <span>${escapeHtml(favoriteLabel || "No top songs picked")}</span></div>
            </div>
          </div>
          <button type="button" class="album-focus-nav album-focus-next" onclick="setAlbumDiveFocusRelative(1, event)" aria-label="Next Album Dive slot">›</button>
        </div>
        <details class="album-focus-detail-drawer album-focus-controls-drawer" id="album-focus-details-${safeKey}">
          <summary>Album controls &amp; top songs</summary>
          <div class="album-focus-control-strip">
            <label class="album-focus-control-field">
              <span>State</span>
              ${listenStateSelect}
            </label>
            <div class="album-focus-control-field album-focus-control-rating">
              <span>Album rating</span>
              ${reactionButtons}
            </div>
            <div class="album-focus-control-field album-focus-control-top-songs">
              <span>Top songs</span>
              <strong>${escapeHtml(favoriteLabel || "No top songs picked")}</strong>
              <small>Use Tracks below to mark or unmark picks.</small>
            </div>
            <div class="album-focus-control-actions">
              ${fav.spotifyTrackUrl ? `<button type="button" class="btn btn-secondary btn-tiny" onclick="fetchAlbumDiveFavoriteMetadata('${safeKey}', this)">Refresh Track Info</button>` : ""}
              <button type="button" class="btn btn-primary btn-tiny" onclick="promoteAlbumDiveFavorite('${safeKey}')">Add First Top Song</button>
              ${fav.promotedToSongLog ? '<span class="tag">Promoted</span>' : ""}
            </div>
          </div>
        </details>
        <details class="album-focus-tracks album-focus-tracks-open album-focus-tracks-drawer" open>
          <summary class="album-focus-tracks-summary">
            <span>Tracks</span>
            <small>${escapeHtml(displayTitle)}${trackSummary}</small>
          </summary>
          <div class="album-focus-tracks-body">
            ${renderAlbumDiveTrackReactionRows(slot, safeKey)}
          </div>
        </details>
        <div class="album-focus-maintenance">
          ${manualMetadataDetails}
          <button type="button" class="btn btn-ghost btn-tiny album-slot-clear-btn" onclick="clearAlbumDiveSlot('${safeKey}', event)">Delete entry</button>
        </div>
      </div>`;
}

function albumDiveSlotQueueState(slot = {}) {
  const reaction = albumDiveSlotReaction(slot);
  const state = slot.listenState || "not_started";
  return [
    state && state !== "not_started" ? state.replaceAll("_", " ") : "queued",
    reaction ? albumDiveReactionEmoji(reaction) : "unrated",
    albumDiveTopTracks(slot).length ? `${albumDiveTopTracks(slot).length} top` : "no top songs",
  ].filter(Boolean).join(" · ");
}

function renderAlbumDiveQueue(dive) {
  const selectedKey = getAlbumDiveFocusSlotKey(dive);
  const slots = (dive?.slots || []).filter(albumDiveSlotHasContent);
  if (!slots.length) return `<div class="album-dive-queue-empty small">No albums queued yet. Add Spotify, Apple/iTunes, or manual album entries first.</div>`;
  return `<div class="album-dive-queue-list">
    ${slots.map((slot, index) => {
      const art = albumDiveArtUrl(slot);
      const title = slot.album || slot.label || `Album ${index + 1}`;
      const meta = [slot.label, slot.artist, slot.year || (slot.releaseDate ? String(slot.releaseDate).slice(0, 4) : "")].filter(Boolean).join(" · ");
      const top = albumDiveTopTrackSummary(slot);
      const reaction = albumDiveSlotReaction(slot);
      return `<button type="button" class="album-dive-queue-row ${slot.key === selectedKey ? "active" : ""}" data-album-slot-key="${escapeHtml(slot.key)}" onclick="selectAlbumDiveQueueSlot('${escapeHtml(slot.key)}', event)">
        ${art ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(title)} cover" loading="lazy">` : '<span class="album-queue-art-empty" aria-hidden="true"></span>'}
        <span class="album-dive-queue-main">
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
          <em>${escapeHtml(top)}</em>
        </span>
        <span class="album-dive-queue-status">${reaction ? albumDiveReactionEmoji(reaction) : "—"}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function albumDiveRememberPanelState(panel) {
  albumDivePanelOpen = !!panel?.open;
}

function albumDiveStopSummaryButton(event) {
  if (!event) return;
  event.preventDefault();
  event.stopPropagation();
}

function toggleAlbumDiveQueue(event) {
  albumDiveStopSummaryButton(event);
  albumDivePreserveViewport(() => {
    albumDiveQueueOpen = !albumDiveQueueOpen;
    const panel = document.getElementById("albumDiveQueuePanel");
    const btn = document.querySelector(".album-dive-queue-toggle");
    if (panel) panel.classList.toggle("hidden", !albumDiveQueueOpen);
    if (btn) btn.textContent = albumDiveQueueOpen ? "Hide queue" : "Show queue";
  });
}

function selectAlbumDiveQueueSlot(slotKey, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  albumDiveQueueOpen = true;
  const panel = document.getElementById("albumDivePanel");
  if (panel && panel.open) albumDivePanelOpen = true;
  setAlbumDiveFocusSlot(slotKey, { event, preserveQueue: true, preserveScroll: true });
}

function toggleAlbumDiveFocusDetails(slotKey, eventOrForceOpen = false, maybeForceOpen = false) {
  const event = eventOrForceOpen && typeof eventOrForceOpen === "object" ? eventOrForceOpen : null;
  const forceOpen = event ? !!maybeForceOpen : !!eventOrForceOpen;
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  albumDivePreserveViewport(() => {
    const drawer = document.getElementById(`album-focus-details-${slotKey}`);
    if (!drawer) return;
    drawer.open = forceOpen ? true : !drawer.open;
  });
}

function renderAlbumDivePanel(genre) {
  const dive = normalizeAlbumDive(genre, false);
  const eligible = albumDiveEligible(genre);

  if (!dive) {
    const emptyOpen = albumDiveIsListenMode() ? " open" : "";
    return `<details class="panel album-dive-panel album-dive-collapsible album-dive-empty-panel"${emptyOpen}>
        <summary class="album-dive-collapsed-head">
          <span class="album-dive-summary-main">
            <span class="eyebrow">Album Dive</span>
            <strong>Album Dive</strong>
            <small>No album shelf set yet</small>
          </span>
          <span class="album-dive-summary-actions">
            <button type="button" class="btn btn-primary album-dive-start-summary-btn" onclick="event.preventDefault(); event.stopPropagation(); startAlbumDive()">Start</button>
            <span class="album-dive-expand-cue" aria-hidden="true">Open</span>
          </span>
        </summary>
        <div class="album-dive-collapsed-body">
          <div class="album-dive-head">
            <div>
              <div class="eyebrow">Album Dive</div>
              <h3 class="album-dive-title">Deepen this genre through records</h3>
              <p class="small">Paste structured album JSON or Spotify album URLs, fetch cover art and track lists, choose a favorite song from each album, and promote favorites back into the main song log.</p>
            </div>
            <div class="album-dive-actions"><button type="button" class="btn btn-primary" onclick="startAlbumDive()">${escapeHtml(albumDiveCtaText(genre))}</button></div>
          </div>
          ${albumDiveJsonImportMarkup('albumDiveJsonImportStart')}
          ${eligible ? "" : '<div class="album-dive-empty small">Tip: this works best after you rate a genre 3, 4, or 5 stars, but you can start a dive any time.</div>'}
        </div>
      </details>`;
  }

  const progress = albumDiveProgress(dive);
  const listenMode = albumDiveIsListenMode();
  const shouldOpen = !!listenMode || !!albumDiveEditorMode || !!albumDivePanelOpen;
  if (listenMode) setTimeout(hydrateAlbumDiveAmbient, 0);
  const queueButtonLabel = albumDiveQueueOpen ? "Hide queue" : "Show queue";
  const summaryStatus = [
    `${progress.fetched}/${progress.total} fetched`,
    `${progress.finished}/${progress.total} finished`,
    progress.sampled ? `${progress.sampled} sampled` : "",
    dive.status === "completed" ? "complete" : "in progress",
  ].filter(Boolean).join(" · ");
  return `<details class="panel album-dive-panel album-dive-collapsible ${listenMode ? "album-dive-focus-panel" : ""}" id="albumDivePanel" ${shouldOpen ? "open" : ""} ontoggle="albumDiveRememberPanelState(this)">
        <summary class="album-dive-collapsed-head">
          <span class="album-dive-summary-main">
            <span class="eyebrow">Album Dive</span>
            <strong>Canonical album shelf</strong>
            <small>${progress.fetched}/${progress.total} fetched · ${progress.finished}/${progress.total} finished${progress.sampled ? ` · ${progress.sampled} sampled` : ""}</small>
          </span>
          <span class="album-dive-summary-actions album-dive-summary-actions-clean">
            <span class="album-dive-summary-stat">${escapeHtml(summaryStatus)}</span>
            <button type="button" class="btn btn-secondary btn-tiny album-dive-queue-toggle" onpointerdown="albumDiveStopSummaryButton(event)" onclick="toggleAlbumDiveQueue(event)">${queueButtonLabel}</button>
            <span class="album-dive-expand-cue" aria-hidden="true">${shouldOpen ? "Close" : "Open"}</span>
          </span>
        </summary>
        <div class="album-dive-collapsed-body">
          <div class="album-dive-head ${listenMode ? "album-dive-head-session" : ""}">
            ${listenMode ? "" : `<div>
              <div class="eyebrow">Album Dive</div>
              <h3 class="album-dive-title">Canonical album shelf</h3>
              <p class="small album-dive-progress-line">${escapeHtml(summaryStatus)} · ${escapeHtml(dive.mode || "canon")} dive</p>
            </div>`}
            <div class="album-dive-actions album-dive-actions-clean">
              <button type="button" class="btn btn-primary" onclick="saveLibraryUpdates()">${listenMode ? "Save" : "Save Album Dive"}</button>
              <button type="button" class="btn btn-secondary" onclick="openAlbumDiveSpotifyPlaylistModal()">＋ Playlist Albums</button>
              <button type="button" class="btn btn-secondary" onclick="copyAlbumDiveStats()" title="Copy Album Dive summary for Discord">⧉ Copy stats</button>
              ${dive.status === "completed" ? `<button type="button" class="btn btn-secondary" onclick="markAlbumDiveActive()">Mark Active</button>` : `<button type="button" class="btn btn-secondary" onclick="markAlbumDiveActive()">Keep Active</button><button type="button" class="btn btn-secondary" onclick="endAlbumDive()" title="End this active Album Dive and remove it from the top shortcut">End Dive</button>`}
              <button type="button" class="btn btn-secondary" onclick="setAlbumDiveEditorMode(${listenMode ? "true" : "false"})">${listenMode ? "Edit Dive" : "Carousel View"}</button>
              ${listenMode ? "" : `<button type="button" class="btn btn-ghost album-dive-remove-btn" onclick="clearAlbumDive()">Remove Dive</button>`}
            </div>
          </div>
          ${listenMode ? "" : albumDiveJsonImportMarkup('albumDiveJsonImport')}
          ${listenMode ? renderAlbumDiveFocusPanel(dive) : `<div class="album-dive-grid">${dive.slots.map(renderAlbumDiveSlot).join("")}</div>`}
          <div class="album-dive-verdict album-dive-impact-only">
            <label for="albumDiveVerdictImpact">After the album dive, this genre feels…</label>
            <select id="albumDiveVerdictImpact" onchange="updateAlbumDiveRootField('verdictImpact', this.value)">
              ${[
                ["", "Choose…"],
                ["better", "Made me like the genre better"],
                ["no_change", "No change"],
                ["worse", "Made me like the genre worse"],
              ].map(([value, label]) => `<option value="${value}" ${String(dive.verdictImpact || "") === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
        </div>
      </details>
      <div id="albumDiveQueuePanel" class="panel album-dive-queue-panel ${albumDiveQueueOpen ? "" : "hidden"}">
        <div class="album-dive-queue-head"><strong>Album queue</strong><span class="small">Tap an album to jump into its details.</span></div>
        ${renderAlbumDiveQueue(dive)}
      </div>`
}
function albumDiveSpotifyTrackRows(genre = currentGenre) {
  const dive = normalizeAlbumDive(genre, false);
  const result = { rows: [], skipped: 0, albumCount: 0, totalTracks: 0 };
  if (!genre || !dive || !Array.isArray(dive.slots)) return result;
  const seen = new Set();
  const slots = dive.slots.filter(albumDiveSlotHasContent);
  result.albumCount = slots.length;
  slots.forEach((slot, slotIndex) => {
    const tracks = Array.isArray(slot.tracks) ? slot.tracks.slice() : [];
    tracks.sort((a, b) => {
      const disc = Number(a.discNumber || 1) - Number(b.discNumber || 1);
      if (disc) return disc;
      const track = Number(a.trackNumber || 0) - Number(b.trackNumber || 0);
      if (track) return track;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    tracks.forEach((track, trackIndex) => {
      result.totalTracks += 1;
      const rawUrl = track.spotifyTrackUrl || track.spotifyUrl || (track.spotifyTrackId ? `https://open.spotify.com/track/${track.spotifyTrackId}` : '');
      const id = typeof spotifyTrackId === 'function'
        ? (spotifyTrackId(rawUrl) || spotifyTrackId(track.spotifyTrackId || ''))
        : (track.spotifyTrackId || '');
      if (!id) {
        result.skipped += 1;
        return;
      }
      const key = `spotify:track:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const albumPrefix = slot.album ? `${slot.album}` : (slot.label || `Album ${slotIndex + 1}`);
      const position = [track.discNumber && Number(track.discNumber) > 1 ? `D${track.discNumber}` : '', track.trackNumber ? `#${track.trackNumber}` : '']
        .filter(Boolean)
        .join(' ');
      result.rows.push({
        id,
        uri: key,
        url: rawUrl || `https://open.spotify.com/track/${id}`,
        title: track.title || 'Spotify track',
        artist: track.artist || (Array.isArray(track.artists) ? track.artists.join(', ') : '') || slot.artist || '',
        artwork: slot.albumArt || slot.manualAlbumArt || '',
        score: null,
        type: 'direct',
        sourceLabel: 'Album Dive',
        parentTitle: albumPrefix,
        parentType: 'albumDive',
        parentGenreName: genre.genre || 'Unknown genre',
        genreId: genre.id != null ? String(genre.id) : '',
        genreName: genre.genre || 'Unknown genre',
        date: dateValue(genre) || '',
        platform: 'spotify',
        albumDiveSlot: slot.key || '',
        albumDiveLabel: slot.label || '',
        albumTitle: slot.album || '',
        trackPosition: position,
        playlistOrder: `${String(slotIndex).padStart(2, '0')}-${String(track.discNumber || 1).padStart(2, '0')}-${String(track.trackNumber || trackIndex + 1).padStart(3, '0')}`
      });
    });
  });
  result.rows.sort((a, b) => String(a.playlistOrder || '').localeCompare(String(b.playlistOrder || '')));
  return result;
}

async function openAlbumDiveSpotifyPlaylistModal() {
  if (!currentGenre) return;
  if (typeof spotifyEnsurePlaylistScopes === 'function') {
    const ok = await spotifyEnsurePlaylistScopes({ returnScreen: 'listen' });
    if (!ok) return;
  }
  const { rows, skipped, albumCount, totalTracks } = albumDiveSpotifyTrackRows(currentGenre);
  if (!rows.length) {
    const skippedCopy = totalTracks
      ? ` Found ${totalTracks} album track${totalTracks === 1 ? '' : 's'}, but none have Spotify track URLs. Apple/iTunes-only albums cannot be added to Spotify playlists unless you map their tracks to Spotify.`
      : ' Fetch album tracklists first, then try again.';
    showSaveToast(`No Spotify tracks found in Album Dive.${skippedCopy}`, true);
    return;
  }
  if (typeof spotifyOpenPlaylistModalWithRows !== 'function') {
    showSaveToast('Spotify playlist tools are not loaded yet.', true);
    return;
  }
  spotifyOpenPlaylistModalWithRows({
    rows,
    sourceName: `${currentGenre.genre || 'Genre'} Album Dive`,
    playlistName: `Daily Genre — ${currentGenre.genre || 'Genre'} Album Dive`,
    contextType: 'albumDive',
    genreId: currentGenre.id != null ? String(currentGenre.id) : ''
  });
  if (skipped) {
    setTimeout(() => showSaveToast(`Album Dive playlist opened with ${rows.length} Spotify track${rows.length === 1 ? '' : 's'}. Skipped ${skipped} Apple/iTunes/manual track${skipped === 1 ? '' : 's'} without Spotify URLs.`, false), 120);
  } else {
    setTimeout(() => showSaveToast(`Album Dive playlist opened with ${rows.length} Spotify track${rows.length === 1 ? '' : 's'} from ${albumCount} album${albumCount === 1 ? '' : 's'}.`, false), 120);
  }
}

function albumDiveTrackOptionValue(track) {
  return (
    track.spotifyTrackId ||
    track.spotifyTrackUrl ||
    track.itunesTrackId ||
    track.itunesTrackUrl ||
    `${track.discNumber || 1}:${track.trackNumber || ""}:${track.title}`
  );
}

function renderAlbumDiveFavoritePicker(slot, safeKey) {
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  const selected = new Set(albumDiveTopTrackValues(slot));
  if (!tracks.length) {
    const fav = slot.favoriteSong || {};
    return `<div class="small">Fetch the Spotify or Apple/iTunes album first to choose top songs from its real track list.</div>
          <div class="album-slot-minirow">
            <input type="text" value="${escapeHtml(fav.title || "")}" placeholder="Top song title" oninput="updateAlbumDiveFavoriteField('${safeKey}', 'title', this.value)">
            <input type="text" value="${escapeHtml(fav.artist || "")}" placeholder="Artist" oninput="updateAlbumDiveFavoriteField('${safeKey}', 'artist', this.value)">
          </div>
          <input type="url" value="${escapeHtml(fav.spotifyTrackUrl || fav.itunesTrackUrl || "")}" placeholder="Spotify or Apple/iTunes track URL for top song" onchange="updateAlbumDiveFavoriteField('${safeKey}', this.value.includes('apple.com') || this.value.includes('itunes.apple.com') ? 'itunesTrackUrl' : 'spotifyTrackUrl', this.value)">`;
  }
  const rows = tracks.map((track) => {
    const value = albumDiveTrackOptionValue(track);
    const candidates = [value, track.spotifyTrackId, track.spotifyTrackUrl, track.itunesTrackId, track.itunesTrackUrl, track.title].filter(Boolean).map(String);
    const isSelected = candidates.some((candidate) => selected.has(candidate));
    const prefix = [
      track.discNumber && track.discNumber > 1 ? `D${track.discNumber}` : "",
      track.trackNumber ? `#${track.trackNumber}` : "",
    ].filter(Boolean).join(" ");
    return `<label class="album-top-track-check ${isSelected ? "active" : ""}">
      <input type="checkbox" data-album-slot-key="${safeKey}" data-track-value="${escapeHtml(value)}" ${isSelected ? "checked" : ""} onchange="toggleAlbumDiveTopTrack('${safeKey}', '${escapeHtml(value)}', this.checked, event)">
      <span>${escapeHtml(`${prefix ? `${prefix} — ` : ""}${track.title}${track.artist ? ` — ${track.artist}` : ""}`)}</span>
    </label>`;
  }).join("");
  const topSummary = albumDiveTopTrackSummary(slot);
  return `<div class="album-top-track-picker">
      <div class="small"><strong>Top songs:</strong> ${escapeHtml(topSummary)}</div>
      <div class="album-top-track-list">${rows}</div>
    </div>`;
}


function renderAlbumDiveSlot(slot) {
  const albumUrl = albumDiveSlotCanonicalUrl(slot);
  const state = slot.listenState || "not_started";
  const fav = slot.favoriteSong || {};
  const safeKey = escapeHtml(slot.key);
  const displayTitle = slot.album || "Paste a Spotify or Apple/iTunes album URL";
  const displaySub = [
    slot.artist,
    slot.year || (slot.releaseDate ? String(slot.releaseDate).slice(0, 4) : ""),
    slot.totalTracks ? `${slot.totalTracks} tracks` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const hasAlbumContent = !!(
    slot.album ||
    slot.artist ||
    slot.albumArt ||
    slot.manualAlbumArt ||
    albumUrl ||
    slot.notes ||
    slot.rationale ||
    fav.title
  );
  const favoriteLabel = albumDiveTopTrackSummary(slot);
  const albumReaction = albumDiveSlotReaction(slot);
  const reactionButtons = albumDiveReactionButtons(safeKey, albumReaction, true);
  const listenStateSelect = `<select onchange="updateAlbumDiveSlotField('${safeKey}', 'listenState', this.value)">
              ${[
                ["not_started", "Not started"],
                ["sampled", "Sampled"],
                ["finished", "Finished"],
              ]
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${state === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>`;
  const manualMetadataDetails = `<details>
            <summary>Edit / replace this album</summary>
            ${albumDiveEditQuickBlock(slot, safeKey)}
          </details>`;
  const favoriteBlock = `<div class="album-slot-favorite">
            <h4>Top songs from this album</h4>
            ${renderAlbumDiveFavoritePicker(slot, safeKey)}
            <div class="album-fav-actions">
              ${fav.spotifyTrackUrl ? `<button type="button" class="btn btn-secondary btn-tiny" onclick="fetchAlbumDiveFavoriteMetadata('${safeKey}', this)">Refresh Track Info</button>` : ""}
              <button type="button" class="btn btn-primary btn-tiny" onclick="promoteAlbumDiveFavorite('${safeKey}')">Add First Top Song to Song Log</button>
              ${fav.promotedToSongLog ? '<span class="tag">Promoted</span>' : ""}
            </div>
          </div>`;

  return `<div class="album-slot-card ${hasAlbumContent ? "has-album-content" : "album-slot-empty"}" data-album-slot="${safeKey}">
        ${albumDiveArtHtml(slot)}
        <div class="album-slot-main">
          <div class="album-slot-kicker"><span class="album-slot-label">${escapeHtml(slot.label)}</span><span class="tag">${escapeHtml(state.replaceAll("_", " "))}</span></div>
          <div>
            ${
              albumUrl
                ? `<a class="album-slot-display-title album-slot-link" href="${escapeHtml(albumUrl)}" target="_blank" rel="noopener">${albumDiveTitleWithEditionMarkup(displayTitle)} <span class="song-link-arrow">↗</span></a>`
                : `<div class="album-slot-display-title">${albumDiveTitleWithEditionMarkup(displayTitle)}</div>`
            }
            ${displaySub ? `<div class="album-slot-display-sub">${escapeHtml(displaySub)}</div>` : ""}
          </div>

          <div class="album-listen-quick">
            <div class="album-listen-minirow">
              <span class="album-listen-state">${escapeHtml(state.replaceAll("_", " "))}</span>
              ${reactionButtons}
            </div>
            <div class="album-listen-favorite"><strong>Top songs:</strong> ${escapeHtml(favoriteLabel)}</div>
            <details class="album-listen-expand">
              <summary>Album controls / Favorite / Edit</summary>
              <div class="album-listen-expand-body">
                <div class="album-slot-meta">
                  ${listenStateSelect}
                  ${reactionButtons}
                </div>
                ${favoriteBlock}
                ${manualMetadataDetails}
              </div>
            </details>
          </div>

          <div class="album-build-controls">
            <div class="album-fetch-row album-provider-row">
              <input type="url" value="${escapeHtml(albumDiveSlotInputUrl(slot))}" placeholder="Paste Spotify, Apple Music, or iTunes album URL" onchange="updateAlbumDiveSlotField('${safeKey}', 'albumProviderUrl', this.value)">
              <button type="button" class="btn btn-primary btn-tiny" onclick="fetchAlbumDiveAlbumMetadata('${safeKey}', this)">Fetch Album + Tracks</button>
              <button type="button" class="btn btn-ghost btn-tiny album-slot-clear-btn" onclick="clearAlbumDiveSlot('${safeKey}', event)">Delete entry</button>
            </div>
            <div class="album-source-line small"><span class="album-source-chip ${albumDiveSourceClass(slot)}">${escapeHtml(albumDiveSourceLabel(slot))}</span>${slot.primaryGenreName ? ` <span>${escapeHtml(slot.primaryGenreName)}</span>` : ""}</div>
            <div class="album-slot-meta">
              ${listenStateSelect}
              ${reactionButtons}
            </div>
            ${favoriteBlock}
            ${manualMetadataDetails}
          </div>
        </div>
      </div>`;
}


function albumDiveSlotKeyFromType(type = "", used = new Set()) {
  const cleaned = String(type || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const direct = {
    breakout: "breakout",
    originator: "originator",
    proto: "originator",
    archetype: "archetype",
    consensus: "consensus",
    popular: "popular",
    mainstream: "popular",
    purist: "purist",
    cult: "cult_hit",
    cult_hit: "cult_hit",
    cult_classic: "cult_hit",
    modern: "modern",
    revival: "revival",
    newcomer: "revival",
    revival_newcomer: "revival",
    wave: "wave",
  };
  let key = direct[cleaned] || (cleaned.includes("cult") ? "cult_hit" : "");
  if (!key && cleaned.includes("revival")) key = "revival";
  if (!key && cleaned.includes("newcomer")) key = "revival";
  if (!key && cleaned.includes("popular")) key = "popular";
  if (!key && cleaned.includes("modern")) key = "modern";
  if (key && !used.has(key)) return key;
  if ((key === "revival" || cleaned.includes("revival") || cleaned.includes("newcomer")) && !used.has("wave")) return "wave";
  const open = ALBUM_DIVE_SLOT_DEFS.find(([candidate]) => !used.has(candidate));
  return open ? open[0] : key || "wave";
}

function normalizedAlbumDiveImportRows(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.albums)
      ? parsed.albums
      : Array.isArray(parsed?.albumDive)
        ? parsed.albumDive
        : Array.isArray(parsed?.slots)
          ? parsed.slots
          : [];
  if (!rows.length) throw new Error("JSON must be an array or include an albums/slots array.");
  return rows.filter((row) => row && typeof row === "object");
}

function importAlbumDiveJson(inputId = "albumDiveJsonImport") {
  if (!currentGenre) return;
  const input = document.getElementById(inputId);
  const raw = input?.value || "";
  if (!raw.trim()) {
    showSaveToast("Paste album JSON first.", true);
    return;
  }
  let rows = [];
  try {
    rows = normalizedAlbumDiveImportRows(raw);
  } catch (err) {
    const identityApi = window.DailyGenreIdentity;
    if (identityApi && typeof identityApi.looksLikeIdentityBlock === "function" && identityApi.looksLikeIdentityBlock(raw)) {
      const applied = typeof identityApi.importStructuredIdentityBlock === "function"
        ? identityApi.importStructuredIdentityBlock(raw, { genreFallback: currentGenre?.genre || "" })
        : false;
      if (applied) {
        if (input) input.value = "";
        showSaveToast("That was a Genre Identity block, so I imported it into Genre Identity instead of Album Dive.", false);
        return;
      }
    }
    showSaveToast(`Album JSON import failed: ${err?.message || "Invalid JSON"}`, true);
    return;
  }
  const dive = normalizeAlbumDive(currentGenre, true);
  dive.enabled = true;
  dive.status = dive.status === "not_started" ? "active" : dive.status;
  if (!Array.isArray(dive.deletedSlotKeys)) dive.deletedSlotKeys = [];
  const used = new Set();
  let imported = 0;
  rows.forEach((row) => {
    const key = albumDiveSlotKeyFromType(row.type || row.category || row.slot || row.label, used);
    let slot = dive.slots.find((item) => item.key === key);
    if (!slot) {
      const def = ALBUM_DIVE_SLOT_DEFS.find(([candidate]) => candidate === key);
      if (!def) return;
      slot = defaultAlbumDiveSlot(def[0], def[1]);
      dive.slots.push(slot);
    }
    dive.deletedSlotKeys = dive.deletedSlotKeys.filter((deletedKey) => deletedKey !== key);
    dive.slots.sort((a, b) => {
      const aIndex = ALBUM_DIVE_SLOT_DEFS.findIndex(([candidate]) => candidate === a.key);
      const bIndex = ALBUM_DIVE_SLOT_DEFS.findIndex(([candidate]) => candidate === b.key);
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    });
    used.add(key);
    const spotifyUrl = String(row.spotify_url || row.spotifyAlbumUrl || row.spotifyUrl || "").trim();
    const appleUrl = String(row.itunes_url || row.itunesAlbumUrl || row.apple_url || row.appleAlbumUrl || row.collectionViewUrl || "").trim();
    const providerUrl = String(row.url || spotifyUrl || appleUrl || "").trim();
    slot.album = albumDiveCleanPastedRefs(row.album || row.title || row.name || slot.album || "");
    slot.artist = albumDiveCleanPastedRefs(row.artist || row.album_artist || row.albumArtist || slot.artist || "");
    slot.year = row.year ? Number(row.year) || slot.year || null : slot.year || null;
    slot.releaseDate = albumDiveCleanPastedRefs(row.release_date || row.releaseDate || slot.releaseDate || "");
    slot.rationale = albumDiveCleanPastedRefs(row.reason || row.rationale || row.description || slot.rationale || "");
    slot.notes = albumDiveCleanPastedRefs(row.notes || slot.notes || "");
    if (spotifyUrl) {
      slot.spotifyAlbumUrl = spotifyUrl || slot.spotifyAlbumUrl || slot.spotifyUrl || "";
      slot.spotifyUrl = spotifyUrl || slot.spotifyUrl || slot.spotifyAlbumUrl || "";
      slot.spotifyAlbumId = spotifyIdFromUrl(slot.spotifyAlbumUrl || slot.spotifyUrl, "album") || slot.spotifyAlbumId || "";
      slot.metadataSource = "spotify";
    }
    if (appleUrl || (providerUrl && albumDiveIsAppleAlbumUrl(providerUrl))) {
      albumDiveApplyProviderUrl(slot, appleUrl || providerUrl);
    } else if (providerUrl && !spotifyUrl) {
      albumDiveApplyProviderUrl(slot, providerUrl);
    }
    slot.albumArt = row.albumArt || row.album_art || row.artwork || row.cover || slot.albumArt || "";
    slot.manualAlbumArt = row.manualAlbumArt || row.manual_album_art || slot.manualAlbumArt || "";
    if (row.favorite_song || row.favoriteSong) {
      const favRaw = row.favorite_song || row.favoriteSong || {};
      slot.favoriteSong = { ...defaultAlbumDiveSlot(slot.key, slot.label).favoriteSong, ...(slot.favoriteSong || {}) };
      if (typeof favRaw === "string") slot.favoriteSong.title = albumDiveCleanPastedRefs(favRaw);
      else {
        slot.favoriteSong.title = albumDiveCleanPastedRefs(favRaw.title || favRaw.name || slot.favoriteSong.title || "");
        slot.favoriteSong.artist = albumDiveCleanPastedRefs(favRaw.artist || slot.favoriteSong.artist || slot.artist || "");
        slot.favoriteSong.spotifyTrackUrl = String(favRaw.spotify_url || favRaw.spotifyTrackUrl || favRaw.spotifyUrl || slot.favoriteSong.spotifyTrackUrl || "").trim();
        slot.favoriteSong.itunesTrackUrl = String(favRaw.itunes_url || favRaw.itunesTrackUrl || favRaw.apple_url || favRaw.trackViewUrl || favRaw.url || slot.favoriteSong.itunesTrackUrl || "").trim();
        slot.favoriteSong.note = albumDiveCleanPastedRefs(favRaw.reason || favRaw.note || slot.favoriteSong.note || "");
      }
    }
    imported += 1;
  });
  touchAlbumDive();
  rerenderAlbumDive({ preserveScroll: true });
  showSaveToast(`Imported ${imported} album${imported === 1 ? "" : "s"} into Album Dive — fetch Spotify metadata next, then save.`, false);
}


function albumDiveParseKeyValuePaste(raw = "") {
  const row = {};
  const lines = String(raw || "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  lines.forEach((line) => {
    const match = line.match(/^([A-Za-z_ ]+)\s*:\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim().toLowerCase().replace(/\s+/g, "_");
    const value = albumDiveCleanPastedRefs(match[2] || "");
    if (["type", "category", "slot", "label"].includes(key)) row.type = value;
    else if (["album", "album_title", "title", "name"].includes(key)) row.album = value;
    else if (["artist", "album_artist", "albumartist"].includes(key)) row.artist = value;
    else if (["spotify_url", "spotify", "spotify_album_url"].includes(key)) row.spotify_url = value;
    else if (["apple_url", "itunes_url", "itunes_album_url", "apple_album_url"].includes(key)) row.itunes_url = value;
    else if (["url", "album_url"].includes(key)) row.url = value;
    else if (key === "year") row.year = value;
    else if (["reason", "rationale", "description"].includes(key)) row.reason = value;
    else if (["artwork", "album_art", "cover"].includes(key)) row.albumArt = value;
  });
  if (!Object.keys(row).length && lines.length) {
    const parts = lines.join(" ").split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
    const urlPart = parts.find((part) => /https?:\/\//i.test(part));
    if (urlPart) row.url = urlPart;
    const yearPart = parts.find((part) => /^(19|20)\d{2}$/.test(part));
    if (yearPart) row.year = yearPart;
    const albumPart = parts.find((part) => part !== urlPart && part !== yearPart && /\s+[—–-]\s+/.test(part)) || parts[0] || "";
    const nameParts = albumPart.split(/\s+[—–-]\s+/).map((part) => part.trim()).filter(Boolean);
    if (nameParts.length >= 2) {
      row.artist = nameParts.shift();
      row.album = nameParts.join(" — ");
    } else if (albumPart) {
      row.album = albumPart;
    }
    const reasonPart = parts.find((part) => part !== albumPart && part !== urlPart && part !== yearPart);
    if (reasonPart) row.reason = reasonPart;
  }
  return row;
}

function albumDiveSingleImportRowFromPaste(raw = "") {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Paste one album entry first.");
  try {
    const rows = normalizedAlbumDiveImportRows(text);
    if (rows.length) return rows[0];
  } catch (_) {}
  const row = albumDiveParseKeyValuePaste(text);
  if (!row.album && !row.artist && !row.url && !row.spotify_url && !row.itunes_url && !row.reason) {
    throw new Error("Could not read an album entry from that paste.");
  }
  return row;
}

function albumDiveApplyImportRowToExistingSlot(slot, row = {}, options = {}) {
  if (!slot || !row) return false;
  const keep = {
    key: slot.key,
    label: slot.label,
    listenState: options.preserveListeningState ? slot.listenState : "not_started",
    albumReaction: options.preserveListeningState ? albumDiveSlotReaction(slot) : null,
    rating: options.preserveListeningState ? slot.rating : null,
  };
  const typeLabel = row.type || row.category || row.slot || row.label || slot.label;
  const spotifyUrl = String(row.spotify_url || row.spotifyAlbumUrl || row.spotifyUrl || "").trim();
  const appleUrl = String(row.itunes_url || row.itunesAlbumUrl || row.apple_url || row.appleAlbumUrl || row.collectionViewUrl || "").trim();
  const providerUrl = String(row.url || spotifyUrl || appleUrl || "").trim();
  Object.keys(slot).forEach((key) => delete slot[key]);
  Object.assign(slot, defaultAlbumDiveSlot(keep.key, keep.label));
  slot.label = keep.label || typeLabel || slot.label;
  slot.listenState = keep.listenState || "not_started";
  if (keep.albumReaction) slot.albumReaction = keep.albumReaction;
  if (keep.rating) slot.rating = keep.rating;
  slot.album = albumDiveCleanPastedRefs(row.album || row.albumTitle || row.title || row.name || "");
  slot.artist = albumDiveCleanPastedRefs(row.artist || row.album_artist || row.albumArtist || "");
  slot.year = row.year ? Number(row.year) || null : null;
  slot.releaseDate = albumDiveCleanPastedRefs(row.release_date || row.releaseDate || "");
  slot.rationale = albumDiveCleanPastedRefs(row.reason || row.rationale || row.description || "");
  slot.notes = albumDiveCleanPastedRefs(row.notes || "");
  slot.albumArt = row.albumArt || row.album_art || row.artwork || row.cover || "";
  slot.manualAlbumArt = row.manualAlbumArt || row.manual_album_art || "";
  if (providerUrl) albumDiveApplyProviderUrl(slot, providerUrl);
  if (row.favorite_song || row.favoriteSong) {
    const favRaw = row.favorite_song || row.favoriteSong || {};
    if (typeof favRaw === "string") slot.favoriteSong.title = albumDiveCleanPastedRefs(favRaw);
    else {
      slot.favoriteSong.title = albumDiveCleanPastedRefs(favRaw.title || favRaw.name || "");
      slot.favoriteSong.artist = albumDiveCleanPastedRefs(favRaw.artist || slot.artist || "");
      slot.favoriteSong.spotifyTrackUrl = String(favRaw.spotify_url || favRaw.spotifyTrackUrl || favRaw.spotifyUrl || "").trim();
      slot.favoriteSong.itunesTrackUrl = String(favRaw.itunes_url || favRaw.itunesTrackUrl || favRaw.apple_url || favRaw.trackViewUrl || favRaw.url || "").trim();
      slot.favoriteSong.note = albumDiveCleanPastedRefs(favRaw.reason || favRaw.note || "");
    }
  }
  return true;
}

async function replaceAlbumDiveSlotFromPaste(slotKey, inputId, button, fetchAfter = true) {
  const slot = getAlbumDiveSlot(slotKey);
  const input = document.getElementById(inputId);
  if (!slot || !input) return;
  const raw = input.value || "";
  let row;
  try {
    row = albumDiveSingleImportRowFromPaste(raw);
  } catch (err) {
    showSaveToast(err?.message || "Could not parse album entry.", true);
    return;
  }
  const hasExisting = albumDiveSlotHasContent(slot);
  if (hasExisting && !confirm(`Replace ${slot.label || slotKey} album ${slot.album ? `(${slot.album}) ` : ""}with the pasted album?`)) return;
  const originalText = button?.textContent || "";
  try {
    if (button) { button.disabled = true; button.textContent = fetchAfter ? "Replacing…" : "Saving…"; }
    albumDiveApplyImportRowToExistingSlot(slot, row, { preserveListeningState: false });
    touchAlbumDive();
    if (fetchAfter && albumDiveSlotInputUrl(slot)) {
      await fetchAlbumDiveAlbumMetadata(slotKey, null);
    } else {
      rerenderAlbumDive({ preserveScroll: true });
      showSaveToast("Album replaced — save changes to keep it.", false);
    }
  } catch (err) {
    console.error("Album replacement failed", err);
    showSaveToast(`Album replacement failed: ${err?.message || "Unknown error"}`, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = originalText || (fetchAfter ? "Replace + fetch" : "Replace only"); }
  }
}

function getAlbumDiveSlot(slotKey) {
  const dive = normalizeAlbumDive(currentGenre, true);
  const existing = dive?.slots?.find((slot) => slot.key === slotKey);
  if (existing) return existing;
  const def = ALBUM_DIVE_SLOT_DEFS.find(([key]) => key === slotKey);
  if (!def) return null;
  if (Array.isArray(dive.deletedSlotKeys)) {
    dive.deletedSlotKeys = dive.deletedSlotKeys.filter((key) => key !== slotKey);
  }
  const slot = defaultAlbumDiveSlot(def[0], def[1]);
  dive.slots.push(slot);
  dive.slots.sort((a, b) => {
    const aIndex = ALBUM_DIVE_SLOT_DEFS.findIndex(([key]) => key === a.key);
    const bIndex = ALBUM_DIVE_SLOT_DEFS.findIndex(([key]) => key === b.key);
    return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
  });
  return slot;
}

function touchAlbumDive() {
  const dive = normalizeAlbumDive(currentGenre, true);
  if (!dive) return;

  dive.lastWorkedAt = new Date().toISOString();
  if (dive.status === "not_started") dive.status = "active";

  if (typeof markListeningUpdatePending === "function") {
    markListeningUpdatePending();
  } else {
    libraryUpdatesPending = true;
    setUnsavedState(true);
    toggleLibrarySaveButton(true);
  }
}

function rerenderAlbumDive(options = {}) {
  if (!currentGenre) return;
  const renderWork = () => {
    const panel = document.getElementById("albumDivePanel");
    const queuePanel = document.getElementById("albumDiveQueuePanel");
    if (panel) albumDivePanelOpen = !!panel.open;
    if (queuePanel) albumDiveQueueOpen = !queuePanel.classList.contains("hidden");
    if (panel) {
      panel.outerHTML = renderAlbumDivePanel(currentGenre);
      requestAnimationFrame(hydrateAlbumDiveAmbient);
    } else {
      loadListenScreen(currentGenre, {
        preserveDirty: true,
        skipSpotifyHydration: true,
      });
      requestAnimationFrame(hydrateAlbumDiveAmbient);
    }
  };
  if (options.preserveScroll) albumDivePreserveViewport(renderWork);
  else renderWork();
}

function startAlbumDive() {
  if (!currentGenre) return;
  const dive = normalizeAlbumDive(currentGenre, true);
  dive.enabled = true;
  dive.status = "active";
  dive.lastWorkedAt = new Date().toISOString();
  albumDiveEditorMode = true;
  touchAlbumDive();
  loadListenScreen(currentGenre, {
    preserveDirty: true,
    skipSpotifyHydration: true,
  });
  showSaveToast("Album Dive started — save changes to keep it.", false);
}

function deleteAlbumDiveSlotFromShelf(slotKey, event) {
  /* Daily Genre v212: this is intentionally stronger than clearing album fields:
     it removes the selected shelf slot from the current Album Dive and records
     the deleted slot key so normalizeAlbumDive() does not immediately recreate it. */
  return clearAlbumDiveSlot(slotKey, event);
}

function clearAlbumDiveSlot(slotKey, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const dive = normalizeAlbumDive(currentGenre, true);
  if (!dive || !Array.isArray(dive.slots)) return;
  const index = dive.slots.findIndex((slot) => slot.key === slotKey);
  if (index < 0) return;
  const slot = dive.slots[index];
  const label = slot?.label || slotKey;
  if (!confirm(`Delete the ${label} album entry? This removes this album from the dive.`)) return;
  dive.slots.splice(index, 1);
  if (!Array.isArray(dive.deletedSlotKeys)) dive.deletedSlotKeys = [];
  if (!dive.deletedSlotKeys.includes(slotKey)) dive.deletedSlotKeys.push(slotKey);
  try {
    if (localStorage.getItem(albumDiveStorageKey()) === slotKey) {
      const next = dive.slots[Math.min(index, dive.slots.length - 1)] || dive.slots[0];
      localStorage.setItem(albumDiveStorageKey(), next?.key || "");
    }
  } catch {}
  dive.lastWorkedAt = new Date().toISOString();
  touchAlbumDive();
  rerenderAlbumDive({ preserveScroll: true });
  showSaveToast(`${label} album entry deleted — save changes to keep it.`, false);
}

function clearAlbumDive() {
  if (!currentGenre) return;
  if (!confirm("Remove the Album Dive from this genre?")) return;
  delete currentGenre.albumDive;
  if (typeof markListeningUpdatePending === "function") {
    markListeningUpdatePending();
  } else {
    libraryUpdatesPending = true;
    setUnsavedState(true);
    toggleLibrarySaveButton(true);
  }
  loadListenScreen(currentGenre, {
    preserveDirty: true,
    skipSpotifyHydration: true,
  });
}

function markAlbumDiveActive() {
  const dive = normalizeAlbumDive(currentGenre, true);
  dive.enabled = true;
  dive.status = "active";
  dive.lastWorkedAt = new Date().toISOString();
  const selectedKey = getAlbumDiveFocusSlotKey(dive);
  try {
    localStorage.setItem(albumDiveStorageKey(), selectedKey || "");
  } catch {}
  albumDiveWriteActiveState(albumDiveActiveStateForCurrent(selectedKey));
  touchAlbumDive();
  rerenderAlbumDive({ preserveScroll: true });
  showSaveToast("Album Dive kept active — use the top Album Dive shortcut to return here.", false);
}
window.markAlbumDiveActive = markAlbumDiveActive;

function endAlbumDive(event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const dive = normalizeAlbumDive(currentGenre, true);
  if (!dive) return;
  dive.status = "completed";
  dive.enabled = false;
  dive.completedAt = new Date().toISOString();
  const active = albumDiveReadActiveState();
  if (active && String(active.genreId || "") === albumDiveGenreStateId(currentGenre)) {
    try { localStorage.removeItem(albumDiveStorageKey()); } catch {}
    albumDiveWriteActiveState(null);
  }
  touchAlbumDive();
  rerenderAlbumDive({ preserveScroll: true });
  if (typeof refreshTopAlbumDiveButton === "function") refreshTopAlbumDiveButton();
  showSaveToast("Album Dive ended — save changes to keep it.", false);
}
window.endAlbumDive = endAlbumDive;
function markAlbumDiveComplete() { endAlbumDive(); }
window.markAlbumDiveComplete = markAlbumDiveComplete;

function updateAlbumDiveRootField(field, value) {
  const dive = normalizeAlbumDive(currentGenre, true);
  if (!dive) return;
  dive[field] = value;
  touchAlbumDive();
}

function updateAlbumDiveSlotField(slotKey, field, value) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  if (field === "albumProviderUrl") {
    albumDiveApplyProviderUrl(slot, value);
  } else {
    slot[field] = field === "year" ? (value ? Number(value) : null) : value;
    if ((field === "spotifyAlbumUrl" || field === "spotifyUrl") && value) albumDiveApplyProviderUrl(slot, value);
    if ((field === "itunesAlbumUrl" || field === "appleAlbumUrl") && value) albumDiveApplyProviderUrl(slot, value);
  }
  if (field === "manualAlbumArt" && value && !slot.albumArt)
    slot.albumArt = value;
  touchAlbumDive();
}

function updateAlbumDiveFavoriteField(slotKey, field, value) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  slot.favoriteSong =
    slot.favoriteSong ||
    defaultAlbumDiveSlot(slot.key, slot.label).favoriteSong;
  slot.favoriteSong[field] = value;
  touchAlbumDive();
}


function albumDiveCssEscape(value) {
  const raw = String(value || "");
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function albumDiveRefreshQueueActiveInPlace(slotKey) {
  const selectorKey = albumDiveCssEscape(slotKey || "");
  document.querySelectorAll(".album-dive-queue-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.albumSlotKey === String(slotKey || ""));
  });
  document.querySelectorAll(".album-rail-card").forEach((row) => {
    row.classList.toggle("active", row.dataset.albumSlotKey === String(slotKey || ""));
  });
}

function albumDiveReplaceFocusViewInPlace(options = {}) {
  const work = () => {
    const dive = normalizeAlbumDive(currentGenre, false);
    const oldView = document.querySelector(".album-focus-view");
    if (!dive || !oldView) return false;
    const currentKey = getAlbumDiveFocusSlotKey(dive);
    const currentHeight = Math.max(oldView.offsetHeight || 0, 1);
    oldView.style.minHeight = `${currentHeight}px`;
    const template = document.createElement("template");
    template.innerHTML = renderAlbumDiveFocusPanel(dive).trim();
    const nextView = template.content.firstElementChild;
    if (!nextView) return false;
    nextView.style.minHeight = `${currentHeight}px`;
    oldView.replaceWith(nextView);
    albumDiveRefreshQueueActiveInPlace(currentKey);
    requestAnimationFrame(() => {
      const latest = document.querySelector(".album-focus-view");
      if (latest) latest.style.minHeight = "";
      hydrateAlbumDiveAmbient();
    });
    return true;
  };

  if (options.preserveScroll) albumDivePreserveViewport(work);
  else work();
}

function albumDiveRefreshSlotReactionInPlace(slotKey) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const reaction = albumDiveSlotReaction(slot);
  const selectorKey = albumDiveCssEscape(slotKey);
  document.querySelectorAll(`.album-reaction-btn[data-album-slot-key="${selectorKey}"]`).forEach((btn) => {
    const active = Number(btn.dataset.albumReaction) === Number(reaction);
    btn.classList.toggle("active", !!active);
  });
  document.querySelectorAll(`.album-dive-queue-row[data-album-slot-key="${selectorKey}"] .album-dive-queue-status`).forEach((node) => {
    node.textContent = reaction ? albumDiveReactionEmoji(reaction) : "—";
  });
  document.querySelectorAll(`.album-rail-card[data-album-slot-key="${selectorKey}"]`).forEach((node) => {
    node.classList.toggle("has-rating", !!reaction);
    let badge = node.querySelector("strong");
    if (reaction) {
      if (!badge) {
        badge = document.createElement("strong");
        node.appendChild(badge);
      }
      badge.textContent = albumDiveReactionEmoji(reaction);
    } else if (badge) {
      badge.remove();
    }
  });
}

function albumDiveRefreshTrackReactionInPlace(slotKey, trackValue, reaction) {
  const selectorKey = albumDiveCssEscape(slotKey);
  const selectorTrack = albumDiveCssEscape(trackValue);
  document.querySelectorAll(`.album-track-reaction-btn[data-album-slot-key="${selectorKey}"][data-track-value="${selectorTrack}"]`).forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.trackReaction) === Number(reaction));
  });
}

function albumDiveRefreshTopTracksInPlace(slotKey, trackValue) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const selectorKey = albumDiveCssEscape(slotKey);
  const selected = new Set(albumDiveTopTrackValues(slot));
  const topSummary = albumDiveTopTrackSummary(slot);
  document.querySelectorAll(`.album-track-top-btn[data-album-slot-key="${selectorKey}"]`).forEach((btn) => {
    const value = btn.dataset.trackValue || "";
    const active = selected.has(value);
    btn.classList.toggle("active", active);
    btn.textContent = active ? "★ Top" : "☆ Top";
    btn.title = active ? "Remove top song" : "Mark as top song";
    btn.setAttribute("aria-label", btn.title);
  });
  document.querySelectorAll(`input[type="checkbox"][data-album-slot-key="${selectorKey}"]`).forEach((input) => {
    const value = input.dataset.trackValue || "";
    input.checked = selected.has(value);
    input.closest?.(".album-top-track-check")?.classList.toggle("active", input.checked);
  });
  document.querySelectorAll(".album-focus-favorite-summary span").forEach((node) => {
    node.textContent = topSummary;
  });
  document.querySelectorAll(`.album-dive-queue-row[data-album-slot-key="${selectorKey}"] em`).forEach((node) => {
    node.textContent = topSummary;
  });
}

function albumDiveRefreshFavoriteAlbumInPlace(slotKey) {
  const dive = normalizeAlbumDive(currentGenre, false);
  const selected = (dive?.slots || []).find((slot) => slot.key === slotKey);
  const active = !!selected?.favoriteAlbum;
  document.querySelectorAll(".album-focus-trophy").forEach((btn) => {
    btn.classList.toggle("active", active);
    btn.title = active ? "Remove favorite album" : "Mark as favorite album";
    btn.setAttribute("aria-label", btn.title);
  });
}

function setAlbumDiveSlotRating(slotKey, rating) {
  const reaction = albumDiveReactionFromLegacyRating(rating);
  setAlbumDiveSlotReaction(slotKey, reaction);
}

function setAlbumDiveSlotReaction(slotKey, value, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const reaction = [1, 2, 3].includes(Number(value)) ? Number(value) : null;
  slot.albumReaction = Number(slot.albumReaction) === reaction ? null : reaction;
  slot.rating = null;
  const markedSampled = [1, 2, 3].includes(Number(value)) ? albumDiveMarkSlotSampled(slot) : false;
  touchAlbumDive();
  if (markedSampled && typeof albumDiveReplaceFocusViewInPlace === "function") {
    albumDiveReplaceFocusViewInPlace({ preserveScroll: true });
  } else {
    albumDiveRefreshSlotReactionInPlace(slotKey);
  }
}

function setAlbumDiveFavoriteAlbum(slotKey, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const dive = normalizeAlbumDive(currentGenre, true);
  if (!dive?.slots?.length) return;
  const slot = dive.slots.find((item) => item.key === slotKey);
  if (!slot) return;
  const next = !slot.favoriteAlbum;
  dive.slots.forEach((item) => {
    item.favoriteAlbum = false;
  });
  slot.favoriteAlbum = next;
  const markedSampled = next ? albumDiveMarkSlotSampled(slot) : false;
  touchAlbumDive();
  if (markedSampled && typeof albumDiveReplaceFocusViewInPlace === "function") {
    albumDiveReplaceFocusViewInPlace({ preserveScroll: true });
  } else {
    albumDiveRefreshFavoriteAlbumInPlace(slotKey);
  }
}


function albumDiveIsAppleAlbumUrl(url = "") {
  return /(?:music\.apple\.com|itunes\.apple\.com|geo\.music\.apple\.com)\//i.test(String(url || ""));
}

function albumDiveAppleCollectionIdFromUrl(url = "") {
  const value = String(url || "").trim();
  if (!value) return "";
  const collectionParam = value.match(/[?&](?:collectionId|albumId)=(\d+)/i);
  if (collectionParam) return collectionParam[1];
  const albumPath = value.match(/\/album\/(?:[^/?#]+\/)?(\d+)(?:[/?#]|$)/i);
  if (albumPath) return albumPath[1];
  const idMatch = value.match(/(?:^|[^a-z])id(\d{5,})(?:[^0-9]|$)/i);
  if (idMatch) return idMatch[1];
  return "";
}

function albumDiveBestAppleArtwork(url = "", size = 1000) {
  const value = String(url || "").trim();
  if (!value) return "";
  return value
    .replace(/\/\d+x\d+bb\.(jpg|png|webp)(\?.*)?$/i, `/${size}x${size}bb.$1$2`)
    .replace(/\/\d+x\d+[^/]*\.(jpg|png|webp)(\?.*)?$/i, `/${size}x${size}bb.$1$2`);
}

function albumDiveSlotInputUrl(slot = {}) {
  return String(
    slot.albumProviderUrl ||
      slot.spotifyAlbumUrl ||
      slot.spotifyUrl ||
      slot.itunesAlbumUrl ||
      slot.appleAlbumUrl ||
      "",
  ).trim();
}

function albumDiveSlotCanonicalUrl(slot = {}) {
  return String(
    slot.spotifyAlbumUrl ||
      slot.spotifyUrl ||
      slot.itunesAlbumUrl ||
      slot.appleAlbumUrl ||
      slot.albumProviderUrl ||
      "",
  ).trim();
}

function albumDiveSourceLabel(slot = {}) {
  if (slot.metadataSource === "itunes" || slot.itunesCollectionId || slot.itunesAlbumUrl || slot.appleAlbumUrl) return "Apple/iTunes";
  if (slot.metadataSource === "spotify" || slot.spotifyAlbumId || slot.spotifyAlbumUrl || slot.spotifyUrl) return "Spotify";
  return "Manual";
}

function albumDiveSourceClass(slot = {}) {
  if (slot.metadataSource === "itunes" || slot.itunesCollectionId || slot.itunesAlbumUrl || slot.appleAlbumUrl) return "itunes";
  if (slot.metadataSource === "spotify" || slot.spotifyAlbumId || slot.spotifyAlbumUrl || slot.spotifyUrl) return "spotify";
  return "manual";
}

function albumDiveApplyProviderUrl(slot, value = "") {
  const url = String(value || "").trim();
  slot.albumProviderUrl = url;
  if (!url) return;
  if (spotifyIdFromUrl(url, "album")) {
    slot.spotifyAlbumUrl = url;
    slot.spotifyUrl = url;
    slot.spotifyAlbumId = spotifyIdFromUrl(url, "album") || slot.spotifyAlbumId || "";
    slot.metadataSource = "spotify";
    return;
  }
  if (albumDiveIsAppleAlbumUrl(url) || albumDiveAppleCollectionIdFromUrl(url)) {
    slot.itunesAlbumUrl = url;
    slot.appleAlbumUrl = url;
    slot.itunesCollectionId = albumDiveAppleCollectionIdFromUrl(url) || slot.itunesCollectionId || "";
    slot.metadataSource = "itunes";
  }
}

function albumDiveAppleTrackToDiveTrack(item = {}, albumArtist = "") {
  return normalizeAlbumDiveTrack({
    title: item.trackName || item.collectionName || "",
    artist: item.artistName || albumArtist || "",
    artists: item.artistName ? [item.artistName] : [],
    itunesTrackUrl: item.trackViewUrl || "",
    itunesTrackId: item.trackId || "",
    previewUrl: item.previewUrl || "",
    durationMs: item.trackTimeMillis || null,
    trackNumber: item.trackNumber || null,
    discNumber: item.discNumber || null,
  });
}

async function fetchAlbumDiveItunesAlbumMetadata(slot) {
  const inputUrl = albumDiveSlotInputUrl(slot);
  const collectionId = slot.itunesCollectionId || albumDiveAppleCollectionIdFromUrl(inputUrl);
  if (!collectionId) throw new Error("Paste an Apple Music or iTunes album URL with an album ID.");
  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song&limit=200`;
  const response = await fetch(lookupUrl, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Apple/iTunes lookup failed (${response.status}).`);
  const results = Array.isArray(data.results) ? data.results : [];
  const collection =
    results.find((item) => item.wrapperType === "collection" || item.collectionType === "Album") ||
    results.find((item) => item.collectionId && String(item.collectionId) === String(collectionId));
  if (!collection) throw new Error("No Apple/iTunes album metadata found for that URL.");
  const albumArtist = collection.artistName || slot.artist || "";
  slot.itunesCollectionId = String(collection.collectionId || collectionId || "");
  slot.itunesAlbumUrl = collection.collectionViewUrl || inputUrl || slot.itunesAlbumUrl || "";
  slot.appleAlbumUrl = slot.itunesAlbumUrl;
  slot.albumProviderUrl = slot.itunesAlbumUrl || inputUrl || slot.albumProviderUrl || "";
  slot.metadataSource = "itunes";
  slot.album = collection.collectionName || slot.album || "";
  slot.artist = albumArtist || slot.artist || "";
  slot.releaseDate = collection.releaseDate || slot.releaseDate || "";
  slot.year = collection.releaseDate ? Number(String(collection.releaseDate).slice(0, 4)) || slot.year || null : slot.year || null;
  slot.albumArt = albumDiveBestAppleArtwork(collection.artworkUrl100 || collection.artworkUrl60 || slot.albumArt || "");
  slot.albumType = collection.collectionType || slot.albumType || "album";
  slot.primaryGenreName = collection.primaryGenreName || slot.primaryGenreName || "";
  slot.totalTracks = Number(collection.trackCount || slot.totalTracks || 0) || null;
  const tracks = results
    .filter((item) => item.wrapperType === "track" && item.kind === "song")
    .map((item) => albumDiveAppleTrackToDiveTrack(item, albumArtist))
    .filter((track) => track.title || track.itunesTrackId || track.itunesTrackUrl);
  if (tracks.length) {
    slot.tracks = tracks;
    slot.totalTracks = slot.totalTracks || tracks.length;
  }
  return slot;
}

function spotifyIdFromUrl(url = "", type = "album") {
  const value = String(url || "").trim();
  const uriMatch = value.match(
    new RegExp(`spotify:${type}:([A-Za-z0-9]+)`, "i"),
  );
  if (uriMatch) return uriMatch[1];
  const webMatch = value.match(
    new RegExp(`open\.spotify\.com/${type}/([A-Za-z0-9]+)`, "i"),
  );
  return webMatch ? webMatch[1] : "";
}

async function fetchSpotifyAlbumOembed(url) {
  const albumUrl = String(url || "").trim();
  if (!/open\.spotify\.com\/album\//i.test(albumUrl)) return null;
  return fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(albumUrl)}`,
  )
    .then(async (response) => (response.ok ? response.json() : null))
    .catch(() => null);
}

function spotifyAlbumTrackToDiveTrack(item, albumArtist = "") {
  const artists = (item?.artists || []).map((a) => a.name).filter(Boolean);
  return normalizeAlbumDiveTrack({
    title: item?.name || "",
    artist: artists.join(", ") || albumArtist,
    artists,
    spotifyTrackUrl: item?.external_urls?.spotify || "",
    spotifyTrackId: item?.id || "",
    durationMs: item?.duration_ms || null,
    trackNumber: item?.track_number || null,
    discNumber: item?.disc_number || null,
  });
}

async function fetchAllSpotifyAlbumTracks(
  albumId,
  firstPage,
  albumArtist = "",
) {
  const tracks = [];
  let page = firstPage || null;
  if (Array.isArray(page?.items))
    tracks.push(
      ...page.items.map((item) =>
        spotifyAlbumTrackToDiveTrack(item, albumArtist),
      ),
    );
  let nextUrl = page?.next || "";
  let guard = 0;
  while (nextUrl && guard < 12) {
    guard += 1;
    const res = await spotifyApiFetch(nextUrl);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) break;
    if (Array.isArray(data.items))
      tracks.push(
        ...data.items.map((item) =>
          spotifyAlbumTrackToDiveTrack(item, albumArtist),
        ),
      );
    nextUrl = data.next || "";
  }
  return tracks.filter(
    (track) => track.title || track.spotifyTrackId || track.spotifyTrackUrl,
  );
}

async function fetchAlbumDiveAlbumMetadata(slotKey, button) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const originalText = button?.textContent || "";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Fetching…";
    }
    const providerUrl = albumDiveSlotInputUrl(slot);
    if (providerUrl) albumDiveApplyProviderUrl(slot, providerUrl);
    const shouldUseApple =
      albumDiveIsAppleAlbumUrl(providerUrl) ||
      (!spotifyIdFromUrl(providerUrl || slot.spotifyAlbumUrl || slot.spotifyUrl, "album") &&
        (slot.itunesCollectionId || slot.itunesAlbumUrl || slot.appleAlbumUrl));
    let updated = false;
    if (shouldUseApple) {
      await fetchAlbumDiveItunesAlbumMetadata(slot);
      updated = true;
    } else {
      const albumId = spotifyIdFromUrl(
        slot.spotifyAlbumUrl || slot.spotifyUrl || providerUrl,
        "album",
      );
      if (albumId && spotifySession?.access_token) {
        const response = await spotifyApiFetch(
          `albums/${encodeURIComponent(albumId)}`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(
            data?.error?.message ||
              data?.error ||
              `Spotify album lookup failed (${response.status}).`,
          );
        if (data?.id) {
          const albumArtist = (data.artists || [])
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ");
          slot.spotifyAlbumId = data.id;
          slot.spotifyAlbumUrl =
            data.external_urls?.spotify ||
            slot.spotifyAlbumUrl ||
            slot.spotifyUrl;
          slot.spotifyUrl =
            data.external_urls?.spotify ||
            slot.spotifyUrl ||
            slot.spotifyAlbumUrl;
          slot.albumProviderUrl = slot.spotifyAlbumUrl || slot.spotifyUrl || slot.albumProviderUrl || "";
          slot.metadataSource = "spotify";
          slot.album = data.name || slot.album;
          slot.artist = albumArtist || slot.artist;
          slot.releaseDate = data.release_date || slot.releaseDate || "";
          slot.year = data.release_date
            ? Number(String(data.release_date).slice(0, 4)) || slot.year
            : slot.year;
          slot.albumArt =
            data.images?.[1]?.url || data.images?.[0]?.url || slot.albumArt;
          slot.albumType = data.album_type || slot.albumType || "";
          slot.totalTracks =
            Number(data.total_tracks || data.tracks?.total || 0) ||
            slot.totalTracks ||
            null;
          slot.tracks = await fetchAllSpotifyAlbumTracks(
            data.id,
            data.tracks,
            albumArtist,
          );
          updated = true;
        }
      }
      if (!updated && slot.spotifyAlbumUrl) {
        const oembed = await fetchSpotifyAlbumOembed(slot.spotifyAlbumUrl);
        if (oembed) {
          slot.albumArt = oembed.thumbnail_url || slot.albumArt;
          if (!slot.album && oembed.title) slot.album = oembed.title;
          if (!slot.artist && oembed.author_name)
            slot.artist = oembed.author_name;
          slot.metadataSource = slot.metadataSource || "spotify";
          updated = true;
        }
      }
    }
    if (!updated && slot.manualAlbumArt) {
      slot.albumArt = slot.manualAlbumArt;
      updated = true;
    }
    touchAlbumDive();
    rerenderAlbumDive({ preserveScroll: true });
    showSaveToast(
      updated
        ? `${albumDiveSourceLabel(slot)} album metadata updated${slot.tracks?.length ? ` with ${slot.tracks.length} tracks` : ""} — save changes to keep it.`
        : "No album metadata found. Try Spotify, Apple/iTunes, or a manual art URL.",
      !updated,
    );
  } catch (err) {
    console.error("Album Dive album lookup failed", err);
    showSaveToast(
      `Album lookup failed: ${err?.message || "Unknown error"}`,
      true,
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Fetch Album + Tracks";
    }
  }
}

function setAlbumDiveTrackReaction(slotKey, trackValue, value, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const cleanValue = String(trackValue || "");
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  const track = tracks.find(
    (item) =>
      cleanValue &&
      (cleanValue === item.spotifyTrackId ||
        cleanValue === item.spotifyTrackUrl ||
        cleanValue === item.itunesTrackId ||
        cleanValue === item.itunesTrackUrl ||
        cleanValue === albumDiveTrackOptionValue(item)),
  );
  if (!track) return;
  const reaction = [1, 2, 3].includes(Number(value)) ? Number(value) : null;
  track.reaction = Number(track.reaction) === reaction ? null : reaction;
  const shouldMarkSampled = [1, 2, 3].includes(Number(value)) ? albumDiveMarkSlotSampled(slot) : false;
  touchAlbumDive();
  if (shouldMarkSampled && typeof albumDiveReplaceFocusViewInPlace === "function") {
    albumDiveReplaceFocusViewInPlace({ preserveScroll: true });
  } else {
    albumDiveRefreshTrackReactionInPlace(slotKey, cleanValue, track.reaction);
  }
}

function syncAlbumDiveFavoriteToFirstTopTrack(slot) {
  const first = albumDiveTopTracks(slot)[0];
  if (!first) return;
  slot.favoriteSong = slot.favoriteSong || defaultAlbumDiveSlot(slot.key, slot.label).favoriteSong;
  slot.favoriteSong.title = first.title || "";
  slot.favoriteSong.artist = first.artist || slot.artist || "";
  slot.favoriteSong.spotifyTrackUrl = first.spotifyTrackUrl || "";
  slot.favoriteSong.spotifyTrackId = first.spotifyTrackId || "";
  slot.favoriteSong.itunesTrackUrl = first.itunesTrackUrl || "";
  slot.favoriteSong.itunesTrackId = first.itunesTrackId || "";
  slot.favoriteSong.previewUrl = first.previewUrl || "";
  slot.favoriteSong.albumArt = slot.albumArt || slot.manualAlbumArt || "";
  slot.favoriteSong.durationMs = first.durationMs || null;
  slot.favoriteSong.trackNumber = first.trackNumber || null;
  slot.favoriteSong.discNumber = first.discNumber || null;
  slot.favoriteSong.promotedToSongLog = false;
}

function toggleAlbumDiveTopTrack(slotKey, trackValue, forceValue, event) {
  if (event) { event.preventDefault?.(); event.stopPropagation?.(); }
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const cleanValue = String(trackValue || "");
  if (!cleanValue) return;
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  const track = tracks.find((item) => cleanValue && (
    cleanValue === item.spotifyTrackId ||
    cleanValue === item.spotifyTrackUrl ||
    cleanValue === item.itunesTrackId ||
    cleanValue === item.itunesTrackUrl ||
    cleanValue === albumDiveTrackOptionValue(item)
  ));
  const canonical = track ? albumDiveTrackOptionValue(track) : cleanValue;
  const current = new Set(albumDiveTopTrackValues(slot));
  const shouldAdd = typeof forceValue === "boolean" ? forceValue : !current.has(canonical);
  if (shouldAdd) current.add(canonical);
  else current.delete(canonical);
  slot.topTracks = [...current];
  if (slot.topTracks.length) syncAlbumDiveFavoriteToFirstTopTrack(slot);
  const markedSampled = shouldAdd ? albumDiveMarkSlotSampled(slot) : false;
  touchAlbumDive();
  if (markedSampled && typeof albumDiveReplaceFocusViewInPlace === "function") {
    albumDiveReplaceFocusViewInPlace({ preserveScroll: true });
  } else {
    albumDiveRefreshTopTracksInPlace(slotKey, canonical);
  }
}

function setAlbumDiveFavoriteFromTrack(slotKey, value) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const tracks = Array.isArray(slot.tracks) ? slot.tracks : [];
  const track = tracks.find(
    (t) =>
      value &&
      (value === t.spotifyTrackId ||
        value === t.spotifyTrackUrl ||
        value === t.itunesTrackId ||
        value === t.itunesTrackUrl ||
        value === albumDiveTrackOptionValue(t)),
  );
  if (!track) return;
  const selected = new Set(albumDiveTopTrackValues(slot));
  selected.add(albumDiveTrackOptionValue(track));
  slot.topTracks = [...selected];
  slot.favoriteSong =
    slot.favoriteSong ||
    defaultAlbumDiveSlot(slot.key, slot.label).favoriteSong;
  slot.favoriteSong.title = track.title || "";
  slot.favoriteSong.artist = track.artist || slot.artist || "";
  slot.favoriteSong.spotifyTrackUrl = track.spotifyTrackUrl || "";
  slot.favoriteSong.spotifyTrackId = track.spotifyTrackId || "";
  slot.favoriteSong.itunesTrackUrl = track.itunesTrackUrl || "";
  slot.favoriteSong.itunesTrackId = track.itunesTrackId || "";
  slot.favoriteSong.previewUrl = track.previewUrl || "";
  slot.favoriteSong.albumArt = slot.albumArt || slot.manualAlbumArt || "";
  slot.favoriteSong.durationMs = track.durationMs || null;
  slot.favoriteSong.trackNumber = track.trackNumber || null;
  slot.favoriteSong.discNumber = track.discNumber || null;
  slot.favoriteSong.promotedToSongLog = false;
  touchAlbumDive();
  rerenderAlbumDive({ preserveScroll: true });
}

async function fetchAlbumDiveFavoriteMetadata(slotKey, button) {
  const slot = getAlbumDiveSlot(slotKey);
  if (!slot) return;
  const fav = (slot.favoriteSong =
    slot.favoriteSong ||
    defaultAlbumDiveSlot(slot.key, slot.label).favoriteSong);
  const originalText = button?.textContent || "";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Fetching…";
    }
    const track = fav.spotifyTrackUrl
      ? await fetchSpotifyTrackMetadata(fav.spotifyTrackUrl, true)
      : null;
    if (track) {
      fav.spotifyTrackId = track.spotifyId || fav.spotifyTrackId || "";
      fav.spotifyTrackUrl = track.spotifyUrl || fav.spotifyTrackUrl || "";
      fav.title = track.title || fav.title || "";
      fav.artist = track.artist || fav.artist || "";
      fav.albumArt = track.artwork || fav.albumArt || slot.albumArt || "";
      if (!slot.albumArt && track.artwork) slot.albumArt = track.artwork;
      touchAlbumDive();
      rerenderAlbumDive({ preserveScroll: true });
      showSaveToast(
        "Favorite song metadata updated — save changes to keep it.",
        false,
      );
      return;
    }
    const fallback = fav.spotifyTrackUrl
      ? await fetchSpotifyOembed(fav.spotifyTrackUrl)
      : null;
    if (fallback) {
      const raw = fallback.title || "";
      fav.title = fav.title || raw.split(/[·\u2013\u2014]/)[0].trim() || raw;
      fav.artist = fav.artist || fallback.author_name || "";
      fav.albumArt =
        fallback.thumbnail_url || fav.albumArt || slot.albumArt || "";
      if (!slot.albumArt && fallback.thumbnail_url)
        slot.albumArt = fallback.thumbnail_url;
      touchAlbumDive();
      rerenderAlbumDive({ preserveScroll: true });
      showSaveToast(
        "Favorite song metadata updated from Spotify preview — save changes to keep it.",
        false,
      );
      return;
    }
    showSaveToast(
      "No favorite track metadata found. Paste a Spotify track URL or fill the fields manually.",
      true,
    );
  } catch (err) {
    console.error("Album Dive favorite lookup failed", err);
    showSaveToast(
      `Favorite track lookup failed: ${err?.message || "Unknown error"}`,
      true,
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Fetch Track Info";
    }
  }
}

function promoteAlbumDiveFavorite(slotKey) {
  if (!currentGenre) return;
  const slot = getAlbumDiveSlot(slotKey);
  const fav = slot?.favoriteSong || {};
  if (!slot || (!fav.title && !fav.spotifyTrackUrl && !fav.itunesTrackUrl)) {
    alert("Add a favorite song title or Spotify/Apple track URL first.");
    return;
  }
  const official = inflateSongsFromStorage(
    currentGenre.songs_listened || [],
  ).filter((s) => !s.isPending);
  const favoriteUrl = fav.spotifyTrackUrl || fav.itunesTrackUrl || "";
  const song = {
    url: normalizeSongUrl(favoriteUrl || ""),
    spotifyUrl: normalizeSongUrl(fav.spotifyTrackUrl || ""),
    spotifyId:
      fav.spotifyTrackId || spotifyTrackId(fav.spotifyTrackUrl || "") || "",
    itunesUrl: fav.itunesTrackUrl || "",
    itunesTrackId: fav.itunesTrackId || "",
    title: fav.title || "Album Dive favorite",
    artist: fav.artist || slot.artist || "",
    score: slot.rating || numericRating(currentGenre) || null,
    reason: `Album Dive favorite from ${slot.label}: ${[slot.artist, slot.album].filter(Boolean).join(" — ")}`,
    source: fav.spotifyTrackUrl ? "album_dive" : "itunes_album_dive",
    album: slot.album || "",
    artwork: fav.albumArt || slot.albumArt || slot.manualAlbumArt || "",
    releaseDate: slot.releaseDate || "",
    releaseYear: slot.year || null,
    durationMs: fav.durationMs || null,
    trackNumber: fav.trackNumber || null,
    discNumber: fav.discNumber || null,
    albumDiveSlot: slot.key,
  };
  const key = songIdentity(song);
  if (!official.some((existing) => songIdentity(existing) === key))
    official.push(song);
  currentGenre.songs_listened = official;
  fav.promotedToSongLog = true;
  slot.spawnedSongs = Array.isArray(slot.spawnedSongs) ? slot.spawnedSongs : [];
  if (!slot.spawnedSongs.some((existing) => songIdentity(existing) === key))
    slot.spawnedSongs.push(song);
  touchAlbumDive();
  loadListenScreen(currentGenre, {
    preserveDirty: true,
    skipSpotifyHydration: true,
  });
  showSaveToast(
    "Favorite song added to the genre song log — save changes to keep it.",
    false,
  );
}
