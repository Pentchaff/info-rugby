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
  const sb = await save('sb-top14', `${SITE}/270559/scoreboard`);
  await save('sb-top14-month', `${SITE}/270559/scoreboard?dates=20261101-20261130`, 3000);
  await save('sb-top14-week', `${SITE}/270559/scoreboard?dates=20261025-20261108`, 3000);
  await save('sb-top14-day', `${SITE}/270559/scoreboard?dates=20261101`, 3000);
  await save('sb-top14-season', `${SITE}/270559/scoreboard?season=2027`, 3000);
  await save('sb-8005', `${SITE}/8005/scoreboard`, 3000);
  await save('sb-10659', `${SITE}/10659/scoreboard`, 5000);
  await save('sb-24400', `${SITE}/24400/scoreboard`, 5000);
  await save('sb-289234', `${SITE}/289234/scoreboard`, 3000);
  await save('st-top14', `${V2}/270559/standings`, 4000);
  await save('st-top14-2026', `${V2}/270559/standings?season=2026`, 4000);
  await save('st-top14-2027', `${V2}/270559/standings?season=2027`, 4000);
  await save('core-league-8005', `${CORE}/leagues/8005`, 8000);
  await save('core-league-270559', `${CORE}/leagues/270559`, 8000);
  await save('core-leagues-p2', `${CORE}/leagues?limit=1000&page=2`, 8000);
  for (const id of [270557, 270555, 270561, 270563, 270565, 289237, 289271]) {
    await save(`sb-${id}`, `${SITE}/${id}/scoreboard`, 1500);
  }
  // Une feuille de match d'un match terminé
  const done = sb ? JSON.parse(sb).events?.find((e: any) => e?.status?.type?.completed) : null;
  const evId = done?.id;
  if (evId) {
    await save('summary', `${SITE}/270559/summary?event=${evId}`, 400000);
    const s = await fetchText(`${SITE}/270559/summary?event=${evId}`).catch(() => '');
    const aid = s.match(/"athlete":\{"id":"(\d+)"/)?.[1];
    if (aid) {
      await save('athlete-core', `${CORE}/leagues/270559/athletes/${aid}`, 8000);
      await save('athlete-core2', `${CORE}/athletes/${aid}`, 8000);
    }
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2));
}
