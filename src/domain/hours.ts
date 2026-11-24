import type { OpenState } from '../types';
import { CANARY_TZ, zonedParts } from './time';

export interface DayInterval {
  start: number;
  end: number;
}
export type WeekSchedule = DayInterval[][];

const DAY_INDEX: Record<string, number> = { L: 0, M: 1, X: 2, J: 3, V: 4, S: 5, D: 6 };
const TIME_RE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function toMinutes(h: string, m: string): number | null {
  const hh = Number(h);
  const mm = Number(m);
  if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;
  return hh * 60 + mm;
}

export function parseSchedule(horario: string): WeekSchedule | null {
  if (typeof horario !== 'string' || horario.trim() === '') return null;
  const week: WeekSchedule = [[], [], [], [], [], [], []];
  for (const raw of horario.split(';')) {
    const seg = raw.trim();
    const colon = seg.indexOf(':');
    if (colon < 0) return null;
    const days = seg.slice(0, colon).trim().toUpperCase();
    const times = seg.slice(colon + 1).trim();

    let a: number | undefined;
    let b: number | undefined;
    const range = /^([A-Z])-([A-Z])$/.exec(days);
    if (range) {
      a = DAY_INDEX[range[1] as string];
      b = DAY_INDEX[range[2] as string];
    } else if (/^[A-Z]$/.test(days)) {
      a = b = DAY_INDEX[days];
    }
    if (a === undefined || b === undefined || a > b) return null;

    let interval: DayInterval;
    if (times.toUpperCase() === '24H') {
      interval = { start: 0, end: 1440 };
    } else {
      const t = TIME_RE.exec(times);
      if (!t) return null;
      const start = toMinutes(t[1] as string, t[2] as string);
      let end = toMinutes(t[3] as string, t[4] as string);
      if (start === null || end === null) return null;
      if (end === 0) end = 1440;
      else if (end < start) end += 1440;
      interval = { start, end };
    }
    for (let i = a; i <= b; i++) (week[i] as DayInterval[]).push({ ...interval });
  }
  return week;
}

export function openStatus(horario: string, now: Date, timeZone: string = CANARY_TZ): OpenState {
  const sched = parseSchedule(horario);
  if (!sched) return 'unknown';
  const p = zonedParts(now, timeZone);
  const m = p.hour * 60 + p.minute;
  const today = sched[p.weekday] ?? [];
  if (today.some((i) => i.start <= m && m < i.end)) return 'open';
  const prev = sched[(p.weekday + 6) % 7] ?? [];
  if (prev.some((i) => i.end > 1440 && m < i.end - 1440)) return 'open';
  return 'closed';
}

export function is24h(horario: string): boolean {
  const sched = parseSchedule(horario);
  if (!sched) return false;
  return sched.every((d) => d.some((i) => i.start === 0 && i.end === 1440));
}
