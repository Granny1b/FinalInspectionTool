import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { useInspection } from '../features/inspections/queries';
import { parseMode } from '../features/print/links';
import { inspectionPrint, type PrintMode } from '../features/print/model';
import { PrintLoadError, PrintLoading, PrintMessage } from '../features/print/PrintStates';
import { PrintView } from '../features/print/PrintView';
import { usePrintImages } from '../features/print/usePrintImages';
import { isMissing } from '../lib/api';
import { modelName, useSettings } from '../lib/useSettings';

/**
 * /inspections/:id/print?mode=blank|report[&autoprint=1] — the blank checklist for the walk-round
 * or the report (brief §6). Without a mode: the report once finalised, else the blank checklist.
 */
export function InspectionPrintPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const query = useInspection(id);
  const settings = useSettings();
  const inspection = query.data?.inspection;
  const images = usePrintImages(inspection?.front.photoId, settings.data?.logoImageId);

  const setMode = useCallback(
    (mode: PrintMode) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('mode', mode);
          next.delete('autoprint');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const dropAutoprint = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('autoprint');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  if (isMissing(query.error)) {
    return (
      <PrintMessage>
        <InspectionNotFound />
      </PrintMessage>
    );
  }
  const failed = query.isError ? query : settings.isError ? settings : null;
  if (failed) return <PrintLoadError query={failed} />;
  if (!inspection || !settings.data || images.loading) return <PrintLoading />;

  const mode =
    parseMode(params.get('mode')) ?? (inspection.state === 'finalised' ? 'report' : 'blank');
  const model = inspectionPrint(inspection, mode, {
    companyName: settings.data.companyName,
    modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
  });
  const machine = inspection.front.machineName.trim();

  return (
    <PrintView
      model={model}
      logoUrl={images.logoUrl}
      photoUrl={images.photoUrl}
      subject={`${inspection.number}${machine ? ` · ${machine}` : ''}`}
      back={{ to: `/inspections/${id}`, label: 'Back to the inspection' }}
      modeSwitch={{ mode, onChange: setMode }}
      autoprint={params.get('autoprint') === '1'}
      onAutoprinted={dropAutoprint}
    />
  );
}
