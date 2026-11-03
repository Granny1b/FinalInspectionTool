import { describe, expect, it } from 'vitest';
import {
  filterFromParams,
  filterToParams,
  insightsQuery,
  periodRange,
  type InsightsFilter,
} from './filters';

const DEFAULT: InsightsFilter = {
  period: 'last12',
  from: '',
  to: '',
  model: '',
  includeInProgress: false,
};

describe('filters in the URL', () => {
  it('defaults to the last 12 months of finalised inspections, with a clean URL', () => {
    expect(filterFromParams(new URLSearchParams())).toEqual(DEFAULT);
    expect(filterToParams(DEFAULT).toString()).toBe('');
  });

  it('keeps a custom range, the model and in-progress', () => {
    const filter: InsightsFilter = {
      period: 'custom',
      from: '2026-01-01',
      to: '2026-06-30',
      model: 'RMMG',
      includeInProgress: true,
    };
    const params = filterToParams(filter);
    expect(params.toString()).toBe(
      'period=custom&from=2026-01-01&to=2026-06-30&model=RMMG&includeInProgress=true',
    );
    expect(filterFromParams(params)).toEqual(filter);
  });

  it('drops dates that belong to no custom range, and values it does not know', () => {
    expect(filterToParams({ ...DEFAULT, period: 'all', from: '2026-01-01' }).toString()).toBe(
      'period=all',
    );
    expect(filterFromParams(new URLSearchParams('period=decade&model=a/b'))).toEqual(DEFAULT);
  });
});

describe('periodRange', () => {
  const range = (period: InsightsFilter['period'], today: string) =>
    periodRange({ period, from: '2026-02-01', to: '2026-02-28' }, today);

  it('covers this month and the eleven before it', () => {
    expect(range('last12', '2026-11-03')).toEqual({ from: '2025-12-01', to: '2026-11-03' });
    expect(range('last12', '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(range('last12', '2027-01-15')).toEqual({ from: '2026-02-01', to: '2027-01-15' });
  });

  it('knows this year, last year, all time and a custom range', () => {
    expect(range('thisYear', '2026-11-03')).toEqual({ from: '2026-01-01', to: '2026-11-03' });
    expect(range('lastYear', '2026-11-03')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(range('all', '2026-11-03')).toEqual({});
    expect(range('custom', '2026-11-03')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange({ period: 'custom', from: '', to: '' })).toEqual({});
  });
});

describe('insightsQuery', () => {
  it('turns the filters into the API’s query', () => {
    expect(insightsQuery({ ...DEFAULT, model: 'RMMG' }, '2026-11-03')).toEqual({
      query: { from: '2025-12-01', to: '2026-11-03', model: 'RMMG', includeInProgress: false },
    });
    expect(insightsQuery({ ...DEFAULT, period: 'all', includeInProgress: true })).toEqual({
      query: { includeInProgress: true },
    });
  });

  it('says why a custom range cannot be used', () => {
    const filter = { ...DEFAULT, period: 'custom' as const, from: '2026-03-01', to: '2026-02-01' };
    expect(insightsQuery(filter)).toEqual({ error: 'The start date is after the end date.' });
  });
});
