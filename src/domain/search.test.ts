// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeText, matchesQuery } from './search';
import { makeStation } from '../test/factories';

describe('normalizeText', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeText('Güímar')).toBe('guimar');
  });

  it('lowercases accented upper case text', () => {
    expect(normalizeText('AÑAZA')).toBe('anaza');
  });

  it('trims and collapses internal whitespace', () => {
    expect(normalizeText('  a   b ')).toBe('a b');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('matchesQuery', () => {
  const station = makeStation({
    brand: 'Cepsa',
    address: 'Calle del Pozo 12',
    locality: 'La Laguna',
    municipality: 'San Cristóbal de La Laguna',
    postalCode: '38201',
  });

  it('matches an empty query and a whitespace-only query', () => {
    expect(matchesQuery(station, '')).toBe(true);
    expect(matchesQuery(station, '   ')).toBe(true);
  });

  it('matches the brand case-insensitively', () => {
    expect(matchesQuery(station, 'cepsa')).toBe(true);
    expect(matchesQuery(station, 'CEPSA')).toBe(true);
  });

  it('matches a fragment of the address', () => {
    expect(matchesQuery(station, 'calle del pozo')).toBe(true);
  });

  it('matches a municipality fragment ignoring case', () => {
    expect(matchesQuery(station, 'la laguna')).toBe(true);
  });

  it('is accent-insensitive when the query has no accents', () => {
    expect(matchesQuery(station, 'cristobal')).toBe(true);
  });

  it('is accent-insensitive when the query has accents and the data does not', () => {
    const plain = makeStation({ municipality: 'Cristobal' });
    expect(matchesQuery(plain, 'Cristóbal')).toBe(true);
  });

  it('matches the locality', () => {
    const s = makeStation({ locality: 'GÜÍMAR', municipality: 'Güímar' });
    expect(matchesQuery(s, 'guimar')).toBe(true);
    expect(matchesQuery(s, 'GUIMAR')).toBe(true);
  });

  it('matches the postal code', () => {
    expect(matchesQuery(station, '38201')).toBe(true);
  });

  it('requires every token to match, in any order', () => {
    expect(matchesQuery(station, 'laguna cepsa')).toBe(true);
    expect(matchesQuery(station, 'cepsa laguna')).toBe(true);
  });

  it('does not match when one token is absent', () => {
    expect(matchesQuery(station, 'laguna shell')).toBe(false);
  });

  it('returns false when nothing matches', () => {
    expect(matchesQuery(station, 'zzzz')).toBe(false);
  });

  it('does not match on fields outside the searchable list (id, hours)', () => {
    const s = makeStation({ id: 'ABC999', hours: 'L-D: 24H' });
    expect(matchesQuery(s, 'abc999')).toBe(false);
    expect(matchesQuery(s, '24h')).toBe(false);
  });

  it('matches by address when the brand is empty', () => {
    const s = makeStation({ brand: '', address: 'AVENIDA MARITIMA' });
    expect(matchesQuery(s, 'maritima')).toBe(true);
  });

  it('treats regex-special characters literally without throwing', () => {
    expect(() => matchesQuery(station, '(')).not.toThrow();
    expect(() => matchesQuery(station, '+')).not.toThrow();
    expect(() => matchesQuery(station, '.')).not.toThrow();
    expect(matchesQuery(station, '(')).toBe(false);
    expect(matchesQuery(station, '+')).toBe(false);
  });

  it('does not treat "." as a wildcard', () => {
    expect(matchesQuery(station, 'c.psa')).toBe(false);
    expect(matchesQuery(station, '.')).toBe(false);
  });

  it('does not match a token spanning a field boundary', () => {
    expect(matchesQuery(station, 'cepsacalle')).toBe(false);
    expect(matchesQuery(station, 'cepsa calle')).toBe(true);
    expect(matchesQuery(station, '12la')).toBe(false);
    expect(matchesQuery(station, 'lagunasan')).toBe(false);
  });
});
