const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'assets', 'js', 'app.js');
const app = fs.readFileSync(appPath, 'utf8');

test('Archive uses measured adaptive desktop and mobile batch sizes', () => {
  assert.match(app, /const ARCHIVE_DESKTOP_BATCH_SIZE = 48;/);
  assert.match(app, /const ARCHIVE_MOBILE_BATCH_SIZE = 32;/);
  assert.match(app, /const ARCHIVE_MOBILE_BATCH_QUERY = '\(max-width: 760px\)';/);
  assert.match(app, /window\.matchMedia\?\.\(ARCHIVE_MOBILE_BATCH_QUERY\)\?\.matches/);
  assert.match(app, /const ARCHIVE_RENDER_BATCH_SIZE = archiveRenderBatchSize\(\);/);
  assert.doesNotMatch(app, /const ARCHIVE_RENDER_BATCH_SIZE = 80;/);
});

test('Archive diagnostics expose the active adaptive batch strategy', () => {
  assert.match(app, /strategy: 'adaptive-batch-48-32-delegated'/);
  assert.match(app, /desktopBatchSize: ARCHIVE_DESKTOP_BATCH_SIZE/);
  assert.match(app, /mobileBatchSize: ARCHIVE_MOBILE_BATCH_SIZE/);
  assert.match(app, /activeBatchSize: ARCHIVE_RENDER_BATCH_SIZE/);
});

test('Archive load-more copy follows the active snapshot batch size', () => {
  assert.match(
    app,
    /Number\(snapshot\.batchSize \|\| ARCHIVE_RENDER_BATCH_SIZE\)/,
  );
});
