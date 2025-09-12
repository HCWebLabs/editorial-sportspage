// assets/js/app.mjs
const BASE = (()=>{ let p=location.pathname.replace(/\/index\.html$/,""); if(p.endsWith("/")) p=p.slice(0,-1); return p||""; })();
const DATA = `${BASE}/data`;
const ICS_HREF = `${DATA}/ut_next.ics`;

const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
async function j(rel){ const r=await fetch(`${DATA}/${rel}?t=${Date.now()}`); if(!r.ok) throw new Error(`${r.status} ${rel}`); return r.json(); }

/* NAV */
function initNav(){ const h=$(".site-header"), b=$(".nav-toggle"), n=$("#primaryNav"); if(!h||!b||!n) return;
  b.addEventListener("click",()=>{ const o=h.getAttribute("data-open")==="true"; h.setAttribute("data-open",String(!o)); b.setAttribute("aria-expanded",String(!o)); });
  n.addEventListener("click",e=>{ if(e.target.closest("a")){ h.setAttribute("data-open","false"); b.setAttribute("aria-expanded","false"); }});
}

/* COUNTDOWN */
function setCountdownKickoff(iso){ const el=$("#countdown"); if(el && iso) el.setAttribute("data-kickoff", iso); }
function initCountdown(){ const el=$("#countdown"); if(!el) return;
  const t0 = new Date(el.getAttribute("data-kickoff")||0).getTime();
  const days=$("#cd-days"),hrs=$("#cd-hrs"),mins=$("#cd-min"),secs=$("#cd-sec");
  const tick=()=>{ if(!t0||!days) return; let d=Math.max(0,Math.floor((t0-Date.now())/1000));
    const D=Math.floor(d/86400); d%=86400; const H=Math.floor(d/3600); d%=3600; const M=Math.floor(d/60); const S=d%60;
    days.textContent=String(D).padStart(2,"0"); hrs.textContent=String(H).padStart(2,"0"); mins.textContent=String(M).padStart(2,"0"); secs.textContent=String(S).padStart(2,"0");
  }; tick(); setInterval(tick,1000);
}

/* GUIDE */
function initGuideAccordion(){ const extra=$("#guideExtra"), btn=$("#guideMore"); if(!extra||!btn) return;
  extra.hidden=true; extra.classList.add("is-collapsible");
  btn.addEventListener("click",()=>{ const o=!extra.hidden; extra.hidden=o; extra.classList.toggle("is-open",!o);
    btn.setAttribute("aria-expanded",String(!o)); btn.innerHTML=o?`<i class="fa-solid fa-angles-down"></i> See more`:`<i class="fa-solid fa-angles-up"></i> See less`; });
}

/* Helpers */
function formatTimeET(iso){ if(!iso) return ""; return new Date(iso).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZone:"America/New_York", timeZoneName:"short" }); }
function resultForRow(g){ const has=g.home_points!=null || g.away_points!=null; if(!has) return "";
  const isAway=String(g.away_team||"").includes("Tennessee"); const ut=isAway?g.away_points:g.home_points; const opp=isAway?g.home_points:g.away_points;
  const w=ut>opp?"W":ut<opp?"L":"T"; return `${w} ${ut}–${opp}`; }
const homeAway=g=>String(g.home_team||"").includes("Tennessee")?"Home":(g.neutral_site?"Neutral":"Away");

/* Calendar CTA helpers */
function ensureCtaRows(){ const mk=(a,b)=>{ if(!a||!b) return; if(a.parentElement?.classList?.contains("btn-row")) return;
  const row=document.createElement("div"); row.className="btn-row"; a.parentElement.insertBefore(row,a); row.append(a,b); };
  mk($("#addToCalendar"), $("#downloadIcs") || $("#nextCard a[href*='.ics']"));
  mk($(".strip-bottom .addToCalendar"), $(".strip-bottom a[href*='.ics']"));
}
function setCalendarLinks(isoStart,title,venue){
  const s=new Date(isoStart), e=new Date(s.getTime()+3*60*60*1000);
  const fmt=d=>d.toISOString().replace(/[-:]|\.\d{3}/g,"");
  const gcal=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(s)}/${fmt(e)}&location=${encodeURIComponent(venue)}&details=${encodeURIComponent("Unofficial Gameday Hub")}`;
  const top=$("#addToCalendar"), bot=$(".strip-bottom .addToCalendar"); if(top) top.href=gcal; if(bot) bot.href=gcal;
  [$("#downloadIcs")||$("#nextCard a[href*='.ics']"), $(".strip-bottom a[href*='.ics']")].forEach(a=>{ if(a) a.href=`${DATA}/ut_next.ics?t=${Date.now()}`; });
  ensureCtaRows();
}

/* SCHEDULE */
async function buildSchedule(){
  const t=$("#schedTable"); if(!t) return;
  const meta=await j("meta_current.json").catch(()=>({week:"—",lastUpdated:"—"}));
  const sched=await j("ut_2025_schedule.json").catch(()=>[]);
  $("#updatedAt2") && ($("#updatedAt2").textContent = meta.lastUpdated?.replace("T"," ").replace("Z","") || "—");
  sched.sort((a,b)=>(a.week||0)-(b.week||0));
  $("#schedRows").innerHTML = sched.map((g,i)=>`<tr${i>=3?` data-extra="true"`:""}>
    <td>${formatTimeET(g.start_time) || "TBA"}</td>
    <td>${(String(g.home_team||"").includes("Tennessee")?g.away_team:g.home_team)||""}</td>
    <td>${homeAway(g)}</td><td>${g.tv||"—"}</td><td>${resultForRow(g)}</td>`).join("");
  t.classList.add("table-collapsed"); const wrap=t.closest(".table-wrap"); if(wrap) wrap.setAttribute("data-collapsed","true");
  const btn=$("#schedMore"); if(btn){ btn.addEventListener("click",()=>{ const c=t.classList.contains("table-collapsed");
      t.classList.toggle("table-collapsed", !c?true:false); const now=t.classList.contains("table-collapsed");
      if(wrap) wrap.setAttribute("data-collapsed",String(now)); btn.setAttribute("aria-expanded",String(!now));
      btn.innerHTML = now?`<i class="fa-solid fa-angles-down"></i> See more`:`<i class="fa-solid fa-angles-up"></i> See less`; });
    btn.innerHTML=`<i class="fa-solid fa-angles-down"></i> See more`; btn.setAttribute("aria-expanded","false"); }
}

/* SCORE / RANK / ODDS */
function setDotState(el,s){ if(el) el.setAttribute("data-state",s); }
function setBothScoreboxes(text,state="red"){ $("#scoreMsg") && ($("#scoreMsg").textContent=text); setDotState($("#scoreDot"),state); $$(".scoreMsg").forEach(n=>n.textContent=text); $$(".scoreDot").forEach(n=>setDotState(n,state)); }

/* Robust: rehydrate current game from schedule when fields are missing */
function pickNextFromSchedule(sched){
  const f=sched.filter(g=>g.start_time).sort((a,b)=>new Date(a.start_time)-new Date(b.start_time));
  const now=Date.now(); return f.find(g=>new Date(g.start_time).getTime()>now) || null;
}
function rehydrateGame(game, sched){
  if (!game) return pickNextFromSchedule(sched);
  if ((game.home_team && game.away_team) || !sched?.length) return game;
  const byId = game.id ? sched.find(g=>g.id===game.id) : null;
  if (byId) return byId;
  if (game.start_time){
    const t = new Date(game.start_time).getTime();
    const byTime = sched.find(g=>g.start_time && new Date(g.start_time).getTime()===t);
    if (byTime) return byTime;
  }
  return pickNextFromSchedule(sched);
}

async function buildTopStrip(){
  const [meta, rawGame, ranks, lines, sched] = await Promise.all([
    j("meta_current.json").catch(()=>({week:"—"})),
    j("current/ut_game.json").catch(()=>null),
    j("current/rankings.json").catch(()=>[]),
    j("current/ut_lines.json").catch(()=>[]),
    j("ut_2025_schedule.json").catch(()=>[])
  ]);

  // Make sure we have a fully populated game
  const game = rehydrateGame(rawGame, sched);

  if (!game || !game.start_time){
    setBothScoreboxes("No UT game found for this week.","red");
    $("#nextLine") && ($("#nextLine").textContent="—");
    $("#nextVenue") && ($("#nextVenue").textContent="");
  } else {
    const away = `${game.away_team} ${game.away_points ?? ""}`.trim();
    const home = `${game.home_team} ${game.home_points ?? ""}`.trim();
    const when = formatTimeET(game.start_time);
    const status = (game.status||"").toLowerCase();
    const msg = `${away} @ ${home} — ${status || when}`;
    const state = status.includes("final") ? "red" : status.includes("in progress") ? "green" : "yellow";
    setBothScoreboxes(msg, state);

    const opp = String(game.home_team||"").includes("Tennessee") ? game.away_team : game.home_team;
    $("#nextLine") && ($("#nextLine").textContent = `Week ${meta.week}: Tennessee vs ${opp} — ${when}`);
    $(".nextLine") && ($(".nextLine").textContent = `Week ${meta.week}: Tennessee vs ${opp} — ${when}`);
    const venue = game.venue || "Neyland Stadium";
    $("#nextVenue") && ($("#nextVenue").textContent = venue);
    $(".nextVenue") && ($(".nextVenue").textContent = venue);

    setCalendarLinks(game.start_time, `Tennessee vs ${opp}`, venue);
    setCountdownKickoff(game.start_time);
  }

  // Rankings (AP + Coaches)
  let apR="NR", coR="NR";
  if (ranks && ranks.polls){
    const ap = ranks.polls.find(p=>(p.poll||"").toLowerCase().includes("ap"));
    const co = ranks.polls.find(p=>(p.poll||"").toLowerCase().includes("coach"));
    const pick = p=>{ const arr=p?.ranks||p?.teams||[]; const hit=arr.find(x=>(x.school||x.team||"").includes("Tennessee")); return hit?.rank ?? "NR"; };
    apR = ap?pick(ap):apR; coR = co?pick(co):coR;
  }
  const rankLine = `AP: ${apR}  •  Coaches: ${coR}`;
  $("#rankLine") && ($("#rankLine").textContent=rankLine);
  $$(".rankLine").forEach(n=>n.textContent=rankLine);

  // Odds
  let oddsText="Odds data coming soon.";
  if (Array.isArray(lines) && lines.length){
    const L = lines[0]; const first=(L.lines&&L.lines[0])||L;
    const provider=(L.provider||L.providerName||first?.provider)??"—";
    const spread=first?.spread ?? first?.formattedSpread ?? "—";
    const ou=first?.overUnder ?? first?.total ?? "—";
    oddsText=`${provider}: spread ${spread}, O/U ${ou}`;
  }
  $("#oddsLine") && ($("#oddsLine").textContent=oddsText);
}

/* PLACES */
async function buildPlaces(){
  const list=$("#placesList"), empty=$("#placesEmpty"); if(!list) return;
  const places=await j("manual/places_knoxville.json").catch(()=>[]);
  if(!places.length){ if(empty) empty.hidden=false; return; }
  if(empty) empty.hidden=true;
  list.innerHTML=places.map(p=>`<li><i class="fa-solid fa-location-dot"></i><span><strong>${p.name}</strong> — ${p.tip||p.kind||""}</span></li>`).join("");
}

/* INIT */
async function init(){
  initNav(); initCountdown(); initGuideAccordion();
  await Promise.all([buildSchedule(), buildTopStrip(), buildPlaces()]);
  if (new Date().getDay()===6) setInterval(buildTopStrip, 30000);
}
document.addEventListener("DOMContentLoaded", init);
