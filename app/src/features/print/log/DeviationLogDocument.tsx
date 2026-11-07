import { SEVERITY_LABELS } from '@modig/shared';
import { Check } from 'lucide-react';
import { useId, type Ref } from 'react';
import { DeviationCards } from '../DeviationCards';
import type { DeviationCard, DeviationsPerPage } from '../model';
import type { CardPages } from '../useCardPages';
import { PRINTS_MARGIN_BOXES } from '../usePageFooter';
import type { PrintImages } from '../usePrintImages';
import '../quality/quality-print.css';
import './log-print.css';
import type { DeviationLogPrintModel, LogPrintGroup, LogPrintRow } from './model';

type Props = {
  model: DeviationLogPrintModel;
  images: PrintImages;
  deviationsPerPage: DeviationsPerPage;
  /** The cards on pages, once measured (the layout with pictures). */
  cardPages: CardPages;
  /** Data, images and fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * The deviation log on paper, for the machine: a header with what is printed, then the deviations
 * machine by machine, as a checklist (a line each, a box to tick and room to sign) or as cards
 * with their photos (laid out as a quality check's report lays out its cards), then one sign-off
 * for all of them while some are open. The attributes on the root are what tests and autoprint
 * wait for.
 */
export function DeviationLogDocument({
  model,
  images,
  deviationsPerPage,
  cardPages,
  ready,
  rootRef,
}: Props) {
  // Margin boxes print the footer in Chromium; elsewhere each table repeats it at its foot.
  const fallbackFooter = PRINTS_MARGIN_BOXES ? null : model.footer;
  const lead = <LogHeader model={model} logoUrl={images.logoUrl} />;
  const closing = model.open > 0 ? <AllClosed /> : undefined;

  return (
    <div
      ref={rootRef}
      className="paper"
      data-print-root=""
      data-print-document="deviation-log"
      data-print-mode={model.mode}
      data-print-ready={ready ? 'true' : 'false'}
    >
      {model.deviations.kind === 'cards' ? (
        <DeviationCards
          cards={model.deviations.cards}
          cardPages={cardPages}
          perPage={deviationsPerPage}
          subject={model.subject}
          imageUrls={images.urls}
          // The header above says which deviations; each page of cards is headed as a report's.
          title="Deviations"
          signOff="action"
          lead={lead}
          closing={closing}
          rangeOf={cardRange(model.deviations.cards)}
        />
      ) : (
        <section className="paper-sheet" data-log-list="">
          {lead}
          {model.groups.length === 0 ? (
            <p className="paper-empty">No deviations under these filters.</p>
          ) : (
            model.groups.map((group) => (
              <GroupTable key={group.key} group={group} fallbackFooter={fallbackFooter} />
            ))
          )}
          {closing && <div className="paper-log-closing">{closing}</div>}
        </section>
      )}
    </div>
  );
}

/** "3–4 of 12": a page's cards among all of them (their IDs are long for a heading). */
function cardRange(cards: readonly DeviationCard[]) {
  return (page: DeviationCard[]) => {
    const first = cards.indexOf(page[0]!) + 1;
    const last = first + page.length - 1;
    return `${first === last ? first : `${first}–${last}`} of ${cards.length}`;
  };
}

/** The first page's header: logo, title, what is printed and how many. */
function LogHeader({ model, logoUrl }: { model: DeviationLogPrintModel; logoUrl: string }) {
  const { header } = model;
  return (
    <header className="paper-qc-lead">
      <div className="paper-qc-lead-head">
        <img className="paper-qc-lead-logo" src={logoUrl} alt={header.companyName} />
        <p className="paper-front-number">{header.summary}</p>
      </div>
      <p className="paper-qc-lead-title">{header.title}</p>
      <dl className="paper-qc-facts">
        {header.facts.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/**
 * One machine's deviations: Done | Deviation | Responsible | Category | Action taken. Its
 * machine and the column labels are the table head, repeated on every page it runs onto; a row
 * is never split (print.css).
 */
function GroupTable({
  group,
  fallbackFooter,
}: {
  group: LogPrintGroup;
  fallbackFooter: string | null;
}) {
  const titleId = useId();
  return (
    <table className="paper-table paper-log-table" aria-labelledby={titleId}>
      <colgroup>
        <col className="paper-log-col-done" />
        <col />
        <col className="paper-log-col-resp" />
        <col className="paper-log-col-category" />
        <col className="paper-log-col-action" />
      </colgroup>
      <thead>
        <tr className="paper-section-title">
          <th id={titleId} colSpan={5} scope="colgroup">
            {/* First, floated right: the machine then wraps clear of it. */}
            <span className="paper-qc-section-stats">{group.counts}</span>
            {group.machineName || 'No Machine ID'}
            <span className="paper-log-machine">
              {[group.serialNumber && `S/N ${group.serialNumber}`, group.modelLabel]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {group.inspections.length > 0 && (
              <span className="paper-log-inspections">{group.inspections.join(' · ')}</span>
            )}
          </th>
        </tr>
        <tr className="paper-columns">
          <th scope="col" className="paper-mark-cell">
            Done
          </th>
          <th scope="col">Deviation</th>
          <th scope="col">Responsible</th>
          <th scope="col">Category</th>
          <th scope="col">Action taken · Sign · Date</th>
        </tr>
      </thead>
      {fallbackFooter && (
        <tfoot className="paper-fallback-footer">
          <tr>
            <td colSpan={5}>{fallbackFooter}</td>
          </tr>
        </tfoot>
      )}
      <tbody>
        {group.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ row }: { row: LogPrintRow }) {
  const where = [row.check, row.ref ? row.sectionTitle : 'Not on the checklist']
    .filter(Boolean)
    .join(' · ');
  return (
    <tr data-log-row={row.id} data-status={row.closed ? 'closed' : 'open'}>
      <td className="paper-mark-cell">
        {row.closed ? (
          <span className="paper-log-done" aria-label="Closed">
            <Check strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <span className="paper-box" aria-hidden="true" />
        )}
      </td>
      <td>
        {/* "QC-2026-0003 · D-01  MINOR": the severity in words, never by colour alone. */}
        <p className="paper-log-id">
          <span>{row.id}</span>
          <span className="paper-card-severity" data-severity={row.severity}>
            {SEVERITY_LABELS[row.severity]}
          </span>
        </p>
        {where && <p className="paper-log-where">{where}</p>}
        <p className="paper-log-text">
          {row.ref && <span className="paper-ref">{row.ref} </span>}
          {row.text}
        </p>
        {row.comment && <p className="paper-log-comment">{row.comment}</p>}
      </td>
      <td>{row.resp || '—'}</td>
      <td>{row.category || '—'}</td>
      <td>
        {row.closed ? (
          <div className="paper-log-closed">
            <p>
              <strong>Closed {row.closed.closedOn}</strong>
              {row.closed.closedBy && ` · ${row.closed.closedBy}`}
            </p>
            {row.closed.action && <p>{row.closed.action}</p>}
          </div>
        ) : (
          // Lines to write on at the machine.
          <div className="paper-log-lines" aria-hidden="true">
            <span />
            <span />
          </div>
        )}
      </td>
    </tr>
  );
}

const ALL_CLOSED = ['Name', 'Signature', 'Date'] as const;

/** After the last deviation: signed once every deviation above is closed. */
function AllClosed() {
  return (
    <div className="paper-qc-closing">
      <p className="paper-qc-closing-title">All deviations above closed</p>
      <div className="paper-qc-sign-row">
        {ALL_CLOSED.map((label) => (
          <div key={label} className="paper-signature">
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
