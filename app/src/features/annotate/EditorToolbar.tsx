import clsx from 'clsx';
import {
  Circle,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Redo2,
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

type Props = {
  tool: Tool;
  color: string;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  disabled: boolean;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
};

/** Tools, the four colours, undo/redo and delete: the editor's bar above the photo. */
export function EditorToolbar({
  tool,
  color,
  canUndo,
  canRedo,
  canDelete,
  disabled,
  onTool,
  onColor,
  onUndo,
  onRedo,
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
              className="size-5 rounded-full border border-ink-950/25 group-aria-pressed:ring-2 group-aria-pressed:ring-brand-600 group-aria-pressed:ring-offset-2"
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
        <BarButton
          label="Delete mark"
          shortcut="Delete"
          disabled={disabled}
          inactive={!canDelete}
          onClick={onDelete}
        >
          <Trash2 size={18} aria-hidden="true" />
        </BarButton>
      </div>
    </div>
  );
}

function Divider() {
  return <div aria-hidden="true" className="mx-0.5 h-6 w-px bg-ink-200" />;
}

/**
 * An icon button, 44 px for fingers and 36 px with a mouse; its name is also its tooltip.
 * `inactive` (aria-disabled, not disabled) is for Undo, Redo and Delete mark, which turn
 * themselves off: a disabled button would drop the focus out of the dialog, and its shortcuts
 * and Escape with it.
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
        'hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-40',
        'aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-600',
        className,
      )}
      {...props}
    />
  );
}
