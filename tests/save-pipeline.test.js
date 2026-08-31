const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

const WORKER_URL = "https://genre-spinner.sam-moxed.workers.dev/";
const DATA_API_URL = "https://api.github.com/repos/moxed42/dailygenre/contents/genres_data.json?ref=main";

// performSaveWithPassword() is the real save logic (unaffected by this dev
// sandbox's doSaveWithPassword guard, which only exists to stop this repo's
// copy from writing back to production and gets removed on port-back to
// production -- see index.html/app.js comments). Testing this lower-level
// function directly is what actually matters for the save pipeline: it's
// what song-identity-roles.js (assets/js/song-identity-roles.js) chains onto
// in production.

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test("performSaveWithPassword() succeeds and returns the new sha on a clean save", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  env.window.fetch = async (url, init = {}) => {
    if (String(url).startsWith(WORKER_URL) && init.method === "POST") {
      assert.equal(init.headers["X-Password"], "hunter2");
      return jsonResponse({ ok: true, sha: "new-sha-after-save" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await env.window.performSaveWithPassword("hunter2");

  assert.equal(result.ok, true);
  assert.equal(result.sha, "new-sha-after-save");
});

test("performSaveWithPassword() throws AUTH_FAILED on a 401 response", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  env.window.fetch = async (url, init = {}) => {
    if (String(url).startsWith(WORKER_URL) && init.method === "POST") {
      return jsonResponse({ error: "bad password" }, { ok: false, status: 401 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    () => env.window.performSaveWithPassword("wrong-password"),
    (err) => err.code === "AUTH_FAILED"
  );
});

test("performSaveWithPassword() throws STALE_DATA on a 409/conflict response", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  env.window.fetch = async (url, init = {}) => {
    if (String(url).startsWith(WORKER_URL) && init.method === "POST") {
      return jsonResponse({ conflict: true }, { ok: false, status: 409 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    () => env.window.performSaveWithPassword("hunter2"),
    (err) => err.code === "STALE_DATA"
  );
});

test("performSaveWithPassword() throws SAVE_FAILED with the server's message on a generic non-ok response", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  env.window.fetch = async (url, init = {}) => {
    if (String(url).startsWith(WORKER_URL) && init.method === "POST") {
      return jsonResponse({ error: "disk full", code: "WORKER_STORAGE_ERROR" }, { ok: false, status: 500 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    () => env.window.performSaveWithPassword("hunter2"),
    (err) => err.code === "WORKER_STORAGE_ERROR" && err.message === "disk full"
  );
});

test("performSaveWithPassword() blocks the save with DUPLICATE_GENRES before ever hitting the network", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary(
    [
      { id: 1, genre: "Dream Pop", status: "unlistened" },
      { id: 2, genre: "Dream Pop", status: "unlistened" },
    ],
    "test-fixture-duplicates"
  );

  let fetchCalls = 0;
  env.window.fetch = async () => { fetchCalls += 1; throw new Error("should not be called"); };
  env.window.alert = () => {};

  await assert.rejects(
    () => env.window.performSaveWithPassword("hunter2"),
    (err) => err.code === "DUPLICATE_GENRES"
  );
  assert.equal(fetchCalls, 0, "should never have attempted a network request");
});

test("performSaveWithPassword() throws NO_REVISION when no data revision could ever be determined", async (t) => {
  // Force the initial auto-boot itself to fail, so serverFileSha is never
  // populated (loadData() only sets it on a successful load).
  const env = await createAppEnvironment({
    fetchImpl: async () => { throw new Error("everything is down"); },
  });
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  env.window.fetch = async (url) => {
    if (String(url).startsWith(DATA_API_URL)) {
      return jsonResponse({ message: "not found" }, { ok: false, status: 404 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  await assert.rejects(
    () => env.window.performSaveWithPassword("hunter2"),
    (err) => err.code === "NO_REVISION"
  );
});

test("performSaveWithPassword() recovers from an interrupted response by confirming a new revision on GitHub", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());
  env.window.replaceGenreLibrary([{ id: 1, genre: "Dream Pop", status: "unlistened" }], "test-fixture");

  let recoveryCheckCount = 0;
  env.window.fetch = async (url, init = {}) => {
    const key = String(url);
    if (key.startsWith(WORKER_URL) && init.method === "POST") {
      throw new Error("network dropped mid-response");
    }
    if (key.startsWith(DATA_API_URL)) {
      recoveryCheckCount += 1;
      // First recovery check still sees the old sha; second sees the save
      // actually landed (a different sha), which is what should let
      // performSaveWithPassword conclude the save succeeded anyway.
      const sha = recoveryCheckCount === 1 ? "harness-default-sha" : "confirmed-after-interruption";
      return jsonResponse({ sha, size: 1 });
    }
    throw new Error(`Unexpected fetch: ${key}`);
  };

  // confirmProductionSaveAfterNetworkError uses the jsdom window's own
  // setTimeout (900ms then 1800ms between GitHub recovery checks) rather
  // than Node's global one, so node:test's mock timers can't reliably
  // fast-forward it -- just let this one run for real (~2.7s).
  const result = await env.window.performSaveWithPassword("hunter2");

  assert.equal(result.ok, true);
  assert.equal(result.recovered, true);
  assert.equal(result.sha, "confirmed-after-interruption");
});
