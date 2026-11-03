import type { Insights, MachineModel } from '@modig/shared';
import { modelName } from '../../lib/useSettings';
import { formatCount, formatPercent } from './format';
import { PanelEmpty } from './Panel';

type Props = {
  checkpoints: Insights['topCheckpoints'];
  models: MachineModel[] | undefined;
  /** Shown when more than one model is in the selection: refs repeat across models. */
  showModel: boolean;
};

const HEAD = 'px-3 py-2 font-medium whitespace-nowrap first:pl-0 last:pr-0';
const CELL = 'px-3 py-3 align-top first:pl-0 last:pr-0';

/**
 * The checkpoints that fail most often (brief §5.5, "the most important table"): where each one
 * is in the checklist now, how often it failed, and in what share of the inspections that had it.
 */
export function TopCheckpoints({ checkpoints, models, showModel }: Props) {
  if (checkpoints.length === 0) {
    return <PanelEmpty>No checkpoint failed in this selection.</PanelEmpty>;
  }
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 text-xs text-ink-500">
          <tr>
            <th scope="col" className={`${HEAD} w-8`}>
              <span className="sr-only">Rank</span>
            </th>
            <th scope="col" className={HEAD}>
              Checkpoint
            </th>
            {showModel && (
              <th scope="col" className={HEAD}>
                Model
              </th>
            )}
            <th scope="col" className={`${HEAD} text-right`}>
              Failed
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              Of inspections
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {checkpoints.map((checkpoint, index) => (
            <tr key={checkpoint.itemId}>
              <td className={`${CELL} text-ink-500 tabular-nums`}>{index + 1}</td>
              <td className={`${CELL} min-w-40 sm:min-w-64`}>
                <p className="wrap-break-word text-ink-900">
                  <span className="font-semibold">{checkpoint.ref}</span>{' '}
                  {checkpoint.text || <span className="text-ink-500">No text</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {checkpoint.sectionTitle || 'Untitled section'}
                  {checkpoint.removed && ' · No longer in the checklist'}
                </p>
              </td>
              {showModel && (
                <td className={`${CELL} whitespace-nowrap text-ink-700`}>
                  {modelName(models, checkpoint.modelCode)}
                </td>
              )}
              <td className={`${CELL} text-right font-semibold text-ink-900 tabular-nums`}>
                {formatCount(checkpoint.failed)}
              </td>
              <td className={`${CELL} text-right whitespace-nowrap tabular-nums`}>
                <span className="text-ink-900">
                  {formatPercent(checkpoint.failed / checkpoint.inspections)}
                </span>
                <span className="block text-xs text-ink-500">
                  of {formatCount(checkpoint.inspections)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
