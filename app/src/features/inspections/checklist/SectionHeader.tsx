import clsx from 'clsx';
import type { ReactNode } from 'react';
import { CELL, GRID, SECTION_HEADER, WIDE_ONLY } from './layout';

const LABEL = clsx(
  WIDE_ONLY,
  'row-start-1 px-2 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase',
);

type Props = {
  number: number;
  title: string;
  /** The section's action ("Set remaining to OK"); it sits over the Status column when wide. */
  children?: ReactNode;
};

/** The grey header row of a section, with the column labels of the printed table when wide. */
export function SectionHeader({ number, title, children }: Props) {
  return (
    <div className={clsx(GRID, SECTION_HEADER)}>
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
      <span aria-hidden="true" className={clsx(LABEL, 'col-start-3')}>
        Comment
      </span>
      {children ? (
        <div className="col-start-2 justify-self-start @min-[34rem]:col-span-2 @min-[34rem]:col-start-3 @min-[34rem]:row-start-1 @min-[34rem]:justify-self-end @min-[56rem]:col-span-1 @min-[56rem]:col-start-4 @min-[56rem]:justify-self-stretch">
          {children}
        </div>
      ) : (
        <span aria-hidden="true" className={clsx(LABEL, 'col-start-4')}>
          Status
        </span>
      )}
      <span aria-hidden="true" className={clsx(LABEL, 'col-start-5')}>
        Resp
      </span>
    </div>
  );
}
