import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { StateCard } from './StateCard';

type PageLoadingProps = {
  label?: string;
  /**
   * False under a page's real header (its title is known before the data): then only the
   * content is a placeholder, rather than a second title and description under the first.
   */
  header?: boolean;
};

/** Placeholder while a page's data loads. */
export function PageLoading({ label = 'Loading…', header = true }: PageLoadingProps) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      {header && (
        <>
          <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-ink-200/70" />
          <div className="mt-3 mb-10 h-4 w-96 max-w-full animate-pulse rounded-md bg-ink-200/70" />
        </>
      )}
      <div className="h-64 animate-pulse rounded-lg bg-ink-200/70" />
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
    <StateCard
      role="alert"
      icon={TriangleAlert}
      tone="nok"
      title={title}
      hint={message}
      action={
        <Button variant="secondary" onClick={onRetry} disabled={retrying}>
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={retrying ? 'animate-spin' : undefined}
          />
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
      }
    />
  );
}
