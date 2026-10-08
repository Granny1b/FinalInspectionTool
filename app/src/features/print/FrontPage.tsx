import { useId, useState } from 'react';
import type { FrontPage as FrontPageModel } from './model';

type Props = {
  front: FrontPageModel;
  logoUrl: string;
  /** Null when the photo's address couldn't be fetched (`front.photoId` is set but unreachable). */
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
  // The address that failed to load: a fresh one (read URLs expire) is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
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
        {front.photoId && photoUrl && photoUrl !== failedUrl ? (
          <div className="paper-photo">
            <img src={photoUrl} alt="Machine photo" onError={() => setFailedUrl(photoUrl)} />
          </div>
        ) : (
          <div className="paper-photo paper-photo-missing">
            {front.photoId ? 'The machine photo couldn’t be loaded.' : 'No machine photo'}
          </div>
        )}

        <dl className="paper-fields">
          {front.fields.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              {/* A space keeps an empty field's line (and its baseline) for writing on. */}
              <dd>{value || '\u00a0'}</dd>
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
