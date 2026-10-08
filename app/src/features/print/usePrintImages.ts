import { useQueries } from '@tanstack/react-query';
import { imageUrlQuery, useImageUrl } from '../../lib/images';
import { printedImageIds, type PrintModel } from './model';

/** Printed when the settings name no logo of their own, or it can't be fetched. */
export const DEFAULT_LOGO_URL = '/modig-logo.png';

/**
 * Addresses of every image the document shows: the machine photo (or a template's cover), the
 * deviation photos, the logo from the settings and, with `appendix`, the reference images.
 * `loading` until all but the reference images are known, so the document renders once,
 * complete; `appendixLoading` while the reference images' addresses are still coming, so turning
 * the appendix on adds it a moment later instead of reloading the whole preview.
 */
export function usePrintImages(
  model: PrintModel | null,
  logoImageId: string | undefined,
  { appendix }: { appendix: boolean },
) {
  const ids = model ? printedImageIds(model, { appendix }) : [];
  const base = new Set(model ? printedImageIds(model, { appendix: false }) : []);
  const photos = useQueries({ queries: ids.map((id) => imageUrlQuery(id)) });
  const logo = useImageUrl(logoImageId);

  /** Missing for an image whose address couldn't be fetched: the page says so in its place. */
  const urls: ReadonlyMap<string, string> = new Map(
    ids.flatMap((id, index) => {
      const url = photos[index]?.data;
      return url ? [[id, url] as const] : [];
    }),
  );
  const pending = (wanted: (id: string) => boolean) =>
    ids.some((id, index) => wanted(id) && fetching(photos[index]!));
  return {
    loading: pending((id) => base.has(id)) || fetching(logo),
    appendixLoading: pending((id) => !base.has(id)),
    urls,
    logoUrl: logo.data ?? DEFAULT_LOGO_URL,
    logoImageId,
  };
}

export type PrintImages = ReturnType<typeof usePrintImages>;

/** Without an id the query idles: there is nothing to wait for. */
function fetching(query: { isPending: boolean; fetchStatus: string }): boolean {
  return query.isPending && query.fetchStatus !== 'idle';
}
