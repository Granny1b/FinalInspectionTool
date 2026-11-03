/** Numbers and months as the Insights page shows them (en-GB, like the app's dates). */

const COUNT = new Intl.NumberFormat('en-GB');
const DECIMAL = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const PERCENT = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const PERCENT_DECIMAL = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// Read in UTC, so no time zone can move the month.
const MONTH_SHORT = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});
const MONTH_LONG = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "1,284" */
export const formatCount = (value: number) => COUNT.format(value);

/** "2.4" */
export const formatDecimal = (value: number) => DECIMAL.format(value);

/** "75%" in tables; "96.4%" for the headline rate, where a tenth of a percent matters. */
export const formatPercent = (share: number, decimals: 0 | 1 = 0) =>
  (decimals ? PERCENT_DECIMAL : PERCENT).format(share);

const monthDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** "Oct 26" for "2026-10" (axis). */
export const formatMonthShort = (month: string) => MONTH_SHORT.format(monthDate(month));

/** "October 2026" for "2026-10" (tooltip, table). */
export const formatMonthLong = (month: string) => MONTH_LONG.format(monthDate(month));

/** "3 deviations", "1 deviation" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}
