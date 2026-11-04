import {
  DEFAULT_SEVERITY,
  refWithText,
  rowLetter,
  rowRef,
  sectionNumber,
  SEVERITY_LABELS,
  type RowResult,
  type Section,
} from '@modig/shared';
import clsx from 'clsx';
import { IssueNote } from '../../templates/document/parts';
import { ISSUE_OUTLINE, NOK_BAR, READ_CELL, READ_GRID, ROW_FOCUS, ROW_LINE } from './layout';
import { GuideButton, PhotoCount, StatusMark } from './parts';
import type { Results } from './results';
import { SectionHeader } from './SectionHeader';

type Props = {
  sections: Section[];
  results: Results;
  rowIssues: ReadonlyMap<string, string>;
  onShowPhotos: (itemId: string) => void;
  onShowGuide: (itemId: string) => void;
};

/**
 * The sheet without inputs (a finalised inspection), in a tighter grid of its own (READ_GRID):
 * statuses as symbol and text in a column beside the checkpoints, responsible as text, and the
 * comment and a NOK row's category and severity under the checkpoint. Rows can take the focus
 * from script (`tabIndex={-1}`), so the page's jump links still work.
 */
export function ReadOnlyChecklist({
  sections,
  results,
  rowIssues,
  onShowPhotos,
  onShowGuide,
}: Props) {
  return sections.map((section, sectionIndex) => (
    <div key={section.id} id={`section-${section.id}`} className="mt-8 first:mt-0">
      <SectionHeader number={sectionNumber(sectionIndex)} title={section.title} readOnly />
      <ol>
        {section.items.map((item, rowIndex) => {
          const ref = rowRef(sectionIndex, rowIndex);
          const result = results[item.id];
          const issue = rowIssues.get(item.id);
          const photos = result?.status === 'NOK' ? (result.photos?.length ?? 0) : 0;
          return (
            <li
              key={item.id}
              id={`row-${item.id}`}
              tabIndex={-1}
              aria-label={`Row ${refWithText(ref, item.text)}`}
              className={clsx(
                'relative scroll-mt-2',
                ROW_FOCUS,
                result?.status === 'NOK' && NOK_BAR,
                issue && ISSUE_OUTLINE,
              )}
            >
              <div className={clsx(READ_GRID, ROW_LINE)}>
                <span
                  aria-hidden="true"
                  className={clsx(
                    READ_CELL.ref,
                    'pl-2 text-sm leading-8 text-ink-500 tabular-nums',
                  )}
                >
                  {rowLetter(rowIndex)}
                </span>
                <div className={clsx(READ_CELL.text, 'flex items-start gap-1')}>
                  <p className="min-w-0 flex-1 py-1.5 text-sm leading-5 wrap-break-word text-ink-900">
                    {item.text}
                  </p>
                  {item.guide && (
                    <GuideButton
                      guide={item.guide}
                      rowRef={ref}
                      onClick={() => onShowGuide(item.id)}
                      inTabOrder
                    />
                  )}
                </div>
                {/* Inset like the column labels above it. */}
                <div className={clsx(READ_CELL.status, '@min-[34rem]:px-2')}>
                  <StatusMark status={result?.status} />
                </div>
                {result?.resp && (
                  <p
                    className={clsx(
                      READ_CELL.resp,
                      'text-sm leading-5 wrap-break-word text-ink-800 @min-[34rem]:px-2 @min-[34rem]:py-1.5',
                    )}
                  >
                    {/* The column label says it on tablets and desktops. */}
                    <span className="font-medium text-ink-500 @min-[34rem]:sr-only">
                      Responsible:{' '}
                    </span>
                    {result.resp}
                  </p>
                )}
                <Notes result={result} />
                {/* Nothing to add once finalised, so only photos that exist are shown. */}
                {photos > 0 && (
                  <div className={clsx(READ_CELL.photos, 'flex items-center')}>
                    <PhotoCount count={photos} rowRef={ref} onClick={() => onShowPhotos(item.id)} />
                  </div>
                )}
              </div>
              {issue && <IssueNote id={`issue-${item.id}`} messages={[issue]} />}
            </li>
          );
        })}
      </ol>
    </div>
  ));
}

/**
 * Under the checkpoint: the comment, then a NOK row's category and severity (as in the fill-in
 * sheet, category first). Labelled, as there is no Comment column.
 */
function Notes({ result }: { result: RowResult | undefined }) {
  const nok = result?.status === 'NOK';
  if (!result?.comment && !nok) return null;
  return (
    <div className={clsx(READ_CELL.notes, 'min-w-0 space-y-0.5 pb-1.5')}>
      {result?.comment && (
        <p className="text-sm leading-5 wrap-break-word text-ink-800">
          <span className="font-medium text-ink-500">Comment: </span>
          {result.comment}
        </p>
      )}
      {nok && (
        <p className="flex flex-wrap gap-x-4 text-xs leading-5 font-medium text-nok-fg">
          {result.category && (
            <span className="wrap-break-word">
              Category: <span className="text-ink-800">{result.category}</span>
            </span>
          )}
          <span>
            Severity:{' '}
            <span className="text-ink-800">
              {SEVERITY_LABELS[result.severity ?? DEFAULT_SEVERITY]}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
