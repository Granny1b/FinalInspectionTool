import type { Inspection, PeopleDirectory } from '@modig/shared';
import { useMemo, useState } from 'react';
import { personName, usePeopleDirectory } from '../../lib/usePeople';
import { modelName, useSettings } from '../../lib/useSettings';
import { inspectionPrint, PRINT_MODE_LABELS, PRINT_MODES, type PrintMode } from './model';
import { PrintPreviewDialog } from './PrintPreviewDialog';
import { Segmented } from './PrintToolbar';

/** One empty directory, so the model isn't rebuilt on every render after a failed load. */
const NO_PEOPLE: PeopleDirectory = [];

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
  // "Finalised … by" names the person, as the print route does: waited for, so the cards aren't
  // laid out twice, but not needed (a failed load shows the email).
  const people = usePeopleDirectory();
  const directory = people.isPending ? null : (people.data ?? NO_PEOPLE);
  const model = useMemo(
    () =>
      settings.data && directory
        ? inspectionPrint(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
            personName: (email) => personName(directory, email),
          })
        : null,
    [inspection, settings.data, mode, directory],
  );
  const machine = inspection.front.machineName.trim();

  return (
    <PrintPreviewDialog
      subject={`${inspection.number}${machine ? ` · ${machine}` : ''}`}
      model={model}
      logoImageId={settings.data?.logoImageId}
      choices={
        <Segmented
          label="What to show"
          options={PRINT_MODES.map((value) => ({ value, label: PRINT_MODE_LABELS[value] }))}
          value={mode}
          onChange={setMode}
        />
      }
      failed={settings.isError ? settings : null}
      onPrint={() => onPrint(mode)}
      onClose={onClose}
    />
  );
}
