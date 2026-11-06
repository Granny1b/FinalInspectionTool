import type { Inspection, PeopleDirectory } from '@modig/shared';
import { useMemo, useState } from 'react';
import { personName, usePeopleDirectory } from '../../../lib/usePeople';
import { useFollowUps } from '../../deviationLog/queries';
import { modelName, useSettings } from '../../../lib/useSettings';
import {
  DEFAULT_DEVIATIONS_PER_PAGE,
  defaultDeviationsPerPage,
  DEVIATIONS_PER_PAGE,
  type DeviationsPerPage,
} from '../model';
import { PrintPreviewDialog } from '../PrintPreviewDialog';
import { Segmented } from '../PrintToolbar';
import {
  QUALITY_PRINT_MODE_LABELS,
  QUALITY_PRINT_MODES,
  qualityCheckPrintout,
  type QualityPrintMode,
} from './model';

/** One empty directory, so the model isn't rebuilt on every render after a failed load. */
const NO_PEOPLE: PeopleDirectory = [];

type Props = {
  /** As the page shows it, unsaved edits included (inspectionOnScreen). */
  inspection: Inspection;
  /** Prints what is shown as the page's Print / Save PDF does (saving first). */
  onPrint: (mode: QualityPrintMode, deviationsPerPage: DeviationsPerPage | undefined) => void;
  onClose: () => void;
};

/**
 * A quality check's printout in the preview dialog: the entire report first, only the deviations
 * (the cards 2 or 4 to a page, as the print route opens them until one is picked), or its
 * instructions. Print / Save PDF prints what is shown.
 */
export function QualityCheckPreview({ inspection, onPrint, onClose }: Props) {
  const settings = useSettings();
  const [mode, setMode] = useState<QualityPrintMode>('report');
  // Null until picked: then the print route chooses as it would (2, or 4 without photos).
  const [perPage, setPerPage] = useState<DeviationsPerPage | null>(null);
  // "Finalised … by" names the person, as the print route does: waited for, so the cards aren't
  // laid out twice, but not needed (a failed load shows the email).
  const people = usePeopleDirectory();
  const directory = people.isPending ? null : (people.data ?? NO_PEOPLE);
  // Closed deviations show how they were closed, as on the print route.
  const followUps = useFollowUps(inspection.id);
  const model = useMemo(
    () =>
      settings.data && directory && !followUps.isPending
        ? qualityCheckPrintout(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
            personName: (email) => personName(directory, email),
            followUps: followUps.data?.followUps,
          })
        : null,
    [inspection, settings.data, mode, directory, followUps.isPending, followUps.data],
  );
  const shownPerPage =
    perPage ?? (model ? defaultDeviationsPerPage(model) : DEFAULT_DEVIATIONS_PER_PAGE);

  return (
    <PrintPreviewDialog
      subject={model?.subject ?? inspection.number}
      model={model}
      logoImageId={settings.data?.logoImageId}
      choices={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented
            label="What to show"
            options={QUALITY_PRINT_MODES.map((value) => ({
              value,
              label: QUALITY_PRINT_MODE_LABELS[value],
            }))}
            value={mode}
            onChange={setMode}
          />
          {/* The instructions have no deviation cards. */}
          {mode !== 'instructions' && (
            <Segmented
              label="Deviations"
              showLabel
              options={DEVIATIONS_PER_PAGE.map((value) => ({ value, label: `${value} per page` }))}
              value={shownPerPage}
              onChange={setPerPage}
            />
          )}
        </div>
      }
      deviationsPerPage={shownPerPage}
      failed={settings.isError ? settings : null}
      onPrint={() => onPrint(mode, perPage ?? undefined)}
      onClose={onClose}
    />
  );
}
