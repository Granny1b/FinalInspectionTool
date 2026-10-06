import { rowLetter, type Guide } from '@modig/shared';
import clsx from 'clsx';
import { Camera, CircleAlert, GripVertical, Info, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { GRID, REF_CELL, ROW_LINE } from './layout';

/** The paper-only columns, each pinned to its grid column (see layout.ts). */
const PAPER_COLUMNS = [
  { label: 'Comment', column: 'col-start-3' },
  { label: 'Status', column: 'col-start-4' },
  { label: 'Resp', column: 'col-start-5' },
] as const;
const WIDE_ONLY = 'row-start-1 hidden @min-[52rem]:block';

/** Empty Comment / Status / Resp cells: where the inspector writes on paper. */
export function PaperCells() {
  return PAPER_COLUMNS.map(({ label, column }) => (
    <span
      key={label}
      aria-hidden="true"
      className={clsx(WIDE_ONLY, column, 'border-l border-ink-100')}
    />
  ));
}

/** The column labels of a section header row, as in the Excel and the print. */
export function ColumnLabels() {
  return PAPER_COLUMNS.map(({ label, column }) => (
    <span
      key={label}
      aria-hidden="true"
      className={clsx(
        WIDE_ONLY,
        column,
        'self-stretch border-l border-ink-200 px-3 text-[0.6875rem] leading-11 font-medium tracking-wide text-ink-500 uppercase',
      )}
    >
      {label}
    </span>
  ));
}

type SpareRowsProps = {
  /** Index of the first spare row: lettering continues after the real rows. */
  start: number;
  count: number;
};

/** Lettered blank lines printed after each section for handwritten findings (brief §6). */
export function SpareRows({ start, count }: SpareRowsProps) {
  if (count <= 0) return null;
  return (
    <div title="Spare lines for handwritten findings on the printed checklist">
      <p className="sr-only">
        {count === 1 ? 'One spare line' : `${count} spare lines`} for handwritten findings when
        printed.
      </p>
      {Array.from({ length: count }, (_, offset) => (
        <div key={offset} aria-hidden="true" className={clsx(GRID, ROW_LINE, 'border-ink-100')}>
          <span className={clsx(REF_CELL, 'leading-10 text-ink-400')}>
            {rowLetter(start + offset)}
          </span>
          <PaperCells />
        </div>
      ))}
    </div>
  );
}

/** Publish problems under a section header or row (red, with an icon so it isn't colour only). */
export function IssueNote({ id, messages }: { id: string; messages: string[] }) {
  return (
    <div id={id} className="space-y-0.5 pt-1 pr-2 pb-2 pl-11 text-xs font-medium text-nok-fg">
      {messages.map((message, index) => (
        <p key={index} className="flex items-center gap-1.5">
          <CircleAlert size={13} aria-hidden="true" className="shrink-0" />
          {message}
        </p>
      ))}
    </div>
  );
}

/** Marks a row that has a guide: a camera when it has photos, otherwise an info icon. */
export function GuideMark({ guide }: { guide: Guide }) {
  const photos = guide.images.length;
  const Icon = photos > 0 ? Camera : Info;
  const label =
    photos > 0 ? `Has a guide with ${photos} ${photos === 1 ? 'photo' : 'photos'}` : 'Has a guide';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="mt-2.5 mr-1 ml-1.5 shrink-0 text-brand-600"
    >
      <Icon size={15} aria-hidden="true" />
    </span>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
};

export function IconButton({ icon: Icon, label, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'flex size-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900',
        className,
      )}
      {...props}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

type DragHandleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Grip in the sheet's left gutter. `touch-none` lets a finger drag it on a tablet without
 * scrolling the page; everywhere else the page still scrolls normally.
 */
export function DragHandle({ label, className, ref, ...props }: DragHandleProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={clsx(
        'absolute -left-7 flex h-7 w-6 cursor-grab touch-none items-center justify-center rounded text-ink-400 transition-opacity hover:bg-ink-100 hover:text-ink-700 focus-visible:opacity-100 active:cursor-grabbing',
        className,
      )}
      {...props}
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  );
}
