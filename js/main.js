/* ====== editorial-sportspage/js/main.js ====== */

/* small helpers */
document.documentElement.classList.remove('no-js');
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[c]));

/* DATA PATHS — relative to repo root (works locally & on GH Pages) */
const PATH_NEXT     = 'data/next.json';
const PATH_SCHEDULE = 'data/schedule.json';
const PATH_PLACES   = 'data/places.json';
const PATH_SPECIALS = 'data/specials.json';

/* countdown (header) */
function bootCountdown(){
  const wrap = $('#countdown'); if(!wrap) return;
  const iso = wrap.dataset.kickoff; if(!iso) return;
  const d=$('#cd-days'),h=$('#cd-hrs'),m=$('#cd-min'),s=$('#cd-sec');
  const pad=n=>String(n).padStart(2,'0');
  const tick=()=>{
    const diff = new Date(iso) - new Date();
    if(diff<=0){ d.textContent=h.textContent=m.textContent=s.textContent='00'; return; }
    let t=Math.floor(diff/1000);
    const days=Math.floor(t/86400); t%=86400;
    const hrs =Math.floor(t/3600);  t%=3600;
    const mins=Math.floor(t/60);    t%=60;
    d.textContent=pad(days); h.textContent=pad(hrs); m.textContent=pad(mins); s.textContent=pad(t);
  };
  tick(); setInterval(tick,1000);
}

/* mobile nav */
function bootNav(){
  const header=$('.site-header'), btn=$('.nav-toggle'); if(!header||!btn) return;
  btn.addEventListener('click',()=>{
    const open=header.dataset.open==='true';
    header.dataset.open=String(!open);
    btn.setAttribute('aria-expanded',String(!open));
  });
}

/* updated timestamps (optional) */
function setUpdated(){
  const stamp=new Date().toLocaleString([], {dateStyle:'medium', timeStyle:'short'});
  $('#updatedAt')?.replaceChildren(stamp);
  $('#updatedAt2')?.replaceChildren(stamp);
}

/* live game status dots + text */
function setScoreSignal(nextIso){
  const dots=$$('#scoreDot, .scoreDot'); const msgs=$$('#scoreMsg, .scoreMsg');
  let state='red', text='No game in progress.';
  if(nextIso){
    const start=new Date(nextIso);
    const end=new Date(start.getTime()+5*60*60*1000);
    const now=new Date();
    const dayMatch = start.toDateString()===now.toDateString();
    if(now>=start && now<=end){ state='green'; text='Game in progress.'; }
    else if(dayMatch && now<start){ state='yellow'; text='Gameday — awaiting kickoff.'; }
  }
  dots.forEach(d=>d.dataset.state=state); msgs.forEach(m=>m.textContent=text);
}

/* build ICS (for right-click “download .ics”) */
const toICS = d => new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
function buildICS({title,start,end,location='',description=''}) {
  const uid='tn-'+Date.now()+'@gameday';
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:'+uid,'DTSTAMP:'+toICS(new Date()),'DTSTART:'+toICS(start),'DTEND:'+toICS(end),
    'SUMMARY:'+title,'LOCATION:'+location,'DESCRIPTION:'+description,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
}

/* NEXT game card + hero line + calendar links */
async function paintNext(){
  try{
    const next = await fetch(PATH_NEXT,{cache:'no-store'}).then(r=>r.json()).catch(()=>null);
    const elsNext=$$('#nextLine, .nextLine');
    const elsVen =$$('#nextVenue, .nextVenue');
    const calLinks=$$('#addToCalendar, .addToCalendar');
    const heroLine=$('.heroLine');

    if(!next || !next.date || !next.opponent){
      elsNext.forEach(n=>n.textContent='No upcoming game found.');
      elsVen.forEach(v=>v.textContent='');
      heroLine && (heroLine.textContent='No upcoming game found.');
      setScoreSignal(null);
      return null;
    }

    const when = new Date(next.date).toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
    const ha   = next.home===true ? 'Home' : next.home===false ? 'Away' : '—';
    const line = `Tennessee vs ${next.opponent} — ${when} (${ha})`;

    elsNext.forEach(n=>n.textContent=line);
    elsVen.forEach(v=>v.textContent=next.venue?`Venue: ${next.venue}`:'');
    heroLine && (heroLine.textContent=line);
    setScoreSignal(next.date);

    /* calendar links */
    const start=new Date(next.date), end=new Date(start.getTime()+3*60*60*1000);
    const title=`Tennessee vs ${next.opponent}`, location=next.venue||'', details='TN Gameday';
    const dates = toICS(start)+'/'+toICS(end);
    const gcal  = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text='+encodeURIComponent(title)
      + '&dates='+encodeURIComponent(dates)
      + '&location='+encodeURIComponent(location)
      + '&details='+encodeURIComponent(details);

    const ics = URL.createObjectURL(new Blob([buildICS({title,start,end,location,description:details})],{type:'text/calendar'}));
    const file = `${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`;

    calLinks.forEach(a=>{
      a.href=gcal; a.dataset.ics=ics; a.download=file;
      a.addEventListener('contextmenu',()=>{a.href=ics;},{once:true});
      a.addEventListener('mousedown',e=>{
        a.href = (e.button===1||e.ctrlKey||e.metaKey||e.shiftKey) ? ics : gcal;
      });
    });
    window.addEventListener('beforeunload',()=>URL.revokeObjectURL(ics));
    return next.date;
  }catch(e){ console.error('next.json error',e); return null; }
}

/* Schedule table (+ “See more”) */
async function paintSchedule(){
  const tbody=$('#schedRows'), btn=$('#schedMore'), table=$('#schedTable'), wrap=table?.closest('.table-wrap');
  if(!tbody||!btn||!table||!wrap) return;
  try{
    let rows = await fetch(PATH_SCHEDULE,{cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
    rows = (rows||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    tbody.innerHTML = rows.map(g=>{
      const ha=g.home===true?'H':g.home===false?'A':'—';
      const tv=g.tv??'TBD', res=g.result??'—';
      return `<tr>
        <td>${new Date(g.date).toLocaleDateString([], {month:'short', day:'2-digit', year:'numeric'})}</td>
        <td>${esc(g.opponent||'—')}</td>
        <td>${ha}</td><td>${esc(tv)}</td><td>${esc(res)}</td>
      </tr>`;
    }).join('');

    const COLLAPSE_COUNT=3;
    [...tbody.querySelectorAll('tr')].forEach((tr,i)=>{ if(i>=COLLAPSE_COUNT) tr.setAttribute('data-extra','true'); });

    const setCollapsed=(c)=>{
      table.classList.toggle('table-collapsed',c);
      wrap.dataset.collapsed=c?'true':'false';
      btn.setAttribute('aria-expanded',String(!c));
      btn.innerHTML = c
        ? '<i class="fa-solid fa-angles-down"></i> See more'
        : '<i class="fa-solid fa-angles-up"></i> See less';
      if(rows.length<=COLLAPSE_COUNT) btn.style.display='none';
    };
    setCollapsed(true);
    btn.addEventListener('click',()=>setCollapsed(!table.classList.contains('table-collapsed')));
  }catch(e){ console.error('schedule.json error',e); }
}

/* Specials grid (optional) */
async function paintSpecials(){
  const grid=$('#specialsGrid'); if(!grid) return;
  try{
    const list=await fetch(PATH_SPECIALS,{cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
    if(!list||!list.length){ grid.innerHTML='<div class="muted">No specials yet.</div>'; return; }
    grid.innerHTML=list.map(s=>{
      const title=esc(s.title||`${s.biz||''} Special`);
      const biz=esc(s.biz||''), area=esc(s.area||''), when=esc(s.time||s.time_window||''), link=s.link?`<a href="${s.link}" target="_blank" rel="noopener">Details</a>`:'';
      return `<article class="card"><header><h3 class="tiny">${title}</h3></header>
        <div class="card-body">${biz?`<div class="small">${biz}${area?` — ${area}`:''}</div>`:''}${when?`<div class="tiny muted">${when}</div>`:''}<div class="mt-1">${link}</div></div>
      </article>`;
    }).join('');
  }catch(e){ console.error('specials.json error',e); }
}

/* Places (optional) */
async function paintPlaces(){
  const ul=$('#placesList'), empty=$('#placesEmpty'); if(!ul) return;
  try{
    const places=await fetch(PATH_PLACES,{cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
    if(!places||!places.length){ empty.style.display='block'; return; }
    empty.style.display='none';
    ul.innerHTML=places.slice(0,8).map(p=>{
      const n=esc(p.name||'Place'), a=esc(p.formatted_address||p.address||'');
      const {lat,lng}=p; const map=(lat!=null && lng!=null)
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : (p.maps_url||'#');
      return `<li><a href="${map}" target="_blank" rel="noopener">${n}</a><div class="tiny muted">${a}</div></li>`;
    }).join('');
  }catch(e){ console.error('places.json error',e); }
}

/* Guide “See more” (no peeking) */
function bootGuideAccordion(){
  const btn=$('#guideMore'), extra=$('#guideExtra'); if(!btn||!extra) return;
  extra.classList.add('is-collapsible');      // enable CSS transitions
  extra.hidden=false;                         // manage with max-height instead
  extra.style.maxHeight='0px';
  extra.setAttribute('aria-hidden','true');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<i class="fa-solid fa-angles-down"></i> See more';

  let anim=false;
  const end=cb=>{ const t=setTimeout(cb,350); extra.addEventListener('transitionend',()=>{clearTimeout(t); cb();},{once:true}); };

  btn.addEventListener('click',e=>{
    e.preventDefault(); if(anim) return; anim=true;
    const open=btn.getAttribute('aria-expanded')==='true';
    if(open){
      extra.classList.remove('is-open');
      extra.style.maxHeight = extra.scrollHeight+'px'; void extra.offsetHeight;
      extra.style.maxHeight = '0px';
      end(()=>{ extra.setAttribute('aria-hidden','true'); btn.setAttribute('aria-expanded','false'); btn.innerHTML='<i class="fa-solid fa-angles-down"></i> See more'; anim=false; });
    }else{
      extra.removeAttribute('aria-hidden');
      extra.style.maxHeight='0px';
      requestAnimationFrame(()=>{
        extra.style.maxHeight=extra.scrollHeight+'px';
        btn.setAttribute('aria-expanded','true'); btn.innerHTML='<i class="fa-solid fa-angles-up"></i> See less';
        end(()=>{ extra.classList.add('is-open'); extra.style.maxHeight=''; anim=false; });
      });
    }
  });

  window.addEventListener('resize',()=>{ if(btn.getAttribute('aria-expanded')==='true'){ extra.classList.add('is-open'); extra.style.maxHeight=''; }});
}

/* boot */
(async function(){
  bootNav(); bootCountdown(); bootGuideAccordion(); setUpdated();
  await paintNext();
  await Promise.all([paintSchedule(), paintSpecials(), paintPlaces()]);
  setInterval(setUpdated, 60*1000);
})();

/* weather widget loader (3rd-party, OK if it logs CORS warnings) */
(function(d,s,id){ if(d.getElementById(id)) return;
  const js=d.createElement(s); js.id=id; js.src='https://weatherwidget.io/js/widget.min.js';
  d.head.appendChild(js);
})(document,'script','weatherwidget-io-js');
