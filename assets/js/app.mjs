// assets/js/app.mjs
console.debug("[APP] boot");

const BASE = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DATA = `${BASE}/data`;

// helpers
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fetchJSON = async rel => {
  const r = await fetch(`${DATA}/${rel}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`${r.status} ${rel}`);
  return r.json();
};

// ---------- Time formatting in ET ----------
const TZ = "America/New_York";
const fmtET = (iso, withTime=true) => {
  if (!iso) return "TBA";
  const d = new Date(iso);
  const opt = withTime
    ? { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:TZ, timeZoneName:"short" }
    : { month:"short", day:"numeric", timeZone:TZ };
  const s = new Intl.DateTimeFormat([], opt).format(d);
  // force “ET” label (EDT/EST → ET)
  return s.replace(/\bE[DS]T\b/, "ET");
};

// kickoff derivation
const rawKick = g => g.start_time || (g.start_date ? `${g.start_date}T16:00:00Z` : null);
const homeTeam = g => g.home_team || g.homeTeam || g.home || "";
const awayTeam = g => g.away_team || g.awayTeam || g.away || "";
const oppForUT = g => (/tennessee/i.test(homeTeam(g)) ? awayTeam(g) : homeTeam(g));
const homeAway  = g => (/tennessee/i.test(homeTeam(g)) ? "Home" : (g.neutral_site ? "Neutral" : "Away"));
const resultForRow = g => {
  const hp = g.home_points ?? g.homePoints;
  const ap = g.away_points ?? g.awayPoints;
  if (hp==null && ap==null) return "";
  const utAway = /tennessee/i.test(awayTeam(g)||"");
  const ut = utAway ? ap : hp; const opp = utAway ? hp : ap;
  const tag = ut>opp ? "W" : ut<opp ? "L" : "T";
  return `${tag} ${ut}–${opp}`;
};

// countdown
let setCountdownKickoff = () => {};
function initCountdown(){
  const el = $("#countdown"); if (!el) return;
  const dEl = $("#cd-days"), hEl = $("#cd-hrs"), mEl = $("#cd-min"), sEl = $("#cd-sec");
  let t0 = null;
  setCountdownKickoff = iso => { t0 = iso ? new Date(iso).getTime() : null; tick(); };
  const tick = () => {
    if (!t0) return;
    let diff = Math.max(0, Math.floor((t0 - Date.now())/1000));
    const d = Math.floor(diff/86400); diff%=86400;
    const h = Math.floor(diff/3600);  diff%=3600;
    const m = Math.floor(diff/60);    const s = diff%60;
    dEl.textContent=String(d).padStart(2,"0");
    hEl.textContent=String(h).padStart(2,"0");
    mEl.textContent=String(m).padStart(2,"0");
    sEl.textContent=String(s).padStart(2,"0");
  };
  setInterval(tick,1000);
}

// UI helpers
function setDotState(el, s){ if (el) el.setAttribute("data-state", s); }
function setBothScoreboxes(text, state="red"){
  $("#scoreMsg") && ($("#scoreMsg").textContent = text);
  setDotState($("#scoreDot"), state);
  $$(".scoreMsg").forEach(n => n.textContent = text);
  $$(".scoreDot").forEach(n => setDotState(n, state));
}

// schedule table (3-row collapsible)
async function buildSchedule(){
  const table = $("#schedTable"); if (!table) return;
  const meta  = await fetchJSON("meta_current.json").catch(()=>({}));
  const sched = await fetchJSON("ut_2025_schedule.json").catch(()=>[]);
  $("#updatedAt2") && ($("#updatedAt2").textContent =
    (meta.lastUpdated ? meta.lastUpdated.replace("T"," ").replace("Z","") : "—"));

  const sorted = [...sched].sort((a,b)=>{
    const ai = rawKick(a) || "2100-01-01T00:00:00Z";
    const bi = rawKick(b) || "2100-01-01T00:00:00Z";
    return new Date(ai)-new Date(bi);
  });

  $("#schedRows").innerHTML = sorted.map((g,idx)=>{
    const extra = idx>=3 ? ' data-extra="true"' : '';
    const iso = rawKick(g);
    return `<tr${extra}>
      <td>${fmtET(iso, !!g.start_time)}</td>
      <td>${oppForUT(g) || "—"}</td>
      <td>${homeAway(g)}</td>
      <td>${g.tv ?? g.television ?? "—"}</td>
      <td>${resultForRow(g)}</td>
    </tr>`;
  }).join("");

  table.classList.add("table-collapsed");
  const wrap = table.closest(".table-wrap"); if (wrap) wrap.setAttribute("data-collapsed","true");
  const btn = $("#schedMore");
  if (btn){
    const set = open => {
      btn.innerHTML = open ? `<i class="fa-solid fa-angles-up"></i> See less`
                           : `<i class="fa-solid fa-angles-down"></i> See more`;
      btn.setAttribute("aria-expanded", String(open));
    };
    set(false);
    btn.addEventListener("click",()=>{
      const collapsed = table.classList.contains("table-collapsed");
      table.classList.toggle("table-collapsed", !collapsed ? true : false);
      const nowCollapsed = table.classList.contains("table-collapsed");
      if (wrap) wrap.setAttribute("data-collapsed", String(nowCollapsed));
      set(!nowCollapsed);
    });
  }
}

// top strip: bye week / season complete / ranks / odds / ics
function dotForTiming(status, iso){
  const s = (status||"").toLowerCase();
  if (s.includes("final")) return "red";
  if (s.includes("in progress") || /1st|2nd|3rd|4th|half|qtr/i.test(s)) return "green";
  if (iso && new Date(iso).getTime() - Date.now() <= 72*3600*1000) return "yellow";
  return "red";
}
function weekBoundsET(date=new Date()){
  // start of week (Mon) and end-of-week (Sun) in ET
  const z = TZ;
  const d = new Date(date);
  const dow = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:z}).format(d);
  const map = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const idx = map[dow];
  const start = new Date(d); start.setDate(d.getDate() - ((idx+6)%7)); start.setHours(0,0,0,0);
  const end   = new Date(start); end.setDate(start.getDate()+7);
  return [start,end];
}

async function buildTopStrip(){
  const meta  = await fetchJSON("meta_current.json").catch(()=>({}));
  const sched = await fetchJSON("ut_2025_schedule.json").catch(()=>[]);
  const ranks = await fetchJSON("current/rankings.json").catch(()=>[]);
  const lines = await fetchJSON("current/ut_lines.json").catch(()=>[]);

  // choose next/last by kickoff
  const withTs = sched.map(g=>({g, t: rawKick(g) ? new Date(rawKick(g)).getTime() : null})).filter(x=>x.t!=null).sort((a,b)=>a.t-b.t);
  const next = withTs.find(x=>x.t>Date.now())?.g || null;
  const last = [...withTs].reverse().find(x=>x.t<=Date.now())?.g || null;

  // Season complete?
  const seasonOver = !next && !!last;
  // Bye week? (no game in current ET week, but future games exist)
  let byeWeek = false;
  if (next){
    const [ws,we] = weekBoundsET(); // ET week window
    const inThisWeek = withTs.some(x => x.t>=ws.getTime() && x.t<we.getTime());
    const hasFuture   = withTs.some(x => x.t>=we.getTime());
    byeWeek = (!inThisWeek && hasFuture);
  }

  // Scorebox + upcoming panel
  if (seasonOver){
    setBothScoreboxes("Season complete — thanks for riding with us! See you next season.", "red");
    $("#nextLine") && ($("#nextLine").textContent = "Season complete");
    $(".nextLine") && ($(".nextLine").textContent = "Season complete");
    $("#nextVenue") && ($("#nextVenue").textContent = "");
    $(".nextVenue") && ($(".nextVenue").textContent = "");
    setCountdownKickoff(null);
    // Clear ICS link
    $("#downloadICS")  && ($("#downloadICS").style.display="none");
    $("#downloadICS2") && ($("#downloadICS2").style.display="none");
  } else if (byeWeek){
    setBothScoreboxes("Bye week — no game scheduled this week.", "yellow");
    // keep next game info visible
    const iso = rawKick(next);
    const when = fmtET(iso, !!next.start_time);
    const who = oppForUT(next);
    const wk = meta.weekNext ?? meta.week ?? next.week ?? "—";
    $("#nextLine") && ($("#nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
    $("#nextVenue") && ($("#nextVenue").textContent = next.venue || "");
    $(".nextVenue") && ($(".nextVenue").textContent = next.venue || "");
    setCountdownKickoff(iso);
  } else if (next){
    const iso = rawKick(next);
    const when = fmtET(iso, !!next.start_time);
    const msg = `${awayTeam(next)} @ ${homeTeam(next)} — ${when}`;
    setBothScoreboxes(msg, dotForTiming(next.status, iso));

    const who = oppForUT(next);
    const wk  = meta.weekNext ?? meta.week ?? next.week ?? "—";
    $("#nextLine") && ($("#nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `Week ${wk}: Tennessee vs ${who} — ${when}`);
    $("#nextVenue") && ($("#nextVenue").textContent = next.venue || "");
    $(".nextVenue") && ($(".nextVenue").textContent = next.venue || "");
    setCountdownKickoff(iso);
  } else {
    setBothScoreboxes("No UT game found for this season.", "red");
    setCountdownKickoff(null);
  }

  // Calendar links
  if (next){
    const iso = rawKick(next);
    if (iso){
      const start = new Date(iso); const end = new Date(start.getTime()+3*3600*1000);
      const fmt = d => d.toISOString().replace(/[-:]|\.\d{3}/g,"");
      const who = oppForUT(next);
      const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Tennessee vs ${who}`)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(next.venue||"")}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
      $("#addToCalendar") && ($("#addToCalendar").href = calUrl);
      $$(".addToCalendar").forEach(a => a.href = calUrl);
    }
    // ICS links (if file exists)
    const icsUrl = `${DATA}/current/ut_next.ics?t=${Date.now()}`;
    fetch(icsUrl, {method:"HEAD"}).then(r=>{
      if (r.ok){
        $("#downloadICS")  && ($("#downloadICS").setAttribute("href", icsUrl), ($("#downloadICS").style.display="inline-flex"));
        $("#downloadICS2") && ($("#downloadICS2").setAttribute("href", icsUrl), ($("#downloadICS2").style.display="inline-flex"));
      }
    }).catch(()=>{});
  }

  // Rankings
  const latest = Array.isArray(ranks) && ranks.length
    ? ranks.reduce((a,b)=> ((b.season??0)*100+(b.week??0)) > ((a.season??0)*100+(a.week??0)) ? b : a)
    : null;
  const polls = latest?.polls || [];
  const findRank = (name) => {
    const p = polls.find(x => (x.poll||"").toLowerCase().includes(name));
    const arr = p?.ranks || [];
    const hit = arr.find(x => /tennessee/i.test(x.school||x.team||""));
    return hit?.rank ?? "NR";
  };
  const rankLine = `AP: ${findRank("ap")}  •  Coaches: ${findRank("coach")}`;
  $("#rankLine") && ($("#rankLine").textContent = rankLine);
  $$(".rankLine").forEach(n => n.textContent = rankLine);

  // Odds (first provider line)
  let oddsText = "Odds data coming soon.";
  if (Array.isArray(lines) && lines.length){
    const match = lines.find(L => /tennessee/i.test(L.home_team||"") || /tennessee/i.test(L.away_team||"")) || null;
    const first = match?.lines?.[0]; 
    if (first) oddsText = `${first.provider || "—"}: spread ${first.spread ?? first.formattedSpread ?? "—"}, O/U ${first.overUnder ?? first.total ?? "—"}`;
  }
  $("#oddsLine") && ($("#oddsLine").textContent = oddsText);
}

// guide accordion + nav
function initGuideAccordion(){
  const extra=$("#guideExtra"), btn=$("#guideMore"); if(!extra||!btn) return;
  extra.hidden=true; extra.classList.add("is-collapsible");
  btn.addEventListener("click",()=>{
    const open=!extra.hidden; extra.hidden=open; extra.classList.toggle("is-open",!open);
    btn.setAttribute("aria-expanded", String(!open));
    btn.innerHTML=open?`<i class="fa-solid fa-angles-down"></i> See more`:`<i class="fa-solid fa-angles-up"></i> See less`;
  });
  btn.setAttribute("aria-expanded","false");
  btn.innerHTML=`<i class="fa-solid fa-angles-down"></i> See more`;
}
function initNav(){
  const header=$(".site-header"), btn=$(".nav-toggle"), nav=$("#primaryNav");
  if(!header||!btn||!nav) return;
  btn.addEventListener("click",()=>{
    const open=header.getAttribute("data-open")==="true";
    header.setAttribute("data-open",String(!open));
    btn.setAttribute("aria-expanded",String(!open));
  });
  nav.addEventListener("click",e=>{
    if(e.target.closest("a")){ header.setAttribute("data-open","false"); btn.setAttribute("aria-expanded","false"); }
  });
}

// places (optional)
async function buildPlaces(){
  const list=$("#placesList"), empty=$("#placesEmpty");
  if(!list) return;
  const places = await fetchJSON("manual/places_knoxville.json").catch(()=>[]);
  if(!places.length){ empty && (empty.hidden=false); return; }
  empty && (empty.hidden=true);
  list.innerHTML = places.map(p => `<li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip || p.kind || ""}</span></li>`).join("");
}

// init
async function init(){
  initNav(); initCountdown(); initGuideAccordion();
  await Promise.all([buildSchedule(), buildTopStrip(), buildPlaces()]);
  if (new Date().getDay() === 6) setInterval(buildTopStrip, 30000);
}
document.addEventListener("DOMContentLoaded", init);
