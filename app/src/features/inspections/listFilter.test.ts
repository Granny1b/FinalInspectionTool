import type { InspectionSummary } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  filterFromParams,
  filterInspections,
  filterToParams,
  isFiltered,
  type InspectionFilter,
} from './listFilter';

function summary(patch: Partial<InspectionSummary>): InspectionSummary {
  return {
    id: 'Insp000000000001',
    number: 'FI-2026-0001',
    machineName: 'RigiMill MG',
    serialNumber: '1042-7',
    modelCode: 'RMMG',
    date: '2026-10-07',
    state: 'in_progress',
    nokCount: 0,
    filled: 0,
    total: 90,
    updatedAt: '2026-10-07T08:00:00.000Z',
    ...patch,
  };
}

const list = [
  summary({ id: 'A000000000000003', number: 'FI-2026-0003', machineName: 'Mill-Ex för Volvo' }),
  summary({
    id: 'A000000000000002',
    number: 'FI-2026-0002',
    machineName: 'HHV3 DUO',
    serialNumber: 'H-77',
    modelCode: 'HHVDUO',
    state: 'finalised',
  }),
  summary({ id: 'A000000000000001', number: 'FI-2026-0001' }),
];
const ids = (found: InspectionSummary[]) => found.map((inspection) => inspection.id);
const all: InspectionFilter = { query: '', model: '', state: '' };

describe('filterInspections', () => {
  it('keeps everything, in the given order, without filters', () => {
    expect(ids(filterInspections(list, all))).toEqual(ids(list));
  });

  it('searches number, machine and serial, ignoring case', () => {
    expect(ids(filterInspections(list, { ...all, query: 'fi-2026-0002' }))).toEqual([
      'A000000000000002',
    ]);
    expect(ids(filterInspections(list, { ...all, query: 'h-77' }))).toEqual(['A000000000000002']);
    expect(ids(filterInspections(list, { ...all, query: 'RIGIMILL' }))).toEqual([
      'A000000000000001',
    ]);
  });

  it('needs every word, each anywhere ("rigimill 1042")', () => {
    expect(ids(filterInspections(list, { ...all, query: '  rigimill   1042 ' }))).toEqual([
      'A000000000000001',
    ]);
    expect(filterInspections(list, { ...all, query: 'rigimill H-77' })).toEqual([]);
  });

  it('matches Swedish letters as typed, in either case', () => {
    expect(ids(filterInspections(list, { ...all, query: 'FÖR' }))).toEqual(['A000000000000003']);
    expect(filterInspections(list, { ...all, query: 'for' })).toEqual([]);
  });

  it('filters by model and state, combined with the search', () => {
    expect(ids(filterInspections(list, { ...all, model: 'HHVDUO' }))).toEqual(['A000000000000002']);
    expect(ids(filterInspections(list, { ...all, state: 'in_progress' }))).toEqual([
      'A000000000000003',
      'A000000000000001',
    ]);
    expect(filterInspections(list, { query: 'mill', model: 'HHVDUO', state: '' })).toEqual([]);
  });
});

describe('filter in the URL', () => {
  it('round-trips, leaving out what is not in use', () => {
    const filter: InspectionFilter = { query: 'rigi 10', model: 'RMMG', state: 'finalised' };
    const params = filterToParams(filter);
    expect(params.toString()).toBe('q=rigi+10&model=RMMG&state=finalised');
    expect(filterFromParams(params)).toEqual(filter);
    expect(filterToParams(all).toString()).toBe('');
  });

  it('ignores an unknown state instead of showing nothing', () => {
    expect(filterFromParams(new URLSearchParams('state=archived')).state).toBe('');
  });

  it('knows whether anything is filtered (blank search counts as none)', () => {
    expect(isFiltered(all)).toBe(false);
    expect(isFiltered({ ...all, query: '   ' })).toBe(false);
    expect(isFiltered({ ...all, state: 'finalised' })).toBe(true);
  });
});
