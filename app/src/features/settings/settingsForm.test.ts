import type { SettingsInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  addEntry,
  addModel,
  addProblem,
  fieldId,
  formErrors,
  formFromInput,
  inputFromForm,
  isDirty,
  issueMap,
  moveEntry,
  removeEntry,
  removeModel,
  renameEntry,
  renameModel,
  savedForm,
  setModelCode,
  type ListRow,
} from './settingsForm';

const saved: SettingsInput = {
  machineModels: [
    { code: 'RMMG', name: 'RigiMill MG' },
    { code: 'IM', name: 'IM8' },
  ],
  defaultLocation: 'Kalmar, Sweden',
  companyName: 'Modig Machine Tool',
  logoImageId: 'Logo000000000001',
  responsibles: ['Mechanical', 'Electrical', 'Media'],
  deviationCategories: ['Leakage', 'Missing parts'],
};

const values = (rows: readonly ListRow[]) => rows.map((row) => row.value);

describe('the form', () => {
  it('starts from the saved settings and gives back exactly what it was given', () => {
    const form = formFromInput(saved);
    expect(form.models.every((row) => row.saved)).toBe(true);
    expect(inputFromForm(form)).toEqual(saved);
    expect(isDirty(form, saved)).toBe(false);
  });

  it('gives every model and entry a key of its own', () => {
    const form = formFromInput(saved);
    const keys = [...form.models, ...form.responsibles, ...form.deviationCategories].map(
      (row) => row.key,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is dirty after any change, also a space, and clean again once undone', () => {
    const form = formFromInput(saved);
    const spaced = { ...form, companyName: 'Modig Machine Tool ' };
    expect(isDirty(spaced, saved)).toBe(true);
    expect(isDirty({ ...spaced, companyName: 'Modig Machine Tool' }, saved)).toBe(false);
    expect(isDirty({ ...form, logoImageId: undefined }, saved)).toBe(true);
    const moved = {
      ...form,
      responsibles: moveEntry(form.responsibles, form.responsibles[0]!.key, 1),
    };
    expect(isDirty(moved, saved)).toBe(true);
  });

  it('leaves the logo out of what Save sends when there is none', () => {
    const form = { ...formFromInput(saved), logoImageId: undefined };
    expect(inputFromForm(form)).not.toHaveProperty('logoImageId');
  });
});

describe('formErrors', () => {
  it('is empty for valid settings', () => {
    expect(formErrors(formFromInput(saved)).size).toBe(0);
  });

  it('names each bad field by its id, in the order of the form', () => {
    const form = formFromInput(saved);
    const { models: withNew, key } = addModel(form.models);
    const broken = {
      ...form,
      companyName: 'x'.repeat(201),
      models: setModelCode(withNew, key, 'R-1'),
      responsibles: renameEntry(form.responsibles, form.responsibles[2]!.key, 'mechanical'),
    };
    expect([...formErrors(broken)]).toEqual([
      [fieldId.modelName(key), 'Enter a name'],
      [fieldId.modelCode(key), 'Use letters and digits only'],
      [fieldId.entry(form.responsibles[2]!.key), 'Already on the list'],
      [fieldId.companyName, 'Use at most 200 characters'],
    ]);
  });

  it('maps an issue about a whole list, and one it does not know, sensibly', () => {
    const form = formFromInput(saved);
    expect([
      ...issueMap(form, [
        { path: ['responsibles'], message: 'At most 50 entries' },
        { path: ['machineModels'], message: 'At most 100 models' },
        { path: ['somethingElse'], message: 'Ignored' },
        { path: ['deviationCategories', 9], message: 'Out of range' },
      ]),
    ]).toEqual([
      [fieldId.models, 'At most 100 models'],
      [fieldId.list('responsibles'), 'At most 50 entries'],
      [fieldId.list('deviationCategories'), 'Out of range'],
    ]);
  });
});

describe('machine models', () => {
  it('suggests a new model’s code from its name, unique among the others', () => {
    const { models, key } = addModel(formFromInput(saved).models);
    expect(models.at(-1)).toMatchObject({ key, code: '', name: '', saved: false });
    const named = renameModel(models, key, 'RigiMill MG');
    expect(named.at(-1)).toMatchObject({ name: 'RigiMill MG', code: 'RMMG2' });
    expect(renameModel(named, key, 'Horizontal machining centre').at(-1)?.code).toBe('HMC');
  });

  it('stops following the name once the code is edited, and again when it is emptied', () => {
    const { models, key } = addModel([]);
    const coded = setModelCode(renameModel(models, key, 'RigiMill MG'), key, 'RM');
    expect(renameModel(coded, key, 'RigiMill MT')[0]).toMatchObject({
      code: 'RM',
      codeEdited: true,
    });
    const emptied = setModelCode(coded, key, '');
    expect(renameModel(emptied, key, 'RigiMill MT')[0]?.code).toBe('RMMT');
  });

  it('never changes a saved model’s code, but lets it be renamed', () => {
    const models = formFromInput(saved).models;
    const key = models[0]!.key;
    expect(setModelCode(models, key, 'X')[0]?.code).toBe('RMMG');
    expect(renameModel(models, key, 'RigiMill MG 2')[0]).toMatchObject({
      code: 'RMMG',
      name: 'RigiMill MG 2',
    });
  });

  it('removes a model by its key', () => {
    const models = formFromInput(saved).models;
    expect(removeModel(models, models[0]!.key).map((row) => row.code)).toEqual(['IM']);
  });
});

describe('pick lists', () => {
  const rows = formFromInput(saved).responsibles;

  it('adds a trimmed name at the end, unless it is blank or already there', () => {
    expect(addProblem(rows, '  ')).toBe('Type a name first');
    expect(addProblem(rows, ' mechanical ')).toBe('Already on the list');
    expect(addProblem(rows, 'Hydraulics')).toBeNull();
    expect(values(addEntry(rows, ' Hydraulics '))).toEqual([
      'Mechanical',
      'Electrical',
      'Media',
      'Hydraulics',
    ]);
  });

  it('renames and removes an entry by its key', () => {
    const key = rows[1]!.key;
    expect(values(renameEntry(rows, key, 'Electric'))).toEqual(['Mechanical', 'Electric', 'Media']);
    expect(values(removeEntry(rows, key))).toEqual(['Mechanical', 'Media']);
  });

  it('moves an entry one place up or down, keeping its key, and not past either end', () => {
    const moved = moveEntry(rows, rows[0]!.key, 1);
    expect(values(moved)).toEqual(['Electrical', 'Mechanical', 'Media']);
    expect(moved[1]!.key).toBe(rows[0]!.key);
    expect(values(moveEntry(rows, rows[2]!.key, -1))).toEqual([
      'Mechanical',
      'Media',
      'Electrical',
    ]);
    expect(values(moveEntry(rows, rows[0]!.key, -1))).toEqual(values(rows));
    expect(values(moveEntry(rows, rows[2]!.key, 1))).toEqual(values(rows));
  });
});

describe('savedForm', () => {
  it('takes what the server stored, trimmed, keeping the keys; new models become saved', () => {
    const form = formFromInput(saved);
    const { models, key } = addModel(form.models);
    const edited = {
      ...form,
      companyName: ' Modig ',
      models: renameModel(models, key, 'HMC 500'),
    };
    const sent = inputFromForm(edited);
    const stored: SettingsInput = {
      ...sent,
      companyName: 'Modig',
      machineModels: [...saved.machineModels, { code: 'HMC500', name: 'HMC 500' }],
    };
    const next = savedForm(edited, sent, stored);
    expect(inputFromForm(next)).toEqual(stored);
    expect(isDirty(next, stored)).toBe(false);
    expect(next.models.map((row) => row.key)).toEqual(edited.models.map((row) => row.key));
    expect(next.models.at(-1)).toMatchObject({ saved: true, code: 'HMC500' });
  });

  it('keeps changes made while the save ran, still unsaved', () => {
    const form = formFromInput(saved);
    const { models, key } = addModel(form.models);
    const sentForm = { ...form, models: renameModel(models, key, 'HMC 500') };
    const sent = inputFromForm(sentForm);
    const later = { ...sentForm, defaultLocation: 'Skövde' };
    const next = savedForm(later, sent, sent);
    expect(next.defaultLocation).toBe('Skövde');
    expect(isDirty(next, sent)).toBe(true);
    expect(next.models.at(-1)).toMatchObject({ saved: true, code: 'HMC500' });
  });
});
