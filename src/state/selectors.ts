import { FUELS } from '../fuels';
import { haversineKm } from '../domain/geo';
import { openStatus } from '../domain/hours';
import { makeTierFn, sortItems } from '../domain/ranking';
import { formatPriceShort } from '../domain/format';
import { matchesQuery } from '../domain/search';
import type {
  AppState,
  FuelDef,
  FuelId,
  MarkerViewModel,
  SortBy,
  Station,
  StationListItem,
} from '../types';

export function availableFuels(stations: Station[], selected: FuelId): FuelDef[] {
  return FUELS.filter(
    (f) => f.id === selected || stations.some((s) => s.prices[f.id] !== undefined),
  );
}

export function effectiveSort(s: AppState): SortBy {
  return s.sortBy === 'distance' && s.geo.position === null ? 'price' : s.sortBy;
}

export function listItems(s: AppState): StationListItem[] {
  const priced: { station: Station; price: number }[] = [];
  for (const station of s.stations) {
    const price = station.prices[s.fuel];
    if (price !== undefined) priced.push({ station, price });
  }
  // Tiers and the cheapest price are computed over all stations priced for the fuel,
  // so they stay stable while the query changes; the query only filters the rows.
  const prices = priced.map((p) => p.price);
  const tierOf = makeTierFn(prices);
  const min = prices.length ? Math.min(...prices) : 0;
  const pos = s.geo.position;
  const favs = new Set(s.favorites);
  const matching = priced.filter(
    ({ station }) =>
      (s.scope !== 'favorites' || favs.has(station.id)) && matchesQuery(station, s.query),
  );
  const items: StationListItem[] = matching.map(({ station, price }) => ({
    station,
    price,
    distanceKm: pos ? haversineKm(pos, { lat: station.lat, lon: station.lon }) : null,
    tier: tierOf(price),
    isCheapest: price === min,
    openState: openStatus(station.hours, s.now),
    favorite: favs.has(station.id),
  }));
  return sortItems(items, effectiveSort(s));
}

export function markerModels(items: StationListItem[], selectedId: string | null): MarkerViewModel[] {
  return items.map((i) => ({
    id: i.station.id,
    lat: i.station.lat,
    lon: i.station.lon,
    label: formatPriceShort(i.price),
    tier: i.tier,
    selected: i.station.id === selectedId,
    cheapest: i.isCheapest,
  }));
}

export function selectedStation(s: AppState): Station | null {
  if (s.selectedId === null) return null;
  return s.stations.find((st) => st.id === s.selectedId) ?? null;
}
