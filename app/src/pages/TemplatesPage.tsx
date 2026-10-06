import { hasRole } from '@modig/shared';
import { LayoutTemplate, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { CreateTemplateDialog } from '../features/templates/CreateTemplateDialog';
import { errorMessage, useTemplates } from '../features/templates/queries';
import { TemplateList } from '../features/templates/TemplateList';
import { useCurrentUser } from '../lib/useMe';
import { useSettings } from '../lib/useSettings';

export function TemplatesPage() {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const [creating, setCreating] = useState(false);

  const models = settings.data?.machineModels;
  const newTemplate = isAdmin && (
    // Needs the models and the existing templates to offer only models without one.
    <Button onClick={() => setCreating(true)} disabled={!models || !templates.data}>
      <Plus size={16} aria-hidden="true" />
      New template
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Templates"
        description="One checklist per machine model, published in revisions."
        actions={templates.data?.length ? newTemplate : undefined}
      />
      {templates.isPending ? (
        <PageLoading label="Loading templates…" />
      ) : templates.isError ? (
        <LoadError
          title="We couldn't load the templates"
          message={errorMessage(templates.error)}
          onRetry={() => void templates.refetch()}
          retrying={templates.isFetching}
        />
      ) : templates.data.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          hint={
            isAdmin
              ? 'Create the checklist for a machine model: sections, checkpoint rows and print settings.'
              : 'Quality admins publish the checklist for each machine model. It will be listed here.'
          }
          action={newTemplate}
        />
      ) : (
        <TemplateList templates={templates.data} models={models} showDrafts={isAdmin} />
      )}
      {creating && models && templates.data && (
        <CreateTemplateDialog
          models={models.filter(
            (model) => !templates.data.some((template) => template.modelCode === model.code),
          )}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
