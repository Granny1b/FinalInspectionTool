import {
  DEFAULT_SEVERITY,
  formatHours,
  MAX_PHOTOS_PER_DEVIATION,
  refWithText,
  rowRef,
  SEVERITIES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Item,
  type RowResult,
  type Severity,
  type Status,
} from '@modig/shared';
import clsx from 'clsx';
import { Images } from 'lucide-react';
import { memo, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { INPUT } from '../../../components/Field';
import { AnnotatedPhotos } from '../../annotate/AnnotatedPhotos';
import { MoreInformation } from '../../qualityChecks/MoreInformation';
import { PictureTile } from '../../qualityChecks/PictureTile';
import { singleLine } from '../../templates/document/ops';
import { IssueNote } from '../../templates/document/parts';
import { photoCountText } from '../deviations';
import { ChoiceOptions } from '../ChoiceOptions';
import { fieldCommand, rowCommand, type RowField } from '../checklist/keys';
import { ISSUE_OUTLINE, NOK_BAR, ROW_FOCUS } from '../checklist/layout';
import { StatusMark } from '../checklist/parts';
import { STATUS_ICONS, STATUS_TONES } from '../checklist/status';
import type { ChecklistActions } from '../checklist/useChecklistActions';
import { CARD, CARD_CELL, CARD_GRID, FIELD_LABEL, STATUS_BUTTON_HEIGHT } from './layout';

type Props = {
  item: Item;
  sectionIndex: number;
  rowIndex: number;
  result: RowResult | undefined;
  /** Finalise problem on this row ("Row 1.c has no status."). */
  issue: string | undefined;
  responsibles: readonly string[];
  categories: readonly string[];
  /** Null once finalised: the card is read-only. */
  actions: ChecklistActions | null;
  /** Opens the row's pictures and more information (read-only cards too). */
  onShowGuide: (itemId: string) => void;
  /** A deviation photo open in the editor has marks not saved yet. */
  onEditorDirtyChange: (dirty: boolean) => void;
};

/** The selects and the comment: as high as a finger needs on a touch screen, compact with a mouse. */
const CONTROL = clsx(INPUT, 'h-11 @min-[52rem]:pointer-fine:h-9');

/**
 * One row of a quality check being done, as a card: the first picture on the left (a click shows
 * them all with the row's more information), the ref and What, How and the references; then OK /
 * NOK / N/A as large buttons and the comment. A NOK row opens the deviation's fields: responsible,
 * category, severity and up to two photos, added right here. The card itself is focusable and
 * takes the inspection's keys (1/2/3, arrows, C, G, R); Tab goes on into its fields. Memoised: a
 * change re-renders only the card it touches.
 */
export const QualityCheckRow = memo(function QualityCheckRow({
  item,
  sectionIndex,
  rowIndex,
  result,
  issue,
  responsibles,
  categories,
  actions,
  onShowGuide,
  onEditorDirtyChange,
}: Props) {
  const ref = rowRef(sectionIndex, rowIndex);
  const status = result?.status;
  const nok = status === 'NOK';
  // As stored when the page opened: a value off the list stays on offer after another is picked.
  const [opened] = useState(result);
  const photos = nok ? (result?.photos ?? []) : [];
  const statusId = useId();
  const issueId = useId();
  const editable = actions !== null;

  function showGuide() {
    // The card first: the viewer gives the focus back to it, ready for the next key.
    actions?.focusRow(item.id);
    onShowGuide(item.id);
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys typed in the fields inside the card are theirs.
    if (!actions || event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
    const command = rowCommand(event);
    if (!command) return;
    event.preventDefault();
    if (command.kind === 'none') return;
    if (command.kind === 'guide') {
      if (item.guide) onShowGuide(item.id);
      return;
    }
    actions.run(item.id, command);
  }

  function onFieldKeyDown(field: RowField) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (!actions || event.nativeEvent.isComposing) return;
      const command = fieldCommand(event, field);
      if (!command) return;
      event.preventDefault();
      if (command === 'row') actions.focusRow(item.id);
      else actions.finishRow(item.id);
    };
  }

  return (
    <li>
      <div
        id={`row-${item.id}`}
        role="group"
        tabIndex={editable ? 0 : -1}
        aria-label={`Row ${refWithText(ref, item.text)}`}
        aria-describedby={issue ? `${statusId} ${issueId}` : statusId}
        onKeyDown={onCardKeyDown}
        className={clsx(
          CARD,
          ROW_FOCUS,
          nok && clsx(NOK_BAR, 'before:rounded-l-lg'),
          issue ? ISSUE_OUTLINE : nok ? 'border-nok-border' : 'border-ink-200',
          !issue && editable && 'focus-within:border-ink-300',
        )}
      >
        {/* Read when the card takes the focus; hidden, so browse mode doesn't read it twice. */}
        <span id={statusId} hidden>
          {status ? `Status ${STATUS_LABELS[status]}` : 'No status'}
          {photos.length > 0 && `, ${photoCountText(photos.length)}`}
        </span>
        <div className={CARD_GRID}>
          {item.guide ? (
            <div className={nok ? CARD_CELL.pictureNok : CARD_CELL.picture}>
              <PictureTile guide={item.guide} rowRef={ref} onOpen={showGuide} editable={false} />
            </div>
          ) : (
            // The pictures' column stays on a tablet or PC, so every row's text starts in one line;
            // on a phone the text takes its place.
            <div
              aria-hidden="true"
              className={clsx(
                nok ? CARD_CELL.pictureNok : CARD_CELL.picture,
                'hidden @min-[34rem]:block',
              )}
            />
          )}

          <div className={item.guide ? CARD_CELL.text : CARD_CELL.textAlone}>
            <p className="flex items-start gap-2">
              <span className="w-8 shrink-0 text-sm leading-6 font-semibold text-ink-900 tabular-nums">
                {ref}
              </span>
              <span className="min-w-0 text-[0.9375rem] leading-6 font-semibold wrap-break-word text-ink-900">
                {item.text}
              </span>
            </p>
            <div className="space-y-1 pl-10">
              {item.how && (
                <p className="text-sm leading-5 wrap-break-word whitespace-pre-line text-ink-700">
                  <span className="sr-only">How: </span>
                  {item.how}
                </p>
              )}
              {(item.references?.length || item.timeHours !== undefined) && (
                <p className="flex flex-wrap gap-x-3 text-xs leading-5 text-ink-500">
                  {item.references && item.references.length > 0 && (
                    <span className="wrap-break-word">
                      <span className="sr-only">References: </span>
                      {item.references.join(' · ')}
                    </span>
                  )}
                  {item.timeHours !== undefined && (
                    <span className="tabular-nums">
                      <span className="sr-only">Time: </span>
                      {formatHours(item.timeHours)}
                    </span>
                  )}
                </p>
              )}
              {item.guide?.description && <MoreInformation text={item.guide.description} />}
              {item.guide && (
                // Not a Tab stop in an editable card (G on the card does the same); the only way
                // in on a read-only one.
                <button
                  type="button"
                  tabIndex={editable ? -1 : undefined}
                  aria-keyshortcuts={editable ? 'G' : undefined}
                  onClick={showGuide}
                  className="-mx-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 hover:text-brand-800 pointer-coarse:min-h-11"
                >
                  <Images size={15} aria-hidden="true" />
                  Pictures and information
                </button>
              )}
            </div>
          </div>

          <div className={CARD_CELL.controls}>
            {actions ? (
              <div className="space-y-2">
                <StatusButtons
                  status={status}
                  rowRef={ref}
                  onPick={(next) => actions.pick(item.id, next)}
                />
                <CommentField
                  itemId={item.id}
                  rowRef={ref}
                  nok={nok}
                  value={result?.comment ?? ''}
                  onChange={(value) => actions.setText(item.id, 'comment', value)}
                  onKeyDown={onFieldKeyDown('comment')}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <StatusMark status={status} />
                {result?.comment && (
                  <p className="text-sm leading-5 wrap-break-word text-ink-800">
                    <span className="font-medium text-ink-500">Comment: </span>
                    {result.comment}
                  </p>
                )}
              </div>
            )}
          </div>

          {nok && (
            <div className={CARD_CELL.deviation}>
              {actions ? (
                <div className="grid gap-3 @min-[34rem]:grid-cols-3">
                  <Choice label="Responsible">
                    <select
                      data-resp={item.id}
                      aria-label={`Responsible, row ${ref}`}
                      value={result?.resp ?? ''}
                      onChange={(event) => actions.setText(item.id, 'resp', event.target.value)}
                      onKeyDown={onFieldKeyDown('resp')}
                      className={CONTROL}
                    >
                      <ChoiceOptions
                        list={responsibles}
                        value={result?.resp ?? ''}
                        initial={opened?.resp}
                        empty="—"
                      />
                    </select>
                  </Choice>
                  <Choice label="Category">
                    <select
                      data-category={item.id}
                      aria-label={`Category, row ${ref}`}
                      value={result?.category ?? ''}
                      onChange={(event) => actions.setCategory(item.id, event.target.value)}
                      onKeyDown={onFieldKeyDown('category')}
                      className={CONTROL}
                    >
                      <ChoiceOptions
                        list={categories}
                        value={result?.category ?? ''}
                        initial={opened?.category}
                        empty="—"
                      />
                    </select>
                  </Choice>
                  <Choice label="Severity">
                    <select
                      aria-label={`Severity, row ${ref}`}
                      value={result?.severity ?? DEFAULT_SEVERITY}
                      onChange={(event) =>
                        actions.setSeverity(item.id, event.target.value as Severity)
                      }
                      onKeyDown={onFieldKeyDown('severity')}
                      className={CONTROL}
                    >
                      {SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>
                          {SEVERITY_LABELS[severity]}
                        </option>
                      ))}
                    </select>
                  </Choice>
                </div>
              ) : (
                <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm leading-5 text-ink-800">
                  <ReadValue label="Responsible" value={result?.resp} />
                  <ReadValue label="Category" value={result?.category} />
                  <ReadValue
                    label="Severity"
                    value={SEVERITY_LABELS[result?.severity ?? DEFAULT_SEVERITY]}
                  />
                </p>
              )}
              {(actions || photos.length > 0) && (
                <div className="mt-3">
                  <p className={clsx(FIELD_LABEL, 'mb-1.5')}>
                    Photos
                    {actions && (
                      <span className="ml-2 font-normal tabular-nums">
                        {photos.length} / {MAX_PHOTOS_PER_DEVIATION}
                      </span>
                    )}
                  </p>
                  <AnnotatedPhotos
                    photos={photos}
                    onChange={actions ? (next) => actions.setPhotos(item.id, next) : undefined}
                    max={MAX_PHOTOS_PER_DEVIATION}
                    label={`Photos of row ${ref}`}
                    onDirtyChange={onEditorDirtyChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {issue && <IssueNote id={issueId} messages={[issue]} />}
    </li>
  );
});

type StatusButtonsProps = {
  status: Status | undefined;
  rowRef: string;
  onPick: (status: Status) => void;
};

/**
 * OK / NOK / N/A as three large toggle buttons (pressed when chosen; pressing it again clears the
 * status), big enough for a finger on a tablet. Not Tab stops, as in a final inspection: the keys
 * set the status on the focused card, and Tab goes from the card to its comment. The chosen one
 * takes its status colour; a NOK is filled red.
 */
function StatusButtons({ status, rowRef: ref, onPick }: StatusButtonsProps) {
  return (
    <div role="group" aria-label={`Status, row ${ref}`} className="grid grid-cols-3 gap-1.5">
      {STATUSES.map((option) => {
        const Icon = STATUS_ICONS[option];
        const selected = option === status;
        return (
          <button
            key={option}
            type="button"
            tabIndex={-1}
            aria-pressed={selected}
            data-status={option}
            onClick={() => onPick(option)}
            className={clsx(
              'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border text-[0.9375rem] font-semibold transition-colors',
              STATUS_BUTTON_HEIGHT,
              selected
                ? option === 'NOK'
                  ? 'border-nok-solid bg-nok-solid text-white'
                  : clsx('border-transparent ring-2 ring-inset', STATUS_TONES[option])
                : 'border-ink-300 bg-surface text-ink-700 hover:border-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:border-ink-400',
            )}
          >
            <Icon size={16} strokeWidth={selected ? 3 : 2} aria-hidden="true" />
            {STATUS_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

type CommentFieldProps = {
  itemId: string;
  rowRef: string;
  nok: boolean;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * The comment: one line that wraps and grows instead of hiding a long comment (an invisible copy
 * of the text sizes it). A NOK row asks what is wrong. Line breaks become spaces; Enter goes on
 * to the next row.
 */
function CommentField({ itemId, rowRef: ref, nok, value, onChange, onKeyDown }: CommentFieldProps) {
  return (
    <div
      data-value={value}
      className="grid grid-cols-[minmax(0,1fr)] text-sm leading-5 after:invisible after:col-start-1 after:row-start-1 after:border after:px-3 after:py-[0.6875rem] after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_'] @min-[52rem]:pointer-fine:after:py-[0.4375rem]"
    >
      <textarea
        data-comment={itemId}
        aria-label={`Comment, row ${ref}`}
        rows={1}
        maxLength={2000}
        enterKeyHint="next"
        placeholder={nok ? 'What is wrong?' : 'Comment'}
        value={value}
        onChange={(event) => onChange(singleLine(event.target.value))}
        onKeyDown={onKeyDown}
        className={clsx(
          INPUT,
          'col-start-1 row-start-1 resize-none overflow-hidden py-[0.6875rem] @min-[52rem]:pointer-fine:py-[0.4375rem]',
          nok && !value && 'border-nok-fg dark:border-nok-fg',
        )}
      />
    </div>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    // The select has its own accessible name (with the row's ref); this label is what is seen.
    <label className="block min-w-0">
      <span aria-hidden="true" className={clsx(FIELD_LABEL, 'mb-1')}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ReadValue({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span className="wrap-break-word">
      <span className="font-medium text-ink-500">{label}: </span>
      {value || '—'}
    </span>
  );
}
