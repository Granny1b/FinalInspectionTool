import { RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from './Button';
import { ErrorScreen } from './ErrorScreen';

/** Last-resort error boundary for the router, instead of React Router's developer screen. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'The page hit an unexpected error. Reloading usually helps.';
  return (
    <ErrorScreen
      title="Something went wrong"
      message={message}
      actions={
        <Button className="w-full" onClick={() => window.location.reload()}>
          <RefreshCw size={16} />
          Reload page
        </Button>
      }
    />
  );
}
