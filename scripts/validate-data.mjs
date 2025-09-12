import fs from "node:fs/promises";

const must = (cond, msg, errs) => { if (!cond) errs.push(msg); };

async function load(p) { return JSON.parse(await fs.readFile(p, "utf8")); }

async function main() {
  const errs = [];

  // schedule
  const sched = await load("data/ut_2025_schedule.json").catch(()=>[]);
  must(Array.isArray(sched) && sched.length>0, "schedule missing/empty", errs);
  for (const [i,g] of sched.entries()) {
    must(!!(g.start_time || g.start_date), `schedule[${i}] missing start_time/start_date`, errs);
    must(!!g.home_team, `schedule[${i}] missing home_team`, errs);
    must(!!g.away_team, `schedule[${i}] missing away_team`, errs);
  }

  // rankings
  const ranks = await load("data/current/rankings.json").catch(()=>[]);
  must(Array.isArray(ranks), "rankings not array", errs);

  // lines
  const lines = await load("data/current/ut_lines.json").catch(()=>[]);
  must(Array.isArray(lines), "lines not array", errs);

  if (errs.length) {
    console.error("DATA VALIDATION FAILED:");
    errs.forEach(e => console.error(" -", e));
    process.exit(1);
  } else {
    console.log("Data looks good ✅");
  }
}
main();
