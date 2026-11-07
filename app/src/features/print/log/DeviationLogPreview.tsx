import type { InspectionKind } from '@modig/shared';
import { useState } from 'react';
import { useSettings } from '../../../lib/useSettings';
import type { LogFilter } from '../../deviationLog/model';
import { deviationLogPrintHref } from '../links';
import { defaultDeviationsPerPage, DEVIATIONS_PER_PAGE, type DeviationsPerPage } from '../model';
import { PrintPreviewDialog } from '../PrintPreviewDialog';
import { Segmented } from '../PrintToolbar';
import { LOG_PRINT_LAYOUT_LABELS, LOG_PRINT_LAYOUTS, type LogPrintLayout } from './model';
import { useDeviationLogPrint } from './useDeviationLogPrint';

type Props = {
  kind: InspectionKind;
  /** The log page's filters: the preview shows what they show. */
  filter: LogFilter;
  onClose: () => void;
};

/**
 * The deviation log's printout in the preview dialog, under the page's filters: the checklist
 * first, or the cards with their pictures (2 or 4 to a page). Print / Save PDF opens the print
 * page with the same choices, which prints once it has loaded.
 */
export function DeviationLogPreview({ kind, filter, onClose }: Props) {
  const settings = useSettings();
  const [layout, setLayout] = useState<LogPrintLayout>('list');
  // Null until picked: then the print page chooses as it would (2, or 4 without photos).
  const [perPage, setPerPage] = useState<DeviationsPerPage | null>(null);
  const { model, failed } = useDeviationLogPrint(kind, filter, layout);
  const shownPerPage = perPage ?? (model ? defaultDeviationsPerPage(model) : 4);

  return (
    <PrintPreviewDialog
      subject={model ? `${model.header.title} · ${model.subject}` : 'Deviations'}
      model={model}
      logoImageId={settings.data?.logoImageId}
      choices={
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented
            label="What to show"
            options={LOG_PRINT_LAYOUTS.map((value) => ({
              value,
              label: LOG_PRINT_LAYOUT_LABELS[value],
            }))}
            value={layout}
            onChange={setLayout}
          />
          {layout === 'cards' && (
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
      failed={failed}
      onPrint={() =>
        window.open(
          deviationLogPrintHref(
            kind,
            filter,
            { layout, ...(perPage && layout === 'cards' && { deviationsPerPage: perPage }) },
            true,
          ),
          '_blank',
          'noopener',
        )
      }
      onClose={onClose}
    />
  );
}
