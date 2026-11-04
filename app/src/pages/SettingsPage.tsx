import { PageHeader } from '../components/PageHeader';
import { SettingsListsCard } from '../features/settings/SettingsListsCard';
import { UsersCard } from '../features/settings/UsersCard';

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Who has access, and the defaults used for templates, inspections and print."
      />
      <div className="space-y-6">
        <UsersCard />
        <SettingsListsCard />
      </div>
    </>
  );
}
