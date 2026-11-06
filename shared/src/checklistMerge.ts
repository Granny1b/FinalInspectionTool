/**
 * A machine's checks are copies of their templates as they were published when the check was made.
 * Admins change a copy for that machine only (rows and sections added, edited, moved, deleted),
 * and the template goes on to newer revisions. "Update to latest template" brings the template's
 * changes into the copy without losing the machine's own: a three-way merge of
 *
 *   base   – the revision the copy came from (or was last updated to),
 *   theirs – the template's newer revision,
 *   ours   – the machine's copy as it is now.
 *
 * Sections and rows are matched by their stable ids. What the template changed since the base
 * comes in; what the machine changed stays; where both changed the same thing, the machine's wins
 * unless the admin picks the template's (per row or section). Pure, so the preview in the browser
 * and the update on the server are the same computation.
 *
 * The rules, side by side:
 *
 * | Template (theirs)       | Machine (ours)                | Result                                    |
 * | ----------------------- | ----------------------------- | ----------------------------------------- |
 * | added a row or section  | –                             | added, after its neighbour in the template |
 * | changed a field         | left it                       | the template's                            |
 * | left a field            | changed it                    | the machine's                             |
 * | changed a field         | changed it differently        | conflict: the machine's, or the template's if picked |
 * | removed a row           | left it, no result            | removed                                   |
 * | removed a row           | changed it, or it has a result | flagged and kept, unless picked to remove |
 * | changed or kept a row   | removed it                    | stays removed (a changed one is reported) |
 * | moved a row or section  | left it in place              | moved as in the template                  |
 * | –                       | moved it                      | stays where the machine put it            |
 * | removed a section       | added rows to it              | kept with the rows that must stay         |
 * | added rows to a section | removed the section           | stays removed (reported)                  |
 *
 * Rows both sides add at the same place both stay: the machine's first, then the template's.
 */
import type { Item, QualityFront, Section } from './schemas';

/** What a checklist is, for the merge: its sections, its name and a quality check's front page. */
export type ChecklistContent = {
  name: string;
  quality?: QualityFront | undefined;
  sections: Section[];
};

/** A row's fields that the merge compares one by one; the id is what matches them. */
export const ROW_FIELDS = ['text', 'how', 'references', 'timeHours', 'guide'] as const;
export type RowField = (typeof ROW_FIELDS)[number];

/** How the preview names a field: "1.c: What to check and How changed on both sides". */
export const ROW_FIELD_LABELS: Record<RowField, string> = {
  text: 'Text',
  how: 'How',
  references: 'References',
  timeHours: 'Time',
  guide: 'Pictures and information',
};

export type MergeChoices = {
  /**
   * Rows (and sections, by id) changed on both sides that take the template's version of what
   * both changed, instead of the machine's.
   */
  takeTemplate?: readonly string[];
  /** Rows the template removed that are kept by default (a result, or changed here): remove them. */
  removeRows?: readonly string[];
};

/** What the template's changes do to one section of the machine's copy. */
export type SectionMergeReport = {
  sectionId: string;
  /** Its title after the merge (or, for one removed, as it was). */
  title: string;
  /** New from the template, removed by it, or changed in it (rows, title or place). */
  change: 'added' | 'removed' | 'changed';
  /** The template's title replaces the machine's. */
  renamed: boolean;
  /** The template moved the section. */
  moved: boolean;
  /** Rows the template added. */
  added: number;
  /** Rows whose text the template changed. */
  reworded: number;
  /** Rows the template changed otherwise (how, references, time, pictures). */
  changed: number;
  /** Rows the template removed. */
  removed: number;
  /** Rows the template moved (within the section or into it). */
  rowsMoved: number;
};

/** A row (or a section's title) both sides changed differently. */
export type MergeConflict =
  | {
      kind: 'row';
      itemId: string;
      /** "2.c", where the row is in the machine's copy. */
      ref: string;
      sectionTitle: string;
      fields: RowField[];
      base: Item;
      ours: Item;
      theirs: Item;
      /** Which side's version of the conflicting fields the result has. */
      taken: 'machine' | 'template';
    }
  | {
      kind: 'section';
      sectionId: string;
      base: string;
      ours: string;
      theirs: string;
      taken: 'machine' | 'template';
    };

/** A row the template removed that the machine keeps unless the admin says otherwise. */
export type FlaggedRow = {
  itemId: string;
  /** "2.c" in the machine's copy. */
  ref: string;
  sectionTitle: string;
  item: Item;
  /** It has a status, comment or photo in this check. */
  hasResult: boolean;
  /** The machine changed it since the base. */
  changedHere: boolean;
  /** Whether the merge keeps it (the default) or removes it (picked). */
  kept: boolean;
};

/** A template change that can't come in because the machine removed what it is about. */
export type SkippedChange =
  | { kind: 'row'; itemId: string; text: string; sectionTitle: string }
  | { kind: 'rows-added'; sectionId: string; sectionTitle: string; count: number };

export type MergeReport = {
  /** Sections the template's changes touch, in the merged order, then the ones removed. */
  sections: SectionMergeReport[];
  conflicts: MergeConflict[];
  flagged: FlaggedRow[];
  skipped: SkippedChange[];
  /** Totals over `sections`. */
  totals: Pick<SectionMergeReport, 'added' | 'reworded' | 'changed' | 'removed'>;
  /** The merge leaves the machine's copy exactly as it is (it may still move its base on). */
  unchanged: boolean;
};

export type MergeInput = {
  base: ChecklistContent;
  theirs: ChecklistContent;
  ours: ChecklistContent;
  /** The rows of the check that have a result (a status, comment or photo). */
  resultIds?: ReadonlySet<string>;
  choices?: MergeChoices;
};

export type MergeResult = { checklist: ChecklistContent; report: MergeReport };

// ---------------------------------------------------------------------------------------------
// Comparing rows
// ---------------------------------------------------------------------------------------------

/** Plain JSON with its keys sorted, so two equal values compare equal whatever their key order. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : nested,
  );
}

/** A field as compared: a blank how, or an empty list of references, is the same as none. */
function fieldValue(item: Item, field: RowField): string {
  const value = item[field];
  if (field === 'how' && !(value as string | undefined)?.trim()) return 'null';
  if (field === 'references' && !(value as string[] | undefined)?.length) return 'null';
  return value === undefined ? 'null' : canonical(value);
}

function sameField(a: Item, b: Item, field: RowField): boolean {
  return fieldValue(a, field) === fieldValue(b, field);
}

/** True when two rows say the same in every field. */
export function sameRowContent(a: Item, b: Item): boolean {
  return ROW_FIELDS.every((field) => sameField(a, b, field));
}

/** The row with `field` set as in `from` (left out when `from` has none). */
function withField(item: Item, field: RowField, from: Item): Item {
  // Text is always there; the other fields are left out rather than undefined.
  if (field === 'text') return { ...item, text: from.text };
  const { [field]: _dropped, ...rest } = item;
  return from[field] === undefined ? rest : { ...rest, [field]: from[field] };
}

type ItemMerge = {
  item: Item;
  /** Fields both sides changed differently. */
  conflicts: RowField[];
  /** Fields whose template version is in the result and differs from the machine's. */
  incoming: RowField[];
};

/** Field by field: one side's change wins over no change; both changing differently conflicts. */
function mergeItem(base: Item, theirs: Item, ours: Item, takeTemplate: boolean): ItemMerge {
  let item = ours;
  const conflicts: RowField[] = [];
  const incoming: RowField[] = [];
  for (const field of ROW_FIELDS) {
    if (sameField(ours, theirs, field) || sameField(theirs, base, field)) continue;
    if (!sameField(ours, base, field)) {
      conflicts.push(field);
      if (!takeTemplate) continue;
    }
    item = withField(item, field, theirs);
    incoming.push(field);
  }
  return { item, conflicts, incoming };
}

// ---------------------------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------------------------

type Located = { item: Item; sectionId: string };

function rowsById(sections: readonly Section[]): Map<string, Located> {
  const rows = new Map<string, Located>();
  for (const section of sections) {
    for (const item of section.items) rows.set(item.id, { item, sectionId: section.id });
  }
  return rows;
}

function sectionsById(sections: readonly Section[]): Map<string, Section> {
  return new Map(sections.map((section) => [section.id, section]));
}

/** A longest common subsequence of two id lists (the ids that kept their order). */
function commonOrder(a: readonly string[], b: readonly string[]): Set<string> {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        a[i] === b[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const kept = new Set<string>();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      kept.add(a[i]!);
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }
  return kept;
}

/**
 * The rows one side moved since the base: into another section, or out of order among the rows
 * that stayed in their section on both. Rows added or removed around a row don't move it.
 */
function movedRows(base: readonly Section[], side: readonly Section[]): Set<string> {
  const baseRows = rowsById(base);
  const sideRows = rowsById(side);
  const baseSections = sectionsById(base);
  const moved = new Set<string>();
  for (const section of side) {
    const stayed = (id: string) =>
      baseRows.get(id)?.sectionId === section.id && sideRows.get(id)?.sectionId === section.id;
    const sideOrder = section.items.map((item) => item.id).filter(stayed);
    const baseOrder = (baseSections.get(section.id)?.items ?? [])
      .map((item) => item.id)
      .filter(stayed);
    const kept = commonOrder(baseOrder, sideOrder);
    for (const id of sideOrder) if (!kept.has(id)) moved.add(id);
    for (const item of section.items) {
      const was = baseRows.get(item.id);
      if (was && was.sectionId !== section.id) moved.add(item.id);
    }
  }
  return moved;
}

/** The sections one side moved out of order among those both it and the base have. */
function movedSections(base: readonly Section[], side: readonly Section[]): Set<string> {
  const inBase = new Set(base.map((section) => section.id));
  const inSide = new Set(side.map((section) => section.id));
  const sideOrder = side.map((section) => section.id).filter((id) => inBase.has(id));
  const baseOrder = base.map((section) => section.id).filter((id) => inSide.has(id));
  const kept = commonOrder(baseOrder, sideOrder);
  return new Set(sideOrder.filter((id) => !kept.has(id)));
}

/** "2.c": section number and row letter (as numbering.ts, without importing its index). */
function refOf(sections: readonly Section[], itemId: string): string {
  for (const [sectionIndex, section] of sections.entries()) {
    const rowIndex = section.items.findIndex((item) => item.id === itemId);
    if (rowIndex >= 0) return `${sectionIndex + 1}.${letters(rowIndex)}`;
  }
  return '';
}

function letters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------------------------

/** The copy being merged: sections with mutable row lists. */
type Work = { id: string; title: string; items: Item[] };

function emptyReport(sectionId: string, title: string): SectionMergeReport {
  return {
    sectionId,
    title,
    change: 'changed',
    renamed: false,
    moved: false,
    added: 0,
    reworded: 0,
    changed: 0,
    removed: 0,
    rowsMoved: 0,
  };
}

/** Text both sides changed: the machine's, unless the template's is picked. */
function mergeText(base: string, theirs: string, ours: string, takeTemplate: boolean) {
  if (ours === theirs || theirs === base) return { value: ours, conflict: false };
  if (ours === base) return { value: theirs, conflict: false };
  return { value: takeTemplate ? theirs : ours, conflict: true };
}

/**
 * Merges the template's changes since `base` (`theirs`) into the machine's copy (`ours`), with the
 * admin's choices. The result keeps every id it had; rows and sections the template added keep
 * theirs.
 */
export function mergeChecklists({
  base,
  theirs,
  ours,
  resultIds = new Set(),
  choices = {},
}: MergeInput): MergeResult {
  const take = new Set(choices.takeTemplate ?? []);
  const removeAnyway = new Set(choices.removeRows ?? []);

  const baseRows = rowsById(base.sections);
  const theirRows = rowsById(theirs.sections);
  const ourRows = rowsById(ours.sections);
  const baseSections = sectionsById(base.sections);
  const theirSections = sectionsById(theirs.sections);
  const ourSections = sectionsById(ours.sections);
  const theyMovedRows = movedRows(base.sections, theirs.sections);
  const weMovedRows = movedRows(base.sections, ours.sections);
  const theyMovedSections = movedSections(base.sections, theirs.sections);
  const weMovedSections = movedSections(base.sections, ours.sections);

  const work: Work[] = ours.sections.map((section) => ({
    id: section.id,
    title: section.title,
    items: [...section.items],
  }));
  const reports = new Map<string, SectionMergeReport>();
  const report = (sectionId: string, title: string) => {
    let found = reports.get(sectionId);
    if (!found) reports.set(sectionId, (found = emptyReport(sectionId, title)));
    return found;
  };
  const conflicts: MergeConflict[] = [];
  const flagged: FlaggedRow[] = [];
  const skipped: SkippedChange[] = [];

  // 1. Rows on all three sides: field by field.
  for (const section of work) {
    section.items = section.items.map((item) => {
      const was = baseRows.get(item.id);
      const now = theirRows.get(item.id);
      if (!was || !now) return item;
      const merged = mergeItem(was.item, now.item, item, take.has(item.id));
      if (merged.conflicts.length > 0) {
        conflicts.push({
          kind: 'row',
          itemId: item.id,
          ref: refOf(ours.sections, item.id),
          sectionTitle: section.title,
          fields: merged.conflicts,
          base: was.item,
          ours: item,
          theirs: now.item,
          taken: take.has(item.id) ? 'template' : 'machine',
        });
      }
      if (merged.incoming.length > 0) {
        const counts = report(section.id, section.title);
        if (merged.incoming.includes('text')) counts.reworded += 1;
        else counts.changed += 1;
      }
      return merged.item;
    });
  }

  // 2. Rows the template removed: gone, unless the machine has a reason to keep them.
  for (const section of work) {
    section.items = section.items.filter((item) => {
      const was = baseRows.get(item.id);
      if (!was || theirRows.has(item.id)) return true;
      const hasResult = resultIds.has(item.id);
      const changedHere = !sameRowContent(was.item, item);
      const keep = (hasResult || changedHere) && !removeAnyway.has(item.id);
      if (hasResult || changedHere) {
        flagged.push({
          itemId: item.id,
          ref: refOf(ours.sections, item.id),
          sectionTitle: section.title,
          item,
          hasResult,
          changedHere,
          kept: keep,
        });
      }
      if (!keep) report(section.id, section.title).removed += 1;
      return keep;
    });
  }

  // 3. Rows the machine removed stay removed; a template change to one is reported.
  for (const [itemId, { item, sectionId }] of theirRows) {
    const was = baseRows.get(itemId);
    if (!was || ourRows.has(itemId) || sameRowContent(was.item, item)) continue;
    skipped.push({
      kind: 'row',
      itemId,
      text: item.text,
      sectionTitle: theirSections.get(sectionId)?.title ?? '',
    });
  }

  // 4. Section titles both have.
  for (const section of work) {
    const was = baseSections.get(section.id);
    const now = theirSections.get(section.id);
    if (!was || !now) continue;
    const title = mergeText(was.title, now.title, section.title, take.has(section.id));
    if (title.conflict) {
      conflicts.push({
        kind: 'section',
        sectionId: section.id,
        base: was.title,
        ours: section.title,
        theirs: now.title,
        taken: take.has(section.id) ? 'template' : 'machine',
      });
    }
    if (title.value !== section.title) {
      section.title = title.value;
      const counts = report(section.id, title.value);
      counts.title = title.value;
      counts.renamed = true;
    }
  }

  // 5. Sections the template added or moved, in the template's order.
  const isOursOnlySection = (id: string) => !baseSections.has(id) && !theirSections.has(id);
  for (const [index, section] of theirs.sections.entries()) {
    const fresh = !baseSections.has(section.id) && !ourSections.has(section.id);
    const move =
      theyMovedSections.has(section.id) &&
      !weMovedSections.has(section.id) &&
      ourSections.has(section.id);
    if (!fresh && !move) continue;
    let target: Work = { id: section.id, title: section.title, items: [] };
    if (move) {
      const at = work.findIndex((candidate) => candidate.id === section.id);
      if (at < 0) continue;
      target = work.splice(at, 1)[0]!;
    }
    work.splice(
      insertionPoint(
        work.map((candidate) => candidate.id),
        theirs.sections
          .slice(0, index)
          .map((before) => before.id)
          .reverse(),
        isOursOnlySection,
      ),
      0,
      target,
    );
    const counts = report(section.id, target.title);
    if (fresh) counts.change = 'added';
    else counts.moved = true;
  }

  // 6. Rows the template added or moved, in the template's order, so a row's neighbour in the
  // template is already where it belongs when the row is placed.
  const isOursOnlyRow = (id: string) => !baseRows.has(id) && !theirRows.has(id);
  const skippedAdds = new Map<string, number>();
  for (const section of theirs.sections) {
    for (const [index, item] of section.items.entries()) {
      const fresh = !baseRows.has(item.id) && !ourRows.has(item.id);
      const move = theyMovedRows.has(item.id) && !weMovedRows.has(item.id) && ourRows.has(item.id);
      if (!fresh && !move) continue;
      const target = work.find((candidate) => candidate.id === section.id);
      if (!target) {
        // The machine removed the section: what the template adds to it doesn't come in.
        if (fresh) skippedAdds.set(section.id, (skippedAdds.get(section.id) ?? 0) + 1);
        continue;
      }
      let placed = item;
      if (move) {
        const from = work.find((candidate) =>
          candidate.items.some((candidate) => candidate.id === item.id),
        );
        if (!from) continue; // removed above (flagged rows are never moved by the template)
        const at = from.items.findIndex((candidate) => candidate.id === item.id);
        placed = from.items.splice(at, 1)[0]!;
      } else if (work.some((candidate) => candidate.items.some((row) => row.id === item.id))) {
        continue; // its id is already in the copy: never two rows with one id
      }
      target.items.splice(
        insertionPoint(
          target.items.map((row) => row.id),
          section.items
            .slice(0, index)
            .map((before) => before.id)
            .reverse(),
          isOursOnlyRow,
        ),
        0,
        placed,
      );
      const counts = report(target.id, target.title);
      if (fresh) counts.added += 1;
      else counts.rowsMoved += 1;
    }
  }
  for (const [sectionId, count] of skippedAdds) {
    skipped.push({
      kind: 'rows-added',
      sectionId,
      sectionTitle: theirSections.get(sectionId)?.title ?? '',
      count,
    });
  }

  // 7. Sections the template removed: gone once nothing in them has to stay.
  const removedSections: SectionMergeReport[] = [];
  for (let at = work.length - 1; at >= 0; at--) {
    const section = work[at]!;
    if (!baseSections.has(section.id) || theirSections.has(section.id)) continue;
    if (section.items.length > 0) continue;
    work.splice(at, 1);
    const counts = report(section.id, section.title);
    counts.change = 'removed';
    reports.delete(section.id);
    removedSections.unshift(counts);
  }

  // 8. The checklist's name and a quality check's front page: the machine never changes them, so
  // the template's newer wording comes in.
  const name = mergeText(base.name, theirs.name, ours.name, false).value;
  const quality = mergeFront(base.quality, theirs.quality, ours.quality);

  const sections: Section[] = work.map(({ id, title, items }) => ({ id, title, items }));
  const changed = work
    .map((section) => reports.get(section.id))
    .filter((entry): entry is SectionMergeReport => entry !== undefined)
    .filter(touched);
  const sectionReports = [...changed, ...removedSections];
  const totals = { added: 0, reworded: 0, changed: 0, removed: 0 };
  for (const entry of sectionReports) {
    totals.added += entry.added;
    totals.reworded += entry.reworded;
    totals.changed += entry.changed;
    totals.removed += entry.removed;
  }
  const checklist: ChecklistContent = {
    name,
    ...(quality && { quality }),
    sections,
  };
  return {
    checklist,
    report: {
      sections: sectionReports,
      conflicts,
      flagged,
      skipped,
      totals,
      unchanged: canonical(checklist) === canonical(withoutUndefined(ours)),
    },
  };
}

function withoutUndefined(content: ChecklistContent): ChecklistContent {
  return {
    name: content.name,
    ...(content.quality && { quality: content.quality }),
    sections: content.sections,
  };
}

/** A section report worth showing: something in it changed. */
function touched(entry: SectionMergeReport): boolean {
  return (
    entry.change !== 'changed' ||
    entry.renamed ||
    entry.moved ||
    entry.added + entry.reworded + entry.changed + entry.removed + entry.rowsMoved > 0
  );
}

function mergeFront(
  base: QualityFront | undefined,
  theirs: QualityFront | undefined,
  ours: QualityFront | undefined,
): QualityFront | undefined {
  if (!ours || !theirs) return ours ?? theirs;
  return {
    name: mergeText(base?.name ?? ours.name, theirs.name, ours.name, false).value,
    department: mergeText(
      base?.department ?? ours.department,
      theirs.department,
      ours.department,
      false,
    ).value,
  };
}

/**
 * Where to insert something whose neighbours before it, nearest first, are `before`: right after
 * the nearest one that is in `ids`, or at the start; then past what only the machine has there, so
 * the machine's own rows keep their place next to their neighbour.
 */
function insertionPoint(
  ids: readonly string[],
  before: readonly string[],
  oursOnly: (id: string) => boolean,
): number {
  let at = 0;
  for (const id of before) {
    const index = ids.indexOf(id);
    if (index >= 0) {
      at = index + 1;
      break;
    }
  }
  while (at < ids.length && oursOnly(ids[at]!)) at++;
  return at;
}

// ---------------------------------------------------------------------------------------------
// How a machine's copy differs from the revision it is based on
// ---------------------------------------------------------------------------------------------

/** Rows the machine added, removed and changed since its copy's base revision. */
export type ChecklistChanges = { added: number; removed: number; changed: number };

export function checklistChanges(
  base: readonly Section[],
  copy: readonly Section[],
): ChecklistChanges {
  const baseRows = rowsById(base);
  const copyRows = rowsById(copy);
  let added = 0;
  let changed = 0;
  for (const [id, { item }] of copyRows) {
    const was = baseRows.get(id);
    if (!was) added += 1;
    else if (!sameRowContent(was.item, item)) changed += 1;
  }
  let removed = 0;
  for (const id of baseRows.keys()) if (!copyRows.has(id)) removed += 1;
  return { added, removed, changed };
}

/** "2 rows added, 1 removed, 1 changed"; '' when the copy is as its base. */
export function checklistChangesText({ added, removed, changed }: ChecklistChanges): string {
  const parts: string[] = [];
  const first = (count: number, what: string) =>
    parts.length === 0 ? `${count} ${count === 1 ? 'row' : 'rows'} ${what}` : `${count} ${what}`;
  if (added > 0) parts.push(first(added, 'added'));
  if (removed > 0) parts.push(first(removed, 'removed'));
  if (changed > 0) parts.push(first(changed, 'changed'));
  return parts.join(', ');
}

/**
 * "3 rows added, 1 reworded, 1 removed": what the template's changes do to one section (or all),
 * as the update's preview says it; '' when nothing in its rows changes.
 */
export function mergeCountsText(
  counts: Pick<SectionMergeReport, 'added' | 'reworded' | 'changed' | 'removed'>,
): string {
  const parts: string[] = [];
  const entries: [number, string][] = [
    [counts.added, 'added'],
    [counts.reworded, 'reworded'],
    [counts.changed, 'changed'],
    [counts.removed, 'removed'],
  ];
  for (const [count, what] of entries) {
    if (count === 0) continue;
    parts.push(
      parts.length === 0 ? `${count} ${count === 1 ? 'row' : 'rows'} ${what}` : `${count} ${what}`,
    );
  }
  return parts.join(', ');
}
