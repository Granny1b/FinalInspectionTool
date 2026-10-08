import { useId, type Ref } from 'react';
import { ChecklistTable } from './ChecklistTable';
import { DeviationTable } from './DeviationTable';
import { FrontPage } from './FrontPage';
import type { PrintModel } from './model';
import { PRINTS_MARGIN_BOXES } from './usePageFooter';

type Props = {
  model: PrintModel;
  logoUrl: string;
  photoUrl: string | null;
  /** Data, images and fonts are all in: printing now gives the finished document. */
  ready: boolean;
  rootRef: Ref<HTMLDivElement>;
};

/**
 * The document (brief §6): front page, checklist, Deviation Summary, each starting on a new page.
 * The attributes on the root are what tests and autoprint wait for.
 */
export function PrintDocument({ model, logoUrl, photoUrl, ready, rootRef }: Props) {
  const checklistId = useId();
  // Margin boxes print the footer in Chromium; elsewhere each table repeats it at its foot.
  const fallbackFooter = PRINTS_MARGIN_BOXES ? null : model.footer;

  return (
    <div
      ref={rootRef}
      className="paper"
      data-print-root=""
      data-print-mode={model.mode}
      data-print-ready={ready ? 'true' : 'false'}
    >
      <FrontPage front={model.front} logoUrl={logoUrl} photoUrl={photoUrl} />

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

      <DeviationTable
        mode={model.mode}
        lines={model.deviations}
        subject={model.front.number ?? model.checklistTitle}
        fallbackFooter={fallbackFooter}
      />

      {/* Extension point, phase 5: the "Include reference images" appendix (brief §6: each
          guide's annotated images, two per row, captioned with ref and Good/Bad) goes here, as
          one more sheet after the Deviation Summary. */}
    </div>
  );
}
