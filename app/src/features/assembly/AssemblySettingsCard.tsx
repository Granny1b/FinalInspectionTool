import {
  formatMinutes,
  stepDepartments,
  totalMinutes,
  type Section,
  type TemplateDraftInput,
} from '@modig/shared';
import clsx from 'clsx';
import { memo } from 'react';
import { Field, INPUT } from '../../components/Field';
import { TEMPLATE_NAME_ID } from '../templates/TemplateSettingsCard';

type Props = {
  name: string;
  /** The machine model it was written for, which it keeps. */
  modelName: string;
  modelCode: string;
  /** The revision the draft will be published as. */
  revision: number;
  sections: Section[];
  /** Shown while publish problems are highlighted and the name is blank. */
  nameError: string | undefined;
  onChange: (patch: Partial<TemplateDraftInput>) => void;
};

/**
 * An assembly instruction's own fields: its name, and what it is for and how big it is. Memoised:
 * the editor re-renders on every keystroke in the steps.
 */
export const AssemblySettingsCard = memo(function AssemblySettingsCard({
  name,
  modelName,
  modelCode,
  revision,
  sections,
  nameError,
  onChange,
}: Props) {
  const steps = sections.reduce((count, section) => count + section.items.length, 0);
  const departments = stepDepartments(sections);
  return (
    <div className="rounded-lg border border-ink-200 bg-surface p-5 shadow-xs">
      <Field id={TEMPLATE_NAME_ID} label="Name" error={nameError}>
        {(control) => (
          <input
            {...control}
            maxLength={200}
            autoComplete="off"
            placeholder="HHV-3 24-Tools scheme"
            value={name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          />
        )}
      </Field>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
        <Fact label="Machine model">
          {modelName}
          {modelName !== modelCode && <span className="ml-1.5 text-ink-500">{modelCode}</span>}
        </Fact>
        <Fact label="Revision">Draft – Rev {revision}</Fact>
        <Fact label="Size">
          {sections.length} {sections.length === 1 ? 'task' : 'tasks'} · {steps}{' '}
          {steps === 1 ? 'step' : 'steps'}
        </Fact>
        <Fact label="Estimated time">{formatMinutes(totalMinutes(sections))}</Fact>
      </dl>
      {departments.length > 0 && (
        <p className="mt-4 text-xs text-ink-500">Departments: {departments.join(', ')}</p>
      )}
    </div>
  );
});

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium wrap-break-word text-ink-900 tabular-nums">{children}</dd>
    </div>
  );
}
