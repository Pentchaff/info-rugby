// Calculs de classement « et si… » : utilisés au build (pages match) et dans le navigateur (simulateur).

export interface SimRow {
  teamId: string;
  points: number;
  diff: number;
  played: number;
}

/** Résultat d'un match du point de vue de l'équipe à domicile : [points dom., points ext.]. */
export const OUTCOMES = {
  none: { label: 'Non joué', pts: null },
  homeBonus: { label: 'Victoire dom. bonifiée', pts: [5, 0] },
  home: { label: 'Victoire dom.', pts: [4, 0] },
  homeClose: { label: 'Victoire dom., ext. bonus déf.', pts: [4, 1] },
  draw: { label: 'Match nul', pts: [2, 2] },
  awayClose: { label: 'Victoire ext., dom. bonus déf.', pts: [1, 4] },
  away: { label: 'Victoire ext.', pts: [0, 4] },
  awayBonus: { label: 'Victoire ext. bonifiée', pts: [0, 5] },
} as const satisfies Record<string, { label: string; pts: readonly [number, number] | null }>;
export type Outcome = keyof typeof OUTCOMES;

/** Trie par points, puis différence de points (départage simplifié). Retourne teamId -> rang. */
export function rankOf(rows: SimRow[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.diff - a.diff);
  const out = new Map<string, number>();
  sorted.forEach((r, i) => out.set(r.teamId, i + 1));
  return out;
}

export function applyOutcomes(rows: SimRow[], results: { home: string; away: string; outcome: Outcome }[]): SimRow[] {
  const next = rows.map((r) => ({ ...r }));
  const byId = new Map(next.map((r) => [r.teamId, r]));
  for (const res of results) {
    const pts = OUTCOMES[res.outcome].pts;
    if (!pts) continue;
    const h = byId.get(res.home);
    const a = byId.get(res.away);
    if (h) { h.points += pts[0]; h.played++; }
    if (a) { a.points += pts[1]; a.played++; }
  }
  return next;
}
