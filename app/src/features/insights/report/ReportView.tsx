import { useEffect, useRef } from 'react';
import { FittedPages } from '../../print/FittedPages';
import { PrintToolbar, type Choice } from '../../print/PrintToolbar';
import { useAssetsReady } from '../../print/useAssetsReady';
import { usePageFooter } from '../../print/usePageFooter';
import { ListToggle } from './ListToggle';
import type { Report } from './model';
import { ReportDocument } from './ReportDocument';

type Props = {
  report: Report;
  logoUrl: string;
  /** Names what is shown; readiness is waited for again when it changes. */
  shown: string;
  back: { to: string; label: string };
  /** "Include deviation list" (`?deviations=1`), and how to change it. */
  list: Choice<boolean>;
  /** The list is asked for and still on its way. */
  listLoading: boolean;
  /** `?autoprint=1`: open the print dialog once, as soon as everything is loaded. */
  autoprint: boolean;
  /** Called as autoprint fires, to drop the flag (a reload must not print again). */
  onAutoprinted: () => void;
};

/**
 * The report's print route, as an inspection's: the print toolbar over the A4 sheets on the grey
 * desk (fitted to a phone or tablet), the bare document on paper, the footer on every page, and
 * autoprint once the data, the logo and the fonts are in.
 */
export function ReportView({
  report,
  logoUrl,
  shown,
  back,
  list,
  listLoading,
  autoprint,
  onAutoprinted,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = useAssetsReady(rootRef, shown) && !listLoading;
  usePageFooter(report.subject);

  const printed = useRef(false);
  useEffect(() => {
    if (!ready || !autoprint || printed.current) return;
    printed.current = true;
    onAutoprinted();
    window.print();
  }, [ready, autoprint, onAutoprinted]);

  return (
    // A column on screen, so the grey desk fills the window; plain blocks on paper.
    <div className="flex min-h-dvh flex-col print:block">
      {/* Chrome offers the title as the PDF's file name. */}
      <title>{report.fileName}</title>
      <PrintToolbar
        subject={report.subject}
        back={back}
        ready={ready}
        choices={<ListToggle {...list} available={!report.empty && report.deviations > 0} />}
      />
      <main className="paper-desk flex-1">
        <FittedPages>
          <ReportDocument report={report} logoUrl={logoUrl} ready={ready} rootRef={rootRef} />
        </FittedPages>
      </main>
    </div>
  );
}
