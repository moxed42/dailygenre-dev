const test = require("node:test");
const assert = require("node:assert/strict");

const { createAppEnvironment } = require("./helpers/app-harness.js");

const WORKER_URL = "https://genre-spinner.sam-moxed.workers.dev/";
const DATA_API_URL = "https://api.github.com/repos/moxed42/dailygenre/contents/genres_data.json?ref=main";
const DATA_URL = "https://raw.githubusercontent.com/moxed42/dailygenre/main/genres_data.json";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function makeFetchMock(handlers) {
  return async (url) => {
    const key = String(url);
    if (key.startsWith(WORKER_URL) && handlers.worker) return handlers.worker();
    if (key.startsWith(DATA_API_URL) && handlers.metadata) return handlers.metadata();
    if (key.startsWith(DATA_URL) && handlers.raw) return handlers.raw();
    throw new Error(`Unhandled fetch in test: ${key}`);
  };
}

test("loadData() uses the Worker when its SHA matches GitHub's current SHA", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  const genreRows = [{ id: 1, genre: "Dream Pop", status: "unlistened" }];
  env.window.fetch = makeFetchMock({
    worker: () => jsonResponse({ ok: true, sha: "matching-sha", data: genreRows }),
    metadata: () => jsonResponse({ sha: "matching-sha", size: 42 }),
  });

  await env.window.loadData();

  assert.equal(env.window.dailyGenreDataSource.source, "worker");
  assert.equal(env.window.dailyGenreDataSource.githubDataFetched, false, "should not have paid for the raw GitHub download");
  assert.equal(env.window.genres.length, 1);
  assert.equal(env.window.genres[0].genre, "Dream Pop");
});

test("loadData() reconciles with GitHub's raw JSON when the Worker's SHA is stale", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  const staleWorkerRows = [{ id: 1, genre: "Dream Pop", status: "unlistened" }];
  const currentGithubRows = [
    { id: 1, genre: "Dream Pop", status: "unlistened" },
    { id: 2, genre: "Vaporwave", status: "unlistened" },
  ];
  env.window.fetch = makeFetchMock({
    worker: () => jsonResponse({ ok: true, sha: "old-sha", data: staleWorkerRows }),
    metadata: () => jsonResponse({ sha: "new-sha", size: 99 }),
    raw: () => jsonResponse(currentGithubRows),
  });

  await env.window.loadData();

  assert.equal(env.window.dailyGenreDataSource.source, "github-raw");
  assert.equal(env.window.dailyGenreDataSource.githubDataFetched, true);
  assert.equal(env.window.genres.length, 2);
});

test("loadData() keeps the Worker's data if GitHub's SHA differs but returns FEWER genres", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  const workerRows = [
    { id: 1, genre: "Dream Pop", status: "unlistened" },
    { id: 2, genre: "Vaporwave", status: "unlistened" },
  ];
  const fewerGithubRows = [{ id: 1, genre: "Dream Pop", status: "unlistened" }];
  env.window.fetch = makeFetchMock({
    worker: () => jsonResponse({ ok: true, sha: "old-sha", data: workerRows }),
    metadata: () => jsonResponse({ sha: "new-sha", size: 10 }),
    raw: () => jsonResponse(fewerGithubRows),
  });

  await env.window.loadData();

  assert.equal(env.window.dailyGenreDataSource.source, "worker");
  assert.equal(env.window.genres.length, 2);
});

test("loadData() falls back to GitHub's raw JSON when the Worker is unreachable", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  const githubRows = [{ id: 1, genre: "Shoegaze", status: "unlistened" }];
  env.window.fetch = makeFetchMock({
    worker: () => { throw new Error("network error"); },
    metadata: () => jsonResponse({ sha: "some-sha", size: 5 }),
    raw: () => jsonResponse(githubRows),
  });

  await env.window.loadData();

  assert.equal(env.window.dailyGenreDataSource.source, "github-raw");
  assert.equal(env.window.genres.length, 1);
  assert.equal(env.window.genres[0].genre, "Shoegaze");
});

test("loadData() shows the error pill and does not crash when every source fails", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  env.window.fetch = makeFetchMock({
    worker: () => { throw new Error("worker down"); },
    metadata: () => { throw new Error("github api down"); },
    raw: () => { throw new Error("raw github down"); },
  });

  await env.window.loadData();

  const pill = env.document.getElementById("remainingCount");
  assert.equal(pill.textContent, "Could not load production data.");
  assert.equal(pill.classList.contains("pill-error"), true);
  assert.equal(pill.classList.contains("pill-loading"), false);
});

test("loadData() sets the pill-loading class while in flight and clears it once genres load", async (t) => {
  const env = await createAppEnvironment();
  t.after(() => env.cleanup());

  let resolveWorker;
  const workerPromise = new Promise((resolve) => { resolveWorker = resolve; });
  env.window.fetch = makeFetchMock({
    worker: () => workerPromise,
    metadata: () => jsonResponse({ sha: "sha-1", size: 1 }),
  });

  const loadPromise = env.window.loadData();
  const pill = env.document.getElementById("remainingCount");
  assert.equal(pill.classList.contains("pill-loading"), true);

  resolveWorker(jsonResponse({ ok: true, sha: "sha-1", data: [{ id: 1, genre: "Dream Pop", status: "unlistened" }] }));
  await loadPromise;

  assert.equal(pill.classList.contains("pill-loading"), false);
  assert.ok(pill.textContent.includes("explored"));
});
