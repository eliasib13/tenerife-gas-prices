// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { TENERIFE_MUNICIPALITY_IDS, isInTenerife, filterTenerife } from './tenerife';
import { parseResponse } from './parse';
import fixture from '../test/fixtures/province-38.json';

describe('TENERIFE_MUNICIPALITY_IDS', () => {
  it('has 31 ids including Santa Cruz de Tenerife, Vilaflor and not the other islands', () => {
    expect(TENERIFE_MUNICIPALITY_IDS.size).toBe(31);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5691')).toBe(true);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5728')).toBe(true);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5742')).toBe(true);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5693')).toBe(false);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5727')).toBe(false);
    expect(TENERIFE_MUNICIPALITY_IDS.has('5740')).toBe(false);
  });
});

describe('filterTenerife on the province-38 fixture', () => {
  const stations = filterTenerife(parseResponse(fixture).stations);

  it('keeps 212 Tenerife stations', () => {
    expect(stations).toHaveLength(212);
  });

  it('contains stations 11525 and 16555', () => {
    const ids = stations.map((s) => s.id);
    expect(ids).toContain('11525');
    expect(ids).toContain('16555');
  });

  it('drops stations from El Hierro and La Gomera', () => {
    const ids = stations.map((s) => s.id);
    expect(ids).not.toContain('7833');
    expect(ids).not.toContain('7953');
    expect(ids).not.toContain('7878');
  });
});

describe('isInTenerife', () => {
  it('uses the bounding box when the municipality id is unknown', () => {
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: -16.5 })).toBe(true);
  });

  it('trusts a known municipality id even outside the box', () => {
    expect(isInTenerife({ municipalityId: '5691', lat: 0, lon: 0 })).toBe(true);
  });

  it('returns false for an unknown id far outside the island (La Palma)', () => {
    expect(isInTenerife({ municipalityId: '9999', lat: 28.68, lon: -17.8 })).toBe(false);
  });

  it('includes the bounding box edge exactly (south-west corner)', () => {
    expect(isInTenerife({ municipalityId: '9999', lat: 27.95, lon: -16.95 })).toBe(true);
  });

  const IDS = [
    '5691', '5694', '5695', '5696', '5700', '5701', '5702', '5705', '5707', '5708',
    '5709', '5710', '5712', '5714', '5715', '5717', '5720', '5721', '5723', '5724',
    '5725', '5728', '5729', '5730', '5731', '5732', '5733', '5734', '5736', '5741',
    '5742',
  ];

  it('lists exactly the 31 expected municipality ids', () => {
    expect([...TENERIFE_MUNICIPALITY_IDS].sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('accepts municipality %s even far outside the box', (id) => {
    expect(isInTenerife({ municipalityId: id, lat: 0, lon: 0 })).toBe(true);
  });

  it('rejects Alajero (5693, La Gomera) at a La Gomera coordinate and the empty id', () => {
    expect(isInTenerife({ municipalityId: '5693', lat: 28.08, lon: -17.21 })).toBe(false);
    expect(isInTenerife({ municipalityId: '', lat: 0, lon: 0 })).toBe(false);
  });

  it('includes points exactly on each bound', () => {
    const b = { south: 27.95, west: -16.95, north: 28.65, east: -16.1 };
    expect(isInTenerife({ municipalityId: '9999', lat: b.south, lon: -16.5 })).toBe(true);
    expect(isInTenerife({ municipalityId: '9999', lat: b.north, lon: -16.5 })).toBe(true);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: b.west })).toBe(true);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: b.east })).toBe(true);
    expect(isInTenerife({ municipalityId: '9999', lat: b.north, lon: b.east })).toBe(true);
  });

  it('excludes points just beyond each bound', () => {
    expect(isInTenerife({ municipalityId: '9999', lat: 27.949, lon: -16.5 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.651, lon: -16.5 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: -16.951 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: -16.099 })).toBe(false);
  });

  it('requires both lat and lon inside the box', () => {
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: -20 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 28.3, lon: 0 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 40, lon: -16.5 })).toBe(false);
    expect(isInTenerife({ municipalityId: '9999', lat: 0, lon: -16.5 })).toBe(false);
  });
});
