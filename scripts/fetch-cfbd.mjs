// scripts/fetch-cfbd.mjs
// Node 20+ (global fetch). Pulls CFBD and writes flat JSON your page reads.
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) { console.error("Missing CFBD_API_KEY"); process.exit(1); }

const YEAR = 2025;
const SEASON_TYPE = "regular";
const TEAM = "Tennessee";
const CONF = "SEC";
const BASE = "https://api.collegefootballdata.com";

const OUT = "data";
const CUR = path.join(OUT, "current");
fs.mkdirSync(CUR, { recursive: true });

const qs = o => {
  const s = Object.entries(o).filter(([,v]) => v !== "" && v != null)
    .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  return s ? `?${s}` : "";
};
const getJSON = async (url) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const write = (rel, data) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log("Wrote", p);
};
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function currentWeek() {
  // Try to find the week whose window includes "now"; else latest past week; else 1
  const cal = await getJSON(`${BASE}/calendar${qs({ year: YEAR })}`).catch(() => []);
  const now = new Date();
  let cur = 1;
  for (const w of cal.filter(x => (x.seasonType || "").toLowerCase() === SEASON_TYPE)) {
    const start = new Date(w.startDate || w.firstGameStart || 0);
    const end   = new Date(w.endDate   || w.lastGameStart  || 0);
    if (now >= start && now <= end) { cur = w.week; break; }
    if (now > end) cur = w.week;
  }
  return cur;
}

function findUTGame(gList) {
  return (gList || []).find(g =>
    (g.home_team && g.home_team.includes("Tennessee")) ||
    (g.away_team && g.away_team.includes("Tennessee"))
  ) || null;
}

async function main() {
  const week = await currentWeek();

  const utSchedule = await getJSON(`${BASE}/games${qs({ year: YEAR, seasonType: SEASON_TYPE, team: TEAM })}`).catch(()=>[]);
  const secWeek    = await getJSON(`${BASE}/games${qs({ year: YEAR, seasonType: SEASON_TYPE, conference: CONF, week })}`).catch(()=>[]);
  const utStats    = await getJSON(`${BASE}/stats/season${qs({ year: YEAR, team: TEAM })}`).catch(()=>[]);
  let rankings     = await getJSON(`${BASE}/rankings${qs({ year: YEAR, seasonType: SEASON_TYPE, week })}`).catch(()=>[]);
  if (!rankings?.length) rankings = await getJSON(`${BASE}/rankings${qs({ year: YEAR, seasonType: SEASON_TYPE })}`).catch(()=>[]);
  const utLines    = await getJSON(`${BASE}/lines${qs({ year: YEAR, seasonType: SEASON_TYPE, week, team: TEAM })}`).catch(()=>[]);
  const venues     = await getJSON(`${BASE}/venues${qs({ conference: CONF })}`).catch(()=>[]);

  write("meta_current.json", { year: YEAR, seasonType: SEASON_TYPE, week, lastUpdated: stamp() });
  write("ut_2025_schedule.json", utSchedule);
  write(`current/scoreboard.json`, secWeek);
  write(`current/ut_game.json`, findUTGame(secWeek) || {});
  write(`current/rankings.json`, rankings);
  write(`current/ut_lines.json`, utLines);
  write(`sec_venues.json`, venues);

  // Optional: a manual places file you maintain in-repo
  const placesPath = path.join(OUT, "manual/places_knoxville.json");
  if (!fs.existsSync(placesPath)) {
    write("manual/places_knoxville.json", [
      { name:"Market Square", kind:"food", lat:35.965, lon:-83.919, tip:"Post-game eats." }
    ]);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
