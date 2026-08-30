const test = require("node:test");
const assert = require("node:assert/strict");

const {
  nextReaction,
  parseInlineReactionCall,
  repaint,
} = require("../assets/js/song-reaction.js");

function fakeClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
      return Boolean(force);
    },
  };
}

function fakeGroup(className) {
  const children = [];
  const classList = fakeClassList([className]);
  return {
    classList,
    children,
    querySelector(selector) {
      return children.find((child) =>
        selector.split(",").some((part) =>
          child.className === part.trim().replace(/^\./, ""),
        ),
      ) || null;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
  };
}

function fakeButton({ className, onclick, group }) {
  const attributes = { onclick };
  return {
    dataset: {},
    classList: fakeClassList([className]),
    getAttribute(name) {
      return attributes[name] || "";
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    closest() {
      return group;
    },
    attributes,
  };
}

function fakeDocument(buttons) {
  return {
    nodeType: 9,
    querySelectorAll() {
      return buttons;
    },
    createElement() {
      return {
        className: "",
        textContent: "",
      };
    },
  };
}

test("reaction toggle returns the requested value or clears the active value", () => {
  assert.equal(nextReaction(null, 3), 3);
  assert.equal(nextReaction(2, 3), 3);
  assert.equal(nextReaction(3, 3), null);
  assert.equal(nextReaction(3, 99), null);
});

test("inline parser recognizes standard and focused reaction handlers", () => {
  assert.deepEqual(
    parseInlineReactionCall("setSongReaction('abc%20123', 3)"),
    { encodedKey: "abc%20123", value: 3 },
  );
  assert.deepEqual(
    parseInlineReactionCall(
      "event.stopPropagation(); setSongReaction('child%3A4', 1)",
    ),
    { encodedKey: "child%3A4", value: 1 },
  );
  assert.equal(parseInlineReactionCall("makeSongFavorite('abc')"), null);
});

test("repaint updates standard and focused controls for only one song key", () => {
  const standardGroup = fakeGroup("song-quick-actions");
  const focusGroup = fakeGroup("song-focus-actions");
  const standardThree = fakeButton({
    className: "song-reaction-btn",
    onclick: "setSongReaction('song-a', 3)",
    group: standardGroup,
  });
  const standardTwo = fakeButton({
    className: "song-reaction-btn",
    onclick: "setSongReaction('song-a', 2)",
    group: standardGroup,
  });
  const focusThree = fakeButton({
    className: "song-focus-reaction",
    onclick: "event.stopPropagation(); setSongReaction('song-a', 3)",
    group: focusGroup,
  });
  const other = fakeButton({
    className: "song-focus-reaction",
    onclick: "event.stopPropagation(); setSongReaction('song-b', 3)",
    group: focusGroup,
  });
  const documentRef = fakeDocument([
    standardThree,
    standardTwo,
    focusThree,
    other,
  ]);

  const result = repaint(documentRef, "song-a", 3);

  assert.equal(result.repainted, true);
  assert.equal(result.matchedControls, 3);
  assert.equal(standardThree.classList.contains("active"), true);
  assert.equal(standardTwo.classList.contains("active"), false);
  assert.equal(focusThree.classList.contains("active"), true);
  assert.equal(other.classList.contains("active"), false);
  assert.equal(standardThree.attributes["aria-pressed"], "true");
  assert.equal(standardTwo.attributes["aria-pressed"], "false");
});

test("repaint adds one unsaved badge per reaction group", () => {
  const group = fakeGroup("song-focus-actions");
  const buttons = [1, 2, 3].map((value) =>
    fakeButton({
      className: "song-focus-reaction",
      onclick: `setSongReaction('song-a', ${value})`,
      group,
    }),
  );
  const documentRef = fakeDocument(buttons);

  const first = repaint(documentRef, "song-a", 2);
  const second = repaint(documentRef, "song-a", 1);

  assert.equal(first.groupsUpdated, 1);
  assert.equal(second.groupsUpdated, 0);
  assert.equal(group.children.length, 1);
  assert.equal(group.children[0].className, "song-focus-unsaved");
});

test("repaint reports a clean miss so the app can use its render fallback", () => {
  const documentRef = fakeDocument([]);

  assert.deepEqual(repaint(documentRef, "missing", 3), {
    repainted: false,
    matchedControls: 0,
    groupsUpdated: 0,
  });
});
