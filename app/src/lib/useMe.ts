import { MeSchema, type Me } from '@modig/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

/** The signed-in user. Roles only change at the next sign-in, so this is fetched once. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) => (await apiFetch('/api/me', { schema: MeSchema, signal })).data,
    staleTime: Infinity,
  });
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
