/**
 * What the machine pages show, worked out without a browser: the list's filters (kept in the
 * address), each check's words, and the templates a machine of a model can get copies of.
 */
import {
  checklistChangesText,
  compareQualityChecks,
  machineStage,
  MACHINE_STAGES,
  qualityCheckShortName,
  type InspectionKind,
  type MachineCheck,
  type MachineModel,
  type MachineStage,
  type MachineSummary,
  type TemplateSummary,
} from '@modig/shared';
import { modelName } from '../../lib/useSettings';

/** A machine's page. */
export function machineHref(id: string): string {
  return `/machines/${id}`;
}

// ---------------------------------------------------------------------------------------------
// The list's filters (?q=&model=&stage=)
// ---------------------------------------------------------------------------------------------

export type MachineFilter = { query: string; model: string; stage: MachineStage | '' };

export function filterFromParams(params: URLSearchParams): MachineFilter {
  const stage = params.get('stage') ?? '';
  return {
    query: params.get('q') ?? '',
    model: params.get('model') ?? '',
    stage: (MACHINE_STAGES as readonly string[]).includes(stage) ? (stage as MachineStage) : '',
  };
}

/** Only the filters in use, so every machine has a clean address. */
export function filterToParams({ query, model, stage }: MachineFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (model) params.set('model', model);
  if (stage) params.set('stage', stage);
  return params;
}

export function isFiltered({ query, model, stage }: MachineFilter): boolean {
  return Boolean(query.trim() || model || stage);
}

const lower = (text: string) => text.toLocaleLowerCase('sv');

/**
 * The machines that match, in the order given (by Machine ID). Every word of the search must be in
 * the Machine ID, the serial number or the model's name: "magellan 016".
 */
export function filterMachines(
  machines: readonly MachineSummary[],
  { query, model, stage }: MachineFilter,
  models: readonly MachineModel[] | undefined,
): MachineSummary[] {
  const words = lower(query).split(/\s+/).filter(Boolean);
  return machines.filter((machine) => {
    if (model && machine.modelCode !== model) return false;
    if (stage && machineStage(machine.progress) !== stage) return false;
    const haystack = lower(
      `${machine.machineName} ${machine.serialNumber} ${modelName(models, machine.modelCode)}`,
    );
    return words.every((word) => haystack.includes(word));
  });
}

// ---------------------------------------------------------------------------------------------
// A machine's checks
// ---------------------------------------------------------------------------------------------

/** "Pre start up" for a quality check, "Final inspection" for the final inspection. */
export function checkTitle(check: Pick<MachineCheck, 'kind' | 'templateName'>): string {
  return check.kind === 'quality'
    ? qualityCheckShortName(check.templateName) || 'Quality check'
    : 'Final inspection';
}

/** "Not started", "In progress · 12 / 20 rows", "Finalised". */
export function checkStateText(check: Pick<MachineCheck, 'state' | 'filled' | 'total'>): string {
  if (check.state === 'not_started') return 'Not started';
  if (check.state === 'finalised') return 'Finalised';
  return `In progress · ${check.filled} / ${check.total} rows`;
}

/**
 * "Based on Pre start up rev 3 · 2 rows added, 1 removed": where the machine's copy came from and
 * what the machine changed in it since.
 */
export function basedOnText(
  check: Pick<MachineCheck, 'kind' | 'templateName' | 'templateRevision' | 'changes'>,
): string {
  const source = `Based on ${checkTitle(check)} rev ${check.templateRevision}`;
  const changes = check.changes ? checklistChangesText(check.changes) : '';
  return changes ? `${source} · ${changes}` : source;
}

/**
 * The template has a newer revision than the one the copy is based on, and the check can still
 * be updated (a finalised one is reopened first).
 */
export function updateAvailable(
  check: Pick<MachineCheck, 'latestRevision' | 'templateRevision' | 'state'>,
): boolean {
  return (
    check.latestRevision !== null &&
    check.latestRevision > check.templateRevision &&
    check.state !== 'finalised'
  );
}

/** "Rev 4 available · this machine has rev 3". */
export function updateText(check: Pick<MachineCheck, 'latestRevision' | 'templateRevision'>) {
  return `Rev ${check.latestRevision} available · this machine has rev ${check.templateRevision}`;
}

/**
 * The check to do next on a machine, whose Start stands out: its first quality check not started
 * (in their order), else its final inspection once nothing is in progress; null when there is
 * none to start.
 */
export function nextCheck(
  checks: readonly Pick<MachineCheck, 'id' | 'kind' | 'state'>[],
): string | null {
  const quality = checks.find((check) => check.kind === 'quality' && check.state === 'not_started');
  if (quality) return quality.id;
  const busy = checks.some((check) => check.kind === 'quality' && check.state === 'in_progress');
  const final = checks.find((check) => check.kind === 'final' && check.state === 'not_started');
  return final && !busy ? final.id : null;
}

/** A check's page: a final inspection's, or a quality check's. */
export const CHECK_PATHS: Record<InspectionKind, string> = {
  final: '/inspections',
  quality: '/quality-checks',
};

/** Where an admin edits a machine's check's own checklist. */
export function checklistHref(kind: InspectionKind, id: string): string {
  return `${CHECK_PATHS[kind]}/${id}/checklist`;
}

// ---------------------------------------------------------------------------------------------
// The templates a machine of a model gets copies of
// ---------------------------------------------------------------------------------------------

/** A published template a machine can have a copy of: a quality check, or the final inspection. */
export type CheckChoice = {
  templateId: string;
  kind: InspectionKind;
  /** "Pre start up", "Final inspection". */
  title: string;
  /** The revision a copy is made of now. */
  revision: number;
};

/**
 * What a machine of `modelCode` can have copies of: the model's published quality checks in their
 * order, then its final inspection template if it is published. A check copies the latest
 * published revision; a quality check whose machine's template is gone is offered nowhere else,
 * so not here either.
 */
export function checkChoices(
  templates: readonly TemplateSummary[],
  modelCode: string,
): CheckChoice[] {
  const final = templates.find(
    (template) =>
      template.kind === 'final' &&
      (template.publishedModelCode ?? template.modelCode) === modelCode,
  );
  if (!final) return [];
  const quality = templates
    .filter(
      (template) =>
        template.kind === 'quality' &&
        template.parentId === final.id &&
        template.publishedRevision !== null,
    )
    .sort(compareQualityChecks)
    .map((template): CheckChoice => ({
      templateId: template.id,
      kind: 'quality',
      title: qualityCheckShortName(template.publishedName ?? template.name),
      revision: template.publishedRevision!,
    }));
  return final.publishedRevision === null
    ? quality
    : [
        ...quality,
        {
          templateId: final.id,
          kind: 'final',
          title: 'Final inspection',
          revision: final.publishedRevision,
        },
      ];
}

/**
 * The machine models a machine can be made of, by name: those with a final inspection template
 * and something published to copy (its final inspection, or a quality check).
 */
export function machineModels(
  templates: readonly TemplateSummary[],
  models: readonly MachineModel[] | undefined,
): MachineModel[] {
  const codes = new Set(
    templates
      .filter((template) => template.kind === 'final')
      .map((template) => template.publishedModelCode ?? template.modelCode),
  );
  return [...codes]
    .filter((code) => checkChoices(templates, code).length > 0)
    .map((code) => ({ code, name: modelName(models, code) }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}

const BY_NAME = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/** "3 quality checks and the final inspection", for a machine's checks as a sentence. */
export function choicesText(choices: readonly Pick<CheckChoice, 'kind'>[]): string {
  const quality = choices.filter((choice) => choice.kind === 'quality').length;
  const final = choices.some((choice) => choice.kind === 'final');
  const qualityText = quality === 1 ? '1 quality check' : `${quality} quality checks`;
  if (quality === 0) return final ? 'The final inspection' : 'No checks';
  return final ? `${qualityText} and the final inspection` : qualityText;
}
