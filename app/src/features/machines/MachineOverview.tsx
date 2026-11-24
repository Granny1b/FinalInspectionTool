import type { MachineAssemblySummary, MachineCheck } from '@modig/shared';
import clsx from 'clsx';
import {
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

type Props = {
  /** Undefined while they load. */
  assemblies: readonly MachineAssemblySummary[] | undefined;
  checks: readonly MachineCheck[];
};

import { MACHINE_SECTIONS } from './sections';

type Tone = 'done' | 'active' | 'idle';

/**
 * A machine's build at a glance, in the order it is done: assembly, then the quality checks, then
 * the final inspection. Each says how far it has come (green when done) and jumps to its section.
 */
export function MachineOverview({ assemblies, checks }: Props) {
  const steps = (assemblies ?? []).reduce((sum, assembly) => sum + assembly.steps, 0);
  const signed = (assemblies ?? []).reduce((sum, assembly) => sum + assembly.signed, 0);
  const quality = checks.filter((check) => check.kind === 'quality');
  const qualityDone = quality.filter((check) => check.state === 'finalised').length;
  const final = checks.find((check) => check.kind === 'final');

  const stages: { id: string; label: string; icon: LucideIcon; tone: Tone; text: string }[] = [
    {
      id: MACHINE_SECTIONS.assembly,
      label: 'Assembly',
      icon: Wrench,
      ...(assemblies === undefined
        ? { tone: 'idle', text: 'Loading…' }
        : assemblies.length === 0
          ? { tone: 'idle', text: 'No instruction' }
          : steps > 0 && signed === steps
            ? { tone: 'done', text: 'Completed' }
            : {
                tone: signed > 0 ? 'active' : 'idle',
                text: `${signed} of ${steps} steps signed`,
              }),
    },
    {
      id: MACHINE_SECTIONS.quality,
      label: 'Quality checks',
      icon: ShieldCheck,
      ...(quality.length === 0
        ? { tone: 'idle', text: 'None added' }
        : qualityDone === quality.length
          ? { tone: 'done', text: `All ${quality.length} finalised` }
          : {
              tone: quality.some((check) => check.state !== 'not_started') ? 'active' : 'idle',
              text: `${qualityDone} of ${quality.length} finalised`,
            }),
    },
    {
      id: MACHINE_SECTIONS.final,
      label: 'Final inspection',
      icon: ClipboardCheck,
      ...(!final
        ? { tone: 'idle', text: 'Not added' }
        : final.state === 'finalised'
          ? { tone: 'done', text: 'Finalised' }
          : final.state === 'in_progress'
            ? { tone: 'active', text: 'In progress' }
            : { tone: 'idle', text: 'Not started' }),
    },
  ];

  return (
    <nav aria-label="Build overview">
      <ol className="grid gap-2 sm:grid-cols-3">
        {stages.map(({ id, label, icon: Icon, tone, text }, index) => (
          <li key={id} className="relative">
            <a
              href={`#${id}`}
              className={clsx(
                'flex h-full items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                tone === 'done'
                  ? 'border-ok-border bg-ok-bg hover:border-ok-fg'
                  : tone === 'active'
                    ? 'border-brand-200 bg-brand-50 hover:border-brand-400'
                    : 'border-ink-200 bg-surface hover:border-ink-300',
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  tone === 'done'
                    ? 'bg-ok-fg text-white dark:text-ink-50'
                    : tone === 'active'
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-100 text-ink-600',
                )}
              >
                {tone === 'done' ? (
                  <CircleCheck size={18} />
                ) : (
                  <Icon size={18} strokeWidth={1.75} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-ink-500">
                  {index + 1}. {label}
                </span>
                <span
                  className={clsx(
                    'block truncate text-sm font-semibold tabular-nums',
                    tone === 'done' ? 'text-ok-fg' : 'text-ink-900',
                  )}
                >
                  {text}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-400" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
