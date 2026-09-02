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

**Seventh step (done) — `studio-polish.js`'s `renderReview` wrap**:
confirmed the override-hook registry (added for the save pipeline) was
exactly the right tool. `renderReview()` (`core/review-queue.js`) now calls
`dgRunOverrideHooks('renderReview')` as its literal first line — if
Studio's text/paste guard is active, the registered override hook does the
old early-exit's exact work itself (`captureInboxDraft()` → `apply()` →
`restoreInboxDraft(draft)`) and returns `{ result: null }`, so the base
never runs its own render logic at all, matching the original bypass
exactly. Otherwise the override hook returns `undefined` and the base
proceeds through its now-added `dgRunPreHooks`/`dgRunPostHooks` calls (at
both of its exit points — the "no mount" early return and the normal
fall-through). `studio-polish.js` registers a pre-hook (capture the inbox
draft + section state, add the `studio-rendering` class) and a post-hook
(the mobile-deferred-or-immediate `finishApply()`), handing state between
them with the same small-stack pattern used for the shape-2 conversions
earlier in Phase 3.

New tests: `tests/studio-polish-render-review.test.js` (2 tests) — one
confirming the normal path still produces the base's own markup
(`.review-stat-grid`) alongside Studio's `apply()` output
(`.studio-workbench`), one confirming the bypass path (Studio text entry
active) skips the base's markup entirely while `apply()` still runs.
Verified: 131/131 tests pass, `check-build.sh` passes, and a live
local-server + headless-Chromium pass confirmed the normal Studio/Review
render (stat grid, hero, workbench class, no console errors) — the
text-entry-bypass path is real-browser-timing-sensitive to reproduce
externally (a focused textarea can lose focus to Studio's own periodic
re-render before the check runs) so it's covered by the jsdom test instead,
which controls focus deterministically.

**Eighth step (done) — `ranks-polish.js`, the last file — Phase 3 is
complete**: read the actual wrap bodies rather than assuming the earlier
classification, same discipline as every step before this one:
- `renderRankings` — confirmed genuinely a **full reimplementation**.
  `originalRenderRankings` is captured but grepped and traced through the
  whole file: it's never called anywhere. `renderRankingsPolished` doesn't
  extend a base, it fully replaces it — same direct-ownership shape as
  `parseSongLinks`/`buildSongsBulkEditorText` in `song-identity-roles.js`.
  Left `window.renderRankings = renderRankingsPolished` exactly as it was;
  nothing to convert.
- `moveRank` — the opposite: a genuine plain post-only wrap.
  `moveRankPolished` always called the captured `originalMoveRank`
  unconditionally, then did `markRanksDirty(...)` + a re-render. Converted:
  `moveRank` (`core/rankings-archive.js`) now calls
  `dgRunPostHooks('moveRank', id, direction)` at all 3 of its exit points
  (both early-return guards plus the natural end — matching the old wrap's
  "fires no matter which branch the base took" behavior, the same pattern
  used for `renderHistory` and `setSongReaction` earlier in this phase).
  `ranks-polish.js` registers a post-hook doing the identical
  `markRanksDirty`/re-render instead of reassigning `window.moveRank`. Also
  simplified a rank-move button's click handler, which used to duplicate
  `markRanksDirty`/`renderRankingsPolished` calls manually as a fallback in
  case the wrap hadn't installed yet — now it just calls
  `window.moveRank(id, dir)` directly, which is always the real,
  hook-enabled function.

New tests: `tests/ranks-polish-move-rank.test.js` (3 tests). Verified:
134/134 tests pass, `check-build.sh` passes, and a live local-server +
headless-Chromium pass against the real Ranks screen confirmed clicking (and
directly calling) `moveRank` both on a genuine swap (rank_order visibly
changes between two real genres in the same tier) and at a tier boundary
(no-op) correctly shows the "Rank order updated..." toast either way, with
no console errors.

**Phase 3 is now complete.** Every patch file originally cataloged
(`library-polish.js`, `genre-identity.js`, `genre-identity-alias-editor.js`,
`songs.js`, `song-identity-roles.js`, `listening-room.js`,
`studio-polish.js`, `ranks-polish.js`) has been converted from
monkey-patching to the hook registry, or — for the handful of cases that
turned out not to be wraps at all (`parseSongLinks`/`buildSongsBulkEditorText`
in `song-identity-roles.js`, `renderRankingsPolished` in `ranks-polish.js`,
and one dead wrap of `filterGenresForArchive` found in both
`listening-room.js` and `core/library-parent-category-filter.js`) —
confirmed and left as direct ownership rather than forced into a hook shape
that wouldn't fit. `repair-bay-global-delete.js` and `visuals.js` were
deprioritized early on (mostly define new handlers/diagnostics rather than
overriding existing ones) and were never revisited — a reasonable stopping
point, but worth a final grep-for-`window\.\w+\s*=` pass before calling the
whole codebase reassignment-free.

**Natural next steps for whoever continues this**:
1. Optionally sweep `repair-bay-global-delete.js` and `visuals.js` for any
   overrides that got missed — they were deprioritized rather than
   confirmed clean.
2. Phase 4 was evaluated and declined — see below. Part 2 (the architectural
   redesign) is considered **complete as of Phase 3**. Phase 5 is next.

### Phase 4 — evaluated, declined

Investigated properly (an AST-based cross-file dependency analyzer,
`tools/analyze-globals.js`, added as a one-off tool using `acorn` — a
second test-only devDependency alongside `jsdom`) before writing any
conversion code. Two findings killed it:

1. This codebase's dependency graph is genuinely **circular**, not a DAG —
   `app.js` calls into `spotify.js`/`review-queue.js`/`rankings-archive.js`,
   which call back into `app.js` (which loads after them). Real ES modules
   resolve imports statically and evaluate the graph in dependency order;
   with cycles this deep plus top-level side-effecting code (`bootApp()`
   runs immediately at module scope), a full conversion risks silently
   reordering initialization.
2. A safer-looking scoped subset (13 files with an acyclic dependency
   prefix: `utils.js`, `normalize.js`, `data-cache.js`, `performance.js`,
   `screen-cache.js`, `listen-screen-cache.js`, `song-index.js`,
   `library-index.js`, `song-reaction.js`, `archive-view-model-cache.js`,
   `archive-render-reuse.js`, `config.js`, `genre-data.js`) doesn't hold up
   either, for the opposite reason in each half:
   - 10 of those files (`normalize.js` through `archive-render-reuse.js`)
     are already self-contained IIFE modules exposing one namespaced
     `window.DailyGenreXxx` object each, with dedicated CommonJS
     `require()`-based unit tests. They're already architecturally sound —
     converting their syntax to real `export`/`import` would gain nothing
     and would break those 10 test files (Node treats a `.js` file with
     `export` syntax as a CommonJS syntax error unless the whole package
     is declared an ES module, which would break every other classic-script
     test too).
   - `utils.js` and `config.js` are the opposite: `config.js` alone declares
     ~48 top-level `let`/`const` bindings (`genres`, `currentGenre`,
     `archiveView`, `libraryUpdatesPending`, etc.) read *and reassigned* as
     bare identifiers from dozens of places across `app.js` and every patch
     file — relying on shared lexical scope, the same "lexical, not
     `window.*`" behavior Phase 0 already flagged. Making `config.js` a real
     module would break every classic-script call site that does
     `genres = x` or reads `currentGenre` bare, since modules don't share
     lexical scope with classic scripts. Fixing that means rewriting every
     such call site to explicit getters/setters — a large, high-risk,
     behavior-changing effort on its own, not a mechanical Phase 4 step.

**Decision (confirmed with the user)**: decline Phase 4 outright rather than
ship a cosmetic no-op (the 10 IIFE files) or a disguised high-risk rewrite
(the `config.js`/`utils.js` state model). The benefit — mostly
readability/tooling for a solo-maintained static site with no build step —
doesn't justify a refactor of comparable size to Phases 0–3 combined. If
ever revisited, it would need to start with replacing `config.js`'s bare
`let`/`const` globals with explicit getter/setter functions first (its own
characterization-test pass, same discipline as Phase 0), as a prerequisite
before any module boundary could be drawn around it.

**Remaining phases**:

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

  **Foundation work (done)**:
  - **Design tokens** (`d396f73`): consolidated 313 hardcoded hex colors
    across 6 CSS files into `var(--token)` references against the existing
    Retro Hi-Fi `:root` token set — a pure de-duplication refactor
    (`tools/consolidate-tokens.js`), byte-identical rendered colors, verified
    live. Also removed the specific spinner CSS properties in `styles.css`
    that were fully dead (shadowed by the later Retro Hi-Fi rules on the
    same selectors), keeping every still-live layout property intact.
  - **Breakpoint scale — documented, not retrofitted**: investigating
    turned up ~28 distinct breakpoint widths in use across the CSS files
    (460–1120px), each tuned ad hoc per-component with no shared scale ever
    established. Forcing them all onto one scale isn't a value-preserving
    refactor like the token pass — it risks shifting real layout behavior
    at those exact viewport widths, across files including the
    10,534-line `library-polish.css`, which would need a full
    component-by-component re-verification pass to be safe. Decided (with
    the user) not to retrofit existing breakpoints. Instead, a 3-tier scale
    (480px phone / 768px tablet / 1024px constrained desktop) is documented
    as a convention in `styles.css` (right after the `:root` token block) —
    any CSS written or substantially reworked as part of the rest of Phase 5
    should use it instead of picking a new ad hoc value; existing working
    breakpoints are left alone unless the screen they belong to is being
    actively redesigned anyway (at which point they get modernized as part
    of that pass, verified live at the time).

  **Screen-by-screen pass (in progress, going in tab order)**:
  - **Spin (`e0c7337`)**: the horizontal spinner mechanic itself was already
    solid (already a flexed, overflow-clipped chip strip; touch targets on
    SPIN/toggle buttons already ~44-45px). The one real bug, found via live
    screenshots: `.spinner-marker` was a full-height vertical bar dead-center
    in the window, so it sliced through the text of whatever chip settled
    there every time. Redesigned as a pair of small carets pinned to the
    window's top/bottom edges, leaving the resting chip's text clear.
  - **Today (`c67343f`)**: live screenshots at phone width surfaced two real
    bugs. (1) The mobile-only prev/Archive/next nav row
    (`listening-room.js`'s `makeMobileNav`) sits in a CSS grid
    (`.dc-mobile-genre-nav`) whose 3 columns were all hard-locked to 42px --
    sized for the single-character `<`/`>` icons -- so the middle button's
    full-word "Archive" label clipped to an unreadable "rchi" fragment (a
    grid item is sized by its track, not its own width). Fixed at the root:
    `grid-template-columns: 42px auto 42px`, plus an auto-width override on
    the button itself (both were needed). (2) The shared
    `.genre-art`/`.song-artwork`/etc. rule had no `overflow:hidden`, so a
    failed image load (CDN hiccup, offline, blocked request) rendered its
    alt text spilling past the rounded box -- added `overflow:hidden` plus a
    smaller centered fallback font, byte-identical when images load fine.
  - **Library (`cf44d51`)**: the biggest find of Phase 5 so far -- not
    cosmetic, a real dead-batching bug. Switching to Archive with the full
    library rendered EVERY genre as real DOM immediately (2431 elements, a
    ~135,000px tall screen) instead of the intended 48-item (desktop) /
    32-item (mobile) batch. Root cause: `core/rankings-archive.js` computed
    `archiveProgressiveState` at its own file's top level, synchronously,
    via `window.DailyGenreArchiveProgressive?.createArchiveProgressiveState`
    -- but `archive-progressive.js` (which defines that global) loads
    *after* `core/rankings-archive.js` in `index.html`'s real script order,
    so the lookup always returned `undefined`, `archiveProgressiveState` was
    permanently `null`, and every render silently fell through to the
    "no state" fallback (`rendered: items.length`). This has been broken in
    production since whenever these files were split apart, unnoticed
    because neither existing archive-progressive test file replicated the
    real script order (one only regex-matches source text against the
    fallback path; the other unit-tests `archive-progressive.js` in
    isolation). Fixed by making `archiveProgressiveState` a lazily
    -initialized singleton (computed on first real use, not at parse time)
    -- robust to load order rather than a reorder-and-hope fix. New test:
    `tests/archive-progressive-load-order.test.js` (2 tests, confirmed to
    fail against the old code and pass against the fix, using the harness's
    `extraScripts` option to replicate the real load order).
  - **Dig / Crate Dig (`86f0bb8`)**: opens the same Listening Room template
    as Today (just picks a different genre via `openRandomListenedGenre`),
    so most of the Today-screen fixes already applied here. Live-verifying
    the actual entrypoint (clicking `#topCrateDigBtn`, not just the Today
    path) found the same "failed image alt-text spills past the rounded
    box" bug in two more places that don't go through the shared
    `artworkHtml()` helper fixed in the Today pass: `.song-focus-art`
    (`songs.js`'s song carousel, 190x190px -- confirmed live: "Spin Spin
    Sugar - Armands Dark Garage Mix artwork" spilling well past its box)
    and `.song-focus-row-art` (the 48x48px song-queue row thumbnails). Same
    `overflow:hidden` + small centered fallback font fix. Two more artwork
    classes with real (non-empty) alt text -- `.album-slot-art` (Album
    Dive) and `.studio-thumb` (Studio/Review) -- are known instances of the
    same pattern, intentionally left for their own screens' passes rather
    than fixed out of scope here.
  - **Album Dive (`b245459`)**: fixed `.album-slot-art` (the large hero
    album art) as flagged in the Dig step, plus a related bug found live
    that a static read wouldn't have caught: the album-shelf thumbnails
    (`.album-rail-card img`, 52-58px) showed the same alt-text overflow
    ("PILOT COVER", "HEX COVER" fragments spilling past their rounded
    boxes). The selector that *looked* like the shelf-grid rule from
    reading the CSS (`.album-dive-grid .album-slot-art`,
    `library-polish.css:3382`) turned out to be dead code -- no element
    with class `album-dive-grid` exists in the real DOM; the actual
    thumbnail is an unclassed `<img>` inside `.album-rail-card`, found via
    live DOM inspection. Since these thumbnails are small, went one step
    further than the earlier fixes: `white-space:nowrap` +
    `text-overflow:ellipsis` so a failed image's alt text truncates to one
    clean line instead of wrapping into a multi-line block that fills the
    whole box before clipping.
  - **Game Room (no changes needed)**: live-verified every state -- the
    intro card, an in-progress round (clue, artwork, 4 answer choices,
    "Show category hint"), the post-answer feedback (correct/incorrect
    color-coded highlighting plus the genre-fit explanation), and the final
    "Easy Mode Complete" summary screen -- at phone and desktop widths, and
    played a full 10-round game end to end. Touch targets on the answer
    buttons measured 60px tall (well above the ~44px minimum); its artwork
    thumbnails already use `alt=""` (correctly decorative, so the alt-text
    overflow bug found on every other screen doesn't apply here); no
    `:has()`/`backdrop-filter` cross-browser risk in `game-room.css`. This
    screen was already solid -- reporting that honestly rather than making
    a cosmetic change just to have one.
  - **Stats / Visuals (`6f6e531`)**: this sandbox can't reach the Chart.js
    CDN (jsdelivr blocked by org network policy), so the charts rendered
    as empty canvases in a plain live pass -- rather than guess at chart
    behavior from a static read, installed a local `chart.js@4.4.4` build
    via `npm` (registry is reachable) and routed
    `https://cdn.jsdelivr.net/**` to it in Playwright, so the real donut/bar
    charts actually rendered for verification. Found one real bug:
    `#vizMonthSelect` truncated to "Augu" on phone width instead of "August
    2026" -- it's a flex item inside `.viz-mode-bar` (flex-wrap:wrap) with
    no sizing of its own, so it shrank to whatever space was left after the
    Monthly/All Time toggle buttons instead of wrapping to its own row.
    Fixed with `flex:0 1 auto; min-width:150px`, confirmed no change to the
    already-narrow desktop sidebar layout. Everything else on the
    dashboard -- hero stats, listening-story summary, filter controls, the
    charts themselves, highlights, artist discovery, songs-in-rotation,
    genre crossovers -- checked out clean at phone/tablet/desktop.
  - **Studio / Review (`3ec1948`)**: fixed `.studio-thumb` -- the last of
    the artwork classes flagged (in the Dig step) as a known instance of
    the alt-text-overflow pattern. Confirmed via live inspection most uses
    already have `alt=""` (decorative, no risk -- e.g. the Repair Bay row
    thumbnails render correctly today), but
    `updateVisibleAlbumRepairThumb()` sets `alt="Album art"` on one path,
    which could still overflow the small 48px box if that image fails to
    load. Same `overflow:hidden` + small centered fallback fix, with
    `white-space:nowrap`/`text-overflow:ellipsis` since it's a small
    thumbnail (matching the Album Dive shelf-thumbnail fix). This was the
    last screen carrying a known deferred instance of this bug pattern --
    every artwork class across the app has now been checked. Otherwise the
    Studio Workbench overview, Routing Desk, Genre Identity, Repair Bay
    (including its expanded metadata/artwork repair forms), and QA Lab
    checked out clean at phone/tablet/desktop.
  - **Ranks (no changes needed) -- last screen, Phase 5's screen-by-screen
    pass is complete**: genre thumbnails (already covered by the
    `.ranking-artwork` fix from the Today step), star-tier chips, rating
    buttons, and up/down move-rank arrows all wrap correctly on mobile with
    no truncation or overflow. One real characteristic worth noting, not
    fixing: the screen renders its full ranked list unpaginated (~241
    genres, ~5,500 DOM nodes in this dev dataset) -- superficially similar
    to the Library bug, but confirmed via live timing (~62ms render) this
    isn't a broken/regressed feature the way Library's batching was; Ranks
    never had any batching code to begin with, so a long full-list page is
    this screen's actual designed behavior (ranking is inherently a
    full-list-ordering task), not a dead feature to restore. Flagged as a
    possible future enhancement (a "load more per tier" control) rather
    than building a new pagination system unprompted.

  Each screen: verified with `npm test` (136/136 as of the Library step, the
  one pre-existing rAF-timing flake in `router-switch-screen.test.js`
  reproduced and cleared on isolated re-run as in every earlier phase),
  `check-build.sh`, and a live local-server + headless-Chromium pass at
  phone/tablet/desktop widths before committing.

  **All 9 screens done**: Spin, Today, Library, Dig, Album Dive, Game Room,
  Stats, Studio, Ranks -- in tab order, each verified live. Real bugs fixed:
  the Spin marker obscuring text, two mobile-nav/artwork bugs on Today, the
  dead Archive batching (the biggest find), two more artwork-overflow spots
  on Dig, two more on Album Dive (one via a dead-CSS-selector red herring),
  a truncating month selector on Stats, and the last artwork-overflow spot
  on Studio. Game Room and Ranks needed no changes after thorough live
  checks -- reported as such rather than manufacturing busywork.

**Port everything back to `moxed42/dailygenre`** (branch
`claude/github-daily-genre-context-lc5xej`): re-apply the verified diffs,
remove the dev-only save-flow guard in `doSaveWithPassword()`, and follow
production's real `?v=build-vNNN` cache-bust bump convention (checked by
`tools/check-build.sh`) so the Pages deploy actually picks up the change.
Nothing from Part 1 or Part 2 has been ported yet.

## How to verify anything in this repo

- `npm test` (`node --test tests/*.test.js`) — 134 tests as of Phase 3's
  eighth (final) step.
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

## Part 3 — UX & Feature Redesign (in progress)

With Phase 5's bug-fixing pass done, the user asked for a genuine
design/UX-perspective review layered on top: navigation, flows, information
architecture, feature gaps, content density — explicitly keeping the Retro
Hi-Fi visual theme intact. A Plan-agent audit found the nav's "9 tabs"
weren't 9 real places (3 had no `data-screen` at all, just verb buttons
calling `openGenreDetail()` into the same screen). Full plan, all phases,
lives in the plan file this session used — see there for Phases 7-12
(mobile bottom nav, save-flow friction, Studio simplification, a real
recommendation rail, onboarding/progress chip, consistency pass) and the
explicit "not recommending" list (don't merge Spin into Listen, don't merge
Library/Ranks, don't cut Game Room, don't touch the theme, etc.).

**Phase 6 (`b9d4cc9`) — collapse nav to real destinations, demote Today/Dig/
Album Dive into the Listen screen**: replaced the 3 verb buttons
(`#topTodayBtn`/`#topCrateDigBtn`/`#topAlbumDiveBtn`, none of which had
`data-screen`) with one real "Listen" tab, and moved the 3 buttons into a
new header row inside `#screen-listen` itself — same elements/IDs/classes,
so every existing handler kept working unchanged, just physically
relocated. Two follow-on fixes found via live testing rather than assumed:
the Listen tab needed its own `window.DailyGenreToday.open()` default (not
a bare `switchScreen`) so clicking it from elsewhere still jumps straight
to today's genre in one click; and `openCrateDig()`/`openCurrentAlbumDive()`
used to manually force-highlight themselves as the "active tab" (correct
when they were real top-level tabs, stale now) — deleted rather than
redirected, since `switchScreen('listen')` (already called via
`openGenreDetail`) highlights the real Listen tab on its own. Added a
one-line status ("Today: X · in progress" / "Nothing logged today · last
was Y") above the action row, and made the Album Dive button disable
itself with an explanatory title when there's no active dive instead of
leaving a click that just toasts an error. Nav: 9 buttons → 7 real
destinations (Spin, Listen, Library, Game Room, Stats, Studio, Ranks —
Game Room staying a peer tab for now is a deliberate smaller scope, not an
oversight). Verified: 136/136 tests, `check-build.sh`, live phone/desktop
passes confirming the one-click Listen-tab default, correct tab
highlighting through Crate Dig/Album Dive/opening a genre from Library,
and clean mobile wrapping of the new header row.

**Phase 7 (`c24867c`) — fixed bottom tab bar on mobile**: at `<=600px`,
`.tabs` repositions from stacked pill rows (previously up to 4 rows for 7
buttons, eating a large share of the viewport) into a single fixed bottom
bar using the existing wood-grain surface + brass hairline tokens, no new
colors. Desktop pill row is untouched (rule is scoped to the existing
mobile breakpoint). `.app` gets extra bottom padding and the save
toast/floating save bar are nudged up so nothing sits underneath the new
bar. The new rule set was appended at the very end of
`library-polish.css` so it wins cascade order over the pre-existing
`<=430px` 2-per-row grid rule for the same selectors. One rendering worry
surfaced and was resolved during verification: an early `elementHandle.
screenshot()` of `.tabs` alone showed unrelated page content instead of
the bar, which looked like the bar might be disappearing on scroll —
`getComputedStyle`/`getBoundingClientRect`/`elementFromPoint` all
confirmed the bar was correctly `position:fixed` and topmost the whole
time, and a same-moment full-viewport screenshot (with a longer wait for
the "opened most recent" toast to clear) showed the bar rendering
correctly at the bottom while scrolled — the anomaly was in how the
isolated element screenshot was captured, not a real bug. Verified:
136/136 tests, `check-build.sh`, and live 320/375/768px passes confirming
the bar stays pinned and keeps the active tab highlighted while the Listen
screen is scrolled to the bottom, scrolls horizontally for all 7 items,
and the 768px tablet view is unaffected.

**Phase 8 (`70d3869`) — fixed the core loop's two friction points**: (1)
`markGenreInProgressForToday()` used to fire `promptLibrarySaveLogin()` via
a `setTimeout` immediately after Spin's "I'll Listen to This" — so the
second step of the daily ritual was an auth-password modal, before the
user had done anything worth saving. That call is gone; `setGenreInProgressFromView()`/`setGenreRatingFromView()`'s own prompts (genuine
in-screen edits, not the initial spin) were deliberately left alone. (2)
Consolidated the save affordances: reading the actual code first showed
`#saveBtn` calls `prepareAndSaveCurrentGenre()` — a genuinely richer
function that also gathers the open editor's notes/favorite-song/
monthly-flag/songs-bulk fields — not a redundant duplicate of
`saveLibraryUpdates()` as the plan's text assumed, so it was left as-is.
The three affordances that *were* truly redundant (the floating
`#floatingListeningSave` bar with its own move/collapse controls, Studio's
inline "Save cleanup" button, and Stats' `#vizSaveLibraryBtn`) were removed
and replaced by one persistent chip in the topbar (`#saveStatusChip`, next
to `#remainingCount`) that shows "Unsaved changes · Save" / a busy state
and calls `saveLibraryUpdates()` — wired through the existing
`toggleLibrarySaveButton()`/`setLibrarySaveBusy()` helpers so every call
site that used to reach for the old buttons now drives the one chip. The
blocking `window.confirm('You have unsaved changes...')` on navigating off
Listen was replaced with a non-blocking toast ("Left Listen with unsaved
changes — use Save in the top bar to keep them"), since save state is now
always visible instead of needing a modal to surface it. Left the ~25
scattered dead `.floating-listening-save*`/`.floating-save-*` CSS
selectors in place (their target element no longer exists, so they're
inert) — cleaning those up is folded into Phase 12's consistency pass,
which already plans to touch the same CSS files. Verified: 136/136 tests,
`check-build.sh`, and a live pass confirming spinning → "I'll Listen to
This" no longer shows a login modal (zero unexpected dialogs across the
whole flow), the topbar chip appears with the correct text and styling on
every screen that used to have its own button (Listen, Studio, Stats),
Studio's workbench-hero now shows "No unsaved cleanup"/"Unsaved cleanup
pending" as plain status text with no separate button, `#vizSaveLibraryBtn`
is gone from Stats leaving only Refresh/Backup, and navigating away from
Listen with unsaved changes proceeds immediately (no blocking dialog) while
the chip keeps reflecting the pending state on the new screen.

**Phase 9 (`bfb4cc0`) — investigated Studio/Stats "duplicate queues," found
mostly no duplication to remove**: the plan assumed Studio's `renderReview()`
opened cluttered (4 counter tiles + toolbar + 6 always-visible lanes + a
Legacy block) and that Stats' maintenance cards
(`#vizNeedsAttentionMonthly`/`#vizUnratedSongsMonthly`/
`#vizMetadataQueueMonthly` and all-time twins) were redundant copies of the
same queues. Reading the actual code found neither true: Studio already
opens with a concise 4-card hero (Route/Identity/Repair/Review counts) and
every lane collapsed by default (`makeStudioSectionsCollapsible` sets
`studio-section-collapsed` on mount; clicking a hero card jumps to and
expands only that lane) — already the "Today's bench" shape the plan
wanted, not the sprawling always-open layout assumed. On the Stats side:
Studio's Repair Bay has no inline era-year override, which Stats' Missing
Metadata Queue does (`renderMetadataQueue`'s `metadataEra_*` inputs) — a
real, distinct capability, not a copy. Studio's QA Lab detects duplicates
via cross-genre fit clusters (`duplicateGroups`); Stats' "Possible
duplicates" detects same-genre identity matches
(`collectDuplicateMaintenanceRows`) — different detection logic answering
a different question. Deleting either to "de-duplicate" would have been a
real feature regression, not a cleanup, so both were left alone rather
than force a change the plan assumed was needed but the code didn't
support. The one genuinely safe, valuable change from this phase shipped:
Library's 17-option `#archiveFlagFilter` grouped into three `<optgroup>`
sections (Content / Missing / Problems) for scannability — pure markup,
filtering still reads `.value` and is unaffected by the grouping.
Verified: 136/136 tests, `check-build.sh`, and a live pass confirming the
three optgroup labels render correctly and filtering by an option inside a
group (tested "Unlistened genres") still narrows the Library list exactly
as before.

**Phase 8 follow-up (`c2cc537`)** — found while starting Phase 10: Phase 8
left ~15 toast/helper strings across `app.js`, `ranks-polish.js`,
`songs.js`, `studio-polish.js`, and `core/review-queue.js` still saying
"use the floating Save button" or "click Save Library Updates" — both
describing UI Phase 8 had already removed. Reworded all of them to point
at "Save in the top bar". Also found a 4th save button Phase 8's audit
missed: `core/review-queue.js`'s native Pending Nominations card head
still rendered its own "Save Library Updates" button whenever
`libraryUpdatesPending` was true — redundant with the topbar chip exactly
like the three Phase 8 already removed. Removed it. Verified: 136/136
tests, `node --check` on every touched file, and a grep confirming no
stale "floating Save"/"Save Library Updates" strings remained.

**Phase 10 (`f90936f`) — inline "Sounds like this" recommendation rail**:
replaced `openSimilarGenresForCurrentGenre()` — which used to navigate
away to the Library screen and type the current genre's name into search,
ejecting the user from the genre they were looking at — with an inline
rail directly on the detail screen. Reuses `scoreGenre()`/
`searchSimilarGenres()` from `core/similar-genres.js` exactly as-is; only
the presentation changed. The rail shows the top 3 neighbors (self
excluded) as a horizontal card row: name, the single strongest reason
string (e.g. "Exact alias match", "Shared name terms: avant, garde"), and
either the existing rating or "Unheard — spin this next", each with an
"Open genre" action. Mounted via a `loadListenScreen` post-hook (the same
`dgRegisterPostHook` mechanism Phase 3 introduced), following
`genre-identity.js`'s `injectDnaCard` anchor-chain exactly — Discovery
Console restructures the whole detail DOM on a 20ms-delayed timer after
`loadListenScreen` renders, so the rail schedules its own two delayed
mount attempts (40ms, 200ms) and targets the DNA card / vibe-line /
progress-strip / record-card anchors in that priority order, with the
same older-DOM fallback chain the DNA card uses. Hit one real bug during
verification: the rail didn't appear at all on the first live pass because
`index.html` loads `.min.js`, not source — forgot to run
`tools/build-min.sh` before testing, so the browser was running the
pre-Phase-10 minified file. Once rebuilt, verified end-to-end: 136/136
tests (one unrelated pre-existing flake in
`router-switch-screen.test.js` confirmed via `git stash` to fail
identically without any of this session's changes — a test-ordering
issue, not a regression), `check-build.sh`, and a live pass on a real
genre ("Avant-garde jazz") showing 3 correctly-scored neighbors with real
reason strings, confirming clicking "Open genre" actually navigates
there, confirming the rail renders correctly at mobile width with
horizontal scroll, and confirming the Library's separate "Similar
styles" search-mode toggle (a different feature — search any typed term
against the whole library) still works unaffected. The old entry point
(`openSimilarGenresForCurrentGenre`, `enhanceListenHeader`, the "Check
for similar genres" button) was removed entirely — no dangling second
path.

**Phase 11 (`a8ec510`) — onboarding banner + progress/streak chip**: the
`#remainingCount` pill — the most prominent chrome in the app — used to
stuff a developer-facing ID-gap/status-bucket audit into its `title`
attribute and dump the same thing plus more (missing numeric ID list,
first excluded-row samples) into a raw `alert()` on click. Replaced with
a friendly readout ("241 of 1,043 explored · 6-day streak") that opens a
small popover on click instead of a modal. Streak is computed by walking
backward day-by-day from today (or yesterday, if nothing's logged yet
today) through each genre's `date_normalized`, counting consecutive
dated days. The full diagnostic moved to a new collapsed-by-default
"Library diagnostics" `<details>` in Studio, reusing
`getRemainingCountDiagnostics()`/`remainingCountMessage()` from app.js
verbatim — only the presentation changed. Found and removed, during live
verification, a **second independent copy** of this exact diagnostic in
`listening-room.js` (`compactRemainingClick`/`buildCompactRemainingAudit`
— never listed in the plan's file inventory, discovered only because it
broke the new popover): it attached its own capturing click listener to
`#remainingCount` that called `stopImmediatePropagation()` and
`alert()`ed a slightly differently-worded version of the same audit,
silencing every other click handler on that element including the new
popover's. Removed entirely (all-local helper functions, unused
elsewhere). Also added: a one-time dismissible "How this works" banner
(Spin → Listen → Rate) on the Spin screen shown until dismissed via
`safeStorageGet`/`safeStorageSet`-backed localStorage, never reappearing
after; "Toggle manual picker" reworded to "Pick one myself"; Game Room's
raw "Game Room needs at least 10 playable clues across at least 4
listened genres. It currently found 3." replaced with "Listen to 4
genres to unlock Game Room — you're 1 away." (or an "almost there"
message when the genre count already qualifies but clue data doesn't),
now shown proactively on Game Room's own intro screen rather than only
after a failed Start click. Verified: 136/136 tests (one test's
assertion updated to match the intentional new pill copy: `"remaining"`
→ `"explored"`; the pre-existing `router-switch-screen.test.js` flake
from Phase 10 recurred here too, confirmed the same way — unrelated to
this phase), `check-build.sh`, and a live pass confirming the banner
shows once and never reappears after dismissal + reload, the popover
renders live progress/streak/spin-pool numbers and no longer collides
with the diagnostics disclosure's click handler, Studio's diagnostics
lane shows the full relocated audit correctly, and Game Room's proactive
message computes the correct "you're N away" distance against a small
test dataset.

**Phase 12 (`92d9614`) — investigated the consistency pass, found little
that actually needed fixing**: the plan assumed the app had "5 different
collapsible-section implementations" and "4 different filter-row idioms"
in chaotic overlap, and recommended merging them into one shared
disclosure component and one shared filter-bar component. Reading the
actual code found this premise mostly didn't hold, the same way Phase
9's assumed Stats/Studio duplication didn't: of the app's `<details>`
blocks, 13 already have their own dedicated, working CSS
(`.album-focus-controls-drawer`, `.viz-queue-fold`,
`.studio-diagnostics-lane`, `.genre-identity-import`, etc.) — only 3
were genuinely unstyled and relying on raw browser defaults
(`album-dive.js`'s bare manual-metadata `<details>`, its
`.album-listen-expand` wrapper, and
`genre-identity-alias-editor.js`'s `.v259-alias-import`). Studio's
custom `.studio-collapse-btn`/`.studio-section-collapsed` system isn't a
naive duplicate of `<details>` either — it does real work `<details>`
can't (mobile-perf-mode debounced re-applies, section-open-state
preservation across re-renders via `captureStudioSectionState`) that a
wholesale conversion would have to reimplement or lose. And the "4
filter-row idioms" (Library's facet filters, Stats' monthly/all-time
mode toggle, Studio's global search+priority filter, the detail screen's
Songs/Albums view tabs) each answer a genuinely different question, not
a copy-pasted inconsistency — forcing them into one shared component
would likely make at least one of them a worse fit for its actual job,
echoing the plan's own "don't split Stats into separate tabs" reasoning.
Rather than force a large, high-blast-radius rewrite the code didn't
actually need, shipped the one genuine, safe gap: a new shared
`.dg-disclosure` CSS class (bordered card, "+"/"−" circular marker,
matching the app's existing warm-surface tokens) applied to the 3
previously-unstyled `<details>` elements. Everything else — Studio's
collapse system, the 4 filter rows — left as-is. Verified: 136/136 tests
(same pre-existing `router-switch-screen.test.js` flake, confirmed
unrelated the same way as Phases 10-11), `check-build.sh`, and a
computed-style check confirming `.dg-disclosure` renders with the
intended border/gradient/radius on the live page.

## Part 3 status: complete

All 7 phases (6–12) planned for the UX/feature redesign are shipped,
verified, and pushed to `dailygenre-dev`. Three of them (9, 10 sub-goal
scope, and 12) ended up delivering less code than the plan assumed
because direct investigation of the real implementation showed the
assumed problem didn't fully exist — each time, documented honestly
here rather than forcing an unneeded change. Nothing from Part 3 has
been ported to production (`moxed42/dailygenre`) yet; that remains a
separate, explicitly-deferred step.
