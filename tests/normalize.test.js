const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeSongRecord,
  normalizeGenreRecordForRuntime,
  normalizeGenreLibraryForRuntime,
  normalizeGenreRecord,
  normalizeGenreLibrary,
} = require("../assets/js/normalize.js");

test("normalizeGenreRecord is idempotent", () => {
  const input = {
    id: 42,
    genre: "  Dream Pop  ",
    status: " listened ",
    songs_listened: {
      artist: "  Cocteau Twins ",
      title: " Heaven or Las Vegas  ",
      score: "5",
      customFlag: { keep: true },
    },
    pending_songs: null,
    unknownTopLevel: { preserved: ["yes"] },
  };

  const once = normalizeGenreRecord(input);
  const twice = normalizeGenreRecord(once);

  assert.deepEqual(twice, once);
});

test("normalization does not mutate the source record", () => {
  const input = {
    genre: "  Slowcore ",
    songs_listened: [{ artist: "  Low ", score: "4" }],
    pending_songs: [],
  };
  const snapshot = structuredClone(input);

  normalizeGenreRecord(input);

  assert.deepEqual(input, snapshot);
});

test("unknown genre and song fields survive normalization", () => {
  const input = {
    id: "abc",
    genre: " Noise Rock ",
    customGenreField: { nested: 7 },
    songs_listened: [
      {
        artist: " Melt-Banana ",
        title: " Candy Gun ",
        score: "5",
        customSongField: ["keep", "me"],
      },
    ],
  };

  const result = normalizeGenreRecord(input);

  assert.deepEqual(result.customGenreField, { nested: 7 });
  assert.deepEqual(result.songs_listened[0].customSongField, ["keep", "me"]);
});

test("song collections are always arrays", () => {
  const result = normalizeGenreRecord({
    genre: "Art Pop",
    songs_listened: { artist: "Kate Bush", title: "Cloudbusting" },
    pending_songs: null,
  });

  assert.equal(Array.isArray(result.songs_listened), true);
  assert.equal(result.songs_listened.length, 1);
  assert.equal(Array.isArray(result.pending_songs), true);
  assert.equal(result.pending_songs.length, 0);
});

test("valid fit scores become numbers while invalid values are preserved", () => {
  assert.equal(normalizeSongRecord({ score: "3" }).score, 3);
  assert.equal(normalizeSongRecord({ score: 5 }).score, 5);
  assert.equal(normalizeSongRecord({ score: "unrated" }).score, "unrated");
  assert.equal(normalizeSongRecord({ score: 9 }).score, 9);
});

test("normalizeGenreLibrary handles invalid input and returns new records", () => {
  assert.deepEqual(normalizeGenreLibrary(null), []);

  const source = [{ id: 1, genre: " Punk ", songs_listened: [] }];
  const result = normalizeGenreLibrary(source);

  assert.notEqual(result, source);
  assert.notEqual(result[0], source[0]);
  assert.equal(result[0].genre, "Punk");
});

test("runtime normalization preserves storage scalar values", () => {
  const input = {
    id: 77,
    genre: "  Dream Pop  ",
    status: " listened ",
    songs_listened: {
      artist: "  Cocteau Twins ",
      title: " Heaven or Las Vegas  ",
      score: "5",
      customField: { keep: true },
    },
    pending_songs: null,
  };

  const result = normalizeGenreRecordForRuntime(input);

  assert.equal(result.genre, "  Dream Pop  ");
  assert.equal(result.status, " listened ");
  assert.equal(result.songs_listened[0].artist, "  Cocteau Twins ");
  assert.equal(result.songs_listened[0].score, "5");
  assert.deepEqual(result.songs_listened[0].customField, { keep: true });
  assert.deepEqual(result.pending_songs, []);
});

test("runtime library normalization is idempotent and does not mutate input", () => {
  const input = [{
    id: 1,
    genre: "Art Pop",
    songs_listened: [{ score: "4", nested: { value: 1 } }],
  }];
  const snapshot = structuredClone(input);

  const once = normalizeGenreLibraryForRuntime(input);
  const twice = normalizeGenreLibraryForRuntime(once);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(twice, once);
  assert.notEqual(once, input);
  assert.notEqual(once[0], input[0]);
  assert.notEqual(once[0].songs_listened[0], input[0].songs_listened[0]);
});

