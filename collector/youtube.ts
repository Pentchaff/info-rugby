// Résumés : flux RSS des Chaînes officielles + vérification d'intégration via oEmbed (sans clé).
import { fetchText, HttpError } from './http.ts';

export interface FeedVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  channel: string;
}

export async function resolveChannelId(handle: string): Promise<string | null> {
  if (/^UC[\w-]{22}$/.test(handle)) return handle;
  const h = handle.startsWith('@') ? handle : `@${handle}`;
  const html = await fetchText(`https://www.youtube.com/${h}`, { headers: { Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
  const m =
    html.match(/"externalId":"(UC[\w-]{22})"/) ??
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ??
    html.match(/"channelId":"(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function fetchFeed(channelId: string): Promise<FeedVideo[]> {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const channel = decode(xml.match(/<author>\s*<name>([^<]+)<\/name>/)?.[1] ?? '');
  const out: FeedVideo[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    if (videoId && title && published) out.push({ videoId, title: decode(title), publishedAt: published, channel });
  }
  return out;
}

/** true si la vidéo peut être intégrée (oEmbed répond 200), false si l'intégration est désactivée. */
export async function isEmbeddable(videoId: string): Promise<boolean> {
  try {
    await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, {}, 0);
    return true;
  } catch (e) {
    if (e instanceof HttpError) return false;
    throw e;
  }
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const HIGHLIGHT_WORDS = /(resume|highlights|temps forts|extended|all tries|tous les essais|best of|le match|match report|full match|replay)/;

/** Le titre mentionne-t-il les deux équipes (via leurs alias) ? */
export function titleMatches(title: string, homeAliases: string[], awayAliases: string[]): number {
  const t = ` ${norm(title)} `;
  const has = (aliases: string[]) => aliases.some((a) => a && t.includes(` ${norm(a)} `));
  if (!has(homeAliases) || !has(awayAliases)) return 0;
  return HIGHLIGHT_WORDS.test(t) ? 2 : 1;
}
