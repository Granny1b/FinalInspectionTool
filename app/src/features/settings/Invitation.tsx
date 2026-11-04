import clsx from 'clsx';
import { Check, Copy, Mail } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { INPUT } from '../../components/Field';
import { invitation, invitationMailto, type PersonInput } from './users';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The invitation for someone just added, ready to pass on: the app sends no email itself.
 * Copy puts it on the clipboard; "Open in email" starts a message to them with it filled in.
 */
export function Invitation({ person }: { person: PersonInput }) {
  const textId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [copy, setCopy] = useState<CopyState>('idle');
  const message = invitation(person, `${window.location.origin}/`);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopy('copied');
    } catch {
      // No clipboard access (an old browser, or permission refused): select it to copy by hand.
      textRef.current?.select();
      setCopy('failed');
    }
  }

  return (
    <div className="mt-5">
      <label htmlFor={textId} className="block text-sm font-medium text-ink-800">
        Invitation to send
      </label>
      <textarea
        id={textId}
        ref={textRef}
        readOnly
        rows={6}
        value={message.body}
        className={clsx(INPUT, 'mt-1.5 resize-none py-2 leading-relaxed')}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Focused when this step opens: the next thing to do. */}
        <Button autoFocus onClick={() => void copyText()}>
          {copy === 'copied' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          Copy invitation
        </Button>
        <a href={invitationMailto(person.email, message)} className={buttonClasses('secondary')}>
          <Mail size={16} aria-hidden="true" />
          Open in email
        </a>
        <p role="status" className="text-xs text-ink-500">
          {copy === 'copied' && 'Copied.'}
          {copy === 'failed' && 'Copying was blocked: the text is selected, press Ctrl+C to copy.'}
        </p>
      </div>
    </div>
  );
}
