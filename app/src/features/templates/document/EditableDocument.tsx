import { DndContext, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { rowRef, sectionNumber, stepDepartments, stepRef, type Section } from '@modig/shared';
import clsx from 'clsx';
import { GripVertical, ListChecks, Plus, Undo2, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useSettings } from '../../../lib/useSettings';
import { DEPARTMENTS_LIST_ID } from '../../assembly/AssemblyRow';
import { ASSEMBLY_GUIDE_WORDING } from '../../assembly/wording';
import { guideRow } from '../../guides/guide';
import { GuideEditor } from '../../guides/GuideEditor';
import { FINAL_GUIDE_WORDING, QUALITY_GUIDE_WORDING } from '../../guides/wording';
import { sectionDndId } from './dnd';
import { EditableSection } from './EditableSection';
import { documentWords, type DocumentVariant } from './variant';
import type { IssueIndex } from './issues';
import { findRow, findSection, rowCountText } from './ops';
import { useDocumentActions, type Deleted } from './useDocumentActions';
import { useDocumentDnd, type DragState } from './useDocumentDnd';

type Props = {
  sections: Section[];
  onChange: (sections: Section[]) => void;
  issues: IssueIndex;
  onEditorDirtyChange?: (dirty: boolean) => void;
  variant: DocumentVariant;
  /** Rows with a result in a machine's check: deleting one (or its section) asks first. */
  protectedRows?: ReadonlySet<string> | undefined;
};

export function EditableDocument({
  sections,
  onChange,
  issues,
  onEditorDirtyChange,
  variant,
  protectedRows,
}: Props) {
  const quality = variant === 'quality';
  const assembly = variant === 'assembly';
  const words = documentWords(variant);
  const rootRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingRow, setConfirmingRow] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  // The row whose guide is open in the guide editor.
  const [guideItemId, setGuideItemId] = useState<string | null>(null);
  const actions = useDocumentActions({
    sections,
    onChange,
    rootRef,
    confirmDelete: setConfirmingDelete,
    protectedRows,
    confirmRowDelete: setConfirmingRow,
    onDeleted: setDeleted,
    onOpenGuide: setGuideItemId,
    assembly,
  });
  // An assembly instruction's tasks fold to their headers. A long one (the build of a whole
  // machine, hundreds of steps) opens folded, so the page draws only the tasks being worked on.
  const [foldedIds, setFoldedIds] = useState<ReadonlySet<string>>(() =>
    assembly && sections.reduce((count, section) => count + section.items.length, 0) > LONG
      ? new Set(sections.map((section) => section.id))
      : new Set(),
  );
  const toggleFold = useCallback(
    (sectionId: string) =>
      setFoldedIds((current) => {
        const next = new Set(current);
        if (!next.delete(sectionId)) next.add(sectionId);
        return next;
      }),
    [],
  );
  // A task with a publish problem in one of its steps is shown, so the problem can be gone to.
  const withIssues = useMemo(
    () =>
      new Set(
        sections
          .filter((section) => section.items.some((item) => issues.items.has(item.id)))
          .map((section) => section.id),
      ),
    [sections, issues],
  );
  const settings = useSettings();
  const departmentsKey = assembly
    ? [...new Set([...(settings.data?.responsibles ?? []), ...stepDepartments(sections)])].join(
        '\n',
      )
    : '';
  const { drag, shown, contextProps } = useDocumentDnd(sections, actions);
  // Offered only while it is gone: the editor's own Undo (Ctrl+Z) may have put it back already,
  // and putting it back twice would make two of it.
  const undoable = deleted && !isBack(sections, deleted) ? deleted : null;

  const idsKey = shown.map((section) => section.id).join(' ');
  const sectionIds = useMemo(() => (idsKey ? idsKey.split(' ').map(sectionDndId) : []), [idsKey]);

  const deleting = confirmingDelete === null ? -1 : findSection(sections, confirmingDelete);
  const deletingSection = sections[deleting];
  const rowAt = confirmingRow === null ? null : findRow(sections, confirmingRow);
  const guiding = guideItemId === null ? null : guideRow(sections, guideItemId);

  return (
    <div ref={rootRef}>
      {shown.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <ListChecks size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink-900">No {words.section}s yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-balance text-ink-500">
            {assembly
              ? 'Tasks group the steps of the build, like “Task 1” or “Mount the base”. Add the first one to start the instruction.'
              : quality
                ? 'Sections group the rows, like “Safety features” or “Markings”. Add the first one to start the quality check.'
                : 'Sections group the checkpoints, like “Loading area” or “Electrical cabinets”. Add the first one to start the checklist.'}
          </p>
          <Button data-add-section="" onClick={actions.addSection} className="mt-6">
            <Plus size={16} aria-hidden="true" />
            Add {words.section}
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
                  issues={issues.sections.get(section.id)}
                  itemIssues={issues.items}
                  collapsed={drag?.kind === 'section' && drag.sectionId === section.id}
                  dragKind={drag?.kind ?? null}
                  actions={actions}
                  variant={variant}
                  folded={assembly && foldedIds.has(section.id) && !withIssues.has(section.id)}
                  onToggleFold={assembly ? toggleFold : undefined}
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
            Add {words.section}
          </button>
        </>
      )}

      {deletingSection && (
        <ConfirmDialog
          title={`Delete ${words.section} ${sectionNumber(deleting)}?`}
          message={sectionDeleteMessage(deletingSection, protectedRows, assembly)}
          confirmLabel={`Delete ${words.section}`}
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

      {confirmingRow !== null && rowAt && (
        <ConfirmDialog
          title={`Delete row ${rowRef(rowAt.sectionIndex, rowAt.rowIndex)}?`}
          message="It has a result in this check (a status, comment, responsible or photo), which is deleted with it."
          confirmLabel="Delete row"
          onConfirm={() => {
            const itemId = confirmingRow;
            setConfirmingRow(null);
            actions.removeRow(itemId);
          }}
          onCancel={() => {
            const itemId = confirmingRow;
            setConfirmingRow(null);
            // Back to the row's text, where the delete was asked for.
            rootRef.current
              ?.querySelector<HTMLElement>(`[data-item-text="${CSS.escape(itemId)}"]`)
              ?.focus();
          }}
        />
      )}

      {guideItemId !== null && guiding && (
        <GuideEditor
          rowRef={assembly ? (stepRefOf(sections, guideItemId) ?? guiding.ref) : guiding.ref}
          rowText={guiding.text}
          guide={guiding.guide}
          onSave={(guide) => {
            setGuideItemId(null);
            actions.setGuide(guideItemId, guide);
          }}
          onCancel={() => setGuideItemId(null)}
          onDirtyChange={onEditorDirtyChange}
          wording={
            assembly
              ? ASSEMBLY_GUIDE_WORDING
              : quality
                ? QUALITY_GUIDE_WORDING
                : FINAL_GUIDE_WORDING
          }
        />
      )}

      {assembly && (
        <datalist id={DEPARTMENTS_LIST_ID}>
          {departmentsKey
            .split('\n')
            .filter(Boolean)
            .map((department) => (
              <option key={department} value={department} />
            ))}
        </datalist>
      )}

      <UndoBar
        deleted={undoable}
        onUndo={(last) => {
          setDeleted(null);
          actions.undoDelete(last);
        }}
        onDismiss={() => setDeleted(null)}
      />
    </div>
  );
}

/** From this many steps on, an assembly instruction opens with its tasks folded. */
const LONG = 40;

/** "3.12" for a step, by its id. */
function stepRefOf(sections: Section[], itemId: string): string | null {
  const at = findRow(sections, itemId);
  return at ? stepRef(at.sectionIndex, at.rowIndex) : null;
}

/** Whether a deleted row or section is in the checklist again. */
function isBack(sections: Section[], deleted: Deleted): boolean {
  return deleted.kind === 'row'
    ? findRow(sections, deleted.item.id) !== null
    : findSection(sections, deleted.section.id) >= 0;
}

/**
 * What deleting a section with rows removes: from a template's draft, or from a machine's own
 * checklist, where rows with a result lose it.
 */
function sectionDeleteMessage(
  section: Section,
  protectedRows: ReadonlySet<string> | undefined,
  assembly = false,
): string {
  const row = assembly ? 'step' : 'row';
  const what = `“${section.title || (assembly ? 'Untitled task' : 'Untitled section')}” and its ${
    section.items.length === 1 ? row : `${section.items.length} ${row}s`
  }`;
  if (!protectedRows) {
    return `${what} will be removed from the draft. Published revisions are not affected.`;
  }
  const withResults = section.items.filter((item) => protectedRows.has(item.id)).length;
  const results =
    withResults === 0
      ? ''
      : withResults === 1
        ? ' One row has a result, which is deleted with it.'
        : ` ${withResults} rows have a result, which are deleted with them.`;
  return `${what} will be removed from this machine’s checklist.${results} The template is not affected.`;
}

type UndoBarProps = {
  deleted: Deleted | null;
  onUndo: (deleted: Deleted) => void;
  onDismiss: () => void;
};

/**
 * "Row 1.c deleted · Undo" (or a section) at the bottom of the window until the next change to
 * the structure; not timed. The live region stays mounted so screen readers announce the message
 * when it appears.
 */
function UndoBar({ deleted, onUndo, onDismiss }: UndoBarProps) {
  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      {deleted && (
        // An overlay, like a menu: lifted off the cards it floats over, which in the dark theme
        // takes a lighter fill and border (a shadow doesn't show on near-black).
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-ink-200 bg-overlay py-1.5 pr-1.5 pl-4 text-sm text-ink-900 shadow-lg dark:border-ink-300">
          <span className="mr-2">{deleted.label} deleted.</span>
          <button
            type="button"
            onClick={() => onUndo(deleted)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:hover:bg-brand-100"
          >
            <Undo2 size={15} aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            // The overlay is ink-100 in the dark theme: one step up for the hover.
            className="flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-200"
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
      <span className="shrink-0 text-xs text-ink-500">{rowCountText(section.items.length)}</span>
    </div>
  );
}
