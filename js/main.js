(() => {
  "use strict";

  /* =========================================
     Path helpers (works locally + GH Pages)
  ========================================== */
  const BASE = window.location.pathname.includes("/editorial-sportspage/")
    ? "/editorial-sportspage/"
    : "./";

  const PATH_NEXT     = BASE + "data/next.json";
  const PATH_SCHEDULE = BASE + "data/schedule.json";
  const PATH_SPECIALS = BASE + "data/specials.json";
  const PATH_PLACES   = BASE + "data/places.json";

  /* =========================================
     Tiny DOM + misc utils
  ========================================== */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const setText = (sel, txt) => {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (el) el.textContent = txt ?? "";
  };
  const setHTML = (sel, html) => {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (el) el.innerHTML = html ?? "";
  };
  const show = (sel, yes = true) => {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    el.hidden = !yes;
    el.style.display = yes ? "" : "none";
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fetchJSON = async (url) => {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  };

  const fmtDate = (d) =>
    d?.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const pad2 = (n) => String(n).padStart(2, "0");

  const setAllText = (selector, txt) =>
    $$(selector).forEach((n) => (n.textContent = txt ?? ""));
  const setAllHref = (selector, href) =>
    $$(selector).forEach((n) => n.setAttribute("href", href || "#"));

  /* =========================================
     Mobile nav
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

  /* =========================================
     Countdown
  ========================================== */
  let CD_TIMER = null;

  function stopCountdown() {
    if (CD_TIMER) clearInterval(CD_TIMER);
    CD_TIMER = null;
  }

  function startCountdown(target) {
    const box = $("#countdown");
    if (!box || !(target instanceof Date) || isNaN(target)) return;

    const dEl = $("#cd-days");
    const hEl = $("#cd-hrs");
    const mEl = $("#cd-min");
    const sEl = $("#cd-sec");

    const tick = () => {
      const now = new Date();
      let diff = target - now;
      if (diff <= 0) diff = 0;

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

    tick();
    stopCountdown();
    CD_TIMER = setInterval(tick, 1000);
  }

  function setCountdownTarget(dateMaybe) {
    const box = $("#countdown");
    if (!box) return;

    // Drive from argument (JSON) if provided
    if (dateMaybe instanceof Date && !isNaN(dateMaybe)) {
      show(box, true);
      box.setAttribute("data-kickoff", dateMaybe.toISOString());
      startCountdown(dateMaybe);
      return;
    }

    // Fallback: drive from HTML attribute
    const attr = box.getAttribute("data-kickoff");
    if (attr) {
      const d = new Date(attr);
      if (!isNaN(d)) {
        show(box, true);
        startCountdown(d);
        return;
      }
    }

    // No target
    show(box, false);
    stopCountdown();
  }

  /* =========================================
     Guide accordion
  ========================================== */
  function initGuideAccordion() {
    const btn = $("#guideMore");
    const area = $("#guideExtra");
    if (!btn || !area) return;

    area.classList.add("is-collapsible");

    const setOpen = (open) => {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        area.hidden = false;
        const h = area.scrollHeight;
        area.style.maxHeight = h + "px";
        area.classList.add("is-open");
      } else {
        area.style.maxHeight = "0px";
        area.classList.remove("is-open");
        setTimeout(() => (area.hidden = true), 300);
      }
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

  /* =========================================
     Schedule "See more" (table)
  ========================================== */
  const COLLAPSE_COUNT = 6;

  function markScheduleExtra() {
    $$("#schedRows > tr").forEach((tr, i) => {
      tr.setAttribute("data-extra", i >= COLLAPSE_COUNT ? "true" : "false");
    });
  }

  function initScheduleCollapse() {
    const btn = $("#schedMore");
    const table = $("#schedTable");
    const tableWrap = table?.closest(".table-wrap");
    if (!btn || !table || !tableWrap) return;

    const setCollapsed = (collapsed) => {
      table.classList.toggle("table-collapsed", collapsed);
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.innerHTML = collapsed
        ? '<i class="fa-solid fa-angles-down"></i> See more'
        : '<i class="fa-solid fa-angles-up"></i> See less';
      tableWrap.setAttribute("data-collapsed", collapsed ? "true" : "false");
      markScheduleExtra();
    };

    setCollapsed(true);
    btn.addEventListener("click", () => {
      const collapsed = table.classList.contains("table-collapsed");
      setCollapsed(!collapsed);
    });
  }

  /* =========================================
     Specials Grid
  ========================================== */
  async function paintSpecials() {
    const grid = $("#specialsGrid");
    if (!grid) return;

    const list = (await fetchJSON(PATH_SPECIALS)) || [];
    if (!Array.isArray(list) || list.length === 0) {
      setHTML(grid, '<div class="muted">No specials yet.</div>');
      return;
    }

    const html = list
      .map((s) => {
        const title = escapeHtml(s.title || "Special");
        const biz   = escapeHtml(s.biz || "");
        const area  = escapeHtml(s.area || "");
        const when  = escapeHtml(s.time || "");
        const link  = s.link
          ? `<a href="${escapeHtml(s.link)}" target="_blank" rel="noopener">Details</a>`
          : "";
        return `
          <article class="card">
            <header><h3 class="tiny">${title}</h3></header>
            <div class="card-body">
              ${biz ? `<div class="small">${biz}${area ? ` — <span class="tiny">${area}</span>` : ""}</div>` : ""}
              ${when ? `<div class="tiny muted">${when}</div>` : ""}
              ${link ? `<div class="mt-1">${link}</div>` : ""}
            </div>
          </article>`;
      })
      .join("");
    setHTML(grid, html);
  }

  /* =========================================
     Places list under Map
  ========================================== */
  async function paintPlacesList() {
    const ul = $("#placesList");
    const empty = $("#placesEmpty");
    if (!ul || !empty) return;

    const places = (await fetchJSON(PATH_PLACES)) || [];
    if (!Array.isArray(places) || places.length === 0) {
      show(empty, true);
      ul.innerHTML = "";
      return;
    }
    show(empty, false);

    const rows = places
      .slice(0, 20)
      .map((p) => {
        const name = escapeHtml(p.name || "Place");
        const addr = escapeHtml(p.formatted_address || p.address || "");
        const lat  = p.lat ?? null;
        const lng  = p.lng ?? null;
        const mapsUrl =
          lat != null && lng != null
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + "," + lng)}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + " " + addr)}`;
        return `<li>
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
          <a href="${mapsUrl}" target="_blank" rel="noopener">${name}</a>
          ${addr ? `<div class="tiny muted">${addr}</div>` : ""}
        </li>`;
      })
      .join("");
    setHTML(ul, rows);
  }

  /* =========================================
     Schedule table
  ========================================== */
  function resultText(row) {
    if (row?.result) return row.result;

    const hp = Number(row?.home_points);
    const ap = Number(row?.away_points);
    if (!Number.isFinite(hp) || !Number.isFinite(ap)) return "—";

    const usHome = row?.home === true || row?.is_home === true;
    const us   = usHome ? hp : ap;
    const them = usHome ? ap : hp;
    const wl   = us > them ? "W" : us < them ? "L" : "T";
    return `${wl} ${us}-${them}`;
  }

  async function paintSchedule() {
    const tbody = $("#schedRows");
    const updatedAt = $("#updatedAt2");
    if (!tbody) return;

    const rows = (await fetchJSON(PATH_SCHEDULE)) || [];
    if (!Array.isArray(rows)) {
      setHTML(tbody, "");
      return;
    }

    // Sort by date ascending
    rows.sort((a, b) => new Date(a.date) - new Date(b.date));

    const html = rows
      .map((r) => {
        const d   = new Date(r.date);
        const opp = escapeHtml(r.opponent || "");
        const ha  = (r.home === true || r.is_home === true) ? "H" : "A";   // <— robust
        const tv  = escapeHtml(r.tv || "TBD");
        const res = escapeHtml(resultText(r));
        return `<tr>
          <td>${escapeHtml(d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }))}</td>
          <td>${opp}</td>
          <td>${ha}</td>
          <td>${tv}</td>
          <td>${res}</td>
        </tr>`;
      })
      .join("");

    setHTML(tbody, html);
    markScheduleExtra(); // ensure collapse markers set after render
    if (updatedAt) updatedAt.textContent = new Date().toLocaleString();
  }

  /* =========================================
     Live score + Next game (top & bottom)
  ========================================== */
  function setScoreDot(state /* 'red' | 'yellow' | 'green' */) {
    const mainDot = $("#scoreDot");
    if (mainDot) mainDot.setAttribute("data-state", state);
    $$(".scoreDot").forEach((d) => d.setAttribute("data-state", state));
  }

  function setScoreMessage(msg) {
    setText("#scoreMsg", msg);
    setAllText(".scoreMsg", msg);
  }

  function setNextLineAndVenue(line, venue) {
    setText("#nextLine", line);
    setAllText(".nextLine", line);
    setText("#nextVenue", venue);
    setAllText(".nextVenue", venue);
  }

  function calendarLink({ opponent, date, home }) {
    if (!date) return "#";
    const start = new Date(date);
    const end   = new Date(start.getTime() + 3 * 60 * 60 * 1000); // +3h
    const toICS = (d) => d.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
    const text  = encodeURIComponent(`Tennessee ${home ? "vs" : "at"} ${opponent}`);
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${toICS(start)}/${toICS(end)}`;
  }

  function deriveStatus(next, when) {
    // Accept provided status; otherwise infer from time/completed flag
    const raw = (next?.status || "").toLowerCase();
    if (raw) return raw;
    if (next?.completed) return "final";
    if (when instanceof Date && !isNaN(when)) {
      const now = Date.now();
      if (now < +when) return "scheduled";
      return "in_progress";
    }
    return "scheduled";
  }

  async function paintNext() {
    const next = await fetchJSON(PATH_NEXT);

    // defaults
    setScoreDot("red");
    setScoreMessage("No game in progress.");
    setNextLineAndVenue("No upcoming game found.", "");
    setAllHref("#addToCalendar, .addToCalendar", "#");
    setCountdownTarget(null); // will re-drive if we get a valid date below

    if (!next) return; // keep the fallback countdown-from-HTML (if any)

    // Defensive field extraction
    const home    = next.home === true || next.is_home === true;         // <— robust
    const dateStr = next.date || next.start_date || next.startDate || next.kickoff || null;
    const when    = dateStr ? new Date(dateStr) : null;
    const tv      = next.tv || next.broadcast || "";
    const opponent = next.opponent || next.opp || "";

    const venue = [
      (next.venue_name || next.venue || ""),
      [next.venue_city, next.venue_state].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join(" — ");

    // Top/bottom "next" line + countdown
    if (when && !isNaN(when)) {
      const vsat = home ? "vs" : "at";
      const line = `${fmtDate(when)} • ${vsat} ${opponent}${tv ? ` • ${tv}` : ""}`;
      setNextLineAndVenue(line, venue);
      setCountdownTarget(when);
    } else {
      setNextLineAndVenue("No upcoming game found.", "");
    }

    // Calendar link (both instances)
    const calHref = calendarLink({ opponent, date: dateStr, home });
    setAllHref("#addToCalendar, .addToCalendar", calHref);

    // Live score box
    const status = deriveStatus(next, when); // "in_progress" | "final" | "scheduled" | ...
    if (status === "in_progress") {
      const hp = Number(next.home_points ?? NaN);
      const ap = Number(next.away_points ?? NaN);
      const us = home ? hp : ap;
      const them = home ? ap : hp;
      const scoreLine =
        Number.isFinite(us) && Number.isFinite(them)
          ? `${us} – ${them} ${home ? "vs" : "at"} ${opponent}`
          : `Game in progress.`;
      setScoreDot("green");
      setScoreMessage(scoreLine);
    } else if (status === "final") {
      setScoreDot("red");
      const res = resultText(next);
      setScoreMessage(res && res !== "—" ? `Final: ${res}` : "Final");
    } else {
      // scheduled / pre
      setScoreDot("yellow");
      setScoreMessage("Not started.");
    }
  }

  /* =========================================
     Boot
  ========================================== */
  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    initGuideAccordion();
    initScheduleCollapse();

    // Start with any HTML-provided countdown target.
    setCountdownTarget(null);

    // Paint dynamic sections
    await Promise.all([
      paintNext(),
      paintSchedule(),
      paintSpecials(),
      paintPlacesList(),
    ]);
  });
})();
