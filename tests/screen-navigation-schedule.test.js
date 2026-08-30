const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const app = fs.readFileSync(appPath, "utf8");

test("screen work receives a navigation revision", () => {
  assert.match(app, /let screenNavigationRevision\s*=\s*0/);
  assert.match(app, /const navigationRevision\s*=\s*\+\+screenNavigationRevision/);
});

test("scheduled screen work rejects stale navigation", () => {
  assert.match(
    app,
    /revision\s*!==\s*screenNavigationRevision\s*\|\|\s*!isActive/,
  );
  assert.match(app, /screenNavigationScheduleDiagnostics\.cancelled\s*\+=\s*1/);
});

test("all delayed tab render paths use guarded scheduling", () => {
  const calls =
    app.match(/scheduleCurrentScreenWork\(/g) || [];
  assert.equal(calls.length, 5);
  assert.match(app, /scheduleCurrentScreenWork\('viz'/);
  assert.match(app, /scheduleCurrentScreenWork\('review'/);
  assert.match(app, /scheduleCurrentScreenWork\('history'/);
  assert.match(app, /scheduleCurrentScreenWork\('ranking'/);
});

test("navigation scheduling exposes diagnostics", () => {
  assert.match(
    app,
    /window\.dailyGenreScreenScheduleDiagnostics\s*=\s*\(\)\s*=>/,
  );
});
