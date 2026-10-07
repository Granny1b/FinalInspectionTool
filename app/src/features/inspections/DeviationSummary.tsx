import {
  EXTRA_DEVIATION_REF,
  SEVERITIES,
  type InspectionDeviation,
  type Severity,
} from '@modig/shared';
import clsx from 'clsx';
import { CornerDownRight, Plus, Trash2 } from 'lucide-react';
import { memo, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { FIELD } from './checklist/layout';
import { SEVERITY_LABELS } from './checklist/status';
import { ConfirmDialog } from '../templates/document/ConfirmDialog';
import { singleLine } from '../templates/document/ops';
import type { ExtraDeviationPatch } from './extras';
import { extraDescriptionId } from './issues';

type Props = {
  /** NOK rows in checklist order, then extra deviations, numbered D-01… (deriveDeviations). */
  deviations: InspectionDeviation[];
  readOnly: boolean;
  /** Finalise problems of extra deviations ("needs a description"), by id. */
  issues: ReadonlyMap<string, string>;
  respSuggestions: string[];
  onGoToRow: (itemId: string) => void;
  /** Adds an empty extra deviation and focuses its description. */
  onAdd: () => void;
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onRemove: (id: string) => void;
};

const HEAD = 'px-3 py-2.5 font-medium whitespace-nowrap';
const CELL = 'px-3 py-2.5 align-top';

/**
 * The Deviation Summary (brief §5.3): every NOK row and every extra deviation as
 * D-nn | ref | checkpoint | comment | severity | resp, live. A row deviation is edited in its row
 * (the ref jumps there); extra deviations, not tied to a row, are added and edited here.
 * Memoised: the page re-renders on every key, the summary only when a deviation changes.
 */
export const DeviationSummary = memo(function DeviationSummary({
  deviations,
  readOnly,
  issues,
  respSuggestions,
  onGoToRow,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const titleId = useId();
  const respListId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState<InspectionDeviation | null>(null);

  function remove(deviation: InspectionDeviation) {
    onRemove(deviation.key);
    // Its own buttons are gone; carry on from "Add extra deviation".
    addRef.current?.focus();
  }

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={titleId} className="text-base font-semibold text-ink-900">
          Deviation Summary
        </h2>
        <p className="text-sm text-ink-500">
          {deviations.length === 1 ? '1 deviation' : `${deviations.length} deviations`}
        </p>
      </div>

      {deviations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-300 bg-surface px-6 py-10 text-center text-sm text-ink-500">
          No deviations. Rows marked NOK appear here as you mark them
          {readOnly ? '.' : '; findings that aren’t tied to a row can be added below.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
          <table className="w-full min-w-[46rem] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-15" />
              <col className="w-14" />
              <col />
              <col />
              <col className="w-28" />
              <col className="w-36" />
              {!readOnly && <col className="w-11" />}
            </colgroup>
            <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
              <tr>
                <th scope="col" className={HEAD}>
                  No.
                </th>
                <th scope="col" className={HEAD}>
                  Ref
                </th>
                <th scope="col" className={HEAD}>
                  Checkpoint
                </th>
                <th scope="col" className={HEAD}>
                  Comment
                </th>
                <th scope="col" className={HEAD}>
                  Severity
                </th>
                <th scope="col" className={HEAD}>
                  Resp
                </th>
                {!readOnly && (
                  <th scope="col" className={HEAD}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {deviations.map((deviation) =>
                deviation.kind === 'extra' && !readOnly ? (
                  <ExtraRow
                    key={deviation.key}
                    deviation={deviation}
                    issue={issues.get(deviation.key)}
                    respListId={respListId}
                    onUpdate={onUpdate}
                    onRemove={() =>
                      hasText(deviation) ? setConfirming(deviation) : remove(deviation)
                    }
                  />
                ) : (
                  <tr key={deviation.key}>
                    <td className={clsx(CELL, 'font-medium text-ink-900')}>{deviation.number}</td>
                    <td className={CELL}>
                      {deviation.itemId ? (
                        <GoToRow
                          deviationRef={deviation.ref}
                          onClick={() => deviation.itemId && onGoToRow(deviation.itemId)}
                        />
                      ) : (
                        <span className="text-ink-500">{EXTRA_DEVIATION_REF}</span>
                      )}
                    </td>
                    <td className={clsx(CELL, 'wrap-break-word text-ink-900')}>{deviation.text}</td>
                    <td className={clsx(CELL, 'wrap-break-word text-ink-700')}>
                      {deviation.comment}
                    </td>
                    <td className={clsx(CELL, 'text-ink-900')}>
                      {SEVERITY_LABELS[deviation.severity]}
                    </td>
                    <td className={clsx(CELL, 'wrap-break-word text-ink-700')}>{deviation.resp}</td>
                    {!readOnly && <td />}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button ref={addRef} variant="secondary" onClick={onAdd}>
            <Plus size={16} aria-hidden="true" />
            Add extra deviation
          </Button>
          <p className="text-xs text-ink-500">For a finding that isn’t tied to a checklist row.</p>
        </div>
      )}

      {/* One list for every Resp field of the extra deviations. */}
      <datalist id={respListId}>
        {respSuggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      {confirming && (
        <ConfirmDialog
          title={`Remove deviation ${confirming.number}?`}
          message={`“${confirming.text || confirming.comment || confirming.resp}” is removed from the summary.`}
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirming(null);
            remove(confirming);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
});

const hasText = (deviation: InspectionDeviation) =>
  Boolean(deviation.text.trim() || deviation.comment.trim() || deviation.resp.trim());

/** The row's ref as a link to it: switches to the checklist and focuses the row. */
function GoToRow({ deviationRef, onClick }: { deviationRef: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Row ${deviationRef}, go to it in the checklist`}
      title="Go to the row"
      className="inline-flex items-center gap-1 rounded-sm font-medium text-brand-700 underline-offset-2 hover:underline"
    >
      {deviationRef}
      <CornerDownRight size={13} aria-hidden="true" />
    </button>
  );
}

type ExtraRowProps = {
  deviation: InspectionDeviation;
  issue: string | undefined;
  respListId: string;
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onRemove: () => void;
};

/** An extra deviation, edited in place: description, comment, severity, resp. */
function ExtraRow({ deviation, issue, respListId, onUpdate, onRemove }: ExtraRowProps) {
  const issueId = useId();
  const { key: id, number } = deviation;
  return (
    <tr className={issue ? 'bg-nok-bg' : undefined}>
      <td className={clsx(CELL, 'pt-4 font-medium text-ink-900')}>{number}</td>
      <td className={clsx(CELL, 'pt-4 text-ink-500')}>{EXTRA_DEVIATION_REF}</td>
      <td className={CELL}>
        <GrowingText
          id={extraDescriptionId(id)}
          label={`Description, ${number}`}
          placeholder="What was found"
          maxLength={1000}
          value={deviation.text}
          invalid={Boolean(issue)}
          describedBy={issue ? issueId : undefined}
          onChange={(description) => onUpdate(id, { description })}
        />
        {issue && (
          <p id={issueId} className="mt-1 text-xs font-medium text-nok-fg">
            {issue}
          </p>
        )}
      </td>
      <td className={CELL}>
        <GrowingText
          label={`Comment, ${number}`}
          placeholder="Comment"
          maxLength={2000}
          value={deviation.comment}
          onChange={(comment) => onUpdate(id, { comment })}
        />
      </td>
      {/* Fields reach into the cell padding, so their text lines up with the rows above. */}
      <td className={CELL}>
        <div className="-mx-2">
          <select
            aria-label={`Severity, ${number}`}
            value={deviation.severity}
            onChange={(event) => onUpdate(id, { severity: event.target.value as Severity })}
            className={clsx(FIELD, 'h-8')}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className={CELL}>
        <div className="-mx-2">
          <input
            aria-label={`Resp, ${number}`}
            list={respListId}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            placeholder="Resp"
            value={deviation.resp}
            onChange={(event) => onUpdate(id, { resp: event.target.value })}
            className={clsx(FIELD, 'h-8')}
          />
        </div>
      </td>
      <td className={clsx(CELL, 'px-1')}>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${number}`}
          title="Remove"
          className="flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-nok-bg hover:text-nok-fg"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

type GrowingTextProps = {
  id?: string;
  label: string;
  placeholder: string;
  maxLength: number;
  value: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

/**
 * One line of text that wraps and grows instead of hiding a long description (an invisible copy
 * of the text sizes the cell, as in the checklist's comment field). Line breaks become spaces.
 */
function GrowingText({
  id,
  label,
  placeholder,
  maxLength,
  value,
  invalid,
  describedBy,
  onChange,
}: GrowingTextProps) {
  return (
    <div
      data-value={value}
      className="-mx-2 grid grid-cols-[minmax(0,1fr)] text-sm leading-5 after:invisible after:col-start-1 after:row-start-1 after:border after:px-2 after:py-1.5 after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_']"
    >
      <textarea
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        rows={1}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(singleLine(event.target.value))}
        // One line, as on paper: Enter never inserts a line break.
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
        className={clsx(
          FIELD,
          'col-start-1 row-start-1 resize-none overflow-hidden py-1.5 aria-invalid:border-b-nok-fg',
        )}
      />
    </div>
  );
}
