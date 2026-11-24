/**
 * Change requests: anyone signed in flags a step of an assembly instruction; admins see them,
 * mark them fixed, reopen and delete them.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ChangeRequestListSchema,
  ChangeRequestSchema,
  ChangeRequestSummarySchema,
  MachineDetailSchema,
  newId,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import {
  changeRequestSummary,
  createChangeRequest,
  deleteChangeRequest,
  listChangeRequests,
  updateChangeRequest,
} from './change-requests';
import { addMachineAssembly } from './machine-assemblies';
import { createMachine } from './machines';

vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: () => undefined },
}));

const sam = principal('sam.andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;
const call = (
  handler: Handler,
  options: {
    who?: ReturnType<typeof principal>;
    method?: string;
    id?: string;
    body?: unknown;
  } = {},
) =>
  handler(
    request({
      principal: options.who ?? sam,
      method: options.method ?? 'GET',
      ...(options.id && { params: { id: options.id } }),
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    }),
    context(),
  );

/** A published assembly instruction: one task, two steps. */
async function instruction() {
  const template = draftTemplate({
    kind: 'assembly',
    name: 'RMMG build',
    revision: 2,
    sections: [
      {
        id: newId(),
        title: 'Base',
        items: [
          { id: newId(), text: 'Mount Pan' },
          { id: newId(), text: 'Mount Coolant pipes' },
        ],
      },
    ],
  });
  await storeTemplate(template, [1]);
  return { template, steps: template.sections[0]!.items.map((item) => item.id) };
}

const flag = (body: unknown, who = sam) => call(createChangeRequest, { who, method: 'POST', body });

describe('flagging a step', () => {
  it('records the step as it read, who flagged it and when', async () => {
    const { template, steps } = await instruction();
    const response = await flag({
      templateId: template.id,
      itemId: steps[1],
      message: '  The washers are missing from the bolt list.  ',
    });
    expect(response.status).toBe(201);
    expect(ChangeRequestSchema.parse(response.jsonBody)).toMatchObject({
      templateId: template.id,
      itemId: steps[1],
      templateName: 'RMMG build',
      modelCode: 'RMMG',
      templateRevision: 1,
      taskTitle: 'Base',
      stepRef: '1.2',
      stepText: 'Mount Coolant pipes',
      message: 'The washers are missing from the bolt list.',
      createdBy: 'sam.andersson@modig.se',
      status: 'open',
    });
  });

  it('remembers the machine when it is flagged on one', async () => {
    const { template, steps } = await instruction();
    const made = await call(createMachine, {
      method: 'POST',
      body: { machineName: 'Magellan#1', modelCode: 'RMMG', serialNumber: '1', templateIds: [] },
    });
    const machineId = MachineDetailSchema.parse(made.jsonBody).machine.id;
    const body = { templateId: template.id, itemId: steps[0], message: 'Wrong part', machineId };
    // Not bound to the machine yet.
    expect((await flag(body)).status).toBe(404);
    await call(addMachineAssembly, {
      method: 'POST',
      id: machineId,
      body: { templateId: template.id },
    });
    expect(ChangeRequestSchema.parse((await flag(body)).jsonBody)).toMatchObject({
      machineRef: machineId,
      machineName: 'Magellan#1',
      stepRef: '1.1',
    });
  });

  it('refuses an empty message, an unknown step and a checklist', async () => {
    const { template, steps } = await instruction();
    const checklist = draftTemplate({ revision: 2 });
    await storeTemplate(checklist, [1]);
    expect((await flag({ templateId: template.id, itemId: steps[0], message: ' ' })).status).toBe(
      400,
    );
    expect((await flag({ templateId: template.id, itemId: newId(), message: 'x' })).status).toBe(
      400,
    );
    expect(
      (
        await flag({
          templateId: checklist.id,
          itemId: checklist.sections[0]!.items[0]!.id,
          message: 'x',
        })
      ).status,
    ).toBe(404);
  });
});

describe('the admins’ list', () => {
  it('is theirs only, open first, with the open count', async () => {
    const { template, steps } = await instruction();
    await flag({ templateId: template.id, itemId: steps[0], message: 'First' });
    const second = ChangeRequestSchema.parse(
      (await flag({ templateId: template.id, itemId: steps[1], message: 'Second' })).jsonBody,
    );
    expect((await call(listChangeRequests)).status).toBe(403);
    expect((await call(changeRequestSummary)).status).toBe(403);
    const list = ChangeRequestListSchema.parse(
      (await call(listChangeRequests, { who: admin })).jsonBody,
    );
    expect(list.map((entry) => entry.message)).toEqual(['Second', 'First']);
    expect(
      ChangeRequestSummarySchema.parse((await call(changeRequestSummary, { who: admin })).jsonBody),
    ).toEqual({ open: 2 });

    // Fixed with a note: it goes after the open one; reopened, the note and who fixed it go.
    const fix = { who: admin, method: 'POST', id: second.id };
    expect(
      (await call(updateChangeRequest, { ...fix, who: sam, body: { status: 'fixed' } })).status,
    ).toBe(403);
    const fixed = ChangeRequestSchema.parse(
      (await call(updateChangeRequest, { ...fix, body: { status: 'fixed', resolution: 'Added.' } }))
        .jsonBody,
    );
    expect(fixed).toMatchObject({
      status: 'fixed',
      fixedBy: 'boss@modig.se',
      resolution: 'Added.',
    });
    const after = ChangeRequestListSchema.parse(
      (await call(listChangeRequests, { who: admin })).jsonBody,
    );
    expect(after.map((entry) => entry.status)).toEqual(['open', 'fixed']);
    const reopened = ChangeRequestSchema.parse(
      (await call(updateChangeRequest, { ...fix, body: { status: 'open' } })).jsonBody,
    );
    expect(reopened.fixedBy).toBeUndefined();
    expect(reopened.resolution).toBeUndefined();

    expect((await call(deleteChangeRequest, { ...fix, method: 'DELETE' })).status).toBe(204);
    expect((await call(deleteChangeRequest, { ...fix, method: 'DELETE' })).status).toBe(404);
    expect((await call(updateChangeRequest, { ...fix, body: { status: 'fixed' } })).status).toBe(
      404,
    );
  });
});
