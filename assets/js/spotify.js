    const spotifyOfficialCache = new Map();

    function classifySpotifyMetadataError(message='') {
      const text = String(message || '').toLowerCase();
      if (/rate|too many|429/.test(text)) return 'rate_limited';
      if (/not found|resource|removed|unavailable|invalid|404|provide a valid|does not exist|doesn't exist|cannot find/.test(text)) return 'broken';
      return 'failed';
    }

    function spotifyFailureShouldSkipBulk(failure) {
      if (!failure) return false;
      const code = String(failure.code || '').toLowerCase();
      const text = `${failure.error || ''} ${failure.message || ''}`.toLowerCase();
      return code === 'broken' || /not found|resource|removed|unavailable|invalid|404|does not exist|doesn't exist|cannot find|provide a valid/.test(text);
    }

    function spotifyTrackId(urlOrId='') {
      const raw = String(urlOrId || '').trim();
      const uri = raw.match(/spotify:track:([A-Za-z0-9]{22})/i);
      if (uri) return uri[1];
      const web = raw.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/i);
      if (web) return web[1];
      const bare = raw.match(/^[A-Za-z0-9]{22}$/);
      return bare ? bare[0] : '';
    }

    function spotifyCanonicalTrackUrl(urlOrId='') {
      const id = spotifyTrackId(normalizeSongUrl(urlOrId || '') || urlOrId);
      return id ? `https://open.spotify.com/track/${id}` : (normalizeSongUrl(urlOrId || '') || String(urlOrId || '').trim());
    }

    async function fetchSpotifyTrackResult(urlOrId, force=false) {
      const trackRef = String(urlOrId || '').trim();
      if (!trackRef) return { ok:false, code:'broken', error:'No Spotify track URL saved.' };
      const cacheKey = spotifyCanonicalTrackUrl(trackRef);
      if (!force && spotifyOfficialCache.has(cacheKey)) return spotifyOfficialCache.get(cacheKey);

      const request = fetch(`${WORKER_URL}spotify/track?url=${encodeURIComponent(cacheKey)}`, { cache: 'no-store' })
        .then(async response => {
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload.ok && payload.track) return { ok:true, track:payload.track };
          const error = payload.error || `Spotify lookup failed (${response.status}).`;
          if (response.status === 429 || payload.code === 'RATE_LIMITED') {
            return {
              ok:false,
              code:'rate_limited',
              error,
              retryAfterSeconds: Math.max(1, Number(payload.retryAfterSeconds || 30))
            };
          }
          return { ok:false, code:classifySpotifyMetadataError(error), error };
        })
        .catch(() => ({ ok:false, code:'failed', error:'Could not reach Spotify metadata service.' }));

      if (!force) spotifyOfficialCache.set(cacheKey, request);
      return request;
    }

    async function fetchSpotifyTrackMetadata(urlOrId, force=false) {
      const result = await fetchSpotifyTrackResult(urlOrId, force);
      return result.ok ? result.track : null;
    }

    function applyOfficialSpotifyMetadata(song, track) {
      if (!song || !track) return song;
      song.spotifyId = track.spotifyId || song.spotifyId || '';
      song.spotifyUrl = track.spotifyUrl || song.spotifyUrl || '';
      song.title = track.title || song.title || '';
      song.artist = track.artist || song.artist || '';
      song.artists = Array.isArray(track.artists) ? track.artists.filter(Boolean) : (song.artists || []);
      song.album = track.album || song.album || '';
      song.artwork = track.artwork || song.artwork || '';
      song.albumArt = track.artwork || song.albumArt || song.artwork || '';
      song.releaseDate = track.releaseDate || song.releaseDate || '';
      song.releaseYear = track.releaseYear || song.releaseYear || null;
      song.releasePrecision = track.releasePrecision || song.releasePrecision || '';
      song.releaseSource = 'Spotify';
      song.durationMs = Number(track.durationMs || 0) || song.durationMs || null;
      if (track.explicit != null) song.explicit = !!track.explicit;
      if (track.popularity != null) song.popularity = Number(track.popularity);
      if (track.trackNumber != null) song.trackNumber = Number(track.trackNumber);
      if (track.discNumber != null) song.discNumber = Number(track.discNumber);
      if (track.albumType) song.albumType = track.albumType;
      if (track.albumTotalTracks != null) song.albumTotalTracks = Number(track.albumTotalTracks);
      song.isrc = track.isrc || song.isrc || '';
      song.spotifyMetadataFetched = true;
      song.spotifyMetadataFetchedAt = new Date().toISOString();
      return song;
    }

    const spotifyOembedCache = new Map();

    async function fetchSpotifyOembed(url, force=false) {
      const trackUrl = (typeof spotifyCanonicalTrackUrl === 'function') ? spotifyCanonicalTrackUrl(url || '') : normalizeSongUrl(url || '');
      if (!/https?:\/\/open\.spotify\.com\/track\//i.test(trackUrl)) return null;
      if (!force && spotifyOembedCache.has(trackUrl)) return spotifyOembedCache.get(trackUrl);

      const request = fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`, { cache: 'no-store' })
        .then(async response => {
          if (!response.ok) throw new Error(`Spotify oEmbed failed (${response.status})`);
          return response.json();
        })
        .catch(() => null);

      spotifyOembedCache.set(trackUrl, request);
      return request;
    }

    const releaseMetadataCache = new Map();

    function cleanCatalogText(value='') {
      return String(value || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(remaster(?:ed)?|version|edit|single|radio|mono|stereo)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function catalogTrackQueryTitle(song) {
      const raw = String(song?.title || '').trim();
      const parts = raw.split(/\s+[—–]\s+/);
      if (parts.length > 1 && song?.artist && cleanCatalogText(parts[0]).includes(cleanCatalogText(song.artist))) {
        return parts.slice(1).join(' ');
      }
      return raw;
    }

    async function fetchSongReleaseMetadata(song) {
      if (!song || song.releaseYear || !song.artist || !song.title) return null;
      const track = catalogTrackQueryTitle(song);
      const cacheKey = `${cleanCatalogText(song.artist)}|${cleanCatalogText(track)}`;
      if (!cacheKey || cacheKey === '|') return null;
      if (releaseMetadataCache.has(cacheKey)) return releaseMetadataCache.get(cacheKey);

      const lookup = fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=12&term=${encodeURIComponent(`${song.artist} ${track}`)}`)
        .then(async response => {
          if (!response.ok) throw new Error('Catalog lookup failed');
          const payload = await response.json();
          const wantedArtist = cleanCatalogText(song.artist);
          const wantedTrack = cleanCatalogText(track);
          const candidates = Array.isArray(payload.results) ? payload.results : [];
          const scored = candidates.map(item => {
            const itemArtist = cleanCatalogText(item.artistName);
            const itemTrack = cleanCatalogText(item.trackName);
            let score = 0;
            if (itemTrack === wantedTrack) score += 6;
            else if (itemTrack.includes(wantedTrack) || wantedTrack.includes(itemTrack)) score += 3;
            if (itemArtist === wantedArtist) score += 5;
            else if (itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist)) score += 2;
            return { item, score };
          }).sort((a, b) => b.score - a.score);
          const best = scored[0];
          if (!best || best.score < 5 || !best.item.releaseDate) return null;
          const year = Number(String(best.item.releaseDate).slice(0, 4));
          if (!Number.isInteger(year)) return null;
          return { releaseDate: best.item.releaseDate, releaseYear: year, releaseSource: 'catalog match' };
        })
        .catch(() => null);

      releaseMetadataCache.set(cacheKey, lookup);
      return lookup;
    }

    async function enrichSongReleaseMetadata(song) {
      if (!song || song.releaseYear) return song;
      const data = await fetchSongReleaseMetadata(song);
      if (data) {
        song.releaseDate = data.releaseDate || song.releaseDate || '';
        song.releaseYear = data.releaseYear || song.releaseYear || null;
        song.releaseSource = data.releaseSource || song.releaseSource || '';
      }
      return song;
    }

    function applySpotifyMetadata(song, data) {
      if (!song || !data) return song;
      const raw = data.title || '';
      const clean = raw.split(/[·\u2013\u2014]/)[0].trim() || raw;
      if (clean && !song.title) song.title = clean;
      if (data.author_name && !song.artist) song.artist = data.author_name;
      if (data.thumbnail_url) song.artwork = data.thumbnail_url;
      return song;
    }

    async function hydrateGenreSpotifyArtwork(genre) {
      if (!genre) return false;
      let changed = false;

      const priorSongs = JSON.stringify(genre.songs_listened || []);
      const enrichedSongs = await resolveSpotifyTitles(inflateSongsFromStorage(genre.songs_listened || []));
      if (JSON.stringify(enrichedSongs) !== priorSongs) {
        genre.songs_listened = enrichedSongs;
        changed = true;
      }

      const priorPending = JSON.stringify(genre.pending_songs || []);
      const enrichedPending = await resolveSpotifyTitles(normalizePendingSongs(genre.pending_songs || []));
      if (JSON.stringify(enrichedPending) !== priorPending) {
        genre.pending_songs = enrichedPending;
        changed = true;
      }

      if (genre.favoritesongurl && genre.favoritesongurl.includes('spotify.com/track/')) {
        const beforeFavorite = JSON.stringify([genre.favoritesong || '', genre.favoriteartist || '', genre.favoritesongartwork || '']);
        const official = await fetchSpotifyTrackMetadata(genre.favoritesongurl);
        if (official) {
          genre.favoritesong = official.title || genre.favoritesong || '';
          genre.favoriteartist = official.artist || genre.favoriteartist || '';
          genre.favoritesongartwork = official.artwork || genre.favoritesongartwork || '';
        } else {
          const fallback = await fetchSpotifyOembed(genre.favoritesongurl);
          if (fallback) {
            if (!genre.favoritesong && fallback.title) genre.favoritesong = fallback.title.split(/[·\u2013\u2014]/)[0].trim() || fallback.title;
            if (fallback.author_name && !genre.favoriteartist) genre.favoriteartist = fallback.author_name;
            if (fallback.thumbnail_url) genre.favoritesongartwork = fallback.thumbnail_url;
          }
        }
        if (JSON.stringify([genre.favoritesong || '', genre.favoriteartist || '', genre.favoritesongartwork || '']) !== beforeFavorite) changed = true;
      }

      return changed;
    }

    // SPOTIFY INTEGRATION
const SPOTIFY_CLIENT_ID = 'aa1010957e674237abf9a3508382174b';
const SPOTIFY_REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public'
].join(' ');

let spotifySession = null;
let spotifyPollingInterval = null;
let spotifyNowPlayingInterval = null;

let spotifyPkceVerifierMemory = null;
let spotifyAuthStateMemory = null;

function spotifyTempStorageKey(key) {
  if (key === 'spotify-pkce-verifier') return 'spotify_pkce_verifier';
  if (key === 'spotify-auth-state') return 'spotify_auth_state';
  return key;
}

function setSpotifyTempValue(key, value) {
  const storageKey = spotifyTempStorageKey(key);
  if (key === 'spotify-pkce-verifier') spotifyPkceVerifierMemory = value;
  if (key === 'spotify-auth-state') spotifyAuthStateMemory = value;
  try { localStorage.setItem(storageKey, value); } catch {}
  try { sessionStorage.setItem(storageKey, value); } catch {}
  try { sessionStorage.setItem(key, value); } catch {}
}

function getSpotifyTempValue(key) {
  const storageKey = spotifyTempStorageKey(key);
  try {
    const value = localStorage.getItem(storageKey);
    if (value) return value;
  } catch {}
  try {
    const value = sessionStorage.getItem(storageKey);
    if (value) return value;
  } catch {}
  try {
    const value = sessionStorage.getItem(key);
    if (value) return value;
  } catch {}
  if (key === 'spotify-pkce-verifier') return spotifyPkceVerifierMemory;
  if (key === 'spotify-auth-state') return spotifyAuthStateMemory;
  return null;
}

function clearSpotifyTempValue(key) {
  const storageKey = spotifyTempStorageKey(key);
  if (key === 'spotify-pkce-verifier') spotifyPkceVerifierMemory = null;
  if (key === 'spotify-auth-state') spotifyAuthStateMemory = null;
  try { localStorage.removeItem(storageKey); } catch {}
  try { sessionStorage.removeItem(storageKey); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

function spotifyBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateSpotifyCodeVerifier() {
  if (!window.crypto?.getRandomValues) {
    throw new Error('Spotify auth requires browser crypto support. Use the HTTPS GitHub Pages URL or localhost.');
  }
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return spotifyBase64Url(arr);
}

function generateSpotifyAuthState() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  if (!window.crypto?.getRandomValues) return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return spotifyBase64Url(arr);
}

async function generateSpotifyCodeChallenge(v) {
  if (!window.crypto?.subtle?.digest) {
    throw new Error('Spotify auth requires a secure browser context for PKCE. Open the deployed HTTPS page or localhost, not a plain file preview.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return spotifyBase64Url(new Uint8Array(digest));
}


function spotifySafeTopUrl() {
  try {
    if (window.top && window.top.location && window.top.location.href) {
      return new URL(window.top.location.href);
    }
  } catch {}
  return new URL(window.location.href);
}

function spotifyActiveScreenName() {
  return document.querySelector('.screen.active')?.id?.replace('screen-', '') || 'spin';
}

function spotifyBuildReturnState(options = {}) {
  const activeScreen = spotifyActiveScreenName();
  const activeGenreId = currentGenre?.id != null ? String(currentGenre.id) : '';
  const hash = activeScreen === 'listen' && activeGenreId
    ? `#genre=${encodeURIComponent(activeGenreId)}`
    : (window.location.hash || '');
  return {
    screen: options.returnScreen || activeScreen,
    hash,
    genreId: activeGenreId,
    reopenPlaylistGenreId: options.reopenPlaylistGenreId ? String(options.reopenPlaylistGenreId) : '',
    reopenPlaylistGenreIds: Array.isArray(options.reopenPlaylistGenreIds) ? options.reopenPlaylistGenreIds.map(String) : [],
    ts: Date.now()
  };
}

function spotifyRememberReturnState(options = {}) {
  const state = spotifyBuildReturnState(options);
  const raw = JSON.stringify(state);
  try { sessionStorage.setItem(SPOTIFY_RETURN_STORAGE_KEY, raw); } catch {}
  try { localStorage.setItem(SPOTIFY_RETURN_STORAGE_KEY, raw); } catch {}
  return state;
}

function spotifyReadReturnState() {
  let raw = '';
  try { raw = sessionStorage.getItem(SPOTIFY_RETURN_STORAGE_KEY) || ''; } catch {}
  if (!raw) {
    try { raw = localStorage.getItem(SPOTIFY_RETURN_STORAGE_KEY) || ''; } catch {}
  }
  if (!raw) return null;
  try {
    const state = JSON.parse(raw);
    if (!state || Date.now() - Number(state.ts || 0) > 30 * 60 * 1000) return null;
    return state;
  } catch {
    return null;
  }
}

function spotifyClearReturnState() {
  const keys = [SPOTIFY_RETURN_STORAGE_KEY].concat(typeof SPOTIFY_OLD_RETURN_STORAGE_KEYS !== 'undefined' ? SPOTIFY_OLD_RETURN_STORAGE_KEYS : []);
  keys.forEach(key => {
    try { sessionStorage.removeItem(key); } catch {}
    try { localStorage.removeItem(key); } catch {}
  });
}

function spotifyCleanCallbackUrl(returnState = null) {
  const cleanPath = `${SPOTIFY_REDIRECT_URI}${returnState?.hash || ''}`;
  try {
    if (window.top && window.top.history && window.top.location) {
      window.top.history.replaceState({}, '', cleanPath);
      return;
    }
  } catch {}
  try { window.history.replaceState({}, '', cleanPath); } catch {}
}

function spotifyNavigateToAuth(url) {
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {}
  window.location.href = url;
}

async function spotifyConnect(options = {}) {
  try {
    const currentUrl = spotifySafeTopUrl();
    if (currentUrl.searchParams.has('code') || currentUrl.searchParams.has('error')) {
      showSaveToast('Spotify is finishing authorization. Try again after the page settles.', true);
      return;
    }

    const now = Date.now();
    const lastStarted = Number(spotifyStorageGet(SPOTIFY_AUTH_START_STORAGE_KEY) || 0);
    if (lastStarted && now - lastStarted < SPOTIFY_AUTH_COOLDOWN_MS) {
      showSaveToast('Spotify authorization already opened. Finish that Spotify window first.', true);
      return;
    }
    spotifyStorageSet(SPOTIFY_AUTH_START_STORAGE_KEY, String(now));

    // Do not auto-reopen playlist modals after OAuth. If a scope upgrade fails or
    // Spotify returns without usable playlist permissions, auto-reopening the modal can
    // immediately launch another auth redirect and trap the browser in a loop.
    const returnOptions = options.autoReopenPlaylist ? options : {
      ...options,
      reopenPlaylistGenreId: '',
      reopenPlaylistGenreIds: []
    };
    spotifyRememberReturnState(returnOptions);
    const verifier = generateSpotifyCodeVerifier();
    const challenge = await generateSpotifyCodeChallenge(verifier);
    const state = generateSpotifyAuthState();

    setSpotifyTempValue('spotify-pkce-verifier', verifier);
    setSpotifyTempValue('spotify-auth-state', state);

    const p = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SPOTIFY_SCOPES,
      state,
      show_dialog: options.force ? 'true' : 'false'
    });

    spotifyNavigateToAuth(`https://accounts.spotify.com/authorize?${p.toString()}`);
  } catch (err) {
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
    console.error('Spotify auth start failed', err);
    showSaveToast('Spotify auth could not start. Check browser storage/privacy settings.', true);
  }
}

async function spotifyHandleCallback() {
  const url = spotifySafeTopUrl();
  const returnState = spotifyReadReturnState();
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error) {
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
    spotifyCleanCallbackUrl(returnState);
    clearSpotifyTempValue('spotify-pkce-verifier');
    clearSpotifyTempValue('spotify-auth-state');
    spotifyClearReturnState();
    spotifyReturnStateAfterCallback = null;
    showSaveToast(`Spotify auth failed: ${error}`, true);
    return;
  }

  if (!code) return;

  const verifier = getSpotifyTempValue('spotify-pkce-verifier');
  const expectedState = getSpotifyTempValue('spotify-auth-state');

  spotifyCleanCallbackUrl(returnState);

  if (!verifier) {
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
    clearSpotifyTempValue('spotify-auth-state');
    spotifyClearReturnState();
    spotifyReturnStateAfterCallback = null;
    showSaveToast('Spotify auth failed: missing PKCE verifier. Reconnect Spotify once from this page.', true);
    return;
  }

  if (expectedState && state !== expectedState) {
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
    clearSpotifyTempValue('spotify-pkce-verifier');
    clearSpotifyTempValue('spotify-auth-state');
    spotifyClearReturnState();
    spotifyReturnStateAfterCallback = null;
    showSaveToast('Spotify auth failed: state mismatch. Reconnect Spotify once from this page.', true);
    return;
  }

  clearSpotifyTempValue('spotify-pkce-verifier');
  clearSpotifyTempValue('spotify-auth-state');
  showSaveToast('Connecting to Spotify…', false);

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_verifier: verifier
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description || data.error || `Token exchange failed (HTTP ${res.status})`);
    }

    await spotifySetSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      // Spotify auth-code responses can omit scope in some browser/client flows.
      // We just requested the full Daily Genre scope set, so store that fallback to
      // avoid treating the successful callback as still missing playlist scopes.
      scope: data.scope || SPOTIFY_SCOPES
    });
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);

    spotifyReturnStateAfterCallback = returnState || null;
    showSaveToast(`Spotify connected as ${spotifySession.displayName || 'you'}!`, false);
    updateSpotifyUI();
    spotifyStartPolling();
  } catch (err) {
    spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
    console.error('Spotify callback failed', err);
    spotifyReturnStateAfterCallback = null;
    spotifyClearReturnState();
    clearSpotifyTempValue('spotify-pkce-verifier');
    clearSpotifyTempValue('spotify-auth-state');
    showSaveToast(`Spotify connection failed: ${err.message}. Reconnect Spotify once from this page.`, true);
  }
}

const SPOTIFY_SESSION_STORAGE_KEY = 'dailygenre.spotifySession.v1';

function loadSpotifySession() {
  const raw = spotifyStorageGet(SPOTIFY_SESSION_STORAGE_KEY);
  if (!raw) {
    spotifySession = null;
    updateSpotifyUI();
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.access_token) throw new Error('missing token');
    spotifySession = parsed;
  } catch (err) {
    console.warn('Stored Spotify session could not be read; clearing it.', err);
    spotifySession = null;
    spotifyStorageRemove(SPOTIFY_SESSION_STORAGE_KEY);
  }

  updateSpotifyUI();
  return spotifySession;
}

async function spotifySetSession(tokenPayload) {
  const expiresIn = Number(tokenPayload?.expires_in || 3600);
  const nextSession = {
    ...(spotifySession || {}),
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token || spotifySession?.refresh_token || '',
    token_type: tokenPayload.token_type || 'Bearer',
    scope: String(tokenPayload.scope || spotifySession?.scope || SPOTIFY_SCOPES).trim(),
    expires_at: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    connected_at: spotifySession?.connected_at || new Date().toISOString()
  };

  spotifySession = nextSession;

  try {
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${nextSession.access_token}` }
    });
    if (profileRes.ok) {
      const profile = await profileRes.json().catch(() => ({}));
      nextSession.displayName = profile.display_name || profile.id || nextSession.displayName || '';
      nextSession.userId = profile.id || nextSession.userId || '';
    }
  } catch (err) {
    console.warn('Spotify profile lookup failed after auth.', err);
  }

  spotifyStorageSet(SPOTIFY_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
  updateSpotifyUI();
  return nextSession;
}

function spotifyDisconnect() {
  const activeScreen = spotifyActiveScreenName();
  const activeGenreId = currentGenre?.id != null ? String(currentGenre.id) : '';
  spotifySession = null;
  spotifyStorageRemove(SPOTIFY_SESSION_STORAGE_KEY);
  spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
  if (spotifyPollingInterval) clearInterval(spotifyPollingInterval);
  if (spotifyNowPlayingInterval) clearInterval(spotifyNowPlayingInterval);
  spotifyPollingInterval = null;
  spotifyNowPlayingInterval = null;
  const nowPlaying = document.getElementById('spotifyNowPlaying');
  if (nowPlaying) {
    nowPlaying.innerHTML = '';
    nowPlaying.style.display = 'none';
  }
  stickyPlayerClose();
  updateSpotifyUI();
  if (activeScreen === 'listen' && activeGenreId) {
    try { history.replaceState(null, '', '#genre=' + encodeURIComponent(activeGenreId)); } catch {}
    switchScreen('listen', { force: true, preserveScroll: true });
  }
  showSaveToast('Spotify disconnected.', false);
}

async function spotifyRefreshSession() {
  loadSpotifySession();
  if (!spotifySession?.refresh_token) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: spotifySession.refresh_token
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.warn('Spotify token refresh failed.', data);
    spotifyDisconnect();
    showSaveToast('Spotify session expired. Connect Spotify again.', true);
    return null;
  }

  return spotifySetSession(data);
}

async function spotifyGetAccessToken() {
  loadSpotifySession();
  if (!spotifySession?.access_token) return null;
  if (Number(spotifySession.expires_at || 0) <= Date.now() + 60000) {
    const refreshed = await spotifyRefreshSession();
    if (!refreshed?.access_token) return null;
  }
  return spotifySession.access_token;
}

async function spotifyApiFetch(path, options={}) {
  const token = await spotifyGetAccessToken();
  if (!token) throw new Error('Spotify is not connected.');

  const url = String(path).startsWith('http') ? path : `https://api.spotify.com/v1/${String(path).replace(/^\/+/, '')}`;
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const refreshed = await spotifyRefreshSession();
    if (refreshed?.access_token) {
      headers.set('Authorization', `Bearer ${refreshed.access_token}`);
      return fetch(url, { ...options, headers });
    }
  }
  return res;
}


function spotifyTrackId(urlOrId='') {
  const raw = String(urlOrId || '').trim();
  if (!raw) return '';
  const direct = raw.match(/^[A-Za-z0-9]{22}$/);
  if (direct) return raw;
  const match = raw.match(/(?:spotify:track:|open\.spotify\.com\/track\/)([A-Za-z0-9]{22})/i);
  return match ? match[1] : '';
}

function spotifyTrackUri(urlOrId='') {
  const id = spotifyTrackId(urlOrId);
  return id ? `spotify:track:${id}` : '';
}

function spPlayBtn(song={}) {
  const url = song.spotifyUrl || song.url || '';
  const id = spotifyTrackId(url);
  if (!spotifySession?.access_token || !id) return '';
  const title = encodeURIComponent(song.title || 'Spotify track');
  const artist = encodeURIComponent(song.artist || songArtistLine(song) || '');
  const artwork = encodeURIComponent(song.artwork || '');
  const rawUrl = encodeURIComponent(url);
  return `<button type="button" class="sp-play-btn" title="Open in mini player" aria-label="Open in Spotify mini player" onclick="event.preventDefault(); event.stopPropagation(); stickyPlayerOpen('${rawUrl}', '${title}', '${artist}', '${artwork}')">▶</button>`;
}

function stickyPlayerOpen(encodedUrl='', encodedTitle='', encodedArtist='', encodedArtwork='') {
  if (!spotifySession?.access_token) {
    showSaveToast('Connect Spotify first to use the mini player.', true);
    return;
  }
  const rawUrl = decodeURIComponent(encodedUrl || '');
  const trackId = spotifyTrackId(rawUrl);
  if (!trackId) {
    showSaveToast('That song does not have a valid Spotify track URL.', true);
    return;
  }
  const title = decodeURIComponent(encodedTitle || '') || 'Spotify track';
  const artist = decodeURIComponent(encodedArtist || '') || '';
  const artwork = decodeURIComponent(encodedArtwork || '') || '';

  const player = document.getElementById('spotifyStickyPlayer');
  const art = document.getElementById('spotifyStickyArt');
  const titleEl = document.getElementById('spotifyStickyTitle');
  const artistEl = document.getElementById('spotifyStickyArtist');
  const embed = document.getElementById('spotifyStickyEmbed');
  if (!player || !embed) return;

  if (art) {
    art.src = artwork || '';
    art.style.visibility = artwork ? 'visible' : 'hidden';
  }
  if (titleEl) titleEl.textContent = title;
  if (artistEl) artistEl.textContent = artist;
  embed.innerHTML = `<iframe title="Spotify Embed: ${escapeHtml(title)}" src="https://open.spotify.com/embed/track/${encodeURIComponent(trackId)}?utm_source=generator&theme=0" width="100%" height="80" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
  player.classList.add('open');
  player.removeAttribute('aria-hidden');
  document.body.classList.add('spotify-player-open');
}

function stickyPlayerClose() {
  const player = document.getElementById('spotifyStickyPlayer');
  const embed = document.getElementById('spotifyStickyEmbed');
  if (embed) embed.innerHTML = '';
  if (player) {
    player.classList.remove('open');
    player.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('spotify-player-open');
}


try {
  document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('spotifyStickyPlayer');
    if (player && !player.classList.contains('open')) player.setAttribute('aria-hidden', 'true');
  }, { once: true });
} catch (_) {}

let spotifyPlaylistContext = null;
let spotifyPlaylistCache = [];
let spotifyReturnStateAfterCallback = null;
let archivePlaylistSelectedGenreIds = new Set();

const SPOTIFY_RETURN_STORAGE_KEY = 'dailygenre.spotifyReturn.v4';
const SPOTIFY_OLD_RETURN_STORAGE_KEYS = ['dailygenre.spotifyReturn.v1', 'dailygenre.spotifyReturn.v2', 'dailygenre.spotifyReturn.v3'];
const SPOTIFY_AUTH_START_STORAGE_KEY = 'dailygenre.spotifyAuthStart.v1';
const SPOTIFY_AUTH_COOLDOWN_MS = 2500;

const SPOTIFY_PLAYLIST_REQUIRED_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public'
];

function spotifySessionScopeSet() {
  return new Set(String(spotifySession?.scope || '').split(/\s+/).map(s => s.trim()).filter(Boolean));
}

function spotifyMissingScopes(required = SPOTIFY_PLAYLIST_REQUIRED_SCOPES) {
  const scopes = spotifySessionScopeSet();
  return required.filter(scope => !scopes.has(scope));
}

async function spotifyEnsurePlaylistScopes(returnOptions = {}) {
  loadSpotifySession();
  if (!spotifySession?.access_token) {
    showSaveToast('Connect Spotify first, then add songs to a playlist.', true);
    await spotifyConnect({ force: true, ...returnOptions, reopenPlaylistGenreId: '', reopenPlaylistGenreIds: [] });
    return false;
  }

  // Do not preflight playlist scopes using the stored token's `scope` string.
  // Some successful Spotify callbacks/refreshes omit or preserve stale scope text,
  // which made Daily Genre think permissions were still missing and relaunch OAuth.
  // The real source of truth is the playlist API response; if Spotify returns 403,
  // we show a recoverable message instead of starting another redirect automatically.
  return true;
}

function spotifyPlaylistIsWritable(playlist) {
  if (!playlist) return false;
  const ownerId = String(playlist.owner?.id || '');
  const userId = String(spotifySession?.userId || '');
  return !!playlist.id && (playlist.collaborative || (ownerId && userId && ownerId === userId));
}

async function spotifyEnsureProfileUserId() {
  if (spotifySession?.userId) return spotifySession.userId;
  const meRes = await spotifyApiFetch('me');
  const me = await meRes.json().catch(() => ({}));
  if (!meRes.ok || !me.id) throw new Error(spotifyPlaylistApiError(me, meRes, 'read Spotify profile'));
  spotifySession.userId = me.id;
  spotifySession.displayName = me.display_name || me.id || spotifySession.displayName || '';
  spotifyStorageSet(SPOTIFY_SESSION_STORAGE_KEY, JSON.stringify(spotifySession));
  updateSpotifyUI();
  return spotifySession.userId;
}

function spotifyPlaylistApiError(data, res, action='complete that Spotify playlist action') {
  const status = Number(res?.status || 0);
  const rawMessage = data?.error?.message || data?.error_description || data?.message || '';
  const rawReason = data?.error?.reason || data?.reason || '';
  const detail = [rawMessage, rawReason].filter(Boolean).join(' / ');
  const base = detail || `Could not ${action}${status ? ` (HTTP ${status})` : ''}.`;

  if (status === 403) {
    if (/insufficient.*scope|scope/i.test(base)) {
      return `Spotify said Forbidden: ${base}. Reconnect Spotify and approve playlist permissions: playlist-modify-public and playlist-modify-private.`;
    }
    if (/developer dashboard|development mode|not registered|user.*not.*registered|quota/i.test(base)) {
      return `Spotify said Forbidden: ${base}. This usually means the Spotify app is still in Development Mode and this Spotify account is not added under the app's Users and Access list.`;
    }
    return `Spotify said Forbidden: ${base}. Use a playlist you own/collaborate on, or check Spotify app User Management if this app is still in Development Mode.`;
  }

  return base;
}

function spotifyPlaylistSongLooksLike(song, pattern) {
  const text = [song?.url, song?.spotifyUrl, song?.title, song?.artist, song?.reason, song?.sourceLabel, song?.type, song?.kind]
    .map(value => String(value || ''))
    .join(' ');
  return pattern.test(text);
}

function spotifyPlaylistCleanTitle(song, fallback='Track') {
  return String(song?.title || fallback)
    .replace(/^(?:🔼\s*)?(?:LEVEL\s*UP|ADD|PROMOTE)\s*:\s*/i, '')
    .trim() || fallback;
}

function spotifyPlaylistSongType(song, type='direct', parent=null) {
  if (type === 'add' || song?.isAdd || spotifyPlaylistSongLooksLike(song, /(?:^|\s)(?:🔼\s*)?ADD\s*:/i)) return 'add';
  if (parent || type === 'levelUp' || song?.isLevelUp || song?.levelUpFor || spotifyPlaylistSongLooksLike(song, /(?:^|\s)(?:🔼\s*)?LEVEL\s*UP\s*:/i)) return 'levelUp';
  return 'direct';
}

function spotifyPlaylistRelatedSongGroups(song) {
  const groups = [];
  const addOne = (type, value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(item => addOne(type, item));
    else if (typeof value === 'object') groups.push({ type, song: value });
  };
  addOne('levelUp', song?.levelUp);
  addOne('levelUp', song?.level_up);
  addOne('levelUp', song?.levelUps);
  addOne('levelUp', song?.level_ups);
  addOne('levelUp', song?.altTake);
  addOne('levelUp', song?.altTakes);
  addOne('add', song?.add);
  addOne('add', song?.adds);
  addOne('add', song?.addSongs);
  addOne('add', song?.add_songs);
  return groups;
}

function spotifyPlaylistSongRows(genre) {
  if (!genre) return [];
  const songs = inflateSongsFromStorage(genre.songs_listened || []);
  const rows = [];
  const seenObject = new WeakSet();

  const visit = (song, type='direct', parent=null) => {
    if (!song || song.isPending || typeof song !== 'object') return;
    if (seenObject.has(song)) return;
    seenObject.add(song);
    const rowType = spotifyPlaylistSongType(song, type, parent);
    const rawUrl = song.spotifyUrl || song.url || (song.spotifyId ? `https://open.spotify.com/track/${song.spotifyId}` : '');
    const url = normalizeSongUrl(rawUrl);
    const id = spotifyTrackId(url) || spotifyTrackId(song.spotifyId || '');

    if (id) {
      rows.push({
        id,
        uri: `spotify:track:${id}`,
        url: url || `https://open.spotify.com/track/${id}`,
        title: spotifyPlaylistCleanTitle(song, 'Spotify track'),
        artist: song.artist || songArtistLine(song) || '',
        artwork: song.artwork || '',
        score: song.score,
        type: rowType,
        sourceLabel: rowType === 'levelUp' ? 'Level Up' : (rowType === 'add' ? 'Add' : 'Direct'),
        parentTitle: parent ? songDisplayName(parent) : '',
        parentType: parent ? spotifyPlaylistSongType(parent) : '',
        parentGenreName: genre.genre || 'Unknown genre',
        genreId: genre.id != null ? String(genre.id) : '',
        genreName: genre.genre || 'Unknown genre',
        date: dateValue(genre) || '',
        platform: 'spotify'
      });
    }

    spotifyPlaylistRelatedSongGroups(song).forEach(group => visit(group.song, group.type, song));
  };

  songs.forEach(song => visit(song, spotifyPlaylistSongType(song), null));
  return rows;
}

function spotifyPlaylistSongRowsForGenres(genreList = []) {
  const rows = [];
  genreList.filter(Boolean).forEach(genre => {
    spotifyPlaylistSongRows(genre).forEach(row => rows.push(row));
  });
  return rows;
}

function spotifyPlaylistCounts(rows = []) {
  return rows.reduce((counts, row) => {
    if (row.type === 'levelUp') counts.levelUp += 1;
    else if (row.type === 'add') counts.add += 1;
    else counts.direct += 1;
    counts.total += 1;
    return counts;
  }, { total:0, direct:0, levelUp:0, add:0 });
}

function spotifyPlaylistCountsText(rows = []) {
  const counts = spotifyPlaylistCounts(rows);
  if (!counts.total) return 'No Spotify tracks';
  return [
    `${counts.direct} direct`,
    `${counts.levelUp} Level Up${counts.levelUp === 1 ? '' : 's'}`,
    `${counts.add} Add${counts.add === 1 ? '' : 's'}`
  ].join(' · ');
}

function spotifyPlaylistTypeKey(rowOrType) {
  const type = typeof rowOrType === 'string' ? rowOrType : rowOrType?.type;
  if (type === 'levelUp') return 'levelUp';
  if (type === 'add') return 'add';
  return 'direct';
}

function spotifyPlaylistSelectedRows() {
  const rows = spotifyPlaylistContext?.rows || [];
  const selected = spotifyPlaylistContext?.selected || [];
  return rows.filter((row, idx) => selected[idx] !== false);
}

function spotifyUpdatePlaylistTypeControls() {
  if (!spotifyPlaylistContext) return;
  const rows = spotifyPlaylistContext.rows || [];
  const selected = spotifyPlaylistContext.selected || [];
  const controlMap = {
    direct: 'spotifyPlaylistIncludeDirect',
    levelUp: 'spotifyPlaylistIncludeLevelUps',
    add: 'spotifyPlaylistIncludeAdds'
  };
  Object.entries(controlMap).forEach(([type, id]) => {
    const box = document.getElementById(id);
    if (!box) return;
    const indexes = rows.map((row, idx) => spotifyPlaylistTypeKey(row) === type ? idx : -1).filter(idx => idx >= 0);
    const checkedCount = indexes.filter(idx => selected[idx] !== false).length;
    box.disabled = false;
    box.checked = indexes.length > 0 && checkedCount === indexes.length;
    box.indeterminate = indexes.length > 0 && checkedCount > 0 && checkedCount < indexes.length;
    box.title = indexes.length ? `${indexes.length} ${type} track${indexes.length === 1 ? '' : 's'} in this checklist` : `No ${type} tracks found in this checklist`;
    const label = box.closest('label');
    if (label) label.classList.toggle('spotify-playlist-type-empty', indexes.length === 0);
  });
}

function spotifyPlaylistTrackCheckboxChanged(box) {
  if (!spotifyPlaylistContext || !box) return;
  const idx = Number(box.dataset.spotifyPlaylistTrack);
  if (!Number.isFinite(idx)) return;
  spotifyPlaylistContext.selected[idx] = !!box.checked;
  box.closest('.spotify-playlist-row')?.classList.toggle('is-unselected', !box.checked);
  spotifyUpdatePlaylistTypeControls();
  spotifyUpdatePlaylistIntro();
}

function spotifySetPlaylistTypeSelection(type, checked) {
  if (!spotifyPlaylistContext) return;
  const key = spotifyPlaylistTypeKey(type);
  spotifyPlaylistContext.rows.forEach((row, idx) => {
    if (spotifyPlaylistTypeKey(row) === key) spotifyPlaylistContext.selected[idx] = !!checked;
  });
  spotifyRenderPlaylistSongs();
}

function spotifyUpdatePlaylistIntro() {
  const rows = spotifyPlaylistContext?.rows || [];
  const selectedRows = spotifyPlaylistSelectedRows();
  const sourceName = spotifyPlaylistContext?.sourceName || spotifyPlaylistContext?.genreName || 'this selection';
  const intro = document.getElementById('spotifyPlaylistIntro');
  const breakdown = document.getElementById('spotifyPlaylistBreakdown');
  if (intro) {
    intro.textContent = `Add ${selectedRows.length} selected Spotify track${selectedRows.length === 1 ? '' : 's'} from ${sourceName} to an existing or new playlist.`;
  }
  if (breakdown) {
    breakdown.textContent = `${spotifyPlaylistCountsText(rows)} found · ${selectedRows.length} currently selected. Use the bulk controls or uncheck individual songs below.`;
  }
}

function spotifyRenderPlaylistSongs() {
  const rows = spotifyPlaylistContext?.rows || [];
  const songMount = document.getElementById('spotifyPlaylistSongs');
  const status = document.getElementById('spotifyPlaylistStatus');

  spotifyUpdatePlaylistIntro();
  if (!songMount) return;

  if (!rows.length) {
    songMount.innerHTML = '<div class="small">No Spotify track URLs found for this selection.</div>';
    return;
  }

  const selected = spotifyPlaylistContext.selected || rows.map(() => true);
  songMount.innerHTML = rows.map((row, idx) => {
    const typeClass = row.type === 'levelUp' ? 'levelup' : (row.type === 'add' ? 'add' : 'direct');
    const isChecked = selected[idx] !== false;
    const parentMeta = row.parentTitle
      ? ` <span class="spotify-playlist-relation-meta">· ${row.parentType === 'albumDive' ? 'Album' : 'Level Up from'}: ${escapeHtml(row.parentTitle)}${row.trackPosition ? ` · ${escapeHtml(row.trackPosition)}` : ''}</span>`
      : '';
    const genreMeta = row.genreName ? `<span class="spotify-playlist-genre-meta">${escapeHtml(row.genreName)}</span>${row.date ? ` · ${escapeHtml(row.date)}` : ''} · ` : '';
    return `
      <label class="spotify-playlist-row ${isChecked ? '' : 'is-unselected'}">
        <input type="checkbox" data-spotify-playlist-track="${idx}" ${isChecked ? 'checked' : ''} onchange="spotifyPlaylistTrackCheckboxChanged(this)" />
        <span>
          <span class="spotify-playlist-song-title">${escapeHtml(row.title)}<span class="spotify-playlist-type-badge ${escapeHtml(typeClass)}">${escapeHtml(row.sourceLabel)}</span></span>
          <span class="spotify-playlist-song-meta">${genreMeta}${escapeHtml(row.artist || 'Unknown artist')}${row.score != null ? ` · fit ${escapeHtml(String(row.score))}/5` : ''}${parentMeta}</span>
        </span>
      </label>
    `;
  }).join('');
  spotifyUpdatePlaylistTypeControls();
  if (status) status.textContent = '';
}

function spotifyOpenPlaylistModalWithRows({ rows = [], sourceName = 'this selection', playlistName = 'Daily Genre — Playlist', contextType = 'genre', genreId = '', genreIds = [] } = {}) {
  if (!rows.length) {
    showSaveToast('No Spotify track URLs found for this selection.', true);
    return;
  }

  spotifyPlaylistContext = {
    contextType,
    genreId,
    genreIds: Array.isArray(genreIds) ? genreIds.map(String) : [],
    genreName: sourceName,
    sourceName,
    rows,
    selected: rows.map(() => true)
  };
  const modal = document.getElementById('spotifyPlaylistModal');
  const nameInput = document.getElementById('spotifyPlaylistName');
  const status = document.getElementById('spotifyPlaylistStatus');
  if (nameInput) nameInput.value = playlistName;
  if (status) status.textContent = '';
  spotifyRenderPlaylistSongs();
  if (modal) modal.classList.add('show');
  spotifyReloadPlaylists();
}

async function openSpotifyPlaylistModal(encodedGenreId='') {
  const genreId = encodedGenreId ? decodeURIComponent(encodedGenreId) : (currentGenre?.id || '');
  if (!(await spotifyEnsurePlaylistScopes({ reopenPlaylistGenreId: genreId }))) return;

  const genre = genreId ? (genres || []).find(g => String(g.id) === String(genreId)) : currentGenre;
  if (!genre) {
    showSaveToast('Open a genre first, then add it to a Spotify playlist.', true);
    return;
  }
  const rows = spotifyPlaylistSongRows(genre);
  if (!rows.length) {
    showSaveToast('This genre has no Spotify track URLs to add.', true);
    return;
  }

  spotifyOpenPlaylistModalWithRows({
    rows,
    sourceName: genre.genre || 'this genre',
    playlistName: `Daily Genre — ${genre.genre || 'Playlist'}`,
    contextType: 'genre',
    genreId: genre.id != null ? String(genre.id) : ''
  });
}

function closeSpotifyPlaylistModal() {
  document.getElementById('spotifyPlaylistModal')?.classList.remove('show');
  spotifyPlaylistContext = null;
}

function spotifyTogglePlaylistSelections() {
  if (!spotifyPlaylistContext) return;
  const selected = spotifyPlaylistContext.selected || [];
  const shouldCheck = selected.some(value => value === false);
  spotifyPlaylistContext.selected = (spotifyPlaylistContext.rows || []).map(() => shouldCheck);
  spotifyRenderPlaylistSongs();
}

async function spotifyReloadPlaylists() {
  const select = document.getElementById('spotifyPlaylistSelect');
  if (!select || !spotifySession?.access_token) return;
  select.innerHTML = '<option value="">Loading playlists…</option>';
  try {
    await spotifyEnsureProfileUserId();
    const res = await spotifyApiFetch('me/playlists?limit=50');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(spotifyPlaylistApiError(data, res, 'load playlists'));
    spotifyPlaylistCache = Array.isArray(data.items) ? data.items.filter(Boolean) : [];
    const writable = spotifyPlaylistCache.filter(spotifyPlaylistIsWritable);
    const skipped = spotifyPlaylistCache.length - writable.length;
    select.innerHTML = '<option value="">Create a new playlist</option>' + writable
      .map(pl => `<option value="${escapeHtml(pl.id)}">${escapeHtml(pl.name || 'Untitled playlist')}${pl.tracks?.total != null ? ` (${escapeHtml(String(pl.tracks.total))})` : ''}</option>`)
      .join('');
    const status = document.getElementById('spotifyPlaylistStatus');
    if (status && skipped > 0) {
      status.textContent = `${skipped} followed playlist${skipped === 1 ? '' : 's'} hidden because Spotify will not let this app modify them.`;
    }
  } catch (err) {
    console.error('Spotify playlist load failed', err);
    select.innerHTML = '<option value="">Create a new playlist</option>';
    const status = document.getElementById('spotifyPlaylistStatus');
    if (status) status.textContent = `Could not load playlists: ${err.message || 'Unknown error'}`;
  }
}

async function spotifyCreatePlaylist(name, isPublic=false) {
  // Spotify's current Create Playlist endpoint is POST /me/playlists.
  // The older /users/{user_id}/playlists path can behave inconsistently for PKCE browser apps.
  const res = await spotifyApiFetch('me/playlists', {
    method:'POST',
    body: JSON.stringify({
      name,
      public: !!isPublic,
      description: 'Created from Daily Genre.'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(spotifyPlaylistApiError(data, res, 'create playlist'));
  try { await spotifyEnsureProfileUserId(); } catch {}
  return data;
}

async function spotifyAddSelectedTracksToPlaylist() {
  const status = document.getElementById('spotifyPlaylistStatus');
  const button = document.getElementById('spotifyPlaylistAddBtn');
  if (!spotifyPlaylistContext) return;
  if (!(await spotifyEnsurePlaylistScopes())) return;

  const rows = spotifyPlaylistContext.rows;
  const checked = spotifyPlaylistSelectedRows();
  if (!checked.length) {
    if (status) status.textContent = 'Select at least one track.';
    return;
  }

  let playlistId = document.getElementById('spotifyPlaylistSelect')?.value || '';
  const name = (document.getElementById('spotifyPlaylistName')?.value || '').trim();
  const isPublic = !!document.getElementById('spotifyPlaylistPublic')?.checked;

  try {
    if (button) { button.disabled = true; button.textContent = 'Adding…'; }
    if (status) status.textContent = 'Preparing Spotify playlist…';

    if (!playlistId) {
      const playlist = await spotifyCreatePlaylist(name || `Daily Genre — ${spotifyPlaylistContext.genreName}`, isPublic);
      playlistId = playlist.id;
      spotifyPlaylistCache.unshift(playlist);
    } else {
      const selectedPlaylist = spotifyPlaylistCache.find(pl => String(pl.id) === String(playlistId));
      if (selectedPlaylist && !spotifyPlaylistIsWritable(selectedPlaylist)) {
        throw new Error('Spotify will not let this app modify that playlist. Pick one you own/collaborate on, or create a new playlist.');
      }
    }

    const uris = [...new Set(checked.map(row => row.uri).filter(Boolean))];
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      const res = await spotifyApiFetch(`playlists/${encodeURIComponent(playlistId)}/items`, {
        method:'POST',
        body: JSON.stringify({ uris: chunk })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(spotifyPlaylistApiError(data, res, 'add items'));
    }

    const countsText = spotifyPlaylistCountsText(checked);
    const duplicateNote = checked.length !== uris.length ? ` ${checked.length - uris.length} duplicate checklist entr${checked.length - uris.length === 1 ? 'y was' : 'ies were'} only added once.` : '';
    if (status) status.textContent = `Added ${uris.length} unique track${uris.length === 1 ? '' : 's'} to Spotify (${countsText}).${duplicateNote}`;
    showSaveToast(`Added ${uris.length} unique track${uris.length === 1 ? '' : 's'} to Spotify playlist.`, false);
    setTimeout(closeSpotifyPlaylistModal, 900);
  } catch (err) {
    console.error('Spotify add-to-playlist failed', err);
    const message = err.message || 'Unknown error';
    if (status) {
      if (/Forbidden/i.test(message)) {
        status.innerHTML = `${escapeHtml(`Spotify playlist failed: ${message}`)} <button type="button" class="btn-inline" onclick="spotifyReconnectForPlaylistPermissions()">Reconnect Spotify for playlist permissions</button>`;
      } else {
        status.textContent = `Spotify playlist failed: ${message}`;
      }
    }
    showSaveToast(`Spotify playlist failed: ${message}`, true);
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Add to Spotify Playlist'; }
  }
}


function spotifyReconnectForPlaylistPermissions() {
  spotifySession = null;
  spotifyStorageRemove(SPOTIFY_SESSION_STORAGE_KEY);
  spotifyStorageRemove(SPOTIFY_AUTH_START_STORAGE_KEY);
  updateSpotifyUI();
  const returnOptions = spotifyPlaylistContext?.contextType === 'archive'
    ? { returnScreen: 'history' }
    : { returnScreen: spotifyActiveScreenName() };
  spotifyConnect({ force: true, ...returnOptions, reopenPlaylistGenreId: '', reopenPlaylistGenreIds: [] });
}

function spotifyRefreshPlayableButtons() {
  try {
    if (currentGenre && document.getElementById('screen-listen')?.classList.contains('active')) {
      const snapshot = preserveScrollSnapshot();
      loadListenScreen(currentGenre, { preserveDirty: true, skipSpotifyHydration: true });
      applyDetailEditMode(detailEditMode);
      snapshot();
    }
    if (document.getElementById('screen-history')?.classList.contains('active')) renderHistory();
  } catch (err) {
    console.warn('Could not refresh Spotify inline play buttons.', err);
  }
}


function updateSpotifyUI() {
  const btn = document.getElementById('spotifyConnectBtn');
  const wasConnected = btn?.classList.contains('spotify-connected') || false;
  if (!btn) return;

  if (spotifySession?.access_token) {
    const name = spotifySession.displayName ? `: ${spotifySession.displayName}` : '';
    btn.textContent = `Spotify Connected${name}`;
    btn.classList.add('spotify-connected');
    btn.title = 'Click to disconnect Spotify';
    btn.onclick = spotifyDisconnect;
  } else {
    btn.textContent = 'Connect Spotify';
    btn.classList.remove('spotify-connected');
    btn.title = 'Connect Spotify';
    btn.onclick = spotifyConnect;
  }
  const isConnected = btn.classList.contains('spotify-connected');
  if (wasConnected !== isConnected) spotifyRefreshPlayableButtons();
}

function spotifyRenderNowPlaying(track, isPlaying=false) {
  const mount = document.getElementById('spotifyNowPlaying');
  if (!mount) return;
  if (!track) {
    mount.innerHTML = spotifySession?.access_token
      ? '<div class="spotify-now-playing-inner"><div class="spotify-now-playing-text"><span class="spotify-now-playing-label">Spotify connected</span><span class="spotify-now-playing-match">Nothing playing right now.</span></div></div>'
      : '';
    mount.style.display = spotifySession?.access_token ? 'block' : 'none';
    return;
  }
  mount.style.display = 'block';

  const artists = (track.artists || []).map(a => a.name).filter(Boolean).join(', ');
  const title = [artists, track.name].filter(Boolean).join(' — ');
  const url = track.external_urls?.spotify || '';
  mount.innerHTML = `
    <div class="spotify-now-playing-inner">
      ${track.album?.images?.[2]?.url || track.album?.images?.[0]?.url ? `<img src="${escapeHtml(track.album.images[2]?.url || track.album.images[0]?.url)}" alt="" style="width:42px;height:42px;border-radius:8px;object-fit:cover;">` : ''}
      <div class="spotify-now-playing-text">
        <span class="spotify-now-playing-label">${isPlaying ? 'Now playing' : 'Last active on Spotify'}</span>
        <span class="spotify-now-playing-track">${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title || 'Spotify track')}</a>` : escapeHtml(title || 'Spotify track')}</span>
        <span class="spotify-now-playing-match">Spotify is connected for discovery actions.</span>
      </div>
    </div>`;
}

async function spotifyRefreshNowPlaying() {
  if (!spotifySession?.access_token) return;
  try {
    const res = await spotifyApiFetch('me/player/currently-playing');
    if (res.status === 204 || res.status === 202) {
      spotifyRenderNowPlaying(null);
      return;
    }
    const data = await res.json().catch(() => ({}));
    spotifyRenderNowPlaying(data?.item || null, !!data?.is_playing);
  } catch (err) {
    console.warn('Spotify now-playing refresh failed.', err);
  }
}

function spotifyStartPolling() {
  loadSpotifySession();
  if (!spotifySession?.access_token) return;
  updateSpotifyUI();
  if (spotifyNowPlayingInterval) clearInterval(spotifyNowPlayingInterval);
  spotifyRefreshNowPlaying();
  spotifyNowPlayingInterval = setInterval(spotifyRefreshNowPlaying, 30000);
}


document.getElementById('spotifyPlaylistModal')?.addEventListener('click', (event) => {
  if (event.target?.id === 'spotifyPlaylistModal') closeSpotifyPlaylistModal();
});

