const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPerGenreSongIdentityIndex,
} = require("../assets/js/song-index.js");

function keysForSong(song) {
  return [
    song?.id ? `id:${song.id}` : "",
    song?.url ? `url:${song.url}` : "",
    song?.artist || song?.title
      ? `meta:${song.artist || ""}|${song.title || ""}`
      : "",
  ].filter(Boolean);
}

function makeIndex() {
  return createPerGenreSongIdentityIndex({
    keysForSong,
    childForSong: (song) => song?.levelUp || null,
  });
}

test("song identity index resolves parents and nested Level Up children", () => {
  const index = makeIndex();
  const genre = { id: 1 };
  const parent = {
    id: "parent",
    title: "Main",
    levelUp: { id: "child", title: "Upgrade" },
  };
  const songs = [parent];

  const parentResult = index.get(genre, songs, "id:parent");
  const childResult = index.get(genre, songs, "id:child");

  assert.equal(parentResult.song, parent);
  assert.equal(parentResult.parent, null);
  assert.equal(parentResult.index, 0);
  assert.equal(childResult.song, parent.levelUp);
  assert.equal(childResult.parent, parent);
  assert.equal(childResult.index, 0);
});

test("duplicate keys preserve first-match linear lookup behavior", () => {
  const index = makeIndex();
  const genre = { id: 2 };
  const first = { id: "dup", title: "First" };
  const second = { id: "dup", title: "Second" };

  assert.equal(index.get(genre, [first, second], "id:dup").song, first);
});

test("a same-array identity mutation self-heals on the new key", () => {
  const index = makeIndex();
  const genre = { id: 3 };
  const song = { id: "before", title: "Track" };
  const songs = [song];

  assert.equal(index.get(genre, songs, "id:before").song, song);

  song.id = "after";

  assert.equal(index.get(genre, songs, "id:after").song, song);
  assert.equal(index.get(genre, songs, "id:before"), null);
  assert.ok(index.stats(genre).builds >= 2);
});

test("same-length object replacement and reordering self-heal", () => {
  const index = makeIndex();
  const genre = { id: 4 };
  const first = { id: "one" };
  const second = { id: "two" };
  const songs = [first, second];

  assert.equal(index.get(genre, songs, "id:one").song, first);

  const replacement = { id: "one", updated: true };
  songs[0] = replacement;

  assert.equal(index.get(genre, songs, "id:one").song, replacement);

  songs.reverse();

  const result = index.get(genre, songs, "id:one");
  assert.equal(result.song, replacement);
  assert.equal(result.index, 1);
});

test("removing or replacing a nested child invalidates stale entries", () => {
  const index = makeIndex();
  const genre = { id: 5 };
  const parent = { id: "p", levelUp: { id: "old-child" } };
  const songs = [parent];

  assert.equal(index.get(genre, songs, "id:old-child").song, parent.levelUp);

  parent.levelUp = { id: "new-child" };

  assert.equal(index.get(genre, songs, "id:old-child"), null);
  assert.equal(index.get(genre, songs, "id:new-child").song, parent.levelUp);
});

test("genre caches are isolated and explicit invalidation resets readiness", () => {
  const index = makeIndex();
  const genreA = { id: "a" };
  const genreB = { id: "b" };
  const songA = { id: "song-a" };
  const songB = { id: "song-b" };

  assert.equal(index.get(genreA, [songA], "id:song-a").song, songA);
  assert.equal(index.get(genreB, [songB], "id:song-b").song, songB);
  assert.equal(index.stats(genreA).ready, true);
  assert.equal(index.stats(genreB).ready, true);

  index.invalidate(genreA);

  assert.equal(index.stats(genreA).ready, false);
  assert.equal(index.stats(genreB).ready, true);
});

test("invalid genres and empty keys return null safely", () => {
  const index = makeIndex();

  assert.equal(index.get(null, [], "id:x"), null);
  assert.equal(index.get({}, [], ""), null);
});

test("stats distinguish a stale index from the current song array", () => {
  const index = makeIndex();
  const genre = { id: 6 };
  const original = { id: "original" };
  const songs = [original];

  index.get(genre, songs, "id:original");

  assert.equal(index.stats(genre, songs).ready, true);
  assert.equal(index.stats(genre, songs).stale, false);

  const replacementSongs = [{ id: "replacement" }];

  assert.equal(index.stats(genre, replacementSongs).ready, false);
  assert.equal(index.stats(genre, replacementSongs).stale, true);

  index.get(genre, replacementSongs, "id:replacement");

  assert.equal(index.stats(genre, replacementSongs).ready, true);
  assert.equal(index.stats(genre, replacementSongs).stale, false);
});

