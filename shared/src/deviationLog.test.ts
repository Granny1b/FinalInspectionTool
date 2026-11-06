import { describe, expect, it } from 'vitest';
import {
  applyFollowUp,
  daysBetween,
  deviationDescription,
  deviationLogId,
  deviationLogParams,
  DeviationLogRowSchema,
  FollowUpRequestSchema,
  FollowUpSchema,
  isOverdue,
  logEntries,
  matchesDeviationLog,
  NOT_SET,
  parseDeviationLogQuery,
  swedishDay,
  type DeviationLogEntry,
  type DeviationLogQuery,
  type DeviationLogRow,
  type FollowUp,
} from './deviationLog';

const by = {
  today: '2026-11-06',
  name: 'Sam Andersson',
  email: 'sam.andersson@modig.se',
  now: '2026-11-06T09:30:00.000Z',
};

const closed: FollowUp = {
  status: 'closed',
  action: 'New labels',
  closedOn: '2026-10-20',
  closedBy: 'Anna Andersson',
  updatedAt: '2026-10-20T12:00:00.000Z',
  updatedBy: 'anna.andersson@modig.se',
};

describe('follow-up contract', () => {
  it('reads a request to close or reopen, trimming what is typed', () => {
    expect(
      FollowUpRequestSchema.parse({
        status: 'closed',
        action: ' Relabelled ',
        closedOn: '2026-11-05',
        closedBy: ' Anna ',
      }),
    ).toEqual({ status: 'closed', action: 'Relabelled', closedOn: '2026-11-05', closedBy: 'Anna' });
    expect(FollowUpRequestSchema.parse({ status: 'closed' })).toEqual({ status: 'closed' });
    // Reopening has no day or who: they are dropped.
    expect(FollowUpRequestSchema.parse({ status: 'open', closedOn: '2026-11-05' })).toEqual({
      status: 'open',
    });
  });

  it('refuses anything else', () => {
    for (const request of [
      {},
      { status: 'done' },
      { status: 'closed', closedOn: '2026-13-01' },
      { status: 'closed', closedOn: '1999-12-31' },
      { status: 'closed', action: 'x'.repeat(2001) },
      { status: 'closed', closedBy: 'x'.repeat(201) },
    ]) {
      expect(FollowUpRequestSchema.safeParse(request).success).toBe(false);
    }
  });

  it('stores a follow-up with defaults for what an older one lacks', () => {
    expect(
      FollowUpSchema.parse({ status: 'open', updatedAt: by.now, updatedBy: by.email }),
    ).toEqual({
      status: 'open',
      action: '',
      closedOn: '',
      closedBy: '',
      updatedAt: by.now,
      updatedBy: by.email,
    });
  });
});

describe('applyFollowUp', () => {
  it('closes with today and the signed-in person unless told otherwise', () => {
    expect(applyFollowUp(undefined, { status: 'closed' }, by)).toEqual({
      status: 'closed',
      action: '',
      closedOn: '2026-11-06',
      closedBy: 'Sam Andersson',
      updatedAt: by.now,
      updatedBy: by.email,
    });
    expect(
      applyFollowUp(
        undefined,
        { status: 'closed', action: 'Done', closedOn: '2026-11-01', closedBy: 'Anna' },
        by,
      ),
    ).toMatchObject({ action: 'Done', closedOn: '2026-11-01', closedBy: 'Anna' });
  });

  it('keeps an earlier close’s day and who when only the action changes', () => {
    expect(applyFollowUp(closed, { status: 'closed', action: 'Repainted' }, by)).toMatchObject({
      action: 'Repainted',
      closedOn: '2026-10-20',
      closedBy: 'Anna Andersson',
      updatedBy: by.email,
    });
    // An empty who is no who.
    expect(applyFollowUp(closed, { status: 'closed', closedBy: '' }, by).closedBy).toBe(
      'Anna Andersson',
    );
  });

  it('reopens with the action kept and the day and who cleared', () => {
    expect(applyFollowUp(closed, { status: 'open' }, by)).toEqual({
      status: 'open',
      action: 'New labels',
      closedOn: '',
      closedBy: '',
      updatedAt: by.now,
      updatedBy: by.email,
    });
    // Closing it again is a new close: today.
    const reopened = applyFollowUp(closed, { status: 'open' }, by);
    expect(applyFollowUp(reopened, { status: 'closed' }, by)).toMatchObject({
      closedOn: '2026-11-06',
      closedBy: 'Sam Andersson',
      action: 'New labels',
    });
  });
});

const ROW: DeviationLogRow = {
  kind: 'final',
  inspectionId: 'insp1',
  inspectionNumber: 'FI-2026-0042',
  serialNumber: 'MG-0001',
  machineName: 'Magellan#1',
  modelCode: 'RMMG',
  templateId: 'tplMG',
  templateRevision: 2,
  itemId: 'item1',
  sectionTitle: 'Electrical cabinets',
  displayRef: '2.c',
  checkpointText: 'SMC filter - Cables labelled',
  comment: 'Electrical cables not labelled',
  resp: 'Electrical',
  severity: 'minor',
  category: 'Markings & labels',
  inspectionDate: '2026-10-07',
  finalised: true,
  createdAt: '2026-10-07T22:30:00.000Z',
  checkName: 'Final inspection – RigiMill MG',
  deviationNumber: 'D-03',
  status: 'open',
  action: '',
  closedOn: '',
  closedBy: '',
};

describe('the table’s rows in the log', () => {
  it('reads a row written before the log as open, without a number', () => {
    const {
      kind: _kind,
      checkName: _name,
      deviationNumber: _number,
      status: _status,
      action: _action,
      closedOn: _on,
      closedBy: _by,
      ...older
    } = ROW;
    expect(DeviationLogRowSchema.parse(older)).toMatchObject({
      kind: 'final',
      deviationNumber: '',
      status: 'open',
      action: '',
      closedOn: '',
      closedBy: '',
    });
  });

  it('gives each entry its key and the day it was found, in Swedish time', () => {
    const [entry] = logEntries([{ ...ROW, rowKey: 'insp1_item1' }]);
    // 22:30 UTC on 7 October is 00:30 on the 8th in Sweden.
    expect(entry).toMatchObject({ key: 'item1', foundOn: '2026-10-08', deviationNumber: 'D-03' });
    expect('rowKey' in entry!).toBe(false);
    expect(swedishDay('2026-06-30T22:30:00.000Z')).toBe('2026-07-01');
  });

  it('numbers an older inspection’s rows as its Deviations tab: rows in order, then extras', () => {
    const older = (rowKey: string, patch: Partial<DeviationLogRow>) => ({
      ...ROW,
      deviationNumber: '',
      rowKey,
      ...patch,
    });
    const entries = logEntries([
      older('insp1_x2', { itemId: '', displayRef: '—', createdAt: '2026-10-07T10:00:00.000Z' }),
      older('insp1_b', { displayRef: '10.a' }),
      older('insp1_x1', { itemId: '', displayRef: '—', createdAt: '2026-10-07T09:00:00.000Z' }),
      older('insp1_a', { displayRef: '2.b' }),
      // Another inspection's numbered row is left as it is.
      { ...ROW, inspectionId: 'insp2', rowKey: 'insp2_c', deviationNumber: 'D-07' },
    ]);
    expect(entries.map((entry) => `${entry.key} ${entry.deviationNumber}`)).toEqual([
      'x2 D-04',
      'b D-02',
      'x1 D-03',
      'a D-01',
      'c D-07',
    ]);
  });

  it('shows the deviation’s ID and description as the log does', () => {
    expect(deviationLogId(ROW)).toBe('FI-2026-0042 · D-03');
    expect(deviationDescription(ROW)).toBe('2.c SMC filter - Cables labelled');
    expect(deviationDescription({ ...ROW, itemId: '', displayRef: '—' })).toBe(
      'SMC filter - Cables labelled',
    );
  });

  it('counts an open deviation found more than 30 days ago as overdue', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(isOverdue({ status: 'open', foundOn: '2026-10-07' }, '2026-11-06')).toBe(false);
    expect(isOverdue({ status: 'open', foundOn: '2026-10-06' }, '2026-11-06')).toBe(true);
    expect(isOverdue({ status: 'closed', foundOn: '2026-01-01' }, '2026-11-06')).toBe(false);
  });
});

/** A query string's values, as URLSearchParams would give them (only `get` is used). */
function params(search: string) {
  const values = new Map(
    search
      .split('&')
      .filter(Boolean)
      .map((pair) => pair.split('=').map((part) => decodeURIComponent(part)) as [string, string]),
  );
  return { get: (name: string) => values.get(name) ?? null };
}

const queryString = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');

describe('filters', () => {
  const parse = (search: string) => {
    const result = parseDeviationLogQuery(params(search));
    if (!result.success) throw result.error;
    return result.data;
  };

  it('reads the address: open final inspection deviations by default', () => {
    expect(parse('')).toEqual({ kind: 'final', status: 'open' });
    expect(
      parse('kind=quality&status=all&model=RMMG&resp=Electrical&category=-&q=%20magellan%20&x=1'),
    ).toEqual({
      kind: 'quality',
      status: 'all',
      model: 'RMMG',
      resp: 'Electrical',
      category: NOT_SET,
      q: 'magellan',
    });
    // Empty values are not filters.
    expect(parse('status=&model=&q=%20')).toEqual({ kind: 'final', status: 'open' });
    for (const bad of ['status=done', 'kind=other', 'model=RM%20MG']) {
      expect(parseDeviationLogQuery(params(bad)).success).toBe(false);
    }
  });

  it('writes only the filters in use', () => {
    const query: DeviationLogQuery = { kind: 'quality', status: 'open', resp: 'Electrical' };
    expect(deviationLogParams(query)).toEqual({ kind: 'quality', resp: 'Electrical' });
    expect(deviationLogParams({ ...query, status: 'all', q: ' x ' }, { withKind: false })).toEqual({
      status: 'all',
      resp: 'Electrical',
      q: 'x',
    });
    expect(parse(queryString(deviationLogParams(query)))).toEqual(query);
  });

  const entry: DeviationLogEntry = { ...ROW, key: 'item1', foundOn: '2026-10-08' };
  const all: DeviationLogQuery = { kind: 'final', status: 'all' };

  it('matches by kind, status, model, responsible and category', () => {
    expect(matchesDeviationLog(entry, all)).toBe(true);
    expect(matchesDeviationLog(entry, { ...all, kind: 'quality' })).toBe(false);
    expect(matchesDeviationLog(entry, { ...all, status: 'open' })).toBe(true);
    expect(matchesDeviationLog(entry, { ...all, status: 'closed' })).toBe(false);
    expect(matchesDeviationLog(entry, { ...all, model: 'RMMT' })).toBe(false);
    // Responsible and category ignore case and spaces; NOT_SET is none.
    expect(matchesDeviationLog(entry, { ...all, resp: ' electrical ' })).toBe(true);
    expect(matchesDeviationLog(entry, { ...all, resp: NOT_SET })).toBe(false);
    expect(matchesDeviationLog({ ...entry, resp: ' ' }, { ...all, resp: NOT_SET })).toBe(true);
    expect(matchesDeviationLog(entry, { ...all, category: 'MARKINGS & LABELS' })).toBe(true);
    expect(matchesDeviationLog(entry, { ...all, category: 'Safety' })).toBe(false);
  });

  it('finds every word anywhere: machine, ID, text, comment, action', () => {
    const search = (q: string) => matchesDeviationLog(entry, { ...all, q });
    expect(search('magellan d-03')).toBe(true);
    expect(search('FI-2026-0042 · D-03')).toBe(true);
    expect(search('mg-0001 smc')).toBe(true);
    expect(search('not labelled')).toBe(true);
    expect(search('magellan boeing')).toBe(false);
    expect(matchesDeviationLog({ ...entry, action: 'Relabelled' }, { ...all, q: 'relab' })).toBe(
      true,
    );
  });
});
