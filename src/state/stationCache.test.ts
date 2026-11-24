// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { saveCachedStations, loadCachedStations, CACHE_KEY } from './stationCache';
import type { StorageLike } from './preferences';
import { parseResponse } from '../data/parse';
import { filterTenerife } from '../data/tenerife';
import { makeStation } from '../test/factories';
import fixture from '../test/fixtures/province-38.json';
import type { StationsResult } from '../types';

function spyStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((k: string) => (data.has(k) ? data.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      data.delete(k);
    }),
  } satisfies StorageLike;
  return { storage, data };
}

function sample(): StationsResult {
  return {
    stations: [
      makeStation({ id: 'a', prices: { g95: 1.529, diesel: 1.4 } }),
      makeStation({ id: 'b', brand: '', prices: { lpg: 0.9 } }),
    ],
    sourceDate: new Date('2026-11-23T08:30:00Z'),
    fetchedAt: new Date('2026-11-23T09:00:00Z'),
  };
}

function withPayload(payload: unknown) {
  return spyStorage({ [CACHE_KEY]: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

const validBase = () => ({
  v: 1,
  sourceDate: '2026-11-23T08:30:00.000Z',
  fetchedAt: '2026-11-23T09:00:00.000Z',
  stations: [makeStation({ id: 'ok' })],
});

describe('stationCache', () => {
  it('uses key tgp:stations:v1', () => {
    expect(CACHE_KEY).toBe('tgp:stations:v1');
  });

  it('round-trips stations and dates', () => {
    const { storage } = spyStorage();
    const input = sample();
    expect(saveCachedStations(storage, input)).toBe(true);
    const out = loadCachedStations(storage);
    expect(out).not.toBeNull();
    expect(out!.stations).toEqual(input.stations);
    expect(out!.sourceDate!.getTime()).toBe(input.sourceDate!.getTime());
    expect(out!.fetchedAt.getTime()).toBe(input.fetchedAt.getTime());
  });

  it('round-trips a null sourceDate', () => {
    const { storage } = spyStorage();
    saveCachedStations(storage, { ...sample(), sourceDate: null });
    expect(loadCachedStations(storage)!.sourceDate).toBeNull();
  });

  it('stores v 1 and ISO date strings under the key', () => {
    const { storage, data } = spyStorage();
    const input = sample();
    saveCachedStations(storage, input);
    expect(storage.setItem).toHaveBeenCalledWith('tgp:stations:v1', expect.any(String));
    const parsed = JSON.parse(data.get('tgp:stations:v1')!);
    expect(parsed.v).toBe(1);
    expect(parsed.sourceDate).toBe('2026-11-23T08:30:00.000Z');
    expect(parsed.fetchedAt).toBe('2026-11-23T09:00:00.000Z');
    expect(parsed.stations).toEqual(input.stations);
  });

  it('stores a null sourceDate as null', () => {
    const { storage, data } = spyStorage();
    saveCachedStations(storage, { ...sample(), sourceDate: null });
    expect(JSON.parse(data.get(CACHE_KEY)!).sourceDate).toBeNull();
  });

  it('returns null without removeItem for null storage and a missing key', () => {
    expect(loadCachedStations(null)).toBeNull();
    const { storage } = spyStorage();
    expect(loadCachedStations(storage)).toBeNull();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  const corrupt: Array<[string, () => string]> = [
    ['bad json', () => '{bad json'],
    ['null', () => 'null'],
    ['wrong version', () => JSON.stringify({ ...validBase(), v: 2 })],
    ['bad fetchedAt', () => JSON.stringify({ ...validBase(), fetchedAt: 'nope' })],
    ['stations not an array', () => JSON.stringify({ ...validBase(), stations: 'x' })],
    [
      'every station invalid',
      () => JSON.stringify({ ...validBase(), stations: [{ id: '', lat: 1, lon: 1 }, { id: 'q', lat: 'x', lon: 1 }, 5] }),
    ],
  ];
  for (const [name, make] of corrupt) {
    it(`returns null and removes the entry for corrupt value: ${name}`, () => {
      const { storage, data } = withPayload(make());
      expect(loadCachedStations(storage)).toBeNull();
      expect(storage.removeItem).toHaveBeenCalledWith('tgp:stations:v1');
      expect(data.has(CACHE_KEY)).toBe(false);
    });
  }

  it('keeps only valid stations and valid price entries', () => {
    const good = makeStation({ id: 'good' });
    const payload = {
      ...validBase(),
      stations: [
        { ...good, lat: 'x' },
        { ...good, id: '' },
        { ...good, prices: { g95: 1.5, kerosene: 1.2, diesel: -1, lpg: '1.5', adblue: 0.5 } },
      ],
    };
    // the third station keeps id 'good'; only it is valid
    const { storage } = withPayload(payload);
    const out = loadCachedStations(storage);
    expect(out).not.toBeNull();
    expect(out!.stations).toHaveLength(1);
    expect(out!.stations[0]!.id).toBe('good');
    expect(out!.stations[0]!.prices).toEqual({ g95: 1.5, adblue: 0.5 });
  });

  it('drops zero, NaN-like and non-object prices handling', () => {
    const good = makeStation({ id: 'good' });
    const { storage } = withPayload({
      ...validBase(),
      stations: [
        { ...good, id: 'p0', prices: { g95: 0, diesel: 1.2 } },
        { ...good, id: 'pn', prices: 'x' },
        { ...good, id: 'pnull', prices: null },
      ],
    });
    const out = loadCachedStations(storage);
    expect(out!.stations.map((s) => s.id)).toEqual(['p0']);
    expect(out!.stations[0]!.prices).toEqual({ diesel: 1.2 });
  });

  it('turns missing string fields into empty strings and drops non-string ones', () => {
    const { storage } = withPayload({
      ...validBase(),
      stations: [
        { id: 'm', lat: 28.1, lon: -16.7, prices: { g95: 1.5 } },
        { ...makeStation({ id: 'bad' }), brand: 5 },
      ],
    });
    const out = loadCachedStations(storage)!;
    expect(out.stations).toHaveLength(1);
    expect(out.stations[0]).toEqual({
      id: 'm', brand: '', address: '', locality: '', municipality: '',
      municipalityId: '', postalCode: '', lat: 28.1, lon: -16.7, hours: '',
      prices: { g95: 1.5 },
    });
  });

  it('an invalid sourceDate becomes null and the entry is still returned', () => {
    const { storage } = withPayload({ ...validBase(), sourceDate: 'garbage' });
    const out = loadCachedStations(storage);
    expect(out).not.toBeNull();
    expect(out!.sourceDate).toBeNull();
    expect(out!.stations).toHaveLength(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('a missing sourceDate becomes null', () => {
    const base: Record<string, unknown> = validBase();
    delete base.sourceDate;
    const { storage } = withPayload(base);
    expect(loadCachedStations(storage)!.sourceDate).toBeNull();
  });

  it('getItem throwing returns null without throwing', () => {
    const storage: StorageLike = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadCachedStations(storage)).toBeNull();
  });

  it('removeItem throwing during cleanup still returns null', () => {
    const storage: StorageLike = {
      getItem: vi.fn(() => '{bad json'),
      setItem: vi.fn(),
      removeItem: vi.fn(() => {
        throw new Error('nope');
      }),
    };
    expect(loadCachedStations(storage)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('setItem throwing QuotaExceededError returns false and keeps the previous value', () => {
    const { storage } = spyStorage();
    const first = sample();
    expect(saveCachedStations(storage, first)).toBe(true);
    storage.setItem.mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const second = { ...sample(), stations: [makeStation({ id: 'zzz' })] };
    expect(saveCachedStations(storage, second)).toBe(false);
    const out = loadCachedStations(storage);
    expect(out!.stations).toEqual(first.stations);
  });

  it('saving to null storage returns false', () => {
    expect(saveCachedStations(null, sample())).toBe(false);
  });

  it('serialises the 212 fixture Tenerife stations under 200000 characters', () => {
    const stations = filterTenerife(parseResponse(fixture).stations);
    expect(stations).toHaveLength(212);
    const { storage, data } = spyStorage();
    expect(saveCachedStations(storage, { stations, sourceDate: null, fetchedAt: new Date() })).toBe(true);
    expect(data.get(CACHE_KEY)!.length).toBeLessThan(200000);
  });

  describe('mutation hardening', () => {
    it('skips null, string, number and array stations without throwing and keeps the valid one', () => {
      const { storage } = withPayload({
        ...validBase(),
        stations: [null, 'x', 5, [], makeStation({ id: 'ok' })],
      });
      const out = loadCachedStations(storage);
      expect(out!.stations.map((s) => s.id)).toEqual(['ok']);
    });

    it('accepts null and undefined string fields as empty strings', () => {
      const { storage } = withPayload({
        ...validBase(),
        stations: [{ id: 'n', lat: 28.1, lon: -16.7, brand: null, hours: null, address: 'A', prices: {} }],
      });
      const out = loadCachedStations(storage)!;
      expect(out.stations).toHaveLength(1);
      expect(out.stations[0]!.brand).toBe('');
      expect(out.stations[0]!.hours).toBe('');
      expect(out.stations[0]!.locality).toBe('');
      expect(out.stations[0]!.address).toBe('A');
    });

    it('keeps only finite positive numeric prices for known fuels', () => {
      const { storage } = withPayload({
        ...validBase(),
        stations: [{
          ...makeStation({ id: 'p' }),
          prices: { g95: 1.5, g98: 0, diesel: -2, lpg: '1.1', cng: null, adblue: true, bogus: 3, toString: 4 },
        }],
      });
      expect(loadCachedStations(storage)!.stations[0]!.prices).toEqual({ g95: 1.5 });
    });

    it.each([['[]'], ['[1,2]'], ['"x"'], ['5']])('treats %s as corrupt and removes the entry', (raw) => {
      const { storage, data } = withPayload(raw);
      expect(loadCachedStations(storage)).toBeNull();
      expect(storage.removeItem).toHaveBeenCalledWith(CACHE_KEY);
      expect(data.has(CACHE_KEY)).toBe(false);
    });

    it('treats unparseable JSON as corrupt, removing the entry exactly once', () => {
      const { storage } = withPayload('{oops');
      expect(loadCachedStations(storage)).toBeNull();
      expect(storage.removeItem).toHaveBeenCalledTimes(1);
    });
  });
});
