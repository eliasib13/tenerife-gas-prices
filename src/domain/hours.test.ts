// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseSchedule, openStatus, is24h } from './hours';

const FULL = [{ start: 0, end: 1440 }];
const OVERNIGHT = 'L-J: 06:00-00:00; V: 24H; S-D: 06:00-02:00';

describe('parseSchedule', () => {
  it('parses L-D: 24H', () => {
    const s = parseSchedule('L-D: 24H');
    expect(s).toEqual([FULL, FULL, FULL, FULL, FULL, FULL, FULL]);
    expect(is24h('L-D: 24H')).toBe(true);
  });
  it('parses weekday and Sunday ranges', () => {
    const h = 'L-S: 06:00-22:00; D: 07:00-22:00';
    const s = parseSchedule(h)!;
    for (let i = 0; i < 6; i++) expect(s[i]).toEqual([{ start: 360, end: 1320 }]);
    expect(s[6]).toEqual([{ start: 420, end: 1320 }]);
    expect(is24h(h)).toBe(false);
  });
  it('parses X as Wednesday', () => {
    const s = parseSchedule('L-M: 06:00-22:00; X: 05:30-19:30; J-S: 06:00-22:00; D: 07:00-21:00')!;
    expect(s[2]).toEqual([{ start: 330, end: 1170 }]);
  });
  it('treats end 00:00 as 1440', () => {
    const s = parseSchedule('L-D: 06:00-00:00')!;
    expect(s[0]).toEqual([{ start: 360, end: 1440 }]);
  });
  it('handles overnight end', () => {
    const s = parseSchedule(OVERNIGHT)!;
    expect(s[5]).toEqual([{ start: 360, end: 1560 }]);
    expect(s[4]).toEqual(FULL);
    expect(s[0]).toEqual([{ start: 360, end: 1440 }]);
  });
  it('accepts single-digit hours and leaves unmentioned days empty', () => {
    const s = parseSchedule('L-S: 7:00-22:00')!;
    expect(s[0]?.[0]?.start).toBe(420);
    expect(s[6]).toEqual([]);
  });
  it('single day 24H is not is24h', () => {
    const s = parseSchedule('L: 24H')!;
    expect(s[0]).toEqual(FULL);
    for (let i = 1; i < 7; i++) expect(s[i]).toEqual([]);
    expect(is24h('L: 24H')).toBe(false);
  });
  it.each(['', '24H', 'Z-D: 24H', 'D-L: 24H', 'L-D: 25:00-26:00', 'L-D 06:00-22:00', 'L-D: 06:00'])(
    'returns null for %j',
    (h) => {
      expect(parseSchedule(h)).toBeNull();
    },
  );
});

describe('openStatus', () => {
  const H = 'L-D: 06:00-22:00';
  it('open just before closing', () => {
    expect(openStatus(H, new Date('2026-11-23T21:59:00Z'))).toBe('open');
  });
  it('closed at end (exclusive)', () => {
    expect(openStatus(H, new Date('2026-11-23T22:00:00Z'))).toBe('closed');
  });
  it('closed just before opening', () => {
    expect(openStatus(H, new Date('2026-11-23T05:59:00Z'))).toBe('closed');
  });
  it('open at opening (inclusive)', () => {
    expect(openStatus(H, new Date('2026-11-23T06:00:00Z'))).toBe('open');
  });
  it('overnight interval from previous day', () => {
    expect(openStatus(OVERNIGHT, new Date('2026-11-30T01:00:00Z'))).toBe('open');
    expect(openStatus(OVERNIGHT, new Date('2026-11-30T02:00:00Z'))).toBe('closed');
  });
  it('closed on unlisted day', () => {
    expect(openStatus('L-V: 07:00-15:00', new Date('2026-11-28T10:00:00Z'))).toBe('closed');
  });
  it('unknown for garbage', () => {
    expect(openStatus('garbage', new Date('2026-11-23T10:00:00Z'))).toBe('unknown');
  });
  it('uses Canary time in summer', () => {
    expect(openStatus(H, new Date('2026-07-15T21:30:00Z'))).toBe('closed');
  });
});

describe('parseSchedule grammar boundaries', () => {
  it.each([
    'L-D: 25:00-26:00',
    'L: 08:60-09:00',
    'L: 08:00-09:60',
    'L: 24:30-25:00',
    'L: 24:01-23:00',
    'L: 08:00-24:30',
    'L: 25:00-23:00',
    '   ',
    ':08:00-12:00',
    'XL-L: 08:00-12:00',
    'L-V-D: 08:00-12:00',
    'XL: 08:00-12:00',
    'LX: 08:00-12:00',
    'L: 108:00-12:00',
    'L: 08:00-12:001',
    'L: 08:00-12:00x',
    'L: x08:00-12:00',
  ])('returns null for %j', (h) => {
    expect(parseSchedule(h)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parseSchedule(null as unknown as string)).toBeNull();
    expect(parseSchedule(5 as unknown as string)).toBeNull();
  });

  it('accepts 24:00 as an end time and 59 as the maximum minute', () => {
    expect(parseSchedule('L: 08:00-24:00')![0]).toEqual([{ start: 480, end: 1440 }]);
    expect(parseSchedule('L: 08:59-23:59')![0]).toEqual([{ start: 539, end: 1439 }]);
  });

  it('trims whitespace and accepts lowercase day letters', () => {
    const s = parseSchedule(' l-v : 08:00-12:00 ; d : 09:00-10:00 ')!;
    for (let i = 0; i < 5; i++) expect(s[i]).toEqual([{ start: 480, end: 720 }]);
    expect(s[5]).toEqual([]);
    expect(s[6]).toEqual([{ start: 540, end: 600 }]);
  });

  it('treats 00:00-00:00 as a full day', () => {
    expect(parseSchedule('L: 00:00-00:00')![0]).toEqual([{ start: 0, end: 1440 }]);
  });

  it('keeps start === end as an empty interval without rolling over', () => {
    expect(parseSchedule('L: 08:00-08:00')![0]).toEqual([{ start: 480, end: 480 }]);
    expect(openStatus('L: 08:00-08:00', new Date('2026-11-23T08:00:00Z'))).toBe('closed');
  });
});

describe('openStatus overnight spill-over', () => {
  const SAT = 'S: 08:00-09:00; S: 23:00-02:00';
  it('is open on Sunday 01:00 and closed at 02:00 when only some Saturday intervals overflow', () => {
    expect(openStatus(SAT, new Date('2026-11-29T01:00:00Z'))).toBe('open');
    expect(openStatus(SAT, new Date('2026-11-29T01:59:00Z'))).toBe('open');
    expect(openStatus(SAT, new Date('2026-11-29T02:00:00Z'))).toBe('closed');
  });
  it('is open late Saturday and not spilled over from a non-overflowing previous day', () => {
    expect(openStatus(SAT, new Date('2026-11-28T23:30:00Z'))).toBe('open');
    expect(openStatus('S: 08:00-09:00', new Date('2026-11-29T00:30:00Z'))).toBe('closed');
  });
});

describe('is24h edge cases', () => {
  it('is false for unparseable input', () => {
    expect(is24h('garbage')).toBe(false);
    expect(is24h('')).toBe(false);
  });
  it('is true for seven separate 24H days', () => {
    expect(is24h('L: 24H; M: 24H; X: 24H; J: 24H; V: 24H; S: 24H; D: 24H')).toBe(true);
  });
  it('is false for a partial schedule', () => {
    expect(is24h('L-S: 24H')).toBe(false);
    expect(is24h('L-D: 06:00-00:00')).toBe(false);
    expect(is24h('L-D: 00:00-12:00')).toBe(false);
  });
});
