import type { RawSummary } from './espn.ts';

/**
 * Temps de jeu de chaque joueur, reconstitué à partir des remplacements :
 * les titulaires entrent à la 0e minute, chaque sortie ou carton rouge clôt une période.
 * Les allers-retours (protocole commotion, saignement) sont pris en compte. Match de 80 min.
 */
export function playingTime(s: RawSummary): Map<string, number> | null {
  if (!s.timeline) return null;
  const end = Math.max(80, ...s.timeline.map((e) => e.minute));
  const onSince = new Map<string, number>();
  const total = new Map<string, number>();
  for (const r of s.rosters) for (const e of r.entries) if (e.starter) onSince.set(e.playerId, 0);
  const close = (id: string, t: number) => {
    const st = onSince.get(id);
    if (st === undefined) return;
    total.set(id, (total.get(id) ?? 0) + Math.max(0, Math.min(t, end) - st));
    onSince.delete(id);
  };
  for (const ev of s.timeline) {
    if (ev.kind === 'on' && !onSince.has(ev.playerId)) onSince.set(ev.playerId, ev.minute);
    else if (ev.kind === 'off' || ev.kind === 'red') close(ev.playerId, ev.minute);
  }
  for (const id of [...onSince.keys()]) close(id, end);
  return total;
}

