(() => {
  "use strict";

  // ---------- Path helpers ----------
  const BASE = location.pathname.includes("/editorial-sportspage/")
    ? "/editorial-sportspage/" : (location.pathname.endsWith("/") ? "/" : "./");
  const PATH = {
    meta:       BASE + "data/meta.json",
    next:       BASE + "data/next.json",
    schedule:   BASE + "data/schedule.json",
    specials:   BASE + "data/specials.json",
    places:     BASE + "data/places.json",
  };

  // ---------- Tiny DOM utils ----------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const setText = (sel, txt) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.textContent = txt ?? ""; };
  const setHTML = (sel, html) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.innerHTML = html ?? ""; };
  const show = (sel, yes=true) => { const el = typeof sel === "string" ? $(sel) : sel; if (el){ el.hidden = !yes; el.style.display = yes ? "" : "none"; } };
  const setAllText = (sel, txt) => $$(sel).forEach(el => el.textContent = txt ?? "");
  const setAllHref = (sel, href) => $$(sel).forEach(el => el.setAttribute("href", href || "#"));
  const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const pad2 = n => String(n).padStart(2,"0");
  const fetchJSON = async (url) => { try { const r = await fetch(url, { cache:"no-store" }); if (!r.ok) throw new Error(r.status); return await r.json(); } catch { return null; } };
  const fmtDT = d => d?.toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});

  // ---------- Countdown ----------
  let CD = null;
  const stopCD = () => { if (CD) clearInterval(CD); CD = null; };
  function startCD(target){
    const box = $("#countdown"); if (!box || !(target instanceof Date) || isNaN(target)) return;
    const dEl=$("#cd-days"),hEl=$("#cd-hrs"),mEl=$("#cd-min"),sEl=$("#cd-sec");
    const tick=()=>{ const now=new Date(); let ms=target-now; if(ms<=0) ms=0;
      const d=Math.floor(ms/86400000), h=Math.floor(ms%86400000/3600000),
            m=Math.floor(ms%3600000/60000), s=Math.floor(ms%60000/1000);
      if(dEl)dEl.textContent=pad2(d); if(hEl)hEl.textContent=pad2(h);
      if(mEl)mEl.textContent=pad2(m); if(sEl)sEl.textContent=pad2(s);
      if(ms===0) stopCD();
    };
    stopCD(); tick(); CD=setInterval(tick,1000);
  }
  function setCDTarget(dateMaybe){
    const box=$("#countdown"); if(!box) return;
    if(dateMaybe instanceof Date && !isNaN(dateMaybe)){ show(box,true); box.dataset.kickoff=dateMaybe.toISOString(); startCD(dateMaybe); return; }
    const attr=box.getAttribute("data-kickoff"); if(attr){ const d=new Date(attr); if(!isNaN(d)){ show(box,true); startCD(d); return; } }
    show(box,false); stopCD();
  }

  // ---------- UI helpers ----------
  function initNav(){ const header=$(".site-header"), btn=$(".nav-toggle"); if(!header||!btn) return;
    btn.addEventListener("click",()=>{ const open=header.getAttribute("data-open")==="true";
      header.setAttribute("data-open",open?"false":"true"); btn.setAttribute("aria-expanded",open?"false":"true"); }); }
  function initGuide(){ const btn=$("#guideMore"), area=$("#guideExtra"); if(!btn||!area) return;
    area.classList.add("is-collapsible"); const setOpen=open=>{ btn.setAttribute("aria-expanded",open?"true":"false");
      if(open){ area.hidden=false; area.style.maxHeight=area.scrollHeight+"px"; area.classList.add("is-open"); }
      else{ area.style.maxHeight="0px"; area.classList.remove("is-open"); setTimeout(()=>area.hidden=true,300); } };
    setOpen(false); btn.addEventListener("click",()=>{ const open=btn.getAttribute("aria-expanded")==="true";
      setOpen(!open); btn.innerHTML=open?'<i class="fa-solid fa-angles-down"></i> See more':'<i class="fa-solid fa-angles-up"></i> See less'; }); }
  function initSchedCollapse(){ const btn=$("#schedMore"), wrap=$("#schedTable")?.closest(".table-wrap"); if(!btn||!wrap) return;
    const N=6, setCol=col=>{ $("#schedTable")?.classList.toggle("table-collapsed",col);
      btn.setAttribute("aria-expanded",col?"false":"true");
      btn.innerHTML=col?'<i class="fa-solid fa-angles-down"></i> See more':'<i class="fa-solid fa-angles-up"></i> See less';
      $$("#schedRows>tr").forEach((tr,i)=>tr.setAttribute("data-extra", i>=N?"true":"false"));
      wrap.setAttribute("data-collapsed", col?"true":"false"); };
    setCol(true); btn.addEventListener("click",()=>{ const col=$("#schedTable")?.classList.contains("table-collapsed"); setCol(!col); }); }

  function setScoreDot(state){ const d=$("#scoreDot"); if(d) d.setAttribute("data-state", state); $$(".scoreDot").forEach(x=>x.setAttribute("data-state",state)); }
  const setScoreMsg = msg => { setText("#scoreMsg", msg); setAllText(".scoreMsg", msg); };
  const setNext = (line, venue) => { setText("#nextLine", line); setAllText(".nextLine", line); setText("#nextVenue", venue); setAllText(".nextVenue", venue); };
  const calHref = ({opponent,date,home}) => {
    if(!date) return "#"; const start=new Date(date), end=new Date(start.getTime()+3*3600*1000);
    const toICS=d=>d.toISOString().replace(/[-:]/g,"").replace(".000Z","Z");
    const text=encodeURIComponent(`Tennessee ${home?"vs":"at"} ${opponent||""}`.trim());
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${toICS(start)}/${toICS(end)}`;
  };

  const resultText = r => {
    if (r?.result) return r.result;
    const hp=Number(r?.home_points), ap=Number(r?.away_points);
    if(!Number.isFinite(hp)||!Number.isFinite(ap)) return "—";
    const home=r?.is_home===true || r?.home===true, us=home?hp:ap, them=home?ap:hp, wl=us>them?"W":us<them?"L":"T";
    return `${wl} ${us}-${them}`;
  };

  function opponentOfRow(r){
    if (r?.opponent) return r.opponent;                // preferred (we add this server-side now)
    if (r?.home_team && r?.away_team) {                // fallback if ever present
      return (r.home_team === "Tennessee") ? r.away_team : r.home_team;
    }
    return "";
  }

  async function paintSchedule(url){
    const tbody=$("#schedRows"), stamp=$("#updatedAt2"); if(!tbody) return;
    const rows=(await fetchJSON(url))||[]; if(!Array.isArray(rows)){ setHTML(tbody,""); return; }
    rows.sort((a,b)=> new Date(a.date) - new Date(b.date));
    const html=rows.map(r=>{
      const d=new Date(r.date), opp=esc(opponentOfRow(r)),
            ha=(r.is_home===true||r.home===true)?"H":"A", tv=esc(r.tv||"TBD"), res=esc(resultText(r));
      return `<tr>
        <td>${esc(d.toLocaleDateString(undefined,{month:"short",day:"2-digit",year:"numeric"}))}</td>
        <td>${opp}</td><td>${ha}</td><td>${tv}</td><td>${res}</td>
      </tr>`;
    }).join("");
    setHTML(tbody, html);
    if (stamp) stamp.textContent = new Date().toLocaleString();
    console.info("Schedule:", rows.length);
  }

  async function paintNext(nextUrl, schedUrl){
    setScoreDot("red"); setScoreMsg("No game in progress."); setNext("No upcoming game found.",""); setAllHref("#addToCalendar, .addToCalendar","#");

    let next = await fetchJSON(nextUrl);
    const sched = (await fetchJSON(schedUrl)) || [];

    if (!next && sched.length){
      const now=Date.now();
      next = sched
        .filter(r => r.date && +new Date(r.date) >= now - 6*3600*1000 && !r.completed)
        .sort((a,b)=> +new Date(a.date) - +new Date(b.date))[0] || null;
      if (next) console.info("Derived next from schedule:", next);
    }
    if (!next){ setCDTarget(null); return; }

    const home = next.is_home===true || next.home===true;
    const opp  = next.opponent || opponentOfRow(next) || "";
    const when = next.date ? new Date(next.date) : null;
    const tv   = next.tv || "";
    const venue = next.venue_name || next.venue || "";

    if (when && !isNaN(when)) {
      const line = `${fmtDT(when)} • ${home?"vs":"at"} ${opp}${tv?` • ${tv}`:""}`;
      setNext(line, venue);
      setCDTarget(when);
      setAllHref("#addToCalendar, .addToCalendar", calHref({opponent:opp, date:next.date, home}));
    }

    const status=(next.status||"").toLowerCase();
    if (status==="in_progress"){
      const hp=Number(next.home_points??NaN), ap=Number(next.away_points??NaN),
            us=home?hp:ap, them=home?ap:hp;
      setScoreDot("green");
      setScoreMsg(Number.isFinite(us)&&Number.isFinite(them) ? `${us} – ${them} ${home?"vs":"at"} ${opp}` : "Game in progress.");
    } else if (status==="final"){
      setScoreDot("red"); setScoreMsg("Final");
    } else if (status){
      setScoreDot("yellow"); setScoreMsg("Not started.");
    }
  }

  async function paintSpecials(url){
    const grid=$("#specialsGrid"); if(!grid) return;
    const list=(await fetchJSON(url))||[];
    if(!Array.isArray(list)||list.length===0){ setHTML(grid,'<div class="muted">No specials yet.</div>'); return; }
    setHTML(grid, list.map(s=>{
      const t=esc(s.title||"Special"), b=esc(s.biz||""), a=esc(s.area||""), w=esc(s.time||""),
            link=s.link?`<a href="${esc(s.link)}" target="_blank" rel="noopener">Details</a>`:"";
      return `<article class="card"><header><h3 class="tiny">${t}</h3></header><div class="card-body">
        ${b?`<div class="small">${b}${a?` — <span class="tiny">${a}</span>`:""}</div>`:""}
        ${w?`<div class="tiny muted">${w}</div>`:""}
        ${link?`<div class="mt-1">${link}</div>`:""}
      </div></article>`;
    }).join(""));
  }

  async function paintPlaces(url){
    const ul=$("#placesList"), empty=$("#placesEmpty"); if(!ul||!empty) return;
    const places=(await fetchJSON(url))||[];
    if(!Array.isArray(places)||places.length===0){ show(empty,true); ul.innerHTML=""; return; }
    show(empty,false);
    setHTML(ul, places.slice(0,20).map(p=>{
      const name=esc(p.name||"Place"), addr=esc(p.formatted_address||p.address||"");
      const lat=p.lat??null, lng=p.lng??null;
      const maps = lat!=null&&lng!=null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${addr}`)}`;
      return `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>
        <a href="${maps}" target="_blank" rel="noopener">${name}</a>${addr?`<div class="tiny muted">${addr}</div>`:""}</li>`;
    }).join(""));
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    initNav(); initGuide(); initSchedCollapse();
    setCDTarget(null); // fallback until data arrives

    const meta = await fetchJSON(`${PATH.meta}?t=${Date.now()}`);
    const v = meta?.updated_at ? encodeURIComponent(meta.updated_at) : Date.now();
    const V = (u) => `${u}?v=${v}`;

    await Promise.all([
      paintNext(V(PATH.next), V(PATH.schedule)),
      paintSchedule(V(PATH.schedule)),
      paintSpecials(V(PATH.specials)),
      paintPlaces(V(PATH.places)),
    ]);
    console.info("Data version:", v);
  });
})();
