import { APP_NAME, hasRole, type Inspection } from '@modig/shared';
import { LoaderCircle, Pencil, Play } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { Button, ButtonLink } from '../../components/Button';
import { Callout } from '../../components/Callout';
import { useCurrentUser } from '../../lib/useMe';
import { modelName, useSettings } from '../../lib/useSettings';
import { StateBadge } from '../inspections/StateBadge';
import { ChecklistHeading } from '../templates/ChecklistHeading';
import { TemplateDocument } from '../templates/document/TemplateDocument';
import { checklistHref, checkTitle, machineHref } from './model';
import { useMachine } from './queries';
import { useStartFlow } from './useStartFlow';

/**
 * A machine's check nobody has started: what it will check (the machine's own copy, read-only),
 * Start, and for admins Edit checklist. It has no number and no front page to fill in yet:
 * starting it gives it both.
 */
export function NotStartedCheck({ inspection }: { inspection: Inspection }) {
  const isAdmin = hasRole(useCurrentUser().roles, 'admin');
  const settings = useSettings();
  const machine = useMachine(inspection.machineRef ?? null);
  const machineName = inspection.front.machineName;
  const flow = useStartFlow(machineName, machine.data?.detail.checks);
  const title = checkTitle({
    kind: inspection.kind,
    templateName: inspection.templateSnapshot.name,
  });
  const { sections } = inspection.templateSnapshot;
  const starting = flow.starting === inspection.id;
  return (
    <div>
      <title>{`${title} · ${machineName} · ${APP_NAME}`}</title>
      {inspection.machineRef && (
        <BackLink to={machineHref(inspection.machineRef)} label={machineName || 'Machine'} />
      )}
      <div className="mt-2 mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight wrap-anywhere text-ink-900">
            {title}
            <span className="font-normal text-ink-500"> · </span>
            {machineName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <StateBadge state="not_started" />
            <span>{modelName(settings.data?.machineModels, inspection.front.modelCode)}</span>
            <span>S/N {inspection.front.serialNumber || '—'}</span>
            <span>
              {inspection.templateSnapshot.name} · Rev {inspection.templateRevision}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <ButtonLink variant="secondary" to={checklistHref(inspection.kind, inspection.id)}>
              <Pencil size={16} aria-hidden="true" />
              Edit checklist
            </ButtonLink>
          )}
          <Button onClick={() => flow.start(inspection)} disabled={flow.starting !== null}>
            {starting ? (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {starting ? 'Starting…' : 'Start'}
          </Button>
        </div>
      </div>
      <div className="mb-8 space-y-3">
        {flow.error && (
          <Callout tone="error" role="alert">
            {flow.error}
          </Callout>
        )}
        <p className="max-w-prose text-sm text-ink-600">
          Not started yet. Starting it gives it its number and fills in its front page from the
          machine: the Machine ID, model and serial number, today’s date, and you as{' '}
          {inspection.kind === 'quality' ? 'Checked by' : 'a participant'}.
        </p>
      </div>
      <section aria-labelledby="checklist-title">
        <ChecklistHeading
          id="checklist-title"
          sections={sections}
          withTime={inspection.kind === 'quality'}
        />
        <TemplateDocument sections={sections} variant={inspection.kind} />
      </section>
      {flow.dialog}
    </div>
  );
}
