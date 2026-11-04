/**
 * The machine model a new template is for (New template, Import JSON): one from the settings that
 * has no template yet, or a new model, named here and added to the settings with the template, so
 * a machine launched later never waits for the settings to be edited first.
 */
import {
  ModelCodeSchema,
  newModelConflict,
  suggestModelCode,
  type MachineModel,
} from '@modig/shared';

/** The select's value for "New machine model…": not a model code (those are letters and digits). */
export const NEW_MODEL = '+new';

export type ModelChoice = {
  /** A code from the free models, or NEW_MODEL. */
  selected: string;
  /** The new model's fields, as typed. */
  name: string;
  code: string;
  /** The code follows the name until the admin edits it. */
  codeEdited: boolean;
};

/** What the choice is checked against. */
export type ModelContext = {
  /** Every model in the settings. */
  models: readonly MachineModel[];
  /** The models offered: those without a template (one template per model, brief §1). */
  free: readonly MachineModel[];
  /** The templates' model codes and names, some perhaps not in the settings. */
  templates: readonly { modelCode: string; name: string }[];
};

/** The models a new code must not take: the settings' and any a template uses. */
function takenModels({ models, templates }: ModelContext): MachineModel[] {
  return [
    ...models,
    ...templates
      .filter((template) => !models.some((model) => model.code === template.modelCode))
      .map((template) => ({ code: template.modelCode, name: template.name })),
  ];
}

/**
 * Where the choice starts: `preferred` (an imported file's model) if it is free here; if the
 * settings don't have it at all, a new model with its name and code (a suggested code when a
 * template already uses that one). Otherwise the first free model, or a new one when every model
 * has a template.
 */
export function initialChoice(
  context: ModelContext,
  preferred?: { code: string; name?: string | undefined },
): ModelChoice {
  const blank = { name: '', code: '', codeEdited: false };
  // Codes compare without regard to case, as everywhere ("rmmg" is RMMG to people).
  const isPreferred = (model: MachineModel) =>
    model.code.toLowerCase() === preferred?.code.toLowerCase();
  const free = context.free.find(isPreferred);
  if (free) return { ...blank, selected: free.code };
  if (preferred && !context.models.some(isPreferred)) {
    const name = preferred.name ?? '';
    const taken = takenModels(context);
    return taken.some(isPreferred)
      ? { selected: NEW_MODEL, name, code: suggestModelCode(name, codes(taken)), codeEdited: false }
      : { selected: NEW_MODEL, name, code: preferred.code, codeEdited: true };
  }
  const first = context.free[0];
  return first ? { ...blank, selected: first.code } : { ...blank, selected: NEW_MODEL };
}

/** The new model's name changed: the code follows it unless the admin has typed one. */
export function withModelName(
  choice: ModelChoice,
  name: string,
  context: ModelContext,
): ModelChoice {
  return {
    ...choice,
    name,
    code: choice.codeEdited ? choice.code : suggestModelCode(name, codes(takenModels(context))),
  };
}

export type ModelProblems = { name?: string; code?: string };

/**
 * What is wrong with a new model, by field. `required` adds "fill this in" problems, shown once
 * the admin has tried to create; a taken code or name shows at once.
 */
export function modelProblems(
  choice: ModelChoice,
  context: ModelContext,
  { required }: { required: boolean },
): ModelProblems {
  if (choice.selected !== NEW_MODEL) return {};
  const name = choice.name.trim();
  const code = choice.code.trim();
  const problems: ModelProblems = {};
  if (!name) {
    if (required) problems.name = "Enter the model's name.";
  } else if (name.length > 100) {
    problems.name = 'At most 100 characters.';
  }
  if (!code) {
    if (required) problems.code = 'Enter a code: letters and digits.';
  } else if (!ModelCodeSchema.safeParse(code).success) {
    problems.code =
      code.length > (ModelCodeSchema.maxLength ?? 32)
        ? `At most ${ModelCodeSchema.maxLength ?? 32} characters.`
        : 'Only letters and digits.';
  }
  // Names are checked against the settings only, as the API does: a template's name is not a
  // model's name. Codes also against the templates whose model the settings no longer have.
  const conflict = newModelConflict(context.models, { code, name });
  const template = context.templates.find(
    (candidate) => candidate.modelCode.toLowerCase() === code.toLowerCase(),
  );
  if (code && conflict?.field === 'code') problems.code = conflict.message;
  else if (code && template) {
    problems.code = `“${template.name}” already uses the code ${template.modelCode}.`;
  }
  if (name && conflict?.field === 'name') problems.name = conflict.message;
  return problems;
}

/** The request's model fields and the model's name (for the template's default name). */
export function resolvedModel(
  choice: ModelChoice,
  context: ModelContext,
): { modelCode: string; newModel?: MachineModel; modelName: string } | null {
  if (choice.selected !== NEW_MODEL) {
    const model = context.free.find((candidate) => candidate.code === choice.selected);
    return model ? { modelCode: model.code, modelName: model.name } : null;
  }
  const problems = modelProblems(choice, context, { required: true });
  if (problems.name || problems.code) return null;
  const newModel = { code: choice.code.trim(), name: choice.name.trim() };
  return { modelCode: newModel.code, newModel, modelName: newModel.name };
}

/** The name the model gives the template while the admin hasn't typed one. */
export function modelLabel(choice: ModelChoice, context: ModelContext): string {
  if (choice.selected === NEW_MODEL) return choice.name.trim();
  return context.free.find((model) => model.code === choice.selected)?.name ?? '';
}

/** Same pattern as the seeded "Final inspection – RigiMill MG". */
export function defaultTemplateName(modelName: string): string {
  return modelName ? `Final inspection – ${modelName}` : '';
}

const codes = (models: readonly MachineModel[]) => models.map((model) => model.code);
