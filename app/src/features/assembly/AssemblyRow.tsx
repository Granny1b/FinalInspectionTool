import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  formatDocuments,
  formatFasteners,
  formatMinutes,
  parseDocuments,
  parseFasteners,
  parseMinutes,
  parsePartNumbers,
  rowHasContent,
  stepRef,
  type AssemblyStep,
  type Item,
} from '@modig/shared';
import clsx from 'clsx';
import { ChevronDown, Copy, Images, Trash2 } from 'lucide-react';
import { memo, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ActionMenu } from '../../components/ActionMenu';
import { PictureTile } from '../qualityChecks/PictureTile';
import { rowDndId, type DragData } from '../templates/document/dnd';
import { DragHandle, IssueNote } from '../templates/document/parts';
import { caretAtEdge, swallowHeldBackspace } from '../templates/document/rowKeys';
import type { DocumentActions } from '../templates/document/useDocumentActions';
import type { DragKind } from '../templates/document/useDocumentDnd';

/** The id of the <datalist> of departments the document renders once for all its steps. */
export const DEPARTMENTS_LIST_ID = 'assembly-departments';

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
const BOX =
  'block w-full rounded-md border border-ink-500/80 bg-surface px-2 text-sm text-ink-900 shadow-xs transition-colors placeholder:text-ink-500 hover:border-ink-600 focus-visible:border-brand-600 focus-visible:outline-1 focus-visible:outline-offset-0 aria-invalid:border-nok-fg aria-invalid:outline-nok-fg dark:border-ink-400';
const LABEL = 'mb-1 block text-xs font-medium text-ink-600';

/**
 * One step of an assembly instruction as a card, edited in place: its pictures on the left (a
 * click opens them), then the step and its instructions, and under them its details: department,
 * time, assy, part numbers, bolts and documents. The details fold away into one line that says
 * what is there. `Enter` in the step adds the next one; `Backspace` in an empty step removes it.
 * Memoised: typing in one step re-renders only that step.
 */
export const AssemblyRow = memo(function AssemblyRow({
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
  const ref = stepRef(sectionIndex, rowIndex);
  const issueId = useId();
  const detailsId = useId();
  const step = item.assembly ?? {};
  // A new step opens with its details, ready to be filled in; one with details shows their line.
  const [open, setOpen] = useState(() => !item.text && !rowHasContent(item));
  const openPictures = () => actions.openGuide(item.id);
  const set = (fields: Partial<AssemblyStep>) => actions.setFields(item.id, { assembly: fields });
  const description = item.guide?.description ?? '';

  function setDescription(text: string) {
    const images = item.guide?.images ?? [];
    actions.setGuide(
      item.id,
      text || images.length > 0 ? { ...(text && { description: text }), images } : undefined,
    );
  }

  function onTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    if (event.key === 'Enter') {
      // The step is one line: Enter adds the next step instead.
      event.preventDefault();
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        actions.insertRowAfter(item.id);
      }
    } else if (event.key === 'Backspace' && textarea.value === '') {
      // Only a step with nothing in it goes; its ⋯ menu deletes one with content, with an undo.
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
        label={`Move step ${ref}`}
        className={clsx(
          'top-3',
          dragging
            ? 'opacity-0'
            : 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100',
        )}
      />
      <div
        className={clsx(
          'grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-x-3 rounded-lg border p-3 transition-colors @min-[36rem]:grid-cols-[9rem_minmax(0,1fr)_auto] @min-[36rem]:gap-x-4',
          issues
            ? 'border-nok-fg bg-nok-bg'
            : clsx('border-ink-200 bg-surface', !dragging && 'hover:border-ink-300'),
        )}
      >
        <div className="self-start">
          <PictureTile guide={item.guide} rowRef={ref} onOpen={openPictures} editable step />
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-1">
            <span className="w-9 shrink-0 pl-0.5 text-sm leading-9 font-semibold text-brand-700 tabular-nums">
              {ref}
            </span>
            <div
              data-value={item.text}
              className={clsx(GROWING, 'text-[0.9375rem] leading-6 font-semibold after:py-1.5')}
            >
              <textarea
                data-item-text={item.id}
                aria-label={`Step ${ref}`}
                aria-invalid={issues ? true : undefined}
                aria-describedby={issues ? issueId : undefined}
                rows={1}
                maxLength={1000}
                placeholder="What to do, e.g. “Mount Pan 80069”"
                value={item.text}
                onChange={(event) => actions.setText(item.id, event.target.value)}
                onKeyDown={onTextKeyDown}
                className={clsx(TEXTAREA, 'py-1.5')}
              />
            </div>
          </div>
          <div className="mt-0.5 @min-[36rem]:pl-10">
            <div data-value={description} className={clsx(GROWING, 'text-sm leading-5 after:py-1')}>
              <textarea
                aria-label={`Step ${ref} instructions`}
                rows={1}
                maxLength={5000}
                placeholder="Instructions: how to do it, what to watch out for"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={clsx(TEXTAREA, 'py-1 text-ink-700')}
              />
            </div>
          </div>
        </div>

        <ActionMenu
          label={`Step ${ref} actions`}
          items={[
            {
              label: item.guide?.images.length ? 'Pictures' : 'Add pictures',
              icon: Images,
              onSelect: openPictures,
            },
            { label: 'Duplicate', icon: Copy, onSelect: () => actions.duplicateRow(item.id) },
            {
              label: 'Delete',
              icon: Trash2,
              danger: true,
              onSelect: () => actions.deleteRow(item.id),
            },
          ]}
        />

        <div className="col-span-full mt-2 border-t border-ink-100 pt-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={clsx('shrink-0 transition-transform', !open && '-rotate-90')}
            />
            <span className="font-medium">Details</span>
            {!open && <span className="min-w-0 truncate text-ink-500">{summary(step)}</span>}
          </button>
          {open && (
            <div
              id={detailsId}
              className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 px-1.5 pb-1 @min-[36rem]:grid-cols-2 @min-[56rem]:grid-cols-4"
            >
              <Labelled label="Department">
                {(id) => (
                  <input
                    id={id}
                    list={DEPARTMENTS_LIST_ID}
                    autoComplete="off"
                    maxLength={200}
                    placeholder="Mechanics"
                    value={step.department ?? ''}
                    onChange={(event) => set({ department: event.target.value })}
                    className={clsx(BOX, 'h-8')}
                  />
                )}
              </Labelled>
              <MinutesField minutes={step.minutes} onChange={(minutes) => set({ minutes })} />
              <Labelled label="Assy number">
                {(id) => (
                  <input
                    id={id}
                    autoComplete="off"
                    maxLength={100}
                    placeholder="82265"
                    value={step.assyNumber ?? ''}
                    onChange={(event) => set({ assyNumber: event.target.value })}
                    className={clsx(BOX, 'h-8')}
                  />
                )}
              </Labelled>
              <Labelled label="Assy name">
                {(id) => (
                  <input
                    id={id}
                    autoComplete="off"
                    maxLength={200}
                    placeholder="Base, HHV3"
                    value={step.assyName ?? ''}
                    onChange={(event) => set({ assyName: event.target.value })}
                    className={clsx(BOX, 'h-8')}
                  />
                )}
              </Labelled>
              <div className="@min-[36rem]:col-span-2">
                <ParsedField
                  label="Part numbers"
                  hint="Separated by commas."
                  text={(step.partNumbers ?? []).join(', ')}
                  placeholder="80065, 82053"
                  rows={1}
                  onChange={(text) => set({ partNumbers: parsePartNumbers(text) })}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-ink-800 @min-[36rem]:col-span-2">
                <input
                  type="checkbox"
                  checked={step.fromPreAssembly ?? false}
                  onChange={(event) => set({ fromPreAssembly: event.target.checked })}
                  className="size-4 accent-brand-600"
                />
                Parts come from pre-assembly
              </label>
              <div className="@min-[36rem]:col-span-2">
                <ParsedField
                  label="Bolts"
                  hint="One to a line, as in “8 pcs MC6S M8x25”. A list copied from Excel can be pasted."
                  text={formatFasteners(step.fasteners)}
                  placeholder={'8 pcs MC6S M8x25\n8 pcs TBRSB M8 FZB'}
                  rows={3}
                  onChange={(text) => set({ fasteners: parseFasteners(text) })}
                />
              </div>
              <div className="@min-[36rem]:col-span-2">
                <ParsedField
                  label="Documents"
                  hint={
                    'One to a line: a link, or a path on the server (paste it). A name may go first: “Drawing | K:\\…\\82265.pdf”.'
                  }
                  text={formatDocuments(step.documents)}
                  placeholder={'\\\\SRV102\\…\\Instruction.pdf'}
                  rows={3}
                  onChange={(text) => set({ documents: parseDocuments(text) })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {issues && <IssueNote id={issueId} messages={issues} />}
    </li>
  );
});

/** What a step's folded details hold, in a line: "Mechanics · 30 min · 4 bolts · 2 parts". */
function summary(step: AssemblyStep): string {
  const count = (n: number | undefined, one: string, many: string) =>
    n ? `${n} ${n === 1 ? one : many}` : '';
  const parts = [
    step.department?.trim(),
    step.minutes === undefined ? '' : formatMinutes(step.minutes),
    step.assyNumber?.trim() ? `Assy ${step.assyNumber.trim()}` : '',
    count(step.partNumbers?.length, 'part', 'parts'),
    count(step.fasteners?.length, 'bolt line', 'bolt lines'),
    count(step.documents?.length, 'document', 'documents'),
    step.fromPreAssembly ? 'from pre-assembly' : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Department, time, parts, bolts, documents';
}

function Labelled({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * The estimated time in minutes ("90"; "1.5 h" and "1 h 30" are read too). Every time typed counts
 * at once; something that isn't one is marked and, on leaving, the field shows the last time again.
 */
function MinutesField({
  minutes,
  onChange,
}: {
  minutes: number | undefined;
  onChange: (minutes: number | undefined) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const invalid = text !== null && parseMinutes(text) === null;
  return (
    <Labelled label="Estimated time (min)">
      {(id) => (
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          placeholder="30"
          aria-invalid={invalid ? true : undefined}
          value={text ?? (minutes === undefined ? '' : String(minutes))}
          onChange={(event) => {
            setText(event.target.value);
            const next = parseMinutes(event.target.value);
            if (next !== null && next !== minutes) onChange(next);
          }}
          onBlur={() => setText(null)}
          className={clsx(BOX, 'h-8 tabular-nums')}
        />
      )}
    </Labelled>
  );
}

/**
 * A list kept as lines of text while it is typed (bolts, documents, part numbers): what is typed
 * is read into the list at once, and on leaving the field shows the list as it was read.
 */
function ParsedField({
  label,
  hint,
  text,
  placeholder,
  rows,
  onChange,
}: {
  label: string;
  hint: string;
  /** The stored list as text. */
  text: string;
  placeholder: string;
  rows: number;
  onChange: (text: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null);
  const value = typed ?? text;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <textarea
        id={id}
        aria-describedby={`${id}-hint`}
        rows={Math.max(rows, value.split('\n').length)}
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setTyped(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => setTyped(null)}
        className={clsx(BOX, 'resize-y py-1.5 leading-5', rows > 1 && 'font-mono text-[0.8125rem]')}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
        {hint}
      </p>
    </div>
  );
}
