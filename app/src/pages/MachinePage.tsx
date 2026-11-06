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
import { useInspections } from '../features/inspections/queries';
import { CheckSection } from '../features/machines/MachineChecks';
import {
  AddCheckDialog,
  EditMachineDialog,
  LinkInspectionDialog,
} from '../features/machines/MachineDialogs';
import { MachineStatusBadge } from '../features/machines/MachineStatus';
import { checkTitle, nextCheck } from '../features/machines/model';
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
  | { kind: 'add' }
  | { kind: 'link' }
  | { kind: 'delete' }
  | { kind: 'update'; check: MachineCheck }
  | { kind: 'remove'; check: MachineCheck };

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
  const sectionProps = {
    checks,
    isAdmin,
    starting: flow.starting,
    nextId: nextCheck(checks),
    onStart: flow.start,
    onUpdate: (check: MachineCheck) => setDialog({ kind: 'update', check }),
    onRemove: (check: MachineCheck) => setDialog({ kind: 'remove', check }),
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
            <MachineStatusBadge progress={progress} />
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
          <Button variant="secondary" onClick={() => setDialog({ kind: 'add' })}>
            <Plus size={16} aria-hidden="true" />
            Add check
          </Button>
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

      <div className="space-y-10">
        <CheckSection
          kind="quality"
          empty="No quality checks on this machine. Add one with Add check."
          {...sectionProps}
        />
        <CheckSection
          kind="final"
          empty="No final inspection on this machine yet. Add it with Add check."
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
