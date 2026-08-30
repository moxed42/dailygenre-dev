const test = require("node:test");
const assert = require("node:assert/strict");
const { createScreenRenderCache } = require("../assets/js/screen-cache.js");

test("first navigation renders and unchanged revisit hits cache", () => {
  const cache = createScreenRenderCache({
    getRevision: () => 1,
    getSignature: () => "all",
    isReady: () => true,
  });
  assert.equal(cache.shouldRender("history"), true);
  cache.markRendered("history");
  assert.equal(cache.shouldRender("history"), false);
  const report = cache.snapshot();
  assert.equal(report.counters.misses, 1);
  assert.equal(report.counters.hits, 1);
  assert.equal(report.counters.renders, 1);
});

test("revision change requires a new render", () => {
  let revision = 1;
  const cache = createScreenRenderCache({
    getRevision: () => revision,
    getSignature: () => "all",
    isReady: () => true,
  });
  cache.markRendered("review");
  revision = 2;
  assert.equal(cache.shouldRender("review"), true);
});

test("top-level filter signature change requires a new render", () => {
  let signature = "month=2026-07";
  const cache = createScreenRenderCache({
    getRevision: () => 3,
    getSignature: () => signature,
    isReady: () => true,
  });
  cache.markRendered("history");
  signature = "month=2026-06";
  assert.equal(cache.shouldRender("history"), true);
});

test("force and disallowed states bypass reuse", () => {
  let allowed = true;
  const cache = createScreenRenderCache({
    getRevision: () => 1,
    getSignature: () => "",
    isReady: () => true,
    isAllowed: () => allowed,
  });
  cache.markRendered("ranking");
  assert.equal(cache.shouldRender("ranking", { force: true }), true);
  allowed = false;
  assert.equal(cache.shouldRender("ranking"), true);
  assert.equal(cache.snapshot().counters.bypasses, 2);
});

test("missing rendered target prevents reuse", () => {
  let ready = true;
  const cache = createScreenRenderCache({
    getRevision: () => 1,
    getSignature: () => "",
    isReady: () => ready,
  });
  cache.markRendered("history");
  ready = false;
  assert.equal(cache.shouldRender("history"), true);
});

test("manual invalidation clears one screen or every screen", () => {
  const cache = createScreenRenderCache({
    getRevision: () => 1,
    getSignature: () => "",
    isReady: () => true,
  });
  cache.markRendered("history");
  cache.markRendered("review");
  cache.invalidate("history", "test");
  assert.equal(cache.shouldRender("history"), true);
  assert.equal(cache.shouldRender("review"), false);
  cache.invalidate(null, "all");
  assert.equal(cache.shouldRender("review"), true);
});
