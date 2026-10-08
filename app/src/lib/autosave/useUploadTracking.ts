import { useCallback, useRef, useState } from 'react';

/**
 * A photo that is still uploading counts as unsaved: leaving or publishing/finalising waits for
 * it, and closing the tab gets the browser's warning. `saveAll` saves everything once a photo
 * being uploaded is in the document; false if saving failed.
 */
export function useUploadTracking(saver: { flush: () => Promise<boolean> }) {
  const uploadRef = useRef<Promise<unknown> | null>(null);
  const [uploading, setUploading] = useState(false);
  const trackUpload = useCallback((upload: Promise<unknown>) => {
    uploadRef.current = upload;
    setUploading(true);
    const done = () => {
      if (uploadRef.current !== upload) return;
      uploadRef.current = null;
      setUploading(false);
    };
    upload.then(done, done);
  }, []);
  const saveAll = useCallback(async () => {
    await uploadRef.current?.catch(() => undefined);
    return saver.flush();
  }, [saver]);
  return { uploading, trackUpload, saveAll };
}
