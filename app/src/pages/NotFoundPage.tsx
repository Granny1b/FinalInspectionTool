import { ArrowLeft, Compass } from 'lucide-react';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="There's nothing at this address." />
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        hint="The link may be mistyped, or the page may have moved."
        action={
          <ButtonLink to="/inspections" variant="secondary">
            <ArrowLeft size={16} />
            Back to inspections
          </ButtonLink>
        }
      />
    </>
  );
}
