import type { ReactNode } from 'react';
import { LoadError, PageLoading } from '../../components/PageStates';
import { errorMessage } from '../../lib/api';

/** Loading, errors and "not found" on a print route (no app shell), in place of the preview. */
export function PrintMessage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>;
}

export function PrintLoading() {
  return (
    <PrintMessage>
      <PageLoading label="Preparing the printout…" />
    </PrintMessage>
  );
}

type FailedQuery = { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };

export function PrintLoadError({ query }: { query: FailedQuery }) {
  return (
    <PrintMessage>
      <LoadError
        title="We couldn't load what to print"
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    </PrintMessage>
  );
}
