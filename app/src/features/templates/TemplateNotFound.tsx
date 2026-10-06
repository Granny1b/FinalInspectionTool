import { ArrowLeft, SearchX } from 'lucide-react';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function TemplateNotFound({ what = 'template' }: { what?: 'template' | 'revision' }) {
  return (
    <>
      <PageHeader title={`No such ${what}`} description="There's nothing at this address." />
      <EmptyState
        icon={SearchX}
        title={what === 'template' ? 'This template doesn’t exist' : 'This revision doesn’t exist'}
        hint="The link may be mistyped, or it was never published."
        action={
          <ButtonLink to="/templates" variant="secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to templates
          </ButtonLink>
        }
      />
    </>
  );
}
