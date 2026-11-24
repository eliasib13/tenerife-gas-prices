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
