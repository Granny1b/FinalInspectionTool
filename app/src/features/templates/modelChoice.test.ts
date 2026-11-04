import { describe, expect, it } from 'vitest';
import {
  defaultTemplateName,
  initialChoice,
  modelLabel,
  modelProblems,
  NEW_MODEL,
  resolvedModel,
  withModelName,
  type ModelChoice,
  type ModelContext,
} from './modelChoice';

const models = [
  { code: 'RMMG', name: 'RigiMill MG' },
  { code: 'RMMT', name: 'RigiMill MT' },
  { code: 'IM', name: 'IM8' },
];
/** RMMG has a template; so does E2E, a code the settings don't have. */
const context: ModelContext = {
  models,
  free: models.slice(1),
  templates: [
    { modelCode: 'RMMG', name: 'Final inspection – RigiMill MG' },
    { modelCode: 'E2E', name: 'Throwaway' },
  ],
};
const none: ModelContext = { ...context, free: [] };
const newModel = (name: string, code: string, codeEdited = false): ModelChoice => ({
  selected: NEW_MODEL,
  name,
  code,
  codeEdited,
});

describe('initialChoice', () => {
  it('starts on the first free model, or a new one when every model has a template', () => {
    expect(initialChoice(context)).toEqual({ ...newModel('', ''), selected: 'RMMT' });
    expect(initialChoice(none)).toEqual(newModel('', ''));
  });

  it("takes an imported file's model when it is free", () => {
    expect(initialChoice(context, { code: 'IM', name: 'IM8' }).selected).toBe('IM');
    // Whatever the case of its code.
    expect(initialChoice(context, { code: 'im' }).selected).toBe('IM');
  });

  it("offers a model the settings don't have as a new one, with the file's code", () => {
    expect(initialChoice(context, { code: 'HMC800', name: 'HMC 800' })).toEqual(
      newModel('HMC 800', 'HMC800', true),
    );
    // A template here already uses the code: a code from the name instead.
    expect(initialChoice(context, { code: 'e2e', name: 'E2E rig' })).toEqual(
      newModel('E2E rig', 'E2ERIG'),
    );
  });

  it('falls back to the first free model when the file’s model has a template here', () => {
    expect(initialChoice(context, { code: 'RMMG' }).selected).toBe('RMMT');
    // Not offered as a new model either: the settings have it.
    expect(initialChoice(context, { code: 'rmmg', name: 'RigiMill MG' }).selected).toBe('RMMT');
    expect(initialChoice(none, { code: 'RMMG' })).toEqual(newModel('', ''));
  });
});

describe('a new model', () => {
  it('suggests a free code from the name until the code is edited', () => {
    const typed = withModelName(newModel('', ''), 'RigiMill MG', context);
    expect(typed).toEqual(newModel('RigiMill MG', 'RIGIMILLMG'));
    expect(withModelName(typed, 'IM', context).code).toBe('IM2');
    expect(withModelName(typed, 'E2E', context).code).toBe('E2E2');
    const edited = { ...typed, code: 'RMX', codeEdited: true };
    expect(withModelName(edited, 'RigiMill X', context).code).toBe('RMX');
  });

  it('shows a taken code or name at once, and missing fields only when asked', () => {
    expect(modelProblems(newModel('', ''), context, { required: false })).toEqual({});
    expect(modelProblems(newModel('', ''), context, { required: true })).toEqual({
      name: "Enter the model's name.",
      code: 'Enter a code: letters and digits.',
    });
    expect(modelProblems(newModel('HMC', 'rmmt'), context, { required: false })).toEqual({
      code: 'RMMT is already the code of RigiMill MT.',
    });
    expect(modelProblems(newModel('im8', 'IM9'), context, { required: false })).toEqual({
      name: 'There is already a machine model called IM8 (IM).',
    });
    expect(modelProblems(newModel('Rig', 'E2E'), context, { required: false })).toEqual({
      code: '“Throwaway” already uses the code E2E.',
    });
    // A template's name is not a model's name: only the settings' names are taken.
    expect(modelProblems(newModel('Throwaway', 'THR'), context, { required: false })).toEqual({});
    expect(modelProblems(newModel('Rig', 'RM-1'), context, { required: false })).toEqual({
      code: 'Only letters and digits.',
    });
    expect(modelProblems(newModel('Rig', 'A'.repeat(33)), context, { required: false })).toEqual({
      code: 'At most 32 characters.',
    });
    // An existing model needs no checks.
    expect(
      modelProblems({ ...newModel('', ''), selected: 'IM' }, context, { required: true }),
    ).toEqual({});
  });

  it('resolves to the request fields, or null while something is wrong', () => {
    expect(resolvedModel(newModel(' HMC 800 ', 'HMC800 '), context)).toEqual({
      modelCode: 'HMC800',
      newModel: { code: 'HMC800', name: 'HMC 800' },
      modelName: 'HMC 800',
    });
    expect(resolvedModel(newModel('HMC 800', ''), context)).toBeNull();
    expect(resolvedModel({ ...newModel('', ''), selected: 'IM' }, context)).toEqual({
      modelCode: 'IM',
      modelName: 'IM8',
    });
    // Taken since the dialog opened.
    expect(resolvedModel({ ...newModel('', ''), selected: 'RMMG' }, context)).toBeNull();
  });

  it('names the template after the model', () => {
    expect(modelLabel({ ...newModel('', ''), selected: 'IM' }, context)).toBe('IM8');
    expect(modelLabel(newModel(' HMC 800 ', 'X'), context)).toBe('HMC 800');
    expect(defaultTemplateName('HMC 800')).toBe('Final inspection – HMC 800');
    expect(defaultTemplateName('')).toBe('');
  });
});
