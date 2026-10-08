import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { useInspection } from '../features/inspections/queries';
import { parseAppendix, parseDeviationsPerPage, parseMode } from '../features/print/links';
import { DEFAULT_DEVIATIONS_PER_PAGE, inspectionPrint } from '../features/print/model';
import { PrintLoadError, PrintLoading, PrintMessage } from '../features/print/PrintStates';
import { PrintView } from '../features/print/PrintView';
import { usePrintImages } from '../features/print/usePrintImages';
import { isMissing } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * /inspections/:id/print?mode=blank|report[&deviationsPerPage=2|4][&appendix=1][&autoprint=1] —
 * the blank checklist for the walk-round or the report (brief §6). Without a mode: the report
 * once finalised, else the blank checklist. A report prints 2 deviation cards per page unless
 * asked for 4. `appendix=1` adds the frozen checklist's reference images.
 */
export function InspectionPrintPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const query = useInspection(id);
  const settings = useSettings();
  const inspection = query.data?.inspection;
  const mode =
    parseMode(params.get('mode')) ?? (inspection?.state === 'finalised' ? 'report' : 'blank');
  const perPage =
    parseDeviationsPerPage(params.get('deviationsPerPage')) ?? DEFAULT_DEVIATIONS_PER_PAGE;
  const appendix = parseAppendix(params.get('appendix'));

  const model = useMemo(
    () =>
      inspection && settings.data
        ? inspectionPrint(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
          })
        : null,
    [inspection, settings.data, mode],
  );
  const images = usePrintImages(model, settings.data?.logoImageId, { appendix });

  /** Changes the address in place; a changed layout must not print again by itself. */
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

  if (isMissing(query.error)) {
    return (
      <PrintMessage>
        <InspectionNotFound />
      </PrintMessage>
    );
  }
  const failed = query.isError ? query : settings.isError ? settings : null;
  if (failed) return <PrintLoadError query={failed} />;
  if (!inspection || !model || images.loading) return <PrintLoading />;

  const machine = inspection.front.machineName.trim();
  return (
    <PrintView
      model={model}
      images={images}
      subject={`${inspection.number}${machine ? ` · ${machine}` : ''}`}
      back={{ to: `/inspections/${id}`, label: 'Back to the inspection' }}
      mode={{ value: mode, onChange: (value) => setParam('mode', value) }}
      deviationsPerPage={{
        value: perPage,
        onChange: (value) => setParam('deviationsPerPage', String(value)),
      }}
      appendix={{ value: appendix, onChange: (value) => setParam('appendix', value ? '1' : null) }}
      autoprint={params.get('autoprint') === '1'}
      onAutoprinted={dropAutoprint}
    />
  );
}
