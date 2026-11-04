/**
 * The people list (`config/people.json`) in the Azurite that `npm run dev` starts. Tests add
 * people through Settings with emails of their own and take them off again here, so the list
 * other tests (and a developer) see is left as it was.
 */
import { BlobServiceClient } from '@azure/storage-blob';
import { blobNames, CONTAINERS, PeopleSchema } from '@modig/shared';

const people = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true')
  .getContainerClient(CONTAINERS.config)
  .getBlockBlobClient(blobNames.people);

/** Takes these emails off the list; removes the list itself once no one is left on it. */
export async function removePeople(emails: readonly string[]): Promise<void> {
  if (!(await people.exists())) return;
  const list = PeopleSchema.parse(JSON.parse((await people.downloadToBuffer()).toString('utf8')));
  const left = list.people.filter((person) => !emails.includes(person.email));
  if (left.length === list.people.length) return;
  if (left.length === 0) {
    await people.deleteIfExists();
    return;
  }
  const body = JSON.stringify({ ...list, people: left });
  await people.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}
