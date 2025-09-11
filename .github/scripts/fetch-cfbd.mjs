// Fetch Tennessee 2025 schedule + next game from CFBD and write to /data
// Usage (in GH Actions): node .github/scripts/fetch-cfbd.mjs
import fs from "node:fs/promises";

const API = "https://api.collegefootballdata.com";
const TEAM = process.env.TEAM || "Tennessee";
const YEAR = Number(process.env.YEAR || 2025);
const KEY = (process.env.CFBD_API_KEY || "").trim();

if (!KEY) {
  console.error("Missing CFBD_API_KEY.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: "application/json",
};

async function getJSON(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CFBD ${url.pathname} ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

function mapGame(g) {
  const isHome = g.home_team === TEAM;
  const opp = isHome ? g.away_team : g.home_team;

  const havePts = Number.isFinite(g.home_points) && Number.isFinite(g.away_points);
  const win =
    havePts &&
    ((isHome && g.home_points > g.away_points) || (!isHome && g.away_points > g.home_points));

  const date = g.start_date || g.startDate || g.start_time || g.date || null;

  return {
    id: g.id ?? `${YEAR}-${g.week}-${opp}`,
    year: g.season ?? YEAR,
    week: g.week ?? null,
    date, // ISO string
    is_home: isHome,
    home: g.home_team,
    away: g.away_team,
    opponent: opp,
    tv: g.tv ?? g.tv_coverage ?? null,
    venue: g.venue ?? null,
    notes: g.notes ?? null,
    completed: !!g.completed,
    home_points: g.home_points ?? null,
    away_points: g.away_points ?? null,
    result: havePts ? (win ? "W" : "L") : null,
  };
}

async function main() {
  // Regular season only; the site is scoped to that
  const games = await getJSON("/games", {
    year: YEAR,
    seasonType: "regular",
    team: TEAM,
  });

  const mapped = games.map(mapGame).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Next = first game in the future (or last played if season is over)
  const now = new Date();
  let next = mapped.find((g) => g.date && new Date(g.date) >= now && !g.completed) || null;
  if (!next && mapped.length) next = mapped[mapped.length - 1];

  await fs.writeFile("data/schedule.json", JSON.stringify(mapped, null, 2));
  await fs.writeFile("data/next.json", JSON.stringify(next, null, 2));
  await fs.writeFile("data/meta.json", JSON.stringify({ updated_at: new Date().toISOString() }, null, 2));

  console.log(`Wrote schedule: ${mapped.length} games. Next: ${next ? next.opponent : "none"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
