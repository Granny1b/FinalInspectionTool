import {
  APP_NAME,
  newQualityFront,
  qualityCheckTitle,
  sameTemplateContent,
  validateForPublish,
  type PublishIssue,
  type QualityFront,
  type Section,
  type Template,
  type TemplateDetail,
  type TemplateDraftInput,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FileDown, Printer, Redo2, Trash2, Undo2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ActionMenu } from '../../components/ActionMenu';
import { Breadcrumbs } from '../../components/Breadcrumbs';
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
import { canRedo, canUndo, historyKey } from '../../lib/history';
import { modelName, useSettings } from '../../lib/useSettings';
import { useScrollPaddingBelow } from '../../lib/useScrollPaddingBelow';
import { templatePrintHref } from '../print/links';
import { QUALITY_NAME_ID, QualityFrontCard } from '../qualityChecks/QualityFrontCard';
import { downloadQualityCheck } from '../qualityChecks/transfer';
import { Badge } from './Badge';
import { ChecklistHeading } from './ChecklistHeading';
import { DeleteTemplateDialog } from './DeleteTemplateDialog';
import {
  changedPlace,
  recordDraft,
  startDraftHistory,
  stepDraft,
  type ChangedPlace,
  type DraftHistory,
} from './draftHistory';
import { TemplateDocument } from './document/TemplateDocument';
import type { TemplatesPageState } from './listView';
import { MachineHeader } from './MachineHeader';
import { PublishDialog, type FlushResult } from './PublishDialog';
import {
  fetchTemplate,
  finalTemplates,
  publishDraft,
  qualityCheckHref,
  qualityChecksHref,
  qualityChecksOf,
  saveDraft,
  templateKeys,
  useDeleteTemplate,
  useTemplates,
  type LoadedTemplate,
} from './queries';
import { RevisionHistory } from './RevisionHistory';
import { TEMPLATE_NAME_ID, TemplateSettingsCard } from './TemplateSettingsCard';
import { downloadTemplate } from './transfer';

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
 * A final inspection template's editor is its machine's Final inspection tab; a quality check's
 * has its own front page and rows as cards, under its machine's Quality checks.
 */
export function TemplateEditor({ loaded, onReload }: Props) {
  const id = loaded.detail.draft.id;
  const { kind, parentId } = loaded.detail.draft;
  const quality = kind === 'quality';
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
  // An open guide editor with changes: leaving asks first, saving can't keep them.
  const [editorDirty, setEditorDirty] = useState(false);
  // Once deleted, there is nothing left to save: the editor just goes.
  const [deleted, setDeleted] = useState(false);
  const leaveGuard = useLeaveGuard(dirty && !deleted, saveAll, editorDirty && !deleted);
  const reload = useReload(dirty, onReload);

  // Every change is a step to undo and redo (Ctrl+Z, Ctrl+Y or the header's buttons), typing on
  // in the same field one step until a pause. Kept in a ref, as the draft: handlers record into
  // it before React re-renders; `steps` re-renders the buttons.
  const historyRef = useRef<DraftHistory | null>(null);
  historyRef.current ??= startDraftHistory(draft);
  const [steps, setSteps] = useState({ undo: false, redo: false });
  // Where the last undo or redo changed the checklist, brought into view once it is drawn.
  const [revealed, setRevealed] = useState<{ place: ChangedPlace } | null>(null);

  /** The draft as shown and saved from now on. */
  const apply = useCallback(
    (next: TemplateDraftInput, history: DraftHistory) => {
      historyRef.current = history;
      draftRef.current = next;
      setDraft(next);
      setSteps({ undo: canUndo(history.history), redo: canRedo(history.history) });
      saver.change(next);
    },
    [saver],
  );

  const update = useCallback(
    (patch: Partial<TemplateDraftInput>) => {
      const next = { ...draftRef.current, ...patch };
      apply(next, recordDraft(historyRef.current!, next, Date.now()));
    },
    [apply],
  );

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      const before = historyRef.current!;
      const after = stepDraft(before, direction);
      if (after === before) return;
      apply(after.history.present, after);
      const place = changedPlace(before.history.present, after.history.present);
      if (place) setRevealed({ place });
    },
    [apply],
  );

  // Ctrl+Z and Ctrl+Y anywhere on the page, in its text fields too: the draft's own steps, not a
  // field's (which would leave the draft's history out of step). A dialog (a guide, a photo,
  // Publish) keeps its keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = historyKey(event);
      if (!direction || event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"]')) {
        return;
      }
      event.preventDefault();
      step(direction);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step]);

  useEffect(() => {
    if (!revealed) return;
    const { place } = revealed;
    const selector =
      place.kind === 'row'
        ? `[data-item-text="${CSS.escape(place.itemId)}"]`
        : `[data-section-title="${CSS.escape(place.sectionId)}"]`;
    // Into view, without taking the focus from where the user is.
    document.querySelector(selector)?.scrollIntoView({ block: 'nearest' });
  }, [revealed]);
  const updateSections = useCallback((sections: Section[]) => update({ sections }), [update]);
  // A quality check's template name follows its front page's name, so lists show its title.
  const updateFront = useCallback(
    (patch: Partial<QualityFront>) => {
      const front = { ...(draftRef.current.quality ?? newQualityFront(EMPTY_TITLE)), ...patch };
      update({ quality: front, name: qualityCheckTitle(front) });
    },
    [update],
  );

  // After a publish attempt with problems, they stay highlighted (and update) until published.
  const [checking, setChecking] = useState(false);
  const issueKey = checking ? JSON.stringify(validateForPublish({ ...draft, kind })) : '';
  // Same problems → same array, so the checklist's memoised rows don't re-render per keystroke.
  const issues = useMemo(
    () => (issueKey ? (JSON.parse(issueKey) as PublishIssue[]) : NO_ISSUES),
    [issueKey],
  );
  // The template's name, or a quality check's name, which its title follows.
  const nameBlank = quality ? !draft.quality?.name.trim() : !draft.name.trim();

  const [publishing, setPublishing] = useState<PublishIssue[] | null>(null);
  const [publishConflict, setPublishConflict] = useState(false);
  const [published, setPublished] = useState<number | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // Whatever is scrolled into view (the focus moving between rows, jump links) stops below the
  // header while it sticks, and below the tablet top bar. Measured, as the header's height
  // changes with the window and a name that wraps.
  const headerRef = useRef<HTMLElement>(null);
  useScrollPaddingBelow(headerRef);

  // A publish leaves nothing new to publish, so the Publish button is disabled under the keyboard
  // focus: the "Published" notice takes the focus instead.
  useEffect(() => {
    if (published !== null) noticeRef.current?.focus();
  }, [published]);

  const conflict = saveState.status === 'conflict' || publishConflict;
  const unpublished = dirty || server.hasUnpublishedChanges;
  const latestRevision = server.revisions[0]?.revision ?? null;

  function openPublish() {
    const found = validateForPublish({ ...draftRef.current, kind });
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

  // Quality checks share their machine's model: only final inspection templates take one.
  const takenModels = useMemo(
    () =>
      new Set(
        finalTemplates(templates.data ?? [])
          .filter((template) => template.id !== id)
          .map((template) => template.modelCode),
      ),
    [templates.data, id],
  );
  const title = quality
    ? qualityCheckTitle(draft.quality ?? newQualityFront(EMPTY_TITLE)) || 'Untitled quality check'
    : draft.name.trim() || 'Untitled template';
  // Under its machine's heading on the Final inspection tab; the page's heading for a quality check.
  const Title = quality ? 'h1' : 'h2';
  const machine = templates.data?.find((template) => template.id === parentId);
  const machineName = modelName(
    settings.data?.machineModels,
    machine?.modelCode ?? draft.modelCode,
  );
  // Deleting a final inspection template deletes its quality checks too: the dialog says so.
  const qualityChecks = useMemo(
    () => (quality ? [] : qualityChecksOf(templates.data ?? [], id)),
    [quality, templates.data, id],
  );

  const navigate = useNavigate();
  const remove = useDeleteTemplate(id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // How many quality checks went with it, counted before the list is loaded again without them.
  const deletedChecks = useRef(0);

  function deleteTemplate() {
    deletedChecks.current = qualityChecks.length;
    remove.mutate(
      // Whatever is unsaved is saved first, so the delete names the draft's latest version (a
      // failed save leaves the ETag of the last one that worked; a conflict refuses the delete).
      async () => {
        await saveAll();
        return saver.etag();
      },
      {
        onSuccess: () => {
          saver.dispose();
          setDeleted(true);
        },
      },
    );
  }

  // After the render that let go of the leave guard. A quality check goes back to its machine's
  // Quality checks, a final inspection template to the list.
  useEffect(() => {
    if (!deleted) return;
    const state: TemplatesPageState = {
      deleted: draftRef.current.name.trim(),
      ...(deletedChecks.current > 0 && { qualityChecks: deletedChecks.current }),
    };
    const back = quality && parentId ? qualityChecksHref(parentId) : '/templates';
    void navigate(back, { replace: true, state });
  }, [deleted, navigate, quality, parentId]);

  function exportJson() {
    if (quality) return downloadQualityCheck(draftRef.current, machineName);
    const model = settings.data?.machineModels.find(
      (candidate) => candidate.code === draftRef.current.modelCode,
    );
    downloadTemplate(draftRef.current, model?.name);
  }

  return (
    <div>
      <title>{`${title} · ${APP_NAME}`}</title>
      {quality && parentId ? (
        <Breadcrumbs
          items={[
            { to: '/templates', label: 'Templates' },
            { to: `/templates/${parentId}`, label: machineName },
            { to: qualityChecksHref(parentId), label: 'Quality checks' },
          ]}
        />
      ) : (
        <MachineHeader
          templateId={id}
          modelCode={draft.modelCode}
          coverImageId={draft.coverImageId}
          tab="final"
        />
      )}

      {/*
        Sticky where it leaves room to work, as the inspection's header. On a phone, upright or on
        its side, it takes several lines (a third of the screen, more with the keyboard open), so
        it scrolls away there.
      */}
      <header
        ref={headerRef}
        className="top-14 z-20 mt-2 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-ink-200 bg-canvas py-3 lg:top-0 sm:[@media(min-height:40rem)]:sticky"
      >
        {/* At least 20rem beside the buttons, or it takes a line of its own above them: a long
            name then wraps instead of being cut to "Final inspection – RigiMill …". */}
        <div className="min-w-0 flex-1 basis-80">
          {/* Focusable from script: it takes the focus when the "Published" notice is dismissed. A
              final inspection's sits under its machine's heading. */}
          <Title
            ref={titleRef}
            tabIndex={-1}
            className="line-clamp-2 text-xl font-semibold tracking-tight wrap-break-word text-ink-900 outline-none"
          >
            {title}
          </Title>
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
        {/* The buttons stay together; when they don't fit beside the save status (a phone, a
            long status), they wrap below it as one group instead of running off the screen. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveStatus
            state={saveState}
            conflict={publishConflict}
            onRetry={() => void saver.flush()}
            onReload={reload.askReload}
          />
          <div className="flex items-center gap-2">
            <div role="group" aria-label="History" className="flex items-center gap-1">
              <StepButton
                label="Undo"
                shortcut="Ctrl+Z"
                inactive={!steps.undo}
                onClick={() => step('undo')}
              >
                <Undo2 size={16} aria-hidden="true" />
              </StepButton>
              <StepButton
                label="Redo"
                shortcut="Ctrl+Y"
                inactive={!steps.redo}
                onClick={() => step('redo')}
              >
                <Redo2 size={16} aria-hidden="true" />
              </StepButton>
            </div>
            {/* The draft as it prints (a quality check's as its instructions); leaving the editor
                saves first, like any link. On a phone just the printer, so the header keeps to
                one row of buttons. Spaced as the inspection's header buttons. */}
            <ButtonLink variant="secondary" to={templatePrintHref(id)} className="max-sm:px-2.5">
              <Printer size={16} aria-hidden="true" />
              <span className="max-sm:sr-only">
                {quality ? 'Print instructions' : 'Print preview'}
              </span>
            </ButtonLink>
            {/* Nothing to publish when the draft equals the latest revision (the badges say so). */}
            <Button onClick={openPublish} disabled={!unpublished || conflict}>
              <Upload size={16} aria-hidden="true" />
              Publish
            </Button>
            <ActionMenu
              label={quality ? 'Quality check actions' : 'Template actions'}
              triggerData={{ 'data-template-menu': '' }}
              trigger={
                <>
                  <Ellipsis size={16} aria-hidden="true" />
                  <span className="sr-only">
                    {quality ? 'Quality check actions' : 'Template actions'}
                  </span>
                </>
              }
              items={[
                // The draft as shown, unsaved changes included.
                { label: 'Export JSON', icon: FileDown, onSelect: exportJson },
                {
                  label: quality ? 'Delete quality check' : 'Delete template',
                  icon: Trash2,
                  danger: true,
                  onSelect: () => {
                    remove.reset();
                    setConfirmingDelete(true);
                  },
                },
              ]}
            />
          </div>
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
              <strong className="font-semibold">Published revision {published}.</strong>
              {quality ? ' Inspectors see it from now on.' : ' New inspections use it from now on.'}
            </Callout>
          </div>
        )}
      </div>

      {/* One shrinkable column below xl: an implicit one would grow to the longest unbroken
          line (a revision's date and author), wider than a phone. */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        {quality ? (
          <QualityFrontCard
            front={draft.quality ?? newQualityFront(EMPTY_TITLE)}
            revision={server.revision}
            departments={settings.data?.responsibles}
            nameError={checking && nameBlank ? 'The quality check needs a name.' : undefined}
            onChange={updateFront}
          />
        ) : (
          <TemplateSettingsCard
            name={draft.name}
            modelCode={draft.modelCode}
            coverImageId={draft.coverImageId}
            revision={server.revision}
            models={settings.data?.machineModels}
            takenModels={takenModels}
            nameError={checking && nameBlank ? 'The template needs a name.' : undefined}
            onChange={update}
            onUpload={trackUpload}
          />
        )}
        <RevisionHistory
          basePath={quality && parentId ? qualityCheckHref(parentId, id) : `/templates/${id}`}
          revisions={server.revisions}
          emptyText={
            quality
              ? 'Not published yet. Publishing creates revision 1.'
              : 'Not published yet. Publishing creates revision 1, which new inspections then use.'
          }
        />
      </div>

      <section aria-labelledby="checklist-title" className="mt-10">
        <ChecklistHeading id="checklist-title" sections={draft.sections} withTime={quality} />
        <TemplateDocument
          sections={draft.sections}
          onChange={updateSections}
          issues={issues}
          onEditorDirtyChange={setEditorDirty}
          variant={kind}
        />
      </section>

      {publishing && (
        <PublishDialog
          revision={server.revision}
          issues={publishing}
          nameBlank={nameBlank}
          nameFieldId={quality ? QUALITY_NAME_ID : TEMPLATE_NAME_ID}
          description={
            quality
              ? 'A published revision can’t be changed: later edits go into the next one.'
              : undefined
          }
          flush={flushForPublish}
          publish={publish}
          onIssues={() => setChecking(true)}
          onConflict={() => setPublishConflict(true)}
          onClose={() => setPublishing(null)}
        />
      )}
      {confirmingDelete && (
        <DeleteTemplateDialog
          name={title}
          kind={kind}
          qualityChecks={qualityChecks.map((check) => check.name || 'Untitled quality check')}
          revisions={server.revisions.length}
          busy={remove.isPending || deleted}
          error={remove.error}
          onDelete={deleteTemplate}
          onClose={() => {
            setConfirmingDelete(false);
            // The menu item that opened it is gone with its menu: back to the menu's button.
            if (!deleted) {
              document.querySelector<HTMLElement>('[data-template-menu]')?.focus();
            }
          }}
        />
      )}
      {reload.dialog}
      <LeaveDialog
        guard={leaveGuard}
        conflict={conflict}
        noun={quality ? 'quality check' : 'template'}
      />
    </div>
  );
}

/**
 * Undo or Redo: an icon button with its shortcut in the tooltip. `inactive` (aria-disabled, not
 * disabled) when there is no step, as the photo editor's: a disabled button would drop the focus
 * when its last step is taken.
 */
function StepButton({
  label,
  shortcut,
  inactive,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  inactive: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      aria-label={label}
      aria-keyshortcuts={shortcut.replace('Ctrl', 'Control')}
      aria-disabled={inactive || undefined}
      title={`${label} (${shortcut})`}
      onClick={inactive ? undefined : onClick}
      className="px-2.5 aria-disabled:cursor-default aria-disabled:opacity-50"
    >
      {children}
    </Button>
  );
}

/** The fields a client may send (brief §8 PUT body); the rest of the draft belongs to the server. */
function draftInput({
  name,
  modelCode,
  coverImageId,
  quality,
  sections,
}: Template): TemplateDraftInput {
  return { name, modelCode, coverImageId, ...(quality && { quality }), sections };
}

const EMPTY_TITLE = { name: '' };

function serverState(detail: TemplateDetail): ServerState {
  return {
    revision: detail.draft.revision,
    hasUnpublishedChanges: detail.hasUnpublishedChanges,
    revisions: detail.revisions,
  };
}
