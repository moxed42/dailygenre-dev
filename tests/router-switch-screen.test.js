const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

test("switchScreen activates the target screen and deactivates the rest", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window, document } = env;

  const result = window.switchScreen("history");

  assert.equal(result, true);
  assert.equal(document.getElementById("screen-history").classList.contains("active"), true);
  assert.equal(document.getElementById("screen-spin").classList.contains("active"), false);
});

test("switchScreen sets aria-hidden/inert on inactive screens and clears them on the active one", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.switchScreen("viz");

  const activeScreen = document.getElementById("screen-viz");
  const inactiveScreen = document.getElementById("screen-spin");

  assert.equal(activeScreen.getAttribute("aria-hidden"), "false");
  assert.equal(activeScreen.inert, false);
  assert.equal(inactiveScreen.getAttribute("aria-hidden"), "true");
  assert.equal(inactiveScreen.inert, true);
});

test("switchScreen keeps the .tab-btn 'active' class and aria-selected in sync with the shown screen", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.switchScreen("ranking");

  const activeTab = document.getElementById("tab-ranking");
  const otherTab = document.getElementById("tab-spin");

  assert.equal(activeTab.classList.contains("active"), true);
  assert.equal(activeTab.getAttribute("aria-selected"), "true");
  assert.equal(otherTab.classList.contains("active"), false);
  assert.equal(otherTab.getAttribute("aria-selected"), "false");
});

test("switchScreen returns false and does not change the active screen for an unknown screen name", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.switchScreen("review");
  const result = window.switchScreen("not-a-real-screen");

  assert.equal(result, false);
  assert.equal(document.getElementById("screen-review").classList.contains("active"), true);
});

test("switchScreen updates document.title for non-listen screens via screenTitle()", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window, document } = env;

  window.switchScreen("history");
  const titleAfterHistory = document.title;

  window.switchScreen("ranking");
  const titleAfterRanking = document.title;

  assert.notEqual(titleAfterHistory, "");
  assert.notEqual(titleAfterRanking, "");
  assert.notEqual(titleAfterHistory, titleAfterRanking);
});

test("switchScreen scrolls to top by default when navigating away from listen", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  const { window } = env;

  let scrolledTo = null;
  window.scrollTo = (opts) => { scrolledTo = opts; };

  window.switchScreen("viz");
  // requestAnimationFrame is polyfilled with setTimeout(fn, 0) in the harness.
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(scrolledTo, "expected window.scrollTo to have been called");
  assert.equal(scrolledTo.top, 0);
  assert.equal(scrolledTo.left, 0);
});
