// Tableau final : la Phase finale telle qu'elle serait si la saison régulière s'arrêtait aujourd'hui.
import { competitionBySlug } from './data';
import type { StandingGroup } from './types';

export type BracketNode =
  | { kind: 'team'; teamId: string; seed: number }
  | { kind: 'match'; a: BracketNode; b: BracketNode };

export interface Bracket {
  /** Nom de chaque tour, de gauche (premier tour) à droite (finale). */
  rounds: string[];
  final: Extract<BracketNode, { kind: 'match' }>;
  /** Places qui comptent sans être dans le tableau (accession, relégation, repêchage). */
  extras: { label: string; teamIds: string[] }[];
}

const team = (teamId: string, seed: number): BracketNode => ({ kind: 'team', teamId, seed });
const match = (a: BracketNode, b: BracketNode): BracketNode & { kind: 'match' } => ({ kind: 'match', a, b });

/** Équipes qui peuvent occuper ce nœud (toutes les équipes de la branche). */
export function teamsOf(n: BracketNode): string[] {
  return n.kind === 'team' ? [n.teamId] : [...teamsOf(n.a), ...teamsOf(n.b)];
}

/** Le Tableau final n'a de sens qu'une fois que chaque équipe a joué au moins un match. */
function started(groups: StandingGroup[]): boolean {
  const rows = groups.flatMap((g) => g.rows);
  return rows.length > 0 && rows.every((r) => (r.played ?? 0) > 0);
}

/** Vrai si un Tableau final est affiché pour cette compétition (arbre, ou Nord contre Sud). */
export function hasTableauFinal(slug: string, groups: StandingGroup[]): boolean {
  if (bracketFor(slug, groups)) return true;
  return (competitionBySlug.get(slug)?.groups?.length ?? 0) === 2 && groups.length === 2 && started(groups);
}

export function bracketFor(slug: string, groups: StandingGroup[]): Bracket | null {
  if (!started(groups)) return null;

  if (slug === 'top14') {
    const rows = groups[0]?.rows ?? [];
    if (rows.length < 6) return null;
    const s = (n: number) => team(rows[n - 1].teamId, n);
    // Barrages : 3e contre 6e, 4e contre 5e. Le 1er affronte le vainqueur de 4-5, le 2e celui de 3-6.
    return {
      rounds: ['Barrages', 'Demi-finales', 'Finale'],
      final: match(match(s(1), match(s(4), s(5))), match(s(2), match(s(3), s(6)))),
      extras: rows.length >= 14
        ? [
            { label: "13e : match d'accession", teamIds: [rows[12].teamId] },
            { label: 'Relégué en Pro D2', teamIds: [rows[13].teamId] },
          ]
        : [],
    };
  }

  if (slug === 'champions-cup') {
    if (groups.length !== 4 || groups.some((g) => g.rows.length < 5)) return null;
    // 16 qualifiés rangés : premiers de poule (1-4), puis deuxièmes (5-8), troisièmes, quatrièmes ;
    // à l'intérieur de chaque rang, aux points puis à la différence de points.
    const seeds = [0, 1, 2, 3].flatMap((k) =>
      groups
        .map((g) => g.rows[k])
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.diff ?? 0) - (a.diff ?? 0))
        .map((r) => r.teamId),
    );
    const s = (n: number) => team(seeds[n - 1], n);
    const r16 = [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]].map(([a, b]) => match(s(a), s(b)));
    const qf = [0, 2, 4, 6].map((i) => match(r16[i], r16[i + 1]));
    return {
      rounds: ['Huitièmes', 'Quarts', 'Demies', 'Finale'],
      final: match(match(qf[0], qf[1]), match(qf[2], qf[3])),
      extras: [{ label: 'Repêchés en Challenge Cup', teamIds: groups.map((g) => g.rows[4].teamId) }],
    };
  }

  return null;
}

// ---------- Mise en page (colonnes et lignes) ----------

export interface LaidMatch {
  node: Extract<BracketNode, { kind: 'match' }>;
  col: number;
  row: number;
}

/** Place chaque match : colonne = tour, ligne = position verticale (moyenne de ses matchs d'origine). */
export function layout(final: Extract<BracketNode, { kind: 'match' }>): { matches: LaidMatch[]; cols: number; rows: number } {
  const out: LaidMatch[] = [];
  let next = 0;
  const visit = (n: Extract<BracketNode, { kind: 'match' }>): LaidMatch => {
    const kids = [n.a, n.b].filter((c): c is Extract<BracketNode, { kind: 'match' }> => c.kind === 'match').map(visit);
    const laid: LaidMatch = kids.length
      ? { node: n, col: 1 + Math.max(...kids.map((k) => k.col)), row: kids.reduce((s, k) => s + k.row, 0) / kids.length }
      : { node: n, col: 0, row: next++ };
    out.push(laid);
    return laid;
  };
  const root = visit(final);
  return { matches: out, cols: root.col + 1, rows: next };
}
