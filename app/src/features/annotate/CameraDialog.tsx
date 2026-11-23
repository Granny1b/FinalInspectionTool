import { Camera, LoaderCircle, SwitchCamera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';

type Props = {
  /** "photo", "picture", "image": what is being taken. */
  noun: string;
  /** The photo taken, as a JPEG file: it goes the way of a chosen file. */
  onCapture: (file: File) => void;
  onClose: () => void;
};

/** Why the camera did not start, in words; the browser's error names say which it was. */
function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera is not allowed for this site. Allow it in the browser (the camera or lock icon in the address bar), then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is in use by another app, or could not be started.';
  }
  return 'The camera could not be started.';
}

const JPEG_QUALITY = 0.92;

/**
 * Takes a photo with the device's camera, live: the camera's picture, a button that takes the
 * photo, and one that turns to the other camera when there are two (a tablet's front and back).
 * The back camera is asked for first. The photo is handed on as a file, so everything after it
 * (resizing, upload, drawing on it) is what a chosen file gets. The camera is switched off when
 * the dialog closes.
 */
export function CameraDialog({ noun, onCapture, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [state, setState] = useState<'starting' | 'live' | { problem: string }>('starting');
  const [cameras, setCameras] = useState(1);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let gone = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      .then(async (started) => {
        if (gone) return started.getTracks().forEach((track) => track.stop());
        stream = started;
        const video = videoRef.current;
        if (video) {
          video.srcObject = started;
          await video.play().catch(() => undefined);
        }
        if (gone) return;
        setState('live');
        // Their number is only told once the camera is allowed.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!gone) setCameras(devices.filter((device) => device.kind === 'videoinput').length);
      })
      .catch((error: unknown) => {
        if (!gone) setState({ problem: cameraProblem(error) });
      });
    return () => {
      gone = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  function take() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setState({ problem: 'The photo could not be taken. Try again.' });
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        dialogRef.current?.close();
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }

  const live = state === 'live';
  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Take a ${noun}`}
      onClose={onClose}
      className="sm:w-[min(46rem,calc(100vw-2rem))]"
    >
      <div
        data-camera=""
        className="bg-black relative mt-4 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg"
      >
        {/* Muted and inline, or a phone refuses to play it without a tap. */}
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="The camera’s picture"
          className={live ? 'size-full object-contain' : 'hidden'}
        />
        {state === 'starting' && (
          <p role="status" className="flex items-center gap-2 text-sm text-white/80">
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            Starting the camera…
          </p>
        )}
        {typeof state === 'object' && (
          <p role="alert" className="max-w-sm px-6 text-center text-sm text-white">
            {state.problem}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          {cameras > 1 && (
            <Button
              variant="secondary"
              onClick={() => {
                setState('starting');
                setFacing((current) => (current === 'user' ? 'environment' : 'user'));
              }}
            >
              <SwitchCamera size={16} aria-hidden="true" />
              Other camera
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button onClick={take} disabled={!live} autoFocus>
            <Camera size={16} aria-hidden="true" />
            Take {noun}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
