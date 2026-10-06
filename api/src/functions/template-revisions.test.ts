import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  newId,
  TemplateDetailSchema,
  TemplateSchema,
  type ApiError,
  type Template,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import type { ClientPrincipal } from '../lib/auth';
import {
  draftTemplate,
  resetStorage,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import type * as Storage from '../lib/storage';
import { listBlobNames, readJson, writeJson } from '../lib/storage';
import { loadDetail } from '../lib/templates';
import { getRevision, publishTemplate } from './template-revisions';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

/** Lets a test act just before a blob write, the way a second admin could. */
const hooks = vi.hoisted(() => ({
  beforeWrite: undefined as ((blobName: string) => Promise<void>) | undefined,
}));
vi.mock('../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof Storage>();
  return {
    ...actual,
    writeJson: async (...args: Parameters<typeof actual.writeJson>) => {
      const hook = hooks.beforeWrite;
      hooks.beforeWrite = undefined; // once, and not for the hook's own writes
      await hook?.(args[1]);
      return actual.writeJson(...args);
    },
  };
});

const admin = principal('Boss@Modig.se', ['admin']);
const inspector = principal('sam.andersson@modig.se', ['inspector']);
const { templates } = CONTAINERS;

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});
afterEach(() => {
  hooks.beforeWrite = undefined;
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);

/** `who: null` is an anonymous call. */
function publish(
  id: string,
  ifMatch: string | null,
  body: unknown = {},
  who: ClientPrincipal | null = admin,
) {
  return publishTemplate(
    request({
      principal: who ?? undefined,
      method: 'POST',
      params: { id },
      body: JSON.stringify(body),
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    }),
    context(),
  );
}

function getRev(id: string, n: string, who = inspector) {
  return getRevision(request({ principal: who, params: { id, n } }), context());
}

async function stored(blobName: string) {
  return (await readJson(templates, blobName, TemplateSchema))?.data;
}

async function revisionNumbers(id: string) {
  return (await listBlobNames(templates, `${id}/`)).filter((name) => name.includes('/rev-'));
}

/** Published as revision 2 (like the seed), then edited: the draft has one more section. */
async function editedTemplate() {
  const original = draftTemplate({ revision: 3 });
  await storeTemplate(original, [1, 2]);
  const draft: Template = {
    ...original,
    sections: [
      ...original.sections,
      { id: newId(), title: 'Gantry', items: [{ id: newId(), text: 'Covers - Intact' }] },
    ],
  };
  const etag = await storeTemplate(draft);
  return { draft, etag };
}

describe('registration', () => {
  it('registers publish and revision reads, SWA doing authentication', () => {
    expect(registrations).toEqual([
      [
        'templatePublish',
        {
          methods: ['POST'],
          authLevel: 'anonymous',
          route: 'templates/{id}/publish',
          handler: publishTemplate,
        },
      ],
      [
        'templateRevision',
        {
          methods: ['GET'],
          authLevel: 'anonymous',
          route: 'templates/{id}/revisions/{n}',
          handler: getRevision,
        },
      ],
    ]);
  });
});

describe('POST /api/templates/{id}/publish', () => {
  it('401 without a client principal, 403 for an inspector', async () => {
    const { draft, etag } = await editedTemplate();
    expect((await publish(draft.id, etag, {}, null)).status).toBe(401);
    expect((await publish(draft.id, etag, {}, inspector)).status).toBe(403);
    expect(await revisionNumbers(draft.id)).toHaveLength(2);
  });

  it('writes the draft as the next revision and moves the draft on', async () => {
    const { draft, etag } = await editedTemplate();
    const response = await publish(draft.id, etag, { changeNote: '  Added the gantry  ' });

    expect(response.status).toBe(200);
    const published = await stored(blobNames.templateRevision(draft.id, 3));
    expect(published).toEqual({
      ...draft,
      status: 'published',
      revision: 3,
      changeNote: 'Added the gantry',
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });

    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.draft).toEqual({
      ...draft,
      revision: 4,
      updatedAt: published?.updatedAt,
      updatedBy: 'boss@modig.se',
    });
    expect(detail.revisions.map((r) => r.revision)).toEqual([3, 2, 1]);
    expect(detail.revisions[0]).toEqual({
      revision: 3,
      publishedAt: published?.updatedAt,
      publishedBy: 'boss@modig.se',
      changeNote: 'Added the gantry',
    });
    expect(detail.hasUnpublishedChanges).toBe(false);

    // The answer carries the bumped draft's ETag, ready for the next save.
    const draftBlob = await readJson(templates, blobNames.templateDraft(draft.id), TemplateSchema);
    expect(draftBlob).toEqual({ data: detail.draft, etag: etagOf(response) });
    expect(etagOf(response)).not.toBe(etag);
  });

  it('numbers a second publish N + 1', async () => {
    const { draft, etag } = await editedTemplate();
    const first = TemplateDetailSchema.parse((await publish(draft.id, etag)).jsonBody);
    await storeTemplate({ ...first.draft, name: 'Renamed' });
    const latestEtag = (
      await readJson(templates, blobNames.templateDraft(draft.id), TemplateSchema)
    )?.etag;

    const second = await publish(draft.id, latestEtag ?? null);
    expect(second.status).toBe(200);
    const detail = TemplateDetailSchema.parse(second.jsonBody);
    expect(detail.revisions.map((r) => r.revision)).toEqual([4, 3, 2, 1]);
    expect(detail.draft.revision).toBe(5);
    expect((await stored(blobNames.templateRevision(draft.id, 4)))?.name).toBe('Renamed');
  });

  it('publishes a never-published template as revision 1, without an empty note', async () => {
    const draft = draftTemplate();
    const etag = await storeTemplate(draft);
    const response = await publish(draft.id, etag, { changeNote: '   ' });
    expect(response.status).toBe(200);
    const published = await stored(blobNames.templateRevision(draft.id, 1));
    expect(published).toMatchObject({ revision: 1, status: 'published' });
    expect(published).not.toHaveProperty('changeNote');
    expect(TemplateDetailSchema.parse(response.jsonBody).draft.revision).toBe(2);
  });

  it('400 with the problems as details when the draft is not ready', async () => {
    const draft = draftTemplate({
      sections: [
        { id: newId(), title: ' ', items: [{ id: newId(), text: 'Covers - Intact' }] },
        { id: newId(), title: 'Gantry', items: [{ id: newId(), text: '' }] },
      ],
    });
    const etag = await storeTemplate(draft);
    const [untitled, gantry] = draft.sections;

    const response = await publish(draft.id, etag);
    expect(response.status).toBe(400);
    expect(errorOf(response)).toEqual({
      error: 'bad_request',
      message: 'Fix 2 problems before publishing.',
      details: [
        {
          target: { kind: 'section', sectionId: untitled!.id },
          message: 'Section 1 needs a title.',
        },
        {
          target: { kind: 'item', sectionId: gantry!.id, itemId: gantry!.items[0]!.id },
          message: 'Row 2.a is empty.',
        },
      ],
    });
    expect(await revisionNumbers(draft.id)).toEqual([]);
  });

  it('400 for a template without sections', async () => {
    const draft = draftTemplate({ sections: [] });
    const response = await publish(draft.id, await storeTemplate(draft));
    expect(errorOf(response)).toMatchObject({
      message: 'Fix one problem before publishing.',
      details: [{ target: { kind: 'template' }, message: 'Add at least one section.' }],
    });
  });

  it('400 without If-Match or with an invalid body', async () => {
    const { draft, etag } = await editedTemplate();
    expect((await publish(draft.id, null)).status).toBe(400);
    expect((await publish(draft.id, etag, { changeNote: 42 })).status).toBe(400);
    expect((await publish(draft.id, etag, { changeNote: 'x'.repeat(1001) })).status).toBe(400);
    expect(await revisionNumbers(draft.id)).toHaveLength(2);
  });

  it('412 when the draft changed since the admin loaded it; nothing is published', async () => {
    const { draft, etag } = await editedTemplate();
    await storeTemplate({ ...draft, name: 'Saved by someone else' });
    const response = await publish(draft.id, etag);
    expect(response.status).toBe(412);
    expect(errorOf(response).error).toBe('precondition_failed');
    expect(await revisionNumbers(draft.id)).toHaveLength(2);
  });

  it('never overwrites a revision: losing the race to the same number is a 412', async () => {
    const { draft, etag } = await editedTemplate();
    const otherRevision: Template = { ...draft, status: 'published', revision: 3, name: 'Theirs' };
    const revisionBlob = blobNames.templateRevision(draft.id, 3);
    hooks.beforeWrite = async (blobName) => {
      // Someone else publishes revision 3 just before our write.
      if (blobName === revisionBlob) await writeJson(templates, blobName, otherRevision);
    };

    const response = await publish(draft.id, etag);
    expect(response.status).toBe(412);
    expect((await stored(revisionBlob))?.name).toBe('Theirs');
    expect(await revisionNumbers(draft.id)).toHaveLength(3);
  });

  it('still succeeds when someone saves the draft between the two writes', async () => {
    const { draft, etag } = await editedTemplate();
    const draftBlob = blobNames.templateDraft(draft.id);
    let theirEtag = '';
    hooks.beforeWrite = async (blobName) => {
      if (blobName !== blobNames.templateRevision(draft.id, 3)) return;
      // The revision write is next; the other save lands before our draft update.
      theirEtag = await writeJson(templates, draftBlob, { ...draft, name: 'Their edit' });
    };

    const response = await publish(draft.id, etag);
    expect(response.status).toBe(200);
    expect((await stored(blobNames.templateRevision(draft.id, 3)))?.name).toBe(draft.name);
    // Their save is kept, reported with the next revision number and its own ETag.
    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.draft).toMatchObject({ name: 'Their edit', revision: 4 });
    expect(detail.hasUnpublishedChanges).toBe(true);
    expect(etagOf(response)).toBe(theirEtag);
  });

  it('still succeeds when moving the draft on fails after the revision is written', async () => {
    const { draft, etag } = await editedTemplate();
    const draftBlob = blobNames.templateDraft(draft.id);
    hooks.beforeWrite = async () => {
      // The revision write goes through; the draft write after it fails (storage busy).
      hooks.beforeWrite = async (blobName) => {
        if (blobName === draftBlob) throw new Error('ServerBusy');
      };
    };

    const response = await publish(draft.id, etag);
    // A failure here would make the user publish again, as a duplicate revision 4.
    expect(response.status).toBe(200);
    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.revisions.map((r) => r.revision)).toEqual([3, 2, 1]);
    expect(detail.draft.revision).toBe(4);
    expect(detail.hasUnpublishedChanges).toBe(false);
    // The draft was not rewritten, so its ETag (the one the editor holds) still works.
    expect(etagOf(response)).toBe(etag);
    expect(await revisionNumbers(draft.id)).toHaveLength(3);
  });

  it('numbers revisions past 9 in order (blob listings sort rev-10 before rev-2)', async () => {
    const draft = draftTemplate({ revision: 12 });
    const etag = await storeTemplate(
      draft,
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
    expect((await loadDetail(draft.id))?.detail.draft.revision).toBe(12);

    const response = await publish(draft.id, etag, { changeNote: 'Twelfth' });
    expect(response.status).toBe(200);
    expect((await stored(blobNames.templateRevision(draft.id, 12)))?.changeNote).toBe('Twelfth');
    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.revisions.map((r) => r.revision)).toEqual([
      12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(detail.draft.revision).toBe(13);
  });

  it('400 for a malformed id, 404 for an unknown template', async () => {
    expect((await publish('bad id', '"0x1"')).status).toBe(400);
    expect((await publish(newId(), '"0x1"')).status).toBe(404);
  });
});

describe('GET /api/templates/{id}/revisions/{n}', () => {
  it('401 without a client principal, 403 without an app role', async () => {
    const id = newId();
    expect((await getRevision(request({ params: { id, n: '1' } }), context())).status).toBe(401);
    const guest = principal('guest@outlook.com', []);
    expect((await getRev(id, '1', guest)).status).toBe(403);
  });

  it('returns a published revision to an inspector, cacheable forever', async () => {
    const { draft } = await editedTemplate();
    const response = await getRev(draft.id, '2');
    expect(response.status).toBe(200);
    expect(TemplateSchema.parse(response.jsonBody)).toEqual(
      await stored(blobNames.templateRevision(draft.id, 2)),
    );
    expect(new Headers(response.headers).get('Cache-Control')).toBe(
      'private, max-age=31536000, immutable',
    );
  });

  it('404 for a revision or template that does not exist', async () => {
    const { draft } = await editedTemplate();
    for (const [id, n] of [
      [draft.id, '3'], // the draft's number: not published yet
      [newId(), '1'],
    ] as const) {
      const response = await getRev(id, n);
      expect(response.status).toBe(404);
      expect(errorOf(response).error).toBe('not_found');
      expect(new Headers(response.headers).get('Cache-Control')).toBeNull();
    }
  });

  it.each(['0', '-1', '03', '1.5', 'abc', '1e3', ''])('400 for revision "%s"', async (n) => {
    const response = await getRev(newId(), n);
    expect(response.status).toBe(400);
  });

  it('400 for a malformed template id', async () => {
    expect((await getRev('..', '1')).status).toBe(400);
  });
});
