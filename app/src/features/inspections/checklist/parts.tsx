import { STATUS_LABELS, STATUSES, type Guide, type Status } from '@modig/shared';
import clsx from 'clsx';
import { Camera, Info } from 'lucide-react';
import { CONTROL_HEIGHT } from './layout';
import { STATUS_ICONS, STATUS_TONES } from './status';

type StatusControlProps = {
  status: Status | undefined;
  /** "3.c", for the accessible name. */
  rowRef: string;
  onPick: (status: Status) => void;
};

/**
 * Segmented OK / NOK / N/A (brief §5.3) as three toggle buttons: the selected one is pressed, and
 * pressing it again clears the status. They are not tab stops; the keyboard sets the status on
 * the focused row (1/2/3), so Tab goes straight from the row to its comment.
 */
export function StatusControl({ status, rowRef, onPick }: StatusControlProps) {
  return (
    <div
      role="group"
      aria-label={`Status, row ${rowRef}`}
      className={clsx(
        'grid grid-cols-3 gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset',
        CONTROL_HEIGHT,
      )}
    >
      {STATUSES.map((option) => {
        const Icon = STATUS_ICONS[option];
        const selected = option === status;
        return (
          <button
            key={option}
            type="button"
            tabIndex={-1}
            aria-pressed={selected}
            onClick={() => onPick(option)}
            className={clsx(
              'inline-flex min-w-0 items-center justify-center gap-1 rounded-md text-[0.8125rem] transition-colors',
              selected
                ? clsx('font-semibold shadow-xs ring-1 ring-inset', STATUS_TONES[option])
                : 'text-ink-600 hover:bg-surface hover:text-ink-900',
            )}
          >
            <Icon size={14} strokeWidth={selected ? 3 : 2} aria-hidden="true" />
            {STATUS_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

/** A status as a symbol and its text, for read-only rows. */
export function StatusMark({ status }: { status: Status | undefined }) {
  if (!status) {
    return <span className="inline-flex h-8 items-center text-sm text-ink-500">No status</span>;
  }
  const Icon = STATUS_ICONS[status];
  return (
    <span
      className={clsx(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold ring-1 ring-inset',
        STATUS_TONES[status],
      )}
    >
      <Icon size={14} strokeWidth={3} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export const GUIDE_SOON = 'Guide viewer arrives in phase 5.';

type GuideButtonProps = {
  guide: Guide;
  rowRef: string;
  /** "Guide viewer arrives in phase 5." is showing next to the button. */
  noteOpen: boolean;
  onClick: () => void;
};

/**
 * Marks a row that has a guide: a camera when it has photos, otherwise an info icon. It is not a
 * tab stop (Tab goes row → comment → resp); `G` on the row does the same as a click.
 */
export function GuideButton({ guide, rowRef, noteOpen, onClick }: GuideButtonProps) {
  const photos = guide.images.length;
  const Icon = photos > 0 ? Camera : Info;
  const label = `Guide for row ${rowRef}${
    photos > 0 ? ` (${photos} ${photos === 1 ? 'photo' : 'photos'})` : ''
  }`;
  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        aria-keyshortcuts="G"
        title={`${label} · G`}
        onClick={onClick}
        className="flex size-8 items-center justify-center rounded-md text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800"
      >
        <Icon size={16} aria-hidden="true" />
      </button>
      {/* Read out by the sheet's live region; this is the visual half. */}
      {noteOpen && (
        <span
          aria-hidden="true"
          className="absolute top-full right-0 z-10 mt-1 rounded-md bg-ink-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-md"
        >
          {GUIDE_SOON}
        </span>
      )}
    </span>
  );
}
