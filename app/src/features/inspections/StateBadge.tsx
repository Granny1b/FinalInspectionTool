import type { InspectionState } from '@modig/shared';
import { Badge } from '../templates/Badge';

/**
 * "Not started" (a machine's check nobody has started), "In progress" (still to be worked on) or
 * "Finalised" (locked).
 */
export function StateBadge({ state }: { state: InspectionState }) {
  if (state === 'not_started') return <Badge>Not started</Badge>;
  return state === 'finalised' ? (
    <Badge tone="ok">Finalised</Badge>
  ) : (
    <Badge tone="brand">In progress</Badge>
  );
}
