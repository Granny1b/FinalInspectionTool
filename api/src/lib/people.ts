/**
 * The people list (`config/people.json`, see shared/src/people.ts): who may use the app, with
 * the name shown for them and their role, managed by admins in Settings. endpoint() needs it for
 * every request to resolve the caller, so that lookup goes through a cache of a few seconds per
 * Functions instance. A save clears this instance's cache at once; other instances see it within
 * CACHE_MS, which is how long a removed person may keep their access there.
 */
import { blobNames, CONTAINERS, PeopleSchema, type People, type Person } from '@modig/shared';
import { readJson, writeJson } from './storage';

/** The list with its ETag, or null before anyone was added. */
export async function loadStoredPeople(): Promise<{ data: People; etag: string } | null> {
  return readJson(CONTAINERS.config, blobNames.people, PeopleSchema);
}

/** Saves only over the version read, or only as the first list when there was none. */
export type PeopleWriteCondition = { ifMatch: string } | { ifNoneMatch: '*' };

/**
 * Writes the list conditionally and returns the new ETag. A failed condition throws as the
 * storage helpers do (412 for If-Match, 409 for If-None-Match).
 */
export async function writePeople(
  people: People,
  condition: PeopleWriteCondition,
): Promise<string> {
  try {
    return await writeJson(
      CONTAINERS.config,
      blobNames.people,
      PeopleSchema.parse(people),
      condition,
    );
  } finally {
    // After the write, not before: a lookup in between would cache the old list again.
    forgetCachedPeople();
  }
}

const CACHE_MS = 5_000;
let cached: { until: number; people: Promise<Person[]> } | undefined;

/** Everyone on the list (none before anyone was added), at most CACHE_MS old. */
export function cachedPeople(): Promise<Person[]> {
  const now = Date.now();
  if (cached && now < cached.until) return cached.people;
  const entry = {
    until: now + CACHE_MS,
    people: loadStoredPeople().then((stored) => stored?.data.people ?? []),
  };
  cached = entry;
  // A failed read is not kept: the next request reads again.
  entry.people.catch(() => {
    if (cached === entry) cached = undefined;
  });
  return entry.people;
}

/** Drops the cached list: after a save, and in tests that change people.json directly. */
export function forgetCachedPeople(): void {
  cached = undefined;
}
