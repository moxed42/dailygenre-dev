const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

// ranks-polish.js used to reassign window.moveRank to moveRankPolished,
// which called the captured "original" moveRank unconditionally, then did
// extra work (markRanksDirty + re-render). That's a plain post-only wrap,
// so Phase 3 converted it: moveRank (core/rankings-archive.js) now calls
// dgRunPostHooks('moveRank', id, direction) at all 3 of its exit points,
// and ranks-polish.js registers a post-hook instead of reassigning.
//
// renderRankings, by contrast, is genuinely NOT a wrap -- renderRankingsPolished
// is a full standalone reimplementation that never calls through to any
// original -- so it's left as a direct window.renderRankings reassignment,
// same as parseSongLinks/buildSongsBulkEditorText in song-identity-roles.js.

function makeEnv() {
  return createAppEnvironment({ extraScripts: ["ranks-polish.js"] });
}

test("moveRank swaps rank_order between adjacent genres in the same tier and fires the registered post-hook", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  window.replaceGenreLibrary(
    [
      { id: 1, genre: "Dream Pop", status: "listened", rating: "5", rank_order: 1 },
      { id: 2, genre: "Shoegaze", status: "listened", rating: "5", rank_order: 2 },
    ],
    "test-fixture"
  );

  let toastMessage = "";
  window.showSaveToast = (msg) => { toastMessage = msg; };

  window.moveRank(2, "up");

  const a = window.genres.find((g) => g.id === 1);
  const b = window.genres.find((g) => g.id === 2);
  assert.equal(a.rank_order, 2);
  assert.equal(b.rank_order, 1);
  // libraryUpdatesPending is a top-level `let` (config.js) -- lexical-only,
  // never a window property (same real-browser behavior documented
  // elsewhere in this suite) -- so check the post-hook's markRanksDirty()
  // side effect via the toast it shows instead.
  assert.match(toastMessage, /Rank order updated/);
});

test("moveRank's post-hook still fires (dirty flag unaffected either way) when the move is a no-op at a tier boundary", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  window.replaceGenreLibrary(
    [{ id: 1, genre: "Dream Pop", status: "listened", rating: "5", rank_order: 1 }],
    "test-fixture"
  );

  let toastMessage = "";
  window.showSaveToast = (msg) => { toastMessage = msg; };

  // Only one item in the tier -- moving "up" hits the base's own
  // swapIndex-out-of-range early return, which (per the old wrap's
  // unconditional-fire behavior) still fires the post-hook afterward.
  window.moveRank(1, "up");

  assert.equal(window.genres[0].rank_order, 1);
  assert.match(toastMessage, /Rank order updated/);
});

test("renderRankings is still the full renderRankingsPolished reimplementation (not a hook-based wrap)", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.replaceGenreLibrary(
    [{ id: 1, genre: "Dream Pop", status: "listened", rating: "5", rank_order: 1 }],
    "test-fixture"
  );

  window.switchScreen("ranking");
  window.renderRankings();

  const wrap = document.getElementById("rankingWrap");
  assert.ok(wrap?.innerHTML?.length > 0, "expected renderRankingsPolished to have rendered something into #rankingWrap");
});
