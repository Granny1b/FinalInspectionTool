import { describe, expect, it } from 'vitest';
import { respSuggestions } from './resp';

describe('respSuggestions', () => {
  it('merges the history with the names typed in this inspection, sorted', () => {
    expect(
      respSuggestions(['Mekanik', 'El-avdelningen'], {
        results: { Item000000000001: { status: 'NOK', resp: 'Lackering' }, Item000000000002: {} },
        extraDeviations: [
          { id: 'Extr000000000001', description: '', severity: 'minor', resp: 'Ägare' },
        ],
      }),
    ).toEqual(['El-avdelningen', 'Lackering', 'Mekanik', 'Ägare']);
  });

  it('trims, drops blanks and lists a name once, in the history’s spelling', () => {
    expect(
      respSuggestions(['Mekanik'], {
        results: {
          Item000000000001: { resp: ' mekanik ' },
          Item000000000002: { resp: '   ' },
          Item000000000003: { resp: 'Lars ' },
          Item000000000004: { resp: 'LARS' },
        },
        extraDeviations: [],
      }),
    ).toEqual(['Lars', 'Mekanik']);
  });

  it('works before the history has loaded', () => {
    expect(
      respSuggestions(undefined, {
        results: { Item000000000001: { resp: 'Mekanik' } },
        extraDeviations: [],
      }),
    ).toEqual(['Mekanik']);
  });
});
