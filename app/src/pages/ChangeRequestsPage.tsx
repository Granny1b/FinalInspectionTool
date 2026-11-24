import { type ChangeRequest } from '@modig/shared';
import clsx from 'clsx';
import {
  Check,
  CircleCheck,
  Flag,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Search,
  SearchX,
  Trash2,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ActionMenu } from '../components/ActionMenu';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { INPUT } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { useChangeRequestAction, useChangeRequests } from '../features/changeRequests/queries';
import { matchesChangeRequest } from '../features/changeRequests/search';
import { Badge } from '../features/templates/Badge';
import { assemblyEditHref, assemblyHref, useTemplates } from '../features/templates/queries';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { usePersonName } from '../lib/usePeople';
import { modelName, useSettings } from '../lib/useSettings';

type Shown = 'open' | 'fixed' | 'all';
const SHOWN_LABELS: Record<Shown, string> = { open: 'Open', fixed: 'Fixed', all: 'All' };

/**
 * /change-requests (admins): the steps of assembly instructions that readers flagged as wrong.
 * Each says which step, what is wrong, who said so and when, and opens the step in the editor;
 * once the instruction is changed (and published), it is marked fixed.
 */
export function ChangeRequestsPage() {
  const requests = useChangeRequests();
  const action = useChangeRequestAction();
  const [shown, setShown] = useState<Shown>('open');
  const [fixing, setFixing] = useState<ChangeRequest | null>(null);
  const [deleting, setDeleting] = useState<ChangeRequest | null>(null);
  const [query, setQuery] = useState('');
  const personName = usePersonName();
  const settings = useSettings();

  if (requests.isPending) return <PageLoading label="Loading the change requests…" />;
  if (requests.isError) {
    return (
      <LoadError
        title="We couldn't load the change requests"
        message={errorMessage(requests.error)}
        onRetry={() => void requests.refetch()}
        retrying={requests.isFetching}
      />
    );
  }
  // The search goes through open and fixed alike: the tabs then say how many of each it found.
  const searching = query.trim() !== '';
  const found = requests.data.filter((request) =>
    matchesChangeRequest(request, query, {
      person: personName,
      model: (code) => modelName(settings.data?.machineModels, code),
    }),
  );
  const counts: Record<Shown, number> = {
    open: found.filter((request) => request.status === 'open').length,
    fixed: found.filter((request) => request.status === 'fixed').length,
    all: found.length,
  };
  const list = shown === 'all' ? found : found.filter((request) => request.status === shown);

  return (
    <>
      <PageHeader
        title="Change requests"
        description="Steps of assembly instructions that someone flagged as wrong. Change the instruction, publish it, then mark the request fixed."
      />
      <div className="relative mb-4 max-w-xl">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
        />
        <input
          type="search"
          aria-label="Search the change requests"
          placeholder="Search: what was wrong, the step, instruction, machine, who, date…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={clsx(INPUT, 'h-10 pl-9')}
        />
      </div>
      <div role="tablist" aria-label="Show" className="mb-5 flex flex-wrap gap-1.5">
        {(['open', 'fixed', 'all'] as const).map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={shown === status}
            onClick={() => setShown(status)}
            className={clsx(
              'inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
              shown === status
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-ink-300 bg-surface text-ink-700 hover:border-ink-400 hover:bg-ink-50',
            )}
          >
            {SHOWN_LABELS[status]}
            <span className="text-xs text-ink-500 tabular-nums">{counts[status]}</span>
          </button>
        ))}
      </div>

      {action.isError && (
        <div className="mb-5">
          <Callout tone="error" role="alert" onDismiss={() => action.reset()}>
            That did not work. {errorMessage(action.error)}
          </Callout>
        </div>
      )}

      {/* Announced, so a screen reader hears what a search left. */}
      {searching && (
        <p role="status" className="mb-3 text-xs text-ink-500">
          {found.length === 0
            ? 'No change requests match.'
            : `${found.length} change request${found.length === 1 ? '' : 's'} match: ${counts.open} open, ${counts.fixed} fixed.`}
        </p>
      )}
      {list.length === 0 && searching ? (
        <EmptyState
          icon={SearchX}
          title={found.length === 0 ? 'No change requests match' : `None of them is ${shown}`}
          hint={
            found.length === 0
              ? 'Try other words: part of what was wrong, a part number, a machine, a name or a date like 2026-11.'
              : `The search found ${found.length}, under ${shown === 'open' ? 'Fixed' : 'Open'}.`
          }
          action={
            found.length === 0 ? (
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear the search
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setShown('all')}>
                Show all {found.length}
              </Button>
            )
          }
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={shown === 'fixed' ? Flag : CircleCheck}
          title={
            shown === 'open'
              ? 'Nothing to fix'
              : shown === 'fixed'
                ? 'Nothing fixed yet'
                : 'No change requests yet'
          }
          hint={
            shown === 'fixed'
              ? 'Requests marked fixed are kept here.'
              : 'When someone flags a step of an assembly instruction as wrong, it is listed here.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              busy={action.isPending && action.variables?.id === request.id}
              onFix={() => setFixing(request)}
              onReopen={() => action.mutate({ id: request.id, status: 'open' })}
              onDelete={() => setDeleting(request)}
            />
          ))}
        </ul>
      )}

      {fixing && (
        <FixDialog
          request={fixing}
          onFix={(resolution) =>
            action.mutate({ id: fixing.id, status: 'fixed', ...(resolution && { resolution }) })
          }
          onClose={() => setFixing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this change request?"
          message={`“${deleting.message.slice(0, 120)}${deleting.message.length > 120 ? '…' : ''}” is deleted for good. To keep it as done, mark it fixed instead.`}
          confirmLabel="Delete"
          onConfirm={() => {
            action.mutate({ id: deleting.id, delete: true });
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function RequestCard({
  request,
  busy,
  onFix,
  onReopen,
  onDelete,
}: {
  request: ChangeRequest;
  busy: boolean;
  onFix: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const personName = usePersonName();
  const settings = useSettings();
  const open = request.status === 'open';
  // The step in the editor: its task unfolds and the step comes into view.
  const templates = useTemplates();
  // Under the model's machine template; where a model has none yet, where it is read.
  const editor = assemblyEditHref(templates.data ?? [], {
    id: request.templateId,
    modelCode: request.modelCode,
  });
  const editorHref = `${editor ?? assemblyHref(request.templateId)}#row-${request.itemId}`;
  return (
    <li
      className={clsx(
        'rounded-lg border bg-surface p-4 sm:p-5',
        open ? 'border-ink-200' : 'border-ok-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
            {open ? <Badge tone="nok">Open</Badge> : <Badge tone="ok">Fixed</Badge>}
            <Link
              to={assemblyHref(request.templateId)}
              className="font-medium text-ink-700 underline-offset-2 hover:underline"
            >
              {request.templateName || 'Untitled assembly instruction'}
            </Link>
            <span>
              {modelName(settings.data?.machineModels, request.modelCode)} · Rev{' '}
              {request.templateRevision}
            </span>
            {request.machineRef && (
              <span>
                · on{' '}
                <Link
                  to={`/machines/${request.machineRef}`}
                  className="font-medium text-ink-700 underline-offset-2 hover:underline"
                >
                  {request.machineName}
                </Link>
              </span>
            )}
          </p>
          <p className="mt-2 text-sm text-ink-600">
            <span className="font-semibold text-brand-700 tabular-nums">{request.stepRef}</span>{' '}
            <span className="font-medium text-ink-900">{request.stepText || 'Empty step'}</span>
            {request.taskTitle && <span className="text-ink-500"> · {request.taskTitle}</span>}
          </p>
          <blockquote className="mt-3 border-l-2 border-nok-border pl-3 text-[0.9375rem] leading-6 wrap-break-word whitespace-pre-line text-ink-900">
            {request.message}
          </blockquote>
          <p className="mt-2 text-xs text-ink-500">
            Flagged by {personName(request.createdBy)} · {formatDateTime(request.createdAt)}
          </p>
          {!open && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ok-fg">
              <CircleCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                Fixed by {request.fixedBy ? personName(request.fixedBy) : 'an admin'}
                {request.fixedAt && ` · ${formatDateTime(request.fixedAt)}`}
                {request.resolution && (
                  <span className="mt-0.5 block whitespace-pre-line text-ink-700">
                    {request.resolution}
                  </span>
                )}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open ? (
            <>
              <ButtonLink to={editorHref} variant="secondary">
                <Pencil size={16} aria-hidden="true" />
                Open the step
              </ButtonLink>
              <Button onClick={onFix} disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
                ) : (
                  <Check size={16} aria-hidden="true" />
                )}
                Mark as fixed
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onReopen} disabled={busy}>
              <RotateCcw size={16} aria-hidden="true" />
              Reopen
            </Button>
          )}
          <ActionMenu
            label="Change request actions"
            items={[{ label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete }]}
          />
        </div>
      </div>
    </li>
  );
}

/** Marks a request fixed, with an optional line on what was done. */
function FixDialog({
  request,
  onFix,
  onClose,
}: {
  request: ChangeRequest;
  onFix: (resolution: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [resolution, setResolution] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    onFix(resolution.trim());
    dialogRef.current?.close();
  }
  return (
    <Dialog
      dialogRef={dialogRef}
      title="Mark as fixed"
      description={`Step ${request.stepRef} of “${request.templateName}”. The change reaches readers when the instruction is published.`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="mt-5">
        <label className="block text-sm font-medium text-ink-800">
          What was done <span className="font-normal text-ink-500">(optional)</span>
          <textarea
            rows={3}
            maxLength={2000}
            autoFocus
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            className={clsx(INPUT, 'mt-1.5 resize-y py-2 leading-5 font-normal')}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit">
            <Check size={16} aria-hidden="true" />
            Mark as fixed
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
