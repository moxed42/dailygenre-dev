/* Several tests assert that specific code patterns exist somewhere in the
   shipped app by regex-matching raw source text (rather than exercising
   behavior -- see tests/helpers/app-harness.js for the behavioral kind).
   Phase 1 of the architectural redesign split app.js's ~10,271 lines into
   app.js plus assets/js/core/*.js (same global-scope model, just organized
   into cohesive files instead of one file). These text-matching tests don't
   care WHICH file a pattern lives in, only that it's still there, so this
   helper concatenates app.js with every assets/js/core/*.js file and hands
   back one combined string to match against -- keeping the tests' original
   intent intact without hardcoding which file each pattern moved to. */

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

function readAppSource() {
  const jsDir = path.join(REPO_ROOT, "assets", "js");
  const coreDir = path.join(jsDir, "core");

  const parts = [fs.readFileSync(path.join(jsDir, "app.js"), "utf8")];

  if (fs.existsSync(coreDir)) {
    for (const name of fs.readdirSync(coreDir).sort()) {
      if (name.endsWith(".js") && !name.endsWith(".min.js")) {
        parts.push(fs.readFileSync(path.join(coreDir, name), "utf8"));
      }
    }
  }

  return parts.join("\n");
}

module.exports = { readAppSource };
