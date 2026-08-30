/* Daily Genre v246.2: focused song-reaction DOM repaint helper. */

(function dailyGenreSongReactionModule(globalScope) {
  "use strict";

  function normalizeReaction(value) {
    const numeric = Number(value);
    return [1, 2, 3].includes(numeric) ? numeric : null;
  }

  function nextReaction(current, requested) {
    const normalized = normalizeReaction(requested);
    return Number(current) === normalized ? null : normalized;
  }

  function parseInlineReactionCall(text) {
    const source = String(text || "");
    const match = source.match(
      /(?:window\.)?(?:dcNoJumpSetSongReaction|setSongReaction)\s*\(\s*(["'])(.*?)\1\s*,\s*([123])(?:\s*,[^)]*)?\)/,
    );
    if (!match) return null;
    return {
      encodedKey: match[2],
      value: Number(match[3]),
    };
  }

  function controlMetadata(button) {
    if (!button) return null;

    const dataset = button.dataset || {};
    const encodedKey = String(
      dataset.songReactionKey ||
      dataset.reactionKey ||
      "",
    );
    const value = normalizeReaction(
      dataset.songReactionValue ||
      dataset.reactionValue ||
      dataset.reaction,
    );

    if (encodedKey && value) {
      return { encodedKey, value };
    }

    return parseInlineReactionCall(button.getAttribute?.("onclick") || "");
  }

  function groupForButton(button) {
    if (!button?.closest) return null;
    return button.closest(".song-quick-actions, .song-focus-actions");
  }

  function existingUnsavedBadge(group) {
    if (!group?.querySelector) return null;
    return group.querySelector(
      ".song-reaction-unsaved, .song-focus-unsaved",
    );
  }

  function ensureUnsavedBadge(group, documentRef) {
    if (!group) return false;
    if (existingUnsavedBadge(group)) return false;
    if (!documentRef?.createElement) return false;

    const badge = documentRef.createElement("span");
    const isFocusGroup = group.classList?.contains?.("song-focus-actions");
    badge.className = isFocusGroup
      ? "song-focus-unsaved"
      : "song-reaction-unsaved";
    badge.textContent = "Unsaved";
    group.appendChild?.(badge);
    return true;
  }

  function repaint(root, encodedKey, reaction) {
    if (!root?.querySelectorAll) {
      return {
        repainted: false,
        matchedControls: 0,
        groupsUpdated: 0,
      };
    }

    const requestedKey = String(encodedKey || "");
    const activeReaction = normalizeReaction(reaction);
    const controls = Array.from(
      root.querySelectorAll(
        ".song-reaction-btn, .song-focus-reaction, [data-song-reaction-key]",
      ),
    );
    const groups = new Set();
    let matchedControls = 0;

    controls.forEach((button) => {
      const metadata = controlMetadata(button);
      if (!metadata || metadata.encodedKey !== requestedKey) return;

      const isActive =
        activeReaction != null &&
        metadata.value === activeReaction;

      button.classList?.toggle?.("active", isActive);
      button.classList?.toggle?.("is-active", isActive);
      button.setAttribute?.("aria-pressed", isActive ? "true" : "false");

      matchedControls += 1;
      const group = groupForButton(button);
      if (group) groups.add(group);
    });

    const documentRef =
      root.nodeType === 9
        ? root
        : root.ownerDocument || globalScope?.document || null;
    let groupsUpdated = 0;

    groups.forEach((group) => {
      if (ensureUnsavedBadge(group, documentRef)) groupsUpdated += 1;
    });

    return {
      repainted: matchedControls > 0,
      matchedControls,
      groupsUpdated,
    };
  }

  const api = {
    normalizeReaction,
    nextReaction,
    parseInlineReactionCall,
    controlMetadata,
    repaint,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.DailyGenreSongReaction = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
