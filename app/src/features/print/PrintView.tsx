import { useEffect, useRef } from 'react';
import type { PrintModel } from './model';
import { PrintDocument } from './PrintDocument';
import { PrintToolbar, type ModeSwitch } from './PrintToolbar';
import { useAssetsReady } from './useAssetsReady';
import { usePageFooter } from './usePageFooter';
import './print.css';

type Props = {
  model: PrintModel;
  logoUrl: string;
  /** Null when `model.front.photoId` is set but its address couldn't be fetched. */
  photoUrl: string | null;
  /** What is printed, under "Print preview". */
  subject: string;
  back: { to: string; label: string };
  modeSwitch?: ModeSwitch;
  /** `?autoprint=1`: open the print dialog once, as soon as everything is loaded. */
  autoprint?: boolean;
  /** Called as autoprint fires, to drop the flag (a reload must not print again). */
  onAutoprinted?: () => void;
};

/**
 * A print route's page: the toolbar over a calm preview of A4 sheets on screen, the bare document
 * on paper, with the page footer on every page. Rendered once the data is loaded.
 */
export function PrintView({
  model,
  logoUrl,
  photoUrl,
  subject,
  back,
  modeSwitch,
  autoprint = false,
  onAutoprinted,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = useAssetsReady(rootRef, `${logoUrl} ${photoUrl ?? ''}`);
  usePageFooter(model.footer);

  const printed = useRef(false);
  useEffect(() => {
    if (!ready || !autoprint || printed.current) return;
    printed.current = true;
    onAutoprinted?.();
    window.print();
  }, [ready, autoprint, onAutoprinted]);

  return (
    // A column on screen, so the grey desk fills the window; plain blocks on paper, where a flex
    // container would only complicate page breaks.
    <div className="flex min-h-dvh flex-col print:block">
      {/* Chrome offers the title as the PDF's file name. */}
      <title>{model.fileName}</title>
      <PrintToolbar subject={subject} back={back} modeSwitch={modeSwitch} ready={ready} />
      <main className="paper-desk flex-1">
        <PrintDocument
          model={model}
          logoUrl={logoUrl}
          photoUrl={photoUrl}
          ready={ready}
          rootRef={rootRef}
        />
      </main>
    </div>
  );
}
