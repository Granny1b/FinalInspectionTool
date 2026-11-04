import { UserRoundPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { SettingsCard } from './SettingsCard';

// Brief §5.6: a short "how to invite users" note pointing at SWA role invitations.
const INVITE_COMMAND = `az staticwebapp users invite \\
  --name <static-web-app> --resource-group <resource-group> \\
  --authentication-provider AAD --user-details person@example.com \\
  --roles inspector --domain <app-hostname> \\
  --invitation-expiration-in-hours 168`;

/** Who has access and how to invite someone. */
export function UsersCard() {
  return (
    <SettingsCard
      icon={UserRoundPlus}
      title="Users & access"
      description="People sign in with their Microsoft account. Access is by invitation, with one of two roles."
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <Role name="inspector" summary="Creates inspections and fills them in." />
        <Role
          name="admin"
          summary="Everything an inspector does, plus templates, insights and settings."
        />
      </dl>

      <h3 className="mt-7 text-sm font-semibold text-ink-900">Invite someone</h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-600 marker:text-ink-500">
        <li>
          In the Azure portal, open the Static Web App and go to <Path>Role management</Path>.
        </li>
        <li>
          Select <Path>Invite</Path>, choose <Path>Microsoft Entra ID</Path>, enter their email and
          the role <Code>inspector</Code> or <Code>admin</Code>, in lowercase.
        </li>
        <li>
          Set how long the link is valid (at most 168 hours — invitations expire within 7 days),
          generate it and send it to them.
        </li>
        <li>They open the link and sign in with that Microsoft account.</li>
      </ol>

      <h3 className="mt-7 text-sm font-semibold text-ink-900">Or from a terminal</h3>
      {/* Focusable, so keyboard users can scroll it sideways on narrow screens. */}
      <pre
        tabIndex={0}
        role="region"
        aria-label="Invite command"
        className="mt-2 overflow-x-auto rounded-lg bg-stage px-4 py-3 font-mono text-xs leading-relaxed text-on-stage"
      >
        <code>{INVITE_COMMAND}</code>
      </pre>

      <ul className="mt-6 list-disc space-y-1 border-t border-ink-100 pt-5 pl-5 text-sm text-ink-500 marker:text-ink-300">
        <li>At most 25 people can be invited to the app.</li>
        <li>A changed role applies the next time that person signs in.</li>
        <li>
          Accepted, but still “You don't have access yet”? A role belongs to the Microsoft account
          that accepted, not to the email: they may have signed in with another account on the same
          email. Their page shows an <Path>Account ID</Path>; if it isn't in{' '}
          <Path>Role management</Path>, invite them again and have them accept with that account.
        </li>
        <li>
          To change a role or remove someone, use <Path>Role management</Path> in the portal.
        </li>
      </ul>
    </SettingsCard>
  );
}

function Role({ name, summary }: { name: string; summary: string }) {
  return (
    <div className="rounded-lg border border-ink-200 px-4 py-3">
      <dt>
        <Code>{name}</Code>
      </dt>
      <dd className="mt-1.5 text-sm text-ink-600">{summary}</dd>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[0.8125rem] text-ink-800">
      {children}
    </code>
  );
}

/** A UI label in the Azure portal. */
function Path({ children }: { children: ReactNode }) {
  return <span className="font-medium text-ink-800">{children}</span>;
}
