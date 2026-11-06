// Parcours des joueurs via Wikidata (clubs et sélections avec dates).
import { fetchJson } from './http.ts';
import type { ParcoursEntry } from '../src/lib/types.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const RUGBY_UNION_PLAYER = 'Q14089670';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

interface Candidate {
  qid: string;
  parcours: ParcoursEntry[];
}

/**
 * Cherche des joueurs de rugby à XV par nom exact (fr ou en).
 * Retourne, pour chaque nom normalisé, les candidats trouvés.
 */
export async function lookupParcours(names: string[]): Promise<Map<string, Candidate[]>> {
  const values = names.flatMap((n) => [`"${esc(n)}"@fr`, `"${esc(n)}"@en`]).join(' ');
  const query = `
SELECT ?item ?name ?teamLabel ?start ?end ?national WHERE {
  VALUES ?name { ${values} }
  ?item rdfs:label ?name ; wdt:P106 wd:${RUGBY_UNION_PLAYER} .
  OPTIONAL {
    ?item p:P54 ?st . ?st ps:P54 ?team .
    OPTIONAL { ?st pq:P580 ?start . }
    OPTIONAL { ?st pq:P582 ?end . }
    BIND(EXISTS { ?team wdt:P31/wdt:P279* wd:Q1194951 } AS ?national)
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;
  const j = await fetchJson(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  const byName = new Map<string, Map<string, Candidate>>();
  for (const b of j?.results?.bindings ?? []) {
    const name = normName(b.name.value);
    const qid = String(b.item.value).split('/').pop()!;
    const m = byName.get(name) ?? new Map<string, Candidate>();
    const c = m.get(qid) ?? { qid, parcours: [] };
    if (b.teamLabel?.value && !/^Q\d+$/.test(b.teamLabel.value)) {
      const year = (v?: { value: string }) => (v ? parseInt(v.value.slice(0, 4), 10) || null : null);
      const entry: ParcoursEntry = {
        team: b.teamLabel.value,
        start: year(b.start),
        end: year(b.end),
        national: b.national?.value === 'true',
      };
      if (!c.parcours.some((p) => p.team === entry.team && p.start === entry.start)) c.parcours.push(entry);
    }
    m.set(qid, c);
    byName.set(name, m);
  }
  const out = new Map<string, Candidate[]>();
  for (const [k, m] of byName) {
    out.set(
      k,
      [...m.values()].map((c) => ({
        ...c,
        parcours: c.parcours.sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999)),
      })),
    );
  }
  return out;
}

/** Choisit le bon homonyme : celui dont un club ressemble à un club connu du joueur. */
export function chooseCandidate(cands: Candidate[], knownTeams: string[]): Candidate | null {
  if (cands.length === 0) return null;
  if (cands.length === 1) return cands[0];
  const known = knownTeams.map(normName);
  const score = (c: Candidate) =>
    c.parcours.filter((p) => {
      const t = normName(p.team);
      return known.some((k) => k && (t.includes(k) || k.includes(t) || k.split(' ').some((w) => w.length > 3 && t.includes(w))));
    }).length;
  const ranked = [...cands].sort((a, b) => score(b) - score(a) || (b.parcours.at(-1)?.start ?? 0) - (a.parcours.at(-1)?.start ?? 0));
  return score(ranked[0]) > 0 ? ranked[0] : null;
}

/** Logo (Wikimedia Commons) d'un club de rugby à XV, cherché par libellé exact. */
export async function lookupClubLogo(names: string[]): Promise<string | null> {
  const values = [...new Set(names)].flatMap((n) => [`"${esc(n)}"@fr`, `"${esc(n)}"@en`]).join(' ');
  const query = `SELECT ?item ?logo WHERE { VALUES ?name { ${values} } ?item rdfs:label ?name ; wdt:P154 ?logo . ?item wdt:P641 wd:Q5849 . } LIMIT 5`;
  const j = await fetchJson(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/sparql-results+json' } });
  const v: string | undefined = j?.results?.bindings?.[0]?.logo?.value;
  return v ? `${v.replace(/^http:/, 'https:')}?width=128` : null;
}
