/* Daily Genre - Discovery Console v1
   A product-architecture layer for the genre page. Loaded after app.js, songs.js, and album-dive.js.
   Goal: music first, context second, studio/admin third. */
(() => {
  const DC = {
    installed: false,
    lastGenreId: null,
    crateDigIntent: false,
  };

  function h(value) {
    return typeof escapeHtml === "function"
      ? escapeHtml(value == null ? "" : String(value))
      : String(value == null ? "" : value);
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[\-_–—/]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function currentGenreId() {
    try {
      return String(currentGenre?.id ?? currentGenre?.genre ?? "");
    } catch {
      return "";
    }
  }

  function listenScreenActive() {
    const screen = document.getElementById("screen-listen");
    return !!(screen && screen.classList.contains("active"));
  }

  function showDcToast(message) {
    try {
      if (typeof showSaveToast === "function") {
        showSaveToast(message, false);
        return;
      }
    } catch {}
    let toast = document.querySelector(".dc-copy-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "dc-copy-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function buildFullCurrentGenreDiscordText() {
    try {
      if (typeof window.buildDiscordBlock === "function") {
        const text = window.buildDiscordBlock();
        if (String(text || "").trim()) return String(text).trim();
      }
    } catch {}
    try {
      if (typeof buildSpinDiscordText === "function" && currentGenre) {
        const text = buildSpinDiscordText(currentGenre);
        if (String(text || "").trim()) return String(text).trim();
      }
    } catch {}
    return `Today's Genre is..... ${currentGenre?.genre || ""}`.trim();
  }

  async function copyCurrentGenreDiscord(button) {
    if (!currentGenre) return;
    const text = buildFullCurrentGenreDiscordText();
    try {
      if (button) button.classList.add("copied");
      await navigator.clipboard.writeText(text);
      showDcToast("Full Discord genre details copied");
      setTimeout(() => button?.classList.remove("copied"), 900);
    } catch {
      alert(text);
    }
  }

  function openStudioMode() {
    try {
      // Prefer the app's own route into edit/build mode. This is more reliable
      // than toggling the hidden editor after the discovery-console DOM has
      // already been rearranged.
      if (currentGenre && typeof openGenreDetail === "function") {
        openGenreDetail(currentGenre, true, {
          preserveDirty: true,
          skipSpotifyHydration: true,
        });
      } else if (typeof toggleDetailEditMode === "function") {
        toggleDetailEditMode();
      } else if (typeof applyDetailEditMode === "function") {
        window.detailEditMode = true;
        applyDetailEditMode(true);
      }
    } catch (error) {
      console.warn(
        "[Daily Genre] Could not open Studio mode via detail route.",
        error,
      );
      try {
        if (typeof switchScreen === "function") switchScreen("review");
      } catch {}
    }

    setTimeout(() => {
      const panel = document.getElementById("listenEditPanel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      const first =
        document.getElementById("songsListenedBulk") ||
        panel?.querySelector("input,textarea,button");
      first?.focus?.({ preventScroll: true });
    }, 120);
  }

  if (typeof window !== "undefined") window.openStudioMode = openStudioMode;

  function openHeroMoreMenu(menu) {
    if (!menu) return;
    const currentlyOpen = menu.hasAttribute("open");
    document.querySelectorAll(".dc-overflow-menu[open]").forEach((other) => {
      if (other !== menu) other.removeAttribute("open");
    });
    if (!currentlyOpen) menu.setAttribute("open", "");
  }

  function inBuildMode() {
    try {
      return (
        typeof detailExperienceMode !== "undefined" &&
        detailExperienceMode === "build"
      );
    } catch {
      return false;
    }
  }

  function activeSongs(genre) {
    try {
      const raw =
        typeof inflateSongsFromStorage === "function"
          ? inflateSongsFromStorage(genre?.songs_listened || [])
          : genre?.songs_listened || [];
      const out = [];
      (raw || []).forEach((song) => {
        if (!song || song.isPending) return;
        out.push(song);
        if (song.levelUp) out.push(song.levelUp);
      });
      return out;
    } catch {
      return genre?.songs_listened || [];
    }
  }

  function albumSlots(genre) {
    const dive = genre?.albumDive || genre?.album_dive || null;
    const slots = dive?.slots || dive?.albums || [];
    return Array.isArray(slots) ? slots : [];
  }

  function slotHasContent(slot) {
    return !!(
      slot &&
      (slot.album ||
        slot.artist ||
        slot.spotifyAlbumUrl ||
        slot.spotifyUrl ||
        slot.albumArt ||
        slot.manualAlbumArt)
    );
  }

  function pendingCount(genre) {
    try {
      return typeof getPendingSongs === "function"
        ? (getPendingSongs(genre) || []).length
        : (genre?.pending_songs || []).length;
    } catch {
      return (genre?.pending_songs || []).length;
    }
  }

  function reactionCount(genre, value) {
    try {
      const songs = activeSongs(genre);
      return songs.filter((song) => Number(song?.reaction) === value).length;
    } catch {
      return 0;
    }
  }

  function isFavoriteSong(song) {
    try {
      return typeof isSameFavoriteSong === "function"
        ? isSameFavoriteSong(currentGenre, song)
        : false;
    } catch {
      return false;
    }
  }

  function renderConsoleProgress(genre) {
    const songs = activeSongs(genre);
    const reacted = songs.filter((song) => song?.reaction).length;
    const favorites = songs.filter(isFavoriteSong).length;
    const slots = albumSlots(genre).filter(slotHasContent);
    const finishedAlbums = slots.filter(
      (slot) =>
        slot.listenState === "finished" || slot.finished || slot.completed,
    ).length;
    const ratedAlbums = slots.filter(
      (slot) => Number(slot.rating || slot.albumRating || 0) > 0,
    ).length;
    const pending = pendingCount(genre);
    return `<div class="dc-progress-strip" data-dc-progress-strip>
      <span><strong>Songs</strong> ${reacted}/${songs.length || 0}</span>
      <span><strong>Favorites</strong> ${favorites}</span>
      <span><strong>Albums</strong> ${finishedAlbums}/${slots.length || 0}</span>
      <span><strong>Album ratings</strong> ${ratedAlbums}/${slots.length || 0}</span>
      ${pending ? `<span class="warn"><strong>Review</strong> ${pending}</span>` : ""}
    </div>`;
  }

  function installSearchNormalization() {
    if (window.__dailyGenreDiscoverySearchInstalled) return;
    window.__dailyGenreDiscoverySearchInstalled = true;

    function genreHaystack(genre) {
      let cat = "";
      try {
        cat = typeof categoryLine === "function" ? categoryLine(genre) : "";
      } catch {}
      return normalizeText(
        [
          genre?.genre,
          cat,
          genre?.subcategory,
          genre?.subsubcategory,
          genre?.summary,
          genre?.key_artists,
          genre?.suggested_songs,
        ].join(" "),
      );
    }

    window.dailyGenreSearchMatches = function dailyGenreSearchMatches(
      genre,
      query,
    ) {
      const q = normalizeText(query);
      if (!q) return true;
      const haystack = genreHaystack(genre);
      if (haystack.includes(q)) return true;
      const qCompact = q.replace(/\s+/g, "");
      const hCompact = haystack.replace(/\s+/g, "");
      return !!qCompact && hCompact.includes(qCompact);
    };

    const originalFilterGenres =
      typeof filterGenresForArchive === "function"
        ? filterGenresForArchive
        : null;
    if (originalFilterGenres && !window.__dailyGenreDiscoveryFilterWrapped) {
      window.__dailyGenreDiscoveryFilterWrapped = true;
      filterGenresForArchive = function patchedFilterGenresForArchive(...args) {
        const result = originalFilterGenres.apply(this, args);
        const searchEl =
          document.getElementById("historySearch") ||
          document.getElementById("archiveSearch") ||
          document.querySelector("[data-archive-search]");
        const query = searchEl?.value || "";
        if (!query || !Array.isArray(result)) return result;
        return result.filter((genre) =>
          window.dailyGenreSearchMatches(genre, query),
        );
      };
    }
  }

  function relabelGlobalNav() {
    const labels = {
      Archive: "Library",
      "Crate Dig": "Dig",
      Visuals: "Stats",
      Review: "Studio",
      Ranking: "Ranks",
    };
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      const raw = (btn.textContent || "").trim();
      if (labels[raw] && btn.dataset.dcRelabeled !== "1") {
        btn.dataset.dcOriginalLabel = raw;
        btn.textContent = labels[raw];
        btn.dataset.dcRelabeled = "1";
      }
    });
  }

  function simplifyHero(record) {
    if (!record || record.dataset.dcHero === "1") return;
    record.dataset.dcHero = "1";
    record.classList.add("dc-compact-hero");
    const eyebrow = record.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = "Listening Room";

    const actions = record.querySelector(".detail-actions");
    if (!actions) return;
    actions.classList.add("dc-hero-actions");

    const children = Array.from(actions.children);
    const listen = children.find(
      (el) =>
        /listen|mark/i.test(el.textContent || "") &&
        !/undo/i.test(el.textContent || ""),
    );
    const playlist = children.find((el) =>
      /playlist/i.test(el.textContent || ""),
    );
    const copyDiscord = children.find((el) =>
      /discord/i.test(el.textContent || "") || el.classList?.contains("dg-discord-action") || el.classList?.contains("dg-discord-copy-chip"),
    );
    const edit = children.find((el) =>
      /edit|setup|curation|studio/i.test(el.textContent || ""),
    );
    let genrePrev = children.find((el) => /previous/i.test(el.textContent || ""));
    let genreNext = children.find((el) => /^\s*next/i.test(el.textContent || ""));
    let archiveBack = children.find((el) => /back\s+to\s+(archive|library)/i.test(el.textContent || ""));
    if (genrePrev) {
      genrePrev.classList.add("dc-prev-genre-btn");
      genrePrev.setAttribute("aria-label", "Previous genre");
      genrePrev.setAttribute("title", "Previous genre");
    }
    if (archiveBack) {
      archiveBack.classList.add("dc-back-archive-btn");
      archiveBack.setAttribute("aria-label", "Back to Archive");
      archiveBack.setAttribute("title", "Back to Archive");
    }
    if (genreNext) {
      genreNext.classList.add("dc-next-genre-btn");
      genreNext.setAttribute("aria-label", "Next genre");
      genreNext.setAttribute("title", "Next genre");
    }
    const genreNav = [genrePrev, archiveBack, genreNext].filter(Boolean);
    if (!genreNav.length) {
      const makeNav = (label, action, className) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-secondary ${className || ""}`.trim();
        btn.textContent = label;
        btn.setAttribute("aria-label", label.replace(/\s+/g, " ").trim());
        btn.setAttribute("title", label.replace(/\s+/g, " ").trim());
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (action === "prev" && typeof openAdjacentGenre === "function") openAdjacentGenre(-1);
          if (action === "next" && typeof openAdjacentGenre === "function") openAdjacentGenre(1);
          if (action === "archive" && typeof restoreArchiveUiState === "function") restoreArchiveUiState();
        });
        return btn;
      };
      genrePrev = makeNav("← Previous", "prev", "dc-prev-genre-btn");
      archiveBack = makeNav("Back to Archive", "archive", "dc-back-archive-btn");
      genreNext = makeNav("Next →", "next", "dc-next-genre-btn");
      genreNav.push(genrePrev, archiveBack, genreNext);
    }

    const fireGenreNavAction = (action) => {
      let handled = false;
      if (action === "prev" && typeof openAdjacentGenre === "function") {
        openAdjacentGenre(-1);
        handled = true;
      }
      if (action === "next" && typeof openAdjacentGenre === "function") {
        openAdjacentGenre(1);
        handled = true;
      }
      if (action === "archive" && typeof restoreArchiveUiState === "function") {
        restoreArchiveUiState();
        handled = true;
      }
      if (handled) return;

      const target =
        action === "prev" ? genrePrev : action === "next" ? genreNext : archiveBack;
      try {
        if (target && typeof target.click === "function") target.click();
      } catch {}
    };

    const makeMobileNav = (icon, label, action, className) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn btn-secondary dc-mobile-genre-nav-btn ${className || ""}`.trim();
      btn.textContent = icon;
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fireGenreNavAction(action);
      });
      return btn;
    };
    const rest = children.filter(
      (el) =>
        el !== listen &&
        el !== playlist &&
        el !== copyDiscord &&
        el !== edit &&
        !genreNav.includes(el),
    );

    const heroMain = actions.parentElement;
    if (heroMain) heroMain.classList.add("dc-hero-main");

    const statusRow = record.querySelector(".status-row");
    if (statusRow && heroMain) {
      statusRow.classList.add("dc-hero-state-row");
      const rating = statusRow.querySelector(".genre-header-rating");
      if (rating) {
        let ratingRow = heroMain.querySelector(".dc-hero-rating-row");
        if (!ratingRow) {
          ratingRow = document.createElement("div");
          ratingRow.className = "dc-hero-rating-row";
          const subtle = heroMain.querySelector(".subtle");
          if (subtle?.nextSibling) heroMain.insertBefore(ratingRow, subtle.nextSibling);
          else heroMain.insertBefore(ratingRow, statusRow);
        }
        ratingRow.appendChild(rating);
      }
      statusRow.querySelectorAll(".tag").forEach((tag) => {
        const raw = tag.textContent || "";
        const txt = raw.toLowerCase();
        if (txt.includes("listened on")) {
          tag.classList.add("dc-listened-chip", "dc-low-priority-chip");
          tag.setAttribute("title", raw.trim());
        }
        if (txt.includes("needs song log")) tag.classList.add("dc-needs-song-log-chip");
        if (txt.includes("song") && txt.includes("logged")) {
          tag.classList.add("dc-song-count-chip", "dc-low-priority-chip");
        }
        if (txt.includes("pending") || txt.includes("monthly") || txt.includes("alt take")) {
          tag.classList.add("dc-low-priority-chip");
        }
      });
    }

    actions.innerHTML = "";
    const hasLoggedSongs = !!record.querySelector(".dc-song-count-chip") || !!(window.currentGenre?.songs_listened || []).some?.((song) => song && !song.isPending);
    if (listen) {
      listen.classList.add("dc-primary-action");
      const currentListenText = (listen.textContent || "").trim();
      const listenOnclick = String(listen.getAttribute("onclick") || "");
      const listenTitle = String(listen.getAttribute("title") || "");
      if (/unlistenCurrentGenre/i.test(listenOnclick) || /reset.*unlisten/i.test(listenTitle)) {
        listen.textContent = "Unlisten";
        listen.classList.add("dc-unlisten-action");
      } else if (/markCurrentGenreListened/i.test(listenOnclick) || /mark.*listened|log.*today/i.test(listenTitle)) {
        if (!hasLoggedSongs) {
          listen.textContent = "Add songs";
          listen.classList.add("dc-add-songs-action");
          listen.removeAttribute("onclick");
          listen.title = "Open the song add panel";
          listen.setAttribute("aria-label", "Open the song add panel");
          listen.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            try { if (typeof applyDetailEditMode === "function") applyDetailEditMode(true); } catch {}
            try { if (typeof toggleDetailEditMode === "function" && !document.body.classList.contains("detail-edit-mode")) toggleDetailEditMode(); } catch {}
            setTimeout(() => {
              const target = document.getElementById("songsListenedBulk") || document.querySelector(".setup-editor, #detailEditPanel, #songsListenedBulk");
              try { target?.scrollIntoView?.({ behavior: "smooth", block: "center" }); } catch {}
              try { target?.focus?.(); } catch {}
            }, 60);
          });
        } else {
          listen.textContent = "Log today";
          listen.classList.add("dc-log-today-action");
        }
      } else {
        listen.textContent = currentListenText || "Log today";
      }
      actions.appendChild(listen);
    }
    if (playlist) {
      playlist.classList.add("dc-secondary-action", "dc-playlist-action");
      playlist.textContent = "+ Playlist";
      actions.appendChild(playlist);
    }

    const ensureCopyButton = () => {
      const btn = copyDiscord || document.createElement("button");
      btn.type = "button";
      btn.classList.remove("tag", "dg-discord-copy-chip");
      btn.classList.add("btn", "btn-secondary", "dc-copy-discord-action");
      btn.textContent = "⧉";
      btn.title = "Copy Discord share block";
      btn.setAttribute("aria-label", "Copy Discord share block");
      if (!copyDiscord) {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          copyCurrentGenreDiscord(btn);
        });
      }
      return btn;
    };
    actions.appendChild(ensureCopyButton());

    if (edit) {
      edit.classList.add("btn", "btn-secondary", "dc-setup-action");
      edit.textContent = "⚙";
      edit.title = "Setup / curation editor";
      edit.setAttribute("aria-label", "Setup / curation editor");
      actions.appendChild(edit);
    }

    actions.querySelectorAll(".dc-copy-discord-action").forEach((btn, index) => {
      if (index > 0) btn.remove();
    });

    if (genreNav.length) {
      const navWrap = document.createElement("div");
      navWrap.className = "dc-genre-nav-actions dc-desktop-genre-nav";
      const compactLabels = new Map([
        [genrePrev, "‹"],
        [archiveBack, "Archive"],
        [genreNext, "›"],
      ]);
      genreNav.forEach((el) => {
        el.classList.add("dc-genre-nav-action");
        if (compactLabels.has(el)) el.textContent = compactLabels.get(el);
        navWrap.appendChild(el);
      });
      actions.appendChild(navWrap);

      const mobileNavWrap = document.createElement("div");
      mobileNavWrap.className = "dc-mobile-genre-nav";
      mobileNavWrap.setAttribute("aria-label", "Genre navigation");
      mobileNavWrap.append(
        makeMobileNav("‹", "Previous genre", "prev", "dc-mobile-prev-genre"),
        makeMobileNav("Archive", "Back to Archive", "archive", "dc-mobile-archive-genre"),
        makeMobileNav("›", "Next genre", "next", "dc-mobile-next-genre"),
      );
      actions.appendChild(mobileNavWrap);
    }

    // Song-to-song navigation belongs inside the Song Queue, not in the genre hero.

    if (rest.length) {
      const details = document.createElement("details");
      details.className = "dc-overflow-menu";
      const summary = document.createElement("summary");
      summary.textContent = "⋯";
      summary.setAttribute("role", "button");
      summary.setAttribute("aria-label", "More listening actions");
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        openHeroMoreMenu(details);
      });
      const menu = document.createElement("div");
      menu.className = "dc-overflow-menu-list";
      rest.forEach((el) => {
        el.classList.add("dc-overflow-action");
        el.addEventListener("click", () => setTimeout(() => details.removeAttribute("open"), 50));
        menu.appendChild(el);
      });
      details.appendChild(summary);
      details.appendChild(menu);
      actions.appendChild(details);
    }
  }

  function createLinerNotes(summaryNodes) {
    const details = document.createElement("details");
    details.className = "dc-liner-notes dc-console-card";
    const summary = document.createElement("summary");
    summary.innerHTML =
      "<span>Liner Notes</span><small>summary, key artists, suggested songs</small>";
    const body = document.createElement("div");
    body.className = "dc-liner-body";
    summaryNodes.forEach((node) => {
      if (node) body.appendChild(node);
    });
    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function createSessionTools(nodes) {
    const details = document.createElement("details");
    details.className = "dc-session-tools dc-console-card";
    const summary = document.createElement("summary");
    summary.innerHTML =
      "<span>Session Tools</span><small>ratings, reactions, monthly flags, copy tools</small>";
    const body = document.createElement("div");
    body.className = "dc-session-body";
    nodes.forEach((node) => {
      if (node) body.appendChild(node);
    });
    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function createPendingAlert(pendingNode) {
    if (!pendingNode) return null;
    const count = (() => {
      try {
        return currentGenre ? pendingCount(currentGenre) : 0;
      } catch {
        return 0;
      }
    })();
    const details = document.createElement("details");
    details.className = "dc-pending-alert dc-console-card";
    const summary = document.createElement("summary");
    summary.innerHTML = `<span>${count ? `${count} pending nomination${count === 1 ? "" : "s"} need review` : "No pending nominations"}</span><button type="button" class="btn btn-secondary btn-tiny dc-open-review" title="Open Studio" aria-label="Open Studio"><span class="dc-open-review-text">Studio</span></button>`;
    summary
      .querySelector(".dc-open-review")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof switchScreen === "function") switchScreen("review");
      });
    const body = document.createElement("div");
    body.className = "dc-pending-body";
    body.appendChild(pendingNode);
    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function createConsoleChrome(root, pieces) {
    const {
      record,
      vibe,
      summary,
      meta,
      ratingPanel,
      actionsPanel,
      reactionSummary,
      pendingNotes,
      songSection,
      pendingSection,
      albumPanel,
    } = pieces;

    const consoleWrap = document.createElement("div");
    consoleWrap.className = "discovery-console";

    if (record) consoleWrap.appendChild(record);
    if (currentGenre) {
      const progressWrap = document.createElement("div");
      progressWrap.innerHTML = renderConsoleProgress(currentGenre);
      consoleWrap.appendChild(progressWrap.firstElementChild);
    }

    if (vibe) {
      vibe.classList.add("dc-vibe-line");
      consoleWrap.appendChild(vibe);
    }

    if (songSection) {
      songSection.id = "dc-songs";
      songSection.classList.add("dc-primary-songs");
      consoleWrap.appendChild(songSection);
    }

    const pendingAlert = createPendingAlert(pendingSection);
    if (pendingAlert) consoleWrap.appendChild(pendingAlert);

    if (albumPanel) {
      albumPanel.id = "dc-albums";
      albumPanel.classList.add("dc-primary-albums");
      consoleWrap.appendChild(albumPanel);
    }

    const linerNodes = [summary, meta].filter(Boolean);
    if (linerNodes.length) {
      const liner = createLinerNotes(linerNodes);
      liner.id = "dc-liner-notes";
      consoleWrap.appendChild(liner);
    }

    const sessionNodes = [
      ratingPanel,
      actionsPanel,
      reactionSummary,
      pendingNotes,
    ].filter(Boolean);
    if (sessionNodes.length) {
      const session = createSessionTools(sessionNodes);
      session.id = "dc-session-tools";
      consoleWrap.appendChild(session);
    }

    root.innerHTML = "";
    root.appendChild(consoleWrap);
  }

  function restructureListenPage() {
    if (!listenScreenActive()) return;
    if (inBuildMode()) {
      document.body.classList.remove("dc-listen-mode");
      return;
    }

    document.body.classList.add("dc-listen-mode");
    document.body.classList.add("dc-discovery-console");
    relabelGlobalNav();

    const root = document.querySelector("#listenDetails .detail-hero");
    if (!root || root.dataset.dcStructured === "1") return;

    const record = root.querySelector(":scope > .detail-record-card");
    const vibe = root.querySelector(":scope > .vibe");
    const summary = Array.from(root.children).find((el) => el.tagName === "P");
    const meta = root.querySelector(":scope > .meta-grid");
    const ratingPanel = root.querySelector(
      ":scope > .view-rating-panel:not(.listening-actions-panel)",
    );
    const actionsPanel = root.querySelector(
      ":scope > .listening-actions-panel",
    );
    const reactionSummary = root.querySelector(
      ":scope > .track-reaction-summary",
    );
    const pendingNotes = root.querySelector(
      ":scope > .pending-song-notes-panel",
    );
    const songSection = root.querySelector(":scope > .detail-log-section");
    const pendingSection =
      songSection?.querySelector(":scope > .pending-section") || null;
    const albumPanel = root.querySelector(":scope > .album-dive-panel");

    simplifyHero(record);
    createConsoleChrome(root, {
      record,
      vibe,
      summary,
      meta,
      ratingPanel,
      actionsPanel,
      reactionSummary,
      pendingNotes,
      songSection,
      pendingSection,
      albumPanel,
    });
    root.dataset.dcStructured = "1";

    installMobileJumpNav();
    installStudioClickGuard();
    if (DC.crateDigIntent) {
      DC.crateDigIntent = false;
      setTimeout(
        () =>
          document
            .getElementById("dc-songs")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  }

  function installStudioClickGuard() {
    if (window.__dailyGenreStudioClickGuardV31) return;
    window.__dailyGenreStudioClickGuardV31 = true;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target?.closest?.(
          ".dc-studio-action, [data-dc-open-studio], .dc-open-review",
        );
        if (!target) return;
        const text = String(
          target.textContent || target.getAttribute("aria-label") || "",
        ).toLowerCase();
        if (!target.matches(".dc-open-review") && !text.includes("studio"))
          return;
        event.preventDefault();
        event.stopPropagation();
        if (target.matches(".dc-open-review")) {
          try {
            if (typeof switchScreen === "function") switchScreen("review");
          } catch {}
          return;
        }
        openStudioMode();
      },
      true,
    );
  }

  function installMobileJumpNav() {
    // v60: the Songs / Albums / Notes mobile floater was visually noisy and did
    // not provide a reliable benefit in normal or mobile layouts. Keep the
    // function as a safe no-op so older route hooks can call it, but always
    // remove any existing instance.
    document.querySelector(".dc-mobile-jump-nav")?.remove();
  }

  function installRouteAwareness() {
    if (window.__dailyGenreDiscoveryRoutesInstalled) return;
    window.__dailyGenreDiscoveryRoutesInstalled = true;
    const originalOpenCrateDig =
      typeof openCrateDig === "function" ? openCrateDig : null;
    if (originalOpenCrateDig) {
      openCrateDig = function patchedOpenCrateDig(...args) {
        DC.crateDigIntent = true;
        return originalOpenCrateDig.apply(this, args);
      };
    }
    const originalOpenRandomListenedGenre =
      typeof openRandomListenedGenre === "function"
        ? openRandomListenedGenre
        : null;
    if (originalOpenRandomListenedGenre) {
      openRandomListenedGenre = function patchedOpenRandomListenedGenre(
        ...args
      ) {
        DC.crateDigIntent = true;
        return originalOpenRandomListenedGenre.apply(this, args);
      };
    }
  }

  function ensureListenModeClasses() {
    const screen = document.getElementById("screen-listen");
    if (screen) {
      screen.classList.add("listen-experience-mode", "listening-room-v3");
    }
    document.body?.classList?.add("dc-discovery-console", "listening-room-v3");
  }

  function installLoadWrapper() {
    const original =
      typeof loadListenScreen === "function" ? loadListenScreen : null;
    if (original && !window.__dailyGenreDiscoveryLoadWrapped) {
      window.__dailyGenreDiscoveryLoadWrapped = true;
      loadListenScreen = function discoveryLoadListenScreen(...args) {
        ensureListenModeClasses();
        const result = original.apply(this, args);
        setTimeout(() => {
          try {
            if (typeof enhanceSongListeningExperience === "function")
              enhanceSongListeningExperience();
          } catch {}
          restructureListenPage();
        }, 20);
        return result;
      };
    }
  }

  function boot() {
    if (DC.installed) return;
    DC.installed = true;
    ensureListenModeClasses();
    installSearchNormalization();
    installRouteAwareness();
    installLoadWrapper();
    relabelGlobalNav();
    setTimeout(() => {
      try {
        if (typeof enhanceSongListeningExperience === "function")
          enhanceSongListeningExperience();
      } catch {}
      restructureListenPage();
    }, 80);
    document.addEventListener("click", (event) => {
      const menu = event.target?.closest?.(".dc-overflow-menu");
      if (!menu)
        document
          .querySelectorAll(".dc-overflow-menu[open]")
          .forEach((el) => el.removeAttribute("open"));
      setTimeout(installMobileJumpNav, 50);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* === Discovery Console Spin polish v1.2 === */
(() => {
  const STATE = {
    genres: null,
    fetchStarted: false,
    searchTimer: null,
  };

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function compactSearchText(value) {
    return normalizeSearchText(value).replace(/\s+/g, "");
  }

  function categoryLineForGenre(g) {
    return (
      [g?.subcategory, g?.subsubcategory, g?.subsubsubcategory]
        .filter(Boolean)
        .join(" > ") ||
      g?.category_path ||
      ""
    );
  }

  function collectGenreSearchAliases(g) {
    const values = [];
    const push = (value) => {
      if (Array.isArray(value)) value.forEach(push);
      else if (value && typeof value === "object") Object.values(value).forEach(push);
      else if (value != null) {
        String(value)
          .split(/[\n;,|]+/g)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => values.push(part));
      }
    };

    push(g?.aliases);
    push(g?.synonyms);
    push(g?.aka);
    push(g?.alsoKnownAs);
    push(g?.also_known_as);

    const canonical = normalizeSearchText(g?.genre || "");
    if (canonical === "hokkien pop") {
      push([
        "Tai-pop",
        "Tai pop",
        "Taipop",
        "Taiwanese pop",
        "Taiwanese Hokkien pop",
        "Taiwanese-language pop",
        "Taiwanese language pop",
        "Tâi-gí pop",
      ]);
    }

    return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function aliasHitForQuery(g, rawQuery) {
    const q = normalizeSearchText(rawQuery);
    const cq = compactSearchText(rawQuery);
    if (!q) return "";
    return (
      collectGenreSearchAliases(g).find((alias) => {
        const na = normalizeSearchText(alias);
        const ca = compactSearchText(alias);
        return na === q || ca === cq || na.includes(q) || ca.includes(cq);
      }) || ""
    );
  }

  function escapeHtmlLocal(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(
      /[&<>"]/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch],
    );
  }

  async function loadGenreRows() {
    if (Array.isArray(window.genres) && window.genres.length) {
      STATE.genres = window.genres;
      return STATE.genres;
    }
    if (Array.isArray(STATE.genres)) return STATE.genres;
    if (STATE.fetchStarted) {
      for (let i = 0; i < 40; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (Array.isArray(window.genres) && window.genres.length) {
          STATE.genres = window.genres;
          return STATE.genres;
        }
        if (Array.isArray(STATE.genres)) return STATE.genres;
      }
    }
    STATE.fetchStarted = true;
    const urls = [
      "./genres_data.json",
      "genres_data.json",
      "https://raw.githubusercontent.com/moxed42/dailygenre/main/genres_data.json",
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) {
          STATE.genres = data;
          return STATE.genres;
        }
      } catch {}
    }
    STATE.genres = [];
    return STATE.genres;
  }

  function scoreGenreMatch(g, rawQuery) {
    const q = normalizeSearchText(rawQuery);
    const cq = compactSearchText(rawQuery);
    const name = normalizeSearchText(g?.genre || "");
    const cname = compactSearchText(g?.genre || "");
    const category = normalizeSearchText(categoryLineForGenre(g));
    const aliases = collectGenreSearchAliases(g).map((alias) => ({
      alias,
      norm: normalizeSearchText(alias),
      compact: compactSearchText(alias),
    }));
    if (!q) return 9999;

    if (name === q || cname === cq) return 0;
    if (aliases.some((a) => a.norm === q || a.compact === cq)) return 1;

    if (name.startsWith(q) || cname.startsWith(cq))
      return 10 + Math.max(0, name.length - q.length) / 100;
    if (aliases.some((a) => a.norm.startsWith(q) || a.compact.startsWith(cq)))
      return 12;

    if (name.split(" ").some((part) => part.startsWith(q)))
      return 20 + name.indexOf(q) / 100;
    if (aliases.some((a) => a.norm.split(" ").some((part) => part.startsWith(q))))
      return 24;

    if (name.includes(q) || cname.includes(cq))
      return 40 + name.indexOf(q) / 100;
    if (aliases.some((a) => a.norm.includes(q) || a.compact.includes(cq)))
      return 44;

    if (category.startsWith(q)) return 60;
    if (category.includes(q)) return 80;
    const words = q.split(" ").filter(Boolean);
    if (words.length > 1) {
      const aliasText = aliases.map((a) => a.norm).join(" ");
      if (words.every((word) => name.includes(word) || category.includes(word) || aliasText.includes(word)))
        return 90;
    }
    return 9999;
  }

  function conciseText(value, limit = 260) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1).trim()}…`;
  }

  function renderGenrePreview(g) {
    if (!g) {
      return `
        <div class="manual-preview-empty">
          <div class="manual-preview-icon">♪</div>
          <strong>Pick a genre</strong>
          <span>Use the music note beside a result to preview liner notes without leaving Spin.</span>
        </div>
      `;
    }
    const category = categoryLineForGenre(g);
    return `
      <div class="manual-preview-card" data-spin-preview-id="${escapeHtmlLocal(g.id)}">
        <div class="manual-preview-kicker">genre preview</div>
        <h3>${escapeHtmlLocal(g.genre || "Unknown")}</h3>
        ${category ? `<div class="manual-preview-path">${escapeHtmlLocal(category)}</div>` : ""}
        ${g.vibe ? `<p class="manual-preview-vibe">♪ ${escapeHtmlLocal(g.vibe)}</p>` : ""}
        ${g.summary ? `<p class="manual-preview-summary">${escapeHtmlLocal(conciseText(g.summary, 320))}</p>` : ""}
        ${g.key_artists ? `<div class="manual-preview-meta"><strong>Key artists</strong><span>${escapeHtmlLocal(conciseText(g.key_artists, 190))}</span></div>` : ""}
        ${g.suggested_songs ? `<div class="manual-preview-meta"><strong>Suggested</strong><span>${escapeHtmlLocal(conciseText(g.suggested_songs, 190))}</span></div>` : ""}
        <div class="manual-preview-actions">
          <button type="button" class="btn primary manual-preview-open" data-spin-open-id="${escapeHtmlLocal(g.id)}">Listen</button>
          <button type="button" class="btn secondary manual-preview-copy" data-spin-copy-id="${escapeHtmlLocal(g.id)}">Copy Discord</button>
        </div>
      </div>
    `;
  }

  function openManualGenre(g) {
    if (!g) return;
    if (typeof window.openGenreFromManualPicker === "function") {
      window.openGenreFromManualPicker(g.id);
      return;
    }
    if (typeof openGenreDetail === "function") openGenreDetail(g, true);
  }

  async function renderBetterManualSearch() {
    const input = document.getElementById("manualSearch2");
    const results = document.getElementById("manualResults2");
    if (!input || !results) return;
    const query = input.value.trim();
    if (!query) {
      results.innerHTML = "";
      return;
    }
    const rows = await loadGenreRows();
    const matches = rows
      .map((g) => ({ g, score: scoreGenreMatch(g, query) }))
      .filter((item) => item.score < 9999)
      .sort(
        (a, b) =>
          a.score - b.score ||
          String(a.g.genre || "").localeCompare(String(b.g.genre || "")),
      )
      .slice(0, 12)
      .map((item) => item.g);

    const selectedId =
      STATE.previewGenreId &&
      matches.some((g) => String(g.id) === String(STATE.previewGenreId))
        ? STATE.previewGenreId
        : matches[0]?.id;
    STATE.previewGenreId = selectedId;
    const selected = matches.find((g) => String(g.id) === String(selectedId));

    results.innerHTML = matches.length
      ? `
      <div class="manual-search-browser">
        <div class="manual-search-list" role="list">
          ${matches
            .map(
              (g) => `
            <div class="manual-result-row ${String(g.id) === String(selectedId) ? "selected" : ""}" role="listitem">
              <button class="manual-result-main" type="button" data-spin-preview-id="${escapeHtmlLocal(g.id)}">
                <span class="manual-result-name">${escapeHtmlLocal(g.genre || "Unknown")}</span>
                <span class="manual-result-path">${escapeHtmlLocal(categoryLineForGenre(g))}${aliasHitForQuery(g, query) ? ` · ${escapeHtmlLocal(aliasHitForQuery(g, query))}` : ""}</span>
              </button>
              <button class="manual-result-info" type="button" data-spin-listen-id="${escapeHtmlLocal(g.id)}" title="Listen" aria-label="Listen to ${escapeHtmlLocal(g.genre || "genre")}">♪</button>
            </div>
          `,
            )
            .join("")}
        </div>
        <aside class="manual-search-preview" aria-live="polite">
          ${renderGenrePreview(selected)}
        </aside>
      </div>
    `
      : `<div class="manual-empty-state">No close genre matches yet.</div>`;

    [...results.querySelectorAll("[data-spin-preview-id]")].forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        STATE.previewGenreId = btn.getAttribute("data-spin-preview-id");
        renderBetterManualSearch();
      });
    });

    [...results.querySelectorAll("[data-spin-listen-id]")].forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = btn.getAttribute("data-spin-listen-id");
        openManualGenre(rows.find((g) => String(g.id) === String(id)));
      });
    });

    [...results.querySelectorAll("[data-spin-open-id]")].forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-spin-open-id");
        openManualGenre(rows.find((g) => String(g.id) === String(id)));
      });
    });

    [...results.querySelectorAll("[data-spin-copy-id]")].forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-spin-copy-id");
        const genre = rows.find((g) => String(g.id) === String(id));
        if (!genre) return;
        try {
          await navigator.clipboard.writeText(buildSpinDiscordText(genre));
          const old = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(() => {
            btn.textContent = old;
          }, 1100);
        } catch {
          alert(buildSpinDiscordText(genre));
        }
      });
    });
  }

  function installBetterManualSearch() {
    const input = document.getElementById("manualSearch2");
    if (!input || input.dataset.spinPolishInstalled === "1") return;
    input.dataset.spinPolishInstalled = "1";
    const label = document.querySelector('label[for="manualSearch2"]');
    if (label) {
      label.textContent = "";
      label.classList.add("manual-search-label", "sr-only");
    }
    input.placeholder = "Search genres — synth pop, dungeon synth, Afrobeat…";
    input.addEventListener(
      "input",
      (event) => {
        event.stopImmediatePropagation();
        STATE.previewGenreId = null;
        clearTimeout(STATE.searchTimer);
        STATE.searchTimer = setTimeout(renderBetterManualSearch, 90);
      },
      true,
    );
    input.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Enter") return;
        event.stopImmediatePropagation();
        clearTimeout(STATE.searchTimer);
        renderBetterManualSearch();
      },
      true,
    );
  }

  function spinStatusLocal(genre) {
    return String(genre?.status || "")
      .trim()
      .toLowerCase();
  }

  function spinDateLocal(genre) {
    return String(
      genre?.date_normalized || genre?.date || genre?.date_raw || "",
    ).trim();
  }

  function spinIsZangerLocal(genre) {
    return (
      String(genre?.rating || "")
        .trim()
        .toLowerCase() === "zanger" || spinStatusLocal(genre) === "veto"
    );
  }

  function spinIsListenedLocal(genre) {
    const status = spinStatusLocal(genre);
    const date = spinDateLocal(genre);
    return (
      !spinIsZangerLocal(genre) &&
      (status === "listened" || String(date || "").startsWith("2026-"))
    );
  }

  function spinIsRemainingLocal(genre) {
    const status = spinStatusLocal(genre);
    if (spinIsZangerLocal(genre) || spinIsListenedLocal(genre)) return false;
    return status === "" || status === "unlistened";
  }

  function buildCompactRemainingAudit() {
    const rows = Array.isArray(window.genres) ? window.genres : [];
    if (!rows.length) return "Genre counts unavailable.";
    const remaining = rows.filter(spinIsRemainingLocal).length;
    const total = rows.length;
    const notInSpinner = Math.max(0, total - remaining);
    const listened = rows.filter(spinIsListenedLocal).length;
    const listened2026 = rows.filter(
      (g) =>
        !spinIsZangerLocal(g) && String(spinDateLocal(g)).startsWith("2026-"),
    ).length;
    const listenedNoOrOlderDate = rows.filter(
      (g) =>
        !spinIsZangerLocal(g) &&
        spinStatusLocal(g) === "listened" &&
        !String(spinDateLocal(g)).startsWith("2026-"),
    ).length;
    const zangers = rows.filter(spinIsZangerLocal).length;
    const excludedOther = rows.filter((g) => {
      const status = spinStatusLocal(g);
      return (
        !spinIsRemainingLocal(g) &&
        !spinIsListenedLocal(g) &&
        !spinIsZangerLocal(g) &&
        status &&
        status !== "unlistened"
      );
    }).length;
    const blankRemaining = rows.filter(
      (g) => spinStatusLocal(g) === "" && spinIsRemainingLocal(g),
    ).length;
    return [
      `${remaining} spin-eligible genres remaining`,
      `${total} loaded genre rows`,
      `${notInSpinner} loaded rows not in spinner`,
      `• ${listened} listened (${listened2026} dated 2026, ${listenedNoOrOlderDate} no/older date)`,
      `• ${zangers} zanger/veto`,
      `• ${excludedOther} excluded/other status`,
      `• ${blankRemaining} blank-status rows counted as remaining`,
    ].join("\n");
  }

  function compactRemainingClick() {
    const remaining = document.getElementById("remainingCount");
    if (!remaining || remaining.dataset.spinPolishRemaining === "1") return;
    remaining.dataset.spinPolishRemaining = "1";
    remaining.title = "Spin count summary";
    remaining.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(buildCompactRemainingAudit());
      },
      true,
    );
  }

  function genreEmojiLocal(genre) {
    if (typeof genreEmoji === "function") return genreEmoji(genre);
    return "🎵";
  }

  function buildSpinDiscordText(genre) {
    const rawDate = new Date().toISOString().slice(0, 10);
    const dateStr = new Date(rawDate + "T00:00:00").toLocaleDateString(
      "en-US",
      { month: "2-digit", day: "2-digit", year: "2-digit" },
    );
    let text = `Today's Genre (${dateStr}) is..... **${String(genre?.genre || "UNKNOWN").toUpperCase()}**\n\n`;
    if (genre?.vibe)
      text += `${genreEmojiLocal(genre)} *Vibe: ${genre.vibe}*\n\n`;
    if (genre?.summary) text += `${genre.summary}\n\n`;
    if (genre?.key_artists) text += `🎤 Key Artists: ${genre.key_artists}`;
    return text.trim();
  }

  async function copySpinDiscordForDisplayedGenre(button) {
    const title = document
      .querySelector("#spinResult .genre-title")
      ?.textContent?.trim();
    const rows = await loadGenreRows();
    const genre =
      rows.find(
        (g) =>
          normalizeSearchText(g.genre || "") === normalizeSearchText(title),
      ) || rows.find((g) => String(g.genre || "").trim() === title);
    if (!genre) return;
    try {
      await navigator.clipboard.writeText(buildSpinDiscordText(genre));
      const old = button.textContent;
      button.textContent = "✓";
      button.classList.add("copied");
      setTimeout(() => {
        button.textContent = old;
        button.classList.remove("copied");
      }, 1200);
    } catch {
      alert(buildSpinDiscordText(genre));
    }
  }

  function installSpinResultCopyObserver() {
    const result = document.getElementById("spinResult");
    if (!result || result.dataset.spinPolishCopyObserved === "1") return;
    result.dataset.spinPolishCopyObserved = "1";
    const addButton = () => {
      if (!result.classList.contains("show")) return;
      const title = result.querySelector(".genre-title");
      if (!title || result.querySelector(".spin-copy-discord-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "spin-copy-discord-btn";
      btn.title = "Copy Discord share text";
      btn.setAttribute("aria-label", "Copy Discord share text");
      btn.textContent = "⧉";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copySpinDiscordForDisplayedGenre(btn);
      });
      const eyebrow = result.querySelector(".eyebrow") || title;
      eyebrow.insertAdjacentElement("afterend", btn);
    };
    new MutationObserver(addButton).observe(result, {
      childList: true,
      subtree: true,
    });
    addButton();
  }

  function bootSpinPolish() {
    installBetterManualSearch();
    compactRemainingClick();
    installSpinResultCopyObserver();
    loadGenreRows();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", bootSpinPolish);
  else bootSpinPolish();
})();

/* Daily Genre v65 cache-bust marker */
