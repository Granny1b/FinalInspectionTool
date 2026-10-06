import { APP_NAME } from '@modig/shared';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

type Props = { title: string; message: string; actions: ReactNode };

/** Full-page error card for failures outside the normal shell (no user, or a crashed route). */
export function ErrorScreen({ title, message, actions }: Props) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <title>{`${title} · ${APP_NAME}`}</title>
      <div className="w-full max-w-sm rounded-xl border border-ink-200 bg-surface p-8 text-center shadow-xs">
        <Logo className="mx-auto h-8" />
        <div className="mx-auto mt-8 flex size-11 items-center justify-center rounded-full bg-nok-bg text-nok-fg ring-1 ring-nok-border">
          <TriangleAlert size={20} strokeWidth={1.75} />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink-900">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-500">{message}</p>
        <div className="mt-6 flex flex-col items-center gap-3">{actions}</div>
      </div>
    </main>
  );
}
