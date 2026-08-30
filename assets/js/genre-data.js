/*
  Daily Genre Core Loader Protection v1
  ------------------------------------
  This file intentionally does NOT replace app.js data loading yet.
  It adds guardrails, diagnostics, and a small public health API around the
  existing loader so UI experiments can fail loudly instead of silently breaking
  the whole app.

  Load order: after utils.js and before spotify.js/app.js.
*/
(function dailyGenreCoreLoaderProtection() {
  "use strict";

  const CORE_VERSION = "core-loader-protection-v58";
  const state = {
    version: CORE_VERSION,
    startedAt: new Date().toISOString(),
    bootErrors: [],
    unhandledRejections: [],
    lastHealth: null,
    healthTimer: null,
    fetchProbe: null,
  };

  function safeText(value) {
    return String(value == null ? "" : value);
  }

  function normalizeStatus(value) {
    return safeText(value).trim().toLowerCase();
  }

  function isLoadedGenresArray() {
    return Array.isArray(window.genres) && window.genres.length > 0;
  }

  function getDataSource() {
    return window.dailyGenreDataSource || null;
  }

  function countGenreRows(rows) {
    const data = Array.isArray(rows) ? rows : [];
    const counts = {
      loaded: data.length,
      spinEligible: 0,
      notInSpinner: 0,
      listened: 0,
      zangerOrVeto: 0,
      excluded: 0,
      blankStatus: 0,
      otherStatus: 0,
      pendingReview: 0,
      withAlbumDive: 0,
    };

    data.forEach((genre) => {
      const status = normalizeStatus(genre && genre.status);
      const rating = normalizeStatus(genre && genre.rating);
      const hasAlbumDive = !!(
        genre &&
        genre.album_dive &&
        Array.isArray(genre.album_dive.slots) &&
        genre.album_dive.slots.length
      );
      if (hasAlbumDive) counts.withAlbumDive += 1;
      if (
        Array.isArray(genre && genre.pending_songs) &&
        genre.pending_songs.length
      )
        counts.pendingReview += 1;

      if (!status) counts.blankStatus += 1;
      if (status === "listened") counts.listened += 1;
      else if (status === "zanger" || status === "veto" || rating === "zanger")
        counts.zangerOrVeto += 1;
      else if (
        status === "excluded" ||
        status === "too_broad" ||
        status === "broad_header_excluded"
      )
        counts.excluded += 1;
      else if (status && status !== "unlistened") counts.otherStatus += 1;

      const isExcluded =
        status === "listened" ||
        status === "zanger" ||
        status === "veto" ||
        rating === "zanger" ||
        status === "excluded" ||
        status === "too_broad" ||
        status === "broad_header_excluded";

      if (isExcluded) counts.notInSpinner += 1;
      else counts.spinEligible += 1;
    });

    return counts;
  }

  function buildHealth() {
    const rows = Array.isArray(window.genres) ? window.genres : [];
    const remainingEl = document.getElementById("remainingCount");
    const manualSearchEl = document.getElementById("manualSearch2");
    const health = {
      ok: isLoadedGenresArray(),
      version: CORE_VERSION,
      checkedAt: new Date().toISOString(),
      counts: countGenreRows(rows),
      dataSource: getDataSource(),
      remainingText: remainingEl ? remainingEl.textContent : "",
      hasManualSearch: !!manualSearchEl,
      hasLoadDataFunction: typeof window.loadData === "function",
      lastBootError: state.bootErrors[state.bootErrors.length - 1] || null,
      lastUnhandledRejection:
        state.unhandledRejections[state.unhandledRejections.length - 1] || null,
    };
    state.lastHealth = health;
    return health;
  }

  function ensureHealthPanel() {
    let panel = document.getElementById("dgCoreHealthPanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "dgCoreHealthPanel";
    panel.className = "dg-core-health-panel hidden";
    panel.innerHTML = `
      <div class="dg-core-health-card">
        <div class="dg-core-health-kicker">Daily Genre core</div>
        <h3>Genres did not finish loading</h3>
        <p class="dg-core-health-copy">The loader is protected, but the app still hit a startup problem. The first browser-console error is usually the useful one.</p>
        <div id="dgCoreHealthDetails" class="dg-core-health-details"></div>
        <div class="dg-core-health-actions">
          <button type="button" class="btn btn-primary" id="dgCoreRetryLoadBtn">Retry load</button>
          <button type="button" class="btn btn-secondary" id="dgCoreCopyHealthBtn">Copy diagnostics</button>
          <button type="button" class="btn btn-ghost" id="dgCoreDismissHealthBtn">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel
      .querySelector("#dgCoreRetryLoadBtn")
      ?.addEventListener("click", async () => {
        if (typeof window.loadData !== "function") {
          showCoreToast(
            "loadData() is not available. app.js likely failed before defining it.",
            true,
          );
          return;
        }
        try {
          await window.loadData();
          runHealthCheck({ showOnFailure: true, source: "manual-retry" });
        } catch (err) {
          state.bootErrors.push(summarizeError(err));
          renderHealthPanel(buildHealth());
        }
      });

    panel
      .querySelector("#dgCoreCopyHealthBtn")
      ?.addEventListener("click", async () => {
        const payload = JSON.stringify(buildHealth(), null, 2);
        try {
          await navigator.clipboard.writeText(payload);
          showCoreToast("Copied loader diagnostics.", false);
        } catch {
          console.info("[Daily Genre] Loader diagnostics:", payload);
          showCoreToast("Diagnostics printed to console.", false);
        }
      });

    panel
      .querySelector("#dgCoreDismissHealthBtn")
      ?.addEventListener("click", () => panel.classList.add("hidden"));
    return panel;
  }

  function summarizeError(error) {
    if (!error) return null;
    return {
      message: safeText(error.message || error.reason || error),
      source: safeText(error.filename || error.source || ""),
      line: error.lineno || error.line || null,
      column: error.colno || error.column || null,
      stack: safeText(
        (error.error && error.error.stack) || error.stack || "",
      ).slice(0, 1800),
      at: new Date().toISOString(),
    };
  }

  function renderHealthPanel(health) {
    const panel = ensureHealthPanel();
    const details = panel.querySelector("#dgCoreHealthDetails");
    if (details) {
      const counts = health.counts || {};
      const lastError = health.lastBootError || health.lastUnhandledRejection;
      details.innerHTML = `
        <div><strong>Loaded rows:</strong> ${counts.loaded || 0}</div>
        <div><strong>Spinner eligible:</strong> ${counts.spinEligible || 0}</div>
        <div><strong>Source:</strong> ${escapeHtml(health.dataSource?.source || "not selected yet")}</div>
        <div><strong>loadData available:</strong> ${health.hasLoadDataFunction ? "yes" : "no"}</div>
        ${lastError ? `<div><strong>Last error:</strong> ${escapeHtml(lastError.message || "unknown")}</div>` : ""}
      `;
    }
    panel.classList.remove("hidden");
  }

  function showCoreToast(message, isError) {
    if (typeof window.showSaveToast === "function") {
      window.showSaveToast(message, !!isError);
      return;
    }
    console[isError ? "warn" : "info"](`[Daily Genre] ${message}`);
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function runHealthCheck(options = {}) {
    const health = buildHealth();
    const shouldShow = options.showOnFailure !== false;

    if (health.ok) {
      const panel = document.getElementById("dgCoreHealthPanel");
      if (panel) panel.classList.add("hidden");
      console.info("[Daily Genre] Core loader healthy", health);
      window.dispatchEvent(
        new CustomEvent("dailygenre:core-healthy", { detail: health }),
      );
      return health;
    }

    console.warn("[Daily Genre] Core loader health check failed", health);
    window.dispatchEvent(
      new CustomEvent("dailygenre:core-load-failed", { detail: health }),
    );
    if (shouldShow) renderHealthPanel(health);
    return health;
  }

  async function probeDataEndpoints() {
    const result = {
      checkedAt: new Date().toISOString(),
      worker: null,
      raw: null,
    };

    try {
      if (typeof WORKER_URL !== "undefined") {
        const res = await fetch(WORKER_URL, {
          method: "GET",
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        result.worker = {
          ok: res.ok,
          status: res.status,
          rowCount: Array.isArray(data.data) ? data.data.length : null,
          shapeOk: !!(data && data.ok && Array.isArray(data.data)),
        };
      }
    } catch (err) {
      result.worker = { ok: false, error: summarizeError(err) };
    }

    try {
      if (typeof DATA_URL !== "undefined") {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        result.raw = {
          ok: res.ok,
          status: res.status,
          rowCount: Array.isArray(data) ? data.length : null,
          shapeOk: Array.isArray(data),
        };
      }
    } catch (err) {
      result.raw = { ok: false, error: summarizeError(err) };
    }

    state.fetchProbe = result;
    console.info("[Daily Genre] Data endpoint probe", result);
    return result;
  }

  window.addEventListener("error", (event) => {
    state.bootErrors.push(summarizeError(event));
  });

  window.addEventListener("unhandledrejection", (event) => {
    state.unhandledRejections.push(summarizeError(event.reason));
  });

  window.DailyGenreCore = Object.freeze({
    version: CORE_VERSION,
    state,
    countGenreRows,
    health: buildHealth,
    check: runHealthCheck,
    probe: probeDataEndpoints,
  });

  // Give app.js enough time to boot and fetch data. This is diagnostic only;
  // it does not control the loader or mutate app state. Production data can now
  // take several seconds, so do a quiet early check and only show the modal
  // after a longer grace period.
  window.addEventListener("load", () => {
    clearTimeout(state.healthTimer);
    state.healthTimer = setTimeout(() => {
      const first = runHealthCheck({ showOnFailure: false, source: "window-load-delay-soft" });
      if (first && first.ok) return;
      state.healthTimer = setTimeout(
        () => runHealthCheck({ showOnFailure: true, source: "window-load-delay-final" }),
        12000,
      );
    }, 8000);
  });
})();
