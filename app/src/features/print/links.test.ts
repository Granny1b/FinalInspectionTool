import { describe, expect, it } from 'vitest';
import {
  inspectionPrintHref,
  parseAppendix,
  parseDeviationsPerPage,
  parseMode,
  parseQualityMode,
  printPath,
  qualityCheckPrintHref,
} from './links';

describe('print links', () => {
  it('opens an inspection print, printing at once if asked', () => {
    expect(inspectionPrintHref('Insp000000000001', 'report', true)).toBe(
      '/inspections/Insp000000000001/print?mode=report&autoprint=1',
    );
    expect(inspectionPrintHref('Insp000000000001', 'blank')).toBe(
      '/inspections/Insp000000000001/print?mode=blank',
    );
  });

  it('opens a quality check print at its own address, with its layout if one was picked', () => {
    expect(qualityCheckPrintHref('Insp000000000002', { mode: 'report' }, true)).toBe(
      '/quality-checks/Insp000000000002/print?mode=report&autoprint=1',
    );
    expect(
      qualityCheckPrintHref('Insp000000000002', { mode: 'deviations', deviationsPerPage: 4 }),
    ).toBe('/quality-checks/Insp000000000002/print?mode=deviations&deviationsPerPage=4');
  });

  it('knows each kind’s print address, to send the other kind there', () => {
    expect(printPath('final', 'Insp000000000001')).toBe('/inspections/Insp000000000001/print');
    expect(printPath('quality', 'Insp000000000002')).toBe('/quality-checks/Insp000000000002/print');
  });

  it('accepts only the known modes and layouts from the address', () => {
    expect(parseMode('report')).toBe('report');
    expect(parseMode('Report')).toBeNull();
    expect(parseMode('deviations')).toBeNull();
    expect(parseQualityMode('report')).toBe('report');
    expect(parseQualityMode('deviations')).toBe('deviations');
    expect(parseQualityMode('instructions')).toBe('instructions');
    // A final inspection's blank checklist is no quality check mode: the report is printed.
    expect(parseQualityMode('blank')).toBeNull();
    expect(parseQualityMode(null)).toBeNull();
    expect(parseDeviationsPerPage('2')).toBe(2);
    expect(parseDeviationsPerPage('4')).toBe(4);
    for (const value of ['3', '04', '4.0', '', null]) {
      expect(parseDeviationsPerPage(value)).toBeNull();
    }
  });

  it('includes the reference images only for appendix=1', () => {
    expect(parseAppendix('1')).toBe(true);
    for (const value of ['0', 'true', 'yes', '', null]) {
      expect(parseAppendix(value)).toBe(false);
    }
  });
});
