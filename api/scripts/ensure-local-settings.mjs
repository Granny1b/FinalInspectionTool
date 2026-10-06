/**
 * `func start` refuses to run without api/local.settings.json ("Worker runtime cannot be
 * 'None'"). That file is git-ignored (developers may put real secrets in it), so create it from
 * the committed example on first run and never overwrite an existing one.
 */
import console from 'node:console';
import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const example = join(import.meta.dirname, '../local.settings.example.json');
const target = join(import.meta.dirname, '../local.settings.json');

try {
  await copyFile(example, target, constants.COPYFILE_EXCL);
  console.log(`Created ${target} from local.settings.example.json`);
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
}
