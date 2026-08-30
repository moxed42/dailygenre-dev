/* Daily Genre v243: pure normalization foundation.
   This file is intentionally not loaded by index.html yet. It is exercised by
   Node tests first, then will be integrated into production loading separately. */

(function dailyGenreNormalizeModule(globalScope) {
  "use strict";

  function cloneArray(value) {
    if (Array.isArray(value)) return value.map(cloneRecord);
    if (value == null || value === "") return [];
    return [cloneRecord(value)];
  }

  function cloneRecord(value) {
    if (Array.isArray(value)) return value.map(cloneRecord);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, cloneRecord(child)]),
      );
    }
    return value;
  }

  function normalizeOptionalString(value) {
    return typeof value === "string" ? value.trim() : value;
  }

  function normalizeSongRecord(rawSong) {
    if (!rawSong || typeof rawSong !== "object" || Array.isArray(rawSong)) {
      return rawSong;
    }

    const song = cloneRecord(rawSong);

    for (const key of [
      "artist",
      "title",
      "url",
      "spotifyId",
      "album",
      "artwork",
      "isrc",
      "description",
      "sourceGenre",
      "source_genre",
      "pending_source",
      "type",
    ]) {
      if (Object.prototype.hasOwnProperty.call(song, key)) {
        song[key] = normalizeOptionalString(song[key]);
      }
    }

    if (Object.prototype.hasOwnProperty.call(song, "score")) {
      const numericScore = Number(song.score);
      if (Number.isFinite(numericScore) && numericScore >= 1 && numericScore <= 5) {
        song.score = numericScore;
      }
    }

    return song;
  }

  function normalizeSongList(value) {
    return cloneArray(value).map(normalizeSongRecord);
  }

  // Storage-safe normalization is the production-load path. It guarantees
  // collection shape and fresh object references without trimming strings,
  // coercing scores, or otherwise creating unrelated full-library save churn.
  function normalizeGenreRecordForRuntime(rawGenre) {
    const source =
      rawGenre && typeof rawGenre === "object" && !Array.isArray(rawGenre)
        ? rawGenre
        : {};

    const genre = cloneRecord(source);
    genre.songs_listened = cloneArray(source.songs_listened);
    genre.pending_songs = cloneArray(source.pending_songs);
    return genre;
  }

  function normalizeGenreLibraryForRuntime(rawGenres) {
    if (!Array.isArray(rawGenres)) return [];
    return rawGenres.map(normalizeGenreRecordForRuntime);
  }

  function normalizeGenreRecord(rawGenre) {
    const source =
      rawGenre && typeof rawGenre === "object" && !Array.isArray(rawGenre)
        ? rawGenre
        : {};

    const genre = cloneRecord(source);

    if (Object.prototype.hasOwnProperty.call(genre, "genre")) {
      genre.genre = normalizeOptionalString(genre.genre);
    }
    if (Object.prototype.hasOwnProperty.call(genre, "status")) {
      genre.status = normalizeOptionalString(genre.status);
    }
    if (Object.prototype.hasOwnProperty.call(genre, "date")) {
      genre.date = normalizeOptionalString(genre.date);
    }

    genre.songs_listened = normalizeSongList(source.songs_listened);
    genre.pending_songs = normalizeSongList(source.pending_songs);

    return genre;
  }

  function normalizeGenreLibrary(rawGenres) {
    if (!Array.isArray(rawGenres)) return [];
    return rawGenres.map(normalizeGenreRecord);
  }

  const api = {
    cloneRecord,
    normalizeSongRecord,
    normalizeSongList,
    normalizeGenreRecordForRuntime,
    normalizeGenreLibraryForRuntime,
    normalizeGenreRecord,
    normalizeGenreLibrary,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenreNormalize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
