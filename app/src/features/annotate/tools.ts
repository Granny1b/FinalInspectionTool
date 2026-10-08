import { ANNOTATION_COLORS } from '@modig/shared';

export const TOOLS = ['select', 'arrow', 'rect', 'ellipse', 'text', 'freehand'] as const;
export type Tool = (typeof TOOLS)[number];

/** Arrows are the most common mark, so a new photo can be pointed at straight away. */
export const DEFAULT_TOOL: Tool = 'arrow';

export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Select and move',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  freehand: 'Freehand',
};

/** One line under the photo saying how the tool is used. */
export const TOOL_HINTS: Record<Tool, string> = {
  select: 'Click a mark to select it, drag to move it. Delete removes it; double-click edits text.',
  arrow: 'Drag from the tail to the tip.',
  rect: 'Drag from corner to corner.',
  ellipse: 'Drag across the area to circle.',
  text: 'Click where the label goes, type, then press Enter.',
  freehand: 'Draw with the mouse, a finger or a pen.',
};

/** The four colours of brief §5.4, in the order the picker shows them. */
export const COLORS = [
  { name: 'Red', value: ANNOTATION_COLORS.red },
  { name: 'Cyan', value: ANNOTATION_COLORS.cyan },
  { name: 'Yellow', value: ANNOTATION_COLORS.yellow },
  { name: 'White', value: ANNOTATION_COLORS.white },
] as const;

export const DEFAULT_COLOR: string = ANNOTATION_COLORS.red;
