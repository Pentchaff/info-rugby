// Enjeu au classement d'un match à venir : place des deux équipes selon le résultat.
import { competitionBySlug, standings, team } from './data';
import { applyOutcomes, rankOf, type Outcome } from './standings';
import type { Match, StandingGroup } from './types';

export const ord = (n: number) => (n === 1 ? '1er' : `${n}e`);

/** Classement (poule, hémisphère…) dans lequel figure l'équipe. */
export function groupFor(slug: string, teamId: string): StandingGroup | undefined {
  return (standings[slug] ?? []).find((g) => g.rows.some((r) => r.teamId === teamId));
}

/**
 * Vrai si le match compte pour un classement : les deux équipes y figurent, dans le même groupe,
 * ou dans deux groupes différents pour les compétitions croisées (Nations Championship : Nord contre Sud).
 */
export function inStandings(m: Match): boolean {
  const gH = groupFor(m.competition, m.home.teamId);
  const gA = groupFor(m.competition, m.away.teamId);
  return !!gH && !!gA && (gH === gA || !!competitionBySlug.get(m.competition)?.groups?.length);
}

/** Place actuelle d'une équipe dans la compétition (null si pas de classement). */
export function currentRank(slug: string, teamId: string): number | null {
  for (const g of standings[slug] ?? []) {
    const r = g.rows.find((x) => x.teamId === teamId);
    if (r) return r.rank;
  }
  return null;
}

export interface Stakes {
  now: { home: number; away: number };
  total: number;
  /** Précision sur le classement concerné (« dans la poule 2 »…), ou null. */
  scope: string | null;
  rows: { outcome: Outcome; label: string; home: number; away: number }[];
}

export function matchStakes(m: Match): Stakes | null {
  if (m.status !== 'scheduled') return null;
  if (!inStandings(m)) return null;
  const gH = groupFor(m.competition, m.home.teamId)!;
  const gA = groupFor(m.competition, m.away.teamId)!;
  if ([gH, gA].some((g) => g.rows.some((r) => r.points === null))) return null;
  const home = team(m.home.teamId);
  const away = team(m.away.teamId);
  const baseOf = (g: StandingGroup) => g.rows.map((r) => ({ teamId: r.teamId, points: r.points ?? 0, diff: r.diff ?? 0, played: r.played ?? 0 }));
  const baseH = baseOf(gH);
  const baseA = gA === gH ? baseH : baseOf(gA);
  const scen: { outcome: Outcome; label: string }[] = [
    { outcome: 'homeBonus', label: `${home.name} gagne avec le bonus offensif` },
    { outcome: 'home', label: `${home.name} gagne` },
    { outcome: 'homeClose', label: `${home.name} gagne, ${away.name} prend le bonus défensif` },
    { outcome: 'draw', label: 'Match nul' },
    { outcome: 'awayClose', label: `${away.name} gagne, ${home.name} prend le bonus défensif` },
    { outcome: 'away', label: `${away.name} gagne` },
    { outcome: 'awayBonus', label: `${away.name} gagne avec le bonus offensif` },
  ];
  const several = (standings[m.competition]?.length ?? 0) > 1;
  const pool = (n: string | null) => (n ?? '').toLowerCase().replace('pool', 'poule');
  return {
    now: { home: rankOf(baseH).get(home.id)!, away: rankOf(baseA).get(away.id)! },
    total: baseH.length,
    scope: gH !== gA ? `de chaque équipe dans son classement (${pool(gH.name)} pour ${home.name}, ${pool(gA.name)} pour ${away.name})` : several && gH.name ? `dans la ${pool(gH.name)}` : null,
    rows: scen.map((sc) => {
      const res = [{ home: home.id, away: away.id, outcome: sc.outcome }];
      return { ...sc, home: rankOf(applyOutcomes(baseH, res)).get(home.id)!, away: rankOf(applyOutcomes(baseA, res)).get(away.id)! };
    }),
  };
}
