import type { PublishIssue, Section } from '@modig/shared';
import { useMemo, type JSX } from 'react';
import { EditableDocument } from './EditableDocument';
import { indexIssues } from './issues';
import { SHEET } from './layout';
import { ReadOnlyDocument } from './ReadOnlyDocument';

export type TemplateDocumentProps = {
  sections: Section[];
  /** Omit for read-only rendering (inspectors, published revisions). */
  onChange?: (sections: Section[]) => void;
  /** Print setting: empty lettered spare rows previewed at the end of each section. */
  spareRowsPerSection: number;
  /** Publish problems to highlight (red outline + message) on the matching section/row. */
  issues?: PublishIssue[];
};

/**
 * The checklist as one sheet that looks like the printed document (brief §5.2), edited in place.
 *
 * DOM hooks for the page: each section root has `id="section-{sectionId}"` and (when editable)
 * its title input `data-section-title={sectionId}`; each row root has `id="row-{itemId}"` and its
 * text input `data-item-text={itemId}`.
 */
export function TemplateDocument({
  sections,
  onChange,
  spareRowsPerSection,
  issues,
}: TemplateDocumentProps): JSX.Element {
  const issueIndex = useMemo(() => indexIssues(issues ?? []), [issues]);
  return (
    // The sheet adapts to its own width (container queries), not the viewport's.
    <div className="@container">
      <div className={SHEET}>
        {onChange ? (
          <EditableDocument
            sections={sections}
            onChange={onChange}
            spareRowsPerSection={spareRowsPerSection}
            issues={issueIndex}
          />
        ) : (
          <ReadOnlyDocument
            sections={sections}
            spareRowsPerSection={spareRowsPerSection}
            issues={issueIndex}
          />
        )}
      </div>
    </div>
  );
}
