import type { ChangeRequest } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { matchesChangeRequest } from './search';

const request: ChangeRequest = {
  id: 'r1',
  templateId: 't1',
  itemId: 'i1',
  templateName: 'HHV-3 24-Tools scheme',
  modelCode: 'HHV3',
  templateRevision: 2,
  taskTitle: 'OP10 - Assembly Bed',
  stepRef: '1.3',
  stepText: 'Mount Base tend 80065 & 82053',
  machineRef: 'm1',
  machineName: 'Magellan#1',
  message: 'The bolt list misses the washers RB M8.',
  createdAt: '2026-11-24T07:27:00.000Z',
  createdBy: 'sam.andersson@modig.se',
  status: 'fixed',
  fixedAt: '2026-12-02T09:00:00.000Z',
  fixedBy: 'anna@modig.se',
  resolution: 'Washers added in rev 3.',
};
const names = {
  person: (email: string) => (email.startsWith('sam') ? 'Sam Andersson' : 'Anna Åberg'),
  model: (code: string) => (code === 'HHV3' ? 'HHV 3' : code),
};
const found = (query: string) => matchesChangeRequest(request, query, names);

describe('matchesChangeRequest', () => {
  it('finds a request by any of its texts, whatever the case', () => {
    for (const query of [
      '',
      'washers',
      'WASHERS rb m8',
      'rev 3',
      '80065',
      '1.3',
      'assembly bed',
      '24-tools',
      'hhv 3',
      'magellan#1',
      'sam andersson',
      'åberg',
      'ÅBERG',
      '2026-11-24',
      '2026-12',
    ]) {
      expect(found(query), query).toBe(true);
    }
  });

  it('needs every word, and finds nothing that is not there', () => {
    expect(found('washers gasket')).toBe(false);
    expect(found('rigimill')).toBe(false);
  });
});
