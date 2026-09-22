import { siteConfig } from '../../site.config';

const TZ = siteConfig.timeZone;

/** Today's date in the district's timezone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const localDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The calendar date an event happens on, as a Lombard parent would say it.
 *
 * All-day values are already date-only and pass straight through. Timed values
 * are stored as UTC instants, so their first ten characters are the *UTC* date:
 * a 7pm Chicago PTA meeting is 00:00Z the next day. Slicing the string put every
 * event after ~7pm on the following day — a quarter of all timed events, and
 * precisely the evening meetings and concerts parents attend. Always convert.
 */
export const dateOf = (iso: string): string =>
  iso.length <= 10 ? iso : localDateFormat.format(new Date(iso));

export function addDays(iso: string, days: number): string {
  const d = new Date(`${dateOf(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday. Computed from the date string, so it never drifts with the viewer's timezone. */
export function weekdayOf(iso: string): number {
  return new Date(`${dateOf(iso)}T12:00:00Z`).getUTCDay();
}

/**
 * The current school week: Monday through Friday.
 * On a weekend we look ahead to the coming week — a parent checking on Sunday
 * night wants to know about Monday, not about the week that just ended.
 */
export function schoolWeek(today: string): { start: string; end: string; isNextWeek: boolean } {
  const dow = weekdayOf(today);
  if (dow === 0) return { start: addDays(today, 1), end: addDays(today, 5), isNextWeek: true };
  if (dow === 6) return { start: addDays(today, 2), end: addDays(today, 6), isNextWeek: true };
  return { start: addDays(today, 1 - dow), end: addDays(today, 5 - dow), isNextWeek: false };
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });

export const dayNumber = (iso: string): string => fmt({ day: 'numeric' }).format(new Date(`${dateOf(iso)}T12:00:00Z`));
export const dayOfWeek = (iso: string): string => fmt({ weekday: 'short' }).format(new Date(`${dateOf(iso)}T12:00:00Z`));
export const monthShort = (iso: string): string => fmt({ month: 'short' }).format(new Date(`${dateOf(iso)}T12:00:00Z`));

export function longDate(iso: string): string {
  return fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${dateOf(iso)}T12:00:00Z`));
}

/** Time of a timed event, rendered in district-local time. */
export function timeOf(isoDateTime: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
    .format(new Date(isoDateTime))
    .replace(':00', '')
    .replace(' ', '')
    .toLowerCase();
}

export function relativeDay(iso: string, today: string): string | null {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return null;
}

/** "Last checked 3 hours ago" — deliberately coarse, because precision implies false freshness. */
export function sinceLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never checked';
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 90) return 'less than 2 hours ago';
  const hours = Math.floor(mins / 60);
  if (hours < 36) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
