import type { PublishIssue, Section } from '@modig/shared';
import { useMemo, type JSX } from 'react';
import { QualityChecklistView } from '../../qualityChecks/QualityChecklistView';
import { EditableDocument } from './EditableDocument';
import type { DocumentVariant } from './EditableSection';
import { indexIssues } from './issues';
import { SHEET } from './layout';
import { ReadOnlyDocument } from './ReadOnlyDocument';

export type TemplateDocumentProps = {
  sections: Section[];
  /** Omit for read-only rendering (inspectors, published revisions). */
  onChange?: (sections: Section[]) => void;
  /** Publish problems to highlight (red outline + message) on the matching section/row. */
  issues?: PublishIssue[];
  /**
   * Editable only: the open guide editor holds changes that aren't in `sections` yet, so the page's
   * leave guard can ask before they are lost.
   */
  onEditorDirtyChange?: (dirty: boolean) => void;
  /** A final inspection's checklist (the default), or a quality check's rows as cards. */
  variant?: DocumentVariant;
};

/**
 * The checklist as one sheet that looks like the printed document (brief §5.2), edited in place.
 * A row's guide opens from its guide icon: in the guide editor when editable, else in the viewer.
 *
 * DOM hooks for the page: each section root has `id="section-{sectionId}"` and (when editable)
 * its title input `data-section-title={sectionId}`; each row root has `id="row-{itemId}"` and its
 * text input `data-item-text={itemId}`.
 */
export function TemplateDocument({
  sections,
  onChange,
  issues,
  onEditorDirtyChange,
  variant = 'final',
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
            issues={issueIndex}
            onEditorDirtyChange={onEditorDirtyChange}
            variant={variant}
          />
        ) : variant === 'quality' ? (
          <QualityChecklistView sections={sections} issues={issueIndex} />
        ) : (
          <ReadOnlyDocument sections={sections} issues={issueIndex} />
        )}
      </div>
    </div>
  );
}
