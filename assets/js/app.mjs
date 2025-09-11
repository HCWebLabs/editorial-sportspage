// assets/js/app.mjs
// Auto-detect base so it works on user-site root *and* project-sites (/repo-name/)
const BASE = location.pathname.replace(/\/[^/]*$/, "");   // e.g. "/editorial-sportspage"
const DATA = `${BASE}/data`;                               // JSON lives here

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function j(rel) {
  const r = await fetch(`${DATA}/${rel}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
}

/* ---------- NAV TOGGLE ---------- */
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
  // close on link click (mobile)
  nav.addEventListener("click", e => {
    if (e.target.closest("a")) {
      header.setAttribute("data-open", "false");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

/* ---------- COUNTDOWN ---------- */
function initCountdown() {
  const el = $("#countdown");
  if (!el) return;
  const kickoffStr = el.getAttribute("data-kickoff");
  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"), minEl = $("#cd-min"), secEl = $("#cd-sec");
  if (!kickoffStr || !daysEl) return;
  const t0 = new Date(kickoffStr).getTime();
  const tick = () => {
    const now = Date.now();
    let diff = Math.max(0, Math.floor((t0 - now)/1000));
    const d = Math.floor(diff/86400); diff%=86400;
    const h = Math.floor(diff/3600);  diff%=3600;
    const m = Math.floor(diff/60);
    const s = diff%60;
    daysEl.textContent = String(d).padStart(2,"0");
    hrsEl.textContent  = String(h).padStart(2,"0");
    minEl.textContent  = String(m).padStart(2,"0");
    secEl.textContent  = String(s).padStart(2,"0");
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- GUIDE ACCORDION (simple) ---------- */
function initGuideAccordion() {
  const extra = $("#guideExtra");
  const btn = $("#guideMore");
  if (!extra || !btn) return;

  // start collapsed
  extra.hidden = true;
  extra.classList.add("is-collapsible");
  $(".table-wrap")?.setAttribute("data-collapsed", "true");

  btn.addEventListener("click", () => {
    const open = !extra.hidden;
    extra.hidden = open; // toggle
    extra.classList.toggle("is-open", !open);
    btn.setAttribute("aria-expanded", String(!open));
    btn.innerHTML = open
      ? `<i class="fa-solid fa-angles-down"></i> See more`
      : `<i class="fa-solid fa-angles-up"></i> See less`;
  });
}

/* ---------- SCHEDULE (3-row collapsible) ---------- */
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function resultForRow(g) {
  const hasScore = (g.home_points != null || g.away_points != null);
  if (!hasScore) return "";
  const isUTAway = String(g.away_team||"").includes("Tennessee");
  const ut = isUTAway ? g.away_points : g.home_points;
  const opp = isUTAway ? g.home_points : g.away_points;
  const wL = (ut > opp) ? "W" : (ut < opp) ? "L" : "T";
  return `${wL} ${ut}–${opp}`;
}
function homeAway(g) {
  return String(g.home_team||"").includes("Tennessee") ? "Home" : (g.neutral_site ? "Neutral" : "Away");
}

async function buildSchedule() {
  const table = $("#schedTable");
  if (!table) return;

  const meta = await j("meta_current.json").catch(()=>({week:"—", lastUpdated:"—"}));
  const sched = await j("ut_2025_schedule.json").catch(()=>[]);
  $("#updatedAt2") && ($("#updatedAt2").textContent = meta.lastUpdated?.replace("T"," ").replace("Z","") || "—");

  // sort by week ASC if present
  sched.sort((a,b) => (a.week||0) - (b.week||0));

  const tbody = $("#schedRows");
  tbody.innerHTML = sched.map((g, idx) => {
    const opp = String(g.home_team||"").includes("Tennessee") ? g.away_team : g.home_team;
    const tv = g.tv || g.television || "—";
    const extra = idx >= 3 ? ` data-extra="true"` : "";
    return `<tr${extra}>
      <td>${formatTime(g.start_time)}</td>
      <td>${opp||""}</td>
      <td>${homeAway(g)}</td>
      <td>${tv}</td>
      <td>${resultForRow(g)}</td>
    </tr>`;
  }).join("");

  // collapse to 3 rows initially
  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap");
  if (wrap) wrap.setAttribute("data-collapsed", "true");

  const btn = $("#schedMore");
  if (btn) {
    btn.addEventListener("click", () => {
      const collapsed = table.classList.contains("table-collapsed");
      table.classList.toggle("table-collapsed", !collapsed ? true : false); // flip state
      const nowCollapsed = table.classList.contains("table-collapsed");
      if (wrap) wrap.setAttribute("data-collapsed", String(nowCollapsed));
      btn.setAttribute("aria-expanded", String(!nowCollapsed));
      btn.innerHTML = nowCollapsed
        ? `<i class="fa-solid fa-angles-down"></i> See more`
        : `<i class="fa-solid fa-angles-up"></i> See less`;
    });
    // ensure initial button label
    btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> See more`;
    btn.setAttribute("aria-expanded", "false");
  }
}

/* ---------- SCOREBOX / RANKINGS / ODDS ---------- */
function setDotState(el, state) {
  if (!el) return;
  el.setAttribute("data-state", state); // red | yellow | green (CSS already styles)
}
function setBothScoreboxes(text, state="red") {
  // Top card
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  // Bottom strip mirrors
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
}

function toGCalTime(iso) {
  // Convert ISO to Google Calendar time format (UTC, no punctuation).
  const start = new Date(iso);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // assume 3h
  const fmt = d => d.toISOString().replace(/[-:]|\.\\d{3}/g,"").replace(".000","").replace("Z","Z");
  return `${fmt(start)}/${fmt(end)}`;
}

async function buildTopStrip() {
  const meta = await j("meta_current.json").catch(()=>({week:"—"}));
  const game = await j("current/ut_game.json").catch(()=>null);
  const ranks = await j("current/rankings.json").catch(()=>[]);
  const lines = await j("current/ut_lines.json").catch(()=>[]);

  // Score box
  if (!game || !game.id) {
    setBothScoreboxes("No UT game found for this week.", "red");
  } else {
    const away = `${game.away_team} ${game.away_points ?? ""}`.trim();
    const home = `${game.home_team} ${game.home_points ?? ""}`.trim();
    const status = (game.status || "").toLowerCase();
    const when = formatTime(game.start_time);
    const msg = `${away} @ ${home} — ${status || when}`;
    const state = status.includes("final") ? "red" : status.includes("in progress") ? "green" : "yellow";
    setBothScoreboxes(msg, state);

    // next/current game panel
    const who = String(game.home_team||"").includes("Tennessee") ? game.away_team : game.home_team;
    $("#nextLine") && ($("#nextLine").textContent = `Week ${meta.week}: Tennessee vs ${who} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `Week ${meta.week}: Tennessee vs ${who} — ${when}`);
    const venue = game.venue || "";
    $("#nextVenue") && ($("#nextVenue").textContent = venue);
    $(".nextVenue") && ($(".nextVenue").textContent = venue);

    // Add to Google Calendar links (top + bottom)
    const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${toGCalTime(game.start_time)}&location=${encodeURIComponent(venue)}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
    $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
    $$(".addToCalendar").forEach(a => a.href = calUrl);
  }

  // Rankings (try AP + Coaches)
  const pick = name => ranks.find(r => (r.poll||"").toLowerCase().includes(name));
  const ap = pick("ap"), coaches = pick("coach");
  const findRank = (obj) => {
    const arr = obj?.ranks || obj?.teams || [];
    const hit = arr.find(x => (x.school || x.team || "").includes("Tennessee"));
    return hit?.rank ?? "—";
  };
  const rankLine = `AP: ${findRank(ap)}  •  Coaches: ${findRank(coaches)}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);

  // Odds (show first provider spread/total)
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length) {
    const L = lines[0];
    const provider = (L.provider || L.providerName || (L.lines?.[0]?.provider)) ?? "—";
    const first = (L.lines && L.lines[0]) || L;
    const spread = (first.spread ?? first.formattedSpread ?? "—");
    const ou = (first.overUnder ?? first.total ?? "—");
    oddsText = `${provider}: spread ${spread}, O/U ${ou}`;
  }
  $("#oddsLine") && ($("#oddsLine").textContent = oddsText);
}

/* ---------- PLACES (optional local file) ---------- */
async function buildPlaces() {
  const list = $("#placesList");
  const empty = $("#placesEmpty");
  if (!list) return;
  const places = await j("manual/places_knoxville.json").catch(()=>[]);
  if (!places.length) { empty && (empty.hidden = false); return; }
  empty && (empty.hidden = true);
  list.innerHTML = places.map(p => `
    <li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip || p.kind || ""}</span></li>
  `).join("");
}

/* ---------- INIT ---------- */
async function init() {
  initNav();
  initCountdown();
  initGuideAccordion();
  await Promise.all([ buildSchedule(), buildTopStrip(), buildPlaces() ]);

  // Light “semi-live” tick only during Saturday hours
  if (new Date().getDay() === 6) {
    setInterval(() => buildTopStrip(), 30000);
  }
}
document.addEventListener("DOMContentLoaded", init);
