// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { watchUserLocation } from './location';
import type { LocationUpdate } from './location';

type Success = (pos: GeolocationPosition) => void;
type Failure = (err: GeolocationPositionError) => void;

interface FakeGeo {
  geo: Geolocation;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  success: () => Success;
  failure: () => Failure;
  emitSuccess(lat: number, lon: number, accuracy: number): void;
  emitError(code: number): void;
}

const WATCH_ID = 7;

// Hand-written fake: captures the success/error callbacks passed to watchPosition
// so the test can drive them directly.
function makeFakeGeo(): FakeGeo {
  let successCb: Success | null = null;
  let failureCb: Failure | null = null;
  const watchPosition = vi.fn((s: Success, f: Failure) => {
    successCb = s;
    failureCb = f;
    return WATCH_ID;
  });
  const clearWatch = vi.fn();
  const geo = { watchPosition, clearWatch } as unknown as Geolocation;
  return {
    geo,
    watchPosition,
    clearWatch,
    success: () => {
      if (!successCb) throw new Error('watchPosition was not called');
      return successCb;
    },
    failure: () => {
      if (!failureCb) throw new Error('watchPosition was not called');
      return failureCb;
    },
    emitSuccess(lat, lon, accuracy) {
      const pos = {
        coords: { latitude: lat, longitude: lon, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: 0,
      } as unknown as GeolocationPosition;
      if (!successCb) throw new Error('watchPosition was not called');
      successCb(pos);
    },
    emitError(code) {
      const err = { code, message: `code ${code}`, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as unknown as GeolocationPositionError;
      if (!failureCb) throw new Error('watchPosition was not called');
      failureCb(err);
    },
  };
}

describe('watchUserLocation', () => {
  it('reports unsupported synchronously when geo is undefined, and stop is safe to call', () => {
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    const stop = watchUserLocation(undefined, onUpdate);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ status: 'unsupported', position: null, accuracyM: null });
    expect(() => stop()).not.toThrow();
    expect(() => stop()).not.toThrow();
  });

  it('calls watchPosition with high accuracy, 30 s maximumAge and 20 s timeout', () => {
    const fake = makeFakeGeo();
    watchUserLocation(fake.geo, vi.fn());
    expect(fake.watchPosition).toHaveBeenCalledTimes(1);
    const [, , options] = fake.watchPosition.mock.calls[0] as unknown[];
    expect(options).toEqual({ enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
  });

  it('maps a success callback to status ok with position and accuracy', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitSuccess(28.4, -16.3, 25);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: 'ok',
      position: { lat: 28.4, lon: -16.3 },
      accuracyM: 25,
    });
  });

  it('maps error code 1 to denied with a null position', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitError(1);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: 'denied', position: null, accuracyM: null });
  });

  it('maps error code 2 before any fix to unavailable with a null position', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitError(2);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: 'unavailable', position: null, accuracyM: null });
  });

  it('maps error code 3 before any fix to unavailable', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitError(3);
    expect(onUpdate).toHaveBeenLastCalledWith({ status: 'unavailable', position: null, accuracyM: null });
  });

  it('ignores error code 3 after a fix has been received (no extra update)', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitSuccess(28.4, -16.3, 25);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    fake.emitError(3);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('after a fix, error code 2 reports unavailable but keeps the last position and accuracy', () => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitSuccess(28.4, -16.3, 25);
    fake.emitError(2);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith({
      status: 'unavailable',
      position: { lat: 28.4, lon: -16.3 },
      accuracyM: 25,
    });
  });

  it('stop calls clearWatch exactly once with the watch id, even when called twice', () => {
    const fake = makeFakeGeo();
    const stop = watchUserLocation(fake.geo, vi.fn());
    stop();
    stop();
    expect(fake.clearWatch).toHaveBeenCalledTimes(1);
    expect(fake.clearWatch).toHaveBeenCalledWith(WATCH_ID);
  });
});

describe('watchUserLocation: unknown error codes', () => {
  it.each([[0], [4], [99]])('ignores error code %d (no update)', (code) => {
    const fake = makeFakeGeo();
    const onUpdate = vi.fn<(u: LocationUpdate) => void>();
    watchUserLocation(fake.geo, onUpdate);
    fake.emitError(code);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
