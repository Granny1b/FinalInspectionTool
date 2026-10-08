import { useId, type Ref } from 'react';
import { ChecklistTable } from './ChecklistTable';
import { DeviationCards } from './DeviationCards';
import { DeviationTable } from './DeviationTable';
import { FrontPage } from './FrontPage';
import type { DeviationsPerPage, PrintModel } from './model';
import type { useCardPages } from './useCardPages';
import { PRINTS_MARGIN_BOXES } from './usePageFooter';
import type { PrintImages } from './usePrintImages';

type Props = {
  model: PrintModel;
  images: PrintImages;
  deviationsPerPage: DeviationsPerPage;
  /** The report's deviation cards on pages, once measured. */
  cardPages: ReturnType<typeof useCardPages>;
  /** Data, images and fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * The document (brief §6): front page, checklist, deviations, each starting on a new page. The
 * attributes on the root are what tests and autoprint wait for.
 */
export function PrintDocument({
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
  const subject = model.front.number ?? model.checklistTitle;
  const { deviations } = model;

  return (
    <div
      ref={rootRef}
      className="paper"
      data-print-root=""
      data-print-mode={model.mode}
      data-print-ready={ready ? 'true' : 'false'}
    >
      <FrontPage
        front={model.front}
        logoUrl={images.logoUrl}
        photoUrl={model.front.photoId ? (images.urls.get(model.front.photoId) ?? null) : null}
      />

      <section className="paper-sheet" aria-labelledby={checklistId}>
        <div className="paper-heading">
          <h2 id={checklistId}>Checklist</h2>
          <p>{model.checklistTitle}</p>
        </div>
        {model.sections.length === 0 ? (
          <p className="paper-empty">This checklist has no sections yet.</p>
        ) : (
          model.sections.map((section) => (
            <ChecklistTable
              key={section.number}
              section={section}
              fallbackFooter={fallbackFooter}
            />
          ))
        )}
      </section>

      {deviations.kind === 'lines' ? (
        <DeviationTable
          numbers={deviations.numbers}
          subject={subject}
          fallbackFooter={fallbackFooter}
        />
      ) : (
        <DeviationCards
          cards={deviations.cards}
          pages={cardPages.pages}
          measureRef={cardPages.measureRef}
          perPage={deviationsPerPage}
          subject={subject}
          imageUrls={images.urls}
        />
      )}

      {/* Extension point, phase 5: the "Include reference images" appendix (brief §6: each
          guide's annotated images, two per row, captioned with ref and Good/Bad) goes here, as
          one more sheet after the deviations. */}
    </div>
  );
}
