import type { AppState, LatLon, Station, StationsResult } from './types';
import type { MapView } from './map/mapView';
import type { StorageLike } from './state/preferences';
import type { Store } from './state/store';
import { FetchError } from './data/api';
import { haversineKm, isWithinBounds } from './domain/geo';
import { openStatus } from './domain/hours';
import { fuelById } from './fuels';
import { watchUserLocation } from './geo/location';
import { loadPrefs, savePrefs } from './state/preferences';
import { availableFuels, effectiveSort, listItems, markerModels, selectedStation } from './state/selectors';
import { loadCachedStations, saveCachedStations } from './state/stationCache';
import { createStore, initialState } from './state/store';
import { createBottomSheet } from './ui/bottomSheet';
import { createControls } from './ui/controls';
import { h } from './ui/dom';
import { createFuelFilter } from './ui/fuelFilter';
import { createStationDetail } from './ui/stationDetail';
import { createStationList } from './ui/stationList';
import { S } from './ui/strings';

export interface AppDeps {
  root: HTMLElement;
  fetchStations: () => Promise<StationsResult>;
  geolocation: Geolocation | undefined;
  createMapView: (el: HTMLElement) => MapView;
  storage: StorageLike | null;
  now: () => Date;
  isOnline: () => boolean;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'> & { visibilityState: string };
  platform: 'ios' | 'other';
}

export interface App {
  store: Store<AppState>;
  refresh(): Promise<void>;
  destroy(): void;
}

const TENERIFE_FOCUS_BOUNDS = { south: 27.9, west: -17.0, north: 28.7, east: -16.0 };
const TICK_MS = 30_000;
const NOTICE_MS = 6_000;
const STALE_MS = 30 * 60_000;

export function createApp(deps: AppDeps): App {
  const { storage } = deps;
  const store = createStore<AppState>(initialState(loadPrefs(storage), deps.now(), deps.isOnline()));

  const cached = loadCachedStations(storage);
  if (cached) {
    store.setState({
      stations: cached.stations,
      sourceDate: cached.sourceDate,
      fetchedAt: cached.fetchedAt,
      status: 'ready',
      dataSource: 'cache',
    });
  }

  let destroyed = false;
  let inflight: Promise<void> | null = null;
  let notice: string | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let focusedOnUser = false;

  // ---- DOM ----
  const mapEl = h('div', { class: 'map' });
  const map = deps.createMapView(mapEl);

  const fuelFilter = createFuelFilter({ onSelect: (fuel) => {
    store.setState({ fuel });
    persistPrefs();
  } });
  const topBar = h('div', { class: 'top-bar' }, fuelFilter.el);

  const controls = createControls({ onRefresh: () => void refresh(), onLocate: locate });

  const sheet = createBottomSheet({ onSnapChange: (sheet) => store.setState({ sheet }) });

  const list = createStationList({
    onSelect: select,
    onSort: (sortBy) => {
      store.setState({ sortBy });
      persistPrefs();
    },
    onRetry: () => void refresh(),
  });
  const detail = createStationDetail({ onBack: () => store.setState({ selectedId: null }) });
  let mounted: 'list' | 'detail' | null = null;

  deps.root.append(mapEl, topBar, controls.el, sheet.el);

  function persistPrefs(): void {
    const s = store.getState();
    savePrefs(storage, { fuel: s.fuel, sortBy: s.sortBy });
  }

  // ---- actions ----
  function select(id: string): void {
    const s = store.getState();
    const station = s.stations.find((x) => x.id === id);
    if (!station) return;
    store.setState({ selectedId: id, sheet: s.sheet === 'peek' ? 'half' : s.sheet });
    map.focus({ lat: station.lat, lon: station.lon });
  }

  function setNotice(text: string | null): void {
    notice = text;
    render(store.getState());
  }

  function locate(): void {
    const { geo } = store.getState();
    if (geo.position) {
      map.focus(geo.position, 15);
    } else if (geo.status === 'denied') {
      if (noticeTimer !== null) clearTimeout(noticeTimer);
      setNotice(S.locationDeniedHelp);
      noticeTimer = setTimeout(() => {
        noticeTimer = null;
        setNotice(null);
      }, NOTICE_MS);
    }
  }

  function useCache(result: StationsResult): void {
    store.setState({
      stations: result.stations,
      sourceDate: result.sourceDate,
      fetchedAt: result.fetchedAt,
      status: 'ready',
      dataSource: 'cache',
    });
  }

  function refresh(): Promise<void> {
    if (inflight) return inflight;
    store.setState({ refreshing: true });
    let p: Promise<StationsResult>;
    try {
      p = deps.fetchStations();
    } catch (e) {
      p = Promise.reject(e);
    }
    inflight = p
      .then(
        (result) => {
          if (destroyed) return;
          const selectedId = store.getState().selectedId;
          store.setState({
            stations: result.stations,
            sourceDate: result.sourceDate,
            fetchedAt: result.fetchedAt,
            status: 'ready',
            dataSource: 'live',
            lastError: null,
            refreshing: false,
            selectedId: selectedId !== null && result.stations.some((x) => x.id === selectedId) ? selectedId : null,
          });
          saveCachedStations(storage, result);
        },
        (err: unknown) => {
          if (destroyed) return;
          store.setState({ lastError: err instanceof FetchError ? err.kind : 'network', refreshing: false });
          if (store.getState().stations.length === 0) {
            const fallback = loadCachedStations(storage);
            if (fallback) useCache(fallback);
            else store.setState({ status: 'error' });
          }
        },
      )
      .then(() => {
        inflight = null;
      });
    return inflight;
  }

  // ---- rendering ----
  let prevStations: Station[] | null = null;
  let prevFuel: AppState['fuel'] | null = null;
  let prevSelected: string | null | undefined = undefined;
  let prevPos: LatLon | null | undefined = undefined;
  let prevAcc: number | null | undefined = undefined;

  function render(s: AppState): void {
    if (destroyed) return;
    const items = listItems(s);

    if (s.stations !== prevStations || s.fuel !== prevFuel || s.selectedId !== prevSelected) {
      prevStations = s.stations;
      prevFuel = s.fuel;
      prevSelected = s.selectedId;
      map.setStations(markerModels(items, s.selectedId));
    }
    const pos = s.geo.position;
    if (prevPos === undefined || prevAcc === undefined || !samePos(pos, prevPos) || s.geo.accuracyM !== prevAcc) {
      if (prevPos !== undefined || pos !== null) map.setUserPosition(pos, s.geo.accuracyM);
      prevPos = pos;
      prevAcc = s.geo.accuracyM;
    }

    fuelFilter.update({ fuels: availableFuels(s.stations, s.fuel), selected: s.fuel });
    controls.update({
      status: s.status,
      refreshing: s.refreshing,
      lastError: s.lastError,
      online: s.online,
      sourceDate: s.sourceDate,
      fetchedAt: s.fetchedAt,
      now: s.now,
      geoStatus: s.geo.status,
      hasStations: s.stations.length > 0,
      dataSource: s.dataSource,
      notice,
    });
    sheet.update({ snap: s.sheet });

    const selected = selectedStation(s);
    if (selected) {
      const item = items.find((i) => i.station.id === selected.id);
      detail.update({
        station: selected,
        selectedFuel: s.fuel,
        distanceKm: item
          ? item.distanceKm
          : s.geo.position
            ? haversineKm(s.geo.position, { lat: selected.lat, lon: selected.lon })
            : null,
        openState: item ? item.openState : openStatus(selected.hours, s.now),
        platform: deps.platform,
      });
      if (mounted !== 'detail') {
        sheet.body.replaceChildren(detail.el);
        mounted = 'detail';
      }
    } else {
      list.update({
        status: s.status,
        lastError: s.lastError,
        items,
        fuel: fuelById(s.fuel),
        sortBy: effectiveSort(s),
        canSortByDistance: s.geo.position !== null,
        geoStatus: s.geo.status,
      });
      if (mounted !== 'list') {
        sheet.body.replaceChildren(list.el);
        mounted = 'list';
      }
    }
  }

  const unsubscribe = store.subscribe((s, prev) => {
    render(s);
    if (s.sheet !== prev.sheet) {
      requestAnimationFrame(() => {
        if (!destroyed) map.invalidateSize();
      });
    }
  });

  map.onMarkerClick(select);
  render(store.getState());

  // ---- events ----
  const tick = setInterval(() => store.setState({ now: deps.now() }), TICK_MS);

  const onOnline = (): void => {
    store.setState({ online: true });
    const s = store.getState();
    if (s.lastError !== null || s.status === 'error' || s.dataSource === 'cache') void refresh();
  };
  const onOffline = (): void => store.setState({ online: false });
  const onVisibility = (): void => {
    if (deps.doc.visibilityState !== 'visible') return;
    const s = store.getState();
    const stale = s.fetchedAt === null ? !s.refreshing : deps.now().getTime() - s.fetchedAt.getTime() > STALE_MS;
    if (stale) void refresh();
  };
  deps.win.addEventListener('online', onOnline);
  deps.win.addEventListener('offline', onOffline);
  deps.doc.addEventListener('visibilitychange', onVisibility);

  void refresh();

  const stopGeo = watchUserLocation(deps.geolocation, (u) => {
    if (destroyed) return;
    store.setState({ geo: { status: u.status, position: u.position, accuracyM: u.accuracyM } });
    if (!focusedOnUser && u.status === 'ok' && u.position && isWithinBounds(u.position, TENERIFE_FOCUS_BOUNDS)) {
      focusedOnUser = true;
      map.focus(u.position, 13);
    }
  });

  return {
    store,
    refresh,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearInterval(tick);
      if (noticeTimer !== null) clearTimeout(noticeTimer);
      deps.win.removeEventListener('online', onOnline);
      deps.win.removeEventListener('offline', onOffline);
      deps.doc.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
      stopGeo();
      map.destroy();
    },
  };
}

function samePos(a: LatLon | null, b: LatLon | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lat === b.lat && a.lon === b.lon;
}
