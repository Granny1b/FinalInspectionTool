import { useEffect, useState, type RefObject } from 'react';

/**
 * True once everything the printout shows has arrived: every image under `root` has loaded (or
 * failed: then it shows its fallback) and the fonts are in, so neither printing nor a PDF taken
 * now can miss them. `key` names what is shown (the image URLs): when it changes, this waits again.
 */
export function useAssetsReady(root: RefObject<HTMLElement | null>, key: string): boolean {
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let current = true;
    const images = Array.from(element.querySelectorAll('img'), settled);
    // Laying the page out makes the browser start loading every font its text needs, so
    // `fonts.ready` below waits for those too.
    element.getBoundingClientRect();
    void Promise.all([...images, document.fonts.ready]).then(() => {
      if (current) setReadyFor(key);
    });
    return () => {
      current = false;
    };
  }, [root, key]);

  return readyFor === key;
}

function settled(image: HTMLImageElement): Promise<void> {
  // `complete` is also true for an image that failed.
  if (image.complete) return Promise.resolve();
  return new Promise((resolve) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  });
}
