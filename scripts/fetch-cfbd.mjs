/**
 * CFBD data pull → writes flat JSON your site reads (+ ICS files).
 * Node 18/20 (global fetch). Requires CFBD_API_KEY repo secret.
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.CFBD_API_KEY;
if (!API_KEY) { console.error("ERROR: CFBD_API_KEY is not set."); process.exit(1); }

const SEASON = 2025;
const TEAM = "Tennessee";
const SEASON_TYPE = "regular";

const DATA_DIR = "data";
const CURRENT_DIR = path.join(DATA_DIR, "current");

// ---------- utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureDir(p){ await fs.mkdir(p,{recursive:true}); }
async function readIfExists(p){ try{ return JSON.parse(await fs.readFile(p,"utf8")); } catch{ return null; } }
async function writeJson(rel, obj){
  const full = path.resolve(rel); await ensureDir(path.dirname(full));
  const next = JSON.stringify(obj,null,2)+"\n";
  const prev = await fs.readFile(full,"utf8").catch(()=>null);
  if (prev === next) { console.log("unchanged:", rel); return false; }
  await fs.writeFile(full,next,"utf8"); console.log("wrote", rel); return true;
}
async function writeText(rel, text){
  const full = path.resolve(rel); await ensureDir(path.dirname(full));
  const next = text.endsWith("\r\n") ? text : text;
  const prev = await fs.readFile(full,"utf8").catch(()=>null);
  if (prev === next) { console.log("unchanged:", rel); return false; }
  await fs.writeFile(full,next,"utf8"); console.log("wrote", rel); return true;
}
async function getWithRetry(url, {tries=6, init={}}={}){
  for (let a=1;;a++){
    const r = await fetch(url, { ...init, headers:{...(init.headers||{}), Authorization:`Bearer ${API_KEY}`}});
    if (r.status===429 || r.status>=500){
      if (a>=tries) throw new Error(`${r.status} after ${tries} tries: ${url}`);
      const ra = r.headers.get("retry-after");
      const wait = ra ? Number(ra)*1000 : Math.min(30000, a*2000);
      console.warn(`[${r.status}] ${url} → retry in ${wait}ms (attempt ${a}/${tries})`);
      await sleep(wait); continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text().catch(()=> "")}`);
    return r.json();
  }
}

// ---------- normalizers ----------
const pick = (o,...ks)=> ks.find(k=>o?.[k]!=null) ? o[ks.find(k=>o?.[k]!=null)] : null;
const onlyDate = iso => iso ? String(iso).slice(0,10) : null;

function normalizeGame(g){
  const raw = pick(g,"start_time","startTime","start_date","startDate","date","game_date","gameDate");
  const hasTime = raw && /T\d{2}:\d{2}/.test(raw);
  return {
    id: g.id ?? null,
    week: g.week ?? null,
    start_time: hasTime ? raw : null,
    start_date: hasTime ? onlyDate(raw) : (raw ? String(raw) : null),
    home_team: pick(g,"home_team","homeTeam","home") ?? "",
    away_team: pick(g,"away_team","awayTeam","away") ?? "",
    home_points: pick(g,"home_points","homePoints") ?? null,
    away_points: pick(g,"away_points","awayPoints") ?? null,
    status: g.status ?? null,
    tv: pick(g,"tv","television") ?? null,
    venue: g.venue ?? null,
    neutral_site: !!pick(g,"neutral_site","neutral"),
  };
}
const kickoffIsoFromGame = (g)=> g.start_time ? g.start_time : g.start_date ? `${g.start_date}T16:00:00Z` : null;

function pickNextGame(sched){
  const now = Date.now();
  const withTs = sched.map(g=>({g,t: kickoffIsoFromGame(g)? new Date(kickoffIsoFromGame(g)).getTime():null}))
                      .filter(x=>x.t!=null)
                      .sort((a,b)=>a.t-b.t);
  return withTs.find(x=>x.t>now)?.g || null;
}
function pickLastGame(sched){
  const now = Date.now();
  const withTs = sched.map(g=>({g,t: kickoffIsoFromGame(g)? new Date(kickoffIsoFromGame(g)).getTime():null}))
                      .filter(x=>x.t!=null)
                      .sort((a,b)=>a.t-b.t);
  return [...withTs].reverse().find(x=>x.t<=now)?.g || null;
}

// ---------- ICS helpers ----------
const icsEsc = s => String(s||"").replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
const icsStamp = iso => String(iso).replace(/[-:]|\.\d{3}/g,"");
function icsForGame(g){
  const iso = kickoffIsoFromGame(g);
  if (!iso) return null;
  const start = new Date(iso);
  const end = new Date(start.getTime() + 3*3600*1000);
  const opp = (/tennessee/i.test((g.home_team||"")) ? g.away_team : g.home_team) || "Opponent";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gameday Hub//CFBD//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:ut-${g.id ?? `${g.week}-${icsStamp(iso)}`}@gameday-hub`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(start.toISOString())}`,
    `DTEND:${icsStamp(end.toISOString())}`,
    `SUMMARY:${icsEsc(`Tennessee vs ${opp}`)}`,
    g.venue ? `LOCATION:${icsEsc(g.venue)}` : null,
    `DESCRIPTION:${icsEsc("Unofficial Gameday Hub")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].filter(Boolean).join("\r\n");
}
function icsForSeason(sched){
  const blocks = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gameday Hub//CFBD//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  for (const g of sched){
    const body = icsForGame(g);
    if (!body) continue;
    const vevent = body.split("\r\n").filter(l => !/^BEGIN:VCALENDAR|END:VCALENDAR|VERSION:|PRODID:|CALSCALE:|METHOD:/.test(l));
    blocks.push(...vevent);
  }
  blocks.push("END:VCALENDAR",""); 
  return blocks.join("\r\n");
}

// ---------- main ----------
async function main(){
  let wrote = false;

  // schedule
  let rawSched = [];
  try {
    rawSched = await getWithRetry(`https://api.collegefootballdata.com/games?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`);
  } catch(e){ console.error("games fetch failed:", e.message); }

  let sched = [];
  if (Array.isArray(rawSched) && rawSched.length){
    sched = rawSched.map(normalizeGame).sort((a,b)=>{
      const ai = kickoffIsoFromGame(a) || "2100-01-01T00:00:00Z";
      const bi = kickoffIsoFromGame(b) || "2100-01-01T00:00:00Z";
      return new Date(ai)-new Date(bi);
    });
    wrote |= await writeJson(path.join(DATA_DIR,"ut_2025_schedule.json"), sched);
  }

  // rankings
  try {
    const ranks = await getWithRetry(`https://api.collegefootballdata.com/rankings?year=${SEASON}`);
    if (Array.isArray(ranks)) wrote |= await writeJson(path.join(CURRENT_DIR,"rankings.json"), ranks);
  } catch(e){ console.error("rankings fetch failed:", e.message); }

  // lines
  try {
    const lines = await getWithRetry(`https://api.collegefootballdata.com/lines?year=${SEASON}&team=${encodeURIComponent(TEAM)}&seasonType=${SEASON_TYPE}`);
    if (Array.isArray(lines)) wrote |= await writeJson(path.join(CURRENT_DIR,"ut_lines.json"), lines);
  } catch(e){ console.error("lines fetch failed:", e.message); }

  // meta + current/next game + ICS
  const next = pickNextGame(sched);
  const last = pickLastGame(sched);
  const meta = {
    season: SEASON,
    week: next?.week ?? null,           // keep for backward compat (means "next")
    weekNext: next?.week ?? null,
    weekCurrent: last?.week ?? null,
    lastUpdated: new Date().toISOString(),
  };
  wrote |= await writeJson(path.join(DATA_DIR,"meta_current.json"), meta);

  if (next){
    wrote |= await writeJson(path.join(CURRENT_DIR,"ut_game.json"), next);
    const icsNext = icsForGame(next);
    if (icsNext) wrote |= await writeText(path.join(CURRENT_DIR,"ut_next.ics"), icsNext);
  }

  if (sched.length){
    const icsAll = icsForSeason(sched);
    if (icsAll) wrote |= await writeText(path.join(DATA_DIR,"ut_2025_schedule.ics"), icsAll);
  }

  if (!wrote) console.log("No data changes to commit.");
}

main().catch(e=>{ console.error(e); process.exit(1); });

