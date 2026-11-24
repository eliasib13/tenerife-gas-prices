import { DEFAULT_FUEL } from '../fuels';
import type { AppState, FuelId, SortBy } from '../types';

export interface Store<S> {
  getState(): S;
  setState(patch: Partial<S> | ((s: S) => Partial<S>)): void;
  subscribe(fn: (s: S, prev: S) => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<(s: S, prev: S) => void>();
  return {
    getState: () => state,
    setState(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      const keys = Object.keys(p) as (keyof S)[];
      if (keys.every((k) => Object.is(state[k], p[k]))) return;
      const prev = state;
      state = { ...prev, ...p };
      for (const fn of [...listeners]) fn(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export function initialState(
  prefs: { fuel?: FuelId; sortBy?: SortBy },
  now: Date,
  online: boolean,
): AppState {
  return {
    status: 'loading',
    refreshing: false,
    lastError: null,
    stations: [],
    sourceDate: null,
    fetchedAt: null,
    dataSource: null,
    online,
    fuel: prefs.fuel ?? DEFAULT_FUEL,
    sortBy: prefs.sortBy ?? 'distance',
    geo: { status: 'pending', position: null, accuracyM: null },
    selectedId: null,
    sheet: 'peek',
    now,
  };
}
