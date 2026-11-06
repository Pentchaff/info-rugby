// Enjeu au classement d'un match à venir : place des deux équipes selon le résultat.
import { standings, team } from './data';
import { applyOutcomes, rankOf, type Outcome } from './standings';
import type { Match, StandingGroup } from './types';

export const ord = (n: number) => (n === 1 ? '1er' : `${n}e`);

export function groupOf(m: Match): StandingGroup | undefined {
  return (standings[m.competition] ?? []).find(
    (g) => g.rows.some((r) => r.teamId === m.home.teamId) && g.rows.some((r) => r.teamId === m.away.teamId),
  );
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
  groupName: string | null;
  rows: { outcome: Outcome; label: string; home: number; away: number }[];
}

export function matchStakes(m: Match): Stakes | null {
  if (m.status !== 'scheduled') return null;
  const g = groupOf(m);
  if (!g || g.rows.some((r) => r.points === null)) return null;
  const home = team(m.home.teamId);
  const away = team(m.away.teamId);
  const base = g.rows.map((r) => ({ teamId: r.teamId, points: r.points ?? 0, diff: r.diff ?? 0, played: r.played ?? 0 }));
  const now = rankOf(base);
  const scen: { outcome: Outcome; label: string }[] = [
    { outcome: 'homeBonus', label: `${home.name} gagne avec le bonus offensif` },
    { outcome: 'home', label: `${home.name} gagne` },
    { outcome: 'homeClose', label: `${home.name} gagne, ${away.name} prend le bonus défensif` },
    { outcome: 'draw', label: 'Match nul' },
    { outcome: 'awayClose', label: `${away.name} gagne, ${home.name} prend le bonus défensif` },
    { outcome: 'away', label: `${away.name} gagne` },
    { outcome: 'awayBonus', label: `${away.name} gagne avec le bonus offensif` },
  ];
  return {
    now: { home: now.get(home.id)!, away: now.get(away.id)! },
    total: base.length,
    groupName: (standings[m.competition]?.length ?? 0) > 1 ? g.name : null,
    rows: scen.map((sc) => {
      const r = rankOf(applyOutcomes(base, [{ home: home.id, away: away.id, outcome: sc.outcome }]));
      return { ...sc, home: r.get(home.id)!, away: r.get(away.id)! };
    }),
  };
}
