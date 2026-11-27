import type { StorageLike } from './preferences';

export const FAVORITES_KEY = 'tgp:favorites:v1';

export function loadFavorites(storage: StorageLike | null): string[] {
  try {
    if (!storage) return [];
    const raw = storage.getItem(FAVORITES_KEY);
    if (raw === null) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const v of arr) {
      if (typeof v === 'string' && v !== '' && !out.includes(v)) out.push(v);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveFavorites(storage: StorageLike | null, ids: readonly string[]): void {
  try {
    storage?.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
