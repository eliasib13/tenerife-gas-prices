// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseMitecoDate, formatClock, zonedParts, formatRelative, formatWhen, CANARY_TZ, MADRID_TZ,
} from './time';

describe('constants', () => {
  it('exports time zone ids', () => {
    expect(CANARY_TZ).toBe('Atlantic/Canary');
    expect(MADRID_TZ).toBe('Europe/Madrid');
  });
});

describe('parseMitecoDate', () => {
  it('parses winter (CET) Madrid time', () => {
    expect(parseMitecoDate('23/11/2026 23:36:13')?.toISOString()).toBe('2026-11-23T22:36:13.000Z');
  });
  it('parses summer (CEST) Madrid time', () => {
    expect(parseMitecoDate('15/07/2026 12:00:00')?.toISOString()).toBe('2026-07-15T10:00:00.000Z');
  });
  it('accepts missing seconds', () => {
    expect(parseMitecoDate('23/11/2026 23:36')?.toISOString()).toBe('2026-11-23T22:36:00.000Z');
  });
  it.each(['', '2026-11-23', '32/01/2026 10:00:00', '10/13/2026 10:00:00', '31/02/2026 10:00:00'])(
    'returns null for %j',
    (s) => {
      expect(parseMitecoDate(s)).toBeNull();
    },
  );
  it('returns null for undefined', () => {
    expect(parseMitecoDate(undefined)).toBeNull();
  });
  it('handles the time just after spring forward', () => {
    expect(parseMitecoDate('29/03/2026 03:30:00')?.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });
});

describe('formatClock', () => {
  it('uses Canary time in winter', () => {
    expect(formatClock(new Date('2026-11-23T22:36:13Z'))).toBe('22:36');
  });
  it('uses Canary time in summer', () => {
    expect(formatClock(new Date('2026-07-15T10:00:00Z'))).toBe('11:00');
  });
});

describe('zonedParts', () => {
  it('returns Canary parts with Monday = 0', () => {
    const p = zonedParts(new Date('2026-11-23T23:30:00Z'), 'Atlantic/Canary');
    expect(p.weekday).toBe(0);
    expect(p.hour).toBe(23);
    expect(p.minute).toBe(30);
    expect(p.year).toBe(2026);
    expect(p.month).toBe(11);
    expect(p.day).toBe(23);
    expect(p.second).toBe(0);
  });
  it('returns Madrid parts across midnight', () => {
    const p = zonedParts(new Date('2026-11-23T23:30:00Z'), 'Europe/Madrid');
    expect(p.weekday).toBe(1);
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(30);
    expect(p.day).toBe(24);
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const S = 1000, M = 60 * S, H = 60 * M;
  it('under a minute is ahora mismo', () => {
    expect(formatRelative(ago(30 * S), now)).toBe('ahora mismo');
    expect(formatRelative(ago(59 * S), now)).toBe('ahora mismo');
  });
  it('minutes', () => {
    expect(formatRelative(ago(60 * S), now)).toBe('hace 1 min');
    expect(formatRelative(ago(59 * M), now)).toBe('hace 59 min');
  });
  it('hours (floored)', () => {
    expect(formatRelative(ago(60 * M), now)).toBe('hace 1 h');
    expect(formatRelative(ago(23 * H + 59 * M), now)).toBe('hace 23 h');
  });
  it('days (floored)', () => {
    expect(formatRelative(ago(24 * H), now)).toBe('hace 1 d');
    expect(formatRelative(ago(25 * H), now)).toBe('hace 1 d');
    expect(formatRelative(ago(49 * H), now)).toBe('hace 2 d');
  });
  it('future dates are ahora mismo', () => {
    expect(formatRelative(new Date(now.getTime() + 5 * M), now)).toBe('ahora mismo');
  });
});

describe('formatWhen', () => {
  it('same Canary day shows clock only', () => {
    expect(formatWhen(new Date('2026-11-23T22:36:13Z'), new Date('2026-11-23T23:50:00Z'))).toBe('22:36');
  });
  it('different day shows DD/MM HH:mm', () => {
    expect(formatWhen(new Date('2026-11-23T22:36:13Z'), new Date('2026-11-24T08:00:00Z'))).toBe('23/11 22:36');
  });
  it('zero pads in summer time', () => {
    expect(formatWhen(new Date('2026-07-05T08:05:00Z'), new Date('2026-07-06T10:00:00Z'))).toBe('05/07 09:05');
  });
  it('day boundary is Canary, not UTC', () => {
    expect(formatWhen(new Date('2026-07-05T23:30:00Z'), new Date('2026-07-06T10:00:00Z'))).toBe('00:30');
  });
});

describe('parseMitecoDate: boundaries', () => {
  it.each([
    ['01/01/2026 00:00:00', '2025-12-31T23:00:00.000Z'],
    ['31/12/2026 23:59:59', '2026-12-31T22:59:59.000Z'],
    ['01/12/2026 10:59', '2026-12-01T09:59:00.000Z'],
    ['15/06/2026 10:00:59', '2026-06-15T08:00:59.000Z'],
    ['30/04/2026 12:00', '2026-04-30T10:00:00.000Z'],
    ['28/02/2027 12:00', '2027-02-28T11:00:00.000Z'],
    ['29/02/2028 12:00', '2028-02-29T11:00:00.000Z'],
    ['1/2/2026 9:05', '2026-02-01T08:05:00.000Z'],
  ])('accepts %s', (s, iso) => {
    expect(parseMitecoDate(s)?.toISOString()).toBe(iso);
  });

  it.each([
    '29/02/2027 12:00',
    '30/02/2028 12:00',
    '31/04/2026 12:00',
    '00/01/2026 10:00',
    '10/00/2026 10:00',
    '10/13/2026 10:00',
    '10/01/2026 24:00',
    '10/01/2026 10:60',
    '10/01/2026 10:00:60',
    'x23/11/2026 10:00:00',
    '23/11/2026 10:00:00 x',
    '23/11/2026 10:00:00:00',
  ])('rejects %j', (s) => {
    expect(parseMitecoDate(s)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(parseMitecoDate('  23/11/2026 23:36:13 \n')?.toISOString()).toBe('2026-11-23T22:36:13.000Z');
  });

  it('resolves wall times shortly before a DST change using the offset in force', () => {
    expect(parseMitecoDate('29/03/2026 00:30:00')?.toISOString()).toBe('2026-03-28T23:30:00.000Z');
    expect(parseMitecoDate('25/10/2026 00:30:00')?.toISOString()).toBe('2026-10-24T22:30:00.000Z');
    expect(parseMitecoDate('25/10/2026 04:30:00')?.toISOString()).toBe('2026-10-25T03:30:00.000Z');
  });
});

describe('zonedParts: weekday for every day', () => {
  it.each([
    ['2026-11-23T12:00:00Z', 0],
    ['2026-11-24T12:00:00Z', 1],
    ['2026-11-25T12:00:00Z', 2],
    ['2026-11-26T12:00:00Z', 3],
    ['2026-11-27T12:00:00Z', 4],
    ['2026-11-28T12:00:00Z', 5],
    ['2026-11-29T12:00:00Z', 6],
  ])('%s has weekday %d', (iso, wd) => {
    expect(zonedParts(new Date(iso), CANARY_TZ).weekday).toBe(wd);
  });
});

describe('formatWhen: same-day requires year, month and day to match', () => {
  const when = new Date('2026-11-23T12:00:00Z');
  it('same day and month, different year shows date and clock', () => {
    expect(formatWhen(when, new Date('2027-11-23T12:00:00Z'))).toBe('23/11 12:00');
  });
  it('same day and year, different month shows date and clock', () => {
    expect(formatWhen(when, new Date('2026-12-23T12:00:00Z'))).toBe('23/11 12:00');
  });
  it('same month and year, different day shows date and clock', () => {
    expect(formatWhen(when, new Date('2026-11-24T12:00:00Z'))).toBe('23/11 12:00');
  });
  it('identical day shows the clock only', () => {
    expect(formatWhen(when, new Date('2026-11-23T20:00:00Z'))).toBe('12:00');
  });
});
