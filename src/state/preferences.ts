import { isFuelId } from '../fuels';
import type { FuelId, ListScope, SortBy } from '../types';

export const PREFS_KEY = 'tgp:prefs:v1';
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadPrefs(storage: StorageLike | null): { fuel?: FuelId; sortBy?: SortBy; scope?: ListScope } {
  try {
    if (!storage) return {};
    const raw = storage.getItem(PREFS_KEY);
    if (raw === null) return {};
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const o = obj as Record<string, unknown>;
    const out: { fuel?: FuelId; sortBy?: SortBy; scope?: ListScope } = {};
    if (isFuelId(o.fuel)) out.fuel = o.fuel;
    if (o.sortBy === 'distance' || o.sortBy === 'price') out.sortBy = o.sortBy;
    if (o.scope === 'all' || o.scope === 'favorites') out.scope = o.scope;
    return out;
  } catch {
    return {};
  }
}

export function savePrefs(
  storage: StorageLike | null,
  prefs: { fuel: FuelId; sortBy: SortBy; scope?: ListScope },
): void {
  try {
    const out: { fuel: FuelId; sortBy: SortBy; scope?: ListScope } = { fuel: prefs.fuel, sortBy: prefs.sortBy };
    if (prefs.scope !== undefined) out.scope = prefs.scope;
    storage?.setItem(PREFS_KEY, JSON.stringify(out));
  } catch {
    /* ignore */
  }
}
