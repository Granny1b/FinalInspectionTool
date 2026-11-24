import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

/** Retrying a 4xx only repeats the same answer; network blips and 5xx get two more tries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/**
 * What was fetched is shown as it is for this long before a page opened again asks the API anew.
 * Without it, every click between pages refetched every list. One's own changes show at once all
 * the same (each save refreshes what it touches); someone else's show within this time.
 */
const FRESH_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: FRESH_MS },
  },
});
