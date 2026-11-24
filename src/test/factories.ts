import type { Station } from '../types';
import fixture from './fixtures/province-38.json';

export function makeStation(over: Partial<Station> = {}): Station {
  return {
    id: '1',
    brand: 'TEST',
    address: 'CALLE 1',
    locality: 'ADEJE',
    municipality: 'Adeje',
    municipalityId: '5691',
    postalCode: '38670',
    lat: 28.1,
    lon: -16.7,
    hours: 'L-D: 24H',
    prices: { g95: 1.5, diesel: 1.6 },
    ...over,
  };
}

export function makeRaw(over: Record<string, string> = {}): Record<string, string> {
  const first = fixture.ListaEESSPrecio[0] as unknown as Record<string, string>;
  return { ...first, ...over };
}
