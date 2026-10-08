import type { FinaliseIssue, RowResult, Section } from '@modig/shared';
import { useId, useMemo, useRef, useState, type JSX } from 'react';
import { ChecklistSection } from './ChecklistSection';
import { SHEET } from './layout';
import { ReadOnlyChecklist } from './ReadOnlyChecklist';
import { useChecklistActions } from './useChecklistActions';

export { ShortcutHints } from './ShortcutHints';

export type ChecklistSheetProps = {
  sections: Section[];
  results: Record<string, RowResult>;
  /** Omit for read-only (finalised inspections). */
  onChange?: (results: Record<string, RowResult>) => void;
  /** Resp autocomplete values (history + this inspection). */
  respSuggestions?: string[];
  /** Finalise problems to highlight (rows without a status). */
  issues?: FinaliseIssue[];
  /** A NOK row's photo count was clicked: show that deviation's photos. */
  onShowPhotos: (itemId: string) => void;
};

/**
 * The inspection's checklist, filled in from the keyboard (brief §5.3): the same sheet as the
 * print, with a status, comment and resp per row.
 *
 * DOM hooks for the page: each section root has `id="section-{sectionId}"`; each row root has
 * `id="row-{itemId}"` and is focusable (in the Tab order when editable); its comment field has
 * `data-comment={itemId}` and its resp field `data-resp={itemId}`. Moving the focus scrolls by
 * the smallest amount; the page keeps rows clear of a sticky header with `scroll-padding-top`
 * on its scroller.
 */
export function ChecklistSheet({
  sections,
  results,
  onChange,
  respSuggestions,
  issues,
  onShowPhotos,
}: ChecklistSheetProps): JSX.Element {
  // A primitive per row, so rows stay memoised when the page recomputes the issues on each change.
  const rowIssues = useMemo(() => {
    const byRow = new Map<string, string>();
    for (const { target, message } of issues ?? []) {
      if (target.kind !== 'row') continue;
      const previous = byRow.get(target.itemId);
      byRow.set(target.itemId, previous ? `${previous} ${message}` : message);
    }
    return byRow;
  }, [issues]);
  const [announcement, setAnnouncement] = useState('');

  return (
    // The sheet adapts to its own width (container queries), not the viewport's.
    <div className="@container">
      <div className={SHEET}>
        {sections.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-500">This checklist has no rows.</p>
        ) : onChange ? (
          <EditableChecklist
            sections={sections}
            results={results}
            onChange={onChange}
            respSuggestions={respSuggestions}
            rowIssues={rowIssues}
            announce={setAnnouncement}
            onShowPhotos={onShowPhotos}
          />
        ) : (
          <ReadOnlyChecklist
            sections={sections}
            results={results}
            rowIssues={rowIssues}
            announce={setAnnouncement}
            onShowPhotos={onShowPhotos}
          />
        )}
      </div>
      {/* Status changes are read out ("3.c NOK"): the focus has usually moved on already. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type EditableProps = {
  sections: Section[];
  results: Record<string, RowResult>;
  onChange: (results: Record<string, RowResult>) => void;
  respSuggestions: string[] | undefined;
  rowIssues: ReadonlyMap<string, string>;
  announce: (message: string) => void;
  onShowPhotos: (itemId: string) => void;
};

function EditableChecklist({
  sections,
  results,
  onChange,
  respSuggestions,
  rowIssues,
  announce,
  onShowPhotos,
}: EditableProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const respListId = useId();
  const actions = useChecklistActions({
    sections,
    results,
    onChange,
    rootRef,
    announce,
    onShowPhotos,
  });
  const suggestions = useMemo(() => [...new Set(respSuggestions)], [respSuggestions]);

  return (
    <div ref={rootRef}>
      {sections.map((section, index) => (
        <ChecklistSection
          key={section.id}
          section={section}
          index={index}
          results={results}
          rowIssues={rowIssues}
          respListId={respListId}
          actions={actions}
        />
      ))}
      {/* One list for every resp field. */}
      <datalist id={respListId}>
        {suggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </div>
  );
}
