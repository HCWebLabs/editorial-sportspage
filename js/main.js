(() => {
  "use strict";

  /* =========================================
     Path helpers (works locally + GH Pages)
  ========================================== */
  const atRoot = location.pathname.endsWith("/") || /\.\w+$/.test(location.pathname) === false;
  const BASE =
    location.pathname.includes("/editorial-sportspage/") ? "/editorial-sportspage/" : (atRoot ? "/" : "./");

  const PATH = {
    meta:        BASE + "data/meta.json",
    next:        BASE + "data/next.json",
    schedule:    BASE + "data/schedule.json",
    scoreboard:  BASE + "data/scoreboard.json",
    specials:    BASE + "data/specials.json",
    places:      BASE + "data/places.json",
  };

  /* =========================================
     Tiny DOM + utils
  ========================================== */
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const setText = (sel, txt) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.textContent = txt ?? ""; };
  const setHTML = (sel, html) => { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.innerHTML = html ?? ""; };
  const setAllText = (sel, txt) => $$(sel).forEach(el => el.textContent = txt ?? "");
  const setAllHref = (sel, href) => $$(sel).forEach(el => el.setAttribute("href", href || "#"));
  const show = (sel, yes=true) => { const el = typeof sel === "string" ? $(sel) : sel; if (el){ el.hidden = !yes; el.style.display = yes ? "" : "none"; } };
  const pad2 = n => String(n).padStart(2,"0");
  const esc = s => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const fetchJSON = async (url) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      console.warn("fetchJSON failed:", url, e);
      return null;
    }
  };

  const fmtDateTime = d =>
    d?.toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });

  /* =========================================
     Countdown
  ========================================== */
  let CD_TIMER = null;
  const stopCountdown = () => { if (CD_TIMER) clearInterval(CD_TIMER); CD_TIMER = null; };

  function startCountdown(target) {
    const box = $("#countdown");
    if (!box || !(target instanceof Date) || isNaN(target)) return;
    const dEl = $("#cd-days"), hEl = $("#cd-hrs"), mEl = $("#cd-min"), sEl = $("#cd-sec");

    const tick = () => {
      const now = new Date();
      let diff = target - now; if (diff <= 0) diff = 0;
      const days = Math.floor(diff / 86_400_000);
      const hrs  = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      const secs = Math.floor((diff % 60_000) / 1_000);
      if (dEl) dEl.textContent = pad2(days);
      if (hEl) hEl.textContent = pad2(hrs);
      if (mEl) mEl.textContent = pad2(mins);
      if (sEl) sEl.textContent = pad2(secs);
      if (diff === 0) stopCountdown();
    };

    stopCountdown();
    tick();
    CD_TIMER = setInterval(tick, 1000);
  }

  function setCountdownTarget(dateMaybe) {
    const box = $("#countdown");
    if (!box) return;
    if (dateMaybe instanceof Date && !isNaN(dateMaybe)) {
      show(box, true);
      box.setAttribute("data-kickoff", dateMaybe.toISOString());
      startCountdown(dateMaybe);
      return;
    }
    const attr = box.getAttribute("data-kickoff");
    if (attr) {
      const d = new Date(attr);
      if (!isNaN(d)) { show(box, true); startCountdown(d); return; }
    }
    show(box, false);
    stopCountdown();
  }

  /* =========================================
     Guide + Schedule UI helpers (unchanged)
  ========================================== */
  function initNav() {
    const header = $(".site-header");
    const btn = $(".nav-toggle");
    if (!header || !btn) return;
    btn.addEventListener("click", () => {
      const open = header.getAttribute("data-open") === "true";
      header.setAttribute("data-open", open ? "false" : "true");
      btn.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  function initGuideAccordion() {
    const btn = $("#guideMore"), area = $("#guideExtra");
    if (!btn || !area) return;
    area.classList.add("is-collapsible");
    const setOpen = (open) => {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { area.hidden = false; area.style.maxHeight = area.scrollHeight + "px"; area.classList.add("is-open"); }
      else { area.style.maxHeight = "0px"; area.classList.remove("is-open"); setTimeout(() => (area.hidden = true), 300); }
    };
    setOpen(false);
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") === "true";
      setOpen(!open);
      btn.innerHTML = open
        ? '<i class="fa-solid fa-angles-down"></i> See more'
        : '<i class="fa-solid fa-angles-up"></i> See less';
    });
  }

  function initScheduleCollapse() {
    const btn = $("#schedMore");
    const tableWrap = $("#schedTable")?.closest(".table-wrap");
    if (!btn || !tableWrap) return;
    const COLLAPSE_COUNT = 6;
    const setCollapsed = (collapsed) => {
      $("#schedTable")?.classList.toggle("table-collapsed", collapsed);
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.innerHTML = collapsed
        ? '<i class="fa-solid fa-angles-down"></i> See more'
        : '<i class="fa-solid fa-angles-up"></i> See less';
      $$("#schedRows > tr").forEach((tr, i) => tr.setAttribute("data-extra", i >= COLLAPSE_COUNT ? "true" : "false"));
      tableWrap.setAttribute("data-collapsed", collapsed ? "true" : "false");
    };
    setCollapsed(true);
    btn.addEventListener("click", () => {
      const collapsed = $("#schedTable")?.classList.contains("table-collapsed");
      setCollapsed(!collapsed);
    });
  }

  /* =========================================
     Painters
  ========================================== */
  function setScoreDot(state) {
    const mainDot = $("#scoreDot");
    if (mainDot) mainDot.setAttribute("data-state", state);
    $$(".scoreDot").forEach(d => d.setAttribute("data-state", state));
  }
  function setScoreMessage(msg) { setText("#scoreMsg", msg); setAllText(".scoreMsg", msg); }
  function setNextLineAndVenue(line, venue) {
    setText("#nextLine", line); setAllText(".nextLine", line);
    setText("#nextVenue", venue); setAllText(".nextVenue", venue);
  }
  const calendarLink = ({ opponent, date, home }) => {
    if (!date) return "#";
    const start = new Date(date);
    const end = new Date(start.getTime() + 3*60*60*1000);
    const toICS = d => d.toISOString().replace(/[-:]/g,"").replace(".000Z","Z");
    const text = encodeURIComponent(`Tennessee ${home ? "vs" : "at"} ${opponent || ""}`.trim());
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${toICS(start)}/${toICS(end)}`;
  };

  function resultText(row) {
    if (row?.result) return row.result;
    const hp = Number(row?.home_points), ap = Number(row?.away_points);
    if (!Number.isFinite(hp) || !Number.isFinite(ap)) return "—";
    const usHome = row?.is_home === true || row?.home === true;
    const us = usHome ? hp : ap;
    const them = usHome ? ap : hp;
    const wl = us > them ? "W" : us < them ? "L" : "T";
    return `${wl} ${us}-${them}`;
  }

  function deriveOpponent(row) {
    if (row?.opponent) return row.opponent;
    // Best-effort fallback if older schedule rows lacked "opponent"
    // If the row is marked is_home, assume Tennessee is home and opponent is the other side from notes/venue not reliable.
    return ""; // safe empty; UI still shows time/TV
  }

  async function paintSchedule(url) {
    const tbody = $("#schedRows");
    const updatedAt = $("#updatedAt2");
    if (!tbody) return;
    const rows = (await fetchJSON(url)) || [];
    if (!Array.isArray(rows)) { setHTML(tbody, ""); return; }

    rows.sort((a,b) => new Date(a.date) - new Date(b.date));
    const html = rows.map(r => {
      const d = new Date(r.date);
      const opponent = esc(deriveOpponent(r));
      const ha = (r.is_home === true || r.home === true) ? "H" : "A";
      const tv = esc(r.tv || "TBD");
      const res = esc(resultText(r));
      return `<tr>
        <td>${esc(d.toLocaleDateString(undefined, { month:"short", day:"2-digit", year:"numeric" }))}</td>
        <td>${opponent}</td>
        <td>${ha}</td>
        <td>${tv}</td>
        <td>${res}</td>
      </tr>`;
    }).join("");

    setHTML(tbody, html);
    if (updatedAt) updatedAt.textContent = new Date().toLocaleString();
    console.info("Schedule loaded:", rows.length, "rows");
  }

  async function paintNext(nextUrl, scheduleUrl) {
    // default states
    setScoreDot("red");
    setScoreMessage("No game in progress.");
    setNextLineAndVenue("No upcoming game found.", "");
    setAllHref("#addToCalendar, .addToCalendar", "#");

    let next = await fetchJSON(nextUrl);
    const schedule = (await fetchJSON(scheduleUrl)) || [];

    // Fallback to compute "next" from schedule if needed
    if (!next && Array.isArray(schedule) && schedule.length) {
      const now = Date.now();
      const future = schedule
        .filter(r => r.date && +new Date(r.date) >= now - 6*60*60*1000 && !r.completed)
        .sort((a,b) => +new Date(a.date) - +new Date(b.date));
      next = future[0] || null;
      if (next) console.info("Derived next from schedule:", next);
    }

    if (!next) {
      // keep countdown from HTML fallback if present
      setCountdownTarget(null);
      return;
    }

    const home = next.is_home === true || next.home === true;
    const opponent = next.opponent || "";
    const when = next.date ? new Date(next.date) : null;
    const tv = next.tv || "";
    const venue = next.venue || "";

    if (when && !isNaN(when)) {
      const vsat = home ? "vs" : "at";
      const line = `${fmtDateTime(when)} • ${vsat} ${opponent}${tv ? ` • ${tv}` : ""}`;
      setNextLineAndVenue(line, venue);
      setCountdownTarget(when);
      setAllHref("#addToCalendar, .addToCalendar", calendarLink({ opponent, date: next.date, home }));
    }

    const status = (next.status || "").toLowerCase(); // if you later add live polling
    if (status === "in_progress") {
      const hp = Number(next.home_points ?? NaN);
      const ap = Number(next.away_points ?? NaN);
      const us = home ? hp : ap;
      const them = home ? ap : hp;
      const line = (Number.isFinite(us) && Number.isFinite(them))
        ? `${us} – ${them} ${home ? "vs" : "at"} ${opponent}`
        : "Game in progress.";
      setScoreDot("green");
      setScoreMessage(line);
    } else if (status === "final") {
      setScoreDot("red");
      setScoreMessage("Final");
    } else if (status) {
      setScoreDot("yellow");
      setScoreMessage("Not started.");
    }

    console.info("Next loaded:", next);
  }

  async function paintSpecials(url) {
    const grid = $("#specialsGrid");
    if (!grid) return;
    const list = (await fetchJSON(url)) || [];
    if (!Array.isArray(list) || list.length === 0) { setHTML(grid, '<div class="muted">No specials yet.</div>'); return; }
    const html = list.map(s => {
      const title = esc(s.title || "Special");
      const biz = esc(s.biz || "");
      const area = esc(s.area || "");
      const when = esc(s.time || "");
      const link = s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">Details</a>` : "";
      return `<article class="card">
        <header><h3 class="tiny">${title}</h3></header>
        <div class="card-body">
          ${biz ? `<div class="small">${biz}${area ? ` — <span class="tiny">${area}</span>` : ""}</div>` : ""}
          ${when ? `<div class="tiny muted">${when}</div>` : ""}
          ${link ? `<div class="mt-1">${link}</div>` : ""}
        </div>
      </article>`;
    }).join("");
    setHTML(grid, html);
  }

  async function paintPlaces(url) {
    const ul = $("#placesList"), empty = $("#placesEmpty");
    if (!ul || !empty) return;
    const places = (await fetchJSON(url)) || [];
    if (!Array.isArray(places) || places.length === 0) { show(empty, true); ul.innerHTML = ""; return; }
    show(empty, false);
    const rows = places.slice(0, 20).map(p => {
      const name = esc(p.name || "Place");
      const addr = esc(p.formatted_address || p.address || "");
      const lat = p.lat ?? null, lng = p.lng ?? null;
      const mapsUrl = lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${addr}`)}`;
      return `<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>
        <a href="${mapsUrl}" target="_blank" rel="noopener">${name}</a>
        ${addr ? `<div class="tiny muted">${addr}</div>` : ""}</li>`;
    }).join("");
    setHTML(ul, rows);
  }

  /* =========================================
     Boot
  ========================================== */
  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    initGuideAccordion();
    initScheduleCollapse();

    // Show fallback countdown if HTML has one while we load
    setCountdownTarget(null);

    // 1) Get meta with a hard bust to avoid any cache
    const meta = await fetchJSON(`${PATH.meta}?t=${Date.now()}`);
    const v = meta?.updated_at ? encodeURIComponent(meta.updated_at) : Date.now();
    if (meta?.updated_at) console.info("Data updated:", meta.updated_at);

    // 2) Version all subsequent requests so CDN can’t serve stale JSON
    const V = (u) => `${u}?v=${v}`;

    await Promise.all([
      paintNext(V(PATH.next), V(PATH.schedule)),
      paintSchedule(V(PATH.schedule)),
      paintSpecials(V(PATH.specials)),
      paintPlaces(V(PATH.places)),
    ]);
  });
})();
