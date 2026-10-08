import { rowLetter, rowRef, sectionNumber, type Section } from '@modig/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { guideRow } from '../../guides/guide';
import { GuideViewer } from '../../guides/GuideViewer';
import type { IssueIndex } from './issues';
import {
  GRID,
  HEADER_FILL,
  ISSUE_OUTLINE,
  REF_CELL,
  ROW_LINE,
  SECTION_HEADER,
  TEXT_CELL,
} from './layout';
import { ColumnLabels, GuideMark, IssueNote, PaperCells, SpareRows } from './parts';

type Props = {
  sections: Section[];
  spareRowsPerSection: number;
  issues: IssueIndex;
};

/**
 * The same sheet without inputs, handles or menus: for inspectors and published revisions. A
 * row's guide icon opens the guide, read-only.
 */
export function ReadOnlyDocument({ sections, spareRowsPerSection, issues }: Props) {
  // The row whose guide is open in the viewer.
  const [guideItemId, setGuideItemId] = useState<string | null>(null);
  const viewing = guideItemId === null ? null : guideRow(sections, guideItemId);
  if (sections.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-500">This checklist has no sections.</p>
    );
  }
  return (
    <>
      <Sections
        sections={sections}
        spareRowsPerSection={spareRowsPerSection}
        issues={issues}
        onOpenGuide={setGuideItemId}
      />
      {viewing?.guide && (
        <GuideViewer
          rowRef={viewing.ref}
          rowText={viewing.text}
          guide={viewing.guide}
          onClose={() => setGuideItemId(null)}
        />
      )}
    </>
  );
}

function Sections({
  sections,
  spareRowsPerSection,
  issues,
  onOpenGuide,
}: Props & { onOpenGuide: (itemId: string) => void }) {
  return sections.map((section, index) => {
    const sectionIssues = issues.sections.get(section.id);
    return (
      <div key={section.id} id={`section-${section.id}`} className="mt-10 first:mt-0">
        <div className={clsx(sectionIssues && ISSUE_OUTLINE)}>
          <div className={clsx(GRID, SECTION_HEADER, sectionIssues ? 'bg-inherit' : HEADER_FILL)}>
            <span className={clsx(REF_CELL, 'font-semibold text-ink-900')}>
              {sectionNumber(index)}
            </span>
            <h2
              className={clsx(TEXT_CELL, 'px-2 py-2 text-[0.9375rem] font-semibold text-ink-900')}
            >
              {section.title || <span className="font-normal text-ink-500">Untitled section</span>}
            </h2>
            <ColumnLabels />
          </div>
          {sectionIssues && <IssueNote id={`issues-${section.id}`} messages={sectionIssues} />}
        </div>
        <ol>
          {section.items.map((item, rowIndex) => {
            const itemIssues = issues.items.get(item.id);
            return (
              <li key={item.id} id={`row-${item.id}`} className={clsx(itemIssues && ISSUE_OUTLINE)}>
                <div className={clsx(GRID, ROW_LINE)}>
                  <span className={clsx(REF_CELL, 'leading-10 text-ink-500')}>
                    {rowLetter(rowIndex)}
                  </span>
                  <div className={clsx(TEXT_CELL, 'items-start')}>
                    <p className="min-w-0 flex-1 px-2 py-2 text-sm leading-6 wrap-break-word text-ink-900">
                      {item.text || <span className="text-ink-500">Empty row</span>}
                    </p>
                    {item.guide && (
                      <GuideMark
                        guide={item.guide}
                        rowRef={rowRef(index, rowIndex)}
                        onOpen={() => onOpenGuide(item.id)}
                      />
                    )}
                  </div>
                  <PaperCells />
                </div>
                {itemIssues && <IssueNote id={`issues-${item.id}`} messages={itemIssues} />}
              </li>
            );
          })}
        </ol>
        <SpareRows start={section.items.length} count={spareRowsPerSection} />
      </div>
    );
  });
}
