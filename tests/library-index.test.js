const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRevisionedGenreIndex,
} = require("../assets/js/library-index.js");

test("revisioned genre index resolves IDs and builds lazily", () => {
  const index = createRevisionedGenreIndex();
  const rows = [
    { id: 1, genre: "Art Pop" },
    { id: "2", genre: "Slowcore" },
  ];

  assert.equal(index.stats().ready, false);
  assert.equal(index.getById(rows, "1"), rows[0]);
  assert.equal(index.getById(rows, 2), rows[1]);
  assert.deepEqual(index.stats(), {
    revision: 0,
    indexedRevision: 0,
    indexedLength: 2,
    size: 2,
    ready: true,
  });
});

test("invalidate advances revision and rebuilds after same-length replacement", () => {
  const index = createRevisionedGenreIndex();
  const original = { id: 7, genre: "Dream Pop" };
  const replacement = { id: 7, genre: "Dream Pop", updated: true };
  const rows = [original];

  assert.equal(index.getById(rows, 7), original);

  rows[0] = replacement;
  index.invalidate();

  assert.equal(index.revision(), 1);
  assert.equal(index.getById(rows, 7), replacement);
  assert.equal(index.stats().indexedRevision, 1);
});

test("array reference and length changes remain defensive rebuild triggers", () => {
  const index = createRevisionedGenreIndex();
  const first = [{ id: 1 }, { id: 2 }];

  index.getById(first, 1);

  const copied = first.slice();
  assert.equal(index.getById(copied, 2), copied[1]);

  copied.push({ id: 3 });
  assert.equal(index.getById(copied, 3), copied[2]);
  assert.equal(index.stats().indexedLength, 3);
});

test("duplicate IDs retain the existing last-row-wins Map behavior", () => {
  const index = createRevisionedGenreIndex();
  const first = { id: "dup", genre: "First" };
  const second = { id: "dup", genre: "Second" };

  assert.equal(index.getById([first, second], "dup"), second);
});

test("invalid sources safely behave like an empty library", () => {
  const index = createRevisionedGenreIndex();

  assert.equal(index.getById(null, "missing"), null);
  assert.equal(index.stats().size, 0);
});
