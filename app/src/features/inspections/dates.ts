/** The front page's date is a calendar date ("YYYY-MM-DD"), not a moment in time. */

/** Today where the user is. Not toISOString(): that is the UTC date, yesterday just after midnight. */
export function localDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Read and written in UTC, so no time zone can move the date to the day before.
const CALENDAR = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

/** "7 Oct 2026" for "2026-10-07", like the app's other dates (lib/format). */
export function formatCalendarDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : CALENDAR.format(parsed);
}
