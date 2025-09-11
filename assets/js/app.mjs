// assets/js/app.mjs
// Gameday Hub front-end (ES Modules)

// --- Prove JS is running & remove .no-js class ---
console.debug("[APP] boot");
document.documentElement.classList.remove("no-js");

// ---------- PATHS (project-pages safe) ----------
const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
// e.g. "/editorial-sportspage" on project pages, "" at domain root.
const DATA = `${BASE}/data`;
console.debug("[APP] DATA base =", DATA);

// ---------- DOM helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Fetch JSON with cache-busting & friendly errors
async function j(rel) {
  const url = `${DATA}/${rel}?t=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
}

/* ===============================================
   NAV
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

  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) {
      header.setAttribute("data-open", "false");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

/* ===============================================
   COUNTDOWN (driven by next kickoff)
================================================= */
let setCountdownKickoff = () => {};
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;

  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"),
        minEl  = $("#cd-min"),  secEl = $("#cd-sec");
  if (!daysEl || !hrsEl || !minEl || !secEl) return;

  let t0 = null; // timestamp ms

  const tick = () => {
    if (!t0) return;
    const now = Date.now();
    let diff = Math.max(0, Math.floor((t0 - now) / 1000));
    const d = Math.floor(diff / 86400); diff %= 86400;
    const h = Math.floor(diff / 3600);  diff %= 3600;
    const m = Math.floor(diff / 60);
    const s = diff % 60;

    daysEl.textContent = String(d).padStart(2, "0");
    hrsEl.textContent  = String(h).padStart(2, "0");
    minEl.textContent  = String(m).padStart(2, "0");
    secEl.textContent  = String(s).padStart(2, "0");
  };

  setCountdownKickoff = (iso) => {
    if (!iso) { t0 = null; return; }
    t0 = new Date(iso).getTime();
    tick();
  };

  tick();
  setInterval(tick, 1000);
}

/* ===============================================
   GUIDE accordion (simple 2nd row)
================================================= */
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
   Data helpers (tolerant to CFBD)
================================================= */
// kickoff field: may be full ISO or date-only
function pickIso(g) { return g?.start_time ?? g?.start_date ?? g?.date ?? g?.kickoff ?? null; }

// format date/time; show date-only nicely; "TBA" when unknown
function formatTimeLike(iso) {
  if (!iso || /^(TBA|TBD|N\/A)$/i.test(String(iso))) return "TBA";
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  const safeIso = hasTime ? iso : `${iso}T12:00:00Z`; // noon UTC for date-only
  const dt = new Date(safeIso);
  if (Number.isNaN(dt.getTime())) return "TBA";
  const opts = hasTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return dt.toLocaleString([], opts);
}

// normalize to a real ISO for countdown (use ~noon ET if date-only)
function normalizeKickoffForCountdown(iso) {
  if (!iso || /^(TBA|TBD|N\/A)$/i.test(String(iso))) return null;
  const hasTime = /T\d{2}:\d{2}/.test(iso);
  const s = hasTime ? iso : `${iso}T16:00:00Z`; // ~noon Eastern ≈ 16:00Z
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : s;
}

function teamName(x) { return x?.school ?? x?.team ?? x?.name ?? x ?? ""; }
function homeTeam(g) { return teamName(g?.home_team ?? g?.homeTeam ?? g?.home); }
function awayTeam(g) { return teamName(g?.away_team ?? g?.awayTeam ?? g?.away); }
function isNeutral(g){ return !!(g?.neutral_site ?? g?.neutral ?? false); }
function oppForUT(g) {
  const h = homeTeam(g), a = awayTeam(g);
  if (!h && !a) return "";
  return /tennessee/i.test(h) ? a : h;
}
function homeAway(g) {
  const h = homeTeam(g); if (!h) return isNeutral(g) ? "Neutral" : "—";
  return /tennessee/i.test(h) ? "Home" : (isNeutral(g) ? "Neutral" : "Away");
}
function pickTV(g) { return g?.tv ?? g?.television ?? g?.broadcast ?? "—"; }
function resultForRow(g) {
  const hp = g?.home_points ?? g?.homePoints;
  const ap = g?.away_points ?? g?.awayPoints;
  if (hp == null && ap == null) return "";
  const usAway = /tennessee/i.test(awayTeam(g) || "");
  const ut = usAway ? ap : hp;
  const opp = usAway ? hp : ap;
  const tag = ut > opp ? "W" : ut < opp ? "L" : "T";
  return `${tag} ${ut}–${opp}`;
}
function isFuture(iso) { return iso && new Date(iso).getTime() > Date.now(); }

function computeTeamStats(sched) {
  let w=0,l=0,t=0,pf=0,pa=0,games=0;
  for (const g of sched) {
    const hp = g?.home_points ?? g?.homePoints;
    const ap = g?.away_points ?? g?.awayPoints;
    if (hp == null && ap == null) continue;
    const usAway = /tennessee/i.test(awayTeam(g) || "");
    const ut = usAway ? ap : hp;
    const opp = usAway ? hp : ap;
    games++; pf += ut ?? 0; pa += opp ?? 0;
    if (ut > opp) w++; else if (ut < opp) l++; else t++;
  }
  const ppg = games ? +(pf/games).toFixed(1) : 0;
  const papg = games ? +(pa/games).toFixed(1) : 0;
  return { w, l, t, ppg, papg };
}

/* ===============================================
   SCOREBOX helpers
================================================= */
function setDotState(el, state) { if (el) el.setAttribute("data-state", state); } // red|yellow|green
function setBothScoreboxes(text, state = "red") {
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
}
function dotForTiming(status, iso) {
  const s = (status || "").toLowerCase();
  if (s.includes("in progress") || s.includes("1st") || s.includes("2nd") || s.includes("3rd") || s.includes("4th")) return "green";
  if (s.includes("final")) return "red";
  if (iso) {
    const start = new Date(iso).getTime();
    const now = Date.now();
    if (now >= start && now <= start + 5*3600*1000) return "green"; // game window
    if (start - now <= 72*3600*1000) return "yellow";               // within ~3 days
  }
  return "red";
}

/* ===============================================
   SCHEDULE (3-row collapsible)
================================================= */
async function buildSchedule() {
  const table = $("#schedTable");
  if (!table) return;

  const meta  = await j("meta_current.json").catch(() => ({ week: "—", lastUpdated: "—" }));
  const sched = await j("ut_2025_schedule.json").catch(() => []);

  $("#updatedAt2") && ($("#updatedAt2").textContent =
    (meta.lastUpdated ? meta.lastUpdated.replace("T"," ").replace("Z","") : "—"));

  sched.sort((a,b) => {
    const da = pickIso(a), db = pickIso(b);
    if (da && db) return new Date(da) - new Date(db);
    return (a.week || 0) - (b.week || 0);
  });

  const tbody = $("#schedRows");
  tbody.innerHTML = sched.map((g, idx) => {
    const iso = pickIso(g);
    const extra = idx >= 3 ? ` data-extra="true"` : "";
    return `<tr${extra}>
      <td>${formatTimeLike(iso)}</td>
      <td>${oppForUT(g)}</td>
      <td>${homeAway(g)}</td>
      <td>${pickTV(g)}</td>
      <td>${resultForRow(g)}</td>
    </tr>`;
  }).join("");

  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap");
  if (wrap) wrap.setAttribute("data-collapsed", "true");

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
   TOP STRIP (scorebox, next game, ranks, odds, stats)
   – picks next game from schedule (no ut_game.json needed)
   – drives countdown & colored dot
================================================= */
async function buildTopStrip() {
  const meta  = await j("meta_current.json").catch(() => ({ week: "—" }));
  const ranks = await j("current/rankings.json").catch(() => []);
  const lines = await j("current/ut_lines.json").catch(() => []);
  const sched = await j("ut_2025_schedule.json").catch(() => []);

  // choose next future game (prefer rows with a named opponent)
  const future = sched
    .map(g => ({ g, iso: pickIso(g) && (pickIso(g).includes("T") ? pickIso(g) : `${pickIso(g)}T00:00:00Z`) }))
    .filter(x => x.iso && new Date(x.iso).getTime() > Date.now())
    .sort((a,b) => new Date(a.iso) - new Date(b.iso));
  const game = (future.find(x => !!(x.g.home_team && x.g.away_team)) || future[0] || {}).g;

  // fun stats from played games
  const stats = computeTeamStats(sched);

  if (!game) {
    setBothScoreboxes("No UT game found for this week.", "red");
    $("#nextLine") && ($("#nextLine").textContent = "—");
    $(".nextLine") && ($(".nextLine").textContent = "—");
    return;
  }

  const iso = pickIso(game);
  const when = formatTimeLike(iso);
  const away = `${awayTeam(game)} ${game?.away_points ?? ""}`.trim();
  const home = `${homeTeam(game)} ${game?.home_points ?? ""}`.trim();
  const status = (game.status || "").toLowerCase();

  const msg   = `${away} @ ${home} — ${status || when || "TBA"}`;
  const state = dotForTiming(status, iso);
  setBothScoreboxes(msg, state);

  // drive countdown from schedule
  setCountdownKickoff(normalizeKickoffForCountdown(iso));

  // next/current game panel
  const who   = oppForUT(game);
  const venue = game?.venue || game?.venue_name || "";
  const title = `Week ${meta.week ?? ""}: Tennessee vs ${who}`.replace(/Week undefined:\s?/, "");

  $("#nextLine")  && ($("#nextLine").textContent  = `${title} — ${when || "TBA"}`);
  $(".nextLine")  && ($(".nextLine").textContent  = `${title} — ${when || "TBA"}`);
  $("#nextVenue") && ($("#nextVenue").textContent = venue);
  $(".nextVenue") && ($(".nextVenue").textContent = venue);

  const calUrl = (() => {
    const startIso = normalizeKickoffForCountdown(iso);
    if (!startIso) return "#";
    const start = new Date(startIso);
    const end   = new Date(start.getTime() + 3 * 3600 * 1000);
    const fmt   = d => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${
      encodeURIComponent(`Tennessee vs ${who}`)
    }&dates=${fmt(start)}/${fmt(end)}&location=${
      encodeURIComponent(venue)
    }&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
  })();
  $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
  $$(".addToCalendar").forEach(a => (a.href = calUrl));

  // Rankings (AP + Coaches)
  const pick = name => ranks.find(r => (r.poll || "").toLowerCase().includes(name));
  const ap = pick("ap"), coaches = pick("coach");
  const findRank = (obj) => {
    const arr = obj?.ranks || obj?.teams || [];
    const hit = arr.find(x => /tennessee/i.test(teamName(x?.school ?? x?.team ?? x)));
    return hit?.rank ?? "NR";
    };
  const rankLine = `AP: ${findRank(ap)}  •  Coaches: ${findRank(coaches)}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);

  // Odds + fun stats
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length) {
    const L = lines[0];
    const provider = (L.provider || L.providerName || (L.lines?.[0]?.provider)) ?? "—";
    const first    = (L.lines && L.lines[0]) || L;
    const spread   = (first.spread ?? first.formattedSpread ?? "—");
    const ou       = (first.overUnder ?? first.total ?? "—");
    oddsText = `${provider}: spread ${spread}, O/U ${ou}`;
  }
  const statsText = `Record ${stats.w}-${stats.l}${stats.t?'-'+stats.t:''} · PPG ${stats.ppg} · PAPG ${stats.papg}`;
  $("#oddsLine") && ($("#oddsLine").textContent = `${oddsText}  —  ${statsText}`);
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

  await Promise.all([
    buildSchedule(),
    buildTopStrip(),
    buildPlaces()
  ]);

  // “Semi-live” during Saturdays
  if (new Date().getDay() === 6) {
    setInterval(() => buildTopStrip(), 30000);
  }
}

document.addEventListener("DOMContentLoaded", init);
