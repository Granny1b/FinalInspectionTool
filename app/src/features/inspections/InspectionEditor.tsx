import {
  APP_NAME,
  CONFLICT_MESSAGE,
  deriveDeviations,
  hasRole,
  indexItems,
  inspectionProgress,
  validateForFinalise,
  type FinaliseIssue,
  type Inspection,
  type InspectionDeviation,
  type InspectionDraftInput,
  type InspectionFrontInput,
  type RowResult,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Lock, LockOpen, Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button, ButtonLink } from '../../components/Button';
import { ApiRequestError, errorMessage, isConflict, SIGNED_OUT_MESSAGE } from '../../lib/api';
import { LOGIN_PAGE } from '../../lib/auth';
import { SaveStatus } from '../../lib/autosave/SaveStatus';
import { useAutosave } from '../../lib/autosave/useAutosave';
import { useLeaveGuard } from '../../lib/autosave/useLeaveGuard';
import { formatDateTime } from '../../lib/format';
import { useCurrentUser } from '../../lib/useMe';
import { modelName, useSettings } from '../../lib/useSettings';
import { Callout } from '../templates/Callout';
import { ConfirmDialog } from '../templates/document/ConfirmDialog';
import { BackLink } from '../templates/PublishedTemplateView';
import { ChecklistSheet, ShortcutHints } from './checklist/ChecklistSheet';
import { DeviationSummary } from './DeviationSummary';
import { draftOf, sameDraft } from './draft';
import { newExtraDeviation, removeExtra, updateExtra, type ExtraDeviationPatch } from './extras';
import { FrontPageCard } from './FrontPageCard';
import { ProgressSummary, TabBar } from './HeaderParts';
import {
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
// One element each for the page's lifetime: React skips them when the page re-renders per key.
const SHORTCUT_HINTS = <ShortcutHints />;
const BACK_LINK = <BackLink to="/inspections" label="Inspections" />;

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

  // A machine photo that is still uploading counts as unsaved: leaving or finalising waits for
  // it, and closing the tab gets the browser's warning.
  const uploadRef = useRef<Promise<unknown> | null>(null);
  const [uploading, setUploading] = useState(false);
  const trackUpload = useCallback((upload: Promise<unknown>) => {
    uploadRef.current = upload;
    setUploading(true);
    const done = () => {
      if (uploadRef.current !== upload) return;
      uploadRef.current = null;
      setUploading(false);
    };
    upload.then(done, done);
  }, []);
  /** Saves everything, once a photo being uploaded is in the front page; false if saving failed. */
  const saveAll = useCallback(async () => {
    await uploadRef.current?.catch(() => undefined);
    return saver.flush();
  }, [saver]);

  const dirty = saveState.status !== 'saved' || uploading;
  const leaveGuard = useLeaveGuard(dirty, saveAll);

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
  // History plus this inspection's own names; same list → same array (stable datalists).
  const respKey = JSON.stringify(respSuggestions(respHistory.data, draft));
  const suggestions = useMemo(() => JSON.parse(respKey) as string[], [respKey]);

  // Tabs keep their own scroll position, so going back to the checklist returns to the row.
  const [tab, setTab] = useState<InspectionTab>('checklist');
  const tabRef = useRef(tab);
  const scrollByTab = useRef<Record<InspectionTab, number>>({ checklist: 0, deviations: 0 });
  /** Shows the tab at once (so its elements can take the focus); false if it was showing. */
  const switchTab = useCallback((next: InspectionTab) => {
    if (next === tabRef.current) return false;
    scrollByTab.current[tabRef.current] = window.scrollY;
    tabRef.current = next;
    flushSync(() => setTab(next));
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

  const addExtraDeviation = useCallback(() => {
    const extra = newExtraDeviation();
    // Rendered at once, so its description can take the focus.
    flushSync(() => update({ extraDeviations: [...draftRef.current.extraDeviations, extra] }));
    const field = document.getElementById(extraDescriptionId(extra.id));
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
  }, [update]);
  const removeExtraDeviation = useCallback(
    (extraId: string) =>
      update({ extraDeviations: removeExtra(draftRef.current.extraDeviations, extraId) }),
    [update],
  );

  const headerRef = useRef<HTMLElement>(null);
  useScrollPaddingBelow(headerRef);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState<StateChange | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [stateConflict, setStateConflict] = useState(false);
  const [confirmingReload, setConfirmingReload] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const printHintId = useId();

  // Finalise and Reopen swap places under the keyboard focus: the notice takes it instead.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const conflict = saveState.status === 'conflict' || stateConflict;

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

  /** Reload, asking first when it would discard unsaved changes. */
  const askReload = () => (dirty ? setConfirmingReload(true) : void reload());

  async function reload() {
    setConfirmingReload(false);
    setReloadFailed(!(await onReload()));
  }

  const modelLabel = modelName(settings.data?.machineModels, inspection.front.modelCode);
  const machine = draft.front.machineName.trim();

  return (
    <div>
      <title>{`${number}${machine ? ` · ${machine}` : ''} · ${APP_NAME}`}</title>
      {BACK_LINK}

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
                  state={saveState}
                  conflict={stateConflict}
                  onRetry={() => void saver.flush()}
                  onReload={askReload}
                />
              </div>
            )}
            {/* Planned (brief §6): focusable and with a tooltip, so it can say when it comes. */}
            <Button
              variant="secondary"
              aria-disabled
              aria-describedby={printHintId}
              title="Print / Save PDF: coming in phase 4"
              className="cursor-default opacity-50"
            >
              <Printer size={16} aria-hidden="true" />
              Print
            </Button>
            <span id={printHintId} className="sr-only">
              Coming in phase 4
            </span>
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
          />
        </div>
      </header>

      <div className="mt-6 space-y-3 empty:hidden">
        {conflict && (
          <Callout
            tone="error"
            role="alert"
            actions={
              <Button variant="secondary" onClick={askReload}>
                <RefreshCw size={16} aria-hidden="true" />
                Reload
              </Button>
            }
          >
            <strong className="font-semibold">{CONFLICT_MESSAGE}</strong>{' '}
            {dirty
              ? 'Your changes since then are not saved, and autosave is paused.'
              : 'Autosave is paused.'}
            {reloadFailed && ' Reloading failed: check your connection and try again.'}
          </Callout>
        )}
        {saveState.status === 'error' && !saveState.willRetry && (
          <Callout
            tone="error"
            role="alert"
            actions={
              // Signed out: sign in again in another tab, so this one keeps the unsaved changes.
              saveState.message === SIGNED_OUT_MESSAGE && (
                <ButtonLink to={LOGIN_PAGE} target="_blank" variant="secondary">
                  Sign in
                  <ExternalLink size={14} aria-hidden="true" />
                  <span className="sr-only">(opens a new tab)</span>
                </ButtonLink>
              )
            }
          >
            <strong className="font-semibold">Couldn’t save:</strong> {saveState.message}
          </Callout>
        )}
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
        <DeviationSummary
          deviations={deviations}
          readOnly={finalised}
          issues={extraErrors}
          respSuggestions={suggestions}
          onGoToRow={goToRow}
          onAdd={addExtraDeviation}
          onUpdate={updateExtraDeviation}
          onRemove={removeExtraDeviation}
        />
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
      {confirmingReload && (
        <ConfirmDialog
          title="Discard your changes?"
          message="Reloading shows the latest saved version. Your changes that weren’t saved are lost."
          confirmLabel="Discard and reload"
          onConfirm={() => void reload()}
          onCancel={() => setConfirmingReload(false)}
        />
      )}
      {leaveGuard.asking && (
        <ConfirmDialog
          title="Leave without saving?"
          message={
            conflict
              ? 'Someone else changed this inspection, so your latest changes couldn’t be saved. They are lost if you leave.'
              : 'Your latest changes couldn’t be saved yet. They are lost if you leave now.'
          }
          confirmLabel="Leave"
          onConfirm={leaveGuard.leave}
          onCancel={leaveGuard.stay}
        />
      )}
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
