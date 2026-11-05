// Génère un jeu de données fictif (fixtures/data) pour développer sans réseau :
//   npx tsx scripts/make-fixtures.ts && DATA_DIR=fixtures/data npm run dev
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Match, Meta, Player, StandingGroup, Team } from '../src/lib/types.ts';

const out = 'fixtures/data';
mkdirSync(out, { recursive: true });
const H = 3600_000, D = 24 * H;
const now = Date.now();
const clubs = ['Toulouse', 'Bordeaux Begles', 'Stade Francais Paris', 'Racing 92', 'La Rochelle', 'Toulon', 'Clermont', 'Castres Olympique'];
const fr: Record<string, string> = { Toulouse: 'Stade Toulousain', 'Bordeaux Begles': 'Union Bordeaux-Bègles', 'Stade Francais Paris': 'Stade Français', 'La Rochelle': 'Stade Rochelais', Toulon: 'RC Toulon', Clermont: 'ASM Clermont' };
const teams: Record<string, Team> = {};
clubs.forEach((c, i) => (teams[String(100 + i)] = { id: String(100 + i), name: fr[c] ?? c, espnName: c, short: c.slice(0, 3).toUpperCase(), logo: null, national: false, competitions: ['top14'] }));
['France', 'New Zealand', 'South Africa', 'Ireland'].forEach((n, i) => (teams[String(200 + i)] = { id: String(200 + i), name: { France: 'France', 'New Zealand': 'Nouvelle-Zélande', 'South Africa': 'Afrique du Sud', Ireland: 'Irlande' }[n]!, espnName: n, short: n.slice(0, 3).toUpperCase(), logo: null, national: true, competitions: ['tests'] }));

const players: Record<string, Player> = {};
const names = ['Antoine Dupont', 'Romain Ntamack', 'Thomas Ramos', 'Matthieu Jalibert', 'Louis Bielle-Biarrey', 'Damian Penaud', 'Gaël Fickou', 'Grégory Alldritt', 'Julien Marchand', 'Cyril Baille', 'Uini Atonio', 'Paul Boudehent', 'Thibaud Flament', 'Emmanuel Meafou', 'Yoram Moefana'];
const matches: Match[] = [];
let mid = 9000;
for (let r = -4; r <= 3; r++) {
  for (let k = 0; k < 4; k++) {
    const h = String(100 + ((k * 2 + r + 8) % 8)), a = String(100 + ((k * 2 + 1 + r + 8) % 8));
    const date = new Date(now + r * 7 * D + (k - 1.5) * 3 * H).toISOString();
    const final = r < 0;
    const m: Match = { id: String(mid++), competition: 'top14', date, status: final ? 'final' : 'scheduled', home: { teamId: h, score: final ? 15 + ((k * 7 + r) % 20) : null }, away: { teamId: a, score: final ? 10 + ((k * 5 - r) % 18 + 18) % 18 : null }, venue: 'Stade Ernest-Wallon, Toulouse', round: `Journée ${r + 6}`, lineups: null, scorers: [], summaryFetchedAt: final ? date : null, resume: null, resumeLastCheck: null, resumeChecks: 0 };
    matches.push(m);
  }
}
matches.push({ id: '9500', competition: 'tests', date: new Date(now + 2 * D).toISOString(), status: 'scheduled', home: { teamId: '200', score: null }, away: { teamId: '201', score: null }, venue: 'Stade de France, Saint-Denis', round: null, lineups: null, scorers: [], summaryFetchedAt: null, resume: null, resumeLastCheck: null, resumeChecks: 0 });
const t9501: Match = { id: '9501', competition: 'tests', date: new Date(now - 5 * D).toISOString(), status: 'final', home: { teamId: '200', score: 31 }, away: { teamId: '202', score: 27 }, venue: 'Stade Vélodrome, Marseille', round: null, lineups: { home: [], away: [] }, scorers: [], summaryFetchedAt: null, resume: { videoId: 'dQw4w9WgXcQ', title: 'France v Afrique du Sud | Résumé', channel: 'France Rugby', publishedAt: new Date(now - 5 * D + 3 * H).toISOString(), embeddable: true }, resumeLastCheck: null, resumeChecks: 1 };
matches.push(t9501);
names.forEach((n, i) => {
  const id = String(5000 + i);
  const club = String(100 + (i % 3));
  const p: Player = { id, name: n, position: null, headshot: null, birthDate: `${1994 + (i % 8)}-0${1 + (i % 9)}-15`, infoFetchedAt: 'x', wikidata: i < 3 ? { qid: 'Q1', checkedAt: 'x', parcours: [{ team: 'Stade Toulousain', start: 2014 + i, end: null, national: false }, { team: 'Colomiers', start: 2012, end: 2014 + i, national: false }, { team: 'équipe de France', start: 2017, end: null, national: true }] } : { qid: null, checkedAt: 'x', parcours: [] }, appearances: [] };
  for (const m of matches.filter((m) => m.status === 'final' && (m.home.teamId === club || m.away.teamId === club))) {
    const tries = (i + Number(m.id)) % 4 === 0 ? 1 : 0;
    p.appearances.push({ matchId: m.id, teamId: club, starter: true, jersey: i + 1, tries, points: tries * 5, stats: { tackles: 5 + (i % 7), metres: 20 + i * 3 } });
  }
  p.appearances.push({ matchId: '9501', teamId: '200', starter: true, jersey: i + 1, tries: i === 4 ? 2 : 0, points: i === 4 ? 10 : i === 2 ? 11 : 0, stats: {} });
  t9501.lineups!.home.push({ playerId: id, jersey: i + 1, starter: true, position: null });
  players[id] = p;
});
t9501.scorers = [{ playerId: '5004', teamId: '200', tries: 2, points: 10 }, { playerId: '5002', teamId: '200', tries: 0, points: 11 }];
const standings: Record<string, StandingGroup[]> = { top14: [{ name: null, rows: Object.keys(teams).filter((t) => !teams[t].national).map((t, i) => ({ teamId: t, rank: i + 1, played: 9, won: 9 - i, drawn: 0, lost: i, diff: 80 - i * 20, bonus: 3, points: 40 - i * 4 })) }] };
const meta: Meta = { updatedAt: new Date(now - 12 * 60_000).toISOString(), lastFullAt: new Date(now - 2 * H).toISOString(), season: { start: '2026-08-01', end: '2027-07-31', label: '2026-27' }, leagues: { top14: { espnId: '270559', espnName: 'Top 14', matches: 32 } }, youtubeChannels: {}, errors: ['exemple : avertissement fictif'], lastRun: null };
const w = (f: string, d: unknown) => writeFileSync(`${out}/${f}`, JSON.stringify(d, null, 1));
w('matches.json', matches.sort((a, b) => a.date.localeCompare(b.date)));
w('teams.json', teams);
w('players.json', players);
w('standings.json', standings);
w('meta.json', meta);
console.log('fixtures écrites dans', out);
