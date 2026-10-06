import { hasRole } from '@modig/shared';
import { LayoutTemplate, Plus } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { PlannedAction } from '../components/PlannedAction';
import { useCurrentUser } from '../lib/useMe';

export function TemplatesPage() {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  return (
    <>
      <PageHeader
        title="Templates"
        description="One checklist per machine model, published in revisions."
      />
      <EmptyState
        icon={LayoutTemplate}
        title="Checklist templates"
        hint={
          isAdmin
            ? 'Edit sections and checkpoints for each machine model and publish revisions. The RigiMill MG checklist imported from Excel will be listed here.'
            : 'Quality admins maintain the checklist for each machine model. You pick one when you start an inspection.'
        }
        action={
          isAdmin && (
            <PlannedAction phase={2}>
              <Plus size={16} />
              New template
            </PlannedAction>
          )
        }
      />
    </>
  );
}
