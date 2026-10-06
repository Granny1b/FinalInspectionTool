import { hasRole } from '@modig/shared';
import { useParams } from 'react-router';
import { LoadError, PageLoading } from '../components/PageStates';
import { Badge } from '../features/templates/Badge';
import { PublishedTemplateView } from '../features/templates/PublishedTemplateView';
import {
  errorMessage,
  isMissing,
  useTemplateRevision,
  useTemplates,
} from '../features/templates/queries';
import { TemplateNotFound } from '../features/templates/TemplateNotFound';
import { useCurrentUser } from '../lib/useMe';

/** Same rule as the API: a positive integer without leading zeros. */
const REVISION_PATTERN = /^[1-9]\d{0,8}$/;

/** /templates/:id/revisions/:revision — one published revision, read-only (from the history). */
export function TemplateRevisionPage() {
  const { id = '', revision: param = '' } = useParams();
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const number = REVISION_PATTERN.test(param) ? Number(param) : null;
  const revision = useTemplateRevision(id, number);
  // Only to say whether this is the latest revision; the page works without it.
  const latest = useTemplates().data?.find((template) => template.id === id)?.publishedRevision;

  if (number === null) return <TemplateNotFound what="revision" />;
  if (revision.isPending) return <PageLoading label="Loading the revision…" />;
  if (revision.isError) {
    return isMissing(revision.error) ? (
      <TemplateNotFound what="revision" />
    ) : (
      <LoadError
        title="We couldn't load this revision"
        message={errorMessage(revision.error)}
        onRetry={() => void revision.refetch()}
        retrying={revision.isFetching}
      />
    );
  }
  return (
    <PublishedTemplateView
      template={revision.data}
      back={{
        to: `/templates/${id}`,
        label: isAdmin ? 'Back to the editor' : 'Back to the template',
      }}
      title={revision.data.name}
      description={`Revision ${number}, read-only: a published revision never changes.`}
      badges={
        <>
          <Badge tone={latest === number ? 'ok' : 'neutral'}>Rev {number}</Badge>
          {latest === number && <Badge tone="ok">Latest</Badge>}
          {latest !== undefined && latest !== null && latest > number && (
            <Badge>Rev {latest} is the latest</Badge>
          )}
        </>
      }
    />
  );
}
