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

/**
 * The offset of a timezone at a given instant, in milliseconds.
 *
 * Derived rather than looked up: format the instant in the target zone, rebuild
 * those wall-clock parts as if they were UTC, and subtract. Whatever ICU says the
 * local clock read is what we get, including DST and the historical offset changes
 * that a fixed table would miss.
 */
const zoneOffsetMs = (instant: Date, timezone: string): number => {
  const p = zonedParts(instant, timezone);
  if (!p) return 0;

  // Seconds and milliseconds are not in `zonedParts`, and no real zone has a
  // sub-minute offset, so carrying them through from the instant is exact.
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    instant.getUTCSeconds(),
    instant.getUTCMilliseconds()
  );

  return asUtc - instant.getTime();
};

/**
 * The inverse of `zonedParts`: a local wall-clock time in some zone → a UTC instant.
 *
 * This is the primitive whose absence caused the bug it now fixes. `businessHours`
 * stores `'08:00'` meaning eight in the morning *where the business is*, and
 * `getAvailableSlots` had nothing to turn that into an instant, so it reached for
 * `Date.UTC(y, m, d, 8, 0)` — eight in the morning in Greenwich. A New York shop
 * open 08:00–18:00 was offered slots covering 03:00–13:00 Eastern, and the booking
 * path, which *did* compare in the business timezone, rejected most of them with a
 * 409. The two halves of the same feature disagreed about what time it was.
 *
 * Two candidates are generated and each is **verified by reading it back**, rather
 * than trusting a correction. The offset depends on the instant being searched for,
 * so the first guess uses the offset at the naive instant and the second uses the
 * offset at wherever the first landed. Simply preferring the second is wrong: across
 * a spring-forward gap the two corrections oscillate, and picking either blindly
 * returns a time an hour off the one requested in a direction that depends on which.
 *
 * Two ambiguities are inherent to wall-clock input, not to this implementation:
 *
 *  - **A time that does not exist.** On a spring-forward day 02:30 is skipped
 *    entirely, so neither candidate reads back as 02:30. The later one is returned —
 *    the instant the clock actually reached, which reads as 03:30 local. Callers that
 *    care, and slot generation does, round-trip through `zonedParts` and treat a
 *    mismatch as "no such time today" rather than offering the wrong hour.
 *  - **A time that happens twice.** On a fall-back day 01:30 occurs in both offsets
 *    and both candidates read back correctly; the earlier is returned. Offering a
 *    customer two indistinguishable 01:30 slots is worse than offering one.
 */
export const zonedWallClockToUtc = (
  year: number,
  /** 1–12, matching `ZonedParts.month`. */
  month: number,
  day: number,
  /** Minutes since local midnight, matching `parseTimeOfDay`. */
  minutesOfDay: number,
  timezone: string = DEFAULT_TIMEZONE
): Date => {
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + minutesOfDay * 60_000;

  /**
   * Whether an instant's local clock is the one that was asked for.
   *
   * Stated as the definition — shifting the instant by its own zone offset must land
   * back on the requested wall clock — rather than as a field-by-field comparison of
   * year, month, day and minutes. The field comparison read as the more thorough
   * check and was in fact partly dead: the offset is at most ±14 hours, so a candidate
   * whose minutes match can never be on a different calendar day, and the day clause
   * could not fire. One expression, all of it load-bearing.
   */
  const reads = (instant: number): boolean =>
    instant + zoneOffsetMs(new Date(instant), timezone) === naive;

  const first = naive - zoneOffsetMs(new Date(naive), timezone);
  if (reads(first)) return new Date(first);

  const second = naive - zoneOffsetMs(new Date(first), timezone);
  if (reads(second)) return new Date(second);

  // No such local time. The later candidate is the instant the clock reached.
  return new Date(Math.max(first, second));
};

/**
 * The UTC instants bounding a local calendar day.
 *
 * `[start, end)` — half-open, so an appointment at exactly local midnight belongs
 * to the day beginning, not the one ending. Several queries built this window with
 * `Date.UTC(y, m, d, 0, 0, 0)` to `23:59:59.999`, which is a *UTC* day: for a
 * Dallas business that window runs 19:00 the previous evening to 19:00, so an 8 PM
 * job showed up on the wrong day's schedule and a 6 AM job was missing from its own.
 *
 * The end is computed from the following date rather than by adding 24 hours,
 * because a DST day is 23 or 25 hours long.
 */
export const zonedDayBounds = (
  dateStr: string,
  timezone: string = DEFAULT_TIMEZONE
): { start: Date; end: Date } | null => {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const start = zonedWallClockToUtc(year, month, day, 0, timezone);

  // `Date.UTC` normalises an overflowing day, so the 32nd of a month rolls over
  // correctly and month-end needs no special case.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedWallClockToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    timezone
  );

  return { start, end };
};

/** `YYYY-MM-DD` for an instant, as read in the given timezone. */
export const zonedDateKey = (
  date: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  const p = zonedParts(date, timezone);
  if (!p) return '';
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
