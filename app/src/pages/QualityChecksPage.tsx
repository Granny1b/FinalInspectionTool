import { APP_NAME, hasRole, type QualityCheckExport } from '@modig/shared';
import { ClipboardList, FileUp, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageLoading } from '../components/PageStates';
import { CreateQualityCheckDialog } from '../features/qualityChecks/CreateQualityCheckDialog';
import { ImportQualityCheckDialog } from '../features/qualityChecks/ImportQualityCheckDialog';
import { QualityCheckCards } from '../features/qualityChecks/QualityCheckCards';
import { readQualityCheckFile } from '../features/qualityChecks/transfer';
import type { TemplatesPageState } from '../features/templates/listView';
import { MachineHeader } from '../features/templates/MachineHeader';
import { qualityChecksHref, qualityChecksOf, useTemplates } from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { TemplateFileError } from '../features/templates/transfer';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * /templates/:id/quality-checks — a machine's Quality checks tab: its quality checks as cards,
 * and for admins New quality check and Import JSON.
 */
export function QualityChecksPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{
    file: QualityCheckExport;
    fileName: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const deleted = (location.state as TemplatesPageState | null)?.deleted;

  const machine = templates.data?.find((template) => template.id === id);
  const checks = useMemo(
    () => (templates.data ? qualityChecksOf(templates.data, id) : []),
    [templates.data, id],
  );
  const taken = useMemo(
    () =>
      checks.map((check) => ({
        position: check.quality?.position ?? '',
        title: check.name || 'Untitled quality check',
      })),
    [checks],
  );

  if (templates.isPending) return <PageLoading label="Loading the quality checks…" />;
  if (templates.isError) {
    return (
      <LoadError
        title="We couldn't load the quality checks"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  }
  if (!machine) return <TemplateNotFound />;
  // A quality check's id: its machine's tab.
  if (machine.kind === 'quality') {
    return machine.parentId ? (
      <Navigate to={qualityChecksHref(machine.parentId)} replace />
    ) : (
      <TemplateNotFound />
    );
  }
  const machineName = modelName(settings.data?.machineModels, machine.modelCode);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const picked = input.files?.[0];
    // Cleared, so choosing the same file again (after fixing it) is a change too.
    input.value = '';
    if (!picked) return;
    setFileError(null);
    try {
      setImporting({ file: await readQualityCheckFile(picked), fileName: picked.name });
    } catch (error) {
      const reason =
        error instanceof TemplateFileError ? error.message : 'The file could not be read.';
      setFileError(`“${picked.name}” can’t be imported. ${reason}`);
    }
  }

  return (
    <>
      <title>{`Quality checks – ${machineName} · ${APP_NAME}`}</title>
      <MachineHeader
        templateId={id}
        modelCode={machine.modelCode}
        coverImageId={machine.coverImageId}
        tab="quality"
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-prose text-sm text-ink-600">
          Checks done at positions along the build, before the final inspection. Each one is a
          checklist of its own, published in revisions.
        </p>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => void pickFile(event)}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} aria-hidden="true" />
              Import JSON
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" />
              New quality check
            </Button>
          </div>
        )}
      </div>

      {(deleted !== undefined || fileError) && (
        <div className="mt-6 space-y-3">
          {deleted !== undefined && (
            <Callout
              tone="success"
              role="status"
              // Out of the history entry too, so a reload doesn't bring it back.
              onDismiss={() => void navigate('.', { replace: true, state: null })}
            >
              <strong className="font-semibold">
                “{deleted || 'Untitled quality check'}” was deleted.
              </strong>
            </Callout>
          )}
          {fileError && (
            <Callout tone="error" role="alert" onDismiss={() => setFileError(null)}>
              {fileError}
            </Callout>
          )}
        </div>
      )}

      <div className="mt-6">
        {checks.length === 0 && !isAdmin ? (
          <EmptyState
            icon={ClipboardList}
            title="No quality checks yet"
            hint="Quality admins write the checks done along this machine's build. They will be listed here."
          />
        ) : (
          <QualityCheckCards checks={checks} isAdmin={isAdmin} onNew={() => setCreating(true)} />
        )}
      </div>

      {creating && (
        <CreateQualityCheckDialog
          parentId={id}
          machineName={machineName}
          taken={taken}
          onClose={() => setCreating(false)}
        />
      )}
      {importing && (
        <ImportQualityCheckDialog
          file={importing.file}
          fileName={importing.fileName}
          parentId={id}
          machineName={machineName}
          taken={taken}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  );
}
