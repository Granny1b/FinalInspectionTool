import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { fitScale, SHEET_WIDTH_PX } from './preview';

/**
 * The printed sheets on screen, drawn smaller when the desk they lie on (the element this is
 * in) is narrower than A4: a phone, a portrait tablet. The whole width of a page then shows
 * without scrolling sideways; never larger than A4. Shared by the print route and the preview
 * dialog, so both show a page alike.
 *
 * A transform, not `zoom`: the browser lays the pages out exactly as for print and only draws
 * them smaller, so lines break where they will on paper, and useCardPages measures through it.
 * The sizes are custom properties that print.css uses on screen only: on paper the sheets are
 * plain blocks at their real size.
 */
export function FittedPages({ children }: { children: ReactNode }) {
  const fitRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  // The desk is measured through this element: a parent's ref isn't set yet when a child's
  // layout effect runs.
  const width = useContentSize(fitRef, 'width', 'parent');
  const height = useContentSize(pagesRef, 'height');
  const scale = fitScale(width);
  const style = {
    '--paper-fit-scale': scale,
    '--paper-fit-width': `${SHEET_WIDTH_PX * scale}px`,
    '--paper-fit-height': `${height * scale}px`,
  } as CSSProperties;

  return (
    <div ref={fitRef} className="paper-fit" style={style}>
      <div ref={pagesRef} className="paper-fit-pages">
        {children}
      </div>
    </div>
  );
}

/**
 * An element's (or its parent's) content-box width or height in CSS pixels, as laid out (a
 * transform doesn't change it), kept up to date as it resizes.
 */
function useContentSize(
  ref: RefObject<HTMLElement | null>,
  side: 'width' | 'height',
  of: 'self' | 'parent' = 'self',
): number {
  const [size, setSize] = useState(0);
  // Measured before the first paint, so the pages never show at the wrong size.
  useLayoutEffect(() => {
    const element = of === 'parent' ? ref.current?.parentElement : ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    setSize(
      side === 'width'
        ? element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        : element.offsetHeight,
    );
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize(entry.contentRect[side]);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, side, of]);
  return size;
}
