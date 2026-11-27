export type FuelId =
  | 'g95' | 'diesel' | 'g98' | 'dieselPremium' | 'dieselRenewable'
  | 'lpg' | 'g95Premium' | 'cng' | 'adblue';

export interface FuelDef { id: FuelId; apiField: string; label: string; shortLabel: string; }
export interface LatLon { lat: number; lon: number; }

export interface Station {
  id: string;              // IDEESS
  brand: string;           // Rótulo trimmed ('' allowed; UI shows strings.unbranded)
  address: string;         // Dirección
  locality: string;        // Localidad
  municipality: string;    // Municipio
  municipalityId: string;  // IDMunicipio
  postalCode: string;      // C.P.
  lat: number;
  lon: number;
  hours: string;           // Horario raw
  prices: Partial<Record<FuelId, number>>; // only fuels sold, EUR/litre (AdBlue EUR/litre too)
}

export interface StationsResult { stations: Station[]; sourceDate: Date | null; fetchedAt: Date; }

export type PriceTier = 'cheap' | 'mid' | 'expensive';
export type SortBy = 'distance' | 'price';
export type ListScope = 'all' | 'favorites';
export type FetchErrorKind = 'offline' | 'timeout' | 'http' | 'network' | 'invalid';
export type GeoStatus = 'pending' | 'ok' | 'denied' | 'unavailable' | 'unsupported';
export type SheetSnap = 'peek' | 'half' | 'full';
export type OpenState = 'open' | 'closed' | 'unknown';

export interface GeoState { status: GeoStatus; position: LatLon | null; accuracyM: number | null; }

export interface AppState {
  status: 'loading' | 'ready' | 'error'; // 'error' ONLY when no stations have ever loaded
  refreshing: boolean;
  lastError: FetchErrorKind | null;      // error of the most recent attempt (null after success)
  stations: Station[];
  sourceDate: Date | null;
  fetchedAt: Date | null;
  dataSource: 'live' | 'cache' | null;   // where `stations` came from; null while nothing is loaded
  online: boolean;
  fuel: FuelId;
  sortBy: SortBy;                        // user preference; see selectors.effectiveSort
  scope: ListScope;                      // user preference: all stations or favorites only
  favorites: string[];                   // favorited station ids (IDEESS); persisted separately
  geo: GeoState;
  selectedId: string | null;
  sheet: SheetSnap;
  query: string;                         // list search text; session-only, not persisted
  now: Date;                            // ticks every 30 s for relative times / open status
}

export interface StationListItem {
  station: Station;
  price: number;              // price of the selected fuel
  distanceKm: number | null;  // null when no user position
  tier: PriceTier;
  isCheapest: boolean;        // price === min price among items
  openState: OpenState;
  favorite: boolean;          // station id is in AppState.favorites
}

export interface MarkerViewModel {
  id: string; lat: number; lon: number;
  label: string;              // formatted price without unit, e.g. "1,529"
  tier: PriceTier; selected: boolean; cheapest: boolean;
}

export interface Component<P> { el: HTMLElement; update(props: P): void; }
