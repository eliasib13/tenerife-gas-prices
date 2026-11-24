import { isFuelId } from '../fuels';
import type { StorageLike } from './preferences';
import type { FuelId, Station, StationsResult } from '../types';

export const CACHE_KEY = 'tgp:stations:v1';

export function saveCachedStations(storage: StorageLike | null, result: StationsResult): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        v: 1,
        sourceDate: result.sourceDate ? result.sourceDate.toISOString() : null,
        fetchedAt: result.fetchedAt.toISOString(),
        stations: result.stations,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function str(x: unknown): string | null {
  if (x === undefined || x === null) return '';
  return typeof x === 'string' ? x : null;
}

function validStation(x: unknown): Station | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id === '') return null;
  if (typeof o.lat !== 'number' || !Number.isFinite(o.lat)) return null;
  if (typeof o.lon !== 'number' || !Number.isFinite(o.lon)) return null;
  const f: Record<string, string> = {};
  for (const k of ['brand', 'address', 'locality', 'municipality', 'municipalityId', 'postalCode', 'hours']) {
    const v = str(o[k]);
    if (v === null) return null;
    f[k] = v;
  }
  const p = o.prices;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const prices: Partial<Record<FuelId, number>> = {};
  for (const [k, v] of Object.entries(p)) {
    if (isFuelId(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) prices[k] = v;
  }
  return {
    id: o.id,
    brand: f.brand!,
    address: f.address!,
    locality: f.locality!,
    municipality: f.municipality!,
    municipalityId: f.municipalityId!,
    postalCode: f.postalCode!,
    lat: o.lat,
    lon: o.lon,
    hours: f.hours!,
    prices,
  };
}

export function loadCachedStations(storage: StorageLike | null): StationsResult | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const corrupt = (): null => {
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return corrupt();
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return corrupt();
  const o = obj as Record<string, unknown>;
  if (o.v !== 1) return corrupt();
  const fetchedAt = typeof o.fetchedAt === 'string' ? new Date(o.fetchedAt) : null;
  if (!fetchedAt || Number.isNaN(fetchedAt.getTime())) return corrupt();
  if (!Array.isArray(o.stations)) return corrupt();
  const stations = o.stations.map(validStation).filter((s): s is Station => s !== null);
  if (stations.length === 0) return corrupt();
  let sourceDate: Date | null = null;
  if (typeof o.sourceDate === 'string') {
    const d = new Date(o.sourceDate);
    if (!Number.isNaN(d.getTime())) sourceDate = d;
  }
  return { stations, sourceDate, fetchedAt };
}
