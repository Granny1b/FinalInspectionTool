import clsx from 'clsx';
import {
  BringToFront,
  Circle,
  CopyPlus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { COLORS, TOOL_LABELS, TOOLS, type Tool } from './tools';

const TOOL_ICONS: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  arrow: MoveUpRight,
  rect: Square,
  ellipse: Circle,
  text: Type,
  freehand: Pencil,
};

/** The selected mark: whether it is drawn over all others, or under them. */
export type SelectedMark = { front: boolean; back: boolean };

type Props = {
  tool: Tool;
  color: string;
  canUndo: boolean;
  canRedo: boolean;
  /** Null with nothing selected. */
  selected: SelectedMark | null;
  disabled: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onOrder: (to: 'front' | 'back') => void;
  onDelete: () => void;
};

/**
 * Tools, the colours, undo/redo and what to do with the selected mark: the editor's bar above the
 * photo. The selected mark's buttons are always there, turned off with nothing selected, so the
 * bar (and the photo under it) never changes size when a mark is picked.
 */
export function EditorToolbar({
  tool,
  color,
  canUndo,
  canRedo,
  selected,
  disabled,
  onTool,
  onColor,
  onUndo,
  onRedo,
  onDuplicate,
  onOrder,
  onDelete,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div role="group" aria-label="Tool" className="flex items-center gap-0.5">
        {TOOLS.map((id) => {
          const Icon = TOOL_ICONS[id];
          return (
            <BarButton
              key={id}
              label={TOOL_LABELS[id]}
              aria-pressed={tool === id}
              disabled={disabled}
              onClick={() => onTool(id)}
              className="aria-pressed:bg-brand-50 aria-pressed:text-brand-700 aria-pressed:ring-1 aria-pressed:ring-brand-300 aria-pressed:ring-inset"
            >
              <Icon size={18} aria-hidden="true" />
            </BarButton>
          );
        })}
      </div>
      <Divider />
      <div role="group" aria-label="Colour" className="flex items-center gap-0.5">
        {COLORS.map(({ name, value }) => (
          <BarButton
            key={value}
            label={name}
            aria-pressed={color === value}
            disabled={disabled}
            onClick={() => onColor(value)}
            // Keeps the focus in a label being typed, so the label takes the colour.
            onMouseDown={(event) => event.preventDefault()}
            className="group"
          >
            <span
              aria-hidden="true"
              style={{ backgroundColor: value }}
              className="size-5 rounded-full border border-ink-950/25 group-aria-pressed:ring-2 group-aria-pressed:ring-brand-600 group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-overlay"
            />
          </BarButton>
        ))}
      </div>
      <Divider />
      <div className="flex items-center gap-0.5">
        <BarButton
          label="Undo"
          shortcut="Ctrl+Z"
          disabled={disabled}
          inactive={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden="true" />
        </BarButton>
        <BarButton
          label="Redo"
          shortcut="Ctrl+Y"
          disabled={disabled}
          inactive={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={18} aria-hidden="true" />
        </BarButton>
      </div>
      <Divider />
      <div role="group" aria-label="Selected mark" className="flex items-center gap-0.5">
        <BarButton
          label="Duplicate mark"
          shortcut="Ctrl+D"
          disabled={disabled}
          inactive={!selected}
          onClick={onDuplicate}
        >
          <CopyPlus size={18} aria-hidden="true" />
        </BarButton>
        <BarButton
          label="Bring to front"
          disabled={disabled}
          inactive={!selected || selected.front}
          onClick={() => onOrder('front')}
        >
          <BringToFront size={18} aria-hidden="true" />
        </BarButton>
        <BarButton
          label="Send to back"
          disabled={disabled}
          inactive={!selected || selected.back}
          onClick={() => onOrder('back')}
        >
          <SendToBack size={18} aria-hidden="true" />
        </BarButton>
        <BarButton
          label="Delete mark"
          shortcut="Delete"
          disabled={disabled}
          inactive={!selected}
          onClick={onDelete}
        >
          <Trash2 size={18} aria-hidden="true" />
        </BarButton>
      </div>
    </div>
  );
}

/**
 * Only where the whole bar fits on one line (from 1024 px): narrower, on a tablet or a phone, the
 * groups wrap onto lines of their own and a divider would dangle at the end of one.
 */
function Divider() {
  return <div aria-hidden="true" className="mx-0.5 h-6 w-px bg-ink-200 max-lg:hidden" />;
}

/**
 * An icon button, 44 px for fingers and 36 px with a mouse; its name is also its tooltip. On the
 * dialog's overlay colour, which in the dark theme is ink-100, it hovers a step lighter there.
 * `inactive` (aria-disabled, not disabled) is for Undo, Redo and the selected mark's buttons,
 * which can turn themselves off: a disabled button would drop the focus out of the dialog, and its
 * shortcuts and Escape with it.
 */
function BarButton({
  label,
  shortcut,
  inactive = false,
  onClick,
  className,
  ...props
}: ComponentProps<'button'> & { label: string; shortcut?: string; inactive?: boolean }) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut?.replace('Ctrl', 'Control')}
      aria-disabled={inactive || undefined}
      title={tip}
      onClick={inactive ? undefined : onClick}
      className={clsx(
        'flex size-11 items-center justify-center rounded-md text-ink-600 transition-colors pointer-fine:size-9',
        'hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-ink-200',
        'aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-600',
        className,
      )}
      {...props}
    />
  );
}
