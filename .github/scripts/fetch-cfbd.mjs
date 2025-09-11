// Fetch Tennessee 2025 data from CFBD and write to /data
// Usage: node .github/scripts/fetch-cfbd.mjs
// Env: CFBD_API_KEY (secret), TEAM (default "Tennessee"), YEAR (default current)

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API = "https://api.collegefootballdata.com";
const TEAM = process.env.TEAM || "Tennessee";
const YEAR = Number(process.env.YEAR || new Date().getFullYear());
const OUT_DIR = path.resolve("data");

const headers = {
  "Authorization": `Bearer ${process.env.CFBD_API_KEY ?? ""}`,
  "Accept": "application/json",
};

function qs(params = {}) {
  const u = new URL(API);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
  });
  return `?${u.searchParams.toString()}`; // only the query string
}

async function api(pathname, params = {}) {
  const url = `${API}${pathname}${qs(params)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CFBD ${res.status} ${res.statusText} :: ${pathname}\n${text.slice(0, 400)}`);
  }
  return res.json();
}

function asISO(dateStr) {
  // CFBD returns UTC-ish timestamps. Keep canonical ISO so the client can format in the viewer's TZ.
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d) ? null : d.toISOString();
}

function mkResult({ is_home, home_points, away_points }) {
  const hp = Number(home_points);
  const ap = Number(away_points);
  if (!Number.isFinite(hp) || !Number.isFinite(ap)) return null;
  const us = is_home ? hp : ap;
  const them = is_home ? ap : hp;
  const wl = us > them ? "W" : us < them ? "L" : "T";
  return `${wl} ${us}-${them}`;
}

function cleanTV(tv) {
  if (!tv) return null;
  if (Array.isArray(tv)) return tv.filter(Boolean).join(", ");
  return String(tv);
}

async function main() {
  if (!process.env.CFBD_API_KEY) {
    throw new Error("Missing CFBD_API_KEY");
  }

  await mkdir(OUT_DIR, { recursive: true });

  // 1) Regular-season schedule for TEAM & YEAR
  const games = await api("/games", {
    year: YEAR,
    team: TEAM,
    seasonType: "regular",
  });

  // Normalize → schedule.json (what the site expects)
  const schedule = (Array.isArray(games) ? games : [])
    .map(g => {
      const is_home = g.home_team === TEAM;
      const opponent = is_home ? g.away_team : g.home_team;

      const row = {
        id: g.id,
        year: g.season,
        week: g.week,
        date: asISO(g.start_date),
        is_home,
        opponent,                // <— added for convenience (JS will still join defensively)
        tv: cleanTV(g.tv),
        venue: g.venue || null,  // keep a single string; client shows verbatim
        notes: g.notes ?? null,
        completed: Number.isFinite(g.home_points) && Number.isFinite(g.away_points),
        home_points: g.home_points ?? null,
        away_points: g.away_points ?? null,
      };

      // Precompute 'result' to simplify rendering
      row.result = mkResult(row);
      return row;
    })
    .sort((a, b) => (new Date(a.date)) - (new Date(b.date)));

  // 2) Identify "next" (in-progress or the nearest future not completed)
  const now = Date.now();
  const inProgressOrUpcoming = schedule.filter(g => !g.completed && g.date);
  let next = null;

  // If we’re within a 6h window after kick, treat it as “current”
  const SIX_H = 6 * 60 * 60 * 1000;
  const candidates = inProgressOrUpcoming
    .map(g => ({ g, t: +new Date(g.date) }))
    .filter(({ t }) => isFinite(t) && t >= now - SIX_H)
    .sort((a, b) => a.t - b.t);

  if (candidates.length) next = candidates[0].g;

  // 3) Records (optional, used by the Rank/record card if you add it later)
  let records = null;
  try {
    const rec = await api("/records", { year: YEAR, team: TEAM });
    records = Array.isArray(rec) && rec.length ? rec[0] : null;
  } catch (_) {
    // Don't fail the job if records are temporarily unavailable
  }

  // 4) Scoreboard stub (optional; safe default)
  const scoreboard = next ? {
    startTime: next.date,
    startTimeTBD: false,
    venue: next.venue || "",
    tv: next.tv || "",
    status: "",      // "", "in_progress", "final", etc. — fill if you later poll a live endpoint
    clock: "",
    period: 0,
    homeTeam: {
      name: next.is_home ? TEAM : next.opponent,
      points: next.is_home ? next.home_points : next.away_points,
    },
    awayTeam: {
      name: next.is_home ? next.opponent : TEAM,
      points: next.is_home ? next.away_points : next.home_points,
    },
    lastUpdated: new Date().toISOString(),
  } : { lastUpdated: new Date().toISOString() };

  // 5) Write files
  const writeJSON = (name, data) =>
    writeFile(path.join(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n");

  await Promise.all([
    writeJSON("schedule.json", schedule),
    writeJSON("next.json", next ?? null),
    writeJSON("records.json", records ?? {}),
    writeJSON("scoreboard.json", scoreboard),
    writeJSON("meta.json", { updated_at: new Date().toISOString() }),
  ]);

  console.log(`Wrote data for ${TEAM} ${YEAR}. Games: ${schedule.length}. Next: ${next ? next.opponent : "none"}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
