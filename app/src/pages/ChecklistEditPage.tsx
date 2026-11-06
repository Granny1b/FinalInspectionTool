import {
  APP_NAME,
  checklistChanges,
  checklistChangesText,
  hasRole,
  INSPECTION_NOUNS,
  resultIdsOf,
  sameTemplateContent,
  validateForPublish,
  type InspectionKind,
  type PublishIssue,
  type Section,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Lock, ShieldAlert } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { Button, ButtonLink } from '../components/Button';
import { Callout } from '../components/Callout';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageLoading } from '../components/PageStates';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { inspectionHref } from '../features/inspections/listFilter';
import {
  fetchInspection,
  inspectionKeys,
  useInspection,
  type LoadedInspection,
} from '../features/inspections/queries';
import { checklistHref, checkTitle, machineHref } from '../features/machines/model';
import { machineKeys, saveChecklist } from '../features/machines/queries';
import { ChecklistHeading } from '../features/templates/ChecklistHeading';
import { TemplateDocument } from '../features/templates/document/TemplateDocument';
import { useTemplateRevision } from '../features/templates/queries';
import { errorMessage, isMissing } from '../lib/api';
import { AutosaveAlerts } from '../lib/autosave/AutosaveAlerts';
import { LeaveDialog } from '../lib/autosave/LeaveDialog';
import { SaveStatus } from '../lib/autosave/SaveStatus';
import { useAutosave } from '../lib/autosave/useAutosave';
import { useLeaveGuard } from '../lib/autosave/useLeaveGuard';
import { useReload } from '../lib/autosave/useReload';
import { useCurrentUser } from '../lib/useMe';
import { useScrollPaddingBelow } from '../lib/useScrollPaddingBelow';

/**
 * `/quality-checks/:id/checklist` and `/inspections/:id/checklist` (admins): a machine's check's
 * own checklist, edited as a template is (the same rows, sections, keys, drag and drop and
 * pictures) and autosaved to the check, for this machine only. The check's page saves before
 * leaving for here and loads afresh after, so the two never save over each other.
 */
export function ChecklistEditPage({ kind }: { kind: InspectionKind }) {
  const { id = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const query = useInspection(id);
  // Bumped by Reload, so the editor starts over from the freshly loaded check.
  const [opened, setOpened] = useState(0);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Only admins edit a machine’s checklist"
        hint="Ask a Quality admin to add or remove rows of this check for this machine."
        action={
          <ButtonLink to={inspectionHref(kind, id)} variant="secondary">
            Back to the check
          </ButtonLink>
        }
      />
    );
  }
  if (query.data) {
    const { inspection } = query.data;
    if (inspection.kind !== kind) {
      return <Navigate to={checklistHref(inspection.kind, id)} replace />;
    }
    const back = (
      <ButtonLink to={inspectionHref(kind, id)} variant="secondary">
        Back to the {INSPECTION_NOUNS[kind]}
      </ButtonLink>
    );
    if (!inspection.machineRef) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Only a machine’s checks have a checklist of their own"
          hint={`This ${INSPECTION_NOUNS[kind]} belongs to no machine. Link it to one first (its ⋯ menu).`}
          action={back}
        />
      );
    }
    if (inspection.state === 'finalised') {
      return (
        <EmptyState
          icon={Lock}
          title="It is finalised"
          hint="A finalised check is locked, its checklist too. An admin can reopen it first."
          action={back}
        />
      );
    }
    return (
      <ChecklistEditor
        key={`${id}:${opened}`}
        loaded={query.data}
        onReload={async () => {
          const result = await query.refetch();
          if (result.isError) return false;
          setOpened((count) => count + 1);
          return true;
        }}
      />
    );
  }
  if (query.isPending) return <PageLoading label="Loading the checklist…" />;
  if (isMissing(query.error)) return <InspectionNotFound kind={kind} />;
  return (
    <LoadError
      title="We couldn't load the checklist"
      message={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
    />
  );
}

const NO_ISSUES: PublishIssue[] = [];

function ChecklistEditor({
  loaded,
  onReload,
}: {
  loaded: LoadedInspection;
  onReload: () => Promise<boolean>;
}) {
  const { inspection } = loaded;
  const { id, kind } = inspection;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sections, setSections] = useState<Section[]>(inspection.templateSnapshot.sections);
  // The rows with a result: deleting one asks first. A save that removed some says which are left.
  const [withResults, setWithResults] = useState(() => resultIdsOf(inspection.results));

  const [saver, saveState] = useAutosave<Section[]>({
    etag: loaded.etag,
    save: async (value, ifMatch) => {
      const saved = await saveChecklist(id, value, ifMatch);
      setWithResults(resultIdsOf(saved.inspection.results));
      // The machine's page counts its changes; the check's page loads afresh anyway.
      void queryClient.invalidateQueries({ queryKey: machineKeys.all, refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: inspectionKeys.list, refetchType: 'none' });
      return saved.etag;
    },
    reconcile: async () => {
      const current = await fetchInspection(id);
      return { etag: current.etag, value: current.inspection.templateSnapshot.sections };
    },
    equals: sameSections,
  });
  const update = useCallback(
    (next: Section[]) => {
      setSections(next);
      saver.change(next);
    },
    [saver],
  );

  const [editorDirty, setEditorDirty] = useState(false);
  const dirty = saveState.status !== 'saved';
  const flush = useCallback(() => saver.flush(), [saver]);
  const leaveGuard = useLeaveGuard(dirty, flush, editorDirty);
  const reload = useReload(dirty, onReload);
  const conflict = saveState.status === 'conflict';

  // Empty rows and untitled sections are fine while editing; leaving with some says so first.
  const [checking, setChecking] = useState(false);
  const issueKey = checking ? JSON.stringify(checklistIssues(sections, kind)) : '';
  const issues = useMemo(
    () => (issueKey ? (JSON.parse(issueKey) as PublishIssue[]) : NO_ISSUES),
    [issueKey],
  );
  const headerRef = useRef<HTMLElement>(null);
  useScrollPaddingBelow(headerRef);

  const machineName = inspection.front.machineName;
  const title = checkTitle({ kind, templateName: inspection.templateSnapshot.name });
  // What this machine changed since the revision its copy is based on, as its page says it.
  const base = useTemplateRevision(inspection.templateId, inspection.templateRevision);
  const changes = base.data
    ? checklistChangesText(checklistChanges(base.data.sections, sections))
    : '';
  const back = inspectionHref(kind, id);
  const subject = inspection.number || title;

  function done() {
    const found = checklistIssues(sections, kind);
    if (found.length > 0 && !checking) {
      setChecking(true);
      return;
    }
    void navigate(back);
  }

  return (
    <div>
      <title>{`Edit checklist · ${subject} · ${machineName} · ${APP_NAME}`}</title>
      <BackLink to={back} label={`${subject} · ${machineName}`} />
      <header
        ref={headerRef}
        className="top-14 z-20 mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink-200 bg-canvas py-3 lg:top-0 sm:[@media(min-height:40rem)]:sticky"
      >
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Edit checklist</h1>
          <p className="mt-1 text-sm text-ink-600">
            {title} for{' '}
            <Link
              to={machineHref(inspection.machineRef!)}
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              {machineName}
            </Link>{' '}
            only, based on rev {inspection.templateRevision} of its template
            {changes && ` (${changes} for this machine)`}. The template and other machines are not
            changed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveStatus
            state={saveState}
            conflict={false}
            onRetry={() => void saver.flush()}
            onReload={reload.askReload}
          />
          <Button onClick={done} disabled={conflict}>
            <Check size={16} aria-hidden="true" />
            Done
          </Button>
        </div>
      </header>

      <div className="mt-6 space-y-3 empty:hidden">
        <AutosaveAlerts
          conflict={conflict}
          dirty={dirty}
          state={saveState}
          reloadFailed={reload.failed}
          onReload={reload.askReload}
        />
        {issues.length > 0 && (
          <Callout
            tone="error"
            role="status"
            actions={
              <Button variant="secondary" onClick={() => void navigate(back)}>
                Leave anyway
              </Button>
            }
          >
            {issues.length === 1 ? 'One thing is' : `${issues.length} things are`} missing, marked
            in red: a row needs its text and a section its title.
          </Callout>
        )}
      </div>

      <section aria-labelledby="checklist-title" className="mt-6">
        <ChecklistHeading id="checklist-title" sections={sections} withTime={kind === 'quality'} />
        <TemplateDocument
          sections={sections}
          onChange={update}
          issues={issues}
          onEditorDirtyChange={setEditorDirty}
          variant={kind}
          protectedRows={withResults}
        />
      </section>
      {reload.dialog}
      <LeaveDialog guard={leaveGuard} conflict={conflict} noun="checklist" />
    </div>
  );
}

/** What a checklist needs, as when publishing a template: every row its text, each section a title. */
function checklistIssues(sections: Section[], kind: InspectionKind): PublishIssue[] {
  // Only the rows and sections: the name and front page are the template's.
  return validateForPublish({ name: 'x', sections, kind }).filter(
    (issue) => issue.target.kind !== 'template',
  );
}

/** The same sections: the template's content check, on the sections alone. */
function sameSections(a: Section[], b: Section[]): boolean {
  const content = (sections: Section[]) => ({ name: '', modelCode: '', sections });
  return sameTemplateContent(content(a), content(b));
}
