/* Daily Genre v288 — local, deterministic similar-genre search. */
(() => {
  const MODE_KEY = "dailyGenreLibrarySearchMode";
  const STYLE_ID = "dg-similar-genres-style-v288";
  const RESULTS_ID = "dgSimilarGenreResults";
  const STOPWORDS = new Set([
    "the","a","an","and","or","of","in","to","for","with","from","by",
    "music","genre","style","styles","sound","sounds","based","influenced",
    "fusion","form","forms","scene","scenes","movement","traditional"
  ]);

  function getGenres() {
    try { if (Array.isArray(genres)) return genres; } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function norm(value = "") {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
      .trim().replace(/\s+/g, " ");
  }

  function tokens(value = "") {
    return norm(value).split(" ").filter(Boolean)
      .filter(token => token.length > 1 && !STOPWORDS.has(token));
  }

  function unique(values) { return [...new Set(values.filter(Boolean))]; }

  function aliasesFor(genre) {
    const raw = genre?.aliases || genre?.alias || genre?.synonyms || "";
    if (Array.isArray(raw)) return raw.map(String).map(v => v.trim()).filter(Boolean);
    return String(raw || "").split(/[,;|]/).map(v => v.trim()).filter(Boolean);
  }

  function categoryFor(genre) {
    return String(genre?.category_path || genre?.categoryPath || genre?.category ||
      genre?.parent_category || genre?.parentCategory || "").trim();
  }

  function descriptionFor(genre) {
    return [genre?.description, genre?.summary, genre?.vibe, genre?.genre_description,
      genre?.key_artists, genre?.keyArtists].filter(Boolean).join(" ");
  }

  function genreName(genre) { return String(genre?.genre || genre?.name || "").trim(); }

  function editDistance(a, b) {
    const left = norm(a), right = norm(b);
    if (!left) return right.length;
    if (!right) return left.length;
    const row = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= right.length; j++) {
        const saved = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1,
          prev + (left[i - 1] === right[j - 1] ? 0 : 1));
        prev = saved;
      }
    }
    return row[right.length];
  }

  function stringSimilarity(a, b) {
    const left = norm(a), right = norm(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) {
      return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    }
    return 1 - editDistance(left, right) / Math.max(left.length, right.length);
  }

  function overlap(leftTokens, rightTokens) {
    if (!leftTokens.length || !rightTokens.length) return [];
    const right = new Set(rightTokens);
    return unique(leftTokens.filter(token => right.has(token)));
  }

  function listenedDate(genre) {
    return String(genre?.listen_date || genre?.listenDate || genre?.date_listened ||
      genre?.dateListened || genre?.date || "").trim();
  }

  function isListened(genre) {
    return Boolean(listenedDate(genre) || String(genre?.status || "").toLowerCase() === "listened" ||
      (/^[1-5]$/.test(String(genre?.rating || ""))));
  }

  function ratingText(genre) {
    const rating = String(genre?.rating || "").trim();
    return /^[1-5]$/.test(rating) ? `${rating}★` : "";
  }

  function scoreGenre(query, genre) {
    const name = genreName(genre);
    if (!name) return null;

    const aliases = aliasesFor(genre);
    const category = categoryFor(genre);
    const description = descriptionFor(genre);
    const queryNorm = norm(query);
    const queryTokens = tokens(query);
    const nameTokens = tokens(name);
    const aliasTokens = tokens(aliases.join(" "));
    const categoryTokens = tokens(category);
    const descriptionTokens = tokens(description);

    let score = 0;
    const reasons = [];
    const nameSimilarity = stringSimilarity(query, name);
    const bestAliasSimilarity = aliases.reduce((best, alias) => Math.max(best, stringSimilarity(query, alias)), 0);

    if (queryNorm === norm(name)) {
      score += 100;
      reasons.push("Exact genre-name match");
    } else if (aliases.some(alias => norm(alias) === queryNorm)) {
      score += 92;
      reasons.push("Exact alias match");
    } else {
      if (nameSimilarity >= 0.84) {
        score += 48 * nameSimilarity;
        reasons.push("Very similar genre name");
      } else if (nameSimilarity >= 0.62) {
        score += 30 * nameSimilarity;
        reasons.push("Related genre name");
      }
      if (bestAliasSimilarity >= 0.72) {
        score += 34 * bestAliasSimilarity;
        reasons.push("Similar alias");
      }
    }

    const nameOverlap = overlap(queryTokens, nameTokens);
    const aliasOverlap = overlap(queryTokens, aliasTokens);
    const categoryOverlap = overlap(queryTokens, categoryTokens);
    const descriptionOverlap = overlap(queryTokens, descriptionTokens);

    if (nameOverlap.length) {
      score += Math.min(28, nameOverlap.length * 12);
      reasons.push(`Shared name terms: ${nameOverlap.slice(0, 3).join(", ")}`);
    }
    if (aliasOverlap.length) {
      score += Math.min(22, aliasOverlap.length * 9);
      reasons.push(`Shared aliases: ${aliasOverlap.slice(0, 3).join(", ")}`);
    }
    if (categoryOverlap.length) {
      score += Math.min(20, categoryOverlap.length * 8);
      reasons.push(`Same family: ${category || categoryOverlap.join(", ")}`);
    }
    if (descriptionOverlap.length) {
      score += Math.min(18, descriptionOverlap.length * 4);
      reasons.push(`Shared concepts: ${descriptionOverlap.slice(0, 4).join(", ")}`);
    }

    const conceptGroups = [
      ["latin","latino","latina","hispanic","spanish","espanol","chicano","mexican"],
      ["black","african","afro"],
      ["electronic","electronica","synth","techno","house","trance"],
      ["rock","punk","metal","hardcore"],
      ["folk","traditional","roots","americana","country"],
      ["jazz","swing","bebop"],
      ["rap","hip","hop","trap"],
      ["pop","dance","disco"]
    ];
    const combinedGenreTokens = new Set([...nameTokens, ...aliasTokens, ...categoryTokens, ...descriptionTokens]);
    conceptGroups.forEach(group => {
      const queryHits = group.filter(word => queryTokens.includes(word));
      const genreHits = group.filter(word => combinedGenreTokens.has(word));
      if (queryHits.length && genreHits.length) {
        const exactShared = queryHits.some(word => genreHits.includes(word));
        score += exactShared ? 8 : 12;
        if (!exactShared) reasons.push(`Related concept: ${unique([...queryHits, ...genreHits]).slice(0, 4).join(", ")}`);
      }
    });

    if (isListened(genre)) score += 4;
    if (score < 12) return null;
    return { genre, score, reasons: unique(reasons).slice(0, 3) };
  }

  function searchSimilarGenres(query, limit = 24) {
    const clean = String(query || "").trim();
    if (clean.length < 2) return [];
    return getGenres().map(genre => scoreGenre(clean, genre)).filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (isListened(b.genre) !== isListened(a.genre)) return Number(isListened(b.genre)) - Number(isListened(a.genre));
        return genreName(a.genre).localeCompare(genreName(b.genre));
      }).slice(0, limit);
  }

  function escapeHtml(value = "") {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) return "";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function openGenre(genre) {
    const id = String(genre?.id ?? "");
    if (!id) return;
    if (typeof window.openGenreByIdEncoded === "function") {
      window.openGenreByIdEncoded(encodeURIComponent(id), true);
      return;
    }
    try { if (typeof openGenreByIdEncoded === "function") openGenreByIdEncoded(encodeURIComponent(id), true); } catch (_) {}
  }

  function renderResults(query) {
    const panel = document.getElementById(RESULTS_ID);
    if (!panel) return;
    const results = searchSimilarGenres(query);
    if (String(query || "").trim().length < 2) {
      panel.innerHTML = `<div class="dg-similar-empty">Type at least two characters to find musically adjacent genres.</div>`;
      return;
    }
    if (!results.length) {
      panel.innerHTML = `<div class="dg-similar-empty">No strong related genres found. Try a broader term or an alias.</div>`;
      return;
    }

    panel.innerHTML = `
      <div class="dg-similar-summary">
        <strong>${results.length} related genre${results.length === 1 ? "" : "s"}</strong>
        <span>Ranked locally from names, aliases, categories, and descriptions.</span>
      </div>
      <div class="dg-similar-grid">
        ${results.map((result, index) => {
          const genre = result.genre;
          const listened = isListened(genre);
          const date = formatDate(listenedDate(genre));
          const rating = ratingText(genre);
          const aliases = aliasesFor(genre).slice(0, 4);
          const category = categoryFor(genre);
          const id = String(genre?.id ?? "");
          const status = [listened ? "Listened" : "Unlistened", date, rating].filter(Boolean).join(" · ");
          return `<article class="dg-similar-card ${listened ? "is-listened" : ""}">
            <div class="dg-similar-rank">${index + 1}</div>
            <div class="dg-similar-main">
              <div class="dg-similar-title-row">
                <h3>${escapeHtml(genreName(genre))}</h3>
                <span class="dg-similar-status">${escapeHtml(status)}</span>
              </div>
              ${aliases.length ? `<div class="dg-similar-aliases">${escapeHtml(aliases.join(", "))}</div>` : ""}
              ${category ? `<div class="dg-similar-category">${escapeHtml(category)}</div>` : ""}
              <div class="dg-similar-reasons">${result.reasons.map(reason => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-tiny" data-dg-open-similar="${escapeHtml(id)}">Open genre</button>
          </article>`;
        }).join("")}
      </div>`;

    panel.querySelectorAll("[data-dg-open-similar]").forEach(button => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-dg-open-similar");
        const genre = getGenres().find(item => String(item?.id ?? "") === String(id));
        if (genre) openGenre(genre);
      });
    });
  }

  function currentMode() {
    try { return localStorage.getItem(MODE_KEY) === "similar" ? "similar" : "exact"; }
    catch (_) { return "exact"; }
  }

  function setMode(mode) {
    const normalized = mode === "similar" ? "similar" : "exact";
    try { localStorage.setItem(MODE_KEY, normalized); } catch (_) {}
    document.querySelectorAll("[data-dg-search-mode]").forEach(button => {
      const active = button.dataset.dgSearchMode === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const panel = document.getElementById(RESULTS_ID);
    const input = document.getElementById("archiveSearchInput");
    if (panel) panel.hidden = normalized !== "similar";
    if (input) {
      input.placeholder = normalized === "similar" ? "Find related genres, aliases, and neighboring styles…" : "Search the library…";
      if (normalized === "similar") renderResults(input.value);
      else input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .dg-library-search-mode{display:inline-flex;gap:4px;padding:3px;margin-left:8px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(255,255,255,.045);vertical-align:middle}
      .dg-library-search-mode button{border:0;border-radius:999px;padding:.38rem .68rem;background:transparent;color:inherit;font:inherit;font-size:.74rem;font-weight:850;cursor:pointer;opacity:.7}
      .dg-library-search-mode button.active{background:rgba(255,255,255,.14);opacity:1}
      .dg-similar-results{margin:14px 0 20px}.dg-similar-results[hidden]{display:none!important}
      .dg-similar-summary{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 16px;margin-bottom:10px;color:rgba(255,245,223,.78)}
      .dg-similar-summary span{font-size:.78rem;opacity:.72}.dg-similar-grid{display:grid;gap:9px}
      .dg-similar-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 13px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.045)}
      .dg-similar-card.is-listened{border-color:rgba(239,188,82,.3)}
      .dg-similar-rank{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.09);font-weight:900;font-size:.76rem}
      .dg-similar-title-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:5px 10px}.dg-similar-title-row h3{margin:0;font-size:1rem}
      .dg-similar-status,.dg-similar-aliases,.dg-similar-category{font-size:.75rem;opacity:.72}.dg-similar-category{margin-top:2px}
      .dg-similar-reasons{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.dg-similar-reasons span{padding:.22rem .42rem;border-radius:999px;background:rgba(255,255,255,.07);font-size:.69rem}
      .dg-similar-empty{padding:16px;border:1px dashed rgba(255,255,255,.15);border-radius:12px;opacity:.72}
      @media(max-width:680px){.dg-library-search-mode{width:100%;margin:8px 0 0}.dg-library-search-mode button{flex:1}.dg-similar-card{grid-template-columns:auto minmax(0,1fr)}.dg-similar-card>.btn{grid-column:2;justify-self:start}}
      .dg-similar-rail{margin:16px 0;padding:14px 16px;border:1px solid var(--border,#b98e55);border-radius:14px;background:var(--surface,#f3e4c8);color:var(--text,#22160d)}
      .dg-similar-rail-head{margin-bottom:10px}
      .dg-similar-rail-head p.small{margin:2px 0 0;color:var(--muted,#735a3c);font-size:.78rem}
      .dg-similar-rail-track{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(180px,1fr);gap:10px;overflow-x:auto;padding-bottom:2px;scroll-snap-type:x proximity}
      .dg-similar-rail-card{scroll-snap-align:start;display:flex;flex-direction:column;gap:4px;padding:11px 12px;border:1px solid rgba(0,0,0,.12);border-radius:12px;background:rgba(255,255,255,.5)}
      .dg-similar-rail-card.is-listened{border-color:var(--accent,#d98d25)}
      .dg-similar-rail-name{font-weight:900;font-size:.92rem}
      .dg-similar-rail-reason{font-size:.74rem;color:var(--muted,#735a3c)}
      .dg-similar-rail-status{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.03em;opacity:.75}
      .dg-similar-rail-card .btn{margin-top:4px;align-self:flex-start}
      @media(max-width:680px){.dg-similar-rail-track{grid-auto-columns:minmax(160px,82%)}}
    `;
    document.head.appendChild(style);
  }

  function findSearchMount(input) {
    return input.closest(".archive-search, .archive-filter, .library-search, .filter-group, .form-group") || input.parentElement;
  }

  function enhanceLibrarySearch() {
    const input = document.getElementById("archiveSearchInput");
    if (!input || input.dataset.dgSimilarEnhanced === "true") return false;
    input.dataset.dgSimilarEnhanced = "true";
    const mount = findSearchMount(input);
    if (!mount) return false;

    const controls = document.createElement("div");
    controls.className = "dg-library-search-mode";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Library search mode");
    controls.innerHTML = `<button type="button" data-dg-search-mode="exact">Exact</button><button type="button" data-dg-search-mode="similar">Similar styles</button>`;
    mount.appendChild(controls);

    let panel = document.getElementById(RESULTS_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = RESULTS_ID;
      panel.className = "dg-similar-results";
      panel.hidden = true;
      const target = document.getElementById("historyContent") || document.getElementById("historyList") || document.querySelector("#screen-history .archive-list") || mount.parentElement;
      target?.parentElement?.insertBefore(panel, target);
    }

    controls.querySelectorAll("[data-dg-search-mode]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.dgSearchMode)));
    input.addEventListener("input", event => {
      if (currentMode() !== "similar") return;
      event.stopImmediatePropagation();
      renderResults(input.value);
    }, true);
    setMode(currentMode());
    return true;
  }

  function currentGenreObject() {
    try { if (currentGenre) return currentGenre; } catch (_) {}
    return window.currentGenre || null;
  }

  /* Daily Genre Part 3 Phase 10: "Sounds like this" inline rail.
     Replaces the old "Check for similar genres" button, which used to eject
     the user to the Library screen and type their own genre name into
     search. That entry point is gone -- this is the only path now. */
  function topSimilarNeighbors(genre, limit = 3) {
    const name = genreName(genre);
    if (!name) return [];
    const id = String(genre?.id ?? "");
    return searchSimilarGenres(name, limit + 6)
      .filter(result => String(result.genre?.id ?? "") !== id)
      .slice(0, limit);
  }

  function renderSimilarGenresRailHtml(genre) {
    const neighbors = topSimilarNeighbors(genre, 3);
    if (!neighbors.length) return "";
    return `<section class="dg-similar-rail" aria-label="Sounds like this">
      <div class="dg-similar-rail-head">
        <div class="eyebrow">Sounds like this</div>
        <p class="small">Ranked locally from names, aliases, categories, and descriptions.</p>
      </div>
      <div class="dg-similar-rail-track">
        ${neighbors.map(result => {
          const neighbor = result.genre;
          const id = String(neighbor?.id ?? "");
          const listened = isListened(neighbor);
          const rating = ratingText(neighbor);
          const reason = result.reasons[0] || "";
          const status = listened ? (rating ? `${rating} rated` : "Listened") : "Unheard — spin this next";
          return `<article class="dg-similar-rail-card ${listened ? "is-listened" : "is-unheard"}">
            <div class="dg-similar-rail-name">${escapeHtml(genreName(neighbor))}</div>
            ${reason ? `<div class="dg-similar-rail-reason">${escapeHtml(reason)}</div>` : ""}
            <div class="dg-similar-rail-status">${escapeHtml(status)}</div>
            <button type="button" class="btn btn-secondary btn-tiny" data-dg-open-similar-rail="${escapeHtml(id)}">Open genre</button>
          </article>`;
        }).join("")}
      </div>
    </section>`;
  }

  function mountSimilarGenresRail(explicitGenre) {
    const genre = explicitGenre || currentGenreObject();
    const root = document.getElementById("listenDetails");
    if (!genre || !root) return;
    const existing = root.querySelector(".dg-similar-rail");
    const html = renderSimilarGenresRailHtml(genre);
    if (!html) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.outerHTML = html;
      return;
    }

    // Discovery Console restructures the original detail DOM shortly after
    // loadListenScreen (see genre-identity.js's injectDnaCard for the same
    // anchor chain and the reason it's needed). Insert after the DNA card
    // when present so the two don't compete for the same slot, otherwise
    // after the console's own vibe/progress/record anchors.
    const consoleWrap = root.querySelector(".discovery-console");
    if (consoleWrap) {
      const anchor = consoleWrap.querySelector(".genre-identity-dna, .dc-vibe-line, .dc-progress-strip, .detail-record-card");
      if (anchor) { anchor.insertAdjacentHTML("afterend", html); return; }
      consoleWrap.insertAdjacentHTML("afterbegin", html);
      return;
    }

    const anchor = root.querySelector(".song-listening-room, .dc-song-listening-section, .album-dive-panel, .detail-log-section");
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else root.querySelector(".detail-hero")?.insertAdjacentHTML("beforeend", html);
  }

  function handleSimilarRailClick(event) {
    const button = event.target?.closest?.("[data-dg-open-similar-rail]");
    if (!button) return;
    const id = button.getAttribute("data-dg-open-similar-rail");
    const genre = getGenres().find(item => String(item?.id ?? "") === String(id));
    if (genre) openGenre(genre);
  }

  function patchListenLoadForSimilarRail() {
    if (window.__dgSimilarGenresRailHookInstalled) return;
    window.__dgSimilarGenresRailHookInstalled = true;
    window.dgRegisterPostHook?.("loadListenScreen", (genre) => {
      setTimeout(() => mountSimilarGenresRail(genre), 40);
      setTimeout(() => mountSimilarGenresRail(genre), 200);
    });
  }

  let scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceLibrarySearch();
    });
  }

  function start() {
    installStyles();
    scheduleEnhance();
    patchListenLoadForSimilarRail();
    document.addEventListener("click", handleSimilarRailClick, true);
    new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
  }

  window.DailyGenreSimilarGenres = { search: searchSimilarGenres, score: scoreGenre, setMode };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
