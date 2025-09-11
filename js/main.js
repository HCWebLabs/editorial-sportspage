/* editorial-sportspage/js/main.js */

/* ===== tiny helpers ===== */
document.documentElement.classList.remove('no-js');
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

/* IMPORTANT: use paths relative to the page folder.
   This works on GitHub Pages project sites (/editorial-sportspage/) and locally. */
const PATH_NEXT     = 'data/next.json';
const PATH_SCHEDULE = 'data/schedule.json';
const PATH_PLACES   = 'data/places.json';
const PATH_SPECIALS = 'data/specials.json';

/* ===== formatting ===== */
function fmtDate(d){
  return new Date(d).toLocaleString([], {
    weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'
  });
}
function escapeHtml(s=''){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function setUpdated(){
  const t = new Date().toLocaleString([], { dateStyle:'medium', timeStyle:'short' });
  $('#updatedAt')?.replaceChildren(t);
  $('#updatedAt2')?.replaceChildren(t);
}

/* ===== countdown in header ===== */
function startHeaderCountdown(){
  const wrap = $('#countdown'); if(!wrap) return;
  const iso  = wrap.dataset.kickoff; if(!iso) return;
  const dEl=$('#cd-days'),hEl=$('#cd-hrs'),mEl=$('#cd-min'),sEl=$('#cd-sec');
  const pad2=n=>String(n).padStart(2,'0');
  function tick(){
    const now  = new Date();
    const diff = new Date(iso) - now;
    if (diff <= 0){ dEl.textContent=hEl.textContent=mEl.textContent=sEl.textContent='00'; return; }
    let secs = Math.floor(diff/1000);
    const days=Math.floor(secs/86400); secs%=86400;
    const hrs =Math.floor(secs/3600);  secs%=3600;
    const mins=Math.floor(secs/60);    secs%=60;
    dEl.textContent=pad2(days);
    hEl.textContent=pad2(hrs);
    mEl.textContent=pad2(mins);
    sEl.textContent=pad2(secs);
  }
  tick(); setInterval(tick, 1000);
}

/* ===== mobile nav ===== */
function wireNavToggle(){
  const header = document.querySelector('.site-header');
  const btn    = header?.querySelector('.nav-toggle');
  if(!header || !btn) return;
  btn.addEventListener('click', () => {
    const open = header.dataset.open === 'true';
    header.dataset.open = String(!open);
    btn.setAttribute('aria-expanded', String(!open));
  });
}

/* ===== guide accordion (robust; no “peek”) ===== */
function wireGuideMore(){
  if (window.__TN_WIRED_GUIDE__) return;
  window.__TN_WIRED_GUIDE__ = true;

  const btn   = $('#guideMore');
  const extra = $('#guideExtra');
  if(!btn || !extra) return;

  const LABEL_MORE = '<i class="fa-solid fa-angles-down"></i> See more';
  const LABEL_LESS = '<i class="fa-solid fa-angles-up"></i> See less';

  extra.classList.add('is-collapsible');
  extra.style.maxHeight = '0px';
  extra.setAttribute('aria-hidden','true');
  btn.setAttribute('aria-controls','guideExtra');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML = LABEL_MORE;

  let animating = false;

  function finish(cb){
    const t = setTimeout(cb, 350);
    const once = () => { clearTimeout(t); cb(); };
    extra.addEventListener('transitionend', once, { once:true });
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (animating) return;
    animating = true;

    const isOpen = btn.getAttribute('aria-expanded') === 'true';

    if (isOpen){
      // collapse
      extra.classList.remove('is-open');
      extra.style.maxHeight = extra.scrollHeight + 'px';
      void extra.offsetHeight;
      extra.style.maxHeight = '0px';
      finish(() => {
        extra.setAttribute('aria-hidden','true');
        btn.setAttribute('aria-expanded','false');
        btn.innerHTML = LABEL_MORE;
        animating = false;
      });
    } else {
      // expand
      extra.removeAttribute('aria-hidden');
      extra.style.maxHeight = '0px';
      requestAnimationFrame(() => {
        extra.style.maxHeight = extra.scrollHeight + 'px';
        btn.setAttribute('aria-expanded','true');
        btn.innerHTML = LABEL_LESS;
        finish(() => {
          extra.classList.add('is-open');
          extra.style.maxHeight = '';
          animating = false;
        });
      });
    }
  });

  window.addEventListener('resize', () => {
    if (btn.getAttribute('aria-expanded') === 'true'){
      extra.classList.add('is-open');
      extra.style.maxHeight = '';
    }
  });
}

/* ===== schedule table (collapsible) ===== */
async function paintSchedule(){
  const tbody = $('#schedRows');
  const btn   = $('#schedMore');
  const table = $('#schedTable');
  const wrap  = table?.closest('.table-wrap');
  if(!tbody || !btn || !table || !wrap) return;

  try{
    let rows = await fetch(PATH_SCHEDULE, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    rows = (rows||[]).slice().sort((a,b)=> new Date(a.date) - new Date(b.date));

    tbody.innerHTML = rows.map(g => {
      const ha  = g.home === true ? 'H' : g.home === false ? 'A' : '—';
      const tv  = g.tv ?? 'TBD';
      const res = g.result ?? '—';
      return `<tr>
        <td>${new Date(g.date).toLocaleDateString([], {month:'short', day:'2-digit', year:'numeric'})}</td>
        <td>${escapeHtml(g.opponent || '—')}</td>
        <td>${ha}</td>
        <td>${escapeHtml(tv)}</td>
        <td>${escapeHtml(res)}</td>
      </tr>`;
    }).join('');

    const COLLAPSE_COUNT = 3;
    [...tbody.querySelectorAll('tr')].forEach((tr, i) => { if(i >= COLLAPSE_COUNT) tr.setAttribute('data-extra','true'); });

    const setCollapsed = (collapsed) => {
      table.classList.toggle('table-collapsed', collapsed);
      wrap.dataset.collapsed = collapsed ? 'true' : 'false';
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.innerHTML = collapsed
        ? '<i class="fa-solid fa-angles-down"></i> See more'
        : '<i class="fa-solid fa-angles-up"></i> See less';
      if (rows.length <= COLLAPSE_COUNT) btn.style.display = 'none';
    };

    setCollapsed(true);
    btn.addEventListener('click', () => setCollapsed(!table.classList.contains('table-collapsed')));
  }catch(e){
    console.error('schedule error', e);
  }
}

/* ===== places list (optional JSON) ===== */
async function paintPlacesList(){
  const ul = $('#placesList');
  const empty = $('#placesEmpty');
  if(!ul) return;

  try{
    const places = await fetch(PATH_PLACES, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    if(!places || !places.length){ empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    ul.innerHTML = places.slice(0,8).map(p => {
      const n   = escapeHtml(p.name||'Place');
      const a   = escapeHtml(p.formatted_address || p.address || '');
      const lat = p.lat ?? null;
      const lng = p.lng ?? null;
      const mapsUrl = (lat != null && lng != null)
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : (p.maps_url || '#');
      return `<li>
        <a href="${mapsUrl}" target="_blank" rel="noopener">${n}</a>
        <div class="tiny muted">${a}</div>
      </li>`;
    }).join('');
  }catch(e){ console.error('places error', e); }
}

/* ===== specials grid (optional JSON) ===== */
async function paintSpecials(){
  const grid = $('#specialsGrid'); if(!grid) return;
  try{
    const list = await fetch(PATH_SPECIALS, {cache:'no-store'}).then(r => r.json()).catch(() => []);
    if(!list || !list.length){ grid.innerHTML = `<div class="muted">No specials yet.</div>`; return; }
    grid.innerHTML = list.map(s => {
      const title = escapeHtml(s.title || `${s.biz||''} Special`);
      const biz   = escapeHtml(s.biz || '');
      const area  = escapeHtml(s.area || '');
      const when  = escapeHtml(s.time || s.time_window || '');
      const link  = s.link ? `<a href="${s.link}" target="_blank" rel="noopener">Details</a>` : '';
      return `<article class="card">
        <header><h3 class="tiny">${title}</h3></header>
        <div class="card-body">
          ${biz ? `<div class="small">${biz}${area? ' — '+area: ''}</div>` : ''}
          ${when ? `<div class="tiny muted">${when}</div>` : ''}
          <div class="mt-1">${link}</div>
        </div>
      </article>`;
    }).join('');
  }catch(e){ console.error('specials error', e); }
}

/* ===== next game + status dot ===== */
function setScoreSignal(nextIso){
  const dots = $$('#scoreDot, .scoreDot');
  const msgs = $$('#scoreMsg, .scoreMsg');
  if(!dots.length && !msgs.length) return;

  let state='red', text='No game in progress.';
  if(nextIso){
    const now   = new Date();
    const start = new Date(nextIso);
    const end   = new Date(start.getTime() + 5*60*60*1000);
    const isSameDay = start.toDateString() === now.toDateString();
    if(now >= start && now <= end){ state='green';  text='Game in progress.'; }
    else if(isSameDay && now < start){ state='yellow'; text='Gameday — awaiting kickoff.'; }
  }
  dots.forEach(d => d.dataset.state = state);
  msgs.forEach(m => m.textContent = text);
}

function toICSDate(d){
  return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function buildICS({title, start, end, location='', description=''}) {
  const uid = 'tn-gameday-' + Date.now() + '@example';
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TN Gameday//Hub//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:' + uid,'DTSTAMP:' + toICSDate(new Date()),'DTSTART:' + toICSDate(start),'DTEND:' + toICSDate(end),
    'SUMMARY:' + title.replace(/\n/g,' '),'LOCATION:' + location.replace(/\n/g,' '),'DESCRIPTION:' + description.replace(/\n/g,' '),
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
}

async function paintUpcoming(){
  try{
    const next = await fetch(PATH_NEXT, {cache:'no-store'}).then(r => r.json()).catch(() => null);
    const elsNext  = $$('#nextLine, .nextLine');
    const elsVenue = $$('#nextVenue, .nextVenue');
    const linksCal = $$('#addToCalendar, .addToCalendar');
    const heroLine = $('.heroLine');

    if(!next || !next.date || !next.opponent){
      elsNext.forEach(n => n.textContent = 'No upcoming game found.');
      if(heroLine) heroLine.textContent = 'No upcoming game found.';
      setScoreSignal(null);
      return null;
    }

    const when  = fmtDate(next.date);
    const theHa = next.home === true ? 'Home' : next.home === false ? 'Away' : '—';
    const line  = `Tennessee vs ${next.opponent} — ${when} (${theHa})`;

    elsNext.forEach(n => n.textContent = line);
    elsVenue.forEach(v => v.textContent = next.venue ? `Venue: ${next.venue}` : '');
    if(heroLine) heroLine.textContent = line;

    setScoreSignal(next.date);

    const dt = new Date(next.date);
    const dtEnd = new Date(dt.getTime() + 3*60*60*1000);
    const title = `Tennessee vs ${next.opponent}`;
    const location = next.venue || '';
    const details = 'TN Gameday';

    const dates = toICSDate(dt) + '/' + toICSDate(dtEnd);
    const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      + '&text=' + encodeURIComponent(title)
      + '&dates=' + encodeURIComponent(dates)
      + '&location=' + encodeURIComponent(location)
      + '&details=' + encodeURIComponent(details);

    const icsText = buildICS({title, start: dt, end: dtEnd, location, description: details});
    const blob = new Blob([icsText], {type: 'text/calendar'});
    const blobUrl = URL.createObjectURL(blob);
    const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.ics`;

    linksCal.forEach(a => {
      a.href = gcal;
      a.dataset.ics = blobUrl;
      a.download = filename;
      a.addEventListener('contextmenu', () => { a.href = blobUrl; }, {once:true});
      a.addEventListener('mousedown', (e) => {
        if(e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey){ a.href = blobUrl; }
        else{ a.href = gcal; }
      });
    });

    window.addEventListener('beforeunload', () => URL.revokeObjectURL(blobUrl));
    return next.date;
  }catch(e){
    console.error('upcoming error', e);
    return null;
  }
}

/* ===== boot ===== */
(async function boot(){
  setUpdated();
  wireNavToggle();
  startHeaderCountdown();
  wireGuideMore();

  await paintUpcoming();
  await Promise.all([ paintSchedule(), paintSpecials(), paintPlacesList() ]);

  setInterval(setUpdated, 60*1000);
})();

/* Weather widget loader (3rd-party; console CORS warnings are normal) */
!(function(d,s,id){
  if(d.getElementById(id)) return;
  var js=d.createElement(s); js.id=id;
  js.src='https://weatherwidget.io/js/widget.min.js';
  d.getElementsByTagName('head')[0].appendChild(js);
}(document,'script','weatherwidget-io-js'));
