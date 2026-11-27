// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createStore, initialState } from './store';

describe('createStore', () => {
  it('getState returns the initial state', () => {
    const initial = { a: 1, b: 'x' };
    const store = createStore(initial);
    expect(store.getState()).toEqual({ a: 1, b: 'x' });
  });

  it('setState notifies with (new, prev), creates a new object and keeps other keys', () => {
    const store = createStore({ a: 1, b: 'x' });
    const fn = vi.fn();
    store.subscribe(fn);
    const prev = store.getState();
    store.setState({ a: 2 });
    const next = store.getState();
    expect(next).toEqual({ a: 2, b: 'x' });
    expect(next).not.toBe(prev);
    expect(prev).toEqual({ a: 1, b: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toBe(next);
    expect(fn.mock.calls[0]![1]).toBe(prev);
  });

  it('a function patch receives the current state', () => {
    const store = createStore({ a: 1, b: 'x' });
    const seen: unknown[] = [];
    store.setState((s) => {
      seen.push(s);
      return { a: s.a + 10 };
    });
    expect(seen).toEqual([{ a: 1, b: 'x' }]);
    expect(store.getState()).toEqual({ a: 11, b: 'x' });
  });

  it('a no-op patch does not notify', () => {
    const store = createStore({ a: 1, b: 'x' });
    const fn = vi.fn();
    store.subscribe(fn);
    const before = store.getState();
    store.setState({ a: 1 });
    store.setState({});
    store.setState(() => ({ b: 'x' }));
    expect(fn).not.toHaveBeenCalled();
    expect(store.getState()).toBe(before);
  });

  it('notifies when only one of several keys changes', () => {
    const store = createStore({ a: 1, b: 'x' });
    const fn = vi.fn();
    store.subscribe(fn);
    store.setState({ a: 1, b: 'y' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('an unsubscribed listener is not called and unsubscribing twice is safe', () => {
    const store = createStore({ a: 1 });
    const gone = vi.fn();
    const kept = vi.fn();
    const unsub = store.subscribe(gone);
    store.subscribe(kept);
    unsub();
    expect(() => unsub()).not.toThrow();
    store.setState({ a: 2 });
    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });
});

describe('initialState', () => {
  const now = new Date('2026-11-23T10:00:00Z');

  it('uses the specified defaults', () => {
    const s = initialState({}, now, true);
    expect(s).toEqual({
      status: 'loading',
      refreshing: false,
      lastError: null,
      stations: [],
      sourceDate: null,
      fetchedAt: null,
      dataSource: null,
      online: true,
      fuel: 'g95',
      sortBy: 'distance',
      scope: 'all',
      favorites: [],
      geo: { status: 'pending', position: null, accuracyM: null },
      selectedId: null,
      sheet: 'peek',
      query: '',
      now,
    });
  });

  it('defaults scope to all and favorites to an empty list', () => {
    const s = initialState({}, now, true);
    expect(s.scope).toBe('all');
    expect(s.favorites).toEqual([]);
  });

  it('applies a favorites scope from the preferences', () => {
    expect(initialState({ scope: 'favorites' }, now, true).scope).toBe('favorites');
  });

  it('applies scope all from the preferences', () => {
    expect(initialState({ scope: 'all' }, now, true).scope).toBe('all');
  });

  it('stores the favorites passed as the fourth argument', () => {
    const s = initialState({}, now, true, ['a1', 'b2']);
    expect(s.favorites).toEqual(['a1', 'b2']);
  });

  it('keeps an empty query when favorites are passed', () => {
    expect(initialState({ scope: 'favorites' }, now, true, ['a1']).query).toBe('');
  });

  it('passes online and now through', () => {
    const s = initialState({}, now, false);
    expect(s.online).toBe(false);
    expect(s.now).toBe(now);
  });

  it('starts with an empty query, with or without preferences', () => {
    expect(initialState({}, now, true).query).toBe('');
    expect(initialState({ fuel: 'diesel', sortBy: 'price' }, now, false).query).toBe('');
  });

  it('respects the preferences', () => {
    const s = initialState({ fuel: 'diesel', sortBy: 'price' }, now, true);
    expect(s.fuel).toBe('diesel');
    expect(s.sortBy).toBe('price');
  });
});
