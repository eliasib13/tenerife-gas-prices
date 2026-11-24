// Text matching for the station list search. Pure; no RegExp is built from user input.

import type { Station } from '../types';

// Lowercases, strips diacritics (NFD + combining marks), trims and collapses whitespace.
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')
    .join(' ');
}

// AND of tokens: every whitespace-separated token of the query must be a substring of the
// normalized searchable fields (brand, address, locality, municipality, postal code).
export function matchesQuery(station: Station, query: string): boolean {
  const tokens = normalizeText(query).split(' ').filter((t) => t !== '');
  if (tokens.length === 0) return true;
  const haystack = normalizeText(
    [station.brand, station.address, station.locality, station.municipality, station.postalCode].join(' '),
  );
  return tokens.every((t) => haystack.includes(t));
}
