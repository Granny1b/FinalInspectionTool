import { useLayoutEffect, type RefObject } from 'react';

/**
 * Keeps whatever is scrolled into view (rows as the focus moves, jump links) clear of a sticky
 * header, by setting the page's `scroll-padding-top` to where the header ends. Measured, because
 * this header's height changes with the window width and the length of the machine name.
 */
export function useScrollPaddingBelow(header: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => {
      // `top` is where it sticks: below the tablet top bar, or at 0 on wide screens.
      const top = Number.parseFloat(getComputedStyle(element).top) || 0;
      root.style.scrollPaddingTop = `${top + element.offsetHeight + 8}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      root.style.scrollPaddingTop = '';
    };
  }, [header]);
}
