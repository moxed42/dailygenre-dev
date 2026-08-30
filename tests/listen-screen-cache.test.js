const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createMountedListenScreenCache,
} = require("../assets/js/listen-screen-cache.js");

test("same genre and revision reuse mounted screen", () => {
  let revision = 1;
  const cache = createMountedListenScreenCache({
    getRevision: () => revision,
    isReady: () => true,
  });
  const genre = { id: 42 };
  assert.equal(cache.canReuse(genre), false);
  cache.markRendered(genre);
  assert.equal(cache.canReuse(genre), true);
  const report = cache.snapshot();
  assert.equal(report.counters.hits, 1);
  assert.equal(report.counters.renders, 1);
});

test("different genre requires full render", () => {
  const cache = createMountedListenScreenCache({
    getRevision: () => 1,
    isReady: () => true,
  });
  cache.markRendered({ id: 1 });
  assert.equal(cache.canReuse({ id: 2 }), false);
});

test("revision change requires full render", () => {
  let revision = 1;
  const cache = createMountedListenScreenCache({
    getRevision: () => revision,
    isReady: () => true,
  });
  cache.markRendered({ id: 1 });
  revision = 2;
  assert.equal(cache.canReuse({ id: 1 }), false);
});

test("missing mounted DOM requires full render", () => {
  let ready = true;
  const cache = createMountedListenScreenCache({
    getRevision: () => 1,
    isReady: () => ready,
  });
  cache.markRendered({ id: 1 });
  ready = false;
  assert.equal(cache.canReuse({ id: 1 }), false);
});

test("force option bypasses reuse", () => {
  const cache = createMountedListenScreenCache({
    getRevision: () => 1,
    isReady: () => true,
  });
  cache.markRendered({ id: 1 });
  assert.equal(cache.canReuse({ id: 1 }, { force: true }), false);
});

test("manual invalidation clears mounted state", () => {
  const cache = createMountedListenScreenCache({
    getRevision: () => 1,
    isReady: () => true,
  });
  cache.markRendered({ id: 1 });
  cache.invalidate("test");
  assert.equal(cache.canReuse({ id: 1 }), false);
  assert.equal(cache.snapshot().counters.invalidations, 1);
});
