import { SEVERITY_LABELS } from '@modig/shared';
import clsx from 'clsx';
import { Camera, Plus } from 'lucide-react';
import { use } from 'react';
import { photoCountText } from '../deviations';
import { GENERAL_FINDINGS, SectionFindingsContext } from './sectionFindingsContext';

type Props = {
  /** The section whose findings these are; null for the general ones (no button to add). */
  sectionId: string | null;
  /** 3, for the button's name. */
  sectionNumber?: number;
  className?: string;
};

/**
 * The extra findings of a section, at its end: what was found there that no row asks about, each
 * a red-barred line that opens the finding, and a button to add one. Nothing where the check has
 * no findings to show (a checklist being edited, a preview).
 */
export function SectionFindings({ sectionId, sectionNumber, className }: Props) {
  const findings = use(SectionFindingsContext);
  if (!findings) return null;
  const { bySection, onAdd, onOpen } = findings;
  const own = bySection.get(sectionId ?? GENERAL_FINDINGS) ?? [];
  const adding = sectionId !== null && onAdd;
  if (own.length === 0 && !adding) return null;
  return (
    <div className={clsx('space-y-1.5', className)} data-section-findings={sectionId ?? 'general'}>
      {own.length > 0 && (
        <ul className="space-y-1.5">
          {own.map((finding) => {
            const photos = photoCountText(finding.photos.length);
            return (
              <li key={finding.key}>
                <button
                  type="button"
                  onClick={() => onOpen(finding.key)}
                  aria-label={`Extra finding ${finding.number}: ${finding.text.trim() || 'no description yet'}`}
                  className="relative flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-0.5 overflow-hidden rounded-md border border-nok-fg/30 bg-nok-bg/50 py-2 pr-3 pl-4 text-left text-sm transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-nok-fg hover:border-nok-fg/60"
                >
                  <span className="font-semibold text-nok-fg tabular-nums">{finding.number}</span>
                  <span className="text-xs font-medium tracking-wide text-nok-fg uppercase">
                    Extra finding
                  </span>
                  <span className="min-w-0 flex-1 basis-48 wrap-break-word text-ink-900">
                    {finding.text.trim() || (
                      <span className="text-ink-500">No description yet</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-ink-600">
                    {SEVERITY_LABELS[finding.severity]}
                    {photos && (
                      <span className="inline-flex items-center gap-1">
                        <Camera size={13} aria-hidden="true" />
                        {photos}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <button
          type="button"
          // Not a Tab stop, like the section's Set remaining to OK: Tab goes from row to row.
          tabIndex={-1}
          onClick={() => onAdd(sectionId)}
          aria-label={
            sectionNumber ? `Add extra finding to section ${sectionNumber}` : 'Add extra finding'
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-ink-400 px-3 text-xs font-medium text-ink-700 transition-colors hover:border-nok-fg hover:bg-nok-bg hover:text-nok-fg pointer-coarse:h-11"
        >
          <Plus size={15} aria-hidden="true" />
          Add extra finding
        </button>
      )}
    </div>
  );
}
