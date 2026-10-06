import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button';

/** Placeholder while a page's data loads. */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-ink-200/70" />
      <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-md bg-ink-200/70" />
      <div className="mt-10 h-64 animate-pulse rounded-lg bg-ink-200/70" />
    </div>
  );
}

type LoadErrorProps = {
  title: string;
  message: string;
  onRetry: () => void;
  retrying: boolean;
};

/** A request for the page's data failed; says why and offers to try again. */
export function LoadError({ title, message, onRetry, retrying }: LoadErrorProps) {
  return (
    <section
      role="alert"
      className="rounded-lg border border-ink-200 bg-surface px-6 py-14 text-center"
    >
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-nok-bg text-nok-fg ring-1 ring-nok-border">
        <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">{message}</p>
      <Button variant="secondary" className="mt-6" onClick={onRetry} disabled={retrying}>
        <RefreshCw size={16} aria-hidden="true" className={retrying ? 'animate-spin' : undefined} />
        {retrying ? 'Trying again…' : 'Try again'}
      </Button>
    </section>
  );
}
