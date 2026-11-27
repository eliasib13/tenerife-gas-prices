// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  getTileStyles,
  defaultTileStyleId,
  resolveTileStyleId,
  OSM_ATTRIBUTION,
  TILE_STYLE_KEY,
  isTileStyleId,
  loadTileStyleId,
  saveTileStyleId,
  CARTO_MAX_NATIVE_ZOOM,
} from './tileStyles';
import type { StorageLike } from '../state/preferences';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

function styleById(styles: ReturnType<typeof getTileStyles>, id: string) {
  const s = styles.find((t) => t.id === id);
  if (!s) throw new Error(`missing style ${id}`);
  return s;
}

const keyed = () => getTileStyles('abc123');
const keyless = () => getTileStyles(undefined);

describe('tileStyles', () => {
  it('with a key lists voyager, positron, osm in that order with the keyed CARTO urls', () => {
    expect(keyed().map((s) => s.id)).toEqual(['voyager', 'positron', 'osm']);
    expect(styleById(keyed(), 'voyager').url).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=abc123',
    );
    const positron = styleById(keyed(), 'positron').url;
    expect(positron.startsWith('https://basemaps.cartocdn.com/')).toBe(true);
    expect(positron.endsWith('?key=abc123')).toBe(true);
    expect(styleById(keyed(), 'osm').url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(styleById(keyed(), 'osm').url).not.toContain('key=');
  });

  it('URL-encodes the key and trims surrounding whitespace', () => {
    const encoded = getTileStyles('a b&c');
    expect(styleById(encoded, 'voyager').url).toContain('?key=a%20b%26c');
    const trimmed = getTileStyles('  k  ');
    expect(styleById(trimmed, 'voyager').url).toBe(
      'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=k',
    );
  });

  it('without a key (undefined, null, empty, whitespace) offers only osm and never mentions cartocdn', () => {
    for (const key of [undefined, null, '', '   ']) {
      const styles = getTileStyles(key);
      expect(styles.map((s) => s.id)).toEqual(['osm']);
      expect(styles.some((s) => s.url.includes('cartocdn'))).toBe(false);
    }
    expect(keyless().map((s) => s.id)).toEqual(['osm']);
  });

  it('attributes OpenStreetMap on every style, CARTO only on CARTO styles, and exports the OSM attribution', () => {
    for (const s of keyed()) {
      expect(s.attribution).toContain('OpenStreetMap');
    }
    expect(styleById(keyed(), 'voyager').attribution).toContain('CARTO');
    expect(styleById(keyed(), 'positron').attribution).toContain('CARTO');
    expect(styleById(keyed(), 'osm').attribution).toContain('OpenStreetMap');
    expect(styleById(keyed(), 'osm').attribution).not.toContain('CARTO');
    expect(OSM_ATTRIBUTION).toBe(styleById(keyed(), 'osm').attribution);
  });

  it('gives every style a unique non-empty label, osm subdomains abc, CARTO styles no subdomains', () => {
    const labels = keyed().map((s) => s.label);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    expect(styleById(keyed(), 'osm').subdomains).toBe('abc');
    expect(styleById(keyed(), 'voyager').subdomains).toBeUndefined();
    expect(styleById(keyed(), 'positron').subdomains).toBeUndefined();
  });

  it('CARTO styles have maxNativeZoom 18 and maxZoom 19 (CARTO serves raster tiles only to z18)', () => {
    expect(CARTO_MAX_NATIVE_ZOOM).toBe(18);
    for (const id of ['voyager', 'positron']) {
      const s = styleById(keyed(), id);
      expect(s.maxNativeZoom).toBe(18);
      expect(s.maxNativeZoom).toBe(CARTO_MAX_NATIVE_ZOOM);
      expect(s.maxZoom).toBe(19);
    }
  });

  it('osm has maxZoom 19 and no maxNativeZoom property, with or without a key', () => {
    for (const styles of [keyed(), keyless()]) {
      const osm = styleById(styles, 'osm');
      expect(osm.maxZoom).toBe(19);
      expect(osm.maxNativeZoom).toBeUndefined();
      expect('maxNativeZoom' in osm).toBe(false);
    }
  });

  it('defaultTileStyleId is voyager with a key and osm without', () => {
    expect(defaultTileStyleId(keyed())).toBe('voyager');
    expect(defaultTileStyleId(keyless())).toBe('osm');
  });

  it('resolveTileStyleId keeps an available stored id and falls back otherwise', () => {
    expect(resolveTileStyleId('osm', keyed())).toBe('osm');
    expect(resolveTileStyleId('positron', keyed())).toBe('positron');
    expect(resolveTileStyleId('voyager', keyless())).toBe('osm');
    expect(resolveTileStyleId('bogus', keyed())).toBe('voyager');
    expect(resolveTileStyleId(null, keyed())).toBe('voyager');
    expect(resolveTileStyleId(3, keyed())).toBe('voyager');
    expect(resolveTileStyleId(undefined, keyless())).toBe('osm');
  });

  it('loadTileStyleId falls back to the default for null storage, empty storage and throwing getItem', () => {
    expect(loadTileStyleId(null, keyed())).toBe('voyager');
    expect(loadTileStyleId(memoryStorage(), keyed())).toBe('voyager');
    expect(loadTileStyleId(null, keyless())).toBe('osm');
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadTileStyleId(throwing, keyed())).toBe('voyager');
    expect(loadTileStyleId(throwing, keyless())).toBe('osm');
  });

  it('loadTileStyleId honours a stored osm with a key, and maps a stored voyager to osm without a key', () => {
    expect(loadTileStyleId(memoryStorage({ [TILE_STYLE_KEY]: 'osm' }), keyed())).toBe('osm');
    expect(loadTileStyleId(memoryStorage({ [TILE_STYLE_KEY]: 'voyager' }), keyless())).toBe('osm');
  });

  it('loadTileStyleId reads exactly the key tgp:map-style:v1', () => {
    const storage = memoryStorage({ [TILE_STYLE_KEY]: 'positron' });
    const spy = vi.spyOn(storage, 'getItem');
    expect(loadTileStyleId(storage, keyed())).toBe('positron');
    expect(spy).toHaveBeenCalledWith('tgp:map-style:v1');
    expect(TILE_STYLE_KEY).toBe('tgp:map-style:v1');
  });

  it('loadTileStyleId never writes to storage when falling back', () => {
    const storage = memoryStorage({ [TILE_STYLE_KEY]: 'voyager' });
    const spy = vi.spyOn(storage, 'setItem');
    loadTileStyleId(storage, keyless());
    expect(spy).not.toHaveBeenCalled();
  });

  it('isTileStyleId accepts only the three ids', () => {
    expect(isTileStyleId('voyager')).toBe(true);
    expect(isTileStyleId('positron')).toBe(true);
    expect(isTileStyleId('osm')).toBe(true);
    expect(isTileStyleId('')).toBe(false);
    expect(isTileStyleId('VOYAGER')).toBe(false);
    expect(isTileStyleId(null)).toBe(false);
    expect(isTileStyleId(3)).toBe(false);
    expect(isTileStyleId(undefined)).toBe(false);
  });

  it('saveTileStyleId writes the raw id under the key and round-trips', () => {
    const storage = memoryStorage();
    saveTileStyleId(storage, 'positron');
    expect(storage.data.get('tgp:map-style:v1')).toBe('positron');
    expect(loadTileStyleId(storage, keyed())).toBe('positron');
  });

  it('saveTileStyleId does not throw for null storage', () => {
    expect(() => saveTileStyleId(null, 'osm')).not.toThrow();
  });

  it('saveTileStyleId swallows setItem errors', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(() => saveTileStyleId(storage, 'osm')).not.toThrow();
  });
});
