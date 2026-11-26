import type { AnnotatedImage, InspectionDeviation } from '@modig/shared';
import { Check, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { DeviationPhotos } from './DeviationCard';
import { asksBeforeRemoving, removalMessage } from './deviations';
import { ExtraDeviationFields } from './ExtraDeviationFields';
import type { ExtraDeviationPatch } from './extras';

type Props = {
  /** The finding, as the page has it: every change here is saved like any other on the page. */
  deviation: InspectionDeviation;
  /** Finalise problem ("needs a description"). */
  issue: string | undefined;
  responsibles: readonly string[];
  categories: readonly string[];
  onUpdate: (id: string, patch: ExtraDeviationPatch) => void;
  onPhotosChange: (deviation: InspectionDeviation, photos: AnnotatedImage[]) => void;
  onEditorDirtyChange: (dirty: boolean) => void;
  onRemove: (id: string) => void;
  /** Once closed (Done, Escape, or removed). */
  onClose: () => void;
};

/**
 * An extra finding, added or opened from the checklist: what was found, its severity, who is
 * responsible, and its photos, without leaving the row one was at. It edits the finding itself
 * (there is nothing to save or cancel); the same finding has a card on the Deviations tab.
 */
export function ExtraFindingDialog({
  deviation,
  issue,
  responsibles,
  categories,
  onUpdate,
  onPhotosChange,
  onEditorDirtyChange,
  onRemove,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();
  const [confirming, setConfirming] = useState(false);
  // Straight to what was found.
  useEffect(() => {
    document.getElementById(descriptionId)?.focus();
  }, [descriptionId]);

  function remove() {
    onRemove(deviation.key);
    dialogRef.current?.close();
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Extra finding ${deviation.number}`}
      description={
        deviation.sectionTitle.trim()
          ? `Found in “${deviation.sectionTitle.trim()}”. Saved as you type, and listed with the deviations.`
          : 'Not tied to a section. Saved as you type, and listed with the deviations.'
      }
      onClose={onClose}
    >
      <div className="mt-5 grid gap-5">
        <ExtraDeviationFields
          deviation={deviation}
          issue={issue}
          responsibles={responsibles}
          categories={categories}
          onUpdate={onUpdate}
          descriptionId={descriptionId}
        />
        <DeviationPhotos
          deviation={deviation}
          readOnly={false}
          onChange={onPhotosChange}
          onEditorDirtyChange={onEditorDirtyChange}
        />
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Remove extra finding ${deviation.number}?`}
          message={removalMessage(deviation)}
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirming(false);
            remove();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
      <div className="mt-6 flex justify-between gap-2">
        <Button
          variant="secondary"
          onClick={() => (asksBeforeRemoving(deviation) ? setConfirming(true) : remove())}
        >
          <Trash2 size={16} aria-hidden="true" />
          Remove
        </Button>
        <Button onClick={() => dialogRef.current?.close()}>
          <Check size={16} aria-hidden="true" />
          Done
        </Button>
      </div>
    </Dialog>
  );
}
