import { formatMinutes, hasRole, type TemplateSummary } from '@modig/shared';
import { FileUp, Plus, Wrench } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { buttonClasses } from '../components/buttonClasses';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { CreateAssemblyDialog } from '../features/assembly/CreateAssemblyDialog';
import { ImportAssemblyDialog } from '../features/assembly/ImportAssemblyDialog';
import { assemblyModelContext } from '../features/assembly/models';
import { readAssemblyFiles, type PickedFile } from '../features/assembly/transfer';
import { Badge, PublishedBadge } from '../features/templates/Badge';
import type { TemplatesPageState } from '../features/templates/listView';
import { assemblyHref, assemblyInstructions, useTemplates } from '../features/templates/queries';
import { errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import { useCurrentUser } from '../lib/useMe';
import { usePersonName } from '../lib/usePeople';
import { modelName, useSettings } from '../lib/useSettings';

const byName = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * /assembly — the assembly instructions, by machine model: everyone reads the published ones;
 * admins write them, and create or import new ones (one JSON file or many at once).
 */
export function AssemblyPage() {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<PickedFile[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleted = (location.state as TemplatesPageState | null)?.deleted;
  const models = settings.data?.machineModels;

  // Inspectors see what is published; an admin's drafts are theirs to finish first.
  const groups = useMemo(() => {
    const list = assemblyInstructions(templates.data ?? []).filter(
      (instruction) => isAdmin || instruction.publishedRevision !== null,
    );
    const byModel = new Map<string, TemplateSummary[]>();
    for (const instruction of list) {
      const group = byModel.get(instruction.modelCode) ?? [];
      group.push(instruction);
      byModel.set(instruction.modelCode, group);
    }
    return [...byModel]
      .map(([code, instructions]) => ({ code, name: modelName(models, code), instructions }))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [templates.data, isAdmin, models]);
  const modelContext = useMemo(
    () => (models && templates.data ? assemblyModelContext(models, templates.data) : null),
    [models, templates.data],
  );

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

  async function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = [...(input.files ?? [])];
    // Cleared, so choosing the same files again (after fixing one) is a change too.
    input.value = '';
    if (files.length > 0) setPicked(await readAssemblyFiles(files));
  }

  return (
    <>
      <PageHeader
        title="Assembly instructions"
        description="How each machine is built, task by task: what to do, with which bolts and parts, and how it should look."
        actions={
          isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                onChange={(event) => void pickFiles(event)}
              />
              <Button
                variant="secondary"
                disabled={!modelContext}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={16} aria-hidden="true" />
                Import JSON
              </Button>
              <Button disabled={!modelContext} onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden="true" />
                New instruction
              </Button>
            </>
          )
        }
      />

      {deleted !== undefined && (
        <div className="mb-6">
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

      {groups.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No assembly instructions yet"
          hint={
            isAdmin
              ? 'Write the first one, or import instructions from JSON files: several can be chosen at once.'
              : 'They will be listed here once they are published.'
          }
          action={
            isAdmin && modelContext ? (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} aria-hidden="true" />
                New instruction
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.code} aria-labelledby={`model-${group.code}`}>
              <h2 id={`model-${group.code}`} className="text-base font-semibold text-ink-900">
                {group.name}
                {group.name !== group.code && (
                  <span className="ml-2 text-sm font-normal text-ink-500">{group.code}</span>
                )}
              </h2>
              <ul className="mt-3 grid gap-4 lg:grid-cols-2">
                {group.instructions.map((instruction) => (
                  <InstructionCard
                    key={instruction.id}
                    instruction={instruction}
                    isAdmin={isAdmin}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {creating && modelContext && (
        <CreateAssemblyDialog models={modelContext} onClose={() => setCreating(false)} />
      )}
      {picked && modelContext && (
        <ImportAssemblyDialog
          picked={picked}
          models={modelContext}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}

/** How many tasks a card names before "+3 more". */
const TASKS_SHOWN = 8;

function InstructionCard({
  instruction,
  isAdmin,
}: {
  instruction: TemplateSummary;
  isAdmin: boolean;
}) {
  const personName = usePersonName();
  const tasks = instruction.sectionTitles ?? [];
  const more = tasks.length - TASKS_SHOWN;
  return (
    // The title's link covers the card; the outline shows where keyboard focus is.
    <li className="relative flex flex-col gap-4 rounded-lg border border-ink-200 bg-surface p-5 shadow-xs outline-brand-600 transition-colors hover:border-ink-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="min-w-0 text-base font-semibold wrap-break-word text-ink-900">
          <Link
            to={assemblyHref(instruction.id)}
            className="outline-none after:absolute after:inset-0"
          >
            {instruction.name || 'Untitled assembly instruction'}
          </Link>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <PublishedBadge revision={instruction.publishedRevision} />
          {isAdmin &&
            instruction.hasUnpublishedChanges &&
            instruction.publishedRevision !== null && (
              <Badge tone="brand">Unpublished changes</Badge>
            )}
        </div>
      </div>

      {tasks.length > 0 ? (
        <ol aria-label="Tasks" className="flex flex-wrap gap-1.5">
          {tasks.slice(0, TASKS_SHOWN).map((title, index) => (
            <li
              key={index}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-ink-100 px-2.5 text-sm text-ink-800"
            >
              <span className="font-semibold tabular-nums">{index + 1}</span>
              <span className="truncate">{title || 'Untitled task'}</span>
            </li>
          ))}
          {more > 0 && (
            <li className="inline-flex h-7 items-center px-1 text-sm text-ink-500">+{more} more</li>
          )}
        </ol>
      ) : (
        <p className="text-sm text-ink-500">No tasks yet.</p>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-3">
        <dl className="grid grid-cols-4 gap-x-6 text-xs">
          <Stat label="Tasks" value={String(tasks.length)} />
          <Stat label="Steps" value={String(instruction.itemCount)} />
          <Stat label="Time" value={formatMinutes(instruction.totalMinutes ?? 0)} />
          <Stat
            label="Last edited"
            value={formatDate(instruction.updatedAt)}
            title={personName(instruction.updatedBy)}
          />
        </dl>
        {/* The card is the link; this only shows it, so it is no second stop. */}
        <span aria-hidden="true" className={buttonClasses('secondary', 'h-8')}>
          Open
        </span>
      </div>
    </li>
  );
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd
        className="mt-0.5 text-sm font-semibold whitespace-nowrap text-ink-900 tabular-nums"
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
