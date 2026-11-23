/**
 * A machine's assemblies: an assembly instruction bound to a machine, signed off step by step by
 * several people at once, taken back, updated to a newer revision and removed.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ApiErrorSchema,
  MachineAssemblyDetailSchema,
  MachineAssemblyListSchema,
  MachineDetailSchema,
  newId,
  type Template,
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
import { loadSignOffs } from '../lib/machineAssemblies';
import {
  addMachineAssembly,
  getMachineAssembly,
  listMachineAssemblies,
  removeMachineAssembly,
  signSteps,
  unsignSteps,
  updateMachineAssembly,
} from './machine-assemblies';
import { createMachine, deleteMachine } from './machines';

vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: () => undefined },
}));

const sam = principal('sam.andersson@modig.se', ['inspector']);
const lisa = principal('lisa.berg@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;
function call(
  handler: Handler,
  options: {
    who?: ReturnType<typeof principal>;
    method?: string;
    id: string;
    assemblyId?: string;
    body?: unknown;
    ifMatch?: string;
  },
) {
  const { who = sam, method = 'GET', id, assemblyId, body, ifMatch } = options;
  return handler(
    request({
      principal: who,
      method,
      params: { id, ...(assemblyId && { assemblyId }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      ...(ifMatch && { headers: { 'If-Match': ifMatch } }),
    }),
    context(),
  );
}
const detailOf = (response: HttpResponseInit) =>
  MachineAssemblyDetailSchema.parse(response.jsonBody);
const messageOf = (response: HttpResponseInit) => ApiErrorSchema.parse(response.jsonBody).message;

/** An assembly instruction for RigiMill MG: two tasks, three steps, published as revision 1. */
function instruction(overrides: Partial<Template> = {}): Template {
  return draftTemplate({
    kind: 'assembly',
    name: 'RMMG build',
    revision: 2,
    sections: [
      {
        id: newId(),
        title: 'Task 1',
        items: [
          { id: newId(), text: 'Mount Pan', assembly: { minutes: 10 } },
          { id: newId(), text: 'Mount Coolant pipes', assembly: { minutes: 90 } },
        ],
      },
      { id: newId(), title: 'Task 2', items: [{ id: newId(), text: 'Measure the base' }] },
    ],
    ...overrides,
  });
}

async function machine(): Promise<{ id: string; etag: string }> {
  const response = await createMachine(
    request({
      principal: sam,
      method: 'POST',
      body: JSON.stringify({
        machineName: 'Magellan#1',
        modelCode: 'RMMG',
        serialNumber: '1001',
        templateIds: [],
      }),
    }),
    context(),
  );
  expect(response.status).toBe(201);
  return {
    id: MachineDetailSchema.parse(response.jsonBody).machine.id,
    etag: new Headers(response.headers).get('ETag')!,
  };
}

async function bound() {
  const template = instruction();
  await storeTemplate(template, [1]);
  const { id, etag } = await machine();
  const response = await call(addMachineAssembly, {
    method: 'POST',
    id,
    body: { templateId: template.id },
  });
  expect(response.status).toBe(201);
  const { assembly } = detailOf(response);
  const steps = assembly.sections.flatMap((section) => section.items.map((item) => item.id));
  return { template, machineId: id, machineEtag: etag, assembly, steps };
}

describe('binding an assembly instruction to a machine', () => {
  it('copies the latest published revision, once, and lists it with its progress', async () => {
    const { template, machineId, assembly } = await bound();
    expect(assembly).toMatchObject({
      machineRef: machineId,
      templateId: template.id,
      templateRevision: 1,
      name: 'RMMG build',
    });
    const again = await call(addMachineAssembly, {
      method: 'POST',
      id: machineId,
      body: { templateId: template.id },
    });
    expect(again.status).toBe(409);
    const list = MachineAssemblyListSchema.parse(
      (await call(listMachineAssemblies, { id: machineId })).jsonBody,
    );
    expect(list).toEqual([
      expect.objectContaining({
        id: assembly.id,
        tasks: 2,
        tasksDone: 0,
        steps: 3,
        signed: 0,
        minutes: 100,
        latestRevision: 1,
      }),
    ]);
  });

  it('refuses an unpublished one, another model’s, a checklist and an unknown machine', async () => {
    const { id } = await machine();
    const draft = instruction({ revision: 1 });
    await storeTemplate(draft);
    const other = instruction({ modelCode: 'IM' });
    await storeTemplate(other, [1]);
    const checklist = draftTemplate({ revision: 2 });
    await storeTemplate(checklist, [1]);
    const add = (templateId: string, machineId = id) =>
      call(addMachineAssembly, { method: 'POST', id: machineId, body: { templateId } });
    expect((await add(draft.id)).status).toBe(409);
    expect((await add(other.id)).status).toBe(400);
    expect((await add(checklist.id)).status).toBe(404);
    expect((await add(other.id, newId())).status).toBe(404);
  });
});

describe('signing steps', () => {
  it('records the initials, the account and the time, and the first sign-off stands', async () => {
    const { machineId, assembly, steps } = await bound();
    const at = { id: machineId, assemblyId: assembly.id, method: 'POST' };
    const first = await call(signSteps, { ...at, body: { itemIds: [steps[0]], initials: 'SA' } });
    expect(first.status).toBe(200);
    expect(detailOf(first).signOffs[steps[0]!]).toMatchObject({
      initials: 'SA',
      by: 'sam.andersson@modig.se',
    });
    // Signing a whole task: the step already signed keeps its sign-off.
    const task = await call(signSteps, {
      ...at,
      who: lisa,
      body: { itemIds: [steps[0], steps[1]], initials: 'LB' },
    });
    const { signOffs } = detailOf(task);
    expect(signOffs[steps[0]!]?.initials).toBe('SA');
    expect(signOffs[steps[1]!]).toMatchObject({ initials: 'LB', by: 'lisa.berg@modig.se' });

    const [summary] = MachineAssemblyListSchema.parse(
      (await call(listMachineAssemblies, { id: machineId })).jsonBody,
    );
    expect(summary).toMatchObject({ signed: 2, tasksDone: 1, minutesSigned: 100 });
    expect(summary?.lastSignedAt).toBe(signOffs[steps[1]!]?.at);
  });

  it('keeps every sign-off when several people sign at once', async () => {
    const { machineId, assembly, steps } = await bound();
    const responses = await Promise.all(
      steps.map((step, index) =>
        call(signSteps, {
          id: machineId,
          assemblyId: assembly.id,
          method: 'POST',
          who: index % 2 ? lisa : sam,
          body: { itemIds: [step], initials: index % 2 ? 'LB' : 'SA' },
        }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(Object.keys(await loadSignOffs(machineId, assembly.id)).sort()).toEqual(
      [...steps].sort(),
    );
  });

  it('refuses initials that are none, and a step that is not in the instruction', async () => {
    const { machineId, assembly, steps } = await bound();
    const at = { id: machineId, assemblyId: assembly.id, method: 'POST' };
    expect(
      (await call(signSteps, { ...at, body: { itemIds: [steps[0]], initials: ' ' } })).status,
    ).toBe(400);
    expect(
      (await call(signSteps, { ...at, body: { itemIds: [newId()], initials: 'SA' } })).status,
    ).toBe(400);
  });

  it('lets the signer or an admin take a sign-off back, nobody else', async () => {
    const { machineId, assembly, steps } = await bound();
    const at = { id: machineId, assemblyId: assembly.id, method: 'POST' };
    await call(signSteps, { ...at, body: { itemIds: steps, initials: 'SA' } });
    const refused = await call(unsignSteps, { ...at, who: lisa, body: { itemIds: [steps[0]] } });
    expect(refused.status).toBe(403);
    expect(messageOf(refused)).toMatch(/Someone else signed this/);
    const own = await call(unsignSteps, { ...at, body: { itemIds: [steps[0]] } });
    expect(Object.keys(detailOf(own).signOffs)).toHaveLength(2);
    const byAdmin = await call(unsignSteps, { ...at, who: admin, body: { itemIds: [steps[1]] } });
    expect(Object.keys(detailOf(byAdmin).signOffs)).toEqual([steps[2]]);
  });
});

describe('a newer revision, and removing', () => {
  it('updates the machine’s copy and keeps what was signed', async () => {
    const { template, machineId, assembly, steps } = await bound();
    const at = { id: machineId, assemblyId: assembly.id, method: 'POST' };
    await call(signSteps, { ...at, body: { itemIds: [steps[0]], initials: 'SA' } });
    // Revision 2: the first task renamed, a step added to it.
    const next: Template = {
      ...template,
      revision: 3,
      sections: [
        {
          ...template.sections[0]!,
          title: 'OP10 - Assembly Bed',
          items: [...template.sections[0]!.items, { id: newId(), text: 'Mount Hose reel' }],
        },
        template.sections[1]!,
      ],
    };
    await storeTemplate(next, [1, 2]);
    expect(detailOf(await call(getMachineAssembly, { ...at, method: 'GET' })).latestRevision).toBe(
      2,
    );
    const updated = detailOf(await call(updateMachineAssembly, at));
    expect(updated.assembly.templateRevision).toBe(2);
    expect(updated.assembly.sections[0]).toMatchObject({ title: 'OP10 - Assembly Bed' });
    expect(updated.assembly.sections[0]?.items).toHaveLength(3);
    expect(updated.signOffs[steps[0]!]?.initials).toBe('SA');
  });

  it('is removed by an admin, and goes with its machine', async () => {
    const { machineId, machineEtag, assembly, steps } = await bound();
    const at = { id: machineId, assemblyId: assembly.id };
    await call(signSteps, { ...at, method: 'POST', body: { itemIds: steps, initials: 'SA' } });
    expect((await call(removeMachineAssembly, { ...at, method: 'DELETE' })).status).toBe(403);
    expect(
      (await call(removeMachineAssembly, { ...at, method: 'DELETE', who: admin })).status,
    ).toBe(204);
    expect((await call(getMachineAssembly, at)).status).toBe(404);
    expect(await loadSignOffs(machineId, assembly.id)).toEqual({});

    // Bound again, it goes with its machine when that is deleted.
    const template = instruction();
    await storeTemplate(template, [1]);
    await call(addMachineAssembly, {
      method: 'POST',
      id: machineId,
      body: { templateId: template.id },
    });
    const deleted = await call(deleteMachine, {
      id: machineId,
      method: 'DELETE',
      who: admin,
      ifMatch: machineEtag,
    });
    expect(deleted.status).toBe(204);
    expect((await call(listMachineAssemblies, { id: machineId })).status).toBe(404);
  });
});
