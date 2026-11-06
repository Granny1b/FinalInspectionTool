import { formatHours, rowRef, sectionNumber, type Item, type Section } from '@modig/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { guideRow } from '../guides/guide';
import { GuideViewer } from '../guides/GuideViewer';
import { QUALITY_GUIDE_WORDING } from '../guides/wording';
import type { IssueIndex } from '../templates/document/issues';
import { ISSUE_OUTLINE } from '../templates/document/layout';
import { IssueNote } from '../templates/document/parts';
import {
  CARD_COLUMNS,
  CARD_COLUMNS_TEXT,
  CONTROLS_CELL,
  DETAIL_CELL,
  PICTURE_CELL,
  ROW_CARD,
  ROW_LIST,
  SECTION_BAR,
} from './layout';
import { MoreInformation } from './MoreInformation';
import { PictureTile } from './PictureTile';
import { sectionStats } from './stats';

type Props = {
  sections: Section[];
  issues: IssueIndex;
};

/**
 * A quality check without inputs, for inspectors and published revisions: each section's header
 * and its rows as cards. A row's picture opens its pictures and more information, read-only.
 */
export function QualityChecklistView({ sections, issues }: Props) {
  const [pictureItemId, setPictureItemId] = useState<string | null>(null);
  const viewing = pictureItemId === null ? null : guideRow(sections, pictureItemId);
  if (sections.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-500">This quality check has no sections.</p>
    );
  }
  return (
    <>
      {sections.map((section, index) => {
        const sectionIssues = issues.sections.get(section.id);
        return (
          <section
            key={section.id}
            id={`section-${section.id}`}
            aria-labelledby={`section-title-${section.id}`}
            className="mt-10 first:mt-0"
          >
            <div className={clsx(sectionIssues && ISSUE_OUTLINE)}>
              <div className={clsx(SECTION_BAR, sectionIssues ? 'bg-inherit' : 'bg-ink-50')}>
                <span className="pl-2 text-sm font-semibold text-ink-900 tabular-nums">
                  {sectionNumber(index)}
                </span>
                <h2
                  id={`section-title-${section.id}`}
                  className="px-2 py-2 text-[0.9375rem] font-semibold text-ink-900"
                >
                  {section.title || (
                    <span className="font-normal text-ink-500">Untitled section</span>
                  )}
                </h2>
                <span className="col-start-2 row-start-2 px-2 pb-2 text-xs text-ink-500 tabular-nums @min-[36rem]:col-start-3 @min-[36rem]:row-start-1 @min-[36rem]:pr-4 @min-[36rem]:pb-0">
                  {sectionStats(section.items)}
                </span>
              </div>
              {sectionIssues && <IssueNote id={`issues-${section.id}`} messages={sectionIssues} />}
            </div>
            {section.items.length === 0 ? (
              <p className="py-3 pl-11 text-sm text-ink-500">No rows in this section yet.</p>
            ) : (
              <ol className={ROW_LIST}>
                {section.items.map((item, rowIndex) => (
                  <RowCard
                    key={item.id}
                    item={item}
                    rowLabel={rowRef(index, rowIndex)}
                    issues={issues.items.get(item.id)}
                    onOpenPictures={() => setPictureItemId(item.id)}
                  />
                ))}
              </ol>
            )}
          </section>
        );
      })}
      {viewing?.guide && (
        <GuideViewer
          rowRef={viewing.ref}
          rowText={viewing.text}
          guide={viewing.guide}
          wording={QUALITY_GUIDE_WORDING}
          onClose={() => setPictureItemId(null)}
        />
      )}
    </>
  );
}

function RowCard({
  item,
  rowLabel: ref,
  issues,
  onOpenPictures,
}: {
  item: Item;
  /** "1.a" */
  rowLabel: string;
  issues: string[] | undefined;
  onOpenPictures: () => void;
}) {
  return (
    <li id={`row-${item.id}`}>
      <div
        className={clsx(
          ROW_CARD,
          item.guide ? CARD_COLUMNS : CARD_COLUMNS_TEXT,
          issues ? 'border-nok-fg bg-nok-bg' : 'border-ink-200 bg-surface',
        )}
      >
        {item.guide ? (
          <div className={PICTURE_CELL}>
            <PictureTile guide={item.guide} rowRef={ref} onOpen={onOpenPictures} editable={false} />
          </div>
        ) : (
          // On a wide sheet the pictures' column stays, so every row's text starts in one line.
          <div aria-hidden="true" className={clsx(PICTURE_CELL, 'hidden @min-[36rem]:block')} />
        )}
        <p className="flex min-w-0 items-start gap-1">
          <span className="w-8 shrink-0 pl-0.5 text-sm leading-6 font-semibold text-ink-900 tabular-nums">
            {ref}
          </span>
          <span className="min-w-0 px-2 text-[0.9375rem] leading-6 font-semibold wrap-break-word text-ink-900">
            {item.text || <span className="font-normal text-ink-500">Empty row</span>}
          </span>
        </p>
        {item.how && (
          <p
            className={clsx(
              DETAIL_CELL,
              'px-2 text-sm leading-5 wrap-break-word whitespace-pre-line text-ink-700',
            )}
          >
            <span className="sr-only">How: </span>
            {item.how}
          </p>
        )}
        {item.references && item.references.length > 0 && (
          <ul
            aria-label={`References of row ${ref}`}
            className={clsx(DETAIL_CELL, 'flex flex-wrap gap-1 px-2 pt-0.5')}
          >
            {item.references.map((reference) => (
              <li
                key={reference}
                className="inline-flex h-6 max-w-full items-center rounded-sm bg-ink-100 px-1.5 text-xs text-ink-700 ring-1 ring-ink-200 ring-inset"
              >
                <span className="truncate">{reference}</span>
              </li>
            ))}
          </ul>
        )}
        {item.guide?.description && (
          <MoreInformation text={item.guide.description} className={clsx(DETAIL_CELL, 'px-2')} />
        )}
        {item.timeHours !== undefined && (
          <p
            className={clsx(
              CONTROLS_CELL,
              'px-2 text-xs text-ink-500 tabular-nums @min-[36rem]:pt-1 @min-[36rem]:text-right',
            )}
          >
            <span className="sr-only">Time: </span>
            {formatHours(item.timeHours)}
          </p>
        )}
      </div>
      {issues && <IssueNote id={`issues-${item.id}`} messages={issues} />}
    </li>
  );
}
