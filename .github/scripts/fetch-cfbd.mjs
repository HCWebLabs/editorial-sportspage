#!/usr/bin/env node
/**
 * Fetches season games from CFBD and writes:
 *   data/schedule.json  (array for your table)
 *   data/next.json      (single object for the "Upcoming" block)
 *
 * Env:
 *   CFBD_API_KEY  (required)
 *   INPUT_YEAR    (optional; from workflow_dispatch)
 *   INPUT_TEAM    (optional; from workflow_dispatch)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CFBD_API_KEY = process.env.CFBD_API_KEY;
if (!CFBD_API_KEY) {
  console.error('Missing CFBD_API_KEY');
  process.exit(1);
}

const DEFAULT_TEAM = process.env.INPUT_TEAM?.trim() || 'Tennessee';

// Choose a sensible default year:
// If today is Feb–Jun, use current year - 1 (postseason/early off-season edge cases);
// otherwise use current year.
function defaultSeasonYear() {
  const now = new Date();
  const m = now.getUTCMonth() + 1; // 1..12
  const y = now.getUTCFullYear();
  return (m >= 2 && m <= 6) ? (y - 1) : y;
}
const SEASON_YEAR = Number(process.env.INPUT_YEAR) || defaultSeasonYear();

const OUT_DIR = resolve(__dirname, '..', 'data');
const OUT_SCHEDULE = resolve(OUT_DIR, 'schedule.json');
const OUT_NEXT = resolve(OUT_DIR, 'next.json');

const headers = { Authorization: `Bearer ${CFBD_API_KEY}` };

const endpoint = new URL('https://api.collegefootballdata.com/games');
endpoint.searchParams.set('year', String(SEASON_YEAR));
endpoint.searchParams.set('team', DEFAULT_TEAM);

function toISO(value) {
  // CFBD uses start_date (ISO). In some clients it's startDate/commence_time/date.
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toResult({ isHome, homePoints, awayPoints }) {
  if (!Number.isFinite(homePoints) || !Number.isFinite(awayPoints)) return '—';
  const weScored = isHome ? homePoints : awayPoints;
  const theyScored = isHome ? awayPoints : homePoints;
  const win = weScored > theyScored;
  return `${win ? 'W' : 'L'} ${Math.max(weScored, theyScored)}-${Math.min(weScored, theyScored)}`;
}

function mapRow(g, team) {
  const homeTeam = g.home_team ?? g.homeTeam;
  const awayTeam = g.away_team ?? g.awayTeam;
  const isHome = String(homeTeam).toLowerCase() === String(team).toLowerCase();

  const iso =
    toISO(g.start_date) ||
    toISO(g.startDate) ||
    toISO(g.commence_time) ||
    toISO(g.date);

  const homePoints = Number.isFinite(g.home_points) ? g.home_points : g.homePoints;
  const awayPoints = Number.isFinite(g.away_points) ? g.away_points : g.awayPoints;

  return {
    date: iso,                                  // ISO string (client formats)
    opponent: (isHome ? awayTeam : homeTeam) || 'TBD',
    home: isHome,
    tv: g.tv || g.television || 'TBD',
    result: toResult({ isHome, homePoints, awayPoints }),
    venue: g.venue || ''
  };
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching CFBD ${SEASON_YEAR} ${DEFAULT_TEAM}…`);
  const r = await fetch(endpoint, { headers });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`CFBD ${r.status}: ${text.slice(0, 200)}`);
  }
  const arr = await r.json();

  const mapped = arr
    .map(g => mapRow(g, DEFAULT_TEAM))
    .filter(x => !!x.date)                      // keep only dated games
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // next.json = the next game in the future
  const now = Date.now();
  const upcoming = mapped.find(g => new Date(g.date).getTime() > now) || null;
  const nextObj = upcoming
    ? { date: upcoming.date, opponent: upcoming.opponent, home: upcoming.home, venue: upcoming.venue }
    : {};

  await writeFile(OUT_SCHEDULE, JSON.stringify(mapped, null, 2));
  await writeFile(OUT_NEXT, JSON.stringify(nextObj, null, 2));

  console.log(`Wrote ${mapped.length} games -> data/schedule.json`);
  console.log(`Wrote next -> data/next.json`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
