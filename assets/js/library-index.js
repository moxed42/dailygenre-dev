/* Daily Genre v245: revisioned library index foundation. */

(function dailyGenreLibraryIndexModule(globalScope) {
  "use strict";

  function createRevisionedGenreIndex() {
    let revision = 0;
    let indexedRevision = -1;
    let indexedSource = null;
    let indexedLength = -1;
    let byId = null;

    function invalidate() {
      revision += 1;
      byId = null;
      indexedRevision = -1;
      indexedSource = null;
      indexedLength = -1;
      return revision;
    }

    function rebuild(rows) {
      byId = new Map(
        rows.map((genre) => [String(genre?.id ?? ""), genre]),
      );
      indexedRevision = revision;
      indexedSource = rows;
      indexedLength = rows.length;
    }

    function getById(source, id) {
      const rows = Array.isArray(source) ? source : [];
      if (
        !byId ||
        indexedRevision !== revision ||
        indexedSource !== rows ||
        indexedLength !== rows.length
      ) {
        rebuild(rows);
      }
      return byId.get(String(id)) || null;
    }

    function stats() {
      return {
        revision,
        indexedRevision,
        indexedLength,
        size: byId?.size || 0,
        ready: Boolean(byId && indexedRevision === revision),
      };
    }

    return {
      getById,
      invalidate,
      revision: () => revision,
      stats,
    };
  }

  const api = { createRevisionedGenreIndex };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenreLibraryIndex = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
