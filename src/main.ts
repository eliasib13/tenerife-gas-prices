import 'leaflet/dist/leaflet.css';
import './styles/tokens.css';
import './styles.css';
import { createApp } from './app';
import { fetchStations } from './data/api';
import { detectPlatform } from './domain/navigation';
import { createMapView } from './map/mapView';
import { registerServiceWorker } from './pwa/registerSW';

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

createApp({
  root: document.getElementById('app')!,
  fetchStations: () => fetchStations(),
  geolocation: navigator.geolocation,
  createMapView: (el, o) => createMapView(el, { ...o, cartoKey: import.meta.env.VITE_CARTO_KEY }),
  storage: safeLocalStorage(),
  now: () => new Date(),
  isOnline: () => navigator.onLine !== false,
  win: window,
  doc: document,
  platform: detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
});

void registerServiceWorker();
