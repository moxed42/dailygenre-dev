const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createArchiveViewModelCache,
} = require('../assets/js/archive-view-model-cache.js');

test('Archive view-model cache reuses the same revision and signature', () => {
  const cache = createArchiveViewModelCache({ maxEntries: 4 });
  const value = { items: [{ id: 1 }], label: 'All logs' };

  cache.set('3:sha-a', '{"sort":"newest"}', value);

  assert.equal(
    cache.get('3:sha-a', '{"sort":"newest"}'),
    value,
  );
  assert.deepEqual(cache.snapshot().counters, {
    hits: 1,
    misses: 0,
    writes: 1,
    evictions: 0,
    clears: 0,
  });
});

test('Archive view-model cache misses when the revision changes', () => {
  const cache = createArchiveViewModelCache();
  cache.set('3:sha-a', 'all', { items: [1] });

  assert.equal(cache.get('4:sha-b', 'all'), null);
  assert.equal(cache.snapshot().counters.misses, 1);
});

test('Archive view-model cache misses when filters change', () => {
  const cache = createArchiveViewModelCache();
  cache.set('3:sha-a', 'newest', { items: [1] });

  assert.equal(cache.get('3:sha-a', 'genre'), null);
  assert.equal(cache.snapshot().counters.misses, 1);
});

test('Archive view-model cache evicts the least-recently-used entry', () => {
  const cache = createArchiveViewModelCache({ maxEntries: 2 });

  cache.set('1', 'a', { id: 'a' });
  cache.set('1', 'b', { id: 'b' });
  cache.get('1', 'a');
  cache.set('1', 'c', { id: 'c' });

  assert.equal(cache.get('1', 'b'), null);
  assert.equal(cache.get('1', 'a').id, 'a');
  assert.equal(cache.get('1', 'c').id, 'c');
  assert.equal(cache.snapshot().counters.evictions, 1);
});

test('Archive view-model cache clears explicitly', () => {
  const cache = createArchiveViewModelCache();
  cache.set('1', 'a', { id: 'a' });
  cache.clear('library-replaced');

  const snapshot = cache.snapshot();
  assert.equal(snapshot.size, 0);
  assert.equal(snapshot.lastClearReason, 'library-replaced');
  assert.equal(snapshot.counters.clears, 1);
});

const appPath = path.join(
  __dirname,
  '..',
  'assets',
  'js',
  'app.js',
);
const app = fs.readFileSync(appPath, 'utf8');

test('Archive render uses the revisioned view-model cache', () => {
  assert.match(app, /createArchiveViewModelCache/);
  assert.match(app, /function getArchiveViewModel/);
  assert.match(app, /archiveViewModelCache\.get/);
  assert.match(app, /archiveViewModelCache\.set/);
  assert.match(app, /dailyGenreArchiveViewModelCacheDiagnostics/);
});

test('Archive cache is bypassed while library changes are unsaved', () => {
  assert.match(
    app,
    /const canUseCache =\s*!hasUnsavedChanges && !libraryUpdatesPending;/,
  );
});

test('Production save recovery is carried into v254', () => {
  assert.match(app, /single-flight-sha-recovery/);
  assert.match(app, /confirmProductionSaveAfterNetworkError/);
  assert.match(app, /dailyGenreSaveRecoveryDiagnostics/);
});
