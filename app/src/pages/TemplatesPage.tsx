import { hasRole, type TemplateExport } from '@modig/shared';
import { FileUp, LayoutTemplate, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { CreateTemplateDialog } from '../features/templates/CreateTemplateDialog';
import { ImportTemplateDialog } from '../features/templates/ImportTemplateDialog';
import {
  loadTemplateView,
  saveTemplateView,
  type TemplatesPageState,
  type TemplateView,
} from '../features/templates/listView';
import type { ModelContext } from '../features/templates/modelChoice';
import { useTemplates } from '../features/templates/queries';
import { TemplateCards } from '../features/templates/TemplateCards';
import { TemplateList } from '../features/templates/TemplateList';
import { readTemplateFile, TemplateFileError } from '../features/templates/transfer';
import { ViewSwitch } from '../features/templates/ViewSwitch';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { useSettings } from '../lib/useSettings';

export function TemplatesPage() {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<TemplateView>(loadTemplateView);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ file: TemplateExport; fileName: string } | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const deleted = (location.state as TemplatesPageState | null)?.deleted;

  const models = settings.data?.machineModels;
  // Needs the models and the existing templates to offer only models without one.
  const modelContext = useMemo<ModelContext | null>(
    () =>
      models && templates.data
        ? {
            models,
            free: models.filter(
              (model) => !templates.data.some((template) => template.modelCode === model.code),
            ),
            templates: templates.data,
          }
        : null,
    [models, templates.data],
  );

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const picked = input.files?.[0];
    // Cleared, so choosing the same file again (after fixing it) is a change too.
    input.value = '';
    if (!picked) return;
    setFileError(null);
    try {
      setImporting({ file: await readTemplateFile(picked), fileName: picked.name });
    } catch (error) {
      const reason =
        error instanceof TemplateFileError ? error.message : 'The file could not be read.';
      setFileError(`“${picked.name}” can’t be imported. ${reason}`);
    }
  }

  const adminActions = isAdmin && (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => void pickFile(event)}
      />
      <Button
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        disabled={!modelContext}
      >
        <FileUp size={16} aria-hidden="true" />
        Import JSON
      </Button>
      <Button onClick={() => setCreating(true)} disabled={!modelContext}>
        <Plus size={16} aria-hidden="true" />
        New template
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Templates"
        description="One checklist per machine model, published in revisions."
        actions={
          templates.data?.length ? (
            <>
              <ViewSwitch
                view={view}
                onChange={(next) => {
                  setView(next);
                  saveTemplateView(next);
                }}
              />
              {adminActions}
            </>
          ) : undefined
        }
      />
      {(deleted !== undefined || fileError) && (
        <div className="mb-6 space-y-3">
          {deleted !== undefined && (
            <Callout
              tone="success"
              role="status"
              // Out of the history entry too, so a reload doesn't bring it back.
              onDismiss={() => void navigate('.', { replace: true, state: null })}
            >
              <strong className="font-semibold">
                “{deleted || 'Untitled template'}” was deleted.
              </strong>{' '}
              Inspections made from it are kept.
            </Callout>
          )}
          {fileError && (
            <Callout tone="error" role="alert" onDismiss={() => setFileError(null)}>
              {fileError}
            </Callout>
          )}
        </div>
      )}
      {templates.isPending ? (
        <PageLoading label="Loading templates…" />
      ) : templates.isError ? (
        <LoadError
          title="We couldn't load the templates"
          message={errorMessage(templates.error)}
          onRetry={() => void templates.refetch()}
          retrying={templates.isFetching}
        />
      ) : templates.data.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          hint={
            isAdmin
              ? 'Create the checklist for a machine model: sections, checkpoint rows and print settings. Or import one exported as JSON.'
              : 'Quality admins publish the checklist for each machine model. It will be listed here.'
          }
          action={adminActions && <div className="flex gap-2">{adminActions}</div>}
        />
      ) : view === 'cards' ? (
        <TemplateCards templates={templates.data} models={models} showDrafts={isAdmin} />
      ) : (
        <TemplateList templates={templates.data} models={models} showDrafts={isAdmin} />
      )}
      {creating && modelContext && (
        <CreateTemplateDialog models={modelContext} onClose={() => setCreating(false)} />
      )}
      {importing && modelContext && (
        <ImportTemplateDialog
          file={importing.file}
          fileName={importing.fileName}
          models={modelContext}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  );
}
