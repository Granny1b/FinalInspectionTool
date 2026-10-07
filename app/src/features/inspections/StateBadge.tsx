import type { InspectionState } from '@modig/shared';
import { Badge } from '../templates/Badge';

/** "In progress" (still to be worked on) or "Finalised" (locked). */
export function StateBadge({ state }: { state: InspectionState }) {
  return state === 'finalised' ? (
    <Badge tone="ok">Finalised</Badge>
  ) : (
    <Badge tone="brand">In progress</Badge>
  );
}
