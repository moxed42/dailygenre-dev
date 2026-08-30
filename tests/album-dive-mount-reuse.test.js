const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const app = fs.readFileSync(appPath, "utf8");

test("album pane records whether real content is mounted", () => {
  assert.match(
    app,
    /data-album-dive-mounted="\$\{albumPaneMounted \? 'true' : 'false'\}"/,
  );
});

test("Albums toggle uses the mounted-panel helper", () => {
  assert.match(
    app,
    /ensureMountedAlbumDivePanel\(albumsPane,\s*currentGenre\)/,
  );
  assert.doesNotMatch(
    app,
    /albumsPane\.innerHTML\s*=\s*renderAlbumDivePanel\(currentGenre\)/,
  );
});

test("mounted album panel helper reuses existing DOM", () => {
  assert.match(
    app,
    /if\s*\(pane\.dataset\.albumDiveMounted\s*===\s*'true'\)/,
  );
  assert.match(
    app,
    /albumDiveMountDiagnostics\.reuses\s*\+=\s*1/,
  );
  assert.match(
    app,
    /albumDiveMountDiagnostics\.renders\s*\+=\s*1/,
  );
});
