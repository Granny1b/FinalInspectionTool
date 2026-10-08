import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';

/**
 * Reload for an editor: asks first when it would discard unsaved changes. Render `dialog`;
 * `failed` says the last reload couldn't load the document.
 */
export function useReload(dirty: boolean, onReload: () => Promise<boolean>) {
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  async function reload() {
    setConfirming(false);
    setFailed(!(await onReload()));
  }

  return {
    askReload: () => (dirty ? setConfirming(true) : void reload()),
    failed,
    dialog: confirming && (
      <ConfirmDialog
        title="Discard your changes?"
        message="Reloading shows the latest saved version. Your changes that weren’t saved are lost."
        confirmLabel="Discard and reload"
        onConfirm={() => void reload()}
        onCancel={() => setConfirming(false)}
      />
    ),
  };
}
