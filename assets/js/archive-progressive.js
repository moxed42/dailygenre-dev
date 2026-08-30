(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DailyGenreArchiveProgressive = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function () {
    'use strict';

    function normalizePositiveInteger(value, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 1) return fallback;
      return Math.max(1, Math.floor(number));
    }

    function normalizeTotal(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return 0;
      return Math.floor(number);
    }

    function createArchiveProgressiveState(options = {}) {
      const batchSize = normalizePositiveInteger(options.batchSize, 80);
      let initialized = false;
      let signature = '';
      let total = 0;
      let rendered = 0;
      let resets = 0;
      let loads = 0;

      function snapshot() {
        const remaining = Math.max(0, total - rendered);
        return {
          batchSize,
          signature,
          total,
          rendered,
          remaining,
          hasMore: remaining > 0,
          resets,
          loads,
        };
      }

      function prepare(nextSignature, nextTotal) {
        const normalizedSignature = String(nextSignature ?? '');
        const normalizedTotal = normalizeTotal(nextTotal);
        const signatureChanged =
          !initialized || normalizedSignature !== signature;

        if (signatureChanged) {
          initialized = true;
          signature = normalizedSignature;
          total = normalizedTotal;
          rendered = Math.min(batchSize, total);
          resets += 1;
          return snapshot();
        }

        total = normalizedTotal;
        const minimumVisible = Math.min(batchSize, total);
        rendered = Math.min(total, Math.max(rendered, minimumVisible));
        return snapshot();
      }

      function loadMore() {
        if (rendered < total) {
          rendered = Math.min(total, rendered + batchSize);
          loads += 1;
        }
        return snapshot();
      }

      function reset() {
        initialized = false;
        signature = '';
        total = 0;
        rendered = 0;
        return snapshot();
      }

      return {
        prepare,
        loadMore,
        reset,
        snapshot,
      };
    }

    return {
      createArchiveProgressiveState,
    };
  },
);
