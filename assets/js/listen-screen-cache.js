/* Daily Genre v249: mounted listen-screen reuse helper. */
(function dailyGenreListenScreenCacheModule(globalScope) {
  "use strict";

  function stable(value) {
    return value == null ? "" : String(value);
  }

  function createMountedListenScreenCache(options = {}) {
    const counters = { hits: 0, misses: 0, renders: 0, invalidations: 0 };
    let state = null;
    const getRevision = typeof options.getRevision === "function" ? options.getRevision : () => "";
    const isReady = typeof options.isReady === "function" ? options.isReady : () => true;
    const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};

    function currentState(genre) {
      return {
        genreId: stable(genre?.id ?? genre?.genre),
        revision: stable(getRevision()),
      };
    }

    function canReuse(genre, options = {}) {
      if (options.force === true || !state || !isReady()) {
        counters.misses += 1;
        onEvent("miss", {
          reason: options.force === true
            ? "forced"
            : (!state ? "empty" : "target-not-ready"),
        });
        return false;
      }

      const current = currentState(genre);
      const reusable =
        current.genreId &&
        state.genreId === current.genreId &&
        state.revision === current.revision;

      if (reusable) {
        counters.hits += 1;
        onEvent("hit", current);
        return true;
      }

      counters.misses += 1;
      onEvent("miss", {
        reason: "state-changed",
        previous: { ...state },
        current,
      });
      return false;
    }

    function markRendered(genre) {
      state = currentState(genre);
      counters.renders += 1;
      onEvent("render", { ...state });
      return { ...state };
    }

    function invalidate(reason = "manual") {
      state = null;
      counters.invalidations += 1;
      onEvent("invalidate", { reason });
    }

    function snapshot() {
      return {
        state: state ? { ...state } : null,
        counters: { ...counters },
      };
    }

    return { canReuse, markRendered, invalidate, snapshot };
  }

  const api = { createMountedListenScreenCache };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.DailyGenreListenScreenCache = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
