import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import L from 'leaflet';
import { createMapView } from './mapView';
import type { MapView } from './mapView';
import type { MarkerViewModel } from '../types';

function vm(id: string, over: Partial<MarkerViewModel> = {}): MarkerViewModel {
  return { id, lat: 28.1 + Number(id) * 0.01, lon: -16.7, label: '1,5' + id, tier: 'mid', selected: false, cheapest: false, ...over };
}

let div: HTMLDivElement;
let view: MapView | null;

beforeEach(() => {
  // jsdom lacks SVG feature detection; make Leaflet pick the SVG renderer.
  const proto = (window as unknown as { SVGSVGElement: { prototype: Record<string, unknown> } }).SVGSVGElement.prototype;
  if (!proto.createSVGRect) proto.createSVGRect = () => ({});
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  div = document.createElement('div');
  document.body.appendChild(div);
  view = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  try { view?.destroy(); } catch { /* ignore */ }
  div.remove();
});

function make(opts?: { animate?: boolean }): MapView {
  view = createMapView(div, { animate: false, ...opts });
  return view;
}

describe('createMapView', () => {
  it('creates a leaflet container with OpenStreetMap attribution', () => {
    make();
    expect(div.classList.contains('leaflet-container')).toBe(true);
    expect(div.querySelector('.leaflet-control-attribution')?.textContent).toContain('OpenStreetMap');
  });

  it('setStations renders one pin per marker and replaces old ones', () => {
    const v = make();
    v.setStations([vm('1'), vm('2'), vm('3')]);
    expect(div.querySelectorAll('.leaflet-marker-pane .price-pin').length).toBe(3);
    v.setStations([vm('4')]);
    const pins = div.querySelectorAll('.leaflet-marker-pane .price-pin');
    expect(pins.length).toBe(1);
    expect(pins[0]?.textContent).toBe('1,54');
  });

  it('invokes onMarkerClick with the marker id when a pin is clicked', () => {
    const v = make();
    const cb = vi.fn();
    v.onMarkerClick(cb);
    v.setStations([vm('1'), vm('2')]);
    const pins = div.querySelectorAll('.leaflet-marker-pane .price-pin');
    const second = Array.from(pins).find((p) => p.textContent === '1,52')!;
    second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('2');
  });

  it('setUserPosition adds a user dot and accuracy circle, updates in place, and removes on null', () => {
    const v = make();
    v.setUserPosition({ lat: 28.4, lon: -16.3 }, 30);
    expect(div.querySelectorAll('.user-dot').length).toBe(1);
    expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(2);
    v.setUserPosition({ lat: 28.3, lon: -16.4 }, 40);
    expect(div.querySelectorAll('.user-dot').length).toBe(1);
    expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(2);
    v.setUserPosition(null, null);
    expect(div.querySelectorAll('.user-dot').length).toBe(0);
    expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(0);
  });

  it('setUserPosition with accuracy >= 2000 shows no accuracy circle', () => {
    const v = make();
    v.setUserPosition({ lat: 28.4, lon: -16.3 }, 5000);
    expect(div.querySelectorAll('.user-dot').length).toBe(1);
    expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(1);
  });

  it('destroy removes leaflet content without throwing', () => {
    const v = make();
    v.setStations([vm('1')]);
    expect(() => v.destroy()).not.toThrow();
    expect(div.querySelector('.leaflet-pane')).toBeNull();
    view = null;
  });

  it('focus moves the center and zoom (animate false)', () => {
    const v = make();
    v.focus({ lat: 28.3, lon: -16.5 }, 14);
    expect(Math.abs(v.getCenter().lat - 28.3)).toBeLessThan(1e-6);
    expect(Math.abs(v.getCenter().lon - -16.5)).toBeLessThan(1e-6);
    expect(v.getZoom()).toBe(14);
  });

  describe('bottomInset (panel-aware centring)', () => {
    const target = { lat: 28.3, lon: -16.5 };
    const proj = (lat: number, lon: number, z: number) => L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), z);

    function makeInset(bottomInset?: () => number): MapView {
      view = createMapView(div, { animate: false, bottomInset });
      return view;
    }

    it('focus with inset 200 puts the target 100px above the container centre', () => {
      const v = makeInset(() => 200);
      v.focus(target, 14);
      const c = v.getCenter();
      const pc = proj(c.lat, c.lon, 14);
      const pt = proj(target.lat, target.lon, 14);
      expect(pc.x - pt.x).toBeCloseTo(0, 3);
      expect(pc.y - pt.y).toBeCloseTo(100, 3);
      expect(c.lat).toBeLessThan(target.lat);
      expect(v.getZoom()).toBe(14);
    });

    it('focus uses the default zoom 15 with an inset', () => {
      const v = makeInset(() => 100);
      v.focus(target);
      expect(v.getZoom()).toBe(15);
      const c = v.getCenter();
      expect(proj(c.lat, c.lon, 15).y - proj(target.lat, target.lon, 15).y).toBeCloseTo(50, 3);
    });

    it.each([
      ['0', () => 0],
      ['undefined option', undefined],
      ['NaN', () => NaN],
      ['negative', () => -50],
    ])('focus with inset %s centres exactly on the target', (_name, fn) => {
      const v = makeInset(fn as (() => number) | undefined);
      v.focus(target, 14);
      expect(v.getCenter().lat).toBeCloseTo(target.lat, 6);
      expect(v.getCenter().lon).toBeCloseTo(target.lon, 6);
    });

    it('reads the inset at call time', () => {
      let inset = 0;
      const v = makeInset(() => inset);
      v.focus(target, 14);
      expect(v.getCenter().lat).toBeCloseTo(target.lat, 6);
      inset = 200;
      v.focus(target, 14);
      const c = v.getCenter();
      expect(proj(c.lat, c.lon, 14).y - proj(target.lat, target.lon, 14).y).toBeCloseTo(100, 3);
    });

    it('fitTenerife adds the inset to the bottom-right padding, read at call time', () => {
      let inset = 0;
      const fit = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) { return this; });
      const v = makeInset(() => inset);
      expect(fit.mock.calls[0]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 16], animate: false });
      inset = 148;
      v.fitTenerife();
      expect(fit.mock.calls[1]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 164], animate: false });
    });

    it.each([['NaN', NaN], ['negative', -20]])('fitTenerife treats %s inset as 0', (_n, val) => {
      const fit = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) { return this; });
      makeInset(() => val);
      expect(fit.mock.calls[0]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 16], animate: false });
    });
  });

  describe('mutation coverage', () => {
    it('uses the OpenStreetMap tile URL by default and a custom one when given', () => {
      const spy = vi.spyOn(L, 'tileLayer');
      view = createMapView(div);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      view.destroy();
      view = null;
      const div2 = document.createElement('div');
      document.body.appendChild(div2);
      const v2 = createMapView(div2, { tileUrl: 'https://example.test/{z}/{x}/{y}.png' });
      expect(spy.mock.calls[1]![0]).toBe('https://example.test/{z}/{x}/{y}.png');
      v2.destroy();
      div2.remove();
    });

    it('animate defaults to true and is passed to fitBounds and setView', () => {
      const fit = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) { return this; });
      const sv = vi.spyOn(L.Map.prototype, 'setView').mockImplementation(function (this: L.Map) { return this; });
      view = createMapView(div);
      expect(fit.mock.calls[0]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 16], animate: true });
      view.focus({ lat: 28.3, lon: -16.5 });
      expect(sv.mock.calls[0]![0]).toEqual([28.3, -16.5]);
      expect(sv.mock.calls[0]![1]).toBe(15);
      expect(sv.mock.calls[0]![2]).toEqual({ animate: true });
      view.fitTenerife();
      expect(fit.mock.calls[1]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 16], animate: true });
    });

    it('animate false is passed to fitBounds and setView', () => {
      const fit = vi.spyOn(L.Map.prototype, 'fitBounds').mockImplementation(function (this: L.Map) { return this; });
      const sv = vi.spyOn(L.Map.prototype, 'setView').mockImplementation(function (this: L.Map) { return this; });
      const v = make();
      v.focus({ lat: 28.3, lon: -16.5 }, 12);
      expect(fit.mock.calls[0]![1]).toEqual({ paddingTopLeft: [16, 16], paddingBottomRight: [16, 16], animate: false });
      expect(sv.mock.calls[0]![1]).toBe(12);
      expect(sv.mock.calls[0]![2]).toEqual({ animate: false });
    });

    it('markers have price-pin-wrap class, keyboard and riseOnHover enabled', () => {
      const spy = vi.spyOn(L, 'marker');
      const v = make();
      v.setStations([vm('1')]);
      const opts = spy.mock.calls[0]![1] as L.MarkerOptions;
      expect(opts.keyboard).toBe(true);
      expect(opts.riseOnHover).toBe(true);
      expect(opts.title).toBe('1,51');
      expect(div.querySelectorAll('.leaflet-marker-pane .price-pin-wrap').length).toBe(1);
    });

    it('invalidateSize calls through to the leaflet map', () => {
      const spy = vi.spyOn(L.Map.prototype, 'invalidateSize');
      const v = make();
      v.invalidateSize();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('user dot and ring are styled, updated in place, and the ring is removed at accuracy >= 2000 or null', () => {
      const dotSpy = vi.spyOn(L, 'circleMarker');
      const ringSpy = vi.spyOn(L, 'circle');
      const v = make();
      const p1 = { lat: 28.4, lon: -16.3 };
      const p2 = { lat: 28.3, lon: -16.4 };
      v.setUserPosition(p1, 50);
      const dot = dotSpy.mock.results[0]!.value as L.CircleMarker;
      const ring = ringSpy.mock.results[0]!.value as L.Circle;
      const dotOpts = dot.options;
      expect(dotOpts.color).toBe('#ffffff');
      expect(dotOpts.fillColor).toBe('#1a73e8');
      expect(dotOpts.className).toBe('user-dot');
      expect(ring.options.color).toBe('#1a73e8');
      expect(ring.options.fillColor).toBe('#1a73e8');
      expect(ring.options.interactive).toBe(false);
      expect(ring.options.fillOpacity).toBe(0.12);
      const front = vi.spyOn(dot, 'bringToFront');

      v.setUserPosition(p2, 60);
      expect(ringSpy).toHaveBeenCalledTimes(1);
      expect(dotSpy).toHaveBeenCalledTimes(1);
      expect(ring.getLatLng().lat).toBeCloseTo(28.3, 6);
      expect(ring.getLatLng().lng).toBeCloseTo(-16.4, 6);
      expect(ring.getRadius()).toBe(60);
      expect(dot.getLatLng().lat).toBeCloseTo(28.3, 6);
      expect(front).not.toHaveBeenCalled();

      v.setUserPosition(p2, 2000);
      expect(div.querySelectorAll('.user-dot').length).toBe(1);
      expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(1);

      v.setUserPosition(p2, 1999);
      expect(ringSpy).toHaveBeenCalledTimes(2);
      expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(2);

      v.setUserPosition(p2, null);
      expect(div.querySelectorAll('.user-dot').length).toBe(1);
      expect(div.querySelectorAll('.leaflet-overlay-pane path').length).toBe(1);
    });

    it('new ring brings the dot to front', () => {
      const dotSpy = vi.spyOn(L, 'circleMarker');
      const v = make();
      v.setUserPosition({ lat: 28.4, lon: -16.3 }, null);
      const dot = dotSpy.mock.results[0]!.value as L.CircleMarker;
      const front = vi.spyOn(dot, 'bringToFront');
      v.setUserPosition({ lat: 28.4, lon: -16.3 }, 100);
      expect(front).toHaveBeenCalledTimes(1);
    });
  });
});
