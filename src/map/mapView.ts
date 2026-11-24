import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import type { LatLon, MarkerViewModel } from '../types';
import { TENERIFE_BOUNDS } from '../data/tenerife';
import { createMarkerElement } from './markers';

export interface MapView {
  setStations(markers: MarkerViewModel[]): void;
  setUserPosition(pos: LatLon | null, accuracyM: number | null): void;
  focus(pos: LatLon, zoom?: number): void;
  fitTenerife(): void;
  onMarkerClick(cb: (id: string) => void): void;
  invalidateSize(): void;
  destroy(): void;
  getCenter(): LatLon;
  getZoom(): number;
}

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const USER_COLOR = '#1a73e8';

export function createMapView(
  container: HTMLElement,
  opts?: { tileUrl?: string; animate?: boolean; bottomInset?: () => number },
): MapView {
  const animate = opts?.animate ?? true;
  const map = L.map(container, { zoomControl: false, attributionControl: true, tap: true } as L.MapOptions);
  L.tileLayer(opts?.tileUrl ?? DEFAULT_TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  const group = L.layerGroup().addTo(map);
  let clickCb: ((id: string) => void) | null = null;
  let dot: L.CircleMarker | null = null;
  let ring: L.Circle | null = null;

  function inset(): number {
    const v = opts?.bottomInset?.() ?? 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function fitTenerife(): void {
    map.fitBounds(
      [[TENERIFE_BOUNDS.south, TENERIFE_BOUNDS.west], [TENERIFE_BOUNDS.north, TENERIFE_BOUNDS.east]],
      { paddingTopLeft: [16, 16], paddingBottomRight: [16, 16 + inset()], animate },
    );
  }
  fitTenerife();

  return {
    setStations(markers) {
      group.clearLayers();
      for (const vm of markers) {
        const marker = L.marker([vm.lat, vm.lon], {
          icon: L.divIcon({
            html: createMarkerElement(vm),
            className: 'price-pin-wrap',
            iconSize: undefined,
            iconAnchor: [24, 14],
          }),
          keyboard: true,
          title: vm.label,
          riseOnHover: true,
          zIndexOffset: vm.selected ? 1000 : vm.cheapest ? 500 : 0,
        });
        marker.on('click', () => clickCb?.(vm.id));
        group.addLayer(marker);
      }
    },
    setUserPosition(pos, accuracyM) {
      if (!pos) {
        dot?.remove();
        ring?.remove();
        dot = null;
        ring = null;
        return;
      }
      const ll: L.LatLngExpression = [pos.lat, pos.lon];
      if (dot) dot.setLatLng(ll);
      else {
        dot = L.circleMarker(ll, {
          radius: 8, color: '#ffffff', weight: 3, fillColor: USER_COLOR, fillOpacity: 1, className: 'user-dot',
        }).addTo(map);
      }
      if (accuracyM !== null && accuracyM < 2000) {
        if (ring) {
          ring.setLatLng(ll);
          ring.setRadius(accuracyM);
        } else {
          ring = L.circle(ll, {
            radius: accuracyM, color: USER_COLOR, weight: 1, fillColor: USER_COLOR, fillOpacity: 0.12, interactive: false,
          }).addTo(map);
          dot.bringToFront();
        }
      } else if (ring) {
        ring.remove();
        ring = null;
      }
    },
    focus(pos, zoom = 15) {
      const off = inset() / 2;
      let center: L.LatLngExpression = [pos.lat, pos.lon];
      if (off > 0) center = map.unproject(map.project(center, zoom).add([0, off]), zoom);
      // Without animation, reset avoids Leaflet's whole-pixel pan rounding.
      map.setView(center, zoom, off > 0 && !animate ? ({ animate, reset: true } as L.ZoomPanOptions) : { animate });
    },
    fitTenerife,
    onMarkerClick(cb) {
      clickCb = cb;
    },
    invalidateSize() {
      map.invalidateSize();
    },
    destroy() {
      map.remove();
    },
    getCenter() {
      const c = map.getCenter();
      return { lat: c.lat, lon: c.lng };
    },
    getZoom() {
      return map.getZoom();
    },
  };
}
