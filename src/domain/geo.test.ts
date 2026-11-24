// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { haversineKm, isWithinBounds } from './geo';

describe('haversineKm', () => {
  it('returns 0 for a point compared with itself', () => {
    expect(haversineKm({ lat: 28.4682, lon: -16.2546 }, { lat: 28.4682, lon: -16.2546 })).toBe(0);
  });

  it('measures Santa Cruz to Los Cristianos as 64.9 km (+/- 1.0)', () => {
    const d = haversineKm({ lat: 28.4682, lon: -16.2546 }, { lat: 28.0503, lon: -16.7172 });
    expect(Math.abs(d - 64.9)).toBeLessThanOrEqual(1.0);
  });

  it('is symmetric', () => {
    const a = { lat: 28.4682, lon: -16.2546 };
    const b = { lat: 28.0503, lon: -16.7172 };
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });

  it('measures one degree of latitude at the equator as 111.19 km (+/- 0.05)', () => {
    const d = haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(Math.abs(d - 111.19)).toBeLessThanOrEqual(0.05);
  });
});

describe('isWithinBounds', () => {
  const box = { south: 28.0, west: -16.9, north: 28.6, east: -16.1 };

  it('is true for a point strictly inside the box', () => {
    expect(isWithinBounds({ lat: 28.3, lon: -16.5 }, box)).toBe(true);
  });

  it('is inclusive at the north edge and false just above it', () => {
    expect(isWithinBounds({ lat: 28.6, lon: -16.5 }, box)).toBe(true);
    expect(isWithinBounds({ lat: 28.6001, lon: -16.5 }, box)).toBe(false);
  });

  it('is inclusive at the south edge and false just below it', () => {
    expect(isWithinBounds({ lat: 28.0, lon: -16.5 }, box)).toBe(true);
    expect(isWithinBounds({ lat: 27.9999, lon: -16.5 }, box)).toBe(false);
  });

  it('is inclusive at the east edge and false just east of it', () => {
    expect(isWithinBounds({ lat: 28.3, lon: -16.1 }, box)).toBe(true);
    expect(isWithinBounds({ lat: 28.3, lon: -16.0999 }, box)).toBe(false);
  });

  it('is inclusive at the west edge and false just west of it', () => {
    expect(isWithinBounds({ lat: 28.3, lon: -16.9 }, box)).toBe(true);
    expect(isWithinBounds({ lat: 28.3, lon: -16.9001 }, box)).toBe(false);
  });
});
