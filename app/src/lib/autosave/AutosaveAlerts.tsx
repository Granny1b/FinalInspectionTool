import { CONFLICT_MESSAGE } from '@modig/shared';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button, ButtonLink } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { SIGNED_OUT_MESSAGE } from '../api';
import { LOGIN_PAGE } from '../auth';
import type { AutosaveState } from './autosave';

type Props = {
  /** Someone else saved first (an autosave's 412, or the editor's own, e.g. on publish). */
  conflict: boolean;
  /** Something is not saved. */
  dirty: boolean;
  state: AutosaveState;
  /** The last Reload failed. */
  reloadFailed: boolean;
  onReload: () => void;
};

/** The editors' callouts for a conflict and for a save that failed for good. */
export function AutosaveAlerts({ conflict, dirty, state, reloadFailed, onReload }: Props) {
  return (
    <>
      {conflict && (
        <Callout
          tone="error"
          role="alert"
          actions={
            <Button variant="secondary" onClick={onReload}>
              <RefreshCw size={16} aria-hidden="true" />
              Reload
            </Button>
          }
        >
          <strong className="font-semibold">{CONFLICT_MESSAGE}</strong>{' '}
          {dirty
            ? 'Your changes since then are not saved, and autosave is paused.'
            : 'Autosave is paused.'}
          {reloadFailed && ' Reloading failed: check your connection and try again.'}
        </Callout>
      )}
      {state.status === 'error' && !state.willRetry && (
        <Callout
          tone="error"
          role="alert"
          actions={
            // Signed out: sign in again in another tab, so this one keeps the unsaved changes.
            state.message === SIGNED_OUT_MESSAGE && (
              <ButtonLink to={LOGIN_PAGE} target="_blank" variant="secondary">
                Sign in
                <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">(opens a new tab)</span>
              </ButtonLink>
            )
          }
        >
          <strong className="font-semibold">Couldn’t save:</strong> {state.message}
        </Callout>
      )}
    </>
  );
}
