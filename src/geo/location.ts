import type { GeoStatus, LatLon } from '../types';

export interface LocationUpdate { status: GeoStatus; position: LatLon | null; accuracyM: number | null; }

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 };

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/**
 * Watches the user's position through the injected Geolocation API.
 * Returns a stop function that clears the watch; it is safe to call more than once.
 */
export function watchUserLocation(
  geo: Geolocation | undefined,
  onUpdate: (u: LocationUpdate) => void,
): () => void {
  if (!geo) {
    onUpdate({ status: 'unsupported', position: null, accuracyM: null });
    return () => {};
  }

  let hasFix = false;
  let lastPosition: LatLon | null = null;
  let lastAccuracy: number | null = null;
  let stopped = false;

  const id = geo.watchPosition(
    (pos) => {
      hasFix = true;
      lastPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      lastAccuracy = pos.coords.accuracy;
      onUpdate({ status: 'ok', position: lastPosition, accuracyM: lastAccuracy });
    },
    (err) => {
      if (err.code === PERMISSION_DENIED) {
        onUpdate({ status: 'denied', position: null, accuracyM: null });
        return;
      }
      if (err.code === TIMEOUT && hasFix) {
        // A timeout after a fix is ignored: keep the last fix.
        return;
      }
      if (err.code === POSITION_UNAVAILABLE || err.code === TIMEOUT) {
        onUpdate({ status: 'unavailable', position: lastPosition, accuracyM: lastAccuracy });
      }
    },
    WATCH_OPTIONS,
  );

  return () => {
    if (stopped) return;
    stopped = true;
    geo.clearWatch(id);
  };
}
