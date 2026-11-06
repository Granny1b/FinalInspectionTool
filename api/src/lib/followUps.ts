/**
 * The follow-up of an inspection's deviations (shared/src/deviationLog.ts): one blob per
 * inspection, `follow-ups/{inspectionId}.json`, the truth about which deviations are closed. It
 * is never the inspection's blob, so closing a deviation never changes the inspection's ETag: the
 * open inspection page keeps saving without a false conflict.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { isRestError } from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  FollowUpsSchema,
  type FollowUp,
  type FollowUps,
} from '@modig/shared';
import { ConflictError, PreconditionFailedError, ServiceUnavailableError } from './http';
import { containerClient, ensureStorage, readJson, writeJson } from './storage';

const { followUps: container } = CONTAINERS;

export type StoredFollowUps = { data: FollowUps; etag: string };

/** The inspection's follow-ups with their ETag; null before any deviation was followed up. */
export async function loadFollowUps(inspectionId: string): Promise<StoredFollowUps | null> {
  return readJson(container, blobNames.followUps(inspectionId), FollowUpsSchema);
}

/**
 * The follow-ups' current version (one HEAD request), or null when there are none: whether a
 * sync read the latest.
 */
export async function followUpsVersion(inspectionId: string): Promise<string | null> {
  await ensureStorage();
  const properties = await containerClient(container)
    .getBlobClient(blobNames.followUps(inspectionId))
    .getProperties()
    .catch((error: unknown) => {
      if (isRestError(error) && error.statusCode === 404) return null;
      throw error;
    });
  return properties?.etag ?? null;
}

/** Retries after another write got in between; the first try is not counted. */
const WRITE_RETRIES = 5;

/**
 * Sets one deviation's follow-up to what `update` makes of the current one, and returns it. Read,
 * change, write only over the version read (If-Match, or If-None-Match for the first): two people
 * closing two deviations of the same inspection at once both land, the second after reading the
 * first's.
 */
export async function writeFollowUp(
  inspectionId: string,
  key: string,
  update: (current: FollowUp | undefined) => FollowUp,
): Promise<FollowUp> {
  const blobName = blobNames.followUps(inspectionId);
  for (let retry = 0; ; retry++) {
    const stored = await loadFollowUps(inspectionId);
    const next = update(stored?.data.followUps[key]);
    const document: FollowUps = {
      inspectionId,
      followUps: { ...stored?.data.followUps, [key]: next },
    };
    try {
      await writeJson(
        container,
        blobName,
        document,
        stored ? { ifMatch: stored.etag } : { ifNoneMatch: '*' },
      );
      return next;
    } catch (error) {
      const lostRace = error instanceof PreconditionFailedError || error instanceof ConflictError;
      if (!lostRace) throw error;
      if (retry === WRITE_RETRIES) {
        throw new ServiceUnavailableError(
          'Too many changes to this inspection’s deviations at once. Try again.',
        );
      }
      // Random, growing waits spread the writers out, so they don't collide again.
      await sleep(Math.random() * 50 * 2 ** (retry + 1));
    }
  }
}

/** Deletes an inspection's follow-ups (the inspection was deleted); none is no error. */
export async function deleteFollowUps(inspectionId: string): Promise<void> {
  await ensureStorage();
  await containerClient(container)
    .getBlobClient(blobNames.followUps(inspectionId))
    .deleteIfExists();
}
