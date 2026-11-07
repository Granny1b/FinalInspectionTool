import type { InspectionKind } from '@modig/shared';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { filterFromParams, filterToParams, LOG_PATHS } from '../features/deviationLog/model';
import { parseDeviationsPerPage } from '../features/print/links';
import {
  LOG_PRINT_LAYOUT_LABELS,
  LOG_PRINT_LAYOUTS,
  parseLogLayout,
} from '../features/print/log/model';
import { useDeviationLogPrint } from '../features/print/log/useDeviationLogPrint';
import { defaultDeviationsPerPage } from '../features/print/model';
import { PrintLoadError, PrintLoading } from '../features/print/PrintStates';
import { Segmented } from '../features/print/PrintToolbar';
import { PrintView } from '../features/print/PrintView';
import { usePrintImages } from '../features/print/usePrintImages';
import { useSettings } from '../lib/useSettings';

/**
 * `/deviations/final/print` and `/deviations/quality/print`: the deviation log under the log
 * page's filters (in the address, as the page keeps them) as a printout for the machine:
 * `layout=list` (the checklist, the default) or `layout=cards` (with pictures,
 * `deviationsPerPage=2|4`). `autoprint=1` opens the print dialog once, when everything is in.
 */
export function DeviationLogPrintPage({ kind }: { kind: InspectionKind }) {
  const [params, setParams] = useSearchParams();
  const filter = filterFromParams(params, kind);
  const layout = parseLogLayout(params.get('layout')) ?? 'list';
  const settings = useSettings();
  const { model, failed } = useDeviationLogPrint(kind, filter, layout);
  const images = usePrintImages(model, settings.data?.logoImageId, { appendix: false });

  // A choice changes the address in place; printing again needs the button.
  const setParam = useCallback(
    (name: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === null) next.delete(name);
          else next.set(name, value);
          next.delete('autoprint');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const dropAutoprint = useCallback(() => setParam('autoprint', null), [setParam]);

  if (failed) return <PrintLoadError query={failed} />;
  if (!model || images.loading) return <PrintLoading />;

  const perPage =
    parseDeviationsPerPage(params.get('deviationsPerPage')) ?? defaultDeviationsPerPage(model);
  const filters = filterToParams(filter).toString();
  return (
    <PrintView
      model={model}
      images={images}
      subject={model.header.title}
      revision={model.revisionLabel}
      back={{
        to: filters ? `${LOG_PATHS[kind]}?${filters}` : LOG_PATHS[kind],
        label: 'Back to the deviations',
      }}
      choices={
        <Segmented
          label="What to print"
          options={LOG_PRINT_LAYOUTS.map((value) => ({
            value,
            label: LOG_PRINT_LAYOUT_LABELS[value],
          }))}
          value={layout}
          onChange={(value) => setParam('layout', value)}
        />
      }
      deviationsPerPage={{
        value: perPage,
        onChange: (value) => setParam('deviationsPerPage', String(value)),
      }}
      autoprint={params.get('autoprint') === '1'}
      onAutoprinted={dropAutoprint}
    />
  );
}
