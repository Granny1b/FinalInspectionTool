import { useId } from 'react';
import type { FrontPage as FrontPageModel } from './model';
import { PaperPhoto } from './PaperPhoto';

type Props = {
  front: FrontPageModel;
  logoUrl: string;
  /** Null when there is no photo or its address couldn't be fetched. */
  photoUrl: string | null;
};

const SIGNATURES = ['Inspected by', 'Date', 'Signature'] as const;

/**
 * Page 1 (brief §6): logo, title, company, machine photo, the data grid, signature lines and the
 * template revision bottom right, like the workbook's front page. A report also says whether it
 * is finalised and sums up the result.
 */
export function FrontPage({ front, logoUrl, photoUrl }: Props) {
  const titleId = useId();
  const { report } = front;

  return (
    <section className="paper-sheet" aria-labelledby={titleId}>
      <div className="paper-front">
        <div className="paper-front-head">
          <img className="paper-logo" src={logoUrl} alt={front.companyName} />
          {front.number && <p className="paper-front-number">{front.number}</p>}
        </div>
        <h2 id={titleId} className="paper-title">
          Final Inspection
        </h2>
        <p className="paper-company">{front.companyName}</p>
        {report && (
          <div className="paper-state">
            <p className={report.finalised ? 'paper-state-text' : 'paper-state-draft'}>
              {report.text}
            </p>
            <p className="paper-state-summary">{report.summary}</p>
          </div>
        )}

        {/* Without a photo its frame stays, so every front page has the same layout. */}
        <div className="paper-photo">
          <PaperPhoto
            url={front.photoId ? photoUrl : null}
            alt="Machine photo"
            missing={
              <div className="paper-photo-missing">
                {front.photoId ? 'The machine photo couldn’t be loaded.' : 'No machine photo'}
              </div>
            }
          />
        </div>

        <dl className="paper-fields">
          {front.fields.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* A space keeps an empty field's line (and its baseline) for writing on. */}
              <dd>{value || ' '}</dd>
            </div>
          ))}
        </dl>

        <div className="paper-signatures">
          {SIGNATURES.map((label) => (
            <div key={label} className="paper-signature">
              <span>{label}</span>
            </div>
          ))}
        </div>
        <p className="paper-revision">{front.revision}</p>
      </div>
    </section>
  );
}
