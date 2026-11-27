# Gasolineras Tenerife

[![Test and deploy](https://github.com/eliasib13/tenerife-gas-prices/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/eliasib13/tenerife-gas-prices/actions/workflows/deploy.yml)

A mobile-first web app that shows current fuel prices at petrol stations in Tenerife on a map and in a list. The interface is in Spanish.

**Live app: <https://eliasib13.github.io/tenerife-gas-prices/>**

## Features

- **Price map:** every station selling the chosen fuel, with price pins coloured by price tier and the cheapest highlighted.
- **Map styles:** switch between OpenStreetMap, CARTO Voyager and CARTO Positron (the CARTO styles need `VITE_CARTO_KEY`).
- **Sortable list:** nearest first or cheapest first. Without a location, the list is sorted by price.
- **Search:** filter by brand, street, locality, municipality or postal code, ignoring accents and case.
- **Nine fuels:** Gasolina 95, 95 Premium and 98, Gasóleo A and Premium, renewable diesel, GLP, GNC and AdBlue.
- **Station details:** prices, opening status and directions in Google Maps or Apple Maps.
- **Installable and offline-friendly:** after the first visit, the app opens offline with the last saved prices. Map tiles still need a connection.

## Getting started

Requires Node.js 22.22.2 or later in the 22.x line, 24.15.0 or later in the 24.x line, or 26+. CI uses Node 22.

```sh
npm ci
npm run dev
```

The optional `VITE_CARTO_KEY` variable enables the CARTO Voyager and Positron map styles. Put it in `.env.local` (see `.env.example`) for local builds, or in the `VITE_CARTO_KEY` Actions secret for deploys. Without it, only OpenStreetMap is offered. The key is embedded in the public bundle, so restrict it by domain in the CARTO dashboard.

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the tests once |
| `npm run test:watch` | Run the tests in watch mode |
| `npm run typecheck` | Type-check only |

The service worker is registered only in production builds, so use `build` and `preview` to try offline behaviour.

## How it works

The app is written in TypeScript with [Leaflet](https://leafletjs.com/) and no UI framework, and built with Vite. It has no backend: the browser fetches prices directly from the Spanish government's API.

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Entry point; supplies browser dependencies |
| `src/app.ts` | App controller; connects state, map and UI |
| `src/data/` | API client, response parsing and Tenerife filter |
| `src/domain/` | Pure logic: ranking, search, opening hours, distance, formatting |
| `src/state/` | Store, selectors, saved preferences and station cache |
| `src/map/` | Leaflet map and price pins |
| `src/ui/` | UI components and Spanish strings |
| `src/geo/` | Geolocation |
| `src/pwa/`, `public/sw.js` | Service worker registration and service worker |

The API returns the whole province of Santa Cruz de Tenerife, so stations are filtered to the island by municipality ID, or by coordinates as a fallback.

Prices refresh on load, on demand, and on returning to the app when they are over 30 minutes old. Price tiers compare all stations selling the selected fuel and do not change while searching.

## Deployment

GitHub Actions tests and builds every pull request and every push to `main`. Pushes to `main` are then deployed to GitHub Pages. See [the workflow](.github/workflows/deploy.yml).

## Privacy

Your location is used in the browser to sort stations and centre the map; the app does not send it to a server of its own. Map tiles are requested from OpenStreetMap, which can reveal the area being viewed. Preferences and cached prices are kept in local storage.

## Data sources

- Prices and station data: [Spanish government fuel price service](https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/help)
- Map: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

This is an unofficial project. Prices may be out of date, so check them at the station.
