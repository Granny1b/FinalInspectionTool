import { APP_NAME, hasRole, machineProgress, type MachineCheck } from '@modig/shared';
import { Factory, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ActionMenu } from '../components/ActionMenu';
import { BackLink } from '../components/BackLink';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageLoading } from '../components/PageStates';
import { DeleteInspectionDialog } from '../features/inspections/DeleteInspectionDialog';
import { useInspections } from '../features/inspections/queries';
import { MachineAssemblySection } from '../features/machineAssembly/MachineAssemblySection';
import { useMachineAssemblies } from '../features/machineAssembly/queries';
import { Badge } from '../features/templates/Badge';
import { useTemplates } from '../features/templates/queries';
import { CheckSection } from '../features/machines/MachineChecks';
import {
  AddCheckDialog,
  EditMachineDialog,
  LinkInspectionDialog,
} from '../features/machines/MachineDialogs';
import { MachineOverview } from '../features/machines/MachineOverview';
import { MACHINE_SECTIONS } from '../features/machines/sections';
import { MachineStatusBadge } from '../features/machines/MachineStatus';
import { checkChoices, checkTitle, nextCheck } from '../features/machines/model';
import {
  useDeleteMachine,
  useMachine,
  useRemoveCheck,
  type LoadedMachine,
} from '../features/machines/queries';
import { UpdateDialog } from '../features/machines/UpdateDialog';
import { useStartFlow } from '../features/machines/useStartFlow';
import { errorMessage, isConflict, isMissing } from '../lib/api';
import { formatDate } from '../lib/format';
import { useCurrentUser } from '../lib/useMe';
import { usePersonName } from '../lib/usePeople';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * `/machines/:id`: one machine, its quality checks in the order they are done and its final
 * inspection, each with its state, deviations and where its copy came from. Checks are started
 * here; admins edit a check's checklist, update it to a newer template revision, add and remove
 * checks, link older inspections and delete a machine nobody has started a check on.
 */
export function MachinePage() {
  const { id = '' } = useParams();
  const query = useMachine(id);
  if (query.data) return <Machine loaded={query.data} onReload={() => void query.refetch()} />;
  if (query.isPending) return <PageLoading label="Loading the machine…" />;
  if (isMissing(query.error)) {
    return (
      <>
        <BackLink to="/machines" label="Machines" />
        <div className="mt-6">
          <EmptyState
            icon={Factory}
            title="This machine doesn’t exist"
            hint="It may have been deleted, or the link is wrong."
            action={
              <ButtonLink to="/machines" variant="secondary">
                Go to machines
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }
  return (
    <LoadError
      title="We couldn't load the machine"
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}

type Dialog =
  | { kind: 'edit' }
  | { kind: 'add'; of: 'quality' | 'final' }
  | { kind: 'link' }
  | { kind: 'delete' }
  | { kind: 'update'; check: MachineCheck }
  | { kind: 'remove'; check: MachineCheck }
  /** A started check, deleted with what was recorded on it (admins). */
  | { kind: 'delete-check'; check: MachineCheck };

function Machine({ loaded, onReload }: { loaded: LoadedMachine; onReload: () => void }) {
  const { machine, checks } = loaded.detail;
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const settings = useSettings();
  const personName = usePersonName();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flow = useStartFlow(machine.machineName, checks);
  const remove = useRemoveCheck(machine.id);
  const deleteMachine = useDeleteMachine(machine.id);
  // Admins link older inspections of the machine's model: those without a machine.
  const finals = useInspections('final');
  const qualityChecks = useInspections('quality');
  const unlinked = [...(finals.data ?? []), ...(qualityChecks.data ?? [])].filter(
    (inspection) => !inspection.machineRef,
  );
  const started = checks.some((check) => check.state !== 'not_started');
  const progress = machineProgress(checks, {
    open: checks.reduce((sum, check) => sum + check.deviations.open, 0),
    closed: checks.reduce((sum, check) => sum + check.deviations.closed, 0),
  });
  const model = modelName(settings.data?.machineModels, machine.modelCode);
  const closeDialog = () => setDialog(null);
  // What the overview and the sections' Add buttons go by: the machine's assembly instructions,
  // and the model's published checks the machine doesn't have yet.
  const assemblies = useMachineAssemblies(machine.id);
  const templates = useTemplates();
  const missing = checkChoices(templates.data ?? [], machine.modelCode).filter(
    (choice) => !checks.some((check) => check.templateId === choice.templateId),
  );
  const assemblySteps = (assemblies.data ?? []).reduce((sum, entry) => sum + entry.steps, 0);
  const assemblySigned = (assemblies.data ?? []).reduce((sum, entry) => sum + entry.signed, 0);
  const canAdd = {
    quality: missing.some((choice) => choice.kind === 'quality'),
    final: missing.some((choice) => choice.kind === 'final'),
  };
  const sectionProps = {
    checks,
    isAdmin,
    starting: flow.starting,
    nextId: nextCheck(checks),
    onStart: flow.start,
    onUpdate: (check: MachineCheck) => setDialog({ kind: 'update', check }),
    onRemove: (check: MachineCheck) => {
      remove.reset();
      setDialog({ kind: check.state === 'not_started' ? 'remove' : 'delete-check', check });
    },
  };

  return (
    <div>
      <title>{`${machine.machineName} · ${APP_NAME}`}</title>
      <BackLink to="/machines" label="Machines" />
      <div className="mt-2 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere text-ink-900">
              {machine.machineName}
            </h1>
            {/* Without checks yet, its assembly says where it is. */}
            {checks.length === 0 && assemblySteps > 0 ? (
              assemblySigned === assemblySteps ? (
                <Badge tone="ok">Assembly completed</Badge>
              ) : (
                <Badge tone="brand">In assembly</Badge>
              )
            ) : (
              <MachineStatusBadge progress={progress} />
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-500">
            <span>{model}</span>
            <span>S/N {machine.serialNumber}</span>
            <span>
              Made {formatDate(machine.createdAt)} by {personName(machine.createdBy)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
              <Pencil size={16} aria-hidden="true" />
              Edit
            </Button>
          )}
          {isAdmin && (
            <ActionMenu
              label="Machine actions"
              triggerData={{ 'data-machine-menu': '' }}
              items={[
                {
                  label: 'Link an inspection…',
                  icon: Link2,
                  onSelect: () => setDialog({ kind: 'link' }),
                },
                {
                  label: 'Delete machine',
                  icon: Trash2,
                  danger: true,
                  disabled: started,
                  onSelect: () => {
                    deleteMachine.reset();
                    setDialog({ kind: 'delete' });
                  },
                },
              ]}
            />
          )}
        </div>
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {notice && (
          <Callout tone="success" role="status" onDismiss={() => setNotice(null)}>
            {notice}
          </Callout>
        )}
        {flow.error && (
          <Callout tone="error" role="alert">
            {flow.error}
          </Callout>
        )}
        {remove.isError && (
          <Callout tone="error" role="alert" onDismiss={() => remove.reset()}>
            The check could not be removed. {errorMessage(remove.error)}
          </Callout>
        )}
        {deleteMachine.isError && (
          <Callout tone="error" role="alert" onDismiss={() => deleteMachine.reset()}>
            The machine could not be deleted. {errorMessage(deleteMachine.error)}
            {isConflict(deleteMachine.error) && (
              <>
                {' '}
                <button type="button" onClick={onReload} className="font-semibold underline">
                  Reload
                </button>
              </>
            )}
          </Callout>
        )}
      </div>

      <MachineOverview assemblies={assemblies.data} checks={checks} />

      <div className="mt-10 space-y-10">
        <MachineAssemblySection
          id={MACHINE_SECTIONS.assembly}
          machine={machine}
          isAdmin={isAdmin}
        />
        <CheckSection
          id={MACHINE_SECTIONS.quality}
          kind="quality"
          empty={
            canAdd.quality
              ? 'No quality checks on this machine yet. Add one with Add quality check.'
              : 'No quality checks on this machine, and none is published for its model yet.'
          }
          action={
            canAdd.quality && (
              <Button variant="secondary" onClick={() => setDialog({ kind: 'add', of: 'quality' })}>
                <Plus size={16} aria-hidden="true" />
                Add quality check
              </Button>
            )
          }
          {...sectionProps}
        />
        <CheckSection
          id={MACHINE_SECTIONS.final}
          kind="final"
          empty={
            canAdd.final
              ? 'No final inspection on this machine yet. Add it with Add final inspection.'
              : 'No final inspection on this machine, and none is published for its model yet.'
          }
          action={
            canAdd.final && (
              <Button variant="secondary" onClick={() => setDialog({ kind: 'add', of: 'final' })}>
                <Plus size={16} aria-hidden="true" />
                Add final inspection
              </Button>
            )
          }
          {...sectionProps}
        />
      </div>

      {dialog?.kind === 'edit' && (
        <EditMachineDialog
          machine={machine}
          etag={loaded.etag}
          onReload={onReload}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'add' && (
        <AddCheckDialog
          machine={machine}
          checks={checks}
          kind={dialog.of}
          onAdded={(title) => setNotice(`${title} was added. It is not started yet.`)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkInspectionDialog
          machine={machine}
          unlinked={unlinked}
          onLinked={(number) => setNotice(`${number} is linked to ${machine.machineName}.`)}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'update' && (
        <UpdateDialog
          machineId={machine.id}
          check={dialog.check}
          onUpdated={setNotice}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'remove' && (
        <ConfirmDialog
          title={`Remove ${checkTitle(dialog.check)}?`}
          message={`It is not started: removing it takes it off ${machine.machineName}, with any changes made to its checklist. It can be added again with Add check.`}
          confirmLabel="Remove"
          onConfirm={() => {
            const check = dialog.check;
            closeDialog();
            remove.mutate(check.id, {
              onSuccess: () => setNotice(`${checkTitle(check)} was removed.`),
            });
          }}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'delete-check' && (
        <DeleteInspectionDialog
          kind={dialog.check.kind}
          number={dialog.check.number ?? checkTitle(dialog.check)}
          machine={machine.machineName}
          finalised={dialog.check.state === 'finalised'}
          busy={remove.isPending}
          error={remove.error}
          onDelete={() => {
            const check = dialog.check;
            remove.mutate(check.id, {
              onSuccess: () => {
                closeDialog();
                setNotice(`${check.number ?? checkTitle(check)} was deleted.`);
              },
            });
          }}
          // It is read just before it is deleted, so only a save in that instant gets here.
          onReload={() => {
            closeDialog();
            onReload();
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${machine.machineName}?`}
          message="The machine and its checks, none of them started, are deleted for good."
          confirmLabel="Delete machine"
          onConfirm={() => {
            closeDialog();
            deleteMachine.mutate(loaded.etag, {
              onSuccess: () => void navigate('/machines', { replace: true }),
            });
          }}
          onCancel={() => {
            closeDialog();
            document.querySelector<HTMLElement>('[data-machine-menu]')?.focus();
          }}
        />
      )}
      {flow.dialog}
    </div>
  );
}
