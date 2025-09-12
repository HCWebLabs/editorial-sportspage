// scripts/fetch-cfbd.mjs
// Fetch UT data from CFBD and write flat JSON + ICS your page reads.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) {
  console.error("Missing CFBD_API_KEY env var.");
  process.exit(1);
}

const YEAR = 2025;
const TEAM = "Tennessee";
const SEASON_TYPE = "regular";
const OUT_DIR = "data";
const CURRENT_DIR = path.join(OUT_DIR, "current");

async function ensureDirs() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(CURRENT_DIR, { recursive: true });
}

const BASE = "https://api.collegefootballdata.com";

async function get(rel) {
  const url = `${BASE}${rel}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} for ${url}\n${text}`);
  }
  return r.json();
}

async function writeJson(rel, obj) {
  const full = path.join(rel);
  await writeFile(full, JSON.stringify(obj, null, 2));
  console.log("wrote", full);
}

async function writeText(rel, text) {
  const full = path.join(rel);
  await writeFile(full, text, "utf8");
  console.log("wrote", full);
}

function pickOpponent(g) {
  const isHome = (g.home_team || "").includes("Tennessee");
  return isHome ? g.away_team : g.home_team;
}

function normalizeSchedule(games) {
  // CFBD `games` endpoint includes `start_date`—map to `start_time` your UI expects.
  return games.map(g => ({
    id: g.id,
    season: g.season,
    week: g.week,
    season_type: g.season_type,
    start_time: g.start_date,        // ISO string
    start_time_tbd: g.start_time_tbd,
    neutral_site: g.neutral_site,
    conference_game: g.conference_game,
    venue: g.venue || "",
    home_team: g.home_team,
    away_team: g.away_team,
    home_points: g.home_points ?? null,
    away_points: g.away_points ?? null,
    tv: g.tv || g.television || null,
    line: g.line ?? null,
    over_under: g.over_under ?? null
  }));
}

function findNextGame(sched) {
  const now = Date.now();
  const upcoming = sched
    .filter(g => g.start_time && !g.home_points && !g.away_points)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const next = upcoming.find(g => new Date(g.start_time).getTime() > now) || upcoming[0] || null;
  return next;
}

function gameForThisWeek(sched) {
  // “Current” game card: prefer a game in progress or this week; else null
  const now = Date.now();
  const inProgress = sched.find(g =>
    (g.home_points != null || g.away_points != null) &&
    new Date(g.start_time).getTime() <= now
  );
  if (inProgress) return inProgress;

  // same-week heuristic: +/- 4 days from today
  const start = now - 4 * 86400e3;
  const end   = now + 4 * 86400e3;
  const near  = sched.find(g => {
    const t = new Date(g.start_time).getTime();
    return t >= start && t <= end;
  });

  return near || null;
}

function icsForGame(g) {
  // Produce a simple UTC ICS for the next game (3h window).
  if (!g) return "";
  const isHome = (g.home_team || "").includes("Tennessee");
  const opp = isHome ? g.away_team : g.home_team;
  const title = `Tennessee vs ${opp}`;
  const dtStart = new Date(g.start_time);
  const dtEnd = new Date(dtStart.getTime() + 3 * 60 * 60 * 1000);

  const toUTC = d => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const uid = `ut-${g.id || Math.random().toString(36).slice(2)}@hcweb-labs`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HC Web Labs//UT Volunteers Gameday//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toUTC(new Date())}Z`,
    `DTSTART:${toUTC(dtStart)}Z`,
    `DTEND:${toUTC(dtEnd)}Z`,
    `SUMMARY:${title}`,
    `LOCATION:${(g.venue || "Neyland Stadium").replace(/\r?\n/g, " ")}`,
    "DESCRIPTION:Unofficial Gameday Hub",
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");
}

async function main() {
  await ensureDirs();

  // Schedule (full season)
  const rawSched = await get(`/games?year=${YEAR}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`);
  const schedule = normalizeSchedule(rawSched).sort((a, b) => (a.week || 0) - (b.week || 0));
  await writeJson(path.join(OUT_DIR, "ut_2025_schedule.json"), schedule);

  // “Current” game (this week / in progress)
  const curr = gameForThisWeek(schedule);
  await writeJson(path.join(CURRENT_DIR, "ut_game.json"), curr || {});

  // Rankings (latest snapshot; keep small)
  // CFBD returns many weeks if you only pass year—pick the last entry.
  const rankAll = await get(`/rankings?year=${YEAR}`).catch(() => []);
  const latest = Array.isArray(rankAll) ? rankAll[rankAll.length - 1] : null;
  await writeJson(path.join(CURRENT_DIR, "rankings.json"), latest || []);

  // Vegas lines for UT (may be empty)
  const lines = await get(`/lines?year=${YEAR}&team=${encodeURIComponent(TEAM)}`).catch(() => []);
  await writeJson(path.join(CURRENT_DIR, "ut_lines.json"), lines || []);

  // Meta
  const next = findNextGame(schedule);
  const meta = {
    lastUpdated: new Date().toISOString(),
    nextStart: next?.start_time || null,
    week: next?.week ?? (curr?.week ?? "—")
  };
  await writeJson(path.join(OUT_DIR, "meta_current.json"), meta);

  // ICS for “next” game under /data/
  const icsText = icsForGame(next);
  await writeText(path.join(OUT_DIR, "ut_next.ics"), icsText);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
