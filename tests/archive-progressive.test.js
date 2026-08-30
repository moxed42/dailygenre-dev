const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  createArchiveProgressiveState,
} = require("../assets/js/archive-progressive.js");

test("Archive progressive state renders the first 80 entries", () => {
  const state = createArchiveProgressiveState({ batchSize: 80 });
  const result = state.prepare("all", 205);

  assert.equal(result.rendered, 80);
  assert.equal(result.remaining, 125);
  assert.equal(result.hasMore, true);
});

test("Archive progressive state loads the next batch", () => {
  const state = createArchiveProgressiveState({ batchSize: 80 });
  state.prepare("all", 205);
  const result = state.loadMore();

  assert.equal(result.rendered, 160);
  assert.equal(result.remaining, 45);
  assert.equal(result.loads, 1);
});

test("Archive progressive state preserves expansion for the same signature", () => {
  const state = createArchiveProgressiveState({ batchSize: 80 });
  state.prepare("rating-3", 240);
  state.loadMore();

  const result = state.prepare("rating-3", 260);

  assert.equal(result.rendered, 160);
  assert.equal(result.resets, 1);
});

test("Archive progressive state resets when filters change", () => {
  const state = createArchiveProgressiveState({ batchSize: 80 });
  state.prepare("all", 240);
  state.loadMore();

  const result = state.prepare("rating-4", 190);

  assert.equal(result.rendered, 80);
  assert.equal(result.resets, 2);
});

test("Archive progressive state clamps to a smaller result set", () => {
  const state = createArchiveProgressiveState({ batchSize: 80 });
  state.prepare("all", 140);
  state.loadMore();

  const result = state.prepare("all", 23);

  assert.equal(result.rendered, 23);
  assert.equal(result.remaining, 0);
  assert.equal(result.hasMore, false);
});

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const app = fs.readFileSync(appPath, "utf8");

test("Archive uses delegated open and playlist handlers", () => {
  assert.match(app, /function ensureArchiveListDelegation/);
  assert.match(app, /list\.addEventListener\('click'/);
  assert.match(app, /list\.addEventListener\('change'/);
  assert.doesNotMatch(
    app,
    /list\.querySelectorAll\('\[data-open-id\]'\)/,
  );
});

test("Archive playlist visible selection follows the rendered batch", () => {
  assert.match(
    app,
    /function archiveVisiblePlaylistGenreIds\(\)\s*\{\s*return \(archiveRenderedItems \|\| \[\]\)/,
  );
  assert.match(app, /window\.dailyGenreArchiveProgressiveDiagnostics/);
});
