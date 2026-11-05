import type { APIRoute } from 'astro';
import { playerPosition, playerTeams, players, teams } from '../lib/data';

export const GET: APIRoute = () => {
  const items = [
    ...Object.values(teams).map((t) => ({ k: 'e', id: t.id, n: t.name, a: t.espnName, s: t.national ? 'Sélection' : 'Club' })),
    ...Object.values(players).map((p) => {
      const { club, nation } = playerTeams(p);
      return { k: 'j', id: p.id, n: p.name, s: [playerPosition(p), club?.name ?? nation?.name].filter(Boolean).join(' · ') };
    }),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};
