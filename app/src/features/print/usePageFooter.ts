import { useEffect } from 'react';
import { pageFooterRule } from './footer';

/**
 * Chromium (Chrome, Edge) prints `@page` margin boxes; Firefox and Safari don't (2026). CSS can't
 * test for them, so the browser is recognised instead: only Chromium browsers have
 * `navigator.userAgentData`. The others get the footer as a repeating table footer.
 */
export const PRINTS_MARGIN_BOXES = 'userAgentData' in navigator;

/**
 * While mounted, every printed page gets `text` bottom left and "Page X of Y" bottom right.
 *
 * The rule is added through the CSSOM to the app's own stylesheet: the production CSP
 * (`style-src 'self'`) blocks inline `<style>` but not CSSOM edits of a same-origin sheet.
 */
export function usePageFooter(text: string): void {
  useEffect(() => {
    if (!PRINTS_MARGIN_BOXES) return;
    const sheet = pageSheet();
    if (!sheet) return;
    const rule = sheet.cssRules[sheet.insertRule(pageFooterRule(text), sheet.cssRules.length)];
    return () => {
      // Found again by identity: other rules may have been added or removed meanwhile.
      const index = Array.prototype.indexOf.call(sheet.cssRules, rule);
      if (index >= 0) sheet.deleteRule(index);
    };
  }, [text]);
}

/** The stylesheet with print.css's `@page` rule: the app bundle, or print.css's own in dev. */
function pageSheet(): CSSStyleSheet | null {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Another origin's sheet: its rules can't be read.
    }
    if (Array.from(rules).some((rule) => rule instanceof CSSPageRule)) return sheet;
  }
  return null;
}
