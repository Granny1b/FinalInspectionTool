import { describe, expect, it } from 'vitest';
import { filterFromParams } from '../filters';
import { insightsHref, parseList, reportHref, withList, withoutAutoprint } from './links';

// Filters are read from addresses, as the pages read them, so these tests hold whatever else
// filters.ts learns.
const filter = (search: string) => filterFromParams(new URLSearchParams(search));

describe('report links', () => {
  it('carry the Insights page’s filters, and the report’s own choices after them', () => {
    expect(reportHref(filter(''))).toBe('/insights/report');
    const custom = filter('period=custom&from=2026-01-01&to=2026-06-30&model=RMMG');
    expect(reportHref(custom)).toBe(
      '/insights/report?period=custom&from=2026-01-01&to=2026-06-30&model=RMMG',
    );
    expect(reportHref(filter('period=all&includeInProgress=true'), { list: true })).toBe(
      '/insights/report?period=all&includeInProgress=true&deviations=1',
    );
    expect(reportHref(filter('period=all'), { autoprint: true })).toBe(
      '/insights/report?period=all&autoprint=1',
    );
  });

  it('lead back to Insights with the same filters', () => {
    expect(insightsHref(filter(''))).toBe('/insights');
    expect(insightsHref(filter('period=thisYear&model=RMMG&deviations=1&autoprint=1'))).toBe(
      '/insights?period=thisYear&model=RMMG',
    );
  });

  it('read and switch the deviation list, dropping autoprint as they do', () => {
    expect(parseList(new URLSearchParams('deviations=1'))).toBe(true);
    expect(parseList(new URLSearchParams('deviations=yes'))).toBe(false);
    const params = new URLSearchParams('period=all&autoprint=1');
    expect(withList(params, true).toString()).toBe('period=all&deviations=1');
    expect(withList(new URLSearchParams('period=all&deviations=1'), false).toString()).toBe(
      'period=all',
    );
    expect(withoutAutoprint(new URLSearchParams('deviations=1&autoprint=1')).toString()).toBe(
      'deviations=1',
    );
    // The address it came from is left as it was.
    expect(params.toString()).toBe('period=all&autoprint=1');
  });
});
