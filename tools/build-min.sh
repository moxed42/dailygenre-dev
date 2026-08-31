#!/usr/bin/env bash
# Regenerates .min.js / .min.css alongside their sources.
# No bundler/build step is added to the deploy pipeline: these are committed
# files, and tools/check-build.sh verifies they stay in sync with source.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== Minifying JS (terser) =="
for f in assets/js/*.js assets/js/core/*.js; do
  case "$f" in *.min.js) continue ;; esac
  out="${f%.js}.min.js"
  echo "  $f -> $out"
  npx --yes terser "$f" --compress --mangle --comments false -o "$out"
done

echo "== Minifying CSS (csso) =="
for f in assets/css/*.css; do
  case "$f" in *.min.css) continue ;; esac
  out="${f%.css}.min.css"
  echo "  $f -> $out"
  npx --yes csso-cli "$f" --output "$out"
done

echo "Done."
