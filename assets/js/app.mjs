// assets/js/app.mjs — robust CFBD reader for schedule/rankings/lines
console.debug("[APP] boot");

document.documentElement.classList.remove("no-js");

// ---------- PATHS (works at repo subpath or root) ----------
const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DATA = `${BASE}/data`;
console.debug("[APP] DATA =", DATA);

// ---------- small helpers ----------
const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const nowMs = () => Date.now();

async function j(rel) {
  const url = `${DATA}/${rel}?t=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
}

/* ============================================================
   COUNTDOWN
============================================================ */
let setCountdownKickoff = () => {};
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;

  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"),
        minEl  = $("#cd-min"),  secEl = $("#cd-sec");
  if (!daysEl || !hrsEl || !minEl || !secEl) return;

  let target = null;
  const tick = () => {
    if (!target) return;
    let diff = Math.max(0, Math.floor((target - Date.now())/1000));
    const d = Math.floor(diff/86400); diff%=86400;
    const h = Math.floor(diff/3600);  diff%=3600;
    const m = Math.floor(diff/60);
    const s = diff%60;
    daysEl.textContent = String(d).padStart(2,"0");
    hrsEl.textContent  = String(h).padStart(2,"0");
    minEl.textContent  = String(m).padStart(2,"0");
    secEl.textContent  = String(s).padStart(2,"0");
  };
  setCountdownKickoff = (iso) => {
    target = iso ? new Date(iso).getTime() : null;
    tick();
  };
  setInterval(tick, 1000);
}

/* ============================================================
   NAV + GUIDE accordion
============================================================ */
function initNav() {
  const header = $(".site-header");
  const btn = $(".nav-toggle");
  const nav = $("#primaryNav");
  if (!btn || !header || !nav) return;
  btn.addEventListener("click", () => {
    const open = header.getAttribute("data-open") === "true";
    header.setAttribute("data-open", String(!open));
    btn.setAttribute("aria-expanded", String(!open));
  });
  nav.addEventListener("click", e => {
    if (e.target.closest("a")) {
      header.setAttribute("data-open","false");
      btn.setAttribute("aria-expanded","false");
    }
  });
}

function initGuideAccordion() {
  const extra = $("#guideExtra");
  const btn = $("#guideMore");
  if (!extra || !btn) return;
  extra.hidden = true;
  extra.classList.add("is-collapsible");
  btn.addEventListener("click", () => {
    const open = !extra.hidden;
    extra.hidden = open;
    extra.classList.toggle("is-open", !open);
    btn.setAttribute("aria-expanded", String(!open));
    btn.innerHTML = open
      ? `<i class="fa-solid fa-angles-down"></i> See more`
      : `<i class="fa-solid fa-angles-up"></i> See less`;
  });
  btn.setAttribute("aria-expanded","false");
  btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> See more`;
}

/* ============================================================
   CFBD shape helpers
============================================================ */
const get = (o, ...keys) => keys.find(k => o?.[k] != null) ? o[keys.find(k => o?.[k] != null)] : null;

function teamName(x){ return x?.school ?? x?.team ?? x?.name ?? x ?? ""; }
function homeTeam(g){ return teamName(get(g,"home_team","homeTeam","home")); }
function awayTeam(g){ return teamName(get(g,"away_team","awayTeam","away")); }
function isNeutral(g){ return !!get(g,"neutral_site","neutral"); }
function oppForUT(g){ return /tennessee/i.test(homeTeam(g)||"") ? awayTeam(g) : homeTeam(g); }
function homeAway(g){
  return /tennessee/i.test((homeTeam(g)||"")) ? "Home" : (isNeutral(g) ? "Neutral" : "Away");
}

// accept lots of kickoff fields; return ISO or null
function rawKick(g) {
  return get(g, "start_time","startTime","start_date","startDate","date","game_date","gameDate");
}
function kickoffISO(g) {
  const raw = rawKick(g);
  if (!raw) return null;
  const hasTime = /T\d{2}:\d{2}/.test(raw);
  return hasTime ? raw : `${raw}T16:00:00Z`; // noon ET approx if date only
}
function displayWhen(g) {
  const raw = rawKick(g);
  if (!raw) return "TBA";
  const hasTime = /T\d{2}:\d{2}/.test(raw);
  const dt = new Date(hasTime ? raw : `${raw}T00:00:00Z`);
  if (Number.isNaN(dt)) return "TBA";
  return dt.toLocaleString([], hasTime
    ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }
    : { month:"short", day:"numeric" });
}
function resultForRow(g){
  const hp = get(g,"home_points","homePoints");
  const ap = get(g,"away_points","awayPoints");
  if (hp == null && ap == null) return "";
  const utAway = /tennessee/i.test(awayTeam(g) || "");
  const ut = utAway ? ap : hp;
  const opp = utAway ? hp : ap;
  const tag = ut > opp ? "W" : ut < opp ? "L" : "T";
  return `${tag} ${ut}–${opp}`;
}
function dotForTiming(status, iso){
  const s = (status || "").toLowerCase();
  if (s.includes("final")) return "red";
  if (s.includes("in progress") || /1st|2nd|3rd|4th|half/i.test(s)) return "green";
  if (iso) {
    const t = new Date(iso).getTime();
    if (t - Date.now() <= 72*3600*1000) return "yellow";
  }
  return "red";
}

// Rankings array → latest AP/Coaches for Tennessee
function extractRankings(ranks) {
  if (!Array.isArray(ranks) || !ranks.length) return { ap:"NR", coaches:"NR" };
  const latest = ranks.reduce((a,b) => ((b.season??0)*100+(b.week??0)) > ((a.season??0)*100+(a.week??0)) ? b : a);
  const polls = latest.polls || latest.Polls || [];
  const apPoll = polls.find(p => /ap/i.test(p.poll || ""));
  const coachesPoll = polls.find(p => /coach/i.test(p.poll || ""));
  const find = (poll) => {
    const arr = poll?.ranks || poll?.Ranks || [];
    const hit = arr.find(x => /tennessee/i.test(teamName(x.school ?? x.team)));
    return hit?.rank ?? "NR";
  };
  return { ap: find(apPoll), coaches: find(coachesPoll) };
}

// Lines array → find lines for the next UT game
function extractLinesForGame(lines, game) {
  if (!Array.isArray(lines) || !lines.length || !game) return null;
  const opp = oppForUT(game);
  const match = lines.find(L =>
    (/tennessee/i.test(L.home_team || "") || /tennessee/i.test(L.away_team || "")) &&
    (new RegExp(opp, "i").test(L.home_team || "") || new RegExp(opp, "i").test(L.away_team || ""))
  ) || lines.find(L => /tennessee/i.test(L.home_team || "") || /tennessee/i.test(L.away_team || ""));
  if (!match) return null;
  const first = (match.lines && match.lines[0]) || null;
  if (!first) return null;
  return {
    provider: first.provider || match.provider || "—",
    spread: first.spread ?? first.formattedSpread ?? "—",
    ou: first.overUnder ?? first.total ?? "—",
  };
}

/* ============================================================
   SCHEDULE TABLE
============================================================ */
async function buildSchedule() {
  const table = $("#schedTable");
  if (!table) return;

  const meta  = await j("meta_current.json").catch(() => ({ week:"—", lastUpdated:"—" }));
  const sched = await j("ut_2025_schedule.json").catch(() => []);
  console.debug("[APP] schedule length:", sched.length, "sample:", sched[0]);

  $("#updatedAt2") && ($("#updatedAt2").textContent =
    (meta.lastUpdated ? meta.lastUpdated.replace("T"," ").replace("Z","") : "—"));

  // Sort by kickoff (falls back if only date is present)
  const sorted = [...sched].sort((a,b) => {
    const ta = kickoffISO(a) ? new Date(kickoffISO(a)).getTime() : 0;
    const tb = kickoffISO(b) ? new Date(kickoffISO(b)).getTime() : 0;
    return ta - tb;
  });

  const tbody = $("#schedRows");
  tbody.innerHTML = sorted.map((g, idx) => {
    const extra = idx >= 3 ? ` data-extra="true"` : "";
    return `<tr${extra}>
      <td>${displayWhen(g)}</td>
      <td>${oppForUT(g) || "—"}</td>
      <td>${homeAway(g)}</td>
      <td>${g.tv ?? g.television ?? "—"}</td>
      <td>${resultForRow(g)}</td>
    </tr>`;
  }).join("");

  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap");
  if (wrap) wrap.setAttribute("data-collapsed","true");

  const btn = $("#schedMore");
  if (btn) {
    const setLabel = (open) => {
      btn.innerHTML = open
        ? `<i class="fa-solid fa-angles-up"></i> See less`
        : `<i class="fa-solid fa-angles-down"></i> See more`;
      btn.setAttribute("aria-expanded", String(open));
    };
    setLabel(false);
    btn.addEventListener("click", () => {
      const collapsed = table.classList.contains("table-collapsed");
      table.classList.toggle("table-collapsed", !collapsed ? true : false);
      const nowCollapsed = table.classList.contains("table-collapsed");
      if (wrap) wrap.setAttribute("data-collapsed", String(nowCollapsed));
      setLabel(!nowCollapsed);
    });
  }
}

/* ============================================================
   TOP STRIP — scorebox, next game, ranks, odds
============================================================ */
function setDotState(el, s){ if (el) el.setAttribute("data-state", s); }
function setBothScoreboxes(text, state="red"){
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
}

async function buildTopStrip() {
  const meta  = await j("meta_current.json").catch(() => ({ week:"—" }));
  const sched = await j("ut_2025_schedule.json").catch(() => []);
  const ranks = await j("current/rankings.json").catch(() => []);
  const lines = await j("current/ut_lines.json").catch(() => []);
  console.debug("[APP] top strip:",
    { sched: sched.length, sample: sched[0], ranksLen: (ranks||[]).length, linesLen: (lines||[]).length });

  // choose next game by time; if no times, by week
  const futureByTime = sched
    .map(g => ({ g, t: kickoffISO(g) ? new Date(kickoffISO(g)).getTime() : null }))
    .filter(x => x.t && x.t > nowMs())
    .sort((a,b) => a.t - b.t);

  let game = futureByTime[0]?.g || null;
  if (!game) {
    const wk = Math.min(...sched.map(g => g.week ?? 999).filter(n => n !== 999));
    const next = (meta.week && Number.isFinite(+meta.week))
      ? (sched.find(g => (g.week ?? 0) >= +meta.week) || sched[0])
      : sched[0];
    game = next || null;
  }

  if (!game) {
    setBothScoreboxes("No UT game found for this season.", "red");
  } else {
    const iso = kickoffISO(game);
    const when = displayWhen(game);
    const msg = `${awayTeam(game)} @ ${homeTeam(game)} — ${when}`;
    const state = dotForTiming(game.status, iso);
    setBothScoreboxes(msg, state);

    const who   = oppForUT(game);
    const title = meta.week ? `Week ${meta.week}: Tennessee vs ${who}` : `Tennessee vs ${who}`;
    $("#nextLine") && ($("#nextLine").textContent = `${title} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `${title} — ${when}`);
    $("#nextVenue") && ($("#nextVenue").textContent = game.venue || "");
    $(".nextVenue") && ($(".nextVenue").textContent = game.venue || "");

    if (iso) {
      const start = new Date(iso);
      const end   = new Date(start.getTime() + 3*3600*1000);
      const fmt   = d => d.toISOString().replace(/[-:]|\.\d{3}/g,"");
      const calUrl =
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(game.venue || "")}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
      $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
      $$(".addToCalendar").forEach(a => a.href = calUrl);
      setCountdownKickoff(iso);
    } else {
      setCountdownKickoff(null);
    }

    const L = extractLinesForGame(lines, game);
    $("#oddsLine") && ($("#oddsLine").textContent =
      L ? `${L.provider}: spread ${L.spread}, O/U ${L.ou}` : "Odds data coming soon.");
  }

  const rk = extractRankings(ranks);
  const rankLine = `AP: ${rk.ap}  •  Coaches: ${rk.coaches}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);
}

/* ============================================================
   PLACES (optional JSON)
============================================================ */
async function buildPlaces() {
  const list = $("#placesList");
  const empty = $("#placesEmpty");
  if (!list) return;
  const places = await j("manual/places_knoxville.json").catch(() => []);
  if (!places.length) { if (empty) empty.hidden = false; return; }
  if (empty) empty.hidden = true;
  list.innerHTML = places.map(p =>
    `<li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip || p.kind || ""}</span></li>`
  ).join("");
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  initNav();
  initCountdown();
  initGuideAccordion();

  await Promise.all([ buildSchedule(), buildTopStrip(), buildPlaces() ]);

  if (new Date().getDay() === 6) setInterval(buildTopStrip, 30000);
}
document.addEventListener("DOMContentLoaded", init);
