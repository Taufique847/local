/**
 * Display formatting for customer-facing copy.
 *
 * Exists because the two things a home-services notification is actually about —
 * a time and an amount of money — were both being formatted ad hoc, and both
 * were wrong in ways a customer would notice:
 *
 *  - Appointment times went through `toLocaleString('en-US', {...})` with no
 *    `timeZone`, so they rendered in whatever zone the *server* happened to be
 *    in. On a UTC host, a 2:30 PM job in Dallas was confirmed to the customer as
 *    7:30 PM. The business's timezone was already stored and simply not used.
 *  - Money was interpolated raw, producing `$1234.5` in some places and
 *    `$1234.50` in others.
 */

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Formats a date in the business's timezone, including the zone abbreviation.
 *
 * The abbreviation is not decoration: a reminder that says "2:30 PM" without
 * saying which 2:30 PM is the thing customers call about.
 *
 * Falls back to UTC rather than throwing if the timezone string is not one the
 * runtime recognises — a bad `Business.timezone` should degrade a confirmation,
 * not fail a booking.
 */
export const formatDateTimeInZone = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };

  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(d);
  }
};

/** Date only, no time — for due dates, where a time would be misleading. */
export const formatDateInZone = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(d);
  }
};

/**
 * Formats a USD amount for display, always with two decimal places.
 *
 * Takes a number of dollars, not cents, because that is how every amount on
 * `Invoice` and `Estimate` is already stored.
 */
export const formatMoney = (amount: number | null | undefined): string => {
  if (typeof amount !== 'number' || !isFinite(amount)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export interface ZonedParts {
  /** 'Sunday' … 'Saturday', matching `Business.businessHours[].day`. */
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

/**
 * Breaks a UTC instant into its wall-clock parts in a given timezone.
 *
 * The missing primitive behind two separate defects. `businessHours` stores
 * `openTime`/`closeTime` as local strings like `'08:00'`, and the code comparing
 * against them used `getUTCHours()` — correct only for a business that happens to
 * operate in UTC. A Dallas shop open 08:00–18:00 was treated as open
 * 02:00–12:00 local.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is used rather than date
 * arithmetic because it is the only thing that gets DST transitions right, and
 * "is this Sunday in Phoenix?" is exactly the question that breaks on offsets.
 */
export const zonedParts = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): ZonedParts | null => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

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

  // `hour12: false` can render midnight as '24' in some ICU versions.
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

/** Parses an `'HH:MM'` business-hours string into minutes since midnight. */
export const parseTimeOfDay = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return h * 60 + m;
};

/**
 * Flattens the service address, which is a string on some records and an object
 * on others.
 *
 * Both shapes are in the database. Interpolating the object form yields
 * `[object Object]`, which has shipped to customers before.
 */
export const formatAddress = (
  address: unknown
): string | undefined => {
  if (!address) return undefined;
  if (typeof address === 'string') return address.trim() || undefined;

  if (typeof address === 'object') {
    const a = address as Record<string, unknown>;
    const parts = [a.street, a.city, a.state, a.zipCode ?? a.zip]
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.trim());
    return parts.length ? parts.join(', ') : undefined;
  }

  return undefined;
};
