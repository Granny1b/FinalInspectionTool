import { useEffect, useRef, useState } from 'react';
import { packCards, type DeviationCard, type DeviationsPerPage } from './model';

/** CSS pixels per millimetre, at any zoom. */
const PX_PER_MM = 96 / 25.4;
/** A page's content box is 267 mm (A4 less the @page margins); 2 mm less never spills over. */
const PAGE_HEIGHT_MM = 265;

/** Nothing to measure: no deviations, so no pages of cards. */
const NO_PAGES: DeviationCard[][] = [];

type Paged = {
  cards: readonly DeviationCard[];
  perPage: DeviationsPerPage;
  pages: DeviationCard[][];
};

/**
 * Puts the report's deviation cards on pages (`packCards`). Only the laid-out page knows how tall
 * a card's text makes it, so while `pages` is null, DeviationCards lays all cards out once on a
 * hidden page (`measureRef`), at their natural height in the chosen layout; they are measured
 * once the fonts are in. Each page then holds `perPage` cards, or fewer when their text needs the
 * room.
 */
export function useCardPages(cards: readonly DeviationCard[], perPage: DeviationsPerPage) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [paged, setPaged] = useState<Paged | null>(null);
  const pages =
    cards.length === 0
      ? NO_PAGES
      : paged?.cards === cards && paged.perPage === perPage
        ? paged.pages
        : null;

  useEffect(() => {
    const page = measureRef.current;
    if (pages || !page) return;
    let current = true;
    // Laying the text out starts loading the fonts it needs, so `fonts.ready` waits for them.
    page.getBoundingClientRect();
    void document.fonts.ready.then(() => {
      if (!current) return;
      const { heights, room } = measure(page, perPage);
      setPaged({ cards, perPage, pages: packCards(cards, heights, { perPage, room }) });
    });
    return () => {
      current = false;
    };
  }, [cards, perPage, pages]);

  return { pages, measureRef };
}

/**
 * The cards' heights and the room a page has for them: the page less its heading and the gaps of
 * a full page (a page with fewer cards keeps the empty slots, so the gaps are always there).
 */
function measure(page: HTMLElement, perPage: number): { heights: number[]; room: number } {
  const mm = (px: number) => px / PX_PER_MM;
  const list = page.querySelector<HTMLElement>('[data-card-list]')!;
  const heading = mm(list.getBoundingClientRect().top - page.getBoundingClientRect().top);
  const gap = mm(parseFloat(getComputedStyle(list).rowGap) || 0);
  const heights = Array.from(list.children, (card) => mm(card.getBoundingClientRect().height));
  return { heights, room: PAGE_HEIGHT_MM - heading - (perPage - 1) * gap };
}
