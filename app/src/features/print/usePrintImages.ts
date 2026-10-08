import { useImageUrl } from '../../lib/images';

/** Printed when the settings name no logo of their own, or it can't be fetched. */
const DEFAULT_LOGO_URL = '/modig-logo.png';

/**
 * Addresses of the front page's images: the machine photo (or a template's cover) and the logo
 * from the settings. `loading` until both are known, so the document renders once, complete.
 */
export function usePrintImages(photoId: string | undefined, logoImageId: string | undefined) {
  const photo = useImageUrl(photoId);
  const logo = useImageUrl(logoImageId);
  return {
    loading: fetching(photo) || fetching(logo),
    /** Null when the photo's address couldn't be fetched: the page says so in its place. */
    photoUrl: photo.data ?? null,
    logoUrl: logo.data ?? DEFAULT_LOGO_URL,
  };
}

/** Without an id the query idles: there is nothing to wait for. */
function fetching(query: { isPending: boolean; fetchStatus: string }): boolean {
  return query.isPending && query.fetchStatus !== 'idle';
}
