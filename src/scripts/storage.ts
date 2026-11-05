// Stockage local tolérant aux erreurs (navigation privée, stockage bloqué…).
export function get<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
export function set(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}
export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* stockage indisponible */
  }
}

export const KEYS = {
  favorites: 'ir:favs',
  apiKey: 'ir:gemini-key',
  model: 'ir:gemini-model',
  diff: (id: string) => `ir:diff:${id}`,
};

export const getFavorites = () => new Set(get<string[]>(KEYS.favorites, []));
export const setFavorites = (s: Set<string>) => set(KEYS.favorites, [...s]);
