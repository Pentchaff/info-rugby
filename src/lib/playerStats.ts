// Ratios des joueurs et comparaison à la moyenne du même poste (« so-what »).
import { matchById, playerPosition, players } from './data';
import type { Player } from './types';

export const MIN_MATCHES = 3; // échantillon minimal pour entrer dans la moyenne du poste

export interface MetricDef {
  key: string;
  label: string;
  unit?: string;
  decimals: number;
  higherIsBetter: boolean;
  help: string;
  /** Les joueurs à 0 sont exclus de la moyenne (ex. points au pied : seuls les buteurs comptent). */
  onlyNonZero?: boolean;
  format?: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const METRICS: MetricDef[] = [
  { key: 'minutesPerMatch', label: 'Minutes par match', unit: 'min', decimals: 0, higherIsBetter: true, help: "Temps de jeu moyen, reconstitué à partir des remplacements." },
  { key: 'triesPer80', label: 'Essais par 80 min', decimals: 2, higherIsBetter: true, help: 'Essais marqués ramenés à un match complet : compare titulaires et remplaçants à temps de jeu égal.' },
  { key: 'pointsPerMatch', label: 'Points par match', decimals: 1, higherIsBetter: true, help: 'Essais, transformations, pénalités et drops.' },
  { key: 'kickPointsPerMatch', label: 'Points au pied par match', decimals: 1, higherIsBetter: true, onlyNonZero: true, help: 'Transformations (2), pénalités (3) et drops (3). Comparé aux seuls buteurs du poste.' },
  { key: 'teamTryShare', label: "Part des essais de l'équipe", decimals: 0, higherIsBetter: true, format: pct, help: "Part des essais de son équipe qu'il a marqués, sur les matchs qu'il a joués." },
  { key: 'startRate', label: 'Taux de titularisation', decimals: 0, higherIsBetter: true, format: pct, help: 'Matchs commencés parmi les matchs joués.' },
  { key: 'winRate', label: 'Victoires quand il joue', decimals: 0, higherIsBetter: true, format: pct, help: "Pourcentage de matchs gagnés par son équipe quand il est sur le terrain." },
  { key: 'cardsPer80', label: 'Cartons par 80 min', decimals: 2, higherIsBetter: false, help: 'Cartons jaunes et rouges, ramenés à un match complet. Plus bas, c’est mieux.' },
];

export type Ratios = Record<string, number | null>;

// Essais de chaque équipe, par match (à partir des marqueurs).
const teamTries = new Map<string, number>();
for (const m of matchById.values()) {
  for (const s of m.scorers) teamTries.set(`${m.id}:${s.teamId}`, (teamTries.get(`${m.id}:${s.teamId}`) ?? 0) + s.tries);
}

export function ratios(p: Player): Ratios {
  const apps = p.appearances.filter((a) => matchById.has(a.matchId));
  const n = apps.length;
  if (!n) return {};
  const withMin = apps.filter((a) => typeof a.minutes === 'number');
  const minutes = withMin.reduce((s, a) => s + (a.minutes ?? 0), 0);
  const minOk = withMin.length === n && minutes > 0;
  const tries = apps.reduce((s, a) => s + a.tries, 0);
  const points = apps.reduce((s, a) => s + a.points, 0);
  const kickPts = apps.reduce((s, a) => s + 2 * (a.conversions ?? 0) + 3 * (a.penalties ?? 0) + 3 * (a.drops ?? 0), 0);
  const cards = apps.reduce((s, a) => s + (a.yellow ?? 0) + (a.red ?? 0), 0);
  const kicksKnown = apps.some((a) => a.conversions !== undefined);
  let team = 0;
  let wins = 0;
  let decided = 0;
  for (const a of apps) {
    team += teamTries.get(`${a.matchId}:${a.teamId}`) ?? 0;
    const m = matchById.get(a.matchId)!;
    if (m.home.score === null || m.away.score === null) continue;
    const mine = m.home.teamId === a.teamId ? m.home.score : m.away.score;
    const theirs = m.home.teamId === a.teamId ? m.away.score : m.home.score;
    decided++;
    if (mine > theirs) wins++;
  }
  return {
    minutesPerMatch: minOk ? minutes / n : null,
    triesPer80: minOk ? (tries / minutes) * 80 : null,
    pointsPerMatch: points / n,
    kickPointsPerMatch: kicksKnown ? kickPts / n : null,
    teamTryShare: team > 0 ? tries / team : null,
    startRate: apps.filter((a) => a.starter).length / n,
    winRate: decided ? wins / decided : null,
    cardsPer80: minOk && kicksKnown ? (cards / minutes) * 80 : null,
  };
}

// ---------- Références par poste ----------

const PLURAL: Record<string, string> = {
  Pilier: 'piliers', Talonneur: 'talonneurs', '2e ligne': 'deuxièmes lignes', '3e ligne aile': 'troisièmes lignes aile',
  '3e ligne centre': 'troisièmes lignes centre', 'Demi de mêlée': 'demis de mêlée', "Demi d'ouverture": "demis d'ouverture",
  Centre: 'centres', Ailier: 'ailiers', Arrière: 'arrières',
};
export const positionPlural = (pos: string) => PLURAL[pos] ?? pos.toLowerCase();

interface Pool {
  values: Record<string, number[]>; // trié décroissant
  avg: Record<string, number>;
  size: number;
}

const pools = new Map<string, Pool>();
for (const p of Object.values(players)) {
  const pos = playerPosition(p);
  if (!pos || !PLURAL[pos] || p.appearances.length < MIN_MATCHES) continue;
  const r = ratios(p);
  const pool = pools.get(pos) ?? { values: {}, avg: {}, size: 0 };
  pool.size++;
  for (const m of METRICS) {
    const v = r[m.key];
    if (v === null || v === undefined) continue;
    if (m.onlyNonZero && v === 0) continue;
    (pool.values[m.key] ??= []).push(v);
  }
  pools.set(pos, pool);
}
for (const pool of pools.values()) {
  for (const [k, arr] of Object.entries(pool.values)) {
    arr.sort((a, b) => b - a);
    pool.avg[k] = arr.reduce((s, v) => s + v, 0) / arr.length;
  }
}

export interface Comparison {
  value: number;
  avg: number;
  delta: number; // écart relatif à la moyenne (0,5 = +50 %)
  rank: number; // 1 = meilleur
  of: number;
  avgRank: number; // place qu'occuperait la moyenne (pour la positionner sur l'échelle)
  sentence: string; // « +52 % vs la moyenne des ailiers »
  tone: 'good' | 'bad' | 'neutral';
}

export function compare(p: Player, metric: MetricDef, value: number | null): Comparison | null {
  const pos = playerPosition(p);
  if (value === null || !pos) return null;
  if (metric.onlyNonZero && value === 0) return null;
  const pool = pools.get(pos);
  const arr = pool?.values[metric.key];
  if (!pool || !arr || arr.length < 5) return null;
  const avg = pool.avg[metric.key];
  const better = (a: number, b: number) => (metric.higherIsBetter ? a > b : a < b);
  const rank = 1 + arr.filter((v) => better(v, value)).length;
  const avgRank = 1 + arr.filter((v) => better(v, avg)).length;
  const who = positionPlural(pos);
  let sentence: string;
  let delta = 0;
  if (avg === 0) {
    sentence = value === 0 ? `comme la plupart des ${who}` : `alors que la moyenne des ${who} est à 0`;
  } else {
    delta = (value - avg) / avg;
    const ratio = value / avg;
    if (Math.abs(delta) < 0.1) sentence = `dans la moyenne des ${who}`;
    else if (ratio >= 2) sentence = `${ratio.toFixed(1).replace('.', ',')}× la moyenne des ${who}`;
    else sentence = `${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta) * 100)} % vs la moyenne des ${who}`;
  }
  const goodSide = metric.higherIsBetter ? delta > 0 : delta < 0;
  const tone = Math.abs(delta) < 0.1 && avg !== 0 ? 'neutral' : goodSide || (avg === 0 && value > 0 && metric.higherIsBetter) ? 'good' : 'bad';
  return { value, avg, delta, rank, of: arr.length, avgRank, sentence, tone };
}

export function formatMetric(m: MetricDef, v: number): string {
  if (m.format) return m.format(v);
  return v.toFixed(m.decimals).replace('.', ',') + (m.unit ? ` ${m.unit}` : '');
}

/** Résumé « En bref » : les 2 points forts les plus marquants vs le poste. */
export function highlights(p: Player): string[] {
  const r = ratios(p);
  const pos = playerPosition(p);
  if (!pos || p.appearances.length < MIN_MATCHES) return [];
  const out: { score: number; text: string }[] = [];
  for (const m of METRICS) {
    const c = compare(p, m, r[m.key] ?? null);
    if (!c || c.tone !== 'good' || c.of < 8) continue;
    const top = c.rank / c.of;
    if (top > 0.25 && Math.abs(c.delta) < 0.4) continue;
    const place = c.rank <= 3 ? `${c.rank === 1 ? '1er' : `${c.rank}e`} sur ${c.of} ${positionPlural(pos)}` : `top ${Math.max(1, Math.round(top * 100))} % des ${positionPlural(pos)}`;
    out.push({ score: Math.abs(c.delta) + (1 - top), text: `${m.label} : ${formatMetric(m, c.value)}, ${c.sentence.replace(/ des .*$/, '')} (${place}).` });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.text);
}
