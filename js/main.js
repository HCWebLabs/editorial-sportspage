(()=>{"use strict";

/* =========================
   Paths (root vs GH Pages)
========================= */
const BASE = window.location.pathname.includes("/editorial-sportspage/")
  ? "/editorial-sportspage/"
  : "./";

const PATH = {
  NEXT:       BASE + "/data/next.json",
  SCHEDULE:   BASE + "/data/schedule.json",
  SPECIALS:   BASE + "/data/specials.json",
  PLACES:     BASE + "/data/places.json",
  META:       BASE + "/data/meta.json",
  SCOREBOARD: BASE + "/data/scoreboard.json"
};

/* ============== tiny utils ============== */
const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
const setText = (sel,txt)=>{ const el = typeof sel==="string"?$(sel):sel; if(el) el.textContent = txt??""; };
const setHTML = (sel,html)=>{ const el = typeof sel==="string"?$(sel):sel; if(el) el.innerHTML = html??""; };
const show = (sel,yes=true)=>{ const el = typeof sel==="string"?$(sel):sel; if(!el) return; el.hidden = !yes; el.style.display = yes? "":"none"; };
const pad2 = n=>String(n).padStart(2,"0");
const escapeHtml = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fetchJSON = async (url)=>{ try{ const r = await fetch(url,{cache:"no-store"}); if(!r.ok) return null; return await r.json(); }catch{return null;} };
const fmtDate = d => d?.toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});

/* ============== mobile nav ============== */
function initNav(){
  const header=$(".site-header"), btn=$(".nav-toggle");
  if(!header||!btn) return;
  btn.addEventListener("click",()=>{
    const open = header.getAttribute("data-open")==="true";
    header.setAttribute("data-open", open?"false":"true");
    btn.setAttribute("aria-expanded", open?"false":"true");
  });
}

/* ============== countdown ============== */
let CD_TIMER=null;
function stopCountdown(){ if(CD_TIMER) clearInterval(CD_TIMER); CD_TIMER=null; }
function startCountdown(target){
  const box=$("#countdown"); if(!box || !(target instanceof Date) || isNaN(target)) return;
  const dEl=$("#cd-days"), hEl=$("#cd-hrs"), mEl=$("#cd-min"), sEl=$("#cd-sec");
  const tick=()=>{
    const now=new Date(); let diff=target-now; if(diff<=0) diff=0;
    const days=Math.floor(diff/86_400_000);
    const hrs =Math.floor((diff%86_400_000)/3_600_000);
    const mins=Math.floor((diff%3_600_000)/60_000);
    const secs=Math.floor((diff%60_000)/1_000);
    if(dEl) dEl.textContent=pad2(days);
    if(hEl) hEl.textContent=pad2(hrs);
    if(mEl) mEl.textContent=pad2(mins);
    if(sEl) sEl.textContent=pad2(secs);
    if(diff===0) stopCountdown();
  };
  tick(); stopCountdown(); CD_TIMER=setInterval(tick,1000);
}
function setCountdownTarget(dateMaybe){
  const box=$("#countdown"); if(!box) return;
  if(dateMaybe instanceof Date && !isNaN(dateMaybe)){
    show(box,true); box.setAttribute("data-kickoff", dateMaybe.toISOString()); startCountdown(dateMaybe); return;
  }
  const attr=box.getAttribute("data-kickoff");
  if(attr){ const d=new Date(attr); if(!isNaN(d)){ show(box,true); startCountdown(d); return; } }
  show(box,false); stopCountdown();
}

/* ============== guide accordion ============== */
function initGuideAccordion(){
  const btn=$("#guideMore"), area=$("#guideExtra"); if(!btn||!area) return;
  area.classList.add("is-collapsible");
  const setOpen=(open)=>{
    btn.setAttribute("aria-expanded", open?"true":"false");
    if(open){ area.hidden=false; area.style.maxHeight=area.scrollHeight+"px"; area.classList.add("is-open"); }
    else { area.style.maxHeight="0px"; area.classList.remove("is-open"); setTimeout(()=>area.hidden=true,300); }
  };
  setOpen(false);
  btn.addEventListener("click",()=>{
    const open=btn.getAttribute("aria-expanded")==="true";
    setOpen(!open);
    btn.innerHTML = open
      ? '<i class="fa-solid fa-angles-down"></i> See more'
      : '<i class="fa-solid fa-angles-up"></i> See less';
  });
}

/* ============== schedule collapse ============== */
function initScheduleCollapse(){
  const btn=$("#schedMore"), table=$("#schedTable"), tbody=$("#schedRows"), wrap=table?.closest(".table-wrap");
  if(!btn||!table||!tbody||!wrap) return;
  const COLLAPSE_COUNT=6;
  const setCollapsed=(collapsed)=>{
    table.classList.toggle("table-collapsed",collapsed);
    btn.setAttribute("aria-expanded", collapsed?"false":"true");
    btn.innerHTML = collapsed
      ? '<i class="fa-solid fa-angles-down"></i> See more'
      : '<i class="fa-solid fa-angles-up"></i> See less';
    $$("#schedRows > tr").forEach((tr,i)=>tr.setAttribute("data-extra", i>=COLLAPSE_COUNT?"true":"false"));
    wrap.setAttribute("data-collapsed", collapsed?"true":"false");
  };
  setCollapsed(true);
  btn.addEventListener("click",()=>setCollapsed(!table.classList.contains("table-collapsed")));
}

/* ============== specials ============== */
async function paintSpecials(){
  const grid=$("#specialsGrid"); if(!grid) return;
  const list=(await fetchJSON(PATH.SPECIALS))||[];
  if(!Array.isArray(list)||!list.length){ setHTML(grid,'<div class="muted">No specials yet.</div>'); return; }
  setHTML(grid, list.map(s=>{
    const title=escapeHtml(s.title||"Special");
    const biz=escapeHtml(s.biz||"");
    const area=escapeHtml(s.area||"");
    const when=escapeHtml(s.time||"");
    const link=s.link?`<a href="${escapeHtml(s.link)}" target="_blank" rel="noopener">Details</a>`:"";
    return `
      <article class="card">
        <header><h3 class="tiny">${title}</h3></header>
        <div class="card-body">
          ${biz?`<div class="small">${biz}${area?` — <span class="tiny">${area}</span>`:""}</div>`:""}
          ${when?`<div class="tiny muted">${when}</div>`:""}
          ${link?`<div class="mt-1">${link}</div>`:""}
        </div>
      </article>`;
  }).join(""));
}

/* ============== places ============== */
async function paintPlacesList(){
  const ul=$("#placesList"), empty=$("#placesEmpty"); if(!ul||!empty) return;
  const places=(await fetchJSON(PATH.PLACES))||[];
  if(!Array.isArray(places)||!places.length){ show(empty,true); ul.innerHTML=""; return; }
  show(empty,false);
  setHTML(ul, places.slice(0,20).map(p=>{
    const name=escapeHtml(p.name||"Place");
    const addr=escapeHtml(p.formatted_address||p.address||"");
    const lat=p.lat??null, lng=p.lng??null;
    const mapsUrl = lat!=null && lng!=null
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat+","+lng)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name+" "+addr)}`;
    return `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>
      <a href="${mapsUrl}" target="_blank" rel="noopener">${name}</a>
      ${addr?`<div class="tiny muted">${addr}</div>`:""}
    </li>`;
  }).join(""));
}

/* ============== schedule table ============== */
const resultText = r=>{
  if(r?.result) return r.result;
  const hp=Number(r?.home_points), ap=Number(r?.away_points);
  if(!Number.isFinite(hp)||!Number.isFinite(ap)) return "—";
  const usHome = r?.is_home===true; // we stored Tennessee’s perspective into each row
  const us = usHome?hp:ap, them=usHome?ap:hp;
  const wl = us>them?"W":us<them?"L":"T";
  return `${wl} ${us}-${them}`;
};

async function paintSchedule(){
  const tbody=$("#schedRows"); if(!tbody) return;
  const [rows, meta] = await Promise.all([fetchJSON(PATH.SCHEDULE), fetchJSON(PATH.META)]);
  const list = Array.isArray(rows)?rows:[];
  list.sort((a,b)=> new Date(a.date)-new Date(b.date));
  setHTML(tbody, list.map(r=>{
    const d=new Date(r.date);
    const opp=escapeHtml(r.opponent||"");
    const ha = r.is_home===true ? "H":"A";
    const tv = escapeHtml(r.tv||"TBD");
    const res=escapeHtml(resultText(r));
    return `<tr>
      <td>${escapeHtml(d.toLocaleDateString(undefined,{month:"short",day:"2-digit",year:"numeric"}))}</td>
      <td>${opp}</td>
      <td>${ha}</td>
      <td>${tv}</td>
      <td>${res}</td>
    </tr>`;
  }).join(""));
  const updatedAt=$("#updatedAt2");
  if(updatedAt){
    const stamp = meta?.updated_at ? new Date(meta.updated_at) : new Date();
    updatedAt.textContent = isNaN(stamp)? "—" : stamp.toLocaleString();
  }
}

/* ============== live score & next game ============== */
function setScoreDot(state){ const d=$("#scoreDot"); if(d) d.setAttribute("data-state",state); $$(".scoreDot").forEach(x=>x.setAttribute("data-state",state)); }
function setScoreMessage(msg){ setText("#scoreMsg",msg); $$(".scoreMsg").forEach(n=>n.textContent=msg); }
function setNextLineAndVenue(line,venue){ setText("#nextLine",line); $$(".nextLine").forEach(n=>n.textContent=line); setText("#nextVenue",venue); $$(".nextVenue").forEach(n=>n.textContent=venue); }
function setHeroLine(line){ const el=$(".heroLine"); if(el) el.textContent=line; }

const calendarHref = ({opponent,date,is_home})=>{
  if(!date) return "#";
  const start=new Date(date), end=new Date(start.getTime()+3*60*60*1000);
  const toICS=d=>d.toISOString().replace(/[-:]/g,"").replace(".000Z","Z");
  const text=encodeURIComponent(`Tennessee ${is_home?"vs":"at"} ${opponent||""}`);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${toICS(start)}/${toICS(end)}`;
};

async function paintNext(){
  const next = await fetchJSON(PATH.NEXT);
  const schedule = await fetchJSON(PATH.SCHEDULE) || [];
  // defaults
  setScoreDot("red");
  setScoreMessage("No game in progress.");
  setNextLineAndVenue("No upcoming game found.","");
  $$("#addToCalendar, .addToCalendar").forEach(a=>a.setAttribute("href","#"));

  if(!next){ setCountdownTarget(null); return; }

  // enrich from schedule (opponent & any venue detail we recorded there)
  let match = Array.isArray(schedule) ? schedule.find(g=> g.id===next.id) : null;
  if(!match){
    const nd = next.date ? +new Date(next.date) : 0;
    if(nd){ match = schedule.find(g=> Math.abs(+new Date(g.date)-nd) < 6*60*60*1000 ); }
  }

  const opponent = match?.opponent || "";
  const is_home  = next.is_home === true; // <-- key change
  const when     = next.date ? new Date(next.date) : null;
  const tv       = (match?.tv ?? next.tv) || "";
  const venueStr = match?.venue || next.venue || "";

  if(when && !isNaN(when)){
    const vsat = is_home ? "vs" : "at";
    const line = `${fmtDate(when)} • ${vsat} ${opponent}${tv?` • ${tv}`:""}`;
    setNextLineAndVenue(line, venueStr);
    setHeroLine(line);
    setCountdownTarget(when);
    const cal = calendarHref({opponent,date:next.date,is_home});
    $$("#addToCalendar, .addToCalendar").forEach(a=>a.setAttribute("href",cal));
  }else{
    setCountdownTarget(null);
  }

  // Live status (simple)
  if(next.completed===true){
    setScoreDot("red");
    setScoreMessage("Final");
  }else if(when && (new Date()) < when){
    setScoreDot("yellow");
    setScoreMessage("Not started.");
  }else{
    // could read SCOREBOARD here when you want real-time
    // for now, leave the default “No game in progress.”
  }
}

/* ============== boot ============== */
document.addEventListener("DOMContentLoaded", async ()=>{
  initNav();
  initGuideAccordion();
  initScheduleCollapse();

  // show an HTML-provided countdown immediately
  setCountdownTarget(null);

  await Promise.all([
    paintNext(),
    paintSchedule(),
    paintSpecials(),
    paintPlacesList()
  ]);
});

})();
