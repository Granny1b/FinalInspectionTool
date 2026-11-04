import type { Inspection } from '@modig/shared';
import { useMemo, useState } from 'react';
import { modelName, useSettings } from '../../lib/useSettings';
import { inspectionPrint, type PrintMode } from './model';
import { PrintPreviewDialog } from './PrintPreviewDialog';

type Props = {
  /** As the page shows it, unsaved edits included (inspectionOnScreen). */
  inspection: Inspection;
  /** Prints that mode as the page's Print / Save PDF does (saving first). */
  onPrint: (mode: PrintMode) => void;
  onClose: () => void;
};

/**
 * The inspection's printout in the preview dialog: the report first (what an inspector most
 * wants to check before printing), or the blank checklist, at 2 deviation cards per page as the
 * Print / Save PDF menu opens it.
 */
export function InspectionPreview({ inspection, onPrint, onClose }: Props) {
  const settings = useSettings();
  const [mode, setMode] = useState<PrintMode>('report');
  const model = useMemo(
    () =>
      settings.data
        ? inspectionPrint(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
          })
        : null,
    [inspection, settings.data, mode],
  );
  const machine = inspection.front.machineName.trim();

  return (
    <PrintPreviewDialog
      subject={`${inspection.number}${machine ? ` · ${machine}` : ''}`}
      model={model}
      logoImageId={settings.data?.logoImageId}
      mode={{ value: mode, onChange: setMode }}
      failed={settings.isError ? settings : null}
      onPrint={() => onPrint(mode)}
      onClose={onClose}
    />
  );
}
