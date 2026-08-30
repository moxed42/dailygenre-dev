const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCachedEntry,
  shouldUseCachedLibrary,
} = require("../assets/js/data-cache.js");

test("normalizeCachedEntry accepts a well-formed entry", () => {
  const entry = { sha: "abc123", data: [{ id: 1, genre: "Dream Pop" }] };
  assert.deepEqual(normalizeCachedEntry(entry), entry);
});

test("normalizeCachedEntry rejects missing/empty sha", () => {
  assert.equal(normalizeCachedEntry({ sha: "", data: [{ id: 1 }] }), null);
  assert.equal(normalizeCachedEntry({ data: [{ id: 1 }] }), null);
});

test("normalizeCachedEntry rejects a non-array data payload", () => {
  assert.equal(normalizeCachedEntry({ sha: "abc", data: "not-an-array" }), null);
  assert.equal(normalizeCachedEntry({ sha: "abc", data: null }), null);
});

test("normalizeCachedEntry rejects an empty data array", () => {
  assert.equal(normalizeCachedEntry({ sha: "abc", data: [] }), null);
});

test("normalizeCachedEntry treats non-object/null input as a cache miss", () => {
  assert.equal(normalizeCachedEntry(null), null);
  assert.equal(normalizeCachedEntry(undefined), null);
  assert.equal(normalizeCachedEntry("corrupted-string"), null);
  assert.equal(normalizeCachedEntry(42), null);
});

test("shouldUseCachedLibrary is true when the cached SHA matches the remote SHA", () => {
  const entry = { sha: "matching-sha", data: [{ id: 1 }] };
  assert.equal(shouldUseCachedLibrary(entry, "matching-sha"), true);
});

test("shouldUseCachedLibrary is false when the SHA differs (stale cache)", () => {
  const entry = { sha: "old-sha", data: [{ id: 1 }] };
  assert.equal(shouldUseCachedLibrary(entry, "new-sha"), false);
});

test("shouldUseCachedLibrary is false when there is no cached entry", () => {
  assert.equal(shouldUseCachedLibrary(null, "some-sha"), false);
});

test("shouldUseCachedLibrary is false when the remote SHA is unknown", () => {
  const entry = { sha: "some-sha", data: [{ id: 1 }] };
  assert.equal(shouldUseCachedLibrary(entry, ""), false);
  assert.equal(shouldUseCachedLibrary(entry, undefined), false);
});

test("shouldUseCachedLibrary treats a corrupted cached entry as a cache miss", () => {
  assert.equal(shouldUseCachedLibrary({ sha: "abc", data: "oops" }, "abc"), false);
  assert.equal(shouldUseCachedLibrary("not-an-object", "abc"), false);
});
