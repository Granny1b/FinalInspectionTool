import {
  mergeChecklists,
  mergeCountsText,
  resultIdsOf,
  ROW_FIELD_LABELS,
  snapshotTemplate,
  type MachineCheck,
  type MergeConflict,
  type SectionMergeReport,
} from '@modig/shared';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage, isConflict } from '../../lib/api';
import { useInspection } from '../inspections/queries';
import { useTemplateRevision } from '../templates/queries';
import { checkTitle } from './model';
import { useUpdateToTemplate } from './queries';

type Props = {
  machineId: string;
  check: MachineCheck;
  onUpdated: (text: string) => void;
  onClose: () => void;
};

/**
 * "Update to latest template" (admins): what the template changed since the revision the
 * machine's copy is based on, section by section, before anything happens; the rows changed on
 * both sides, with a choice between the machine's wording (the default) and the template's; the
 * rows the template removed that have a result here, kept unless chosen; and what can't come in
 * because the machine removed it. The same merge (shared/checklistMerge.ts) runs on the server
 * with the choices made here.
 */
export function UpdateDialog({ machineId, check, onUpdated, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const loaded = useInspection(check.id);
  const base = useTemplateRevision(check.templateId, check.templateRevision);
  const theirs = useTemplateRevision(check.templateId, check.latestRevision);
  const update = useUpdateToTemplate(machineId);
  const [takeTemplate, setTakeTemplate] = useState<ReadonlySet<string>>(new Set());
  const [removeRows, setRemoveRows] = useState<ReadonlySet<string>>(new Set());
  const revision = check.latestRevision ?? check.templateRevision;
  const title = checkTitle(check);

  const inspection = loaded.data?.inspection;
  const merged = useMemo(
    () =>
      inspection && base.data && theirs.data
        ? mergeChecklists({
            base: snapshotTemplate(base.data),
            theirs: snapshotTemplate(theirs.data),
            ours: inspection.templateSnapshot,
            resultIds: resultIdsOf(inspection.results),
            choices: { takeTemplate: [...takeTemplate], removeRows: [...removeRows] },
          })
        : null,
    [inspection, base.data, theirs.data, takeTemplate, removeRows],
  );
  const failed = loaded.error ?? base.error ?? theirs.error;

  function apply() {
    if (!loaded.data) return;
    update.mutate(
      {
        id: check.id,
        request: { revision, takeTemplate: [...takeTemplate], removeRows: [...removeRows] },
        etag: loaded.data.etag,
      },
      {
        onSuccess: () => {
          onUpdated(`${title} was updated to rev ${revision}.`);
          close();
        },
      },
    );
  }

  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  let body: ReactNode;
  if (failed) {
    body = (
      <p role="alert" className="mt-5 text-sm font-medium text-nok-fg">
        The preview could not be made. {errorMessage(failed)}
      </p>
    );
  } else if (!merged) {
    body = (
      <p role="status" className="mt-5 flex items-center gap-2 text-sm text-ink-500">
        <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
        Comparing the revisions…
      </p>
    );
  } else {
    const { report, checklist } = merged;
    const number = (sectionId: string) => {
      const index = checklist.sections.findIndex((section) => section.id === sectionId);
      return index < 0 ? null : index + 1;
    };
    const totals = mergeCountsText(report.totals);
    body = (
      <div className="mt-5 space-y-5">
        <p className="text-sm text-ink-800">
          {report.unchanged ? (
            <>Nothing in this machine’s checklist changes. It will be based on rev {revision}.</>
          ) : (
            <>
              <span className="font-semibold">From the template: </span>
              {totals || 'section changes only'}.
            </>
          )}
        </p>
        {report.sections.length > 0 && (
          <Part title="Sections">
            <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
              {report.sections.map((section) => (
                <li
                  key={section.sectionId}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
                >
                  <span className="w-5 shrink-0 font-semibold text-ink-900 tabular-nums">
                    {number(section.sectionId) ?? '–'}
                  </span>
                  <span
                    className={clsx(
                      'min-w-0 flex-1 font-medium text-ink-900',
                      section.change === 'removed' && 'line-through decoration-ink-400',
                    )}
                  >
                    {section.title || 'Untitled section'}
                  </span>
                  <span className="text-xs text-ink-600">{sectionText(section)}</span>
                </li>
              ))}
            </ul>
          </Part>
        )}
        {report.conflicts.length > 0 && (
          <Part
            title="Changed here and in the template"
            hint="This machine’s wording stays unless you take the template’s."
          >
            <ul className="space-y-2">
              {report.conflicts.map((conflict) => {
                const id = conflict.kind === 'row' ? conflict.itemId : conflict.sectionId;
                return (
                  <ConflictChoice
                    key={id}
                    conflict={conflict}
                    template={takeTemplate.has(id)}
                    onChange={(template) =>
                      setTakeTemplate((current) => toggle(current, id, template))
                    }
                  />
                );
              })}
            </ul>
          </Part>
        )}
        {report.flagged.length > 0 && (
          <Part
            title="Removed in the template"
            hint="These rows are kept on this machine: they have a result, or were changed here."
          >
            <ul className="space-y-2">
              {report.flagged.map((row) => (
                <li key={row.itemId} className="rounded-md border border-ink-200 px-3 py-2.5">
                  <p className="text-sm text-ink-900">
                    <span className="font-semibold tabular-nums">{row.ref}</span> {row.item.text}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {[row.hasResult && 'Has a result', row.changedHere && 'Changed on this machine']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-sm text-ink-800">
                    <input
                      type="checkbox"
                      checked={removeRows.has(row.itemId)}
                      onChange={(event) =>
                        setRemoveRows((current) =>
                          toggle(current, row.itemId, event.target.checked),
                        )
                      }
                      className="size-4 accent-brand-600"
                    />
                    Remove it from this machine too
                    {row.hasResult && (
                      <span className="text-ink-500">(its result goes with it)</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </Part>
        )}
        {report.skipped.length > 0 && (
          <Part title="Not brought in">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
              {report.skipped.map((skipped) =>
                skipped.kind === 'row' ? (
                  <li key={skipped.itemId}>
                    The template changed “{skipped.text}”, which this machine removed. It stays
                    removed.
                  </li>
                ) : (
                  <li key={skipped.sectionId}>
                    {skipped.count === 1 ? '1 row' : `${skipped.count} rows`} the template added to
                    “{skipped.sectionTitle}”, a section this machine removed.
                  </li>
                ),
              )}
            </ul>
          </Part>
        )}
      </div>
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Update ${title} to rev ${revision}?`}
      description={`This machine’s copy is based on rev ${check.templateRevision}. The template’s changes since come in; the rows this machine added, changed or removed stay as they are, and every result stays on its row.`}
      onClose={onClose}
      busy={update.isPending}
      className="w-[min(40rem,calc(100vw-2rem))]"
    >
      {body}
      {update.isError && (
        <p role="alert" className="mt-5 text-sm font-medium text-nok-fg">
          {isConflict(update.error)
            ? 'The check was changed meanwhile. Close this and open it again to see the latest.'
            : errorMessage(update.error)}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={close} disabled={update.isPending}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={!merged || update.isPending}>
          {update.isPending && (
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
          )}
          {update.isPending ? 'Updating…' : `Update to rev ${revision}`}
        </Button>
      </div>
    </Dialog>
  );
}

function Part({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="text-sm font-semibold text-ink-900">
        {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** "New section · 3 rows added", "Removed", "Renamed · 1 row reworded". */
function sectionText(section: SectionMergeReport): string {
  if (section.change === 'removed') {
    return section.removed > 0
      ? `Removed with ${section.removed === 1 ? '1 row' : `${section.removed} rows`}`
      : 'Removed';
  }
  const parts = [
    section.change === 'added' ? 'New section' : '',
    section.renamed && section.change !== 'added' ? 'Renamed' : '',
    section.moved ? 'Moved' : '',
    mergeCountsText(section),
    section.rowsMoved > 0 ? `${section.rowsMoved} moved` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

type ConflictProps = {
  conflict: MergeConflict;
  template: boolean;
  onChange: (template: boolean) => void;
};

/** One row (or section title) changed on both sides: the two versions, and which to keep. */
function ConflictChoice({ conflict, template, onChange }: ConflictProps) {
  const id = conflict.kind === 'row' ? conflict.itemId : conflict.sectionId;
  const label =
    conflict.kind === 'row'
      ? `${conflict.ref} · ${conflict.fields.map((field) => ROW_FIELD_LABELS[field]).join(', ')}`
      : 'Section title';
  const ours = conflict.kind === 'row' ? describe(conflict, 'ours') : conflict.ours;
  const theirs = conflict.kind === 'row' ? describe(conflict, 'theirs') : conflict.theirs;
  return (
    <li className="rounded-md border border-ink-200 px-3 py-2.5">
      <fieldset>
        <legend className="text-xs font-medium text-ink-500">{label}</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          <Version
            name={`conflict-${id}`}
            label="This machine’s"
            text={ours}
            checked={!template}
            onChange={() => onChange(false)}
          />
          <Version
            name={`conflict-${id}`}
            label="The template’s"
            text={theirs}
            checked={template}
            onChange={() => onChange(true)}
          />
        </div>
      </fieldset>
    </li>
  );
}

/** What a side says of the conflicting fields: the text, or which fields when not the text. */
function describe(
  conflict: Extract<MergeConflict, { kind: 'row' }>,
  side: 'ours' | 'theirs',
): string {
  const item = conflict[side];
  if (conflict.fields.includes('text')) return item.text;
  if (conflict.fields.includes('how')) return item.how ?? '';
  if (conflict.fields.includes('timeHours')) return `${item.timeHours ?? '–'} h`;
  if (conflict.fields.includes('references')) return (item.references ?? []).join(', ');
  return item.guide?.description ?? `${item.guide?.images.length ?? 0} pictures`;
}

type VersionProps = {
  name: string;
  label: string;
  text: string;
  checked: boolean;
  onChange: () => void;
};

function Version({ name, label, text, checked, onChange }: VersionProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink-200 px-3 py-2 transition-colors hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
      />
      <span className="min-w-0 text-sm">
        <span className="block text-xs font-medium text-ink-600">{label}</span>
        <span className="block wrap-break-word whitespace-pre-line text-ink-900">
          {text || '—'}
        </span>
      </span>
    </label>
  );
}
