// helpers
const setText = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
const setTextAll = (sel, txt) => document.querySelectorAll(sel).forEach(el => el.textContent = txt);
const setHrefShow = (sel, href) => {
  document.querySelectorAll(sel).forEach(a => {
    if (href) { a.href = href; a.style.display = ''; }
    else { a.removeAttribute('href'); a.style.display = 'none'; }
  });
};

/* === NEXT / SCORE (updates hero + top + bottom) === */
async function paintNext(){
  try{
    const next = await fetchJson(PATH_NEXT).catch(() => null);

    const noGame = () => {
      setText('#nextLine', 'No upcoming game found.');
      setTextAll('.nextLine', 'No upcoming game found.');
      setText('#nextVenue', '');
      setTextAll('.nextVenue', '');
      setText('.heroLine', 'No upcoming game found.');
      setHrefShow('#addToCalendar, .addToCalendar', '');
      setText('#scoreMsg', 'No game in progress.');
      setTextAll('.scoreMsg', 'No game in progress.');
      document.querySelectorAll('#scoreDot, .scoreDot').forEach(el => el.setAttribute('data-state','red'));
    };

    if (!next || next === null){ noGame(); return; }

    const { opponent, date, is_home, venue, tv, status, scoreboard } = next;
    const when = date ? new Date(date) : null;
    const ha = is_home === true ? 'H' : is_home === false ? 'A' : '';

    // Top/bottom “Upcoming”
    const line = [
      when ? when.toLocaleDateString([], { month:'short', day:'numeric'}) : '',
      opponent ? `${ha ? `${ha} ` : ''}vs ${opponent}` : '',
      tv ? `• ${tv}` : ''
    ].filter(Boolean).join(' ');
    setText('#nextLine', line || 'No upcoming game found.');
    setTextAll('.nextLine', line || 'No upcoming game found.');
    setText('#nextVenue', venue || '');
    setTextAll('.nextVenue', venue || '');

    // Mini-hero lede
    const hero = (when && opponent)
      ? `Kickoff ${when.toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})} — ${ha ? (ha==='H' ? 'Home' : 'Away')+' · ' : ''}${opponent}`
      : 'No upcoming game found.';
    setText('.heroLine', hero);

    // “Add to Calendar” (top + bottom)
    if (when && opponent){
      const title = encodeURIComponent(`Tennessee vs ${opponent}`);
      const start = when.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const end   = new Date(when.getTime()+3*3600e3).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const href  = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&ctz=America/New_York`;
      setHrefShow('#addToCalendar, .addToCalendar', href);
    }else{
      setHrefShow('#addToCalendar, .addToCalendar', '');
    }

    // Score dot + line
    const inProg = scoreboard?.in_progress === true || status === 'in_progress';
    const dot = inProg ? 'green' : (status === 'final' ? 'yellow' : 'red');
    document.querySelectorAll('#scoreDot, .scoreDot').forEach(el => el.setAttribute('data-state', dot));
    const scoreLine = scoreboard?.display ?? (status === 'final' ? 'Final' : inProg ? 'In progress' : 'No game in progress.');
    setText('#scoreMsg', scoreLine);
    setTextAll('.scoreMsg', scoreLine);
  }catch(e){
    console.error('next.json error', e);
  }
}
