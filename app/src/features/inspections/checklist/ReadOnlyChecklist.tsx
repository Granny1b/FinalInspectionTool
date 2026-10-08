import {
  DEFAULT_SEVERITY,
  refWithText,
  rowLetter,
  rowRef,
  sectionNumber,
  SEVERITY_LABELS,
  type Section,
} from '@modig/shared';
import clsx from 'clsx';
import { IssueNote } from '../../templates/document/parts';
import { CELL, GRID, ISSUE_OUTLINE, NOK_BAR, ROW_FOCUS, ROW_LINE } from './layout';
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
 * The same sheet without inputs (a finalised inspection): statuses as symbol and text, comment
 * and resp as text. Rows can take the focus from script (`tabIndex={-1}`), so the page's jump
 * links still work.
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
      <SectionHeader number={sectionNumber(sectionIndex)} title={section.title} />
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
              <div className={clsx(GRID, ROW_LINE)}>
                <span
                  aria-hidden="true"
                  className={clsx(CELL.ref, 'pl-2 text-sm leading-8 text-ink-500 tabular-nums')}
                >
                  {rowLetter(rowIndex)}
                </span>
                <div className={clsx(CELL.text, 'flex items-start gap-1')}>
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
                <div className={CELL.status}>
                  <StatusMark status={result?.status} />
                </div>
                <ReadOnlyText className={CELL.comment} label="Comment" value={result?.comment} />
                <ReadOnlyText className={CELL.resp} label="Resp" value={result?.resp} />
                {result?.status === 'NOK' && (
                  <p
                    className={clsx(
                      CELL.severity,
                      'self-center text-xs leading-6 font-medium text-nok-fg',
                    )}
                  >
                    Severity: {SEVERITY_LABELS[result.severity ?? DEFAULT_SEVERITY]}
                  </p>
                )}
                {/* Nothing to add once finalised, so only photos that exist are shown. */}
                {photos > 0 && (
                  <div className={clsx(CELL.photos, 'flex items-center')}>
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

/** Comment or resp as text; on narrow sheets, where there are no column labels, with its label. */
function ReadOnlyText({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: string | undefined;
}) {
  if (!value) return <span className={className} />;
  return (
    <p className={clsx(className, 'py-1.5 text-sm leading-5 wrap-break-word text-ink-800')}>
      <span className="font-medium text-ink-500 @min-[56rem]:sr-only">{label}: </span>
      {value}
    </p>
  );
}
