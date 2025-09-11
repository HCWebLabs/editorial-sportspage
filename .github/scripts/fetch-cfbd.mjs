// .github/scripts/fetch-cfbd.mjs
import { mkdir, writeFile } from "node:fs/promises";

const CFBD_KEY = process.env.CFBD_KEY;
if (!CFBD_KEY) {
  console.error("Missing CFBD_KEY secret.");
  process.exit(1);
}

const TEAM = process.env.TEAM || "Tennessee";
const YEAR = Number(process.env.YEAR) || new Date().getUTCFullYear();

const headers = { Authorization: `Bearer ${CFBD_KEY}` };

// CFBD docs: /games supports seasonType=both and returns start_date/start_time_tbd/start_datetime (when available)
const base = "https://api.collegefootballdata.com";
const url  = `${base}/games?year=${YEAR}&seasonType=both&team=${encodeURIComponent(TEAM)}`;

async function getJson(u) {
  const r = await fetch(u, { headers });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`CFBD ${r.status} — ${text || r.statusText}`);
  }
  return r.json();
}

function toIso(input) {
  // prefer start_datetime if present; fall back to start_date (midnight local-ish)
  if (!input) return null;
  try { return new Date(input).toISOString(); } catch { return null; }
}

function mapGame(g) {
  // home = true if TEAM is the home team
  const isHome = g.home_team === TEAM;
  const opp = isHome ? g.away_team : g.home_team;

  // best-effort datetime (CFBD varies by record)
  const iso = toIso(g.start_datetime) || toIso(g.start_date);

  // result, if final
  let result = "—";
  if (g.completed && Number.isFinite(g.home_points) && Number.isFinite(g.away_points)) {
    const ours  = isHome ? g.home_points : g.away_points;
    const them  = isHome ? g.away_points : g.home_points;
    result = `${ours}-${them}${g.conference_game ? " (conf)" : ""}`;
  }

  return {
    date: iso || g.start_date || null,
    opponent: opp || "TBD",
    home: isHome,
    tv: g.tv || g.broadcast || g.venue?.name || "TBD",
    result
  };
}

function pickNext(games) {
  const now = Date.now();
  const future = games
    .map(g => ({ g, t: g.date ? Date.parse(g.date) : NaN }))
    .filter(x => Number.isFinite(x.t) && x.t >= now)
    .sort((a,b) => a.t - b.t);

  if (!future.length) return null;
  const n = future[0].g;
  return {
    date: n.date,
    opponent: n.opponent,
    home: n.home,
    venue: "Neyland Stadium" // optional; replace if you capture venue above
  };
}

(async () => {
  const raw = await getJson(url);

  const mapped = raw.map(mapGame)
    // keep only records that at least have an opponent and date (or label)
    .filter(r => r.opponent && r.date);

  const next = pickNext(mapped);

  await mkdir("data", { recursive: true });
  await writeFile("data/schedule.json", JSON.stringify(mapped, null, 2) + "\n");
  await writeFile("data/next.json", JSON.stringify(next, null, 2) + "\n");

  console.log(`Wrote ${mapped.length} games to data/schedule.json`);
  console.log(`Wrote next game to data/next.json`, next);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
