// Fetch Tennessee 2025 schedule from CFBD and write /data
// Requires env: CFBD_API_KEY
import fs from "node:fs/promises";
import fetch from "node-fetch";

const TEAM = process.env.TEAM || "Tennessee";
const YEAR = Number(process.env.YEAR || "2025");
const API  = "https://api.collegefootballdata.com";

const headers = { "Authorization": `Bearer ${process.env.CFBD_API_KEY}` };

const get = async (path, params={}) => {
  const u = new URL(API + path);
  for (const [k,v] of Object.entries(params)) if (v != null) u.searchParams.set(k, String(v));
  const r = await fetch(u.toString(), { headers });
  if (!r.ok) throw new Error(`CFBD ${r.status} ${r.statusText} for ${u.pathname}`);
  return r.json();
};

const tidy = (v) => v == null ? null : v;

const mapGame = (g) => {
  const isHome = g.home_team === TEAM;
  const opponent = isHome ? g.away_team : g.home_team;

  // "completed" heuristic works pre/post game
  const completed = g.home_points != null || g.away_points != null || (g.status && String(g.status).toLowerCase() === "final");

  let result = null;
  if (g.home_points != null && g.away_points != null) {
    const us   = isHome ? g.home_points : g.away_points;
    const them = isHome ? g.away_points : g.home_points;
    const wl = us > them ? "W" : us < them ? "L" : "T";
    result = `${wl} ${us}-${them}`;
  }

  return {
    id: tidy(g.id),
    year: tidy(g.season),
    week: tidy(g.week),
    date: tidy(g.start_date),
    tv: tidy(g.tv),
    venue_name: tidy(g.venue),
    is_home: isHome,
    opponent: tidy(opponent),
    notes: tidy(g.notes),
    completed,
    home_points: tidy(g.home_points),
    away_points: tidy(g.away_points),
    result
  };
};

async function main(){
  // Use /games to get opponent + points reliably
  const games = await get("/games", { year: YEAR, team: TEAM });

  // Normalize & sort
  const mapped = games.map(mapGame).sort((a,b)=> new Date(a.date) - new Date(b.date));

  // next = first not-completed & in the future (allow slight backfill tolerance)
  const now = Date.now();
  const next = mapped.find(g => new Date(g.date).getTime() >= now - 6*60*60*1000 && !g.completed) || null;

  // Write files
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/schedule.json", JSON.stringify(mapped, null, 2));
  await fs.writeFile("data/next.json", JSON.stringify(next, null, 2));
  await fs.writeFile("data/meta.json", JSON.stringify({ updated_at: new Date().toISOString() }, null, 2));

  console.log("Wrote data:", {
    schedule: mapped.length,
    next_id: next?.id ?? null,
  });
}

main().catch(e => { console.error(e); process.exit(1); });
