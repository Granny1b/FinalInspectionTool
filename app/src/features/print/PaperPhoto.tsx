import { useState, type ReactNode } from 'react';

type Props = {
  /** Null when the photo's address couldn't be fetched. */
  url: string | null;
  alt: string;
  /** Shown in the photo's place when there is no address or the image fails to load. */
  missing: ReactNode;
};

/** An uploaded photo on paper, or `missing` in its place. */
export function PaperPhoto({ url, alt, missing }: Props) {
  // The address that failed to load: a fresh one (read URLs expire) is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl) return missing;
  return <img src={url} alt={alt} onError={() => setFailedUrl(url)} />;
}
