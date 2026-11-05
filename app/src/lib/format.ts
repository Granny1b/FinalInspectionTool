/**
 * Dates as the app shows them everywhere: ISO 8601, "2026-10-06" and "2026-10-06 14:32", in the
 * user's time zone. Built from parts rather than a locale's pattern, so no browser or Node version
 * can turn it into "06/10/2026".
 */
const PARTS = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(iso: string): Record<'year' | 'month' | 'day' | 'hour' | 'minute', string> | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const found = Object.fromEntries(
    PARTS.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: found.year ?? '',
    month: found.month ?? '',
    day: found.day ?? '',
    hour: found.hour ?? '',
    minute: found.minute ?? '',
  };
}

/** "2026-10-06" for a moment in time. Anything unparseable is shown as it is. */
export function formatDate(iso: string): string {
  const p = parts(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : iso;
}

/** "2026-10-06 14:32" for a moment in time. Anything unparseable is shown as it is. */
export function formatDateTime(iso: string): string {
  const p = parts(iso);
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` : iso;
}
