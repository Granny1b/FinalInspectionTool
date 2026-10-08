import { ChartColumn, Download } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PlannedAction } from '../components/PlannedAction';

export function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="Deviation KPIs across finalised inspections, per checkpoint, section and model."
      />
      <EmptyState
        icon={ChartColumn}
        title="No insights yet"
        hint="Deviations from finalised inspections will show up here, led by the checkpoints that fail most often."
        action={
          <PlannedAction phase={6}>
            <Download size={16} />
            Export CSV
          </PlannedAction>
        }
      />
    </>
  );
}
