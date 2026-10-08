import { useQueryClient } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { imageUrlQuery } from '../../lib/images';
import type { PrintModel } from '../print/model';

type Props = {
  model: PrintModel;
  /** Include the reference images, as the preview does. */
  appendix: boolean;
  /** The settings' own logo, if any. */
  logoImageId: string | undefined;
};

/**
 * "Export to Word (.docx)" (brief §6, phase 5): the printout as an editable Word file, made in the
 * browser. The `docx` library is loaded on the first click.
 */
export function WordExportButton({ model, appendix, logoImageId }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function exportFile() {
    setBusy(true);
    setFailed(false);
    try {
      const { exportWord } = await import('./exportWord');
      await exportWord(model, {
        appendix,
        logoImageId,
        // Read URLs expire: a cached one is used only while it is fresh.
        imageUrl: (id) => queryClient.fetchQuery(imageUrlQuery(id)),
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => void exportFile()} disabled={busy}>
        <FileDown size={16} aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export to Word (.docx)'}
      </Button>
      {failed && (
        <p role="alert" className="max-w-56 text-xs text-nok-fg">
          Couldn’t create the Word file. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
