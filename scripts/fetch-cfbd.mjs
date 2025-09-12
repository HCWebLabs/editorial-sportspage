// scripts/fetch-cfbd.mjs
// Pulls UT data from CFBD and writes flat JSON + an ICS file your page reads.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) {
  console.error("Missing CFBD_API_KEY");
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
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}\n${await r.text().catch(()=>"")}`);
  return r.json();
}

async function wjson(file, data) {
  await writeFile(file, JSON.stringify(data, null, 2));
  console.log("wrote", file);
}
async function wtext(file, text) {
  await writeFile(file, text, "utf8");
  console.log("wrote", file);
}

function safeISO(g) {
  // CFBD uses start_date; be liberal in what we accept.
  return (
    g.start_date ||
    g.startDate ||
    g.start_time ||
    g.startTime ||
    null
  );
}

function normalizeSchedule(raw) {
  return raw.map(g => {
    const iso = safeISO(g);
    // venue can be empty from API; default sensibly for home games
    const isHome = String(g.home_team || "").includes("Tennessee");
    const venue = g.venue || (isHome ? "Neyland Stadium" : "");
    return {
      id: g.id,
      season: g.season,
      week: g.week,
      season_type: g.season_type,
      start_time: iso,                 // <— what the site expects
      start_time_tbd: g.start_time_tbd ?? false,
      neutral_site: g.neutral_site ?? false,
      conference_game: g.conference_game ?? false,
      venue,
      home_team: g.home_team,
      away_team: g.away_team,
      home_points: g.home_points ?? null,
      away_points: g.away_points ?? null,
      tv: g.tv || g.television || g.broadcast || null,
      line: g.line ?? null,
      over_under: g.over_under ?? null
    };
  });
}

function nextGame(schedule) {
  const withTimes = schedule.filter(g => g.start_time);
  const now = Date.now();
  withTimes.sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
  return withTimes.find(g => new Date(g.start_time).getTime() > now) || null;
}

function currentThisWeek(schedule) {
  const now = Date.now();
  // in-progress (has points and already started)
  const ip = schedule.find(g =>
    (g.home_points != null || g.away_points != null) &&
    g.start_time && new Date(g.start_time).getTime() <= now
  );
  if (ip) return ip;
  // otherwise something inside ±4 days
  const start = now - 4 * 86400e3;
  const end   = now + 4 * 86400e3;
  return schedule.find(g => {
    if (!g.start_time) return false;
    const t = new Date(g.start_time).getTime();
    return t >= start && t <= end;
  }) || null;
}

function icsForGame(g) {
  if (!g || !g.start_time) return "";
  const isHome = String(g.home_team || "").includes("Tennessee");
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

  const rawGames = await get(`/games?year=${YEAR}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`);
  const schedule = normalizeSchedule(rawGames).sort((a,b) => (a.week||0)-(b.week||0));
  await wjson(path.join(OUT_DIR, "ut_2025_schedule.json"), schedule);

  const curr = currentThisWeek(schedule);
  await wjson(path.join(CURRENT_DIR, "ut_game.json"), curr || {});

  const rankAll = await get(`/rankings?year=${YEAR}`).catch(() => []);
  const latest = Array.isArray(rankAll) ? rankAll[rankAll.length - 1] : null;
  await wjson(path.join(CURRENT_DIR, "rankings.json"), latest || []);

  const lines = await get(`/lines?year=${YEAR}&team=${encodeURIComponent(TEAM)}`).catch(() => []);
  await wjson(path.join(CURRENT_DIR, "ut_lines.json"), lines || []);

  const next = nextGame(schedule);
  const meta = { lastUpdated: new Date().toISOString(), nextStart: next?.start_time || null, week: next?.week ?? (curr?.week ?? "—") };
  await wjson(path.join(OUT_DIR, "meta_current.json"), meta);

  // ICS for next game
  await wtext(path.join(OUT_DIR, "ut_next.ics"), icsForGame(next));
}

main().catch(e => { console.error(e); process.exit(1); });
