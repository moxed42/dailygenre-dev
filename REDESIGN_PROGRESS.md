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

**Second step (done)** — Surveyed every remaining patch file's *actual wrap
body*, not just which functions it touches — this mattered a lot: counting
overrides was a poor proxy for conversion difficulty. Found 3 distinct
wrapping shapes:
1. **Simple post-hook** — call the original unconditionally, then do extra
   work. Directly convertible.
2. **Before-and-after wrap** — does real work both before *and* after
   calling the original. Not convertible with a post-hooks-only registry;
   needs a pre-hook mechanism too (not built yet).
3. **Early-exit guard / full replacement** — sometimes skips calling the
   original entirely, or reimplements the whole thing rather than wrapping
   it. Not a hook-registry candidate at all; would need bigger surgery.

Converted 2 of `genre-identity.js`'s wraps (both shape 1, both already
hook-enabled from the first step): `switchScreen` (pushes browser history
after a successful screen switch) and `loadListenScreen` (injects the Genre
DNA card, via `patchListenLoadForDna`). Verified live, including the
trickier back-button path: click Library → Ranks → browser Back correctly
pops the `#screen=` hash *and* switches the screen back (the `popstate`
handler still calls `switchScreen`, which still fires the converted hook).
Left `genre-identity.js`'s other 2 wraps (`openGenreDetail` — shape 2,
does pushState *before* calling original and replaceState *after*;
`renderHistory` — shape 1, but `renderHistory` isn't hook-enabled yet since
it lives in `core/rankings-archive.js`) and `dgStatsGenreFocusCandidates`
untouched.

**Classified the rest while investigating**:
- `studio-polish.js`'s wrap of `renderReview` is **shape 3** — an early-exit
  branch skips calling the original entirely while Studio's text/paste
  guard is active, running its own `apply()` instead. Not a simple
  conversion; would change real behavior if done naively.
- `ranks-polish.js`'s wraps of `renderRankings`/`moveRank` are closer to
  **shape 3** too — `renderRankingsPolished` is a full reimplementation, not
  a thin wrapper around the original.
- `song-identity-roles.js` — chains onto **7 functions**, most of them the
  entire save pipeline (`applySongsBulkAndSave`, `buildSongsBulkEditorText`,
  `doSaveWithPassword`, `filterNewSongsAlreadyRepresentedByGenreIdentity`,
  `finalizeListeningUpdatesBeforeSave`, `normalizeSongsListened`,
  `overwriteSongsBulkAndSave`, `parseSongLinks`, `prepareAndSaveCurrentGenre`,
  `saveLibraryUpdates`) — not yet individually classified by shape; highest
  blast radius of any remaining file, inspect each wrap body before touching
  anything here.
- `songs.js` — wraps `loadListenScreen` and `setSongReaction`. Both were
  shape 2 (before+after) — **converted in the third step, see below**.
- `listening-room.js` — wraps `filterGenres`, `openCrateDig`,
  `openRandomListenedGenre`; shape not yet checked. Also depends on
  `filterGenresForArchive`/`openAdjacentGenre`, which
  `library-parent-category-filter.js`/`listened-history-navigation.js`
  define — a real cross-file dependency traced during Phase 2, must keep
  working regardless of what happens here.
- `repair-bay-global-delete.js` — mostly defines new destructive-delete
  handlers rather than overriding existing ones; lower priority to convert.
- `visuals.js` (2,824 lines) — overrides **nothing** on inspection (only
  defines one new diagnostic global) — not really Phase-3 material at all,
  more a Phase-1-style "this file is huge, could be split later" candidate.
  Deprioritized.

**Third step (done)** — Added the pre-hook counterpart
(`dgRegisterPreHook`/`dgRunPreHooks`, same file) to handle shape-2 wraps: a
base function calls `dgRunPreHooks('name', ...)` as its literal first line
(unconditionally, before any of its own guard/early-return logic), and
`dgRunPostHooks(...)` at each exit point as before. The registry doesn't
correlate a pre/post pair itself — passing state from a pre-hook to its
matching post-hook is the registrant's own job (a small stack/array works
well, since pre/post for one invocation always fire back-to-back within
that invocation's own synchronous call, even when the actual visual effect
is `setTimeout`-deferred — so a stack handles reentrant calls correctly).

Wired `dgRunPreHooks` into `openGenreDetail`, `loadListenScreen`, and
`setSongReaction` (all in `app.js` — the last of these wasn't hook-enabled
at all before this, so it got both pre- and post-hook calls added at every
exit path). Converted all 3 shape-2 wraps identified so far:
- `genre-identity.js`'s `openGenreDetail` wrap (pushState before,
  replaceState after — now a pre-hook and a post-hook).
- `songs.js`'s `loadListenScreen` wrap (scroll-position capture/restore
  around the song-carousel enhancement).
- `songs.js`'s `setSongReaction` wrap (anchor-position/scroll capture and
  restore around a reaction toggle, so the viewport doesn't jump when the
  song list re-renders).

Verified live: genre-detail opening still pushes the right `#genre=` hash
and shows the DNA card; clicking a song's reaction control still shows the
"Reaction selected" toast and the unsaved-changes panel with no console
errors — the full pre-hook → base logic → post-hook chain works for all 3.

**Fourth step (done)** — Converted `renderHistory`'s wrap. Added
`dgRunPostHooks('renderHistory', options)` to all 3 of `renderHistory`'s
exit points in `core/rankings-archive.js` (the "no list element" guard, the
"no matching entries" empty state, and the normal fall-through — the old
wrap only cared about the return value, not which internal branch produced
it, so the hook needed to fire in every case, not just the common one).
`genre-identity.js`'s `patchLibraryAliasFallback()` no longer reassigns
`window.renderHistory`; it registers a post-hook doing the identical
alias-fallback retry (temporarily swap the search box to a matched alias's
canonical genre name, re-render, restore). That retry now calls
`window.renderHistory()` directly (there's no more pre-wrap "original" to
fall back to) — traced through deliberately: the nested call's own post-hook
invocation sees `.archive-card` already populated and returns immediately,
so it doesn't recurse further. Confirmed no other file wraps `renderHistory`.
Verified: 119/119 tests (one unrelated pre-existing rAF-timing flake
reproduced and cleared on re-run, as in earlier phases), `check-build.sh`
passes, live local-server + headless-Chromium pass confirmed the Archive
screen renders all entries and a search term ("hip hop") correctly filters
the list with no console errors.

**Fifth step (done) — the save pipeline** (`song-identity-roles.js`, the
highest-blast-radius file): its wrap shapes turned out to be genuinely
different from everything converted so far, and not all expressible with
the existing pre/post hook registries. Full survey of its 9 overridden
functions:

- `normalizeSongsListened`: calls through to the original, then
  *transforms* the result (stamps role fields onto each item). A plain
  post-hook can't replace a return value — but since the transform only
  *mutates* the already-built array's objects in place (never reassigns
  it), passing that same array by reference into a post-hook works
  identically: it now does `dgRunPostHooks('normalizeSongsListened',
  normalized, source)` right before returning `normalized`, and the
  registered hook mutates items in place exactly as the old wrap did.
- `finalizeListeningUpdatesBeforeSave`: real work both before and after an
  unconditional call — a clean pre/post hook pair, no state hand-off needed
  since both sides just re-fetch `currentGenreValue()` themselves.
- `filterNewSongsAlreadyRepresentedByGenreIdentity`: a genuine conditional
  **bypass** — when queue roles are active, it returns a different value
  instead of running the base's own de-dup logic at all, not around it. No
  existing hook shape can express "skip the base and substitute this
  value", so this added a **third hook registry**:
  `dgRegisterOverrideHook`/`dgRunOverrideHooks` in `utils.js`. A base
  function calls `dgRunOverrideHooks('name', ...args)` as its literal first
  line; if any registered hook returns a truthy `{ result }` object, the
  base returns `override.result` immediately without running its own logic.
  An override hook that doesn't want to intervene returns `undefined` so
  the base runs normally. Unlike post-hooks, an override hook's exceptions
  are NOT swallowed — a hook can throw deliberately to make the base
  function itself throw, exactly like a wrap that threw before calling the
  original.
- `applySongsBulkAndSave`, `prepareAndSaveCurrentGenre`, `saveLibraryUpdates`,
  `doSaveWithPassword`: all 4 share the same shape — validate the pasted
  song block first, and if it fails, abort *before* the base's own logic
  runs at all (3 return `false`, `doSaveWithPassword` throws a
  `USER_CANCELLED` error). Each now registers an override hook doing that
  exact gate-then-side-effect (`validateAndApproveCurrentBlock()` +
  `markQueueModeFromTextarea()`), returning `undefined` to let the base
  proceed once the gate passes.
- `doSaveWithPassword` additionally used to reset `approvedSignature = ''`
  in a `finally` wrapped around the *entire* original call (join-in-flight
  branch, the real save attempt, success or failure) — not expressible from
  an override hook, which only runs before the base logic. `doSaveWithPassword`
  in `app.js` now has its own outer `try/finally` calling
  `dgRunPostHooks('doSaveWithPassword')` once the whole attempt has settled
  (the join-in-flight branch now does `return await productionSaveRequestInFlight`
  instead of a bare `return`, so the finally's timing matches the old wrap's
  `await` exactly), and `song-identity-roles.js` registers the signature
  reset as a post-hook.
- `parseSongLinks` and `buildSongsBulkEditorText`: **not wraps at all** —
  there's no "original" being extended, these two fully own the bulk-editor
  text format (including the SEMINAL/MEDIA role columns) and always have.
  Left as direct `installGlobal()` calls; the hook registry is for adding
  behavior around an existing base implementation, and there isn't one here
  to hook onto.
- `overwriteSongsBulkAndSave`: used to need its own reassignment purely to
  call the *patched* `applySongsBulkAndSave` instead of the plain one. Now
  that the gate lives inside `applySongsBulkAndSave` itself, `app.js`'s own
  `window.overwriteSongsBulkAndSave` already calls through correctly, so
  this reassignment was deleted outright rather than converted.

Confirmed no other file wraps any of these 9 functions (only plain callers
elsewhere, e.g. `onclick="saveLibraryUpdates()"` in album-dive.js/
ranks-polish.js/studio-polish.js, and genre-identity.js calling it directly
— none reassign it).

New tests: `tests/save-pipeline-queue-roles.test.js` (6 tests), using a new
`extraScripts` option added to `tests/helpers/app-harness.js` (Phase 0's
harness deliberately only loaded files up to `app.js`; this option lets a
specific test layer a post-`app.js` patch file on top, e.g.
`song-identity-roles.js`, without changing the shared `SCRIPT_ORDER` every
other test relies on). Covers: a 2×SEMINAL conflict blocking
`applySongsBulkAndSave` with the same alert as before; a valid block passing
the gate and marking `identityQueueRolesEnabled`; `doSaveWithPassword`'s
own dev-sandbox guard still firing first (the queue-roles gate itself isn't
independently reachable from this sandbox, since the unconditional
`DEV_SANDBOX_SAVE_DISABLED` throw comes first — same as before this
conversion); `normalizeSongsListened` still stamping role fields in place;
and `filterNewSongsAlreadyRepresentedByGenreIdentity` both bypassing and
falling through correctly depending on queue-role state.

Verified: 125/125 tests pass, `check-build.sh` passes, and a live
local-server + headless-Chromium pass against the real song bulk editor
confirmed: a 2×SEMINAL block still triggers the exact same
"Song block cannot be saved yet... More than one SEMINAL row is present"
alert and `applySongsBulkAndSave` resolves to `false` without reaching the
real save pipeline; a corrected (1×SEMINAL) block passes the gate with no
alert, `identityQueueRolesEnabled` gets set to `true` on the genre, and
execution proceeds into the real `prepareAndSaveCurrentGenre` chain with no
console errors.

**Sixth step (done) — `listening-room.js`**: surveyed its wraps (4 total,
more than the original 3-function catalog said) and found one of them is
dead code:
- `installSearchNormalization()`'s wrap of `filterGenresForArchive` —
  investigated the "depends on `filterGenresForArchive`/`openAdjacentGenre`
  from Phase 2" note from the earlier survey. `openAdjacentGenre` is real
  and live (defined in `app.js`, overridden by
  `core/listened-history-navigation.js`, called from real `onclick`
  handlers) — no issue there. But `filterGenresForArchive` itself has **no
  base definition anywhere in the entire codebase** — grepped every
  `assets/js/*.js` and `assets/js/core/*.js` file for a function
  declaration, a `window.filterGenresForArchive =` assignment, or even a
  single call site, and found none. Both files that "wrap" it
  (`listening-room.js` here, and `core/library-parent-category-filter.js`
  from Phase 2) guard with `typeof filterGenresForArchive === 'function'`
  before wrapping, which is never true — so both wraps are permanently
  inert no-ops today. Left untouched (nothing to convert; no live behavior
  to preserve or risk). Same category of finding as `renderListenDetails`
  in Phase 3's first step.
- `installRouteAwareness()`'s wraps of `openCrateDig` and
  `openRandomListenedGenre` — real, shape-1-ish "before" wraps (`DC.crateDigIntent
  = true` set before calling the original, nothing after). Converted:
  added `dgRunPreHooks('openCrateDig', event)` /
  `dgRunPreHooks('openRandomListenedGenre')` to the base functions in
  `app.js`, and registered pre-hooks in `listening-room.js` instead of
  reassigning. `openCrateDig` calls `openRandomListenedGenre()` internally,
  so both pre-hooks fire on a Crate Dig click (same harmless double-set of
  the same flag the old double-wrap already did).
- `installLoadWrapper()`'s wrap of `loadListenScreen` — a real shape-2 wrap
  (`ensureListenModeClasses()` before, a `setTimeout`-deferred
  enhance+restructure after) that I'd missed in the original catalog.
  `loadListenScreen` was already hook-enabled (from `songs.js`'s Phase 3
  conversion), so this converted directly: `ensureListenModeClasses()`
  became a pre-hook, the deferred enhancement became a post-hook.

New tests: `tests/listening-room-hooks.test.js` (4 tests, using the same
`extraScripts` harness option from the fifth step). Verified: 129/129 tests
pass, `check-build.sh` passes, and a live local-server + headless-Chromium
pass confirmed clicking the Dig tab's Crate Dig button opens a new random
listened genre (document title changed), with both `listen-experience-mode`
and `dc-discovery-console` CSS classes applied and no console errors.

**Natural next steps for whoever continues this**:
1. The two shape-3 files (`studio-polish.js`'s early-exit guard,
   `ranks-polish.js`'s full-reimplementation of `renderRankings`/`moveRank`)
   are what's left of the hard cases. The new override-hook registry
   (`dgRegisterOverrideHook`/`dgRunOverrideHooks`, added this step) is very
   likely the right tool for `studio-polish.js`'s conditional early-exit —
   check that first before reaching for anything new. `ranks-polish.js`'s
   *full reimplementation* (not a wrap around any original at all) is closer
   to `parseSongLinks`/`buildSongsBulkEditorText` above: it may not need
   converting at all, just confirming it's a direct-ownership case like
   those two rather than something that should be hook-ified.

**Remaining phases after Phase 3**:

- **Phase 3 (continued)** — Convert the two remaining shape-3 files
  (`studio-polish.js`/`ranks-polish.js`), each with its own before/after
  characterization-test pass extending Phase 0's suite. Every other file
  originally called out (`genre-identity.js`, `song-identity-roles.js`,
  `listening-room.js`) is now fully converted (or, for the one genuinely
  dead wrap found in `listening-room.js`, confirmed to need no conversion).
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

- `npm test` (`node --test tests/*.test.js`) — 129 tests as of Phase 3's
  sixth step.
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
