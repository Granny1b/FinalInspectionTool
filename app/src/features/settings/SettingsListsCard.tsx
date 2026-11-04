import { Factory, Pencil } from 'lucide-react';
import { PlannedAction } from '../../components/PlannedAction';
import { SettingsCard } from './SettingsCard';

/** Machine models, default location, company name, and the Responsible and category lists. */
export function SettingsListsCard() {
  return (
    <SettingsCard
      icon={Factory}
      title="Machine models, location & print"
      description="The model list, the default location for new inspections, and the company name and logo on printed reports."
    >
      <PlannedAction align="start">
        <Pencil size={16} />
        Edit settings
      </PlannedAction>
    </SettingsCard>
  );
}
