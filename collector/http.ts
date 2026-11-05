const UA = 'InfoRugbyBot/1.0 (+https://github.com/Pentchaff/info-rugby)';

export class HttpError extends Error {
  constructor(public status: number, public url: string) {
    super(`HTTP ${status} ${url}`);
  }
}

export async function fetchText(url: string, init: RequestInit = {}, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404 || res.status === 401 || res.status === 403) throw new HttpError(res.status, url);
      if (!res.ok) throw new HttpError(res.status, url);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw lastErr;
}

export async function fetchJson<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  return JSON.parse(await fetchText(url, init)) as T;
}

/** Exécute fn sur chaque élément avec une concurrence limitée. */
export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
