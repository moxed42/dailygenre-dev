/* Daily Genre Ranks Polish v10
   Safe add-on: ranking workbench, tier moves, copyable rank lists, direct rank jumps, and manual rank review markers. Does not touch loading/save core. */
(function () {
  "use strict";

  const STATE = {
    search: "",
    tier: "all",
    mode: "ranked",
    parent: "all",
    category: "all",
  };

  // Local-only memory for tier experiments in the current browser session.
  // Example: move Pop from #2 in 4★ to 5★, then back to 4★ -> return near #2.
  const PRIOR_SLOTS = window.__dailyGenreRankPriorSlots || new Map();
  window.__dailyGenreRankPriorSlots = PRIOR_SLOTS;

  function slotKey(id, rating) {
    return `${String(id)}::${String(rating)}`;
  }

  function rememberSlot(genre) {
    if (!genre) return;
    const rating = String(genre.rating || "");
    if (!TIER_DEFS.some((tier) => tier.rating === rating)) return;
    const rank = Math.max(1, Number(genre.rank_order) || 1);
    PRIOR_SLOTS.set(slotKey(genre.id, rating), rank);
  }

  function rememberedSlot(id, rating) {
    const value = Number(PRIOR_SLOTS.get(slotKey(id, rating)));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const TIER_DEFS = [
    { rating: "5", label: "Inject This Into My Veins", short: "5★" },
    { rating: "4", label: "Hell Yeah, Run It Back", short: "4★" },
    { rating: "3", label: "Glad I Heard It", short: "3★" },
    { rating: "2", label: "Respectfully, Nah", short: "2★" },
    { rating: "1", label: "Get This Off My Turntable", short: "1★" },
  ];

  const originalRenderRankings =
    typeof window.renderRankings === "function" ? window.renderRankings : null;
  const originalMoveRank =
    typeof window.moveRank === "function" ? window.moveRank : null;

  function esc(value) {
    if (typeof window.escapeHtml === "function")
      return window.escapeHtml(value || "");
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function norm(value) {
    if (typeof window.normalizeName === "function")
      return window.normalizeName(value || "");
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function songUrl(song) {
    const raw = song?.spotifyUrl || song?.url || "";
    if (typeof window.normalizeSongUrl === "function")
      return window.normalizeSongUrl(raw);
    return String(raw || "")
      .replace(/^\s*(?:🔼\s*)?(?:LEVEL\s*UP|ADD)\s*:\s*/i, "")
      .trim();
  }

  function getSongs(genre) {
    const raw = Array.isArray(genre?.songs_listened)
      ? genre.songs_listened
      : [];
    if (typeof window.normalizeSongsListened === "function") {
      try {
        return window.normalizeSongsListened(raw);
      } catch (_) {
        return raw;
      }
    }
    return raw;
  }

  function genreArtwork(genre) {
    try {
      if (typeof window.getGenreArtwork === "function")
        return window.getGenreArtwork(genre) || "";
    } catch (_) {}
    return genre?.favoritesongartwork || genre?.favorite_song_artwork || "";
  }

  function catLine(genre) {
    if (typeof window.categoryLine === "function")
      return window.categoryLine(genre || {});
    return (
      genre?.category_path ||
      genre?.categorypath ||
      genre?.subcategory ||
      "Uncategorized"
    );
  }

  function countSongs(genre) {
    const songs = getSongs(genre);
    if (typeof window.countSongsForDisplay === "function") {
      try {
        return window.countSongsForDisplay(songs);
      } catch (_) {}
    }
    return songs.length;
  }

  function hasAlbumDive(genre) {
    const dive = genre?.albumDive || genre?.album_dive || null;
    if (!dive) return false;
    const slots = Array.isArray(dive.slots) ? dive.slots : [];
    return slots.some((slot) =>
      slot &&
      (
        slot.album ||
        slot.artist ||
        slot.spotify_url ||
        slot.spotifyUrl ||
        slot.albumUrl ||
        slot.url ||
        slot.rationale ||
        slot.albumArt ||
        slot.manualAlbumArt
      )
    );
  }

  function likedCount(genre) {
    return getSongs(genre).filter((song) => Number(song.reaction) === 1).length;
  }

  function averageFit(genre) {
    const scores = getSongs(genre)
      .map((song) => Number(song.score))
      .filter((n) => Number.isFinite(n));
    if (!scores.length) return "";
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avg.toFixed(1).replace(/\.0$/, "");
  }


  function rankReviewed(genre) {
    return Boolean(
      genre?.rank_reviewed ||
        genre?.rankReviewed ||
        genre?.ranking_reviewed ||
        genre?.rankingReviewed
    );
  }

  function rankReviewedLabel(genre) {
    if (!rankReviewed(genre)) return "Mark as manually reviewed/ranked";
    const stamp =
      genre?.rank_reviewed_at ||
      genre?.rankReviewedAt ||
      genre?.ranking_reviewed_at ||
      genre?.rankingReviewedAt ||
      "";
    if (!stamp) return "Reviewed/ranked manually";
    const date = String(stamp).slice(0, 10);
    return `Reviewed/ranked manually${date ? ` · ${date}` : ""}`;
  }

  function refinedRatingValue(genre) {
    const raw = genre?.refinedRating ?? genre?.refined_rating;
    if (raw === "" || raw == null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.min(5, Math.max(1, Math.round(value * 4) / 4));
  }

  function initialRatingValue(genre) {
    const value = Number(genre?.rating);
    return Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
  }

  function formatRefinedRating(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "";
  }

  function refinedRatingDelta(genre) {
    const refined = refinedRatingValue(genre);
    const initial = initialRatingValue(genre);
    if (refined == null || initial == null) return "";
    const delta = refined - initial;
    if (Math.abs(delta) < 0.001) return "No change";
    return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}`;
  }

  function setRefinedRating(id, rawValue, options = {}) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre) return false;

    if (options.clear) {
      delete genre.refinedRating;
      delete genre.refined_rating;
      markRanksDirty(`Cleared refined rating for ${genre.genre || "genre"}. Save Library Updates to persist.`);
      renderRankingsPolished();
      return true;
    }

    let value = Number(rawValue);
    if (!Number.isFinite(value)) value = initialRatingValue(genre);
    if (!Number.isFinite(value)) return false;
    value = Math.min(5, Math.max(1, Math.round(value * 4) / 4));

    genre.refinedRating = value;
    genre.refined_rating = value;

    // A refined score represents a deliberate revisit, so mark the row reviewed
    // without touching the original whole-star rating or rank_order.
    if (!rankReviewed(genre)) {
      const stamp = new Date().toISOString();
      genre.rank_reviewed = true;
      genre.rankReviewed = true;
      genre.rank_reviewed_at = stamp;
      genre.rankReviewedAt = stamp;
      genre.rank_reviewed_source = "refined-rating";
    }

    markRanksDirty(
      `Refined rating for ${genre.genre || "genre"} set to ${value.toFixed(2)}. Original ${genre.rating || "—"}★ rating was preserved.`,
    );
    renderRankingsPolished();
    return true;
  }

  function stepRefinedRating(id, direction) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre) return false;
    const current = refinedRatingValue(genre) ?? initialRatingValue(genre);
    if (!Number.isFinite(current)) return false;
    return setRefinedRating(id, current + (direction < 0 ? -0.25 : 0.25));
  }

  function renderRefinedRatingControl(genre, enabled) {
    const initial = initialRatingValue(genre);
    const refined = refinedRatingValue(genre);
    if (!enabled && refined == null) return "";

    const display = refined ?? initial;
    if (display == null) return "";
    const delta = refinedRatingDelta(genre);
    const stateLabel = refined == null
      ? `Initial ${formatRefinedRating(initial)} · not refined yet`
      : `Initial ${formatRefinedRating(initial)} · ${delta}`;

    return `
      <div class="ranks-refined-rating ${refined == null ? "is-unset" : "is-set"}" data-refined-rating-id="${esc(genre.id)}">
        <span class="ranks-refined-label">Refined</span>
        <button type="button" class="ranks-refined-step" data-refined-step="-1" data-refined-id="${esc(genre.id)}" aria-label="Decrease refined rating by 0.25">−</button>
        <input
          class="ranks-refined-input"
          type="number"
          min="1"
          max="5"
          step="0.25"
          inputmode="decimal"
          value="${esc(formatRefinedRating(display))}"
          data-refined-input-id="${esc(genre.id)}"
          aria-label="Refined rating for ${esc(genre.genre || "genre")}"
        />
        <button type="button" class="ranks-refined-step" data-refined-step="1" data-refined-id="${esc(genre.id)}" aria-label="Increase refined rating by 0.25">+</button>
        ${refined != null ? `<button type="button" class="ranks-refined-clear" data-refined-clear-id="${esc(genre.id)}" title="Clear refined rating and fall back to the original whole-star rating" aria-label="Clear refined rating">×</button>` : ""}
        <span class="ranks-refined-delta">${esc(stateLabel)}</span>
      </div>
    `;
  }

  function ensureRefinedRatingStyles() {
    if (document.getElementById("dg-ranks-refined-v289")) return;
    const style = document.createElement("style");
    style.id = "dg-ranks-refined-v289";
    style.textContent = `
      .ranks-refined-rating {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px;
        margin-top: 8px;
      }
      .ranks-refined-label {
        font-size: .7rem;
        font-weight: 900;
        letter-spacing: .06em;
        text-transform: uppercase;
        opacity: .75;
      }
      .ranks-refined-step,
      .ranks-refined-clear {
        display: grid;
        place-items: center;
        min-width: 28px;
        height: 28px;
        padding: 0 7px;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 8px;
        background: rgba(255,255,255,.06);
        color: inherit;
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }
      .ranks-refined-input {
        width: 70px;
        min-height: 30px;
        padding: 4px 6px;
        text-align: center;
        font-weight: 900;
      }
      .ranks-refined-rating.is-set .ranks-refined-input {
        border-color: rgba(239,188,82,.55);
      }
      .ranks-refined-rating.is-unset .ranks-refined-input {
        opacity: .76;
      }
      .ranks-refined-delta {
        flex-basis: 100%;
        font-size: .69rem;
        opacity: .68;
      }
      @media (max-width: 720px) {
        .ranks-refined-rating {
          margin-top: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setRankReviewed(id, value) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre) return false;
    const next = Boolean(value);
    genre.rank_reviewed = next;
    genre.rankReviewed = next;
    if (next) {
      const stamp = new Date().toISOString();
      genre.rank_reviewed_at = stamp;
      genre.rankReviewedAt = stamp;
      genre.rank_reviewed_source = "manual";
    } else {
      genre.rank_reviewed_at = "";
      genre.rankReviewedAt = "";
      genre.rank_reviewed_source = "";
    }
    try {
      window.genres = allGenres();
    } catch (_) {}
    markRanksDirty(
      next
        ? `Marked ${genre.genre || "genre"} as manually ranked. Save Library Updates to persist.`
        : `Cleared manual rank review for ${genre.genre || "genre"}. Save Library Updates to persist.`,
    );
    renderRankingsPolished();
    return true;
  }

  function toggleRankReviewed(id) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre) return false;
    return setRankReviewed(id, !rankReviewed(genre));
  }

  function bestAudition(genre) {
    const songs = getSongs(genre).filter((song) => songUrl(song));
    const favoriteUrl = songUrl({
      url: genre?.favoritesongurl || genre?.favorite_song_url || "",
    });
    const favoriteTitle = genre?.favoritesong || genre?.favorite_song || "";
    if (favoriteUrl || favoriteTitle) {
      const matched = songs.find((song) => {
        const url = songUrl(song);
        const title = String(song.title || "")
          .trim()
          .toLowerCase();
        return (
          (favoriteUrl && url === favoriteUrl) ||
          (favoriteTitle &&
            title === String(favoriteTitle).trim().toLowerCase())
        );
      });
      return {
        label: "Favorite",
        title: matched?.title || favoriteTitle || "Favorite song",
        artist:
          matched?.artist ||
          matched?.artists?.join?.(", ") ||
          genre?.favoriteartist ||
          genre?.favorite_artist ||
          "",
        url: favoriteUrl || songUrl(matched),
        artwork:
          matched?.artwork ||
          genre?.favoritesongartwork ||
          genre?.favorite_song_artwork ||
          genreArtwork(genre),
      };
    }

    const ranked = songs.slice().sort((a, b) => {
      const aReact =
        Number(a.reaction) === 1
          ? 100
          : Number(a.reaction) === 0
            ? 20
            : Number(a.reaction) === -1
              ? -50
              : 0;
      const bReact =
        Number(b.reaction) === 1
          ? 100
          : Number(b.reaction) === 0
            ? 20
            : Number(b.reaction) === -1
              ? -50
              : 0;
      const aScore = Number.isFinite(Number(a.score)) ? Number(a.score) : 0;
      const bScore = Number.isFinite(Number(b.score)) ? Number(b.score) : 0;
      return bReact + bScore - (aReact + aScore);
    });
    const song = ranked[0];
    if (!song) return null;
    return {
      label: Number(song.reaction) === 1 ? "Liked" : "Best fit",
      title: song.title || "Spotify track",
      artist: song.artist || song.artists?.join?.(", ") || "",
      url: songUrl(song),
      artwork: song.artwork || genreArtwork(genre),
    };
  }

  function dataSource() {
    try {
      if (Array.isArray(genres)) return genres;
    } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function rankedGenresForTierSafe(rating) {
    const source = dataSource();
    return source
      .filter(
        (g) =>
          String(g.rating) === String(rating) &&
          String(g.rating).toLowerCase() !== "zanger",
      )
      .sort(
        (a, b) =>
          (a.rank_order ?? 9999) - (b.rank_order ?? 9999) ||
          String(a.genre || "").localeCompare(String(b.genre || "")),
      );
  }

  function allGenres() {
    return dataSource();
  }

  function parentCategory(genre) {
    const line = catLine(genre);
    return (
      String(line || "Uncategorized")
        .split(">")[0]
        .trim() || "Uncategorized"
    );
  }

  function categoryKey(genre) {
    return catLine(genre) || "Uncategorized";
  }

  function uniqueOptions(mapper) {
    const values = new Set();
    allGenres().forEach((genre) => {
      const value = mapper(genre);
      if (value) values.add(String(value));
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }

  function matchesFilter(genre) {
    if (STATE.tier !== "all" && String(genre.rating) !== STATE.tier)
      return false;
    if (STATE.parent !== "all" && parentCategory(genre) !== STATE.parent)
      return false;
    if (STATE.category !== "all" && categoryKey(genre) !== STATE.category)
      return false;
    const needle = norm(STATE.search);
    if (!needle) return true;
    const audition = bestAudition(genre);
    const haystack = norm(
      [
        genre.genre,
        catLine(genre),
        genre.subcategory,
        genre.category_path,
        genre.favoritesong,
        genre.favorite_song,
        audition?.title,
        audition?.artist,
      ]
        .filter(Boolean)
        .join(" "),
    );
    return haystack.includes(needle);
  }

  function tierClass(rating) {
    return `rank-tier-${String(rating).replace(/[^a-z0-9]/gi, "")}`;
  }

  function tierBandMarker(idx, total, rating) {
    if (total < 4)
      return idx === 0
        ? `<div class="rank-band-marker rank-band-high"><span>Ranked ${rating}★</span></div>`
        : "";
    const q1 = 0;
    const q2 = Math.ceil(total * 0.25);
    const q3 = Math.ceil(total * 0.5);
    const q4 = Math.ceil(total * 0.75);
    const markers = new Map([
      [q1, `High ${rating}★ · top 25%`],
      [q2, `Upper-mid ${rating}★ · top 50%`],
      [q3, `Lower-mid ${rating}★ · top 75%`],
      [q4, `Low ${rating}★ · bottom 25%`],
    ]);
    const label = markers.get(idx);
    if (!label) return "";
    const bandClass =
      idx === q1
        ? "rank-band-high"
        : idx === q2
          ? "rank-band-upper"
          : idx === q3
            ? "rank-band-lower"
            : "rank-band-low";
    return `<div class="rank-band-marker ${bandClass}"><span>${esc(label)}</span></div>`;
  }

  function renderTierButtons(genre) {
    const current = String(genre.rating || "");
    return TIER_DEFS.map(
      (tier) => `
      <button type="button" class="rank-tier-btn ${tier.rating === current ? "active" : ""}" data-rank-tier-target="${esc(tier.rating)}" data-rank-id="${esc(genre.id)}" title="Move to ${esc(tier.short)}">
        ${tier.rating}
      </button>
    `,
    ).join("");
  }

  function bandForIndex(idx, total) {
    if (total < 4) return "high";
    const upperStart = Math.ceil(total * 0.25);
    const lowerStart = Math.ceil(total * 0.5);
    const lowStart = Math.ceil(total * 0.75);
    if (idx < upperStart) return "high";
    if (idx < lowerStart) return "upper";
    if (idx < lowStart) return "lower";
    return "low";
  }

  function renderGenreRow(genre, idx, tierTotal, tierRating) {
    const audition = bestAudition(genre);
    const songs = countSongs(genre);
    const likes = likedCount(genre);
    const avg = averageFit(genre);
    const artwork = genreArtwork(genre);
    const canPlay = audition?.url;
    const rank = genre.rank_order || idx + 1;
    const reviewed = rankReviewed(genre);
    const albumDiveReady = hasAlbumDive(genre);
    const refinedRatingReady = albumDiveReady || reviewed || refinedRatingValue(genre) != null;
    const stats = [
      `${songs} song${songs === 1 ? "" : "s"}`,
      likes ? `${likes} 👍` : "",
      avg ? `avg fit ${avg}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const auditionLine = audition
      ? `${audition.label}: ${audition.artist ? `${audition.artist} — ` : ""}${audition.title}`
      : "No playable song yet";

    return `
      ${tierBandMarker(idx, tierTotal, tierRating)}
      <article class="ranking-row ranks-polish-row ${tierClass(tierRating)} rank-band-row-${bandForIndex(idx, tierTotal)}" data-rank-card-id="${esc(genre.id)}">
        <div class="ranking-num ranks-polish-num ranks-jump-cell" title="Type a rank number and press Enter to jump within this tier">
          <span class="ranks-jump-prefix">#</span>
          <input class="ranks-jump-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${esc(rank)}" data-rank-jump-id="${esc(genre.id)}" aria-label="Move ${esc(genre.genre || 'genre')} to rank number" />
        </div>
        <div class="ranks-polish-artwrap">
          ${artwork ? `<img class="ranking-artwork ranks-polish-art" src="${esc(artwork)}" alt="${esc(genre.genre || "Genre")} artwork" loading="lazy" />` : `<div class="ranking-artwork ranks-polish-art ranks-polish-art-empty">♪</div>`}
        </div>
        <div class="ranks-polish-main">
          <button type="button" class="linklike ranks-polish-title" data-rank-open-id="${esc(genre.id)}">${esc(genre.genre || "Unknown genre")}</button>
          <div class="ranks-polish-meta-row">
            <div class="ranks-polish-meta">${esc(catLine(genre))}${stats ? ` · ${esc(stats)}` : ""}</div>
            <span class="ranks-album-dive-tools">
              <button type="button" class="ranks-album-dive-badge ${albumDiveReady ? "has-dive" : "no-dive"}" data-rank-album-dive-id="${esc(genre.id)}" title="${albumDiveReady ? "Open this Album Dive editor" : "Open Album Dive JSON import"}" aria-label="${albumDiveReady ? `Open Album Dive editor for ${esc(genre.genre || "genre")}` : `Start Album Dive JSON import for ${esc(genre.genre || "genre")}`}">${albumDiveReady ? "Album Dive" : "No Album Dive"}</button>
              ${albumDiveReady ? `<button type="button" class="ranks-album-dive-copy-btn" data-rank-album-dive-copy-id="${esc(genre.id)}" title="Copy the same Album Dive stats shown on the genre page" aria-label="Copy Album Dive stats for ${esc(genre.genre || "genre")}">⧉ Stats</button>` : ""}
            </span>
          </div>
          <div class="ranks-polish-audition ${canPlay ? "" : "muted"}">${esc(auditionLine)}</div>
          ${renderRefinedRatingControl(genre, refinedRatingReady)}
        </div>
        <div class="ranks-polish-actions">
          <button type="button" class="ranks-play-btn" data-rank-play-id="${esc(genre.id)}" ${canPlay ? "" : "disabled"} title="Play audition track">▶</button>
          <button type="button" class="ranks-review-btn ${reviewed ? "is-reviewed" : ""}" data-rank-review-id="${esc(genre.id)}" title="${esc(rankReviewedLabel(genre))}" aria-pressed="${reviewed ? "true" : "false"}" aria-label="${esc(rankReviewedLabel(genre))}">✓</button>
          <div class="ranks-tier-move" aria-label="Move genre to tier">
            ${renderTierButtons(genre)}
          </div>
          <div class="rank-controls ranks-order-controls">
            <button class="icon-btn" data-rank-move="up" data-rank-id="${esc(genre.id)}" title="Move up within tier">↑</button>
            <button class="icon-btn" data-rank-move="down" data-rank-id="${esc(genre.id)}" title="Move down within tier">↓</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderZangerRow(genre) {
    const artwork = genreArtwork(genre);
    const audition = bestAudition(genre);
    const canPlay = audition?.url;
    return `
      <article class="ranking-row ranks-polish-row ranks-zanger-row" data-rank-card-id="${esc(genre.id)}">
        <div class="ranking-num ranks-polish-num ranks-zanger-num">Z</div>
        <div class="ranks-polish-artwrap">${artwork ? `<img class="ranking-artwork ranks-polish-art" src="${esc(artwork)}" alt="${esc(genre.genre || "Genre")} artwork" loading="lazy" />` : `<div class="ranking-artwork ranks-polish-art ranks-polish-art-empty">Z</div>`}</div>
        <div class="ranks-polish-main">
          <button type="button" class="linklike ranks-polish-title" data-rank-open-id="${esc(genre.id)}">${esc(genre.genre || "Unknown genre")}</button>
          <div class="ranks-polish-meta">${esc(catLine(genre))}</div>
          <div class="ranks-polish-audition muted">Zanger / vetoed — excluded from spin rotation</div>
        </div>
        <div class="ranks-polish-actions ranks-zanger-actions">
          <button type="button" class="ranks-play-btn" data-rank-play-id="${esc(genre.id)}" ${canPlay ? "" : "disabled"} title="Play audition track">▶</button>
          <button type="button" class="btn btn-secondary ranks-restore-spin-btn" data-rank-restore-spin-id="${esc(genre.id)}" title="Remove zanger/veto and put this genre back in the spin pool">Restore to spin</button>
        </div>
      </article>
    `;
  }

  function renderRankToolbar() {
    const parentOptions = uniqueOptions(parentCategory);
    const categoryOptions = uniqueOptions(categoryKey).filter(
      (value) =>
        STATE.parent === "all" ||
        String(value).split(">")[0].trim() === STATE.parent,
    );
    return `
      <div class="ranks-polish-toolbar">
        <div class="ranks-polish-searchwrap">
          <label class="sr-only" for="ranksPolishSearch">Search ranked genres</label>
          <input id="ranksPolishSearch" type="search" placeholder="Search ranked genres, categories, favorite songs…" value="${esc(STATE.search)}" />
        </div>
        <select id="ranksPolishTierFilter" aria-label="Filter ranking tier">
          <option value="all" ${STATE.tier === "all" ? "selected" : ""}>All tiers</option>
          ${TIER_DEFS.map((tier) => `<option value="${tier.rating}" ${STATE.tier === tier.rating ? "selected" : ""}>${tier.short} ${esc(tier.label)}</option>`).join("")}
        </select>
        <select id="ranksPolishParentFilter" aria-label="Filter parent category">
          <option value="all" ${STATE.parent === "all" ? "selected" : ""}>All parent categories</option>
          ${parentOptions.map((value) => `<option value="${esc(value)}" ${STATE.parent === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
        </select>
        <select id="ranksPolishCategoryFilter" aria-label="Filter category">
          <option value="all" ${STATE.category === "all" ? "selected" : ""}>All categories</option>
          ${categoryOptions.map((value) => `<option value="${esc(value)}" ${STATE.category === value ? "selected" : ""}>${esc(value)}</option>`).join("")}
        </select>
        <button type="button" class="btn btn-secondary ranks-copy-btn" id="ranksCopyVisibleBtn" title="Copy this filtered rank list for Discord">Copy list</button>
        <button type="button" class="btn btn-secondary ranks-save-btn" onclick="saveLibraryUpdates()">Save rank changes</button>
      </div>
      <div class="ranks-polish-note">Use ▶ to audition. Use ✓ after a revisit or Album Dive to unlock an optional quarter-step refined rating. Refined ratings never replace the original whole-star rating or rank order. Move genres between star tiers, fine-tune order with ↑/↓, or type a number for a bigger jump.</div>
    `;
  }

  function renderRankingsPolished() {
    ensureRefinedRatingStyles();
    const wrap = document.getElementById("rankingWrap");
    if (!wrap) return;

    const tiersHtml = TIER_DEFS.map((tier) => {
      const allTierItems = rankedGenresForTierSafe(tier.rating);
      const items = allTierItems.filter(matchesFilter);
      return `
        <section class="ranking-tier ranks-polish-tier ${tierClass(tier.rating)}">
          <div class="ranks-tier-heading">
            <h3>${esc(tier.short)} ${esc(tier.label)}</h3>
            <span>${items.length}${items.length !== allTierItems.length ? ` / ${allTierItems.length}` : ""} genre${items.length === 1 ? "" : "s"}</span>
          </div>
          <div class="ranks-tier-list">
            ${items.length ? items.map((g, idx) => renderGenreRow(g, idx, items.length, tier.rating)).join("") : `<div class="small ranks-empty-tier">No matching genres in this tier.</div>`}
          </div>
        </section>
      `;
    }).join("");

    const zangers = allGenres()
      .filter(
        (g) =>
          String(g.rating || "").toLowerCase() === "zanger" ||
          String(g.status || "").toLowerCase() === "veto",
      )
      .filter(matchesFilter);

    wrap.innerHTML = `
      <div class="ranks-polish-shell">
        ${renderRankToolbar()}
        ${tiersHtml}
        <section class="ranking-tier ranks-polish-tier ranks-zanger-tier">
          <div class="ranks-tier-heading"><h3>Zangers</h3><span>${zangers.length}</span></div>
          <div class="ranks-tier-list">${zangers.length ? zangers.map(renderZangerRow).join("") : '<div class="small ranks-empty-tier">No matching zangers.</div>'}</div>
        </section>
      </div>
    `;

    bindRankEvents(wrap);
  }

  function markRanksDirty(message) {
    try {
      libraryUpdatesPending = true;
    } catch (_) {}
    try {
      if (typeof window.toggleLibrarySaveButton === "function") window.toggleLibrarySaveButton(true);
    } catch (_) {}
    try {
      if (typeof window.renderFloatingListeningSave === "function")
        window.renderFloatingListeningSave();
    } catch (_) {}
    if (typeof window.showSaveToast === "function")
      window.showSaveToast(
        message || "Rank changes pending. Save Library Updates to persist.",
        false,
      );
    try {
      if (typeof window.promptLibrarySaveLogin === "function" && !(typeof window.dailyGenreHasSavePassword === "function" && window.dailyGenreHasSavePassword())) window.promptLibrarySaveLogin();
    } catch (_) {}
  }

  function rankedVisibleForCopy() {
    return TIER_DEFS.map((tier) => {
      const items = rankedGenresForTierSafe(tier.rating).filter(matchesFilter);
      return { tier, items };
    }).filter((block) => block.items.length);
  }

  function copyRankList() {
    const filters = [];
    if (STATE.tier !== "all") filters.push(`${STATE.tier}★`);
    if (STATE.parent !== "all") filters.push(STATE.parent);
    if (STATE.category !== "all") filters.push(STATE.category);
    if (STATE.search) filters.push(`search: ${STATE.search}`);
    const heading = `Daily Genre ranks${filters.length ? ` — ${filters.join(" · ")}` : ""}`;
    const lines = [heading, ""];
    rankedVisibleForCopy().forEach(({ tier, items }) => {
      lines.push(`${tier.short} ${tier.label}`);
      items.forEach((genre, idx) => {
        const rank = genre.rank_order || idx + 1;
        const audition = bestAudition(genre);
        const pieces = [`${rank}. ${genre.genre || "Unknown genre"}`];
        const cat = catLine(genre);
        if (cat) pieces.push(`(${cat})`);
        if (audition?.title)
          pieces.push(
            `— ${audition.artist ? `${audition.artist} — ` : ""}${audition.title}`,
          );
        lines.push(pieces.join(" "));
      });
      lines.push("");
    });
    const text = lines.join("\n").trim();
    if (!text) return;
    const done = () =>
      typeof window.showSaveToast === "function" &&
      window.showSaveToast("Copied rank list for Discord.", false);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => {
          window.prompt("Copy rank list:", text);
        });
    } else {
      window.prompt("Copy rank list:", text);
    }
  }

  function reRankTier(
    source,
    rating,
    insertGenre = null,
    rememberedRank = null,
  ) {
    if (!rating) return;
    const items = source
      .filter(
        (g) =>
          String(g.rating) === String(rating) &&
          String(g.rating).toLowerCase() !== "zanger" &&
          (!insertGenre || String(g.id) !== String(insertGenre.id)),
      )
      .sort(
        (a, b) =>
          (Number(a.rank_order) || 9999) - (Number(b.rank_order) || 9999) ||
          String(a.genre || "").localeCompare(String(b.genre || "")),
      );

    if (insertGenre) {
      const index = rememberedRank
        ? Math.max(0, Math.min(items.length, rememberedRank - 1))
        : items.length;
      items.splice(index, 0, insertGenre);
    }

    items.forEach((g, idx) => {
      g.rank_order = idx + 1;
    });
  }

  function moveGenreToRank(id, targetRank) {
    const source = allGenres();
    const genre = source.find((g) => String(g.id) === String(id));
    if (!genre || !genre.rating || String(genre.rating).toLowerCase() === "zanger") return false;

    const rating = String(genre.rating);
    const currentTier = source
      .filter((g) => String(g.rating) === rating && String(g.rating).toLowerCase() !== "zanger")
      .sort((a, b) =>
        (Number(a.rank_order) || 9999) - (Number(b.rank_order) || 9999) ||
        String(a.genre || "").localeCompare(String(b.genre || "")),
      );

    const from = currentTier.findIndex((g) => String(g.id) === String(genre.id));
    if (from < 0) return false;

    const requested = Math.round(Number(targetRank));
    if (!Number.isFinite(requested)) return false;
    const to = Math.max(0, Math.min(currentTier.length - 1, requested - 1));
    if (to === from) {
      renderRankingsPolished();
      return true;
    }

    const [moved] = currentTier.splice(from, 1);
    currentTier.splice(to, 0, moved);
    currentTier.forEach((g, idx) => {
      g.rank_order = idx + 1;
    });

    try {
      window.genres = source;
    } catch (_) {}
    markRanksDirty(
      `Moved ${genre.genre || "genre"} to #${to + 1} in ${rating}★. Save Library Updates to persist.`,
    );
    renderRankingsPolished();
    setTimeout(renderRankingsPolished, 0);
    return true;
  }

  function moveGenreToTier(id, targetRating) {
    const source = allGenres();
    const genre = source.find((g) => String(g.id) === String(id));
    if (!genre) return;
    const current = String(genre.rating || "");
    const target = String(targetRating || "");
    if (!TIER_DEFS.some((tier) => tier.rating === target)) return;
    if (current === target) return;

    const oldRating = current;
    rememberSlot(genre);
    const returnRank = rememberedSlot(genre.id, target);

    genre.rating = target;
    if (String(genre.status || "").toLowerCase() === "veto")
      genre.status = "listened";

    reRankTier(source, oldRating);
    reRankTier(source, target, genre, returnRank);

    try {
      window.genres = source;
    } catch (_) {}
    const suffix = returnRank
      ? ` near prior #${returnRank}`
      : " at the bottom of the tier";
    markRanksDirty(
      `Moved ${genre.genre || "genre"} to ${target}★${suffix}. Save Library Updates to persist.`,
    );
    renderRankingsPolished();
    setTimeout(renderRankingsPolished, 0);
  }

  function restoreZangerToSpin(id) {
    const source = allGenres();
    const genre = source.find((g) => String(g.id) === String(id));
    if (!genre) return;

    // Restore means: no longer vetoed/zangered and eligible for the normal spin pool again.
    // Preserve descriptive notes and song history, but clear listen/veto fields that keep it excluded.
    genre.status = "unlistened";
    genre.rating = "";
    genre.date_raw = "";
    genre.date_normalized = "";
    genre.parse_notes = "";
    genre.monthly_contender = false;
    genre.monthlycontender = false;
    genre.monthfavorite = false;
    genre.monthleastfavorite = false;
    genre.rank_order = null;

    try {
      window.genres = source;
    } catch (_) {}
    markRanksDirty(
      `Restored ${genre.genre || "genre"} to the spin pool. Save Library Updates to persist.`,
    );
    renderRankingsPolished();
    setTimeout(renderRankingsPolished, 0);
  }

  function copyRankAlbumDiveStats(id) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre) return;

    if (typeof window.copyAlbumDiveStats === "function") {
      window.copyAlbumDiveStats(genre);
      return;
    }

    if (typeof window.showSaveToast === "function") {
      window.showSaveToast("Album Dive copy tools are not loaded yet.", true);
    }
  }

  function openRankAlbumDiveEditor(id) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    if (!genre || typeof window.openGenreDetail !== "function") return;

    window.openGenreDetail(genre, false);

    const revealImport = () => {
      if (typeof window.setListeningFocusMode === "function") {
        window.setListeningFocusMode("albums");
      }

      requestAnimationFrame(() => {
        if (
          (genre.albumDive || genre.album_dive) &&
          typeof window.setAlbumDiveEditorMode === "function"
        ) {
          window.setAlbumDiveEditorMode(true);
        }

        requestAnimationFrame(() => {
          const panel =
            document.getElementById("albumDivePanel") ||
            document.querySelector(".album-dive-empty-panel");
          if (panel && "open" in panel) panel.open = true;

          const input =
            document.getElementById("albumDiveJsonImport") ||
            document.getElementById("albumDiveJsonImportStart");

          const importBlock = input?.closest?.(".album-dive-json-import");
          const positionImportTextarea = (behavior = "auto") => {
            if (!input) return;
            const rect = input.getBoundingClientRect();
            const desiredTop = Math.max(78, window.innerHeight * 0.16);
            const targetTop = Math.max(
              0,
              window.scrollY + rect.top - desiredTop,
            );
            window.scrollTo({
              top: targetTop,
              behavior,
            });
          };

          // setListeningFocusMode intentionally restores the previous viewport
          // for roughly 940ms. Wait until that sequence is finished, then place
          // the JSON textarea near the top of the viewport.
          setTimeout(() => positionImportTextarea("auto"), 1020);
          setTimeout(() => positionImportTextarea("smooth"), 1160);
          setTimeout(() => positionImportTextarea("auto"), 1380);

          setTimeout(() => {
            input?.focus?.({ preventScroll: true });
            input?.select?.();
            positionImportTextarea("auto");
          }, 1440);
        });
      });
    };

    setTimeout(revealImport, 0);
    setTimeout(revealImport, 120);
    setTimeout(revealImport, 360);
  }

  function playAudition(id) {
    const genre = allGenres().find((g) => String(g.id) === String(id));
    const audition = bestAudition(genre);
    if (!audition?.url) {
      if (typeof window.showSaveToast === "function")
        window.showSaveToast(
          "No playable audition track found for this genre.",
          true,
        );
      return;
    }
    if (typeof window.stickyPlayerOpen === "function") {
      window.stickyPlayerOpen(
        audition.url,
        audition.title || "Spotify track",
        audition.artist || "",
        audition.artwork || genreArtwork(genre) || "",
      );
    } else if (audition.url) {
      window.open(audition.url, "_blank", "noopener");
    }
  }

  function bindRankEvents(wrap) {
    const search = wrap.querySelector("#ranksPolishSearch");
    if (search) {
      search.addEventListener("input", () => {
        STATE.search = search.value || "";
        clearTimeout(window.__ranksPolishSearchTimer);
        window.__ranksPolishSearchTimer = setTimeout(
          renderRankingsPolished,
          90,
        );
      });
      requestAnimationFrame(() => {
        if (document.activeElement?.id === "ranksPolishSearch") return;
      });
    }

    const filter = wrap.querySelector("#ranksPolishTierFilter");
    if (filter) {
      filter.addEventListener("change", () => {
        STATE.tier = filter.value || "all";
        renderRankingsPolished();
      });
    }

    const parentFilter = wrap.querySelector("#ranksPolishParentFilter");
    if (parentFilter) {
      parentFilter.addEventListener("change", () => {
        STATE.parent = parentFilter.value || "all";
        STATE.category = "all";
        renderRankingsPolished();
      });
    }

    const categoryFilter = wrap.querySelector("#ranksPolishCategoryFilter");
    if (categoryFilter) {
      categoryFilter.addEventListener("change", () => {
        STATE.category = categoryFilter.value || "all";
        renderRankingsPolished();
      });
    }

    const copyBtn = wrap.querySelector("#ranksCopyVisibleBtn");
    if (copyBtn) copyBtn.addEventListener("click", copyRankList);

    wrap.querySelectorAll("[data-rank-open-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const genre = allGenres().find(
          (g) => String(g.id) === String(btn.dataset.rankOpenId),
        );
        if (genre && typeof window.openGenreDetail === "function")
          window.openGenreDetail(genre, false);
      });
    });

    wrap.querySelectorAll("[data-rank-album-dive-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openRankAlbumDiveEditor(btn.dataset.rankAlbumDiveId);
      });
    });

    wrap.querySelectorAll("[data-rank-album-dive-copy-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyRankAlbumDiveStats(btn.dataset.rankAlbumDiveCopyId);
      });
    });

    wrap.querySelectorAll("[data-rank-play-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        playAudition(btn.dataset.rankPlayId);
      });
    });

    wrap.querySelectorAll("[data-rank-tier-target]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        moveGenreToTier(btn.dataset.rankId, btn.dataset.rankTierTarget);
      });
    });

    wrap.querySelectorAll("[data-rank-restore-spin-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        restoreZangerToSpin(btn.dataset.rankRestoreSpinId);
      });
    });

    wrap.querySelectorAll("[data-rank-move]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = btn.dataset.rankId;
        const dir = btn.dataset.rankMove;
        if (originalMoveRank) originalMoveRank(id, dir);
        else if (
          typeof window.moveRank === "function" &&
          window.moveRank !== moveRankPolished
        )
          window.moveRank(id, dir);
        markRanksDirty("Rank order updated. Save Library Updates to persist.");
        renderRankingsPolished();
      });
    });

    wrap.querySelectorAll("[data-rank-review-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleRankReviewed(btn.dataset.rankReviewId);
      });
    });

    wrap.querySelectorAll("[data-rank-jump-id]").forEach((input) => {
      const apply = () => moveGenreToRank(input.dataset.rankJumpId, input.value);
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("focus", () => input.select?.());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });
      input.addEventListener("change", apply);
    });

    wrap.querySelectorAll("[data-refined-step]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        stepRefinedRating(
          btn.dataset.refinedId,
          Number(btn.dataset.refinedStep) < 0 ? -1 : 1,
        );
      });
    });

    wrap.querySelectorAll("[data-refined-input-id]").forEach((input) => {
      const apply = () => setRefinedRating(input.dataset.refinedInputId, input.value);
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("focus", () => input.select?.());
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          apply();
        }
      });
      input.addEventListener("change", apply);
    });

    wrap.querySelectorAll("[data-refined-clear-id]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setRefinedRating(btn.dataset.refinedClearId, null, { clear: true });
      });
    });
  }

  function moveRankPolished(id, direction) {
    if (originalMoveRank) originalMoveRank(id, direction);
    markRanksDirty("Rank order updated. Save Library Updates to persist.");
    renderRankingsPolished();
  }

  window.renderRankings = renderRankingsPolished;
  window.moveRank = moveRankPolished;
  window.DailyGenreRanksPolish = {
    apply: renderRankingsPolished,
    moveGenreToTier,
    moveGenreToRank,
    toggleRankReviewed,
    setRankReviewed,
    setRefinedRating,
    stepRefinedRating,
    refinedRatingValue,
    restoreZangerToSpin,
    openRankAlbumDiveEditor,
    copyRankAlbumDiveStats,
    playAudition,
    copyRankList,
  };

  document.addEventListener("click", (event) => {
    const tab = event.target.closest?.('[data-screen="ranking"]');
    if (tab) setTimeout(renderRankingsPolished, 0);
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector("#screen-ranking.active"))
      renderRankingsPolished();
  });
})();


/* === Ranks Polish v9: delegated manual review marker reliability ========== */
(function () {
  "use strict";

  function source() {
    try { if (Array.isArray(genres)) return genres; } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function reviewed(genre) {
    return Boolean(genre?.rank_reviewed || genre?.rankReviewed || genre?.ranking_reviewed || genre?.rankingReviewed);
  }

  function markDirty(message) {
    try { libraryUpdatesPending = true; } catch (_) {}
    try { if (typeof window.toggleLibrarySaveButton === "function") window.toggleLibrarySaveButton(true); } catch (_) {}
    try { if (typeof window.renderFloatingListeningSave === "function") window.renderFloatingListeningSave(); } catch (_) {}
    try { if (typeof window.showSaveToast === "function") window.showSaveToast(message, false); } catch (_) {}
    try { if (typeof window.promptLibrarySaveLogin === "function" && !(typeof window.dailyGenreHasSavePassword === "function" && window.dailyGenreHasSavePassword())) window.promptLibrarySaveLogin(); } catch (_) {}
  }

  function toggle(id) {
    const list = source();
    const genre = list.find((g) => String(g.id) === String(id));
    if (!genre) return false;
    const next = !reviewed(genre);
    genre.rank_reviewed = next;
    genre.rankReviewed = next;
    if (next) {
      const stamp = new Date().toISOString();
      genre.rank_reviewed_at = stamp;
      genre.rankReviewedAt = stamp;
      genre.rank_reviewed_source = "manual";
    } else {
      genre.rank_reviewed_at = "";
      genre.rankReviewedAt = "";
      genre.rank_reviewed_source = "";
    }
    try { window.genres = list; } catch (_) {}
    markDirty(next ? `Marked ${genre.genre || "genre"} as manually ranked.` : `Cleared manual rank review for ${genre.genre || "genre"}.`);
    try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {}
    return true;
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest?.("[data-rank-review-id]");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (window.DailyGenreRanksPolish?.toggleRankReviewed) {
      window.DailyGenreRanksPolish.toggleRankReviewed(btn.dataset.rankReviewId);
    } else {
      toggle(btn.dataset.rankReviewId);
    }
  }, true);

  window.DailyGenreRankReviewV9 = { toggle };
})();

/* === Ranks Polish v6: delegated tier movement reliability =================
   Some installs lost the direct per-button handlers after re-renders. This
   capture-phase handler uses the rendered data attributes directly and mutates
   the same global genre array the core app saves. */
(function () {
  "use strict";
  const PRIOR = window.__dailyGenreRankPriorSlots || new Map();
  window.__dailyGenreRankPriorSlots = PRIOR;
  const validRatings = new Set(["1", "2", "3", "4", "5"]);

  function source() {
    try {
      if (Array.isArray(genres)) return genres;
    } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function key(id, rating) {
    return `${String(id)}::${String(rating)}`;
  }

  function remember(genre) {
    if (!genre || !validRatings.has(String(genre.rating || ""))) return;
    PRIOR.set(
      key(genre.id, genre.rating),
      Math.max(1, Number(genre.rank_order) || 1),
    );
  }

  function remembered(id, rating) {
    const n = Number(PRIOR.get(key(id, rating)));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function rankTier(list, rating, insertGenre, insertAt) {
    const items = list
      .filter(
        (g) =>
          String(g.rating) === String(rating) &&
          String(g.rating).toLowerCase() !== "zanger" &&
          (!insertGenre || String(g.id) !== String(insertGenre.id)),
      )
      .sort(
        (a, b) =>
          (Number(a.rank_order) || 9999) - (Number(b.rank_order) || 9999) ||
          String(a.genre || "").localeCompare(String(b.genre || "")),
      );
    if (insertGenre) {
      const idx = insertAt
        ? Math.max(0, Math.min(items.length, insertAt - 1))
        : items.length;
      items.splice(idx, 0, insertGenre);
    }
    items.forEach((g, idx) => {
      g.rank_order = idx + 1;
    });
  }

  function moveTier(id, target) {
    const list = source();
    const genre = list.find((g) => String(g.id) === String(id));
    target = String(target || "");
    if (!genre || !validRatings.has(target)) return false;
    const old = String(genre.rating || "");
    if (old === target) return false;
    remember(genre);
    const rememberedTarget = remembered(genre.id, target);
    genre.rating = target;
    if (String(genre.status || "").toLowerCase() === "veto")
      genre.status = "listened";
    rankTier(list, old, null, null);
    rankTier(list, target, genre, rememberedTarget);
    try {
      window.genres = list;
    } catch (_) {}
    try {
      libraryUpdatesPending = true;
    } catch (_) {}
    try {
      if (typeof window.renderFloatingListeningSave === "function")
        window.renderFloatingListeningSave();
    } catch (_) {}
    try {
      if (typeof window.renderRankings === "function") window.renderRankings();
    } catch (_) {}
    try {
      if (typeof window.showSaveToast === "function")
        window.showSaveToast(
          `Moved ${genre.genre || "genre"} to ${target}★. Save Library Updates to persist.`,
          false,
        );
    } catch (_) {}
    return true;
  }

  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest?.("[data-rank-tier-target]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      moveTier(btn.dataset.rankId, btn.dataset.rankTierTarget);
    },
    true,
  );

  window.DailyGenreRanksTierV6 = { moveTier };
})();


/* === Ranks Polish v7: reliable within-tier ↑/↓ reordering =================
   The prior direct handler could show a success toast even when equal/missing
   rank_order values left the sorted list visually unchanged. This delegated
   capture handler performs an explicit remove/insert/re-number pass. */
(function () {
  "use strict";

  function source() {
    try {
      if (Array.isArray(genres)) return genres;
    } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function rankable(g, rating) {
    return (
      g &&
      String(g.rating) === String(rating) &&
      String(g.rating || "").toLowerCase() !== "zanger"
    );
  }

  function tierItems(list, rating) {
    return list
      .filter((g) => rankable(g, rating))
      .sort(
        (a, b) =>
          (Number(a.rank_order) || 9999) - (Number(b.rank_order) || 9999) ||
          String(a.genre || "").localeCompare(String(b.genre || "")),
      );
  }

  function markDirty(message) {
    try { libraryUpdatesPending = true; } catch (_) {}
    try { if (typeof window.toggleLibrarySaveButton === "function") window.toggleLibrarySaveButton(true); } catch (_) {}
    try { if (typeof window.renderFloatingListeningSave === "function") window.renderFloatingListeningSave(); } catch (_) {}
    try {
      if (typeof window.showSaveToast === "function") window.showSaveToast(message, false);
    } catch (_) {}
  }

  function moveWithinTier(id, direction) {
    const list = source();
    const item = list.find((g) => String(g.id) === String(id));
    if (!item || !item.rating || String(item.rating).toLowerCase() === "zanger") return false;

    const rating = String(item.rating);
    const items = tierItems(list, rating);
    const from = items.findIndex((g) => String(g.id) === String(item.id));
    if (from < 0) return false;
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return false;

    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    items.forEach((g, idx) => {
      g.rank_order = idx + 1;
    });

    try { window.genres = list; } catch (_) {}
    markDirty(`Moved ${item.genre || "genre"} ${direction}. Save Library Updates to persist.`);
    try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {}
    setTimeout(() => { try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {} }, 0);
    return true;
  }

  document.addEventListener(
    "click",
    (event) => {
      const btn = event.target.closest?.("[data-rank-move]");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      moveWithinTier(btn.dataset.rankId, btn.dataset.rankMove);
    },
    true,
  );

  window.DailyGenreRanksOrderV7 = { moveWithinTier };
})();


/* === Ranks Polish v8: direct rank number jump ============================
   Lets a genre jump from e.g. #50 to #25 inside its current star tier. */
(function () {
  "use strict";

  function source() {
    try { if (Array.isArray(genres)) return genres; } catch (_) {}
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function markDirty(message) {
    try { libraryUpdatesPending = true; } catch (_) {}
    try { if (typeof window.toggleLibrarySaveButton === "function") window.toggleLibrarySaveButton(true); } catch (_) {}
    try { if (typeof window.renderFloatingListeningSave === "function") window.renderFloatingListeningSave(); } catch (_) {}
    try { if (typeof window.showSaveToast === "function") window.showSaveToast(message, false); } catch (_) {}
    try { if (typeof window.promptLibrarySaveLogin === "function" && !(typeof window.dailyGenreHasSavePassword === "function" && window.dailyGenreHasSavePassword())) window.promptLibrarySaveLogin(); } catch (_) {}
  }

  function tierItems(list, rating) {
    return list
      .filter((g) => String(g.rating) === String(rating) && String(g.rating || "").toLowerCase() !== "zanger")
      .sort((a, b) =>
        (Number(a.rank_order) || 9999) - (Number(b.rank_order) || 9999) ||
        String(a.genre || "").localeCompare(String(b.genre || "")),
      );
  }

  function moveToRank(id, rank) {
    const list = source();
    const item = list.find((g) => String(g.id) === String(id));
    if (!item || !item.rating || String(item.rating).toLowerCase() === "zanger") return false;
    const items = tierItems(list, item.rating);
    const from = items.findIndex((g) => String(g.id) === String(item.id));
    const requested = Math.round(Number(rank));
    if (from < 0 || !Number.isFinite(requested)) return false;
    const to = Math.max(0, Math.min(items.length - 1, requested - 1));
    if (to === from) {
      try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {}
      return true;
    }
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    items.forEach((g, idx) => { g.rank_order = idx + 1; });
    try { window.genres = list; } catch (_) {}
    markDirty(`Moved ${item.genre || "genre"} to #${to + 1}. Save Library Updates to persist.`);
    try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {}
    setTimeout(() => { try { if (typeof window.renderRankings === "function") window.renderRankings(); } catch (_) {} }, 0);
    return true;
  }

  document.addEventListener("keydown", (event) => {
    const input = event.target.closest?.("[data-rank-jump-id]");
    if (!input) return;
    event.stopPropagation();
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    moveToRank(input.dataset.rankJumpId, input.value);
  }, true);

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-rank-jump-id]");
    if (!input) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    moveToRank(input.dataset.rankJumpId, input.value);
  }, true);

  document.addEventListener("click", (event) => {
    const input = event.target.closest?.("[data-rank-jump-id]");
    if (!input) return;
    event.stopPropagation();
  }, true);

  window.DailyGenreRanksJumpV8 = { moveToRank };
})();
