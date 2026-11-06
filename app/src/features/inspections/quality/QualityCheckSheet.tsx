import { sectionNumber, type FinaliseIssue, type RowResult, type Section } from '@modig/shared';
import clsx from 'clsx';
import { CheckCheck } from 'lucide-react';
import { memo, useMemo, useRef, useState, type JSX } from 'react';
import { guideRow } from '../../guides/guide';
import { GuideViewer } from '../../guides/GuideViewer';
import { QUALITY_GUIDE_WORDING } from '../../guides/wording';
import { sectionStats } from '../../qualityChecks/stats';
import { rowsWithoutStatus, type Results } from '../checklist/results';
import { useChecklistActions, type ChecklistActions } from '../checklist/useChecklistActions';
import { QualityCheckRow } from './QualityCheckRow';

/** One empty list while the settings load, so memoised rows see the same one. */
const NONE: readonly string[] = [];
const NOTHING = () => undefined;

type Props = {
  sections: Section[];
  results: Record<string, RowResult>;
  /** Omit for read-only (a finalised quality check). */
  onChange?: (results: Record<string, RowResult>) => void;
  /** The settings' Responsible list and deviation categories, offered on NOK rows. */
  responsibles?: readonly string[];
  categories?: readonly string[];
  /** Finalise problems to highlight (rows without a status). */
  issues?: FinaliseIssue[];
  /** A deviation photo open in the editor has marks not saved yet (the page's leave guard). */
  onEditorDirtyChange: (dirty: boolean) => void;
};

/**
 * A quality check being done: each section under a header with its rows and time, each row a card
 * (QualityCheckRow) with its pictures, what and how to check, and large OK / NOK / N/A buttons for
 * a tablet. The keys of a final inspection work here too (rowCommand): 1/2/3, arrows, C, G, R,
 * Tab into a card's fields, Enter to the next row. A row's pictures open read-only, as frozen in
 * the check.
 *
 * DOM hooks, as the final inspection's sheet: each section root has `id="section-{sectionId}"`,
 * each card `id="row-{itemId}"` (focusable), its comment `data-comment={itemId}`.
 */
export function QualityCheckSheet({
  sections,
  results,
  onChange,
  responsibles = NONE,
  categories = NONE,
  issues,
  onEditorDirtyChange,
}: Props): JSX.Element {
  // A primitive per row, so rows stay memoised when the page recomputes the issues on each change.
  const rowIssues = useMemo(() => {
    const byRow = new Map<string, string>();
    for (const { target, message } of issues ?? []) {
      if (target.kind !== 'row') continue;
      const previous = byRow.get(target.itemId);
      byRow.set(target.itemId, previous ? `${previous} ${message}` : message);
    }
    return byRow;
  }, [issues]);
  const [announcement, setAnnouncement] = useState('');
  const [guideItemId, setGuideItemId] = useState<string | null>(null);
  const guiding = guideItemId === null ? null : guideRow(sections, guideItemId);
  const rootRef = useRef<HTMLDivElement>(null);
  const actions = useChecklistActions({
    sections,
    results,
    onChange: onChange ?? NOTHING,
    rootRef,
    announce: setAnnouncement,
    // Photos are added on the card itself.
    onShowPhotos: NOTHING,
    onShowGuide: setGuideItemId,
  });

  return (
    // The cards adapt to the sheet's own width (container queries), not the viewport's.
    <div className="@container">
      <div ref={rootRef} className="space-y-6">
        {sections.length === 0 ? (
          <p className="rounded-lg border border-ink-200 bg-surface py-12 text-center text-sm text-ink-500">
            This quality check has no rows.
          </p>
        ) : (
          sections.map((section, index) => (
            <QualityCheckSection
              key={section.id}
              section={section}
              index={index}
              results={results}
              rowIssues={rowIssues}
              responsibles={responsibles}
              categories={categories}
              actions={onChange ? actions : null}
              onShowGuide={setGuideItemId}
              onEditorDirtyChange={onEditorDirtyChange}
            />
          ))
        )}
      </div>
      {guiding?.guide && (
        <GuideViewer
          rowRef={guiding.ref}
          rowText={guiding.text}
          guide={guiding.guide}
          wording={QUALITY_GUIDE_WORDING}
          onClose={() => setGuideItemId(null)}
        />
      )}
      {/* Status changes are read out ("1.c NOK"): the focus has usually moved on already. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type SectionProps = {
  section: Section;
  index: number;
  /** All results; the section only re-renders when one of its own rows changed. */
  results: Results;
  rowIssues: ReadonlyMap<string, string>;
  responsibles: readonly string[];
  categories: readonly string[];
  actions: ChecklistActions | null;
  onShowGuide: (itemId: string) => void;
  onEditorDirtyChange: (dirty: boolean) => void;
};

/**
 * A section: a header with its number and title, its rows and time ("5 rows · 0.8 h"), how many
 * are done and Set remaining to OK, over its row cards.
 */
const QualityCheckSection = memo(function QualityCheckSection({
  section,
  index,
  results,
  rowIssues,
  responsibles,
  categories,
  actions,
  onShowGuide,
  onEditorDirtyChange,
}: SectionProps) {
  const number = sectionNumber(index);
  const remaining = rowsWithoutStatus(section, results);
  const total = section.items.length;
  const titleId = `section-title-${section.id}`;
  return (
    <section
      id={`section-${section.id}`}
      aria-labelledby={titleId}
      className="overflow-hidden rounded-lg border border-ink-200 bg-ink-50 shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 @min-[34rem]:px-4">
        <h3
          id={titleId}
          className="flex min-w-0 flex-1 basis-60 items-baseline gap-3 text-base font-semibold text-ink-900"
        >
          <span className="tabular-nums">{number}</span>
          <span className="min-w-0 wrap-break-word">
            <span className="sr-only">Section {number}: </span>
            {section.title || <span className="font-normal text-ink-500">Untitled section</span>}
          </span>
        </h3>
        {total > 0 && (
          <p className="flex items-center gap-x-3 text-xs text-ink-500 tabular-nums">
            <span>{sectionStats(section.items)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {total - remaining} / {total} done
            </span>
          </p>
        )}
        {actions && total > 0 && (
          // Not a Tab stop, as in a final inspection: R on a card does the same. aria-disabled,
          // not disabled, when every row has a status: disabled would drop a click's focus.
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
              'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-ink-500/80 bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink-800 shadow-xs transition-colors dark:border-ink-400 pointer-coarse:h-11',
              remaining === 0
                ? 'cursor-default opacity-50'
                : 'hover:border-ok-fg hover:bg-ok-bg hover:text-ok-fg',
            )}
          >
            <CheckCheck size={15} aria-hidden="true" />
            Set remaining to OK
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="border-t border-ink-200 bg-surface px-4 py-4 text-sm text-ink-500">
          No checkpoints in this section yet.
        </p>
      ) : (
        <ol className="space-y-2.5 border-t border-ink-200 p-2 @min-[34rem]:p-3">
          {section.items.map((item, rowIndex) => (
            <QualityCheckRow
              key={item.id}
              item={item}
              sectionIndex={index}
              rowIndex={rowIndex}
              result={results[item.id]}
              issue={rowIssues.get(item.id)}
              responsibles={responsibles}
              categories={categories}
              actions={actions}
              onShowGuide={onShowGuide}
              onEditorDirtyChange={onEditorDirtyChange}
            />
          ))}
        </ol>
      )}
    </section>
  );
}, sameSection);

/** Re-render a section only when something it shows changed: a key press touches one section. */
function sameSection(previous: SectionProps, next: SectionProps): boolean {
  return (
    previous.section === next.section &&
    previous.index === next.index &&
    previous.responsibles === next.responsibles &&
    previous.categories === next.categories &&
    previous.actions === next.actions &&
    previous.onShowGuide === next.onShowGuide &&
    previous.onEditorDirtyChange === next.onEditorDirtyChange &&
    next.section.items.every(
      (item) =>
        previous.results[item.id] === next.results[item.id] &&
        previous.rowIssues.get(item.id) === next.rowIssues.get(item.id),
    )
  );
}
