import { useRef } from 'react';
import {
  printedImageIds,
  type DeviationCard,
  type DeviationsPerPage,
  type PrintModel,
} from './model';
import { useAssetsReady } from './useAssetsReady';
import { useCardPages } from './useCardPages';
import type { PrintImages } from './usePrintImages';

/** A blank checklist has no cards to put on pages. */
const NO_CARDS: DeviationCard[] = [];

/**
 * What PrintDocument needs besides the model, for the print route and the preview dialog alike:
 * the report's cards on pages, whether the appendix is shown, and `ready` once everything in it
 * has loaded (images, fonts, the cards measured and the appendix's images, when asked for).
 */
export function usePrintDocument(
  model: PrintModel,
  images: PrintImages,
  { perPage, appendix }: { perPage: DeviationsPerPage; appendix: boolean },
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cards = useCardPages(
    model.deviations.kind === 'cards' ? model.deviations.cards : NO_CARDS,
    perPage,
  );
  // Asked for and there is something to show: the appendix (in print and Word alike).
  const withAppendix = appendix && model.appendix.length > 0;
  // Its images' addresses arrive a moment after it is turned on.
  const appendixShown = withAppendix && !images.appendixLoading;
  // What is laid out and every image address in it: when any changes, readiness waits again.
  const shown = [
    model.mode,
    perPage,
    appendixShown,
    cards.pages?.map((page) => page.map((card) => card.number).join()).join('|'),
    images.logoUrl,
    ...printedImageIds(model, { appendix: appendixShown }).map((id) => images.urls.get(id) ?? ''),
  ].join(' ');
  // Not while the cards are being measured onto pages, nor before the appendix is in.
  const ready =
    useAssetsReady(rootRef, shown) && cards.pages !== null && appendixShown === withAppendix;
  return { rootRef, cards, withAppendix, appendixShown, ready };
}
