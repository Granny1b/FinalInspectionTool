import {
  SEVERITIES,
  SEVERITY_LABELS,
  type InspectionDeviation,
  type Severity,
} from '@modig/shared';
import clsx from 'clsx';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { INPUT } from '../../components/Field';
import { singleLine } from '../templates/document/ops';
import { ChoiceOptions } from './ChoiceOptions';
import type { ExtraDeviationPatch } from './extras';
import { extraDescriptionId } from './issues';

type Props = {
  deviation: InspectionDeviation;
  /** Finalise problem ("needs a description"). */
  issue: string | undefined;
  /** The settings' Responsible list. */
  responsibles: readonly string[];
  /** The settings' deviation categories. */
  categories: readonly string[];
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
};

/**
 * An extra deviation's fields, edited in its card: description, comment, then severity,
 * responsible and category. That is also the Tab order.
 */
export function ExtraDeviationFields({
  deviation,
  issue,
  responsibles,
  categories,
  onUpdate,
}: Props) {
  const issueId = useId();
  const commentId = useId();
  const severityId = useId();
  const respId = useId();
  const categoryId = useId();
  // As stored when the card opened: a value off the list stays on offer after another is picked.
  const [opened] = useState(deviation);
  const { key: id, number } = deviation;
  return (
    // Its own container: the three selects share a line once the text column is wide enough.
    <div className="@container grid gap-3">
      <Labelled htmlFor={extraDescriptionId(id)} label="Description">
        <GrowingText
          id={extraDescriptionId(id)}
          name={`Description, ${number}`}
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
      </Labelled>
      <Labelled htmlFor={commentId} label="Comment">
        <GrowingText
          id={commentId}
          name={`Comment, ${number}`}
          placeholder="Details, measurements, what was agreed"
          maxLength={2000}
          value={deviation.comment}
          onChange={(comment) => onUpdate(id, { comment })}
        />
      </Labelled>
      <div className="grid gap-3 @min-[30rem]:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Labelled htmlFor={severityId} label="Severity">
          <select
            id={severityId}
            aria-label={`Severity, ${number}`}
            value={deviation.severity}
            onChange={(event) => onUpdate(id, { severity: event.target.value as Severity })}
            className={clsx(INPUT, 'h-9')}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled htmlFor={respId} label="Responsible">
          <select
            id={respId}
            aria-label={`Responsible, ${number}`}
            value={deviation.resp}
            onChange={(event) => onUpdate(id, { resp: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          >
            <ChoiceOptions
              list={responsibles}
              value={deviation.resp}
              initial={opened.resp}
              empty="—"
            />
          </select>
        </Labelled>
        <Labelled htmlFor={categoryId} label="Category">
          <select
            id={categoryId}
            aria-label={`Category, ${number}`}
            value={deviation.category}
            onChange={(event) => onUpdate(id, { category: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          >
            <ChoiceOptions
              list={categories}
              value={deviation.category}
              initial={opened.category}
              empty="—"
            />
          </select>
        </Labelled>
      </div>
    </div>
  );
}

/**
 * A visible label. The controls' accessible names add the deviation ("Description, D-03"), so a
 * screen reader moving between cards knows which one it is in.
 */
function Labelled({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-ink-600">
        {label}
      </label>
      {children}
    </div>
  );
}

type GrowingTextProps = {
  id: string;
  /** Accessible name. */
  name: string;
  placeholder: string;
  maxLength: number;
  value: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

/**
 * One line of text that wraps and grows instead of hiding a long description (an invisible copy
 * of the text sizes the field, as in the checklist's comment field). Line breaks become spaces.
 */
function GrowingText({
  id,
  name,
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
      className="grid grid-cols-[minmax(0,1fr)] text-sm leading-5 after:invisible after:col-start-1 after:row-start-1 after:border after:px-3 after:py-2 after:wrap-break-word after:whitespace-pre-wrap after:content-[attr(data-value)_'_']"
    >
      <textarea
        id={id}
        aria-label={name}
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
        className={clsx(INPUT, 'col-start-1 row-start-1 resize-none overflow-hidden py-2')}
      />
    </div>
  );
}
