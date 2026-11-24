// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { FUELS, DEFAULT_FUEL, isFuelId, fuelById } from './fuels';

describe('FUELS', () => {
  it('has 9 entries in the specified order with exact ids and apiFields', () => {
    expect(FUELS.map((f) => f.id)).toEqual([
      'g95', 'diesel', 'g98', 'dieselPremium', 'dieselRenewable',
      'lpg', 'g95Premium', 'cng', 'adblue',
    ]);
    expect(FUELS.map((f) => f.apiField)).toEqual([
      'Precio Gasolina 95 E5',
      'Precio Gasoleo A',
      'Precio Gasolina 98 E5',
      'Precio Gasoleo Premium',
      'Precio Diésel Renovable',
      'Precio Gases licuados del petróleo',
      'Precio Gasolina 95 E5 Premium',
      'Precio Gas Natural Comprimido',
      'Precio Adblue',
    ]);
  });

  it('has unique ids', () => {
    const ids = FUELS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has the exact labels and short labels', () => {
    expect(FUELS.map((f) => [f.id, f.label, f.shortLabel])).toEqual([
      ['g95', 'Gasolina 95', '95'],
      ['diesel', 'Gasóleo A', 'Diésel'],
      ['g98', 'Gasolina 98', '98'],
      ['dieselPremium', 'Gasóleo Premium', 'Diésel+'],
      ['dieselRenewable', 'Diésel renovable', 'HVO'],
      ['lpg', 'GLP (autogás)', 'GLP'],
      ['g95Premium', 'Gasolina 95 Premium', '95+'],
      ['cng', 'GNC', 'GNC'],
      ['adblue', 'AdBlue', 'AdBlue'],
    ]);
  });
});

describe('DEFAULT_FUEL', () => {
  it('is g95', () => {
    expect(DEFAULT_FUEL).toBe('g95');
  });
});

describe('isFuelId', () => {
  it('accepts a valid fuel id', () => {
    expect(isFuelId('diesel')).toBe(true);
  });

  it.each([['gasoil'], [''], [null], [42], ['toString']])(
    'rejects %j',
    (value) => {
      expect(isFuelId(value)).toBe(false);
    },
  );
});

describe('fuelById', () => {
  it('returns the definition for lpg and diesel', () => {
    expect(fuelById('lpg').label).toBe('GLP (autogás)');
    expect(fuelById('diesel').shortLabel).toBe('Diésel');
  });
});

describe('fuelById: unknown id', () => {
  it('throws an Error naming the unknown id', () => {
    expect(() => fuelById('nope' as never)).toThrow(new Error('Unknown fuel id: nope'));
  });
});
