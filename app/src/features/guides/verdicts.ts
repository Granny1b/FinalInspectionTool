import type { GuideVerdict } from '@modig/shared';
import { Check, Info, X, type LucideIcon } from 'lucide-react';

/** ✓ Good, ✗ Bad, ⓘ Info: a symbol next to the word, so a verdict never depends on colour. */
export const VERDICT_ICONS: Record<GuideVerdict, LucideIcon> = { good: Check, bad: X, info: Info };

/** Green, red and neutral (brief §5.4), the muted status colours with a ring in the text colour. */
export const VERDICT_TONES: Record<GuideVerdict, string> = {
  good: 'bg-ok-bg text-ok-fg ring-ok-fg/80',
  bad: 'bg-nok-bg text-nok-fg ring-nok-fg/80',
  info: 'bg-na-bg text-na-fg ring-na-fg/80',
};
