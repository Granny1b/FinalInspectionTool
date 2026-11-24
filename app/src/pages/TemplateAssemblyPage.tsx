import { APP_NAME, hasRole } from '@modig/shared';
import { FileUp, Plus, Wrench } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageLoading } from '../components/PageStates';
import { CreateAssemblyDialog } from '../features/assembly/CreateAssemblyDialog';
import { ImportAssemblyDialog } from '../features/assembly/ImportAssemblyDialog';
import { InstructionCard } from '../features/assembly/InstructionCard';
import type { AssemblyMachine } from '../features/assembly/models';
import { readAssemblyFiles, type PickedFile } from '../features/assembly/transfer';
import type { TemplatesPageState } from '../features/templates/listView';
import { MachineHeader } from '../features/templates/MachineHeader';
import {
  assemblyEditorHref,
  assemblyHref,
  assemblyInstructionsOf,
  templateHref,
  useTemplates,
} from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * /templates/:id/assembly — a machine template's Assembly tab: the model's assembly instructions.
 * Admins write them here (New instruction, Import JSON, one file or many) and open one to edit
 * it; everyone else sees the published ones, which open to be read.
 */
export function TemplateAssemblyPage() {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<PickedFile[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleted = (location.state as TemplatesPageState | null)?.deleted;
  const template = templates.data?.find((entry) => entry.id === id);
  const modelCode = template?.modelCode;
  const instructions = modelCode
    ? assemblyInstructionsOf(templates.data ?? [], modelCode).filter(
        (instruction) => isAdmin || instruction.publishedRevision !== null,
      )
    : [];

  if (templates.isPending) return <PageLoading label="Loading the assembly instructions…" />;
  if (templates.isError) {
    return (
      <LoadError
        title="We couldn't load the assembly instructions"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  }
  if (!template) return <TemplateNotFound />;
  // A quality check's or an instruction's id: its own page.
  if (template.kind !== 'final') return <Navigate to={templateHref(template)} replace />;
  const machine: AssemblyMachine = {
    templateId: id,
    modelCode: template.modelCode,
    modelName: modelName(settings.data?.machineModels, template.modelCode),
  };

  async function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = [...(input.files ?? [])];
    // Cleared, so choosing the same files again (after fixing one) is a change too.
    input.value = '';
    if (files.length > 0) setPicked(await readAssemblyFiles(files));
  }

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus size={16} aria-hidden="true" />
      New instruction
    </Button>
  );
  return (
    <>
      <title>{`Assembly – ${machine.modelName} · ${APP_NAME}`}</title>
      <MachineHeader
        templateId={id}
        modelCode={template.modelCode}
        coverImageId={template.coverImageId}
        tab="assembly"
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-prose text-sm text-ink-600">
          How a {machine.modelName} is built, as tasks of steps, published in revisions. Published
          instructions are read under Assembly in the sidebar, and can be bound to a machine.
        </p>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              hidden
              onChange={(event) => void pickFiles(event)}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} aria-hidden="true" />
              Import JSON
            </Button>
            {newButton}
          </div>
        )}
      </div>

      {deleted !== undefined && (
        <div className="mt-6">
          <Callout
            tone="success"
            role="status"
            // Out of the history entry too, so a reload doesn't bring it back.
            onDismiss={() => void navigate('.', { replace: true, state: null })}
          >
            <strong className="font-semibold">
              “{deleted || 'Untitled assembly instruction'}” was deleted.
            </strong>
          </Callout>
        </div>
      )}

      <div className="mt-6">
        {instructions.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No assembly instructions yet"
            hint={
              isAdmin
                ? 'Write the first one, or import instructions from JSON files: several can be chosen at once.'
                : 'They will be listed here once they are published.'
            }
            action={isAdmin ? newButton : undefined}
          />
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {instructions.map((instruction) => (
              <InstructionCard
                key={instruction.id}
                instruction={instruction}
                isAdmin={isAdmin}
                // Admins open it to edit; everyone else to read.
                href={
                  isAdmin ? assemblyEditorHref(id, instruction.id) : assemblyHref(instruction.id)
                }
              />
            ))}
          </ul>
        )}
      </div>

      {creating && <CreateAssemblyDialog machine={machine} onClose={() => setCreating(false)} />}
      {picked && (
        <ImportAssemblyDialog picked={picked} machine={machine} onClose={() => setPicked(null)} />
      )}
    </>
  );
}
