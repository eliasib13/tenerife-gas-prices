// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  availableFuels,
  effectiveSort,
  listItems,
  markerModels,
  selectedStation,
} from './selectors';
import { initialState } from './store';
import { FUELS } from '../fuels';
import { parseResponse } from '../data/parse';
import { filterTenerife } from '../data/tenerife';
import { formatPriceShort } from '../domain/format';
import { haversineKm } from '../domain/geo';
import { makeStation } from '../test/factories';
import fixture from '../test/fixtures/province-38.json';
import type { AppState, StationListItem } from '../types';

// Monday 2026-11-23 03:00Z (closed for 06:00-22:00 in Canary time, summer or winter)
const MONDAY_3Z = new Date('2026-11-23T03:00:00Z');

function stateWith(over: Partial<AppState> = {}): AppState {
  return { ...initialState({}, MONDAY_3Z, true), ...over };
}

describe('availableFuels', () => {
  it('returns all 9 fuels in FUELS order for the fixture Tenerife stations', () => {
    const stations = filterTenerife(parseResponse(fixture).stations);
    const result = availableFuels(stations, 'g95');
    expect(result.map((f) => f.id)).toEqual(FUELS.map((f) => f.id));
    expect(result).toHaveLength(9);
  });

  it('includes the selected fuel even if nobody sells it, in FUELS order', () => {
    const stations = [makeStation({ prices: { diesel: 1.6 } })];
    expect(availableFuels(stations, 'g95').map((f) => f.id)).toEqual(['g95', 'diesel']);
  });
});

describe('effectiveSort', () => {
  it("is 'price' for sortBy 'distance' without a position", () => {
    expect(effectiveSort(stateWith({ sortBy: 'distance' }))).toBe('price');
  });
  it("is 'distance' for sortBy 'distance' with a position", () => {
    const s = stateWith({
      sortBy: 'distance',
      geo: { status: 'ok', position: { lat: 28.1, lon: -16.7 }, accuracyM: 10 },
    });
    expect(effectiveSort(s)).toBe('distance');
  });
  it("is 'price' for sortBy 'price' with a position", () => {
    const s = stateWith({
      sortBy: 'price',
      geo: { status: 'ok', position: { lat: 28.1, lon: -16.7 }, accuracyM: 10 },
    });
    expect(effectiveSort(s)).toBe('price');
  });
  it("is 'price' for sortBy 'price' without a position", () => {
    expect(effectiveSort(stateWith({ sortBy: 'price' }))).toBe('price');
  });
});

describe('listItems', () => {
  const hours = 'L-D: 06:00-22:00';

  it('keeps stations with the fuel, with price, tier, isCheapest and openState', () => {
    const stations = [
      makeStation({ id: 'a', hours, prices: { g95: 1.4 } }),
      makeStation({ id: 'b', hours, prices: { diesel: 1.3 } }),
      makeStation({ id: 'c', hours, prices: { g95: 1.6 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95' }));
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.station.id)).toEqual(['a', 'c']);
    expect(items[0]!.price).toBe(1.4);
    expect(items[0]!.tier).toBe('cheap');
    expect(items[0]!.isCheapest).toBe(true);
    expect(items[0]!.openState).toBe('closed');
    expect(items[1]!.price).toBe(1.6);
    expect(items[1]!.tier).toBe('expensive');
    expect(items[1]!.isCheapest).toBe(false);
    expect(items[1]!.openState).toBe('closed');
  });

  it('marks ties at the minimum as both cheapest', () => {
    const stations = [
      makeStation({ id: 'a', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', prices: { g95: 1.4 } }),
      makeStation({ id: 'c', prices: { g95: 1.5 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95' }));
    const byId = Object.fromEntries(items.map((i) => [i.station.id, i]));
    expect(byId.a!.isCheapest).toBe(true);
    expect(byId.b!.isCheapest).toBe(true);
    expect(byId.c!.isCheapest).toBe(false);
  });

  it('reports unknown openState for unparseable hours and open for 24H', () => {
    const stations = [
      makeStation({ id: 'a', hours: '', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', hours: 'L-D: 24H', prices: { g95: 1.5 } }),
    ];
    const items = listItems(stateWith({ stations }));
    const byId = Object.fromEntries(items.map((i) => [i.station.id, i]));
    expect(byId.a!.openState).toBe('unknown');
    expect(byId.b!.openState).toBe('open');
  });

  it('with a position computes distanceKm and sorts by distance', () => {
    const pos = { lat: 28.1, lon: -16.7 };
    const stations = [
      makeStation({ id: 'far', lat: 28.4, lon: -16.5, prices: { g95: 1.3 } }),
      makeStation({ id: 'near', lat: 28.11, lon: -16.7, prices: { g95: 1.6 } }),
      makeStation({ id: 'mid', lat: 28.2, lon: -16.6, prices: { g95: 1.5 } }),
    ];
    const items = listItems(
      stateWith({
        stations,
        sortBy: 'distance',
        geo: { status: 'ok', position: pos, accuracyM: 5 },
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['near', 'mid', 'far']);
    for (const i of items) {
      expect(i.distanceKm).toBeCloseTo(haversineKm(pos, { lat: i.station.lat, lon: i.station.lon }), 9);
    }
  });

  it("without a position distanceKm is null and items are sorted by price", () => {
    const stations = [
      makeStation({ id: 'x', prices: { g95: 1.6 } }),
      makeStation({ id: 'y', prices: { g95: 1.3 } }),
      makeStation({ id: 'z', prices: { g95: 1.5 } }),
    ];
    const items = listItems(stateWith({ stations, sortBy: 'distance' }));
    expect(items.map((i) => i.station.id)).toEqual(['y', 'z', 'x']);
    expect(items.every((i) => i.distanceKm === null)).toBe(true);
  });
});

describe('markerModels', () => {
  const mk = (id: string, price: number, tier: StationListItem['tier'], isCheapest: boolean): StationListItem => ({
    station: makeStation({ id, lat: 28.2 + price, lon: -16.5 }),
    price,
    distanceKm: null,
    tier,
    isCheapest,
    openState: 'open',
    favorite: false,
  });

  it('maps id, lat, lon, label, tier, cheapest and selected', () => {
    const items = [mk('a', 1.529, 'cheap', true), mk('b', 1.6, 'expensive', false)];
    const models = markerModels(items, 'b');
    expect(models).toEqual([
      { id: 'a', lat: items[0]!.station.lat, lon: -16.5, label: formatPriceShort(1.529), tier: 'cheap', selected: false, cheapest: true },
      { id: 'b', lat: items[1]!.station.lat, lon: -16.5, label: formatPriceShort(1.6), tier: 'expensive', selected: true, cheapest: false },
    ]);
  });

  it('selected is false everywhere when selectedId is null or unknown', () => {
    const items = [mk('a', 1.5, 'mid', false)];
    expect(markerModels(items, null)[0]!.selected).toBe(false);
    expect(markerModels(items, 'zzz')[0]!.selected).toBe(false);
  });
});

describe('selectedStation', () => {
  const stations = [makeStation({ id: 'a' }), makeStation({ id: 'b' })];
  it('returns the matching station', () => {
    expect(selectedStation(stateWith({ stations, selectedId: 'b' }))).toBe(stations[1]);
  });
  it('returns null for an unknown id', () => {
    expect(selectedStation(stateWith({ stations, selectedId: 'nope' }))).toBeNull();
  });
  it('returns null when selectedId is null', () => {
    expect(selectedStation(stateWith({ stations, selectedId: null }))).toBeNull();
  });
});

describe('listItems with a search query', () => {
  const hours = 'L-D: 06:00-22:00';
  const pos = { lat: 28.1, lon: -16.7 };

  it('keeps only stations matching the query that are priced for the fuel', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'CEPSA', hours, prices: { g95: 1.4 } }),
      makeStation({ id: 'b', brand: 'SHELL', hours, prices: { g95: 1.3 } }),
      makeStation({ id: 'c', brand: 'CEPSA', hours, prices: { diesel: 1.2 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', query: 'cepsa' }));
    expect(items.map((i) => i.station.id)).toEqual(['a']);
  });

  it('an empty or whitespace-only query keeps every priced station', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'CEPSA', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', brand: 'SHELL', prices: { g95: 1.3 } }),
      makeStation({ id: 'c', brand: 'SHELL', prices: { diesel: 1.2 } }),
    ];
    expect(listItems(stateWith({ stations, fuel: 'g95', query: '' })).map((i) => i.station.id)).toEqual(['b', 'a']);
    expect(listItems(stateWith({ stations, fuel: 'g95', query: '   ' })).map((i) => i.station.id)).toEqual(['b', 'a']);
  });

  it('matches municipality accent- and case-insensitively', () => {
    const stations = [
      makeStation({ id: 'a', municipality: 'Güímar', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', municipality: 'Adeje', prices: { g95: 1.3 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', query: 'GUIMAR' }));
    expect(items.map((i) => i.station.id)).toEqual(['a']);
  });

  it('a station excluded by the query keeps the tier of the full fuel set', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'SHELL', prices: { g95: 1.4 } }),
      makeStation({ id: 'c', brand: 'CEPSA', prices: { g95: 1.6 } }),
    ];
    const unfiltered = listItems(stateWith({ stations, fuel: 'g95' }));
    const onlyExpensive = listItems(stateWith({ stations, fuel: 'g95', query: 'cepsa' }));
    expect(onlyExpensive).toHaveLength(1);
    expect(onlyExpensive[0]!.tier).toBe('expensive');
    expect(onlyExpensive[0]!.tier).toBe(unfiltered.find((i) => i.station.id === 'c')!.tier);
    expect(onlyExpensive[0]!.isCheapest).toBe(false);
  });

  it('keeps isCheapest true when the cheapest station is the only match', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'SHELL', prices: { g95: 1.4 } }),
      makeStation({ id: 'c', brand: 'CEPSA', prices: { g95: 1.6 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', query: 'shell' }));
    expect(items).toHaveLength(1);
    expect(items[0]!.station.id).toBe('a');
    expect(items[0]!.tier).toBe('cheap');
    expect(items[0]!.isCheapest).toBe(true);
  });

  it('no item is isCheapest when the cheapest station is filtered out', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'SHELL', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', brand: 'CEPSA', prices: { g95: 1.5 } }),
      makeStation({ id: 'c', brand: 'CEPSA', prices: { g95: 1.6 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', query: 'cepsa' }));
    expect(items.map((i) => i.station.id)).toEqual(['b', 'c']);
    expect(items.every((i) => i.isCheapest === false)).toBe(true);
  });

  it('sorts the filtered set by price', () => {
    const stations = [
      makeStation({ id: 'x', brand: 'CEPSA', prices: { g95: 1.6 } }),
      makeStation({ id: 'y', brand: 'CEPSA', prices: { g95: 1.3 } }),
      makeStation({ id: 'z', brand: 'SHELL', prices: { g95: 1.1 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', sortBy: 'price', query: 'cepsa' }));
    expect(items.map((i) => i.station.id)).toEqual(['y', 'x']);
  });

  it('sorts the filtered set by distance when a position is known', () => {
    const stations = [
      makeStation({ id: 'far', brand: 'CEPSA', lat: 28.4, lon: -16.5, prices: { g95: 1.3 } }),
      makeStation({ id: 'near', brand: 'CEPSA', lat: 28.11, lon: -16.7, prices: { g95: 1.6 } }),
      makeStation({ id: 'excluded', brand: 'SHELL', lat: 28.1, lon: -16.7, prices: { g95: 1.5 } }),
    ];
    const items = listItems(
      stateWith({
        stations,
        fuel: 'g95',
        sortBy: 'distance',
        query: 'cepsa',
        geo: { status: 'ok', position: pos, accuracyM: 5 },
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['near', 'far']);
  });

  it('a query matching nothing returns no items and no markers', () => {
    const stations = [makeStation({ id: 'a', brand: 'CEPSA', prices: { g95: 1.4 } })];
    const s = stateWith({ stations, fuel: 'g95', query: 'zzzz' });
    expect(listItems(s)).toEqual([]);
    expect(markerModels(listItems(s), null)).toEqual([]);
  });

  it('markers and list rows are the same filtered set in the same order', () => {
    const stations = [
      makeStation({ id: 'a', municipality: 'La Laguna', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', municipality: 'Adeje', prices: { g95: 1.3 } }),
      makeStation({ id: 'c', municipality: 'San Cristóbal de La Laguna', prices: { g95: 1.5 } }),
    ];
    const items = listItems(stateWith({ stations, fuel: 'g95', sortBy: 'price', query: 'laguna' }));
    expect(items.map((i) => i.station.id)).toEqual(['a', 'c']);
    expect(markerModels(items, 'c').map((m) => m.id)).toEqual(items.map((i) => i.station.id));
  });
});

describe('selectedStation with a search query', () => {
  it('still returns a selected station that the query excludes', () => {
    const stations = [makeStation({ id: 'a', brand: 'SHELL' }), makeStation({ id: 'b', brand: 'CEPSA' })];
    const s = stateWith({ stations, selectedId: 'a', query: 'cepsa' });
    expect(selectedStation(s)).toBe(stations[0]);
  });
});

describe('listItems favorites scope', () => {
  const pos = { lat: 28.1, lon: -16.7 };
  const geo = { status: 'ok' as const, position: pos, accuracyM: 5 };
  const abc = () => [
    makeStation({ id: 'A', lat: 28.4, lon: -16.5, prices: { g95: 1.3 } }),
    makeStation({ id: 'B', lat: 28.2, lon: -16.6, prices: { g95: 1.5 } }),
    makeStation({ id: 'C', lat: 28.11, lon: -16.7, prices: { g95: 1.9 } }),
  ];

  it("scope 'all' ignores favorites and flags favorite only for ids in state.favorites", () => {
    const items = listItems(
      stateWith({ stations: abc(), fuel: 'g95', scope: 'all', favorites: ['B', 'ghost'] }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['A', 'B', 'C']);
    expect(items.map((i) => [i.station.id, i.favorite])).toEqual([
      ['A', false],
      ['B', true],
      ['C', false],
    ]);
  });

  it("scope 'favorites' returns only favorited stations, all flagged favorite", () => {
    const items = listItems(
      stateWith({ stations: abc(), fuel: 'g95', scope: 'favorites', favorites: ['B', 'C'] }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['B', 'C']);
    expect(items.every((i) => i.favorite === true)).toBe(true);
  });

  it("scope 'favorites' with empty favorites returns []", () => {
    expect(
      listItems(stateWith({ stations: abc(), fuel: 'g95', scope: 'favorites', favorites: [] })),
    ).toEqual([]);
  });

  it('tiers and isCheapest do not change with scope', () => {
    const base = { stations: abc(), fuel: 'g95' as const, favorites: ['B', 'C'] };
    const all = listItems(stateWith({ ...base, scope: 'all' }));
    const favs = listItems(stateWith({ ...base, scope: 'favorites' }));
    const tierAll = all.find((i) => i.station.id === 'B')!.tier;
    expect(favs.find((i) => i.station.id === 'B')!.tier).toBe(tierAll);
    expect(favs.find((i) => i.station.id === 'C')!.tier).toBe(
      all.find((i) => i.station.id === 'C')!.tier,
    );
    expect(favs.map((i) => i.station.id)).toEqual(['B', 'C']);
    expect(favs.every((i) => i.isCheapest === false)).toBe(true);
  });

  it('sorts by distance in favorites scope when a position is known', () => {
    const items = listItems(
      stateWith({
        stations: abc(),
        fuel: 'g95',
        scope: 'favorites',
        favorites: ['A', 'B', 'C'],
        sortBy: 'distance',
        geo,
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['C', 'B', 'A']);
    expect(items.every((i) => i.distanceKm !== null)).toBe(true);
  });

  it('sorts by price in favorites scope', () => {
    const items = listItems(
      stateWith({
        stations: abc(),
        fuel: 'g95',
        scope: 'favorites',
        favorites: ['A', 'B', 'C'],
        sortBy: 'price',
        geo,
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['A', 'B', 'C']);
  });

  it('falls back to price sort without a position in favorites scope', () => {
    const items = listItems(
      stateWith({
        stations: abc(),
        fuel: 'g95',
        scope: 'favorites',
        favorites: ['C', 'B'],
        sortBy: 'distance',
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['B', 'C']);
    expect(items.every((i) => i.distanceKm === null)).toBe(true);
  });

  it('excludes a favorite without a price for the selected fuel', () => {
    const stations = [
      makeStation({ id: 'A', prices: { g95: 1.4 } }),
      makeStation({ id: 'D', prices: { diesel: 1.2 } }),
    ];
    const items = listItems(
      stateWith({ stations, fuel: 'g95', scope: 'favorites', favorites: ['A', 'D'] }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['A']);
  });

  it('query filters within favorites scope (AND)', () => {
    const stations = [
      makeStation({ id: 'a', brand: 'CEPSA', prices: { g95: 1.4 } }),
      makeStation({ id: 'b', brand: 'SHELL', prices: { g95: 1.5 } }),
      makeStation({ id: 'c', brand: 'CEPSA', prices: { g95: 1.6 } }),
    ];
    const items = listItems(
      stateWith({
        stations,
        fuel: 'g95',
        scope: 'favorites',
        favorites: ['b', 'c'],
        query: 'cepsa',
      }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['c']);
  });

  it('ignores unknown ids in favorites', () => {
    const items = listItems(
      stateWith({ stations: abc(), fuel: 'g95', scope: 'favorites', favorites: ['zzz', 'B'] }),
    );
    expect(items.map((i) => i.station.id)).toEqual(['B']);
  });

  it('markerModels of favorites-scope items yields only favorite pins', () => {
    const items = listItems(
      stateWith({ stations: abc(), fuel: 'g95', scope: 'favorites', favorites: ['B'] }),
    );
    expect(markerModels(items, null).map((m) => m.id)).toEqual(['B']);
  });
});
