// Adaptateur ESPN (API publique non officielle, sans clé) — voir ADR 0002.
// Toutes les fonctions sont défensives : la structure des réponses n'est pas documentée.
import { fetchJson, pool } from './http.ts';
import type { CompetitionConfig, LineupEntry, MatchStatus, StandingGroup, StandingRow } from '../src/lib/types.ts';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/rugby';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/rugby';
const CORE = 'https://sports.core.api.espn.com/v2/sports/rugby';

export interface RawTeam {
  id: string;
  name: string;
  short: string;
  logo: string | null;
}

export interface RawEvent {
  id: string;
  date: string;
  status: MatchStatus;
  home: { team: RawTeam; score: number | null };
  away: { team: RawTeam; score: number | null };
  venue: string | null;
  round: string | null;
}

export interface RawRosterEntry {
  playerId: string;
  name: string;
  position: string | null;
  headshot: string | null;
  jersey: number | null;
  starter: boolean;
  stats: Record<string, number>;
}

export interface RawSummary {
  rosters: { teamId: string; homeAway: 'home' | 'away' | null; entries: RawRosterEntry[] }[];
  scoring: { playerId: string; teamId: string; kind: 'try' | 'conversion' | 'penalty' | 'drop' }[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function parseTeam(t: any): RawTeam {
  return {
    id: String(t?.id ?? ''),
    name: t?.displayName ?? t?.name ?? t?.shortDisplayName ?? '?',
    short: t?.abbreviation ?? t?.shortDisplayName ?? t?.displayName ?? '?',
    logo: t?.logo ?? t?.logos?.[0]?.href ?? null,
  };
}

function parseStatus(s: any): MatchStatus {
  const type = s?.type ?? {};
  const name = String(type.name ?? '').toUpperCase();
  if (name.includes('POSTPONED') || name.includes('DELAYED') || name.includes('SUSPENDED')) return 'postponed';
  if (name.includes('CANCEL') || name.includes('ABANDON')) return 'canceled';
  if (type.completed || type.state === 'post') return 'final';
  if (type.state === 'in') return 'live';
  return 'scheduled';
}

export function parseEvent(ev: any): RawEvent | null {
  const comp = ev?.competitions?.[0];
  const cs: any[] = comp?.competitors ?? [];
  if (cs.length < 2) return null;
  const home = cs.find((c) => c.homeAway === 'home') ?? cs[0];
  const away = cs.find((c) => c.homeAway === 'away') ?? cs[1];
  const status = parseStatus(comp?.status ?? ev?.status);
  const scoreOf = (c: any) => (status === 'scheduled' || status === 'postponed' || status === 'canceled' ? null : num(c?.score?.value ?? c?.score));
  const venue = comp?.venue?.fullName
    ? [comp.venue.fullName, comp.venue.address?.city].filter(Boolean).join(', ')
    : null;
  const round = ev?.week?.number ? `Journée ${ev.week.number}` : (comp?.notes?.[0]?.headline ?? null);
  return {
    id: String(ev.id),
    date: comp?.date ?? ev.date,
    status,
    home: { team: parseTeam(home.team), score: scoreOf(home) },
    away: { team: parseTeam(away.team), score: scoreOf(away) },
    venue,
    round,
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Matchs d'une ligue entre deux dates. Essaie une plage unique, puis des tranches mensuelles. */
export async function fetchEvents(leagueId: string, from: Date, to: Date): Promise<{ events: RawEvent[]; leagueName: string | null }> {
  const get = async (a: Date, b: Date) => {
    const j = await fetchJson(`${SITE}/${leagueId}/scoreboard?dates=${ymd(a)}-${ymd(b)}&limit=1000`);
    return { events: (j?.events ?? []) as any[], name: (j?.leagues?.[0]?.name as string) ?? null };
  };
  let { events, name } = await get(from, to);
  const span = (to.getTime() - from.getTime()) / 86400000;
  if (events.length === 0 && span > 40) {
    const chunks: [Date, Date][] = [];
    for (let a = new Date(from); a < to; a = new Date(a.getTime() + 30 * 86400000)) {
      chunks.push([a, new Date(Math.min(to.getTime(), a.getTime() + 30 * 86400000 - 86400000))]);
    }
    const results = await pool(chunks, 3, ([a, b]) => get(a, b).catch(() => ({ events: [], name: null })));
    events = results.flatMap((r) => r.events);
    name = name ?? results.find((r) => r.name)?.name ?? null;
  }
  const seen = new Set<string>();
  const out: RawEvent[] = [];
  for (const e of events) {
    const p = parseEvent(e);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return { events: out, leagueName: name };
}

/** Liste des ligues ESPN (id + nom), pour la découverte automatique. */
export async function fetchLeagueCatalog(): Promise<{ id: string; name: string }[]> {
  const j = await fetchJson(`${CORE}/leagues?limit=1000`);
  const refs: string[] = (j?.items ?? []).map((i: any) => String(i.$ref).replace(/^http:/, 'https:'));
  const leagues = await pool(refs, 8, async (r) => {
    try {
      const l = await fetchJson(r);
      return { id: String(l.id), name: String(l.name ?? l.displayName ?? '') };
    } catch {
      return null;
    }
  });
  return leagues.filter((l): l is { id: string; name: string } => !!l);
}

export function pickLeague(cfg: CompetitionConfig, catalog: { id: string; name: string }[]) {
  const norm = (s: string) => s.toLowerCase();
  return catalog.filter((l) => {
    const n = norm(l.name);
    return cfg.match.some((m) => n.includes(m)) && !cfg.exclude.some((x) => n.includes(x));
  });
}

// ---------- Feuilles de match ----------

const STAT_KEYS: Record<string, RegExp> = {
  tries: /^(tries|try|triesscored|totaltries)$/,
  points: /^(points|totalpoints|pointsscored)$/,
  conversions: /^(conversion(goal)?s?|conversionsmade)$/,
  penalties: /^(penalt(y|ies)goals?|penaltygoalsmade|penaltiesmade)$/,
  drops: /^(drop(goal)?s?(made)?)$/,
  tackles: /^(tackles(made)?|totaltackles)$/,
  missedTackles: /^(missedtackles|tacklesmissed)$/,
  metres: /^(metres|meters|metresrun|metersrun|runningmetres|metresgained|metersgained|carrymetres)$/,
  carries: /^(carries|runs|ballcarries)$/,
  cleanBreaks: /^(cleanbreaks?|linebreaks?)$/,
  defendersBeaten: /^(defendersbeaten)$/,
  offloads: /^(offloads?)$/,
  turnoversWon: /^(turnoverswon|turnoverwon|jackals?)$/,
};

export function normalizeStats(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.toLowerCase().replace(/[^a-z]/g, '');
    for (const [name, re] of Object.entries(STAT_KEYS)) {
      if (re.test(key) && out[name] === undefined) out[name] = v;
    }
  }
  return out;
}

function statsFromArray(arr: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of arr ?? []) {
    const v = num(s?.value ?? s?.displayValue);
    if (v === null) continue;
    for (const k of [s?.name, s?.abbreviation, s?.shortDisplayName, s?.displayName]) if (k) out[String(k)] = v;
  }
  return out;
}

export async function fetchSummary(leagueId: string, eventId: string): Promise<RawSummary> {
  const j = await fetchJson(`${SITE}/${leagueId}/summary?event=${eventId}`);
  const rosters: RawSummary['rosters'] = [];

  // Format 1 : rosters[].roster[] (type football)
  for (const r of j?.rosters ?? []) {
    const teamId = String(r?.team?.id ?? '');
    const entries: RawRosterEntry[] = [];
    for (const p of r?.roster ?? []) {
      const a = p?.athlete ?? {};
      if (!a.id) continue;
      entries.push({
        playerId: String(a.id),
        name: a.displayName ?? a.fullName ?? '?',
        position: p?.position?.name ?? a?.position?.name ?? p?.position?.displayName ?? null,
        headshot: a?.headshot?.href ?? null,
        jersey: num(p?.jersey ?? a?.jersey),
        starter: !!p?.starter,
        stats: normalizeStats(statsFromArray(p?.stats)),
      });
    }
    if (entries.length) rosters.push({ teamId, homeAway: r?.homeAway ?? null, entries });
  }

  // Format 2 : boxscore.players[].statistics[].athletes[] (type US)
  if (rosters.length === 0) {
    for (const t of j?.boxscore?.players ?? []) {
      const teamId = String(t?.team?.id ?? '');
      const byId = new Map<string, RawRosterEntry>();
      for (const group of t?.statistics ?? []) {
        const names: string[] = group?.names ?? group?.keys ?? group?.labels ?? [];
        for (const ath of group?.athletes ?? []) {
          const a = ath?.athlete ?? {};
          if (!a.id) continue;
          const e = byId.get(String(a.id)) ?? {
            playerId: String(a.id),
            name: a.displayName ?? '?',
            position: a?.position?.name ?? null,
            headshot: a?.headshot?.href ?? null,
            jersey: num(a?.jersey),
            starter: !!ath?.starter,
            stats: {},
          };
          const raw: Record<string, number> = {};
          (ath?.stats ?? []).forEach((v: unknown, i: number) => {
            const n = num(v);
            if (n !== null && names[i]) raw[names[i]] = n;
          });
          Object.assign(e.stats, normalizeStats(raw));
          byId.set(e.playerId, e);
        }
      }
      if (byId.size) rosters.push({ teamId, homeAway: null, entries: [...byId.values()] });
    }
  }

  // Actions de score (si disponibles)
  const scoring: RawSummary['scoring'] = [];
  const plays: any[] = [...(j?.scoringPlays ?? []), ...(j?.keyEvents ?? []), ...(j?.plays ?? [])];
  const seen = new Set<string>();
  for (const p of plays) {
    const text = String(p?.type?.text ?? p?.type?.name ?? '').toLowerCase();
    let kind: RawSummary['scoring'][number]['kind'] | null = null;
    if (/penalty try/.test(text)) kind = null;
    else if (/\btry\b|essai/.test(text)) kind = 'try';
    else if (/conversion|transformation/.test(text)) kind = 'conversion';
    else if (/penalty goal|penalty kick|pénalité/.test(text)) kind = 'penalty';
    else if (/drop/.test(text)) kind = 'drop';
    const ath = p?.participants?.[0]?.athlete ?? p?.athletesInvolved?.[0];
    if (!kind || !ath?.id) continue;
    const key = String(p.id ?? `${text}-${ath.id}-${p?.clock?.displayValue}`);
    if (seen.has(key)) continue;
    seen.add(key);
    scoring.push({ playerId: String(ath.id), teamId: String(p?.team?.id ?? ''), kind });
  }
  return { rosters, scoring };
}

// ---------- Classements ----------

function pick(stats: Record<string, number>, ...names: string[]): number | null {
  for (const n of names) {
    const k = Object.keys(stats).find((s) => s.toLowerCase() === n.toLowerCase());
    if (k !== undefined) return stats[k];
  }
  return null;
}

export async function fetchStandings(leagueId: string): Promise<{ groups: StandingGroup[]; teams: RawTeam[] }> {
  const j = await fetchJson(`${STANDINGS}/${leagueId}/standings`);
  const blocks: { name: string | null; entries: any[] }[] = [];
  if (j?.children?.length) {
    for (const c of j.children) blocks.push({ name: c?.name ?? c?.abbreviation ?? null, entries: c?.standings?.entries ?? [] });
  } else if (j?.standings?.entries) {
    blocks.push({ name: null, entries: j.standings.entries });
  }
  const teams: RawTeam[] = [];
  const groups: StandingGroup[] = blocks.map((b) => {
    const rows: StandingRow[] = b.entries.map((e: any, i: number) => {
      const st = statsFromArray(e?.stats);
      const team = parseTeam(e?.team);
      teams.push(team);
      const won = pick(st, 'gamesWon', 'wins', 'W');
      const lost = pick(st, 'gamesLost', 'losses', 'L');
      return {
        teamId: team.id,
        rank: pick(st, 'rank', 'position') ?? i + 1,
        played: pick(st, 'gamesPlayed', 'GP', 'P', 'played'),
        won,
        drawn: pick(st, 'gamesDrawn', 'ties', 'draws', 'D', 'T'),
        lost,
        diff: pick(st, 'pointDifferential', 'pointsDifference', 'differential', 'PD', 'DIFF'),
        bonus: pick(st, 'bonusPoints', 'bonusPointsTotal', 'BP'),
        points: pick(st, 'points', 'PTS', 'leaguePoints'),
      };
    });
    rows.sort((a, b) => a.rank - b.rank);
    return { name: b.name, rows };
  });
  return { groups: groups.filter((g) => g.rows.length), teams };
}

// ---------- Infos joueur ----------

export async function fetchAthlete(leagueId: string | null, athleteId: string) {
  const urls = [
    ...(leagueId ? [`${CORE}/leagues/${leagueId}/athletes/${athleteId}`] : []),
    `${CORE}/athletes/${athleteId}`,
  ];
  for (const u of urls) {
    try {
      const a = await fetchJson(u);
      return {
        name: (a?.displayName ?? a?.fullName ?? null) as string | null,
        birthDate: (a?.dateOfBirth ?? null) as string | null,
        position: (a?.position?.name ?? a?.position?.displayName ?? null) as string | null,
        headshot: (a?.headshot?.href ?? null) as string | null,
      };
    } catch {
      /* essai suivant */
    }
  }
  return null;
}
