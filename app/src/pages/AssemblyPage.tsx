import { hasRole, type TemplateSummary } from '@modig/shared';
import { LayoutTemplate, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { InstructionCard } from '../features/assembly/InstructionCard';
import { assemblyHref, assemblyInstructions, useTemplates } from '../features/templates/queries';
import { errorMessage } from '../lib/api';
import { useCurrentUser } from '../lib/useMe';
import { modelName, useSettings } from '../lib/useSettings';

const byName = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * /assembly — the published assembly instructions, by machine model, to read. They are written
 * under each model's machine template (Templates → the model → Assembly), where admins go from
 * here.
 */
export function AssemblyPage() {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const templates = useTemplates();
  const settings = useSettings();
  const models = settings.data?.machineModels;

  const groups = useMemo(() => {
    const byModel = new Map<string, TemplateSummary[]>();
    for (const instruction of assemblyInstructions(templates.data ?? [])) {
      // What is read is what is published; a draft is its author's until then.
      if (instruction.publishedRevision === null) continue;
      const group = byModel.get(instruction.modelCode) ?? [];
      group.push(instruction);
      byModel.set(instruction.modelCode, group);
    }
    return [...byModel]
      .map(([code, instructions]) => ({ code, name: modelName(models, code), instructions }))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [templates.data, models]);

  if (templates.isPending) return <PageLoading label="Loading the assembly instructions…" />;
  if (templates.isError) {
    return (
      <LoadError
        title="We couldn't load the assembly instructions"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  }

  const toTemplates = isAdmin && (
    <ButtonLink to="/templates" variant="secondary">
      <LayoutTemplate size={16} aria-hidden="true" />
      Write or edit in Templates
    </ButtonLink>
  );
  return (
    <>
      <PageHeader
        title="Assembly instructions"
        description="How each machine is built, task by task: what to do, with which bolts and parts, and how it should look."
        actions={toTemplates}
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No assembly instructions published yet"
          hint={
            isAdmin
              ? 'They are written under a machine’s template: Templates, the machine model, then its Assembly tab. Published ones are listed here to read.'
              : 'They will be listed here once they are published.'
          }
          action={toTemplates || undefined}
        />
      ) : (
        <div className="space-y-10">
          {groups.map((group) => (
            <section key={group.code} aria-labelledby={`model-${group.code}`}>
              <h2 id={`model-${group.code}`} className="text-base font-semibold text-ink-900">
                {group.name}
                {group.name !== group.code && (
                  <span className="ml-2 text-sm font-normal text-ink-500">{group.code}</span>
                )}
              </h2>
              <ul className="mt-3 grid gap-4 lg:grid-cols-2">
                {group.instructions.map((instruction) => (
                  <InstructionCard
                    key={instruction.id}
                    instruction={instruction}
                    isAdmin={false}
                    href={assemblyHref(instruction.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
