// Minimal, dependency-free CFBD puller for Node 20+
import { mkdir, writeFile } from "node:fs/promises";

const CFBD_KEY = process.env.CFBD_API_KEY || process.env.CFBD_KEY;
if (!CFBD_KEY) {
  console.error("Missing CFBD_API_KEY secret.");
  process.exit(1);
}

const TEAM = process.env.TEAM || "Tennessee";
const YEAR = Number(process.env.YEAR) || new Date().getUTCFullYear();

const headers = { Authorization: `Bearer ${CFBD_KEY}` };
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

const toIso = (v) => {
  if (!v) return null;
  const t = new Date(v);
  return Number.isNaN(+t) ? null : t.toISOString();
};

function mapGame(g) {
  const isHome = g.home_team === TEAM;
  const opp = isHome ? g.away_team : g.home_team;

  // CFBD can return start_datetime or start_date; prefer full datetime
  const iso = toIso(g.start_datetime) || toIso(g.start_date);

  let result = "—";
  if (g.completed &&
      Number.isFinite(g.home_points) &&
      Number.isFinite(g.away_points)) {
    const ours = isHome ? g.home_points : g.away_points;
    const them = isHome ? g.away_points : g.home_points;
    result = `${ours}-${them}${g.conference_game ? " (conf)" : ""}`;
  }

  const tv = g.tv || g.broadcast || g.media || "TBD";
  const venue = g.venue?.name || g.venue || g.venue_name || "";

  return {
    date: iso || g.start_date || null,
    opponent: opp || "TBD",
    home: isHome,
    tv,
    result,
    _venue: venue, // internal; next.json will use a cleaner field
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
    venue: n._venue || "",
  };
}

(async () => {
  const raw = await getJson(url);
  const mapped = raw.map(mapGame)
                    .filter(r => r.opponent && r.date);

  const next = pickNext(mapped);

  await mkdir("data", { recursive: true });
  await writeFile("data/schedule.json", JSON.stringify(mapped, null, 2) + "\n");
  await writeFile("data/next.json", JSON.stringify(next, null, 2) + "\n");

  console.log(`Wrote ${mapped.length} games -> data/schedule.json`);
  console.log(`Wrote next game -> data/next.json`, next);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
