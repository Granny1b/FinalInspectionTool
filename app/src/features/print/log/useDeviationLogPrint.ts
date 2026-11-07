import type { InspectionKind } from '@modig/shared';
import { useMemo } from 'react';
import { useSettings } from '../../../lib/useSettings';
import {
  filterFromParams,
  filterToParams,
  logView,
  queryOf,
  type LogFilter,
} from '../../deviationLog/model';
import { useDeviationLog, useDeviationPhotos } from '../../deviationLog/queries';
import { localDate } from '../../inspections/dates';
import { useMachines } from '../../machines/queries';
import {
  deviationLogPrint,
  photoKey,
  type DeviationLogPrintModel,
  type LogPrintLayout,
} from './model';

type FailedQuery = { error: unknown; isFetching: boolean; refetch: () => Promise<unknown> };

/**
 * The deviation log's printout under `filter`, for the print page and the preview alike: the log
 * as the page shows it (the same entries and the same view), with the deviations' photos when the
 * layout has pictures. Null until everything it needs is in; photos that can't be loaded leave
 * the cards with their sketch frames rather than failing the printout.
 */
export function useDeviationLogPrint(
  kind: InspectionKind,
  filter: LogFilter,
  layout: LogPrintLayout,
): { model: DeviationLogPrintModel | null; failed: FailedQuery | null } {
  const log = useDeviationLog(kind);
  const settings = useSettings();
  const machines = useMachines();
  const cards = layout === 'cards';
  const photos = useDeviationPhotos(queryOf(filter), cards);
  const today = localDate();
  // The filters as their address, so the model is built again only when they change.
  const search = filterToParams(filter).toString();

  const model = useMemo(() => {
    if (!log.data || !settings.data || (cards && photos.isPending)) return null;
    const shown = filterFromParams(new URLSearchParams(search), kind);
    const machineName = shown.machine
      ? (log.data.machines.find((machine) => machine.id === shown.machine)?.machineName ??
        machines.data?.find((machine) => machine.id === shown.machine)?.machineName)
      : undefined;
    return deviationLogPrint(
      logView(log.data.entries, shown, today, log.data.machines),
      shown,
      layout,
      {
        kind,
        companyName: settings.data.companyName,
        models: settings.data.machineModels,
        machineName,
        today,
        photos:
          cards && photos.data
            ? new Map(photos.data.photos.map((entry) => [photoKey(entry), entry.photos]))
            : undefined,
      },
    );
  }, [
    log.data,
    settings.data,
    machines.data,
    cards,
    photos.isPending,
    photos.data,
    search,
    kind,
    layout,
    today,
  ]);
  const failed = log.isError ? log : settings.isError ? settings : null;
  return { model, failed };
}
