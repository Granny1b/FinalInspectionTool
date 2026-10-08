import type { AnnotatedImage, InspectionDeviation } from '@modig/shared';
import { Plus } from 'lucide-react';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DeviationCard } from './DeviationCard';
import { asksBeforeRemoving, removalMessage } from './deviations';
import type { ExtraDeviationPatch } from './extras';

type Props = {
  /** NOK rows in checklist order, then extra deviations, numbered D-01… (deriveDeviations). */
  deviations: InspectionDeviation[];
  readOnly: boolean;
  /** Finalise problems of extra deviations ("needs a description"), by id. */
  issues: ReadonlyMap<string, string>;
  respSuggestions: string[];
  onGoToRow: (itemId: string) => void;
  /** Adds an empty extra deviation and focuses its description. */
  onAdd: () => void;
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onRemove: (id: string) => void;
  onPhotosChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
};

/**
 * The Deviation Summary (brief §5.3) as cards, one per NOK row and extra deviation, live: D-nn,
 * ref, checkpoint, comment, severity, resp and marked-up photos, as on the printed report.
 * Memoised: the page re-renders on every key, the summary only when a deviation changes.
 */
export const DeviationSummary = memo(function DeviationSummary({
  deviations,
  readOnly,
  issues,
  respSuggestions,
  onGoToRow,
  onAdd,
  onUpdate,
  onRemove,
  onPhotosChange,
}: Props) {
  const titleId = useId();
  const respListId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState<InspectionDeviation | null>(null);
  useIgnoreStrayDrops();

  function remove(deviation: InspectionDeviation) {
    onRemove(deviation.key);
    // Its own buttons are gone; carry on from "Add extra deviation".
    addRef.current?.focus();
  }

  return (
    <section aria-labelledby={titleId}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="text-base font-semibold text-ink-900">
          Deviation Summary
        </h2>
        <p className="text-sm text-ink-500">
          {deviations.length === 1 ? '1 deviation' : `${deviations.length} deviations`}
        </p>
        {!readOnly && deviations.length > 0 && (
          <p className="w-full text-sm text-ink-500">
            Add up to two photos to each and mark them up with arrows, boxes and text: they print on
            the report’s deviation pages.
          </p>
        )}
      </div>

      {deviations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-300 bg-surface px-6 py-10 text-center text-sm text-ink-500">
          No deviations. Rows marked NOK appear here as you mark them
          {readOnly ? '.' : '; findings that aren’t tied to a row can be added below.'}
        </p>
      ) : (
        <ol className="space-y-4">
          {deviations.map((deviation) => (
            <li key={deviation.key}>
              <DeviationCard
                deviation={deviation}
                readOnly={readOnly}
                issue={issues.get(deviation.key)}
                respListId={respListId}
                onGoToRow={onGoToRow}
                onUpdate={onUpdate}
                onRemove={(target) =>
                  asksBeforeRemoving(target) ? setConfirming(target) : remove(target)
                }
                onPhotosChange={onPhotosChange}
              />
            </li>
          ))}
        </ol>
      )}

      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button ref={addRef} variant="secondary" onClick={onAdd}>
            <Plus size={16} aria-hidden="true" />
            Add extra deviation
          </Button>
          <p className="text-xs text-ink-500">For a finding that isn’t tied to a checklist row.</p>
        </div>
      )}

      {/* One list for every Resp field of the extra deviations. */}
      <datalist id={respListId}>
        {respSuggestions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      {confirming && (
        <ConfirmDialog
          title={`Remove deviation ${confirming.number}?`}
          message={removalMessage(confirming)}
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirming(null);
            remove(confirming);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
});

/**
 * A photo dropped beside a photo area would make the browser open it in place of the app. Once
 * the summary has been shown (it then stays rendered), files dropped anywhere but on a photo area
 * are ignored; the photo areas take theirs first and prevent the default themselves.
 */
function useIgnoreStrayDrops() {
  useEffect(() => {
    const ignore = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);
}
