import { machineStage, machineStatusText, type MachineProgress } from '@modig/shared';
import { Badge } from '../templates/Badge';

/** How each stage looks: done in green, open deviations in red, work to do in the brand colour. */
const TONES = {
  no_checks: 'neutral',
  in_build: 'brand',
  ready: 'brand',
  final: 'brand',
  open_deviations: 'nok',
  done: 'ok',
} as const;

/** "In build · QC 3/5", "Ready for final inspection", "Done": where a machine is, at a glance. */
export function MachineStatusBadge({ progress }: { progress: MachineProgress }) {
  return <Badge tone={TONES[machineStage(progress)]}>{machineStatusText(progress)}</Badge>;
}
