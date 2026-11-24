import { isFuelId } from '../fuels';
import type { FuelId, SortBy } from '../types';

export const PREFS_KEY = 'tgp:prefs:v1';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadPrefs(storage: StorageLike | null): { fuel?: FuelId; sortBy?: SortBy } {
  try {
    if (!storage) return {};
    const raw = storage.getItem(PREFS_KEY);
    if (raw === null) return {};
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const o = obj as Record<string, unknown>;
    const out: { fuel?: FuelId; sortBy?: SortBy } = {};
    if (isFuelId(o.fuel)) out.fuel = o.fuel;
    if (o.sortBy === 'distance' || o.sortBy === 'price') out.sortBy = o.sortBy;
    return out;
  } catch {
    return {};
  }
}

export function savePrefs(
  storage: StorageLike | null,
  prefs: { fuel: FuelId; sortBy: SortBy },
): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify({ fuel: prefs.fuel, sortBy: prefs.sortBy }));
  } catch {
    /* ignore */
  }
}
