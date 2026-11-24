// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatPrice, formatPriceShort, formatDistance } from './format';

describe('formatPrice', () => {
  it('formats 3 decimals with a comma, a NBSP and the €/L unit', () => {
    expect(formatPrice(1.529)).toBe('1,529 €/L');
  });

  it('pads a price with fewer decimals to 3 places', () => {
    expect(formatPrice(1.5)).toBe('1,500 €/L');
  });

  it('keeps the leading zero for prices below 1 euro', () => {
    expect(formatPrice(0.92)).toBe('0,920 €/L');
  });
});

describe('formatPriceShort', () => {
  it('returns the number without unit using a comma', () => {
    expect(formatPriceShort(1.5)).toBe('1,500');
  });
});

describe('formatDistance', () => {
  it('shows metres below 1 km, rounded to 10 m', () => {
    expect(formatDistance(0.004)).toBe('0 m');
    expect(formatDistance(0.854)).toBe('850 m');
  });

  it('keeps 1000 m for values that round up to 1 km but are still under 1 km', () => {
    expect(formatDistance(0.996)).toBe('1000 m');
  });

  it('shows one decimal with a comma from 1 km up to 10 km', () => {
    expect(formatDistance(1)).toBe('1,0 km');
    expect(formatDistance(3.44)).toBe('3,4 km');
  });

  it('rounds the one-decimal value up to 10,0 km just below 10 km', () => {
    expect(formatDistance(9.96)).toBe('10,0 km');
  });

  it('shows rounded integer kilometres from 10 km upwards', () => {
    expect(formatDistance(10)).toBe('10 km');
    expect(formatDistance(12.6)).toBe('13 km');
  });
});

describe('formatDistance: rounding up to 10 (specs: 9.96 -> "10,0 km")', () => {
  it('renders 9.96 km as "10,0 km" and 9.99 km likewise', () => {
    expect(formatDistance(9.96)).toBe('10,0 km');
    expect(formatDistance(9.99)).toBe('10,0 km');
  });
  it('renders 9.94 as "9,9 km" and exactly 10 as "10 km"', () => {
    expect(formatDistance(9.94)).toBe('9,9 km');
    expect(formatDistance(10)).toBe('10 km');
  });
});
