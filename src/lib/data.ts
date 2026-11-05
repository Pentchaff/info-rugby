// Chargement des données au moment du build (pages pré-générées).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CompetitionConfig, Match, Meta, Player, StandingGroup, Team } from './types';

const ROOT = process.cwd();
const DATA = resolve(ROOT, process.env.DATA_DIR ?? 'data');

function read<T>(dir: string, file: string, fallback: T): T {
  const p = join(dir, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export const competitions: CompetitionConfig[] = read(join(ROOT, 'config'), 'competitions.json', { competitions: [] as CompetitionConfig[] }).competitions;
export const corrections: Record<string, string> = read(join(ROOT, 'config'), 'corrections-diffusion.json', { corrections: {} as Record<string, string> }).corrections;

export const matches: Match[] = read<Match[]>(DATA, 'matches.json', []).filter((m) => competitions.some((c) => c.slug === m.competition));
export const teams: Record<string, Team> = read(DATA, 'teams.json', {});
export const players: Record<string, Player> = read(DATA, 'players.json', {});
export const standings: Record<string, StandingGroup[]> = read(DATA, 'standings.json', {});
export const meta: Meta = read<Meta>(DATA, 'meta.json', {
  updatedAt: null,
  lastFullAt: null,
  season: { start: '', end: '', label: '' },
  leagues: {},
  youtubeChannels: {},
  errors: [],
  lastRun: null,
});

export const matchById = new Map(matches.map((m) => [m.id, m]));
export const competitionBySlug = new Map(competitions.map((c) => [c.slug, c]));

// ---------- URL ----------

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const url = (path: string) => `${BASE}/${path.replace(/^\//, '')}`;
export const matchUrl = (id: string) => url(`match/${id}/`);
export const teamUrl = (id: string) => url(`equipe/${id}/`);
export const playerUrl = (id: string) => url(`joueur/${id}/`);

// ---------- Dates (heure de Paris) ----------

const TZ = 'Europe/Paris';
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts });
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const fDay = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fDayShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fKey = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

export const timeParis = (iso: string) => fTime.format(new Date(iso)).replace(':', 'h');
export const dayParis = (iso: string) => cap(fDay.format(new Date(iso)));
export const dayShortParis = (iso: string) => fDayShort.format(new Date(iso));
/** Clé AAAA-MM-JJ du jour à Paris. */
export const dayKey = (iso: string) => {
  const [d, m, y] = fKey.format(new Date(iso)).split('/');
  return `${y}-${m}-${d}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Diffuseurs ----------

export type DiffusionSource = 'correction' | 'regle';

export function diffusion(m: Match): { name: string; source: DiffusionSource } {
  const c = corrections[m.id];
  if (c) return { name: c, source: 'correction' };
  return { name: competitionBySlug.get(m.competition)?.diffusion ?? '—', source: 'regle' };
}

// ---------- Équipes / joueurs ----------

export const team = (id: string): Team =>
  teams[id] ?? { id, name: 'À déterminer', espnName: '', short: '?', logo: null, national: false, competitions: [] };

export function age(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

/** Dernière équipe de club et dernière sélection d'un joueur, d'après ses matchs. */
export function playerTeams(p: Player) {
  let club: Team | null = null;
  let nation: Team | null = null;
  for (const a of p.appearances) {
    const t = teams[a.teamId];
    if (!t) continue;
    if (t.national) nation = t;
    else club = t;
  }
  return { club, nation };
}

export const STAT_LABELS: Record<string, string> = {
  tackles: 'Plaquages',
  missedTackles: 'Plaquages manqués',
  metres: 'Mètres parcourus',
  carries: 'Courses',
  cleanBreaks: 'Franchissements',
  defendersBeaten: 'Défenseurs battus',
  offloads: 'Passes après contact',
  turnoversWon: 'Ballons grattés',
};

export function seasonStats(p: Player) {
  const s = { matches: 0, starts: 0, tries: 0, points: 0, advanced: {} as Record<string, number> };
  for (const a of p.appearances) {
    s.matches++;
    if (a.starter) s.starts++;
    s.tries += a.tries;
    s.points += a.points;
    for (const [k, v] of Object.entries(a.stats)) s.advanced[k] = (s.advanced[k] ?? 0) + v;
  }
  return s;
}

const POSITIONS_FR: [RegExp, string][] = [
  [/prop|pilier/i, 'Pilier'],
  [/hooker|talon/i, 'Talonneur'],
  [/lock|second row|2e ligne/i, '2e ligne'],
  [/flanker|back row|blindside|openside|flank/i, '3e ligne aile'],
  [/number 8|no\.? ?8|eighth/i, '3e ligne centre'],
  [/scrum|half ?back|demi de m/i, 'Demi de mêlée'],
  [/fly|out ?half|stand|first five|ouverture/i, "Demi d'ouverture"],
  [/centre|center/i, 'Centre'],
  [/wing|ailier/i, 'Ailier'],
  [/full ?back|arri/i, 'Arrière'],
  [/forward|avant/i, 'Avant'],
  [/back|trois-quart/i, 'Trois-quarts'],
  [/replacement|substitute|bench/i, 'Remplaçant'],
];
const JERSEY_FR: Record<number, string> = {
  1: 'Pilier', 2: 'Talonneur', 3: 'Pilier', 4: '2e ligne', 5: '2e ligne', 6: '3e ligne aile', 7: '3e ligne aile',
  8: '3e ligne centre', 9: 'Demi de mêlée', 10: "Demi d'ouverture", 11: 'Ailier', 12: 'Centre', 13: 'Centre', 14: 'Ailier', 15: 'Arrière',
};

export function positionFr(position: string | null, jersey?: number | null): string | null {
  if (position) {
    for (const [re, fr] of POSITIONS_FR) if (re.test(position) && fr !== 'Remplaçant') return fr;
  }
  if (jersey && JERSEY_FR[jersey]) return JERSEY_FR[jersey];
  return position;
}

/** Poste d'un joueur : poste ESPN, sinon numéro le plus fréquent comme titulaire. */
export function playerPosition(p: Player): string | null {
  const fromName = p.position ? positionFr(p.position) : null;
  if (fromName && fromName !== p.position) return fromName;
  const counts = new Map<number, number>();
  for (const a of p.appearances) if (a.starter && a.jersey && a.jersey <= 15) counts.set(a.jersey, (counts.get(a.jersey) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? JERSEY_FR[best[0]] : fromName;
}
