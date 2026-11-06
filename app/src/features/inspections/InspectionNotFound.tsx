import type { InspectionKind } from '@modig/shared';
import { ArrowLeft, SearchX } from 'lucide-react';
import { ButtonLink } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { LIST_PATHS } from './listFilter';

export function InspectionNotFound({ kind = 'final' }: { kind?: InspectionKind }) {
  const noun = kind === 'quality' ? 'quality check' : 'inspection';
  return (
    <>
      <PageHeader title={`No such ${noun}`} description="There's nothing at this address." />
      <EmptyState
        icon={SearchX}
        title={`This ${noun} doesn’t exist`}
        hint="The link may be mistyped."
        action={
          <ButtonLink to={LIST_PATHS[kind]} variant="secondary">
            <ArrowLeft size={16} aria-hidden="true" />
            {kind === 'quality' ? 'Back to quality checks' : 'Back to inspections'}
          </ButtonLink>
        }
      />
    </>
  );
}
