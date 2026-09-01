/* Characterization-test harness for app.js's core subsystems.
   Loads the REAL source files (not mocks/reimplementations) into a single
   shared jsdom global context, in the same relative order index.html loads
   them in, so tests exercise actual production behavior -- this is what
   "characterization test" means: capture what the code really does today,
   bugs included, as a regression net for the Phase 1 file-split (and later
   phases) to run against.

   Only the files that load BEFORE app.js in index.html (plus app.js itself)
   are loaded here, since Phase 0's test targets (switchScreen, loadData,
   spin/genre-selection, the save pipeline) are all defined in app.js and
   don't depend on the later "-polish"/"-hotfix" patch files being present --
   those patch files only ADD behavior on top in the real app, they aren't
   required for app.js's own base behavior to run. */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Real load order from index.html, up to and including app.js.
const SCRIPT_ORDER = [
  "utils.js",
  "data-cache.js",
  "config.js",
  "genre-data.js",
  "spotify.js",
  "album-dive.js",
  "normalize.js",
  "library-index.js",
  "song-index.js",
  "song-reaction.js",
  "performance.js",
  "screen-cache.js",
  "listen-screen-cache.js",
  "archive-view-model-cache.js",
  "archive-render-reuse.js",
  "core/review-queue.js",
  "core/rankings-archive.js",
  "core/data-load.js",
  "archive-progressive.js",
  "app.js",
];

function extractBodyHtml() {
  const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error("Could not find <body> in index.html");
  // Strip every <script> tag -- we execute the real source files ourselves
  // via vm, in a controlled order, rather than letting jsdom fetch/parse
  // them (avoids network access for the Chart.js CDN tag and lets us mock
  // fetch() before any app code runs).
  return bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, "");
}

/**
 * Creates a fresh jsdom window with the real app body markup and the real
 * app.js + its dependencies loaded into it, ready for a test to call global
 * functions (window.switchScreen, window.loadData, etc.) and inspect the DOM.
 *
 * @param {object} [options]
 * @param {(url: string, init?: object) => Promise<Response>} [options.fetchImpl]
 *   Installed as window.fetch before app.js runs (app.js's own top-level code
 *   doesn't call fetch, only functions do, but installing it up front keeps
 *   this harness simple and matches what a real page has available from the
 *   start).
 * @param {string[]} [options.extraScripts]
 *   Additional assets/js/*.js filenames to load, in order, immediately after
 *   SCRIPT_ORDER's app.js -- for tests that specifically need one of the
 *   post-app.js "-polish"/"-hotfix" patch files present (e.g. verifying a
 *   hook-registered wrap actually fires), rather than Phase 0's base-only
 *   scope.
 */
async function createAppEnvironment(options = {}) {
  const bodyHtml = extractBodyHtml();
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    { url: "https://example.invalid/", pretendToBeVisual: true, runScripts: "outside-only" }
  );
  const { window } = dom;

  // jsdom doesn't implement these; the app already tolerates their absence
  // (data-cache.js checks for indexedDB, various call sites wrap
  // clipboard/rAF in try/catch) so this matches real fallback behavior
  // rather than papering over anything.
  window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
  window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
  // jsdom doesn't implement the Web Animations API. The app only calls
  // .animate(...) to drive a CSS transform visually and never inspects the
  // returned Animation object, so a no-op stub is behaviorally equivalent
  // for everything test code can observe (DOM/state changes, not paint).
  if (!window.Element.prototype.animate) {
    window.Element.prototype.animate = function animateStub() {
      return { cancel() {}, finish() {}, addEventListener() {} };
    };
  }
  if (!window.navigator.clipboard) {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: async () => {} },
      configurable: true,
    });
  }

  // app.js calls bootApp() -> loadData() at the bottom of the file (real
  // production behavior, same as a real page load) -- default to a fast,
  // valid-shaped empty response so that automatic first load resolves
  // immediately instead of falling through Worker -> GitHub-metadata ->
  // raw-GitHub-fallback (each an instant rejection, but still three hops of
  // noise) and, more importantly, so genre-data.js's health-check panel
  // doesn't fire its real 8s/12s window-load timers during tests. Tests
  // that care about a specific loadData() scenario pass their own
  // fetchImpl and call window.loadData() again explicitly.
  window.fetch = options.fetchImpl || (async (url) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).includes("api.github.com")
      ? { sha: "harness-default-sha", size: 0 }
      : { ok: true, sha: "harness-default-sha", data: [] }),
  }));

  const context = dom.getInternalVMContext();

  for (const filename of [...SCRIPT_ORDER, ...(options.extraScripts || [])]) {
    const filePath = path.join(REPO_ROOT, "assets", "js", filename);
    const source = fs.readFileSync(filePath, "utf8");
    try {
      vm.runInContext(source, context, { filename: filePath });
    } catch (err) {
      throw new Error(`Failed executing ${filename} in jsdom context: ${err.message}`);
    }
  }

  // app.js's own last line calls bootApp() -> loadData() fire-and-forget
  // (real production behavior). Wait for that initial call to actually
  // settle -- either success (loadData sets window.dailyGenreDataSource as
  // its last step) or its own definitive failure (the pill-error class) --
  // before handing the environment to a test. A fixed delay is not reliable
  // here since createAppEnvironment's own vm-execution cost varies, and a
  // still-pending chain can otherwise race a test's own replaceGenreLibrary()
  // call or its cleanup()'s window.close().
  const remainingCountEl = window.document.getElementById("remainingCount");
  const bootDeadline = Date.now() + 5000;
  while (
    window.dailyGenreDataSource == null &&
    !remainingCountEl?.classList.contains("pill-error") &&
    Date.now() < bootDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  // genre-data.js schedules real setTimeout-based health-check timers on
  // window "load" (8s, then 12s more). window.close() cancels jsdom's
  // pending timers/tasks so tests don't hang around waiting for them.
  function cleanup() {
    window.close();
  }

  return { window, document: window.document, dom, cleanup };
}

module.exports = { createAppEnvironment, SCRIPT_ORDER };
