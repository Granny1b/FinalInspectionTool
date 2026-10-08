import type { Status } from '@modig/shared';
import { Check, Minus, X, type LucideIcon } from 'lucide-react';

/** ✓ ✗ – next to the text, so a status never depends on colour (brief §6, §7). */
export const STATUS_ICONS: Record<Status, LucideIcon> = { OK: Check, NOK: X, NA: Minus };

/**
 * The muted status colours from the theme: background, text, and a ring in the text colour at
 * 80 %, which keeps the selected segment at 3:1 or more against the grey track (WCAG 1.4.11).
 */
export const STATUS_TONES: Record<Status, string> = {
  OK: 'bg-ok-bg text-ok-fg ring-ok-fg/80',
  NOK: 'bg-nok-bg text-nok-fg ring-nok-fg/80',
  NA: 'bg-na-bg text-na-fg ring-na-fg/80',
};
