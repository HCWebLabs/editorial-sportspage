// scripts/fetch-cfbd.mjs
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) throw new Error("Missing CFBD_API_KEY");

const OUT = "data";
const SEASON = 2025;
const TEAM  = "Tennessee";
const CONF  = "SEC";

const headers = { Authorization: `Bearer ${API_KEY}` };

async function get(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function write(rel, obj) {
  const abs = path.join(OUT, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(obj, null, 2));
  console.log("wrote", rel);
}

/* ---------- normalize schedule ---------- */
function cleanGame(g) {
  const iso = g.start_date || g.startTime || g.date || null; // CFBD often provides start_date
  const hasTime = iso && /T\d{2}:\d{2}/.test(iso);
  return {
    id: g.id,
    week: g.week,
    start_time: hasTime ? iso : null,
    start_date: iso ? String(iso).slice(0,10) : null,
    home_team: g.home_team,
    away_team: g.away_team,
    home_points: g.home_points ?? null,
    away_points: g.away_points ?? null,
    status: g.status ?? null,
    tv: g.tv ?? g.television ?? null,
    venue: g.venue ?? null,
    neutral_site: !!(g.neutral_site ?? g.neutral ?? false)
  };
}

async function main() {
  // Meta (you can fill week from CFBD /games/week or /calendar if you like)
  const lastUpdated = new Date().toISOString();
  await write("meta_current.json", { season: SEASON, week: 3, lastUpdated });

  // Schedule – filter to UT only for the season
  const schedRaw = await get(`https://api.collegefootballdata.com/games?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=regular`);
  const sched = schedRaw.map(cleanGame).sort((a,b) => {
    const aIso = a.start_time || (a.start_date && `${a.start_date}T00:00:00Z`) || "";
    const bIso = b.start_time || (b.start_date && `${b.start_date}T00:00:00Z`) || "";
    return new Date(aIso) - new Date(bIso);
  });
  await write("ut_2025_schedule.json", sched);

  // Rankings – pass-through
  const ranks = await get(`https://api.collegefootballdata.com/rankings?year=${SEASON}`);
  await write("current/rankings.json", ranks);

  // Odds – choose a provider or just store whatever comes back
  const lines = await get(`https://api.collegefootballdata.com/lines?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=regular`);
  await write("current/ut_lines.json", lines);

  // Optional: seed places file on first run
  try {
    await fs.access(path.join(OUT, "manual/places_knoxville.json"));
  } catch {
    await write("manual/places_knoxville.json", [
      { name: "Market Square", tip: "Post-game eats." }
    ]);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
