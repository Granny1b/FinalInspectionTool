import { ClipboardCheck, Plus } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PlannedAction } from '../components/PlannedAction';

export function InspectionsPage() {
  return (
    <>
      <PageHeader
        title="Inspections"
        description="Final inspections of machines before delivery."
      />
      <EmptyState
        icon={ClipboardCheck}
        title="No inspections yet"
        hint="Start one from a published template, print the checklist for the walk-round, then enter the results here."
        action={
          <PlannedAction phase={3}>
            <Plus size={16} />
            New inspection
          </PlannedAction>
        }
      />
    </>
  );
}
