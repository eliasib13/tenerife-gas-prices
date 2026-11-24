import type { PriceTier, SortBy, StationListItem } from '../types';

export function makeTierFn(prices: number[]): (price: number) => PriceTier {
  const sorted = [...prices].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0 || sorted[0] === sorted[n - 1]) {
    return () => 'mid';
  }
  const q1 = sorted[Math.floor((n - 1) / 3)] ?? 0;
  const q2 = sorted[Math.floor((2 * (n - 1)) / 3)] ?? 0;
  return (price: number): PriceTier => {
    if (price <= q1) return 'cheap';
    if (price > q2) return 'expensive';
    return 'mid';
  };
}

function compareDistance(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareIdAndBrand(a: StationListItem, b: StationListItem): number {
  const brand = a.station.brand.localeCompare(b.station.brand);
  if (brand !== 0) return brand;
  return a.station.id < b.station.id ? -1 : a.station.id > b.station.id ? 1 : 0;
}

function compareId(a: StationListItem, b: StationListItem): number {
  return a.station.id < b.station.id ? -1 : a.station.id > b.station.id ? 1 : 0;
}

export function sortItems(items: StationListItem[], sortBy: SortBy): StationListItem[] {
  const copy = [...items];
  if (sortBy === 'price') {
    return copy.sort(
      (a, b) =>
        a.price - b.price ||
        compareDistance(a.distanceKm, b.distanceKm) ||
        compareIdAndBrand(a, b),
    );
  }
  return copy.sort(
    (a, b) =>
      compareDistance(a.distanceKm, b.distanceKm) ||
      a.price - b.price ||
      compareId(a, b),
  );
}
