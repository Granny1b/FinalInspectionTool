/**
 * Who may use the app (`config/people.json`), managed by admins in Settings: each person's
 * email (the sign-in's `userDetails`, lowercased), the name shown on screen and on reports, and
 * their role. Replaces Static Web Apps role invitations as the way people get access; an
 * invitation-based role is still honoured, so nobody loses access when this list starts empty.
 */
import { z } from 'zod';
import { ROLES } from './roles';

const IsoDateTime = z.iso.datetime({ offset: true });

/** Lowercased and trimmed, so lookups never depend on how someone typed it. */
export const PersonEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+$/, 'Enter an email address');

export const RoleSchema = z.enum(ROLES);

export const PersonSchema = z.object({
  email: PersonEmailSchema,
  /** "Sam Andersson": shown in the app and printed on reports instead of the email. */
  name: z.string().trim().min(1, 'Name is required').max(100),
  role: RoleSchema,
  addedAt: IsoDateTime,
  addedBy: z.string(),
});
export type Person = z.infer<typeof PersonSchema>;

/** `config/people.json` */
export const PeopleSchema = z.object({
  people: z.array(PersonSchema),
  updatedAt: IsoDateTime,
  updatedBy: z.string(),
});
export type People = z.infer<typeof PeopleSchema>;

/** PUT /api/users (admin, If-Match): the whole list. Server-owned fields are filled in. */
export const PeopleInputSchema = z.object({
  people: z
    .array(PersonSchema.pick({ email: true, name: true, role: true }))
    .refine(
      (people) => new Set(people.map((person) => person.email)).size === people.length,
      'Each email can be on the list once.',
    ),
});
export type PeopleInput = z.infer<typeof PeopleInputSchema>;

/** GET /api/people (inspector): names for emails, to show people by name. */
export const PeopleDirectorySchema = z.array(z.object({ email: z.string(), name: z.string() }));
export type PeopleDirectory = z.infer<typeof PeopleDirectorySchema>;
