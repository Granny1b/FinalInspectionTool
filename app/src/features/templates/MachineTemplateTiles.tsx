import { ChevronRight, ClipboardCheck, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import {
  assemblyInstructionsOf,
  qualityChecksHref,
  qualityChecksOf,
  templateAssemblyHref,
  useTemplates,
} from './queries';

type Props = {
  /** The machine template: its model's final inspection template. */
  templateId: string;
  modelCode: string;
};

/**
 * What a machine template holds, on its landing page: its assembly instructions, its quality
 * checks and its final inspection, each with how many there are and how many are published, and
 * a link to its tab. In the order of a build.
 */
export function MachineTemplateTiles({ templateId, modelCode }: Props) {
  const templates = useTemplates();
  const list = templates.data ?? [];
  const final = list.find((template) => template.id === templateId);
  const published = (entries: { publishedRevision: number | null }[]) =>
    entries.filter((entry) => entry.publishedRevision !== null).length;
  const count = (entries: { publishedRevision: number | null }[], one: string, many: string) =>
    entries.length === 0
      ? `No ${many} yet`
      : `${entries.length} ${entries.length === 1 ? one : many} · ${published(entries)} published`;
  const instructions = assemblyInstructionsOf(list, modelCode);
  const checks = qualityChecksOf(list, templateId);
  const tiles: { to: string; icon: LucideIcon; label: string; text: string }[] = [
    {
      to: templateAssemblyHref(templateId),
      icon: Wrench,
      label: 'Assembly',
      text: count(instructions, 'instruction', 'instructions'),
    },
    {
      to: qualityChecksHref(templateId),
      icon: ShieldCheck,
      label: 'Quality checks',
      text: count(checks, 'quality check', 'quality checks'),
    },
    {
      to: `/templates/${templateId}`,
      icon: ClipboardCheck,
      label: 'Final inspection',
      text: !final
        ? ''
        : final.itemCount === 0
          ? 'No checklist yet'
          : `${final.itemCount} rows · ${
              final.publishedRevision === null ? 'not published' : `Rev ${final.publishedRevision}`
            }`,
    },
  ];
  return (
    <nav aria-label="What this machine template holds">
      <ul className="space-y-2">
        {tiles.map(({ to, icon: Icon, label, text }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-center gap-3 rounded-lg border border-ink-200 bg-surface px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
              >
                <Icon size={18} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900">{label}</span>
                <span className="block truncate text-xs text-ink-500 tabular-nums">{text}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-400" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
