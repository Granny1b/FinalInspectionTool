import type { Insights, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { modelName } from '../../lib/useSettings';
import { formatCount, formatPercent, plural } from './format';
import { PanelEmpty } from './Panel';

type Props = {
  checkpoints: Insights['topCheckpoints'];
  models: MachineModel[] | undefined;
  /** Shown when more than one model is in the selection: refs repeat across models. */
  showModel: boolean;
};

/**
 * Tighter on a phone, where the checkpoint column also gives up a little of its minimum: at the
 * wider spacing the table overran the card's padding and its last column touched the border.
 */
const HEAD = 'px-2 py-2 font-medium whitespace-nowrap first:pl-0 last:pr-0 sm:px-3';
const CELL = 'px-2 py-3 align-top first:pl-0 last:pr-0 sm:px-3';
/**
 * The two number columns, from sm. On a phone they took half the table and squeezed the
 * checkpoint to a word a line; there the numbers are a line under the checkpoint instead.
 */
const NUMBER = 'text-right max-sm:hidden';

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
            <th scope="col" className={`${HEAD} w-6 sm:w-8`}>
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
            <th scope="col" className={clsx(HEAD, NUMBER)}>
              Failed
            </th>
            <th scope="col" className={clsx(HEAD, NUMBER)}>
              Of inspections
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {checkpoints.map((checkpoint, index) => {
            const share = formatPercent(checkpoint.failed / checkpoint.inspections);
            return (
              <tr key={checkpoint.itemId}>
                <td className={clsx(CELL, 'text-ink-500 tabular-nums')}>{index + 1}</td>
                {/* The last cell on a phone, without a model: flush with the card's edge. */}
                <td className={clsx(CELL, 'min-w-32 sm:min-w-64', !showModel && 'max-sm:pr-0')}>
                  <p className="wrap-break-word text-ink-900">
                    <span className="font-semibold">{checkpoint.ref}</span>{' '}
                    {checkpoint.text || <span className="text-ink-500">No text</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {checkpoint.sectionTitle || 'Untitled section'}
                    {checkpoint.removed && ' · No longer in the checklist'}
                  </p>
                  <p className="mt-1 text-xs text-ink-500 tabular-nums sm:hidden">
                    <span className="font-semibold text-ink-900">
                      {formatCount(checkpoint.failed)} failed
                    </span>{' '}
                    · {share} of {plural(checkpoint.inspections, 'inspection')}
                  </p>
                </td>
                {showModel && (
                  <td className={clsx(CELL, 'whitespace-nowrap text-ink-700 max-sm:pr-0')}>
                    {modelName(models, checkpoint.modelCode)}
                  </td>
                )}
                <td className={clsx(CELL, NUMBER, 'font-semibold text-ink-900 tabular-nums')}>
                  {formatCount(checkpoint.failed)}
                </td>
                <td className={clsx(CELL, NUMBER, 'whitespace-nowrap tabular-nums')}>
                  <span className="text-ink-900">{share}</span>
                  <span className="block text-xs text-ink-500">
                    of {formatCount(checkpoint.inspections)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
