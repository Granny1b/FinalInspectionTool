/** Numbers and months as the Insights page shows them: en-GB numbers, ISO months ("2026-10"). */

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

/** "1,284" */
export const formatCount = (value: number) => COUNT.format(value);

/** "2.4" */
export const formatDecimal = (value: number) => DECIMAL.format(value);

/** "75%" in tables; "96.4%" for the headline rate, where a tenth of a percent matters. */
export const formatPercent = (share: number, decimals: 0 | 1 = 0) =>
  (decimals ? PERCENT_DECIMAL : PERCENT).format(share);

/**
 * "2026-10" for "2026-10" (axis): months are ISO like the app's dates (lib/format). One function
 * per use, so a place can change on its own.
 */
export const formatMonthShort = (month: string) => month;

/** "2026-10" for "2026-10" (tooltip, table). */
export const formatMonthLong = (month: string) => month;

/** "3 deviations", "1 deviation" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}
