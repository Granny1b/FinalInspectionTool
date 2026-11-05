import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sectionNumber, type Section } from '@modig/shared';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Copy, ListPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { memo, useId, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { ActionMenu } from '../../../components/ActionMenu';
import { bodyDndId, rowDndId, sectionDndId, type DragData } from './dnd';
import { EditableRow } from './EditableRow';
import { GRID, HEADER_FILL, ISSUE_OUTLINE, REF_CELL, SECTION_HEADER, TEXT_CELL } from './layout';
import { MAX_SPARE_ROWS, rowCountText } from './ops';
import { ColumnLabels, DragHandle, IssueNote, SpareRows } from './parts';
import type { DocumentActions } from './useDocumentActions';
import type { DragKind } from './useDocumentDnd';

const ADD_BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900';

type Props = {
  section: Section;
  index: number;
  sectionCount: number;
  spareRows: number;
  issues: string[] | undefined;
  itemIssues: ReadonlyMap<string, string[]>;
  /** Only the header (and its row count) while this section is being dragged. */
  collapsed: boolean;
  /**
   * What is being dragged. A prop, not dnd-kit's context: that changes on every pointer move and
   * would re-render all 90 rows each time.
   */
  dragKind: DragKind;
  actions: DocumentActions;
};

export const EditableSection = memo(function EditableSection({
  section,
  index,
  sectionCount,
  spareRows,
  issues,
  itemIssues,
  collapsed,
  dragKind,
  actions,
}: Props) {
  const activeType = dragKind;
  const sectionData: DragData = { type: 'section', sectionId: section.id };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sectionDndId(section.id),
    data: sectionData,
    disabled: { droppable: activeType === 'row' },
  });
  // The rows area accepts rows even when it has none.
  const bodyData: DragData = { type: 'body', sectionId: section.id };
  const { setNodeRef: setBodyRef } = useDroppable({
    id: bodyDndId(section.id),
    data: bodyData,
    disabled: activeType !== 'row',
  });
  // Same ids → same array, so typing in a row doesn't re-render the other rows of the section.
  const idsKey = section.items.map((item) => item.id).join(' ');
  const rowIds = useMemo(() => (idsKey ? idsKey.split(' ').map(rowDndId) : []), [idsKey]);
  const number = sectionNumber(index);
  const issueId = useId();
  const rowCount = section.items.length;

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const field = { kind: 'title', sectionId: section.id } as const;
    if (event.key === 'Enter') {
      event.preventDefault();
      actions.enterFromTitle(section.id);
    } else if (event.key === 'ArrowUp' && actions.moveFocus(field, 'up')) {
      event.preventDefault();
    } else if (event.key === 'ArrowDown' && actions.moveFocus(field, 'down')) {
      event.preventDefault();
    }
  }

  return (
    <div
      ref={setNodeRef}
      id={`section-${section.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('relative', 'mt-10 first:mt-0', isDragging && 'opacity-40')}
    >
      <div className={clsx('group/header relative', issues && ISSUE_OUTLINE)}>
        <DragHandle
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          label={`Move section ${number}`}
          className={clsx(
            'top-2',
            dragKind
              ? 'opacity-0'
              : 'opacity-0 group-focus-within/header:opacity-100 group-hover/header:opacity-100 pointer-coarse:opacity-100',
          )}
        />
        <div className={clsx(GRID, SECTION_HEADER, issues ? 'bg-inherit' : HEADER_FILL)}>
          <span className={clsx(REF_CELL, 'font-semibold text-ink-900')}>{number}</span>
          {/* On a wide sheet the ⋯ button sits at the end of this cell, before the labels. */}
          <div className={clsx(TEXT_CELL, 'items-center @min-[52rem]:pr-9')}>
            <input
              data-section-title={section.id}
              aria-label={`Section ${number} title`}
              aria-invalid={issues ? true : undefined}
              aria-describedby={issues ? issueId : undefined}
              maxLength={200}
              placeholder="Section title"
              value={section.title}
              onChange={(event) => actions.setTitle(section.id, event.target.value)}
              onKeyDown={onTitleKeyDown}
              className="h-8 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-[0.9375rem] font-semibold text-ellipsis text-ink-900 placeholder:font-normal placeholder:text-ink-500 focus:bg-surface focus-visible:outline-1 focus-visible:-outline-offset-1"
            />
            {collapsed && (
              <span className="shrink-0 px-2 text-xs text-ink-500">{rowCountText(rowCount)}</span>
            )}
          </div>
          <div className="col-start-3 row-start-1 flex justify-end pr-1 @min-[52rem]:col-start-2 @min-[52rem]:justify-self-end">
            <ActionMenu
              label={`Section ${number} actions`}
              triggerData={{ 'data-section-menu': section.id }}
              items={[
                {
                  label: 'Rename',
                  icon: Pencil,
                  onSelect: () => actions.renameSection(section.id),
                },
                {
                  label: 'Duplicate',
                  icon: Copy,
                  onSelect: () => actions.duplicateSection(section.id),
                },
                {
                  label: 'Move up',
                  icon: ArrowUp,
                  disabled: index === 0,
                  onSelect: () => actions.moveSectionBy(section.id, -1),
                },
                {
                  label: 'Move down',
                  icon: ArrowDown,
                  disabled: index === sectionCount - 1,
                  onSelect: () => actions.moveSectionBy(section.id, 1),
                },
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  onSelect: () => actions.deleteSection(section.id),
                },
              ]}
            />
          </div>
          <ColumnLabels />
        </div>
        {issues && <IssueNote id={issueId} messages={issues} />}
      </div>

      <div ref={setBodyRef} className={clsx(collapsed && 'hidden')}>
        <SortableContext id={section.id} items={rowIds} strategy={verticalListSortingStrategy}>
          {section.items.map((item, rowIndex) => (
            <EditableRow
              key={item.id}
              item={item}
              sectionId={section.id}
              sectionIndex={index}
              rowIndex={rowIndex}
              issues={itemIssues.get(item.id)}
              dragKind={dragKind}
              actions={actions}
            />
          ))}
        </SortableContext>
        {rowCount === 0 && (
          <EmptyRows
            dropping={activeType === 'row'}
            addRow={<AddRowButton sectionId={section.id} number={number} actions={actions} />}
          />
        )}
        <SpareRows
          start={rowCount}
          count={spareRows}
          edit={{
            sectionId: section.id,
            sectionIndex: index,
            onDelete: (offset) => actions.deleteSpareRow(section.id, offset),
          }}
        />
        <div className="mt-1.5 ml-9 flex flex-wrap gap-x-1">
          {/* An empty section offers it in its empty state instead, where its rows will go. */}
          {rowCount > 0 && (
            <AddRowButton sectionId={section.id} number={number} actions={actions} />
          )}
          <button
            type="button"
            data-add-spare={section.id}
            onClick={() => actions.addSpareRow(section.id)}
            disabled={spareRows >= MAX_SPARE_ROWS}
            aria-label={`Add spare line to section ${number}`}
            title={
              spareRows >= MAX_SPARE_ROWS
                ? `A section has at most ${MAX_SPARE_ROWS} spare lines`
                : 'A blank lettered line on the printed checklist, for findings written by hand'
            }
            className={clsx(ADD_BUTTON, 'disabled:opacity-50')}
          >
            <Plus size={15} aria-hidden="true" />
            Add spare line
          </button>
        </div>
      </div>
    </div>
  );
});

/** The section's "+ Add row": one per section, at the end of its rows or in its empty state. */
function AddRowButton({
  sectionId,
  number,
  actions,
}: {
  sectionId: string;
  number: number;
  actions: DocumentActions;
}) {
  return (
    <button
      type="button"
      data-add-row={sectionId}
      onClick={() => actions.addRow(sectionId)}
      aria-label={`Add row to section ${number}`}
      className={ADD_BUTTON}
    >
      <Plus size={15} aria-hidden="true" />
      Add row
    </button>
  );
}

/**
 * Where the rows of a section without any will go: a dashed frame in the rows' place, which says
 * so and holds the section's Add row, and lights up as the drop target while a row is dragged
 * (the whole rows area takes the drop). A section may be published like this, as a heading for
 * checkpoints still to be written.
 */
function EmptyRows({ dropping, addRow }: { dropping: boolean; addRow: ReactNode }) {
  return (
    <div className="border-b border-ink-200 py-2 pl-9">
      <div
        className={clsx(
          'flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border border-dashed py-1.5 pr-1.5 pl-3 transition-colors',
          dropping ? 'border-brand-400 bg-brand-50' : 'border-ink-300 bg-ink-50',
        )}
      >
        <p className="flex min-w-0 items-center gap-2.5 text-sm text-ink-500">
          <ListPlus
            size={16}
            aria-hidden="true"
            className={clsx('shrink-0', dropping ? 'text-brand-600' : 'text-ink-400')}
          />
          {dropping ? (
            <span className="font-medium text-brand-800">Drop the row here</span>
          ) : (
            <span>
              <span className="font-medium text-ink-700">No rows yet.</span> Add the first
              checkpoint, or drag rows here.
            </span>
          )}
        </p>
        {!dropping && addRow}
      </div>
    </div>
  );
}
