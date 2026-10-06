import { describe, expect, it } from 'vitest';
import {
  deviationNumber,
  indexItems,
  refWithText,
  rowLetter,
  rowRef,
  sectionNumber,
} from './numbering';
import type { Section } from './schemas';

describe('rowLetter', () => {
  it('letters the first 26 rows a–z', () => {
    const letters = Array.from({ length: 26 }, (_, i) => rowLetter(i)).join('');
    expect(letters).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('continues with aa, ab… after z (more than 26 rows)', () => {
    expect(rowLetter(26)).toBe('aa');
    expect(rowLetter(27)).toBe('ab');
    expect(rowLetter(51)).toBe('az');
    expect(rowLetter(52)).toBe('ba');
    expect(rowLetter(701)).toBe('zz');
    expect(rowLetter(702)).toBe('aaa');
  });

  it('is unique and strictly increasing in (length, lexicographic) order', () => {
    const seen = new Set<string>();
    let prev = '';
    for (let i = 0; i < 2000; i++) {
      const l = rowLetter(i);
      expect(seen.has(l)).toBe(false);
      seen.add(l);
      if (prev) {
        const longer = l.length > prev.length;
        expect(longer || (l.length === prev.length && l > prev)).toBe(true);
      }
      prev = l;
    }
  });

  it('rejects negative and fractional indexes', () => {
    expect(() => rowLetter(-1)).toThrow(RangeError);
    expect(() => rowLetter(1.5)).toThrow(RangeError);
  });
});

describe('refs', () => {
  it('derives section numbers and row refs from position', () => {
    expect(sectionNumber(0)).toBe(1);
    expect(rowRef(2, 2)).toBe('3.c');
    expect(rowRef(0, 26)).toBe('1.aa');
  });

  it('formats deviation numbers D-01…', () => {
    expect(deviationNumber(0)).toBe('D-01');
    expect(deviationNumber(8)).toBe('D-09');
    expect(deviationNumber(9)).toBe('D-10');
    expect(deviationNumber(99)).toBe('D-100');
  });

  it('joins ref and text for references', () => {
    expect(refWithText('3.c', 'Main Cabinet - Verify labeling')).toBe(
      '3.c Main Cabinet - Verify labeling',
    );
    expect(refWithText('3.c', '')).toBe('3.c');
  });
});

describe('indexItems', () => {
  const sections: Section[] = [
    {
      id: 's1',
      title: 'Loading area',
      items: [
        { id: 'i1', text: 'A' },
        { id: 'i2', text: 'B' },
      ],
    },
    { id: 's2', title: 'Empty', items: [] },
    { id: 's3', title: 'Electrical Cabinets', items: [{ id: 'i3', text: 'C' }] },
  ];

  it('lists items in display order with refs derived from position', () => {
    expect(indexItems(sections).map((i) => [i.itemId, i.ref, i.sectionTitle])).toEqual([
      ['i1', '1.a', 'Loading area'],
      ['i2', '1.b', 'Loading area'],
      ['i3', '3.a', 'Electrical Cabinets'],
    ]);
  });

  it('renumbers when items move but keeps the stable item id', () => {
    const moved: Section[] = [
      { ...sections[0]!, items: [sections[0]!.items[1]!] },
      sections[1]!,
      { ...sections[2]!, items: [sections[0]!.items[0]!, ...sections[2]!.items] },
    ];
    const i1 = indexItems(moved).find((i) => i.itemId === 'i1');
    expect(i1?.ref).toBe('3.a');
  });
});
