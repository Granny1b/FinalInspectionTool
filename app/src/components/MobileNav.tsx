import type { Me } from '@modig/shared';
import { Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { Sidebar } from './Sidebar';

const DRAWER_ID = 'nav-drawer';
/** Tailwind's `lg` breakpoint, where the permanent sidebar takes over. */
const DESKTOP_QUERY = '(min-width: 64rem)';

/**
 * Top bar with a menu button and a slide-in navigation drawer, below the `lg` breakpoint
 * (tablets in the workshop). The drawer is a native modal <dialog>, which gives us the focus
 * trap, Escape-to-close and an inert page behind it for free.
 */
export function MobileNav({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Rotating a tablet to landscape crosses into desktop layout, where this drawer is hidden;
  // an invisible modal dialog would leave the whole page inert.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const close = () => setOpen(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-200 bg-surface px-2 sm:px-4 lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls={DRAWER_ID}
          className="flex size-10 items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 hover:text-ink-900"
        >
          <Menu size={20} />
        </button>
        <Logo className="h-7" />
      </header>

      <dialog
        id={DRAWER_ID}
        ref={dialogRef}
        aria-label="Navigation"
        // Fires for Escape as well as for close(); keeps state in sync and hands focus back.
        onClose={() => {
          setOpen(false);
          menuButtonRef.current?.focus();
        }}
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface p-0 shadow-xl transition-transform duration-200 ease-out backdrop:bg-ink-950/30 motion-reduce:transition-none starting:open:-translate-x-full lg:hidden"
      >
        <Sidebar me={me} onNavigate={close} onClose={close} />
      </dialog>
    </>
  );
}
