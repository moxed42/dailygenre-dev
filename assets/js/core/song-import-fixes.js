/* Daily Genre v257 — intentional placeholder URL + bulk-song round-trip fix. */
(function installDailyGenreSongImportHotfix() {
  'use strict';

  const BUILD = 'v257';
  const PLACEHOLDER_URL_RE = /^https?:\/\/(?:www\.)?(?:url\.com|example\.com|example\.org)(?:\/)?$/i;

  function clean(value = '') {
    try {
      if (typeof cleanPastedCitationArtifacts === 'function') {
        return cleanPastedCitationArtifacts(value);
      }
    } catch (_) {}
    return String(value || '').trim();
  }

  function normalizeUrl(value = '') {
    try {
      if (typeof normalizeSongUrl === 'function') return normalizeSongUrl(value);
    } catch (_) {}
    return String(value || '').trim();
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

    // Accept the established Daily Genre paste shape:
    // reason text — Artist — Title
    // The first capture is greedy so earlier em dashes stay inside the reason.
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

  function normalizeLabel(label = '') {
    try {
      if (typeof normalizeSongArtistAndTitle === 'function') {
        return normalizeSongArtistAndTitle(label, '');
      }
    } catch (_) {}
    const value = clean(label);
    const match = value.match(/^(.+?)\s+[—–]\s+(.+)$/);
    return match
      ? { artist: clean(match[1]), title: clean(match[2]), pendingGenreTag: '' }
      : { artist: '', title: value, pendingGenreTag: '' };
  }

  function sourceForUrl(url = '') {
    try {
      if (typeof songUrlSource === 'function') return songUrlSource(url);
    } catch (_) {}
    return url ? 'manual' : 'manual';
  }

  function stampChild(child, parent) {
    try {
      if (typeof stampLevelUpParent === 'function') {
        stampLevelUpParent(child, parent);
        return;
      }
    } catch (_) {}
    child.levelUpParentTitle = String(parent?.title || '');
    child.levelUpParentArtist = String(parent?.artist || '');
    child.levelUpParentUrl = String(parent?.url || '');
  }

  function patchedParseSongLinks(text) {
    const lines = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const songs = [];

    for (const rawLine of lines) {
      const { line, isLevelUp, isAdd, isPromote } = parsePrefix(rawLine);
      const parts = String(line || '').split('|').map(part => clean(part).trim());
      if (!parts.length) continue;

      const first = parts[0] || '';
      let url = extractUrl(first);
      const markdownLabel = extractMarkdownLabel(first);
      let score = null;
      let reason = '';
      let displayLabel = markdownLabel || stripUrlFromLabel(first, url);
      const isScore = value => /^[1-5]$/.test(String(value || '').trim());

      if (parts.length > 1 && isScore(parts[1])) {
        score = parts[1];
        reason = parts[2] || '';
        displayLabel = parts.slice(3).filter(Boolean).join(' | ') || displayLabel;
      } else if (parts.length > 1) {
        reason = parts[1] || '';
        displayLabel = parts.slice(2).filter(Boolean).join(' | ') || displayLabel;
      }

      if (!url) {
        const urlPart = parts.find(part => extractUrl(part));
        if (urlPart) url = extractUrl(urlPart);
      }

      if (!displayLabel && !url && first && !isScore(first)) displayLabel = first;

      // v257: exact placeholder URLs are intentional manual-resolution markers.
      // Keep them in song.url instead of erasing them.
      url = normalizeUrl(url);

      if (!displayLabel) {
        const trailing = splitTrailingArtistTitle(reason);
        reason = trailing.reason;
        displayLabel = trailing.label;
      }

      const reasonTag = extractPendingGenreTag(reason);
      const labelTag = extractPendingGenreTag(displayLabel, { strict: true });
      const pendingGenreTag = reasonTag.tag || labelTag.tag || '';
      const label = normalizeLabel(labelTag.text.trim());

      const song = {
        url,
        score,
        reason: reasonTag.text.trim(),
        title: label.title,
        artist: label.artist,
        source: sourceForUrl(url),
        added: new Date().toISOString().slice(0, 10),
      };

      if (pendingGenreTag || label.pendingGenreTag) {
        song._pendingGenreTag = pendingGenreTag || label.pendingGenreTag;
      }
      if (isAdd) song.isAdd = true;
      if (isPromote) song.isPromote = true;
      if (isLevelUp) song.isLevelUp = true;

      if (!song.url && !song.title && !song.reason) continue;
      if (!isLevelUp && !isAdd && !isPromote && !song.url && !song.title) continue;

      if (isLevelUp && songs.length > 0) {
        stampChild(song, songs[songs.length - 1]);
        songs[songs.length - 1].levelUp = song;
      } else {
        songs.push(song);
      }
    }

    return songs;
  }

  function displaySongLabel(song = {}) {
    const title = clean(song.title || '');
    const artist = clean(song.artist || '');
    return artist && title ? `${artist} — ${title}` : (title || artist || '');
  }

  function serializeSongRow(song = {}, prefix = '') {
    const url = normalizeUrl(song.url || song.spotifyUrl || '');
    const score = song.score == null ? '' : String(song.score);
    const reason = song._pendingGenreTag
      ? `${song.reason || ''} @${song._pendingGenreTag}`.trim()
      : clean(song.reason || '');
    const label = displaySongLabel(song);

    if (!prefix && url && !score && !reason && !label) return url;

    // v257: never filter empty positional columns. A blank URL or score must not
    // shift reason/label into the wrong parser slot on the next save pass.
    return prefix + [url, score, reason, label].join(' | ');
  }

  function patchedBuildSongsBulkEditorText(genre) {
    let list = Array.isArray(genre?.songs_listened) ? genre.songs_listened : [];
    try {
      if (typeof inflateSongsFromStorage === 'function') {
        list = inflateSongsFromStorage(list);
      }
    } catch (_) {}

    return list
      .filter(song => !song?.isPending)
      .flatMap(song => {
        const prefix = song?.isPromote ? '🔼 PROMOTE: ' : (song?.isAdd ? '🔼 ADD: ' : '');
        const rows = [serializeSongRow(song, prefix)];
        if (song?.levelUp) rows.push(serializeSongRow(song.levelUp, '🔼 LEVEL UP: '));
        return rows;
      })
      .join('\n');
  }

  const originalSongIdentity = typeof window.songIdentity === 'function'
    ? window.songIdentity
    : null;

  function patchedSongIdentity(song) {
    let key = '';
    try {
      if (originalSongIdentity) key = String(originalSongIdentity(song) || '');
    } catch (_) {}

    if (key && key !== 'meta:|') return key;

    const url = normalizeUrl(song?.url || song?.spotifyUrl || '').trim().toLowerCase();
    const marker = [
      song?.isLevelUp ? 'level-up' : (song?.isPromote ? 'promote' : (song?.isAdd ? 'add' : 'song')),
      PLACEHOLDER_URL_RE.test(url) ? url : '',
      String(song?.score ?? '').trim(),
      clean(song?.reason || '').toLowerCase().replace(/\s+/g, ' '),
    ].join('|');

    // Stable identity for unresolved placeholder rows. Two truly identical draft
    // rows may still dedupe, but unrelated unresolved songs can no longer collapse.
    return `draft:${marker}`;
  }

  async function patchedConfirmProductionSaveAfterNetworkError(expectedSha) {
    // The Worker can commit several seconds after the browser loses the response.
    // v254 checked for only 2.7 seconds; these checks cover 16.5 seconds.
    for (const delayMs of [1000, 2000, 3000, 4500, 6000]) {
      try {
        if (typeof waitForProductionSaveRecovery === 'function') {
          await waitForProductionSaveRecovery(delayMs);
        } else {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        try { productionSaveRecoveryDiagnostics.recoveryChecks += 1; } catch (_) {}
        const latestSha = await fetchLatestProductionFileSha();
        if (latestSha && latestSha !== expectedSha) return latestSha;
      } catch (error) {
        console.warn('[Daily Genre] Delayed GitHub save verification failed.', error);
      }
    }
    return '';
  }

  function installGlobal(name, fn) {
    try { window[name] = fn; } catch (_) {}
    try {
      // eslint-disable-next-line no-eval
      (0, eval)(`${name} = window[${JSON.stringify(name)}]`);
    } catch (_) {}
  }

  installGlobal('parseSongLinks', patchedParseSongLinks);
  installGlobal('buildSongsBulkEditorText', patchedBuildSongsBulkEditorText);
  installGlobal('songIdentity', patchedSongIdentity);
  installGlobal('confirmProductionSaveAfterNetworkError', patchedConfirmProductionSaveAfterNetworkError);

  window.dailyGenreSongImportHotfixDiagnostics = function diagnostics() {
    return {
      build: BUILD,
      installed: true,
      placeholderPolicy: 'preserve-exact-url',
      fixedPositionSerializer: true,
      trailingArtistTitleParser: true,
      emptyIdentityGuard: true,
      saveRecoveryWindowMs: 16500,
    };
  };

  console.info('[Daily Genre] v257 song import hotfix installed.', window.dailyGenreSongImportHotfixDiagnostics());
})();
