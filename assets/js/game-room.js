/* Daily Genre v291: Game Room — Easy Mode */
(function () {
  "use strict";

  const ROUND_COUNT = 10;
  const CHOICE_COUNT = 4;
  const state = {
    rounds: [],
    roundIndex: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    answered: false,
    hintVisible: false,
    started: false,
  };

  const esc = (value) => {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const clean = (value) => String(value ?? "").trim();

  function genres() {
    return Array.isArray(window.genres) ? window.genres : [];
  }

  function genreName(genre) {
    return clean(genre?.genre || genre?.name || genre?.title || "Unknown genre");
  }

  function genreId(genre) {
    return String(genre?.id ?? genreName(genre));
  }

  function isListenedGenre(genre) {
    const status = clean(genre?.status).toLowerCase();
    const rating = clean(genre?.rating).toLowerCase();
    let canonicalDate = "";
    try {
      if (typeof window.dateValue === "function") canonicalDate = clean(window.dateValue(genre));
    } catch (_) {}
    return Boolean(
      canonicalDate ||
      genre?.date ||
      genre?.date_normalized ||
      genre?.datenormalized ||
      genre?.date_raw ||
      genre?.dateraw ||
      genre?.listenedAt ||
      genre?.listened_at ||
      genre?.listenedDate ||
      status === "listened" ||
      status === "in_progress" ||
      status === "in-progress" ||
      status === "veto" ||
      status === "zanger" ||
      rating === "zanger" ||
      rating === "veto" ||
      Number.isFinite(Number(rating))
    );
  }

  function inflateSongs(raw) {
    try {
      if (typeof window.inflateSongsFromStorage === "function") {
        return window.inflateSongsFromStorage(raw || []);
      }
    } catch (_) {}
    return Array.isArray(raw) ? raw : [];
  }

  function songUrl(song) {
    return clean(
      song?.spotifyUrl ||
      song?.spotify_url ||
      song?.url ||
      song?.providerUrl ||
      song?.externalUrl
    );
  }

  function songArtist(song) {
    return clean(
      song?.artist ||
      song?.artistName ||
      (Array.isArray(song?.artists) ? song.artists.join(", ") : "")
    );
  }

  function albumSlots(genre) {
    const dive = genre?.albumDive || genre?.album_dive || genre?.album_dive_data || null;
    const slots = Array.isArray(dive?.slots)
      ? dive.slots
      : Array.isArray(genre?.albumDiveSlots)
        ? genre.albumDiveSlots
        : [];
    return slots.filter(Boolean);
  }

  function albumUrl(slot) {
    return clean(
      slot?.albumProviderUrl ||
      slot?.spotifyAlbumUrl ||
      slot?.spotifyUrl ||
      slot?.spotify_url ||
      slot?.url
    );
  }

  function genreDefinition(genre) {
    return clean(
      genre?.definition ||
      genre?.summary ||
      genre?.description ||
      genre?.genre_description ||
      genre?.identity?.description ||
      genre?.identity?.summary
    );
  }

  function genreCategory(genre) {
    return clean(
      genre?.parentCategory ||
      genre?.parent_category ||
      genre?.category ||
      genre?.broad_category ||
      genre?.family
    );
  }

  function itemReason(item) {
    return clean(
      item?.reason ||
      item?.why ||
      item?.fitReason ||
      item?.fit_reason ||
      item?.rationale ||
      item?.description
    );
  }

  function buildQuestionPool() {
    const pool = [];
    genres().filter(isListenedGenre).forEach((genre) => {
      inflateSongs(genre?.songs_listened || [])
        .filter((song) => !song?.isPending)
        .forEach((song) => {
          const title = clean(song?.title || song?.name);
          const artist = songArtist(song);
          const url = songUrl(song);
          if (!title || !url) return;
          pool.push({
            kind: "song",
            genre,
            genreId: genreId(genre),
            title,
            artist,
            url,
            reason: itemReason(song),
            artwork: clean(song?.artwork || song?.albumArt || song?.image || song?.thumbnail),
          });
        });

      albumSlots(genre).forEach((slot) => {
        const title = clean(slot?.album || slot?.albumTitle || slot?.title);
        const artist = clean(slot?.artist || slot?.albumArtist);
        const url = albumUrl(slot);
        if (!title || !url) return;
        pool.push({
          kind: "album",
          genre,
          genreId: genreId(genre),
          title,
          artist,
          url,
          reason: itemReason(slot),
          artwork: clean(slot?.albumArt || slot?.manualAlbumArt || slot?.cover || slot?.image || slot?.artwork),
        });
      });
    });
    return pool;
  }

  function shuffle(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildRounds() {
    const listenedGenres = genres().filter(isListenedGenre);
    if (listenedGenres.length < CHOICE_COUNT) return [];

    const genreMap = new Map(listenedGenres.map((g) => [genreId(g), g]));
    const pool = shuffle(buildQuestionPool());
    const selected = [];
    const usedGenres = new Set();

    for (const item of pool) {
      if (selected.length >= ROUND_COUNT) break;
      if (!usedGenres.has(item.genreId)) {
        selected.push(item);
        usedGenres.add(item.genreId);
      }
    }
    for (const item of pool) {
      if (selected.length >= ROUND_COUNT) break;
      if (!selected.includes(item)) selected.push(item);
    }

    return selected.map((item) => {
      const distractors = shuffle(
        listenedGenres.filter((g) => genreId(g) !== item.genreId)
      ).slice(0, CHOICE_COUNT - 1);
      const choices = shuffle([item.genre, ...distractors]);
      return { ...item, choices, genreMap };
    });
  }

  function ensureUi() {
    if (!document.getElementById("gameRoomTab")) {
      const nav = document.querySelector(".tabs");
      const before = nav?.querySelector('[data-screen="viz"]');
      const button = document.createElement("button");
      button.type = "button";
      button.id = "gameRoomTab";
      button.className = "tab-btn";
      button.textContent = "Game Room";
      button.addEventListener("click", openGameRoom);
      if (nav) nav.insertBefore(button, before || null);
    }

    if (!document.getElementById("screen-game")) {
      const app = document.querySelector(".app");
      const section = document.createElement("section");
      section.className = "screen";
      section.id = "screen-game";
      section.innerHTML = '<div class="game-room-shell" id="gameRoomMount"></div>';
      const ranking = document.getElementById("screen-ranking");
      if (ranking?.parentNode) ranking.parentNode.insertBefore(section, ranking);
      else app?.appendChild(section);
    }
  }

  function activateGameScreen() {
    document.querySelectorAll(".screen").forEach((screen) => {
      const active = screen.id === "screen-game";
      screen.classList.toggle("active", active);
      screen.setAttribute("aria-hidden", active ? "false" : "true");
      try { screen.inert = !active; } catch (_) {}
    });
    document.querySelectorAll(".tab-btn").forEach((tab) => tab.classList.remove("active"));
    document.getElementById("gameRoomTab")?.classList.add("active");
    document.title = "Game Room | Daily Genre";
  }

  function openGameRoom(event) {
    event?.preventDefault?.();
    ensureUi();
    activateGameScreen();
    if (!state.started) renderIntro();
    else renderRound();
  }

  function mount() {
    return document.getElementById("gameRoomMount");
  }

  function renderIntro(message = "") {
    const el = mount();
    if (!el) return;
    const listenedCount = genres().filter(isListenedGenre).length;
    const poolCount = buildQuestionPool().length;
    el.innerHTML = `
      <div class="game-room-hero">
        <div>
          <div class="eyebrow">Game Room · Easy Mode</div>
          <h2>Which genre does this belong to?</h2>
          <p>Listen first, then choose from four genres you have already explored.</p>
        </div>
        <div class="game-room-mode-pill">10 rounds</div>
      </div>
      ${message ? `<div class="notice">${esc(message)}</div>` : ""}
      <div class="game-room-intro-grid">
        <div class="game-room-rule"><strong>🎧 Listen</strong><span>Open the stored Spotify song or album.</span></div>
        <div class="game-room-rule"><strong>🎯 Choose</strong><span>All four answers come from listened genres only.</span></div>
        <div class="game-room-rule"><strong>📚 Learn</strong><span>Reveal the definition and saved fit rationale.</span></div>
      </div>
      <div class="game-room-start-card">
        <div>
          <strong>${listenedCount} listened genres</strong>
          <span>${poolCount} playable song and album clues available</span>
        </div>
        <button type="button" class="btn btn-primary" id="gameRoomStartBtn">Start Easy Mode</button>
      </div>
    `;
    document.getElementById("gameRoomStartBtn")?.addEventListener("click", startGame);
  }

  function startGame() {
    const rounds = buildRounds();
    if (rounds.length < ROUND_COUNT) {
      renderIntro(`Game Room needs at least ${ROUND_COUNT} playable clues across at least ${CHOICE_COUNT} listened genres. It currently found ${rounds.length}.`);
      return;
    }
    state.rounds = rounds;
    state.roundIndex = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.answered = false;
    state.hintVisible = false;
    state.started = true;
    renderRound();
  }

  function currentRound() {
    return state.rounds[state.roundIndex] || null;
  }

  function spotifyEmbedInfo(url = "") {
    const raw = clean(url);
    const match = raw.match(
      /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album)\/([A-Za-z0-9]{22})/i
    );
    if (!match) return null;
    return {
      type: match[1].toLowerCase(),
      id: match[2],
      canonicalUrl: `https://open.spotify.com/${match[1].toLowerCase()}/${match[2]}`,
      embedUrl: `https://open.spotify.com/embed/${match[1].toLowerCase()}/${match[2]}?utm_source=generator&theme=0`,
    };
  }

  function openGameMiniPlayer(round) {
    if (!round) return;
    const info = spotifyEmbedInfo(round.url);

    const helperNames = [
      "stickyPlayerOpen",
      "openSpotifyStickyPlayer",
      "spotifyStickyPlayerOpen",
      "playSpotifySticky",
    ];
    for (const name of helperNames) {
      const helper = window[name];
      if (typeof helper !== "function") continue;
      try {
        helper(round.url, round.title, round.artist, round.artwork);
        return;
      } catch (_) {}
    }

    if (info) {
      const player = document.getElementById("spotifyStickyPlayer");
      const embed = document.getElementById("spotifyStickyEmbed");
      const title = document.getElementById("spotifyStickyTitle");
      const artist = document.getElementById("spotifyStickyArtist");
      const art = document.getElementById("spotifyStickyArt");

      if (player && embed) {
        embed.innerHTML = `<iframe
          src="${esc(info.embedUrl)}"
          title="Spotify ${esc(info.type)} player"
          width="100%"
          height="${info.type === "album" ? "152" : "80"}"
          frameborder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"></iframe>`;
        if (title) title.textContent = round.title || "Spotify";
        if (artist) artist.textContent = round.artist || "";
        if (art) {
          if (round.artwork) {
            art.src = round.artwork;
            art.alt = "";
            art.hidden = false;
          } else {
            art.removeAttribute("src");
            art.hidden = true;
          }
        }

        player.hidden = false;
        player.classList.add("active", "open", "is-open");
        player.setAttribute("aria-hidden", "false");
        player.style.display = "";
        return;
      }
    }

    window.open(round.url, "_blank", "noopener,noreferrer");
  }

  function renderRound() {
    const el = mount();
    const round = currentRound();
    if (!el) return;
    if (!round) {
      renderResults();
      return;
    }

    const progress = state.roundIndex + 1;
    const category = genreCategory(round.genre);
    el.innerHTML = `
      <div class="game-room-scorebar">
        <span>Round <strong>${progress}/${ROUND_COUNT}</strong></span>
        <span>Score <strong>${state.score}</strong></span>
        <span>Streak <strong>${state.streak}</strong></span>
      </div>
      <div class="game-room-progress"><span style="width:${(progress / ROUND_COUNT) * 100}%"></span></div>
      <article class="game-room-question">
        <div class="game-room-media">
          ${round.artwork ? `<img src="${esc(round.artwork)}" alt="" loading="lazy">` : `<div class="game-room-art-placeholder">${round.kind === "album" ? "◉" : "♪"}</div>`}
          <div class="game-room-media-copy">
            <div class="eyebrow">${round.kind === "album" ? "Album clue" : "Song clue"}</div>
            <h2>${esc(round.title)}</h2>
            <p>${esc(round.artist || "Artist unavailable")}</p>
            <button type="button" class="btn btn-primary game-room-play" id="gameRoomPlayBtn">▶ Play in mini player</button>
          </div>
        </div>
        <div class="game-room-hint-row">
          <button type="button" class="btn btn-secondary btn-tiny" id="gameRoomHintBtn">${state.hintVisible ? "Hide category hint" : "Show category hint"}</button>
          <span id="gameRoomHintText">${state.hintVisible ? esc(category || "No parent category stored") : ""}</span>
        </div>
        <div class="game-room-choices" id="gameRoomChoices">
          ${round.choices.map((choice) => `
            <button type="button" class="game-room-choice" data-genre-id="${esc(genreId(choice))}">
              ${esc(genreName(choice))}
            </button>
          `).join("")}
        </div>
        <div id="gameRoomReveal" aria-live="polite"></div>
      </article>
    `;

    document.getElementById("gameRoomPlayBtn")?.addEventListener("click", () => {
      openGameMiniPlayer(round);
    });
    document.getElementById("gameRoomHintBtn")?.addEventListener("click", () => {
      state.hintVisible = !state.hintVisible;
      renderRound();
    });
    document.querySelectorAll(".game-room-choice").forEach((button) => {
      button.addEventListener("click", () => answerRound(button.dataset.genreId));
    });
  }

  function answerRound(selectedId) {
    if (state.answered) return;
    const round = currentRound();
    if (!round) return;
    state.answered = true;
    const correct = String(selectedId) === round.genreId;
    if (correct) {
      state.score += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.streak = 0;
    }

    document.querySelectorAll(".game-room-choice").forEach((button) => {
      const id = String(button.dataset.genreId || "");
      button.disabled = true;
      if (id === round.genreId) button.classList.add("correct");
      else if (id === String(selectedId)) button.classList.add("incorrect");
    });

    const definition = genreDefinition(round.genre);
    const reason = round.reason;
    const reveal = document.getElementById("gameRoomReveal");
    if (reveal) {
      reveal.innerHTML = `
        <div class="game-room-reveal ${correct ? "is-correct" : "is-wrong"}">
          <div class="game-room-result-line">${correct ? "Correct!" : `Not quite — it is ${esc(genreName(round.genre))}.`}</div>
          ${definition ? `<p><strong>Genre:</strong> ${esc(definition)}</p>` : ""}
          ${reason ? `<p><strong>Why this clue fits:</strong> ${esc(reason)}</p>` : ""}
          <button type="button" class="btn btn-primary" id="gameRoomNextBtn">${state.roundIndex + 1 >= ROUND_COUNT ? "See Results" : "Next Round"}</button>
        </div>
      `;
      document.getElementById("gameRoomNextBtn")?.addEventListener("click", nextRound);
    }
  }

  function nextRound() {
    state.roundIndex += 1;
    state.answered = false;
    state.hintVisible = false;
    renderRound();
  }

  function renderResults() {
    const el = mount();
    if (!el) return;
    const percent = Math.round((state.score / ROUND_COUNT) * 100);
    el.innerHTML = `
      <div class="game-room-results">
        <div class="eyebrow">Easy Mode complete</div>
        <h2>${state.score}/${ROUND_COUNT}</h2>
        <p>${percent}% correct · Best streak ${state.bestStreak}</p>
        <div class="game-room-result-actions">
          <button type="button" class="btn btn-primary" id="gameRoomAgainBtn">Play Again</button>
          <button type="button" class="btn btn-secondary" id="gameRoomExitBtn">Back to Spin</button>
        </div>
      </div>
    `;
    document.getElementById("gameRoomAgainBtn")?.addEventListener("click", startGame);
    document.getElementById("gameRoomExitBtn")?.addEventListener("click", () => {
      state.started = false;
      if (typeof window.switchScreen === "function") window.switchScreen("spin");
      else document.querySelector('.tab-btn[data-screen="spin"]')?.click();
    });
  }

  function boot() {
    ensureUi();
    window.openGameRoom = openGameRoom;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();