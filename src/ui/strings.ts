import type { FetchErrorKind } from '../types';

const ERROR_TEXTS: Record<FetchErrorKind, string> = {
  timeout: 'El servicio de precios tardó demasiado en responder.',
  http: 'El servicio de precios devolvió un error.',
  network: 'No se pudo conectar con el servicio de precios.',
  invalid: 'El servicio de precios envió datos inesperados.',
  offline: 'Sin conexión.',
};

export const S = {
  appName: 'Gasolineras Tenerife',
  locate: 'Mi ubicación',
  refresh: 'Actualizar precios',
  retry: 'Reintentar',
  loading: 'Cargando precios en directo…',
  loadFailed: 'No se pudieron cargar los precios.',
  errorText: (kind: FetchErrorKind): string => ERROR_TEXTS[kind],
  updated: (when: string, rel: string): string => `Precios: ${when} · comprobado ${rel}`,
  offlineWithData: (when: string): string => `Sin conexión. Mostrando precios guardados (${when}).`,
  offlineNoData: 'Sin conexión. Conéctate para cargar los precios en directo.',
  staleData: (errText: string, when: string): string => `${errText} Mostrando precios guardados (${when}).`,
  cachedLoading: (when: string): string => `Precios guardados (${when}). Actualizando…`,
  cachedData: (when: string): string => `Precios guardados (${when}). Puede que no estén actualizados.`,
  locationDenied: 'Ubicación desactivada: ordenadas por precio.',
  locationPending: 'Buscando tu ubicación…',
  locationDeniedHelp:
    'El permiso de ubicación está desactivado. Actívalo en los ajustes del navegador para ver las gasolineras cercanas.',
  sortNearest: 'Más cercanas',
  sortCheapest: 'Más baratas',
  stationsCount: (n: number, fuel: string): string =>
    n === 1 ? `1 gasolinera · ${fuel}` : `${n} gasolineras · ${fuel}`,
  noStationsForFuel: (fuel: string): string => `Ninguna gasolinera vende ${fuel}.`,
  unbranded: 'Gasolinera sin marca',
  cheapest: 'La más barata',
  open: 'Abierta ahora',
  closed: 'Cerrada',
  open24h: 'Abierta 24 h',
  back: 'Volver',
  backToList: 'Volver a la lista',
  navigateGoogle: 'Cómo llegar (Google Maps)',
  navigateApple: 'Cómo llegar (Apple Maps)',
  sheetHandle: 'Cambiar tamaño del panel',
  sheetLabel: 'Gasolineras',
  fuelFilterLabel: 'Tipo de combustible',
} as const;
