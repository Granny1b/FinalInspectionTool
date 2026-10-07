import type { Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  rowsWithoutStatus,
  withRemainingOk,
  withSeverity,
  withStatus,
  withText,
  type Results,
} from './results';

const section: Section = {
  id: 'sA',
  title: 'Loading area',
  items: [
    { id: 'a1', text: 'Lifting columns - Marked screws' },
    { id: 'a2', text: 'Light curtains - Correct height' },
    { id: 'a3', text: 'Pallet mover - Chains slack' },
    { id: 'a4', text: 'Doors - Interlocks' },
  ],
};

describe('withStatus', () => {
  it('sets a status on a row without a result', () => {
    expect(withStatus({}, 'a1', 'OK')).toEqual({ a1: { status: 'OK' } });
  });

  it('keeps the comment, resp and photos when the status changes', () => {
    const results: Results = { a1: { status: 'OK', comment: 'Re-checked', resp: 'Elektro' } };
    expect(withStatus(results, 'a1', 'NA')).toEqual({
      a1: { status: 'NA', comment: 'Re-checked', resp: 'Elektro' },
    });
    expect(withStatus({ a1: { photoIds: ['p1'] } }, 'a1', 'OK')).toEqual({
      a1: { status: 'OK', photoIds: ['p1'] },
    });
  });

  it('drops the severity when a row leaves NOK', () => {
    const results: Results = { a1: { status: 'NOK', severity: 'major', comment: 'Loose' } };
    expect(withStatus(results, 'a1', 'OK')).toEqual({ a1: { status: 'OK', comment: 'Loose' } });
    expect(withStatus(results, 'a1', null)).toEqual({ a1: { comment: 'Loose' } });
  });

  it('keeps a severity a row already had when it becomes NOK', () => {
    expect(withStatus({ a1: { severity: 'critical' } }, 'a1', 'NOK')).toEqual({
      a1: { status: 'NOK', severity: 'critical' },
    });
  });

  it('clears a status, and removes a row left empty', () => {
    expect(withStatus({ a1: { status: 'OK' }, a2: { status: 'NOK' } }, 'a1', null)).toEqual({
      a2: { status: 'NOK' },
    });
    expect(withStatus({ a1: { status: 'NOK', severity: 'minor' } }, 'a1', null)).toEqual({});
  });

  it('returns the same object when nothing changes', () => {
    const results: Results = { a1: { status: 'OK' } };
    expect(withStatus(results, 'a1', 'OK')).toBe(results);
    expect(withStatus(results, 'a2', null)).toBe(results);
  });

  it('keeps the other rows’ objects, so their memoised rows skip re-rendering', () => {
    const results: Results = { a1: { status: 'OK' }, a2: { status: 'NOK' } };
    const next = withStatus(results, 'a2', 'OK');
    expect(next.a1).toBe(results.a1);
    expect(results).toEqual({ a1: { status: 'OK' }, a2: { status: 'NOK' } });
  });
});

describe('withText', () => {
  it('sets a comment or resp exactly as typed', () => {
    expect(withText({}, 'a1', 'comment', 'Screw  missing ')).toEqual({
      a1: { comment: 'Screw  missing ' },
    });
    expect(withText({ a1: { status: 'NOK' } }, 'a1', 'resp', 'Elektro')).toEqual({
      a1: { status: 'NOK', resp: 'Elektro' },
    });
  });

  it('removes an emptied field, and a row left empty', () => {
    expect(withText({ a1: { status: 'OK', comment: 'x' } }, 'a1', 'comment', '')).toEqual({
      a1: { status: 'OK' },
    });
    expect(withText({ a1: { resp: 'Mek' } }, 'a1', 'resp', '')).toEqual({});
  });

  it('returns the same object when nothing changes', () => {
    const results: Results = { a1: { comment: 'x' } };
    expect(withText(results, 'a1', 'comment', 'x')).toBe(results);
    expect(withText(results, 'a2', 'resp', '')).toBe(results);
  });
});

describe('withSeverity', () => {
  it('sets the severity, and returns the same object when unchanged', () => {
    const results: Results = { a1: { status: 'NOK' } };
    const next = withSeverity(results, 'a1', 'critical');
    expect(next).toEqual({ a1: { status: 'NOK', severity: 'critical' } });
    expect(withSeverity(next, 'a1', 'critical')).toBe(next);
  });
});

describe('withRemainingOk', () => {
  it('sets only rows without a status, in one edit', () => {
    const results: Results = {
      a1: { status: 'NOK', comment: 'Loose' },
      a2: { comment: 'Checked twice' },
      a4: { status: 'NA' },
    };
    const { results: next, count } = withRemainingOk(results, section);
    expect(count).toBe(2);
    expect(next).toEqual({
      a1: { status: 'NOK', comment: 'Loose' },
      a2: { status: 'OK', comment: 'Checked twice' },
      a3: { status: 'OK' },
      a4: { status: 'NA' },
    });
    expect(next.a1).toBe(results.a1);
    expect(next.a4).toBe(results.a4);
  });

  it('leaves rows of other sections alone', () => {
    const { results: next } = withRemainingOk({ b1: { comment: 'x' } }, section);
    expect(next.b1).toEqual({ comment: 'x' });
    expect(rowsWithoutStatus(section, next)).toBe(0);
  });

  it('returns the same object when every row has a status', () => {
    const results: Results = Object.fromEntries(
      section.items.map((item) => [item.id, { status: 'OK' as const }]),
    );
    expect(withRemainingOk(results, section)).toEqual({ results, count: 0 });
    expect(withRemainingOk(results, section).results).toBe(results);
  });
});

describe('rowsWithoutStatus', () => {
  it('counts the rows still to fill in', () => {
    expect(rowsWithoutStatus(section, {})).toBe(4);
    expect(rowsWithoutStatus(section, { a1: { status: 'OK' }, a2: { comment: 'x' } })).toBe(3);
  });
});
