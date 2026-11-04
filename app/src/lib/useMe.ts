import { MeSchema, type Me } from '@modig/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, isNoAccess, leaveForNoAccess } from './api';

export const ME_KEY = ['me'] as const;

/**
 * The signed-in user. Fetched once per visit: an admin's change to someone's name or role shows
 * at their next page load (Settings refreshes it when admins change their own).
 */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: Infinity,
  });
}

/**
 * The API is the one judge of access (the people list, or a role invitation): its 403 for /api/me
 * means no role at all, which the no-access page explains. The app shell never renders then.
 */
export async function fetchMe({ signal }: { signal?: AbortSignal } = {}): Promise<Me> {
  try {
    return (await apiFetch('/api/me', { schema: MeSchema, signal })).data;
  } catch (error) {
    if (isNoAccess(error)) return leaveForNoAccess('/api/me');
    throw error;
  }
}

/**
 * The signed-in user, for components rendered inside the app shell — the shell only renders
 * its pages once /api/me has loaded.
 */
export function useCurrentUser(): Me {
  const { data } = useMe();
  if (!data) throw new Error('useCurrentUser() was called before /api/me loaded');
  return data;
}
