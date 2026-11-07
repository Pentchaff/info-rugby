// Avancement d'une Compétition : journées jouées, journée en cours, et matchs prévus au calendrier pour chacune.
import { matches } from './data';
import type { Match, StandingGroup } from './types';

export interface Journee {
  n: number;
  state: 'done' | 'live' | 'next' | 'todo';
  /** Matchs de la journée trouvés au calendrier (vide si joués avant la saison suivie, ex. juillet). */
  matches: Match[];
  start: string | null;
}

export interface Progress {
  total: number;
  /** Journée affichée par défaut : celle en cours, sinon la prochaine, sinon la dernière. */
  focus: number;
  label: string;
  journees: Journee[];
}

const DAY = 24 * 3600_000;

/** Regroupe les matchs en journées : un nouveau bloc commence plus de 4 jours après le début du précédent. */
function clusters(list: Match[]): Match[][] {
  const out: Match[][] = [];
  for (const m of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const cur = out[out.length - 1];
    if (cur && new Date(m.date).getTime() - new Date(cur[0].date).getTime() <= 4 * DAY) cur.push(m);
    else out.push([m]);
  }
  return out;
}

export function progressFor(slug: string, groups: StandingGroup[]): Progress | null {
  const rows = groups.flatMap((g) => g.rows);
  if (!rows.length) return null;
  const ids = new Set(rows.map((r) => r.teamId));
  // Une affiche (domicile → extérieur) n'a lieu qu'une fois : ESPN laisse parfois un doublon, on garde le match joué.
  const byPair = new Map<string, Match>();
  for (const m of matches) {
    if (m.competition !== slug || m.status === 'canceled' || !ids.has(m.home.teamId) || !ids.has(m.away.teamId)) continue;
    const k = `${m.home.teamId}>${m.away.teamId}`;
    const prev = byPair.get(k);
    if (!prev || (prev.status !== 'final' && m.status === 'final')) byPair.set(k, m);
  }
  const list = [...byPair.values()];

  // Total : matchs déjà joués (classement) + matchs encore au calendrier, pour l'équipe qui en a le plus.
  const remaining = (id: string) => list.filter((m) => m.status !== 'final' && (m.home.teamId === id || m.away.teamId === id)).length;
  const played = rows.map((r) => r.played ?? 0);
  const total = Math.max(...rows.map((r) => (r.played ?? 0) + remaining(r.teamId)));
  if (!total) return null;
  const min = Math.min(...played);
  const max = Math.max(...played);

  // Les blocs du calendrier sont les dernières journées (les premières peuvent précéder la saison suivie).
  const blocks = clusters(list).slice(-total);
  const offset = total - blocks.length;

  const journees: Journee[] = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const ms = n > offset ? blocks[n - offset - 1] : [];
    const state = n <= min ? 'done' : n <= max ? 'live' : n === max + 1 && min === max ? 'next' : 'todo';
    return { n, state, matches: ms, start: ms[0]?.date ?? null };
  });

  const label =
    min === max
      ? max === 0
        ? `Journée 1 sur ${total} à venir`
        : max >= total
          ? `Saison régulière terminée (${total} journées)`
          : `Après la journée ${max} sur ${total}`
      : `Journée ${max} sur ${total} · en cours`;
  const focus = min === max ? Math.min(max + 1, total) : max;
  return { total, focus, label, journees };
}
