export const CANARY_TZ = 'Atlantic/Canary';
export const MADRID_TZ = 'Europe/Madrid';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: number; // Mon=0 .. Sun=6
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const m: Record<string, string> = {};
  for (const p of getFormatter(timeZone).formatToParts(date)) m[p.type] = p.value;
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    weekday: WEEKDAYS[m.weekday ?? ''] ?? 0,
    hour: Number(m.hour) % 24,
    minute: Number(m.minute),
    second: Number(m.second),
  };
}

function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function zonedWallTimeToDate(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return new Date(second);
}

const MITECO_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function parseMitecoDate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const m = MITECO_RE.exec(s.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = m[6] === undefined ? 0 : Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 59) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > dim) return null;
  return zonedWallTimeToDate(y, mo, d, h, mi, sec, MADRID_TZ);
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatClock(date: Date, timeZone: string = CANARY_TZ): string {
  const p = zonedParts(date, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatWhen(date: Date, now: Date, timeZone: string = CANARY_TZ): string {
  const a = zonedParts(date, timeZone);
  const b = zonedParts(now, timeZone);
  if (a.year === b.year && a.month === b.month && a.day === b.day) return formatClock(date, timeZone);
  return `${pad(a.day)}/${pad(a.month)} ${pad(a.hour)}:${pad(a.minute)}`;
}

export function formatRelative(from: Date, now: Date): string {
  const sec = Math.floor((now.getTime() - from.getTime()) / 1000);
  if (sec < 60) return 'ahora mismo';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
