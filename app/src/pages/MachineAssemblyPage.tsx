import {
  APP_NAME,
  assemblyProgress,
  formatMinutes,
  hasRole,
  initialsOf,
  InitialsSchema,
  type MachineAssemblyDetail,
} from '@modig/shared';
import clsx from 'clsx';
import { ArrowUpCircle, CircleCheck, LoaderCircle, Wrench } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { INPUT } from '../components/Field';
import { LoadError, PageLoading } from '../components/PageStates';
import { AssemblyView, type Signing } from '../features/assembly/AssemblyView';
import { percentText } from '../features/machineAssembly/percent';
import { ProgressBar } from '../features/machineAssembly/Progress';
import { useMachineAssembly, useMachineAssemblyAction } from '../features/machineAssembly/queries';
import { useMachine } from '../features/machines/queries';
import { updateRecent } from '../features/search/recent';
import { Badge } from '../features/templates/Badge';
import { indexIssues } from '../features/templates/document/issues';
import { SHEET } from '../features/templates/document/layout';
import { errorMessage, isMissing } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useCurrentUser } from '../lib/useMe';
import { usePersonName } from '../lib/usePeople';

const NO_ISSUES = indexIssues([]);
/** Where the initials last signed with are remembered on this device. */
const INITIALS_KEY = 'assembly.initials';

/**
 * /machines/:id/assembly/:assemblyId — an assembly instruction on a machine: the instruction to
 * read, with each step signed as done and each task turning green when all its steps are.
 */
export function MachineAssemblyPage() {
  const { id = '', assemblyId = '' } = useParams();
  const query = useMachineAssembly(id, assemblyId);
  if (query.data) return <Assembly machineId={id} detail={query.data} />;
  if (query.isPending) return <PageLoading label="Loading the assembly instruction…" />;
  if (isMissing(query.error)) {
    return (
      <>
        <BackLink to={`/machines/${id}`} label="The machine" />
        <div className="mt-6">
          <EmptyState
            icon={Wrench}
            title="This machine doesn’t have that assembly instruction"
            hint="It may have been removed from the machine, or the link is wrong."
            action={
              <ButtonLink to={`/machines/${id}`} variant="secondary">
                Go to the machine
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }
  return (
    <LoadError
      title="We couldn't load the assembly instruction"
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}

function Assembly({ machineId, detail }: { machineId: string; detail: MachineAssemblyDetail }) {
  const { assembly, signOffs, latestRevision } = detail;
  const me = useCurrentUser();
  const isAdmin = hasRole(me.roles, 'admin');
  const machine = useMachine(machineId);
  const personName = usePersonName();
  const action = useMachineAssemblyAction(machineId, assembly.id);
  const initialsId = useId();
  // The initials last used on this device, else the signed-in user's.
  const [initials, setInitials] = useState(
    () => storedInitials() ?? initialsOf(me.name || me.email),
  );
  const valid = InitialsSchema.safeParse(initials);
  useEffect(() => {
    if (!valid.success) return;
    try {
      localStorage.setItem(INITIALS_KEY, valid.data);
    } catch {
      // Private mode: they are just not remembered.
    }
  }, [valid.success, valid.data]);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const progress = useMemo(
    () => assemblyProgress(assembly.sections, signOffs),
    [assembly.sections, signOffs],
  );
  const machineName = machine.data?.detail.machine.machineName ?? 'The machine';
  // Remembered with the page (once its title has put it among the recent ones), so a search
  // for a step of this instruction leads back here, where it is signed.
  const { pathname } = useLocation();
  const machineKnown = machine.isSuccess;
  useEffect(() => {
    if (!machineKnown) return;
    const timer = setTimeout(
      () => updateRecent(pathname, { templateId: assembly.templateId }),
      1500,
    );
    return () => clearTimeout(timer);
  }, [pathname, assembly.templateId, machineKnown]);
  const email = me.email.toLowerCase();

  const signing = useMemo<Signing>(() => {
    const run = (itemIds: string[], request: Parameters<typeof action.mutate>[0]) => {
      setPending((current) => new Set([...current, ...itemIds]));
      action.mutate(request, {
        onSettled: () =>
          setPending((current) => new Set([...current].filter((id) => !itemIds.includes(id)))),
      });
    };
    return {
      signOffs,
      initials: valid.success ? valid.data : '',
      onSign: (itemIds, typed) => {
        // Initials typed next to a step are the ones to sign with from then on.
        const chosen = typed === undefined ? valid : InitialsSchema.safeParse(typed);
        if (!chosen.success) return;
        if (typed !== undefined) setInitials(chosen.data);
        run(itemIds, { action: 'sign', itemIds, initials: chosen.data });
      },
      onUnsign: (itemId) => run([itemId], { action: 'unsign', itemIds: [itemId] }),
      canUnsign: (signOff) => isAdmin || signOff.by.toLowerCase() === email,
      pending,
      personName,
    };
    // `action.mutate` is stable; the rest is what a sign-off depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOffs, valid.success, valid.data, isAdmin, email, pending, personName]);

  const newer = latestRevision !== null && latestRevision > assembly.templateRevision;
  return (
    <div>
      <title>{`${assembly.name} – ${machineName} · ${APP_NAME}`}</title>
      <BackLink to={`/machines/${machineId}`} label={machineName} />
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight wrap-break-word text-ink-900">
              {assembly.name || 'Untitled assembly instruction'}
            </h1>
            {progress.done ? (
              <Badge tone="ok">
                <CircleCheck size={12} aria-hidden="true" className="mr-1" />
                Completed
              </Badge>
            ) : progress.signed > 0 ? (
              <Badge tone="brand">In progress</Badge>
            ) : (
              <Badge>Not started</Badge>
            )}
          </div>
          <p className="mt-1.5 text-sm text-ink-500">
            Assembly of {machineName} · Rev {assembly.templateRevision}
            {progress.lastSignedAt && ` · last signed ${formatDateTime(progress.lastSignedAt)}`}
          </p>
        </div>
        <div>
          <label htmlFor={initialsId} className="block text-xs font-medium text-ink-600">
            Signing as
          </label>
          <input
            id={initialsId}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={5}
            placeholder="Initials"
            aria-invalid={valid.success ? undefined : true}
            aria-describedby={valid.success ? undefined : `${initialsId}-error`}
            value={initials}
            onChange={(event) => setInitials(event.target.value.toLocaleUpperCase('sv'))}
            className={clsx(
              INPUT,
              'mt-1 h-10 w-28 text-center text-base font-semibold tracking-wide',
            )}
          />
          {!valid.success && (
            <p id={`${initialsId}-error`} className="mt-1 text-xs font-medium text-nok-fg">
              Enter your initials to sign.
            </p>
          )}
        </div>
      </div>

      <div
        className={clsx(
          'mt-6 rounded-lg border p-4',
          progress.done ? 'border-ok-fg bg-ok-bg' : 'border-ink-200 bg-surface',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p
            className={clsx('text-sm font-semibold', progress.done ? 'text-ok-fg' : 'text-ink-900')}
          >
            {progress.done
              ? 'Completed: every step is signed.'
              : `${progress.signed} of ${progress.steps} steps signed`}
          </p>
          <p className="text-xs text-ink-500 tabular-nums">
            {progress.tasksDone} of {progress.tasks.length} tasks completed
            {progress.minutes > 0 &&
              ` · ${formatMinutes(progress.minutesSigned)} of ${formatMinutes(progress.minutes)}`}
            {' · '}
            {percentText(progress.signed, progress.steps)}
          </p>
        </div>
        <ProgressBar signed={progress.signed} steps={progress.steps} className="mt-3" />
      </div>

      <div className="mt-4 space-y-3 empty:hidden">
        {newer && (
          <Callout
            tone="info"
            role="status"
            actions={
              <Button
                variant="secondary"
                disabled={action.isPending}
                onClick={() => action.mutate({ action: 'update' })}
              >
                {action.isPending && action.variables?.action === 'update' ? (
                  <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
                ) : (
                  <ArrowUpCircle size={16} aria-hidden="true" />
                )}
                Update to Rev {latestRevision}
              </Button>
            }
          >
            Revision {latestRevision} of this instruction is published. Updating brings its changes
            to this machine; what is signed stays signed.
          </Callout>
        )}
        {action.isError && (
          <Callout tone="error" role="alert" onDismiss={() => action.reset()}>
            {action.variables?.action === 'update'
              ? 'It could not be updated. '
              : action.variables?.action === 'unsign'
                ? 'The sign-off was not taken back. '
                : 'It was not signed. '}
            {errorMessage(action.error)}
          </Callout>
        )}
      </div>

      <div className="@container mt-6">
        <div className={SHEET}>
          <AssemblyView
            sections={assembly.sections}
            issues={NO_ISSUES}
            signing={signing}
            flagFor={{ templateId: assembly.templateId, machineId }}
          />
        </div>
      </div>
    </div>
  );
}

function storedInitials(): string | null {
  try {
    const stored = localStorage.getItem(INITIALS_KEY);
    return stored && InitialsSchema.safeParse(stored).success ? stored : null;
  } catch {
    return null;
  }
}
