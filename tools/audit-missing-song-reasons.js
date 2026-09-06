#!/usr/bin/env node
/*
 * Read-only audit: list every song entry that has a numeric `score` but no
 * non-empty `reason` (the "why this song fits" text shown in
 * renderSongDetails()/renderFocusedSong() in assets/js/songs.js).
 *
 * This never writes anything -- there is no mechanical way to generate
 * per-song fit rationale without fabricating content, so this is reported
 * for manual/editorial fill-in via the existing Studio / song details
 * editing workflow.
 *
 * Usage: node tools/audit-missing-song-reasons.js
 */
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "genres_data.json");
const SONG_LISTS = ["songs_listened", "pending_songs"];

function hasScore(song) {
  const s = song.score;
  return s !== undefined && s !== null && String(s).trim() !== "";
}

function hasReason(song) {
  return typeof song.reason === "string" && song.reason.trim() !== "";
}

function main() {
  const genres = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const missing = [];

  for (const genre of genres) {
    for (const listName of SONG_LISTS) {
      const list = genre[listName];
      if (!Array.isArray(list)) continue;
      for (const song of list) {
        if (hasScore(song) && !hasReason(song)) {
          missing.push({
            genre: genre.genre,
            list: listName,
            title: song.title,
            artist: song.artist,
            role: song.role || "",
            score: song.score,
          });
        }
      }
    }
  }

  console.log(`Songs with a score but no reason: ${missing.length}`);
  for (const m of missing) {
    console.log(
      `  [${m.genre}] "${m.title}" - ${m.artist} (role=${m.role || "?"}, score=${m.score}, list=${m.list})`,
    );
  }

  if (missing.length) {
    console.log(
      "\nThese need manual/editorial fit-rationale text via the existing " +
        "song details editing workflow -- this script intentionally does " +
        "not fabricate reason text.",
    );
  }
}

main();
