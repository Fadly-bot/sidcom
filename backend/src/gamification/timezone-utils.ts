/**
 * Timezone and Date Utilities for Server-Authoritative Gamification
 */

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedTime {
  calendarDate: string; // YYYY-MM-DD
  hours: number;
  minutes: number;
  seconds: number;
  isWithinMidnightGrace: boolean; // 00:00:00 to 00:15:00
  secondsUntilMidnight: number;
}

export function getZonedTime(date: Date, timeZone: string): ZonedTime {
  const safeTimezone = isValidIanaTimezone(timeZone) ? timeZone : 'Asia/Jakarta';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  let year = '', month = '', day = '', hour = '0', minute = '0', second = '0';

  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'hour') hour = part.value;
    if (part.type === 'minute') minute = part.value;
    if (part.type === 'second') second = part.value;
  }

  const calendarDate = `${year}-${month}-${day}`;
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  const s = parseInt(second, 10);

  // 15-minute midnight grace: 00:00:00 to 00:15:00
  const isWithinMidnightGrace = h === 0 && m <= 15;

  // Seconds until local midnight (23:59:59 + 1s)
  const currentTotalSeconds = h * 3600 + m * 60 + s;
  const secondsUntilMidnight = Math.max(0, 86400 - currentTotalSeconds);

  return {
    calendarDate,
    hours: h,
    minutes: m,
    seconds: s,
    isWithinMidnightGrace,
    secondsUntilMidnight
  };
}

export function getPreviousDateString(calendarDate: string): string {
  const parts = calendarDate.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0] ?? calendarDate;
}

export function getNextDateString(calendarDate: string): string {
  const parts = calendarDate.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0] ?? calendarDate;
}

export function toCalendarDateString(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'string') {
    return val.split('T')[0] ?? val;
  }
  return String(val).split('T')[0] ?? null;
}

export function getDaysDifference(date1: unknown, date2: unknown): number {
  const d1Str = toCalendarDateString(date1);
  const d2Str = toCalendarDateString(date2);
  if (!d1Str || !d2Str) return 0;
  const parts1 = d1Str.split('-').map(Number);
  const parts2 = d2Str.split('-').map(Number);
  const y1 = parts1[0] ?? 2026;
  const m1 = parts1[1] ?? 1;
  const d1 = parts1[2] ?? 1;
  const y2 = parts2[0] ?? 2026;
  const m2 = parts2[1] ?? 1;
  const d2 = parts2[2] ?? 1;
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  const diffMs = t2 - t1;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
