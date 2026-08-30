(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DailyGenreArchiveViewModelCache = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function () {
    'use strict';

    function normalizeMaxEntries(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 1) return 12;
      return Math.max(1, Math.floor(number));
    }

    function createArchiveViewModelCache(options = {}) {
      const maxEntries = normalizeMaxEntries(options.maxEntries);
      const onEvent =
        typeof options.onEvent === 'function' ? options.onEvent : null;
      const entries = new Map();
      const counters = {
        hits: 0,
        misses: 0,
        writes: 0,
        evictions: 0,
        clears: 0,
      };
      let lastClearReason = '';

      function emit(type, detail = {}) {
        if (!onEvent) return;
        try {
          onEvent(type, detail);
        } catch (_) {}
      }

      function entryKey(revision, signature) {
        return `${String(revision ?? '')}\u0000${String(signature ?? '')}`;
      }

      function get(revision, signature) {
        const key = entryKey(revision, signature);
        if (!entries.has(key)) {
          counters.misses += 1;
          emit('miss', {
            revision: String(revision ?? ''),
            signature: String(signature ?? ''),
            size: entries.size,
          });
          return null;
        }

        const value = entries.get(key);
        entries.delete(key);
        entries.set(key, value);
        counters.hits += 1;
        emit('hit', {
          revision: String(revision ?? ''),
          signature: String(signature ?? ''),
          size: entries.size,
        });
        return value;
      }

      function set(revision, signature, value) {
        const key = entryKey(revision, signature);
        if (entries.has(key)) entries.delete(key);
        entries.set(key, value);
        counters.writes += 1;

        while (entries.size > maxEntries) {
          const oldestKey = entries.keys().next().value;
          entries.delete(oldestKey);
          counters.evictions += 1;
        }

        emit('write', {
          revision: String(revision ?? ''),
          signature: String(signature ?? ''),
          size: entries.size,
        });
        return value;
      }

      function clear(reason = 'manual') {
        entries.clear();
        counters.clears += 1;
        lastClearReason = String(reason || 'manual');
        emit('clear', {
          reason: lastClearReason,
          size: 0,
        });
      }

      function snapshot() {
        return {
          maxEntries,
          size: entries.size,
          lastClearReason,
          counters: { ...counters },
        };
      }

      return {
        get,
        set,
        clear,
        snapshot,
      };
    }

    return {
      createArchiveViewModelCache,
    };
  },
);
