/**
 * Dates as people read them in this (English) UI: "6 Oct 2026", "6 Oct 2026, 14:32".
 * en-GB rather than the browser locale, so a Swedish browser doesn't mix in "okt.".
 */
const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso: string): string {
  return DATE.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
