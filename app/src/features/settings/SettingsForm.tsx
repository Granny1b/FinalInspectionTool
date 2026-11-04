import { CONFLICT_MESSAGE, settingsInput, type SettingsInput } from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field, INPUT } from '../../components/Field';
import { PhotoField } from '../../components/PhotoField';
import { errorMessage, isConflict } from '../../lib/api';
import { useLeaveGuard } from '../../lib/autosave/useLeaveGuard';
import { useReload } from '../../lib/autosave/useReload';
import { saveSettings, settingsKeys, type LoadedSettings } from '../../lib/useSettings';
import { ListEditor } from './ListEditor';
import { MachineModelsEditor } from './MachineModelsEditor';
import {
  fieldId,
  formErrors,
  formFromInput,
  inputFromForm,
  isDirty,
  savedForm,
  type ListName,
  type ListRow,
  type SettingsForm as Form,
} from './settingsForm';

type Props = {
  /** Read once, when the card opens; from then on the form is the truth until it is saved. */
  loaded: LoadedSettings;
  /** Loads the settings again and reopens the form on them; false if loading failed. */
  onReload: () => Promise<boolean>;
};

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'conflict' }
  | { status: 'error'; message: string };

const NO_ERRORS: ReadonlyMap<string, string> = new Map();
/** Leaving never saves: changes here are saved on purpose, with Save. */
const LEAVE_WITHOUT_SAVING = () => Promise.resolve(false);

/**
 * Everything an admin edits in the settings, saved together with one Save (brief §5.6). Problems
 * show after the first attempt to save, and the first one gets the focus. Leaving with changes
 * not saved asks first; when someone else saved meanwhile, Save is refused and Reload offered.
 */
export function SettingsForm({ loaded, onReload }: Props) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(() => ({
    input: settingsInput(loaded.settings),
    etag: loaded.etag,
  }));
  const [form, setForm] = useState<Form>(() => formFromInput(saved.input));
  const [attempted, setAttempted] = useState(false);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [uploads, setUploads] = useState(0);

  const errors = useMemo(() => (attempted ? formErrors(form) : NO_ERRORS), [attempted, form]);
  const changed = isDirty(form, saved.input);
  const dirty = changed || uploads > 0;
  const saving = save.status === 'saving';
  const leaveGuard = useLeaveGuard(dirty, LEAVE_WITHOUT_SAVING);
  const reload = useReload(dirty, onReload);

  const update = useCallback((patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    // A message about the last save no longer describes the form (a conflict stays).
    setSave((current) =>
      current.status === 'saved' || current.status === 'error' ? { status: 'idle' } : current,
    );
  }, []);
  const updateList = useCallback(
    (list: ListName) => (rows: ListRow[]) => update({ [list]: rows }),
    [update],
  );
  const trackUpload = useCallback((upload: Promise<void>) => {
    setUploads((count) => count + 1);
    const done = () => setUploads((count) => count - 1);
    upload.then(done, done);
  }, []);

  async function submit() {
    if (saving || uploads > 0 || !changed || save.status === 'conflict') return;
    setAttempted(true);
    const found = formErrors(form);
    if (found.size > 0) {
      const [first] = found.keys();
      document.getElementById(first!)?.focus();
      return;
    }
    const input: SettingsInput = inputFromForm(form);
    setSave({ status: 'saving' });
    try {
      const result = await saveSettings(input, saved.etag);
      // Every page that offers the lists or models sees the new ones at once.
      queryClient.setQueryData(settingsKeys.settings, result.settings);
      const next = settingsInput(result.settings);
      setSaved({ input: next, etag: result.etag });
      setForm((current) => savedForm(current, input, next));
      setAttempted(false);
      setSave({ status: 'saved' });
    } catch (failure) {
      setSave(
        isConflict(failure)
          ? { status: 'conflict' }
          : { status: 'error', message: errorMessage(failure) },
      );
    }
  }

  return (
    // Not a <form>: its confirmation dialogs are forms of their own, and Enter in a list's field
    // is for that list (the field to add an entry takes it), not for saving everything.
    <div>
      <MachineModelsEditor
        models={form.models}
        errors={errors}
        onChange={(models) => update({ models })}
      />

      <section aria-labelledby="settings-lists-title" className="mt-8 border-t border-ink-100 pt-6">
        <h3 id="settings-lists-title" className="text-sm font-semibold text-ink-900">
          Deviation lists
        </h3>
        <p className="mt-0.5 text-xs text-ink-500">
          The choices offered on every deviation, in this order. Removing one doesn’t change the
          deviations that already use it.
        </p>
        <div className="mt-4 grid gap-8 lg:grid-cols-2">
          <ListEditor
            list="responsibles"
            title="Responsible"
            description="Who fixes it: the department picked as Responsible."
            entryLabel="Responsible"
            rows={form.responsibles}
            errors={errors}
            onChange={updateList('responsibles')}
          />
          <ListEditor
            list="deviationCategories"
            title="Deviation categories"
            description="What kind of deviation it is, picked next to its severity."
            entryLabel="Category"
            rows={form.deviationCategories}
            errors={errors}
            onChange={updateList('deviationCategories')}
          />
        </div>
      </section>

      <section
        aria-labelledby="settings-reports-title"
        className="mt-8 border-t border-ink-100 pt-6"
      >
        <h3 id="settings-reports-title" className="text-sm font-semibold text-ink-900">
          New inspections and printed reports
        </h3>
        <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="grid content-start gap-4">
            <Field
              id={fieldId.defaultLocation}
              label="Default location"
              hint="Filled in on the front page of a new inspection; it can be changed there."
              error={errors.get(fieldId.defaultLocation)}
            >
              {(control) => (
                <input
                  {...control}
                  maxLength={200}
                  autoComplete="off"
                  value={form.defaultLocation}
                  onChange={(event) => update({ defaultLocation: event.target.value })}
                  className={clsx(INPUT, 'h-9')}
                />
              )}
            </Field>
            <Field
              id={fieldId.companyName}
              label="Company name"
              hint="On the front page and in the footer of every printed report and Word export."
              error={errors.get(fieldId.companyName)}
            >
              {(control) => (
                <input
                  {...control}
                  maxLength={200}
                  autoComplete="organization"
                  value={form.companyName}
                  onChange={(event) => update({ companyName: event.target.value })}
                  className={clsx(INPUT, 'h-9')}
                />
              )}
            </Field>
          </div>
          <div id={fieldId.logo} tabIndex={-1} className="outline-none">
            <p className="text-sm font-medium text-ink-800">Company logo</p>
            <p className="mt-0.5 mb-2 text-xs text-ink-500">
              On the report’s front page. Without one, the Modig logo is used.
            </p>
            <PhotoField
              imageId={form.logoImageId}
              noun="company logo"
              labels={{ add: 'Add logo', replace: 'Replace logo', remove: 'Remove logo' }}
              onChange={(logoImageId) => update({ logoImageId })}
              onUpload={trackUpload}
            />
          </div>
        </div>
      </section>

      {/* Stays in view at the bottom of the screen while the long card scrolls past. Out to the
          edges of SettingsCard's body (its padding, negated). */}
      <div className="sticky bottom-0 -mx-4 mt-8 -mb-5 space-y-3 rounded-b-lg border-t border-ink-200 bg-surface px-4 py-4 sm:-mx-5 sm:px-5">
        {save.status === 'conflict' && (
          <Callout
            tone="error"
            role="alert"
            actions={
              <Button variant="secondary" onClick={reload.askReload}>
                <RefreshCw size={16} aria-hidden="true" />
                Reload
              </Button>
            }
          >
            <strong className="font-semibold">{CONFLICT_MESSAGE}</strong> Your changes are not
            saved.
            {reload.failed && ' Reloading failed: check your connection and try again.'}
          </Callout>
        )}
        {save.status === 'error' && (
          <Callout tone="error" role="alert">
            <strong className="font-semibold">Couldn’t save:</strong> {save.message}
          </Callout>
        )}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <p role="status" className="text-sm text-ink-500">
            {saving
              ? 'Saving…'
              : uploads > 0
                ? 'Uploading the logo…'
                : changed
                  ? attempted && errors.size > 0
                    ? errors.size === 1
                      ? 'One problem to fix before saving.'
                      : `${errors.size} problems to fix before saving.`
                    : 'Unsaved changes'
                  : save.status === 'saved'
                    ? 'Settings saved.'
                    : 'No changes'}
          </p>
          {/* aria-disabled, not disabled: a disabled button would drop the keyboard focus. */}
          <Button
            onClick={() => void submit()}
            aria-disabled={
              saving || uploads > 0 || !changed || save.status === 'conflict' || undefined
            }
            className="min-w-24 aria-disabled:opacity-50"
          >
            {saving && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {reload.dialog}
      {leaveGuard.question && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to the settings aren’t saved. They are lost if you leave now."
          confirmLabel="Leave"
          onConfirm={leaveGuard.leave}
          onCancel={leaveGuard.stay}
        />
      )}
    </div>
  );
}
