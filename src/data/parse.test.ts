// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseDecimal, parsePrice, parseStation, parseResponse, ParseError } from './parse';
import { makeRaw } from '../test/factories';
import fixture from '../test/fixtures/province-38.json';

describe('parseDecimal', () => {
  it.each([
    ['1,718', 1.718],
    ['-16,739556', -16.739556],
    ['1.5', 1.5],
    ['  2,0 ', 2],
    ['42', 42],
  ])('parses %j as %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['1,2,3'],
    ['1.234,5'],
    [undefined],
    [1.5],
  ])('returns null for %j', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('parsePrice', () => {
  it('returns null for zero', () => {
    expect(parsePrice('0,000')).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(parsePrice('-1,2')).toBeNull();
  });

  it('parses a positive price', () => {
    expect(parsePrice('1,529')).toBe(1.529);
  });
});

describe('parseStation', () => {
  it('parses the first fixture row into a Station', () => {
    const s = parseStation(makeRaw());
    expect(s).not.toBeNull();
    expect(s!.id).toBe('11525');
    expect(s!.brand).toBe('SHELL');
    expect(s!.municipalityId).toBe('5691');
    expect(s!.lat).toBe(28.123639);
    expect(s!.lon).toBe(-16.739556);
    expect(s!.hours).toBe('L-D: 24H');
    expect(s!.postalCode).toBe('38670');
  });

  it('includes only the fuels that have a price', () => {
    const s = parseStation(makeRaw());
    expect(s!.prices).toEqual({
      diesel: 1.718,
      dieselPremium: 1.838,
      g95: 1.529,
      g98: 1.645,
    });
  });

  it('includes lpg when the LPG field has a price', () => {
    const s = parseStation(makeRaw({ 'Precio Gases licuados del petróleo': '0,920' }));
    expect(s!.prices.lpg).toBe(0.92);
  });

  it.each([
    ['empty IDEESS', { IDEESS: '' }],
    ['empty Latitud', { Latitud: '' }],
    ['non-numeric Longitud', { 'Longitud (WGS84)': 'x' }],
    ['latitude out of range', { Latitud: '95,0' }],
    ['lat and lon both zero', { Latitud: '0,0', 'Longitud (WGS84)': '0,0' }],
  ])('returns null for %s', (_label, over) => {
    expect(parseStation(makeRaw(over))).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'string'],
  ])('returns null for %s input', (_label, raw) => {
    expect(parseStation(raw)).toBeNull();
  });

  it('trims the brand', () => {
    const s = parseStation(makeRaw({ 'Rótulo': '  REPSOL  ' }));
    expect(s!.brand).toBe('REPSOL');
  });

  it('uses an empty string for a missing string field', () => {
    const raw = makeRaw();
    delete (raw as Record<string, string | undefined>)['Dirección'];
    const s = parseStation(raw);
    expect(s!.address).toBe('');
  });
});

describe('parseResponse', () => {
  it('parses the fixture into 243 stations with unique ids', () => {
    const result = parseResponse(fixture);
    expect(result.stations).toHaveLength(243);
    const ids = result.stations.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns the fixture source date as Europe/Madrid wall time', () => {
    const result = parseResponse(fixture);
    expect(result.sourceDate).toEqual(new Date('2026-11-23T22:36:13Z'));
  });

  it.each([
    ['null', null],
    ['an empty array', []],
    ['an object without a list', {}],
    ['a list that is not an array', { ListaEESSPrecio: 'x' }],
    ['a non-OK result', { ResultadoConsulta: 'ERROR', ListaEESSPrecio: [] }],
  ])('throws ParseError for %s', (_label, json) => {
    expect(() => parseResponse(json)).toThrow(ParseError);
  });

  it('accepts an OK result with extra whitespace and case, giving 0 stations', () => {
    const result = parseResponse({ ResultadoConsulta: ' ok ', ListaEESSPrecio: [] });
    expect(result.stations).toHaveLength(0);
  });

  it('skips invalid rows and keeps the first of duplicate ids', () => {
    const json = {
      ResultadoConsulta: 'OK',
      ListaEESSPrecio: [
        makeRaw({ IDEESS: '1', Rótulo: 'FIRST' }),
        makeRaw({ IDEESS: '2', Latitud: '95,0' }),
        makeRaw({ IDEESS: '1', Rótulo: 'DUPLICATE' }),
      ],
    };
    const result = parseResponse(json);
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]!.id).toBe('1');
    expect(result.stations[0]!.brand).toBe('FIRST');
  });

  it('returns a null sourceDate for a bad Fecha without throwing', () => {
    const result = parseResponse({ Fecha: 'not a date', ResultadoConsulta: 'OK', ListaEESSPrecio: [] });
    expect(result.sourceDate).toBeNull();
  });
});

describe('mutation hardening: parse', () => {
  it('ParseError has name ParseError and is an Error', () => {
    const e = new ParseError('x');
    expect(e.name).toBe('ParseError');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('x');
  });

  it.each([['x1'], ['1x'], ['a1,5'], ['1,5a'], [' -x']])('parseDecimal rejects %j (anchored)', (s) => {
    expect(parseDecimal(s)).toBeNull();
  });

  it('keeps address, locality, municipality, municipalityId from their API fields', () => {
    const s = parseStation(makeRaw({
      'Dirección': ' CALLE A 1 ',
      Localidad: ' LOC ',
      Municipio: ' MUN ',
      IDMunicipio: ' 77 ',
    }));
    expect(s!.address).toBe('CALLE A 1');
    expect(s!.locality).toBe('LOC');
    expect(s!.municipality).toBe('MUN');
    expect(s!.municipalityId).toBe('77');
  });

  it('uses empty strings for missing locality and municipality', () => {
    const raw = makeRaw();
    delete (raw as Record<string, string | undefined>)['Localidad'];
    delete (raw as Record<string, string | undefined>)['Municipio'];
    const s = parseStation(raw);
    expect(s!.locality).toBe('');
    expect(s!.municipality).toBe('');
  });

  it.each([
    ['lat 90', { Latitud: '90', 'Longitud (WGS84)': '10' }],
    ['lat -90', { Latitud: '-90', 'Longitud (WGS84)': '10' }],
    ['lon 180', { Latitud: '10', 'Longitud (WGS84)': '180' }],
    ['lon -180', { Latitud: '10', 'Longitud (WGS84)': '-180' }],
    ['lat 0 with lon nonzero', { Latitud: '0', 'Longitud (WGS84)': '-16,5' }],
    ['lon 0 with lat nonzero', { Latitud: '28,1', 'Longitud (WGS84)': '0' }],
  ])('accepts %s', (_l, over) => {
    expect(parseStation(makeRaw(over))).not.toBeNull();
  });

  it.each([
    ['lat 90.0001', { Latitud: '90,0001', 'Longitud (WGS84)': '10' }],
    ['lat -90.0001', { Latitud: '-90,0001', 'Longitud (WGS84)': '10' }],
    ['lon 180.0001', { Latitud: '10', 'Longitud (WGS84)': '180,0001' }],
    ['lon -180.0001', { Latitud: '10', 'Longitud (WGS84)': '-180,0001' }],
    ['lat and lon 0', { Latitud: '0', 'Longitud (WGS84)': '0' }],
  ])('rejects %s', (_l, over) => {
    expect(parseStation(makeRaw(over))).toBeNull();
  });

  it.each([[undefined], [42], [true], [[]]])('parseStation returns null for %j', (raw) => {
    expect(parseStation(raw)).toBeNull();
  });

  it('parseResponse throws ParseError (not a TypeError) for null and a non-object', () => {
    expect(() => parseResponse(null)).toThrow(ParseError);
    expect(() => parseResponse('x')).toThrow(ParseError);
    expect(() => parseResponse(undefined)).toThrow(ParseError);
  });

  it('accepts a missing or null ResultadoConsulta', () => {
    expect(parseResponse({ ListaEESSPrecio: [] }).stations).toEqual([]);
    expect(parseResponse({ ResultadoConsulta: null, ListaEESSPrecio: [] }).stations).toEqual([]);
  });

  it.each([['KO'], [''], [5], [false], [{}]])('throws ParseError for ResultadoConsulta %j', (r) => {
    expect(() => parseResponse({ ResultadoConsulta: r, ListaEESSPrecio: [] })).toThrow(ParseError);
  });

  it('accepts ResultadoConsulta OK', () => {
    expect(parseResponse({ ResultadoConsulta: 'OK', ListaEESSPrecio: [] }).stations).toEqual([]);
  });
});

describe('mutation hardening: parse anchors and plain decimals', () => {
  it.each([['1e5'], ['1,5e3'], ['0x10'], ['0b11'], ['1.5e3'], ['5abc'], ['abc5']])('parseDecimal rejects %j', (s) => {
    expect(parseDecimal(s)).toBeNull();
  });

  it('parsePrice rejects exponent notation', () => {
    expect(parsePrice('1e5')).toBeNull();
    expect(parsePrice('0x10')).toBeNull();
  });
});
