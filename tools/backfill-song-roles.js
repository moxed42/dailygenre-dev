#!/usr/bin/env node
/*
 * One-time retroactive pass: tag every song entry in genres_data.json with
 * one of the 6 role tags (CANON, MEDIA, SEMINAL, LEVEL UP, ROUTED, ADD),
 * and stamp a numeric fit score on any ROUTED (pending) entry that is
 * missing one. Safe to re-run -- it only fills in missing/non-conforming
 * values, it never overwrites an already-correct tag or score.
 *
 * Usage: node tools/backfill-song-roles.js [--write]
 * Without --write it only reports what it would change.
 */
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "genres_data.json");
const ROLE_TAGS = ["CANON", "MEDIA", "SEMINAL", "LEVEL UP", "ROUTED", "ADD"];
const WRITE = process.argv.includes("--write");

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function matchesSeminal(song, seminal) {
  if (!song || !seminal) return false;
  const su = norm(song.url || song.spotifyUrl);
  const wu = norm(seminal.url || seminal.spotifyUrl);
  if (su && wu && su === wu) return true;
  const st = norm(song.title), sa = norm(song.artist);
  const wt = norm(seminal.title), wa = norm(seminal.artist);
  return !!st && !!sa && st === wt && sa === wa;
}

function roleFor(song, genre) {
  const existing = String(song.role || "").trim().toUpperCase();
  if (ROLE_TAGS.includes(existing)) return existing;

  if (song.isPending) return "ROUTED";

  const rawUrl = String(song.url || "");
  const isLevelUp = !!song.isLevelUp || /^(?:🔼\s*)?LEVEL\s*UP:\s*/i.test(rawUrl);
  const isAdd = !!song.isAdd || /^(?:🔼\s*)?ADD:\s*/i.test(rawUrl);
  if (isLevelUp) return "LEVEL UP";

  if (song.isIdentityTrack) {
    const seminal = genre?.identity?.seminalTrack;
    return matchesSeminal(song, seminal) ? "SEMINAL" : "MEDIA";
  }

  if (isAdd) return "ADD";
  return "CANON";
}

function main() {
  const genres = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const counts = { CANON: 0, MEDIA: 0, SEMINAL: 0, "LEVEL UP": 0, ROUTED: 0, ADD: 0 };
  let changed = 0;
  let fitBackfilled = 0;

  for (const genre of genres) {
    const stampAll = (song) => {
      if (!song) return;
      const before = song.role;
      song.role = roleFor(song, genre);
      if (song.role !== before) changed++;
      counts[song.role] = (counts[song.role] || 0) + 1;
      if (song.role === "ROUTED" && song.nominatedFit == null && song.originFit != null) {
        song.nominatedFit = Number(song.originFit);
        fitBackfilled++;
      }
      if (song.levelUp) stampAll(song.levelUp);
    };
    (genre.songs_listened || []).forEach(stampAll);
    (genre.pending_songs || []).forEach(stampAll);
  }

  console.log("Role counts:", counts);
  console.log(`Entries with a role added/corrected: ${changed}`);
  console.log(`ROUTED entries backfilled with a fit score: ${fitBackfilled}`);

  if (WRITE) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(genres));
    console.log(`Wrote ${DATA_PATH}`);
  } else {
    console.log("Dry run only -- pass --write to persist changes.");
  }
}

main();
