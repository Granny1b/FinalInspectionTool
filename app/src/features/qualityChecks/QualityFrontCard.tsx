import type { QualityFront, Template } from '@modig/shared';
import clsx from 'clsx';
import { memo, useId, useMemo, type ReactNode } from 'react';
import { DateInput } from '../../components/DateInput';
import { Field, INPUT } from '../../components/Field';
import { formatDateTime } from '../../lib/format';
import { nameSuggestions, usePeopleDirectory, usePersonName } from '../../lib/usePeople';
import { Detail, FrontPageFrame } from '../templates/FrontPage';

/** The name input; publish problems about the name jump here. */
export const QUALITY_NAME_ID = 'quality-name';

type Props = {
  front: QualityFront;
  /** The revision the draft will be published as. */
  revision: number;
  /** The settings' Responsible list: the departments to choose from. */
  departments: readonly string[] | undefined;
  /** Shown while publish problems are highlighted and the name is blank. */
  nameError: string | undefined;
  onChange: (patch: Partial<QualityFront>) => void;
};

/**
 * A quality check's front page, edited in place: its Name (the in-process check, "Pre start up";
 * the check is called "Quality check – Pre start up"), Department, Document no., Made by and Date. Memoised: the editor re-renders on
 * every keystroke in the checklist.
 */
export const QualityFrontCard = memo(function QualityFrontCard({
  front,
  revision,
  departments,
  nameError,
  onChange,
}: Props) {
  const directory = usePeopleDirectory();
  const peopleId = useId();
  const people = useMemo(() => nameSuggestions(directory.data, []), [directory.data]);
  // A department stored before it left the list stays selectable, as on a deviation.
  const departmentOptions = useMemo(() => {
    const list = [...(departments ?? [])];
    if (front.department && !list.includes(front.department)) list.push(front.department);
    return list;
  }, [departments, front.department]);
  const listed = (department: string) => !departments || departments.includes(department);

  return (
    <FrontPageFrame revisionLabel={`Draft – Rev ${revision}`} layout="fields">
      <Field id={QUALITY_NAME_ID} label="Name" hint="E.g. Pre start up" error={nameError}>
        {(control) => (
          <input
            {...control}
            maxLength={200}
            value={front.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <Field label="Department">
        {(control) => (
          <select
            {...control}
            value={front.department}
            onChange={(event) => onChange({ department: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          >
            <option value="">Not set</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
                {listed(department) ? '' : ' (not in the list)'}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Document no.">
        {(control) => (
          <input
            {...control}
            maxLength={100}
            value={front.documentNumber}
            onChange={(event) => onChange({ documentNumber: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <Field label="Made by">
        {(control) => (
          <>
            <input
              {...control}
              maxLength={200}
              autoComplete="off"
              list={people.length > 0 ? peopleId : undefined}
              value={front.madeBy}
              onChange={(event) => onChange({ madeBy: event.target.value })}
              className={clsx(INPUT, 'h-9')}
            />
            {people.length > 0 && (
              <datalist id={peopleId}>
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
          </>
        )}
      </Field>
      <Field label="Date">
        {(control) => (
          <DateInput
            {...control}
            value={front.date}
            clearable
            onChange={(date) => onChange({ date })}
          />
        )}
      </Field>
    </FrontPageFrame>
  );
});

/** A published quality check's front page, read-only. */
export function PublishedQualityFront({ template }: { template: Template }) {
  const personName = usePersonName();
  const front = template.quality;
  const value = (text: string | undefined): ReactNode =>
    text?.trim() ? text : <span className="text-ink-500">—</span>;
  return (
    <FrontPageFrame revisionLabel={`Rev: ${template.revision}`} layout="fields" details>
      <Detail label="Name">{value(front?.name)}</Detail>
      <Detail label="Department">{value(front?.department)}</Detail>
      <Detail label="Document no.">{value(front?.documentNumber)}</Detail>
      <Detail label="Made by">{value(front?.madeBy)}</Detail>
      <Detail label="Date">{value(front?.date)}</Detail>
      <Detail label="Published">
        {formatDateTime(template.updatedAt)}
        <span className="block truncate text-ink-500" title={template.updatedBy}>
          {personName(template.updatedBy)}
        </span>
      </Detail>
      {template.changeNote && (
        <Detail label="Change note">
          <span className="whitespace-pre-line">{template.changeNote}</span>
        </Detail>
      )}
    </FrontPageFrame>
  );
}
