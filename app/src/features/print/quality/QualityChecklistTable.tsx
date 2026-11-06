import { SEVERITY_LABELS, STATUS_LABELS } from '@modig/shared';
import { useId } from 'react';
import { STATUS_ICONS } from '../../inspections/checklist/status';
import type { QualityPrintRow, QualityPrintSection } from './model';

type Props = {
  section: QualityPrintSection;
  /** The page footer as a repeating table footer, for browsers without margin boxes. */
  fallbackFooter: string | null;
};

/**
 * One section of a quality check's report as a table: Ref | What to check (with how and the
 * references under it) | Result | Comment. Its title, rows and time, and the column labels, are
 * the table head, which repeats on every page the section runs onto; a row is never split
 * (print.css, as the final report's checklist). The rows' pictures are left out: they show how a
 * checkpoint should look in the app, and the report stays short.
 */
export function QualityChecklistTable({ section, fallbackFooter }: Props) {
  const titleId = useId();
  return (
    <table
      className="paper-table paper-qc-table"
      data-section-ref={section.number}
      aria-labelledby={titleId}
    >
      <colgroup>
        <col className="paper-col-ref" />
        <col />
        <col className="paper-qc-col-result" />
        <col className="paper-qc-col-comment" />
      </colgroup>
      <thead>
        <tr className="paper-section-title">
          <th id={titleId} colSpan={4} scope="colgroup">
            {/* First, floated right: the title then wraps clear of it. */}
            <span className="paper-qc-section-stats">{section.stats}</span>
            <span className="paper-section-number">{section.number}</span>
            {section.title || 'Untitled section'}
          </th>
        </tr>
        <tr className="paper-columns">
          <th scope="col">Ref</th>
          <th scope="col">What to check</th>
          <th scope="col" className="paper-mark-cell">
            Result
          </th>
          <th scope="col">Comment</th>
        </tr>
      </thead>
      {fallbackFooter && (
        <tfoot className="paper-fallback-footer">
          <tr>
            <td colSpan={4}>{fallbackFooter}</td>
          </tr>
        </tfoot>
      )}
      <tbody>
        {section.rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="paper-empty">
              No checkpoints in this section.
            </td>
          </tr>
        ) : (
          section.rows.map((row) => <Row key={row.ref} row={row} />)
        )}
      </tbody>
    </table>
  );
}

/**
 * Text this long makes a row about a third of a page or more, as the final report's checklist
 * counts a comment (ChecklistTable); How runs in a column about twice as wide. Such a row doesn't
 * hold its neighbours on its page (print.css).
 */
const LONG_COMMENT = 600;
const LONG_HOW = 1200;

function Row({ row }: { row: QualityPrintRow }) {
  const long = row.comment.length > LONG_COMMENT || row.how.length > LONG_HOW;
  return (
    <tr data-row-ref={row.ref} data-status={row.status ?? undefined} data-long={long || undefined}>
      <td className="paper-ref">{row.ref}</td>
      <td>
        <p className="paper-qc-what">{row.what}</p>
        {row.how && <p className="paper-qc-how">{row.how}</p>}
        {row.references.length > 0 && <p className="paper-qc-refs">{row.references.join(' · ')}</p>}
      </td>
      <td className="paper-mark-cell">
        <Result row={row} />
      </td>
      <td>
        {/* Where to read on: the row's card in the deviations, "D-02 · Major". */}
        {row.deviation && (
          <span className="paper-severity">
            {row.deviation.number} · {SEVERITY_LABELS[row.deviation.severity]}
          </span>
        )}
        {row.comment}
      </td>
    </tr>
  );
}

/**
 * The status as its mark and its word (✓ OK, ✗ NOK, – N/A), never by colour: readable from a
 * black-and-white printer. A NOK is boxed, so it stands out down the column.
 */
function Result({ row }: { row: QualityPrintRow }) {
  if (row.status === null) return <span className="paper-qc-open">Not filled</span>;
  const Mark = STATUS_ICONS[row.status];
  return (
    <span className="paper-qc-result" data-status={row.status}>
      <Mark strokeWidth={3} aria-hidden="true" />
      {STATUS_LABELS[row.status]}
    </span>
  );
}
