/**
 * The Insights filters (brief §5.5: date range, model, include in-progress), for final
 * inspections or, with `kind=quality`, quality checks (and `check`, which one). They live in the
 * URL (?kind=&period=&from=&to=&month=&fromMonth=&toMonth=&model=&check=&includeInProgress=), so a
 * view survives a reload and can be shared. A relative period ("last 12 months") means the 12
 * months up to today, whenever the link is opened; a month, a range of months and custom dates
 * keep their own. Final inspections are the default, so links made before quality checks counted
 * still show what they did.
 */
import {
  ModelCodeSchema,
  parseInsightsQuery,
  type InsightsQuery,
  type InspectionKind,
} from '@modig/shared';
import { formatCalendarDate, localDate } from '../inspections/dates';
import { formatMonthLong } from './format';

/** In the order the Period menu lists them: the relative periods, then those you pick. */
export const PERIODS = [
  'last12',
  'thisYear',
  'lastYear',
  'all',
  'month',
  'months',
  'custom',
] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  last12: 'Last 12 months',
  thisYear: 'This year',
  lastYear: 'Last year',
  all: 'All time',
  month: 'Single month',
  months: 'Month range',
  custom: 'Custom dates',
};

const DEFAULT_PERIOD: Period = 'last12';

export type InsightsFilter = {
  /** 'quality' for quality checks; left out (or 'final') for final inspections. */
  kind?: InspectionKind;
  period: Period;
  /** The custom range's ends, "YYYY-MM-DD" or ''; kept while another period is picked. */
  from: string;
  to: string;
  /**
   * The single month, "YYYY-MM"; '' or left out means the current one. Optional (like the two
   * below) so a filter written before months existed is still a whole one.
   */
  month?: string;
  /** The month range's ends, "YYYY-MM"; '' or left out is the first inspection's month… */
  fromMonth?: string;
  /** …and the current month. */
  toMonth?: string;
  /** Model code, or '' for every model. */
  model: string;
  /** Quality checks only: one quality check's title; '' or left out for every one. */
  check?: string;
  includeInProgress: boolean;
};

/** The kind a filter is about: final inspections unless it says quality checks. */
export function filterKind(filter: Pick<InsightsFilter, 'kind'>): InspectionKind {
  return filter.kind ?? 'final';
}

/** "2026-10": a month the filters accept, in 2000–2099 like their dates. */
const MONTH = /^20\d\d-(0[1-9]|1[0-2])$/;
const monthParam = (params: URLSearchParams, name: string) => {
  const value = params.get(name) ?? '';
  return MONTH.test(value) ? value : '';
};

export function filterFromParams(params: URLSearchParams): InsightsFilter {
  const period = PERIODS.find((value) => value === params.get('period')) ?? DEFAULT_PERIOD;
  const model = ModelCodeSchema.safeParse(params.get('model'));
  const filter: InsightsFilter = {
    period,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    model: model.success ? model.data : '',
    includeInProgress: params.get('includeInProgress') === 'true',
  };
  // Only a quality checks' filter says its kind, and which check: a final one keeps its shape.
  if (params.get('kind') === 'quality') {
    filter.kind = 'quality';
    const check = params.get('check')?.trim();
    if (check) filter.check = check.slice(0, 200);
  }
  // Only the months the URL names: a filter without them keeps the shape it had before months.
  for (const name of ['month', 'fromMonth', 'toMonth'] as const) {
    const value = monthParam(params, name);
    if (value) filter[name] = value;
  }
  return filter;
}

/** Only what differs from the defaults, so the plain dashboard has a clean URL. */
export function filterToParams(filter: InsightsFilter): URLSearchParams {
  const params = new URLSearchParams();
  const quality = filterKind(filter) === 'quality';
  if (quality) params.set('kind', 'quality');
  if (filter.period !== DEFAULT_PERIOD) params.set('period', filter.period);
  if (filter.period === 'custom') {
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
  }
  if (filter.period === 'month' && filter.month) params.set('month', filter.month);
  if (filter.period === 'months') {
    if (filter.fromMonth) params.set('fromMonth', filter.fromMonth);
    if (filter.toMonth) params.set('toMonth', filter.toMonth);
  }
  if (filter.model) params.set('model', filter.model);
  if (quality && filter.check) params.set('check', filter.check);
  if (filter.includeInProgress) params.set('includeInProgress', 'true');
  return params;
}

/**
 * The filter for the other kind: the period, model and in-progress choice stay (they mean the
 * same for both); which quality check goes, as it means nothing to the other.
 */
export function withKind(filter: InsightsFilter, kind: InspectionKind): InsightsFilter {
  const { kind: _kind, check: _check, ...rest } = filter;
  return kind === 'quality' ? { ...rest, kind } : rest;
}

/** The first and last day a period covers; undefined for an open end. */
export function periodRange(
  filter: Pick<InsightsFilter, 'period' | 'from' | 'to' | 'month' | 'fromMonth' | 'toMonth'>,
  today = localDate(),
): { from?: string; to?: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (filter.period) {
    case 'last12': {
      // This month and the eleven before it, so the chart shows twelve whole months.
      const start = month === 12 ? `${year}-01` : `${year - 1}-${pad(month + 1)}`;
      return { from: `${start}-01`, to: today };
    }
    case 'thisYear':
      return { from: `${year}-01-01`, to: today };
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case 'all':
      return {};
    case 'month': {
      const chosen = filter.month || monthOf(today);
      return { from: `${chosen}-01`, to: lastDayOf(chosen) };
    }
    case 'months':
      // An open start is the first inspection's month, which the From menu shows; the end is
      // the current month's last day, which the To menu shows.
      return {
        from: filter.fromMonth ? `${filter.fromMonth}-01` : undefined,
        to: lastDayOf(filter.toMonth || monthOf(today)),
      };
    case 'custom':
      return { from: filter.from || undefined, to: filter.to || undefined };
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-10" for "2026-10-07". */
const monthOf = (date: string) => date.slice(0, 7);

/** "2026-02-28" for "2026-02": day 0 of the next month is the last of this one. */
function lastDayOf(month: string): string {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return `${month}-${pad(last.getUTCDate())}`;
}

/** "2026-01" → "2025-12". */
function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const before = Number(month.slice(5, 7)) - 1;
  return before === 0 ? `${year - 1}-12` : `${year}-${pad(before)}`;
}

/**
 * The months the Month, From month and To month menus offer, newest first: from the month of the
 * earliest inspection (any, whatever the filters) to the current one. Months a shared link names
 * outside that stretch widen it, so a menu can always show what the URL holds. Never before 2000,
 * the filters' first year.
 */
export function monthOptions(
  firstInspectionDate: string | null,
  today = localDate(),
  chosen: readonly (string | undefined)[] = [],
): string[] {
  const named = chosen.filter((month): month is string => Boolean(month && MONTH.test(month)));
  const current = monthOf(today);
  const newest = [current, ...named].reduce((a, b) => (b > a ? b : a));
  // A first inspection dated after this month (planned, or a typo) starts the list at this month.
  const start = firstInspectionDate ? monthOf(firstInspectionDate) : current;
  const oldest = [start, current, ...named].reduce((a, b) => (b < a ? b : a));
  const months: string[] = [];
  for (let month = newest; month >= oldest && month >= '2000-01'; month = previousMonth(month)) {
    months.push(month);
  }
  return months;
}

/**
 * The filter with another period. A month, a month range or custom dates start from the stretch
 * on screen ("Last year" becomes 2025-01 to 2025-12, a single month its last month), so changing
 * how the period is chosen doesn't jump elsewhere; the menus are right there to narrow it.
 */
export function withPeriod(
  filter: InsightsFilter,
  period: Period,
  firstInspectionDate: string | null,
  today = localDate(),
): InsightsFilter {
  const range = periodRange(filter, today);
  // An open end is today, or the first inspection; never after the current month.
  const current = monthOf(today);
  const lastMonth = range.to && monthOf(range.to) < current ? monthOf(range.to) : current;
  const firstMonth = monthOf(range.from ?? firstInspectionDate ?? today);
  switch (period) {
    case 'month':
      return { ...filter, period, month: lastMonth };
    case 'months':
      return {
        ...filter,
        period,
        fromMonth: firstMonth <= lastMonth ? firstMonth : lastMonth,
        toMonth: lastMonth,
      };
    case 'custom':
      // Dates typed before stay; otherwise the fields start at what was shown.
      return filter.from || filter.to
        ? { ...filter, period }
        : { ...filter, period, from: range.from ?? '', to: range.to ?? '' };
    default:
      return { ...filter, period };
  }
}

/**
 * The period for the end of a sentence: "in the last 12 months", "in 2026-10", "from 2026-01 to
 * 2026-06", "from 2026-02-10 on"; '' for all time.
 */
export function describePeriod(filter: InsightsFilter, today = localDate()): string {
  const current = monthOf(today);
  switch (filter.period) {
    case 'last12':
      return 'in the last 12 months';
    case 'thisYear':
      return 'this year';
    case 'lastYear':
      return 'last year';
    case 'all':
      return '';
    case 'month':
      return `in ${formatMonthLong(filter.month || current)}`;
    case 'months':
      return span(
        filter.fromMonth ? formatMonthLong(filter.fromMonth) : '',
        formatMonthLong(filter.toMonth || current),
      );
    case 'custom':
      return span(
        filter.from && formatCalendarDate(filter.from),
        filter.to && formatCalendarDate(filter.to),
      );
  }
}

/** "from 2026-01 to 2026-06", "in 2026-06" when both ends are one, or one open end; '' for none. */
function span(from: string, to: string): string {
  if (from && to) return from === to ? `in ${from}` : `from ${from} to ${to}`;
  if (from) return `from ${from} on`;
  return to ? `up to ${to}` : '';
}

/**
 * What to ask the API for, or the reason the filters can't be used (a range ending before it
 * starts, a date outside 2000–2099); the page then says why instead of asking.
 */
export function insightsQuery(
  filter: InsightsFilter,
  today = localDate(),
): { query: InsightsQuery } | { error: string } {
  if (filter.period === 'months') {
    const toMonth = filter.toMonth || monthOf(today);
    if (filter.fromMonth && filter.fromMonth > toMonth) {
      return { error: 'The start month is after the end month.' };
    }
  }
  const range = periodRange(filter, today);
  const params = new URLSearchParams();
  const quality = filterKind(filter) === 'quality';
  if (quality) params.set('kind', 'quality');
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (filter.model) params.set('model', filter.model);
  if (quality && filter.check) params.set('check', filter.check);
  if (filter.includeInProgress) params.set('includeInProgress', 'true');
  const parsed = parseInsightsQuery(params);
  if (parsed.success) return { query: parsed.data };
  return { error: parsed.error.issues[0]?.message ?? 'These filters are not valid.' };
}
