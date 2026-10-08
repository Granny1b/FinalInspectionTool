import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { rowRef, sectionNumber, type Section } from '@modig/shared';
import clsx from 'clsx';
import { GripVertical, ListChecks, Plus, Undo2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { guideRow } from '../../guides/guide';
import { GuideEditor } from '../../guides/GuideEditor';
import { sectionDndId } from './dnd';
import { EditableSection } from './EditableSection';
import type { IssueIndex } from './issues';
import { findRow, findSection } from './ops';
import { useDocumentActions, type Deleted } from './useDocumentActions';
import { useDocumentDnd, type DragState } from './useDocumentDnd';

type Props = {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  spareRowsPerSection: number;
  issues: IssueIndex;
  onEditorDirtyChange?: (dirty: boolean) => void;
};

export function EditableDocument({
  sections,
  onChange,
  spareRowsPerSection,
  issues,
  onEditorDirtyChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  // The row whose guide is open in the guide editor.
  const [guideItemId, setGuideItemId] = useState<string | null>(null);
  const actions = useDocumentActions({
    sections,
    onChange,
    rootRef,
    confirmDelete: setConfirmingDelete,
    onDeleted: setDeleted,
    onOpenGuide: setGuideItemId,
  });
  const { drag, shown, contextProps } = useDocumentDnd(sections, actions);

  const idsKey = shown.map((section) => section.id).join(' ');
  const sectionIds = useMemo(() => (idsKey ? idsKey.split(' ').map(sectionDndId) : []), [idsKey]);

  const deleting = confirmingDelete === null ? -1 : findSection(sections, confirmingDelete);
  const deletingSection = sections[deleting];
  const guiding = guideItemId === null ? null : guideRow(sections, guideItemId);

  return (
    <div ref={rootRef}>
      {shown.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <ListChecks size={22} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-base font-semibold text-ink-900">No sections yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-balance text-ink-500">
            Sections group the checkpoints, like “Loading area” or “Electrical cabinets”. Add the
            first one to start the checklist.
          </p>
          <Button data-add-section="" onClick={actions.addSection} className="mt-7">
            <Plus size={16} aria-hidden="true" />
            Add section
          </Button>
        </div>
      ) : (
        <>
          <DndContext {...contextProps}>
            <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
              {shown.map((section, index) => (
                <EditableSection
                  key={section.id}
                  section={section}
                  index={index}
                  sectionCount={shown.length}
                  spareRows={spareRowsPerSection}
                  issues={issues.sections.get(section.id)}
                  itemIssues={issues.items}
                  collapsed={drag?.kind === 'section' && drag.sectionId === section.id}
                  dragKind={drag?.kind ?? null}
                  actions={actions}
                />
              ))}
            </SortableContext>
            {/* In <body>, so no transformed ancestor of the page can offset the floating copy. A
                section unfolds as it lands, so it is not animated into place. */}
            {createPortal(
              <DragOverlay dropAnimation={drag?.kind === 'section' ? null : undefined}>
                {drag && <DragPreview drag={drag} sections={shown} />}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
          <button
            type="button"
            data-add-section=""
            onClick={actions.addSection}
            className="mt-10 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-ink-300 text-sm font-medium text-ink-600 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
          >
            <Plus size={16} aria-hidden="true" />
            Add section
          </button>
        </>
      )}

      {deletingSection && (
        <ConfirmDialog
          title={`Delete section ${sectionNumber(deleting)}?`}
          message={`“${deletingSection.title || 'Untitled section'}” and its ${
            deletingSection.items.length === 1 ? 'row' : `${deletingSection.items.length} rows`
          } will be removed from the draft. Published revisions are not affected.`}
          confirmLabel="Delete section"
          onConfirm={() => {
            setConfirmingDelete(null);
            actions.removeSection(deletingSection.id);
          }}
          onCancel={() => {
            setConfirmingDelete(null);
            actions.focusSectionMenu(deletingSection.id);
          }}
        />
      )}

      {guideItemId !== null && guiding && (
        <GuideEditor
          rowRef={guiding.ref}
          rowText={guiding.text}
          guide={guiding.guide}
          onSave={(guide) => {
            setGuideItemId(null);
            actions.setGuide(guideItemId, guide);
          }}
          onCancel={() => setGuideItemId(null)}
          onDirtyChange={onEditorDirtyChange}
        />
      )}

      <UndoBar
        deleted={deleted}
        onUndo={(last) => {
          setDeleted(null);
          actions.undoDelete(last);
        }}
        onDismiss={() => setDeleted(null)}
      />
    </div>
  );
}

type UndoBarProps = {
  deleted: Deleted | null;
  onUndo: (deleted: Deleted) => void;
  onDismiss: () => void;
};

/**
 * "Row 1.c deleted · Undo" at the bottom of the window until the next change to the structure;
 * not timed. The live region stays mounted so screen readers announce the message when it appears.
 */
function UndoBar({ deleted, onUndo, onDismiss }: UndoBarProps) {
  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      {deleted && (
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-200 bg-surface py-1.5 pr-1.5 pl-4 text-sm text-ink-900 shadow-lg">
          <span className="mr-2">{deleted.label} deleted.</span>
          <button
            type="button"
            onClick={() => onUndo(deleted)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-brand-700 transition-colors hover:bg-brand-50"
          >
            <Undo2 size={15} aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The floating card under the pointer while dragging. */
function DragPreview({ drag, sections }: { drag: DragState; sections: Section[] }) {
  const card =
    'flex gap-2 rounded-md border border-ink-200 px-2 py-2 text-sm text-ink-900 shadow-lg ring-1 ring-brand-500/30';
  if (drag.kind === 'row') {
    const at = findRow(sections, drag.itemId);
    const item = at && sections[at.sectionIndex]?.items[at.rowIndex];
    if (!at || !item) return null;
    return (
      <div className={clsx(card, 'items-start bg-surface')}>
        <GripVertical size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-400" />
        {/* The full ref: the row may be on its way into another section. */}
        <span className="w-8 shrink-0 text-ink-500 tabular-nums">
          {rowRef(at.sectionIndex, at.rowIndex)}
        </span>
        <span className="line-clamp-2 min-w-0 leading-5">{item.text || 'Empty row'}</span>
      </div>
    );
  }
  const index = findSection(sections, drag.sectionId);
  const section = sections[index];
  if (!section) return null;
  return (
    <div className={clsx(card, 'items-center bg-ink-50')}>
      <GripVertical size={16} aria-hidden="true" className="shrink-0 text-ink-400" />
      <span className="w-6 shrink-0 font-semibold tabular-nums">{sectionNumber(index)}</span>
      <span className="min-w-0 truncate font-semibold">{section.title || 'Untitled section'}</span>
      <span className="shrink-0 text-xs text-ink-500">
        {section.items.length === 1 ? '1 row' : `${section.items.length} rows`}
      </span>
    </div>
  );
}
