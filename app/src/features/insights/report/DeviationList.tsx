import { SEVERITY_LABELS } from '@modig/shared';
import { useId } from 'react';
import { PRINTS_MARGIN_BOXES } from '../../print/usePageFooter';
import { plural } from '../format';
import type { ListGroup, Report } from './model';

type Props = {
  list: NonNullable<Report['list']>;
  /** The page footer's text, repeated at the foot of each page where margin boxes don't print. */
  footer: string;
};

const COLUMNS = 5;

/** "Volvo Skövde #3 · S/N RM-2026-012"; the machine's name only when it says more than the model. */
function machine({ machine, model, serialNumber }: ListGroup): string {
  const name = machine.toLowerCase() === model.toLowerCase() ? '' : machine;
  return [name, serialNumber && `S/N ${serialNumber}`].filter(Boolean).join(' · ');
}

/**
 * "Include deviation list": the rows behind the numbers, on pages of their own after the report.
 * Each inspection's deviations under a line naming it (number, date, model, machine), in the
 * order of the CSV export: oldest inspection first, checklist order, extra deviations last.
 */
export function DeviationList({ list, footer }: Props) {
  const titleId = useId();
  // Margin boxes print the footer in Chromium; elsewhere the table repeats it at its foot.
  const fallbackFooter = PRINTS_MARGIN_BOXES ? null : footer;
  return (
    <section className="paper-sheet" aria-labelledby={titleId} data-report-list="">
      <div className="paper-heading report-list-heading">
        <h2 id={titleId}>Deviation list</h2>
        <p>
          {plural(list.count, 'deviation')} in {plural(list.groups.length, 'inspection')}
        </p>
      </div>
      {list.count === 0 ? (
        <p className="report-none">No deviations in this selection.</p>
      ) : (
        <table className="report-table report-list">
          <colgroup>
            <col className="report-col-ref" />
            <col />
            <col className="report-col-severity" />
            <col className="report-col-category" />
            <col className="report-col-resp" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Checkpoint and comment</th>
              <th scope="col">Severity</th>
              <th scope="col">Category</th>
              <th scope="col">Responsible</th>
            </tr>
          </thead>
          {fallbackFooter && (
            <tfoot className="paper-fallback-footer">
              <tr>
                <td colSpan={COLUMNS}>{fallbackFooter}</td>
              </tr>
            </tfoot>
          )}
          {list.groups.map((group) => (
            <tbody key={group.key} data-inspection={group.number}>
              <tr className="report-group">
                <th colSpan={COLUMNS} scope="colgroup">
                  <div className="report-group-line">
                    <span>
                      <span className="report-group-number">{group.number}</span>
                      {` · ${group.date} · ${group.model}`}
                      {!group.finalised && <span className="report-state">In progress</span>}
                    </span>
                    <span className="report-group-machine">{machine(group)}</span>
                  </div>
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key}>
                  <td className="report-ref">{row.ref}</td>
                  <td>
                    {row.text}
                    {row.extra && <span className="report-sub">Not on the checklist</span>}
                    {row.comment && <span className="report-comment">{row.comment}</span>}
                  </td>
                  <td className="report-severity" data-severity={row.severity}>
                    {SEVERITY_LABELS[row.severity]}
                  </td>
                  <td>{row.category || '—'}</td>
                  <td>{row.resp || '—'}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}
