/** Server state for Insights (brief §5.5, §8): the KPIs, the CSV export and the report's rows. */
import {
  InsightsDeviationsSchema,
  insightsQueryParams,
  InsightsSchema,
  type InsightsQuery,
} from '@modig/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiDownload, apiFetch } from '../../lib/api';

const withQuery = (path: string, query: InsightsQuery) => {
  const search = new URLSearchParams(insightsQueryParams(query)).toString();
  return search ? `${path}?${search}` : path;
};

/** Null while the filters can't be used: nothing is asked for. */
export function useInsights(query: InsightsQuery | null) {
  return useQuery({
    queryKey: ['insights', query],
    queryFn: async ({ signal }) =>
      (await apiFetch(withQuery('/api/insights', query!), { schema: InsightsSchema, signal })).data,
    enabled: query !== null,
    // Changing a filter keeps the previous numbers on screen (dimmed) until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

/**
 * The deviation rows behind the numbers, for the printed report's deviation list. Asked for only
 * while `enabled` (the list is included) and the filters can be used.
 */
export function useInsightsDeviations(query: InsightsQuery | null, enabled: boolean) {
  return useQuery({
    queryKey: ['insights', 'deviations', query],
    queryFn: async ({ signal }) =>
      (
        await apiFetch(withQuery('/api/insights/deviations', query!), {
          schema: InsightsDeviationsSchema,
          signal,
        })
      ).data.rows,
    enabled: enabled && query !== null,
  });
}

/** Saves the filtered deviation rows as a CSV file, named by the API after the filters. */
export async function downloadCsv(query: InsightsQuery): Promise<void> {
  const { blob, fileName } = await apiDownload(withQuery('/api/insights/export.csv', query));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName ?? 'Deviations.csv';
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
