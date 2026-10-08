import { describe, expect, it } from 'vitest';
import { addNames, MAX_NAME_LENGTH, splitNames } from './participants';

describe('splitNames', () => {
  it('splits a pasted list on commas, semicolons and line breaks', () => {
    expect(splitNames('Anna Berg, Erik Lind;Lars\nMaria\r\nPer')).toEqual([
      'Anna Berg',
      'Erik Lind',
      'Lars',
      'Maria',
      'Per',
    ]);
  });

  it('tidies spaces and drops empty entries', () => {
    expect(splitNames('  Anna   Berg ,, ;  ')).toEqual(['Anna Berg']);
    expect(splitNames('   ')).toEqual([]);
  });

  it('cuts a name at the length the API accepts', () => {
    expect(splitNames('x'.repeat(MAX_NAME_LENGTH + 5))[0]).toHaveLength(MAX_NAME_LENGTH);
  });
});

describe('addNames', () => {
  it('appends new names in order', () => {
    expect(addNames(['Anna'], ['Erik', 'Lars'])).toEqual(['Anna', 'Erik', 'Lars']);
  });

  it('skips names already listed or repeated, ignoring case (Swedish letters too)', () => {
    expect(addNames(['Åsa Öberg'], ['åsa öberg', 'Erik', 'ERIK'])).toEqual(['Åsa Öberg', 'Erik']);
  });

  it('returns the same array when nothing is new', () => {
    const list = ['Anna'];
    expect(addNames(list, ['anna'])).toBe(list);
    expect(addNames(list, [])).toBe(list);
  });
});
