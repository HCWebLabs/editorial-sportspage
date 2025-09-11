// assets/js/app.mjs

// ---------- PATHS (project-sites safe) ----------
const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, ""); // → "/editorial-sportspage"
const DATA = `${BASE}/data`;
console.debug("[APP] DATA base =", DATA);

// ---------- DOM helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// One-line JSON fetch with cache-bust and friendly errors
async function j(rel) {
  const url = `${DATA}/${rel}?t=${Date.now()}`;
  console.debug("[APP] fetch", url);
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
   COUNTDOWN
================================================= */
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;

  const kickoffStr = el.getAttribute("data-kickoff");
  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"),
        minEl  = $("#cd-min"), secEl = $("#cd-sec");
  if (!kickoffStr || !daysEl) return;

  const t0 = new Date(kickoffStr).getTime();
  const tick = () => {
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

  tick();
  setInterval(tick, 1000);
}

/* ===============================================
   GUIDE: simple accordion (2nd row only)
================================================= */
function initGuideAccordion() {
  const extra = $("#guideExtra");
  const btn = $("#guideMore");
  if (!extra || !btn) return;

  extra.hidden = true;
  extra.classList.add("is-collapsible");

  btn.addEventListener("click", () => {
    const open = !extra.hidden;
    extra.hidden = open;                          // toggle
    extra.classList.toggle("is-open", !open);
    btn.setAttribute("aria-expanded", String(!open));
    btn.innerHTML = open
      ? `<i class="fa-solid fa-angles-down"></i> See more`
      : `<i class="fa-solid fa-angles-up"></i> See less`;
  });

  // initial button state
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> See more`;
}

/* ===============================================
   DATA helpers (tolerant to CFBD shapes)
================================================= */
function pickIso(g) {
  return g?.start_time ?? g?.start_date ?? g?.date ?? g?.kickoff ?? null;
}
function formatTimeLike(iso, opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString([], opts);
}
function teamName(x) {
  return x?.school ?? x?.team ?? x?.name ?? x ?? "";
}
function homeTeam(g) { return teamName(g?.home_team ?? g?.homeTeam ?? g?.home); }
function awayTeam(g) { return teamName(g?.away_team ?? g?.awayTeam ?? g?.away); }
function isNeutral(g) { return !!(g?.neutral_site ?? g?.neutral ?? false); }
function homeAway(g) {
  const h = homeTeam(g); if (!h) return isNeutral(g) ? "Neutral" : "—";
  return /tennessee/i.test(h) ? "Home" : (isNeutral(g) ? "Neutral" : "Away");
}
function oppForUT(g) {
  const h = homeTeam(g), a = awayTeam(g);
  if (!h && !a) return "";
  return /tennessee/i.test(h) ? a : h;
}
function pickTV(g) { return g?.tv ?? g?.television ?? g?.broadcast ?? "—"; }
function resultForRow(g) {
  const hp = g?.home_points ?? g?.homePoints;
  const ap = g?.away_points ?? g?.awayPoints;
  if (hp == null && ap == null) return ""; // non-final or not provided
  const usAway = /tennessee/i.test(awayTeam(g) || "");
  const ut = usAway ? ap : hp;
  const opp = usAway ? hp : ap;
  const tag = ut > opp ? "W" : ut < opp ? "L" : "T";
  return `${tag} ${ut}–${opp}`;
}
function isFuture(iso) { return iso && new Date(iso).getTime() > Date.now(); }

function toGCalTime(iso) {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // ~3h window
  const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return `${fmt(start)}/${fmt(end)}`;
}

/* ===============================================
   SCOREBOX helpers (mirror top/bottom)
================================================= */
function setDotState(el, state) { if (el) el.setAttribute("data-state", state); } // red|yellow|green
function setBothScoreboxes(text, state = "red") {
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
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
    (meta.lastUpdated ? meta.lastUpdated.replace("T", " ").replace("Z", "") : "—"));

  // Sort by kickoff if present, else by week
  sched.sort((a, b) => {
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

  // collapsed by default (show 3)
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
   TOP STRIP (scorebox, next, ranks, odds)
   – uses ut_game.json when present
   – falls back to next future game from schedule
================================================= */
async function buildTopStrip() {
  const meta  = await j("meta_current.json").catch(() => ({ week: "—" }));
  let game    = await j("current/ut_game.json").catch(() => null);
  const ranks = await j("current/rankings.json").catch(() => []);
  const lines = await j("current/ut_lines.json").catch(() => []);

  // Fallback: choose next future game from schedule
  if (!game || !game.id) {
    const sched = await j("ut_2025_schedule.json").catch(() => []);
    const next = sched
      .map(g => ({ g, iso: pickIso(g) }))
      .filter(x => isFuture(x.iso))
      .sort((a, b) => new Date(a.iso) - new Date(b.iso))[0];
    if (next) game = next.g;
  }

  if (!game) {
    setBothScoreboxes("No UT game found for this week.", "red");
    $("#nextLine") && ($("#nextLine").textContent = "—");
    $(".nextLine") && ($(".nextLine").textContent = "—");
  } else {
    const iso = pickIso(game);
    const when = formatTimeLike(iso);
    const away = `${awayTeam(game)} ${game?.away_points ?? ""}`.trim();
    const home = `${homeTeam(game)} ${game?.home_points ?? ""}`.trim();
    const status = (game.status || "").toLowerCase();
    const isLive = status.includes("in progress");

    const msg   = `${away} @ ${home} — ${status || when || "TBA"}`;
    const state = status.includes("final") ? "red" : (isLive ? "green" : "yellow");
    setBothScoreboxes(msg, state);

    const who   = oppForUT(game);
    const venue = game?.venue || game?.venue_name || "";
    const title = `Week ${meta.week ?? ""}: Tennessee vs ${who}`.replace(/Week undefined:\s?/, "");

    $("#nextLine")  && ($("#nextLine").textContent  = `${title} — ${when || "TBA"}`);
    $(".nextLine")  && ($(".nextLine").textContent  = `${title} — ${when || "TBA"}`);
    $("#nextVenue") && ($("#nextVenue").textContent = venue);
    $(".nextVenue") && ($(".nextVenue").textContent = venue);

    const calUrl = iso
      ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${toGCalTime(iso)}&location=${encodeURIComponent(venue)}&details=${encodeURIComponent("Unofficial Gameday Hub")}`
      : "#";
    $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
    $$(".addToCalendar").forEach(a => (a.href = calUrl));
  }

  // Rankings (AP + Coaches if present)
  const pick = name => ranks.find(r => (r.poll || "").toLowerCase().includes(name));
  const ap = pick("ap"), coaches = pick("coach");
  const findRank = (obj) => {
    const arr = obj?.ranks || obj?.teams || [];
    const hit = arr.find(x => /tennessee/i.test(teamName(x?.school ?? x?.team ?? x)));
    return hit?.rank ?? "—";
  };
  const rankLine = `AP: ${findRank(ap)}  •  Coaches: ${findRank(coaches)}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);

  // Odds (first provider)
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length) {
    const L = lines[0];
    const provider = (L.provider || L.providerName || (L.lines?.[0]?.provider)) ?? "—";
    const first    = (L.lines && L.lines[0]) || L;
    const spread   = (first.spread ?? first.formattedSpread ?? "—");
    const ou       = (first.overUnder ?? first.total ?? "—");
    oddsText = `${provider}: spread ${spread}, O/U ${ou}`;
  }
  $("#oddsLine") && ($("#oddsLine").textContent = oddsText);
}

/* ===============================================
   PLACES (optional local JSON)
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

  // “Semi-live” tick during Saturdays
  if (new Date().getDay() === 6) {
    setInterval(() => buildTopStrip(), 30000);
  }
}

document.addEventListener("DOMContentLoaded", init);
