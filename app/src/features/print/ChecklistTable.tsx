import { SEVERITY_LABELS, STATUS_LABELS, STATUSES, type Status } from '@modig/shared';
import { useId } from 'react';
import { STATUS_ICONS } from '../inspections/checklist/status';
import type { PrintRow, PrintSection } from './model';

type Props = {
  section: PrintSection;
  /** The page footer as a repeating table footer, for browsers without margin boxes. */
  fallbackFooter: string | null;
};

/**
 * One section as a table: No. | Checkpoint | Comment | OK | NOK | N/A | Resp. Its title and the
 * column labels are the table head, which repeats on every page the section runs onto.
 */
export function ChecklistTable({ section, fallbackFooter }: Props) {
  const titleId = useId();
  return (
    <table className="paper-table" data-section-ref={section.number} aria-labelledby={titleId}>
      <colgroup>
        <col className="paper-col-ref" />
        <col />
        <col className="paper-col-comment" />
        {STATUSES.map((status) => (
          <col key={status} className="paper-col-mark" />
        ))}
        <col className="paper-col-resp" />
      </colgroup>
      <thead>
        <tr className="paper-section-title">
          <th id={titleId} colSpan={7} scope="colgroup">
            <span className="paper-section-number">{section.number}</span>
            {section.title}
          </th>
        </tr>
        <tr className="paper-columns">
          <th scope="col">No.</th>
          <th scope="col">Checkpoint</th>
          <th scope="col">Comment</th>
          {STATUSES.map((status) => (
            <th key={status} scope="col" className="paper-mark-cell">
              {STATUS_LABELS[status]}
            </th>
          ))}
          <th scope="col">Resp</th>
        </tr>
      </thead>
      {fallbackFooter && (
        <tfoot className="paper-fallback-footer">
          <tr>
            <td colSpan={7}>{fallbackFooter}</td>
          </tr>
        </tfoot>
      )}
      <tbody>
        {section.rows.length === 0 ? (
          <tr>
            <td colSpan={7} className="paper-empty">
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

function Row({ row }: { row: PrintRow }) {
  return (
    <tr data-row-ref={row.ref} data-spare={row.spare || undefined}>
      <td className="paper-ref">{row.ref}</td>
      <td>{row.text}</td>
      <td>
        {row.severity && (
          <span className="paper-severity">Severity: {SEVERITY_LABELS[row.severity]}</span>
        )}
        {row.comment}
      </td>
      {STATUSES.map((status) => (
        <td key={status} className="paper-mark-cell">
          <StatusCell row={row} status={status} />
        </td>
      ))}
      <td>{row.resp}</td>
    </tr>
  );
}

/**
 * An empty box to tick while nothing is recorded; in the recorded status's column its mark (✓ ✗ –,
 * as on the screen) over its name: readable in black and white (brief §6).
 */
function StatusCell({ row, status }: { row: PrintRow; status: Status }) {
  if (row.status === null) return <span className="paper-box" aria-hidden="true" />;
  if (row.status !== status) return null;
  const Mark = STATUS_ICONS[status];
  return (
    <span className="paper-mark">
      <Mark strokeWidth={3} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
