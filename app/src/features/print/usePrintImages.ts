import { useQueries } from '@tanstack/react-query';
import { imageUrlQuery, useImageUrl } from '../../lib/images';
import { printedImageIds, type PrintModel } from './model';

/** Printed when the settings name no logo of their own, or it can't be fetched. */
const DEFAULT_LOGO_URL = '/modig-logo.png';

/**
 * Addresses of every image the document shows: the machine photo (or a template's cover), the
 * deviation photos and the logo from the settings. `loading` until all are known, so the document
 * renders once, complete, and its readiness can wait for every image in it.
 */
export function usePrintImages(model: PrintModel | null, logoImageId: string | undefined) {
  const ids = model ? printedImageIds(model) : [];
  const photos = useQueries({ queries: ids.map((id) => imageUrlQuery(id)) });
  const logo = useImageUrl(logoImageId);

  /** Missing for an image whose address couldn't be fetched: the page says so in its place. */
  const urls: ReadonlyMap<string, string> = new Map(
    ids.flatMap((id, index) => {
      const url = photos[index]?.data;
      return url ? [[id, url] as const] : [];
    }),
  );
  return {
    loading: photos.some(fetching) || fetching(logo),
    urls,
    logoUrl: logo.data ?? DEFAULT_LOGO_URL,
  };
}

export type PrintImages = ReturnType<typeof usePrintImages>;

/** Without an id the query idles: there is nothing to wait for. */
function fetching(query: { isPending: boolean; fetchStatus: string }): boolean {
  return query.isPending && query.fetchStatus !== 'idle';
}
