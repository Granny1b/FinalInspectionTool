import {
  DEFAULT_SEVERITY,
  refWithText,
  rowLetter,
  rowRef,
  SEVERITIES,
  SEVERITY_LABELS,
  STATUS_LABELS,
  type Item,
  type RowResult,
  type Severity,
} from '@modig/shared';
import clsx from 'clsx';
import { memo, useId, type KeyboardEvent } from 'react';
import { singleLine } from '../../templates/document/ops';
import { IssueNote } from '../../templates/document/parts';
import { photoCountText } from '../deviations';
import { fieldCommand, rowCommand, type RowField } from './keys';
import {
  CELL,
  CONTROL_HEIGHT,
  FIELD,
  GRID,
  ISSUE_OUTLINE,
  NOK_BAR,
  ROW_FOCUS,
  ROW_LINE,
} from './layout';
import { GuideButton, PhotoCount, StatusControl } from './parts';
import type { ChecklistActions } from './useChecklistActions';

type Props = {
  item: Item;
  sectionIndex: number;
  rowIndex: number;
  result: RowResult | undefined;
  /** Finalise problem on this row ("Row 3.c has no status."). */
  issue: string | undefined;
  /** The one `<datalist>` of resp suggestions the sheet renders. */
  respListId: string;
  actions: ChecklistActions;
};

/**
 * One checkpoint, filled in. The row itself is focusable: status keys work on it, and Tab goes on
 * into its comment, resp and (NOK) severity, then the next row. Memoised: a change re-renders
 * only the row it touches.
 */
export const ChecklistRow = memo(function ChecklistRow({
  item,
  sectionIndex,
  rowIndex,
  result,
  issue,
  respListId,
  actions,
}: Props) {
  const ref = rowRef(sectionIndex, rowIndex);
  const status = result?.status;
  // Photos belong to the row's deviation, so they count only while it is NOK.
  const photos = status === 'NOK' ? (result?.photos?.length ?? 0) : 0;
  const statusId = useId();
  const issueId = useId();

  function onRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys typed in the fields inside the row are theirs.
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
    const command = rowCommand(event);
    if (!command) return;
    event.preventDefault();
    if (command.kind === 'none') return;
    if (command.kind === 'guide') {
      // The viewer gives the focus back to this row when it closes.
      if (item.guide) actions.showGuide(item.id);
      return;
    }
    actions.run(item.id, command);
  }

  function onFieldKeyDown(field: RowField) {
    return (event: KeyboardEvent<HTMLElement>) => {
      if (event.nativeEvent.isComposing) return;
      const command = fieldCommand(event, field);
      if (!command) return;
      event.preventDefault();
      if (command === 'row') actions.focusRow(item.id);
      else actions.finishRow(item.id);
    };
  }

  return (
    <div
      id={`row-${item.id}`}
      role="group"
      tabIndex={0}
      aria-label={`Row ${refWithText(ref, item.text)}`}
      aria-describedby={issue ? `${statusId} ${issueId}` : statusId}
      onKeyDown={onRowKeyDown}
      className={clsx(
        // Look-ahead: moving down keeps about one more row in view below the focused one.
        'relative scroll-mt-2 scroll-mb-20',
        ROW_FOCUS,
        status === 'NOK' && NOK_BAR,
        issue ? ISSUE_OUTLINE : 'focus-within:bg-ink-50 focus:bg-brand-50',
      )}
    >
      {/* Read when the row takes the focus; hidden, so browse mode doesn't read the status twice. */}
      <span id={statusId} hidden>
        {status ? `Status ${STATUS_LABELS[status]}` : 'No status'}
        {photos > 0 && `, ${photoCountText(photos)}`}
      </span>
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
              onClick={() => {
                // The row first: the viewer gives the focus back to it, ready for the next key.
                actions.focusRow(item.id);
                actions.showGuide(item.id);
              }}
            />
          )}
        </div>
        <div className={CELL.status}>
          <StatusControl
            status={status}
            rowRef={ref}
            onPick={(next) => actions.pick(item.id, next)}
          />
        </div>
        <div className={CELL.comment}>
          <CommentField
            itemId={item.id}
            rowRef={ref}
            value={result?.comment ?? ''}
            onChange={(value) => actions.setText(item.id, 'comment', value)}
            onKeyDown={onFieldKeyDown('comment')}
          />
        </div>
        <div className={CELL.resp}>
          <input
            data-resp={item.id}
            aria-label={`Resp, row ${ref}`}
            list={respListId}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={200}
            placeholder="Resp"
            value={result?.resp ?? ''}
            onChange={(event) => actions.setText(item.id, 'resp', event.target.value)}
            onKeyDown={onFieldKeyDown('resp')}
            className={clsx(FIELD, CONTROL_HEIGHT)}
          />
        </div>
        {status === 'NOK' && (
          <label className={clsx(CELL.severity, 'flex items-center gap-2')}>
            <span className="text-xs font-medium text-nok-fg">Severity</span>
            <select
              aria-label={`Severity, row ${ref}`}
              value={result?.severity ?? DEFAULT_SEVERITY}
              onChange={(event) => actions.setSeverity(item.id, event.target.value as Severity)}
              onKeyDown={onFieldKeyDown('severity')}
              className={clsx(FIELD, CONTROL_HEIGHT, 'flex-1')}
            >
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABELS[severity]}
                </option>
              ))}
            </select>
          </label>
        )}
        {status === 'NOK' && (
          <div className={clsx(CELL.photos, 'flex items-center')}>
            <PhotoCount count={photos} rowRef={ref} onClick={() => actions.showPhotos(item.id)} />
          </div>
        )}
      </div>
      {issue && <IssueNote id={issueId} messages={[issue]} />}
    </div>
  );
});

type CommentFieldProps = {
  itemId: string;
  rowRef: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * One line of text, like the paper's comment cell, that wraps and grows instead of hiding a long
 * comment: an invisible copy of the text sizes the grid cell. Line breaks become spaces.
 */
function CommentField({ itemId, rowRef, value, onChange, onKeyDown }: CommentFieldProps) {
  return (
    <div
      data-value={value}
      className="grid grid-cols-[minmax(0,1fr)] text-sm leading-5 after:invisible after:col-start-1 after:row-start-1 after:border after:px-2 after:py-[0.6875rem] after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_'] @min-[56rem]:pointer-fine:after:py-[0.3125rem]"
    >
      <textarea
        data-comment={itemId}
        aria-label={`Comment, row ${rowRef}`}
        rows={1}
        maxLength={2000}
        enterKeyHint="next"
        placeholder="Comment"
        value={value}
        onChange={(event) => onChange(singleLine(event.target.value))}
        onKeyDown={onKeyDown}
        className={clsx(
          FIELD,
          'col-start-1 row-start-1 resize-none overflow-hidden py-[0.6875rem] @min-[56rem]:pointer-fine:py-[0.3125rem]',
        )}
      />
    </div>
  );
}
