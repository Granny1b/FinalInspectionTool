import { useId, type Ref } from 'react';
import { DeviationCards } from '../DeviationCards';
import type { DeviationsPerPage } from '../model';
import type { CardPages } from '../useCardPages';
import { PRINTS_MARGIN_BOXES } from '../usePageFooter';
import type { PrintImages } from '../usePrintImages';
import { QUALITY_DEVIATIONS_TITLE, type QualityPrintModel } from './model';
import { QualityChecklistTable } from './QualityChecklistTable';
import { QualityFrontPage } from './QualityFrontPage';
import './quality-print.css';

type Props = {
  model: QualityPrintModel;
  images: PrintImages;
  deviationsPerPage: DeviationsPerPage;
  /** The deviation cards on pages, once measured. */
  cardPages: CardPages;
  /** Data, images and fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * A quality check's report, on the final report's paper: the entire report (front page with the
 * sign-off, the checklist, the deviation cards), or only the deviations, under a short header and
 * with a sign-off for all of them at the end. Each card has room to note the action taken and
 * sign it off at the machine. The attributes on the root are what tests and autoprint wait for.
 */
export function QualityPrintDocument({
  model,
  images,
  deviationsPerPage,
  cardPages,
  ready,
  rootRef,
}: Props) {
  const checklistId = useId();
  // Margin boxes print the footer in Chromium; elsewhere each table repeats it at its foot.
  const fallbackFooter = PRINTS_MARGIN_BOXES ? null : model.footer;
  const report = model.mode === 'report';

  return (
    <div
      ref={rootRef}
      className="paper"
      data-print-root=""
      data-print-document="quality"
      data-print-mode={model.mode}
      data-print-ready={ready ? 'true' : 'false'}
    >
      {report && (
        <>
          <QualityFrontPage front={model.front} logoUrl={images.logoUrl} />
          <section className="paper-sheet" aria-labelledby={checklistId}>
            <div className="paper-heading">
              <h2 id={checklistId}>Checklist</h2>
              <p>{model.checklistTitle}</p>
            </div>
            {model.sections.length === 0 ? (
              <p className="paper-empty">This quality check has no sections.</p>
            ) : (
              model.sections.map((section) => (
                <QualityChecklistTable
                  key={section.number}
                  section={section}
                  fallbackFooter={fallbackFooter}
                />
              ))
            )}
          </section>
        </>
      )}

      <DeviationCards
        cards={model.deviations.cards}
        cardPages={cardPages}
        perPage={deviationsPerPage}
        subject={model.front.number}
        imageUrls={images.urls}
        title={QUALITY_DEVIATIONS_TITLE}
        signOff="action"
        lead={report ? undefined : <DeviationsHeader model={model} logoUrl={images.logoUrl} />}
        // Nothing to close when nothing was found.
        closing={report || model.deviations.cards.length === 0 ? undefined : <AllClosed />}
      />
    </div>
  );
}

/**
 * Only deviations: what the pages are about, on the first one: the check, its number, the
 * machine and the check done on it, and how many deviations there are.
 */
function DeviationsHeader({ model, logoUrl }: { model: QualityPrintModel; logoUrl: string }) {
  const { front } = model;
  return (
    <header className="paper-qc-lead">
      <div className="paper-qc-lead-head">
        <img className="paper-qc-lead-logo" src={logoUrl} alt={front.companyName} />
        <p className="paper-front-number">{front.number}</p>
      </div>
      <p className="paper-qc-lead-title">{front.title}</p>
      {!front.state.finalised && <p className="paper-state-draft">{front.state.text}</p>}
      <dl className="paper-qc-facts">
        {model.header.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

const ALL_CLOSED = ['Name', 'Signature', 'Date'] as const;

/** After the last card: signed once every deviation above is closed. */
function AllClosed() {
  return (
    <div className="paper-qc-closing">
      <p className="paper-qc-closing-title">All deviations closed</p>
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
