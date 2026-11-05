// Mode diagnostic : enregistre des réponses brutes d'ESPN dans data/_probe/ pour analyse.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchText } from './http.ts';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/rugby';
const V2 = 'https://site.api.espn.com/apis/v2/sports/rugby';
const CORE = 'https://sports.core.api.espn.com/v2/sports/rugby';

export async function probe(dataDir: string) {
  const dir = join(dataDir, '_probe');
  mkdirSync(dir, { recursive: true });
  const index: Record<string, string> = {};
  void fetchText;
  const save = async (name: string, url: string, max = 60000) => {
    try {
      const t = await fetchText(url, {}, 0);
      writeFileSync(join(dir, `${name}.json`), t.slice(0, max));
      index[name] = `OK ${t.length}o ${url}`;
      return t;
    } catch (e) {
      index[name] = `ERR ${(e as Error).message}`;
      return null;
    }
  };
  const sum = await save('summary', `${SITE}/270559/summary?event=604414`, 400000);
  const aid = sum?.match(/"athlete":\{[^}]*?"id":"(\d+)"/)?.[1] ?? sum?.match(/athletes\/(\d+)/)?.[1];
  index.athleteId = aid ?? 'none';
  if (aid) {
    await save('athlete-core', `${CORE}/leagues/270559/athletes/${aid}`, 8000);
    await save('athlete-site', `https://site.web.api.espn.com/apis/common/v3/sports/rugby/athletes/${aid}`, 8000);
  }
  await save('core-league-24400', `${CORE}/leagues/24400`, 1500);
  await save('core-league-10659', `${CORE}/leagues/10659`, 1500);
  await save('st-6n-2027', `${V2}/180659/standings?season=2027`, 1500);
  await save('st-6n-2026', `${V2}/180659/standings?season=2026`, 1500);
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2));
}
