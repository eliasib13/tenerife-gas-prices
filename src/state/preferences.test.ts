// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { loadPrefs, savePrefs, PREFS_KEY } from './preferences';
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

describe('preferences', () => {
  it('uses the key tgp:prefs:v1', () => {
    expect(PREFS_KEY).toBe('tgp:prefs:v1');
  });

  it('round-trips save then load', () => {
    const st = memoryStorage();
    savePrefs(st, { fuel: 'diesel', sortBy: 'price' });
    expect(JSON.parse(st.data.get('tgp:prefs:v1')!)).toEqual({ fuel: 'diesel', sortBy: 'price' });
    expect(loadPrefs(st)).toEqual({ fuel: 'diesel', sortBy: 'price' });
  });

  it('loadPrefs returns {} for null storage', () => {
    expect(loadPrefs(null)).toEqual({});
  });

  it('loadPrefs returns {} for a missing key', () => {
    expect(loadPrefs(memoryStorage())).toEqual({});
  });

  it('loadPrefs returns {} for bad JSON', () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': '{bad json' }))).toEqual({});
  });

  it("loadPrefs returns {} for the value 'null'", () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': 'null' }))).toEqual({});
  });

  it('drops invalid fields', () => {
    const st = memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ fuel: 'kerosene', sortBy: 'price' }) });
    expect(loadPrefs(st)).toEqual({ sortBy: 'price' });
  });

  it('drops an invalid sortBy and keeps a valid fuel', () => {
    const st = memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ fuel: 'g98', sortBy: 'speed' }) });
    expect(loadPrefs(st)).toEqual({ fuel: 'g98' });
  });

  it('returns {} when getItem throws', () => {
    const st: StorageLike = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(loadPrefs(st)).toEqual({});
  });

  it('savePrefs does not throw when setItem throws or storage is null', () => {
    const st: StorageLike = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('full');
      }),
      removeItem: vi.fn(),
    };
    expect(() => savePrefs(st, { fuel: 'g95', sortBy: 'distance' })).not.toThrow();
    expect(st.setItem).toHaveBeenCalled();
    expect(() => savePrefs(null, { fuel: 'g95', sortBy: 'distance' })).not.toThrow();
  });
});

describe('preferences: mutation hardening', () => {
  it.each([['[]'], ['null'], ['"x"'], ['5'], ['true'], ['[{"fuel":"g95"}]']])('loadPrefs(%s) is {}', (raw) => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': raw }))).toEqual({});
  });

  it('keeps a valid sortBy distance and price', () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ sortBy: 'price' }) }))).toEqual({ sortBy: 'price' });
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ sortBy: 'distance' }) }))).toEqual({ sortBy: 'distance' });
  });

  it('keeps a valid fuel alone', () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ fuel: 'g98' }) }))).toEqual({ fuel: 'g98' });
  });
});

describe('preferences: list scope', () => {
  it('loadPrefs keeps scope favorites', () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ scope: 'favorites' }) }))).toEqual({
      scope: 'favorites',
    });
  });

  it('loadPrefs keeps scope all', () => {
    expect(loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ scope: 'all' }) }))).toEqual({ scope: 'all' });
  });

  it('loadPrefs drops an unknown string scope and keeps valid fuel and sortBy', () => {
    const st = memoryStorage({
      'tgp:prefs:v1': JSON.stringify({ fuel: 'g98', sortBy: 'price', scope: 'bogus' }),
    });
    expect(loadPrefs(st)).toEqual({ fuel: 'g98', sortBy: 'price' });
  });

  it('loadPrefs drops a non-string scope', () => {
    const st = memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ fuel: 'g98', scope: 5 }) });
    expect(loadPrefs(st)).toEqual({ fuel: 'g98' });
  });

  it('loadPrefs of an old blob without scope has no scope key', () => {
    const out = loadPrefs(memoryStorage({ 'tgp:prefs:v1': JSON.stringify({ fuel: 'g95', sortBy: 'distance' }) }));
    expect(out).toEqual({ fuel: 'g95', sortBy: 'distance' });
    expect('scope' in out).toBe(false);
  });

  it('savePrefs with scope persists it and loadPrefs round-trips it', () => {
    const st = memoryStorage();
    savePrefs(st, { fuel: 'g95', sortBy: 'distance', scope: 'favorites' });
    expect(JSON.parse(st.data.get('tgp:prefs:v1')!)).toEqual({
      fuel: 'g95',
      sortBy: 'distance',
      scope: 'favorites',
    });
    expect(loadPrefs(st)).toEqual({ fuel: 'g95', sortBy: 'distance', scope: 'favorites' });
  });

  it('savePrefs without scope writes no scope key', () => {
    const st = memoryStorage();
    savePrefs(st, { fuel: 'g95', sortBy: 'distance' });
    const raw = JSON.parse(st.data.get('tgp:prefs:v1')!);
    expect('scope' in raw).toBe(false);
    expect(raw).toEqual({ fuel: 'g95', sortBy: 'distance' });
  });
});
