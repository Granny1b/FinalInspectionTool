import { formatCount, formatDecimal, formatPercent } from '../format';
import type { ModelRow, ShareRow, TopRow } from './model';

/** A slim bar, as long as the row's count against the largest; none for a count of zero. */
function Bar({ length }: { length: number }) {
  return (
    <span
      className="report-bar"
      data-zero={length === 0 || undefined}
      style={{ width: `${length * 100}%` }}
    />
  );
}

/** "62%", or "–" when there is nothing to share. */
const share = (row: ShareRow, total: number) => (total ? formatPercent(row.share) : '–');

type ShareTableProps = {
  /** The first column's heading: "Section", "Responsible", … */
  label: string;
  rows: ShareRow[];
  /** Every deviation in the selection, which the shares are of. */
  total: number;
};

/** Ranked counts (severity, sections, responsible, categories): label, count, share, bar. */
export function ShareTable({ label, rows, total }: ShareTableProps) {
  return (
    <table className="report-table">
      <colgroup>
        <col />
        <col className="report-col-count" />
        <col className="report-col-share" />
        <col className="report-col-bar" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          <th scope="col" className="report-num">
            Deviations
          </th>
          <th scope="col" className="report-num">
            Share
          </th>
          <th scope="col">
            <span className="sr-only">Bar</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">
              {row.label}
              {row.note && <span className="report-note-inline">{row.note}</span>}
            </th>
            <td className="report-num">{formatCount(row.value)}</td>
            <td className="report-num">{share(row, total)}</td>
            <td className="report-bar-cell" aria-hidden="true">
              <Bar length={row.bar} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Per model: its inspections and deviations, deviations per machine and share (a half card). */
export function ModelTable({ rows, total }: { rows: ModelRow[]; total: number }) {
  return (
    <table className="report-table report-model">
      <colgroup>
        <col />
        <col className="report-col-count" />
        <col className="report-col-count" />
        <col className="report-col-count" />
        <col className="report-col-share" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">Model</th>
          <th scope="col" className="report-num">
            Inspections
          </th>
          <th scope="col" className="report-num">
            Deviations
          </th>
          <th scope="col" className="report-num">
            Per machine
          </th>
          <th scope="col" className="report-num">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <td className="report-num">{formatCount(row.inspections)}</td>
            <td className="report-num">{formatCount(row.value)}</td>
            <td className="report-num">
              {row.perInspection === null ? '–' : formatDecimal(row.perInspection)}
            </td>
            <td className="report-num">{share(row, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type TopTableProps = {
  rows: TopRow[];
  /** More than one model in the selection: refs repeat across models. */
  showModel: boolean;
};

/**
 * The checkpoints that fail most often: rank, ref, checkpoint (marked when it is no longer in the
 * checklist), section, model when there are several, how many inspections it failed in, and that
 * as a share of the inspections whose checklist had it.
 */
export function TopTable({ rows, showModel }: TopTableProps) {
  return (
    <table className="report-table">
      <colgroup>
        <col className="report-col-rank" />
        <col className="report-col-ref" />
        <col />
        <col className="report-col-section" />
        {showModel && <col className="report-col-model" />}
        <col className="report-col-count" />
        <col className="report-col-of" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Rank</span>
          </th>
          <th scope="col">Ref</th>
          <th scope="col">Checkpoint</th>
          <th scope="col">Section</th>
          {showModel && <th scope="col">Model</th>}
          <th scope="col" className="report-num">
            Failed
          </th>
          <th scope="col" className="report-num">
            Of inspections
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="report-num">{row.rank}</td>
            <td className="report-ref">{row.ref}</td>
            <th scope="row">
              {row.text || 'No text'}
              {row.removed && <span className="report-sub">No longer in the checklist</span>}
            </th>
            <td>{row.section}</td>
            {showModel && <td>{row.model}</td>}
            <td className="report-num">{formatCount(row.failed)}</td>
            <td className="report-num">
              {formatPercent(row.share)}{' '}
              <span className="report-muted">of {formatCount(row.inspections)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
