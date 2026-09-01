#!/usr/bin/env node
// One-off Phase 5 tool: replace exact hex-color literals that already match a
// design token's value with var(--token) references, across all non-min CSS
// files. Skips the :root declaration lines themselves (so a token is never
// rewritten to reference itself). Purely mechanical -- rendered colors are
// byte-identical before/after, this only removes duplication.
"use strict";
const fs = require("fs");
const path = require("path");

const CSS_DIR = path.join(__dirname, "..", "assets", "css");

const TOKENS = {
  "--bg": "#21150d",
  "--surface": "#f3e4c8",
  "--surface-2": "#ead0a0",
  "--surface-3": "#3a2414",
  "--text": "#22160d",
  "--muted": "#735a3c",
  "--faint": "#9b7c54",
  "--border": "#b98e55",
  "--accent": "#d98d25",
  "--accent-dark": "#7a4714",
  "--accent-soft": "#ffe0a1",
  "--danger": "#9b3428",
  "--danger-soft": "#f1c7b5",
  "--success": "#496b3b",
  "--success-soft": "#dce8c8",
};

const files = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith(".css") && !f.endsWith(".min.css"));

// Sort tokens by hex length descending isn't needed (all 7-char), but do
// longer var names checks aren't needed either since we match by hex value.
const entries = Object.entries(TOKENS);

let totalReplacements = 0;
for (const file of files) {
  const abs = path.join(CSS_DIR, file);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  let fileReplacements = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip the custom-property declaration line for a token (e.g. "--bg:#21150d;")
    // so a token is never rewritten to reference itself.
    const declMatch = line.match(/^\s*(--[a-z0-9-]+)\s*:/i);
    if (declMatch && TOKENS[declMatch[1]]) continue;
    let newLine = line;
    for (const [varName, hex] of entries) {
      // First collapse a redundant "var(--x, #sameHex)" fallback down to
      // plain "var(--x)" rather than nesting -- var(--x, var(--x)).
      const fallbackRe = new RegExp(
        `var\\(\\s*${varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,\\s*${hex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9a-fA-F])\\s*\\)`,
        "gi"
      );
      if (fallbackRe.test(newLine)) {
        const count = (newLine.match(fallbackRe) || []).length;
        newLine = newLine.replace(fallbackRe, `var(${varName})`);
        fileReplacements += count;
      }
      // Negative lookahead guards against matching only the first 6 hex
      // digits of an 8-digit #RRGGBBAA code (would produce invalid CSS).
      const re = new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![0-9a-fA-F])", "gi");
      if (re.test(newLine)) {
        const count = (newLine.match(re) || []).length;
        newLine = newLine.replace(re, `var(${varName})`);
        fileReplacements += count;
      }
    }
    lines[i] = newLine;
  }
  if (fileReplacements > 0) {
    fs.writeFileSync(abs, lines.join("\n"));
    console.log(`${file}: ${fileReplacements} replacements`);
    totalReplacements += fileReplacements;
  }
}
console.log(`Total: ${totalReplacements} replacements across ${files.length} files checked`);
