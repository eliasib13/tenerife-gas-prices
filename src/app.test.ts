import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { App, AppDeps } from './app';
import { FetchError } from './data/api';
import { formatWhen } from './domain/time';
import { formatDistance } from './domain/format';
import { haversineKm } from './domain/geo';
import { loadCachedStations, saveCachedStations } from './state/stationCache';
import { PREFS_KEY } from './state/preferences';
import { S } from './ui/strings';
import { makeStation } from './test/factories';
import type { FetchErrorKind, MarkerViewModel, Station, StationsResult } from './types';

const START = new Date('2026-11-23T23:00:00Z');
const SOURCE_DATE = new Date('2026-11-23T22:36:13Z');

const stA = makeStation({ id: 'A', brand: 'ALFA', lat: 28.1, lon: -16.7, prices: { g95: 1.5 } });
const stB = makeStation({ id: 'B', brand: 'BETA', lat: 28.3, lon: -16.4, prices: { g95: 1.4 } });
const stC = makeStation({ id: 'C', brand: 'CEPSA', lat: 28.2, lon: -16.5, prices: { diesel: 1.6 } });

function result(stations: Station[]): StationsResult {
  return { stations, sourceDate: SOURCE_DATE, fetchedAt: new Date(Date.now()) };
}

function fetchError(kind: FetchErrorKind): Error {
  const e = Object.create(FetchError.prototype) as { kind: FetchErrorKind; message: string; name: string };
  e.kind = kind;
  e.message = kind;
  e.name = 'FetchError';
  return e as unknown as Error;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: vi.fn((k: string, v: string) => {
      m.set(k, v);
    }),
    removeItem: (k: string) => {
      m.delete(k);
    },
    map: m,
  };
}

interface Harness {
  app: App;
  root: HTMLElement;
  fetchStations: ReturnType<typeof vi.fn>;
  map: Record<string, ReturnType<typeof vi.fn>>;
  createMapView: ReturnType<typeof vi.fn>;
  mapContainerState: { connectedUnderRoot: boolean | null; childCountAtCall: number | null };
  markerClick: (id: string) => void;
  geo: {
    success: (lat: number, lon: number, acc?: number) => void;
    error: (code: number) => void;
    clearWatch: ReturnType<typeof vi.fn>;
    watchPosition: ReturnType<typeof vi.fn>;
  };
  storage: ReturnType<typeof memoryStorage>;
  win: EventTarget;
  doc: EventTarget & { visibilityState: string };
}

let current: Harness | null = null;
let rafQueue: FrameRequestCallback[] = [];

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

function setup(opts: {
  fetch?: () => Promise<StationsResult>;
  storage?: ReturnType<typeof memoryStorage> | null;
  prepare?: (storage: ReturnType<typeof memoryStorage>) => void;
  online?: boolean;
} = {}): Harness {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  if (storage && opts.prepare) opts.prepare(storage);
  let markerCb: (id: string) => void = () => {};
  const map: Record<string, ReturnType<typeof vi.fn>> = {
    setStations: vi.fn(),
    setUserPosition: vi.fn(),
    focus: vi.fn(),
    fitTenerife: vi.fn(),
    onMarkerClick: vi.fn((cb: (id: string) => void) => {
      markerCb = cb;
    }),
    invalidateSize: vi.fn(),
    destroy: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 28.2, lon: -16.5 })),
    getZoom: vi.fn(() => 10),
  };
  const fetchStations = vi.fn(opts.fetch ?? (() => Promise.resolve(result([stA, stB, stC]))));
  let onOk: (p: unknown) => void = () => {};
  let onErr: (e: unknown) => void = () => {};
  const clearWatch = vi.fn();
  const watchPosition = vi.fn((ok: (p: unknown) => void, err: (e: unknown) => void) => {
    onOk = ok;
    onErr = err;
    return 7;
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const mapContainerState: Harness['mapContainerState'] = { connectedUnderRoot: null, childCountAtCall: null };
  const createMapViewMock = vi.fn((el: HTMLElement, _opts?: unknown) => {
    mapContainerState.connectedUnderRoot = el.isConnected && el.parentElement === root;
    mapContainerState.childCountAtCall = root.children.length;
    return map as unknown as ReturnType<AppDeps['createMapView']>;
  });
  const deps = {
    root,
    fetchStations,
    geolocation: { watchPosition, clearWatch, getCurrentPosition: vi.fn() } as unknown as Geolocation,
    createMapView: createMapViewMock,
    storage,
    now: () => new Date(Date.now()),
    isOnline: () => opts.online ?? true,
    win,
    doc,
    platform: 'other' as const,
  } satisfies AppDeps;
  const app = createApp(deps);
  current = {
    app,
    root,
    fetchStations,
    map,
    createMapView: createMapViewMock,
    mapContainerState,
    markerClick: (id) => markerCb(id),
    geo: {
      success: (lat, lon, acc = 20) =>
        onOk({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: Date.now() }),
      error: (code) => onErr({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
      clearWatch,
      watchPosition,
    },
    storage: storage as ReturnType<typeof memoryStorage>,
    win,
    doc,
  };
  return current;
}

const rows = (h: Harness) => Array.from(h.root.querySelectorAll('.station-row'));
const banner = (h: Harness) => h.root.querySelector('.banner') as HTMLElement;
const btn = (h: Harness, text: string) =>
  Array.from(h.root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const byLabel = (h: Harness, label: string) =>
  h.root.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
const lastMarkers = (h: Harness) => {
  const calls = h.map.setStations!.mock.calls;
  return calls[calls.length - 1]![0] as MarkerViewModel[];
};
const seedCache = (storage: ReturnType<typeof memoryStorage>, stations: Station[] = [stA, stB]) => {
  saveCachedStations(storage, { stations, sourceDate: SOURCE_DATE, fetchedAt: new Date('2026-11-23T22:40:00Z') });
};
const cachedWhen = () => formatWhen(SOURCE_DATE, new Date(Date.now()));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  rafQueue = [];
  const raf = (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  vi.stubGlobal('requestAnimationFrame', raf);
  (window as unknown as { requestAnimationFrame: typeof raf }).requestAnimationFrame = raf;
});

afterEach(() => {
  current?.app.destroy();
  current?.root.remove();
  current = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createApp', () => {
  it('1. starts loading, then shows sorted stations and markers', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise });
    expect(h.app.store.getState().status).toBe('loading');
    expect(h.root.querySelector('.list-state')?.textContent).toContain(S.loading);
    expect(h.root.querySelector('.map')).not.toBeNull();
    expect(h.root.querySelector('.top-bar')).not.toBeNull();

    d.resolve(result([stA, stB, stC]));
    await flush();
    expect(h.app.store.getState().status).toBe('ready');
    const r = rows(h);
    expect(r).toHaveLength(2);
    expect(r[0]!.textContent).toContain('BETA');
    expect(r[1]!.textContent).toContain('ALFA');
    expect(lastMarkers(h)).toHaveLength(2);
  });

  it('2. failing first fetch shows error with Retry, and retry recovers', async () => {
    let fail = true;
    const h = setup({
      fetch: () => (fail ? Promise.reject(fetchError('network')) : Promise.resolve(result([stA, stB, stC]))),
    });
    await flush();
    expect(h.app.store.getState().status).toBe('error');
    const state = h.root.querySelector('.list-state')!;
    expect(state.textContent).toContain(S.loadFailed);
    expect(state.textContent).toContain(S.errorText('network'));
    fail = false;
    const calls = h.fetchStations.mock.calls.length;
    btn(h, S.retry).click();
    await flush();
    expect(h.fetchStations.mock.calls.length).toBe(calls + 1);
    expect(h.app.store.getState().status).toBe('ready');
    expect(rows(h)).toHaveLength(2);
  });

  it('3. refresh failure with data keeps stations and shows stale banner', async () => {
    const h = setup();
    await flush();
    h.fetchStations.mockImplementation(() => Promise.reject(fetchError('timeout')));
    await h.app.refresh();
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.stations).toHaveLength(3);
    expect(s.lastError).toBe('timeout');
    expect(banner(h).hidden).toBe(false);
    expect(banner(h).textContent).toContain(S.staleData(S.errorText('timeout'), cachedWhen()));
  });

  it('4. concurrent refresh calls fetch once', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise });
    expect(h.fetchStations).toHaveBeenCalledTimes(1);
    const p1 = h.app.refresh();
    const p2 = h.app.refresh();
    expect(h.fetchStations).toHaveBeenCalledTimes(1);
    d.resolve(result([stA, stB, stC]));
    await Promise.all([p1, p2]);
    expect(h.fetchStations).toHaveBeenCalledTimes(1);
    expect(h.app.store.getState().status).toBe('ready');
  });

  it('5. resets selectedId when the station disappears after refresh', async () => {
    const h = setup();
    await flush();
    h.markerClick('B');
    expect(h.app.store.getState().selectedId).toBe('B');
    h.fetchStations.mockImplementation(() => Promise.resolve(result([stA, stC])));
    await h.app.refresh();
    expect(h.app.store.getState().selectedId).toBeNull();
  });

  it('6. fuel chip sets fuel, persists it and re-sends markers', async () => {
    const h = setup();
    await flush();
    const before = h.map.setStations!.mock.calls.length;
    btn(h, 'Diésel').click();
    expect(h.app.store.getState().fuel).toBe('diesel');
    expect(JSON.parse(h.storage.getItem(PREFS_KEY)!).fuel).toBe('diesel');
    expect(h.map.setStations!.mock.calls.length).toBeGreaterThan(before);
    const vms = lastMarkers(h);
    expect(vms).toHaveLength(1);
    expect(vms[0]!.id).toBe('C');
  });

  it('7. initial state uses stored preferences', async () => {
    const h = setup({
      prepare: (st) => st.setItem(PREFS_KEY, JSON.stringify({ fuel: 'diesel', sortBy: 'price' })),
    });
    const s = h.app.store.getState();
    expect(s.fuel).toBe('diesel');
    expect(s.sortBy).toBe('price');
    await flush();
    expect(rows(h)).toHaveLength(1);
  });

  it('8. first geo fix inside Tenerife focuses once at zoom 13 and sorts by distance', async () => {
    const h = setup();
    await flush();
    expect(rows(h)[0]!.textContent).toContain('BETA');
    h.geo.success(28.1, -16.7, 15);
    const s = h.app.store.getState();
    expect(s.geo.status).toBe('ok');
    expect(s.geo.position).toEqual({ lat: 28.1, lon: -16.7 });
    expect(h.map.setUserPosition).toHaveBeenCalledWith({ lat: 28.1, lon: -16.7 }, 15);
    expect(h.map.focus).toHaveBeenCalledTimes(1);
    expect(h.map.focus).toHaveBeenCalledWith({ lat: 28.1, lon: -16.7 }, 13);
    expect(rows(h)[0]!.textContent).toContain('ALFA');

    h.geo.success(28.3, -16.4);
    expect(h.map.focus).toHaveBeenCalledTimes(1);
  });

  it('8b. a first fix outside Tenerife does not focus', async () => {
    const h = setup();
    await flush();
    h.geo.success(40.4, -3.7);
    expect(h.app.store.getState().geo.status).toBe('ok');
    expect(h.map.focus).not.toHaveBeenCalled();
  });

  it('9. geo denied disables Nearest and Locate shows a transient help banner', async () => {
    const h = setup();
    await flush();
    h.geo.error(1);
    expect(h.app.store.getState().geo.status).toBe('denied');
    expect(btn(h, S.sortNearest).disabled).toBe(true);
    expect(h.root.textContent).toContain(S.locationDenied);
    byLabel(h, S.locate).click();
    expect(banner(h).hidden).toBe(false);
    expect(banner(h).textContent).toContain(S.locationDeniedHelp);
    vi.advanceTimersByTime(6000);
    expect(banner(h).textContent ?? '').not.toContain(S.locationDeniedHelp);
  });

  it('10. Locate with a known position focuses at zoom 15', async () => {
    const h = setup();
    await flush();
    h.geo.success(28.1, -16.7);
    h.map.focus!.mockClear();
    byLabel(h, S.locate).click();
    expect(h.map.focus).toHaveBeenCalledWith({ lat: 28.1, lon: -16.7 }, 15);
  });

  it('10b. Locate with no fix and pending status does nothing', async () => {
    const h = setup();
    await flush();
    byLabel(h, S.locate).click();
    expect(h.map.focus).not.toHaveBeenCalled();
    expect(banner(h).textContent ?? '').not.toContain(S.locationDeniedHelp);
  });

  it('11. marker click opens the detail, raises the sheet, Back returns to list', async () => {
    const h = setup();
    await flush();
    expect(h.app.store.getState().sheet).toBe('peek');
    h.markerClick('B');
    const s = h.app.store.getState();
    expect(s.selectedId).toBe('B');
    expect(s.sheet).toBe('half');
    expect(h.root.querySelector('.sheet')!.classList.contains('sheet--half')).toBe(true);
    expect(h.root.querySelector('h2')!.textContent).toContain('BETA');
    expect(h.root.querySelector('.station-list')).toBeNull();
    btn(h, S.back).click();
    expect(h.app.store.getState().selectedId).toBeNull();
    expect(rows(h)).toHaveLength(2);
  });

  it('12. list row click selects and focuses the station', async () => {
    const h = setup();
    await flush();
    (rows(h)[0] as HTMLElement).click();
    const s = h.app.store.getState();
    expect(s.selectedId).toBe('B');
    expect(s.sheet).toBe('half');
    expect(h.map.focus).toHaveBeenCalledWith({ lat: stB.lat, lon: stB.lon });
    expect(h.root.querySelector('h2')!.textContent).toContain('BETA');
  });

  it('13. the 30 s tick updates now', async () => {
    const h = setup();
    await flush();
    const before = h.app.store.getState().now.getTime();
    vi.advanceTimersByTime(30000);
    const after = h.app.store.getState().now.getTime();
    expect(after - before).toBe(30000);
    expect(after).toBe(Date.now());
  });

  it('14. offline/online events', async () => {
    const h = setup();
    await flush();
    h.win.dispatchEvent(new Event('offline'));
    expect(h.app.store.getState().online).toBe(false);
    expect(banner(h).hidden).toBe(false);
    expect(banner(h).textContent).toContain(S.offlineWithData(cachedWhen()));

    // online with lastError -> refetch
    h.fetchStations.mockImplementationOnce(() => Promise.reject(fetchError('timeout')));
    await h.app.refresh();
    expect(h.app.store.getState().lastError).toBe('timeout');
    const calls = h.fetchStations.mock.calls.length;
    h.win.dispatchEvent(new Event('online'));
    expect(h.app.store.getState().online).toBe(true);
    expect(h.fetchStations.mock.calls.length).toBe(calls + 1);
    await flush();
    expect(h.app.store.getState().lastError).toBeNull();

    // online without error and live data -> no fetch
    const calls2 = h.fetchStations.mock.calls.length;
    h.win.dispatchEvent(new Event('online'));
    await flush();
    expect(h.fetchStations.mock.calls.length).toBe(calls2);
  });

  it('15. visibilitychange refreshes only when visible and data older than 30 min', async () => {
    const h = setup();
    await flush();
    const base = h.fetchStations.mock.calls.length;

    vi.advanceTimersByTime(5 * 60_000);
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base);

    vi.advanceTimersByTime(26 * 60_000); // now 31 min old
    h.doc.visibilityState = 'hidden';
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base);

    h.doc.visibilityState = 'visible';
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base + 1);
  });

  it('16. sheet snap change invalidates map size on the next animation frame', async () => {
    const h = setup();
    await flush();
    h.map.invalidateSize!.mockClear();
    rafQueue = [];
    (h.root.querySelector('.sheet__handle') as HTMLElement).click();
    expect(h.app.store.getState().sheet).toBe('half');
    expect(h.map.invalidateSize).not.toHaveBeenCalled();
    const queued = rafQueue.splice(0);
    expect(queued.length).toBeGreaterThan(0);
    queued.forEach((cb) => cb(0));
    expect(h.map.invalidateSize).toHaveBeenCalled();
  });

  it('17. a now tick does not call setStations again', async () => {
    const h = setup();
    await flush();
    h.map.setStations!.mockClear();
    h.map.setUserPosition!.mockClear();
    vi.advanceTimersByTime(30000);
    expect(h.map.setStations).not.toHaveBeenCalled();
    expect(h.map.setUserPosition).not.toHaveBeenCalled();
  });

  it('18. destroy cleans up everything', async () => {
    const h = setup();
    await flush();
    h.app.destroy();
    expect(h.map.destroy).toHaveBeenCalledTimes(1);
    expect(h.geo.clearWatch).toHaveBeenCalledWith(7);
    expect(vi.getTimerCount()).toBe(0);
    const calls = h.fetchStations.mock.calls.length;
    h.win.dispatchEvent(new Event('offline'));
    h.win.dispatchEvent(new Event('online'));
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(calls);
  });
});

describe('createApp offline cache', () => {
  it('19. valid cache is shown immediately and replaced by live data', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise, prepare: (st) => seedCache(st) });
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.dataSource).toBe('cache');
    expect(rows(h)).toHaveLength(2);
    expect(banner(h).hidden).toBe(false);
    expect(banner(h).textContent).toContain(S.cachedLoading(cachedWhen()));
    expect(h.map.setStations).toHaveBeenCalled();

    d.resolve(result([stA, stB, stC]));
    await flush();
    expect(h.app.store.getState().dataSource).toBe('live');
    expect(banner(h).hidden).toBe(true);
    expect(loadCachedStations(h.storage)!.stations).toHaveLength(3);
  });

  it('20. valid cache plus failing fetch keeps cached data with stale banner', async () => {
    const h = setup({
      fetch: () => Promise.reject(fetchError('network')),
      prepare: (st) => seedCache(st),
    });
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.dataSource).toBe('cache');
    expect(s.lastError).toBe('network');
    expect(s.stations).toHaveLength(2);
    expect(banner(h).textContent).toContain(S.staleData(S.errorText('network'), cachedWhen()));
  });

  it('21. cache written by another tab is used as fallback after a failed fetch', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise });
    expect(h.app.store.getState().status).toBe('loading');
    seedCache(h.storage);
    d.reject(fetchError('network'));
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.dataSource).toBe('cache');
    expect(s.stations.map((x) => x.id)).toEqual(['A', 'B']);
  });

  it('21b. without any cache a failed fetch ends in error', async () => {
    const h = setup({ fetch: () => Promise.reject(fetchError('network')) });
    await flush();
    expect(h.app.store.getState().status).toBe('error');
    expect(h.app.store.getState().stations).toHaveLength(0);
  });

  it('22. corrupt cache is ignored and the app starts loading', async () => {
    const d = deferred<StationsResult>();
    let h!: Harness;
    expect(() => {
      h = setup({ fetch: () => d.promise, prepare: (st) => st.map.set('tgp:stations:v1', '{bad') });
    }).not.toThrow();
    const s = h.app.store.getState();
    expect(s.status).toBe('loading');
    expect(s.dataSource).toBeNull();
    expect(s.stations).toHaveLength(0);
  });

  it('23. quota errors when saving never break the app', async () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const h = setup({ storage });
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.dataSource).toBe('live');
    expect(() => btn(h, 'Diésel').click()).not.toThrow();
    expect(h.app.store.getState().fuel).toBe('diesel');
  });

  it('24. null storage works without a cache', async () => {
    const h = setup({ storage: null });
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('ready');
    expect(s.dataSource).toBe('live');
    expect(rows(h)).toHaveLength(2);
  });

  it('25. offline then online after starting from cache refetches', async () => {
    const h = setup({
      fetch: () => Promise.reject(fetchError('network')),
      prepare: (st) => seedCache(st),
    });
    await flush();
    // clear the error so only dataSource 'cache' can trigger the refetch
    h.fetchStations.mockImplementation(() => Promise.resolve(result([stA, stB, stC])));
    h.app.store.setState({ lastError: null });
    expect(h.app.store.getState().dataSource).toBe('cache');
    h.win.dispatchEvent(new Event('offline'));
    const calls = h.fetchStations.mock.calls.length;
    h.win.dispatchEvent(new Event('online'));
    expect(h.fetchStations.mock.calls.length).toBe(calls + 1);
    await flush();
    expect(h.app.store.getState().dataSource).toBe('live');
  });
});

describe('createApp behaviours (mutation hardening)', () => {
  const sheetBodyReplaces = (spy: { mock: { contexts: unknown[] } }) =>
    spy.mock.contexts.filter((c) => (c as Element).classList?.contains('sheet__body')).length;

  it('M1. sort toggle updates sortBy and persists it', async () => {
    const h = setup();
    await flush();
    h.geo.success(28.1, -16.7);
    expect(btn(h, S.sortNearest).disabled).toBe(false);
    btn(h, S.sortNearest).click();
    expect(h.app.store.getState().sortBy).toBe('distance');
    expect(JSON.parse(h.storage.getItem(PREFS_KEY)!).sortBy).toBe('distance');
    btn(h, S.sortCheapest).click();
    expect(h.app.store.getState().sortBy).toBe('price');
    expect(JSON.parse(h.storage.getItem(PREFS_KEY)!).sortBy).toBe('price');
  });

  it('M2. the Refresh control fetches and refreshing returns to false', async () => {
    const h = setup();
    await flush();
    const calls = h.fetchStations.mock.calls.length;
    byLabel(h, S.refresh).click();
    expect(h.fetchStations.mock.calls.length).toBe(calls + 1);
    expect(h.app.store.getState().refreshing).toBe(true);
    await flush();
    expect(h.app.store.getState().refreshing).toBe(false);
  });

  it('M3. failed refresh with stations: refreshing false, no cache fallback', async () => {
    const h = setup();
    await flush();
    expect(h.app.store.getState().dataSource).toBe('live');
    h.fetchStations.mockImplementation(() => Promise.reject(fetchError('network')));
    await h.app.refresh();
    const s = h.app.store.getState();
    expect(s.refreshing).toBe(false);
    expect(s.lastError).toBe('network');
    expect(s.dataSource).toBe('live');
  });

  it('M4. a persisting selected station stays selected after refresh', async () => {
    const h = setup();
    await flush();
    h.markerClick('A');
    h.fetchStations.mockImplementation(() => Promise.resolve(result([stA, stC])));
    await h.app.refresh();
    expect(h.app.store.getState().selectedId).toBe('A');
    expect(h.root.querySelector('h2')!.textContent).toContain('ALFA');
  });

  it('M5. selecting keeps an already raised sheet and flags the marker selected', async () => {
    const h = setup();
    await flush();
    h.app.store.setState({ sheet: 'full' });
    h.markerClick('B');
    expect(h.app.store.getState().sheet).toBe('full');
    expect(lastMarkers(h).find((m) => m.id === 'B')!.selected).toBe(true);
    expect(lastMarkers(h).find((m) => m.id === 'A')!.selected).toBe(false);
  });

  it('M6. detail distance uses the selected station, also when it has no price for the fuel', async () => {
    const h = setup();
    await flush();
    const pos = { lat: 28.1, lon: -16.7 };
    h.geo.success(pos.lat, pos.lon);
    h.markerClick('A');
    expect(h.root.querySelector('.detail-distance')!.textContent).toBe(formatDistance(haversineKm(pos, stA)));
    btn(h, S.back).click();
    h.markerClick('B');
    expect(h.root.querySelector('.detail-distance')!.textContent).toBe(formatDistance(haversineKm(pos, stB)));
    btn(h, S.back).click();
    h.markerClick('C'); // diesel only, no item in the g95 list
    expect(h.root.querySelector('h2')!.textContent).toContain('CEPSA');
    expect(h.root.querySelector('.detail-distance')!.textContent).toBe(formatDistance(haversineKm(pos, stC)));
  });

  it('M7. offline with no stations shows the no-data banner', async () => {
    const h = setup({ online: false, fetch: () => Promise.reject(fetchError('network')) });
    await flush();
    expect(h.app.store.getState().stations).toHaveLength(0);
    expect(banner(h).hidden).toBe(false);
    expect(banner(h).textContent).toContain(S.offlineNoData);
  });

  it('M8. status error alone triggers a refetch on online', async () => {
    const h = setup({ fetch: () => Promise.reject(fetchError('network')) });
    await flush();
    expect(h.app.store.getState().status).toBe('error');
    h.app.store.setState({ lastError: null });
    const calls = h.fetchStations.mock.calls.length;
    h.win.dispatchEvent(new Event('online'));
    expect(h.fetchStations.mock.calls.length).toBe(calls + 1);
    await flush();
  });

  it('M9. visibility: exactly 30 min old does not refresh, one ms more does', async () => {
    const h = setup();
    await flush();
    const base = h.fetchStations.mock.calls.length;
    vi.advanceTimersByTime(30 * 60_000);
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base);
    vi.advanceTimersByTime(1);
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base + 1);
  });

  it('M10. visibility with no data and no fetch in flight refreshes', async () => {
    const h = setup({ fetch: () => Promise.reject(fetchError('network')) });
    await flush();
    expect(h.app.store.getState().fetchedAt).toBeNull();
    expect(h.app.store.getState().refreshing).toBe(false);
    const base = h.fetchStations.mock.calls.length;
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.fetchStations.mock.calls.length).toBe(base + 1);
    await flush();
  });

  it('M11. destroy removes the listeners by name, unsubscribes and is idempotent', async () => {
    const h = setup();
    await flush();
    const winSpy = vi.spyOn(h.win, 'removeEventListener');
    const docSpy = vi.spyOn(h.doc, 'removeEventListener');
    try {
      h.app.destroy();
      h.app.destroy();
      expect(winSpy.mock.calls.map((c) => c[0]).sort()).toEqual(['offline', 'online']);
      expect(docSpy.mock.calls.map((c) => c[0])).toEqual(['visibilitychange']);
      expect(h.map.destroy).toHaveBeenCalledTimes(1);
      expect(h.geo.clearWatch).toHaveBeenCalledTimes(1);

      const before = h.app.store.getState();
      h.win.dispatchEvent(new Event('offline'));
      expect(h.app.store.getState().online).toBe(before.online);
      h.win.dispatchEvent(new Event('online'));
      h.doc.dispatchEvent(new Event('visibilitychange'));

      // unsubscribed: a sheet change after destroy queues no animation frame and does not render
      rafQueue = [];
      h.map.setStations!.mockClear();
      h.app.store.setState({ sheet: 'full', fuel: 'diesel' });
      expect(rafQueue).toHaveLength(0);
      expect(h.map.setStations).not.toHaveBeenCalled();
    } finally {
      winSpy.mockRestore();
      docSpy.mockRestore();
    }
  });

  it('M12. a pending animation frame after destroy does not invalidate the map', async () => {
    const h = setup();
    await flush();
    h.map.invalidateSize!.mockClear();
    rafQueue = [];
    (h.root.querySelector('.sheet__handle') as HTMLElement).click();
    expect(rafQueue.length).toBeGreaterThan(0);
    h.app.destroy();
    rafQueue.splice(0).forEach((cb) => cb(0));
    expect(h.map.invalidateSize).not.toHaveBeenCalled();
  });

  it('M13. a fetch that resolves after destroy is ignored', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise });
    h.app.destroy();
    d.resolve(result([stA, stB, stC]));
    await flush();
    const s = h.app.store.getState();
    expect(s.status).toBe('loading');
    expect(s.stations).toHaveLength(0);
    expect(loadCachedStations(h.storage)).toBeNull();
  });

  it('M14. a fetch that fails after destroy is ignored', async () => {
    const d = deferred<StationsResult>();
    const h = setup({ fetch: () => d.promise });
    h.app.destroy();
    d.reject(fetchError('network'));
    await flush();
    const s = h.app.store.getState();
    expect(s.lastError).toBeNull();
    expect(s.status).toBe('loading');
    expect(s.refreshing).toBe(true);
  });

  it('M15. geo updates after destroy are ignored and render is inert', async () => {
    const h = setup();
    await flush();
    h.geo.error(1);
    expect(h.app.store.getState().geo.status).toBe('denied');
    h.app.destroy();
    h.geo.success(28.1, -16.7);
    expect(h.app.store.getState().geo.status).toBe('denied');
    expect(h.map.focus).not.toHaveBeenCalled();
    // Locate after destroy would set a notice and render; render must be a no-op
    byLabel(h, S.locate).click();
    expect(banner(h).textContent ?? '').not.toContain(S.locationDeniedHelp);
  });

  it('M16. focus bounds: outside fixes do not focus, the first inside one does, once', async () => {
    const h = setup();
    await flush();
    h.geo.success(28.2, -15.5); // east of the bounds
    h.geo.success(28.2, -17.5); // west of the bounds
    h.geo.success(27.5, -16.5); // south
    h.geo.success(29.0, -16.5); // north
    expect(h.map.focus).not.toHaveBeenCalled();
    h.geo.success(28.2, -16.5);
    expect(h.map.focus).toHaveBeenCalledTimes(1);
    expect(h.map.focus).toHaveBeenCalledWith({ lat: 28.2, lon: -16.5 }, 13);
    h.geo.success(28.3, -16.4);
    expect(h.map.focus).toHaveBeenCalledTimes(1);
  });

  it('M17. setUserPosition call semantics', async () => {
    const h = setup();
    await flush();
    expect(h.map.setUserPosition).not.toHaveBeenCalled();
    h.geo.error(1);
    expect(h.map.setUserPosition).not.toHaveBeenCalled();
    h.geo.success(28.1, -16.7, 20);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(1);
    expect(h.map.setUserPosition).toHaveBeenLastCalledWith({ lat: 28.1, lon: -16.7 }, 20);
    // new object, identical coordinates and accuracy -> no call
    h.geo.success(28.1, -16.7, 20);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(1);
    // same position, different accuracy
    h.geo.success(28.1, -16.7, 35);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(2);
    expect(h.map.setUserPosition).toHaveBeenLastCalledWith({ lat: 28.1, lon: -16.7 }, 35);
    // only lon changes
    h.geo.success(28.1, -16.6, 35);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(3);
    // only lat changes
    h.geo.success(28.2, -16.6, 35);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(4);
    // position and accuracy both change
    h.geo.success(28.3, -16.5, 50);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(5);
    // same accuracy, different position
    h.geo.success(28.25, -16.5, 50);
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(6);
  });

  it('M18. losing the position clears the user marker', async () => {
    const h = setup();
    await flush();
    h.geo.success(28.1, -16.7, 20);
    h.map.setUserPosition!.mockClear();
    h.app.store.setState({ geo: { status: 'denied', position: null, accuracyM: null } });
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(1);
    expect(h.map.setUserPosition).toHaveBeenCalledWith(null, null);
  });

  it('M19. list/detail are mounted only when switching, and frames only on sheet changes', async () => {
    const h = setup();
    await flush();
    const spy = vi.spyOn(Element.prototype, 'replaceChildren');
    try {
      vi.advanceTimersByTime(30000); // list stays mounted
      expect(sheetBodyReplaces(spy)).toBe(0);
      h.markerClick('B');
      expect(sheetBodyReplaces(spy)).toBe(1);
      vi.advanceTimersByTime(30000); // detail stays mounted
      expect(sheetBodyReplaces(spy)).toBe(1);
      btn(h, S.back).click();
      expect(sheetBodyReplaces(spy)).toBe(2);
      vi.advanceTimersByTime(30000);
      expect(sheetBodyReplaces(spy)).toBe(2);
    } finally {
      spy.mockRestore();
    }
    rafQueue = [];
    vi.advanceTimersByTime(30000);
    expect(rafQueue).toHaveLength(0);
  });
});

describe('user marker follows position appearing or disappearing', () => {
  it('M18b. position gone or back with the same accuracy still updates the marker', async () => {
    const h = setup();
    await flush();
    h.geo.success(28.1, -16.7, 20);
    h.map.setUserPosition!.mockClear();
    h.app.store.setState({ geo: { status: 'denied', position: null, accuracyM: 20 } });
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(1);
    expect(h.map.setUserPosition).toHaveBeenLastCalledWith(null, 20);
    h.app.store.setState({ geo: { status: 'ok', position: { lat: 28.1, lon: -16.7 }, accuracyM: 20 } });
    expect(h.map.setUserPosition).toHaveBeenCalledTimes(2);
    expect(h.map.setUserPosition).toHaveBeenLastCalledWith({ lat: 28.1, lon: -16.7 }, 20);
  });
});

describe('Addendum B: map container and panel-aware inset', () => {
  let heightSpy: ReturnType<typeof vi.spyOn> | null = null;

  afterEach(() => {
    heightSpy?.mockRestore();
    heightSpy = null;
  });

  type MapOpts = { bottomInset?: () => number };
  const optsOf = (h: Harness) => h.createMapView.mock.calls[0]![1] as MapOpts | undefined;

  it('B1. createMapView receives the map container already connected as a child of root', () => {
    const h = setup();
    expect(h.createMapView).toHaveBeenCalledTimes(1);
    const el = h.createMapView.mock.calls[0]![0] as HTMLElement;
    expect(el.classList.contains('map')).toBe(true);
    expect(h.mapContainerState.connectedUnderRoot).toBe(true);
  });

  it('B1. root children stay in the order map, top-bar, controls, sheet', () => {
    const h = setup();
    const kids = Array.from(h.root.children);
    expect(kids).toHaveLength(4);
    expect(kids[0]!.classList.contains('map')).toBe(true);
    expect(kids[1]!.classList.contains('top-bar')).toBe(true);
    expect(kids[2]!.classList.contains('controls')).toBe(true);
    expect(kids[3]!.classList.contains('sheet')).toBe(true);
  });

  it('B5. createMapView gets a bottomInset callback that follows the current sheet snap', async () => {
    heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
    const h = setup();
    await flush();
    const opts = optsOf(h);
    expect(typeof opts?.bottomInset).toBe('function');
    expect(opts!.bottomInset!()).toBe(148);
    h.app.store.setState({ sheet: 'half' });
    expect(opts!.bottomInset!()).toBe(400);
    h.app.store.setState({ sheet: 'full' });
    expect(opts!.bottomInset!()).toBe(400);
    h.app.store.setState({ sheet: 'peek' });
    expect(opts!.bottomInset!()).toBe(148);
  });

  it('B5. bottomInset is already 148 for the initial peek state', () => {
    const h = setup();
    expect(optsOf(h)!.bottomInset!()).toBe(148);
  });

  it('B5. selecting from peek focuses after the snap change (inset already the half value)', async () => {
    heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
    const h = setup();
    await flush();
    const insets: number[] = [];
    h.map.focus!.mockImplementation(() => {
      insets.push(optsOf(h)!.bottomInset!());
    });
    h.markerClick('B');
    expect(h.map.focus).toHaveBeenCalledTimes(1);
    expect(insets).toEqual([400]);
    expect(h.root.querySelector('.sheet')!.classList.contains('sheet--half')).toBe(true);
  });
});
