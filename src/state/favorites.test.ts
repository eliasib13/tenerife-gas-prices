// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { FAVORITES_KEY, loadFavorites, saveFavorites, toggleFavorite } from './favorites';
import type { StorageLike } from './preferences';

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

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('boom');
    },
    setItem: () => {
      throw new Error('boom');
    },
    removeItem: () => {
      throw new Error('boom');
    },
  };
}

describe('favorites storage', () => {
  it('uses the key tgp:favorites:v1', () => {
    expect(FAVORITES_KEY).toBe('tgp:favorites:v1');
  });

  describe('loadFavorites', () => {
    it('returns [] for null storage', () => {
      expect(loadFavorites(null)).toEqual([]);
    });

    it('returns [] for a missing key', () => {
      expect(loadFavorites(memoryStorage())).toEqual([]);
    });

    it('returns [] for invalid JSON', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '{not json' }))).toEqual([]);
    });

    it('returns [] when the stored JSON is an object', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual([]);
    });

    it('returns [] when the stored JSON is a number', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '42' }))).toEqual([]);
    });

    it('returns [] when the stored JSON is a string', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '"abc"' }))).toEqual([]);
    });

    it('returns [] when the stored JSON is null', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: 'null' }))).toEqual([]);
    });

    it('returns the ids in the same order for a valid array', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '["a","b"]' }))).toEqual(['a', 'b']);
    });

    it('drops entries that are not non-empty strings', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '["a",1,null,"",{},"b"]' }))).toEqual(['a', 'b']);
    });

    it('removes duplicates keeping the first occurrence', () => {
      expect(loadFavorites(memoryStorage({ [FAVORITES_KEY]: '["a","a","b"]' }))).toEqual(['a', 'b']);
    });

    it('returns [] when getItem throws', () => {
      expect(loadFavorites(throwingStorage())).toEqual([]);
    });
  });

  describe('saveFavorites', () => {
    it('writes exactly JSON.stringify(ids) under the key', () => {
      const st = memoryStorage();
      saveFavorites(st, ['12345', '678']);
      expect(st.data.get(FAVORITES_KEY)).toBe(JSON.stringify(['12345', '678']));
      expect(st.data.get(FAVORITES_KEY)).toBe('["12345","678"]');
    });

    it('round-trips with loadFavorites', () => {
      const st = memoryStorage();
      saveFavorites(st, ['x', 'y', 'z']);
      expect(loadFavorites(st)).toEqual(['x', 'y', 'z']);
    });

    it('does not throw when setItem throws', () => {
      expect(() => saveFavorites(throwingStorage(), ['a'])).not.toThrow();
    });

    it('does not throw with null storage', () => {
      expect(() => saveFavorites(null, ['a'])).not.toThrow();
    });
  });

  describe('toggleFavorite', () => {
    it('appends an absent id and returns a new array', () => {
      const input = ['a', 'b'];
      const out = toggleFavorite(input, 'c');
      expect(out).toEqual(['a', 'b', 'c']);
      expect(out).not.toBe(input);
    });

    it('does not mutate the input array', () => {
      const input = ['a', 'b'];
      toggleFavorite(input, 'c');
      toggleFavorite(input, 'a');
      expect(input).toEqual(['a', 'b']);
    });

    it('removes a present id', () => {
      expect(toggleFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    });

    it('toggling twice restores the original contents', () => {
      const input = ['a', 'b'];
      const once = toggleFavorite(input, 'z');
      const twice = toggleFavorite(once, 'z');
      expect(twice).toEqual(['a', 'b']);
    });

    it('preserves the order of the other ids when removing', () => {
      expect(toggleFavorite(['q', 'w', 'e', 'r'], 'w')).toEqual(['q', 'e', 'r']);
    });

    it('works on an empty array', () => {
      expect(toggleFavorite([], 'a')).toEqual(['a']);
    });
  });
});
