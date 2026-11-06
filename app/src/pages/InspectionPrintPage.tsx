import type { Inspection, InspectionKind, PeopleDirectory } from '@modig/shared';
import { useCallback, useMemo } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { useFollowUps } from '../features/deviationLog/queries';
import { InspectionNotFound } from '../features/inspections/InspectionNotFound';
import { inspectionHref } from '../features/inspections/listFilter';
import { useInspection } from '../features/inspections/queries';
import {
  parseAppendix,
  parseDeviationsPerPage,
  parseMode,
  parseQualityMode,
  printPath,
} from '../features/print/links';
import { defaultDeviationsPerPage, inspectionPrint } from '../features/print/model';
import { PrintLoadError, PrintLoading, PrintMessage } from '../features/print/PrintStates';
import { PrintView } from '../features/print/PrintView';
import { qualityCheckPrintout } from '../features/print/quality/model';
import { usePrintImages } from '../features/print/usePrintImages';
import { isMissing } from '../lib/api';
import { personName, usePeopleDirectory } from '../lib/usePeople';
import { modelName, useSettings } from '../lib/useSettings';

/** One empty directory, so the model isn't rebuilt on every render after a failed load. */
const NO_PEOPLE: PeopleDirectory = [];

/**
 * /inspections/:id/print?mode=blank|report[&deviationsPerPage=2|4][&appendix=1][&autoprint=1] —
 * the blank checklist for the walk-round or the report (brief §6). Without a mode: the report
 * once finalised, else the blank checklist. A report prints 2 deviation cards per page, or 4 when
 * none has a photo, unless the address asks for the other. `appendix=1` adds the frozen
 * checklist's reference images.
 *
 * /quality-checks/:id/print?mode=report|deviations[&deviationsPerPage=2|4][&autoprint=1] — a
 * quality check's entire report (the default) or only its deviations, cards as for a report.
 * Each address sends the other kind to its own, with the same query.
 */
export function InspectionPrintPage({ kind }: { kind: InspectionKind }) {
  const { id = '' } = useParams();
  const { search } = useLocation();
  const query = useInspection(id);
  // Asked for here, so they load alongside the inspection; the documents read them from the cache.
  const settings = useSettings();
  const people = usePeopleDirectory();
  const inspection = query.data?.inspection;

  if (isMissing(query.error)) {
    return (
      <PrintMessage>
        <InspectionNotFound kind={kind} />
      </PrintMessage>
    );
  }
  if (inspection && inspection.kind !== kind) {
    return <Navigate to={`${printPath(inspection.kind, inspection.id)}${search}`} replace />;
  }
  const failed = query.isError ? query : settings.isError ? settings : null;
  if (failed) return <PrintLoadError query={failed} />;
  // Waited for (an autoprint would otherwise print emails), but not needed: a failed load prints
  // the emails.
  if (!inspection || people.isPending) return <PrintLoading />;
  const directory = people.data ?? NO_PEOPLE;
  return inspection.kind === 'quality' ? (
    <QualityCheckPrint inspection={inspection} directory={directory} />
  ) : (
    <FinalInspectionPrint inspection={inspection} directory={directory} />
  );
}

type PrintProps = { inspection: Inspection; directory: PeopleDirectory };

/** Changes the address in place; a changed layout must not print again by itself. */
function useAddressChoices() {
  const [params, setParams] = useSearchParams();
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
  return { params, setParam, dropAutoprint };
}

function FinalInspectionPrint({ inspection, directory }: PrintProps) {
  const settings = useSettings();
  const { params, setParam, dropAutoprint } = useAddressChoices();
  const mode =
    parseMode(params.get('mode')) ?? (inspection.state === 'finalised' ? 'report' : 'blank');
  const appendix = parseAppendix(params.get('appendix'));

  const model = useMemo(
    () =>
      settings.data
        ? inspectionPrint(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
            personName: (email) => personName(directory, email),
          })
        : null,
    [inspection, settings.data, mode, directory],
  );
  const images = usePrintImages(model, settings.data?.logoImageId, { appendix });
  if (!model || images.loading) return <PrintLoading />;

  const machine = inspection.front.machineName.trim();
  const perPage =
    parseDeviationsPerPage(params.get('deviationsPerPage')) ?? defaultDeviationsPerPage(model);
  return (
    <PrintView
      model={model}
      images={images}
      subject={`${inspection.number}${machine ? ` · ${machine}` : ''}`}
      back={{ to: inspectionHref('final', inspection.id), label: 'Back to the inspection' }}
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

/** No Word export and no reference images: a quality check's report is printed or saved as PDF. */
function QualityCheckPrint({ inspection, directory }: PrintProps) {
  const settings = useSettings();
  const { params, setParam, dropAutoprint } = useAddressChoices();
  const mode = parseQualityMode(params.get('mode')) ?? 'report';
  // Closed deviations print how they were closed. Waited for, so the cards are laid out once,
  // but not needed: if they can't be read, every card has its lines to fill in.
  const followUps = useFollowUps(inspection.id);

  const model = useMemo(
    () =>
      settings.data && !followUps.isPending
        ? qualityCheckPrintout(inspection, mode, {
            companyName: settings.data.companyName,
            modelLabel: modelName(settings.data.machineModels, inspection.front.modelCode),
            personName: (email) => personName(directory, email),
            followUps: followUps.data?.followUps,
          })
        : null,
    [inspection, settings.data, mode, directory, followUps.isPending, followUps.data],
  );
  const images = usePrintImages(model, settings.data?.logoImageId, { appendix: false });
  if (!model || images.loading) return <PrintLoading />;

  const perPage =
    parseDeviationsPerPage(params.get('deviationsPerPage')) ?? defaultDeviationsPerPage(model);
  return (
    <PrintView
      model={model}
      images={images}
      subject={model.subject}
      revision={model.revisionLabel}
      back={{ to: inspectionHref('quality', inspection.id), label: 'Back to the quality check' }}
      qualityMode={{ value: mode, onChange: (value) => setParam('mode', value) }}
      deviationsPerPage={{
        value: perPage,
        onChange: (value) => setParam('deviationsPerPage', String(value)),
      }}
      autoprint={params.get('autoprint') === '1'}
      onAutoprinted={dropAutoprint}
    />
  );
}
