const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createArchiveRenderReuse,
} = require('../assets/js/archive-render-reuse.js');

function renderedSnapshot(overrides = {}) {
  return {
    signature: 'revision-1:newest',
    total: 203,
    rendered: 80,
    domCards: 80,
    ...overrides,
  };
}

test('Archive DOM reuse accepts an unchanged rendered snapshot', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());

  assert.equal(reuse.shouldReuse(renderedSnapshot()), true);
  assert.equal(reuse.snapshot().counters.reuses, 1);
});

test('Archive DOM reuse rejects a changed signature', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());

  assert.equal(
    reuse.shouldReuse(renderedSnapshot({ signature: 'revision-1:oldest' })),
    false,
  );
  assert.equal(reuse.snapshot().lastReason, 'signature-changed');
});

test('Archive DOM reuse rejects a changed rendered count', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());

  assert.equal(
    reuse.shouldReuse(renderedSnapshot({
      rendered: 160,
      domCards: 160,
    })),
    false,
  );
  assert.equal(reuse.snapshot().lastReason, 'rendered-count-changed');
});

test('Archive DOM reuse rejects missing cards', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());

  assert.equal(
    reuse.shouldReuse(renderedSnapshot({ domCards: 79 })),
    false,
  );
  assert.equal(reuse.snapshot().lastReason, 'dom-card-count-mismatch');
});

test('Archive DOM reuse can be forced off for dirty UI state', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());

  assert.equal(
    reuse.shouldReuse({
      ...renderedSnapshot(),
      force: true,
      forceReason: 'unsaved-library-state',
    }),
    false,
  );
  assert.equal(reuse.snapshot().counters.forced, 1);
  assert.equal(reuse.snapshot().lastOutcome, 'forced');
});

test('Archive DOM reuse remembers an expanded progressive batch', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());
  reuse.remember(
    renderedSnapshot({ rendered: 160, domCards: 160 }),
    'append',
  );

  assert.equal(
    reuse.shouldReuse(
      renderedSnapshot({ rendered: 160, domCards: 160 }),
    ),
    true,
  );
});

test('Archive DOM reuse invalidates explicitly', () => {
  const reuse = createArchiveRenderReuse();
  reuse.remember(renderedSnapshot());
  reuse.invalidate('library-replaced');

  assert.equal(reuse.shouldReuse(renderedSnapshot()), false);
  assert.equal(reuse.snapshot().counters.invalidations, 1);
  assert.equal(reuse.snapshot().lastReason, 'uninitialized');
});

const appPath = path.join(
  __dirname,
  '..',
  'assets',
  'js',
  'app.js',
);
const app = fs.readFileSync(appPath, 'utf8');

test('Archive rendering skips unchanged list and summary DOM work', () => {
  assert.match(app, /createArchiveRenderReuse/);
  assert.match(app, /const canReuseArchiveDom =/);
  assert.match(app, /archiveProgressiveRenderDiagnostics\.reusePasses \+= 1/);
  assert.match(app, /if \(!renderResult\?\.reused\) \{\s*renderArchiveSummary/);
});

test('Archive DOM reuse is disabled while library state is dirty', () => {
  assert.match(
    app,
    /options\.forceDomRender \|\|\s*hasUnsavedChanges \|\|\s*libraryUpdatesPending/,
  );
});

test('Archive playlist bulk toggles force checkbox regeneration', () => {
  assert.match(
    app,
    /function archiveToggleVisiblePlaylistSelection[\s\S]*renderHistory\(\{ forceDomRender: true \}\)/,
  );
});

test('Archive progressive append updates the reusable DOM snapshot', () => {
  assert.match(
    app,
    /archiveRenderReuse\?\.remember\?\.\(\s*\{[\s\S]*domCards:[\s\S]*\},\s*'append'/,
  );
});

test('Archive cache invalidation also invalidates reusable DOM state', () => {
  assert.match(
    app,
    /dailyGenreArchiveViewModelCacheInvalidate[\s\S]*dailyGenreArchiveRenderReuseInvalidate/,
  );
  assert.match(
    app,
    /function invalidateGenreIndexes[\s\S]*dailyGenreArchiveRenderReuseInvalidate/,
  );
});
