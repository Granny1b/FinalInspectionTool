import clsx from 'clsx';
import type { ReactNode } from 'react';
import { CELL, COLUMN_LABEL, GRID, READ_GRID, READ_LABELS, SECTION_HEADER } from './layout';

const LABEL_TEXT = 'px-2 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase';
const READ_LABEL = clsx(READ_LABELS, LABEL_TEXT, 'row-start-1');

type Props = {
  number: number;
  title: string;
  /** The section's action ("Set remaining to OK"); it sits over the Status column when wide. */
  children?: ReactNode;
  /** A read-only sheet's columns (READ_GRID): Status and Responsible. */
  readOnly?: boolean;
};

/**
 * The grey header row of a section, with the column labels of the printed table from 34rem: on a
 * tablet on a line of their own under the title (the action stays beside it), on a desktop beside
 * the title.
 */
export function SectionHeader({ number, title, children, readOnly = false }: Props) {
  const heading = (
    <>
      <span
        aria-hidden="true"
        className={clsx(CELL.ref, 'pl-2 text-sm leading-8 font-semibold text-ink-900')}
      >
        {number}
      </span>
      <h3 className="col-start-2 row-start-1 py-1.5 text-[0.9375rem] leading-5 font-semibold wrap-break-word text-ink-900">
        <span className="sr-only">Section {number}: </span>
        {title || <span className="font-normal text-ink-500">Untitled section</span>}
      </h3>
    </>
  );
  if (readOnly) {
    return (
      <div className={clsx(READ_GRID, SECTION_HEADER)}>
        {heading}
        <span aria-hidden="true" className={clsx(READ_LABEL, 'col-start-3')}>
          Status
        </span>
        <span aria-hidden="true" className={clsx(READ_LABEL, 'col-start-4')}>
          Responsible
        </span>
      </div>
    );
  }
  return (
    <div className={clsx(GRID, SECTION_HEADER)}>
      {heading}
      <span aria-hidden="true" className={clsx(COLUMN_LABEL.comment, LABEL_TEXT)}>
        Comment
      </span>
      {children && (
        <div className="col-start-2 justify-self-start @min-[34rem]:col-span-2 @min-[34rem]:col-start-3 @min-[34rem]:row-start-1 @min-[34rem]:justify-self-end @min-[56rem]:col-span-1 @min-[56rem]:col-start-4 @min-[56rem]:justify-self-stretch">
          {children}
        </div>
      )}
      {/* On a wide sheet the action takes the Status label's place, over the statuses. */}
      <span
        aria-hidden="true"
        className={clsx(COLUMN_LABEL.status, LABEL_TEXT, children && '@min-[56rem]:hidden')}
      >
        Status
      </span>
      <span aria-hidden="true" className={clsx(COLUMN_LABEL.resp, LABEL_TEXT)}>
        Responsible
      </span>
    </div>
  );
}
