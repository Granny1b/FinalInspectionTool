import type { Person } from '@modig/shared';
import clsx from 'clsx';
import { Pencil, Trash2 } from 'lucide-react';
import { RoleBadge } from '../../components/RoleBadge';
import { formatDate } from '../../lib/format';
import { Badge } from '../templates/Badge';

type Props = {
  people: Person[];
  /** The signed-in admin's email: their row is marked and can't be removed. */
  myEmail: string;
  personName: (email: string) => string;
  onEdit: (person: Person) => void;
  onRemove: (person: Person) => void;
};

const HEAD = 'px-4 py-2.5 font-medium whitespace-nowrap';
/**
 * On a phone the table is the person and the buttons: the role moves under the email, and when
 * and by whom someone was added is left out, so names have room and Edit and Remove stay on the
 * screen instead of off to the right.
 */
const FROM_SM = 'hidden sm:table-cell';
const ACTION =
  'flex size-8 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900';

/** Everyone on the list: who, which role, who added them and when. */
export function PeopleTable({ people, myEmail, personName, onEdit, onRemove }: Props) {
  return (
    // Relative: the visually hidden "Actions" header is positioned, and would otherwise be placed
    // against the page and widen it beyond a phone's screen.
    <div className="relative overflow-x-auto rounded-lg border border-ink-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={HEAD}>
              Person
            </th>
            <th scope="col" className={clsx(HEAD, FROM_SM)}>
              Role
            </th>
            <th scope="col" className={clsx(HEAD, FROM_SM)}>
              Added
            </th>
            <th scope="col" className={HEAD}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {people.map((person) => {
            const you = person.email === myEmail;
            return (
              <tr key={person.email}>
                {/* On a phone it takes the room the buttons leave, and long names and emails are
                    cut short rather than widening the table. */}
                <td className="px-4 py-3 max-sm:w-full max-sm:max-w-0 sm:max-w-72">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink-900" title={person.name}>
                      {person.name}
                    </span>
                    {you && <Badge tone="brand">You</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-500" title={person.email}>
                    {person.email}
                  </div>
                  <div className="mt-1.5 sm:hidden">
                    <RoleBadge roles={[person.role]} />
                  </div>
                </td>
                <td className={clsx(FROM_SM, 'px-4 py-3')}>
                  <RoleBadge roles={[person.role]} />
                </td>
                <td className={clsx(FROM_SM, 'max-w-56 px-4 py-3 text-xs text-ink-500')}>
                  <div className="whitespace-nowrap text-ink-700">{formatDate(person.addedAt)}</div>
                  <div className="truncate" title={person.addedBy}>
                    by {personName(person.addedBy)}
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="flex justify-end gap-0.5">
                    <button
                      type="button"
                      className={ACTION}
                      onClick={() => onEdit(person)}
                      aria-label={`Edit ${person.name}`}
                      title="Edit name and role"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    {/* Not for your own row: removing yourself could take away your access. */}
                    {!you && (
                      <button
                        type="button"
                        className={ACTION}
                        onClick={() => onRemove(person)}
                        aria-label={`Remove ${person.name}`}
                        title="Remove"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                    {you && <span aria-hidden="true" className="size-8" />}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
