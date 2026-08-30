const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBoundedList,
  createPerformanceTracker,
  describeElement,
} = require("../assets/js/performance.js");

test("bounded list keeps only the newest samples", () => {
  const list = createBoundedList(2);
  list.push("a");
  list.push("b");
  list.push("c");
  assert.deepEqual(list.snapshot(), ["b", "c"]);
});

test("tracker aggregates metric summaries", () => {
  let clock = 0;
  const tracker = createPerformanceTracker({
    now: () => clock,
    sampleLimit: 3,
  });

  tracker.record("render", 10);
  tracker.record("render", 30);
  const metric = tracker.snapshot().metrics.render;

  assert.equal(metric.count, 2);
  assert.equal(metric.totalMs, 40);
  assert.equal(metric.averageMs, 20);
  assert.equal(metric.maxMs, 30);
  assert.equal(metric.latestMs, 30);
});

test("start and end record elapsed time with merged metadata", () => {
  let clock = 100;
  const tracker = createPerformanceTracker({ now: () => clock });
  const token = tracker.start("reaction", { genreId: 12 });
  clock = 118.5;
  tracker.end(token, { fastPath: true });

  const metric = tracker.snapshot().metrics.reaction;
  assert.equal(metric.latestMs, 18.5);
  assert.deepEqual(metric.samples[0].metadata, {
    genreId: 12,
    fastPath: true,
  });
});

test("ending an unknown token is a safe no-op", () => {
  const tracker = createPerformanceTracker({ now: () => 0 });
  assert.equal(tracker.end("missing"), null);
  assert.deepEqual(tracker.snapshot().metrics, {});
});

test("counters and events are bounded and reset cleanly", () => {
  const tracker = createPerformanceTracker({
    now: () => 5,
    sampleLimit: 2,
  });
  tracker.increment("hits");
  tracker.increment("hits", 2);
  tracker.event("one", { value: 1 });
  tracker.event("two", { value: 2 });
  tracker.event("three", { value: 3 });

  let report = tracker.snapshot();
  assert.equal(report.counters.hits, 3);
  assert.deepEqual(
    report.events.map((entry) => entry.type),
    ["two", "three"],
  );

  tracker.reset();
  report = tracker.snapshot();
  assert.deepEqual(report.counters, {});
  assert.deepEqual(report.events, []);
});

test("element description is compact and defensive", () => {
  const target = {
    tagName: "BUTTON",
    id: "save",
    classList: {
      value: "btn primary floating extra",
    },
  };
  assert.equal(
    describeElement(target),
    "button#save.btn.primary.floating",
  );
  assert.equal(describeElement(null), "");
});
