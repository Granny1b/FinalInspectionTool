import { RefreshCw } from 'lucide-react';
import { Component, useRef, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';

type Props = {
  children: ReactNode;
  /** Closes the editor: the message's Close (or Escape). */
  onClose: () => void;
};

type State = { failed: boolean };

/**
 * The editor's code is fetched when it is first needed. If that fails (offline, or a new version
 * was deployed and the old file is gone), a small message says so instead of the page's error
 * screen, which would take the whole page and its unsaved work with it. A module that failed to
 * load stays failed until the page is reloaded, so that is what it offers.
 */
export class EditorLoadBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? <EditorFailed onClose={this.props.onClose} /> : this.props.children;
  }
}

function EditorFailed({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      dialogRef={dialogRef}
      title="Couldn’t open the editor"
      description="The editor didn’t load. Check your connection, then reload the page to try again."
      onClose={onClose}
    >
      <div data-editor-failed="" className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
          Close
        </Button>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw size={16} aria-hidden="true" />
          Reload page
        </Button>
      </div>
    </Dialog>
  );
}
