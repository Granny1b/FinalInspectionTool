import type { MachineModel, TemplateSummary } from '@modig/shared';
import type { ModelContext } from '../templates/modelChoice';

/**
 * What the model of a new assembly instruction is chosen from: any model of the settings (a model
 * may have several instructions), or a new one, whose code no final inspection template may
 * already use.
 */
export function assemblyModelContext(
  models: readonly MachineModel[],
  templates: readonly TemplateSummary[],
): ModelContext {
  return {
    models,
    free: models,
    templates: templates.filter((template) => template.kind === 'final'),
  };
}

export const ASSEMBLY_MODEL_HINT = 'A machine model may have several assembly instructions.';
