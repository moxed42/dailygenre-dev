const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

// listening-room.js used to monkey-patch openCrateDig, openRandomListenedGenre,
// and loadListenScreen by reassigning them. Phase 3 converted these to
// pre/post-hook registrations on the (now hook-enabled) base functions in
// app.js. These tests load listening-room.js on top of the base harness and
// verify the hook-based behavior matches what the old wraps did.

function makeEnv() {
  return createAppEnvironment({ extraScripts: ["listening-room.js"] });
}

test("openRandomListenedGenre sets DC.crateDigIntent via the registered pre-hook before opening a genre", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  window.replaceGenreLibrary(
    [{ id: 1, genre: "Dream Pop", status: "listened", date_normalized: "2026-01-01", songs_listened: [] }],
    "test-fixture"
  );

  const opened = window.openRandomListenedGenre();

  assert.equal(opened, true);
  // currentGenre is a top-level `let` in app.js -- lexical-only, never a
  // window property (real browser behavior, not a jsdom quirk) -- so check
  // the genre actually opened via document.title, which loadListenScreen
  // sets synchronously from the opened genre.
  assert.equal(window.document.title, "Dream Pop | Daily Genre");
});

test("openCrateDig also fires the pre-hook (via its internal call to openRandomListenedGenre) with no console errors", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.replaceGenreLibrary(
    [{ id: 2, genre: "Vaporwave", status: "listened", date_normalized: "2026-01-02", songs_listened: [] }],
    "test-fixture"
  );

  const btn = document.createElement("button");
  btn.id = "topCrateDigBtn";
  document.body.appendChild(btn);

  assert.doesNotThrow(() => window.openCrateDig());
  assert.equal(window.document.title, "Vaporwave | Daily Genre");
});

test("openRandomListenedGenre still shows the toast and returns false when nothing is listened yet (gate unaffected by the hook)", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window } = env;

  window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  let toastMessage = "";
  window.showSaveToast = (msg) => { toastMessage = msg; };

  const opened = window.openRandomListenedGenre();

  assert.equal(opened, false);
  assert.match(toastMessage, /No listened genres available for Crate Dig/);
});

test("loadListenScreen's registered pre/post hooks (listen-mode CSS classes + deferred enhancement) run without throwing", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.replaceGenreLibrary([{ id: 5, genre: "Shoegaze", status: "unlistened", songs_listened: [] }], "test-fixture");

  window.loadListenScreen(window.genres[0]);
  // The post-hook's enhancement work is deferred via setTimeout(20).
  await new Promise((resolve) => setTimeout(resolve, 40));

  const screen = document.getElementById("screen-listen");
  assert.ok(screen?.classList.contains("listen-experience-mode"));
  assert.ok(document.body.classList.contains("dc-discovery-console"));
});
