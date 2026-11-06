// Collecteur : lancé par GitHub Actions (voir .github/workflows/site.yml).
// Usage : tsx collector/index.ts [auto|full|light]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as espn from './espn.ts';
import { chooseCandidate, lookupParcours, normName } from './wikidata.ts';
import { fetchFeed, isEmbeddable, resolveChannelId, titleMatches, type FeedVideo } from './youtube.ts';
import { pool } from './http.ts';
import { playingTime } from './minutes.ts';
import type { CompetitionConfig, Match, Meta, Player, StandingGroup, Team } from '../src/lib/types.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const DATA = join(ROOT, 'data');
const CONFIG = join(ROOT, 'config');
const H = 3600_000;
const D = 24 * H;

const LIMITS = { summaries: 150, athletes: 400, wikidataBatches: 25, wikidataBatchSize: 40 };

// ---------- E/S ----------

function readJson<T>(file: string, fallback: T): T {
  const p = join(DATA, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** JSON avec une entrée par ligne : diffs git lisibles, taille raisonnable. */
function writeJson(file: string, data: unknown) {
  mkdirSync(DATA, { recursive: true });
  let s: string;
  if (Array.isArray(data)) s = '[\n' + data.map((x) => JSON.stringify(x)).join(',\n') + '\n]\n';
  else if (data && typeof data === 'object' && file !== 'meta.json')
    s =
      '{\n' +
      Object.keys(data)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${JSON.stringify((data as any)[k])}`)
        .join(',\n') +
      '\n}\n';
  else s = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(join(DATA, file), s);
}

const competitions: CompetitionConfig[] = JSON.parse(readFileSync(join(CONFIG, 'competitions.json'), 'utf8')).competitions.filter((c: CompetitionConfig) => c.enabled !== false);
const teamNames: Record<string, { fr: string; aliases: string[] }> = JSON.parse(readFileSync(join(CONFIG, 'teams.json'), 'utf8')).teams;
const ytChannels: { handle: string; channelId: string; competitions: string[] }[] = JSON.parse(
  readFileSync(join(CONFIG, 'youtube.json'), 'utf8'),
).channels;

function seasonBounds(now: Date) {
  const y = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    start: new Date(Date.UTC(y, 7, 1)),
    end: new Date(Date.UTC(y + 1, 6, 31, 23, 59)),
    label: `${y}-${String(y + 1).slice(2)}`,
  };
}

// ---------- État ----------

const now = new Date();
const season = seasonBounds(now);
const errors: string[] = [];
const log = (...a: unknown[]) => console.log('[collect]', ...a);
const fail = (ctx: string, e: unknown) => {
  const msg = `${ctx}: ${e instanceof Error ? e.message : String(e)}`;
  console.warn('[collect] ⚠', msg);
  if (errors.length < 60) errors.push(msg);
};

const meta: Meta = readJson<Meta>('meta.json', {
  updatedAt: null,
  lastFullAt: null,
  season: { start: '', end: '', label: '' },
  leagues: {},
  youtubeChannels: {},
  errors: [],
  lastRun: null,
});
let matches: Match[] = readJson<Match[]>('matches.json', []);
const teams: Record<string, Team> = readJson('teams.json', {});
const players: Record<string, Player> = readJson('players.json', {});
const standings: Record<string, StandingGroup[]> = readJson('standings.json', {});

// Les matchs d'une saison précédente sont archivés hors du jeu de données courant.
matches = matches.filter((m) => new Date(m.date) >= season.start);
const byId = new Map(matches.map((m) => [m.id, m]));

function decideMode(arg: string | undefined): 'full' | 'light' | 'skip' {
  if (arg === 'full' || arg === 'light') return arg;
  if (!meta.lastFullAt || now.getTime() - new Date(meta.lastFullAt).getTime() > 6 * H) return 'full';
  if (meta.season.label !== season.label) return 'full';
  const t = now.getTime();
  for (const m of matches) {
    const k = new Date(m.date).getTime();
    if (m.status === 'live') return 'light';
    if (t > k - 20 * 60_000 && t < k + 3 * H) return 'light';
    if (m.status === 'final' && !m.summaryFetchedAt && t - k < 2 * D) return 'light';
    if (needsResumeCheck(m)) return 'light';
  }
  return 'skip';
}

function needsResumeCheck(m: Match): boolean {
  if (m.status !== 'final' || m.resume) return false;
  const end = new Date(m.date).getTime() + 2 * H;
  const t = now.getTime();
  if (t < end || t - end > 4 * D || m.resumeChecks >= 12) return false;
  return !m.resumeLastCheck || t - new Date(m.resumeLastCheck).getTime() > 90 * 60_000;
}

// ---------- Ligues ----------

async function resolveLeagues(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const missing: CompetitionConfig[] = [];
  for (const c of competitions) {
    if (c.espnId) ids.set(c.slug, c.espnId);
    else if (meta.leagues[c.slug]?.espnId) ids.set(c.slug, meta.leagues[c.slug].espnId!);
    else missing.push(c);
  }
  if (missing.length) {
    try {
      log('découverte des ligues ESPN pour', missing.map((c) => c.slug).join(', '));
      const catalog = await espn.fetchLeagueCatalog();
      writeJson('espn-leagues.json', catalog.sort((a, b) => a.name.localeCompare(b.name)));
      for (const c of missing) {
        const found = espn.pickLeague(c, catalog);
        if (found.length) {
          ids.set(c.slug, found[0].id);
          if (found.length > 1) errors.push(`${c.slug}: plusieurs ligues ESPN possibles (${found.map((f) => `${f.id} ${f.name}`).join(' | ')}), ${found[0].id} retenue`);
        } else errors.push(`${c.slug}: aucune ligue ESPN trouvée`);
      }
    } catch (e) {
      fail('catalogue ESPN', e);
    }
  }
  return ids;
}

// ---------- Matchs ----------

function teamName(espnName: string) {
  return teamNames[normName(espnName)]?.fr ?? espnName;
}

function upsertTeam(t: espn.RawTeam, comp: CompetitionConfig) {
  if (!t.id) return;
  const cur = teams[t.id];
  teams[t.id] = {
    id: t.id,
    espnName: t.name,
    name: teamName(t.name),
    short: t.short,
    logo: t.logo ?? cur?.logo ?? null,
    national: comp.national,
    competitions: [...new Set([...(cur?.competitions ?? []), comp.slug])].sort(),
  };
}

function applyEvents(c: CompetitionConfig, events: espn.RawEvent[]) {
  for (const e of events) {
    upsertTeam(e.home.team, c);
    upsertTeam(e.away.team, c);
    const prev = byId.get(e.id);
    const m: Match = {
      id: e.id,
      competition: c.slug,
      date: e.date,
      status: e.status,
      home: { teamId: e.home.team.id, score: e.home.score },
      away: { teamId: e.away.team.id, score: e.away.score },
      venue: e.venue ?? prev?.venue ?? null,
      round: e.round ?? prev?.round ?? null,
      lineups: prev?.lineups ?? null,
      scorers: prev?.scorers ?? [],
      summaryFetchedAt: prev?.summaryFetchedAt ?? null,
      resume: prev?.resume ?? null,
      resumeLastCheck: prev?.resumeLastCheck ?? null,
      resumeChecks: prev?.resumeChecks ?? 0,
    };
    // Score modifié après coup : on relit la feuille de match.
    if (prev && (prev.home.score !== m.home.score || prev.away.score !== m.away.score)) m.summaryFetchedAt = null;
    byId.set(m.id, m);
  }
}

const dayList = (from: Date, to: Date, filter?: (d: Date) => boolean) => {
  const out: string[] = [];
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += D) {
    const d = new Date(t);
    if (!filter || filter(d)) out.push(espn.ymd(d));
  }
  return out;
};

/**
 * ESPN ne renvoie qu'un jour par requête. Stratégie :
 * - jours passés de la saison : seulement ceux du calendrier ESPN, une seule fois (mémorisés dans meta.doneDays) ;
 * - de J-2 à J+60 : à chaque collecte complète ;
 * - au-delà : vendredis, samedis et dimanches, une fois par jour.
 * En mode léger : J-1 à J+1.
 */
async function collectEvents(leagues: Map<string, string>, mode: 'full' | 'light') {
  const today = new Date(now.getTime());
  const near = dayList(new Date(today.getTime() - (mode === 'full' ? 2 : 1) * D), new Date(today.getTime() + (mode === 'full' ? 60 : 1) * D));
  const farDue = mode === 'full' && (!meta.lastFarAt || now.getTime() - new Date(meta.lastFarAt).getTime() > 20 * H);
  const far = farDue ? dayList(new Date(today.getTime() + 61 * D), season.end, (d) => [0, 5, 6].includes(d.getUTCDay())) : [];
  const seasonStart = espn.ymd(season.start);
  const limit = espn.ymd(new Date(today.getTime() - 3 * D));
  meta.doneDays ??= {};

  for (const c of competitions) {
    const id = leagues.get(c.slug);
    if (!id) continue;
    const done = new Set(meta.doneDays[c.slug] ?? []);
    let days = [...near, ...far];
    let leagueName: string | null = meta.leagues[c.slug]?.espnName ?? null;
    let n = 0;
    try {
      if (mode === 'full') {
        const def = await espn.fetchDefault(id);
        leagueName = def.leagueName ?? leagueName;
        applyEvents(c, def.events);
        n += def.events.length;
        // Le calendrier ESPN est incomplet : on parcourt tous les jours passés de la saison, une seule fois.
        const past = dayList(season.start, new Date(today.getTime() - 3 * D));
        days = [...past.filter((d) => d >= seasonStart && !done.has(d)), ...days];
      }
    } catch (e) {
      fail(`calendrier ${c.slug} (${id})`, e);
    }
    days = [...new Set(days)];
    let errs = 0;
    await pool(days, 6, async (day) => {
      try {
        const r = await espn.fetchDay(id, day);
        leagueName = r.leagueName ?? leagueName;
        applyEvents(c, r.events);
        n += r.events.length;
        if (day <= limit && r.events.every((e) => e.status !== 'scheduled' && e.status !== 'live')) done.add(day);
      } catch (e) {
        if (errs++ < 3) fail(`matchs ${c.slug} ${day}`, e);
      }
    });
    meta.doneDays[c.slug] = [...done].sort();
    meta.leagues[c.slug] = { espnId: id, espnName: leagueName, matches: 0 };
    log(`${c.slug} (${id} ${leagueName ?? '?'}) : ${days.length} jours lus, ${n} matchs`);
  }
  if (farDue) meta.lastFarAt = now.toISOString();
}

// ---------- Feuilles de match et joueurs ----------

const SUMMARY_VERSION = 2; // 2 : temps de jeu, coups de pied et cartons par joueur

function needsSummary(m: Match) {
  if (m.status !== 'final' && m.status !== 'live') return false;
  if (!m.summaryFetchedAt || (m.summaryVersion ?? 1) < SUMMARY_VERSION) return true;
  // Une seconde lecture quelques heures après le match (stats consolidées).
  const fetched = new Date(m.summaryFetchedAt).getTime();
  const kickoff = new Date(m.date).getTime();
  return m.status === 'live' || (fetched < kickoff + 8 * H && now.getTime() > kickoff + 8 * H);
}

async function collectSummaries(leagues: Map<string, string>) {
  const todo = [...byId.values()]
    .filter(needsSummary)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LIMITS.summaries);
  log(`feuilles de match à lire : ${todo.length}`);
  await pool(todo, 4, async (m) => {
    const lid = leagues.get(m.competition);
    if (!lid) return;
    try {
      const s = await espn.fetchSummary(lid, m.id);
      applySummary(m, s);
      m.summaryFetchedAt = now.toISOString();
      m.summaryVersion = SUMMARY_VERSION;
    } catch (e) {
      fail(`feuille de match ${m.id}`, e);
    }
  });
}

function applySummary(m: Match, s: espn.RawSummary) {
  const lineups: NonNullable<Match['lineups']> = { home: [], away: [] };
  const scoringBy = new Map<string, { tries: number; conv: number; pen: number; drop: number }>();
  for (const sc of s.scoring) {
    const x = scoringBy.get(sc.playerId) ?? { tries: 0, conv: 0, pen: 0, drop: 0 };
    if (sc.kind === 'try') x.tries++;
    if (sc.kind === 'conversion') x.conv++;
    if (sc.kind === 'penalty') x.pen++;
    if (sc.kind === 'drop') x.drop++;
    scoringBy.set(sc.playerId, x);
  }
  const scorers: Match['scorers'] = [];
  const minutes = playingTime(s);
  const cards = new Map<string, { yellow: number; red: number }>();
  for (const ev of s.timeline ?? []) {
    if (ev.kind !== 'yellow' && ev.kind !== 'red') continue;
    const c = cards.get(ev.playerId) ?? { yellow: 0, red: 0 };
    c[ev.kind]++;
    cards.set(ev.playerId, c);
  }
  for (const r of s.rosters) {
    const side = r.teamId === m.home.teamId ? 'home' : r.teamId === m.away.teamId ? 'away' : r.homeAway;
    if (!side) continue;
    const teamId = side === 'home' ? m.home.teamId : m.away.teamId;
    for (const e of r.entries) {
      // Remplaçant resté sur le banc : sur la feuille de match, mais pas de match joué.
      const played = e.starter || !s.subbedOn || s.subbedOn.has(e.playerId);
      lineups[side].push({ playerId: e.playerId, jersey: e.jersey, starter: e.starter, position: e.position });
      const sc = scoringBy.get(e.playerId);
      const tries = e.stats.tries ?? sc?.tries ?? 0;
      const kicks =
        e.stats.conversions !== undefined || e.stats.penalties !== undefined || e.stats.drops !== undefined
          ? 2 * (e.stats.conversions ?? 0) + 3 * (e.stats.penalties ?? 0) + 3 * (e.stats.drops ?? 0)
          : sc
            ? 2 * sc.conv + 3 * sc.pen + 3 * sc.drop
            : 0;
      const points = e.stats.points ?? 5 * tries + kicks;
      const { tries: _t, points: _p, conversions: _c, penalties: _pe, drops: _d, ...advanced } = e.stats;

      const p: Player = players[e.playerId] ?? {
        id: e.playerId,
        name: e.name,
        position: null,
        headshot: null,
        birthDate: null,
        infoFetchedAt: null,
        wikidata: null,
        appearances: [],
      };
      p.name = e.name || p.name;
      p.position = e.position ?? p.position;
      p.headshot = e.headshot ?? p.headshot;
      p.appearances = p.appearances.filter((a) => a.matchId !== m.id);
      if (played)
        p.appearances.push({
          matchId: m.id,
          teamId,
          starter: e.starter,
          jersey: e.jersey,
          tries,
          points,
          stats: advanced,
          minutes: minutes ? (minutes.get(e.playerId) ?? 0) : null,
          conversions: e.stats.conversions ?? sc?.conv ?? 0,
          penalties: e.stats.penalties ?? sc?.pen ?? 0,
          drops: e.stats.drops ?? sc?.drop ?? 0,
          yellow: cards.get(e.playerId)?.yellow ?? 0,
          red: cards.get(e.playerId)?.red ?? 0,
        });
      p.appearances.sort((a, b) => (byId.get(a.matchId)?.date ?? '').localeCompare(byId.get(b.matchId)?.date ?? ''));
      players[e.playerId] = p;
      if (tries > 0 || points > 0) scorers.push({ playerId: e.playerId, teamId, tries, points });
    }
  }
  for (const side of ['home', 'away'] as const) {
    lineups[side].sort((a, b) => Number(b.starter) - Number(a.starter) || (a.jersey ?? 99) - (b.jersey ?? 99));
  }
  m.lineups = lineups.home.length || lineups.away.length ? lineups : null;
  m.scorers = scorers.sort((a, b) => b.points - a.points);
}

async function collectAthletes(leagues: Map<string, string>) {
  const todo = Object.values(players)
    .filter((p) => !p.infoFetchedAt)
    .slice(0, LIMITS.athletes);
  log(`fiches joueur ESPN à compléter : ${todo.length}`);
  await pool(todo, 6, async (p) => {
    const last = p.appearances.at(-1);
    const lid = last ? leagues.get(byId.get(last.matchId)?.competition ?? '') ?? null : null;
    try {
      const a = await espn.fetchAthlete(lid, p.id);
      if (a) {
        p.birthDate = a.birthDate ?? p.birthDate;
        p.position = a.position ?? p.position;
        p.headshot = p.headshot ?? a.headshot;
      }
      p.infoFetchedAt = now.toISOString();
    } catch (e) {
      fail(`joueur ${p.id}`, e);
    }
  });
}

async function collectParcours() {
  const stale = (p: Player) => !p.wikidata || now.getTime() - new Date(p.wikidata.checkedAt).getTime() > 30 * D;
  const todo = Object.values(players)
    .filter(stale)
    .slice(0, LIMITS.wikidataBatches * LIMITS.wikidataBatchSize);
  log(`parcours Wikidata à chercher : ${todo.length}`);
  for (let i = 0; i < todo.length; i += LIMITS.wikidataBatchSize) {
    const batch = todo.slice(i, i + LIMITS.wikidataBatchSize);
    try {
      const found = await lookupParcours([...new Set(batch.map((p) => p.name))]);
      for (const p of batch) {
        const known = [...new Set(p.appearances.map((a) => teams[a.teamId]).filter(Boolean).flatMap((t) => [t!.name, t!.espnName]))];
        const c = chooseCandidate(found.get(normName(p.name)) ?? [], known);
        p.wikidata = { qid: c?.qid ?? null, checkedAt: now.toISOString(), parcours: c?.parcours ?? [] };
      }
    } catch (e) {
      fail(`Wikidata (lot ${i / LIMITS.wikidataBatchSize + 1})`, e);
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ---------- Classements ----------

async function collectStandings(leagues: Map<string, string>) {
  for (const c of competitions) {
    const id = leagues.get(c.slug);
    if (!id) continue;
    try {
      const y = season.start.getUTCFullYear();
      const { groups, teams: ts } = await espn.fetchStandings(id, c.national ? [y + 1, y] : [y + 1, y]);
      for (const t of ts) if (!teams[t.id]) upsertTeam(t, c);
      if (groups.length) standings[c.slug] = groups;
    } catch (e) {
      // Les compétitions sans classement (tests) renvoient souvent une erreur : non bloquant.
      if (!c.slug.startsWith('tests')) fail(`classement ${c.slug}`, e);
    }
  }
}

// ---------- Résumés ----------

function aliasesFor(teamId: string): string[] {
  const t = teams[teamId];
  if (!t) return [];
  const conf = teamNames[normName(t.espnName)];
  return [...new Set([t.name, t.espnName, ...(conf?.aliases ?? [])].map(normName))];
}

async function collectResumes() {
  const todo = [...byId.values()].filter(needsResumeCheck);
  log(`résumés à chercher : ${todo.length}`);
  if (!todo.length) return;
  const feeds = new Map<string, FeedVideo[]>();
  const comps = new Set(todo.map((m) => m.competition));
  for (const ch of ytChannels.filter((c) => c.competitions.some((x) => comps.has(x)))) {
    try {
      let id = ch.channelId || meta.youtubeChannels[ch.handle];
      if (!id) {
        id = (await resolveChannelId(ch.handle)) ?? '';
        if (id) meta.youtubeChannels[ch.handle] = id;
        else throw new Error('identifiant de chaîne introuvable');
      }
      feeds.set(ch.handle, await fetchFeed(id));
    } catch (e) {
      fail(`YouTube ${ch.handle}`, e);
    }
  }
  for (const m of todo) {
    m.resumeLastCheck = now.toISOString();
    m.resumeChecks++;
    const kickoff = new Date(m.date).getTime();
    const ha = aliasesFor(m.home.teamId);
    const aa = aliasesFor(m.away.teamId);
    const candidates = ytChannels
      .filter((c) => c.competitions.includes(m.competition))
      .flatMap((c) => feeds.get(c.handle) ?? [])
      .filter((v) => new Date(v.publishedAt).getTime() > kickoff && new Date(v.publishedAt).getTime() < kickoff + 6 * D)
      .map((v) => ({ v, score: titleMatches(v.title, ha, aa, season.start.getUTCFullYear()) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.v.publishedAt.localeCompare(b.v.publishedAt));
    const best = candidates[0]?.v;
    if (!best) continue;
    try {
      m.resume = { ...best, embeddable: await isEmbeddable(best.videoId) };
      log(`résumé ${m.id} → ${best.title}`);
    } catch (e) {
      fail(`oEmbed ${best.videoId}`, e);
    }
  }
}

// ---------- Programme principal ----------

async function main() {
  if (process.argv[2] === 'probe') {
    const { probe } = await import('./probe.ts');
    await probe(DATA);
    return;
  }
  const mode = decideMode(process.argv[2]);
  log(`mode : ${mode}`);
  const out = process.env.GITHUB_OUTPUT;
  if (mode === 'skip') {
    if (out) appendFileSync(out, 'ran=false\n');
    return;
  }
  const t0 = Date.now();
  const leagues = await resolveLeagues();

  if (mode === 'full') {
    await collectEvents(leagues, 'full');
    await collectStandings(leagues);
  } else {
    await collectEvents(leagues, 'light');
  }
  await collectSummaries(leagues);
  if (mode === 'full') {
    await collectAthletes(leagues);
    await collectParcours();
  }
  await collectResumes();

  matches = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const slug of Object.keys(meta.leagues)) meta.leagues[slug].matches = matches.filter((m) => m.competition === slug).length;
  meta.updatedAt = now.toISOString();
  if (mode === 'full') meta.lastFullAt = now.toISOString();
  meta.season = { start: season.start.toISOString(), end: season.end.toISOString(), label: season.label };
  meta.errors = errors;
  meta.lastRun = { mode, at: now.toISOString(), durationSec: Math.round((Date.now() - t0) / 1000) };

  writeJson('matches.json', matches);
  writeJson('teams.json', teams);
  writeJson('players.json', players);
  writeJson('standings.json', standings);
  writeJson('meta.json', meta);
  log(`terminé : ${matches.length} matchs, ${Object.keys(teams).length} équipes, ${Object.keys(players).length} joueurs, ${errors.length} erreurs, ${meta.lastRun.durationSec}s`);
  if (out) appendFileSync(out, 'ran=true\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
