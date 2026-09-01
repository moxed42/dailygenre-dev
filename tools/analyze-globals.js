#!/usr/bin/env node
// One-off analysis tool for the Phase 4 ES-module conversion. Not shipped,
// not part of check-build.sh. For each script (in real load order), finds
// which top-level names it defines and which names, defined by an EARLIER
// file, it references -- the info needed to write import/export statements.
"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");

const LOAD_ORDER = [
  "assets/js/utils.js",
  "assets/js/data-cache.js",
  "assets/js/config.js",
  "assets/js/genre-data.js",
  "assets/js/spotify.js",
  "assets/js/album-dive.js",
  "assets/js/normalize.js",
  "assets/js/library-index.js",
  "assets/js/song-index.js",
  "assets/js/song-reaction.js",
  "assets/js/performance.js",
  "assets/js/screen-cache.js",
  "assets/js/listen-screen-cache.js",
  "assets/js/archive-view-model-cache.js",
  "assets/js/archive-render-reuse.js",
  "assets/js/core/review-queue.js",
  "assets/js/core/rankings-archive.js",
  "assets/js/core/data-load.js",
  "assets/js/archive-progressive.js",
  "assets/js/app.js",
  "assets/js/core/song-import-fixes.js",
  "assets/js/studio-polish.js",
  "assets/js/genre-identity.js",
  "assets/js/song-identity-roles.js",
  "assets/js/core/genre-identity-alias-editor.js",
  "assets/js/core/genre-description-placement.js",
  "assets/js/core/listened-history-navigation.js",
  "assets/js/core/library-parent-category-filter.js",
  "assets/js/songs.js",
  "assets/js/listening-room.js",
  "assets/js/library-polish.js",
  "assets/js/visuals.js",
  "assets/js/ranks-polish.js",
  "assets/js/core/listen-library-layout-fixes.js",
  "assets/js/core/similar-genres.js",
  "assets/js/core/game-room.js",
  "assets/js/repair-bay-global-delete.js",
];

function topLevelDeclaredNames(ast) {
  const names = new Set();
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" && node.id) names.add(node.id.name);
    else if (node.type === "ClassDeclaration" && node.id) names.add(node.id.name);
    else if (node.type === "VariableDeclaration") {
      for (const decl of node.declarations) collectPatternNames(decl.id, names);
    }
  }
  return names;
}

function collectPatternNames(pat, names) {
  if (!pat) return;
  if (pat.type === "Identifier") names.add(pat.name);
  else if (pat.type === "ArrayPattern") pat.elements.forEach((e) => collectPatternNames(e, names));
  else if (pat.type === "ObjectPattern")
    pat.properties.forEach((p) => collectPatternNames(p.value || p.argument, names));
  else if (pat.type === "AssignmentPattern") collectPatternNames(pat.left, names);
  else if (pat.type === "RestElement") collectPatternNames(pat.argument, names);
}

// Walk the whole AST collecting every Identifier reference EXCEPT:
// - property keys (obj.foo, {foo: 1})
// - identifiers that are themselves being declared (handled by scope tracking is
//   overkill for this use case -- we just want "does this bare name appear as a
//   value anywhere", then subtract known local params/vars per top-level function
//   approximately by just also collecting all declared names anywhere in the file
//   (function params, inner vars, catch bindings) and excluding those too, since a
//   local shadow means it's NOT a cross-file reference).
function allReferencedAndLocallyDeclaredNames(ast) {
  const referenced = new Set();
  const locallyDeclared = new Set();

  function visit(node, parent) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "Identifier":
        if (parent) {
          if (
            (parent.type === "MemberExpression" && parent.property === node && !parent.computed) ||
            (parent.type === "Property" && parent.key === node && !parent.computed) ||
            (parent.type === "MethodDefinition" && parent.key === node && !parent.computed) ||
            ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") && parent.id === node) ||
            (parent.type === "ClassDeclaration" && parent.id === node) ||
            (parent.type === "LabeledStatement" && parent.label === node) ||
            (parent.type === "BreakStatement" && parent.label === node) ||
            (parent.type === "ContinueStatement" && parent.label === node)
          ) {
            break;
          }
        }
        referenced.add(node.name);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        if (node.id) locallyDeclared.add(node.id.name);
        node.params.forEach((p) => collectPatternNames(p, locallyDeclared));
        break;
      case "VariableDeclarator":
        collectPatternNames(node.id, locallyDeclared);
        break;
      case "CatchClause":
        if (node.param) collectPatternNames(node.param, locallyDeclared);
        break;
    }
    for (const key in node) {
      if (key === "parent") continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) if (child && typeof child.type === "string") visit(child, node);
      } else if (val && typeof val.type === "string") {
        visit(val, node);
      }
    }
  }
  visit(ast, null);
  return { referenced, locallyDeclared };
}

const fileInfo = {};
for (const rel of LOAD_ORDER) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: "script" });
  } catch (e) {
    console.error(`PARSE ERROR in ${rel}: ${e.message}`);
    process.exit(1);
  }
  const topLevel = topLevelDeclaredNames(ast);
  const { referenced, locallyDeclared } = allReferencedAndLocallyDeclaredNames(ast);
  fileInfo[rel] = { topLevel, referenced, locallyDeclared };
}

// Build: name -> file that first declares it at top level (load order = definition order)
const definedBy = new Map();
for (const rel of LOAD_ORDER) {
  for (const name of fileInfo[rel].topLevel) {
    if (!definedBy.has(name)) definedBy.set(name, rel);
  }
}

// For each file, find referenced names that are (a) not locally declared/shadowed
// in that file, (b) not its own top-level declaration, (c) defined by some OTHER file.
console.log("# Cross-file dependency report (name: referencing-file <- defining-file)\n");
for (const rel of LOAD_ORDER) {
  const info = fileInfo[rel];
  const needed = new Set();
  for (const name of info.referenced) {
    if (info.topLevel.has(name)) continue;
    if (info.locallyDeclared.has(name)) continue;
    const def = definedBy.get(name);
    if (def && def !== rel) needed.add(name + " <- " + def);
  }
  if (needed.size) {
    console.log(`## ${rel}`);
    for (const n of [...needed].sort()) console.log("  " + n);
    console.log("");
  }
}
