// scripts/fetch-cfbd.mjs
// Pull CFBD data and write the flat JSON your page reads.
// Uses Node 20's built-in fetch (no dependencies).

import fs from "node:fs/promises";
import path from "node:path";

// ---- Config ----
const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) {
  console.error("Missing CFBD_API_KEY GitHub Secret.");
  process.exit(1);
}

const OUT    = "data";       // output folder
const SEASON = 2025;         // target season
const TEAM   = "Tennessee";  // UT

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
};

// ---- Helpers ----
async function get(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${url}\n${txt}`);
  }
  return r.json();
}

async function write(rel, obj) {
  const abs = path.join(OUT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(obj, null, 2));
  console.log("wrote", rel);
}

// Normalize one CFBD game → the minimal shape the UI expects
function cleanGame(g) {
  const iso = g.start_date || g.startTime || g.date || null; // CFBD often returns start_date
  const hasTime = iso && /T\d{2}:\d{2}/.test(iso);
  return {
    id: g.id,
    week: g.week,
    start_time: hasTime ? iso : null,             // full ISO if known
    start_date: iso ? String(iso).slice(0, 10) : null, // YYYY-MM-DD
    home_team: g.home_team,
    away_team: g.away_team,
    home_points: g.home_points ?? null,
    away_points: g.away_points ?? null,
    status: g.status ?? null,
    tv: g.tv ?? g.television ?? null,
    venue: g.venue ?? null,
    neutral_site: !!(g.neutral_site ?? g.neutral ?? false),
  };
}

async function main() {
  // 1) meta_current.json (week can be refined later)
  const lastUpdated = new Date().toISOString();
  await write("meta_current.json", { season: SEASON, week: 3, lastUpdated });

  // 2) UT schedule (regular season)
  const schedRaw = await get(
    `https://api.collegefootballdata.com/games?year=${SEASON}&team=${encodeURIComponent(
      TEAM
    )}&seasonType=regular`
  );
  const sched = schedRaw.map(cleanGame).sort((a, b) => {
    const aIso = a.start_time || (a.start_date && `${a.start_date}T00:00:00Z`) || "";
    const bIso = b.start_time || (b.start_date && `${b.start_date}T00:00:00Z`) || "";
    return new Date(aIso) - new Date(bIso);
  });
  await write("ut_2025_schedule.json", sched);

  // 3) Rankings (AP / Coaches)
  const ranks = await get(
    `https://api.collegefootballdata.com/rankings?year=${SEASON}`
  );
  await write("current/rankings.json", ranks);

  // 4) Odds/Lines (store whatever returns; UI reads first provider)
  const lines = await get(
    `https://api.collegefootballdata.com/lines?year=${SEASON}&team=${encodeURIComponent(
      TEAM
    )}&seasonType=regular`
  );
  await write("current/ut_lines.json", lines);

  // 5) Optional seed for places (create once if missing)
  try {
    await fs.access(path.join(OUT, "manual/places_knoxville.json"));
  } catch {
    await write("manual/places_knoxville.json", [
      { name: "Market Square", tip: "Post-game eats." }
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
