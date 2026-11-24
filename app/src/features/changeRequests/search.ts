import type { ChangeRequest } from '@modig/shared';

/**
 * Whether a change request has every word of `query` somewhere in it: what was flagged and what
 * was done about it, the step (its number, text and task), the instruction, its model, the
 * machine, and who flagged and fixed it (their names as well as their emails), or a date
 * ("2026-11"). Case and Swedish letters' case don't matter. An empty query matches everything.
 */
export function matchesChangeRequest(
  request: ChangeRequest,
  query: string,
  /** A person's name for their email, and a model's name for its code. */
  names: { person: (email: string) => string; model: (code: string) => string },
): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold(
    [
      request.message,
      request.resolution,
      request.stepRef,
      request.stepText,
      request.taskTitle,
      request.templateName,
      request.modelCode,
      names.model(request.modelCode),
      request.machineName,
      request.createdBy,
      names.person(request.createdBy),
      request.fixedBy,
      request.fixedBy && names.person(request.fixedBy),
      // The days as the page shows them, so "2026-11-24" (or "2026-11") finds them.
      request.createdAt.slice(0, 10),
      request.fixedAt?.slice(0, 10),
    ]
      .filter(Boolean)
      .join('\n'),
  );
  return words.every((word) => text.includes(word));
}

const fold = (text: string) => text.toLocaleLowerCase('sv');
