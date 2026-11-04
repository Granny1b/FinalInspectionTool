import { useEffect, useRef } from 'react';
import { WordExportButton } from '../export/WordExportButton';
import {
  DEFAULT_DEVIATIONS_PER_PAGE,
  type DeviationsPerPage,
  type PrintMode,
  type PrintModel,
} from './model';
import { FittedPages } from './FittedPages';
import { PrintDocument } from './PrintDocument';
import { PrintToolbar, type Choice } from './PrintToolbar';
import { usePageFooter } from './usePageFooter';
import { usePrintDocument } from './usePrintDocument';
import type { PrintImages } from './usePrintImages';
import './print.css';

type Props = {
  model: PrintModel;
  images: PrintImages;
  /** What is printed, under "Print preview"; cut short on a narrow screen. */
  subject: string;
  /** After the subject, never cut: "Draft – Rev 3". */
  revision?: string;
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
  revision,
  back,
  mode,
  deviationsPerPage,
  appendix,
  autoprint = false,
  onAutoprinted,
}: Props) {
  const perPage = deviationsPerPage?.value ?? DEFAULT_DEVIATIONS_PER_PAGE;
  const { rootRef, cards, withAppendix, appendixShown, ready } = usePrintDocument(model, images, {
    perPage,
    appendix: appendix.value,
  });
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
        revision={revision}
        back={back}
        mode={mode}
        // Only a report has deviation cards; the blank summary is a table.
        deviationsPerPage={model.deviations.kind === 'cards' ? deviationsPerPage : undefined}
        appendix={{ ...appendix, available: model.appendix.length > 0 }}
        ready={ready}
      >
        <WordExportButton model={model} appendix={withAppendix} logoImageId={images.logoImageId} />
      </PrintToolbar>
      {/* On a phone or a portrait tablet the sheets are drawn to fit, as in the preview dialog. */}
      <main className="paper-desk flex-1">
        <FittedPages>
          <PrintDocument
            model={model}
            images={images}
            deviationsPerPage={perPage}
            cardPages={cards}
            appendix={appendixShown}
            ready={ready}
            rootRef={rootRef}
          />
        </FittedPages>
      </main>
    </div>
  );
}
