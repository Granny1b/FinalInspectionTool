/**
 * Change requests: someone reading or following an assembly instruction flags a step that is
 * wrong ("the bolt list misses the washers"), and the admins, who write the instructions, see it
 * as a ticket to fix. A ticket remembers where it was flagged (the instruction, the step as it
 * read then, the machine if it was on one) so it is understood after the step has changed.
 *
 * Stored one blob per request: `config/change-requests/{id}.json`.
 */
import { z } from 'zod';
import { IdSchema, ModelCodeSchema } from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });

export const CHANGE_REQUEST_STATUSES = ['open', 'fixed'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

/** What is wrong, in the flagger's words. */
export const ChangeRequestMessageSchema = z
  .string()
  .trim()
  .min(1, 'Describe what is wrong')
  .max(2000);

export const ChangeRequestSchema = z.object({
  id: IdSchema,
  /** The assembly instruction and the step flagged (`Item.id`, stable through revisions). */
  templateId: IdSchema,
  itemId: IdSchema,
  /** As they read when it was flagged: the instruction's name, its model, the task and the step. */
  templateName: z.string(),
  modelCode: ModelCodeSchema,
  /** The published revision that was read. */
  templateRevision: z.number().int().min(1),
  taskTitle: z.string(),
  /** "3.12" */
  stepRef: z.string(),
  stepText: z.string(),
  /** The machine it was flagged on, when it was while building one. */
  machineRef: IdSchema.optional(),
  machineName: z.string().optional(),
  message: ChangeRequestMessageSchema,
  createdAt: IsoDateTime,
  /** The signed-in account (email). */
  createdBy: z.string(),
  status: z.enum(CHANGE_REQUEST_STATUSES),
  /** Set when an admin marks it fixed (cleared when it is reopened). */
  fixedAt: IsoDateTime.optional(),
  fixedBy: z.string().optional(),
  /** What was done about it, if the admin says. */
  resolution: z.string().max(2000).optional(),
});
export type ChangeRequest = z.infer<typeof ChangeRequestSchema>;
export const ChangeRequestListSchema = z.array(ChangeRequestSchema);

/** POST /api/change-requests: flag a step of an assembly instruction. */
export const CreateChangeRequestSchema = z.object({
  templateId: IdSchema,
  itemId: IdSchema,
  message: ChangeRequestMessageSchema,
  /** The machine it is flagged on, if any: its copy of the instruction is what was read. */
  machineId: IdSchema.optional(),
});
export type CreateChangeRequest = z.infer<typeof CreateChangeRequestSchema>;

/** POST /api/change-requests/{id}: mark it fixed (with what was done), or open again. */
export const UpdateChangeRequestSchema = z.object({
  status: z.enum(CHANGE_REQUEST_STATUSES),
  resolution: z.string().trim().max(2000).optional(),
});
export type UpdateChangeRequest = z.infer<typeof UpdateChangeRequestSchema>;

/** GET /api/change-requests/summary: how many are open, for the admins' sidebar. */
export const ChangeRequestSummarySchema = z.object({ open: z.number().int().min(0) });
export type ChangeRequestSummary = z.infer<typeof ChangeRequestSummarySchema>;

/** Open ones first, the newest first among them; then the fixed, the latest fixed first. */
export function compareChangeRequests(a: ChangeRequest, b: ChangeRequest): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  const at = (request: ChangeRequest) =>
    request.status === 'open' ? request.createdAt : (request.fixedAt ?? request.createdAt);
  return at(b).localeCompare(at(a)) || a.id.localeCompare(b.id);
}
