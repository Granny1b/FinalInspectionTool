/**
 * Names for people. Documents store who did something by email (`updatedBy`, `finalisedBy`, …);
 * the people list in Settings gives each email the name to show, on screen and on reports.
 */
import { PeopleDirectorySchema, type PeopleDirectory } from '@modig/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiFetch } from './api';

export const PEOPLE_DIRECTORY_KEY = ['people', 'directory'] as const;

/** Everyone's name by email. Admins rarely change it, so it is kept for a few minutes. */
export function usePeopleDirectory() {
  return useQuery({
    queryKey: PEOPLE_DIRECTORY_KEY,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/people', { schema: PeopleDirectorySchema, signal })).data,
    staleTime: 5 * 60_000,
  });
}

/**
 * The name to show for whoever `email` is. Someone not on the list (invited through Azure, or
 * removed since) and values that aren't emails ("seed") are shown as stored.
 */
export function personName(directory: PeopleDirectory | undefined, email: string): string {
  const key = email.trim().toLowerCase();
  return directory?.find((person) => person.email === key)?.name ?? email;
}

/** `personName` bound to the directory; shows the stored value until the directory has loaded. */
export function usePersonName(): (email: string) => string {
  const { data } = usePeopleDirectory();
  return useCallback((email: string) => personName(data, email), [data]);
}

/** Names to suggest for the participants field: everyone not added yet (ignoring case), A–Z. */
export function nameSuggestions(
  directory: PeopleDirectory | undefined,
  added: readonly string[],
): string[] {
  const key = (name: string) => name.toLocaleLowerCase('sv');
  const taken = new Set(added.map(key));
  const names = new Map<string, string>();
  for (const { name } of directory ?? []) {
    if (!taken.has(key(name)) && !names.has(key(name))) names.set(key(name), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'sv'));
}
