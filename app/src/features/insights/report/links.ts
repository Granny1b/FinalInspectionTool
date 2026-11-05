/**
 * Addresses of the Insights report. The report takes the Insights page's own filter parameters,
 * written and read only through filters.ts, so a period the page learns is the report's too; its
 * own parameters (the deviation list, autoprint) are added on top.
 */
import { filterToParams, type InsightsFilter } from '../filters';

export const REPORT_PATH = '/insights/report';

/** `deviations=1` includes the list of deviation rows after the report. */
const LIST_PARAM = 'deviations';

/**
 * `/insights/report?<the page's filters>[&deviations=1][&autoprint=1]`; `autoprint` opens the
 * print dialog once everything has loaded, as the inspection's Print / Save PDF does.
 */
export function reportHref(
  filter: InsightsFilter,
  { list = false, autoprint = false }: { list?: boolean; autoprint?: boolean } = {},
): string {
  const params = filterToParams(filter);
  if (list) params.set(LIST_PARAM, '1');
  if (autoprint) params.set('autoprint', '1');
  const search = params.toString();
  return search ? `${REPORT_PATH}?${search}` : REPORT_PATH;
}

/** Back to the Insights page with the same filters. */
export function insightsHref(filter: InsightsFilter): string {
  const search = filterToParams(filter).toString();
  return search ? `/insights?${search}` : '/insights';
}

/** Whether the address asks for the deviation list. */
export function parseList(params: URLSearchParams): boolean {
  return params.get(LIST_PARAM) === '1';
}

/** The address with the deviation list on or off; a changed report must not print by itself. */
export function withList(params: URLSearchParams, list: boolean): URLSearchParams {
  const next = new URLSearchParams(params);
  if (list) next.set(LIST_PARAM, '1');
  else next.delete(LIST_PARAM);
  next.delete('autoprint');
  return next;
}

/** The address without `autoprint`, once it has printed: a reload must not print again. */
export function withoutAutoprint(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('autoprint');
  return next;
}
