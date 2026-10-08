import clsx from 'clsx';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type ToggleEvent,
} from 'react';
import { buttonClasses } from './buttonClasses';

type MenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive: red, after a divider. */
  danger?: boolean;
};

type Props = {
  /** Accessible name of the button and the menu, e.g. "Section 3 actions". */
  label: string;
  items: MenuItem[];
  /** Data attributes for the button, so the editor can move focus back to it. */
  triggerData?: Record<`data-${string}`, string>;
  /** A secondary button with this content (icon and text) instead of the ⋯ icon. */
  trigger?: ReactNode;
};

/**
 * A ⋯ menu on the native popover: top layer (never clipped), click-outside and Escape close it.
 * Menu keyboard support on top: focus starts on the first enabled item, arrows/Home/End move,
 * Tab closes.
 */
export function ActionMenu({ label, items, triggerData, trigger }: Props) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const firstEnabled = items.findIndex((item) => !item.disabled);

  // The popover is position: fixed; while it is open it follows its button.
  useEffect(() => {
    const menu = menuRef.current;
    const trigger = triggerRef.current;
    if (!open || !menu || !trigger) return;
    const follow = () => placeMenu(menu, trigger);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    return () => {
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
    };
  }, [open]);

  function enabledItems(): HTMLButtonElement[] {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );
  }

  function onToggle(event: ToggleEvent<HTMLDivElement>) {
    const menu = event.currentTarget;
    setOpen(event.newState === 'open');
    if (event.newState === 'open') {
      if (triggerRef.current) placeMenu(menu, triggerRef.current);
      return;
    }
    // Closed by Escape or a click elsewhere: hand focus back unless it already moved on.
    const focused = document.activeElement;
    if (!focused || focused === document.body || menu.contains(focused)) {
      triggerRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = enabledItems();
    const current = list.findIndex((item) => item === document.activeElement);
    const moveTo = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') moveTo(current + 1);
    else if (event.key === 'ArrowUp') moveTo(current < 0 ? -1 : current - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(-1);
    else if (event.key === 'Tab') {
      event.preventDefault();
      menuRef.current?.hidePopover();
      triggerRef.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="menu"
        // A labelled trigger is named by its text; the icon needs the label.
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        className={
          trigger
            ? buttonClasses('secondary')
            : 'flex size-7 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-200/70 hover:text-ink-900'
        }
        {...triggerData}
      >
        {trigger ?? <Ellipsis size={16} aria-hidden="true" />}
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={label}
        // Placed before it paints (no flash in the middle of the screen), re-checked once open.
        onBeforeToggle={(event) => {
          if (event.newState === 'open' && triggerRef.current) {
            placeMenu(event.currentTarget, triggerRef.current);
          }
        }}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
        className="fixed inset-auto m-0 min-w-44 rounded-lg border border-ink-200 bg-surface p-1 text-sm text-ink-800 shadow-lg"
      >
        {items.map((item, index) => (
          <Fragment key={item.label}>
            {item.danger && <div role="separator" className="mx-1 my-1 h-px bg-ink-100" />}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              // The popover focuses its `autofocus` element as it opens, synchronously, so a fast
              // second key press already lands in the menu. (React's autoFocus sets no attribute.)
              ref={(button) => {
                button?.toggleAttribute('autofocus', index === firstEnabled);
              }}
              disabled={item.disabled}
              onClick={() => {
                menuRef.current?.hidePopover();
                item.onSelect();
              }}
              className={clsx(
                'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left whitespace-nowrap transition-colors focus-visible:-outline-offset-2 disabled:pointer-events-none disabled:text-ink-400',
                item.danger
                  ? 'text-nok-fg hover:bg-nok-bg focus-visible:bg-nok-bg'
                  : 'hover:bg-ink-100 focus-visible:bg-ink-100',
              )}
            >
              <item.icon size={15} aria-hidden="true" className="shrink-0" />
              {item.label}
            </button>
          </Fragment>
        ))}
      </div>
    </>
  );
}

/** Right-aligned under its button; flipped above it when there is no room below. */
function placeMenu(menu: HTMLElement, trigger: HTMLElement) {
  const anchor = trigger.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  menu.style.right = `${Math.max(8, viewportWidth - anchor.right)}px`;
  menu.style.top = `${anchor.bottom + 4}px`;
  // Before it opens the menu has no height yet; onToggle places it again once it has.
  const height = menu.offsetHeight;
  if (height > 0 && anchor.bottom + 4 + height > window.innerHeight - 8) {
    menu.style.top = `${Math.max(8, anchor.top - 4 - height)}px`;
  }
}
