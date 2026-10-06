import { PrintSettingsSchema, type MachineModel, type TemplateDraftInput } from '@modig/shared';
import clsx from 'clsx';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Field, INPUT } from '../../components/Field';
import { ImageError, uploadImage } from '../../lib/images';
import { CoverPhoto, FrontPageFrame } from './FrontPage';
import { errorMessage } from './queries';

/** The name input; publish problems about the name jump here. */
export const TEMPLATE_NAME_ID = 'template-name';

/** The range PrintSettingsSchema accepts (0–30), so the field and the API agree. */
const SPARE_ROWS = PrintSettingsSchema.shape.spareRowsPerSection;
const MIN_SPARE = SPARE_ROWS.minValue ?? 0;
const MAX_SPARE = SPARE_ROWS.maxValue ?? 30;

type Props = {
  name: string;
  modelCode: string;
  spareRows: number;
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
 * Name, model, spare rows and cover photo, laid out like the printed front page. Memoised: the
 * editor re-renders on every keystroke in the checklist.
 */
export const TemplateSettingsCard = memo(function TemplateSettingsCard({
  name,
  modelCode,
  spareRows,
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
    <FrontPageFrame revisionLabel={`Rev: ${revision} (draft)`}>
      <CoverImageField
        imageId={coverImageId}
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
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
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
          <SpareRowsField
            value={spareRows}
            onChange={(spareRowsPerSection) => onChange({ printSettings: { spareRowsPerSection } })}
          />
        </div>
        <p className="text-xs text-ink-500">
          Spare rows are blank lettered lines after each section of the printed checklist, for
          findings written by hand. The checklist below previews them.
        </p>
      </div>
    </FrontPageFrame>
  );
});

/** A number field that only reports whole numbers in range; anything else waits for blur. */
function SpareRowsField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field label="Spare rows per section">
      {(control) => (
        <input
          {...control}
          type="number"
          inputMode="numeric"
          min={MIN_SPARE}
          max={MAX_SPARE}
          step={1}
          value={text ?? String(value)}
          onChange={(event) => {
            setText(event.target.value);
            const n = Number(event.target.value);
            if (
              event.target.value !== '' &&
              Number.isInteger(n) &&
              n >= MIN_SPARE &&
              n <= MAX_SPARE
            ) {
              onChange(n);
            }
          }}
          // Back to the last valid number.
          onBlur={() => setText(null)}
          className={clsx(INPUT, 'h-9 w-full tabular-nums sm:w-28')}
        />
      )}
    </Field>
  );
}

function CoverImageField({
  imageId,
  onChange,
  onUpload,
}: {
  imageId: string | undefined;
  onChange: (imageId: string | undefined) => void;
  onUpload: (upload: Promise<void>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImage(file));
    } catch (failure) {
      setError(failure instanceof ImageError ? failure.message : errorMessage(failure));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <CoverPhoto imageId={imageId}>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface/80 text-sm font-medium text-ink-700">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            Uploading…
          </div>
        )}
      </CoverPhoto>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
        <Button
          ref={pickRef}
          variant="secondary"
          className="h-8 px-2.5 aria-disabled:opacity-50"
          aria-disabled={uploading || undefined}
          onClick={() => {
            if (!uploading) fileRef.current?.click();
          }}
        >
          <ImagePlus size={15} aria-hidden="true" />
          {imageId ? 'Replace' : 'Add cover photo'}
        </Button>
        {imageId && (
          <Button
            variant="ghost"
            className="h-8 px-2.5"
            disabled={uploading}
            onClick={() => {
              onChange(undefined);
              // This button disappears; the focus goes to "Add cover photo".
              pickRef.current?.focus();
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires onChange.
          event.target.value = '';
          if (file) onUpload(upload(file));
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </div>
  );
}
