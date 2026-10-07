import { ID_PATTERN, type ExtraDeviation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { newExtraDeviation, removeExtra, updateExtra } from './extras';

const a: ExtraDeviation = {
  id: 'Extr00000000000a',
  description: 'Paint damage',
  severity: 'minor',
};
const b: ExtraDeviation = {
  id: 'Extr00000000000b',
  description: 'Manual missing',
  comment: 'Ordered',
  resp: 'Docs',
  severity: 'major',
};

describe('newExtraDeviation', () => {
  it('starts empty, minor, with a fresh valid id', () => {
    const first = newExtraDeviation();
    expect(first).toEqual({
      id: expect.stringMatching(ID_PATTERN),
      description: '',
      severity: 'minor',
    });
    expect(newExtraDeviation().id).not.toBe(first.id);
  });
});

describe('updateExtra', () => {
  it('changes only the deviation with that id, keeping the others as they are', () => {
    const next = updateExtra([a, b], a.id, { description: 'Paint chipped', severity: 'critical' });
    expect(next[0]).toEqual({ ...a, description: 'Paint chipped', severity: 'critical' });
    expect(next[1]).toBe(b);
  });

  it('removes a comment or resp that was emptied instead of storing ""', () => {
    const [next] = updateExtra([b], b.id, { comment: '', resp: '' });
    expect(next).toEqual({ id: b.id, description: 'Manual missing', severity: 'major' });
    expect(next).not.toHaveProperty('comment');
    expect(next).not.toHaveProperty('resp');
  });
});

describe('removeExtra', () => {
  it('drops it and keeps the order of the rest', () => {
    expect(removeExtra([a, b], a.id)).toEqual([b]);
    expect(removeExtra([a, b], 'unknown0000000000')).toEqual([a, b]);
  });
});
