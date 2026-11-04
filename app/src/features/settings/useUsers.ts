/** Server state for Settings → Users & access: GET and PUT /api/users (admins). */
import { PeopleSchema, type Person } from '@modig/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isConflict } from '../../lib/api';
import { ME_KEY } from '../../lib/useMe';
import { PEOPLE_DIRECTORY_KEY } from '../../lib/usePeople';
import type { PersonInput } from './users';

export const USERS_KEY = ['users'] as const;

/** Before anyone was added the API sends `{ people: [] }`; the list's own dates aren't needed. */
const UsersSchema = PeopleSchema.pick({ people: true });

/** The list and its version: `etag` is null while there is no list yet. */
export type LoadedUsers = { people: Person[]; etag: string | null };

/** A save that hangs becomes a failure that can be retried (SWA's gateway gives up at 45 s). */
const WRITE_TIMEOUT_MS = 30_000;

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async ({ signal }): Promise<LoadedUsers> => {
      const { data, etag } = await apiFetch('/api/users', { schema: UsersSchema, signal });
      return { people: data.people, etag };
    },
  });
}

/**
 * Saves the whole list over the version it was made from. On a conflict the list is loaded
 * again, so the same change can simply be saved once more, now on top of the other admin's.
 */
export function useSaveUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      people,
      from,
    }: {
      people: PersonInput[];
      from: LoadedUsers;
    }): Promise<LoadedUsers> => {
      const { data, etag } = await apiFetch('/api/users', {
        method: 'PUT',
        body: { people },
        ...(from.etag ? { ifMatch: from.etag } : { ifNoneMatch: '*' as const }),
        schema: UsersSchema,
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      return { people: data.people, etag };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(USERS_KEY, saved);
      // Names on other pages, and the admin's own name in the sidebar.
      void queryClient.invalidateQueries({ queryKey: PEOPLE_DIRECTORY_KEY });
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    onError: (error) => {
      if (isConflict(error)) void queryClient.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

/** Said after a 412: the list on screen is the other admin's by then. */
export const USERS_CONFLICT_MESSAGE =
  'Someone else changed the list just now. It has been reloaded: check it and save again.';
