#!/usr/bin/env bash

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo
echo "== Git whitespace check =="
git diff --check

echo
echo "== JavaScript syntax =="
while IFS= read -r -d '' file; do
  echo "Checking $file"
  node --check "$file"
done < <(find assets/js -type f -name '*.js' -print0)

echo
echo "== JSON validation =="
node <<'NODE'
const fs = require("fs");

const files = [
  "genres_data.json",
  "genres_data_test.json",
].filter((file) => fs.existsSync(file));

for (const file of files) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!Array.isArray(parsed)) {
    throw new Error(`${file} must contain a top-level array`);
  }

  console.log(`${file}: valid JSON, ${parsed.length} rows`);
}
NODE

echo
echo "== Build metadata =="
node <<'NODE'
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");

const metaVersion =
  html.match(/name="daily-genre-version"\s+content="([^"]+)"/)?.[1] || "";
const metaUpdated =
  html.match(/name="daily-genre-updated"\s+content="([^"]+)"/)?.[1] || "";
const footerVersion =
  html.match(/<span>Daily Genre (v\d+)<\/span>/)?.[1] || "";
const footerUpdated =
  html.match(/<span>Updated ([^<]+)<\/span>/)?.[1] || "";

if (!metaVersion) throw new Error("Missing daily-genre-version metadata");
if (!metaUpdated) throw new Error("Missing daily-genre-updated metadata");
if (!footerVersion) throw new Error("Missing visible footer version");
if (!footerUpdated) throw new Error("Missing visible footer timestamp");

if (metaVersion !== footerVersion) {
  throw new Error(
    `Version mismatch: metadata=${metaVersion}, footer=${footerVersion}`,
  );
}

if (metaUpdated !== footerUpdated) {
  throw new Error(
    `Timestamp mismatch: metadata=${metaUpdated}, footer=${footerUpdated}`,
  );
}

const localAssets = [
  ...html.matchAll(
    /(?:src|href)="(\.\/assets\/(?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=([^"]+))?"/g,
  ),
];

const missingCacheBust = localAssets
  .filter((match) => !match[2])
  .map((match) => match[1]);

if (missingCacheBust.length) {
  throw new Error(
    `Assets missing cache-bust values:\n${missingCacheBust.join("\n")}`,
  );
}

const cacheValues = [...new Set(localAssets.map((match) => match[2]))];

if (cacheValues.length !== 1) {
  throw new Error(
    `Inconsistent cache-bust values: ${cacheValues.join(", ")}`,
  );
}

console.log(`Version: ${metaVersion}`);
console.log(`Updated: ${metaUpdated}`);
console.log(`Asset cache key: ${cacheValues[0]}`);
console.log(`Checked ${localAssets.length} local CSS/JS assets`);
NODE

echo
echo "All build checks passed."
