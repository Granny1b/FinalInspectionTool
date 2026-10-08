import { sectionNumber, type Section } from '@modig/shared';
import clsx from 'clsx';
import { CheckCheck } from 'lucide-react';
import { memo } from 'react';
import { ChecklistRow } from './ChecklistRow';
import { CONTROL_HEIGHT } from './layout';
import { rowsWithoutStatus, type Results } from './results';
import { SectionHeader } from './SectionHeader';
import type { ChecklistActions } from './useChecklistActions';

type Props = {
  section: Section;
  index: number;
  /** All results; the section only re-renders when one of its own rows changed. */
  results: Results;
  rowIssues: ReadonlyMap<string, string>;
  respListId: string;
  actions: ChecklistActions;
};

export const ChecklistSection = memo(function ChecklistSection({
  section,
  index,
  results,
  rowIssues,
  respListId,
  actions,
}: Props) {
  const number = sectionNumber(index);
  const remaining = rowsWithoutStatus(section, results);
  return (
    <div id={`section-${section.id}`} className="mt-8 first:mt-0">
      <SectionHeader number={number} title={section.title}>
        {/*
          Not a Tab stop: Tab from a section's last row goes on to the next section's first row,
          and R on a row does the same as this button. aria-disabled, not disabled, when every
          row has a status: disabled would drop the focus it took from a click.
        */}
        <button
          type="button"
          tabIndex={-1}
          aria-disabled={remaining === 0 || undefined}
          aria-label={`Set remaining to OK in section ${number} (${
            remaining === 1 ? '1 row' : `${remaining} rows`
          })`}
          title={
            remaining === 0
              ? 'Every row in this section has a status'
              : 'Set remaining to OK · R on a row'
          }
          onClick={() => actions.setRemainingOk(section.id)}
          className={clsx(
            'inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-ink-500/80 bg-surface px-2.5 text-xs font-medium whitespace-nowrap text-ink-800 shadow-xs transition-colors',
            CONTROL_HEIGHT,
            remaining === 0
              ? 'cursor-default opacity-50'
              : 'hover:border-ok-fg hover:bg-ok-bg hover:text-ok-fg',
          )}
        >
          <CheckCheck size={15} aria-hidden="true" />
          Set remaining to OK
        </button>
      </SectionHeader>
      {section.items.map((item, rowIndex) => (
        <ChecklistRow
          key={item.id}
          item={item}
          sectionIndex={index}
          rowIndex={rowIndex}
          result={results[item.id]}
          issue={rowIssues.get(item.id)}
          respListId={respListId}
          actions={actions}
        />
      ))}
    </div>
  );
}, sameSection);

/** Re-render a section only when something it shows changed: typing touches one section. */
function sameSection(previous: Props, next: Props): boolean {
  return (
    previous.section === next.section &&
    previous.index === next.index &&
    previous.respListId === next.respListId &&
    previous.actions === next.actions &&
    next.section.items.every(
      (item) =>
        previous.results[item.id] === next.results[item.id] &&
        previous.rowIssues.get(item.id) === next.rowIssues.get(item.id),
    )
  );
}
