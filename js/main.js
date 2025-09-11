/* editorial-sportspage — main.js (paths fixed for GitHub Pages) */
(() => {
  const BUST = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const BASE = '/editorial-sportspage';
  const DATA = `${BASE}/data`;
  const PATH_NEXT      = `${DATA}/next.json?v=${BUST}`;
  const PATH_SCHEDULE  = `${DATA}/schedule.json?v=${BUST}`;
  const PATH_SPECIALS  = `${DATA}/specials.json?v=${BUST}`;
  const PATH_PLACES    = `${DATA}/places.json?v=${BUST}`;

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fetchJson = url => fetch(url, {cache:'no-store'}).then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`)));

  /* === NEXT / SCORE === */
  async function paintNext(){
    try{
      const next = await fetchJson(PATH_NEXT).catch(() => null);

      const setNoGame = () => {
        $('#nextLine') && ($('#nextLine').textContent = 'No upcoming game found.');
        $('#nextVenue') && ($('#nextVenue').textContent = '');
        const a = $('#addToCalendar'); if (a){ a.style.display='none'; a.removeAttribute('href'); }
        const msg = 'No game in progress.';
        $('#scoreMsg') && ($('#scoreMsg').textContent = msg);
        $$('.scoreMsg').forEach(el => el.textContent = msg);
        $$('#scoreDot, .scoreDot').forEach(el => el?.setAttribute('data-state','red'));
      };

      if (!next || next === null){ setNoGame(); return; }

      const { opponent, date, is_home, venue, tv, status, scoreboard } = next;
      const when = date ? new Date(date) : null;
      const homeAway = is_home === true ? 'H' : is_home === false ? 'A' : '';
      const line = [
        when ? when.toLocaleDateString([], { month:'short', day:'numeric'}) : '',
        opponent ? `${homeAway ? `${homeAway} ` : ''}vs ${opponent}` : '',
        tv ? `• ${tv}` : ''
      ].filter(Boolean).join(' ');
      $('#nextLine') && ($('#nextLine').textContent = line || 'No upcoming game found.');
      $('#nextVenue') && ($('#nextVenue').textContent = venue || '');

      const a = $('#addToCalendar');
      if (a && when && opponent){
        const title = encodeURIComponent(`Tennessee vs ${opponent}`);
        const start = when.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
        const end   = new Date(when.getTime()+3*3600e3).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
        a.href = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&ctz=America/New_York`;
        a.style.display = '';
      }else if(a){ a.style.display='none'; }

      const inProgress = scoreboard?.in_progress === true || status === 'in_progress';
      const state = inProgress ? 'green' : (status === 'final' ? 'yellow' : 'red');
      $$('#scoreDot, .scoreDot').forEach(el => el?.setAttribute('data-state', state));
      const scoreLine = scoreboard?.display ?? (status === 'final' ? 'Final' : inProgress ? 'In progress' : 'No game in progress.');
      $('#scoreMsg') && ($('#scoreMsg').textContent = scoreLine);
      $$('.scoreMsg').forEach(el => el.textContent = scoreLine);
    }catch(e){
      console.error('next.json error', e);
    }
  }

  /* === SCHEDULE TABLE (collapsible) === */
  async function paintSchedule(){
    const tbody = $('#schedRows'), btn = $('#schedMore'), table = $('#schedTable'), wrap = table?.closest('.table-wrap');
    if (!tbody || !btn || !table || !wrap) return;
    try{
      let rows = await fetchJson(PATH_SCHEDULE).catch(() => []);
      rows = (rows||[]).slice().sort((a,b) => new Date(a.date) - new Date(b.date));

      if (!rows.length){
        tbody.innerHTML = '<tr><td colspan="5" class="tiny muted">No schedule available.</td></tr>';
        btn.style.display='none';
        return;
      }

      tbody.innerHTML = rows.map(r=>{
        const when = r.date ? new Date(r.date) : null;
        const tv = r.tv || '';
        const res = r.result || '--';
        const opp = r.opponent || '--';
        const ha = r.is_home === true ? 'H' : r.is_home === false ? 'A' : '';
        return `<tr>
          <td>${when? when.toLocaleDateString([], {month:'short', day:'2-digit', year:'numeric'}):''}</td>
          <td>${escapeHtml(opp)}</td>
          <td>${ha}</td>
          <td>${escapeHtml(tv)}</td>
          <td>${escapeHtml(res)}</td>
        </tr>`;
      }).join('');

      const COLLAPSE_COUNT = 3;
      [...tbody.querySelectorAll('tr')].forEach((tr,i)=>{ if(i>=COLLAPSE_COUNT) tr.setAttribute('data-extra','true'); });
      const setCollapsed = (collapsed) => {
        table.classList.toggle('table-collapsed', collapsed);
        wrap.dataset.collapsed = collapsed ? 'true' : 'false';
        btn.innerHTML = collapsed
          ? '<i class="fa-solid fa-angles-down"></i> See more'
          : '<i class="fa-solid fa-angles-up"></i> See less';
      };
      setCollapsed(true);
      btn.addEventListener('click', () => setCollapsed(!table.classList.contains('table-collapsed')));
    }catch(e){
      console.error('schedule.json error', e);
    }
  }

  /* === SPECIALS === */
  async function paintSpecials(){
    const grid = $('#specialsGrid'); if(!grid) return;
    try{
      const list = await fetchJson(PATH_SPECIALS).catch(() => []);
      if(!list.length){ grid.innerHTML = '<div class="muted tiny">No specials yet.</div>'; return; }
      grid.innerHTML = list.map(s=>{
        const title = escapeHtml(s.title||'Special');
        const biz   = escapeHtml(s.biz||'');
        const when  = escapeHtml(s.time||'');
        const area  = escapeHtml(s.area||'');
        const link  = s.link? `<a href="${escapeHtml(s.link)}" target="_blank" rel="noopener">Details</a>`:'';
        return `<article class="card">
          <header><h3 class="tiny">${title}</h3></header>
          <div class="card-body">
            ${biz? `<div class="small">${biz}${area? ' · '+area:''}</div>`:''}
            ${when? `<div class="small muted">${when}</div>`:''}
            ${link? `<div class="mt-1">${link}</div>`:''}
          </div>
        </article>`;
      }).join('');
    }catch(e){ console.error('specials.json error', e); }
  }

  /* === PLACES (optional) === */
  async function paintPlacesList(){
    const ul = $('#placesList'), empty = $('#placesEmpty'); if(!ul) return;
    try{
      const places = await fetchJson(PATH_PLACES).catch(() => []);
      if(!places.length){ if(empty) empty.style.display='block'; return; }
      if(empty) empty.style.display='none';
      ul.innerHTML = places.slice(0,8).map(p=>{
        const lat = p.lat ?? null, lng = p.lng ?? null, n = escapeHtml(p.name||'Place');
        const href = (lat!=null && lng!=null)
          ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : '#';
        return `<li>
          <a href="${href}" target="_blank" rel="noopener">${n}</a>
          <div class="tiny muted">${escapeHtml(p.formatted_address||p.address||'')}</div>
        </li>`;
      }).join('');
    }catch(e){ console.error('places.json error', e); }
  }

  /* === Rank / Odds placeholders (wire up to data/API when available) === */
  function paintOddsAndRank(){
    const oddsLine = $('#oddsLine'); if(oddsLine && !oddsLine.textContent.trim()) oddsLine.textContent = 'Odds data coming soon.';
    const rankLine = $('#rankLine'); if(rankLine && !rankLine.textContent.trim()) rankLine.textContent = 'Rank data coming soon.';
  }

  document.addEventListener('DOMContentLoaded', () => {
    paintNext();
    paintSchedule();
    paintSpecials();
    paintPlacesList();
    paintOddsAndRank();
  });
})();
