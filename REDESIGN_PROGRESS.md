# Dailygenre Redesign — Progress Log

This file tracks a multi-session effort to improve and redesign `dailygenre`
(the original app is `moxed42/dailygenre`; **this repo, `dailygenre-dev`, is a
disposable sandbox** — all work happens here first, verified live, before
anything is ported back to production). If you're picking this up in a new
session, read this file first.

**Nothing has been ported to production yet.** Everything below lives only on
this repo's `main` branch.

## Why a separate dev repo

`dailygenre` is a static, build-free site (vanilla HTML/CSS/JS, no bundler,
no framework) deployed via GitHub Pages "Deploy from a branch" — every push to
`main` goes live within about a minute, with no path filter and no build step
gating it. There's no PR-preview environment. So all iteration happens here on
`dailygenre-dev` (its own GitHub Pages site) first; `assets/js/config.js`'s
`DATA_URL`/`DATA_API_URL`/`WORKER_URL` still point at the real production
repo/Worker for realistic read-only testing, but `doSaveWithPassword()` in
`assets/js/app.js` has a **dev-only guard** at its top that always throws —
this sandbox must never write back to production data. Remove that guard when
porting save-pipeline changes back to production.

## Part 1 — Performance / UX / content pass (done, all shipped)

Nine items, each independently verified (full test suite + `tools/check-build.sh`
+ local static-server/headless-Chromium screenshots) before committing:

1. Removed 3 dead `<script>` tags that 404'd on every load, one unused file,
   two stale JSON snapshots (`genres_data-preserved.json`, `genres_data_test.json`).
2. Trimmed the Visuals screen from ~19 permanent instructional captions to 5
   substantive ones (data-provenance clarifications and a crossover-fit
   threshold definition kept; pure restating captions removed).
3. Deferred all `<script>` tags and the Chart.js CDN tag (first-paint win).
4. Made 3 low-risk CSS files (`genre-identity.css`, `game-room.css`,
   `repair-bay-global-delete.css`) non-blocking via the `media="print"` swap
   trick — verified via grep that none touch the default Spin screen or
   shared/global selectors before doing this.
5. Minified all CSS/JS via `tools/build-min.sh` (terser + csso), ~60% smaller;
   `tools/check-build.sh` gained a section that regenerates each `.min.js`/
   `.min.css` to a temp dir and diffs it against the committed version, so a
   source edit without re-running the minifier fails the build.
6. Accessibility pass: `role="dialog"`/`aria-modal`/focus-trapping on the two
   modals (new shared helper `dgOpenModalA11y()` in `assets/js/utils.js`),
   proper `role="tab"/"tabpanel"`/`aria-selected` on the 5 real
   screen-switching tabs, `aria-live="polite"` on the loading/status pill.
7. Loading/error UI polish: a CSS-only pulse animation while loading
   (`.pill-loading`, respects `prefers-reduced-motion`), a distinct
   `.pill-error` style, and the existing retry/diagnostics panel
   (`assets/js/genre-data.js`) now surfaces immediately on a definitive
   `loadData()` failure instead of waiting through its old 8–20s timer.
8. **Biggest win**: `assets/js/data-cache.js` — caches the ~6MB genre dataset
   in IndexedDB, keyed by the GitHub blob SHA already fetched for freshness
   checks. `loadData()` (in `assets/js/core/data-load.js` after Phase 1) now
   checks the cheap SHA metadata + local cache in parallel *before* paying for
   any full fetch; on a cache hit it skips the Worker/GitHub download
   entirely. Verified end-to-end with Playwright request interception across
   real page reloads: fresh load fetches, same-SHA reload serves from cache
   (fetch count unchanged), SHA-change reload correctly refetches.
9. `github/workflows/pages.yml` (no leading dot) is dead — GitHub Actions
   never ran it; Pages actually deploys via "Deploy from a branch." Confirmed
   with the user via their own Settings → Pages screenshot. Not yet cleaned
   up (still sitting there unused) — a housekeeping item if picked up later.

## Part 2 — Architectural redesign (in progress)

The user asked directly whether the app had been "appropriately redesigned at
a technical level" given its monolithic, patched-over-time character. Honest
answer at the time: no — Part 1 was deliberately scoped as additive
fixes, not a restructuring. This part is that restructuring, explicitly
scoped by the user as **its own effort, separate from Part 1**, to be done
**on this dev repo, in phases, each verified before the next starts.**

An Explore pass cataloged the original `app.js` (10,271 lines, ~455
functions, all sharing one global scope via classic `<script>` tags — no
modules, no bundler) and the ~14 "-polish"/"-hotfix"/versioned patch files
layered on top via monkey-patching (capture `window.someFunction`, reassign
it to a wrapper). That catalog, refined by hands-on discoveries below, drives
the phased plan:

- **Phase 0 (done)** — Characterization tests for the previously
  untested, most-patched-onto code: the router (`switchScreen`), `loadData`,
  spin/genre-selection, and the save pipeline
  (`prepareAndSaveCurrentGenre`→`doSaveWithPassword`→`performSaveWithPassword`→`saveLibraryUpdates`).
  Added `jsdom` as the repo's first devDependency (test-only). Built
  `tests/helpers/app-harness.js`, which loads the *real* source files into a
  shared jsdom `vm` context using the real `index.html` body — exercises
  actual production behavior, not a reimplementation. 25 new tests across 4
  files (`tests/router-switch-screen.test.js`, `tests/spin-genre-selection.test.js`,
  `tests/load-data.test.js`, `tests/save-pipeline.test.js`), all passing.
  **Finding worth remembering**: top-level `let`/`const` in a classic script
  (e.g. `let currentGenre` in `config.js`) are lexical-only and never become
  `window.*` properties — true in a real browser too, not a jsdom quirk. A
  patch file (`listened-history-navigation.js`) reads `window.currentGenre`
  expecting it to reflect state; nothing ever sets it. Real, pre-existing,
  latent bug, left as-is — flagged for whoever eventually touches that file.

- **Phase 1 (done)** — Split `app.js` into cohesive files under
  `assets/js/core/`, same global-scope model, same script load order (no
  behavior change). Mid-extraction, discovered `app.js` is more interleaved
  than the initial catalog suggested: small shared display helpers
  (`songSearchText`, `numericRating`, `artworkHtml`, etc.) sit physically
  *between* the save pipeline and the review-queue/duplicate-guard code, not
  grouped with either. Rather than force a risky non-contiguous
  reorganization, scope was narrowed (confirmed with the user) to the 3
  large, cleanly-bounded, verified-contiguous subsystems:
  - `assets/js/core/data-load.js` (291 lines)
  - `assets/js/core/review-queue.js` (1,846 lines)
  - `assets/js/core/rankings-archive.js` (967 lines)

  `app.js`: 10,271 → 7,167 lines. The remainder is still genuinely tangled
  (screen routing, spin, listen-screen, save pipeline, shared display
  helpers) — untangling *that* is real reorganization, not a mechanical
  split, and is intentionally deferred, not rushed.

  Five pre-existing tests that regex-match raw source text against a
  hardcoded `app.js` path needed a small fix (`tests/helpers/read-app-source.js`,
  concatenates `app.js` + everything under `assets/js/core/`) since the code
  they check moved.

- **Phase 2 (done)** — Relocated the 7 safe/additive patch files out of the
  `-hotfix`/`-vNNN` naming convention into `assets/js/core/`:
  `song-import-hotfix.js`→`core/song-import-fixes.js`,
  `layout-fixes-v267.js`→`core/listen-library-layout-fixes.js`, plus
  `similar-genres.js`, `genre-description-placement.js`,
  `library-parent-category-filter.js`, `listened-history-navigation.js`,
  `game-room.js` (renamed path only, same filename).
  **Correction to the original plan**: these could *not* simply be merged
  into the Phase 1 `core/*.js` files, because those load *before* `app.js`
  (`data-load.js`'s `loadData` must exist before `app.js`'s own `bootApp()`
  call uses it) while these patch files must keep loading *after* `app.js` —
  traced real cross-file dependencies first (`listening-room.js` depends on
  things two of these files define; `song-identity-roles.js`/`studio-polish.js`/
  `songs.js` depend on things `song-import-fixes.js` overrides, specifically
  `parseSongLinks`, `buildSongsBulkEditorText`, `songIdentity`, and the save
  pipeline's `confirmProductionSaveAfterNetworkError`). Each relocated file
  kept its *exact* relative script-tag position in `index.html` — true
  mechanical relocation, zero behavior change.
  **Also discovered**: `song-import-hotfix.js` (now `core/song-import-fixes.js`)
  is more invasive than the original catalog said — it monkey-patches 4
  functions via an `installGlobal` helper, not just 1. Doesn't change the
  safety of relocating it, but matters for Phase 3.

  Verified: all 119 tests pass, `check-build.sh` passes, live-browser pass
  confirmed Archive/Library, a genre detail page (Genre DNA definition card,
  "Check for similar genres"), and Game Room all work identically.

### Phase 3 — in progress

**First step (done)** — Added a shared post-render hook registry to
`assets/js/utils.js` (`dgRegisterPostHook`/`dgRunPostHooks`): a base function
calls `dgRunPostHooks('name', ...)` once at its own natural end (every exit
path, not just the common one), and anything that wants to react registers a
callback instead of capturing `window.someFunction` and reassigning it.
Wired into `switchScreen`, `openGenreDetail`, and `loadListenScreen` (all in
`app.js`). Converted `library-polish.js`'s wrap of those same 3 functions to
use the registry instead — one monkey-patch layer removed. Also discovered
its 4th wrap target, `renderListenDetails`, was never a real function
anywhere in the codebase (dead code, dropped). Relocated
`genre-identity-alias-editor.js` → `core/genre-identity-alias-editor.js` too
— turned out to override nothing at all, so it needed a Phase-2-style move,
not a hook conversion.

Two other files (`genre-identity.js`, `songs.js`) still wrap these same 3
functions the old way — intentionally untouched this round; verified the new
hooks still fire correctly through their wrap chains since they all call
through to "the original" before doing their own thing.

**Still remaining** — the harder, higher-value conversions:
- `genre-identity.js` — wraps the router (`switchScreen`) itself, plus
  `openGenreDetail`, `renderHistory`, `searchGenresInto`,
  `dgStatsGenreFocusCandidates`.
- `song-identity-roles.js` — chains onto **7 functions**, most of them the
  entire save pipeline: `applySongsBulkAndSave`, `buildSongsBulkEditorText`,
  `doSaveWithPassword`, `filterNewSongsAlreadyRepresentedByGenreIdentity`,
  `finalizeListeningUpdatesBeforeSave`, `normalizeSongsListened`,
  `overwriteSongsBulkAndSave`, `parseSongLinks`, `prepareAndSaveCurrentGenre`,
  `saveLibraryUpdates`. Highest blast radius of any remaining file.
- `songs.js` — wraps `loadListenScreen` (already hook-enabled, so converting
  this file just means swapping its wrap for a registration) and
  `setSongReaction`.
- `listening-room.js` — wraps `filterGenres`, `openCrateDig`,
  `openRandomListenedGenre` (and depends on `filterGenresForArchive`/
  `openAdjacentGenre`, which `library-parent-category-filter.js`/
  `listened-history-navigation.js` define — a real cross-file dependency
  traced during Phase 2, must keep working).
- `studio-polish.js` — wraps `renderReview`.
- `ranks-polish.js` — wraps `renderRankings`, `moveRank`.
- `repair-bay-global-delete.js` — mostly defines new destructive-delete
  handlers rather than overriding existing ones; lower priority to convert.
- `visuals.js` (2,824 lines) — turned out to override **nothing** on
  inspection (only defines one new diagnostic global) — not really Phase-3
  material at all, more a Phase-1-style "this file is huge, could be split
  later" candidate. Deprioritized.

**Remaining phases after Phase 3**:

- **Phase 3 (continued)** — Convert the harder files listed above, one at a
  time, each with its own before/after characterization-test pass extending
  Phase 0's suite, starting with the lowest-blast-radius file
  (`studio-polish.js`/`ranks-polish.js`) and ending with the two riskiest
  (`song-identity-roles.js`, `genre-identity.js`).
- **Phase 4 (optional)** — Real ES module boundaries (`<script type="module">`,
  explicit `export`/`import`) once Phase 3's hook pattern has replaced the
  reassignment-based patches. GitHub Pages serves ES modules natively, no
  bundler needed. Evaluate after Phase 3, not a commitment made now.
- **Phase 5** — UX/visual redesign: mobile-friendly, consistent across
  desktop browsers. The user explicitly gave creative latitude here (layout,
  spacing, even color/typography can change if it improves usability) —
  **with one hard constraint, verbatim from the user**: the Spin screen's
  horizontal slot-machine-style spinner must remain — similar in spirit to
  "Jimmy Fallon's Wheel of Musical Mashups" but horizontal, not a circular
  wheel, with adjacent genre names visible scrolling past during the spin
  (not just the final result popping up with no sense of motion). The visual
  styling can change; that horizontal-strip-with-visible-neighbors mechanic
  cannot go away.

### Then, whenever the redesign work is deemed ready

**Port everything back to `moxed42/dailygenre`** (branch
`claude/github-daily-genre-context-lc5xej`): re-apply the verified diffs,
remove the dev-only save-flow guard in `doSaveWithPassword()`, and follow
production's real `?v=build-vNNN` cache-bust bump convention (checked by
`tools/check-build.sh`) so the Pages deploy actually picks up the change.
Nothing from Part 1 or Part 2 has been ported yet.

## How to verify anything in this repo

- `npm test` (`node --test tests/*.test.js`) — 119 tests as of Phase 2.
- `bash tools/check-build.sh` — syntax check, minified-asset sync, JSON
  validity, cache-bust consistency.
- Local static-server + headless-Chromium screenshots is the standard way
  to visually verify changes in this environment, since the sandbox can't
  reach the live `dailygenre-dev` Pages URL directly (org network policy
  blocks `*.github.io`): `npx http-server -p <port> -c-1 .` from the repo
  root, then drive it with Playwright
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `NODE_PATH=/opt/node22/lib/node_modules`)
  — mock the Worker/GitHub API endpoints via `page.route()` since the sandbox
  has no real network access to them either.
