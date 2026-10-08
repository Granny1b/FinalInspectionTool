import { useEffect, useState } from 'react';

type Loaded = { src: string; image: HTMLImageElement | null };

/**
 * Loads an image for the canvas: `image` once it has loaded, `failed` if it couldn't. Photos come
 * from blob storage, another origin, so they are requested with CORS: otherwise the canvas would
 * be "tainted" and the flattened copy could not be exported.
 */
export function useLoadedImage(src: string | undefined): {
  image: HTMLImageElement | null;
  failed: boolean;
} {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!src) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setLoaded({ src, image });
    image.onerror = () => setLoaded({ src, image: null });
    image.src = src;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  const current = loaded && loaded.src === src ? loaded : null;
  return { image: current?.image ?? null, failed: current !== null && current.image === null };
}

/** The element's content size, kept up to date (0 × 0 until measured). */
export function useElementSize(element: HTMLElement | null): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return size;
}
