/** Server state for Insights (brief §5.5, §8): the KPIs and the CSV export of their rows. */
import { insightsQueryParams, InsightsSchema, type InsightsQuery } from '@modig/shared';
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
