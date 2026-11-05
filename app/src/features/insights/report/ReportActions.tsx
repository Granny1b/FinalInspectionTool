import { Eye, Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import type { InsightsFilter } from '../filters';
import { reportHref } from './links';
import { ReportPreviewDialog } from './ReportPreviewDialog';

type Props = {
  /** The page's filters: the report covers exactly what the page shows. */
  filter: InsightsFilter;
  /** The filters can't be used (a range that ends before it starts): nothing to report. */
  disabled: boolean;
};

/**
 * The Insights page's report actions, next to Export CSV: **Preview report** opens the printed
 * report in a dialog at once; **Print report** opens it in a new tab, which prints once it has
 * loaded, as an inspection's Print / Save PDF does.
 */
export function ReportActions({ filter, disabled }: Props) {
  const previewRef = useRef<HTMLButtonElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const print = (list: boolean) =>
    window.open(reportHref(filter, { list, autoprint: true }), '_blank', 'noopener');

  return (
    <>
      <Button
        ref={previewRef}
        variant="secondary"
        onClick={() => setPreviewing(true)}
        disabled={disabled}
      >
        <Eye size={16} aria-hidden="true" />
        Preview report
      </Button>
      <Button variant="secondary" onClick={() => print(false)} disabled={disabled}>
        <Printer size={16} aria-hidden="true" />
        Print report
      </Button>
      {previewing && (
        <ReportPreviewDialog
          filter={filter}
          onPrint={print}
          onClose={() => {
            setPreviewing(false);
            // The dialog hands the focus back to what had it, but Safari doesn't focus a button
            // that is clicked or tapped: back to Preview report in any case.
            previewRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
