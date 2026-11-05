// Recherche des Diffuseurs via Gemini + Google Search, depuis l'appareil, avec la Clé personnelle (ADR 0003).
import { get, set, KEYS } from './storage';

export const DEFAULT_MODEL = 'gemini-flash-latest';
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const TTL = 24 * 3600_000;

export interface UpcomingMatch {
  id: string;
  label: string; // « Top 14 : Stade Toulousain - Racing 92, samedi 8 novembre à 21h05 »
  correction: boolean;
}

export interface DiffCache {
  at: number;
  list: string[];
  sources: { uri: string; title: string }[];
  suggestions: string | null;
}

const KNOWN = [
  'canal+', 'canal plus', 'mycanal', 'france 2', 'france 3', 'france 4', 'france 5', 'france tv', 'francetv', 'france.tv', 'france televisions',
  'tf1', 'tmc', 'tfx', "l'equipe", 'lequipe', 'bein', 'rugby+', 'rugby plus', 'rmc', 'dazn', 'eurosport', 'max', 'prime video', 'amazon',
  'sport en france', 'via', 'canal+ sport', 'infosport', 'rugbypass', 'w9', 'm6', '6play', 'tf1+',
];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isKnown = (s: string) => KNOWN.some((k) => norm(s).includes(k));

export const getKey = () => get<string>(KEYS.apiKey, '');
export const getModel = () => get<string>(KEYS.model, '') || DEFAULT_MODEL;

export function cached(id: string): DiffCache | null {
  return get<DiffCache | null>(KEYS.diff(id), null);
}
const fresh = (c: DiffCache | null) => !!c && Date.now() - c.at < TTL;

async function generate(prompt: string, grounding: boolean) {
  const res = await fetch(`${API}/${encodeURIComponent(getModel())}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(grounding ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0 },
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? `HTTP ${res.status}`);
  const cand = j?.candidates?.[0];
  const text: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c: any) => c.web)
    .filter((w: any) => w?.uri)
    .map((w: any) => ({ uri: w.uri as string, title: (w.title as string) ?? w.uri }));
  const suggestions: string | null = cand?.groundingMetadata?.searchEntryPoint?.renderedContent ?? null;
  return { text, sources, suggestions };
}

export async function testKey(): Promise<string> {
  const { text } = await generate('Réponds uniquement par le mot OK.', false);
  return text.trim();
}

async function lookupBatch(batch: UpcomingMatch[]) {
  const prompt = `Tu es un assistant qui vérifie les programmes TV en France.
Pour chacun des matchs de rugby suivants (heure de Paris), cherche sur le web la ou les chaînes de télévision ou plateformes qui le diffusent EN DIRECT EN FRANCE.
${batch.map((m) => `- id ${m.id} : ${m.label}`).join('\n')}

Réponds UNIQUEMENT par un tableau JSON, sans texte autour, de la forme :
[{"id": "<id>", "diffuseurs": ["<chaîne>", "..."]}]
Mets une liste vide si tu n'es pas sûr. N'invente rien.`;
  const { text, sources, suggestions } = await generate(prompt, true);
  const arr = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as { id: string; diffuseurs: string[] }[];
  for (const m of batch) {
    const found = arr.find((x) => String(x.id) === m.id);
    const list = [...new Set((found?.diffuseurs ?? []).map((s) => String(s).trim()).filter((s) => s && isKnown(s)))];
    set(KEYS.diff(m.id), { at: Date.now(), list, sources: sources.slice(0, 6), suggestions } satisfies DiffCache);
  }
}

/** Interroge Gemini pour les matchs sans réponse récente. Retourne le nombre de matchs traités. */
export async function refreshBroadcasters(upcoming: UpcomingMatch[], onProgress?: (msg: string) => void): Promise<number> {
  if (!getKey()) return 0;
  const todo = upcoming.filter((m) => !m.correction && !fresh(cached(m.id)));
  for (let i = 0; i < todo.length; i += 10) {
    onProgress?.(`Recherche des diffuseurs… (${Math.min(i + 10, todo.length)}/${todo.length})`);
    await lookupBatch(todo.slice(i, i + 10));
  }
  return todo.length;
}

/** Remplace la Règle de diffusion par la réponse Gemini en cache, partout dans la page. */
export function applyCachedBroadcasters(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-diff-id]').forEach((el) => {
    if (el.dataset.source === 'correction') return;
    const c = cached(el.dataset.diffId!);
    if (!c || !c.list.length) return;
    const name = el.querySelector('.diff-name');
    if (name) name.textContent = c.list.join(' / ');
    el.dataset.source = 'gemini';
    el.title = 'Trouvé par une recherche Google (Gemini)';
  });
}
