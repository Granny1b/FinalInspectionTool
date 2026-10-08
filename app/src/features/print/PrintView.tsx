import { useEffect, useRef } from 'react';
import { WordExportButton } from '../export/WordExportButton';
import {
  DEFAULT_DEVIATIONS_PER_PAGE,
  printedImageIds,
  type DeviationCard,
  type DeviationsPerPage,
  type PrintMode,
  type PrintModel,
} from './model';
import { PrintDocument } from './PrintDocument';
import { PrintToolbar, type Choice } from './PrintToolbar';
import { useAssetsReady } from './useAssetsReady';
import { useCardPages } from './useCardPages';
import { usePageFooter } from './usePageFooter';
import type { PrintImages } from './usePrintImages';
import './print.css';

/** A blank checklist has no cards to put on pages. */
const NO_CARDS: DeviationCard[] = [];

type Props = {
  model: PrintModel;
  images: PrintImages;
  /** What is printed, under "Print preview". */
  subject: string;
  back: { to: string; label: string };
  /** Inspections switch between the blank checklist and the report. */
  mode?: Choice<PrintMode>;
  /** A report's deviation cards per page, and how to change it. */
  deviationsPerPage?: Choice<DeviationsPerPage>;
  /** "Include reference images" (`?appendix=1`), and how to change it. */
  appendix: Choice<boolean>;
  /** `?autoprint=1`: open the print dialog once, as soon as everything is loaded. */
  autoprint?: boolean;
  /** Called as autoprint fires, to drop the flag (a reload must not print again). */
  onAutoprinted?: () => void;
};

/**
 * A print route's page: the toolbar over a calm preview of A4 sheets on screen, the bare document
 * on paper, with the page footer on every page. Rendered once the data is loaded.
 */
export function PrintView({
  model,
  images,
  subject,
  back,
  mode,
  deviationsPerPage,
  appendix,
  autoprint = false,
  onAutoprinted,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const perPage = deviationsPerPage?.value ?? DEFAULT_DEVIATIONS_PER_PAGE;
  const cards = useCardPages(
    model.deviations.kind === 'cards' ? model.deviations.cards : NO_CARDS,
    perPage,
  );
  // Asked for and there is something to show: the appendix (in print and Word alike).
  const withAppendix = appendix.value && model.appendix.length > 0;
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
  usePageFooter(model.footer);

  const printed = useRef(false);
  useEffect(() => {
    if (!ready || !autoprint || printed.current) return;
    printed.current = true;
    onAutoprinted?.();
    window.print();
  }, [ready, autoprint, onAutoprinted]);

  return (
    // A column on screen, so the grey desk fills the window; plain blocks on paper, where a flex
    // container would only complicate page breaks.
    <div className="flex min-h-dvh flex-col print:block">
      {/* Chrome offers the title as the PDF's file name. */}
      <title>{model.fileName}</title>
      <PrintToolbar
        subject={subject}
        back={back}
        mode={mode}
        // Only a report has deviation cards; the blank summary is a table.
        deviationsPerPage={model.deviations.kind === 'cards' ? deviationsPerPage : undefined}
        appendix={{ ...appendix, available: model.appendix.length > 0 }}
        ready={ready}
      >
        <WordExportButton model={model} appendix={withAppendix} logoImageId={images.logoImageId} />
      </PrintToolbar>
      <main className="paper-desk flex-1">
        <PrintDocument
          model={model}
          images={images}
          deviationsPerPage={perPage}
          cardPages={cards}
          appendix={appendixShown}
          ready={ready}
          rootRef={rootRef}
        />
      </main>
    </div>
  );
}
