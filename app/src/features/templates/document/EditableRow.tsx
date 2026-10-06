import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { rowLetter, rowRef, type Item } from '@modig/shared';
import clsx from 'clsx';
import { Copy, Images, Trash2 } from 'lucide-react';
import { memo, useId, type KeyboardEvent } from 'react';
import { ActionMenu } from './ActionMenu';
import { dragData, rowDndId, type DragData } from './dnd';
import { GRID, ISSUE_OUTLINE, REF_CELL, ROW_CONTROLS, ROW_LINE, TEXT_CELL } from './layout';
import { DragHandle, GuideMark, IconButton, IssueNote, PaperCells } from './parts';
import type { DocumentActions } from './useDocumentActions';

/** Shown on hover and while focus is inside the row (keyboard); always on touch screens. */
const REVEAL =
  'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100';

const GUIDE_SOON = 'Guide: coming in phase 5';

type Props = {
  item: Item;
  sectionId: string;
  sectionIndex: number;
  rowIndex: number;
  issues: string[] | undefined;
  actions: DocumentActions;
};

/** One checkpoint, edited in place. Memoised: typing in one row re-renders only that row. */
export const EditableRow = memo(function EditableRow({
  item,
  sectionId,
  sectionIndex,
  rowIndex,
  issues,
  actions,
}: Props) {
  const { active } = useDndContext();
  const dragging = active !== null;
  const data: DragData = { type: 'row', sectionId, itemId: item.id };
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowDndId(item.id),
    data,
    // While a section is dragged, rows must not be drop targets for it.
    disabled: { droppable: dragData(active)?.type === 'section' },
  });
  const ref = rowRef(sectionIndex, rowIndex);
  const issueId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    if (event.key === 'Enter') {
      // A checkpoint is one line: Enter never inserts a line break.
      event.preventDefault();
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        actions.insertRowAfter(item.id);
      }
    } else if (event.key === 'Backspace' && textarea.value === '') {
      event.preventDefault();
      actions.deleteRow(item.id);
    } else if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      !event.shiftKey &&
      caretAtEdge(textarea, event.key === 'ArrowUp' ? 'first' : 'last') &&
      actions.moveFocus({ kind: 'row', itemId: item.id }, event.key === 'ArrowUp' ? 'up' : 'down')
    ) {
      event.preventDefault();
    }
  }

  return (
    <div
      ref={setNodeRef}
      id={`row-${item.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('group/row relative', issues && ISSUE_OUTLINE, isDragging && 'opacity-40')}
    >
      <DragHandle
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        label={`Move row ${ref}`}
        className={clsx('top-1.5', dragging ? 'opacity-0' : REVEAL)}
      />
      <div
        className={clsx(
          GRID,
          ROW_LINE,
          issues ? 'bg-inherit' : clsx('bg-surface', !dragging && 'hover:bg-ink-50'),
        )}
      >
        <span aria-hidden="true" className={clsx(REF_CELL, 'leading-10 text-ink-500')}>
          {rowLetter(rowIndex)}
        </span>
        <div className={clsx(TEXT_CELL, 'items-start')}>
          {/* An invisible copy of the text sizes the grid cell, so the textarea grows with it. */}
          <div
            data-value={item.text}
            className="grid min-w-0 flex-1 text-sm leading-6 after:invisible after:col-start-1 after:row-start-1 after:px-2 after:py-2 after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_']"
          >
            <textarea
              data-item-text={item.id}
              aria-label={`Row ${ref} text`}
              aria-invalid={issues ? true : undefined}
              aria-describedby={issues ? issueId : undefined}
              rows={1}
              maxLength={1000}
              placeholder="Component - what to check"
              value={item.text}
              onChange={(event) => actions.setText(item.id, event.target.value)}
              onKeyDown={onKeyDown}
              className="col-start-1 row-start-1 resize-none overflow-hidden rounded-sm bg-transparent px-2 py-2 text-ink-900 placeholder:text-ink-500 focus:bg-surface focus-visible:outline-1 focus-visible:-outline-offset-1"
            />
          </div>
          {item.guide && <GuideMark guide={item.guide} />}
        </div>
        <PaperCells />
        {/* Inherits the row background so it covers the cell borders it floats over. */}
        <div
          className={clsx(ROW_CONTROLS, 'bg-inherit pt-1.5 pr-1', dragging ? 'opacity-0' : REVEAL)}
        >
          {/* Mouse and keyboard: the three actions as icons. */}
          <div className="flex gap-0.5 pointer-coarse:hidden">
            <GuideComingSoon rowRef={ref} />
            <IconButton
              icon={Copy}
              label={`Duplicate row ${ref}`}
              onClick={() => actions.duplicateRow(item.id)}
            />
            <IconButton
              icon={Trash2}
              label={`Delete row ${ref}`}
              onClick={() => actions.deleteRow(item.id)}
              className="hover:bg-nok-bg hover:text-nok-fg"
            />
          </div>
          {/* Touch: one ⋯ menu instead of a row of small icons on every line. */}
          <div className="hidden pointer-coarse:flex">
            <ActionMenu
              label={`Row ${ref} actions`}
              items={[
                { label: GUIDE_SOON, icon: Images, disabled: true, onSelect: () => undefined },
                { label: 'Duplicate', icon: Copy, onSelect: () => actions.duplicateRow(item.id) },
                {
                  label: 'Delete',
                  icon: Trash2,
                  danger: true,
                  onSelect: () => actions.deleteRow(item.id),
                },
              ]}
            />
          </div>
        </div>
      </div>
      {issues && <IssueNote id={issueId} messages={issues} />}
    </div>
  );
});

/** The guide editor arrives in phase 5: the button is there, disabled, and says so on hover. */
function GuideComingSoon({ rowRef }: { rowRef: string }) {
  return (
    <span className="group/guide relative flex">
      <button
        type="button"
        disabled
        aria-label={`Guide for row ${rowRef} (coming in phase 5)`}
        className="flex size-7 items-center justify-center rounded-md text-ink-400"
      >
        <Images size={15} aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-full z-10 mb-1 hidden rounded-md bg-ink-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-md group-hover/guide:block"
      >
        {GUIDE_SOON}
      </span>
    </span>
  );
}

/**
 * ArrowUp/ArrowDown leave the row only from its first/last visual line (in a wrapped row, the
 * browser moves the caret between lines first). The caret's line is measured on an off-screen copy
 * that wraps exactly like the textarea: same width, padding and font.
 */
function caretAtEdge(textarea: HTMLTextAreaElement, edge: 'first' | 'last'): boolean {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd) return false;
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  Object.assign(mirror.style, {
    position: 'absolute',
    visibility: 'hidden',
    boxSizing: 'border-box',
    width: `${textarea.clientWidth}px`,
    padding: style.padding,
    font: style.font,
    letterSpacing: style.letterSpacing,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  // Text before the caret, then the rest in a marker whose top is the caret's line.
  const marker = document.createElement('span');
  marker.textContent = value.slice(selectionStart) || ' ';
  mirror.append(value.slice(0, selectionStart), marker);
  document.body.append(mirror);
  const lineHeight = parseFloat(style.lineHeight);
  const paddingTop = parseFloat(style.paddingTop);
  const caretLine = Math.round((marker.offsetTop - paddingTop) / lineHeight);
  const lines = Math.round(
    (mirror.clientHeight - paddingTop - parseFloat(style.paddingBottom)) / lineHeight,
  );
  mirror.remove();
  return edge === 'first' ? caretLine <= 0 : caretLine >= lines - 1;
}
