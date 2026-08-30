/* Daily Genre v246: self-healing per-genre song identity index. */

(function dailyGenreSongIndexModule(globalScope) {
  "use strict";

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createPerGenreSongIdentityIndex(options = {}) {
    const keysForSong =
      typeof options.keysForSong === "function"
        ? options.keysForSong
        : () => [];
    const childForSong =
      typeof options.childForSong === "function"
        ? options.childForSong
        : (song) => song?.levelUp || null;

    const stateByGenre = new WeakMap();

    function keysFor(song) {
      const raw = keysForSong(song);
      const values = Array.isArray(raw) ? raw : [raw];
      return [...new Set(values.map(normalizeKey).filter(Boolean))];
    }

    function addEntry(map, entry) {
      keysFor(entry.song).forEach((key) => {
        // Preserve the old linear lookup behavior: the first matching row wins.
        if (!map.has(key)) map.set(key, entry);
      });
    }

    function build(genre, songs) {
      const rows = Array.isArray(songs) ? songs : [];
      const map = new Map();

      rows.forEach((song, index) => {
        if (!song) return;

        addEntry(map, {
          song,
          parent: null,
          index,
        });

        const child = childForSong(song);
        if (child) {
          addEntry(map, {
            song: child,
            parent: song,
            index,
          });
        }
      });

      const state = {
        source: rows,
        length: rows.length,
        map,
        builds: (stateByGenre.get(genre)?.builds || 0) + 1,
      };
      stateByGenre.set(genre, state);
      return state;
    }

    function entryIsCurrent(entry, songs, requestedKey) {
      if (!entry || !Array.isArray(songs)) return false;
      const topLevel = songs[entry.index];

      if (entry.parent) {
        if (topLevel !== entry.parent) return false;
        if (childForSong(entry.parent) !== entry.song) return false;
      } else if (topLevel !== entry.song) {
        return false;
      }

      return keysFor(entry.song).includes(requestedKey);
    }

    function get(genre, songs, key) {
      if (!genre || (typeof genre !== "object" && typeof genre !== "function")) {
        return null;
      }

      const rows = Array.isArray(songs) ? songs : [];
      const requestedKey = normalizeKey(key);
      if (!requestedKey) return null;

      let state = stateByGenre.get(genre);
      if (
        !state ||
        state.source !== rows ||
        state.length !== rows.length
      ) {
        state = build(genre, rows);
      }

      let entry = state.map.get(requestedKey) || null;
      if (entryIsCurrent(entry, rows, requestedKey)) {
        return { ...entry, songs: rows };
      }

      // A miss can mean an identity changed in place while the array reference
      // and length stayed stable. Rebuild once and retry.
      state = build(genre, rows);
      entry = state.map.get(requestedKey) || null;

      return entryIsCurrent(entry, rows, requestedKey)
        ? { ...entry, songs: rows }
        : null;
    }

    function invalidate(genre) {
      if (genre && (typeof genre === "object" || typeof genre === "function")) {
        stateByGenre.delete(genre);
      }
    }

    function stats(genre, songs = null) {
      const state =
        genre && (typeof genre === "object" || typeof genre === "function")
          ? stateByGenre.get(genre)
          : null;
      const hasCurrentSongs = Array.isArray(songs);
      const isCurrent = Boolean(
        state &&
        (
          !hasCurrentSongs ||
          (state.source === songs && state.length === songs.length)
        )
      );

      return {
        ready: isCurrent,
        stale: Boolean(state && !isCurrent),
        indexedLength: state?.length ?? -1,
        size: state?.map?.size || 0,
        builds: state?.builds || 0,
      };
    }

    return {
      get,
      invalidate,
      stats,
    };
  }

  const api = {
    createPerGenreSongIdentityIndex,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenreSongIndex = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
