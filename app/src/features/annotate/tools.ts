import { ANNOTATION_COLORS, type Annotation } from '@modig/shared';

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
  select: 'Click a mark, or inside a box or circle, to select it. Drag to move it.',
  arrow: 'Drag from the tail to the tip. Drag a mark’s line to move it, click it to select it.',
  rect: 'Drag from corner to corner. Drag a mark’s line to move it, click it to select it.',
  ellipse: 'Drag across the area to circle. Drag a mark’s line to move it, click it to select it.',
  text: 'Click where the label goes, type, then press Enter. Click a mark to select it.',
  freehand: 'Draw with the mouse, a finger or a pen. Drag a mark’s line to move it.',
};

/** The line under the photo while a mark is selected: what its handles do. */
export const SELECTED_HINTS: Record<Annotation['kind'], string> = {
  arrow: 'Drag the arrow to move it, or a dot to move that end.',
  rect: 'Drag the box to move it, or a handle to resize it.',
  ellipse: 'Drag the circle to move it, or a handle to resize it.',
  text: 'Drag the label to move it, or a corner to resize it. Double-click to change the text.',
  freehand: 'Drag the line to move it, or a corner to resize it.',
};

/** The colours in the order the picker shows them: brief §5.4's four, with green after red. */
export const COLORS = [
  { name: 'Red', value: ANNOTATION_COLORS.red },
  { name: 'Green', value: ANNOTATION_COLORS.green },
  { name: 'Cyan', value: ANNOTATION_COLORS.cyan },
  { name: 'Yellow', value: ANNOTATION_COLORS.yellow },
  { name: 'White', value: ANNOTATION_COLORS.white },
] as const;

export const DEFAULT_COLOR: string = ANNOTATION_COLORS.red;
