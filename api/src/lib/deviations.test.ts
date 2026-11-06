import { odata } from '@azure/data-tables';
import {
  DeviationRowSchema,
  newId,
  type Inspection,
  type RowResult,
  type Section,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { draftTemplate, resetStorage, sampleInspection, useTestStorage } from '../../test/storage';
import { deleteDeviationRows, syncDeviations } from './deviations';
import { deviationsTable } from './storage';

beforeAll(useTestStorage);
beforeEach(resetStorage);
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The brief's 17 columns (§4), in its order, plus `category` after `severity`, then which kind of
 * inspection it is from and its checklist's name, then the deviation log's: the deviation's
 * number and its follow-up.
 */
const COLUMNS = [
  'inspectionId',
  'inspectionNumber',
  'serialNumber',
  'machineName',
  'modelCode',
  'templateId',
  'templateRevision',
  'itemId',
  'sectionTitle',
  'displayRef',
  'checkpointText',
  'comment',
  'resp',
  'severity',
  'category',
  'inspectionDate',
  'finalised',
  'createdAt',
  'kind',
  'checkName',
  'deviationNumber',
  'status',
  'action',
  'closedOn',
  'closedBy',
];

type Row = Record<string, unknown> & { partitionKey: string; rowKey: string };

/** Every row in a partition (default RMMG), without the service's etag and timestamp. */
async function rows(partitionKey = 'RMMG'): Promise<Row[]> {
  const found: Row[] = [];
  const entities = deviationsTable().listEntities<Record<string, unknown>>({
    queryOptions: { filter: odata`PartitionKey eq ${partitionKey}` },
  });
  for await (const { etag: _etag, timestamp: _timestamp, ...entity } of entities) {
    found.push(entity as Row);
  }
  return found;
}

async function rowOf(inspection: Inspection, key: string): Promise<Row | undefined> {
  return (await rows(inspection.front.modelCode)).find(
    (row) => row.rowKey === `${inspection.id}_${key}`,
  );
}

/** The ids of the sample template's three rows, in checklist order (1.a, 1.b, 2.a). */
function itemIds(inspection: Inspection): string[] {
  return inspection.templateSnapshot.sections.flatMap((section) => section.items.map((i) => i.id));
}

function withResults(inspection: Inspection, results: Record<string, RowResult>): Inspection {
  return { ...inspection, results };
}

describe('syncDeviations', () => {
  it('writes one row per NOK row and extra deviation, with exactly the 25 columns', async () => {
    const base = sampleInspection();
    const [a, b, c] = itemIds(base);
    const extraId = newId();
    const inspection: Inspection = {
      ...base,
      results: {
        [a!]: { status: 'NOK', comment: 'Blue mark missing', resp: 'Mechanics', severity: 'major' },
        [b!]: { status: 'OK', comment: 'Fine' },
        [c!]: { status: 'NOK' },
      },
      extraDeviations: [
        { id: extraId, description: 'Scratch on door', resp: 'Paint shop', severity: 'minor' },
      ],
    };
    await syncDeviations(inspection);

    const stored = await rows();
    expect(stored.map((row) => row.rowKey).sort()).toEqual(
      [`${base.id}_${a}`, `${base.id}_${c}`, `${base.id}_${extraId}`].sort(),
    );
    for (const row of stored) {
      const { partitionKey, rowKey: _rowKey, ...columns } = row;
      expect(partitionKey).toBe('RMMG');
      expect(Object.keys(columns).sort()).toEqual([...COLUMNS].sort());
      expect(() => DeviationRowSchema.parse(columns)).not.toThrow();
    }

    const common = {
      partitionKey: 'RMMG',
      kind: 'final',
      checkName: 'Final inspection – RigiMill MG',
      inspectionId: base.id,
      inspectionNumber: 'FI-2026-0007',
      serialNumber: 'SN-1007',
      machineName: 'RigiMill MG #7',
      modelCode: 'RMMG',
      templateId: base.templateId,
      templateRevision: 2,
      inspectionDate: '2026-10-07',
      finalised: false,
      createdAt: expect.any(String),
      // Nobody has followed them up yet.
      status: 'open',
      action: '',
      closedOn: '',
      closedBy: '',
    };
    expect(await rowOf(inspection, a!)).toEqual({
      ...common,
      rowKey: `${base.id}_${a}`,
      itemId: a,
      sectionTitle: 'Loading area',
      displayRef: '1.a',
      checkpointText: 'Lifting columns - Marked screws, blue/red/yellow',
      comment: 'Blue mark missing',
      resp: 'Mechanics',
      severity: 'major',
      category: '',
      deviationNumber: 'D-01',
    });
    expect(await rowOf(inspection, c!)).toMatchObject({
      itemId: c,
      sectionTitle: 'Electrical cabinets',
      displayRef: '2.a',
      comment: '',
      resp: '',
      severity: 'minor',
    });
    expect(await rowOf(inspection, extraId)).toEqual({
      ...common,
      rowKey: `${base.id}_${extraId}`,
      itemId: '',
      sectionTitle: '',
      displayRef: '—',
      checkpointText: 'Scratch on door',
      comment: '',
      resp: 'Paint shop',
      severity: 'minor',
      category: '',
      deviationNumber: 'D-03',
    });
  });

  it('deletes a row set back to OK and updates an edited comment', async () => {
    const base = sampleInspection();
    const [a, b] = itemIds(base);
    await syncDeviations(withResults(base, { [a!]: { status: 'NOK' }, [b!]: { status: 'NOK' } }));
    const firstA = await rowOf(base, a!);

    const later = withResults(base, {
      [a!]: { status: 'NOK', comment: 'Now with a comment' },
      [b!]: { status: 'OK' },
    });
    await syncDeviations(later);

    expect((await rows()).map((row) => row.rowKey)).toEqual([`${base.id}_${a}`]);
    expect(await rowOf(base, a!)).toEqual({ ...firstA, comment: 'Now with a comment' });
  });

  it('keeps createdAt from the first save', async () => {
    const base = sampleInspection();
    const [a] = itemIds(base);
    await syncDeviations(withResults(base, { [a!]: { status: 'NOK' } }));
    const { createdAt } = (await rowOf(base, a!))!;
    expect(Date.now() - Date.parse(createdAt as string)).toBeLessThan(60_000);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await syncDeviations(withResults(base, { [a!]: { status: 'NOK', severity: 'critical' } }));
    expect(await rowOf(base, a!)).toMatchObject({ severity: 'critical', createdAt });
  });

  it('marks the rows finalised with the inspection, and back', async () => {
    const base = sampleInspection();
    const [a] = itemIds(base);
    const nok = withResults(base, { [a!]: { status: 'NOK' } });
    await syncDeviations({ ...nok, state: 'finalised' });
    expect(await rowOf(base, a!)).toMatchObject({ finalised: true });
    await syncDeviations(nok);
    expect(await rowOf(base, a!)).toMatchObject({ finalised: false });
  });

  it('copies front page changes into every row', async () => {
    const base = sampleInspection();
    const [a] = itemIds(base);
    const nok = withResults(base, { [a!]: { status: 'NOK' } });
    await syncDeviations(nok);
    await syncDeviations({
      ...nok,
      front: { ...nok.front, serialNumber: 'SN-2', date: '2026-10-09' },
    });
    expect(await rowOf(base, a!)).toMatchObject({
      serialNumber: 'SN-2',
      inspectionDate: '2026-10-09',
    });
  });

  it('writes nothing when nothing changed; repairs rows changed or lost', async () => {
    const base = sampleInspection();
    const [a, b] = itemIds(base);
    const inspection = withResults(base, { [a!]: { status: 'NOK' }, [b!]: { status: 'NOK' } });
    await syncDeviations(inspection);
    const before = await rows();

    const submit = vi.spyOn(deviationsTable(), 'submitTransaction');
    await syncDeviations(inspection);
    expect(submit).not.toHaveBeenCalled();

    await deviationsTable().deleteEntity('RMMG', `${base.id}_${a}`);
    await deviationsTable().updateEntity({
      partitionKey: 'RMMG',
      rowKey: `${base.id}_${b}`,
      comment: 'edited by hand',
    });
    await syncDeviations(inspection);
    expect(submit).toHaveBeenCalledTimes(1);
    // The lost row comes back with a new createdAt; the edited one is put back as it was.
    expect(await rowOf(base, b!)).toEqual(before.find((row) => row.rowKey.endsWith(b!)));
    expect(await rowOf(base, a!)).toMatchObject({ itemId: a, comment: '' });
  });

  it('says a quality check’s rows are a quality check’s, with its title', async () => {
    const base = sampleInspection({
      kind: 'quality',
      number: 'QC-2026-0003',
      front: { ...sampleInspection().front, machineName: '', location: '' },
    });
    const check: Inspection = {
      ...base,
      templateSnapshot: { ...base.templateSnapshot, name: 'Quality check – Pre start up' },
    };
    const [a] = itemIds(check);
    await syncDeviations(withResults(check, { [a!]: { status: 'NOK', comment: 'Inward' } }));
    expect(await rowOf(check, a!)).toMatchObject({
      kind: 'quality',
      inspectionNumber: 'QC-2026-0003',
      checkName: 'Quality check – Pre start up',
      machineName: '',
      comment: 'Inward',
    });
  });

  it('gives a row written before quality checks its kind at the next save', async () => {
    const base = sampleInspection();
    const [a] = itemIds(base);
    const inspection = withResults(base, { [a!]: { status: 'NOK' } });
    await syncDeviations(inspection);
    const {
      partitionKey,
      rowKey,
      kind: _kind,
      checkName: _name,
      ...older
    } = (await rowOf(inspection, a!))!;
    await deviationsTable().upsertEntity({ partitionKey, rowKey, ...older }, 'Replace');
    expect(DeviationRowSchema.parse(older).kind).toBe('final');

    await syncDeviations(inspection);
    expect(await rowOf(inspection, a!)).toMatchObject({
      kind: 'final',
      checkName: base.templateSnapshot.name,
    });
  });

  it('sends more than 100 changes in batches of at most 100', async () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ id: newId(), text: `Check ${i + 1}` }));
    const sections: Section[] = [{ id: newId(), title: 'Long section', items }];
    const base = sampleInspection({}, draftTemplate({ status: 'published', sections }));
    const extras = Array.from({ length: 30 }, (_, i) => ({
      id: newId(),
      description: `Extra ${i + 1}`,
      severity: 'minor' as const,
    }));
    const allNok = Object.fromEntries(items.map((item) => [item.id, { status: 'NOK' as const }]));
    const submit = vi.spyOn(deviationsTable(), 'submitTransaction');

    await syncDeviations({ ...base, results: allNok, extraDeviations: extras });
    expect(submit.mock.calls.map(([actions]) => actions.length)).toEqual([100, 80]);
    expect(await rows()).toHaveLength(180);
    expect(await rowOf(base, items[149]!.id)).toMatchObject({ displayRef: '1.et' });

    // 140 rows back to OK and 25 extras removed: 165 deletes, and the 5 extras left take the
    // numbers after the 10 rows (D-11 to D-15): 5 upserts.
    submit.mockClear();
    const tenNok = Object.fromEntries(
      items.slice(0, 10).map((item) => [item.id, allNok[item.id]!]),
    );
    await syncDeviations({ ...base, results: tenNok, extraDeviations: extras.slice(0, 5) });
    expect(submit.mock.calls.map(([actions]) => actions.length)).toEqual([100, 70]);
    expect(await rows()).toHaveLength(15);
  });

  it("never touches another inspection's rows, even when its id starts the same", async () => {
    const template = draftTemplate({ status: 'published' });
    const nokAll = (inspection: Inspection) =>
      withResults(
        inspection,
        Object.fromEntries(itemIds(inspection).map((id) => [id, { status: 'NOK' as const }])),
      );
    // Neighbours of "Abc_…" in RowKey order: "Ab_…", "Abc0_…", "Abcz_…".
    const target = sampleInspection({ id: 'Abc' }, template);
    const neighbours = ['Ab', 'Abc0', 'Abcz', 'AbcAbc'].map((id) =>
      nokAll(sampleInspection({ id }, template)),
    );
    for (const inspection of [nokAll(target), ...neighbours]) await syncDeviations(inspection);
    const theirs = (await rows()).filter((row) => !row.rowKey.startsWith('Abc_'));
    expect(theirs).toHaveLength(12);

    await syncDeviations(target); // no deviations left
    expect(await rows()).toEqual(theirs);
  });

  it('keeps each model in its own partition', async () => {
    const mt = sampleInspection({}, draftTemplate({ status: 'published', modelCode: 'RMMT' }));
    const [a] = itemIds(mt);
    await syncDeviations(withResults(mt, { [a!]: { status: 'NOK' } }));
    expect(await rows('RMMG')).toEqual([]);
    expect(await rows('RMMT')).toEqual([expect.objectContaining({ modelCode: 'RMMT', itemId: a })]);
  });
});

describe('deleteDeviationRows', () => {
  it("deletes every row of one inspection, in batches, and no other inspection's", async () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ id: newId(), text: `Check ${i + 1}` }));
    const template = draftTemplate({
      status: 'published',
      sections: [{ id: newId(), title: 'Long section', items }],
    });
    const allNok = (inspection: Inspection) =>
      withResults(
        inspection,
        Object.fromEntries(itemIds(inspection).map((id) => [id, { status: 'NOK' as const }])),
      );
    // An id that starts the same: its rows stay.
    const target = allNok(sampleInspection({ id: 'Abc' }, template));
    const neighbour = allNok(sampleInspection({ id: 'Abc0' }, template));
    for (const inspection of [target, neighbour]) await syncDeviations(inspection);
    const submit = vi.spyOn(deviationsTable(), 'submitTransaction');

    await deleteDeviationRows('RMMG', target.id);
    expect(submit.mock.calls.map(([actions]) => actions.length)).toEqual([100, 20]);
    expect((await rows()).map((row) => row.inspectionId)).toEqual(
      Array.from({ length: 120 }, () => neighbour.id),
    );

    // Nothing left: nothing to send.
    submit.mockClear();
    await deleteDeviationRows('RMMG', target.id);
    expect(submit).not.toHaveBeenCalled();
  });
});
