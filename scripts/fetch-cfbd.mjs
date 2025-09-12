// scripts/fetch-cfbd.mjs
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) { console.error("Missing CFBD_API_KEY"); process.exit(1); }

const YEAR = 2025;
const TEAM = "Tennessee";
const SEASON_TYPE = "regular";

const OUT_DIR = "data";
const CURRENT_DIR = path.join(OUT_DIR, "current");
const BASE = "https://api.collegefootballdata.com";

async function ensureDirs(){ await mkdir(OUT_DIR,{recursive:true}); await mkdir(CURRENT_DIR,{recursive:true}); }
async function get(rel){
  const r = await fetch(`${BASE}${rel}`, { headers:{ Authorization:`Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${rel}\n${await r.text().catch(()=>"")}`);
  return r.json();
}
const wjson = (f,d)=>writeFile(f,JSON.stringify(d,null,2)).then(()=>console.log("wrote",f));
const wtext = (f,t)=>writeFile(f,t,"utf8").then(()=>console.log("wrote",f));

const isoFrom = g => g.start_date || g.startDate || g.start_time || g.startTime || null;

function normalizeSchedule(arr){
  return arr.map(g=>{
    const isHome = String(g.home_team||"").includes("Tennessee");
    return {
      id: g.id,
      season: g.season,
      week: g.week,
      season_type: g.season_type,
      start_time: isoFrom(g),
      start_time_tbd: g.start_time_tbd ?? false,
      neutral_site: g.neutral_site ?? false,
      conference_game: g.conference_game ?? false,
      venue: g.venue || (isHome ? "Neyland Stadium" : ""),
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
const nextGame = sched=>{
  const f = sched.filter(g=>g.start_time).sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
  const now = Date.now();
  return f.find(g=>new Date(g.start_time).getTime()>now) || null;
};
const currentThisWeek = sched=>{
  const now = Date.now();
  const ip = sched.find(g =>
    (g.home_points!=null || g.away_points!=null) &&
    g.start_time && new Date(g.start_time).getTime() <= now
  );
  if (ip) return ip;
  const start = now - 4*86400e3, end = now + 4*86400e3;
  return sched.find(g=>{
    if (!g.start_time) return false;
    const t = new Date(g.start_time).getTime();
    return t>=start && t<=end;
  }) || null;
};
function icsForGame(g){
  if (!g || !g.start_time) return "";
  const isHome = String(g.home_team||"").includes("Tennessee");
  const opp = isHome ? g.away_team : g.home_team;
  const start = new Date(g.start_time);
  const end   = new Date(start.getTime()+3*60*60*1000);
  const fmt = d=>d.toISOString().replace(/[-:]|\.\d{3}/g,"");
  const uid = `ut-${g.id || Math.random().toString(36).slice(2)}@hcweb-labs`;
  return [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//HC Web Labs//UT Volunteers Gameday//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}Z`,
    `DTSTART:${fmt(start)}Z`,
    `DTEND:${fmt(end)}Z`,
    `SUMMARY:Tennessee vs ${opp}`,
    `LOCATION:${(g.venue||"Neyland Stadium").replace(/\r?\n/g," ")}`,
    "DESCRIPTION:Unofficial Gameday Hub",
    "END:VEVENT","END:VCALENDAR",""
  ].join("\r\n");
}

async function main(){
  await ensureDirs();

  // Full schedule
  const raw = await get(`/games?year=${YEAR}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`);
  const schedule = normalizeSchedule(raw).sort((a,b)=>(a.week||0)-(b.week||0));
  await wjson(path.join(OUT_DIR,"ut_2025_schedule.json"), schedule);

  // Current OR next (guarantee a full object with teams)
  const curr = currentThisWeek(schedule) || nextGame(schedule) || {};
  await wjson(path.join(CURRENT_DIR,"ut_game.json"), curr);

  // Rankings + lines
  const rankingsAll = await get(`/rankings?year=${YEAR}`).catch(()=>[]);
  await wjson(path.join(CURRENT_DIR,"rankings.json"), Array.isArray(rankingsAll)? rankingsAll[rankingsAll.length-1]: rankingsAll);

  const lines = await get(`/lines?year=${YEAR}&team=${encodeURIComponent(TEAM)}`).catch(()=>[]);
  await wjson(path.join(CURRENT_DIR,"ut_lines.json"), lines);

  // Meta + ICS
  const nxt = nextGame(schedule);
  const meta = { lastUpdated:new Date().toISOString(), week: nxt?.week ?? curr?.week ?? "—", nextStart: nxt?.start_time || null };
  await wjson(path.join(OUT_DIR,"meta_current.json"), meta);

  await wtext(path.join(OUT_DIR,"ut_next.ics"), icsForGame(nxt || curr));
}
main().catch(e=>{ console.error(e); process.exit(1); });
