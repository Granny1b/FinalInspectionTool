/** The front page's date is a calendar date ("YYYY-MM-DD"), not a moment in time. */

/** Today where the user is. Not toISOString(): that is the UTC date, yesterday just after midnight. */
export function localDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * "2026-10-07" for "2026-10-07": a calendar date is already shown as the app shows dates (ISO,
 * lib/format), so it is never read through a time zone that could move it to the day before.
 * Kept as the one place that decides, in case the format changes again.
 */
export function formatCalendarDate(date: string): string {
  return date;
}
