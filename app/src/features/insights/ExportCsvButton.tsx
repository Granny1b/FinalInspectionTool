import type { InsightsQuery } from '@modig/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { errorMessage } from '../../lib/api';
import { downloadCsv } from './queries';

type Props = {
  /** Null while the filters can't be used. */
  query: InsightsQuery | null;
  onError: (message: string | null) => void;
};

/** Brief §5.5: the filtered deviation rows as a CSV file, for Excel or Power BI. */
export function ExportCsvButton({ query, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!query) return;
    setBusy(true);
    onError(null);
    try {
      await downloadCsv(query);
    } catch (error) {
      onError(`The CSV could not be exported. ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" onClick={() => void download()} disabled={!query || busy}>
      <Download size={16} aria-hidden="true" />
      {busy ? 'Exporting…' : 'Export CSV'}
    </Button>
  );
}
