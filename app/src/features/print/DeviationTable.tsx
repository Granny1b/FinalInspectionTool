import { useId } from 'react';

type Props = {
  /** "D-01"… one line each. */
  numbers: string[];
  /** Right of the heading: the inspection number, or the checklist for a template preview. */
  subject: string;
  /** The page footer as a repeating table footer, for browsers without margin boxes. */
  fallbackFooter: string | null;
};

/**
 * The blank Deviation Summary, on a page of its own (brief §6): numbered lines with No. | Ref |
 * Description | Severity | Resp | Closed (sign/date), filled in by hand on the walk-round.
 */
export function DeviationTable({ numbers, subject, fallbackFooter }: Props) {
  const titleId = useId();
  return (
    <section className="paper-sheet" aria-labelledby={titleId}>
      <div className="paper-heading">
        <h2 id={titleId}>Deviation Summary</h2>
        <p>{subject}</p>
      </div>
      <p className="paper-note">
        Every NOK row and every finding that isn’t on the checklist, numbered in order.
      </p>
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
          {numbers.map((number) => (
            <tr key={number} data-deviation={number}>
              <td className="paper-ref">{number}</td>
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
