import { LoaderCircle, Printer, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../components/Button';
import { LoadError } from '../../../components/PageStates';
import { errorMessage } from '../../../lib/api';
import { FittedPages } from '../../print/FittedPages';
import { isPrintShortcut } from '../../print/preview';
import { useAssetsReady } from '../../print/useAssetsReady';
import type { InsightsFilter } from '../filters';
import { ListToggle } from './ListToggle';
import { ReportDocument } from './ReportDocument';
import { useReport, type ReportState } from './useReport';

type Props = {
  /** The Insights page's filters: the report shows exactly what the page does. */
  filter: InsightsFilter;
  /** Prints the report as shown, with or without the list (the dialog has closed by then). */
  onPrint: (list: boolean) => void;
  /** Runs once the dialog has closed (Escape, Close or Print); unmount it then. */
  onClose: () => void;
};

/**
 * A quick look at the printed report from the Insights page, as the inspection page's Preview: a
 * full-screen dialog with the A4 pages drawn to fit the screen, light paper in either theme.
 * Nothing opens in a new tab and no print dialog appears; Print / Save PDF (or Ctrl+P) does.
 * Escape or Close returns to the page, and the focus to what opened it.
 */
export function ReportPreviewDialog({ filter, onPrint, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [includeList, setIncludeList] = useState(false);
  const state = useReport(filter, includeList);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Not the first control (a switch): Close, so Enter or Space right away does what Escape does.
    closeRef.current?.focus();
  }, []);

  /** Closing hands the focus back before the print tab opens. */
  const print = () => {
    dialogRef.current?.close();
    onPrint(includeList);
  };

  const subject = state.status === 'ready' ? state.report.subject : 'Deviation report';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-print-preview=""
      onClose={onClose}
      onKeyDown={(event) => {
        // Ctrl+P / ⌘P would print the Insights page behind the dialog: print the report instead.
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
          <ListToggle
            value={includeList}
            onChange={setIncludeList}
            available={
              state.status !== 'ready' || (!state.report.empty && state.report.deviations > 0)
            }
          />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button onClick={print} disabled={state.status === 'invalid'}>
              <Printer size={16} aria-hidden="true" />
              Print / Save PDF
            </Button>
            <Button ref={closeRef} variant="secondary" onClick={() => dialogRef.current?.close()}>
              <X size={16} aria-hidden="true" />
              Close
            </Button>
          </div>
        </header>
        {state.status === 'failed' ? (
          <Message>
            <LoadError
              title="We couldn't load the preview"
              message={errorMessage(state.query.error)}
              onRetry={() => void state.query.refetch()}
              retrying={state.query.isFetching}
            />
          </Message>
        ) : state.status === 'invalid' ? (
          <Message>
            <p role="alert" className="text-center text-sm text-ink-700">
              These filters can’t be printed. {state.message}
            </p>
          </Message>
        ) : state.status === 'loading' ? (
          <Preparing />
        ) : (
          <Pages
            state={state}
            // While the list is on its way, the report stays and the list joins it.
            ready={!state.listLoading}
          />
        )}
      </div>
    </dialog>
  );
}

function Message({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>;
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

type PagesProps = {
  state: Extract<ReportState, { status: 'ready' }>;
  ready: boolean;
};

/** The report on the grey desk, its sheets scaled down to the desk's width on a narrow screen. */
function Pages({ state, ready }: PagesProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const loaded = useAssetsReady(rootRef, state.shown);
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
        <ReportDocument
          report={state.report}
          logoUrl={state.logoUrl}
          ready={loaded && ready}
          rootRef={rootRef}
        />
      </FittedPages>
    </div>
  );
}
