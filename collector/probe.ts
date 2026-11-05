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
  const { fetchFeed, resolveChannelId } = await import('./youtube.ts');
  const { readFileSync } = await import('node:fs');
  const chans = JSON.parse(readFileSync(new URL('../config/youtube.json', import.meta.url), 'utf8')).channels as { handle: string }[];
  const extra = ['@EPCRugby', '@ChampionsCup', '@InvestecChampionsCup', '@SixNationsRugby', '@SixNations', '@WorldRugby', '@FranceRugby', '@FFRugby', '@CANALPLUSSPORT', '@canalplus', '@LNR', '@top14rugby', '@RugbyPass'];
  const feeds: Record<string, unknown> = {};
  for (const h of [...new Set([...chans.map((c) => c.handle), ...extra])]) {
    try {
      const id = await resolveChannelId(h);
      if (!id) { feeds[h] = 'introuvable'; continue; }
      const f = await fetchFeed(id);
      feeds[h] = { id, channel: f[0]?.channel, titles: f.map((v) => `${v.publishedAt.slice(0, 10)} ${v.title}`) };
    } catch (e) {
      feeds[h] = `ERR ${(e as Error).message}`;
    }
  }
  writeFileSync(join(dir, 'youtube.json'), JSON.stringify(feeds, null, 2));
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2));
}
