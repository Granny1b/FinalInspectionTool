import { useId } from 'react';
import type { QualityFrontPage as QualityFrontPageModel } from './model';

type Props = {
  front: QualityFrontPageModel;
  logoUrl: string;
};

/** Signed by hand on the printout kept at the machine: the check, then its deviations' close-out. */
const SIGN_OFF = [
  ['Checked by', 'Signature', 'Date'],
  ['Deviations closed / approved by', 'Signature', 'Date'],
] as const;

/**
 * Page 1 of a quality check's report: logo and number, the check's title, whether it is
 * finalised, the machine and the check done on it, the result in numbers, and the sign-off lines
 * and the revision at the foot of the page, as a final report's front page has its signatures and
 * revision there.
 */
export function QualityFrontPage({ front, logoUrl }: Props) {
  const titleId = useId();
  const summaryId = useId();
  const signId = useId();

  return (
    <section className="paper-sheet" aria-labelledby={titleId}>
      <div className="paper-front paper-qc-front">
        <div className="paper-front-head">
          <img className="paper-logo" src={logoUrl} alt={front.companyName} />
          <p className="paper-front-number">{front.number}</p>
        </div>
        <h2 id={titleId} className="paper-title">
          {front.title}
        </h2>
        <p className="paper-company">{front.companyName}</p>
        <div className="paper-state">
          <p className={front.state.finalised ? 'paper-state-text' : 'paper-state-draft'}>
            {front.state.text}
          </p>
        </div>

        <dl className="paper-fields">
          {front.fields.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* A space keeps an empty field's line (and its baseline) for writing on. */}
              <dd>{value || ' '}</dd>
            </div>
          ))}
        </dl>

        <section className="paper-qc-summary" aria-labelledby={summaryId}>
          <div className="paper-qc-summary-head">
            <h3 id={summaryId}>Summary</h3>
            <p>{front.size}</p>
          </div>
          {/* The number over its word; in the markup the word comes first, as a list wants it. */}
          <dl className="paper-qc-counts">
            {front.counts.map(({ label, value }) => (
              <div key={label} data-count={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Whatever height the rest leaves, so the sign-off sits at the foot of the page. */}
        <div className="paper-qc-spacer" aria-hidden="true" />

        <section className="paper-front-sign paper-qc-sign" aria-labelledby={signId}>
          <h3 id={signId}>Sign-off</h3>
          {SIGN_OFF.map((labels) => (
            <div key={labels[0]} className="paper-qc-sign-row">
              {labels.map((label) => (
                <div key={label} className="paper-signature">
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="paper-revision">{front.revision}</p>
        </section>
      </div>
    </section>
  );
}
