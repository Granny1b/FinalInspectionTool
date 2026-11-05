import { ArrowLeft, SearchX } from 'lucide-react';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';

export function TemplateNotFound({
  what = 'template',
}: {
  what?: 'template' | 'revision' | 'quality check';
}) {
  return (
    <>
      <PageHeader title={`No such ${what}`} description="There's nothing at this address." />
      <EmptyState
        icon={SearchX}
        title={`This ${what} doesn’t exist`}
        hint={
          what === 'revision'
            ? 'The link may be mistyped, or that revision was never published.'
            : what === 'quality check'
              ? 'The link may be mistyped, or the quality check was deleted.'
              : 'The link may be mistyped.'
        }
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
