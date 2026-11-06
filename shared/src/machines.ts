/**
 * Machines: the machines being built, "Magellan#1" of the RigiMill MG, each with its own copies of
 * the model's quality checks and its final inspection. A machine is made with the checks ticked
 * for it; each check is an inspection (`machineRef` = the machine's id) copied from its template's
 * latest published revision, not started until someone starts it. Its checklist is the machine's
 * own from then on: later template revisions never reach it unless an admin updates it
 * (checklistMerge.ts), and admins may add, change and delete its rows for that machine only.
 *
 * Stored one blob per machine, `machines/{id}.json`, with its list row in the blob's metadata.
 */
import { z } from 'zod';
import {
  InspectionSummarySchema,
  isStarted,
  MachineIdSchema,
  SerialNumberSchema,
  type InspectionSummary,
} from './inspections';
import {
  IdSchema,
  InspectionFrontSchema,
  ModelCodeSchema,
  SectionSchema,
  type InspectionKind,
  type RowResult,
} from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });
const Count = z.number().int().min(0);

export const MachineSchema = z.object({
  id: IdSchema,
  /**
   * The Machine ID as the ERP (Monitor) knows it, "Magellan#1". Named as on the front page of its
   * checks (`front.machineName`), where it is copied. No two machines have the same one, ignoring
   * case and surrounding spaces.
   */
  machineName: z.string().max(200),
  /** The model it is built as; its checks are that model's. Never changes. */
  modelCode: ModelCodeSchema,
  serialNumber: z.string().max(100),
  createdAt: IsoDateTime,
  createdBy: z.string(),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type Machine = z.infer<typeof MachineSchema>;

/** How Machine IDs compare: trimmed and ignoring case ("magellan#1 " is Magellan#1 to people). */
export function machineKey(machineName: string): string {
  return machineName.trim().toLocaleLowerCase('sv');
}

/** "Another machine is already called Magellan#1." for a Machine ID in use, or null. */
export function machineNameTaken(
  machines: readonly Pick<Machine, 'id' | 'machineName'>[],
  machineName: string,
  exceptId?: string,
): string | null {
  const key = machineKey(machineName);
  const other = machines.find(
    (machine) => machine.id !== exceptId && machineKey(machine.machineName) === key,
  );
  return other ? `There is already a machine with the Machine ID ${other.machineName}.` : null;
}

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/**
 * POST /api/machines (inspectors and admins): the machine, and the published templates to copy
 * for it, its model's quality checks and its final inspection template (none is fine: checks can
 * be added later).
 */
export const CreateMachineRequestSchema = z.object({
  machineName: MachineIdSchema,
  modelCode: ModelCodeSchema,
  serialNumber: SerialNumberSchema,
  templateIds: z
    .array(IdSchema)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Each check can be copied once.'),
});
export type CreateMachineRequest = z.infer<typeof CreateMachineRequestSchema>;

/**
 * PUT /api/machines/{id}: its Machine ID and serial number. The checks not finalised get them on
 * their front pages; finalised ones keep what they were finalised with.
 */
export const UpdateMachineRequestSchema = z.object({
  machineName: MachineIdSchema,
  serialNumber: SerialNumberSchema,
});
export type UpdateMachineRequest = z.infer<typeof UpdateMachineRequestSchema>;

/** POST /api/machines/{id}/checks: another check, copied from the template's latest revision. */
export const AddMachineCheckRequestSchema = z.object({ templateId: IdSchema });
export type AddMachineCheckRequest = z.infer<typeof AddMachineCheckRequestSchema>;

/**
 * POST /api/inspections/{id}/start: a machine's check gets its number and is in progress. The
 * date is today and Checked by (participants) the person starting it unless given.
 */
export const StartCheckRequestSchema = z.object({
  date: InspectionFrontSchema.shape.date
    .refine((date) => date >= '2000-01-01' && date <= '2099-12-31', 'Pick a date in 2000–2099')
    .optional(),
  participants: InspectionFrontSchema.shape.participants.max(50).optional(),
});
export type StartCheckRequest = z.infer<typeof StartCheckRequestSchema>;

/**
 * PUT /api/inspections/{id}/checklist (admins): a machine's check's own checklist. Rows copied
 * from the template keep their ids; new rows have new ones. A row removed takes its result with
 * it.
 */
export const ChecklistInputSchema = z.object({ sections: z.array(SectionSchema) });
export type ChecklistInput = z.infer<typeof ChecklistInputSchema>;

/**
 * POST /api/inspections/{id}/template-update (admins): merge the template's changes up to
 * published `revision` into a machine's check (checklistMerge.ts), with the choices made in the
 * preview.
 */
export const TemplateUpdateRequestSchema = z.object({
  revision: z.number().int().min(1),
  /** Rows and sections changed on both sides that take the template's wording. */
  takeTemplate: z.array(IdSchema).max(5000).default([]),
  /** Rows the template removed that would be kept (a result, or changed here): remove them. */
  removeRows: z.array(IdSchema).max(5000).default([]),
});
export type TemplateUpdateRequest = z.input<typeof TemplateUpdateRequestSchema>;

/**
 * PUT /api/inspections/{id}/machine (admins): link an inspection to a machine of its model, or
 * unlink it (null). A check that is not finalised takes the machine's Machine ID and serial number.
 */
export const MachineLinkRequestSchema = z.object({ machineRef: IdSchema.nullable() });
export type MachineLinkRequest = z.infer<typeof MachineLinkRequestSchema>;

/**
 * The rows of a check that have something filled in (a status, a comment, a responsible or a
 * photo): removing one of them from the check's checklist loses it, so the editor and an update
 * ask first.
 */
export function resultIdsOf(results: Record<string, RowResult>): Set<string> {
  return new Set(
    Object.entries(results)
      .filter(
        ([, result]) =>
          result.status ||
          result.comment?.trim() ||
          result.resp?.trim() ||
          (result.photos?.length ?? 0) > 0,
      )
      .map(([itemId]) => itemId),
  );
}

// ---------------------------------------------------------------------------------------------
// How far a machine has come
// ---------------------------------------------------------------------------------------------

const StageCounts = z.object({ total: Count, started: Count, finalised: Count });

/** Its checks of each kind, and its deviations, open and closed. */
export const MachineProgressSchema = z.object({
  quality: StageCounts,
  final: StageCounts,
  deviations: z.object({ open: Count, closed: Count }),
});
export type MachineProgress = z.infer<typeof MachineProgressSchema>;

export function machineProgress(
  checks: readonly Pick<InspectionSummary, 'kind' | 'state'>[],
  deviations: MachineProgress['deviations'],
): MachineProgress {
  const counts = (kind: InspectionKind) => {
    const ofKind = checks.filter((check) => check.kind === kind);
    return {
      total: ofKind.length,
      started: ofKind.filter(isStarted).length,
      finalised: ofKind.filter((check) => check.state === 'finalised').length,
    };
  };
  return { quality: counts('quality'), final: counts('final'), deviations };
}

/**
 * Where a machine is, at a glance:
 * - `no_checks`: none copied yet;
 * - `in_build`: quality checks still to finalise ("In build · QC 3/5");
 * - `ready`: every quality check finalised, the final inspection not started (or not added yet);
 * - `final`: the final inspection in progress;
 * - `open_deviations`: everything finalised, deviations still open;
 * - `done`: everything finalised and no deviation open.
 */
export const MACHINE_STAGES = [
  'no_checks',
  'in_build',
  'ready',
  'final',
  'open_deviations',
  'done',
] as const;
export type MachineStage = (typeof MACHINE_STAGES)[number];

export const MACHINE_STAGE_LABELS: Record<MachineStage, string> = {
  no_checks: 'No checks yet',
  in_build: 'In build',
  ready: 'Ready for final inspection',
  final: 'Final inspection in progress',
  open_deviations: 'Open deviations',
  done: 'Done',
};

export function machineStage({ quality, final, deviations }: MachineProgress): MachineStage {
  if (quality.total + final.total === 0) return 'no_checks';
  const qualityDone = quality.finalised === quality.total;
  const finalDone = final.total > 0 && final.finalised === final.total;
  if (final.started > final.finalised) return 'final';
  if (!qualityDone) return 'in_build';
  if (!finalDone) return 'ready';
  return deviations.open > 0 ? 'open_deviations' : 'done';
}

/** "In build · QC 3/5", "Ready for final inspection", "Done": the stage in words. */
export function machineStatusText(progress: MachineProgress): string {
  const stage = machineStage(progress);
  const { quality, deviations } = progress;
  const qc = `QC ${quality.finalised}/${quality.total}`;
  switch (stage) {
    case 'in_build':
      return `In build · ${qc}`;
    case 'final':
      // Started before every quality check was finalised (allowed, with a warning).
      return quality.finalised < quality.total
        ? `${MACHINE_STAGE_LABELS.final} · ${qc}`
        : MACHINE_STAGE_LABELS.final;
    case 'open_deviations':
      return `Finalised · ${deviations.open} open ${deviations.open === 1 ? 'deviation' : 'deviations'}`;
    default:
      return MACHINE_STAGE_LABELS[stage];
  }
}

// ---------------------------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------------------------

/** GET /api/machines: one entry per machine, with how far it has come. */
export const MachineSummarySchema = MachineSchema.extend({ progress: MachineProgressSchema });
export type MachineSummary = z.infer<typeof MachineSummarySchema>;
export const MachineListSchema = z.array(MachineSummarySchema);

/** What the machine's copy changed since the revision it is based on (checklistMerge.ts). */
const ChecklistChangesSchema = z.object({ added: Count, removed: Count, changed: Count });

/** One of a machine's checks on its page. */
export const MachineCheckSchema = InspectionSummarySchema.extend({
  /**
   * The template's latest published revision: newer than `templateRevision` means an update is
   * available. Null when the template was deleted.
   */
  latestRevision: z.number().int().min(1).nullable(),
  /** The machine's own changes since `templateRevision`; null when that revision can't be read. */
  changes: ChecklistChangesSchema.nullable(),
  deviations: z.object({ open: Count, closed: Count }),
});
export type MachineCheck = z.infer<typeof MachineCheckSchema>;

/** GET /api/machines/{id}: the machine (its ETag in the header) and its checks, in order. */
export const MachineDetailSchema = z.object({
  machine: MachineSchema,
  checks: z.array(MachineCheckSchema),
});
export type MachineDetail = z.infer<typeof MachineDetailSchema>;

/** POST /api/machines/from-inspections: what the one-time action did. */
export const MachinesFromInspectionsResultSchema = z.object({
  /** Machines made. */
  created: Count,
  /** Inspections linked, to new machines and to machines that existed. */
  linked: Count,
  /** Started inspections without a machine that matched none, left as they were. */
  unmatched: Count,
});
export type MachinesFromInspectionsResult = z.infer<typeof MachinesFromInspectionsResultSchema>;

/**
 * A machine's checks in the order they are done: its quality checks in their model's order (the
 * template ids in `qualityOrder`; others after them, by title), then the final inspection.
 */
export function compareMachineChecks(
  qualityOrder: readonly string[],
): (
  a: Pick<InspectionSummary, 'kind' | 'templateId' | 'templateName' | 'id'>,
  b: Pick<InspectionSummary, 'kind' | 'templateId' | 'templateName' | 'id'>,
) => number {
  const position = (templateId: string) => {
    const index = qualityOrder.indexOf(templateId);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return (a, b) =>
    Number(a.kind === 'final') - Number(b.kind === 'final') ||
    position(a.templateId) - position(b.templateId) ||
    BY_TEXT.compare(a.templateName, b.templateName) ||
    a.id.localeCompare(b.id);
}

const BY_TEXT = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

// ---------------------------------------------------------------------------------------------
// Machines from the inspections done before machines existed
// ---------------------------------------------------------------------------------------------

export type MachinePlan = {
  /** New machines, each with the inspections it gets. */
  create: {
    machineName: string;
    modelCode: string;
    serialNumber: string;
    inspectionIds: string[];
  }[];
  /** Inspections of machines that exist already. */
  link: { machineId: string; inspectionIds: string[] }[];
  /** Started inspections without a machine that match none: they stay as they are. */
  unmatched: string[];
};

type PlanInspection = Pick<
  InspectionSummary,
  'id' | 'number' | 'state' | 'machineName' | 'serialNumber' | 'modelCode' | 'date' | 'machineRef'
>;

/** Newest first: by the front page's date, then by number. */
function newerFirst(a: PlanInspection, b: PlanInspection): number {
  return b.date.localeCompare(a.date) || BY_TEXT.compare(b.number, a.number);
}

/**
 * What "Create machines from existing inspections" does: every started inspection without a
 * machine is matched on its Machine ID (trimmed, ignoring case) and model. A machine with that
 * Machine ID and model gets it; otherwise one machine is made for each Machine ID and model, with
 * the newest inspection's spelling and serial number. Machine IDs are unique, so when one Machine
 * ID was used with two models, the model with more inspections (then the newer) gets the machine.
 * An inspection without a Machine ID, or whose Machine ID belongs to a machine of another model,
 * is left as it is: it can still be linked by hand.
 */
export function planMachinesFromInspections(
  inspections: readonly PlanInspection[],
  machines: readonly Pick<Machine, 'id' | 'machineName' | 'modelCode'>[],
): MachinePlan {
  const existing = new Map(machines.map((machine) => [machineKey(machine.machineName), machine]));
  const link = new Map<string, string[]>();
  const groups = new Map<string, PlanInspection[]>();
  const unmatched: string[] = [];
  for (const inspection of inspections) {
    if (!isStarted(inspection) || inspection.machineRef) continue;
    const key = machineKey(inspection.machineName);
    if (!key) {
      unmatched.push(inspection.id);
      continue;
    }
    const machine = existing.get(key);
    if (machine) {
      if (machine.modelCode === inspection.modelCode) {
        link.set(machine.id, [...(link.get(machine.id) ?? []), inspection.id]);
      } else unmatched.push(inspection.id);
      continue;
    }
    const group = `${key}\n${inspection.modelCode}`;
    groups.set(group, [...(groups.get(group) ?? []), inspection]);
  }

  // One machine per Machine ID: the model with the most inspections, then the newest one.
  const byName = new Map<string, PlanInspection[][]>();
  for (const members of groups.values()) {
    const key = machineKey(members[0]!.machineName);
    byName.set(key, [...(byName.get(key) ?? []), members.sort(newerFirst)]);
  }
  const create: MachinePlan['create'] = [];
  for (const candidates of byName.values()) {
    candidates.sort((a, b) => b.length - a.length || newerFirst(a[0]!, b[0]!));
    const [winner, ...losers] = candidates;
    const newest = winner![0]!;
    create.push({
      machineName: newest.machineName.trim(),
      modelCode: newest.modelCode,
      serialNumber: newest.serialNumber.trim(),
      inspectionIds: winner!.map((inspection) => inspection.id),
    });
    for (const loser of losers) unmatched.push(...loser.map((inspection) => inspection.id));
  }
  create.sort((a, b) => BY_TEXT.compare(a.machineName, b.machineName));
  return {
    create,
    link: [...link].map(([machineId, inspectionIds]) => ({ machineId, inspectionIds })),
    unmatched,
  };
}
