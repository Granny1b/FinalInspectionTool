/**
 * Inspection storage (brief §3, §4): one JSON blob per inspection, `inspections/{id}.json`, and
 * the yearly FI-YYYY-NNNN counter in `config/inspection-counter.json`. A quality check done on a
 * machine is an inspection of kind `quality`, stored the same way, with its own QC-YYYY-NNNN
 * series counted in `config/quality-check-counter.json`.
 *
 * Every write also stores the inspection's list summary in the blob's metadata, so the list is
 * one blob listing instead of one read per inspection.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import type { InvocationContext } from '@azure/functions';
import { isRestError } from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  formatInspectionNumber,
  ID_PATTERN,
  InspectionCounterSchema,
  InspectionSchema,
  InspectionSummarySchema,
  inspectionProgress,
  parseInspectionNumber,
  templateImageIds,
  type Inspection,
  type InspectionCounter,
  type InspectionKind,
  type InspectionSummary,
} from '@modig/shared';
import { deleteDeviationRows, syncDeviations } from './deviations';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ServiceUnavailableError,
} from './http';
import { deleteImages } from './images';
import { loadSettings } from './settings';
import {
  containerClient,
  ensureStorage,
  readJson,
  writeJson,
  type WriteConditions,
} from './storage';

const { inspections, config } = CONTAINERS;

export type StoredInspection = { data: Inspection; etag: string };

export function inspectionNotFound(): NotFoundError {
  return new NotFoundError('This inspection does not exist.');
}

export async function loadInspection(id: string): Promise<StoredInspection | null> {
  return readJson(inspections, blobNames.inspection(id), InspectionSchema);
}

/** Writes the inspection with its list summary as metadata; returns the new ETag. */
export async function writeInspection(
  inspection: Inspection,
  conditions: WriteConditions,
): Promise<string> {
  return writeJson(inspections, blobNames.inspection(inspection.id), inspection, {
    ...conditions,
    metadata: summaryMetadata(inspection),
  });
}

/** Extra syncs after another write moved the inspection on; then the writer gives up and logs. */
const SETTLE_ROUNDS = 3;

/**
 * Syncs the deviation table from `synced`, stored as version `etag`, then checks the blob. Nothing
 * orders two writers' syncs, so a slow sync can land after a newer write's sync and leave the
 * table behind; whoever syncs last therefore checks that the blob is still the version it synced,
 * and syncs again from the latest version if not. A sync failure is thrown for the caller.
 */
export async function syncSettled(
  synced: Inspection,
  etag: string,
  context: InvocationContext,
): Promise<void> {
  await syncDeviations(synced);
  let last = etag;
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    const latest = await loadInspection(synced.id);
    // Deleted meanwhile: the rows just written belong to nothing. The delete removes the rows
    // after the blob, so whichever of the two finishes last leaves none behind.
    if (!latest) return deleteDeviationRows(synced.front.modelCode, synced.id);
    if (latest.etag === last) return;
    await syncDeviations(latest.data);
    last = latest.etag;
  }
  context.warn(`The deviations of inspection ${synced.id} kept changing while being synced`);
}

// ---------------------------------------------------------------------------------------------
// Delete (admins)
// ---------------------------------------------------------------------------------------------

/**
 * Deletes an inspection for good: its blob, only while it is still version `ifMatch` (412
 * otherwise, 404 if it is gone already), then its deviation rows and the photos only it uses. The
 * blob goes first: without it the inspection no longer exists anywhere the app looks (the list,
 * its page, Insights, which counts only the rows of listed inspections). The rest is best effort:
 * whatever can't be deleted is logged and left behind, unused, and the delete still succeeds,
 * since a retry would only get a 404. Its number is never handed out again (the counter only
 * counts up, and a lost counter carries on from the highest number in use).
 */
export async function deleteInspection(
  inspection: Inspection,
  ifMatch: string,
  context: InvocationContext,
): Promise<void> {
  await ensureStorage();
  const { id } = inspection;
  const blob = containerClient(inspections).getBlobClient(blobNames.inspection(id));
  await blob.delete({ conditions: { ifMatch } }).catch(async (error: unknown) => {
    if (isRestError(error) && error.statusCode === 404) throw inspectionNotFound();
    if (isRestError(error) && error.statusCode === 412) {
      // Storage may answer the condition with 412 when the blob is gone, too: another admin
      // deleted it meanwhile, which is a 404 (the app counts that as deleted), not a conflict.
      throw (await blob.exists()) ? new PreconditionFailedError() : inspectionNotFound();
    }
    throw error;
  });
  await Promise.all([
    deleteDeviationRows(inspection.front.modelCode, id).catch((error: unknown) => {
      context.warn(`Deleted inspection ${id}; deleting its deviation rows failed`, error);
    }),
    deletePhotos(inspection, context).catch((error: unknown) => {
      context.warn(`Deleted inspection ${id}; deleting its photos failed`, error);
    }),
  ]);
}

/** The photos only `inspection` uses; the logo is read first, so it is never one of them. */
async function deletePhotos(inspection: Inspection, context: InvocationContext): Promise<void> {
  const logo = (await loadSettings())?.logoImageId;
  const failed = await deleteImages(ownImageIds(inspection, logo ? [logo] : []));
  for (const { imageId, reason } of failed) {
    context.warn(
      `Deleted inspection ${inspection.id}; images/${blobNames.image(imageId)} was left`,
      reason,
    );
  }
}

/**
 * The images only this inspection uses: its deviations' photos (on rows and extra deviations)
 * and their marked-up copies. Every upload gets a new id, so no other document names them. As a
 * guard against hand-edited data, an id the inspection also uses for anything else is never one
 * of them: a guide image of its frozen checklist (it belongs to the template, and other
 * inspections share it), the machine photo (often the template's cover), or one in `keep`.
 */
export function ownImageIds(inspection: Inspection, keep: Iterable<string> = []): string[] {
  const photos = [
    ...Object.values(inspection.results).flatMap((result) => result.photos ?? []),
    ...inspection.extraDeviations.flatMap((extra) => extra.photos ?? []),
  ];
  const own = new Set(
    photos.flatMap(({ imageId, renderedImageId }) =>
      renderedImageId ? [imageId, renderedImageId] : [imageId],
    ),
  );
  const shared = new Set([
    ...keep,
    ...templateImageIds({ sections: inspection.templateSnapshot.sections }),
    ...(inspection.front.photoId ? [inspection.front.photoId] : []),
  ]);
  return [...own].filter((imageId) => !shared.has(imageId));
}

// ---------------------------------------------------------------------------------------------
// List (brief §5.1)
// ---------------------------------------------------------------------------------------------

export function inspectionSummary(inspection: Inspection): InspectionSummary {
  const { total, filled, ok, nok } = inspectionProgress(inspection);
  const { machineName, serialNumber, modelCode, date } = inspection.front;
  return {
    id: inspection.id,
    kind: inspection.kind,
    number: inspection.number,
    machineName,
    serialNumber,
    modelCode,
    date,
    state: inspection.state,
    nokCount: nok,
    okCount: ok,
    filled,
    total,
    templateId: inspection.templateId,
    templateRevision: inspection.templateRevision,
    templateName: inspection.templateSnapshot.name,
    updatedAt: inspection.updatedAt,
  };
}

/**
 * One metadata entry, `summary`: the summary (minus the id, which is the blob name) as
 * URI-encoded JSON. Metadata travels as HTTP headers, so values must be ASCII; JSON.stringify
 * also escapes lone surrogates, which encodeURIComponent alone would throw on.
 */
const SUMMARY_KEY = 'summary';
const StoredSummarySchema = InspectionSummarySchema.omit({ id: true });

function summaryMetadata(inspection: Inspection): Record<string, string> {
  const { id: _id, ...summary } = inspectionSummary(inspection);
  return { [SUMMARY_KEY]: encodeURIComponent(JSON.stringify(summary)) };
}

/** The summary stored with a blob, or null if it is missing or unreadable. */
function summaryFromMetadata(
  id: string,
  metadata: Record<string, string> | undefined,
): InspectionSummary | null {
  const value = metadata?.[SUMMARY_KEY];
  if (!value) return null;
  try {
    const result = StoredSummarySchema.safeParse(JSON.parse(decodeURIComponent(value)));
    return result.success ? { id, ...result.data } : null;
  } catch {
    return null; // not URI-encoded JSON
  }
}

/** `{id}.json` → id; null for any other blob. */
function idFromBlobName(name: string): string | null {
  const id = name.endsWith('.json') ? name.slice(0, -'.json'.length) : '';
  return ID_PATTERN.test(id) ? id : null;
}

/**
 * GET /api/inspections: final inspections and quality checks, each with its kind, newest number
 * first. One listing with metadata; a blob without a usable summary (written by something other
 * than this API, or by an older one) is read in full. A summary stored before quality checks
 * could be done has no kind: it is a final inspection's.
 */
export async function loadSummaries(): Promise<InspectionSummary[]> {
  await ensureStorage();
  const pending: Promise<InspectionSummary | null>[] = [];
  for await (const blob of containerClient(inspections).listBlobsFlat({ includeMetadata: true })) {
    const id = idFromBlobName(blob.name);
    if (!id) continue; // not an inspection
    const summary = summaryFromMetadata(id, blob.metadata);
    pending.push(
      summary
        ? Promise.resolve(summary)
        : loadInspection(id).then((stored) => stored && inspectionSummary(stored.data)),
    );
  }
  const summaries = (await Promise.all(pending)).filter((summary) => summary !== null);
  return summaries.sort(
    (a, b) => compareNumbersDescending(a.number, b.number) || a.id.localeCompare(b.id),
  );
}

/**
 * "FI-2027-0001" before "FI-2026-0100" before "FI-2026-0099"; the two series by the same rule,
 * final inspections first on a tie ("FI-2026-0003" before "QC-2026-0003").
 */
function compareNumbersDescending(a: string, b: string): number {
  const [yearA, seqA] = numberParts(a);
  const [yearB, seqB] = numberParts(b);
  return yearB - yearA || seqB - seqA || a.localeCompare(b);
}

function numberParts(number: string): [year: number, sequence: number] {
  const parsed = parseInspectionNumber(number);
  return parsed ? [parsed.year, parsed.sequence] : [0, 0];
}

// ---------------------------------------------------------------------------------------------
// Numbering (brief §4: "FI-2026-0042", counter kept in a small blob; quality checks
// "QC-2026-0007", in a counter of their own)
// ---------------------------------------------------------------------------------------------

/** Each series' counter blob in `config/`. */
const COUNTERS: Record<InspectionKind, string> = {
  final: blobNames.inspectionCounter,
  quality: blobNames.qualityCheckCounter,
};

/** Retries after losing a race for the counter; the first try is not counted. */
const COUNTER_RETRIES = 5;

const stockholmYearFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
});

/**
 * Takes the next number of the kind's series from its counter: FI- for final inspections, QC-
 * for quality checks, each counted on its own. The counter is written conditionally on the
 * version just read, so two creates at the same moment can never get the same number: the loser
 * reads again and takes the next one. The year is Swedish local time; the sequence restarts each
 * year. A missing counter is created from the highest number of its series in use
 * (ifNoneMatch '*').
 */
export async function nextInspectionNumber(
  kind: InspectionKind = 'final',
  now = new Date(),
): Promise<string> {
  const year = Number(stockholmYearFormat.format(now));
  const blobName = COUNTERS[kind];
  for (let retry = 0; ; retry++) {
    const stored = await readJson(config, blobName, InspectionCounterSchema);
    const counter = advance(stored ? stored.data : await highestExistingNumber(kind), year);
    try {
      await writeJson(
        config,
        blobName,
        counter,
        stored ? { ifMatch: stored.etag } : { ifNoneMatch: '*' },
      );
      return formatInspectionNumber(counter.year, counter.last, kind);
    } catch (error) {
      const lostRace = error instanceof PreconditionFailedError || error instanceof ConflictError;
      if (!lostRace) throw error;
      if (retry === COUNTER_RETRIES) {
        throw new ServiceUnavailableError(
          'Too many inspections are being created at once. Try again.',
        );
      }
      // Random, growing waits spread the losers out, so they don't collide again.
      await sleep(Math.random() * 50 * 2 ** (retry + 1));
    }
  }
}

/**
 * What a missing counter starts from: the newest number of its series, so a counter blob that
 * was lost (deleted by hand, a cleared container, a migration without config/) never hands out a
 * number again. Null when there are none, as on a first run.
 */
async function highestExistingNumber(kind: InspectionKind): Promise<InspectionCounter | null> {
  // Year, then sequence, descending; unparseable last.
  const newest = (await loadSummaries())
    .map((summary) => parseInspectionNumber(summary.number))
    .find((parsed) => parsed?.kind === kind);
  return newest ? { year: newest.year, last: newest.sequence } : null;
}

/**
 * The counter after taking one number. A counter already in a later year (another instance's
 * clock passed New Year first) keeps its year: going back would hand out numbers again.
 */
function advance(stored: InspectionCounter | null, year: number): InspectionCounter {
  if (stored && stored.year >= year) return { year: stored.year, last: stored.last + 1 };
  return { year, last: 1 };
}
