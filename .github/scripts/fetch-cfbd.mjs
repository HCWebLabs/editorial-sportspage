// Node 20+
// Fetch Tennessee Volunteers 2025 REGULAR season schedule and write /data.
// Writes: data/schedule.json, data/next.json

import fs from "node:fs/promises";
import path from "node:path";

const CFBD = process.env.CFBD_API_KEY;
const TEAM = process.env.TEAM || "Tennessee";        // CFBD uses school name: "Tennessee"
const YEAR = parseInt(process.env.YEAR || "2025", 10);
if (!CFBD) {
  console.error("Missing CFBD_API_KEY");
  process.exit(1);
}

const BASE = "https://api.collegefootballdata.com";
const headers = { Authorization: `Bearer ${CFBD}` };

async function get(endpoint, params = {}) {
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`CFBD ${endpoint} ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// Normalize a CFBD game row to the fields our site expects
function mapGame(g) {
  const isHome = g.home_team === TEAM;
  const opponent = isHome ? g.away_team : g.home_team;
  const dateISO = g.start_date || g.startDate || g.game_date || g.startTime || g.date;

  // venue fields vary a bit across CFBD payloads
  const venueName = g.venue?.name || g.venue || "";
  const venueCity = g.venue?.city || g.venue_city || "";
  const venueState = g.venue?.state || g.venue_state || "";

  return {
    date: dateISO,                       // ISO string
    opponent,
    home: isHome,
    tv: g.tv || g.broadcast || "",
    home_points: g.home_points ?? null,
    away_points: g.away_points ?? null,
    completed: !!g.completed,
    conference_game: !!g.conference_game,
    neutral_site: !!g.neutral_site,
    venue_name: venueName,
    venue_city: venueCity,
    venue_state: venueState,
  };
}

function computeStatus(row) {
  if (row.completed) return "final";
  const now = Date.now();
  const t = Date.parse(row.date);
  if (Number.isFinite(t)) {
    // treat within ~5h window as "in_progress" if any points present
    if (now >= t - 30 * 60 * 1000 && now <= t + 5 * 60 * 60 * 1000) {
      if (row.home_points != null || row.away_points != null) return "in_progress";
    }
    if (now < t) return "scheduled";
  }
  return "scheduled";
}

function byDateAsc(a, b) {
  return new Date(a.date) - new Date(b.date);
}
function byDateDesc(a, b) {
  return new Date(b.date) - new Date(a.date);
}

async function main() {
  // 1) REGULAR season only
  const games = await get("/games", {
    year: YEAR,
    seasonType: "regular",
    team: TEAM,
  });

  // Some CFBD mirrors can include bowl/post-season if you don't filter; we did.
  // Extra safety: only keep rows where our team actually appears.
  const rows = games
    .filter((g) => g.home_team === TEAM || g.away_team === TEAM)
    .map(mapGame)
    .sort(byDateAsc);

  // Write /data/schedule.json
  const dataDir = path.resolve("data");
  await fs.mkdir(dataDir, { recursive: true });
  const schedPath = path.join(dataDir, "schedule.json");
  const schedJSON = JSON.stringify(rows, null, 2) + "\n";
  await fs.writeFile(schedPath, schedJSON, "utf8");

  // 2) Determine "next" object (in_progress > upcoming > last_final)
  const now = Date.now();
  const inProgress = rows.find(
    (r) => computeStatus(r) === "in_progress"
  );
  const upcoming = rows
    .filter((r) => !r.completed && Date.parse(r.date) > now)
    .sort(byDateAsc)[0];
  const lastFinal = rows
    .filter((r) => r.completed)
    .sort(byDateDesc)[0];

  let next = null;
  if (inProgress) next = { ...inProgress, status: "in_progress" };
  else if (upcoming) next = { ...upcoming, status: "scheduled" };
  else if (lastFinal) next = { ...lastFinal, status: "final" };

  const nextPath = path.join(dataDir, "next.json");
  const nextJSON = JSON.stringify(next ?? null, null, 2) + "\n";
  await fs.writeFile(nextPath, nextJSON, "utf8");

  console.log(
    `Wrote ${rows.length} games to /data/schedule.json and ${
      next ? "1" : "null"
    } to /data/next.json`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
