import { useEffect, useRef, useState } from 'react';
import { packCards, type DeviationCard, type DeviationsPerPage } from './model';

/** CSS pixels per millimetre, at any zoom. */
const PX_PER_MM = 96 / 25.4;

/** Nothing to measure: no deviations, so no pages of cards. */
const NO_PAGES: DeviationCard[][] = [];
const NO_HEIGHTS: ReadonlyMap<string, number> = new Map();

type Paged = {
  cards: readonly DeviationCard[];
  perPage: DeviationsPerPage;
  pages: DeviationCard[][];
  /** Each card's natural height in mm, by its number. */
  heights: ReadonlyMap<string, number>;
  /** The height a full page has for its cards, in mm. */
  room: number;
};

/**
 * Puts the report's deviation cards on pages (`packCards`). Only the laid-out page knows how tall
 * a card's text makes it, so while `pages` is null, DeviationCards lays all cards out once on a
 * hidden page (`measureRef`) as tall as a printed one (print.css, --paper-content-height), at
 * their natural height in the chosen layout; they are measured once the fonts are in. Each page
 * then holds `perPage` cards, or fewer when their text needs the room. The heights and the room
 * also tell which card is too tall to share a page at all (`isOversizedPage`).
 */
export function useCardPages(cards: readonly DeviationCard[], perPage: DeviationsPerPage) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [paged, setPaged] = useState<Paged | null>(null);
  const current = paged?.cards === cards && paged.perPage === perPage ? paged : null;
  const pages = cards.length === 0 ? NO_PAGES : (current?.pages ?? null);

  useEffect(() => {
    const page = measureRef.current;
    if (pages || !page) return;
    let active = true;
    // Laying the text out starts loading the fonts it needs, so `fonts.ready` waits for them.
    page.getBoundingClientRect();
    void document.fonts.ready.then(() => {
      if (!active) return;
      const { heights, room } = measure(page, perPage);
      setPaged({
        cards,
        perPage,
        pages: packCards(cards, heights, { perPage, room }),
        heights: new Map(cards.map((card, index) => [card.number, heights[index] ?? 0])),
        room,
      });
    });
    return () => {
      active = false;
    };
  }, [cards, perPage, pages]);

  return {
    pages,
    heights: current?.heights ?? NO_HEIGHTS,
    room: current?.room ?? 0,
    measureRef,
  };
}

/**
 * The cards' heights and the room a page has for them: the page less its heading and the gaps of
 * a full page (a page with fewer cards keeps the empty slots, so the gaps are always there).
 */
function measure(page: HTMLElement, perPage: number): { heights: number[]; room: number } {
  const mm = (px: number) => px / PX_PER_MM;
  const list = page.querySelector<HTMLElement>('[data-card-list]')!;
  const box = page.getBoundingClientRect();
  const heading = mm(list.getBoundingClientRect().top - box.top);
  const gap = mm(parseFloat(getComputedStyle(list).rowGap) || 0);
  const heights = Array.from(list.children, (card) => mm(card.getBoundingClientRect().height));
  return { heights, room: mm(box.height) - heading - (perPage - 1) * gap };
}

export type CardPages = ReturnType<typeof useCardPages>;
