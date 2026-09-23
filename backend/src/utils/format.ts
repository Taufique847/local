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
