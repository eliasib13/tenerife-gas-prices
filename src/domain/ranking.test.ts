// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { makeTierFn, sortItems } from './ranking';
import { makeStation } from '../test/factories';
import type { StationListItem } from '../types';

function item(id: string, price: number, distanceKm: number | null, brand = 'TEST'): StationListItem {
  return {
    station: makeStation({ id, brand, prices: { g95: price } }),
    price,
    distanceKm,
    tier: 'mid',
    isCheapest: false,
    openState: 'unknown',
  };
}

const ids = (items: StationListItem[]): string[] => items.map((i) => i.station.id);

describe('makeTierFn', () => {
  it('returns mid for every price when there are no prices', () => {
    expect(makeTierFn([])(1.5)).toBe('mid');
  });

  it('returns mid when all prices are equal', () => {
    expect(makeTierFn([1.5, 1.5, 1.5])(1.5)).toBe('mid');
  });

  it('classifies seven prices using quartile thresholds q1=1.2 and q2=1.4', () => {
    const tier = makeTierFn([1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]);
    expect(tier(1.0)).toBe('cheap');
    expect(tier(1.2)).toBe('cheap');
    expect(tier(1.3)).toBe('mid');
    expect(tier(1.4)).toBe('mid');
    expect(tier(1.5)).toBe('expensive');
    expect(tier(1.6)).toBe('expensive');
  });

  it('gives the same result for unsorted input and does not mutate the input', () => {
    const input = [1.6, 1.0, 1.4, 1.2, 1.5, 1.1, 1.3];
    const snapshot = [...input];
    const tier = makeTierFn(input);
    expect(tier(1.0)).toBe('cheap');
    expect(tier(1.2)).toBe('cheap');
    expect(tier(1.3)).toBe('mid');
    expect(tier(1.4)).toBe('mid');
    expect(tier(1.5)).toBe('expensive');
    expect(tier(1.6)).toBe('expensive');
    expect(input).toEqual(snapshot);
  });

  it('classifies two prices as cheap and expensive', () => {
    const tier = makeTierFn([1, 2]);
    expect(tier(1)).toBe('cheap');
    expect(tier(2)).toBe('expensive');
  });
});

describe('sortItems by price', () => {
  it('orders by price, then distance ascending', () => {
    const input = [
      item('a', 1.6, 1),
      item('b', 1.5, 2),
      item('c', 1.5, 1),
      item('d', 1.5, 3),
    ];
    expect(ids(sortItems(input, 'price'))).toEqual(['c', 'b', 'd', 'a']);
  });

  it('places null distances last among equal prices', () => {
    const input = [item('n', 1.5, null), item('f', 1.5, 5)];
    expect(ids(sortItems(input, 'price'))).toEqual(['f', 'n']);
  });

  it('does not mutate the input array and returns a new array', () => {
    const input = [item('a', 1.6, 1), item('b', 1.5, 2), item('c', 1.5, 1)];
    const before = ids(input);
    const result = sortItems(input, 'price');
    expect(result).not.toBe(input);
    expect(ids(input)).toEqual(before);
  });
});

describe('sortItems by distance', () => {
  it('places null distances last', () => {
    const input = [item('n', 1.0, null), item('f', 2.0, 4), item('g', 2.0, 1)];
    expect(ids(sortItems(input, 'distance'))).toEqual(['g', 'f', 'n']);
  });

  it('orders equal distances by price, then by id', () => {
    const input = [
      item('z', 1.7, 2),
      item('b', 1.5, 2),
      item('a', 1.5, 2),
      item('c', 1.6, 1),
    ];
    expect(ids(sortItems(input, 'distance'))).toEqual(['c', 'a', 'b', 'z']);
  });
});

describe('sortItems tiebreaks', () => {
  it('price mode: same price and distance sorts by brand, in both input orders', () => {
    const a = item('2', 1.5, 1, 'A');
    const b = item('1', 1.5, 1, 'B');
    expect(ids(sortItems([a, b], 'price'))).toEqual(['2', '1']);
    expect(ids(sortItems([b, a], 'price'))).toEqual(['2', '1']);
  });

  it('price mode: same price, distance and brand sorts by id, in both input orders', () => {
    const a = item('a', 1.5, 1, 'X');
    const b = item('b', 1.5, 1, 'X');
    expect(ids(sortItems([a, b], 'price'))).toEqual(['a', 'b']);
    expect(ids(sortItems([b, a], 'price'))).toEqual(['a', 'b']);
  });

  it('price mode: identical items keep a stable order', () => {
    const a = item('same', 1.5, 1, 'X');
    const b = item('same', 1.5, 1, 'X');
    expect(sortItems([a, b], 'price')).toEqual([a, b]);
  });

  it('price mode: both distances null falls through to brand then id', () => {
    const a = item('2', 1.5, null, 'A');
    const b = item('1', 1.5, null, 'B');
    expect(ids(sortItems([b, a], 'price'))).toEqual(['2', '1']);
    expect(ids(sortItems([a, b], 'price'))).toEqual(['2', '1']);
    const c = item('1', 1.5, null, 'X');
    const d = item('2', 1.5, null, 'X');
    expect(ids(sortItems([d, c], 'price'))).toEqual(['1', '2']);
    expect(ids(sortItems([c, d], 'price'))).toEqual(['1', '2']);
  });

  it('price mode: a null distance sorts after a known one at the same price', () => {
    const known = item('k', 1.5, 9, 'Z');
    const unknown = item('u', 1.5, null, 'A');
    expect(ids(sortItems([unknown, known], 'price'))).toEqual(['k', 'u']);
    expect(ids(sortItems([known, unknown], 'price'))).toEqual(['k', 'u']);
  });

  it('distance mode: same distance and price sorts by id, in both input orders', () => {
    const a = item('a', 1.5, 2, 'Z');
    const b = item('b', 1.5, 2, 'A');
    expect(ids(sortItems([a, b], 'distance'))).toEqual(['a', 'b']);
    expect(ids(sortItems([b, a], 'distance'))).toEqual(['a', 'b']);
  });

  it('distance mode: identical items keep a stable order', () => {
    const a = item('same', 1.5, 2);
    const b = item('same', 1.5, 2);
    expect(sortItems([a, b], 'distance')).toEqual([a, b]);
  });

  it('distance mode: both distances null falls through to price then id', () => {
    const a = item('b', 1.4, null);
    const b = item('a', 1.5, null);
    expect(ids(sortItems([b, a], 'distance'))).toEqual(['b', 'a']);
    const c = item('a', 1.5, null);
    const d = item('b', 1.5, null);
    expect(ids(sortItems([d, c], 'distance'))).toEqual(['a', 'b']);
  });
});

describe('makeTierFn degenerate inputs', () => {
  it('returns mid for a single price and for all-equal prices', () => {
    expect(makeTierFn([1.5])(1.5)).toBe('mid');
    expect(makeTierFn([1.5, 1.5, 1.5])(1.2)).toBe('mid');
    expect(makeTierFn([1.5, 1.5, 1.5])(1.9)).toBe('mid');
  });
});

describe('sortItems stability with identical ids', () => {
  function twin(address: string): StationListItem {
    const it = item('same', 1.5, 2, 'TEST');
    return { ...it, station: { ...it.station, address } };
  }

  it.each([['price' as const], ['distance' as const]])('keeps input order for equal items when sorting by %s', (mode) => {
    const a = twin('A');
    const b = twin('B');
    const r1 = sortItems([a, b], mode);
    expect(r1[0]).toBe(a);
    expect(r1[1]).toBe(b);
    const r2 = sortItems([b, a], mode);
    expect(r2[0]).toBe(b);
    expect(r2[1]).toBe(a);
  });
});
