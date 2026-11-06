import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { rowHasContent, rowRef, type Item } from '@modig/shared';
import clsx from 'clsx';
import { Copy, Images, Trash2 } from 'lucide-react';
import { memo, useId, type KeyboardEvent } from 'react';
import { ActionMenu } from '../../components/ActionMenu';
import { rowDndId, type DragData } from '../templates/document/dnd';
import { DragHandle, IssueNote } from '../templates/document/parts';
import { caretAtEdge, swallowHeldBackspace } from '../templates/document/rowKeys';
import type { DocumentActions } from '../templates/document/useDocumentActions';
import type { DragKind } from '../templates/document/useDocumentDnd';
import { MoreInformation } from './MoreInformation';
import { PictureTile } from './PictureTile';
import { CARD_COLUMNS, CONTROLS_CELL, DETAIL_CELL, PICTURE_CELL, ROW_CARD } from './layout';
import { ReferencesField } from './ReferencesField';
import { TimeField } from './TimeField';

type Props = {
  item: Item;
  sectionId: string;
  sectionIndex: number;
  rowIndex: number;
  issues: string[] | undefined;
  /** What is being dragged (see EditableSection). */
  dragKind: DragKind;
  actions: DocumentActions;
};

/** A textarea that grows with its text: an invisible copy of it sizes the grid cell. */
const GROWING =
  "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] after:invisible after:col-start-1 after:row-start-1 after:px-2 after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_']";
const TEXTAREA =
  'col-start-1 row-start-1 resize-none overflow-hidden rounded-sm bg-transparent px-2 text-ink-900 placeholder:font-normal placeholder:text-ink-500 hover:bg-ink-50 focus:bg-surface focus-visible:outline-1 focus-visible:-outline-offset-1';

/**
 * One row of a quality check as a card, edited in place: its pictures on the left (a click opens
 * them with the row's more information), then the ref and What, How, the references and, on the
 * right, the time and the row's ⋯ menu. `Enter` in What adds a row below; `Backspace` in an empty
 * row removes it. Memoised: typing in one row re-renders only that row.
 */
export const QualityRow = memo(function QualityRow({
  item,
  sectionId,
  sectionIndex,
  rowIndex,
  issues,
  dragKind,
  actions,
}: Props) {
  const dragging = dragKind !== null;
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
    disabled: { droppable: dragKind === 'section' },
  });
  const ref = rowRef(sectionIndex, rowIndex);
  const issueId = useId();
  const openPictures = () => actions.openGuide(item.id);

  function onWhatKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    if (event.key === 'Enter') {
      // What is one line: Enter adds the next row instead.
      event.preventDefault();
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        actions.insertRowAfter(item.id);
      }
    } else if (event.key === 'Backspace' && textarea.value === '') {
      // Only a row with nothing in it goes: one with a how, references, a time or pictures
      // keeps them (its ⋯ menu deletes it, with an undo).
      if (rowHasContent(item)) return;
      event.preventDefault();
      if (event.repeat) return;
      actions.deleteRow(item.id);
      swallowHeldBackspace();
    } else if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      !event.shiftKey &&
      caretAtEdge(textarea, event.key === 'ArrowUp' ? 'first' : 'last') &&
      actions.moveFocus({ kind: 'row', itemId: item.id }, event.key === 'ArrowUp' ? 'up' : 'down')
    ) {
      event.preventDefault();
    }
  }

  const pictureAction = item.guide ? 'Pictures and information' : 'Add pictures';
  return (
    <li
      ref={setNodeRef}
      id={`row-${item.id}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('group/row relative', isDragging && 'opacity-40')}
    >
      <DragHandle
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        label={`Move row ${ref}`}
        className={clsx(
          'top-3',
          dragging
            ? 'opacity-0'
            : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100',
        )}
      />
      <div
        className={clsx(
          ROW_CARD,
          CARD_COLUMNS,
          issues
            ? 'border-nok-fg bg-nok-bg'
            : clsx('border-ink-200 bg-surface', !dragging && 'hover:border-ink-300'),
        )}
      >
        <div className={PICTURE_CELL}>
          <PictureTile guide={item.guide} rowRef={ref} onOpen={openPictures} editable />
        </div>

        <div className="flex min-w-0 items-start gap-1">
          <span className="w-8 shrink-0 pl-0.5 text-sm leading-9 font-semibold text-ink-900 tabular-nums">
            {ref}
          </span>
          <div
            data-value={item.text}
            className={clsx(GROWING, 'text-[0.9375rem] leading-6 font-semibold after:py-1.5')}
          >
            <textarea
              data-item-text={item.id}
              aria-label={`Row ${ref} what to check`}
              aria-invalid={issues ? true : undefined}
              aria-describedby={issues ? issueId : undefined}
              rows={1}
              maxLength={1000}
              placeholder="What to check"
              value={item.text}
              onChange={(event) => actions.setText(item.id, event.target.value)}
              onKeyDown={onWhatKeyDown}
              className={clsx(TEXTAREA, 'py-1.5')}
            />
          </div>
        </div>
        <div className={DETAIL_CELL}>
          <div
            data-value={item.how ?? ''}
            className={clsx(GROWING, 'text-sm leading-5 after:py-1')}
          >
            <textarea
              data-item-how={item.id}
              aria-label={`Row ${ref} how`}
              rows={1}
              maxLength={2000}
              placeholder="How to check it"
              value={item.how ?? ''}
              onChange={(event) => actions.setFields(item.id, { how: event.target.value })}
              className={clsx(TEXTAREA, 'py-1 text-ink-700')}
            />
          </div>
        </div>
        <div className={DETAIL_CELL}>
          <ReferencesField
            rowRef={ref}
            references={item.references ?? []}
            onChange={(references) => actions.setFields(item.id, { references })}
          />
        </div>
        {item.guide?.description && (
          <MoreInformation text={item.guide.description} className={clsx(DETAIL_CELL, 'px-2')} />
        )}

        {/* Below the text on a narrow card; on a wide one a column of its own, the ⋯ at the top
            and the time at the bottom. */}
        <div
          className={clsx(
            CONTROLS_CELL,
            'flex items-center justify-between gap-2 @min-[36rem]:flex-col-reverse @min-[36rem]:items-end',
          )}
        >
          <TimeField
            rowRef={ref}
            hours={item.timeHours}
            onChange={(timeHours) => actions.setFields(item.id, { timeHours })}
          />
          <ActionMenu
            label={`Row ${ref} actions`}
            items={[
              { label: pictureAction, icon: Images, onSelect: openPictures },
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
      {issues && <IssueNote id={issueId} messages={issues} />}
    </li>
  );
});
