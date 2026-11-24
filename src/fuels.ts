import type { FuelDef, FuelId } from './types';

export const FUELS: readonly FuelDef[] = [
  { id: 'g95', apiField: 'Precio Gasolina 95 E5', label: 'Gasolina 95', shortLabel: '95' },
  { id: 'diesel', apiField: 'Precio Gasoleo A', label: 'Gasóleo A', shortLabel: 'Diésel' },
  { id: 'g98', apiField: 'Precio Gasolina 98 E5', label: 'Gasolina 98', shortLabel: '98' },
  { id: 'dieselPremium', apiField: 'Precio Gasoleo Premium', label: 'Gasóleo Premium', shortLabel: 'Diésel+' },
  { id: 'dieselRenewable', apiField: 'Precio Diésel Renovable', label: 'Diésel renovable', shortLabel: 'HVO' },
  { id: 'lpg', apiField: 'Precio Gases licuados del petróleo', label: 'GLP (autogás)', shortLabel: 'GLP' },
  { id: 'g95Premium', apiField: 'Precio Gasolina 95 E5 Premium', label: 'Gasolina 95 Premium', shortLabel: '95+' },
  { id: 'cng', apiField: 'Precio Gas Natural Comprimido', label: 'GNC', shortLabel: 'GNC' },
  { id: 'adblue', apiField: 'Precio Adblue', label: 'AdBlue', shortLabel: 'AdBlue' },
];

export const DEFAULT_FUEL: FuelId = 'g95';

export function isFuelId(x: unknown): x is FuelId {
  return typeof x === 'string' && FUELS.some((f) => f.id === x);
}

export function fuelById(id: FuelId): FuelDef {
  const def = FUELS.find((f) => f.id === id);
  if (!def) throw new Error(`Unknown fuel id: ${String(id)}`);
  return def;
}
