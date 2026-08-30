/* Daily Genre Visuals / Stats polish v3.3
   Add-on-safe: no app.js or loader changes. */

// Daily Genre v240: bind Visuals lifecycle handlers only once.
let visualsLifecycleInitialized = false;

function renderVisuals() {
  if (typeof Chart === "undefined") return;
  vizDestroyAll();
  renderVisualFilters();
  renderFocusBanner();
  const baseItems = vizBaseGenres();
  const items = vizFilteredItems(baseItems),
    songs = vizAllOfficialSongs(items),
    artists = vizArtists(items),
    month = vizSelectedMonth();
  const reactions = vizReactionCountSummary(songs);
  const health = visualHealthStats(items);
  applyVizModeDisplay();
  renderGenreDossier(items);
  if (vizMode() === "monthly") {
    vizRenderKPIs(document.getElementById("vizKpiMonthly"), [
      { label: "Month", value: vizMonthTitle(month) },
      { label: "Songs", value: songs.length },
      { label: "Artists", value: artists.uniqueArtists },
      { label: "Rated", value: `${health.ratedPct}%` },
      { label: "Like rate", value: health.rated ? `${health.likeRate}%` : "—" },
    ]);
    vizRenderRatingsContent(items);
    vizRenderHighlights(items);
    vizRenderArtistStats(items);
    vizRenderSongReactions("vizSongReactionsMonthly", items);
    vizRenderCrossovers("vizCrossoversMonthly", items, 10);
    renderNeedsAttention("vizNeedsAttentionMonthly");
    renderUnratedSongs("vizUnratedSongsMonthly", items);
    clearStatsMetadataQueue("vizMetadataQueueMonthly");
    vizMonthlyCharts(items);
    renderVisualDrilldown();
  } else {
    vizRenderKPIs(document.getElementById("vizKpiAlltime"), [
      { label: "Months", value: vizMonths().length },
      { label: "Genres", value: items.length },
      { label: "Songs", value: songs.length },
      { label: "Artists", value: artists.uniqueArtists },
      { label: "Rated", value: `${health.ratedPct}%` },
      { label: "Like rate", value: health.rated ? `${health.likeRate}%` : "—" },
      { label: "Unrated", value: health.unrated },
    ]);
    vizRenderSongReactions("vizSongReactionsAll", items);
    vizRenderCrossovers("vizCrossoversAll", items, 12);
    renderNeedsAttention("vizNeedsAttentionAll");
    renderUnratedSongs("vizUnratedSongsAll", items);
    clearStatsMetadataQueue("vizMetadataQueueAll");
    vizAllTimeCharts(items);
    renderVisualDrilldown();
  }
  toggleLibrarySaveButton(libraryUpdatesPending);
  if (Date.now() < spotifyRefreshPausedUntil) updateSpotifyPauseDisplay();
  statsPolishApply();
}

function initVisuals() {
  const sel = document.getElementById("vizMonthSelect");
  if (sel) {
    const months = vizMonths();
    const existing = [...sel.options].map((o) => o.value);
    if (!existing.length || existing.join("|") !== months.join("|")) {
      sel.innerHTML = months
        .map(
          (m) =>
            `<option value="${escapeHtml(m)}">${escapeHtml(vizMonthTitle(m))}</option>`,
        )
        .join("");
      if (months.length) sel.value = months[months.length - 1];
    }
  }
  if (!visualsLifecycleInitialized) {
    document.querySelectorAll("[data-viz-mode]").forEach((btn) => {
      btn.onclick = () => setVizMode(btn.dataset.vizMode || "monthly");
    });
    document
      .getElementById("vizMonthSelect")
      ?.addEventListener("change", renderVisuals);
    document.addEventListener("click", statsMaintenanceDelegatedClick, true);
    visualsLifecycleInitialized = true;
  }
  applyVizModeDisplay();
  renderVisuals();
}

function clearStatsMetadataQueue(mountId) {
  const mount = document.getElementById(mountId);
  if (mount) mount.innerHTML = "";
}

function renderNeedsAttention(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const stats = maintenanceStats();
  const buckets = [
    ["Pending nominations", stats.pendingRows],
    ["Unrated songs", stats.unratedRows],
    ["Prepared drafts", stats.drafts],
    ["Possible duplicates", stats.duplicates],
  ];
  mount.innerHTML = `<div class="viz-maint-grid dg-stats-maint-grid">${buckets
    .map(
      ([label, list]) =>
        `<button type="button" class="viz-maint-card" data-maint-label="${escapeHtml(label)}"><strong>${list.length}</strong><span>${escapeHtml(label)}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="viz-maint-detail" id="${mountId}Detail"><span class="small">Select a box to inspect the exact songs or genres behind that count.</span></div>`;
  mount.dataset.maintenance = JSON.stringify(
    buckets.reduce((acc, [label, list]) => {
      acc[label] = list.length;
      return acc;
    }, {}),
  );
}

function statsMaintenanceDelegatedClick(event) {
  const card = event.target?.closest?.(
    "#screen-viz .viz-maint-card[data-maint-label]",
  );
  if (!card) return;
  event.preventDefault();
  event.stopPropagation();
  showMaintenanceGenres(card.dataset.maintLabel || "");
}

// Keep metadata work discoverable from old links, but route it away from Stats.
function openMetadataQueue(filter = "spotify", mode = "alltime") {
  metadataQueueFilter = ["spotify", "art", "broken", "nonspotify"].includes(
    filter,
  )
    ? filter
    : "spotify";
  if (typeof switchScreen === "function") switchScreen("review");
  const label = filter === "art" ? "missing album art" : "metadata";
  showSaveToast(
    `Metadata queues now live in Review. Open Review for ${label}.`,
    false,
  );
}

function statsPolishApplyV33Legacy() {
  const root = document.getElementById("screen-viz");
  if (!root) return;
  root.classList.add("dg-stats-polished");

  root.querySelectorAll(".viz-card-metadata").forEach((card) => {
    card.classList.add("dg-viz-hide-card");
  });

  root
    .querySelectorAll(".viz-card-copy, .viz-chart-hint, .viz-spotlight-copy")
    .forEach((el) => {
      const text = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return;
      el.dataset.dgTooltipText = text;
      el.title = text;
      el.classList.add("dg-viz-tooltip-source");
      const parent = el.parentElement;
      if (parent && !parent.querySelector(":scope > .dg-viz-info")) {
        const info = document.createElement("button");
        info.type = "button";
        info.className = "dg-viz-info";
        info.title = text;
        info.setAttribute("aria-label", text);
        info.textContent = "ⓘ";
        const label = parent.querySelector(
          ":scope > .viz-card-label, :scope > .viz-spotlight-label",
        );
        label?.insertAdjacentElement("afterend", info);
      }
    });

  root.querySelectorAll(".viz-drill-actions button").forEach((btn) => {
    if (/^spotify$/i.test(String(btn.textContent || "").trim())) btn.remove();
  });
  root.querySelectorAll(".viz-drill-explain").forEach((el) => {
    const text = String(el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      el.title = text;
      el.classList.add("dg-viz-tooltip-source");
    }
  });

  root.querySelectorAll(".viz-hl-card").forEach((card) => {
    card.classList.add("dg-viz-summary-card");
  });
}

/* === Stats / Visuals polish v3.4 ===
   Analytics pass: preserve chart layout on drilldown, compress instruction copy,
   and keep maintenance/metadata work out of the Stats surface. */

function setVisualDrilldown(type, value, mode = "alltime") {
  const nextMode = mode || vizMode();
  if (nextMode && nextMode !== vizMode()) {
    _vizMode = nextMode;
    document
      .querySelectorAll("[data-viz-mode]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          (b.dataset.vizMode || "monthly") === _vizMode,
        ),
      );
    const monthSel = document.getElementById("vizMonthSelect");
    if (monthSel) monthSel.style.display = _vizMode === "monthly" ? "" : "none";
  }

  const restore =
    typeof preserveScrollSnapshot === "function"
      ? preserveScrollSnapshot()
      : null;
  vizDrilldownState = { type, value, mode: nextMode };
  renderVisuals();
  restore?.();

  const target = document.getElementById(
    visualDrilldownMountId(vizDrilldownState),
  );
  const card = target?.closest?.(".viz-card");
  card?.classList.add("dg-viz-drill-pulse");
  setTimeout(() => card?.classList.remove("dg-viz-drill-pulse"), 500);
}

function renderDecadeCoverageNote(note, decadeStats, mode) {
  if (!note) return;
  const known = Number(decadeStats?.known || 0);
  const unknown = Number(decadeStats?.unknown || 0);
  const overrides = Number(decadeStats?.overrides || 0);
  if (known) {
    note.innerHTML = `<span class="dg-viz-micro-note">${known} song${known === 1 ? "" : "s"} dated${overrides ? ` · ${overrides} override${overrides === 1 ? "" : "s"}` : ""}${unknown ? ` · <button type="button" class="viz-meta-link dg-viz-meta-link-quiet" onclick="openMetadataQueue('spotify', '${mode}')">${unknown} missing years</button>` : ""}</span>`;
  } else {
    note.innerHTML = `<span class="dg-viz-micro-note">No effective years yet${unknown ? ` · <button type="button" class="viz-meta-link dg-viz-meta-link-quiet" onclick="openMetadataQueue('spotify', '${mode}')">${unknown} songs need metadata</button>` : ""}</span>`;
  }
}

function renderVisualDrilldownV34Legacy() {
  clearVisualDrilldownMounts();
  if (!vizDrilldownState) return;
  const mount = document.getElementById(
    visualDrilldownMountId(vizDrilldownState),
  );
  if (!mount) return;
  const activeCard = mount.closest(".viz-card");
  activeCard?.classList.add("viz-card-selected");
  activeCard?.classList.add("viz-card-with-local-drilldown");
  activeCard?.classList.add("dg-viz-side-drill-card");

  const items = vizRowsForCurrentScope();
  const {
    title,
    rows: allRows,
    explainer,
  } = vizDrilldownRowsForState(items, vizDrilldownState);
  const totalRows = allRows.length;
  const rows = allRows.slice(0, 48);
  const modeLabel =
    vizDrilldownState.mode === "monthly"
      ? `Monthly · ${vizMonthTitle(vizSelectedMonth())}`
      : "All time";
  const focus = vizFocusedGenre();
  const focusLabel = focus ? focus.genre : "All genres";
  const rated = rows.filter((row) =>
    [1, 2, 3].includes(Number(row.song.reaction)),
  ).length;
  const fitRows = rows.filter((row) => Number(row.song.score));
  const avgFit = fitRows.length
    ? (
        fitRows.reduce(
          (sum, row) => sum + (Number(row.song.score || 0) || 0),
          0,
        ) / fitRows.length
      ).toFixed(1)
    : "—";

  mount.innerHTML = `<div class="viz-drilldown is-active dg-viz-side-drill"><div class="viz-drilldown-head"><div><div class="eyebrow" style="margin:0;">Selected crate · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(title)}</strong><div class="small">${totalRows} track${totalRows === 1 ? "" : "s"}${totalRows > rows.length ? ` · showing ${rows.length}` : ""}</div><div class="viz-drill-context"><span>${escapeHtml(focusLabel)}</span><span>${rated}/${rows.length} rated</span><span>Avg fit ${escapeHtml(avgFit)}</span></div><button type="button" class="dg-viz-info dg-viz-info-inline" title="${escapeHtml(explainer)}" aria-label="${escapeHtml(explainer)}">ⓘ</button></div><button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Close</button></div>${
    rows.length
      ? `<div class="viz-drilldown-list">${rows
          .map((row, idx) => {
            const effective = songEffectiveYear(row.song);
            const inputId = `eraOverride_${idx}_${String(row.genre.id).replace(/[^a-zA-Z0-9]/g, "")}`;
            const savedEra = row.song.eraYear || row.song.eraDecade || "";
            const reaction = Number(row.song.reaction || 0);
            const fit = Number(row.song.score || 0) || null;
            const art = row.song.artwork
              ? `<img class="viz-drill-art" src="${escapeHtml(row.song.artwork)}" alt="" loading="lazy">`
              : '<div class="viz-drill-art"></div>';
            const eraLine = effective.year
              ? `${effective.source}: ${effective.year}`
              : "No year";
            const spotifyLine =
              row.song.releaseYear &&
              (effective.source !== "Spotify" || savedEra)
                ? ` · Spotify: ${row.song.releaseYear}`
                : "";
            return `<div class="viz-drill-row viz-record-row">${art}<div><div class="viz-drill-title-line">${vizSongTitleLink(row.song)}</div><div class="viz-drill-meta">${escapeHtml(row.genre.genre || "Unknown genre")} · ${reactionEmoji(reaction)} ${escapeHtml(reactionLabel(reaction))}${fit ? ` · Fit ${fit}/5` : ""}</div><div class="viz-drill-meta">${escapeHtml(eraLine)}${escapeHtml(spotifyLine)} · ${escapeHtml(vizSourceLabel(row.song))}</div></div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || "")}')">Open</button></div></div>`;
          })
          .join("")}</div>`
      : '<div class="viz-empty">No songs found for this drilldown.</div>'
  }</div>`;
}

function statsPolishApplyV34Legacy() {
  const root = document.getElementById("screen-viz");
  if (!root) return;
  root.classList.add("dg-stats-polished", "dg-stats-v34");

  root.querySelectorAll(".viz-card-metadata").forEach((card) => {
    card.classList.add("dg-viz-hide-card");
  });

  root
    .querySelectorAll(".viz-card-copy, .viz-chart-hint, .viz-spotlight-copy")
    .forEach((el) => {
      const text = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return;
      el.dataset.dgTooltipText = text;
      el.title = text;
      el.classList.add("dg-viz-tooltip-source");
      const parent = el.parentElement;
      if (parent && !parent.querySelector(":scope > .dg-viz-info")) {
        const info = document.createElement("button");
        info.type = "button";
        info.className = "dg-viz-info";
        info.title = text;
        info.setAttribute("aria-label", text);
        info.textContent = "ⓘ";
        const label = parent.querySelector(
          ":scope > .viz-card-label, :scope > .viz-spotlight-label",
        );
        label?.insertAdjacentElement("afterend", info);
      }
    });

  root.querySelectorAll(".viz-drill-actions button").forEach((btn) => {
    if (/^spotify$/i.test(String(btn.textContent || "").trim())) btn.remove();
  });

  root.querySelectorAll(".viz-hl-card").forEach((card) => {
    card.classList.add("dg-viz-summary-card");
  });

  // Data-viz pass: keep note content as metadata/tooltip, not a second hero card.
  root.querySelectorAll(".viz-spotlight-card").forEach((card) => {
    card.classList.add("dg-viz-compact-note");
  });
}

/* === Stats / Wrapped-style insight layer v3.5 ===
   Story-first Stats pass: stable inspector, shareable visual card, and
   analytics/admin separation. No app.js, genre-loader, song-carousel, or
   album-carousel changes. */

function dgStatsCurrentRows() {
  try {
    return typeof vizRowsForCurrentScope === "function"
      ? vizRowsForCurrentScope()
      : [];
  } catch (_) {
    try {
      const baseItems =
        typeof vizBaseGenres === "function"
          ? vizBaseGenres()
          : Array.isArray(genres)
            ? genres
            : [];
      return typeof vizFilteredItems === "function"
        ? vizFilteredItems(baseItems)
        : baseItems;
    } catch (__) {
      return [];
    }
  }
}

function dgStatsSnapshotData() {
  const items = dgStatsCurrentRows();
  const songs =
    typeof vizAllOfficialSongs === "function" ? vizAllOfficialSongs(items) : [];
  const artists =
    typeof vizArtists === "function" ? vizArtists(items) : { uniqueArtists: 0 };
  const health =
    typeof visualHealthStats === "function"
      ? visualHealthStats(items)
      : { ratedPct: 0, likeRate: 0, rated: 0, unrated: songs.length };
  const mode = typeof vizMode === "function" ? vizMode() : "monthly";
  const title =
    mode === "monthly"
      ? typeof vizMonthTitle === "function"
        ? vizMonthTitle(vizSelectedMonth())
        : "This month"
      : "All Time";

  const catCounts = new Map();
  items.forEach((g) => {
    const cat =
      String(g.subcategory || g.category_path || "Uncategorized")
        .split(">")[0]
        .trim() || "Uncategorized";
    catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
  });
  const topCats = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const decadeCounts = new Map();
  songs.forEach((s) => {
    let y = null;
    try {
      y =
        typeof songEffectiveYear === "function"
          ? songEffectiveYear(s).year
          : s.releaseYear || s.eraYear;
    } catch (_) {
      y = s.releaseYear || s.eraYear;
    }
    y = Number(y);
    if (Number.isFinite(y) && y > 1800) {
      const d = `${Math.floor(y / 10) * 10}s`;
      decadeCounts.set(d, (decadeCounts.get(d) || 0) + 1);
    }
  });
  const topDecade = [...decadeCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0] || ["—", 0];

  const reactionCounts = { up: 0, meh: 0, down: 0, unrated: 0 };
  songs.forEach((s) => {
    const r = Number(s.reaction || 0);
    if (r === 1) reactionCounts.up += 1;
    else if (r === 2) reactionCounts.meh += 1;
    else if (r === 3) reactionCounts.down += 1;
    else reactionCounts.unrated += 1;
  });
  const ratedReactions =
    reactionCounts.up + reactionCounts.meh + reactionCounts.down;
  const likedPct = ratedReactions
    ? Math.round((reactionCounts.up / ratedReactions) * 100)
    : 0;

  const genreLikes = items
    .map((g) => {
      const list = Array.isArray(g.songs_listened) ? g.songs_listened : [];
      return {
        genre: g.genre || "Unknown genre",
        count: list.filter((s) => Number(s.reaction || 0) === 1).length,
        total: list.length,
      };
    })
    .filter((x) => x.total)
    .sort((a, b) => b.count - a.count || b.total - a.total)[0];

  const lead =
    mode === "monthly"
      ? `${title} leaned ${topCats[0]?.[0] || "wide-ranging"}${topDecade[0] !== "—" ? ` with a ${topDecade[0]} spine` : ""}.`
      : `Your archive leans ${topCats[0]?.[0] || "wide-ranging"}${topDecade[0] !== "—" ? ` with a ${topDecade[0]} center of gravity` : ""}.`;
  const sublead = ratedReactions
    ? `${likedPct}% of rated songs landed as 👍, across ${songs.length} logged song${songs.length === 1 ? "" : "s"}.`
    : `${songs.length} logged song${songs.length === 1 ? "" : "s"}; reaction coverage is still building.`;

  return {
    items,
    songs,
    artists,
    health,
    mode,
    title,
    topCats,
    topDecade,
    reactionCounts,
    ratedReactions,
    likedPct,
    genreLikes,
    lead,
    sublead,
  };
}

function dgStatsInstallStoryCard() {
  const root = document.getElementById("screen-viz");
  const shell = root?.querySelector?.(".viz-shell");
  const hero = root?.querySelector?.(".viz-hero");
  if (!root || !shell || !hero) return;
  const snap = dgStatsSnapshotData();
  let card = root.querySelector("#dgStatsStoryCard");
  if (!card) {
    card = document.createElement("section");
    card.id = "dgStatsStoryCard";
    card.className = "dg-stats-story-card";
    hero.insertAdjacentElement("afterend", card);
  }
  const topCats = snap.topCats
    .map(([name, count]) => `<span>${escapeHtml(name)} <b>${count}</b></span>`)
    .join("");
  card.innerHTML = `<div class="dg-stats-story-main"><div class="eyebrow">Listening story</div><h3>${escapeHtml(snap.lead)}</h3><p>${escapeHtml(snap.sublead)}</p></div><div class="dg-stats-story-chips"><span><b>${snap.songs.length}</b> songs</span><span><b>${snap.artists.uniqueArtists || 0}</b> artists</span><span><b>${snap.health.ratedPct || 0}%</b> rated</span><span><b>${snap.health.likeRate || 0}%</b> like rate</span>${topCats}</div>`;
}

function dgStatsInstallShareButton() {
  const root = document.getElementById("screen-viz");
  const modeBar = root?.querySelector?.(".viz-mode-bar");
  if (!root || !modeBar || root.querySelector("#dgStatsShareVisualBtn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "dgStatsShareVisualBtn";
  btn.className = "btn btn-secondary dg-stats-share-btn";
  btn.innerHTML = `<span aria-hidden="true">▣</span><span>Copy visual card</span>`;
  btn.addEventListener("click", () => dgStatsCopyVisualCard());
  const status = root.querySelector("#vizRefreshStatus");
  (status || modeBar).insertAdjacentElement(
    status ? "beforebegin" : "beforeend",
    btn,
  );
}

function dgStatsDrawRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function dgStatsWrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = word;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}

async function dgStatsCopyVisualCard() {
  const snap = dgStatsSnapshotData();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#fff4d5");
  grad.addColorStop(0.58, "#edd19a");
  grad.addColorStop(1, "#2a170d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(31, 19, 10, 0.92)";
  dgStatsDrawRoundRect(ctx, 58, 54, 1084, 567, 44);
  ctx.fill();

  ctx.fillStyle = "#ffdda0";
  ctx.font = "800 30px Inter, Arial, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("DAILY GENRE STATS", 100, 118);

  ctx.fillStyle = "#fff3dc";
  ctx.font = "900 72px Inter, Arial, sans-serif";
  ctx.fillText(snap.title, 100, 202);

  ctx.font = "700 34px Inter, Arial, sans-serif";
  dgStatsWrapText(ctx, snap.lead, 100, 265, 760, 42, 2);
  ctx.fillStyle = "#e9cfa4";
  ctx.font = "600 28px Inter, Arial, sans-serif";
  dgStatsWrapText(ctx, snap.sublead, 100, 350, 750, 36, 2);

  const metrics = [
    [String(snap.songs.length), "songs"],
    [String(snap.artists.uniqueArtists || 0), "artists"],
    [`${snap.health.ratedPct || 0}%`, "rated"],
    [`${snap.health.likeRate || 0}%`, "like rate"],
  ];
  metrics.forEach(([value, label], idx) => {
    const x = 100 + idx * 198;
    ctx.fillStyle = "rgba(255, 244, 213, 0.08)";
    dgStatsDrawRoundRect(ctx, x, 438, 166, 106, 24);
    ctx.fill();
    ctx.fillStyle = "#ffdda0";
    ctx.font = "900 42px Inter, Arial, sans-serif";
    ctx.fillText(value, x + 22, 490);
    ctx.fillStyle = "#d2ad78";
    ctx.font = "800 18px Inter, Arial, sans-serif";
    ctx.fillText(String(label).toUpperCase(), x + 22, 520);
  });

  const cx = 965,
    cy = 335,
    r = 125;
  const total = Math.max(
    1,
    snap.ratedReactions ||
      snap.reactionCounts.up +
        snap.reactionCounts.meh +
        snap.reactionCounts.down,
  );
  const parts = [
    [snap.reactionCounts.up, "#4b8e39", "👍"],
    [snap.reactionCounts.meh, "#df8c1f", "🤷"],
    [snap.reactionCounts.down, "#bc2e33", "👎"],
  ];
  let start = -Math.PI / 2;
  parts.forEach(([count, color]) => {
    const angle = (count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    start += angle;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 72, 0, Math.PI * 2);
  ctx.fillStyle = "#301b0e";
  ctx.fill();
  ctx.fillStyle = "#fff3dc";
  ctx.font = "900 42px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${snap.likedPct}%`, cx, cy + 5);
  ctx.font = "800 17px Inter, Arial, sans-serif";
  ctx.fillStyle = "#d2ad78";
  ctx.fillText("LIKED", cx, cy + 33);
  ctx.textAlign = "left";

  ctx.fillStyle = "#fff3dc";
  ctx.font = "800 24px Inter, Arial, sans-serif";
  ctx.fillText(`Top lane: ${snap.topCats[0]?.[0] || "—"}`, 835, 520);
  ctx.fillText(`Era center: ${snap.topDecade[0] || "—"}`, 835, 555);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.95),
  );
  if (!blob) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      if (typeof showSaveToast === "function")
        showSaveToast("Stats visual copied as image.", false);
      return;
    }
    throw new Error("Clipboard image unsupported");
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailygenre-stats-${
      String(snap.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "snapshot"
    }.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    if (typeof showSaveToast === "function")
      showSaveToast("Stats visual downloaded as PNG.", false);
  }
}

function dgStatsMarkAdminCards() {
  const root = document.getElementById("screen-viz");
  if (!root) return;
  root.querySelectorAll(".viz-card").forEach((card) => {
    const label = String(
      card.querySelector(".viz-card-label")?.textContent || "",
    )
      .trim()
      .toLowerCase();
    if (
      [
        "needs attention",
        "unrated songs queue",
        "missing metadata queue",
      ].includes(label)
    ) {
      card.classList.add("dg-viz-admin-card");
    }
  });
}

function dgStatsInstallReviewNudge() {
  const root = document.getElementById("screen-viz");
  if (!root || root.querySelector("#dgStatsReviewNudge")) return;
  const monthly = root.querySelector("#vizViewMonthly .viz-secondary-grid");
  const alltime = root.querySelector("#vizViewAlltime .viz-deep-grid");
  [monthly, alltime].forEach((grid) => {
    if (!grid || grid.querySelector("#dgStatsReviewNudge")) return;
    const card = document.createElement("div");
    card.id = "dgStatsReviewNudge";
    card.className = "viz-card dg-stats-review-nudge";
    card.innerHTML = `<div class="viz-card-label">Review workbench</div><p>Cleanup queues, metadata, duplicate checks, and pending nominations now live in Review so Stats can stay focused on listening patterns.</p><button type="button" class="btn btn-secondary" onclick="switchScreen('review')">Open Review</button>`;
    grid.appendChild(card.cloneNode(true));
  });
}

function renderBaseVisualDrilldown() {
  clearVisualDrilldownMounts();
  const globalMount = document.getElementById("vizDrilldownPanel");
  if (!globalMount) return;
  globalMount.innerHTML = "";
  globalMount.classList.remove("is-active", "dg-stats-inspector");
  if (!vizDrilldownState) return;

  const items = vizRowsForCurrentScope();
  const {
    title,
    rows: allRows,
    explainer,
  } = vizDrilldownRowsForState(items, vizDrilldownState);
  const totalRows = allRows.length;
  const rows = allRows.slice(0, 36);
  const modeLabel =
    vizDrilldownState.mode === "monthly"
      ? `Monthly · ${vizMonthTitle(vizSelectedMonth())}`
      : "All time";
  const rated = rows.filter((row) =>
    [1, 2, 3].includes(Number(row.song.reaction)),
  ).length;
  const fitRows = rows.filter((row) => Number(row.song.score));
  const avgFit = fitRows.length
    ? (
        fitRows.reduce(
          (sum, row) => sum + (Number(row.song.score || 0) || 0),
          0,
        ) / fitRows.length
      ).toFixed(1)
    : "—";

  globalMount.classList.add("is-active", "dg-stats-inspector");
  globalMount.innerHTML = `<div class="viz-drilldown is-active dg-viz-side-drill"><div class="viz-drilldown-head"><div><div class="eyebrow" style="margin:0;">Selected crate · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(title)}</strong><div class="small">${totalRows} track${totalRows === 1 ? "" : "s"}${totalRows > rows.length ? ` · showing ${rows.length}` : ""}</div><div class="viz-drill-context"><span>${rated}/${rows.length} rated</span><span>Avg fit ${escapeHtml(avgFit)}</span></div><button type="button" class="dg-viz-info dg-viz-info-inline" title="${escapeHtml(explainer)}" aria-label="${escapeHtml(explainer)}">ⓘ</button></div><button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Close</button></div>${
    rows.length
      ? `<div class="viz-drilldown-list">${rows
          .map((row) => {
            const effective = songEffectiveYear(row.song);
            const reaction = Number(row.song.reaction || 0);
            const fit = Number(row.song.score || 0) || null;
            const art = row.song.artwork
              ? `<img class="viz-drill-art" src="${escapeHtml(row.song.artwork)}" alt="" loading="lazy">`
              : '<div class="viz-drill-art"></div>';
            const eraLine = effective.year
              ? `${effective.source}: ${effective.year}`
              : "No year";
            return `<div class="viz-drill-row viz-record-row">${art}<div><div class="viz-drill-title-line">${vizSongTitleLink(row.song)}</div><div class="viz-drill-meta">${escapeHtml(row.genre.genre || "Unknown genre")} · ${reactionEmoji(reaction)} ${escapeHtml(reactionLabel(reaction))}${fit ? ` · Fit ${fit}/5` : ""}</div><div class="viz-drill-meta">${escapeHtml(eraLine)} · ${escapeHtml(vizSourceLabel(row.song))}</div></div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || "")}')">Open</button></div></div>`;
          })
          .join("")}</div>`
      : '<div class="viz-empty">No songs found for this drilldown.</div>'
  }</div>`;
}

function applyBaseStatsPolish() {
  const root = document.getElementById("screen-viz");
  if (!root) return;
  root.classList.add("dg-stats-polished", "dg-stats-v34", "dg-stats-v35");

  root
    .querySelectorAll(".viz-card-metadata")
    .forEach((card) => card.classList.add("dg-viz-hide-card"));

  root
    .querySelectorAll(".viz-card-copy, .viz-chart-hint, .viz-spotlight-copy")
    .forEach((el) => {
      const text = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return;
      el.dataset.dgTooltipText = text;
      el.title = text;
      el.classList.add("dg-viz-tooltip-source");
      const parent = el.parentElement;
      if (parent && !parent.querySelector(":scope > .dg-viz-info")) {
        const info = document.createElement("button");
        info.type = "button";
        info.className = "dg-viz-info";
        info.title = text;
        info.setAttribute("aria-label", text);
        info.textContent = "ⓘ";
        const label = parent.querySelector(
          ":scope > .viz-card-label, :scope > .viz-spotlight-label",
        );
        label?.insertAdjacentElement("afterend", info);
      }
    });

  root.querySelectorAll(".viz-drill-actions button").forEach((btn) => {
    if (/^spotify$/i.test(String(btn.textContent || "").trim())) btn.remove();
  });
  root
    .querySelectorAll(".viz-hl-card")
    .forEach((card) => card.classList.add("dg-viz-summary-card"));
  root
    .querySelectorAll(".viz-spotlight-card")
    .forEach((card) => card.classList.add("dg-viz-compact-note"));
  dgStatsMarkAdminCards();
  dgStatsInstallStoryCard();
  dgStatsInstallShareButton();
  dgStatsInstallReviewNudge();
}

/* === Stats polish v3.6: usable info tips, chart copy, focus-empty clarity === */
function dgStatsEscapeTip(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function dgStatsInstallInfoTooltips(
  root = document.getElementById("screen-viz"),
) {
  if (!root) return;
  root.querySelectorAll(".dg-viz-info").forEach((info) => {
    const tip = dgStatsEscapeTip(
      info.getAttribute("aria-label") ||
        info.getAttribute("title") ||
        info.dataset.tip ||
        "",
    );
    if (!tip) return;
    info.dataset.tip = tip;
    info.setAttribute("aria-label", tip);
    info.setAttribute("title", tip);
    info.tabIndex = 0;
  });
}

async function dgStatsCopyCanvasVisual(canvas, label = "Daily Genre chart") {
  if (!canvas) return;
  const out = document.createElement("canvas");
  const scale = 2;
  const w = Math.max(700, canvas.width || canvas.clientWidth || 700);
  const h = Math.max(520, canvas.height || canvas.clientHeight || 520);
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#fff5d7");
  grad.addColorStop(1, "#e5c48d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2a170d";
  ctx.font = "900 28px Inter, Arial, sans-serif";
  ctx.fillText(label, 28, 48);
  const margin = 36;
  const chartTop = 72;
  const maxW = w - margin * 2;
  const maxH = h - chartTop - margin;
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height);
  const drawW = canvas.width * ratio;
  const drawH = canvas.height * ratio;
  ctx.drawImage(
    canvas,
    margin + (maxW - drawW) / 2,
    chartTop + (maxH - drawH) / 2,
    drawW,
    drawH,
  );
  ctx.fillStyle = "rgba(42, 23, 13, 0.62)";
  ctx.font = "700 16px Inter, Arial, sans-serif";
  ctx.fillText("Daily Genre", 28, h - 22);
  const blob = await new Promise((resolve) =>
    out.toBlob(resolve, "image/png", 0.95),
  );
  if (!blob) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showSaveToast?.("Chart copied as image.", false);
      return;
    }
    throw new Error("Clipboard image unsupported");
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "dailygenre-chart"
    }.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showSaveToast?.("Chart downloaded as PNG.", false);
  }
}

function dgStatsInstallChartCopyButtons(
  root = document.getElementById("screen-viz"),
) {
  if (!root) return;
  root.querySelectorAll(".viz-card-donut, .viz-card-spins").forEach((card) => {
    const canvas = card.querySelector("canvas");
    if (!canvas || card.querySelector(":scope > .dg-copy-chart-btn")) return;
    const label = dgStatsEscapeTip(
      card.querySelector(":scope > .viz-card-label")?.textContent ||
        "Daily Genre chart",
    );
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dg-copy-chart-btn";
    btn.title = `Copy ${label} as image`;
    btn.setAttribute("aria-label", `Copy ${label} as image`);
    btn.innerHTML = `<span aria-hidden="true">⧉</span>`;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dgStatsCopyCanvasVisual(canvas, label);
    });
    card.appendChild(btn);
  });
}

function dgStatsInstallFocusedMonthEmptyNote(
  root = document.getElementById("screen-viz"),
) {
  if (!root) return;
  const section = root.querySelector("#vizViewMonthly .viz-section");
  if (!section) return;
  let note = section.querySelector(".dg-stats-focus-empty-note");
  const removeNote = () => {
    root.classList.remove("dg-stats-empty-focus-month");
    note?.remove();
  };
  try {
    const isMonthly =
      typeof vizMode === "function" ? vizMode() === "monthly" : false;
    const focus =
      typeof vizFocusedGenre === "function" ? vizFocusedGenre() : null;
    const items =
      typeof vizFilteredItems === "function" &&
      typeof vizBaseGenres === "function"
        ? vizFilteredItems(vizBaseGenres())
        : [];
    if (!isMonthly || !focus || (Array.isArray(items) && items.length)) {
      removeNote();
      return;
    }
    if (!note) {
      note = document.createElement("div");
      note.className = "dg-stats-focus-empty-note";
      const header = section.querySelector(".viz-section-header");
      header?.insertAdjacentElement("afterend", note);
    }
    root.classList.add("dg-stats-empty-focus-month");
    const monthTitle =
      typeof vizMonthTitle === "function" &&
      typeof vizSelectedMonth === "function"
        ? vizMonthTitle(vizSelectedMonth())
        : "this month";
    note.innerHTML = `<strong>No ${escapeHtml(focus.genre || "focused genre")} logs in ${escapeHtml(monthTitle)}.</strong><span>The dossier above still shows the all-time genre profile. Switch to All Time for the full trend breakdown.</span>`;
  } catch (_) {
    removeNote();
  }
}

function dgStatsV36Apply() {
  const root = document.getElementById("screen-viz");
  if (!root) return;
  root.classList.add("dg-stats-v36");
  dgStatsInstallInfoTooltips(root);
  dgStatsInstallChartCopyButtons(root);
  dgStatsInstallFocusedMonthEmptyNote(root);
}


/* === Stats polish v3.7: genre focus typeahead + category-aware depth chart ===
   Data-viz pass: make focus selection faster, keep single-genre charts contextual,
   improve bar legibility, and color bars by parent category. No app.js changes. */
function dgStatsNormalizeSearch(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dgStatsAllFocusableGenres() {
  try {
    return (
      typeof allListenedGenresForMaintenance === "function"
        ? allListenedGenresForMaintenance()
        : Array.isArray(genres)
          ? genres.filter((g) => (g.status || "").toLowerCase() === "listened")
          : []
    )
      .slice()
      .sort((a, b) =>
        String(a.genre || "").localeCompare(String(b.genre || "")),
      );
  } catch (_) {
    return [];
  }
}

function dgStatsGenreFocusCandidates() {
  const list = dgStatsAllFocusableGenres();
  return list.map((g) => ({
    id: String(g.id ?? ""),
    name: String(g.genre || "Unknown genre"),
    search: dgStatsNormalizeSearch(g.genre || ""),
    category: dgStatsRootCategory(g),
  }));
}

function dgStatsBestGenreFocusMatch(query) {
  const q = dgStatsNormalizeSearch(query);
  if (!q) return null;
  const candidates = dgStatsGenreFocusCandidates();
  return (
    candidates.find((c) => c.search === q) ||
    candidates.find((c) => c.search.startsWith(q)) ||
    candidates.find((c) => c.search.includes(q)) ||
    null
  );
}

function dgStatsSetGenreFocus(id = "") {
  try {
    const nextId = id ? String(id) : "";
    const previousId = String(vizFocusedGenreId || "");
    vizFocusedGenreId = nextId;
    vizDrilldownState = null;
    renderVisuals();
    if (nextId && nextId !== previousId) {
      const focused =
        typeof vizFocusedGenre === "function" ? vizFocusedGenre() : null;
      const label = focused?.genre || "selected genre";
      if (typeof showSaveToast === "function") {
        showSaveToast(`Stats focused on ${label}.`, false);
      }
      setTimeout(() => {
        const hint = document.querySelector(".dg-stats-typeahead-hint");
        if (hint) {
          hint.textContent = `Focused on ${label}.`;
          hint.classList.remove("is-warning");
          hint.classList.add("is-confirmed");
        }
      }, 30);
    } else if (!nextId && previousId && typeof showSaveToast === "function") {
      showSaveToast("Stats focus cleared.", false);
    }
  } catch (err) {
    console.warn("Could not set Stats genre focus", err);
  }
}

function renderVisualFilters() {
  const mount = document.getElementById("vizFilterMount");
  if (!mount) return;
  const current =
    typeof vizFocusedGenre === "function" ? vizFocusedGenre() : null;
  const candidates = dgStatsGenreFocusCandidates();
  const currentLabel = current ? String(current.genre || "") : "";
  mount.innerHTML = `<div class="viz-filter-row dg-stats-filter-row-v37">
    <div class="viz-filter-control dg-stats-typeahead-wrap">
      <label for="vizGenreFocusTypeahead">Genre focus</label>
      <div class="dg-stats-typeahead-line">
        <input id="vizGenreFocusTypeahead" class="dg-stats-typeahead" type="search" list="vizGenreFocusList" placeholder="Type a listened genre…" value="${escapeHtml(currentLabel)}" autocomplete="off" />
        <datalist id="vizGenreFocusList">
          ${candidates.map((c) => `<option value="${escapeHtml(c.name)}"></option>`).join("")}
        </datalist>
        <button type="button" class="btn btn-secondary btn-tiny dg-stats-focus-apply">Focus</button>
        <button type="button" class="btn btn-ghost btn-tiny dg-stats-focus-clear">All</button>
      </div>
      <div class="small dg-stats-typeahead-hint">${current ? `Focused on ${escapeHtml(current.genre || "this genre")}.` : "All listened genres. Start typing to narrow."}</div>
    </div>
    <button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Clear drilldown</button>
  </div>`;

  const input = mount.querySelector("#vizGenreFocusTypeahead");
  const hint = mount.querySelector(".dg-stats-typeahead-hint");
  const apply = () => {
    const raw = String(input?.value || "").trim();
    if (!raw) {
      dgStatsSetGenreFocus("");
      return;
    }
    const match = dgStatsBestGenreFocusMatch(raw);
    if (match) {
      dgStatsSetGenreFocus(match.id);
    } else if (hint) {
      hint.textContent = "No listened genre match yet. Try a shorter name.";
      hint.classList.add("is-warning");
    }
  };
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    } else if (event.key === "Escape") {
      event.preventDefault();
      dgStatsSetGenreFocus("");
    }
  });
  input?.addEventListener("change", () => {
    const match = dgStatsBestGenreFocusMatch(input.value);
    if (
      match &&
      dgStatsNormalizeSearch(match.name) === dgStatsNormalizeSearch(input.value)
    ) {
      dgStatsSetGenreFocus(match.id);
    }
  });
  input?.addEventListener("input", () => {
    if (!hint) return;
    const q = dgStatsNormalizeSearch(input.value);
    hint.classList.remove("is-warning");
    if (!q) {
      hint.textContent = "All listened genres. Start typing to narrow.";
      return;
    }
    const matches = dgStatsGenreFocusCandidates()
      .filter((c) => c.search.includes(q))
      .slice(0, 3);
    hint.textContent = matches.length
      ? `Best matches: ${matches.map((m) => m.name).join(" · ")}`
      : "No listened genre match yet.";
    if (!matches.length) hint.classList.add("is-warning");
  });
  mount
    .querySelector(".dg-stats-focus-apply")
    ?.addEventListener("click", apply);
  mount
    .querySelector(".dg-stats-focus-clear")
    ?.addEventListener("click", () => dgStatsSetGenreFocus(""));
}

function dgStatsRootCategory(genre) {
  const raw = String(
    genre?.category_path ||
      genre?.categorypath ||
      genre?.subcategory ||
      genre?.category ||
      "Uncategorized",
  );
  return raw.split(">")[0].trim() || "Uncategorized";
}

function dgStatsCategoryColor(category, alpha = 1) {
  const palette = {
    Electronic: [196, 126, 27],
    Rock: [132, 82, 35],
    Pop: [72, 132, 55],
    Metal: [183, 50, 48],
    Country: [91, 107, 130],
    Jazz: [201, 150, 14],
    "Hip-hop": [140, 79, 184],
    "Hip hop": [140, 79, 184],
    Punk: [44, 127, 184],
    Blues: [0, 146, 146],
    Folk: [216, 92, 112],
    Classical: [130, 112, 45],
    "R&B": [185, 104, 30],
  };
  const key = Object.keys(palette).find(
    (k) => dgStatsNormalizeSearch(k) === dgStatsNormalizeSearch(category),
  );
  const [r, g, b] = palette[key] || [141, 92, 37];
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0.12, Math.min(1, alpha))})`;
}

function dgStatsDepthRowsForChart(currentItems) {
  const focus =
    typeof vizFocusedGenre === "function" ? vizFocusedGenre() : null;
  const source = focus ? dgStatsAllFocusableGenres() : currentItems;
  const focusCategory = focus ? dgStatsRootCategory(focus) : "";
  let rows = (source || [])
    .filter((g) => !focus || dgStatsRootCategory(g) === focusCategory)
    .map((g) => ({
      genre: g.genre || "Unknown",
      count:
        typeof vizOfficialSongs === "function"
          ? vizOfficialSongs(g).length
          : Array.isArray(g.songs_listened)
            ? g.songs_listened.length
            : 0,
      category: dgStatsRootCategory(g),
      selected: focus ? String(g.id) === String(focus.id) : false,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));

  if (focus) {
    const selected = rows.find((x) => x.selected);
    rows = rows.slice(0, 15);
    if (selected && !rows.some((x) => x.selected))
      rows = [selected, ...rows.slice(0, 14)];
  } else {
    rows = rows.slice(0, 15);
  }
  return rows;
}

function dgStatsRenderDepthChart(currentItems) {
  const depthCanvas = document.getElementById("vizSongsDepth");
  if (!depthCanvas || typeof Chart === "undefined") return;
  try {
    _vizCharts.depth?.destroy?.();
  } catch (_) {}
  const focus =
    typeof vizFocusedGenre === "function" ? vizFocusedGenre() : null;
  const rows = dgStatsDepthRowsForChart(currentItems || []);
  const card = depthCanvas.closest(".viz-card");
  const label = card?.querySelector(".viz-card-label");
  if (label)
    label.textContent = focus
      ? `Most Songs Logged · ${dgStatsRootCategory(focus)} peers`
      : "Most Songs Logged (Top 15)";
  card?.classList.add("dg-depth-chart-card");
  card?.classList.toggle("dg-depth-chart-focused", !!focus);

  if (!rows.length) {
    const ctx = depthCanvas.getContext("2d");
    ctx?.clearRect(0, 0, depthCanvas.width, depthCanvas.height);
    return;
  }

  const colors = rows.map((row) =>
    dgStatsCategoryColor(
      row.category,
      focus ? (row.selected ? 0.95 : 0.34) : 0.86,
    ),
  );
  const borderColors = rows.map((row) =>
    dgStatsCategoryColor(row.category, row.selected ? 1 : 0.75),
  );
  _vizCharts.depth = new Chart(depthCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: rows.map((x) => (x.selected ? `${x.genre}  • focus` : x.genre)),
      datasets: [
        {
          data: rows.map((x) => x.count),
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: focus ? 1.5 : 0,
          borderRadius: 7,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.parsed.x} logged song${ctx.parsed.x === 1 ? "" : "s"}`,
            afterLabel: (ctx) => rows[ctx.dataIndex]?.category || "",
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: "#4b3724",
            font: { size: 12, weight: "700" },
          },
          grid: { color: "rgba(74, 52, 31, 0.12)" },
        },
        y: {
          ticks: {
            color: "#22160d",
            font: { size: 12, weight: "800" },
            autoSkip: false,
          },
          grid: { display: false },
        },
      },
    },
  });
  const noteClass = "dg-depth-context-note";
  let note = card?.querySelector(`.${noteClass}`);
  if (!note && card) {
    note = document.createElement("div");
    note.className = noteClass;
    depthCanvas.insertAdjacentElement("afterend", note);
  }
  if (note) {
    note.innerHTML = focus
      ? `Showing ${escapeHtml(dgStatsRootCategory(focus))} peers so ${escapeHtml(focus.genre || "this genre")} is not a one-bar chart. Focus bar is fully saturated; neighboring bars are muted.`
      : `Bars are colored by parent category.`;
  }
}

const dgStatsPreviousAllTimeChartsV37 =
  typeof vizAllTimeCharts === "function" ? vizAllTimeCharts : null;
vizAllTimeCharts = function vizAllTimeChartsV37(items) {
  dgStatsPreviousAllTimeChartsV37?.(items);
  dgStatsRenderDepthChart(items || []);
};


/* === Stats polish v3.8: parent-category focus, category drilldowns, legend-aware chart copy ===
   Scope: Visuals only. No app loader, carousel, Spotify, save-flow, or JSON changes. */
let dgStatsSelectedCategoriesV38 = [];
let dgStatsCategoryDrilldownSelectionV38 = [];

function dgStatsUniqueSorted(values = []) {
  return [...new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function dgStatsCategoryRows() {
  const map = new Map();
  const list = typeof dgStatsAllFocusableGenres === 'function'
    ? dgStatsAllFocusableGenres()
    : (Array.isArray(genres) ? genres : []);
  (list || []).forEach((genre) => {
    const category = typeof dgStatsRootCategory === 'function'
      ? dgStatsRootCategory(genre)
      : String(genre?.subcategory || genre?.category_path || 'Uncategorized').split('>')[0].trim() || 'Uncategorized';
    const entry = map.get(category) || { category, genres: 0, songs: 0 };
    entry.genres += 1;
    try {
      entry.songs += typeof vizOfficialSongs === 'function'
        ? vizOfficialSongs(genre).length
        : Array.isArray(genre.songs_listened) ? genre.songs_listened.length : 0;
    } catch (_) {}
    map.set(category, entry);
  });
  return [...map.values()].sort((a, b) => b.genres - a.genres || a.category.localeCompare(b.category));
}

function dgStatsGetCategoryFocus() {
  return dgStatsUniqueSorted(dgStatsSelectedCategoriesV38);
}

function dgStatsHasCategoryFocus() {
  return dgStatsGetCategoryFocus().length > 0;
}

function dgStatsSetCategoryFocus(categories = [], options = {}) {
  dgStatsSelectedCategoriesV38 = dgStatsUniqueSorted(categories);
  if (dgStatsSelectedCategoriesV38.length) {
    try { vizFocusedGenreId = ''; } catch (_) {}
  }
  if (options.clearDrilldown !== false) {
    try { vizDrilldownState = null; } catch (_) {}
    dgStatsCategoryDrilldownSelectionV38 = [];
  }
  if (options.render !== false && typeof renderVisuals === 'function') renderVisuals();
}

function dgStatsToggleCategoryFocus(category, options = {}) {
  const value = String(category || '').trim();
  if (!value) return;
  const current = dgStatsGetCategoryFocus();
  const exists = current.some((cat) => dgStatsNormalizeSearch(cat) === dgStatsNormalizeSearch(value));
  const next = exists
    ? current.filter((cat) => dgStatsNormalizeSearch(cat) !== dgStatsNormalizeSearch(value))
    : [...current, value];
  dgStatsSetCategoryFocus(next, options);
}

function dgStatsGenreCategory(genre) {
  return typeof dgStatsRootCategory === 'function'
    ? dgStatsRootCategory(genre)
    : String(genre?.subcategory || genre?.category_path || 'Uncategorized').split('>')[0].trim() || 'Uncategorized';
}

const dgStatsPreviousVizFilteredItemsV38 =
  typeof vizFilteredItems === 'function' ? vizFilteredItems : null;
vizFilteredItems = function vizFilteredItemsV38(items) {
  const base = dgStatsPreviousVizFilteredItemsV38
    ? dgStatsPreviousVizFilteredItemsV38(items)
    : (items || []);
  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return base;
  const selectedNorm = new Set(selected.map(dgStatsNormalizeSearch));
  return (base || []).filter((genre) => selectedNorm.has(dgStatsNormalizeSearch(dgStatsGenreCategory(genre))));
};

function dgStatsCategoryFocusSummary(items) {
  const songs = typeof vizAllOfficialSongs === 'function' ? vizAllOfficialSongs(items || []) : [];
  const artists = typeof vizArtists === 'function' ? vizArtists(items || []) : { uniqueArtists: 0 };
  const health = typeof visualHealthStats === 'function'
    ? visualHealthStats(items || [])
    : { ratedPct: 0, likeRate: 0, rated: 0 };
  return { songs, artists, health };
}

const dgStatsPreviousRenderFocusBannerV38 =
  typeof renderFocusBanner === 'function' ? renderFocusBanner : null;
renderFocusBanner = function renderFocusBannerV38() {
  const mount = document.getElementById('vizFocusBanner');
  if (!mount) return;
  const selected = dgStatsGetCategoryFocus();
  const focused = typeof vizFocusedGenre === 'function' ? vizFocusedGenre() : null;
  if (!selected.length || focused) {
    dgStatsPreviousRenderFocusBannerV38?.();
    return;
  }
  const scopedBase = (typeof vizMode === 'function' && vizMode() === 'monthly')
    ? (typeof vizBaseGenres === 'function' ? vizBaseGenres() : [])
    : (typeof allListenedGenresForMaintenance === 'function' ? allListenedGenresForMaintenance() : []);
  const items = typeof vizFilteredItems === 'function' ? vizFilteredItems(scopedBase) : scopedBase;
  const { songs, artists, health } = dgStatsCategoryFocusSummary(items);
  mount.innerHTML = `<div class="viz-focus-banner dg-category-focus-banner"><div><div class="viz-focus-title">Parent category focus · ${escapeHtml(selected.join(' + '))}</div><div class="small">${items.length} genre${items.length === 1 ? '' : 's'} · ${songs.length} song${songs.length === 1 ? '' : 's'} · ${artists.uniqueArtists || 0} artist${artists.uniqueArtists === 1 ? '' : 's'} · ${health.ratedPct || 0}% rated${health.rated ? ` · ${health.likeRate || 0}% like rate` : ''}</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear categories</button></div>`;
};

const dgStatsPreviousRenderGenreDossierV38 =
  typeof renderGenreDossier === 'function' ? renderGenreDossier : null;
renderGenreDossier = function renderGenreDossierV38(items) {
  const focused = typeof vizFocusedGenre === 'function' ? vizFocusedGenre() : null;
  const selected = dgStatsGetCategoryFocus();
  if (focused || !selected.length) {
    dgStatsPreviousRenderGenreDossierV38?.(items);
    return;
  }
  const mount = document.getElementById('vizGenreDossier');
  if (!mount) return;
  const rows = (items || []).slice();
  const songs = typeof vizAllOfficialSongs === 'function' ? vizAllOfficialSongs(rows) : [];
  const artists = typeof vizArtists === 'function' ? vizArtists(rows) : { uniqueArtists: 0 };
  const health = typeof visualHealthStats === 'function' ? visualHealthStats(rows) : { ratedPct: 0, likeRate: 0, rated: 0, unrated: 0 };
  const topGenres = rows
    .map((g) => ({ genre: g.genre || 'Unknown genre', category: dgStatsGenreCategory(g), count: typeof vizOfficialSongs === 'function' ? vizOfficialSongs(g).length : 0 }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, 5);
  const topGenreText = topGenres.length
    ? topGenres.map((g) => `${g.genre} (${g.count})`).join(' · ')
    : 'No song logs yet';
  mount.innerHTML = `<div class="viz-dossier dg-category-dossier"><div class="viz-dossier-head"><div><div class="eyebrow" style="margin:0;">Parent category dossier</div><h3 class="viz-dossier-title">${escapeHtml(selected.join(' + '))}</h3><div class="small">A focused view across every listened genre in the selected parent categor${selected.length === 1 ? 'y' : 'ies'}.</div></div><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear Focus</button></div><div class="viz-dossier-grid"><div class="viz-dossier-card"><div class="viz-dossier-label">Genres</div><div class="viz-dossier-value">${rows.length}</div><div class="viz-dossier-sub">${escapeHtml(selected.join(' · '))}</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Songs</div><div class="viz-dossier-value">${songs.length}</div><div class="viz-dossier-sub">Official logged songs in scope</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Artists</div><div class="viz-dossier-value">${artists.uniqueArtists || 0}</div><div class="viz-dossier-sub">Unique artists with metadata</div></div><div class="viz-dossier-card"><div class="viz-dossier-label">Coverage</div><div class="viz-dossier-value">${health.ratedPct || 0}% rated</div><div class="viz-dossier-sub">${health.unrated || 0} unrated genre${health.unrated === 1 ? '' : 's'}</div></div><div class="viz-dossier-card" style="grid-column:1/-1"><div class="viz-dossier-label">Most songs logged</div><div class="viz-dossier-value" style="font-size:1rem;line-height:1.25">${escapeHtml(topGenreText)}</div></div></div></div>`;
};

function renderVisualFilters() {
  const mount = document.getElementById('vizFilterMount');
  if (!mount) return;
  const current = typeof vizFocusedGenre === 'function' ? vizFocusedGenre() : null;
  const candidates = typeof dgStatsGenreFocusCandidates === 'function' ? dgStatsGenreFocusCandidates() : [];
  const categories = dgStatsCategoryRows();
  const selected = dgStatsGetCategoryFocus();
  const selectedNorm = new Set(selected.map(dgStatsNormalizeSearch));
  const currentLabel = current ? String(current.genre || '') : '';
  mount.innerHTML = `<div class="viz-filter-row dg-stats-filter-row-v38">
    <div class="viz-filter-control dg-stats-typeahead-wrap">
      <label for="vizGenreFocusTypeahead">Genre focus</label>
      <div class="dg-stats-typeahead-line">
        <input id="vizGenreFocusTypeahead" class="dg-stats-typeahead" type="search" list="vizGenreFocusList" placeholder="Type a listened genre…" value="${escapeHtml(currentLabel)}" autocomplete="off" />
        <datalist id="vizGenreFocusList">
          ${candidates.map((c) => `<option value="${escapeHtml(c.name)}"></option>`).join('')}
        </datalist>
        <button type="button" class="btn btn-secondary btn-tiny dg-stats-focus-apply">Focus</button>
        <button type="button" class="btn btn-ghost btn-tiny dg-stats-focus-clear">All</button>
      </div>
      <div class="small dg-stats-typeahead-hint">${current ? `Focused on ${escapeHtml(current.genre || 'this genre')}.` : 'All listened genres. Start typing to narrow.'}</div>
    </div>
    <div class="viz-filter-control dg-stats-category-focus-wrap">
      <label for="vizCategoryFocusSelect">Parent category focus</label>
      <div class="dg-stats-category-line">
        <select id="vizCategoryFocusSelect">
          <option value="">Add parent category…</option>
          ${categories.map((row) => `<option value="${escapeHtml(row.category)}">${escapeHtml(row.category)} · ${row.genres} genre${row.genres === 1 ? '' : 's'}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary btn-tiny dg-stats-category-add">Add</button>
        <button type="button" class="btn btn-ghost btn-tiny dg-stats-category-clear">All categories</button>
      </div>
      <div class="dg-stats-category-chips">
        ${selected.length ? selected.map((cat) => `<button type="button" class="dg-stats-category-chip" data-category="${escapeHtml(cat)}"><span>${escapeHtml(cat)}</span><b aria-hidden="true">×</b></button>`).join('') : '<span class="small">No parent category focus. Use the selector, or click the category pie for drilldown only.</span>'}
      </div>
      <div class="small dg-stats-typeahead-hint">Tip: Cmd/Ctrl/Shift-click pie slices to drill into multiple categories without changing this filter.</div>
    </div>
    <button type="button" class="btn btn-secondary btn-tiny dg-stats-clear-drilldown">Clear drilldown</button>
  </div>`;

  const input = mount.querySelector('#vizGenreFocusTypeahead');
  const hint = mount.querySelector('.dg-stats-typeahead-hint');
  const applyGenre = () => {
    const raw = String(input?.value || '').trim();
    if (!raw) {
      try { vizFocusedGenreId = ''; } catch (_) {}
      dgStatsSetCategoryFocus([], { render: true });
      return;
    }
    const match = typeof dgStatsBestGenreFocusMatch === 'function' ? dgStatsBestGenreFocusMatch(raw) : null;
    if (match) {
      dgStatsSetCategoryFocus([], { render: false, clearDrilldown: true });
      try { vizFocusedGenreId = String(match.id || ''); } catch (_) {}
      try { vizDrilldownState = null; } catch (_) {}
      if (typeof renderVisuals === 'function') renderVisuals();
    } else if (hint) {
      hint.textContent = 'No listened genre match yet. Try a shorter name.';
      hint.classList.add('is-warning');
    }
  };
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applyGenre(); }
    else if (event.key === 'Escape') { event.preventDefault(); try { vizFocusedGenreId = ''; } catch (_) {}; if (typeof renderVisuals === 'function') renderVisuals(); }
  });
  input?.addEventListener('input', () => {
    if (!hint) return;
    const q = dgStatsNormalizeSearch(input.value);
    hint.classList.remove('is-warning');
    if (!q) { hint.textContent = selected.length ? 'Parent category focus is active; select a genre to switch focus modes.' : 'All listened genres. Start typing to narrow.'; return; }
    const matches = candidates.filter((c) => c.search.includes(q)).slice(0, 3);
    hint.textContent = matches.length ? `Best matches: ${matches.map((m) => m.name).join(' · ')}` : 'No listened genre match yet.';
    if (!matches.length) hint.classList.add('is-warning');
  });
  mount.querySelector('.dg-stats-focus-apply')?.addEventListener('click', applyGenre);
  mount.querySelector('.dg-stats-focus-clear')?.addEventListener('click', () => {
    try { vizFocusedGenreId = ''; } catch (_) {}
    dgStatsSetCategoryFocus([], { render: true });
  });

  const addCategory = () => {
    const value = String(mount.querySelector('#vizCategoryFocusSelect')?.value || '').trim();
    if (!value) return;
    const next = dgStatsUniqueSorted([...selected, value]);
    dgStatsSetCategoryFocus(next, { render: true });
  };
  mount.querySelector('#vizCategoryFocusSelect')?.addEventListener('change', addCategory);
  mount.querySelector('.dg-stats-category-add')?.addEventListener('click', addCategory);
  mount.querySelector('.dg-stats-category-clear')?.addEventListener('click', () => dgStatsSetCategoryFocus([], { render: true }));
  mount.querySelectorAll('.dg-stats-category-chip').forEach((chip) => {
    chip.addEventListener('click', () => dgStatsToggleCategoryFocus(chip.dataset.category || '', { render: true }));
  });
  mount.querySelector('.dg-stats-clear-drilldown')?.addEventListener('click', () => clearVisualDrilldown());
}

function dgStatsCategorySliceColor(label, index, alpha = 0.86) {
  const known = typeof dgStatsCategoryColor === 'function' ? dgStatsCategoryColor(label, alpha) : '';
  const defaultColor = 'rgba(141, 92, 37';
  if (known && !known.startsWith(defaultColor)) return known;
  const palette = typeof vizPalette === 'function' ? vizPalette() : ['#d88a22', '#8c5b23', '#4e8a35', '#b83230', '#5b6b82'];
  const hex = palette[index % palette.length] || '#8d5c25';
  const m = String(hex).match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${Math.max(0.12, Math.min(1, alpha))})`;
}

function dgStatsCategoryCounts(items = []) {
  const counts = new Map();
  (items || []).forEach((genre) => {
    const category = dgStatsGenreCategory(genre);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function dgStatsCategoryChartSelection() {
  const state = typeof vizDrilldownState !== 'undefined' ? vizDrilldownState : null;
  if (state?.type !== 'category') return [];
  return dgStatsUniqueSorted(Array.isArray(state.value) ? state.value : [state.value]);
}

function dgStatsSetCategoryDrilldown(category, mode = 'alltime', event = null) {
  const rawLabel = String(category || '').trim();
  let label = rawLabel;
  try { label = decodeURIComponent(rawLabel); } catch (_) {}
  label = String(label || '').trim();
  if (!label) return;
  const native = event?.native || event || {};
  const modifier = Boolean(native.shiftKey || native.ctrlKey || native.metaKey);
  const current = dgStatsCategoryChartSelection();
  let next;
  if (modifier) {
    const exists = current.some((cat) => dgStatsNormalizeSearch(cat) === dgStatsNormalizeSearch(label));
    next = exists
      ? current.filter((cat) => dgStatsNormalizeSearch(cat) !== dgStatsNormalizeSearch(label))
      : [...current, label];
  } else {
    next = [label];
  }
  dgStatsCategoryDrilldownSelectionV38 = dgStatsUniqueSorted(next);
  if (!dgStatsCategoryDrilldownSelectionV38.length) {
    clearVisualDrilldown();
    return;
  }
  try {
    vizDrilldownState = { type: 'category', value: dgStatsCategoryDrilldownSelectionV38.slice(), mode: mode || (typeof vizMode === 'function' ? vizMode() : 'alltime') };
  } catch (_) {}
  if (typeof renderVisuals === 'function') renderVisuals();
  setTimeout(() => document.getElementById('vizDrilldownPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 30);
}

function dgStatsRenderCategoryDonut(items = [], mode = 'monthly') {
  if (typeof Chart === 'undefined') return;
  const isMonthly = mode === 'monthly';
  const canvas = document.getElementById(isMonthly ? 'vizCatDonut' : 'vizCatDonutAll');
  const legend = document.getElementById(isMonthly ? 'vizCatLegend' : 'vizCatLegendAll');
  if (!canvas) return;
  const rows = dgStatsCategoryCounts(items);
  const labels = rows.map(([label]) => label);
  const values = rows.map(([, value]) => value);
  const selected = dgStatsCategoryChartSelection();
  const selectedNorm = new Set(selected.map(dgStatsNormalizeSearch));
  const hasSelection = selected.length > 0;
  const colors = labels.map((label, index) => dgStatsCategorySliceColor(label, index, hasSelection ? (selectedNorm.has(dgStatsNormalizeSearch(label)) ? 0.95 : 0.25) : 0.86));
  const borderColors = labels.map((label, index) => dgStatsCategorySliceColor(label, index, selectedNorm.has(dgStatsNormalizeSearch(label)) ? 1 : 0.72));
  const chartKey = isMonthly ? 'catMonthly' : 'catAll';
  try { _vizCharts[chartKey]?.destroy?.(); } catch (_) {}
  if (!labels.length) return;
  canvas.closest('.viz-card')?.classList.add('viz-clickable-chart', 'dg-category-clickable-card');
  _vizCharts[chartKey] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: borderColors, borderWidth: labels.map((label) => selectedNorm.has(dgStatsNormalizeSearch(label)) ? 4 : 2) }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed} genre${ctx.parsed === 1 ? '' : 's'}` } },
      },
      cutout: '62%',
      onClick: (event, elements) => {
        if (!elements.length) return;
        const label = labels[elements[0].index];
        // Let Chart.js finish its event/plugin cycle before the drilldown
        // rerender destroys and recreates this chart.
        const nativeEvent = event?.native || event || {};
        const modifierState = {
          shiftKey: Boolean(nativeEvent.shiftKey),
          ctrlKey: Boolean(nativeEvent.ctrlKey),
          metaKey: Boolean(nativeEvent.metaKey),
        };
        setTimeout(() => {
          dgStatsSetCategoryDrilldown(label, mode, modifierState);
        }, 0);
      },
      onHover: (event, elements) => {
        if (event?.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
    },
  });
  if (typeof vizLegend === 'function') vizLegend(legend, labels, values, colors);
  if (legend) {
    legend.classList.add('dg-category-legend-interactive');
    legend.querySelectorAll('.viz-legend-item').forEach((item, index) => {
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.classList.toggle('active', selectedNorm.has(dgStatsNormalizeSearch(labels[index])));
      const activate = (event) => dgStatsSetCategoryDrilldown(labels[index], mode, event);
      item.addEventListener('click', activate);
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
      });
      item.title = 'Click to drill down. Cmd/Ctrl/Shift-click to add/remove categories.';
    });
  }
}

const dgStatsPreviousMonthlyChartsV38 =
  typeof vizMonthlyCharts === 'function' ? vizMonthlyCharts : null;
vizMonthlyCharts = function vizMonthlyChartsV38(items) {
  dgStatsPreviousMonthlyChartsV38?.(items || []);
  dgStatsRenderCategoryDonut(items || [], 'monthly');
};

const dgStatsPreviousAllTimeChartsV38 =
  typeof vizAllTimeCharts === 'function' ? vizAllTimeCharts : null;
vizAllTimeCharts = function vizAllTimeChartsV38(items) {
  dgStatsPreviousAllTimeChartsV38?.(items || []);
  dgStatsRenderCategoryDonut(items || [], 'alltime');
};

function dgStatsGenresForCategoryDrilldown(state = vizDrilldownState) {
  const categories = dgStatsUniqueSorted(Array.isArray(state?.value) ? state.value : [state?.value]);
  const catNorm = new Set(categories.map(dgStatsNormalizeSearch));
  const base = typeof vizRowsForCurrentScope === 'function' ? vizRowsForCurrentScope() : [];
  return (base || [])
    .filter((genre) => catNorm.has(dgStatsNormalizeSearch(dgStatsGenreCategory(genre))))
    .map((genre) => ({
      genre,
      category: dgStatsGenreCategory(genre),
      songCount: typeof vizOfficialSongs === 'function' ? vizOfficialSongs(genre).length : (Array.isArray(genre.songs_listened) ? genre.songs_listened.length : 0),
      rating: String(genre.rating || ''),
      date: typeof dateValue === 'function' ? dateValue(genre) : (genre.date_normalized || genre.date_raw || ''),
      favorite: genre.favorite_song || genre.favoritesong || '',
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || b.songCount - a.songCount || String(a.genre.genre || '').localeCompare(String(b.genre.genre || '')));
}

function dgStatsRenderCategoryDrilldown() {
  if (typeof clearVisualDrilldownMounts === 'function') clearVisualDrilldownMounts();
  const mount = document.getElementById('vizDrilldownPanel');
  if (!mount) return;
  const state = typeof vizDrilldownState !== 'undefined' ? vizDrilldownState : null;
  mount.innerHTML = '';
  mount.classList.remove('is-active', 'dg-stats-inspector');
  if (!state || state.type !== 'category') return;
  const categories = dgStatsUniqueSorted(Array.isArray(state.value) ? state.value : [state.value]);
  const rows = dgStatsGenresForCategoryDrilldown(state);
  const modeLabel = state.mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All time';
  const totalSongs = rows.reduce((sum, row) => sum + row.songCount, 0);
  mount.classList.add('is-active', 'dg-stats-inspector', 'dg-category-drilldown');
  const categoryChips = categories.map((cat) => `<button type="button" class="dg-stats-category-chip is-drill" onclick="dgStatsSetCategoryDrilldown('${visualActionArg(cat)}', '${state.mode || 'alltime'}', { ctrlKey: true })"><span>${escapeHtml(cat)}</span><b aria-hidden="true">×</b></button>`).join('');
  mount.innerHTML = `<div class="viz-drilldown is-active dg-viz-side-drill dg-category-drill-panel"><div class="viz-drilldown-head"><div><div class="eyebrow" style="margin:0;">Parent category drilldown · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(categories.join(' + '))}</strong><div class="small">${rows.length} genre${rows.length === 1 ? '' : 's'} · ${totalSongs} logged song${totalSongs === 1 ? '' : 's'}</div><div class="viz-drill-context"><span>Click another pie slice to replace this drilldown</span><span>Cmd/Ctrl/Shift-click to combine categories</span></div></div><div class="dg-category-drill-actions"><button type="button" class="btn btn-primary btn-tiny" onclick="dgStatsSetCategoryFocus(${JSON.stringify(categories).replace(/"/g, '&quot;')})">Use as filter</button><button type="button" class="btn btn-secondary btn-tiny" onclick="clearVisualDrilldown()">Close</button></div></div><div class="dg-category-drill-chips">${categoryChips}</div>${rows.length ? `<div class="viz-drilldown-list dg-category-genre-list">${rows.map((row) => { const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${escapeHtml(row.rating)}★` : 'Unrated'; const date = row.date ? ` · ${escapeHtml(row.date)}` : ''; const favorite = row.favorite ? `<div class="viz-drill-meta">Favorite: ${escapeHtml(row.favorite)}</div>` : ''; return `<div class="viz-drill-row viz-record-row dg-category-genre-row"><div class="dg-category-genre-badge">${escapeHtml(row.category.slice(0, 2).toUpperCase())}</div><div><div class="viz-drill-title-line"><strong>${escapeHtml(row.genre.genre || 'Unknown genre')}</strong></div><div class="viz-drill-meta">${escapeHtml(row.category)} · ${rating}${date} · ${row.songCount} song${row.songCount === 1 ? '' : 's'}</div>${favorite}</div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open</button></div></div>`; }).join('')}</div>` : '<div class="viz-empty">No genres found for this category in the current scope.</div>'}</div>`;
}

const dgStatsPreviousSetVisualDrilldownV38 =
  typeof setVisualDrilldown === 'function' ? setVisualDrilldown : null;
setVisualDrilldown = function setVisualDrilldownV38(type, value, mode = 'alltime') {
  if (type === 'category') {
    dgStatsSetCategoryDrilldown(value, mode, null);
    return;
  }
  dgStatsCategoryDrilldownSelectionV38 = [];
  dgStatsPreviousSetVisualDrilldownV38?.(type, value, mode);
};

const dgStatsPreviousClearVisualDrilldownV38 =
  typeof clearVisualDrilldown === 'function' ? clearVisualDrilldown : null;
clearVisualDrilldown = function clearVisualDrilldownV38(rerender = true) {
  dgStatsCategoryDrilldownSelectionV38 = [];
  dgStatsPreviousClearVisualDrilldownV38?.(rerender);
};

function dgStatsChartEntries(canvas) {
  const chart = typeof Chart !== 'undefined' && Chart.getChart ? Chart.getChart(canvas) : null;
  const labels = chart?.data?.labels || [];
  const dataset = chart?.data?.datasets?.[0] || {};
  const values = Array.isArray(dataset.data) ? dataset.data : [];
  const colors = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : [];
  return labels.map((label, index) => ({
    label: String(label || ''),
    value: Number(values[index] || 0),
    color: colors[index] || '#8c5b23',
  })).filter((entry) => entry.label);
}

async function dgStatsCopyCanvasVisual(canvas, label = 'Daily Genre chart') {
  if (!canvas) return;
  const entries = dgStatsChartEntries(canvas).slice(0, 18);
  const extraCount = Math.max(0, dgStatsChartEntries(canvas).length - entries.length);
  const out = document.createElement('canvas');
  const scale = 2;
  const w = 1080;
  const h = entries.length ? 760 : 620;
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#fff5d7');
  grad.addColorStop(1, '#e5c48d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a170d';
  ctx.font = '900 30px Inter, Arial, sans-serif';
  ctx.fillText(label, 34, 52);
  ctx.fillStyle = 'rgba(42, 23, 13, 0.62)';
  ctx.font = '700 16px Inter, Arial, sans-serif';
  const modeLabel = typeof vizMode === 'function' && vizMode() === 'monthly'
    ? (typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : 'Monthly')
    : 'All Time';
  const categoryFocus = dgStatsGetCategoryFocus();
  const scopeLine = categoryFocus.length ? `${modeLabel} · ${categoryFocus.join(' + ')}` : modeLabel;
  ctx.fillText(scopeLine, 34, 78);

  const chartX = 46;
  const chartY = 102;
  const chartW = entries.length ? 610 : 960;
  const chartH = entries.length ? 560 : 430;
  const sourceW = canvas.width || canvas.clientWidth || 600;
  const sourceH = canvas.height || canvas.clientHeight || 360;
  const ratio = Math.min(chartW / sourceW, chartH / sourceH);
  const drawW = sourceW * ratio;
  const drawH = sourceH * ratio;
  ctx.drawImage(canvas, chartX + (chartW - drawW) / 2, chartY + (chartH - drawH) / 2, drawW, drawH);

  if (entries.length) {
    const legendX = 700;
    let y = 116;
    ctx.fillStyle = '#2a170d';
    ctx.font = '900 19px Inter, Arial, sans-serif';
    ctx.fillText('Legend', legendX, y);
    y += 30;
    ctx.font = '700 15px Inter, Arial, sans-serif';
    entries.forEach((entry) => {
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      ctx.arc(legendX + 9, y - 5, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a170d';
      const suffix = Number.isFinite(entry.value) ? ` (${entry.value})` : '';
      dgStatsWrapText(ctx, `${entry.label}${suffix}`, legendX + 28, y, 330, 18, 2);
      y += 38;
    });
    if (extraCount) {
      ctx.fillStyle = 'rgba(42, 23, 13, 0.58)';
      ctx.fillText(`+ ${extraCount} more`, legendX + 28, y);
    }
  }

  ctx.fillStyle = 'rgba(42, 23, 13, 0.62)';
  ctx.font = '700 16px Inter, Arial, sans-serif';
  ctx.fillText('Daily Genre', 34, h - 26);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showSaveToast?.('Chart copied as image with legend.', false);
      return;
    }
    throw new Error('Clipboard image unsupported');
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dailygenre-chart'}-with-legend.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showSaveToast?.('Chart downloaded as PNG with legend.', false);
  }
}

function dgStatsV38InstallStyles() {
  if (document.getElementById('dgStatsV38Styles')) return;
  const style = document.createElement('style');
  style.id = 'dgStatsV38Styles';
  style.textContent = `
    #screen-viz.dg-stats-v38 .dg-stats-filter-row-v38 { grid-template-columns:minmax(240px,1fr) minmax(260px,1.15fr) auto; align-items:start; gap:10px; }
    #screen-viz.dg-stats-v38 .dg-stats-category-line { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:7px; align-items:center; }
    #screen-viz.dg-stats-v38 .dg-stats-category-chips, #screen-viz.dg-stats-v38 .dg-category-drill-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:7px; align-items:center; }
    #screen-viz.dg-stats-v38 .dg-stats-category-chip { border:1px solid rgba(120,74,27,.22); border-radius:999px; background:rgba(255,252,241,.72); color:var(--text,#22160d); padding:5px 8px; display:inline-flex; gap:6px; align-items:center; cursor:pointer; font-weight:850; font-size:.78rem; }
    #screen-viz.dg-stats-v38 .dg-stats-category-chip:hover, #screen-viz.dg-stats-v38 .viz-legend-item:hover { border-color:rgba(217,141,37,.55); background:rgba(255,224,161,.55); }
    #screen-viz.dg-stats-v38 .dg-category-focus-banner { border-color:rgba(217,141,37,.35); }
    #screen-viz.dg-stats-v38 .dg-category-clickable-card canvas { cursor:pointer; }
    #screen-viz.dg-stats-v38 .dg-category-legend-interactive .viz-legend-item { cursor:pointer; border:1px solid transparent; border-radius:10px; padding:3px 5px; transition:background .14s ease,border-color .14s ease; }
    #screen-viz.dg-stats-v38 .dg-category-legend-interactive .viz-legend-item.active { background:rgba(255,224,161,.55); border-color:rgba(217,141,37,.55); font-weight:900; }
    #screen-viz.dg-stats-v38 .dg-category-drill-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    #screen-viz.dg-stats-v38 .dg-category-genre-row { grid-template-columns:44px minmax(0,1fr) auto; }
    #screen-viz.dg-stats-v38 .dg-category-genre-badge { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; background:var(--accent-soft,#ffe0a1); color:var(--accent-dark,#7a4714); font-weight:950; font-size:.76rem; }
    @media (max-width: 780px) { #screen-viz.dg-stats-v38 .dg-stats-filter-row-v38, #screen-viz.dg-stats-v38 .dg-stats-category-line { grid-template-columns:1fr; } #screen-viz.dg-stats-v38 .dg-category-genre-row { grid-template-columns:36px minmax(0,1fr); } #screen-viz.dg-stats-v38 .dg-category-genre-row .viz-drill-actions { grid-column:1/-1; justify-content:flex-start; } }
  `;
  document.head.appendChild(style);
}


window.DailyGenreStatsCategoryHotfix = {
  version: 'stats-category-v11',
  getCategoryFocus: dgStatsGetCategoryFocus,
  setCategoryFocus: dgStatsSetCategoryFocus,
  categoryRows: dgStatsCategoryRows,
};

/* === Stats polish v3.9: category pie controls the whole dashboard ===
   Follow-up to v3.8: remove the disconnected parent-category selector and make
   the category donut itself the filter. Clicking a slice filters every scoped
   dashboard widget; Cmd/Ctrl/Shift-click adds or removes categories. */
function dgStatsCategoryEventHasModifier(event) {
  const native = event?.native || event || {};
  return Boolean(native.shiftKey || native.ctrlKey || native.metaKey);
}

function dgStatsCurrentCategoryControlItems(mode = null) {
  const nextMode = mode || (typeof vizMode === 'function' ? vizMode() : 'monthly');
  const raw = nextMode === 'monthly'
    ? (typeof vizBaseGenres === 'function' ? vizBaseGenres() : [])
    : (typeof allListenedGenresForMaintenance === 'function' ? allListenedGenresForMaintenance() : (Array.isArray(genres) ? genres : []));
  // Apply the pre-category Stats filters, especially single-genre focus, but do
  // not apply the active parent-category focus. This keeps the pie chart useful
  // as a selector after one category has already been selected.
  const filtered = typeof dgStatsPreviousVizFilteredItemsV38 === 'function'
    ? dgStatsPreviousVizFilteredItemsV38(raw || [])
    : (raw || []);
  return Array.isArray(filtered) ? filtered : [];
}

function dgStatsCommitCategorySelection(categories = [], options = {}) {
  const next = dgStatsUniqueSorted(categories);
  dgStatsSelectedCategoriesV38 = next;
  dgStatsCategoryDrilldownSelectionV38 = next.slice();
  const mode = options.mode || (typeof vizMode === 'function' ? vizMode() : 'alltime');
  if (next.length) {
    try { vizFocusedGenreId = ''; } catch (_) {}
    try { vizDrilldownState = { type: 'category', value: next.slice(), mode }; } catch (_) {}
  } else {
    try { vizDrilldownState = null; } catch (_) {}
  }
  if (options.render !== false && typeof renderVisuals === 'function') {
    const restore = typeof preserveScrollSnapshot === 'function' ? preserveScrollSnapshot() : null;
    renderVisuals();
    restore?.();
  }
}

dgStatsSetCategoryFocus = function dgStatsSetCategoryFocusV39(categories = [], options = {}) {
  dgStatsCommitCategorySelection(categories, options);
};

dgStatsToggleCategoryFocus = function dgStatsToggleCategoryFocusV39(category, options = {}) {
  const value = String(category || '').trim();
  if (!value) return;
  const current = dgStatsGetCategoryFocus();
  const exists = current.some((cat) => dgStatsNormalizeSearch(cat) === dgStatsNormalizeSearch(value));
  const next = exists
    ? current.filter((cat) => dgStatsNormalizeSearch(cat) !== dgStatsNormalizeSearch(value))
    : [...current, value];
  dgStatsCommitCategorySelection(next, options);
};

dgStatsCategoryChartSelection = function dgStatsCategoryChartSelectionV39() {
  return dgStatsGetCategoryFocus();
};

dgStatsSetCategoryDrilldown = function dgStatsSetCategoryDrilldownV39(category, mode = 'alltime', event = null) {
  const rawLabel = String(category || '').trim();
  let label = rawLabel;
  try { label = decodeURIComponent(rawLabel); } catch (_) {}
  label = String(label || '').trim();
  if (!label) return;

  const current = dgStatsGetCategoryFocus();
  const norm = dgStatsNormalizeSearch(label);
  const modifier = dgStatsCategoryEventHasModifier(event);
  let next;

  if (modifier) {
    const exists = current.some((cat) => dgStatsNormalizeSearch(cat) === norm);
    next = exists
      ? current.filter((cat) => dgStatsNormalizeSearch(cat) !== norm)
      : [...current, label];
  } else {
    const alreadyOnly = current.length === 1 && dgStatsNormalizeSearch(current[0]) === norm;
    next = alreadyOnly ? [] : [label];
  }

  dgStatsCommitCategorySelection(next, { mode: mode || (typeof vizMode === 'function' ? vizMode() : 'alltime') });
  if (next.length) {
    setTimeout(() => document.getElementById('vizDrilldownPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 30);
  }
};

// Keep the category donut as the selector for the whole current time scope. The
// other dashboard charts receive the filtered items, but this donut receives the
// unfiltered current mode scope so users can add another category after selecting
// the first one.
vizMonthlyCharts = function vizMonthlyChartsV39(items) {
  dgStatsPreviousMonthlyChartsV38?.(items || []);
  dgStatsRenderCategoryDonut(dgStatsCurrentCategoryControlItems('monthly'), 'monthly');
};

vizAllTimeCharts = function vizAllTimeChartsV39(items) {
  dgStatsPreviousAllTimeChartsV38?.(items || []);
  dgStatsRenderCategoryDonut(dgStatsCurrentCategoryControlItems('alltime'), 'alltime');
};

function dgStatsRenderReactiveCategoryDrilldown() {
  if (typeof clearVisualDrilldownMounts === 'function') clearVisualDrilldownMounts();
  const mount = document.getElementById('vizDrilldownPanel');
  if (!mount) return;
  mount.innerHTML = '';
  mount.classList.remove('is-active', 'dg-stats-inspector');
  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return;

  const state = typeof vizDrilldownState !== 'undefined' && vizDrilldownState?.type === 'category'
    ? vizDrilldownState
    : { type: 'category', value: selected, mode: typeof vizMode === 'function' ? vizMode() : 'alltime' };
  const rows = dgStatsGenresForCategoryDrilldown(state);
  const modeLabel = state.mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All time';
  const totalSongs = rows.reduce((sum, row) => sum + row.songCount, 0);
  const categoryChips = selected.map((cat) => `<button type="button" class="dg-stats-category-chip is-drill" onclick="dgStatsToggleCategoryFocus('${visualActionArg(cat)}', { mode: '${state.mode || 'alltime'}' })"><span>${escapeHtml(cat)}</span><b aria-hidden="true">×</b></button>`).join('');
  mount.classList.add('is-active', 'dg-stats-inspector', 'dg-category-drilldown');
  mount.innerHTML = `<div class="viz-drilldown is-active dg-viz-side-drill dg-category-drill-panel"><div class="viz-drilldown-head"><div><div class="eyebrow" style="margin:0;">Active category filter · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(selected.join(' + '))}</strong><div class="small">Every visible chart is now scoped to these categories · ${rows.length} genre${rows.length === 1 ? '' : 's'} · ${totalSongs} logged song${totalSongs === 1 ? '' : 's'}</div><div class="viz-drill-context"><span>Click another pie slice to replace this filter</span><span>Cmd/Ctrl/Shift-click to add/remove categories</span><span>Click a chip to remove it</span></div></div><div class="dg-category-drill-actions"><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear categories</button></div></div><div class="dg-category-drill-chips">${categoryChips}</div>${rows.length ? `<div class="viz-drilldown-list dg-category-genre-list">${rows.map((row) => { const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${escapeHtml(row.rating)}★` : 'Unrated'; const date = row.date ? ` · ${escapeHtml(row.date)}` : ''; const favorite = row.favorite ? `<div class="viz-drill-meta">Favorite: ${escapeHtml(row.favorite)}</div>` : ''; return `<div class="viz-drill-row viz-record-row dg-category-genre-row"><div class="dg-category-genre-badge">${escapeHtml(row.category.slice(0, 2).toUpperCase())}</div><div><div class="viz-drill-title-line"><strong>${escapeHtml(row.genre.genre || 'Unknown genre')}</strong></div><div class="viz-drill-meta">${escapeHtml(row.category)} · ${rating}${date} · ${row.songCount} song${row.songCount === 1 ? '' : 's'}</div>${favorite}</div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open</button></div></div>`; }).join('')}</div>` : '<div class="viz-empty">No genres found for this category in the current scope.</div>'}</div>`;
}

clearVisualDrilldown = function clearVisualDrilldownV39(rerender = true) {
  dgStatsSelectedCategoriesV38 = [];
  dgStatsCategoryDrilldownSelectionV38 = [];
  try { vizDrilldownState = null; } catch (_) {}
  if (rerender && typeof renderVisuals === 'function') renderVisuals();
};

renderVisualFilters = function renderVisualFiltersV39() {
  const mount = document.getElementById('vizFilterMount');
  if (!mount) return;
  const current = typeof vizFocusedGenre === 'function' ? vizFocusedGenre() : null;
  const candidates = typeof dgStatsGenreFocusCandidates === 'function' ? dgStatsGenreFocusCandidates() : [];
  const selected = dgStatsGetCategoryFocus();
  const currentLabel = current ? String(current.genre || '') : '';
  mount.innerHTML = `<div class="viz-filter-row dg-stats-filter-row-v39"><div class="viz-filter-control dg-stats-typeahead-wrap"><label for="vizGenreFocusTypeahead">Genre focus</label><div class="dg-stats-typeahead-line"><input id="vizGenreFocusTypeahead" class="dg-stats-typeahead" type="search" list="vizGenreFocusList" placeholder="Type a listened genre…" value="${escapeHtml(currentLabel)}" autocomplete="off" /><datalist id="vizGenreFocusList">${candidates.map((c) => `<option value="${escapeHtml(c.name)}"></option>`).join('')}</datalist><button type="button" class="btn btn-secondary btn-tiny dg-stats-focus-apply">Focus</button><button type="button" class="btn btn-ghost btn-tiny dg-stats-focus-clear">All</button></div><div class="small dg-stats-typeahead-hint">${current ? `Focused on ${escapeHtml(current.genre || 'this genre')}.` : selected.length ? 'Category filter is active from the pie chart. Select a genre to switch focus modes.' : 'All listened genres. Start typing to narrow, or click a category pie slice to filter every chart.'}</div></div><div class="viz-filter-control dg-stats-category-focus-wrap dg-stats-category-reactive-note"><label>Category filter</label><div class="dg-stats-category-chips">${selected.length ? selected.map((cat) => `<button type="button" class="dg-stats-category-chip" data-category="${escapeHtml(cat)}"><span>${escapeHtml(cat)}</span><b aria-hidden="true">×</b></button>`).join('') : '<span class="small">Click a Genre Categories pie slice to filter this whole dashboard.</span>'}</div><div class="small dg-stats-typeahead-hint">Cmd/Ctrl/Shift-click pie slices or legend rows to combine categories, e.g. Blues + Folk.</div></div><button type="button" class="btn btn-secondary btn-tiny dg-stats-clear-drilldown">Clear categories</button></div>`;

  const input = mount.querySelector('#vizGenreFocusTypeahead');
  const hint = mount.querySelector('.dg-stats-typeahead-hint');
  const applyGenre = () => {
    const raw = String(input?.value || '').trim();
    if (!raw) {
      try { vizFocusedGenreId = ''; } catch (_) {}
      dgStatsSetCategoryFocus([], { render: true });
      return;
    }
    const match = typeof dgStatsBestGenreFocusMatch === 'function' ? dgStatsBestGenreFocusMatch(raw) : null;
    if (match) {
      dgStatsSetCategoryFocus([], { render: false, clearDrilldown: true });
      try { vizFocusedGenreId = String(match.id || ''); } catch (_) {}
      try { vizDrilldownState = null; } catch (_) {}
      if (typeof renderVisuals === 'function') renderVisuals();
    } else if (hint) {
      hint.textContent = 'No listened genre match yet. Try a shorter name.';
      hint.classList.add('is-warning');
    }
  };
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); applyGenre(); }
    else if (event.key === 'Escape') { event.preventDefault(); try { vizFocusedGenreId = ''; } catch (_) {}; dgStatsSetCategoryFocus([], { render: true }); }
  });
  input?.addEventListener('input', () => {
    if (!hint) return;
    const q = dgStatsNormalizeSearch(input.value);
    hint.classList.remove('is-warning');
    if (!q) { hint.textContent = selected.length ? 'Category filter is active from the pie chart. Select a genre to switch focus modes.' : 'All listened genres. Start typing to narrow, or click a category pie slice to filter every chart.'; return; }
    const matches = candidates.filter((c) => c.search.includes(q)).slice(0, 3);
    hint.textContent = matches.length ? `Best matches: ${matches.map((m) => m.name).join(' · ')}` : 'No listened genre match yet.';
    if (!matches.length) hint.classList.add('is-warning');
  });
  mount.querySelector('.dg-stats-focus-apply')?.addEventListener('click', applyGenre);
  mount.querySelector('.dg-stats-focus-clear')?.addEventListener('click', () => {
    try { vizFocusedGenreId = ''; } catch (_) {}
    dgStatsSetCategoryFocus([], { render: true });
  });
  mount.querySelectorAll('.dg-stats-category-chip').forEach((chip) => {
    chip.addEventListener('click', () => dgStatsToggleCategoryFocus(chip.dataset.category || '', { render: true }));
  });
  mount.querySelector('.dg-stats-clear-drilldown')?.addEventListener('click', () => dgStatsSetCategoryFocus([], { render: true }));
};

function dgStatsGenreMatchesActiveCategory(genre) {
  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return true;
  if (!genre) return false;
  const selectedNorm = new Set(selected.map(dgStatsNormalizeSearch));
  return selectedNorm.has(dgStatsNormalizeSearch(dgStatsGenreCategory(genre)));
}

function dgStatsFilterMaintenanceRowsForActiveCategory(rows = []) {
  if (!dgStatsHasCategoryFocus()) return rows || [];
  return (rows || []).filter((row) => dgStatsGenreMatchesActiveCategory(row.genre || row.targetGenre || row.sourceGenre));
}

if (typeof maintenanceRowsForLabel === 'function') {
  const dgStatsPreviousMaintenanceRowsForLabelV39 = maintenanceRowsForLabel;
  maintenanceRowsForLabel = function maintenanceRowsForLabelV39(label) {
    return dgStatsFilterMaintenanceRowsForActiveCategory(dgStatsPreviousMaintenanceRowsForLabelV39(label));
  };
}

if (typeof maintenanceStats === 'function') {
  const dgStatsPreviousMaintenanceStatsV39 = maintenanceStats;
  maintenanceStats = function maintenanceStatsV39() {
    const stats = dgStatsPreviousMaintenanceStatsV39();
    if (!dgStatsHasCategoryFocus()) return stats;
    return {
      ...stats,
      pendingRows: dgStatsFilterMaintenanceRowsForActiveCategory(stats.pendingRows),
      missingMetadataRows: dgStatsFilterMaintenanceRowsForActiveCategory(stats.missingMetadataRows),
      unratedRows: dgStatsFilterMaintenanceRowsForActiveCategory(stats.unratedRows),
      drafts: (stats.drafts || []).filter((genre) => dgStatsGenreMatchesActiveCategory(genre)),
      duplicates: dgStatsFilterMaintenanceRowsForActiveCategory(stats.duplicates),
    };
  };
}

function dgStatsV39InstallStyles() {
  if (document.getElementById('dgStatsV39Styles')) return;
  const style = document.createElement('style');
  style.id = 'dgStatsV39Styles';
  style.textContent = `
    #screen-viz.dg-stats-v39 .dg-stats-filter-row-v39 { grid-template-columns:minmax(260px,1fr) minmax(260px,1fr) auto; align-items:start; gap:10px; }
    #screen-viz.dg-stats-v39 .dg-stats-category-reactive-note { min-width:0; }
    #screen-viz.dg-stats-v39 .dg-category-clickable-card .viz-card-label::after { content:" · click to filter"; color:var(--muted,#735a3c); font-size:.72rem; font-weight:800; letter-spacing:0; text-transform:none; }
    #screen-viz.dg-stats-v39 .dg-category-drill-panel { border-color:rgba(217,141,37,.42); }
    #screen-viz.dg-stats-v39 .dg-category-focus-banner .viz-focus-title::before { content:"🎛 "; }
    @media (max-width: 780px) { #screen-viz.dg-stats-v39 .dg-stats-filter-row-v39 { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}


window.DailyGenreStatsCategoryHotfix = {
  version: 'stats-category-v12-reactive-pie',
  getCategoryFocus: dgStatsGetCategoryFocus,
  setCategoryFocus: dgStatsSetCategoryFocus,
  categoryRows: dgStatsCategoryRows,
  currentCategoryControlItems: dgStatsCurrentCategoryControlItems,
};

/* === Stats polish v4.0: place reactive category drilldown under the pie chart ===
   Follow-up to v3.9: keep the category pie as the dashboard filter, but render
   the selected-category genre list directly inside the Genre Categories card so
   the drilldown feels attached to the chart. */
function dgStatsCategoryCanvasIdForModeV40(mode = null) {
  const nextMode = mode || (typeof vizMode === 'function' ? vizMode() : 'monthly');
  return nextMode === 'monthly' ? 'vizCatDonut' : 'vizCatDonutAll';
}

function dgStatsCategoryCardForModeV40(mode = null) {
  const canvas = document.getElementById(dgStatsCategoryCanvasIdForModeV40(mode));
  return canvas?.closest?.('.viz-card') || null;
}

function dgStatsEnsureCategoryInlineMountV40(mode = null) {
  const card = dgStatsCategoryCardForModeV40(mode);
  if (!card) return null;
  const nextMode = mode || (typeof vizMode === 'function' ? vizMode() : 'monthly');
  const id = nextMode === 'monthly' ? 'dgCategoryPieDrilldownMonthly' : 'dgCategoryPieDrilldownAll';
  let mount = document.getElementById(id);
  if (!mount) {
    mount = document.createElement('div');
    mount.id = id;
    mount.className = 'dg-category-pie-inline-drilldown';
    const anchor = card.querySelector('.viz-donut-wrap') || card.querySelector('canvas') || card.lastElementChild;
    if (anchor?.parentNode) anchor.parentNode.insertBefore(mount, anchor.nextSibling);
    else card.appendChild(mount);
  }
  card.classList.add('dg-category-pie-card-active');
  return mount;
}

function dgStatsClearCategoryInlineDrilldownsV40() {
  ['dgCategoryPieDrilldownMonthly', 'dgCategoryPieDrilldownAll'].forEach((id) => {
    const mount = document.getElementById(id);
    if (mount) mount.innerHTML = '';
  });
  document.querySelectorAll('#screen-viz .dg-category-pie-card-active').forEach((card) => {
    card.classList.remove('dg-category-pie-card-active');
  });
  const globalMount = document.getElementById('vizDrilldownPanel');
  if (globalMount && (typeof vizDrilldownState === 'undefined' || vizDrilldownState?.type === 'category')) {
    globalMount.innerHTML = '';
    globalMount.classList.remove('is-active', 'dg-stats-inspector', 'dg-category-drilldown');
  }
}

function dgStatsRenderReactiveCategoryDrilldownV40() {
  if (typeof clearVisualDrilldownMounts === 'function') clearVisualDrilldownMounts();
  dgStatsClearCategoryInlineDrilldownsV40();

  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return;

  const mode = typeof vizMode === 'function' ? vizMode() : 'monthly';
  const mount = dgStatsEnsureCategoryInlineMountV40(mode);
  if (!mount) return;

  const state = typeof vizDrilldownState !== 'undefined' && vizDrilldownState?.type === 'category'
    ? { ...vizDrilldownState, mode }
    : { type: 'category', value: selected, mode };
  const rows = dgStatsGenresForCategoryDrilldown(state);
  const modeLabel = state.mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All time';
  const totalSongs = rows.reduce((sum, row) => sum + row.songCount, 0);
  const categoryChips = selected.map((cat) => `<button type="button" class="dg-stats-category-chip is-drill" onclick="dgStatsToggleCategoryFocus('${visualActionArg(cat)}', { mode: '${state.mode || 'alltime'}' })"><span>${escapeHtml(cat)}</span><b aria-hidden="true">×</b></button>`).join('');

  mount.classList.add('is-active', 'dg-category-drilldown');
  mount.innerHTML = `<div class="dg-category-inline-panel"><div class="dg-category-inline-head"><div><div class="eyebrow" style="margin:0;">Active category filter · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(selected.join(' + '))}</strong><div class="small">All visible charts are scoped to this selection · ${rows.length} genre${rows.length === 1 ? '' : 's'} · ${totalSongs} logged song${totalSongs === 1 ? '' : 's'}</div></div><div class="dg-category-drill-actions"><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear categories</button></div></div><div class="viz-drill-context dg-category-inline-help"><span>Click another pie slice to replace</span><span>Cmd/Ctrl/Shift-click to combine categories</span><span>Click a chip to remove it</span></div><div class="dg-category-drill-chips">${categoryChips}</div>${rows.length ? `<div class="dg-category-genre-grid">${rows.map((row) => { const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${escapeHtml(row.rating)}★` : 'Unrated'; const date = row.date ? ` · ${escapeHtml(row.date)}` : ''; const favorite = row.favorite ? `<div class="viz-drill-meta">Favorite: ${escapeHtml(row.favorite)}</div>` : ''; return `<div class="viz-drill-row viz-record-row dg-category-genre-row"><div class="dg-category-genre-badge">${escapeHtml(row.category.slice(0, 2).toUpperCase())}</div><div><div class="viz-drill-title-line"><strong>${escapeHtml(row.genre.genre || 'Unknown genre')}</strong></div><div class="viz-drill-meta">${escapeHtml(row.category)} · ${rating}${date} · ${row.songCount} song${row.songCount === 1 ? '' : 's'}</div>${favorite}</div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open</button></div></div>`; }).join('')}</div>` : '<div class="viz-empty">No genres found for this category in the current scope.</div>'}</div>`;
}

// Override the v3.9 renderer so category selections stay attached to the pie
// chart instead of using the page-level drilldown well above the dashboard.
dgStatsSetCategoryDrilldown = function dgStatsSetCategoryDrilldownV40(category, mode = 'alltime', event = null) {
  const rawLabel = String(category || '').trim();
  let label = rawLabel;
  try { label = decodeURIComponent(rawLabel); } catch (_) {}
  label = String(label || '').trim();
  if (!label) return;

  const current = dgStatsGetCategoryFocus();
  const norm = dgStatsNormalizeSearch(label);
  const modifier = dgStatsCategoryEventHasModifier(event);
  let next;

  if (modifier) {
    const exists = current.some((cat) => dgStatsNormalizeSearch(cat) === norm);
    next = exists
      ? current.filter((cat) => dgStatsNormalizeSearch(cat) !== norm)
      : [...current, label];
  } else {
    const alreadyOnly = current.length === 1 && dgStatsNormalizeSearch(current[0]) === norm;
    next = alreadyOnly ? [] : [label];
  }

  dgStatsCommitCategorySelection(next, { mode: mode || (typeof vizMode === 'function' ? vizMode() : 'alltime') });
  if (next.length) {
    setTimeout(() => {
      dgStatsEnsureCategoryInlineMountV40(typeof vizMode === 'function' ? vizMode() : mode)
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }
};

function dgStatsV40InstallStyles() {
  if (document.getElementById('dgStatsV40Styles')) return;
  const style = document.createElement('style');
  style.id = 'dgStatsV40Styles';
  style.textContent = `
    #screen-viz.dg-stats-v40 .dg-category-pie-card-active {
      grid-column: 1 / -1 !important;
    }
    #screen-viz.dg-stats-v40 .dg-category-pie-card-active .viz-donut-wrap {
      max-width: min(980px, 100%);
    }
    #screen-viz.dg-stats-v40 .dg-category-pie-inline-drilldown {
      margin-top: 14px;
      width: 100%;
    }
    #screen-viz.dg-stats-v40 .dg-category-inline-panel {
      border: 1px solid rgba(120, 74, 27, 0.18);
      border-radius: 18px;
      background: rgba(255, 252, 241, 0.54);
      padding: 13px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.36);
    }
    #screen-viz.dg-stats-v40 .dg-category-inline-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    #screen-viz.dg-stats-v40 .dg-category-inline-head strong {
      display: block;
      margin-top: 2px;
      font-size: clamp(1.1rem, 2vw, 1.55rem);
      letter-spacing: -0.045em;
      line-height: 1.05;
    }
    #screen-viz.dg-stats-v40 .dg-category-inline-help {
      margin: 8px 0 9px;
    }
    #screen-viz.dg-stats-v40 .dg-category-genre-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    #screen-viz.dg-stats-v40 .dg-category-genre-grid .dg-category-genre-row {
      display: grid !important;
      grid-template-columns: 44px minmax(0, 1fr) auto !important;
      align-items: center;
      gap: 10px;
      margin: 0 !important;
      min-width: 0;
      background: rgba(255, 255, 255, 0.5);
    }
    #screen-viz.dg-stats-v40 .dg-category-genre-grid .viz-drill-title-line,
    #screen-viz.dg-stats-v40 .dg-category-genre-grid .viz-drill-meta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media (max-width: 760px) {
      #screen-viz.dg-stats-v40 .dg-category-inline-head { display: grid; }
      #screen-viz.dg-stats-v40 .dg-category-genre-grid { grid-template-columns: 1fr; }
      #screen-viz.dg-stats-v40 .dg-category-genre-grid .dg-category-genre-row { grid-template-columns: 38px minmax(0,1fr) !important; }
      #screen-viz.dg-stats-v40 .dg-category-genre-grid .viz-drill-actions { grid-column: 1 / -1; justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}


window.DailyGenreStatsCategoryHotfix = {
  ...(window.DailyGenreStatsCategoryHotfix || {}),
  version: 'stats-category-v13-inline-pie-drilldown',
  renderInlineCategoryDrilldown: dgStatsRenderReactiveCategoryDrilldownV40,
};

/* === Stats polish v4.1: cleaner category panel, category-tinted cards, export totals === */
function dgStatsCategoryStyleVarsV41(category) {
  const color = typeof dgStatsCategoryColor === 'function'
    ? dgStatsCategoryColor(category, 0.92)
    : 'rgba(141, 92, 37, 0.92)';
  const soft = typeof dgStatsCategoryColor === 'function'
    ? dgStatsCategoryColor(category, 0.14)
    : 'rgba(141, 92, 37, 0.14)';
  const mid = typeof dgStatsCategoryColor === 'function'
    ? dgStatsCategoryColor(category, 0.26)
    : 'rgba(141, 92, 37, 0.26)';
  return `--dg-category-card-color:${color};--dg-category-card-soft:${soft};--dg-category-card-mid:${mid};`;
}

function dgStatsCategoryChipV41(category) {
  return `<button type="button" class="dg-stats-category-chip is-drill dg-category-colored-chip" style="${dgStatsCategoryStyleVarsV41(category)}" onclick="dgStatsToggleCategoryFocus('${visualActionArg(category)}', { mode: '${typeof vizMode === 'function' ? vizMode() : 'alltime'}' })"><span>${escapeHtml(category)}</span><b aria-hidden="true">×</b></button>`;
}

function dgStatsCategoryCardHtmlV41(row) {
  const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${escapeHtml(row.rating)}★` : 'Unrated';
  const date = row.date ? ` · ${escapeHtml(row.date)}` : '';
  const favorite = row.favorite ? `<div class="viz-drill-meta">Favorite: ${escapeHtml(row.favorite)}</div>` : '';
  return `<div class="viz-drill-row viz-record-row dg-category-genre-row dg-category-colored-row" style="${dgStatsCategoryStyleVarsV41(row.category)}"><div class="dg-category-genre-badge">${escapeHtml(row.category.slice(0, 2).toUpperCase())}</div><div><div class="viz-drill-title-line"><strong>${escapeHtml(row.genre.genre || 'Unknown genre')}</strong></div><div class="viz-drill-meta">${escapeHtml(row.category)} · ${rating}${date} · ${row.songCount} song${row.songCount === 1 ? '' : 's'}</div>${favorite}</div><div class="viz-drill-actions"><button type="button" onclick="vizOpenGenreEncoded('${visualActionArg(row.genre.genre || '')}')">Open</button></div></div>`;
}

function dgStatsCopyScopeTotalsV41() {
  const selected = typeof dgStatsGetCategoryFocus === 'function' ? dgStatsGetCategoryFocus() : [];
  if (!selected.length) return '';
  const selectedNorm = new Set(selected.map(dgStatsNormalizeSearch));
  const mode = typeof vizMode === 'function' ? vizMode() : 'monthly';
  const base = mode === 'monthly'
    ? (typeof vizBaseGenres === 'function' ? vizBaseGenres() : [])
    : (typeof allListenedGenresForMaintenance === 'function' ? allListenedGenresForMaintenance() : []);
  const rows = (base || []).filter((genre) => selectedNorm.has(dgStatsNormalizeSearch(dgStatsGenreCategory(genre))));
  const songs = typeof vizAllOfficialSongs === 'function' ? vizAllOfficialSongs(rows) : [];
  return `${rows.length} genre${rows.length === 1 ? '' : 's'} · ${songs.length} logged song${songs.length === 1 ? '' : 's'}`;
}

// Replace the v4.0 inline renderer: same reactive behavior, less instruction chrome,
// and cards/chips lightly inherit the parent-category color.
dgStatsRenderReactiveCategoryDrilldownV40 = function dgStatsRenderReactiveCategoryDrilldownV41() {
  if (typeof clearVisualDrilldownMounts === 'function') clearVisualDrilldownMounts();
  dgStatsClearCategoryInlineDrilldownsV40();

  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return;

  const mode = typeof vizMode === 'function' ? vizMode() : 'monthly';
  const mount = dgStatsEnsureCategoryInlineMountV40(mode);
  if (!mount) return;

  const state = typeof vizDrilldownState !== 'undefined' && vizDrilldownState?.type === 'category'
    ? { ...vizDrilldownState, mode }
    : { type: 'category', value: selected, mode };
  const rows = dgStatsGenresForCategoryDrilldown(state);
  const modeLabel = state.mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All time';
  const totalSongs = rows.reduce((sum, row) => sum + row.songCount, 0);
  const categoryChips = selected.map((cat) => dgStatsCategoryChipV41(cat)).join('');

  mount.classList.add('is-active', 'dg-category-drilldown');
  mount.innerHTML = `<div class="dg-category-inline-panel dg-category-inline-panel-v41"><div class="dg-category-inline-head"><div><div class="eyebrow" style="margin:0;">Active category filter · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(selected.join(' + '))}</strong><div class="small">All visible charts are scoped to this selection · ${rows.length} genre${rows.length === 1 ? '' : 's'} · ${totalSongs} logged song${totalSongs === 1 ? '' : 's'}</div></div><div class="dg-category-drill-actions"><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear categories</button></div></div><div class="dg-category-drill-chips">${categoryChips}</div>${rows.length ? `<div class="dg-category-genre-grid">${rows.map(dgStatsCategoryCardHtmlV41).join('')}</div>` : '<div class="viz-empty">No genres found for this category in the current scope.</div>'}</div>`;
};

// Legend-aware copy/export with an extra selection-total line when the pie/chart is scoped
// to one or more parent categories.
dgStatsCopyCanvasVisual = async function dgStatsCopyCanvasVisualV41(canvas, label = 'Daily Genre chart') {
  if (!canvas) return;
  const allEntries = dgStatsChartEntries(canvas);
  const entries = allEntries.slice(0, 18);
  const extraCount = Math.max(0, allEntries.length - entries.length);
  const categoryFocus = typeof dgStatsGetCategoryFocus === 'function' ? dgStatsGetCategoryFocus() : [];
  const totalsLine = dgStatsCopyScopeTotalsV41();
  const out = document.createElement('canvas');
  const scale = 2;
  const w = 1080;
  const h = entries.length ? (totalsLine ? 805 : 760) : (totalsLine ? 665 : 620);
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#fff5d7');
  grad.addColorStop(1, '#e5c48d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a170d';
  ctx.font = '900 30px Inter, Arial, sans-serif';
  ctx.fillText(label, 34, 52);
  ctx.fillStyle = 'rgba(42, 23, 13, 0.62)';
  ctx.font = '700 16px Inter, Arial, sans-serif';
  const modeLabel = typeof vizMode === 'function' && vizMode() === 'monthly'
    ? (typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : 'Monthly')
    : 'All Time';
  const scopeLine = categoryFocus.length ? `${modeLabel} · ${categoryFocus.join(' + ')}` : modeLabel;
  ctx.fillText(scopeLine, 34, 78);
  const offsetY = totalsLine ? 34 : 0;
  if (totalsLine) {
    ctx.fillStyle = 'rgba(42, 23, 13, 0.76)';
    ctx.font = '900 16px Inter, Arial, sans-serif';
    ctx.fillText(`Selection total · ${totalsLine}`, 34, 104);
  }

  const chartX = 46;
  const chartY = 102 + offsetY;
  const chartW = entries.length ? 610 : 960;
  const chartH = entries.length ? 560 : 430;
  const sourceW = canvas.width || canvas.clientWidth || 600;
  const sourceH = canvas.height || canvas.clientHeight || 360;
  const ratio = Math.min(chartW / sourceW, chartH / sourceH);
  const drawW = sourceW * ratio;
  const drawH = sourceH * ratio;
  ctx.drawImage(canvas, chartX + (chartW - drawW) / 2, chartY + (chartH - drawH) / 2, drawW, drawH);

  if (entries.length) {
    const legendX = 700;
    let y = 116 + offsetY;
    ctx.fillStyle = '#2a170d';
    ctx.font = '900 19px Inter, Arial, sans-serif';
    ctx.fillText('Legend', legendX, y);
    y += 30;
    ctx.font = '700 15px Inter, Arial, sans-serif';
    entries.forEach((entry) => {
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      ctx.arc(legendX + 9, y - 5, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a170d';
      const suffix = Number.isFinite(entry.value) ? ` (${entry.value})` : '';
      dgStatsWrapText(ctx, `${entry.label}${suffix}`, legendX + 28, y, 330, 18, 2);
      y += 38;
    });
    if (extraCount) {
      ctx.fillStyle = 'rgba(42, 23, 13, 0.58)';
      ctx.fillText(`+ ${extraCount} more`, legendX + 28, y);
    }
  }

  ctx.fillStyle = 'rgba(42, 23, 13, 0.62)';
  ctx.font = '700 16px Inter, Arial, sans-serif';
  ctx.fillText('Daily Genre', 34, h - 26);
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showSaveToast?.('Chart copied as image with legend and selection totals.', false);
      return;
    }
    throw new Error('Clipboard image unsupported');
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dailygenre-chart'}-with-legend.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showSaveToast?.('Chart downloaded as PNG with legend and selection totals.', false);
  }
};

function dgStatsV41InstallStyles() {
  if (document.getElementById('dgStatsV41Styles')) return;
  const style = document.createElement('style');
  style.id = 'dgStatsV41Styles';
  style.textContent = `
    #screen-viz.dg-stats-v41 .dg-category-inline-help { display:none !important; }
    #screen-viz.dg-stats-v41 .dg-category-inline-panel-v41 .dg-category-drill-chips { margin: 10px 0 8px; }
    #screen-viz.dg-stats-v41 .dg-category-colored-chip {
      background: linear-gradient(180deg, rgba(255,255,255,.72), var(--dg-category-card-soft));
      border-color: var(--dg-category-card-mid) !important;
      box-shadow: inset 3px 0 0 var(--dg-category-card-color);
    }
    #screen-viz.dg-stats-v41 .dg-category-colored-row {
      background: linear-gradient(90deg, var(--dg-category-card-soft), rgba(255,255,255,.54) 46%, rgba(255,255,255,.46)) !important;
      border-color: var(--dg-category-card-mid) !important;
      box-shadow: inset 5px 0 0 var(--dg-category-card-color), inset 0 1px 0 rgba(255,255,255,.42) !important;
    }
    #screen-viz.dg-stats-v41 .dg-category-colored-row .dg-category-genre-badge {
      background: var(--dg-category-card-color) !important;
      color: #fff8e6 !important;
      border: 1px solid rgba(255,255,255,.38);
      box-shadow: 0 5px 13px var(--dg-category-card-soft);
    }
  `;
  document.head.appendChild(style);
}


window.DailyGenreStatsCategoryHotfix = {
  ...(window.DailyGenreStatsCategoryHotfix || {}),
  version: 'stats-category-v14-cards-export-polish',
  renderInlineCategoryDrilldown: dgStatsRenderReactiveCategoryDrilldownV40,
};


/* === Stats polish v4.2: Discord-ready category detail image + cleaner cards ===
   Follow-up to v4.1: the inline category cards are now themselves clickable,
   and the active category detail block can be copied/downloaded as a simplified
   Discord-friendly image. */
function dgStatsOpenCategoryCardV42(encodedGenre) {
  let genre = String(encodedGenre || '');
  try { genre = decodeURIComponent(genre); } catch (_) {}
  if (genre && typeof vizOpenGenreEncoded === 'function') {
    vizOpenGenreEncoded(visualActionArg(genre));
  }
}

function dgStatsCategoryCardHtmlV42(row) {
  const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${escapeHtml(row.rating)}★` : 'Unrated';
  const date = row.date ? ` · ${escapeHtml(row.date)}` : '';
  const favorite = row.favorite ? `<div class="viz-drill-meta">Favorite: ${escapeHtml(row.favorite)}</div>` : '';
  const genreName = row.genre?.genre || 'Unknown genre';
  const encoded = visualActionArg(genreName);
  return `<button type="button" class="viz-drill-row viz-record-row dg-category-genre-row dg-category-colored-row dg-category-open-card" style="${dgStatsCategoryStyleVarsV41(row.category)}" onclick="dgStatsOpenCategoryCardV42('${encoded}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();dgStatsOpenCategoryCardV42('${encoded}');}" aria-label="Open ${escapeHtml(genreName)}"><div class="dg-category-genre-badge">${escapeHtml(row.category.slice(0, 2).toUpperCase())}</div><div><div class="viz-drill-title-line"><strong>${escapeHtml(genreName)}</strong></div><div class="viz-drill-meta">${escapeHtml(row.category)} · ${rating}${date} · ${row.songCount} song${row.songCount === 1 ? '' : 's'}</div>${favorite}</div></button>`;
}

function dgStatsCategoryCopyRowsV42() {
  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return { selected: [], rows: [], totalSongs: 0, modeLabel: 'All Time' };
  const mode = typeof vizMode === 'function' ? vizMode() : 'monthly';
  const state = typeof vizDrilldownState !== 'undefined' && vizDrilldownState?.type === 'category'
    ? { ...vizDrilldownState, mode }
    : { type: 'category', value: selected, mode };
  const rows = typeof dgStatsGenresForCategoryDrilldown === 'function'
    ? dgStatsGenresForCategoryDrilldown(state)
    : [];
  const modeLabel = mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All Time';
  const totalSongs = rows.reduce((sum, row) => sum + Number(row.songCount || 0), 0);
  return { selected, rows, totalSongs, modeLabel };
}

function dgStatsCanvasRoundRectV42(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function dgStatsCanvasWrapLinesV42(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    let last = clipped[clipped.length - 1] || '';
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    clipped[clipped.length - 1] = `${last}…`;
    return clipped;
  }
  return lines;
}

async function dgStatsCopyCategoryDetailsImageV42() {
  const { selected, rows, totalSongs, modeLabel } = dgStatsCategoryCopyRowsV42();
  if (!selected.length) {
    showSaveToast?.('Select one or more category slices first.', true);
    return;
  }
  const maxCards = 24;
  const visibleRows = rows.slice(0, maxCards);
  const moreCount = Math.max(0, rows.length - visibleRows.length);
  const scale = 2;
  const w = 1200;
  const columns = 2;
  const gap = 18;
  const margin = 42;
  const cardW = (w - margin * 2 - gap) / columns;
  const cardH = 118;
  const gridRows = Math.ceil(visibleRows.length / columns);
  const h = Math.max(520, 218 + gridRows * (cardH + gap) + (moreCount ? 54 : 0) + 46);
  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#fff7de');
  grad.addColorStop(1, '#e7c88f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#2a170d';
  ctx.font = '950 34px Inter, Arial, sans-serif';
  ctx.fillText('Active Category Filter', margin, 58);
  ctx.font = '950 44px Inter, Arial, sans-serif';
  dgStatsCanvasWrapLinesV42(ctx, selected.join(' + '), w - margin * 2, 2).forEach((line, idx) => {
    ctx.fillText(line, margin, 108 + idx * 46);
  });
  const headerOffset = selected.join(' + ').length > 42 ? 44 : 0;
  ctx.fillStyle = 'rgba(42,23,13,.70)';
  ctx.font = '800 21px Inter, Arial, sans-serif';
  ctx.fillText(`${modeLabel} · ${rows.length} genres · ${totalSongs} logged songs`, margin, 142 + headerOffset);

  let chipX = margin;
  let chipY = 170 + headerOffset;
  selected.forEach((cat) => {
    const color = dgStatsCategoryColor(cat, .95);
    const label = String(cat);
    ctx.font = '900 17px Inter, Arial, sans-serif';
    const chipW = Math.min(250, ctx.measureText(label).width + 34);
    if (chipX + chipW > w - margin) { chipX = margin; chipY += 36; }
    ctx.fillStyle = dgStatsCategoryColor(cat, .18);
    dgStatsCanvasRoundRectV42(ctx, chipX, chipY, chipW, 28, 14);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2a170d';
    ctx.fillText(label, chipX + 14, chipY + 20);
    chipX += chipW + 10;
  });

  let startY = chipY + 58;
  visibleRows.forEach((row, index) => {
    const col = index % columns;
    const gridRow = Math.floor(index / columns);
    const x = margin + col * (cardW + gap);
    const y = startY + gridRow * (cardH + gap);
    const color = dgStatsCategoryColor(row.category, .92);
    ctx.fillStyle = dgStatsCategoryColor(row.category, .13);
    dgStatsCanvasRoundRectV42(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.strokeStyle = dgStatsCategoryColor(row.category, .45);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    dgStatsCanvasRoundRectV42(ctx, x, y, 8, cardH, 4);
    ctx.fill();
    ctx.fillStyle = color;
    dgStatsCanvasRoundRectV42(ctx, x + 22, y + 26, 54, 54, 14);
    ctx.fill();
    ctx.fillStyle = '#fff8e6';
    ctx.font = '950 16px Inter, Arial, sans-serif';
    ctx.fillText(String(row.category || '').slice(0, 2).toUpperCase(), x + 36, y + 60);

    ctx.fillStyle = '#2a170d';
    ctx.font = '950 24px Inter, Arial, sans-serif';
    const titleLines = dgStatsCanvasWrapLinesV42(ctx, row.genre?.genre || 'Unknown genre', cardW - 122, 2);
    titleLines.forEach((line, idx) => ctx.fillText(line, x + 96, y + 38 + idx * 25));
    const rating = row.rating === 'zanger' ? 'Zanger' : row.rating ? `${row.rating}★` : 'Unrated';
    const date = row.date ? ` · ${row.date}` : '';
    ctx.fillStyle = 'rgba(42,23,13,.70)';
    ctx.font = '850 16px Inter, Arial, sans-serif';
    ctx.fillText(`${row.category} · ${rating}${date} · ${row.songCount} songs`, x + 96, y + 94);
  });

  if (moreCount) {
    ctx.fillStyle = 'rgba(42,23,13,.62)';
    ctx.font = '900 18px Inter, Arial, sans-serif';
    ctx.fillText(`+ ${moreCount} more genres in this selection`, margin, startY + gridRows * (cardH + gap) + 18);
  }

  ctx.fillStyle = 'rgba(42,23,13,.62)';
  ctx.font = '800 17px Inter, Arial, sans-serif';
  ctx.fillText('Daily Genre', margin, h - 24);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showSaveToast?.('Category details copied as Discord image.', false);
      return;
    }
    throw new Error('Clipboard image unsupported');
  } catch (_) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dailygenre-category-filter-${selected.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'details'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showSaveToast?.('Category details downloaded as PNG.', false);
  }
}

// Replace the v4.1 inline renderer: cards are the open target, and a Discord
// image copy action lives beside Clear categories.
dgStatsRenderReactiveCategoryDrilldownV40 = function dgStatsRenderReactiveCategoryDrilldownV42() {
  if (typeof clearVisualDrilldownMounts === 'function') clearVisualDrilldownMounts();
  dgStatsClearCategoryInlineDrilldownsV40();

  const selected = dgStatsGetCategoryFocus();
  if (!selected.length) return;

  const mode = typeof vizMode === 'function' ? vizMode() : 'monthly';
  const mount = dgStatsEnsureCategoryInlineMountV40(mode);
  if (!mount) return;

  const state = typeof vizDrilldownState !== 'undefined' && vizDrilldownState?.type === 'category'
    ? { ...vizDrilldownState, mode }
    : { type: 'category', value: selected, mode };
  const rows = dgStatsGenresForCategoryDrilldown(state);
  const modeLabel = state.mode === 'monthly'
    ? `Monthly · ${typeof vizMonthTitle === 'function' ? vizMonthTitle(vizSelectedMonth()) : ''}`
    : 'All time';
  const totalSongs = rows.reduce((sum, row) => sum + row.songCount, 0);
  const categoryChips = selected.map((cat) => dgStatsCategoryChipV41(cat)).join('');

  mount.classList.add('is-active', 'dg-category-drilldown');
  mount.innerHTML = `<div class="dg-category-inline-panel dg-category-inline-panel-v41 dg-category-inline-panel-v42"><div class="dg-category-inline-head"><div><div class="eyebrow" style="margin:0;">Active category filter · ${escapeHtml(modeLabel)}</div><strong>${escapeHtml(selected.join(' + '))}</strong><div class="small">All visible charts are scoped to this selection · ${rows.length} genre${rows.length === 1 ? '' : 's'} · ${totalSongs} logged song${totalSongs === 1 ? '' : 's'}</div></div><div class="dg-category-drill-actions"><button type="button" class="btn btn-primary btn-tiny" onclick="dgStatsCopyCategoryDetailsImageV42()">Copy Discord image</button><button type="button" class="btn btn-secondary btn-tiny" onclick="dgStatsSetCategoryFocus([])">Clear categories</button></div></div><div class="dg-category-drill-chips">${categoryChips}</div>${rows.length ? `<div class="dg-category-genre-grid">${rows.map(dgStatsCategoryCardHtmlV42).join('')}</div>` : '<div class="viz-empty">No genres found for this category in the current scope.</div>'}</div>`;
};

function dgStatsV42InstallStyles() {
  if (document.getElementById('dgStatsV42Styles')) return;
  const style = document.createElement('style');
  style.id = 'dgStatsV42Styles';
  style.textContent = `
    #screen-viz.dg-stats-v42 .dg-category-open-card {
      width: 100%;
      border: 1px solid var(--dg-category-card-mid) !important;
      text-align: left;
      cursor: pointer;
      color: var(--text, #22160d);
      font: inherit;
      min-height: 92px;
    }
    #screen-viz.dg-stats-v42 .dg-category-open-card:hover,
    #screen-viz.dg-stats-v42 .dg-category-open-card:focus-visible {
      transform: translateY(-1px);
      outline: none;
      box-shadow: inset 5px 0 0 var(--dg-category-card-color), 0 14px 28px rgba(38,22,10,.12) !important;
    }
    #screen-viz.dg-stats-v42 .dg-category-inline-panel-v42 .dg-category-drill-actions {
      align-items: center;
    }
    @media (max-width: 720px) {
      #screen-viz.dg-stats-v42 .dg-category-inline-panel-v42 .dg-category-drill-actions { justify-content: flex-start; }
    }
  `;
  document.head.appendChild(style);
}



/* === Stats polish v4.3: consolidated final pipeline ===
   Preserve the current V42 UI while avoiding chained runtime overrides. */
function installStatsStyles() {
  dgStatsV38InstallStyles();
  dgStatsV39InstallStyles();
  dgStatsV40InstallStyles();
  dgStatsV41InstallStyles();
  dgStatsV42InstallStyles();
}

function applyFinalStatsVersionClasses() {
  document
    .getElementById("screen-viz")
    ?.classList.add(
      "dg-stats-v37",
      "dg-stats-v38",
      "dg-stats-v39",
      "dg-stats-v40",
      "dg-stats-v41",
      "dg-stats-v42",
    );
}

function statsPolishApply() {
  applyBaseStatsPolish();
  dgStatsV36Apply();
  installStatsStyles();
  applyFinalStatsVersionClasses();
}

function renderVisualDrilldown() {
  const selected =
    typeof dgStatsGetCategoryFocus === "function"
      ? dgStatsGetCategoryFocus()
      : [];
  const state =
    typeof vizDrilldownState !== "undefined" ? vizDrilldownState : null;

  if (selected.length || state?.type === "category") {
    dgStatsRenderReactiveCategoryDrilldownV40();
    return;
  }

  dgStatsClearCategoryInlineDrilldownsV40();
  renderBaseVisualDrilldown();
}

window.DailyGenreStatsCategoryHotfix = {
  ...(window.DailyGenreStatsCategoryHotfix || {}),
  version: 'stats-category-v15-discord-detail-copy',
  copyCategoryDetailsImage: dgStatsCopyCategoryDetailsImageV42,
  renderInlineCategoryDrilldown: dgStatsRenderReactiveCategoryDrilldownV40,
};
