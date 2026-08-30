/* Daily Genre v248.1: lightweight revision-aware screen cache. */
(function dailyGenreScreenCacheModule(globalScope) {
  "use strict";

  function stableString(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function createScreenRenderCache(options = {}) {
    const entries = new Map();
    const counters = { hits: 0, misses: 0, renders: 0, invalidations: 0, bypasses: 0 };
    const getRevision = typeof options.getRevision === "function" ? options.getRevision : () => 0;
    const getSignature = typeof options.getSignature === "function" ? options.getSignature : () => "";
    const isReady = typeof options.isReady === "function" ? options.isReady : () => true;
    const isAllowed = typeof options.isAllowed === "function" ? options.isAllowed : () => true;
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};

    function stateFor(screen) {
      return {
        revision: stableString(getRevision(screen)),
        signature: stableString(getSignature(screen)),
      };
    }

    function shouldRender(screen, options = {}) {
      const key = String(screen || "");
      const force = Boolean(options.force);

      if (!key || force || !isAllowed(screen)) {
        counters.bypasses += 1;
        onEvent("bypass", { screen: key, force });
        return true;
      }

      const previous = entries.get(key);
      if (!previous || !isReady(screen)) {
        counters.misses += 1;
        onEvent("miss", { screen: key, reason: previous ? "target-not-ready" : "empty" });
        return true;
      }

      const current = stateFor(screen);
      if (
        previous.revision === current.revision &&
        previous.signature === current.signature
      ) {
        counters.hits += 1;
        onEvent("hit", { screen: key, ...current });
        return false;
      }

      counters.misses += 1;
      onEvent("miss", {
        screen: key,
        reason: "state-changed",
        previousRevision: previous.revision,
        currentRevision: current.revision,
        previousSignature: previous.signature,
        currentSignature: current.signature,
      });
      return true;
    }

    function markRendered(screen) {
      const key = String(screen || "");
      if (!key) return null;
      const state = stateFor(screen);
      entries.set(key, state);
      counters.renders += 1;
      onEvent("render", { screen: key, ...state });
      return { ...state };
    }

    function invalidate(screen = null, reason = "manual") {
      if (screen == null) entries.clear();
      else entries.delete(String(screen));
      counters.invalidations += 1;
      onEvent("invalidate", {
        screen: screen == null ? "*" : String(screen),
        reason,
      });
    }

    function snapshot() {
      return {
        entries: Object.fromEntries(
          Array.from(entries.entries()).map(([screen, state]) => [screen, { ...state }]),
        ),
        counters: { ...counters },
      };
    }

    return { shouldRender, markRendered, invalidate, snapshot };
  }

  const api = { createScreenRenderCache };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.DailyGenreScreenCache = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
