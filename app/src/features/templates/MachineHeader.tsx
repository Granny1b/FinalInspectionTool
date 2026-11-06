import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BackLink } from '../../components/BackLink';
import { useImageUrl } from '../../lib/images';
import { modelName, useSettings } from '../../lib/useSettings';
import { qualityChecksHref, qualityChecksOf, useTemplates } from './queries';

type Props = {
  /** The machine's final inspection template. */
  templateId: string;
  modelCode: string;
  coverImageId: string | undefined;
  /** The tab shown under the header. */
  tab: 'final' | 'quality';
};

/**
 * A machine's page: "← Templates", its cover, its model's name (the page's heading) and the two
 * tabs, Final inspection and Quality checks (n). The tabs are links to two addresses, so Back and
 * a shared link land on the same tab.
 */
export function MachineHeader({ templateId, modelCode, coverImageId, tab }: Props) {
  const templates = useTemplates();
  const settings = useSettings();
  const count = templates.data ? qualityChecksOf(templates.data, templateId).length : null;
  const name = modelName(settings.data?.machineModels, modelCode);
  return (
    <div>
      <BackLink to="/templates" label="Templates" />
      <div className="mt-3 flex items-center gap-4">
        {coverImageId && <CoverThumbnail imageId={coverImageId} />}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight wrap-break-word text-ink-900">
            {name}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {name === modelCode ? '' : `${modelCode} · `}Final inspection and quality checks
          </p>
        </div>
      </div>
      <nav aria-label="Checklists of this machine" className="mt-5 border-b border-ink-200">
        <ul className="-mb-px flex gap-6">
          <TabLink to={`/templates/${templateId}`} current={tab === 'final'}>
            Final inspection
          </TabLink>
          <TabLink to={qualityChecksHref(templateId)} current={tab === 'quality'}>
            Quality checks
            {count !== null && (
              <>
                <span
                  aria-hidden="true"
                  className={clsx(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    count > 0
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 ring-inset'
                      : 'bg-ink-100 text-ink-600',
                  )}
                >
                  {count}
                </span>
                <span className="sr-only"> ({count})</span>
              </>
            )}
          </TabLink>
        </ul>
      </nav>
    </div>
  );
}

function TabLink({ to, current, children }: { to: string; current: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        aria-current={current ? 'page' : undefined}
        className={clsx(
          'inline-flex h-10 items-center gap-2 border-b-2 px-0.5 text-sm font-medium transition-colors',
          current
            ? 'border-brand-600 text-ink-900'
            : 'border-transparent text-ink-500 hover:border-ink-300 hover:text-ink-900',
        )}
      >
        {children}
      </Link>
    </li>
  );
}

/** The machine's cover, small, on the same light mat as on the template cards. Decorative. */
function CoverThumbnail({ imageId }: { imageId: string }) {
  const url = useImageUrl(imageId);
  return (
    <div className="relative isolate flex aspect-[16/10] w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-50 ring-1 ring-ink-200 ring-inset sm:w-24 dark:bg-ink-800 dark:ring-ink-600">
      {url.data ? (
        <img
          src={url.data}
          alt=""
          className="absolute inset-0 size-full object-contain p-1.5 mix-blend-multiply"
        />
      ) : (
        !url.isError && (
          <LoaderCircle size={16} aria-hidden="true" className="animate-spin text-ink-400" />
        )
      )}
    </div>
  );
}
