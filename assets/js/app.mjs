// assets/js/app.mjs
// Gameday Hub front-end (robust to CFBD shapes) — ES Module

console.debug("[APP] boot");
document.documentElement.classList.remove("no-js");

// ---------- PATHS (project-pages safe) ----------
const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DATA = `${BASE}/data`;
console.debug("[APP] DATA base =", DATA);

// ---------- DOM helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function j(rel) {
  const url = `${DATA}/${rel}?t=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
}

/* ===============================================
   COUNTDOWN
================================================= */
let setCountdownKickoff = () => {};
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;

  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"),
        minEl  = $("#cd-min"),  secEl = $("#cd-sec");
  if (!daysEl || !hrsEl || !minEl || !secEl) return;

  let t0 = null;
  const tick = () => {
    if (!t0) return;
    let diff = Math.max(0, Math.floor((t0 - Date.now())/1000));
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
    t0 = iso ? new Date(iso).getTime() : null;
    tick();
  };
  tick();
  setInterval(tick, 1000);
}

/* ===============================================
   NAV + GUIDE accordion
================================================= */
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
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> See more`;
}

/* ===============================================
   Helpers to read schedule / rankings / lines
================================================= */
function teamName(x){ return x?.school ?? x?.team ?? x?.name ?? x ?? ""; }
function homeTeam(g){ return teamName(g?.home_team ?? g?.homeTeam ?? g?.home); }
function awayTeam(g){ return teamName(g?.away_team ?? g?.awayTeam ?? g?.away); }
function isNeutral(g){ return !!(g?.neutral_site ?? g?.neutral ?? false); }
function oppForUT(g){ return /tennessee/i.test(homeTeam(g)||"") ? awayTeam(g) : homeTeam(g); }
function homeAway(g){
  const h = homeTeam(g);
  return /tennessee/i.test(h || "") ? "Home" : (isNeutral(g) ? "Neutral" : "Away");
}
function pickIso(g){ return g?.start_time ?? g?.startDate ?? g?.start_date ?? g?.date ?? null; }
function normalizeKickoffForCountdown(iso){
  if (!iso) return null;
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  return hasTime ? iso : `${iso}T16:00:00Z`; // noon ET ≈ 16:00Z
}
function formatTimeLike(iso){
  if (!iso) return "TBA";
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  const dt = new Date(hasTime ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return "TBA";
  const opts = hasTime
    ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }
    : { month:"short", day:"numeric" };
  return dt.toLocaleString([], opts);
}
function resultForRow(g){
  const hp = g?.home_points ?? g?.homePoints;
  const ap = g?.away_points ?? g?.awayPoints;
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
    const t = new Date(normalizeKickoffForCountdown(iso)).getTime();
    const now = Date.now();
    if (t - now <= 72*3600*1000) return "yellow";
  }
  return "red";
}

// Rankings: CFBD shape → pick latest week's AP/Coaches
function extractRankings(ranks) {
  if (!Array.isArray(ranks) || !ranks.length) return { ap:"NR", coaches:"NR" };
  // try the last element; if multiple seasons/weeks, reduce to max by season/week
  const latest = ranks.reduce((a,b) => {
    const ak = (a.season??0)*100 + (a.week??0);
    const bk = (b.season??0)*100 + (b.week??0);
    return bk > ak ? b : a;
  });
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

// Lines: CFBD returns game entries each with lines[]
function extractNextGameLines(lines, game) {
  if (!Array.isArray(lines) || !lines.length || !game) return null;
  const nextOpp = oppForUT(game);
  const match = lines.find(L =>
    (/tennessee/i.test(L.home_team || "") || /tennessee/i.test(L.away_team || "")) &&
    (new RegExp(nextOpp, "i").test(L.home_team || "") || new RegExp(nextOpp, "i").test(L.away_team || ""))
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

/* ===============================================
   SCHEDULE (table + collapse)
================================================= */
async function buildSchedule() {
  const table = $("#schedTable");
  if (!table) return;

  const meta  = await j("meta_current.json").catch(() => ({ week:"—", lastUpdated:"—" }));
  const sched = await j("ut_2025_schedule.json").catch(() => []);
  console.debug("[APP] schedule len =", sched.length);

  $("#updatedAt2") && ($("#updatedAt2").textContent =
    (meta.lastUpdated ? meta.lastUpdated.replace("T"," ").replace("Z","") : "—"));

  // Sort by date/time
  sched.sort((a,b) => {
    const ia = pickIso(a), ib = pickIso(b);
    const da = ia ? new Date(ia.includes("T")? ia : `${ia}T00:00:00Z`) : 0;
    const db = ib ? new Date(ib.includes("T")? ib : `${ib}T00:00:00Z`) : 0;
    return da - db;
  });

  const tbody = $("#schedRows");
  tbody.innerHTML = sched.map((g, idx) => {
    const iso = pickIso(g);
    const extra = idx >= 3 ? ` data-extra="true"` : "";
    return `<tr${extra}>
      <td>${formatTimeLike(iso)}</td>
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

/* ===============================================
   TOP STRIP — Scorebox, Next game, Rank, Odds
================================================= */
function setDotState(el, state){ if (el) el.setAttribute("data-state", state); }
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
  console.debug("[APP] top-strip: sched", sched.length, "ranks", Array.isArray(ranks)?ranks.length:0, "lines", Array.isArray(lines)?lines.length:0);

  // Next game (future by date/time)
  const now = Date.now();
  const withIso = sched
    .map(g => ({ g, iso: pickIso(g) }))
    .filter(x => !!x.iso)
    .map(x => ({ g: x.g, t: new Date(x.iso.includes("T")? x.iso : `${x.iso}T00:00:00Z`).getTime() }))
    .sort((a,b) => a.t - b.t);

  const future = withIso.find(x => x.t > now);
  const game = future?.g || withIso[0]?.g || null;

  if (!game) {
    setBothScoreboxes("No UT game found for this season.", "red");
  } else {
    const iso = pickIso(game);
    const when = formatTimeLike(iso);
    const msg = `${awayTeam(game)} @ ${homeTeam(game)} — ${when}`;
    const state = dotForTiming(game.status, iso);
    setBothScoreboxes(msg, state);

    // next/current panel + countdown
    const who   = oppForUT(game);
    const title = meta.week ? `Week ${meta.week}: Tennessee vs ${who}` : `Tennessee vs ${who}`;
    $("#nextLine") && ($("#nextLine").textContent = `${title} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `${title} — ${when}`);
    $("#nextVenue") && ($("#nextVenue").textContent = game.venue || "");
    $(".nextVenue") && ($(".nextVenue").textContent = game.venue || "");
    setCountdownKickoff(normalizeKickoffForCountdown(iso));

    // GCal link(s)
    const startIso = normalizeKickoffForCountdown(iso);
    if (startIso) {
      const start = new Date(startIso);
      const end   = new Date(start.getTime() + 3*3600*1000);
      const fmt   = d => d.toISOString().replace(/[-:]|\.\d{3}/g,"");
      const calUrl =
        `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(game.venue || "")}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
      $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
      $$(".addToCalendar").forEach(a => a.href = calUrl);
    }

    // Odds (choose next game's lines)
    const l = extractNextGameLines(lines, game);
    $("#oddsLine") && ($("#oddsLine").textContent =
      l ? `${l.provider}: spread ${l.spread}, O/U ${l.ou}` : "Odds data coming soon.");
  }

  // Rankings (AP + Coaches) from CFBD shape
  const rk = extractRankings(ranks);
  const rankLine = `AP: ${rk.ap}  •  Coaches: ${rk.coaches}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);
}

/* ===============================================
   PLACES (optional)
================================================= */
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

/* ===============================================
   INIT
================================================= */
async function init() {
  initNav();
  initCountdown();
  initGuideAccordion();

  await Promise.all([ buildSchedule(), buildTopStrip(), buildPlaces() ]);

  // light refresh during Saturday
  if (new Date().getDay() === 6) setInterval(() => buildTopStrip(), 30000);
}

document.addEventListener("DOMContentLoaded", init);
