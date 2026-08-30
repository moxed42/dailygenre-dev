/* Daily Genre v247: bounded performance instrumentation. */

(function dailyGenrePerformanceModule(globalScope) {
  "use strict";

  const DEFAULT_SAMPLE_LIMIT = 50;

  function safeNow() {
    try {
      return globalScope?.performance?.now?.() ?? Date.now();
    } catch {
      return Date.now();
    }
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(finiteNumber(value) * factor) / factor;
  }

  function createBoundedList(limit = DEFAULT_SAMPLE_LIMIT) {
    const cap = Math.max(1, Math.floor(finiteNumber(limit, DEFAULT_SAMPLE_LIMIT)));
    const values = [];

    return {
      push(value) {
        values.push(value);
        if (values.length > cap) values.splice(0, values.length - cap);
      },
      clear() {
        values.length = 0;
      },
      snapshot() {
        return values.slice();
      },
      get length() {
        return values.length;
      },
    };
  }

  function createPerformanceTracker(options = {}) {
    const now = typeof options.now === "function" ? options.now : safeNow;
    const sampleLimit = Math.max(
      1,
      Math.floor(finiteNumber(options.sampleLimit, DEFAULT_SAMPLE_LIMIT)),
    );
    const startedAt = now();
    const metrics = new Map();
    const counters = new Map();
    const events = createBoundedList(sampleLimit);
    const active = new Map();
    let nextToken = 1;

    function metricState(name) {
      const key = String(name || "unnamed");
      if (!metrics.has(key)) {
        metrics.set(key, {
          count: 0,
          totalMs: 0,
          maxMs: 0,
          latestMs: 0,
          samples: createBoundedList(sampleLimit),
        });
      }
      return metrics.get(key);
    }

    function record(name, durationMs, metadata = null) {
      const duration = Math.max(0, finiteNumber(durationMs));
      const state = metricState(name);
      state.count += 1;
      state.totalMs += duration;
      state.maxMs = Math.max(state.maxMs, duration);
      state.latestMs = duration;
      state.samples.push({
        durationMs: round(duration),
        atMs: round(now() - startedAt),
        metadata: metadata && typeof metadata === "object" ? { ...metadata } : metadata,
      });
      return duration;
    }

    function start(name, metadata = null) {
      const token = `dg-perf-${nextToken++}`;
      active.set(token, {
        name: String(name || "unnamed"),
        startedAt: now(),
        metadata,
      });
      return token;
    }

    function end(token, metadata = null) {
      const state = active.get(token);
      if (!state) return null;
      active.delete(token);
      const mergedMetadata =
        state.metadata && typeof state.metadata === "object"
          ? {
              ...state.metadata,
              ...(metadata && typeof metadata === "object" ? metadata : {}),
            }
          : metadata ?? state.metadata;
      return record(state.name, now() - state.startedAt, mergedMetadata);
    }

    function increment(name, amount = 1) {
      const key = String(name || "unnamed");
      const next = finiteNumber(counters.get(key), 0) + finiteNumber(amount, 1);
      counters.set(key, next);
      return next;
    }

    function event(type, detail = null) {
      events.push({
        type: String(type || "event"),
        atMs: round(now() - startedAt),
        detail: detail && typeof detail === "object" ? { ...detail } : detail,
      });
    }

    function reset() {
      metrics.clear();
      counters.clear();
      events.clear();
      active.clear();
    }

    function snapshot() {
      const metricOutput = {};
      metrics.forEach((state, name) => {
        metricOutput[name] = {
          count: state.count,
          totalMs: round(state.totalMs),
          averageMs: round(state.count ? state.totalMs / state.count : 0),
          maxMs: round(state.maxMs),
          latestMs: round(state.latestMs),
          samples: state.samples.snapshot(),
        };
      });

      return {
        version: "v247",
        capturedAt: new Date().toISOString(),
        elapsedMs: round(now() - startedAt),
        metrics: metricOutput,
        counters: Object.fromEntries(counters),
        events: events.snapshot(),
        activeMeasurements: active.size,
      };
    }

    return {
      record,
      start,
      end,
      increment,
      event,
      reset,
      snapshot,
    };
  }

  function describeElement(target) {
    if (!target || typeof target !== "object") return "";
    const tag = String(target.tagName || "").toLowerCase();
    const id = target.id ? `#${target.id}` : "";
    const classes =
      target.classList && typeof target.classList.value === "string"
        ? target.classList.value
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .map((name) => `.${name}`)
            .join("")
        : "";
    return `${tag}${id}${classes}`.slice(0, 180);
  }

  function installBrowserObservers(tracker, options = {}) {
    if (!globalScope?.document || !tracker) return () => {};

    const cleanups = [];
    const sampleFrameGaps = options.sampleFrameGaps !== false;
    let lastAction = null;

    const rememberAction = (event) => {
      lastAction = {
        type: event.type,
        target: describeElement(event.target),
        atMs: round(safeNow()),
      };
      tracker.event("interaction", lastAction);
    };

    globalScope.document.addEventListener("click", rememberAction, true);
    globalScope.document.addEventListener("keydown", rememberAction, true);
    cleanups.push(() => {
      globalScope.document.removeEventListener("click", rememberAction, true);
      globalScope.document.removeEventListener("keydown", rememberAction, true);
    });

    if (typeof globalScope.PerformanceObserver === "function") {
      try {
        const longTaskObserver = new globalScope.PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            tracker.record("browser.longTask", entry.duration, {
              name: entry.name || "longtask",
              action: lastAction,
            });
          });
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
        cleanups.push(() => longTaskObserver.disconnect());
      } catch {}

      try {
        const eventObserver = new globalScope.PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            tracker.record("browser.eventTiming", entry.duration, {
              name: entry.name,
              interactionId: entry.interactionId || 0,
              target: describeElement(entry.target),
            });
          });
        });
        eventObserver.observe({
          type: "event",
          buffered: true,
          durationThreshold: 16,
        });
        cleanups.push(() => eventObserver.disconnect());
      } catch {}
    }

    if (typeof globalScope.MutationObserver === "function") {
      try {
        const mutationObserver = new globalScope.MutationObserver((records) => {
          let added = 0;
          let removed = 0;
          let attributes = 0;
          records.forEach((record) => {
            added += record.addedNodes?.length || 0;
            removed += record.removedNodes?.length || 0;
            if (record.type === "attributes") attributes += 1;
          });
          const total = added + removed + attributes;
          if (total >= 25) {
            tracker.event("domMutationBurst", {
              records: records.length,
              added,
              removed,
              attributes,
              action: lastAction,
            });
            tracker.increment("browser.domMutationNodes", total);
          }
        });
        mutationObserver.observe(globalScope.document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden", "aria-hidden"],
        });
        cleanups.push(() => mutationObserver.disconnect());
      } catch {}
    }

    if (sampleFrameGaps && typeof globalScope.requestAnimationFrame === "function") {
      let frameId = 0;
      let previous = safeNow();
      let stopped = false;

      const frame = (timestamp) => {
        if (stopped) return;
        const gap = timestamp - previous;
        previous = timestamp;
        if (gap >= 50) {
          tracker.record("browser.frameGap", gap, {
            action: lastAction,
          });
        }
        frameId = globalScope.requestAnimationFrame(frame);
      };

      frameId = globalScope.requestAnimationFrame(frame);
      cleanups.push(() => {
        stopped = true;
        if (typeof globalScope.cancelAnimationFrame === "function") {
          globalScope.cancelAnimationFrame(frameId);
        }
      });
    }

    return () => cleanups.splice(0).forEach((cleanup) => {
      try {
        cleanup();
      } catch {}
    });
  }

  const api = {
    createBoundedList,
    createPerformanceTracker,
    describeElement,
    installBrowserObservers,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenrePerformance = api;

    if (globalScope.document && !globalScope.__dailyGenrePerformanceTracker) {
      const tracker = createPerformanceTracker();
      globalScope.__dailyGenrePerformanceTracker = tracker;
      globalScope.__dailyGenrePerformanceCleanup =
        installBrowserObservers(tracker);

      globalScope.dailyGenrePerformanceReport = () => tracker.snapshot();
      globalScope.resetDailyGenrePerformance = () => tracker.reset();
      globalScope.dailyGenrePerformanceMark = (type, detail) =>
        tracker.event(type, detail);
      globalScope.downloadDailyGenrePerformanceReport = () => {
        const report = tracker.snapshot();
        const blob = new Blob(
          [JSON.stringify(report, null, 2)],
          { type: "application/json" },
        );
        const url = URL.createObjectURL(blob);
        const link = globalScope.document.createElement("a");
        link.href = url;
        link.download = `dailygenre-performance-${Date.now()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return report;
      };
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
