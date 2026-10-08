import {
  APP_NAME,
  sameTemplateContent,
  validateForPublish,
  type PublishIssue,
  type Section,
  type Template,
  type TemplateDetail,
  type TemplateDraftInput,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Printer, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { Button, ButtonLink } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ApiRequestError } from '../../lib/api';
import { AutosaveAlerts } from '../../lib/autosave/AutosaveAlerts';
import { LeaveDialog } from '../../lib/autosave/LeaveDialog';
import { SaveStatus } from '../../lib/autosave/SaveStatus';
import { useAutosave } from '../../lib/autosave/useAutosave';
import { useLeaveGuard } from '../../lib/autosave/useLeaveGuard';
import { useReload } from '../../lib/autosave/useReload';
import { useUploadTracking } from '../../lib/autosave/useUploadTracking';
import { useSettings } from '../../lib/useSettings';
import { templatePrintHref } from '../print/links';
import { Badge } from './Badge';
import { ChecklistHeading } from './ChecklistHeading';
import { TemplateDocument } from './document/TemplateDocument';
import { PublishDialog, type FlushResult } from './PublishDialog';
import {
  fetchTemplate,
  publishDraft,
  saveDraft,
  templateKeys,
  useTemplates,
  type LoadedTemplate,
} from './queries';
import { RevisionHistory } from './RevisionHistory';
import { TemplateSettingsCard } from './TemplateSettingsCard';

type Props = {
  /** Read once, when the editor opens; from then on the editor's own state is the truth. */
  loaded: LoadedTemplate;
  /** Loads the draft again and reopens the editor on it; false if loading failed. */
  onReload: () => Promise<boolean>;
};

/** What the server owns and tells us after each save or publish. */
type ServerState = {
  /** The revision the draft will be published as. */
  revision: number;
  hasUnpublishedChanges: boolean;
  revisions: TemplateDetail['revisions'];
};

const NO_ISSUES: PublishIssue[] = [];

/**
 * The template editor (brief §5.2): the front-page settings, the revision history and the
 * checklist, all edited in place and autosaved to the draft; Publish freezes it as a revision.
 */
export function TemplateEditor({ loaded, onReload }: Props) {
  const id = loaded.detail.draft.id;
  const queryClient = useQueryClient();
  const settings = useSettings();
  const templates = useTemplates();

  const [draft, setDraft] = useState<TemplateDraftInput>(() => draftInput(loaded.detail.draft));
  // The latest draft, for event handlers that run before React re-renders.
  const draftRef = useRef(draft);
  const [server, setServer] = useState<ServerState>(() => serverState(loaded.detail));

  // The list (badges, dates) is refetched when it is next shown. Refetching it now would cost a
  // request per autosave, because this page watches it too (for the models already taken).
  const markListStale = () =>
    void queryClient.invalidateQueries({ queryKey: templateKeys.list, refetchType: 'none' });

  const [saver, saveState] = useAutosave<TemplateDraftInput>({
    etag: loaded.etag,
    save: async (input, ifMatch) => {
      const saved = await saveDraft(id, input, ifMatch);
      // Only what the server owns is taken over: the user may have typed on since this was sent.
      setServer((current) => ({
        ...current,
        revision: saved.data.draft.revision,
        hasUnpublishedChanges: saved.data.hasUnpublishedChanges,
      }));
      markListStale();
      return saved.etag;
    },
    // After saves that failed on the way, a 412 may be our own doing: was one of them stored?
    reconcile: async () => {
      const { detail, etag } = await fetchTemplate(id);
      setServer((current) => ({
        ...current,
        revision: detail.draft.revision,
        hasUnpublishedChanges: detail.hasUnpublishedChanges,
      }));
      return { etag, value: draftInput(detail.draft) };
    },
    equals: sameTemplateContent,
  });

  // A cover photo that is still uploading counts as unsaved.
  const { uploading, trackUpload, saveAll } = useUploadTracking(saver);
  const dirty = saveState.status !== 'saved' || uploading;
  const leaveGuard = useLeaveGuard(dirty, saveAll);
  const reload = useReload(dirty, onReload);

  const update = useCallback(
    (patch: Partial<TemplateDraftInput>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      saver.change(next);
    },
    [saver],
  );
  const updateSections = useCallback((sections: Section[]) => update({ sections }), [update]);

  // After a publish attempt with problems, they stay highlighted (and update) until published.
  const [checking, setChecking] = useState(false);
  const issueKey = checking ? JSON.stringify(validateForPublish(draft)) : '';
  // Same problems → same array, so the checklist's memoised rows don't re-render per keystroke.
  const issues = useMemo(
    () => (issueKey ? (JSON.parse(issueKey) as PublishIssue[]) : NO_ISSUES),
    [issueKey],
  );
  const nameBlank = !draft.name.trim();

  const [publishing, setPublishing] = useState<PublishIssue[] | null>(null);
  const [publishConflict, setPublishConflict] = useState(false);
  const [published, setPublished] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  // A publish leaves nothing new to publish, so the Publish button is disabled under the keyboard
  // focus: the "Published" notice takes the focus instead.
  useEffect(() => {
    if (published !== null) noticeRef.current?.focus();
  }, [published]);

  const conflict = saveState.status === 'conflict' || publishConflict;
  const unpublished = dirty || server.hasUnpublishedChanges;
  const latestRevision = server.revisions[0]?.revision ?? null;

  function openPublish() {
    const found = validateForPublish(draftRef.current);
    if (found.length > 0) setChecking(true);
    setPublished(null);
    setPublishing(found);
  }

  async function flushForPublish(): Promise<FlushResult> {
    if (await saveAll()) return { status: 'saved' };
    const state = saver.getState();
    if (state.status === 'conflict') return { status: 'conflict' };
    return { status: 'failed', message: state.status === 'error' ? state.message : null };
  }

  async function publish(changeNote: string) {
    const revision = server.revision;
    const { detail, etag } = await publishDraft(id, saver.etag(), changeNote).then(
      ({ data, etag: draftEtag }) => ({ detail: data, etag: draftEtag }),
      (failure: unknown) => publishedAnyway(failure, revision),
    );
    // The draft continues under a new ETag. Take it over only if that draft is still exactly what
    // we have: if someone saved between the publish's writes, the next autosave must hit the
    // conflict instead of overwriting their work.
    if (sameTemplateContent(detail.draft, draftRef.current)) saver.setEtag(etag);
    setServer(serverState(detail));
    setChecking(false);
    setPublished(detail.revisions[0]?.revision ?? null);
    markListStale();
  }

  /**
   * A publish whose answer was lost (network, timeout, 5xx) may have gone through, and trying again
   * would then get a 412 that blames someone else. So check: if revision N now exists and the draft
   * is still exactly ours, it did. Otherwise the original failure stands.
   */
  async function publishedAnyway(failure: unknown, revision: number): Promise<LoadedTemplate> {
    const refused =
      failure instanceof ApiRequestError && failure.status < 500 && failure.status !== 412;
    if (refused) throw failure;
    const current = await fetchTemplate(id).catch(() => null);
    const latest = current?.detail.revisions[0]?.revision;
    if (
      current &&
      latest === revision &&
      sameTemplateContent(current.detail.draft, draftRef.current)
    ) {
      return current;
    }
    throw failure;
  }

  const takenModels = useMemo(
    () =>
      new Set(
        (templates.data ?? [])
          .filter((template) => template.id !== id)
          .map((template) => template.modelCode),
      ),
    [templates.data, id],
  );
  const title = draft.name.trim() || 'Untitled template';

  return (
    // While the editor is open, whatever is scrolled into view (focus moving between rows, jump
    // links) stops below the sticky header and the tablet top bar. Padding on the page's scroller,
    // because Chrome ignores an element's scroll-margin for block: 'nearest'.
    <div className="[:root:has(&)]:scroll-pt-36 lg:[:root:has(&)]:scroll-pt-24">
      <title>{`${title} · ${APP_NAME}`}</title>
      <BackLink to="/templates" label="Templates" />

      <header className="sticky top-14 z-20 mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink-200 bg-canvas py-3 lg:top-0">
        <div className="min-w-0 flex-1">
          {/* Focusable from script: it takes the focus when the "Published" notice is dismissed. */}
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="truncate text-xl font-semibold tracking-tight text-ink-900 outline-none"
          >
            {title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge>Draft · Rev {server.revision}</Badge>
            {latestRevision === null ? (
              <Badge>Not published</Badge>
            ) : (
              <Badge tone="ok">Published Rev {latestRevision}</Badge>
            )}
            {unpublished && <Badge tone="brand">Unpublished changes</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SaveStatus
            state={saveState}
            conflict={publishConflict}
            onRetry={() => void saver.flush()}
            onReload={reload.askReload}
          />
          {/* The draft as it prints; leaving the editor saves first, like any link. */}
          <ButtonLink variant="secondary" to={templatePrintHref(id)}>
            <Printer size={16} aria-hidden="true" />
            Print preview
          </ButtonLink>
          {/* Nothing to publish when the draft equals the latest revision (the badges say so). */}
          <Button onClick={openPublish} disabled={!unpublished || conflict}>
            <Upload size={16} aria-hidden="true" />
            Publish
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
        {checking && issues.length > 0 && (
          <Callout
            tone="error"
            role="status"
            actions={
              <Button variant="secondary" onClick={openPublish}>
                Show problems
              </Button>
            }
          >
            {issues.length === 1 ? 'One problem' : `${issues.length} problems`} to fix before
            publishing. They are marked in red.
          </Callout>
        )}
        {published !== null && (
          <div ref={noticeRef} tabIndex={-1} className="outline-none">
            <Callout
              tone="success"
              role="status"
              onDismiss={() => {
                setPublished(null);
                // Not the Publish button: it is disabled until there is something new.
                titleRef.current?.focus();
              }}
            >
              <strong className="font-semibold">Published revision {published}.</strong> New
              inspections use it from now on.
            </Callout>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <TemplateSettingsCard
          name={draft.name}
          modelCode={draft.modelCode}
          spareRows={draft.printSettings.spareRowsPerSection}
          coverImageId={draft.coverImageId}
          revision={server.revision}
          models={settings.data?.machineModels}
          takenModels={takenModels}
          nameError={checking && nameBlank ? 'The template needs a name.' : undefined}
          onChange={update}
          onUpload={trackUpload}
        />
        <RevisionHistory templateId={id} revisions={server.revisions} />
      </div>

      <section aria-labelledby="checklist-title" className="mt-10">
        <ChecklistHeading id="checklist-title" sections={draft.sections} />
        <TemplateDocument
          sections={draft.sections}
          onChange={updateSections}
          spareRowsPerSection={draft.printSettings.spareRowsPerSection}
          issues={issues}
        />
      </section>

      {publishing && (
        <PublishDialog
          revision={server.revision}
          issues={publishing}
          nameBlank={nameBlank}
          flush={flushForPublish}
          publish={publish}
          onIssues={() => setChecking(true)}
          onConflict={() => setPublishConflict(true)}
          onClose={() => setPublishing(null)}
        />
      )}
      {reload.dialog}
      <LeaveDialog guard={leaveGuard} conflict={conflict} noun="template" />
    </div>
  );
}

/** The fields a client may send (brief §8 PUT body); the rest of the draft belongs to the server. */
function draftInput({
  name,
  modelCode,
  coverImageId,
  printSettings,
  sections,
}: Template): TemplateDraftInput {
  return { name, modelCode, coverImageId, printSettings, sections };
}

function serverState(detail: TemplateDetail): ServerState {
  return {
    revision: detail.draft.revision,
    hasUnpublishedChanges: detail.hasUnpublishedChanges,
    revisions: detail.revisions,
  };
}
