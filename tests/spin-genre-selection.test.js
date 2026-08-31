const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

const FIXTURE_GENRES = [
  { id: 1, genre: "Dream Pop", status: "unlistened" },
  { id: 2, genre: "Vaporwave", status: "" },
  { id: 3, genre: "Shoegaze", status: "unlistened" },
  { id: 4, genre: "Krautrock", status: "listened", date_normalized: "2026-01-01" },
  { id: 5, genre: "Yacht Rock", status: "zanger" },
  { id: 6, genre: "Math Rock", status: "veto" },
];

function loadFixtureGenres(env) {
  env.window.replaceGenreLibrary(FIXTURE_GENRES.map((g) => ({ ...g })), "test-fixture");
}

test("randomGenre() only ever returns genres from the unlistened pool", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  loadFixtureGenres(env);

  const expectedNames = new Set(["Dream Pop", "Vaporwave", "Shoegaze"]);
  for (let i = 0; i < 30; i++) {
    const picked = env.window.randomGenre();
    assert.ok(picked, "expected randomGenre() to return a genre");
    assert.ok(expectedNames.has(picked.genre), `unexpected genre picked: ${picked.genre}`);
  }
});

test("randomGenre() returns undefined when no unlistened genres remain", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary(
    FIXTURE_GENRES.filter((g) => g.status === "listened" || g.status === "zanger" || g.status === "veto"),
    "test-fixture-all-excluded"
  );

  assert.equal(env.window.randomGenre(), undefined);
});

test("buildSpinnerPool() renders one .genre-chip per unlistened genre (up to 28)", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  loadFixtureGenres(env);

  env.window.buildSpinnerPool();

  const chips = env.document.querySelectorAll("#spinnerTrack .genre-chip");
  assert.equal(chips.length, 3);
  const names = [...chips].map((el) => el.textContent);
  assert.deepEqual(new Set(names), new Set(["Dream Pop", "Vaporwave", "Shoegaze"]));
});

// currentGenre is a top-level `let` in config.js: a real browser (like this
// harness) never exposes that as window.currentGenre either -- `let`/`const`
// top-level script bindings are lexical-only, not global-object properties
// (only `var`/function DECLARATIONS are, e.g. window.randomGenre works
// because `function randomGenre(){}` is a declaration). So instead of
// reading currentGenre, these tests control which genre gets picked by
// overriding window.randomGenre -- spinWheel()'s internal bare `randomGenre()`
// call resolves through the same global-object-linked binding, so the
// override takes effect exactly like it would if a real caller replaced it.

test("spinWheel() drives the spinner animation for the genre randomGenre() returns", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  loadFixtureGenres(env);

  const forcedPick = { id: 1, genre: "Dream Pop" };
  env.window.randomGenre = () => forcedPick;

  let animateCalls = 0;
  env.window.Element.prototype.animate = function () {
    animateCalls += 1;
    return { cancel() {}, finish() {}, addEventListener() {} };
  };

  env.window.spinWheel();

  assert.equal(animateCalls, 1);
});

test("spinWheel() eventually renders the spin result for the selected genre", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  loadFixtureGenres(env);

  const forcedPick = { id: 3, genre: "Shoegaze", summary: "Wall of reverb." };
  env.window.randomGenre = () => forcedPick;

  t.mock.timers.enable({ apis: ["setTimeout"] });
  env.window.spinWheel();
  t.mock.timers.tick(2900);

  assert.equal(env.document.getElementById("spinResult").classList.contains("show"), true);
  assert.ok(env.document.getElementById("spinResult").innerHTML.includes("Shoegaze"));
});

test("spinWheel() alerts and never touches the spinner/animation when no unlistened genres remain", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary(
    FIXTURE_GENRES.filter((g) => g.status !== "unlistened" && g.status !== ""),
    "test-fixture-all-excluded"
  );

  let alertMessage = null;
  env.window.alert = (msg) => { alertMessage = msg; };
  let animateCalls = 0;
  env.window.Element.prototype.animate = function () {
    animateCalls += 1;
    return { cancel() {}, finish() {}, addEventListener() {} };
  };

  env.window.spinWheel();

  assert.equal(alertMessage, "No unlistened genres remaining.");
  assert.equal(animateCalls, 0, "spinWheel() should bail out before ever animating the spinner");
  assert.equal(env.document.getElementById("spinResult").classList.contains("show"), false);
});
