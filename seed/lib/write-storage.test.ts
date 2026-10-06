import { text } from 'node:stream/consumers';
import type { BlockBlobClient } from '@azure/storage-blob';
import { beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  blobNames,
  CONTAINERS,
  SettingsSchema,
  TemplateSchema,
  type Settings,
} from '@modig/shared';
import { parseRealWorkbook, REAL_WORKBOOK_FILE } from '../test/real-workbook';
import type { ParsedWorkbook } from './parse-workbook';
import { connectStorage, writeSeed, type Storage } from './write-storage';

// Runs against the private in-memory Azurite from test/azurite-global-setup.ts.
const storage: Storage = connectStorage(inject('storageConnectionString'));
const options = { sourceFile: REAL_WORKBOOK_FILE, now: new Date('2026-10-06T09:00:00.000Z') };

const templates = storage.blobService.getContainerClient(CONTAINERS.templates);
const settingsBlob = storage.blobService
  .getContainerClient(CONTAINERS.config)
  .getBlockBlobClient(blobNames.settings);

async function readBlob(blob: BlockBlobClient) {
  const response = await blob.download();
  const body = response.readableStreamBody ? await text(response.readableStreamBody) : '';
  return { json: JSON.parse(body) as unknown, etag: response.etag, type: response.contentType };
}

async function templateBlobNames(): Promise<string[]> {
  const names: string[] = [];
  for await (const { name } of templates.listBlobsFlat()) names.push(name);
  return names.sort();
}

describe('writeSeed', () => {
  let parsed: ParsedWorkbook;
  beforeAll(async () => {
    parsed = await parseRealWorkbook();
  });

  beforeEach(async () => {
    for await (const { name } of storage.blobService.listContainers()) {
      await storage.blobService.deleteContainer(name);
    }
    await storage.deviations.deleteTable();
  });

  it('first run creates containers, table, settings, the published revision and the draft', async () => {
    const report = await writeSeed(storage, parsed, options);

    expect(report.createdContainers).toEqual(Object.values(CONTAINERS));
    expect(report.settings).toEqual({
      action: 'created',
      addedModelCodes: ['HHVSingle', 'HHVDUO', 'MILLEX', 'RMMT', 'RMMG', 'IM'],
    });
    if (report.template.action !== 'created') throw new Error('expected a new template');
    const { templateId } = report.template;
    expect(report.template).toMatchObject({ publishedRevision: 2, draftRevision: 3 });

    // Listing fails with TableNotFound unless the deviations table exists.
    await expect(storage.deviations.listEntities().next()).resolves.toMatchObject({ done: true });

    expect(await templateBlobNames()).toEqual([
      blobNames.templateDraft(templateId),
      blobNames.templateRevision(templateId, 2),
    ]);
    const published = await readBlob(
      templates.getBlockBlobClient(blobNames.templateRevision(templateId, 2)),
    );
    const draft = await readBlob(templates.getBlockBlobClient(blobNames.templateDraft(templateId)));
    expect(published.type).toBe('application/json');
    expect(draft.type).toBe('application/json');

    const publishedDoc = TemplateSchema.parse(published.json);
    const draftDoc = TemplateSchema.parse(draft.json);
    expect(publishedDoc).toMatchObject({
      id: templateId,
      modelCode: 'RMMG',
      name: 'Final inspection – RigiMill MG',
      status: 'published',
      revision: 2,
      changeNote: 'Imported from Final_Inspection_rev_2.xlsm',
    });
    expect(draftDoc).toMatchObject({ id: templateId, status: 'draft', revision: 3 });
    expect(draftDoc.sections).toEqual(publishedDoc.sections);
    expect(publishedDoc.sections.map((s) => s.items.length)).toEqual([20, 15, 10, 5, 22, 18]);

    const settings = SettingsSchema.parse((await readBlob(settingsBlob)).json);
    expect(settings).toMatchObject({
      machineModels: parsed.models,
      defaultLocation: 'Kalmar, Sweden',
      updatedBy: 'seed',
    });
  });

  it('second run changes nothing', async () => {
    const first = await writeSeed(storage, parsed, options);
    const before = await Promise.all((await templateBlobNames()).map(etagOf));
    const settingsBefore = (await settingsBlob.getProperties()).etag;

    const second = await writeSeed(storage, parsed, options);

    expect(second).toEqual({
      createdContainers: [],
      settings: { action: 'unchanged', addedModelCodes: [] },
      template: { action: 'skipped', templateId: first.template.templateId },
    });
    expect(await Promise.all((await templateBlobNames()).map(etagOf))).toEqual(before);
    expect((await settingsBlob.getProperties()).etag).toBe(settingsBefore);
  });

  it('adds missing models to existing settings without overwriting admin edits', async () => {
    await writeSeed(storage, parsed, options);
    const stored = await readBlob(settingsBlob);
    const edited: Settings = {
      ...SettingsSchema.parse(stored.json),
      machineModels: [
        { code: 'RMMG', name: 'RigiMill MG Gen 2' },
        { code: 'XYZ', name: 'Custom machine' },
      ],
      defaultLocation: 'Göteborg, Sweden',
      updatedBy: 'admin@modig.se',
    };
    const body = JSON.stringify(edited);
    await settingsBlob.upload(body, Buffer.byteLength(body), {
      conditions: { ifMatch: stored.etag },
    });

    const report = await writeSeed(storage, parsed, options);

    expect(report.settings).toEqual({
      action: 'merged',
      addedModelCodes: ['HHVSingle', 'HHVDUO', 'MILLEX', 'RMMT', 'IM'],
    });
    const merged = SettingsSchema.parse((await readBlob(settingsBlob)).json);
    expect(merged.machineModels.map((m) => `${m.code}=${m.name}`)).toEqual([
      'RMMG=RigiMill MG Gen 2',
      'XYZ=Custom machine',
      'HHVSingle=HHV3',
      'HHVDUO=HHV3 DUO',
      'MILLEX=Mill-Ex',
      'RMMT=RigiMill MT',
      'IM=IM8',
    ]);
    expect(merged.defaultLocation).toBe('Göteborg, Sweden');
  });

  it('refuses to merge into settings that are not valid', async () => {
    await storage.blobService.getContainerClient(CONTAINERS.config).createIfNotExists();
    const invalid = '{"machineModels":"nope"}';
    await settingsBlob.upload(invalid, Buffer.byteLength(invalid));

    await expect(writeSeed(storage, parsed, options)).rejects.toThrow(
      /config\/settings\.json is not valid settings/,
    );
  });
});

async function etagOf(name: string): Promise<string> {
  const { etag } = await templates.getBlockBlobClient(name).getProperties();
  return `${name}@${etag}`;
}
