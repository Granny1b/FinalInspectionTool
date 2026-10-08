import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { ApiRequestError } from '../lib/api';
import { signOutUrl } from '../lib/auth';
import { Button } from './Button';
import { ErrorScreen } from './ErrorScreen';

type Props = { error: unknown; retrying: boolean; onRetry: () => void };

/** /api/me failed, so no page can be shown: say why, offer to try again or sign out. */
export function AccountError({ error, retrying, onRetry }: Props) {
  return (
    <ErrorScreen
      title="We couldn't load your account"
      message={
        error instanceof ApiRequestError
          ? error.message
          : 'Check your network connection and try again.'
      }
      actions={
        <>
          <Button className="w-full" onClick={onRetry}>
            <RefreshCw size={16} className={clsx(retrying && 'animate-spin')} />
            {retrying ? 'Trying again…' : 'Try again'}
          </Button>
          <a href={signOutUrl()} className="text-sm text-ink-500 hover:text-ink-900">
            Sign out
          </a>
        </>
      }
    />
  );
}
