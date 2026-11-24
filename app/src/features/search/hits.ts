/**
 * What the search finds, and how: every machine, check, template, assembly instruction and, inside
 * the published instructions, every step, assy and part number and document, each as a hit that
 * leads to its exact place. Pure: the dialog gives it what the app has loaded.
 */
import {
  documentName,
  isWebLink,
  stepRef,
  type InspectionSummary,
  type MachineModel,
  type MachineSummary,
  type Template,
  type TemplateSummary,
} from '@modig/shared';

/** The groups, in the order they are always shown. */
export const HIT_GROUPS = [
  'machines',
  'steps',
  'parts',
  'documents',
  'instructions',
  'checks',
  'templates',
] as const;
export type HitGroup = (typeof HIT_GROUPS)[number];

export const HIT_GROUP_LABELS: Record<HitGroup, string> = {
  machines: 'Machines',
  steps: 'Assembly steps',
  parts: 'Assy and part numbers',
  documents: 'Drawings and documents',
  instructions: 'Assembly instructions',
  checks: 'Inspections and quality checks',
  templates: 'Templates',
};

export type Hit = {
  group: HitGroup;
  /** Unique among all hits. */
  key: string;
  title: string;
  /** Where it leads, in words: the grey line under the title. */
  detail: string;
  href: string;
  /** A document's path on the file server, to copy straight from the result. */
  copy?: string;
  /** Everything it is found by, lower case. */
  text: string;
};

export type SearchData = {
  machines: readonly MachineSummary[];
  inspections: readonly InspectionSummary[];
  templates: readonly TemplateSummary[];
  /** The latest published revision of each assembly instruction that has one. */
  instructions: readonly Template[];
  models: readonly MachineModel[] | undefined;
  /** Admins also find drafts never published; everyone else only what is published. */
  isAdmin: boolean;
  /**
   * The machine an instruction was last worked on here (from "Continue"), by the instruction's
   * id: its hits then lead there, where the steps are signed.
   */
  onMachine: ReadonlyMap<string, { path: string; machineName: string }>;
};

const fold = (text: string) => text.toLocaleLowerCase('sv');
const hay = (...parts: (string | undefined | false)[]) => fold(parts.filter(Boolean).join('\n'));

const STATE_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  finalised: 'Finalised',
};

export function buildHits(data: SearchData): Hit[] {
  const modelName = (code: string) =>
    data.models?.find((model) => model.code === code)?.name ?? code;
  const hits: Hit[] = [];

  for (const machine of data.machines) {
    const model = modelName(machine.modelCode);
    hits.push({
      group: 'machines',
      key: `machine:${machine.id}`,
      title: machine.machineName || 'No Machine ID',
      detail: `S/N ${machine.serialNumber || '—'} · ${model}`,
      href: `/machines/${machine.id}`,
      text: hay(machine.machineName, machine.serialNumber, model, machine.modelCode),
    });
  }

  for (const revision of data.instructions) {
    const machine = data.onMachine.get(revision.id);
    const base = machine?.path ?? `/assembly/${revision.id}/revisions/${revision.revision}`;
    const where = machine ? `${revision.name} · on ${machine.machineName}` : revision.name;
    /** An assy or part number of this instruction, with the steps that name it. */
    const numbers = new Map<string, { label: string; name: string; steps: number }>();
    const count = (number: string | undefined, label: string, name = '') => {
      const key = number?.trim();
      if (!key) return;
      const entry = numbers.get(`${label}:${fold(key)}`) ?? {
        label: `${label} ${key}`,
        name,
        steps: 0,
      };
      entry.steps += 1;
      entry.name ||= name;
      numbers.set(`${label}:${fold(key)}`, entry);
    };
    /** A document of this instruction, with the first step that points to it. */
    const documents = new Map<
      string,
      { title: string; target: string; ref: string; itemId: string; steps: number }
    >();

    revision.sections.forEach((section, taskIndex) => {
      section.items.forEach((item, stepIndex) => {
        const ref = stepRef(taskIndex, stepIndex);
        const step = item.assembly;
        hits.push({
          group: 'steps',
          key: `step:${revision.id}:${item.id}`,
          title: `${ref} ${item.text || 'Empty step'}`,
          detail: `${where} · ${section.title || 'Untitled task'}`,
          href: `${base}#row-${item.id}`,
          text: hay(
            ref,
            item.text,
            item.guide?.description,
            ...(step?.fasteners ?? []).map((fastener) => fastener.designation),
          ),
        });
        count(step?.assyNumber, 'Assy', step?.assyName?.trim());
        for (const part of step?.partNumbers ?? []) count(part, 'Part');
        for (const document of step?.documents ?? []) {
          const key = fold(document.target.trim());
          const entry = documents.get(key);
          if (entry) entry.steps += 1;
          else {
            documents.set(key, {
              title: documentName(document),
              target: document.target.trim(),
              ref,
              itemId: item.id,
              steps: 1,
            });
          }
        }
      });
    });

    for (const [key, { label, name, steps }] of numbers) {
      const number = label.slice(label.indexOf(' ') + 1);
      hits.push({
        group: 'parts',
        key: `number:${revision.id}:${key}`,
        title: name ? `${label} · ${name}` : label,
        detail: `${steps} ${steps === 1 ? 'step' : 'steps'} · ${where}`,
        href: `${base}?q=${encodeURIComponent(number)}`,
        text: hay(number, name),
      });
    }
    for (const [key, document] of documents) {
      hits.push({
        group: 'documents',
        key: `document:${revision.id}:${key}`,
        title: document.title,
        detail: `Step ${document.ref}${document.steps > 1 ? ` and ${document.steps - 1} more` : ''} · ${where}`,
        href: `${base}#row-${document.itemId}`,
        ...(!isWebLink(document.target) && { copy: document.target }),
        text: hay(document.title, document.target),
      });
    }
  }

  for (const template of data.templates) {
    const published = template.publishedRevision !== null;
    if (!published && !data.isAdmin) continue;
    const model = modelName(template.modelCode);
    const revision = published ? `Rev ${template.publishedRevision}` : 'Not published';
    if (template.kind === 'assembly') {
      hits.push({
        group: 'instructions',
        key: `instruction:${template.id}`,
        title: template.name || 'Untitled assembly instruction',
        detail: `${model} · ${revision}`,
        href: `/assembly/${template.id}`,
        text: hay(template.name, model, template.modelCode),
      });
    } else {
      const quality = template.kind === 'quality';
      hits.push({
        group: 'templates',
        key: `template:${template.id}`,
        title: template.name || (quality ? 'Untitled quality check' : 'Untitled template'),
        detail: `${quality ? 'Quality check template' : 'Final inspection template'} · ${model} · ${revision}`,
        href:
          quality && template.parentId
            ? `/templates/${template.parentId}/quality-checks/${template.id}`
            : `/templates/${template.id}`,
        text: hay(template.name, model, template.modelCode),
      });
    }
  }

  for (const inspection of data.inspections) {
    if (inspection.state === 'not_started') continue;
    const quality = inspection.kind === 'quality';
    hits.push({
      group: 'checks',
      key: `check:${inspection.id}`,
      title: inspection.number,
      detail: [
        quality ? inspection.templateName || 'Quality check' : 'Final inspection',
        inspection.machineName,
        inspection.date,
        STATE_LABELS[inspection.state],
      ]
        .filter(Boolean)
        .join(' · '),
      href: `${quality ? '/quality-checks' : '/inspections'}/${inspection.id}`,
      text: hay(
        inspection.number,
        inspection.machineName,
        inspection.serialNumber,
        inspection.templateName,
        modelName(inspection.modelCode),
      ),
    });
  }
  return hits;
}

/** How many hits of a group are shown before "and N more". */
export const GROUP_LIMIT = 6;

export type SearchResults = {
  groups: { group: HitGroup; hits: Hit[]; total: number }[];
  total: number;
  /** The words searched for, lower case, for marking them in the results. */
  words: string[];
};

/**
 * The hits that have every word of `query`, by group in the groups' fixed order. Within a group
 * the best first: a title that is the query, then one that starts with it, then one that has it
 * whole, then the rest as they come.
 */
export function searchHits(hits: readonly Hit[], query: string): SearchResults {
  const whole = fold(query.trim().replace(/\s+/g, ' '));
  const words = whole.split(' ').filter(Boolean);
  if (words.length === 0) return { groups: [], total: 0, words };
  const score = (hit: Hit) => {
    const title = fold(hit.title);
    if (title === whole) return 4;
    if (title.startsWith(whole)) return 3;
    return title.includes(whole) ? 2 : 1;
  };
  const found = hits
    .filter((hit) => words.every((word) => hit.text.includes(word)))
    .map((hit, index) => ({ hit, index, score: score(hit) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const groups = HIT_GROUPS.map((group) => {
    const ofGroup = found.filter((entry) => entry.hit.group === group).map((entry) => entry.hit);
    return { group, hits: ofGroup.slice(0, GROUP_LIMIT), total: ofGroup.length };
  }).filter((entry) => entry.total > 0);
  return { groups, total: found.length, words };
}

/** `text` in pieces, those that are one of `words` marked: for showing why a hit was found. */
export function markWords(
  text: string,
  words: readonly string[],
): { text: string; hit: boolean }[] {
  const found = words.filter(Boolean);
  if (found.length === 0) return [{ text, hit: false }];
  const escaped = found.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu');
  return text
    .split(pattern)
    .filter((piece) => piece !== '')
    .map((piece) => ({ text: piece, hit: found.includes(fold(piece)) }));
}
