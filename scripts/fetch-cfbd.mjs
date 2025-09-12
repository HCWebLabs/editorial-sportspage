/**
 * CFBD data pull → writes flat JSON your site reads.
 * Run with Node 18/20 (global fetch available).
 *
 * Env:
 *  - CFBD_API_KEY (required)
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) {
  console.error("ERROR: CFBD_API_KEY is not set.");
  process.exit(1);
}

// ---- Config ----
const SEASON = 2025;
const TEAM = "Tennessee";
const SEASON_TYPE = "regular";

// Paths relative to repo root (workflow runs at repo root)
const DATA_DIR = "data";
const CURRENT_DIR = path.join(DATA_DIR, "current");

// ---------- utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function readIfExists(p) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); }
  catch { return null; }
}

async function writeJson(relPath, obj) {
  const full = path.resolve(relPath);
  await ensureDir(path.dirname(full));
  const next = JSON.stringify(obj, null, 2) + "\n";
  const prev = await fs.readFile(full, "utf8").catch(() => null);
  if (prev === next) {
    console.log("unchanged:", relPath);
    return false; // no diff
  }
  await fs.writeFile(full, next, "utf8");
  console.log("wrote", relPath);
  return true;
}

async function getWithRetry(url, { tries = 6, init = {} } = {}) {
  let attempt = 0;
  while (true) {
    attempt++;
    const r = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    if (r.status === 429) {
      const ra = r.headers.get("retry-after");
      const wait = ra ? (Number(ra) * 1000) : Math.min(30000, attempt * 2000);
      console.warn(`[429] ${url} — retrying in ${wait}ms (attempt ${attempt}/${tries})`);
      if (attempt >= tries) throw new Error(`429 after ${tries} tries: ${url}`);
      await sleep(wait);
      continue;
    }

    if (r.status >= 500) {
      const wait = Math.min(30000, attempt * 2000);
      console.warn(`[${r.status}] ${url} — retrying in ${wait}ms (attempt ${attempt}/${tries})`);
      if (attempt >= tries) throw new Error(`${r.status} after ${tries} tries: ${url}`);
      await sleep(wait);
      continue;
    }

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} for ${url} => ${text}`);
    }

    return r.json();
  }
}

// ---------- Normalizers ----------
const pick = (o, ...ks) => ks.find(k => o?.[k] != null) ? o[ks.find(k => o?.[k] != null)] : null;
const onlyDate = (iso) => (iso ? String(iso).slice(0,10) : null);

function normalizeGame(g) {
  // Accept many possible kickoff fields and produce {start_time | start_date}
  const raw = pick(g, "start_time","startTime","start_date","startDate","date","game_date","gameDate");
  const hasTime = raw && /T\d{2}:\d{2}/.test(raw);

  return {
    id: g.id ?? null,
    week: g.week ?? null,
    start_time: hasTime ? raw : null,
    start_date: hasTime ? onlyDate(raw) : (raw ? String(raw) : null),

    home_team: pick(g, "home_team","homeTeam","home") ?? "",
    away_team: pick(g, "away_team","awayTeam","away") ?? "",

    home_points: pick(g, "home_points","homePoints") ?? null,
    away_points: pick(g, "away_points","awayPoints") ?? null,

    status: g.status ?? null,
    tv: pick(g, "tv","television") ?? null,
    venue: g.venue ?? null,
    neutral_site: !!pick(g, "neutral_site","neutral"),
  };
}

function kickoffIsoFromGame(g) {
  if (g.start_time) return g.start_time;
  if (g.start_date) return `${g.start_date}T16:00:00Z`; // assume noon ET if date only
  return null;
}

// Choose “current/next” game: first future by kickoff timestamp; fallback to nearest by week
function pickNextGame(sched, metaWeek) {
  const now = Date.now();
  const withTs = sched
    .map(g => ({ g, t: kickoffIsoFromGame(g) ? new Date(kickoffIsoFromGame(g)).getTime() : null }))
    .filter(x => x.t != null)
    .sort((a,b) => a.t - b.t);

  const future = withTs.find(x => x.t > now)?.g;
  if (future) return future;

  // No future with timestamp: fallback by week using metaWeek
  if (metaWeek != null) {
    const nxt = sched.find(g => (g.week ?? 0) >= metaWeek);
    if (nxt) return nxt;
  }
  // Otherwise first entry
  return sched[0] ?? null;
}

// ---------- Main ----------
async function main() {
  let wroteAnything = false;

  // meta (always write)
  const meta = {
    season: SEASON,
    week: null,          // we’ll set after we see schedule dates
    lastUpdated: new Date().toISOString(),
  };

  // ---- schedule ----
  const gamesUrl = `https://api.collegefootballdata.com/games?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`;
  let rawSched = [];
  try {
    rawSched = await getWithRetry(gamesUrl);
  } catch (e) {
    console.error("Failed to fetch games:", e.message);
  }

  let sched = [];
  if (Array.isArray(rawSched) && rawSched.length) {
    sched = rawSched.map(normalizeGame).sort((a,b) => {
      const ai = kickoffIsoFromGame(a) || "2100-01-01T00:00:00Z";
      const bi = kickoffIsoFromGame(b) || "2100-01-01T00:00:00Z";
      return new Date(ai) - new Date(bi);
    });

    // Derive week if not provided by CFBD
    const minW = Math.min(...sched.map(g => g.week ?? 999).filter(n => n !== 999));
    meta.week = Number.isFinite(minW) ? minW : null;

    wroteAnything |= await writeJson(path.join(DATA_DIR, "ut_2025_schedule.json"), sched);
  } else {
    console.warn("CFBD returned empty schedule; preserving existing data.");
  }

  // ---- rankings ----
  const rankingsUrl = `https://api.collegefootballdata.com/rankings?year=${SEASON}`;
  try {
    const ranks = await getWithRetry(rankingsUrl);
    if (Array.isArray(ranks)) {
      wroteAnything |= await writeJson(path.join(CURRENT_DIR, "rankings.json"), ranks);
    } else {
      console.warn("Rankings shape not array; skipping write.");
    }
  } catch (e) {
    console.error("Failed to fetch rankings:", e.message);
  }

  // ---- lines ----
  const linesUrl = `https://api.collegefootballdata.com/lines?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`;
  try {
    const lines = await getWithRetry(linesUrl);
    if (Array.isArray(lines) && lines.length) {
      wroteAnything |= await writeJson(path.join(CURRENT_DIR, "ut_lines.json"), lines);
    } else {
      console.warn("Lines empty; preserving existing ut_lines.json");
    }
  } catch (e) {
    console.error("Failed to fetch lines:", e.message);
  }

  // ---- current / next game (derived from schedule) ----
  try {
    const existingSched = sched.length
      ? sched
      : (await readIfExists(path.join(DATA_DIR, "ut_2025_schedule.json"))) || [];
    const weekForPick = meta.week ??
      (await readIfExists(path.join(DATA_DIR, "meta_current.json")))?.week ?? null;

    if (Array.isArray(existingSched) && existingSched.length) {
      const currentGame = pickNextGame(existingSched, weekForPick);
      if (currentGame) {
        wroteAnything |= await writeJson(path.join(CURRENT_DIR, "ut_game.json"), currentGame);
      }
    }
  } catch (e) {
    console.error("Failed to write current game:", e.message);
  }

  // ---- meta (last) ----
  try {
    wroteAnything |= await writeJson(path.join(DATA_DIR, "meta_current.json"), meta);
  } catch (e) {
    console.error("Failed to write meta_current.json:", e.message);
  }

  if (!wroteAnything) {
    console.log("No data changes to commit.");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
