/**
 * What "Start a quality check" offers: the machines that have a published quality check, each
 * with those quality checks. Pure, so the choice is tested without a browser.
 */
import type { MachineModel, TemplateSummary } from '@modig/shared';
import { modelName } from '../../../lib/useSettings';

export type MachineChoice = {
  /** The machine model the checks are done on (the quality checks' own model code). */
  modelCode: string;
  /** "RigiMill MG" */
  name: string;
  /** Its published quality checks, by title. */
  checks: TemplateSummary[];
};

const BY_NAME = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/** The title a quality check is started under: its latest published revision's. */
export function publishedTitle(check: TemplateSummary): string {
  return check.publishedName ?? check.name;
}

/**
 * The machines with at least one published quality check, by name, each with its published
 * quality checks by title. A check is done on its own model (the code it copied from its machine
 * and keeps, which the check records). A quality check whose machine's template is gone (a
 * delete that stopped half way) is listed nowhere else, so it is not offered either; nor is one
 * never published (a check starts from the latest published revision).
 */
export function startChoices(
  templates: readonly TemplateSummary[],
  models: readonly MachineModel[] | undefined,
): MachineChoice[] {
  const machines = new Set(
    templates.filter((template) => template.kind === 'final').map((template) => template.id),
  );
  const byModel = new Map<string, TemplateSummary[]>();
  for (const template of templates) {
    if (template.kind !== 'quality' || template.publishedRevision === null) continue;
    if (!template.parentId || !machines.has(template.parentId)) continue;
    const code = template.publishedModelCode ?? template.modelCode;
    byModel.set(code, [...(byModel.get(code) ?? []), template]);
  }
  return [...byModel]
    .map(([modelCode, checks]) => ({
      modelCode,
      name: modelName(models, modelCode),
      checks: checks.sort((a, b) => BY_NAME.compare(publishedTitle(a), publishedTitle(b))),
    }))
    .sort((a, b) => BY_NAME.compare(a.name, b.name));
}

/** "1 quality check", "3 quality checks". */
export function checkCountText(count: number): string {
  return count === 1 ? '1 quality check' : `${count} quality checks`;
}
