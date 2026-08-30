/* Daily Genre local data cache.
   Persists the last successfully loaded genre library in IndexedDB, keyed by
   the GitHub blob SHA the app already fetches for freshness checks. On a
   repeat visit, loadData() (app.js) can skip the multi-MB Worker/GitHub fetch
   entirely when the cached SHA still matches the current remote SHA.

   The decision logic below (normalizeCachedEntry/shouldUseCachedLibrary) is
   pure and browser-independent -- covered by tests/data-cache.test.js. The
   IndexedDB I/O is wrapped so any failure (unsupported browser, quota,
   blocked transaction, corrupted record) is treated the same as "no cache
   yet": callers silently fall back to a full network fetch. */

(function dailyGenreDataCacheModule(globalScope) {
  "use strict";

  const DB_NAME = "dailygenre-cache";
  const DB_VERSION = 1;
  const STORE_NAME = "genreLibrary";
  const RECORD_KEY = "main";

  // Returns a plausible {sha, data} shape, or null if the stored record is
  // missing/corrupted/from an incompatible shape. Treating anything
  // unexpected as null means a corrupted cache is just a cache miss.
  function normalizeCachedEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const sha = typeof raw.sha === "string" ? raw.sha : "";
    const data = raw.data;
    if (!sha || !Array.isArray(data) || data.length === 0) return null;
    return { sha, data };
  }

  // True only when the cached entry's SHA matches the current remote SHA.
  // An empty/unknown remote SHA (metadata fetch failed) can't be verified,
  // so the cache is not trusted in that case either.
  function shouldUseCachedLibrary(cachedEntry, remoteSha) {
    const entry = normalizeCachedEntry(cachedEntry);
    const sha = typeof remoteSha === "string" ? remoteSha : "";
    if (!entry || !sha) return false;
    return entry.sha === sha;
  }

  function hasIndexedDb() {
    return typeof globalScope !== "undefined" && !!globalScope.indexedDB;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!hasIndexedDb()) {
        reject(new Error("IndexedDB not available"));
        return;
      }
      const request = globalScope.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function load() {
    if (!hasIndexedDb()) return null;
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
          req.onsuccess = () => resolve(normalizeCachedEntry(req.result));
          req.onerror = () => resolve(null);
        } catch (_) {
          resolve(null);
        }
      });
    } catch (_) {
      return null;
    }
  }

  async function save(sha, data) {
    if (!hasIndexedDb() || !sha || !Array.isArray(data) || !data.length) return false;
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put({ sha, data }, RECORD_KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (_) {
          resolve(false);
        }
      });
    } catch (_) {
      return false;
    }
  }

  const api = { normalizeCachedEntry, shouldUseCachedLibrary, load, save };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenreDataCache = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
