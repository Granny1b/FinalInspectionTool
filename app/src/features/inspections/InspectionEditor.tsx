import {
  APP_NAME,
  deriveDeviations,
  hasRole,
  indexItems,
  INSPECTION_NOUNS,
  inspectionProgress,
  validateForFinalise,
  type AnnotatedImage,
  type FinaliseIssue,
  type FollowUpRequest,
  type Inspection,
  type InspectionDeviation,
  type InspectionDraftInput,
  type InspectionFrontInput,
  type RowResult,
} from '@modig/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardX,
  Eye,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Printer,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import { ActionMenu } from '../../components/ActionMenu';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
import { usePersonName } from '../../lib/usePeople';
import { modelName, useSettings } from '../../lib/useSettings';
import { useFollowUps, usePendingFollowUps, useSetFollowUp } from '../deviationLog/queries';
import { PickMachineDialog } from '../machines/MachineDialogs';
import { checklistHref, machineHref } from '../machines/model';
import { linkInspection, machineKeys } from '../machines/queries';
import { InspectionPreview } from '../print/InspectionPreview';
import { inspectionPrintHref, qualityCheckPrintHref } from '../print/links';
import { inspectionOnScreen } from '../print/preview';
import { QUALITY_PRINT_MODE_LABELS } from '../print/quality/model';
import { QualityCheckPreview } from '../print/quality/QualityCheckPreview';
import { ChecklistSheet, ShortcutHints } from './checklist/ChecklistSheet';
import { withPhotos } from './checklist/results';
import { DeleteInspectionDialog } from './DeleteInspectionDialog';
import { DeviationSummary } from './DeviationSummary';
import { draftOf, sameDraft } from './draft';
import { newExtraDeviation, removeExtra, updateExtra, type ExtraDeviationPatch } from './extras';
import { FrontPageCard } from './FrontPageCard';
import { ProgressSummary, TabBar } from './HeaderParts';
import {
  deviationCardId,
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
import { inspectionsListHref, type InspectionsPageState } from './listFilter';
import type { PendingParticipant } from './ParticipantsField';
import { QualityCheckFrontCard, type QualityStandard } from './quality/QualityCheckFront';
import { QualityCheckSheet } from './quality/QualityCheckSheet';
import {
  changeState,
  fetchInspection,
  finaliseIssuesOf,
  inspectionKeys,
  isUnavailable,
  saveInspection,
  useDeleteInspection,
  type LoadedInspection,
  type StateChange,
} from './queries';
import { StateBadge } from './StateBadge';
import { StateChangeDialog, type StateOutcome } from './StateChangeDialog';
import { useScrollPaddingBelow } from '../../lib/useScrollPaddingBelow';

type Props = {
  /** Read once, when the page opens; from then on the page's own state is the truth. */
  loaded: LoadedInspection;
  /** Loads the inspection again and reopens the page on it; false if loading failed. */
  onReload: () => Promise<boolean>;
  /** The tab it opens on (the deviation log links to the Deviations tab). */
  initialTab?: InspectionTab;
  /** A deviation's key: the Deviations tab opens at its card. */
  initialDeviation?: string;
};

/** What only the server changes: whether it is locked, and by whom. */
type ServerState = Pick<Inspection, 'state' | 'finalisedAt' | 'finalisedBy'>;

type DialogState = { change: 'finalise'; issues: FinaliseIssue[] } | { change: 'reopen' };

const NO_ISSUES: FinaliseIssue[] = [];
/** Until the settings have loaded: one array, so the memoised rows don't re-render for it. */
const NO_CHOICES: readonly string[] = [];
/** What the header says while a participant's name is typed but not yet added. */
const TYPING: AutosaveState = { status: 'pending' };
// One element for the page's lifetime: React skips it when the page re-renders per key.
const SHORTCUT_HINTS = <ShortcutHints />;
const QUALITY_SHORTCUT_HINTS = <ShortcutHints guide="Pictures" />;

/**
 * One inspection (brief §5.3): the front page, the checklist filled in from the keyboard and the
 * Deviation Summary, autosaved; Finalise locks it, and an admin can reopen it.
 *
 * A quality check done on a machine (kind `quality`) is the same page in a quality mode: its
 * shorter front page with the quality check it follows, each row a card with its pictures and
 * large OK / NOK / N/A buttons (QualityCheckSheet), and a report that prints whole or only its
 * deviations.
 */
export function InspectionEditor({
  loaded,
  onReload,
  initialTab = 'checklist',
  initialDeviation,
}: Props) {
  const { inspection } = loaded;
  const { id, kind, number, templateSnapshot, templateRevision } = inspection;
  const quality = kind === 'quality';
  /** "inspection", "quality check" */
  const noun = INSPECTION_NOUNS[kind];
  // The frozen checklist keeps its identity for the page's lifetime, so the sheet's memoised
  // rows never re-render because of it (only the ETag is taken from save answers).
  const sections = templateSnapshot.sections;
  const queryClient = useQueryClient();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const settings = useSettings();
  const responsibles = settings.data?.responsibles ?? NO_CHOICES;
  const categories = settings.data?.deviationCategories ?? NO_CHOICES;
  const personName = usePersonName();
  const idPrefix = useId();
  // A machine's check: its Machine ID and serial number are the machine's, and it leads back
  // there. Linking or unlinking opens the page again, so this holds for the page's lifetime.
  const machineRef = inspection.machineRef;
  const machinePage = machineRef ? machineHref(machineRef) : undefined;
  // Back to its machine, or to the list as it was left (search and filters); one element for the
  // page's lifetime.
  const [backLink] = useState(() =>
    machinePage ? (
      <BackLink to={machinePage} label={inspection.front.machineName || 'Machine'} />
    ) : (
      <BackLink to={inspectionsListHref(kind)} label={quality ? 'Quality checks' : 'Inspections'} />
    ),
  );
  // What a quality check follows, as frozen in it; the same object for the page's lifetime.
  const [standard] = useState<QualityStandard>(() => ({
    title: templateSnapshot.name,
    front: templateSnapshot.quality,
    revision: templateRevision,
  }));

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
  // A deviation photo open in the editor with marks: leaving asks first, saving can't keep them.
  const [editorDirty, setEditorDirty] = useState(false);
  // A quality check's rows have their own photo editors: one is open at a time.
  const onEditorDirtyChange = setEditorDirty;
  // Once deleted (admins), there is nothing left to save: the page just goes.
  const [deleted, setDeleted] = useState(false);
  const leaveGuard = useLeaveGuard(dirty && !deleted, saveAll, editorDirty && !deleted);
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
  // Tabs keep their own scroll position, so going back to the checklist returns to the row.
  const [tab, setTab] = useState<InspectionTab>(initialTab);
  // The Deviations tab is rendered when first shown, then kept: opening an inspection doesn't
  // download every deviation photo for a tab that may not be looked at.
  const [deviationsShown, setDeviationsShown] = useState(initialTab === 'deviations');
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

  // Each deviation's follow-up (open or closed) on the Deviations tab, as in the deviation log,
  // read once the tab is shown. Closing one saves pending edits first, so a deviation just marked
  // is on the server; once finalised there is nothing to save.
  const followUps = useFollowUps(id, deviationsShown);
  const { mutate: sendFollowUp } = useSetFollowUp();
  const pendingAll = usePendingFollowUps();
  const pendingFollowUps = useMemo(
    () =>
      new Set(
        [...pendingAll]
          .filter((pending) => pending.startsWith(`${id}/`))
          .map((pending) => pending.slice(id.length + 1)),
      ),
    [pendingAll, id],
  );
  const [followUpFailure, setFollowUpFailure] = useState<string | null>(null);
  const followUp = useCallback(
    (deviation: InspectionDeviation, request: FollowUpRequest) => {
      setFollowUpFailure(null);
      const what = request.status === 'open' ? 'reopened' : 'closed';
      sendFollowUp(
        {
          inspectionId: id,
          kind,
          key: deviation.key,
          request,
          prepare: server.state === 'finalised' ? undefined : saveAll,
        },
        {
          onError: (failure) =>
            setFollowUpFailure(
              `${number} · ${deviation.number} could not be ${what}. ${errorMessage(failure)}`,
            ),
        },
      );
    },
    [id, kind, number, sendFollowUp, saveAll, server.state],
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
  // The quick preview shows what is on screen, so it needs no save first (unlike printing).
  // The same object while nothing changes, so its pages are laid out once.
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<HTMLButtonElement>(null);
  const previewed = useMemo(
    () => (previewing ? inspectionOnScreen(inspection, draft, server) : null),
    [previewing, inspection, draft, server],
  );
  const closePreview = () => {
    setPreviewing(false);
    // The dialog hands the focus back to what had it, but Safari doesn't focus a button that is
    // clicked or tapped: back to Preview in any case.
    previewRef.current?.focus();
  };
  const continueId = `${idPrefix}-continue`;

  // Finalise and Reopen swap places under the keyboard focus: the notice takes it instead.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  // On open the keyboard starts at "Continue at 3.b" (when there is one), so a single Enter
  // resumes transcribing. Without a row to continue at, the focus stays where it was. Opened from
  // the deviation log at one deviation, it starts at that deviation's card instead; opened on the
  // Deviations tab otherwise, where it is. None of these change, so this runs once, when the page
  // opens.
  useEffect(() => {
    if (initialDeviation) {
      const card = document.getElementById(deviationCardId(initialDeviation));
      card?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'center' });
      return;
    }
    if (initialTab === 'checklist') {
      document.getElementById(continueId)?.focus({ preventScroll: true });
    }
  }, [continueId, initialDeviation, initialTab]);

  const conflict = saveState.status === 'conflict' || stateConflict;

  /**
   * The print route (`href`, which prints as soon as it has loaded) loads the inspection from the
   * server, so pending changes are saved first; if that fails, the save status and its alert say
   * why and nothing opens. It opens in a new tab.
   */
  async function openPrint(href: string) {
    if (!(await saveAll())) return;
    window.open(href, '_blank', 'noopener');
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

  const navigate = useNavigate();
  const remove = useDeleteInspection(id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * Saves what is pending first, so the delete names the latest version (an autosave landing
   * meanwhile would make it fail on the page's own save; a failed save leaves the ETag of the last
   * one that worked). Then autosave stops, so no save or retry is sent after the delete; if the
   * delete fails, it carries on.
   */
  function deleteInspection() {
    remove.mutate(
      async () => {
        await saveAll();
        saver.dispose();
        return saver.etag();
      },
      {
        onSuccess: () => setDeleted(true),
        onError: (failure) => {
          saver.revive();
          // Stopping cleared the timer of a failed save's retry: retry it now.
          const state = saver.getState();
          if (state.status === 'error' && state.willRetry) void saver.flush();
          // Someone else's save got in first: the page is outdated, as after a finalise's 412.
          if (isConflict(failure)) setStateConflict(true);
        },
      },
    );
  }

  // After the render that let go of the leave guard.
  useEffect(() => {
    if (!deleted) return;
    const state: InspectionsPageState = { deleted: number };
    void navigate(inspectionsListHref(kind), { replace: true, state });
  }, [deleted, navigate, number, kind]);

  // Admins: which machine it belongs to. Pending edits are saved first, so the link is made on
  // the version on screen; then the page opens again on what was stored.
  const [machineDialog, setMachineDialog] = useState<'link' | 'unlink' | null>(null);
  const [unlinkFailure, setUnlinkFailure] = useState<string | null>(null);
  async function changeMachine(next: string | null) {
    if (!(await saveAll())) {
      throw new ApiRequestError(409, {
        error: 'conflict',
        message: 'Your latest changes couldn’t be saved, so nothing was changed.',
      });
    }
    const linked = await linkInspection(id, next, saver.etag());
    // Saving carries on from the linked version, should opening it again fail.
    saver.setEtag(linked.etag);
    void queryClient.invalidateQueries({ queryKey: machineKeys.all });
    markListStale();
    await onReload();
  }

  // What Print / Save PDF offers: an inspection's blank checklist or its report; a quality check's
  // entire report (everything), only its checklist, only its deviations (to close them at the
  // machine) or its instructions, a manual for the operator as this check has them (it has no
  // blank form).
  const printItems = quality
    ? [
        {
          label: QUALITY_PRINT_MODE_LABELS.report,
          icon: ClipboardCheck,
          onSelect: () => void openPrint(qualityCheckPrintHref(id, { mode: 'report' }, true)),
        },
        {
          label: QUALITY_PRINT_MODE_LABELS.checklist,
          icon: ClipboardList,
          onSelect: () => void openPrint(qualityCheckPrintHref(id, { mode: 'checklist' }, true)),
        },
        {
          label: QUALITY_PRINT_MODE_LABELS.deviations,
          icon: ClipboardX,
          onSelect: () => void openPrint(qualityCheckPrintHref(id, { mode: 'deviations' }, true)),
        },
        {
          label: QUALITY_PRINT_MODE_LABELS.instructions,
          icon: BookOpen,
          onSelect: () => void openPrint(qualityCheckPrintHref(id, { mode: 'instructions' }, true)),
        },
      ]
    : [
        {
          label: 'Blank checklist',
          icon: ClipboardList,
          onSelect: () => void openPrint(inspectionPrintHref(id, 'blank', true)),
        },
        {
          label: 'Report',
          icon: ClipboardCheck,
          onSelect: () => void openPrint(inspectionPrintHref(id, 'report', true)),
        },
      ];

  const modelLabel = modelName(settings.data?.machineModels, inspection.front.modelCode);
  // Its Machine ID, on a quality check as on a final inspection (one started before quality checks
  // had one has none until it is filled in).
  const machine = draft.front.machineName.trim();
  // Once finalised there is nothing left to save: the header says so only if saving failed.
  const showSaveStatus = !finalised || saveState.status !== 'saved';

  return (
    <div>
      <title>{`${number}${machine ? ` · ${machine}` : ''} · ${APP_NAME}`}</title>
      {backLink}

      {/*
        Sticky where it leaves room to work. On a phone, upright or on its side, the header takes
        several lines (a third of the screen, more with the keyboard open), so it scrolls away.
      */}
      <header
        ref={headerRef}
        className="top-14 z-20 mt-2 border-b border-ink-200 bg-canvas pt-3 lg:top-0 sm:[@media(min-height:40rem)]:sticky"
      >
        {/*
          Laid out by its own width. From 42rem (a tablet, upright or on its side beside the
          sidebar) the actions are beside the title and the details run under both, which keeps
          the sticky header to three lines. The save status goes at the end of the details line,
          under the actions, until 52rem (a desktop), where it fits before them. The details keep
          room for its longest text, so a change in it (Saved, Unsaved changes) never re-wraps
          anything and the header never changes height while typing. Narrower (a phone), the
          status and then the actions go under the details, so a Machine ID is never cut to "R…".
        */}
        <div className="@container">
          <div className="grid grid-cols-[minmax(0,1fr)] @min-[42rem]:grid-cols-[minmax(0,1fr)_auto] @min-[42rem]:gap-x-6 @min-[52rem]:grid-cols-[minmax(0,1fr)_auto_auto]">
            {/* Focusable from script: it takes the focus when a notice is dismissed. */}
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="truncate text-xl font-semibold tracking-tight text-ink-900 outline-none @min-[42rem]:col-start-1 @min-[42rem]:row-start-1 @min-[42rem]:self-center"
            >
              {number}
              <span className="font-normal text-ink-500"> · </span>
              {machine || <span className="font-normal text-ink-500">No Machine ID</span>}
            </h1>
            {/*
              Spaced, not separated by dots: on a narrow screen a dot would dangle at a line end.
              On a tablet it keeps room at its end for the save status's longest text.
            */}
            <div
              className={clsx(
                'mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 @min-[42rem]:col-span-2 @min-[42rem]:col-start-1 @min-[42rem]:row-start-2 @min-[52rem]:col-span-3',
                showSaveStatus && '@min-[42rem]:pr-44 @min-[52rem]:pr-0',
              )}
            >
              <StateBadge state={server.state} />
              <span>{modelLabel}</span>
              {quality && (
                <span>
                  {templateSnapshot.name} · Rev {templateRevision}
                </span>
              )}
              <span>S/N {draft.front.serialNumber.trim() || '—'}</span>
              {!quality && (
                <span>
                  {templateSnapshot.name} · Rev {templateRevision}
                </span>
              )}
              {finalised && server.finalisedAt && (
                <span>
                  Finalised {formatDateTime(server.finalisedAt)}
                  {server.finalisedBy && ` by ${personName(server.finalisedBy)}`}
                </span>
              )}
            </div>
            {showSaveStatus && (
              // A line of its own on a phone, so the buttons share one. Beside the details (and
              // before the actions) it is only as high as its text, so their line keeps its height.
              <div className="mt-3 @min-[42rem]:col-start-2 @min-[42rem]:row-start-2 @min-[42rem]:mt-1.5 @min-[42rem]:self-center @min-[42rem]:justify-self-end @min-[52rem]:row-start-1 @min-[52rem]:mt-0 @min-[52rem]:-mr-2">
                <SaveStatus
                  state={participantPending && saveState.status === 'saved' ? TYPING : saveState}
                  conflict={stateConflict}
                  onRetry={() => void saver.flush()}
                  onReload={reload.askReload}
                  height="h-9 @min-[42rem]:h-5"
                />
              </div>
            )}
            <div
              className={clsx(
                'flex flex-wrap items-center gap-2 @max-[36rem]:gap-x-1.5 @min-[42rem]:col-start-2 @min-[42rem]:row-start-1 @min-[42rem]:mt-0 @min-[52rem]:col-start-3',
                showSaveStatus ? 'mt-2' : 'mt-3',
              )}
            >
              <Button ref={previewRef} variant="secondary" onClick={() => setPreviewing(true)}>
                <Eye size={16} aria-hidden="true" />
                Preview
              </Button>
              <ActionMenu
                label="Print / Save PDF"
                trigger={
                  <>
                    <Printer size={16} aria-hidden="true" />
                    {/* "Print" on a phone, so the three buttons share a line; the name stays whole. */}
                    <span>
                      Print<span className="@max-[36rem]:sr-only"> / Save PDF</span>
                    </span>
                    <ChevronDown size={14} aria-hidden="true" className="-mr-1 text-ink-500" />
                  </>
                }
                items={printItems}
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
              {/*
                Admins only, as on the template editor; mainly to clear out trial inspections. On a
                phone it moves 4 px closer (its icon has room of its own), so it still shares the
                buttons' line on a 390 px screen.
              */}
              {isAdmin && (
                <span className="inline-flex @max-[36rem]:-ml-1">
                  <ActionMenu
                    label={quality ? 'Quality check actions' : 'Inspection actions'}
                    triggerData={{ 'data-inspection-menu': '' }}
                    items={[
                      // Its own checklist, for its machine only (saved first, as any link).
                      ...(machineRef && !finalised
                        ? [
                            {
                              label: 'Edit checklist',
                              icon: Pencil,
                              onSelect: () => void navigate(checklistHref(kind, id)),
                            },
                          ]
                        : []),
                      machineRef
                        ? {
                            label: 'Unlink from the machine',
                            icon: Unlink,
                            onSelect: () => {
                              setUnlinkFailure(null);
                              setMachineDialog('unlink');
                            },
                          }
                        : {
                            label: 'Link to a machine…',
                            icon: Link2,
                            onSelect: () => setMachineDialog('link'),
                          },
                      {
                        label: quality ? 'Delete quality check' : 'Delete inspection',
                        icon: Trash2,
                        danger: true,
                        onSelect: () => {
                          remove.reset();
                          setConfirmingDelete(true);
                        },
                      },
                    ]}
                  />
                </span>
              )}
            </div>
          </div>
          {/*
            Wrapped in reverse: when the progress doesn't fit beside the tabs (a phone), it goes
            above them, so the tabs stay on the header's bottom line. `items-start` is the bottom
            edge here.
          */}
          <div className="mt-2 flex flex-wrap-reverse items-start justify-between gap-x-6">
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
        {followUpFailure && (
          <Callout tone="error" role="alert" onDismiss={() => setFollowUpFailure(null)}>
            {followUpFailure}
          </Callout>
        )}
        {unlinkFailure && (
          <Callout tone="error" role="alert" onDismiss={() => setUnlinkFailure(null)}>
            It could not be unlinked. {unlinkFailure}
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
                  <strong className="font-semibold">Finalised.</strong> The {noun} is locked; only
                  an admin can reopen it.
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
        {quality ? (
          <QualityCheckFrontCard
            front={draft.front}
            modelLabel={modelLabel}
            standard={standard}
            readOnly={finalised}
            errors={frontErrors}
            onChange={updateFront}
            pendingParticipant={pendingParticipant}
            machineHref={machinePage}
          />
        ) : (
          <FrontPageCard
            front={draft.front}
            modelLabel={modelLabel}
            templateRevision={templateRevision}
            readOnly={finalised}
            errors={frontErrors}
            onChange={updateFront}
            onUpload={trackUpload}
            pendingParticipant={pendingParticipant}
            machineHref={machinePage}
          />
        )}
        <section aria-labelledby={`${idPrefix}-checklist`} className="mt-10">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 id={`${idPrefix}-checklist`} className="text-base font-semibold text-ink-900">
              Checklist
            </h2>
            {!finalised && (quality ? QUALITY_SHORTCUT_HINTS : SHORTCUT_HINTS)}
          </div>
          {quality ? (
            <QualityCheckSheet
              sections={sections}
              results={draft.results}
              onChange={finalised ? undefined : updateResults}
              responsibles={responsibles}
              categories={categories}
              issues={issues}
              onEditorDirtyChange={onEditorDirtyChange}
            />
          ) : (
            <ChecklistSheet
              sections={sections}
              results={draft.results}
              onChange={finalised ? undefined : updateResults}
              responsibles={responsibles}
              categories={categories}
              issues={issues}
              onShowPhotos={goToPhotos}
            />
          )}
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
            responsibles={responsibles}
            categories={categories}
            onGoToRow={goToRow}
            onAdd={addExtraDeviation}
            onUpdate={updateExtraDeviation}
            onRemove={removeExtraDeviation}
            onPhotosChange={updateDeviationPhotos}
            onEditorDirtyChange={setEditorDirty}
            inspectionNumber={number}
            followUps={followUps.data?.followUps ?? null}
            pendingFollowUps={pendingFollowUps}
            onFollowUp={followUp}
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
              finalised {noun} is locked: nothing can be changed until an admin reopens it.
            </>
          }
          confirmLabel="Finalise"
          workingLabel="Finalising…"
          issues={dialog.issues}
          noun={noun}
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
      {previewed &&
        (quality ? (
          <QualityCheckPreview
            inspection={previewed}
            onPrint={(mode, deviationsPerPage) =>
              void openPrint(qualityCheckPrintHref(id, { mode, deviationsPerPage }, true))
            }
            onClose={closePreview}
          />
        ) : (
          <InspectionPreview
            inspection={previewed}
            onPrint={(mode) => void openPrint(inspectionPrintHref(id, mode, true))}
            onClose={closePreview}
          />
        ))}
      {confirmingDelete && (
        <DeleteInspectionDialog
          kind={kind}
          number={number}
          machine={machine}
          finalised={finalised}
          busy={remove.isPending || deleted}
          error={remove.error}
          onDelete={deleteInspection}
          onReload={reload.askReload}
          onClose={() => {
            setConfirmingDelete(false);
            // The menu item that opened it is gone with its menu: back to the menu's button.
            if (!deleted) {
              document.querySelector<HTMLElement>('[data-inspection-menu]')?.focus();
            }
          }}
        />
      )}
      {machineDialog === 'link' && (
        <PickMachineDialog
          noun={noun}
          modelCode={inspection.front.modelCode}
          onPick={changeMachine}
          onClose={() => setMachineDialog(null)}
        />
      )}
      {machineDialog === 'unlink' && (
        <ConfirmDialog
          title={`Unlink ${number} from ${inspection.front.machineName}?`}
          message={`It no longer belongs to the machine: its page, status and Insights leave it out. The ${noun} itself stays as it is, its Machine ID and serial number too, and it can be linked again.`}
          confirmLabel="Unlink"
          onConfirm={() => {
            setMachineDialog(null);
            changeMachine(null).catch((failure: unknown) =>
              setUnlinkFailure(errorMessage(failure)),
            );
          }}
          onCancel={() => setMachineDialog(null)}
        />
      )}
      {reload.dialog}
      <LeaveDialog guard={leaveGuard} conflict={conflict} noun={noun} />
    </div>
  );
}

function serverState({ state, finalisedAt, finalisedBy }: Inspection): ServerState {
  return { state, finalisedAt, finalisedBy };
}

/** The draft as the finalise rules see it: with its kind, the frozen checklist and the model. */
function withSnapshot(inspection: Inspection, draft: InspectionDraftInput) {
  return {
    ...draft,
    kind: inspection.kind,
    front: { ...draft.front, modelCode: inspection.front.modelCode },
    templateSnapshot: inspection.templateSnapshot,
  };
}
