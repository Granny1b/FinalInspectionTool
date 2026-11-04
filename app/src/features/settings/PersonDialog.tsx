import { ROLES, type Me, type Person, type Role } from '@modig/shared';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { errorMessage, isConflict } from '../../lib/api';
import { Invitation } from './Invitation';
import { USERS_CONFLICT_MESSAGE, useSaveUsers, type LoadedUsers } from './useUsers';
import {
  addPerson,
  checkPerson,
  isListed,
  listIssue,
  ROLE_LABELS,
  updatePerson,
  type PersonErrors,
  type PersonInput,
} from './users';

export type PersonDialogMode =
  | { kind: 'add' }
  /** The signed-in admin, who has access through a role invitation, adding themselves. */
  | { kind: 'add-self' }
  | { kind: 'edit'; person: Person };

type Props = {
  mode: PersonDialogMode;
  /** The list as loaded now: a save is made on top of it. */
  users: LoadedUsers;
  me: Me;
  onClose: () => void;
};

/**
 * Adds someone (then shows the invitation to send them) or edits a name and role. An admin's own
 * role stays admin: the API refuses a change that takes away the caller's admin access.
 */
export function PersonDialog({ mode, users, me, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const save = useSaveUsers();
  const editing = mode.kind === 'edit' ? mode.person : null;
  const [name, setName] = useState(editing?.name ?? (mode.kind === 'add-self' ? me.name : ''));
  const [email, setEmail] = useState(editing?.email ?? (mode.kind === 'add-self' ? me.email : ''));
  const [role, setRole] = useState<Role>(editing?.role ?? 'inspector');
  const [errors, setErrors] = useState<PersonErrors>({});
  const [issue, setIssue] = useState<string | null>(null);
  const [added, setAdded] = useState<PersonInput | null>(null);
  const close = () => dialogRef.current?.close();

  const self = (editing?.email ?? email.trim().toLowerCase()) === me.email;
  // Never offered as anything but admin: the API would refuse it anyway.
  const chosenRole: Role = self ? 'admin' : role;

  function submit(event: FormEvent) {
    event.preventDefault();
    setIssue(null);
    const others = editing ? [] : users.people;
    const checked = checkPerson({ name, email: editing?.email ?? email, role: chosenRole }, others);
    setErrors(checked.errors ?? {});
    if (checked.errors) {
      (checked.errors.name ? nameRef : emailRef).current?.focus();
      return;
    }
    const { person } = checked;
    if (editing && !isListed(users.people, editing.email)) {
      setIssue(`${editing.name} was removed from the list in the meantime.`);
      return;
    }
    const next = editing
      ? updatePerson(users.people, editing.email, { name: person.name, role: person.role })
      : addPerson(users.people, person);
    const problem = listIssue(next);
    if (problem) {
      setIssue(problem);
      return;
    }
    save.mutate(
      { people: next, from: users },
      {
        // Someone just added gets the invitation to send; nobody needs one to themselves.
        onSuccess: () => (mode.kind === 'add' && !self ? setAdded(person) : close()),
      },
    );
  }

  if (added) {
    return (
      <Dialog
        dialogRef={dialogRef}
        title={`${added.name} can sign in now`}
        description="Send them this invitation: the app doesn't send email itself."
        onClose={onClose}
      >
        <Invitation person={added} />
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={close}>
            Done
          </Button>
        </div>
      </Dialog>
    );
  }

  const failure = issue ?? (save.isError ? saveError(save.error) : null);
  return (
    <Dialog
      dialogRef={dialogRef}
      title={
        editing
          ? `Edit ${editing.name}`
          : mode.kind === 'add-self'
            ? 'Add yourself'
            : 'Add a person'
      }
      description={
        editing
          ? `${editing.email}. To change the email, remove them and add them again.`
          : mode.kind === 'add-self'
            ? 'So the name shown for you on inspections and reports is the one you choose.'
            : 'They sign in with the Microsoft account of this email. Nothing is sent: you get an invitation to pass on.'
      }
      onClose={onClose}
      busy={save.isPending}
    >
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <Field label="Name" hint="Shown in the app and printed on reports." error={errors.name}>
          {(control) => (
            <input
              {...control}
              ref={nameRef}
              required
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={clsx(INPUT, 'h-9')}
            />
          )}
        </Field>
        {!editing && (
          <Field
            label="Email"
            hint={
              mode.kind === 'add-self'
                ? 'The email you are signed in with.'
                : 'The email of their Microsoft account: for most people, their work email.'
            }
            error={errors.email}
          >
            {(control) => (
              <input
                {...control}
                ref={emailRef}
                type="email"
                required
                autoComplete="off"
                spellCheck={false}
                maxLength={254}
                readOnly={mode.kind === 'add-self'}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={clsx(INPUT, 'h-9 read-only:bg-ink-50 read-only:text-ink-600')}
              />
            )}
          </Field>
        )}
        <RoleChoice
          value={chosenRole}
          onChange={setRole}
          locked={self ? "You're an admin. Another admin can change your role." : null}
        />

        {failure && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {failure}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {save.isPending
              ? 'Saving…'
              : editing
                ? 'Save'
                : mode.kind === 'add-self'
                  ? 'Add me'
                  : 'Add person'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function saveError(error: unknown): string {
  return isConflict(error) ? USERS_CONFLICT_MESSAGE : errorMessage(error);
}

type RoleChoiceProps = {
  value: Role;
  onChange: (role: Role) => void;
  /** Why the role can't be changed, or null when it can. */
  locked: string | null;
};

/** The two roles as radio cards, each with what it allows. */
function RoleChoice({ value, onChange, locked }: RoleChoiceProps) {
  const name = useId();
  const hintId = useId();
  return (
    <fieldset aria-describedby={locked ? hintId : undefined}>
      <legend className="text-sm font-medium text-ink-800">Role</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {ROLES.map((role) => (
          <label
            key={role}
            className={clsx(
              'flex gap-3 rounded-lg border border-ink-200 px-3.5 py-3 transition-colors',
              'has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:outline-brand-600',
              locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-ink-300',
            )}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={value === role}
              disabled={locked !== null}
              onChange={() => onChange(role)}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
            />
            <span>
              <span className="block text-sm font-medium text-ink-900">
                {ROLE_LABELS[role].name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-600">{ROLE_LABELS[role].summary}</span>
            </span>
          </label>
        ))}
      </div>
      {locked && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500">
          {locked}
        </p>
      )}
    </fieldset>
  );
}
