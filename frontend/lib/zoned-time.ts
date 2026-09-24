/**
 * Timezone helpers for the dispatch calendar.
 *
 * The appointments page rendered its hourly grid with `getUTCHours()` while printing
 * each card's time with a bare `toLocaleTimeString()`. So the row label was a UTC hour
 * and the text inside the card was the *viewer's* local time — four to eight hours
 * apart for a US user. Appointments visibly sat in the wrong row, and the empty-row
 * copy invited a booking at a time the backend would reject.
 *
 * Neither of those was the right zone. A dispatch board shows the day as it will be
 * lived: in the business's timezone, the same one the backend now uses to decide
 * whether a slot is inside opening hours. These mirror `backend/src/utils/format.ts`
 * so the two ends agree about what time it is.
 */

export interface ZonedParts {
  /** 'Sunday' … 'Saturday', matching `DayHours.day`. */
  weekday: string;
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0–23. */
  hour: number;
  minute: number;
  /** Minutes since local midnight, for comparing against openTime/closeTime. */
  minutesOfDay: number;
}

export const DEFAULT_TIMEZONE = 'America/New_York';

/** Breaks a UTC instant into its wall-clock parts in a given timezone. */
export const zonedParts = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): ZonedParts | null => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).formatToParts(d);
  }

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  // `hour12: false` renders midnight as '24' in some ICU versions.
  const rawHour = Number(get('hour'));
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(get('minute'));

  return {
    weekday: get('weekday'),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
};

/** `'HH:MM'` → minutes since midnight. */
export const parseTimeOfDay = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
};

/** `YYYY-MM-DD` for an instant, as read in the given timezone. */
export const zonedDateKey = (
  date: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string => {
  const p = zonedParts(date, timezone);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/**
 * Shifts a `YYYY-MM-DD` key by whole days.
 *
 * Pure string-and-calendar arithmetic, deliberately. The page used to do
 * `new Date(key)` → `setDate` → `toISOString().split('T')[0]`, which parses the key as
 * UTC midnight and then re-reads it in UTC: for a viewer west of Greenwich that lands
 * on the previous day, so the arrows could stick or skip.
 */
export const shiftDateKey = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return key;
  // Noon, so the shift cannot be perturbed by a DST transition.
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate()
  ).padStart(2, '0')}`;
};

/** The weekday name for a `YYYY-MM-DD` key — the key's own day, no zone involved. */
export const weekdayForDateKey = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
};

/** `HH:MM` in the business's timezone. */
export const formatTimeInZone = (
  value: string | Date,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  const p = zonedParts(value, timezone);
  if (!p) return typeof value === 'string' ? value : '';
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/**
 * The zone abbreviation, e.g. `CDT`.
 *
 * Shown once in the header rather than on every card. A board full of times with no
 * zone is exactly how a dispatcher and a technician end up an hour apart.
 */
export const zoneAbbreviation = (
  timezone: string = DEFAULT_TIMEZONE,
  at: Date = new Date()
): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
};

/** A 12-hour label for an hour number, e.g. `13` → `1 PM`. */
export const hourLabel = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
};
