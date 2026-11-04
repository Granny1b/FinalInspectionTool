import { describe, expect, it } from 'vitest';
import { nameSuggestions, personName } from './usePeople';

const directory = [
  { email: 'sam.andersson@modig.se', name: 'Sam Andersson' },
  { email: 'asa.oberg@modig.se', name: 'Åsa Öberg' },
  { email: 'erik.lund@modig.se', name: 'Erik Lund' },
];

describe('personName', () => {
  it('is the name on the list for a stored email', () => {
    expect(personName(directory, 'sam.andersson@modig.se')).toBe('Sam Andersson');
  });

  it('matches emails however they were stored', () => {
    expect(personName(directory, ' Sam.Andersson@Modig.se ')).toBe('Sam Andersson');
  });

  it('shows the stored value for someone not on the list, or before the list has loaded', () => {
    expect(personName(directory, 'boss@modig.se')).toBe('boss@modig.se');
    expect(personName(directory, 'seed')).toBe('seed');
    expect(personName(undefined, 'sam.andersson@modig.se')).toBe('sam.andersson@modig.se');
  });
});

describe('nameSuggestions', () => {
  it('lists everyone A–Z, the Swedish way (Å after Z)', () => {
    expect(nameSuggestions(directory, [])).toEqual(['Erik Lund', 'Sam Andersson', 'Åsa Öberg']);
  });

  it('leaves out the names already added, ignoring case', () => {
    expect(nameSuggestions(directory, ['sam andersson', 'Guest'])).toEqual([
      'Erik Lund',
      'Åsa Öberg',
    ]);
  });

  it('suggests a name shared by two people once', () => {
    const twice = [...directory, { email: 'erik.lund2@modig.se', name: 'erik lund' }];
    expect(nameSuggestions(twice, [])).toEqual(['Erik Lund', 'Sam Andersson', 'Åsa Öberg']);
  });

  it('is empty before the list has loaded', () => {
    expect(nameSuggestions(undefined, [])).toEqual([]);
  });
});
