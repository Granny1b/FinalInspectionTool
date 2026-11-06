import { useEffect, useRef, useState } from 'react';
import { closingFits, packCards, type DeviationCard, type DeviationsPerPage } from './model';

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
  /** What a block above the first page's cards takes of that page's room, in mm (0: none). */
  first: number;
  /** A block after the last card doesn't fit under it: it has a page of its own. */
  closingAlone: boolean;
};

/**
 * Puts the report's deviation cards on pages (`packCards`). Only the laid-out page knows how tall
 * a card's text makes it, so while `pages` is null, DeviationCards lays all cards out once on a
 * hidden page (`measureRef`) as tall as a printed one (print.css, --paper-content-height), at
 * their natural height in the chosen layout; they are measured once the fonts are in. Each page
 * then holds `perPage` cards, or fewer when their text needs the room. The heights and the room
 * also tell which card is too tall to share a page at all (`isOversizedPage`).
 *
 * A block above the first page's cards (`[data-card-lead]`) and one after the last card
 * (`[data-card-closing]`), when the hidden page has them, are measured with the cards: the first
 * page holds fewer cards for the one, and the other goes under the last card if it fits there.
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
      const { heights, room, first, closing } = measure(page, perPage);
      const packed = packCards(cards, heights, { perPage, room, first });
      const byNumber = new Map(cards.map((card, index) => [card.number, heights[index] ?? 0]));
      const last = packed.at(-1) ?? [];
      setPaged({
        cards,
        perPage,
        pages: packed,
        heights: byNumber,
        room,
        first,
        closingAlone:
          closing > 0 &&
          !closingFits(
            last.map((card) => byNumber.get(card.number) ?? 0),
            packed.length === 1 ? room - first : room,
            closing,
          ),
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
    first: current?.first ?? 0,
    closingAlone: current?.closingAlone ?? false,
    measureRef,
  };
}

/**
 * The cards' heights and the room a page has for them: the page less its heading and the gaps of
 * a full page (a page with fewer cards keeps the empty slots, so the gaps are always there). With
 * a lead block above the heading, `first` is its height down to the heading; with a closing block
 * after the cards, `closing` is its height and the gap above it. Both 0 when there is none.
 *
 * The page may be drawn scaled (the preview dialog fits A4 to the screen with a transform): its
 * rectangles are then scaled too, its computed sizes are not, so the rectangles are scaled back.
 */
function measure(
  page: HTMLElement,
  perPage: number,
): { heights: number[]; room: number; first: number; closing: number } {
  const list = page.querySelector<HTMLElement>('[data-card-list]')!;
  const lead = page.querySelector<HTMLElement>('[data-card-lead]');
  const closingBlock = page.querySelector<HTMLElement>('[data-card-closing]');
  const box = page.getBoundingClientRect();
  const scale = box.height / parseFloat(getComputedStyle(page).height) || 1;
  const mm = (px: number) => px / scale / PX_PER_MM;
  const first = lead ? mm(lead.nextElementSibling!.getBoundingClientRect().top - box.top) : 0;
  const heading = mm(list.getBoundingClientRect().top - box.top) - first;
  const gap = (parseFloat(getComputedStyle(list).rowGap) || 0) / PX_PER_MM;
  const heights = Array.from(list.children, (card) => mm(card.getBoundingClientRect().height));
  const closing = closingBlock ? mm(closingBlock.getBoundingClientRect().height) + gap : 0;
  return { heights, room: mm(box.height) - heading - (perPage - 1) * gap, first, closing };
}

export type CardPages = ReturnType<typeof useCardPages>;
