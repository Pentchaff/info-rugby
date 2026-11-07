// Modèle de données partagé entre le collecteur (collector/) et le site (src/).
// Vocabulaire : voir GLOSSARY.md.

export type MatchStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'canceled';

export interface MatchSide {
  teamId: string;
  score: number | null;
}

export interface LineupEntry {
  playerId: string;
  jersey: number | null;
  starter: boolean;
  position: string | null;
}

export interface Scorer {
  playerId: string;
  teamId: string;
  tries: number;
  points: number;
}

export interface Resume {
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string;
  embeddable: boolean;
}

export interface Match {
  id: string;
  competition: string; // slug
  date: string; // ISO UTC
  status: MatchStatus;
  home: MatchSide;
  away: MatchSide;
  venue: string | null;
  round: string | null;
  lineups: { home: LineupEntry[]; away: LineupEntry[] } | null;
  scorers: Scorer[];
  summaryFetchedAt: string | null;
  summaryVersion?: number;
  resume: Resume | null;
  resumeLastCheck: string | null;
  resumeChecks: number;
}

export interface Team {
  id: string;
  name: string; // nom affiché (français si connu)
  espnName: string;
  short: string;
  logo: string | null;
  logoCheckedAt?: string; // logo vérifié (ou remplacé) par le collecteur
  national: boolean;
  competitions: string[];
}

export interface PlayerAppearance {
  matchId: string;
  teamId: string;
  starter: boolean;
  jersey: number | null;
  tries: number;
  points: number;
  stats: Record<string, number>; // stats avancées si disponibles
  // Depuis la version 2 des feuilles de match :
  minutes?: number | null; // temps de jeu reconstitué à partir des remplacements
  conversions?: number;
  penalties?: number;
  drops?: number;
  yellow?: number;
  red?: number;
}

export interface ParcoursEntry {
  team: string;
  start: number | null; // année
  end: number | null; // année (null = en cours)
  national: boolean;
}

export interface Player {
  id: string;
  name: string;
  position: string | null;
  headshot: string | null;
  birthDate: string | null;
  infoFetchedAt: string | null;
  wikidata: { qid: string | null; checkedAt: string; parcours: ParcoursEntry[] } | null;
  appearances: PlayerAppearance[];
}

export interface StandingRow {
  teamId: string;
  rank: number;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  diff: number | null;
  bonus: number | null;
  points: number | null;
}

export interface StandingGroup {
  name: string | null;
  rows: StandingRow[];
}

export interface Meta {
  updatedAt: string | null;
  lastFullAt: string | null;
  season: { start: string; end: string; label: string };
  leagues: Record<string, { espnId: string | null; espnName: string | null; matches: number }>;
  youtubeChannels: Record<string, string>; // handle -> channelId
  errors: string[];
  lastRun: { mode: string; at: string; durationSec: number } | null;
  doneDays?: Record<string, string[]>; // jours passés déjà lus, par compétition
  lastFarAt?: string;
}

export interface CompetitionConfig {
  slug: string;
  name: string;
  espnId: string;
  match: string[];
  exclude: string[];
  national: boolean;
  diffusion: string;
  enabled?: boolean;
  /** Classements séparés (ex. hémisphères Nord et Sud), équipes désignées par leur nom ESPN. */
  groups?: { name: string; teams: string[] }[];
}
