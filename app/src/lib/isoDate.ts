/**
 * Calendar dates typed by hand, always "YYYY-MM-DD" (the app's one date format, lib/format).
 * Pure, so the date field's rules are tested without a browser.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `text` is a real calendar date written "YYYY-MM-DD" (no 2026-02-30). */
export function isIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * What someone typed, as "YYYY-MM-DD", or null when it isn't a date (yet). Accepts the usual
 * shortcuts: "20261105", "2026 11 05", "2026/11/05", "2026.11.05" and single-digit parts
 * ("2026-11-5").
 */
export function parseTypedDate(text: string): string | null {
  const trimmed = text.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  const parts = compact ?? /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(trimmed);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Whether `date` ("YYYY-MM-DD") lies within the optional bounds, compared as text. */
export function withinBounds(date: string, min?: string, max?: string): boolean {
  return (!min || date >= min) && (!max || date <= max);
}
