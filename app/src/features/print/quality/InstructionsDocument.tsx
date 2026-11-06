import { QUALITY_VERDICT_LABELS } from '@modig/shared';
import { Fragment, useId, type ReactElement, type ReactNode, type Ref } from 'react';
import type { AppendixImage } from '../appendix';
import { GuideImage } from '../ReferenceAppendix';
import { PRINTS_MARGIN_BOXES } from '../usePageFooter';
import type { PrintImages } from '../usePrintImages';
import type { InstructionRow, InstructionsCover, InstructionsModel } from './instructions';
import './quality-print.css';

type Props = {
  model: InstructionsModel;
  images: PrintImages;
  /** Data, images and fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * A quality check's instructions, a manual for the operator: the cover, then each section with
 * its rows as the app shows them, pictures included, on the reports' paper. The attributes on the
 * root are what tests and autoprint wait for.
 *
 * The text is laid out as blocks that never split: a section's title with the start of its first
 * row, each row's text with its first pictures, and each further pair of pictures. Browsers
 * without margin boxes get the blocks as the rows of a table whose footer repeats on every page,
 * as the reference appendix does, so every page still names the check.
 */
export function InstructionsDocument({ model, images, ready, rootRef }: Props) {
  const headingId = useId();
  const fallbackFooter = PRINTS_MARGIN_BOXES ? null : model.footer;
  const blocks = model.sections.flatMap((section): ReactElement[] => {
    const title = (
      <h3 className="paper-qi-section-title" data-section-ref={section.number}>
        <span className="paper-qc-section-stats">{section.stats}</span>
        <span className="paper-section-number">{section.number}</span>
        {section.title || 'Untitled section'}
      </h3>
    );
    if (section.rows.length === 0) {
      return [
        <div key={section.number} className="paper-qi-start">
          {title}
          <p className="paper-empty">No checkpoints in this section.</p>
        </div>,
      ];
    }
    return section.rows.flatMap((row, index) =>
      rowBlocks(row, images.urls, index === 0 ? title : null),
    );
  });

  return (
    <div
      ref={rootRef}
      className="paper"
      data-print-root=""
      data-print-document="instructions"
      data-print-mode="instructions"
      data-print-ready={ready ? 'true' : 'false'}
    >
      <Cover cover={model.cover} logoUrl={images.logoUrl} />
      <section className="paper-sheet" aria-labelledby={headingId}>
        <div className="paper-heading">
          <h2 id={headingId}>Instructions</h2>
          <p>{model.checklistTitle}</p>
        </div>
        {blocks.length === 0 ? (
          <p className="paper-empty">This quality check has no sections.</p>
        ) : fallbackFooter ? (
          <table className="paper-appendix-flow paper-qi-flow">
            <tbody>
              {blocks.map((block, index) => (
                <tr key={index}>
                  <td>{block}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="paper-fallback-footer">
              <tr>
                <td>{fallbackFooter}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          blocks
        )}
      </section>
    </div>
  );
}

/**
 * A row as blocks that never split: its text with its first pictures (and the section's title
 * before it, for the section's first row), then each further pair of pictures.
 */
function rowBlocks(
  row: InstructionRow,
  urls: ReadonlyMap<string, string>,
  sectionTitle: ReactNode,
): ReactElement[] {
  const [first, ...rest] = row.pictures;
  const pictures = (pair: AppendixImage[]) => (
    <div className="paper-guide-row">
      {pair.map((image, slot) => (
        <GuideImage
          key={slot}
          image={image}
          url={urls.get(image.imageId) ?? null}
          labels={QUALITY_VERDICT_LABELS}
        />
      ))}
    </div>
  );
  return [
    <div key={row.ref} className="paper-qi-start" data-row-ref={row.ref}>
      {sectionTitle}
      <div className="paper-qi-row">
        <div className="paper-qi-row-head">
          <span className="paper-ref">{row.ref}</span>
          <p className="paper-qi-what">{row.what || 'No text yet'}</p>
          {row.time && <span className="paper-qi-time">{row.time}</span>}
        </div>
        {(row.how || row.references.length > 0 || row.information) && (
          <dl className="paper-qi-details">
            {row.how && <Detail label="How">{row.how}</Detail>}
            {row.references.length > 0 && (
              <Detail label="References">{row.references.join(' · ')}</Detail>
            )}
            {row.information && <Detail label="More information">{row.information}</Detail>}
          </dl>
        )}
        {first && pictures(first)}
      </div>
    </div>,
    ...rest.map((pair, index) => (
      <div key={`${row.ref}-${index}`} className="paper-qi-more" data-row-ref={row.ref}>
        {pictures(pair)}
      </div>
    )),
  ];
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Fragment>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </Fragment>
  );
}

/**
 * Page 1: logo, the check's title and "Instructions", whether it is a draft, what it is for
 * (model, department, revision, when published, size and time), and its sections as contents.
 */
function Cover({ cover, logoUrl }: { cover: InstructionsCover; logoUrl: string }) {
  const titleId = useId();
  const contentsId = useId();
  return (
    <section className="paper-sheet" aria-labelledby={titleId}>
      <div className="paper-front paper-qc-front">
        <div className="paper-front-head">
          <img className="paper-logo" src={logoUrl} alt={cover.companyName} />
          <p className="paper-front-number">Instructions</p>
        </div>
        <h2 id={titleId} className="paper-title">
          {cover.title}
        </h2>
        <p className="paper-company">{cover.companyName}</p>
        {cover.draft && (
          <div className="paper-state">
            <p className="paper-state-draft">DRAFT – NOT PUBLISHED</p>
          </div>
        )}
        <dl className="paper-fields">
          {cover.fields.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || ' '}</dd>
            </div>
          ))}
        </dl>
        {cover.contents.length > 0 && (
          <section className="paper-qi-contents" aria-labelledby={contentsId}>
            <h3 id={contentsId}>Contents</h3>
            <ol>
              {cover.contents.map((section) => (
                <li key={section.number}>
                  <span className="paper-section-number">{section.number}</span>
                  <span className="paper-qi-contents-title">
                    {section.title || 'Untitled section'}
                  </span>
                  <span className="paper-qi-contents-stats">{section.stats}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </section>
  );
}
