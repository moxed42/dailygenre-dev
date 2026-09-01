/* Daily Genre v260 — queue-native Seminal/Media roles + purge protection + duplicate review. */
(function installDailyGenreQueueIdentityRoles() {
  'use strict';

  const BUILD = 'v260';
  const PLACEHOLDER_URL_RE = /^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i;
  const ROLE_SEMINAL = 'seminal';
  const ROLE_MEDIA = 'media';
  const QUEUE_ROLE_MARKER = 'song_queue_v258';

  let approvedSignature = '';
  let observer = null;

  function getBinding(name) {
    try {
      if (typeof window[name] === 'function') return window[name];
    } catch (_) {}
    try {
      // eslint-disable-next-line no-eval
      const value = (0, eval)(name);
      return typeof value === 'function' ? value : value;
    } catch (_) {
      return null;
    }
  }

  function installGlobal(name, value) {
    try { window[name] = value; } catch (_) {}
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(`${name} = window[${JSON.stringify(name)}]`);
    } catch (_) {}
  }

  function currentGenreValue() {
    try {
      // eslint-disable-next-line no-eval
      return (0, eval)('currentGenre') || null;
    } catch (_) {
      return null;
    }
  }

  function clean(value = '') {
    try {
      const fn = getBinding('cleanPastedCitationArtifacts');
      if (typeof fn === 'function') return fn(value);
    } catch (_) {}
    return String(value || '').trim();
  }

  function normalizeUrl(value = '') {
    try {
      const fn = getBinding('normalizeSongUrl');
      if (typeof fn === 'function') return fn(value);
    } catch (_) {}
    return String(value || '').trim();
  }

  function normalizeLabel(label = '') {
    try {
      const fn = getBinding('normalizeSongArtistAndTitle');
      if (typeof fn === 'function') return fn(label, '');
    } catch (_) {}
    const value = clean(label);
    const match = value.match(/^(.+?)\s+[—–]\s+(.+)$/);
    return match
      ? { artist: clean(match[1]), title: clean(match[2]), pendingGenreTag: '' }
      : { artist: '', title: value, pendingGenreTag: '' };
  }

  function parsePrefix(rawLine = '') {
    let line = String(rawLine || '').trim();
    const flags = { isLevelUp: false, isAdd: false, isPromote: false };
    if (/^(?:🔼\s*)?LEVEL\s*UP\s*:/i.test(line)) {
      flags.isLevelUp = true;
      line = line.replace(/^(?:🔼\s*)?LEVEL\s*UP\s*:\s*/i, '');
    } else if (/^(?:🔼\s*)?ADD\s*:/i.test(line)) {
      flags.isAdd = true;
      line = line.replace(/^(?:🔼\s*)?ADD\s*:\s*/i, '');
    } else if (/^(?:🔼\s*)?PROMOTE\s*:/i.test(line)) {
      flags.isPromote = true;
      line = line.replace(/^(?:🔼\s*)?PROMOTE\s*:\s*/i, '');
    }
    return { line, ...flags };
  }

  function extractUrl(value = '') {
    const text = String(value || '').trim();
    const markdown = text.match(/^\s*\[[^\]]*\]\((https?:\/\/[^\s)]+)\)\s*$/i);
    if (markdown) return markdown[1].trim();
    const inline = text.match(/https?:\/\/[^\s)]+/i);
    return inline ? inline[0].trim() : '';
  }

  function extractMarkdownLabel(value = '') {
    const match = String(value || '').trim().match(/^\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/i);
    return match ? clean(match[1]) : '';
  }

  function stripUrlFromLabel(value = '', url = '') {
    let label = clean(value);
    if (url) label = label.replace(url, '').trim();
    label = label.replace(/^\[[^\]]*\]\(\s*\)$/i, '').trim();
    return label.replace(/^[-–—\s|]+|[-–—\s|]+$/g, '').trim();
  }

  function splitTrailingArtistTitle(reason = '') {
    const value = clean(reason);
    if (!value) return { reason: '', label: '' };
    const match = value.match(/^(.*\S)\s+[—–]\s+([^—–|\n]{1,180}?)\s+[—–]\s+([^—–|\n]{1,220}?)\s*$/);
    if (!match) return { reason: value, label: '' };
    const reasonText = clean(match[1]);
    const artist = clean(match[2]);
    const title = clean(match[3]);
    if (!reasonText || !artist || !title) return { reason: value, label: '' };
    return { reason: reasonText, label: `${artist} — ${title}` };
  }

  function extractPendingGenreTag(value = '', { strict = false } = {}) {
    const text = String(value || '');
    if (!text.trim()) return { text, tag: '' };
    const pattern = strict
      ? /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*)(?=\s*$)/
      : /(?:^|\s)@([A-Za-z0-9][A-Za-z0-9_'&/-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_'&/-]*)*)(?=\s*$)/;
    const match = text.match(pattern);
    if (!match) return { text, tag: '' };
    return {
      text: text.slice(0, match.index).trim(),
      tag: String(match[1] || '').replace(/_/g, ' ').trim().toLowerCase(),
    };
  }

  function parseRoleToken(value = '') {
    const token = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (['seminal', 'seminal_track', 'canonical', 'anchor'].includes(token)) return ROLE_SEMINAL;
    if (['media', 'media_touchstone', 'touchstone', 'popular'].includes(token)) return ROLE_MEDIA;
    return '';
  }

  function sourceForUrl(url = '') {
    try {
      const fn = getBinding('songUrlSource');
      if (typeof fn === 'function') return fn(url);
    } catch (_) {}
    return 'manual';
  }

  function stampLevelUp(child, parent) {
    try {
      const fn = getBinding('stampLevelUpParent');
      if (typeof fn === 'function') {
        fn(child, parent);
        return;
      }
    } catch (_) {}
    child.levelUpParentTitle = String(parent?.title || '');
    child.levelUpParentArtist = String(parent?.artist || '');
    child.levelUpParentUrl = String(parent?.url || '');
  }

  function clearRoleFields(song) {
    if (!song || typeof song !== 'object') return song;
    delete song.isIdentityTrack;
    delete song.identityType;
    delete song.identityIndex;
    delete song.identityLabel;
    delete song.mediaTitle;
    delete song.media;
    delete song.mediaType;
    delete song.__bulkIdentityRoleSpecified;
    delete song.__bulkIdentityRoleIgnored;
    return song;
  }

  function stampRole(song, role, mediaIndex = -1) {
    if (!song || !role) return song;
    song.isIdentityTrack = true;
    song.identityType = role;
    song.identityIndex = role === ROLE_MEDIA ? mediaIndex : -1;
    song.identityLabel = role === ROLE_SEMINAL ? 'Seminal track' : 'Media track';
    return song;
  }

  function patchedParseSongLinks(text) {
    const rawLines = String(text || '').replace(/\r/g, '').split('\n');
    const songs = [];
    let mediaIndex = 0;

    rawLines.forEach((rawLine, zeroIndex) => {
      if (!String(rawLine || '').trim()) return;
      const rowNumber = zeroIndex + 1;
      const { line, isLevelUp, isAdd, isPromote } = parsePrefix(rawLine);
      const parts = String(line || '').split('|').map(part => clean(part).trim());
      if (!parts.length) return;

      const first = parts[0] || '';
      let url = extractUrl(first);
      const markdownLabel = extractMarkdownLabel(first);
      let score = null;
      let reason = '';
      let tailStart = 1;
      let displayLabel = markdownLabel || stripUrlFromLabel(first, url);
      const isScore = value => /^[1-5]$/.test(String(value || '').trim());

      if (parts.length > 1 && isScore(parts[1])) {
        score = parts[1];
        reason = parts[2] || '';
        tailStart = 3;
      } else if (parts.length > 1) {
        reason = parts[1] || '';
        tailStart = 2;
      }

      const tail = parts.slice(tailStart);
      const roleOffset = tail.findIndex(part => Boolean(parseRoleToken(part)));
      const role = roleOffset >= 0 ? parseRoleToken(tail[roleOffset]) : '';
      const labelParts = roleOffset >= 0 ? tail.slice(0, roleOffset) : tail;
      const roleExtras = roleOffset >= 0 ? tail.slice(roleOffset + 1) : [];
      displayLabel = labelParts.filter(Boolean).join(' | ') || displayLabel;

      if (!url) {
        const urlPart = parts.find(part => extractUrl(part));
        if (urlPart) url = extractUrl(urlPart);
      }
      if (!displayLabel && !url && first && !isScore(first)) displayLabel = first;
      url = normalizeUrl(url);

      if (!displayLabel) {
        const trailing = splitTrailingArtistTitle(reason);
        reason = trailing.reason;
        displayLabel = trailing.label;
      }

      const reasonTag = extractPendingGenreTag(reason);
      const labelTag = extractPendingGenreTag(displayLabel, { strict: true });
      const label = normalizeLabel(labelTag.text.trim());
      const pendingGenreTag = reasonTag.tag || labelTag.tag || label.pendingGenreTag || '';

      const song = {
        url,
        score,
        reason: reasonTag.text.trim(),
        title: label.title,
        artist: label.artist,
        source: sourceForUrl(url),
        added: new Date().toISOString().slice(0, 10),
        _bulkRow: rowNumber,
        __bulkIdentityRoleSpecified: Boolean(role),
      };

      if (pendingGenreTag) song._pendingGenreTag = pendingGenreTag;
      if (isAdd) song.isAdd = true;
      if (isPromote) song.isPromote = true;
      if (isLevelUp) song.isLevelUp = true;

      if (role && isLevelUp) {
        song.__bulkIdentityRoleIgnored = role;
      } else if (role === ROLE_SEMINAL) {
        stampRole(song, role, -1);
      } else if (role === ROLE_MEDIA) {
        song.mediaTitle = clean(roleExtras[0] || '');
        song.media = song.mediaTitle;
        song.mediaType = clean(roleExtras[1] || '').toLowerCase();
        stampRole(song, role, mediaIndex);
        mediaIndex += 1;
      }

      if (!song.url && !song.title && !song.reason) return;
      if (!isLevelUp && !isAdd && !isPromote && !song.url && !song.title) return;

      if (isLevelUp && songs.length > 0) {
        stampLevelUp(song, songs[songs.length - 1]);
        songs[songs.length - 1].levelUp = song;
      } else {
        songs.push(song);
      }
    });

    return songs;
  }

  function roleForSong(song = {}) {
    const type = String(song.identityType || '').trim().toLowerCase();
    if (type === ROLE_SEMINAL) return ROLE_SEMINAL;
    if (type === ROLE_MEDIA || type === 'popular') return ROLE_MEDIA;
    return '';
  }

  function displaySongLabel(song = {}) {
    const artist = clean(song.artist || '');
    const title = clean(song.title || song.name || '');
    return artist && title ? `${artist} — ${title}` : (title || artist || '');
  }

  function serializeSongRow(song = {}, prefix = '', allowRole = true) {
    const url = normalizeUrl(song.url || song.spotifyUrl || '');
    const score = song.score == null ? '' : String(song.score);
    const reason = song._pendingGenreTag
      ? `${song.reason || ''} @${song._pendingGenreTag}`.trim()
      : clean(song.reason || '');
    const label = displaySongLabel(song);
    const fields = [url, score, reason, label];
    const role = allowRole ? roleForSong(song) : '';

    if (role === ROLE_SEMINAL) {
      fields.push('SEMINAL');
    } else if (role === ROLE_MEDIA) {
      fields.push('MEDIA');
      fields.push(clean(song.mediaTitle || song.media || ''));
      fields.push(clean(song.mediaType || ''));
    }

    if (!prefix && url && !score && !reason && !label && !role) return url;
    return prefix + fields.join(' | ');
  }

  function patchedBuildSongsBulkEditorText(genre) {
    let list = Array.isArray(genre?.songs_listened) ? genre.songs_listened : [];
    try {
      const fn = getBinding('inflateSongsFromStorage');
      if (typeof fn === 'function') list = fn(list);
    } catch (_) {}

    return list
      .filter(song => !song?.isPending)
      .flatMap(song => {
        const prefix = song?.isPromote ? '🔼 PROMOTE: ' : (song?.isAdd ? '🔼 ADD: ' : '');
        const rows = [serializeSongRow(song, prefix, true)];
        if (song?.levelUp) rows.push(serializeSongRow(song.levelUp, '🔼 LEVEL UP: ', false));
        return rows;
      })
      .join('\n');
  }

  // normalizeSongsListened(arr) now calls dgRunPostHooks('normalizeSongsListened',
  // normalized, source) with its own result array right before returning it.
  // This hook mutates each already-normalized song object in place (it never
  // needs to replace the array itself), so the plain post-hook mechanism is
  // sufficient here even though the wrap used to "transform a return value" --
  // mutation-in-place has the same effect as a real browser sees it, since
  // the caller and the hook share the same array/object references.
  function stampQueueRolesOntoNormalized(normalized, source) {
    (normalized || []).forEach((song, index) => {
      const raw = (source || [])[index] || {};
      const role = roleForSong(raw);
      if (role) {
        stampRole(song, role, Number(raw.identityIndex ?? -1));
        if (role === ROLE_MEDIA) {
          song.mediaTitle = clean(raw.mediaTitle || raw.media || '');
          song.media = song.mediaTitle;
          song.mediaType = clean(raw.mediaType || '').toLowerCase();
        }
      }
      if (raw.__bulkIdentityRoleSpecified) song.__bulkIdentityRoleSpecified = true;
      if (raw.__bulkIdentityRoleIgnored) song.__bulkIdentityRoleIgnored = raw.__bulkIdentityRoleIgnored;
      if (raw._bulkRow) song._bulkRow = raw._bulkRow;
    });
  }

  function normalizeLoose(value = '') {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(feat|featuring|ft)\.?\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function spotifyIdFromSong(song = {}) {
    const explicit = String(song.spotifyId || '').trim().toLowerCase();
    if (explicit) return explicit;
    const url = normalizeUrl(song.spotifyUrl || song.url || '');
    const match = String(url || '').match(/spotify\.com\/track\/([a-z0-9]{10,})/i) ||
      String(url || '').match(/^spotify:track:([a-z0-9]{10,})/i);
    return match ? match[1].toLowerCase() : '';
  }

  function duplicateKey(song = {}) {
    const isrc = String(song.isrc || '').trim().toLowerCase();
    if (isrc) return `isrc:${isrc}`;
    const spotifyId = spotifyIdFromSong(song);
    if (spotifyId) return `spotify:${spotifyId}`;
    const url = normalizeUrl(song.spotifyUrl || song.url || '').trim().toLowerCase();
    if (url && !PLACEHOLDER_URL_RE.test(url)) return `url:${url}`;
    const title = normalizeLoose(song.title || song.name || '');
    const artist = normalizeLoose(song.artist || (Array.isArray(song.artists) ? song.artists.join(' ') : ''));
    if (title) return `meta:${artist}|${title}`;
    return '';
  }

  function flattenParsedSongs(songs) {
    const rows = [];
    (Array.isArray(songs) ? songs : []).forEach(song => {
      rows.push({ song, row: Number(song?._bulkRow || 0), kind: song?.isAdd ? 'ADD' : (song?.isPromote ? 'PROMOTE' : 'SONG') });
      if (song?.levelUp) rows.push({ song: song.levelUp, row: Number(song.levelUp?._bulkRow || 0), kind: 'LEVEL UP' });
    });
    return rows;
  }

  function songLabelForWarning(song = {}) {
    return displaySongLabel(song) || normalizeUrl(song.url || song.spotifyUrl || '') || `row ${song._bulkRow || '?'}`;
  }

  function signatureFor(text = '') {
    const genre = currentGenreValue();
    const input = `${genre?.id || genre?.genre || ''}\n${String(text || '')}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `v258:${(hash >>> 0).toString(16)}`;
  }

  function analyzeSongBlock(text = '') {
    const songs = patchedParseSongLinks(text);
    const flat = flattenParsedSongs(songs);
    const hardErrors = [];
    const warnings = [];
    const duplicateGroups = [];
    const seminals = songs.filter(song => roleForSong(song) === ROLE_SEMINAL);

    if (seminals.length > 1) {
      hardErrors.push(`More than one SEMINAL row is present (${seminals.map(song => `row ${song._bulkRow || '?'}`).join(', ')}). Keep exactly one.`);
    }

    const byKey = new Map();
    flat.forEach(entry => {
      const key = duplicateKey(entry.song);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(entry);
    });
    byKey.forEach(entries => {
      if (entries.length < 2) return;
      duplicateGroups.push({
        rows: entries.map(entry => entry.row).filter(Boolean),
        label: songLabelForWarning(entries[0].song),
        kinds: entries.map(entry => entry.kind),
      });
    });

    duplicateGroups.forEach(group => {
      warnings.push(`Rows ${group.rows.join(', ')}: ${group.label} (${group.kinds.join(' / ')})`);
    });

    flat.forEach(({ song, row }) => {
      if (song.__bulkIdentityRoleIgnored) {
        warnings.push(`Row ${row || '?'}: ${String(song.__bulkIdentityRoleIgnored).toUpperCase()} was placed on a LEVEL UP. Identity roles apply only to parent rows and will be ignored.`);
      }
      if (roleForSong(song) === ROLE_MEDIA) {
        if (!clean(song.mediaTitle || song.media || '')) warnings.push(`Row ${row || '?'}: MEDIA has no media title/context.`);
        if (!clean(song.mediaType || '')) warnings.push(`Row ${row || '?'}: MEDIA has no media type.`);
      }
      const url = normalizeUrl(song.url || song.spotifyUrl || '');
      if (PLACEHOLDER_URL_RE.test(url) && !clean(song.title || song.name || '')) {
        warnings.push(`Row ${row || '?'}: placeholder URL has no parsed song title, so duplicate detection is inconclusive.`);
      }
    });

    return { songs, hardErrors, warnings, duplicateGroups };
  }

  function showToast(message, isError = false) {
    try {
      const fn = getBinding('showSaveToast');
      if (typeof fn === 'function') fn(message, isError);
    } catch (_) {}
  }

  function validateAndApproveCurrentBlock() {
    const textarea = document.getElementById('songsListenedBulk');
    const genre = currentGenreValue();
    if (!textarea || !genre) return true;
    const signature = signatureFor(textarea.value);
    if (approvedSignature === signature) return true;

    const report = analyzeSongBlock(textarea.value);
    if (report.hardErrors.length) {
      window.alert(`Song block cannot be saved yet:\n\n${report.hardErrors.map(item => `• ${item}`).join('\n')}`);
      showToast('Resolve the Seminal role conflict before saving.', true);
      return false;
    }

    if (report.warnings.length) {
      const shown = report.warnings.slice(0, 10);
      const extra = report.warnings.length > shown.length
        ? `\n• …and ${report.warnings.length - shown.length} more warning${report.warnings.length - shown.length === 1 ? '' : 's'}.`
        : '';
      const proceed = window.confirm(
        `Potential song-block issues:\n\n${shown.map(item => `• ${item}`).join('\n')}${extra}\n\nChoose OK to save anyway, or Cancel to return to the editor.`,
      );
      if (!proceed) {
        showToast('Save cancelled so the song block can be reviewed.', false);
        return false;
      }
    }

    approvedSignature = signature;
    return true;
  }

  function hasQueueRoles(songs) {
    return (Array.isArray(songs) ? songs : []).some(song => Boolean(roleForSong(song)));
  }

  function markQueueModeFromTextarea(genre = currentGenreValue()) {
    const textarea = document.getElementById('songsListenedBulk');
    if (!genre || !textarea) return [];
    const parsed = patchedParseSongLinks(textarea.value);
    if (hasQueueRoles(parsed)) {
      genre.identityQueueRolesEnabled = true;
      genre.identityRolesSource = QUEUE_ROLE_MARKER;
    }
    return parsed;
  }

  function applyParsedRoleToModel(modelSong, parsedSong, mediaIndex) {
    if (!modelSong) return;
    clearRoleFields(modelSong);
    const role = roleForSong(parsedSong);
    if (role === ROLE_SEMINAL) {
      stampRole(modelSong, role, -1);
    } else if (role === ROLE_MEDIA) {
      modelSong.mediaTitle = clean(parsedSong.mediaTitle || parsedSong.media || '');
      modelSong.media = modelSong.mediaTitle;
      modelSong.mediaType = clean(parsedSong.mediaType || '').toLowerCase();
      stampRole(modelSong, role, mediaIndex);
    }
    if (modelSong.levelUp) clearRoleFields(modelSong.levelUp);
  }

  function reconcileQueueRolesFromTextarea(genre = currentGenreValue()) {
    const textarea = document.getElementById('songsListenedBulk');
    if (!genre || !textarea || !Array.isArray(genre.songs_listened)) return false;
    const parsed = patchedParseSongLinks(textarea.value);
    const active = Boolean(genre.identityQueueRolesEnabled || genre.identityRolesSource === QUEUE_ROLE_MARKER || hasQueueRoles(parsed));
    if (!active) return false;

    genre.identityQueueRolesEnabled = true;
    genre.identityRolesSource = QUEUE_ROLE_MARKER;
    let mediaIndex = 0;
    genre.songs_listened.forEach((modelSong, index) => {
      const parsedSong = parsed[index] || null;
      const role = roleForSong(parsedSong);
      applyParsedRoleToModel(modelSong, parsedSong, role === ROLE_MEDIA ? mediaIndex : -1);
      if (role === ROLE_MEDIA) mediaIndex += 1;
    });
    return true;
  }

  function mirrorIdentityTrack(song = {}) {
    const copy = { ...song };
    delete copy.levelUp;
    delete copy._bulkRow;
    delete copy.__bulkIdentityRoleSpecified;
    delete copy.__bulkIdentityRoleIgnored;
    copy.spotifyUrl = copy.spotifyUrl || copy.url || '';
    copy.url = copy.url || copy.spotifyUrl || '';
    if (copy.title && !copy.name) copy.name = copy.title;
    return copy;
  }

  function syncIdentityMirrorsFromQueue(genre = currentGenreValue()) {
    if (!genre || !Array.isArray(genre.songs_listened)) return false;
    const active = Boolean(genre.identityQueueRolesEnabled || genre.identityRolesSource === QUEUE_ROLE_MARKER || hasQueueRoles(genre.songs_listened));
    if (!active) return false;

    genre.identityQueueRolesEnabled = true;
    genre.identityRolesSource = QUEUE_ROLE_MARKER;
    if (!genre.identity || typeof genre.identity !== 'object') genre.identity = {};

    const seminal = genre.songs_listened.find(song => roleForSong(song) === ROLE_SEMINAL) || null;
    const media = genre.songs_listened.filter(song => roleForSong(song) === ROLE_MEDIA);

    media.forEach((song, index) => {
      stampRole(song, ROLE_MEDIA, index);
      song.identityLabel = 'Media track';
    });
    if (seminal) stampRole(seminal, ROLE_SEMINAL, -1);

    const seminalMirror = seminal ? mirrorIdentityTrack(seminal) : {};
    const mediaMirrors = media.map(song => mirrorIdentityTrack(song));
    genre.identity.seminalTrack = seminalMirror;
    genre.identity.mediaTouchstones = mediaMirrors;
    genre.seminal_song = { ...seminalMirror };
    genre.media_touchstones = mediaMirrors.map(track => ({ ...track }));
    return true;
  }

  // finalizeListeningUpdatesBeforeSave: real "before + after" work around an
  // unconditional call, so this is a clean pre/post hook pair -- no state
  // hand-off needed since both sides just re-fetch currentGenreValue().
  function registerFinalizeListeningUpdatesHooks() {
    window.dgRegisterPreHook?.('finalizeListeningUpdatesBeforeSave', () => {
      const genre = currentGenreValue();
      markQueueModeFromTextarea(genre);
      reconcileQueueRolesFromTextarea(genre);
      syncIdentityMirrorsFromQueue(genre);
    });
    window.dgRegisterPostHook?.('finalizeListeningUpdatesBeforeSave', () => {
      const genre = currentGenreValue();
      reconcileQueueRolesFromTextarea(genre);
      syncIdentityMirrorsFromQueue(genre);
    });
  }

  // filterNewSongsAlreadyRepresentedByGenreIdentity: a genuine conditional
  // bypass -- when queue roles are active, this replaces the base's identity
  // de-duplication entirely rather than running around it. That's exactly
  // what an override hook is for.
  function registerFilterIdentityDuplicatesOverride() {
    window.dgRegisterOverrideHook?.('filterNewSongsAlreadyRepresentedByGenreIdentity', (resolved, previous, genre) => {
      if (genre?.identityQueueRolesEnabled || genre?.identityRolesSource === QUEUE_ROLE_MARKER || hasQueueRoles(resolved)) {
        return { result: { songs: Array.isArray(resolved) ? resolved : [], skipped: [] } };
      }
      return undefined;
    });
  }

  // The 4 save-path gate functions all share the same shape: validate the
  // pasted song block, and if it fails, abort *before* the base function's
  // own logic runs at all (not just react after it). Each one previously
  // captured "original" and called it conditionally; now each registers an
  // override hook that does the identical gate-then-side-effect, and lets
  // the base function run normally (by returning undefined) once the gate
  // passes.
  function registerSaveGateOverrides() {
    window.dgRegisterOverrideHook?.('applySongsBulkAndSave', () => {
      if (!validateAndApproveCurrentBlock()) return { result: false };
      markQueueModeFromTextarea();
      return undefined;
    });
    window.dgRegisterOverrideHook?.('prepareAndSaveCurrentGenre', () => {
      if (!validateAndApproveCurrentBlock()) return { result: false };
      markQueueModeFromTextarea();
      return undefined;
    });
    window.dgRegisterOverrideHook?.('saveLibraryUpdates', () => {
      if (!validateAndApproveCurrentBlock()) return { result: false };
      markQueueModeFromTextarea();
      return undefined;
    });
    window.dgRegisterOverrideHook?.('doSaveWithPassword', () => {
      if (!validateAndApproveCurrentBlock()) {
        const error = new Error('Save cancelled so duplicate or role warnings can be reviewed.');
        error.code = 'USER_CANCELLED';
        throw error;
      }
      markQueueModeFromTextarea();
      return undefined;
    });
  }

  // doSaveWithPassword's gate used to reset approvedSignature in a `finally`
  // wrapped around the *entire* original call (join-in-flight branch, the
  // real save attempt, success or failure) -- not something an override hook
  // (which only runs before the base logic) can express. The base function
  // now has its own outer try/finally that calls dgRunPostHooks('doSaveWithPassword')
  // once the whole attempt has settled (awaiting the joined promise too, so
  // the timing matches exactly), so this is registered as a post-hook.
  function registerDoSaveWithPasswordSignatureReset() {
    window.dgRegisterPostHook?.('doSaveWithPassword', () => {
      approvedSignature = '';
    });
  }

  function wrapIdentityQueueInjection() {
    const api = window.DailyGenreIdentity;
    if (!api || api.__queueRolesV258Wrapped) return;
    ['ensureIdentityTracksInSongQueue', 'syncIdentityTracksToSongQueue'].forEach(name => {
      const original = typeof api[name] === 'function' ? api[name] : null;
      if (!original) return;
      api[name] = function queueRoleAwareIdentitySync(genre, ...args) {
        if (genre?.identityQueueRolesEnabled || genre?.identityRolesSource === QUEUE_ROLE_MARKER || hasQueueRoles(genre?.songs_listened)) {
          return false;
        }
        return original.call(this, genre, ...args);
      };
    });

    const originalPurge = typeof api.purgeIdentityRowsFromSongQueue === 'function'
      ? api.purgeIdentityRowsFromSongQueue
      : null;
    if (originalPurge) {
      api.purgeIdentityRowsFromSongQueue = function queueRoleAwareIdentityPurge(genre, ...args) {
        const queueMode = Boolean(
          genre?.identityQueueRolesEnabled ||
          genre?.identityRolesSource === QUEUE_ROLE_MARKER ||
          hasQueueRoles(genre?.songs_listened)
        );
        if (queueMode) {
          syncIdentityMirrorsFromQueue(genre);
          return false;
        }
        return originalPurge.call(this, genre, ...args);
      };
    }

    api.__queueRolesV258Wrapped = true;
    api.__queueRolesV260PurgeGuard = true;
  }

  function hideIdentityTrackControl(selector) {
    const element = document.querySelector(selector);
    if (!element) return;
    const wrapper = element.closest('label, fieldset') || element;
    wrapper.style.display = 'none';
    wrapper.dataset.v258HiddenIdentityTrackControl = 'true';
  }

  function simplifyIdentityEditor() {
    const root = document.getElementById('genreIdentityWorkbench');
    if (!root) return;
    root.dataset.v258AliasOnly = 'true';

    const heading = root.querySelector('.genre-identity-editor-head h3');
    if (heading && heading.textContent !== 'Genre aliases') heading.textContent = 'Genre aliases';
    const copy = root.querySelector('.genre-identity-editor-head p');
    if (copy && copy.textContent !== 'Aliases stay here. Seminal and media tracks now come directly from role columns in the song queue.') copy.textContent = 'Aliases stay here. Seminal and media tracks now come directly from role columns in the song queue.';

    const details = root.querySelector('details.genre-identity-import');
    if (details) {
      const summary = details.querySelector('summary');
      if (summary && summary.textContent !== 'Paste alias block') summary.textContent = 'Paste alias block';
      const block = details.querySelector('#genreIdentityBlockImport');
      if (block) block.placeholder = 'GENRE: minimal psytrance\n\nALIASES:\nZenonesque\nMinimal Psy';
      const note = details.querySelector('small');
      if (note && note.textContent !== 'Use this block for GENRE and ALIASES only. Add Seminal and Media roles in the song queue.') note.textContent = 'Use this block for GENRE and ALIASES only. Add Seminal and Media roles in the song queue.';
    }

    [
      '#genreSeminalArtist',
      '#genreSeminalTitle',
      '#genreSeminalUrl',
      '#genreSeminalReason',
      '#genreMediaRows',
      '#genreAddMediaBtn',
    ].forEach(hideIdentityTrackControl);

    root.querySelectorAll('.genre-identity-section-title').forEach(element => {
      element.style.display = 'none';
      element.dataset.v258HiddenIdentityTrackControl = 'true';
    });

    const overwrite = root.querySelector('#genreIdentityOverwriteBtn');
    if (overwrite) overwrite.style.display = 'none';
    const blockOverwrite = root.querySelector('#genreIdentityOverwriteBlockBtn');
    if (blockOverwrite) blockOverwrite.style.display = 'none';
    const apply = root.querySelector('#genreIdentityApplyBtn');
    if (apply && apply.textContent !== 'Save aliases') apply.textContent = 'Save aliases';
    const blockApply = root.querySelector('#genreIdentityApplyBlockBtn');
    if (blockApply && blockApply.textContent !== 'Apply & Save aliases') blockApply.textContent = 'Apply & Save aliases';

    const aliases = root.querySelector('#genreIdentityAliases');
    if (aliases && !root.querySelector('.v258-alias-role-note')) {
      const note = document.createElement('small');
      note.className = 'v258-alias-role-note';
      note.textContent = 'Queue role format: URL | fit | reason | Artist — Title | SEMINAL, or | MEDIA | media title | media type.';
      aliases.closest('label')?.appendChild(note);
    }
  }

  function enhanceSongEditorHelp() {
    const textarea = document.getElementById('songsListenedBulk');
    if (!textarea || document.getElementById('v258SongRoleHelp')) return;
    textarea.placeholder = 'https://open.spotify.com/track/abc | 5 | defining track | Artist — Title | SEMINAL\nhttp://url.com | 5 | media exposure | Artist — Title | MEDIA | Film / TV / game title | film';
    const note = document.createElement('div');
    note.id = 'v258SongRoleHelp';
    note.className = 'small';
    note.style.marginTop = '7px';
    note.style.color = 'var(--muted)';
    note.innerHTML = '<strong>Optional role columns:</strong> <code>| SEMINAL</code> or <code>| MEDIA | media title | media type</code>. Duplicate rows trigger a Save Anyway confirmation.';
    textarea.insertAdjacentElement('afterend', note);
  }

  // parseSongLinks and buildSongsBulkEditorText aren't wraps at all -- there's
  // no "original" being extended, these two fully own the bulk-editor text
  // format (including the SEMINAL/MEDIA role columns) and always have. They
  // stay as direct global installs; the hook registry is for adding behavior
  // around an existing base implementation, and there isn't one here to hook.
  installGlobal('parseSongLinks', patchedParseSongLinks);
  installGlobal('buildSongsBulkEditorText', patchedBuildSongsBulkEditorText);

  window.dgRegisterPostHook?.('normalizeSongsListened', stampQueueRolesOntoNormalized);
  registerFilterIdentityDuplicatesOverride();
  registerFinalizeListeningUpdatesHooks();
  registerSaveGateOverrides();
  registerDoSaveWithPasswordSignatureReset();

  // overwriteSongsBulkAndSave used to need its own reassignment here because
  // it had to call the *patched* applySongsBulkAndSave to pick up the gate.
  // Now that the gate lives inside applySongsBulkAndSave itself (as an
  // override hook), app.js's own window.overwriteSongsBulkAndSave --
  // `(button) => applySongsBulkAndSave(button, { overwriteSongs: true })`
  // -- already calls through correctly, so there's nothing left to install here.

  wrapIdentityQueueInjection();
  simplifyIdentityEditor();
  enhanceSongEditorHelp();

  observer = new MutationObserver(() => {
    wrapIdentityQueueInjection();
    simplifyIdentityEditor();
    enhanceSongEditorHelp();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.DailyGenreQueueRoles = {
    build: BUILD,
    parse: patchedParseSongLinks,
    serialize: patchedBuildSongsBulkEditorText,
    analyze: analyzeSongBlock,
    validate: validateAndApproveCurrentBlock,
    reconcile: reconcileQueueRolesFromTextarea,
    syncIdentity: syncIdentityMirrorsFromQueue,
  };

  window.dailyGenreQueueRoleDiagnostics = function diagnostics() {
    const textarea = document.getElementById('songsListenedBulk');
    const report = analyzeSongBlock(textarea?.value || '');
    const genre = currentGenreValue();
    return {
      build: BUILD,
      installed: true,
      format: 'URL | FIT | REASON | ARTIST — TITLE | ROLE | MEDIA TITLE | MEDIA TYPE',
      queueAuthoritative: Boolean(genre?.identityQueueRolesEnabled || genre?.identityRolesSource === QUEUE_ROLE_MARKER),
      parsedParents: report.songs.length,
      parsedRowsIncludingLevelUps: flattenParsedSongs(report.songs).length,
      seminalRows: report.songs.filter(song => roleForSong(song) === ROLE_SEMINAL).length,
      mediaRows: report.songs.filter(song => roleForSong(song) === ROLE_MEDIA).length,
      duplicateGroups: report.duplicateGroups,
      warnings: report.warnings,
      hardErrors: report.hardErrors,
      aliasOnlyIdentityEditor: Boolean(document.getElementById('genreIdentityWorkbench')?.dataset.v258AliasOnly),
    };
  };

  console.info('[Daily Genre] v258 queue identity roles installed.', window.dailyGenreQueueRoleDiagnostics());
})();
