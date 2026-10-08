import {
  APP_NAME,
  deriveDeviations,
  hasRole,
  indexItems,
  inspectionProgress,
  validateForFinalise,
  type AnnotatedImage,
  type FinaliseIssue,
  type Inspection,
  type InspectionDeviation,
  type InspectionDraftInput,
  type InspectionFrontInput,
  type RowResult,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ClipboardCheck, ClipboardList, Lock, LockOpen, Printer } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ActionMenu } from '../../components/ActionMenu';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ApiRequestError, errorMessage, isConflict } from '../../lib/api';
import type { AutosaveState } from '../../lib/autosave/autosave';
import { AutosaveAlerts } from '../../lib/autosave/AutosaveAlerts';
import { LeaveDialog } from '../../lib/autosave/LeaveDialog';
import { SaveStatus } from '../../lib/autosave/SaveStatus';
import { useAutosave } from '../../lib/autosave/useAutosave';
import { useLeaveGuard } from '../../lib/autosave/useLeaveGuard';
import { useReload } from '../../lib/autosave/useReload';
import { useUploadTracking } from '../../lib/autosave/useUploadTracking';
import { formatDateTime } from '../../lib/format';
import { useCurrentUser } from '../../lib/useMe';
import { modelName, useSettings } from '../../lib/useSettings';
import { inspectionPrintHref } from '../print/links';
import type { PrintMode } from '../print/model';
import { ChecklistSheet, ShortcutHints } from './checklist/ChecklistSheet';
import { withPhotos } from './checklist/results';
import { DeviationSummary } from './DeviationSummary';
import { draftOf, sameDraft } from './draft';
import { newExtraDeviation, removeExtra, updateExtra, type ExtraDeviationPatch } from './extras';
import { FrontPageCard } from './FrontPageCard';
import { ProgressSummary, TabBar } from './HeaderParts';
import {
  deviationPhotosId,
  extraDescriptionId,
  extraIssues,
  frontIssues,
  issueTarget,
  panelId,
  rowElementId,
  tabId,
  type FocusTarget,
  type InspectionTab,
} from './issues';
import { inspectionsListHref } from './listFilter';
import type { PendingParticipant } from './ParticipantsField';
import {
  changeState,
  fetchInspection,
  finaliseIssuesOf,
  inspectionKeys,
  isUnavailable,
  saveInspection,
  useRespHistory,
  type LoadedInspection,
  type StateChange,
} from './queries';
import { respSuggestions } from './resp';
import { StateBadge } from './StateBadge';
import { StateChangeDialog, type StateOutcome } from './StateChangeDialog';
import { useScrollPaddingBelow } from './useScrollPaddingBelow';

type Props = {
  /** Read once, when the page opens; from then on the page's own state is the truth. */
  loaded: LoadedInspection;
  /** Loads the inspection again and reopens the page on it; false if loading failed. */
  onReload: () => Promise<boolean>;
};

/** What only the server changes: whether it is locked, and by whom. */
type ServerState = Pick<Inspection, 'state' | 'finalisedAt' | 'finalisedBy'>;

type DialogState = { change: 'finalise'; issues: FinaliseIssue[] } | { change: 'reopen' };

const NO_ISSUES: FinaliseIssue[] = [];
/** What the header says while a participant's name is typed but not yet added. */
const TYPING: AutosaveState = { status: 'pending' };
// One element for the page's lifetime: React skips it when the page re-renders per key.
const SHORTCUT_HINTS = <ShortcutHints />;

/**
 * One inspection (brief §5.3): the front page, the checklist filled in from the keyboard and the
 * Deviation Summary, autosaved; Finalise locks it, and an admin can reopen it.
 */
export function InspectionEditor({ loaded, onReload }: Props) {
  const { inspection } = loaded;
  const { id, number, templateSnapshot, templateRevision } = inspection;
  // The frozen checklist keeps its identity for the page's lifetime, so the sheet's memoised
  // rows never re-render because of it (only the ETag is taken from save answers).
  const sections = templateSnapshot.sections;
  const queryClient = useQueryClient();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const settings = useSettings();
  const respHistory = useRespHistory();
  const idPrefix = useId();
  // Back to the list as it was left (search and filters); one element for the page's lifetime.
  const [backLink] = useState(() => <BackLink to={inspectionsListHref()} label="Inspections" />);

  const [draft, setDraft] = useState<InspectionDraftInput>(() => draftOf(inspection));
  // The latest draft, for event handlers that run before React re-renders.
  const draftRef = useRef(draft);
  const [server, setServer] = useState<ServerState>(() => serverState(inspection));
  const finalised = server.state === 'finalised';

  // The list (progress, #NOK) is refetched when it is next shown, not after every autosave.
  const markListStale = () =>
    void queryClient.invalidateQueries({ queryKey: inspectionKeys.list, refetchType: 'none' });

  const [saver, saveState] = useAutosave<InspectionDraftInput>({
    etag: loaded.etag,
    save: async (input, ifMatch) => {
      const saved = await saveInspection(id, input, ifMatch);
      markListStale();
      return saved.etag;
    },
    // After saves that failed on the way, a 412 may be our own doing: was one of them stored?
    reconcile: async () => {
      const current = await fetchInspection(id);
      return { etag: current.etag, value: draftOf(current.inspection) };
    },
    equals: sameDraft,
  });

  // A machine photo that is still uploading counts as unsaved, and so does a participant's name
  // that is typed but not yet added (it isn't in the draft until then).
  const { uploading, trackUpload, saveAll: saveUploaded } = useUploadTracking(saver);
  const [participantPending, setParticipantPending] = useState(false);
  const commitParticipant = useRef<(() => void) | null>(null);
  const pendingParticipant = useMemo<PendingParticipant>(
    () => ({ onPendingChange: setParticipantPending, commitRef: commitParticipant }),
    [],
  );
  /** Saves everything, typed participant and photo included; false if saving failed. */
  const saveAll = useCallback(async () => {
    commitParticipant.current?.();
    return saveUploaded();
  }, [saveUploaded]);

  const dirty = saveState.status !== 'saved' || uploading || participantPending;
  const leaveGuard = useLeaveGuard(dirty, saveAll);
  const reload = useReload(dirty, onReload);

  const update = useCallback(
    (patch: Partial<InspectionDraftInput>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      saver.change(next);
    },
    [saver],
  );
  const updateFront = useCallback(
    (patch: Partial<InspectionFrontInput>) =>
      update({ front: { ...draftRef.current.front, ...patch } }),
    [update],
  );
  const updateResults = useCallback(
    (results: Record<string, RowResult>) => update({ results }),
    [update],
  );
  const updateExtraDeviation = useCallback(
    (extraId: string, patch: ExtraDeviationPatch) =>
      update({ extraDeviations: updateExtra(draftRef.current.extraDeviations, extraId, patch) }),
    [update],
  );
  // A row deviation's photos live in its result, an extra deviation's in itself. They reach here
  // once uploaded (the photo and its marked-up copy), so they autosave like any other change.
  const updateDeviationPhotos = useCallback(
    ({ kind, key }: InspectionDeviation, photos: AnnotatedImage[]) =>
      kind === 'row'
        ? update({ results: withPhotos(draftRef.current.results, key, photos) })
        : updateExtraDeviation(key, { photos }),
    [update, updateExtraDeviation],
  );

  // After an attempt to finalise with problems, they stay marked (and update as rows get a
  // status) until the inspection is finalised.
  const [checking, setChecking] = useState(false);
  const issueKey =
    checking && !finalised
      ? JSON.stringify(validateForFinalise(withSnapshot(inspection, draft)))
      : '';
  // Same problems → same array, so the checklist's memoised rows don't re-render per keystroke.
  const issues = useMemo(
    () => (issueKey ? (JSON.parse(issueKey) as FinaliseIssue[]) : NO_ISSUES),
    [issueKey],
  );
  const frontErrors = useMemo(() => frontIssues(issues), [issues]);
  const extraErrors = useMemo(() => extraIssues(issues), [issues]);

  // Same deviations → same array, so the (memoised) summary skips the comment typed on an OK row.
  const deviationKey = JSON.stringify(
    deriveDeviations({
      templateSnapshot,
      results: draft.results,
      extraDeviations: draft.extraDeviations,
    }),
  );
  const deviations = useMemo(
    () => JSON.parse(deviationKey) as InspectionDeviation[],
    [deviationKey],
  );
  const progress = useMemo(
    () => inspectionProgress({ templateSnapshot, results: draft.results }),
    [templateSnapshot, draft.results],
  );
  // The first row without a status; the same object while it stays the same row.
  const nextRow = indexItems(sections).find((item) => !draft.results[item.itemId]?.status);
  const nextItemId = nextRow?.itemId;
  const nextRef = nextRow?.ref;
  const nextEmpty = useMemo(
    () => (nextItemId && nextRef ? { itemId: nextItemId, ref: nextRef } : null),
    [nextItemId, nextRef],
  );
  // History plus this inspection's own names, taken when a Resp field is left: the text being
  // typed must not be offered to its own field (it would come first, as a prefix of the name it
  // was going to complete). Same list → same array (stable datalists).
  const [respNames, setRespNames] = useState(draft);
  const commitRespNames = useCallback(() => setRespNames(draftRef.current), []);
  const respKey = useMemo(
    () => JSON.stringify(respSuggestions(respHistory.data, respNames)),
    [respHistory.data, respNames],
  );
  const suggestions = useMemo(() => JSON.parse(respKey) as string[], [respKey]);

  // Tabs keep their own scroll position, so going back to the checklist returns to the row.
  const [tab, setTab] = useState<InspectionTab>('checklist');
  // The Deviations tab is rendered when first shown, then kept: opening an inspection doesn't
  // download every deviation photo for a tab that may not be looked at.
  const [deviationsShown, setDeviationsShown] = useState(false);
  const tabRef = useRef(tab);
  const scrollByTab = useRef<Record<InspectionTab, number>>({ checklist: 0, deviations: 0 });
  /** Shows the tab at once (so its elements can take the focus); false if it was showing. */
  const switchTab = useCallback((next: InspectionTab) => {
    if (next === tabRef.current) return false;
    scrollByTab.current[tabRef.current] = window.scrollY;
    tabRef.current = next;
    flushSync(() => {
      setTab(next);
      if (next === 'deviations') setDeviationsShown(true);
    });
    return true;
  }, []);
  const selectTab = useCallback(
    (next: InspectionTab) => {
      if (switchTab(next)) window.scrollTo({ top: scrollByTab.current[next] });
    },
    [switchTab],
  );
  /** Jump links: the problem's row or field, or a deviation's row. */
  const goTo = useCallback(
    ({ tab: targetTab, elementId }: FocusTarget) => {
      switchTab(targetTab);
      const element = document.getElementById(elementId);
      if (!element) return;
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: 'center' });
    },
    [switchTab],
  );
  const goToRow = useCallback(
    (itemId: string) => goTo({ tab: 'checklist', elementId: rowElementId(itemId) }),
    [goTo],
  );
  /** A NOK row's photo count: its card's first photo button (Add photo, or the first photo). */
  const goToPhotos = useCallback(
    (itemId: string) => {
      switchTab('deviations');
      const photos = document.getElementById(deviationPhotosId(itemId));
      if (!photos) return;
      (photos.querySelector<HTMLElement>('button') ?? photos).focus({ preventScroll: true });
      (photos.closest('article') ?? photos).scrollIntoView({ block: 'center' });
    },
    [switchTab],
  );

  const addExtraDeviation = useCallback(() => {
    const extra = newExtraDeviation();
    // Rendered at once, so its description can take the focus.
    flushSync(() => update({ extraDeviations: [...draftRef.current.extraDeviations, extra] }));
    const field = document.getElementById(extraDescriptionId(extra.id));
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
  }, [update]);
  const removeExtraDeviation = useCallback(
    (extraId: string) => {
      update({ extraDeviations: removeExtra(draftRef.current.extraDeviations, extraId) });
      commitRespNames();
    },
    [update, commitRespNames],
  );

  const headerRef = useRef<HTMLElement>(null);
  useScrollPaddingBelow(headerRef);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<StateChange | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [stateConflict, setStateConflict] = useState(false);
  const continueId = `${idPrefix}-continue`;

  // Finalise and Reopen swap places under the keyboard focus: the notice takes it instead.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  // On open the keyboard starts at "Continue at 3.b" (when there is one), so a single Enter
  // resumes transcribing. Without a row to continue at, the focus stays where it was. The id never
  // changes, so this runs once, when the page opens.
  useEffect(() => {
    document.getElementById(continueId)?.focus({ preventScroll: true });
  }, [continueId]);

  const conflict = saveState.status === 'conflict' || stateConflict;

  /**
   * The print route loads the inspection from the server, so pending changes are saved first; if
   * that fails, the save status and its alert say why and nothing opens. It opens in a new tab,
   * which prints as soon as it has loaded.
   */
  async function openPrint(mode: PrintMode) {
    if (!(await saveAll())) return;
    window.open(inspectionPrintHref(id, mode, true), '_blank', 'noopener');
  }

  function openFinalise() {
    const found = validateForFinalise(withSnapshot(inspection, draftRef.current));
    if (found.length > 0) setChecking(true);
    setNotice(null);
    setDialog({ change: 'finalise', issues: found });
  }

  /**
   * Finalise or reopen the version on screen. Finalising saves pending edits first, so what is
   * locked is what the user sees. An answer lost on the way (network, timeout, 5xx, or a 412 for
   * a retry the server had already carried out) is checked by reading the inspection again.
   */
  async function change(action: StateChange): Promise<StateOutcome> {
    const verb = action === 'finalise' ? 'Finalise' : 'Reopen';
    if (action === 'finalise' && !(await saveAll())) {
      const state = saver.getState();
      if (state.status === 'conflict') return { kind: 'conflict' };
      return {
        kind: 'failed',
        message: `Your latest changes couldn’t be saved, so nothing was finalised. ${
          state.status === 'error' ? state.message : 'Check your connection and try again.'
        }`,
      };
    }
    try {
      adopt(await changeState(id, action, saver.etag()), action);
      return { kind: 'done' };
    } catch (failure) {
      const found = finaliseIssuesOf(failure);
      if (found) {
        setChecking(true);
        return { kind: 'issues', issues: found };
      }
      // The server changed nothing: the same request can simply be sent again.
      if (isUnavailable(failure)) {
        return { kind: 'failed', message: `${verb} didn’t complete – try again.` };
      }
      const refused =
        failure instanceof ApiRequestError && failure.status < 500 && failure.status !== 412;
      if (!refused) {
        const current = await fetchInspection(id).catch(() => null);
        const wanted = action === 'finalise' ? 'finalised' : 'in_progress';
        if (
          current?.inspection.state === wanted &&
          sameDraft(draftOf(current.inspection), draftRef.current)
        ) {
          adopt(current, action);
          return { kind: 'done' };
        }
      }
      if (isConflict(failure)) {
        setStateConflict(true);
        return { kind: 'conflict' };
      }
      return { kind: 'failed', message: errorMessage(failure) };
    }
  }

  function adopt({ inspection: changed, etag }: LoadedInspection, action: StateChange) {
    // Reopening carries on autosaving from this version.
    saver.setEtag(etag);
    setServer(serverState(changed));
    if (action === 'finalise') setChecking(false);
    setNotice(action);
    markListStale();
  }

  const modelLabel = modelName(settings.data?.machineModels, inspection.front.modelCode);
  const machine = draft.front.machineName.trim();

  return (
    // A Resp field that is left adds its name to the suggestions (React's onBlur bubbles).
    <div
      onBlur={(event) => {
        if (event.target instanceof HTMLInputElement && event.target.hasAttribute('list')) {
          commitRespNames();
        }
      }}
    >
      <title>{`${number}${machine ? ` · ${machine}` : ''} · ${APP_NAME}`}</title>
      {backLink}

      <header
        ref={headerRef}
        className="sticky top-14 z-20 mt-2 border-b border-ink-200 bg-canvas pt-3 lg:top-0"
      >
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            {/* Focusable from script: it takes the focus when a notice is dismissed. */}
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="truncate text-xl font-semibold tracking-tight text-ink-900 outline-none"
            >
              {number}
              <span className="font-normal text-ink-500"> · </span>
              {machine || <span className="font-normal text-ink-500">No machine name</span>}
            </h1>
            {/* Spaced, not separated by dots: on a narrow screen a dot would dangle at a line end. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
              <StateBadge state={server.state} />
              <span>{modelLabel}</span>
              <span>S/N {draft.front.serialNumber.trim() || '—'}</span>
              <span>
                {templateSnapshot.name} · Rev {templateRevision}
              </span>
              {finalised && server.finalisedAt && (
                <span>
                  Finalised {formatDateTime(server.finalisedAt)}
                  {server.finalisedBy && ` by ${server.finalisedBy}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(!finalised || saveState.status !== 'saved') && (
              <div className="mr-2">
                <SaveStatus
                  state={participantPending && saveState.status === 'saved' ? TYPING : saveState}
                  conflict={stateConflict}
                  onRetry={() => void saver.flush()}
                  onReload={reload.askReload}
                />
              </div>
            )}
            <ActionMenu
              label="Print / Save PDF"
              trigger={
                <>
                  <Printer size={16} aria-hidden="true" />
                  Print / Save PDF
                  <ChevronDown size={14} aria-hidden="true" className="-mr-1 text-ink-500" />
                </>
              }
              items={[
                {
                  label: 'Blank checklist',
                  icon: ClipboardList,
                  onSelect: () => void openPrint('blank'),
                },
                { label: 'Report', icon: ClipboardCheck, onSelect: () => void openPrint('report') },
              ]}
            />
            {!finalised ? (
              <Button onClick={openFinalise} disabled={conflict}>
                <Lock size={16} aria-hidden="true" />
                Finalise
              </Button>
            ) : (
              // Inspectors never see Reopen (brief §5.3: admin can reopen).
              isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotice(null);
                    setDialog({ change: 'reopen' });
                  }}
                  disabled={conflict}
                >
                  <LockOpen size={16} aria-hidden="true" />
                  Reopen
                </Button>
              )
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6">
          <TabBar
            idPrefix={idPrefix}
            selected={tab}
            deviationCount={deviations.length}
            onSelect={selectTab}
          />
          <ProgressSummary
            {...progress}
            nextEmpty={finalised ? null : nextEmpty}
            onContinue={goToRow}
            continueId={continueId}
          />
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
              <Button variant="secondary" onClick={openFinalise}>
                Show problems
              </Button>
            }
          >
            {issues.length === 1 ? 'One problem' : `${issues.length} problems`} to fix before
            finalising. They are marked in red.
          </Callout>
        )}
        {notice && (
          <div ref={noticeRef} tabIndex={-1} className="outline-none">
            <Callout
              tone="success"
              role="status"
              onDismiss={() => {
                setNotice(null);
                titleRef.current?.focus();
              }}
            >
              {notice === 'finalise' ? (
                <>
                  <strong className="font-semibold">Finalised.</strong> The inspection is locked;
                  only an admin can reopen it.
                </>
              ) : (
                <>
                  <strong className="font-semibold">Reopened.</strong> Changes are saved as you make
                  them until it is finalised again.
                </>
              )}
            </Callout>
          </div>
        )}
      </div>

      <div
        role="tabpanel"
        id={panelId(idPrefix, 'checklist')}
        aria-labelledby={tabId(idPrefix, 'checklist')}
        hidden={tab !== 'checklist'}
        className="mt-6"
      >
        <FrontPageCard
          front={draft.front}
          modelLabel={modelLabel}
          templateRevision={templateRevision}
          readOnly={finalised}
          errors={frontErrors}
          onChange={updateFront}
          onUpload={trackUpload}
          pendingParticipant={pendingParticipant}
        />
        <section aria-labelledby={`${idPrefix}-checklist`} className="mt-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id={`${idPrefix}-checklist`} className="text-base font-semibold text-ink-900">
              Checklist
            </h2>
            {!finalised && SHORTCUT_HINTS}
          </div>
          <ChecklistSheet
            sections={sections}
            results={draft.results}
            onChange={finalised ? undefined : updateResults}
            respSuggestions={suggestions}
            issues={issues}
            onShowPhotos={goToPhotos}
          />
        </section>
      </div>
      <div
        role="tabpanel"
        id={panelId(idPrefix, 'deviations')}
        aria-labelledby={tabId(idPrefix, 'deviations')}
        hidden={tab !== 'deviations'}
        className="mt-6"
      >
        {deviationsShown && (
          <DeviationSummary
            deviations={deviations}
            readOnly={finalised}
            issues={extraErrors}
            respSuggestions={suggestions}
            onGoToRow={goToRow}
            onAdd={addExtraDeviation}
            onUpdate={updateExtraDeviation}
            onRemove={removeExtraDeviation}
            onPhotosChange={updateDeviationPhotos}
          />
        )}
      </div>

      {dialog?.change === 'finalise' && (
        <StateChangeDialog
          title={`Finalise ${number}?`}
          description={
            <>
              {progress.total} rows checked,{' '}
              {deviations.length === 1 ? '1 deviation' : `${deviations.length} deviations`}. A
              finalised inspection is locked: nothing can be changed until an admin reopens it.
            </>
          }
          confirmLabel="Finalise"
          workingLabel="Finalising…"
          issues={dialog.issues}
          run={() => change('finalise')}
          onGoTo={(issue) => goTo(issueTarget(issue.target))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.change === 'reopen' && (
        <StateChangeDialog
          title={`Reopen ${number}?`}
          description="It can be edited again. Its deviations no longer count as finalised until it is finalised again."
          confirmLabel="Reopen"
          workingLabel="Reopening…"
          run={() => change('reopen')}
          onClose={() => setDialog(null)}
        />
      )}
      {reload.dialog}
      <LeaveDialog guard={leaveGuard} conflict={conflict} noun="inspection" />
    </div>
  );
}

function serverState({ state, finalisedAt, finalisedBy }: Inspection): ServerState {
  return { state, finalisedAt, finalisedBy };
}

/** The draft as the finalise rules see it: with the frozen checklist and the model. */
function withSnapshot(inspection: Inspection, draft: InspectionDraftInput) {
  return {
    ...draft,
    front: { ...draft.front, modelCode: inspection.front.modelCode },
    templateSnapshot: inspection.templateSnapshot,
  };
}
