/**
 * Inspection storage (brief §3, §4): one JSON blob per inspection, `inspections/{id}.json`, and
 * the yearly FI-YYYY-NNNN counter in `config/inspection-counter.json`.
 *
 * Every write also stores the inspection's list summary in the blob's metadata, so the list is
 * one blob listing instead of one read per inspection.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import type { InvocationContext } from '@azure/functions';
import {
  blobNames,
  CONTAINERS,
  formatInspectionNumber,
  ID_PATTERN,
  InspectionCounterSchema,
  InspectionSchema,
  InspectionSummarySchema,
  inspectionProgress,
  type Inspection,
  type InspectionCounter,
  type InspectionSummary,
} from '@modig/shared';
import { syncDeviations } from './deviations';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ServiceUnavailableError,
} from './http';
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
    if (!latest || latest.etag === last) return;
    await syncDeviations(latest.data);
    last = latest.etag;
  }
  context.warn(`The deviations of inspection ${synced.id} kept changing while being synced`);
}

// ---------------------------------------------------------------------------------------------
// List (brief §5.1)
// ---------------------------------------------------------------------------------------------

export function inspectionSummary(inspection: Inspection): InspectionSummary {
  const { total, filled, nok } = inspectionProgress(inspection);
  const { machineName, serialNumber, modelCode, date } = inspection.front;
  return {
    id: inspection.id,
    number: inspection.number,
    machineName,
    serialNumber,
    modelCode,
    date,
    state: inspection.state,
    nokCount: nok,
    filled,
    total,
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
 * GET /api/inspections: newest number first. One listing with metadata; a blob without a usable
 * summary (written by something other than this API, or by an older one) is read in full.
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

/** "FI-2027-0001" before "FI-2026-0100" before "FI-2026-0099". */
function compareNumbersDescending(a: string, b: string): number {
  const [yearA, seqA] = numberParts(a);
  const [yearB, seqB] = numberParts(b);
  return yearB - yearA || seqB - seqA;
}

function numberParts(number: string): [year: number, sequence: number] {
  const match = /^FI-(\d{4})-(\d+)$/.exec(number);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

// ---------------------------------------------------------------------------------------------
// Numbering (brief §4: "FI-2026-0042", counter kept in a small blob)
// ---------------------------------------------------------------------------------------------

/** Retries after losing a race for the counter; the first try is not counted. */
const COUNTER_RETRIES = 5;

const stockholmYearFormat = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
});

/**
 * Takes the next number from the counter. The counter is written conditionally on the version
 * just read, so two creates at the same moment can never get the same number: the loser reads
 * again and takes the next one. The year is Swedish local time; the sequence restarts each year.
 * A missing counter is created from the highest number in use (ifNoneMatch '*').
 */
export async function nextInspectionNumber(now = new Date()): Promise<string> {
  const year = Number(stockholmYearFormat.format(now));
  for (let retry = 0; ; retry++) {
    const stored = await readJson(config, blobNames.inspectionCounter, InspectionCounterSchema);
    const counter = advance(stored ? stored.data : await highestExistingNumber(), year);
    try {
      await writeJson(
        config,
        blobNames.inspectionCounter,
        counter,
        stored ? { ifMatch: stored.etag } : { ifNoneMatch: '*' },
      );
      return formatInspectionNumber(counter.year, counter.last);
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
 * What a missing counter starts from: the newest inspection's number, so a counter blob that was
 * lost (deleted by hand, a cleared container, a migration without config/) never hands out a
 * number again. Null when there are no inspections, as on a first run.
 */
async function highestExistingNumber(): Promise<InspectionCounter | null> {
  const [newest] = await loadSummaries(); // year, then sequence, descending; unparseable last
  if (!newest) return null;
  const [year, last] = numberParts(newest.number);
  return year ? { year, last } : null;
}

/**
 * The counter after taking one number. A counter already in a later year (another instance's
 * clock passed New Year first) keeps its year: going back would hand out numbers again.
 */
function advance(stored: InspectionCounter | null, year: number): InspectionCounter {
  if (stored && stored.year >= year) return { year: stored.year, last: stored.last + 1 };
  return { year, last: 1 };
}
