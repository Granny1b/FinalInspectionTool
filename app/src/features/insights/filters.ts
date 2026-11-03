/**
 * The Insights filters (brief §5.5: date range, model, include in-progress). They live in the URL
 * (?period=&from=&to=&model=&includeInProgress=), so a view survives a reload and can be shared.
 * A period is relative ("last 12 months" means the 12 months up to today, whenever the link is
 * opened); only a custom range keeps its own dates.
 */
import { ModelCodeSchema, parseInsightsQuery, type InsightsQuery } from '@modig/shared';
import { localDate } from '../inspections/dates';

export const PERIODS = ['last12', 'thisYear', 'lastYear', 'all', 'custom'] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  last12: 'Last 12 months',
  thisYear: 'This year',
  lastYear: 'Last year',
  all: 'All time',
  custom: 'Custom range',
};

const DEFAULT_PERIOD: Period = 'last12';

export type InsightsFilter = {
  period: Period;
  /** The custom range's ends, "YYYY-MM-DD" or ''; kept while another period is picked. */
  from: string;
  to: string;
  /** Model code, or '' for every model. */
  model: string;
  includeInProgress: boolean;
};

export function filterFromParams(params: URLSearchParams): InsightsFilter {
  const period = PERIODS.find((value) => value === params.get('period')) ?? DEFAULT_PERIOD;
  const model = ModelCodeSchema.safeParse(params.get('model'));
  return {
    period,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    model: model.success ? model.data : '',
    includeInProgress: params.get('includeInProgress') === 'true',
  };
}

/** Only what differs from the defaults, so the plain dashboard has a clean URL. */
export function filterToParams(filter: InsightsFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.period !== DEFAULT_PERIOD) params.set('period', filter.period);
  if (filter.period === 'custom') {
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
  }
  if (filter.model) params.set('model', filter.model);
  if (filter.includeInProgress) params.set('includeInProgress', 'true');
  return params;
}

/** The first and last day a period covers; undefined for an open end. */
export function periodRange(
  filter: Pick<InsightsFilter, 'period' | 'from' | 'to'>,
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
    case 'custom':
      return { from: filter.from || undefined, to: filter.to || undefined };
  }
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * What to ask the API for, or the reason the filters can't be used (a custom range ending before
 * it starts, a date outside 2000–2099); the page then says why instead of asking.
 */
export function insightsQuery(
  filter: InsightsFilter,
  today = localDate(),
): { query: InsightsQuery } | { error: string } {
  const range = periodRange(filter, today);
  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  if (filter.model) params.set('model', filter.model);
  if (filter.includeInProgress) params.set('includeInProgress', 'true');
  const parsed = parseInsightsQuery(params);
  if (parsed.success) return { query: parsed.data };
  return { error: parsed.error.issues[0]?.message ?? 'These filters are not valid.' };
}
