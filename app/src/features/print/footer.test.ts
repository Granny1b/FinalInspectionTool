import { describe, expect, it } from 'vitest';
import { cssString, pageFooterRule } from './footer';

describe('pageFooterRule', () => {
  it('puts both margin boxes in one @page rule', () => {
    const rule = pageFooterRule('Modig Machine Tool · FI-2026-0042 · Rev 2');
    expect(rule.match(/@page/g)).toHaveLength(1);
    expect(rule).toContain('@bottom-left { content: "Modig Machine Tool · FI-2026-0042 · Rev 2";');
    expect(rule).toContain('@bottom-right { content: "Page " counter(page) " of " counter(pages);');
  });
});

describe('cssString', () => {
  it('escapes quotes and backslashes the way CSS reads them', () => {
    expect(cssString('ACME "Tools" AB \\ S/N 12')).toBe('"ACME \\"Tools\\" AB \\\\ S/N 12"');
  });

  it('cannot end the string or the rule early', () => {
    const text = '"; } @page { @bottom-right { content: "x';
    const literal = cssString(text);
    // Every quote inside is escaped, so the literal is one string token.
    expect(literal.slice(1, -1)).not.toMatch(/(^|[^\\])"/);
  });

  it('turns line breaks and control characters into single spaces', () => {
    expect(cssString('Line one\nline two\r\n\tand\u0001three ')).toBe(
      '"Line one line two and three"',
    );
  });

  it('replaces lone surrogates, which JSON would escape as \\uXXXX (not CSS)', () => {
    expect(cssString('A\uD800B')).toBe('"A�B"');
    expect(cssString('Smile 😀')).toBe('"Smile 😀"');
  });
});
