import type { InspectionSummary, MachineSummary, Template, TemplateSummary } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { buildHits, markWords, searchHits, type SearchData } from './hits';

const instruction: Template = {
  id: 'ins1',
  kind: 'assembly',
  name: 'HHV-3 24-Tools scheme',
  modelCode: 'HHV3',
  revision: 2,
  status: 'published',
  sections: [
    {
      id: 't1',
      title: 'Base',
      items: [
        {
          id: 's1',
          text: 'Mount Pan 80069',
          guide: { description: 'Tighten crosswise.', images: [] },
          assembly: {
            assyNumber: '82265',
            assyName: 'Base, HHV3',
            partNumbers: ['80069'],
            fasteners: [{ quantity: 4, designation: 'MC6S M10x25' }],
          },
        },
        {
          id: 's2',
          text: 'Lift in XYZ-unit',
          assembly: {
            assyNumber: '82265',
            documents: [
              { target: '\\\\SRV102\\Ritningsarkiv\\86265-00 XYZ-unit -Assy.pdf' },
              { label: 'Supplier manual', target: 'https://example.com/manual.pdf' },
            ],
          },
        },
      ],
    },
  ],
  updatedAt: '2026-11-24T08:00:00.000Z',
  updatedBy: 'a@modig.se',
};

const summary = (overrides: Partial<TemplateSummary>): TemplateSummary => ({
  id: 'x',
  kind: 'final',
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  publishedRevision: 1,
  publishedName: null,
  publishedModelCode: null,
  draftRevision: 2,
  hasUnpublishedChanges: false,
  itemCount: 0,
  updatedAt: '2026-11-24T08:00:00.000Z',
  updatedBy: 'a@modig.se',
  ...overrides,
});

const data = (overrides: Partial<SearchData> = {}): SearchData => ({
  machines: [
    {
      id: 'm1',
      machineName: 'Magellan#1',
      serialNumber: '1001',
      modelCode: 'HHV3',
    } as MachineSummary,
  ],
  inspections: [
    {
      id: 'i1',
      kind: 'quality',
      number: 'QC-2026-0005',
      machineName: 'Magellan#1',
      serialNumber: '1001',
      modelCode: 'HHV3',
      date: '2026-11-09',
      state: 'in_progress',
      templateName: 'Quality check – Pre start up',
    } as InspectionSummary,
    {
      id: 'i2',
      kind: 'final',
      number: '',
      state: 'not_started',
      machineName: 'Magellan#1',
    } as InspectionSummary,
  ],
  templates: [
    summary({ id: 'ins1', kind: 'assembly', name: 'HHV-3 24-Tools scheme', modelCode: 'HHV3' }),
    summary({ id: 'draft', kind: 'assembly', name: 'Unfinished', publishedRevision: null }),
    summary({ id: 'f1' }),
  ],
  instructions: [instruction],
  models: [{ code: 'HHV3', name: 'HHV 3' }],
  isAdmin: false,
  onMachine: new Map(),
  ...overrides,
});

const find = (query: string, overrides?: Partial<SearchData>) =>
  searchHits(buildHits(data(overrides)), query);
const titles = (query: string, overrides?: Partial<SearchData>) =>
  find(query, overrides).groups.map((group) => [group.group, group.hits.map((hit) => hit.title)]);

describe('the search', () => {
  it('finds a machine by its id, serial number or model', () => {
    expect(titles('magellan')[0]).toEqual(['machines', ['Magellan#1']]);
    expect(find('1001').groups[0]?.hits[0]?.href).toBe('/machines/m1');
    expect(titles('hhv 3')[0]?.[0]).toBe('machines');
  });

  it('finds an assy number once per instruction, with its steps counted', () => {
    const [group] = find('82265').groups;
    expect(group?.group).toBe('parts');
    expect(group?.hits).toEqual([
      expect.objectContaining({
        title: 'Assy 82265 · Base, HHV3',
        detail: '2 steps · HHV-3 24-Tools scheme',
        href: '/assembly/ins1/revisions/2?q=82265',
      }),
    ]);
    // By its name too, and a part number as a part.
    expect(titles('base hhv3')).toContainEqual(['parts', ['Assy 82265 · Base, HHV3']]);
    expect(titles('80069')).toContainEqual(['parts', ['Part 80069']]);
  });

  it('finds a step by its text, instructions or bolts, and leads to that step', () => {
    const steps = (query: string) => find(query).groups.find((group) => group.group === 'steps');
    expect(steps('lift xyz')?.hits[0]).toMatchObject({
      title: '1.2 Lift in XYZ-unit',
      detail: 'HHV-3 24-Tools scheme · Base',
      href: '/assembly/ins1/revisions/2#row-s2',
    });
    expect(steps('crosswise')?.hits[0]?.title).toBe('1.1 Mount Pan 80069');
    expect(steps('m10x25')?.hits[0]?.title).toBe('1.1 Mount Pan 80069');
  });

  it('finds a drawing by its file name, with its path to copy; a web link has none', () => {
    const documents = find('assy.pdf').groups.find((group) => group.group === 'documents');
    expect(documents?.hits[0]).toMatchObject({
      title: '86265-00 XYZ-unit -Assy.pdf',
      detail: 'Step 1.2 · HHV-3 24-Tools scheme',
      href: '/assembly/ins1/revisions/2#row-s2',
      copy: '\\\\SRV102\\Ritningsarkiv\\86265-00 XYZ-unit -Assy.pdf',
    });
    const manual = find('supplier manual').groups.find((group) => group.group === 'documents');
    expect(manual?.hits[0]?.copy).toBeUndefined();
  });

  it('leads to the machine an instruction was last worked on', () => {
    const onMachine = new Map([
      ['ins1', { path: '/machines/m1/assembly/a1', machineName: 'Magellan#1' }],
    ]);
    const step = find('lift xyz', { onMachine }).groups.find((group) => group.group === 'steps');
    expect(step?.hits[0]).toMatchObject({
      href: '/machines/m1/assembly/a1#row-s2',
      detail: 'HHV-3 24-Tools scheme · on Magellan#1 · Base',
    });
  });

  it('finds a check by its number first, and leaves out those not started', () => {
    expect(find('qc-2026-0005').groups[0]).toMatchObject({
      group: 'checks',
      hits: [{ title: 'QC-2026-0005', href: '/quality-checks/i1' }],
    });
    const checks = find('magellan').groups.find((group) => group.group === 'checks');
    expect(checks?.total).toBe(1);
  });

  it('shows drafts never published to admins only', () => {
    expect(find('unfinished').total).toBe(0);
    expect(titles('unfinished', { isAdmin: true })).toEqual([['instructions', ['Unfinished']]]);
  });

  it('needs every word, keeps the groups in their order, and finds nothing for nothing', () => {
    expect(find('magellan gasket').total).toBe(0);
    expect(find('   ').groups).toEqual([]);
    expect(find('hhv').groups.map((group) => group.group)).toEqual([
      'machines',
      'parts',
      'instructions',
      'checks',
    ]);
  });
});

describe('markWords', () => {
  it('marks the words found, whatever their case', () => {
    expect(markWords('Assy 82265 · Base', ['82265', 'base'])).toEqual([
      { text: 'Assy ', hit: false },
      { text: '82265', hit: true },
      { text: ' · ', hit: false },
      { text: 'Base', hit: true },
    ]);
    expect(markWords('a.b', ['.'])).toEqual([
      { text: 'a', hit: false },
      { text: '.', hit: true },
      { text: 'b', hit: false },
    ]);
  });
});
