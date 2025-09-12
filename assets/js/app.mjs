// assets/js/app.mjs

// Resolve /data no matter where index.html lives
const BASE = (() => {
  let p = location.pathname.replace(/\/index\.html$/, "");
  if (p.endsWith("/")) p = p.slice(0, -1);
  return p || "";
})();
const DATA = `${BASE}/data`;
const ICS_HREF = `${DATA}/ut_next.ics`;

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

async function j(rel) {
  const r = await fetch(`${DATA}/${rel}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
}

/* ---------------- NAV ---------------- */
function initNav(){
  const header = $(".site-header"), btn = $(".nav-toggle"), nav = $("#primaryNav");
  if (!header || !btn || !nav) return;
  btn.addEventListener("click", () => {
    const open = header.getAttribute("data-open")==="true";
    header.setAttribute("data-open", String(!open));
    btn.setAttribute("aria-expanded", String(!open));
  });
  nav.addEventListener("click", e => {
    if (e.target.closest("a")) {
      header.setAttribute("data-open", "false");
      btn.setAttribute("aria-expanded", "false");
    }
  });
}

/* -------------- COUNTDOWN ------------ */
function initCountdown(){
  const el = $("#countdown"); if (!el) return;
  const kickoffStr = el.getAttribute("data-kickoff");
  const daysEl = $("#cd-days"), hrsEl = $("#cd-hrs"), minEl = $("#cd-min"), secEl = $("#cd-sec");
  if (!kickoffStr || !daysEl) return;
  const t0 = new Date(kickoffStr).getTime();
  const tick = () => {
    const now = Date.now();
    let d = Math.max(0, Math.floor((t0 - now)/1000));
    const days = Math.floor(d/86400); d%=86400;
    const hrs  = Math.floor(d/3600);  d%=3600;
    const mins = Math.floor(d/60);
    const secs = d%60;
    daysEl.textContent = String(days).padStart(2,"0");
    hrsEl .textContent = String(hrs ).padStart(2,"0");
    minEl .textContent = String(mins).padStart(2,"0");
    secEl .textContent = String(secs).padStart(2,"0");
  };
  tick(); setInterval(tick, 1000);
}

/* -------------- GUIDE ACCORDION ------ */
function initGuideAccordion(){
  const extra = $("#guideExtra"), btn = $("#guideMore");
  if (!extra || !btn) return;
  extra.hidden = true; extra.classList.add("is-collapsible");
  btn.addEventListener("click", () => {
    const open = !extra.hidden;
    extra.hidden = open; extra.classList.toggle("is-open", !open);
    btn.setAttribute("aria-expanded", String(!open));
    btn.innerHTML = open
      ? `<i class="fa-solid fa-angles-down"></i> See more`
      : `<i class="fa-solid fa-angles-up"></i> See less`;
  });
}

/* -------------- FORMATTERS ----------- */
function formatTimeET(iso){
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York", timeZoneName: "short"
  });
}
function resultForRow(g){
  const has = (g.home_points != null || g.away_points != null);
  if (!has) return "";
  const isAway = String(g.away_team||"").includes("Tennessee");
  const ut  = isAway ? g.away_points : g.home_points;
  const opp = isAway ? g.home_points : g.away_points;
  const wl = ut>opp ? "W" : ut<opp ? "L" : "T";
  return `${wl} ${ut}–${opp}`;
}
const homeAway = g =>
  String(g.home_team||"").includes("Tennessee") ? "Home" : (g.neutral_site ? "Neutral" : "Away");

/* -------------- CALENDAR CTAs -------- */
function ensureCtaRows(){
  const place = (a,b) => {
    if (!a || !b) return;
    if (a.parentElement?.classList?.contains("btn-row")) return;
    const row = document.createElement("div");
    row.className = "btn-row";
    a.parentElement.insertBefore(row, a);
    row.append(a,b);
  };
  // top card
  place($("#addToCalendar"), $("#downloadIcs") || $("#nextCard a[href*='.ics']"));
  // bottom strip
  place($(".strip-bottom .addToCalendar"), $(".strip-bottom a[href*='.ics']"));
}

function setCalendarLinks(isoStart, title, venue){
  // Google Calendar
  const start = new Date(isoStart);
  const end   = new Date(start.getTime()+3*60*60*1000);
  const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g,"");
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(venue)}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
  const topA = $("#addToCalendar"), botA = $(".strip-bottom .addToCalendar");
  if (topA) topA.href = gcal;
  if (botA) botA.href = gcal;
  // ICS
  [$("#downloadIcs") || $("#nextCard a[href*='.ics']"), $(".strip-bottom a[href*='.ics']")]
    .forEach(a => { if (a) a.href = `${ICS_HREF}?t=${Date.now()}`; });
  ensureCtaRows();
}

/* -------------- SCHEDULE ------------- */
async function buildSchedule(){
  const table = $("#schedTable"); if (!table) return;

  const meta  = await j("meta_current.json").catch(()=>({week:"—", lastUpdated:"—"}));
  const sched = await j("ut_2025_schedule.json").catch(()=>[]);
  $("#updatedAt2") && ($("#updatedAt2").textContent =
    meta.lastUpdated?.replace("T"," ").replace("Z","") || "—");

  sched.sort((a,b) => (a.week||0)-(b.week||0));
  $("#schedRows").innerHTML = sched.map((g,idx) => {
    const opp = String(g.home_team||"").includes("Tennessee") ? g.away_team : g.home_team;
    const tv  = g.tv || "—";
    const extra = idx>=3 ? ` data-extra="true"` : "";
    return `<tr${extra}>
      <td>${formatTimeET(g.start_time) || "TBA"}</td>
      <td>${opp||""}</td>
      <td>${homeAway(g)}</td>
      <td>${tv}</td>
      <td>${resultForRow(g)}</td>
    </tr>`;
  }).join("");

  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap");
  if (wrap) wrap.setAttribute("data-collapsed","true");

  const btn = $("#schedMore");
  if (btn){
    btn.addEventListener("click", () => {
      const collapsed = table.classList.contains("table-collapsed");
      table.classList.toggle("table-collapsed", !collapsed ? true : false);
      const nowCollapsed = table.classList.contains("table-collapsed");
      if (wrap) wrap.setAttribute("data-collapsed", String(nowCollapsed));
      btn.setAttribute("aria-expanded", String(!nowCollapsed));
      btn.innerHTML = nowCollapsed
        ? `<i class="fa-solid fa-angles-down"></i> See more`
        : `<i class="fa-solid fa-angles-up"></i> See less`;
    });
    btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> See more`;
    btn.setAttribute("aria-expanded", "false");
  }
}

/* -------------- STRIP / RANK / ODDS --- */
function setDotState(el, state){ if (el) el.setAttribute("data-state", state); }
function setBothScoreboxes(text, state="red"){
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
}

async function buildTopStrip(){
  const meta  = await j("meta_current.json").catch(()=>({week:"—"}));
  const game  = await j("current/ut_game.json").catch(()=>null);
  const ranks = await j("current/rankings.json").catch(()=>[]);
  const lines = await j("current/ut_lines.json").catch(()=>[]);

  if (!game || !game.id || !game.start_time){
    setBothScoreboxes("No UT game found for this week.", "red");
    // Also clear the upcoming block so it doesn’t sit on “Loading…”
    $("#nextLine") && ($("#nextLine").textContent = "—");
    $("#nextVenue") && ($("#nextVenue").textContent = "");
  } else {
    const away = `${game.away_team} ${game.away_points ?? ""}`.trim();
    const home = `${game.home_team} ${game.home_points ?? ""}`.trim();
    const when = formatTimeET(game.start_time);
    const status = (game.status || "").toLowerCase();
    const msg = `${away} @ ${home} — ${status || when}`;
    const state = status.includes("final") ? "red" : status.includes("in progress") ? "green" : "yellow";
    setBothScoreboxes(msg, state);

    const opp = String(game.home_team||"").includes("Tennessee") ? game.away_team : game.home_team;
    $("#nextLine")  && ($("#nextLine").textContent  = `Week ${meta.week}: Tennessee vs ${opp} — ${when}`);
    $(".nextLine")  && ($(".nextLine").textContent  = `Week ${meta.week}: Tennessee vs ${opp} — ${when}`);
    const venue = game.venue || "Neyland Stadium";
    $("#nextVenue") && ($("#nextVenue").textContent = venue);
    $(".nextVenue") && ($(".nextVenue").textContent = venue);

    setCalendarLinks(game.start_time, `Tennessee vs ${opp}`, venue);
  }

  // Rankings (handle either structure)
  let apR = "NR", coR = "NR";
  if (ranks && ranks.polls) {
    const ap = ranks.polls.find(p => (p.poll||"").toLowerCase().includes("ap"));
    const co = ranks.polls.find(p => (p.poll||"").toLowerCase().includes("coach"));
    const pick = p => {
      const arr = p?.ranks || p?.teams || [];
      const hit = arr.find(x => (x.school || x.team || "").includes("Tennessee"));
      return hit?.rank ?? "NR";
    };
    apR = ap ? pick(ap) : apR;
    coR = co ? pick(co) : coR;
  }
  const rankLine = `AP: ${apR}  •  Coaches: ${coR}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);

  // Odds
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length){
    const L = lines[0];
    const first = (L.lines && L.lines[0]) || L;
    const provider = (L.provider || L.providerName || first?.provider) ?? "—";
    const spread   = first?.spread ?? first?.formattedSpread ?? "—";
    const ou       = first?.overUnder ?? first?.total ?? "—";
    oddsText = `${provider}: spread ${spread}, O/U ${ou}`;
  }
  $("#oddsLine") && ($("#oddsLine").textContent = oddsText);
}

/* -------------- PLACES ---------------- */
async function buildPlaces(){
  const list = $("#placesList"), empty = $("#placesEmpty");
  if (!list) return;
  const places = await j("manual/places_knoxville.json").catch(()=>[]);
  if (!places.length){ empty && (empty.hidden=false); return; }
  empty && (empty.hidden=true);
  list.innerHTML = places.map(p =>
    `<li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip || p.kind || ""}</span></li>`
  ).join("");
}

/* -------------- INIT ------------------ */
async function init(){
  initNav();
  initCountdown();
  initGuideAccordion();
  await Promise.all([buildSchedule(), buildTopStrip(), buildPlaces()]);

  // Light tick on Saturdays
  if (new Date().getDay() === 6) setInterval(buildTopStrip, 30000);
}
document.addEventListener("DOMContentLoaded", init);
