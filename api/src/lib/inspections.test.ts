import {
  blobNames,
  CONTAINERS,
  InspectionCounterSchema,
  type Inspection,
  type InspectionSummary,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorage, sampleInspection, useTestStorage } from '../../test/storage';
import { ServiceUnavailableError } from './http';
import {
  inspectionSummary,
  loadSummaries,
  nextInspectionNumber,
  writeInspection,
} from './inspections';
import type * as Storage from './storage';
import { containerClient, readJson, writeJson } from './storage';

/** Lets a test act just before each blob write, the way a concurrent request could. */
const hooks = vi.hoisted(() => ({
  beforeWrite: undefined as ((blobName: string) => Promise<void>) | undefined,
}));
vi.mock('./storage', async (importOriginal) => {
  const actual = await importOriginal<typeof Storage>();
  return {
    ...actual,
    writeJson: async (...args: Parameters<typeof actual.writeJson>) => {
      await hooks.beforeWrite?.(args[1]);
      return actual.writeJson(...args);
    },
  };
});

beforeAll(useTestStorage);
beforeEach(resetStorage);
afterEach(() => {
  hooks.beforeWrite = undefined;
});

const { config, inspections } = CONTAINERS;

async function counter() {
  return (await readJson(config, blobNames.inspectionCounter, InspectionCounterSchema))?.data;
}

describe('nextInspectionNumber', () => {
  it('counts FI-YYYY-0001, 0002… and keeps the counter in config/', async () => {
    const now = new Date('2026-03-01T10:00:00Z');
    expect(await nextInspectionNumber(now)).toBe('FI-2026-0001');
    expect(await nextInspectionNumber(now)).toBe('FI-2026-0002');
    expect(await counter()).toEqual({ year: 2026, last: 2 });
  });

  it('restarts every year at midnight in Sweden, not in UTC', async () => {
    await writeJson(config, blobNames.inspectionCounter, { year: 2026, last: 41 });
    // 23:59:59 on New Year's Eve in Stockholm (UTC+1)…
    expect(await nextInspectionNumber(new Date('2026-12-31T22:59:59Z'))).toBe('FI-2026-0042');
    // …and one second later it is 2027 there, while UTC is still in 2026.
    expect(await nextInspectionNumber(new Date('2026-12-31T23:00:00Z'))).toBe('FI-2027-0001');
    expect(await nextInspectionNumber(new Date('2027-01-02T08:00:00Z'))).toBe('FI-2027-0002');
  });

  it('never goes back to an earlier year (a clock behind another instance)', async () => {
    await writeJson(config, blobNames.inspectionCounter, { year: 2027, last: 4 });
    expect(await nextInspectionNumber(new Date('2026-12-31T22:00:00Z'))).toBe('FI-2027-0005');
  });

  it('takes the next number when it loses a race for the counter', async () => {
    await writeJson(config, blobNames.inspectionCounter, { year: 2026, last: 7 });
    hooks.beforeWrite = async () => {
      hooks.beforeWrite = undefined;
      await writeJson(config, blobNames.inspectionCounter, { year: 2026, last: 8 });
    };
    expect(await nextInspectionNumber(new Date('2026-06-01T10:00:00Z'))).toBe('FI-2026-0009');
  });

  it('gives up with a 503 after five retries, having handed out nothing', async () => {
    await writeJson(config, blobNames.inspectionCounter, { year: 2026, last: 0 });
    let rivals = 0;
    hooks.beforeWrite = async (blobName) => {
      if (blobName !== blobNames.inspectionCounter) return;
      rivals += 1;
      // Written past the hook, so it never triggers itself.
      const body = JSON.stringify({ year: 2026, last: 100 + rivals });
      await containerClient(config).getBlockBlobClient(blobName).upload(body, body.length);
    };
    const attempt = nextInspectionNumber(new Date('2026-06-01T10:00:00Z'));
    await expect(attempt).rejects.toThrow(ServiceUnavailableError);
    await expect(attempt).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
      message: 'Too many inspections are being created at once. Try again.',
    });
    expect(rivals).toBe(6);
    expect(await counter()).toEqual({ year: 2026, last: 106 });
  });

  it('500s on a counter blob it cannot read, rather than starting again at 0001', async () => {
    await writeJson(config, blobNames.inspectionCounter, { year: 2026 });
    await expect(nextInspectionNumber()).rejects.toThrow('inspection-counter.json is invalid');
  });
});

describe('loadSummaries', () => {
  async function stored(overrides: Partial<Inspection> = {}): Promise<Inspection> {
    const inspection = sampleInspection(overrides);
    await writeInspection(inspection, { ifNoneMatch: '*' });
    return inspection;
  }

  it('summarises an inspection from its rows', async () => {
    const base = sampleInspection();
    const [a, b] = base.templateSnapshot.sections[0]!.items;
    const inspection = {
      ...base,
      results: { [a!.id]: { status: 'NOK' as const }, [b!.id]: { status: 'NA' as const } },
    };
    expect(inspectionSummary(inspection)).toEqual({
      id: base.id,
      number: 'FI-2026-0007',
      machineName: 'RigiMill MG #7',
      serialNumber: 'SN-1007',
      modelCode: 'RMMG',
      date: '2026-10-07',
      state: 'in_progress',
      nokCount: 1,
      filled: 2,
      total: 3,
      updatedAt: base.updatedAt,
    } satisfies InspectionSummary);
  });

  it('lists from blob metadata alone, as ASCII, Swedish text intact', async () => {
    const inspection = await stored({
      front: {
        ...sampleInspection().front,
        machineName: 'Fräs "Åsa" – #1 / 100%',
        serialNumber: 'ÖÄ-12',
      },
    });
    const blob = containerClient(inspections).getBlockBlobClient(
      blobNames.inspection(inspection.id),
    );
    const { metadata } = await blob.getProperties();
    expect(Object.keys(metadata ?? {})).toEqual(['summary']);
    expect(metadata?.summary).toMatch(/^[\x21-\x7e]+$/);

    // Replace the content but keep the metadata: the list must not read the blob.
    await blob.upload('not json', 8, { metadata });
    expect(await loadSummaries()).toEqual([inspectionSummary(inspection)]);
  });

  it('keeps a lone surrogate from breaking the metadata', async () => {
    const inspection = await stored({
      front: { ...sampleInspection().front, machineName: 'Broken \ud800 paste' },
    });
    expect(await loadSummaries()).toEqual([inspectionSummary(inspection)]);
  });

  it.each([
    ['missing', {}],
    ['not URI-encoded', { summary: '%E0%A4%A' }],
    ['not JSON', { summary: 'hello' }],
    ['incomplete', { summary: encodeURIComponent(JSON.stringify({ number: 'FI-2026-0001' })) }],
  ])('reads the blob itself when its metadata is %s', async (_case, metadata) => {
    const inspection = await stored();
    await containerClient(inspections)
      .getBlobClient(blobNames.inspection(inspection.id))
      .setMetadata(metadata);
    expect(await loadSummaries()).toEqual([inspectionSummary(inspection)]);
  });

  it('lists the newest number first and skips blobs that are not inspections', async () => {
    const numbers = ['FI-2025-0100', 'FI-2026-0002', 'FI-2026-10000', 'FI-2026-0010'];
    for (const number of numbers) await stored({ number });
    await writeJson(inspections, 'notes/readme.json', {});
    await writeJson(inspections, 'not-an-id.json', {});

    expect((await loadSummaries()).map((summary) => summary.number)).toEqual([
      'FI-2026-10000',
      'FI-2026-0010',
      'FI-2026-0002',
      'FI-2025-0100',
    ]);
  });

  it('is empty when there are no inspections', async () => {
    expect(await loadSummaries()).toEqual([]);
  });
});
