import { Factory, Pencil, UserRoundPlus, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import { PlannedAction } from '../components/PlannedAction';

// Brief §5.6: a short "how to invite users" note pointing at SWA role invitations.
const INVITE_COMMAND = `az staticwebapp users invite \\
  --name <static-web-app> --resource-group <resource-group> \\
  --authentication-provider AAD --user-details person@example.com \\
  --roles inspector --domain <app-hostname> \\
  --invitation-expiration-in-hours 168`;

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Who has access, and the defaults used for templates, inspections and print."
      />
      <div className="space-y-6">
        <Card
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
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-600 marker:text-ink-400">
            <li>
              In the Azure portal, open the Static Web App and go to <Path>Role management</Path>.
            </li>
            <li>
              Select <Path>Invite</Path>, choose <Path>Microsoft Entra ID</Path>, enter their email
              and the role <Code>inspector</Code> or <Code>admin</Code>.
            </li>
            <li>
              Set how long the link is valid (at most 168 hours — invitations expire within 7 days),
              generate it and send it to them.
            </li>
            <li>They open the link and sign in with that Microsoft account.</li>
          </ol>

          <h3 className="mt-7 text-sm font-semibold text-ink-900">Or from a terminal</h3>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-900 px-4 py-3 font-mono text-xs leading-relaxed text-ink-100">
            <code>{INVITE_COMMAND}</code>
          </pre>

          <ul className="mt-6 list-disc space-y-1 border-t border-ink-100 pt-5 pl-5 text-sm text-ink-500 marker:text-ink-300">
            <li>At most 25 people can be invited to the app.</li>
            <li>A changed role applies the next time that person signs in.</li>
            <li>
              To change a role or remove someone, use <Path>Role management</Path> in the portal.
            </li>
          </ul>
        </Card>

        <Card
          icon={Factory}
          title="Machine models, location & print"
          description="The model list, the default location for new inspections, and the company name and logo on printed reports."
        >
          <PlannedAction align="start">
            <Pencil size={16} />
            Edit settings
          </PlannedAction>
        </Card>
      </div>
    </>
  );
}

type CardProps = { icon: LucideIcon; title: string; description: string; children: ReactNode };

function Card({ icon: Icon, title, description, children }: CardProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-lg border border-ink-200 bg-surface">
      <div className="flex items-start gap-4 border-b border-ink-100 px-6 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-500">{description}</p>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
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
