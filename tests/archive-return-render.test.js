const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appPath = path.join(__dirname, "..", "assets", "js", "app.js");
const app = fs.readFileSync(appPath, "utf8");

function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);

  const open = app.indexOf("{", app.indexOf(")", start));
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = open; i < app.length; i += 1) {
    const ch = app[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return app.slice(start, i + 1);
    }
  }

  throw new Error(`Could not parse ${name}`);
}

const restore = functionBody("restoreArchiveUiState");

test("archive return suppresses switchScreen scheduled render", () => {
  assert.match(
    restore,
    /switchScreen\(\s*['"]history['"]\s*,\s*\{\s*skipRender:\s*true\s*\}\s*\)/,
  );
});

test("archive return routes rendering through screen cache", () => {
  const calls =
    restore.match(
      /renderNavigationScreen\(\s*['"]history['"]\s*,\s*renderHistory\s*\)/g,
    ) || [];
  assert.equal(calls.length, 2);
});

test("archive return has no direct renderHistory call", () => {
  const withoutCachedCalls = restore.replace(
    /renderNavigationScreen\(\s*['"]history['"]\s*,\s*renderHistory\s*\)/g,
    "",
  );
  assert.doesNotMatch(withoutCachedCalls, /\brenderHistory\s*\(\s*\)/);
});
