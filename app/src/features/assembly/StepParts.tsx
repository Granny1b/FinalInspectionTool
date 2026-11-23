import {
  documentName,
  formatMinutes,
  isWebLink,
  type AssemblyStep,
  type Fastener,
  type StepDocument,
} from '@modig/shared';
import clsx from 'clsx';
import { Check, Clock, Copy, ExternalLink, FileText, PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

const CHIP =
  'inline-flex h-6 max-w-full items-center gap-1 rounded-sm px-1.5 text-xs ring-1 ring-inset';

/** A step's department, time and "from pre-assembly", as small chips in one line. */
export function StepFacts({ step, className }: { step: AssemblyStep; className?: string }) {
  const { department, minutes, fromPreAssembly } = step;
  if (!department?.trim() && minutes === undefined && !fromPreAssembly) return null;
  return (
    <ul className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      {department?.trim() && (
        <li className={clsx(CHIP, 'bg-brand-50 font-medium text-brand-800 ring-brand-100')}>
          <span className="sr-only">Department: </span>
          <span className="truncate">{department.trim()}</span>
        </li>
      )}
      {minutes !== undefined && (
        <li className={clsx(CHIP, 'bg-ink-50 text-ink-700 tabular-nums ring-ink-200')}>
          <Clock size={12} aria-hidden="true" className="shrink-0 text-ink-500" />
          <span className="sr-only">Estimated time: </span>
          {formatMinutes(minutes)}
        </li>
      )}
      {fromPreAssembly && (
        <li className={clsx(CHIP, 'bg-ink-50 text-ink-700 ring-ink-200')}>
          <PackageCheck size={12} aria-hidden="true" className="shrink-0 text-ink-500" />
          From pre-assembly
        </li>
      )}
    </ul>
  );
}

const LABEL = 'text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase';

/** The bolt list as a small table: how many, of what. */
export function BoltList({ fasteners, stepRef }: { fasteners: Fastener[]; stepRef: string }) {
  return (
    <div>
      <p className={LABEL}>Bolts</p>
      <table aria-label={`Bolts of step ${stepRef}`} className="mt-1 text-sm text-ink-900">
        <tbody>
          {fasteners.map((fastener, index) => (
            <tr key={index} className="align-baseline">
              <td className="pr-3 text-right font-semibold whitespace-nowrap tabular-nums">
                {fastener.quantity ? `${fastener.quantity} ×` : ''}
              </td>
              <td className="wrap-break-word">{fastener.designation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Part numbers, and the assembly they are found in. */
export function PartList({ step, stepRef }: { step: AssemblyStep; stepRef: string }) {
  const parts = step.partNumbers ?? [];
  const assy = [step.assyNumber?.trim(), step.assyName?.trim()].filter(Boolean).join(' · ');
  if (parts.length === 0 && !assy) return null;
  return (
    <div className="min-w-0">
      <p className={LABEL}>Parts</p>
      {parts.length > 0 && (
        <ul aria-label={`Part numbers of step ${stepRef}`} className="mt-1 flex flex-wrap gap-1">
          {parts.map((part) => (
            <li
              key={part}
              className={clsx(
                CHIP,
                'bg-ink-100 font-medium text-ink-800 tabular-nums ring-ink-200',
              )}
            >
              <span className="truncate">{part}</span>
            </li>
          ))}
        </ul>
      )}
      {assy && (
        <p className="mt-1 text-xs wrap-break-word text-ink-600">
          <span className="text-ink-500">Assy </span>
          {assy}
        </p>
      )}
    </div>
  );
}

/**
 * A step's documents. A web address opens in a new tab; a path on the file server can't be opened
 * from a web page, so it is shown with a button that copies it, to paste into Explorer.
 */
export function DocumentList({ documents }: { documents: StepDocument[] }) {
  return (
    <div className="min-w-0">
      <p className={LABEL}>Documents</p>
      <ul className="mt-1 space-y-1">
        {documents.map((document, index) => (
          <li key={index} className="min-w-0">
            <DocumentLine document={document} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocumentLine({ document }: { document: StepDocument }) {
  const name = documentName(document);
  if (isWebLink(document.target)) {
    return (
      <a
        href={document.target.trim()}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
      >
        <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{name}</span>
      </a>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-2">
      <FileText size={14} aria-hidden="true" className="mt-1 shrink-0 text-ink-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium wrap-break-word text-ink-900">{name}</p>
        <p className="font-mono text-xs break-all text-ink-500 select-all">{document.target}</p>
      </div>
      <CopyButton text={document.target} label={`Copy the path of ${name}`} />
    </div>
  );
}

/** Copies `text`; says "Copied" for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-ink-300 bg-surface px-2 text-xs font-medium text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50"
    >
      <Icon size={13} aria-hidden="true" className={copied ? 'text-ok-fg' : undefined} />
      <span aria-live="polite">{copied ? 'Copied' : 'Copy path'}</span>
    </button>
  );
}
