/**
 * The people list as Settings → Users & access edits it: every change saves the whole list
 * (PUT /api/users), so these work on the list and leave the server's fields to the server.
 */
import { PersonSchema, type PeopleInput, type Person, type Role } from '@modig/shared';

/** What the client sends for one person; addedAt/addedBy are the server's. */
export type PersonInput = PeopleInput['people'][number];

export const ROLE_LABELS: Record<Role, { name: string; summary: string }> = {
  inspector: { name: 'Inspector', summary: 'Creates inspections and fills them in.' },
  admin: {
    name: 'Admin',
    summary: 'Everything an inspector does, plus templates, insights and settings.',
  },
};

export function toInput(people: readonly Person[]): PersonInput[] {
  return people.map(({ email, name, role }) => ({ email, name, role }));
}

/** A–Z by name, the way Swedish names sort. */
export function sortPeople<P extends Pick<Person, 'name' | 'email'>>(people: readonly P[]): P[] {
  return [...people].sort(
    (a, b) => a.name.localeCompare(b.name, 'sv') || a.email.localeCompare(b.email),
  );
}

/** People whose name or email contains `query`, ignoring case. */
export function filterPeople<P extends Pick<Person, 'name' | 'email'>>(
  people: readonly P[],
  query: string,
): P[] {
  const needle = query.trim().toLocaleLowerCase('sv');
  if (!needle) return [...people];
  return people.filter(
    (person) =>
      person.name.toLocaleLowerCase('sv').includes(needle) || person.email.includes(needle),
  );
}

export function isListed(people: readonly Pick<Person, 'email'>[], email: string): boolean {
  const key = email.trim().toLowerCase();
  return people.some((person) => person.email === key);
}

export function addPerson(people: readonly Person[], person: PersonInput): PersonInput[] {
  return [...toInput(people), person];
}

export function updatePerson(
  people: readonly Person[],
  email: string,
  changes: Pick<PersonInput, 'name' | 'role'>,
): PersonInput[] {
  return toInput(people).map((person) =>
    person.email === email ? { ...person, ...changes } : person,
  );
}

export function removePerson(people: readonly Person[], email: string): PersonInput[] {
  return toInput(people).filter((person) => person.email !== email);
}

/**
 * The API's rule, checked before saving so the message comes without a round trip: once anyone
 * is on the list, an admin must be, or only invited admins could change it again.
 */
export function listIssue(next: readonly PersonInput[]): string | null {
  return next.length > 0 && !next.some((person) => person.role === 'admin')
    ? 'The list needs at least one admin. Add yourself as an admin first.'
    : null;
}

export type PersonErrors = Partial<Record<'name' | 'email', string>>;

/**
 * The typed-in person, cleaned up as the API will store it (trimmed, email lowercased), or what
 * is wrong with it. `others` are the emails already on the list.
 */
export function checkPerson(
  values: { name: string; email: string; role: Role },
  others: readonly Pick<Person, 'email'>[],
): { person: PersonInput; errors: null } | { person: null; errors: PersonErrors } {
  const result = PersonSchema.pick({ email: true, name: true, role: true }).safeParse(values);
  const errors: PersonErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'email') errors.email ??= 'Enter an email address, like name@modig.se.';
      if (field === 'name') {
        errors.name ??= issue.code === 'too_big' ? 'At most 100 characters.' : 'Enter their name.';
      }
    }
  } else if (isListed(others, result.data.email)) {
    errors.email = `${result.data.email} is already on the list.`;
  }
  return result.success && !errors.email
    ? { person: result.data, errors: null }
    : { person: null, errors };
}

/** "an inspector", "an admin". */
function withArticle(role: Role): string {
  return `an ${ROLE_LABELS[role].name.toLowerCase()}`;
}

/**
 * What the admin sends the person they added: the app does not send email itself. `appUrl` is
 * the address they are signed in at.
 */
export function invitation(person: PersonInput, appUrl: string): { subject: string; body: string } {
  const firstName = person.name.trim().split(/\s+/)[0] ?? '';
  return {
    subject: 'Your access to Modig Final Inspection',
    body: [
      `Hi ${firstName},`,
      '',
      `You now have access to Modig Final Inspection as ${withArticle(person.role)}.`,
      '',
      `Open ${appUrl} and sign in with your Microsoft account ${person.email}.`,
    ].join('\n'),
  };
}

/** A mailto: link that opens the invitation in the admin's email program, addressed and filled in. */
export function invitationMailto(
  email: string,
  { subject, body }: { subject: string; body: string },
): string {
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?${params}`;
}
