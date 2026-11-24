import { hasRole, TemplateSchema } from '@modig/shared';
import { useQueries } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ClipboardCheck,
  Copy,
  CornerDownLeft,
  Factory,
  FileText,
  History,
  LayoutTemplate,
  ListOrdered,
  LoaderCircle,
  Package,
  Search,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../../lib/api';
import { useCurrentUser } from '../../lib/useMe';
import { useSettings } from '../../lib/useSettings';
import { useInspections } from '../inspections/queries';
import { useMachines } from '../machines/queries';
import { assemblyInstructions, templateKeys, useTemplates } from '../templates/queries';
import {
  buildHits,
  HIT_GROUP_LABELS,
  markWords,
  searchHits,
  type Hit,
  type HitGroup,
} from './hits';
import { RECENT_KIND_LABELS, recentHref, useRecents, type Recent, type RecentKind } from './recent';

const GROUP_ICONS: Record<HitGroup, LucideIcon> = {
  machines: Factory,
  steps: ListOrdered,
  parts: Package,
  documents: FileText,
  instructions: Wrench,
  checks: ClipboardCheck,
  templates: LayoutTemplate,
};
const RECENT_ICONS: Record<RecentKind, LucideIcon> = {
  machine: Factory,
  'machine-assembly': Wrench,
  instruction: Wrench,
  final: ClipboardCheck,
  quality: ClipboardCheck,
  template: LayoutTemplate,
};

/** One line of the list: a hit, or something to continue with. */
type Row = {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
  copy?: string;
};

/**
 * The search, over everything: opened from the sidebar or with Ctrl+K. Empty, it offers what was
 * last open on this device, to continue where one left off. Typing lists what matches as it is
 * typed, by kind in a fixed order, each hit saying where it leads; Enter opens the one marked,
 * the arrow keys move the mark. A document's path can be copied straight from its hit.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const recents = useRecents();

  const machines = useMachines();
  const finals = useInspections('final');
  const quality = useInspections('quality');
  const templates = useTemplates();
  const settings = useSettings();
  // The published instructions, to look inside them. A revision never changes, so each is
  // fetched once and kept.
  const published = useMemo(
    () =>
      assemblyInstructions(templates.data ?? []).filter(
        (instruction) => instruction.publishedRevision !== null,
      ),
    [templates.data],
  );
  const revisions = useQueries({
    queries: published.map((instruction) => ({
      queryKey: templateKeys.revision(instruction.id, instruction.publishedRevision!),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (
          await apiFetch(
            `/api/templates/${encodeURIComponent(instruction.id)}/revisions/${instruction.publishedRevision}`,
            { schema: TemplateSchema, signal },
          )
        ).data,
      staleTime: Infinity,
    })),
  });
  const loading =
    machines.isPending ||
    finals.isPending ||
    quality.isPending ||
    templates.isPending ||
    revisions.some((revision) => revision.isPending);
  // Same revisions → same list, so the hits are built once, not at every keystroke.
  const loadedKey = revisions.map((revision) => revision.dataUpdatedAt).join(',');
  const instructions = useMemo(
    () => revisions.flatMap((revision) => (revision.data ? [revision.data] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `revisions` is a new array each render
    [loadedKey],
  );

  const hits = useMemo(() => {
    // An instruction last worked on a machine here leads back to that machine.
    const onMachine = new Map<string, { path: string; machineName: string }>();
    for (const recent of [...recents].reverse()) {
      if (recent.kind !== 'machine-assembly' || !recent.templateId) continue;
      const machineName = recent.title.split(' – ').at(-1) ?? recent.title;
      onMachine.set(recent.templateId, { path: recent.path, machineName });
    }
    return buildHits({
      machines: machines.data ?? [],
      inspections: [...(finals.data ?? []), ...(quality.data ?? [])],
      templates: templates.data ?? [],
      instructions,
      models: settings.data?.machineModels,
      isAdmin,
      onMachine,
    });
  }, [
    machines.data,
    finals.data,
    quality.data,
    templates.data,
    instructions,
    settings.data,
    isAdmin,
    recents,
  ]);

  const results = useMemo(() => searchHits(hits, query), [hits, query]);
  const searching = query.trim() !== '';
  const sections: { label: string; more: number; rows: Row[] }[] = searching
    ? results.groups.map(({ group, hits: found, total }) => ({
        label: HIT_GROUP_LABELS[group],
        more: total - found.length,
        rows: found.map((hit: Hit) => ({ ...hit, icon: GROUP_ICONS[group] })),
      }))
    : recents.length > 0
      ? [
          {
            label: 'Continue where you left off',
            more: 0,
            rows: recents.map((recent: Recent) => ({
              key: recent.path,
              icon: RECENT_ICONS[recent.kind] ?? History,
              title: recent.title,
              detail: [RECENT_KIND_LABELS[recent.kind], recent.place].filter(Boolean).join(' · '),
              href: recentHref(recent),
            })),
          },
        ]
      : [];
  const rows = sections.flatMap((section) => section.rows);
  // Each section's first line's place among all lines, which is what the arrow keys count.
  const starts = sections.map((_, at) =>
    sections.slice(0, at).reduce((sum, section) => sum + section.rows.length, 0),
  );
  const marked = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  // The marked line stays in sight as the arrows move it.
  useEffect(() => {
    listRef.current?.querySelector('[data-marked="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [marked, query]);

  function open(row: Row | undefined) {
    if (!row) return;
    dialogRef.current?.close();
    void navigate(row.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((marked + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(rows[marked]);
    } else if (event.key === 'Escape') {
      // A search field's own Escape only empties it: here it closes the search, as it says.
      event.preventDefault();
      dialogRef.current?.close();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search"
      onClose={onClose}
      // A click beside the box closes it, as a menu.
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      className="mx-auto mt-[10vh] mb-auto max-h-[78vh] w-[min(44rem,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-ink-200 bg-overlay p-0 text-ink-900 shadow-2xl backdrop:bg-scrim/30 open:flex dark:border-ink-300 dark:backdrop:bg-scrim/70"
    >
      <div className="flex items-center gap-3 border-b border-ink-200 px-4">
        <Search size={18} aria-hidden="true" className="shrink-0 text-ink-500" />
        <input
          type="search"
          role="combobox"
          aria-label="Search everything"
          aria-expanded={rows.length > 0}
          aria-controls="search-results"
          aria-activedescendant={rows[marked] ? `search-row-${marked}` : undefined}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Machine, assy or part number, drawing, step, FI- or QC-number…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-500"
        />
        {loading && (
          <LoaderCircle size={16} aria-label="Loading" className="animate-spin text-ink-400" />
        )}
        <kbd className="hidden rounded border border-ink-200 px-1.5 py-0.5 text-[0.6875rem] text-ink-500 sm:block">
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id="search-results"
        role="listbox"
        aria-label="Results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
      >
        {sections.map((section, sectionAt) => (
          <div key={section.label} role="group" aria-label={section.label} className="pb-1">
            <p className="px-4 pt-2 pb-1 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
              {section.label}
            </p>
            {section.rows.map((row, rowAt) => {
              const at = starts[sectionAt]! + rowAt;
              const isMarked = at === marked;
              const Icon = row.icon;
              return (
                // The whole line opens it; the mark follows the pointer, as in a menu.
                <div
                  key={row.key}
                  id={`search-row-${at}`}
                  role="option"
                  aria-selected={isMarked}
                  data-marked={isMarked}
                  onMouseMove={() => setActive(at)}
                  onClick={() => open(row)}
                  className={clsx(
                    'mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2',
                    isMarked && 'bg-brand-50 dark:bg-brand-100',
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={clsx('shrink-0', isMarked ? 'text-brand-600' : 'text-ink-400')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {markWords(row.title, results.words).map((piece, piece_index) =>
                        piece.hit ? (
                          <mark
                            key={piece_index}
                            className="rounded-xs bg-transparent font-semibold text-brand-700"
                          >
                            {piece.text}
                          </mark>
                        ) : (
                          piece.text
                        ),
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-500">{row.detail}</span>
                  </span>
                  {row.copy && (
                    <button
                      type="button"
                      aria-label={`Copy the path of ${row.title}`}
                      onClick={(event) => {
                        // Copies; the line itself is not opened.
                        event.stopPropagation();
                        void navigator.clipboard
                          .writeText(row.copy!)
                          .then(() => setCopied(row.key));
                      }}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-ink-300 bg-surface px-2 text-xs font-medium text-ink-700 hover:border-ink-400 hover:bg-ink-50"
                    >
                      <Copy size={12} aria-hidden="true" />
                      {copied === row.key ? 'Copied' : 'Copy path'}
                    </button>
                  )}
                  {isMarked && (
                    <CornerDownLeft
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-ink-400"
                    />
                  )}
                </div>
              );
            })}
            {section.more > 0 && (
              <p className="px-4 py-1 pl-11 text-xs text-ink-500">
                and {section.more} more: type another word to narrow it down
              </p>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p role="status" className="px-4 py-8 text-center text-sm text-ink-500">
            {searching
              ? loading
                ? 'Searching…'
                : `Nothing found for “${query.trim()}”. Try fewer words, or a number on its own.`
              : 'Search machines, assembly steps, assy and part numbers, drawings, inspections and quality checks.'}
          </p>
        )}
      </div>
      <p className="hidden items-center gap-4 border-t border-ink-200 px-4 py-2 text-[0.6875rem] text-ink-500 sm:flex">
        <span>↑ ↓ to move</span>
        <span>Enter to open</span>
        <span className="ml-auto" role="status">
          {searching && !loading && results.total > 0 && `${results.total} found`}
        </span>
      </p>
    </dialog>
  );
}
