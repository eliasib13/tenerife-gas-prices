import type { StorageLike } from '../state/preferences';

export type TileStyleId = 'voyager' | 'positron' | 'osm';

export interface TileStyle {
  id: TileStyleId;
  label: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
  maxNativeZoom?: number;
}

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = ` &copy; <a href="https://carto.com/attributions">CARTO</a>`;

/** CARTO raster basemaps serve tiles only up to z18; higher zooms upscale z18. */
export const CARTO_MAX_NATIVE_ZOOM = 18;

export const TILE_STYLE_KEY = 'tgp:map-style:v1';

export function getTileStyles(cartoKey?: string | null): readonly TileStyle[] {
  const osm: TileStyle = {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    subdomains: 'abc',
    maxZoom: 19,
  };
  const key = (cartoKey ?? '').trim();
  if (!key) return [osm];
  const q = `?key=${encodeURIComponent(key)}`;
  return [
    {
      id: 'voyager',
      label: 'Callejero (Voyager)',
      url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png${q}`,
      attribution: OSM_ATTRIBUTION + CARTO_ATTRIBUTION,
      maxZoom: 19,
      maxNativeZoom: CARTO_MAX_NATIVE_ZOOM,
    },
    {
      id: 'positron',
      label: 'Claro (Positron)',
      url: `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png${q}`,
      attribution: OSM_ATTRIBUTION + CARTO_ATTRIBUTION,
      maxZoom: 19,
      maxNativeZoom: CARTO_MAX_NATIVE_ZOOM,
    },
    osm,
  ];
}

export function isTileStyleId(v: unknown): v is TileStyleId {
  return v === 'voyager' || v === 'positron' || v === 'osm';
}

export function defaultTileStyleId(styles: readonly TileStyle[]): TileStyleId {
  return styles[0]?.id ?? 'osm';
}

export function resolveTileStyleId(stored: unknown, styles: readonly TileStyle[]): TileStyleId {
  return isTileStyleId(stored) && styles.some((s) => s.id === stored)
    ? stored
    : defaultTileStyleId(styles);
}

export function loadTileStyleId(storage: StorageLike | null, styles: readonly TileStyle[]): TileStyleId {
  try {
    if (!storage) return defaultTileStyleId(styles);
    return resolveTileStyleId(storage.getItem(TILE_STYLE_KEY), styles);
  } catch {
    return defaultTileStyleId(styles);
  }
}

export function saveTileStyleId(storage: StorageLike | null, id: TileStyleId): void {
  try {
    storage?.setItem(TILE_STYLE_KEY, id);
  } catch {
    /* ignore */
  }
}
