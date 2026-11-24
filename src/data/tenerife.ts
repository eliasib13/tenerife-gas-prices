import type { Station } from '../types';

export const TENERIFE_MUNICIPALITY_IDS: ReadonlySet<string> = new Set([
  '5691', '5694', '5695', '5696', '5700', '5701', '5702', '5705', '5707', '5708',
  '5709', '5710', '5712', '5714', '5715', '5717', '5720', '5721', '5723', '5724',
  '5725', '5728', '5729', '5730', '5731', '5732', '5733', '5734', '5736', '5741',
  '5742',
]);

export const TENERIFE_BOUNDS = { south: 27.95, west: -16.95, north: 28.65, east: -16.1 } as const;

export function isInTenerife(s: Pick<Station, 'municipalityId' | 'lat' | 'lon'>): boolean {
  if (TENERIFE_MUNICIPALITY_IDS.has(s.municipalityId)) return true;
  return (
    s.lat >= TENERIFE_BOUNDS.south &&
    s.lat <= TENERIFE_BOUNDS.north &&
    s.lon >= TENERIFE_BOUNDS.west &&
    s.lon <= TENERIFE_BOUNDS.east
  );
}

export function filterTenerife(stations: Station[]): Station[] {
  return stations.filter(isInTenerife);
}
