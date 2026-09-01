const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

// studio-polish.js used to monkey-patch renderReview() by reassigning
// window.renderReview. Its early-exit branch (skip the base entirely while
// the Studio text/paste guard is active, running its own apply() instead)
// is a genuine conditional bypass -- not a plain before/after wrap -- so
// Phase 3 converted it using the override-hook registry (added for
// song-identity-roles.js's save pipeline) rather than plain pre/post hooks.
// These tests confirm the bypass and the normal path both still behave like
// the old wrap did.

function makeEnv() {
  return createAppEnvironment({ extraScripts: ["studio-polish.js"] });
}

test("renderReview runs its real logic (produces the pending-nominations markup) when no paste guard is active", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window, document } = env;

  const mount = document.getElementById("reviewContent");
  assert.ok(mount, "expected #reviewContent to exist");

  window.renderReview();

  assert.ok(mount.querySelector(".review-stat-grid"), "expected the base renderReview() markup to be present");
  assert.ok(mount.classList.contains("studio-workbench"), "expected Studio's apply() post-hook to have run too");
});

test("renderReview is bypassed entirely (returns null, base logic never runs) while Studio text entry is active", async (t) => {
  const env = await makeEnv();
  t.after(() => env.cleanup());
  const { window, document } = env;

  const mount = document.getElementById("reviewContent");
  // Render once normally first so the base markup exists, then remove it so
  // we can tell whether the *next* call re-creates it (base ran) or not
  // (base was bypassed).
  window.renderReview();
  mount.querySelector(".review-stat-grid")?.remove();
  assert.equal(mount.querySelector(".review-stat-grid"), null);

  // isStudioTextEntryActive() requires the Review screen active AND focus on
  // an editable Studio target -- reproduce both, same as a real user
  // actively typing in the inbox textarea while paste-guard logic is live.
  document.getElementById("screen-review")?.classList.add("active");
  const textarea = document.createElement("textarea");
  textarea.className = "inbox-card";
  document.body.appendChild(textarea);
  textarea.focus();

  const result = window.renderReview();

  assert.equal(result, null, "the old wrap returned null when the guard was active; the override hook should too");
  assert.equal(
    mount.querySelector(".review-stat-grid"),
    null,
    "renderReview's own base logic should not have run while Studio text entry was active"
  );
  // apply() should still have run (that's the whole point of the bypass --
  // keep Studio's own lanes in sync without touching the native content).
  assert.ok(mount.classList.contains("studio-workbench"));
});
