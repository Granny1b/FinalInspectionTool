import { useMe } from '../../../lib/useMe';
import { useSettings } from '../../../lib/useSettings';
import { localDate } from '../../inspections/dates';
import { usePrintImages } from '../../print/usePrintImages';
import { insightsQuery, type InsightsFilter } from '../filters';
import { useInsights, useInsightsDeviations } from '../queries';
import { buildReport, type Report } from './model';

type FailedQuery = { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };

export type ReportState =
  /** The filters can't be used (a range that ends before it starts): the message says why. */
  | { status: 'invalid'; message: string }
  | { status: 'failed'; query: FailedQuery }
  | { status: 'loading' }
  | {
      status: 'ready';
      report: Report;
      logoUrl: string;
      /** The deviation list is asked for and still on its way. */
      listLoading: boolean;
      /** Names what is shown: when it changes, readiness (fonts, the logo) is waited for again. */
      shown: string;
    };

/**
 * Everything the report needs, for the print route and the preview alike: the filters read as
 * the Insights page reads them (filters.ts), its numbers (the page's own query, so a preview
 * opened from the page is there at once), the deviation rows when the list is included, the
 * settings (company, logo, model names) and who is signed in.
 */
export function useReport(filter: InsightsFilter, includeList: boolean): ReportState {
  const today = localDate();
  const target = insightsQuery(filter, today);
  const query = 'query' in target ? target.query : null;
  const insights = useInsights(query);
  const rows = useInsightsDeviations(query, includeList);
  const settings = useSettings();
  const me = useMe();
  const images = usePrintImages(null, settings.data?.logoImageId, { appendix: false });

  // The numbers for exactly these filters: not the previous filters' kept on screen meanwhile.
  const numbers = insights.isPlaceholderData ? undefined : insights.data;
  const list = includeList ? (rows.data ?? null) : null;
  // Built on every render: a few hundred rows at most, and nothing downstream keys on its identity.
  const report =
    query && numbers && settings.data && me.data
      ? buildReport({
          query,
          period: filter.period,
          insights: numbers,
          models: settings.data.machineModels,
          companyName: settings.data.companyName,
          generatedAt: new Date(insights.dataUpdatedAt).toISOString(),
          generatedBy: me.data.name || me.data.email,
          deviations: list,
          today,
        })
      : null;

  if ('error' in target) return { status: 'invalid', message: target.error };
  const failed = insights.isError
    ? insights
    : settings.isError
      ? settings
      : includeList && rows.isError
        ? rows
        : null;
  if (failed) return { status: 'failed', query: failed };
  if (!report || images.loading) return { status: 'loading' };
  return {
    status: 'ready',
    report,
    logoUrl: images.logoUrl,
    listLoading: includeList && !list,
    shown: [images.logoUrl, insights.dataUpdatedAt, list ? rows.dataUpdatedAt : '-'].join(' '),
  };
}
