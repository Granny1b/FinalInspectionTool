import { LoaderCircle, Printer, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/PageStates';
import { errorMessage } from '../../lib/api';
import { FittedPages } from './FittedPages';
import {
  defaultDeviationsPerPage,
  PRINT_MODE_LABELS,
  PRINT_MODES,
  type PrintMode,
  type PrintModel,
} from './model';
import { isPrintShortcut } from './preview';
import { PrintDocument } from './PrintDocument';
import { Segmented, type Choice } from './PrintToolbar';
import { usePrintDocument } from './usePrintDocument';
import { usePrintImages, type PrintImages } from './usePrintImages';
import './print.css';

type FailedQuery = { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };

type Props = {
  /** What is shown, under "Preview": "FI-2026-0042 · RigiMill MG – Volvo Skövde". */
  subject: string;
  /** Null until the settings (company name, model names) are in. */
  model: PrintModel | null;
  logoImageId: string | undefined;
  /** The blank checklist or the report. */
  mode: Choice<PrintMode>;
  /** The settings couldn't be loaded. */
  failed?: FailedQuery | null;
  /** Prints what is shown, as Print / Save PDF does; the dialog closes first. */
  onPrint: () => void;
  /** Runs once the dialog has closed (Escape, Close or Print); unmount it then. */
  onClose: () => void;
};

/**
 * A quick look at the printout without printing (or saving) first: a full-screen dialog with the
 * printed pages, the same components as the print route, built from what the page holds and
 * scaled to fit the screen. Light paper in either theme, like the print preview. Escape or Close
 * closes it, and the focus goes back to what opened it; Print / Save PDF (or Ctrl+P) prints it.
 */
export function PrintPreviewDialog({
  subject,
  model,
  logoImageId,
  mode,
  failed,
  onPrint,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const images = usePrintImages(model, logoImageId, { appendix: false });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Not the first control (a switch): Close, so Enter or Space right away does what Escape does.
    closeRef.current?.focus();
  }, []);

  /** Closing hands the focus back before the print tab opens. */
  const print = () => {
    dialogRef.current?.close();
    onPrint();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-print-preview=""
      onClose={onClose}
      onKeyDown={(event) => {
        // Ctrl+P / ⌘P would print the page behind the dialog: print what is shown instead.
        if (isPrintShortcut(event)) {
          event.preventDefault();
          print();
        }
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-canvas p-0 text-ink-900 backdrop:bg-scrim/30 dark:backdrop:bg-scrim/70"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink-200 bg-surface px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 basis-48">
            <h2 id={titleId} className="text-base font-semibold text-ink-900">
              Preview
            </h2>
            <p className="truncate text-xs text-ink-500">{subject}</p>
          </div>
          <Segmented
            label="What to show"
            options={PRINT_MODES.map((value) => ({ value, label: PRINT_MODE_LABELS[value] }))}
            {...mode}
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button onClick={print}>
              <Printer size={16} aria-hidden="true" />
              Print / Save PDF
            </Button>
            <Button ref={closeRef} variant="secondary" onClick={() => dialogRef.current?.close()}>
              <X size={16} aria-hidden="true" />
              Close
            </Button>
          </div>
        </header>
        {failed ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <LoadError
              title="We couldn't load the preview"
              message={errorMessage(failed.error)}
              onRetry={() => void failed.refetch()}
              retrying={failed.isFetching}
            />
          </div>
        ) : !model || images.loading ? (
          <Preparing />
        ) : (
          <FittedDocument model={model} images={images} />
        )}
      </div>
    </dialog>
  );
}

function Preparing() {
  return (
    <div className="paper-desk flex min-h-0 flex-1 items-center justify-center">
      <p role="status" className="flex items-center gap-2 text-sm text-ink-700">
        <LoaderCircle size={18} aria-hidden="true" className="animate-spin" />
        Preparing the preview…
      </p>
    </div>
  );
}

/**
 * The document on the grey desk, its sheets scaled down to the desk's width on a narrow screen
 * (FittedPages), with the cards as the print route opens them.
 */
function FittedDocument({ model, images }: { model: PrintModel; images: PrintImages }) {
  const perPage = defaultDeviationsPerPage(model);
  const { rootRef, cards, ready } = usePrintDocument(model, images, { perPage, appendix: false });

  return (
    // Focusable, so the pages scroll from the keyboard too. In the dark theme its ring is a
    // lighter cyan: brand 600 is below 3:1 on the dark desk (ink-200).
    <div
      tabIndex={0}
      role="region"
      aria-label="Printed pages"
      className="paper-desk min-h-0 flex-1 overflow-y-auto -outline-offset-2 dark:focus-visible:outline-brand-500"
    >
      <FittedPages>
        <PrintDocument
          model={model}
          images={images}
          deviationsPerPage={perPage}
          cardPages={cards}
          appendix={false}
          ready={ready}
          rootRef={rootRef}
        />
      </FittedPages>
    </div>
  );
}
