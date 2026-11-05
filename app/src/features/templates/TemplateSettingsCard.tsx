import type { MachineModel, TemplateDraftInput } from '@modig/shared';
import clsx from 'clsx';
import { memo } from 'react';
import { Field, INPUT } from '../../components/Field';
import { PhotoField } from '../../components/PhotoField';
import { FrontPageFrame } from './FrontPage';

/** The name input; publish problems about the name jump here. */
export const TEMPLATE_NAME_ID = 'template-name';

type Props = {
  name: string;
  modelCode: string;
  coverImageId: string | undefined;
  /** The revision the draft will be published as. */
  revision: number;
  models: MachineModel[] | undefined;
  /** Models another template already uses (one template per model). */
  takenModels: ReadonlySet<string>;
  /** Shown while publish problems are highlighted and the name is blank. */
  nameError: string | undefined;
  onChange: (patch: Partial<TemplateDraftInput>) => void;
  /** A cover photo upload has started; the promise settles once it is in the draft (or failed). */
  onUpload: (upload: Promise<void>) => void;
};

/**
 * Name, model and cover photo, laid out like the printed front page. Memoised: the
 * editor re-renders on every keystroke in the checklist.
 */
export const TemplateSettingsCard = memo(function TemplateSettingsCard({
  name,
  modelCode,
  coverImageId,
  revision,
  models,
  takenModels,
  nameError,
  onChange,
  onUpload,
}: Props) {
  // The saved model may have been removed from the settings since; keep it selectable.
  const options =
    models && !models.some((model) => model.code === modelCode)
      ? [...models, { code: modelCode, name: `${modelCode} (not in the settings)` }]
      : (models ?? [{ code: modelCode, name: modelCode }]);

  return (
    <FrontPageFrame revisionLabel={`Draft – Rev ${revision}`}>
      <PhotoField
        imageId={coverImageId}
        noun="cover photo"
        labels={{ add: 'Add cover photo', replace: 'Replace', remove: 'Remove' }}
        onChange={(imageId) => onChange({ coverImageId: imageId })}
        onUpload={onUpload}
      />
      <div className="space-y-4">
        <Field id={TEMPLATE_NAME_ID} label="Template name" error={nameError}>
          {(control) => (
            <input
              {...control}
              maxLength={200}
              value={name}
              onChange={(event) => onChange({ name: event.target.value })}
              className={clsx(INPUT, 'h-9')}
            />
          )}
        </Field>
        <Field label="Machine model">
          {(control) => (
            <select
              {...control}
              value={modelCode}
              onChange={(event) => onChange({ modelCode: event.target.value })}
              className={clsx(INPUT, 'h-9')}
            >
              {options.map((model) => {
                const taken = model.code !== modelCode && takenModels.has(model.code);
                return (
                  <option key={model.code} value={model.code} disabled={taken}>
                    {model.name}
                    {taken ? ' – has its own template' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </Field>
      </div>
    </FrontPageFrame>
  );
});
