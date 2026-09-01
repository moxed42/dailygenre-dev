const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

// Regression test for a real production bug found during the Phase 5
// Library-screen pass: core/rankings-archive.js computed its
// archiveProgressiveState at its OWN file's top level, synchronously, by
// calling window.DailyGenreArchiveProgressive?.createArchiveProgressiveState.
// But archive-progressive.js (which defines window.DailyGenreArchiveProgressive)
// loads AFTER core/rankings-archive.js in index.html's real script order --
// so window.DailyGenreArchiveProgressive was always undefined at that point,
// archiveProgressiveState was permanently null, and the Archive screen fell
// through to rendering EVERY item as real DOM on every render, every time --
// no batching at all, confirmed live (1036 genres -> ~135,000px tall screen).
//
// The existing archive-adaptive-batch.test.js and archive-progressive.test.js
// files didn't catch this: one only regex-matches source text, the other
// unit-tests archive-progressive.js in total isolation from
// core/rankings-archive.js. Neither replicates the real script load order.
// This test does, using the harness's extraScripts option to load
// archive-progressive.js AFTER core/rankings-archive.js (SCRIPT_ORDER's base
// list doesn't include it at all), matching the real bug's precondition.

function makeEnv() {
  return createAppEnvironment({ extraScripts: ["archive-progressive.js"] });
}

test("Archive batches its render even when archive-progressive.js loads after core/rankings-archive.js", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  const many = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    genre: `Test genre ${i + 1}`,
    status: "listened",
    rating: "3",
    date_normalized: "2026-01-01",
  }));
  window.replaceGenreLibrary(many, "test-fixture");

  window.switchScreen("history", { force: true });
  window.renderHistory();

  const diag = window.dailyGenreArchiveProgressiveDiagnostics();
  assert.equal(diag.installed, true, "progressive state should be installed despite the load order");
  assert.ok(diag.rendered < diag.total, "only a batch should render, not every item");
  assert.equal(diag.hasMore, true);

  const cardCount = window.document.querySelectorAll("#screen-history .archive-card").length;
  assert.equal(cardCount, diag.rendered);
});

test("loadMoreArchiveEntries appends the next batch correctly under the real load order", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  const many = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    genre: `Test genre ${i + 1}`,
    status: "listened",
    rating: "3",
    date_normalized: "2026-01-01",
  }));
  window.replaceGenreLibrary(many, "test-fixture");
  window.switchScreen("history", { force: true });
  window.renderHistory();

  const before = window.dailyGenreArchiveProgressiveDiagnostics();
  window.loadMoreArchiveEntries();
  const after = window.dailyGenreArchiveProgressiveDiagnostics();

  assert.ok(after.rendered > before.rendered);
  assert.equal(after.loads, 1);
});
