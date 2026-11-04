import type { Person } from '@modig/shared';
import clsx from 'clsx';
import { ChevronRight, RefreshCw, Search, UserRoundPlus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { INPUT } from '../../components/Field';
import { errorMessage, isConflict } from '../../lib/api';
import { useCurrentUser } from '../../lib/useMe';
import { personName as nameIn } from '../../lib/usePeople';
import { PeopleTable } from './PeopleTable';
import { PersonDialog, type PersonDialogMode } from './PersonDialog';
import { SettingsCard } from './SettingsCard';
import { USERS_CONFLICT_MESSAGE, useSaveUsers, useUsers, type LoadedUsers } from './useUsers';
import { filterPeople, isListed, listIssue, removePerson, sortPeople } from './users';

/** Searching starts to help beyond a screenful of people. */
const SEARCH_FROM = 6;

/**
 * Who may use the app (the people list): add someone and get an invitation to send them, change
 * a name or role, remove someone. Each change saves the whole list over the version on screen.
 */
export function UsersCard() {
  const users = useUsers();
  return (
    <SettingsCard
      title="Users & access"
      description="Who can sign in, with which role, and the name shown for them on inspections and reports."
    >
      {users.isPending ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Loading people…
          </p>
          <div className="h-9 w-48 animate-pulse rounded-md bg-ink-200/70" />
          <div className="mt-4 h-40 animate-pulse rounded-lg bg-ink-200/70" />
        </div>
      ) : users.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-700">
            The list of people couldn't be loaded. {errorMessage(users.error)}
          </p>
          <Button
            variant="secondary"
            onClick={() => void users.refetch()}
            disabled={users.isFetching}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={clsx(users.isFetching && 'animate-spin')}
            />
            Try again
          </Button>
        </div>
      ) : (
        <PeopleEditor users={users.data} />
      )}
      <InvitedEarlier />
    </SettingsCard>
  );
}

function PeopleEditor({ users }: { users: LoadedUsers }) {
  const me = useCurrentUser();
  const remove = useSaveUsers();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<PersonDialogMode | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const [removeIssue, setRemoveIssue] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const searchable = users.people.length >= SEARCH_FROM;
  const sorted = useMemo(() => sortPeople(users.people), [users.people]);
  // Only while the search box is there: a removal can take it away with a query still typed in.
  const visible = useMemo(
    () => (searchable ? filterPeople(sorted, query) : sorted),
    [searchable, sorted, query],
  );
  const personName = (email: string) => nameIn(users.people, email);
  const listed = isListed(users.people, me.email);
  const admins = users.people.filter((person) => person.role === 'admin').length;

  function confirmRemove(person: Person) {
    setRemoving(null);
    setRemoved(null);
    const next = removePerson(users.people, person.email);
    const problem = listIssue(next);
    setRemoveIssue(problem);
    if (problem) return;
    remove.mutate(
      { people: next, from: users },
      {
        onSuccess: () => {
          setRemoved(`${person.name} was removed.`);
          // Their row, and the button that had the focus, are gone.
          addRef.current?.focus();
        },
      },
    );
  }

  const removeFailure =
    removeIssue ??
    (remove.isError
      ? isConflict(remove.error)
        ? USERS_CONFLICT_MESSAGE
        : errorMessage(remove.error)
      : null);

  return (
    <>
      {!listed && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-ink-700">
            <strong className="font-semibold text-ink-900">You're not on the list yet.</strong> You
            have admin access through an Azure role invitation. Add yourself to choose the name
            shown for you
            {users.people.length === 0 && ', and to start the list: it always needs an admin'}.
          </p>
          <Button variant="secondary" onClick={() => setDialog({ kind: 'add-self' })}>
            Add yourself
          </Button>
        </div>
      )}

      {removeFailure && (
        <div className="mb-4">
          <Callout
            tone="error"
            role="alert"
            onDismiss={() => {
              setRemoveIssue(null);
              remove.reset();
            }}
          >
            {removeFailure}
          </Callout>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {searchable && (
          <div role="search" className="relative w-full sm:w-72">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
            />
            <input
              type="search"
              aria-label="Search people"
              placeholder="Search name or email"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={clsx(INPUT, 'h-9 pl-9')}
            />
          </div>
        )}
        <p className="text-sm text-ink-500">
          {count(users.people.length, 'person', 'people')} · {count(admins, 'admin', 'admins')}
          <span role="status">
            {remove.isPending ? ' · Saving…' : removed ? ` · ${removed}` : ''}
          </span>
        </p>
        <Button ref={addRef} className="ml-auto" onClick={() => setDialog({ kind: 'add' })}>
          <UserRoundPlus size={16} aria-hidden="true" />
          Add person
        </Button>
      </div>

      <div className="mt-4">
        {users.people.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-300 px-6 py-8 text-center">
            <p className="text-sm font-medium text-ink-900">No one is on the list yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-balance text-ink-500">
              Until someone is, only people invited through Azure Role management can sign in.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p role="status" className="py-6 text-center text-sm text-ink-500">
            No one matches “{query.trim()}”.
          </p>
        ) : (
          <PeopleTable
            people={visible}
            myEmail={me.email}
            personName={personName}
            onEdit={(person) => setDialog({ kind: 'edit', person })}
            onRemove={(person) => {
              setRemoveIssue(null);
              remove.reset();
              setRemoving(person);
            }}
          />
        )}
      </div>

      {dialog && (
        <PersonDialog
          mode={dialog}
          users={users}
          me={me}
          onClose={() => {
            setDialog(null);
            // Closing hands the focus back to the button that opened the dialog, unless saving
            // took that button away (Add yourself): then it would be lost, so it goes here.
            const focused = document.activeElement;
            if (!focused || focused === document.body) addRef.current?.focus();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message={`${removing.email} can no longer sign in, unless they also have an Azure role invitation. Inspections and reports then show their email instead of their name.`}
          confirmLabel="Remove"
          onConfirm={() => confirmRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  );
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** People who got in the old way keep their access; this says how the two ways combine. */
function InvitedEarlier() {
  return (
    <details className="group mt-6 border-t border-ink-100 pt-4 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink-700 hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="text-ink-500 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        People invited through Azure Role management
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-9 text-ink-600 marker:text-ink-300">
        <li>
          Anyone invited earlier through <Ui>Role management</Ui> in the Azure portal keeps their
          access, with the role from the invitation.
        </li>
        <li>
          Add them here as well to set the name shown for them. Their role here then counts instead
          of the invited one, straight away: no need to sign in again.
        </li>
        <li>
          Removing someone here doesn't remove an invitation. To take that access away too, remove
          them in <Ui>Role management</Ui>.
        </li>
      </ul>
    </details>
  );
}

/** A UI label in the Azure portal. */
function Ui({ children }: { children: string }) {
  return <span className="font-medium text-ink-800">{children}</span>;
}
