import { describe, expect, it } from 'vitest';
import {
  describePeriod,
  filterFromParams,
  filterToParams,
  insightsQuery,
  monthOptions,
  periodRange,
  withKind,
  withPeriod,
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

  it('keeps quality checks and which one, and says nothing of them for final inspections', () => {
    const quality: InsightsFilter = {
      ...DEFAULT,
      kind: 'quality',
      model: 'RMMG',
      check: 'Quality check – Pre start up',
    };
    const params = filterToParams(quality);
    expect(params.toString()).toBe(
      'kind=quality&model=RMMG&check=Quality+check+%E2%80%93+Pre+start+up',
    );
    expect(filterFromParams(params)).toEqual(quality);
    // A check means nothing to final inspections, said or not.
    expect(filterFromParams(new URLSearchParams('kind=final&check=x'))).toEqual(DEFAULT);
    expect(filterToParams({ ...DEFAULT, check: 'x' }).toString()).toBe('');
  });

  it('switches kind keeping the period, model and in-progress, but not the check', () => {
    const quality: InsightsFilter = {
      ...DEFAULT,
      period: 'all',
      kind: 'quality',
      model: 'RMMG',
      check: 'Quality check – Pre start up',
      includeInProgress: true,
    };
    expect(withKind(quality, 'final')).toEqual({
      ...DEFAULT,
      period: 'all',
      model: 'RMMG',
      includeInProgress: true,
    });
    expect(withKind(withKind(quality, 'final'), 'quality')).toEqual({
      ...quality,
      check: undefined,
    });
  });

  it('keeps a single month and a range of months', () => {
    const month: InsightsFilter = { ...DEFAULT, period: 'month', month: '2026-10' };
    expect(filterToParams(month).toString()).toBe('period=month&month=2026-10');
    expect(filterFromParams(filterToParams(month))).toEqual(month);

    const months: InsightsFilter = {
      ...DEFAULT,
      period: 'months',
      fromMonth: '2026-01',
      toMonth: '2026-06',
      model: 'RMMG',
    };
    expect(filterToParams(months).toString()).toBe(
      'period=months&fromMonth=2026-01&toMonth=2026-06&model=RMMG',
    );
    expect(filterFromParams(filterToParams(months))).toEqual(months);
  });

  it('drops months that belong to another period, and months that are not ones', () => {
    const params = (filter: InsightsFilter) => filterToParams(filter).toString();
    expect(params({ ...DEFAULT, period: 'all', month: '2026-10', fromMonth: '2026-01' })).toBe(
      'period=all',
    );
    expect(params({ ...DEFAULT, period: 'month', fromMonth: '2026-01', toMonth: '2026-02' })).toBe(
      'period=month',
    );
    expect(
      filterFromParams(new URLSearchParams('period=month&month=2026-13&fromMonth=1999-12')),
    ).toEqual({ ...DEFAULT, period: 'month' });
    expect(filterFromParams(new URLSearchParams('toMonth=2026-1'))).toEqual(DEFAULT);
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

  it('covers a single month from its first to its last day, the current one by default', () => {
    const month = (value?: string) =>
      periodRange({ period: 'month', from: '', to: '', month: value }, '2026-11-05');
    expect(month('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(month('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(month('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(month()).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('covers a range of months, from the first inspection to this month when not chosen', () => {
    const months = (fromMonth?: string, toMonth?: string) =>
      periodRange({ period: 'months', from: '', to: '', fromMonth, toMonth }, '2026-11-05');
    expect(months('2025-12', '2026-04')).toEqual({ from: '2025-12-01', to: '2026-04-30' });
    expect(months('2026-06', '2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(months()).toEqual({ to: '2026-11-30' });
  });
});

describe('monthOptions', () => {
  it('runs from the first inspection’s month to this month, newest first', () => {
    expect(monthOptions('2025-10-20', '2026-02-03')).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
      '2025-10',
    ]);
    expect(monthOptions('2026-02-01', '2026-02-28')).toEqual(['2026-02']);
  });

  it('offers this month without inspections, or with only later ones', () => {
    expect(monthOptions(null, '2026-11-05')).toEqual(['2026-11']);
    expect(monthOptions('2027-03-01', '2026-11-05')).toEqual(['2026-11']);
  });

  it('widens to the months a shared link names, and never goes before 2000', () => {
    expect(monthOptions('2026-10-01', '2026-11-05', ['2026-08', '2027-01', '', undefined])).toEqual(
      ['2027-01', '2026-12', '2026-11', '2026-10', '2026-09', '2026-08'],
    );
    expect(monthOptions('1999-11-30', '2000-02-01')).toEqual(['2000-02', '2000-01']);
  });
});

describe('withPeriod', () => {
  const today = '2026-11-05';
  const switchTo = (filter: InsightsFilter, period: InsightsFilter['period']) =>
    withPeriod(filter, period, '2025-03-14', today);

  it('starts a month or a month range from the stretch on screen', () => {
    expect(switchTo(DEFAULT, 'months')).toEqual({
      ...DEFAULT,
      period: 'months',
      fromMonth: '2025-12',
      toMonth: '2026-11',
    });
    const lastYear = { ...DEFAULT, period: 'lastYear' as const };
    expect(switchTo(lastYear, 'months')).toMatchObject({
      fromMonth: '2025-01',
      toMonth: '2025-12',
    });
    expect(switchTo(lastYear, 'month')).toMatchObject({ period: 'month', month: '2025-12' });
    // All time reaches back to the first inspection.
    const all = { ...DEFAULT, period: 'all' as const };
    expect(switchTo(all, 'months')).toMatchObject({ fromMonth: '2025-03', toMonth: '2026-11' });
    expect(switchTo(all, 'month')).toMatchObject({ month: '2026-11' });
  });

  it('never starts after the current month', () => {
    const future = { ...DEFAULT, period: 'custom' as const, from: '2027-02-01', to: '2027-03-01' };
    expect(switchTo(future, 'months')).toMatchObject({ fromMonth: '2026-11', toMonth: '2026-11' });
  });

  it('fills custom dates from the stretch on screen, unless dates were typed', () => {
    expect(switchTo(DEFAULT, 'custom')).toMatchObject({ from: '2025-12-01', to: today });
    const month = { ...DEFAULT, period: 'month' as const, month: '2026-02' };
    expect(switchTo(month, 'custom')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(switchTo({ ...DEFAULT, period: 'all' }, 'custom')).toMatchObject({ from: '', to: '' });
    const typed = { ...DEFAULT, from: '2026-03-03', to: '' };
    expect(switchTo(typed, 'custom')).toMatchObject({ from: '2026-03-03', to: '' });
  });

  it('changes nothing else for the other periods', () => {
    expect(switchTo({ ...DEFAULT, model: 'RMMG' }, 'thisYear')).toEqual({
      ...DEFAULT,
      model: 'RMMG',
      period: 'thisYear',
    });
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

  it('asks for quality checks, and which one', () => {
    expect(
      insightsQuery(
        { ...DEFAULT, period: 'all', kind: 'quality', check: 'Quality check – Pre start up' },
        '2026-11-03',
      ),
    ).toEqual({
      query: { kind: 'quality', check: 'Quality check – Pre start up', includeInProgress: false },
    });
  });

  it('says why a custom range cannot be used', () => {
    const filter = { ...DEFAULT, period: 'custom' as const, from: '2026-03-01', to: '2026-02-01' };
    expect(insightsQuery(filter)).toEqual({ error: 'The start date is after the end date.' });
  });

  it('asks for a month as its first and last day', () => {
    const month = { ...DEFAULT, period: 'month' as const, month: '2026-10' };
    expect(insightsQuery(month, '2026-11-05')).toEqual({
      query: { from: '2026-10-01', to: '2026-10-31', includeInProgress: false },
    });
    const months = { ...DEFAULT, period: 'months' as const, fromMonth: '2026-01' };
    expect(insightsQuery(months, '2026-11-05')).toEqual({
      query: { from: '2026-01-01', to: '2026-11-30', includeInProgress: false },
    });
  });

  it('says why a month range cannot be used', () => {
    const backwards = { ...DEFAULT, period: 'months' as const };
    expect(
      insightsQuery({ ...backwards, fromMonth: '2026-06', toMonth: '2026-05' }, '2026-11-05'),
    ).toEqual({ error: 'The start month is after the end month.' });
    // With no end chosen, the end is this month.
    expect(insightsQuery({ ...backwards, fromMonth: '2026-12' }, '2026-11-05')).toEqual({
      error: 'The start month is after the end month.',
    });
  });
});

describe('describePeriod', () => {
  const words = (patch: Partial<InsightsFilter>) =>
    describePeriod({ ...DEFAULT, ...patch }, '2026-11-05');

  it('says the period for the end of a sentence', () => {
    expect(words({})).toBe('in the last 12 months');
    expect(words({ period: 'thisYear' })).toBe('this year');
    expect(words({ period: 'lastYear' })).toBe('last year');
    expect(words({ period: 'all' })).toBe('');
    expect(words({ period: 'month', month: '2026-10' })).toBe('in 2026-10');
    expect(words({ period: 'month' })).toBe('in 2026-11');
  });

  it('names the ends of a range, open or not', () => {
    expect(words({ period: 'months', fromMonth: '2026-01', toMonth: '2026-06' })).toBe(
      'from 2026-01 to 2026-06',
    );
    expect(words({ period: 'months', fromMonth: '2026-03', toMonth: '2026-03' })).toBe(
      'in 2026-03',
    );
    expect(words({ period: 'months' })).toBe('up to 2026-11');
    expect(words({ period: 'custom', from: '2026-02-10', to: '2026-05-20' })).toBe(
      'from 2026-02-10 to 2026-05-20',
    );
    expect(words({ period: 'custom', from: '2026-02-10' })).toBe('from 2026-02-10 on');
    expect(words({ period: 'custom', to: '2026-05-20' })).toBe('up to 2026-05-20');
    expect(words({ period: 'custom' })).toBe('');
  });
});
