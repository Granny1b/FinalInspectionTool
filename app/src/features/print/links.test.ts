import { describe, expect, it } from 'vitest';
import { inspectionPrintHref, parseDeviationsPerPage, parseMode } from './links';

describe('print links', () => {
  it('opens an inspection print, printing at once if asked', () => {
    expect(inspectionPrintHref('Insp000000000001', 'report', true)).toBe(
      '/inspections/Insp000000000001/print?mode=report&autoprint=1',
    );
    expect(inspectionPrintHref('Insp000000000001', 'blank')).toBe(
      '/inspections/Insp000000000001/print?mode=blank',
    );
  });

  it('accepts only the known modes and layouts from the address', () => {
    expect(parseMode('report')).toBe('report');
    expect(parseMode('Report')).toBeNull();
    expect(parseDeviationsPerPage('2')).toBe(2);
    expect(parseDeviationsPerPage('4')).toBe(4);
    for (const value of ['3', '04', '4.0', '', null]) {
      expect(parseDeviationsPerPage(value)).toBeNull();
    }
  });
});
