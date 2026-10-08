import { ArrowLeft, SearchX } from 'lucide-react';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function InspectionNotFound() {
  return (
    <>
      <PageHeader title="No such inspection" description="There's nothing at this address." />
      <EmptyState
        icon={SearchX}
        title="This inspection doesn’t exist"
        hint="The link may be mistyped."
        action={
          <ButtonLink to="/inspections" variant="secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to inspections
          </ButtonLink>
        }
      />
    </>
  );
}
