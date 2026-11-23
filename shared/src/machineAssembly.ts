/**
 * A machine's assembly: an assembly instruction bound to a machine being built, signed off step by
 * step as the work is done. Binding copies the instruction's latest published revision for that
 * machine; a later revision reaches it only when someone updates it, and the sign-offs stay (a
 * step keeps its id through revisions).
 *
 * Stored in `machine-assemblies/`: `{machineId}/{id}.json` is the copy, and
 * `{machineId}/{id}.signoffs.json` who signed which step and when. Apart, so signing writes a
 * small file, and several people signing at once never overwrite each other's work: each
 * sign-off is merged into the latest version on the server.
 */
import { z } from 'zod';
import { stepsMinutes } from './assembly';
import { IdSchema, ModelCodeSchema, SectionSchema, type Section } from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });
const Count = z.number().int().min(0);

/** "SA", "LCS", "3034": who signs, as they write it. One to five letters or digits. */
export const InitialsSchema = z
  .string()
  .trim()
  .min(1, 'Enter your initials')
  .max(5)
  .regex(/^[\p{L}\p{N}]+$/u, 'Letters and digits only');

/** "Sam Andersson" → "SA", "sam.andersson@modig.se" → "SA"; '' when there is nothing to go by. */
export function initialsOf(name: string): string {
  const local = name.split('@')[0] ?? name;
  return local
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word.charAt(0).toLocaleUpperCase('sv'))
    .join('');
}

export const AssemblySignOffSchema = z.object({
  initials: InitialsSchema,
  /** The signed-in account (email) it was signed from: the initials are typed, this is not. */
  by: z.string(),
  at: IsoDateTime,
});
export type AssemblySignOff = z.infer<typeof AssemblySignOffSchema>;

/** Keyed by the step's id (`Item.id`). A step without an entry is not signed. */
export const AssemblySignOffsSchema = z.record(IdSchema, AssemblySignOffSchema);
export type AssemblySignOffs = z.infer<typeof AssemblySignOffsSchema>;

export const MachineAssemblySchema = z.object({
  id: IdSchema,
  machineRef: IdSchema,
  /** The instruction it was copied from, and the published revision the copy stands at. */
  templateId: IdSchema,
  templateRevision: z.number().int().min(1),
  name: z.string().max(200),
  modelCode: ModelCodeSchema,
  /** The instruction's tasks and steps, as published in that revision. */
  sections: z.array(SectionSchema),
  createdAt: IsoDateTime,
  createdBy: z.string(),
  /** When the copy was last brought up to a newer revision (or made). */
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type MachineAssembly = z.infer<typeof MachineAssemblySchema>;

/** GET /api/machines/{id}/assemblies/{assemblyId}, and what signing answers with. */
export const MachineAssemblyDetailSchema = z.object({
  assembly: MachineAssemblySchema,
  signOffs: AssemblySignOffsSchema,
  /**
   * The instruction's latest published revision now, or null when the instruction was deleted:
   * above `assembly.templateRevision`, the copy can be updated.
   */
  latestRevision: z.number().int().min(1).nullable(),
});
export type MachineAssemblyDetail = z.infer<typeof MachineAssemblyDetailSchema>;

/** One of a machine's assemblies on the machine's page: what it is and how far it has come. */
export const MachineAssemblySummarySchema = z.object({
  id: IdSchema,
  machineRef: IdSchema,
  templateId: IdSchema,
  templateRevision: z.number().int().min(1),
  name: z.string(),
  tasks: Count,
  tasksDone: Count,
  steps: Count,
  signed: Count,
  /** The estimated minutes of all steps, and of those signed. */
  minutes: Count,
  minutesSigned: Count,
  /** When the last step was signed, if any is. */
  lastSignedAt: IsoDateTime.optional(),
  latestRevision: z.number().int().min(1).nullable(),
});
export type MachineAssemblySummary = z.infer<typeof MachineAssemblySummarySchema>;
export const MachineAssemblyListSchema = z.array(MachineAssemblySummarySchema);

/** POST /api/machines/{id}/assemblies: bind this assembly instruction to the machine. */
export const AddMachineAssemblyRequestSchema = z.object({ templateId: IdSchema });
export type AddMachineAssemblyRequest = z.infer<typeof AddMachineAssemblyRequestSchema>;

const StepIds = z.array(IdSchema).min(1).max(2000);

/**
 * POST …/sign: these steps are done, signed with these initials. A step someone already signed
 * keeps that sign-off: the first one stands.
 */
export const SignStepsRequestSchema = z.object({ itemIds: StepIds, initials: InitialsSchema });
export type SignStepsRequest = z.infer<typeof SignStepsRequestSchema>;

/** POST …/unsign: take these sign-offs back (one's own; an admin anyone's). */
export const UnsignStepsRequestSchema = z.object({ itemIds: StepIds });
export type UnsignStepsRequest = z.infer<typeof UnsignStepsRequestSchema>;

/** How far a task has come: its steps, and how many of them are signed. */
export type TaskProgress = {
  sectionId: string;
  steps: number;
  signed: number;
  /** Every step signed, and there is at least one. */
  done: boolean;
};

export type AssemblyProgress = {
  tasks: TaskProgress[];
  tasksDone: number;
  steps: number;
  signed: number;
  minutes: number;
  minutesSigned: number;
  /** Every step of every task signed. */
  done: boolean;
  lastSignedAt: string | undefined;
};

/**
 * How far the work has come. Only the steps of the copy count: a sign-off of a step a newer
 * revision no longer has is kept, but is no part of the progress.
 */
export function assemblyProgress(
  sections: readonly Section[],
  signOffs: AssemblySignOffs,
): AssemblyProgress {
  let lastSignedAt: string | undefined;
  let minutesSigned = 0;
  const tasks = sections.map((section): TaskProgress => {
    const signedItems = section.items.filter((item) => signOffs[item.id]);
    for (const item of signedItems) {
      const at = signOffs[item.id]!.at;
      if (!lastSignedAt || at > lastSignedAt) lastSignedAt = at;
    }
    minutesSigned += stepsMinutes(signedItems);
    return {
      sectionId: section.id,
      steps: section.items.length,
      signed: signedItems.length,
      done: section.items.length > 0 && signedItems.length === section.items.length,
    };
  });
  const steps = tasks.reduce((sum, task) => sum + task.steps, 0);
  const signed = tasks.reduce((sum, task) => sum + task.signed, 0);
  return {
    tasks,
    tasksDone: tasks.filter((task) => task.done).length,
    steps,
    signed,
    minutes: sections.reduce((sum, section) => sum + stepsMinutes(section.items), 0),
    minutesSigned,
    done: steps > 0 && signed === steps,
    lastSignedAt,
  };
}

/** The summary of a machine's assembly, for the machine's page. */
export function machineAssemblySummary(
  assembly: MachineAssembly,
  signOffs: AssemblySignOffs,
  latestRevision: number | null,
): MachineAssemblySummary {
  const progress = assemblyProgress(assembly.sections, signOffs);
  return {
    id: assembly.id,
    machineRef: assembly.machineRef,
    templateId: assembly.templateId,
    templateRevision: assembly.templateRevision,
    name: assembly.name,
    tasks: progress.tasks.length,
    tasksDone: progress.tasksDone,
    steps: progress.steps,
    signed: progress.signed,
    minutes: progress.minutes,
    minutesSigned: progress.minutesSigned,
    ...(progress.lastSignedAt && { lastSignedAt: progress.lastSignedAt }),
    latestRevision,
  };
}

/**
 * The sign-offs with these steps signed: a step already signed keeps its sign-off. Returns the
 * same object when nothing changes.
 */
export function withSignOffs(
  signOffs: AssemblySignOffs,
  itemIds: readonly string[],
  signOff: AssemblySignOff,
): AssemblySignOffs {
  const fresh = itemIds.filter((id) => !signOffs[id]);
  if (fresh.length === 0) return signOffs;
  return { ...signOffs, ...Object.fromEntries(fresh.map((id) => [id, signOff])) };
}

/**
 * The sign-offs without these steps'. `mayRemove` says whose a caller may take back; the ids
 * refused are returned too. Returns the same object when nothing changes.
 */
export function withoutSignOffs(
  signOffs: AssemblySignOffs,
  itemIds: readonly string[],
  mayRemove: (signOff: AssemblySignOff) => boolean,
): { signOffs: AssemblySignOffs; refused: string[] } {
  const refused = itemIds.filter((id) => signOffs[id] && !mayRemove(signOffs[id]));
  const removing = new Set(itemIds.filter((id) => signOffs[id] && mayRemove(signOffs[id])));
  if (removing.size === 0) return { signOffs, refused };
  return {
    signOffs: Object.fromEntries(Object.entries(signOffs).filter(([id]) => !removing.has(id))),
    refused,
  };
}
