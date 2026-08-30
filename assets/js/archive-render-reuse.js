(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DailyGenreArchiveRenderReuse = api;
  }
})(
  typeof globalThis !== 'undefined' ? globalThis : this,
  function () {
    'use strict';

    function count(value) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0) return 0;
      return Math.floor(number);
    }

    function normalizeSnapshot(input = {}) {
      return {
        signature: String(input.signature || ''),
        total: count(input.total),
        rendered: count(input.rendered),
        domCards: count(input.domCards),
      };
    }

    function createArchiveRenderReuse(options = {}) {
      const onEvent =
        typeof options.onEvent === 'function' ? options.onEvent : null;
      let current = normalizeSnapshot();
      let lastOutcome = '';
      let lastReason = '';
      const counters = {
        reuses: 0,
        misses: 0,
        remembers: 0,
        invalidations: 0,
        forced: 0,
      };

      function emit(type, detail = {}) {
        if (!onEvent) return;
        try {
          onEvent(type, detail);
        } catch (_) {}
      }

      function miss(reason, next) {
        counters.misses += 1;
        lastOutcome = 'miss';
        lastReason = reason;
        emit('miss', {
          reason,
          current: { ...current },
          next: { ...next },
        });
        return false;
      }

      function shouldReuse(input = {}) {
        const next = normalizeSnapshot(input);

        if (input.force) {
          counters.forced += 1;
          lastOutcome = 'forced';
          lastReason = String(input.forceReason || 'forced');
          emit('forced', {
            reason: lastReason,
            current: { ...current },
            next: { ...next },
          });
          return false;
        }

        if (!next.signature) return miss('empty-signature', next);
        if (!current.signature) return miss('uninitialized', next);
        if (current.signature !== next.signature) {
          return miss('signature-changed', next);
        }
        if (current.total !== next.total) return miss('total-changed', next);
        if (current.rendered !== next.rendered) {
          return miss('rendered-count-changed', next);
        }
        if (
          next.domCards !== next.rendered ||
          current.domCards !== next.domCards
        ) {
          return miss('dom-card-count-mismatch', next);
        }

        counters.reuses += 1;
        lastOutcome = 'reuse';
        lastReason = 'same-signature-and-counts';
        emit('reuse', {
          reason: lastReason,
          snapshot: { ...next },
        });
        return true;
      }

      function remember(input = {}, reason = 'render') {
        current = normalizeSnapshot(input);
        counters.remembers += 1;
        lastOutcome = 'remember';
        lastReason = String(reason || 'render');
        emit('remember', {
          reason: lastReason,
          snapshot: { ...current },
        });
        return { ...current };
      }

      function invalidate(reason = 'manual') {
        current = normalizeSnapshot();
        counters.invalidations += 1;
        lastOutcome = 'invalidate';
        lastReason = String(reason || 'manual');
        emit('invalidate', { reason: lastReason });
      }

      function snapshot() {
        return {
          current: { ...current },
          lastOutcome,
          lastReason,
          counters: { ...counters },
        };
      }

      return {
        shouldReuse,
        remember,
        invalidate,
        snapshot,
      };
    }

    return {
      createArchiveRenderReuse,
    };
  },
);
