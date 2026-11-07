// Score en direct (ADR 0004) : le navigateur interroge ESPN toutes les 30 s pendant les Matchs en cours.
//
// Repère dans la page : tout élément [data-live-id] (identifiant ESPN du Match) avec data-live-league,
// data-live-date et data-live-status. À l'intérieur : [data-live-score="home|away"] et [data-live-clock].
// Classes posées sur l'élément : live-in (en cours), live-post (terminé), live-stale (ESPN injoignable).

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/rugby';
const POLL = 30_000;
const BEFORE = 15 * 60_000; // on commence à surveiller un quart d'heure avant le coup d'envoi
const AFTER = 3 * 3600_000; // et on arrête trois heures après

type LiveState = { state: 'pre' | 'in' | 'post'; home: string; away: string; clock: string };

const els = () => [...document.querySelectorAll<HTMLElement>('[data-live-id]')];

/** Matchs à surveiller maintenant : en cours d'après la collecte, ou dans la fenêtre autour du coup d'envoi. */
function watched(now = Date.now()): HTMLElement[] {
  return els().filter((el) => {
    if (el.classList.contains('live-post')) return false;
    if (el.dataset.liveStatus === 'live' || el.classList.contains('live-in')) return true;
    const t = Date.parse(el.dataset.liveDate ?? '');
    return now >= t - BEFORE && now <= t + AFTER;
  });
}

/** Prochain moment où un match entre dans la fenêtre de surveillance (pour se réveiller à temps). */
function nextWake(now = Date.now()): number | null {
  const starts = els()
    .filter((el) => !el.classList.contains('live-post'))
    .map((el) => Date.parse(el.dataset.liveDate ?? '') - BEFORE)
    .filter((t) => t > now);
  return starts.length ? Math.min(...starts) : null;
}

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, '');

function clockOf(st: any): string {
  const name = String(st?.type?.name ?? '');
  const short = String(st?.type?.shortDetail ?? st?.displayClock ?? '').trim();
  if (/HALF_?TIME/i.test(name) || /^HT$/i.test(short)) return 'Mi-temps';
  if (st?.type?.state === 'post') return 'Terminé';
  const m = short.match(/\d+(\+\d+)?'?/);
  return m ? `${m[0].replace(/'$/, '')}'` : 'En cours';
}

async function fetchLeague(league: string, day: string): Promise<Map<string, LiveState>> {
  const r = await fetch(`${SITE}/${league}/scoreboard?dates=${day}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  const out = new Map<string, LiveState>();
  for (const e of (j?.events ?? []) as any[]) {
    const comp = e?.competitions?.[0];
    const side = (h: 'home' | 'away') => comp?.competitors?.find((c: any) => c?.homeAway === h);
    const st = e?.status ?? comp?.status;
    const state = st?.type?.state;
    if (state !== 'pre' && state !== 'in' && state !== 'post') continue;
    out.set(String(e.id), { state, home: String(side('home')?.score ?? ''), away: String(side('away')?.score ?? ''), clock: clockOf(st) });
  }
  return out;
}

function apply(id: string, s: LiveState) {
  if (s.state === 'pre') return;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-live-id="${id}"]`)) {
    el.classList.remove('live-stale');
    el.classList.toggle('live-in', s.state === 'in');
    el.classList.toggle('live-post', s.state === 'post');
    el.querySelectorAll<HTMLElement>('[data-live-score="home"]').forEach((x) => (x.textContent = s.home || '0'));
    el.querySelectorAll<HTMLElement>('[data-live-score="away"]').forEach((x) => (x.textContent = s.away || '0'));
    // data-live-clock="short" : temps de jeu seul (place réduite), sinon « En cours · 52' ».
    el.querySelectorAll<HTMLElement>('[data-live-clock]').forEach(
      (x) => (x.textContent = s.state === 'post' ? 'Terminé' : x.dataset.liveClock === 'short' ? s.clock : `En cours · ${s.clock}`),
    );
  }
}

let timer: number | undefined;

async function tick() {
  window.clearTimeout(timer);
  if (document.hidden) return; // reprise au retour à l'écran
  const list = watched();
  if (!list.length) {
    const wake = nextWake();
    // Réveil au prochain coup d'envoi (au plus tard dans 10 min, l'horloge de l'appareil pouvant dériver).
    if (wake) timer = window.setTimeout(tick, Math.min(wake - Date.now(), 10 * 60_000));
    return;
  }
  const groups = new Map<string, HTMLElement[]>();
  for (const el of list) {
    const k = `${el.dataset.liveLeague}|${ymd(el.dataset.liveDate ?? '')}`;
    groups.set(k, [...(groups.get(k) ?? []), el]);
  }
  await Promise.all(
    [...groups].map(async ([k, members]) => {
      const [league, day] = k.split('|');
      try {
        const res = await fetchLeague(league, day);
        for (const el of members) {
          const s = res.get(el.dataset.liveId!);
          if (s) apply(el.dataset.liveId!, s);
        }
      } catch {
        // ESPN injoignable : on garde le dernier score connu, avec une mention discrète.
        // (dès le coup d'envoi passé, même si on n'a encore jamais eu de score)
        const now = Date.now();
        for (const el of members) if (now >= Date.parse(el.dataset.liveDate ?? '') || el.dataset.liveStatus === 'live') el.classList.add('live-stale');
      }
    }),
  );
  timer = window.setTimeout(tick, POLL);
}

export function startLive() {
  if (!document.querySelector('[data-live-id]')) return;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  tick();
}
