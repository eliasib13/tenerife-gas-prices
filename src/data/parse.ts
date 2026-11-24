import type { FuelId, Station } from '../types';
import { FUELS } from '../fuels';
import { parseMitecoDate } from '../domain/time';

export class ParseError extends Error {
  override name = 'ParseError';
}

export function parseDecimal(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parsePrice(s: unknown): number | null {
  const n = parseDecimal(s);
  return n !== null && Number.isFinite(n) && n > 0 ? n : null;
}

function str(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === 'string' ? v.trim() : '';
}

export function parseStation(raw: unknown): Station | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const id = str(rec, 'IDEESS');
  if (id === '') return null;
  const lat = parseDecimal(rec['Latitud']);
  const lon = parseDecimal(rec['Longitud (WGS84)']);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  const prices: Partial<Record<FuelId, number>> = {};
  for (const fuel of FUELS) {
    const p = parsePrice(rec[fuel.apiField]);
    if (p !== null) prices[fuel.id] = p;
  }
  return {
    id,
    brand: str(rec, 'Rótulo'),
    address: str(rec, 'Dirección'),
    locality: str(rec, 'Localidad'),
    municipality: str(rec, 'Municipio'),
    municipalityId: str(rec, 'IDMunicipio'),
    postalCode: str(rec, 'C.P.'),
    lat,
    lon,
    hours: str(rec, 'Horario'),
    prices,
  };
}

export function parseResponse(json: unknown): { stations: Station[]; sourceDate: Date | null } {
  if (typeof json !== 'object' || json === null) throw new ParseError('Response is not an object');
  const obj = json as Record<string, unknown>;
  const list = obj['ListaEESSPrecio'];
  if (!Array.isArray(list)) throw new ParseError('ListaEESSPrecio is not an array');
  const result = obj['ResultadoConsulta'];
  if (result !== undefined && result !== null) {
    if (typeof result !== 'string' || result.trim().toUpperCase() !== 'OK') {
      throw new ParseError(`ResultadoConsulta is not OK: ${String(result)}`);
    }
  }
  const seen = new Set<string>();
  const stations: Station[] = [];
  for (const row of list) {
    const s = parseStation(row);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    stations.push(s);
  }
  return { stations, sourceDate: parseMitecoDate(obj['Fecha']) };
}
