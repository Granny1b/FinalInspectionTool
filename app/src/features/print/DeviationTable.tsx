import { useId } from 'react';
import type { DeviationLine, PrintMode } from './model';

type Props = {
  mode: PrintMode;
  lines: DeviationLine[];
  /** Right of the heading: the inspection number, or the checklist for a template preview. */
  subject: string;
  /** The page footer as a repeating table footer, for browsers without margin boxes. */
  fallbackFooter: string | null;
};

/**
 * The Deviation Summary, on a page of its own (brief §6): No. | Ref | Description | Severity |
 * Resp | Closed (sign/date). Blank: numbered lines to fill in; report: what was found, with
 * "Closed" left empty for signing off later.
 */
export function DeviationTable({ mode, lines, subject, fallbackFooter }: Props) {
  const titleId = useId();
  return (
    <section className="paper-sheet" aria-labelledby={titleId}>
      <div className="paper-heading">
        <h2 id={titleId}>Deviation Summary</h2>
        <p>{subject}</p>
      </div>
      {mode === 'blank' && (
        <p className="paper-note">
          Every NOK row and every finding that isn’t on the checklist, numbered in order.
        </p>
      )}
      <table className="paper-table" data-deviation-summary="" aria-labelledby={titleId}>
        <colgroup>
          <col className="paper-col-number" />
          <col className="paper-col-ref" />
          <col />
          <col className="paper-col-severity" />
          <col className="paper-col-resp" />
          <col className="paper-col-closed" />
        </colgroup>
        <thead>
          <tr className="paper-columns">
            <th scope="col">No.</th>
            <th scope="col">Ref</th>
            <th scope="col">Description</th>
            <th scope="col">Severity</th>
            <th scope="col">Resp</th>
            <th scope="col">Closed (sign/date)</th>
          </tr>
        </thead>
        {fallbackFooter && (
          <tfoot className="paper-fallback-footer">
            <tr>
              <td colSpan={6}>{fallbackFooter}</td>
            </tr>
          </tfoot>
        )}
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={6} className="paper-empty">
                No deviations recorded.
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <tr key={line.number} data-deviation={line.number}>
                <td className="paper-ref">{line.number}</td>
                <td className="paper-ref">{line.ref}</td>
                <td>
                  {line.text}
                  {line.comment && <span className="paper-secondary">{line.comment}</span>}
                </td>
                <td>{line.severity}</td>
                <td>{line.resp}</td>
                <td />
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
